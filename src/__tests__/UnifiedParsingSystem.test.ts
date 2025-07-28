/**
 * Comprehensive Tests for Unified Parsing System
 * 
 * Tests for the new integrated parsing system with event management,
 * unified caching, worker optimization, and resource management.
 */

import { App, Component, TFile } from 'obsidian';
import { TaskManager } from '../utils/TaskManager';
import { UnifiedCacheManager } from '../parsing/core/UnifiedCacheManager';
import { ParseEventManager } from '../parsing/core/ParseEventManager';
import { UnifiedWorkerManager } from '../parsing/managers/UnifiedWorkerManager';
import { ResourceManager } from '../parsing/core/ResourceManager';
import { ParseEventType } from '../parsing/events/ParseEvents';
import { CacheType } from '../parsing/types/ParsingTypes';

// Mock Obsidian components
jest.mock('obsidian', () => ({
    App: jest.fn(),
    Component: class MockComponent {
        public registerEvent = jest.fn();
        public addChild = jest.fn();
        public onunload = jest.fn();
        public unload = jest.fn();
    },
    TFile: jest.fn(),
    MetadataCache: jest.fn(),
    Vault: jest.fn()
}));

describe('Unified Parsing System Integration Tests', () => {
    let app: App;
    let taskManager: TaskManager;
    let unifiedCacheManager: UnifiedCacheManager;
    let parseEventManager: ParseEventManager;
    let workerManager: UnifiedWorkerManager;
    let resourceManager: ResourceManager;

    beforeEach(async () => {
        // Setup mock app
        app = new App();
        (app as any).vault = {
            on: jest.fn(),
            off: jest.fn(),
            trigger: jest.fn()
        };
        (app as any).metadataCache = {
            on: jest.fn(),
            off: jest.fn(),
            trigger: jest.fn()
        };

        // Initialize components
        unifiedCacheManager = new UnifiedCacheManager(app);
        parseEventManager = new ParseEventManager(app);
        workerManager = new UnifiedWorkerManager(app);
        resourceManager = new ResourceManager();

        // Initialize TaskManager with new parsing system
        taskManager = new TaskManager(app, {});
        await taskManager.initializeNewParsingSystem();
    });

    afterEach(async () => {
        // Cleanup
        if (taskManager) {
            await taskManager.cleanup();
        }
        if (unifiedCacheManager) {
            unifiedCacheManager.onunload();
        }
        if (parseEventManager) {
            parseEventManager.onunload();
        }
        if (resourceManager) {
            await resourceManager.cleanupAllResources();
        }
    });

    describe('Cache Performance Tests', () => {
        test('should handle large-scale cache operations efficiently', async () => {
            const testData = Array.from({ length: 1000 }, (_, i) => ({
                key: `test-key-${i}`,
                data: { content: `Test content ${i}`, timestamp: Date.now() + i }
            }));

            const startTime = performance.now();

            // Batch SET operations
            for (const { key, data } of testData) {
                unifiedCacheManager.set(key, data, CacheType.PARSED_CONTENT);
            }

            const setTime = performance.now() - startTime;

            // Batch GET operations
            const getStartTime = performance.now();
            let hits = 0;

            for (const { key } of testData) {
                const result = unifiedCacheManager.get(key, CacheType.PARSED_CONTENT);
                if (result) hits++;
            }

            const getTime = performance.now() - getStartTime;
            const hitRate = hits / testData.length;

            console.log(`Cache Performance Test Results:
                SET operations: ${testData.length} items in ${setTime.toFixed(2)}ms
                GET operations: ${testData.length} items in ${getTime.toFixed(2)}ms
                Hit rate: ${(hitRate * 100).toFixed(1)}%
                Avg SET time: ${(setTime / testData.length).toFixed(3)}ms per item
                Avg GET time: ${(getTime / testData.length).toFixed(3)}ms per item`);

            expect(hitRate).toBeGreaterThan(0.95); // 95% hit rate
            expect(setTime / testData.length).toBeLessThan(1); // Less than 1ms per SET
            expect(getTime / testData.length).toBeLessThan(0.5); // Less than 0.5ms per GET
        });

        test('should handle memory pressure correctly', async () => {
            const largeDataItems = Array.from({ length: 100 }, (_, i) => ({
                key: `large-item-${i}`,
                data: { 
                    content: 'x'.repeat(10000), // 10KB per item
                    metadata: Array.from({ length: 100 }, (_, j) => ({ id: j, value: `meta-${i}-${j}` }))
                }
            }));

            // Fill cache with large items
            for (const { key, data } of largeDataItems) {
                unifiedCacheManager.set(key, data, CacheType.PARSED_CONTENT);
            }

            // Get cache analysis
            const analysis = await unifiedCacheManager.getStats();
            
            expect(analysis).toBeDefined();
            expect(analysis.total.entryCount).toBeGreaterThan(0);
            expect(analysis.pressure).toBeDefined();
            expect(analysis.pressure.level).toMatch(/^(low|medium|high|critical)$/);

            console.log(`Memory Pressure Test Results:
                Total entries: ${analysis.total.entryCount}
                Estimated memory: ${analysis.total.estimatedBytes} bytes
                Pressure level: ${analysis.pressure.level}
                Recommendations: ${analysis.pressure.recommendations.join(', ')}`);
        });
    });

    describe('Event System Integration Tests', () => {
        test('should emit and handle parsing events correctly', async () => {
            const eventsSeen: string[] = [];
            
            // Subscribe to various events
            parseEventManager.subscribe(ParseEventType.PARSE_STARTED, (data) => {
                eventsSeen.push(`PARSE_STARTED: ${data.filePath}`);
            });

            parseEventManager.subscribe(ParseEventType.PARSE_COMPLETED, (data) => {
                eventsSeen.push(`PARSE_COMPLETED: ${data.filePath} (${data.tasksFound} tasks)`);
            });

            parseEventManager.subscribe(ParseEventType.CACHE_HIT, (data) => {
                eventsSeen.push(`CACHE_HIT: ${data.key}`);
            });

            // Simulate parsing workflow
            await parseEventManager.emit(ParseEventType.PARSE_STARTED, {
                filePath: '/test/file.md',
                source: 'test'
            });

            await parseEventManager.emit(ParseEventType.PARSE_COMPLETED, {
                filePath: '/test/file.md',
                tasksFound: 5,
                parseTime: 100,
                source: 'test'
            });

            await parseEventManager.emit(ParseEventType.CACHE_HIT, {
                key: 'test-cache-key',
                cacheType: CacheType.PARSED_CONTENT,
                retrievalTime: 2,
                source: 'test'
            });

            // Wait for events to be processed
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(eventsSeen).toHaveLength(3);
            expect(eventsSeen[0]).toContain('PARSE_STARTED: /test/file.md');
            expect(eventsSeen[1]).toContain('PARSE_COMPLETED: /test/file.md (5 tasks)');
            expect(eventsSeen[2]).toContain('CACHE_HIT: test-cache-key');

            console.log('Event System Test Results:', eventsSeen);
        });

        test('should handle async workflow orchestration', async () => {
            const workflowEvents: string[] = [];

            // Subscribe to workflow events
            parseEventManager.subscribe(ParseEventType.WORKFLOW_STARTED, (data) => {
                workflowEvents.push(`Workflow started: ${data.workflowType} for ${data.filePath}`);
            });

            parseEventManager.subscribe(ParseEventType.WORKFLOW_COMPLETED, (data) => {
                workflowEvents.push(`Workflow completed: ${data.workflowType} for ${data.filePath}`);
            });

            // Test multiple concurrent workflows
            const testFiles = ['/test/file1.md', '/test/file2.md', '/test/file3.md'];
            
            const workflows = testFiles.map(filePath => 
                parseEventManager.processAsyncTaskFlow('parse', filePath, { priority: 'normal' })
            );

            const results = await Promise.all(workflows);

            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(result.success).toBe(true);
                expect(result.duration).toBeGreaterThan(0);
            });

            console.log('Async Workflow Test Results:', workflowEvents);
        }, 10000); // Increase timeout for async operations
    });

    describe('Worker System Optimization Tests', () => {
        test('should optimize batch processing with deduplication', async () => {
            const operations = [
                { type: 'parse', filePath: '/test/file1.md', content: 'Task 1: Test content' },
                { type: 'parse', filePath: '/test/file1.md', content: 'Task 1: Test content' }, // Duplicate
                { type: 'parse', filePath: '/test/file2.md', content: 'Task 2: Different content' },
                { type: 'validate', filePath: '/test/file3.md', content: 'Task 3: Validation content' },
                { type: 'parse', filePath: '/test/file1.md', content: 'Task 1: Test content' }, // Another duplicate
            ];

            const startTime = performance.now();
            const results = await workerManager.processOptimizedBatch(operations);
            const processingTime = performance.now() - startTime;

            expect(results).toBeDefined();
            expect(results.length).toBeLessThan(operations.length); // Should have deduplicated
            expect(processingTime).toBeLessThan(1000); // Should complete within 1 second

            console.log(`Worker Optimization Test Results:
                Original operations: ${operations.length}
                Processed operations: ${results.length}
                Processing time: ${processingTime.toFixed(2)}ms
                Deduplication ratio: ${((operations.length - results.length) / operations.length * 100).toFixed(1)}%`);
        });

        test('should handle concurrent worker operations efficiently', async () => {
            const concurrentOperations = Array.from({ length: 50 }, (_, i) => ({
                type: 'parse',
                filePath: `/test/concurrent-file-${i}.md`,
                content: `# Task ${i}\n- [ ] Test task ${i}`
            }));

            const startTime = performance.now();
            
            // Process operations concurrently
            const promises = concurrentOperations.map(op => 
                workerManager.processOptimizedBatch([op])
            );

            const results = await Promise.all(promises);
            const totalTime = performance.now() - startTime;

            expect(results).toHaveLength(50);
            expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds

            console.log(`Concurrent Worker Test Results:
                Operations: ${concurrentOperations.length}
                Total time: ${totalTime.toFixed(2)}ms
                Average time per operation: ${(totalTime / concurrentOperations.length).toFixed(2)}ms`);
        });
    });

    describe('Resource Management Tests', () => {
        test('should track and cleanup resources automatically', async () => {
            // Register test resources
            const testInterval = setInterval(() => {
                console.log('Test interval running');
            }, 1000);

            resourceManager.registerResource({
                id: 'test-interval',
                type: 'timer',
                priority: 'medium',
                cleanup: () => clearInterval(testInterval),
                getMetrics: () => ({ active: true, lastRun: Date.now() })
            });

            const testTimeout = setTimeout(() => {
                console.log('Test timeout executed');
            }, 5000);

            resourceManager.registerResource({
                id: 'test-timeout',
                type: 'timer',
                priority: 'low',
                cleanup: () => clearTimeout(testTimeout),
                getMetrics: () => ({ active: true, scheduledFor: Date.now() + 5000 })
            });

            // Check resource tracking
            const stats = resourceManager.getStats();
            expect(stats.totalResources).toBe(2);
            expect(stats.resourcesByType.timer).toBe(2);

            // Test resource cleanup
            await resourceManager.cleanupResourcesByType('timer');
            
            const statsAfterCleanup = resourceManager.getStats();
            expect(statsAfterCleanup.totalResources).toBe(0);

            console.log('Resource Management Test Results:', {
                beforeCleanup: stats,
                afterCleanup: statsAfterCleanup
            });
        });

        test('should detect and report resource leaks', async () => {
            // Create some long-running resources
            const longRunningResources = Array.from({ length: 5 }, (_, i) => {
                const interval = setInterval(() => {}, 100);
                resourceManager.registerResource({
                    id: `long-running-${i}`,
                    type: 'timer',
                    priority: 'low',
                    cleanup: () => clearInterval(interval),
                    getMetrics: () => ({ 
                        active: true, 
                        createdAt: Date.now() - (60000 * (i + 1)), // Created 1-5 minutes ago
                        lastActivity: Date.now() - (30000 * (i + 1)) // Last active 0.5-2.5 minutes ago
                    })
                });
                return interval;
            });

            // Simulate memory leak detection
            const leakDetectionResult = await taskManager.performMemoryLeakDetection();
            
            expect(leakDetectionResult).toBeDefined();
            expect(leakDetectionResult.resourceAnalysis.totalResources).toBe(5);
            expect(leakDetectionResult.resourceAnalysis.staleResources).toBeGreaterThan(0);
            expect(leakDetectionResult.overall.systemHealth).toMatch(/^(healthy|warning|critical)$/);

            console.log('Memory Leak Detection Results:', leakDetectionResult);

            // Cleanup
            longRunningResources.forEach(interval => clearInterval(interval));
            await resourceManager.cleanupAllResources();
        });
    });

    describe('Long-term Stability Tests', () => {
        test('should maintain performance under sustained load', async () => {
            const testDuration = 10000; // 10 seconds
            const operationInterval = 100; // Every 100ms
            
            const stabilityResult = await taskManager.performLongTermStabilityTest(testDuration, operationInterval);
            
            expect(stabilityResult).toBeDefined();
            expect(stabilityResult.metrics.totalOperations).toBeGreaterThan(50); // Should perform many operations
            expect(stabilityResult.metrics.successRate).toBeGreaterThan(0.95); // 95% success rate
            expect(stabilityResult.metrics.stabilityScore).toBeGreaterThan(0.8); // 80% stability score
            expect(stabilityResult.performance.memoryGrowthRate).toBeLessThan(10); // Less than 10MB/min growth

            console.log('Long-term Stability Test Results:', {
                totalOperations: stabilityResult.metrics.totalOperations,
                successRate: `${(stabilityResult.metrics.successRate * 100).toFixed(1)}%`,
                stabilityScore: `${(stabilityResult.metrics.stabilityScore * 100).toFixed(1)}%`,
                memoryGrowth: `${stabilityResult.performance.memoryGrowthRate.toFixed(2)} MB/min`,
                avgResponseTime: `${stabilityResult.performance.averageResponseTime.toFixed(2)}ms`
            });
        }, 15000); // Extended timeout for long-term test
    });

    describe('End-to-End Integration Tests', () => {
        test('should perform complete parsing workflow', async () => {
            const testResult = await taskManager.testEndToEndParsingFlow();
            
            expect(testResult).toBeDefined();
            expect(testResult.overallSuccess).toBe(true);
            expect(testResult.stages.systemInitialization.success).toBe(true);
            expect(testResult.stages.eventSystemIntegration.success).toBe(true);
            expect(testResult.stages.parsingWorkflow.success).toBe(true);
            expect(testResult.stages.systemIntegration.success).toBe(true);

            console.log('End-to-End Integration Test Summary:', {
                overallSuccess: testResult.overallSuccess,
                systemInitialization: testResult.stages.systemInitialization.success,
                eventSystemIntegration: testResult.stages.eventSystemIntegration.success,
                parsingWorkflow: testResult.stages.parsingWorkflow.success,
                systemIntegration: testResult.stages.systemIntegration.success,
                recommendations: testResult.recommendations
            });
        });

        test('should validate cache and parsing context integration', async () => {
            const cacheTestResult = await taskManager.testCachePerformanceAndMemory();
            const contextTestResult = await taskManager.testParseContextAndMetadata();

            expect(cacheTestResult.success).toBe(true);
            expect(contextTestResult.success).toBe(true);

            expect(cacheTestResult.cacheOperations.hitRate).toBeGreaterThan(0.8);
            expect(contextTestResult.performance.avgCreationTime).toBeLessThan(50); // Less than 50ms

            console.log('Cache and Context Integration Results:', {
                cacheHitRate: `${(cacheTestResult.cacheOperations.hitRate * 100).toFixed(1)}%`,
                contextCreationTime: `${contextTestResult.performance.avgCreationTime.toFixed(2)}ms`,
                memoryIncrease: `${cacheTestResult.memoryUsage.memoryIncrease / 1024 / 1024} MB`,
                metadataLoadTime: `${contextTestResult.performance.avgMetadataLoadTime.toFixed(2)}ms`
            });
        });
    });
});