import {
	ItemView,
	WorkspaceLeaf,
	TFile,
	Plugin,
	setIcon,
	ExtraButtonComponent,
	ButtonComponent,
	Menu,
	Scope,
	debounce,
	// FrontmatterCache,
} from "obsidian";
import { Task } from "../types/task";
// Removed SidebarComponent import
import { ContentComponent } from "../components/task-view/content";
import { ForecastComponent } from "../components/task-view/forecast";
import { TagsComponent } from "../components/task-view/tags";
import { ProjectsComponent } from "../components/task-view/projects";
import { ReviewComponent } from "../components/task-view/review";
import {
	TaskDetailsComponent,
	createTaskCheckbox,
} from "../components/task-view/details";
import "../styles/view.css";
import TaskProgressBarPlugin from "../index";
import { QuickCaptureModal } from "../components/QuickCaptureModal";
import { t } from "../translations/helper";
import {
	getViewSettingOrDefault,
	ViewMode,
	DEFAULT_SETTINGS,
	TwoColumnSpecificConfig,
} from "../common/setting-definition";
import { filterTasks } from "../utils/TaskFilterUtils";
import { CalendarComponent, CalendarEvent } from "../components/calendar";
import { KanbanComponent } from "../components/kanban/kanban";
import { GanttComponent } from "../components/gantt/gantt";
import { TaskPropertyTwoColumnView } from "../components/task-view/TaskPropertyTwoColumnView";
import { ViewComponentManager } from "../components/ViewComponentManager";
import { Habit as HabitsComponent } from "../components/habit/habit";
import { Platform } from "obsidian";
import {
	ViewTaskFilterPopover,
	ViewTaskFilterModal,
} from "../components/task-filter";
import {
	Filter,
	FilterGroup,
	RootFilterState,
} from "../components/task-filter/ViewTaskFilter";

export const TASK_SPECIFIC_VIEW_TYPE = "task-genius-specific-view";

interface TaskSpecificViewState {
	viewId: ViewMode;
	project?: string | null;
	filterState?: RootFilterState | null;
}

export class TaskSpecificView extends ItemView {
	// Main container elements
	private rootContainerEl: HTMLElement;

	// Component references (Sidebar removed)
	private contentComponent: ContentComponent;
	private forecastComponent: ForecastComponent;
	private tagsComponent: TagsComponent;
	private projectsComponent: ProjectsComponent;
	private reviewComponent: ReviewComponent;
	private detailsComponent: TaskDetailsComponent;
	private calendarComponent: CalendarComponent;
	private kanbanComponent: KanbanComponent;
	private ganttComponent: GanttComponent;
	private habitsComponent: HabitsComponent;
	private viewComponentManager: ViewComponentManager; // 新增：统一的视图组件管理器
	// Custom view components by view ID
	private twoColumnViewComponents: Map<string, TaskPropertyTwoColumnView> =
		new Map();
	// UI state management (Sidebar state removed)
	private isDetailsVisible: boolean = false;
	private detailsToggleBtn: HTMLElement;
	private currentViewId: ViewMode = "inbox"; // Default or loaded from state
	private currentProject?: string | null;
	private currentSelectedTaskId: string | null = null;
	private currentSelectedTaskDOM: HTMLElement | null = null;
	private lastToggleTimestamp: number = 0;

	private tabActionButton: HTMLElement;

	private currentFilterState: RootFilterState | null = null;
	private liveFilterState: RootFilterState | null = null; // 新增：专门跟踪实时过滤器状态

	// Data management
	tasks: Task[] = [];

	constructor(leaf: WorkspaceLeaf, private plugin: TaskProgressBarPlugin) {
		super(leaf);

		// 使用预加载的任务进行快速初始显示
		this.tasks = this.plugin.preloadedTasks || [];

		this.scope = new Scope(this.app.scope);

		this.scope?.register(null, "escape", (e) => {
			e.preventDefault();
			e.stopPropagation();
		});
	}

	// New State Management Methods
	getState(): Record<string, unknown> {
		const state = super.getState();
		return {
			...state,
			viewId: this.currentViewId,
			project: this.currentProject,
			filterState: this.liveFilterState, // 保存实时过滤器状态，而不是基础过滤器
		};
	}

	async setState(state: unknown, result: any) {
		await super.setState(state, result);

		if (state && typeof state === "object") {
			const specificState = state as TaskSpecificViewState;

			this.currentViewId = specificState?.viewId || "inbox";
			this.currentProject = specificState?.project;
			// 从状态恢复的过滤器应该被视为实时过滤器
			this.liveFilterState = specificState?.filterState || null;
			this.currentFilterState = specificState?.filterState || null;
			console.log("TaskSpecificView setState:", specificState);

			if (!this.rootContainerEl) {
				this.app.workspace.onLayoutReady(() => {
					if (this.currentViewId) {
						this.switchView(
							this.currentViewId,
							this.currentProject
						);
					}
				});
			} else if (this.currentViewId) {
				this.switchView(this.currentViewId, this.currentProject);
			}
		}
	}

	getViewType(): string {
		return TASK_SPECIFIC_VIEW_TYPE;
	}

	getDisplayText(): string {
		const currentViewConfig = getViewSettingOrDefault(
			this.plugin,
			this.currentViewId
		);
		// Potentially add project name if relevant for 'projects' view?
		return currentViewConfig.name;
	}

	getIcon(): string {
		const currentViewConfig = getViewSettingOrDefault(
			this.plugin,
			this.currentViewId
		);
		return currentViewConfig.icon;
	}

	async onOpen() {
		this.contentEl.toggleClass("task-genius-view", true);
		this.contentEl.toggleClass("task-genius-specific-view", true);
		this.rootContainerEl = this.contentEl.createDiv({
			cls: "task-genius-container no-sidebar",
		});

		// 1. 首先注册事件监听器，确保不会错过任何更新
		this.registerEvent(
			this.app.workspace.on(
				"task-genius:task-cache-updated",
				async () => {
					await this.loadTasks();
				}
			)
		);

		this.registerEvent(
			this.app.workspace.on(
				"task-genius:filter-changed",
				(filterState: RootFilterState, leafId?: string) => {
					console.log(
						"TaskSpecificView 过滤器实时变更:",
						filterState,
						"leafId:",
						leafId
					);

					// 只处理来自当前视图的过滤器变更
					if (leafId === this.leaf.id) {
						// 这是来自当前视图的实时过滤器组件的变更
						this.liveFilterState = filterState;
						this.currentFilterState = filterState;
						console.log("更新 TaskSpecificView 实时过滤器状态");
						this.debouncedApplyFilter();
					}
					// 忽略来自其他leafId的变更，包括基础过滤器（view-config-开头）
				}
			)
		);

		// 2. 初始化组件（但先不传入数据）
		this.initializeComponents();

		// 3. 获取初始视图状态
		const state = this.leaf.getViewState().state as any;
		const specificState = state as unknown as TaskSpecificViewState;
		console.log("TaskSpecificView initial state:", specificState);
		this.currentViewId = specificState?.viewId || "inbox"; // Fallback if state is missing
		this.currentProject = specificState?.project;
		this.currentFilterState = specificState?.filterState || null;

		// 4. 先使用预加载的数据快速显示
		this.switchView(this.currentViewId, this.currentProject);

		// 5. 异步加载最新数据（包含 ICS 同步）
		await this.loadTasks(true, true); // 跳过视图更新，避免双重渲染

		this.toggleDetailsVisibility(false);

		this.createActionButtons(); // Keep details toggle and quick capture

		(this.leaf.tabHeaderStatusContainerEl as HTMLElement)?.empty();
		(this.leaf.tabHeaderEl as HTMLElement)?.toggleClass(
			"task-genius-tab-header",
			true
		);
		this.tabActionButton = (
			this.leaf.tabHeaderStatusContainerEl as HTMLElement
		)?.createEl(
			"span",
			{
				cls: "task-genius-action-btn",
			},
			(el: HTMLElement) => {
				new ExtraButtonComponent(el)
					.setIcon("check-square")
					.setTooltip(t("Capture"))
					.onClick(() => {
						const modal = new QuickCaptureModal(
							this.plugin.app,
							this.plugin,
							{},
							true
						);
						modal.open();
					});
			}
		);
		if (this.tabActionButton) {
			this.register(() => {
				this.tabActionButton.detach();
			});
		}
	}

	private debouncedApplyFilter = debounce(() => {
		this.applyCurrentFilter();
	}, 100);

	// Removed onResize and checkAndCollapseSidebar methods

	private initializeComponents() {
		// No SidebarComponent initialization
		// No createSidebarToggle call

		this.contentComponent = new ContentComponent(
			this.rootContainerEl,
			this.plugin.app,
			this.plugin,
			{
				onTaskSelected: (task: Task | null) => {
					this.handleTaskSelection(task);
				},
				onTaskCompleted: (task: Task) => {
					this.toggleTaskCompletion(task);
				},
				onTaskContextMenu: (event: MouseEvent, task: Task) => {
					this.handleTaskContextMenu(event, task);
				},
			}
		);
		this.addChild(this.contentComponent);
		this.contentComponent.load();

		this.forecastComponent = new ForecastComponent(
			this.rootContainerEl,
			this.plugin.app,
			this.plugin,
			{
				onTaskSelected: (task: Task | null) => {
					this.handleTaskSelection(task);
				},
				onTaskCompleted: (task: Task) => {
					this.toggleTaskCompletion(task);
				},
				onTaskUpdate: async (originalTask: Task, updatedTask: Task) => {
					await this.handleTaskUpdate(originalTask, updatedTask);
				},
				onTaskContextMenu: (event: MouseEvent, task: Task) => {
					this.handleTaskContextMenu(event, task);
				},
			}
		);
		this.addChild(this.forecastComponent);
		this.forecastComponent.load();
		this.forecastComponent.containerEl.hide();

		this.tagsComponent = new TagsComponent(
			this.rootContainerEl,
			this.plugin.app,
			this.plugin,
			{
				onTaskSelected: (task: Task | null) => {
					this.handleTaskSelection(task);
				},
				onTaskCompleted: (task: Task) => {
					this.toggleTaskCompletion(task);
				},
				onTaskContextMenu: (event: MouseEvent, task: Task) => {
					this.handleTaskContextMenu(event, task);
				},
			}
		);
		this.addChild(this.tagsComponent);
		this.tagsComponent.load();
		this.tagsComponent.containerEl.hide();

		this.projectsComponent = new ProjectsComponent(
			this.rootContainerEl,
			this.plugin.app,
			this.plugin,
			{
				onTaskSelected: (task: Task | null) => {
					this.handleTaskSelection(task);
				},
				onTaskCompleted: (task: Task) => {
					this.toggleTaskCompletion(task);
				},
				onTaskContextMenu: (event: MouseEvent, task: Task) => {
					this.handleTaskContextMenu(event, task);
				},
			}
		);
		this.addChild(this.projectsComponent);
		this.projectsComponent.load();
		this.projectsComponent.containerEl.hide();

		this.reviewComponent = new ReviewComponent(
			this.rootContainerEl,
			this.plugin.app,
			this.plugin,
			{
				onTaskSelected: (task: Task | null) => {
					this.handleTaskSelection(task);
				},
				onTaskCompleted: (task: Task) => {
					this.toggleTaskCompletion(task);
				},
				onTaskContextMenu: (event: MouseEvent, task: Task) => {
					this.handleTaskContextMenu(event, task);
				},
			}
		);
		this.addChild(this.reviewComponent);
		this.reviewComponent.load();
		this.reviewComponent.containerEl.hide();

		this.calendarComponent = new CalendarComponent(
			this.plugin.app,
			this.plugin,
			this.rootContainerEl,
			this.tasks, // 使用预加载的任务数据
			{
				onTaskSelected: (task: Task | null) => {
					this.handleTaskSelection(task);
				},
				onTaskCompleted: (task: Task) => {
					this.toggleTaskCompletion(task);
				},
				onEventContextMenu: (ev: MouseEvent, event: CalendarEvent) => {
					this.handleTaskContextMenu(ev, event);
				},
			}
		);
		this.addChild(this.calendarComponent);
		this.calendarComponent.load();
		this.calendarComponent.containerEl.hide();

		// Initialize KanbanComponent
		this.kanbanComponent = new KanbanComponent(
			this.app,
			this.plugin,
			this.rootContainerEl,
			this.tasks, // 使用预加载的任务数据
			{
				onTaskStatusUpdate:
					this.handleKanbanTaskStatusUpdate.bind(this),
				onTaskSelected: this.handleTaskSelection.bind(this),
				onTaskCompleted: this.toggleTaskCompletion.bind(this),
				onTaskContextMenu: this.handleTaskContextMenu.bind(this),
			}
		);
		this.addChild(this.kanbanComponent);
		this.kanbanComponent.containerEl.hide();

		this.ganttComponent = new GanttComponent(
			this.plugin,
			this.rootContainerEl,
			{
				onTaskSelected: this.handleTaskSelection.bind(this),
				onTaskCompleted: this.toggleTaskCompletion.bind(this),
				onTaskContextMenu: this.handleTaskContextMenu.bind(this),
			}
		);
		this.addChild(this.ganttComponent);
		this.ganttComponent.containerEl.hide();

		this.habitsComponent = new HabitsComponent(
			this.plugin,
			this.rootContainerEl
		);
		this.addChild(this.habitsComponent);
		this.habitsComponent.containerEl.hide();
		this.detailsComponent = new TaskDetailsComponent(
			this.rootContainerEl,
			this.app,
			this.plugin
		);
		this.addChild(this.detailsComponent);
		this.detailsComponent.load();

		// 初始化统一的视图组件管理器
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
			}
		);

		this.addChild(this.viewComponentManager);

		this.setupComponentEvents();
	}

	// Removed createSidebarToggle

	private createActionButtons() {
		this.detailsToggleBtn = this.addAction(
			"panel-right-dashed",
			t("Details"),
			() => {
				this.toggleDetailsVisibility(!this.isDetailsVisible);
			}
		);

		this.detailsToggleBtn.toggleClass("panel-toggle-btn", true);
		this.detailsToggleBtn.toggleClass("is-active", this.isDetailsVisible);

		// Keep quick capture button
		this.addAction("notebook-pen", t("Capture"), () => {
			const modal = new QuickCaptureModal(
				this.plugin.app,
				this.plugin,
				{},
				true
			);
			modal.open();
		});

		this.addAction("filter", t("Filter"), (e) => {
			if (Platform.isDesktop) {
				const popover = new ViewTaskFilterPopover(
					this.plugin.app,
					this.leaf.id,
					this.plugin
				);

				// 设置关闭回调 - 现在主要用于处理取消操作
				popover.onClose = (filterState) => {
					// 由于使用了实时事件监听，这里不需要再手动更新状态
					// 可以用于处理特殊的关闭逻辑，如果需要的话
				};

				// 当打开时，设置初始过滤器状态
				this.app.workspace.onLayoutReady(() => {
					setTimeout(() => {
						if (
							this.liveFilterState &&
							popover.taskFilterComponent
						) {
							// 使用类型断言解决非空问题
							const filterState = this
								.liveFilterState as RootFilterState;
							popover.taskFilterComponent.loadFilterState(
								filterState
							);
						}
					}, 100);
				});

				popover.showAtPosition({ x: e.clientX, y: e.clientY });
			} else {
				const modal = new ViewTaskFilterModal(
					this.plugin.app,
					this.leaf.id,
					this.plugin
				);

				// 设置关闭回调 - 现在主要用于处理取消操作
				modal.filterCloseCallback = (filterState) => {
					// 由于使用了实时事件监听，这里不需要再手动更新状态
					// 可以用于处理特殊的关闭逻辑，如果需要的话
				};

				modal.open();

				// 设置初始过滤器状态
				if (this.liveFilterState && modal.taskFilterComponent) {
					setTimeout(() => {
						// 使用类型断言解决非空问题
						const filterState = this
							.liveFilterState as RootFilterState;
						modal.taskFilterComponent.loadFilterState(filterState);
					}, 100);
				}
			}
		});
	}

	onPaneMenu(menu: Menu) {
		if (
			this.liveFilterState &&
			this.liveFilterState.filterGroups &&
			this.liveFilterState.filterGroups.length > 0
		) {
			menu.addItem((item) => {
				item.setTitle(t("Reset Filter"));
				item.setIcon("reset");
				item.onClick(() => {
					this.resetCurrentFilter();
				});
			});
			menu.addSeparator();
		}
		// Keep settings item
		menu.addItem((item) => {
			item.setTitle(t("Settings"));
			item.setIcon("gear");
			item.onClick(() => {
				this.app.setting.open();
				this.app.setting.openTabById(this.plugin.manifest.id);

				this.plugin.settingTab.openTab("view-settings");
			});
		});
		// Add specific view actions if needed in the future
		return menu;
	}

	// Removed toggleSidebar

	private toggleDetailsVisibility(visible: boolean) {
		this.isDetailsVisible = visible;
		this.rootContainerEl.toggleClass("details-visible", visible);
		this.rootContainerEl.toggleClass("details-hidden", !visible);

		this.detailsComponent.setVisible(visible);
		if (this.detailsToggleBtn) {
			this.detailsToggleBtn.toggleClass("is-active", visible);
			this.detailsToggleBtn.setAttribute(
				"aria-label",
				visible ? t("Hide Details") : t("Show Details")
			);
		}

		if (!visible) {
			this.currentSelectedTaskId = null;
		}
	}

	private setupComponentEvents() {
		// No sidebar event handlers
		this.detailsComponent.onTaskToggleComplete = (task: Task) =>
			this.toggleTaskCompletion(task);

		// Details component handlers
		this.detailsComponent.onTaskEdit = (task: Task) => this.editTask(task);
		this.detailsComponent.onTaskUpdate = async (
			originalTask: Task,
			updatedTask: Task
		) => {
			await this.updateTask(originalTask, updatedTask);
		};
		this.detailsComponent.toggleDetailsVisibility = (visible: boolean) => {
			this.toggleDetailsVisibility(visible);
		};

		// No sidebar component handlers needed
	}

	private switchView(viewId: ViewMode, project?: string | null) {
		this.currentViewId = viewId;
		this.currentProject = project;
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
		this.habitsComponent.containerEl.hide();
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
					this.rootContainerEl,
					this.app,
					this.plugin,
					twoColumnConfig,
					viewId
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
						targetComponent = this.habitsComponent;
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

		this.updateHeaderDisplay();
		this.handleTaskSelection(null);
	}

	private updateHeaderDisplay() {
		const config = getViewSettingOrDefault(this.plugin, this.currentViewId);
		// Use the actual currentViewId for the header
		this.leaf.setEphemeralState({ title: config.name, icon: config.icon });
	}

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
							this.updateTask(task, {
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

	private handleTaskSelection(task: Task | null) {
		if (task) {
			const now = Date.now();
			const timeSinceLastToggle = now - this.lastToggleTimestamp;

			if (this.currentSelectedTaskId !== task.id) {
				this.currentSelectedTaskId = task.id;
				this.detailsComponent.showTaskDetails(task);
				if (!this.isDetailsVisible) {
					this.toggleDetailsVisibility(true);
				}
				this.lastToggleTimestamp = now;
				return;
			}

			// Toggle details visibility on double-click/re-click
			if (timeSinceLastToggle > 150) {
				// Debounce slightly
				this.toggleDetailsVisibility(!this.isDetailsVisible);
				this.lastToggleTimestamp = now;
			}
		} else {
			// Deselecting task explicitly
			this.toggleDetailsVisibility(false);
			this.currentSelectedTaskId = null;
		}
	}

	private async loadTasks(
		forceSync: boolean = false,
		skipViewUpdate: boolean = false
	) {
		const taskManager = this.plugin.taskManager;
		if (!taskManager) return;

		let newTasks: Task[];
		if (forceSync) {
			// Use sync method for initial load to ensure ICS data is available
			newTasks = await taskManager.getAllTasksWithSync();
		} else {
			// Use regular method for subsequent updates
			newTasks = taskManager.getAllTasks();
		}
		console.log(`TaskSpecificView loaded ${newTasks.length} tasks`);

		// 检查任务数量是否有变化（简单的优化，可以根据需要改进比较逻辑）
		const hasChanged = this.tasks.length !== newTasks.length;

		this.tasks = newTasks;

		// 只有在数据有变化时才更新视图
		if (!skipViewUpdate && hasChanged) {
			// 直接切换到当前视图
			if (this.currentViewId) {
				this.switchView(this.currentViewId, this.currentProject);
			}

			// 更新操作按钮
			this.updateActionButtons();
		}
	}

	// 添加应用当前过滤器状态的方法
	private applyCurrentFilter() {
		console.log(
			"应用 TaskSpecificView 当前过滤状态:",
			this.liveFilterState ? "有实时筛选器" : "无实时筛选器",
			this.currentFilterState ? "有过滤器" : "无过滤器"
		);
		// 通过 loadTasks 重新加载任务
		this.loadTasks();
	}

	public async triggerViewUpdate() {
		// 直接切换到当前视图以刷新任务
		if (this.currentViewId) {
			this.switchView(this.currentViewId, this.currentProject);
			// 更新操作按钮
			this.updateActionButtons();
		} else {
			console.warn(
				"TaskSpecificView: Cannot trigger update, currentViewId is not set."
			);
		}
	}

	private updateActionButtons() {
		// 移除过滤器重置按钮（如果存在）
		const resetButton = this.leaf.view.containerEl.querySelector(
			".view-action.task-filter-reset"
		);
		if (resetButton) {
			resetButton.remove();
		}

		// 只有在有实时高级筛选器时才添加重置按钮（不包括基础过滤器）
		if (
			this.liveFilterState &&
			this.liveFilterState.filterGroups &&
			this.liveFilterState.filterGroups.length > 0
		) {
			this.addAction("reset", t("Reset Filter"), () => {
				this.resetCurrentFilter();
			}).addClass("task-filter-reset");
		}
	}

	private async toggleTaskCompletion(task: Task) {
		const updatedTask = { ...task, completed: !task.completed };

		if (updatedTask.completed) {
			// 设置完成时间到任务元数据中
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
			// 清除完成时间
			if (updatedTask.metadata) {
				updatedTask.metadata.completedDate = undefined;
			}
			const notStartedMark =
				this.plugin.settings.taskStatuses.notStarted || " ";
			if (updatedTask.status.toLowerCase() === "x") {
				// Only revert if it was the completed mark
				updatedTask.status = notStartedMark;
			}
		}

		const taskManager = this.plugin.taskManager;
		if (!taskManager) return;

		await taskManager.updateTask(updatedTask);
		// Task cache listener will trigger loadTasks -> triggerViewUpdate
	}

	private async handleTaskUpdate(originalTask: Task, updatedTask: Task) {
		const taskManager = this.plugin.taskManager;
		if (!taskManager) return;

		console.log(
			"handleTaskUpdate",
			originalTask.content,
			updatedTask.content,
			originalTask.id,
			updatedTask.id,
			updatedTask,
			originalTask
		);

		try {
			await taskManager.updateTask(updatedTask);
		} catch (error) {
			console.error("Failed to update task:", error);
			// You might want to show a notice to the user here
		}
	}

	private async updateTask(
		originalTask: Task,
		updatedTask: Task
	): Promise<Task> {
		const taskManager = this.plugin.taskManager;
		if (!taskManager) {
			console.error("Task manager not available for updateTask");
			throw new Error("Task manager not available");
		}
		try {
			await taskManager.updateTask(updatedTask);
			console.log(`Task ${updatedTask.id} updated successfully.`);

			// Update task in local list immediately for responsiveness
			const index = this.tasks.findIndex((t) => t.id === originalTask.id);
			if (index !== -1) {
				this.tasks[index] = updatedTask;
			} else {
				console.warn(
					"Updated task not found in local list, might reload fully later."
				);
				// Optionally force a full reload if this happens often
				// await this.loadTasks();
				// return updatedTask; // Return early if we reloaded
			}

			// If the updated task is the currently selected one, refresh details view
			// Only refresh if not currently editing to prevent UI disruption
			if (this.currentSelectedTaskId === updatedTask.id) {
				if (this.detailsComponent.isCurrentlyEditing()) {
					// Update the current task reference without re-rendering UI
					this.detailsComponent.currentTask = updatedTask;
				} else {
					this.detailsComponent.showTaskDetails(updatedTask);
				}
			}

			// 直接更新当前视图
			if (this.currentViewId) {
				this.switchView(this.currentViewId, this.currentProject);
			}

			return updatedTask;
		} catch (error) {
			console.error(`Failed to update task ${originalTask.id}:`, error);
			// Potentially add user notification here
			throw error;
		}
	}

	private async editTask(task: Task) {
		const file = this.app.vault.getFileByPath(task.filePath);
		if (!file) return;

		// Prefer activating existing leaf if file is open
		const existingLeaf = this.app.workspace
			.getLeavesOfType("markdown")
			.find(
				(leaf) => (leaf.view as any).file === file // Type assertion needed here
			);

		const leafToUse = existingLeaf || this.app.workspace.getLeaf("tab"); // Open in new tab if not open

		await leafToUse.openFile(file, {
			active: true, // Ensure the leaf becomes active
			eState: {
				line: task.line,
			},
		});
		// Focus the editor after opening
		this.app.workspace.setActiveLeaf(leafToUse, { focus: true });
	}

	async onClose() {
		// Cleanup TwoColumnView components
		this.twoColumnViewComponents.forEach((component) => {
			this.removeChild(component);
		});
		this.twoColumnViewComponents.clear();

		// Cleanup special view components
		// this.viewComponentManager.cleanup();

		this.unload(); // This callsremoveChild on all direct children automatically
		if (this.rootContainerEl) {
			this.rootContainerEl.empty();
			this.rootContainerEl.detach();
		}
		console.log("TaskSpecificView closed");
	}

	onSettingsUpdate() {
		console.log("TaskSpecificView received settings update notification.");
		// No sidebar to update
		// Re-trigger view update to reflect potential setting changes (e.g., filters, status marks)
		this.triggerViewUpdate();
		this.updateHeaderDisplay(); // Update icon/title if changed
	}

	// Method to handle status updates originating from Kanban drag-and-drop
	private handleKanbanTaskStatusUpdate = async (
		taskId: string,
		newStatusMark: string
	) => {
		console.log(
			`TaskSpecificView handling Kanban status update request for ${taskId} to mark ${newStatusMark}`
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
					// 创建更新的任务对象，将 completedDate 设置到 metadata 中
					const updatedTaskData = {
						...taskToUpdate,
						status: newStatusMark,
						completed: isCompleted,
					};

					// 确保 metadata 存在并设置 completedDate
					if (updatedTaskData.metadata) {
						updatedTaskData.metadata.completedDate = completedDate;
					}

					// Use updateTask to ensure consistency and UI updates
					await this.updateTask(taskToUpdate, updatedTaskData);
					console.log(
						`Task ${taskId} status update processed by TaskSpecificView.`
					);
				} catch (error) {
					console.error(
						`TaskSpecificView failed to update task status from Kanban callback for task ${taskId}:`,
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
				`TaskSpecificView could not find task with ID ${taskId} for Kanban status update.`
			);
		}
	};

	// 添加重置筛选器的方法
	public resetCurrentFilter() {
		console.log("重置 TaskSpecificView 实时筛选器");
		this.liveFilterState = null;
		this.currentFilterState = null;
		this.app.saveLocalStorage(
			`task-genius-view-filter-${this.leaf.id}`,
			null
		);
		this.applyCurrentFilter();
		this.updateActionButtons();
	}
}
