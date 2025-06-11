/**
 * Badge Debug Helper
 * This test helps debug why badges might not be showing in the calendar view
 */

import { moment } from "obsidian";
import { IcsTask, IcsEvent, IcsSource } from "../types/ics";
import { Task } from "../types/task";

describe("Badge Debug Helper", () => {
	// Helper function to create a realistic badge task
	function createBadgeTask(
		sourceId: string,
		sourceName: string,
		eventDate: Date,
		color: string = "#ff6b6b"
	): IcsTask {
		const badgeSource: IcsSource = {
			id: sourceId,
			name: sourceName,
			url: `https://example.com/${sourceId}.ics`,
			enabled: true,
			refreshInterval: 60,
			showAllDayEvents: true,
			showTimedEvents: true,
			showType: "badge",
			color: color,
		};

		const badgeEvent: IcsEvent = {
			uid: `${sourceId}-event-${eventDate.getTime()}`,
			summary: `Event from ${sourceName}`,
			description: "This should appear as a badge",
			dtstart: eventDate,
			dtend: new Date(eventDate.getTime() + 60 * 60 * 1000), // 1 hour later
			allDay: false,
			source: badgeSource,
		};

		const badgeTask: IcsTask = {
			id: `ics-${sourceId}-${badgeEvent.uid}`,
			content: badgeEvent.summary,
			filePath: `ics://${sourceName}`,
			line: 0,
			completed: false,
			status: " ",
			originalMarkdown: `- [ ] ${badgeEvent.summary}`,
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

		return badgeTask;
	}

	// Debug function to check if a task should show as badge
	function debugTaskBadgeStatus(task: Task): {
		isIcsTask: boolean;
		hasIcsEvent: boolean;
		hasSource: boolean;
		showType: string | undefined;
		shouldShowAsBadge: boolean;
		debugInfo: string[];
	} {
		const debugInfo: string[] = [];

		const isIcsTask = (task as any).source?.type === "ics";
		debugInfo.push(`Is ICS task: ${isIcsTask}`);

		if (!isIcsTask) {
			debugInfo.push("❌ Not an ICS task - will not show as badge");
			return {
				isIcsTask,
				hasIcsEvent: false,
				hasSource: false,
				showType: undefined,
				shouldShowAsBadge: false,
				debugInfo,
			};
		}

		const icsTask = task as IcsTask;
		const hasIcsEvent = !!icsTask.icsEvent;
		debugInfo.push(`Has ICS event: ${hasIcsEvent}`);

		if (!hasIcsEvent) {
			debugInfo.push("❌ No ICS event - will not show as badge");
			return {
				isIcsTask,
				hasIcsEvent,
				hasSource: false,
				showType: undefined,
				shouldShowAsBadge: false,
				debugInfo,
			};
		}

		const hasSource = !!icsTask.icsEvent.source;
		debugInfo.push(`Has source: ${hasSource}`);

		if (!hasSource) {
			debugInfo.push("❌ No source - will not show as badge");
			return {
				isIcsTask,
				hasIcsEvent,
				hasSource,
				showType: undefined,
				shouldShowAsBadge: false,
				debugInfo,
			};
		}

		const showType = icsTask.icsEvent.source.showType;
		debugInfo.push(`Show type: ${showType}`);

		const shouldShowAsBadge = showType === "badge";
		if (shouldShowAsBadge) {
			debugInfo.push("✅ Should show as badge");
		} else {
			debugInfo.push(
				`❌ Show type is "${showType}", not "badge" - will not show as badge`
			);
		}

		return {
			isIcsTask,
			hasIcsEvent,
			hasSource,
			showType,
			shouldShowAsBadge,
			debugInfo,
		};
	}

	// Debug function to simulate getBadgeEventsForDate
	function debugGetBadgeEventsForDate(
		tasks: Task[],
		date: Date
	): {
		targetDate: string;
		badgeEvents: any[];
		debugInfo: string[];
		taskAnalysis: any[];
	} {
		const debugInfo: string[] = [];
		const taskAnalysis: any[] = [];

		const targetDate = moment(date).startOf("day");
		const targetDateStr = targetDate.format("YYYY-MM-DD");
		debugInfo.push(`Target date: ${targetDateStr}`);
		debugInfo.push(`Total tasks to check: ${tasks.length}`);

		const badgeEvents: Map<
			string,
			{
				sourceId: string;
				sourceName: string;
				count: number;
				color?: string;
			}
		> = new Map();

		tasks.forEach((task, index) => {
			const taskDebug = debugTaskBadgeStatus(task);
			taskAnalysis.push({
				taskIndex: index,
				taskId: task.id,
				...taskDebug,
			});

			if (taskDebug.shouldShowAsBadge) {
				const icsTask = task as IcsTask;
				const eventDate = moment(icsTask.icsEvent.dtstart).startOf(
					"day"
				);
				const eventDateStr = eventDate.format("YYYY-MM-DD");

				debugInfo.push(
					`Task ${index} (${task.id}): Event date ${eventDateStr}`
				);

				if (eventDate.isSame(targetDate)) {
					debugInfo.push(`✅ Task ${index} matches target date`);

					const sourceId = icsTask.icsEvent.source.id;
					const existing = badgeEvents.get(sourceId);

					if (existing) {
						existing.count++;
						debugInfo.push(
							`📈 Incremented count for source ${sourceId} to ${existing.count}`
						);
					} else {
						badgeEvents.set(sourceId, {
							sourceId: sourceId,
							sourceName: icsTask.icsEvent.source.name,
							count: 1,
							color: icsTask.icsEvent.source.color,
						});
						debugInfo.push(
							`🆕 Added new badge for source ${sourceId}`
						);
					}
				} else {
					debugInfo.push(
						`❌ Task ${index} date ${eventDateStr} does not match target ${targetDateStr}`
					);
				}
			}
		});

		const result = Array.from(badgeEvents.values());
		debugInfo.push(`Final badge count: ${result.length}`);

		return {
			targetDate: targetDateStr,
			badgeEvents: result,
			debugInfo,
			taskAnalysis,
		};
	}

	describe("Badge Detection Debug", () => {
		test("should debug badge task creation and detection", () => {
			console.log("=== Badge Debug Test ===");

			// Create test tasks
			const badgeTask = createBadgeTask(
				"test-calendar",
				"Test Calendar",
				new Date("2024-01-15T10:00:00Z")
			);
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

			const tasks = [badgeTask, regularTask];

			console.log("\n--- Task Analysis ---");
			tasks.forEach((task, index) => {
				console.log(`\nTask ${index} (${task.id}):`);
				const debug = debugTaskBadgeStatus(task);
				debug.debugInfo.forEach((info) => console.log(`  ${info}`));
			});

			console.log("\n--- Badge Events for 2024-01-15 ---");
			const targetDate = new Date("2024-01-15");
			const badgeDebug = debugGetBadgeEventsForDate(tasks, targetDate);

			console.log(`Target date: ${badgeDebug.targetDate}`);
			badgeDebug.debugInfo.forEach((info) => console.log(`  ${info}`));

			console.log("\nBadge events found:");
			badgeDebug.badgeEvents.forEach((badge, index) => {
				console.log(
					`  Badge ${index}: ${badge.sourceName} (${badge.count} events, color: ${badge.color})`
				);
			});

			// Assertions
			expect(badgeDebug.badgeEvents).toHaveLength(1);
			expect(badgeDebug.badgeEvents[0].sourceName).toBe("Test Calendar");
			expect(badgeDebug.badgeEvents[0].count).toBe(1);
		});

		test("should debug multiple badge sources", () => {
			console.log("\n=== Multiple Badge Sources Debug ===");

			const task1 = createBadgeTask(
				"calendar-1",
				"Calendar 1",
				new Date("2024-01-15T10:00:00Z"),
				"#ff6b6b"
			);
			const task2 = createBadgeTask(
				"calendar-2",
				"Calendar 2",
				new Date("2024-01-15T14:00:00Z"),
				"#4ecdc4"
			);
			const task3 = createBadgeTask(
				"calendar-1",
				"Calendar 1",
				new Date("2024-01-15T16:00:00Z"),
				"#ff6b6b"
			); // Same source as task1

			const tasks = [task1, task2, task3];

			console.log("\n--- Badge Events for 2024-01-15 ---");
			const badgeDebug = debugGetBadgeEventsForDate(
				tasks,
				new Date("2024-01-15")
			);

			badgeDebug.debugInfo.forEach((info) => console.log(`  ${info}`));

			console.log("\nFinal badge events:");
			badgeDebug.badgeEvents.forEach((badge, index) => {
				console.log(
					`  Badge ${index}: ${badge.sourceName} (${badge.count} events, color: ${badge.color})`
				);
			});

			// Assertions
			expect(badgeDebug.badgeEvents).toHaveLength(2);

			const calendar1Badge = badgeDebug.badgeEvents.find(
				(b) => b.sourceId === "calendar-1"
			);
			const calendar2Badge = badgeDebug.badgeEvents.find(
				(b) => b.sourceId === "calendar-2"
			);

			expect(calendar1Badge).toBeDefined();
			expect(calendar1Badge!.count).toBe(2); // Should aggregate

			expect(calendar2Badge).toBeDefined();
			expect(calendar2Badge!.count).toBe(1);
		});

		test("should debug date mismatch scenarios", () => {
			console.log("\n=== Date Mismatch Debug ===");

			const task1 = createBadgeTask(
				"calendar-1",
				"Calendar 1",
				new Date("2024-01-15T10:00:00Z")
			);
			const task2 = createBadgeTask(
				"calendar-2",
				"Calendar 2",
				new Date("2024-01-16T10:00:00Z")
			); // Different date

			const tasks = [task1, task2];

			console.log("\n--- Badge Events for 2024-01-15 ---");
			const badgeDebug = debugGetBadgeEventsForDate(
				tasks,
				new Date("2024-01-15")
			);

			badgeDebug.debugInfo.forEach((info) => console.log(`  ${info}`));

			console.log("\nTask analysis:");
			badgeDebug.taskAnalysis.forEach((analysis, index) => {
				console.log(
					`  Task ${index}: ${
						analysis.shouldShowAsBadge ? "✅" : "❌"
					} Should show as badge`
				);
			});

			// Should only find one badge (for 2024-01-15)
			expect(badgeDebug.badgeEvents).toHaveLength(1);
			expect(badgeDebug.badgeEvents[0].sourceId).toBe("calendar-1");
		});

		test("should debug common badge issues", () => {
			console.log("\n=== Common Badge Issues Debug ===");

			// Issue 1: Wrong showType
			const wrongShowTypeSource: IcsSource = {
				id: "wrong-type",
				name: "Wrong Type Calendar",
				url: "https://example.com/wrong.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "event", // Should be "badge"
				color: "#ff6b6b",
			};

			const wrongTypeTask = createBadgeTask(
				"wrong-type",
				"Wrong Type Calendar",
				new Date("2024-01-15T10:00:00Z")
			);
			(wrongTypeTask as any).icsEvent.source.showType = "event"; // Override to wrong type

			// Issue 2: Missing source
			const missingSourceTask = createBadgeTask(
				"missing-source",
				"Missing Source Calendar",
				new Date("2024-01-15T10:00:00Z")
			);
			delete (missingSourceTask as any).icsEvent.source;

			// Issue 3: Missing icsEvent
			const missingEventTask = createBadgeTask(
				"missing-event",
				"Missing Event Calendar",
				new Date("2024-01-15T10:00:00Z")
			);
			delete (missingEventTask as any).icsEvent;

			// Issue 4: Not ICS task
			const notIcsTask: Task = {
				id: "not-ics",
				content: "Not ICS Task",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Not ICS Task",
				metadata: {
					tags: [],
					children: [],
					dueDate: new Date("2024-01-15").getTime(),
					heading: [],
				},
			};

			const tasks = [
				wrongTypeTask,
				missingSourceTask,
				missingEventTask,
				notIcsTask,
			];

			console.log("\n--- Debugging Common Issues ---");
			tasks.forEach((task, index) => {
				console.log(`\nTask ${index} (${task.id}):`);
				const debug = debugTaskBadgeStatus(task);
				debug.debugInfo.forEach((info) => console.log(`  ${info}`));
			});

			const badgeDebug = debugGetBadgeEventsForDate(
				tasks,
				new Date("2024-01-15")
			);

			console.log("\nOverall result:");
			badgeDebug.debugInfo.forEach((info) => console.log(`  ${info}`));

			// None of these should produce badges
			expect(badgeDebug.badgeEvents).toHaveLength(0);
		});
	});

	describe("Badge Rendering Debug", () => {
		test("should provide debugging output for badge rendering", () => {
			console.log("\n=== Badge Rendering Debug Guide ===");
			console.log("\nTo debug badge rendering issues:");
			console.log(
				"1. Check if tasks are properly identified as badge events"
			);
			console.log("2. Verify getBadgeEventsForDate returns correct data");
			console.log("3. Ensure badge containers are created in DOM");
			console.log("4. Check if badge elements are properly styled");
			console.log("\nCommon issues:");
			console.log("- ICS source showType is not 'badge'");
			console.log("- Event date doesn't match target date");
			console.log("- Missing icsEvent or source properties");
			console.log("- CSS styles not loaded or overridden");
			console.log("- getBadgeEventsForDate function not passed to view");

			// This test always passes, it's just for documentation
			expect(true).toBe(true);
		});
	});
});
