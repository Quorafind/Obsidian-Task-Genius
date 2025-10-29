import { App, Component, debounce, moment } from "obsidian";
import { CalendarEvent } from "@/components/features/calendar/index"; // Adjust path as needed
import { EventLayout, determineEventColor } from "../algorithm"; // Adjust path as needed
import {
	clearAllMarks,
	MarkdownRendererComponent,
} from "@/components/ui/renderers/MarkdownRenderer";
import { createTaskCheckbox } from "@/components/features/task/view/details";

export type EventViewType =
	| "month"
	| "week-allday"
	| "day-allday"
	| "day-timed"
	| "week-timed"
	| "agenda";

export interface EventPositioningHints {
	isMultiDay?: boolean;
	isStart?: boolean;
	isEnd?: boolean;
	isViewStart?: boolean;
	isViewEnd?: boolean;
	layoutSlot?: number; // Added for vertical positioning in week/day grid views
}

export interface RenderEventParams {
	event: CalendarEvent;
	viewType: EventViewType;
	layout?: EventLayout; // Primarily for timed views
	positioningHints?: EventPositioningHints; // Primarily for month/all-day views
	app: App; // Added for Markdown rendering

	onEventClick?: (ev: MouseEvent, event: CalendarEvent) => void;
	onEventHover?: (ev: MouseEvent, event: CalendarEvent) => void;
	onEventContextMenu?: (ev: MouseEvent, event: CalendarEvent) => void;
	onEventComplete?: (ev: MouseEvent, event: CalendarEvent) => void;
}

/**
 * Calendar Event Component that handles rendering and lifecycle of a single event
 */
export class CalendarEventComponent extends Component {
	private event: CalendarEvent;
	private viewType: EventViewType;
	private layout?: EventLayout;
	private positioningHints?: EventPositioningHints;
	private app: App;
	public eventEl: HTMLElement;
	private markdownRenderer: MarkdownRendererComponent;

	constructor(private params: RenderEventParams) {
		super();
		this.event = params.event;
		this.viewType = params.viewType;
		this.layout = params.layout;
		this.positioningHints = params.positioningHints;
		this.app = params.app;

		// Create the main element
		this.eventEl = createEl("div", {
			cls: ["calendar-event", `calendar-event-${this.viewType}`],
		});

		if (this.event.metadata.project) {
			this.eventEl.dataset.projectId = this.event.metadata.project;
		}

		if (this.event.metadata.priority) {
			this.eventEl.dataset.priority =
				this.event.metadata.priority.toString();
		}

		if (this.event.status) {
			this.eventEl.dataset.taskStatus = this.event.status;
		}

		if (this.event.filePath) {
			this.eventEl.dataset.filePath = this.event.filePath;
		}
		this.eventEl.dataset.eventId = this.event.id;
	}

	override onload(): void {
		super.onload();

		// --- Common Styling & Attributes ---
		this.applyStyles();
		this.setTooltip();

		// --- View-Specific Rendering ---
		this.renderByViewType();

		// --- Common Click Handler ---
		this.registerEventListeners();
	}

	/**
	 * Apply common styles and classes based on event properties
	 */
	private applyStyles(): void {
		const color = determineEventColor(this.event);
		if (color) {
			this.eventEl.style.backgroundColor = color;
			if (color === "grey") {
				this.eventEl.addClass("is-completed");
				// Apply line-through directly if not handled by CSS is-completed
				// this.eventEl.style.textDecoration = 'line-through';
			} else {
				// TODO: Add contrast check for text color if needed
			}
		} else if (this.event.completed) {
			// Fallback if no color but completed
			this.eventEl.addClass("is-completed");
		}
	}

	/**
	 * Set tooltip information for the event
	 */
	private setTooltip(): void {
		this.eventEl.setAttr(
			"title",
			`${clearAllMarks(this.event.title) || "(No title)"}\nStatus: ${
				this.event.status
			}${
				this.event.metadata.dueDate
					? `\nDue: ${moment(this.event.metadata.dueDate).format(
							"YYYY-MM-DD",
						)}`
					: ""
			}${
				this.event.metadata.startDate
					? `\nStart: ${moment(this.event.metadata.startDate).format(
							"YYYY-MM-DD",
						)}`
					: ""
			}`,
		);
	}

	/**
	 * Render event content based on view type
	 */
	private renderByViewType(): void {
		if (
			this.viewType === "month" ||
			this.viewType === "week-allday" ||
			this.viewType === "day-allday"
		) {
			this.renderAllDayEvent();
		} else if (
			this.viewType === "day-timed" ||
			this.viewType === "week-timed"
		) {
			this.renderTimedEvent();
		} else if (this.viewType === "agenda") {
			this.renderAgendaEvent();
		}
	}

	/**
	 * Render all-day or month view events
	 */
	private renderAllDayEvent(): void {
		this.eventEl.addClass("calendar-event-allday");

		const checkbox = createTaskCheckbox(
			this.event.status,
			this.event,
			this.eventEl,
		);

		this.registerDomEvent(checkbox, "click", (ev) => {
			ev.stopPropagation();

			if (this.params?.onEventComplete) {
				this.params.onEventComplete(ev, this.event);
			}

			if (this.event.status === " ") {
				checkbox.checked = true;
				checkbox.dataset.task = "x";
			}
		});

		// Create a container for the title to render markdown into
		const titleContainer = this.eventEl.createDiv({
			cls: "calendar-event-title-container",
		});
		this.markdownRenderer = new MarkdownRendererComponent(
			this.app,
			titleContainer,
			this.event.filePath,
		);
		this.addChild(this.markdownRenderer);

		this.markdownRenderer.render(
			this.event.metadata.source === "file-source"
				? this.event.originalMarkdown
				: this.event.title,
		);

		if (this.positioningHints?.isMultiDay) {
			this.eventEl.addClass("is-multi-day");
			if (this.positioningHints.isStart)
				this.eventEl.addClass("is-start");
			if (this.positioningHints.isEnd) this.eventEl.addClass("is-end");
		}
	}

	/**
	 * Render timed events for day or week views
	 */
	private renderTimedEvent(): void {
		this.eventEl.toggleClass(
			["calendar-event-timed", "calendar-event"],
			true,
		);
		if (this.viewType === "week-timed") {
			this.eventEl.addClass("calendar-event-timed-week");
		}

		if (this.layout) {
			// Apply absolute positioning from layout ONLY for week-timed view
			if (this.viewType === "week-timed") {
				this.eventEl.style.position = "absolute";
				this.eventEl.style.top = `${this.layout.top}px`;
				this.eventEl.style.left = `${this.layout.left}%`;
				this.eventEl.style.width = `${this.layout.width}%`;
				this.eventEl.style.height = `${this.layout.height}px`;
				this.eventEl.style.zIndex = String(this.layout.zIndex);
			} else {
				// For day-timed (now a list), use relative positioning (handled by CSS)
				this.eventEl.style.position = "relative"; // Ensure it's not absolute
				this.eventEl.style.width = "100%"; // Take full width in the list
			}
		} else if (this.viewType === "week-timed") {
			// Only warn if layout is missing for week-timed
			console.warn(
				"Timed event render called without layout info for event:",
				this.event.id,
			);
			// Provide some default fallback style
			this.eventEl.style.position = "relative"; // Avoid breaking layout completely
		}

		// Add separate time and title elements
		// Only show time for week-timed view, not day-timed
		if (this.event.start && this.viewType === "week-timed") {
			const eventTime = moment(this.event.start).format("h:mma");
			this.eventEl.createDiv({
				cls: "calendar-event-time",
				text: eventTime,
			});
		}

		const checkbox = createTaskCheckbox(
			this.event.status,
			this.event,
			this.eventEl,
		);

		this.registerDomEvent(checkbox, "click", (ev) => {
			ev.stopPropagation();

			if (this.params?.onEventComplete) {
				this.params.onEventComplete(ev, this.event);
			}

			if (this.event.status === " ") {
				checkbox.checked = true;
				checkbox.dataset.task = "x";
			}
		});

		const titleEl = this.eventEl.createDiv({ cls: "calendar-event-title" });
		this.markdownRenderer = new MarkdownRendererComponent(
			this.app,
			titleEl,
			this.event.filePath,
		);
		this.addChild(this.markdownRenderer);

		this.markdownRenderer.render(this.event.title);
	}

	/**
	 * Render agenda view events
	 */
	private renderAgendaEvent(): void {
		// Optionally prepend time if not an all-day event
		if (this.event.start && !this.event.allDay) {
			const timeStr = moment(this.event.start).format("HH:mm");
			const timeEl = this.eventEl.createSpan({
				cls: "calendar-event-time agenda-time",
				text: timeStr,
			});
			this.eventEl.appendChild(timeEl);
		}
		const checkbox = createTaskCheckbox(
			this.event.status,
			this.event,
			this.eventEl,
		);

		this.registerDomEvent(checkbox, "click", (ev) => {
			ev.stopPropagation();

			if (this.params?.onEventComplete) {
				this.params.onEventComplete(ev, this.event);
			}

			if (this.event.status === " ") {
				checkbox.checked = true;
				checkbox.dataset.task = "x";
			}
		});

		// Append title
		const titleEl = this.eventEl.createSpan({
			cls: "calendar-event-title agenda-title",
		});
		// Append title after potential time element
		this.eventEl.appendChild(titleEl);

		this.markdownRenderer = new MarkdownRendererComponent(
			this.app,
			titleEl,
			this.event.filePath,
		);
		this.addChild(this.markdownRenderer);

		this.markdownRenderer.render(this.event.title);
	}

	/**
	 * Register event listeners
	 */
	private registerEventListeners(): void {
		this.registerDomEvent(this.eventEl, "click", (ev) => {
			ev.stopPropagation();
			this.params?.onEventClick?.(ev, this.event);
		});

		this.registerDomEvent(this.eventEl, "mouseover", (ev) => {
			this.debounceHover(ev, this.event);
		});
	}

	private debounceHover = debounce((ev: MouseEvent, event: CalendarEvent) => {
		this.params?.onEventHover?.(ev, event);
	}, 400);
}

/**
 * Creates and loads a calendar event component
 * @param params - Parameters for rendering the event
 * @returns The HTMLElement representing the event
 */
export function renderCalendarEvent(params: RenderEventParams): {
	eventEl: HTMLElement;
	component: CalendarEventComponent;
} {
	const eventComponent = new CalendarEventComponent(params);
	eventComponent.registerDomEvent(
		eventComponent.eventEl,
		"contextmenu",
		(ev) => {
			params.onEventContextMenu?.(ev, params.event);
		},
	);
	return { eventEl: eventComponent.eventEl, component: eventComponent };
}
