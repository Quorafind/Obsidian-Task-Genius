/**
 * Plugin Manager
 * 
 * High-performance plugin orchestration with priority scheduling and load balancing.
 * Manages plugin lifecycle, coordinates execution, and provides intelligent routing.
 * 
 * Features:
 * - Priority-based task scheduling
 * - Load balancing across plugins
 * - Plugin health monitoring
 * - Intelligent fallback routing
 * - Performance-aware plugin selection
 * - Circuit breaker pattern for failing plugins
 */

import { App, Component } from 'obsidian';
import { 
    ParserPlugin, 
    ParserPluginConfig, 
    PluginRegistration,
    PluginUtils,
    FallbackStrategy
} from '../plugins/ParserPlugin';
import { 
    ParseContext, 
    ParseResult, 
    ParserPluginType, 
    ParsePriority,
    isParseResult 
} from '../types/ParsingTypes';
import { ParseEventManager } from './ParseEventManager';
import { UnifiedCacheManager } from './UnifiedCacheManager';
import { ParseEventType } from '../events/ParseEvents';
import { createDeferred, Deferred } from '../utils/Deferred';
import { MarkdownParserPlugin } from '../plugins/MarkdownParserPlugin';
import { CanvasParserPlugin } from '../plugins/CanvasParserPlugin';
import { IcsParserPlugin } from '../plugins/IcsParserPlugin';
import { MetadataParserPlugin } from '../plugins/MetadataParserPlugin';

/**
 * Plugin execution statistics tuple
 * [ExecutionCount, SuccessRate, AvgLatency, ErrorRate, LoadScore]
 */
export type PluginStatsTuple = readonly [
    executionCount: number,
    successRate: number,
    avgLatency: number,
    errorRate: number,
    loadScore: number
];

/**
 * Scheduling policy configuration tuple
 * [PriorityWeight, LoadWeight, LatencyWeight, HealthWeight]
 */
export type SchedulingPolicyTuple = readonly [
    priorityWeight: number,
    loadWeight: number,
    latencyWeight: number,
    healthWeight: number
];

/**
 * Circuit breaker state
 */
export enum CircuitBreakerState {
    CLOSED = 'closed',     // Normal operation
    OPEN = 'open',         // Failing, requests rejected
    HALF_OPEN = 'half_open' // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
    /** Failure threshold to open circuit */
    failureThreshold: number;
    /** Time window for failure counting (ms) */
    timeWindowMs: number;
    /** Recovery timeout (ms) */
    recoveryTimeoutMs: number;
    /** Success threshold to close circuit */
    successThreshold: number;
}

/**
 * Plugin execution task
 */
export interface PluginTask {
    /** Unique task ID */
    id: string;
    /** Parse context */
    context: ParseContext;
    /** Target plugin type */
    pluginType: ParserPluginType;
    /** Task priority */
    priority: ParsePriority;
    /** Creation timestamp */
    timestamp: number;
    /** Deadline (optional) */
    deadline?: number;
    /** Retry count */
    retryCount: number;
    /** Deferred result */
    deferred: Deferred<ParseResult>;
}

/**
 * Plugin health status
 */
export interface PluginHealthInfo {
    /** Plugin identifier */
    pluginType: ParserPluginType;
    /** Health status */
    healthy: boolean;
    /** Current load (0-1) */
    load: number;
    /** Average response time */
    avgResponseTime: number;
    /** Error rate (0-1) */
    errorRate: number;
    /** Circuit breaker state */
    circuitState: CircuitBreakerState;
    /** Last health check timestamp */
    lastHealthCheck: number;
    /** Statistics tuple */
    statsTuple: PluginStatsTuple;
}

/**
 * Plugin manager configuration
 */
export interface PluginManagerConfig {
    /** Maximum concurrent tasks */
    maxConcurrentTasks: number;
    /** Task queue size limit */
    maxQueueSize: number;
    /** Scheduling policy weights */
    schedulingPolicy: SchedulingPolicyTuple;
    /** Circuit breaker configuration */
    circuitBreaker: CircuitBreakerConfig;
    /** Health check interval (ms) */
    healthCheckInterval: number;
    /** Enable load balancing */
    enableLoadBalancing: boolean;
    /** Enable priority scheduling */
    enablePriorityScheduling: boolean;
    /** Default task timeout (ms) */
    defaultTaskTimeout: number;
    /** Enable debug logging */
    debug: boolean;
}

/**
 * Default plugin manager configuration
 */
const DEFAULT_MANAGER_CONFIG: PluginManagerConfig = {
    maxConcurrentTasks: 10,
    maxQueueSize: 100,
    schedulingPolicy: [0.4, 0.3, 0.2, 0.1] as const, // priority > load > latency > health
    circuitBreaker: {
        failureThreshold: 5,
        timeWindowMs: 30000,
        recoveryTimeoutMs: 60000,
        successThreshold: 3
    },
    healthCheckInterval: 10000,
    enableLoadBalancing: true,
    enablePriorityScheduling: true,
    defaultTaskTimeout: 30000,
    debug: false
};

/**
 * Plugin Manager
 * 
 * Orchestrates plugin execution with intelligent scheduling and load balancing.
 * Provides resilient execution with circuit breakers and fallback mechanisms.
 * 
 * @example
 * ```typescript
 * const manager = new PluginManager(app, eventManager, cacheManager);
 * 
 * // Register plugins
 * manager.registerPlugin('markdown', markdownPluginFactory);
 * manager.registerPlugin('project', projectPluginFactory);
 * 
 * // Execute parsing
 * const result = await manager.executePlugin('markdown', context);
 * ```
 */
export class PluginManager extends Component {
    private app: App;
    private eventManager: ParseEventManager;
    private cacheManager: UnifiedCacheManager;
    private config: PluginManagerConfig;
    
    /** Registered plugins */
    private plugins = new Map<ParserPluginType, ParserPlugin>();
    private pluginFactories = new Map<ParserPluginType, () => ParserPlugin>();
    
    /** Task management */
    private taskQueue: PluginTask[] = [];
    private activeTasks = new Map<string, PluginTask>();
    private taskHistory: PluginTask[] = [];
    
    /** Plugin health tracking */
    private pluginHealth = new Map<ParserPluginType, PluginHealthInfo>();
    private circuitBreakers = new Map<ParserPluginType, {
        state: CircuitBreakerState;
        failures: number[];
        lastFailureTime: number;
        successCount: number;
    }>();
    
    /** Load balancing state */
    private pluginLoads = new Map<ParserPluginType, number>();
    private lastExecutionTime = new Map<ParserPluginType, number>();
    
    /** Manager state */
    private isProcessing = false;
    private initialized = false;
    private healthCheckTimer?: NodeJS.Timeout;
    
    /** Performance metrics */
    private metrics = {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        avgExecutionTime: 0,
        queueWaitTime: 0
    };
    
    constructor(
        app: App,
        eventManager: ParseEventManager,
        cacheManager: UnifiedCacheManager,
        config: Partial<PluginManagerConfig> = {}
    ) {
        super();
        this.app = app;
        this.eventManager = eventManager;
        this.cacheManager = cacheManager;
        this.config = { ...DEFAULT_MANAGER_CONFIG, ...config };
        
        this.initialize();
    }
    
    /**
     * Initialize plugin manager
     */
    private initialize(): void {
        if (this.initialized) {
            this.log('Plugin manager already initialized');
            return;
        }
        
        // Register all available parser plugins
        this.registerAllPlugins();
        
        // Start health monitoring
        if (this.config.healthCheckInterval > 0) {
            this.startHealthMonitoring();
        }
        
        // Start task processing
        this.startTaskProcessing();
        
        this.initialized = true;
        this.log('Plugin manager initialized');
    }

    /**
     * Register all available parser plugins
     */
    private registerAllPlugins(): void {
        try {
            // Register Markdown Parser Plugin
            this.registerPlugin('markdown', () => 
                new MarkdownParserPlugin(this.app, this.eventManager, this.cacheManager), 
                { 
                    priority: ParsePriority.HIGH,
                    maxConcurrency: 3,
                    timeout: 30000
                }
            );

            // Register Canvas Parser Plugin
            this.registerPlugin('canvas', () => 
                new CanvasParserPlugin(this.app, this.eventManager, this.cacheManager),
                {
                    priority: ParsePriority.MEDIUM,
                    maxConcurrency: 2,
                    timeout: 20000
                }
            );

            // Register ICS Parser Plugin
            this.registerPlugin('ics', () => 
                new IcsParserPlugin(this.app, this.eventManager, this.cacheManager),
                {
                    priority: ParsePriority.LOW,
                    maxConcurrency: 1,
                    timeout: 15000
                }
            );

            // Register Metadata Parser Plugin
            this.registerPlugin('metadata', () => 
                new MetadataParserPlugin(this.app, this.eventManager, this.cacheManager),
                {
                    priority: ParsePriority.MEDIUM,
                    maxConcurrency: 2,
                    timeout: 10000
                }
            );

            this.log('All parser plugins registered successfully');
        } catch (error) {
            console.error('Failed to register plugins:', error);
            this.log(`Plugin registration error: ${error.message}`);
        }
    }
    
    /**
     * Register a plugin with the manager
     */
    public registerPlugin<T extends ParserPlugin>(
        type: ParserPluginType,
        factory: () => T,
        config: Partial<ParserPluginConfig> = {}
    ): void {
        if (this.plugins.has(type)) {
            this.log(`Plugin ${type} already registered, replacing`);
            const existing = this.plugins.get(type);
            if (existing) {
                this.removeChild(existing);
            }
        }
        
        // Store factory for lazy initialization
        this.pluginFactories.set(type, factory);
        
        // Initialize plugin health
        this.initializePluginHealth(type);
        
        this.log(`Registered plugin: ${type}`);
    }

    /**
     * Get list of registered plugin types
     */
    public getRegisteredPlugins(): ParserPluginType[] {
        return Array.from(this.pluginFactories.keys());
    }

    /**
     * Get plugin registration status with health information
     */
    public getPluginStatus(): Record<ParserPluginType, {
        registered: boolean;
        instantiated: boolean;
        healthy: boolean;
        stats?: PluginStatsTuple;
    }> {
        const status: Record<string, any> = {};
        
        for (const [type] of this.pluginFactories) {
            const health = this.pluginHealth.get(type);
            status[type] = {
                registered: true,
                instantiated: this.plugins.has(type),
                healthy: health?.state === CircuitBreakerState.CLOSED,
                stats: this.pluginStats.get(type)
            };
        }
        
        return status;
    }
    
    /**
     * Get or create plugin instance
     */
    private getPlugin(type: ParserPluginType): ParserPlugin | undefined {
        // Return existing plugin if available
        if (this.plugins.has(type)) {
            return this.plugins.get(type);
        }
        
        // Create new plugin from factory
        const factory = this.pluginFactories.get(type);
        if (!factory) {
            this.log(`No factory found for plugin type: ${type}`);
            return undefined;
        }
        
        try {
            const plugin = factory();
            this.plugins.set(type, plugin);
            this.addChild(plugin);
            
            this.log(`Created plugin instance: ${type}`);
            return plugin;
            
        } catch (error) {
            this.log(`Failed to create plugin ${type}: ${error.message}`);
            return undefined;
        }
    }
    
    /**
     * Execute plugin with context
     */
    public async executePlugin(
        type: ParserPluginType,
        context: ParseContext,
        priority = ParsePriority.NORMAL,
        timeout?: number
    ): Promise<ParseResult> {
        // Check circuit breaker
        if (!this.isPluginAvailable(type)) {
            throw new Error(`Plugin ${type} is currently unavailable (circuit breaker open)`);
        }
        
        // Create task
        const task: PluginTask = {
            id: this.generateTaskId(),
            context,
            pluginType: type,
            priority,
            timestamp: Date.now(),
            deadline: timeout ? Date.now() + timeout : undefined,
            retryCount: 0,
            deferred: createDeferred<ParseResult>()
        };
        
        // Add to queue or execute immediately
        if (this.shouldExecuteImmediately(task)) {
            return this.executeTaskInternal(task);
        } else {
            return this.queueTask(task);
        }
    }
    
    /**
     * Queue task for later execution
     */
    private async queueTask(task: PluginTask): Promise<ParseResult> {
        // Check queue capacity
        if (this.taskQueue.length >= this.config.maxQueueSize) {
            throw new Error('Task queue is full');
        }
        
        // Insert task in priority order
        this.insertTaskByPriority(task);
        
        this.metrics.totalTasks++;
        this.log(`Queued task ${task.id} for plugin ${task.pluginType}`);
        
        return task.deferred;
    }
    
    /**
     * Insert task into queue maintaining priority order
     */
    private insertTaskByPriority(task: PluginTask): void {
        if (!this.config.enablePriorityScheduling) {
            this.taskQueue.push(task);
            return;
        }
        
        // Find insertion point based on priority
        let insertIndex = this.taskQueue.length;
        for (let i = 0; i < this.taskQueue.length; i++) {
            if (this.taskQueue[i].priority > task.priority) {
                insertIndex = i;
                break;
            }
        }
        
        this.taskQueue.splice(insertIndex, 0, task);
    }
    
    /**
     * Determine if task should execute immediately
     */
    private shouldExecuteImmediately(task: PluginTask): boolean {
        // Execute immediately if under concurrency limit and plugin is available
        return this.activeTasks.size < this.config.maxConcurrentTasks &&
               this.isPluginHealthy(task.pluginType) &&
               (task.priority === ParsePriority.HIGH || this.taskQueue.length === 0);
    }
    
    /**
     * Execute task internally
     */
    private async executeTaskInternal(task: PluginTask): Promise<ParseResult> {
        const startTime = Date.now();
        
        try {
            // Track active task
            this.activeTasks.set(task.id, task);
            
            // Update plugin load
            this.updatePluginLoad(task.pluginType, 1);
            
            // Get plugin instance
            const plugin = this.getPlugin(task.pluginType);
            if (!plugin) {
                throw new Error(`Plugin ${task.pluginType} not available`);
            }
            
            // Execute with timeout
            const timeoutMs = task.deadline ? 
                Math.max(0, task.deadline - Date.now()) : 
                this.config.defaultTaskTimeout;
            
            const result = await Promise.race([
                plugin.parse(task.context),
                this.createTimeoutPromise(timeoutMs, `Task ${task.id} timed out`)
            ]);
            
            // Record success
            this.recordPluginExecution(task.pluginType, true, Date.now() - startTime);
            this.metrics.completedTasks++;
            
            task.deferred.resolve(result);
            return result;
            
        } catch (error) {
            // Record failure
            this.recordPluginExecution(task.pluginType, false, Date.now() - startTime);
            this.metrics.failedTasks++;
            
            // Try fallback if available
            const fallbackResult = await this.tryFallbackExecution(task, error);
            if (fallbackResult) {
                task.deferred.resolve(fallbackResult);
                return fallbackResult;
            }
            
            // Return error result
            const errorResult: ParseResult = {
                type: 'error',
                error: {
                    message: error.message,
                    code: 'PLUGIN_EXECUTION_ERROR',
                    recoverable: true
                },
                stats: {
                    processingTimeMs: Date.now() - startTime,
                    cacheHit: false
                },
                source: {
                    plugin: task.pluginType,
                    version: '1.0.0',
                    fromCache: false
                }
            };
            
            task.deferred.resolve(errorResult);
            return errorResult;
            
        } finally {
            // Cleanup
            this.activeTasks.delete(task.id);
            this.updatePluginLoad(task.pluginType, -1);
            this.lastExecutionTime.set(task.pluginType, Date.now());
            
            // Update metrics
            this.updateExecutionMetrics(Date.now() - startTime);
        }
    }
    
    /**
     * Try fallback execution strategies
     */
    private async tryFallbackExecution(task: PluginTask, originalError: Error): Promise<ParseResult | undefined> {
        // Try alternative plugins for the same task
        const alternativePlugins = this.findAlternativePlugins(task.pluginType);
        
        for (const altType of alternativePlugins) {
            if (this.isPluginHealthy(altType)) {
                try {
                    this.log(`Trying fallback plugin ${altType} for task ${task.id}`);
                    const altPlugin = this.getPlugin(altType);
                    if (altPlugin) {
                        return await altPlugin.parse(task.context);
                    }
                } catch (fallbackError) {
                    this.log(`Fallback plugin ${altType} also failed: ${fallbackError.message}`);
                }
            }
        }
        
        return undefined;
    }
    
    /**
     * Find alternative plugins for fallback
     */
    private findAlternativePlugins(primaryType: ParserPluginType): ParserPluginType[] {
        const alternatives: ParserPluginType[] = [];
        
        // Plugin compatibility matrix
        switch (primaryType) {
            case 'markdown':
                alternatives.push('metadata');
                break;
            case 'canvas':
                alternatives.push('metadata');
                break;
            case 'project':
                // Project detection doesn't have direct alternatives
                break;
            default:
                break;
        }
        
        return alternatives.filter(type => this.plugins.has(type) || this.pluginFactories.has(type));
    }
    
    /**
     * Start task processing loop
     */
    private startTaskProcessing(): void {
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        this.processTaskQueue();
    }
    
    /**
     * Process task queue continuously
     */
    private async processTaskQueue(): Promise<void> {
        while (this.isProcessing) {
            try {
                // Process tasks if under concurrency limit
                while (this.taskQueue.length > 0 && 
                       this.activeTasks.size < this.config.maxConcurrentTasks) {
                    
                    const task = this.selectNextTask();
                    if (!task) break;
                    
                    // Check if task is still valid
                    if (task.deadline && Date.now() > task.deadline) {
                        this.log(`Task ${task.id} expired, removing from queue`);
                        task.deferred.reject(new Error('Task deadline exceeded'));
                        continue;
                    }
                    
                    // Execute task (don't await - run concurrently)
                    this.executeTaskInternal(task).catch(error => {
                        this.log(`Task execution failed: ${error.message}`);
                    });
                }
                
                // Short delay before next iteration
                await this.delay(100);
                
            } catch (error) {
                this.log(`Error in task processing loop: ${error.message}`);
                await this.delay(1000); // Longer delay on error
            }
        }
    }
    
    /**
     * Select next task from queue using scheduling policy
     */
    private selectNextTask(): PluginTask | undefined {
        if (this.taskQueue.length === 0) return undefined;
        
        if (!this.config.enableLoadBalancing) {
            return this.taskQueue.shift();
        }
        
        // Find best task based on scheduling policy
        let bestTask: PluginTask | undefined;
        let bestScore = -1;
        let bestIndex = -1;
        
        for (let i = 0; i < this.taskQueue.length; i++) {
            const task = this.taskQueue[i];
            
            // Skip if plugin is not available
            if (!this.isPluginAvailable(task.pluginType)) continue;
            
            const score = this.calculateTaskScore(task);
            if (score > bestScore) {
                bestScore = score;
                bestTask = task;
                bestIndex = i;
            }
        }
        
        // Remove selected task from queue
        if (bestTask && bestIndex >= 0) {
            this.taskQueue.splice(bestIndex, 1);
        }
        
        return bestTask;
    }
    
    /**
     * Calculate task scheduling score
     */
    private calculateTaskScore(task: PluginTask): number {
        const [priorityWeight, loadWeight, latencyWeight, healthWeight] = this.config.schedulingPolicy;
        
        // Priority score (higher priority = higher score)
        const priorityScore = (4 - task.priority) / 4; // Invert priority enum
        
        // Load score (lower load = higher score)
        const currentLoad = this.pluginLoads.get(task.pluginType) || 0;
        const loadScore = Math.max(0, 1 - currentLoad);
        
        // Latency score (lower latency = higher score)
        const health = this.pluginHealth.get(task.pluginType);
        const latencyScore = health ? Math.max(0, 1 - (health.avgResponseTime / 5000)) : 0.5;
        
        // Health score
        const healthScore = health && health.healthy ? 1 : 0;
        
        // Weighted sum
        return (priorityScore * priorityWeight) +
               (loadScore * loadWeight) +
               (latencyScore * latencyWeight) +
               (healthScore * healthWeight);
    }
    
    /**
     * Check if plugin is available (circuit breaker check)
     */
    private isPluginAvailable(type: ParserPluginType): boolean {
        const breaker = this.circuitBreakers.get(type);
        if (!breaker) return true;
        
        const now = Date.now();
        
        switch (breaker.state) {
            case CircuitBreakerState.CLOSED:
                return true;
                
            case CircuitBreakerState.OPEN:
                // Check if recovery timeout has passed
                if (now - breaker.lastFailureTime > this.config.circuitBreaker.recoveryTimeoutMs) {
                    breaker.state = CircuitBreakerState.HALF_OPEN;
                    breaker.successCount = 0;
                    return true;
                }
                return false;
                
            case CircuitBreakerState.HALF_OPEN:
                return true;
                
            default:
                return false;
        }
    }
    
    /**
     * Check if plugin is healthy
     */
    private isPluginHealthy(type: ParserPluginType): boolean {
        const health = this.pluginHealth.get(type);
        return health ? health.healthy : true;
    }
    
    /**
     * Record plugin execution result
     */
    private recordPluginExecution(type: ParserPluginType, success: boolean, executionTime: number): void {
        // Update circuit breaker
        this.updateCircuitBreaker(type, success);
        
        // Update health info
        this.updatePluginHealth(type, success, executionTime);
    }
    
    /**
     * Update circuit breaker state
     */
    private updateCircuitBreaker(type: ParserPluginType, success: boolean): void {
        let breaker = this.circuitBreakers.get(type);
        if (!breaker) {
            breaker = {
                state: CircuitBreakerState.CLOSED,
                failures: [],
                lastFailureTime: 0,
                successCount: 0
            };
            this.circuitBreakers.set(type, breaker);
        }
        
        const now = Date.now();
        const { failureThreshold, timeWindowMs, successThreshold } = this.config.circuitBreaker;
        
        if (success) {
            if (breaker.state === CircuitBreakerState.HALF_OPEN) {
                breaker.successCount++;
                if (breaker.successCount >= successThreshold) {
                    breaker.state = CircuitBreakerState.CLOSED;
                    breaker.failures = [];
                    this.log(`Circuit breaker for ${type} closed (recovered)`);
                }
            }
        } else {
            breaker.lastFailureTime = now;
            breaker.failures.push(now);
            
            // Clean old failures outside time window
            breaker.failures = breaker.failures.filter(time => now - time < timeWindowMs);
            
            // Check if should open circuit
            if (breaker.state === CircuitBreakerState.CLOSED && 
                breaker.failures.length >= failureThreshold) {
                breaker.state = CircuitBreakerState.OPEN;
                this.log(`Circuit breaker for ${type} opened (too many failures)`);
            } else if (breaker.state === CircuitBreakerState.HALF_OPEN) {
                breaker.state = CircuitBreakerState.OPEN;
                breaker.successCount = 0;
                this.log(`Circuit breaker for ${type} reopened (failed during recovery)`);
            }
        }
    }
    
    /**
     * Update plugin health information
     */
    private updatePluginHealth(type: ParserPluginType, success: boolean, executionTime: number): void {
        let health = this.pluginHealth.get(type);
        if (!health) {
            health = this.createInitialHealthInfo(type);
            this.pluginHealth.set(type, health);
        }
        
        // Update statistics
        const [execCount, successRate, avgLatency, errorRate, loadScore] = health.statsTuple;
        const newExecCount = execCount + 1;
        const newSuccessRate = ((successRate * execCount) + (success ? 1 : 0)) / newExecCount;
        const newErrorRate = 1 - newSuccessRate;
        const newAvgLatency = ((avgLatency * execCount) + executionTime) / newExecCount;
        const newLoadScore = this.pluginLoads.get(type) || 0;
        
        health.statsTuple = [newExecCount, newSuccessRate, newAvgLatency, newErrorRate, newLoadScore] as const;
        health.avgResponseTime = newAvgLatency;
        health.errorRate = newErrorRate;
        health.lastHealthCheck = Date.now();
        
        // Update health status
        health.healthy = newSuccessRate > 0.8 && newAvgLatency < 5000 && newErrorRate < 0.2;
        
        // Update circuit breaker state
        const breaker = this.circuitBreakers.get(type);
        health.circuitState = breaker ? breaker.state : CircuitBreakerState.CLOSED;
    }
    
    /**
     * Update plugin load
     */
    private updatePluginLoad(type: ParserPluginType, delta: number): void {
        const currentLoad = this.pluginLoads.get(type) || 0;
        const newLoad = Math.max(0, currentLoad + delta);
        this.pluginLoads.set(type, newLoad);
        
        // Update health info
        const health = this.pluginHealth.get(type);
        if (health) {
            health.load = newLoad;
        }
    }
    
    /**
     * Initialize plugin health tracking
     */
    private initializePluginHealth(type: ParserPluginType): void {
        const health = this.createInitialHealthInfo(type);
        this.pluginHealth.set(type, health);
        
        const breaker = {
            state: CircuitBreakerState.CLOSED,
            failures: [],
            lastFailureTime: 0,
            successCount: 0
        };
        this.circuitBreakers.set(type, breaker);
        
        this.pluginLoads.set(type, 0);
    }
    
    /**
     * Create initial health info
     */
    private createInitialHealthInfo(type: ParserPluginType): PluginHealthInfo {
        return {
            pluginType: type,
            healthy: true,
            load: 0,
            avgResponseTime: 0,
            errorRate: 0,
            circuitState: CircuitBreakerState.CLOSED,
            lastHealthCheck: Date.now(),
            statsTuple: [0, 1, 0, 0, 0] as const
        };
    }
    
    /**
     * Start health monitoring
     */
    private startHealthMonitoring(): void {
        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck();
        }, this.config.healthCheckInterval);
        
        this.register(() => {
            if (this.healthCheckTimer) {
                clearInterval(this.healthCheckTimer);
            }
        });
    }
    
    /**
     * Perform health check on all plugins
     */
    private performHealthCheck(): void {
        for (const [type, health] of this.pluginHealth) {
            // Check if plugin has been idle too long
            const lastExecution = this.lastExecutionTime.get(type) || 0;
            const idleTime = Date.now() - lastExecution;
            
            if (idleTime > 60000) { // 1 minute
                // Reset load for idle plugins
                this.updatePluginLoad(type, -health.load);
            }
            
            // Log health status if debug enabled
            if (this.config.debug) {
                this.log(`Plugin ${type}: healthy=${health.healthy}, load=${health.load}, avgTime=${health.avgResponseTime.toFixed(0)}ms, errorRate=${(health.errorRate * 100).toFixed(1)}%`);
            }
        }
    }
    
    /**
     * Update execution metrics
     */
    private updateExecutionMetrics(executionTime: number): void {
        const totalExecutions = this.metrics.completedTasks + this.metrics.failedTasks;
        this.metrics.avgExecutionTime = 
            ((this.metrics.avgExecutionTime * (totalExecutions - 1)) + executionTime) / totalExecutions;
    }
    
    // ===== Public API =====
    
    /**
     * Get plugin health status
     */
    public getPluginHealth(type?: ParserPluginType): PluginHealthInfo[] {
        if (type) {
            const health = this.pluginHealth.get(type);
            return health ? [health] : [];
        }
        
        return Array.from(this.pluginHealth.values());
    }
    
    /**
     * Get manager statistics
     */
    public getStatistics(): {
        metrics: typeof this.metrics;
        queueSize: number;
        activeTasks: number;
        pluginCount: number;
        healthyPlugins: number;
    } {
        const healthyPlugins = Array.from(this.pluginHealth.values())
            .filter(health => health.healthy).length;
        
        return {
            metrics: { ...this.metrics },
            queueSize: this.taskQueue.length,
            activeTasks: this.activeTasks.size,
            pluginCount: this.plugins.size,
            healthyPlugins
        };
    }
    
    /**
     * Force plugin health refresh
     */
    public refreshPluginHealth(type: ParserPluginType): void {
        const plugin = this.plugins.get(type);
        if (plugin) {
            const pluginHealth = plugin.getHealthStatus();
            this.updatePluginHealth(type, pluginHealth.healthy, pluginHealth.avgResponseTime);
        }
    }
    
    /**
     * Reset circuit breaker for plugin
     */
    public resetCircuitBreaker(type: ParserPluginType): void {
        const breaker = this.circuitBreakers.get(type);
        if (breaker) {
            breaker.state = CircuitBreakerState.CLOSED;
            breaker.failures = [];
            breaker.successCount = 0;
            this.log(`Circuit breaker for ${type} manually reset`);
        }
    }
    
    /**
     * Cancel all pending tasks
     */
    public cancelAllTasks(): void {
        // Cancel queued tasks
        for (const task of this.taskQueue) {
            task.deferred.reject(new Error('Task cancelled by manager shutdown'));
        }
        this.taskQueue = [];
        
        // Cancel active tasks
        for (const task of this.activeTasks.values()) {
            task.deferred.reject(new Error('Task cancelled by manager shutdown'));
        }
        this.activeTasks.clear();
    }
    
    // ===== Utility Methods =====
    
    /**
     * Generate unique task ID
     */
    private generateTaskId(): string {
        return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Create timeout promise
     */
    private createTimeoutPromise(timeoutMs: number, message: string): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error(message)), timeoutMs);
        });
    }
    
    /**
     * Delay utility
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Component lifecycle: cleanup on unload
     */
    public onunload(): void {
        this.log('Shutting down plugin manager');
        
        // Stop processing
        this.isProcessing = false;
        
        // Cancel all tasks
        this.cancelAllTasks();
        
        // Clear timers
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        
        // Cleanup plugins
        for (const plugin of this.plugins.values()) {
            this.removeChild(plugin);
        }
        this.plugins.clear();
        this.pluginFactories.clear();
        
        // Reset state
        this.initialized = false;
        
        super.onunload();
        this.log('Plugin manager shut down');
    }
    
    /**
     * Log message if debug is enabled
     */
    private log(message: string): void {
        if (this.config.debug) {
            console.log(`[PluginManager] ${message}`);
        }
    }
}