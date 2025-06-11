/**
 * Calendar Performance Tests
 * Tests to verify performance optimizations work correctly
 */

import { IcsTask, IcsEvent, IcsSource } from "../types/ics";
import { Task } from "../types/task";

describe("Calendar Performance Optimizations", () => {
	// Helper function to create badge tasks
	function createBadgeTasks(count: number, baseDate: Date): IcsTask[] {
		const tasks: IcsTask[] = [];

		for (let i = 0; i < count; i++) {
			const eventDate = new Date(baseDate);
			eventDate.setDate(baseDate.getDate() + (i % 7)); // Spread across a week

			const badgeSource: IcsSource = {
				id: `badge-source-${i}`,
				name: `Badge Calendar ${i}`,
				url: `https://example.com/cal${i}.ics`,
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "badge",
				color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
			};

			const badgeEvent: IcsEvent = {
				uid: `badge-event-${i}`,
				summary: `Badge Event ${i}`,
				description: "Test badge event",
				dtstart: eventDate,
				dtend: new Date(eventDate.getTime() + 60 * 60 * 1000),
				allDay: false,
				source: badgeSource,
			};

			const badgeTask: IcsTask = {
				id: `ics-badge-${i}`,
				content: `Badge Event ${i}`,
				filePath: `ics://${badgeSource.name}`,
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: `- [ ] Badge Event ${i}`,
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

			tasks.push(badgeTask);
		}

		return tasks;
	}

	// Optimized getBadgeEventsForDate function (extracted from CalendarComponent)
	function optimizedGetBadgeEventsForDate(tasks: Task[], date: Date): any[] {
		// Use native Date operations for better performance
		const year = date.getFullYear();
		const month = date.getMonth();
		const day = date.getDate();

		const badgeEventsForDate: any[] = [];

		tasks.forEach((task) => {
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
					const calendarEvent = {
						...task,
						title: task.content,
						start: icsTask.icsEvent.dtstart,
						end: icsTask.icsEvent.dtend,
						allDay: icsTask.icsEvent.allDay,
						color: icsTask.icsEvent.source.color,
					};
					badgeEventsForDate.push(calendarEvent);
				}
			}
		});

		return badgeEventsForDate;
	}

	// Legacy getBadgeEventsForDate function (using moment.js)
	function legacyGetBadgeEventsForDate(tasks: Task[], date: Date): any[] {
		// Simulate moment.js usage (without actually importing it to avoid test issues)
		const targetDateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD format

		const badgeEventsForDate: any[] = [];

		tasks.forEach((task) => {
			const isIcsTask = (task as any).source?.type === "ics";
			const icsTask = isIcsTask ? (task as IcsTask) : null;
			const showAsBadge = icsTask?.icsEvent?.source?.showType === "badge";

			if (isIcsTask && showAsBadge && icsTask?.icsEvent) {
				// Simulate moment.js operations with more expensive date parsing
				const eventDate = new Date(icsTask.icsEvent.dtstart);
				const eventDateStr = eventDate.toISOString().split("T")[0];

				// Simulate moment.js comparison (more expensive)
				if (eventDateStr === targetDateStr) {
					const calendarEvent = {
						...task,
						title: task.content,
						start: icsTask.icsEvent.dtstart,
						end: icsTask.icsEvent.dtend,
						allDay: icsTask.icsEvent.allDay,
						color: icsTask.icsEvent.source.color,
					};
					badgeEventsForDate.push(calendarEvent);
				}
			}
		});

		return badgeEventsForDate;
	}

	// Utility function to parse date string (YYYY-MM-DD) to Date object
	function parseDateString(dateStr: string): Date {
		const dateParts = dateStr.split("-");
		const year = parseInt(dateParts[0], 10);
		const month = parseInt(dateParts[1], 10) - 1; // Month is 0-indexed in Date
		const day = parseInt(dateParts[2], 10);
		return new Date(year, month, day);
	}

	describe("Date Parsing Optimization", () => {
		test("should parse date strings efficiently", () => {
			const dateStr = "2024-01-15";

			// Test our optimized date parsing
			const startTime = performance.now();
			for (let i = 0; i < 1000; i++) {
				parseDateString(dateStr);
			}
			const endTime = performance.now();
			const optimizedTime = endTime - startTime;

			// Test native Date parsing
			const startTime2 = performance.now();
			for (let i = 0; i < 1000; i++) {
				new Date(dateStr);
			}
			const endTime2 = performance.now();
			const nativeTime = endTime2 - startTime2;

			console.log(`Optimized parsing: ${optimizedTime.toFixed(2)}ms`);
			console.log(`Native parsing: ${nativeTime.toFixed(2)}ms`);

			// Both should produce the same result
			const optimizedResult = parseDateString(dateStr);
			const nativeResult = new Date(dateStr);

			expect(optimizedResult.getFullYear()).toBe(
				nativeResult.getFullYear()
			);
			expect(optimizedResult.getMonth()).toBe(nativeResult.getMonth());
			expect(optimizedResult.getDate()).toBe(nativeResult.getDate());
		});

		test("should handle various date string formats", () => {
			const testCases = [
				"2024-01-15",
				"2024-12-31",
				"2023-02-28",
				"2024-02-29", // Leap year
			];

			testCases.forEach((dateStr) => {
				const optimizedResult = parseDateString(dateStr);
				const nativeResult = new Date(dateStr);

				expect(optimizedResult.getFullYear()).toBe(
					nativeResult.getFullYear()
				);
				expect(optimizedResult.getMonth()).toBe(
					nativeResult.getMonth()
				);
				expect(optimizedResult.getDate()).toBe(nativeResult.getDate());
			});
		});
	});

	describe("Badge Events Performance", () => {
		test("should handle large number of tasks efficiently", () => {
			const baseDate = new Date("2024-01-15");
			const largeBadgeTaskSet = createBadgeTasks(1000, baseDate);

			// Test optimized version
			const startTime = performance.now();

			const testDates = [
				new Date("2024-01-15"),
				new Date("2024-01-16"),
				new Date("2024-01-17"),
				new Date("2024-01-18"),
				new Date("2024-01-19"),
			];

			testDates.forEach((date) => {
				optimizedGetBadgeEventsForDate(largeBadgeTaskSet, date);
			});

			const endTime = performance.now();
			const optimizedTime = endTime - startTime;

			// Test legacy version
			const startTime2 = performance.now();

			testDates.forEach((date) => {
				legacyGetBadgeEventsForDate(largeBadgeTaskSet, date);
			});

			const endTime2 = performance.now();
			const legacyTime = endTime2 - startTime2;

			console.log(
				`Optimized version: ${optimizedTime.toFixed(
					2
				)}ms for 1000 tasks`
			);
			console.log(
				`Legacy version: ${legacyTime.toFixed(2)}ms for 1000 tasks`
			);

			// Optimized version should be faster or at least not significantly slower
			expect(optimizedTime).toBeLessThan(legacyTime * 1.5); // Allow 50% tolerance

			// Both should produce the same results
			const optimizedResult = optimizedGetBadgeEventsForDate(
				largeBadgeTaskSet,
				testDates[0]
			);
			const legacyResult = legacyGetBadgeEventsForDate(
				largeBadgeTaskSet,
				testDates[0]
			);

			expect(optimizedResult.length).toBe(legacyResult.length);
		});

		test("should correctly identify badge events", () => {
			const baseDate = new Date("2024-01-15");
			const badgeTasks = createBadgeTasks(5, baseDate);

			const result = optimizedGetBadgeEventsForDate(badgeTasks, baseDate);

			// Should return badge events for the specified date
			expect(result.length).toBeGreaterThan(0);

			// Verify the events are for the correct date
			result.forEach((event) => {
				const eventDate = new Date(event.start);
				expect(eventDate.getFullYear()).toBe(2024);
				expect(eventDate.getMonth()).toBe(0); // January (0-indexed)
				expect(eventDate.getDate()).toBe(15);
			});
		});

		test("should handle edge cases correctly", () => {
			// Test with empty task list
			const emptyResult = optimizedGetBadgeEventsForDate(
				[],
				new Date("2024-01-15")
			);
			expect(emptyResult).toHaveLength(0);

			// Test with non-badge tasks
			const regularTask: Task = {
				id: "regular-task",
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

			const regularResult = optimizedGetBadgeEventsForDate(
				[regularTask],
				new Date("2024-01-15")
			);
			expect(regularResult).toHaveLength(0);
		});
	});

	describe("Caching Simulation", () => {
		test("should demonstrate cache benefits", () => {
			const baseDate = new Date("2024-01-15");
			const badgeTasks = createBadgeTasks(100, baseDate);

			// Simulate cache implementation
			const cache = new Map<string, any[]>();

			function getCachedBadgeEvents(tasks: Task[], date: Date): any[] {
				const dateKey = `${date.getFullYear()}-${String(
					date.getMonth() + 1
				).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

				if (cache.has(dateKey)) {
					return cache.get(dateKey) || [];
				}

				const result = optimizedGetBadgeEventsForDate(tasks, date);
				cache.set(dateKey, result);
				return result;
			}

			// First call - should compute and cache
			const startTime1 = performance.now();
			const result1 = getCachedBadgeEvents(badgeTasks, baseDate);
			const endTime1 = performance.now();
			const firstCallTime = endTime1 - startTime1;

			// Second call - should use cache
			const startTime2 = performance.now();
			const result2 = getCachedBadgeEvents(badgeTasks, baseDate);
			const endTime2 = performance.now();
			const secondCallTime = endTime2 - startTime2;

			console.log(`First call (compute): ${firstCallTime.toFixed(2)}ms`);
			console.log(`Second call (cached): ${secondCallTime.toFixed(2)}ms`);

			// Results should be identical
			expect(result1).toEqual(result2);

			// Second call should be faster (cached)
			expect(secondCallTime).toBeLessThan(firstCallTime);
		});
	});
});
