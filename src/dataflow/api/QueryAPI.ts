import type { Task, TaskFilter, SortingCriteria } from "../../types/task";
import type { App, Vault, MetadataCache } from "obsidian";
import { Repository } from "../indexer/Repository";

/**
 * QueryAPI - Public query interface for task data
 * This provides a clean, stable API for views to access task data
 */
export class QueryAPI {
  private repository: Repository;

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
   * Get all tasks
   */
  async getAllTasks(): Promise<Task[]> {
    return this.repository.all();
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
    byStatus: Record<boolean, number>;
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
    
    const byStatus: Record<boolean, number> = {};
    for (const [key, value] of summary.byStatus) {
      byStatus[key] = value;
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
}