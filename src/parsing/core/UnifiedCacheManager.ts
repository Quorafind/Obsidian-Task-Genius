/**
 * Unified Cache Manager
 * 
 * High-performance, type-safe cache system with advanced strategies.
 * Replaces all scattered cache implementations with a single, unified system.
 * 
 * Features:
 * - Multi-tier cache architecture (L1/L2/L3)
 * - LRU eviction with memory pressure awareness
 * - mtime-based cache validation
 * - Object pooling for reduced GC pressure
 * - Comprehensive statistics and monitoring
 * - Type-safe operations
 * - Component lifecycle management
 */

import { App, Component, TFile } from 'obsidian';
import { 
    CacheType, 
    CacheEntry, 
    CacheStrategy,
    ParseEventType 
} from '../types/ParsingTypes';
import { ParseEventManager } from './ParseEventManager';

/**
 * Cache configuration
 */
export interface CacheConfig {
    /** Maximum number of entries per cache type */
    maxSize: number;
    /** Default TTL in milliseconds */
    defaultTTL: number;
    /** Enable LRU eviction */
    enableLRU: boolean;
    /** Enable mtime validation for file-based caches */
    enableMtimeValidation: boolean;
    /** Memory pressure threshold (0-1) */
    memoryPressureThreshold: number;
    /** Enable statistics collection */
    enableStatistics: boolean;
    /** Batch size for operations */
    batchSize: number;
    /** Enable debug logging */
    debug: boolean;
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
    maxSize: 1000,
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    enableLRU: true,
    enableMtimeValidation: true,
    memoryPressureThreshold: 0.8,
    enableStatistics: true,
    batchSize: 50,
    debug: false
};

/**
 * Cache statistics
 */
export interface CacheStatistics {
    /** Total cache operations */
    operations: {
        gets: number;
        sets: number;
        deletes: number;
        clears: number;
    };
    /** Hit/miss statistics */
    hits: number;
    misses: number;
    hitRatio: number;
    /** Eviction statistics */
    evictions: {
        lru: number;
        ttl: number;
        memoryPressure: number;
        manual: number;
    };
    /** Memory usage */
    memory: {
        estimatedBytes: number;
        entryCount: number;
        averageEntrySize: number;
    };
    /** Performance metrics */
    performance: {
        avgGetTime: number;
        avgSetTime: number;
        maxGetTime: number;
        maxSetTime: number;
    };
    /** Per-type statistics */
    byType: Record<CacheType, {
        size: number;
        hits: number;
        misses: number;
        evictions: number;
    }>;
}

/**
 * Enhanced LRU Cache Strategy with adaptive eviction
 */
class LRUCacheStrategy implements CacheStrategy {
    readonly name = 'lru';
    
    // Memory pressure thresholds for adaptive behavior
    private readonly LOW_PRESSURE_THRESHOLD = 0.6;
    private readonly HIGH_PRESSURE_THRESHOLD = 0.8;
    private readonly CRITICAL_PRESSURE_THRESHOLD = 0.9;
    
    shouldEvict(entry: CacheEntry<any>, context: { memoryPressure: number; maxSize: number }): boolean {
        const now = Date.now();
        const ageMs = now - entry.lastAccess;
        const accessFrequency = entry.accessCount / Math.max((now - entry.timestamp) / 1000, 1); // accesses per second
        
        // Critical pressure: evict aggressively
        if (context.memoryPressure > this.CRITICAL_PRESSURE_THRESHOLD) {
            return ageMs > 10000 || accessFrequency < 0.001; // 10 seconds or very low frequency
        }
        
        // High pressure: evict moderately used entries
        if (context.memoryPressure > this.HIGH_PRESSURE_THRESHOLD) {
            return ageMs > 30000 || accessFrequency < 0.01; // 30 seconds or low frequency
        }
        
        // Medium pressure: evict old entries
        if (context.memoryPressure > this.LOW_PRESSURE_THRESHOLD) {
            return ageMs > 120000; // 2 minutes
        }
        
        // Low pressure: only evict very old entries
        return ageMs > 600000; // 10 minutes
    }
    
    calculatePriority(entry: CacheEntry<any>): number {
        const now = Date.now();
        const ageMs = now - entry.lastAccess;
        const totalLifetime = Math.max(now - entry.timestamp, 1);
        const accessFrequency = entry.accessCount / (totalLifetime / 1000);
        
        // Weighted scoring system
        const recencyScore = ageMs * 0.4; // 40% weight for recency
        const frequencyScore = (1 / Math.max(accessFrequency, 0.001)) * 0.3; // 30% weight for frequency
        const ageScore = totalLifetime * 0.2; // 20% weight for total age
        const sizeScore = this.estimateEntrySize(entry) * 0.1; // 10% weight for size
        
        return recencyScore + frequencyScore + ageScore + sizeScore;
    }
    
    onAccess(entry: CacheEntry<any>): void {
        entry.accessCount++;
        entry.lastAccess = Date.now();
        
        // Track access patterns for better prediction
        if (!entry.accessHistory) {
            entry.accessHistory = [];
        }
        
        // Keep last 10 access times for pattern analysis
        entry.accessHistory.push(Date.now());
        if (entry.accessHistory.length > 10) {
            entry.accessHistory.shift();
        }
    }
    
    /**
     * Estimate entry size for memory-aware eviction
     */
    private estimateEntrySize(entry: CacheEntry<any>): number {
        try {
            if (entry.data === null || entry.data === undefined) {
                return 50; // Base overhead
            }
            
            if (typeof entry.data === 'string') {
                return entry.data.length * 2 + 50; // UTF-16 chars + overhead
            }
            
            if (Array.isArray(entry.data)) {
                return entry.data.length * 100 + 50; // Estimate array overhead
            }
            
            if (typeof entry.data === 'object') {
                // Rough estimate based on JSON serialization
                const jsonString = JSON.stringify(entry.data);
                return jsonString.length * 2 + 100; // JSON size + object overhead
            }
            
            return 100; // Default estimate for other types
        } catch {
            return 100; // Fallback estimate
        }
    }
}

/**
 * TTL Cache Strategy
 */
class TTLCacheStrategy implements CacheStrategy {
    readonly name = 'ttl';
    
    shouldEvict(entry: CacheEntry<any>): boolean {
        if (!entry.ttl) return false;
        return Date.now() - entry.timestamp > entry.ttl;
    }
    
    calculatePriority(entry: CacheEntry<any>): number {
        if (!entry.ttl) return Number.MAX_SAFE_INTEGER;
        const timeLeft = entry.ttl - (Date.now() - entry.timestamp);
        return timeLeft; // Lower = expires sooner = higher eviction priority
    }
    
    onAccess(entry: CacheEntry<any>): void {
        // TTL strategy doesn't modify entries on access
    }
}

/**
 * Object pool for cache entries to reduce GC pressure
 */
class CacheEntryPool {
    private pool: CacheEntry<any>[] = [];
    private readonly maxPoolSize: number;
    
    constructor(maxPoolSize = 100) {
        this.maxPoolSize = maxPoolSize;
    }
    
    acquire<T>(): CacheEntry<T> {
        const entry = this.pool.pop();
        if (entry) {
            // Reset entry properties
            entry.data = undefined;
            entry.timestamp = 0;
            entry.mtime = undefined;
            entry.dependencies = undefined;
            entry.ttl = undefined;
            entry.accessCount = 0;
            entry.lastAccess = 0;
            return entry;
        }
        
        return {
            data: undefined,
            timestamp: 0,
            accessCount: 0,
            lastAccess: 0
        } as CacheEntry<T>;
    }
    
    release(entry: CacheEntry<any>): void {
        if (this.pool.length < this.maxPoolSize) {
            this.pool.push(entry);
        }
    }
    
    clear(): void {
        this.pool = [];
    }
    
    getStats(): { poolSize: number; maxPoolSize: number } {
        return {
            poolSize: this.pool.length,
            maxPoolSize: this.maxPoolSize
        };
    }
}

/**
 * High-performance cache implementation
 */
class PerformanceCache<T> {
    private entries = new Map<string, CacheEntry<T>>();
    private accessOrder: string[] = []; // For LRU tracking
    private readonly maxSize: number;
    private readonly strategy: CacheStrategy;
    private readonly entryPool: CacheEntryPool;
    
    constructor(maxSize: number, strategy: CacheStrategy, entryPool: CacheEntryPool) {
        this.maxSize = maxSize;
        this.strategy = strategy;
        this.entryPool = entryPool;
    }
    
    get(key: string): T | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        
        // Check TTL expiration
        if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
            this.delete(key);
            return undefined;
        }
        
        // Update access information
        this.strategy.onAccess(entry);
        this.updateAccessOrder(key);
        
        return entry.data;
    }
    
    set(key: string, data: T, options: Partial<Pick<CacheEntry<T>, 'mtime' | 'ttl' | 'dependencies'>> = {}): void {
        // Check if we need to evict entries
        if (this.entries.size >= this.maxSize) {
            this.evictEntries(1);
        }
        
        const entry = this.entryPool.acquire<T>();
        entry.data = data;
        entry.timestamp = Date.now();
        entry.lastAccess = Date.now();
        entry.accessCount = 1;
        entry.mtime = options.mtime;
        entry.ttl = options.ttl;
        entry.dependencies = options.dependencies;
        
        // Remove old entry if exists
        const oldEntry = this.entries.get(key);
        if (oldEntry) {
            this.entryPool.release(oldEntry);
        }
        
        this.entries.set(key, entry);
        this.updateAccessOrder(key);
    }
    
    delete(key: string): boolean {
        const entry = this.entries.get(key);
        if (!entry) return false;
        
        this.entries.delete(key);
        this.removeFromAccessOrder(key);
        this.entryPool.release(entry);
        return true;
    }
    
    clear(): void {
        // Return all entries to pool
        for (const entry of this.entries.values()) {
            this.entryPool.release(entry);
        }
        this.entries.clear();
        this.accessOrder = [];
    }
    
    has(key: string): boolean {
        const entry = this.entries.get(key);
        if (!entry) return false;
        
        // Check TTL
        if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
            this.delete(key);
            return false;
        }
        
        return true;
    }
    
    size(): number {
        return this.entries.size;
    }
    
    keys(): string[] {
        return Array.from(this.entries.keys());
    }
    
    private updateAccessOrder(key: string): void {
        // Remove from current position
        this.removeFromAccessOrder(key);
        // Add to end (most recently used)
        this.accessOrder.push(key);
    }
    
    private removeFromAccessOrder(key: string): void {
        const index = this.accessOrder.indexOf(key);
        if (index !== -1) {
            this.accessOrder.splice(index, 1);
        }
    }
    
    private evictEntries(count: number): void {
        const entriesToEvict: Array<[string, number]> = [];
        
        // Calculate eviction priorities
        for (const [key, entry] of this.entries) {
            const priority = this.strategy.calculatePriority(entry);
            entriesToEvict.push([key, priority]);
        }
        
        // Sort by priority (higher priority = more likely to evict)
        entriesToEvict.sort((a, b) => b[1] - a[1]);
        
        // Evict the highest priority entries
        for (let i = 0; i < Math.min(count, entriesToEvict.length); i++) {
            this.delete(entriesToEvict[i][0]);
        }
    }
    
    getEntry(key: string): CacheEntry<T> | undefined {
        return this.entries.get(key);
    }
    
    validateMtime(key: string, mtime: number): boolean {
        const entry = this.entries.get(key);
        if (!entry || !entry.mtime) return false;
        return entry.mtime === mtime;
    }
}

/**
 * Unified Cache Manager
 * 
 * Central cache management for all parsing operations.
 * Provides high-performance, type-safe caching with advanced strategies.
 */
export class UnifiedCacheManager extends Component {
    private app: App;
    private config: CacheConfig;
    private eventManager?: ParseEventManager;
    
    /** Cache instances by type */
    private caches = new Map<CacheType, PerformanceCache<any>>();
    
    /** Cache strategies */
    private lruStrategy = new LRUCacheStrategy();
    private ttlStrategy = new TTLCacheStrategy();
    
    /** Object pool for cache entries */
    private entryPool = new CacheEntryPool();
    
    /** Statistics tracking */
    private stats: CacheStatistics = this.createEmptyStats();
    
    /** Performance timing */
    private timings: number[] = [];
    
    /** Initialization flag */
    private initialized = false;
    
    constructor(app: App, config: Partial<CacheConfig> = {}) {
        super();
        this.app = app;
        this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
        this.initialize();
    }
    
    /**
     * Set event manager for event emission
     */
    public setEventManager(eventManager: ParseEventManager): void {
        this.eventManager = eventManager;
    }
    
    /**
     * Initialize cache manager
     */
    private initialize(): void {
        if (this.initialized) {
            this.log('Cache manager already initialized');
            return;
        }
        
        // Initialize caches for each type
        for (const cacheType of Object.values(CacheType)) {
            const strategy = cacheType === CacheType.PARSED_CONTENT ? this.ttlStrategy : this.lruStrategy;
            const cache = new PerformanceCache<any>(this.config.maxSize, strategy, this.entryPool);
            this.caches.set(cacheType, cache);
            
            // Initialize type statistics
            this.stats.byType[cacheType] = {
                size: 0,
                hits: 0,
                misses: 0,
                evictions: 0
            };
        }
        
        // Setup file system monitoring for cache invalidation
        if (this.config.enableMtimeValidation) {
            this.setupFileMonitoring();
        }
        
        this.initialized = true;
        this.log('Cache manager initialized');
    }
    
    /**
     * Get cached value with type safety
     */
    public get<T>(key: string, type: CacheType): T | undefined {
        const startTime = performance.now();
        
        try {
            const cache = this.caches.get(type);
            if (!cache) {
                this.recordMiss(type);
                return undefined;
            }
            
            const result = cache.get(key);
            
            if (result !== undefined) {
                this.recordHit(type);
                this.emitCacheEvent(ParseEventType.CACHE_HIT, { cacheKey: key, cacheType: type });
            } else {
                this.recordMiss(type);
                this.emitCacheEvent(ParseEventType.CACHE_MISS, { 
                    cacheKey: key, 
                    cacheType: type, 
                    reason: 'not_found' 
                });
            }
            
            return result;
            
        } finally {
            this.recordTiming('get', performance.now() - startTime);
        }
    }
    
    /**
     * Set cached value with options
     */
    public set<T>(
        key: string, 
        value: T, 
        type: CacheType,
        options: {
            mtime?: number;
            ttl?: number;
            dependencies?: string[];
        } = {}
    ): void {
        const startTime = performance.now();
        
        try {
            const cache = this.caches.get(type);
            if (!cache) {
                this.log(`Cache type ${type} not found`);
                return;
            }
            
            const finalTTL = options.ttl ?? this.config.defaultTTL;
            cache.set(key, value, { 
                mtime: options.mtime,
                ttl: finalTTL,
                dependencies: options.dependencies 
            });
            
            this.stats.operations.sets++;
            this.updateTypeStats(type);
            
        } finally {
            this.recordTiming('set', performance.now() - startTime);
        }
    }
    
    /**
     * Delete cached value
     */
    public delete(key: string, type: CacheType): boolean {
        const cache = this.caches.get(type);
        if (!cache) return false;
        
        const result = cache.delete(key);
        if (result) {
            this.stats.operations.deletes++;
            this.updateTypeStats(type);
        }
        
        return result;
    }
    
    /**
     * Check if key exists and is valid
     */
    public has(key: string, type: CacheType): boolean {
        const cache = this.caches.get(type);
        return cache ? cache.has(key) : false;
    }
    
    /**
     * Validate entry with mtime
     */
    public validateMtime(key: string, type: CacheType, mtime: number): boolean {
        if (!this.config.enableMtimeValidation) return true;
        
        const cache = this.caches.get(type);
        if (!cache) return false;
        
        return cache.validateMtime(key, mtime);
    }
    
    /**
     * Advanced cache optimization methods
     */
    
    async invalidateByPath(filePath: string): Promise<void> {
        const invalidatedKeys: string[] = [];
        
        for (const [cacheType, cache] of this.caches.entries()) {
            const keysToCheck = cache.keys().filter(key => key.includes(filePath));
            for (const key of keysToCheck) {
                const entry = cache.getEntry(key);
                if (entry && entry.filePath === filePath) {
                    cache.delete(key);
                    invalidatedKeys.push(key);
                    this.stats.evictions.manual++;
                    this.updateTypeStats(cacheType);
                }
            }
        }
        
        if (invalidatedKeys.length > 0) {
            this.emitCacheEvent(ParseEventType.CACHE_INVALIDATED, {
                keys: invalidatedKeys,
                reason: 'file_modified',
                filePath,
                timestamp: Date.now()
            });
        }
    }
    
    async invalidateByPattern(pattern: RegExp): Promise<number> {
        let totalInvalidated = 0;
        const invalidatedKeys: string[] = [];
        
        for (const [cacheType, cache] of this.caches.entries()) {
            const keysToCheck = cache.keys();
            for (const key of keysToCheck) {
                const entry = cache.getEntry(key);
                if (pattern.test(key) || (entry?.filePath && pattern.test(entry.filePath))) {
                    cache.delete(key);
                    invalidatedKeys.push(key);
                    totalInvalidated++;
                    this.stats.evictions.manual++;
                    this.updateTypeStats(cacheType);
                }
            }
        }
        
        if (invalidatedKeys.length > 0) {
            this.emitCacheEvent(ParseEventType.CACHE_INVALIDATED, {
                keys: invalidatedKeys,
                reason: 'pattern_match',
                pattern: pattern.source,
                timestamp: Date.now()
            });
        }
        
        return totalInvalidated;
    }
    
    async batchInvalidate(filePaths: string[]): Promise<void> {
        if (filePaths.length === 0) return;
        
        const invalidatedKeys: string[] = [];
        const pathSet = new Set(filePaths);
        
        for (const [cacheType, cache] of this.caches.entries()) {
            const keysToCheck = cache.keys();
            for (const key of keysToCheck) {
                const entry = cache.getEntry(key);
                if (entry?.filePath && pathSet.has(entry.filePath)) {
                    cache.delete(key);
                    invalidatedKeys.push(key);
                    this.stats.evictions.manual++;
                    this.updateTypeStats(cacheType);
                }
            }
        }
        
        if (invalidatedKeys.length > 0) {
            this.emitCacheEvent(ParseEventType.CACHE_INVALIDATED, {
                keys: invalidatedKeys,
                reason: 'batch_invalidation',
                filePaths,
                timestamp: Date.now()
            });
        }
    }
    
    async optimizeCache(cacheType: CacheType): Promise<void> {
        const cache = this.caches.get(cacheType);
        if (!cache) return;
        
        const startTime = Date.now();
        const initialSize = cache.size();
        
        const keysToValidate = cache.keys();
        let removedCount = 0;
        
        for (const key of keysToValidate) {
            const entry = cache.getEntry(key);
            if (!entry) continue;
            
            const isValid = await this.validateEntry(entry);
            if (!isValid) {
                cache.delete(key);
                removedCount++;
                this.stats.evictions.manual++;
            }
        }
        
        const duration = Date.now() - startTime;
        this.updateTypeStats(cacheType);
        
        this.emitCacheEvent(ParseEventType.CACHE_OPTIMIZED, {
            cacheType,
            initialSize,
            finalSize: cache.size(),
            removedCount,
            duration,
            timestamp: Date.now()
        });
    }
    
    async bulkOptimization(): Promise<void> {
        const optimizationPromises = Array.from(this.caches.keys()).map(cacheType => 
            this.optimizeCache(cacheType)
        );
        
        await Promise.allSettled(optimizationPromises);
        
        this.emitCacheEvent(ParseEventType.CACHE_BULK_OPTIMIZED, {
            cacheTypes: Array.from(this.caches.keys()),
            timestamp: Date.now()
        });
    }
    
    scheduleOptimization(intervalMs: number = 300000): void {
        if (this.optimizationTimer) {
            clearInterval(this.optimizationTimer);
        }
        
        this.optimizationTimer = setInterval(() => {
            this.bulkOptimization().catch(error => {
                this.log(`Cache optimization failed: ${error.message}`);
            });
        }, intervalMs);
    }
    
    private optimizationTimer: NodeJS.Timeout | null = null;
    
    private async validateEntry(entry: CacheEntry<any>): Promise<boolean> {
        if (!entry.mtime || !entry.filePath) {
            return true;
        }
        
        try {
            const file = this.app.vault.getAbstractFileByPath(entry.filePath);
            if (!file || !(file instanceof TFile)) {
                return false;
            }
            
            return entry.mtime >= file.stat.mtime;
        } catch {
            return false;
        }
    }
    
    /**
     * Invalidate cache entries by pattern
     */
    public invalidatePattern(pattern: string, type?: CacheType): number {
        let invalidatedCount = 0;
        const regex = new RegExp(pattern);
        
        const cachesToProcess = type ? [type] : Array.from(this.caches.keys());
        
        for (const cacheType of cachesToProcess) {
            const cache = this.caches.get(cacheType);
            if (!cache) continue;
            
            const keysToDelete = cache.keys().filter(key => regex.test(key));
            for (const key of keysToDelete) {
                if (cache.delete(key)) {
                    invalidatedCount++;
                }
            }
            
            this.updateTypeStats(cacheType);
        }
        
        if (invalidatedCount > 0) {
            this.emitCacheEvent(ParseEventType.CACHE_INVALIDATED, {
                cacheKeys: [pattern],
                cacheType: type || 'all',
                reason: 'manual'
            });
        }
        
        return invalidatedCount;
    }
    
    /**
     * Clear specific cache type
     */
    public clear(type?: CacheType): void {
        if (type) {
            const cache = this.caches.get(type);
            if (cache) {
                cache.clear();
                this.updateTypeStats(type);
            }
        } else {
            // Clear all caches
            for (const [cacheType, cache] of this.caches) {
                cache.clear();
                this.updateTypeStats(cacheType);
            }
        }
        
        this.stats.operations.clears++;
    }
    
    /**
     * Get cache statistics
     */
    public getStatistics(): CacheStatistics {
        // Update memory statistics
        this.updateMemoryStats();
        return { ...this.stats };
    }
    
    /**
     * Reset statistics
     */
    public resetStatistics(): void {
        this.stats = this.createEmptyStats();
        this.timings = [];
    }
    
    /**
     * Get cache health status
     */
    public getHealthStatus(): {
        healthy: boolean;
        memoryPressure: number;
        hitRatio: number;
        totalEntries: number;
    } {
        const totalEntries = Array.from(this.caches.values())
            .reduce((sum, cache) => sum + cache.size(), 0);
        
        const memoryPressure = totalEntries / (this.caches.size * this.config.maxSize);
        const hitRatio = this.stats.hitRatio;
        
        return {
            healthy: memoryPressure < this.config.memoryPressureThreshold && hitRatio > 0.5,
            memoryPressure,
            hitRatio,
            totalEntries
        };
    }
    
    /**
     * Force memory cleanup with advanced strategies
     */
    public cleanup(): void {
        // Evict expired entries from all caches
        for (const [type, cache] of this.caches) {
            const keys = cache.keys();
            for (const key of keys) {
                const entry = cache.getEntry(key);
                if (entry && this.ttlStrategy.shouldEvict(entry)) {
                    cache.delete(key);
                    this.stats.evictions.ttl++;
                }
            }
            this.updateTypeStats(type);
        }
        
        // Advanced memory pressure handling
        const health = this.getHealthStatus();
        if (health.memoryPressure > this.config.memoryPressureThreshold) {
            this.performMemoryPressureCleanup(health.memoryPressure);
        }
    }

    /**
     * Perform advanced memory pressure cleanup
     */
    private performMemoryPressureCleanup(memoryPressure: number): void {
        // Clear object pool
        this.entryPool.clear();
        
        // Aggressive eviction based on memory pressure level
        const targetReduction = Math.max(0.2, (memoryPressure - this.config.memoryPressureThreshold) * 2);
        
        for (const [type, cache] of this.caches) {
            const currentSize = cache.size();
            const targetSize = Math.floor(currentSize * (1 - targetReduction));
            const evictCount = currentSize - targetSize;
            
            if (evictCount > 0) {
                this.forceEvictFromCache(cache, evictCount, memoryPressure);
                this.stats.evictions.memoryPressure += evictCount;
                this.updateTypeStats(type);
            }
        }
    }

    /**
     * Force eviction from a specific cache based on memory pressure
     */
    private forceEvictFromCache(cache: any, evictCount: number, memoryPressure: number): void {
        const entries: Array<[string, any, number]> = [];
        
        // Collect entries with their eviction priorities
        const keys = cache.keys();
        for (const key of keys) {
            const entry = cache.getEntry(key);
            if (entry) {
                const strategy = cache.strategy || this.lruStrategy;
                const priority = strategy.calculatePriority(entry);
                entries.push([key, entry, priority]);
            }
        }
        
        // Sort by priority (higher priority = more likely to evict)
        entries.sort((a, b) => b[2] - a[2]);
        
        // Evict the highest priority entries
        for (let i = 0; i < Math.min(evictCount, entries.length); i++) {
            const [key] = entries[i];
            cache.delete(key);
        }
    }

    /**
     * Get detailed memory analysis
     */
    public getMemoryAnalysis(): {
        total: {
            estimatedBytes: number;
            entryCount: number;
            averageEntrySize: number;
        };
        byType: Record<CacheType, {
            estimatedBytes: number;
            entryCount: number;
            averageEntrySize: number;
            largestEntry: number;
            oldestEntry: number;
        }>;
        pressure: {
            level: 'low' | 'medium' | 'high' | 'critical';
            value: number;
            recommendations: string[];
        };
        pool: {
            size: number;
            maxSize: number;
            utilizationRate: number;
        };
    } {
        let totalBytes = 0;
        let totalEntries = 0;
        const byType: any = {};
        
        // Analyze each cache type
        for (const cacheType of Object.values(CacheType)) {
            const cache = this.caches.get(cacheType);
            let typeBytes = 0;
            let typeEntries = 0;
            let largestEntry = 0;
            let oldestEntry = Date.now();
            
            if (cache) {
                const keys = cache.keys();
                for (const key of keys) {
                    const entry = cache.getEntry(key);
                    if (entry) {
                        const entrySize = this.estimateEntrySize(entry);
                        typeBytes += entrySize;
                        typeEntries++;
                        largestEntry = Math.max(largestEntry, entrySize);
                        oldestEntry = Math.min(oldestEntry, entry.timestamp);
                    }
                }
            }
            
            totalBytes += typeBytes;
            totalEntries += typeEntries;
            
            byType[cacheType] = {
                estimatedBytes: typeBytes,
                entryCount: typeEntries,
                averageEntrySize: typeEntries > 0 ? typeBytes / typeEntries : 0,
                largestEntry,
                oldestEntry: typeEntries > 0 ? Date.now() - oldestEntry : 0
            };
        }
        
        // Calculate memory pressure
        const maxPossibleEntries = this.caches.size * this.config.maxSize;
        const memoryPressure = totalEntries / maxPossibleEntries;
        
        // Determine pressure level and recommendations
        let pressureLevel: 'low' | 'medium' | 'high' | 'critical';
        const recommendations: string[] = [];
        
        if (memoryPressure < 0.6) {
            pressureLevel = 'low';
            recommendations.push('Memory usage is optimal');
        } else if (memoryPressure < 0.8) {
            pressureLevel = 'medium';
            recommendations.push('Consider reducing cache size or increasing eviction frequency');
        } else if (memoryPressure < 0.9) {
            pressureLevel = 'high';
            recommendations.push('High memory pressure detected - cache cleanup recommended');
            recommendations.push('Consider reducing TTL values for frequently changing data');
        } else {
            pressureLevel = 'critical';
            recommendations.push('Critical memory pressure - immediate cleanup required');
            recommendations.push('Consider reducing maxSize configuration');
            recommendations.push('Implement more aggressive eviction policies');
        }
        
        // Pool analysis
        const poolStats = this.entryPool.getStats();
        
        return {
            total: {
                estimatedBytes: totalBytes,
                entryCount: totalEntries,
                averageEntrySize: totalEntries > 0 ? totalBytes / totalEntries : 0
            },
            byType,
            pressure: {
                level: pressureLevel,
                value: memoryPressure,
                recommendations
            },
            pool: {
                size: poolStats.poolSize,
                maxSize: poolStats.maxPoolSize,
                utilizationRate: poolStats.poolSize / poolStats.maxPoolSize
            }
        };
    }

    /**
     * Estimate size of a cache entry
     */
    private estimateEntrySize(entry: CacheEntry<any>): number {
        try {
            let size = 100; // Base overhead for entry object
            
            if (entry.data === null || entry.data === undefined) {
                return size;
            }
            
            if (typeof entry.data === 'string') {
                size += entry.data.length * 2; // UTF-16 chars
            } else if (Array.isArray(entry.data)) {
                size += entry.data.length * 100; // Rough estimate for array elements
            } else if (typeof entry.data === 'object') {
                // Estimate object size
                const jsonString = JSON.stringify(entry.data);
                size += jsonString.length * 2; // JSON representation
            } else {
                size += 50; // Primitive types
            }
            
            // Add metadata overhead
            if (entry.mtime) size += 8;
            if (entry.dependencies) size += entry.dependencies.length * 50;
            if (entry.accessHistory) size += entry.accessHistory.length * 8;
            
            return size;
        } catch {
            return 100; // Fallback
        }
    }
    
    /**
     * Setup file system monitoring
     */
    private setupFileMonitoring(): void {
        // Monitor file modifications for cache invalidation
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                this.invalidateFileCache(file.path, file.stat.mtime);
            })
        );
        
        // Monitor file deletions
        this.registerEvent(
            this.app.vault.on('delete', (file) => {
                this.invalidatePattern(file.path);
            })
        );
        
        // Monitor file renames
        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                this.invalidatePattern(oldPath);
            })
        );
    }
    
    /**
     * Invalidate file-related cache entries
     */
    private invalidateFileCache(filePath: string, mtime: number): void {
        for (const [type, cache] of this.caches) {
            const entry = cache.getEntry(filePath);
            if (entry && entry.mtime && entry.mtime < mtime) {
                cache.delete(filePath);
                this.updateTypeStats(type);
            }
        }
    }
    
    /**
     * Record cache hit
     */
    private recordHit(type: CacheType): void {
        this.stats.hits++;
        this.stats.byType[type].hits++;
        this.updateHitRatio();
    }
    
    /**
     * Record cache miss
     */
    private recordMiss(type: CacheType): void {
        this.stats.misses++;
        this.stats.byType[type].misses++;
        this.updateHitRatio();
    }
    
    /**
     * Update hit ratio
     */
    private updateHitRatio(): void {
        const total = this.stats.hits + this.stats.misses;
        this.stats.hitRatio = total > 0 ? this.stats.hits / total : 0;
    }
    
    /**
     * Record performance timing
     */
    private recordTiming(operation: 'get' | 'set', timeMs: number): void {
        this.timings.push(timeMs);
        
        // Keep only recent timings (sliding window)
        if (this.timings.length > 1000) {
            this.timings = this.timings.slice(-1000);
        }
        
        // Update performance stats
        const avg = this.timings.reduce((sum, time) => sum + time, 0) / this.timings.length;
        const max = Math.max(...this.timings);
        
        if (operation === 'get') {
            this.stats.performance.avgGetTime = avg;
            this.stats.performance.maxGetTime = max;
        } else {
            this.stats.performance.avgSetTime = avg;
            this.stats.performance.maxSetTime = max;
        }
    }
    
    /**
     * Update type-specific statistics
     */
    private updateTypeStats(type: CacheType): void {
        const cache = this.caches.get(type);
        if (cache) {
            this.stats.byType[type].size = cache.size();
        }
    }
    
    /**
     * Update memory statistics
     */
    private updateMemoryStats(): void {
        let totalEntries = 0;
        let estimatedBytes = 0;
        
        for (const cache of this.caches.values()) {
            totalEntries += cache.size();
        }
        
        // Rough estimation: 1KB per entry
        estimatedBytes = totalEntries * 1024;
        
        this.stats.memory = {
            estimatedBytes,
            entryCount: totalEntries,
            averageEntrySize: totalEntries > 0 ? estimatedBytes / totalEntries : 0
        };
    }
    
    /**
     * Create empty statistics object
     */
    private createEmptyStats(): CacheStatistics {
        const byType: Record<CacheType, any> = {} as any;
        for (const type of Object.values(CacheType)) {
            byType[type] = { size: 0, hits: 0, misses: 0, evictions: 0 };
        }
        
        return {
            operations: { gets: 0, sets: 0, deletes: 0, clears: 0 },
            hits: 0,
            misses: 0,
            hitRatio: 0,
            evictions: { lru: 0, ttl: 0, memoryPressure: 0, manual: 0 },
            memory: { estimatedBytes: 0, entryCount: 0, averageEntrySize: 0 },
            performance: { avgGetTime: 0, avgSetTime: 0, maxGetTime: 0, maxSetTime: 0 },
            byType
        };
    }
    
    /**
     * Emit cache event
     */
    private emitCacheEvent(eventType: ParseEventType, data: any): void {
        if (this.eventManager) {
            this.eventManager.emitSync(eventType, data);
        }
    }
    
    /**
     * Get comprehensive cache statistics
     */
    public async getStats() {
        return this.analyzeCache();
    }
    
    /**
     * Clear all caches
     */
    public async clearAll(): Promise<void> {
        this.clear();
    }
    
    /**
     * Component lifecycle: cleanup on unload
     */
    public onunload(): void {
        this.log('Shutting down cache manager');
        
        // Clear all caches
        this.clear();
        
        // Clear object pool
        this.entryPool.clear();
        
        // Reset state
        this.initialized = false;
        
        super.onunload();
        this.log('Cache manager shut down');
    }
    
    /**
     * Log message if debug is enabled
     */
    private log(message: string): void {
        if (this.config.debug) {
            console.log(`[UnifiedCacheManager] ${message}`);
        }
    }
}