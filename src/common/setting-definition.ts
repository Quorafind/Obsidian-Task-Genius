import { t } from "../translations/helper";
import type TaskProgressBarPlugin from "../index"; // Type-only import

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

// Define and export ViewFilterRule interface
export interface ViewFilterRule {
	// Simple example, expand as needed
	tagsInclude?: string[];
	tagsExclude?: string[];
	statusInclude?: string[];
	statusExclude?: string[];
	project?: string;
	priority?: number;
	dueDate?: string; // e.g., 'today', 'next-week', 'yyyy-mm-dd'
	startDate?: string;
	scheduledDate?: string;
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
	filterRules?: ViewFilterRule; // ADDED: Optional filter rules for ALL views
	specificConfig?: SpecificViewConfig; // ADDED: Optional property for view-specific settings
}

// ADDED: Specific config interfaces
export interface KanbanSpecificConfig {
	viewType: "kanban"; // Discriminator
	showCheckbox: boolean;
}

export interface CalendarSpecificConfig {
	viewType: "calendar"; // Discriminator
	firstDayOfWeek?: number; // 0=Sun, 1=Mon, ..., 6=Sat; undefined=locale default
}

// ADDED: Union type for specific configs
export type SpecificViewConfig = KanbanSpecificConfig | CalendarSpecificConfig;

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
}

/** Define the structure for quick capture settings */
export interface QuickCaptureSettings {
	enableQuickCapture: boolean;
	targetFile: string;
	placeholder: string;
	appendToFile: "append" | "prepend" | "replace";
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

/** Define the main settings structure */
export interface TaskProgressBarSettings {
	// General Settings (Example)
	progressBarDisplayMode: "none" | "graphical" | "text" | "both";
	supportHoverToShowProgressInfo: boolean;
	addProgressBarToNonTaskBullet: boolean;
	addTaskProgressBarToHeading: boolean;
	countSubLevel: boolean;
	displayMode: string; // e.g., 'percentage', 'bracketPercentage', 'fraction', 'bracketFraction', 'detailed', 'custom', 'range-based'
	customFormat?: string;
	showPercentage: boolean;
	customizeProgressRanges: boolean;
	progressRanges: Array<{ min: number; max: number; text: string }>;
	hideProgressBarBasedOnConditions: boolean;
	hideProgressBarTags: string;
	hideProgressBarFolders: string;
	hideProgressBarMetadata: string;

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
	enableCycleCompleteStatus: boolean;
	alwaysCycleNewTasks: boolean;
	taskStatusCycle: string[];
	taskStatusMarks: TaskStatusCycle;
	excludeMarksFromCycle: string[];

	// Priority & Date Settings
	enablePriorityPicker: boolean;
	enablePriorityKeyboardShortcuts: boolean;
	enableDatePicker: boolean;
	dateMark: string;

	// Task Filter Settings
	taskFilter: TaskFilterSettings;

	// Completed Task Mover Settings
	completedTaskMover: CompletedTaskMoverSettings;

	// Quick Capture Settings
	quickCapture: QuickCaptureSettings;

	// Workflow Settings
	workflow: WorkflowSettings;

	// View Settings (Updated Structure)
	enableView: boolean;
	preferMetadataFormat: "dataview" | "tasks";
	viewConfiguration: ViewConfig[]; // Manages order, visibility, basic info, AND filter rules

	// Review Settings
	reviewSettings: Record<string, ProjectReviewSetting>;
}

/** Define the default settings */
export const DEFAULT_SETTINGS: TaskProgressBarSettings = {
	// General Defaults
	progressBarDisplayMode: "both",
	supportHoverToShowProgressInfo: true,
	addProgressBarToNonTaskBullet: false,
	addTaskProgressBarToHeading: true,
	countSubLevel: true,
	displayMode: "bracketFraction",
	customFormat: "[{{COMPLETED}}/{{TOTAL}}]",
	showPercentage: false,
	customizeProgressRanges: false,
	progressRanges: [
		{ min: 0, max: 20, text: "Just started {{PROGRESS}}%" },
		{ min: 20, max: 40, text: "Making progress {{PROGRESS}}%" },
		{ min: 40, max: 60, text: "Half way {{PROGRESS}}%" },
		{ min: 60, max: 80, text: "Good progress {{PROGRESS}}%" },
		{ min: 80, max: 100, text: "Almost there {{PROGRESS}}%" },
	],
	hideProgressBarBasedOnConditions: false,
	hideProgressBarTags: "no-progress,hide-progress",
	hideProgressBarFolders: "",
	hideProgressBarMetadata: "hide-progress-bar",

	// Task Status Defaults
	autoCompleteParent: true,
	markParentInProgressWhenPartiallyComplete: true,
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
	enableTaskStatusSwitcher: true,
	enableCustomTaskMarks: true,
	enableTextMarkInSourceMode: true,
	enableCycleCompleteStatus: true,
	alwaysCycleNewTasks: false,
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
	enablePriorityPicker: true,
	enablePriorityKeyboardShortcuts: true,
	enableDatePicker: true,
	dateMark: "📅",

	// Task Filter Defaults
	taskFilter: {
		enableTaskFilter: true,
		presetTaskFilters: [], // Start empty, maybe add defaults later or via a reset button
	},

	// Completed Task Mover Defaults
	completedTaskMover: {
		enableCompletedTaskMover: true,
		taskMarkerType: "date",
		versionMarker: "version 1.0",
		dateMarker: "archived on {{DATE:YYYY-MM-DD}}",
		customMarker: "moved {{DATE:YYYY-MM-DD HH:mm}}",
		treatAbandonedAsCompleted: false,
		completeAllMovedTasks: true,
		withCurrentFileLink: true,
	},

	// Quick Capture Defaults
	quickCapture: {
		enableQuickCapture: true,
		targetFile: "QuickCapture.md",
		placeholder: "Capture your thoughts...",
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
				name: "Project Workflow",
				description: "Standard project management workflow",
				stages: [
					{
						id: "planning",
						name: "Planning",
						type: "linear",
						next: "in_progress",
					},
					{
						id: "in_progress",
						name: "In Progress",
						type: "cycle",
						subStages: [
							{
								id: "development",
								name: "Development",
								next: "testing",
							},
							{
								id: "testing",
								name: "Testing",
								next: "development",
							},
						],
						canProceedTo: ["review", "cancelled"],
					},
					{
						id: "review",
						name: "Review",
						type: "cycle",
						canProceedTo: ["in_progress", "completed"],
					},
					{
						id: "completed",
						name: "Completed",
						type: "terminal",
					},
					{
						id: "cancelled",
						name: "Cancelled",
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

	// View Defaults (Updated Structure)
	enableView: true,
	preferMetadataFormat: "tasks",
	viewConfiguration: [
		{
			id: "inbox",
			name: t("Inbox"),
			icon: "inbox",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: true,
			filterRules: {},
		},
		{
			id: "forecast",
			name: t("Forecast"),
			icon: "calendar-days",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: true,
			filterRules: {},
		},
		{
			id: "projects",
			name: t("Projects"),
			icon: "folders",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: false,
			filterRules: {},
		},
		{
			id: "tags",
			name: t("Tags"),
			icon: "tag",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: false,
			filterRules: {},
		},
		{
			id: "flagged",
			name: t("Flagged"),
			icon: "flag",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: true,
			filterRules: {},
		},
		{
			id: "review",
			name: t("Review"),
			icon: "eye",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: false,
			filterRules: {},
		},
		{
			id: "calendar",
			name: t("Calendar"),
			icon: "calendar",
			type: "default",
			visible: true,
			hideCompletedAndAbandonedTasks: false,
			filterRules: {},
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
			specificConfig: {
				viewType: "kanban",
				showCheckbox: true, // Example default, adjust if needed
			} as KanbanSpecificConfig,
		},
	],

	// Review Settings
	reviewSettings: {},
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
	// Optional: If specificConfig is expected for certain default types but missing after merge, could add fallback logic here.
	// For example:
	// if (mergedConfig.type === 'default' && (mergedConfig.id === 'kanban' || mergedConfig.id === 'calendar') && mergedConfig.specificConfig === undefined) {
	//   console.warn(`Specific config missing for default view ${mergedConfig.id}, attempting to use default.`);
	//   mergedConfig.specificConfig = DEFAULT_SETTINGS.viewConfiguration.find(v => v.id === mergedConfig.id)?.specificConfig;
	// }

	return mergedConfig;
}
