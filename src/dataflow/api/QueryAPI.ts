import type { Task, TaskFilter, SortingCriteria } from "../../types/task";
import type { App, Vault, MetadataCache } from "obsidian";
import { Repository } from "../indexer/Repository";

/**
 * QueryAPI - Public query interface for task data
 * This provides a clean, stable API for views to access task data
 */
export class QueryAPI {
  private repository: Repository;
  private taskCache: Task[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 100; // 100ms cache for synchronous access
  
  // Promise cache for async operations to prevent duplicate requests
  private pendingPromise: Promise<Task[]> | null = null;

  constructor(
    private app: App,
    private vault: Vault,
    private metadataCache: MetadataCache
  ) {
    this.repository = new Repository(app, vault, metadataCache);
  }

  /**
   * Initialize the API (loads persisted data)
   */
  async initialize(): Promise<void> {
    await this.repository.initialize();
  }

  /**
   * Get all tasks with deduplication for concurrent requests
   */
  async getAllTasks(): Promise<Task[]> {
    // If there's already a pending request, return the same promise
    if (this.pendingPromise) {
      return this.pendingPromise;
    }
    
    // Create new promise and cache it
    this.pendingPromise = this.repository.all().then(tasks => {
      // Update synchronous cache with fresh data
      this.taskCache = tasks;
      this.cacheTimestamp = Date.now();
      
      // Clear pending promise after completion
      this.pendingPromise = null;
      
      return tasks;
    }).catch(error => {
      // Clear pending promise on error
      this.pendingPromise = null;
      throw error;
    });
    
    return this.pendingPromise;
  }

  /**
   * Get tasks by project
   */
  async getTasksByProject(project: string): Promise<Task[]> {
    return this.repository.byProject(project);
  }

  /**
   * Get tasks by tags (intersection)
   */
  async getTasksByTags(tags: string[]): Promise<Task[]> {
    return this.repository.byTags(tags);
  }

  /**
   * Get tasks by completion status
   */
  async getTasksByStatus(completed: boolean): Promise<Task[]> {
    return this.repository.byStatus(completed);
  }

  /**
   * Get tasks by date range
   */
  async getTasksByDateRange(opts: { 
    from?: number; 
    to?: number; 
    field?: "due" | "start" | "scheduled" 
  }): Promise<Task[]> {
    return this.repository.byDateRange(opts);
  }

  /**
   * Get a task by ID
   */
  async getTaskById(id: string): Promise<Task | null> {
    return this.repository.byId(id);
  }

  // Legacy method aliases for backward compatibility
  async all(): Promise<Task[]> {
    return this.getAllTasks();
  }

  async byProject(project: string): Promise<Task[]> {
    return this.getTasksByProject(project);
  }

  async byTags(tags: string[]): Promise<Task[]> {
    return this.getTasksByTags(tags);
  }

  async byStatus(completed: boolean): Promise<Task[]> {
    return this.getTasksByStatus(completed);
  }

  async byDateRange(opts: { 
    from?: number; 
    to?: number; 
    field?: "due" | "start" | "scheduled" 
  }): Promise<Task[]> {
    return this.getTasksByDateRange(opts);
  }

  async byId(id: string): Promise<Task | null> {
    return this.getTaskById(id);
  }

  /**
   * Query tasks with filter and sorting
   */
  async query(filter?: TaskFilter, sorting?: SortingCriteria[]): Promise<Task[]> {
    return this.repository.query(filter, sorting);
  }

  /**
   * Get index summary statistics  
   */
  async getIndexSummary(): Promise<{
    total: number;
    byProject: Record<string, number>;
    byTag: Record<string, number>;
  }> {
    const summary = await this.repository.getSummary();
    
    // Convert Maps to Records for easier consumption
    const byProject: Record<string, number> = {};
    for (const [key, value] of summary.byProject) {
      byProject[key] = value;
    }
    
    const byTag: Record<string, number> = {};
    for (const [key, value] of summary.byTag) {
      byTag[key] = value;
    }
    
    return {
      total: summary.total,
      byProject,
      byTag,
    };
  }

  /**
   * Get detailed summary statistics (legacy method)
   */
  async getSummary(): Promise<{
    total: number;
    byProject: Record<string, number>;
    byTag: Record<string, number>;
    byStatus: Record<string, number>;
  }> {
    const summary = await this.repository.getSummary();
    
    // Convert Maps to Records for easier consumption
    const byProject: Record<string, number> = {};
    for (const [key, value] of summary.byProject) {
      byProject[key] = value;
    }
    
    const byTag: Record<string, number> = {};
    for (const [key, value] of summary.byTag) {
      byTag[key] = value;
    }
    
    const byStatus: Record<string, number> = {};
    for (const [key, value] of summary.byStatus) {
      byStatus[String(key)] = value;
    }
    
    return {
      total: summary.total,
      byProject,
      byTag,
      byStatus,
    };
  }

  /**
   * Get the underlying repository (for advanced usage)
   */
  getRepository(): Repository {
    return this.repository;
  }

  // ===== Synchronous Cache Methods =====
  
  /**
   * Update the synchronous cache with fresh data
   */
  private async updateCache(): Promise<void> {
    this.taskCache = await this.repository.all();
    this.cacheTimestamp = Date.now();
  }

  /**
   * Get all tasks synchronously (uses cache)
   * Returns empty array if cache is not initialized
   */
  getAllTasksSync(): Task[] {
    if (!this.taskCache || Date.now() - this.cacheTimestamp > this.CACHE_DURATION) {
      // Cache is stale or not initialized, trigger async update
      console.debug("[QueryAPI] Sync cache miss, triggering async update");
      this.updateCache().catch(error => {
        console.error("[QueryAPI] Failed to update cache:", error);
      });
      return this.taskCache || [];
    }
    return this.taskCache;
  }

  /**
   * Get task by ID synchronously (uses cache)
   * Returns null if not found or cache not initialized
   */
  getTaskByIdSync(id: string): Task | null {
    const tasks = this.getAllTasksSync();
    return tasks.find(task => task.id === id) || null;
  }

  /**
   * Ensure cache is populated (call this during initialization)
   */
  async ensureCache(): Promise<void> {
    if (!this.taskCache) {
      console.log("[QueryAPI] Populating initial cache...");
      try {
        const tasks = await this.repository.all();
        this.taskCache = tasks;
        this.cacheTimestamp = Date.now();
        console.log(`[QueryAPI] Cache populated with ${tasks.length} tasks`);
      } catch (error) {
        console.error("[QueryAPI] Failed to populate initial cache:", error);
      }
    }
  }

  // ===== Convenience Query Methods =====

  /**
   * Get tasks for a specific file
   */
  async getTasksForFile(filePath: string): Promise<Task[]> {
    const allTasks = await this.getAllTasks();
    return allTasks.filter(task => task.filePath === filePath);
  }

  /**
   * Get tasks for a specific file (synchronous)
   */
  getTasksForFileSync(filePath: string): Task[] {
    const allTasks = this.getAllTasksSync();
    return allTasks.filter(task => task.filePath === filePath);
  }

  /**
   * Get incomplete tasks
   */
  async getIncompleteTasks(): Promise<Task[]> {
    return this.getTasksByStatus(false);
  }

  /**
   * Get incomplete tasks (synchronous)
   */
  getIncompleteTasksSync(): Task[] {
    const allTasks = this.getAllTasksSync();
    return allTasks.filter(task => !task.completed);
  }

  /**
   * Get completed tasks
   */
  async getCompletedTasks(): Promise<Task[]> {
    return this.getTasksByStatus(true);
  }

  /**
   * Get completed tasks (synchronous)
   */
  getCompletedTasksSync(): Task[] {
    const allTasks = this.getAllTasksSync();
    return allTasks.filter(task => task.completed);
  }

  /**
   * Get tasks due today
   */
  async getTasksDueToday(): Promise<Task[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return this.getTasksByDateRange({
      from: today.getTime(),
      to: tomorrow.getTime(),
      field: 'due'
    });
  }

  /**
   * Get tasks due today (synchronous)
   */
  getTasksDueTodaySync(): Task[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const allTasks = this.getAllTasksSync();
    return allTasks.filter(task => {
      if (!task.metadata?.dueDate) return false;
      return task.metadata.dueDate >= today.getTime() && 
             task.metadata.dueDate < tomorrow.getTime();
    });
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(): Promise<Task[]> {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const allTasks = await this.getAllTasks();
    
    return allTasks.filter(task => 
      !task.completed && 
      task.metadata?.dueDate && 
      task.metadata.dueDate < now.getTime()
    );
  }

  /**
   * Get overdue tasks (synchronous)
   */
  getOverdueTasksSync(): Task[] {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const allTasks = this.getAllTasksSync();
    
    return allTasks.filter(task => 
      !task.completed && 
      task.metadata?.dueDate && 
      task.metadata.dueDate < now.getTime()
    );
  }

  /**
   * Get all available contexts and projects
   */
  async getAvailableContextsAndProjects(): Promise<{
    contexts: string[];
    projects: string[];
  }> {
    const allTasks = await this.getAllTasks();
    const contexts = new Set<string>();
    const projects = new Set<string>();
    
    allTasks.forEach(task => {
      // Add context
      if (task.metadata?.context) {
        contexts.add(task.metadata.context);
      }
      
      // Add project (support multiple formats)
      if (task.metadata?.project) {
        projects.add(task.metadata.project);
      }
      
      // Support legacy tgProject format
      const metadata = task.metadata as any;
      if (metadata?.tgProject?.name) {
        projects.add(metadata.tgProject.name);
      }
    });
    
    return {
      contexts: Array.from(contexts).sort(),
      projects: Array.from(projects).sort()
    };
  }

  /**
   * Get all available contexts and projects (synchronous)
   */
  getAvailableContextsAndProjectsSync(): {
    contexts: string[];
    projects: string[];
  } {
    const allTasks = this.getAllTasksSync();
    const contexts = new Set<string>();
    const projects = new Set<string>();
    
    allTasks.forEach(task => {
      // Add context
      if (task.metadata?.context) {
        contexts.add(task.metadata.context);
      }
      
      // Add project (support multiple formats)
      if (task.metadata?.project) {
        projects.add(task.metadata.project);
      }
      
      // Support legacy tgProject format
      const metadata = task.metadata as any;
      if (metadata?.tgProject?.name) {
        projects.add(metadata.tgProject.name);
      }
    });
    
    return {
      contexts: Array.from(contexts).sort(),
      projects: Array.from(projects).sort()
    };
  }
}