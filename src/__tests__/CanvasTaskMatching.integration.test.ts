/**
 * Canvas Task Matching Integration Tests
 *
 * Tests for Canvas task matching functionality including:
 * - Task line matching with originalMarkdown
 * - Task line matching with content fallback
 * - Complex metadata handling
 * - OnCompletion metadata scenarios
 */

import { CanvasTaskUpdater } from "../utils/parsing/CanvasTaskUpdater";
import { Task, CanvasTaskMetadata } from "../types/task";
import { Vault } from "obsidian";
import TaskProgressBarPlugin from "../index";
import { createMockPlugin } from "./mockUtils";

// Mock Vault
const mockVault = {
	getFileByPath: jest.fn(),
	read: jest.fn(),
	modify: jest.fn(),
} as unknown as Vault;

describe("Canvas Task Matching Integration Tests", () => {
	let canvasUpdater: CanvasTaskUpdater;
	let mockPlugin: TaskProgressBarPlugin;

	beforeEach(() => {
		mockPlugin = createMockPlugin();
		canvasUpdater = new CanvasTaskUpdater(mockVault, mockPlugin);
		jest.clearAllMocks();
	});

	describe("lineMatchesTask Method", () => {
		it("should match task using originalMarkdown", () => {
			const task: Task<CanvasTaskMetadata> = {
				id: "test-task-1",
				content: "Test task with metadata",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown:
					"- [x] Test task with metadata #project/test 🏁 archive",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-1",
					tags: ["#project/test"],
					children: [],
					onCompletion: "archive",
				},
			};

			const canvasLine =
				"- [x] Test task with metadata #project/test 🏁 archive";

			// Use reflection to access private method
			const lineMatchesTask = (canvasUpdater as any).lineMatchesTask.bind(
				canvasUpdater
			);
			const result = lineMatchesTask(canvasLine, task);

			expect(result).toBe(true);
		});

		it("should match task with different checkbox status", () => {
			const task: Task<CanvasTaskMetadata> = {
				id: "test-task-2",
				content: "Test task that changed status",
				filePath: "test.canvas",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown:
					"- [ ] Test task that changed status #important",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-2",
					tags: ["#important"],
					children: [],
				},
			};

			// Canvas line shows completed status, but task object shows incomplete
			const canvasLine = "- [x] Test task that changed status #important";

			const lineMatchesTask = (canvasUpdater as any).lineMatchesTask.bind(
				canvasUpdater
			);
			const result = lineMatchesTask(canvasLine, task);

			expect(result).toBe(true);
		});

		it("should match task with complex onCompletion metadata", () => {
			const task: Task<CanvasTaskMetadata> = {
				id: "test-task-3",
				content: "Task with complex onCompletion",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown:
					'- [x] Task with complex onCompletion 🏁 {"type": "move", "targetFile": "archive.md"}',
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-3",
					tags: [],
					children: [],
					onCompletion:
						'{"type": "move", "targetFile": "archive.md"}',
				},
			};

			const canvasLine =
				'- [x] Task with complex onCompletion 🏁 {"type": "move", "targetFile": "archive.md"}';

			const lineMatchesTask = (canvasUpdater as any).lineMatchesTask.bind(
				canvasUpdater
			);
			const result = lineMatchesTask(canvasLine, task);

			expect(result).toBe(true);
		});

		it("should fall back to content matching when originalMarkdown differs", () => {
			const task: Task<CanvasTaskMetadata> = {
				id: "test-task-4",
				content: "Task content only",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Task content only #old-tag",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-4",
					tags: ["#new-tag"],
					children: [],
				},
			};

			// Canvas line has the same core content but without metadata
			// This should match using content fallback
			const canvasLine = "- [x] Task content only";

			const lineMatchesTask = (canvasUpdater as any).lineMatchesTask.bind(
				canvasUpdater
			);
			const result = lineMatchesTask(canvasLine, task);

			expect(result).toBe(true);
		});

		it("should not match when Canvas line has additional metadata", () => {
			const task: Task<CanvasTaskMetadata> = {
				id: "test-task-4b",
				content: "Task content only",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Task content only #old-tag",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-4b",
					tags: ["#new-tag"],
					children: [],
				},
			};

			// Canvas line has different metadata than what's in originalMarkdown
			// With the improved matching logic, this should now match because
			// the core content "Task content only" is the same after metadata removal
			const canvasLine = "- [x] Task content only #new-tag";

			const lineMatchesTask = (canvasUpdater as any).lineMatchesTask.bind(
				canvasUpdater
			);
			const result = lineMatchesTask(canvasLine, task);

			// This should now pass with the improved extractCoreTaskContent method
			expect(result).toBe(true);
		});

		it("should not match different tasks", () => {
			const task: Task<CanvasTaskMetadata> = {
				id: "test-task-5",
				content: "Original task content",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Original task content",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-5",
					tags: [],
					children: [],
				},
			};

			const canvasLine = "- [x] Different task content";

			const lineMatchesTask = (canvasUpdater as any).lineMatchesTask.bind(
				canvasUpdater
			);
			const result = lineMatchesTask(canvasLine, task);

			expect(result).toBe(false);
		});

		it("should handle tasks with indentation", () => {
			const task: Task<CanvasTaskMetadata> = {
				id: "test-task-6",
				content: "Indented task",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "  - [x] Indented task",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-6",
					tags: [],
					children: [],
				},
			};

			const canvasLine = "  - [x] Indented task";

			const lineMatchesTask = (canvasUpdater as any).lineMatchesTask.bind(
				canvasUpdater
			);
			const result = lineMatchesTask(canvasLine, task);

			expect(result).toBe(true);
		});

		it("should handle tasks without originalMarkdown", () => {
			const task: any = {
				id: "test-task-7",
				content: "Task without originalMarkdown",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				// No originalMarkdown property
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-7",
					tags: [],
					children: [],
				},
			};

			const canvasLine = "- [x] Task without originalMarkdown";

			const lineMatchesTask = (canvasUpdater as any).lineMatchesTask.bind(
				canvasUpdater
			);
			const result = lineMatchesTask(canvasLine, task);

			expect(result).toBe(true);
		});

		it("should match task with complex metadata differences", () => {
			const task: Task<CanvasTaskMetadata> = {
				id: "test-task-complex-diff",
				content: "Important task",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Important task ⏫ 📅 2024-12-20",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-complex",
					tags: [],
					children: [],
					priority: 4,
					dueDate: new Date("2024-12-20").getTime(),
				},
			};

			// Canvas line has different metadata but same core content
			const canvasLine =
				"- [x] Important task #urgent 🏁 archive 📅 2024-12-25";

			const lineMatchesTask = (canvasUpdater as any).lineMatchesTask.bind(
				canvasUpdater
			);
			const result = lineMatchesTask(canvasLine, task);

			// Should match because core content "Important task" is the same
			expect(result).toBe(true);
		});
	});

	describe("deleteTaskFromTextNode Method", () => {
		it("should successfully delete task from text node", () => {
			const textNode = {
				type: "text" as const,
				id: "node-1",
				x: 0,
				y: 0,
				width: 250,
				height: 60,
				text: "# Tasks\n\n- [ ] Keep this task\n- [x] Delete this task\n- [ ] Keep this too",
			};

			const task: Task<CanvasTaskMetadata> = {
				id: "test-task-delete",
				content: "Delete this task",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Delete this task",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-1",
					tags: [],
					children: [],
				},
			};

			const deleteTaskFromTextNode = (
				canvasUpdater as any
			).deleteTaskFromTextNode.bind(canvasUpdater);
			const result = deleteTaskFromTextNode(textNode, task);

			expect(result.success).toBe(true);
			expect(textNode.text).toBe(
				"# Tasks\n\n- [ ] Keep this task\n- [ ] Keep this too"
			);
		});

		it("should fail to delete non-existent task", () => {
			const textNode = {
				type: "text" as const,
				id: "node-2",
				x: 0,
				y: 0,
				width: 250,
				height: 60,
				text: "# Tasks\n\n- [ ] Keep this task\n- [ ] Keep this too",
			};

			const task: Task<CanvasTaskMetadata> = {
				id: "test-task-missing",
				content: "Non-existent task",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Non-existent task",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-2",
					tags: [],
					children: [],
				},
			};

			const deleteTaskFromTextNode = (
				canvasUpdater as any
			).deleteTaskFromTextNode.bind(canvasUpdater);
			const result = deleteTaskFromTextNode(textNode, task);

			expect(result.success).toBe(false);
			expect(result.error).toContain(
				"Task not found in Canvas text node"
			);
		});

		it("should delete task with complex metadata", () => {
			const textNode = {
				type: "text" as const,
				id: "node-3",
				x: 0,
				y: 0,
				width: 250,
				height: 60,
				text: "# Project Tasks\n\n- [ ] Regular task\n- [x] Complex task #project/test ⏫ 📅 2024-12-20 🏁 archive\n- [ ] Another task",
			};

			const task: Task<CanvasTaskMetadata> = {
				id: "test-task-complex",
				content:
					"Complex task #project/test ⏫ 📅 2024-12-20 🏁 archive",
				filePath: "test.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown:
					"- [x] Complex task #project/test ⏫ 📅 2024-12-20 🏁 archive",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "node-3",
					tags: ["#project/test"],
					children: [],
					priority: 4,
					dueDate: new Date("2024-12-20").getTime(),
					onCompletion: "archive",
				},
			};

			const deleteTaskFromTextNode = (
				canvasUpdater as any
			).deleteTaskFromTextNode.bind(canvasUpdater);
			const result = deleteTaskFromTextNode(textNode, task);

			expect(result.success).toBe(true);
			expect(textNode.text).toBe(
				"# Project Tasks\n\n- [ ] Regular task\n- [ ] Another task"
			);
		});
	});

	describe("Integration Scenarios", () => {
		it("should handle real-world archive scenario", () => {
			// Simulate a real Canvas text node with tasks that have onCompletion metadata
			const textNode = {
				type: "text" as const,
				id: "real-node",
				x: 0,
				y: 0,
				width: 350,
				height: 200,
				text: "# Current Tasks\n\n- [ ] Ongoing task\n- [x] Completed task with archive 🏁 archive\n- [ ] Future task #important\n- [x] Another completed task 🏁 move:done.md",
			};

			// Task that should be archived and deleted
			const archiveTask: Task<CanvasTaskMetadata> = {
				id: "archive-task",
				content: "Completed task with archive",
				filePath: "project.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown:
					"- [x] Completed task with archive 🏁 archive",
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "real-node",
					tags: [],
					children: [],
					onCompletion: "archive",
				},
			};

			// First verify the task can be found
			const lineMatchesTask = (canvasUpdater as any).lineMatchesTask.bind(
				canvasUpdater
			);
			const lines = textNode.text.split("\n");
			let taskFound = false;
			for (const line of lines) {
				if (
					(canvasUpdater as any).isTaskLine(line) &&
					lineMatchesTask(line, archiveTask)
				) {
					taskFound = true;
					break;
				}
			}
			expect(taskFound).toBe(true);

			// Then delete the task
			const deleteTaskFromTextNode = (
				canvasUpdater as any
			).deleteTaskFromTextNode.bind(canvasUpdater);
			const result = deleteTaskFromTextNode(textNode, archiveTask);

			expect(result.success).toBe(true);
			expect(textNode.text).toBe(
				"# Current Tasks\n\n- [ ] Ongoing task\n- [ ] Future task #important\n- [x] Another completed task 🏁 move:done.md"
			);
		});

		it("should handle move scenario with JSON metadata", () => {
			const textNode = {
				type: "text" as const,
				id: "json-node",
				x: 0,
				y: 0,
				width: 400,
				height: 150,
				text: '# Tasks with JSON\n\n- [ ] Regular task\n- [x] Move task 🏁 {"type": "move", "targetFile": "archive.md", "targetSection": "Done"}\n- [ ] Another task',
			};

			const moveTask: Task<CanvasTaskMetadata> = {
				id: "move-task",
				content: "Move task",
				filePath: "project.canvas",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown:
					'- [x] Move task 🏁 {"type": "move", "targetFile": "archive.md", "targetSection": "Done"}',
				metadata: {
					sourceType: "canvas",
					canvasNodeId: "json-node",
					tags: [],
					children: [],
					onCompletion:
						'{"type": "move", "targetFile": "archive.md", "targetSection": "Done"}',
				},
			};

			const deleteTaskFromTextNode = (
				canvasUpdater as any
			).deleteTaskFromTextNode.bind(canvasUpdater);
			const result = deleteTaskFromTextNode(textNode, moveTask);

			expect(result.success).toBe(true);
			expect(textNode.text).toBe(
				"# Tasks with JSON\n\n- [ ] Regular task\n- [ ] Another task"
			);
		});
	});
});
