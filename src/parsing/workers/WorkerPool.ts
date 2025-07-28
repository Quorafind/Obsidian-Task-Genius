import { Component } from 'obsidian';
import { 
    WorkerInstance, 
    WorkerTask, 
    WorkerMessage, 
    WorkerResponse, 
    WorkerPoolConfig,
    WorkerStats,
    WorkerHealthStatus,
    createHealthCheckMessage,
    createGetStatsMessage,
    isParseSuccessResponse,
    isParseErrorResponse,
    isHealthResponse,
    isStatsResponse,
    isErrorResponse
} from '../types/WorkerTypes';
import { ParsePriority } from '../types/ParsingTypes';
import { createDeferred, Deferred } from '../utils/Deferred';

interface PoolMetrics {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    activeWorkers: number;
    idleWorkers: number;
    averageTaskDuration: number;
    workerUtilization: number;
}

export class WorkerPool extends Component {
    private workers = new Map<string, WorkerInstance>();
    private taskQueue: WorkerTask[] = [];
    private pendingTasks = new Map<string, WorkerTask>();
    
    private healthCheckTimer: NodeJS.Timeout | null = null;
    private cleanupTimer: NodeJS.Timeout | null = null;
    
    private metrics: PoolMetrics = {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        activeWorkers: 0,
        idleWorkers: 0,
        averageTaskDuration: 0,
        workerUtilization: 0
    };
    
    private taskDurations: number[] = [];
    private readonly maxDurationHistory = 200;
    
    constructor(
        private readonly config: WorkerPoolConfig,
        private readonly workerScript: string
    ) {
        super();
        this.initializePool();
    }
    
    private async initializePool(): Promise<void> {
        for (let i = 0; i < this.config.minWorkers; i++) {
            await this.createWorker();
        }
        
        this.startHealthChecks();
        this.startCleanupTimer();
    }
    
    async executeTask<T = any>(message: WorkerMessage, timeoutMs: number = 30000): Promise<T> {
        this.metrics.totalTasks++;
        
        const task: WorkerTask<T> = {
            id: message.taskId,
            message,
            priority: this.getMessagePriority(message),
            createdAt: Date.now(),
            timeoutMs,
            retryCount: 0,
            ...createDeferred<T>()
        };
        
        this.enqueueTask(task);
        await this.processQueue();
        
        return task.promise;
    }
    
    private getMessagePriority(message: WorkerMessage): ParsePriority {
        if ('priority' in message) {
            return message.priority;
        }
        return ParsePriority.NORMAL;
    }
    
    private enqueueTask(task: WorkerTask): void {
        const insertIndex = this.findInsertionIndex(task);
        this.taskQueue.splice(insertIndex, 0, task);
    }
    
    private findInsertionIndex(task: WorkerTask): number {
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
    
    private compareTasks(a: WorkerTask, b: WorkerTask): number {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        return a.createdAt - b.createdAt;
    }
    
    private async processQueue(): Promise<void> {
        while (this.taskQueue.length > 0) {
            const worker = this.findIdleWorker();
            if (!worker) {
                if (this.canCreateWorker()) {
                    await this.createWorker();
                    continue;
                } else {
                    break;
                }
            }
            
            const task = this.taskQueue.shift()!;
            await this.assignTaskToWorker(worker, task);
        }
    }
    
    private findIdleWorker(): WorkerInstance | null {
        for (const worker of this.workers.values()) {
            if (worker.isIdle) {
                return worker;
            }
        }
        return null;
    }
    
    private canCreateWorker(): boolean {
        return this.workers.size < this.config.maxWorkers;
    }
    
    private async createWorker(): Promise<WorkerInstance> {
        const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const worker = new Worker(this.workerScript);
        const instance: WorkerInstance = {
            id: workerId,
            worker,
            createdAt: Date.now(),
            isIdle: true,
            currentTaskId: null,
            lastUsed: Date.now(),
            tasksProcessed: 0,
            stats: {
                tasksProcessed: 0,
                errorsEncountered: 0,
                averageTaskDuration: 0,
                currentLoad: 0,
                uptimeMs: 0,
                memoryUsage: 0
            }
        };
        
        worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
            this.handleWorkerMessage(instance, event.data);
        });
        
        worker.addEventListener('error', (error: ErrorEvent) => {
            this.handleWorkerError(instance, error);
        });
        
        this.workers.set(workerId, instance);
        this.updateMetrics();
        
        return instance;
    }
    
    private async assignTaskToWorker(worker: WorkerInstance, task: WorkerTask): Promise<void> {
        worker.isIdle = false;
        worker.currentTaskId = task.id;
        worker.lastUsed = Date.now();
        
        this.pendingTasks.set(task.id, task);
        
        const timeout = setTimeout(() => {
            this.handleTaskTimeout(task);
        }, task.timeoutMs);
        
        const originalResolve = task.resolve;
        const originalReject = task.reject;
        
        task.resolve = (value) => {
            clearTimeout(timeout);
            this.pendingTasks.delete(task.id);
            worker.isIdle = true;
            worker.currentTaskId = null;
            worker.tasksProcessed++;
            originalResolve(value);
        };
        
        task.reject = (error) => {
            clearTimeout(timeout);
            this.pendingTasks.delete(task.id);
            worker.isIdle = true;
            worker.currentTaskId = null;
            originalReject(error);
        };
        
        try {
            worker.worker.postMessage(task.message);
        } catch (error) {
            task.reject(error instanceof Error ? error : new Error(String(error)));
        }
    }
    
    private handleWorkerMessage(worker: WorkerInstance, response: WorkerResponse): void {
        const task = this.pendingTasks.get(response.taskId);
        if (!task) {
            return;
        }
        
        const duration = Date.now() - task.createdAt;
        this.recordTaskDuration(duration);
        
        if (isParseSuccessResponse(response)) {
            this.metrics.completedTasks++;
            task.resolve(response.result);
        } else if (isParseErrorResponse(response)) {
            this.metrics.failedTasks++;
            const error = new Error(response.error);
            if (response.isRetryable && task.retryCount < 3) {
                task.retryCount++;
                this.enqueueTask(task);
                this.processQueue();
                return;
            }
            task.reject(error);
        } else if (isHealthResponse(response)) {
            this.updateWorkerHealth(worker, response.health);
            task.resolve(response.health);
        } else if (isStatsResponse(response)) {
            worker.stats = response.stats;
            task.resolve(response.stats);
        } else if (isErrorResponse(response)) {
            this.metrics.failedTasks++;
            task.reject(new Error(response.error));
        }
        
        this.updateMetrics();
    }
    
    private handleWorkerError(worker: WorkerInstance, error: ErrorEvent): void {
        const task = worker.currentTaskId ? this.pendingTasks.get(worker.currentTaskId) : null;
        if (task) {
            task.reject(new Error(`Worker error: ${error.message}`));
        }
        
        this.terminateWorker(worker.id);
        
        if (this.workers.size < this.config.minWorkers) {
            this.createWorker();
        }
    }
    
    private handleTaskTimeout(task: WorkerTask): void {
        this.metrics.failedTasks++;
        task.reject(new Error(`Task timeout after ${task.timeoutMs}ms`));
    }
    
    private recordTaskDuration(duration: number): void {
        this.taskDurations.push(duration);
        
        if (this.taskDurations.length > this.maxDurationHistory) {
            this.taskDurations.shift();
        }
        
        this.metrics.averageTaskDuration = this.taskDurations.reduce((a, b) => a + b, 0) / this.taskDurations.length;
    }
    
    private updateWorkerHealth(worker: WorkerInstance, health: WorkerHealthStatus): void {
        worker.stats.tasksProcessed = health.tasksProcessed;
        worker.stats.errorsEncountered = health.errorsEncountered;
        worker.stats.memoryUsage = health.memoryUsage;
    }
    
    private updateMetrics(): void {
        this.metrics.activeWorkers = Array.from(this.workers.values()).filter(w => !w.isIdle).length;
        this.metrics.idleWorkers = Array.from(this.workers.values()).filter(w => w.isIdle).length;
        
        const totalWorkers = this.workers.size;
        this.metrics.workerUtilization = totalWorkers > 0 ? this.metrics.activeWorkers / totalWorkers : 0;
    }
    
    private startHealthChecks(): void {
        this.healthCheckTimer = setInterval(async () => {
            for (const worker of this.workers.values()) {
                try {
                    await this.executeTask(createHealthCheckMessage(), 5000);
                } catch (error) {
                    this.handleWorkerError(worker, new ErrorEvent('health-check', { 
                        message: 'Health check failed' 
                    }));
                }
            }
        }, this.config.healthCheckIntervalMs);
    }
    
    private startCleanupTimer(): void {
        this.cleanupTimer = setInterval(() => {
            this.cleanupIdleWorkers();
        }, this.config.idleTimeoutMs);
    }
    
    private cleanupIdleWorkers(): void {
        const now = Date.now();
        const workersToTerminate: string[] = [];
        
        for (const [id, worker] of this.workers.entries()) {
            const idleTime = now - worker.lastUsed;
            const shouldTerminate = worker.isIdle && 
                idleTime > this.config.idleTimeoutMs &&
                this.workers.size > this.config.minWorkers;
            
            if (shouldTerminate) {
                workersToTerminate.push(id);
            }
        }
        
        for (const workerId of workersToTerminate) {
            this.terminateWorker(workerId);
        }
    }
    
    private terminateWorker(workerId: string): void {
        const worker = this.workers.get(workerId);
        if (!worker) return;
        
        if (worker.currentTaskId) {
            const task = this.pendingTasks.get(worker.currentTaskId);
            if (task) {
                task.reject(new Error('Worker terminated'));
            }
        }
        
        worker.worker.terminate();
        this.workers.delete(workerId);
        this.updateMetrics();
    }
    
    getMetrics(): Readonly<PoolMetrics> {
        return { ...this.metrics };
    }
    
    getWorkerCount(): number {
        return this.workers.size;
    }
    
    getQueueSize(): number {
        return this.taskQueue.length;
    }
    
    async getWorkerStats(): Promise<WorkerStats[]> {
        const stats: WorkerStats[] = [];
        
        for (const worker of this.workers.values()) {
            try {
                const workerStats = await this.executeTask<WorkerStats>(createGetStatsMessage(), 5000);
                stats.push(workerStats);
            } catch (error) {
                stats.push({
                    tasksProcessed: 0,
                    errorsEncountered: 1,
                    averageTaskDuration: 0,
                    currentLoad: 0,
                    uptimeMs: 0,
                    memoryUsage: 0
                });
            }
        }
        
        return stats;
    }
    
    async shutdown(): Promise<void> {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        
        for (const task of this.pendingTasks.values()) {
            task.reject(new Error('Worker pool shutting down'));
        }
        this.pendingTasks.clear();
        
        for (const task of this.taskQueue) {
            task.reject(new Error('Worker pool shutting down'));
        }
        this.taskQueue = [];
        
        const terminationPromises = Array.from(this.workers.keys()).map(async (workerId) => {
            return new Promise<void>((resolve) => {
                const timeout = setTimeout(resolve, this.config.workerTerminationTimeoutMs);
                this.terminateWorker(workerId);
                clearTimeout(timeout);
                resolve();
            });
        });
        
        await Promise.allSettled(terminationPromises);
        this.workers.clear();
    }
    
    onunload(): void {
        this.shutdown();
        super.onunload();
    }
}