import {
	App,
	ButtonComponent,
	Component,
	DropdownComponent,
	TFile,
	moment,
	setIcon,
} from "obsidian";
import { Task } from "src/utils/types/TaskIndex"; // Assuming Task type exists here
// Removed: import { renderCalendarEvent } from "./event";
import "../../styles/calendar/view.css"; // Import the CSS file
import "../../styles/calendar/event.css"; // Import the CSS file
import { t } from "../../translations/helper";

// Import view rendering functions
import { MonthView } from "./views/month-view";
import { WeekView } from "./views/week-view";
import { DayView } from "./views/day-view";
import { AgendaView } from "./views/agenda-view";
import { YearView } from "./views/year-view";
import TaskProgressBarPlugin from "src";
import { QuickCaptureModal } from "../QuickCaptureModal";
// Import algorithm functions (optional for now, could be used within views)
// import { calculateEventLayout, determineEventColor } from './algorithm';

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

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		parentEl: HTMLElement,
		initialTasks: Task[] = [],
		private params: {
			onTaskSelected?: (task: Task | null) => void;
			onTaskCompleted?: (task: Task) => void;
			onEventContextMenu?: (ev: MouseEvent, event: CalendarEvent) => void;
		} = {}
	) {
		super();
		this.app = app;
		this.plugin = plugin;
		this.containerEl = parentEl.createDiv("full-calendar-container");
		this.tasks = initialTasks;

		this.headerEl = this.containerEl.createDiv("calendar-header");
		this.viewContainerEl = this.containerEl.createDiv(
			"calendar-view-container"
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
				this.currentViewMode
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
			true
		);
		prevButton.setIcon("chevron-left");
		prevButton.onClick(() => this.navigate("prev"));

		// Today button
		const todayButton = new ButtonComponent(navGroup.createDiv());
		todayButton.buttonEl.toggleClass(
			["calendar-nav-button", "today-button"],
			true
		);
		todayButton.setButtonText("Today");
		todayButton.onClick(() => this.goToToday());

		// Next button
		const nextButton = new ButtonComponent(navGroup.createDiv());
		nextButton.buttonEl.toggleClass(
			["calendar-nav-button", "next-button"],
			true
		);
		nextButton.setIcon("chevron-right");
		nextButton.onClick(() => this.navigate("next"));

		// Current date display
		const currentDisplay = this.headerEl.createSpan(
			"calendar-current-date"
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
						this.setView(value as CalendarViewMode)
					)
					.setValue(this.currentViewMode);
			}
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
			this.params?.onTaskSelected
		);
		switch (this.currentViewMode) {
			case "month":
				nextViewComponent = new MonthView(
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
						onEventContextMenu: this.onEventContextMenu,
						onEventComplete: this.onEventComplete,
					}
				);
				break;
			case "week":
				nextViewComponent = new WeekView(
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
						onEventContextMenu: this.onEventContextMenu,
						onEventComplete: this.onEventComplete,
					}
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
					}
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
					}
				);
				break;
			case "year":
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
					}
				);
				break;
			default:
				this.viewContainerEl.empty(); // Clear container if view is unknown
				this.viewContainerEl.setText(
					`View mode "${this.currentViewMode}" not implemented yet.`
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
				// Update the newly activated view with current data
				this.activeViewComponent.updateEvents(this.events);
			} else {
				this.activeViewComponent = null; // No view is active
			}
		} else if (this.activeViewComponent) {
			// If the view is the same, just update it with potentially new date/events
			this.activeViewComponent.updateEvents(this.events);
		}

		// Update container class for styling purposes
		this.viewContainerEl.removeClass(
			"view-year",
			"view-month",
			"view-week",
			"view-day",
			"view-agenda"
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
				: "None"
		);
	}

	/**
	 * Processes the raw tasks into calendar events.
	 */
	private processTasks() {
		this.events = [];
		const primaryDateField = "dueDate"; // TODO: Make this configurable via settings

		this.tasks.forEach((task) => {
			// Determine the date to use based on priority (dueDate > scheduledDate > startDate)
			// This logic might need refinement based on exact requirements in PRD 4.2
			let eventDate: number | null = null;
			let isAllDay = true; // Assume tasks are all-day unless time info exists

			// Use the first available date field based on preference.
			// The PRD mentions using dueDate primarily, with an option for scheduled/start.
			// Let's stick to dueDate for now as primary.
			if (task[primaryDateField]) {
				eventDate = task[primaryDateField];
			} else if (task.scheduledDate) {
				eventDate = task.scheduledDate;
			} else if (task.startDate) {
				eventDate = task.startDate;
			}
			// We could add completedDate here if we want to show completed tasks based on completion time

			if (eventDate) {
				const startMoment = moment(eventDate);
				// Try to parse time if available in the task string or metadata (complex)
				// For now, assume all tasks are all-day events on their primary date
				const start = startMoment.startOf("day").toDate(); // Represent as start of the day

				// Handle multi-day? PRD mentions if startDate and dueDate are available.
				let end: Date | undefined = undefined;
				let effectiveStart = start; // Use the primary date as start by default
				if (
					task.startDate &&
					task.dueDate &&
					task.startDate !== task.dueDate
				) {
					// Ensure start is actually before due date
					const sMoment = moment(task.startDate).startOf("day");
					const dMoment = moment(task.dueDate).startOf("day");
					if (sMoment.isBefore(dMoment)) {
						// FullCalendar and similar often expect the 'end' date to be exclusive
						// for all-day events. So an event ending on the 15th would have end=16th.
						end = dMoment.add(1, "day").toDate();
						// The 'start' should likely be the startDate in this case
						effectiveStart = sMoment.toDate(); // Re-assign start if using date range
					}
				}

				this.events.push({
					...task, // Spread all properties from the original task
					title: task.content, // Use task content as title by default
					start: effectiveStart,
					end: end, // Add end date if calculated
					allDay: isAllDay,
					// TODO: Add color based on status, priority, or project?
					color: task.completed ? "grey" : undefined, // Simple example
				});
			}
			// Else: Task has no relevant date, ignore for now (PRD: maybe "unscheduled" panel)
		});

		// Sort events for potentially easier rendering later (e.g., agenda)
		this.events.sort((a, b) => a.start.getTime() - b.start.getTime());

		console.log(
			`Processed ${this.events.length} events from ${this.tasks.length} tasks.`
		);
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
							"MMM D, YYYY"
						)} - ${endOfWeek.format("MMM D, YYYY")}`;
					} else {
						return `${startOfWeek.format(
							"MMM D"
						)} - ${endOfWeek.format("MMM D, YYYY")}`;
					}
				} else {
					return `${startOfWeek.format("MMM D")} - ${endOfWeek.format(
						"D, YYYY"
					)}`;
				}
			case "day":
				return this.currentDate.format("dddd, MMMM D, YYYY");
			case "agenda":
				// Example: Agenda showing the next 7 days
				const endOfAgenda = this.currentDate.clone().add(6, "days");
				return `${this.currentDate.format(
					"MMM D"
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
			this.params?.onTaskSelected
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
		}
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
				true
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
