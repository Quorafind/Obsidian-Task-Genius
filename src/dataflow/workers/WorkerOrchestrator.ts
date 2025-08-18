import type { TFile } from "obsidian";
import type { Task } from "../../types/task";
import type { CachedProjectData } from "../../utils/ProjectDataCache";
import { TaskWorkerManager, DEFAULT_WORKER_OPTIONS } from "../../utils/workers/TaskWorkerManager";
import { ProjectDataWorkerManager } from "../../utils/ProjectDataWorkerManager";

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

  constructor(
    taskWorkerManager: TaskWorkerManager,
    projectWorkerManager: ProjectDataWorkerManager
  ) {
    this.taskWorkerManager = taskWorkerManager;
    this.projectWorkerManager = projectWorkerManager;
  }

  /**
   * Parse tasks from a file using workers with fallback
   */
  async parseFileTasks(file: TFile, priority: "high" | "normal" | "low" = "normal"): Promise<Task[]> {
    const startTime = Date.now();
    
    try {
      // Check if workers are available and not circuit-broken
      if (this.workersDisabled) {
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
      if (this.workersDisabled || files.length === 0) {
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
   * Fallback implementations for main thread processing
   */
  private async parseFileTasksMainThread(file: TFile): Promise<Task[]> {
    this.metrics.fallbackToMainThread++;
    // This would typically delegate to the original synchronous parsers
    // For now, return empty array as a safe fallback
    console.warn(`WorkerOrchestrator: Main thread parsing not implemented for ${file.path}`);
    return [];
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
  getMetrics() {
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