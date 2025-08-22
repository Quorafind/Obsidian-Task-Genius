import { App, Component, debounce, moment } from "obsidian";
import { CalendarEvent } from "../index";
import { renderCalendarEvent } from "../rendering/event-renderer"; // Import the new renderer
import {
	CalendarSpecificConfig,
	getViewSettingOrDefault,
} from "../../../common/setting-definition"; // Import helper
import TaskProgressBarPlugin from "../../../index"; // Import plugin type for settings access
import { CalendarViewComponent, CalendarViewOptions } from "./base-view"; // Import base class and options type
import Sortable from "sortablejs";

/**
 * Utility function to parse date string (YYYY-MM-DD) to Date object
 * Optimized for performance to replace moment.js usage
 */
function parseDateString(dateStr: string): Date {
	const dateParts = dateStr.split("-");
	const year = parseInt(dateParts[0], 10);
	const month = parseInt(dateParts[1], 10) - 1; // Month is 0-indexed in Date
	const day = parseInt(dateParts[2], 10);
	return new Date(year, month, day);
}

/**
 * Renders the month view grid as a component.
 */
export class MonthView extends CalendarViewComponent {
	private currentDate: moment.Moment;
	private app: App; // Keep app reference if needed directly
	private plugin: TaskProgressBarPlugin; // Keep plugin reference if needed directly
	private sortableInstances: Sortable[] = []; // Store sortable instances for cleanup

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		containerEl: HTMLElement,
		private currentViewId: string,
		currentDate: moment.Moment,
		events: CalendarEvent[],
		options: CalendarViewOptions // Use the base options type
	) {
		super(plugin, app, containerEl, events, options); // Call base constructor
		this.app = app; // Still store app if needed directly
		this.plugin = plugin; // Still store plugin if needed directly
		this.currentDate = currentDate;
	}

	render(): void {
		// Get view settings, including the first day of the week override and weekend hiding
		const viewConfig = this.plugin.settings.viewConfiguration.find(
			(v) => v.id === this.currentViewId
		)?.specificConfig as CalendarSpecificConfig; // Assuming 'calendar' view for settings lookup, adjust if needed
		const firstDayOfWeekSetting = viewConfig?.firstDayOfWeek;
		const hideWeekends = viewConfig?.hideWeekends ?? false;
		// Default to Sunday (0) if the setting is undefined, following 0=Sun, 1=Mon, ..., 6=Sat
		const effectiveFirstDay =
			firstDayOfWeekSetting === undefined ? 0 : firstDayOfWeekSetting;

		// 1. Calculate the date range for the grid using effective first day
		const startOfMonth = this.currentDate.clone().startOf("month");
		const endOfMonth = this.currentDate.clone().endOf("month");
		// Calculate grid start based on the week containing the start of the month, adjusted for the effective first day
		const gridStart = startOfMonth.clone().weekday(effectiveFirstDay - 7); // moment handles wrapping correctly
		// Calculate grid end based on the week containing the end of the month, adjusted for the effective first day
		let gridEnd = endOfMonth.clone().weekday(effectiveFirstDay + 6); // moment handles wrapping correctly

		// Adjust grid coverage based on whether weekends are hidden
		if (hideWeekends) {
			// When weekends are hidden, we need fewer days to fill the grid
			// Calculate how many work days we need (approximately 6 weeks * 5 work days = 30 days)
			let workDaysCount = 0;
			let tempIter = gridStart.clone();

			// Count existing work days in the current range
			while (tempIter.isSameOrBefore(gridEnd, "day")) {
				const isWeekend = tempIter.day() === 0 || tempIter.day() === 6;
				if (!isWeekend) {
					workDaysCount++;
				}
				tempIter.add(1, "day");
			}

			// Ensure we have at least 30 work days (6 weeks * 5 days) for consistent layout
			while (workDaysCount < 30) {
				gridEnd.add(1, "day");
				const isWeekend = gridEnd.day() === 0 || gridEnd.day() === 6;
				if (!isWeekend) {
					workDaysCount++;
				}
			}
		} else {
			// Original logic for when weekends are shown
			// Ensure grid covers at least 6 weeks (42 days) for consistent layout
			if (gridEnd.diff(gridStart, "days") + 1 < 42) {
				// Add full weeks until at least 42 days are covered
				const daysToAdd = 42 - (gridEnd.diff(gridStart, "days") + 1);
				gridEnd.add(daysToAdd, "days");
			}
		}

		this.containerEl.empty();
		this.containerEl.addClass("view-month"); // Add class for styling

		// Add hide-weekends class if weekend hiding is enabled
		if (hideWeekends) {
			this.containerEl.addClass("hide-weekends");
		} else {
			this.containerEl.removeClass("hide-weekends");
		}

		// 2. Add weekday headers, rotated according to effective first day
		const headerRow = this.containerEl.createDiv("calendar-weekday-header");
		const weekdays = moment.weekdaysShort(true); // Gets locale-aware short weekdays
		const rotatedWeekdays = [
			...weekdays.slice(effectiveFirstDay),
			...weekdays.slice(0, effectiveFirstDay),
		];

		// Filter out weekends if hideWeekends is enabled
		const filteredWeekdays = hideWeekends
			? rotatedWeekdays.filter((_, index) => {
				// Calculate the actual day of week for this header position
				const dayOfWeek = (effectiveFirstDay + index) % 7;
				return dayOfWeek !== 0 && dayOfWeek !== 6; // Exclude Sunday (0) and Saturday (6)
			})
			: rotatedWeekdays;

		filteredWeekdays.forEach((day) => {
			const weekdayEl = headerRow.createDiv("calendar-weekday");
			weekdayEl.textContent = day;
		});

		// 3. Create day cells grid container
		const gridContainer = this.containerEl.createDiv("calendar-month-grid");
		const dayCells: { [key: string]: HTMLElement } = {}; // Store cells by date string 'YYYY-MM-DD'
		let currentDayIter = gridStart.clone();

		while (currentDayIter.isSameOrBefore(gridEnd, "day")) {
			const isWeekend = currentDayIter.day() === 0 || currentDayIter.day() === 6; // Sunday or Saturday

			// Skip weekend days if hideWeekends is enabled
			if (hideWeekends && isWeekend) {
				currentDayIter.add(1, "day");
				continue;
			}

			const cell = gridContainer.createEl("div", {
				cls: "calendar-day-cell",
				attr: {
					"data-date": currentDayIter.format("YYYY-MM-DD"),
				},
			});
			const dateStr = currentDayIter.format("YYYY-MM-DD");
			dayCells[dateStr] = cell;

			const headerEl = cell.createDiv("calendar-day-header");
			// Add day number
			const dayNumberEl = headerEl.createDiv("calendar-day-number");
			dayNumberEl.textContent = currentDayIter.format("D");

			// Add styling classes
			if (!currentDayIter.isSame(this.currentDate, "month")) {
				cell.addClass("is-other-month");
			}
			if (currentDayIter.isSame(moment(), "day")) {
				cell.addClass("is-today");
			}
			// Note: We don't add is-weekend class when hideWeekends is enabled
			// because weekend cells are not created at all
			if (!hideWeekends && isWeekend) {
				cell.addClass("is-weekend");
			}

			// Add events container within the cell
			cell.createDiv("calendar-events-container"); // This is where events will be appended

			currentDayIter.add(1, "day");
		}

		// 4. Filter and Render Events into the appropriate cells (uses calculated gridStart/gridEnd)
		this.events.forEach((event) => {
			const eventStartMoment = moment(event.start).startOf("day");
			const gridEndMoment = gridEnd.clone().endOf("day"); // Ensure comparison includes full last day
			const gridStartMoment = gridStart.clone().startOf("day");

			// Ensure the event is relevant to the displayed grid dates
			if (
				eventStartMoment.isAfter(gridEndMoment) || // Starts after the grid ends
				(event.end &&
					moment(event.end).startOf("day").isBefore(gridStartMoment)) // Ends before the grid starts
			) {
				return; // Event is completely outside the current grid view
			}

			// --- Simplified logic: Only render event on its start date ---
			// Check if the event's start date is within the visible grid dates
			if (
				eventStartMoment.isSameOrAfter(gridStartMoment) &&
				eventStartMoment.isSameOrBefore(gridEndMoment)
			) {
				const dateStr = eventStartMoment.format("YYYY-MM-DD");
				const targetCell = dayCells[dateStr];
				if (targetCell) {
					const eventsContainer = targetCell.querySelector(
						".calendar-events-container"
					);
					if (eventsContainer) {
						// Render the event using the existing renderer
						const { eventEl, component } = renderCalendarEvent({
							event: event,
							viewType: "month", // Pass viewType consistently
							app: this.app,
							onEventClick: this.options.onEventClick,
							onEventHover: this.options.onEventHover,
							onEventContextMenu: this.options.onEventContextMenu,
							onEventComplete: this.options.onEventComplete,
						});
						this.addChild(component);
						eventsContainer.appendChild(eventEl);
					}
				}
			}
			// --- End of simplified logic ---
		});

		// 5. Render badges for ICS events with badge showType
		Object.keys(dayCells).forEach((dateStr) => {
			const cell = dayCells[dateStr];
			// Use optimized date parsing for better performance
			const date = parseDateString(dateStr);

			const badgeEvents =
				this.options.getBadgeEventsForDate?.(date) || [];

			if (badgeEvents.length > 0) {
				const headerEl = cell.querySelector(
					".calendar-day-header"
				) as HTMLElement;
				const badgesContainer = headerEl.createDiv(
					"calendar-badges-container"
				);
				if (badgesContainer) {
					badgeEvents.forEach((badgeEvent) => {
						const badgeEl = badgesContainer.createEl("div", {
							cls: "calendar-badge",
						});

						// Add color styling if available
						if (badgeEvent.color) {
							badgeEl.style.backgroundColor = badgeEvent.color;
						}

						// Add count text
						badgeEl.textContent = badgeEvent.content;
					});
				}
			}
		});

		console.log(
			`Rendered Month View component from ${gridStart.format(
				"YYYY-MM-DD"
			)} to ${gridEnd.format(
				"YYYY-MM-DD"
			)} (First day: ${effectiveFirstDay})`
		);

		this.registerDomEvent(gridContainer, "click", (ev) => {
			const target = ev.target as HTMLElement;
			if (target.closest(".calendar-day-number")) {
				const dateStr = target
					.closest(".calendar-day-cell")
					?.getAttribute("data-date");
				if (this.options.onDayClick && dateStr) {
					console.log("Day number clicked:", dateStr);
					// Use optimized date parsing for better performance
					const date = parseDateString(dateStr);
					this.options.onDayClick(ev, date.getTime(), {
						behavior: "open-task-view",
					});
				}

				return;
			}
			if (target.closest(".calendar-day-cell")) {
				const dateStr = target
					.closest(".calendar-day-cell")
					?.getAttribute("data-date");
				if (this.options.onDayClick && dateStr) {
					// Use optimized date parsing for better performance
					const date = parseDateString(dateStr);
					this.options.onDayClick(ev, date.getTime(), {
						behavior: "open-quick-capture",
					});
				}
			}
		});

		this.registerDomEvent(gridContainer, "mouseover", (ev) => {
			this.debounceHover(ev);
		});

		// Initialize drag and drop functionality
		this.initializeDragAndDrop(dayCells);
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
		if (target.closest(".calendar-day-cell")) {
			const dateStr = target
				.closest(".calendar-day-cell")
				?.getAttribute("data-date");
			if (this.options.onDayHover && dateStr) {
				// Use optimized date parsing for better performance
				const date = parseDateString(dateStr);
				this.options.onDayHover(ev, date.getTime());
			}
		}
	}, 200);

	/**
	 * Initialize drag and drop functionality for calendar events
	 */
	private initializeDragAndDrop(dayCells: {
		[key: string]: HTMLElement;
	}): void {
		// Clean up existing sortable instances
		this.sortableInstances.forEach((instance) => instance.destroy());
		this.sortableInstances = [];

		// Initialize sortable for each day's events container
		Object.entries(dayCells).forEach(([dateStr, dayCell]) => {
			const eventsContainer = dayCell.querySelector(
				".calendar-events-container"
			) as HTMLElement;
			if (eventsContainer) {
				const sortableInstance = Sortable.create(eventsContainer, {
					group: "calendar-events",
					animation: 150,
					ghostClass: "calendar-event-ghost",
					dragClass: "calendar-event-dragging",
					onEnd: (event) => {
						this.handleDragEnd(event, dateStr);
					},
				});
				this.sortableInstances.push(sortableInstance);
			}
		});
	}

	/**
	 * Handle drag end event to update task dates
	 */
	private async handleDragEnd(
		event: Sortable.SortableEvent,
		originalDateStr: string
	): Promise<void> {
		const eventEl = event.item;
		const eventId = eventEl.dataset.eventId;
		const targetContainer = event.to;
		const targetDateCell = targetContainer.closest(".calendar-day-cell");

		if (!eventId || !targetDateCell) {
			console.warn(
				"Could not determine event ID or target date for drag operation"
			);
			return;
		}

		const targetDateStr = targetDateCell.getAttribute("data-date");
		if (!targetDateStr || targetDateStr === originalDateStr) {
			// No date change, nothing to do
			return;
		}

		// Find the calendar event
		const calendarEvent = this.events.find((e) => e.id === eventId);
		if (!calendarEvent) {
			console.warn(`Calendar event with ID ${eventId} not found`);
			return;
		}

		try {
			await this.updateTaskDate(calendarEvent, targetDateStr);
			console.log(
				`Task ${eventId} moved from ${originalDateStr} to ${targetDateStr}`
			);
		} catch (error) {
			console.error("Failed to update task date:", error);
			// Revert the visual change by re-rendering
			this.render();
		}
	}

	/**
	 * Update task date based on the target date
	 */
	private async updateTaskDate(
		calendarEvent: CalendarEvent,
		targetDateStr: string
	): Promise<void> {
		// Use optimized date parsing for better performance
		const targetDate = parseDateString(targetDateStr).getTime();

		if (!this.plugin.writeAPI) {
			throw new Error("WriteAPI not available");
		}

		// Create updated task with new date
		const updatedTask = { ...calendarEvent };

		// Determine which date field to update based on what the task currently has
		if (calendarEvent.metadata.dueDate) {
			updatedTask.metadata.dueDate = targetDate;
		} else if (calendarEvent.metadata.scheduledDate) {
			updatedTask.metadata.scheduledDate = targetDate;
		} else if (calendarEvent.metadata.startDate) {
			updatedTask.metadata.startDate = targetDate;
		} else {
			// Default to due date if no date is set
			updatedTask.metadata.dueDate = targetDate;
		}

		// Update the task
		const result = await this.plugin.writeAPI.updateTask({
			taskId: calendarEvent.id,
			updates: updatedTask,
		});
		
		if (!result.success) {
			throw new Error(`Failed to update task: ${result.error}`);
		}
	}

	/**
	 * Clean up sortable instances when component is destroyed
	 */
	onunload(): void {
		this.sortableInstances.forEach((instance) => instance.destroy());
		this.sortableInstances = [];
		super.onunload();
	}
}
