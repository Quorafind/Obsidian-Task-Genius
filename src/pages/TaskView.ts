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
	Notice,
	Platform,
	debounce,
	// FrontmatterCache,
} from "obsidian";
import { Task } from "../types/task";
import { SidebarComponent } from "../components/task-view/sidebar";
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
import { Habit } from "../components/habit/habit";
import { ConfirmModal } from "../components/ConfirmModal";
import {
	ViewTaskFilterPopover,
	ViewTaskFilterModal,
} from "../components/task-filter";
import {
	Filter,
	FilterGroup,
	RootFilterState,
} from "../components/task-filter/ViewTaskFilter";
import { FilterConfigModal } from "../components/task-filter/FilterConfigModal";
import { SavedFilterConfig } from "../common/setting-definition";

export const TASK_VIEW_TYPE = "task-genius-view";

export class TaskView extends ItemView {
	// Main container elements
	private rootContainerEl: HTMLElement;

	// Component references
	private sidebarComponent: SidebarComponent;
	private contentComponent: ContentComponent;
	private forecastComponent: ForecastComponent;
	private tagsComponent: TagsComponent;
	private projectsComponent: ProjectsComponent;
	private reviewComponent: ReviewComponent;
	private detailsComponent: TaskDetailsComponent;
	private calendarComponent: CalendarComponent;
	private kanbanComponent: KanbanComponent;
	private ganttComponent: GanttComponent;
	private viewComponentManager: ViewComponentManager; // 新增：统一的视图组件管理器
	// Custom view components by view ID
	private twoColumnViewComponents: Map<string, TaskPropertyTwoColumnView> =
		new Map();
	// UI state management
	private isSidebarCollapsed: boolean = false;
	private isDetailsVisible: boolean = false;
	private sidebarToggleBtn: HTMLElement;
	private detailsToggleBtn: HTMLElement;
	private currentViewId: ViewMode = "inbox";
	private currentSelectedTaskId: string | null = null;
	private currentSelectedTaskDOM: HTMLElement | null = null;
	private lastToggleTimestamp: number = 0;
	private habitComponent: Habit;

	private tabActionButton: HTMLElement;

	// Data management
	tasks: Task[] = [];

	private currentFilterState: RootFilterState | null = null;
	private liveFilterState: RootFilterState | null = null; // 新增：专门跟踪实时过滤器状态

	// 创建防抖的过滤器应用函数
	private debouncedApplyFilter = debounce(() => {
		this.applyCurrentFilter();
	}, 100);

	constructor(leaf: WorkspaceLeaf, private plugin: TaskProgressBarPlugin) {
		super(leaf);

		// 使用预加载的任务进行快速初始显示
		this.tasks = this.plugin.preloadedTasks || [];

		console.log("tasks", this.tasks);

		this.scope = new Scope(this.app.scope);

		this.scope?.register(null, "escape", (e) => {
			e.preventDefault();
			e.stopPropagation();
		});
	}

	getViewType(): string {
		return TASK_VIEW_TYPE;
	}

	getDisplayText(): string {
		const currentViewConfig = getViewSettingOrDefault(
			this.plugin,
			this.currentViewId
		);
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
		this.rootContainerEl = this.contentEl.createDiv({
			cls: "task-genius-container",
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

		// 监听过滤器变更事件
		this.registerEvent(
			this.app.workspace.on(
				"task-genius:filter-changed",
				(filterState: RootFilterState, leafId?: string) => {
					// 只有来自实时过滤器组件的变更才更新liveFilterState
					// 排除基础过滤器（ViewConfigModal）和全局过滤器的变更
					if (
						leafId &&
						!leafId.startsWith("view-config-") &&
						leafId !== "global-filter"
					) {
						// 这是来自实时过滤器组件的变更
						this.liveFilterState = filterState;
						this.currentFilterState = filterState;
						console.log("更新实时过滤器状态");
					} else if (!leafId) {
						// 没有leafId的情况，也视为实时过滤器变更
						this.liveFilterState = filterState;
						this.currentFilterState = filterState;
						console.log("更新实时过滤器状态（无leafId）");
					}

					// 使用防抖函数应用过滤器，避免频繁更新
					this.debouncedApplyFilter();
				}
			)
		);

		// 2. 加载缓存的实时过滤状态
		const savedFilterState = this.app.loadLocalStorage(
			"task-genius-view-filter"
		) as RootFilterState;
		console.log("savedFilterState", savedFilterState);

		if (
			savedFilterState &&
			typeof savedFilterState.rootCondition === "string" &&
			Array.isArray(savedFilterState.filterGroups)
		) {
			console.log("Saved filter state", savedFilterState);
			this.liveFilterState = savedFilterState;
			this.currentFilterState = savedFilterState;
		} else {
			console.log("No saved filter state or invalid state");
			this.liveFilterState = null;
			this.currentFilterState = null;
		}

		console.log("currentFilterState", this.currentFilterState);

		// 3. 初始化组件（但先不传入数据）
		this.initializeComponents();

		// 4. 获取初始视图ID
		const savedViewId = this.app.loadLocalStorage(
			"task-genius:view-mode"
		) as ViewMode;
		const initialViewId = this.plugin.settings.viewConfiguration.find(
			(v) => v.id === savedViewId && v.visible
		)
			? savedViewId
			: this.plugin.settings.viewConfiguration.find((v) => v.visible)
					?.id || "inbox";

		this.currentViewId = initialViewId;
		this.sidebarComponent.setViewMode(this.currentViewId);

		// 5. 异步加载最新数据（包含 ICS 同步）
		await this.loadTasks(true, true); // 跳过视图更新，避免双重渲染

		// 6. 使用加载的数据显示视图
		this.switchView(this.currentViewId);

		console.log("currentFilterState", this.currentFilterState);
		// 7. 在组件初始化完成后应用筛选器状态
		if (this.currentFilterState) {
			console.log("应用保存的筛选器状态");
			this.applyCurrentFilter();
		}

		this.toggleDetailsVisibility(false);

		this.createActionButtons();

		(this.leaf.tabHeaderStatusContainerEl as HTMLElement).empty();

		(this.leaf.tabHeaderEl as HTMLElement).toggleClass(
			"task-genius-tab-header",
			true
		);

		this.tabActionButton = (
			this.leaf.tabHeaderStatusContainerEl as HTMLElement
		).createEl(
			"span",
			{
				cls: "task-genius-action-btn",
			},
			(el: HTMLElement) => {
				new ExtraButtonComponent(el)
					.setIcon("notebook-pen")
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

		this.register(() => {
			this.tabActionButton.detach();
		});

		this.checkAndCollapseSidebar();

		// 添加视图切换命令
		this.plugin.settings.viewConfiguration.forEach((view) => {
			this.plugin.addCommand({
				id: `switch-view-${view.id}`,
				name: view.name,
				checkCallback: (checking) => {
					if (checking) {
						return true;
					}

					const currentView =
						this.plugin.app.workspace.getActiveViewOfType(TaskView);
					if (currentView) {
						currentView.switchView(view.id);
					} else {
						// If no view is active, activate one and then switch
						this.plugin.activateTaskView().then(() => {
							const newView =
								this.plugin.app.workspace.getActiveViewOfType(
									TaskView
								);
							if (newView) {
								newView.switchView(view.id);
							}
						});
					}

					return true;
				},
			});
		});

		// 确保重置筛选器按钮正确显示
		this.updateActionButtons();
	}

	onResize(): void {
		this.checkAndCollapseSidebar();
	}

	checkAndCollapseSidebar() {
		if (this.leaf.width === 0 || this.leaf.height === 0) {
			return;
		}

		if (this.leaf.width < 768) {
			this.isSidebarCollapsed = true;
			this.sidebarComponent.setCollapsed(true);
		} else {
		}
	}

	private initializeComponents() {
		this.sidebarComponent = new SidebarComponent(
			this.rootContainerEl,
			this.plugin
		);
		this.addChild(this.sidebarComponent);
		this.sidebarComponent.load();

		this.createSidebarToggle();

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
				onTaskUpdate: async (originalTask: Task, updatedTask: Task) => {
					console.log(
						"TaskView onTaskUpdate",
						originalTask.content,
						updatedTask.content
					);
					await this.handleTaskUpdate(originalTask, updatedTask);
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
					console.log(
						"TaskView onTaskUpdate",
						originalTask.content,
						updatedTask.content
					);
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
				onTaskUpdate: async (originalTask: Task, updatedTask: Task) => {
					await this.handleTaskUpdate(originalTask, updatedTask);
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
				onTaskUpdate: async (originalTask: Task, updatedTask: Task) => {
					await this.handleTaskUpdate(originalTask, updatedTask);
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
				onTaskUpdate: async (originalTask: Task, updatedTask: Task) => {
					await this.handleTaskUpdate(originalTask, updatedTask);
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
			this.tasks,
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
			this.tasks,
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

		this.habitComponent = new Habit(this.plugin, this.rootContainerEl);
		this.addChild(this.habitComponent);
		this.habitComponent.containerEl.hide();

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
				onTaskUpdate: this.handleTaskUpdate.bind(this),
			}
		);

		this.addChild(this.viewComponentManager);

		this.setupComponentEvents();
	}

	private createSidebarToggle() {
		const toggleContainer = (
			this.headerEl.find(".view-header-nav-buttons") as HTMLElement
		)?.createDiv({
			cls: "panel-toggle-container",
		});

		if (!toggleContainer) {
			console.error(
				"Could not find .view-header-nav-buttons to add sidebar toggle."
			);
			return;
		}

		this.sidebarToggleBtn = toggleContainer.createDiv({
			cls: "panel-toggle-btn",
		});
		new ButtonComponent(this.sidebarToggleBtn)
			.setIcon("panel-left-dashed")
			.setTooltip(t("Toggle Sidebar"))
			.setClass("clickable-icon")
			.onClick(() => {
				this.toggleSidebar();
			});
	}

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
					undefined,
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

		// 重置筛选器按钮的逻辑移到updateActionButtons方法中
		this.updateActionButtons();
	}

	// 添加应用当前过滤器状态的方法
	private applyCurrentFilter() {
		console.log(
			"应用当前过滤状态:",
			this.liveFilterState ? "有实时筛选器" : "无实时筛选器",
			this.currentFilterState ? "有过滤器" : "无过滤器"
		);
		// 通过triggerViewUpdate重新加载任务
		this.triggerViewUpdate();
	}

	onPaneMenu(menu: Menu) {
		// Add saved filters section
		const savedConfigs = this.plugin.settings.filterConfig.savedConfigs;
		if (savedConfigs && savedConfigs.length > 0) {
			menu.addItem((item) => {
				item.setTitle(t("Saved Filters"));
				item.setIcon("filter");
				const submenu = item.setSubmenu();

				savedConfigs.forEach((config) => {
					submenu.addItem((subItem) => {
						subItem.setTitle(config.name);
						subItem.setIcon("search");
						if (config.description) {
							subItem.setSection(config.description);
						}
						subItem.onClick(() => {
							this.applySavedFilter(config);
						});
					});
				});

				submenu.addSeparator();
				submenu.addItem((subItem) => {
					subItem.setTitle(t("Manage Saved Filters"));
					subItem.setIcon("settings");
					subItem.onClick(() => {
						const modal = new FilterConfigModal(
							this.app,
							this.plugin,
							"load",
							undefined,
							undefined,
							(config) => {
								this.applySavedFilter(config);
							}
						);
						modal.open();
					});
				});
			});
			menu.addSeparator();
		}

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

		menu.addItem((item) => {
			item.setTitle(t("Settings"));
			item.setIcon("gear");
			item.onClick(() => {
				this.app.setting.open();
				this.app.setting.openTabById(this.plugin.manifest.id);

				this.plugin.settingTab.openTab("view-settings");
			});
		})
			.addSeparator()
			.addItem((item) => {
				item.setTitle(t("Reindex"));
				item.setIcon("rotate-ccw");
				item.onClick(async () => {
					new ConfirmModal(this.plugin, {
						title: t("Reindex"),
						message: t(
							"Are you sure you want to force reindex all tasks?"
						),
						confirmText: t("Reindex"),
						cancelText: t("Cancel"),
						onConfirm: async (confirmed) => {
							if (!confirmed) return;
							try {
								await this.plugin.taskManager.forceReindex();
							} catch (error) {
								console.error(
									"Failed to force reindex tasks:",
									error
								);
								new Notice(t("Failed to force reindex tasks"));
							}
						},
					}).open();
				});
			});

		return menu;
	}

	private toggleSidebar() {
		this.isSidebarCollapsed = !this.isSidebarCollapsed;
		this.rootContainerEl.toggleClass(
			"sidebar-collapsed",
			this.isSidebarCollapsed
		);

		this.sidebarComponent.setCollapsed(this.isSidebarCollapsed);
	}

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
		this.detailsComponent.onTaskToggleComplete = (task: Task) =>
			this.toggleTaskCompletion(task);

		// Details component handlers
		this.detailsComponent.onTaskEdit = (task: Task) => this.editTask(task);
		this.detailsComponent.onTaskUpdate = async (
			originalTask: Task,
			updatedTask: Task
		) => {
			console.log(
				"triggered by detailsComponent",
				originalTask,
				updatedTask
			);
			await this.updateTask(originalTask, updatedTask);
		};
		this.detailsComponent.toggleDetailsVisibility = (visible: boolean) => {
			this.toggleDetailsVisibility(visible);
		};

		// Sidebar component handlers
		this.sidebarComponent.onProjectSelected = (project: string) => {
			this.switchView("projects", project);
		};
		this.sidebarComponent.onViewModeChanged = (viewId: ViewMode) => {
			this.switchView(viewId);
		};
	}

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

				console.log("tasks", this.tasks);

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

		this.app.saveLocalStorage("task-genius:view-mode", viewId);
		this.updateHeaderDisplay();
		this.handleTaskSelection(null);

		if (this.leaf.tabHeaderInnerIconEl) {
			setIcon(this.leaf.tabHeaderInnerIconEl, this.getIcon());
			this.leaf.tabHeaderInnerTitleEl.setText(this.getDisplayText());
			this.titleEl.setText(this.getDisplayText());
		}
	}

	private updateHeaderDisplay() {
		const config = getViewSettingOrDefault(this.plugin, this.currentViewId);
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
					this.handleTaskSelection(task);
				});
			})
			.addItem((item) => {
				item.setTitle(t("Edit in File"));
				item.setIcon("pencil");
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

			if (timeSinceLastToggle > 150) {
				this.toggleDetailsVisibility(!this.isDetailsVisible);
				this.lastToggleTimestamp = now;
			}
		} else {
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

		if (forceSync) {
			// Use sync method for initial load to ensure ICS data is available
			this.tasks = await taskManager.getAllTasksWithSync();
		} else {
			// Use regular method for subsequent updates
			this.tasks = taskManager.getAllTasks();
		}
		console.log(`TaskView loaded ${this.tasks.length} tasks`);

		if (!skipViewUpdate) {
			await this.triggerViewUpdate();
		}
	}

	public async triggerViewUpdate() {
		// 直接使用当前的过滤器状态重新加载当前视图
		this.switchView(this.currentViewId);

		// 更新操作按钮，确保重置筛选器按钮根据最新状态显示
		this.updateActionButtons();
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
			updatedTask.metadata.completedDate = Date.now();
			const completedMark = (
				this.plugin.settings.taskStatuses.completed || "x"
			).split("|")[0];
			if (updatedTask.status !== completedMark) {
				updatedTask.status = completedMark;
			}
		} else {
			updatedTask.metadata.completedDate = undefined;
			const notStartedMark =
				this.plugin.settings.taskStatuses.notStarted || " ";
			if (updatedTask.status.toLowerCase() === "x") {
				updatedTask.status = notStartedMark;
			}
		}

		const taskManager = this.plugin.taskManager;
		if (!taskManager) return;

		await taskManager.updateTask(updatedTask);
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
			// Re-throw the error so that the InlineEditor can handle it properly
			throw error;
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

			// 立即更新本地任务列表
			const index = this.tasks.findIndex((t) => t.id === originalTask.id);
			if (index !== -1) {
				this.tasks[index] = updatedTask;
			} else {
				console.warn(
					"Updated task not found in local list, might reload."
				);
			}

			// 如果任务在当前视图中，立即更新视图
			this.switchView(this.currentViewId);

			if (this.currentSelectedTaskId === updatedTask.id) {
				if (this.detailsComponent.isCurrentlyEditing()) {
					// Update the current task reference without re-rendering UI
					this.detailsComponent.currentTask = updatedTask;
				} else {
					this.detailsComponent.showTaskDetails(updatedTask);
				}
			}

			return updatedTask;
		} catch (error) {
			console.error(`Failed to update task ${originalTask.id}:`, error);
			throw error;
		}
	}

	private async editTask(task: Task) {
		const file = this.app.vault.getFileByPath(task.filePath);
		if (!(file instanceof TFile)) return;

		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file, {
			eState: {
				line: task.line,
			},
		});
	}

	async onClose() {
		// Cleanup TwoColumnView components
		this.twoColumnViewComponents.forEach((component) => {
			this.removeChild(component);
		});
		this.twoColumnViewComponents.clear();

		// Cleanup special view components
		// this.viewComponentManager.cleanup();

		this.unload();
		this.rootContainerEl.empty();
		this.rootContainerEl.detach();
	}

	onSettingsUpdate() {
		console.log("TaskView received settings update notification.");
		if (typeof this.sidebarComponent.renderSidebarItems === "function") {
			this.sidebarComponent.renderSidebarItems();
		} else {
			console.warn(
				"TaskView: SidebarComponent does not have renderSidebarItems method."
			);
		}
		this.switchView(this.currentViewId);
		this.updateHeaderDisplay();
	}

	// Method to handle status updates originating from Kanban drag-and-drop
	private handleKanbanTaskStatusUpdate = async (
		taskId: string,
		newStatusMark: string
	) => {
		console.log(
			`TaskView handling Kanban status update request for ${taskId} to mark ${newStatusMark}`
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
					await this.updateTask(taskToUpdate, {
						...taskToUpdate,
						status: newStatusMark,
						completed: isCompleted,
						metadata: {
							...taskToUpdate.metadata,
							completedDate: completedDate,
						},
					});
					console.log(
						`Task ${taskId} status update processed by TaskView.`
					);
				} catch (error) {
					console.error(
						`TaskView failed to update task status from Kanban callback for task ${taskId}:`,
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
				`TaskView could not find task with ID ${taskId} for Kanban status update.`
			);
		}
	};

	// 添加重置筛选器的方法
	public resetCurrentFilter() {
		console.log("重置实时筛选器");
		this.liveFilterState = null;
		this.currentFilterState = null;
		this.app.saveLocalStorage("task-genius-view-filter", null);
		this.applyCurrentFilter();
		this.updateActionButtons();
	}

	// 应用保存的筛选器配置
	private applySavedFilter(config: SavedFilterConfig) {
		console.log("应用保存的筛选器:", config.name);
		this.liveFilterState = JSON.parse(JSON.stringify(config.filterState));
		this.currentFilterState = JSON.parse(
			JSON.stringify(config.filterState)
		);
		console.log("applySavedFilter", this.liveFilterState);
		this.app.saveLocalStorage(
			"task-genius-view-filter",
			this.liveFilterState
		);
		this.applyCurrentFilter();
		this.updateActionButtons();
		new Notice(t("Filter applied: ") + config.name);
	}
}
