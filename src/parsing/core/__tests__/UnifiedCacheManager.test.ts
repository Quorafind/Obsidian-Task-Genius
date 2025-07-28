/**
 * Unit tests for UnifiedCacheManager
 * 
 * Tests all major functionality including:
 * - Basic cache operations (get, set, delete, clear)
 * - TTL expiration behavior
 * - LRU eviction strategies
 * - mtime-based cache validation
 * - Statistics and monitoring
 * - Component lifecycle management
 * - Memory management and object pooling
 * - Performance characteristics
 */

// Mock Obsidian modules
const mockApp = {
    vault: {
        adapter: {
            stat: jest.fn()
        }
    }
};

const mockComponent = class {
    _loaded = false;
    _children: any[] = [];
    
    onload() {
        this._loaded = true;
    }
    
    onunload() {
        this._loaded = false;
        this._children.forEach(child => child.onunload());
        this._children = [];
    }
    
    addChild(child: any) {
        this._children.push(child);
        if (this._loaded) {
            child.onload();
        }
        return child;
    }
    
    removeChild(child: any) {
        const index = this._children.indexOf(child);
        if (index !== -1) {
            this._children.splice(index, 1);
            child.onunload();
        }
    }
    
    load() {
        this._loaded = true;
        this.onload();
        this._children.forEach(child => child.onload());
    }
    
    unload() {
        this.onunload();
    }
};

// Mock modules
jest.mock('obsidian', () => ({
    App: jest.fn(),
    Component: mockComponent,
    TFile: jest.fn()
}));

import { UnifiedCacheManager, CacheConfig, DEFAULT_CACHE_CONFIG } from '../UnifiedCacheManager';
import { CacheType } from '../../types/ParsingTypes';
import { ParseEventManager } from '../ParseEventManager';

describe('UnifiedCacheManager', () => {
    let cacheManager: UnifiedCacheManager;
    let mockEventManager: jest.Mocked<ParseEventManager>;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Create mock event manager
        mockEventManager = {
            trigger: jest.fn(),
            on: jest.fn(),
            off: jest.fn(),
            dispose: jest.fn()
        } as any;

        // Create cache manager with test configuration
        const testConfig: Partial<CacheConfig> = {
            maxSize: 10,
            defaultTTL: 1000, // 1 second for fast testing
            enableLRU: true,
            enableMtimeValidation: true,
            enableStatistics: true,
            debug: true
        };

        cacheManager = new UnifiedCacheManager(mockApp as any, testConfig);
        cacheManager.setEventManager(mockEventManager);
    });

    afterEach(() => {
        cacheManager.unload();
    });

    describe('Basic Cache Operations', () => {
        it('should store and retrieve values', () => {
            const key = 'test-key';
            const value = { data: 'test-data', id: 123 };
            const type = CacheType.PARSED_CONTENT;

            // Set value
            cacheManager.set(key, value, type);

            // Get value
            const retrieved = cacheManager.get(key, type);
            expect(retrieved).toEqual(value);
        });

        it('should return undefined for non-existent keys', () => {
            const result = cacheManager.get('non-existent', CacheType.PARSED_CONTENT);
            expect(result).toBeUndefined();
        });

        it('should delete values', () => {
            const key = 'delete-test';
            const value = 'test-value';

            cacheManager.set(key, value, CacheType.PARSED_CONTENT);
            expect(cacheManager.get(key, CacheType.PARSED_CONTENT)).toBe(value);

            const deleted = cacheManager.delete(key, CacheType.PARSED_CONTENT);
            expect(deleted).toBe(true);
            expect(cacheManager.get(key, CacheType.PARSED_CONTENT)).toBeUndefined();
        });

        it('should clear all entries for a cache type', () => {
            const type = CacheType.PARSED_CONTENT;
            
            cacheManager.set('key1', 'value1', type);
            cacheManager.set('key2', 'value2', type);
            
            expect(cacheManager.get('key1', type)).toBe('value1');
            expect(cacheManager.get('key2', type)).toBe('value2');

            cacheManager.clear(type);
            
            expect(cacheManager.get('key1', type)).toBeUndefined();
            expect(cacheManager.get('key2', type)).toBeUndefined();
        });

        it('should clear all caches when no type specified', () => {
            cacheManager.set('key1', 'value1', CacheType.PARSED_CONTENT);
            cacheManager.set('key2', 'value2', CacheType.METADATA);

            cacheManager.clear();

            expect(cacheManager.get('key1', CacheType.PARSED_CONTENT)).toBeUndefined();
            expect(cacheManager.get('key2', CacheType.METADATA)).toBeUndefined();
        });
    });

    describe('TTL Expiration', () => {
        it('should expire entries after TTL', async () => {
            const key = 'ttl-test';
            const value = 'expires-soon';
            const shortTTL = 50; // 50ms

            cacheManager.set(key, value, CacheType.PARSED_CONTENT, { ttl: shortTTL });
            
            // Should be available immediately
            expect(cacheManager.get(key, CacheType.PARSED_CONTENT)).toBe(value);

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, shortTTL + 10));

            // Should be expired
            expect(cacheManager.get(key, CacheType.PARSED_CONTENT)).toBeUndefined();
        });

        it('should use default TTL when not specified', async () => {
            const key = 'default-ttl-test';
            const value = 'uses-default-ttl';

            cacheManager.set(key, value, CacheType.PARSED_CONTENT);
            
            // Should be available immediately
            expect(cacheManager.get(key, CacheType.PARSED_CONTENT)).toBe(value);

            // Should still be available after short time (default TTL is 1 second in test config)
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(cacheManager.get(key, CacheType.PARSED_CONTENT)).toBe(value);
        });
    });

    describe('mtime Validation', () => {
        it('should validate entry with mtime', () => {
            const key = 'mtime-test';
            const value = 'old-content';
            const mtime = 1000;

            // Set with mtime
            cacheManager.set(key, value, CacheType.PARSED_CONTENT, { mtime });
            expect(cacheManager.get(key, CacheType.PARSED_CONTENT)).toBe(value);

            // Validate with same mtime
            const isValid = cacheManager.validateMtime(key, CacheType.PARSED_CONTENT, mtime);
            expect(isValid).toBe(true);

            // Validate with different mtime should fail
            const isValidDifferent = cacheManager.validateMtime(key, CacheType.PARSED_CONTENT, mtime + 1000);
            expect(isValidDifferent).toBe(false);
        });

        it('should validate entries without mtime', () => {
            const key = 'no-mtime-test';
            const value = 'no-mtime-content';

            // Set without mtime
            cacheManager.set(key, value, CacheType.PARSED_CONTENT);
            expect(cacheManager.get(key, CacheType.PARSED_CONTENT)).toBe(value);

            // Validation should pass for entries without mtime
            const isValid = cacheManager.validateMtime(key, CacheType.PARSED_CONTENT, 1000);
            expect(isValid).toBe(true);
        });

        it('should keep cache when mtime validation is disabled', () => {
            // Create cache manager without mtime validation
            const config: Partial<CacheConfig> = {
                ...DEFAULT_CACHE_CONFIG,
                enableMtimeValidation: false
            };
            
            const noMtimeCacheManager = new UnifiedCacheManager(mockApp as any, config);
            
            const key = 'no-mtime-test';
            const value = 'no-mtime-validation';
            const oldMtime = 1000;
            const newMtime = 2000;

            noMtimeCacheManager.set(key, value, CacheType.PARSED_CONTENT, { mtime: oldMtime });
            
            // Validation should always pass when disabled
            expect(noMtimeCacheManager.validateMtime(key, CacheType.PARSED_CONTENT, newMtime)).toBe(true);
            
            noMtimeCacheManager.unload();
        });
    });

    describe('LRU Eviction', () => {
        it('should evict least recently used items when cache is full', () => {
            const type = CacheType.METADATA; // Use LRU cache type
            const maxSize = 3;
            
            // Create cache manager with small max size
            const smallCacheManager = new UnifiedCacheManager(mockApp as any, { maxSize });

            // Fill cache to capacity
            smallCacheManager.set('key1', 'value1', type);
            smallCacheManager.set('key2', 'value2', type);
            smallCacheManager.set('key3', 'value3', type);

            // All should be present
            expect(smallCacheManager.get('key1', type)).toBe('value1');
            expect(smallCacheManager.get('key2', type)).toBe('value2');
            expect(smallCacheManager.get('key3', type)).toBe('value3');

            // Add one more - should evict least recently used
            smallCacheManager.set('key4', 'value4', type);

            // key1 should be evicted (was least recently accessed)
            expect(smallCacheManager.get('key1', type)).toBeUndefined();
            expect(smallCacheManager.get('key2', type)).toBe('value2');
            expect(smallCacheManager.get('key3', type)).toBe('value3');
            expect(smallCacheManager.get('key4', type)).toBe('value4');
            
            smallCacheManager.unload();
        });

        it('should update access order when items are retrieved', () => {
            const type = CacheType.METADATA;
            const maxSize = 3;
            
            const smallCacheManager = new UnifiedCacheManager(mockApp as any, { maxSize });

            // Fill cache
            smallCacheManager.set('key1', 'value1', type);
            smallCacheManager.set('key2', 'value2', type);
            smallCacheManager.set('key3', 'value3', type);

            // Access key1 to make it most recently used
            smallCacheManager.get('key1', type);

            // Add key4 - should evict key2 (oldest unaccessed)
            smallCacheManager.set('key4', 'value4', type);

            expect(smallCacheManager.get('key1', type)).toBe('value1'); // Should still be there
            expect(smallCacheManager.get('key2', type)).toBeUndefined(); // Should be evicted
            expect(smallCacheManager.get('key3', type)).toBe('value3');
            expect(smallCacheManager.get('key4', type)).toBe('value4');
            
            smallCacheManager.unload();
        });
    });

    describe('Statistics and Monitoring', () => {
        it('should track cache hits and misses', () => {
            const key = 'stats-test';
            const value = 'stats-value';

            // Reset stats for clean test
            cacheManager.resetStatistics();
            
            // Miss
            cacheManager.get(key, CacheType.PARSED_CONTENT);
            
            // Set and hit
            cacheManager.set(key, value, CacheType.PARSED_CONTENT);
            cacheManager.get(key, CacheType.PARSED_CONTENT);

            const stats = cacheManager.getStatistics();
            expect(stats.hits).toBe(1);
            expect(stats.misses).toBe(1);
            expect(stats.hitRatio).toBe(0.5);
        });

        it('should track operations', () => {
            cacheManager.resetStatistics();
            
            cacheManager.set('key1', 'value1', CacheType.PARSED_CONTENT);
            cacheManager.get('key1', CacheType.PARSED_CONTENT);
            cacheManager.delete('key1', CacheType.PARSED_CONTENT);
            cacheManager.clear(CacheType.PARSED_CONTENT);

            const stats = cacheManager.getStatistics();
            expect(stats.operations.sets).toBe(1);
            expect(stats.operations.gets).toBe(1);
            expect(stats.operations.deletes).toBe(1);
            expect(stats.operations.clears).toBe(1);
        });

        it('should provide health status', () => {
            cacheManager.set('test', 'value', CacheType.PARSED_CONTENT);
            cacheManager.get('test', CacheType.PARSED_CONTENT);

            const health = cacheManager.getHealthStatus();
            expect(typeof health.healthy).toBe('boolean');
            expect(typeof health.memoryPressure).toBe('number');
            expect(typeof health.hitRatio).toBe('number');
            expect(typeof health.totalEntries).toBe('number');
            expect(health.totalEntries).toBeGreaterThan(0);
        });
    });

    describe('Component Lifecycle', () => {
        it('should extend Component class', () => {
            expect(cacheManager instanceof mockComponent).toBe(true);
        });

        it('should handle lifecycle properly', () => {
            // Simulate component loading
            cacheManager.load();
            expect((cacheManager as any)._loaded).toBe(true);

            // Add some data
            cacheManager.set('lifecycle-test', 'data', CacheType.PARSED_CONTENT);
            expect(cacheManager.get('lifecycle-test', CacheType.PARSED_CONTENT)).toBe('data');

            // Simulate component unloading
            cacheManager.unload();
            expect((cacheManager as any)._loaded).toBe(false);
        });
    });

    describe('Performance', () => {
        it('should handle large datasets efficiently', () => {
            const startTime = performance.now();
            const itemCount = 1000;

            // Set many items
            for (let i = 0; i < itemCount; i++) {
                cacheManager.set(`key-${i}`, { id: i, data: `data-${i}` }, CacheType.PARSED_CONTENT);
            }

            // Get many items
            for (let i = 0; i < itemCount; i++) {
                const result = cacheManager.get(`key-${i}`, CacheType.PARSED_CONTENT);
                expect(result).toEqual({ id: i, data: `data-${i}` });
            }

            const endTime = performance.now();
            const duration = endTime - startTime;

            // Should complete within reasonable time (adjust threshold as needed)
            expect(duration).toBeLessThan(1000); // 1 second
        });

        it('should provide performance statistics', () => {
            cacheManager.resetStatistics();
            
            // Perform operations to generate timing data
            for (let i = 0; i < 10; i++) {
                cacheManager.set(`perf-${i}`, `value-${i}`, CacheType.PARSED_CONTENT);
                cacheManager.get(`perf-${i}`, CacheType.PARSED_CONTENT);
            }

            const stats = cacheManager.getStatistics();
            expect(stats.performance.avgGetTime).toBeGreaterThan(0);
            expect(stats.performance.avgSetTime).toBeGreaterThan(0);
            expect(stats.performance.maxGetTime).toBeGreaterThanOrEqual(stats.performance.avgGetTime);
            expect(stats.performance.maxSetTime).toBeGreaterThanOrEqual(stats.performance.avgSetTime);
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid cache types gracefully', () => {
            const invalidType = 'invalid-type' as CacheType;
            
            // Should not throw, but return undefined/false
            expect(() => {
                cacheManager.set('key', 'value', invalidType);
                const result = cacheManager.get('key', invalidType);
                const deleted = cacheManager.delete('key', invalidType);
                expect(result).toBeUndefined();
                expect(deleted).toBe(false);
            }).not.toThrow();
        });

        it('should handle null/undefined values', () => {
            expect(() => {
                cacheManager.set('null-test', null, CacheType.PARSED_CONTENT);
                cacheManager.set('undefined-test', undefined, CacheType.PARSED_CONTENT);
                
                expect(cacheManager.get('null-test', CacheType.PARSED_CONTENT)).toBeNull();
                expect(cacheManager.get('undefined-test', CacheType.PARSED_CONTENT)).toBeUndefined();
            }).not.toThrow();
        });
    });

    describe('Event Integration', () => {
        it('should trigger events for cache operations', () => {
            const key = 'event-test';
            const value = 'event-value';

            cacheManager.set(key, value, CacheType.PARSED_CONTENT);
            cacheManager.get(key, CacheType.PARSED_CONTENT);
            cacheManager.delete(key, CacheType.PARSED_CONTENT);

            // Verify events were triggered (if event manager was provided)
            if (mockEventManager.trigger) {
                expect(mockEventManager.trigger).toHaveBeenCalled();
            }
        });
    });
});