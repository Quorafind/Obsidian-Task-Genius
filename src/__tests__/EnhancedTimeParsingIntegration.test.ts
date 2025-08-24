/**
 * Enhanced Time Parsing Integration Tests
 * 
 * Tests for cross-component functionality including:
 * - End-to-end flow from task creation to timeline display
 * - Time component preservation across task updates
 * - Backward compatibility with existing tasks without time information
 * - ICS event integration with enhanced time parsing
 */

import { TimeParsingService, DEFAULT_TIME_PARSING_CONFIG } from "../services/time-parsing-service";
import { FileTaskManagerImpl } from "../managers/file-task-manager";
import { IcsManager } from "../managers/ics-manager";
import { IcsParser } from "../parsers/ics-parser";
import { TaskMigrationService } from "../services/task-migration-service";
import type {
	TimeComponent,
	EnhancedParsedTimeResult,
	EnhancedTimeExpression,
	EnhancedTimeParsingConfig,
	EnhancedStandardTaskMetadata,
} from "../types/time-parsing";
import type { Task, StandardTaskMetadata } from "../types/task";
import type { IcsSource, IcsManagerConfig } from "../types/ics";
import { App } from "obsidian";

// Mock Obsidian App
const mockApp = {
	vault: {
		getFileByPath: jest.fn(),
		read: jest.fn(),
		modify: jest.fn(),
	},
	fileManager: {
		renameFile: jest.fn(),
	},
} as unknown as App;

// Mock plugin settings
const mockPluginSettings = {
	taskStatusMarks: {
		"Not Started": " ",
		"In Progress": "/",
		Completed: "x",
		Abandoned: "-",
		Planned: "?",
	},
} as any;

// Mock BasesEntry for file task testing
interface MockBasesEntry {
	ctx: any;
	file: {
		parent: any;
		deleted: boolean;
		vault: any;
		path: string;
		name: string;
		extension: string;
		getShortName(): string;
	};
	formulas: Record<string, any>;
	implicit: {
		file: any;
		name: string;
		path: string;
		folder: string;
		ext: string;
	};
	lazyEvalCache: Record<string, any>;
	properties: Record<string, any>;
	getValue(prop: { type: "property" | "file" | "formula"; name: string }): any;
	updateProperty(key: string, value: any): void;
	getFormulaValue(formula: string): any;
	getPropertyKeys(): string[];
}

// Mock TimelineEvent interface for testing
interface MockTimelineEvent {
	id: string;
	title: string;
	date: Date;
	task?: Task;
	timeInfo?: {
		primaryTime: Date;
		endTime?: Date;
		isRange: boolean;
		timeComponent?: TimeComponent;
		displayFormat: "time-only" | "date-time" | "range";
	};
}

describe("Enhanced Time Parsing Integration Tests", () => {
	let timeParsingService: TimeParsingService;
	let fileTaskManager: FileTaskManagerImpl;
	let icsManager: IcsManager;
	let migrationService: TaskMigrationService;

	beforeEach(() => {
		// Initialize services with enhanced configuration
		const enhancedConfig: EnhancedTimeParsingConfig = {
			...DEFAULT_TIME_PARSING_CONFIG,
			timePatterns: {
				singleTime: [
					/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/,
					/\b(1[0-2]|0?[1-9]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)\b/,
				],
				timeRange: [
					/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*[-~\uff5e]\s*([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/,
				],
				rangeSeparators: ["-", "~", "\uff5e", " - ", " ~ "],
			},
			timeDefaults: {
				preferredFormat: "24h",
				defaultPeriod: "PM",
				midnightCrossing: "next-day",
			},
		};

		timeParsingService = new TimeParsingService(enhancedConfig);
		fileTaskManager = new FileTaskManagerImpl(mockApp, undefined, timeParsingService);
		migrationService = new TaskMigrationService();

		// Initialize ICS manager
		const testSource: IcsSource = {
			id: "integration-test",
			name: "Integration Test Calendar",
			url: "https://example.com/test.ics",
			enabled: true,
			refreshInterval: 60,
			showAllDayEvents: true,
			showTimedEvents: true,
			showType: "event",
		};

		const icsConfig: IcsManagerConfig = {
			sources: [testSource],
			globalRefreshInterval: 60,
			maxCacheAge: 24,
			enableBackgroundRefresh: false,
			networkTimeout: 30,
			maxEventsPerSource: 1000,
			showInCalendar: true,
			showInTaskLists: true,
			defaultEventColor: "#3498db",
		};

		icsManager = new IcsManager(icsConfig, mockPluginSettings, undefined, timeParsingService);
	});

	describe("End-to-End Flow: Task Creation to Timeline Display", () => {
		test("should handle complete flow from file task creation to timeline rendering", () => {
			// Step 1: Create file task with time information
			const mockEntry: MockBasesEntry = {
				ctx: {},
				file: {
					parent: null,
					deleted: false,
					vault: null,
					path: "meeting.md",
					name: "meeting.md",
					extension: "md",
					getShortName: () => "meeting",
				},
				formulas: {},
				implicit: {
					file: null,
					name: "meeting",
					path: "meeting.md",
					folder: "",
					ext: "md",
				},
				lazyEvalCache: {},
				properties: {
					title: "Team meeting 14:00-16:00 tomorrow",
					status: " ",
					completed: false,
					due: "2025-08-25",
				},
				getValue: jest.fn((prop) => {
					if (prop.name === "title") return "Team meeting 14:00-16:00 tomorrow";
					if (prop.name === "status") return " ";
					if (prop.name === "completed") return false;
					if (prop.name === "due") return "2025-08-25";
					return undefined;
				}),
				updateProperty: jest.fn(),
				getFormulaValue: jest.fn(),
				getPropertyKeys: jest.fn(() => ["title", "status", "completed", "due"]),
			};

			// Step 2: Convert to file task (simulates task parsing)
			const fileTask = fileTaskManager.entryToFileTask(mockEntry);
			
			// Verify task has enhanced metadata
			expect(fileTask.content).toBe("Team meeting 14:00-16:00 tomorrow");
			expect(fileTask.metadata.timeComponents).toBeDefined();
			expect(fileTask.metadata.timeComponents?.startTime?.hour).toBe(14);
			expect(fileTask.metadata.timeComponents?.endTime?.hour).toBe(16);
			expect(fileTask.metadata.enhancedDates?.startDateTime).toBeDefined();
			expect(fileTask.metadata.enhancedDates?.endDateTime).toBeDefined();

			// Step 3: Create timeline event from task (simulates timeline view processing)
			const timelineEvent: MockTimelineEvent = {
				id: fileTask.id,
				title: fileTask.content,
				date: new Date(fileTask.metadata.dueDate!),
				task: fileTask,
				timeInfo: {
					primaryTime: fileTask.metadata.enhancedDates!.startDateTime!,
					endTime: fileTask.metadata.enhancedDates!.endDateTime,
					isRange: true,
					timeComponent: fileTask.metadata.timeComponents!.startTime,
					displayFormat: "range",
				},
			};

			// Step 4: Verify timeline event has correct time information
			expect(timelineEvent.timeInfo?.primaryTime.getHours()).toBe(14);
			expect(timelineEvent.timeInfo?.endTime?.getHours()).toBe(16);
			expect(timelineEvent.timeInfo?.isRange).toBe(true);
			expect(timelineEvent.timeInfo?.displayFormat).toBe("range");

			// Step 5: Verify timeline sorting would work correctly
			const anotherEvent: MockTimelineEvent = {
				id: "another-event",
				title: "Earlier meeting",
				date: new Date(fileTask.metadata.dueDate!),
				timeInfo: {
					primaryTime: new Date(2025, 7, 25, 9, 0), // 9:00 AM same day
					isRange: false,
					displayFormat: "time-only",
				},
			};

			const events = [timelineEvent, anotherEvent].sort((a, b) => 
				a.timeInfo!.primaryTime.getTime() - b.timeInfo!.primaryTime.getTime()
			);

			expect(events[0].title).toBe("Earlier meeting");
			expect(events[1].title).toBe("Team meeting 14:00-16:00 tomorrow");
		});

		test("should handle inline task creation with time components", () => {
			// Simulate inline task parsing
			const inlineTaskText = "- [ ] Call client at 3:30 PM 📅 2025-08-25";
			
			// Parse time components from inline task
			const parseResult = timeParsingService.parseTimeExpressions(inlineTaskText) as EnhancedParsedTimeResult;
			
			expect(parseResult.timeComponents.scheduledTime).toBeDefined();
			expect(parseResult.timeComponents.scheduledTime?.hour).toBe(15);
			expect(parseResult.timeComponents.scheduledTime?.minute).toBe(30);

			// Create task from parsed result
			const inlineTask: Task<EnhancedStandardTaskMetadata> = {
				id: "inline-task-1",
				content: "Call client at 3:30 PM",
				filePath: "notes.md",
				line: 5,
				completed: false,
				status: " ",
				originalMarkdown: inlineTaskText,
				metadata: {
					dueDate: new Date("2025-08-25").getTime(),
					timeComponents: parseResult.timeComponents,
					enhancedDates: {
						dueDateTime: new Date(2025, 7, 25, 15, 30), // Combine date + time
					},
					tags: [],
					children: [],
				},
			};

			// Verify enhanced metadata
			expect(inlineTask.metadata.timeComponents?.scheduledTime?.hour).toBe(15);
			expect(inlineTask.metadata.enhancedDates?.dueDateTime?.getHours()).toBe(15);
			expect(inlineTask.metadata.enhancedDates?.dueDateTime?.getMinutes()).toBe(30);

			// Create timeline event
			const timelineEvent: MockTimelineEvent = {
				id: inlineTask.id,
				title: inlineTask.content,
				date: new Date(inlineTask.metadata.dueDate!),
				task: inlineTask,
				timeInfo: {
					primaryTime: inlineTask.metadata.enhancedDates!.dueDateTime!,
					isRange: false,
					timeComponent: inlineTask.metadata.timeComponents!.scheduledTime,
					displayFormat: "date-time",
				},
			};

			expect(timelineEvent.timeInfo?.primaryTime.getHours()).toBe(15);
			expect(timelineEvent.timeInfo?.primaryTime.getMinutes()).toBe(30);
		});
	});

	describe("Time Component Preservation Across Task Updates", () => {
		test("should preserve time components when updating task content", async () => {
			// Create initial task with time
			const mockEntry: MockBasesEntry = {
				ctx: {},
				file: {
					parent: null,
					deleted: false,
					vault: null,
					path: "appointment.md",
					name: "appointment.md",
					extension: "md",
					getShortName: () => "appointment",
				},
				formulas: {},
				implicit: {
					file: null,
					name: "appointment",
					path: "appointment.md",
					folder: "",
					ext: "md",
				},
				lazyEvalCache: {},
				properties: {
					title: "Doctor appointment at 2:00 PM",
					status: " ",
					completed: false,
				},
				getValue: jest.fn((prop) => {
					if (prop.name === "title") return "Doctor appointment at 2:00 PM";
					if (prop.name === "status") return " ";
					if (prop.name === "completed") return false;
					return undefined;
				}),
				updateProperty: jest.fn(),
				getFormulaValue: jest.fn(),
				getPropertyKeys: jest.fn(() => ["title", "status", "completed"]),
			};

			const originalTask = fileTaskManager.entryToFileTask(mockEntry);
			
			// Verify original time component
			expect(originalTask.metadata.timeComponents?.scheduledTime?.hour).toBe(14);

			// Update task content with new time
			await fileTaskManager.updateFileTask(originalTask, {
				content: "Doctor appointment at 4:30 PM",
			});

			// Verify time component was updated
			expect(originalTask.metadata.timeComponents?.scheduledTime?.hour).toBe(16);
			expect(originalTask.metadata.timeComponents?.scheduledTime?.minute).toBe(30);
		});

		test("should preserve time components when completing tasks", () => {
			// Create task with time range
			const taskWithTime: Task<EnhancedStandardTaskMetadata> = {
				id: "workshop-task",
				content: "Workshop 9:00-17:00",
				filePath: "events.md",
				line: 1,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Workshop 9:00-17:00",
				metadata: {
					timeComponents: {
						startTime: {
							hour: 9,
							minute: 0,
							originalText: "9:00",
							isRange: true,
						},
						endTime: {
							hour: 17,
							minute: 0,
							originalText: "17:00",
							isRange: true,
						},
					},
					enhancedDates: {
						startDateTime: new Date(2025, 7, 25, 9, 0),
						endDateTime: new Date(2025, 7, 25, 17, 0),
					},
					tags: [],
					children: [],
				},
			};

			// Complete the task
			const completedTask = {
				...taskWithTime,
				completed: true,
				status: "x",
				metadata: {
					...taskWithTime.metadata,
					completedDate: Date.now(),
				},
			};

			// Verify time components are preserved
			expect(completedTask.metadata.timeComponents?.startTime?.hour).toBe(9);
			expect(completedTask.metadata.timeComponents?.endTime?.hour).toBe(17);
			expect(completedTask.metadata.enhancedDates?.startDateTime?.getHours()).toBe(9);
			expect(completedTask.metadata.enhancedDates?.endDateTime?.getHours()).toBe(17);
		});

		test("should handle task status changes while preserving time data", () => {
			const taskWithTime: Task<EnhancedStandardTaskMetadata> = {
				id: "status-change-task",
				content: "Meeting at 3:00 PM",
				filePath: "tasks.md",
				line: 2,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Meeting at 3:00 PM",
				metadata: {
					timeComponents: {
						scheduledTime: {
							hour: 15,
							minute: 0,
							originalText: "3:00 PM",
							isRange: false,
						},
					},
					enhancedDates: {
						scheduledDateTime: new Date(2025, 7, 25, 15, 0),
					},
					tags: [],
					children: [],
				},
			};

			// Change status to in-progress
			const inProgressTask = {
				...taskWithTime,
				status: "/",
			};

			// Change status to completed
			const completedTask = {
				...inProgressTask,
				completed: true,
				status: "x",
				metadata: {
					...inProgressTask.metadata,
					completedDate: Date.now(),
				},
			};

			// Verify time components preserved through all status changes
			expect(inProgressTask.metadata.timeComponents?.scheduledTime?.hour).toBe(15);
			expect(completedTask.metadata.timeComponents?.scheduledTime?.hour).toBe(15);
			expect(completedTask.metadata.enhancedDates?.scheduledDateTime?.getHours()).toBe(15);
		});
	});

	describe("Backward Compatibility with Existing Tasks", () => {
		test("should handle existing tasks without time information", () => {
			// Create legacy task without time components
			const legacyTask: Task<StandardTaskMetadata> = {
				id: "legacy-task",
				content: "Legacy task without time",
				filePath: "old-tasks.md",
				line: 1,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Legacy task without time",
				metadata: {
					dueDate: new Date("2025-08-25").getTime(),
					tags: [],
					children: [],
				},
			};

			// Migrate to enhanced metadata
			const migratedTask = migrationService.migrateTaskToEnhanced(legacyTask);

			// Should preserve all original data
			expect(migratedTask.id).toBe(legacyTask.id);
			expect(migratedTask.content).toBe(legacyTask.content);
			expect(migratedTask.metadata.dueDate).toBe(legacyTask.metadata.dueDate);
			expect(migratedTask.metadata.tags).toEqual(legacyTask.metadata.tags);

			// Should not have time components (no time in content)
			expect(migratedTask.metadata.timeComponents).toBeUndefined();
			expect(migratedTask.metadata.enhancedDates).toBeUndefined();
		});

		test("should migrate existing tasks with parseable time information", () => {
			// Create legacy task with time in content but no time components
			const legacyTaskWithTime: Task<StandardTaskMetadata> = {
				id: "legacy-with-time",
				content: "Meeting at 2:30 PM tomorrow",
				filePath: "old-tasks.md",
				line: 2,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Meeting at 2:30 PM tomorrow",
				metadata: {
					dueDate: new Date("2025-08-25").getTime(),
					tags: [],
					children: [],
				},
			};

			// Migrate to enhanced metadata
			const migratedTask = migrationService.migrateTaskToEnhanced(legacyTaskWithTime);

			// Should preserve original data
			expect(migratedTask.content).toBe(legacyTaskWithTime.content);
			expect(migratedTask.metadata.dueDate).toBe(legacyTaskWithTime.metadata.dueDate);

			// Should add time components from parsing
			expect(migratedTask.metadata.timeComponents).toBeDefined();
			expect(migratedTask.metadata.timeComponents?.scheduledTime?.hour).toBe(14);
			expect(migratedTask.metadata.timeComponents?.scheduledTime?.minute).toBe(30);

			// Should create enhanced datetime
			expect(migratedTask.metadata.enhancedDates?.scheduledDateTime).toBeDefined();
		});

		test("should handle mixed task collections (with and without time)", () => {
			const mixedTasks: Task[] = [
				{
					id: "no-time-task",
					content: "Simple task",
					filePath: "tasks.md",
					line: 1,
					completed: false,
					status: " ",
					originalMarkdown: "- [ ] Simple task",
					metadata: { tags: [], children: [] },
				},
				{
					id: "with-time-task",
					content: "Meeting at 3:00 PM",
					filePath: "tasks.md",
					line: 2,
					completed: false,
					status: " ",
					originalMarkdown: "- [ ] Meeting at 3:00 PM",
					metadata: { tags: [], children: [] },
				},
			];

			// Migrate all tasks
			const migratedTasks = mixedTasks.map(task => 
				migrationService.migrateTaskToEnhanced(task)
			);

			// First task should not have time components
			expect(migratedTasks[0].metadata.timeComponents).toBeUndefined();

			// Second task should have time components
			expect(migratedTasks[1].metadata.timeComponents?.scheduledTime?.hour).toBe(15);

			// Both should be valid enhanced tasks
			expect(migratedTasks[0].id).toBe("no-time-task");
			expect(migratedTasks[1].id).toBe("with-time-task");
		});
	});

	describe("ICS Event Integration with Enhanced Time Parsing", () => {
		test("should preserve ICS time information while applying enhanced parsing", () => {
			const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Integration Test//EN
BEGIN:VEVENT
UID:meeting-with-description@example.com
DTSTART:20250825T140000Z
DTEND:20250825T160000Z
SUMMARY:Team Meeting
DESCRIPTION:Daily standup from 2:00 PM to 4:00 PM with break at 3:00-3:15
LOCATION:Conference Room
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

			const testSource = icsManager.getConfig().sources[0];
			const parseResult = IcsParser.parse(icsData, testSource);
			
			expect(parseResult.events).toHaveLength(1);

			// Convert to tasks
			const tasks = icsManager.convertEventsToTasks(parseResult.events);
			expect(tasks).toHaveLength(1);

			const task = tasks[0];
			const metadata = task.metadata as EnhancedStandardTaskMetadata;

			// Should have original ICS time information
			expect(task.icsEvent).toBeDefined();
			expect(task.icsEvent?.start).toBeDefined();
			expect(task.icsEvent?.end).toBeDefined();

			// Should have enhanced time components from ICS times
			expect(metadata.timeComponents).toBeDefined();
			expect(metadata.timeComponents?.startTime?.hour).toBe(14);
			expect(metadata.timeComponents?.endTime?.hour).toBe(16);

			// Should also parse time from description
			expect(metadata.enhancedDates?.startDateTime).toBeDefined();
			expect(metadata.enhancedDates?.endDateTime).toBeDefined();
		});

		test("should handle ICS all-day events with time parsing from description", () => {
			const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//All Day Test//EN
BEGIN:VEVENT
UID:allday-with-time@example.com
DTSTART;VALUE=DATE:20250825
DTEND;VALUE=DATE:20250826
SUMMARY:Conference Day
DESCRIPTION:Conference starts at 9:00 AM and ends at 5:00 PM with lunch 12:00-13:00
LOCATION:Convention Center
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

			const testSource = icsManager.getConfig().sources[0];
			const parseResult = IcsParser.parse(icsData, testSource);
			const tasks = icsManager.convertEventsToTasks(parseResult.events);
			
			const task = tasks[0];
			const metadata = task.metadata as EnhancedStandardTaskMetadata;

			// Should be all-day event
			expect(task.icsEvent?.allDay).toBe(true);

			// Should have time components parsed from description
			expect(metadata.timeComponents).toBeDefined();
			// Should find the first time mentioned (9:00 AM)
			const timeComponent = metadata.timeComponents?.startTime || metadata.timeComponents?.scheduledTime;
			expect(timeComponent?.hour).toBe(9);
		});

		test("should handle ICS events with time in location field", () => {
			const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Location Time Test//EN
BEGIN:VEVENT
UID:location-time@example.com
DTSTART;VALUE=DATE:20250825
SUMMARY:Dinner Event
DESCRIPTION:Team dinner
LOCATION:Restaurant at 7:30 PM, 123 Main St
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

			const testSource = icsManager.getConfig().sources[0];
			const parseResult = IcsParser.parse(icsData, testSource);
			const tasks = icsManager.convertEventsToTasks(parseResult.events);
			
			const task = tasks[0];
			const metadata = task.metadata as EnhancedStandardTaskMetadata;

			// Should parse time from location field
			expect(metadata.timeComponents).toBeDefined();
			const timeComponent = metadata.timeComponents?.scheduledTime || metadata.timeComponents?.dueTime;
			expect(timeComponent?.hour).toBe(19); // 7:30 PM
			expect(timeComponent?.minute).toBe(30);
		});

		test("should maintain ICS event compatibility after time enhancement", () => {
			const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Compatibility Test//EN
BEGIN:VEVENT
UID:compatibility@example.com
DTSTART:20250825T100000Z
DTEND:20250825T110000Z
SUMMARY:Compatibility Test
DESCRIPTION:Test event for compatibility
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

			const testSource = icsManager.getConfig().sources[0];
			const parseResult = IcsParser.parse(icsData, testSource);
			const tasks = icsManager.convertEventsToTasks(parseResult.events);
			
			const task = tasks[0];

			// Should maintain all ICS properties
			expect(task.readonly).toBe(true);
			expect(task.source.type).toBe("ics");
			expect(task.filePath).toBe("ics://Integration Test Calendar");
			expect(task.icsEvent).toBeDefined();
			expect(task.icsEvent?.uid).toBe("compatibility@example.com");

			// Should have enhanced metadata
			const metadata = task.metadata as EnhancedStandardTaskMetadata;
			expect(metadata.timeComponents).toBeDefined();
			expect(metadata.enhancedDates).toBeDefined();

			// Should maintain original timestamps for compatibility
			expect(metadata.startDate).toBeDefined();
			expect(metadata.project).toBe("Integration Test Calendar");
		});
	});

	describe("Performance and Error Handling", () => {
		test("should handle large numbers of tasks efficiently", () => {
			const startTime = Date.now();
			const taskCount = 100;
			
			// Create many tasks with time information
			const tasks: Task[] = [];
			for (let i = 0; i < taskCount; i++) {
				const task: Task = {
					id: `perf-task-${i}`,
					content: `Task ${i} at ${9 + (i % 8)}:${(i % 4) * 15} AM`,
					filePath: "performance-test.md",
					line: i,
					completed: false,
					status: " ",
					originalMarkdown: `- [ ] Task ${i} at ${9 + (i % 8)}:${(i % 4) * 15} AM`,
					metadata: { tags: [], children: [] },
				};
				tasks.push(task);
			}

			// Migrate all tasks
			const migratedTasks = tasks.map(task => 
				migrationService.migrateTaskToEnhanced(task)
			);

			const endTime = Date.now();
			const duration = endTime - startTime;

			// Should complete within reasonable time (adjust threshold as needed)
			expect(duration).toBeLessThan(5000); // 5 seconds
			expect(migratedTasks).toHaveLength(taskCount);

			// Verify some tasks have time components
			const tasksWithTime = migratedTasks.filter(t => t.metadata.timeComponents);
			expect(tasksWithTime.length).toBeGreaterThan(0);
		});

		test("should handle parsing errors gracefully in integration", () => {
			// Create tasks with various problematic content
			const problematicTasks: Task[] = [
				{
					id: "invalid-time-1",
					content: "Meeting at 25:99",
					filePath: "errors.md",
					line: 1,
					completed: false,
					status: " ",
					originalMarkdown: "- [ ] Meeting at 25:99",
					metadata: { tags: [], children: [] },
				},
				{
					id: "malformed-range",
					content: "Workshop 12:00--15:00",
					filePath: "errors.md",
					line: 2,
					completed: false,
					status: " ",
					originalMarkdown: "- [ ] Workshop 12:00--15:00",
					metadata: { tags: [], children: [] },
				},
				{
					id: "empty-content",
					content: "",
					filePath: "errors.md",
					line: 3,
					completed: false,
					status: " ",
					originalMarkdown: "- [ ] ",
					metadata: { tags: [], children: [] },
				},
			];

			// Should not throw errors during migration
			expect(() => {
				const migratedTasks = problematicTasks.map(task => 
					migrationService.migrateTaskToEnhanced(task)
				);

				// All tasks should be migrated (even if without time components)
				expect(migratedTasks).toHaveLength(3);

				// Tasks with invalid time should not have time components
				expect(migratedTasks[0].metadata.timeComponents).toBeUndefined();
				expect(migratedTasks[1].metadata.timeComponents).toBeUndefined();
				expect(migratedTasks[2].metadata.timeComponents).toBeUndefined();

				// But should preserve other metadata
				expect(migratedTasks[0].id).toBe("invalid-time-1");
				expect(migratedTasks[1].id).toBe("malformed-range");
				expect(migratedTasks[2].id).toBe("empty-content");
			}).not.toThrow();
		});
	});
});