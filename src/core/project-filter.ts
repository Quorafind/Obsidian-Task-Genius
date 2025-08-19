// Compatibility shim for project path filtering used by views
// New dataflow uses indexes, but legacy components import this helper.

import type { Task } from "../types/task";

/**
 * Inclusive filter: select tasks whose effective project path starts with any selected path.
 * Falls back to matching metadata.project, then tgProject.name.
 */
export function filterTasksByProjectPaths(tasks: Task[], selectedPaths: string[], separator: string = "/"): Task[] {
  if (!selectedPaths || selectedPaths.length === 0) return tasks;
  const lowered = selectedPaths.map(p => (p || "").toLowerCase());
  return tasks.filter(t => {
    const project = t.metadata?.project?.toLowerCase() || t.metadata?.tgProject?.name?.toLowerCase() || "";
    if (!project) return false;
    return lowered.some(sel => project === sel || project.startsWith(sel + separator));
  });
}

