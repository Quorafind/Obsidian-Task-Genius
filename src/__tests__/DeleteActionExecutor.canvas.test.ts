/**
 * DeleteActionExecutor Canvas Tests
 *
 * Tests for Canvas task deletion functionality including:
 * - Deleting Canvas tasks from text nodes
 * - Error handling for missing files/nodes
 * - Canvas file structure integrity
 */

import { DeleteActionExecutor } from "../utils/onCompletion/DeleteActionExecutor";
import {
	OnCompletionActionType,
	OnCompletionExecutionContext,
	OnCompletionDeleteConfig,
} from "../types/onCompletion";
import { Task, CanvasTaskMetadata } from "../types/task";
import { createMockPlugin, createMockApp } from "./mockUtils";

// Mock Canvas task updater
const mockCanvasTaskUpdater = {
	deleteCanvasTask: jest.fn(),
};

// Mock TaskManager
const mockTaskManager = {
	getCanvasTaskUpdater: jest.fn(() => mockCanvasTaskUpdater),
};

// Mock plugin
const mockPlugin = {
	...createMockPlugin(),
	taskManager: mockTaskManager,
};

const mockApp = createMockApp();

describe("DeleteActionExecutor - Canvas Tasks", () => {
	let executor: DeleteActionExecutor;
	let mockContext: OnCompletionExecutionContext;
	let mockConfig: OnCompletionDeleteConfig;

	beforeEach(() => {
		executor = new DeleteActionExecutor();

		mockConfig = {
			type: OnCompletionActionType.DELETE,
		};

		// Reset mocks
		jest.clearAllMocks();
	});

	describe("Canvas Task Deletion", () => {
		it("should successfully delete a Canvas task", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-1",
				content: "Test Canvas task",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Test Canvas task",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-1",
					tags: [],
					children: [],
				},
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock successful deletion
			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: true,
			});

			const result = await executor.execute(mockContext, mockConfig);

			expect(result.success).toBe(true);
			expect(result.message).toContain("Task deleted from Canvas file");
			expect(mockCanvasTaskUpdater.deleteCanvasTask).toHaveBeenCalledWith(
				canvasTask
			);
		});

		it("should handle Canvas task deletion failure", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-2",
				content: "Test Canvas task",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Test Canvas task",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-1",
					tags: [],
					children: [],
				},
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock deletion failure
			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: false,
				error: "Canvas node not found",
			});

			const result = await executor.execute(mockContext, mockConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Canvas node not found");
		});

		it("should handle Canvas task updater exceptions", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-3",
				content: "Test Canvas task",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Test Canvas task",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-1",
					tags: [],
					children: [],
				},
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock exception
			mockCanvasTaskUpdater.deleteCanvasTask.mockRejectedValue(
				new Error("Network error")
			);

			const result = await executor.execute(mockContext, mockConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain(
				"Error deleting Canvas task: Network error"
			);
		});

		it("should correctly identify Canvas tasks", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-4",
				content: "Test Canvas task",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Test Canvas task",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-1",
					tags: [],
					children: [],
				},
			};

			const markdownTask: Task = {
				id: "markdown-task-1",
				content: "Test Markdown task",
				filePath: "test.md",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Test Markdown task",
				metadata: {
					tags: [],
					children: [],
				},
			};

			// Test Canvas task routing
			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: true,
			});

			await executor.execute(mockContext, mockConfig);
			expect(mockCanvasTaskUpdater.deleteCanvasTask).toHaveBeenCalled();

			// Reset mock
			jest.clearAllMocks();

			// Test Markdown task routing (should not call Canvas updater)
			mockContext = {
				task: markdownTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock vault for Markdown task
			const mockVault = {
				getAbstractFileByPath: jest.fn().mockReturnValue({
					path: "test.md",
				}),
				read: jest.fn().mockResolvedValue("- [x] Test Markdown task"),
				modify: jest.fn().mockResolvedValue(undefined),
			};

			mockApp.vault = mockVault;

			await executor.execute(mockContext, mockConfig);
			expect(
				mockCanvasTaskUpdater.deleteCanvasTask
			).not.toHaveBeenCalled();
		});
	});

	describe("Configuration Validation", () => {
		it("should validate correct delete configuration", () => {
			const validConfig: OnCompletionDeleteConfig = {
				type: OnCompletionActionType.DELETE,
			};

			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-5",
				content: "Test task",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Test task",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-1",
					tags: [],
					children: [],
				},
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Should not throw validation error
			expect(() => {
				executor["validateConfig"](validConfig);
			}).not.toThrow();
		});

		it("should reject invalid configuration", async () => {
			const invalidConfig = {
				type: OnCompletionActionType.MOVE, // Wrong type
			} as any;

			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-6",
				content: "Test task",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Test task",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-1",
					tags: [],
					children: [],
				},
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			const result = await executor.execute(mockContext, invalidConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Invalid configuration");
		});
	});

	describe("Description Generation", () => {
		it("should generate correct description", () => {
			const config: OnCompletionDeleteConfig = {
				type: OnCompletionActionType.DELETE,
			};

			const description = executor.getDescription(config);
			expect(description).toBe("Delete the completed task from the file");
		});
	});
});
