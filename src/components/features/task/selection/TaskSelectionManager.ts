/**
 * Task Selection Manager
 * Manages multi-selection state for tasks and coordinates bulk operations
 */

import { App, Component } from "obsidian";
import { Task } from "@/types/task";
import {
	SelectionState,
	SelectionEventData,
	SelectionModeChangeEventData,
} from "@/types/selection";
import { LongPressDetector } from "./LongPressDetector";
import TaskProgressBarPlugin from "@/index";

export class TaskSelectionManager extends Component {
	private selectionState: SelectionState;
	public longPressDetector: LongPressDetector;

	// Cache for quick lookup
	private taskCache: Map<string, Task> = new Map();

	constructor(
		private app: App,
		private plugin: TaskProgressBarPlugin
	) {
		super();

		// Initialize selection state
		this.selectionState = {
			selectedTaskIds: new Set<string>(),
			isSelectionMode: false,
		};

		// Initialize long press detector
		this.longPressDetector = new LongPressDetector();
		this.addChild(this.longPressDetector);
	}

	/**
	 * Get current selection state (readonly)
	 */
	public getSelectionState(): Readonly<SelectionState> {
		return {
			selectedTaskIds: new Set(this.selectionState.selectedTaskIds),
			isSelectionMode: this.selectionState.isSelectionMode,
			selectionModeStartTime:
				this.selectionState.selectionModeStartTime,
		};
	}

	/**
	 * Check if selection mode is active
	 */
	public get isSelectionMode(): boolean {
		return this.selectionState.isSelectionMode;
	}

	/**
	 * Toggle task selection
	 */
	public toggleSelection(taskId: string): void {
		if (this.selectionState.selectedTaskIds.has(taskId)) {
			this.deselectTask(taskId);
		} else {
			this.selectTask(taskId);
		}
	}

	/**
	 * Select a task
	 */
	public selectTask(taskId: string): void {
		this.selectionState.selectedTaskIds.add(taskId);
		this.notifySelectionChanged();
	}

	/**
	 * Deselect a task
	 */
	public deselectTask(taskId: string): void {
		this.selectionState.selectedTaskIds.delete(taskId);
		this.notifySelectionChanged();

		// Exit selection mode if no tasks selected
		if (
			this.selectionState.selectedTaskIds.size === 0 &&
			this.selectionState.isSelectionMode
		) {
			this.exitSelectionMode("operation_complete");
		}
	}

	/**
	 * Select all tasks from provided list
	 */
	public selectAll(taskIds: string[]): void {
		for (const taskId of taskIds) {
			this.selectionState.selectedTaskIds.add(taskId);
		}
		this.notifySelectionChanged();
	}

	/**
	 * Clear all selections
	 */
	public clearSelection(): void {
		this.selectionState.selectedTaskIds.clear();
		this.notifySelectionChanged();
	}

	/**
	 * Check if a task is selected
	 */
	public isTaskSelected(taskId: string): boolean {
		return this.selectionState.selectedTaskIds.has(taskId);
	}

	/**
	 * Get count of selected tasks
	 */
	public getSelectedCount(): number {
		return this.selectionState.selectedTaskIds.size;
	}

	/**
	 * Get selected task IDs as array
	 */
	public getSelectedTaskIds(): string[] {
		return Array.from(this.selectionState.selectedTaskIds);
	}

	/**
	 * Get selected task objects
	 */
	public getSelectedTasks(): Task[] {
		const tasks: Task[] = [];
		for (const taskId of this.selectionState.selectedTaskIds) {
			const task = this.taskCache.get(taskId);
			if (task) {
				tasks.push(task);
			}
		}
		return tasks;
	}

	/**
	 * Update task cache for quick lookup
	 */
	public updateTaskCache(tasks: Task[]): void {
		this.taskCache.clear();
		for (const task of tasks) {
			this.taskCache.set(task.id, task);
		}
	}

	/**
	 * Enter selection mode
	 */
	public enterSelectionMode(): void {
		if (this.selectionState.isSelectionMode) {
			return; // Already in selection mode
		}

		this.selectionState.isSelectionMode = true;
		this.selectionState.selectionModeStartTime = Date.now();

		this.notifySelectionModeChanged("user_action");
	}

	/**
	 * Exit selection mode
	 */
	public exitSelectionMode(
		reason: SelectionModeChangeEventData["reason"] = "user_action"
	): void {
		if (!this.selectionState.isSelectionMode) {
			return; // Already exited
		}

		this.selectionState.isSelectionMode = false;
		this.selectionState.selectionModeStartTime = undefined;
		this.clearSelection();

		this.notifySelectionModeChanged(reason);
	}

	/**
	 * Notify selection changed
	 */
	private notifySelectionChanged(): void {
		const eventData: SelectionEventData = {
			selectedTaskIds: this.getSelectedTaskIds(),
			isSelectionMode: this.selectionState.isSelectionMode,
			count: this.getSelectedCount(),
		};

		(this.app.workspace as any).trigger(
			"task-genius:selection-changed",
			eventData
		);
	}

	/**
	 * Notify selection mode changed
	 */
	private notifySelectionModeChanged(
		reason: SelectionModeChangeEventData["reason"]
	): void {
		const eventData: SelectionModeChangeEventData = {
			isSelectionMode: this.selectionState.isSelectionMode,
			reason,
		};

		(this.app.workspace as any).trigger(
			"task-genius:selection-mode-changed",
			eventData
		);
	}

	/**
	 * Component unload
	 */
	onunload(): void {
		this.clearSelection();
		this.taskCache.clear();
	}
}
