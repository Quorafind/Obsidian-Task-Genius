/**
 * Core types for the unified parsing system
 * 
 * High-performance, type-safe definitions following the existing codebase patterns.
 */

import { TFile, FileStats, App, Component } from 'obsidian';
import { Task, TgProject } from '../../types/task';

/**
 * Parser plugin types (expandable)
 */
export type ParserPluginType = 
    | 'markdown'
    | 'canvas' 
    | 'metadata'
    | 'ics'
    | 'project';

/**
 * Parse priority levels for queue management
 */
export enum ParsePriority {
    HIGH = 0,    // User interactions, immediate UI updates
    NORMAL = 1,  // Standard file parsing
    LOW = 2,     // Background batch operations
    BULK = 3     // Large-scale operations
}

/**
 * Cache types for type-safe cache operations
 */
export enum CacheType {
    TASKS = 'tasks',
    METADATA = 'metadata',
    PROJECT_CONFIG = 'project_config',
    PROJECT_DATA = 'project_data',
    PROJECT_DETECTION = 'project_detection',
    PARSED_CONTENT = 'parsed_content',
    FILE_STATS = 'file_stats'
}

/**
 * Parse event types for Obsidian event system
 */
export enum ParseEventType {
    // Core parsing events
    PARSE_STARTED = 'parse:started',
    PARSE_COMPLETED = 'parse:completed',
    PARSE_FAILED = 'parse:failed',
    
    // Task events
    TASKS_PARSED = 'tasks:parsed',
    TASKS_ENRICHED = 'tasks:enriched',
    
    // Project events
    PROJECT_DETECTED = 'project:detected',
    PROJECT_CONFIG_CHANGED = 'project:config:changed',
    
    // Metadata events
    METADATA_LOADED = 'metadata:loaded',
    METADATA_ENRICHED = 'metadata:enriched',
    
    // Cache events
    CACHE_HIT = 'cache:hit',
    CACHE_MISS = 'cache:miss',
    CACHE_INVALIDATED = 'cache:invalidated',
    
    // File events
    FILE_CHANGED = 'file:changed',
    FILE_DELETED = 'file:deleted'
}

/**
 * Cache entry with validation and metadata
 */
export interface CacheEntry<T> {
    /** Cached data */
    data: T;
    /** Creation timestamp */
    timestamp: number;
    /** File modification time for validation */
    mtime?: number;
    /** Data dependencies for invalidation */
    dependencies?: string[];
    /** Entry TTL */
    ttl?: number;
    /** Access count for LRU */
    accessCount: number;
    /** Last access timestamp */
    lastAccess: number;
    /** Access history for pattern analysis (optional, used by enhanced LRU) */
    accessHistory?: number[];
}

/**
 * Parse context for plugin execution
 */
export interface ParseContext {
    /** File path being parsed */
    filePath: string;
    /** File type/extension */
    fileType: string;
    /** File content */
    content: string;
    /** File statistics */
    stats?: FileStats;
    /** File metadata from Obsidian cache */
    metadata?: Record<string, any>;
    /** Project configuration data */
    projectConfig?: Record<string, any>;
    /** Enhanced project information */
    tgProject?: TgProject;
    /** Cache manager instance */
    cacheManager: import('../core/UnifiedCacheManager').UnifiedCacheManager;
    /** App instance for Obsidian API access */
    app: App;
    /** Processing priority */
    priority: ParsePriority;
    /** Correlation ID for tracking */
    correlationId?: string;
}

/**
 * Parse result from plugin execution
 */
export interface ParseResult<T = any> {
    /** Result type for type safety */
    type: 'success' | 'error' | 'cached';
    /** Parsed data */
    data?: T;
    /** Error information if failed */
    error?: {
        message: string;
        code: string;
        details?: any;
        recoverable: boolean;
    };
    /** Performance statistics */
    stats: {
        processingTimeMs: number;
        cacheHit: boolean;
        memoryUsed?: number;
        itemCount?: number;
    };
    /** Source plugin information */
    source: {
        plugin: ParserPluginType;
        version: string;
        fromCache: boolean;
    };
    /** Result metadata */
    metadata?: {
        confidence: number;
        fallbackUsed: boolean;
        warnings?: string[];
    };
}

/**
 * Task parse result (specific to task parsing)
 */
export interface TaskParseResult extends ParseResult<Task[]> {
    /** Parsed tasks */
    data: Task[];
    /** Task-specific statistics */
    taskStats: {
        totalTasks: number;
        completedTasks: number;
        enrichedTasks: number;
        projectTasks: number;
    };
}

/**
 * Project detection result
 */
export interface ProjectParseResult extends ParseResult<TgProject> {
    /** Detected project */
    data?: TgProject;
    /** Detection source */
    detectionSource: 'path' | 'metadata' | 'config' | 'default' | 'cache';
    /** Confidence score (0-1) */
    confidence: number;
}

/**
 * Project detection strategy interface
 */
export interface ProjectDetectionStrategy {
    /** Strategy name */
    readonly name: string;
    /** Strategy priority (lower = higher priority) */
    readonly priority: number;
    /** Detect project from context */
    detect(context: ParseContext): Promise<TgProject | undefined>;
    /** Validate detection result */
    validate(project: TgProject, context: ParseContext): boolean;
}

/**
 * Parse statistics for monitoring
 */
export interface ParseStatistics {
    /** Total operations */
    totalOperations: number;
    /** Successful operations */
    successfulOperations: number;
    /** Failed operations */
    failedOperations: number;
    /** Cache statistics */
    cache: {
        hits: number;
        misses: number;
        hitRatio: number;
        evictions: number;
        memoryUsage: number;
    };
    /** Performance metrics */
    performance: {
        avgProcessingTime: number;
        maxProcessingTime: number;
        minProcessingTime: number;
        totalProcessingTime: number;
    };
    /** Plugin-specific statistics */
    plugins: Record<ParserPluginType, {
        operations: number;
        avgTime: number;
        errorRate: number;
    }>;
}

/**
 * Parser configuration options
 */
export interface ParserConfig {
    /** Cache configuration */
    cache: {
        maxSize: number;
        ttlMs: number;
        enableLRU: boolean;
        enableMtimeValidation: boolean;
    };
    /** Worker configuration */
    workers: {
        maxWorkers: number;
        cpuUtilization: number;
        enableWorkers: boolean;
    };
    /** Plugin configuration */
    plugins: {
        enabled: ParserPluginType[];
        fallbackEnabled: boolean;
        retryAttempts: number;
    };
    /** Performance tuning */
    performance: {
        batchSize: number;
        concurrencyLimit: number;
        enableStatistics: boolean;
        enableProfiling: boolean;
    };
    /** Project detection */
    project: {
        enableDetection: boolean;
        strategies: string[];
        cacheDetection: boolean;
    };
}

/**
 * Deferred promise pattern (matching existing codebase)
 */
export interface Deferred<T> extends Promise<T> {
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
    readonly promise: Promise<T>;
}

/**
 * Worker message types (for type-safe worker communication)
 */
export type WorkerMessage = 
    | ParseTaskMessage
    | BatchParseMessage
    | CacheInvalidateMessage
    | StatsRequestMessage;

export interface ParseTaskMessage {
    type: 'parseTask';
    id: string;
    context: Omit<ParseContext, 'cacheManager' | 'app'>;
    pluginType: ParserPluginType;
}

export interface BatchParseMessage {
    type: 'batchParse';
    id: string;
    contexts: Array<Omit<ParseContext, 'cacheManager' | 'app'>>;
    pluginType: ParserPluginType;
}

export interface CacheInvalidateMessage {
    type: 'cacheInvalidate';
    id: string;
    pattern: string;
    cacheType: CacheType;
}

export interface StatsRequestMessage {
    type: 'statsRequest';
    id: string;
}

/**
 * Worker response types
 */
export type WorkerResponse = 
    | ParseTaskResponse
    | BatchParseResponse
    | ErrorResponse
    | StatsResponse;

export interface ParseTaskResponse {
    type: 'parseTaskResult';
    id: string;
    result: ParseResult;
}

export interface BatchParseResponse {
    type: 'batchParseResult';
    id: string;
    results: ParseResult[];
}

export interface ErrorResponse {
    type: 'error';
    id: string;
    error: string;
    recoverable: boolean;
}

export interface StatsResponse {
    type: 'statsResult';
    id: string;
    stats: ParseStatistics;
}

/**
 * Plugin factory function type
 */
export type PluginFactory<T extends Component = Component> = (
    app: App,
    eventManager: import('../core/ParseEventManager').ParseEventManager,
    config: any
) => T;

/**
 * Cache strategy interface
 */
export interface CacheStrategy {
    /** Strategy name */
    readonly name: string;
    /** Determine if entry should be evicted */
    shouldEvict(entry: CacheEntry<any>, context: { memoryPressure: number; maxSize: number }): boolean;
    /** Calculate entry priority for eviction */
    calculatePriority(entry: CacheEntry<any>): number;
    /** Update entry on access */
    onAccess(entry: CacheEntry<any>): void;
}

/**
 * Type guards for runtime type checking
 */
export function isParseResult(obj: any): obj is ParseResult {
    return obj && 
           typeof obj === 'object' && 
           ['success', 'error', 'cached'].includes(obj.type) &&
           obj.stats &&
           typeof obj.stats.processingTimeMs === 'number';
}

export function isTaskParseResult(obj: any): obj is TaskParseResult {
    return isParseResult(obj) && 
           Array.isArray(obj.data) &&
           obj.taskStats &&
           typeof obj.taskStats.totalTasks === 'number';
}

export function isProjectParseResult(obj: any): obj is ProjectParseResult {
    return isParseResult(obj) &&
           typeof obj.confidence === 'number' &&
           typeof obj.detectionSource === 'string';
}