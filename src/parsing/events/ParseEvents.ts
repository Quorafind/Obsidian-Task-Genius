/**
 * Parse Event System
 * 
 * Provides type-safe event definitions for the Obsidian event system.
 * Uses app.metadataCache.trigger() and app.metadataCache.on() for communication.
 */

import { Task, TgProject } from '../../types/task';
import { ParseResult, ParseStatistics } from '../types/ParsingTypes';

/**
 * Parse event types for Obsidian event system
 * These correspond to events triggered via app.metadataCache.trigger()
 */
export const ParseEventType = {
    // Core parsing lifecycle
    PARSE_STARTED: 'parse:started',
    PARSE_COMPLETED: 'parse:completed', 
    PARSE_FAILED: 'parse:failed',
    PARSE_RETRIED: 'parse:retried',
    PARSE_BATCH_STARTED: 'parse:batch:started',
    PARSE_BATCH_COMPLETED: 'parse:batch:completed',
    
    // Task parsing events
    TASKS_PARSED: 'tasks:parsed',
    TASKS_ENRICHED: 'tasks:enriched',
    TASKS_VALIDATED: 'tasks:validated',
    
    // Project detection events
    PROJECT_DETECTED: 'project:detected',
    PROJECT_CONFIG_LOADED: 'project:config:loaded',
    PROJECT_CONFIG_UPDATED: 'project:config:updated',
    PROJECT_CONFIG_CHANGED: 'project:config:changed',
    PROJECT_DATA_CACHED: 'project:data:cached',
    PROJECT_CACHE_INVALIDATED: 'project:cache:invalidated',
    
    // Metadata events
    METADATA_LOADED: 'metadata:loaded',
    METADATA_ENRICHED: 'metadata:enriched',
    METADATA_MAPPED: 'metadata:mapped',
    
    // Cache events
    CACHE_HIT: 'cache:hit',
    CACHE_MISS: 'cache:miss',
    CACHE_INVALIDATED: 'cache:invalidated',
    CACHE_EVICTED: 'cache:evicted',
    CACHE_OPTIMIZED: 'cache:optimized',
    CACHE_BULK_OPTIMIZED: 'cache:bulk_optimized',
    
    // Batch processing events
    BATCH_STARTED: 'batch:started',
    BATCH_COMPLETED: 'batch:completed',
    BATCH_FAILED: 'batch:failed',
    
    // File system events
    FILE_CHANGED: 'file:changed',
    FILE_DELETED: 'file:deleted',
    FILE_RENAMED: 'file:renamed',
    
    // Performance events
    PERFORMANCE_STATS: 'performance:stats',
    MEMORY_WARNING: 'memory:warning',
    
    // Worker events
    WORKER_STARTED: 'worker:started',
    WORKER_TERMINATED: 'worker:terminated',
    WORKER_ERROR: 'worker:error',
    
    // Enhanced async workflow events
    WORKFLOW_STARTED: 'workflow:started',
    WORKFLOW_COMPLETED: 'workflow:completed', 
    WORKFLOW_FAILED: 'workflow:failed',
    PARSING_STARTED: 'parsing:started',
    PARSING_COMPLETED: 'parsing:completed',
    DEPENDENCY_CHECK: 'dependency:check',
    VALIDATION_STARTED: 'validation:started',
    VALIDATION_COMPLETED: 'validation:completed',
    UPDATE_STARTED: 'update:started',
    UPDATE_COMPLETED: 'update:completed',
    CACHE_UPDATED: 'cache:updated',
    INDEX_UPDATED: 'index:updated',
    UI_REFRESH_NEEDED: 'ui:refresh_needed',
    
    // Orchestration events
    ORCHESTRATION_STARTED: 'orchestration:started',
    ORCHESTRATION_PROGRESS: 'orchestration:progress',
    ORCHESTRATION_COMPLETED: 'orchestration:completed',
    
    // System health events
    SYSTEM_HEALTH_CHECK: 'system:health_check'
} as const;

export type ParseEventType = typeof ParseEventType[keyof typeof ParseEventType];

// ===== Event Data Interfaces =====

/**
 * Base event data structure
 */
export interface BaseEventData {
    /** Event timestamp */
    timestamp: number;
    /** Source component */
    source: string;
    /** Correlation ID for tracing */
    correlationId?: string;
}

/**
 * Parse started event data
 */
export interface ParseStartedEventData extends BaseEventData {
    filePath: string;
    fileType: string;
    priority: number;
}

/**
 * Parse completed event data
 */
export interface ParseCompletedEventData extends BaseEventData {
    filePath: string;
    result: ParseResult;
    fromCache: boolean;
}

/**
 * Parse failed event data
 */
export interface ParseFailedEventData extends BaseEventData {
    filePath: string;
    error: {
        message: string;
        code: string;
        recoverable: boolean;
    };
    retryAttempt: number;
}

/**
 * Batch parse started event data
 */
export interface BatchParseStartedEventData extends BaseEventData {
    fileCount: number;
    totalSize: number;
    priority: number;
}

/**
 * Batch parse completed event data  
 */
export interface BatchParseCompletedEventData extends BaseEventData {
    results: {
        successful: number;
        failed: number;
        cached: number;
        totalTime: number;
    };
}

/**
 * Tasks parsed event data
 */
export interface TasksParsedEventData extends BaseEventData {
    filePath: string;
    tasks: Task[];
    stats: {
        totalTasks: number;
        completedTasks: number;
        processingTime: number;
    };
}

/**
 * Tasks enriched event data
 */
export interface TasksEnrichedEventData extends BaseEventData {
    filePath: string;
    tasks: Task[];
    enrichments: {
        project?: TgProject;
        metadata?: Record<string, any>;
        additionalFields?: string[];
    };
}

/**
 * Tasks validated event data
 */
export interface TasksValidatedEventData extends BaseEventData {
    filePath: string;
    validTasks: Task[];
    invalidTasks: Array<{
        task: Task;
        validationErrors: string[];
    }>;
}

/**
 * Project detected event data
 */
export interface ProjectDetectedEventData extends BaseEventData {
    filePath: string;
    project: TgProject;
    detectionMethod: 'path' | 'metadata' | 'config' | 'default';
    confidence: number;
}

/**
 * Project config loaded event data
 */
export interface ProjectConfigLoadedEventData extends BaseEventData {
    configPath: string;
    config: Record<string, any>;
    isValid: boolean;
}

/**
 * Project config updated event data
 */
export interface ProjectConfigUpdatedEventData extends BaseEventData {
    configPath: string;
    config: Record<string, any>;
    changes: string[];
}

/**
 * Project config changed event data
 */
export interface ProjectConfigChangedEventData extends BaseEventData {
    configPath: string;
    oldConfig?: Record<string, any>;
    newConfig: Record<string, any>;
    affectedFiles: string[];
}

/**
 * Project data cached event data
 */
export interface ProjectDataCachedEventData extends BaseEventData {
    projectPath: string;
    dataSize: number;
    cacheKey: string;
}

/**
 * Project cache invalidated event data
 */
export interface ProjectCacheInvalidatedEventData extends BaseEventData {
    reason: 'config_change' | 'file_change' | 'manual' | 'memory_pressure';
    affectedFiles: string[];
    cacheSize: number;
}

/**
 * Metadata loaded event data
 */
export interface MetadataLoadedEventData extends BaseEventData {
    filePath: string;
    metadata: Record<string, any>;
    source: 'frontmatter' | 'obsidian_cache' | 'computed';
}

/**
 * Metadata enriched event data
 */
export interface MetadataEnrichedEventData extends BaseEventData {
    filePath: string;
    originalMetadata: Record<string, any>;
    enrichedMetadata: Record<string, any>;
    mappingsApplied: Array<{
        sourceKey: string;
        targetKey: string;
        value: any;
    }>;
}

/**
 * Metadata mapped event data
 */
export interface MetadataMappedEventData extends BaseEventData {
    filePath: string;
    mappings: Array<{
        sourceKey: string;
        targetKey: string;
        oldValue: any;
        newValue: any;
    }>;
}

/**
 * Cache hit event data
 */
export interface CacheHitEventData extends BaseEventData {
    cacheKey: string;
    cacheType: string;
    hitRatio: number;
}

/**
 * Cache miss event data
 */
export interface CacheMissEventData extends BaseEventData {
    cacheKey: string;
    cacheType: string;
    reason: 'not_found' | 'expired' | 'invalid_mtime';
}

/**
 * Cache invalidated event data
 */
export interface CacheInvalidatedEventData extends BaseEventData {
    cacheKeys: string[];
    cacheType: string;
    reason: 'file_change' | 'manual' | 'ttl_expired' | 'memory_pressure';
}

/**
 * Cache evicted event data
 */
export interface CacheEvictedEventData extends BaseEventData {
    evictedKeys: string[];
    cacheType: string;
    strategy: 'lru' | 'ttl' | 'memory_pressure';
    totalEvicted: number;
}

/**
 * File changed event data
 */
export interface FileChangedEventData extends BaseEventData {
    filePath: string;
    changeType: 'content' | 'metadata' | 'rename' | 'delete';
    oldPath?: string; // For rename events
}

/**
 * Performance stats event data
 */
export interface PerformanceStatsEventData extends BaseEventData {
    stats: ParseStatistics;
    memoryUsage: {
        used: number;
        total: number;
        percentage: number;
    };
}

/**
 * Memory warning event data
 */
export interface MemoryWarningEventData extends BaseEventData {
    memoryUsage: number;
    threshold: number;
    recommendation: 'clear_cache' | 'reduce_workers' | 'defer_operations';
}

/**
 * Worker started event data
 */
export interface WorkerStartedEventData extends BaseEventData {
    workerId: number;
    workerType: string;
    totalWorkers: number;
}

/**
 * Worker terminated event data
 */
export interface WorkerTerminatedEventData extends BaseEventData {
    workerId: number;
    workerType: string;
    reason: 'normal' | 'error' | 'timeout' | 'memory_limit';
    totalWorkers: number;
}

/**
 * Worker error event data
 */
export interface WorkerErrorEventData extends BaseEventData {
    workerId: number;
    workerType: string;
    error: {
        message: string;
        stack?: string;
        recoverable: boolean;
    };
    retryAttempt: number;
}

/**
 * Workflow started event data
 */
export interface WorkflowStartedEventData extends BaseEventData {
    filePath: string;
    workflowType: 'parse' | 'reparse' | 'validate' | 'update';
    priority: 'low' | 'normal' | 'high' | 'critical';
}

/**
 * Workflow completed event data
 */
export interface WorkflowCompletedEventData extends BaseEventData {
    filePath: string;
    workflowType: 'parse' | 'reparse' | 'validate' | 'update';
    duration: number;
    success: boolean;
    result: any;
}

/**
 * Workflow failed event data
 */
export interface WorkflowFailedEventData extends BaseEventData {
    filePath: string;
    workflowType: 'parse' | 'reparse' | 'validate' | 'update';
    duration: number;
    error: string;
}

/**
 * Parsing started event data (enhanced)
 */
export interface ParsingStartedEventData extends BaseEventData {
    filePath: string;
    parseType: 'async_workflow' | 'sync' | 'batch';
}

/**
 * Parsing completed event data (enhanced)
 */
export interface ParsingCompletedEventData extends BaseEventData {
    filePath: string;
    result: any;
    cached: boolean;
}

/**
 * Dependency check event data
 */
export interface DependencyCheckEventData extends BaseEventData {
    filePath: string;
    dependencies: string[];
    checkType: 'async_task_flow' | 'batch' | 'validation';
}

/**
 * Validation started event data
 */
export interface ValidationStartedEventData extends BaseEventData {
    filePath: string;
    validationType: 'async_workflow' | 'batch' | 'manual';
}

/**
 * Validation completed event data
 */
export interface ValidationCompletedEventData extends BaseEventData {
    filePath: string;
    result: {
        isValid: boolean;
        issues: string[];
        checkedRules: string[];
    };
}

/**
 * Update started event data
 */
export interface UpdateStartedEventData extends BaseEventData {
    filePath: string;
    updateType: 'async_workflow' | 'batch' | 'manual';
}

/**
 * Update completed event data
 */
export interface UpdateCompletedEventData extends BaseEventData {
    filePath: string;
    result: {
        updated: boolean;
        changes: number;
        backupCreated: boolean;
    };
}

/**
 * Cache updated event data
 */
export interface CacheUpdatedEventData extends BaseEventData {
    filePath: string;
    entriesAdded: number;
    source: string;
}

/**
 * Index updated event data
 */
export interface IndexUpdatedEventData extends BaseEventData {
    filePath: string;
    changeType: 'parse' | 'reparse' | 'validate' | 'update';
}

/**
 * UI refresh needed event data
 */
export interface UIRefreshNeededEventData extends BaseEventData {
    filePath: string;
    reason: string;
}

/**
 * Orchestration started event data
 */
export interface OrchestrationStartedEventData extends BaseEventData {
    totalWorkflows: number;
    maxConcurrency: number;
}

/**
 * Orchestration progress event data
 */
export interface OrchestrationProgressEventData extends BaseEventData {
    completed: number;
    total: number;
    currentBatch: number;
}

/**
 * Orchestration completed event data
 */
export interface OrchestrationCompletedEventData extends BaseEventData {
    successful: number;
    failed: number;
    totalDuration: number;
    totalWorkflows: number;
}

/**
 * System health check event data
 */
export interface SystemHealthCheckEventData extends BaseEventData {
    healthy: boolean;
    metrics: {
        eventQueueHealth: number;
        avgProcessingTime: number;
        errorRate: number;
        memoryPressure: number;
    };
    recommendations: string[];
}

// ===== Event Data Type Map =====

/**
 * Mapping of event types to their data interfaces for type safety
 */
export interface ParseEventDataMap {
    [ParseEventType.PARSE_STARTED]: ParseStartedEventData;
    [ParseEventType.PARSE_COMPLETED]: ParseCompletedEventData;
    [ParseEventType.PARSE_FAILED]: ParseFailedEventData;
    [ParseEventType.PARSE_BATCH_STARTED]: BatchParseStartedEventData;
    [ParseEventType.PARSE_BATCH_COMPLETED]: BatchParseCompletedEventData;
    
    [ParseEventType.TASKS_PARSED]: TasksParsedEventData;
    [ParseEventType.TASKS_ENRICHED]: TasksEnrichedEventData;
    [ParseEventType.TASKS_VALIDATED]: TasksValidatedEventData;
    
    [ParseEventType.PROJECT_DETECTED]: ProjectDetectedEventData;
    [ParseEventType.PROJECT_CONFIG_LOADED]: ProjectConfigLoadedEventData;
    [ParseEventType.PROJECT_CONFIG_UPDATED]: ProjectConfigUpdatedEventData;
    [ParseEventType.PROJECT_CONFIG_CHANGED]: ProjectConfigChangedEventData;
    [ParseEventType.PROJECT_DATA_CACHED]: ProjectDataCachedEventData;
    [ParseEventType.PROJECT_CACHE_INVALIDATED]: ProjectCacheInvalidatedEventData;
    
    [ParseEventType.METADATA_LOADED]: MetadataLoadedEventData;
    [ParseEventType.METADATA_ENRICHED]: MetadataEnrichedEventData;
    [ParseEventType.METADATA_MAPPED]: MetadataMappedEventData;
    
    [ParseEventType.CACHE_HIT]: CacheHitEventData;
    [ParseEventType.CACHE_MISS]: CacheMissEventData;
    [ParseEventType.CACHE_INVALIDATED]: CacheInvalidatedEventData;
    [ParseEventType.CACHE_EVICTED]: CacheEvictedEventData;
    
    [ParseEventType.FILE_CHANGED]: FileChangedEventData;
    [ParseEventType.FILE_DELETED]: FileChangedEventData;
    [ParseEventType.FILE_RENAMED]: FileChangedEventData;
    
    [ParseEventType.PERFORMANCE_STATS]: PerformanceStatsEventData;
    [ParseEventType.MEMORY_WARNING]: MemoryWarningEventData;
    
    [ParseEventType.WORKER_STARTED]: WorkerStartedEventData;
    [ParseEventType.WORKER_TERMINATED]: WorkerTerminatedEventData;
    [ParseEventType.WORKER_ERROR]: WorkerErrorEventData;
    
    // Enhanced async workflow events
    [ParseEventType.WORKFLOW_STARTED]: WorkflowStartedEventData;
    [ParseEventType.WORKFLOW_COMPLETED]: WorkflowCompletedEventData;
    [ParseEventType.WORKFLOW_FAILED]: WorkflowFailedEventData;
    [ParseEventType.PARSING_STARTED]: ParsingStartedEventData;
    [ParseEventType.PARSING_COMPLETED]: ParsingCompletedEventData;
    [ParseEventType.DEPENDENCY_CHECK]: DependencyCheckEventData;
    [ParseEventType.VALIDATION_STARTED]: ValidationStartedEventData;
    [ParseEventType.VALIDATION_COMPLETED]: ValidationCompletedEventData;
    [ParseEventType.UPDATE_STARTED]: UpdateStartedEventData;
    [ParseEventType.UPDATE_COMPLETED]: UpdateCompletedEventData;
    [ParseEventType.CACHE_UPDATED]: CacheUpdatedEventData;
    [ParseEventType.INDEX_UPDATED]: IndexUpdatedEventData;
    [ParseEventType.UI_REFRESH_NEEDED]: UIRefreshNeededEventData;
    
    // Orchestration events
    [ParseEventType.ORCHESTRATION_STARTED]: OrchestrationStartedEventData;
    [ParseEventType.ORCHESTRATION_PROGRESS]: OrchestrationProgressEventData;
    [ParseEventType.ORCHESTRATION_COMPLETED]: OrchestrationCompletedEventData;
    
    // System health events
    [ParseEventType.SYSTEM_HEALTH_CHECK]: SystemHealthCheckEventData;
}

/**
 * Type-safe event listener function
 */
export type ParseEventListener<T extends ParseEventType> = (
    eventData: ParseEventDataMap[T]
) => void | Promise<void>;

/**
 * Helper function to create event data with standard fields
 */
export function createEventData<T extends ParseEventType>(
    type: T,
    source: string,
    data: Omit<ParseEventDataMap[T], keyof BaseEventData>
): ParseEventDataMap[T] {
    return {
        ...data,
        timestamp: Date.now(),
        source,
    } as ParseEventDataMap[T];
}