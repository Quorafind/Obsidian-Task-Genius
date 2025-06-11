import { App, setIcon } from "obsidian";
import { Task } from "../../types/task";
import { t } from "../../translations/helper";
import "../../styles/tag-view.css";
import "../../styles/view-two-column-base.css";
import { TaskListRendererComponent } from "./TaskList";
import TaskProgressBarPlugin from "../../index";
import { TwoColumnViewBase, TwoColumnViewConfig } from "./TwoColumnViewBase";

// 用于存储标签节的数据结构
interface TagSection {
	tag: string;
	tasks: Task[];
	isExpanded: boolean;
	renderer?: TaskListRendererComponent;
}

export class TagViewComponent extends TwoColumnViewBase<string> {
	// 特定于标签视图的状态
	private allTagsMap: Map<string, Set<string>> = new Map(); // 标签 -> 任务ID集合
	private tagSections: TagSection[] = []; // 仅在多选且非树模式下使用

	constructor(
		parentEl: HTMLElement,
		app: App,
		plugin: TaskProgressBarPlugin
	) {
		// 配置基类需要的参数
		const config: TwoColumnViewConfig = {
			classNamePrefix: "tags",
			leftColumnTitle: "Tags",
			rightColumnDefaultTitle: "Tasks",
			multiSelectText: "tags selected",
			emptyStateText: "Select a tag to see related tasks",
			rendererContext: "tags",
			itemIcon: "hash",
		};

		super(parentEl, app, plugin, config);
	}

	/**
	 * 重写基类中的索引构建方法，为标签创建索引
	 */
	protected buildItemsIndex(): void {
		// 清除已有索引
		this.allTagsMap.clear();

		// 为每个任务的标签建立索引
		this.allTasks.forEach((task) => {
			if (task.metadata.tags && task.metadata.tags.length > 0) {
				task.metadata.tags.forEach((tag) => {
					// 跳过非字符串类型的标签
					if (typeof tag !== "string") {
						return;
					}

					if (!this.allTagsMap.has(tag)) {
						this.allTagsMap.set(tag, new Set());
					}
					this.allTagsMap.get(tag)?.add(task.id);
				});
			}
		});

		// 更新标签计数
		if (this.countEl) {
			this.countEl.setText(`${this.allTagsMap.size} tags`);
		}
	}

	/**
	 * 重写基类中的列表渲染方法，为标签创建层级视图
	 */
	protected renderItemsList(): void {
		// 清空现有列表
		this.itemsListEl.empty();

		// 按字母排序标签
		const sortedTags = Array.from(this.allTagsMap.keys()).sort();

		// 创建层级结构
		const tagHierarchy: Record<string, any> = {};

		sortedTags.forEach((tag) => {
			const parts = tag.split("/");
			let current = tagHierarchy;

			parts.forEach((part, index) => {
				if (!current[part]) {
					current[part] = {
						_tasks: new Set(),
						_path: parts.slice(0, index + 1).join("/"),
					};
				}

				// 添加任务到此层级
				const taskIds = this.allTagsMap.get(tag);
				if (taskIds) {
					taskIds.forEach((id) => current[part]._tasks.add(id));
				}

				current = current[part];
			});
		});

		// 渲染层级结构
		this.renderTagHierarchy(tagHierarchy, this.itemsListEl, 0);
	}

	/**
	 * 递归渲染标签层级结构
	 */
	private renderTagHierarchy(
		node: Record<string, any>,
		parentEl: HTMLElement,
		level: number
	) {
		// 按字母排序键，但排除元数据属性
		const keys = Object.keys(node)
			.filter((k) => !k.startsWith("_"))
			.sort();

		keys.forEach((key) => {
			const childNode = node[key];
			const fullPath = childNode._path;
			const taskCount = childNode._tasks.size;

			// 创建标签项
			const tagItem = parentEl.createDiv({
				cls: "tag-list-item",
				attr: {
					"data-tag": fullPath,
					"aria-label": fullPath,
				},
			});

			// 基于层级添加缩进
			if (level > 0) {
				const indentEl = tagItem.createDiv({
					cls: "tag-indent",
				});
				indentEl.style.width = `${level * 20}px`;
			}

			// 标签图标和颜色
			const tagIconEl = tagItem.createDiv({
				cls: "tag-icon",
			});
			setIcon(tagIconEl, "hash");

			// 标签名称和计数
			const tagNameEl = tagItem.createDiv({
				cls: "tag-name",
			});
			tagNameEl.setText(key.replace("#", ""));

			const tagCountEl = tagItem.createDiv({
				cls: "tag-count",
			});
			tagCountEl.setText(taskCount.toString());

			// 存储完整标签路径
			tagItem.dataset.tag = fullPath;

			// 检查此标签是否已被选中
			if (this.selectedItems.items.includes(fullPath)) {
				tagItem.classList.add("selected");
			}

			// 添加点击处理
			this.registerDomEvent(tagItem, "click", (e) => {
				this.handleItemSelection(fullPath, e.ctrlKey || e.metaKey);
			});

			// 如果此节点有子节点，递归渲染它们
			const hasChildren =
				Object.keys(childNode).filter((k) => !k.startsWith("_"))
					.length > 0;
			if (hasChildren) {
				// 创建子项容器
				const childrenContainer = parentEl.createDiv({
					cls: "tag-children",
				});

				// 渲染子项
				this.renderTagHierarchy(
					childNode,
					childrenContainer,
					level + 1
				);
			}
		});
	}

	/**
	 * 更新基于所选标签的任务
	 */
	protected updateSelectedTasks(): void {
		if (this.selectedItems.items.length === 0) {
			this.cleanupRenderers();
			this.renderEmptyTaskList(t(this.config.emptyStateText));
			return;
		}

		// 获取拥有任意选中标签的任务（OR逻辑）
		const taskSets: Set<string>[] = this.selectedItems.items.map((tag) => {
			// 为每个选中的标签，包含来自子标签的任务
			const matchingTasks = new Set<string>();

			// 添加直接匹配
			const directMatches = this.allTagsMap.get(tag);
			if (directMatches) {
				directMatches.forEach((id) => matchingTasks.add(id));
			}

			// 添加来自子标签的匹配（以父标签路径开头的标签）
			this.allTagsMap.forEach((taskIds, childTag) => {
				if (childTag !== tag && childTag.startsWith(tag + "/")) {
					taskIds.forEach((id) => matchingTasks.add(id));
				}
			});

			return matchingTasks;
		});

		if (taskSets.length === 0) {
			this.filteredTasks = [];
		} else {
			// 联合所有集合（OR逻辑）
			const resultTaskIds = new Set<string>();

			// 合并所有集合
			taskSets.forEach((set) => {
				set.forEach((id) => resultTaskIds.add(id));
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
		}

		// 决定是创建分区还是渲染平面/树状视图
		if (!this.isTreeView && this.selectedItems.items.length > 1) {
			this.createTagSections();
		} else {
			// 直接渲染，不分区
			this.tagSections = [];
			this.renderTaskList();
		}
	}

	/**
	 * 创建标签分区（多选非树模式下使用）
	 */
	private createTagSections(): void {
		// 清除先前的分区及其渲染器
		this.cleanupRenderers();
		this.tagSections = [];

		// 按照匹配的选中标签分组任务（包括子标签）
		const tagTaskMap = new Map<string, Task[]>();
		this.selectedItems.items.forEach((tag) => {
			const tasksForThisTagBranch = this.filteredTasks.filter((task) => {
				if (!task.metadata.tags) return false;
				return task.metadata.tags.some(
					(taskTag) =>
						// 跳过非字符串类型的标签
						typeof taskTag === "string" &&
						(taskTag === tag || taskTag.startsWith(tag + "/"))
				);
			});

			if (tasksForThisTagBranch.length > 0) {
				tagTaskMap.set(tag, tasksForThisTagBranch);
			}
		});

		// 创建分区对象
		tagTaskMap.forEach((tasks, tag) => {
			this.tagSections.push({
				tag: tag,
				tasks: tasks,
				isExpanded: true,
			});
		});

		// 按标签名称排序分区
		this.tagSections.sort((a, b) => a.tag.localeCompare(b.tag));

		// 更新任务列表视图
		this.renderTagSections();
	}

	/**
	 * 渲染标签分区（多选模式下）
	 */
	private renderTagSections(): void {
		// 更新标题
		let title = t(this.config.rightColumnDefaultTitle);
		if (this.selectedItems.items.length > 1) {
			title = `${this.selectedItems.items.length} ${t(
				this.config.multiSelectText
			)}`;
		}
		const countText = `${this.filteredTasks.length} ${t("tasks")}`;
		this.updateTaskListHeader(title, countText);

		// 渲染每个分区
		this.taskListContainerEl.empty();
		this.tagSections.forEach((section) => {
			const sectionEl = this.taskListContainerEl.createDiv({
				cls: "task-tag-section",
			});

			// 分区标题
			const headerEl = sectionEl.createDiv({ cls: "tag-section-header" });
			const toggleEl = headerEl.createDiv({ cls: "section-toggle" });
			setIcon(
				toggleEl,
				section.isExpanded ? "chevron-down" : "chevron-right"
			);
			const titleEl = headerEl.createDiv({ cls: "section-title" });
			titleEl.setText(`#${section.tag.replace("#", "")}`);
			const countEl = headerEl.createDiv({ cls: "section-count" });
			countEl.setText(`${section.tasks.length}`);

			// 任务容器
			const taskListEl = sectionEl.createDiv({ cls: "section-tasks" });
			if (!section.isExpanded) {
				taskListEl.hide();
			}

			section.renderer = new TaskListRendererComponent(
				this,
				taskListEl,
				this.plugin,
				this.app,
				this.config.rendererContext
			);
			section.renderer.onTaskSelected = this.onTaskSelected;
			section.renderer.onTaskCompleted = this.onTaskCompleted;
			section.renderer.onTaskContextMenu = this.onTaskContextMenu;

			// 渲染此分区的任务（分区内始终使用列表视图）
			section.renderer.renderTasks(
				section.tasks,
				this.isTreeView,
				this.allTasksMap,
				t("No tasks found for this tag.")
			);

			// 注册切换事件
			this.registerDomEvent(headerEl, "click", () => {
				section.isExpanded = !section.isExpanded;
				setIcon(
					toggleEl,
					section.isExpanded ? "chevron-down" : "chevron-right"
				);
				section.isExpanded ? taskListEl.show() : taskListEl.hide();
			});
		});
	}

	/**
	 * 清理渲染器，重写基类实现以处理分区
	 */
	protected cleanupRenderers(): void {
		// 调用父类的渲染器清理
		super.cleanupRenderers();

		// 清理分区渲染器
		this.tagSections.forEach((section) => {
			if (section.renderer) {
				this.removeChild(section.renderer);
				section.renderer = undefined;
			}
		});
	}

	/**
	 * 渲染任务列表，重写以支持分区模式
	 */
	protected renderTaskList(): void {
		// 决定渲染模式：分区、平面或树状
		const useSections =
			!this.isTreeView &&
			this.tagSections.length > 0 &&
			this.selectedItems.items.length > 1;

		if (useSections) {
			this.renderTagSections();
		} else {
			// 调用父类实现的标准渲染
			super.renderTaskList();
		}
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
			// 检查标签是否变化，需要重新构建/渲染
			const tagsChanged =
				!oldTask.metadata.tags ||
				!updatedTask.metadata.tags ||
				oldTask.metadata.tags.join(",") !==
					updatedTask.metadata.tags.join(",");

			if (tagsChanged) {
				needsFullRefresh = true;
			}
			this.allTasks[taskIndex] = updatedTask;
		} else {
			this.allTasks.push(updatedTask);
			needsFullRefresh = true; // 新任务，需要完全刷新
		}

		// 如果标签变化或任务是新的，重建索引并完全刷新UI
		if (needsFullRefresh) {
			this.buildItemsIndex();
			this.renderItemsList(); // 更新左侧边栏
			this.updateSelectedTasks(); // 重新计算过滤后的任务并重新渲染右侧面板
		} else {
			// 否则，仅更新过滤列表中的任务
			const filteredIndex = this.filteredTasks.findIndex(
				(t) => t.id === updatedTask.id
			);
			if (filteredIndex !== -1) {
				this.filteredTasks[filteredIndex] = updatedTask;

				// 找到正确的渲染器（主要或分区）并更新任务
				if (this.taskRenderer) {
					this.taskRenderer.updateTask(updatedTask);
				} else {
					// 检查分区模式
					this.tagSections.forEach((section) => {
						// 检查任务是否属于此分区的标签分支
						if (
							updatedTask.metadata.tags?.some(
								(taskTag: string) =>
									// 跳过非字符串类型的标签
									typeof taskTag === "string" &&
									(taskTag === section.tag ||
										taskTag.startsWith(section.tag + "/"))
							)
						) {
							// 检查任务是否实际存在于此分区的列表中
							if (
								section.tasks.some(
									(t) => t.id === updatedTask.id
								)
							) {
								section.renderer?.updateTask(updatedTask);
							}
						}
					});
				}
			} else {
				// 由于更新，任务可能变为可见/不可见，需要重新过滤
				this.updateSelectedTasks();
			}
		}
	}
}
