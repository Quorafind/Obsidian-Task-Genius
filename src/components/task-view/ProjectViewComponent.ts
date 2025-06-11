import { App, setIcon } from "obsidian";
import { Task } from "../../types/task";
import { t } from "../../translations/helper";
import "../../styles/project-view.css";
import "../../styles/view-two-column-base.css";
import TaskProgressBarPlugin from "../../index";
import { TwoColumnViewBase, TwoColumnViewConfig } from "./TwoColumnViewBase";

export class ProjectViewComponent extends TwoColumnViewBase<string> {
	// 特定于项目视图的状态
	private allProjectsMap: Map<string, Set<string>> = new Map(); // 项目 -> 任务ID集合

	constructor(
		parentEl: HTMLElement,
		app: App,
		plugin: TaskProgressBarPlugin
	) {
		// 配置基类需要的参数
		const config: TwoColumnViewConfig = {
			classNamePrefix: "projects",
			leftColumnTitle: "Projects",
			rightColumnDefaultTitle: "Tasks",
			multiSelectText: "projects selected",
			emptyStateText: "Select a project to see related tasks",
			rendererContext: "projects",
			itemIcon: "folder",
		};

		super(parentEl, app, plugin, config);
	}

	/**
	 * 重写基类中的索引构建方法，为项目创建索引
	 */
	protected buildItemsIndex(): void {
		// 清除现有索引
		this.allProjectsMap.clear();

		// 为每个任务的项目建立索引
		this.allTasks.forEach((task) => {
			if (task.metadata.project) {
				if (!this.allProjectsMap.has(task.metadata.project)) {
					this.allProjectsMap.set(task.metadata.project, new Set());
				}
				this.allProjectsMap.get(task.metadata.project)?.add(task.id);
			}
		});

		// 更新项目计数
		if (this.countEl) {
			this.countEl.setText(`${this.allProjectsMap.size} projects`);
		}
	}

	/**
	 * 重写基类中的列表渲染方法，为项目创建列表
	 */
	protected renderItemsList(): void {
		// 清空现有列表
		this.itemsListEl.empty();

		// 按字母排序项目
		const sortedProjects = Array.from(this.allProjectsMap.keys()).sort();

		// 渲染每个项目
		sortedProjects.forEach((project) => {
			// 获取此项目的任务数量
			const taskCount = this.allProjectsMap.get(project)?.size || 0;

			// 创建项目项
			const projectItem = this.itemsListEl.createDiv({
				cls: "project-list-item",
			});

			// 项目图标
			const projectIconEl = projectItem.createDiv({
				cls: "project-icon",
			});
			setIcon(projectIconEl, "folder");

			// 项目名称
			const projectNameEl = projectItem.createDiv({
				cls: "project-name",
			});
			projectNameEl.setText(project);

			// 任务计数徽章
			const countEl = projectItem.createDiv({
				cls: "project-count",
			});
			countEl.setText(taskCount.toString());

			// 存储项目名称作为数据属性
			projectItem.dataset.project = project;

			// 检查此项目是否已被选中
			if (this.selectedItems.items.includes(project)) {
				projectItem.classList.add("selected");
			}

			// 添加点击处理
			this.registerDomEvent(projectItem, "click", (e) => {
				this.handleItemSelection(project, e.ctrlKey || e.metaKey);
			});
		});

		// 如果没有项目，添加空状态
		if (sortedProjects.length === 0) {
			const emptyEl = this.itemsListEl.createDiv({
				cls: "projects-empty-state",
			});
			emptyEl.setText(t("No projects found"));
		}
	}

	/**
	 * 更新基于所选项目的任务
	 */
	protected updateSelectedTasks(): void {
		if (this.selectedItems.items.length === 0) {
			this.cleanupRenderers();
			this.renderEmptyTaskList(t(this.config.emptyStateText));
			return;
		}

		// 获取来自所有选中项目的任务（OR逻辑）
		const resultTaskIds = new Set<string>();

		// 合并所有选中项目的任务ID集
		this.selectedItems.items.forEach((project) => {
			const taskIds = this.allProjectsMap.get(project);
			if (taskIds) {
				taskIds.forEach((id) => resultTaskIds.add(id));
			}
		});

		// 将任务ID转换为实际任务对象
		this.filteredTasks = this.allTasks.filter((task) =>
			resultTaskIds.has(task.id)
		);

		// 按优先级和截止日期排序
		this.filteredTasks.sort((a, b) => {
			// 首先按完成状态
			if (a.completed !== b.completed) {
				return a.completed ? 1 : -1;
			}

			// 然后按优先级（高到低）
			const priorityA = a.metadata.priority || 0;
			const priorityB = b.metadata.priority || 0;
			if (priorityA !== priorityB) {
				return priorityB - priorityA;
			}

			// 然后按截止日期（早到晚）
			const dueDateA = a.metadata.dueDate || Number.MAX_SAFE_INTEGER;
			const dueDateB = b.metadata.dueDate || Number.MAX_SAFE_INTEGER;
			return dueDateA - dueDateB;
		});

		// 更新任务列表
		this.renderTaskList();
	}

	/**
	 * 更新任务
	 */
	public updateTask(updatedTask: Task): void {
		let needsFullRefresh = false;
		const taskIndex = this.allTasks.findIndex(
			(t) => t.id === updatedTask.id
		);

		if (taskIndex !== -1) {
			const oldTask = this.allTasks[taskIndex];
			// 检查项目分配是否更改，这会影响侧边栏/过滤
			if (oldTask.metadata.project !== updatedTask.metadata.project) {
				needsFullRefresh = true;
			}
			this.allTasks[taskIndex] = updatedTask;
		} else {
			// 任务可能是新的，添加并刷新
			this.allTasks.push(updatedTask);
			needsFullRefresh = true;
		}

		// 如果项目更改或任务是新的，重建索引并完全刷新UI
		if (needsFullRefresh) {
			this.buildItemsIndex();
			this.renderItemsList(); // 更新左侧边栏
			this.updateSelectedTasks(); // 重新计算过滤后的任务并重新渲染右侧面板
		} else {
			// 否则，只更新过滤列表中的任务和渲染器
			const filteredIndex = this.filteredTasks.findIndex(
				(t) => t.id === updatedTask.id
			);
			if (filteredIndex !== -1) {
				this.filteredTasks[filteredIndex] = updatedTask;
				// 请求渲染器更新特定组件
				if (this.taskRenderer) {
					this.taskRenderer.updateTask(updatedTask);
				}
				// 可选：如果排序标准变化，重新排序然后重新渲染
				// this.renderTaskList();
			} else {
				// 任务可能由于更新而变为可见，需要重新过滤
				this.updateSelectedTasks();
			}
		}
	}
}
