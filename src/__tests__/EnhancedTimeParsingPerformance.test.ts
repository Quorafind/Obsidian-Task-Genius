/**
 * Enhanced Time Parsing Performance Tests
 * 
 * Tests for:
 * - Time parsing performance impact on task creation
 * - Memory usage with enhanced metadata structures
 * - Timeline rendering performance with time components
 * - Performance regression tests
 */

import { TimeParsingService, DEFAULT_TIME_PARSING_CONFIG } from "../services/time-parsing-service";
import { FileTaskManagerImpl } from "../managers/file-task-manager";
import { TaskMigrationService } from "../services/task-migration-service";
import type {
	TimeComponent,
	EnhancedParsedTimeResult,
	EnhancedTimeParsingConfig,
	EnhancedStandardTaskMetadata,
} from "../types/time-parsing";
import type { Task, StandardTaskMetadata } from "../types/task";
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

// Mock BasesEntry for performance testing
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

// Mock TimelineEvent for performance testing
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

describe("Enhanced Time Parsing Performance Tests", () => {
	let timeParsingService: TimeParsingService;
	let enhancedTimeParsingService: TimeParsingService;
	let fileTaskManager: FileTaskManagerImpl;
	let migrationService: TaskMigrationService;

	beforeEach(() => {
		// Standard configuration
		timeParsingService = new TimeParsingService(DEFAULT_TIME_PARSING_CONFIG);
		
		// Enhanced configuration for comparison
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

		enhancedTimeParsingService = new TimeParsingService(enhancedConfig);
		fileTaskManager = new FileTaskManagerImpl(mockApp, undefined, enhancedTimeParsingService);
		migrationService = new TaskMigrationService();
	});

	describe("Time Parsing Performance Impact", () => {
		test("should parse single time expressions efficiently", () => {
			const testCases = [
				"Meeting at 2:30 PM",
				"Call at 14:00",
				"Lunch at 12:00:00",
				"Event at 9:15 AM",
				"Task at 23:45",
			];

			// Benchmark standard parsing
			const startTime1 = performance.now();
			for (let i = 0; i < 1000; i++) {
				testCases.forEach(testCase => {
					timeParsingService.parseTimeExpressions(testCase);
				});
			}
			const endTime1 = performance.now();
			const standardTime = endTime1 - startTime1;

			// Benchmark enhanced parsing
			const startTime2 = performance.now();
			for (let i = 0; i < 1000; i++) {
				testCases.forEach(testCase => {
					enhancedTimeParsingService.parseTimeExpressions(testCase);
				});
			}
			const endTime2 = performance.now();
			const enhancedTime = endTime2 - startTime2;

			console.log(`Standard parsing (5000 iterations): ${standardTime.toFixed(2)}ms`);
			console.log(`Enhanced parsing (5000 iterations): ${enhancedTime.toFixed(2)}ms`);
			console.log(`Performance overhead: ${((enhancedTime / standardTime - 1) * 100).toFixed(1)}%`);

			// Enhanced parsing should not be more than 50% slower
			expect(enhancedTime).toBeLessThan(standardTime * 1.5);
			
			// Should complete within reasonable time
			expect(enhancedTime).toBeLessThan(1000); // 1 second for 5000 iterations
		});

		test("should parse time ranges efficiently", () => {
			const timeRanges = [
				"Meeting 9:00-17:00",
				"Workshop 14:30-16:45",
				"Event 10:00 AM - 2:00 PM",
				"Session 08:15~12:30",
				"Conference 9:00:00-17:30:00",
			];

			const startTime = performance.now();
			for (let i = 0; i < 1000; i++) {
				timeRanges.forEach(range => {
					const result = enhancedTimeParsingService.parseTimeExpressions(range) as EnhancedParsedTimeResult;
					// Access time components to ensure they're computed
					if (result.timeComponents.startTime && result.timeComponents.endTime) {
						// Simulate accessing the data
						const startHour = result.timeComponents.startTime.hour;
						const endHour = result.timeComponents.endTime.hour;
					}
				});
			}
			const endTime = performance.now();
			const parseTime = endTime - startTime;

			console.log(`Time range parsing (5000 iterations): ${parseTime.toFixed(2)}ms`);
			console.log(`Average per range: ${(parseTime / 5000).toFixed(3)}ms`);

			// Should complete within reasonable time
			expect(parseTime).toBeLessThan(2000); // 2 seconds for 5000 iterations
		});

		test("should handle complex time expressions efficiently", () => {
			const complexExpressions = [
				"Meeting tomorrow at 2:30 PM with break 3:00-3:15",
				"Workshop next week 9:00-17:00 with lunch 12:00~13:00",
				"Conference starts at 8:00 AM and ends at 6:00 PM on Friday",
				"Daily standup at 9:15 AM every weekday",
				"Appointment scheduled for 3:45 PM next Tuesday",
			];

			const startTime = performance.now();
			for (let i = 0; i < 500; i++) {
				complexExpressions.forEach(expression => {
					const result = enhancedTimeParsingService.parseTimeExpressions(expression) as EnhancedParsedTimeResult;
					// Access all parsed data
					if (result.timeComponents) {
						Object.values(result.timeComponents).forEach(component => {
							if (component) {
								const hour = component.hour;
								const minute = component.minute;
							}
						});
					}
				});
			}
			const endTime = performance.now();
			const parseTime = endTime - startTime;

			console.log(`Complex expression parsing (2500 iterations): ${parseTime.toFixed(2)}ms`);
			console.log(`Average per expression: ${(parseTime / 2500).toFixed(3)}ms`);

			// Should complete within reasonable time
			expect(parseTime).toBeLessThan(3000); // 3 seconds for 2500 iterations
		});

		test("should benefit from caching on repeated parsing", () => {
			const testExpression = "Meeting at 2:30 PM tomorrow";

			// First parse (no cache)
			const startTime1 = performance.now();
			for (let i = 0; i < 1000; i++) {
				enhancedTimeParsingService.parseTimeExpressions(testExpression);
			}
			const endTime1 = performance.now();
			const firstParseTime = endTime1 - startTime1;

			// Second parse (with cache)
			const startTime2 = performance.now();
			for (let i = 0; i < 1000; i++) {
				enhancedTimeParsingService.parseTimeExpressions(testExpression);
			}
			const endTime2 = performance.now();
			const cachedParseTime = endTime2 - startTime2;

			console.log(`First parse (1000 iterations): ${firstParseTime.toFixed(2)}ms`);
			console.log(`Cached parse (1000 iterations): ${cachedParseTime.toFixed(2)}ms`);
			console.log(`Cache speedup: ${(firstParseTime / cachedParseTime).toFixed(2)}x`);

			// Cached parsing should be significantly faster
			expect(cachedParseTime).toBeLessThan(firstParseTime * 0.5);
		});
	});

	describe("Task Creation Performance Impact", () => {
		test("should create file tasks with time components efficiently", () => {
			const createMockEntry = (index: number): MockBasesEntry => ({
				ctx: {},
				file: {
					parent: null,
					deleted: false,
					vault: null,
					path: `task-${index}.md`,
					name: `task-${index}.md`,
					extension: "md",
					getShortName: () => `task-${index}`,
				},
				formulas: {},
				implicit: {
					file: null,
					name: `task-${index}`,
					path: `task-${index}.md`,
					folder: "",
					ext: "md",
				},
				lazyEvalCache: {},
				properties: {
					title: `Task ${index} at ${9 + (index % 8)}:${(index % 4) * 15} AM`,
					status: " ",
					completed: false,
				},
				getValue: jest.fn((prop: any) => {
					if (prop.name === "title") return `Task ${index} at ${9 + (index % 8)}:${(index % 4) * 15} AM`;
					if (prop.name === "status") return " ";
					if (prop.name === "completed") return false;
					return undefined;
				}),
				updateProperty: jest.fn(),
				getFormulaValue: jest.fn(),
				getPropertyKeys: jest.fn(() => ["title", "status", "completed"]),
			});

			// Create file task manager without time parsing for comparison
			const fileTaskManagerNoTime = new FileTaskManagerImpl(mockApp);

			const taskCount = 1000;
			const mockEntries = Array.from({ length: taskCount }, (_, i) => createMockEntry(i));

			// Benchmark without time parsing
			const startTime1 = performance.now();
			const tasksWithoutTime = mockEntries.map(entry => 
				fileTaskManagerNoTime.entryToFileTask(entry)
			);
			const endTime1 = performance.now();
			const timeWithoutParsing = endTime1 - startTime1;

			// Benchmark with time parsing
			const startTime2 = performance.now();
			const tasksWithTime = mockEntries.map(entry => 
				fileTaskManager.entryToFileTask(entry)
			);
			const endTime2 = performance.now();
			const timeWithParsing = endTime2 - startTime2;

			console.log(`Task creation without time parsing (${taskCount} tasks): ${timeWithoutParsing.toFixed(2)}ms`);
			console.log(`Task creation with time parsing (${taskCount} tasks): ${timeWithParsing.toFixed(2)}ms`);
			console.log(`Time parsing overhead: ${((timeWithParsing / timeWithoutParsing - 1) * 100).toFixed(1)}%`);

			// Verify tasks were created correctly
			expect(tasksWithoutTime).toHaveLength(taskCount);
			expect(tasksWithTime).toHaveLength(taskCount);

			// Time parsing should not add more than 100% overhead
			expect(timeWithParsing).toBeLessThan(timeWithoutParsing * 2);

			// Should complete within reasonable time
			expect(timeWithParsing).toBeLessThan(5000); // 5 seconds for 1000 tasks

			// Verify some tasks have time components
			const tasksWithTimeComponents = tasksWithTime.filter(task => 
				task.metadata.timeComponents && Object.keys(task.metadata.timeComponents).length > 0
			);
			expect(tasksWithTimeComponents.length).toBeGreaterThan(0);
		});

		test("should handle batch task creation efficiently", () => {
			const batchSizes = [10, 50, 100, 500];
			const results: { size: number; time: number; avgPerTask: number }[] = [];

			batchSizes.forEach(batchSize => {
				const mockEntries = Array.from({ length: batchSize }, (_, i) => ({
					ctx: {
						_local: {},
						app: {} as any,
						filter: {},
						formulas: {},
						localUsed: false
					},
					file: {
						parent: null,
						deleted: false,
						vault: null,
						path: `batch-task-${i}.md`,
						name: `batch-task-${i}.md`,
						extension: "md",
						getShortName: () => `batch-task-${i}`,
					},
					formulas: {},
					implicit: {
						file: null,
						name: `batch-task-${i}`,
						path: `batch-task-${i}.md`,
						folder: "",
						ext: "md",
					},
					lazyEvalCache: {},
					properties: {
						title: `Batch task ${i} at ${10 + (i % 6)}:${(i % 4) * 15}`,
						status: " ",
						completed: false,
					},
					getValue: jest.fn((prop: any) => {
						if (prop.name === "title") return `Batch task ${i} at ${10 + (i % 6)}:${(i % 4) * 15}`;
						if (prop.name === "status") return " ";
						if (prop.name === "completed") return false;
						return undefined;
					}),
					updateProperty: jest.fn(),
					getFormulaValue: jest.fn(),
					getPropertyKeys: jest.fn(() => ["title", "status", "completed"]),
				}));

				const startTime = performance.now();
				const tasks = mockEntries.map(entry => fileTaskManager.entryToFileTask(entry));
				const endTime = performance.now();
				const batchTime = endTime - startTime;

				results.push({
					size: batchSize,
					time: batchTime,
					avgPerTask: batchTime / batchSize,
				});

				expect(tasks).toHaveLength(batchSize);
			});

			// Log results
			console.log("Batch task creation performance:");
			results.forEach(result => {
				console.log(`  ${result.size} tasks: ${result.time.toFixed(2)}ms (${result.avgPerTask.toFixed(3)}ms per task)`);
			});

			// Performance should scale reasonably
			const smallBatch = results.find(r => r.size === 10)!;
			const largeBatch = results.find(r => r.size === 500)!;
			
			// Large batch should not be more than 10x slower per task than small batch
			expect(largeBatch.avgPerTask).toBeLessThan(smallBatch.avgPerTask * 10);
		});
	});

	describe("Memory Usage with Enhanced Metadata", () => {
		test("should measure memory impact of enhanced metadata structures", () => {
			const taskCount = 1000;

			// Create tasks without enhanced metadata
			const standardTasks: Task<StandardTaskMetadata>[] = [];
			for (let i = 0; i < taskCount; i++) {
				standardTasks.push({
					id: `standard-task-${i}`,
					content: `Standard task ${i}`,
					filePath: `standard-${i}.md`,
					line: i,
					completed: false,
					status: " ",
					originalMarkdown: `- [ ] Standard task ${i}`,
					metadata: {
						dueDate: Date.now() + i * 1000,
						tags: [`tag-${i % 10}`],
						children: [],
					},
				});
			}

			// Create tasks with enhanced metadata
			const enhancedTasks: Task<EnhancedStandardTaskMetadata>[] = [];
			for (let i = 0; i < taskCount; i++) {
				enhancedTasks.push({
					id: `enhanced-task-${i}`,
					content: `Enhanced task ${i} at ${9 + (i % 8)}:${(i % 4) * 15}`,
					filePath: `enhanced-${i}.md`,
					line: i,
					completed: false,
					status: " ",
					originalMarkdown: `- [ ] Enhanced task ${i} at ${9 + (i % 8)}:${(i % 4) * 15}`,
					metadata: {
						dueDate: Date.now() + i * 1000,
						tags: [`tag-${i % 10}`],
						children: [],
						timeComponents: {
							scheduledTime: {
								hour: 9 + (i % 8),
								minute: (i % 4) * 15,
								originalText: `${9 + (i % 8)}:${(i % 4) * 15}`,
								isRange: false,
							},
						},
						enhancedDates: {
							scheduledDateTime: new Date(Date.now() + i * 1000),
						},
					},
				});
			}

			// Measure serialized size as a proxy for memory usage
			const standardSize = JSON.stringify(standardTasks).length;
			const enhancedSize = JSON.stringify(enhancedTasks).length;
			const sizeIncrease = ((enhancedSize / standardSize - 1) * 100);

			console.log(`Standard tasks serialized size: ${(standardSize / 1024).toFixed(2)} KB`);
			console.log(`Enhanced tasks serialized size: ${(enhancedSize / 1024).toFixed(2)} KB`);
			console.log(`Memory increase: ${sizeIncrease.toFixed(1)}%`);

			// Memory increase should be reasonable (less than 100%)
			expect(sizeIncrease).toBeLessThan(100);

			// Verify enhanced tasks have the expected structure
			const tasksWithTimeComponents = enhancedTasks.filter(task => 
				task.metadata.timeComponents && task.metadata.enhancedDates
			);
			expect(tasksWithTimeComponents.length).toBe(taskCount);
		});

		test("should handle memory efficiently during task migration", () => {
			const taskCount = 500;

			// Create legacy tasks
			const legacyTasks: Task<StandardTaskMetadata>[] = [];
			for (let i = 0; i < taskCount; i++) {
				legacyTasks.push({
					id: `legacy-task-${i}`,
					content: `Legacy task ${i} at ${10 + (i % 6)}:${(i % 4) * 15} PM`,
					filePath: `legacy-${i}.md`,
					line: i,
					completed: false,
					status: " ",
					originalMarkdown: `- [ ] Legacy task ${i} at ${10 + (i % 6)}:${(i % 4) * 15} PM`,
					metadata: {
						dueDate: Date.now() + i * 1000,
						tags: [`legacy-tag-${i % 5}`],
						children: [],
					},
				});
			}

			// Measure migration performance and memory impact
			const startTime = performance.now();
			const migratedTasks = legacyTasks.map(task => 
				migrationService.migrateTaskToEnhanced(task)
			);
			const endTime = performance.now();
			const migrationTime = endTime - startTime;

			console.log(`Migration of ${taskCount} tasks: ${migrationTime.toFixed(2)}ms`);
			console.log(`Average per task: ${(migrationTime / taskCount).toFixed(3)}ms`);

			// Migration should complete within reasonable time
			expect(migrationTime).toBeLessThan(2000); // 2 seconds for 500 tasks

			// Verify migration results
			expect(migratedTasks).toHaveLength(taskCount);
			
			const tasksWithTimeComponents = migratedTasks.filter(task => 
				task.metadata.timeComponents && Object.keys(task.metadata.timeComponents).length > 0
			);
			expect(tasksWithTimeComponents.length).toBeGreaterThan(0);
		});
	});

	describe("Timeline Rendering Performance", () => {
		test("should create timeline events efficiently", () => {
			const taskCount = 1000;
			const baseDate = new Date("2025-08-25");

			// Create tasks with time components
			const tasksWithTime: Task<EnhancedStandardTaskMetadata>[] = [];
			for (let i = 0; i < taskCount; i++) {
				const hour = 8 + (i % 12); // 8 AM to 7 PM
				const minute = (i % 4) * 15; // 0, 15, 30, 45 minutes
				
				tasksWithTime.push({
					id: `timeline-task-${i}`,
					content: `Timeline task ${i}`,
					filePath: `timeline-${i}.md`,
					line: i,
					completed: false,
					status: " ",
					originalMarkdown: `- [ ] Timeline task ${i}`,
					metadata: {
						dueDate: baseDate.getTime() + (i % 7) * 24 * 60 * 60 * 1000, // Spread across a week
						timeComponents: {
							scheduledTime: {
								hour,
								minute,
								originalText: `${hour}:${minute.toString().padStart(2, '0')}`,
								isRange: false,
							},
						},
						enhancedDates: {
							scheduledDateTime: new Date(baseDate.getTime() + (i % 7) * 24 * 60 * 60 * 1000 + hour * 60 * 60 * 1000 + minute * 60 * 1000),
						},
						tags: [],
						children: [],
					},
				});
			}

			// Simulate timeline event creation
			const startTime = performance.now();
			const timelineEvents: MockTimelineEvent[] = tasksWithTime.map(task => ({
				id: task.id,
				title: task.content,
				date: new Date(task.metadata.dueDate!),
				task,
				timeInfo: {
					primaryTime: task.metadata.enhancedDates!.scheduledDateTime!,
					isRange: false,
					timeComponent: task.metadata.timeComponents!.scheduledTime,
					displayFormat: "date-time" as const,
				},
			}));
			const endTime = performance.now();
			const creationTime = endTime - startTime;

			console.log(`Timeline event creation (${taskCount} events): ${creationTime.toFixed(2)}ms`);
			console.log(`Average per event: ${(creationTime / taskCount).toFixed(3)}ms`);

			// Should complete within reasonable time
			expect(creationTime).toBeLessThan(1000); // 1 second for 1000 events
			expect(timelineEvents).toHaveLength(taskCount);

			// Verify events have correct structure
			timelineEvents.forEach(event => {
				expect(event.timeInfo?.primaryTime).toBeInstanceOf(Date);
				expect(event.timeInfo?.timeComponent).toBeDefined();
			});
		});

		test("should sort timeline events efficiently", () => {
			const eventCount = 5000;
			const baseDate = new Date("2025-08-25");

			// Create unsorted timeline events
			const events: MockTimelineEvent[] = [];
			for (let i = 0; i < eventCount; i++) {
				const randomHour = Math.floor(Math.random() * 24);
				const randomMinute = Math.floor(Math.random() * 60);
				const randomDay = Math.floor(Math.random() * 30); // Random day in month
				
				const eventDate = new Date(baseDate);
				eventDate.setDate(baseDate.getDate() + randomDay);
				eventDate.setHours(randomHour, randomMinute, 0, 0);

				events.push({
					id: `sort-event-${i}`,
					title: `Event ${i}`,
					date: eventDate,
					timeInfo: {
						primaryTime: eventDate,
						isRange: false,
						displayFormat: "date-time",
					},
				});
			}

			// Benchmark sorting
			const startTime = performance.now();
			const sortedEvents = events.sort((a, b) => 
				a.timeInfo!.primaryTime.getTime() - b.timeInfo!.primaryTime.getTime()
			);
			const endTime = performance.now();
			const sortTime = endTime - startTime;

			console.log(`Timeline event sorting (${eventCount} events): ${sortTime.toFixed(2)}ms`);

			// Should complete within reasonable time
			expect(sortTime).toBeLessThan(500); // 500ms for 5000 events
			expect(sortedEvents).toHaveLength(eventCount);

			// Verify sorting is correct
			for (let i = 1; i < sortedEvents.length; i++) {
				expect(sortedEvents[i].timeInfo!.primaryTime.getTime())
					.toBeGreaterThanOrEqual(sortedEvents[i - 1].timeInfo!.primaryTime.getTime());
			}
		});

		test("should group timeline events by date efficiently", () => {
			const eventCount = 2000;
			const baseDate = new Date("2025-08-25");

			// Create events spread across multiple days
			const events: MockTimelineEvent[] = [];
			for (let i = 0; i < eventCount; i++) {
				const dayOffset = i % 30; // 30 days
				const hour = 8 + (i % 12);
				const minute = (i % 4) * 15;
				
				const eventDate = new Date(baseDate);
				eventDate.setDate(baseDate.getDate() + dayOffset);
				eventDate.setHours(hour, minute, 0, 0);

				events.push({
					id: `group-event-${i}`,
					title: `Event ${i}`,
					date: eventDate,
					timeInfo: {
						primaryTime: eventDate,
						isRange: false,
						displayFormat: "date-time",
					},
				});
			}

			// Benchmark grouping by date
			const startTime = performance.now();
			const groupedEvents = new Map<string, MockTimelineEvent[]>();
			
			events.forEach(event => {
				const dateKey = event.timeInfo!.primaryTime.toISOString().split('T')[0];
				if (!groupedEvents.has(dateKey)) {
					groupedEvents.set(dateKey, []);
				}
				groupedEvents.get(dateKey)!.push(event);
			});

			// Sort events within each day
			groupedEvents.forEach(dayEvents => {
				dayEvents.sort((a, b) => 
					a.timeInfo!.primaryTime.getTime() - b.timeInfo!.primaryTime.getTime()
				);
			});

			const endTime = performance.now();
			const groupTime = endTime - startTime;

			console.log(`Timeline event grouping (${eventCount} events): ${groupTime.toFixed(2)}ms`);
			console.log(`Groups created: ${groupedEvents.size}`);

			// Should complete within reasonable time
			expect(groupTime).toBeLessThan(1000); // 1 second for 2000 events
			expect(groupedEvents.size).toBeLessThanOrEqual(30); // Max 30 days

			// Verify grouping is correct
			let totalEventsInGroups = 0;
			groupedEvents.forEach(dayEvents => {
				totalEventsInGroups += dayEvents.length;
				
				// Verify events in each day are sorted
				for (let i = 1; i < dayEvents.length; i++) {
					expect(dayEvents[i].timeInfo!.primaryTime.getTime())
						.toBeGreaterThanOrEqual(dayEvents[i - 1].timeInfo!.primaryTime.getTime());
				}
			});
			
			expect(totalEventsInGroups).toBe(eventCount);
		});
	});

	describe("Performance Regression Tests", () => {
		test("should maintain baseline performance for tasks without time", () => {
			const taskCount = 1000;
			
			// Create tasks without time information
			const tasksWithoutTime = Array.from({ length: taskCount }, (_, i) => 
				`Simple task ${i} without any time information`
			);

			// Benchmark parsing tasks without time
			const startTime = performance.now();
			tasksWithoutTime.forEach(taskText => {
				const result = enhancedTimeParsingService.parseTimeExpressions(taskText) as EnhancedParsedTimeResult;
				// Access the result to ensure it's computed
				const hasTime = result.timeComponents && Object.keys(result.timeComponents).length > 0;
			});
			const endTime = performance.now();
			const parseTime = endTime - startTime;

			console.log(`Parsing tasks without time (${taskCount} tasks): ${parseTime.toFixed(2)}ms`);
			console.log(`Average per task: ${(parseTime / taskCount).toFixed(3)}ms`);

			// Should be very fast for tasks without time
			expect(parseTime).toBeLessThan(500); // 500ms for 1000 tasks
		});

		test("should handle edge cases efficiently", () => {
			const edgeCases = [
				"", // Empty string
				"Task with no time information",
				"Task with invalid time 25:99",
				"Task with malformed range 12:00--15:00",
				"Task with multiple invalid times 25:99 and 30:70",
				"Very long task description ".repeat(100) + " at 2:30 PM",
			];

			const iterations = 100;

			const startTime = performance.now();
			for (let i = 0; i < iterations; i++) {
				edgeCases.forEach(edgeCase => {
					try {
						const result = enhancedTimeParsingService.parseTimeExpressions(edgeCase) as EnhancedParsedTimeResult;
						// Access the result
						const hasTime = result.timeComponents && Object.keys(result.timeComponents).length > 0;
					} catch (error) {
						// Should not throw errors
						throw new Error(`Parsing failed for: "${edgeCase}"`);
					}
				});
			}
			const endTime = performance.now();
			const parseTime = endTime - startTime;

			console.log(`Edge case parsing (${iterations * edgeCases.length} iterations): ${parseTime.toFixed(2)}ms`);

			// Should handle edge cases without errors and within reasonable time
			expect(parseTime).toBeLessThan(1000); // 1 second for all edge cases
		});

		test("should maintain performance with cache enabled", () => {
			const testExpressions = [
				"Meeting at 2:30 PM",
				"Workshop 9:00-17:00",
				"Call at 14:00",
				"Event 10:00 AM - 2:00 PM",
				"Task at 23:45",
			];

			// Clear cache first
			enhancedTimeParsingService.clearCache();

			// First run (populate cache)
			const startTime1 = performance.now();
			for (let i = 0; i < 200; i++) {
				testExpressions.forEach(expr => {
					enhancedTimeParsingService.parseTimeExpressions(expr);
				});
			}
			const endTime1 = performance.now();
			const firstRunTime = endTime1 - startTime1;

			// Second run (use cache)
			const startTime2 = performance.now();
			for (let i = 0; i < 200; i++) {
				testExpressions.forEach(expr => {
					enhancedTimeParsingService.parseTimeExpressions(expr);
				});
			}
			const endTime2 = performance.now();
			const secondRunTime = endTime2 - startTime2;

			console.log(`First run (populate cache): ${firstRunTime.toFixed(2)}ms`);
			console.log(`Second run (use cache): ${secondRunTime.toFixed(2)}ms`);
			console.log(`Cache performance improvement: ${(firstRunTime / secondRunTime).toFixed(2)}x`);

			// Cache should provide significant performance improvement
			expect(secondRunTime).toBeLessThan(firstRunTime * 0.8);
		});
	});
});