import type { Task } from "../../types/task";

// Thin repository façade; will delegate to existing TaskIndexer
export class Repository {
  async updateFile(path: string, tasks: Task[]): Promise<void> {
    // TODO: wire to TaskIndexer.updateIndexWithTasks
  }

  async all(): Promise<Task[]> {
    return [];
  }

  async byProject(project: string): Promise<Task[]> {
    return [];
  }
}

