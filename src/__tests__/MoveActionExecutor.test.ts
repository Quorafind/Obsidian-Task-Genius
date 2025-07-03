/**
 * MoveActionExecutor Tests
 *
 * Tests for move action executor functionality including:
 * - Moving tasks to target files
 * - Creating target files if they don't exist
 * - Section-based organization
 * - Configuration validation
 * - Error handling
 */

import { MoveActionExecutor } from "../utils/onCompletion/MoveActionExecutor";
import {
	OnCompletionActionType,
	OnCompletionExecutionContext,
	OnCompletionMoveConfig,
} from "../types/onCompletion";
import { Task } from "../types/task";
import { createMockPlugin, createMockApp } from "./mockUtils";

// Mock Obsidian vault operations
const mockVault = {
	read: jest.fn(),
	modify: jest.fn(),
	create: jest.fn(),
	getFileByPath: jest.fn(),
};

const mockApp = {
	...createMockApp(),
	vault: mockVault,
};

describe("MoveActionExecutor", () => {
	let executor: MoveActionExecutor;
	let mockTask: Task;
	let mockContext: OnCompletionExecutionContext;

	beforeEach(() => {
		executor = new MoveActionExecutor();

		mockTask = {
			id: "test-task-id",
			content: "Task to move",
			completed: true,
			status: "x",
			originalMarkdown: "- [x] Task to move",
			metadata: {
				onCompletion: "move:archive/completed.md",
				tags: [],
				children: [],
			},
			line: 3,
			filePath: "current.md",
		};

		mockContext = {
			task: mockTask,
			plugin: createMockPlugin(),
			app: mockApp as any,
		};

		// Reset mocks
		jest.clearAllMocks();
	});

	describe("Configuration Validation", () => {
		it("should validate correct move configuration", () => {
			const config: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "archive.md",
			};

			expect(executor["validateConfig"](config)).toBe(true);
		});

		it("should validate move configuration with section", () => {
			const config: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "archive.md",
				targetSection: "Completed Tasks",
			};

			expect(executor["validateConfig"](config)).toBe(true);
		});

		it("should reject configuration with wrong type", () => {
			const config = {
				type: OnCompletionActionType.DELETE,
				targetFile: "archive.md",
			} as any;

			expect(executor["validateConfig"](config)).toBe(false);
		});

		it("should reject configuration without targetFile", () => {
			const config = {
				type: OnCompletionActionType.MOVE,
			} as any;

			expect(executor["validateConfig"](config)).toBe(false);
		});

		it("should reject configuration with empty targetFile", () => {
			const config: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "",
			};

			expect(executor["validateConfig"](config)).toBe(false);
		});
	});

	describe("Task Moving", () => {
		let config: OnCompletionMoveConfig;

		beforeEach(() => {
			config = {
				type: OnCompletionActionType.MOVE,
				targetFile: "archive/completed.md",
			};
		});

		it("should move task to existing target file", async () => {
			const sourceContent = `# Current Tasks

- [ ] Keep this task
- [x] Task to move
- [ ] Keep this task too`;

			const targetContent = `# Completed Tasks

- [x] Previous completed task`;

			const expectedSourceContent = `# Current Tasks

- [ ] Keep this task
- [ ] Keep this task too`;

			const expectedTargetContent = `# Completed Tasks

- [x] Previous completed task
- [x] Task to move`;

			// Mock source file operations
			mockVault.getFileByPath
				.mockReturnValueOnce({ path: "current.md" }) // Source file
				.mockReturnValueOnce({ path: "archive/completed.md" }); // Target file
			mockVault.read
				.mockResolvedValueOnce(sourceContent) // Read source
				.mockResolvedValueOnce(targetContent); // Read target
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(true);
			expect(result.message).toBe(
				"Task moved to archive/completed.md successfully"
			);

			// Verify source file was updated (task removed)
			expect(mockVault.modify).toHaveBeenCalledWith(
				{ path: "current.md" },
				expectedSourceContent
			);

			// Verify target file was updated (task added)
			expect(mockVault.modify).toHaveBeenCalledWith(
				{ path: "archive/completed.md" },
				expectedTargetContent
			);
		});

		it("should create target file if it does not exist", async () => {
			const sourceContent = `# Current Tasks

- [x] Task to move`;

			const expectedSourceContent = `# Current Tasks`;

			const expectedTargetContent = `- [x] Task to move`;

			// Mock source file operations
			mockVault.getFileByPath
				.mockReturnValueOnce({ path: "current.md" }) // Source file exists
				.mockReturnValueOnce(null); // Target file doesn't exist
			mockVault.read.mockResolvedValueOnce(sourceContent);
			mockVault.create.mockResolvedValue({
				path: "archive/completed.md",
			});
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(true);
			expect(result.message).toBe(
				"Task moved to archive/completed.md successfully"
			);

			// Verify target file was created with task
			expect(mockVault.create).toHaveBeenCalledWith(
				"archive/completed.md",
				expectedTargetContent
			);

			// Verify source file was updated
			expect(mockVault.modify).toHaveBeenCalledWith(
				{ path: "current.md" },
				expectedSourceContent
			);
		});

		it("should move task to specific section in target file", async () => {
			const configWithSection: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "archive.md",
				targetSection: "Completed Tasks",
			};

			const sourceContent = `- [x] Task to move`;

			const targetContent = `# Archive

## In Progress Tasks
- [/] Some ongoing task

## Completed Tasks
- [x] Previous completed task

## Other Section
- [ ] Some other task`;

			const expectedTargetContent = `# Archive

## In Progress Tasks
- [/] Some ongoing task

## Completed Tasks
- [x] Previous completed task
- [x] Task to move

## Other Section
- [ ] Some other task`;

			mockVault.getFileByPath
				.mockReturnValueOnce({ path: "current.md" })
				.mockReturnValueOnce({ path: "archive.md" });
			mockVault.read
				.mockResolvedValueOnce(sourceContent)
				.mockResolvedValueOnce(targetContent);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(
				mockContext,
				configWithSection
			);

			expect(result.success).toBe(true);
			expect(mockVault.modify).toHaveBeenCalledWith(
				{ path: "archive.md" },
				expectedTargetContent
			);
		});

		it("should create section if it does not exist in target file", async () => {
			const configWithSection: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "archive.md",
				targetSection: "New Section",
			};

			const sourceContent = `- [x] Task to move`;

			const targetContent = `# Archive

## Existing Section
- [x] Existing task`;

			const expectedTargetContent = `# Archive

## Existing Section
- [x] Existing task

## New Section
- [x] Task to move`;

			mockVault.getFileByPath
				.mockReturnValueOnce({ path: "current.md" })
				.mockReturnValueOnce({ path: "archive.md" });
			mockVault.read
				.mockResolvedValueOnce(sourceContent)
				.mockResolvedValueOnce(targetContent);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(
				mockContext,
				configWithSection
			);

			expect(result.success).toBe(true);
			expect(mockVault.modify).toHaveBeenCalledWith(
				{ path: "archive.md" },
				expectedTargetContent
			);
		});

		it("should handle task not found in source file", async () => {
			const sourceContent = `# Current Tasks

- [ ] Different task
- [ ] Another task`;

			mockVault.getFileByPath.mockReturnValueOnce({
				path: "current.md",
			});
			mockVault.read.mockResolvedValueOnce(sourceContent);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Task not found in source file");
		});

		it("should handle source file not found", async () => {
			mockVault.getFileByPath.mockReturnValueOnce(null);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Source file not found: current.md");
		});

		it("should handle target file creation error", async () => {
			const sourceContent = `- [x] Task to move`;

			mockVault.getFileByPath
				.mockReturnValueOnce({ path: "current.md" })
				.mockReturnValueOnce(null); // Target doesn't exist
			mockVault.read.mockResolvedValueOnce(sourceContent);
			mockVault.create.mockRejectedValue(new Error("Permission denied"));

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Failed to move task: Permission denied");
		});

		it("should preserve task metadata and formatting", async () => {
			const taskWithMetadata = {
				...mockTask,
				content: "Task with metadata #tag @context 📅 2024-01-01",
			};

			const contextWithMetadata = {
				...mockContext,
				task: taskWithMetadata,
			};

			const sourceContent = `- [x] Task with metadata #tag @context 📅 2024-01-01`;
			const targetContent = `# Archive`;
			const expectedTargetContent = `# Archive

- [x] Task with metadata #tag @context 📅 2024-01-01`;

			mockVault.getFileByPath
				.mockReturnValueOnce({ path: "current.md" })
				.mockReturnValueOnce({ path: "archive/completed.md" });
			mockVault.read
				.mockResolvedValueOnce(sourceContent)
				.mockResolvedValueOnce(targetContent);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(contextWithMetadata, config);

			expect(result.success).toBe(true);
			expect(mockVault.modify).toHaveBeenCalledWith(
				{ path: "archive/completed.md" },
				expectedTargetContent
			);
		});
	});

	describe("Invalid Configuration Handling", () => {
		it("should return error for invalid configuration", async () => {
			const invalidConfig = {
				type: OnCompletionActionType.DELETE,
			} as any;

			const result = await executor.execute(mockContext, invalidConfig);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Invalid move configuration");
		});
	});

	describe("Description Generation", () => {
		it("should return correct description without section", () => {
			const config: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "archive.md",
			};

			const description = executor.getDescription(config);

			expect(description).toBe("Move task to archive.md");
		});

		it("should return correct description with section", () => {
			const config: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "archive.md",
				targetSection: "Completed",
			};

			const description = executor.getDescription(config);

			expect(description).toBe(
				"Move task to archive.md (section: Completed)"
			);
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty source file", async () => {
			const config: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "archive.md",
			};

			mockVault.getFileByPath.mockReturnValueOnce({
				path: "current.md",
			});
			mockVault.read.mockResolvedValueOnce("");

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Task not found in source file");
		});

		it("should handle empty target file", async () => {
			const sourceContent = `- [x] Task to move`;
			const expectedTargetContent = `- [x] Task to move`;

			mockVault.getFileByPath
				.mockReturnValueOnce({ path: "current.md" })
				.mockReturnValueOnce({ path: "archive.md" });
			mockVault.read
				.mockResolvedValueOnce(sourceContent)
				.mockResolvedValueOnce(""); // Empty target file
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(true);
			expect(mockVault.modify).toHaveBeenCalledWith(
				{ path: "archive.md" },
				expectedTargetContent
			);
		});

		it("should handle nested task structure", async () => {
			const sourceContent = `# Project

- [ ] Parent task
  - [x] Task to move
  - [ ] Sibling task`;

			const expectedSourceContent = `# Project

- [ ] Parent task
  - [ ] Sibling task`;

			const targetContent = `# Archive`;
			const expectedTargetContent = `# Archive

- [x] Task to move`;

			mockVault.getFileByPath
				.mockReturnValueOnce({ path: "current.md" })
				.mockReturnValueOnce({ path: "archive.md" });
			mockVault.read
				.mockResolvedValueOnce(sourceContent)
				.mockResolvedValueOnce(targetContent);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(true);
			expect(mockVault.modify).toHaveBeenCalledWith(
				{ path: "current.md" },
				expectedSourceContent
			);
			expect(mockVault.modify).toHaveBeenCalledWith(
				{ path: "archive.md" },
				expectedTargetContent
			);
		});
	});

	describe("OnCompletion Metadata Cleanup", () => {
		it("should remove onCompletion metadata when moving task", async () => {
			const taskWithOnCompletion: Task = {
				id: "task-with-oncompletion",
				content: "Task with onCompletion",
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Task with onCompletion 🏁 delete",
				metadata: {
					onCompletion: "delete",
					tags: [],
					children: [],
				},
				line: 2,
				filePath: "source.md",
			};

			const sourceContent = `# Tasks

- [x] Task with onCompletion 🏁 delete
- [ ] Other task`;

			const targetContent = `# Archive

- [x] Previous task`;

			const expectedSourceContent = `# Tasks

- [ ] Other task`;

			const expectedTargetContent = `# Archive

- [x] Previous task
- [x] Task with onCompletion`;

			const config: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "archive.md",
			};

			// Mock source and target file operations
			mockVault.getFileByPath
				.mockReturnValueOnce({ path: "source.md" }) // Source file
				.mockReturnValueOnce({ path: "archive.md" }); // Target file
			mockVault.read
				.mockResolvedValueOnce(sourceContent) // Read source
				.mockResolvedValueOnce(targetContent); // Read target
			mockVault.modify.mockResolvedValue(undefined);

			const context: OnCompletionExecutionContext = {
				task: taskWithOnCompletion,
				plugin: createMockPlugin(),
				app: mockApp as any,
			};

			const result = await executor.execute(context, config);

			expect(result.success).toBe(true);

			// Verify source file was updated (task removed)
			expect(mockVault.modify).toHaveBeenCalledWith(
				{ path: "source.md" },
				expectedSourceContent
			);

			// Verify target file was updated (task added without onCompletion)
			expect(mockVault.modify).toHaveBeenCalledWith(
				{ path: "archive.md" },
				expectedTargetContent
			);
		});

		it("should remove onCompletion metadata in dataview format", async () => {
			const taskWithDataviewOnCompletion: Task = {
				id: "task-with-dataview-oncompletion",
				content: "Task with dataview onCompletion",
				completed: true,
				status: "x",
				originalMarkdown:
					"- [x] Task with dataview onCompletion [onCompletion:: move:archive.md]",
				metadata: {
					onCompletion: "move:archive.md",
					tags: [],
					children: [],
				},
				line: 0,
				filePath: "source.md",
			};

			const sourceContent = `- [x] Task with dataview onCompletion [onCompletion:: move:archive.md]`;
			const targetContent = `# Archive`;

			const expectedSourceContent = ``;
			const expectedTargetContent = `# Archive
- [x] Task with dataview onCompletion`;

			const config: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "archive.md",
			};

			// Mock file operations
			mockVault.getFileByPath
				.mockReturnValueOnce({ path: "source.md" })
				.mockReturnValueOnce({ path: "archive.md" });
			mockVault.read
				.mockResolvedValueOnce(sourceContent)
				.mockResolvedValueOnce(targetContent);
			mockVault.modify.mockResolvedValue(undefined);

			const context: OnCompletionExecutionContext = {
				task: taskWithDataviewOnCompletion,
				plugin: createMockPlugin(),
				app: mockApp as any,
			};

			const result = await executor.execute(context, config);

			expect(result.success).toBe(true);
			expect(mockVault.modify).toHaveBeenCalledWith(
				{ path: "archive.md" },
				expectedTargetContent
			);
		});

		it("should remove onCompletion metadata in JSON format", async () => {
			const taskWithJsonOnCompletion: Task = {
				id: "task-with-json-oncompletion",
				content: "Task with JSON onCompletion",
				completed: true,
				status: "x",
				originalMarkdown:
					'- [x] Task with JSON onCompletion 🏁 {"type": "move", "targetFile": "archive.md"}',
				metadata: {
					onCompletion:
						'{"type": "move", "targetFile": "archive.md"}',
					tags: [],
					children: [],
				},
				line: 0,
				filePath: "source.md",
			};

			const sourceContent = `- [x] Task with JSON onCompletion 🏁 {"type": "move", "targetFile": "archive.md"}`;
			const targetContent = ``;

			const expectedSourceContent = ``;
			const expectedTargetContent = `
- [x] Task with JSON onCompletion`;

			const config: OnCompletionMoveConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "archive.md",
			};

			// Mock file operations
			mockVault.getFileByPath
				.mockReturnValueOnce({ path: "source.md" })
				.mockReturnValueOnce({ path: "archive.md" });
			mockVault.read
				.mockResolvedValueOnce(sourceContent)
				.mockResolvedValueOnce(targetContent);
			mockVault.modify.mockResolvedValue(undefined);

			const context: OnCompletionExecutionContext = {
				task: taskWithJsonOnCompletion,
				plugin: createMockPlugin(),
				app: mockApp as any,
			};

			const result = await executor.execute(context, config);

			expect(result.success).toBe(true);

			// Verify source file was updated (task removed)
			expect(mockVault.modify).toHaveBeenCalledWith(
				{ path: "source.md" },
				expectedSourceContent
			);

			// Verify target file was updated (task added without onCompletion)
			expect(mockVault.modify).toHaveBeenCalledWith(
				{ path: "archive.md" },
				expectedTargetContent
			);
		});
	});
});
