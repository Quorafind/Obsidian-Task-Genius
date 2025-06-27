/**
 * OnCompletionManager Tests
 *
 * Tests for onCompletion functionality including:
 * - Configuration parsing (simple and JSON formats)
 * - Action executor dispatching
 * - Task completion event handling
 * - Error handling and validation
 */

import { OnCompletionManager } from "../utils/OnCompletionManager";
import {
	OnCompletionActionType,
	OnCompletionConfig,
	OnCompletionExecutionResult,
	OnCompletionParseResult,
} from "../types/onCompletion";
import { Task } from "../types/task";
import { createMockPlugin, createMockApp } from "./mockUtils";
import TaskProgressBarPlugin from "../index";

// Mock all action executors
jest.mock("../utils/onCompletion/DeleteActionExecutor");
jest.mock("../utils/onCompletion/KeepActionExecutor");
jest.mock("../utils/onCompletion/CompleteActionExecutor");
jest.mock("../utils/onCompletion/MoveActionExecutor");
jest.mock("../utils/onCompletion/ArchiveActionExecutor");
jest.mock("../utils/onCompletion/DuplicateActionExecutor");

describe("OnCompletionManager", () => {
	let manager: OnCompletionManager;
	let mockApp: any;
	let mockPlugin: TaskProgressBarPlugin;

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
	});

	afterEach(() => {
		manager.unload();
	});

	describe("Initialization", () => {
		it("should initialize all action executors", () => {
			// Verify that all executor types are registered
			expect(manager["executors"].size).toBe(6);
			expect(
				manager["executors"].has(OnCompletionActionType.DELETE)
			).toBe(true);
			expect(manager["executors"].has(OnCompletionActionType.KEEP)).toBe(
				true
			);
			expect(
				manager["executors"].has(OnCompletionActionType.COMPLETE)
			).toBe(true);
			expect(manager["executors"].has(OnCompletionActionType.MOVE)).toBe(
				true
			);
			expect(
				manager["executors"].has(OnCompletionActionType.ARCHIVE)
			).toBe(true);
			expect(
				manager["executors"].has(OnCompletionActionType.DUPLICATE)
			).toBe(true);
		});

		it("should register task completion event listener on load", () => {
			manager.onload();

			expect(mockApp.workspace.on).toHaveBeenCalledWith(
				"task-genius:task-completed",
				expect.any(Function)
			);
			expect(mockPlugin.registerEvent).toHaveBeenCalled();
		});
	});

	describe("Configuration Parsing", () => {
		describe("Simple Format Parsing", () => {
			it("should parse simple delete action", () => {
				const result = manager.parseOnCompletion("delete");

				expect(result.isValid).toBe(true);
				expect(result.config).toEqual({
					type: OnCompletionActionType.DELETE,
				});
				expect(result.error).toBeUndefined();
			});

			it("should parse simple keep action", () => {
				const result = manager.parseOnCompletion("keep");

				expect(result.isValid).toBe(true);
				expect(result.config).toEqual({
					type: OnCompletionActionType.KEEP,
				});
			});

			it("should parse simple archive action", () => {
				const result = manager.parseOnCompletion("archive");

				expect(result.isValid).toBe(true);
				expect(result.config).toEqual({
					type: OnCompletionActionType.ARCHIVE,
				});
			});

			it("should parse complete action with task IDs", () => {
				const result = manager.parseOnCompletion(
					"complete:task1,task2,task3"
				);

				expect(result.isValid).toBe(true);
				expect(result.config).toEqual({
					type: OnCompletionActionType.COMPLETE,
					taskIds: ["task1", "task2", "task3"],
				});
			});

			it("should parse move action with target file", () => {
				const result = manager.parseOnCompletion(
					"move:archive/completed.md"
				);

				expect(result.isValid).toBe(true);
				expect(result.config).toEqual({
					type: OnCompletionActionType.MOVE,
					targetFile: "archive/completed.md",
				});
			});

			it("should parse archive action with target file", () => {
				const result = manager.parseOnCompletion(
					"archive:archive/old-tasks.md"
				);

				expect(result.isValid).toBe(true);
				expect(result.config).toEqual({
					type: OnCompletionActionType.ARCHIVE,
					archiveFile: "archive/old-tasks.md",
				});
			});

			it("should parse duplicate action with target file", () => {
				const result = manager.parseOnCompletion(
					"duplicate:templates/task-template.md"
				);

				expect(result.isValid).toBe(true);
				expect(result.config).toEqual({
					type: OnCompletionActionType.DUPLICATE,
					targetFile: "templates/task-template.md",
				});
			});

			it("should handle case-insensitive parsing", () => {
				const result1 = manager.parseOnCompletion("DELETE");
				const result2 = manager.parseOnCompletion("Keep");
				const result3 = manager.parseOnCompletion("ARCHIVE");

				expect(result1.isValid).toBe(true);
				expect(result1.config?.type).toBe(
					OnCompletionActionType.DELETE
				);
				expect(result2.isValid).toBe(true);
				expect(result2.config?.type).toBe(OnCompletionActionType.KEEP);
				expect(result3.isValid).toBe(true);
				expect(result3.config?.type).toBe(
					OnCompletionActionType.ARCHIVE
				);
			});

			it("should handle whitespace in parsing", () => {
				const result = manager.parseOnCompletion(
					"  complete: task1 , task2 , task3  "
				);

				expect(result.isValid).toBe(true);
				expect(result.config).toEqual({
					type: OnCompletionActionType.COMPLETE,
					taskIds: ["task1", "task2", "task3"],
				});
			});
		});

		describe("JSON Format Parsing", () => {
			it("should parse JSON delete configuration", () => {
				const jsonConfig = '{"type": "delete"}';
				const result = manager.parseOnCompletion(jsonConfig);

				expect(result.isValid).toBe(true);
				expect(result.config).toEqual({
					type: OnCompletionActionType.DELETE,
				});
			});

			it("should parse JSON complete configuration", () => {
				const jsonConfig =
					'{"type": "complete", "taskIds": ["task1", "task2"]}';
				const result = manager.parseOnCompletion(jsonConfig);

				expect(result.isValid).toBe(true);
				expect(result.config).toEqual({
					type: OnCompletionActionType.COMPLETE,
					taskIds: ["task1", "task2"],
				});
			});

			it("should parse JSON move configuration", () => {
				const jsonConfig =
					'{"type": "move", "targetFile": "done.md", "targetSection": "Completed"}';
				const result = manager.parseOnCompletion(jsonConfig);

				expect(result.isValid).toBe(true);
				expect(result.config).toEqual({
					type: OnCompletionActionType.MOVE,
					targetFile: "done.md",
					targetSection: "Completed",
				});
			});

			it("should parse JSON archive configuration", () => {
				const jsonConfig =
					'{"type": "archive", "archiveFile": "archive.md", "archiveSection": "Old Tasks"}';
				const result = manager.parseOnCompletion(jsonConfig);

				expect(result.isValid).toBe(true);
				expect(result.config).toEqual({
					type: OnCompletionActionType.ARCHIVE,
					archiveFile: "archive.md",
					archiveSection: "Old Tasks",
				});
			});

			it("should parse JSON duplicate configuration", () => {
				const jsonConfig =
					'{"type": "duplicate", "targetFile": "template.md", "preserveMetadata": true}';
				const result = manager.parseOnCompletion(jsonConfig);

				expect(result.isValid).toBe(true);
				expect(result.config).toEqual({
					type: OnCompletionActionType.DUPLICATE,
					targetFile: "template.md",
					preserveMetadata: true,
				});
			});
		});

		describe("Error Handling", () => {
			it("should handle empty input", () => {
				const result = manager.parseOnCompletion("");

				expect(result.isValid).toBe(false);
				expect(result.config).toBeNull();
				expect(result.error).toBe(
					"Empty or invalid onCompletion value"
				);
			});

			it("should handle null input", () => {
				const result = manager.parseOnCompletion(null as any);

				expect(result.isValid).toBe(false);
				expect(result.config).toBeNull();
				expect(result.error).toBe(
					"Empty or invalid onCompletion value"
				);
			});

			it("should handle invalid JSON", () => {
				const result = manager.parseOnCompletion('{"type": "delete"'); // Missing closing brace

				expect(result.isValid).toBe(false);
				expect(result.config).toBeNull();
				expect(result.error).toContain("Parse error:");
			});

			it("should handle unrecognized simple format", () => {
				const result = manager.parseOnCompletion("unknown-action");

				expect(result.isValid).toBe(false);
				expect(result.config).toBeNull();
				expect(result.error).toBe("Unrecognized onCompletion format");
			});

			it("should handle invalid configuration structure", () => {
				const jsonConfig = '{"invalidKey": "value"}';
				const result = manager.parseOnCompletion(jsonConfig);

				expect(result.isValid).toBe(false);
				expect(result.error).toBe("Invalid configuration structure");
			});
		});
	});

	describe("Configuration Validation", () => {
		it("should validate delete configuration", () => {
			const config: OnCompletionConfig = {
				type: OnCompletionActionType.DELETE,
			};
			expect(manager["validateConfig"](config)).toBe(true);
		});

		it("should validate keep configuration", () => {
			const config: OnCompletionConfig = {
				type: OnCompletionActionType.KEEP,
			};
			expect(manager["validateConfig"](config)).toBe(true);
		});

		it("should validate complete configuration with task IDs", () => {
			const config: OnCompletionConfig = {
				type: OnCompletionActionType.COMPLETE,
				taskIds: ["task1", "task2"],
			};
			expect(manager["validateConfig"](config)).toBe(true);
		});

		it("should invalidate complete configuration without task IDs", () => {
			const config: OnCompletionConfig = {
				type: OnCompletionActionType.COMPLETE,
				taskIds: [],
			};
			expect(manager["validateConfig"](config)).toBe(false);
		});

		it("should validate move configuration with target file", () => {
			const config: OnCompletionConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "target.md",
			};
			expect(manager["validateConfig"](config)).toBe(true);
		});

		it("should invalidate move configuration without target file", () => {
			const config: OnCompletionConfig = {
				type: OnCompletionActionType.MOVE,
				targetFile: "",
			};
			expect(manager["validateConfig"](config)).toBe(false);
		});

		it("should validate archive configuration", () => {
			const config: OnCompletionConfig = {
				type: OnCompletionActionType.ARCHIVE,
			};
			expect(manager["validateConfig"](config)).toBe(true);
		});

		it("should validate duplicate configuration", () => {
			const config: OnCompletionConfig = {
				type: OnCompletionActionType.DUPLICATE,
			};
			expect(manager["validateConfig"](config)).toBe(true);
		});

		it("should invalidate configuration without type", () => {
			const config = {} as OnCompletionConfig;
			expect(manager["validateConfig"](config)).toBe(false);
		});
	});

	describe("Action Execution", () => {
		let mockTask: Task;

		beforeEach(() => {
			mockTask = {
				id: "test-task-id",
				content: "Test task",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: "delete",
				},
				lineNumber: 1,
				filePath: "test.md",
			};
		});

		it("should execute delete action successfully", async () => {
			const config: OnCompletionConfig = {
				type: OnCompletionActionType.DELETE,
			};
			const mockExecutor = manager["executors"].get(
				OnCompletionActionType.DELETE
			);

			if (mockExecutor) {
				mockExecutor.execute = jest.fn().mockResolvedValue({
					success: true,
					message: "Task deleted successfully",
				});
			}

			const result = await manager.executeOnCompletion(mockTask, config);

			expect(result.success).toBe(true);
			expect(result.message).toBe("Task deleted successfully");
			expect(mockExecutor?.execute).toHaveBeenCalledWith(
				{
					task: mockTask,
					plugin: mockPlugin,
					app: mockApp,
				},
				config
			);
		});

		it("should handle executor not found", async () => {
			const config = { type: "unknown" as OnCompletionActionType };

			const result = await manager.executeOnCompletion(mockTask, config);

			expect(result.success).toBe(false);
			expect(result.error).toBe(
				"No executor found for action type: unknown"
			);
		});

		it("should handle executor execution error", async () => {
			const config: OnCompletionConfig = {
				type: OnCompletionActionType.DELETE,
			};
			const mockExecutor = manager["executors"].get(
				OnCompletionActionType.DELETE
			);

			if (mockExecutor) {
				mockExecutor.execute = jest
					.fn()
					.mockRejectedValue(new Error("Execution failed"));
			}

			const result = await manager.executeOnCompletion(mockTask, config);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Execution failed: Execution failed");
		});
	});

	describe("Task Completion Event Handling", () => {
		let mockTask: Task;

		beforeEach(() => {
			mockTask = {
				id: "test-task-id",
				content: "Test task",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: "delete",
				},
				lineNumber: 1,
				filePath: "test.md",
			};

			// Mock the executeOnCompletion method
			manager.executeOnCompletion = jest.fn().mockResolvedValue({
				success: true,
				message: "Action executed successfully",
			});
		});

		it("should handle task completion with valid onCompletion config", async () => {
			await manager["handleTaskCompleted"](mockTask);

			expect(manager.executeOnCompletion).toHaveBeenCalledWith(mockTask, {
				type: OnCompletionActionType.DELETE,
			});
		});

		it("should ignore task completion without onCompletion config", async () => {
			const taskWithoutConfig = { ...mockTask };
			delete taskWithoutConfig.metadata.onCompletion;

			await manager["handleTaskCompleted"](taskWithoutConfig);

			expect(manager.executeOnCompletion).not.toHaveBeenCalled();
		});

		it("should handle task completion with invalid onCompletion config", async () => {
			const taskWithInvalidConfig = {
				...mockTask,
				metadata: { onCompletion: "invalid-action" },
			};

			const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

			await manager["handleTaskCompleted"](taskWithInvalidConfig);

			expect(manager.executeOnCompletion).not.toHaveBeenCalled();
			expect(consoleSpy).toHaveBeenCalledWith(
				"Invalid onCompletion configuration:",
				"Unrecognized onCompletion format"
			);

			consoleSpy.mockRestore();
		});

		it("should handle execution errors gracefully", async () => {
			manager.executeOnCompletion = jest
				.fn()
				.mockRejectedValue(new Error("Execution error"));

			// 恢复原始 console.error
			const originalError = console.error;
			console.error = jest.fn();
			const consoleSpy = console.error as jest.Mock;

			await manager["handleTaskCompleted"](mockTask);

			expect(consoleSpy).toHaveBeenCalledWith(
				"Error executing onCompletion action:",
				expect.any(Error)
			);

			// 恢复原始方法
			console.error = originalError;
		});
	});

	describe("Integration Tests", () => {
		it("should handle complete workflow from parsing to execution", async () => {
			const mockTask: Task = {
				id: "integration-test-task",
				content: "Integration test task",
				completed: true,
				status: "x",
				metadata: {
					onCompletion: "complete:related-task-1,related-task-2",
				},
				lineNumber: 1,
				filePath: "test.md",
			};

			const mockExecutor = manager["executors"].get(
				OnCompletionActionType.COMPLETE
			);
			if (mockExecutor) {
				mockExecutor.execute = jest.fn().mockResolvedValue({
					success: true,
					message: "Related tasks completed successfully",
				});
			}

			// Test the complete workflow
			await manager["handleTaskCompleted"](mockTask);

			expect(mockExecutor?.execute).toHaveBeenCalledWith(
				{
					task: mockTask,
					plugin: mockPlugin,
					app: mockApp,
				},
				{
					type: OnCompletionActionType.COMPLETE,
					taskIds: ["related-task-1", "related-task-2"],
				}
			);
		});

		it("should handle JSON configuration workflow", async () => {
			const mockTask: Task = {
				id: "json-test-task",
				content: "JSON test task",
				completed: true,
				status: "x",
				metadata: {
					onCompletion:
						'{"type": "move", "targetFile": "archive.md", "targetSection": "Completed"}',
				},
				lineNumber: 1,
				filePath: "test.md",
			};

			const mockExecutor = manager["executors"].get(
				OnCompletionActionType.MOVE
			);
			if (mockExecutor) {
				mockExecutor.execute = jest.fn().mockResolvedValue({
					success: true,
					message: "Task moved successfully",
				});
			}

			await manager["handleTaskCompleted"](mockTask);

			expect(mockExecutor?.execute).toHaveBeenCalledWith(
				{
					task: mockTask,
					plugin: mockPlugin,
					app: mockApp,
				},
				{
					type: OnCompletionActionType.MOVE,
					targetFile: "archive.md",
					targetSection: "Completed",
				}
			);
		});
	});

	describe("Cleanup", () => {
		it("should clear executors on unload", () => {
			manager.unload();

			expect(manager["executors"].size).toBe(0);
		});
	});
});
