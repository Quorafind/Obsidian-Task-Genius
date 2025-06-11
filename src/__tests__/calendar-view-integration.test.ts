/**
 * Calendar View Integration Tests
 * Tests the integration between badge logic and calendar view rendering
 */

import { moment } from "obsidian";
import { IcsTask, IcsEvent, IcsSource } from "../types/ics";
import { Task } from "../types/task";

describe("Calendar View Badge Integration", () => {
	// Test the integration logic that would be used in the actual calendar component

	// Mock the CalendarComponent's getBadgeEventsForDate method
	function simulateGetBadgeEventsForDate(
		tasks: Task[],
		date: Date
	): {
		sourceId: string;
		sourceName: string;
		count: number;
		color?: string;
	}[] {
		const targetDate = moment(date).startOf("day");
		const badgeEvents: Map<
			string,
			{
				sourceId: string;
				sourceName: string;
				count: number;
				color?: string;
			}
		> = new Map();

		tasks.forEach((task) => {
			const isIcsTask = (task as any).source?.type === "ics";
			const icsTask = isIcsTask ? (task as IcsTask) : null;
			const showAsBadge = icsTask?.icsEvent?.source?.showType === "badge";

			if (isIcsTask && showAsBadge && icsTask?.icsEvent) {
				const eventDate = moment(icsTask.icsEvent.dtstart).startOf(
					"day"
				);

				// Check if the event is on the target date
				if (eventDate.isSame(targetDate)) {
					const sourceId = icsTask.icsEvent.source.id;
					const existing = badgeEvents.get(sourceId);

					if (existing) {
						existing.count++;
					} else {
						badgeEvents.set(sourceId, {
							sourceId: sourceId,
							sourceName: icsTask.icsEvent.source.name,
							count: 1,
							color: icsTask.icsEvent.source.color,
						});
					}
				}
			}
		});

		return Array.from(badgeEvents.values());
	}

	// Mock the CalendarComponent's processTasks method
	function simulateProcessTasks(tasks: Task[]): Task[] {
		return tasks.filter((task) => {
			const isIcsTask = (task as any).source?.type === "ics";
			const icsTask = isIcsTask ? (task as IcsTask) : null;
			const showAsBadge = icsTask?.icsEvent?.source?.showType === "badge";

			// Skip ICS tasks with badge showType - they will be handled separately
			return !(isIcsTask && showAsBadge);
		});
	}

	// Simulate the month view rendering logic for badges
	function simulateMonthViewBadgeRendering(
		tasks: Task[],
		startDate: Date,
		endDate: Date
	): { [dateStr: string]: any[] } {
		const badgesByDate: { [dateStr: string]: any[] } = {};

		// Simulate iterating through each day in the month view
		let currentDate = new Date(startDate);
		while (currentDate <= endDate) {
			const dateStr = currentDate.toISOString().split("T")[0];
			const badgeEvents = simulateGetBadgeEventsForDate(
				tasks,
				currentDate
			);

			if (badgeEvents.length > 0) {
				badgesByDate[dateStr] = badgeEvents.map((badgeEvent) => ({
					cls: "calendar-badge",
					title: `${badgeEvent.sourceName}: ${badgeEvent.count} events`,
					backgroundColor: badgeEvent.color,
					textContent: badgeEvent.count.toString(),
				}));
			}

			// Move to next day
			currentDate.setDate(currentDate.getDate() + 1);
		}

		return badgesByDate;
	}

	describe("Badge Rendering Integration", () => {
		test("should render badges in month view for badge events", () => {
			// Create test data
			const badgeSource: IcsSource = {
				id: "test-badge-source",
				name: "Test Badge Calendar",
				url: "https://example.com/calendar.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "badge",
				color: "#ff6b6b",
			};

			const badgeEvent: IcsEvent = {
				uid: "badge-event-1",
				summary: "Badge Event 1",
				description: "This should appear as a badge",
				dtstart: new Date("2024-01-15T10:00:00Z"),
				dtend: new Date("2024-01-15T11:00:00Z"),
				allDay: false,
				source: badgeSource,
			};

			const badgeTask: IcsTask = {
				id: "ics-test-badge-source-badge-event-1",
				content: "Badge Event 1",
				filePath: "ics://Test Badge Calendar",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Badge Event 1",
				metadata: {
					tags: [],
					children: [],
					startDate: badgeEvent.dtstart.getTime(),
					dueDate: badgeEvent.dtend?.getTime(),
					scheduledDate: badgeEvent.dtstart.getTime(),
					project: badgeSource.name,
					heading: [],
				},
				icsEvent: badgeEvent,
				readonly: true,
				source: {
					type: "ics",
					name: badgeSource.name,
					id: badgeSource.id,
				},
			};

			const tasks: Task[] = [badgeTask];

			// Simulate month view rendering
			const startDate = new Date("2024-01-01");
			const endDate = new Date("2024-01-31");
			const badgesByDate = simulateMonthViewBadgeRendering(
				tasks,
				startDate,
				endDate
			);

			// Verify badge is rendered on the correct date
			expect(badgesByDate["2024-01-15"]).toBeDefined();
			expect(badgesByDate["2024-01-15"]).toHaveLength(1);

			const badge = badgesByDate["2024-01-15"][0];
			expect(badge.cls).toBe("calendar-badge");
			expect(badge.textContent).toBe("1");
			expect(badge.backgroundColor).toBe("#ff6b6b");
			expect(badge.title).toBe("Test Badge Calendar: 1 events");

			// Verify no badges on other dates
			expect(badgesByDate["2024-01-14"]).toBeUndefined();
			expect(badgesByDate["2024-01-16"]).toBeUndefined();
		});

		test("should not render badges for regular events", () => {
			// Create test data with regular event (not badge)
			const eventSource: IcsSource = {
				id: "test-event-source",
				name: "Test Event Calendar",
				url: "https://example.com/calendar2.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "event", // This should NOT appear as badge
				color: "#4ecdc4",
			};

			const eventEvent: IcsEvent = {
				uid: "event-event-1",
				summary: "Full Event 1",
				description: "This should appear as a full event",
				dtstart: new Date("2024-01-15T14:00:00Z"),
				dtend: new Date("2024-01-15T15:00:00Z"),
				allDay: false,
				source: eventSource,
			};

			const eventTask: IcsTask = {
				id: "ics-test-event-source-event-event-1",
				content: "Full Event 1",
				filePath: "ics://Test Event Calendar",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Full Event 1",
				metadata: {
					tags: [],
					children: [],
					startDate: eventEvent.dtstart.getTime(),
					dueDate: eventEvent.dtend?.getTime(),
					scheduledDate: eventEvent.dtstart.getTime(),
					project: eventSource.name,
					heading: [],
				},
				icsEvent: eventEvent,
				readonly: true,
				source: {
					type: "ics",
					name: eventSource.name,
					id: eventSource.id,
				},
			};

			const tasks: Task[] = [eventTask];

			// Simulate month view rendering
			const startDate = new Date("2024-01-01");
			const endDate = new Date("2024-01-31");
			const badgesByDate = simulateMonthViewBadgeRendering(
				tasks,
				startDate,
				endDate
			);

			// Verify no badges are rendered
			expect(Object.keys(badgesByDate)).toHaveLength(0);

			// Verify the task would be included in regular calendar events
			const calendarEvents = simulateProcessTasks(tasks);
			expect(calendarEvents).toHaveLength(1);
			expect(calendarEvents[0].id).toBe(eventTask.id);
		});

		test("should handle mixed badge and regular events correctly", () => {
			// Create mixed test data
			const badgeSource: IcsSource = {
				id: "badge-source",
				name: "Badge Calendar",
				url: "https://example.com/badge.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "badge",
				color: "#ff6b6b",
			};

			const eventSource: IcsSource = {
				id: "event-source",
				name: "Event Calendar",
				url: "https://example.com/event.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "event",
				color: "#4ecdc4",
			};

			const badgeEvent: IcsEvent = {
				uid: "badge-event-1",
				summary: "Badge Event 1",
				description: "This should appear as a badge",
				dtstart: new Date("2024-01-15T10:00:00Z"),
				dtend: new Date("2024-01-15T11:00:00Z"),
				allDay: false,
				source: badgeSource,
			};

			const eventEvent: IcsEvent = {
				uid: "event-event-1",
				summary: "Full Event 1",
				description: "This should appear as a full event",
				dtstart: new Date("2024-01-15T14:00:00Z"),
				dtend: new Date("2024-01-15T15:00:00Z"),
				allDay: false,
				source: eventSource,
			};

			const badgeTask: IcsTask = {
				id: "badge-task-1",
				content: "Badge Event 1",
				filePath: "ics://Badge Calendar",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Badge Event 1",
				metadata: {
					tags: [],
					children: [],
					startDate: badgeEvent.dtstart.getTime(),
					dueDate: badgeEvent.dtend?.getTime(),
					scheduledDate: badgeEvent.dtstart.getTime(),
					project: badgeSource.name,
					heading: [],
				},
				icsEvent: badgeEvent,
				readonly: true,
				source: {
					type: "ics",
					name: badgeSource.name,
					id: badgeSource.id,
				},
			};

			const eventTask: IcsTask = {
				id: "event-task-1",
				content: "Full Event 1",
				filePath: "ics://Event Calendar",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Full Event 1",
				metadata: {
					tags: [],
					children: [],
					startDate: eventEvent.dtstart.getTime(),
					dueDate: eventEvent.dtend?.getTime(),
					scheduledDate: eventEvent.dtstart.getTime(),
					project: eventSource.name,
					heading: [],
				},
				icsEvent: eventEvent,
				readonly: true,
				source: {
					type: "ics",
					name: eventSource.name,
					id: eventSource.id,
				},
			};

			const tasks: Task[] = [badgeTask, eventTask];

			// Test badge rendering
			const startDate = new Date("2024-01-01");
			const endDate = new Date("2024-01-31");
			const badgesByDate = simulateMonthViewBadgeRendering(
				tasks,
				startDate,
				endDate
			);

			// Verify badge is rendered for badge event
			expect(badgesByDate["2024-01-15"]).toBeDefined();
			expect(badgesByDate["2024-01-15"]).toHaveLength(1);
			expect(badgesByDate["2024-01-15"][0].textContent).toBe("1");

			// Test regular event processing
			const calendarEvents = simulateProcessTasks(tasks);

			// Verify only the regular event is included in calendar events
			expect(calendarEvents).toHaveLength(1);
			expect(calendarEvents[0].id).toBe(eventTask.id);
		});

		test("should aggregate multiple badge events from same source", () => {
			const badgeSource: IcsSource = {
				id: "badge-source",
				name: "Badge Calendar",
				url: "https://example.com/badge.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "badge",
				color: "#ff6b6b",
			};

			// Create multiple events on the same day
			const badgeEvent1: IcsEvent = {
				uid: "badge-event-1",
				summary: "Badge Event 1",
				description: "",
				dtstart: new Date("2024-01-15T10:00:00Z"),
				dtend: new Date("2024-01-15T11:00:00Z"),
				allDay: false,
				source: badgeSource,
			};

			const badgeEvent2: IcsEvent = {
				uid: "badge-event-2",
				summary: "Badge Event 2",
				description: "",
				dtstart: new Date("2024-01-15T14:00:00Z"),
				dtend: new Date("2024-01-15T15:00:00Z"),
				allDay: false,
				source: badgeSource,
			};

			const badgeTask1: IcsTask = {
				id: "badge-task-1",
				content: "Badge Event 1",
				filePath: "ics://Badge Calendar",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Badge Event 1",
				metadata: {
					tags: [],
					children: [],
					startDate: badgeEvent1.dtstart.getTime(),
					dueDate: badgeEvent1.dtend?.getTime(),
					scheduledDate: badgeEvent1.dtstart.getTime(),
					project: badgeSource.name,
					heading: [],
				},
				icsEvent: badgeEvent1,
				readonly: true,
				source: {
					type: "ics",
					name: badgeSource.name,
					id: badgeSource.id,
				},
			};

			const badgeTask2: IcsTask = {
				id: "badge-task-2",
				content: "Badge Event 2",
				filePath: "ics://Badge Calendar",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Badge Event 2",
				metadata: {
					tags: [],
					children: [],
					startDate: badgeEvent2.dtstart.getTime(),
					dueDate: badgeEvent2.dtend?.getTime(),
					scheduledDate: badgeEvent2.dtstart.getTime(),
					project: badgeSource.name,
					heading: [],
				},
				icsEvent: badgeEvent2,
				readonly: true,
				source: {
					type: "ics",
					name: badgeSource.name,
					id: badgeSource.id,
				},
			};

			const tasks: Task[] = [badgeTask1, badgeTask2];

			// Test badge rendering
			const startDate = new Date("2024-01-01");
			const endDate = new Date("2024-01-31");
			const badgesByDate = simulateMonthViewBadgeRendering(
				tasks,
				startDate,
				endDate
			);

			// Verify badge shows aggregated count
			expect(badgesByDate["2024-01-15"]).toBeDefined();
			expect(badgesByDate["2024-01-15"]).toHaveLength(1);
			expect(badgesByDate["2024-01-15"][0].textContent).toBe("2");
			expect(badgesByDate["2024-01-15"][0].title).toBe(
				"Badge Calendar: 2 events"
			);
		});
	});

	describe("Badge Rendering Edge Cases", () => {
		test("should handle empty task list", () => {
			const tasks: Task[] = [];

			const startDate = new Date("2024-01-01");
			const endDate = new Date("2024-01-31");
			const badgesByDate = simulateMonthViewBadgeRendering(
				tasks,
				startDate,
				endDate
			);

			expect(Object.keys(badgesByDate)).toHaveLength(0);
		});

		test("should handle tasks without ICS events", () => {
			const regularTask: Task = {
				id: "regular-task-1",
				content: "Regular Task",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Regular Task",
				metadata: {
					tags: [],
					children: [],
					dueDate: new Date("2024-01-15").getTime(),
					heading: [],
				},
			};

			const tasks: Task[] = [regularTask];

			const startDate = new Date("2024-01-01");
			const endDate = new Date("2024-01-31");
			const badgesByDate = simulateMonthViewBadgeRendering(
				tasks,
				startDate,
				endDate
			);

			// No badges should be rendered for regular tasks
			expect(Object.keys(badgesByDate)).toHaveLength(0);

			// But the task should be included in regular calendar events
			const calendarEvents = simulateProcessTasks(tasks);
			expect(calendarEvents).toHaveLength(1);
			expect(calendarEvents[0].id).toBe(regularTask.id);
		});

		test("should handle badge events outside date range", () => {
			const badgeSource: IcsSource = {
				id: "badge-source",
				name: "Badge Calendar",
				url: "https://example.com/badge.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "badge",
				color: "#ff6b6b",
			};

			const badgeEvent: IcsEvent = {
				uid: "badge-event-1",
				summary: "Badge Event 1",
				description: "",
				dtstart: new Date("2024-02-15T10:00:00Z"), // Outside January range
				dtend: new Date("2024-02-15T11:00:00Z"),
				allDay: false,
				source: badgeSource,
			};

			const badgeTask: IcsTask = {
				id: "badge-task-1",
				content: "Badge Event 1",
				filePath: "ics://Badge Calendar",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Badge Event 1",
				metadata: {
					tags: [],
					children: [],
					startDate: badgeEvent.dtstart.getTime(),
					dueDate: badgeEvent.dtend?.getTime(),
					scheduledDate: badgeEvent.dtstart.getTime(),
					project: badgeSource.name,
					heading: [],
				},
				icsEvent: badgeEvent,
				readonly: true,
				source: {
					type: "ics",
					name: badgeSource.name,
					id: badgeSource.id,
				},
			};

			const tasks: Task[] = [badgeTask];

			// Test January range
			const startDate = new Date("2024-01-01");
			const endDate = new Date("2024-01-31");
			const badgesByDate = simulateMonthViewBadgeRendering(
				tasks,
				startDate,
				endDate
			);

			// No badges should be rendered in January
			expect(Object.keys(badgesByDate)).toHaveLength(0);
		});
	});
});
