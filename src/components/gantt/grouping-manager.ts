/**
 * Gantt Chart Grouping Manager
 *
 * Handles task grouping logic, group hierarchy management, and group state persistence.
 * Provides utilities for organizing tasks into hierarchical groups based on metadata fields.
 */

import { Task } from "../../types/task";
import {
	GroupingConfig,
	GroupingField,
	TaskGroup,
	GroupedGanttTaskItem,
	GroupingOptions,
} from "../../types/gantt-grouping";

export class GanttGroupingManager {
	private groupingConfig: GroupingConfig;
	private groupStates: Map<string, boolean> = new Map(); // Track expanded/collapsed state
	private groupOrder: Map<string, number> = new Map(); // Custom group ordering

	constructor(config: GroupingConfig = {}) {
		this.groupingConfig = {
			primaryGroupBy: "none",
			secondaryGroupBy: "none",
			showGroupHeaders: true,
			collapsibleGroups: true,
			defaultExpanded: true,
			groupOrder: [],
			groupHeaderHeight: 30,
			showEmptyGroups: false,
			...config,
		};
		this.initializeGroupOrder();
	}

	/**
	 * Update grouping configuration
	 */
	updateConfig(config: Partial<GroupingConfig>): void {
		this.groupingConfig = { ...this.groupingConfig, ...config };
		this.initializeGroupOrder();
	}

	/**
	 * Get current grouping configuration
	 */
	getConfig(): GroupingConfig {
		return { ...this.groupingConfig };
	}

	/**
	 * Group tasks based on current configuration
	 */
	groupTasks(tasks: Task[]): TaskGroup[] {
		if (this.groupingConfig.primaryGroupBy === "none") {
			// Return a single default group containing all tasks
			return [
				{
					id: "default",
					label: "All Tasks",
					field: "none",
					value: null,
					tasks: tasks,
					expanded: true,
					level: 0,
					y: 0,
					height: 0,
					headerHeight: 0,
				},
			];
		}

		// Group by primary field
		const primaryGroups = this.groupTasksByField(
			tasks,
			this.groupingConfig.primaryGroupBy!
		);

		// Apply secondary grouping if configured
		if (
			this.groupingConfig.secondaryGroupBy &&
			this.groupingConfig.secondaryGroupBy !== "none"
		) {
			primaryGroups.forEach((group) => {
				group.subGroups = this.groupTasksByField(
					group.tasks,
					this.groupingConfig.secondaryGroupBy!,
					group
				);
			});
		}

		// Apply custom ordering
		this.applyGroupOrdering(primaryGroups);

		// Calculate positions and heights
		this.calculateGroupPositions(primaryGroups);

		return primaryGroups;
	}

	/**
	 * Group tasks by a specific metadata field
	 */
	private groupTasksByField(
		tasks: Task[],
		field: GroupingField,
		parentGroup?: TaskGroup
	): TaskGroup[] {
		const groups = new Map<string, TaskGroup>();
		const level = parentGroup ? parentGroup.level + 1 : 0;

		tasks.forEach((task) => {
			const groupValue = this.getTaskGroupValue(task, field);
			const groupKey = this.getGroupKey(field, groupValue);
			const groupLabel = this.getGroupLabel(field, groupValue);

			if (!groups.has(groupKey)) {
				const groupId = parentGroup
					? `${parentGroup.id}-${groupKey}`
					: groupKey;
				groups.set(groupKey, {
					id: groupId,
					label: groupLabel,
					field: field,
					value: groupValue,
					tasks: [],
					expanded: this.getGroupExpandedState(groupId),
					level: level,
					parentGroup: parentGroup,
					y: 0,
					height: 0,
					headerHeight: this.groupingConfig.groupHeaderHeight || 30,
				});
			}

			groups.get(groupKey)!.tasks.push(task);
		});

		// Filter out empty groups if configured
		const groupArray = Array.from(groups.values());
		return this.groupingConfig.showEmptyGroups
			? groupArray
			: groupArray.filter((group) => group.tasks.length > 0);
	}

	/**
	 * Get the grouping value for a task based on the specified field
	 */
	private getTaskGroupValue(
		task: Task,
		field: GroupingField
	): string | number | null {
		switch (field) {
			case "project":
				return task.metadata.project || "No Project";
			case "priority":
				return task.metadata.priority || 0;
			case "status":
				return task.status || "No Status";
			case "tags":
				// Group by first tag, or "No Tags" if none
				return task.metadata.tags.length > 0
					? task.metadata.tags[0]
					: "No Tags";
			case "area":
				return task.metadata.area || "No Area";
			case "context":
				return task.metadata.context || "No Context";
			case "assignee":
				// This would need to be implemented in the task metadata
				return (task.metadata as any).assignee || "Unassigned";
			case "heading":
				return task.metadata.heading?.join(" > ") || "No Heading";
			case "filePath":
				return task.filePath || "Unknown File";
			case "dueDate":
				return task.metadata.dueDate
					? this.formatDateForGrouping(
							new Date(task.metadata.dueDate)
					  )
					: "No Due Date";
			case "startDate":
				return task.metadata.startDate
					? this.formatDateForGrouping(
							new Date(task.metadata.startDate)
					  )
					: "No Start Date";
			default:
				return "Ungrouped";
		}
	}

	/**
	 * Generate a unique key for a group
	 */
	private getGroupKey(
		field: GroupingField,
		value: string | number | null
	): string {
		return `${field}-${String(value)}`;
	}

	/**
	 * Generate a human-readable label for a group
	 */
	private getGroupLabel(
		field: GroupingField,
		value: string | number | null
	): string {
		if (value === null || value === undefined) {
			return `No ${this.getFieldDisplayName(field)}`;
		}

		switch (field) {
			case "priority":
				return this.formatPriorityLabel(value as number);
			case "dueDate":
			case "startDate":
				return String(value);
			default:
				return String(value);
		}
	}

	/**
	 * Get display name for a grouping field
	 */
	private getFieldDisplayName(field: GroupingField): string {
		const fieldNames: Record<GroupingField, string> = {
			none: "None",
			project: "Project",
			priority: "Priority",
			status: "Status",
			tags: "Tag",
			area: "Area",
			context: "Context",
			assignee: "Assignee",
			heading: "Heading",
			filePath: "File",
			dueDate: "Due Date",
			startDate: "Start Date",
		};
		return fieldNames[field] || field;
	}

	/**
	 * Format priority value for display
	 */
	private formatPriorityLabel(priority: number): string {
		const priorityLabels: Record<number, string> = {
			5: "🔺 Highest",
			4: "⏫ High",
			3: "🔼 Medium",
			2: "🔽 Low",
			1: "⏬ Lowest",
			0: "No Priority",
		};
		return priorityLabels[priority] || `Priority ${priority}`;
	}

	/**
	 * Format date for grouping (e.g., "2024-01", "This Week", etc.)
	 */
	private formatDateForGrouping(date: Date): string {
		const now = new Date();
		const today = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate()
		);
		const taskDate = new Date(
			date.getFullYear(),
			date.getMonth(),
			date.getDate()
		);

		const diffTime = taskDate.getTime() - today.getTime();
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return "Today";
		if (diffDays === 1) return "Tomorrow";
		if (diffDays === -1) return "Yesterday";
		if (diffDays > 0 && diffDays <= 7) return "This Week";
		if (diffDays < 0 && diffDays >= -7) return "Last Week";
		if (diffDays > 7 && diffDays <= 30) return "This Month";
		if (diffDays < -7 && diffDays >= -30) return "Last Month";

		// For dates further out, use month/year format
		return date.toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
		});
	}

	/**
	 * Apply custom group ordering
	 */
	private applyGroupOrdering(groups: TaskGroup[]): void {
		groups.sort((a, b) => {
			const orderA = this.groupOrder.get(a.id) ?? 999;
			const orderB = this.groupOrder.get(b.id) ?? 999;

			if (orderA !== orderB) {
				return orderA - orderB;
			}

			// Fallback to alphabetical sorting
			return a.label.localeCompare(b.label);
		});

		// Recursively sort subgroups
		groups.forEach((group) => {
			if (group.subGroups) {
				this.applyGroupOrdering(group.subGroups);
			}
		});
	}

	/**
	 * Calculate Y positions and heights for all groups
	 */
	private calculateGroupPositions(
		groups: TaskGroup[],
		startY: number = 0
	): number {
		let currentY = startY;

		groups.forEach((group) => {
			group.y = currentY;

			// Add group header height if showing headers
			if (this.groupingConfig.showGroupHeaders) {
				currentY += group.headerHeight;
			}

			if (group.expanded) {
				// Calculate height for subgroups or tasks
				if (group.subGroups && group.subGroups.length > 0) {
					currentY = this.calculateGroupPositions(
						group.subGroups,
						currentY
					);
				} else {
					// Add height for tasks (assuming ROW_HEIGHT per task)
					const ROW_HEIGHT = 24; // This should be imported or passed as parameter
					currentY += group.tasks.length * ROW_HEIGHT;
				}
			}

			group.height = currentY - group.y;
		});

		return currentY;
	}

	/**
	 * Initialize group ordering from configuration
	 */
	private initializeGroupOrder(): void {
		this.groupOrder.clear();
		this.groupingConfig.groupOrder?.forEach((groupId, index) => {
			this.groupOrder.set(groupId, index);
		});
	}

	/**
	 * Get expanded state for a group
	 */
	private getGroupExpandedState(groupId: string): boolean {
		return (
			this.groupStates.get(groupId) ??
			this.groupingConfig.defaultExpanded ??
			true
		);
	}

	/**
	 * Toggle group expanded state
	 */
	toggleGroupExpanded(groupId: string): boolean {
		const currentState = this.getGroupExpandedState(groupId);
		const newState = !currentState;
		this.groupStates.set(groupId, newState);
		return newState;
	}

	/**
	 * Set group expanded state
	 */
	setGroupExpanded(groupId: string, expanded: boolean): void {
		this.groupStates.set(groupId, expanded);
	}

	/**
	 * Get group expanded state (public method)
	 */
	isGroupExpanded(groupId: string): boolean {
		return this.getGroupExpandedState(groupId);
	}

	/**
	 * Get all available grouping fields
	 */
	static getAvailableGroupingFields(): {
		value: GroupingField;
		label: string;
	}[] {
		return [
			{ value: "none", label: "No Grouping" },
			{ value: "project", label: "Project" },
			{ value: "priority", label: "Priority" },
			{ value: "status", label: "Status" },
			{ value: "tags", label: "Tags" },
			{ value: "area", label: "Area" },
			{ value: "context", label: "Context" },
			{ value: "assignee", label: "Assignee" },
			{ value: "heading", label: "Heading" },
			{ value: "filePath", label: "File Path" },
			{ value: "dueDate", label: "Due Date" },
			{ value: "startDate", label: "Start Date" },
		];
	}
}
