import { SettingSearchItem } from "../types/SettingsSearch";

/**
 * 静态设置项元数据
 * 包含所有设置项的基础信息，用于高性能搜索
 */
export const SETTINGS_METADATA: SettingSearchItem[] = [
	// Progress Display Tab
	{
		id: "progress-bar-main",
		tabId: "progress-bar",
		name: "Progress bar",
		description: "You can customize the progress bar behind the parent task(usually at the end of the task). You can also customize the progress bar for the task below the heading.",
		keywords: ["progress", "bar", "parent", "task", "customize"],
		translationKey: "Progress bar",
		descriptionKey: "You can customize the progress bar behind the parent task(usually at the end of the task). You can also customize the progress bar for the task below the heading.",
		category: "display"
	},
	{
		id: "progress-display-mode",
		tabId: "progress-bar",
		name: "Progress display mode",
		description: "Choose how to display task progress",
		keywords: ["progress", "display", "mode", "choose", "task"],
		translationKey: "Progress display mode",
		descriptionKey: "Choose how to display task progress",
		category: "display"
	},
	{
		id: "progress-reading-mode",
		tabId: "progress-bar",
		name: "Enable progress bar in reading mode",
		description: "Toggle this to allow this plugin to show progress bars in reading mode.",
		keywords: ["progress", "bar", "reading", "mode", "enable", "show"],
		translationKey: "Enable progress bar in reading mode",
		descriptionKey: "Toggle this to allow this plugin to show progress bars in reading mode.",
		category: "display"
	},
	{
		id: "progress-hover-info",
		tabId: "progress-bar",
		name: "Support hover to show progress info",
		description: "Toggle this to allow this plugin to show progress info when hovering over the progress bar.",
		keywords: ["hover", "progress", "info", "show", "support"],
		translationKey: "Support hover to show progress info",
		descriptionKey: "Toggle this to allow this plugin to show progress info when hovering over the progress bar.",
		category: "display"
	},
	{
		id: "progress-non-task-bullet",
		tabId: "progress-bar",
		name: "Add progress bar to non-task bullet",
		description: "Toggle this to allow adding progress bars to regular list items (non-task bullets).",
		keywords: ["progress", "bar", "non-task", "bullet", "list", "items"],
		translationKey: "Add progress bar to non-task bullet",
		descriptionKey: "Toggle this to allow adding progress bars to regular list items (non-task bullets).",
		category: "display"
	},
	{
		id: "progress-heading",
		tabId: "progress-bar",
		name: "Add progress bar to Heading",
		description: "Toggle this to allow this plugin to add progress bar for Task below the headings.",
		keywords: ["progress", "bar", "heading", "task", "below"],
		translationKey: "Add progress bar to Heading",
		descriptionKey: "Toggle this to allow this plugin to add progress bar for Task below the headings.",
		category: "display"
	},
	{
		id: "progress-sub-children",
		tabId: "progress-bar",
		name: "Count sub children of current Task",
		description: "Toggle this to allow this plugin to count sub tasks when generating progress bar.",
		keywords: ["count", "sub", "children", "task", "sub-tasks"],
		translationKey: "Count sub children of current Task",
		descriptionKey: "Toggle this to allow this plugin to count sub tasks when generating progress bar.",
		category: "display"
	},
	{
		id: "progress-custom-goal",
		tabId: "progress-bar",
		name: "Use custom goal for progress bar",
		description: "Toggle this to allow this plugin to find the pattern g::number as goal of the parent task.",
		keywords: ["custom", "goal", "progress", "bar", "pattern", "number"],
		translationKey: "Use custom goal for progress bar",
		descriptionKey: "Toggle this to allow this plugin to find the pattern g::number as goal of the parent task.",
		category: "display"
	},
	{
		id: "progress-format",
		tabId: "progress-bar",
		name: "Progress format",
		description: "Choose how to display the task progress",
		keywords: ["progress", "format", "display", "task"],
		translationKey: "Progress format",
		descriptionKey: "Choose how to display the task progress",
		category: "display"
	},
	{
		id: "hide-progress-bars",
		tabId: "progress-bar",
		name: "Hide progress bars",
		keywords: ["hide", "progress", "bars"],
		translationKey: "Hide progress bars",
		category: "display"
	},
	{
		id: "hide-progress-conditions",
		tabId: "progress-bar",
		name: "Hide progress bars based on conditions",
		description: "Toggle this to enable hiding progress bars based on tags, folders, or metadata.",
		keywords: ["hide", "progress", "bars", "conditions", "tags", "folders", "metadata"],
		translationKey: "Hide progress bars based on conditions",
		descriptionKey: "Toggle this to enable hiding progress bars based on tags, folders, or metadata.",
		category: "display"
	},

	// Checkbox Status Tab
	{
		id: "checkbox-status-settings",
		tabId: "task-status",
		name: "Checkbox Status Settings",
		description: "Configure checkbox status settings",
		keywords: ["checkbox", "status", "settings", "configure"],
		translationKey: "Checkbox Status Settings",
		descriptionKey: "Configure checkbox status settings",
		category: "display"
	},
	{
		id: "file-metadata-inheritance",
		tabId: "task-status",
		name: "File Metadata Inheritance",
		description: "Configure how tasks inherit metadata from file frontmatter",
		keywords: ["file", "metadata", "inheritance", "tasks", "frontmatter"],
		translationKey: "File Metadata Inheritance",
		descriptionKey: "Configure how tasks inherit metadata from file frontmatter",
		category: "display"
	},
	{
		id: "enable-metadata-inheritance",
		tabId: "task-status",
		name: "Enable file metadata inheritance",
		description: "Allow tasks to inherit metadata properties from their file's frontmatter",
		keywords: ["enable", "file", "metadata", "inheritance", "properties"],
		translationKey: "Enable file metadata inheritance",
		descriptionKey: "Allow tasks to inherit metadata properties from their file's frontmatter",
		category: "display"
	},
	{
		id: "auto-complete-parent",
		tabId: "task-status",
		name: "Auto complete parent checkbox",
		description: "Toggle this to allow this plugin to auto complete parent checkbox when all child tasks are completed.",
		keywords: ["auto", "complete", "parent", "checkbox", "child", "tasks"],
		translationKey: "Auto complete parent checkbox",
		descriptionKey: "Toggle this to allow this plugin to auto complete parent checkbox when all child tasks are completed.",
		category: "display"
	},
	{
		id: "parent-in-progress",
		tabId: "task-status",
		name: "Mark parent as 'In Progress' when partially complete",
		description: "When some but not all child tasks are completed, mark the parent checkbox as 'In Progress'. Only works when 'Auto complete parent' is enabled.",
		keywords: ["parent", "in progress", "partially", "complete", "child", "tasks"],
		translationKey: "Mark parent as 'In Progress' when partially complete",
		descriptionKey: "When some but not all child tasks are completed, mark the parent checkbox as 'In Progress'. Only works when 'Auto complete parent' is enabled.",
		category: "display"
	},
	{
		id: "completed-chars",
		tabId: "task-status",
		name: "Completed",
		description: "Characters in square brackets that represent completed tasks. Example: \"x|X\"",
		keywords: ["completed", "characters", "square", "brackets", "tasks"],
		translationKey: "Completed",
		descriptionKey: "Characters in square brackets that represent completed tasks. Example: \"x|X\"",
		category: "display"
	},
	{
		id: "planned-chars",
		tabId: "task-status",
		name: "Planned",
		description: "Characters in square brackets that represent planned tasks. Example: \"?\"",
		keywords: ["planned", "characters", "square", "brackets", "tasks"],
		translationKey: "Planned",
		descriptionKey: "Characters in square brackets that represent planned tasks. Example: \"?\"",
		category: "display"
	},
	{
		id: "in-progress-chars",
		tabId: "task-status",
		name: "In Progress",
		description: "Characters in square brackets that represent tasks in progress. Example: \">|/\"",
		keywords: ["in progress", "characters", "square", "brackets", "tasks"],
		translationKey: "In Progress",
		descriptionKey: "Characters in square brackets that represent tasks in progress. Example: \">|/\"",
		category: "display"
	},
	{
		id: "abandoned-chars",
		tabId: "task-status",
		name: "Abandoned",
		description: "Characters in square brackets that represent abandoned tasks. Example: \"-\"",
		keywords: ["abandoned", "characters", "square", "brackets", "tasks"],
		translationKey: "Abandoned",
		descriptionKey: "Characters in square brackets that represent abandoned tasks. Example: \"-\"",
		category: "display"
	},
	{
		id: "not-started-chars",
		tabId: "task-status",
		name: "Not Started",
		description: "Characters in square brackets that represent not started tasks. Default is space \" \"",
		keywords: ["not started", "characters", "square", "brackets", "tasks", "space"],
		translationKey: "Not Started",
		descriptionKey: "Characters in square brackets that represent not started tasks. Default is space \" \"",
		category: "display"
	},

	// Dates & Priority Tab
	{
		id: "priority-picker-settings",
		tabId: "date-priority",
		name: "Priority Picker Settings",
		description: "Toggle to enable priority picker dropdown for emoji and letter format priorities.",
		keywords: ["priority", "picker", "settings", "dropdown", "emoji", "letter"],
		translationKey: "Priority Picker Settings",
		descriptionKey: "Toggle to enable priority picker dropdown for emoji and letter format priorities.",
		category: "workflow"
	},
	{
		id: "enable-priority-picker",
		tabId: "date-priority",
		name: "Enable priority picker",
		description: "Toggle to enable priority picker dropdown for emoji and letter format priorities.",
		keywords: ["enable", "priority", "picker", "dropdown", "emoji", "letter"],
		translationKey: "Enable priority picker",
		descriptionKey: "Toggle to enable priority picker dropdown for emoji and letter format priorities.",
		category: "workflow"
	},
	{
		id: "enable-priority-shortcuts",
		tabId: "date-priority",
		name: "Enable priority keyboard shortcuts",
		description: "Toggle to enable keyboard shortcuts for setting task priorities.",
		keywords: ["enable", "priority", "keyboard", "shortcuts", "task"],
		translationKey: "Enable priority keyboard shortcuts",
		descriptionKey: "Toggle to enable keyboard shortcuts for setting task priorities.",
		category: "workflow"
	},
	{
		id: "date-picker",
		tabId: "date-priority",
		name: "Date picker",
		keywords: ["date", "picker"],
		translationKey: "Date picker",
		category: "workflow"
	},
	{
		id: "enable-date-picker",
		tabId: "date-priority",
		name: "Enable date picker",
		description: "Toggle this to enable date picker for tasks. This will add a calendar icon near your tasks which you can click to select a date.",
		keywords: ["enable", "date", "picker", "tasks", "calendar", "icon"],
		translationKey: "Enable date picker",
		descriptionKey: "Toggle this to enable date picker for tasks. This will add a calendar icon near your tasks which you can click to select a date.",
		category: "workflow"
	},
	{
		id: "recurrence-calculation",
		tabId: "date-priority",
		name: "Recurrence date calculation",
		description: "Choose how to calculate the next date for recurring tasks",
		keywords: ["recurrence", "date", "calculation", "recurring", "tasks"],
		translationKey: "Recurrence date calculation",
		descriptionKey: "Choose how to calculate the next date for recurring tasks",
		category: "workflow"
	},

	// Task Filter Tab
	{
		id: "task-filter",
		tabId: "task-filter",
		name: "Task Filter",
		keywords: ["task", "filter"],
		translationKey: "Task Filter",
		category: "management"
	},
	{
		id: "enable-task-filter",
		tabId: "task-filter",
		name: "Enable Task Filter",
		description: "Toggle this to enable the task filter panel",
		keywords: ["enable", "task", "filter", "panel"],
		translationKey: "Enable Task Filter",
		descriptionKey: "Toggle this to enable the task filter panel",
		category: "management"
	},
	{
		id: "preset-filters",
		tabId: "task-filter",
		name: "Preset Filters",
		description: "Create and manage preset filters for quick access to commonly used task filters.",
		keywords: ["preset", "filters", "create", "manage", "quick", "access"],
		translationKey: "Preset Filters",
		descriptionKey: "Create and manage preset filters for quick access to commonly used task filters.",
		category: "management"
	},

	// File Filter Tab
	{
		id: "file-filter",
		tabId: "file-filter",
		name: "File Filter",
		keywords: ["file", "filter"],
		translationKey: "File Filter",
		category: "core"
	},
	{
		id: "enable-file-filter",
		tabId: "file-filter",
		name: "Enable File Filter",
		description: "Toggle this to enable file and folder filtering during task indexing. This can significantly improve performance for large vaults.",
		keywords: ["enable", "file", "filter", "folder", "indexing", "performance"],
		translationKey: "Enable File Filter",
		descriptionKey: "Toggle this to enable file and folder filtering during task indexing. This can significantly improve performance for large vaults.",
		category: "core"
	},
	{
		id: "file-filter-mode",
		tabId: "file-filter",
		name: "File Filter Mode",
		description: "Choose whether to include only specified files/folders (whitelist) or exclude them (blacklist)",
		keywords: ["file", "filter", "mode", "whitelist", "blacklist", "include", "exclude"],
		translationKey: "File Filter Mode",
		descriptionKey: "Choose whether to include only specified files/folders (whitelist) or exclude them (blacklist)",
		category: "core"
	},
	{
		id: "file-filter-rules",
		tabId: "file-filter",
		name: "File Filter Rules",
		description: "Configure which files and folders to include or exclude from task indexing",
		keywords: ["file", "filter", "rules", "configure", "folders", "indexing"],
		translationKey: "File Filter Rules",
		descriptionKey: "Configure which files and folders to include or exclude from task indexing",
		category: "core"
	},

	// Task Handler Tab
	{
		id: "task-gutter",
		tabId: "task-handler",
		name: "Task Gutter",
		description: "Configure the task gutter.",
		keywords: ["task", "gutter", "configure"],
		translationKey: "Task Gutter",
		descriptionKey: "Configure the task gutter.",
		category: "management"
	},
	{
		id: "enable-task-gutter",
		tabId: "task-handler",
		name: "Enable task gutter",
		description: "Toggle this to enable the task gutter.",
		keywords: ["enable", "task", "gutter"],
		translationKey: "Enable task gutter",
		descriptionKey: "Toggle this to enable the task gutter.",
		category: "management"
	},
	{
		id: "completed-task-mover",
		tabId: "task-handler",
		name: "Completed Task Mover",
		keywords: ["completed", "task", "mover"],
		translationKey: "Completed Task Mover",
		category: "management"
	},
	{
		id: "enable-completed-mover",
		tabId: "task-handler",
		name: "Enable completed task mover",
		description: "Toggle this to enable commands for moving completed tasks to another file.",
		keywords: ["enable", "completed", "task", "mover", "commands", "moving"],
		translationKey: "Enable completed task mover",
		descriptionKey: "Toggle this to enable commands for moving completed tasks to another file.",
		category: "management"
	},
	{
		id: "task-sorting",
		tabId: "task-handler",
		name: "Task Sorting",
		description: "Configure how tasks are sorted in the document.",
		keywords: ["task", "sorting", "configure", "document"],
		translationKey: "Task Sorting",
		descriptionKey: "Configure how tasks are sorted in the document.",
		category: "management"
	},
	{
		id: "enable-task-sorting",
		tabId: "task-handler",
		name: "Enable Task Sorting",
		description: "Toggle this to enable commands for sorting tasks.",
		keywords: ["enable", "task", "sorting", "commands"],
		translationKey: "Enable Task Sorting",
		descriptionKey: "Toggle this to enable commands for sorting tasks.",
		category: "management"
	},

	// Workflows Tab
	{
		id: "workflow",
		tabId: "workflow",
		name: "Workflow",
		description: "Configure task workflows for project and process management",
		keywords: ["workflow", "configure", "task", "project", "process", "management"],
		translationKey: "Workflow",
		descriptionKey: "Configure task workflows for project and process management",
		category: "workflow"
	},
	{
		id: "enable-workflow",
		tabId: "workflow",
		name: "Enable workflow",
		description: "Toggle to enable the workflow system for tasks",
		keywords: ["enable", "workflow", "system", "tasks"],
		translationKey: "Enable workflow",
		descriptionKey: "Toggle to enable the workflow system for tasks",
		category: "workflow"
	},
	{
		id: "auto-add-timestamp",
		tabId: "workflow",
		name: "Auto-add timestamp",
		description: "Automatically add a timestamp to the task when it is created",
		keywords: ["auto", "add", "timestamp", "task", "created"],
		translationKey: "Auto-add timestamp",
		descriptionKey: "Automatically add a timestamp to the task when it is created",
		category: "workflow"
	},
	{
		id: "auto-remove-stage-marker",
		tabId: "workflow",
		name: "Auto remove last stage marker",
		description: "Automatically remove the last stage marker when a task is completed",
		keywords: ["auto", "remove", "stage", "marker", "task", "completed"],
		translationKey: "Auto remove last stage marker",
		descriptionKey: "Automatically remove the last stage marker when a task is completed",
		category: "workflow"
	},
	{
		id: "auto-add-next-task",
		tabId: "workflow",
		name: "Auto-add next task",
		description: "Automatically create a new task with the next stage when completing a task",
		keywords: ["auto", "add", "next", "task", "create", "stage", "completing"],
		translationKey: "Auto-add next task",
		descriptionKey: "Automatically create a new task with the next stage when completing a task",
		category: "workflow"
	},

	// Quick Capture Tab
	{
		id: "quick-capture",
		tabId: "quick-capture",
		name: "Quick capture",
		keywords: ["quick", "capture"],
		translationKey: "Quick capture",
		category: "workflow"
	},
	{
		id: "enable-quick-capture",
		tabId: "quick-capture",
		name: "Enable quick capture",
		description: "Toggle this to enable Org-mode style quick capture panel.",
		keywords: ["enable", "quick", "capture", "org-mode", "panel"],
		translationKey: "Enable quick capture",
		descriptionKey: "Toggle this to enable Org-mode style quick capture panel.",
		category: "workflow"
	},
	{
		id: "capture-target-type",
		tabId: "quick-capture",
		name: "Target type",
		description: "Choose whether to capture to a fixed file or daily note",
		keywords: ["target", "type", "capture", "fixed", "file", "daily", "note"],
		translationKey: "Target type",
		descriptionKey: "Choose whether to capture to a fixed file or daily note",
		category: "workflow"
	},
	{
		id: "capture-target-file",
		tabId: "quick-capture",
		name: "Target file",
		description: "The file where captured text will be saved. You can include a path, e.g., 'folder/Quick Capture.md'. Supports date templates like {{DATE:YYYY-MM-DD}} or {{date:YYYY-MM-DD-HHmm}}",
		keywords: ["target", "file", "captured", "text", "saved", "path", "templates"],
		translationKey: "Target file",
		descriptionKey: "The file where captured text will be saved. You can include a path, e.g., 'folder/Quick Capture.md'. Supports date templates like {{DATE:YYYY-MM-DD}} or {{date:YYYY-MM-DD-HHmm}}",
		category: "workflow"
	},
	{
		id: "minimal-mode",
		tabId: "quick-capture",
		name: "Minimal Mode",
		keywords: ["minimal", "mode"],
		translationKey: "Minimal Mode",
		category: "workflow"
	},
	{
		id: "enable-minimal-mode",
		tabId: "quick-capture",
		name: "Enable minimal mode",
		description: "Enable simplified single-line quick capture with inline suggestions",
		keywords: ["enable", "minimal", "mode", "simplified", "single-line", "suggestions"],
		translationKey: "Enable minimal mode",
		descriptionKey: "Enable simplified single-line quick capture with inline suggestions",
		category: "workflow"
	},

	// Time Parsing Tab
	{
		id: "time-parsing-settings",
		tabId: "time-parsing",
		name: "Time Parsing Settings",
		keywords: ["time", "parsing", "settings"],
		translationKey: "Time Parsing Settings",
		category: "workflow"
	},
	{
		id: "enable-time-parsing",
		tabId: "time-parsing",
		name: "Enable Time Parsing",
		description: "Automatically parse natural language time expressions in Quick Capture",
		keywords: ["enable", "time", "parsing", "natural", "language", "expressions", "quick", "capture"],
		translationKey: "Enable Time Parsing",
		descriptionKey: "Automatically parse natural language time expressions in Quick Capture",
		category: "workflow"
	},
	{
		id: "remove-time-expressions",
		tabId: "time-parsing",
		name: "Remove Original Time Expressions",
		description: "Remove parsed time expressions from the task text",
		keywords: ["remove", "original", "time", "expressions", "parsed", "task", "text"],
		translationKey: "Remove Original Time Expressions",
		descriptionKey: "Remove parsed time expressions from the task text",
		category: "workflow"
	},
	{
		id: "start-date-keywords",
		tabId: "time-parsing",
		name: "Start Date Keywords",
		description: "Keywords that indicate start dates (comma-separated)",
		keywords: ["start", "date", "keywords", "indicate", "comma-separated"],
		translationKey: "Start Date Keywords",
		descriptionKey: "Keywords that indicate start dates (comma-separated)",
		category: "workflow"
	},
	{
		id: "due-date-keywords",
		tabId: "time-parsing",
		name: "Due Date Keywords",
		description: "Keywords that indicate due dates (comma-separated)",
		keywords: ["due", "date", "keywords", "indicate", "comma-separated"],
		translationKey: "Due Date Keywords",
		descriptionKey: "Keywords that indicate due dates (comma-separated)",
		category: "workflow"
	},
	{
		id: "scheduled-date-keywords",
		tabId: "time-parsing",
		name: "Scheduled Date Keywords",
		description: "Keywords that indicate scheduled dates (comma-separated)",
		keywords: ["scheduled", "date", "keywords", "indicate", "comma-separated"],
		translationKey: "Scheduled Date Keywords",
		descriptionKey: "Keywords that indicate scheduled dates (comma-separated)",
		category: "workflow"
	},

	// Timeline Sidebar Tab
	{
		id: "timeline-sidebar",
		tabId: "timeline-sidebar",
		name: "Timeline Sidebar",
		keywords: ["timeline", "sidebar"],
		translationKey: "Timeline Sidebar",
		category: "workflow"
	},
	{
		id: "enable-timeline-sidebar",
		tabId: "timeline-sidebar",
		name: "Enable Timeline Sidebar",
		description: "Toggle this to enable the timeline sidebar view for quick access to your daily events and tasks.",
		keywords: ["enable", "timeline", "sidebar", "view", "quick", "access", "daily", "events", "tasks"],
		translationKey: "Enable Timeline Sidebar",
		descriptionKey: "Toggle this to enable the timeline sidebar view for quick access to your daily events and tasks.",
		category: "workflow"
	},
	{
		id: "timeline-auto-open",
		tabId: "timeline-sidebar",
		name: "Auto-open on startup",
		description: "Automatically open the timeline sidebar when Obsidian starts.",
		keywords: ["auto-open", "startup", "automatically", "timeline", "sidebar", "obsidian"],
		translationKey: "Auto-open on startup",
		descriptionKey: "Automatically open the timeline sidebar when Obsidian starts.",
		category: "workflow"
	},
	{
		id: "timeline-show-completed",
		tabId: "timeline-sidebar",
		name: "Show completed tasks",
		description: "Include completed tasks in the timeline view. When disabled, only incomplete tasks will be shown.",
		keywords: ["show", "completed", "tasks", "timeline", "view", "incomplete"],
		translationKey: "Show completed tasks",
		descriptionKey: "Include completed tasks in the timeline view. When disabled, only incomplete tasks will be shown.",
		category: "workflow"
	},

	// Projects Tab
	{
		id: "enhanced-project-config",
		tabId: "project",
		name: "Enhanced Project Configuration",
		description: "Configure advanced project detection and management features",
		keywords: ["enhanced", "project", "configuration", "advanced", "detection", "management"],
		translationKey: "Enhanced Project Configuration",
		descriptionKey: "Configure advanced project detection and management features",
		category: "management"
	},
	{
		id: "enable-enhanced-projects",
		tabId: "project",
		name: "Enable enhanced project features",
		description: "Enable path-based, metadata-based, and config file-based project detection",
		keywords: ["enable", "enhanced", "project", "features", "path-based", "metadata-based", "config"],
		translationKey: "Enable enhanced project features",
		descriptionKey: "Enable path-based, metadata-based, and config file-based project detection",
		category: "management"
	},
	{
		id: "path-based-projects",
		tabId: "project",
		name: "Path-based Project Mappings",
		description: "Configure project names based on file paths",
		keywords: ["path-based", "project", "mappings", "configure", "names", "file", "paths"],
		translationKey: "Path-based Project Mappings",
		descriptionKey: "Configure project names based on file paths",
		category: "management"
	},
	{
		id: "metadata-based-projects",
		tabId: "project",
		name: "Metadata-based Project Configuration",
		description: "Configure project detection from file frontmatter",
		keywords: ["metadata-based", "project", "configuration", "detection", "file", "frontmatter"],
		translationKey: "Metadata-based Project Configuration",
		descriptionKey: "Configure project detection from file frontmatter",
		category: "management"
	},

	// Views & Index Tab
	{
		id: "view-index-config",
		tabId: "view-settings",
		name: "View & Index Configuration",
		description: "Configure the Task Genius sidebar views, visibility, order, and create custom views.",
		keywords: ["view", "index", "configuration", "sidebar", "visibility", "order", "custom"],
		translationKey: "View & Index Configuration",
		descriptionKey: "Configure the Task Genius sidebar views, visibility, order, and create custom views.",
		category: "core"
	},
	{
		id: "enable-task-genius-view",
		tabId: "view-settings",
		name: "Enable task genius view",
		description: "Enable task genius view will also enable the task genius indexer, which will provide the task genius view results from whole vault.",
		keywords: ["enable", "task", "genius", "view", "indexer", "vault"],
		translationKey: "Enable task genius view",
		descriptionKey: "Enable task genius view will also enable the task genius indexer, which will provide the task genius view results from whole vault.",
		category: "core"
	},
	{
		id: "default-view-mode",
		tabId: "view-settings",
		name: "Default view mode",
		description: "Choose the default display mode for all views. This affects how tasks are displayed when you first open a view or create a new view.",
		keywords: ["default", "view", "mode", "display", "tasks", "open", "create"],
		translationKey: "Default view mode",
		descriptionKey: "Choose the default display mode for all views. This affects how tasks are displayed when you first open a view or create a new view.",
		category: "core"
	},
	{
		id: "prefer-metadata-format",
		tabId: "view-settings",
		name: "Prefer metadata format of task",
		description: "You can choose dataview format or tasks format, that will influence both index and save format.",
		keywords: ["prefer", "metadata", "format", "task", "dataview", "tasks", "index", "save"],
		translationKey: "Prefer metadata format of task",
		descriptionKey: "You can choose dataview format or tasks format, that will influence both index and save format.",
		category: "core"
	},

	// Rewards Tab
	{
		id: "rewards",
		tabId: "reward",
		name: "Rewards",
		description: "Configure rewards for completing tasks. Define items, their occurrence chances, and conditions.",
		keywords: ["rewards", "configure", "completing", "tasks", "items", "occurrence", "chances", "conditions"],
		translationKey: "Rewards",
		descriptionKey: "Configure rewards for completing tasks. Define items, their occurrence chances, and conditions.",
		category: "gamification"
	},
	{
		id: "enable-rewards",
		tabId: "reward",
		name: "Enable rewards",
		description: "Toggle to enable or disable the reward system.",
		keywords: ["enable", "rewards", "toggle", "disable", "reward", "system"],
		translationKey: "Enable rewards",
		descriptionKey: "Toggle to enable or disable the reward system.",
		category: "gamification"
	},
	{
		id: "reward-display-type",
		tabId: "reward",
		name: "Reward display type",
		description: "Choose how rewards are displayed when earned.",
		keywords: ["reward", "display", "type", "choose", "displayed", "earned"],
		translationKey: "Reward display type",
		descriptionKey: "Choose how rewards are displayed when earned.",
		category: "gamification"
	},
	{
		id: "occurrence-levels",
		tabId: "reward",
		name: "Occurrence levels",
		description: "Define different levels of reward rarity and their probability.",
		keywords: ["occurrence", "levels", "define", "different", "reward", "rarity", "probability"],
		translationKey: "Occurrence levels",
		descriptionKey: "Define different levels of reward rarity and their probability.",
		category: "gamification"
	},
	{
		id: "reward-items",
		tabId: "reward",
		name: "Reward items",
		description: "Manage the specific rewards that can be obtained.",
		keywords: ["reward", "items", "manage", "specific", "rewards", "obtained"],
		translationKey: "Reward items",
		descriptionKey: "Manage the specific rewards that can be obtained.",
		category: "gamification"
	},

	// Habits Tab
	{
		id: "habit",
		tabId: "habit",
		name: "Habit",
		description: "Configure habit settings, including adding new habits, editing existing habits, and managing habit completion.",
		keywords: ["habit", "configure", "settings", "adding", "editing", "managing", "completion"],
		translationKey: "Habit",
		descriptionKey: "Configure habit settings, including adding new habits, editing existing habits, and managing habit completion.",
		category: "gamification"
	},
	{
		id: "enable-habits",
		tabId: "habit",
		name: "Enable habits",
		keywords: ["enable", "habits"],
		translationKey: "Enable habits",
		category: "gamification"
	},

	// Calendar Sync Tab
	{
		id: "ics-calendar-integration",
		tabId: "ics-integration",
		name: "ICS Calendar Integration",
		keywords: ["ics", "calendar", "integration"],
		translationKey: "ICS Calendar Integration",
		category: "integration"
	},
	{
		id: "enable-background-refresh",
		tabId: "ics-integration",
		name: "Enable Background Refresh",
		description: "Automatically refresh calendar sources in the background",
		keywords: ["enable", "background", "refresh", "automatically", "calendar", "sources"],
		translationKey: "Enable Background Refresh",
		descriptionKey: "Automatically refresh calendar sources in the background",
		category: "integration"
	},
	{
		id: "global-refresh-interval",
		tabId: "ics-integration",
		name: "Global Refresh Interval",
		description: "Default refresh interval for all sources (minutes)",
		keywords: ["global", "refresh", "interval", "default", "sources", "minutes"],
		translationKey: "Global Refresh Interval",
		descriptionKey: "Default refresh interval for all sources (minutes)",
		category: "integration"
	},
	{
		id: "maximum-cache-age",
		tabId: "ics-integration",
		name: "Maximum Cache Age",
		description: "How long to keep cached data (hours)",
		keywords: ["maximum", "cache", "age", "keep", "cached", "data", "hours"],
		translationKey: "Maximum Cache Age",
		descriptionKey: "How long to keep cached data (hours)",
		category: "integration"
	},

	// Beta Features Tab
	{
		id: "beta-test-features",
		tabId: "beta-test",
		name: "Beta Test Features",
		description: "Experimental features that are currently in testing phase. These features may be unstable and could change or be removed in future updates.",
		keywords: ["beta", "test", "features", "experimental", "testing", "phase", "unstable"],
		translationKey: "Beta Test Features",
		descriptionKey: "Experimental features that are currently in testing phase. These features may be unstable and could change or be removed in future updates.",
		category: "advanced"
	},
	{
		id: "base-view",
		tabId: "beta-test",
		name: "Base View",
		description: "Advanced view management features that extend the default Task Genius views with additional functionality.",
		keywords: ["base", "view", "advanced", "management", "features", "extend", "default", "functionality"],
		translationKey: "Base View",
		descriptionKey: "Advanced view management features that extend the default Task Genius views with additional functionality.",
		category: "advanced"
	},
	{
		id: "enable-base-view",
		tabId: "beta-test",
		name: "Enable Base View",
		description: "Enable experimental Base View functionality. This feature provides enhanced view management capabilities but may be affected by future Obsidian API changes. You may need to restart Obsidian to see the changes.",
		keywords: ["enable", "base", "view", "experimental", "functionality", "enhanced", "management", "capabilities"],
		translationKey: "Enable Base View",
		descriptionKey: "Enable experimental Base View functionality. This feature provides enhanced view management capabilities but may be affected by future Obsidian API changes. You may need to restart Obsidian to see the changes.",
		category: "advanced"
	},

	// About Tab
	{
		id: "about-task-genius",
		tabId: "about",
		name: "About Task Genius",
		keywords: ["about", "task", "genius"],
		translationKey: "About",
		category: "info"
	},
	{
		id: "version",
		tabId: "about",
		name: "Version",
		keywords: ["version"],
		translationKey: "Version",
		category: "info"
	},
	{
		id: "donate",
		tabId: "about",
		name: "Donate",
		description: "If you like this plugin, consider donating to support continued development:",
		keywords: ["donate", "plugin", "support", "development"],
		translationKey: "Donate",
		descriptionKey: "If you like this plugin, consider donating to support continued development:",
		category: "info"
	},
	{
		id: "documentation",
		tabId: "about",
		name: "Documentation",
		description: "View the documentation for this plugin",
		keywords: ["documentation", "view", "plugin"],
		translationKey: "Documentation",
		descriptionKey: "View the documentation for this plugin",
		category: "info"
	},
	{
		id: "onboarding",
		tabId: "about",
		name: "Onboarding",
		description: "Restart the welcome guide and setup wizard",
		keywords: ["onboarding", "restart", "welcome", "guide", "setup", "wizard"],
		translationKey: "Onboarding",
		descriptionKey: "Restart the welcome guide and setup wizard",
		category: "info"
	}
];