/**
 * Parser Plugin Base Class
 * 
 * High-performance, extensible base class for all parsing plugins.
 * Uses advanced TypeScript patterns and error handling strategies.
 * 
 * Features:
 * - Tuple-based configuration patterns
 * - Exponential backoff retry mechanism
 * - Graceful degradation strategies
 * - Performance monitoring with statistics
 * - Component lifecycle management
 * - Type-safe plugin registration
 */

import { Component, App } from 'obsidian';
import { 
    ParseContext, 
    ParseResult, 
    ParserPluginType, 
    ParsePriority,
    isParseResult 
} from '../types/ParsingTypes';
import { ParseEventManager } from '../core/ParseEventManager';
import { ParseEventType } from '../events/ParseEvents';
import { createDeferred, Deferred } from '../utils/Deferred';

/**
 * Plugin configuration tuple patterns for type safety
 * [Priority, RetryCount, TimeoutMs, EnableCache, FallbackStrategy]
 */
export type PluginConfigTuple = readonly [
    priority: number,
    retryCount: number,
    timeoutMs: number,
    enableCache: boolean,
    fallbackStrategy: FallbackStrategy
];

/**
 * Performance metrics tuple
 * [SuccessCount, ErrorCount, AvgTimeMs, MaxTimeMs, CacheHitRatio]
 */
export type PerformanceMetricsTuple = readonly [
    successCount: number,
    errorCount: number,
    avgTimeMs: number,
    maxTimeMs: number,
    cacheHitRatio: number
];

/**
 * Error handling tuple
 * [ErrorCode, IsRecoverable, RetryDelay, FallbackAvailable]
 */
export type ErrorInfoTuple = readonly [
    errorCode: string,
    isRecoverable: boolean,
    retryDelayMs: number,
    fallbackAvailable: boolean
];

/**
 * Fallback strategies for error handling
 */
export enum FallbackStrategy {
    NONE = 'none',
    CACHE = 'cache',
    DEFAULT_VALUES = 'default',
    ALTERNATE_PARSER = 'alternate',
    SKIP = 'skip'
}

/**
 * Retry strategy configuration
 */
export interface RetryStrategy {
    /** Maximum retry attempts */
    maxAttempts: number;
    /** Base delay in milliseconds */
    baseDelayMs: number;
    /** Exponential backoff multiplier */
    backoffMultiplier: number;
    /** Maximum delay cap */
    maxDelayMs: number;
    /** Jitter factor (0-1) for randomization */
    jitterFactor: number;
}

/**
 * Plugin health status
 */
export interface PluginHealthStatus {
    healthy: boolean;
    errorRate: number;
    avgResponseTime: number;
    memoryUsage: number;
    lastError?: {
        message: string;
        timestamp: number;
        recoverable: boolean;
    };
}

/**
 * Plugin statistics
 */
export interface PluginStatistics {
    /** Total operations */
    totalOperations: number;
    /** Successful operations */
    successfulOperations: number;
    /** Failed operations */
    failedOperations: number;
    /** Average processing time */
    avgProcessingTime: number;
    /** Maximum processing time */
    maxProcessingTime: number;
    /** Cache statistics */
    cacheStats: {
        hits: number;
        misses: number;
        hitRatio: number;
    };
    /** Error breakdown */
    errorBreakdown: Record<string, number>;
    /** Performance metrics as tuple */
    metricsAsTuple: PerformanceMetricsTuple;
}

/**
 * Plugin configuration interface
 */
export interface ParserPluginConfig {
    /** Plugin type identifier */
    type: ParserPluginType;
    /** Plugin version */
    version: string;
    /** Plugin name */
    name: string;
    /** Configuration as tuple */
    configTuple: PluginConfigTuple;
    /** Retry strategy */
    retryStrategy: RetryStrategy;
    /** Enable performance monitoring */
    enableMonitoring: boolean;
    /** Enable debug logging */
    debug: boolean;
}

/**
 * Default plugin configuration
 */
export const DEFAULT_PLUGIN_CONFIG: Omit<ParserPluginConfig, 'type' | 'name'> = {
    version: '1.0.0',
    configTuple: [1, 3, 30000, true, FallbackStrategy.CACHE] as const,
    retryStrategy: {
        maxAttempts: 3,
        baseDelayMs: 100,
        backoffMultiplier: 2,
        maxDelayMs: 5000,
        jitterFactor: 0.1
    },
    enableMonitoring: true,
    debug: false
};

/**
 * Abstract Parser Plugin Base Class
 * 
 * Provides common functionality for all parsing plugins with advanced patterns.
 * Implements retry logic, performance monitoring, and graceful degradation.
 * 
 * @example
 * ```typescript
 * class MyParserPlugin extends ParserPlugin<MyResult> {
 *   protected async parseInternal(context: ParseContext): Promise<MyResult> {
 *     // Custom parsing logic
 *     return { data: 'parsed' };
 *   }
 *   
 *   protected getFallbackResult(context: ParseContext): MyResult {
 *     return { data: 'fallback' };
 *   }
 * }
 * ```
 */
export abstract class ParserPlugin<TResult = any> extends Component {
    protected app: App;
    protected eventManager: ParseEventManager;
    protected config: ParserPluginConfig;
    
    /** Plugin statistics */
    private stats: PluginStatistics;
    
    /** Processing times for metrics */
    private processingTimes: number[] = [];
    
    /** Error tracking */
    private errorHistory: Array<{ error: string; timestamp: number; recoverable: boolean }> = [];
    
    /** Plugin health status */
    private healthStatus: PluginHealthStatus;
    
    /** Ongoing operations for cancellation */
    private activeOperations = new Map<string, Deferred<ParseResult<TResult>>>();
    
    /** Plugin initialization status */
    private initialized = false;
    
    constructor(
        app: App,
        eventManager: ParseEventManager,
        config: Partial<ParserPluginConfig> & Pick<ParserPluginConfig, 'type' | 'name'>
    ) {
        super();
        this.app = app;
        this.eventManager = eventManager;
        this.config = { ...DEFAULT_PLUGIN_CONFIG, ...config };
        
        this.initializeStats();
        this.initializeHealthStatus();
        this.initialize();
    }
    
    /**
     * Initialize plugin statistics
     */
    private initializeStats(): void {
        this.stats = {
            totalOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            avgProcessingTime: 0,
            maxProcessingTime: 0,
            cacheStats: {
                hits: 0,
                misses: 0,
                hitRatio: 0
            },
            errorBreakdown: {},
            metricsAsTuple: [0, 0, 0, 0, 0] as const
        };
    }
    
    /**
     * Initialize health status
     */
    private initializeHealthStatus(): void {
        this.healthStatus = {
            healthy: true,
            errorRate: 0,
            avgResponseTime: 0,
            memoryUsage: 0
        };
    }
    
    /**
     * Initialize plugin
     */
    private initialize(): void {
        if (this.initialized) {
            this.log('Plugin already initialized');
            return;
        }
        
        // Setup performance monitoring
        if (this.config.enableMonitoring) {
            this.startHealthMonitoring();
        }
        
        this.initialized = true;
        this.log(`Plugin ${this.config.name} initialized`);
    }
    
    /**
     * Parse content with full error handling and retry logic
     */
    public async parse(context: ParseContext): Promise<ParseResult<TResult>> {
        const operationId = `${this.config.type}-${Date.now()}-${Math.random()}`;
        const startTime = performance.now();
        
        // Create deferred for operation tracking
        const deferred = createDeferred<ParseResult<TResult>>();
        this.activeOperations.set(operationId, deferred);
        
        try {
            this.stats.totalOperations++;
            
            // Emit parse started event
            this.eventManager.emitSync(ParseEventType.PARSE_STARTED, {
                filePath: context.filePath,
                fileType: context.fileType,
                priority: context.priority
            });
            
            // Check cache first if enabled
            const [, , , enableCache] = this.config.configTuple;
            if (enableCache) {
                const cachedResult = await this.getCachedResult(context);
                if (cachedResult) {
                    this.stats.cacheStats.hits++;
                    const result = this.createSuccessResult(cachedResult, true, performance.now() - startTime);
                    deferred.resolve(result);
                    return result;
                }
                this.stats.cacheStats.misses++;
            }
            
            // Perform parsing with retry logic
            const result = await this.parseWithRetry(context, operationId);
            
            // Cache result if successful
            if (result.type === 'success' && enableCache) {
                await this.cacheResult(context, result.data);
            }
            
            // Update statistics
            this.updateStatistics(true, performance.now() - startTime);
            
            // Emit completion event
            this.eventManager.emitSync(ParseEventType.PARSE_COMPLETED, {
                filePath: context.filePath,
                result,
                fromCache: false
            });
            
            deferred.resolve(result);
            return result;
            
        } catch (error) {
            // Handle error with fallback strategies
            const errorResult = await this.handleError(error, context, performance.now() - startTime);
            
            this.updateStatistics(false, performance.now() - startTime, error.message);
            
            // Emit failure event
            this.eventManager.emitSync(ParseEventType.PARSE_FAILED, {
                filePath: context.filePath,
                error: {
                    message: error.message,
                    code: error.code || 'UNKNOWN',
                    recoverable: this.isRecoverableError(error)
                },
                retryAttempt: 0 // TODO: Track actual retry attempts
            });
            
            deferred.resolve(errorResult);
            return errorResult;
            
        } finally {
            this.activeOperations.delete(operationId);
        }
    }
    
    /**
     * Parse with exponential backoff retry
     */
    private async parseWithRetry(context: ParseContext, operationId: string): Promise<ParseResult<TResult>> {
        const { retryStrategy } = this.config;
        let lastError: Error;
        
        for (let attempt = 0; attempt < retryStrategy.maxAttempts; attempt++) {
            try {
                // Check if operation was cancelled
                if (!this.activeOperations.has(operationId)) {
                    throw new Error('Operation cancelled');
                }
                
                // Apply timeout from config tuple
                const [, , timeoutMs] = this.config.configTuple;
                const result = await Promise.race([
                    this.parseInternal(context),
                    this.createTimeoutPromise(timeoutMs)
                ]);
                
                return this.createSuccessResult(result, false, 0);
                
            } catch (error) {
                lastError = error;
                
                // Don't retry on certain errors
                if (!this.isRecoverableError(error) || attempt === retryStrategy.maxAttempts - 1) {
                    break;
                }
                
                // Calculate delay with exponential backoff and jitter
                const baseDelay = retryStrategy.baseDelayMs * Math.pow(retryStrategy.backoffMultiplier, attempt);
                const jitter = Math.random() * retryStrategy.jitterFactor * baseDelay;
                const delay = Math.min(baseDelay + jitter, retryStrategy.maxDelayMs);
                
                this.log(`Retry attempt ${attempt + 1} for ${context.filePath} after ${delay}ms`);
                await this.delay(delay);
            }
        }
        
        throw lastError;
    }
    
    /**
     * Handle errors with fallback strategies
     */
    private async handleError(
        error: Error, 
        context: ParseContext, 
        processingTime: number
    ): Promise<ParseResult<TResult>> {
        const [, , , , fallbackStrategy] = this.config.configTuple;
        
        // Record error
        this.recordError(error);
        
        // Try fallback strategies
        switch (fallbackStrategy) {
            case FallbackStrategy.CACHE:
                const cachedResult = await this.getCachedResult(context);
                if (cachedResult) {
                    return this.createSuccessResult(cachedResult, true, processingTime);
                }
                break;
                
            case FallbackStrategy.DEFAULT_VALUES:
                const defaultResult = this.getFallbackResult(context);
                if (defaultResult) {
                    return this.createSuccessResult(defaultResult, false, processingTime);
                }
                break;
                
            case FallbackStrategy.ALTERNATE_PARSER:
                // Would delegate to alternate parser (implementation specific)
                break;
                
            case FallbackStrategy.SKIP:
                return this.createErrorResult(error, processingTime, true);
        }
        
        return this.createErrorResult(error, processingTime, this.isRecoverableError(error));
    }
    
    /**
     * Create success result with metadata
     */
    private createSuccessResult(
        data: TResult, 
        fromCache: boolean, 
        processingTime: number
    ): ParseResult<TResult> {
        return {
            type: 'success',
            data,
            stats: {
                processingTimeMs: processingTime,
                cacheHit: fromCache,
                memoryUsed: this.estimateMemoryUsage(data)
            },
            source: {
                plugin: this.config.type,
                version: this.config.version,
                fromCache
            },
            metadata: {
                confidence: 1.0,
                fallbackUsed: false
            }
        };
    }
    
    /**
     * Create error result with metadata
     */
    private createErrorResult(
        error: Error, 
        processingTime: number, 
        recoverable: boolean
    ): ParseResult<TResult> {
        return {
            type: 'error',
            error: {
                message: error.message,
                code: (error as any).code || 'PARSE_ERROR',
                details: error.stack,
                recoverable
            },
            stats: {
                processingTimeMs: processingTime,
                cacheHit: false
            },
            source: {
                plugin: this.config.type,
                version: this.config.version,
                fromCache: false
            }
        };
    }
    
    /**
     * Update plugin statistics
     */
    private updateStatistics(success: boolean, processingTime: number, errorCode?: string): void {
        if (success) {
            this.stats.successfulOperations++;
        } else {
            this.stats.failedOperations++;
            if (errorCode) {
                this.stats.errorBreakdown[errorCode] = (this.stats.errorBreakdown[errorCode] || 0) + 1;
            }
        }
        
        // Update processing times
        this.processingTimes.push(processingTime);
        if (this.processingTimes.length > 100) {
            this.processingTimes = this.processingTimes.slice(-100);
        }
        
        this.stats.avgProcessingTime = 
            this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
        this.stats.maxProcessingTime = Math.max(this.stats.maxProcessingTime, processingTime);
        
        // Update cache hit ratio
        const totalCacheOps = this.stats.cacheStats.hits + this.stats.cacheStats.misses;
        this.stats.cacheStats.hitRatio = totalCacheOps > 0 ? 
            this.stats.cacheStats.hits / totalCacheOps : 0;
        
        // Update metrics tuple
        this.stats.metricsAsTuple = [
            this.stats.successfulOperations,
            this.stats.failedOperations,
            this.stats.avgProcessingTime,
            this.stats.maxProcessingTime,
            this.stats.cacheStats.hitRatio
        ] as const;
        
        // Update health status
        this.updateHealthStatus();
    }
    
    /**
     * Update plugin health status
     */
    private updateHealthStatus(): void {
        const totalOps = this.stats.totalOperations;
        const errorRate = totalOps > 0 ? this.stats.failedOperations / totalOps : 0;
        
        this.healthStatus = {
            healthy: errorRate < 0.1 && this.stats.avgProcessingTime < 5000,
            errorRate,
            avgResponseTime: this.stats.avgProcessingTime,
            memoryUsage: this.estimateMemoryUsage(this.stats),
            lastError: this.errorHistory.length > 0 ? this.errorHistory[this.errorHistory.length - 1] : undefined
        };
    }
    
    /**
     * Record error in history
     */
    private recordError(error: Error): void {
        this.errorHistory.push({
            error: error.message,
            timestamp: Date.now(),
            recoverable: this.isRecoverableError(error)
        });
        
        // Keep only recent errors
        if (this.errorHistory.length > 50) {
            this.errorHistory = this.errorHistory.slice(-50);
        }
    }
    
    /**
     * Start health monitoring
     */
    private startHealthMonitoring(): void {
        // Monitor every 30 seconds
        const monitoringInterval = setInterval(() => {
            if (!this.initialized) {
                clearInterval(monitoringInterval);
                return;
            }
            
            const health = this.getHealthStatus();
            if (!health.healthy) {
                this.log(`Plugin health warning: error rate ${health.errorRate.toFixed(2)}, avg time ${health.avgResponseTime.toFixed(0)}ms`);
            }
        }, 30000);
        
        // Clear on unload
        this.register(() => clearInterval(monitoringInterval));
    }
    
    // ===== Abstract Methods (to be implemented by subclasses) =====
    
    /**
     * Core parsing logic - must be implemented by subclasses
     */
    protected abstract parseInternal(context: ParseContext): Promise<TResult>;
    
    /**
     * Provide fallback result when parsing fails
     */
    protected abstract getFallbackResult(context: ParseContext): TResult | undefined;
    
    /**
     * Determine if an error is recoverable
     */
    protected abstract isRecoverableError(error: Error): boolean;
    
    // ===== Optional Override Methods =====
    
    /**
     * Get cached result (override for custom caching)
     */
    protected async getCachedResult(context: ParseContext): Promise<TResult | undefined> {
        const cacheKey = this.getCacheKey(context);
        return context.cacheManager.get<TResult>(cacheKey, 'parsed_content' as any);
    }
    
    /**
     * Cache result (override for custom caching)
     */
    protected async cacheResult(context: ParseContext, result: TResult): Promise<void> {
        const cacheKey = this.getCacheKey(context);
        context.cacheManager.set(cacheKey, result, 'parsed_content' as any, {
            mtime: context.stats?.mtime,
            ttl: 5 * 60 * 1000 // 5 minutes
        });
    }
    
    /**
     * Generate cache key (override for custom keys)
     */
    protected getCacheKey(context: ParseContext): string {
        return `${this.config.type}:${context.filePath}:${context.stats?.mtime || 0}`;
    }
    
    /**
     * Estimate memory usage (override for accurate estimation)
     */
    protected estimateMemoryUsage(data: any): number {
        if (!data) return 0;
        
        // Rough estimation - 1KB per object
        if (typeof data === 'object') {
            return JSON.stringify(data).length;
        }
        
        return String(data).length;
    }
    
    // ===== Public API =====
    
    /**
     * Get plugin statistics
     */
    public getStatistics(): PluginStatistics {
        return { ...this.stats };
    }
    
    /**
     * Get plugin health status
     */
    public getHealthStatus(): PluginHealthStatus {
        return { ...this.healthStatus };
    }
    
    /**
     * Reset plugin statistics
     */
    public resetStatistics(): void {
        this.initializeStats();
        this.processingTimes = [];
        this.errorHistory = [];
        this.initializeHealthStatus();
    }
    
    /**
     * Cancel all active operations
     */
    public cancelAllOperations(): void {
        for (const [operationId, deferred] of this.activeOperations) {
            deferred.reject(new Error('Operation cancelled by plugin shutdown'));
        }
        this.activeOperations.clear();
    }
    
    /**
     * Get plugin configuration tuple
     */
    public getConfigTuple(): PluginConfigTuple {
        return this.config.configTuple;
    }
    
    /**
     * Get plugin error info as tuple
     */
    public getErrorInfoTuple(): ErrorInfoTuple {
        const lastError = this.errorHistory[this.errorHistory.length - 1];
        if (!lastError) {
            return ['NONE', true, 0, false] as const;
        }
        
        return [
            'PARSE_ERROR',
            lastError.recoverable,
            this.config.retryStrategy.baseDelayMs,
            this.config.configTuple[4] !== FallbackStrategy.NONE
        ] as const;
    }
    
    // ===== Utility Methods =====
    
    /**
     * Create timeout promise
     */
    private createTimeoutPromise(timeoutMs: number): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
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
        this.log(`Shutting down plugin ${this.config.name}`);
        
        // Cancel active operations
        this.cancelAllOperations();
        
        // Reset state
        this.initialized = false;
        
        super.onunload();
        this.log(`Plugin ${this.config.name} shut down`);
    }
    
    /**
     * Log message if debug is enabled
     */
    protected log(message: string): void {
        if (this.config.debug) {
            console.log(`[${this.config.name}] ${message}`);
        }
    }
}

/**
 * Plugin factory type for creating plugin instances
 */
export type ParserPluginFactory<T extends ParserPlugin = ParserPlugin> = (
    app: App,
    eventManager: ParseEventManager,
    config: Partial<ParserPluginConfig>
) => T;

/**
 * Plugin registration helper
 */
export interface PluginRegistration<T extends ParserPlugin = ParserPlugin> {
    type: ParserPluginType;
    factory: ParserPluginFactory<T>;
    config: Partial<ParserPluginConfig>;
}

/**
 * Utility functions for plugin management
 */
export namespace PluginUtils {
    /**
     * Create standard plugin configuration tuple
     */
    export function createConfigTuple(
        priority = 1,
        retryCount = 3,
        timeoutMs = 30000,
        enableCache = true,
        fallbackStrategy = FallbackStrategy.CACHE
    ): PluginConfigTuple {
        return [priority, retryCount, timeoutMs, enableCache, fallbackStrategy] as const;
    }
    
    /**
     * Validate plugin configuration
     */
    export function validateConfig(config: ParserPluginConfig): string[] {
        const errors: string[] = [];
        
        if (!config.type || !config.name) {
            errors.push('Plugin type and name are required');
        }
        
        const [priority, retryCount, timeoutMs] = config.configTuple;
        if (priority < 0 || retryCount < 0 || timeoutMs < 0) {
            errors.push('Configuration values must be non-negative');
        }
        
        if (config.retryStrategy.maxAttempts < 1) {
            errors.push('Retry strategy must allow at least 1 attempt');
        }
        
        return errors;
    }
}