import { Component, TFile, App } from 'obsidian';
import { ParseEventManager } from '../core/ParseEventManager';
import { UnifiedCacheManager } from '../core/UnifiedCacheManager';
import { PluginManager } from '../core/PluginManager';
import { ParseContextFactory } from '../core/ParseContext';
import { ParseEventType } from '../events/ParseEvents';
import { 
    ParseContext, 
    ParseResult, 
    ParsePriority, 
    CacheType, 
    TaskParseRequest,
    BatchParseRequest,
    BatchParseResult,
    ParserPluginType 
} from '../types/ParsingTypes';
import { createDeferred, Deferred } from '../utils/Deferred';

interface ParseTask {
    readonly id: string;
    readonly request: TaskParseRequest;
    readonly deferred: Deferred<ParseResult>;
    readonly priority: ParsePriority;
    readonly timestamp: number;
    retryCount: number;
}

interface BatchConfig {
    readonly maxBatchSize: number;
    readonly batchTimeoutMs: number;
    readonly maxConcurrentBatches: number;
    readonly maxRetries: number;
}

interface TaskParsingMetrics {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageLatency: number;
    batchEfficiency: number;
    cacheHitRate: number;
}

export class TaskParsingService extends Component {
    private readonly eventManager: ParseEventManager;
    private readonly cacheManager: UnifiedCacheManager;
    private readonly pluginManager: PluginManager;
    private readonly contextFactory: ParseContextFactory;
    
    private taskQueue: ParseTask[] = [];
    private activeBatches = new Set<Promise<void>>();
    private isProcessing = false;
    private processingTimer: NodeJS.Timeout | null = null;
    
    private readonly config: BatchConfig = {
        maxBatchSize: 20,
        batchTimeoutMs: 100,
        maxConcurrentBatches: 3,
        maxRetries: 3
    };
    
    private metrics: TaskParsingMetrics = {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageLatency: 0,
        batchEfficiency: 0,
        cacheHitRate: 0
    };
    
    private latencyHistory: number[] = [];
    private readonly maxHistorySize = 100;
    
    constructor(
        private readonly app: App,
        eventManager: ParseEventManager,
        cacheManager: UnifiedCacheManager,
        pluginManager: PluginManager,
        contextFactory: ParseContextFactory
    ) {
        super();
        this.eventManager = eventManager;
        this.cacheManager = cacheManager;
        this.pluginManager = pluginManager;
        this.contextFactory = contextFactory;
        
        this.addChild(this.eventManager);
        this.addChild(this.cacheManager);
        this.addChild(this.pluginManager);
        this.addChild(this.contextFactory);
    }
    
    async parseTask(request: TaskParseRequest): Promise<ParseResult> {
        const taskId = this.generateTaskId(request);
        const deferred = createDeferred<ParseResult>();
        
        const cacheKey = this.getCacheKey(request);
        const cached = this.cacheManager.get<ParseResult>(cacheKey, CacheType.TASK_PARSE);
        if (cached && this.isCacheValid(cached, request.file)) {
            this.updateMetrics({ cacheHit: true });
            return cached;
        }
        
        const task: ParseTask = {
            id: taskId,
            request,
            deferred,
            priority: request.priority ?? ParsePriority.NORMAL,
            timestamp: Date.now(),
            retryCount: 0
        };
        
        this.enqueueTask(task);
        this.scheduleProcessing();
        
        this.metrics.totalTasks++;
        this.updateMetrics({ cacheHit: false });
        
        return deferred.promise;
    }
    
    async parseBatch(requests: BatchParseRequest): Promise<BatchParseResult> {
        const results = new Map<string, ParseResult>();
        const errors = new Map<string, Error>();
        
        const tasks = requests.tasks.map(request => ({
            id: this.generateTaskId(request),
            request,
            deferred: createDeferred<ParseResult>(),
            priority: request.priority ?? ParsePriority.NORMAL,
            timestamp: Date.now(),
            retryCount: 0
        }));
        
        for (const task of tasks) {
            this.enqueueTask(task);
        }
        
        this.scheduleProcessing();
        
        const startTime = Date.now();
        await Promise.allSettled(tasks.map(async task => {
            try {
                const result = await task.deferred.promise;
                results.set(task.id, result);
            } catch (error) {
                errors.set(task.id, error as Error);
            }
        }));
        
        const duration = Date.now() - startTime;
        this.updateBatchMetrics(tasks.length, duration);
        
        return {
            results,
            errors,
            totalTasks: tasks.length,
            successCount: results.size,
            duration
        };
    }
    
    private enqueueTask(task: ParseTask): void {
        const insertIndex = this.findInsertionIndex(task);
        this.taskQueue.splice(insertIndex, 0, task);
    }
    
    private findInsertionIndex(task: ParseTask): number {
        let left = 0;
        let right = this.taskQueue.length;
        
        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            const midTask = this.taskQueue[mid];
            
            if (this.compareTasks(task, midTask) < 0) {
                right = mid;
            } else {
                left = mid + 1;
            }
        }
        
        return left;
    }
    
    private compareTasks(a: ParseTask, b: ParseTask): number {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        return a.timestamp - b.timestamp;
    }
    
    private scheduleProcessing(): void {
        if (this.processingTimer) {
            return;
        }
        
        this.processingTimer = setTimeout(() => {
            this.processingTimer = null;
            this.processBatches();
        }, this.config.batchTimeoutMs);
    }
    
    private async processBatches(): Promise<void> {
        if (this.isProcessing || this.taskQueue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        
        try {
            while (this.taskQueue.length > 0 && this.activeBatches.size < this.config.maxConcurrentBatches) {
                const batch = this.createBatch();
                if (batch.length === 0) break;
                
                const batchPromise = this.processBatch(batch);
                this.activeBatches.add(batchPromise);
                
                batchPromise.finally(() => {
                    this.activeBatches.delete(batchPromise);
                });
            }
            
            if (this.taskQueue.length > 0) {
                this.scheduleProcessing();
            }
        } finally {
            this.isProcessing = false;
        }
    }
    
    private createBatch(): ParseTask[] {
        const batch: ParseTask[] = [];
        const maxSize = this.config.maxBatchSize;
        
        while (batch.length < maxSize && this.taskQueue.length > 0) {
            const task = this.taskQueue.shift()!;
            batch.push(task);
        }
        
        return batch;
    }
    
    private async processBatch(batch: ParseTask[]): Promise<void> {
        const batchStartTime = Date.now();
        
        this.eventManager.trigger(ParseEventType.BATCH_STARTED, {
            batchId: this.generateBatchId(),
            taskCount: batch.length,
            timestamp: batchStartTime
        });
        
        const promises = batch.map(task => this.processTask(task));
        await Promise.allSettled(promises);
        
        const batchDuration = Date.now() - batchStartTime;
        this.updateBatchMetrics(batch.length, batchDuration);
        
        this.eventManager.trigger(ParseEventType.BATCH_COMPLETED, {
            batchId: this.generateBatchId(),
            taskCount: batch.length,
            duration: batchDuration,
            timestamp: Date.now()
        });
    }
    
    private async processTask(task: ParseTask): Promise<void> {
        const startTime = Date.now();
        
        try {
            this.eventManager.trigger(ParseEventType.PARSE_STARTED, {
                filePath: task.request.file.path,
                type: task.request.parserType,
                cacheKey: this.getCacheKey(task.request)
            });
            
            const context = this.contextFactory.create({
                file: task.request.file,
                app: this.app,
                cacheManager: this.cacheManager,
                priority: task.priority,
                options: task.request.options
            });
            
            const result = await this.pluginManager.executePlugin(task.request.parserType, context, task.priority);
            
            const cacheKey = this.getCacheKey(task.request);
            this.cacheManager.set(cacheKey, result, CacheType.TASK_PARSE, {
                mtime: task.request.file.stat.mtime,
                ttl: 300000,
                dependencies: [task.request.file.path]
            });
            
            const duration = Date.now() - startTime;
            this.recordLatency(duration);
            
            this.eventManager.trigger(ParseEventType.PARSE_COMPLETED, {
                filePath: task.request.file.path,
                type: task.request.parserType,
                duration,
                tasksFound: result.tasks?.length || result.events?.length || 0
            });
            
            task.deferred.resolve(result);
            this.metrics.completedTasks++;
            
        } catch (error) {
            await this.handleTaskError(task, error as Error);
        }
    }
    
    private async handleTaskError(task: ParseTask, error: Error): Promise<void> {
        task.retryCount++;
        
        if (task.retryCount <= this.config.maxRetries) {
            const delay = Math.pow(2, task.retryCount - 1) * 1000;
            setTimeout(() => {
                this.enqueueTask(task);
                this.scheduleProcessing();
            }, delay);
            
            this.eventManager.trigger(ParseEventType.PARSE_RETRIED, {
                filePath: task.request.file.path,
                type: task.request.parserType,
                error: error.message,
                retryCount: task.retryCount
            });
        } else {
            this.eventManager.trigger(ParseEventType.PARSE_FAILED, {
                filePath: task.request.file.path,
                type: task.request.parserType,
                error: error.message
            });
            
            task.deferred.reject(error);
            this.metrics.failedTasks++;
        }
    }
    
    private generateTaskId(request: TaskParseRequest): string {
        return `${request.file.path}-${request.parserType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    private generateBatchId(): string {
        return `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    private getCacheKey(request: TaskParseRequest): string {
        return `${request.file.path}-${request.parserType}-${request.file.stat.mtime}`;
    }
    
    private isCacheValid(cached: any, file: TFile): boolean {
        return cached.timestamp >= file.stat.mtime;
    }
    
    private recordLatency(duration: number): void {
        this.latencyHistory.push(duration);
        if (this.latencyHistory.length > this.maxHistorySize) {
            this.latencyHistory.shift();
        }
        
        this.metrics.averageLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    }
    
    private updateMetrics(update: { cacheHit: boolean }): void {
        if (update.cacheHit) {
            this.metrics.cacheHitRate = (this.metrics.cacheHitRate * this.metrics.totalTasks + 1) / (this.metrics.totalTasks + 1);
        } else {
            this.metrics.cacheHitRate = (this.metrics.cacheHitRate * this.metrics.totalTasks) / (this.metrics.totalTasks + 1);
        }
    }
    
    private updateBatchMetrics(batchSize: number, duration: number): void {
        const efficiency = batchSize / duration;
        this.metrics.batchEfficiency = (this.metrics.batchEfficiency + efficiency) / 2;
    }
    
    getMetrics(): Readonly<TaskParsingMetrics> {
        return { ...this.metrics };
    }
    
    clearQueue(): void {
        for (const task of this.taskQueue) {
            task.deferred.reject(new Error('Queue cleared'));
        }
        this.taskQueue = [];
        
        if (this.processingTimer) {
            clearTimeout(this.processingTimer);
            this.processingTimer = null;
        }
    }
    
    getQueueStatus(): { pending: number; processing: number } {
        return {
            pending: this.taskQueue.length,
            processing: this.activeBatches.size
        };
    }
    
    onunload(): void {
        this.clearQueue();
        super.onunload();
    }
}