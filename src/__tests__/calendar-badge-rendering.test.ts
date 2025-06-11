/**
 * Calendar Badge Rendering Tests
 * Tests the badge rendering logic for ICS events
 */

import { moment } from "obsidian";
import { IcsTask, IcsEvent, IcsSource } from "../types/ics";
import { Task } from "../types/task";

describe("Calendar Badge Rendering Logic", () => {
	// Mock ICS sources
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

	const eventSource: IcsSource = {
		id: "test-event-source",
		name: "Test Event Calendar",
		url: "https://example.com/calendar2.ics",
		enabled: true,
		refreshInterval: 60,
		showAllDayEvents: true,
		showTimedEvents: true,
		showType: "event",
		color: "#4ecdc4",
	};

	// Helper function to simulate getBadgeEventsForDate logic
	function getBadgeEventsForDate(
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

	// Helper function to simulate processTasks logic for filtering badge events
	function filterBadgeEvents(tasks: Task[]): Task[] {
		return tasks.filter((task) => {
			const isIcsTask = (task as any).source?.type === "ics";
			const icsTask = isIcsTask ? (task as IcsTask) : null;
			const showAsBadge = icsTask?.icsEvent?.source?.showType === "badge";

			// Skip ICS tasks with badge showType
			return !(isIcsTask && showAsBadge);
		});
	}

	describe("Badge Event Detection", () => {
		test("should identify ICS tasks with badge showType", () => {
			// Create mock ICS events
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

			// Create mock ICS tasks
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

			const tasks: Task[] = [badgeTask, eventTask];

			// Test badge event filtering
			const badgeTasks = tasks.filter((task) => {
				const isIcsTask = (task as any).source?.type === "ics";
				const icsTask = isIcsTask ? (task as IcsTask) : null;
				return icsTask?.icsEvent?.source?.showType === "badge";
			});

			const regularEvents = filterBadgeEvents(tasks);

			expect(badgeTasks).toHaveLength(1);
			expect(badgeTasks[0].id).toBe(badgeTask.id);

			expect(regularEvents).toHaveLength(1);
			expect(regularEvents[0].id).toBe(eventTask.id);
		});
	});

	describe("Badge Event Generation", () => {
		test("should generate badge events for specific date", () => {
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
			const targetDate = new Date("2024-01-15");

			const result = getBadgeEventsForDate(tasks, targetDate);

			expect(result).toHaveLength(1);
			expect(result[0].sourceId).toBe(badgeSource.id);
			expect(result[0].sourceName).toBe(badgeSource.name);
			expect(result[0].count).toBe(1);
			expect(result[0].color).toBe(badgeSource.color);
		});

		test("should handle multiple badge events from same source", () => {
			const badgeEvent1: IcsEvent = {
				uid: "badge-event-1",
				summary: "Badge Event 1",
				description: "This should appear as a badge",
				dtstart: new Date("2024-01-15T10:00:00Z"),
				dtend: new Date("2024-01-15T11:00:00Z"),
				allDay: false,
				source: badgeSource,
			};

			const badgeEvent2: IcsEvent = {
				uid: "badge-event-2",
				summary: "Badge Event 2",
				description: "This should also appear as a badge",
				dtstart: new Date("2024-01-15T14:00:00Z"),
				dtend: new Date("2024-01-15T15:00:00Z"),
				allDay: false,
				source: badgeSource,
			};

			const badgeTask1: IcsTask = {
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
				id: "ics-test-badge-source-badge-event-2",
				content: "Badge Event 2",
				filePath: "ics://Test Badge Calendar",
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
			const targetDate = new Date("2024-01-15");

			const result = getBadgeEventsForDate(tasks, targetDate);

			expect(result).toHaveLength(1);
			expect(result[0].sourceId).toBe(badgeSource.id);
			expect(result[0].count).toBe(2); // Should aggregate count from same source
		});

		test("should handle multiple badge sources on same date", () => {
			const source1: IcsSource = {
				id: "source-1",
				name: "Calendar 1",
				url: "https://example.com/cal1.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "badge",
				color: "#ff6b6b",
			};

			const source2: IcsSource = {
				id: "source-2",
				name: "Calendar 2",
				url: "https://example.com/cal2.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "badge",
				color: "#4ecdc4",
			};

			const event1: IcsEvent = {
				uid: "event-1",
				summary: "Event from Calendar 1",
				description: "",
				dtstart: new Date("2024-01-15T10:00:00Z"),
				dtend: new Date("2024-01-15T11:00:00Z"),
				allDay: false,
				source: source1,
			};

			const event2: IcsEvent = {
				uid: "event-2",
				summary: "Event from Calendar 2",
				description: "",
				dtstart: new Date("2024-01-15T14:00:00Z"),
				dtend: new Date("2024-01-15T15:00:00Z"),
				allDay: false,
				source: source2,
			};

			const task1: IcsTask = {
				id: "ics-source-1-event-1",
				content: "Event from Calendar 1",
				filePath: "ics://Calendar 1",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Event from Calendar 1",
				metadata: {
					tags: [],
					children: [],
					startDate: event1.dtstart.getTime(),
					dueDate: event1.dtend?.getTime(),
					scheduledDate: event1.dtstart.getTime(),
					project: source1.name,
					heading: [],
				},
				icsEvent: event1,
				readonly: true,
				source: {
					type: "ics",
					name: source1.name,
					id: source1.id,
				},
			};

			const task2: IcsTask = {
				id: "ics-source-2-event-2",
				content: "Event from Calendar 2",
				filePath: "ics://Calendar 2",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Event from Calendar 2",
				metadata: {
					tags: [],
					children: [],
					startDate: event2.dtstart.getTime(),
					dueDate: event2.dtend?.getTime(),
					scheduledDate: event2.dtstart.getTime(),
					project: source2.name,
					heading: [],
				},
				icsEvent: event2,
				readonly: true,
				source: {
					type: "ics",
					name: source2.name,
					id: source2.id,
				},
			};

			const tasks: Task[] = [task1, task2];
			const targetDate = new Date("2024-01-15");

			const result = getBadgeEventsForDate(tasks, targetDate);

			expect(result).toHaveLength(2);

			// Find badges by source ID
			const badge1 = result.find((b) => b.sourceId === source1.id);
			const badge2 = result.find((b) => b.sourceId === source2.id);

			expect(badge1).toBeDefined();
			expect(badge1!.count).toBe(1);
			expect(badge1!.color).toBe(source1.color);

			expect(badge2).toBeDefined();
			expect(badge2!.count).toBe(1);
			expect(badge2!.color).toBe(source2.color);
		});

		test("should return empty array when no badge events exist", () => {
			const eventEvent: IcsEvent = {
				uid: "event-event-1",
				summary: "Full Event 1",
				description: "This should appear as a full event",
				dtstart: new Date("2024-01-15T14:00:00Z"),
				dtend: new Date("2024-01-15T15:00:00Z"),
				allDay: false,
				source: eventSource, // This has showType: "event", not "badge"
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
			const targetDate = new Date("2024-01-15");

			const result = getBadgeEventsForDate(tasks, targetDate);

			expect(result).toHaveLength(0);
		});

		test("should return empty array for dates with no events", () => {
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
			const targetDate = new Date("2024-01-16"); // Different date

			const result = getBadgeEventsForDate(tasks, targetDate);

			expect(result).toHaveLength(0);
		});
	});

	describe("Badge Event Filtering", () => {
		test("should exclude badge events from regular calendar events", () => {
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

			const tasks: Task[] = [badgeTask, eventTask];

			// Simulate processTasks logic for filtering out badge events
			const calendarEvents = filterBadgeEvents(tasks);

			expect(calendarEvents).toHaveLength(1);
			expect(calendarEvents[0].id).toBe(eventTask.id);
		});

		test("should include non-ICS tasks in regular calendar events", () => {
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

			const tasks: Task[] = [regularTask, badgeTask];

			const calendarEvents = filterBadgeEvents(tasks);

			expect(calendarEvents).toHaveLength(1);
			expect(calendarEvents[0].id).toBe(regularTask.id);
		});
	});
});
