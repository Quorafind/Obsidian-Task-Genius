import { App, Component, debounce } from "obsidian";
import { type Task } from "../../types/task";
import {
	GroupingField,
	GroupingConfig,
	TaskGroup,
} from "../../types/gantt-grouping";
import "../../styles/gantt/gantt.css";

// Import new components and helpers
import { DateHelper } from "../../utils/DateHelper";
import { TimelineHeaderComponent } from "./timeline-header";
import { GridBackgroundComponent } from "./grid-background";
import { TaskRendererComponent } from "./task-renderer";
import { GanttGroupingManager } from "./grouping-manager";
import { GanttGroupingControls } from "./grouping-controls";
import { GroupHeaderRenderer } from "./group-header-renderer";
import { GroupInteractionManager } from "./group-interaction-manager";
import { VirtualizationManager } from "./virtualization-manager";
import { GanttConfigManager } from "./gantt-config-manager";
import {
	GanttViewTabs,
	GanttViewTab,
	GanttViewConfig,
} from "./gantt-view-tabs";
import { GanttControlsPopover } from "./gantt-controls-popover";
import TaskProgressBarPlugin from "../../index";
import {
	FilterComponent,
	buildFilterOptionsFromTasks,
} from "../inview-filter/filter";
import { ActiveFilter } from "../inview-filter/filter-type";
import { ScrollToDateButton } from "../inview-filter/custom/scroll-to-date-button";
import { filterTasks } from "../../utils/TaskFilterUtils";
import { ViewMode } from "../../common/setting-definition";
import { GroupSidebar } from "./group-sidebar";

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

// Local types are now imported from gantt-grouping.d.ts

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

	// Grouping options
	grouping?: GroupingConfig;

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
		groupHeader?: string;
		groupBorder?: string;
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
	private groupSidebarEl: HTMLElement; // Left sidebar for group headers
	private chartAreaEl: HTMLElement; // Chart area container
	private isScrolling: boolean = false;
	private isZooming: boolean = false;

	// SVG groups (will be passed to child components)
	private gridGroupEl: SVGGElement | null = null;
	private taskGroupEl: SVGGElement | null = null;
	private groupHeaderGroupEl: SVGGElement | null = null;

	// Child Components
	private viewTabs: GanttViewTabs | null = null;
	private controlsPopover: GanttControlsPopover | null = null;
	private filterComponent: FilterComponent | null = null;
	private timelineHeaderComponent: TimelineHeaderComponent | null = null;
	private gridBackgroundComponent: GridBackgroundComponent | null = null;
	private taskRendererComponent: TaskRendererComponent | null = null;
	private groupingControls: GanttGroupingControls | null = null;
	private groupHeaderRenderer: GroupHeaderRenderer | null = null;
	private groupSidebar: GroupSidebar | null = null;

	// Grouping
	private groupingManager: GanttGroupingManager;
	private groupInteractionManager: GroupInteractionManager;
	private virtualizationManager: VirtualizationManager;
	private configManager: GanttConfigManager;
	private taskGroups: TaskGroup[] = [];
	private groupingContainerEl: HTMLElement;

	// Helpers
	private dateHelper = new DateHelper();

	private config = {
		showDependencies: false,
		taskColorBy: "status",
		useVirtualization: true,
		debounceRenderMs: 100,
		showTaskLabels: true,
		useMarkdownRenderer: true,
		maxTasksWithoutVirtualization: 50,
		renderBufferSize: 200,
		lazyLoadThreshold: 10,
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

		// Create layout containers - using new view tabs approach
		this.groupingContainerEl = this.containerEl.createDiv(
			"gantt-view-tabs-area" // Container for view tabs
		);
		this.filterContainerEl = this.containerEl.createDiv(
			"gantt-filter-area" // Container for filters (will be removed)
		);
		// Hide old filter area since it's now in popover
		this.filterContainerEl.style.display = "none";

		// Create main content area with sidebar and chart
		const mainContentEl = this.containerEl.createDiv("gantt-main-content");

		// Create left sidebar for group headers
		this.groupSidebarEl = mainContentEl.createDiv("gantt-group-sidebar");

		// Create right chart area
		this.chartAreaEl = mainContentEl.createDiv("gantt-chart-area");

		this.headerContainerEl = this.chartAreaEl.createDiv(
			"gantt-header-container"
		);
		this.scrollContainerEl = this.chartAreaEl.createDiv(
			"gantt-scroll-container"
		);
		this.contentWrapperEl = this.scrollContainerEl.createDiv(
			"gantt-content-wrapper"
		);

		// Create offscreen indicator containers in chart area for proper positioning
		this.leftIndicatorEl = this.chartAreaEl.createDiv(
			"gantt-indicator-container gantt-indicator-container-left"
		);
		this.rightIndicatorEl = this.chartAreaEl.createDiv(
			"gantt-indicator-container gantt-indicator-container-right"
		);

		// Initialize configuration manager
		this.configManager = new GanttConfigManager(this.plugin, this.viewId);

		// Initialize grouping manager with saved configuration
		const savedConfig = this.configManager.getGroupingConfig();
		this.groupingManager = new GanttGroupingManager(
			this.params.config?.grouping || savedConfig
		);

		// Initialize group interaction manager
		this.groupInteractionManager = new GroupInteractionManager({
			groupingManager: this.groupingManager,
			onGroupStateChange: (groupId: string, expanded: boolean) => {
				console.log(
					`Group ${groupId} ${expanded ? "expanded" : "collapsed"}`
				);
				this.regroupAndRender();
			},
			onTaskMoved: (
				task: Task,
				fromGroupId: string,
				toGroupId: string
			) => {
				console.log(`Task moved from ${fromGroupId} to ${toGroupId}`);
				// Handle task metadata update based on the grouping field
				this.handleTaskGroupChange(task, fromGroupId, toGroupId);
			},
			onGroupFiltered: (groupId: string, visible: boolean) => {
				console.log(`Group ${groupId} visibility: ${visible}`);
				// Handle group visibility changes
			},
		});

		// Initialize virtualization manager
		this.virtualizationManager = new VirtualizationManager({
			viewportHeight: 600, // Will be updated dynamically
			viewportWidth: 1200, // Will be updated dynamically
			rowHeight: ROW_HEIGHT,
			groupHeaderHeight: 40,
			overscanCount: 5,
			bufferSize: this.config.renderBufferSize, // 使用配置的缓冲区大小
			lazyLoadThreshold: this.config.lazyLoadThreshold, // 使用配置的懒加载阈值
			maxCachedItems: 1000,
			cleanupInterval: 30000, // 30 seconds
		});

		// Create offscreen indicator containers - will be moved to chartAreaEl after it's created
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

		// 添加全局调试方法（仅在开发环境）
		if (
			process.env.NODE_ENV === "development" ||
			(window as any).ganttDebug
		) {
			(window as any).ganttDebugMetrics = () => {
				console.log(
					"Gantt Performance Metrics:",
					this.getPerformanceMetrics()
				);
			};
			(window as any).ganttResetMetrics = () => {
				this.resetPerformanceMetrics();
				console.log("Gantt performance metrics reset");
			};
		}
	}

	onload() {
		console.log("GanttComponent loaded.");
		this.createBaseSVG(); // Creates SVG and groups

		// Initialize Group Sidebar
		this.groupSidebar = this.addChild(
			new GroupSidebar(this.app, this.groupSidebarEl)
		);

		// Initialize View Tabs
		this.viewTabs = this.addChild(
			new GanttViewTabs({
				container: this.groupingContainerEl,
				plugin: this.plugin,
				onTabChange: (tab: GanttViewTab) => {
					this.handleTabChange(tab);
				},
				onTabCreate: (tab: GanttViewTab) => {
					this.handleTabCreate(tab);
				},
				onTabDelete: (tabId: string) => {
					this.handleTabDelete(tabId);
				},
				onTabRename: (tabId: string, newName: string) => {
					this.handleTabRename(tabId, newName);
				},
			})
		);

		// Create controls trigger button in the chart area
		const controlsTrigger = this.chartAreaEl.createDiv(
			"gantt-controls-trigger-button"
		);

		// Initialize Controls Popover
		this.controlsPopover = this.addChild(
			new GanttControlsPopover({
				triggerElement: controlsTrigger,
				onGroupingChange: (config: GroupingConfig) => {
					this.groupingManager.updateConfig(config);
					this.configManager.updateGroupingConfig(config);
					this.regroupAndRender();
					// Update active tab config
					this.viewTabs?.updateActiveTabConfig({
						groupingConfig: config,
					});
				},
				onGroupToggle: (groupId: string) => {
					this.groupingManager.toggleGroupExpanded(groupId);
					// Save group state
					const groupStates = this.configManager.getGroupStates();
					groupStates[groupId] =
						this.groupingManager.isGroupExpanded(groupId);
					this.configManager.updateGroupStates(groupStates);
					this.regroupAndRender();
				},
				onExpandCollapseAll: (expand: boolean) => {
					if (expand) {
						this.groupSidebar?.expandAll();
					} else {
						this.groupSidebar?.collapseAll();
					}
					this.regroupAndRender();
				},
				onScrollToDate: (date: Date) => this.scrollToDate(date),
				initialGroupingConfig: this.groupingManager.getConfig(),
				initialTasks: this.tasks,
				plugin: this.plugin,
			})
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

		if (this.groupHeaderGroupEl) {
			this.groupHeaderRenderer = this.addChild(
				new GroupHeaderRenderer(this.app, this.groupHeaderGroupEl)
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

		// Cancel debounced functions to prevent memory leaks
		if (
			this.debouncedRender &&
			typeof (this.debouncedRender as any).cancel === "function"
		) {
			(this.debouncedRender as any).cancel();
		}
		if (
			this.debouncedHeaderUpdate &&
			typeof (this.debouncedHeaderUpdate as any).cancel === "function"
		) {
			(this.debouncedHeaderUpdate as any).cancel();
		}

		// Clean up virtualization manager
		if (this.virtualizationManager) {
			this.removeChild(this.virtualizationManager);
		}

		// Child components are unloaded automatically when the parent is unloaded
		// Remove specific elements if needed
		if (this.svgEl) {
			this.svgEl.detach();
		}

		// Detach DOM elements to break references
		if (this.groupingContainerEl) {
			this.groupingContainerEl.detach();
		}
		if (this.filterContainerEl) {
			this.filterContainerEl.detach();
		}
		if (this.headerContainerEl) {
			this.headerContainerEl.detach();
		}
		if (this.scrollContainerEl) {
			this.scrollContainerEl.detach(); // This removes contentWrapperEl and svgEl too
		}
		if (this.leftIndicatorEl) {
			this.leftIndicatorEl.detach(); // Remove indicator containers
		}
		if (this.rightIndicatorEl) {
			this.rightIndicatorEl.detach(); // Remove indicator containers
		}

		this.containerEl.removeClass("gantt-chart-container");

		// Clear arrays and object references to help GC
		this.tasks = [];
		this.allTasks = [];
		this.taskGroups = [];
		this.preparedTasks = [];

		// Clear component references (they're already unloaded by parent)
		this.groupSidebar = null;
		this.viewTabs = null;
		this.taskRendererComponent = null;
		this.timelineHeaderComponent = null;
		this.filterComponent = null;
	}

	setTasks(newTasks: Task[]) {
		this.preparedTasks = []; // Clear prepared tasks

		this.tasks = this.sortTasks(newTasks);
		this.allTasks = [...this.tasks]; // Store the original, sorted list

		// Group tasks based on current configuration
		this.taskGroups = this.groupingManager.groupTasks(
			this.tasks,
			ROW_HEIGHT
		);

		// Ensure date range is calculated before preparing tasks
		this.calculateDateRange(true); // Force recalculation with new tasks

		// Prepare tasks initially to generate relevant filter options
		this.prepareTasksForRender(); // Calculate preparedTasks based on the initial full list

		// Update filter options based on the initially prepared task list
		// Note: Filter functionality has been moved to global filter system
		// No need to update filter options in controls popover anymore

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

		// Ensure date range is calculated before preparing tasks
		if (!this.startDate || !this.endDate) {
			this.calculateDateRange();
		}

		this.prepareTasksForRender(); // Prepare tasks with new scale
		this.debouncedRender(); // Trigger full render
	}

	/**
	 * Regroup tasks and trigger a full render
	 */
	private regroupAndRender(): void {
		this.taskGroups = this.groupingManager.groupTasks(
			this.tasks,
			ROW_HEIGHT
		);

		// Ensure date range is calculated before preparing tasks
		if (!this.startDate || !this.endDate) {
			this.calculateDateRange();
		}

		this.prepareTasksForRender();
		this.debouncedRender();
	}

	/**
	 * Handle task group change (when task is moved between groups)
	 */
	private handleTaskGroupChange(
		task: Task,
		fromGroupId: string,
		toGroupId: string
	): void {
		const config = this.groupingManager.getConfig();
		const primaryField = config.primaryGroupBy;

		if (!primaryField || primaryField === "none") return;

		// Extract the new group value from the target group ID
		const newGroupValue = this.extractGroupValueFromId(
			toGroupId,
			primaryField
		);

		if (newGroupValue !== null) {
			// Update task metadata based on the grouping field
			this.updateTaskMetadataForGroup(task, primaryField, newGroupValue);

			// Trigger re-grouping and render
			this.regroupAndRender();
		}
	}

	/**
	 * Extract group value from group ID
	 */
	private extractGroupValueFromId(
		groupId: string,
		field: GroupingField
	): string | number | null {
		// Group ID format is typically "field-value" or "parentId-field-value"
		const parts = groupId.split("-");
		if (parts.length >= 2) {
			const value = parts.slice(1).join("-"); // Rejoin in case value contains dashes

			// Convert to appropriate type based on field
			if (field === "priority") {
				const numValue = parseInt(value);
				return isNaN(numValue) ? 0 : numValue;
			}

			return value;
		}

		return null;
	}

	/**
	 * Update task metadata for group assignment
	 */
	private updateTaskMetadataForGroup(
		task: Task,
		field: GroupingField,
		value: string | number
	): void {
		switch (field) {
			case "project":
				task.metadata.project = value as string;
				break;
			case "priority":
				task.metadata.priority = value as number;
				break;
			case "status":
				task.status = value as string;
				break;
			case "tags":
				// For tags, we might want to replace the first tag or add a new one
				if (typeof value === "string") {
					if (task.metadata.tags.length > 0) {
						task.metadata.tags[0] = value;
					} else {
						task.metadata.tags.push(value);
					}
				}
				break;
			case "area":
				task.metadata.area = value as string;
				break;
			case "context":
				task.metadata.context = value as string;
				break;
			// Note: Some fields like filePath, heading are immutable and shouldn't be changed
			default:
				console.warn(`Cannot update task metadata for field: ${field}`);
		}
	}

	/**
	 * Find a group by ID in the group hierarchy
	 */
	private findGroupById(
		groupId: string,
		groups: TaskGroup[]
	): TaskGroup | null {
		for (const group of groups) {
			if (group.id === groupId) {
				return group;
			}
			if (group.subGroups && group.subGroups.length > 0) {
				const found = this.findGroupById(groupId, group.subGroups);
				if (found) {
					return found;
				}
			}
		}
		return null;
	}

	private createBaseSVG() {
		if (this.svgEl) this.svgEl.remove();

		this.svgEl = this.contentWrapperEl.createSvg("svg", {
			cls: "gantt-svg",
		});

		this.svgEl.setAttribute("width", "100%");
		this.svgEl.setAttribute("height", "100%");
		this.svgEl.style.display = "block";

		// Define SVG groups for children (order matters for layering)
		this.svgEl.createSvg("defs");
		this.gridGroupEl = this.svgEl.createSvg("g", { cls: "gantt-grid" });
		this.groupHeaderGroupEl = this.svgEl.createSvg("g", {
			cls: "gantt-group-headers",
		});
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

	// Prepare task data for rendering with grouping support
	private prepareTasksForRender() {
		if (!this.startDate || !this.endDate) {
			console.error("Cannot prepare tasks: date range not set.");
			return;
		}
		this.calculateTimescaleParams(); // Ensure timescale is current

		// Update virtualization manager viewport size
		if (this.scrollContainerEl) {
			this.virtualizationManager.updateConfig({
				viewportHeight: this.scrollContainerEl.clientHeight,
				viewportWidth: this.scrollContainerEl.clientWidth,
			});
		}

		// Build virtual items for efficient rendering
		this.virtualizationManager.buildVirtualItems(this.taskGroups);

		// Define an intermediate type for mapped tasks before filtering
		type MappedTask = Omit<GanttTaskItem, "startX"> & { startX?: number };

		// Process tasks with grouping and virtualization
		const mappedTasks: MappedTask[] =
			this.prepareTasksWithGroupingAndVirtualization();

		// Filter out tasks that couldn't be placed and assert the type
		this.preparedTasks = mappedTasks.filter(
			(pt): pt is PlacedGanttTaskItem => pt.startX !== undefined
		);

		console.log("Prepared Tasks:", this.preparedTasks);

		// Calculate total dimensions
		this.calculateTotalDimensions();
	}

	/**
	 * Prepare tasks with grouping and virtualization support
	 */
	private prepareTasksWithGroupingAndVirtualization(): (Omit<
		GanttTaskItem,
		"startX"
	> & {
		startX?: number;
	})[] {
		const mappedTasks: (Omit<GanttTaskItem, "startX"> & {
			startX?: number;
		})[] = [];

		// 检查是否启用虚拟化 - 使用配置参数
		const shouldUseVirtualization =
			this.config.useVirtualization &&
			this.tasks.length > this.config.maxTasksWithoutVirtualization;

		if (shouldUseVirtualization) {
			// 大量任务时使用虚拟化
			console.log(`Using virtualization for ${this.tasks.length} tasks`);

			const scrollTop = this.scrollContainerEl
				? this.scrollContainerEl.scrollTop
				: 0;

			// 计算可见项目
			const viewportInfo =
				this.virtualizationManager.calculateVisibleItems(scrollTop);

			// 只处理可见项目
			for (const virtualItem of viewportInfo.visibleItems) {
				if (virtualItem.type === "task") {
					const task = virtualItem.data as Task;
					const taskItem = this.createTaskItem(task, virtualItem.y);
					if (taskItem) {
						mappedTasks.push(taskItem);
					}
				}
			}
		} else {
			// 少量任务时直接处理所有任务组
			console.log(
				`Processing ${this.tasks.length} tasks without virtualization`
			);

			let currentY = 0;
			for (const group of this.taskGroups) {
				currentY = this.processGroup(group, mappedTasks, currentY);
			}
		}

		return mappedTasks;
	}

	/**
	 * Process a single group and its tasks/subgroups with optimized spacing
	 */
	private processGroup(
		group: TaskGroup,
		mappedTasks: (Omit<GanttTaskItem, "startX"> & { startX?: number })[],
		startY: number
	): number {
		let currentY = startY;

		// Check if group is visible (for filtering)
		const isGroupVisible =
			this.groupInteractionManager?.isGroupVisible(group.id) ?? true;

		// If group is not visible, skip processing but still update position for layout consistency
		if (!isGroupVisible) {
			group.y = startY;
			group.height = 0;
			return currentY; // Return without advancing Y position
		}

		// 为组头部预留空间
		const groupingConfig = this.groupingManager.getConfig();
		if (groupingConfig.showGroupHeaders) {
			currentY += group.headerHeight || 40; // 默认组头部高度
		}

		// 更新组的Y位置
		group.y = startY;

		if (group.expanded) {
			// 首先处理子组
			if (group.subGroups && group.subGroups.length > 0) {
				for (const subGroup of group.subGroups) {
					currentY = this.processGroup(
						subGroup,
						mappedTasks,
						currentY
					);
				}
			} else {
				// 处理该组中的任务 - 优化间距
				const taskCount = group.tasks.length;
				let taskSpacing = ROW_HEIGHT;

				// Adjust spacing based on task count to reduce whitespace
				if (taskCount === 1) {
					taskSpacing = ROW_HEIGHT * 0.8; // Reduced spacing for single tasks
				} else if (taskCount <= 3) {
					taskSpacing = ROW_HEIGHT * 0.9; // Slightly reduced for small groups
				}

				for (let i = 0; i < group.tasks.length; i++) {
					const task = group.tasks[i];
					const taskItem = this.createTaskItem(
						task,
						currentY + taskSpacing / 2
					); // 将任务放在行的中心
					if (taskItem) {
						mappedTasks.push(taskItem);
					}
					currentY += taskSpacing;
				}
			}
		}

		// 更新组的实际高度
		group.height = currentY - startY;

		return currentY;
	}

	/**
	 * Create a task item for rendering
	 */
	private createTaskItem(
		task: Task,
		y: number
	): (Omit<GanttTaskItem, "startX"> & { startX?: number }) | null {
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
			y: y,
			startX,
			endX,
			width,
			isMilestone,
			level: 0,
		};
	}

	/**
	 * Calculate total dimensions for the chart
	 */
	private calculateTotalDimensions(): void {
		// Use virtualization manager to get accurate total height
		const viewportInfo = this.virtualizationManager.getViewportInfo();

		// Ensure a minimum height even if there are no tasks initially
		const MIN_ROWS_DISPLAY = 5; // Show at least 5 rows worth of height
		this.totalHeight = Math.max(
			viewportInfo.totalHeight,
			MIN_ROWS_DISPLAY * ROW_HEIGHT
		);

		const totalDays = this.dateHelper.daysBetween(
			this.startDate!,
			this.endDate!
		);
		this.totalWidth = totalDays * this.dayWidth;
	}

	/**
	 * Count total number of group headers (including subgroups)
	 */
	private countGroupHeaders(groups: TaskGroup[]): number {
		let count = 0;
		for (const group of groups) {
			count++; // Count this group
			if (group.expanded && group.subGroups) {
				count += this.countGroupHeaders(group.subGroups);
			}
		}
		return count;
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
		const groupingHeight = this.groupingContainerEl.offsetHeight || 40;
		const filterHeight = this.filterContainerEl.offsetHeight || 36;
		const totalTopHeight = HEADER_HEIGHT + groupingHeight + filterHeight;
		// Ensure calculation is robust
		this.scrollContainerEl.style.height = `calc(100% - ${totalTopHeight}px)`;

		// --- Update Child Components ---

		// 1. Update Header
		this.updateHeaderComponent();

		// 2. Update Group Headers
		if (this.groupHeaderRenderer) {
			const groupingConfig = this.groupingManager.getConfig();
			this.groupHeaderRenderer.updateParams({
				app: this.app,
				svgGroupEl: this.groupHeaderGroupEl!,
				groups: this.taskGroups,
				totalWidth: this.totalWidth,
				onGroupToggle: (groupId: string) => {
					this.groupingManager.toggleGroupExpanded(groupId);
					this.regroupAndRender();
				},
				showGroupHeaders: groupingConfig.showGroupHeaders ?? true,
				collapsibleGroups: groupingConfig.collapsibleGroups ?? true,
				getGroupVisibility: (groupId: string) => {
					// Provide access to the GroupInteractionManager's visibility state
					return (
						this.groupInteractionManager?.isGroupVisible(groupId) ??
						true
					);
				},
			});
		}

		// 3. Update Group Sidebar
		if (this.groupSidebar) {
			const scrollTop = this.scrollContainerEl.scrollTop;
			this.groupSidebar.updateParams({
				groups: this.taskGroups,
				scrollTop: scrollTop,
				totalHeight: this.totalHeight,
				onGroupClick: (groupId: string) => {
					// Scroll to group in main chart
					const group = this.findGroupById(groupId, this.taskGroups);
					if (group) {
						const targetScrollTop = Math.max(0, group.y - 50); // Add some padding
						this.scrollContainerEl.scrollTo({
							top: targetScrollTop,
							behavior: "smooth",
						});
					}
				},
				onGroupToggle: (groupId: string) => {
					this.groupingManager.toggleGroupExpanded(groupId);
					const groupStates = this.configManager.getGroupStates();
					groupStates[groupId] =
						this.groupingManager.isGroupExpanded(groupId);
					this.configManager.updateGroupStates(groupStates);
					this.regroupAndRender();
				},
				onGroupFilter: (groupId: string, visible: boolean) => {
					// Handle group visibility filtering
					console.log(
						`Group ${groupId} visibility toggled to: ${visible}`
					);
					if (this.groupInteractionManager) {
						this.groupInteractionManager.setGroupVisible(
							groupId,
							visible
						);
					}
					// Trigger re-render to apply filter changes
					this.regroupAndRender();
				},
				getGroupVisibility: (groupId: string) => {
					// Provide access to the GroupInteractionManager's visibility state
					return (
						this.groupInteractionManager?.isGroupVisible(groupId) ??
						true
					);
				},
			});
		}

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
		const renderBuffer = this.config.renderBufferSize; // 使用配置的缓冲区大小
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

			// Calculate top position relative to the chart area
			// pt.y is absolute position in the content, we need to account for:
			// 1. Header height offset
			// 2. Scroll position to make it relative to visible area
			const headerOffset = this.headerContainerEl
				? this.headerContainerEl.offsetHeight
				: HEADER_HEIGHT;
			const indicatorTop =
				pt.y - scrollTop + headerOffset - indicatorYOffset;

			// Only show indicators for tasks that are within the visible vertical range
			const containerHeight = this.scrollContainerEl.clientHeight;
			const isVerticallyVisible =
				indicatorTop >= headerOffset &&
				indicatorTop <= containerHeight + headerOffset;

			if (isVerticallyVisible) {
				if (taskEndX < visibleStartX - indicatorBuffer) {
					// Task is offscreen to the left
					this.leftIndicatorEl.createDiv({
						cls: "gantt-single-indicator",
						attr: {
							style: `top: ${indicatorTop}px;`,
							title: pt.task.content,
							"data-task-id": pt.task.id,
						},
					});
				} else if (taskStartX > visibleEndX + indicatorBuffer) {
					// Task is offscreen to the right
					this.rightIndicatorEl.createDiv({
						cls: "gantt-single-indicator",
						attr: {
							style: `top: ${indicatorTop}px;`,
							title: pt.task.content,
							"data-task-id": pt.task.id,
						},
					});
				}
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
		const scrollTop = target.scrollTop;

		// Update visible start date based on scroll
		const daysScrolled = scrollLeft / Math.max(1, this.dayWidth);
		this.visibleStartDate = this.dateHelper.addDays(
			this.startDate!,
			daysScrolled
		);

		// Sync sidebar scroll position
		if (this.groupSidebar) {
			this.groupSidebar.updateScrollPosition(scrollTop);
		}

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
		console.log("GanttComponent: Refreshing chart...");

		// 输出性能指标
		const metrics = this.getPerformanceMetrics();
		console.log("Performance metrics:", metrics);

		// Ensure date range is calculated before preparing tasks
		if (!this.startDate || !this.endDate) {
			this.calculateDateRange();
		}

		this.prepareTasksForRender();
		this.debouncedRender();
	}

	// --- Filtering Logic ---
	private applyFiltersAndRender(activeFilters: ActiveFilter[]) {
		console.log("Applying filters: ", activeFilters);

		// Convert ActiveFilter[] to a text query for the centralized filter system
		// This provides a bridge between the inview-filter system and centralized filtering
		let textQuery = "";
		const filterTerms: string[] = [];

		for (const filter of activeFilters) {
			switch (filter.category) {
				case "status":
				case "project":
				case "context":
					filterTerms.push(filter.value);
					break;
				case "tag":
					// Tags might be searched with or without # prefix
					filterTerms.push(
						filter.value.startsWith("#")
							? filter.value
							: `#${filter.value}`
					);
					break;
				case "priority":
					// For priority, we'll include the priority value in search
					filterTerms.push(filter.value);
					break;
				case "filePath":
					// File path searches
					filterTerms.push(filter.value);
					break;
				// Note: completed filter is handled by the centralized system via view configuration
			}
		}

		if (filterTerms.length > 0) {
			textQuery = filterTerms.join(" ");
		}

		// Use the centralized filter system
		this.tasks = filterTasks(
			this.allTasks,
			this.viewId as ViewMode,
			this.plugin,
			{ textQuery }
		);

		console.log("Filtered tasks count:", this.tasks.length);

		// Re-group the filtered tasks to ensure groups reflect the current filter state
		this.taskGroups = this.groupingManager.groupTasks(
			this.tasks,
			ROW_HEIGHT
		);

		// Recalculate date range based on filtered tasks and prepare for render
		this.calculateDateRange(true); // Force recalculate based on filtered tasks
		this.prepareTasksForRender(); // Uses the filtered this.tasks

		// Note: Filter functionality has been moved to global filter system
		// No need to update filter options in controls popover anymore

		this.debouncedRender();
	}

	/**
	 * Get performance metrics for debugging
	 */
	public getPerformanceMetrics() {
		const virtualizationMetrics =
			this.virtualizationManager.getPerformanceMetrics();
		return {
			totalTasks: this.tasks.length,
			preparedTasks: this.preparedTasks.length,
			taskGroups: this.taskGroups.length,
			usingVirtualization:
				this.config.useVirtualization &&
				this.tasks.length > this.config.maxTasksWithoutVirtualization,
			virtualization: virtualizationMetrics,
			config: {
				maxTasksWithoutVirtualization:
					this.config.maxTasksWithoutVirtualization,
				debounceRenderMs: this.config.debounceRenderMs,
				renderBufferSize: this.config.renderBufferSize,
			},
		};
	}

	/**
	 * Reset performance counters
	 */
	public resetPerformanceMetrics() {
		this.virtualizationManager.resetPerformanceMetrics();
	}

	// --- Tab Management Methods ---

	/**
	 * Handle tab change
	 */
	private handleTabChange(tab: GanttViewTab): void {
		console.log("Tab changed:", tab.name);

		// Apply tab configuration
		if (tab.config.groupingConfig) {
			this.groupingManager.updateConfig(tab.config.groupingConfig);
			this.configManager.updateGroupingConfig(tab.config.groupingConfig);
			this.regroupAndRender();
		}

		if (tab.config.filters) {
			this.applyFiltersAndRender(tab.config.filters);
		}

		// Update controls popover with tab settings
		if (this.controlsPopover) {
			this.controlsPopover.updateGroupingConfig(
				tab.config.groupingConfig || this.groupingManager.getConfig()
			);
		}
	}

	/**
	 * Handle tab creation
	 */
	private handleTabCreate(tab: GanttViewTab): void {
		console.log("Tab created:", tab.name);
		// New tab is automatically activated, so we just need to ensure proper state
		this.regroupAndRender();
	}

	/**
	 * Handle tab deletion
	 */
	private handleTabDelete(tabId: string): void {
		console.log("Tab deleted:", tabId);
		// The active tab will be automatically switched by the GanttViewTabs component
		// We just need to ensure the view is properly refreshed
		this.regroupAndRender();
	}

	/**
	 * Handle tab rename
	 */
	private handleTabRename(tabId: string, newName: string): void {
		console.log("Tab renamed:", tabId, "->", newName);
		// No action needed as this is just a UI change
	}
}
