import {
	App,
	Component,
	Menu,
	Platform,
	setIcon,
	WorkspaceLeaf,
} from "obsidian";
import TaskProgressBarPlugin from "../../index"; // Adjust path as needed
import { Task } from "../../types/task"; // Adjust path as needed
import { KanbanColumnComponent } from "./kanban-column";
// import { DragManager, DragMoveEvent, DragEndEvent } from "../DragManager";
import Sortable from "sortablejs";
import "../../styles/kanban/kanban.css";
import { t } from "../../translations/helper"; // Added import for t
import {
	FilterComponent,
	buildFilterOptionsFromTasks,
} from "../inview-filter/filter";
import { ActiveFilter } from "../inview-filter/filter-type";
import {
	KanbanSpecificConfig,
	KanbanColumnConfig,
} from "../../common/setting-definition";
import { getEffectiveProject, isProjectReadonly } from "../../utils/taskUtil";

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
	private columnSortableInstance: Sortable | null = null;
	private tasks: Task[] = [];
	private allTasks: Task[] = [];
	private currentViewId: string = "kanban"; // 新增：当前视图ID
	private columnOrder: string[] = [];
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
		} = {},
		viewId: string = "kanban" // 新增：视图ID参数
	) {
		super();
		this.app = app;
		this.plugin = plugin;
		this.currentViewId = viewId; // 设置当前视图ID
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

		// Destroy column sortable instance
		if (this.columnSortableInstance) {
			this.columnSortableInstance.destroy();
			this.columnSortableInstance = null;
		}

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
							return task.metadata.project === filter.value;
						case "context":
							return task.metadata.context === filter.value;
						case "priority":
							const expectedPriority =
								PRIORITY_MAP[filter.value] ||
								parseInt(filter.value);
							return task.metadata.priority === expectedPriority;
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
		if (!task.metadata.tags || task.metadata.tags.length === 0)
			return false;

		return task.metadata.tags.some((taskTag) => {
			// Skip non-string tags
			if (typeof taskTag !== "string") {
				return false;
			}

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
			(v) => v.id === this.currentViewId
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

		// Initialize column sorting
		this.initializeColumnSortable();
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

		// Apply saved column order to status names
		const statusColumns = statusNames.map((name) => ({ title: name }));
		const orderedStatusColumns = this.applyColumnOrder(statusColumns);
		const orderedStatusNames = orderedStatusColumns.map((col) => col.title);

		orderedStatusNames.forEach((statusName) => {
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

		// Apply saved column order to column configurations
		const orderedColumnConfigs = this.applyColumnOrder(columnConfigs);

		orderedColumnConfigs.forEach((config) => {
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
					const metadata = task.metadata || {};
					if (metadata.tags) {
						metadata.tags.forEach((tag) => {
							// Skip non-string tags
							if (typeof tag === "string") {
								allTags.add(tag);
							}
						});
					}
				});
				const tagColumns = Array.from(allTags).map((tag) => ({
					title: `${tag}`,
					value: tag,
					id: `tag-${tag}`,
				}));
				tagColumns.unshift({
					title: "No Tags",
					value: "",
					id: "tag-none",
				});
				return tagColumns;
			case "project":
				// Get unique projects from all tasks (including tgProject)
				const allProjects = new Set<string>();
				this.tasks.forEach((task) => {
					const effectiveProject = getEffectiveProject(task);
					if (effectiveProject) {
						allProjects.add(effectiveProject);
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
					const metadata = task.metadata || {};
					if (metadata.context) {
						allContexts.add(metadata.context);
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

		// Ensure both tasks have metadata property
		const metadataA = a.metadata || {};
		const metadataB = b.metadata || {};

		switch (field) {
			case "priority":
				const priorityA = metadataA.priority ?? 0;
				const priorityB = metadataB.priority ?? 0;
				comparison = priorityA - priorityB;
				break;
			case "dueDate":
				const dueDateA = metadataA.dueDate ?? Number.MAX_SAFE_INTEGER;
				const dueDateB = metadataB.dueDate ?? Number.MAX_SAFE_INTEGER;
				comparison = dueDateA - dueDateB;
				break;
			case "scheduledDate":
				const scheduledA =
					metadataA.scheduledDate ?? Number.MAX_SAFE_INTEGER;
				const scheduledB =
					metadataB.scheduledDate ?? Number.MAX_SAFE_INTEGER;
				comparison = scheduledA - scheduledB;
				break;
			case "startDate":
				const startA = metadataA.startDate ?? Number.MAX_SAFE_INTEGER;
				const startB = metadataB.startDate ?? Number.MAX_SAFE_INTEGER;
				comparison = startA - startB;
				break;
			case "createdDate":
				const createdA =
					metadataA.createdDate ?? Number.MAX_SAFE_INTEGER;
				const createdB =
					metadataB.createdDate ?? Number.MAX_SAFE_INTEGER;
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
		const sourceColumnContent = event.from;

		if (taskId && dropTargetColumnContent) {
			// Get target column information
			const targetColumnEl =
				dropTargetColumnContent.closest(".tg-kanban-column");
			const targetColumnTitle = targetColumnEl
				? (targetColumnEl as HTMLElement).querySelector(
						".tg-kanban-column-title"
				  )?.textContent
				: null;

			// Get source column information
			const sourceColumnEl =
				sourceColumnContent.closest(".tg-kanban-column");
			const sourceColumnTitle = sourceColumnEl
				? (sourceColumnEl as HTMLElement).querySelector(
						".tg-kanban-column-title"
				  )?.textContent
				: null;

			if (targetColumnTitle && sourceColumnTitle) {
				const kanbanConfig =
					this.plugin.settings.viewConfiguration.find(
						(v) => v.id === this.currentViewId
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
					const sourceValue = this.getColumnValueFromTitle(
						sourceColumnTitle,
						groupBy,
						kanbanConfig?.customColumns
					);
					console.log(
						`Kanban requesting ${groupBy} update for task ${taskId} from ${sourceValue} to value: ${targetValue}`
					);
					await this.handlePropertyUpdate(
						taskId,
						groupBy,
						sourceValue,
						targetValue
					);
				}
			}
		}
	}

	private loadKanbanConfig() {
		const kanbanConfig = this.plugin.settings.viewConfiguration.find(
			(v) => v.id === this.currentViewId
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

		// Load saved column order
		this.loadColumnOrder();
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

		taskToUpdate.metadata = taskToUpdate.metadata || {};

		// Create updated task object
		const updatedTask = { ...taskToUpdate };

		// Update the specific property based on groupBy type
		switch (groupBy) {
			case "priority":
				updatedTask.metadata.priority =
					newValue === null || newValue === ""
						? undefined
						: Number(newValue);
				break;
			case "tags":
				if (newValue === null || newValue === "") {
					// Moving to "No Tags" column - remove all tags
					updatedTask.metadata.tags = [];
				} else {
					// Moving to a specific tag column
					// Use the oldValue parameter to determine which tag to remove
					let currentTags = updatedTask.metadata.tags || [];

					console.log("Tags update - current tags:", currentTags);
					console.log("Tags update - oldValue:", oldValue);
					console.log("Tags update - newValue:", newValue);

					// Remove the old tag if it exists and is different from the new value
					if (oldValue && oldValue !== "" && oldValue !== newValue) {
						// Try to match the oldValue with existing tags
						// Handle both with and without # prefix
						const oldTagVariants = [
							oldValue,
							`#${oldValue}`,
							oldValue.startsWith("#")
								? oldValue.substring(1)
								: oldValue,
						];

						currentTags = currentTags.filter(
							(tag) => !oldTagVariants.includes(tag)
						);
						console.log("Tags after removing old:", currentTags);
					}

					// Add the new tag if it's not already present
					// Handle both with and without # prefix
					const newTagVariants = [
						newValue,
						`#${newValue}`,
						newValue.startsWith("#")
							? newValue.substring(1)
							: newValue,
					];

					const hasNewTag = currentTags.some((tag) =>
						newTagVariants.includes(tag)
					);
					if (!hasNewTag) {
						// Add the tag in the same format as existing tags, or without # if no existing tags
						const tagToAdd =
							currentTags.length > 0 &&
							currentTags[0].startsWith("#")
								? newValue.startsWith("#")
									? newValue
									: `#${newValue}`
								: newValue.startsWith("#")
								? newValue.substring(1)
								: newValue;
						currentTags.push(tagToAdd);
					}

					console.log("Tags after adding new:", currentTags);
					updatedTask.metadata.tags = currentTags;
				}
				break;
			case "project":
				// Only update project if it's not a read-only tgProject
				if (!isProjectReadonly(taskToUpdate)) {
					updatedTask.metadata.project =
						newValue === null || newValue === ""
							? undefined
							: newValue;
				}
				break;
			case "context":
				updatedTask.metadata.context =
					newValue === null || newValue === "" ? undefined : newValue;
				break;
			case "dueDate":
			case "scheduledDate":
			case "startDate":
				// For date fields, we need to convert the category back to an actual date
				const dateValue = this.convertDateCategoryToTimestamp(newValue);
				if (groupBy === "dueDate") {
					updatedTask.metadata.dueDate = dateValue;
				} else if (groupBy === "scheduledDate") {
					updatedTask.metadata.scheduledDate = dateValue;
				} else if (groupBy === "startDate") {
					updatedTask.metadata.startDate = dateValue;
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
			console.log(
				`Updating task ${taskId} ${groupBy} from:`,
				oldValue,
				"to:",
				newValue
			);
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
			const metadata = task.metadata || {};
			switch (groupBy) {
				case "priority":
					if (value === null || value === "") {
						return !metadata.priority;
					}
					return metadata.priority === value;
				case "tags":
					if (value === null || value === "") {
						return !metadata.tags || metadata.tags.length === 0;
					}
					return (
						metadata.tags &&
						metadata.tags.some(
							(tag) => typeof tag === "string" && tag === value
						)
					);
				case "project":
					if (value === null || value === "") {
						return !getEffectiveProject(task);
					}
					return getEffectiveProject(task) === value;
				case "context":
					if (value === null || value === "") {
						return !metadata.context;
					}
					return metadata.context === value;
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

		const metadata = task.metadata || {};
		let taskDate: number | undefined;
		switch (dateField) {
			case "dueDate":
				taskDate = metadata.dueDate;
				break;
			case "scheduledDate":
				taskDate = metadata.scheduledDate;
				break;
			case "startDate":
				taskDate = metadata.startDate;
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
		console.log("customColumns", customColumns);
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
				return title.startsWith("#")
					? title.trim().substring(1)
					: title;
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
		const metadata = task.metadata || {};
		switch (groupBy) {
			case "tags":
				// For tags, find which tag column this task would be in
				// We need to check against the current column configuration
				const kanbanConfig =
					this.plugin.settings.viewConfiguration.find(
						(v) => v.id === this.currentViewId
					)?.specificConfig as KanbanSpecificConfig;

				if (
					kanbanConfig?.customColumns &&
					kanbanConfig.customColumns.length > 0
				) {
					// Check custom columns
					for (const column of kanbanConfig.customColumns) {
						if (column.value === "" || column.value === null) {
							// "No Tags" column
							if (!metadata.tags || metadata.tags.length === 0) {
								return "";
							}
						} else {
							// Specific tag column
							if (
								metadata.tags &&
								metadata.tags.some(
									(tag) =>
										typeof tag === "string" &&
										tag === column.value
								)
							) {
								return column.value;
							}
						}
					}
				} else {
					// Use default columns - find the first tag that matches existing columns
					if (!metadata.tags || metadata.tags.length === 0) {
						return "";
					}
					// Return the first string tag (for simplicity, as we need to determine which column it came from)
					const firstStringTag = metadata.tags.find(
						(tag) => typeof tag === "string"
					);
					return firstStringTag || "";
				}
				return "";
			case "project":
				return getEffectiveProject(task) || "";
			case "context":
				return metadata.context || "";
			case "priority":
				return metadata.priority || null;
			case "dueDate":
				return this.getDateCategory(metadata.dueDate);
			case "scheduledDate":
				return this.getDateCategory(metadata.scheduledDate);
			case "startDate":
				return this.getDateCategory(metadata.startDate);
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

	// Column order management methods
	private getColumnOrderKey(): string {
		const kanbanConfig = this.plugin.settings.viewConfiguration.find(
			(v) => v.id === this.currentViewId
		)?.specificConfig as KanbanSpecificConfig;
		const groupBy = kanbanConfig?.groupBy || "status";
		return `kanban-column-order-${this.currentViewId}-${groupBy}`;
	}

	private loadColumnOrder(): void {
		try {
			const key = this.getColumnOrderKey();
			const savedOrder = this.app.loadLocalStorage(key);
			if (savedOrder) {
				this.columnOrder = JSON.parse(savedOrder);
			} else {
				this.columnOrder = [];
			}
		} catch (error) {
			console.warn(
				"Failed to load column order from localStorage:",
				error
			);
			this.columnOrder = [];
		}
	}

	private saveColumnOrder(order: string[]): void {
		try {
			const key = this.getColumnOrderKey();
			this.app.saveLocalStorage(key, JSON.stringify(order));
			this.columnOrder = [...order];
		} catch (error) {
			console.warn("Failed to save column order to localStorage:", error);
		}
	}

	private applyColumnOrder<T extends { title: string; id?: string }>(
		columns: T[]
	): T[] {
		try {
			if (this.columnOrder.length === 0) {
				return columns;
			}

			if (!Array.isArray(columns)) {
				console.warn(
					"Invalid columns array provided to applyColumnOrder"
				);
				return [];
			}

			const orderedColumns: T[] = [];
			const remainingColumns = [...columns];

			// First, add columns in the saved order
			this.columnOrder.forEach((orderedId) => {
				if (orderedId) {
					const columnIndex = remainingColumns.findIndex(
						(col) =>
							(col.id && col.id === orderedId) ||
							col.title === orderedId
					);
					if (columnIndex !== -1) {
						orderedColumns.push(
							remainingColumns.splice(columnIndex, 1)[0]
						);
					}
				}
			});

			// Then, add any remaining columns that weren't in the saved order
			orderedColumns.push(...remainingColumns);

			return orderedColumns;
		} catch (error) {
			console.error("Error applying column order:", error);
			return columns; // Fallback to original order
		}
	}

	private initializeColumnSortable(): void {
		// Destroy existing column sortable instance if it exists
		if (this.columnSortableInstance) {
			this.columnSortableInstance.destroy();
			this.columnSortableInstance = null;
		}

		// Create sortable instance for column container
		this.columnSortableInstance = Sortable.create(this.columnContainerEl, {
			group: "kanban-columns",
			animation: 150,
			ghostClass: "tg-kanban-column-ghost",
			dragClass: "tg-kanban-column-dragging",
			handle: ".tg-kanban-column-header", // Only allow dragging by header
			direction: "horizontal", // Columns are arranged horizontally
			swapThreshold: 0.65, // Threshold for swapping elements
			filter: ".tg-kanban-column-content, .tg-kanban-card, .tg-kanban-add-card-button", // Prevent dragging these elements
			preventOnFilter: false, // Don't prevent default on filtered elements
			onEnd: (event) => {
				this.handleColumnSortEnd(event);
			},
		});
	}

	private handleColumnSortEnd(event: Sortable.SortableEvent): void {
		console.log("Column sort end:", event.oldIndex, event.newIndex);

		try {
			if (event.oldIndex === event.newIndex) {
				return; // No change in position
			}

			// Get the current column order from DOM
			const newColumnOrder: string[] = [];
			const columnElements =
				this.columnContainerEl.querySelectorAll(".tg-kanban-column");

			if (columnElements.length === 0) {
				console.warn("No column elements found during column sort end");
				return;
			}

			columnElements.forEach((columnEl) => {
				const columnTitle = (columnEl as HTMLElement).querySelector(
					".tg-kanban-column-title"
				)?.textContent;
				if (columnTitle) {
					// Use the data-status-name attribute if available, otherwise use title
					const statusName = (columnEl as HTMLElement).getAttribute(
						"data-status-name"
					);
					const columnId = statusName || columnTitle;

					newColumnOrder.push(columnId);
				}
			});

			if (newColumnOrder.length === 0) {
				console.warn("No valid column order found during sort end");
				return;
			}

			// Save the new order
			this.saveColumnOrder(newColumnOrder);
		} catch (error) {
			console.error("Error handling column sort end:", error);
		}
	}
}
