import { App, Component, setIcon } from "obsidian";
import TaskProgressBarPlugin from "@/index";
import { Task } from "@/types/task";
import { ContentComponent } from "@/components/features/task/view/content";
import { ForecastComponent } from "@/components/features/task/view/forecast";
import { TagsComponent } from "@/components/features/task/view/tags";
import { ProjectsComponent } from "@/components/features/task/view/projects";
import { ReviewComponent } from "@/components/features/task/view/review";
import { Habit } from "@/components/features/habit/habit";
import { CalendarComponent } from "@/components/features/calendar";
import { KanbanComponent } from "@/components/features/kanban/kanban";
import { GanttComponent } from "@/components/features/gantt/gantt";
import { ViewComponentManager } from "@/components/ui/behavior/ViewComponentManager";
import { TaskPropertyTwoColumnView } from "@/components/features/task/view/TaskPropertyTwoColumnView";
import {
	getViewSettingOrDefault,
	TwoColumnSpecificConfig,
} from "@/common/setting-definition";
import { filterTasks } from "@/utils/task/task-filter-utils";
import { RootFilterState } from "@/components/features/task/filter/ViewTaskFilter";
import { QuickCaptureModal } from "@/components/features/quick-capture/modals/QuickCaptureModalWithSwitch";
import { t } from "@/translations/helper";
import { ViewMode } from "../components/FluentTopNavigation";
import { TaskSelectionManager } from "@/components/features/task/selection/TaskSelectionManager";

type ManagedViewComponent = {
	containerEl: HTMLElement;
	setViewMode?: (...args: any[]) => void;
	setTasks?: (...args: any[]) => void;
	updateTasks?: (...args: any[]) => void;
	refreshReviewSettings?: () => void;
};

// View mode configuration for each view type
const VIEW_MODE_CONFIG: Record<string, ViewMode[]> = {
	// Content-based views - support all modes
	inbox: ["list", "tree", "kanban", "calendar"],
	today: ["list", "tree", "kanban", "calendar"],
	upcoming: ["list", "tree", "kanban", "calendar"],
	flagged: ["list", "tree", "kanban", "calendar"],
	// Projects: empty by default (overview mode), but FluentTaskView enables modes when a project is selected
	projects: [],

	// Specialized views with limited or no modes
	tags: [],
	review: [],
	forecast: [],
	habit: [],
	gantt: [],
	calendar: [],
	kanban: [],
};

/**
 * FluentComponentManager - Manages view component lifecycle
 *
 * Responsibilities:
 * - Initialize all view components (Content, Forecast, Tags, Calendar, Kanban, etc.)
 * - Show/hide components based on active view
 * - Switch between views (inbox, today, projects, calendar, etc.)
 * - Render content with different view modes (list, tree, kanban, calendar)
 * - Render loading, error, and empty states
 */
export class FluentComponentManager extends Component {
	// View components
	private contentComponent: ContentComponent;
	private forecastComponent: ForecastComponent;
	private tagsComponent: TagsComponent;
	private projectsComponent: ProjectsComponent;
	private reviewComponent: ReviewComponent;
	private habitComponent: Habit;
	private calendarComponent: CalendarComponent;
	private kanbanComponent: KanbanComponent;
	private ganttComponent: GanttComponent;
	private viewComponentManager: ViewComponentManager;

	// Two column view components
	private twoColumnViewComponents: Map<string, TaskPropertyTwoColumnView> =
		new Map();

	// Legacy containers
	private listContainer: HTMLElement;
	private treeContainer: HTMLElement;

	// Track currently visible component
	private currentVisibleComponent: ManagedViewComponent | null = null;

	// View handlers
	private viewHandlers: {
		onTaskSelected: (task: Task) => void;
		onTaskCompleted: (task: Task) => void;
		onTaskUpdate: (originalTask: Task, updatedTask: Task) => Promise<void>;
		onTaskContextMenu: (event: MouseEvent, task: Task) => void;
		onKanbanTaskStatusUpdate: (
			taskId: string,
			newStatusMark: string,
		) => void;
	};

	constructor(
		private app: App,
		private plugin: TaskProgressBarPlugin,
		private contentArea: HTMLElement,
		private parentView: Component,
		viewHandlers: {
			onTaskSelected: (task: Task) => void;
			onTaskCompleted: (task: Task) => void;
			onTaskUpdate: (
				originalTask: Task,
				updatedTask: Task,
			) => Promise<void>;
			onTaskContextMenu: (event: MouseEvent, task: Task) => void;
			onKanbanTaskStatusUpdate: (
				taskId: string,
				newStatusMark: string,
			) => void;
		},
		private selectionManager?: TaskSelectionManager,
	) {
		super();
		this.viewHandlers = viewHandlers;
	}

	/**
	 * Initialize all view components
	 */
	initializeViewComponents(): void {
		console.log("[FluentComponent] initializeViewComponents started");

		// Initialize ViewComponentManager for special views
		const viewHandlers = {
			onTaskSelected: (task: Task) =>
				this.viewHandlers.onTaskSelected(task),
			onTaskCompleted: (task: Task) =>
				this.viewHandlers.onTaskCompleted(task),
			onTaskUpdate: async (originalTask: Task, updatedTask: Task) => {
				await this.viewHandlers.onTaskUpdate(originalTask, updatedTask);
			},
			onTaskContextMenu: (event: MouseEvent, task: Task) =>
				this.viewHandlers.onTaskContextMenu(event, task),
		};

		this.viewComponentManager = new ViewComponentManager(
			this.parentView,
			this.app,
			this.plugin,
			this.contentArea,
			viewHandlers,
		);
		this.parentView.addChild(this.viewComponentManager);

		// Initialize ContentComponent (handles inbox, today, upcoming, flagged)
		console.log("[FluentComponent] Creating ContentComponent");
		this.contentComponent = new ContentComponent(
			this.contentArea,
			this.app,
			this.plugin,
			{
				onTaskSelected: (task) => {
					if (task) this.viewHandlers.onTaskSelected(task);
				},
				onTaskCompleted: (task) => {
					if (task) this.viewHandlers.onTaskCompleted(task);
				},
				onTaskContextMenu: (event, task) => {
					if (task) this.viewHandlers.onTaskContextMenu(event, task);
				},
				selectionManager: this.selectionManager,
			},
		);
		this.parentView.addChild(this.contentComponent);
		this.contentComponent.load();

		// Initialize ForecastComponent
		this.forecastComponent = new ForecastComponent(
			this.contentArea,
			this.app,
			this.plugin,
			{
				onTaskSelected: (task) => {
					if (task) this.viewHandlers.onTaskSelected(task);
				},
				onTaskCompleted: (task) => {
					if (task) this.viewHandlers.onTaskCompleted(task);
				},
				onTaskUpdate: async (originalTask, updatedTask) => {
					if (originalTask && updatedTask) {
						await this.viewHandlers.onTaskUpdate(
							originalTask,
							updatedTask,
						);
					}
				},
				onTaskContextMenu: (event, task) => {
					if (task) this.viewHandlers.onTaskContextMenu(event, task);
				},
			},
		);
		this.parentView.addChild(this.forecastComponent);
		this.forecastComponent.load();

		// Initialize TagsComponent
		this.tagsComponent = new TagsComponent(
			this.contentArea,
			this.app,
			this.plugin,
			{
				onTaskSelected: (task) => {
					if (task) this.viewHandlers.onTaskSelected(task);
				},
				onTaskCompleted: (task) => {
					if (task) this.viewHandlers.onTaskCompleted(task);
				},
				onTaskUpdate: async (originalTask, updatedTask) => {
					if (originalTask && updatedTask) {
						await this.viewHandlers.onTaskUpdate(
							originalTask,
							updatedTask,
						);
					}
				},
				onTaskContextMenu: (event, task) => {
					if (task) this.viewHandlers.onTaskContextMenu(event, task);
				},
			},
		);
		this.parentView.addChild(this.tagsComponent);
		this.tagsComponent.load();

		// Initialize ProjectsComponent
		this.projectsComponent = new ProjectsComponent(
			this.contentArea,
			this.app,
			this.plugin,
			{
				onTaskSelected: (task) => {
					if (task) this.viewHandlers.onTaskSelected(task);
				},
				onTaskCompleted: (task) => {
					if (task) this.viewHandlers.onTaskCompleted(task);
				},
				onTaskUpdate: async (originalTask, updatedTask) => {
					if (originalTask && updatedTask) {
						await this.viewHandlers.onTaskUpdate(
							originalTask,
							updatedTask,
						);
					}
				},
				onTaskContextMenu: (event, task) => {
					if (task) this.viewHandlers.onTaskContextMenu(event, task);
				},
			},
		);
		this.parentView.addChild(this.projectsComponent);
		this.projectsComponent.load();

		// Initialize ReviewComponent
		this.reviewComponent = new ReviewComponent(
			this.contentArea,
			this.app,
			this.plugin,
			{
				onTaskSelected: (task) => {
					if (task) this.viewHandlers.onTaskSelected(task);
				},
				onTaskCompleted: (task) => {
					if (task) this.viewHandlers.onTaskCompleted(task);
				},
				onTaskUpdate: async (originalTask, updatedTask) => {
					if (originalTask && updatedTask) {
						await this.viewHandlers.onTaskUpdate(
							originalTask,
							updatedTask,
						);
					}
				},
				onTaskContextMenu: (event, task) => {
					if (task) this.viewHandlers.onTaskContextMenu(event, task);
				},
			},
		);
		this.parentView.addChild(this.reviewComponent);
		this.reviewComponent.load();

		// Initialize HabitComponent
		this.habitComponent = new Habit(this.plugin, this.contentArea);
		this.parentView.addChild(this.habitComponent);
		this.habitComponent.load();

		// Initialize CalendarComponent
		this.calendarComponent = new CalendarComponent(
			this.app,
			this.plugin,
			this.contentArea,
			[], // tasks will be set later
			{
				onTaskSelected: (task: Task | null) => {
					if (task) this.viewHandlers.onTaskSelected(task);
				},
				onTaskCompleted: (task: Task) => {
					if (task) this.viewHandlers.onTaskCompleted(task);
				},
				onEventContextMenu: (ev: MouseEvent, event: Task) => {
					if (event) this.viewHandlers.onTaskContextMenu(ev, event);
				},
			},
		);
		this.parentView.addChild(this.calendarComponent);

		// Initialize KanbanComponent
		this.kanbanComponent = new KanbanComponent(
			this.app,
			this.plugin,
			this.contentArea,
			[], // tasks will be set later
			{
				onTaskStatusUpdate: async (taskId, newStatusMark) => {
					this.viewHandlers.onKanbanTaskStatusUpdate(
						taskId,
						newStatusMark,
					);
				},
				onTaskSelected: (task) => {
					if (task) this.viewHandlers.onTaskSelected(task);
				},
				onTaskCompleted: (task) => {
					if (task) this.viewHandlers.onTaskCompleted(task);
				},
				onTaskContextMenu: (event, task) => {
					if (task) this.viewHandlers.onTaskContextMenu(event, task);
				},
			},
		);
		this.parentView.addChild(this.kanbanComponent);

		// Initialize GanttComponent
		this.ganttComponent = new GanttComponent(
			this.plugin,
			this.contentArea,
			{
				onTaskSelected: (task: Task) =>
					this.viewHandlers.onTaskSelected(task),
				onTaskCompleted: (task: Task) =>
					this.viewHandlers.onTaskCompleted(task),
				onTaskContextMenu: (event: MouseEvent, task: Task) =>
					this.viewHandlers.onTaskContextMenu(event, task),
			},
		);
		this.parentView.addChild(this.ganttComponent);
		this.ganttComponent.load();

		// Create legacy containers for backward compatibility
		this.listContainer = this.contentArea.createDiv({
			cls: "task-list-container",
			attr: { style: "display: none;" },
		});

		this.treeContainer = this.contentArea.createDiv({
			cls: "task-tree-container",
			attr: { style: "display: none;" },
		});

		// Hide all components initially
		console.log("[FluentComponent] Hiding all components initially");
		this.hideAllComponents(true);
		console.log("[FluentComponent] initializeViewComponents completed");
	}

	/**
	 * Hide all components
	 */
	hideAllComponents(forceHideAll = false): void {
		const isInitialHide = forceHideAll;

		// Smart hiding - only hide currently visible component (unless initial hide)
		if (!isInitialHide && this.currentVisibleComponent) {
			console.log(
				"[FluentComponent] Smart hide - only hiding current visible component",
			);
			this.currentVisibleComponent.containerEl?.hide();
			this.currentVisibleComponent = null;
		} else {
			// Hide all components
			console.log(
				"[FluentComponent] Hiding all components",
				isInitialHide ? "(initial hide)" : "",
			);
			this.contentComponent?.containerEl.hide();
			this.forecastComponent?.containerEl.hide();
			this.tagsComponent?.containerEl.hide();
			this.projectsComponent?.containerEl.hide();
			this.reviewComponent?.containerEl.hide();
			this.habitComponent?.containerEl.hide();
			this.calendarComponent?.containerEl.hide();
			this.kanbanComponent?.containerEl.hide();
			this.ganttComponent?.containerEl.hide();
			this.viewComponentManager?.hideAllComponents();

			// Hide two column views
			this.twoColumnViewComponents.forEach((component) => {
				component.containerEl.hide();
			});

			// Hide legacy containers
			this.listContainer?.hide();
			this.treeContainer?.hide();
		}
	}

	/**
	 * Switch to a specific view
	 */
	switchView(
		viewId: string,
		tasks: Task[],
		filteredTasks: Task[],
		currentFilterState: RootFilterState | null,
		viewMode: ViewMode,
		project?: string | null,
	): void {
		console.log(
			"[FluentComponent] switchView called with:",
			viewId,
			"viewMode:",
			viewMode,
		);

		// Remove transient overlays (loading/error/empty) before showing components
		if (this.contentArea) {
			this.contentArea
				.querySelectorAll(
					".tg-fluent-loading, .tg-fluent-error-state, .tg-fluent-empty-state",
				)
				.forEach((el) => el.remove());
		}

		// Hide all components first
		console.log("[FluentComponent] Hiding all components");
		this.hideAllComponents();

		// Check if current view supports multiple view modes and we're in a non-list mode
		const viewModes = this.getAvailableModesForView(viewId, project);

		// If the current view mode is not available for this view, reset to first available or list
		if (viewModes.length > 0 && !viewModes.includes(viewMode)) {
			viewMode = viewModes[0];
		}

		if (
			this.isContentBasedView(viewId) &&
			viewModes.length > 0 &&
			viewMode !== "list" &&
			viewMode !== "tree"
		) {
			this.renderContentWithViewMode(
				viewId,
				tasks,
				filteredTasks,
				viewMode,
			);
			return;
		}

		// Get view configuration
		const viewConfig = getViewSettingOrDefault(this.plugin, viewId as any);

		let targetComponent: ManagedViewComponent | null = null;
		let modeForComponent: string = viewId;

		// Handle TwoColumn views
		if (viewConfig.specificConfig?.viewType === "twocolumn") {
			if (!this.twoColumnViewComponents.has(viewId)) {
				const twoColumnConfig =
					viewConfig.specificConfig as TwoColumnSpecificConfig;
				const twoColumnComponent = new TaskPropertyTwoColumnView(
					this.contentArea,
					this.app,
					this.plugin,
					twoColumnConfig,
					viewId,
				);
				this.parentView.addChild(twoColumnComponent);

				// Set up event handlers
				twoColumnComponent.onTaskSelected = (task) =>
					this.viewHandlers.onTaskSelected(task);
				twoColumnComponent.onTaskCompleted = (task) =>
					this.viewHandlers.onTaskCompleted(task);
				twoColumnComponent.onTaskContextMenu = (event, task) =>
					this.viewHandlers.onTaskContextMenu(event, task);

				this.twoColumnViewComponents.set(viewId, twoColumnComponent);
			}

			const twoColumnComponent = this.twoColumnViewComponents.get(viewId);
			if (!twoColumnComponent) {
				console.warn(
					`[FluentComponent] Missing two column component for view ${viewId}`,
				);
				return;
			}
			targetComponent = twoColumnComponent;
		} else {
			// Check special view types
			const specificViewType = viewConfig.specificConfig?.viewType;

			// Check if it's a special view managed by ViewComponentManager
			if (this.viewComponentManager.isSpecialView(viewId)) {
				targetComponent = this.viewComponentManager.showComponent(
					viewId,
				) as ManagedViewComponent | null;
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
						// Two modes for projects view:
						// 1. With project selection (from ProjectList) → use ContentComponent for filtered tasks
						// 2. Without project selection (from view navigation) → use ProjectsComponent for overview
						if (project) {
							console.log(
								"[FluentComponent] Projects view with selected project - using ContentComponent",
							);
							targetComponent = this.contentComponent;
							modeForComponent = viewId;
						} else {
							console.log(
								"[FluentComponent] Projects view without selection - using ProjectsComponent",
							);
							targetComponent = this.projectsComponent;
							modeForComponent = viewId;
						}
						break;
					case "review":
						targetComponent = this.reviewComponent;
						break;
					case "calendar":
						targetComponent = this.calendarComponent;
						break;
					case "kanban":
						targetComponent = this.kanbanComponent;
						break;
					case "gantt":
						targetComponent = this.ganttComponent;
						break;
					case "inbox":
					case "today":
					case "upcoming":
					case "flagged":
					default:
						// These are handled by ContentComponent
						targetComponent = this.contentComponent;
						modeForComponent = viewId;
						break;
				}
			}
		}

		console.log(
			"[FluentComponent] Target component determined:",
			targetComponent?.constructor?.name,
		);

		if (targetComponent) {
			console.log(
				`[FluentComponent] Activating component for view ${viewId}:`,
				targetComponent.constructor.name,
			);
			targetComponent.containerEl.show();
			this.currentVisibleComponent = targetComponent;

			// Set view mode first for ContentComponent
			if (typeof targetComponent.setViewMode === "function") {
				console.log(
					`[FluentComponent] Setting view mode for ${viewId} to ${modeForComponent}`,
				);
				targetComponent.setViewMode(modeForComponent as any, project);
			}

			// Set tasks on the component
			if (typeof targetComponent.setTasks === "function") {
				// Special handling for components that need only all tasks (single parameter)
				// Review and tags views need all tasks to build their indices
				if (viewId === "review" || viewId === "tags") {
					console.log(
						`[FluentComponent] Calling setTasks for ${viewId} with ALL tasks:`,
						tasks.length,
					);
					targetComponent.setTasks(tasks);
				} else if (viewId === "projects" && !project) {
					// Projects overview mode: pass ALL tasks to build project index
					// and FILTERED tasks to apply filter to project task lists
					// This ensures: left sidebar shows all projects, right panel shows filtered tasks
					console.log(
						`[FluentComponent] Calling setTasks for projects with ALL tasks (${tasks.length}) and FILTERED tasks (${filteredTasks.length})`,
					);
					targetComponent.setTasks(tasks, filteredTasks);
				} else {
					// Use filtered tasks
					let filteredTasksLocal = [...filteredTasks];
					// Forecast view: remove badge-only items
					if (viewId === "forecast") {
						filteredTasksLocal = filteredTasksLocal.filter(
							(task) => !(task as any).badge,
						);
					}
					console.log(
						"[FluentComponent] Calling setTasks with filtered:",
						filteredTasksLocal.length,
						"all:",
						tasks.length,
					);
					targetComponent.setTasks(filteredTasksLocal, tasks);
				}
			}

			// Handle updateTasks method for table view adapter
			if (typeof targetComponent.updateTasks === "function") {
				const filterOptions: any = {};
				if (
					currentFilterState &&
					currentFilterState.filterGroups &&
					currentFilterState.filterGroups.length > 0
				) {
					filterOptions.advancedFilter = currentFilterState;
				}

				targetComponent.updateTasks(
					filterTasks(
						tasks,
						viewId as any,
						this.plugin,
						filterOptions,
					),
				);
			}

			// Refresh review settings if needed
			if (
				viewId === "review" &&
				typeof targetComponent.refreshReviewSettings === "function"
			) {
				targetComponent.refreshReviewSettings();
			}
		} else {
			console.warn(
				`[FluentComponent] No target component found for viewId: ${viewId}`,
			);
		}
	}

	/**
	 * Render content with specific view mode (list/tree/kanban/calendar)
	 */
	renderContentWithViewMode(
		viewId: string,
		tasks: Task[],
		filteredTasks: Task[],
		viewMode: ViewMode,
	): void {
		console.log(
			"[FluentComponent] renderContentWithViewMode called, viewMode:",
			viewMode,
		);

		// Hide current component
		this.hideAllComponents();

		// Based on the current view mode, show the appropriate component
		switch (viewMode) {
			case "list":
			case "tree":
				// Use ContentComponent for list and tree views
				if (!this.contentComponent) return;

				this.contentComponent.containerEl.show();
				this.contentComponent.setViewMode(viewId as any);
				this.contentComponent.setIsTreeView(viewMode === "tree");

				console.log(
					"[FluentComponent] Setting tasks to ContentComponent, filtered:",
					filteredTasks.length,
				);
				this.contentComponent.setTasks(filteredTasks, tasks);
				this.currentVisibleComponent = this.contentComponent;
				break;

			case "kanban":
				// Use KanbanComponent
				if (!this.kanbanComponent) return;

				this.kanbanComponent.containerEl.show();

				console.log(
					"[FluentComponent] Setting",
					filteredTasks.length,
					"tasks to kanban",
				);
				this.kanbanComponent.setTasks(filteredTasks);
				this.currentVisibleComponent = this.kanbanComponent;
				break;

			case "calendar":
				// Use CalendarComponent
				console.log(
					"[FluentComponent] Calendar mode in renderContentWithViewMode",
				);
				if (!this.calendarComponent) {
					console.log(
						"[FluentComponent] No calendar component available!",
					);
					return;
				}

				console.log("[FluentComponent] Showing calendar component");
				this.calendarComponent.containerEl.show();

				console.log(
					"[FluentComponent] Setting",
					filteredTasks.length,
					"tasks to calendar",
				);
				this.calendarComponent.setTasks(filteredTasks);
				this.currentVisibleComponent = this.calendarComponent;
				console.log("[FluentComponent] Calendar mode setup complete");
				break;
		}
	}

	/**
	 * Refresh current view data without full re-render
	 */
	refreshCurrentViewData(
		viewId: string,
		tasks: Task[],
		filteredTasks: Task[],
		viewMode: ViewMode,
	): void {
		// Content-based views (list/tree/kanban/calendar)
		if (this.isContentBasedView(viewId)) {
			switch (viewMode) {
				case "kanban":
					this.kanbanComponent?.setTasks?.(filteredTasks);
					break;
				case "calendar":
					this.calendarComponent?.setTasks?.(filteredTasks);
					break;
				case "tree":
				case "list":
				default:
					this.contentComponent?.setTasks?.(
						filteredTasks,
						tasks,
						true,
					);
					break;
			}
			return;
		}

		// Special/other views
		if (this.viewComponentManager?.isSpecialView(viewId)) {
			const comp: any = (
				this.viewComponentManager as any
			).getOrCreateComponent(viewId);
			if (comp?.updateTasks) {
				comp.updateTasks(filteredTasks);
			} else if (comp?.setTasks) {
				comp.setTasks(filteredTasks, tasks);
			}
			return;
		}

		// Direct known components fallback
		const mapping: Record<string, any> = {
			forecast: this.forecastComponent,
			tags: this.tagsComponent,
			projects: this.contentComponent,
			review: this.reviewComponent,
			habit: this.habitComponent,
			gantt: this.ganttComponent,
			kanban: this.kanbanComponent,
			calendar: this.calendarComponent,
		};

		const target: any = (mapping as any)[viewId];
		if (target?.setTasks) {
			if (viewId === "projects" || this.isContentBasedView(viewId)) {
				target.setTasks(filteredTasks, tasks, true);
			} else if (viewId === "review" || viewId === "tags") {
				target.setTasks(tasks);
			} else {
				target.setTasks(filteredTasks);
			}
		} else if (target?.updateTasks) {
			target.updateTasks(filteredTasks);
		}
	}

	/**
	 * Render loading state
	 */
	renderLoadingState(): void {
		console.log("[FluentComponent] renderLoadingState called");
		if (this.contentArea) {
			// Remove existing loading overlays
			this.contentArea
				.querySelectorAll(".tg-fluent-loading")
				.forEach((el) => el.remove());

			const loadingEl = this.contentArea.createDiv({
				cls: "tg-fluent-loading",
			});
			loadingEl.createDiv({ cls: "tg-fluent-spinner" });
			loadingEl.createDiv({
				cls: "tg-fluent-loading-text",
				text: t("Loading tasks..."),
			});
		}
	}

	/**
	 * Render error state
	 */
	renderErrorState(errorMessage: string, onRetry: () => void): void {
		if (this.contentArea) {
			this.contentArea
				.querySelectorAll(".tg-fluent-error-state")
				.forEach((el) => el.remove());

			const errorEl = this.contentArea.createDiv({
				cls: "tg-fluent-error-state",
			});
			const errorIcon = errorEl.createDiv({
				cls: "tg-fluent-error-icon",
			});
			setIcon(errorIcon, "alert-triangle");

			errorEl.createDiv({
				cls: "tg-fluent-error-title",
				text: t("Failed to load tasks"),
			});

			errorEl.createDiv({
				cls: "tg-fluent-error-message",
				text: errorMessage || t("An unexpected error occurred"),
			});

			const retryBtn = errorEl.createEl("button", {
				cls: "tg-fluent-button tg-fluent-button-primary",
				text: t("Retry"),
			});

			retryBtn.addEventListener("click", onRetry);
		}
	}

	/**
	 * Render empty state
	 */
	renderEmptyState(): void {
		if (this.contentArea) {
			this.contentArea
				.querySelectorAll(".tg-fluent-empty-state")
				.forEach((el) => el.remove());

			const emptyEl = this.contentArea.createDiv({
				cls: "tg-fluent-empty-state",
			});
			const emptyIcon = emptyEl.createDiv({
				cls: "tg-fluent-empty-icon",
			});
			setIcon(emptyIcon, "inbox");

			emptyEl.createDiv({
				cls: "tg-fluent-empty-title",
				text: t("No tasks yet"),
			});

			emptyEl.createDiv({
				cls: "tg-fluent-empty-description",
				text: t(
					"Create your first task to get started with Task Genius",
				),
			});

			const createBtn = emptyEl.createEl("button", {
				cls: "tg-fluent-button tg-fluent-button-primary",
				text: t("Create Task"),
			});

			createBtn.addEventListener("click", () => {
				new QuickCaptureModal(this.app, this.plugin).open();
			});
		}
	}

	/**
	 * Check if view is content-based (supports multiple view modes)
	 */
	private isContentBasedView(viewId: string): boolean {
		const contentBasedViews = [
			"inbox",
			"today",
			"upcoming",
			"flagged",
			"projects",
		];
		return contentBasedViews.includes(viewId);
	}

	/**
	 * Get available view modes for a specific view
	 */
	getAvailableModesForView(
		viewId: string,
		selectedProject?: string | null,
	): ViewMode[] {
		// Check for special two-column views
		const viewConfig = getViewSettingOrDefault(
			this.plugin,
			viewId as ViewMode,
		);
		if (viewConfig?.specificConfig?.viewType === "twocolumn") {
			return [];
		}

		// Check for special views managed by ViewComponentManager
		if (this.viewComponentManager?.isSpecialView(viewId)) {
			return [];
		}

		// Special handling for projects view
		// When a project is selected, enable all view modes (uses ContentComponent)
		if (viewId === "projects" && selectedProject) {
			return ["list", "tree", "kanban", "calendar"];
		}

		// Return the configured modes for the view, or empty array
		return VIEW_MODE_CONFIG[viewId] || [];
	}

	/**
	 * Clean up on unload
	 */
	onunload(): void {
		// Components will be cleaned up by parent Component lifecycle
		super.onunload();
	}
}
