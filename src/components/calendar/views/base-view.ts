import { App, Component } from "obsidian";
import { CalendarEvent } from "../index";
import TaskProgressBarPlugin from "../../../index";

interface EventMap {
	onEventClick: (ev: MouseEvent, event: CalendarEvent) => void;
	onEventHover: (ev: MouseEvent, event: CalendarEvent) => void;
	onDayClick: (
		ev: MouseEvent,
		day: number,
		options: {
			behavior: "open-quick-capture" | "open-task-view";
		}
	) => void;
	onDayHover: (ev: MouseEvent, day: number) => void;
	onMonthClick: (ev: MouseEvent, month: number) => void;
	onMonthHover: (ev: MouseEvent, month: number) => void;
	onYearClick: (ev: MouseEvent, year: number) => void;
	onYearHover: (ev: MouseEvent, year: number) => void;
	onEventContextMenu: (ev: MouseEvent, event: CalendarEvent) => void;
	onEventComplete: (ev: MouseEvent, event: CalendarEvent) => void;
}

// Combine event handlers into a single options object, making them optional
export interface CalendarViewOptions extends Partial<EventMap> {
	// Add other common view options here if needed
	getBadgeEventsForDate?: (date: Date) => CalendarEvent[];
}

export abstract class CalendarViewComponent extends Component {
	protected containerEl: HTMLElement;
	protected events: CalendarEvent[];
	protected options: CalendarViewOptions;

	constructor(
		plugin: TaskProgressBarPlugin,
		app: App,
		containerEl: HTMLElement,
		events: CalendarEvent[],
		options: CalendarViewOptions = {} // Provide default empty options
	) {
		super(); // Call the base class constructor
		this.containerEl = containerEl;
		this.events = events;
		this.options = options;
	}

	// Abstract method for rendering the specific view content
	// Subclasses (MonthView, WeekView, DayView) must implement this
	abstract render(): void;

	// Example common method (can be implemented here or left abstract)
	protected handleEventClick(ev: MouseEvent, event: CalendarEvent): void {
		if (this.options.onEventClick) {
			this.options.onEventClick(ev, event);
		}
	}

	// Lifecycle methods from Component might be overridden here or in subclasses
	onload(): void {
		super.onload();
		this.render(); // Initial render on load
	}

	onunload(): void {
		// Clean up resources, remove event listeners, etc.
		this.containerEl.empty();
		super.onunload();
	}
}
