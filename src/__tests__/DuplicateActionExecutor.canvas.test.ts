/**
 * DuplicateActionExecutor Canvas Tests
 *
 * Tests for Canvas task duplication functionality including:
 * - Duplicating Canvas tasks within Canvas files
 * - Duplicating Canvas tasks to Markdown files
 * - Metadata preservation options
 * - Cross-format task duplication
 */

import { DuplicateActionExecutor } from "../utils/onCompletion/DuplicateActionExecutor";
import {
	OnCompletionActionType,
	OnCompletionExecutionContext,
	OnCompletionDuplicateConfig,
} from "../types/onCompletion";
import { Task, CanvasTaskMetadata } from "../types/task";
import { createMockPlugin, createMockApp } from "./mockUtils";

// Mock Canvas task updater
const mockCanvasTaskUpdater = {
	duplicateCanvasTask: jest.fn(),
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
};

const mockApp = {
	...createMockApp(),
	vault: mockVault,
};

describe("DuplicateActionExecutor - Canvas Tasks", () => {
	let executor: DuplicateActionExecutor;
	let mockContext: OnCompletionExecutionContext;

	beforeEach(() => {
		executor = new DuplicateActionExecutor();

		// Reset mocks
		jest.clearAllMocks();
	});

	describe("Canvas to Canvas Duplication", () => {
		it("should successfully duplicate Canvas task within same file", async () => {
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

			const duplicateConfig: OnCompletionDuplicateConfig = {
				type: OnCompletionActionType.DUPLICATE,
				preserveMetadata: true,
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock successful duplication
			mockCanvasTaskUpdater.duplicateCanvasTask.mockResolvedValue({
				success: true,
			});

			const result = await executor.execute(mockContext, duplicateConfig);

			expect(result.success).toBe(true);
			expect(result.message).toContain("Task duplicated in same file");
			expect(
				mockCanvasTaskUpdater.duplicateCanvasTask
			).toHaveBeenCalledWith(
				canvasTask,
				"source.canvas",
				undefined,
				undefined,
				true
			);
		});

		it("should successfully duplicate Canvas task to different Canvas file", async () => {
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

			const duplicateConfig: OnCompletionDuplicateConfig = {
				type: OnCompletionActionType.DUPLICATE,
				targetFile: "target.canvas",
				targetSection: "Templates",
				preserveMetadata: false,
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock successful duplication
			mockCanvasTaskUpdater.duplicateCanvasTask.mockResolvedValue({
				success: true,
			});

			const result = await executor.execute(mockContext, duplicateConfig);

			expect(result.success).toBe(true);
			expect(result.message).toContain(
				"Task duplicated to target.canvas"
			);
			expect(result.message).toContain("section: Templates");
			expect(
				mockCanvasTaskUpdater.duplicateCanvasTask
			).toHaveBeenCalledWith(
				canvasTask,
				"target.canvas",
				undefined,
				"Templates",
				false
			);
		});

		it("should handle Canvas duplication failure", async () => {
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
					canvasNodeId: "node-1",
					tags: [],
					children: [],
				},
			};

			const duplicateConfig: OnCompletionDuplicateConfig = {
				type: OnCompletionActionType.DUPLICATE,
				targetFile: "target.canvas",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock duplication failure
			mockCanvasTaskUpdater.duplicateCanvasTask.mockResolvedValue({
				success: false,
				error: "Target Canvas file not found",
			});

			const result = await executor.execute(mockContext, duplicateConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Target Canvas file not found");
		});
	});

	describe("Canvas to Markdown Duplication", () => {
		it("should successfully duplicate Canvas task to Markdown file", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-4",
				content: "Test Canvas task",
				filePath: "source.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Test Canvas task ✅ 2024-01-15",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-1",
					tags: [],
					children: [],
					completedDate: new Date("2024-01-15").getTime(),
				},
			};

			const duplicateConfig: OnCompletionDuplicateConfig = {
				type: OnCompletionActionType.DUPLICATE,
				targetFile: "templates.md",
				targetSection: "Task Templates",
				preserveMetadata: false,
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock target file exists
			const mockTargetFile = { path: "templates.md" };
			mockVault.getFileByPath.mockReturnValue(mockTargetFile);
			mockVault.read.mockResolvedValue(
				"# Templates\n\n## Task Templates\n\n"
			);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, duplicateConfig);

			expect(result.success).toBe(true);
			expect(result.message).toContain(
				"Task duplicated from Canvas to templates.md"
			);
			expect(result.message).toContain("section: Task Templates");
			expect(mockVault.modify).toHaveBeenCalled();

			// Verify the task content was modified (completion date removed, status reset)
			const modifyCall = mockVault.modify.mock.calls[0];
			const modifiedContent = modifyCall[1];
			expect(modifiedContent).toContain("- [ ] Test Canvas task"); // Status reset to incomplete
			expect(modifiedContent).toContain("(duplicated"); // Duplicate timestamp added
			expect(modifiedContent).not.toContain("✅ 2024-01-15"); // Completion date removed
		});

		it("should preserve metadata when requested", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-5",
				content: "Test Canvas task",
				filePath: "source.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown:
					"- [x] Test Canvas task #project/test ⏰ 2024-01-20",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-1",
					tags: ["#project/test"],
					children: [],
					scheduledDate: new Date("2024-01-20").getTime(),
				},
			};

			const duplicateConfig: OnCompletionDuplicateConfig = {
				type: OnCompletionActionType.DUPLICATE,
				targetFile: "templates.md",
				preserveMetadata: true,
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock target file exists
			const mockTargetFile = { path: "templates.md" };
			mockVault.getFileByPath.mockReturnValue(mockTargetFile);
			mockVault.read.mockResolvedValue("# Templates\n\n");
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, duplicateConfig);

			expect(result.success).toBe(true);

			// Verify metadata was preserved
			const modifyCall = mockVault.modify.mock.calls[0];
			const modifiedContent = modifyCall[1];
			expect(modifiedContent).toContain("- [ ] Test Canvas task"); // Status reset
			expect(modifiedContent).toContain("#project/test"); // Project tag preserved
			expect(modifiedContent).toContain("⏰ 2024-01-20"); // Scheduled date preserved
			expect(modifiedContent).toContain("(duplicated"); // Duplicate timestamp added
		});

		it("should create target Markdown file if it does not exist", async () => {
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

			const duplicateConfig: OnCompletionDuplicateConfig = {
				type: OnCompletionActionType.DUPLICATE,
				targetFile: "new-templates.md",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock target file does not exist, then gets created
			mockVault.getFileByPath.mockReturnValue(null);
			const mockCreatedFile = { path: "new-templates.md" };
			mockVault.create.mockResolvedValue(mockCreatedFile);
			mockVault.read.mockResolvedValue("");
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, duplicateConfig);

			expect(result.success).toBe(true);
			expect(mockVault.create).toHaveBeenCalledWith(
				"new-templates.md",
				""
			);
			expect(mockVault.modify).toHaveBeenCalled();
		});

		it("should handle target file creation failure", async () => {
			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-7",
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

			const duplicateConfig: OnCompletionDuplicateConfig = {
				type: OnCompletionActionType.DUPLICATE,
				targetFile: "invalid/path/templates.md",
			};

			mockContext = {
				task: canvasTask,
				plugin: mockPlugin,
				app: mockApp,
			};

			// Mock target file does not exist and creation fails
			mockVault.getFileByPath.mockReturnValue(null);
			mockVault.create.mockRejectedValue(new Error("Invalid path"));

			const result = await executor.execute(mockContext, duplicateConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain(
				"Failed to create target file: invalid/path/templates.md"
			);
		});
	});

	describe("Configuration Validation", () => {
		it("should validate correct duplicate configuration", () => {
			const validConfig: OnCompletionDuplicateConfig = {
				type: OnCompletionActionType.DUPLICATE,
			};

			const isValid = executor["validateConfig"](validConfig);
			expect(isValid).toBe(true);
		});

		it("should reject invalid configuration", async () => {
			const invalidConfig = {
				type: OnCompletionActionType.MOVE, // Wrong type
			} as any;

			const canvasTask: Task<CanvasTaskMetadata> = {
				id: "canvas-task-8",
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
				plugin: mockPlugin,
				app: mockApp,
			};

			const result = await executor.execute(mockContext, invalidConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Invalid configuration");
		});
	});

	describe("Description Generation", () => {
		it("should generate correct description for same file duplication", () => {
			const config: OnCompletionDuplicateConfig = {
				type: OnCompletionActionType.DUPLICATE,
			};

			const description = executor.getDescription(config);
			expect(description).toBe("Duplicate task in same file");
		});

		it("should generate correct description for different file duplication", () => {
			const config: OnCompletionDuplicateConfig = {
				type: OnCompletionActionType.DUPLICATE,
				targetFile: "templates.canvas",
				targetSection: "Task Templates",
			};

			const description = executor.getDescription(config);
			expect(description).toBe(
				"Duplicate task to templates.canvas (section: Task Templates)"
			);
		});
	});
});
