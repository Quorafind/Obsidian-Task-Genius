/**
 * Simple test runner for the new Unified Parsing System
 * 
 * This script directly tests the core functionality without relying on Jest,
 * providing immediate feedback on the system's status.
 */

import { App } from 'obsidian';
import { UnifiedCacheManager } from '../parsing/core/UnifiedCacheManager';
import { ParseEventManager } from '../parsing/core/ParseEventManager';
import { UnifiedWorkerManager } from '../parsing/managers/UnifiedWorkerManager';
import { ResourceManager } from '../parsing/core/ResourceManager';
import { CacheType } from '../parsing/types/ParsingTypes';
import { ParseEventType } from '../parsing/events/ParseEvents';

// Mock App class for testing
class MockApp {
    public vault = {
        on: () => ({ unload: () => {} }),
        off: () => {},
        trigger: () => {}
    };
    
    public metadataCache = {
        on: () => ({ unload: () => {} }),
        off: () => {},
        trigger: () => {}
    };
}

class UnifiedParsingSystemTester {
    private app: App;
    private cacheManager: UnifiedCacheManager;
    private eventManager: ParseEventManager;
    private workerManager: UnifiedWorkerManager;
    private resourceManager: ResourceManager;

    constructor() {
        this.app = new MockApp() as unknown as App;
        this.cacheManager = new UnifiedCacheManager(this.app);
        this.eventManager = new ParseEventManager(this.app);
        this.workerManager = new UnifiedWorkerManager(this.app);
        this.resourceManager = new ResourceManager();
    }

    async runAllTests(): Promise<void> {
        console.log('🚀 Starting Unified Parsing System Tests...\n');

        try {
            await this.testCacheManager();
            await this.testEventManager();
            await this.testWorkerManager();
            await this.testResourceManager();
            await this.testIntegration();

            console.log('\n✅ All tests completed successfully!');
        } catch (error) {
            console.error('\n❌ Tests failed:', error);
        } finally {
            await this.cleanup();
        }
    }

    private async testCacheManager(): Promise<void> {
        console.log('📦 Testing UnifiedCacheManager...');

        // Test basic cache operations
        const testData = { content: 'Test content', timestamp: Date.now() };
        
        this.cacheManager.set('test-key', testData, CacheType.PARSED_CONTENT);
        const retrieved = this.cacheManager.get('test-key', CacheType.PARSED_CONTENT);
        
        if (!retrieved || retrieved.content !== testData.content) {
            throw new Error('Cache SET/GET operation failed');
        }

        // Test batch operations
        const batchData = Array.from({ length: 100 }, (_, i) => ({
            key: `batch-key-${i}`,
            data: { id: i, content: `Content ${i}` }
        }));

        const startTime = performance.now();
        
        batchData.forEach(({ key, data }) => {
            this.cacheManager.set(key, data, CacheType.PARSED_CONTENT);
        });

        const setTime = performance.now() - startTime;
        
        const getStartTime = performance.now();
        let hits = 0;
        
        batchData.forEach(({ key }) => {
            if (this.cacheManager.get(key, CacheType.PARSED_CONTENT)) {
                hits++;
            }
        });

        const getTime = performance.now() - getStartTime;
        const hitRate = hits / batchData.length;

        console.log(`   ✓ Batch operations: ${batchData.length} items`);
        console.log(`   ✓ SET time: ${setTime.toFixed(2)}ms (${(setTime / batchData.length).toFixed(3)}ms per item)`);
        console.log(`   ✓ GET time: ${getTime.toFixed(2)}ms (${(getTime / batchData.length).toFixed(3)}ms per item)`);
        console.log(`   ✓ Hit rate: ${(hitRate * 100).toFixed(1)}%`);

        if (hitRate < 0.95) {
            throw new Error(`Cache hit rate too low: ${hitRate}`);
        }

        // Test cache statistics
        const stats = await this.cacheManager.getStats();
        if (!stats || !stats.total) {
            throw new Error('Cache statistics not available');
        }

        console.log(`   ✓ Cache statistics: ${stats.total.entryCount} entries, ${stats.total.estimatedBytes} bytes`);
        console.log(`   ✓ Memory pressure: ${stats.pressure.level}`);
    }

    private async testEventManager(): Promise<void> {
        console.log('\n📡 Testing ParseEventManager...');

        let eventReceived = false;
        let eventData: any = null;

        // Subscribe to test event
        this.eventManager.subscribe(ParseEventType.PARSE_STARTED, (data) => {
            eventReceived = true;
            eventData = data;
        });

        // Emit test event
        await this.eventManager.emit(ParseEventType.PARSE_STARTED, {
            filePath: '/test/file.md',
            source: 'test-runner'
        });

        // Wait for event processing
        await new Promise(resolve => setTimeout(resolve, 100));

        if (!eventReceived) {
            throw new Error('Event was not received');
        }

        if (!eventData || eventData.filePath !== '/test/file.md') {
            throw new Error('Event data was not correctly transmitted');
        }

        console.log('   ✓ Event subscription and emission working');
        console.log(`   ✓ Event data: ${JSON.stringify(eventData)}`);

        // Test async workflow
        const workflowResult = await this.eventManager.processAsyncTaskFlow('parse', '/test/workflow.md', { priority: 'normal' });
        
        if (!workflowResult.success) {
            throw new Error('Async workflow failed');
        }

        console.log(`   ✓ Async workflow completed in ${workflowResult.duration}ms`);
    }

    private async testWorkerManager(): Promise<void> {
        console.log('\n⚙️  Testing UnifiedWorkerManager...');

        const testOperations = [
            { type: 'parse', filePath: '/test/file1.md', content: '- [ ] Task 1' },
            { type: 'parse', filePath: '/test/file2.md', content: '- [ ] Task 2' },
            { type: 'validate', filePath: '/test/file3.md', content: '- [x] Task 3' }
        ];

        const startTime = performance.now();
        const results = await this.workerManager.processOptimizedBatch(testOperations);
        const processingTime = performance.now() - startTime;

        if (!results || results.length === 0) {
            throw new Error('Worker processing returned no results');
        }

        console.log(`   ✓ Processed ${testOperations.length} operations in ${processingTime.toFixed(2)}ms`);
        console.log(`   ✓ Average processing time: ${(processingTime / testOperations.length).toFixed(2)}ms per operation`);

        // Test worker cache integration
        const cacheResult = await this.workerManager.processWithUnifiedCache(testOperations);
        
        if (!cacheResult || cacheResult.length === 0) {
            throw new Error('Worker cache processing failed');
        }

        console.log(`   ✓ Cache-integrated processing completed`);

        // Test worker monitoring
        const monitoringResult = await this.workerManager.monitorAndOptimizeWorkers();
        
        if (!monitoringResult || !monitoringResult.healthScore) {
            throw new Error('Worker monitoring failed');
        }

        console.log(`   ✓ Worker health score: ${(monitoringResult.healthScore * 100).toFixed(1)}%`);
        console.log(`   ✓ Optimization recommendations: ${monitoringResult.recommendations.length}`);
    }

    private async testResourceManager(): Promise<void> {
        console.log('\n🔧 Testing ResourceManager...');

        // Register test resources
        const testInterval = setInterval(() => {}, 1000);
        
        this.resourceManager.registerResource({
            id: 'test-interval-1',
            type: 'timer',
            priority: 'medium',
            cleanup: () => clearInterval(testInterval),
            getMetrics: () => ({ active: true, createdAt: Date.now() })
        });

        const testTimeout = setTimeout(() => {}, 5000);
        
        this.resourceManager.registerResource({
            id: 'test-timeout-1',
            type: 'timer',
            priority: 'low',
            cleanup: () => clearTimeout(testTimeout),
            getMetrics: () => ({ active: true, scheduledFor: Date.now() + 5000 })
        });

        // Test resource tracking
        const stats = this.resourceManager.getStats();
        
        if (stats.totalResources !== 2) {
            throw new Error(`Expected 2 resources, got ${stats.totalResources}`);
        }

        if (stats.resourcesByType.timer !== 2) {
            throw new Error(`Expected 2 timer resources, got ${stats.resourcesByType.timer}`);
        }

        console.log(`   ✓ Resource tracking: ${stats.totalResources} total resources`);
        console.log(`   ✓ Resource types: ${Object.keys(stats.resourcesByType).join(', ')}`);

        // Test resource cleanup
        await this.resourceManager.cleanupResourcesByType('timer');
        
        const statsAfterCleanup = this.resourceManager.getStats();
        
        if (statsAfterCleanup.totalResources !== 0) {
            throw new Error(`Expected 0 resources after cleanup, got ${statsAfterCleanup.totalResources}`);
        }

        console.log(`   ✓ Resource cleanup: ${statsAfterCleanup.totalResources} resources remaining`);
    }

    private async testIntegration(): Promise<void> {
        console.log('\n🔗 Testing System Integration...');

        // Test event-cache integration
        let cacheEventReceived = false;
        
        this.eventManager.subscribe(ParseEventType.CACHE_HIT, () => {
            cacheEventReceived = true;
        });

        // Trigger cache operation that should emit event
        this.cacheManager.set('integration-test', { data: 'test' }, CacheType.PARSED_CONTENT);
        this.cacheManager.get('integration-test', CacheType.PARSED_CONTENT);

        await new Promise(resolve => setTimeout(resolve, 100));

        console.log(`   ✓ Event-cache integration: ${cacheEventReceived ? 'working' : 'not working'}`);

        // Test resource-event integration
        this.resourceManager.registerResource({
            id: 'integration-resource',
            type: 'other',
            priority: 'high',
            cleanup: () => console.log('Integration resource cleaned up'),
            getMetrics: () => ({ integration: true })
        });

        const integrationStats = this.resourceManager.getStats();
        console.log(`   ✓ Resource-event integration: ${integrationStats.totalResources} resource registered`);

        // Test worker-cache integration
        const workerCacheOperations = [
            { type: 'parse', filePath: '/integration/test.md', content: '- [ ] Integration test' }
        ];

        const workerCacheResult = await this.workerManager.processWithUnifiedCache(workerCacheOperations);
        console.log(`   ✓ Worker-cache integration: ${workerCacheResult.length} operations processed`);
    }

    private async cleanup(): Promise<void> {
        console.log('\n🧹 Cleaning up...');
        
        try {
            await this.resourceManager.cleanupAllResources();
            this.eventManager.onunload();
            this.cacheManager.onunload();
            console.log('   ✓ Cleanup completed');
        } catch (error) {
            console.error('   ❌ Cleanup failed:', error);
        }
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const tester = new UnifiedParsingSystemTester();
    tester.runAllTests().catch(error => {
        console.error('Fatal error during testing:', error);
        process.exit(1);
    });
}

export { UnifiedParsingSystemTester };