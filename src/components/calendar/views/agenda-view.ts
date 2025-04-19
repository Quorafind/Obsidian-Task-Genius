import { App, Component, moment } from "obsidian";
import { CalendarEvent } from "..";
import { renderCalendarEvent } from "../rendering/event-renderer"; // Use new renderer
import { CalendarViewComponent, CalendarViewOptions } from "./base-view"; // Import base class
import TaskProgressBarPlugin from "../../../index"; // Import plugin type

export class AgendaView extends CalendarViewComponent {
	// Extend base class
	// private containerEl: HTMLElement; // Inherited
	private currentDate: moment.Moment;
	// private events: CalendarEvent[]; // Inherited
	private app: App; // Keep app reference
	private plugin: TaskProgressBarPlugin; // Added for base constructor

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin, // Added plugin dependency
		containerEl: HTMLElement,
		currentDate: moment.Moment,
		events: CalendarEvent[],
		options: CalendarViewOptions = {} // Use base options, default to empty
	) {
		super(plugin, app, containerEl, events, options); // Call base constructor
		this.app = app;
		this.plugin = plugin;
		this.currentDate = currentDate;
	}

	render(): void {
		this.containerEl.empty();
		this.containerEl.addClass("view-agenda");

		// 1. Define date range (e.g., next 7 days starting from currentDate)
		const rangeStart = this.currentDate.clone().startOf("day");
		const rangeEnd = this.currentDate.clone().add(6, "days").endOf("day"); // 7 days total

		// 2. Filter and Sort Events: Only include events whose START date is within the range
		const agendaEvents = this.events
			.filter((event) => {
				const eventStart = moment(event.start);
				// Only consider the start date for inclusion in the agenda range
				return eventStart.isBetween(
					rangeStart,
					rangeEnd,
					undefined,
					"[]"
				);
			})
			.sort(
				(a, b) => moment(a.start).valueOf() - moment(b.start).valueOf()
			); // Ensure sorting by start time

		// 3. Group events by their start day
		const eventsByDay: { [key: string]: CalendarEvent[] } = {};
		agendaEvents.forEach((event) => {
			// Get the start date string
			const dateStr = moment(event.start).format("YYYY-MM-DD");

			if (!eventsByDay[dateStr]) {
				eventsByDay[dateStr] = [];
			}
			// Add the event to its start date list
			eventsByDay[dateStr].push(event);
		});

		// 4. Render the list
		if (Object.keys(eventsByDay).length === 0) {
			this.containerEl.setText(
				`No upcoming events from ${rangeStart.format(
					"MMM D"
				)} to ${rangeEnd.format("MMM D, YYYY")}.`
			);
			return;
		}

		let currentDayIter = rangeStart.clone();
		while (currentDayIter.isSameOrBefore(rangeEnd, "day")) {
			const dateStr = currentDayIter.format("YYYY-MM-DD");
			if (eventsByDay[dateStr] && eventsByDay[dateStr].length > 0) {
				// Create a container for the two-column layout for the day
				const daySection =
					this.containerEl.createDiv("agenda-day-section");

				// Left column for the date
				const dateColumn = daySection.createDiv(
					"agenda-day-date-column"
				);
				const dayHeader = dateColumn.createDiv("agenda-day-header");
				dayHeader.textContent = currentDayIter.format("dddd, MMMM D");
				if (currentDayIter.isSame(moment(), "day")) {
					dayHeader.addClass("is-today");
				}

				// Right column for the events
				const eventsColumn = daySection.createDiv(
					"agenda-day-events-column"
				);
				const eventsList = eventsColumn.createDiv("agenda-events-list"); // Keep the original list class if needed

				eventsByDay[dateStr]
					.sort((a, b) => {
						const timeA = a.start ? moment(a.start).valueOf() : 0;
						const timeB = b.start ? moment(b.start).valueOf() : 0;
						return timeA - timeB;
					})
					.forEach((event) => {
						const eventItem =
							eventsList.createDiv("agenda-event-item");
						const { eventEl, component } = renderCalendarEvent({
							event: event,
							viewType: "agenda",
							app: this.app,
							onEventClick: this.options.onEventClick,
							onEventHover: this.options.onEventHover,
							onEventContextMenu: this.options.onEventContextMenu,
							onEventComplete: this.options.onEventComplete,
						});
						this.addChild(component);
						eventItem.appendChild(eventEl);
					});
			}
			currentDayIter.add(1, "day");
		}

		console.log(
			`Rendered Agenda View component from ${rangeStart.format(
				"YYYY-MM-DD"
			)} to ${rangeEnd.format("YYYY-MM-DD")}`
		);
	}

	// Update methods to allow changing data after initial render
	updateEvents(events: CalendarEvent[]): void {
		this.events = events;
		this.render();
	}

	updateCurrentDate(date: moment.Moment): void {
		this.currentDate = date;
		this.render();
	}
}
