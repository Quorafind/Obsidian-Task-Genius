import { App, Component, WorkspaceLeaf } from "obsidian";
import TaskProgressBarPlugin from "../../index"; // Adjust path as needed
import { Task } from "src/utils/types/TaskIndex"; // Adjust path as needed
import { KanbanColumnComponent } from "./KanbanColumn";
import { DragManager, DragMoveEvent, DragEndEvent } from "../DragManager";
import "../../styles/kanban/kanban.css";
import { t } from "../../translations/helper"; // Added import for t

// CSS classes for drop indicators
const DROP_INDICATOR_BEFORE_CLASS = "tg-kanban-card--drop-indicator-before";
const DROP_INDICATOR_AFTER_CLASS = "tg-kanban-card--drop-indicator-after";
const DROP_INDICATOR_EMPTY_CLASS =
	"tg-kanban-column-content--drop-indicator-empty";

export class KanbanComponent extends Component {
	plugin: TaskProgressBarPlugin;
	app: App;
	public containerEl: HTMLElement;
	private columns: KanbanColumnComponent[] = [];
	private columnContainerEl: HTMLElement;
	private dragManager: DragManager;
	private tasks: Task[] = [];
	private filteredTasks: Task[] = []; // Added for filtering
	private filterQuery: string = ""; // Added for filtering
	private filterInputEl: HTMLInputElement; // Added for filter input element
	private params: {
		onTaskStatusUpdate?: (
			taskId: string,
			newStatusMark: string
		) => Promise<void>;
		onTaskSelected?: (task: Task) => void;
		onTaskCompleted?: (task: Task) => void;
		onTaskContextMenu?: (ev: MouseEvent, task: Task) => void;
	};

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		parentEl: HTMLElement,
		initialTasks: Task[] = [],
		params: {
			onTaskStatusUpdate?: (
				taskId: string,
				newStatusMark: string
			) => Promise<void>;
			onTaskSelected?: (task: Task) => void;
			onTaskCompleted?: (task: Task) => void;
			onTaskContextMenu?: (ev: MouseEvent, task: Task) => void;
		} = {}
	) {
		super();
		this.app = app;
		this.plugin = plugin;
		this.containerEl = parentEl.createDiv("tg-kanban-component-container");
		this.tasks = initialTasks;
		this.params = params;
	}

	override onload() {
		super.onload();
		this.containerEl.empty();
		this.containerEl.addClass("tg-kanban-view");

		this.renderFilterControls(
			this.containerEl.createDiv({ cls: "tg-kanban-filters" })
		);

		this.columnContainerEl = this.containerEl.createDiv({
			cls: "tg-kanban-column-container",
		});

		this.initializeDragManager();
		this.renderColumns();

		console.log("KanbanComponent loaded.");
	}

	override onunload() {
		super.onunload();
		this.columns.forEach((col) => col.unload());
		this.dragManager?.unload();
		this.columns = [];
		this.containerEl.empty();
		console.log("KanbanComponent unloaded.");
	}

	private renderFilterControls(containerEl: HTMLElement) {
		// Clear placeholder text
		containerEl.empty();

		// Create filter input
		this.filterInputEl = containerEl.createEl("input", {
			type: "text",
			placeholder: t("Filter tasks... (by content, project, tag)"),
			cls: "tg-kanban-filter-input",
		});

		// Add event listener with debouncing
		this.registerDomEvent(
			this.filterInputEl,
			"input",
			this.debounce(() => {
				this.filterQuery = this.filterInputEl.value.toLowerCase();
				this.applyFiltersAndRender();
			}, 300)
		);
	}

	// Debounce utility
	private debounce(func: (...args: any[]) => void, wait: number) {
		let timeout: number | null = null;
		return (...args: any[]) => {
			const later = () => {
				timeout = null;
				func(...args);
			};
			if (timeout !== null) {
				clearTimeout(timeout);
			}
			timeout = window.setTimeout(later, wait);
		};
	}

	public setTasks(tasks: Task[]) {
		this.tasks = tasks;
		// Apply filters and render when tasks are set
		this.applyFiltersAndRender();
	}

	private applyFiltersAndRender() {
		// 1. Filter tasks
		if (!this.filterQuery) {
			this.filteredTasks = [...this.tasks]; // No filter, use all tasks
		} else {
			this.filteredTasks = this.tasks.filter((task) => {
				const query = this.filterQuery;
				// Check content, project, and tags
				return (
					task.content.toLowerCase().includes(query) ||
					(task.project &&
						task.project.toLowerCase().includes(query)) ||
					(task.tags &&
						task.tags.some((tag) =>
							tag.toLowerCase().includes(query)
						))
				);
			});
		}

		// 2. Re-render columns with filtered tasks
		this.renderColumns();
	}

	private renderColumns() {
		this.columnContainerEl.empty();
		this.columns.forEach((col) => this.removeChild(col));
		this.columns = [];

		const statusCycle = this.plugin.settings.taskStatusCycle;
		let statusNames =
			statusCycle.length > 0
				? statusCycle
				: ["Todo", "In Progress", "Done"];

		const spaceStatus: string[] = [];
		const xStatus: string[] = [];
		const otherStatuses: string[] = [];

		statusNames.forEach((statusName) => {
			const statusMark =
				this.plugin.settings.taskStatusMarks[statusName] || " ";

			if (
				this.plugin.settings.excludeMarksFromCycle &&
				this.plugin.settings.excludeMarksFromCycle.includes(statusName)
			) {
				return;
			}

			if (statusMark === " ") {
				spaceStatus.push(statusName);
			} else if (statusMark === "x") {
				xStatus.push(statusName);
			} else {
				otherStatuses.push(statusName);
			}
		});

		// 按照要求的顺序合并状态名称
		statusNames = [...spaceStatus, ...otherStatuses, ...xStatus];

		statusNames.forEach((statusName) => {
			const column = new KanbanColumnComponent(
				this.app,
				this.plugin,
				this.columnContainerEl,
				statusName,
				// Pass filtered tasks for this status to the column
				this.getTasksForStatus(statusName),
				this.params
			);
			this.addChild(column);
			this.columns.push(column);
		});

		// Re-initialize drag manager after columns are rendered
		this.initializeDragManager();
	}

	private getTasksForStatus(statusName: string): Task[] {
		const statusMark =
			this.plugin.settings.taskStatusMarks[statusName] || " ";

		// Filter from the already filtered list
		const tasksForStatus = this.filteredTasks.filter((task) => {
			const taskStatusMark = task.status || " ";
			return taskStatusMark === statusMark;
		});

		// Optional: Sort tasks within the status column
		tasksForStatus.sort((a, b) => {
			const priorityA = a.priority ?? 0;
			const priorityB = b.priority ?? 0;
			if (priorityA !== priorityB) return priorityB - priorityA;

			const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
			const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
			return dateA - dateB;
		});

		return tasksForStatus;
	}

	private initializeDragManager() {
		if (this.dragManager) {
			this.removeChild(this.dragManager);
		}

		this.dragManager = new DragManager({
			container: this.columnContainerEl,
			draggableSelector: ".tg-kanban-card",
			dropZoneSelector: ".tg-kanban-column-content",
			cloneElement: true,
			dragClass: "tg-kanban-card-dragging",
			ghostClass: "tg-kanban-card-ghost",
			onDragStart: (data) => {
				console.log("Drag Start:", data.element.dataset.taskId);
				this.columnContainerEl
					.querySelectorAll(".tg-kanban-column-content")
					.forEach((el) => {
						el.classList.add("tg-kanban-drop-target-active");
					});
				return true;
			},
			onDragMove: (data) => {
				this.handleDragMove(data);
			},
			onDragEnd: async (data) => {
				this.handleDragEnd(data);
			},
		});
		this.addChild(this.dragManager);
	}

	private clearDropIndicators() {
		this.columnContainerEl
			.querySelectorAll(
				`.${DROP_INDICATOR_BEFORE_CLASS}, .${DROP_INDICATOR_AFTER_CLASS}`
			)
			.forEach((el) => {
				el.classList.remove(
					DROP_INDICATOR_BEFORE_CLASS,
					DROP_INDICATOR_AFTER_CLASS
				);
			});
		this.columnContainerEl
			.querySelectorAll(`.${DROP_INDICATOR_EMPTY_CLASS}`)
			.forEach((el) => el.classList.remove(DROP_INDICATOR_EMPTY_CLASS));
	}

	private handleDragMove(data: DragMoveEvent) {
		// Clear previous indicators first
		this.clearDropIndicators();

		// Temporarily hide the ghost element to find element underneath
		let elementUnderPointer: Element | null = null;
		const ghostElement = data.element; // This is the clone
		const originalDisplay = ghostElement.style.display;
		ghostElement.style.display = "none";
		try {
			elementUnderPointer = document.elementFromPoint(
				data.currentX,
				data.currentY
			);
		} finally {
			ghostElement.style.display = originalDisplay; // Restore display
		}

		if (!elementUnderPointer) return;

		const dropZone = elementUnderPointer.closest(
			".tg-kanban-column-content"
		) as HTMLElement;

		if (dropZone) {
			const cards = Array.from(
				dropZone.querySelectorAll<HTMLElement>(".tg-kanban-card")
			).filter((card) => card !== data.originalElement); // Exclude the original dragged card if it's still technically in the DOM

			if (cards.length === 0) {
				// Add indicator for empty column
				dropZone.classList.add(DROP_INDICATOR_EMPTY_CLASS);
				return;
			}

			let targetCard: HTMLElement | null = null;
			let insertBefore = false;

			// Find the card to insert before/after based on Y position
			for (const card of cards) {
				const rect = card.getBoundingClientRect();
				const midY = rect.top + rect.height / 2;

				if (data.currentY < midY) {
					targetCard = card;
					insertBefore = true;
					break;
				}
			}

			if (targetCard) {
				if (insertBefore) {
					targetCard.classList.add(DROP_INDICATOR_BEFORE_CLASS);
				} else {
					// If loop finished without finding a card to insert before,
					// it means we should insert after the last card.
					// Check if targetCard was set in the loop (should always be unless Y is below all cards)
					const lastCard = cards[cards.length - 1];
					if (lastCard) {
						lastCard.classList.add(DROP_INDICATOR_AFTER_CLASS);
					}
				}
			} else {
				// If no targetCard found (e.g., dragging below all cards),
				// add indicator after the last card
				const lastCard = cards[cards.length - 1];
				if (lastCard) {
					lastCard.classList.add(DROP_INDICATOR_AFTER_CLASS);
				}
			}
		} else {
			// If not over a drop zone, ensure all indicators are cleared
			// (already done at the start of the function)
		}
	}

	private async handleDragEnd(data: DragEndEvent) {
		console.log(
			"Drag End:",
			data.originalElement.dataset.taskId, // Use originalElement
			"Dropped on:",
			data.dropTarget
		);

		// Clear visual cues regardless of drop success
		this.clearDropIndicators();
		this.columnContainerEl
			.querySelectorAll(
				".tg-kanban-drop-target-active, .tg-kanban-drop-target-hover"
			)
			.forEach((el) => {
				el.classList.remove(
					"tg-kanban-drop-target-active",
					"tg-kanban-drop-target-hover"
				);
			});

		const taskId = data.originalElement.dataset.taskId; // Use originalElement
		const dropTargetColumnContent = data.dropTarget;

		if (taskId && dropTargetColumnContent) {
			const targetColumnEl =
				dropTargetColumnContent.closest(".tg-kanban-column");
			const targetStatusName = targetColumnEl
				? (targetColumnEl as HTMLElement).dataset.statusName
				: null;

			if (targetStatusName) {
				const targetStatusMark =
					this.plugin.settings.taskStatusMarks[targetStatusName];
				if (targetStatusMark !== undefined) {
					console.log(
						`Kanban requesting status update for task ${taskId} to status ${targetStatusName} (mark: ${targetStatusMark})`
					);
					if (this.params.onTaskStatusUpdate) {
						try {
							await this.params.onTaskStatusUpdate(
								taskId,
								targetStatusMark
							);
						} catch (error) {
							console.error(
								"Failed to request task status update:",
								error
							);
						}
					} else {
						console.warn(
							"onTaskStatusUpdate callback not provided to KanbanComponent"
						);
					}
				} else {
					console.warn(
						`Could not find status mark for status name: ${targetStatusName}`
					);
				}
			}
		}
	}

	public getColumnContainer(): HTMLElement {
		return this.columnContainerEl;
	}
}
