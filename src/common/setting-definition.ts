import { t } from "../translations/helper";
import type TaskProgressBarPlugin from "../index"; // Type-only import
import { BaseHabitData } from "../types/habit-card";
import type { RootFilterState } from "../components/task-filter/ViewTaskFilter";

// Interface for individual project review settings (If still needed, otherwise remove)
// Keep it for now, in case it's used elsewhere, but it's not part of TaskProgressBarSettings anymore
export interface ProjectReviewSetting {
	frequency: string; // Days between reviews
	lastReviewed?: number;
	reviewedTaskIds?: string[];
}

// Interface for individual view settings (If still needed, otherwise remove)
// Keep it for now, in case it's used elsewhere, but it's not part of TaskProgressBarSettings anymore
export interface TaskViewSetting {
	hideCompletedAndAbandonedTasks: boolean;
	sortCriteria: string[];
}

// Define and export ViewMode type
export type ViewMode =
	| "inbox"
	| "forecast"
	| "projects"
	| "tags"
	| "review"
	| "flagged" // Added flagged as it was in the default config attempt
	| string; // Allow custom view IDs

export type DateExistType = "hasDate" | "noDate" | "any";
export type PropertyExistType = "hasProperty" | "noProperty" | "any";

// Define and export ViewFilterRule interface
export interface ViewFilterRule {
	// Simple example, expand as needed
	tagsInclude?: string[];
	tagsExclude?: string[];
	statusInclude?: string[];
	statusExclude?: string[];
	project?: string;
	priority?: string;
	hasDueDate?: DateExistType;
	dueDate?: string; // e.g., 'today', 'next-week', 'yyyy-mm-dd'
	hasStartDate?: DateExistType;
	startDate?: string;
	hasScheduledDate?: DateExistType;
	scheduledDate?: string;
	hasCreatedDate?: DateExistType;
	createdDate?: string;
	hasCompletedDate?: DateExistType;
	completedDate?: string;
	hasRecurrence?: PropertyExistType;
	recurrence?: string;
	textContains?: string;
	pathIncludes?: string;
	pathExcludes?: string;
	// Add more rules based on Task properties: createdDate, completedDate, recurrence, context, time estimates etc.
}

// Define and export ViewConfig interface
export interface ViewConfig {
	id: ViewMode;
	name: string;
	icon: string;
	type: "default" | "custom";
	visible: boolean; // Show in sidebar
	hideCompletedAndAbandonedTasks: boolean; // Per-view setting
	filterBlanks: boolean; // Per-view setting
	filterRules?: ViewFilterRule; // ADDED: Optional filter rules for ALL views
	sortCriteria?: SortCriterion[]; // ADDED: Optional sort criteria for ALL views
	specificConfig?: SpecificViewConfig; // ADDED: Optional property for view-specific settings
}

// ADDED: Specific config interfaces
export interface KanbanSpecificConfig {
	viewType: "kanban"; // Discriminator
	showCheckbox: boolean;
	hideEmptyColumns: boolean;
	defaultSortField:
		| "priority"
		| "dueDate"
		| "scheduledDate"
		| "startDate"
		| "createdDate";
	defaultSortOrder: "asc" | "desc";
	// New properties for flexible column grouping
	groupBy:
		| "status"
		| "priority"
		| "tags"
		| "project"
		| "dueDate"
		| "scheduledDate"
		| "startDate"
		| "context"
		| "filePath";
	customColumns?: KanbanColumnConfig[]; // Custom column definitions when not using status
}

export interface KanbanColumnConfig {
	id: string;
	title: string;
	value: string | number | null; // The value that tasks should have for this property to appear in this column
	color?: string; // Optional color for the column
	order: number; // Display order
}

export interface CalendarSpecificConfig {
	viewType: "calendar"; // Discriminator
	firstDayOfWeek?: number; // 0=Sun, 1=Mon, ..., 6=Sat; undefined=locale default
}

export interface GanttSpecificConfig {
	viewType: "gantt"; // Discriminator
	showTaskLabels: boolean;
	useMarkdownRenderer: boolean;
}

export interface ForecastSpecificConfig {
	viewType: "forecast"; // Discriminator
	firstDayOfWeek?: number; // 0=Sun, 1=Mon, ..., 6=Sat; undefined=locale default
}

export interface TwoColumnSpecificConfig {
	viewType: "twocolumn"; // Discriminator
	taskPropertyKey: string; // Task property to use as the left column grouping (e.g., "tags", "project", "priority", "context")
	leftColumnTitle: string; // Title for the left column
	rightColumnDefaultTitle: string; // Default title for the right column
	multiSelectText: string; // Text to show when multiple items are selected
	emptyStateText: string; // Text to show when no items are selected
}

export interface TableSpecificConfig {
	viewType: "table"; // Discriminator
	enableTreeView: boolean; // Enable hierarchical tree view
	enableLazyLoading: boolean; // Enable lazy loading for large datasets
	pageSize: number; // Number of rows to load per batch
	enableInlineEditing: boolean; // Enable inline editing of task properties
	visibleColumns: string[]; // Array of column IDs to display
	columnWidths: Record<string, number>; // Column width settings
	sortableColumns: boolean; // Enable column sorting
	resizableColumns: boolean; // Enable column resizing
	showRowNumbers: boolean; // Show row numbers
	enableRowSelection: boolean; // Enable row selection
	enableMultiSelect: boolean; // Enable multiple row selection
	defaultSortField: string; // Default sort field
	defaultSortOrder: "asc" | "desc"; // Default sort order
}

// ADDED: Union type for specific configs
export type SpecificViewConfig =
	| KanbanSpecificConfig
	| CalendarSpecificConfig
	| GanttSpecificConfig
	| TwoColumnSpecificConfig
	| ForecastSpecificConfig
	| TableSpecificConfig;

/** Define the structure for task statuses */
export interface TaskStatusConfig extends Record<string, string> {
	completed: string;
	inProgress: string;
	abandoned: string;
	planned: string;
	notStarted: string;
}

/** Define the structure for task filter presets */
export interface PresetTaskFilter {
	id: string;
	name: string;
	options: {
		// TaskFilterOptions structure is embedded here
		includeCompleted: boolean;
		includeInProgress: boolean;
		includeAbandoned: boolean;
		includeNotStarted: boolean;
		includePlanned: boolean;
		includeParentTasks: boolean;
		includeChildTasks: boolean;
		includeSiblingTasks: boolean;
		advancedFilterQuery: string;
		filterMode: "INCLUDE" | "EXCLUDE";
	};
}

/** Define the structure for task filter settings */
export interface TaskFilterSettings {
	enableTaskFilter: boolean;
	presetTaskFilters: PresetTaskFilter[];
}

/** Define the structure for task status cycle settings */
export interface TaskStatusCycle {
	[key: string]: string;
}

/** Define the structure for completed task mover settings */
export interface CompletedTaskMoverSettings {
	enableCompletedTaskMover: boolean;
	taskMarkerType: "version" | "date" | "custom";
	versionMarker: string;
	dateMarker: string;
	customMarker: string;
	treatAbandonedAsCompleted: boolean;
	completeAllMovedTasks: boolean;
	withCurrentFileLink: boolean;
	// Settings for incomplete task mover
	enableIncompletedTaskMover: boolean;
	incompletedTaskMarkerType: "version" | "date" | "custom";
	incompletedVersionMarker: string;
	incompletedDateMarker: string;
	incompletedCustomMarker: string;
	withCurrentFileLinkForIncompleted: boolean;
}

/** Define the structure for quick capture settings */
export interface QuickCaptureSettings {
	enableQuickCapture: boolean;
	targetFile: string;
	placeholder: string;
	appendToFile: "append" | "prepend" | "replace";
}

/** Define the structure for task gutter settings */
export interface TaskGutterSettings {
	enableTaskGutter: boolean;
}

/** Define the structure for workflow stage */

// Interface for workflow definition
export interface WorkflowStage {
	id: string;
	name: string;
	type: "linear" | "cycle" | "terminal";
	next?: string | string[];
	subStages?: Array<{
		id: string;
		name: string;
		next?: string;
	}>;
	canProceedTo?: string[];
}

export interface WorkflowDefinition {
	id: string;
	name: string;
	description: string;
	stages: WorkflowStage[];
	metadata: {
		version: string;
		created: string;
		lastModified: string;
	};
}

/** Define the structure for workflow settings */
export interface WorkflowSettings {
	enableWorkflow: boolean;
	autoAddTimestamp: boolean;
	timestampFormat: string;
	removeTimestampOnTransition: boolean;
	calculateSpentTime: boolean;
	spentTimeFormat: string;
	calculateFullSpentTime: boolean;
	autoRemoveLastStageMarker: boolean;
	autoAddNextTask: boolean;
	definitions: WorkflowDefinition[]; // Uses the local WorkflowDefinition
}

export interface RewardItem {
	id: string; // Unique identifier for the reward item
	name: string; // The reward text
	occurrence: string; // Name of the occurrence level (e.g., "common", "rare")
	inventory: number; // Remaining count (-1 for unlimited)
	imageUrl?: string; // Optional image URL
	condition?: string; // Optional condition string for triggering (e.g., "#project AND #milestone")
}

export interface OccurrenceLevel {
	name: string;
	chance: number; // Probability percentage (e.g., 70 for 70%)
}

export interface RewardSettings {
	enableRewards: boolean;
	rewardItems: RewardItem[];
	occurrenceLevels: OccurrenceLevel[];
	showRewardType: "modal" | "notice"; // Type of reward display - modal (default) or notice
}

export interface HabitSettings {
	enableHabits: boolean;
	habits: BaseHabitData[]; // 存储基础习惯数据，不包含completions字段
}

/** Define the structure for auto date manager settings */
export interface AutoDateManagerSettings {
	enabled: boolean;
	manageCompletedDate: boolean;
	manageStartDate: boolean;
	manageCancelledDate: boolean;
	completedDateFormat: string;
	startDateFormat: string;
	cancelledDateFormat: string;
	completedDateMarker: string;
	startDateMarker: string;
	cancelledDateMarker: string;
}

// Define SortCriterion interface (if not already present)
export interface SortCriterion {
	field:
		| "status"
		| "priority"
		| "dueDate"
		| "startDate"
		| "scheduledDate"
		| "content"
		| "lineNumber"; // Fields to sort by
	order: "asc" | "desc"; // Sort order
}

/** Define the structure for beta test settings */
export interface BetaTestSettings {
	enableBaseView: boolean;
}

/** Define the main settings structure */
export interface TaskProgressBarSettings {
	// General Settings (Example)
	progressBarDisplayMode: "none" | "graphical" | "text" | "both";
	supportHoverToShowProgressInfo: boolean;
	addProgressBarToNonTaskBullet: boolean;
	addTaskProgressBarToHeading: boolean;
	enableProgressbarInReadingMode: boolean;
	countSubLevel: boolean;
	displayMode: string; // e.g., 'percentage', 'bracketPercentage', 'fraction', 'bracketFraction', 'detailed', 'custom', 'range-based'
	customFormat?: string;
	showPercentage: boolean;
	customizeProgressRanges: boolean;
	progressRanges: Array<{ min: number; max: number; text: string }>;
	allowCustomProgressGoal: boolean;
	hideProgressBarBasedOnConditions: boolean;
	hideProgressBarTags: string;
	hideProgressBarFolders: string;
	hideProgressBarMetadata: string;
	showProgressBarBasedOnHeading: string;

	// Task Status Settings
	autoCompleteParent: boolean;
	markParentInProgressWhenPartiallyComplete: boolean;
	taskStatuses: TaskStatusConfig;
	countOtherStatusesAs: string; // e.g., 'notStarted', 'abandoned', etc.
	excludeTaskMarks: string;
	useOnlyCountMarks: boolean;
	onlyCountTaskMarks: string;
	enableTaskStatusSwitcher: boolean;
	enableCustomTaskMarks: boolean;
	enableTextMarkInSourceMode: boolean;
	enableCycleCompleteStatus: boolean; // Enable cycling through task statuses when clicking on task checkboxes
	taskStatusCycle: string[];
	taskStatusMarks: TaskStatusCycle;
	excludeMarksFromCycle: string[];

	// Priority & Date Settings
	enablePriorityPicker: boolean;
	enablePriorityKeyboardShortcuts: boolean;
	enableDatePicker: boolean;
	dateMark: string;
	recurrenceDateBase: "due" | "scheduled" | "current"; // Base date for calculating next recurrence

	// Task Filter Settings
	taskFilter: TaskFilterSettings;

	// Completed Task Mover Settings
	completedTaskMover: CompletedTaskMoverSettings;

	// Task Gutter Settings
	taskGutter: TaskGutterSettings;

	// Quick Capture Settings
	quickCapture: QuickCaptureSettings;

	// Workflow Settings
	workflow: WorkflowSettings;

	// Index Related
	useDailyNotePathAsDate: boolean;
	dailyNoteFormat: string;
	useAsDateType: "due" | "start" | "scheduled";
	dailyNotePath: string;
	preferMetadataFormat: "dataview" | "tasks";

	// Date Settings
	useRelativeTimeForDate: boolean;

	// Ignore all tasks behind heading
	ignoreHeading: string;

	// Focus all tasks behind heading
	focusHeading: string;

	// View Settings (Updated Structure)
	enableView: boolean;
	viewConfiguration: ViewConfig[]; // Manages order, visibility, basic info, AND filter rules

	// Review Settings
	reviewSettings: Record<string, ProjectReviewSetting>;

	// Reward Settings (NEW)
	rewards: RewardSettings;

	// Habit Settings
	habit: HabitSettings;

	// Filter Configuration Settings
	filterConfig: FilterConfigSettings;

	// Sorting Settings
	sortTasks: boolean; // Enable/disable task sorting feature
	sortCriteria: SortCriterion[]; // Array defining the sorting order

	// Auto Date Manager Settings
	autoDateManager: AutoDateManagerSettings;

	// Beta Test Settings
	betaTest?: BetaTestSettings;
}

/** Define the default settings */
export const DEFAULT_SETTINGS: TaskProgressBarSettings = {
	// General Defaults
	progressBarDisplayMode: "both",
	supportHoverToShowProgressInfo: true,
	addProgressBarToNonTaskBullet: false,
	addTaskProgressBarToHeading: true,
	enableProgressbarInReadingMode: true,
	countSubLevel: true,
	displayMode: "bracketFraction",
	customFormat: "[{{COMPLETED}}/{{TOTAL}}]",
	showPercentage: false,
	customizeProgressRanges: false,
	progressRanges: [
		{ min: 0, max: 20, text: t("Just started") + " {{PROGRESS}}%" },
		{ min: 20, max: 40, text: t("Making progress") + " {{PROGRESS}}% " },
		{ min: 40, max: 60, text: t("Half way") + " {{PROGRESS}}% " },
		{ min: 60, max: 80, text: t("Good progress") + " {{PROGRESS}}% " },
		{ min: 80, max: 100, text: t("Almost there") + " {{PROGRESS}}% " },
	],
	allowCustomProgressGoal: false,
	hideProgressBarBasedOnConditions: false,
	hideProgressBarTags: "no-progress,hide-progress",
	hideProgressBarFolders: "",
	hideProgressBarMetadata: "hide-progress-bar",
	showProgressBarBasedOnHeading: "",

	// Task Status Defaults
	autoCompleteParent: false,
	markParentInProgressWhenPartiallyComplete: false,
	taskStatuses: {
		completed: "x|X",
		inProgress: ">|/",
		abandoned: "-",
		planned: "?",
		notStarted: " ",
	},
	countOtherStatusesAs: "notStarted",
	excludeTaskMarks: "",
	useOnlyCountMarks: false,
	onlyCountTaskMarks: "x|X|>|/", // Default example
	enableTaskStatusSwitcher: false,
	enableCustomTaskMarks: false,
	enableTextMarkInSourceMode: false,
	enableCycleCompleteStatus: false,
	taskStatusCycle: [
		"Not Started",
		"In Progress",
		"Completed",
		"Abandoned",
		"Planned",
	],
	taskStatusMarks: {
		"Not Started": " ",
		"In Progress": "/",
		Completed: "x",
		Abandoned: "-",
		Planned: "?",
	},
	excludeMarksFromCycle: [],

	// Priority & Date Defaults
	enablePriorityPicker: false,
	enablePriorityKeyboardShortcuts: false,
	enableDatePicker: false,
	dateMark: "📅",
	recurrenceDateBase: "due",

	// Task Filter Defaults
	taskFilter: {
		enableTaskFilter: true,
		presetTaskFilters: [], // Start empty, maybe add defaults later or via a reset button
	},

	// Task Gutter Defaults
	taskGutter: {
		enableTaskGutter: false,
	},

	// Completed Task Mover Defaults
	completedTaskMover: {
		enableCompletedTaskMover: true,
		taskMarkerType: "date",
		versionMarker: "version 1.0",
		dateMarker: t("archived on") + " {{date}}",
		customMarker: t("moved") + " {{DATE:YYYY-MM-DD HH:mm}}",
		treatAbandonedAsCompleted: false,
		completeAllMovedTasks: true,
		withCurrentFileLink: true,
		// Incomplete Task Mover Defaults
		enableIncompletedTaskMover: true,
		incompletedTaskMarkerType: "date",
		incompletedVersionMarker: "version 1.0",
		incompletedDateMarker: t("moved on") + " {{date}}",
		incompletedCustomMarker: t("moved") + " {{DATE:YYYY-MM-DD HH:mm}}",
		withCurrentFileLinkForIncompleted: true,
	},

	// Quick Capture Defaults
	quickCapture: {
		enableQuickCapture: true,
		targetFile: "QuickCapture.md",
		placeholder: t("Capture your thoughts..."),
		appendToFile: "append",
	},

	// Workflow Defaults
	workflow: {
		enableWorkflow: false,
		autoAddTimestamp: false,
		timestampFormat: "YYYY-MM-DD HH:mm:ss",
		removeTimestampOnTransition: false,
		calculateSpentTime: false,
		spentTimeFormat: "HH:mm:ss",
		calculateFullSpentTime: false,
		autoRemoveLastStageMarker: false,
		autoAddNextTask: false,
		definitions: [
			{
				id: "project_workflow",
				name: t("Project Workflow"),
				description: t("Standard project management workflow"),
				stages: [
					{
						id: "planning",
						name: t("Planning"),
						type: "linear",
						next: "in_progress",
					},
					{
						id: "in_progress",
						name: t("In Progress"),
						type: "cycle",
						subStages: [
							{
								id: "development",
								name: t("Development"),
								next: "testing",
							},
							{
								id: "testing",
								name: t("Testing"),
								next: "development",
							},
						],
						canProceedTo: ["review", "cancelled"],
					},
					{
						id: "review",
						name: t("Review"),
						type: "cycle",
						canProceedTo: ["in_progress", "completed"],
					},
					{
						id: "completed",
						name: t("Completed"),
						type: "terminal",
					},
					{
						id: "cancelled",
						name: t("Cancelled"),
						type: "terminal",
					},
				],
				metadata: {
					version: "1.0",
					created: "2024-03-20",
					lastModified: "2024-03-20",
				},
			},
		],
	},

	// Index Related Defaults
	useDailyNotePathAsDate: false,
	dailyNoteFormat: "yyyy-MM-dd",
	useAsDateType: "due",
	dailyNotePath: "",
	preferMetadataFormat: "tasks",

	// Date Settings
	useRelativeTimeForDate: false,

	// Ignore all tasks behind heading
	ignoreHeading: "",

	// Focus all tasks behind heading
	focusHeading: "",

	// View Defaults (Updated Structure)
	enableView: true,
	viewConfiguration: [
		{
			id: "inbox",
			name: t("Inbox"),
			icon: "inbox",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: true,
			filterRules: {},
			filterBlanks: false,
		},
		{
			id: "forecast",
			name: t("Forecast"),
			icon: "calendar-days",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: true,
			filterRules: {},
			filterBlanks: false,
		},
		{
			id: "projects",
			name: t("Projects"),
			icon: "folders",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: false,
			filterRules: {},
			filterBlanks: false,
		},
		{
			id: "tags",
			name: t("Tags"),
			icon: "tag",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: false,
			filterRules: {},
			filterBlanks: false,
		},
		{
			id: "flagged",
			name: t("Flagged"),
			icon: "flag",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: true,
			filterRules: {},
			filterBlanks: false,
		},
		{
			id: "review",
			name: t("Review"),
			icon: "eye",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: false,
			filterRules: {},
			filterBlanks: false,
		},
		{
			id: "calendar",
			name: t("Events"),
			icon: "calendar",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: false,
			filterRules: {},
			filterBlanks: false,
			specificConfig: {
				viewType: "calendar",
				firstDayOfWeek: undefined, // Use locale default initially
			} as CalendarSpecificConfig,
		},
		{
			id: "kanban",
			name: t("Status"),
			icon: "kanban",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: false,
			filterRules: {},
			filterBlanks: false,
			specificConfig: {
				viewType: "kanban",
				showCheckbox: true, // Example default, adjust if needed
				hideEmptyColumns: false,
				defaultSortField: "priority",
				defaultSortOrder: "desc",
				groupBy: "status", // Default to status-based columns
			} as KanbanSpecificConfig,
		},
		{
			id: "gantt",
			name: t("Plan"),
			icon: "chart-gantt",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: false,
			filterRules: {},
			filterBlanks: false,
			specificConfig: {
				viewType: "gantt",
				showTaskLabels: true,
				useMarkdownRenderer: true,
			} as GanttSpecificConfig,
		},
		{
			id: "habit",
			name: t("Habit"),
			icon: "calendar-clock",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: false,
			filterRules: {},
			filterBlanks: false,
		},
		{
			id: "table",
			name: t("Table"),
			icon: "table",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: false,
			filterRules: {},
			filterBlanks: false,
			specificConfig: {
				viewType: "table",
				enableTreeView: true,
				enableLazyLoading: true,
				pageSize: 50,
				enableInlineEditing: true,
				visibleColumns: [
					"status",
					"content",
					"priority",
					"dueDate",
					"tags",
					"project",
				],
				columnWidths: {
					status: 80,
					content: 300,
					priority: 100,
					dueDate: 120,
					tags: 150,
					project: 150,
				},
				sortableColumns: true,
				resizableColumns: true,
				showRowNumbers: true,
				enableRowSelection: true,
				enableMultiSelect: true,
				defaultSortField: "priority",
				defaultSortOrder: "asc",
			} as TableSpecificConfig,
		},
	],

	// Review Settings
	reviewSettings: {},

	// Reward Settings Defaults (NEW)
	rewards: {
		enableRewards: false,
		rewardItems: [
			{
				id: "reward-tea",
				name: t("Drink a cup of good tea"),
				occurrence: "common",
				inventory: -1,
			}, // -1 for infinite
			{
				id: "reward-series-episode",
				name: t("Watch an episode of a favorite series"),
				occurrence: "rare",
				inventory: 20,
			},
			{
				id: "reward-champagne-project",
				name: t("Play a game"),
				occurrence: "legendary",
				inventory: 1,
				condition: "#project AND #milestone",
			},
			{
				id: "reward-chocolate-quick",
				name: t("Eat a piece of chocolate"),
				occurrence: "common",
				inventory: 10,
				condition: "#quickwin",
				imageUrl: "",
			}, // Add imageUrl example if needed
		],
		occurrenceLevels: [
			{ name: t("common"), chance: 70 },
			{ name: t("rare"), chance: 25 },
			{ name: t("legendary"), chance: 5 },
		],
		showRewardType: "modal",
	},

	// Habit Settings
	habit: {
		enableHabits: false,
		habits: [],
	},

	// Filter Configuration Defaults
	filterConfig: {
		enableSavedFilters: true,
		savedConfigs: [],
	},

	// Sorting Defaults
	sortTasks: true, // Default to enabled
	sortCriteria: [
		// Default sorting criteria
		{ field: "status", order: "asc" },
		{ field: "priority", order: "asc" },
		{ field: "dueDate", order: "asc" },
	],

	// Auto Date Manager Defaults
	autoDateManager: {
		enabled: false,
		manageCompletedDate: true,
		manageStartDate: true,
		manageCancelledDate: true,
		completedDateFormat: "YYYY-MM-DD",
		startDateFormat: "YYYY-MM-DD",
		cancelledDateFormat: "YYYY-MM-DD",
		completedDateMarker: "✅",
		startDateMarker: "🚀",
		cancelledDateMarker: "❌",
	},

	// Beta Test Defaults
	betaTest: {
		enableBaseView: false,
	},
};

// Helper function to get view settings safely
export function getViewSettingOrDefault(
	plugin: TaskProgressBarPlugin,
	viewId: ViewMode
): ViewConfig {
	const viewConfiguration =
		plugin.settings.viewConfiguration || DEFAULT_SETTINGS.viewConfiguration;

	// First check if the view exists in user settings
	const savedConfig = viewConfiguration.find((v) => v.id === viewId);

	// Then check if it exists in default settings
	const defaultConfig = DEFAULT_SETTINGS.viewConfiguration.find(
		(v) => v.id === viewId
	);

	// If neither exists, create a fallback default for custom views
	// IMPORTANT: Fallback needs to determine if it *should* have specificConfig based on ID pattern or other logic if possible.
	// For simplicity now, fallback won't have specificConfig unless explicitly added later for new custom types.
	const fallbackConfig: ViewConfig = {
		// Explicitly type fallback
		id: viewId,
		name: viewId, // Consider using a better default name generation
		icon: "list-plus",
		type: "custom",
		visible: true,
		filterBlanks: false,
		hideCompletedAndAbandonedTasks: false,
		filterRules: {},
		// No specificConfig for generic custom views by default
	};

	// Use default config if it exists, otherwise use fallback
	const baseConfig = defaultConfig || fallbackConfig;

	// Merge saved config onto base config
	const mergedConfig: ViewConfig = {
		// Explicitly type merged
		...baseConfig,
		...(savedConfig || {}), // Spread saved config properties, overriding base
		// Explicitly handle merging filterRules
		filterRules: savedConfig?.filterRules
			? {
					...(baseConfig.filterRules || {}), // Start with base's filterRules
					...savedConfig.filterRules, // Override with saved filterRules properties
			  }
			: baseConfig.filterRules || {}, // If no saved filterRules, use base's
		// Merge specificConfig: Saved overrides default, default overrides base (which might be fallback without specificConfig)
		// Ensure that the spread of savedConfig doesn't overwrite specificConfig object entirely if base has one and saved doesn't.
		specificConfig:
			savedConfig?.specificConfig !== undefined
				? {
						// If saved has specificConfig, merge it onto base's
						...(baseConfig.specificConfig || {}),
						...savedConfig.specificConfig,
				  }
				: baseConfig.specificConfig, // Otherwise, just use base's specificConfig (could be undefined)
	};

	// Ensure essential properties exist even if defaults are weird
	mergedConfig.filterRules = mergedConfig.filterRules || {};

	// Remove duplicate gantt view if it exists in the default settings
	if (viewId === "gantt" && Array.isArray(viewConfiguration)) {
		const ganttViews = viewConfiguration.filter((v) => v.id === "gantt");
		if (ganttViews.length > 1) {
			// Keep only the first gantt view
			const indexesToRemove = viewConfiguration
				.map((v, index) => (v.id === "gantt" ? index : -1))
				.filter((index) => index !== -1)
				.slice(1);

			for (const index of indexesToRemove.reverse()) {
				viewConfiguration.splice(index, 1);
			}

			// Save the updated configuration
			plugin.saveSettings();
		}
	}

	return mergedConfig;
}

// Define saved filter configuration interface
export interface SavedFilterConfig {
	id: string;
	name: string;
	description?: string;
	filterState: RootFilterState;
	createdAt: string;
	updatedAt: string;
}

// Define filter configuration settings
export interface FilterConfigSettings {
	enableSavedFilters: boolean;
	savedConfigs: SavedFilterConfig[];
}
