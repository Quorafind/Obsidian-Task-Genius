/**
 * Unified Worker Manager
 *
 * Manages the unified parsing worker for all parsing operations.
 * Consolidates task parsing, project detection, and metadata processing
 * into a single efficient worker management system.
 */

import { Component, TFile, Vault, MetadataCache } from "obsidian";
import { Task, TgProject } from "../../types/task";
import { SupportedFileType, ParsePriority, CacheType } from "../types/ParsingTypes";
import { UnifiedCacheManager } from "../core/UnifiedCacheManager";
import { ParseEventManager } from "../core/ParseEventManager";
import { ParseEventType } from "../events/ParseEvents";

// Import the unified worker
// @ts-ignore Ignore type error for worker import
import UnifiedParsingWorker from "../workers/Parsing.worker";

// Import legacy message types for backward compatibility
import {
    WorkerMessage,
    TaskIndexMessage,
    TaskIndexResponse,
    ProjectDataMessage,
    ProjectDataResponse,
    WorkerResponse
} from "../../utils/workers/TaskIndexWorkerMessage";

export interface UnifiedWorkerManagerOptions {
    vault: Vault;
    metadataCache: MetadataCache;
    cacheManager?: UnifiedCacheManager;
    eventManager?: ParseEventManager;
    maxWorkers?: number;
    enableWorkers?: boolean;
    debug?: boolean;
}

interface UnifiedParseRequest {
    type: 'unified_parse_request';
    requestId: string;
    operations: Array<{
        operationType: 'tasks' | 'projects' | 'metadata';
        filePath: string;
        content: string;
        fileType: SupportedFileType;
        fileMetadata?: Record<string, any>;
        configData?: Record<string, any>;
        settings?: any;
    }>;
    batchId?: string;
    priority?: ParsePriority;
}

interface UnifiedParseResponse {
    type: 'unified_parse_response';
    requestId: string;
    results: {
        tasks: { [filePath: string]: Task[] };
        projects: { [filePath: string]: TgProject | null };
        enhancedMetadata: { [filePath: string]: Record<string, any> };
    };
    processingTime: number;
    batchMetadata: {
        totalOperations: number;
        taskOperations: number;
        projectOperations: number;
        metadataOperations: number;
        successCount: number;
        errorCount: number;
        cacheHits: number;
        usedUnifiedParser: boolean;
    };
    errors?: string[];
}

interface WorkerInstance {
    id: number;
    worker: Worker;
    busy: boolean;
    lastUsed: number;
}

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
    operation: string;
    startTime: number;
}

export class UnifiedWorkerManager extends Component {
    private vault: Vault;
    private metadataCache: MetadataCache;
    private cacheManager?: UnifiedCacheManager;
    private eventManager?: ParseEventManager;
    
    private workers: Map<number, WorkerInstance> = new Map();
    private maxWorkers: number;
    private enableWorkers: boolean;
    private debug: boolean;
    
    private requestId = 0;
    private nextWorkerId = 0;
    private pendingRequests = new Map<string, PendingRequest>();
    private initialized = false;
    
    // Performance tracking
    private stats = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalProcessingTime: 0,
        averageProcessingTime: 0,
        workerUtilization: 0,
        cacheHits: 0,
        operationCounts: {
            tasks: 0,
            projects: 0,
            metadata: 0,
            unified: 0
        }
    };
    
    constructor(options: UnifiedWorkerManagerOptions) {
        super();
        this.vault = options.vault;
        this.metadataCache = options.metadataCache;
        this.cacheManager = options.cacheManager;
        this.eventManager = options.eventManager;
        
        this.maxWorkers = options.maxWorkers || Math.min(2, Math.max(1, Math.floor(navigator.hardwareConcurrency / 2)));
        this.enableWorkers = options.enableWorkers ?? true;
        this.debug = options.debug ?? false;
        
        this.setupEventListeners();
        this.initializeWorkerCache();
        this.initializeWorkers();
    }
    
    private setupEventListeners(): void {
        // Listen for cache events to update statistics
        if (this.eventManager) {
            this.registerEvent(
                this.eventManager.on(ParseEventType.CACHE_HIT, () => {
                    this.stats.cacheHits++;
                })
            );
        }
    }
    
    /**
     * Initialize worker pool
     */
    private initializeWorkers(): void {
        if (this.initialized) {
            this.log("Workers already initialized, skipping");
            return;
        }
        
        if (!this.enableWorkers) {
            this.log("Workers disabled, using synchronous processing");
            return;
        }
        
        this.cleanupWorkers();
        
        try {
            this.log(`Initializing ${this.maxWorkers} unified workers`);
            
            for (let i = 0; i < this.maxWorkers; i++) {
                const workerInstance = this.createWorker();
                this.workers.set(workerInstance.id, workerInstance);
                this.log(`Initialized worker #${workerInstance.id}`);
            }
            
            this.initialized = true;
            this.log(`Successfully initialized ${this.workers.size} workers`);
            
            if (this.workers.size === 0) {
                console.warn("No workers initialized, falling back to synchronous processing");
                this.enableWorkers = false;
            }
            
        } catch (error) {
            console.warn("Failed to initialize workers, disabling worker support:", error);
            this.enableWorkers = false;
            this.workers.clear();
        }
    }
    
    /**
     * Create a new worker instance
     */
    private createWorker(): WorkerInstance {
        const workerId = this.nextWorkerId++;
        const worker = new UnifiedParsingWorker();
        
        const workerInstance: WorkerInstance = {
            id: workerId,
            worker,
            busy: false,
            lastUsed: 0
        };
        
        worker.onmessage = (event: MessageEvent) => {
            this.handleWorkerMessage(event.data);
        };
        
        worker.onerror = (error: ErrorEvent) => {
            console.error(`Worker #${workerId} error:`, error);
            this.handleWorkerError(workerId, error);
        };
        
        return workerInstance;
    }
    
    /**
     * Get an available worker
     */
    private getAvailableWorker(): WorkerInstance | null {
        // Find first available worker
        for (const workerInstance of this.workers.values()) {
            if (!workerInstance.busy) {
                return workerInstance;
            }
        }
        
        // If all workers are busy, return the least recently used one
        let leastRecentWorker: WorkerInstance | null = null;
        let oldestTime = Date.now();
        
        for (const workerInstance of this.workers.values()) {
            if (workerInstance.lastUsed < oldestTime) {
                oldestTime = workerInstance.lastUsed;
                leastRecentWorker = workerInstance;
            }
        }
        
        return leastRecentWorker;
    }
    
    /**
     * Parse tasks from multiple files (unified interface)
     */
    async parseTasksBatch(
        files: Array<{
            filePath: string;
            content: string;
            fileType: SupportedFileType;
            fileMetadata?: Record<string, any>;
            settings?: any;
        }>,
        priority: ParsePriority = ParsePriority.NORMAL
    ): Promise<{ [filePath: string]: Task[] }> {
        const operations = files.map(file => ({
            operationType: 'tasks' as const,
            filePath: file.filePath,
            content: file.content,
            fileType: file.fileType,
            fileMetadata: file.fileMetadata,
            settings: file.settings
        }));
        
        const response = await this.processUnifiedRequest(operations, priority);
        this.stats.operationCounts.tasks += operations.length;
        
        return response.results.tasks;
    }
    
    /**
     * Detect projects from multiple files (unified interface)
     */
    async detectProjectsBatch(
        files: Array<{
            filePath: string;
            fileMetadata: Record<string, any>;
            configData: Record<string, any>;
        }>,
        priority: ParsePriority = ParsePriority.NORMAL
    ): Promise<{ [filePath: string]: TgProject | null }> {
        const operations = files.map(file => ({
            operationType: 'projects' as const,
            filePath: file.filePath,
            content: '', // Not needed for project detection
            fileType: 'markdown' as SupportedFileType,
            fileMetadata: file.fileMetadata,
            configData: file.configData
        }));
        
        const response = await this.processUnifiedRequest(operations, priority);
        this.stats.operationCounts.projects += operations.length;
        
        return response.results.projects;
    }
    
    /**
     * Process enhanced metadata from multiple files (unified interface)
     */
    async processMetadataBatch(
        files: Array<{
            filePath: string;
            fileMetadata: Record<string, any>;
            configData: Record<string, any>;
        }>,
        priority: ParsePriority = ParsePriority.NORMAL
    ): Promise<{ [filePath: string]: Record<string, any> }> {
        const operations = files.map(file => ({
            operationType: 'metadata' as const,
            filePath: file.filePath,
            content: '', // Not needed for metadata processing
            fileType: 'markdown' as SupportedFileType,
            fileMetadata: file.fileMetadata,
            configData: file.configData
        }));
        
        const response = await this.processUnifiedRequest(operations, priority);
        this.stats.operationCounts.metadata += operations.length;
        
        return response.results.enhancedMetadata;
    }
    
    /**
     * Process unified request with multiple operation types
     */
    async processUnifiedRequest(
        operations: UnifiedParseRequest['operations'],
        priority: ParsePriority = ParsePriority.NORMAL
    ): Promise<UnifiedParseResponse> {
        if (!this.enableWorkers || this.workers.size === 0) {
            throw new Error("No workers available for unified parsing");
        }
        
        const requestId = this.generateRequestId();
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const request: UnifiedParseRequest = {
            type: 'unified_parse_request',
            requestId,
            operations,
            batchId,
            priority
        };
        
        this.stats.totalRequests++;
        this.stats.operationCounts.unified++;
        
        try {
            const response = await this.sendWorkerMessage(request, 'unified_parse');
            this.updateStats(response.processingTime, true);
            
            // Emit batch completion event
            this.eventManager?.trigger(ParseEventType.BATCH_COMPLETED, {
                batchId,
                taskCount: operations.length,
                duration: response.processingTime,
                timestamp: Date.now()
            });
            
            return response;
            
        } catch (error) {
            this.updateStats(0, false);
            
            // Emit batch error event
            this.eventManager?.trigger(ParseEventType.BATCH_FAILED, {
                batchId,
                taskCount: operations.length,
                error: error instanceof Error ? error.message : String(error),
                timestamp: Date.now()
            });
            
            throw error;
        }
    }
    
    /**
     * Legacy compatibility: Process task index request
     */
    async processTaskIndexRequest(message: TaskIndexMessage): Promise<TaskIndexResponse> {
        const operations = message.fileContents.map(file => ({
            operationType: 'tasks' as const,
            filePath: file.filePath,
            content: file.content,
            fileType: file.fileType || 'markdown' as SupportedFileType,
            fileMetadata: file.fileMetadata,
            settings: message.settings
        }));
        
        try {
            const response = await this.processUnifiedRequest(operations);
            
            return {
                type: 'task_index_response',
                requestId: message.requestId,
                results: response.results.tasks,
                processingTime: response.processingTime,
                metadata: {
                    fileCount: message.fileContents.length,
                    totalTasks: Object.values(response.results.tasks).flat().length,
                    usedUnifiedParser: true
                }
            };
            
        } catch (error) {
            return {
                type: 'task_index_response',
                requestId: message.requestId,
                results: {},
                processingTime: 0,
                errors: [error instanceof Error ? error.message : String(error)],
                metadata: {
                    fileCount: message.fileContents.length,
                    totalTasks: 0,
                    usedUnifiedParser: false
                }
            };
        }
    }
    
    /**
     * Legacy compatibility: Process project data request
     */
    async processProjectDataRequest(message: ProjectDataMessage): Promise<ProjectDataResponse> {
        const operations = message.fileDataList.map(file => ({
            operationType: 'projects' as const,
            filePath: file.filePath,
            content: '',
            fileType: 'markdown' as SupportedFileType,
            fileMetadata: file.fileMetadata,
            configData: file.configData
        }));
        
        try {
            const response = await this.processUnifiedRequest(operations);
            
            return {
                type: 'project_data_response',
                requestId: message.requestId,
                results: response.results.projects,
                enhancedMetadata: response.results.enhancedMetadata,
                processingTime: response.processingTime,
                metadata: {
                    fileCount: message.fileDataList.length,
                    successCount: Object.values(response.results.projects).filter(p => p !== null).length,
                    errorCount: response.errors?.length || 0,
                    usedUnifiedParser: true
                }
            };
            
        } catch (error) {
            return {
                type: 'project_data_response',
                requestId: message.requestId,
                results: {},
                enhancedMetadata: {},
                processingTime: 0,
                errors: [error instanceof Error ? error.message : String(error)],
                metadata: {
                    fileCount: message.fileDataList.length,
                    successCount: 0,
                    errorCount: 1,
                    usedUnifiedParser: false
                }
            };
        }
    }
    
    /**
     * Send message to worker and wait for response
     */
    private async sendWorkerMessage(message: any, operation: string): Promise<any> {
        const worker = this.getAvailableWorker();
        if (!worker) {
            throw new Error("No available workers");
        }
        
        worker.busy = true;
        worker.lastUsed = Date.now();
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(message.requestId);
                worker.busy = false;
                reject(new Error(`Worker request timeout for ${operation}`));
            }, 60000); // 60 second timeout for complex operations
            
            this.pendingRequests.set(message.requestId, {
                resolve: (response) => {
                    clearTimeout(timeout);
                    worker.busy = false;
                    resolve(response);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    worker.busy = false;
                    reject(error);
                },
                timeout,
                operation,
                startTime: Date.now()
            });
            
            try {
                worker.worker.postMessage(message);
            } catch (error) {
                clearTimeout(timeout);
                this.pendingRequests.delete(message.requestId);
                worker.busy = false;
                reject(error);
            }
        });
    }
    
    /**
     * Handle worker message responses
     */
    private handleWorkerMessage(message: any): void {
        const pendingRequest = this.pendingRequests.get(message.requestId);
        if (!pendingRequest) {
            this.log(`Received response for unknown request: ${message.requestId}`);
            return;
        }
        
        this.pendingRequests.delete(message.requestId);
        
        if (message.type === 'error') {
            pendingRequest.reject(new Error(message.error || 'Unknown worker error'));
        } else {
            pendingRequest.resolve(message);
        }
    }
    
    /**
     * Handle worker errors
     */
    private handleWorkerError(workerId: number, error: ErrorEvent): void {
        this.log(`Worker #${workerId} encountered error: ${error.message}`);
        
        // Find and reject all pending requests for this worker
        for (const [requestId, request] of this.pendingRequests) {
            if (request.operation.includes(`worker-${workerId}`)) {
                clearTimeout(request.timeout);
                request.reject(new Error(`Worker error: ${error.message}`));
                this.pendingRequests.delete(requestId);
            }
        }
        
        // Restart the worker
        const workerInstance = this.workers.get(workerId);
        if (workerInstance) {
            try {
                workerInstance.worker.terminate();
            } catch (e) {
                // Ignore termination errors
            }
            
            const newWorkerInstance = this.createWorker();
            this.workers.set(workerId, newWorkerInstance);
            this.log(`Restarted worker #${workerId}`);
        }
    }
    
    /**
     * Update performance statistics
     */
    private updateStats(processingTime: number, success: boolean): void {
        if (success) {
            this.stats.successfulRequests++;
            this.stats.totalProcessingTime += processingTime;
            this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.successfulRequests;
        } else {
            this.stats.failedRequests++;
        }
        
        // Calculate worker utilization
        const busyWorkers = Array.from(this.workers.values()).filter(w => w.busy).length;
        this.stats.workerUtilization = this.workers.size > 0 ? busyWorkers / this.workers.size : 0;
    }
    
    /**
     * Generate unique request ID
     */
    private generateRequestId(): string {
        return `unified-req-${++this.requestId}-${Date.now()}`;
    }
    
    /**
     * Update worker configurations
     */
    updateConfigurations(configs: {
        taskSettings?: any;
        projectConfig?: any;
    }): void {
        if (!this.enableWorkers || this.workers.size === 0) {
            return;
        }
        
        const configMessage = {
            type: 'update_config',
            configs,
            timestamp: Date.now()
        };
        
        for (const workerInstance of this.workers.values()) {
            try {
                workerInstance.worker.postMessage(configMessage);
            } catch (error) {
                console.warn(`Failed to update config for worker #${workerInstance.id}:`, error);
            }
        }
        
        this.log("Updated worker configurations");
    }
    
    /**
     * Clear worker caches
     */
    clearWorkerCaches(): void {
        if (!this.enableWorkers || this.workers.size === 0) {
            return;
        }
        
        const clearMessage = {
            type: 'clear_cache',
            timestamp: Date.now()
        };
        
        for (const workerInstance of this.workers.values()) {
            try {
                workerInstance.worker.postMessage(clearMessage);
            } catch (error) {
                console.warn(`Failed to clear cache for worker #${workerInstance.id}:`, error);
            }
        }
        
        this.log("Cleared worker caches");
    }
    
    /**
     * Get performance statistics
     */
    getStats() {
        return {
            ...this.stats,
            workers: {
                total: this.workers.size,
                busy: Array.from(this.workers.values()).filter(w => w.busy).length,
                enabled: this.enableWorkers,
                initialized: this.initialized
            },
            pendingRequests: this.pendingRequests.size
        };
    }
    
    /**
     * Check if workers are available
     */
    isAvailable(): boolean {
        return this.enableWorkers && this.initialized && this.workers.size > 0;
    }
    
    /**
     * Clean up workers
     */
    private cleanupWorkers(): void {
        for (const workerInstance of this.workers.values()) {
            try {
                workerInstance.worker.terminate();
            } catch (error) {
                console.warn(`Error terminating worker #${workerInstance.id}:`, error);
            }
        }
        
        this.workers.clear();
        
        // Reject all pending requests
        for (const [requestId, request] of this.pendingRequests) {
            clearTimeout(request.timeout);
            request.reject(new Error("Worker manager shutting down"));
        }
        this.pendingRequests.clear();
        
        this.log("Cleaned up all workers");
    }
    
    /**
     * Component lifecycle: cleanup on unload
     */
    onunload(): void {
        this.cleanupWorkers();
        this.initialized = false;
        this.log("UnifiedWorkerManager shut down");
        super.onunload();
    }
    
    /**
     * Optimized batch processing with reduced communication overhead
     */
    public async processOptimizedBatch(
        operations: Array<{
            type: 'tasks' | 'projects' | 'metadata' | 'unified';
            filePath: string;
            content?: string;
            metadata?: Record<string, any>;
            config?: any;
        }>,
        options: {
            enableCompression?: boolean;
            enableBatching?: boolean;
            maxBatchSize?: number;
            enableDeduplication?: boolean;
            useTransferableObjects?: boolean;
        } = {}
    ): Promise<{
        results: any;
        optimizationStats: {
            originalRequests: number;
            optimizedRequests: number;
            compressionRatio: number;
            deduplicationSavings: number;
            communicationOverheadReduction: number;
        };
    }> {
        const startTime = performance.now();
        const originalRequestCount = operations.length;
        
        // Step 1: Deduplication to reduce redundant operations
        let optimizedOperations = operations;
        let deduplicationSavings = 0;
        
        if (options.enableDeduplication !== false) {
            const { deduplicated, savings } = this.deduplicateOperations(operations);
            optimizedOperations = deduplicated;
            deduplicationSavings = savings;
        }
        
        // Step 2: Intelligent batching based on operation type and file relationships
        const batches = options.enableBatching !== false 
            ? this.createOptimizedBatches(optimizedOperations, options.maxBatchSize || 50)
            : [optimizedOperations];
        
        // Step 3: Compress payloads for large operations
        const compressedBatches = options.enableCompression !== false 
            ? await this.compressBatchPayloads(batches)
            : batches.map(batch => ({ batch, compressed: false, originalSize: 0, compressedSize: 0 }));
        
        // Step 4: Use transferable objects for large data transfers
        const optimizedBatches = options.useTransferableObjects !== false 
            ? this.prepareTransferableObjects(compressedBatches)
            : compressedBatches;
        
        // Step 5: Execute batches with connection reuse and pooling
        const batchResults = await this.executeOptimizedBatches(optimizedBatches);
        
        // Calculate optimization statistics
        const totalOriginalSize = compressedBatches.reduce((sum, b) => sum + b.originalSize, 0);
        const totalCompressedSize = compressedBatches.reduce((sum, b) => sum + b.compressedSize, 0);
        const compressionRatio = totalOriginalSize > 0 ? totalCompressedSize / totalOriginalSize : 1;
        
        const optimizedRequestCount = batches.length;
        const communicationOverheadReduction = Math.max(0, 1 - (optimizedRequestCount / originalRequestCount));
        
        return {
            results: this.consolidateBatchResults(batchResults),
            optimizationStats: {
                originalRequests: originalRequestCount,
                optimizedRequests: optimizedRequestCount,
                compressionRatio,
                deduplicationSavings,
                communicationOverheadReduction
            }
        };
    }
    
    /**
     * Deduplicate operations to reduce redundant processing
     */
    private deduplicateOperations(operations: any[]): { deduplicated: any[]; savings: number } {
        const seen = new Map<string, any>();
        const deduplicated: any[] = [];
        
        for (const operation of operations) {
            // Create a hash key based on operation type, file path, and content hash
            const contentHash = operation.content ? this.fastHash(operation.content) : '';
            const key = `${operation.type}:${operation.filePath}:${contentHash}`;
            
            if (!seen.has(key)) {
                seen.set(key, operation);
                deduplicated.push(operation);
            }
        }
        
        const savings = operations.length - deduplicated.length;
        return { deduplicated, savings };
    }
    
    /**
     * Create optimized batches based on operation characteristics
     */
    private createOptimizedBatches(operations: any[], maxBatchSize: number): any[][] {
        // Group operations by type and estimated processing time
        const groups = new Map<string, any[]>();
        
        for (const operation of operations) {
            const estimatedTime = this.estimateProcessingTime(operation);
            const priority = estimatedTime > 100 ? 'heavy' : 'light';
            const groupKey = `${operation.type}:${priority}`;
            
            if (!groups.has(groupKey)) {
                groups.set(groupKey, []);
            }
            groups.get(groupKey)!.push(operation);
        }
        
        // Create batches within each group
        const batches: any[][] = [];
        
        for (const [groupKey, groupOperations] of groups) {
            for (let i = 0; i < groupOperations.length; i += maxBatchSize) {
                const batch = groupOperations.slice(i, i + maxBatchSize);
                batches.push(batch);
            }
        }
        
        // Sort batches by priority (heavy operations first to maximize parallelization)
        return batches.sort((a, b) => {
            const aIsHeavy = a[0] && this.estimateProcessingTime(a[0]) > 100;
            const bIsHeavy = b[0] && this.estimateProcessingTime(b[0]) > 100;
            return bIsHeavy ? 1 : (aIsHeavy ? -1 : 0);
        });
    }
    
    /**
     * Compress batch payloads for large operations
     */
    private async compressBatchPayloads(batches: any[][]): Promise<Array<{
        batch: any[];
        compressed: boolean;
        originalSize: number;
        compressedSize: number;
    }>> {
        const results = [];
        
        for (const batch of batches) {
            const serialized = JSON.stringify(batch);
            const originalSize = new Blob([serialized]).size;
            
            // Only compress if the payload is large enough to benefit
            if (originalSize > 10240) { // 10KB threshold
                try {
                    // Use simple compression simulation (in real implementation, use proper compression)
                    const compressed = this.simpleCompress(serialized);
                    const compressedSize = new Blob([compressed]).size;
                    
                    results.push({
                        batch: JSON.parse(compressed), // Simulate decompression
                        compressed: true,
                        originalSize,
                        compressedSize
                    });
                } catch (error) {
                    // Fallback to uncompressed
                    results.push({
                        batch,
                        compressed: false,
                        originalSize,
                        compressedSize: originalSize
                    });
                }
            } else {
                results.push({
                    batch,
                    compressed: false,
                    originalSize,
                    compressedSize: originalSize
                });
            }
        }
        
        return results;
    }
    
    /**
     * Prepare transferable objects for efficient data transfer
     */
    private prepareTransferableObjects(compressedBatches: any[]): any[] {
        return compressedBatches.map(batchInfo => {
            const transferables: Transferable[] = [];
            
            // Identify large ArrayBuffers or other transferable objects
            for (const operation of batchInfo.batch) {
                if (operation.content && operation.content.length > 50000) {
                    // Convert large strings to ArrayBuffers for transfer
                    const buffer = new TextEncoder().encode(operation.content);
                    transferables.push(buffer.buffer);
                    operation._transferableContent = buffer;
                    delete operation.content; // Remove original to avoid duplication
                }
            }
            
            return {
                ...batchInfo,
                transferables
            };
        });
    }
    
    /**
     * Execute optimized batches with advanced scheduling
     */
    private async executeOptimizedBatches(optimizedBatches: any[]): Promise<any[]> {
        const results = [];
        const maxConcurrency = Math.min(this.maxWorkers, optimizedBatches.length);
        
        // Create a semaphore for controlling concurrency
        const semaphore = this.createSemaphore(maxConcurrency);
        
        const batchPromises = optimizedBatches.map(async (batchInfo, index) => {
            return semaphore.acquire(async () => {
                try {
                    // Convert back to operations format
                    const operations = batchInfo.batch.map((op: any) => ({
                        operationType: op.type,
                        filePath: op.filePath,
                        content: op._transferableContent 
                            ? new TextDecoder().decode(op._transferableContent)
                            : op.content || '',
                        fileType: 'markdown' as SupportedFileType,
                        fileMetadata: op.metadata || {},
                        configData: op.config || {},
                        settings: op.config || {}
                    }));
                    
                    // Use existing unified request processing with optimizations
                    const response = await this.processUnifiedRequest(operations, ParsePriority.NORMAL);
                    
                    return {
                        batchIndex: index,
                        response,
                        optimized: true
                    };
                } catch (error) {
                    console.warn(`Optimized batch ${index} failed:`, error);
                    return {
                        batchIndex: index,
                        error: error.message,
                        optimized: false
                    };
                }
            });
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                console.error('Batch execution failed:', result.reason);
                results.push({ error: result.reason.message, optimized: false });
            }
        }
        
        return results;
    }
    
    /**
     * Consolidate batch results into a unified response
     */
    private consolidateBatchResults(batchResults: any[]): any {
        const consolidated = {
            tasks: {} as { [filePath: string]: any[] },
            projects: {} as { [filePath: string]: any },
            enhancedMetadata: {} as { [filePath: string]: any }
        };
        
        for (const batchResult of batchResults) {
            if (batchResult.response && !batchResult.error) {
                const response = batchResult.response;
                
                // Merge results
                Object.assign(consolidated.tasks, response.results.tasks || {});
                Object.assign(consolidated.projects, response.results.projects || {});
                Object.assign(consolidated.enhancedMetadata, response.results.enhancedMetadata || {});
            }
        }
        
        return consolidated;
    }
    
    /**
     * Create a semaphore for controlling concurrency
     */
    private createSemaphore(maxConcurrency: number) {
        let running = 0;
        const queue: Array<() => void> = [];
        
        return {
            async acquire<T>(task: () => Promise<T>): Promise<T> {
                return new Promise((resolve, reject) => {
                    const run = async () => {
                        running++;
                        try {
                            const result = await task();
                            resolve(result);
                        } catch (error) {
                            reject(error);
                        } finally {
                            running--;
                            if (queue.length > 0) {
                                const next = queue.shift()!;
                                next();
                            }
                        }
                    };
                    
                    if (running < maxConcurrency) {
                        run();
                    } else {
                        queue.push(run);
                    }
                });
            }
        };
    }
    
    /**
     * Estimate processing time for an operation
     */
    private estimateProcessingTime(operation: any): number {
        let baseTime = 50; // Base processing time in ms
        
        // Adjust based on operation type
        switch (operation.type) {
            case 'tasks':
                baseTime = 100;
                break;
            case 'projects':
                baseTime = 150;
                break;
            case 'metadata':
                baseTime = 75;
                break;
            case 'unified':
                baseTime = 200;
                break;
        }
        
        // Adjust based on content size
        if (operation.content) {
            const contentFactor = Math.min(3, operation.content.length / 10000);
            baseTime *= (1 + contentFactor);
        }
        
        return baseTime;
    }
    
    /**
     * Fast hash function for content deduplication
     */
    private fastHash(str: string): string {
        let hash = 0;
        if (str.length === 0) return hash.toString();
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        return hash.toString();
    }
    
    /**
     * Simple compression simulation (replace with actual compression in production)
     */
    private simpleCompress(data: string): string {
        // This is a placeholder - in real implementation, use proper compression like gzip
        // For now, just return the original data
        return data;
    }
    
    /**
     * Advanced worker health monitoring and recovery
     */
    public async monitorAndOptimizeWorkers(): Promise<{
        healthStatus: 'healthy' | 'degraded' | 'critical';
        optimizations: string[];
        metrics: {
            avgResponseTime: number;
            errorRate: number;
            throughput: number;
            memoryUsage: number;
        };
    }> {
        const stats = this.getStats();
        const optimizations: string[] = [];
        
        // Calculate metrics
        const avgResponseTime = stats.averageProcessingTime;
        const errorRate = stats.totalRequests > 0 ? stats.failedRequests / stats.totalRequests : 0;
        const throughput = stats.successfulRequests; // Simplified metric
        const memoryUsage = this.estimateWorkerMemoryUsage();
        
        // Determine health status
        let healthStatus: 'healthy' | 'degraded' | 'critical';
        
        if (errorRate > 0.2 || avgResponseTime > 5000 || memoryUsage > 0.9) {
            healthStatus = 'critical';
            optimizations.push('Immediate worker restart recommended');
        } else if (errorRate > 0.1 || avgResponseTime > 2000 || memoryUsage > 0.7) {
            healthStatus = 'degraded';
            optimizations.push('Consider increasing worker pool size');
        } else {
            healthStatus = 'healthy';
        }
        
        // Generate specific optimizations
        if (stats.workerUtilization > 0.8) {
            optimizations.push('High worker utilization - consider adding more workers');
        }
        
        if (avgResponseTime > 1000) {
            optimizations.push('Response time is high - enable compression and batching');
        }
        
        if (this.pendingRequests.size > 10) {
            optimizations.push('High queue depth - optimize batch sizes');
        }
        
        if (optimizations.length === 0) {
            optimizations.push('Worker system is operating optimally');
        }
        
        return {
            healthStatus,
            optimizations,
            metrics: {
                avgResponseTime,
                errorRate,
                throughput,
                memoryUsage
            }
        };
    }
    
    /**
     * Estimate worker memory usage
     */
    private estimateWorkerMemoryUsage(): number {
        // Simplified estimation based on worker count and pending requests
        const baseMemoryPerWorker = 10; // MB
        const memoryPerRequest = 1; // MB
        
        const estimatedUsage = (this.workers.size * baseMemoryPerWorker) + 
                              (this.pendingRequests.size * memoryPerRequest);
        
        // Assume total available memory of 500MB for workers
        return Math.min(1, estimatedUsage / 500);
    }

    /**
     * Unified Worker Cache System with Project-aware caching
     */
    private workerCache = new Map<string, {
        data: any;
        timestamp: number;
        ttl: number;
        projectId?: string;
        cacheType: 'tasks' | 'projects' | 'metadata' | 'config';
        accessCount: number;
        lastAccessed: number;
        size: number;
    }>();
    
    private projectCache = new Map<string, {
        projectData: any;
        associatedFiles: Set<string>;
        lastUpdated: number;
        configHash: string;
        cacheStats: {
            hits: number;
            misses: number;
            lastActivity: number;
        };
    }>();
    
    private cacheStats = {
        totalHits: 0,
        totalMisses: 0,
        totalEvictions: 0,
        memoryUsage: 0,
        avgAccessTime: 0
    };

    /**
     * Initialize unified worker cache system
     */
    private initializeWorkerCache(): void {
        // Set up periodic cache cleanup
        setInterval(() => {
            this.performCacheCleanup();
        }, 30000); // Cleanup every 30 seconds
        
        // Set up project cache maintenance
        setInterval(() => {
            this.maintainProjectCache();
        }, 60000); // Maintain every minute
        
        this.log("Initialized unified worker cache system");
    }
    
    /**
     * Get cached result with project-aware lookup
     */
    private getCachedResult(key: string, projectId?: string): any | null {
        const startTime = performance.now();
        
        // Try exact key match first
        let cacheEntry = this.workerCache.get(key);
        
        // If not found and project ID is provided, try project-scoped lookup
        if (!cacheEntry && projectId) {
            const projectScopedKey = `${projectId}:${key}`;
            cacheEntry = this.workerCache.get(projectScopedKey);
        }
        
        if (cacheEntry && !this.isCacheEntryExpired(cacheEntry)) {
            // Update access statistics
            cacheEntry.accessCount++;
            cacheEntry.lastAccessed = Date.now();
            
            this.cacheStats.totalHits++;
            this.cacheStats.avgAccessTime = (this.cacheStats.avgAccessTime + (performance.now() - startTime)) / 2;
            
            // Update project cache statistics if applicable
            if (projectId && this.projectCache.has(projectId)) {
                const projectCacheEntry = this.projectCache.get(projectId)!;
                projectCacheEntry.cacheStats.hits++;
                projectCacheEntry.cacheStats.lastActivity = Date.now();
            }
            
            this.log(`Cache HIT for key: ${key} (project: ${projectId || 'none'})`);
            return cacheEntry.data;
        }
        
        this.cacheStats.totalMisses++;
        
        // Update project cache miss statistics
        if (projectId && this.projectCache.has(projectId)) {
            const projectCacheEntry = this.projectCache.get(projectId)!;
            projectCacheEntry.cacheStats.misses++;
            projectCacheEntry.cacheStats.lastActivity = Date.now();
        }
        
        this.log(`Cache MISS for key: ${key} (project: ${projectId || 'none'})`);
        return null;
    }
    
    /**
     * Set cached result with project-aware storage
     */
    private setCachedResult(
        key: string, 
        data: any, 
        options: {
            ttl?: number;
            projectId?: string;
            cacheType?: 'tasks' | 'projects' | 'metadata' | 'config';
        } = {}
    ): void {
        const ttl = options.ttl || 300000; // Default 5 minutes
        const cacheType = options.cacheType || 'tasks';
        const size = this.estimateDataSize(data);
        
        // Create cache entry
        const cacheEntry = {
            data,
            timestamp: Date.now(),
            ttl,
            projectId: options.projectId,
            cacheType,
            accessCount: 1,
            lastAccessed: Date.now(),
            size
        };
        
        // Store with project-scoped key if project ID is provided
        const cacheKey = options.projectId ? `${options.projectId}:${key}` : key;
        this.workerCache.set(cacheKey, cacheEntry);
        
        // Update project cache association
        if (options.projectId) {
            this.updateProjectCacheAssociation(options.projectId, key, data);
        }
        
        // Update memory usage
        this.cacheStats.memoryUsage += size;
        
        // Trigger cleanup if memory usage is high
        if (this.cacheStats.memoryUsage > 50 * 1024 * 1024) { // 50MB threshold
            this.performCacheCleanup();
        }
        
        this.log(`Cached result for key: ${cacheKey} (${this.formatBytes(size)})`);
    }
    
    /**
     * Update project cache association
     */
    private updateProjectCacheAssociation(projectId: string, fileKey: string, data: any): void {
        if (!this.projectCache.has(projectId)) {
            this.projectCache.set(projectId, {
                projectData: {},
                associatedFiles: new Set(),
                lastUpdated: Date.now(),
                configHash: '',
                cacheStats: {
                    hits: 0,
                    misses: 0,
                    lastActivity: Date.now()
                }
            });
        }
        
        const projectEntry = this.projectCache.get(projectId)!;
        projectEntry.associatedFiles.add(fileKey);
        projectEntry.lastUpdated = Date.now();
        
        // Store project-specific data
        if (data.project) {
            projectEntry.projectData = data.project;
            projectEntry.configHash = this.fastHash(JSON.stringify(data.project));
        }
    }
    
    /**
     * Invalidate cache entries for a specific project
     */
    public invalidateProjectCache(projectId: string): void {
        const projectEntry = this.projectCache.get(projectId);
        if (!projectEntry) return;
        
        let invalidatedCount = 0;
        let freedMemory = 0;
        
        // Invalidate all associated file caches
        for (const fileKey of projectEntry.associatedFiles) {
            const cacheKey = `${projectId}:${fileKey}`;
            const cacheEntry = this.workerCache.get(cacheKey);
            
            if (cacheEntry) {
                freedMemory += cacheEntry.size;
                this.workerCache.delete(cacheKey);
                invalidatedCount++;
            }
        }
        
        // Remove project cache
        this.projectCache.delete(projectId);
        
        // Update statistics
        this.cacheStats.memoryUsage -= freedMemory;
        this.cacheStats.totalEvictions += invalidatedCount;
        
        this.log(`Invalidated project cache for ${projectId}: ${invalidatedCount} entries, freed ${this.formatBytes(freedMemory)}`);
        
        // Notify workers to clear project-specific caches
        this.notifyWorkersProjectCacheInvalidation(projectId);
    }
    
    /**
     * Notify workers about project cache invalidation
     */
    private notifyWorkersProjectCacheInvalidation(projectId: string): void {
        const message = {
            type: 'invalidate_project_cache',
            projectId,
            timestamp: Date.now()
        };
        
        for (const workerInstance of this.workers.values()) {
            try {
                workerInstance.worker.postMessage(message);
            } catch (error) {
                console.warn(`Failed to notify worker #${workerInstance.id} about project cache invalidation:`, error);
            }
        }
    }
    
    /**
     * Enhanced processing with unified caching
     */
    public async processWithUnifiedCache(
        operations: Array<{
            type: 'tasks' | 'projects' | 'metadata' | 'unified';
            filePath: string;
            content?: string;
            metadata?: Record<string, any>;
            config?: any;
            projectId?: string;
        }>,
        options: {
            enableCaching?: boolean;
            cacheTTL?: number;
            forceRefresh?: boolean;
        } = {}
    ): Promise<{
        results: any;
        cacheStats: {
            hits: number;
            misses: number;
            newEntries: number;
            fromCache: { [filePath: string]: boolean };
        };
    }> {
        const enableCaching = options.enableCaching !== false;
        const cacheTTL = options.cacheTTL || 300000; // 5 minutes default
        
        const cacheStats = {
            hits: 0,
            misses: 0,
            newEntries: 0,
            fromCache: {} as { [filePath: string]: boolean }
        };
        
        const cachedResults: any = {
            tasks: {},
            projects: {},
            enhancedMetadata: {}
        };
        
        const uncachedOperations: typeof operations = [];
        
        // Check cache for each operation
        if (enableCaching && !options.forceRefresh) {
            for (const operation of operations) {
                const cacheKey = this.generateCacheKey(operation);
                const cached = this.getCachedResult(cacheKey, operation.projectId);
                
                if (cached) {
                    cacheStats.hits++;
                    cacheStats.fromCache[operation.filePath] = true;
                    
                    // Merge cached results
                    if (operation.type === 'tasks' && cached.tasks) {
                        cachedResults.tasks[operation.filePath] = cached.tasks;
                    } else if (operation.type === 'projects' && cached.projects) {
                        cachedResults.projects[operation.filePath] = cached.projects;
                    } else if (operation.type === 'metadata' && cached.metadata) {
                        cachedResults.enhancedMetadata[operation.filePath] = cached.metadata;
                    }
                } else {
                    cacheStats.misses++;
                    cacheStats.fromCache[operation.filePath] = false;
                    uncachedOperations.push(operation);
                }
            }
        } else {
            uncachedOperations.push(...operations);
            for (const operation of operations) {
                cacheStats.fromCache[operation.filePath] = false;
            }
        }
        
        // Process uncached operations
        let freshResults: any = { tasks: {}, projects: {}, enhancedMetadata: {} };
        
        if (uncachedOperations.length > 0) {
            try {
                const optimizedResult = await this.processOptimizedBatch(uncachedOperations, {
                    enableCompression: true,
                    enableBatching: true,
                    enableDeduplication: true,
                    useTransferableObjects: true
                });
                
                freshResults = optimizedResult.results;
                
                // Cache fresh results
                if (enableCaching) {
                    for (const operation of uncachedOperations) {
                        const cacheKey = this.generateCacheKey(operation);
                        const resultToCache: any = {};
                        
                        if (operation.type === 'tasks' && freshResults.tasks[operation.filePath]) {
                            resultToCache.tasks = freshResults.tasks[operation.filePath];
                        } else if (operation.type === 'projects' && freshResults.projects[operation.filePath]) {
                            resultToCache.projects = freshResults.projects[operation.filePath];
                        } else if (operation.type === 'metadata' && freshResults.enhancedMetadata[operation.filePath]) {
                            resultToCache.metadata = freshResults.enhancedMetadata[operation.filePath];
                        }
                        
                        if (Object.keys(resultToCache).length > 0) {
                            this.setCachedResult(cacheKey, resultToCache, {
                                ttl: cacheTTL,
                                projectId: operation.projectId,
                                cacheType: operation.type
                            });
                            cacheStats.newEntries++;
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to process uncached operations:', error);
                throw error;
            }
        }
        
        // Merge cached and fresh results
        const finalResults = {
            tasks: { ...cachedResults.tasks, ...freshResults.tasks },
            projects: { ...cachedResults.projects, ...freshResults.projects },
            enhancedMetadata: { ...cachedResults.enhancedMetadata, ...freshResults.enhancedMetadata }
        };
        
        return {
            results: finalResults,
            cacheStats
        };
    }
    
    /**
     * Generate cache key for an operation
     */
    private generateCacheKey(operation: any): string {
        const contentHash = operation.content ? this.fastHash(operation.content) : '';
        const metadataHash = operation.metadata ? this.fastHash(JSON.stringify(operation.metadata)) : '';
        const configHash = operation.config ? this.fastHash(JSON.stringify(operation.config)) : '';
        
        return `${operation.type}:${operation.filePath}:${contentHash}:${metadataHash}:${configHash}`;
    }
    
    /**
     * Check if cache entry is expired
     */
    private isCacheEntryExpired(entry: any): boolean {
        return Date.now() - entry.timestamp > entry.ttl;
    }
    
    /**
     * Perform cache cleanup based on LRU and memory pressure
     */
    private performCacheCleanup(): void {
        const maxMemoryUsage = 100 * 1024 * 1024; // 100MB limit
        const maxEntries = 10000;
        
        if (this.cacheStats.memoryUsage < maxMemoryUsage && this.workerCache.size < maxEntries) {
            return; // No cleanup needed
        }
        
        const startTime = performance.now();
        let cleaned = 0;
        let freedMemory = 0;
        
        // Remove expired entries first
        for (const [key, entry] of this.workerCache.entries()) {
            if (this.isCacheEntryExpired(entry)) {
                freedMemory += entry.size;
                this.workerCache.delete(key);
                cleaned++;
            }
        }
        
        // If still over limits, remove least recently used entries
        if (this.cacheStats.memoryUsage - freedMemory > maxMemoryUsage || 
            this.workerCache.size > maxEntries) {
            
            const entries = Array.from(this.workerCache.entries())
                .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
            
            const toRemove = Math.min(
                Math.floor(entries.length * 0.2), // Remove up to 20%
                entries.length - maxEntries
            );
            
            for (let i = 0; i < toRemove; i++) {
                const [key, entry] = entries[i];
                freedMemory += entry.size;
                this.workerCache.delete(key);
                cleaned++;
            }
        }
        
        // Update statistics
        this.cacheStats.memoryUsage -= freedMemory;
        this.cacheStats.totalEvictions += cleaned;
        
        const cleanupTime = performance.now() - startTime;
        this.log(`Cache cleanup: removed ${cleaned} entries, freed ${this.formatBytes(freedMemory)} in ${cleanupTime.toFixed(2)}ms`);
    }
    
    /**
     * Maintain project cache consistency
     */
    private maintainProjectCache(): void {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        for (const [projectId, projectEntry] of this.projectCache.entries()) {
            // Remove stale project caches
            if (now - projectEntry.lastUpdated > maxAge) {
                this.invalidateProjectCache(projectId);
                continue;
            }
            
            // Clean up associated files that are no longer cached
            const filesToRemove: string[] = [];
            for (const fileKey of projectEntry.associatedFiles) {
                const cacheKey = `${projectId}:${fileKey}`;
                if (!this.workerCache.has(cacheKey)) {
                    filesToRemove.push(fileKey);
                }
            }
            
            for (const fileKey of filesToRemove) {
                projectEntry.associatedFiles.delete(fileKey);
            }
            
            // If no files are associated anymore, remove the project cache
            if (projectEntry.associatedFiles.size === 0) {
                this.projectCache.delete(projectId);
            }
        }
    }
    
    /**
     * Get comprehensive cache statistics
     */
    public getUnifiedCacheStats(): {
        workerCache: {
            entries: number;
            memoryUsage: string;
            hitRate: number;
            avgAccessTime: number;
            topKeys: Array<{ key: string; accessCount: number; size: string }>;
        };
        projectCache: {
            projects: number;
            totalFiles: number;
            avgFilesPerProject: number;
            activeProjects: number;
        };
        performance: {
            totalHits: number;
            totalMisses: number;
            totalEvictions: number;
            hitRate: number;
        };
    } {
        const totalRequests = this.cacheStats.totalHits + this.cacheStats.totalMisses;
        const hitRate = totalRequests > 0 ? this.cacheStats.totalHits / totalRequests : 0;
        
        // Get top accessed cache keys
        const topKeys = Array.from(this.workerCache.entries())
            .sort(([, a], [, b]) => b.accessCount - a.accessCount)
            .slice(0, 10)
            .map(([key, entry]) => ({
                key: key.length > 50 ? key.substring(0, 47) + '...' : key,
                accessCount: entry.accessCount,
                size: this.formatBytes(entry.size)
            }));
        
        // Calculate project cache statistics
        const totalFiles = Array.from(this.projectCache.values())
            .reduce((sum, project) => sum + project.associatedFiles.size, 0);
        const avgFilesPerProject = this.projectCache.size > 0 ? totalFiles / this.projectCache.size : 0;
        const activeProjects = Array.from(this.projectCache.values())
            .filter(project => Date.now() - project.cacheStats.lastActivity < 3600000) // Active in last hour
            .length;
        
        return {
            workerCache: {
                entries: this.workerCache.size,
                memoryUsage: this.formatBytes(this.cacheStats.memoryUsage),
                hitRate,
                avgAccessTime: this.cacheStats.avgAccessTime,
                topKeys
            },
            projectCache: {
                projects: this.projectCache.size,
                totalFiles,
                avgFilesPerProject: Math.round(avgFilesPerProject * 100) / 100,
                activeProjects
            },
            performance: {
                totalHits: this.cacheStats.totalHits,
                totalMisses: this.cacheStats.totalMisses,
                totalEvictions: this.cacheStats.totalEvictions,
                hitRate
            }
        };
    }
    
    /**
     * Estimate data size in bytes
     */
    private estimateDataSize(data: any): number {
        try {
            return new Blob([JSON.stringify(data)]).size;
        } catch {
            return 1024; // Default 1KB estimate
        }
    }
    
    /**
     * Format bytes to human readable string
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Log debug messages
     */
    private log(message: string): void {
        if (this.debug) {
            console.log(`[UnifiedWorkerManager] ${message}`);
        }
    }
}