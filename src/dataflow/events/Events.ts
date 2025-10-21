import type { App, EventRef } from "obsidian";

// Keep names simple and consistent
export const Events = {
  CACHE_READY: "task-genius:cache-ready",
  TASK_CACHE_UPDATED: "task-genius:task-cache-updated",
  FILE_UPDATED: "task-genius:file-updated",
  PROJECT_DATA_UPDATED: "task-genius:project-data-updated",
  SETTINGS_CHANGED: "task-genius:settings-changed",
  TASK_COMPLETED: "task-genius:task-completed",
  TASK_ADDED: "task-genius:task-added",
  TASK_UPDATED: "task-genius:task-updated",
  TASK_DELETED: "task-genius:task-deleted",
  WRITE_OPERATION_START: "task-genius:write-operation-start",
  WRITE_OPERATION_COMPLETE: "task-genius:write-operation-complete",
  ICS_EVENTS_UPDATED: "task-genius:ics-events-updated",
  FILE_TASK_UPDATED: "task-genius:file-task-updated",
  FILE_TASK_REMOVED: "task-genius:file-task-removed",
  BATCH_OPERATION_START: "task-genius:batch-operation-start",
  BATCH_OPERATION_COMPLETE: "task-genius:batch-operation-complete",
} as const;

// Batch operation payload types
export interface BatchOperationStartPayload {
	count: number;
}

export interface BatchOperationCompletePayload {
	successCount: number;
	failCount: number;
}

export type SeqClock = { next(): number };

let _seq = 0;
export const Seq: SeqClock = {
  next() {
    _seq = (_seq + 1) >>> 0;
    return _seq;
  },
};

// Emit helpers (payload kept as any to maintain compatibility with existing trigger signatures)
export function emit(app: App, name: string, payload?: any): void {
  // @ts-expect-error keep compatibility with existing Obsidian typing overloads
  app.workspace.trigger(name, payload);
}

export function on(app: App, name: string, handler: (...args: any[]) => void): EventRef {
  // Consumers should use component.registerEvent(on(...)) to auto-unsub
  return app.workspace.on(name as any, handler) as EventRef;
}

// Convenience
export const onTaskCacheUpdated = (app: App, handler: (payload: any) => void) =>
  on(app, Events.TASK_CACHE_UPDATED, handler);
export const emitTaskCacheUpdated = (app: App, payload: any) =>
  emit(app, Events.TASK_CACHE_UPDATED, payload);

export const emitBatchOperationStart = (app: App, payload: BatchOperationStartPayload) =>
  emit(app, Events.BATCH_OPERATION_START, payload);
export const emitBatchOperationComplete = (app: App, payload: BatchOperationCompletePayload) =>
  emit(app, Events.BATCH_OPERATION_COMPLETE, payload);

