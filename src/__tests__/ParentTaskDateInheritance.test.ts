/**
 * Integration tests for Parent Task Date Inheritance
 * Tests hierarchical date inheritance with proper priority resolution
 */

import { DateInheritanceService, DateResolutionContext } from "../services/date-inheritance-service";
import { TimeComponent } from "../types/time-parsing";
import { Task, EnhancedStandardTaskMetadata } from "../types/task";

// Mock Obsidian modules
jest.mock("obsidian", () => ({
	App: jest.fn(),
	TFile: jest.fn(),
	Vault: jest.fn(),
	MetadataCache: jest.fn(),
}));

describe("Parent Task Date Inheritance", () => {
	let service: DateInheritanceService;
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

		service = new DateInheritanceService(mockApp, mockVault, mockMetadataCache);
	});

	afterEach(() => {
		jest.clearAllMocks();
		service.clearCache();
	});

	/**
	 * Create a mock task for testing
	 */
	function createMockTask(
		id: string,
		content: string,
		parentId?: string,
		dates?: {
			startDate?: number;
			dueDate?: number;
			scheduledDate?: number;
			createdDate?: number;
		}
	): Task {
		const metadata: EnhancedStandardTaskMetadata = {
			tags: [],
			children: [],
			parent: parentId,
			...dates,
		};

		return {
			id,
			content,
			filePath: "test.md",
			line: parseInt(id.split('-')[1]) || 1,
			completed: false,
			status: "todo",
			originalMarkdown: `- [ ] ${content}`,
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
			isRange: false,
		};
	}

	describe("single-level parent inheritance", () => {
		it("should inherit start date from parent task", async () => {
			const parentTask = createMockTask("parent-1", "Parent task", undefined, {
				startDate: new Date(2024, 2, 15).getTime(),
			});

			const childTask = createMockTask("child-1", "Child task 12:00", "parent-1");
			const timeComponent = createTimeComponent(12);

			const context: DateResolutionContext = {
				currentLine: "  - [ ] Child task 12:00",
				filePath: "test.md",
				parentTask,
				allTasks: [parentTask, childTask],
			};

			const result = await service.resolveDateForTimeOnly(childTask, timeComponent, context);

			expect(result.source).toBe("parent-task");
			expect(result.confidence).toBe("high");
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 15));
			expect(result.context).toContain("depth: 0");
		});

		it("should inherit due date when no start date available", async () => {
			const parentTask = createMockTask("parent-2", "Parent task", undefined, {
				dueDate: new Date(2024, 2, 20).getTime(),
			});

			const childTask = createMockTask("child-2", "Child task 14:00", "parent-2");
			const timeComponent = createTimeComponent(14);

			const context: DateResolutionContext = {
				currentLine: "  - [ ] Child task 14:00",
				filePath: "test.md",
				parentTask,
				allTasks: [parentTask, childTask],
			};

			const result = await service.resolveDateForTimeOnly(childTask, timeComponent, context);

			expect(result.source).toBe("parent-task");
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 20));
		});

		it("should prioritize start date over due date", async () => {
			const parentTask = createMockTask("parent-3", "Parent task", undefined, {
				startDate: new Date(2024, 2, 15).getTime(),
				dueDate: new Date(2024, 2, 20).getTime(),
			});

			const childTask = createMockTask("child-3", "Child task 16:00", "parent-3");
			const timeComponent = createTimeComponent(16);

			const context: DateResolutionContext = {
				currentLine: "  - [ ] Child task 16:00",
				filePath: "test.md",
				parentTask,
				allTasks: [parentTask, childTask],
			};

			const result = await service.resolveDateForTimeOnly(childTask, timeComponent, context);

			expect(result.source).toBe("parent-task");
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 15)); // Should use start date
		});

		it("should inherit enhanced datetime objects when available", async () => {
			const enhancedMetadata: EnhancedStandardTaskMetadata = {
				tags: [],
				children: [],
				enhancedDates: {
					startDateTime: new Date(2024, 2, 15, 9, 30, 0),
				},
			};

			const parentTask: Task = {
				id: "parent-4",
				content: "Parent task with enhanced dates",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: "todo",
				originalMarkdown: "- [ ] Parent task with enhanced dates",
				metadata: enhancedMetadata,
			} as Task;

			const childTask = createMockTask("child-4", "Child task 18:00", "parent-4");
			const timeComponent = createTimeComponent(18);

			const context: DateResolutionContext = {
				currentLine: "  - [ ] Child task 18:00",
				filePath: "test.md",
				parentTask,
				allTasks: [parentTask, childTask],
			};

			const result = await service.resolveDateForTimeOnly(childTask, timeComponent, context);

			expect(result.source).toBe("parent-task");
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 15, 9, 30, 0));
		});
	});

	describe("multi-level hierarchical inheritance", () => {
		it("should inherit from grandparent when parent has no date", async () => {
			const grandparentTask = createMockTask("grandparent-1", "Grandparent task", undefined, {
				startDate: new Date(2024, 2, 10).getTime(),
			});

			const parentTask = createMockTask("parent-5", "Parent task (no date)", "grandparent-1");

			const childTask = createMockTask("child-5", "Child task 10:00", "parent-5");
			const timeComponent = createTimeComponent(10);

			const allTasks = [grandparentTask, parentTask, childTask];

			const context: DateResolutionContext = {
				currentLine: "    - [ ] Child task 10:00",
				filePath: "test.md",
				parentTask,
				allTasks,
			};

			const result = await service.resolveDateForTimeOnly(childTask, timeComponent, context);

			expect(result.source).toBe("parent-task");
			expect(result.confidence).toBe("medium"); // Lower confidence for deeper inheritance
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 10));
			expect(result.context).toContain("depth: 1");
		});

		it("should inherit from great-grandparent when needed", async () => {
			const greatGrandparentTask = createMockTask("great-grandparent-1", "Great-grandparent task", undefined, {
				dueDate: new Date(2024, 2, 25).getTime(),
			});

			const grandparentTask = createMockTask("grandparent-2", "Grandparent task (no date)", "great-grandparent-1");

			const parentTask = createMockTask("parent-6", "Parent task (no date)", "grandparent-2");

			const childTask = createMockTask("child-6", "Child task 15:00", "parent-6");
			const timeComponent = createTimeComponent(15);

			const allTasks = [greatGrandparentTask, grandparentTask, parentTask, childTask];

			const context: DateResolutionContext = {
				currentLine: "      - [ ] Child task 15:00",
				filePath: "test.md",
				parentTask,
				allTasks,
			};

			const result = await service.resolveDateForTimeOnly(childTask, timeComponent, context);

			expect(result.source).toBe("parent-task");
			expect(result.confidence).toBe("low"); // Lowest confidence for deep inheritance
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 25));
			expect(result.context).toContain("depth: 2");
		});

		it("should respect maximum depth limit", async () => {
			// Create a deep hierarchy beyond the max depth (3)
			const level0Task = createMockTask("level-0", "Level 0 task", undefined, {
				startDate: new Date(2024, 2, 5).getTime(),
			});

			const level1Task = createMockTask("level-1", "Level 1 task", "level-0");
			const level2Task = createMockTask("level-2", "Level 2 task", "level-1");
			const level3Task = createMockTask("level-3", "Level 3 task", "level-2");
			const level4Task = createMockTask("level-4", "Level 4 task 11:00", "level-3");

			const timeComponent = createTimeComponent(11);

			const allTasks = [level0Task, level1Task, level2Task, level3Task, level4Task];

			// Mock file operations for fallback
			const mockFile = { path: "test.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 1).getTime(),
				mtime: new Date().getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: null,
			});

			const context: DateResolutionContext = {
				currentLine: "        - [ ] Level 4 task 11:00",
				filePath: "test.md",
				parentTask: level3Task,
				allTasks,
			};

			const result = await service.resolveDateForTimeOnly(level4Task, timeComponent, context);

			// Should fall back to file ctime since max depth is exceeded
			expect(result.source).toBe("file-ctime");
			expect(result.usedFallback).toBe(true);
		});
	});

	describe("inheritance priority with other sources", () => {
		it("should prioritize line date over parent task date", async () => {
			const parentTask = createMockTask("parent-7", "Parent task", undefined, {
				startDate: new Date(2024, 2, 10).getTime(),
			});

			const childTask = createMockTask("child-7", "Child task 2024-03-20 13:00", "parent-7");
			const timeComponent = createTimeComponent(13);

			const context: DateResolutionContext = {
				currentLine: "  - [ ] Child task 2024-03-20 13:00",
				filePath: "test.md",
				parentTask,
				allTasks: [parentTask, childTask],
			};

			const result = await service.resolveDateForTimeOnly(childTask, timeComponent, context);

			expect(result.source).toBe("line-date");
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 20)); // Should use line date, not parent
		});

		it("should use parent task date when no line date available", async () => {
			const parentTask = createMockTask("parent-8", "Parent task", undefined, {
				scheduledDate: new Date(2024, 2, 18).getTime(),
			});

			const childTask = createMockTask("child-8", "Child task 09:00", "parent-8");
			const timeComponent = createTimeComponent(9);

			// Mock file operations for fallback comparison
			const mockFile = { path: "regular-note.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 1).getTime(),
				mtime: new Date().getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: null,
			});

			const context: DateResolutionContext = {
				currentLine: "  - [ ] Child task 09:00",
				filePath: "regular-note.md",
				parentTask,
				allTasks: [parentTask, childTask],
			};

			const result = await service.resolveDateForTimeOnly(childTask, timeComponent, context);

			expect(result.source).toBe("parent-task");
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 18));
		});
	});

	describe("error handling and edge cases", () => {
		it("should handle missing parent task gracefully", async () => {
			const childTask = createMockTask("child-9", "Orphaned child task 14:00", "missing-parent");
			const timeComponent = createTimeComponent(14);

			// Mock file operations for fallback
			const mockFile = { path: "test.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 5).getTime(),
				mtime: new Date().getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: null,
			});

			const context: DateResolutionContext = {
				currentLine: "- [ ] Orphaned child task 14:00",
				filePath: "test.md",
				parentTask: undefined, // No parent task
				allTasks: [childTask],
			};

			const result = await service.resolveDateForTimeOnly(childTask, timeComponent, context);

			// Should fall back to file ctime
			expect(result.source).toBe("file-ctime");
			expect(result.usedFallback).toBe(true);
		});

		it("should handle circular parent references", async () => {
			// Create circular reference: A -> B -> A
			const taskA = createMockTask("task-a", "Task A 10:00", "task-b");
			const taskB = createMockTask("task-b", "Task B", "task-a", {
				startDate: new Date(2024, 2, 15).getTime(),
			});

			const timeComponent = createTimeComponent(10);

			const context: DateResolutionContext = {
				currentLine: "- [ ] Task A 10:00",
				filePath: "test.md",
				parentTask: taskB,
				allTasks: [taskA, taskB],
			};

			// This should not cause infinite recursion
			const result = await service.resolveDateForTimeOnly(taskA, timeComponent, context);

			expect(result.source).toBe("parent-task");
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 15));
		});

		it("should handle invalid parent task dates", async () => {
			const parentTask = createMockTask("parent-9", "Parent with invalid date", undefined, {
				startDate: NaN, // Invalid date
			});

			const childTask = createMockTask("child-10", "Child task 16:00", "parent-9");
			const timeComponent = createTimeComponent(16);

			// Mock file operations for fallback
			const mockFile = { path: "test.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 8).getTime(),
				mtime: new Date().getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: null,
			});

			const context: DateResolutionContext = {
				currentLine: "  - [ ] Child task 16:00",
				filePath: "test.md",
				parentTask,
				allTasks: [parentTask, childTask],
			};

			const result = await service.resolveDateForTimeOnly(childTask, timeComponent, context);

			// Should fall back to file ctime since parent date is invalid
			expect(result.source).toBe("file-ctime");
			expect(result.usedFallback).toBe(true);
		});
	});

	describe("performance with complex hierarchies", () => {
		it("should efficiently handle large task hierarchies", async () => {
			// Create a hierarchy with many siblings at each level
			const rootTask = createMockTask("root", "Root task", undefined, {
				startDate: new Date(2024, 2, 1).getTime(),
			});

			const allTasks = [rootTask];
			let currentParent = "root";

			// Create 2 levels with 10 tasks each (stay within max depth)
			for (let level = 1; level <= 2; level++) {
				const levelTasks = [];
				for (let i = 0; i < 10; i++) {
					const taskId = `level-${level}-task-${i}`;
					const task = createMockTask(taskId, `Level ${level} Task ${i}`, currentParent);
					levelTasks.push(task);
					allTasks.push(task);
				}
				currentParent = levelTasks[0].id; // Use first task as parent for next level
			}

			// Test inheritance from the deepest task
			const deepestTask = createMockTask("deepest", "Deepest task 12:00", currentParent);
			const timeComponent = createTimeComponent(12);
			allTasks.push(deepestTask);

			const parentTask = allTasks.find(t => t.id === currentParent);

			// Mock file operations for fallback (in case hierarchy fails)
			const mockFile = { path: "test.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 1).getTime(),
				mtime: new Date().getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: null,
			});

			const startTime = Date.now();

			const context: DateResolutionContext = {
				currentLine: "      - [ ] Deepest task 12:00",
				filePath: "test.md",
				parentTask,
				allTasks,
			};

			const result = await service.resolveDateForTimeOnly(deepestTask, timeComponent, context);

			const endTime = Date.now();
			const processingTime = endTime - startTime;

			// Should complete quickly even with large hierarchy
			expect(processingTime).toBeLessThan(100); // 100ms max
			expect(result.source).toBe("parent-task");
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 1));

			console.log(`Processed hierarchy with ${allTasks.length} tasks in ${processingTime}ms`);
		});
	});
});