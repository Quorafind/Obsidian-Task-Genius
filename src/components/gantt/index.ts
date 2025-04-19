import { type Task } from "../../utils/types/TaskIndex";
import { Component, App, TFile } from "obsidian";
import "../../styles/gantt.css";

// Constants for layout and styling
const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 40;
const TASK_BAR_HEIGHT_RATIO = 0.6;
const MILESTONE_SIZE = 10;
const DAY_WIDTH_DEFAULT = 50; // Default width for a day column
const TASK_LABEL_PADDING = 5;

// Define the structure for tasks prepared for rendering
interface GanttTaskItem {
	task: Task;
	y: number;
	startX?: number;
	endX?: number;
	width?: number;
	isMilestone: boolean;
	level: number; // For hierarchical display
}

// Define timescale options
type Timescale = "Day" | "Week" | "Month";

export class GanttComponent extends Component {
	private containerEl: HTMLElement;
	private svgEl: SVGSVGElement | null = null;
	private tasks: Task[] = [];
	private preparedTasks: GanttTaskItem[] = [];
	private app: App;

	private timescale: Timescale = "Day";
	private dayWidth: number = DAY_WIDTH_DEFAULT;
	private startDate: Date | null = null;
	private endDate: Date | null = null;

	// Configuration options (could be moved to settings)
	private config = {
		showDependencies: false, // Initial implementation might omit this
		taskColorBy: "status", // 'status', 'project'
		useVirtualization: true, // Recommended for performance
		debounceRenderMs: 50, // Debounce rendering for frequent updates
	};

	private debouncedRender: ReturnType<typeof this.debounce>;

	constructor(app: App, containerEl: HTMLElement) {
		super();
		this.app = app;
		this.containerEl = containerEl;
		this.containerEl.addClass("gantt-chart-container");

		// Debounced render function
		this.debouncedRender = this.debounce(
			this.renderInternal,
			this.config.debounceRenderMs
		);
	}

	onload() {
		console.log("GanttComponent loaded.");
		this.createBaseSVG();
		// Initial render might be triggered by updateTasks
		// this.render();
		// Add event listeners for zoom, scroll, etc. later
	}

	onunload() {
		console.log("GanttComponent unloaded.");
		(this.debouncedRender as any).cancel();
		if (this.svgEl) {
			this.svgEl.remove();
		}
		this.containerEl.empty();
		this.containerEl.removeClass("gantt-chart-container");
		this.tasks = [];
		this.preparedTasks = [];
	}

	updateTasks(newTasks: Task[]) {
		console.log("GanttComponent received tasks:", newTasks.length);
		this.tasks = this.sortTasks(newTasks); // Sort tasks (e.g., by start date or hierarchically)
		this.prepareTasksForRender();
		this.debouncedRender();
	}

	setTimescale(newTimescale: Timescale) {
		this.timescale = newTimescale;
		// Adjust dayWidth based on timescale (e.g., smaller for Month)
		this.calculateTimescaleParams();
		this.debouncedRender();
	}

	private createBaseSVG() {
		if (this.svgEl) this.svgEl.remove(); // Clear previous SVG if any

		this.svgEl = this.containerEl.createSvg("svg", { cls: "gantt-svg" });

		// Set initial dimensions (will be updated on render)
		this.svgEl.setAttribute("width", "100%");
		this.svgEl.setAttribute("height", "100%");

		// Define SVG groups for organization
		this.svgEl.createSvg("defs"); // For potential patterns, gradients, markers
		this.svgEl.createSvg("g", { cls: "gantt-grid" });
		this.svgEl.createSvg("g", { cls: "gantt-tasks" });
		this.svgEl.createSvg("g", { cls: "gantt-header" });

		// Add basic event listeners (e.g., for scrolling, zooming)
		// this.registerDomEvent(this.containerEl, 'scroll', this.handleScroll);
	}

	private calculateDateRange(): { startDate: Date; endDate: Date } {
		if (this.tasks.length === 0) {
			const today = new Date();
			return {
				startDate: this.startOfDay(today),
				endDate: this.addDays(today, 30),
			};
		}

		let minDate = Infinity;
		let maxDate = -Infinity;

		this.tasks.forEach((task) => {
			const taskStart =
				task.startDate || task.scheduledDate || task.dueDate;
			const taskEnd =
				task.dueDate || task.scheduledDate || task.startDate;

			if (taskStart && taskStart < minDate) {
				minDate = taskStart;
			}
			if (taskEnd && taskEnd > maxDate) {
				maxDate = taskEnd;
			}
		});

		// Handle cases with no valid dates
		if (minDate === Infinity || maxDate === -Infinity) {
			const today = new Date();
			return {
				startDate: this.startOfDay(today),
				endDate: this.addDays(today, 30),
			};
		}

		// Add some padding
		const start = new Date(minDate);
		const end = new Date(maxDate);
		return {
			startDate: this.startOfWeek(this.addDays(start, -7)), // Pad start
			endDate: this.endOfWeek(this.addDays(end, 7)), // Pad end
		};
	}

	private calculateTimescaleParams() {
		// Adjust dayWidth based on the selected timescale
		switch (this.timescale) {
			case "Month":
				this.dayWidth = 10;
				break;
			case "Week":
				this.dayWidth = 25;
				break;
			case "Day":
			default:
				this.dayWidth = DAY_WIDTH_DEFAULT;
				break;
		}
	}

	private prepareTasksForRender() {
		const dateRange = this.calculateDateRange();
		this.startDate = dateRange.startDate;
		this.endDate = dateRange.endDate;
		this.calculateTimescaleParams(); // Ensure dayWidth is correct

		this.preparedTasks = this.tasks
			.map((task, index) => {
				const y = HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;
				let startX: number | undefined;
				let endX: number | undefined;
				let isMilestone = false;

				const taskStart = task.startDate || task.scheduledDate;
				const taskDue = task.dueDate;

				if (taskStart && this.startDate) {
					startX = this.dateToX(new Date(taskStart));
				}

				if (taskDue && this.startDate) {
					// For bars, end date is exclusive, add 1 day
					endX = this.dateToX(this.addDays(new Date(taskDue), 1));
				}

				// Determine if it's a milestone or a bar
				if (startX !== undefined && endX !== undefined) {
					// Bar: has start and end
					isMilestone = false;
				} else if (startX !== undefined || endX !== undefined) {
					// Milestone: has only start or end (use end date if available, else start)
					const milestoneDate = taskDue
						? new Date(taskDue)
						: taskStart
						? new Date(taskStart)
						: null;
					if (milestoneDate && this.startDate) {
						startX = this.dateToX(milestoneDate); // Position milestone at its date
						endX = startX; // Milestone has zero width essentially
						isMilestone = true;
					}
				} else {
					// Task has no dates relevant for positioning, skip rendering position
					startX = undefined;
					endX = undefined;
				}

				const width =
					startX !== undefined && endX !== undefined && !isMilestone
						? Math.max(1, endX - startX)
						: undefined;

				return {
					task,
					y,
					startX,
					endX,
					width,
					isMilestone,
					level: 0, // Basic implementation: no hierarchy yet
				};
			})
			.filter((pt) => pt.startX !== undefined || pt.endX !== undefined); // Filter out tasks that can't be placed

		console.log("Prepared tasks for render:", this.preparedTasks.length);
	}

	private sortTasks(tasks: Task[]): Task[] {
		// Basic sorting by start date (if available), then due date
		// More complex sorting (hierarchical) can be added later
		return tasks.sort((a, b) => {
			const startA = a.startDate || a.scheduledDate;
			const startB = b.startDate || b.scheduledDate;
			const dueA = a.dueDate;
			const dueB = b.dueDate;

			if (startA && startB) {
				if (startA !== startB) return startA - startB;
			} else if (startA) {
				return -1; // Tasks with start date first
			} else if (startB) {
				return 1;
			}

			if (dueA && dueB) {
				if (dueA !== dueB) return dueA - dueB;
			} else if (dueA) {
				return -1; // Then tasks with due date
			} else if (dueB) {
				return 1;
			}

			// Fallback sort by content or ID?
			return a.content.localeCompare(b.content);
		});
	}

	// Debounce utility
	private debounce<T extends (...args: any[]) => void>(
		func: T,
		wait: number
	): (...args: Parameters<T>) => void {
		let timeout: number | null = null;

		const debounced = (...args: Parameters<T>) => {
			const later = () => {
				timeout = null;
				func.apply(this, args);
			};
			if (timeout !== null) {
				clearTimeout(timeout);
			}
			timeout = window.setTimeout(later, wait);
		};

		// Add a cancel method to the debounced function
		(debounced as any).cancel = () => {
			if (timeout !== null) {
				clearTimeout(timeout);
				timeout = null;
			}
		};

		return debounced;
	}

	// --- Rendering Functions ---

	private renderInternal() {
		if (!this.svgEl || !this.startDate || !this.endDate) {
			console.warn("Cannot render: SVG or date range not initialized.");
			return;
		}
		if (!this.containerEl.isShown()) {
			console.warn("Cannot render: Container not visible.");
			return; // Don't render if not visible
		}

		console.log("Rendering Gantt...");
		const startTime = performance.now();

		const containerWidth = this.containerEl.clientWidth;
		const totalDays = this.daysBetween(this.startDate, this.endDate);
		const totalWidth = totalDays * this.dayWidth;
		const totalHeight =
			HEADER_HEIGHT + this.preparedTasks.length * ROW_HEIGHT;

		// Update SVG dimensions
		this.svgEl.setAttribute(
			"viewBox",
			`0 0 ${containerWidth} ${totalHeight}`
		); // Adjust viewBox for scrolling
		this.svgEl.setAttribute("width", `${totalWidth}`); // Set content width
		this.svgEl.setAttribute("height", `${totalHeight}`);

		// --- Render Header ---
		const headerGroup = this.svgEl.querySelector(
			".gantt-header"
		) as SVGGElement | null;
		if (headerGroup) {
			headerGroup.empty(); // Clear previous header
			this.renderHeader(headerGroup, containerWidth, totalWidth);
		}

		// --- Render Grid ---
		const gridGroup = this.svgEl.querySelector(
			".gantt-grid"
		) as SVGGElement | null;
		if (gridGroup) {
			gridGroup.empty(); // Clear previous grid
			this.renderGrid(gridGroup, totalWidth, totalHeight);
		}

		// --- Render Tasks (Potentially Virtualized) ---
		const taskGroup = this.svgEl.querySelector(
			".gantt-tasks"
		) as SVGGElement | null;
		if (taskGroup) {
			taskGroup.empty(); // Clear previous tasks
			// TODO: Implement virtualization - only render tasks in viewport
			this.preparedTasks.forEach((pt) => this.renderTask(taskGroup, pt));
		}

		const endTime = performance.now();
		console.log(
			`Gantt render took: ${(endTime - startTime).toFixed(2)} ms`
		);
	}

	private renderHeader(
		headerGroup: SVGGElement,
		containerWidth: number,
		totalWidth: number
	) {
		// Background
		headerGroup.createSvg("rect", {
			attr: {
				x: 0,
				y: 0,
				width: totalWidth, // Extend to full scrollable width
				height: HEADER_HEIGHT,
				class: "gantt-header-bg",
			},
		});

		// Render timescale ticks (Days, Weeks, Months)
		let currentDate = new Date(this.startDate!.getTime());
		while (currentDate <= this.endDate!) {
			const x = this.dateToX(currentDate);

			// Major ticks (e.g., Months or Weeks based on timescale)
			if (this.shouldDrawMajorTick(currentDate)) {
				headerGroup.createSvg("line", {
					attr: {
						x1: x,
						y1: 0,
						x2: x,
						y2: HEADER_HEIGHT,
						class: "gantt-grid-line-vertical", // Reuse grid line style
					},
				});
				const majorTickText = headerGroup.createSvg("text", {
					attr: {
						x: x + 5,
						y: HEADER_HEIGHT / 2 - 5, // Position text
						class: "gantt-header-text",
					},
				});
				majorTickText.textContent = this.formatMajorTick(currentDate);
			}

			// Minor ticks (e.g., Days)
			if (this.shouldDrawMinorTick(currentDate)) {
				headerGroup.createSvg("line", {
					attr: {
						x1: x,
						y1: HEADER_HEIGHT * 0.6,
						x2: x,
						y2: HEADER_HEIGHT,
						class: "gantt-grid-line-vertical", // Thinner or dashed?
						"stroke-dasharray": "1,1",
					},
				});
				// Optionally add day numbers if timescale is zoomed in enough
				if (this.timescale === "Day") {
					const minorTickText = headerGroup.createSvg("text", {
						attr: {
							x: x + this.dayWidth / 2,
							y: HEADER_HEIGHT * 0.75,
							"text-anchor": "middle",
							class: "gantt-header-text",
						},
					});
					minorTickText.textContent = currentDate
						.getDate()
						.toString();
				}
			}

			currentDate = this.addDays(currentDate, 1);
		}
	}

	private shouldDrawMajorTick(date: Date): boolean {
		switch (this.timescale) {
			case "Month":
				return date.getDate() === 1;
			case "Week":
				return date.getDay() === 1; // Monday
			case "Day":
				return date.getDay() === 1; // Monday (treat weeks as major in day view)
			default:
				return false;
		}
	}
	private shouldDrawMinorTick(date: Date): boolean {
		switch (this.timescale) {
			case "Month":
				return date.getDay() === 1; // Start of week
			case "Week":
				return true; // Every day
			case "Day":
				return true; // Every day
			default:
				return false;
		}
	}

	private formatMajorTick(date: Date): string {
		const monthNames = [
			"Jan",
			"Feb",
			"Mar",
			"Apr",
			"May",
			"Jun",
			"Jul",
			"Aug",
			"Sep",
			"Oct",
			"Nov",
			"Dec",
		];
		switch (this.timescale) {
			case "Month":
				return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
			case "Week":
				return `Week ${this.getWeekNumber(date)}`;
			case "Day":
				return `Week ${this.getWeekNumber(date)}`; // Show week number even in day view
			default:
				return "";
		}
	}

	private renderGrid(
		gridGroup: SVGGElement,
		totalWidth: number,
		totalHeight: number
	) {
		// Background rect (optional, helps with catching mouse events)
		gridGroup.createSvg("rect", {
			attr: {
				x: 0,
				y: HEADER_HEIGHT,
				width: totalWidth,
				height: totalHeight - HEADER_HEIGHT,
				class: "gantt-grid-bg",
			},
		});

		// Vertical lines (matching header ticks)
		let currentDate = new Date(this.startDate!.getTime());
		while (currentDate <= this.endDate!) {
			const x = this.dateToX(currentDate);
			if (
				this.shouldDrawMajorTick(currentDate) ||
				this.shouldDrawMinorTick(currentDate)
			) {
				gridGroup.createSvg("line", {
					attr: {
						x1: x,
						y1: HEADER_HEIGHT,
						x2: x,
						y2: totalHeight,
						class: "gantt-grid-line-vertical",
					},
				});
			}
			currentDate = this.addDays(currentDate, 1);
		}

		// Horizontal lines (one per task row)
		this.preparedTasks.forEach((_, index) => {
			const y = HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT;
			gridGroup.createSvg("line", {
				attr: {
					x1: 0,
					y1: y,
					x2: totalWidth,
					y2: y,
					class: "gantt-grid-line-horizontal",
				},
			});
		});
	}

	private renderTask(taskGroup: SVGGElement, preparedTask: GanttTaskItem) {
		if (preparedTask.startX === undefined) return; // Cannot render task without position

		const task = preparedTask.task;
		const group = taskGroup.createSvg("g", { cls: "gantt-task-item" });
		group.setAttribute("data-task-id", task.id);
		// Add listener for clicking task
		group.addEventListener("click", () => this.handleTaskClick(task));
		// Add hover effects/tooltips later

		const barY = preparedTask.y - (ROW_HEIGHT * TASK_BAR_HEIGHT_RATIO) / 2;
		const barHeight = ROW_HEIGHT * TASK_BAR_HEIGHT_RATIO;

		if (preparedTask.isMilestone) {
			// Render milestone (e.g., diamond)
			const x = preparedTask.startX;
			const y = preparedTask.y;
			const halfSize = MILESTONE_SIZE / 2;
			group.createSvg("polygon", {
				attr: {
					points: `${x},${y - halfSize} ${x + halfSize},${y} ${x},${
						y + halfSize
					} ${x - halfSize},${y}`,
					class: `gantt-task-milestone status-${task.status} priority-${task.priority}`,
				},
			});
			// Add tooltip for milestone
			group.setAttribute(
				"title",
				`${task.content}\nDue: ${
					task.dueDate
						? new Date(task.dueDate).toLocaleDateString()
						: "N/A"
				}`
			);
		} else if (preparedTask.width !== undefined && preparedTask.width > 0) {
			// Render task bar
			group.createSvg("rect", {
				attr: {
					x: preparedTask.startX,
					y: barY,
					width: preparedTask.width,
					height: barHeight,
					rx: 3, // Rounded corners
					ry: 3,
					class: `gantt-task-bar status-${task.status} priority-${task.priority}`,
					// Potentially add project class: `project-${task.project?.id}`
				},
			});

			// Render task label inside or next to the bar
			const labelX = preparedTask.startX + TASK_LABEL_PADDING;
			const labelY = preparedTask.y + barHeight * 0.2; // Adjust vertical alignment
			const labelText = group.createSvg("text", {
				attr: {
					x: labelX,
					y: labelY,
					class: "gantt-task-label",
				},
			});
			labelText.textContent = this.truncateText(
				task.content,
				preparedTask.width - TASK_LABEL_PADDING * 2
			);
			// Add tooltip for bar
			group.setAttribute(
				"title",
				`${task.content}\nStart: ${
					task.startDate
						? new Date(task.startDate).toLocaleDateString()
						: "N/A"
				}\nDue: ${
					task.dueDate
						? new Date(task.dueDate).toLocaleDateString()
						: "N/A"
				}`
			);
		}
	}

	// --- Event Handlers ---

	private handleTaskClick(task: Task) {
		console.log("Task clicked:", task);
		// Navigate to task source file/line
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (file && file instanceof TFile) {
			this.app.workspace.openLinkText(
				task.filePath,
				task.filePath,
				false,
				{
					// Use false for new pane? Or check settings?
					eState: { line: task.line },
				}
			);
		}
	}

	// --- Utility Functions ---

	private dateToX(date: Date): number {
		if (!this.startDate) return 0;
		const daysDiff = this.daysBetween(this.startDate, date);
		return daysDiff * this.dayWidth;
	}

	private xToDate(x: number): Date | null {
		if (!this.startDate) return null;
		const days = Math.floor(x / this.dayWidth);
		return this.addDays(this.startDate, days);
	}

	// Simple days between calculation (ignores time part)
	private daysBetween(date1: Date, date2: Date): number {
		const d1 = this.startOfDay(date1).getTime();
		const d2 = this.startOfDay(date2).getTime();
		return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
	}

	private addDays(date: Date, days: number): Date {
		const result = new Date(date);
		result.setDate(result.getDate() + days);
		return result;
	}

	private startOfDay(date: Date): Date {
		const result = new Date(date);
		result.setHours(0, 0, 0, 0);
		return result;
	}

	private startOfWeek(date: Date): Date {
		const result = new Date(date);
		const day = result.getDay(); // 0 = Sunday, 1 = Monday, ...
		const diff = result.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
		result.setDate(diff);
		return this.startOfDay(result);
	}

	private endOfWeek(date: Date): Date {
		const start = this.startOfWeek(date);
		const result = this.addDays(start, 6);
		result.setHours(23, 59, 59, 999); // End of Sunday
		return result;
	}

	private getWeekNumber(d: Date): number {
		// Copy date so don't modify original
		d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
		// Set to nearest Thursday: current date + 4 - current day number
		// Make Sunday's day number 7
		d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
		// Get first day of year
		const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
		// Calculate full weeks to nearest Thursday
		const weekNo = Math.ceil(
			((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
		);
		// Return array of year and week number
		return weekNo;
	}

	private truncateText(text: string, maxWidth: number): string {
		// Very basic truncation, could use SVG textLength or more sophisticated methods
		const avgCharWidthEstimate = 8; // Rough estimate, adjust as needed
		const maxChars = Math.max(
			0,
			Math.floor(maxWidth / avgCharWidthEstimate)
		);
		if (text.length > maxChars && maxChars > 1) {
			return text.substring(0, maxChars - 1) + "…";
		}
		return text;
	}

	// Other potential methods:
	// - handleScroll() -> for virtualization
	// - handleZoom() -> adjust dayWidth
	// - handleDragStart(), handleDrag(), handleDragEnd() -> for task rescheduling
	// - renderDependencies()
	// - calculateHierarchy()
}
