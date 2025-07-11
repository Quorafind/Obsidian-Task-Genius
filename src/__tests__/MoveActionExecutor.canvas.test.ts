/**
 * MoveActionExecutor Canvas Tests
 *
 * Tests for Canvas task movement functionality including:
 * - Moving Canvas tasks between Canvas files
 * - Moving Canvas tasks to Markdown files
 * - Cross-format task movement
 * - Error handling and validation
 */

import { MoveActionExecutor } from "../utils/onCompletion/MoveActionExecutor";
import {
	OnCompletionActionType,
	OnCompletionExecutionContext,
	OnCompletionMoveConfig,
} from "../types/onCompletion";
import { Task, CanvasTaskMetadata } from "../types/task";
import { createMockPlugin, createMockApp } from "./mockUtils";

// Mock Canvas task updater
const mockCanvasTaskUpdater = {
	moveCanvasTask: jest.fn(),
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
} as any;

// Mock vault
const mockVault = {
	getAbstractFileByPath: jest.fn(),
	getFileByPath: jest.fn(),
	read: jest.fn(),
	modify: jest.fn(),
	create: jest.fn(),
};

const mockApp = {
	...createMockApp(),
	vault: mockVault,
} as any;

describe("MoveActionExecutor - Canvas Tasks", () => {
	let executor: MoveActionExecutor;
	let mockContext: OnCompletionExecutionContext;

	beforeEach(() => {
		executor = new MoveActionExecutor();

		// Reset mocks
		jest.clearAllMocks();

		// Reset all vault method mocks to default behavior
		mockVault.getAbstractFileByPath.mockReset();
		mockVault.getFileByPath.mockReset();
		mockVault.read.mockReset();
		mockVault.modify.mockReset();
		mockVault.create.mockReset();

		// Reset Canvas task updater mocks
		mockCanvasTaskUpdater.moveCanvasTask.mockReset();
		mockCanvasTaskUpdater.deleteCanvasTask.mockReset();
	});

	describe("Canvas to Canvas Movement", () => {
		it("should successfully move Canvas task to another Canvas file", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-1",
				content: "Test Canvas task",
				filePath: "source.canvas",
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

			const moveConfig: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "target.canvas",
				targetSection: "Completed Tasks",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin as any,
				app: mockApp as any,
			};

			// Mock successful move
			mockCanvasTaskUpdater.moveCanvasTask.mockResolvedValue({
				success: true,
			});

			const result = await executor.execute(mockContext, moveConfig);

			expect(result.success).toBe(true);
			expect(result.message).toContain(
				"Task moved to Canvas file target.canvas"
			);
			expect(result.message).toContain("section: Completed Tasks");
			expect(mockCanvasTaskUpdater.moveCanvasTask).toHaveBeenCalledWith(
				canvasTask,
				"target.canvas",
				undefined,
				"Completed Tasks"
			);
		});

		it("should handle Canvas to Canvas move failure", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-2",
				content: "Test Canvas task",
				filePath: "source.canvas",
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

			const moveConfig: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "target.canvas",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin as any,
				app: mockApp as any,
			};

			// Mock move failure
			mockCanvasTaskUpdater.moveCanvasTask.mockResolvedValue({
				success: false,
				error: "Target Canvas file not found",
			});

			const result = await executor.execute(mockContext, moveConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Target Canvas file not found");
		});
	});

	describe("Canvas to Markdown Movement", () => {
		it("should successfully move Canvas task to Markdown file", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-3",
				content: "Test Canvas task",
				filePath: "source.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Test Canvas task #project/test",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-1",
					tags: ["#project/test"],
					children: [],
				},
			};

			const moveConfig: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "target.md",
				targetSection: "Completed Tasks",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin as any,
				app: mockApp as any,
			};

			// Mock successful Canvas deletion
			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: true,
			});

			// Mock target file exists
			const mockTargetFile = { path: "target.md" };
			mockVault.getFileByPath.mockReturnValue(mockTargetFile);
			mockVault.getAbstractFileByPath.mockReturnValue(mockTargetFile);
			mockVault.read.mockResolvedValue(
				"# Target File\n\n## Completed Tasks\n\n"
			);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, moveConfig);

			expect(result.success).toBe(true);
			expect(result.message).toContain(
				"Task moved from Canvas to target.md"
			);
			expect(result.message).toContain("section: Completed Tasks");
			expect(mockCanvasTaskUpdater.deleteCanvasTask).toHaveBeenCalledWith(
				canvasTask
			);
			expect(mockVault.modify).toHaveBeenCalled();
		});

		it("should create target Markdown file if it does not exist", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-4",
				content: "Test Canvas task",
				filePath: "source.canvas",
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

			const moveConfig: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "new-target.md",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin as any,
				app: mockApp as any,
			};

			// Mock successful Canvas deletion
			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: true,
			});

			// Mock target file does not exist initially, then gets created
			const mockCreatedFile = { path: "new-target.md" };
			mockVault.getFileByPath
				.mockReturnValueOnce(null) // File doesn't exist initially
				.mockReturnValueOnce(mockCreatedFile); // File exists after creation
			mockVault.getAbstractFileByPath.mockReturnValue(null);
			mockVault.create.mockResolvedValue(mockCreatedFile);
			mockVault.read.mockResolvedValue("");
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, moveConfig);

			expect(result.success).toBe(true);
			expect(mockVault.create).toHaveBeenCalledWith("new-target.md", "");
			expect(mockVault.modify).toHaveBeenCalled();
		});

		it("should preserve task when target file creation fails", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-preserve",
				content: "Test Canvas task",
				filePath: "source.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Test Canvas task",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-preserve",
					tags: [],
					children: [],
				},
			};

			const moveConfig: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "invalid/path/target.md",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin as any,
				app: mockApp as any,
			};

			// Mock target file does not exist and creation fails
			mockVault.getFileByPath.mockReturnValue(null);
			mockVault.getAbstractFileByPath.mockReturnValue(null);
			mockVault.create.mockRejectedValue(new Error("Invalid path"));

			const result = await executor.execute(mockContext, moveConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain(
				"Failed to create target file: invalid/path/target.md"
			);
			// Verify that deleteCanvasTask was NOT called since move failed
			expect(
				mockCanvasTaskUpdater.deleteCanvasTask
			).not.toHaveBeenCalled();
		});

		it("should handle Canvas deletion failure after successful move", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-5",
				content: "Test Canvas task",
				filePath: "source.canvas",
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

			const moveConfig: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "target.md",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin as any,
				app: mockApp as any,
			};

			// Mock successful target file operations but Canvas deletion failure
			const mockTargetFile = { path: "target.md" };
			mockVault.getFileByPath.mockReturnValue(mockTargetFile);
			mockVault.getAbstractFileByPath.mockReturnValue(mockTargetFile);
			mockVault.read.mockResolvedValue("# Target File\n\n");
			mockVault.modify.mockResolvedValue(undefined);

			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: false,
				error: "Canvas node not found",
			});

			const result = await executor.execute(mockContext, moveConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain(
				"Task moved successfully to target.md, but failed to remove from Canvas: Canvas node not found"
			);
			// Verify that target file was modified first
			expect(mockVault.modify).toHaveBeenCalled();
		});

		it("should handle target file creation failure", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-6",
				content: "Test Canvas task",
				filePath: "source.canvas",
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

			const moveConfig: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "invalid/path/target.md",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin as any,
				app: mockApp as any,
			};

			// Mock target file does not exist and creation fails
			mockVault.getFileByPath.mockReturnValue(null);
			mockVault.getAbstractFileByPath.mockReturnValue(null);
			mockVault.create.mockRejectedValue(new Error("Invalid path"));

			const result = await executor.execute(mockContext, moveConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain(
				"Failed to create target file: invalid/path/target.md"
			);
		});
	});

	describe("Configuration Validation", () => {
		it("should validate correct move configuration", () => {
			const validConfig: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "target.canvas",
			};

			const isValid = executor["validateConfig"](validConfig);
			expect(isValid).toBe(true);
		});

		it("should reject invalid configuration", async () => {
			const invalidConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "", // Empty target file
			} as OnCompletionMoveConfig;

			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-7",
				content: "Test task",
				filePath: "source.canvas",
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
				plugin: mockPlugin as any,
				app: mockApp as any,
			};

			const result = await executor.execute(mockContext, invalidConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Invalid configuration");
		});
	});

	describe("Description Generation", () => {
		it("should generate correct description with section", () => {
			const config: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "archive.canvas",
				targetSection: "Completed Tasks",
			};

			const description = executor.getDescription(config);
			expect(description).toBe(
				"Move task to archive.canvas (section: Completed Tasks)"
			);
		});

		it("should generate correct description without section", () => {
			const config: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "archive.md",
			};

			const description = executor.getDescription(config);
			expect(description).toBe("Move task to archive.md");
		});
	});
});
