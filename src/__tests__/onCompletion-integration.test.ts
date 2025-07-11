/**
 * OnCompletion Integration Tests
 *
 * End-to-end tests for onCompletion functionality including:
 * - Complete workflow from task completion to action execution
 * - Integration between OnCompletionManager and action executors
 * - Real-world usage scenarios
 * - Performance considerations
 */

import { OnCompletionManager } from "../utils/OnCompletionManager";
import { Task } from "../types/task";
import { createMockPlugin, createMockApp } from "./mockUtils";
import { OnCompletionActionType } from "../types/onCompletion";

// Mock all the actual executor implementations
jest.mock("../utils/onCompletion/DeleteActionExecutor", () => ({
	DeleteActionExecutor: jest.fn().mockImplementation(() => ({
		execute: jest
			.fn()
			.mockResolvedValue({ success: true, message: "Task deleted" }),
		validateConfig: jest.fn().mockReturnValue(true),
		getDescription: jest.fn().mockReturnValue("Delete task"),
	})),
}));

jest.mock("../utils/onCompletion/CompleteActionExecutor", () => ({
	CompleteActionExecutor: jest.fn().mockImplementation(() => ({
		execute: jest
			.fn()
			.mockResolvedValue({ success: true, message: "Tasks completed" }),
		validateConfig: jest.fn().mockReturnValue(true),
		getDescription: jest.fn().mockReturnValue("Complete related tasks"),
	})),
}));

jest.mock("../utils/onCompletion/MoveActionExecutor", () => ({
	MoveActionExecutor: jest.fn().mockImplementation(() => ({
		execute: jest
			.fn()
			.mockResolvedValue({ success: true, message: "Task moved" }),
		validateConfig: jest.fn().mockReturnValue(true),
		getDescription: jest.fn().mockReturnValue("Move task"),
	})),
}));

jest.mock("../utils/onCompletion/ArchiveActionExecutor", () => ({
	ArchiveActionExecutor: jest.fn().mockImplementation(() => ({
		execute: jest
			.fn()
			.mockResolvedValue({ success: true, message: "Task archived" }),
		validateConfig: jest.fn().mockReturnValue(true),
		getDescription: jest.fn().mockReturnValue("Archive task"),
	})),
}));

jest.mock("../utils/onCompletion/DuplicateActionExecutor", () => ({
	DuplicateActionExecutor: jest.fn().mockImplementation(() => ({
		execute: jest
			.fn()
			.mockResolvedValue({ success: true, message: "Task duplicated" }),
		validateConfig: jest.fn().mockReturnValue(true),
		getDescription: jest.fn().mockReturnValue("Duplicate task"),
	})),
}));

jest.mock("../utils/onCompletion/KeepActionExecutor", () => ({
	KeepActionExecutor: jest.fn().mockImplementation(() => ({
		execute: jest
			.fn()
			.mockResolvedValue({ success: true, message: "Task kept" }),
		validateConfig: jest.fn().mockReturnValue(true),
		getDescription: jest.fn().mockReturnValue("Keep task"),
	})),
}));

describe("OnCompletion Integration Tests", () => {
	let manager: OnCompletionManager;
	let mockApp: any;
	let mockPlugin: any;

	beforeEach(() => {
		mockApp = createMockApp();
		mockPlugin = createMockPlugin();

		// Mock workspace events
		mockApp.workspace = {
			...mockApp.workspace,
			on: jest.fn().mockReturnValue({ unload: jest.fn() }),
		};

		// Mock plugin event registration
		mockPlugin.registerEvent = jest.fn();

		manager = new OnCompletionManager(mockApp, mockPlugin);
		manager.onload();
	});

	afterEach(() => {
		manager.unload();
	});

	describe("End-to-End Workflow Tests", () => {
		it("should handle complete delete workflow", async () => {
			const task: Task = {
				id: "delete-task",
				content: "Task to delete on completion",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: "delete",
					tags: [],
					children: [],
				},
				line: 1,
				filePath: "test.md",
				originalMarkdown:
					"- [x] Task to delete on completion 🏁 delete",
			};

			// Simulate task completion event
			await manager["handleTaskCompleted"](task);

			// Verify the delete executor was called
			const deleteExecutor = manager["executors"].get(
				OnCompletionActionType.DELETE
			);
			expect(deleteExecutor?.execute).toHaveBeenCalledWith(
				{
					task,
					plugin: mockPlugin,
					app: mockApp,
				},
				{ type: OnCompletionActionType.DELETE }
			);
		});

		it("should handle complete task completion workflow", async () => {
			const task: Task = {
				id: "main-task",
				content: "Main task that completes others",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: "complete:subtask-1,subtask-2,subtask-3",
					tags: [],
					children: [],
				},
				line: 1,
				filePath: "project.md",
				originalMarkdown:
					"- [x] Main task that completes others 🏁 complete:subtask-1,subtask-2,subtask-3",
			};

			await manager["handleTaskCompleted"](task);

			const completeExecutor = manager["executors"].get(
				OnCompletionActionType.COMPLETE
			);
			expect(completeExecutor?.execute).toHaveBeenCalledWith(
				{
					task,
					plugin: mockPlugin,
					app: mockApp,
				},
				{
					type: OnCompletionActionType.COMPLETE,
					taskIds: ["subtask-1", "subtask-2", "subtask-3"],
				}
			);
		});

		it("should handle move workflow with JSON configuration", async () => {
			const task: Task = {
				id: "move-task",
				content: "Task to move to archive",
				completed: true,
				status: "x",
				metadata: {
					onCompletion:
						'{"type": "move", "targetFile": "archive/completed.md", "targetSection": "Done"}',
					tags: [],
					children: [],
				},
				line: 5,
				filePath: "current.md",
				originalMarkdown:
					"- [x] Task to move to archive 🏁 move:archive/completed.md#Done",
			};

			await manager["handleTaskCompleted"](task);

			const moveExecutor = manager["executors"].get(
				OnCompletionActionType.MOVE
			);
			expect(moveExecutor?.execute).toHaveBeenCalledWith(
				{
					task,
					plugin: mockPlugin,
					app: mockApp,
				},
				{
					type: OnCompletionActionType.MOVE,
					targetFile: "archive/completed.md",
					targetSection: "Done",
				}
			);
		});

		it("should handle archive workflow", async () => {
			const task: Task = {
				id: "archive-task",
				content: "Task to archive",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: "archive:old-tasks.md",
					tags: [],
					children: [],
				},
				line: 3,
				filePath: "active.md",
				originalMarkdown:
					"- [x] Task to archive 🏁 archive:old-tasks.md",
			};

			await manager["handleTaskCompleted"](task);

			const archiveExecutor = manager["executors"].get(
				OnCompletionActionType.ARCHIVE
			);
			expect(archiveExecutor?.execute).toHaveBeenCalledWith(
				{
					task,
					plugin: mockPlugin,
					app: mockApp,
				},
				{
					type: OnCompletionActionType.ARCHIVE,
					archiveFile: "old-tasks.md",
				}
			);
		});

		it("should handle duplicate workflow", async () => {
			const task: Task = {
				id: "template-task",
				content: "Template task to duplicate",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: "duplicate:templates/recurring.md",
					tags: [],
					children: [],
				},
				line: 2,
				filePath: "weekly.md",
				originalMarkdown:
					"- [x] Template task to duplicate 🏁 duplicate:templates/recurring.md",
			};

			await manager["handleTaskCompleted"](task);

			const duplicateExecutor = manager["executors"].get(
				OnCompletionActionType.DUPLICATE
			);
			expect(duplicateExecutor?.execute).toHaveBeenCalledWith(
				{
					task,
					plugin: mockPlugin,
					app: mockApp,
				},
				{
					type: OnCompletionActionType.DUPLICATE,
					targetFile: "templates/recurring.md",
				}
			);
		});

		it("should handle keep workflow (no action)", async () => {
			const task: Task = {
				id: "keep-task",
				content: "Task to keep in place",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: "keep",
					tags: [],
					children: [],
				},
				line: 1,
				filePath: "important.md",
				originalMarkdown: "- [x] Task to keep in place 🏁 keep",
			};

			await manager["handleTaskCompleted"](task);

			const keepExecutor = manager["executors"].get(
				OnCompletionActionType.KEEP
			);
			expect(keepExecutor?.execute).toHaveBeenCalledWith(
				{
					task,
					plugin: mockPlugin,
					app: mockApp,
				},
				{ type: OnCompletionActionType.KEEP }
			);
		});
	});

	describe("Complex Scenarios", () => {
		it("should handle task without onCompletion metadata", async () => {
			const task: Task = {
				id: "normal-task",
				content: "Normal task without onCompletion",
				completed: true,
				status: "x",
				metadata: {
					tags: [],
					children: [],
				},
				line: 1,
				filePath: "test.md",
				originalMarkdown: "- [x] Normal task without onCompletion",
			};

			await manager["handleTaskCompleted"](task);

			// No executors should be called
			Object.values(manager["executors"]).forEach((executor) => {
				expect(executor.execute).not.toHaveBeenCalled();
			});
		});

		it("should handle invalid onCompletion configuration gracefully", async () => {
			const task: Task = {
				id: "invalid-task",
				content: "Task with invalid onCompletion",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: "invalid-action-type",
					tags: [],
					children: [],
				},
				line: 1,
				filePath: "test.md",
				originalMarkdown:
					"- [x] Task with invalid onCompletion 🏁 invalid-action-type",
			};

			// 恢复原始 console.warn
			const originalWarn = console.warn;
			console.warn = jest.fn();
			const consoleSpy = console.warn;

			await manager["handleTaskCompleted"](task);

			expect(consoleSpy).toHaveBeenCalledWith(
				"Invalid onCompletion configuration:",
				"Unrecognized onCompletion format"
			);

			// 恢复原始方法
			console.warn = originalWarn;
		});

		it("should handle executor execution failure", async () => {
			const task: Task = {
				id: "failing-task",
				content: "Task that will fail to delete",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: "delete",
					tags: [],
					children: [],
				},
				line: 1,
				filePath: "test.md",
				originalMarkdown:
					"- [x] Task that will fail to delete 🏁 delete",
			};

			// Mock executeOnCompletion to throw an error
			const originalExecuteOnCompletion = manager.executeOnCompletion;
			manager.executeOnCompletion = jest
				.fn()
				.mockRejectedValue(new Error("Execution failed"));

			// 恢复原始 console.error
			const originalError = console.error;
			console.error = jest.fn();
			const consoleSpy = console.error;

			await manager["handleTaskCompleted"](task);

			expect(consoleSpy).toHaveBeenCalledWith(
				"Error executing onCompletion action:",
				expect.any(Error)
			);

			// 恢复原始方法
			console.error = originalError;
			manager.executeOnCompletion = originalExecuteOnCompletion;
		});
	});

	describe("Performance and Reliability", () => {
		it("should handle multiple rapid task completions", async () => {
			const tasks: Task[] = Array.from({ length: 10 }, (_, i) => ({
				id: `task-${i}`,
				content: `Task ${i}`,
				completed: true,
				status: "x",
				metadata: {
					onCompletion: "delete",
					tags: [],
					children: [],
				},
				line: i + 1,
				filePath: "test.md",
				originalMarkdown: `- [x] Task ${i} 🏁 delete`,
			}));

			// Process all tasks simultaneously
			await Promise.all(
				tasks.map((task) => manager["handleTaskCompleted"](task))
			);

			const deleteExecutor = manager["executors"].get(
				OnCompletionActionType.DELETE
			);
			expect(deleteExecutor?.execute).toHaveBeenCalledTimes(10);
		});

		it("should handle mixed action types in rapid succession", async () => {
			const tasks: Task[] = [
				{
					id: "delete-task",
					content: "Delete task",
					completed: true,
					status: "x",
					metadata: {
						onCompletion: "delete",
						tags: [],
						children: [],
					},
					line: 1,
					filePath: "test.md",
					originalMarkdown: "- [x] Delete task 🏁 delete",
				},
				{
					id: "move-task",
					content: "Move task",
					completed: true,
					status: "x",
					metadata: {
						onCompletion: "move:archive.md",
						tags: [],
						children: [],
					},
					line: 2,
					filePath: "test.md",
					originalMarkdown: "- [x] Move task 🏁 move:archive.md",
				},
				{
					id: "complete-task",
					content: "Complete task",
					completed: true,
					status: "x",
					metadata: {
						onCompletion: "complete:related-1,related-2",
						tags: [],
						children: [],
					},
					line: 3,
					filePath: "test.md",
					originalMarkdown:
						"- [x] Complete task 🏁 complete:related-1,related-2",
				},
			];

			await Promise.all(
				tasks.map((task) => manager["handleTaskCompleted"](task))
			);

			expect(
				manager["executors"].get(OnCompletionActionType.DELETE)?.execute
			).toHaveBeenCalledTimes(1);
			expect(
				manager["executors"].get(OnCompletionActionType.MOVE)?.execute
			).toHaveBeenCalledTimes(1);
			expect(
				manager["executors"].get(OnCompletionActionType.COMPLETE)
					?.execute
			).toHaveBeenCalledTimes(1);
		});

		it("should handle malformed JSON configurations", async () => {
			const task: Task = {
				id: "malformed-json-task",
				content: "Task with malformed JSON",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: '{"type": "move", "targetFile": "archive.md"', // Missing closing brace
					tags: [],
					children: [],
				},
				line: 1,
				filePath: "test.md",
				originalMarkdown:
					"- [x] Task with malformed JSON 🏁 move:archive.md",
			};

			// 恢复原始 console.warn
			const originalWarn = console.warn;
			console.warn = jest.fn();
			const consoleSpy = console.warn;

			await manager["handleTaskCompleted"](task);

			expect(consoleSpy).toHaveBeenCalledWith(
				"Invalid onCompletion configuration:",
				expect.stringContaining("Parse error:")
			);

			// 恢复原始方法
			console.warn = originalWarn;
		});
	});

	describe("Real-world Usage Scenarios", () => {
		it("should handle project completion workflow", async () => {
			// Scenario: Project manager task that completes all subtasks and archives the project
			const projectTask: Task = {
				id: "project-manager",
				content: "Complete project milestone",
				completed: true,
				status: "x",
				metadata: {
					onCompletion:
						'{"type": "complete", "taskIds": ["design-task", "dev-task", "test-task"]}',
					tags: [],
					children: [],
				},
				line: 1,
				filePath: "project.md",
				originalMarkdown:
					"- [x] Complete project milestone 🏁 complete:design-task,dev-task,test-task",
			};

			await manager["handleTaskCompleted"](projectTask);

			const completeExecutor = manager["executors"].get(
				OnCompletionActionType.COMPLETE
			);
			expect(completeExecutor?.execute).toHaveBeenCalledWith(
				expect.any(Object),
				{
					type: OnCompletionActionType.COMPLETE,
					taskIds: ["design-task", "dev-task", "test-task"],
				}
			);
		});

		it("should handle recurring task workflow", async () => {
			// Scenario: Weekly task that duplicates itself for next week
			const recurringTask: Task = {
				id: "weekly-review",
				content: "Weekly team review",
				completed: true,
				status: "x",
				metadata: {
					onCompletion:
						'{"type": "duplicate", "targetFile": "next-week.md", "preserveMetadata": true}',
					tags: [],
					children: [],
				},
				line: 1,
				filePath: "this-week.md",
				originalMarkdown:
					"- [x] Weekly team review 🏁 duplicate:next-week.md",
			};

			await manager["handleTaskCompleted"](recurringTask);

			const duplicateExecutor = manager["executors"].get(
				OnCompletionActionType.DUPLICATE
			);
			expect(duplicateExecutor?.execute).toHaveBeenCalledWith(
				expect.any(Object),
				{
					type: OnCompletionActionType.DUPLICATE,
					targetFile: "next-week.md",
					preserveMetadata: true,
				}
			);
		});

		it("should handle cleanup workflow", async () => {
			// Scenario: Temporary task that deletes itself when done
			const tempTask: Task = {
				id: "temp-reminder",
				content: "Temporary reminder - delete when done",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: "delete",
					tags: [],
					children: [],
				},
				line: 5,
				filePath: "daily-notes.md",
				originalMarkdown:
					"- [x] Temporary reminder - delete when done 🏁 delete",
			};

			await manager["handleTaskCompleted"](tempTask);

			const deleteExecutor = manager["executors"].get(
				OnCompletionActionType.DELETE
			);
			expect(deleteExecutor?.execute).toHaveBeenCalledWith(
				expect.any(Object),
				{ type: OnCompletionActionType.DELETE }
			);
		});

		it("should handle archival workflow", async () => {
			// Scenario: Important task that moves to archive when completed
			const importantTask: Task = {
				id: "important-milestone",
				content: "Important project milestone",
				completed: true,
				status: "x",
				metadata: {
					onCompletion:
						'{"type": "move", "targetFile": "archive/2024-milestones.md", "targetSection": "Q1 Achievements"}',
					tags: [],
					children: [],
				},
				line: 1,
				filePath: "current-milestones.md",
				originalMarkdown:
					"- [x] Important project milestone 🏁 move:archive/2024-milestones.md#Q1 Achievements",
			};

			await manager["handleTaskCompleted"](importantTask);

			const moveExecutor = manager["executors"].get(
				OnCompletionActionType.MOVE
			);
			expect(moveExecutor?.execute).toHaveBeenCalledWith(
				expect.any(Object),
				{
					type: OnCompletionActionType.MOVE,
					targetFile: "archive/2024-milestones.md",
					targetSection: "Q1 Achievements",
				}
			);
		});
	});

	describe("Edge Cases and Error Recovery", () => {
		it("should handle empty onCompletion values", async () => {
			const task: Task = {
				id: "empty-oncompletion",
				content: "Task with empty onCompletion",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: "",
					tags: [],
					children: [],
				},
				line: 1,
				filePath: "test.md",
				originalMarkdown: "- [x] Task with empty onCompletion 🏁 ",
			};

			// 恢复原始 console.warn
			const originalWarn = console.warn;
			console.warn = jest.fn();
			const consoleSpy = console.warn;

			await manager["handleTaskCompleted"](task);

			expect(consoleSpy).toHaveBeenCalledWith(
				"Invalid onCompletion configuration:",
				"Empty or invalid onCompletion value"
			);

			// 恢复原始方法
			console.warn = originalWarn;
		});

		it("should handle null onCompletion values", async () => {
			const task: Task = {
				id: "null-oncompletion",
				content: "Task with null onCompletion",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: null as any,
					tags: [],
					children: [],
				},
				line: 1,
				filePath: "test.md",
				originalMarkdown: "- [x] Task with null onCompletion 🏁 ",
			};

			// 恢复原始 console.warn
			const originalWarn = console.warn;
			console.warn = jest.fn();
			const consoleSpy = console.warn;

			await manager["handleTaskCompleted"](task);

			expect(consoleSpy).toHaveBeenCalledWith(
				"Invalid onCompletion configuration:",
				"Empty or invalid onCompletion value"
			);

			// 恢复原始方法
			console.warn = originalWarn;
		});

		it("should handle tasks with complex metadata", async () => {
			const task: Task = {
				id: "complex-metadata-task",
				content: "Task with complex metadata",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: "delete",
					priority: 3,
					project: "test-project",
					tags: ["important", "urgent"],
					dueDate: Date.now(),
					children: [],
				},
				line: 1,
				filePath: "test.md",
				originalMarkdown:
					"- [x] Task with complex metadata 🔼 #important #urgent #project/test-project 🏁 delete ",
			};

			await manager["handleTaskCompleted"](task);

			const deleteExecutor = manager["executors"].get(
				OnCompletionActionType.DELETE
			);
			expect(deleteExecutor?.execute).toHaveBeenCalledWith(
				{
					task,
					plugin: mockPlugin,
					app: mockApp,
				},
				{ type: OnCompletionActionType.DELETE }
			);
		});
	});
});
