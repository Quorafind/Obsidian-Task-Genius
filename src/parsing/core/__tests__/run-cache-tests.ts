/**
 * Simple test runner for UnifiedCacheManager tests
 * This allows us to run tests without a full Jest setup for quick validation
 */

// Mock implementation for testing
const mockTestFramework = {
    describe: (name: string, fn: () => void) => {
        console.log(`\n=== ${name} ===`);
        try {
            fn();
        } catch (error) {
            console.error(`Failed in describe "${name}":`, error);
        }
    },
    
    it: (name: string, fn: () => void | Promise<void>) => {
        console.log(`  • ${name}`);
        try {
            const result = fn();
            if (result instanceof Promise) {
                return result.catch(error => {
                    console.error(`    ❌ Failed: ${error.message}`);
                    throw error;
                });
            }
            console.log(`    ✅ Passed`);
        } catch (error) {
            console.error(`    ❌ Failed: ${error.message}`);
            throw error;
        }
    },
    
    beforeEach: (fn: () => void) => {
        // Store setup function for each test
        if (!mockTestFramework._beforeEachFn) {
            mockTestFramework._beforeEachFn = fn;
        }
    },
    
    afterEach: (fn: () => void) => {
        // Store cleanup function for each test
        if (!mockTestFramework._afterEachFn) {
            mockTestFramework._afterEachFn = fn;
        }
    },
    
    expect: (actual: any) => ({
        toBe: (expected: any) => {
            if (actual !== expected) {
                throw new Error(`Expected ${actual} to be ${expected}`);
            }
        },
        toEqual: (expected: any) => {
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
            }
        },
        toBeUndefined: () => {
            if (actual !== undefined) {
                throw new Error(`Expected ${actual} to be undefined`);
            }
        },
        toBeNull: () => {
            if (actual !== null) {
                throw new Error(`Expected ${actual} to be null`);
            }
        },
        toBeGreaterThan: (expected: number) => {
            if (actual <= expected) {
                throw new Error(`Expected ${actual} to be greater than ${expected}`);
            }
        },
        toBeGreaterThanOrEqual: (expected: number) => {
            if (actual < expected) {
                throw new Error(`Expected ${actual} to be greater than or equal to ${expected}`);
            }
        },
        toBeLessThan: (expected: number) => {
            if (actual >= expected) {
                throw new Error(`Expected ${actual} to be less than ${expected}`);
            }
        },
        not: {
            toThrow: () => {
                try {
                    if (typeof actual === 'function') {
                        actual();
                    }
                } catch (error) {
                    throw new Error(`Expected function not to throw, but it threw: ${error.message}`);
                }
            }
        }
    }),
    
    jest: {
        fn: () => ({
            trigger: () => {},
            on: () => {},
            off: () => {},
            dispose: () => {}
        }),
        clearAllMocks: () => {}
    },
    
    _beforeEachFn: null as (() => void) | null,
    _afterEachFn: null as (() => void) | null
};

// Make test functions global
Object.assign(global, mockTestFramework);

/**
 * Run a basic set of cache tests to validate functionality
 */
export async function runBasicCacheTests() {
    console.log('🧪 Running UnifiedCacheManager Tests...\n');
    
    // Mock Obsidian dependencies
    const mockApp = {
        vault: {
            adapter: {
                stat: () => Promise.resolve({ mtime: Date.now() })
            },
            on: () => {},
            off: () => {}
        }
    };

    const mockComponent = class {
        _loaded = false;
        _children: any[] = [];
        
        onload() { this._loaded = true; }
        onunload() { this._loaded = false; }
        addChild(child: any) { this._children.push(child); return child; }
        removeChild(child: any) { 
            const index = this._children.indexOf(child);
            if (index !== -1) this._children.splice(index, 1);
        }
        load() { this._loaded = true; this.onload(); }
        unload() { this.onunload(); }
    };

    // Import after setting up mocks
    const { UnifiedCacheManager, DEFAULT_CACHE_CONFIG } = await import('../UnifiedCacheManager');
    const { CacheType } = await import('../../types/ParsingTypes');

    let testsPassed = 0;
    let testsFailed = 0;

    const runTest = (name: string, testFn: () => void | Promise<void>) => {
        console.log(`  • ${name}`);
        try {
            const result = testFn();
            if (result instanceof Promise) {
                return result.then(() => {
                    console.log(`    ✅ Passed`);
                    testsPassed++;
                }).catch(error => {
                    console.error(`    ❌ Failed: ${error.message}`);
                    testsFailed++;
                });
            } else {
                console.log(`    ✅ Passed`);
                testsPassed++;
            }
        } catch (error) {
            console.error(`    ❌ Failed: ${error.message}`);
            testsFailed++;
        }
    };

    // Create cache manager instance
    const config = {
        maxSize: 10,
        defaultTTL: 1000,
        enableLRU: true,
        enableMtimeValidation: true,
        enableStatistics: true,
        debug: true
    };

    const cacheManager = new UnifiedCacheManager(mockApp as any, config);

    console.log('=== Basic Cache Operations ===');
    
    runTest('should store and retrieve values', () => {
        const key = 'test-key';
        const value = { data: 'test-data', id: 123 };
        
        cacheManager.set(key, value, CacheType.PARSED_CONTENT);
        const retrieved = cacheManager.get(key, CacheType.PARSED_CONTENT);
        
        if (JSON.stringify(retrieved) !== JSON.stringify(value)) {
            throw new Error(`Expected ${JSON.stringify(retrieved)} to equal ${JSON.stringify(value)}`);
        }
    });

    runTest('should return undefined for non-existent keys', () => {
        const result = cacheManager.get('non-existent', CacheType.PARSED_CONTENT);
        if (result !== undefined) {
            throw new Error(`Expected undefined, got ${result}`);
        }
    });

    runTest('should delete values', () => {
        const key = 'delete-test';
        const value = 'test-value';

        cacheManager.set(key, value, CacheType.PARSED_CONTENT);
        const deleted = cacheManager.delete(key, CacheType.PARSED_CONTENT);
        const afterDelete = cacheManager.get(key, CacheType.PARSED_CONTENT);
        
        if (!deleted) throw new Error('Delete should return true');
        if (afterDelete !== undefined) throw new Error('Value should be undefined after delete');
    });

    console.log('\n=== Statistics ===');
    
    runTest('should track cache statistics', () => {
        cacheManager.resetStatistics();
        
        // Generate some cache activity
        cacheManager.set('stats-key', 'stats-value', CacheType.PARSED_CONTENT);
        cacheManager.get('stats-key', CacheType.PARSED_CONTENT);
        cacheManager.get('non-existent', CacheType.PARSED_CONTENT);
        
        const stats = cacheManager.getStatistics();
        
        if (stats.hits < 1) throw new Error('Should have at least 1 hit');
        if (stats.misses < 1) throw new Error('Should have at least 1 miss');
        if (stats.operations.sets < 1) throw new Error('Should have at least 1 set operation');
        if (stats.operations.gets < 2) throw new Error('Should have at least 2 get operations');
    });

    console.log('\n=== TTL Expiration ===');
    
    await runTest('should expire entries after TTL', async () => {
        const key = 'ttl-test';
        const value = 'expires-soon';
        const shortTTL = 50; // 50ms

        cacheManager.set(key, value, CacheType.PARSED_CONTENT, { ttl: shortTTL });
        
        // Should be available immediately
        const immediate = cacheManager.get(key, CacheType.PARSED_CONTENT);
        if (immediate !== value) throw new Error('Should be available immediately');

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, shortTTL + 10));

        // Should be expired
        const afterExpiry = cacheManager.get(key, CacheType.PARSED_CONTENT);
        if (afterExpiry !== undefined) throw new Error('Should be undefined after TTL expiry');
    });

    console.log('\n=== Component Lifecycle ===');
    
    runTest('should extend Component class', () => {
        if (!(cacheManager instanceof mockComponent)) {
            throw new Error('CacheManager should extend Component class');
        }
    });

    runTest('should provide health status', () => {
        cacheManager.set('health-test', 'health-value', CacheType.PARSED_CONTENT);
        const health = cacheManager.getHealthStatus();
        
        if (typeof health.healthy !== 'boolean') throw new Error('healthy should be boolean');
        if (typeof health.memoryPressure !== 'number') throw new Error('memoryPressure should be number');
        if (typeof health.hitRatio !== 'number') throw new Error('hitRatio should be number');
        if (typeof health.totalEntries !== 'number') throw new Error('totalEntries should be number');
    });

    // Cleanup
    cacheManager.unload();

    console.log(`\n📊 Test Results:`);
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📈 Success Rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);

    return {
        passed: testsPassed,
        failed: testsFailed,
        total: testsPassed + testsFailed
    };
}

// Run tests if this file is executed directly
if (require.main === module) {
    runBasicCacheTests().catch(console.error);
}