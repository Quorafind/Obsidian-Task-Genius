import {
	BasesEntry,
	BasesPropertyId,
	BasesView,
	BasesViewConfig,
	BooleanValue,
	DateValue,
	debounce,
	ListValue,
	MarkdownEditView,
	MarkdownView,
	Menu,
	NumberValue,
	QueryController,
	StringValue,
	ViewOption,
} from "obsidian";
import { Task } from "@/types/task";
import { ContentComponent } from "@/components/features/task/view/content";
import { ForecastComponent } from "@/components/features/task/view/forecast";
import { TagsComponent } from "@/components/features/task/view/tags";
import { ProjectsComponent } from "@/components/features/task/view/projects";
import { ReviewComponent } from "@/components/features/task/view/review";
import {
	CalendarComponent,
	CalendarEvent,
} from "@/components/features/calendar";
import { KanbanComponent } from "@/components/features/kanban/kanban";
import { GanttComponent } from "@/components/features/gantt/gantt";
import { QuadrantComponent } from "@/components/features/quadrant/quadrant";
import { TaskPropertyTwoColumnView } from "@/components/features/task/view/TaskPropertyTwoColumnView";
import { ViewComponentManager } from "@/components/ui";
import { Habit as HabitsComponent } from "@/components/features/habit/habit";
import {
	createTaskCheckbox,
	TaskDetailsComponent,
} from "@/components/features/task/view/details";
import { QuickCaptureModal } from "@/components/features/quick-capture/modals/QuickCaptureModal";
import { t } from "@/translations/helper";
import {
	getViewSettingOrDefault,
	KanbanColumnConfig,
	TwoColumnSpecificConfig,
	ViewMode,
} from "@/common/setting-definition";
import { filterTasks } from "@/utils/task/task-filter-utils";
import TaskProgressBarPlugin from "../../index";
import { RootFilterState } from "@/components/features/task/filter/ViewTaskFilter";
import { DEFAULT_FILE_TASK_MAPPING } from "@/managers/file-task-manager";
import { TaskSelectionManager } from "@/components/features/task/selection/TaskSelectionManager";

export const TaskBasesViewType = "task-genius";

/**
 * Adapter class that bridges Task Genius views with Bases plugin API
 * Enables all Task Genius views to be used as Bases views
 */
type ViewComponentInstance = {
	containerEl: HTMLElement;
	setTasks?: (...args: any[]) => void;
	updateTasks?: (...args: any[]) => void;
	setViewMode?: (viewMode: ViewMode, project?: string | null) => void;
	// Some view components expose extra methods; keep them optional and duck-typed
	refreshReviewSettings?: () => void;
};

export class TaskBasesView extends BasesView {
	type = TaskBasesViewType;
	scrollEl: HTMLElement;
	containerEl: HTMLElement;
	rootContainerEl: HTMLElement;

	// Component references
	private detailsComponent: TaskDetailsComponent;
	private viewComponentManager: ViewComponentManager;
	private selectionManager: TaskSelectionManager;
	private twoColumnViewComponents: Map<string, TaskPropertyTwoColumnView> =
		new Map();

	// State management
	private currentViewId: ViewMode = "inbox";
	private forcedViewMode: ViewMode | null = null;
	private activeComponent: {
		key: string;
		instance: ViewComponentInstance;
	} | null = null;
	private currentProject?: string | null;
	private currentSelectedTaskId: string | null = null;
	private isDetailsVisible = false;
	private detailsToggleBtn: HTMLElement;
	private currentFilterState: RootFilterState | null = null;
	private liveFilterState: RootFilterState | null = null;

	// Data
	private tasks: Task[] = [];

	// Property mappings for Bases integration
	private taskContentProp: BasesPropertyId | null = null;
	private taskStatusProp: BasesPropertyId | null = null;
	private taskPriorityProp: BasesPropertyId | null = null;
	private taskProjectProp: BasesPropertyId | null = null;
	private taskTagsProp: BasesPropertyId | null = null;
	private taskDueDateProp: BasesPropertyId | null = null;
	private taskStartDateProp: BasesPropertyId | null = null;
	private taskCompletedDateProp: BasesPropertyId | null = null;
	private taskContextProp: BasesPropertyId | null = null;

	// View-specific configurations loaded from Bases config
	private viewConfig: {
		kanban?: {
			groupBy: string;
			customColumns?: KanbanColumnConfig[];
			hideEmptyColumns: boolean;
			defaultSortField: string;
			defaultSortOrder: "asc" | "desc";
		};
		calendar?: {
			firstDayOfWeek?: number;
			hideWeekends?: boolean;
		};
		gantt?: {
			showTaskLabels: boolean;
			useMarkdownRenderer: boolean;
		};
		forecast?: {
			firstDayOfWeek?: number;
			hideWeekends?: boolean;
		};
		quadrant?: {
			urgentTag: string;
			importantTag: string;
			urgentThresholdDays: number;
			usePriorityForClassification: boolean;
			urgentPriorityThreshold?: number;
			importantPriorityThreshold?: number;
		};
	} = {};

	constructor(
		controller: QueryController,
		scrollEl: HTMLElement,
		private plugin: TaskProgressBarPlugin,
		initialViewMode?: ViewMode,
	) {
		super(controller);
		if (initialViewMode) {
			this.currentViewId = initialViewMode;
		}
		this.scrollEl = scrollEl;
		this.containerEl = scrollEl.createDiv({
			cls: "task-genius-bases-container task-genius-view",
			attr: { tabIndex: 0 },
		});
		this.rootContainerEl = this.containerEl.createDiv({
			cls: "task-genius-container no-sidebar",
		});

		// Initialize components
		this.initializeComponents();
	}

	/**
	 * Lock the view to a specific mode (used by specialized Bases integrations)
	 */
	public setForcedViewMode(viewMode: ViewMode) {
		this.forcedViewMode = viewMode;
		this.currentViewId = viewMode;
	}

	onload(): void {
		// Note: Don't load config here - Bases config object is not ready yet.
		// Config will be loaded in onDataUpdated() when Bases calls it with data.

		// Register event listeners
		this.registerEvent(
			this.app.workspace.on(
				"task-genius:task-cache-updated",
				debounce(async () => {
					await this.loadTasks();
				}, 150),
			),
		);

		this.registerEvent(
			this.app.workspace.on(
				"task-genius:filter-changed",
				(filterState: RootFilterState, leafId?: string) => {
					// Handle filter changes for this view
					if (
						leafId === this.containerEl.getAttribute("data-leaf-id")
					) {
						this.liveFilterState = filterState;
						this.currentFilterState = filterState;
						this.applyCurrentFilter();
					}
				},
			),
		);

		// ESC key to exit selection mode
		this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
			if (
				evt.key === "Escape" &&
				this.selectionManager?.isSelectionMode
			) {
				evt.preventDefault();
				this.selectionManager.exitSelectionMode("user_action");
			}
		});
	}

	onunload(): void {
		// Exit selection mode
		if (this.selectionManager?.isSelectionMode) {
			this.selectionManager.exitSelectionMode("view_change");
		}

		// Cleanup active component
		if (this.activeComponent?.instance) {
			const instance = this.activeComponent.instance;
			if (instance.containerEl) {
				instance.containerEl.remove();
			}
			if (typeof (instance as any).unload === "function") {
				this.removeChild(instance as any);
			}
		}

		// Cleanup two-column components
		this.twoColumnViewComponents.forEach((component) => {
			this.removeChild(component);
		});
		this.twoColumnViewComponents.clear();

		if (this.rootContainerEl) {
			this.rootContainerEl.empty();
			this.rootContainerEl.detach();
		}
	}

	/**
	 * Called when Bases data or configuration is updated
	 *
	 * This method is triggered by Bases plugin when:
	 * 1. The underlying data changes
	 * 2. View configuration is modified by user
	 *
	 * It reloads configuration from view config and refreshes the view
	 */
	public onDataUpdated(): void {
		// Reload all configurations from Bases view config
		// This includes property mappings and view-specific settings
		this.loadConfig();

		if (this.data) {
			// Convert Bases entries to tasks
			this.tasks = this.convertBasesEntriesToTasks(this.data.data);

			// Force refresh the current view with new configuration and tasks
			// The forceRefresh=true ensures components rerender even if data hasn't changed
			this.switchView(this.currentViewId, this.currentProject, true);
		}
	}

	/**
	 * Safely retrieve the Bases config. Returns null if it's not wired up yet.
	 */
	private getBasesConfig(): BasesViewConfig | null {
		const config = this.config;
		if (!config) {
			return null;
		}
		return config;
	}

	/**
	 * Load all configurations from Bases view config
	 */
	private loadConfig(): void {
		const config = this.getBasesConfig();
		if (!config) {
			return;
		}

		console.log(config, "based config");

		// Ensure forced view mode stays in sync with the saved config
		this.applyForcedViewModeConfig(config);

		// Load property mappings
		this.loadPropertyMappings(config);

		// Load view mode
		const viewMode = config.get("viewMode");
		if (this.forcedViewMode) {
			this.currentViewId = this.forcedViewMode;
		} else if (viewMode && typeof viewMode === "string") {
			this.currentViewId = viewMode as ViewMode;
		}

		// Load view-specific configurations
		this.loadViewSpecificConfig(config);
	}

	/**
	 * Load property mappings from Bases configuration
	 * Uses DEFAULT_FILE_TASK_MAPPING as the source for default values
	 */
	private loadPropertyMappings(config: BasesViewConfig): void {
		// Map from our Bases config keys to DEFAULT_FILE_TASK_MAPPING properties
		// For Bases integration, we need to use 'note.xxx' format for properties
		// unless it's a special property like file.basename
		const defaults = {
			taskContent: "file.basename", // Special case: use file name as content by default
			taskStatus: `note.${DEFAULT_FILE_TASK_MAPPING.statusProperty}`,
			taskPriority: `note.${DEFAULT_FILE_TASK_MAPPING.priorityProperty}`,
			taskProject: `note.${DEFAULT_FILE_TASK_MAPPING.projectProperty}`,
			taskTags: `note.${DEFAULT_FILE_TASK_MAPPING.tagsProperty}`,
			taskDueDate: `note.${DEFAULT_FILE_TASK_MAPPING.dueDateProperty}`,
			taskStartDate: `note.${DEFAULT_FILE_TASK_MAPPING.startDateProperty}`,
			taskCompletedDate: `note.${DEFAULT_FILE_TASK_MAPPING.completedDateProperty}`,
			taskContext: `note.${DEFAULT_FILE_TASK_MAPPING.contextProperty}`,
		};

		// Apply defaults if not already configured
		// This ensures property mappings work even when user hasn't explicitly set them
		for (const [key, defaultValue] of Object.entries(defaults)) {
			const currentValue = config.get(key);
			if (
				currentValue === undefined ||
				currentValue === null ||
				currentValue === ""
			) {
				config.set(key, defaultValue);
			}
		}

		// Now load property mappings - these should always have values due to defaults above
		this.taskContentProp = config.getAsPropertyId("taskContent");
		this.taskStatusProp = config.getAsPropertyId("taskStatus");
		this.taskPriorityProp = config.getAsPropertyId("taskPriority");
		this.taskProjectProp = config.getAsPropertyId("taskProject");
		this.taskTagsProp = config.getAsPropertyId("taskTags");
		this.taskDueDateProp = config.getAsPropertyId("taskDueDate");
		this.taskStartDateProp = config.getAsPropertyId("taskStartDate");
		this.taskCompletedDateProp =
			config.getAsPropertyId("taskCompletedDate");
		this.taskContextProp = config.getAsPropertyId("taskContext");
	}

	/**
	 * Load view-specific configurations
	 */
	private loadViewSpecificConfig(config: BasesViewConfig): void {
		// Load Kanban config
		this.viewConfig.kanban = {
			groupBy: this.getStringConfig(config, "tg_groupBy", "status"),
			customColumns: this.getCustomColumnsConfig(config, "customColumns"),
			hideEmptyColumns: this.getBooleanConfig(
				config,
				"hideEmptyColumns",
				false,
			),
			defaultSortField: this.getStringConfig(
				config,
				"defaultSortField",
				"priority",
			),
			defaultSortOrder: this.getStringConfig(
				config,
				"defaultSortOrder",
				"desc",
			) as "asc" | "desc",
		};

		// Load Calendar config
		this.viewConfig.calendar = {
			firstDayOfWeek: this.getNumericConfig(config, "firstDayOfWeek"),
			hideWeekends: this.getBooleanConfig(config, "hideWeekends", false),
		};

		// Load Gantt config
		this.viewConfig.gantt = {
			showTaskLabels: this.getBooleanConfig(
				config,
				"showTaskLabels",
				true,
			),
			useMarkdownRenderer: this.getBooleanConfig(
				config,
				"useMarkdownRenderer",
				false,
			),
		};

		// Load Forecast config
		this.viewConfig.forecast = {
			firstDayOfWeek: this.getNumericConfig(config, "firstDayOfWeek"),
			hideWeekends: this.getBooleanConfig(config, "hideWeekends", false),
		};

		// Load Quadrant config
		this.viewConfig.quadrant = {
			urgentTag: this.getStringConfig(config, "urgentTag", "#urgent"),
			importantTag: this.getStringConfig(
				config,
				"importantTag",
				"#important",
			),
			urgentThresholdDays:
				this.getNumericConfig(config, "urgentThresholdDays", 3) || 3,
			usePriorityForClassification: this.getBooleanConfig(
				config,
				"usePriorityForClassification",
				false,
			),
			urgentPriorityThreshold: this.getNumericConfig(
				config,
				"urgentPriorityThreshold",
			),
			importantPriorityThreshold: this.getNumericConfig(
				config,
				"importantPriorityThreshold",
			),
		};
	}

	/**
	 * Ensure forced view mode is reflected in the persisted config
	 * before other configuration logic runs.
	 */
	private applyForcedViewModeConfig(config?: BasesViewConfig): void {
		if (!this.forcedViewMode) {
			return;
		}

		const basesConfig = config ?? this.getBasesConfig();
		if (
			!basesConfig ||
			typeof basesConfig.get !== "function" ||
			typeof basesConfig.set !== "function"
		) {
			return;
		}

		const currentValue = basesConfig.get("viewMode");
		if (currentValue !== this.forcedViewMode) {
			basesConfig.set("viewMode", this.forcedViewMode);
		}
	}

	/**
	 * Helper method to get numeric config value
	 */
	private getNumericConfig(
		config: BasesViewConfig,
		key: string,
		defaultValue?: number,
	): number | undefined {
		const value = config.get(key);
		if (
			value !== undefined &&
			value !== null &&
			typeof value === "number"
		) {
			return value;
		}
		return defaultValue;
	}

	/**
	 * Helper method to get string config value
	 */
	private getStringConfig(
		config: BasesViewConfig,
		key: string,
		defaultValue: string,
	): string {
		const value = config.get(key);
		if (
			value !== undefined &&
			value !== null &&
			typeof value === "string" &&
			value.length > 0
		) {
			return value;
		}
		return defaultValue;
	}

	/**
	 * Helper method to get boolean config value
	 */
	private getBooleanConfig(
		config: BasesViewConfig,
		key: string,
		defaultValue: boolean,
	): boolean {
		const value = config.get(key);
		if (
			value !== undefined &&
			value !== null &&
			typeof value === "boolean"
		) {
			return value;
		}
		return defaultValue;
	}

	/**
	 * Helper method to get custom columns config
	 */
	private getCustomColumnsConfig(
		config: BasesViewConfig,
		key: string,
	): KanbanColumnConfig[] | undefined {
		const value = config.get(key);
		if (value && Array.isArray(value)) {
			return value as KanbanColumnConfig[];
		}
		return undefined;
	}

	/**
	 * Helper: string config with fallback key
	 */
	private getStringConfigWithFallback(
		config: BasesViewConfig,
		primaryKey: string,
		fallbackKey: string,
		defaultValue: string,
	): string {
		const primary = config.get(primaryKey);
		if (typeof primary === "string" && primary.length > 0) return primary;
		const fallback = config.get(fallbackKey);
		if (typeof fallback === "string" && fallback.length > 0)
			return fallback;
		return defaultValue;
	}

	/**
	 * Helper: boolean config with fallback key
	 */
	private getBooleanConfigWithFallback(
		config: BasesViewConfig,
		primaryKey: string,
		fallbackKey: string,
		defaultValue: boolean,
	): boolean {
		const primary = config.get(primaryKey);
		if (typeof primary === "boolean") return primary;
		const fallback = config.get(fallbackKey);
		if (typeof fallback === "boolean") return fallback;
		return defaultValue;
	}

	/**
	 * Helper: custom columns config with fallback key
	 */
	private getCustomColumnsConfigWithFallback(
		config: BasesViewConfig,
		primaryKey: string,
		fallbackKey: string,
	): KanbanColumnConfig[] | undefined {
		const primary = config.get(primaryKey);
		if (primary && Array.isArray(primary))
			return primary as KanbanColumnConfig[];
		const fallback = config.get(fallbackKey);
		if (fallback && Array.isArray(fallback))
			return fallback as KanbanColumnConfig[];
		return undefined;
	}

	/**
	 * Convert Bases entries to Task format
	 */
	private convertBasesEntriesToTasks(entries: BasesEntry[]): Task[] {
		return entries.map((entry, index) =>
			this.convertEntryToTask(entry, index),
		);
	}

	/**
	 * Convert a single Bases entry to Task format
	 */
	private convertEntryToTask(entry: BasesEntry, index: number): Task {
		// Extract raw status value from Bases entry
		const rawStatusValue =
			this.extractStringValue(entry, this.taskStatusProp) || " ";

		// Map the status value using status mapping configuration
		const statusSymbol = this.mapStatusToSymbol(rawStatusValue);

		// Determine if task is completed based on mapped symbol
		const isCompleted = this.isCompletedStatus(statusSymbol);

		return {
			id: `bases-${entry.file.path}-${index}`,
			content:
				this.extractStringValue(entry, this.taskContentProp) ||
				entry.file.basename,
			completed: isCompleted,
			status: statusSymbol,
			line: 0, // Bases entries don't have line numbers
			filePath: entry.file.path,
			originalMarkdown:
				this.extractStringValue(entry, this.taskContentProp) ||
				entry.file.basename, // Not applicable for Bases entries
			metadata: {
				priority: this.extractNumberValue(entry, this.taskPriorityProp),
				project: this.extractStringValue(entry, this.taskProjectProp),
				tags: this.extractArrayValue(entry, this.taskTagsProp),
				context: this.extractStringValue(entry, this.taskContextProp),
				dueDate: this.extractDateValue(entry, this.taskDueDateProp),
				startDate: this.extractDateValue(entry, this.taskStartDateProp),
				completedDate: this.extractDateValue(
					entry,
					this.taskCompletedDateProp,
				),
				children: [], // Bases entries don't have child tasks
			},
		};
	}

	/**
	 * Map a status value (metadata text or symbol) to a task status symbol
	 * Uses the plugin's status mapping configuration
	 */
	private mapStatusToSymbol(statusValue: string): string {
		const statusMapping = this.plugin.settings.fileSource?.statusMapping;

		// If status mapping is disabled or not configured, return as-is
		if (!statusMapping || !statusMapping.enabled) {
			return statusValue;
		}

		// Handle case sensitivity
		const lookupValue = statusMapping.caseSensitive
			? statusValue
			: statusValue.toLowerCase();

		// Check if it's already a recognized symbol
		if (statusValue in statusMapping.symbolToMetadata) {
			return statusValue;
		}

		// Try to map from metadata text to symbol
		for (const [key, symbol] of Object.entries(
			statusMapping.metadataToSymbol,
		)) {
			const compareKey = statusMapping.caseSensitive
				? key
				: key.toLowerCase();
			if (compareKey === lookupValue) {
				return symbol;
			}
		}

		// Return original value if no mapping found
		return statusValue;
	}

	/**
	 * Check if a status symbol represents a completed task
	 */
	private isCompletedStatus(statusSymbol: string): boolean {
		// Check against plugin's completed status marks
		const completedMarks = (
			this.plugin.settings.taskStatuses?.completed || "x"
		)
			.split("|")
			.map((m) => m.trim().toLowerCase());

		return completedMarks.includes(statusSymbol.toLowerCase());
	}

	/**
	 * Extract string value from Bases entry
	 */
	private extractStringValue(
		entry: BasesEntry,
		prop: BasesPropertyId | null,
	): string | undefined {
		if (!prop) return undefined;

		try {
			const value = entry.getValue(prop);
			if (value instanceof StringValue && value.isTruthy()) {
				const strValue = value.toString();
				return strValue;
			}
			if (value && value.isTruthy()) {
				const strValue = value.toString();
				return strValue;
			}
		} catch (error) {
			// Property not found or invalid
		}

		return undefined;
	}

	/**
	 * Extract boolean value from Bases entry
	 */
	private extractBooleanValue(
		entry: BasesEntry,
		prop: BasesPropertyId | null,
	): boolean {
		if (!prop) return false;

		try {
			const value = entry.getValue(prop);
			if (value instanceof BooleanValue) {
				return value.isTruthy();
			}
			if (value instanceof StringValue) {
				const str = value.toString().toLowerCase();
				return (
					str === "x" ||
					str === "true" ||
					str === "done" ||
					str === "completed"
				);
			}
		} catch (error) {
			// Property not found or invalid
		}

		return false;
	}

	/**
	 * Extract number value from Bases entry
	 */
	private extractNumberValue(
		entry: BasesEntry,
		prop: BasesPropertyId | null,
	): number | undefined {
		if (!prop) return undefined;

		try {
			const value = entry.getValue(prop);
			if (value instanceof NumberValue && value.isTruthy()) {
				const strValue = value.toString();
				return Number(strValue);
			}
			if (value instanceof StringValue && value.isTruthy()) {
				const strValue = value.toString();
				const num = parseInt(strValue);
				return isNaN(num) ? undefined : num;
			}
		} catch (error) {
			// Property not found or invalid
		}

		return undefined;
	}

	/**
	 * Extract date value from Bases entry
	 */
	private extractDateValue(
		entry: BasesEntry,
		prop: BasesPropertyId | null,
	): number | undefined {
		if (!prop) return undefined;

		try {
			const value = entry.getValue(prop);
			if (value instanceof DateValue && value.isTruthy()) {
				// DateValue has a date property that returns a Date object
				const dateObj = (value as any).date;
				if (dateObj instanceof Date) {
					return dateObj.getTime();
				}
			}
			if (value instanceof StringValue && value.isTruthy()) {
				const dateStr = value.toString();
				const date = new Date(dateStr);
				return isNaN(date.getTime()) ? undefined : date.getTime();
			}
		} catch (error) {
			// Property not found or invalid
		}

		return undefined;
	}

	/**
	 * Extract array value from Bases entry
	 */
	private extractArrayValue(
		entry: BasesEntry,
		prop: BasesPropertyId | null,
	): string[] {
		if (!prop) return [];

		try {
			const value = entry.getValue(prop);
			if (value instanceof ListValue && value.isTruthy()) {
				const result: string[] = [];
				for (let i = 0; i < value.length(); i++) {
					const item = value.get(i);
					if (item) {
						const strValue = item.toString();
						result.push(strValue);
					}
				}
				return result;
			}
			if (value instanceof StringValue && value.isTruthy()) {
				const strValue = value.toString();
				// Parse comma-separated values
				return strValue
					.split(",")
					.map((s) => s.trim())
					.filter((s) => s.length > 0);
			}
		} catch (error) {
			// Property not found or invalid
		}

		return [];
	}

	/**
	 * Initialize essential shared components (details panel and view manager)
	 * View-specific components are lazy loaded on demand
	 */
	private initializeComponents() {
		// Initialize TaskSelectionManager
		this.selectionManager = new TaskSelectionManager(this.app, this.plugin);
		this.addChild(this.selectionManager);

		// Details component - shared across all views
		this.detailsComponent = new TaskDetailsComponent(
			this.rootContainerEl,
			this.app,
			this.plugin,
		);
		this.addChild(this.detailsComponent);
		this.detailsComponent.load();

		// View component manager for special views
		this.viewComponentManager = new ViewComponentManager(
			this,
			this.app,
			this.plugin,
			this.rootContainerEl,
			{
				onTaskSelected: this.handleTaskSelection.bind(this),
				onTaskCompleted: this.toggleTaskCompletion.bind(this),
				onTaskContextMenu: this.handleTaskContextMenu.bind(this),
				onTaskStatusUpdate:
					this.handleKanbanTaskStatusUpdate.bind(this),
				onEventContextMenu: this.handleTaskContextMenu.bind(this),
			},
		);
		this.addChild(this.viewComponentManager);

		this.setupComponentEvents();
	}

	/**
	 * Setup event handlers for components
	 */
	private setupComponentEvents() {
		this.detailsComponent.onTaskToggleComplete = (task: Task) =>
			this.toggleTaskCompletion(task);

		this.detailsComponent.onTaskEdit = (task: Task) => this.editTask(task);
		this.detailsComponent.onTaskUpdate = async (
			originalTask: Task,
			updatedTask: Task,
		) => {
			await this.updateTask(originalTask, updatedTask);
		};
		this.detailsComponent.toggleDetailsVisibility = (visible: boolean) => {
			this.toggleDetailsVisibility(visible);
		};
	}

	/**
	 * Show the requested component and hide the previously active one.
	 */
	private activateComponent(
		key: string,
		component: ViewComponentInstance,
	): void {
		if (!component || !component.containerEl) {
			return;
		}

		if (
			this.activeComponent &&
			this.activeComponent.instance !== component
		) {
			const previous = this.activeComponent.instance;
			if (previous?.containerEl) {
				previous.containerEl.hide();
			}
		}

		component.containerEl.show();
		this.activeComponent = { key, instance: component };
	}

	/**
	 * Switch between different view modes
	 */
	private switchView(
		viewId: ViewMode,
		project?: string | null,
		forceRefresh = false,
	) {
		if (this.forcedViewMode) {
			viewId = this.forcedViewMode;
		}

		this.currentViewId = viewId;
		this.currentProject = project;

		let targetComponent: ViewComponentInstance | null = null;
		let componentKey = viewId;
		let modeForComponent: ViewMode = viewId;

		// Get view configuration
		const viewConfig = getViewSettingOrDefault(this.plugin, viewId);
		const specificViewType = viewConfig.specificConfig?.viewType;

		// Handle TwoColumn views
		if (specificViewType === "twocolumn") {
			if (!this.twoColumnViewComponents.has(viewId)) {
				const twoColumnConfig =
					viewConfig.specificConfig as TwoColumnSpecificConfig;
				const twoColumnComponent = new TaskPropertyTwoColumnView(
					this.rootContainerEl,
					this.app,
					this.plugin,
					twoColumnConfig,
					viewId,
				);
				this.addChild(twoColumnComponent);

				// Set up event handlers
				twoColumnComponent.onTaskSelected = (task) => {
					this.handleTaskSelection(task);
				};
				twoColumnComponent.onTaskCompleted = (task) => {
					this.toggleTaskCompletion(task);
				};
				twoColumnComponent.onTaskContextMenu = (event, task) => {
					this.handleTaskContextMenu(event, task);
				};

				this.twoColumnViewComponents.set(viewId, twoColumnComponent);
				twoColumnComponent.containerEl.hide();
			}

			targetComponent = this.twoColumnViewComponents.get(viewId) ?? null;
			componentKey = `twocolumn:${viewId}`;
		} else if (this.viewComponentManager.isSpecialView(viewId)) {
			const specialComponent =
				this.viewComponentManager.getOrCreateComponent(viewId);
			if (specialComponent) {
				targetComponent = specialComponent as ViewComponentInstance;
				componentKey = `special:${viewId}`;

				// Inject Bases-derived per-view config override into the component (if supported)
				const compAny = specialComponent as any;
				if (typeof compAny.setConfigOverride === "function") {
					const ovr =
						viewId === "kanban"
							? this.viewConfig.kanban
							: viewId === "calendar"
								? this.viewConfig.calendar
								: viewId === "gantt"
									? this.viewConfig.gantt
									: viewId === "forecast"
										? this.viewConfig.forecast
										: viewId === "quadrant"
											? this.viewConfig.quadrant
											: null;
					compAny.setConfigOverride(ovr ?? null);
				}
			}
		} else {
			// Standard view types - create component on demand
			componentKey = viewId;
			modeForComponent = viewId;

			// Clean up previous component if it exists and is different
			if (this.activeComponent && this.activeComponent.key !== viewId) {
				const prevInstance = this.activeComponent.instance;
				if (prevInstance?.containerEl) {
					prevInstance.containerEl.remove();
				}
				// Unload previous component if it has unload method
				if (
					prevInstance &&
					typeof (prevInstance as any).unload === "function"
				) {
					this.removeChild(prevInstance as any);
				}
			}

			// Create new component based on viewId
			switch (viewId) {
				case "inbox":
				case "flagged":
					const contentComp = new ContentComponent(
						this.rootContainerEl,
						this.plugin.app,
						this.plugin,
						{
							onTaskSelected: (task: Task | null) =>
								this.handleTaskSelection(task),
							onTaskCompleted: (task: Task) =>
								this.toggleTaskCompletion(task),
							onTaskContextMenu: (
								event: MouseEvent,
								task: Task,
							) => this.handleTaskContextMenu(event, task),
							selectionManager: this.selectionManager,
						},
					);
					this.addChild(contentComp);
					contentComp.load();
					targetComponent = contentComp;
					break;

				case "forecast":
					const forecastComp = new ForecastComponent(
						this.rootContainerEl,
						this.plugin.app,
						this.plugin,
						{
							onTaskSelected: (task: Task | null) =>
								this.handleTaskSelection(task),
							onTaskCompleted: (task: Task) =>
								this.toggleTaskCompletion(task),
							onTaskUpdate: async (
								originalTask: Task,
								updatedTask: Task,
							) =>
								await this.handleTaskUpdate(
									originalTask,
									updatedTask,
								),
							onTaskContextMenu: (
								event: MouseEvent,
								task: Task,
							) => this.handleTaskContextMenu(event, task),
						},
					);
					this.addChild(forecastComp);
					forecastComp.load();
					targetComponent = forecastComp;
					break;

				case "tags":
					const tagsComp = new TagsComponent(
						this.rootContainerEl,
						this.plugin.app,
						this.plugin,
						{
							onTaskSelected: (task: Task | null) =>
								this.handleTaskSelection(task),
							onTaskCompleted: (task: Task) =>
								this.toggleTaskCompletion(task),
							onTaskContextMenu: (
								event: MouseEvent,
								task: Task,
							) => this.handleTaskContextMenu(event, task),
						},
					);
					this.addChild(tagsComp);
					tagsComp.load();
					targetComponent = tagsComp;
					break;

				case "projects":
					const projectsComp = new ProjectsComponent(
						this.rootContainerEl,
						this.plugin.app,
						this.plugin,
						{
							onTaskSelected: (task: Task | null) =>
								this.handleTaskSelection(task),
							onTaskCompleted: (task: Task) =>
								this.toggleTaskCompletion(task),
							onTaskContextMenu: (
								event: MouseEvent,
								task: Task,
							) => this.handleTaskContextMenu(event, task),
						},
					);
					this.addChild(projectsComp);
					projectsComp.load();
					targetComponent = projectsComp;
					break;

				case "review":
					const reviewComp = new ReviewComponent(
						this.rootContainerEl,
						this.plugin.app,
						this.plugin,
						{
							onTaskSelected: (task: Task | null) =>
								this.handleTaskSelection(task),
							onTaskCompleted: (task: Task) =>
								this.toggleTaskCompletion(task),
							onTaskContextMenu: (
								event: MouseEvent,
								task: Task,
							) => this.handleTaskContextMenu(event, task),
						},
					);
					this.addChild(reviewComp);
					reviewComp.load();
					targetComponent = reviewComp;
					break;

				case "calendar":
					const calendarComp = new CalendarComponent(
						this.plugin.app,
						this.plugin,
						this.rootContainerEl,
						this.tasks,
						{
							onTaskSelected: (task: Task | null) =>
								this.handleTaskSelection(task),
							onTaskCompleted: (task: Task) =>
								this.toggleTaskCompletion(task),
							onEventContextMenu: (
								ev: MouseEvent,
								event: CalendarEvent,
							) => this.handleTaskContextMenu(ev, event),
						},
					);
					this.addChild(calendarComp);
					calendarComp.load();
					targetComponent = calendarComp;
					break;

				case "kanban":
					const kanbanComp = new KanbanComponent(
						this.app,
						this.plugin,
						this.rootContainerEl,
						this.tasks,
						{
							onTaskStatusUpdate:
								this.handleKanbanTaskStatusUpdate.bind(this),
							onTaskSelected: this.handleTaskSelection.bind(this),
							onTaskCompleted:
								this.toggleTaskCompletion.bind(this),
							onTaskContextMenu:
								this.handleTaskContextMenu.bind(this),
						},
					);
					this.addChild(kanbanComp);
					// Ensure component lifecycle runs
					kanbanComp.load();
					targetComponent = kanbanComp;
					break;

				case "gantt":
					const ganttComp = new GanttComponent(
						this.plugin,
						this.rootContainerEl,
						{
							onTaskSelected: this.handleTaskSelection.bind(this),
							onTaskCompleted:
								this.toggleTaskCompletion.bind(this),
							onTaskContextMenu:
								this.handleTaskContextMenu.bind(this),
						},
					);
					this.addChild(ganttComp);
					targetComponent = ganttComp;
					break;

				case "quadrant":
					const quadrantComp = new QuadrantComponent(
						this.app,
						this.plugin,
						this.rootContainerEl,
						this.tasks,
						{
							onTaskStatusUpdate:
								this.handleKanbanTaskStatusUpdate.bind(this),
							onTaskSelected: this.handleTaskSelection.bind(this),
							onTaskCompleted:
								this.toggleTaskCompletion.bind(this),
							onTaskContextMenu:
								this.handleTaskContextMenu.bind(this),
							onTaskUpdated: async (task: Task) => {
								await this.updateTask(task, task);
							},
						},
					);
					this.addChild(quadrantComp);
					quadrantComp.load();
					targetComponent = quadrantComp;
					break;

				case "habit":
					const habitsComp = new HabitsComponent(
						this.plugin,
						this.rootContainerEl,
					);
					this.addChild(habitsComp);
					targetComponent = habitsComp;
					break;

				default:
					targetComponent = null;
					break;
			}
		}

		if (!targetComponent) {
			this.handleTaskSelection(null);
			return;
		}

		this.activateComponent(componentKey, targetComponent);

		// Update component with filtered tasks
		if (typeof targetComponent.setTasks === "function") {
			const filterOptions: {
				advancedFilter?: RootFilterState;
				textQuery?: string;
			} = {};

			if (
				this.currentFilterState &&
				this.currentFilterState.filterGroups &&
				this.currentFilterState.filterGroups.length > 0
			) {
				filterOptions.advancedFilter = this.currentFilterState;
			}

			let filteredTasks = filterTasks(
				this.tasks,
				viewId,
				this.plugin,
				filterOptions,
			);

			// Filter out badge tasks for forecast view
			if (viewId === "forecast") {
				filteredTasks = filteredTasks.filter(
					(task) => !(task as any).badge,
				);
			}

			targetComponent.setTasks(filteredTasks, this.tasks, forceRefresh);
		}

		// Handle updateTasks method for table view adapter
		if (typeof targetComponent.updateTasks === "function") {
			const filterOptions: {
				advancedFilter?: RootFilterState;
				textQuery?: string;
			} = {};

			if (
				this.currentFilterState &&
				this.currentFilterState.filterGroups &&
				this.currentFilterState.filterGroups.length > 0
			) {
				filterOptions.advancedFilter = this.currentFilterState;
			}

			targetComponent.updateTasks(
				filterTasks(this.tasks, viewId, this.plugin, filterOptions),
			);
		}

		if (typeof targetComponent.setViewMode === "function") {
			targetComponent.setViewMode(modeForComponent, project);
		}

		// Update TwoColumn views
		this.twoColumnViewComponents.forEach((component) => {
			if (
				component &&
				typeof component.setTasks === "function" &&
				component.getViewId() === viewId
			) {
				const filterOptions: {
					advancedFilter?: RootFilterState;
					textQuery?: string;
				} = {};

				if (
					this.currentFilterState &&
					this.currentFilterState.filterGroups &&
					this.currentFilterState.filterGroups.length > 0
				) {
					filterOptions.advancedFilter = this.currentFilterState;
				}

				let filteredTasks = filterTasks(
					this.tasks,
					component.getViewId(),
					this.plugin,
					filterOptions,
				);

				if (component.getViewId() === "forecast") {
					filteredTasks = filteredTasks.filter(
						(task) => !(task as any).badge,
					);
				}

				component.setTasks(filteredTasks);
			}
		});

		if (
			viewId === "review" &&
			typeof targetComponent.refreshReviewSettings === "function"
		) {
			targetComponent.refreshReviewSettings();
		}

		this.handleTaskSelection(null);
	}

	/**
	 * Toggle details panel visibility
	 */
	private toggleDetailsVisibility(visible: boolean) {
		this.isDetailsVisible = visible;
		this.rootContainerEl.toggleClass("details-visible", visible);
		this.rootContainerEl.toggleClass("details-hidden", !visible);

		this.detailsComponent.setVisible(visible);
		if (this.detailsToggleBtn) {
			this.detailsToggleBtn.toggleClass("is-active", visible);
			this.detailsToggleBtn.setAttribute(
				"aria-label",
				visible ? t("Hide Details") : t("Show Details"),
			);
		}

		if (!visible) {
			this.currentSelectedTaskId = null;
		}
	}

	/**
	 * Handle task selection
	 */
	private handleTaskSelection(task: Task | null) {
		if (task) {
			if (this.currentSelectedTaskId !== task.id) {
				this.currentSelectedTaskId = task.id;
				this.detailsComponent.showTaskDetails(task);
				if (!this.isDetailsVisible) {
					this.toggleDetailsVisibility(true);
				}
			} else {
				// Toggle details visibility on re-click
				this.toggleDetailsVisibility(!this.isDetailsVisible);
			}
		} else {
			this.toggleDetailsVisibility(false);
			this.currentSelectedTaskId = null;
		}
	}

	/**
	 * Handle task context menu
	 */
	private handleTaskContextMenu(event: MouseEvent, task: Task) {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle(t("Complete"));
			item.setIcon("check-square");
			item.onClick(() => {
				this.toggleTaskCompletion(task);
			});
		})
			.addItem((item) => {
				item.setIcon("square-pen");
				item.setTitle(t("Switch status"));
				const submenu = item.setSubmenu();

				// Get unique statuses from taskStatusMarks
				const statusMarks = this.plugin.settings.taskStatusMarks;
				const uniqueStatuses = new Map<string, string>();

				for (const status of Object.keys(statusMarks)) {
					const mark =
						statusMarks[status as keyof typeof statusMarks];
					if (!Array.from(uniqueStatuses.values()).includes(mark)) {
						uniqueStatuses.set(status, mark);
					}
				}

				for (const [status, mark] of uniqueStatuses) {
					submenu.addItem((item) => {
						item.titleEl.createEl(
							"span",
							{
								cls: "status-option-checkbox",
							},
							(el) => {
								createTaskCheckbox(mark, task, el);
							},
						);
						item.titleEl.createEl("span", {
							cls: "status-option",
							text: status,
						});
						item.onClick(() => {
							if (!task.completed && mark.toLowerCase() === "x") {
								task.metadata.completedDate = Date.now();
							} else {
								task.metadata.completedDate = undefined;
							}
							this.updateTask(task, {
								...task,
								status: mark,
								completed: mark.toLowerCase() === "x",
							});
						});
					});
				}
			})
			.addSeparator()
			.addItem((item) => {
				item.setTitle(t("Edit"));
				item.setIcon("pencil");
				item.onClick(() => {
					this.handleTaskSelection(task);
				});
			})
			.addItem((item) => {
				item.setTitle(t("Edit in File"));
				item.setIcon("file-edit");
				item.onClick(() => {
					this.editTask(task);
				});
			});

		menu.showAtMouseEvent(event);
	}

	/**
	 * Toggle task completion status
	 */
	private async toggleTaskCompletion(task: Task) {
		const updatedTask = { ...task, completed: !task.completed };

		if (updatedTask.completed) {
			if (updatedTask.metadata) {
				updatedTask.metadata.completedDate = Date.now();
			}
			const completedMark = (
				this.plugin.settings.taskStatuses.completed || "x"
			).split("|")[0];
			if (updatedTask.status !== completedMark) {
				updatedTask.status = completedMark;
			}
		} else {
			if (updatedTask.metadata) {
				updatedTask.metadata.completedDate = undefined;
			}
			const notStartedMark =
				this.plugin.settings.taskStatuses.notStarted || " ";
			if (updatedTask.status.toLowerCase() === "x") {
				updatedTask.status = notStartedMark;
			}
		}

		// Update through plugin API if available
		if (this.plugin.writeAPI) {
			const result = await this.plugin.writeAPI.updateTask({
				taskId: updatedTask.id,
				updates: updatedTask,
			});
			if (!result.success) {
				throw new Error(result.error || "Failed to update task");
			}
		}

		// Update local state
		const index = this.tasks.findIndex((t) => t.id === task.id);
		if (index !== -1) {
			this.tasks[index] = updatedTask;
			this.switchView(this.currentViewId, this.currentProject, true);
		}
	}

	/**
	 * Handle task update
	 */
	private async handleTaskUpdate(originalTask: Task, updatedTask: Task) {
		await this.updateTask(originalTask, updatedTask);
	}

	/**
	 * Update task
	 */
	private async updateTask(
		originalTask: Task,
		updatedTask: Task,
	): Promise<Task> {
		// Update through plugin API if available
		if (this.plugin.writeAPI) {
			const result = await this.plugin.writeAPI.updateTask({
				taskId: originalTask.id,
				updates: updatedTask,
			});
			if (!result.success) {
				throw new Error(result.error || "Failed to update task");
			}
			if (result.task) {
				updatedTask = result.task;
			}
		}

		// Update local state
		const index = this.tasks.findIndex((t) => t.id === originalTask.id);
		if (index !== -1) {
			this.tasks[index] = updatedTask;
			this.switchView(this.currentViewId, this.currentProject, true);
		}

		if (this.currentSelectedTaskId === updatedTask.id) {
			if (this.detailsComponent.isCurrentlyEditing()) {
				this.detailsComponent.currentTask = updatedTask;
			} else {
				this.detailsComponent.showTaskDetails(updatedTask);
			}
		}

		return updatedTask;
	}

	/**
	 * Edit task in source file
	 */
	private async editTask(task: Task) {
		const file = this.app.vault.getFileByPath(task.filePath);
		if (!file) return;

		const existingLeaf = this.app.workspace
			.getLeavesOfType("markdown")
			.find((leaf) => (leaf.view as MarkdownView).file === file);

		const leafToUse = existingLeaf || this.app.workspace.getLeaf("tab");

		await leafToUse.openFile(file, {
			active: true,
			eState: {
				line: task.line,
			},
		});

		this.app.workspace.setActiveLeaf(leafToUse, { focus: true });
	}

	/**
	 * Handle Kanban task status update
	 */
	private handleKanbanTaskStatusUpdate = async (
		taskId: string,
		newStatusMark: string,
	) => {
		const taskToUpdate = this.tasks.find((t) => t.id === taskId);

		if (taskToUpdate) {
			const isCompleted =
				newStatusMark.toLowerCase() ===
				(this.plugin.settings.taskStatuses.completed || "x")
					.split("|")[0]
					.toLowerCase();
			const completedDate = isCompleted ? Date.now() : undefined;

			if (
				taskToUpdate.status !== newStatusMark ||
				taskToUpdate.completed !== isCompleted
			) {
				const updatedTaskData = {
					...taskToUpdate,
					status: newStatusMark,
					completed: isCompleted,
				};

				if (updatedTaskData.metadata) {
					updatedTaskData.metadata.completedDate = completedDate;
				}

				await this.updateTask(taskToUpdate, updatedTaskData);
			}
		}
	};

	/**
	 * Apply current filter
	 */
	private applyCurrentFilter() {
		this.loadTasks();
	}

	/**
	 * Load tasks from plugin or Bases data
	 */
	private async loadTasks() {
		// If we have Bases data, use it
		if (this.data) {
			this.tasks = this.convertBasesEntriesToTasks(this.data.data);
		} else if (this.plugin.dataflowOrchestrator) {
			// Fall back to plugin's dataflow if available
			try {
				const queryAPI = this.plugin.dataflowOrchestrator.getQueryAPI();
				this.tasks = await queryAPI.getAllTasks();
			} catch (error) {
				console.error("Error loading tasks from dataflow:", error);
				this.tasks = [];
			}
		} else {
			this.tasks = [];
		}

		// Update the current view
		if (this.currentViewId) {
			this.switchView(this.currentViewId, this.currentProject, true);
		}
	}

	/**
	 * Get view options for Bases configuration
	 * @param viewMode - Optional view mode to filter options for specific view types
	 */
	static getViewOptions(viewMode?: ViewMode): ViewOption[] {
		const options: ViewOption[] = [];

		// Common options for all views
		// Default values are derived from DEFAULT_FILE_TASK_MAPPING
		options.push(
			{
				displayName: "Property Mappings",
				type: "group",
				items: [
					{
						displayName: "Task Content",
						type: "property",
						key: "taskContent",
						placeholder: "Property containing task text",
						default: "file.basename", // Special case: use file name as content
					},
					{
						displayName: "Task Status",
						type: "property",
						key: "taskStatus",
						filter: (prop) => !prop.startsWith("file."),
						placeholder: "Property for completion status",
						default: `note.${DEFAULT_FILE_TASK_MAPPING.statusProperty}`,
					},
					{
						displayName: "Priority",
						type: "property",
						key: "taskPriority",
						filter: (prop) => !prop.startsWith("file."),
						placeholder: "Property for task priority",
						default: `note.${DEFAULT_FILE_TASK_MAPPING.priorityProperty}`,
					},
					{
						displayName: "Project",
						type: "property",
						key: "taskProject",
						filter: (prop) => !prop.startsWith("file."),
						placeholder: "Property for project assignment",
						default: `note.${DEFAULT_FILE_TASK_MAPPING.projectProperty}`,
					},
					{
						displayName: "Tags",
						type: "property",
						key: "taskTags",
						filter: (prop) => !prop.startsWith("file."),
						placeholder: "Property for task tags",
						default: `note.${DEFAULT_FILE_TASK_MAPPING.tagsProperty}`,
					},
					{
						displayName: "Context",
						type: "property",
						key: "taskContext",
						filter: (prop) => !prop.startsWith("file."),
						placeholder: "Property for task context",
						default: `note.${DEFAULT_FILE_TASK_MAPPING.contextProperty}`,
					},
				],
			},
			{
				displayName: "Date Properties",
				type: "group",
				items: [
					{
						displayName: "Due Date",
						type: "property",
						key: "taskDueDate",
						filter: (prop) => !prop.startsWith("file."),
						placeholder: "Property for due date",
						default: `note.${DEFAULT_FILE_TASK_MAPPING.dueDateProperty}`,
					},
					{
						displayName: "Start Date",
						type: "property",
						key: "taskStartDate",
						filter: (prop) => !prop.startsWith("file."),
						placeholder: "Property for start date",
						default: `note.${DEFAULT_FILE_TASK_MAPPING.startDateProperty}`,
					},
					{
						displayName: "Completed Date",
						type: "property",
						key: "taskCompletedDate",
						filter: (prop) => !prop.startsWith("file."),
						placeholder: "Property for completion date",
						default: `note.${DEFAULT_FILE_TASK_MAPPING.completedDateProperty}`,
					},
				],
			},
		);

		// View-specific options based on viewMode
		// If no viewMode is specified, include all view-specific options (for unified view)
		if (!viewMode || viewMode === "kanban") {
			options.push({
				displayName: "Kanban View Settings",
				type: "group",
				items: [
					{
						displayName: "Group By",
						type: "dropdown",
						key: "tg_groupBy",
						options: {
							status: "Status",
							priority: "Priority",
							tags: "Tags",
							project: "Project",
							context: "Context",
							dueDate: "Due Date",
							startDate: "Start Date",
						},
						default: "status",
					},
					{
						displayName: "Hide Empty Columns",
						type: "toggle",
						key: "hideEmptyColumns",
						default: false,
					},
					{
						displayName: "Default Sort Field",
						type: "dropdown",
						key: "defaultSortField",
						options: {
							priority: "Priority",
							dueDate: "Due Date",
							scheduledDate: "Scheduled Date",
							startDate: "Start Date",
							createdDate: "Created Date",
						},
						default: "priority",
					},
					{
						displayName: "Default Sort Order",
						type: "dropdown",
						key: "defaultSortOrder",
						options: {
							asc: "Ascending",
							desc: "Descending",
						},
						default: "desc",
					},
				],
			});
		}

		if (!viewMode || viewMode === "calendar") {
			options.push({
				displayName: t("Calendar Settings"),
				type: "group",
				items: [
					{
						displayName: "First Day of Week",
						type: "slider",
						key: "firstDayOfWeek",
						min: 0,
						max: 6,
						step: 1,
						default: 0,
					},
					{
						displayName: "Hide Weekends",
						type: "toggle",
						key: "hideWeekends",
						default: false,
					},
				],
			});
		}

		if (!viewMode || viewMode === "gantt") {
			options.push({
				displayName: "Gantt View Settings",
				type: "group",
				items: [
					{
						displayName: "Show Task Labels",
						type: "toggle",
						key: "showTaskLabels",
						default: true,
					},
					{
						displayName: "Use Markdown Renderer",
						type: "toggle",
						key: "useMarkdownRenderer",
						default: false,
					},
				],
			});
		}

		if (!viewMode || viewMode === "forecast") {
			options.push({
				displayName: "Forecast View Settings",
				type: "group",
				items: [
					{
						displayName: "First Day of Week",
						type: "slider",
						key: "firstDayOfWeek",
						min: 0,
						max: 6,
						step: 1,
						default: 0,
					},
					{
						displayName: "Hide Weekends",
						type: "toggle",
						key: "hideWeekends",
						default: false,
					},
				],
			});
		}

		if (!viewMode || viewMode === "quadrant") {
			options.push({
				displayName: "Quadrant View Settings",
				type: "group",
				items: [
					{
						displayName: "Urgent Tag",
						type: "text",
						key: "urgentTag",
						placeholder: "#urgent",
						default: "#urgent",
					},
					{
						displayName: "Important Tag",
						type: "text",
						key: "importantTag",
						placeholder: "#important",
						default: "#important",
					},
					{
						displayName: "Urgent Threshold (Days)",
						type: "slider",
						key: "urgentThresholdDays",
						min: 1,
						max: 14,
						step: 1,
						default: 3,
					},
					{
						displayName: "Use Priority for Classification",
						type: "toggle",
						key: "usePriorityForClassification",
						default: false,
					},
					{
						displayName: "Urgent Priority Threshold",
						type: "slider",
						key: "urgentPriorityThreshold",
						min: 1,
						max: 5,
						step: 1,
						default: 4,
					},
					{
						displayName: "Important Priority Threshold",
						type: "slider",
						key: "importantPriorityThreshold",
						min: 1,
						max: 5,
						step: 1,
						default: 3,
					},
				],
			});
		}

		return options;
	}
}
