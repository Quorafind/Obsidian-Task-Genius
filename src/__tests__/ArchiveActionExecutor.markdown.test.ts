/**
 * ArchiveActionExecutor Markdown Tests
 *
 * Tests for ArchiveActionExecutor Markdown task functionality including:
 * - Basic archive operations
 * - OnCompletion metadata cleanup
 * - Task completion status enforcement
 */

import { ArchiveActionExecutor } from "../utils/onCompletion/ArchiveActionExecutor";
import {
	OnCompletionExecutionContext,
	OnCompletionArchiveConfig,
	OnCompletionActionType,
} from "../types/onCompletion";
import { Task } from "../types/task";
import { createMockPlugin, createMockApp } from "./mockUtils";
import TaskProgressBarPlugin from "../index";

// Mock Date to return consistent date for tests
const mockDate = new Date("2025-07-04T12:00:00.000Z");
const originalDate = Date;

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
	vault: mockVault,
};

describe("ArchiveActionExecutor - Markdown Tasks", () => {
	let executor: ArchiveActionExecutor;
	let mockContext: OnCompletionExecutionContext;
	let mockPlugin: any;
	let mockApp: any;

	beforeEach(() => {
		executor = new ArchiveActionExecutor();

		// Create fresh mock instances for each test
		mockPlugin = createMockPlugin();
		mockApp = createMockApp();

		// Mock Date globally
		global.Date = jest.fn(() => mockDate) as any;
		global.Date.now = jest.fn(() => mockDate.getTime());
		global.Date.parse = originalDate.parse;
		global.Date.UTC = originalDate.UTC;

		// Reset mocks
		jest.clearAllMocks();

		// Reset all vault method mocks to default behavior
		mockApp.vault.getAbstractFileByPath.mockReset();
		mockApp.vault.getFileByPath.mockReset();
		mockApp.vault.read.mockReset();
		mockApp.vault.modify.mockReset();
		mockApp.vault.create.mockReset();
		mockApp.vault.createFolder.mockReset();

		// Mock the current date to ensure consistent test results
		jest.spyOn(Date.prototype, "toISOString").mockReturnValue(
			"2025-07-07T00:00:00.000Z"
		);
		jest.spyOn(Date.prototype, "getFullYear").mockReturnValue(2025);
		jest.spyOn(Date.prototype, "getMonth").mockReturnValue(6); // July (0-indexed)
		jest.spyOn(Date.prototype, "getDate").mockReturnValue(7);
	});

	afterEach(() => {
		// Restore date mocks
		jest.restoreAllMocks();
	});

	afterEach(() => {
		// Restore original Date
		global.Date = originalDate;
	});

	describe("Markdown Task Archiving", () => {
		it("should successfully archive Markdown task with onCompletion metadata cleanup", async () => {
			const markdownTask: Task = {
				id: "markdown-task-1",
				content: "Task with onCompletion",
				filePath: "source.md",
				line: 3,
				completed: true,
				status: "x",
				originalMarkdown:
					"- [x] Task with onCompletion 🏁 archive:done.md",
				metadata: {
					tags: [],
					children: [],
					onCompletion: "archive:done.md",
				},
			};

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
			};

			mockContext = {
				task: markdownTask,
				plugin: mockPlugin,
				app: mockApp as any,
			};

			// Mock source file
			const mockSourceFile = { path: "source.md" };
			mockApp.vault.getFileByPath
				.mockReturnValueOnce(mockSourceFile) // Source file
				.mockReturnValueOnce({ path: "Archive/Completed Tasks.md" }); // Archive file

			// Mock file contents
			const sourceContent =
				"# Tasks\n\n- [ ] Other task\n- [x] Task with onCompletion 🏁 archive:done.md\n- [ ] Another task";
			const archiveContent = "# Archive\n\n## Completed Tasks\n\n";

			mockApp.vault.read
				.mockResolvedValueOnce(sourceContent) // Read source
				.mockResolvedValueOnce(archiveContent); // Read archive

			mockApp.vault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(true);
			expect(result.message).toContain(
				"Task archived to Archive/Completed Tasks.md"
			);

			// Verify source file was updated (task removed)
			const sourceModifyCall = mockApp.vault.modify.mock.calls[0];
			const updatedSourceContent = sourceModifyCall[1];
			expect(updatedSourceContent).toBe(
				"# Tasks\n\n- [ ] Other task\n- [ ] Another task"
			);

			// Verify archive file was updated (task added without onCompletion metadata)
			const archiveModifyCall = mockApp.vault.modify.mock.calls[1];
			const updatedArchiveContent = archiveModifyCall[1];
			expect(updatedArchiveContent).toContain(
				"- [x] Task with onCompletion ✅ 2025-07-07 (from source.md)"
			);
			expect(updatedArchiveContent).not.toContain("🏁");
			expect(updatedArchiveContent).not.toContain("archive:done.md");
			expect(updatedArchiveContent).toMatch(/\d{4}-\d{2}-\d{2}/); // Date pattern
		});

		it("should ensure incomplete Markdown task is marked as completed when archived", async () => {
			const incompleteMarkdownTask: Task = {
				id: "markdown-task-incomplete",
				content: "Incomplete task to archive",
				filePath: "source.md",
				line: 1,
				completed: false, // Task is not completed
				status: " ",
				originalMarkdown: "- [ ] Incomplete task to archive 🏁 archive",
				metadata: {
					tags: [],
					children: [],
					onCompletion: "archive",
				},
			};

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
			};

			mockContext = {
				task: incompleteMarkdownTask,
				plugin: mockPlugin,
				app: mockApp as any,
			};

			// Mock source file
			const mockSourceFile = { path: "source.md" };
			mockApp.vault.getFileByPath
				.mockReturnValueOnce(mockSourceFile) // Source file
				.mockReturnValueOnce({ path: "Archive/Completed Tasks.md" }); // Archive file

			// Mock file contents
			const sourceContent =
				"# Tasks\n- [ ] Incomplete task to archive 🏁 archive\n- [ ] Other task";
			const archiveContent = "# Archive\n\n## Completed Tasks\n\n";

			mockApp.vault.read
				.mockResolvedValueOnce(sourceContent) // Read source
				.mockResolvedValueOnce(archiveContent); // Read archive

			mockApp.vault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(true);

			// Verify archive file contains completed task without onCompletion metadata
			const archiveModifyCall = mockApp.vault.modify.mock.calls[1];
			const updatedArchiveContent = archiveModifyCall[1];
			expect(updatedArchiveContent).toContain(
				"- [x] Incomplete task to archive ✅ 2025-07-07 (from source.md)"
			);
			expect(updatedArchiveContent).not.toContain("- [ ]"); // Should not contain incomplete checkbox
			expect(updatedArchiveContent).not.toContain("🏁");
		});

		it("should remove dataview format onCompletion from Markdown task", async () => {
			const markdownTaskWithDataview: Task = {
				id: "markdown-task-dataview",
				content: "Task with dataview onCompletion",
				filePath: "source.md",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown:
					"- [x] Task with dataview onCompletion [onCompletion:: archive:done.md]",
				metadata: {
					tags: [],
					children: [],
					onCompletion: "archive:done.md",
				},
			};

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
			};

			mockContext = {
				task: markdownTaskWithDataview,
				plugin: mockPlugin,
				app: mockApp as any,
			};

			// Mock source file
			const mockSourceFile = { path: "source.md" };
			mockApp.vault.getFileByPath
				.mockReturnValueOnce(mockSourceFile) // Source file
				.mockReturnValueOnce({ path: "Archive/Completed Tasks.md" }); // Archive file

			// Mock file contents
			const sourceContent =
				"- [x] Task with dataview onCompletion [onCompletion:: archive:done.md]";
			const archiveContent = "# Archive\n\n## Completed Tasks\n\n";

			mockApp.vault.read
				.mockResolvedValueOnce(sourceContent) // Read source
				.mockResolvedValueOnce(archiveContent); // Read archive

			mockApp.vault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(true);

			// Verify archive file contains task without dataview onCompletion metadata
			const archiveModifyCall = mockApp.vault.modify.mock.calls[1];
			const updatedArchiveContent = archiveModifyCall[1];
			expect(updatedArchiveContent).toContain(
				"- [x] Task with dataview onCompletion ✅ 2025-07-07 (from source.md)"
			);
			expect(updatedArchiveContent).not.toContain("[onCompletion::");
			expect(updatedArchiveContent).not.toContain("archive:done.md");
		});

		it("should remove JSON format onCompletion from Markdown task", async () => {
			const markdownTaskWithJson: Task = {
				id: "markdown-task-json",
				content: "Task with JSON onCompletion",
				filePath: "source.md",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown:
					'- [x] Task with JSON onCompletion 🏁 {"type": "archive", "archiveFile": "custom.md"}',
				metadata: {
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
				task: markdownTaskWithJson,
				plugin: mockPlugin,
				app: mockApp as any,
			};

			// Mock source file
			const mockSourceFile = { path: "source.md" };
			mockApp.vault.getFileByPath
				.mockReturnValueOnce(mockSourceFile) // Source file
				.mockReturnValueOnce({ path: "Archive/Completed Tasks.md" }); // Archive file

			// Mock file contents
			const sourceContent =
				'- [x] Task with JSON onCompletion 🏁 {"type": "archive", "archiveFile": "custom.md"}';
			const archiveContent = "# Archive\n\n## Completed Tasks\n\n";

			mockApp.vault.read
				.mockResolvedValueOnce(sourceContent) // Read source
				.mockResolvedValueOnce(archiveContent); // Read archive

			mockApp.vault.modify.mockResolvedValue(undefined);

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(true);

			// Verify archive file contains task without JSON onCompletion metadata
			const archiveModifyCall = mockApp.vault.modify.mock.calls[1];
			const updatedArchiveContent = archiveModifyCall[1];
			expect(updatedArchiveContent).toContain(
				"- [x] Task with JSON onCompletion ✅ 2025-07-07 (from source.md)"
			);
			expect(updatedArchiveContent).not.toContain("🏁");
			expect(updatedArchiveContent).not.toContain('{"type": "archive"');
		});
	});

	describe("Error Handling", () => {
		it("should handle source file not found", async () => {
			const markdownTask: Task = {
				id: "markdown-task-error",
				content: "Task in missing file",
				filePath: "missing.md",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Task in missing file",
				metadata: {
					tags: [],
					children: [],
				},
			};

			const archiveConfig: OnCompletionArchiveConfig = {
				type: OnCompletionActionType.ARCHIVE,
			};

			mockContext = {
				task: markdownTask,
				plugin: mockPlugin,
				app: mockApp as any,
			};

			// Mock source file not found
			mockApp.vault.getFileByPath.mockReturnValue(null);

			const result = await executor.execute(mockContext, archiveConfig);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Source file not found: missing.md");
		});
	});
});
