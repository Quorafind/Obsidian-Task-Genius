import { App, Component, debounce, moment } from "obsidian";
import { CalendarEvent } from "..";
import {
	calculateEventLayout,
	determineEventColor,
	EventLayout,
} from "../algorithm"; // Import layout functions
import { renderCalendarEvent } from "../rendering/event-renderer"; // Use new renderer
import {
	CalendarSpecificConfig,
	getViewSettingOrDefault,
} from "../../../common/setting-definition"; // Import helper
import TaskProgressBarPlugin from "../../../index"; // Import plugin type for settings access
import { CalendarViewComponent, CalendarViewOptions } from "./base-view"; // Import base class and options type

/**
 * Renders the week view grid as a component.
 */
export class WeekView extends CalendarViewComponent {
	// Extend base class
	// private containerEl: HTMLElement; // Inherited
	private currentDate: moment.Moment;
	// private events: CalendarEvent[]; // Inherited
	private app: App; // Keep app reference
	private plugin: TaskProgressBarPlugin; // Keep plugin reference
	// Removed onEventClick/onMouseHover properties, now in this.options

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		containerEl: HTMLElement,
		currentDate: moment.Moment,
		events: CalendarEvent[],
		options: CalendarViewOptions // Use the base options type
	) {
		super(plugin, app, containerEl, events, options); // Call base constructor
		this.app = app; // Store app
		this.plugin = plugin; // Store plugin
		this.currentDate = currentDate;
	}

	render(): void {
		// Get view settings, including the first day of the week override
		const viewConfig = getViewSettingOrDefault(this.plugin, "calendar"); // Assuming 'calendar' view for settings lookup, adjust if needed
		const firstDayOfWeekSetting = (
			viewConfig.specificConfig as CalendarSpecificConfig
		).firstDayOfWeek;
		const effectiveFirstDay =
			firstDayOfWeekSetting === undefined ? 0 : firstDayOfWeekSetting - 1;

		// Calculate start and end of week based on the setting
		const startOfWeek = this.currentDate.clone().weekday(effectiveFirstDay);
		const endOfWeek = startOfWeek.clone().add(6, "days"); // Week always has 7 days

		this.containerEl.empty();
		this.containerEl.addClass("view-week");

		// 1. Render Header Row (Days of the week + Dates)
		const headerRow = this.containerEl.createDiv("calendar-week-header");
		const dayHeaderCells: { [key: string]: HTMLElement } = {};
		let currentDayIter = startOfWeek.clone();

		// Generate rotated weekdays for header
		const weekdays = moment.weekdaysShort(true); // Gets locale-aware short weekdays
		const rotatedWeekdays = [
			...weekdays.slice(effectiveFirstDay),
			...weekdays.slice(0, effectiveFirstDay),
		];
		let dayIndex = 0;

		while (currentDayIter.isSameOrBefore(endOfWeek, "day")) {
			const dateStr = currentDayIter.format("YYYY-MM-DD");
			const headerCell = headerRow.createDiv("calendar-header-cell");
			dayHeaderCells[dateStr] = headerCell; // Store header cell if needed
			const weekdayEl = headerCell.createDiv("calendar-weekday");
			weekdayEl.textContent = rotatedWeekdays[dayIndex % 7]; // Use rotated weekday name
			const dayNumEl = headerCell.createDiv("calendar-day-number");
			dayNumEl.textContent = currentDayIter.format("D"); // Date number

			if (currentDayIter.isSame(moment(), "day")) {
				headerCell.addClass("is-today");
			}
			currentDayIter.add(1, "day");
			dayIndex++;
		}

		// --- All-Day Section (Renamed for clarity, now holds all events) ---
		const weekGridSection = this.containerEl.createDiv(
			"calendar-week-grid-section" // Renamed class
		);
		const weekGrid = weekGridSection.createDiv("calendar-week-grid"); // Renamed class
		const dayEventContainers: { [key: string]: HTMLElement } = {}; // Renamed variable
		currentDayIter = startOfWeek.clone();

		while (currentDayIter.isSameOrBefore(endOfWeek, "day")) {
			const dateStr = currentDayIter.format("YYYY-MM-DD");
			const dayCell = weekGrid.createEl("div", {
				cls: "calendar-day-column",
				attr: {
					"data-date": dateStr,
				},
			});
			dayEventContainers[dateStr] = dayCell.createDiv(
				// Use renamed variable
				"calendar-day-events-container" // Renamed class
			);
			if (currentDayIter.isSame(moment(), "day")) {
				dayCell.addClass("is-today"); // Apply to the main day cell
			}
			if (currentDayIter.day() === 0 || currentDayIter.day() === 6) {
				// This weekend check is based on Sun/Sat, might need adjustment if start day changes weekend definition visually
				dayCell.addClass("is-weekend"); // Apply to the main day cell
			}
			currentDayIter.add(1, "day");
		}

		// 3. Filter Events for the Week (Uses calculated startOfWeek/endOfWeek)
		const weekEvents = this.events.filter((event) => {
			const eventStart = moment(event.start);
			const eventEnd = event.end ? moment(event.end) : eventStart;
			return (
				eventStart.isBefore(
					endOfWeek.clone().endOf("day").add(1, "millisecond")
				) && eventEnd.isSameOrAfter(startOfWeek.clone().startOf("day"))
			);
		});

		// Sort events: Simple sort by start time might be useful, but not strictly necessary for this logic
		const sortedWeekEvents = [...weekEvents].sort((a, b) => {
			return moment(a.start).valueOf() - moment(b.start).valueOf(); // Earlier start date first
		});

		// --- Calculate vertical slots for each event --- (REMOVED)

		// --- Render events (Simplified Logic) ---
		sortedWeekEvents.forEach((event) => {
			if (!event.start) return; // Skip events without a start date

			const eventStartMoment = moment(event.start).startOf("day");

			// Use calculated week boundaries
			const weekStartMoment = startOfWeek.clone().startOf("day");
			const weekEndMoment = endOfWeek.clone().endOf("day");

			// Check if the event's START date is within the current week view
			if (
				eventStartMoment.isSameOrAfter(weekStartMoment) &&
				eventStartMoment.isSameOrBefore(weekEndMoment)
			) {
				const dateStr = eventStartMoment.format("YYYY-MM-DD");
				const container = dayEventContainers[dateStr]; // Get the container for the start date
				if (container) {
					// Render the event ONCE in the correct day's container
					const { eventEl, component } = renderCalendarEvent({
						event: event,
						viewType: "week-allday", // Reverted to original type to fix linter error
						// positioningHints removed - no complex layout needed now
						app: this.app,
						onEventClick: this.options.onEventClick,
						onEventHover: this.options.onEventHover,
						onEventContextMenu: this.options.onEventContextMenu,
						onEventComplete: this.options.onEventComplete,
					});
					this.addChild(component);

					// No absolute positioning or slot calculation needed
					// eventEl.style.top = ...

					container.appendChild(eventEl);
				}
			}
		});

		console.log(
			`Rendered Simplified Week View from ${startOfWeek.format(
				"YYYY-MM-DD"
			)} to ${endOfWeek.format(
				"YYYY-MM-DD"
			)} (First day: ${effectiveFirstDay})`
		);

		this.registerDomEvent(weekGrid, "click", (ev) => {
			const target = ev.target as HTMLElement;
			if (target.closest(".calendar-day-column")) {
				const dateStr = target
					.closest(".calendar-day-column")
					?.getAttribute("data-date");
				if (this.options.onDayClick) {
					this.options.onDayClick(ev, moment(dateStr).valueOf(), {
						behavior: "open-quick-capture",
					});
				}
			}
		});

		this.registerDomEvent(weekGrid, "mouseover", (ev) => {
			this.debounceHover(ev);
		});
	}

	// Update methods to allow changing data after initial render
	updateEvents(events: CalendarEvent[]): void {
		this.events = events;
		this.render(); // Re-render will pick up current settings
	}

	updateCurrentDate(date: moment.Moment): void {
		this.currentDate = date;
		this.render(); // Re-render will pick up current settings and date
	}

	private debounceHover = debounce((ev: MouseEvent) => {
		const target = ev.target as HTMLElement;
		if (target.closest(".calendar-day-column")) {
			const dateStr = target
				.closest(".calendar-day-column")
				?.getAttribute("data-date");
			if (this.options.onDayHover) {
				this.options.onDayHover(ev, moment(dateStr).valueOf());
			}
		}
	}, 200);
}
