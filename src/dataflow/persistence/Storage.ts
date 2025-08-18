import type { Task } from "../../types/task";

// Simple storage facade; will wrap LocalStorageCache later
export type RawRecord = { hash: string; time: number; data: Task[] };
export type ProjectRecord = { hash: string; time: number; data: { project?: string; meta: Record<string, any> } };
export type AugmentedRecord = { hash: string; time: number; data: Task[] };

export const Keys = {
  raw: (path: string) => `tasks.raw:${path}`,
  project: (path: string) => `project.data:${path}`,
  augmented: (path: string) => `tasks.augmented:${path}`,
  consolidated: () => `consolidated:taskIndex`,
};

export class Storage {
  // Placeholder API; integrate with LocalStorageCache in next step
  async loadRaw(path: string): Promise<RawRecord | null> { return null }
  async storeRaw(path: string, rec: RawRecord): Promise<void> {}

  async loadProject(path: string): Promise<ProjectRecord | null> { return null }
  async storeProject(path: string, rec: ProjectRecord): Promise<void> {}

  async loadAugmented(path: string): Promise<AugmentedRecord | null> { return null }
  async storeAugmented(path: string, rec: AugmentedRecord): Promise<void> {}
}

