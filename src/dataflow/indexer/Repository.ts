import type { Task, TaskCache, TaskFilter, SortingCriteria, TaskIndexer as TaskIndexerInterface } from "../../types/task";
import type { App, Vault, MetadataCache, TFile } from "obsidian";
import { TaskIndexer } from "../../core/task-indexer";
import { Storage } from "../persistence/Storage";
import { emit, Events, Seq } from "../events/Events";

/**
 * Task Repository - combines TaskIndexer with Storage for a complete data layer
 * This is the central repository for all task data operations
 */
export class Repository {
  private indexer: TaskIndexer;
  private storage: Storage;
  private lastSequence: number = 0;

  constructor(
    private app: App,
    private vault: Vault,
    private metadataCache: MetadataCache
  ) {
    this.indexer = new TaskIndexer(app, vault, metadataCache);
    this.storage = new Storage(app.appId || "obsidian-task-genius");
  }

  /**
   * Initialize the repository (load persisted data if available)
   */
  async initialize(): Promise<void> {
    // Try to load consolidated index from storage
    const consolidated = await this.storage.loadConsolidated();
    if (consolidated && consolidated.data) {
      // Restore the index from persisted data
      await this.indexer.restoreFromSnapshot(consolidated.data);
      
      // Emit cache ready event
      emit(this.app, Events.CACHE_READY, {
        initial: true,
        timestamp: Date.now(),
        seq: Seq.next()
      });
    }
  }

  /**
   * Update tasks for a specific file
   */
  async updateFile(filePath: string, tasks: Task[]): Promise<void> {
    // Update the in-memory index
    await this.indexer.updateIndexWithTasks(filePath, tasks);
    
    // Store augmented tasks to cache
    await this.storage.storeAugmented(filePath, tasks);
    
    // Emit update event
    this.lastSequence = Seq.next();
    emit(this.app, Events.TASK_CACHE_UPDATED, {
      changedFiles: [filePath],
      stats: {
        total: await this.indexer.getTotalTaskCount(),
        changed: tasks.length
      },
      timestamp: Date.now(),
      seq: this.lastSequence
    });
  }

  /**
   * Update tasks for multiple files in batch
   */
  async updateBatch(updates: Map<string, Task[]>): Promise<void> {
    const changedFiles: string[] = [];
    let totalChanged = 0;

    // Process each file update
    for (const [filePath, tasks] of updates) {
      await this.indexer.updateIndexWithTasks(filePath, tasks);
      await this.storage.storeAugmented(filePath, tasks);
      changedFiles.push(filePath);
      totalChanged += tasks.length;
    }

    // Emit batch update event
    this.lastSequence = Seq.next();
    emit(this.app, Events.TASK_CACHE_UPDATED, {
      changedFiles,
      stats: {
        total: await this.indexer.getTotalTaskCount(),
        changed: totalChanged
      },
      timestamp: Date.now(),
      seq: this.lastSequence
    });
  }

  /**
   * Remove tasks for a file
   */
  async removeFile(filePath: string): Promise<void> {
    await this.indexer.removeTasksFromFile(filePath);
    
    // Clear storage for this file
    await this.storage.clearFile(filePath);
    
    // Emit update event
    this.lastSequence = Seq.next();
    emit(this.app, Events.TASK_CACHE_UPDATED, {
      changedFiles: [filePath],
      stats: {
        total: await this.indexer.getTotalTaskCount(),
        changed: 0
      },
      timestamp: Date.now(),
      seq: this.lastSequence
    });
  }

  /**
   * Get all tasks from the index
   */
  async all(): Promise<Task[]> {
    return this.indexer.getAllTasks();
  }

  /**
   * Get tasks by project
   */
  async byProject(project: string): Promise<Task[]> {
    const taskIds = await this.indexer.getTaskIdsByProject(project);
    return this.getTasksByIds(taskIds);
  }

  /**
   * Get tasks by tags
   */
  async byTags(tags: string[]): Promise<Task[]> {
    const taskIdSets = await Promise.all(
      tags.map(tag => this.indexer.getTaskIdsByTag(tag))
    );
    
    // Find intersection of all tag sets
    if (taskIdSets.length === 0) return [];
    
    let intersection = new Set(taskIdSets[0]);
    for (let i = 1; i < taskIdSets.length; i++) {
      intersection = new Set([...intersection].filter(id => taskIdSets[i].has(id)));
    }
    
    return this.getTasksByIds(intersection);
  }

  /**
   * Get tasks by completion status
   */
  async byStatus(completed: boolean): Promise<Task[]> {
    const taskIds = await this.indexer.getTaskIdsByCompletionStatus(completed);
    return this.getTasksByIds(taskIds);
  }

  /**
   * Get tasks by date range
   */
  async byDateRange(opts: { 
    from?: number; 
    to?: number; 
    field?: "due" | "start" | "scheduled" 
  }): Promise<Task[]> {
    const field = opts.field || "due";
    const cache = await this.indexer.getCache();
    
    const dateIndex = field === "due" ? cache.dueDate :
                     field === "start" ? cache.startDate :
                     cache.scheduledDate;
    
    const taskIds = new Set<string>();
    
    for (const [dateStr, ids] of dateIndex) {
      const date = new Date(dateStr).getTime();
      
      if (opts.from && date < opts.from) continue;
      if (opts.to && date > opts.to) continue;
      
      for (const id of ids) {
        taskIds.add(id);
      }
    }
    
    return this.getTasksByIds(taskIds);
  }

  /**
   * Get a task by ID
   */
  async byId(id: string): Promise<Task | null> {
    return this.indexer.getTaskById(id) || null;
  }

  /**
   * Query tasks with filter and sorting
   */
  async query(filter?: TaskFilter, sorting?: SortingCriteria[]): Promise<Task[]> {
    const filters = filter ? [filter] : [];
    return this.indexer.queryTasks(filters, sorting);
  }

  /**
   * Get index summary statistics
   */
  async getSummary(): Promise<{
    total: number;
    byProject: Map<string, number>;
    byTag: Map<string, number>;
    byStatus: Map<boolean, number>;
  }> {
    const cache = await this.indexer.getCache();
    
    const byProject = new Map<string, number>();
    for (const [project, ids] of cache.projects) {
      byProject.set(project, ids.size);
    }
    
    const byTag = new Map<string, number>();
    for (const [tag, ids] of cache.tags) {
      byTag.set(tag, ids.size);
    }
    
    const byStatus = new Map<boolean, number>();
    for (const [status, ids] of cache.completed) {
      byStatus.set(status, ids.size);
    }
    
    return {
      total: cache.tasks.size,
      byProject,
      byTag,
      byStatus
    };
  }

  /**
   * Save the current index to persistent storage
   */
  async persist(): Promise<void> {
    const snapshot = await this.indexer.getIndexSnapshot();
    await this.storage.storeConsolidated(snapshot);
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    await this.indexer.clearIndex();
    await this.storage.clear();
  }

  /**
   * Set the parse file callback for the indexer
   */
  setParseFileCallback(callback: (file: TFile) => Promise<Task[]>): void {
    this.indexer.setParseFileCallback(callback);
  }

  /**
   * Get the underlying indexer (for advanced usage)
   */
  getIndexer(): TaskIndexer {
    return this.indexer;
  }

  /**
   * Get the underlying storage (for advanced usage)
   */
  getStorage(): Storage {
    return this.storage;
  }

  /**
   * Helper: Get tasks by a set of IDs
   */
  private async getTasksByIds(taskIds: Set<string> | string[]): Promise<Task[]> {
    const tasks: Task[] = [];
    const ids = Array.isArray(taskIds) ? taskIds : Array.from(taskIds);
    
    for (const id of ids) {
      const task = await this.indexer.getTaskById(id);
      if (task) {
        tasks.push(task);
      }
    }
    
    return tasks;
  }
}