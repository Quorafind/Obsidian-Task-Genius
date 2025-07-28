/**
 * Parse Context Factory
 * 
 * High-performance context management with type-safe serialization for workers.
 * Provides efficient serialization/deserialization for worker communication.
 * 
 * Features:
 * - Type-safe serialization patterns
 * - Circular reference detection and handling
 * - Optimized object pooling
 * - Context validation and sanitization
 * - Worker-safe data transfer
 */

import { App, TFile, FileStats, Component } from 'obsidian';
import { 
    ParseContext, 
    ParsePriority, 
    ParserPluginType,
    isParseResult 
} from '../types/ParsingTypes';
import { TgProject } from '../../types/task';
import { UnifiedCacheManager } from './UnifiedCacheManager';

/**
 * Serializable context for worker communication
 * Excludes non-serializable fields like app and cacheManager
 */
export interface SerializableParseContext {
    filePath: string;
    fileType: string;
    content: string;
    stats?: {
        mtime: number;
        ctime: number;
        size: number;
    };
    metadata?: Record<string, any>;
    projectConfig?: Record<string, any>;
    tgProject?: {
        id: string;
        name: string;
        path: string;
        config?: Record<string, any>;
    };
    priority: ParsePriority;
    correlationId?: string;
    serializationVersion: number;
    timestamp: number;
}

/**
 * Context validation result
 */
export interface ContextValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    sanitized?: Partial<ParseContext>;
}

/**
 * Context factory configuration
 */
export interface ParseContextFactoryConfig {
    /** Enable object pooling for contexts */
    enablePooling: boolean;
    /** Maximum pool size */
    maxPoolSize: number;
    /** Enable validation */
    enableValidation: boolean;
    /** Enable debug logging */
    debug: boolean;
    /** Serialization version */
    serializationVersion: number;
}

/**
 * Default factory configuration
 */
export const DEFAULT_CONTEXT_CONFIG: ParseContextFactoryConfig = {
    enablePooling: true,
    maxPoolSize: 50,
    enableValidation: true,
    debug: false,
    serializationVersion: 1
};

/**
 * Object pool for context instances
 */
class ParseContextPool {
    private pool: ParseContext[] = [];
    private readonly maxSize: number;
    
    constructor(maxSize = 50) {
        this.maxSize = maxSize;
    }
    
    acquire(app: App, cacheManager: UnifiedCacheManager): ParseContext {
        const context = this.pool.pop();
        if (context) {
            // Reset context with new references
            (context as any).app = app;
            (context as any).cacheManager = cacheManager;
            return context;
        }
        
        // Create new context if pool is empty
        return {
            filePath: '',
            fileType: '',
            content: '',
            app,
            cacheManager,
            priority: ParsePriority.NORMAL
        };
    }
    
    release(context: ParseContext): void {
        if (this.pool.length < this.maxSize) {
            // Clear context data but keep structure
            context.filePath = '';
            context.fileType = '';
            context.content = '';
            context.stats = undefined;
            context.metadata = undefined;
            context.projectConfig = undefined;
            context.tgProject = undefined;
            context.correlationId = undefined;
            
            this.pool.push(context);
        }
    }
    
    clear(): void {
        this.pool = [];
    }
    
    getStats(): { poolSize: number; maxSize: number } {
        return {
            poolSize: this.pool.length,
            maxSize: this.maxSize
        };
    }
}

/**
 * Parse Context Factory
 * 
 * Manages context creation, serialization, and pooling for high-performance parsing.
 * Provides type-safe serialization for worker communication.
 * 
 * @example
 * ```typescript
 * const factory = new ParseContextFactory(app, cacheManager);
 * 
 * // Create context from file
 * const context = await factory.createFromFile(file, ParsePriority.HIGH);
 * 
 * // Serialize for worker
 * const serialized = factory.serialize(context);
 * 
 * // Send to worker and deserialize
 * const deserializedContext = factory.deserialize(serialized, app, cacheManager);
 * 
 * // Release back to pool
 * factory.release(context);
 * ```
 */
export class ParseContextFactory extends Component {
    private app: App;
    private cacheManager: UnifiedCacheManager;
    private config: ParseContextFactoryConfig;
    private contextPool: ParseContextPool;
    
    /** Context validation cache */
    private validationCache = new Map<string, ContextValidationResult>();
    
    /** Statistics */
    private stats = {
        created: 0,
        serialized: 0,
        deserialized: 0,
        validationErrors: 0,
        poolHits: 0,
        poolMisses: 0
    };
    
    constructor(
        app: App, 
        cacheManager: UnifiedCacheManager, 
        config: Partial<ParseContextFactoryConfig> = {}
    ) {
        super();
        this.app = app;
        this.cacheManager = cacheManager;
        this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
        this.contextPool = new ParseContextPool(this.config.maxPoolSize);
    }
    
    /**
     * Create context from TFile with optimized metadata loading
     */
    public async createFromFile(
        file: TFile, 
        priority = ParsePriority.NORMAL,
        correlationId?: string
    ): Promise<ParseContext> {
        const startTime = performance.now();
        
        try {
            // Get context from pool or create new
            const context = this.config.enablePooling ? 
                this.contextPool.acquire(this.app, this.cacheManager) :
                {
                    app: this.app,
                    cacheManager: this.cacheManager,
                    filePath: '',
                    fileType: '',
                    content: '',
                    priority: ParsePriority.NORMAL
                };
            
            if (this.config.enablePooling && context !== undefined) {
                this.stats.poolHits++;
            } else {
                this.stats.poolMisses++;
            }
            
            // Set basic properties
            context.filePath = file.path;
            context.fileType = file.extension;
            context.priority = priority;
            context.correlationId = correlationId;
            
            // Load file content efficiently
            context.content = await this.app.vault.cachedRead(file);
            
            // Get file stats
            context.stats = file.stat;
            
            // Load metadata from Obsidian cache (optimized)
            const cachedMetadata = this.app.metadataCache.getFileCache(file);
            if (cachedMetadata?.frontmatter) {
                context.metadata = { ...cachedMetadata.frontmatter };
            }
            
            // Try to load project information from cache first
            const projectCacheKey = `project:${file.path}`;
            const cachedProject = this.cacheManager.get<TgProject>(
                projectCacheKey, 
                'project_detection' as any
            );
            
            if (cachedProject) {
                context.tgProject = cachedProject;
            }
            
            // Validate context if enabled
            if (this.config.enableValidation) {
                const validation = this.validateContext(context);
                if (!validation.isValid) {
                    this.stats.validationErrors++;
                    this.log(`Context validation failed for ${file.path}: ${validation.errors.join(', ')}`);
                    
                    // Apply sanitization if available
                    if (validation.sanitized) {
                        Object.assign(context, validation.sanitized);
                    }
                }
            }
            
            this.stats.created++;
            return context;
            
        } catch (error) {
            this.log(`Failed to create context for ${file.path}: ${error.message}`);
            throw error;
        } finally {
            this.log(`Context creation took ${performance.now() - startTime}ms`);
        }
    }
    
    /**
     * Create context from path string (for worker scenarios)
     */
    public async createFromPath(
        filePath: string,
        priority = ParsePriority.NORMAL,
        correlationId?: string
    ): Promise<ParseContext> {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            throw new Error(`File not found or not a TFile: ${filePath}`);
        }
        
        return this.createFromFile(file, priority, correlationId);
    }
    
    /**
     * Serialize context for worker communication (type-safe)
     */
    public serialize(context: ParseContext): SerializableParseContext {
        const startTime = performance.now();
        
        try {
            // Create serializable representation
            const serializable: SerializableParseContext = {
                filePath: context.filePath,
                fileType: context.fileType,
                content: context.content,
                priority: context.priority,
                serializationVersion: this.config.serializationVersion,
                timestamp: Date.now()
            };
            
            // Add optional fields if present
            if (context.stats) {
                serializable.stats = {
                    mtime: context.stats.mtime,
                    ctime: context.stats.ctime,
                    size: context.stats.size
                };
            }
            
            if (context.metadata) {
                // Deep clone to avoid mutation and handle circular references
                serializable.metadata = this.safeClone(context.metadata);
            }
            
            if (context.projectConfig) {
                serializable.projectConfig = this.safeClone(context.projectConfig);
            }
            
            if (context.tgProject) {
                // Serialize project with essential fields only
                serializable.tgProject = {
                    id: context.tgProject.id,
                    name: context.tgProject.name,
                    path: context.tgProject.path,
                    config: context.tgProject.config ? 
                        this.safeClone(context.tgProject.config) : undefined
                };
            }
            
            if (context.correlationId) {
                serializable.correlationId = context.correlationId;
            }
            
            this.stats.serialized++;
            return serializable;
            
        } catch (error) {
            this.log(`Serialization failed for ${context.filePath}: ${error.message}`);
            throw new Error(`Context serialization failed: ${error.message}`);
        } finally {
            this.log(`Context serialization took ${performance.now() - startTime}ms`);
        }
    }
    
    /**
     * Deserialize context from worker response (type-safe)
     */
    public deserialize(
        serialized: SerializableParseContext,
        app: App,
        cacheManager: UnifiedCacheManager
    ): ParseContext {
        const startTime = performance.now();
        
        try {
            // Validate serialization version
            if (serialized.serializationVersion !== this.config.serializationVersion) {
                this.log(`Serialization version mismatch: expected ${this.config.serializationVersion}, got ${serialized.serializationVersion}`);
            }
            
            // Get context from pool or create new
            const context = this.config.enablePooling ? 
                this.contextPool.acquire(app, cacheManager) :
                {
                    app,
                    cacheManager,
                    filePath: '',
                    fileType: '',
                    content: '',
                    priority: ParsePriority.NORMAL
                };
            
            // Restore serialized data
            context.filePath = serialized.filePath;
            context.fileType = serialized.fileType;
            context.content = serialized.content;
            context.priority = serialized.priority;
            context.correlationId = serialized.correlationId;
            
            // Restore file stats if present
            if (serialized.stats) {
                context.stats = {
                    mtime: serialized.stats.mtime,
                    ctime: serialized.stats.ctime,
                    size: serialized.stats.size
                } as FileStats;
            }
            
            // Restore metadata
            if (serialized.metadata) {
                context.metadata = serialized.metadata;
            }
            
            // Restore project config
            if (serialized.projectConfig) {
                context.projectConfig = serialized.projectConfig;
            }
            
            // Restore project information
            if (serialized.tgProject) {
                context.tgProject = {
                    id: serialized.tgProject.id,
                    name: serialized.tgProject.name,
                    path: serialized.tgProject.path,
                    config: serialized.tgProject.config
                } as TgProject;
            }
            
            this.stats.deserialized++;
            return context;
            
        } catch (error) {
            this.log(`Deserialization failed for ${serialized.filePath}: ${error.message}`);
            throw new Error(`Context deserialization failed: ${error.message}`);
        } finally {
            this.log(`Context deserialization took ${performance.now() - startTime}ms`);
        }
    }
    
    /**
     * Validate context integrity and data safety
     */
    public validateContext(context: ParseContext): ContextValidationResult {
        const cacheKey = `${context.filePath}:${context.priority}:${Date.now()}`;
        const cached = this.validationCache.get(cacheKey);
        if (cached) return cached;
        
        const errors: string[] = [];
        const warnings: string[] = [];
        const sanitized: Partial<ParseContext> = {};
        
        // Required field validation
        if (!context.filePath) {
            errors.push('filePath is required');
        }
        
        if (!context.fileType) {
            errors.push('fileType is required');
        }
        
        if (context.content === undefined) {
            errors.push('content is required');
        }
        
        if (!context.app) {
            errors.push('app instance is required');
        }
        
        if (!context.cacheManager) {
            errors.push('cacheManager instance is required');
        }
        
        // Type validation
        if (typeof context.priority !== 'number' || 
            !Object.values(ParsePriority).includes(context.priority)) {
            errors.push('Invalid priority value');
            sanitized.priority = ParsePriority.NORMAL;
        }
        
        // Content size validation (warn for large files)
        if (context.content && context.content.length > 1024 * 1024) { // 1MB
            warnings.push('Large file content may impact performance');
        }
        
        // Metadata validation
        if (context.metadata && typeof context.metadata !== 'object') {
            errors.push('metadata must be an object');
            sanitized.metadata = {};
        }
        
        // Project validation
        if (context.tgProject && (!context.tgProject.id || !context.tgProject.name)) {
            warnings.push('tgProject missing required fields');
        }
        
        const result: ContextValidationResult = {
            isValid: errors.length === 0,
            errors,
            warnings,
            sanitized: Object.keys(sanitized).length > 0 ? sanitized : undefined
        };
        
        // Cache validation result briefly
        this.validationCache.set(cacheKey, result);
        if (this.validationCache.size > 100) {
            const oldestKey = this.validationCache.keys().next().value;
            this.validationCache.delete(oldestKey);
        }
        
        return result;
    }
    
    /**
     * Release context back to pool
     */
    public release(context: ParseContext): void {
        if (this.config.enablePooling) {
            this.contextPool.release(context);
        }
    }
    
    /**
     * Get factory statistics
     */
    public getStatistics(): {
        contextStats: typeof this.stats;
        poolStats: ReturnType<ParseContextPool['getStats']>;
        validationCacheSize: number;
    } {
        return {
            contextStats: { ...this.stats },
            poolStats: this.contextPool.getStats(),
            validationCacheSize: this.validationCache.size
        };
    }
    
    /**
     * Reset statistics
     */
    public resetStatistics(): void {
        this.stats = {
            created: 0,
            serialized: 0,
            deserialized: 0,
            validationErrors: 0,
            poolHits: 0,
            poolMisses: 0
        };
    }
    
    /**
     * Safe object cloning with circular reference detection
     */
    private safeClone<T>(obj: T, seen = new WeakSet()): T {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        
        if (seen.has(obj as any)) {
            return '[Circular Reference]' as any;
        }
        
        seen.add(obj as any);
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.safeClone(item, seen)) as any;
        }
        
        if (obj instanceof Date) {
            return new Date(obj.getTime()) as any;
        }
        
        if (obj instanceof RegExp) {
            return new RegExp(obj) as any;
        }
        
        const cloned: any = {};
        for (const [key, value] of Object.entries(obj)) {
            // Skip function properties and non-serializable objects
            if (typeof value === 'function') continue;
            if (value instanceof Node) continue; // DOM nodes
            if (value instanceof HTMLElement) continue; // HTML elements
            
            cloned[key] = this.safeClone(value, seen);
        }
        
        seen.delete(obj as any);
        return cloned;
    }
    
    /**
     * Component lifecycle: cleanup on unload
     */
    public onunload(): void {
        this.log('Shutting down context factory');
        
        // Clear pools and caches
        this.contextPool.clear();
        this.validationCache.clear();
        
        super.onunload();
        this.log('Context factory shut down');
    }
    
    /**
     * Log message if debug is enabled
     */
    private log(message: string): void {
        if (this.config.debug) {
            console.log(`[ParseContextFactory] ${message}`);
        }
    }
}

/**
 * Utility functions for context manipulation
 */
export namespace ParseContextUtils {
    /**
     * Check if object is a valid serializable context
     */
    export function isSerializableContext(obj: any): obj is SerializableParseContext {
        return obj &&
               typeof obj === 'object' &&
               typeof obj.filePath === 'string' &&
               typeof obj.fileType === 'string' &&
               typeof obj.content === 'string' &&
               typeof obj.priority === 'number' &&
               typeof obj.serializationVersion === 'number' &&
               typeof obj.timestamp === 'number';
    }
    
    /**
     * Extract essential fields for logging/debugging
     */
    export function getContextSummary(context: ParseContext): {
        filePath: string;
        fileType: string;
        contentLength: number;
        hasMetadata: boolean;
        hasProject: boolean;
        priority: ParsePriority;
        correlationId?: string;
    } {
        return {
            filePath: context.filePath,
            fileType: context.fileType,
            contentLength: context.content?.length || 0,
            hasMetadata: !!context.metadata,
            hasProject: !!context.tgProject,
            priority: context.priority,
            correlationId: context.correlationId
        };
    }
    
    /**
     * Create minimal context for testing
     */
    export function createTestContext(
        app: App,
        cacheManager: UnifiedCacheManager,
        overrides: Partial<ParseContext> = {}
    ): ParseContext {
        return {
            filePath: 'test.md',
            fileType: 'md',
            content: 'test content',
            app,
            cacheManager,
            priority: ParsePriority.NORMAL,
            ...overrides
        };
    }
}