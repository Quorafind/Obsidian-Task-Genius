import { App, TFile, Vault } from 'obsidian';
import { UnifiedCacheManager } from '../core/UnifiedCacheManager';
import { ParseEventManager } from '../core/ParseEventManager';
import { PluginManager } from '../core/PluginManager';
import { ParseContextFactory } from '../core/ParseContext';
import { TaskParsingService } from '../services/TaskParsingService';
import { WorkerPool } from '../workers/WorkerPool';
import { ProjectParserPlugin } from '../plugins/ProjectParserPlugin';
import { 
    ParsePriority, 
    CacheType, 
    ParserPluginType,
    TaskParseRequest 
} from '../types/ParsingTypes';
import { WorkerPoolConfig } from '../types/WorkerTypes';

interface MockFile extends TFile {
    path: string;
    name: string;
    basename: string;
    extension: string;
    stat: {
        ctime: number;
        mtime: number;
        size: number;
    };
}

class MockVault {
    private files = new Map<string, MockFile>();
    
    constructor() {
        this.setupMockFiles();
    }
    
    private setupMockFiles(): void {
        const now = Date.now();
        
        this.files.set('project1/README.md', {
            path: 'project1/README.md',
            name: 'README.md',
            basename: 'README',
            extension: 'md',
            stat: { ctime: now - 10000, mtime: now - 5000, size: 1024 }
        } as MockFile);
        
        this.files.set('project1/tasks.md', {
            path: 'project1/tasks.md',
            name: 'tasks.md',
            basename: 'tasks',
            extension: 'md',
            stat: { ctime: now - 8000, mtime: now - 3000, size: 2048 }
        } as MockFile);
        
        this.files.set('project2/canvas.canvas', {
            path: 'project2/canvas.canvas',
            name: 'canvas.canvas',
            basename: 'canvas',
            extension: 'canvas',
            stat: { ctime: now - 6000, mtime: now - 2000, size: 4096 }
        } as MockFile);
        
        this.files.set('meetings/schedule.ics', {
            path: 'meetings/schedule.ics',
            name: 'schedule.ics',
            basename: 'schedule',
            extension: 'ics',
            stat: { ctime: now - 4000, mtime: now - 1000, size: 512 }
        } as MockFile);
    }
    
    getAbstractFileByPath(path: string): MockFile | null {
        return this.files.get(path) || null;
    }
    
    getAllLoadedFiles(): MockFile[] {
        return Array.from(this.files.values());
    }
    
    on(event: string, callback: Function) {
        return { unsubscribe: () => {} };
    }
}

class MockMetadataCache {
    private events = new Map<string, Function[]>();
    
    trigger(event: string, ...args: any[]) {
        const listeners = this.events.get(event) || [];
        listeners.forEach(listener => listener(...args));
    }
    
    on(event: string, callback: Function) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event)!.push(callback);
        
        return {
            unsubscribe: () => {
                const listeners = this.events.get(event) || [];
                const index = listeners.indexOf(callback);
                if (index !== -1) {
                    listeners.splice(index, 1);
                }
            }
        };
    }
    
    off(event: string, callback: Function) {
        const listeners = this.events.get(event) || [];
        const index = listeners.indexOf(callback);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
    }
}

class MockApp {
    vault: MockVault;
    metadataCache: MockMetadataCache;
    
    constructor() {
        this.vault = new MockVault();
        this.metadataCache = new MockMetadataCache();
    }
}

interface TestResults {
    success: boolean;
    duration: number;
    parsedFiles: number;
    cacheHitRate: number;
    errors: string[];
    performanceMetrics: {
        averageParseTime: number;
        throughput: number;
        memoryUsage: number;
    };
}

export class IntegrationTest {
    private app: MockApp;
    private eventManager!: ParseEventManager;
    private cacheManager!: UnifiedCacheManager;
    private pluginManager!: PluginManager;
    private contextFactory!: ParseContextFactory;
    private taskParsingService!: TaskParsingService;
    private workerPool!: WorkerPool;
    
    private testResults: TestResults = {
        success: false,
        duration: 0,
        parsedFiles: 0,
        cacheHitRate: 0,
        errors: [],
        performanceMetrics: {
            averageParseTime: 0,
            throughput: 0,
            memoryUsage: 0
        }
    };
    
    constructor() {
        this.app = new MockApp();
    }
    
    async runFullIntegrationTest(): Promise<TestResults> {
        const startTime = Date.now();
        
        try {
            await this.setupComponents();
            await this.runParsingWorkload();
            await this.runCacheValidation();
            await this.runConcurrencyTest();
            await this.runMemoryTest();
            await this.runPerformanceTest();
            
            this.testResults.success = true;
            
        } catch (error) {
            this.testResults.success = false;
            this.testResults.errors.push(error instanceof Error ? error.message : String(error));
        } finally {
            this.testResults.duration = Date.now() - startTime;
            await this.cleanup();
        }
        
        return this.testResults;
    }
    
    private async setupComponents(): Promise<void> {
        this.eventManager = new ParseEventManager(this.app as any);
        this.cacheManager = new UnifiedCacheManager(this.app as any);
        this.cacheManager.setEventManager(this.eventManager);
        
        this.contextFactory = new ParseContextFactory(this.app as any);
        
        this.pluginManager = new PluginManager(this.app as any, this.eventManager, this.cacheManager);
        
        const projectPlugin = new ProjectParserPlugin(this.app as any, this.eventManager, this.cacheManager);
        await this.pluginManager.registerPlugin(ParserPluginType.PROJECT, projectPlugin);
        
        this.taskParsingService = new TaskParsingService(
            this.app as any,
            this.eventManager,
            this.cacheManager,
            this.pluginManager,
            this.contextFactory
        );
        
        const workerConfig: WorkerPoolConfig = {
            maxWorkers: 4,
            minWorkers: 2,
            idleTimeoutMs: 30000,
            healthCheckIntervalMs: 10000,
            maxTasksPerWorker: 100,
            workerTerminationTimeoutMs: 5000
        };
        
        this.workerPool = new WorkerPool(workerConfig, 'mock-worker-script.js');
        
        await this.initializeComponents();
    }
    
    private async initializeComponents(): Promise<void> {
        await Promise.all([
            this.eventManager.load(),
            this.cacheManager.load(),
            this.pluginManager.load(),
            this.contextFactory.load(),
            this.taskParsingService.load(),
            this.workerPool.load()
        ]);
    }
    
    private async runParsingWorkload(): Promise<void> {
        const files = this.app.vault.getAllLoadedFiles();
        const parsePromises: Promise<any>[] = [];
        
        for (const file of files) {
            const request: TaskParseRequest = {
                file: file as any,
                parserType: this.getParserTypeForFile(file),
                priority: ParsePriority.NORMAL,
                options: {
                    enableCaching: true,
                    validateResults: true
                }
            };
            
            parsePromises.push(this.taskParsingService.parseTask(request));
        }
        
        const results = await Promise.allSettled(parsePromises);
        
        let successCount = 0;
        for (const result of results) {
            if (result.status === 'fulfilled') {
                successCount++;
            } else {
                this.testResults.errors.push(`Parse failed: ${result.reason}`);
            }
        }
        
        this.testResults.parsedFiles = successCount;
    }
    
    private getParserTypeForFile(file: MockFile): ParserPluginType {
        if (file.extension === 'md') {
            return ParserPluginType.MARKDOWN;
        } else if (file.extension === 'canvas') {
            return ParserPluginType.CANVAS;
        } else if (file.extension === 'ics') {
            return ParserPluginType.ICS;
        } else {
            return ParserPluginType.METADATA;
        }
    }
    
    private async runCacheValidation(): Promise<void> {
        const stats = this.cacheManager.getStatistics();
        this.testResults.cacheHitRate = stats.hitRatio;
        
        const files = this.app.vault.getAllLoadedFiles();
        
        for (const file of files) {
            const cacheKey = `${file.path}-${this.getParserTypeForFile(file)}-${file.stat.mtime}`;
            const cachedResult = this.cacheManager.get(cacheKey, CacheType.TASK_PARSE);
            
            if (cachedResult) {
                const isValid = this.cacheManager.validateMtime(cacheKey, CacheType.TASK_PARSE, file.stat.mtime);
                if (!isValid) {
                    this.testResults.errors.push(`Invalid cache entry for ${file.path}`);
                }
            }
        }
        
        await this.cacheManager.bulkOptimization();
        
        const optimizedStats = this.cacheManager.getStatistics();
        if (optimizedStats.memory.entryCount > stats.memory.entryCount * 1.1) {
            this.testResults.errors.push('Cache optimization did not reduce memory usage');
        }
    }
    
    private async runConcurrencyTest(): Promise<void> {
        const concurrentTasks = 20;
        const files = this.app.vault.getAllLoadedFiles();
        const promises: Promise<any>[] = [];
        
        for (let i = 0; i < concurrentTasks; i++) {
            const file = files[i % files.length];
            const request: TaskParseRequest = {
                file: file as any,
                parserType: this.getParserTypeForFile(file),
                priority: ParsePriority.HIGH,
                options: { enableCaching: true }
            };
            
            promises.push(this.taskParsingService.parseTask(request));
        }
        
        const startTime = Date.now();
        const results = await Promise.allSettled(promises);
        const duration = Date.now() - startTime;
        
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        const throughput = successCount / (duration / 1000);
        
        this.testResults.performanceMetrics.throughput = throughput;
        
        if (successCount < concurrentTasks * 0.9) {
            this.testResults.errors.push(`Concurrency test failed: ${successCount}/${concurrentTasks} succeeded`);
        }
    }
    
    private async runMemoryTest(): Promise<void> {
        const initialStats = this.cacheManager.getStatistics();
        const initialMemory = initialStats.memory.estimatedBytes;
        
        for (let i = 0; i < 100; i++) {
            const mockFile = {
                path: `test-${i}.md`,
                name: `test-${i}.md`,
                basename: `test-${i}`,
                extension: 'md',
                stat: { ctime: Date.now(), mtime: Date.now(), size: 1024 }
            } as MockFile;
            
            const request: TaskParseRequest = {
                file: mockFile as any,
                parserType: ParserPluginType.MARKDOWN,
                priority: ParsePriority.LOW,
                options: {}
            };
            
            await this.taskParsingService.parseTask(request);
        }
        
        const finalStats = this.cacheManager.getStatistics();
        const finalMemory = finalStats.memory.estimatedBytes;
        const memoryIncrease = finalMemory - initialMemory;
        
        this.testResults.performanceMetrics.memoryUsage = memoryIncrease;
        
        if (memoryIncrease > 1024 * 1024) {
            this.testResults.errors.push(`Excessive memory usage: ${memoryIncrease} bytes`);
        }
        
        this.cacheManager.cleanup();
        
        const cleanedStats = this.cacheManager.getStatistics();
        if (cleanedStats.memory.estimatedBytes > finalMemory * 0.8) {
            this.testResults.errors.push('Memory cleanup was not effective');
        }
    }
    
    private async runPerformanceTest(): Promise<void> {
        const iterations = 50;
        const times: number[] = [];
        const files = this.app.vault.getAllLoadedFiles();
        
        for (let i = 0; i < iterations; i++) {
            const file = files[i % files.length];
            const startTime = Date.now();
            
            const request: TaskParseRequest = {
                file: file as any,
                parserType: this.getParserTypeForFile(file),
                priority: ParsePriority.NORMAL,
                options: {}
            };
            
            await this.taskParsingService.parseTask(request);
            const duration = Date.now() - startTime;
            times.push(duration);
        }
        
        const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
        const maxTime = Math.max(...times);
        const minTime = Math.min(...times);
        
        this.testResults.performanceMetrics.averageParseTime = averageTime;
        
        if (averageTime > 100) {
            this.testResults.errors.push(`Slow average parse time: ${averageTime}ms`);
        }
        
        if (maxTime > 500) {
            this.testResults.errors.push(`Slow max parse time: ${maxTime}ms`);
        }
        
        const variance = times.reduce((sum, time) => sum + Math.pow(time - averageTime, 2), 0) / times.length;
        const standardDeviation = Math.sqrt(variance);
        
        if (standardDeviation > averageTime * 0.5) {
            this.testResults.errors.push(`High parse time variance: ${standardDeviation}ms std dev`);
        }
    }
    
    private async cleanup(): Promise<void> {
        try {
            await Promise.all([
                this.workerPool?.shutdown(),
                this.taskParsingService?.unload(),
                this.pluginManager?.unload(),
                this.contextFactory?.unload(),
                this.cacheManager?.unload(),
                this.eventManager?.unload()
            ]);
        } catch (error) {
            this.testResults.errors.push(`Cleanup failed: ${error}`);
        }
    }
}

export async function runIntegrationTests(): Promise<TestResults> {
    const test = new IntegrationTest();
    return await test.runFullIntegrationTest();
}

export function validateTestResults(results: TestResults): boolean {
    if (!results.success) {
        console.error('Integration test failed');
        results.errors.forEach(error => console.error(`  - ${error}`));
        return false;
    }
    
    console.log('Integration test results:');
    console.log(`  Duration: ${results.duration}ms`);
    console.log(`  Parsed files: ${results.parsedFiles}`);
    console.log(`  Cache hit rate: ${(results.cacheHitRate * 100).toFixed(1)}%`);
    console.log(`  Average parse time: ${results.performanceMetrics.averageParseTime.toFixed(1)}ms`);
    console.log(`  Throughput: ${results.performanceMetrics.throughput.toFixed(1)} ops/sec`);
    console.log(`  Memory usage: ${(results.performanceMetrics.memoryUsage / 1024).toFixed(1)} KB`);
    
    if (results.errors.length > 0) {
        console.warn('Test warnings:');
        results.errors.forEach(error => console.warn(`  - ${error}`));
    }
    
    return true;
}

if (typeof window === 'undefined' && typeof process !== 'undefined') {
    runIntegrationTests()
        .then(results => {
            const success = validateTestResults(results);
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Integration test crashed:', error);
            process.exit(1);
        });
}