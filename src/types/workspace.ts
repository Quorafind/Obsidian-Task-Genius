export interface WorkspaceData {
	id: string;
	name: string;
	color?: string;
	icon?: string; // Optional custom icon for the workspace
	updatedAt: number;
	order?: number;
	settings: WorkspaceOverrides; // Empty for Default workspace
}

export interface WorkspaceOverrides {
	// View display settings
	filters?: any;
	sort?: any;
	group?: any;
	columns?: any;
	viewMode?: string;

	// Calendar settings
	calendar?: any;

	// Kanban settings
	kanban?: any;

	// Gantt settings
	gantt?: any;

	// Other display-related settings
	displayOptions?: any;
	viewConfiguration?: any;
	taskListDisplayOption?: any;
	forecastOption?: any;
	customProjectGroupsAndNames?: any;
	tagCustomOrder?: any;

	// V2 filter state per view
	fluentFilterState?: Record<string, {
		filters?: any;
		searchQuery?: string;
		selectedProject?: string | null;
		advancedFilter?: any;
		viewMode?: string;
	}>;

	// Hidden modules configuration
	hiddenModules?: HiddenModulesConfig;
}

/** Hidden modules configuration for workspace */
export interface HiddenModulesConfig {
	/** Hidden view IDs (affects sidebar display and view access) */
	views?: string[];

	/** Hidden sidebar components */
	sidebarComponents?: SidebarComponentType[];

	/** Hidden feature components */
	features?: FeatureComponentType[];
}

/** Sidebar component types that can be hidden */
export type SidebarComponentType =
	| 'projects-list'
	| 'tags-list'
	| 'view-switcher'
	| 'top-views'
	| 'bottom-views';

/** Feature component types that can be hidden */
export type FeatureComponentType =
	| 'details-panel'
	| 'quick-capture'
	| 'filter'
	| 'progress-bar'
	| 'task-mark';

/** Module definition for UI display */
export interface ModuleDefinition {
	id: string;
	name: string;
	icon: string;
	type: 'view' | 'sidebar' | 'feature';
}

export interface WorkspacesConfig {
	version: number;
	defaultWorkspaceId: string;
	activeWorkspaceId?: string;
	order: string[]; // Workspace IDs in display order
	byId: Record<string, WorkspaceData>;
}

export interface EffectiveSettings {
	// Merged result of global + workspace overrides
	[key: string]: any;
}

// Keys that can be overridden per workspace
export const WORKSPACE_SCOPED_KEYS = [
	'filters',
	'sort',
	'group',
	'columns',
	'viewMode',
	'calendar',
	'kanban',
	'gantt',
	'displayOptions',
	'viewConfiguration',
	'taskListDisplayOption',
	'forecastOption',
	'customProjectGroupsAndNames',
	'tagCustomOrder',
	'fluentFilterState'
] as const;

export type WorkspaceScopedKey = typeof WORKSPACE_SCOPED_KEYS[number];

// Global-only keys (cannot be overridden)
export const GLOBAL_ONLY_KEYS = [
	'autoRun',
	'lang',
	'experimental',
	'appearance',
	'hotkeys',
	'quickCapture',
	'workflow',
	'habit',
	'reward',
	'integrations',
	'editorExtensions'
] as const;

export type GlobalOnlyKey = typeof GLOBAL_ONLY_KEYS[number];
