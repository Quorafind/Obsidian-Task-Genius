/**
 * File Task View Component
 * Renders TaskView within Bases plugin views for file-level task management
 */

import { Component, App, Modal, Setting, Menu, TFile } from "obsidian";
import { ViewMode } from "../common/setting-definition";
import { Task, StandardTaskMetadata } from "../types/task";

// Forward declarations to avoid import issues
interface BasesViewSettings {
	get(key: string): any;
	set(data: any): void;
	getOrder(): string[] | null;
	setOrder(order: string[]): void;
	getDisplayName(prop: any): string;
	setDisplayName(prop: any, name: string): void;
	getViewName(): string;
}

interface BasesViewData {
	entries: any[];
}

interface BasesProperty {
	name: string;
	type: string;
	dataType?: string;
}

interface BaseView {
	onload?(): void;
	onunload?(): void;
	onActionsMenu(): Array<{
		name: string;
		callback: () => void;
		icon: string;
	}>;
	onEditMenu(): Array<{
		displayName: string;
		component: (container: HTMLElement) => any;
	}>;
	onResize(): void;
}

interface BasesView extends BaseView {
	type: string;
	app: any;
	containerEl: HTMLElement;
	settings: BasesViewSettings;
	data: BasesViewData[];
	properties: BasesProperty[];
	updateConfig(settings: BasesViewSettings): void;
	updateData(properties: BasesProperty[], data: BasesViewData[]): void;
	display(): void;
}
import { FileTask, FileTaskPropertyMapping } from "../types/file-task";
import {
	FileTaskManagerImpl,
	DEFAULT_FILE_TASK_MAPPING,
} from "../utils/FileTaskManager";
import TaskProgressBarPlugin from "../index";
import { ForecastComponent } from "../components/task-view/forecast";
import { TagsComponent } from "../components/task-view/tags";
import { ProjectsComponent } from "../components/task-view/projects";
import { ReviewComponent } from "../components/task-view/review";
import { CalendarComponent } from "../components/calendar";
import { KanbanComponent } from "../components/kanban/kanban";
import { GanttComponent } from "../components/gantt/gantt";
import { ViewComponentManager } from "../components/ViewComponentManager";
import { Habit } from "../components/habit/habit";

// Import task view components
import { ContentComponent } from "../components/task-view/content";
import { SidebarComponent } from "../components/task-view/sidebar";
import {
	createTaskCheckbox,
	TaskDetailsComponent,
} from "../components/task-view/details";

// Import required types and utilities
import {
	getViewSettingOrDefault,
	TwoColumnSpecificConfig,
} from "../common/setting-definition";
import { filterTasks } from "../utils/TaskFilterUtils";
import { TaskPropertyTwoColumnView } from "../components/task-view/TaskPropertyTwoColumnView";
import { RootFilterState } from "../components/task-filter/ViewTaskFilter";
import { t } from "../translations/helper";

export class FileTaskView extends Component implements BasesView {
	type = "task-genius-view";
	app: App;
	containerEl: HTMLElement;
	settings: BasesViewSettings;
	data: BasesViewData[] = [];
	properties: BasesProperty[] = [];
	private isSidebarCollapsed: boolean = false;

	// File task specific properties
	private fileTaskManager: FileTaskManagerImpl;
	private plugin: TaskProgressBarPlugin;
	private propertyMapping: FileTaskPropertyMapping =
		DEFAULT_FILE_TASK_MAPPING;
	private fileTasks: FileTask[] = [];

	// Task view components
	private contentComponent: ContentComponent;
	private sidebarComponent: SidebarComponent;
	private detailsComponent: TaskDetailsComponent;
	private currentSelectedTask: FileTask | null = null;
	private forecastComponent: ForecastComponent;
	private tagsComponent: TagsComponent;
	private projectsComponent: ProjectsComponent;
	private reviewComponent: ReviewComponent;
	private calendarComponent: CalendarComponent;
	private kanbanComponent: KanbanComponent;
	private ganttComponent: GanttComponent;
	private habitComponent: Habit;
	private viewComponentManager: ViewComponentManager; // 新增：统一的视图组件管理器

	// Two column view components
	private twoColumnViewComponents: Map<string, TaskPropertyTwoColumnView> =
		new Map();

	// View state management
	private currentViewId: ViewMode = "inbox";
	private currentFilterState: RootFilterState | null = null;
	private isDetailsVisible: boolean = false;
	private currentSelectedTaskId: string | null = null;

	// Task data for compatibility with existing components
	private tasks: any[] = [];

	// Lazy loading optimization
	private readonly LAZY_LOADING_THRESHOLD = 100; // Enable lazy loading when tasks exceed this number
	private cachedRegularTasks: Map<string, any> = new Map(); // Cache converted tasks to avoid repeated conversion

	constructor(
		containerEl: HTMLElement,
		app: App,
		plugin: TaskProgressBarPlugin,
		propertyMapping?: FileTaskPropertyMapping
	) {
		super();
		this.containerEl = containerEl;
		this.app = app;
		this.plugin = plugin;
		this.fileTaskManager = new FileTaskManagerImpl(app);

		if (propertyMapping) {
			this.propertyMapping = propertyMapping;
		}

		this.initializeComponents();
	}

	private initializeComponents() {
		// Clear container
		this.containerEl.empty();
		this.containerEl.addClass("file-task-view-container");
		console.log(
			"toggleSidebar",
			this.containerEl,
			this.containerEl.closest("bases-embed"),
			this
		);
		if (this.containerEl.closest("bases-embed")) {
			console.log("toggleSidebar", this.containerEl);
			this.toggleSidebar();
		}
		this.containerEl.toggleClass("task-genius-view", true);
		// Create main layout
		const mainContainer = this.containerEl.createDiv({
			cls: "task-genius-container",
		});

		// Initialize sidebar component (simplified for file tasks)
		this.sidebarComponent = new SidebarComponent(
			mainContainer,
			this.plugin
		);

		console.log("this.plugin", this.plugin);
		this.addChild(this.sidebarComponent);
		this.sidebarComponent.load();

		// Initialize content component
		this.contentComponent = new ContentComponent(
			mainContainer,
			this.app,
			this.plugin,
			{
				onTaskSelected: (task) => {
					// Convert regular task to file task if needed
					this.handleTaskSelection(task);
				},
				onTaskCompleted: (task) => {
					this.handleTaskCompletion(task);
				},
				onTaskContextMenu: (event, task) => {
					this.handleTaskContextMenu(event, task);
				},
			}
		);
		this.addChild(this.contentComponent);
		this.contentComponent.load();

		// Initialize forecast component
		this.forecastComponent = new ForecastComponent(
			mainContainer,
			this.app,
			this.plugin,
			{
				onTaskSelected: (task) => {
					this.handleTaskSelection(task);
				},
				onTaskCompleted: (task) => {
					this.handleTaskCompletion(task);
				},
				onTaskUpdate: async (originalTask, updatedTask) => {
					// Convert regular tasks back to file tasks for handling
					const originalFileTask = this.fileTasks.find(
						(ft) => ft.id === originalTask.id
					);
					if (originalFileTask) {
						const updatedFileTask: FileTask = {
							...originalFileTask,
							content: updatedTask.content,
							completed: updatedTask.completed,
							status: updatedTask.status,
							metadata: updatedTask.metadata,
						};
						await this.handleTaskUpdate(
							originalFileTask,
							updatedFileTask
						);
					}
				},
				onTaskContextMenu: (event, task) => {
					this.handleTaskContextMenu(event, task);
				},
			}
		);
		this.addChild(this.forecastComponent);
		this.forecastComponent.load();
		this.forecastComponent.containerEl.hide();

		// Initialize tags component
		this.tagsComponent = new TagsComponent(
			mainContainer,
			this.app,
			this.plugin,
			{
				onTaskSelected: (task) => {
					this.handleTaskSelection(task);
				},
				onTaskCompleted: (task) => {
					this.handleTaskCompletion(task);
				},
				onTaskContextMenu: (event, task) => {
					this.handleTaskContextMenu(event, task);
				},
			}
		);
		this.addChild(this.tagsComponent);
		this.tagsComponent.load();
		this.tagsComponent.containerEl.hide();

		// Initialize projects component
		this.projectsComponent = new ProjectsComponent(
			mainContainer,
			this.app,
			this.plugin,
			{
				onTaskSelected: (task) => {
					this.handleTaskSelection(task);
				},
				onTaskCompleted: (task) => {
					this.handleTaskCompletion(task);
				},
				onTaskContextMenu: (event, task) => {
					this.handleTaskContextMenu(event, task);
				},
			}
		);
		this.addChild(this.projectsComponent);
		this.projectsComponent.load();
		this.projectsComponent.containerEl.hide();

		// Initialize review component
		this.reviewComponent = new ReviewComponent(
			mainContainer,
			this.app,
			this.plugin,
			{
				onTaskSelected: (task) => {
					this.handleTaskSelection(task);
				},
				onTaskCompleted: (task) => {
					this.handleTaskCompletion(task);
				},
				onTaskContextMenu: (event, task) => {
					this.handleTaskContextMenu(event, task);
				},
			}
		);
		this.addChild(this.reviewComponent);
		this.reviewComponent.load();
		this.reviewComponent.containerEl.hide();

		// Initialize calendar component
		this.calendarComponent = new CalendarComponent(
			this.app,
			this.plugin,
			mainContainer,
			this.tasks,
			{
				onTaskSelected: (task: any) => {
					this.handleTaskSelection(task);
				},
				onTaskCompleted: (task: any) => {
					this.handleTaskCompletion(task);
				},
				onEventContextMenu: (event: MouseEvent, calendarEvent: any) => {
					this.handleTaskContextMenu(event, calendarEvent);
				},
			}
		);
		this.addChild(this.calendarComponent);
		this.calendarComponent.load();
		this.calendarComponent.containerEl.hide();

		// Initialize kanban component
		this.kanbanComponent = new KanbanComponent(
			this.app,
			this.plugin,
			mainContainer,
			this.tasks,
			{
				onTaskStatusUpdate:
					this.handleKanbanTaskStatusUpdate.bind(this),
				onTaskSelected: this.handleTaskSelection.bind(this),
				onTaskCompleted: this.handleTaskCompletion.bind(this),
				onTaskContextMenu: this.handleTaskContextMenu.bind(this),
			}
		);
		this.addChild(this.kanbanComponent);
		this.kanbanComponent.containerEl.hide();

		// Initialize gantt component
		this.ganttComponent = new GanttComponent(this.plugin, mainContainer, {
			onTaskSelected: this.handleTaskSelection.bind(this),
			onTaskCompleted: this.handleTaskCompletion.bind(this),
			onTaskContextMenu: this.handleTaskContextMenu.bind(this),
		});
		this.addChild(this.ganttComponent);
		this.ganttComponent.containerEl.hide();

		// Initialize habit component
		this.habitComponent = new Habit(this.plugin, mainContainer);
		this.addChild(this.habitComponent);
		this.habitComponent.containerEl.hide();

		// Initialize details component
		this.detailsComponent = new TaskDetailsComponent(
			mainContainer,
			this.app,
			this.plugin
		);
		this.addChild(this.detailsComponent);
		this.detailsComponent.load();

		this.toggleDetailsVisibility(false);

		// Initialize unified view component manager
		this.viewComponentManager = new ViewComponentManager(
			this,
			this.app,
			this.plugin,
			mainContainer,
			{
				onTaskSelected: this.handleTaskSelection.bind(this),
				onTaskCompleted: this.handleTaskCompletion.bind(this),
				onTaskContextMenu: this.handleTaskContextMenu.bind(this),
				onTaskStatusUpdate:
					this.handleKanbanTaskStatusUpdate.bind(this),
				onEventContextMenu: this.handleTaskContextMenu.bind(this),
			}
		);
		this.addChild(this.viewComponentManager);

		// Set up event handlers
		this.setupEventHandlers();
	}

	private setupEventHandlers() {
		// Details component handlers
		this.detailsComponent.onTaskToggleComplete = (task) => {
			this.handleTaskCompletion(task);
		};

		this.detailsComponent.onTaskUpdate = async (
			originalTask: Task,
			updatedTask: Task
		) => {
			const fileTask = this.fileTasks.find(
				(ft) => ft.id === originalTask.id
			);
			if (!fileTask) {
				return;
			}
			const { line, originalMarkdown, ...taskUpdates } = updatedTask;
			const updatedFileTask = {
				...taskUpdates,
				sourceEntry: fileTask.sourceEntry,
				isFileTask: true,
			} as FileTask;

			if (fileTask) {
				await this.handleTaskUpdate(fileTask, updatedFileTask);
			}
		};

		this.detailsComponent.toggleDetailsVisibility = (visible: boolean) => {
			this.toggleDetailsVisibility(visible);
		};

		// Sidebar component handlers
		this.sidebarComponent.onViewModeChanged = (viewId) => {
			console.log("[FileTaskView] View mode changed to:", viewId);
			this.handleViewModeChanged(viewId);
		};

		this.sidebarComponent.onProjectSelected = (project) => {
			this.handleProjectSelected(project);
		};
	}

	// BasesView interface implementation

	updateConfig(settings: BasesViewSettings): void {
		this.settings = settings;
		console.log("[FileTaskView] Config updated:", settings);
		this.onConfigUpdated();
	}

	/**
	 * Handle configuration updates
	 */
	private onConfigUpdated(): void {
		// Update view components with new configuration
		this.updateTaskViewComponents();
	}

	updateData(properties: BasesProperty[], data: BasesViewData[]): void {
		console.log("[FileTaskView] Data updated:", { properties, data });
		this.properties = properties;
		this.data = data;

		// Convert entries to file tasks with incremental update
		const hasChanges = this.convertEntriesToFileTasks();

		// Only update the task view components if there were actual changes
		if (hasChanges) {
			console.log("[FileTaskView] Changes detected, updating components");
			this.onDataUpdated();
		} else {
			console.log(
				"[FileTaskView] No changes detected, skipping component update"
			);
		}
	}

	/**
	 * Handle data updates
	 */
	private onDataUpdated(): void {
		// Update task view components with new data
		this.updateTaskViewComponents();
	}

	display(): void {
		console.log("[FileTaskView] Displaying file task view");
		this.containerEl.show();
	}

	// BaseView interface implementation

	onload(): void {
		console.log("[FileTaskView] Loading file task view");
	}

	onunload(): void {
		console.log("[FileTaskView] Unloading file task view");
		// Clear cache to free memory
		this.cachedRegularTasks.clear();
		this.unload();
	}

	onActionsMenu(): Array<{
		name: string;
		callback: () => void;
		icon: string;
	}> {
		return [
			{
				name: "Refresh Tasks",
				icon: "refresh-cw",
				callback: () => {
					this.convertEntriesToFileTasks();
					this.updateTaskViewComponents();
				},
			},
			{
				name: "Configure Mapping",
				icon: "settings",
				callback: () => {
					// Open property mapping configuration
					this.openPropertyMappingConfig();
				},
			},
			{
				name: "Clear Cache",
				icon: "trash-2",
				callback: () => {
					this.clearTaskCache();
				},
			},
			{
				name: "Cache Stats",
				icon: "info",
				callback: () => {
					const stats = this.getCacheStats();
					console.log("[FileTaskView] Cache Statistics:", stats);
					// You could show this in a notice or modal if needed
				},
			},
		];
	}

	onEditMenu(): Array<{
		displayName: string;
		component: (container: HTMLElement) => any;
	}> {
		return [
			{
				displayName: "Task View Settings",
				component: (container: HTMLElement) => {
					// Create settings component
					return this.createSettingsComponent(container);
				},
			},
		];
	}

	onResize(): void {
		this.checkAndCollapseSidebar();
	}

	checkAndCollapseSidebar() {
		if (
			this.containerEl.clientWidth === 0 ||
			this.containerEl.clientHeight === 0
		) {
			return;
		}

		if (this.containerEl.clientWidth < 768) {
			this.isSidebarCollapsed = true;
			this.sidebarComponent.setCollapsed(true);
		} else {
		}
	}

	private toggleSidebar() {
		this.isSidebarCollapsed = !this.isSidebarCollapsed;
		this.containerEl.toggleClass(
			"sidebar-collapsed",
			this.isSidebarCollapsed
		);

		this.sidebarComponent.setCollapsed(this.isSidebarCollapsed);
	}

	private toggleDetailsVisibility(visible: boolean) {
		this.isDetailsVisible = visible;
		this.containerEl.toggleClass("details-visible", visible);
		this.containerEl.toggleClass("details-hidden", !visible);

		this.detailsComponent.setVisible(visible);

		if (!visible) {
			this.currentSelectedTaskId = null;
		}
	}

	private convertEntriesToFileTasks(): boolean {
		if (!this.data || this.data.length === 0) {
			const hadTasks = this.fileTasks.length > 0;
			this.fileTasks = [];
			return hadTasks; // Return true if we had tasks before but now have none
		}

		const allEntries = this.data.flatMap((dataGroup) => dataGroup.entries);

		// Log file types for debugging
		const fileTypes = allEntries.reduce((acc, entry) => {
			const ext = entry.file.extension;
			acc[ext] = (acc[ext] || 0) + 1;
			return acc;
		}, {} as Record<string, number>);

		console.log(`[FileTaskView] File types found:`, fileTypes);

		// Validate property mapping (only occasionally to avoid spam)
		if (Math.random() < 0.2) {
			// 20% chance to validate
			this.fileTaskManager.validatePropertyMapping(
				allEntries,
				this.propertyMapping
			);
		}

		const newFileTasks = this.fileTaskManager.getFileTasksFromEntries(
			allEntries,
			this.propertyMapping
		);

		// Perform incremental update instead of full replacement
		const hasChanges = this.updateFileTasksIncrementally(newFileTasks);

		console.log(
			`[FileTaskView] Converted ${allEntries.length} entries to ${newFileTasks.length} file tasks, hasChanges: ${hasChanges}`
		);

		// Update tasks array for compatibility with existing components only if there are changes
		if (hasChanges) {
			this.tasks = this.fileTasks.map((fileTask) =>
				this.fileTaskToRegularTask(fileTask)
			);
		}

		return hasChanges;
	}

	/**
	 * Update file tasks incrementally by comparing with existing tasks
	 * Returns true if there were any changes
	 */
	private updateFileTasksIncrementally(newFileTasks: FileTask[]): boolean {
		// Create maps for efficient comparison
		const existingTasksMap = new Map(
			this.fileTasks.map((task) => [task.id, task])
		);
		const newTasksMap = new Map(
			newFileTasks.map((task) => [task.id, task])
		);

		let hasChanges = false;

		// Check for removed tasks
		for (const existingId of existingTasksMap.keys()) {
			if (!newTasksMap.has(existingId)) {
				hasChanges = true;
				// Clean up cache for removed tasks
				this.cachedRegularTasks.delete(existingId);
			}
		}

		// Check for new or modified tasks
		if (!hasChanges) {
			for (const [newId, newTask] of newTasksMap) {
				const existingTask = existingTasksMap.get(newId);
				if (
					!existingTask ||
					this.hasTaskChanged(existingTask, newTask)
				) {
					hasChanges = true;
					// Invalidate cache for changed tasks
					this.cachedRegularTasks.delete(newId);
				}
			}
		}

		// Only update if there are changes
		if (hasChanges) {
			this.fileTasks = newFileTasks;
			console.log(`[FileTaskView] File tasks updated due to changes`);
		} else {
			console.log(`[FileTaskView] No changes detected, skipping update`);
		}

		return hasChanges;
	}

	/**
	 * Check if a task has changed by comparing key properties
	 */
	private hasTaskChanged(existingTask: FileTask, newTask: FileTask): boolean {
		// Compare key properties that would affect the UI
		const baseProperties: (keyof FileTask)[] = [
			"content",
			"completed",
			"status",
		];

		// Check base properties
		for (const prop of baseProperties) {
			if (this.compareProperty(existingTask[prop], newTask[prop]) !== 0) {
				return true;
			}
		}

		// Compare metadata properties
		const metadataProperties: (keyof StandardTaskMetadata)[] = [
			"dueDate",
			"startDate",
			"scheduledDate",
			"priority",
			"tags",
			"project",
			"context",
		];

		for (const prop of metadataProperties) {
			if (
				this.compareProperty(
					existingTask.metadata[prop],
					newTask.metadata[prop]
				) !== 0
			) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Compare two property values
	 */
	private compareProperty(a: any, b: any): number {
		// Handle arrays (like tags)
		if (Array.isArray(a) && Array.isArray(b)) {
			if (a.length !== b.length) return a.length - b.length;
			for (let i = 0; i < a.length; i++) {
				if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
			}
			return 0;
		}

		// Handle primitive values
		if (a === b) return 0;
		if (a == null && b == null) return 0;
		if (a == null) return -1;
		if (b == null) return 1;
		return a < b ? -1 : 1;
	}

	private updateTaskViewComponents(): void {
		// Check if we should use lazy loading based on task count
		const shouldUseLazyLoading =
			this.fileTasks.length > this.LAZY_LOADING_THRESHOLD;

		console.log(
			`[FileTaskView] Updating task view components. Task count: ${this.fileTasks.length}, Using lazy loading: ${shouldUseLazyLoading}`
		);

		if (shouldUseLazyLoading) {
			// For large datasets, use lazy conversion and update cache incrementally
			this.updateTasksLazily();
		} else {
			// For small datasets, convert all tasks at once (existing behavior)
			this.updateTasksEagerly();
		}

		// Update sidebar if needed - but preserve current view mode
		if (this.sidebarComponent) {
			// Don't reset to inbox, keep current view mode
			// this.sidebarComponent.setViewMode("inbox");
		}

		// Update current view with preserved view mode
		this.switchView(this.currentViewId);
	}

	/**
	 * Eager loading: Convert all tasks at once (for small datasets)
	 */
	private updateTasksEagerly(): void {
		const regularTasks = this.fileTasks.map((fileTask) =>
			this.fileTaskToRegularTask(fileTask)
		);

		this.tasks = regularTasks;

		if (
			this.contentComponent &&
			typeof this.contentComponent.setTasks === "function"
		) {
			this.contentComponent.setTasks(regularTasks, regularTasks);
		}
	}

	/**
	 * Lazy loading: Update cache incrementally and provide tasks on-demand
	 */
	private updateTasksLazily(): void {
		// Update cache incrementally - only convert tasks that have changed
		this.updateTaskCache();

		// Create a lazy task provider that converts tasks on-demand
		const lazyTasks = this.createLazyTaskArray();
		this.tasks = lazyTasks;

		if (
			this.contentComponent &&
			typeof this.contentComponent.setTasks === "function"
		) {
			// Pass the lazy array to ContentComponent
			// ContentComponent's lazy loading will handle the rest
			this.contentComponent.setTasks(lazyTasks, lazyTasks);
		}
	}

	/**
	 * Update the task cache incrementally
	 */
	private updateTaskCache(): void {
		// Get current cached task IDs
		const cachedIds = new Set(this.cachedRegularTasks.keys());
		const currentIds = new Set(this.fileTasks.map((ft) => ft.id));

		// Remove tasks that no longer exist
		for (const cachedId of cachedIds) {
			if (!currentIds.has(cachedId)) {
				this.cachedRegularTasks.delete(cachedId);
			}
		}

		// Add or update tasks that have changed
		for (const fileTask of this.fileTasks) {
			const cached = this.cachedRegularTasks.get(fileTask.id);
			if (!cached || this.hasTaskChangedForCache(cached, fileTask)) {
				this.cachedRegularTasks.set(
					fileTask.id,
					this.fileTaskToRegularTask(fileTask)
				);
			}
		}

		console.log(
			`[FileTaskView] Task cache updated. Cached: ${this.cachedRegularTasks.size}, Total: ${this.fileTasks.length}`
		);
	}

	/**
	 * Create a lazy task array that converts tasks on-demand
	 */
	private createLazyTaskArray(): any[] {
		const lazyArray: any[] = [];
		let accessCount = 0; // Track how many tasks have been accessed

		// Create a proxy array that converts tasks on access
		for (let i = 0; i < this.fileTasks.length; i++) {
			Object.defineProperty(lazyArray, i, {
				get: () => {
					const fileTask = this.fileTasks[i];
					if (!fileTask) return undefined;

					// Check cache first
					let regularTask = this.cachedRegularTasks.get(fileTask.id);
					if (!regularTask) {
						// Convert and cache if not found
						regularTask = this.fileTaskToRegularTask(fileTask);
						this.cachedRegularTasks.set(fileTask.id, regularTask);
						accessCount++;
						if (accessCount % 10 === 0) {
							console.log(
								`[FileTaskView] Lazy loading: ${accessCount} tasks converted so far`
							);
						}
					}
					return regularTask;
				},
				enumerable: true,
				configurable: true,
			});
		}

		// Set length property
		Object.defineProperty(lazyArray, "length", {
			value: this.fileTasks.length,
			writable: false,
			enumerable: false,
			configurable: false,
		});

		// Add array methods that ContentComponent might use
		lazyArray.map = function (
			callback: (value: any, index: number, array: any[]) => any
		) {
			const result = [];
			for (let i = 0; i < this.length; i++) {
				result.push(callback(this[i], i, this));
			}
			return result;
		};

		lazyArray.filter = function (
			callback: (value: any, index: number, array: any[]) => boolean
		) {
			const result = [];
			for (let i = 0; i < this.length; i++) {
				if (callback(this[i], i, this)) {
					result.push(this[i]);
				}
			}
			return result;
		};

		lazyArray.find = function (
			callback: (value: any, index: number, array: any[]) => boolean
		) {
			for (let i = 0; i < this.length; i++) {
				if (callback(this[i], i, this)) {
					return this[i];
				}
			}
			return undefined;
		};

		lazyArray.some = function (
			callback: (value: any, index: number, array: any[]) => boolean
		) {
			for (let i = 0; i < this.length; i++) {
				if (callback(this[i], i, this)) {
					return true;
				}
			}
			return false;
		};

		lazyArray.forEach = function (
			callback: (value: any, index: number, array: any[]) => void
		) {
			for (let i = 0; i < this.length; i++) {
				callback(this[i], i, this);
			}
		};

		console.log(
			`[FileTaskView] Created lazy task array with ${this.fileTasks.length} tasks`
		);
		return lazyArray;
	}

	/**
	 * Check if a task has changed compared to cached version
	 */
	private hasTaskChangedForCache(
		cachedTask: any,
		fileTask: FileTask
	): boolean {
		// Compare key properties that would affect the converted task
		return (
			cachedTask.content !== fileTask.content ||
			cachedTask.completed !== fileTask.completed ||
			cachedTask.status !== fileTask.status ||
			cachedTask.dueDate !== fileTask.metadata.dueDate ||
			cachedTask.startDate !== fileTask.metadata.startDate ||
			cachedTask.scheduledDate !== fileTask.metadata.scheduledDate ||
			cachedTask.priority !== fileTask.metadata.priority ||
			JSON.stringify(cachedTask.tags) !==
				JSON.stringify(fileTask.metadata.tags) ||
			cachedTask.project !== fileTask.metadata.project ||
			cachedTask.context !== fileTask.metadata.context
		);
	}

	private fileTaskToRegularTask(fileTask: FileTask): any {
		// Convert FileTask to regular Task for compatibility with existing components
		return {
			...fileTask,
			line: 0, // File tasks don't have line numbers
			originalMarkdown: `- [ ] ${fileTask.content}`, // Use content (which is already without extension)
		};
	}

	private handleTaskSelection(task: Task | null): void {
		if (task) {
			// Find corresponding file task
			const fileTask = this.fileTasks.find((ft) => ft.id === task.id);
			if (fileTask) {
				this.currentSelectedTask = fileTask;
				this.currentSelectedTaskId = task.id;
				this.detailsComponent.showTaskDetails(
					this.fileTaskToRegularTask(fileTask)
				);
				if (!this.isDetailsVisible) {
					this.toggleDetailsVisibility(true);
				}
			}
		} else {
			this.toggleDetailsVisibility(false);
			this.currentSelectedTaskId = null;
			this.currentSelectedTask = null;
		}
	}

	private async handleTaskCompletion(task: Task): Promise<void> {
		const fileTask = this.fileTasks.find((ft) => ft.id === task.id);
		if (fileTask) {
			try {
				const updates: Partial<FileTask> = {
					completed: !fileTask.completed,
					metadata: {
						...fileTask.metadata,
						completedDate: !fileTask.completed
							? Date.now()
							: undefined,
					},
				};

				await this.fileTaskManager.updateFileTask(fileTask, updates);

				// Refresh the view only if there are changes
				const hasChanges = this.convertEntriesToFileTasks();
				if (hasChanges) {
					this.updateTaskViewComponents();
				}
			} catch (error) {
				console.error(
					"[FileTaskView] Failed to update task completion:",
					error
				);
			}
		}
	}

	private async handleTaskUpdate(
		originalTask: FileTask,
		updatedTask: FileTask
	): Promise<void> {
		const fileTask = this.fileTasks.find((ft) => ft.id === originalTask.id);
		if (fileTask) {
			try {
				// Extract updates from the updated task
				const updates: Partial<FileTask> = {
					content: updatedTask.content,
					status: updatedTask.status,
					completed: updatedTask.completed,
					metadata: {
						...fileTask.metadata,
						dueDate: updatedTask.metadata.dueDate,
						startDate: updatedTask.metadata.startDate,
						scheduledDate: updatedTask.metadata.scheduledDate,
						priority: updatedTask.metadata.priority,
						tags: updatedTask.metadata.tags,
						project: updatedTask.metadata.project,
						context: updatedTask.metadata.context,
					},
				};

				await this.fileTaskManager.updateFileTask(fileTask, updates);

				console.log("[FileTaskView] Updated task:", updates);

				// Refresh the view only if there are changes
				const hasChanges = this.convertEntriesToFileTasks();
				if (hasChanges) {
					this.updateTaskViewComponents();
				}
			} catch (error) {
				console.error("[FileTaskView] Failed to update task:", error);
			}
		}
	}

	private handleTaskContextMenu(event: MouseEvent, task: any): void {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle(t("Complete"));
			item.setIcon("check-square");
			item.onClick(() => {
				this.handleTaskCompletion(task);
			});
		})
			.addItem((item) => {
				item.setIcon("square-pen");
				item.setTitle(t("Switch status"));
				const submenu = item.setSubmenu();

				// Get unique statuses from taskStatusMarks
				const statusMarks = this.plugin.settings.taskStatusMarks;
				const uniqueStatuses = new Map<string, string>();

				// Build a map of unique mark -> status name to avoid duplicates
				for (const status of Object.keys(statusMarks)) {
					const mark =
						statusMarks[status as keyof typeof statusMarks];
					// If this mark is not already in the map, add it
					// This ensures each mark appears only once in the menu
					if (!Array.from(uniqueStatuses.values()).includes(mark)) {
						uniqueStatuses.set(status, mark);
					}
				}

				// Create menu items from unique statuses
				for (const [status, mark] of uniqueStatuses) {
					submenu.addItem((item) => {
						item.titleEl.createEl(
							"span",
							{
								cls: "status-option-checkbox",
							},
							(el) => {
								createTaskCheckbox(mark, task, el);
							}
						);
						item.titleEl.createEl("span", {
							cls: "status-option",
							text: status,
						});
						item.onClick(() => {
							console.log("status", status, mark);
							if (!task.completed && mark.toLowerCase() === "x") {
								task.metadata.completedDate = Date.now();
							} else {
								task.metadata.completedDate = undefined;
							}
							this.handleTaskUpdate(task, {
								...task,
								status: mark,
								completed:
									mark.toLowerCase() === "x" ? true : false,
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
					this.handleTaskSelection(task); // Open details view for editing
				});
			})
			.addItem((item) => {
				item.setTitle(t("Edit in File"));
				item.setIcon("file-edit"); // Changed icon slightly
				item.onClick(() => {
					this.editTask(task);
				});
			});

		menu.showAtMouseEvent(event);
	}

	private async editTask(task: FileTask) {
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) return;

		const leaf = this.app.workspace.getLeaf(true);
		await leaf.openFile(file);
	}

	private handleViewModeChanged(viewId: ViewMode): void {
		this.switchView(viewId);
	}

	private handleProjectSelected(project: string): void {
		console.log("[FileTaskView] Project selected:", project);
		// Filter file tasks by project if needed
		// This is a placeholder for project-based filtering in file task view

		// You could implement project filtering logic here
		// For example, filter this.fileTasks by project and update the view
	}

	private handleKanbanTaskStatusUpdate = async (
		taskId: string,
		newStatusMark: string
	) => {
		console.log(
			`FileTaskView handling Kanban status update request for ${taskId} to mark ${newStatusMark}`
		);
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
				try {
					await this.handleTaskUpdate(taskToUpdate, {
						...taskToUpdate,
						status: newStatusMark,
						completed: isCompleted,
						completedDate: completedDate,
					});
					console.log(
						`Task ${taskId} status update processed by FileTaskView.`
					);
				} catch (error) {
					console.error(
						`FileTaskView failed to update task status from Kanban callback for task ${taskId}:`,
						error
					);
				}
			} else {
				console.log(
					`Task ${taskId} status (${newStatusMark}) already matches, no update needed.`
				);
			}
		} else {
			console.warn(
				`FileTaskView could not find task with ID ${taskId} for Kanban status update.`
			);
		}
	};

	private switchView(viewId: ViewMode, project?: string | null) {
		this.currentViewId = viewId;
		console.log("Switching view to:", viewId, "Project:", project);

		// Hide all components first
		this.contentComponent.containerEl.hide();
		this.forecastComponent.containerEl.hide();
		this.tagsComponent.containerEl.hide();
		this.projectsComponent.containerEl.hide();
		this.reviewComponent.containerEl.hide();
		// Hide any visible TwoColumnView components
		this.twoColumnViewComponents.forEach((component) => {
			component.containerEl.hide();
		});
		// Hide all special view components
		this.viewComponentManager.hideAllComponents();
		this.habitComponent.containerEl.hide();
		this.calendarComponent.containerEl.hide();
		this.kanbanComponent.containerEl.hide();
		this.ganttComponent.containerEl.hide();

		let targetComponent: any = null;
		let modeForComponent: ViewMode = viewId;

		// Get view configuration to check for specific view types
		const viewConfig = getViewSettingOrDefault(this.plugin, viewId);

		// Handle TwoColumn views
		if (viewConfig.specificConfig?.viewType === "twocolumn") {
			// Get or create TwoColumnView component
			if (!this.twoColumnViewComponents.has(viewId)) {
				// Create a new TwoColumnView component
				const twoColumnConfig =
					viewConfig.specificConfig as TwoColumnSpecificConfig;
				const twoColumnComponent = new TaskPropertyTwoColumnView(
					this.containerEl,
					this.app,
					this.plugin,
					twoColumnConfig,
					viewId
				);
				this.addChild(twoColumnComponent);

				// Set up event handlers
				twoColumnComponent.onTaskSelected = (task) => {
					const originalTask = this.fileTasks.find(
						(ft) => ft.id === task.id
					);
					if (originalTask) {
						this.handleTaskSelection(
							this.fileTaskToRegularTask(originalTask)
						);
					}
				};
				twoColumnComponent.onTaskCompleted = (task) => {
					const originalTask = this.fileTasks.find(
						(ft) => ft.id === task.id
					);
					if (originalTask) {
						this.handleTaskCompletion(
							this.fileTaskToRegularTask(originalTask)
						);
					}
				};
				twoColumnComponent.onTaskContextMenu = (event, task) => {
					const originalTask = this.fileTasks.find(
						(ft) => ft.id === task.id
					);
					if (originalTask) {
						this.handleTaskContextMenu(
							event,
							this.fileTaskToRegularTask(originalTask)
						);
					}
				};

				// Store for later use
				this.twoColumnViewComponents.set(viewId, twoColumnComponent);
			}

			// Get the component to display
			targetComponent = this.twoColumnViewComponents.get(viewId);
		} else {
			// 检查特殊视图类型（基于 specificConfig 或原始 viewId）
			const specificViewType = viewConfig.specificConfig?.viewType;

			// 检查是否为特殊视图，使用统一管理器处理
			if (this.viewComponentManager.isSpecialView(viewId)) {
				targetComponent =
					this.viewComponentManager.showComponent(viewId);
			} else if (
				specificViewType === "forecast" ||
				viewId === "forecast"
			) {
				targetComponent = this.forecastComponent;
			} else {
				// Standard view types
				switch (viewId) {
					case "habit":
						targetComponent = this.habitComponent;
						break;
					case "tags":
						targetComponent = this.tagsComponent;
						break;
					case "projects":
						targetComponent = this.projectsComponent;
						break;
					case "review":
						targetComponent = this.reviewComponent;
						break;
					case "inbox":
					case "flagged":
					default:
						targetComponent = this.contentComponent;
						modeForComponent = viewId;
						break;
				}
			}
		}

		if (targetComponent) {
			console.log(
				`Activating component for view ${viewId}`,
				targetComponent.constructor.name
			);
			targetComponent.containerEl.show();
			if (typeof targetComponent.setTasks === "function") {
				// 使用高级过滤器状态，确保传递有效的过滤器
				const filterOptions: {
					advancedFilter?: RootFilterState;
					textQuery?: string;
				} = {};
				if (
					this.currentFilterState &&
					this.currentFilterState.filterGroups &&
					this.currentFilterState.filterGroups.length > 0
				) {
					console.log("应用高级筛选器到视图:", viewId);
					filterOptions.advancedFilter = this.currentFilterState;
				}

				targetComponent.setTasks(
					filterTasks(this.tasks, viewId, this.plugin, filterOptions),
					this.tasks
				);
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
					console.log("应用高级筛选器到表格视图:", viewId);
					filterOptions.advancedFilter = this.currentFilterState;
				}

				targetComponent.updateTasks(
					filterTasks(this.tasks, viewId, this.plugin, filterOptions)
				);
			}

			if (typeof targetComponent.setViewMode === "function") {
				console.log(
					`Setting view mode for ${viewId} to ${modeForComponent} with project ${project}`
				);
				targetComponent.setViewMode(modeForComponent, project);
			}

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

					component.setTasks(
						filterTasks(
							this.tasks,
							component.getViewId(),
							this.plugin,
							filterOptions
						)
					);
				}
			});
			if (
				viewId === "review" &&
				typeof targetComponent.refreshReviewSettings === "function"
			) {
				targetComponent.refreshReviewSettings();
			}
		} else {
			console.warn(`No target component found for viewId: ${viewId}`);
		}

		this.handleTaskSelection(null);
	}

	private openPropertyMappingConfig(): void {
		// Create a simple configuration interface
		const modal = new PropertyMappingModal(
			this.app,
			this.propertyMapping,
			(newMapping: FileTaskPropertyMapping) => {
				this.setPropertyMapping(newMapping);
			}
		);
		modal.open();
	}

	private createSettingsComponent(container: HTMLElement): any {
		// TODO: Create settings component for file task view
		container.createEl("div", { text: "File Task View Settings" });
		return container;
	}

	// Public API for external configuration

	public setPropertyMapping(mapping: FileTaskPropertyMapping): void {
		this.propertyMapping = mapping;
		this.convertEntriesToFileTasks();
		this.updateTaskViewComponents();
	}

	public getPropertyMapping(): FileTaskPropertyMapping {
		return this.propertyMapping;
	}

	public getFileTasks(): FileTask[] {
		return this.fileTasks;
	}

	/**
	 * Clear the task conversion cache to free memory
	 */
	public clearTaskCache(): void {
		this.cachedRegularTasks.clear();
		console.log("[FileTaskView] Task cache cleared");
	}

	/**
	 * Get cache statistics for debugging
	 */
	public getCacheStats(): {
		cacheSize: number;
		totalTasks: number;
		cacheHitRatio: number;
	} {
		return {
			cacheSize: this.cachedRegularTasks.size,
			totalTasks: this.fileTasks.length,
			cacheHitRatio:
				this.fileTasks.length > 0
					? this.cachedRegularTasks.size / this.fileTasks.length
					: 0,
		};
	}
}

/**
 * Modal for configuring property mapping
 */
class PropertyMappingModal extends Modal {
	private mapping: FileTaskPropertyMapping;
	private onSave: (mapping: FileTaskPropertyMapping) => void;

	constructor(
		app: App,
		mapping: FileTaskPropertyMapping,
		onSave: (mapping: FileTaskPropertyMapping) => void
	) {
		super(app);
		this.mapping = { ...mapping }; // Create a copy
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Configure Property Mapping" });
		contentEl.createEl("p", {
			text: "Map file properties to task attributes. Use dataview standard keys like 'start', 'due', 'completion', etc.",
		});

		// Create settings for each mapping property
		const mappingEntries: Array<[keyof FileTaskPropertyMapping, string]> = [
			["contentProperty", "Content Property"],
			["statusProperty", "Status Property"],
			["completedProperty", "Completed Property"],
			["startDateProperty", "Start Date Property"],
			["dueDateProperty", "Due Date Property"],
			["scheduledDateProperty", "Scheduled Date Property"],
			["completedDateProperty", "Completed Date Property"],
			["createdDateProperty", "Created Date Property"],
			["recurrenceProperty", "Recurrence Property"],
			["tagsProperty", "Tags Property"],
			["projectProperty", "Project Property"],
			["contextProperty", "Context Property"],
			["priorityProperty", "Priority Property"],
		];

		mappingEntries.forEach(([key, label]) => {
			new Setting(contentEl)
				.setName(label)
				.setDesc(`Property name for ${label.toLowerCase()}`)
				.addText((text) =>
					text
						.setPlaceholder("Property name")
						.setValue(this.mapping[key] || "")
						.onChange((value) => {
							if (value.trim()) {
								this.mapping[key] = value.trim();
							} else {
								delete this.mapping[key];
							}
						})
				);
		});

		// Add save and cancel buttons
		const buttonContainer = contentEl.createDiv({
			cls: "tg-modal-button-container modal-button-container",
		});

		const saveButton = buttonContainer.createEl("button", {
			text: "Save",
			cls: "mod-cta",
		});
		saveButton.onclick = () => {
			this.onSave(this.mapping);
			this.close();
		};

		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
		});
		cancelButton.onclick = () => {
			this.close();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
