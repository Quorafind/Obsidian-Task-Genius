import {
	App,
	Component,
	debounce,
	MarkdownRenderer as ObsidianMarkdownRenderer,
	TFile,
} from "obsidian";
import { type Task } from "../../types/task";
import "../../styles/gantt/gantt.css";

// Import new components and helpers
import { DateHelper } from "../../utils/DateHelper";
import { TimelineHeaderComponent } from "./timeline-header";
import { GridBackgroundComponent } from "./grid-background";
import { TaskRendererComponent } from "./task-renderer";
import TaskProgressBarPlugin from "../../index";
import {
	FilterComponent,
	buildFilterOptionsFromTasks,
} from "../inview-filter/filter";
import { ActiveFilter, FilterCategory } from "../inview-filter/filter-type";
import { ScrollToDateButton } from "../inview-filter/custom/scroll-to-date-button";
import { PRIORITY_MAP } from "../../common/default-symbol";

// Define the PRIORITY_MAP here as well, or import it if moved to a shared location
// This is needed to convert filter value (icon/text) back to number for comparison

// Constants for layout and styling
const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 40;
// const TASK_BAR_HEIGHT_RATIO = 0.6; // Moved to TaskRendererComponent
// const MILESTONE_SIZE = 10; // Moved to TaskRendererComponent
const DAY_WIDTH_DEFAULT = 50; // Default width for a day column
// const TASK_LABEL_PADDING = 5; // Moved to TaskRendererComponent
const MIN_DAY_WIDTH = 10; // Minimum width for a day during zoom out
const MAX_DAY_WIDTH = 200; // Maximum width for a day during zoom in
const INDICATOR_HEIGHT = 4; // Height of individual offscreen task indicators

// Define the structure for tasks prepared for rendering
export interface GanttTaskItem {
	// Still exported for sub-components
	task: Task;
	y: number;
	startX?: number;
	endX?: number;
	width?: number;
	isMilestone: boolean;
	level: number; // For hierarchical display
	// Removed labelContainer and markdownRenderer as they are managed internally by TaskRendererComponent or not needed
}

// New interface for tasks that have been successfully positioned
export interface PlacedGanttTaskItem extends GanttTaskItem {
	startX: number; // startX is guaranteed after filtering
	// endX and width might also be guaranteed depending on logic, but keep optional for now
}

// Configuration options for the Gantt chart
export interface GanttConfig {
	// Time range options
	startDate?: Date;
	endDate?: Date;
	timeUnit?: Timescale;

	// Display options
	headerHeight?: number;
	rowHeight?: number;
	barHeight?: number;
	barCornerRadius?: number;

	// Formatting options
	dateFormat?: {
		primary?: string;
		secondary?: string;
	};

	// Colors
	colors?: {
		background?: string;
		grid?: string;
		row?: string;
		bar?: string;
		milestone?: string;
		progress?: string;
		today?: string;
	};

	// Other options
	showToday?: boolean;
	showProgress?: boolean;
	showRelations?: boolean;
}

// Define timescale options
export type Timescale = "Day" | "Week" | "Month" | "Year"; // Still exported

export class GanttComponent extends Component {
	public containerEl: HTMLElement;
	private svgEl: SVGSVGElement | null = null;
	private tasks: Task[] = [];
	private allTasks: Task[] = [];
	private preparedTasks: PlacedGanttTaskItem[] = [];
	private app: App;

	private timescale: Timescale = "Day";
	private dayWidth: number = DAY_WIDTH_DEFAULT;
	private startDate: Date | null = null;
	private endDate: Date | null = null;
	private totalWidth: number = 0; // Total scrollable width
	private totalHeight: number = 0; // Total content height

	private zoomLevel: number = 1; // Ratio based on default day width
	private visibleStartDate: Date | null = null;
	private visibleEndDate: Date | null = null;
	private scrollContainerEl: HTMLElement;
	private contentWrapperEl: HTMLElement; // Contains the SVG
	private filterContainerEl: HTMLElement; // Container for filters
	private headerContainerEl: HTMLElement; // Container for sticky header
	private isScrolling: boolean = false;
	private isZooming: boolean = false;

	// SVG groups (will be passed to child components)
	private gridGroupEl: SVGGElement | null = null;
	private taskGroupEl: SVGGElement | null = null;

	// Child Components
	private filterComponent: FilterComponent | null = null;
	private timelineHeaderComponent: TimelineHeaderComponent | null = null;
	private gridBackgroundComponent: GridBackgroundComponent | null = null;
	private taskRendererComponent: TaskRendererComponent | null = null;

	// Helpers
	private dateHelper = new DateHelper();

	private config = {
		showDependencies: false,
		taskColorBy: "status",
		useVirtualization: false,
		debounceRenderMs: 50,
		showTaskLabels: true,
		useMarkdownRenderer: true,
	};

	private debouncedRender: ReturnType<typeof debounce>;
	private debouncedHeaderUpdate: ReturnType<typeof debounce>; // Renamed for clarity

	// Offscreen task indicators
	private leftIndicatorEl: HTMLElement; // Now a container
	private rightIndicatorEl: HTMLElement; // Now a container

	constructor(
		private plugin: TaskProgressBarPlugin,
		containerEl: HTMLElement,
		private params: {
			config?: GanttConfig;
			onTaskSelected?: (task: Task) => void;
			onTaskCompleted?: (task: Task) => void;
			onTaskContextMenu?: (event: MouseEvent, task: Task) => void;
		},
		private viewId: string = "gantt" // 新增：视图ID参数
	) {
		super();
		this.app = plugin.app;
		this.containerEl = containerEl.createDiv({
			cls: "gantt-chart-container",
		});

		// Create layout containers
		this.filterContainerEl = this.containerEl.createDiv(
			"gantt-filter-area" // New container for filters
		);
		this.headerContainerEl = this.containerEl.createDiv(
			"gantt-header-container"
		);
		this.scrollContainerEl = this.containerEl.createDiv(
			"gantt-scroll-container"
		);
		this.contentWrapperEl = this.scrollContainerEl.createDiv(
			"gantt-content-wrapper"
		);

		// Create offscreen indicator containers
		this.leftIndicatorEl = this.containerEl.createDiv(
			"gantt-indicator-container gantt-indicator-container-left" // Updated classes
		);
		this.rightIndicatorEl = this.containerEl.createDiv(
			"gantt-indicator-container gantt-indicator-container-right" // Updated classes
		);
		// Containers are always visible, content determines if indicators show
		// Debounced functions
		this.debouncedRender = debounce(
			this.renderInternal,
			this.config.debounceRenderMs
		);
		// Debounce header updates triggered by scroll
		this.debouncedHeaderUpdate = debounce(
			this.updateHeaderComponent,
			16 // Render header frequently on scroll
		);
	}

	onload() {
		console.log("GanttComponent loaded.");
		this.createBaseSVG(); // Creates SVG and groups

		// Instantiate Child Components
		this.filterComponent = this.addChild(
			new FilterComponent(
				{
					container: this.filterContainerEl,
					options: buildFilterOptionsFromTasks(this.tasks), // Initialize with empty array to satisfy type, will be updated dynamically
					onChange: (activeFilters: ActiveFilter[]) => {
						this.applyFiltersAndRender(activeFilters);
					},
					components: [
						new ScrollToDateButton(
							this.filterContainerEl,
							(date: Date) => this.scrollToDate(date)
						),
					],
				},
				this.plugin
			)
		);

		if (this.headerContainerEl) {
			this.timelineHeaderComponent = this.addChild(
				new TimelineHeaderComponent(this.app, this.headerContainerEl)
			);
		}

		if (this.gridGroupEl) {
			this.gridBackgroundComponent = this.addChild(
				new GridBackgroundComponent(this.app, this.gridGroupEl)
			);
		}

		if (this.taskGroupEl) {
			this.taskRendererComponent = this.addChild(
				new TaskRendererComponent(this.app, this.taskGroupEl)
			);
		}

		this.registerDomEvent(
			this.scrollContainerEl,
			"scroll",
			this.handleScroll
		);
		this.registerDomEvent(this.containerEl, "wheel", this.handleWheel, {
			passive: false,
		});
		// Initial render is triggered by updateTasks or refresh
	}

	onunload() {
		console.log("GanttComponent unloaded.");
		(this.debouncedRender as any).cancel();
		(this.debouncedHeaderUpdate as any).cancel();

		// Child components are unloaded automatically when the parent is unloaded
		// Remove specific elements if needed
		if (this.svgEl) {
			this.svgEl.detach();
		}
		this.filterContainerEl.detach();
		this.headerContainerEl.detach();
		this.scrollContainerEl.detach(); // This removes contentWrapperEl and svgEl too
		this.leftIndicatorEl.detach(); // Remove indicator containers
		this.rightIndicatorEl.detach(); // Remove indicator containers

		this.containerEl.removeClass("gantt-chart-container");
		this.tasks = [];
		this.allTasks = [];

		this.containerEl.removeClass("gantt-chart-container");
		this.tasks = [];
		this.preparedTasks = [];
	}

	setTasks(newTasks: Task[]) {
		this.preparedTasks = []; // Clear prepared tasks

		this.tasks = this.sortTasks(newTasks);
		this.allTasks = [...this.tasks]; // Store the original, sorted list

		// Prepare tasks initially to generate relevant filter options
		this.prepareTasksForRender(); // Calculate preparedTasks based on the initial full list

		// Update filter options based on the initially prepared task list
		if (this.filterComponent) {
			// Extract the original Task objects from preparedTasks
			const tasksForFiltering = this.preparedTasks.map((pt) => pt.task);
			this.filterComponent.updateFilterOptions(tasksForFiltering); // Use prepared tasks for initial options
		}

		// Apply any existing filters from the component (will re-prepare and re-update filters)
		const currentFilters = this.filterComponent?.getActiveFilters() || [];
		this.applyFiltersAndRender(currentFilters); // This will call prepareTasksForRender again and update filters

		// Scroll to today after the initial render is scheduled
		requestAnimationFrame(() => {
			// Check if component is still loaded before scrolling
			if (this.scrollContainerEl) {
				this.scrollToDate(new Date());
			}
		});
	}

	setTimescale(newTimescale: Timescale) {
		this.timescale = newTimescale;
		this.calculateTimescaleParams(); // Update params based on new scale
		this.prepareTasksForRender(); // Prepare tasks with new scale
		this.debouncedRender(); // Trigger full render
	}

	private createBaseSVG() {
		if (this.svgEl) this.svgEl.remove();

		this.svgEl = this.contentWrapperEl.createSvg("svg", {
			cls: "gantt-svg",
		});

		this.svgEl.setAttribute("width", "100%");
		this.svgEl.setAttribute("height", "100%");
		this.svgEl.style.display = "block";

		// Define SVG groups for children
		this.svgEl.createSvg("defs");
		this.gridGroupEl = this.svgEl.createSvg("g", { cls: "gantt-grid" });
		this.taskGroupEl = this.svgEl.createSvg("g", { cls: "gantt-tasks" });
	}

	// --- Date Range and Timescale Calculations ---

	private calculateDateRange(forceRecalculate: boolean = false): {
		startDate: Date;
		endDate: Date;
	} {
		if (!forceRecalculate && this.startDate && this.endDate) {
			return { startDate: this.startDate, endDate: this.endDate };
		}

		if (this.tasks.length === 0) {
			const today = new Date();
			this.startDate = this.dateHelper.startOfDay(
				this.dateHelper.addDays(today, -7)
			);
			this.endDate = this.dateHelper.addDays(today, 30);
			// Set initial visible range
			if (!this.visibleStartDate)
				this.visibleStartDate = new Date(this.startDate);
			this.visibleEndDate = this.calculateVisibleEndDate();
			return { startDate: this.startDate, endDate: this.endDate };
		}

		let minTimestamp = Infinity;
		let maxTimestamp = -Infinity;

		this.tasks.forEach((task) => {
			const taskStart =
				task.metadata.startDate ||
				task.metadata.scheduledDate ||
				task.metadata.createdDate;
			const taskEnd =
				task.metadata.dueDate || task.metadata.completedDate;

			if (taskStart) {
				const startTs = new Date(taskStart).getTime();
				if (!isNaN(startTs)) {
					minTimestamp = Math.min(minTimestamp, startTs);
				}
			} else if (task.metadata.createdDate) {
				const creationTs = new Date(
					task.metadata.createdDate
				).getTime();
				if (!isNaN(creationTs)) {
					minTimestamp = Math.min(minTimestamp, creationTs);
				}
			}

			if (taskEnd) {
				const endTs = new Date(taskEnd).getTime();
				if (!isNaN(endTs)) {
					const isMilestone =
						!task.metadata.startDate && task.metadata.dueDate;
					maxTimestamp = Math.max(
						maxTimestamp,
						isMilestone
							? endTs
							: this.dateHelper
									.addDays(new Date(endTs), 1)
									.getTime()
					);
				}
			}

			if (taskStart && !taskEnd) {
				const startTs = new Date(taskStart).getTime();
				if (!isNaN(startTs)) {
					maxTimestamp = Math.max(
						maxTimestamp,
						this.dateHelper.addDays(new Date(startTs), 1).getTime()
					);
				}
			}
		});

		const PADDING_DAYS = 3650; // Increased padding significantly for near-infinite scroll
		if (minTimestamp === Infinity || maxTimestamp === -Infinity) {
			const today = new Date();
			this.startDate = this.dateHelper.startOfDay(
				this.dateHelper.addDays(today, -PADDING_DAYS) // Use padding
			);
			this.endDate = this.dateHelper.addDays(today, PADDING_DAYS); // Use padding
		} else {
			this.startDate = this.dateHelper.startOfDay(
				this.dateHelper.addDays(new Date(minTimestamp), -PADDING_DAYS) // Use padding
			);
			this.endDate = this.dateHelper.startOfDay(
				this.dateHelper.addDays(new Date(maxTimestamp), PADDING_DAYS) // Use padding
			);
		}

		if (this.endDate <= this.startDate) {
			// Ensure end date is after start date, even with padding
			this.endDate = this.dateHelper.addDays(
				this.startDate,
				PADDING_DAYS * 2
			);
		}

		// Set initial visible range if not set or forced
		if (forceRecalculate || !this.visibleStartDate) {
			this.visibleStartDate = new Date(this.startDate);
		}
		this.visibleEndDate = this.calculateVisibleEndDate();

		return { startDate: this.startDate, endDate: this.endDate };
	}

	private calculateVisibleEndDate(): Date {
		if (!this.visibleStartDate || !this.scrollContainerEl) {
			return this.endDate || new Date();
		}
		const containerWidth = this.scrollContainerEl.clientWidth;
		// Ensure dayWidth is positive to avoid infinite loops or errors
		const effectiveDayWidth = Math.max(1, this.dayWidth);
		const visibleDays = Math.ceil(containerWidth / effectiveDayWidth);
		return this.dateHelper.addDays(this.visibleStartDate, visibleDays);
	}

	private calculateTimescaleParams() {
		if (!this.startDate || !this.endDate) return;

		// Determine appropriate timescale based on dayWidth
		if (this.dayWidth < 15) this.timescale = "Year";
		else if (this.dayWidth < 35) this.timescale = "Month";
		else if (this.dayWidth < 70) this.timescale = "Week";
		else this.timescale = "Day";
	}

	// Prepare task data for rendering (still needed for layout calculations)
	private prepareTasksForRender() {
		if (!this.startDate || !this.endDate) {
			console.error("Cannot prepare tasks: date range not set.");
			return;
		}
		this.calculateTimescaleParams(); // Ensure timescale is current

		// Define an intermediate type for mapped tasks before filtering
		type MappedTask = Omit<GanttTaskItem, "startX"> & { startX?: number };

		const mappedTasks: MappedTask[] = this.tasks.map((task, index) => {
			const y = index * ROW_HEIGHT + ROW_HEIGHT / 2; // Y position based on row index
			let startX: number | undefined;
			let endX: number | undefined;
			let isMilestone = false;

			const taskStart =
				task.metadata.startDate || task.metadata.scheduledDate;
			let taskDue = task.metadata.dueDate;

			if (taskStart) {
				const startDate = new Date(taskStart);
				if (!isNaN(startDate.getTime())) {
					startX = this.dateHelper.dateToX(
						startDate,
						this.startDate!,
						this.dayWidth
					);
				}
			}

			if (taskDue) {
				const dueDate = new Date(taskDue);
				if (!isNaN(dueDate.getTime())) {
					endX = this.dateHelper.dateToX(
						this.dateHelper.addDays(dueDate, 1),
						this.startDate!,
						this.dayWidth
					);
				}
			} else if (task.metadata.completedDate && taskStart) {
				// Optional: end bar at completion date if no due date
			}

			if (
				(taskDue && !taskStart) ||
				(taskStart &&
					taskDue &&
					this.dateHelper.daysBetween(
						new Date(taskStart),
						new Date(taskDue)
					) === 0)
			) {
				const milestoneDate = taskDue
					? new Date(taskDue)
					: taskStart
					? new Date(taskStart)
					: null;
				if (milestoneDate) {
					startX = this.dateHelper.dateToX(
						milestoneDate,
						this.startDate!,
						this.dayWidth
					);
					endX = startX;
					isMilestone = true;
				} else {
					startX = undefined;
					endX = undefined;
				}
			} else if (!taskStart && !taskDue) {
				startX = undefined;
				endX = undefined;
			} else if (taskStart && !taskDue) {
				if (startX !== undefined) {
					endX = this.dateHelper.dateToX(
						this.dateHelper.addDays(new Date(taskStart!), 1),
						this.startDate!,
						this.dayWidth
					);
					isMilestone = false;
				}
			}

			const width =
				startX !== undefined && endX !== undefined && !isMilestone
					? Math.max(1, endX - startX)
					: undefined;

			return {
				task,
				y: y, // Y position relative to the SVG top
				startX,
				endX,
				width,
				isMilestone,
				level: 0,
			};
		});

		// Filter out tasks that couldn't be placed and assert the type
		this.preparedTasks = mappedTasks.filter(
			(pt): pt is PlacedGanttTaskItem => pt.startX !== undefined
		);

		console.log("Prepared Tasks:", this.preparedTasks);

		// Calculate total dimensions
		// Ensure a minimum height even if there are no tasks initially
		const MIN_ROWS_DISPLAY = 5; // Show at least 5 rows worth of height
		this.totalHeight = Math.max(
			this.preparedTasks.length * ROW_HEIGHT,
			MIN_ROWS_DISPLAY * ROW_HEIGHT
		);
		const totalDays = this.dateHelper.daysBetween(
			this.startDate!,
			this.endDate!
		);
		this.totalWidth = totalDays * this.dayWidth;
	}

	private sortTasks(tasks: Task[]): Task[] {
		// Keep existing sort logic, using dateHelper
		return tasks.sort((a, b) => {
			const startA = a.metadata.startDate || a.metadata.scheduledDate;
			const startB = b.metadata.startDate || b.metadata.scheduledDate;
			const dueA = a.metadata.dueDate;
			const dueB = b.metadata.dueDate;

			if (startA && startB) {
				const dateA = new Date(startA).getTime();
				const dateB = new Date(startB).getTime();
				if (dateA !== dateB) return dateA - dateB;
			} else if (startA) {
				return -1;
			} else if (startB) {
				return 1;
			}

			if (dueA && dueB) {
				const dateA = new Date(dueA).getTime();
				const dateB = new Date(dueB).getTime();
				if (dateA !== dateB) return dateA - dateB;
			} else if (dueA) {
				return -1;
			} else if (dueB) {
				return 1;
			}

			// Handle content comparison with null/empty values
			const contentA = a.content?.trim() || null;
			const contentB = b.content?.trim() || null;

			if (!contentA && !contentB) return 0;
			if (!contentA) return 1; // A is empty, goes to end
			if (!contentB) return -1; // B is empty, goes to end

			return contentA.localeCompare(contentB);
		});
	}

	// Debounce utility (Keep)

	// --- Rendering Function (Orchestrator) ---

	private renderInternal() {
		if (
			!this.svgEl ||
			!this.startDate ||
			!this.endDate ||
			!this.scrollContainerEl ||
			!this.gridBackgroundComponent || // Check if children are loaded
			!this.taskRendererComponent ||
			!this.timelineHeaderComponent ||
			!this.leftIndicatorEl || // Check indicator containers too
			!this.rightIndicatorEl
		) {
			console.warn(
				"Cannot render: Core elements, child components, or indicator containers not initialized."
			);
			return;
		}
		if (!this.containerEl.isShown()) {
			console.warn("Cannot render: Container not visible.");
			return;
		}

		// Recalculate dimensions and prepare data
		this.prepareTasksForRender(); // Recalculates totalWidth/Height, preparedTasks

		// Update SVG container dimensions
		this.svgEl.setAttribute("width", `${this.totalWidth}`);
		// Use the calculated totalHeight (which now has a minimum)
		this.svgEl.setAttribute("height", `${this.totalHeight}`);
		this.contentWrapperEl.style.width = `${this.totalWidth}px`;
		this.contentWrapperEl.style.height = `${this.totalHeight}px`;

		// Adjust scroll container height (consider filter area height if dynamic)
		const filterHeight = this.filterContainerEl.offsetHeight;
		// Ensure calculation is robust
		this.scrollContainerEl.style.height = `calc(100% - ${HEADER_HEIGHT}px - ${filterHeight}px)`;

		// --- Update Child Components ---

		// 1. Update Header
		this.updateHeaderComponent();

		// Calculate visible tasks *before* updating grid and task renderer
		const scrollLeft = this.scrollContainerEl.scrollLeft;

		const scrollTop = this.scrollContainerEl.scrollTop; // Get vertical scroll position
		const containerWidth = this.scrollContainerEl.clientWidth;
		const visibleStartX = scrollLeft;
		const visibleEndX = scrollLeft + containerWidth;

		// --- Update Offscreen Indicators ---
		// Clear existing indicators
		this.leftIndicatorEl.empty();
		this.rightIndicatorEl.empty();

		const visibleTasks: PlacedGanttTaskItem[] = [];
		const renderBuffer = 300; // Keep a render buffer for smooth scrolling
		const indicatorYOffset = INDICATOR_HEIGHT / 2;

		for (const pt of this.preparedTasks) {
			const taskStartX = pt.startX;
			const taskEndX = pt.isMilestone
				? pt.startX
				: pt.startX + (pt.width ?? 0);

			// Check visibility for task rendering
			const isVisible =
				taskEndX > visibleStartX - renderBuffer &&
				taskStartX < visibleEndX + renderBuffer;

			if (isVisible) {
				visibleTasks.push(pt);
			}

			// Check for offscreen indicators (use smaller buffer or none)
			const indicatorBuffer = 5; // Small buffer to prevent flicker
			// Calculate top position relative to the scroll container's viewport
			const indicatorTop = pt.y - scrollTop - indicatorYOffset;

			if (taskEndX < visibleStartX - indicatorBuffer) {
				// Task is offscreen to the left
				this.leftIndicatorEl.createDiv({
					cls: "gantt-single-indicator",
					attr: {
						style: `top: ${indicatorTop + 45}px;`, // Use calculated relative top
						title: pt.task.content,
						"data-task-id": pt.task.id,
					},
				});
			} else if (taskStartX > visibleEndX + indicatorBuffer) {
				// Task is offscreen to the right
				this.rightIndicatorEl.createDiv({
					cls: "gantt-single-indicator",
					attr: {
						style: `top: ${indicatorTop + 45}px;`, // Use calculated relative top
						title: pt.task.content,
						"data-task-id": pt.task.id,
					},
				});
			}
		}

		this.registerDomEvent(this.leftIndicatorEl, "click", (e) => {
			const target = e.target as HTMLElement;
			const taskId = target.getAttribute("data-task-id");
			if (taskId) {
				const task = this.tasks.find((t) => t.id === taskId);
				if (task) {
					this.scrollToDate(
						new Date(
							task.metadata.dueDate ||
								task.metadata.startDate ||
								task.metadata.scheduledDate!
						)
					);
				}
			}
		});

		this.registerDomEvent(this.rightIndicatorEl, "click", (e) => {
			const target = e.target as HTMLElement;
			const taskId = target.getAttribute("data-task-id");
			if (taskId) {
				const task = this.tasks.find((t) => t.id === taskId);
				if (task) {
					this.scrollToDate(
						new Date(
							task.metadata.startDate ||
								task.metadata.dueDate ||
								task.metadata.scheduledDate!
						)
					);
				}
			}
		});

		// 2. Update Grid Background (Now using visibleTasks)
		this.gridBackgroundComponent.updateParams({
			startDate: this.startDate,
			endDate: this.endDate,
			visibleStartDate: this.visibleStartDate!,
			visibleEndDate: this.visibleEndDate!,
			totalWidth: this.totalWidth,
			totalHeight: this.totalHeight,
			visibleTasks: visibleTasks, // Pass filtered list
			timescale: this.timescale,
			dayWidth: this.dayWidth,
			rowHeight: ROW_HEIGHT,
			dateHelper: this.dateHelper,
			shouldDrawMajorTick: this.shouldDrawMajorTick.bind(this),
			shouldDrawMinorTick: this.shouldDrawMinorTick.bind(this),
		});

		// 3. Update Tasks - Pass only visible tasks
		this.taskRendererComponent.updateParams({
			app: this.app,
			taskGroupEl: this.taskGroupEl!, // Assert non-null as checked above
			preparedTasks: visibleTasks, // Pass filtered list
			rowHeight: ROW_HEIGHT,
			// Pass relevant config
			showTaskLabels: this.config.showTaskLabels,
			useMarkdownRenderer: this.config.useMarkdownRenderer,
			handleTaskClick: this.handleTaskClick.bind(this),
			handleTaskContextMenu: this.handleTaskContextMenu.bind(this),
			parentComponent: this, // Pass self as parent context for MarkdownRenderer
			// Pass other params like milestoneSize, barHeightRatio if needed
		});
	}

	// Separate method to update header, can be debounced for scroll
	private updateHeaderComponent() {
		if (
			!this.timelineHeaderComponent ||
			!this.visibleStartDate ||
			!this.startDate ||
			!this.endDate
		)
			return;

		// Ensure visibleEndDate is calculated based on current state
		this.visibleEndDate = this.calculateVisibleEndDate();

		this.timelineHeaderComponent.updateParams({
			startDate: this.startDate,
			endDate: this.endDate,
			visibleStartDate: this.visibleStartDate,
			visibleEndDate: this.visibleEndDate,
			totalWidth: this.totalWidth,
			timescale: this.timescale,
			dayWidth: this.dayWidth,
			scrollLeft: this.scrollContainerEl.scrollLeft,
			headerHeight: HEADER_HEIGHT,
			dateHelper: this.dateHelper,
			shouldDrawMajorTick: this.shouldDrawMajorTick.bind(this),
			shouldDrawMinorTick: this.shouldDrawMinorTick.bind(this),
			formatMajorTick: this.formatMajorTick.bind(this),
			formatMinorTick: this.formatMinorTick.bind(this),
			formatDayTick: this.formatDayTick.bind(this),
		});
	}

	// --- Header Tick Logic (Kept in parent as it depends on timescale state) ---
	// These methods are now passed to children that need them.
	private shouldDrawMajorTick(date: Date): boolean {
		switch (this.timescale) {
			case "Year":
				return date.getMonth() === 0 && date.getDate() === 1;
			case "Month":
				return date.getDate() === 1;
			case "Week":
				return date.getDate() === 1;
			case "Day":
				return date.getDay() === 1; // Monday
			default:
				return false;
		}
	}

	private shouldDrawMinorTick(date: Date): boolean {
		switch (this.timescale) {
			case "Year":
				return date.getDate() === 1; // Month start
			case "Month":
				return date.getDay() === 1; // Week start (Monday)
			case "Week":
				return true; // Every day
			case "Day":
				return false; // Days handled by day ticks
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
			case "Year":
				return date.getFullYear().toString();
			case "Month":
				return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
			case "Week":
				// Show month only if the week starts in that month (first day of month)
				return date.getDate() === 1
					? `${monthNames[date.getMonth()]} ${date.getFullYear()}`
					: "";
			case "Day":
				return `W${this.dateHelper.getWeekNumber(date)}`; // Week number
			default:
				return "";
		}
	}

	private formatMinorTick(date: Date): string {
		switch (this.timescale) {
			case "Year":
				// Show month abbreviation for minor ticks (start of month)
				return this.formatMajorTick(date).substring(0, 3);
			case "Month":
				// Show week number for minor ticks (start of week)
				return `W${this.dateHelper.getWeekNumber(date)}`;
			case "Week":
				return date.getDate().toString(); // Day of month
			case "Day":
				return ""; // Not used
			default:
				return "";
		}
	}
	private formatDayTick(date: Date): string {
		const dayNames = ["S", "M", "T", "W", "T", "F", "S"]; // Single letters
		if (this.timescale === "Day") {
			return dayNames[date.getDay()];
		}
		return ""; // Only show for Day timescale
	}

	// --- Event Handlers (Update to coordinate children) ---

	private handleScroll = (event: Event) => {
		if (this.isZooming || !this.startDate) return; // Prevent conflict, ensure initialized

		const target = event.target as HTMLElement;
		const scrollLeft = target.scrollLeft;
		// const scrollTop = target.scrollTop; // For vertical virtualization later

		// Update visible start date based on scroll
		const daysScrolled = scrollLeft / Math.max(1, this.dayWidth);
		this.visibleStartDate = this.dateHelper.addDays(
			this.startDate!,
			daysScrolled
		);

		// Re-render only the header efficiently via debounced call
		this.debouncedHeaderUpdate();
		this.debouncedRender(); // Changed from debouncedHeaderUpdate
	};

	private handleWheel = (event: WheelEvent) => {
		if (!event.ctrlKey || !this.startDate || !this.endDate) return; // Only zoom with Ctrl, ensure initialized

		event.preventDefault();
		this.isZooming = true; // Set zoom flag

		const delta = event.deltaY > 0 ? 0.8 : 1.25;
		const newDayWidth = Math.max(
			MIN_DAY_WIDTH,
			Math.min(MAX_DAY_WIDTH, this.dayWidth * delta)
		);

		if (newDayWidth === this.dayWidth) {
			this.isZooming = false;
			return; // No change
		}

		const scrollContainerRect =
			this.scrollContainerEl.getBoundingClientRect();
		const cursorX = event.clientX - scrollContainerRect.left;
		const scrollLeftBeforeZoom = this.scrollContainerEl.scrollLeft;

		// Date under the cursor before zoom
		const timeAtCursor = this.dateHelper.xToDate(
			scrollLeftBeforeZoom + cursorX,
			this.startDate!,
			this.dayWidth
		);

		// Update day width *before* calculating new scroll position
		this.dayWidth = newDayWidth;

		// Recalculate total width based on new dayWidth (will be done in prepareTasksForRender)

		// Calculate where the timeAtCursor *should* be with the new dayWidth
		let newScrollLeft = 0;
		if (timeAtCursor) {
			const xAtCursorNew = this.dateHelper.dateToX(
				timeAtCursor,
				this.startDate!,
				this.dayWidth
			);
			newScrollLeft = xAtCursorNew - cursorX;
		}

		// Update timescale based on new zoom level (will be done in prepareTasksForRender)
		// this.calculateTimescaleParams(); // Called within prepareTasksForRender

		// Trigger a full re-render because zoom changes timescale, layout, etc.
		// Prepare tasks first to get the new totalWidth
		this.prepareTasksForRender();
		const containerWidth = this.scrollContainerEl.clientWidth;
		newScrollLeft = Math.max(
			0,
			Math.min(newScrollLeft, this.totalWidth - containerWidth)
		);
		this.debouncedRender(); // This will update all children

		// Apply the calculated scroll position *after* the render updates the layout
		requestAnimationFrame(() => {
			// Check if component might have been unloaded during async operation
			if (!this.scrollContainerEl) return;

			this.scrollContainerEl.scrollLeft = newScrollLeft;
			// Update visibleStartDate based on the final scroll position
			const daysScrolled = newScrollLeft / Math.max(1, this.dayWidth);
			this.visibleStartDate = this.dateHelper.addDays(
				this.startDate!,
				daysScrolled
			);

			// Update header again to ensure it reflects the final scroll position
			// The main render already updated it, but this ensures accuracy after scroll adjustment
			this.updateHeaderComponent();

			this.isZooming = false; // Reset zoom flag
		});
	};

	private handleTaskClick(task: Task) {
		this.params.onTaskSelected?.(task);
	}

	private handleTaskContextMenu(event: MouseEvent, task: Task) {
		this.params.onTaskContextMenu?.(event, task);
	}

	// Scroll smoothly to a specific date (Keep in parent)
	public scrollToDate(date: Date) {
		if (!this.startDate || !this.scrollContainerEl) return;

		const targetX = this.dateHelper.dateToX(
			date,
			this.startDate,
			this.dayWidth
		);
		const containerWidth = this.scrollContainerEl.clientWidth;
		let targetScrollLeft = targetX - containerWidth / 2;

		targetScrollLeft = Math.max(
			0,
			Math.min(targetScrollLeft, this.totalWidth - containerWidth)
		);

		// Update visible dates based on the scroll *target*
		const daysScrolled = targetScrollLeft / Math.max(1, this.dayWidth);
		this.visibleStartDate = this.dateHelper.addDays(
			this.startDate!, // Use non-null assertion as startDate should exist
			daysScrolled
		);
		this.visibleEndDate = this.calculateVisibleEndDate(); // Recalculate based on new start

		// Update header and trigger full render immediately for programmatic scroll
		// Use behavior: 'auto' for instant scroll to avoid issues with smooth scroll timing
		this.scrollContainerEl.scrollTo({
			left: targetScrollLeft,
			behavior: "auto", // Changed from 'smooth'
		});
		this.updateHeaderComponent(); // Update header right away
		this.debouncedRender(); // Trigger full render including tasks
		// this.debouncedHeaderUpdate(); // Old call - only updated header
	}

	// --- Public API ---
	public refresh() {
		console.log("GanttComponent refresh triggered.");
		// Force recalculation of date range and re-render
		this.calculateDateRange(true);
		this.prepareTasksForRender(); // Prepare tasks with new date range

		// Update filter options based on the refreshed prepared tasks
		if (this.filterComponent) {
			const tasksForFiltering = this.preparedTasks.map((pt) => pt.task);
			this.filterComponent.updateFilterOptions(tasksForFiltering);
		}

		this.debouncedRender(); // Trigger full render
	}

	// --- Filtering Logic ---
	private applyFiltersAndRender(activeFilters: ActiveFilter[]) {
		console.log("Applying filters: ", activeFilters);
		if (activeFilters.length === 0) {
			this.tasks = [...this.allTasks]; // Show all tasks if no filters
		} else {
			this.tasks = this.allTasks.filter((task) => {
				return activeFilters.every((filter) => {
					switch (filter.category) {
						case "status":
							return task.status === filter.value;
						case "tag":
							return task.metadata.tags.some(
								(tag) =>
									typeof tag === "string" &&
									tag === filter.value
							);
						case "project":
							return task.metadata.project === filter.value;
						case "context":
							return task.metadata.context === filter.value;
						case "priority":
							// Convert the selected filter value (icon/text) back to its numerical representation
							const expectedPriorityNumber =
								PRIORITY_MAP[filter.value];
							// Compare the task's numerical priority
							return (
								task.metadata.priority ===
								expectedPriorityNumber
							);
						case "completed":
							return (
								(filter.value === "Yes" && task.completed) ||
								(filter.value === "No" && !task.completed)
							);
						case "filePath":
							return task.filePath === filter.value;
						// Add cases for other filter types (date ranges etc.) if needed
						default:
							console.warn(
								`Unknown filter category: ${filter.category}`
							);
							return true; // Don't filter if category is unknown
					}
				});
			});
		}

		console.log("Filtered tasks count:", this.tasks.length);

		// Recalculate date range based on filtered tasks and prepare for render
		this.calculateDateRange(true); // Force recalculate based on filtered tasks
		this.prepareTasksForRender(); // Uses the filtered this.tasks

		// Update filter options based on the current set of prepared tasks after filtering
		if (this.filterComponent) {
			const tasksForFiltering = this.preparedTasks.map((pt) => pt.task);
			this.filterComponent.updateFilterOptions(tasksForFiltering);
		}

		this.debouncedRender();
	}
}
