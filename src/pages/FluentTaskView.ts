import { ItemView, Scope, WorkspaceLeaf } from "obsidian";
import TaskProgressBarPlugin from "@/index";
import { Task } from "@/types/task";
import "@/styles/fluent/fluent-main.css";
import "@/styles/fluent/fluent-secondary.css";
import "@/styles/fluent/fluent-content-header.css";
import "@/styles/fluent/fluent-project-popover.css";
import {
	TopNavigation,
	ViewMode,
} from "@/components/features/fluent/components/FluentTopNavigation";
import { FluentTaskViewState } from "@/types/fluent-types";
import {
	onWorkspaceSwitched,
	onWorkspaceOverridesSaved,
	onSidebarSelectionChanged,
} from "@/components/features/fluent/events/ui-event";
import { Events, on } from "@/dataflow/events/Events";
import { RootFilterState } from "@/components/features/task/filter/ViewTaskFilter";
import { Platform } from "obsidian";
import { t } from "@/translations/helper";
import { getInitialViewMode, saveViewMode } from "@/utils/ui/view-mode-utils";

// Import managers
import { FluentDataManager } from "@/components/features/fluent/managers/FluentDataManager";
import { FluentLayoutManager } from "@/components/features/fluent/managers/FluentLayoutManager";
import { FluentComponentManager } from "@/components/features/fluent/managers/FluentComponentManager";
import { FluentGestureManager } from "@/components/features/fluent/managers/FluentGestureManager";
import { FluentWorkspaceStateManager } from "@/components/features/fluent/managers/FluentWorkspaceStateManager";
import { FluentActionHandlers } from "@/components/features/fluent/managers/FluentActionHandlers";
import { TaskSelectionManager } from "@/components/features/task/selection/TaskSelectionManager";

export const FLUENT_TASK_VIEW = "fluent-task-genius-view";

/**
 * TaskViewfluent - Main view coordinator with centralized state management
 *
 * This class is the single source of truth for all state:
 * - tasks: All loaded tasks
 * - filteredTasks: Filtered tasks for current view
 * - currentViewId: Active view (inbox, today, projects, etc.)
 * - viewState: UI state (searchQuery, filters, viewMode, etc.)
 * - selectedTask: Currently selected task
 *
 * Managers are stateless executors that receive state and return results via callbacks.
 * State flows: Manager executes → Callback → TaskViewfluent updates state → Notifies other managers
 */
export class FluentTaskView extends ItemView {
	private plugin: TaskProgressBarPlugin;

	// ====================
	// DEBUG CONFIGURATION
	// ====================
	// Set to false in production to reduce console output
	private readonly DEBUG_MODE = false;

	// ====================
	// MANAGERS (added via addChild for lifecycle management)
	// ====================
	private dataManager: FluentDataManager;
	private layoutManager: FluentLayoutManager;
	private componentManager: FluentComponentManager;
	private gestureManager: FluentGestureManager;
	private workspaceStateManager: FluentWorkspaceStateManager;
	private actionHandlers: FluentActionHandlers;
	private selectionManager: TaskSelectionManager;

	// ====================
	// CENTRALIZED STATE - Single source of truth
	// ====================

	// Data state
	private tasks: Task[] = [];
	private filteredTasks: Task[] = [];
	private isLoading = false;
	private loadError: string | null = null;

	// View state
	private currentViewId = "inbox";
	private viewState: FluentTaskViewState = {
		currentWorkspace: "",
		viewMode: "list",
		viewModeByViewId: {},
		searchQuery: "",
		filters: {},
		filterInputValue: "",
		selectedProject: undefined,
	};

	// Filter state
	private currentFilterState: RootFilterState | null = null;
	private liveFilterState: RootFilterState | null = null;

	// Selection state
	private selectedTask: Task | null = null;

	// Workspace state
	private workspaceId = "";

	// Initialization state
	private isInitializing = true;

	// ====================
	// UI ELEMENTS
	// ====================
	private rootContainerEl: HTMLElement;
	private topNavigation: TopNavigation;
	private contentArea: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: TaskProgressBarPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.tasks = this.plugin.preloadedTasks || [];

		// Initialize workspace ID
		this.workspaceId =
			plugin.workspaceManager?.getActiveWorkspace().id || "";
		this.viewState.currentWorkspace = this.workspaceId;
	}

	getViewType(): string {
		return FLUENT_TASK_VIEW;
	}

	getDisplayText(): string {
		return t("Task Genius");
	}

	getIcon(): string {
		return "layout-dashboard";
	}

	/**
	 * Check if using workspace side leaves mode
	 */
	private useSideLeaves(): boolean {
		return !!this.plugin.settings.fluentView?.useWorkspaceSideLeaves;
	}

	private ensureViewModeForView(viewId: string): ViewMode {
		const availableModes =
			this.componentManager?.getAvailableModesForView(viewId) ?? [];
		const storedMode = this.viewState.viewModeByViewId?.[viewId];

		const pickFallback = (): ViewMode => {
			if (availableModes.length === 0) {
				return storedMode ?? "list";
			}
			if (availableModes.includes("list")) {
				return "list";
			}
			return availableModes[0];
		};

		if (storedMode) {
			if (
				availableModes.length === 0 ||
				availableModes.includes(storedMode)
			) {
				return storedMode;
			}
		}

		if (
			availableModes.includes("tree") ||
			availableModes.includes("list")
		) {
			const prefersTree = getInitialViewMode(
				this.app,
				this.plugin,
				viewId,
			);
			if (prefersTree && availableModes.includes("tree")) {
				return "tree";
			}
			if (availableModes.includes("list")) {
				return "list";
			}
		}

		return pickFallback();
	}

	private recordViewModeForView(viewId: string, mode: ViewMode): void {
		if (!this.viewState.viewModeByViewId) {
			this.viewState.viewModeByViewId = {};
		}

		const availableModes =
			this.componentManager?.getAvailableModesForView(viewId);
		if (
			availableModes &&
			availableModes.length > 0 &&
			!availableModes.includes(mode)
		) {
			return;
		}

		this.viewState.viewModeByViewId[viewId] = mode;
	}

	/**
	 * Main initialization method
	 */
	async onOpen() {
		console.log("[TG] onOpen started");
		this.isInitializing = true;

		try {
			// ====================
			// PHASE 1-4: UI Setup, Managers, Structure, Events
			// ====================
			if (this.DEBUG_MODE) {
				console.log(
					"[TG] Initializing UI, managers, structure, and events...",
				);
			}

			this.contentEl.empty();
			this.contentEl.toggleClass(
				["task-genius-fluent-view", "task-genius-view"],
				true,
			);

			// Create root container (use exact same class as original)
			this.rootContainerEl = this.contentEl.createDiv({
				cls: "tg-fluent-container",
			});

			// Add mobile class for proper styling
			if (Platform.isPhone) {
				this.rootContainerEl.addClass("is-mobile");
			}

			// Initialize managers first (before UI)
			this.initializeManagers();

			// Build UI structure
			await this.buildUIStructure();

			// Subscribe to workspace and global events
			this.registerEvents();

			if (this.DEBUG_MODE) {
				console.log(
					"[TG] ✅ UI, managers, structure, and events initialized",
				);
			}

			// ====================
			// PHASE 5: Restore Workspace State
			// ====================
			if (this.DEBUG_MODE) {
				console.log("[TG] Restoring workspace state...");
			}

			const savedWorkspaceId =
				this.workspaceStateManager.getSavedWorkspaceId();
			if (savedWorkspaceId && savedWorkspaceId !== this.workspaceId) {
				this.workspaceId = savedWorkspaceId;
				this.viewState.currentWorkspace = savedWorkspaceId;
				if (this.DEBUG_MODE) {
					console.log(
						`[TG] Restored workspace ID: ${savedWorkspaceId}`,
					);
				}
			}

			// Apply workspace settings and restore filter state
			await this.workspaceStateManager.applyWorkspaceSettings();
			const restored =
				this.workspaceStateManager.restoreFilterStateFromWorkspace();
			if (restored?.activeViewId) {
				this.currentViewId = restored.activeViewId;
			}
			this.workspaceStateManager.syncFilterState(restored, {
				setLiveFilterState: (state) => {
					this.liveFilterState = state;
					this.app.saveLocalStorage(
						"task-genius-view-filter",
						state || null,
					);
				},
				setCurrentFilterState: (state) => {
					this.currentFilterState = state;
				},
				setViewPreferences: ({
					filters,
					selectedProject,
					viewMode,
					clearSearch,
				}) => {
					this.viewState.filters = filters;
					this.viewState.selectedProject = selectedProject;
					const normalizedMode = (() => {
						const availableModes =
							this.componentManager?.getAvailableModesForView(
								this.currentViewId,
							) ?? [];
						if (
							availableModes.length > 0 &&
							!availableModes.includes(viewMode)
						) {
							return this.ensureViewModeForView(
								this.currentViewId,
							);
						}
						return viewMode;
					})();
					this.viewState.viewMode = normalizedMode;
					this.recordViewModeForView(
						this.currentViewId,
						normalizedMode,
					);
					this.topNavigation?.setViewMode(normalizedMode);
					if (clearSearch) {
						this.viewState.searchQuery = "";
						this.viewState.filterInputValue = "";
					}
				},
				onAfterSync: () => {
					this.layoutManager?.updateActionButtons();
				},
			});

			// ====================
			// PHASE 6: Load Data (KEY PHASE)
			// ====================
			console.log("[TG] Loading tasks...");
			await this.dataManager.loadTasks(false); // Will trigger onTasksLoaded callback
			await this.dataManager.registerDataflowListeners();
			console.log(
				`[TG] ✅ Loaded ${this.tasks.length} tasks, ${this.filteredTasks.length} after filters`,
			);

			// ====================
			// PHASE 7-8: Initial Render & Responsive Adjustments
			// ====================
			// Initial render (will be skipped due to isInitializing)
			this.updateView();

			// Check window size and auto-collapse sidebar if needed
			if (this.DEBUG_MODE) {
				console.log("[TG] Checking sidebar collapse...");
			}
			this.layoutManager.checkAndCollapseSidebar();
		} catch (error) {
			console.error("[TG] ❌ Initialization error:", error);
			console.error("[TG] Error stack:", (error as Error).stack);
			this.loadError =
				(error as Error).message || "Failed to initialize view";
		} finally {
			// ====================
			// PHASE 9: Finalization (CRITICAL - Always Executes)
			// ====================
			if (this.DEBUG_MODE) {
				console.log(
					`[TG] Finalizing (isInitializing was ${this.isInitializing})`,
				);
			}

			this.isInitializing = false;

			if (this.DEBUG_MODE) {
				console.log("[TG] Calling final updateView()...");
			}
			this.updateView();
			console.log("[TG] ✅ Initialization complete");
		}
	}

	/**
	 * Initialize all managers with callbacks
	 */
	private initializeManagers() {
		// 1. FluentDataManager - Data loading and filtering
		this.dataManager = new FluentDataManager(
			this.plugin,
			() => this.currentViewId,
			() => ({
				liveFilterState: this.liveFilterState,
				currentFilterState: this.currentFilterState,
				viewStateFilters: this.viewState.filters,
				selectedProject: this.viewState.selectedProject || undefined,
				searchQuery: this.viewState.searchQuery || "",
				filterInputValue: this.viewState.filterInputValue || "",
			}),
			() => this.isInitializing,
		);
		this.dataManager.setCallbacks({
			onTasksLoaded: (tasks, error) => {
				if (error) {
					this.loadError = error;
					this.isLoading = false;
					this.componentManager?.renderErrorState(error, () => {
						this.dataManager.loadTasks();
					});
				} else {
					this.tasks = tasks;
					this.loadError = null;
					this.isLoading = false;
					// Apply filters immediately after loading
					this.filteredTasks = this.dataManager.applyFilters(
						this.tasks,
					);
					this.updateView();
				}
			},
			onLoadingStateChanged: (isLoading) => {
				this.isLoading = isLoading;
				if (isLoading && !this.isInitializing) {
					this.componentManager?.renderLoadingState();
				}
			},
			onUpdateNeeded: (source) => {
				console.log(`[TG] Update needed from source: ${source}`);
				// Re-apply filters and update view
				this.filteredTasks = this.dataManager.applyFilters(this.tasks);
				this.updateView();
			},
		});
		this.addChild(this.dataManager);

		// 2. FluentActionHandlers - User actions
		this.actionHandlers = new FluentActionHandlers(
			this.app,
			this.plugin,
			() => this.workspaceId,
			() => this.useSideLeaves(),
		);
		this.actionHandlers.setCallbacks({
			onTaskSelectionChanged: (task) => {
				this.selectedTask = task;
				if (task) {
					this.layoutManager.showTaskDetails(task);
				}
			},
			onTaskUpdated: (taskId, updatedTask) => {
				// Update task in cache
				const index = this.tasks.findIndex((t) => t.id === taskId);
				if (index !== -1) {
					this.tasks[index] = updatedTask;
					// Re-apply filters
					this.filteredTasks = this.dataManager.applyFilters(
						this.tasks,
					);
					this.updateView();
				}
			},
			onTaskDeleted: (taskId, deleteChildren) => {
				// Remove task from cache
				if (deleteChildren) {
					// Remove task and all children recursively
					const toRemove = new Set<string>([taskId]);
					const findChildren = (id: string) => {
						const task = this.tasks.find((t) => t.id === id);
						if (task?.metadata?.children) {
							for (const childId of task.metadata.children) {
								toRemove.add(childId);
								findChildren(childId);
							}
						}
					};
					findChildren(taskId);
					this.tasks = this.tasks.filter((t) => !toRemove.has(t.id));
				} else {
					this.tasks = this.tasks.filter((t) => t.id !== taskId);
				}
				// Re-apply filters
				this.filteredTasks = this.dataManager.applyFilters(this.tasks);
				this.updateView();
			},
			onNavigateToView: (viewId) => {
				this.recordViewModeForView(
					this.currentViewId,
					this.viewState.viewMode,
				);
				this.currentViewId = viewId;

				// When navigating to projects view directly, clear project selection
				// This enables the full project overview mode
				if (viewId === "projects") {
					console.log("[TG] Navigating to projects overview - clearing project selection");
					this.viewState.selectedProject = undefined;

					// Clear project filter from filter state
					try {
						if (this.liveFilterState) {
							const nextState = { ...this.liveFilterState };
							nextState.filterGroups = (nextState.filterGroups || [])
								.map((g: any) => ({
									...g,
									filters: (g.filters || []).filter(
										(f: any) => f.property !== "project",
									),
								}))
								.filter((g: any) => g.filters && g.filters.length > 0);

							this.liveFilterState = nextState as any;
							this.currentFilterState = nextState as any;
							this.app.saveLocalStorage(
								"task-genius-view-filter",
								nextState,
							);

							// Broadcast filter change
							this.app.workspace.trigger(
								"task-genius:filter-changed",
								nextState,
							);
						}
					} catch (e) {
						console.warn("[TG] Failed to clear project filter", e);
					}
				}

				const nextMode = this.ensureViewModeForView(viewId);
				this.viewState.viewMode = nextMode;
				this.recordViewModeForView(viewId, nextMode);
				this.topNavigation?.setViewMode(nextMode);
				this.updateView();
			},
			onSearchQueryChanged: (query) => {
				this.viewState.searchQuery = query;
				this.viewState.filterInputValue = query;
				// Re-apply filters
				this.filteredTasks = this.dataManager.applyFilters(this.tasks);
				this.updateView();
			},
			onProjectSelected: (projectId) => {
				console.log(`[TG] Project selected: ${projectId}`);
				this.viewState.selectedProject = projectId;

				// Switch to projects view
				this.recordViewModeForView(
					this.currentViewId,
					this.viewState.viewMode,
				);
				this.currentViewId = "projects";
				const projectsViewMode = this.ensureViewModeForView(
					this.currentViewId,
				);
				this.viewState.viewMode = projectsViewMode;
				this.recordViewModeForView(
					this.currentViewId,
					projectsViewMode,
				);
				this.topNavigation?.setViewMode(projectsViewMode);

				// Reflect selection into the Filter UI state so the top Filter button shows active and can be reset via "X"
				try {
					const timestamp = Date.now();
					const nextState = this.liveFilterState || {
						rootCondition: "all",
						filterGroups: [],
					};

					// Remove any existing project filters and empty groups to avoid duplicates
					nextState.filterGroups = (nextState.filterGroups || [])
						.map((g: any) => ({
							...g,
							filters: (g.filters || []).filter(
								(f: any) => f.property !== "project",
							),
						}))
						.filter((g: any) => g.filters && g.filters.length > 0); // Remove empty groups

					// Only add project filter if projectId is not empty
					if (projectId && projectId.trim() !== "") {
						// Append a dedicated group for project filter to enforce AND semantics
						nextState.filterGroups.push({
							id: `fluent-proj-group-${timestamp}`,
							groupCondition: "all",
							filters: [
								{
									id: `fluent-proj-filter-${timestamp}`,
									property: "project",
									condition: "is",
									value: projectId,
								},
							],
						});
					}

					this.liveFilterState = nextState as any;
					this.currentFilterState = nextState as any;
					this.app.saveLocalStorage(
						"task-genius-view-filter",
						nextState,
					);

					// Broadcast so any open filter UI reacts and header button shows reset
					// The filter-changed event listener will handle applyFilters and updateView
					this.app.workspace.trigger(
						"task-genius:filter-changed",
						nextState,
					);
				} catch (e) {
					console.warn(
						"[TG] Failed to project-sync filter UI state",
						e,
					);
					// If filter sync fails, still update the view
					this.filteredTasks = this.dataManager.applyFilters(
						this.tasks,
					);
					this.updateView();
				}
			},
			onViewModeChanged: (mode) => {
				this.viewState.viewMode = mode;
				this.recordViewModeForView(this.currentViewId, mode);
				if (mode === "list" || mode === "tree") {
					saveViewMode(this.app, this.currentViewId, mode === "tree");
				}
				this.updateView();
				// Save to workspace
				this.workspaceStateManager.saveFilterStateToWorkspace();
			},
			showDetailsPanel: (task) => {
				this.layoutManager.showTaskDetails(task);
			},
			toggleDetailsVisibility: (visible) => {
				this.layoutManager.toggleDetailsVisibility(visible);
			},
			getIsDetailsVisible: () => this.layoutManager.isDetailsVisible,
		});
		this.addChild(this.actionHandlers);

		// 3. FluentWorkspaceStateManager - State persistence
		this.workspaceStateManager = new FluentWorkspaceStateManager(
			this.app,
			this.plugin,
			() => this.workspaceId,
			() => this.currentViewId,
			() => ({
				filters: this.viewState.filters || {},
				selectedProject: this.viewState.selectedProject || undefined,
				searchQuery: this.viewState.searchQuery || "",
				viewMode: this.viewState.viewMode,
			}),
			() => this.currentFilterState,
			() => this.liveFilterState,
		);
		this.addChild(this.workspaceStateManager);

		// 4. TaskSelectionManager - Multi-selection and bulk operations
		this.selectionManager = new TaskSelectionManager(
			this.app,
			this.plugin,
			this,
		);
		this.addChild(this.selectionManager);

		this.scope = new Scope(this.app.scope);
		this.scope.register(null, "Escape", () => {
			this.selectionManager.clearSelection();
		});

		console.log("[TG] Managers initialized");
	}

	/**
	 * Build UI structure - MUST match original DOM structure for CSS
	 */
	private async buildUIStructure() {
		console.log("[TG] Building UI structure");

		// Create layout structure (exact same as original)
		const layoutContainer = this.rootContainerEl.createDiv({
			cls: "tg-fluent-layout",
		});

		// Sidebar
		const sidebarEl = layoutContainer.createDiv({
			cls: "tg-fluent-sidebar-container",
		});

		// Add mobile-specific classes and overlay
		if (Platform.isPhone) {
			sidebarEl.addClass("is-mobile-drawer");
		}

		// Main content container (IMPORTANT: this was missing!)
		const mainContainer = layoutContainer.createDiv({
			cls: "tg-fluent-main-container",
		});

		// Top navigation
		const topNavEl = mainContainer.createDiv({
			cls: "tg-fluent-top-nav",
		});

		// Content wrapper (IMPORTANT: this was missing!)
		const contentWrapper = mainContainer.createDiv({
			cls: "tg-fluent-content-wrapper",
		});

		// Actual content area
		this.contentArea = contentWrapper.createDiv({
			cls: "tg-fluent-content",
		});

		// Decide whether to use separate workspace side leaves
		const useWorkspaceSideLeaves = this.useSideLeaves();

		// Initialize FluentLayoutManager
		// Note: headerEl and titleEl are provided by Obsidian's ItemView
		this.layoutManager = new FluentLayoutManager(
			this.app,
			this.plugin,
			this,
			this.rootContainerEl,
			this.headerEl, // Obsidian's view header
			this.titleEl, // Obsidian's view title element
			() => this.filteredTasks.length,
		);
		this.layoutManager.setOnSidebarNavigate((viewId) => {
			this.actionHandlers.handleNavigate(viewId);
		});
		this.layoutManager.setOnProjectSelect((projectId) => {
			this.actionHandlers.handleProjectSelect(projectId);
		});
		this.layoutManager.setTaskCallbacks({
			onTaskToggleComplete: (task) => {
				this.actionHandlers.toggleTaskCompletion(task);
			},
			onTaskEdit: (task) => {
				this.actionHandlers.handleTaskSelection(task);
			},
			onTaskUpdate: async (originalTask, updatedTask) => {
				await this.actionHandlers.handleTaskUpdate(
					originalTask,
					updatedTask,
				);
			},
		});
		this.addChild(this.layoutManager);

		if (!useWorkspaceSideLeaves) {
			// Initialize details component (non-leaves mode only)
			this.layoutManager.initializeDetailsComponent();

			// Initialize sidebar (non-leaves mode only)
			this.layoutManager.initializeSidebar(sidebarEl);

			// Setup drawer overlay for mobile
			if (Platform.isPhone) {
				this.layoutManager.setupDrawerOverlay(layoutContainer);
			}
		} else {
			sidebarEl.hide();
			console.log(
				"[TG] Using workspace side leaves: skip in-view sidebar",
			);
		}

		// Create top navigation
		console.log("[TG] Initializing top navigation");
		this.topNavigation = new TopNavigation(
			topNavEl,
			this.plugin,
			(query: string) => this.actionHandlers.handleSearch(query),
			(mode: ViewMode) => this.actionHandlers.handleViewModeChange(mode),
			() => {
				// Filter click - open filter modal/popover
				// TODO: Implement filter modal
			},
			() => {
				// Sort click
				// TODO: Implement sort
			},
			() => this.actionHandlers.handleSettingsClick(),
		);
		this.addChild(this.topNavigation);

		// Initialize view components
		console.log("[TG] Initializing view components");
		this.componentManager = new FluentComponentManager(
			this.app,
			this.plugin,
			this.contentArea,
			this, // parent view
			{
				onTaskSelected: (task) => {
					this.actionHandlers.handleTaskSelection(task);
				},
				onTaskCompleted: (task) => {
					this.actionHandlers.toggleTaskCompletion(task);
				},
				onTaskUpdate: async (originalTask, updatedTask) => {
					await this.actionHandlers.handleTaskUpdate(
						originalTask,
						updatedTask,
					);
				},
				onTaskContextMenu: (event, task) => {
					this.actionHandlers.handleTaskContextMenu(event, task);
				},
				onKanbanTaskStatusUpdate: (taskId, newStatusMark) => {
					const task = this.tasks.find((t) => t.id === taskId);
					if (task) {
						this.actionHandlers.handleKanbanTaskStatusUpdate(
							task,
							newStatusMark,
						);
					}
				},
			},
			this.selectionManager,
		);
		this.addChild(this.componentManager);
		this.componentManager.initializeViewComponents();

		// Sidebar toggle in header and responsive collapse
		console.log("[TG] Creating sidebar toggle");
		this.layoutManager.createSidebarToggle();

		// Create task count mark
		this.layoutManager.createTaskMark();

		// Initialize FluentGestureManager for mobile gestures
		this.gestureManager = new FluentGestureManager(this.rootContainerEl);
		this.gestureManager.setDrawerCallbacks({
			onOpenDrawer: () => this.layoutManager.openMobileDrawer(),
			onCloseDrawer: () => this.layoutManager.closeMobileDrawer(),
			getIsMobileDrawerOpen: () => this.layoutManager.isMobileDrawerOpen,
		});
		this.gestureManager.initializeMobileSwipeGestures();
		this.addChild(this.gestureManager);

		// Set up filter callbacks for action buttons
		this.layoutManager.setFilterCallbacks({
			onFilterReset: () => this.resetCurrentFilter(),
			getLiveFilterState: () => this.liveFilterState,
		});

		// Create action buttons in Obsidian view header
		console.log("[TG] Creating action buttons");
		this.layoutManager.createActionButtons();

		console.log("[TG] UI structure built");
	}

	/**
	 * Register workspace and global events
	 */
	private registerEvents() {
		// Workspace switch event
		if (this.plugin.workspaceManager) {
			this.registerEvent(
				onWorkspaceSwitched(this.app, async (payload) => {
					if (payload.workspaceId !== this.workspaceId) {
						// Save current workspace state immediately (before switching)
						const snapshot =
							this.workspaceStateManager.captureFilterStateSnapshot();
						if (snapshot) {
							await this.workspaceStateManager.saveFilterStateImmediately(
								snapshot
							);
						}

						// Switch to new workspace
						this.workspaceId = payload.workspaceId;
						this.viewState.currentWorkspace = payload.workspaceId;

						// Apply new workspace settings
						await this.workspaceStateManager.applyWorkspaceSettings();

						// Restore filter state (includes activeViewId)
						const restored =
							this.workspaceStateManager.restoreFilterStateFromWorkspace();
						if (restored?.activeViewId) {
							this.currentViewId = restored.activeViewId;
						}
						this.workspaceStateManager.syncFilterState(restored, {
							setLiveFilterState: (state) => {
								this.liveFilterState = state;
								this.app.saveLocalStorage(
									"task-genius-view-filter",
									state || null,
								);
							},
							setCurrentFilterState: (state) => {
								this.currentFilterState = state;
							},
							setViewPreferences: ({
								filters,
								selectedProject,
								viewMode,
								clearSearch,
							}) => {
								this.viewState.filters = filters;
								this.viewState.selectedProject =
									selectedProject;
								const normalizedMode = (() => {
									const availableModes =
										this.componentManager?.getAvailableModesForView(
											this.currentViewId,
										) ?? [];
									if (
										availableModes.length > 0 &&
										!availableModes.includes(viewMode)
									) {
										return this.ensureViewModeForView(
											this.currentViewId,
										);
									}
									return viewMode;
								})();
								this.viewState.viewMode = normalizedMode;
								this.recordViewModeForView(
									this.currentViewId,
									normalizedMode,
								);
								this.topNavigation?.setViewMode(normalizedMode);
								if (clearSearch) {
									this.viewState.searchQuery = "";
									this.viewState.filterInputValue = "";
								}
							},
							onAfterSync: () => {
								this.layoutManager?.updateActionButtons();
							},
						});

						// Reload tasks
						await this.dataManager.loadTasks();
					}
				}),
			);

			// Workspace overrides saved event
			this.registerEvent(
				onWorkspaceOverridesSaved(this.app, async (payload) => {
					if (payload.workspaceId === this.workspaceId) {
						await this.workspaceStateManager.applyWorkspaceSettings();
						await this.dataManager.loadTasks();
					}
				}),
			);

			// Settings changed event (skip for filter state changes)
			this.registerEvent(
				on(this.app, Events.SETTINGS_CHANGED, async () => {
					// Reload on settings change (unless caused by filter state save)
					await this.dataManager.loadTasks();
				}),
			);
		}

		// Listen for filter change events
		this.registerEvent(
			this.app.workspace.on(
				"task-genius:filter-changed",
				(filterState: RootFilterState, leafId?: string) => {
					// Only update if it's from a live filter component
					if (
						leafId &&
						!leafId.startsWith("view-config-") &&
						leafId !== "global-filter"
					) {
						console.log("[TG] Filter changed from live component");
						this.liveFilterState = filterState;
						this.currentFilterState = filterState;
					} else if (!leafId) {
						// No leafId means it's also a live filter change
						console.log("[TG] Filter changed (no leafId)");
						this.liveFilterState = filterState;
						this.currentFilterState = filterState;
					}

					// Sync selectedProject with filter UI state (if project filter is present)
					try {
						const groups = filterState?.filterGroups || [];
						const projectFilters: string[] = [];
						for (const g of groups) {
							for (const f of g.filters || []) {
								if (
									f.property === "project" &&
									f.condition === "is" &&
									typeof f.value === "string" &&
									f.value.trim() !== ""
								) {
									projectFilters.push(f.value);
								}
							}
						}
						if (projectFilters.length > 0) {
							this.viewState.selectedProject = projectFilters[0];
						} else {
							this.viewState.selectedProject = undefined;
						}
					} catch (e) {
						console.warn(
							"[TG] Failed to sync selectedProject from filter state",
							e,
						);
					}

					// Persist and update header UI
					this.workspaceStateManager.saveFilterStateToWorkspace();
					this.layoutManager.updateActionButtons();

					// Apply filters and update view
					this.filteredTasks = this.dataManager.applyFilters(
						this.tasks,
					);
					this.updateView();
				},
			),
		);

		// Sidebar selection changed (when using side leaves)
		if (this.useSideLeaves()) {
			this.registerEvent(
				onSidebarSelectionChanged(this.app, (payload) => {
					if (payload.workspaceId === this.workspaceId) {
						if (
							payload.selectionType === "view" &&
							payload.selectionId
						) {
							this.currentViewId = payload.selectionId;
							this.updateView();
						}
						if (
							payload.selectionType === "project" &&
							payload.selectionId !== undefined
						) {
							// Use the full project selection logic via actionHandlers
							this.actionHandlers.handleProjectSelect(
								payload.selectionId || "",
							);
						}
					}
				}),
			);
		}

		// Window resize
		this.registerDomEvent(window, "resize", () => {
			this.layoutManager.onResize();
		});

		// ESC key to exit selection mode
		this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Escape" && this.selectionManager.isSelectionMode) {
				evt.preventDefault();
				this.selectionManager.exitSelectionMode("user_action");
			}
		});
	}

	/**
	 * Update view with current state
	 */
	private updateView() {
		// Enhanced logging with all critical state
		console.log(
			`[TG] updateView called: ` +
				`isInitializing=${this.isInitializing}, ` +
				`viewId=${this.currentViewId}, ` +
				`tasks=${this.tasks.length}, ` +
				`filtered=${this.filteredTasks.length}, ` +
				`isLoading=${this.isLoading}, ` +
				`hasError=${!!this.loadError}`,
		);

		if (this.isInitializing) {
			console.log("[TG] ⏭️  Skip update during initialization");
			return;
		}

		console.log(
			`[TG] ▶️  Proceeding with view update for ${this.currentViewId}`,
		);

		// Update task count
		this.layoutManager.updateTaskMark();

		// Update sidebar active item
		this.layoutManager.setSidebarActiveItem(this.currentViewId);

		// Control project list interaction based on view state
		// Disable project list when showing full projects overview (no project selected)
		// Enable it when in other views or when a specific project is selected
		const isProjectsOverview =
			this.currentViewId === "projects" &&
			!this.viewState.selectedProject;
		this.layoutManager.sidebar?.setProjectListEnabled(!isProjectsOverview);

		// Show loading state
		if (this.isLoading) {
			this.componentManager.renderLoadingState();
			return;
		}

		// Show error state
		if (this.loadError) {
			this.componentManager.renderErrorState(this.loadError, () => {
				this.dataManager.loadTasks();
			});
			return;
		}

		// Show empty state
		if (this.tasks.length === 0) {
			this.componentManager.renderEmptyState();
			return;
		}

		// Update selection manager task cache before rendering
		// This is critical for bulk operations to work
		this.selectionManager.updateTaskCache(this.filteredTasks);

		const resolvedMode = this.ensureViewModeForView(this.currentViewId);
		if (resolvedMode !== this.viewState.viewMode) {
			this.viewState.viewMode = resolvedMode;
			this.recordViewModeForView(this.currentViewId, resolvedMode);
			this.topNavigation?.setViewMode(resolvedMode);
		}

		// Switch to appropriate component
		this.componentManager.switchView(
			this.currentViewId,
			this.tasks,
			this.filteredTasks,
			this.currentFilterState,
			this.viewState.viewMode,
			this.viewState.selectedProject,
		);
	}

	/**
	 * Reset all active filters
	 */
	private resetCurrentFilter(): void {
		console.log("[TG] Resetting filter");

		// Clear filter states
		this.liveFilterState = null;
		this.currentFilterState = null;
		this.viewState.selectedProject = undefined; // keep project state in sync when clearing via UI

		// Clear localStorage
		this.app.saveLocalStorage("task-genius-view-filter", null);

		// Save the cleared filter state to workspace
		this.workspaceStateManager.saveFilterStateToWorkspace();

		// Broadcast filter change to ensure UI components update
		this.app.workspace.trigger("task-genius:filter-changed", {
			rootCondition: "all",
			filterGroups: [],
		} as any);

		// Clear any active project selection in sidebar
		this.layoutManager.setActiveProject(null);

		// Re-apply filters (which will now be empty) and update view
		this.filteredTasks = this.dataManager.applyFilters(this.tasks);
		this.updateView();

		// Update action buttons (to remove Reset Filter button)
		this.layoutManager.updateActionButtons();
	}

	/**
	 * Get current state (for debugging)
	 */
	getState() {
		return {
			...this.viewState,
			currentViewId: this.currentViewId,
		};
	}

	/**
	 * Set state (for debugging)
	 */
	async setState(state: any, result: any) {
		// Restore state if needed
	}

	/**
	 * Clean up on close
	 */
	async onClose() {
		console.log("[TG] onClose started");

		// Save workspace layout before closing
		this.workspaceStateManager.saveWorkspaceLayout();

		// Exit selection mode
		if (this.selectionManager.isSelectionMode) {
			this.selectionManager.exitSelectionMode("view_change");
		}

		// Clear selection
		this.actionHandlers.clearSelection();

		console.log("[TG] onClose completed");
	}
}
