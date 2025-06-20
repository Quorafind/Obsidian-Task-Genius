/**
 * TypeScript type definitions for Gantt Chart Grouping functionality
 *
 * This file contains all the type definitions related to task grouping,
 * metadata-based organization, and group management in the Gantt chart.
 */

import { Task } from "./task";

/** Available fields for grouping tasks */
export type GroupingField =
	| "none"
	| "project"
	| "priority"
	| "status"
	| "tags"
	| "area"
	| "context"
	| "assignee"
	| "heading"
	| "filePath"
	| "dueDate"
	| "startDate"
	| "createdDate"
	| "completedDate";

/** Grouping options enum for better type safety */
export enum GroupingOptions {
	NONE = "none",
	PROJECT = "project",
	PRIORITY = "priority",
	STATUS = "status",
	TAGS = "tags",
	AREA = "area",
	CONTEXT = "context",
	ASSIGNEE = "assignee",
	HEADING = "heading",
	FILE_PATH = "filePath",
	DUE_DATE = "dueDate",
	START_DATE = "startDate",
	CREATED_DATE = "createdDate",
	COMPLETED_DATE = "completedDate",
}

/** Configuration for task grouping */
export interface GroupingConfig {
	/** Primary grouping field */
	primaryGroupBy?: GroupingField;
	/** Secondary grouping field (for nested groups) */
	secondaryGroupBy?: GroupingField;
	/** Whether to show group headers */
	showGroupHeaders?: boolean;
	/** Whether groups are collapsible */
	collapsibleGroups?: boolean;
	/** Default group expansion state */
	defaultExpanded?: boolean;
	/** Custom group ordering */
	groupOrder?: string[];
	/** Group header height in pixels */
	groupHeaderHeight?: number;
	/** Whether to show empty groups */
	showEmptyGroups?: boolean;
	/** Group sorting criteria */
	groupSorting?: GroupSortingConfig;
	/** Group filtering options */
	groupFiltering?: GroupFilteringConfig;
}

/** Group sorting configuration */
export interface GroupSortingConfig {
	/** Sort groups by field */
	sortBy?: "label" | "taskCount" | "completionRate" | "priority" | "dueDate";
	/** Sort direction */
	direction?: "asc" | "desc";
	/** Custom sort function */
	customSort?: (a: TaskGroup, b: TaskGroup) => number;
}

/** Group filtering configuration */
export interface GroupFilteringConfig {
	/** Hide empty groups */
	hideEmpty?: boolean;
	/** Hide completed groups */
	hideCompleted?: boolean;
	/** Minimum task count to show group */
	minTaskCount?: number;
	/** Custom filter function */
	customFilter?: (group: TaskGroup) => boolean;
}

/** Task group data structure */
export interface TaskGroup {
	/** Unique identifier for the group */
	id: string;
	/** Display label for the group */
	label: string;
	/** Grouping field used to create this group */
	field: GroupingField;
	/** Value of the grouping field */
	value: string | number | null;
	/** Tasks in this group */
	tasks: Task[];
	/** Subgroups (for nested grouping) */
	subGroups?: TaskGroup[];
	/** Whether the group is expanded */
	expanded: boolean;
	/** Nesting level (0 = top level) */
	level: number;
	/** Parent group reference */
	parentGroup?: TaskGroup;
	/** Visual properties */
	y: number;
	height: number;
	headerHeight: number;
	/** Group metadata */
	metadata?: GroupMetadata;
}

/** Metadata for task groups */
export interface GroupMetadata {
	/** Total number of tasks (including subgroups) */
	totalTasks: number;
	/** Number of completed tasks */
	completedTasks: number;
	/** Number of overdue tasks */
	overdueTasks: number;
	/** Number of upcoming tasks (due within a week) */
	upcomingTasks: number;
	/** Completion percentage */
	completionRate: number;
	/** Average priority of tasks in group */
	averagePriority?: number;
	/** Earliest due date in group */
	earliestDueDate?: number;
	/** Latest due date in group */
	latestDueDate?: number;
	/** Group creation timestamp */
	createdAt: number;
	/** Last update timestamp */
	updatedAt: number;
}

/** Enhanced Gantt task item with grouping information */
export interface GroupedGanttTaskItem {
	/** Original task data */
	task: Task;
	/** Group ID this task belongs to */
	groupId: string;
	/** Group nesting level */
	groupLevel: number;
	/** Index within the group */
	groupIndex: number;
	/** Whether this is a group header item */
	isGroupHeader?: boolean;
	/** Visual positioning */
	y: number;
	startX?: number;
	endX?: number;
	width?: number;
	/** Whether this is a milestone */
	isMilestone: boolean;
	/** Task level in hierarchy */
	level: number;
}

/** Group state management */
export interface GroupState {
	/** Group expansion states */
	expanded: Map<string, boolean>;
	/** Group visibility states */
	visible: Map<string, boolean>;
	/** Group selection states */
	selected: Map<string, boolean>;
	/** Group ordering */
	order: string[];
}

/** Group interaction events */
export interface GroupInteractionEvents {
	/** Group expansion/collapse */
	onGroupToggle?: (groupId: string, expanded: boolean) => void;
	/** Task moved between groups */
	onTaskMoved?: (task: Task, fromGroupId: string, toGroupId: string) => void;
	/** Group visibility changed */
	onGroupVisibilityChanged?: (groupId: string, visible: boolean) => void;
	/** Group selected/deselected */
	onGroupSelected?: (groupId: string, selected: boolean) => void;
	/** Group reordered */
	onGroupReordered?: (groupIds: string[]) => void;
}

/** Group statistics */
export interface GroupStatistics {
	/** Total number of groups */
	totalGroups: number;
	/** Number of expanded groups */
	expandedGroups: number;
	/** Number of visible groups */
	visibleGroups: number;
	/** Average tasks per group */
	averageTasksPerGroup: number;
	/** Group with most tasks */
	largestGroup?: TaskGroup;
	/** Group with highest completion rate */
	mostCompletedGroup?: TaskGroup;
}

/** Group validation result */
export interface GroupValidationResult {
	/** Whether the grouping is valid */
	isValid: boolean;
	/** Validation errors */
	errors: string[];
	/** Validation warnings */
	warnings: string[];
	/** Suggested fixes */
	suggestions: string[];
}

/** Group export/import data */
export interface GroupExportData {
	/** Grouping configuration */
	config: GroupingConfig;
	/** Group states */
	states: GroupState;
	/** Export timestamp */
	timestamp: number;
	/** Version for compatibility */
	version: string;
}

/** Group performance metrics */
export interface GroupPerformanceMetrics {
	/** Time to build groups (ms) */
	buildTime: number;
	/** Time to render groups (ms) */
	renderTime: number;
	/** Memory usage (bytes) */
	memoryUsage: number;
	/** Number of virtual items */
	virtualItems: number;
	/** Cache hit rate */
	cacheHitRate: number;
}

/** Utility types for group operations */
export namespace GroupingTypes {
	/** Extract group value type based on field */
	export type GroupValueType<T extends GroupingField> = T extends "priority"
		? number
		: T extends "dueDate" | "startDate" | "createdDate" | "completedDate"
		? number
		: T extends "tags"
		? string[]
		: string;

	/** Group field display names */
	export type GroupFieldDisplayNames = Record<GroupingField, string>;

	/** Group field validators */
	export type GroupFieldValidators = Record<
		GroupingField,
		(value: any) => boolean
	>;

	/** Group field formatters */
	export type GroupFieldFormatters = Record<
		GroupingField,
		(value: any) => string
	>;
}

/** Constants for grouping */
export const GROUPING_CONSTANTS = {
	/** Default group header height */
	DEFAULT_GROUP_HEADER_HEIGHT: 32,
	/** Maximum nesting levels */
	MAX_NESTING_LEVELS: 3,
	/** Default group ordering */
	DEFAULT_GROUP_ORDER: ["priority", "dueDate", "project", "status"],
	/** Group ID separator */
	GROUP_ID_SEPARATOR: "-",
	/** Virtual scrolling buffer size */
	VIRTUAL_BUFFER_SIZE: 200,
	/** Performance monitoring interval */
	PERFORMANCE_MONITOR_INTERVAL: 5000,
} as const;

/** Type guards for grouping */
export namespace GroupingTypeGuards {
	export function isValidGroupingField(
		field: string
	): field is GroupingField {
		return Object.values(GroupingOptions).includes(
			field as GroupingOptions
		);
	}

	export function isTaskGroup(obj: any): obj is TaskGroup {
		return obj && typeof obj.id === "string" && Array.isArray(obj.tasks);
	}

	export function isGroupedGanttTaskItem(
		obj: any
	): obj is GroupedGanttTaskItem {
		return obj && obj.task && typeof obj.groupId === "string";
	}

	export function isGroupingConfig(obj: any): obj is GroupingConfig {
		return (
			obj &&
			(obj.primaryGroupBy === undefined ||
				isValidGroupingField(obj.primaryGroupBy))
		);
	}
}
