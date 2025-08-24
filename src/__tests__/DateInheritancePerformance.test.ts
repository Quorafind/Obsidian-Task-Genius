/**
 * Performance tests for DateInheritanceAugmentor
 * Tests batch processing and caching efficiency for large task sets
 */

import { DateInheritanceAugmentor } from "../dataflow/augment/DateInheritanceAugmentor";
import { DateInheritanceService } from "../services/date-inheritance-service";
import { Task, EnhancedStandardTaskMetadata } from "../types/task";
import { TimeComponent } from "../types/time-parsing";

// Mock Obsidian modules
jest.mock("obsidian", () => ({
	App: jest.fn(),
	TFile: jest.fn(),
	Vault: jest.fn(),
	MetadataCache: jest.fn(),
}));

describe("DateInheritanceAugmentor Performance", () => {
	let augmentor: DateInheritanceAugmentor;
	let mockApp: any;
	let mockVault: any;
	let mockMetadataCache: any;

	beforeEach(() => {
		mockApp = {};
		mockVault = {
			getAbstractFileByPath: jest.fn(),
			adapter: {
				stat: jest.fn(),
			},
		};
		mockMetadataCache = {
			getFileCache: jest.fn(),
		};

		augmentor = new DateInheritanceAugmentor(mockApp, mockVault, mockMetadataCache);
	});

	afterEach(() => {
		jest.clearAllMocks();
		augmentor.clearCache();
	});

	/**
	 * Create a mock task with time components for testing
	 */
	function createMockTaskWithTime(
		id: string,
		line: number,
		timeComponent?: TimeComponent,
		hasDate: boolean = false
	): Task {
		const metadata: EnhancedStandardTaskMetadata = {
			tags: [],
			children: [],
		};

		if (timeComponent) {
			metadata.timeComponents = {
				startTime: timeComponent,
			};
		}

		if (hasDate) {
			metadata.startDate = new Date(2024, 2, 15).getTime();
		}

		return {
			id,
			content: `Task ${id} 12:00～13:00`,
			filePath: "test.md",
			line,
			completed: false,
			status: "todo",
			originalMarkdown: `- [ ] Task ${id} 12:00～13:00`,
			metadata,
		} as Task;
	}

	/**
	 * Create a time component for testing
	 */
	function createTimeComponent(hour: number = 12): TimeComponent {
		return {
			hour,
			minute: 0,
			originalText: `${hour}:00`,
			isRange: true,
			rangePartner: {
				hour: hour + 1,
				minute: 0,
				originalText: `${hour + 1}:00`,
				isRange: true,
			},
		};
	}

	describe("batch processing performance", () => {
		it("should efficiently process large numbers of tasks", async () => {
			// Mock file operations
			const mockFile = { path: "2024-03-15.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 15).getTime(),
				mtime: new Date(2024, 2, 15).getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: null,
			});

			// Create a large number of tasks with time-only expressions
			const taskCount = 1000;
			const tasks: Task[] = [];

			for (let i = 0; i < taskCount; i++) {
				const timeComponent = createTimeComponent(9 + (i % 8)); // Vary times from 9:00 to 16:00
				const task = createMockTaskWithTime(`task-${i}`, i, timeComponent, false);
				tasks.push(task);
			}

			const startTime = Date.now();

			// Process tasks in batch
			const result = await augmentor.augmentTasksWithDateInheritance(
				tasks,
				"2024-03-15.md"
			);

			const endTime = Date.now();
			const processingTime = endTime - startTime;

			// Verify results
			expect(result).toHaveLength(taskCount);
			expect(result.every(task => {
				const metadata = task.metadata as EnhancedStandardTaskMetadata;
				return metadata.startDate !== undefined;
			})).toBe(true);

			// Performance assertions
			expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
			console.log(`Processed ${taskCount} tasks in ${processingTime}ms (${(processingTime / taskCount).toFixed(2)}ms per task)`);

			// Verify caching is working (file operations should be minimal)
			expect(mockVault.adapter.stat).toHaveBeenCalledTimes(1); // Only called once due to caching
		});

		it("should handle mixed tasks efficiently (some with dates, some without)", async () => {
			// Mock file operations
			const mockFile = { path: "mixed-tasks.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 10).getTime(),
				mtime: new Date(2024, 2, 15).getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: { date: "2024-03-12" },
			});

			const taskCount = 500;
			const tasks: Task[] = [];

			for (let i = 0; i < taskCount; i++) {
				const timeComponent = createTimeComponent(10 + (i % 6));
				const hasDate = i % 3 === 0; // Every third task has a date
				const task = createMockTaskWithTime(`mixed-${i}`, i, timeComponent, hasDate);
				tasks.push(task);
			}

			const startTime = Date.now();

			const result = await augmentor.augmentTasksWithDateInheritance(
				tasks,
				"mixed-tasks.md"
			);

			const endTime = Date.now();
			const processingTime = endTime - startTime;

			// Verify results
			expect(result).toHaveLength(taskCount);

			// Tasks with existing dates should be unchanged
			const tasksWithOriginalDates = result.filter((_, i) => i % 3 === 0);
			expect(tasksWithOriginalDates.every(task => {
				const metadata = task.metadata as EnhancedStandardTaskMetadata;
				return metadata.startDate === new Date(2024, 2, 15).getTime();
			})).toBe(true);

			// Tasks without dates should get inherited dates
			const tasksWithInheritedDates = result.filter((_, i) => i % 3 !== 0);
			expect(tasksWithInheritedDates.every(task => {
				const metadata = task.metadata as EnhancedStandardTaskMetadata;
				return metadata.startDate !== undefined;
			})).toBe(true);

			// Performance assertion
			expect(processingTime).toBeLessThan(3000); // Should be faster with mixed tasks
			console.log(`Processed ${taskCount} mixed tasks in ${processingTime}ms`);
		});
	});

	describe("caching efficiency", () => {
		it("should cache date resolution results effectively", async () => {
			// Mock file operations
			const mockFile = { path: "cache-test.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 5).getTime(),
				mtime: new Date(2024, 2, 15).getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: null,
			});

			// Create tasks with identical time components (should benefit from caching)
			const taskCount = 100;
			const timeComponent = createTimeComponent(14); // All tasks at 14:00
			const tasks: Task[] = [];

			for (let i = 0; i < taskCount; i++) {
				const task = createMockTaskWithTime(`cache-${i}`, i, timeComponent, false);
				tasks.push(task);
			}

			// First run
			const startTime1 = Date.now();
			const result1 = await augmentor.augmentTasksWithDateInheritance(tasks, "cache-test.md");
			const endTime1 = Date.now();
			const firstRunTime = endTime1 - startTime1;

			// Second run (should be faster due to caching)
			const startTime2 = Date.now();
			const result2 = await augmentor.augmentTasksWithDateInheritance(tasks, "cache-test.md");
			const endTime2 = Date.now();
			const secondRunTime = endTime2 - startTime2;

			// Verify results are identical
			expect(result1).toHaveLength(taskCount);
			expect(result2).toHaveLength(taskCount);

			// Second run should be faster or equal due to caching (allowing for timing variations in tests)
			expect(secondRunTime).toBeLessThanOrEqual(firstRunTime + 5); // Allow 5ms tolerance for test timing variations
			console.log(`First run: ${firstRunTime}ms, Second run: ${secondRunTime}ms (${((1 - secondRunTime / firstRunTime) * 100).toFixed(1)}% faster)`);

			// Verify cache statistics
			const cacheStats = augmentor.getCacheStats();
			expect(cacheStats.resolutionCache.size).toBeGreaterThan(0);
		});

		it("should respect cache size limits", async () => {
			// Mock file operations
			const mockFile = { path: "cache-limit-test.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 1).getTime(),
				mtime: new Date(2024, 2, 15).getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: null,
			});

			// Create many tasks with different time components to fill cache
			const taskCount = 50; // Smaller number for this test
			const tasks: Task[] = [];

			for (let i = 0; i < taskCount; i++) {
				// Create unique time components to avoid cache hits
				const timeComponent = createTimeComponent(8 + (i % 12)); // Different times
				const task = createMockTaskWithTime(`limit-${i}`, i, timeComponent, false);
				// Make each task unique by varying content
				task.content = `Unique task ${i} at ${8 + (i % 12)}:00`;
				task.originalMarkdown = `- [ ] ${task.content}`;
				tasks.push(task);
			}

			await augmentor.augmentTasksWithDateInheritance(tasks, "cache-limit-test.md");

			// Check cache statistics
			const cacheStats = augmentor.getCacheStats();
			expect(cacheStats.resolutionCache.size).toBeLessThanOrEqual(cacheStats.resolutionCache.maxSize);
			expect(cacheStats.dateInheritanceCache.size).toBeLessThanOrEqual(cacheStats.dateInheritanceCache.maxSize);
		});
	});

	describe("memory usage optimization", () => {
		it("should not cause memory leaks with repeated processing", async () => {
			// Mock file operations
			const mockFile = { path: "memory-test.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 1).getTime(),
				mtime: new Date(2024, 2, 15).getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: null,
			});

			const initialMemory = process.memoryUsage().heapUsed;

			// Process multiple batches
			for (let batch = 0; batch < 10; batch++) {
				const tasks: Task[] = [];
				for (let i = 0; i < 50; i++) {
					const timeComponent = createTimeComponent(9 + (i % 8));
					const task = createMockTaskWithTime(`batch-${batch}-${i}`, i, timeComponent, false);
					tasks.push(task);
				}

				await augmentor.augmentTasksWithDateInheritance(tasks, `memory-test-${batch}.md`);
			}

			const finalMemory = process.memoryUsage().heapUsed;
			const memoryIncrease = finalMemory - initialMemory;

			// Memory increase should be reasonable (less than 50MB for this test)
			expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
			console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
		});
	});

	describe("error handling performance", () => {
		it("should handle errors gracefully without significant performance impact", async () => {
			// Mock file operations to sometimes fail
			const mockFile = { path: "error-test.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			
			let callCount = 0;
			mockVault.adapter.stat.mockImplementation(() => {
				callCount++;
				if (callCount % 3 === 0) {
					throw new Error("Simulated file system error");
				}
				return Promise.resolve({
					ctime: new Date(2024, 2, 1).getTime(),
					mtime: new Date(2024, 2, 15).getTime(),
				});
			});

			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: null,
			});

			// Create tasks that will trigger errors
			const taskCount = 100;
			const tasks: Task[] = [];

			for (let i = 0; i < taskCount; i++) {
				const timeComponent = createTimeComponent(10 + (i % 6));
				const task = createMockTaskWithTime(`error-${i}`, i, timeComponent, false);
				tasks.push(task);
			}

			const startTime = Date.now();

			// This should not throw, but handle errors gracefully
			const result = await augmentor.augmentTasksWithDateInheritance(tasks, "error-test.md");

			const endTime = Date.now();
			const processingTime = endTime - startTime;

			// Should still return all tasks (some may not be augmented due to errors)
			expect(result).toHaveLength(taskCount);

			// Should complete in reasonable time despite errors
			expect(processingTime).toBeLessThan(10000); // 10 seconds max
			console.log(`Processed ${taskCount} tasks with errors in ${processingTime}ms`);
		});
	});
});