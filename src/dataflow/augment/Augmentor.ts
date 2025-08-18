import type { Task } from "../../types/task";

export interface FileContext {
  filePath: string;
  fileMeta?: Record<string, any>;
  project?: { name?: string; data?: Record<string, any> } | null;
}

// Simple naming: merge file/project context into tasks
export class Augmentor {
  constructor(private options?: { inherit?: Record<string, "task" | "file" | "project" | "merge-array"> }) {}

  merge(ctx: FileContext, tasks: Task[]): Task[] {
    const inherit = this.options?.inherit || {};
    return tasks.map((t) => this.mergeOne(ctx, t, inherit));
  }

  private mergeOne(ctx: FileContext, t: Task, inherit: Record<string, string>): Task {
    const meta = { ...(t.metadata || {}) } as Record<string, any>;

    // Example basic rules (keep minimal; extend later):
    // project
    if (ctx.project?.name && (meta.project == null)) {
      meta.project = ctx.project.name;
    }
    // tags (merge-array)
    const fileTags = Array.isArray(ctx.fileMeta?.tags) ? ctx.fileMeta!.tags : [];
    const taskTags = Array.isArray(meta.tags) ? meta.tags : [];
    meta.tags = Array.from(new Set([...(taskTags as any), ...fileTags]));

    return { ...t, metadata: meta } as Task;
  }
}

