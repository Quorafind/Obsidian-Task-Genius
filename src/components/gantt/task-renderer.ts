import {
	App,
	Component,
	MarkdownRenderer as ObsidianMarkdownRenderer,
	TFile,
} from "obsidian";
import { GanttTaskItem, PlacedGanttTaskItem, Timescale } from "./gantt"; // 添加PlacedGanttTaskItem导入
import { Task } from "../../types/task";
import { MarkdownRendererComponent } from "../MarkdownRenderer";

// Constants from GanttComponent (consider moving to a shared config/constants file)
const ROW_HEIGHT = 40;
const TASK_BAR_HEIGHT_RATIO = 0.7;
const MILESTONE_SIZE = 12;
const TASK_LABEL_PADDING = 8;

// Interface for parameters needed by the task renderer
interface TaskRendererParams {
	app: App;
	taskGroupEl: SVGGElement; // The <g> element to draw tasks into
	preparedTasks: PlacedGanttTaskItem[]; // 使用PlacedGanttTaskItem替代GanttTaskItem
	rowHeight?: number; // Optional overrides
	taskBarHeightRatio?: number;
	milestoneSize?: number;
	showTaskLabels: boolean;
	useMarkdownRenderer: boolean;
	handleTaskClick: (task: Task) => void; // Callback for task clicks
	handleTaskContextMenu: (event: MouseEvent, task: Task) => void; // Callback for task context menu
	// Pass the parent component for MarkdownRenderer context if needed
	// We might need a different approach if static rendering is used
	parentComponent: Component;
}

export class TaskRendererComponent extends Component {
	private app: App;
	private taskGroupEl: SVGGElement;
	private params: TaskRendererParams | null = null;

	constructor(app: App, taskGroupEl: SVGGElement) {
		super();
		this.app = app;
		this.taskGroupEl = taskGroupEl;
	}

	onload() {
		console.log("TaskRendererComponent loaded.");
	}

	onunload() {
		console.log("TaskRendererComponent unloaded.");
		this.taskGroupEl.empty(); // Clear the task group
		// Note: MarkdownRenderer components associated with tasks
		// should be managed and unloaded by the parent (GanttComponent)
		// or handled differently if static rendering is sufficient.
	}

	updateParams(newParams: TaskRendererParams) {
		this.params = newParams;
		this.render();
	}

	private render() {
		if (!this.params) {
			console.warn(
				"TaskRendererComponent: Cannot render, params not set."
			);
			return;
		}

		// 性能优化：检查是否有任务需要渲染
		if (
			!this.params.preparedTasks ||
			this.params.preparedTasks.length === 0
		) {
			this.taskGroupEl.empty();
			return;
		}

		console.log(
			"TaskRenderer rendering tasks:",
			this.params.preparedTasks.length,
			"tasks"
		);

		this.taskGroupEl.empty(); // Clear previous tasks

		const { preparedTasks, parentComponent } = this.params;

		// 性能优化：使用文档片段批量添加元素
		const fragment = document.createDocumentFragment();
		const tempSvg = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"g"
		);
		fragment.appendChild(tempSvg);

		// 批量渲染任务
		preparedTasks.forEach((pt, index) => {
			try {
				this.renderSingleTask(pt, parentComponent, tempSvg);
			} catch (error) {
				console.error(`Error rendering task ${index}:`, error, pt);
			}
		});

		// 一次性添加所有任务到DOM
		while (tempSvg.firstChild) {
			this.taskGroupEl.appendChild(tempSvg.firstChild);
		}
	}

	private renderSingleTask(
		preparedTask: PlacedGanttTaskItem,
		parentComponent: Component,
		containerEl?: SVGGElement
	) {
		if (!this.params) return;

		const {
			app,
			handleTaskClick,
			handleTaskContextMenu,
			showTaskLabels,
			useMarkdownRenderer,
			rowHeight = ROW_HEIGHT,
			taskBarHeightRatio = TASK_BAR_HEIGHT_RATIO,
			milestoneSize = MILESTONE_SIZE,
		} = this.params;

		const task = preparedTask.task;
		const targetContainer = containerEl || this.taskGroupEl;

		// 验证任务位置数据
		if (preparedTask.startX === undefined || isNaN(preparedTask.startX)) {
			console.warn("Task has invalid startX:", preparedTask);
			return;
		}

		if (preparedTask.y === undefined || isNaN(preparedTask.y)) {
			console.warn("Task has invalid y position:", preparedTask);
			return;
		}

		const group = targetContainer.createSvg("g", {
			cls: "gantt-task-item",
		});
		group.setAttribute("data-task-id", task.id);

		// 添加任务点击监听器
		this.registerDomEvent(group as unknown as HTMLElement, "click", (e) => {
			e.stopPropagation();
			handleTaskClick(task);
		});
		this.registerDomEvent(group as unknown as HTMLElement, "contextmenu", (event) => {
			event.stopPropagation();
			handleTaskContextMenu(event, task);
		});

		const barHeight = rowHeight * taskBarHeightRatio;
		const barY = preparedTask.y - barHeight / 2;

		let taskElement: SVGElement | null = null;

		if (preparedTask.isMilestone) {
			// 渲染里程碑（菱形）
			const x = preparedTask.startX;
			const y = preparedTask.y;
			const size = milestoneSize;

			// 绘制菱形（旋转的正方形）
			taskElement = group.createSvg("rect", {
				attr: {
					x: x - size / 2,
					y: y + size / 2,
					width: size,
					height: size,
					rx: 2,
					ry: 2,
					class: "gantt-task-milestone", // 基础类
					transform: `rotate(45 ${x} ${y})`, // 旋转创建菱形
				},
			});

			// 安全地添加状态和优先级类
			if (task.status && task.status.trim()) {
				taskElement.dataset.status = task.status.trim();
			}
			if (
				task.metadata.priority &&
				String(task.metadata.priority).trim()
			) {
				taskElement.dataset.priority = String(
					task.metadata.priority
				).trim();
			}

			// 在右侧添加文本标签
			if (showTaskLabels && task.content) {
				this.renderMilestoneLabel(
					group,
					x,
					y,
					size,
					task,
					useMarkdownRenderer
				);
			}

			// 为里程碑添加工具提示
			group.setAttribute(
				"title",
				`${task.content}\nDue: ${
					task.metadata.dueDate
						? new Date(task.metadata.dueDate).toLocaleDateString()
						: "N/A"
				}`
			);
		} else if (preparedTask.width !== undefined && preparedTask.width > 0) {
			// 渲染任务条
			taskElement = group.createSvg("rect", {
				attr: {
					x: preparedTask.startX,
					y: barY,
					width: preparedTask.width,
					height: barHeight,
					rx: 3, // 圆角
					ry: 3,
					class: "gantt-task-bar", // 基础类
				},
			});

			// 安全地添加状态和优先级类
			if (task.status && task.status.trim()) {
				taskElement.classList.add(`status-${task.status.trim()}`);
			}
			if (
				task.metadata.priority &&
				String(task.metadata.priority).trim()
			) {
				taskElement.classList.add(
					`priority-${String(task.metadata.priority).trim()}`
				);
			}

			// 为任务条添加工具提示
			group.setAttribute(
				"title",
				`${task.content}\nStart: ${
					task.metadata.startDate
						? new Date(task.metadata.startDate).toLocaleDateString()
						: "N/A"
				}\nDue: ${
					task.metadata.dueDate
						? new Date(task.metadata.dueDate).toLocaleDateString()
						: "N/A"
				}`
			);

			// 渲染任务标签
			if (showTaskLabels && task.content) {
				this.renderTaskLabel(
					group,
					preparedTask,
					barHeight,
					task,
					useMarkdownRenderer
				);
			}
		}
	}

	/**
	 * 渲染里程碑标签
	 */
	private renderMilestoneLabel(
		group: SVGGElement,
		x: number,
		y: number,
		size: number,
		task: Task,
		useMarkdownRenderer: boolean
	) {
		if (useMarkdownRenderer) {
			// 创建外部对象来容纳markdown内容
			const foreignObject = group.createSvg("foreignObject", {
				attr: {
					x: x + size / 2 + TASK_LABEL_PADDING,
					y: y - 8, // 调整y位置使内容居中
					width: 300, // 设置合理的宽度
					height: 16, // 设置合理的高度
					class: "gantt-milestone-label-container",
				},
			});

			// 在外部对象内创建div用于markdown渲染
			const labelContainer = document.createElementNS(
				"http://www.w3.org/1999/xhtml",
				"div"
			);
			labelContainer.style.pointerEvents = "none"; // 防止捕获事件
			foreignObject.appendChild(labelContainer);

			// 使用markdown渲染器渲染任务内容
			const markdownRenderer = new MarkdownRendererComponent(
				this.app,
				labelContainer,
				task.filePath
			);
			this.addChild(markdownRenderer);
			markdownRenderer.render(task.content);
		} else {
			// 如果禁用markdown渲染，使用常规SVG文本
			const textLabel = group.createSvg("text", {
				attr: {
					x: x + size / 2 + TASK_LABEL_PADDING,
					y: y,
					class: "gantt-milestone-label",
					// 垂直对齐文本中心与菱形中心
					"dominant-baseline": "middle",
				},
			});
			textLabel.textContent = task.content;
			// 防止文本捕获指向组/圆圈的指针事件
			textLabel.style.pointerEvents = "none";
		}
	}

	/**
	 * 渲染任务标签
	 */
	private renderTaskLabel(
		group: SVGGElement,
		preparedTask: PlacedGanttTaskItem,
		barHeight: number,
		task: Task,
		useMarkdownRenderer: boolean
	) {
		const MIN_BAR_WIDTH_FOR_INTERNAL_LABEL = 30; // px, padding*2 + ~20px text

		if (
			preparedTask.width &&
			preparedTask.width >= MIN_BAR_WIDTH_FOR_INTERNAL_LABEL
		) {
			// 在内部渲染标签（使用foreignObject支持Markdown）
			const foreignObject = group.createSvg("foreignObject", {
				attr: {
					x: preparedTask.startX + TASK_LABEL_PADDING,
					// 相对于条的中心仔细定位Y
					y: preparedTask.y - barHeight / 2 - 2, // 可能需要微调
					width: preparedTask.width - TASK_LABEL_PADDING * 2, // 宽度足够
					height: barHeight + 4, // 允许稍微更多的高度
					class: "gantt-task-label-fo",
				},
			});

			// 防止foreignObject捕获指向条/组的指针事件
			foreignObject.style.pointerEvents = "none";

			// 在foreignObject内创建div容器
			const labelDiv = foreignObject.createDiv({
				cls: "gantt-task-label-markdown",
			});

			if (useMarkdownRenderer) {
				const sourcePath = task.filePath || "";
				labelDiv.empty();

				const markdownRenderer = this.addChild(
					new MarkdownRendererComponent(
						this.app,
						labelDiv as HTMLElement,
						sourcePath,
						true
					)
				);
				markdownRenderer.update(task.content);
			} else {
				// 回退到简单文本
				labelDiv.textContent = task.content;
				labelDiv.style.lineHeight = `${barHeight}px`;
				labelDiv.style.whiteSpace = "nowrap";
				labelDiv.style.overflow = "hidden";
				labelDiv.style.textOverflow = "ellipsis";
			}
		} else {
			// 在外部渲染标签（使用简单的SVG文本）
			const textLabel = group.createSvg("text", {
				attr: {
					// 将文本定位在窄条的右侧
					x:
						preparedTask.startX +
						(preparedTask.width || 0) +
						TASK_LABEL_PADDING,
					y: preparedTask.y, // 与条的逻辑中心垂直居中
					class: "gantt-task-label-external",
					// 垂直对齐文本中心与条中心
					"dominant-baseline": "middle",
					"text-anchor": "start",
				},
			});
			textLabel.textContent = task.content;
			// 防止文本捕获指向组/条的指针事件
			textLabel.style.pointerEvents = "none";
		}
	}
}
