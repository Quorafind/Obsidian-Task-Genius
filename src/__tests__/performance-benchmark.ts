/**
 * Performance Benchmark for Unified Parsing System
 * 
 * Measures and compares performance metrics of the new integrated system.
 */

import { UnifiedCacheManager } from '../parsing/core/UnifiedCacheManager';
import { ParseEventManager } from '../parsing/core/ParseEventManager';
import { UnifiedWorkerManager } from '../parsing/managers/UnifiedWorkerManager';
import { CacheType } from '../parsing/types/ParsingTypes';
import { ParseEventType } from '../parsing/events/ParseEvents';

// Mock App for testing
class MockApp {
    public vault = { on: () => ({ unload: () => {} }), off: () => {}, trigger: () => {} };
    public metadataCache = { on: () => ({ unload: () => {} }), off: () => {}, trigger: () => {} };
}

interface BenchmarkResult {
    testName: string;
    operations: number;
    totalTime: number;
    averageTime: number;
    operationsPerSecond: number;
    memoryUsed?: number;
    details?: Record<string, any>;
}

class PerformanceBenchmark {
    private app: any;
    private results: BenchmarkResult[] = [];

    constructor() {
        this.app = new MockApp();
    }

    async runAllBenchmarks(): Promise<void> {
        console.log('🏃‍♂️ Starting Performance Benchmarks...\n');

        await this.benchmarkCacheOperations();
        await this.benchmarkEventSystem();
        await this.benchmarkWorkerSystem();
        await this.benchmarkIntegratedWorkflow();

        this.printSummary();
    }

    private async benchmarkCacheOperations(): Promise<void> {
        console.log('📦 Benchmarking Cache Operations...');
        
        const cacheManager = new UnifiedCacheManager(this.app);
        const testData = Array.from({ length: 1000 }, (_, i) => ({
            key: `bench-key-${i}`,
            data: { 
                id: i, 
                content: `Benchmark content ${i}`,
                metadata: { type: 'test', created: Date.now() + i },
                largeData: 'x'.repeat(1000) // 1KB per item
            }
        }));

        // Benchmark SET operations
        const setStartTime = performance.now();
        let memoryBefore = 0;
        
        if (typeof performance.memory !== 'undefined') {
            memoryBefore = (performance as any).memory.usedJSHeapSize;
        }

        testData.forEach(({ key, data }) => {
            cacheManager.set(key, data, CacheType.PARSED_CONTENT);
        });

        const setTime = performance.now() - setStartTime;
        
        let memoryAfter = 0;
        if (typeof performance.memory !== 'undefined') {
            memoryAfter = (performance as any).memory.usedJSHeapSize;
        }

        this.results.push({
            testName: 'Cache SET Operations',
            operations: testData.length,
            totalTime: setTime,
            averageTime: setTime / testData.length,
            operationsPerSecond: testData.length / (setTime / 1000),
            memoryUsed: memoryAfter - memoryBefore,
            details: { itemSize: '~1KB', cacheType: 'PARSED_CONTENT' }
        });

        // Benchmark GET operations
        const getStartTime = performance.now();
        let hits = 0;

        testData.forEach(({ key }) => {
            if (cacheManager.get(key, CacheType.PARSED_CONTENT)) {
                hits++;
            }
        });

        const getTime = performance.now() - getStartTime;
        const hitRate = hits / testData.length;

        this.results.push({
            testName: 'Cache GET Operations',
            operations: testData.length,
            totalTime: getTime,
            averageTime: getTime / testData.length,
            operationsPerSecond: testData.length / (getTime / 1000),
            details: { hitRate: `${(hitRate * 100).toFixed(1)}%`, hits }
        });

        // Benchmark cache analysis
        const analysisStartTime = performance.now();
        const stats = await cacheManager.getStats();
        const analysisTime = performance.now() - analysisStartTime;

        this.results.push({
            testName: 'Cache Analysis',
            operations: 1,
            totalTime: analysisTime,
            averageTime: analysisTime,
            operationsPerSecond: 1000 / analysisTime,
            details: { 
                totalEntries: stats.total.entryCount,
                estimatedBytes: stats.total.estimatedBytes,
                pressureLevel: stats.pressure.level
            }
        });

        cacheManager.onunload();
        console.log('   ✓ Cache operations benchmarked');
    }

    private async benchmarkEventSystem(): Promise<void> {
        console.log('📡 Benchmarking Event System...');
        
        const eventManager = new ParseEventManager(this.app);
        const eventCount = 1000;
        let eventsReceived = 0;

        // Setup event listener
        eventManager.subscribe(ParseEventType.PARSE_COMPLETED, () => {
            eventsReceived++;
        });

        // Benchmark event emission
        const startTime = performance.now();

        for (let i = 0; i < eventCount; i++) {
            await eventManager.emit(ParseEventType.PARSE_COMPLETED, {
                filePath: `/bench/file-${i}.md`,
                tasksFound: i % 10,
                parseTime: i % 50,
                source: 'benchmark'
            });
        }

        const totalTime = performance.now() - startTime;

        // Wait for all events to be processed
        await new Promise(resolve => setTimeout(resolve, 100));

        this.results.push({
            testName: 'Event Emission',
            operations: eventCount,
            totalTime: totalTime,
            averageTime: totalTime / eventCount,
            operationsPerSecond: eventCount / (totalTime / 1000),
            details: { 
                eventsReceived,
                receiveRate: `${(eventsReceived / eventCount * 100).toFixed(1)}%`
            }
        });

        // Benchmark async workflows
        const workflowStartTime = performance.now();
        const workflows = Array.from({ length: 50 }, (_, i) =>
            eventManager.processAsyncTaskFlow('parse', `/bench/workflow-${i}.md`, { priority: 'normal' })
        );

        const workflowResults = await Promise.all(workflows);
        const workflowTime = performance.now() - workflowStartTime;
        const successfulWorkflows = workflowResults.filter(r => r.success).length;

        this.results.push({
            testName: 'Async Workflows',
            operations: workflows.length,
            totalTime: workflowTime,
            averageTime: workflowTime / workflows.length,
            operationsPerSecond: workflows.length / (workflowTime / 1000),
            details: { 
                successful: successfulWorkflows,
                successRate: `${(successfulWorkflows / workflows.length * 100).toFixed(1)}%`
            }
        });

        eventManager.onunload();
        console.log('   ✓ Event system benchmarked');
    }

    private async benchmarkWorkerSystem(): Promise<void> {
        console.log('⚙️  Benchmarking Worker System...');
        
        const workerManager = new UnifiedWorkerManager(this.app);
        const operations = Array.from({ length: 200 }, (_, i) => ({
            type: 'parse',
            filePath: `/bench/worker-file-${i}.md`,
            content: `# Task ${i}\n- [ ] Benchmark task ${i}\n- [x] Completed task ${i}`
        }));

        // Benchmark basic batch processing
        const batchStartTime = performance.now();
        const batchResults = await workerManager.processOptimizedBatch(operations);
        const batchTime = performance.now() - batchStartTime;

        this.results.push({
            testName: 'Worker Batch Processing',
            operations: operations.length,
            totalTime: batchTime,
            averageTime: batchTime / operations.length,
            operationsPerSecond: operations.length / (batchTime / 1000),
            details: { 
                resultsCount: batchResults.length,
                processingRatio: `${(batchResults.length / operations.length * 100).toFixed(1)}%`
            }
        });

        // Benchmark cache-integrated processing
        const cacheStartTime = performance.now();
        const cacheResults = await workerManager.processWithUnifiedCache(operations);
        const cacheTime = performance.now() - cacheStartTime;

        this.results.push({
            testName: 'Worker Cache Integration',
            operations: operations.length,
            totalTime: cacheTime,
            averageTime: cacheTime / operations.length,
            operationsPerSecond: operations.length / (cacheTime / 1000),
            details: { 
                resultsCount: cacheResults.length,
                speedImprovement: `${((batchTime - cacheTime) / batchTime * 100).toFixed(1)}%`
            }
        });

        // Benchmark concurrent processing
        const concurrentStartTime = performance.now();
        const concurrentPromises = Array.from({ length: 20 }, (_, i) => {
            const ops = operations.slice(i * 10, (i + 1) * 10);
            return workerManager.processOptimizedBatch(ops);
        });

        const concurrentResults = await Promise.all(concurrentPromises);
        const concurrentTime = performance.now() - concurrentStartTime;
        const totalConcurrentOps = concurrentResults.reduce((sum, results) => sum + results.length, 0);

        this.results.push({
            testName: 'Concurrent Worker Processing',
            operations: totalConcurrentOps,
            totalTime: concurrentTime,
            averageTime: concurrentTime / totalConcurrentOps,
            operationsPerSecond: totalConcurrentOps / (concurrentTime / 1000),
            details: { 
                batches: concurrentPromises.length,
                avgBatchSize: Math.round(totalConcurrentOps / concurrentPromises.length)
            }
        });

        console.log('   ✓ Worker system benchmarked');
    }

    private async benchmarkIntegratedWorkflow(): Promise<void> {
        console.log('🔗 Benchmarking Integrated Workflow...');
        
        const cacheManager = new UnifiedCacheManager(this.app);
        const eventManager = new ParseEventManager(this.app);
        const workerManager = new UnifiedWorkerManager(this.app);

        const workflowData = Array.from({ length: 100 }, (_, i) => ({
            filePath: `/integrated/file-${i}.md`,
            content: `# Integrated Task ${i}\n- [ ] Process this task\n- [x] Already done task`,
            metadata: { type: 'integrated', index: i, created: Date.now() }
        }));

        // Benchmark full integrated workflow
        const workflowStartTime = performance.now();
        let processedFiles = 0;

        for (const file of workflowData) {
            // Step 1: Check cache
            const cacheKey = `integrated:${file.filePath}`;
            let result = cacheManager.get(cacheKey, CacheType.PARSED_CONTENT);

            if (!result) {
                // Step 2: Process with worker if not cached
                const workerResult = await workerManager.processOptimizedBatch([{
                    type: 'parse',
                    filePath: file.filePath,
                    content: file.content
                }]);

                // Step 3: Cache result
                result = { processed: true, tasks: workerResult.length, timestamp: Date.now() };
                cacheManager.set(cacheKey, result, CacheType.PARSED_CONTENT);

                // Step 4: Emit event
                await eventManager.emit(ParseEventType.PARSE_COMPLETED, {
                    filePath: file.filePath,
                    tasksFound: workerResult.length,
                    parseTime: 10,
                    source: 'integrated-workflow'
                });
            }

            processedFiles++;
        }

        const workflowTime = performance.now() - workflowStartTime;

        this.results.push({
            testName: 'Integrated Workflow (Cache + Workers + Events)',
            operations: workflowData.length,
            totalTime: workflowTime,
            averageTime: workflowTime / workflowData.length,
            operationsPerSecond: workflowData.length / (workflowTime / 1000),
            details: { 
                processedFiles,
                cacheEntries: (await cacheManager.getStats()).total.entryCount,
                workflow: 'check-cache → process → cache → emit-event'
            }
        });

        // Cleanup
        cacheManager.onunload();
        eventManager.onunload();
        
        console.log('   ✓ Integrated workflow benchmarked');
    }

    private printSummary(): void {
        console.log('\n📊 Performance Benchmark Summary\n');
        console.log('=' * 80);
        console.log(sprintf('%-40s %10s %12s %15s %12s', 'Test Name', 'Operations', 'Total (ms)', 'Avg (ms)', 'Ops/sec'));
        console.log('=' * 80);

        this.results.forEach(result => {
            console.log(sprintf(
                '%-40s %10d %12.2f %15.4f %12.1f',
                result.testName.substring(0, 40),
                result.operations,
                result.totalTime,
                result.averageTime,
                result.operationsPerSecond
            ));
        });

        console.log('=' * 80);

        // Performance analysis
        const fastestTest = this.results.reduce((fastest, current) => 
            current.operationsPerSecond > fastest.operationsPerSecond ? current : fastest
        );

        const slowestTest = this.results.reduce((slowest, current) => 
            current.operationsPerSecond < slowest.operationsPerSecond ? current : slowest
        );

        console.log('\n🏆 Performance Analysis:');
        console.log(`   Fastest: ${fastestTest.testName} (${fastestTest.operationsPerSecond.toFixed(1)} ops/sec)`);
        console.log(`   Slowest: ${slowestTest.testName} (${slowestTest.operationsPerSecond.toFixed(1)} ops/sec)`);

        const totalOperations = this.results.reduce((sum, r) => sum + r.operations, 0);
        const totalTime = this.results.reduce((sum, r) => sum + r.totalTime, 0);
        const overallOpsPerSec = totalOperations / (totalTime / 1000);

        console.log(`   Overall: ${totalOperations} operations in ${totalTime.toFixed(2)}ms (${overallOpsPerSec.toFixed(1)} ops/sec)`);

        // Memory usage summary
        const memoryResults = this.results.filter(r => r.memoryUsed);
        if (memoryResults.length > 0) {
            const totalMemory = memoryResults.reduce((sum, r) => sum + (r.memoryUsed || 0), 0);
            console.log(`   Memory: ${(totalMemory / 1024 / 1024).toFixed(2)} MB total used`);
        }

        console.log('\n✅ Benchmark completed successfully!');
    }
}

// Simple sprintf implementation for formatting
function sprintf(format: string, ...args: any[]): string {
    let i = 0;
    return format.replace(/%[sdif%]/g, (match) => {
        if (match === '%%') return '%';
        if (i >= args.length) return match;
        
        const arg = args[i++];
        switch (match) {
            case '%s': return String(arg);
            case '%d': return String(Math.floor(arg));
            case '%i': return String(Math.floor(arg));
            case '%f': return String(Number(arg));
            default: return match;
        }
    });
}

// Alternative formatting for the table
function sprintf(format: string, ...args: any[]): string {
    return format.replace(/%-?(\d+)s|%-?(\d+)d|%-?(\d+\.\d+)f/g, (match, sWidth, dWidth, fWidth) => {
        const arg = args.shift();
        if (sWidth) {
            return String(arg).padEnd(parseInt(sWidth));
        } else if (dWidth) {
            return String(arg).padStart(parseInt(dWidth));
        } else if (fWidth) {
            const [width, precision] = fWidth.split('.');
            return Number(arg).toFixed(parseInt(precision)).padStart(parseInt(width));
        }
        return String(arg);
    });
}

// Run benchmark if this file is executed directly
if (require.main === module) {
    const benchmark = new PerformanceBenchmark();
    benchmark.runAllBenchmarks().catch(error => {
        console.error('Fatal error during benchmarking:', error);
        process.exit(1);
    });
}

export { PerformanceBenchmark };