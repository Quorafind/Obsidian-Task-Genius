import {
	App,
	Component,
	ExtraButtonComponent,
	Platform,
	setIcon,
} from "obsidian";
import { Task } from "../../types/task";
import { CalendarComponent, CalendarOptions } from "./calendar";
import { TaskListItemComponent } from "./listItem";
import { t } from "../../translations/helper";
import "../../styles/forecast.css";
import "../../styles/calendar.css";
import { TaskTreeItemComponent } from "./treeItem";
import { TaskListRendererComponent } from "./TaskList";
import TaskProgressBarPlugin from "../../index";
import { ForecastSpecificConfig } from "../../common/setting-definition";
import { sortTasks } from "../../commands/sortTaskCommands"; // 导入 sortTasks 函数
import { getInitialViewMode, saveViewMode } from "../../utils/ui/view-mode-utils";

interface DateSection {
	title: string;
	date: Date;
	tasks: Task[];
	isExpanded: boolean;
	renderer?: TaskListRendererComponent;
}

export class ForecastComponent extends Component {
	// UI Elements
	public containerEl: HTMLElement;
	private forecastHeaderEl: HTMLElement;
	private settingsEl: HTMLElement;
	private calendarContainerEl: HTMLElement;
	private dueSoonContainerEl: HTMLElement;
	private taskContainerEl: HTMLElement;
	private taskListContainerEl: HTMLElement;
	private focusBarEl: HTMLElement;
	private titleEl: HTMLElement;
	private statsContainerEl: HTMLElement;

	private leftColumnEl: HTMLElement;
	private rightColumnEl: HTMLElement;

	// Child components
	private calendarComponent: CalendarComponent;
	private taskComponents: TaskListItemComponent[] = [];

	// State
	private allTasks: Task[] = [];
	private pastTasks: Task[] = [];
	private todayTasks: Task[] = [];
	private futureTasks: Task[] = [];
	private selectedDate: Date;
	private currentDate: Date;
	private dateSections: DateSection[] = [];
	private focusFilter: string | null = null;
	private windowFocusHandler: () => void;
	private isTreeView: boolean = false;
	private treeComponents: TaskTreeItemComponent[] = [];
	private allTasksMap: Map<string, Task> = new Map();

	constructor(
		private parentEl: HTMLElement,
		private app: App,
		private plugin: TaskProgressBarPlugin,
		private params: {
			onTaskSelected?: (task: Task | null) => void;
			onTaskCompleted?: (task: Task) => void;
			onTaskUpdate?: (
				originalTask: Task,
				updatedTask: Task
			) => Promise<void>;
			onTaskContextMenu?: (event: MouseEvent, task: Task) => void;
		} = {}
	) {
		super();
		// Initialize dates
		this.currentDate = new Date();
		this.currentDate.setHours(0, 0, 0, 0);
		this.selectedDate = new Date(this.currentDate);
	}

	onload() {
		// Create main container
		this.containerEl = this.parentEl.createDiv({
			cls: "forecast-container",
		});

		// Create content container for columns
		const contentContainer = this.containerEl.createDiv({
			cls: "forecast-content",
		});

		// Left column: create calendar section and due soon stats
		this.createLeftColumn(contentContainer);

		// Right column: create task sections by date
		this.createRightColumn(contentContainer);

		// Initialize view mode from saved state or global default
		this.initializeViewMode();

		// Set up window focus handler
		this.windowFocusHandler = () => {
			// Update current date when window regains focus
			const newCurrentDate = new Date();
			newCurrentDate.setHours(0, 0, 0, 0);

			// Store previous current date for comparison
			const oldCurrentDate = new Date(this.currentDate);
			oldCurrentDate.setHours(0, 0, 0, 0);

			// Update current date
			this.currentDate = newCurrentDate;

			// Update the calendar's current date
			this.calendarComponent.setCurrentDate(this.currentDate);

			// Only update selected date if it's older than the new current date
			// and the selected date was previously on the current date
			const selectedDateTimestamp = new Date(this.selectedDate).setHours(
				0,
				0,
				0,
				0
			);
			const oldCurrentTimestamp = oldCurrentDate.getTime();
			const newCurrentTimestamp = newCurrentDate.getTime();

			// Check if selectedDate equals oldCurrentDate (was on "today")
			// and if the new current date is after the selected date
			if (
				selectedDateTimestamp === oldCurrentTimestamp &&
				selectedDateTimestamp < newCurrentTimestamp
			) {
				// Update selected date to the new current date
				this.selectedDate = new Date(newCurrentDate);
				// Update the calendar's selected date
				this.calendarComponent.selectDate(this.selectedDate);
			}
			// If the date hasn't changed (still the same day), don't refresh
			if (oldCurrentTimestamp === newCurrentTimestamp) {
				// Skip refreshing if it's still the same day
				return;
			}
			// Update tasks categorization and UI
			this.categorizeTasks();
			this.updateTaskStats();
			this.updateDueSoonSection();
			this.refreshDateSectionsUI();
		};

		// Register the window focus event
		this.registerDomEvent(window, "focus", this.windowFocusHandler);
	}

	private createForecastHeader() {
		this.forecastHeaderEl = this.taskContainerEl.createDiv({
			cls: "forecast-header",
		});

		if (Platform.isPhone) {
			this.forecastHeaderEl.createEl(
				"div",
				{
					cls: "forecast-sidebar-toggle",
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

		// Title and task count
		const titleContainer = this.forecastHeaderEl.createDiv({
			cls: "forecast-title-container",
		});

		this.titleEl = titleContainer.createDiv({
			cls: "forecast-title",
			text: t("Forecast"),
		});

		const countEl = titleContainer.createDiv({
			cls: "forecast-count",
		});
		countEl.setText(t("0 tasks, 0 projects"));

		// View toggle and settings
		const actionsContainer = this.forecastHeaderEl.createDiv({
			cls: "forecast-actions",
		});

		// List/Tree toggle button
		const viewToggleBtn = actionsContainer.createDiv({
			cls: "view-toggle-btn",
		});
		setIcon(viewToggleBtn, "list");
		viewToggleBtn.setAttribute("aria-label", t("Toggle list/tree view"));

		this.registerDomEvent(viewToggleBtn, "click", () => {
			this.toggleViewMode();
		});

		// // Settings button
		// this.settingsEl = actionsContainer.createDiv({
		// 	cls: "forecast-settings",
		// });
		// setIcon(this.settingsEl, "settings");
	}

	/**
	 * Initialize view mode from saved state or global default
	 */
	private initializeViewMode() {
		this.isTreeView = getInitialViewMode(this.app, this.plugin, "forecast");
		// Update the toggle button icon to match the initial state
		const viewToggleBtn = this.forecastHeaderEl?.querySelector(
			".view-toggle-btn"
		) as HTMLElement;
		if (viewToggleBtn) {
			setIcon(viewToggleBtn, this.isTreeView ? "git-branch" : "list");
		}
	}

	private toggleViewMode() {
		this.isTreeView = !this.isTreeView;

		// Update toggle button icon
		const viewToggleBtn = this.forecastHeaderEl.querySelector(
			".view-toggle-btn"
		) as HTMLElement;
		if (viewToggleBtn) {
			setIcon(viewToggleBtn, this.isTreeView ? "git-branch" : "list");
		}

		// Save the new view mode state
		saveViewMode(this.app, "forecast", this.isTreeView);

		// Update sections display
		this.refreshDateSectionsUI();
	}

	private createFocusBar() {
		this.focusBarEl = this.taskContainerEl.createDiv({
			cls: "forecast-focus-bar",
		});

		const focusInput = this.focusBarEl.createEl("input", {
			cls: "focus-input",
			attr: {
				type: "text",
				placeholder: t("Focusing on Work"),
			},
		});

		const unfocusBtn = this.focusBarEl.createEl("button", {
			cls: "unfocus-button",
			text: t("Unfocus"),
		});

		this.registerDomEvent(unfocusBtn, "click", () => {
			focusInput.value = "";
		});
	}

	private createLeftColumn(parentEl: HTMLElement) {
		this.leftColumnEl = parentEl.createDiv({
			cls: "forecast-left-column",
		});

		if (Platform.isPhone) {
			// Add close button for mobile sidebar
			const closeBtn = this.leftColumnEl.createDiv({
				cls: "forecast-sidebar-close",
			});

			new ExtraButtonComponent(closeBtn).setIcon("x").onClick(() => {
				this.toggleLeftColumnVisibility(false);
			});
		}

		// Stats bar for Past Due / Today / Future counts
		this.createStatsBar(this.leftColumnEl);

		// Calendar section
		this.calendarContainerEl = this.leftColumnEl.createDiv({
			cls: "forecast-calendar-section",
		});

		// Create and initialize calendar component
		const forecastConfig = this.plugin.settings.viewConfiguration.find(
			(view) => view.id === "forecast"
		)?.specificConfig as ForecastSpecificConfig;

		// Convert ForecastSpecificConfig to CalendarOptions
		const calendarOptions: Partial<CalendarOptions> = {
			firstDayOfWeek: forecastConfig?.firstDayOfWeek ?? 0,
			showWeekends: !(forecastConfig?.hideWeekends ?? false), // Invert hideWeekends to showWeekends
			showTaskCounts: true,
		};

		this.calendarComponent = new CalendarComponent(
			this.calendarContainerEl,
			calendarOptions
		);
		this.addChild(this.calendarComponent);
		this.calendarComponent.load();

		// Due Soon section below calendar
		this.createDueSoonSection(this.leftColumnEl);

		// Set up calendar events
		this.calendarComponent.onDateSelected = (date, tasks) => {
			const selectedDate = new Date(date);
			selectedDate.setHours(0, 0, 0, 0);
			this.selectedDate = selectedDate;

			// Update the Coming Up section first
			this.updateDueSoonSection();
			// Then refresh the date sections in the right panel
			this.refreshDateSectionsUI();

			if (Platform.isPhone) {
				this.toggleLeftColumnVisibility(false);
			}
		};
	}

	private createStatsBar(parentEl: HTMLElement) {
		this.statsContainerEl = parentEl.createDiv({
			cls: "forecast-stats",
		});

		// Create stat items
		const createStatItem = (
			id: string,
			label: string,
			count: number,
			type: string
		) => {
			const statItem = this.statsContainerEl.createDiv({
				cls: `stat-item tg-${id}`,
			});

			const countEl = statItem.createDiv({
				cls: "stat-count",
				text: count.toString(),
			});

			const labelEl = statItem.createDiv({
				cls: "stat-label",
				text: label,
			});

			// Register click handler
			this.registerDomEvent(statItem, "click", () => {
				this.focusTaskList(type);

				if (Platform.isPhone) {
					this.toggleLeftColumnVisibility(false);
				}
			});

			return statItem;
		};

		// Create stats for past due, today, and future
		createStatItem("past-due", t("Past Due"), 0, "past-due");
		createStatItem("today", t("Today"), 0, "today");
		createStatItem("future", t("Future"), 0, "future");
	}

	private createDueSoonSection(parentEl: HTMLElement) {
		this.dueSoonContainerEl = parentEl.createDiv({
			cls: "forecast-due-soon-section",
		});

		// Due soon entries will be added when tasks are set
	}

	private createRightColumn(parentEl: HTMLElement) {
		this.taskContainerEl = parentEl.createDiv({
			cls: "forecast-right-column",
		});

		// Create header with project count and actions
		this.createForecastHeader();

		// Create focus filter bar
		// this.createFocusBar();

		this.taskListContainerEl = this.taskContainerEl.createDiv({
			cls: "forecast-task-list",
		});

		// Date sections will be added when tasks are set
	}

	public setTasks(tasks: Task[]) {
		this.allTasks = tasks;
		this.allTasksMap = new Map(
			this.allTasks.map((task) => [task.id, task])
		);

		// Update header count
		this.updateHeaderCount();

		// Filter and categorize tasks
		this.categorizeTasks();

		// Update calendar with all tasks
		this.calendarComponent.setTasks(this.allTasks);

		// Update stats
		this.updateTaskStats();

		// Update due soon section
		this.updateDueSoonSection();

		// Calculate and render date sections for the right column
		this.calculateDateSections();
		this.renderDateSectionsUI();
	}

	private updateHeaderCount() {
		// Count actions (tasks) and unique projects
		const projectSet = new Set<string>();
		this.allTasks.forEach((task) => {
			if (task.metadata.project) {
				projectSet.add(task.metadata.project);
			}
		});

		const taskCount = this.allTasks.length;
		const projectCount = projectSet.size;

		// Update header
		const countEl = this.forecastHeaderEl.querySelector(".forecast-count");
		if (countEl) {
			countEl.textContent = `${taskCount} ${t(
				"tasks"
			)}, ${projectCount} ${t("project")}${
				projectCount !== 1 ? "s" : ""
			}`;
		}
	}

	private categorizeTasks() {
		// Use currentDate as today
		const today = new Date(this.currentDate);
		today.setHours(0, 0, 0, 0);
		const todayTimestamp = today.getTime();

		const sortCriteria = this.plugin.settings.viewConfiguration.find(
			(view) => view.id === "forecast"
		)?.sortCriteria;

		// Filter for incomplete tasks with a relevant date
		const tasksWithRelevantDate = this.allTasks.filter(
			(task) => this.getRelevantDate(task) !== undefined
		);

		// Split into past, today, and future based on relevantDate
		this.pastTasks = tasksWithRelevantDate.filter((task) => {
			const relevantTimestamp = this.getRelevantDate(task)!;
			return relevantTimestamp < todayTimestamp;
		});
		this.todayTasks = tasksWithRelevantDate.filter((task) => {
			const relevantTimestamp = this.getRelevantDate(task)!;
			return relevantTimestamp === todayTimestamp;
		});
		this.futureTasks = tasksWithRelevantDate.filter((task) => {
			const relevantTimestamp = this.getRelevantDate(task)!;
			return relevantTimestamp > todayTimestamp;
		});

		// Use sortTasks to sort tasks
		if (sortCriteria && sortCriteria.length > 0) {
			this.pastTasks = sortTasks(
				this.pastTasks,
				sortCriteria,
				this.plugin.settings
			);
			this.todayTasks = sortTasks(
				this.todayTasks,
				sortCriteria,
				this.plugin.settings
			);
			this.futureTasks = sortTasks(
				this.futureTasks,
				sortCriteria,
				this.plugin.settings
			);
		} else {
			// 如果未启用排序设置，使用默认的优先级和日期排序
			this.pastTasks = this.sortTasksByPriorityAndRelevantDate(
				this.pastTasks
			);
			this.todayTasks = this.sortTasksByPriorityAndRelevantDate(
				this.todayTasks
			);
			this.futureTasks = this.sortTasksByPriorityAndRelevantDate(
				this.futureTasks
			);
		}
	}

	/**
	 * 按优先级和相关日期排序任务
	 */
	private sortTasksByPriorityAndRelevantDate(tasks: Task[]): Task[] {
		return tasks.sort((a, b) => {
			// First by priority (high to low)
			const priorityA = a.metadata.priority || 0;
			const priorityB = b.metadata.priority || 0;
			if (priorityA !== priorityB) {
				return priorityB - priorityA;
			}

			// Then by relevant date (early to late)
			// Ensure dates exist before comparison
			const relevantDateA = this.getRelevantDate(a);
			const relevantDateB = this.getRelevantDate(b);

			if (relevantDateA === undefined && relevantDateB === undefined)
				return 0;
			if (relevantDateA === undefined) return 1; // Place tasks without dates later
			if (relevantDateB === undefined) return -1; // Place tasks without dates later

			return relevantDateA - relevantDateB;
		});
	}

	private updateTaskStats() {
		// Update counts in stats bar
		const statItems = this.statsContainerEl.querySelectorAll(".stat-item");
		statItems.forEach((item) => {
			const countEl = item.querySelector(".stat-count");
			if (countEl) {
				// Note: Labels remain "Past Due", "Today", "Future" but now include scheduled tasks.
				if (item.hasClass("tg-past-due")) {
					countEl.textContent = this.pastTasks.length.toString(); // Use pastTasks
				} else if (item.hasClass("tg-today")) {
					countEl.textContent = this.todayTasks.length.toString();
				} else if (item.hasClass("tg-future")) {
					countEl.textContent = this.futureTasks.length.toString();
				}
			}
		});
	}

	private updateDueSoonSection() {
		// Clear existing content
		this.dueSoonContainerEl.empty();

		// Use the current selected date as the starting point
		// Always create a new date object to avoid reference issues
		const baseDate = new Date(this.selectedDate);
		baseDate.setHours(0, 0, 0, 0);

		const dueSoonItems: { date: Date; tasks: Task[] }[] = [];

		// Process tasks with relevant dates in the next 15 days from the selected date
		for (let i = 0; i < 15; i++) {
			const date = new Date(baseDate);
			date.setDate(date.getDate() + i);

			// Skip the selected day itself - Coming Up should show days *after* the selected one
			if (date.getTime() === baseDate.getTime()) continue;

			// Use the new function checking relevantDate
			const tasksForDay = this.getTasksForRelevantDate(date);
			if (tasksForDay.length > 0) {
				dueSoonItems.push({
					date: date,
					tasks: tasksForDay,
				});
			}
		}

		// Add a header
		const headerEl = this.dueSoonContainerEl.createDiv({
			cls: "due-soon-header",
		});
		headerEl.setText(t("Coming Up")); // Title remains "Coming Up"

		// Create entries for upcoming tasks based on relevant date
		dueSoonItems.forEach((item) => {
			const itemEl = this.dueSoonContainerEl.createDiv({
				cls: "due-soon-item",
			});

			// Format the date
			const dateStr = this.formatDateForDueSoon(item.date);

			// Get day of week
			const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
				item.date.getDay()
			];

			const dateEl = itemEl.createDiv({
				cls: "due-soon-date",
			});
			dateEl.setText(`${dayOfWeek}, ${dateStr}`);

			const countEl = itemEl.createDiv({
				cls: "due-soon-count",
			});

			// Properly format the task count
			const taskCount = item.tasks.length;
			countEl.setText(
				`${taskCount} ${taskCount === 1 ? t("Task") : t("Tasks")}`
			);

			// Add click handler to select this date in the calendar
			this.registerDomEvent(itemEl, "click", () => {
				this.calendarComponent.selectDate(item.date);
				// this.selectedDate = item.date; // This is now handled by calendarComponent.onDateSelected
				// this.refreshDateSectionsUI(); // This is now handled by calendarComponent.onDateSelected

				if (Platform.isPhone) {
					this.toggleLeftColumnVisibility(false);
				}
			});
		});

		// Add empty state if needed
		if (dueSoonItems.length === 0) {
			const emptyEl = this.dueSoonContainerEl.createDiv({
				cls: "due-soon-empty",
			});
			emptyEl.setText(t("No upcoming tasks"));
		}
	}

	private formatDateForDueSoon(date: Date): string {
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
		return `${monthNames[date.getMonth()]} ${date.getDate()}`;
	}

	private calculateDateSections() {
		this.dateSections = [];

		// Today section
		if (this.todayTasks.length > 0) {
			this.dateSections.push({
				title: this.formatSectionTitleForDate(this.currentDate), // Use helper for consistent title
				date: new Date(this.currentDate),
				tasks: this.todayTasks, // Use categorized todayTasks
				isExpanded: true,
			});
		}

		// Future sections by relevant date
		const dateMap = new Map<string, Task[]>();
		this.futureTasks.forEach((task) => {
			const relevantTimestamp = this.getRelevantDate(task);
			if (relevantTimestamp) {
				const date = new Date(relevantTimestamp); // Already zeroed by getRelevantDate logic implicitly via getTime()
				// Use local date components for the key to avoid timezone shifts in map key
				const dateKey = `${date.getFullYear()}-${String(
					date.getMonth() + 1
				).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

				if (!dateMap.has(dateKey)) {
					dateMap.set(dateKey, []);
				}
				// Ensure task is added only once per relevant date section
				if (!dateMap.get(dateKey)!.some((t) => t.id === task.id)) {
					dateMap.get(dateKey)!.push(task);
				}
			}
		});

		// Sort dates and create sections
		const sortedDates = Array.from(dateMap.keys()).sort();

		sortedDates.forEach((dateKey) => {
			const [year, month, day] = dateKey.split("-").map(Number);
			const date = new Date(year, month - 1, day);
			const tasks = dateMap.get(dateKey)!; // Tasks should already be sorted by priority within category

			const today = new Date(this.currentDate);
			today.setHours(0, 0, 0, 0);

			// Use helper for title
			const title = this.formatSectionTitleForDate(date);

			this.dateSections.push({
				title: title,
				date: date,
				tasks: tasks,
				isExpanded: this.shouldExpandFutureSection(
					date,
					this.currentDate
				), // Expand based on relation to today
			});
		});

		// Past section (if any) - using pastTasks
		// Title remains "Past Due" but covers overdue and past scheduled.
		if (this.pastTasks.length > 0) {
			this.dateSections.unshift({
				title: t("Past Due"), // Keep title for now
				date: new Date(0), // Placeholder date
				tasks: this.pastTasks, // Use pastTasks
				isExpanded: true,
			});
		}

		const viewConfig = this.plugin.settings.viewConfiguration.find(
			(view) => view.id === "forecast"
		);
		if (viewConfig?.sortCriteria && viewConfig.sortCriteria.length > 0) {
			const dueDateSortCriterion = viewConfig.sortCriteria.find(
				(t) => t.field === "dueDate"
			);
			const scheduledDateSortCriterion = viewConfig.sortCriteria.find(
				(t) => t.field === "scheduledDate"
			);
			if (dueDateSortCriterion && dueDateSortCriterion.order === "desc") {
				this.dateSections.reverse();
			} else if (
				scheduledDateSortCriterion &&
				scheduledDateSortCriterion.order === "desc"
			) {
				this.dateSections.reverse();
			}
		}
	}

	private renderDateSectionsUI() {
		this.cleanupRenderers();

		// Ensure the map is up-to-date (belt and suspenders)
		this.allTasksMap = new Map(
			this.allTasks.map((task) => [task.id, task])
		);

		if (this.dateSections.length === 0) {
			const emptyEl = this.taskListContainerEl.createDiv({
				cls: "forecast-empty-state",
			});
			emptyEl.setText(t("No tasks scheduled"));
			return;
		}

		this.dateSections.forEach((section) => {
			const sectionEl = this.taskListContainerEl.createDiv({
				cls: "task-date-section",
			});

			// Check if this section is overdue
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const sectionDate = new Date(section.date);
			sectionDate.setHours(0, 0, 0, 0);

			// Add 'overdue' class for past due sections
			if (
				sectionDate.getTime() < today.getTime() ||
				section.title === "Past Due"
			) {
				sectionEl.addClass("overdue");
			}

			// Section header
			const headerEl = sectionEl.createDiv({
				cls: "date-section-header",
			});

			// Expand/collapse toggle
			const toggleEl = headerEl.createDiv({
				cls: "section-toggle",
			});
			setIcon(
				toggleEl,
				section.isExpanded ? "chevron-down" : "chevron-right"
			);

			// Section title
			const titleEl = headerEl.createDiv({
				cls: "section-title",
			});
			titleEl.setText(section.title);

			// Task count badge
			const countEl = headerEl.createDiv({
				cls: "section-count",
			});
			countEl.setText(`${section.tasks.length}`);

			// Task container (initially hidden if collapsed)
			const taskListEl = sectionEl.createDiv({
				cls: "section-tasks",
			});

			if (!section.isExpanded) {
				taskListEl.hide();
			}

			// Register toggle event
			this.registerDomEvent(headerEl, "click", () => {
				section.isExpanded = !section.isExpanded;
				setIcon(
					toggleEl,
					section.isExpanded ? "chevron-down" : "chevron-right"
				);
				section.isExpanded ? taskListEl.show() : taskListEl.hide();
			});

			// Create and configure renderer for this section
			section.renderer = new TaskListRendererComponent(
				this,
				taskListEl,
				this.plugin,
				this.app,
				"forecast"
			);
			this.params.onTaskSelected &&
				(section.renderer.onTaskSelected = this.params.onTaskSelected);
			this.params.onTaskCompleted &&
				(section.renderer.onTaskCompleted =
					this.params.onTaskCompleted);
			this.params.onTaskContextMenu &&
				(section.renderer.onTaskContextMenu =
					this.params.onTaskContextMenu);

			// Set up task update callback - use params callback if available, otherwise use internal updateTask
			section.renderer.onTaskUpdate = async (
				originalTask: Task,
				updatedTask: Task
			) => {
				if (this.params.onTaskUpdate) {
					await this.params.onTaskUpdate(originalTask, updatedTask);
				} else {
					// Fallback to internal updateTask method
					this.updateTask(updatedTask);
				}
			};

			// Render tasks using the section's renderer
			section.renderer.renderTasks(
				section.tasks,
				this.isTreeView,
				this.allTasksMap,
				t("No tasks for this section.")
			);
		});
	}

	private formatDate(date: Date): string {
		const months = [
			"January",
			"February",
			"March",
			"April",
			"May",
			"June",
			"July",
			"August",
			"September",
			"October",
			"November",
			"December",
		];
		return `${
			months[date.getMonth()]
		} ${date.getDate()}, ${date.getFullYear()}`;
	}

	private focusTaskList(type: string) {
		// Clear previous focus
		const statItems = this.statsContainerEl.querySelectorAll(".stat-item");
		statItems.forEach((item) => item.classList.remove("active"));

		// Set new focus
		if (this.focusFilter === type) {
			// Toggle off if already selected
			this.focusFilter = null;
		} else {
			this.focusFilter = type;
			const activeItem = this.statsContainerEl.querySelector(
				`.stat-item.tg-${type}` // Use the type identifier passed during creation
			);
			if (activeItem) {
				activeItem.classList.add("active");
			}
		}

		// Update date sections based on filter using new task categories
		if (this.focusFilter === "past-due") {
			this.dateSections =
				this.pastTasks.length > 0
					? [
							// Check if tasks exist
							{
								title: t("Past Due"), // Title kept
								date: new Date(0),
								tasks: this.pastTasks, // Use pastTasks
								isExpanded: true,
							},
					  ]
					: []; // Empty array if no past tasks
		} else if (this.focusFilter === "today") {
			this.dateSections =
				this.todayTasks.length > 0
					? [
							// Check if tasks exist
							{
								title: this.formatSectionTitleForDate(
									this.currentDate
								), // Use helper
								date: new Date(this.currentDate),
								tasks: this.todayTasks, // Use todayTasks
								isExpanded: true,
							},
					  ]
					: []; // Empty array if no today tasks
		} else if (this.focusFilter === "future") {
			// Recalculate future sections using relevant dates
			this.calculateDateSections(); // Recalculates all, including future
			// Filter out past and today sections from the full recalculation
			const todayTimestamp = new Date(this.currentDate).setHours(
				0,
				0,
				0,
				0
			);
			this.dateSections = this.dateSections.filter((section) => {
				// Keep sections whose date is strictly after today
				// Exclude the 'Past Due' section (date timestamp 0)
				const sectionTimestamp = section.date.getTime();
				return sectionTimestamp > todayTimestamp;
			});
		} else {
			// No filter, show all sections (recalculate)
			this.calculateDateSections();
		}

		// Re-render the sections
		this.renderDateSectionsUI();
	}

	private refreshDateSectionsUI() {
		// Update sections based on selected date
		if (this.focusFilter) {
			// If there's a filter active, don't change the sections
			return;
		}

		this.cleanupRenderers();

		// Calculate the sections based on the new selectedDate
		this.calculateFilteredDateSections();

		// Render the newly calculated sections
		this.renderDateSectionsUI();
	}

	private calculateFilteredDateSections() {
		this.dateSections = [];

		// 基于选择日期重新分类所有任务
		const selectedTimestamp = new Date(this.selectedDate).setHours(0, 0, 0, 0);
		
		// 获取有相关日期的任务
		const tasksWithRelevantDate = this.allTasks.filter(
			(task) => this.getRelevantDate(task) !== undefined
		);
		
		// 相对于选择日期重新分类
		const pastTasksRelativeToSelected = tasksWithRelevantDate.filter((task) => {
			const relevantTimestamp = this.getRelevantDate(task)!;
			return relevantTimestamp < selectedTimestamp;
		});
		
		const selectedDateTasks = tasksWithRelevantDate.filter((task) => {
			const relevantTimestamp = this.getRelevantDate(task)!;
			return relevantTimestamp === selectedTimestamp;
		});
		
		const futureTasksRelativeToSelected = tasksWithRelevantDate.filter((task) => {
			const relevantTimestamp = this.getRelevantDate(task)!;
			return relevantTimestamp > selectedTimestamp;
		});

		// 获取排序配置
		const sortCriteria = this.plugin.settings.viewConfiguration.find(
			(view) => view.id === "forecast"
		)?.sortCriteria;

		// 对重新分类的任务进行排序
		let sortedPastTasks: Task[];
		let sortedSelectedDateTasks: Task[];
		let sortedFutureTasks: Task[];

		if (sortCriteria && sortCriteria.length > 0) {
			sortedPastTasks = sortTasks(
				pastTasksRelativeToSelected,
				sortCriteria,
				this.plugin.settings
			);
			sortedSelectedDateTasks = sortTasks(
				selectedDateTasks,
				sortCriteria,
				this.plugin.settings
			);
			sortedFutureTasks = sortTasks(
				futureTasksRelativeToSelected,
				sortCriteria,
				this.plugin.settings
			);
		} else {
			sortedPastTasks = this.sortTasksByPriorityAndRelevantDate(
				pastTasksRelativeToSelected
			);
			sortedSelectedDateTasks = this.sortTasksByPriorityAndRelevantDate(
				selectedDateTasks
			);
			sortedFutureTasks = this.sortTasksByPriorityAndRelevantDate(
				futureTasksRelativeToSelected
			);
		}

		// Section for the selected date
		if (sortedSelectedDateTasks.length > 0) {
			this.dateSections.push({
				title: this.formatSectionTitleForDate(this.selectedDate),
				date: new Date(this.selectedDate),
				tasks: sortedSelectedDateTasks,
				isExpanded: true,
			});
		}

		// Add Past Due section if applicable
		if (sortedPastTasks.length > 0) {
			this.dateSections.unshift({
				title: t("Past Due"),
				date: new Date(0), // Placeholder
				tasks: sortedPastTasks,
				isExpanded: true,
			});
		}

		// Add future sections by date
		const dateMap = new Map<string, Task[]>();
		sortedFutureTasks.forEach((task) => {
			const relevantTimestamp = this.getRelevantDate(task)!;
			const date = new Date(relevantTimestamp);
			// Create date key
			const dateKey = `${date.getFullYear()}-${String(
				date.getMonth() + 1
			).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

			if (!dateMap.has(dateKey)) {
				dateMap.set(dateKey, []);
			}
			// Avoid duplicates
			if (!dateMap.get(dateKey)!.some((t) => t.id === task.id)) {
				dateMap.get(dateKey)!.push(task);
			}
		});

		const sortedDates = Array.from(dateMap.keys()).sort();
		sortedDates.forEach((dateKey) => {
			const [year, month, day] = dateKey.split("-").map(Number);
			const date = new Date(year, month - 1, day);
			const tasks = dateMap.get(dateKey)!;

			let title = this.formatSectionTitleForDate(date);

			this.dateSections.push({
				title: title,
				date: date,
				tasks: tasks,
				// Expand based on relation to the selected date
				isExpanded: this.shouldExpandFutureSection(
					date,
					this.selectedDate
				),
			});
		});

		// 处理排序配置中的降序设置
		if (sortCriteria && sortCriteria.length > 0) {
			const dueDateSortCriterion = sortCriteria.find(
				(t) => t.field === "dueDate"
			);
			const scheduledDateSortCriterion = sortCriteria.find(
				(t) => t.field === "scheduledDate"
			);
			if (dueDateSortCriterion && dueDateSortCriterion.order === "desc") {
				this.dateSections.reverse();
			} else if (
				scheduledDateSortCriterion &&
				scheduledDateSortCriterion.order === "desc"
			) {
				this.dateSections.reverse();
			}
		}

		// Handle empty state in renderDateSectionsUI
	}

	// Helper to format section titles dynamically based on relation to today
	private formatSectionTitleForDate(date: Date): string {
		const dateTimestamp = new Date(date).setHours(0, 0, 0, 0);
		const todayTimestamp = new Date(this.currentDate).setHours(0, 0, 0, 0);

		let prefix = "";
		const dayDiffFromToday = Math.round(
			(dateTimestamp - todayTimestamp) / (1000 * 3600 * 24)
		);

		if (dayDiffFromToday === 0) {
			prefix = t("Today") + ", ";
		} else if (dayDiffFromToday === 1) {
			prefix = t("Tomorrow") + ", ";
		}
		// else: no prefix for other days

		// Use full day name
		const dayOfWeek = [
			"Sunday",
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
		][date.getDay()];
		const formattedDate = this.formatDate(date); // e.g., "January 1, 2024"

		// For Today, just show "Today - Full Date"
		if (dayDiffFromToday === 0) {
			return t("Today") + " — " + formattedDate;
		}

		// For others, show Prefix + DayOfWeek + Full Date
		return `${prefix}${dayOfWeek}, ${formattedDate}`;
	}

	// Helper to decide if a future section should be expanded relative to a comparison date
	private shouldExpandFutureSection(
		sectionDate: Date,
		compareDate: Date
	): boolean {
		const compareTimestamp = new Date(compareDate).setHours(0, 0, 0, 0);
		const sectionTimestamp = new Date(sectionDate).setHours(0, 0, 0, 0);
		// Calculate difference in days from the comparison date
		const dayDiff = Math.round(
			(sectionTimestamp - compareTimestamp) / (1000 * 3600 * 24)
		);
		// Expand if the section date is within the next 7 days *after* the comparison date
		return dayDiff > 0 && dayDiff <= 7;
	}

	// Renaming getTasksForDate to be more specific about its check
	private getTasksForRelevantDate(date: Date): Task[] {
		if (!date) return [];

		const targetTimestamp = new Date(date).setHours(0, 0, 0, 0);

		return this.allTasks.filter((task) => {
			const relevantTimestamp = this.getRelevantDate(task);
			return relevantTimestamp === targetTimestamp;
		});
	}

	public updateTask(updatedTask: Task) {
		// Update in the main list
		const taskIndex = this.allTasks.findIndex(
			(t) => t.id === updatedTask.id
		);
		if (taskIndex !== -1) {
			this.allTasks[taskIndex] = updatedTask;
		} else {
			this.allTasks.push(updatedTask); // Add if new
		}
		this.allTasksMap.set(updatedTask.id, updatedTask);

		// Re-categorize tasks based on potentially changed relevantDate
		this.categorizeTasks();

		this.updateHeaderCount();
		this.updateTaskStats();
		this.updateDueSoonSection();
		this.calendarComponent.setTasks(this.allTasks);

		// Refresh UI based on current view state (filtered or full)
		if (this.focusFilter) {
			this.focusTaskList(this.focusFilter);
		} else {
			this.refreshDateSectionsUI();
		}
	}

	private cleanupRenderers() {
		this.dateSections.forEach((section) => {
			if (section.renderer) {
				this.removeChild(section.renderer);
				section.renderer = undefined;
			}
		});
		// Clear the container manually
		this.taskListContainerEl.empty();
	}

	onunload() {
		// Renderers are children, handled by Obsidian unload.
		// No need to manually remove DOM event listeners registered with this.registerDomEvent
		this.containerEl.empty();
		this.containerEl.remove();
	}

	// Toggle left column visibility with animation support
	private toggleLeftColumnVisibility(visible?: boolean) {
		if (visible === undefined) {
			// Toggle based on current state
			visible = !this.leftColumnEl.hasClass("is-visible");
		}

		if (visible) {
			this.leftColumnEl.addClass("is-visible");
			this.leftColumnEl.show();
		} else {
			this.leftColumnEl.removeClass("is-visible");

			// Wait for animation to complete before hiding
			setTimeout(() => {
				if (!this.leftColumnEl.hasClass("is-visible")) {
					this.leftColumnEl.hide();
				}
			}, 300); // Match CSS transition duration
		}
	}

	private getRelevantDate(task: Task): number | undefined {
		// Prioritize scheduledDate, fallback to dueDate
		const dateToUse = task.metadata.scheduledDate || task.metadata.dueDate;
		if (!dateToUse) return undefined;

		// Return timestamp (or Date object if needed elsewhere, but timestamp is good for comparisons)
		const date = new Date(dateToUse);
		date.setHours(0, 0, 0, 0); // Zero out time for consistent comparison
		return date.getTime();
	}
}
