/**
 * DeleteActionExecutor Tests
 *
 * Tests for delete action executor functionality including:
 * - Task deletion from file system
 * - Configuration validation
 * - Error handling
 */

import { DeleteActionExecutor } from "../utils/onCompletion/DeleteActionExecutor";
import {
	OnCompletionActionType,
	OnCompletionExecutionContext,
	OnCompletionDeleteConfig,
} from "../types/onCompletion";
import { Task } from "../types/task";
import { createMockPlugin, createMockApp } from "./mockUtils";

// Mock Obsidian vault operations
const mockVault = {
	read: jest.fn(),
	modify: jest.fn(),
	getAbstractFileByPath: jest.fn(),
	getFileByPath: jest.fn(),
};

const mockApp = {
	...createMockApp(),
	vault: mockVault,
};

describe("DeleteActionExecutor", () => {
	let executor: DeleteActionExecutor;
	let mockTask: Task;
	let mockContext: OnCompletionExecutionContext;
	let mockPlugin: any;
	let mockApp: any;

	beforeEach(() => {
		executor = new DeleteActionExecutor();

		mockTask = {
			id: "test-task-id",
			content: "Test task to delete",
			completed: true,
			status: "x",
			metadata: {
				tags: [],
				children: [],
				onCompletion: "delete",
			},
			originalMarkdown: "- [x] Test task to delete 🏁 delete",
			line: 5,
			filePath: "test.md",
		};

		// Create fresh mock instances for each test
		mockPlugin = createMockPlugin();
		mockApp = createMockApp();

		mockContext = {
			task: mockTask,
			plugin: mockPlugin,
			app: mockApp,
		};

		// Reset mocks
		jest.clearAllMocks();
	});

	describe("Configuration Validation", () => {
		it("should validate correct delete configuration", () => {
			const config: OnCompletionDeleteConfig = {
				type: OnCompletionActionType.DELETE,
			};

			expect(executor["validateConfig"](config)).toBe(true);
		});

		it("should reject configuration with wrong type", () => {
			const config = {
				type: OnCompletionActionType.KEEP,
			} as any;

			expect(executor["validateConfig"](config)).toBe(false);
		});

		it("should reject configuration without type", () => {
			const config = {} as any;

			expect(executor["validateConfig"](config)).toBe(false);
		});
	});

	describe("Task Deletion", () => {
		let config: OnCompletionDeleteConfig;

		beforeEach(() => {
			config = { type: OnCompletionActionType.DELETE };
		});

		it("should delete task from file successfully", async () => {
			const fileContent = `# Test File

- [ ] Keep this task
- [x] Test task to delete
- [ ] Keep this task too`;

			const expectedContent = `# Test File

- [ ] Keep this task
- [ ] Keep this task too`;

			// Add originalMarkdown to the task for proper matching
			mockTask.originalMarkdown = "- [x] Test task to delete";

			mockApp.vault.getFileByPath.mockReturnValue({
				path: "test.md",
			});
			mockApp.vault.read.mockResolvedValue(fileContent);
			mockApp.vault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(true);
			expect(result.message).toBe("Task deleted successfully");
			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				{ path: "test.md" },
				expectedContent
			);
		});

		it("should handle task not found in file", async () => {
			const fileContent = `# Test File

- [ ] Some other task
- [ ] Another task`;

			// Set originalMarkdown that won't be found in the file
			mockTask.originalMarkdown = "- [x] Test task to delete";

			mockApp.vault.getFileByPath.mockReturnValue({
				path: "test.md",
			});
			mockApp.vault.read.mockResolvedValue(fileContent);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Task not found in file");
			expect(mockApp.vault.modify).not.toHaveBeenCalled();
		});

		it("should handle file not found", async () => {
			mockApp.vault.getFileByPath.mockReturnValue(null);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(false);
			expect(result.error).toBe("File not found: test.md");
			expect(mockApp.vault.read).not.toHaveBeenCalled();
			expect(mockApp.vault.modify).not.toHaveBeenCalled();
		});

		it("should handle file read error", async () => {
			mockApp.vault.getFileByPath.mockReturnValue({
				path: "test.md",
			});
			mockApp.vault.read.mockRejectedValue(
				new Error("Read permission denied")
			);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(false);
			expect(result.error).toBe(
				"Failed to delete task: Read permission denied"
			);
			expect(mockApp.vault.modify).not.toHaveBeenCalled();
		});

		it("should handle file write error", async () => {
			const fileContent = `- [x] Test task to delete`;

			mockTask.originalMarkdown = "- [x] Test task to delete";

			mockApp.vault.getFileByPath.mockReturnValue({
				path: "test.md",
			});
			mockApp.vault.read.mockResolvedValue(fileContent);
			mockApp.vault.modify.mockRejectedValue(
				new Error("Write permission denied")
			);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(false);
			expect(result.error).toBe(
				"Failed to delete task: Write permission denied"
			);
		});

		it("should handle complex task content with special characters", async () => {
			const taskWithSpecialChars = {
				...mockTask,
				content:
					"Task with [special] (characters) & symbols #tag @context",
				originalMarkdown:
					"- [x] Task with [special] (characters) & symbols #tag @context",
			};

			const contextWithSpecialTask = {
				...mockContext,
				task: taskWithSpecialChars,
			};

			const fileContent = `# Test File

- [x] Task with [special] (characters) & symbols #tag @context
- [ ] Normal task`;

			const expectedContent = `# Test File

- [ ] Normal task`;

			mockApp.vault.getFileByPath.mockReturnValue({
				path: "test.md",
			});
			mockApp.vault.read.mockResolvedValue(fileContent);
			mockApp.vault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(
				contextWithSpecialTask,
				config
			);

			expect(result.success).toBe(true);
			expect(result.message).toBe("Task deleted successfully");
			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				{ path: "test.md" },
				expectedContent
			);
		});

		it("should handle nested task deletion", async () => {
			const fileContent = `# Test File

- [ ] Parent task
  - [x] Test task to delete
  - [ ] Sibling task
- [ ] Another parent task`;

			const expectedContent = `# Test File

- [ ] Parent task
  - [ ] Sibling task
- [ ] Another parent task`;

			mockTask.originalMarkdown = "  - [x] Test task to delete";

			mockApp.vault.getFileByPath.mockReturnValue({
				path: "test.md",
			});
			mockApp.vault.read.mockResolvedValue(fileContent);
			mockApp.vault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(true);
			expect(result.message).toBe("Task deleted successfully");
			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				{ path: "test.md" },
				expectedContent
			);
		});

		it("should preserve empty lines and formatting", async () => {
			const fileContent = `# Test File

Some text here.

- [ ] Keep this task

- [x] Test task to delete

- [ ] Keep this task too

More text here.`;

			const expectedContent = `# Test File

Some text here.

- [ ] Keep this task

- [ ] Keep this task too

More text here.`;

			mockTask.originalMarkdown = "- [x] Test task to delete";

			mockApp.vault.getFileByPath.mockReturnValue({
				path: "test.md",
			});
			mockApp.vault.read.mockResolvedValue(fileContent);
			mockApp.vault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(true);
			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				{ path: "test.md" },
				expectedContent
			);
		});
	});

	describe("Invalid Configuration Handling", () => {
		it("should return error for invalid configuration", async () => {
			const invalidConfig = {
				type: OnCompletionActionType.KEEP,
			} as any;

			const result = await executor.execute(mockContext, invalidConfig);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Invalid configuration");
			expect(mockApp.vault.getFileByPath).not.toHaveBeenCalled();
		});
	});

	describe("Description Generation", () => {
		it("should return correct description", () => {
			const config: OnCompletionDeleteConfig = {
				type: OnCompletionActionType.DELETE,
			};

			const description = executor.getDescription(config);

			expect(description).toBe("Delete the completed task from the file");
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty file", async () => {
			const config: OnCompletionDeleteConfig = {
				type: OnCompletionActionType.DELETE,
			};

			mockTask.originalMarkdown = "- [x] Test task to delete";

			mockApp.vault.getFileByPath.mockReturnValue({
				path: "test.md",
			});
			mockApp.vault.read.mockResolvedValue("");

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Task not found in file");
		});

		it("should handle file with only the target task", async () => {
			const config: OnCompletionDeleteConfig = {
				type: OnCompletionActionType.DELETE,
			};

			const fileContent = "- [x] Test task to delete";
			const expectedContent = "";

			mockTask.originalMarkdown = "- [x] Test task to delete";

			mockApp.vault.getFileByPath.mockReturnValue({
				path: "test.md",
			});
			mockApp.vault.read.mockResolvedValue(fileContent);
			mockApp.vault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(true);
			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				{ path: "test.md" },
				expectedContent
			);
		});

		it("should handle multiple identical tasks (delete first occurrence)", async () => {
			const config: OnCompletionDeleteConfig = {
				type: OnCompletionActionType.DELETE,
			};

			const fileContent = `- [x] Test task to delete
- [ ] Other task
- [x] Test task to delete`;

			const expectedContent = `- [ ] Other task
- [x] Test task to delete`;

			mockTask.originalMarkdown = "- [x] Test task to delete";

			mockApp.vault.getFileByPath.mockReturnValue({
				path: "test.md",
			});
			mockApp.vault.read.mockResolvedValue(fileContent);
			mockApp.vault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, config);

			expect(result.success).toBe(true);
			expect(mockApp.vault.modify).toHaveBeenCalledWith(
				{ path: "test.md" },
				expectedContent
			);
		});
	});
});
