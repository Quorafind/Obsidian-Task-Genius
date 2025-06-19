/**
 * Gantt Chart Group Interaction Manager
 *
 * Handles group-level interactions including expand/collapse, drag-and-drop between groups,
 * group filtering, and maintaining group state across view changes.
 */

import { Component } from "obsidian";
import { Task } from "../../types/task";
import { TaskGroup, GroupingField } from "../../types/gantt-grouping";
import { GanttGroupingManager } from "./grouping-manager";

export interface GroupInteractionOptions {
	groupingManager: GanttGroupingManager;
	onGroupStateChange?: (groupId: string, expanded: boolean) => void;
	onTaskMoved?: (task: Task, fromGroupId: string, toGroupId: string) => void;
	onGroupFiltered?: (groupId: string, visible: boolean) => void;
}

export class GroupInteractionManager extends Component {
	private groupingManager: GanttGroupingManager;
	private onGroupStateChange: (groupId: string, expanded: boolean) => void;
	private onTaskMoved: (
		task: Task,
		fromGroupId: string,
		toGroupId: string
	) => void;
	private onGroupFiltered: (groupId: string, visible: boolean) => void;

	// State management
	private groupVisibility: Map<string, boolean> = new Map();
	private draggedTask: Task | null = null;
	private draggedFromGroup: string | null = null;
	private dropTargetGroup: string | null = null;

	constructor(options: GroupInteractionOptions) {
		super();
		this.groupingManager = options.groupingManager;
		this.onGroupStateChange = options.onGroupStateChange || (() => {});
		this.onTaskMoved = options.onTaskMoved || (() => {});
		this.onGroupFiltered = options.onGroupFiltered || (() => {});
	}

	/**
	 * Toggle group expanded state
	 */
	toggleGroup(groupId: string): boolean {
		const newState = this.groupingManager.toggleGroupExpanded(groupId);
		this.onGroupStateChange(groupId, newState);
		return newState;
	}

	/**
	 * Expand all groups
	 */
	expandAllGroups(groups: TaskGroup[]): void {
		this.processGroupsRecursively(groups, (group) => {
			this.groupingManager.setGroupExpanded(group.id, true);
			this.onGroupStateChange(group.id, true);
		});
	}

	/**
	 * Collapse all groups
	 */
	collapseAllGroups(groups: TaskGroup[]): void {
		this.processGroupsRecursively(groups, (group) => {
			this.groupingManager.setGroupExpanded(group.id, false);
			this.onGroupStateChange(group.id, false);
		});
	}

	/**
	 * Set group visibility (for filtering)
	 */
	setGroupVisible(groupId: string, visible: boolean): void {
		this.groupVisibility.set(groupId, visible);
		this.onGroupFiltered(groupId, visible);
	}

	/**
	 * Get group visibility state
	 */
	isGroupVisible(groupId: string): boolean {
		return this.groupVisibility.get(groupId) ?? true;
	}

	/**
	 * Filter groups based on search criteria
	 */
	filterGroups(groups: TaskGroup[], searchTerm: string): TaskGroup[] {
		if (!searchTerm.trim()) {
			// Show all groups when no search term
			groups.forEach((group) => this.setGroupVisible(group.id, true));
			return groups;
		}

		const filteredGroups: TaskGroup[] = [];
		const searchLower = searchTerm.toLowerCase();

		for (const group of groups) {
			const matchesGroup = group.label
				.toLowerCase()
				.includes(searchLower);
			const matchesTasks = group.tasks.some((task) =>
				task.content.toLowerCase().includes(searchLower)
			);
			const hasMatchingSubgroups = group.subGroups
				? this.filterGroups(group.subGroups, searchTerm).length > 0
				: false;

			if (matchesGroup || matchesTasks || hasMatchingSubgroups) {
				const filteredGroup: TaskGroup = {
					...group,
					subGroups: group.subGroups
						? this.filterGroups(group.subGroups, searchTerm)
						: undefined,
				};
				filteredGroups.push(filteredGroup);
				this.setGroupVisible(group.id, true);
			} else {
				this.setGroupVisible(group.id, false);
			}
		}

		return filteredGroups;
	}

	/**
	 * Start drag operation for a task
	 */
	startTaskDrag(task: Task, fromGroupId: string): void {
		this.draggedTask = task;
		this.draggedFromGroup = fromGroupId;

		// Add visual feedback
		document.body.classList.add("gantt-dragging-task");
	}

	/**
	 * Handle drag over a group
	 */
	handleDragOver(groupId: string, event: DragEvent): void {
		if (!this.draggedTask) return;

		event.preventDefault();
		event.dataTransfer!.dropEffect = "move";

		// Update drop target
		if (this.dropTargetGroup !== groupId) {
			this.clearDropTarget();
			this.dropTargetGroup = groupId;
			this.addDropTargetVisual(groupId);
		}
	}

	/**
	 * Handle drop on a group
	 */
	handleDrop(groupId: string, event: DragEvent): boolean {
		if (!this.draggedTask || !this.draggedFromGroup) return false;

		event.preventDefault();

		// Check if dropping on the same group
		if (this.draggedFromGroup === groupId) {
			this.endTaskDrag();
			return false;
		}

		// Check if the move is valid
		if (this.canMoveTaskToGroup(this.draggedTask, groupId)) {
			this.onTaskMoved(this.draggedTask, this.draggedFromGroup, groupId);
			this.endTaskDrag();
			return true;
		}

		this.endTaskDrag();
		return false;
	}

	/**
	 * End drag operation
	 */
	endTaskDrag(): void {
		this.draggedTask = null;
		this.draggedFromGroup = null;
		this.clearDropTarget();
		document.body.classList.remove("gantt-dragging-task");
	}

	/**
	 * Check if a task can be moved to a specific group
	 */
	private canMoveTaskToGroup(task: Task, targetGroupId: string): boolean {
		// Get the grouping field and check if the task can be moved
		const config = this.groupingManager.getConfig();
		const primaryField = config.primaryGroupBy;

		// Some fields might not allow moving (e.g., file path, creation date)
		const immutableFields: GroupingField[] = ["filePath", "heading"];

		if (primaryField && immutableFields.includes(primaryField)) {
			return false;
		}

		// Additional validation logic can be added here
		return true;
	}

	/**
	 * Add visual feedback for drop target
	 */
	private addDropTargetVisual(groupId: string): void {
		const groupElement = document.querySelector(
			`[data-group-id="${groupId}"]`
		);
		if (groupElement) {
			groupElement.classList.add("gantt-drop-target");
		}
	}

	/**
	 * Clear drop target visual feedback
	 */
	private clearDropTarget(): void {
		if (this.dropTargetGroup) {
			const groupElement = document.querySelector(
				`[data-group-id="${this.dropTargetGroup}"]`
			);
			if (groupElement) {
				groupElement.classList.remove("gantt-drop-target");
			}
		}
		this.dropTargetGroup = null;
	}

	/**
	 * Process groups recursively
	 */
	private processGroupsRecursively(
		groups: TaskGroup[],
		callback: (group: TaskGroup) => void
	): void {
		for (const group of groups) {
			callback(group);
			if (group.subGroups) {
				this.processGroupsRecursively(group.subGroups, callback);
			}
		}
	}

	/**
	 * Get group statistics
	 */
	getGroupStats(group: TaskGroup): {
		totalTasks: number;
		completedTasks: number;
		overdueTasks: number;
		upcomingTasks: number;
	} {
		let totalTasks = 0;
		let completedTasks = 0;
		let overdueTasks = 0;
		let upcomingTasks = 0;

		const processGroup = (g: TaskGroup) => {
			totalTasks += g.tasks.length;

			for (const task of g.tasks) {
				if (task.completed) {
					completedTasks++;
				}

				if (task.metadata.dueDate) {
					const dueDate = new Date(task.metadata.dueDate);
					const now = new Date();

					if (dueDate < now && !task.completed) {
						overdueTasks++;
					} else if (
						dueDate > now &&
						dueDate <=
							new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
					) {
						upcomingTasks++;
					}
				}
			}

			if (g.subGroups) {
				g.subGroups.forEach(processGroup);
			}
		};

		processGroup(group);

		return {
			totalTasks,
			completedTasks,
			overdueTasks,
			upcomingTasks,
		};
	}

	/**
	 * Export group state for persistence
	 */
	exportGroupState(): Record<string, any> {
		return {
			groupVisibility: Object.fromEntries(this.groupVisibility),
			// Add other state that needs to be persisted
		};
	}

	/**
	 * Import group state from persistence
	 */
	importGroupState(state: Record<string, any>): void {
		if (state.groupVisibility) {
			this.groupVisibility = new Map(
				Object.entries(state.groupVisibility)
			);
		}
	}

	/**
	 * Reset all group states
	 */
	reset(): void {
		this.groupVisibility.clear();
		this.endTaskDrag();
	}
}
