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
  private sourceSeq: number = 0; // Track source sequence to differentiate events
  private icsEvents: Task[] = []; // Store ICS events separately

  constructor(
    private app: App,
    private vault: Vault,
    private metadataCache: MetadataCache
  ) {
    this.indexer = new TaskIndexer(app, vault, metadataCache);
    // Use a stable version string to avoid cache invalidation
    this.storage = new Storage(app.appId || "obsidian-task-genius", "1.0.0");
  }

  /**
   * Initialize the repository (load persisted data if available)
   */
  async initialize(): Promise<void> {
    console.log("[Repository] Initializing repository...");
    
    // Try to load consolidated index from storage
    const consolidated = await this.storage.loadConsolidated();
    if (consolidated && consolidated.data) {
      // Restore the index from persisted data
      console.log("[Repository] Restoring index from persisted snapshot...");
      await this.indexer.restoreFromSnapshot(consolidated.data);
      
      const taskCount = await this.indexer.getTotalTaskCount();
      console.log(`[Repository] Index restored with ${taskCount} tasks`);
      
      // Emit cache ready event
      emit(this.app, Events.CACHE_READY, {
        initial: true,
        timestamp: Date.now(),
        seq: Seq.next()
      });
    } else {
      console.log("[Repository] No persisted data found, starting with empty index");
    }
    
    // Load ICS events from storage
    this.icsEvents = await this.storage.loadIcsEvents();
    console.log(`[Repository] Loaded ${this.icsEvents.length} ICS events from storage`);
  }

  /**
   * Update tasks for a specific file
   * @param filePath - Path of the file
   * @param tasks - Tasks to update
   * @param sourceSeq - Optional source sequence to track event origin
   */
  async updateFile(filePath: string, tasks: Task[], sourceSeq?: number): Promise<void> {
    // Check if tasks have actually changed
    const existingAugmented = await this.storage.loadAugmented(filePath);
    const hasChanges = !existingAugmented || 
      JSON.stringify(tasks) !== JSON.stringify(existingAugmented.data);
    
    // Always update the in-memory index for consistency
    await this.indexer.updateIndexWithTasks(filePath, tasks);
    
    // Always store augmented tasks to cache
    await this.storage.storeAugmented(filePath, tasks);
    
    // Only emit update event if there are actual changes
    if (hasChanges) {
      this.lastSequence = Seq.next();
      emit(this.app, Events.TASK_CACHE_UPDATED, {
        changedFiles: [filePath],
        stats: {
          total: await this.indexer.getTotalTaskCount(),
          changed: tasks.length
        },
        timestamp: Date.now(),
        seq: this.lastSequence,
        sourceSeq: sourceSeq || 0 // Include source sequence for loop detection
      });
    }
  }

  /**
   * Update tasks for multiple files in batch
   * @param updates - Map of file paths to tasks
   * @param sourceSeq - Optional source sequence to track event origin
   */
  async updateBatch(updates: Map<string, Task[]>, sourceSeq?: number): Promise<void> {
    const changedFiles: string[] = [];
    let totalChanged = 0;
    let hasActualChanges = false;

    // Process each file update and check for actual changes
    for (const [filePath, tasks] of updates) {
      // Check if tasks have actually changed
      const existingAugmented = await this.storage.loadAugmented(filePath);
      const hasChanges = !existingAugmented || 
        JSON.stringify(tasks) !== JSON.stringify(existingAugmented.data);
      
      await this.indexer.updateIndexWithTasks(filePath, tasks);
      await this.storage.storeAugmented(filePath, tasks);
      
      if (hasChanges) {
        changedFiles.push(filePath);
        totalChanged += tasks.length;
        hasActualChanges = true;
      }
    }

    // Only emit events and persist if there are actual changes
    if (hasActualChanges) {
      // Persist the consolidated index after batch updates
      await this.persist();
      console.log(`[Repository] Persisted index after batch update of ${changedFiles.length} files with changes`);

      // Emit batch update event only for files that actually changed
      this.lastSequence = Seq.next();
      emit(this.app, Events.TASK_CACHE_UPDATED, {
        changedFiles,
        stats: {
          total: await this.indexer.getTotalTaskCount(),
          changed: totalChanged
        },
        timestamp: Date.now(),
        seq: this.lastSequence,
        sourceSeq: sourceSeq || 0 // Include source sequence for loop detection
      });
    } else {
      console.log(`[Repository] Batch update completed with no actual changes - skipping event emission`);
    }
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
   * Update ICS events in the repository
   */
  async updateIcsEvents(events: Task[], sourceSeq?: number): Promise<void> {
    console.log(`[Repository] Updating ${events.length} ICS events`);
    
    // Store the new ICS events
    this.icsEvents = events;
    
    // Store ICS events to persistence
    await this.storage.storeIcsEvents(events);
    
    // Emit update event to notify views
    this.lastSequence = Seq.next();
    emit(this.app, Events.TASK_CACHE_UPDATED, {
      changedFiles: ['ics:events'], // Special marker for ICS events
      stats: {
        total: await this.getTotalTaskCount(),
        changed: events.length,
        icsEvents: events.length
      },
      timestamp: Date.now(),
      seq: this.lastSequence,
      sourceSeq: sourceSeq || 0
    });
  }

  /**
   * Get total task count including ICS events
   */
  async getTotalTaskCount(): Promise<number> {
    const fileTaskCount = await this.indexer.getTotalTaskCount();
    return fileTaskCount + this.icsEvents.length;
  }

  /**
   * Get all tasks from the index (including ICS events)
   */
  async all(): Promise<Task[]> {
    const fileTasks = await this.indexer.getAllTasks();
    // Merge file-based tasks with ICS events
    return [...fileTasks, ...this.icsEvents];
  }

  /**
   * Get tasks by project
   */
  async byProject(project: string): Promise<Task[]> {
    const taskIds = await this.indexer.getTaskIdsByProject(project);
    const fileTasks = await this.getTasksByIds(taskIds);
    
    // Also filter ICS events by project if they have one
    const icsProjectTasks = this.icsEvents.filter(task => 
      task.metadata?.project === project
    );
    
    return [...fileTasks, ...icsProjectTasks];
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