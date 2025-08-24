import type { TFile } from "obsidian";
import type { Task } from "../../types/task";
import type { CachedProjectData } from "../../cache/project-data-cache";
import { TaskWorkerManager, DEFAULT_WORKER_OPTIONS } from "./TaskWorkerManager";
import { ProjectDataWorkerManager } from "./ProjectDataWorkerManager";
import { MetadataParseMode } from "../../types/TaskParserConfig";

/**
 * WorkerOrchestrator - Unified task and project worker management
 * 
 * This component provides a unified interface for coordinating both task parsing
 * and project data computation workers. It implements:
 * - Concurrent control and load balancing
 * - Retry mechanisms with exponential backoff
 * - Performance metrics and monitoring
 * - Fallback to main thread processing
 */
export class WorkerOrchestrator {
  private taskWorkerManager: TaskWorkerManager;
  private projectWorkerManager: ProjectDataWorkerManager;
  
  // Performance metrics
  private metrics = {
    taskParsingSuccess: 0,
    taskParsingFailures: 0,
    projectDataSuccess: 0,
    projectDataFailures: 0,
    averageTaskParsingTime: 0,
    averageProjectDataTime: 0,
    totalOperations: 0,
    fallbackToMainThread: 0
  };

  // Retry configuration
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000; // Base delay for exponential backoff
  
  // Circuit breaker for worker failures
  private workerFailureCount = 0;
  private readonly maxWorkerFailures = 10;
  private workersDisabled = false;
  
  // Configuration options
  private enableWorkerProcessing = true;

  constructor(
    taskWorkerManager: TaskWorkerManager,
    projectWorkerManager: ProjectDataWorkerManager,
    options?: { enableWorkerProcessing?: boolean }
  ) {
    this.taskWorkerManager = taskWorkerManager;
    this.projectWorkerManager = projectWorkerManager;
    this.enableWorkerProcessing = options?.enableWorkerProcessing ?? true;
  }

  /**
   * Parse tasks from a file using workers with fallback
   */
  async parseFileTasks(file: TFile, priority: "high" | "normal" | "low" = "normal"): Promise<Task[]> {
    const startTime = Date.now();
    
    try {
      // Check if workers are enabled and available
      if (!this.enableWorkerProcessing || this.workersDisabled) {
        return await this.parseFileTasksMainThread(file);
      }

      const taskPriority = this.convertPriority(priority);
      const tasks = await this.retryOperation(
        () => this.taskWorkerManager.processFile(file, taskPriority),
        `parseFileTasks:${file.path}`,
        this.maxRetries
      );

      // Update metrics
      this.metrics.taskParsingSuccess++;
      this.updateAverageTime('taskParsing', Date.now() - startTime);
      
      return tasks;
      
    } catch (error) {
      console.error(`WorkerOrchestrator: Failed to parse file ${file.path}:`, error);
      
      // Update failure metrics
      this.metrics.taskParsingFailures++;
      this.handleWorkerFailure();
      
      // Fallback to main thread
      return await this.parseFileTasksMainThread(file);
    }
  }

  /**
   * Parse multiple files in batch with intelligent distribution
   */
  async batchParse(files: TFile[], priority: "high" | "normal" | "low" = "normal"): Promise<Map<string, Task[]>> {
    const startTime = Date.now();
    
    try {
      if (!this.enableWorkerProcessing || this.workersDisabled || files.length === 0) {
        return await this.batchParseMainThread(files);
      }

      const taskPriority = this.convertPriority(priority);
      const results = await this.retryOperation(
        () => this.taskWorkerManager.processBatch(files, taskPriority),
        `batchParse:${files.length}files`,
        this.maxRetries
      );

      // Update metrics
      this.metrics.taskParsingSuccess += files.length;
      this.updateAverageTime('taskParsing', Date.now() - startTime);
      
      return results;
      
    } catch (error) {
      console.error(`WorkerOrchestrator: Failed to batch parse ${files.length} files:`, error);
      
      // Update failure metrics
      this.metrics.taskParsingFailures += files.length;
      this.handleWorkerFailure();
      
      // Fallback to main thread
      return await this.batchParseMainThread(files);
    }
  }

  /**
   * Compute project data for a file using workers with fallback
   */
  async computeProjectData(filePath: string): Promise<CachedProjectData | null> {
    const startTime = Date.now();
    
    try {
      if (this.workersDisabled) {
        return await this.computeProjectDataMainThread(filePath);
      }

      const projectData = await this.retryOperation(
        () => this.projectWorkerManager.getProjectData(filePath),
        `computeProjectData:${filePath}`,
        this.maxRetries
      );

      // Update metrics
      this.metrics.projectDataSuccess++;
      this.updateAverageTime('projectData', Date.now() - startTime);
      
      return projectData;
      
    } catch (error) {
      console.error(`WorkerOrchestrator: Failed to compute project data for ${filePath}:`, error);
      
      // Update failure metrics
      this.metrics.projectDataFailures++;
      this.handleWorkerFailure();
      
      // Fallback to main thread
      return await this.computeProjectDataMainThread(filePath);
    }
  }

  /**
   * Compute project data for multiple files in batch
   */
  async batchCompute(filePaths: string[]): Promise<Map<string, CachedProjectData>> {
    const startTime = Date.now();
    
    try {
      if (this.workersDisabled || filePaths.length === 0) {
        return await this.batchComputeMainThread(filePaths);
      }

      const results = await this.retryOperation(
        () => this.projectWorkerManager.getBatchProjectData(filePaths),
        `batchCompute:${filePaths.length}files`,
        this.maxRetries
      );

      // Update metrics
      this.metrics.projectDataSuccess += filePaths.length;
      this.updateAverageTime('projectData', Date.now() - startTime);
      
      return results;
      
    } catch (error) {
      console.error(`WorkerOrchestrator: Failed to batch compute ${filePaths.length} files:`, error);
      
      // Update failure metrics
      this.metrics.projectDataFailures += filePaths.length;
      this.handleWorkerFailure();
      
      // Fallback to main thread
      return await this.batchComputeMainThread(filePaths);
    }
  }

  /**
   * Generic retry mechanism with exponential backoff
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: wait 1s, 2s, 4s, etc.
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          console.log(`WorkerOrchestrator: Retrying ${operationName}, attempt ${attempt}/${maxRetries}`);
        }
        
        return await operation();
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`WorkerOrchestrator: ${operationName} failed, attempt ${attempt}/${maxRetries}:`, error);
        
        // If this is the last attempt, don't wait
        if (attempt === maxRetries) {
          break;
        }
      }
    }
    
    throw lastError!;
  }

  /**
   * Handle worker failures and implement circuit breaker
   */
  private handleWorkerFailure(): void {
    this.workerFailureCount++;
    
    if (this.workerFailureCount >= this.maxWorkerFailures) {
      console.warn(`WorkerOrchestrator: Too many worker failures (${this.workerFailureCount}), disabling workers temporarily`);
      this.workersDisabled = true;
      this.metrics.fallbackToMainThread++;
      
      // Re-enable workers after 30 seconds
      setTimeout(() => {
        console.log('WorkerOrchestrator: Re-enabling workers after cooldown period');
        this.workersDisabled = false;
        this.workerFailureCount = 0;
      }, 30000);
    }
  }

  /**
   * Convert priority string to TaskWorkerManager priority enum
   */
  private convertPriority(priority: "high" | "normal" | "low"): number {
    switch (priority) {
      case "high": return 0;   // TaskPriority.HIGH
      case "normal": return 1; // TaskPriority.NORMAL  
      case "low": return 2;    // TaskPriority.LOW
      default: return 1;
    }
  }

  /**
   * Update running average for performance metrics
   */
  private updateAverageTime(operation: 'taskParsing' | 'projectData', duration: number): void {
    const key = operation === 'taskParsing' ? 'averageTaskParsingTime' : 'averageProjectDataTime';
    this.metrics.totalOperations++;
    
    // Calculate weighted average
    const currentAvg = this.metrics[key];
    const weight = Math.min(this.metrics.totalOperations, 100); // Limit weight to prevent stale averages
    this.metrics[key] = (currentAvg * (weight - 1) + duration) / weight;
  }

  /**
   * Update worker processing enabled state
   * Allows dynamic enabling/disabling of worker processing without restart
   */
  setWorkerProcessingEnabled(enabled: boolean): void {
    this.enableWorkerProcessing = enabled;
    if (!enabled) {
      console.log("WorkerOrchestrator: Worker processing disabled, will use main thread parsing");
    } else {
      console.log("WorkerOrchestrator: Worker processing enabled");
      // Reset circuit breaker if re-enabling
      if (this.workersDisabled && this.workerFailureCount < this.maxWorkerFailures) {
        this.workersDisabled = false;
        this.workerFailureCount = 0;
        console.log("WorkerOrchestrator: Circuit breaker reset");
      }
    }
  }

  /**
   * Get current worker processing status
   */
  isWorkerProcessingEnabled(): boolean {
    return this.enableWorkerProcessing && !this.workersDisabled;
  }

  // Removed duplicate getMetrics() - using the more comprehensive one below

  /**
   * Fallback implementations for main thread processing
   */
  private async parseFileTasksMainThread(file: TFile): Promise<Task[]> {
    this.metrics.fallbackToMainThread++;
    console.warn(`WorkerOrchestrator: Falling back to main thread parsing for ${file.path}`);
    
    // Import and use ConfigurableTaskParser for fallback
    const { ConfigurableTaskParser } = await import("../core/ConfigurableTaskParser");
    const { CanvasParser } = await import("../core/CanvasParser");
    
    const extension = file.extension.toLowerCase();
    let tasks: Task[] = [];
    
    if (extension === "md") {
      // Get necessary data
      const vault = (this.taskWorkerManager as any).vault;
      const metadataCache = (this.taskWorkerManager as any).metadataCache;
      const content = await vault.cachedRead(file);
      const fileCache = metadataCache.getFileCache(file);
      const fileMetadata = fileCache?.frontmatter || {};
      
      // Create parser with complete settings including metadataParseMode
      const parser = new ConfigurableTaskParser({
        parseMetadata: true,
        parseTags: true,
        parseComments: true,
        parseHeadings: true,
        metadataParseMode: MetadataParseMode.Both, // Parse both emoji and dataview metadata
        maxIndentSize: 8,
        maxParseIterations: 4000,
        maxMetadataIterations: 400,
        maxTagLength: 100,
        maxEmojiValueLength: 200,
        maxStackOperations: 4000,
        maxStackSize: 1000,
        statusMapping: {},
        emojiMapping: {
          "📅": "dueDate",
          "🛫": "startDate",
          "⏳": "scheduledDate",
          "✅": "completedDate",
          "❌": "cancelledDate",
          "➕": "createdDate",
          "🔁": "recurrence",
          "🏁": "onCompletion",
          "⛔": "dependsOn",
          "🆔": "id",
          "🔺": "priority",
          "⏫": "priority",
          "🔼": "priority",
          "🔽": "priority",
          "⏬": "priority"
        },
        specialTagPrefixes: {}
      });
      
      // Parse tasks - raw extraction only, no project enhancement
      // Project data will be handled by Augmentor per dataflow architecture
      const markdownTasks = parser.parseLegacy(
        content, 
        file.path, 
        fileMetadata,
        undefined,  // No project config in fallback
        undefined   // No tgProject in fallback
      );
      tasks.push(...markdownTasks);
      
    } else if (extension === "canvas") {
      // For canvas files, we need plugin instance
      console.warn(`WorkerOrchestrator: Canvas parsing requires plugin instance, returning empty`);
    }
    
    return tasks;
  }

  private async batchParseMainThread(files: TFile[]): Promise<Map<string, Task[]>> {
    this.metrics.fallbackToMainThread++;
    const results = new Map<string, Task[]>();
    
    // Process files sequentially on main thread
    for (const file of files) {
      try {
        const tasks = await this.parseFileTasksMainThread(file);
        results.set(file.path, tasks);
      } catch (error) {
        console.error(`Main thread parsing failed for ${file.path}:`, error);
        results.set(file.path, []);
      }
    }
    
    return results;
  }

  private async computeProjectDataMainThread(filePath: string): Promise<CachedProjectData | null> {
    this.metrics.fallbackToMainThread++;
    console.warn(`WorkerOrchestrator: Main thread project data computation not implemented for ${filePath}`);
    return null;
  }

  private async batchComputeMainThread(filePaths: string[]): Promise<Map<string, CachedProjectData>> {
    this.metrics.fallbackToMainThread++;
    const results = new Map<string, CachedProjectData>();
    
    // Process files sequentially on main thread  
    for (const filePath of filePaths) {
      try {
        const data = await this.computeProjectDataMainThread(filePath);
        if (data) {
          results.set(filePath, data);
        }
      } catch (error) {
        console.error(`Main thread project data computation failed for ${filePath}:`, error);
      }
    }
    
    return results;
  }

  /**
   * Get performance metrics
   */
  getMetrics(): any {
    const totalTasks = this.metrics.taskParsingSuccess + this.metrics.taskParsingFailures;
    const totalProjects = this.metrics.projectDataSuccess + this.metrics.projectDataFailures;
    
    return {
      ...this.metrics,
      taskParsingSuccessRate: totalTasks > 0 ? (this.metrics.taskParsingSuccess / totalTasks) : 0,
      projectDataSuccessRate: totalProjects > 0 ? (this.metrics.projectDataSuccess / totalProjects) : 0,
      workersEnabled: !this.workersDisabled,
      workerFailureCount: this.workerFailureCount,
      taskWorkerStats: this.taskWorkerManager.getStats(),
      projectWorkerStats: this.projectWorkerManager.getMemoryStats()
    };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics = {
      taskParsingSuccess: 0,
      taskParsingFailures: 0,
      projectDataSuccess: 0,
      projectDataFailures: 0,
      averageTaskParsingTime: 0,
      averageProjectDataTime: 0,
      totalOperations: 0,
      fallbackToMainThread: 0
    };
  }

  /**
   * Force enable/disable workers (for testing or configuration)
   */
  setWorkersEnabled(enabled: boolean): void {
    this.workersDisabled = !enabled;
    if (enabled) {
      this.workerFailureCount = 0;
    }
  }

  /**
   * Check if a batch operation is currently in progress
   */
  isBatchProcessing(): boolean {
    return this.taskWorkerManager.isProcessingBatchTask() || 
           this.projectWorkerManager.isWorkersEnabled();
  }

  /**
   * Get current queue sizes for monitoring
   */
  getQueueStats() {
    return {
      taskQueueSize: this.taskWorkerManager.getPendingTaskCount(),
      taskBatchProgress: this.taskWorkerManager.getBatchProgress(),
      projectMemoryStats: this.projectWorkerManager.getMemoryStats()
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.taskWorkerManager.onunload();
    this.projectWorkerManager.destroy();
  }
}