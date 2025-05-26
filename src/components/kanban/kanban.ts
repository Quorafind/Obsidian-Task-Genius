import {
	App,
	Component,
	Menu,
	Platform,
	setIcon,
	WorkspaceLeaf,
} from "obsidian";
import TaskProgressBarPlugin from "../../index"; // Adjust path as needed
import { Task } from "../../utils/types/TaskIndex"; // Adjust path as needed
import { KanbanColumnComponent } from "./kanban-column";
// import { DragManager, DragMoveEvent, DragEndEvent } from "../DragManager";
import Sortable from "sortablejs";
import "../../styles/kanban/kanban.css";
import { t } from "../../translations/helper"; // Added import for t
import {
	FilterComponent,
	buildFilterOptionsFromTasks,
} from "../view-filter/filter";
import { ActiveFilter } from "../view-filter/filter-type";
import {
	KanbanSpecificConfig,
	KanbanColumnConfig,
} from "../../common/setting-definition";

// CSS classes for drop indicators
const DROP_INDICATOR_BEFORE_CLASS = "tg-kanban-card--drop-indicator-before";
const DROP_INDICATOR_AFTER_CLASS = "tg-kanban-card--drop-indicator-after";
const DROP_INDICATOR_EMPTY_CLASS =
	"tg-kanban-column-content--drop-indicator-empty";

export interface KanbanSortOption {
	field:
		| "priority"
		| "dueDate"
		| "scheduledDate"
		| "startDate"
		| "createdDate";
	order: "asc" | "desc";
	label: string;
}

export class KanbanComponent extends Component {
	plugin: TaskProgressBarPlugin;
	app: App;
	public containerEl: HTMLElement;
	private columns: KanbanColumnComponent[] = [];
	private columnContainerEl: HTMLElement;
	// private dragManager: DragManager;
	private sortableInstances: Sortable[] = [];
	private tasks: Task[] = [];
	private allTasks: Task[] = [];
	private params: {
		onTaskStatusUpdate?: (
			taskId: string,
			newStatusMark: string
		) => Promise<void>;
		onTaskSelected?: (task: Task) => void;
		onTaskCompleted?: (task: Task) => void;
		onTaskContextMenu?: (ev: MouseEvent, task: Task) => void;
	};
	private filterComponent: FilterComponent | null = null;
	private activeFilters: ActiveFilter[] = [];
	private filterContainerEl: HTMLElement; // Assume you have a container for filters
	private sortOption: KanbanSortOption = {
		field: "priority",
		order: "desc",
		label: "Priority (High to Low)",
	};
	private hideEmptyColumns: boolean = false;

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

		// Load configuration settings
		this.loadKanbanConfig();

		this.filterContainerEl = this.containerEl.createDiv({
			cls: "tg-kanban-filters",
		});

		// Render filter controls first
		this.renderFilterControls(this.filterContainerEl);

		// Then render sort and toggle controls
		this.renderControls(this.filterContainerEl);

		this.columnContainerEl = this.containerEl.createDiv({
			cls: "tg-kanban-column-container",
		});

		this.renderColumns();
		console.log("KanbanComponent loaded.");
	}

	override onunload() {
		super.onunload();
		this.columns.forEach((col) => col.unload());
		this.sortableInstances.forEach((instance) => instance.destroy());
		this.columns = [];
		this.containerEl.empty();
		console.log("KanbanComponent unloaded.");
	}

	private renderControls(containerEl: HTMLElement) {
		// Create a controls container for sort and toggle controls
		const controlsContainer = containerEl.createDiv({
			cls: "tg-kanban-controls-container",
		});

		// Sort dropdown
		const sortContainer = controlsContainer.createDiv({
			cls: "tg-kanban-sort-container",
		});

		const sortButton = sortContainer.createEl(
			"button",
			{
				cls: "tg-kanban-sort-button clickable-icon",
			},
			(el) => {
				setIcon(el, "arrow-up-down");
			}
		);

		this.registerDomEvent(sortButton, "click", (event) => {
			const menu = new Menu();

			const sortOptions: KanbanSortOption[] = [
				{
					field: "priority",
					order: "desc",
					label: t("Priority (High to Low)"),
				},
				{
					field: "priority",
					order: "asc",
					label: t("Priority (Low to High)"),
				},
				{
					field: "dueDate",
					order: "asc",
					label: t("Due Date (Earliest First)"),
				},
				{
					field: "dueDate",
					order: "desc",
					label: t("Due Date (Latest First)"),
				},
				{
					field: "scheduledDate",
					order: "asc",
					label: t("Scheduled Date (Earliest First)"),
				},
				{
					field: "scheduledDate",
					order: "desc",
					label: t("Scheduled Date (Latest First)"),
				},
				{
					field: "startDate",
					order: "asc",
					label: t("Start Date (Earliest First)"),
				},
				{
					field: "startDate",
					order: "desc",
					label: t("Start Date (Latest First)"),
				},
			];

			sortOptions.forEach((option) => {
				menu.addItem((item) => {
					item.setTitle(option.label)
						.setChecked(
							option.field === this.sortOption.field &&
								option.order === this.sortOption.order
						)
						.onClick(() => {
							this.sortOption = option;
							this.renderColumns();
						});
				});
			});

			menu.showAtMouseEvent(event);
		});
	}

	private renderFilterControls(containerEl: HTMLElement) {
		console.log("Kanban rendering filter controls");
		// Build initial options from the current full task list
		const initialFilterOptions = buildFilterOptionsFromTasks(this.allTasks);
		console.log("Kanban initial filter options:", initialFilterOptions);

		this.filterComponent = new FilterComponent(
			{
				container: containerEl,
				options: initialFilterOptions,
				onChange: (updatedFilters: ActiveFilter[]) => {
					if (!this.columnContainerEl) {
						return;
					}
					this.activeFilters = updatedFilters;
					this.applyFiltersAndRender(); // Re-render when filters change
				},
			},
			this.plugin // Pass plugin instance
		);

		this.addChild(this.filterComponent); // Register as child component
	}

	public setTasks(newTasks: Task[]) {
		console.log("Kanban setting tasks:", newTasks.length);
		this.allTasks = [...newTasks]; // Store the full list

		console.log(this.filterComponent);
		// Update filter options based on the complete task list
		if (this.filterComponent) {
			this.filterComponent.updateFilterOptions(this.allTasks);
		} else {
			console.warn(
				"Filter component not initialized when setting tasks."
			);
			// Options will be built when renderFilterControls is called if it hasn't been yet.
			// If renderFilterControls already ran, this might indicate an issue.
		}

		// Apply current filters (which might be empty initially) and render the board
		this.applyFiltersAndRender();
	}

	private applyFiltersAndRender() {
		console.log("Kanban applying filters:", this.activeFilters);
		// Filter the full list based on active filters
		if (this.activeFilters.length === 0) {
			this.tasks = [...this.allTasks]; // No filters active, show all tasks
		} else {
			// Import or define PRIORITY_MAP if needed for priority filtering
			const PRIORITY_MAP: Record<string, number> = {
				"🔺": 5,
				"⏫": 4,
				"🔼": 3,
				"🔽": 2,
				"⏬️": 1,
				"⏬": 1,
				highest: 5,
				high: 4,
				medium: 3,
				low: 2,
				lowest: 1,
				// Add numeric string mappings
				"1": 1,
				"2": 2,
				"3": 3,
				"4": 4,
				"5": 5,
			};

			this.tasks = this.allTasks.filter((task) => {
				return this.activeFilters.every((filter) => {
					switch (filter.category) {
						case "status":
							return task.status === filter.value;
						case "tag":
							// Support for nested tags - include child tags
							return this.matchesTagFilter(task, filter.value);
						case "project":
							return task.project === filter.value;
						case "context":
							return task.context === filter.value;
						case "priority":
							const expectedPriority =
								PRIORITY_MAP[filter.value] ||
								parseInt(filter.value);
							return task.priority === expectedPriority;
						case "completed":
							return (
								(filter.value === "Yes" && task.completed) ||
								(filter.value === "No" && !task.completed)
							);
						case "filePath":
							return task.filePath === filter.value;
						default:
							console.warn(
								`Unknown filter category in Kanban: ${filter.category}`
							);
							return true;
					}
				});
			});
		}

		console.log("Kanban filtered tasks count:", this.tasks.length);

		this.renderColumns();
	}

	// Enhanced tag filtering to support nested tags
	private matchesTagFilter(task: Task, filterTag: string): boolean {
		if (!task.tags || task.tags.length === 0) return false;

		return task.tags.some((taskTag) => {
			// Direct match
			if (taskTag === filterTag) return true;

			// Check if task tag is a child of the filter tag
			// e.g., filterTag = "#work", taskTag = "#work/project1"
			const normalizedFilterTag = filterTag.startsWith("#")
				? filterTag
				: `#${filterTag}`;
			const normalizedTaskTag = taskTag.startsWith("#")
				? taskTag
				: `#${taskTag}`;

			return normalizedTaskTag.startsWith(normalizedFilterTag + "/");
		});
	}

	// Handle filter application from clickable metadata
	private handleFilterApply = (
		filterType: string,
		value: string | number | string[]
	) => {
		// Convert value to string for consistent handling
		let stringValue = Array.isArray(value) ? value[0] : value.toString();

		// For priority filters, convert numeric input to icon representation if needed
		if (filterType === "priority" && /^\d+$/.test(stringValue)) {
			stringValue = this.convertPriorityToIcon(parseInt(stringValue));
		}

		// Add the filter to active filters
		const newFilter: ActiveFilter = {
			id: `${filterType}-${stringValue}`,
			category: filterType,
			categoryLabel: this.getCategoryLabel(filterType),
			value: stringValue,
		};

		console.log("Kanban handleFilterApply", filterType, stringValue);

		// Check if filter already exists
		const existingFilterIndex = this.activeFilters.findIndex(
			(f) => f.category === filterType && f.value === stringValue
		);

		if (existingFilterIndex === -1) {
			// Add new filter
			this.activeFilters.push(newFilter);
		} else {
			// Remove existing filter (toggle behavior)
			this.activeFilters.splice(existingFilterIndex, 1);
		}

		// Update filter component to reflect changes
		if (this.filterComponent) {
			this.filterComponent.setFilters(
				this.activeFilters.map((f) => ({
					category: f.category,
					value: f.value,
				}))
			);
		}

		// Re-apply filters and render
		this.applyFiltersAndRender();
	};

	private convertPriorityToIcon(priority: number): string {
		const PRIORITY_ICONS: Record<number, string> = {
			5: "🔺",
			4: "⏫",
			3: "🔼",
			2: "🔽",
			1: "⏬",
		};
		return PRIORITY_ICONS[priority] || priority.toString();
	}

	private getCategoryLabel(category: string): string {
		switch (category) {
			case "tag":
				return t("Tag");
			case "project":
				return t("Project");
			case "priority":
				return t("Priority");
			case "status":
				return t("Status");
			case "context":
				return t("Context");
			default:
				return category;
		}
	}

	private renderColumns() {
		this.columnContainerEl?.empty();
		this.columns.forEach((col) => this.removeChild(col));
		this.columns = [];

		const kanbanConfig = this.plugin.settings.viewConfiguration.find(
			(v) => v.id === "kanban"
		)?.specificConfig as KanbanSpecificConfig;

		const groupBy = kanbanConfig?.groupBy || "status";

		if (groupBy === "status") {
			this.renderStatusColumns();
		} else {
			this.renderCustomColumns(groupBy, kanbanConfig?.customColumns);
		}

		// Update column visibility based on hideEmptyColumns setting
		this.updateColumnVisibility();

		// Re-initialize sortable instances after columns are rendered
		this.initializeSortableInstances();
	}

	private renderStatusColumns() {
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
			const tasksForStatus = this.getTasksForStatus(statusName);

			const column = new KanbanColumnComponent(
				this.app,
				this.plugin,
				this.columnContainerEl,
				statusName,
				tasksForStatus,
				{
					...this.params,
					onTaskStatusUpdate: (
						taskId: string,
						newStatusMark: string
					) => this.handleStatusUpdate(taskId, newStatusMark),
					onFilterApply: this.handleFilterApply,
				}
			);
			this.addChild(column);
			this.columns.push(column);
		});
	}

	private renderCustomColumns(
		groupBy: string,
		customColumns?: KanbanColumnConfig[]
	) {
		let columnConfigs: { title: string; value: any; id: string }[] = [];

		if (customColumns && customColumns.length > 0) {
			// Use custom defined columns
			columnConfigs = customColumns
				.sort((a, b) => a.order - b.order)
				.map((col) => ({
					title: col.title,
					value: col.value,
					id: col.id,
				}));
		} else {
			// Generate default columns based on groupBy type
			columnConfigs = this.generateDefaultColumns(groupBy);
		}

		columnConfigs.forEach((config) => {
			const tasksForColumn = this.getTasksForProperty(
				groupBy,
				config.value
			);

			const column = new KanbanColumnComponent(
				this.app,
				this.plugin,
				this.columnContainerEl,
				config.title,
				tasksForColumn,
				{
					...this.params,
					onTaskStatusUpdate: (taskId: string, newValue: string) =>
						this.handlePropertyUpdate(
							taskId,
							groupBy,
							config.value,
							newValue
						),
					onFilterApply: this.handleFilterApply,
				}
			);
			this.addChild(column);
			this.columns.push(column);
		});
	}

	private generateDefaultColumns(
		groupBy: string
	): { title: string; value: any; id: string }[] {
		switch (groupBy) {
			case "priority":
				return [
					{ title: "🔺 Highest", value: 5, id: "priority-5" },
					{ title: "⏫ High", value: 4, id: "priority-4" },
					{ title: "🔼 Medium", value: 3, id: "priority-3" },
					{ title: "🔽 Low", value: 2, id: "priority-2" },
					{ title: "⏬ Lowest", value: 1, id: "priority-1" },
					{ title: "No Priority", value: null, id: "priority-none" },
				];
			case "tags":
				// Get unique tags from all tasks
				const allTags = new Set<string>();
				this.tasks.forEach((task) => {
					if (task.tags) {
						task.tags.forEach((tag) => allTags.add(tag));
					}
				});
				const tagColumns = Array.from(allTags).map((tag) => ({
					title: `#${tag}`,
					value: tag,
					id: `tag-${tag}`,
				}));
				tagColumns.push({
					title: "No Tags",
					value: "",
					id: "tag-none",
				});
				return tagColumns;
			case "project":
				// Get unique projects from all tasks
				const allProjects = new Set<string>();
				this.tasks.forEach((task) => {
					if (task.project) {
						allProjects.add(task.project);
					}
				});
				const projectColumns = Array.from(allProjects).map(
					(project) => ({
						title: project,
						value: project,
						id: `project-${project}`,
					})
				);
				projectColumns.push({
					title: "No Project",
					value: "",
					id: "project-none",
				});
				return projectColumns;
			case "context":
				// Get unique contexts from all tasks
				const allContexts = new Set<string>();
				this.tasks.forEach((task) => {
					if (task.context) {
						allContexts.add(task.context);
					}
				});
				const contextColumns = Array.from(allContexts).map(
					(context) => ({
						title: `@${context}`,
						value: context,
						id: `context-${context}`,
					})
				);
				contextColumns.push({
					title: "No Context",
					value: "",
					id: "context-none",
				});
				return contextColumns;
			case "dueDate":
			case "scheduledDate":
			case "startDate":
				return [
					{
						title: "Overdue",
						value: "overdue",
						id: `${groupBy}-overdue`,
					},
					{ title: "Today", value: "today", id: `${groupBy}-today` },
					{
						title: "Tomorrow",
						value: "tomorrow",
						id: `${groupBy}-tomorrow`,
					},
					{
						title: "This Week",
						value: "thisWeek",
						id: `${groupBy}-thisWeek`,
					},
					{
						title: "Next Week",
						value: "nextWeek",
						id: `${groupBy}-nextWeek`,
					},
					{ title: "Later", value: "later", id: `${groupBy}-later` },
					{ title: "No Date", value: null, id: `${groupBy}-none` },
				];
			case "filePath":
				// Get unique file paths from all tasks
				const allPaths = new Set<string>();
				this.tasks.forEach((task) => {
					if (task.filePath) {
						allPaths.add(task.filePath);
					}
				});
				return Array.from(allPaths).map((path) => ({
					title: path.split("/").pop() || path, // Show just filename
					value: path,
					id: `path-${path.replace(/[^a-zA-Z0-9]/g, "-")}`,
				}));
			default:
				return [{ title: "All Tasks", value: null, id: "all" }];
		}
	}

	private updateColumnVisibility() {
		this.columns.forEach((column) => {
			if (this.hideEmptyColumns && column.isEmpty()) {
				column.setVisible(false);
			} else {
				column.setVisible(true);
			}
		});
	}

	private getTasksForStatus(statusName: string): Task[] {
		const statusMark =
			this.plugin.settings.taskStatusMarks[statusName] || " ";

		// Filter from the already filtered list
		const tasksForStatus = this.tasks.filter((task) => {
			const taskStatusMark = task.status || " ";
			return taskStatusMark === statusMark;
		});

		// Sort tasks within the status column based on selected sort option
		tasksForStatus.sort((a, b) => {
			return this.compareTasks(a, b, this.sortOption);
		});

		return tasksForStatus;
	}

	private compareTasks(
		a: Task,
		b: Task,
		sortOption: KanbanSortOption
	): number {
		const { field, order } = sortOption;
		let comparison = 0;

		switch (field) {
			case "priority":
				const priorityA = a.priority ?? 0;
				const priorityB = b.priority ?? 0;
				comparison = priorityA - priorityB;
				break;
			case "dueDate":
				const dueDateA = a.dueDate ?? Number.MAX_SAFE_INTEGER;
				const dueDateB = b.dueDate ?? Number.MAX_SAFE_INTEGER;
				comparison = dueDateA - dueDateB;
				break;
			case "scheduledDate":
				const scheduledA = a.scheduledDate ?? Number.MAX_SAFE_INTEGER;
				const scheduledB = b.scheduledDate ?? Number.MAX_SAFE_INTEGER;
				comparison = scheduledA - scheduledB;
				break;
			case "startDate":
				const startA = a.startDate ?? Number.MAX_SAFE_INTEGER;
				const startB = b.startDate ?? Number.MAX_SAFE_INTEGER;
				comparison = startA - startB;
				break;
			case "createdDate":
				const createdA = a.createdDate ?? Number.MAX_SAFE_INTEGER;
				const createdB = b.createdDate ?? Number.MAX_SAFE_INTEGER;
				comparison = createdA - createdB;
				break;
		}

		// Apply order (asc/desc)
		return order === "desc" ? -comparison : comparison;
	}

	private initializeSortableInstances() {
		this.sortableInstances.forEach((instance) => instance.destroy());
		this.sortableInstances = [];

		// Detect if we're on a mobile device
		const isMobile =
			!Platform.isDesktop ||
			"ontouchstart" in window ||
			navigator.maxTouchPoints > 0;

		this.columns.forEach((col) => {
			const columnContent = col.getContentElement();
			const instance = Sortable.create(columnContent, {
				group: "kanban-group",
				animation: 150,
				ghostClass: "tg-kanban-card-ghost",
				dragClass: "tg-kanban-card-dragging",
				// Mobile-specific optimizations
				delay: isMobile ? 150 : 0, // Longer delay on mobile to distinguish from scroll
				touchStartThreshold: isMobile ? 5 : 3, // More threshold on mobile
				forceFallback: false, // Use native HTML5 drag when possible
				fallbackOnBody: true, // Append ghost to body for better mobile performance
				// Scroll settings for mobile
				scroll: true, // Enable auto-scrolling
				scrollSensitivity: isMobile ? 50 : 30, // Higher sensitivity on mobile
				scrollSpeed: isMobile ? 15 : 10, // Faster scroll on mobile
				bubbleScroll: true, // Enable bubble scrolling for nested containers
				onEnd: (event) => {
					this.handleSortEnd(event);
				},
			});
			this.sortableInstances.push(instance);
		});
	}

	private async handleSortEnd(event: Sortable.SortableEvent) {
		console.log("Kanban sort end:", event.oldIndex, event.newIndex);
		const taskId = event.item.dataset.taskId;
		const dropTargetColumnContent = event.to;

		if (taskId && dropTargetColumnContent) {
			const targetColumnEl =
				dropTargetColumnContent.closest(".tg-kanban-column");
			const targetColumnTitle = targetColumnEl
				? (targetColumnEl as HTMLElement).querySelector(
						".tg-kanban-column-title"
				  )?.textContent
				: null;

			if (targetColumnTitle) {
				const kanbanConfig =
					this.plugin.settings.viewConfiguration.find(
						(v) => v.id === "kanban"
					)?.specificConfig as KanbanSpecificConfig;

				const groupBy = kanbanConfig?.groupBy || "status";

				if (groupBy === "status") {
					// Handle status-based grouping (original logic)
					const targetStatusMark =
						this.plugin.settings.taskStatusMarks[targetColumnTitle];
					if (targetStatusMark !== undefined) {
						console.log(
							`Kanban requesting status update for task ${taskId} to status ${targetColumnTitle} (mark: ${targetStatusMark})`
						);
						await this.handleStatusUpdate(taskId, targetStatusMark);
					} else {
						console.warn(
							`Could not find status mark for status name: ${targetColumnTitle}`
						);
					}
				} else {
					// Handle property-based grouping
					const targetValue = this.getColumnValueFromTitle(
						targetColumnTitle,
						groupBy,
						kanbanConfig?.customColumns
					);
					console.log(
						`Kanban requesting ${groupBy} update for task ${taskId} to value: ${targetValue}`
					);
					await this.handlePropertyUpdate(
						taskId,
						groupBy,
						null,
						targetValue
					);
				}
			}
		}
	}

	private loadKanbanConfig() {
		const kanbanConfig = this.plugin.settings.viewConfiguration.find(
			(v) => v.id === "kanban"
		)?.specificConfig as KanbanSpecificConfig;

		if (kanbanConfig) {
			this.hideEmptyColumns = kanbanConfig.hideEmptyColumns || false;
			this.sortOption = {
				field: kanbanConfig.defaultSortField || "priority",
				order: kanbanConfig.defaultSortOrder || "desc",
				label: this.getSortOptionLabel(
					kanbanConfig.defaultSortField || "priority",
					kanbanConfig.defaultSortOrder || "desc"
				),
			};
		}
	}

	private getSortOptionLabel(field: string, order: string): string {
		const fieldLabels: Record<string, string> = {
			priority: t("Priority"),
			dueDate: t("Due Date"),
			scheduledDate: t("Scheduled Date"),
			startDate: t("Start Date"),
			createdDate: t("Created Date"),
		};

		const orderLabel = order === "asc" ? t("Ascending") : t("Descending");
		return `${fieldLabels[field]} (${orderLabel})`;
	}

	public getColumnContainer(): HTMLElement {
		return this.columnContainerEl;
	}

	private async handleStatusUpdate(
		taskId: string,
		newStatusMark: string
	): Promise<void> {
		if (this.params.onTaskStatusUpdate) {
			try {
				await this.params.onTaskStatusUpdate(taskId, newStatusMark);
			} catch (error) {
				console.error("Failed to update task status:", error);
			}
		}
	}

	private async handlePropertyUpdate(
		taskId: string,
		groupBy: string,
		oldValue: any,
		newValue: string
	): Promise<void> {
		// This method will handle updating task properties when dragged between columns
		if (groupBy === "status") {
			await this.handleStatusUpdate(taskId, newValue);
			return;
		}

		// Find the task to update
		const taskToUpdate = this.allTasks.find((task) => task.id === taskId);
		if (!taskToUpdate) {
			console.warn(
				`Task with ID ${taskId} not found for property update`
			);
			return;
		}

		// Create updated task object
		const updatedTask = { ...taskToUpdate };

		// Update the specific property based on groupBy type
		switch (groupBy) {
			case "priority":
				updatedTask.priority =
					newValue === null || newValue === ""
						? undefined
						: Number(newValue);
				break;
			case "tags":
				if (newValue === null || newValue === "") {
					// Moving to "No Tags" column - remove all tags
					updatedTask.tags = [];
				} else {
					// Moving to a specific tag column
					// First, we need to determine which tag the task was originally in
					const originalColumnTag = this.getTaskOriginalColumnValue(
						taskToUpdate,
						groupBy
					);

					// Remove the original tag if it exists and is different from the new value
					let currentTags = updatedTask.tags || [];
					if (
						originalColumnTag &&
						originalColumnTag !== "" &&
						originalColumnTag !== newValue
					) {
						currentTags = currentTags.filter(
							(tag) => tag !== originalColumnTag
						);
					}

					// Add the new tag if it's not already present
					if (!currentTags.includes(newValue)) {
						currentTags.push(newValue);
					}

					updatedTask.tags = currentTags;
				}
				break;
			case "project":
				updatedTask.project =
					newValue === null || newValue === "" ? undefined : newValue;
				break;
			case "context":
				updatedTask.context =
					newValue === null || newValue === "" ? undefined : newValue;
				break;
			case "dueDate":
			case "scheduledDate":
			case "startDate":
				// For date fields, we need to convert the category back to an actual date
				const dateValue = this.convertDateCategoryToTimestamp(newValue);
				if (groupBy === "dueDate") {
					updatedTask.dueDate = dateValue;
				} else if (groupBy === "scheduledDate") {
					updatedTask.scheduledDate = dateValue;
				} else if (groupBy === "startDate") {
					updatedTask.startDate = dateValue;
				}
				break;
			default:
				console.warn(
					`Unsupported property type for update: ${groupBy}`
				);
				return;
		}

		// Update the task using TaskManager
		try {
			console.log(`Updating task ${taskId} ${groupBy} to:`, newValue);
			await this.plugin.taskManager.updateTask(updatedTask);
		} catch (error) {
			console.error(
				`Failed to update task ${taskId} property ${groupBy}:`,
				error
			);
		}
	}

	private getTasksForProperty(groupBy: string, value: any): Task[] {
		// Filter tasks based on the groupBy property and value
		const tasksForProperty = this.tasks.filter((task) => {
			switch (groupBy) {
				case "priority":
					if (value === null || value === "") {
						return !task.priority;
					}
					return task.priority === value;
				case "tags":
					if (value === null || value === "") {
						return !task.tags || task.tags.length === 0;
					}
					return task.tags && task.tags.includes(value);
				case "project":
					if (value === null || value === "") {
						return !task.project;
					}
					return task.project === value;
				case "context":
					if (value === null || value === "") {
						return !task.context;
					}
					return task.context === value;
				case "dueDate":
				case "scheduledDate":
				case "startDate":
					return this.matchesDateCategory(task, groupBy, value);
				case "filePath":
					return task.filePath === value;
				default:
					return true;
			}
		});

		// Sort tasks within the property column based on selected sort option
		tasksForProperty.sort((a, b) => {
			return this.compareTasks(a, b, this.sortOption);
		});

		return tasksForProperty;
	}

	private matchesDateCategory(
		task: Task,
		dateField: string,
		category: string
	): boolean {
		const now = new Date();
		const today = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate()
		);
		const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
		const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
		const twoWeeksFromNow = new Date(
			today.getTime() + 14 * 24 * 60 * 60 * 1000
		);

		let taskDate: number | undefined;
		switch (dateField) {
			case "dueDate":
				taskDate = task.dueDate;
				break;
			case "scheduledDate":
				taskDate = task.scheduledDate;
				break;
			case "startDate":
				taskDate = task.startDate;
				break;
		}

		if (!taskDate) {
			return category === "none" || category === null || category === "";
		}

		const taskDateObj = new Date(taskDate);

		switch (category) {
			case "overdue":
				return taskDateObj < today;
			case "today":
				return taskDateObj >= today && taskDateObj < tomorrow;
			case "tomorrow":
				return (
					taskDateObj >= tomorrow &&
					taskDateObj <
						new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
				);
			case "thisWeek":
				return taskDateObj >= tomorrow && taskDateObj < weekFromNow;
			case "nextWeek":
				return (
					taskDateObj >= weekFromNow && taskDateObj < twoWeeksFromNow
				);
			case "later":
				return taskDateObj >= twoWeeksFromNow;
			case "none":
			case null:
			case "":
				return false; // Already handled above
			default:
				return false;
		}
	}

	private getColumnValueFromTitle(
		title: string,
		groupBy: string,
		customColumns?: KanbanColumnConfig[]
	): any {
		if (customColumns && customColumns.length > 0) {
			const column = customColumns.find((col) => col.title === title);
			return column ? column.value : null;
		}

		// Handle default columns based on groupBy type
		switch (groupBy) {
			case "priority":
				if (title.includes("Highest")) return 5;
				if (title.includes("High")) return 4;
				if (title.includes("Medium")) return 3;
				if (title.includes("Low")) return 2;
				if (title.includes("Lowest")) return 1;
				if (title.includes("No Priority")) return null;
				break;
			case "tags":
				if (title === "No Tags") return "";
				return title.startsWith("#") ? title.substring(1) : title;
			case "project":
				if (title === "No Project") return "";
				return title;
			case "context":
				if (title === "No Context") return "";
				return title.startsWith("@") ? title.substring(1) : title;
			case "dueDate":
			case "scheduledDate":
			case "startDate":
				if (title === "Overdue") return "overdue";
				if (title === "Today") return "today";
				if (title === "Tomorrow") return "tomorrow";
				if (title === "This Week") return "thisWeek";
				if (title === "Next Week") return "nextWeek";
				if (title === "Later") return "later";
				if (title === "No Date") return null;
				break;
			case "filePath":
				return title; // For file paths, the title is the value
		}
		return title;
	}

	private convertDateCategoryToTimestamp(
		category: string
	): number | undefined {
		if (category === null || category === "" || category === "none") {
			return undefined;
		}

		const now = new Date();
		const today = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate()
		);

		switch (category) {
			case "overdue":
				// For overdue, we can't determine a specific date, so return undefined
				// The user should manually set a specific date
				return undefined;
			case "today":
				return today.getTime();
			case "tomorrow":
				return new Date(
					today.getTime() + 24 * 60 * 60 * 1000
				).getTime();
			case "thisWeek":
				// Set to end of this week (Sunday)
				const daysUntilSunday = 7 - today.getDay();
				return new Date(
					today.getTime() + daysUntilSunday * 24 * 60 * 60 * 1000
				).getTime();
			case "nextWeek":
				// Set to end of next week
				const daysUntilNextSunday = 14 - today.getDay();
				return new Date(
					today.getTime() + daysUntilNextSunday * 24 * 60 * 60 * 1000
				).getTime();
			case "later":
				// Set to one month from now
				const oneMonthLater = new Date(today);
				oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
				return oneMonthLater.getTime();
			default:
				return undefined;
		}
	}

	private getTaskOriginalColumnValue(task: Task, groupBy: string): any {
		// Determine which column the task currently belongs to based on its properties
		switch (groupBy) {
			case "tags":
				// For tags, find which tag column this task would be in
				// We need to check against the current column configuration
				const kanbanConfig =
					this.plugin.settings.viewConfiguration.find(
						(v) => v.id === "kanban"
					)?.specificConfig as KanbanSpecificConfig;

				if (
					kanbanConfig?.customColumns &&
					kanbanConfig.customColumns.length > 0
				) {
					// Check custom columns
					for (const column of kanbanConfig.customColumns) {
						if (column.value === "" || column.value === null) {
							// "No Tags" column
							if (!task.tags || task.tags.length === 0) {
								return "";
							}
						} else {
							// Specific tag column
							if (
								task.tags &&
								task.tags.includes(column.value as string)
							) {
								return column.value;
							}
						}
					}
				} else {
					// Use default columns - find the first tag that matches existing columns
					if (!task.tags || task.tags.length === 0) {
						return "";
					}
					// Return the first tag (for simplicity, as we need to determine which column it came from)
					return task.tags[0];
				}
				return "";
			case "project":
				return task.project || "";
			case "context":
				return task.context || "";
			case "priority":
				return task.priority || null;
			case "dueDate":
				return this.getDateCategory(task.dueDate);
			case "scheduledDate":
				return this.getDateCategory(task.scheduledDate);
			case "startDate":
				return this.getDateCategory(task.startDate);
			case "filePath":
				return task.filePath;
			default:
				return null;
		}
	}

	private getDateCategory(timestamp: number | undefined): string {
		if (!timestamp) {
			return "none";
		}

		const now = new Date();
		const today = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate()
		);
		const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
		const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
		const twoWeeksFromNow = new Date(
			today.getTime() + 14 * 24 * 60 * 60 * 1000
		);

		const taskDate = new Date(timestamp);

		if (taskDate < today) {
			return "overdue";
		} else if (taskDate >= today && taskDate < tomorrow) {
			return "today";
		} else if (
			taskDate >= tomorrow &&
			taskDate < new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
		) {
			return "tomorrow";
		} else if (taskDate >= tomorrow && taskDate < weekFromNow) {
			return "thisWeek";
		} else if (taskDate >= weekFromNow && taskDate < twoWeeksFromNow) {
			return "nextWeek";
		} else {
			return "later";
		}
	}
}
