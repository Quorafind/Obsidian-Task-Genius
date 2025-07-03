/**
 * ArchiveActionExecutor Canvas Tests
 *
 * Tests for Canvas task archiving functionality including:
 * - Archiving Canvas tasks to Markdown files
 * - Default and custom archive locations
 * - Archive file creation and section management
 * - Error handling and validation
 */

import { ArchiveActionExecutor } from "../utils/onCompletion/ArchiveActionExecutor";
import {
	OnCompletionActionType,
	OnCompletionExecutionContext,
	OnCompletionArchiveConfig,
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

// Mock vault
const mockVault = {
	getAbstractFileByPath: jest.fn(),
	getFileByPath: jest.fn(),
	read: jest.fn(),
	modify: jest.fn(),
	create: jest.fn(),
	createFolder: jest.fn(),
};

const mockApp = {
	...createMockApp(),
	vault: mockVault,
};

describe("ArchiveActionExecutor - Canvas Tasks", () => {
	let executor: ArchiveActionExecutor;
	let mockContext: OnCompletionExecutionContext;

	beforeEach(() => {
		executor = new ArchiveActionExecutor();

		// Reset mocks
		jest.clearAllMocks();

		// Reset all vault method mocks to default behavior
		mockVault.getAbstractFileByPath.mockReset();
		mockVault.getFileByPath.mockReset();
		mockVault.read.mockReset();
		mockVault.modify.mockReset();
		mockVault.create.mockReset();
		mockVault.createFolder.mockReset();

		// Reset Canvas task updater mocks
		mockCanvasTaskUpdater.deleteCanvasTask.mockReset();
	});

	describe("Canvas Task Archiving", () => {
		it("should successfully archive Canvas task to default archive file", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-1",
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

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock successful Canvas deletion
			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: true,
			});

			// Mock archive file exists
			const mockArchiveFile = { path: "Archive/Completed Tasks.md" };
			mockVault.getFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.getAbstractFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.read.mockResolvedValue(
				"# Archive\n\n## Completed Tasks\n\n"
			);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(true);
			expect(result.message).toContain(
				"Task archived from Canvas to Archive/Completed Tasks.md"
			);
			expect(mockVault.modify).toHaveBeenCalled(); // Archive happens first
			expect(mockCanvasTaskUpdater.deleteCanvasTask).toHaveBeenCalledWith(
				canvasTask
			); // Delete happens after

			// Verify the archived task content includes timestamp
			const modifyCall = mockVault.modify.mock.calls[0];
			const modifiedContent = modifyCall[1];
			expect(modifiedContent).toContain(
				"- [x] Test Canvas task #project/test - Completed"
			);
			expect(modifiedContent).toMatch(/\d{4}-\d{2}-\d{2}/); // Date pattern
		});

		it("should successfully archive Canvas task to custom archive file", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-2",
				content: "Important Canvas task",
				filePath: "project.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Important Canvas task ⏫",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-2",
					tags: [],
					children: [],
					priority: 4,
				},
			};

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
				archiveFile: "Project Archive.md",
				archiveSection: "High Priority Tasks",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock successful Canvas deletion
			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: true,
			});

			// Mock custom archive file exists
			const mockArchiveFile = { path: "Project Archive.md" };
			mockVault.getFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.getAbstractFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.read.mockResolvedValue(
				"# Project Archive\n\n## High Priority Tasks\n\n"
			);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(true);
			expect(result.message).toContain(
				"Task archived from Canvas to Project Archive.md"
			);
			expect(mockVault.modify).toHaveBeenCalled();

			// Verify the task was added to the correct section
			const modifyCall = mockVault.modify.mock.calls[0];
			const modifiedContent = modifyCall[1];
			expect(modifiedContent).toContain("## High Priority Tasks");
			expect(modifiedContent).toContain(
				"- [x] Important Canvas task ⏫ - Completed"
			);
		});

		it("should create archive file if it does not exist", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-3",
				content: "Test Canvas task",
				filePath: "source.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Test Canvas task",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-3",
					tags: [],
					children: [],
				},
			};

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
				archiveFile: "New Archive/Tasks.md",
				archiveSection: "Completed Tasks",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock successful Canvas deletion
			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: true,
			});

			// Mock archive file does not exist initially, then exists after creation
			const mockCreatedFile = { path: "New Archive/Tasks.md" };
			mockVault.getFileByPath
				.mockReturnValueOnce(null) // Archive file doesn't exist initially
				.mockReturnValueOnce(mockCreatedFile); // File exists after creation
			mockVault.getAbstractFileByPath
				.mockReturnValueOnce(null) // Directory doesn't exist
				.mockReturnValueOnce(mockCreatedFile); // File after creation

			// Mock file creation
			mockVault.create.mockResolvedValue(mockCreatedFile);
			mockVault.createFolder.mockResolvedValue(undefined);
			mockVault.read.mockResolvedValue(
				"# Archive\n\n## Completed Tasks\n\n"
			);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(true);
			expect(mockVault.createFolder).toHaveBeenCalledWith("New Archive");
			expect(mockVault.create).toHaveBeenCalledWith(
				"New Archive/Tasks.md",
				"# Archive\n\n## Completed Tasks\n\n"
			);
			expect(mockVault.modify).toHaveBeenCalled();
		});

		it("should preserve task when archive operation fails", async () => {
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

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
				archiveFile: "invalid/path/archive.md",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock archive file creation failure - file doesn't exist and creation fails
			mockVault.getFileByPath.mockReturnValue(null);
			mockVault.getAbstractFileByPath.mockReturnValue(null);
			mockVault.createFolder.mockRejectedValue(new Error("Invalid path"));
			mockVault.create.mockRejectedValue(new Error("Invalid path"));

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Failed to create archive file");
			// Verify that deleteCanvasTask was NOT called since archive failed
			expect(
				mockCanvasTaskUpdater.deleteCanvasTask
			).not.toHaveBeenCalled();
		});

		it("should handle Canvas deletion failure after successful archive", async () => {
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
					canvasNodeId: "node-4",
					tags: [],
					children: [],
				},
			};

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock successful archive but Canvas deletion failure
			const mockArchiveFile = { path: "Archive/Completed Tasks.md" };
			mockVault.getFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.getAbstractFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.read.mockResolvedValue(
				"# Archive\n\n## Completed Tasks\n\n"
			);
			mockVault.modify.mockResolvedValue(undefined);

			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: false,
				error: "Canvas node not found",
			});

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain(
				"Task archived successfully to Archive/Completed Tasks.md, but failed to remove from Canvas: Canvas node not found"
			);
			// Verify that archive operation was attempted first
			expect(mockVault.modify).toHaveBeenCalled();
		});

		it("should handle archive file creation failure", async () => {
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
					canvasNodeId: "node-5",
					tags: [],
					children: [],
				},
			};

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
				archiveFile: "invalid/path/archive.md",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock archive file creation failure
			mockVault.getFileByPath.mockReturnValue(null);
			mockVault.getAbstractFileByPath.mockReturnValue(null);
			mockVault.create.mockRejectedValue(new Error("Invalid path"));

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Failed to create archive file");
		});

		it("should create new section if section does not exist", async () => {
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
					canvasNodeId: "node-6",
					tags: [],
					children: [],
				},
			};

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
				archiveSection: "New Section",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock successful Canvas deletion
			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: true,
			});

			// Mock archive file exists but without the target section
			const mockArchiveFile = { path: "Archive/Completed Tasks.md" };
			mockVault.getFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.getAbstractFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.read.mockResolvedValue(
				"# Archive\n\n## Other Section\n\nSome content\n"
			);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(true);

			// Verify the new section was created
			const modifyCall = mockVault.modify.mock.calls[0];
			const modifiedContent = modifyCall[1];
			expect(modifiedContent).toContain("## New Section");
			expect(modifiedContent).toContain(
				"- [x] Test Canvas task - Completed"
			);
		});
	});

	describe("Configuration Validation", () => {
		it("should validate correct archive configuration", () => {
			const validConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
			};

			const isValid = executor["validateConfig"](validConfig);
			expect(isValid).toBe(true);
		});

		it("should reject invalid configuration", async () => {
			const invalidConfig = {
				type: OnCompletionActionType.DELETE, // Wrong type
			} as any;

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
					canvasNodeId: "node-7",
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
		it("should generate correct description with default settings", () => {
			const config: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
			};

			const description = executor.getDescription(config);
			expect(description).toBe(
				"Archive task to Archive/Completed Tasks.md (section: Completed Tasks)"
			);
		});

		it("should generate correct description with custom settings", () => {
			const config: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
				archiveFile: "Custom Archive.md",
				archiveSection: "Done Tasks",
			};

			const description = executor.getDescription(config);
			expect(description).toBe(
				"Archive task to Custom Archive.md (section: Done Tasks)"
			);
		});
	});

	describe("OnCompletion Metadata Cleanup", () => {
		it("should remove onCompletion metadata when archiving Canvas task", async () => {
			const canvasTaskWithOnCompletion: Task<CanvasTaskMetadata> = {
				id: "canvas-task-oncompletion",
				content: "Task with onCompletion",
				filePath: "source.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown:
					"- [x] Task with onCompletion 🏁 archive:done.md",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-oncompletion",
					tags: [],
					children: [],
					onCompletion: "archive:done.md",
				},
			};

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
			};

			mockContext = {
				task: canvasTaskWithOnCompletion,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock successful Canvas deletion
			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: true,
			});

			// Mock archive file exists
			const mockArchiveFile = { path: "Archive/Completed Tasks.md" };
			mockVault.getFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.getAbstractFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.read.mockResolvedValue(
				"# Archive\n\n## Completed Tasks\n\n"
			);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(true);

			// Verify the archived task content has onCompletion metadata removed
			const modifyCall = mockVault.modify.mock.calls[0];
			const modifiedContent = modifyCall[1];
			expect(modifiedContent).toContain(
				"- [x] Task with onCompletion - Completed"
			);
			expect(modifiedContent).not.toContain("🏁");
			expect(modifiedContent).not.toContain("archive:done.md");
		});

		it("should remove onCompletion metadata in JSON format when archiving", async () => {
			const canvasTaskWithJsonOnCompletion: Task<CanvasTaskMetadata> = {
				id: "canvas-task-json-oncompletion",
				content: "Task with JSON onCompletion",
				filePath: "source.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown:
					'- [x] Task with JSON onCompletion 🏁 {"type": "archive", "archiveFile": "custom.md"}',
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-json-oncompletion",
					tags: [],
					children: [],
					onCompletion:
						'{"type": "archive", "archiveFile": "custom.md"}',
				},
			};

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
			};

			mockContext = {
				task: canvasTaskWithJsonOnCompletion,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock successful Canvas deletion
			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: true,
			});

			// Mock archive file exists
			const mockArchiveFile = { path: "Archive/Completed Tasks.md" };
			mockVault.getFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.getAbstractFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.read.mockResolvedValue(
				"# Archive\n\n## Completed Tasks\n\n"
			);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(true);

			// Verify the archived task content has JSON onCompletion metadata removed
			const modifyCall = mockVault.modify.mock.calls[0];
			const modifiedContent = modifyCall[1];
			expect(modifiedContent).toContain(
				"- [x] Task with JSON onCompletion - Completed"
			);
			expect(modifiedContent).not.toContain("🏁");
			expect(modifiedContent).not.toContain('{"type": "archive"');
		});

		it("should ensure task is marked as completed when archiving", async () => {
			const incompleteCanvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-incomplete",
				content: "Incomplete task to archive",
				filePath: "source.canvas",
				line: 0,
				completed: false, // Task is not completed
				status: " ",
				originalMarkdown: "- [ ] Incomplete task to archive 🏁 archive",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-incomplete",
					tags: [],
					children: [],
					onCompletion: "archive",
				},
			};

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
			};

			mockContext = {
				task: incompleteCanvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock successful Canvas deletion
			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: true,
			});

			// Mock archive file exists
			const mockArchiveFile = { path: "Archive/Completed Tasks.md" };
			mockVault.getFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.getAbstractFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.read.mockResolvedValue(
				"# Archive\n\n## Completed Tasks\n\n"
			);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(true);

			// Verify the archived task is marked as completed
			const modifyCall = mockVault.modify.mock.calls[0];
			const modifiedContent = modifyCall[1];
			expect(modifiedContent).toContain(
				"- [x] Incomplete task to archive - Completed"
			);
			expect(modifiedContent).not.toContain("- [ ]"); // Should not contain incomplete checkbox
			expect(modifiedContent).not.toContain("🏁");
		});

		it("should remove dataview format onCompletion when archiving", async () => {
			const canvasTaskWithDataviewOnCompletion: Task<CanvasTaskMetadata> =
				{
					id: "canvas-task-dataview-oncompletion",
					content: "Task with dataview onCompletion",
					filePath: "source.canvas",
					line: 0,
					completed: true,
					status: "x",
					originalMarkdown:
						"- [x] Task with dataview onCompletion [onCompletion:: archive:done.md]",
					metadata: {
						sourceType: "canvas",
						canvasNodeId: "node-dataview-oncompletion",
						tags: [],
						children: [],
						onCompletion: "archive:done.md",
					},
				};

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
			};

			mockContext = {
				task: canvasTaskWithDataviewOnCompletion,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock successful Canvas deletion
			mockCanvasTaskUpdater.deleteCanvasTask.mockResolvedValue({
				success: true,
			});

			// Mock archive file exists
			const mockArchiveFile = { path: "Archive/Completed Tasks.md" };
			mockVault.getFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.getAbstractFileByPath.mockReturnValue(mockArchiveFile);
			mockVault.read.mockResolvedValue(
				"# Archive\n\n## Completed Tasks\n\n"
			);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(true);

			// Verify the archived task content has dataview onCompletion metadata removed
			const modifyCall = mockVault.modify.mock.calls[0];
			const modifiedContent = modifyCall[1];
			expect(modifiedContent).toContain(
				"- [x] Task with dataview onCompletion - Completed"
			);
			expect(modifiedContent).not.toContain("[onCompletion::");
			expect(modifiedContent).not.toContain("archive:done.md");
		});
	});
});
