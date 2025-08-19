import {
	App,
	Component,
	setIcon,
	ExtraButtonComponent,
	Platform,
} from "obsidian";
import { Task } from "../../types/task";
import { TaskListRendererComponent } from "./TaskList";
import { t } from "../../translations/helper";
import TaskProgressBarPlugin from "../../index";
import { getInitialViewMode, saveViewMode } from "../../utils/ui/view-mode-utils";
import "../../styles/view.css";

/**
 * 双栏组件的基础接口配置
 */
export interface TwoColumnViewConfig {
	// 双栏视图的元素类名前缀
	classNamePrefix: string;
	// 左侧栏的标题
	leftColumnTitle: string;
	// 右侧栏默认标题
	rightColumnDefaultTitle: string;
	// 多选模式的文本
	multiSelectText: string;
	// 空状态显示文本
	emptyStateText: string;
	// 任务显示区的上下文（用于传给TaskListRendererComponent）
	rendererContext: string;
	// 项目图标
	itemIcon: string;
}

/**
 * 选中项状态接口
 */
export interface SelectedItems<T> {
	items: T[]; // 选中的项（标签或项目）
	tasks: Task[]; // 相关联的任务
	isMultiSelect: boolean; // 是否处于多选模式
}

/**
 * 双栏视图组件基类
 */
export abstract class TwoColumnViewBase<T extends string> extends Component {
	// UI Elements
	public containerEl: HTMLElement;
	protected leftColumnEl: HTMLElement;
	protected rightColumnEl: HTMLElement;
	protected titleEl: HTMLElement;
	protected countEl: HTMLElement;
	protected leftHeaderEl: HTMLElement;
	protected itemsListEl: HTMLElement;
	protected rightHeaderEl: HTMLElement;
	protected taskListContainerEl: HTMLElement;

	// Child components
	protected taskRenderer: TaskListRendererComponent | null = null;

	// State
	protected allTasks: Task[] = [];
	protected filteredTasks: Task[] = [];
	protected selectedItems: SelectedItems<T> = {
		items: [],
		tasks: [],
		isMultiSelect: false,
	};
	protected isTreeView: boolean = false;

	// Events
	public onTaskSelected: (task: Task) => void;
	public onTaskCompleted: (task: Task) => void;
	public onTaskUpdate: (task: Task, updatedTask: Task) => Promise<void>;
	public onTaskContextMenu: (event: MouseEvent, task: Task) => void =
		() => {};

	protected allTasksMap: Map<string, Task> = new Map();

	constructor(
		protected parentEl: HTMLElement,
		protected app: App,
		protected plugin: TaskProgressBarPlugin,
		protected config: TwoColumnViewConfig
	) {
		super();
	}

	onload() {
		// 创建主容器
		this.containerEl = this.parentEl.createDiv({
			cls: `${this.config.classNamePrefix}-container`,
		});

		// 创建内容容器
		const contentContainer = this.containerEl.createDiv({
			cls: `${this.config.classNamePrefix}-content`,
		});

		// 左栏：创建项目列表
		this.createLeftColumn(contentContainer);

		// 右栏：创建任务列表
		this.createRightColumn(contentContainer);

		// 初始化视图模式
		this.initializeViewMode();

		// 初始化任务渲染器
		this.initializeTaskRenderer();
	}

	protected createLeftColumn(parentEl: HTMLElement) {
		this.leftColumnEl = parentEl.createDiv({
			cls: `${this.config.classNamePrefix}-left-column`,
		});

		// 左栏标题区
		this.leftHeaderEl = this.leftColumnEl.createDiv({
			cls: `${this.config.classNamePrefix}-sidebar-header`,
		});

		const headerTitle = this.leftHeaderEl.createDiv({
			cls: `${this.config.classNamePrefix}-sidebar-title`,
			text: t(this.config.leftColumnTitle),
		});

		// 添加多选切换按钮
		const multiSelectBtn = this.leftHeaderEl.createDiv({
			cls: `${this.config.classNamePrefix}-multi-select-btn`,
		});
		setIcon(multiSelectBtn, "list-plus");
		multiSelectBtn.setAttribute("aria-label", t("Toggle multi-select"));

		this.registerDomEvent(multiSelectBtn, "click", () => {
			this.toggleMultiSelect();
		});

		// 移动端添加关闭按钮
		if (Platform.isPhone) {
			const closeBtn = this.leftHeaderEl.createDiv({
				cls: `${this.config.classNamePrefix}-sidebar-close`,
			});

			new ExtraButtonComponent(closeBtn).setIcon("x").onClick(() => {
				this.toggleLeftColumnVisibility(false);
			});
		}

		// 项目列表容器
		this.itemsListEl = this.leftColumnEl.createDiv({
			cls: `${this.config.classNamePrefix}-sidebar-list`,
		});
	}

	protected createRightColumn(parentEl: HTMLElement) {
		this.rightColumnEl = parentEl.createDiv({
			cls: `${this.config.classNamePrefix}-right-column`,
		});

		// 任务列表标题区
		this.rightHeaderEl = this.rightColumnEl.createDiv({
			cls: `${this.config.classNamePrefix}-task-header`,
		});

		// 移动端添加侧边栏切换按钮
		if (Platform.isPhone) {
			this.rightHeaderEl.createEl(
				"div",
				{
					cls: `${this.config.classNamePrefix}-sidebar-toggle`,
				},
				(el) => {
					new ExtraButtonComponent(el)
						.setIcon("sidebar")
						.onClick(() => {
							this.toggleLeftColumnVisibility();
						});
				}
			);
		}

		const taskTitleEl = this.rightHeaderEl.createDiv({
			cls: `${this.config.classNamePrefix}-task-title`,
		});
		taskTitleEl.setText(t(this.config.rightColumnDefaultTitle));

		const taskCountEl = this.rightHeaderEl.createDiv({
			cls: `${this.config.classNamePrefix}-task-count`,
		});
		taskCountEl.setText(`0 ${t("tasks")}`);

		// 添加视图切换按钮
		const viewToggleBtn = this.rightHeaderEl.createDiv({
			cls: "view-toggle-btn",
		});
		setIcon(viewToggleBtn, "list");
		viewToggleBtn.setAttribute("aria-label", t("Toggle list/tree view"));

		this.registerDomEvent(viewToggleBtn, "click", () => {
			this.toggleViewMode();
		});

		// 任务列表容器
		this.taskListContainerEl = this.rightColumnEl.createDiv({
			cls: `${this.config.classNamePrefix}-task-list`,
		});
	}

	protected initializeTaskRenderer() {
		this.taskRenderer = new TaskListRendererComponent(
			this,
			this.taskListContainerEl,
			this.plugin,
			this.app,
			this.config.rendererContext
		);

		// 连接事件处理器
		this.taskRenderer.onTaskSelected = (task) => {
			if (this.onTaskSelected) this.onTaskSelected(task);
		};
		this.taskRenderer.onTaskCompleted = (task) => {
			if (this.onTaskCompleted) this.onTaskCompleted(task);
		};
		this.taskRenderer.onTaskUpdate = async (originalTask, updatedTask) => {
			if (this.onTaskUpdate) {
				await this.onTaskUpdate(originalTask, updatedTask);
			}
		};
		this.taskRenderer.onTaskContextMenu = (event, task) => {
			if (this.onTaskContextMenu) this.onTaskContextMenu(event, task);
		};
	}

	public setTasks(tasks: Task[]) {
		this.allTasks = tasks;
		this.buildItemsIndex();
		this.renderItemsList();

		// 如果已选择项目，更新任务
		if (this.selectedItems.items.length > 0) {
			this.updateSelectedTasks();
		} else {
			this.cleanupRenderers();
			this.renderEmptyTaskList(t(this.config.emptyStateText));
		}
	}

	/**
	 * 构建项目索引
	 * 子类需要实现这个方法以基于当前任务构建自己的索引
	 */
	protected abstract buildItemsIndex(): void;

	/**
	 * 渲染左侧栏项目列表
	 * 子类需要实现这个方法以渲染自己的条目
	 */
	protected abstract renderItemsList(): void;

	/**
	 * Handle item selection
	 * @param item Selected item
	 * @param isCtrlPressed Whether Ctrl key is pressed (multi-select)
	 */
	protected handleItemSelection(item: T, isCtrlPressed: boolean) {
		if (this.selectedItems.isMultiSelect || isCtrlPressed) {
			// Multi-select mode
			const index = this.selectedItems.items.indexOf(item);
			if (index === -1) {
				// Add selection
				this.selectedItems.items.push(item);
			} else {
				// Remove selection
				this.selectedItems.items.splice(index, 1);
			}

			// If no items selected and not in multi-select mode, reset view
			if (
				this.selectedItems.items.length === 0 &&
				!this.selectedItems.isMultiSelect
			) {
				this.cleanupRenderers();
				this.renderEmptyTaskList(t(this.config.emptyStateText));
				return;
			}
		} else {
			// Single-select mode
			this.selectedItems.items = [item];
		}

		// Update tasks based on selection
		this.updateSelectedTasks();

		// Hide sidebar after selection on mobile
		if (Platform.isPhone) {
			this.toggleLeftColumnVisibility(false);
		}
	}

	/**
	 * Toggle multi-select mode
	 */
	protected toggleMultiSelect() {
		this.selectedItems.isMultiSelect = !this.selectedItems.isMultiSelect;

		// 更新UI以反映多选模式
		if (this.selectedItems.isMultiSelect) {
			this.containerEl.classList.add("multi-select-mode");
		} else {
			this.containerEl.classList.remove("multi-select-mode");

			// If no items selected, reset view
			if (this.selectedItems.items.length === 0) {
				this.cleanupRenderers();
				this.renderEmptyTaskList(t(this.config.emptyStateText));
			}
		}
	}

	/**
	 * Initialize view mode from saved state or global default
	 */
	protected initializeViewMode() {
		// Use a default view ID for two-column views
		const viewId = this.config.classNamePrefix.replace("-", "");
		this.isTreeView = getInitialViewMode(this.app, this.plugin, viewId);

		// Update the toggle button icon to match the initial state
		const viewToggleBtn = this.rightColumnEl?.querySelector(
			".view-toggle-btn"
		) as HTMLElement;
		if (viewToggleBtn) {
			setIcon(viewToggleBtn, this.isTreeView ? "git-branch" : "list");
		}
	}

	/**
	 * Toggle view mode (list/tree)
	 */
	protected toggleViewMode() {
		this.isTreeView = !this.isTreeView;

		// Update toggle button icon
		const viewToggleBtn = this.rightColumnEl.querySelector(
			".view-toggle-btn"
		) as HTMLElement;
		if (viewToggleBtn) {
			setIcon(viewToggleBtn, this.isTreeView ? "git-branch" : "list");
		}

		// Save the new view mode state
		const viewId = this.config.classNamePrefix.replace("-", "");
		saveViewMode(this.app, viewId, this.isTreeView);

		// 使用新模式重新渲染任务列表
		this.renderTaskList();
	}

	/**
	 * Update tasks related to selected items
	 * Subclasses need to implement this method to filter tasks based on selected items
	 */
	protected abstract updateSelectedTasks(): void;

	/**
	 * Update task list header
	 */
	protected updateTaskListHeader(title: string, countText: string) {
		const taskHeaderEl = this.rightColumnEl.querySelector(
			`.${this.config.classNamePrefix}-task-title`
		);
		if (taskHeaderEl) {
			taskHeaderEl.textContent = title;
		}

		const taskCountEl = this.rightColumnEl.querySelector(
			`.${this.config.classNamePrefix}-task-count`
		);
		if (taskCountEl) {
			taskCountEl.textContent = countText;
		}
	}

	/**
	 * Clean up renderers
	 */
	protected cleanupRenderers() {
		if (this.taskRenderer) {
			// Simple reset instead of full deletion to reuse
			this.taskListContainerEl.empty();
		}
	}

	/**
	 * Render task list
	 */
	protected renderTaskList() {
		// Update title
		let title = t(this.config.rightColumnDefaultTitle);
		if (this.selectedItems.items.length === 1) {
			title = String(this.selectedItems.items[0]);
		} else if (this.selectedItems.items.length > 1) {
			title = `${this.selectedItems.items.length} ${t(
				this.config.multiSelectText
			)}`;
		}
		const countText = `${this.filteredTasks.length} ${t("tasks")}`;
		this.updateTaskListHeader(title, countText);

		console.log("filteredTasks", this.filteredTasks, this.isTreeView);
		this.allTasksMap = new Map(
			this.allTasks.map((task) => [task.id, task])
		);
		// Use renderer to display tasks
		if (this.taskRenderer) {
			this.taskRenderer.renderTasks(
				this.filteredTasks,
				this.isTreeView,
				this.allTasksMap,
				t("No tasks in the selected items")
			);
		}
	}

	/**
	 * 渲染空任务列表
	 */
	protected renderEmptyTaskList(message: string) {
		this.cleanupRenderers();
		this.taskListContainerEl.empty();

		// 显示消息
		const emptyEl = this.taskListContainerEl.createDiv({
			cls: `${this.config.classNamePrefix}-empty-state`,
		});
		emptyEl.setText(message);
	}

	/**
	 * 更新单个任务
	 * 子类需要处理任务更新对其索引的影响
	 */
	public abstract updateTask(updatedTask: Task): void;

	onunload() {
		this.containerEl.empty();
		this.containerEl.remove();
	}

	/**
	 * 切换左侧栏可见性（支持动画）
	 */
	protected toggleLeftColumnVisibility(visible?: boolean) {
		if (visible === undefined) {
			// 根据当前状态切换
			visible = !this.leftColumnEl.hasClass("is-visible");
		}

		if (visible) {
			this.leftColumnEl.addClass("is-visible");
			this.leftColumnEl.show();
		} else {
			this.leftColumnEl.removeClass("is-visible");

			// 等待动画完成后隐藏
			setTimeout(() => {
				if (!this.leftColumnEl.hasClass("is-visible")) {
					this.leftColumnEl.hide();
				}
			}, 300); // 匹配CSS过渡持续时间
		}
	}
}
