import "obsidian";
import { Task, TaskCache } from "../utils/types/TaskIndex";

declare module "obsidian" {
	interface Workspace {
		on(
			event: "task-genius:task-added",
			callback: (task: Task) => void
		): EventRef;
		on(
			event: "task-genius:task-updated",
			callback: (task: Task) => void
		): EventRef;
		on(
			event: "task-genius:task-deleted",
			callback: (taskId: string) => void
		): EventRef;

		on(
			event: "task-genius:task-cache-updated",
			callback: (cache: TaskCache) => void
		): EventRef;

		trigger(event: "task-genius:task-added", task: Task): void;
		trigger(event: "task-genius:task-updated", task: Task): void;
		trigger(event: "task-genius:task-deleted", taskId: string): void;
		trigger(
			event: "task-genius:task-cache-updated",
			cache: TaskCache
		): void;
	}
}
