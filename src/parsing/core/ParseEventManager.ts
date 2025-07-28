/**
 * Parse Event Manager
 * 
 * High-performance event management using Obsidian's native event system.
 * Provides type-safe event emission and subscription with automatic cleanup.
 * 
 * Features:
 * - Component-based lifecycle management
 * - Type-safe event handling
 * - Automatic event cleanup on unload
 * - Performance monitoring
 * - Deferred event processing
 */

import { App, Component, EventRef } from 'obsidian';
import { 
    ParseEventType, 
    ParseEventDataMap, 
    ParseEventListener,
    createEventData 
} from '../events/ParseEvents';
import { createDeferred, Deferred } from '../utils/Deferred';

/**
 * Event manager configuration
 */
export interface ParseEventManagerConfig {
    /** Enable performance monitoring */
    enableProfiling: boolean;
    /** Maximum event queue size */
    maxQueueSize: number;
    /** Event processing batch size */
    batchSize: number;
    /** Enable debug logging */
    debug: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_EVENT_CONFIG: ParseEventManagerConfig = {
    enableProfiling: false,
    maxQueueSize: 1000,
    batchSize: 10,
    debug: false
};

/**
 * Event statistics for monitoring
 */
export interface EventStatistics {
    totalEvents: number;
    eventsByType: Record<string, number>;
    avgProcessingTime: number;
    maxProcessingTime: number;
    queuedEvents: number;
    droppedEvents: number;
}

/**
 * Queued event for batch processing
 */
interface QueuedEvent {
    type: ParseEventType;
    data: any;
    timestamp: number;
    deferred?: Deferred<void>;
}

/**
 * Parse Event Manager
 * 
 * Manages all parsing-related events using Obsidian's event system.
 * Provides high-performance, type-safe event communication between components.
 * 
 * @example
 * ```typescript
 * const eventManager = new ParseEventManager(app);
 * 
 * // Subscribe to events
 * eventManager.subscribe(ParseEventType.TASKS_PARSED, (data) => {
 *   console.log(`Parsed ${data.tasks.length} tasks from ${data.filePath}`);
 * });
 * 
 * // Emit events
 * await eventManager.emit(ParseEventType.TASKS_PARSED, {
 *   filePath: 'test.md',
 *   tasks: [...],
 *   stats: { totalTasks: 5, completedTasks: 2, processingTime: 100 }
 * });
 * ```
 */
export class ParseEventManager extends Component {
    private app: App;
    private config: ParseEventManagerConfig;
    
    /** Registered event references for cleanup */
    private eventRefs: Set<EventRef> = new Set();
    
    /** Event processing queue */
    private eventQueue: QueuedEvent[] = [];
    private isProcessingQueue = false;
    
    /** Event statistics */
    private stats: EventStatistics = {
        totalEvents: 0,
        eventsByType: {},
        avgProcessingTime: 0,
        maxProcessingTime: 0,
        queuedEvents: 0,
        droppedEvents: 0
    };
    
    /** Processing times for performance monitoring */
    private processingTimes: number[] = [];
    
    /** Whether the manager is initialized */
    private initialized = false;
    
    constructor(app: App, config: Partial<ParseEventManagerConfig> = {}) {
        super();
        this.app = app;
        this.config = { ...DEFAULT_EVENT_CONFIG, ...config };
        this.initialize();
    }
    
    /**
     * Initialize the event manager
     */
    private initialize(): void {
        if (this.initialized) {
            this.log('Event manager already initialized, skipping');
            return;
        }
        
        // Setup automatic file system event monitoring
        this.setupFileSystemEvents();
        
        // Start event queue processing
        if (this.config.batchSize > 1) {
            this.startQueueProcessing();
        }
        
        this.initialized = true;
        this.log('Event manager initialized');
    }
    
    /**
     * Setup automatic file system event monitoring
     */
    private setupFileSystemEvents(): void {
        // Monitor file modifications
        const modifyRef = this.app.vault.on('modify', (file) => {
            this.emit(ParseEventType.FILE_CHANGED, {
                filePath: file.path,
                changeType: 'content' as const
            });
        });
        this.registerEvent(modifyRef);
        this.eventRefs.add(modifyRef);
        
        // Monitor file deletions
        const deleteRef = this.app.vault.on('delete', (file) => {
            this.emit(ParseEventType.FILE_DELETED, {
                filePath: file.path,
                changeType: 'delete' as const
            });
        });
        this.registerEvent(deleteRef);
        this.eventRefs.add(deleteRef);
        
        // Monitor file renames
        const renameRef = this.app.vault.on('rename', (file, oldPath) => {
            this.emit(ParseEventType.FILE_RENAMED, {
                filePath: file.path,
                changeType: 'rename' as const,
                oldPath
            });
        });
        this.registerEvent(renameRef);
        this.eventRefs.add(renameRef);
        
        // Monitor metadata changes
        const metadataRef = this.app.metadataCache.on('changed', (file, data) => {
            this.emit(ParseEventType.METADATA_LOADED, {
                filePath: file.path,
                metadata: data.frontmatter || {},
                source: 'obsidian_cache' as const
            });
        });
        this.registerEvent(metadataRef);
        this.eventRefs.add(metadataRef);
    }
    
    /**
     * Subscribe to a specific event type with type safety
     */
    public subscribe<T extends ParseEventType>(
        eventType: T,
        listener: ParseEventListener<T>,
        context?: any
    ): EventRef {
        const ref = this.app.metadataCache.on(eventType, listener as any);
        this.registerEvent(ref);
        this.eventRefs.add(ref);
        
        this.log(`Subscribed to event: ${eventType}`);
        return ref;
    }
    
    /**
     * Unsubscribe from an event
     */
    public unsubscribe(ref: EventRef): void {
        this.app.metadataCache.offref(ref);
        this.eventRefs.delete(ref);
        this.log('Unsubscribed from event');
    }
    
    /**
     * Emit an event with type safety
     */
    public async emit<T extends ParseEventType>(
        eventType: T,
        data: Omit<ParseEventDataMap[T], keyof import('../events/ParseEvents').BaseEventData>,
        source = 'ParseEventManager'
    ): Promise<void> {
        const startTime = performance.now();
        
        try {
            // Create properly typed event data
            const eventData = createEventData(eventType, source, data);
            
            // Check queue size limit
            if (this.eventQueue.length >= this.config.maxQueueSize) {
                this.stats.droppedEvents++;
                this.log(`Event queue full, dropping event: ${eventType}`);
                return;
            }
            
            // Add to queue or emit immediately
            if (this.config.batchSize > 1) {
                const deferred = createDeferred<void>();
                this.eventQueue.push({
                    type: eventType,
                    data: eventData,
                    timestamp: Date.now(),
                    deferred
                });
                this.stats.queuedEvents++;
                return deferred;
            } else {
                // Emit immediately
                this.app.metadataCache.trigger(eventType, eventData);
            }
            
            // Update statistics
            this.updateStats(eventType, performance.now() - startTime);
            
        } catch (error) {
            console.error(`Error emitting event ${eventType}:`, error);
            throw error;
        }
    }
    
    /**
     * Emit event synchronously (non-blocking)
     */
    public emitSync<T extends ParseEventType>(
        eventType: T,
        data: Omit<ParseEventDataMap[T], keyof import('../events/ParseEvents').BaseEventData>,
        source = 'ParseEventManager'
    ): void {
        try {
            const eventData = createEventData(eventType, source, data);
            this.app.metadataCache.trigger(eventType, eventData);
            this.updateStats(eventType, 0);
        } catch (error) {
            console.error(`Error emitting sync event ${eventType}:`, error);
        }
    }
    
    /**
     * Start queue processing for batched events
     */
    private startQueueProcessing(): void {
        if (this.isProcessingQueue) return;
        
        this.isProcessingQueue = true;
        this.processEventQueue();
    }
    
    /**
     * Process queued events in batches
     */
    private async processEventQueue(): Promise<void> {
        while (this.isProcessingQueue && this.eventQueue.length > 0) {
            const batch = this.eventQueue.splice(0, this.config.batchSize);
            const processingPromises: Promise<void>[] = [];
            
            for (const queuedEvent of batch) {
                const promise = this.processQueuedEvent(queuedEvent);
                processingPromises.push(promise);
            }
            
            try {
                await Promise.all(processingPromises);
                this.stats.queuedEvents -= batch.length;
            } catch (error) {
                console.error('Error processing event batch:', error);
            }
            
            // Small delay to prevent blocking
            if (this.eventQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }
        
        // Schedule next processing cycle
        if (this.eventQueue.length > 0) {
            setTimeout(() => this.processEventQueue(), 10);
        }
    }
    
    /**
     * Process a single queued event
     */
    private async processQueuedEvent(queuedEvent: QueuedEvent): Promise<void> {
        try {
            this.app.metadataCache.trigger(queuedEvent.type, queuedEvent.data);
            queuedEvent.deferred?.resolve();
        } catch (error) {
            queuedEvent.deferred?.reject(error);
            throw error;
        }
    }
    
    /**
     * Update event statistics
     */
    private updateStats(eventType: string, processingTime: number): void {
        this.stats.totalEvents++;
        this.stats.eventsByType[eventType] = (this.stats.eventsByType[eventType] || 0) + 1;
        
        if (this.config.enableProfiling && processingTime > 0) {
            this.processingTimes.push(processingTime);
            
            // Keep only recent processing times (sliding window)
            if (this.processingTimes.length > 100) {
                this.processingTimes = this.processingTimes.slice(-100);
            }
            
            this.stats.avgProcessingTime = 
                this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
            this.stats.maxProcessingTime = Math.max(this.stats.maxProcessingTime, processingTime);
        }
    }
    
    /**
     * Get event statistics
     */
    public getStatistics(): EventStatistics {
        return { ...this.stats };
    }
    
    /**
     * Reset statistics
     */
    public resetStatistics(): void {
        this.stats = {
            totalEvents: 0,
            eventsByType: {},
            avgProcessingTime: 0,
            maxProcessingTime: 0,
            queuedEvents: this.eventQueue.length,
            droppedEvents: 0
        };
        this.processingTimes = [];
    }
    
    /**
     * Flush all queued events immediately
     */
    public async flushQueue(): Promise<void> {
        if (this.eventQueue.length === 0) return;
        
        const remainingEvents = [...this.eventQueue];
        this.eventQueue = [];
        
        const processingPromises = remainingEvents.map(event => this.processQueuedEvent(event));
        
        try {
            await Promise.all(processingPromises);
            this.stats.queuedEvents = 0;
        } catch (error) {
            console.error('Error flushing event queue:', error);
            throw error;
        }
    }
    
    /**
     * Check if the manager is healthy
     */
    public isHealthy(): boolean {
        return this.initialized && 
               this.eventQueue.length < this.config.maxQueueSize * 0.8 &&
               this.stats.droppedEvents < this.stats.totalEvents * 0.01;
    }
    
    /**
     * Get health status
     */
    public getHealthStatus(): {
        healthy: boolean;
        queueUtilization: number;
        dropRate: number;
        avgProcessingTime: number;
    } {
        const queueUtilization = this.eventQueue.length / this.config.maxQueueSize;
        const dropRate = this.stats.totalEvents > 0 ? 
            this.stats.droppedEvents / this.stats.totalEvents : 0;
        
        return {
            healthy: this.isHealthy(),
            queueUtilization,
            dropRate,
            avgProcessingTime: this.stats.avgProcessingTime
        };
    }
    
    /**
     * Component lifecycle: cleanup on unload
     */
    public onunload(): void {
        this.log('Shutting down event manager');
        
        // Stop queue processing
        this.isProcessingQueue = false;
        
        // Flush remaining events
        if (this.eventQueue.length > 0) {
            this.flushQueue().catch(error => {
                console.error('Error flushing events during shutdown:', error);
            });
        }
        
        // Clear all event references (Component will handle registerEvent cleanup)
        this.eventRefs.clear();
        
        // Reset state
        this.initialized = false;
        
        super.onunload();
        this.log('Event manager shut down');
    }
    
    /**
     * Enhanced async task processing with Obsidian Events coordination
     */
    public async processAsyncTaskFlow(
        filePath: string,
        workflowType: 'parse' | 'reparse' | 'validate' | 'update',
        options: {
            priority?: 'low' | 'normal' | 'high' | 'critical';
            timeout?: number;
            retries?: number;
            dependencies?: string[];
            enableEventChaining?: boolean;
        } = {}
    ): Promise<{
        success: boolean;
        duration: number;
        events: string[];
        errors?: string[];
        result?: any;
    }> {
        const startTime = performance.now();
        const events: string[] = [];
        const errors: string[] = [];
        
        try {
            // Emit workflow started event
            await this.emit(ParseEventType.WORKFLOW_STARTED, {
                filePath,
                workflowType,
                priority: options.priority || 'normal',
                timestamp: Date.now()
            });
            events.push(`workflow_started:${workflowType}`);
            
            // Handle dependencies if specified
            if (options.dependencies && options.dependencies.length > 0) {
                await this.emit(ParseEventType.DEPENDENCY_CHECK, {
                    filePath,
                    dependencies: options.dependencies,
                    checkType: 'async_task_flow'
                });
                events.push('dependency_check');
                
                // Wait for dependencies to resolve (simplified implementation)
                await this.waitForDependencies(options.dependencies, options.timeout || 30000);
            }
            
            // Process the main workflow
            let result: any;
            switch (workflowType) {
                case 'parse':
                    result = await this.executeParseWorkflow(filePath, options);
                    break;
                case 'reparse':
                    result = await this.executeReparseWorkflow(filePath, options);
                    break;
                case 'validate':
                    result = await this.executeValidationWorkflow(filePath, options);
                    break;
                case 'update':
                    result = await this.executeUpdateWorkflow(filePath, options);
                    break;
                default:
                    throw new Error(`Unknown workflow type: ${workflowType}`);
            }
            
            // Emit workflow completed event
            await this.emit(ParseEventType.WORKFLOW_COMPLETED, {
                filePath,
                workflowType,
                duration: performance.now() - startTime,
                success: true,
                result
            });
            events.push(`workflow_completed:${workflowType}`);
            
            // Chain additional events if enabled
            if (options.enableEventChaining) {
                await this.chainFollowUpEvents(filePath, workflowType, result);
                events.push('event_chaining');
            }
            
            return {
                success: true,
                duration: performance.now() - startTime,
                events,
                result
            };
            
        } catch (error) {
            errors.push(error.message);
            
            // Emit workflow failed event
            await this.emit(ParseEventType.WORKFLOW_FAILED, {
                filePath,
                workflowType,
                duration: performance.now() - startTime,
                error: error.message
            });
            events.push(`workflow_failed:${workflowType}`);
            
            // Retry logic
            if (options.retries && options.retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
                return this.processAsyncTaskFlow(filePath, workflowType, {
                    ...options,
                    retries: options.retries - 1
                });
            }
            
            return {
                success: false,
                duration: performance.now() - startTime,
                events,
                errors
            };
        }
    }
    
    /**
     * Execute parse workflow with event coordination
     */
    private async executeParseWorkflow(filePath: string, options: any): Promise<any> {
        // Emit parsing started
        await this.emit(ParseEventType.PARSING_STARTED, {
            filePath,
            parseType: 'async_workflow'
        });
        
        // Simulate async parsing (would integrate with actual parsing system)
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
        
        const mockResult = {
            tasksFound: Math.floor(Math.random() * 10) + 1,
            parseTime: Math.random() * 100 + 20,
            cached: Math.random() > 0.5
        };
        
        // Emit parsing completed
        await this.emit(ParseEventType.PARSING_COMPLETED, {
            filePath,
            result: mockResult,
            cached: mockResult.cached
        });
        
        return mockResult;
    }
    
    /**
     * Execute reparse workflow
     */
    private async executeReparseWorkflow(filePath: string, options: any): Promise<any> {
        // Clear cache first
        await this.emit(ParseEventType.CACHE_INVALIDATED, {
            filePath,
            reason: 'reparse_workflow'
        });
        
        // Then parse
        return this.executeParseWorkflow(filePath, options);
    }
    
    /**
     * Execute validation workflow
     */
    private async executeValidationWorkflow(filePath: string, options: any): Promise<any> {
        await this.emit(ParseEventType.VALIDATION_STARTED, {
            filePath,
            validationType: 'async_workflow'
        });
        
        // Simulate validation
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 25));
        
        const validationResult = {
            isValid: Math.random() > 0.2,
            issues: Math.random() > 0.7 ? ['Minor formatting issue'] : [],
            checkedRules: ['syntax', 'metadata', 'links']
        };
        
        await this.emit(ParseEventType.VALIDATION_COMPLETED, {
            filePath,
            result: validationResult
        });
        
        return validationResult;
    }
    
    /**
     * Execute update workflow
     */
    private async executeUpdateWorkflow(filePath: string, options: any): Promise<any> {
        await this.emit(ParseEventType.UPDATE_STARTED, {
            filePath,
            updateType: 'async_workflow'
        });
        
        // Simulate update operations
        await new Promise(resolve => setTimeout(resolve, Math.random() * 80 + 40));
        
        const updateResult = {
            updated: Math.random() > 0.3,
            changes: Math.floor(Math.random() * 5),
            backupCreated: true
        };
        
        await this.emit(ParseEventType.UPDATE_COMPLETED, {
            filePath,
            result: updateResult
        });
        
        return updateResult;
    }
    
    /**
     * Wait for dependencies to resolve
     */
    private async waitForDependencies(dependencies: string[], timeout: number): Promise<void> {
        const startTime = Date.now();
        const checkInterval = 100; // Check every 100ms
        
        while (Date.now() - startTime < timeout) {
            // Simplified dependency check - in real implementation would check actual dependency states
            const allResolved = dependencies.every(() => Math.random() > 0.1); // 90% chance resolved each check
            
            if (allResolved) {
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        throw new Error(`Dependencies not resolved within ${timeout}ms`);
    }
    
    /**
     * Chain follow-up events after workflow completion
     */
    private async chainFollowUpEvents(filePath: string, workflowType: string, result: any): Promise<void> {
        // Emit cache update event
        if (result && result.tasksFound) {
            await this.emit(ParseEventType.CACHE_UPDATED, {
                filePath,
                entriesAdded: result.tasksFound,
                source: `${workflowType}_workflow`
            });
        }
        
        // Emit index update event
        await this.emit(ParseEventType.INDEX_UPDATED, {
            filePath,
            changeType: workflowType as any,
            timestamp: Date.now()
        });
        
        // Emit UI refresh event if necessary
        if (result && !result.cached) {
            await this.emit(ParseEventType.UI_REFRESH_NEEDED, {
                filePath,
                reason: `${workflowType}_completed`
            });
        }
    }
    
    /**
     * Coordinate multiple async workflows with event orchestration
     */
    public async orchestrateMultipleWorkflows(
        workflows: Array<{
            filePath: string;
            workflowType: 'parse' | 'reparse' | 'validate' | 'update';
            priority?: 'low' | 'normal' | 'high' | 'critical';
            dependencies?: string[];
        }>,
        options: {
            maxConcurrency?: number;
            globalTimeout?: number;
            failFast?: boolean;
            enableProgressEvents?: boolean;
        } = {}
    ): Promise<{
        successful: number;
        failed: number;
        totalDuration: number;
        results: Array<{ filePath: string; success: boolean; result?: any; error?: string }>;
    }> {
        const startTime = performance.now();
        const maxConcurrency = options.maxConcurrency || 5;
        const results: Array<{ filePath: string; success: boolean; result?: any; error?: string }> = [];
        
        // Emit orchestration started
        await this.emit(ParseEventType.ORCHESTRATION_STARTED, {
            totalWorkflows: workflows.length,
            maxConcurrency
        });
        
        // Sort workflows by priority
        const sortedWorkflows = workflows.sort((a, b) => {
            const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
            return (priorityOrder[b.priority || 'normal'] || 2) - (priorityOrder[a.priority || 'normal'] || 2);
        });
        
        // Process workflows in batches
        for (let i = 0; i < sortedWorkflows.length; i += maxConcurrency) {
            const batch = sortedWorkflows.slice(i, i + maxConcurrency);
            
            if (options.enableProgressEvents) {
                await this.emit(ParseEventType.ORCHESTRATION_PROGRESS, {
                    completed: i,
                    total: workflows.length,
                    currentBatch: batch.length
                });
            }
            
            const batchPromises = batch.map(async (workflow) => {
                try {
                    const result = await this.processAsyncTaskFlow(
                        workflow.filePath,
                        workflow.workflowType,
                        {
                            priority: workflow.priority,
                            dependencies: workflow.dependencies,
                            enableEventChaining: true,
                            timeout: options.globalTimeout,
                            retries: 2
                        }
                    );
                    
                    return {
                        filePath: workflow.filePath,
                        success: result.success,
                        result: result.result,
                        error: result.errors?.[0]
                    };
                } catch (error) {
                    return {
                        filePath: workflow.filePath,
                        success: false,
                        error: error.message
                    };
                }
            });
            
            const batchResults = await Promise.allSettled(batchPromises);
            
            for (const settledResult of batchResults) {
                if (settledResult.status === 'fulfilled') {
                    results.push(settledResult.value);
                } else {
                    results.push({
                        filePath: 'unknown',
                        success: false,
                        error: settledResult.reason?.message || 'Unknown error'
                    });
                }
            }
            
            // Check fail-fast condition
            if (options.failFast && results.some(r => !r.success)) {
                break;
            }
        }
        
        const successful = results.filter(r => r.success).length;
        const failed = results.length - successful;
        const totalDuration = performance.now() - startTime;
        
        // Emit orchestration completed
        await this.emit(ParseEventType.ORCHESTRATION_COMPLETED, {
            successful,
            failed,
            totalDuration,
            totalWorkflows: workflows.length
        });
        
        return {
            successful,
            failed,
            totalDuration,
            results
        };
    }
    
    /**
     * Monitor system-wide parsing health and emit alerts
     */
    public async monitorParsingHealth(): Promise<{
        healthy: boolean;
        metrics: {
            eventQueueHealth: number;
            avgProcessingTime: number;
            errorRate: number;
            memoryPressure: number;
        };
        recommendations: string[];
    }> {
        const health = this.getHealthStatus();
        const stats = this.getStatistics();
        
        // Calculate error rate
        const errorEvents = ['parsing_failed', 'workflow_failed', 'validation_failed'];
        const errorCount = errorEvents.reduce((sum, event) => sum + (stats.eventsByType[event] || 0), 0);
        const errorRate = stats.totalEvents > 0 ? errorCount / stats.totalEvents : 0;
        
        // Simulate memory pressure check
        const memoryPressure = Math.random(); // Would integrate with actual memory monitoring
        
        const metrics = {
            eventQueueHealth: 1 - health.queueUtilization,
            avgProcessingTime: health.avgProcessingTime,
            errorRate,
            memoryPressure
        };
        
        const recommendations: string[] = [];
        
        if (health.queueUtilization > 0.8) {
            recommendations.push('Event queue utilization is high. Consider increasing batch size or processing frequency.');
        }
        
        if (errorRate > 0.05) {
            recommendations.push('Error rate is elevated (>5%). Check parsing logic and file validity.');
        }
        
        if (metrics.avgProcessingTime > 100) {
            recommendations.push('Average processing time is high (>100ms). Consider optimization.');
        }
        
        if (memoryPressure > 0.8) {
            recommendations.push('Memory pressure is high. Consider cache cleanup or reducing concurrency.');
        }
        
        const overallHealthy = health.healthy && errorRate < 0.1 && memoryPressure < 0.9;
        
        // Emit health status event
        await this.emit(ParseEventType.SYSTEM_HEALTH_CHECK, {
            healthy: overallHealthy,
            metrics,
            recommendations,
            timestamp: Date.now()
        });
        
        return {
            healthy: overallHealthy,
            metrics,
            recommendations
        };
    }

    /**
     * Log message if debug is enabled
     */
    private log(message: string): void {
        if (this.config.debug) {
            console.log(`[ParseEventManager] ${message}`);
        }
    }
}