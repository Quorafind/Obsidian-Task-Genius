import type { Task } from "../../types/task";
import type { App } from "obsidian";

// Simple names; a thin facade over internal repository/index
export class QueryAPI {
  constructor(private app: App) {}

  // TODO: wire to TaskRepository after it is introduced
  async all(): Promise<Task[]> {
    // Placeholder: later call repository.getAll()
    // Keep behavior consistent with current TaskManager.getAllTasks()
    return [];
  }

  async byProject(project: string): Promise<Task[]> {
    return [];
  }

  async byTags(tags: string[]): Promise<Task[]> {
    return [];
  }

  async byStatus(completed: boolean): Promise<Task[]> {
    return [];
  }

  async byDateRange(opts: { from?: number; to?: number; field?: "due" | "start" | "scheduled" }): Promise<Task[]> {
    return [];
  }

  async byId(id: string): Promise<Task | null> {
    return null;
  }
}

