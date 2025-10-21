import {
	App,
	ButtonComponent,
	Component,
	DropdownComponent,
	TFile,
	moment,
	setIcon,
} from "obsidian";
import { Task } from "@/types/task"; // Assuming Task type exists here
import { IcsTask } from "@/types/ics";
// Removed: import { renderCalendarEvent } from "./event";
import "@/styles/calendar/view.css"; // Import the CSS file
import "@/styles/calendar/event.css"; // Import the CSS file
import "@/styles/calendar/badge.css"; // Import the badge CSS file
import { t } from "@/translations/helper";

// Import view rendering functions
import { MonthView } from "./views/month-view";
import { WeekView } from "./views/week-view";
import { DayView } from "./views/day-view";
import { AgendaView } from "./views/agenda-view";
import { YearView } from "./views/year-view";
import TaskProgressBarPlugin from "@/index";
import { QuickCaptureModal } from "@/components/features/quick-capture/modals/QuickCaptureModalWithSwitch";
// Import algorithm functions (optional for now, could be used within views)
// import { calculateEventLayout, determineEventColor } from './algorithm';
import { CalendarSpecificConfig } from "@/common/setting-definition";

// Define the types for the view modes
type CalendarViewMode = "year" | "month" | "week" | "day" | "agenda";

type CalendarView = MonthView | WeekView | DayView | AgendaView | YearView;

// Export for use in other modules
export interface CalendarEvent extends Task {
	// Inherits all properties from Task
	// Additional properties specific to calendar display:
	title: string; // Often the same as Task.content, but could be customized
	start: Date;
	end?: Date; // Optional end date for multi-day events
	allDay: boolean; // Indicates if the event is an all-day event
	// task: Task; // Removed, as properties are now inherited
	color?: string; // Optional color for the event
	badge?: boolean; // Indicates if this is a badge event (for ICS events with showType="badge")
}

export class CalendarComponent extends Component {
	public containerEl: HTMLElement;
	private tasks: Task[] = [];
	private events: CalendarEvent[] = [];
	private currentViewMode: CalendarViewMode = "month";
	private currentDate: moment.Moment = moment(); // Use moment.js provided by Obsidian

	private headerEl: HTMLElement;
	private viewContainerEl: HTMLElement; // Parent container for all views

	private app: App;
	private plugin: TaskProgressBarPlugin;

	// Track the currently active view component
	private activeViewComponent: CalendarView | null = null;

	// Performance optimization: Cache badge events by date
	private badgeEventsCache: Map<string, CalendarEvent[]> = new Map();
	private badgeEventsCacheVersion = 0;

	// Per-view override from Bases (firstDayOfWeek, hideWeekends, ...)
	private configOverride: Partial<CalendarSpecificConfig> | null = null;

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		parentEl: HTMLElement,
		initialTasks: Task[] = [],
		private params: {
			onTaskSelected?: (task: Task | null) => void;
			onTaskCompleted?: (task: Task) => void;
			onEventContextMenu?: (ev: MouseEvent, event: CalendarEvent) => void;
		} = {},
		private viewId: string = "calendar", // 新增：视图ID参数
	) {
		super();
		this.app = app;
		this.plugin = plugin;
		this.containerEl = parentEl.createDiv("full-calendar-container");
		this.tasks = initialTasks;

		this.headerEl = this.containerEl.createDiv("calendar-header");
		this.viewContainerEl = this.containerEl.createDiv(
			"calendar-view-container",
		);

		const viewMode = this.app.loadLocalStorage("task-genius:calendar-view");
		if (viewMode) {
			this.currentViewMode = viewMode as CalendarViewMode;
		}

		console.log("CalendarComponent initialized with params:", this.params);
	}

	override onload() {
		super.onload();

		this.processTasks(); // Process initial tasks into events
		this.render(); // Initial render (header and the default view)

		console.log("CalendarComponent loaded.");
	}

	override onunload() {
		super.onunload();
		// Detach the active view component if it exists

		if (this.activeViewComponent) {
			this.removeChild(this.activeViewComponent);
			this.activeViewComponent = null;
		}
		// If views were created and added as children even if inactive at some point,
		// Obsidian's Component.onunload should handle detaching them.
		// Explicitly removing them might be safer if addChild was ever called on inactive views.
		// Example: [this.monthView, this.weekView, ...].forEach(view => view && this.removeChild(view));

		this.containerEl.empty(); // Clean up the main container
		console.log("CalendarComponent unloaded.");
	}

	// --- Public API ---

	/**
	 * Updates the tasks displayed in the calendar.
	 * @param newTasks - The new array of tasks.
	 */
	updateTasks(newTasks: Task[]) {
		this.tasks = newTasks;
		// Clear badge cache when tasks change
		this.invalidateBadgeEventsCache();
		this.processTasks();
		// Only update the currently active view

		if (this.activeViewComponent) {
			this.activeViewComponent.updateEvents(this.events);
		} else {
			// If no view is active yet (e.g., called before initial render finishes),
			// render the view which will call update internally.
			this.renderCurrentView();
		}
	}

	/**
	 * Changes the current view mode.
	 * @param viewMode - The new view mode.
	 */
	setView(viewMode: CalendarViewMode) {
		if (this.currentViewMode !== viewMode) {
			this.currentViewMode = viewMode;
			this.render(); // Re-render header and switch the view

			this.app.saveLocalStorage(
				"task-genius:calendar-view",
				this.currentViewMode,
			);
		}
	}

	/**
	 * Navigates the calendar view forward or backward.
	 * @param direction - 'prev' or 'next'.
	 */
	navigate(direction: "prev" | "next") {
		const unit = this.getViewUnit();
		if (direction === "prev") {
			this.currentDate.subtract(1, unit);
		} else {
			this.currentDate.add(1, unit);
		}
		this.render(); // Re-render header and update the view
	}

	/**
	 * Navigates the calendar view to today.
	 */
	goToToday() {
		this.currentDate = moment();
		this.render(); // Re-render header and update the view
	}

	// --- Internal Rendering Logic ---

	/**
	 * Renders the entire component (header and view).
	 * Ensures view instances are ready.
	 */
	private render() {
		this.renderHeader();
		this.renderCurrentView();
	}

	/**
	 * setTasks
	 * @param tasks - The tasks to display in the calendar.
	 */
	public setTasks(tasks: Task[]) {
		this.tasks = tasks;
		// Clear badge cache when tasks change
		this.invalidateBadgeEventsCache();
		this.processTasks();
		this.render(); // Re-render header and update the view
	}

	/**
	 * Renders the header section with navigation and view controls.
	 */
	private renderHeader() {
		this.headerEl.empty(); // Clear previous header

		// Navigation buttons
		const navGroup = this.headerEl.createDiv("calendar-nav");

		// Previous button
		const prevButton = new ButtonComponent(navGroup.createDiv());
		prevButton.buttonEl.toggleClass(
			["calendar-nav-button", "prev-button"],
			true,
		);
		prevButton.setIcon("chevron-left");
		prevButton.onClick(() => this.navigate("prev"));

		// Today button
		const todayButton = new ButtonComponent(navGroup.createDiv());
		todayButton.buttonEl.toggleClass(
			["calendar-nav-button", "today-button"],
			true,
		);
		todayButton.setButtonText(t("Today"));
		todayButton.onClick(() => this.goToToday());

		// Next button
		const nextButton = new ButtonComponent(navGroup.createDiv());
		nextButton.buttonEl.toggleClass(
			["calendar-nav-button", "next-button"],
			true,
		);
		nextButton.setIcon("chevron-right");
		nextButton.onClick(() => this.navigate("next"));

		// Current date display
		const currentDisplay = this.headerEl.createSpan(
			"calendar-current-date",
		);
		currentDisplay.textContent = this.getCurrentDateDisplay();

		// View mode switcher (example using buttons)
		const viewGroup = this.headerEl.createDiv("calendar-view-switcher");
		const modes: CalendarViewMode[] = [
			"year",
			"month",
			"week",
			"day",
			"agenda",
		];
		modes.forEach((mode) => {
			const button = viewGroup.createEl("button", {
				text: {
					year: t("Year"),
					month: t("Month"),
					week: t("Week"),
					day: t("Day"),
					agenda: t("Agenda"),
				}[mode],
			});
			if (mode === this.currentViewMode) {
				button.addClass("is-active");
			}
			button.onclick = () => this.setView(mode);
		});

		viewGroup.createEl(
			"div",
			{
				cls: "calendar-view-switcher-selector",
			},
			(el) => {
				new DropdownComponent(el)
					.addOption("year", t("Year"))
					.addOption("month", t("Month"))
					.addOption("week", t("Week"))
					.addOption("day", t("Day"))
					.addOption("agenda", t("Agenda"))
					.onChange((value) =>
						this.setView(value as CalendarViewMode),
					)
					.setValue(this.currentViewMode);
			},
		);
	}

	/**
	 * Renders the currently selected view (Month, Day, Agenda, etc.).
	 * Manages attaching/detaching the active view component.
	 */
	private renderCurrentView() {
		// Determine which view component should be active
		let nextViewComponent: CalendarView | null = null;
		console.log(
			"Rendering current view:",
			this.currentViewMode,
			this.params,
			this.params?.onTaskSelected,
		);
		switch (this.currentViewMode) {
			case "month":
				const effMonth = this.getEffectiveCalendarConfig();
				nextViewComponent = new MonthView(
					this.app,
					this.plugin,
					this.viewContainerEl,
					this.viewId,
					this.currentDate,
					this.events,
					{
						onEventClick: this.onEventClick,
						onEventHover: this.onEventHover,
						onDayClick: this.onDayClick,
						onDayHover: this.onDayHover,
						onEventContextMenu: this.onEventContextMenu,
						onEventComplete: this.onEventComplete,
						getBadgeEventsForDate:
							this.getBadgeEventsForDate.bind(this),
					},
					effMonth,
				);
				break;
			case "week":
				const effWeek = this.getEffectiveCalendarConfig();
				nextViewComponent = new WeekView(
					this.app,
					this.plugin,
					this.viewContainerEl,
					this.viewId,
					this.currentDate,
					this.events,
					{
						onEventClick: this.onEventClick,
						onEventHover: this.onEventHover,
						onDayClick: this.onDayClick,
						onDayHover: this.onDayHover,
						onEventContextMenu: this.onEventContextMenu,
						onEventComplete: this.onEventComplete,
						getBadgeEventsForDate:
							this.getBadgeEventsForDate.bind(this),
					},
					effWeek,
				);
				break;
			case "day":
				nextViewComponent = new DayView(
					this.app,
					this.plugin,
					this.viewContainerEl,
					this.currentDate,
					this.events,
					{
						onEventClick: this.onEventClick,
						onEventHover: this.onEventHover,
						onEventContextMenu: this.onEventContextMenu,
						onEventComplete: this.onEventComplete,
					},
				);
				break;
			case "agenda":
				nextViewComponent = new AgendaView(
					this.app,
					this.plugin,
					this.viewContainerEl,
					this.currentDate,
					this.events,
					{
						onEventClick: this.onEventClick,
						onEventHover: this.onEventHover,
						onEventContextMenu: this.onEventContextMenu,
						onEventComplete: this.onEventComplete,
					},
				);
				break;
			case "year":
				const effYear = this.getEffectiveCalendarConfig();
				nextViewComponent = new YearView(
					this.app,
					this.plugin,
					this.viewContainerEl,
					this.currentDate,
					this.events,
					{
						onEventClick: this.onEventClick,
						onEventHover: this.onEventHover,
						onDayClick: this.onDayClick,
						onDayHover: this.onDayHover,
						onMonthClick: this.onMonthClick,
						onMonthHover: this.onMonthHover,
					},
					effYear,
				);
				break;
			default:
				this.viewContainerEl.empty(); // Clear container if view is unknown
				this.viewContainerEl.setText(
					`View mode "${this.currentViewMode}" not implemented yet.`,
				);
				nextViewComponent = null; // Ensure no view is active
		}

		// Check if the view needs to be switched
		if (this.activeViewComponent !== nextViewComponent) {
			// Detach the old view if it exists
			if (this.activeViewComponent) {
				this.removeChild(this.activeViewComponent); // Properly unload and detach the component
			}

			// Attach the new view if it exists
			if (nextViewComponent) {
				this.activeViewComponent = nextViewComponent;
				this.addChild(this.activeViewComponent); // Load and attach the new component
				// Pre-compute badge events for better performance
				this.precomputeBadgeEventsForCurrentView();
				// Update the newly activated view with current data
				this.activeViewComponent.updateEvents(this.events);
			} else {
				this.activeViewComponent = null; // No view is active
			}
		} else if (this.activeViewComponent) {
			// If the view is the same, just update it with potentially new date/events
			// Pre-compute badge events for better performance
			this.precomputeBadgeEventsForCurrentView();
			this.activeViewComponent.updateEvents(this.events);
		}

		// Update container class for styling purposes
		this.viewContainerEl.removeClass(
			"view-year",
			"view-month",
			"view-week",
			"view-day",
			"view-agenda",
		);
		if (this.activeViewComponent) {
			this.viewContainerEl.addClass(`view-${this.currentViewMode}`);
		}

		console.log(
			"Rendering current view:",
			this.currentViewMode,
			"Active component:",
			this.activeViewComponent
				? this.activeViewComponent.constructor.name
				: "None",
		);
	}

	/**
	 * Processes the raw tasks into calendar events.
	 */
	private async processTasks() {
		this.events = [];
		// Clear badge cache when processing tasks
		this.invalidateBadgeEventsCache();
		const primaryDateField = "dueDate"; // TODO: Make this configurable via settings

		// Process tasks
		this.tasks.forEach((task) => {
			// Check if this is an ICS task with badge showType
			const isIcsTask = (task as any).source?.type === "ics";
			const icsTask = isIcsTask ? (task as IcsTask) : null; // Type assertion for IcsTask
			const showAsBadge = icsTask?.icsEvent?.source?.showType === "badge";

			// If ICS is configured as badge, do NOT add a full event; badges will be
			// provided via getBadgeEventsForDate from the raw tasks list to avoid duplication.
			if (isIcsTask && showAsBadge) {
				return; // skip adding to this.events
			}

			// Determine the date to use based on priority (dueDate > scheduledDate > startDate)
			let eventDate: number | null = null;
			let isAllDay = true; // Assume tasks are all-day unless time info exists

			// For ICS tasks, use the ICS event dates directly
			if (isIcsTask && icsTask?.icsEvent) {
				eventDate = icsTask.icsEvent.dtstart.getTime();
				isAllDay = icsTask.icsEvent.allDay;
			} else {
				if (task.metadata[primaryDateField]) {
					eventDate = task.metadata[primaryDateField];
				} else if (task.metadata.scheduledDate) {
					eventDate = task.metadata.scheduledDate;
				} else if (task.metadata.startDate) {
					eventDate = task.metadata.startDate;
				}
			}

			if (eventDate) {
				const startMoment = moment(eventDate);
				const start = isAllDay
					? startMoment.startOf("day").toDate()
					: startMoment.toDate();

				let end: Date | undefined = undefined;
				let effectiveStart = start; // Use the primary date as start by default

				if (isIcsTask && icsTask?.icsEvent?.dtend) {
					end = icsTask.icsEvent.dtend;
				} else if (
					task.metadata.startDate &&
					task.metadata.dueDate &&
					task.metadata.startDate !== task.metadata.dueDate
				) {
					const sMoment = moment(task.metadata.startDate).startOf(
						"day",
					);
					const dMoment = moment(task.metadata.dueDate).startOf(
						"day",
					);
					if (sMoment.isBefore(dMoment)) {
						end = dMoment.add(1, "day").toDate();
						effectiveStart = sMoment.toDate();
					}
				}

				let eventColor: string | undefined;
				if (isIcsTask && icsTask?.icsEvent?.source?.color) {
					eventColor = icsTask.icsEvent.source.color;
				} else {
					eventColor = task.completed ? "grey" : undefined;
				}

				this.events.push({
					...task,
					title: task.content,
					start: effectiveStart,
					end: end,
					allDay: isAllDay,
					color: eventColor,
				});
			}
		});

		// Sort events for potentially easier rendering later (e.g., agenda)
		this.events.sort((a, b) => a.start.getTime() - b.start.getTime());

		console.log(
			`Processed ${this.events.length} events from ${this.tasks.length} tasks (including ICS events as tasks).`,
		);
	}

	/**
	 * Invalidate the badge events cache
	 */
	private invalidateBadgeEventsCache(): void {
		this.badgeEventsCache.clear();
		this.badgeEventsCacheVersion++;
	}

	/**
	 * Pre-compute badge events for a date range to optimize performance
	 * This replaces the per-date filtering with a single pass through all tasks
	 */
	private precomputeBadgeEventsForRange(
		startDate: Date,
		endDate: Date,
	): void {
		// Convert dates to YYYY-MM-DD format for consistent comparison
		const formatDateKey = (date: Date): string => {
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			return `${year}-${month}-${day}`;
		};

		// Clear existing cache for the range
		const startKey = formatDateKey(startDate);
		const endKey = formatDateKey(endDate);

		// Initialize cache entries for the date range
		const currentDate = new Date(startDate);
		while (currentDate <= endDate) {
			const dateKey = formatDateKey(currentDate);
			this.badgeEventsCache.set(dateKey, []);
			currentDate.setDate(currentDate.getDate() + 1);
		}

		// Single pass through all tasks to populate cache
		this.tasks.forEach((task) => {
			const isIcsTask = (task as any).source?.type === "ics";
			const icsTask = isIcsTask ? (task as IcsTask) : null;
			const showAsBadge = icsTask?.icsEvent?.source?.showType === "badge";

			if (isIcsTask && showAsBadge && icsTask?.icsEvent) {
				// Use native Date operations instead of moment for better performance
				const eventDate = new Date(icsTask.icsEvent.dtstart);
				// Normalize to start of day for comparison
				const eventDateNormalized = new Date(
					eventDate.getFullYear(),
					eventDate.getMonth(),
					eventDate.getDate(),
				);
				const eventDateKey = formatDateKey(eventDateNormalized);

				// Check if the event is within our cached range
				if (this.badgeEventsCache.has(eventDateKey)) {
					// Convert the task to a CalendarEvent format for consistency
					const calendarEvent: CalendarEvent = {
						...task,
						title: task.content,
						start: icsTask.icsEvent.dtstart,
						end: icsTask.icsEvent.dtend,
						allDay: icsTask.icsEvent.allDay,
						color: icsTask.icsEvent.source.color,
					};

					const existingEvents =
						this.badgeEventsCache.get(eventDateKey) || [];
					existingEvents.push(calendarEvent);
					this.badgeEventsCache.set(eventDateKey, existingEvents);
				}
			}
		});

		console.log(
			`Pre-computed badge events for range ${startKey} to ${endKey}. Cache size: ${this.badgeEventsCache.size}`,
		);
	}

	/**
	 * Get badge events for a specific date (optimized version)
	 * These are ICS events that should be displayed as badges (count) rather than full events
	 */
	public getBadgeEventsForDate(date: Date): CalendarEvent[] {
		// Use native Date operations for better performance
		const year = date.getFullYear();
		const month = date.getMonth();
		const day = date.getDate();
		const normalizedDate = new Date(year, month, day);
		const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(
			day,
		).padStart(2, "0")}`;

		// Check if we have cached data for this date
		if (this.badgeEventsCache.has(dateKey)) {
			const cachedEvents = this.badgeEventsCache.get(dateKey) || [];
			return cachedEvents;
		}

		const badgeEventsForDate: CalendarEvent[] = [];

		this.tasks.forEach((task) => {
			const isIcsTask = (task as any).source?.type === "ics";
			const icsTask = isIcsTask ? (task as IcsTask) : null;
			const showAsBadge = icsTask?.icsEvent?.source?.showType === "badge";

			if (isIcsTask && showAsBadge && icsTask?.icsEvent) {
				// Use native Date operations instead of moment for better performance
				const eventDate = new Date(icsTask.icsEvent.dtstart);
				const eventYear = eventDate.getFullYear();
				const eventMonth = eventDate.getMonth();
				const eventDay = eventDate.getDate();

				// Check if the event is on the target date using native comparison
				if (
					eventYear === year &&
					eventMonth === month &&
					eventDay === day
				) {
					// Convert the task to a CalendarEvent format for consistency
					const calendarEvent: CalendarEvent = {
						...task,
						title: task.content,
						start: icsTask.icsEvent.dtstart,
						end: icsTask.icsEvent.dtend,
						allDay: icsTask.icsEvent.allDay,
						color: icsTask.icsEvent.source.color,
						badge: true, // Mark as badge event
					};
					badgeEventsForDate.push(calendarEvent);
				}
			}
		});

		// Cache the result for future use
		this.badgeEventsCache.set(dateKey, badgeEventsForDate);

		return badgeEventsForDate;
	}

	/**
	 * Pre-compute badge events for the current view's date range
	 * This should be called when the view changes or data updates
	 */
	public precomputeBadgeEventsForCurrentView(): void {
		if (!this.activeViewComponent) return;

		let startDate: Date;
		let endDate: Date;

		switch (this.currentViewMode) {
			case "month": {
				// For month view, compute for the entire grid (including previous/next month days)
				const startOfMonth = this.currentDate.clone().startOf("month");
				const endOfMonth = this.currentDate.clone().endOf("month");

				// Get first day of week setting (effective with override)
				const effCfg = this.getEffectiveCalendarConfig();
				const firstDayOfWeek = effCfg.firstDayOfWeek ?? 0;

				const gridStart = startOfMonth
					.clone()
					.weekday(firstDayOfWeek - 7);
				const gridEnd = endOfMonth.clone().weekday(firstDayOfWeek + 6);

				// Ensure at least 42 days (6 weeks)
				if (gridEnd.diff(gridStart, "days") + 1 < 42) {
					const daysToAdd =
						42 - (gridEnd.diff(gridStart, "days") + 1);
					gridEnd.add(daysToAdd, "days");
				}

				startDate = gridStart.toDate();
				endDate = gridEnd.toDate();
				break;
			}

			case "week": {
				const startOfWeek = this.currentDate.clone().startOf("week");
				const endOfWeek = this.currentDate.clone().endOf("week");
				startDate = startOfWeek.toDate();
				endDate = endOfWeek.toDate();
				break;
			}

			case "day":
				startDate = this.currentDate.clone().startOf("day").toDate();
				endDate = this.currentDate.clone().endOf("day").toDate();
				break;

			case "year":
				const startOfYear = this.currentDate.clone().startOf("year");
				const endOfYear = this.currentDate.clone().endOf("year");
				startDate = startOfYear.toDate();
				endDate = endOfYear.toDate();
				break;

			default:
				// For agenda and other views, use a reasonable default range
				startDate = this.currentDate.clone().startOf("day").toDate();
				endDate = this.currentDate.clone().add(30, "days").toDate();
		}

		this.precomputeBadgeEventsForRange(startDate, endDate);
	}

	/**
	 * Map ICS priority to task priority
	 */
	private mapIcsPriorityToTaskPriority(
		icsPriority?: number,
	): number | undefined {
		if (icsPriority === undefined) return undefined;

		// ICS priority: 0 (undefined), 1-4 (high), 5 (normal), 6-9 (low)
		// Task priority: 1 (highest), 2 (high), 3 (medium), 4 (low), 5 (lowest)
		if (icsPriority >= 1 && icsPriority <= 4) return 1; // High
		if (icsPriority === 5) return 3; // Medium
		if (icsPriority >= 6 && icsPriority <= 9) return 5; // Low
		return undefined;
	}

	// --- Utility Methods ---

	/**
	 * Gets the appropriate moment.js unit for navigation based on the current view.
	 */
	private getViewUnit(): moment.unitOfTime.DurationConstructor {
		switch (this.currentViewMode) {
			case "year":
				return "year";
			case "month":
				return "month";
			case "week":
				return "week";
			case "day":
				return "day";
			case "agenda":
				return "week"; // Agenda might advance week by week
			default:
				return "month";
		}
	}

	/**
	 * Gets the formatted string for the current date display in the header.
	 */
	private getCurrentDateDisplay(): string {
		switch (this.currentViewMode) {
			case "year":
				return this.currentDate.format("YYYY");
			case "month":
				return this.currentDate.format("MMMM/YYYY");
			case "week":
				const startOfWeek = this.currentDate.clone().startOf("week");
				const endOfWeek = this.currentDate.clone().endOf("week");
				// Handle weeks spanning across month/year changes
				if (startOfWeek.month() !== endOfWeek.month()) {
					if (startOfWeek.year() !== endOfWeek.year()) {
						return `${startOfWeek.format(
							"MMM D, YYYY",
						)} - ${endOfWeek.format("MMM D, YYYY")}`;
					} else {
						return `${startOfWeek.format(
							"MMM D",
						)} - ${endOfWeek.format("MMM D, YYYY")}`;
					}
				} else {
					return `${startOfWeek.format("MMM D")} - ${endOfWeek.format(
						"D, YYYY",
					)}`;
				}
			case "day":
				return this.currentDate.format("dddd, MMMM D, YYYY");
			case "agenda":
				// Example: Agenda showing the next 7 days
				const endOfAgenda = this.currentDate.clone().add(6, "days");
				return `${this.currentDate.format(
					"MMM D",
				)} - ${endOfAgenda.format("MMM D, YYYY")}`;
			default:
				return this.currentDate.format("MMMM YYYY");
		}
	}

	/**
	 * Gets the current view component.
	 */
	public get currentViewComponent(): CalendarView | null {
		return this.activeViewComponent;
	}

	/**
	 * on event click
	 */
	public onEventClick = (ev: MouseEvent, event: CalendarEvent) => {
		console.log(
			"Event clicked:",
			event,
			this.params,
			this.params?.onTaskSelected,
		);
		this.params?.onTaskSelected?.(event);
	};

	/**
	 * on event mouse hover
	 */
	public onEventHover = (ev: MouseEvent, event: CalendarEvent) => {
		console.log("Event mouse entered:", event);
	};

	/**
	 * on view change
	 */
	public onViewChange = (viewMode: CalendarViewMode) => {
		console.log("View changed:", viewMode);
	};

	/**
	 * on day click
	 */
	public onDayClick = (
		ev: MouseEvent,
		day: number,
		options: {
			behavior: "open-quick-capture" | "open-task-view";
		},
	) => {
		if (this.currentViewMode === "year") {
			this.setView("day");
			this.currentDate = moment(day);
			this.render();
		} else if (options.behavior === "open-quick-capture") {
			new QuickCaptureModal(
				this.app,
				this.plugin,
				{ dueDate: moment(day).toDate() },
				true,
			).open();
		} else if (options.behavior === "open-task-view") {
			this.setView("day");
			this.currentDate = moment(day);
			this.render();
		}
	};

	/**
	 * on day hover
	 */
	public onDayHover = (ev: MouseEvent, day: number) => {
		console.log("Day hovered:", day);
	};

	/**
	 * on month click
	 */
	public onMonthClick = (ev: MouseEvent, month: number) => {
		this.setView("month");
		this.currentDate = moment(month);
		this.render();
	};

	/**
	 * on month hover
	 */
	public onMonthHover = (ev: MouseEvent, month: number) => {
		console.log("Month hovered:", month);
	};

	/**
	 * on task context menu
	 */
	public onEventContextMenu = (ev: MouseEvent, event: CalendarEvent) => {
		this.params?.onEventContextMenu?.(ev, event);
	};

	/**
	 * on task complete
	 */
	public onEventComplete = (ev: MouseEvent, event: CalendarEvent) => {
		this.params?.onTaskCompleted?.(event);
	};

	// Allow external overrides (e.g., from Bases) and compute effective config
	public setConfigOverride(
		override: Partial<
			import("@/common/setting-definition").CalendarSpecificConfig
		> | null,
	): void {
		this.configOverride = override ?? null;
		// Re-render to apply new config
		this.render();
	}

	private getEffectiveCalendarConfig(): Partial<
		import("@/common/setting-definition").CalendarSpecificConfig
	> {
		const baseCfg = this.plugin.settings.viewConfiguration.find(
			(v) => v.id === this.viewId,
		)?.specificConfig as
			| Partial<
					import("@/common/setting-definition").CalendarSpecificConfig
			  >
			| undefined;
		return { ...(baseCfg ?? {}), ...(this.configOverride ?? {}) };
	}
}

// Helper function (example - might move to a utils file)
function getDaysInMonth(year: number, month: number): Date[] {
	const date = new Date(year, month, 1);
	const days: Date[] = [];
	while (date.getMonth() === month) {
		days.push(new Date(date));
		date.setDate(date.getDate() + 1);
	}
	return days;
}
