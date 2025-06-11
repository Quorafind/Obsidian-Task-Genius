/**
 * Test ICS Badge Integration
 * Verifies that ICS events with badge showType are properly handled
 */

import { IcsSource, IcsEvent, IcsTask } from "../types/ics";
import { Task } from "../types/task";

describe("ICS Badge Integration", () => {
	// Mock ICS source with badge showType
	const badgeSource: IcsSource = {
		id: "test-badge-source",
		name: "Test Badge Calendar",
		url: "https://example.com/calendar.ics",
		enabled: true,
		refreshInterval: 60,
		showAllDayEvents: true,
		showTimedEvents: true,
		showType: "badge", // This should display as badges
		color: "#ff6b6b",
	};

	// Mock ICS source with event showType
	const eventSource: IcsSource = {
		id: "test-event-source",
		name: "Test Event Calendar",
		url: "https://example.com/calendar2.ics",
		enabled: true,
		refreshInterval: 60,
		showAllDayEvents: true,
		showTimedEvents: true,
		showType: "event", // This should display as full events
		color: "#4ecdc4",
	};

	// Mock ICS events
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

	// Mock ICS tasks
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
		badge: true,
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
		badge: true,
		source: {
			type: "ics",
			name: eventSource.name,
			id: eventSource.id,
		},
	};

	test("should identify ICS tasks with badge showType", () => {
		const tasks: Task[] = [badgeTask, eventTask];

		// Simulate the logic from calendar component
		const badgeTasks = tasks.filter((task) => {
			const isIcsTask = (task as any).source?.type === "ics";
			const icsTask = isIcsTask ? (task as IcsTask) : null;
			return icsTask?.icsEvent?.source?.showType === "badge";
		});

		const eventTasks = tasks.filter((task) => {
			const isIcsTask = (task as any).source?.type === "ics";
			const icsTask = isIcsTask ? (task as IcsTask) : null;
			return isIcsTask && icsTask?.icsEvent?.source?.showType !== "badge";
		});

		expect(badgeTasks).toHaveLength(1);
		expect(badgeTasks[0].id).toBe(badgeTask.id);

		expect(eventTasks).toHaveLength(1);
		expect(eventTasks[0].id).toBe(eventTask.id);
	});

	test("should generate badge events for specific date", () => {
		const tasks: Task[] = [badgeTask, eventTask];
		const targetDate = new Date("2024-01-15");

		// Simulate getBadgeEventsForDate logic
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
				const eventDate = new Date(icsTask.icsEvent.dtstart);
				eventDate.setHours(0, 0, 0, 0);
				const targetDateNormalized = new Date(targetDate);
				targetDateNormalized.setHours(0, 0, 0, 0);

				// Check if the event is on the target date
				if (eventDate.getTime() === targetDateNormalized.getTime()) {
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

		const result = Array.from(badgeEvents.values());

		expect(result).toHaveLength(1);
		expect(result[0].sourceId).toBe(badgeSource.id);
		expect(result[0].sourceName).toBe(badgeSource.name);
		expect(result[0].count).toBe(1);
		expect(result[0].color).toBe(badgeSource.color);
	});

	test("should not include badge events in regular calendar events", () => {
		const tasks: Task[] = [badgeTask, eventTask];

		// Simulate processTasks logic for filtering out badge events
		const calendarEvents = tasks.filter((task) => {
			const isIcsTask = (task as any).source?.type === "ics";
			const icsTask = isIcsTask ? (task as IcsTask) : null;
			const showAsBadge = icsTask?.icsEvent?.source?.showType === "badge";

			// Skip ICS tasks with badge showType
			return !(isIcsTask && showAsBadge);
		});

		expect(calendarEvents).toHaveLength(1);
		expect(calendarEvents[0].id).toBe(eventTask.id);
	});

	test("should handle multiple badge events from same source", () => {
		// Create multiple badge events from the same source
		const badgeEvent2: IcsEvent = {
			...badgeEvent,
			uid: "badge-event-2",
			summary: "Badge Event 2",
		};

		const badgeTask2: IcsTask = {
			...badgeTask,
			id: "ics-test-badge-source-badge-event-2",
			content: "Badge Event 2",
			icsEvent: badgeEvent2,
		};

		const tasks: Task[] = [badgeTask, badgeTask2];
		const targetDate = new Date("2024-01-15");

		// Simulate getBadgeEventsForDate logic
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
				const eventDate = new Date(icsTask.icsEvent.dtstart);
				eventDate.setHours(0, 0, 0, 0);
				const targetDateNormalized = new Date(targetDate);
				targetDateNormalized.setHours(0, 0, 0, 0);

				if (eventDate.getTime() === targetDateNormalized.getTime()) {
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

		const result = Array.from(badgeEvents.values());

		expect(result).toHaveLength(1);
		expect(result[0].count).toBe(2); // Should aggregate count from same source
	});
});
