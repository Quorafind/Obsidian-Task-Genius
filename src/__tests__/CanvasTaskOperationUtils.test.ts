/**
 * CanvasTaskOperationUtils Tests
 *
 * Tests for Canvas task operation utilities including:
 * - Text node creation and management
 * - Task insertion into sections
 * - Task formatting for Canvas storage
 * - Canvas data saving operations
 */

import { CanvasTaskOperationUtils } from "../utils/onCompletion/CanvasTaskOperationUtils";
import { Task } from "../types/task";
import { CanvasData, CanvasTextData } from "../types/canvas";
import { createMockApp } from "./mockUtils";

// Mock vault
const mockVault = {
	getFileByPath: jest.fn(),
	read: jest.fn(),
	modify: jest.fn(),
};

const mockApp = {
	...createMockApp(),
	vault: mockVault,
};

describe("CanvasTaskOperationUtils", () => {
	let utils: CanvasTaskOperationUtils;

	beforeEach(() => {
		utils = new CanvasTaskOperationUtils(mockApp as any);
		// Reset mocks
		jest.clearAllMocks();
	});

	describe("findOrCreateTargetTextNode", () => {
		it("should find existing text node by ID", async () => {
			const mockCanvasData: CanvasData = {
				nodes: [
					{
						type: "text",
						id: "existing-node",
						x: 0,
						y: 0,
						width: 250,
						height: 60,
						text: "Existing content",
					},
				],
				edges: [],
			};

			const mockFile = { path: "test.canvas" };
			mockVault.getFileByPath.mockReturnValue(mockFile);
			mockVault.read.mockResolvedValue(JSON.stringify(mockCanvasData));

			const result = await utils.findOrCreateTargetTextNode(
				"test.canvas",
				"existing-node"
			);

			expect(result).not.toBeNull();
			expect(result!.textNode.id).toBe("existing-node");
			expect(result!.textNode.text).toBe("Existing content");
		});

		it("should return null if specified node ID does not exist", async () => {
			const mockCanvasData: CanvasData = {
				nodes: [
					{
						type: "text",
						id: "other-node",
						x: 0,
						y: 0,
						width: 250,
						height: 60,
						text: "Other content",
					},
				],
				edges: [],
			};

			const mockFile = { path: "test.canvas" };
			mockVault.getFileByPath.mockReturnValue(mockFile);
			mockVault.read.mockResolvedValue(JSON.stringify(mockCanvasData));

			const result = await utils.findOrCreateTargetTextNode(
				"test.canvas",
				"non-existent-node"
			);

			expect(result).toBeNull();
		});

		it("should find existing text node by section content", async () => {
			const mockCanvasData: CanvasData = {
				nodes: [
					{
						type: "text",
						id: "node-1",
						x: 0,
						y: 0,
						width: 250,
						height: 60,
						text: "# Main Section\n\nSome content here",
					},
					{
						type: "text",
						id: "node-2",
						x: 300,
						y: 0,
						width: 250,
						height: 60,
						text: "## Tasks Section\n\n- [ ] Task 1",
					},
				],
				edges: [],
			};

			const mockFile = { path: "test.canvas" };
			mockVault.getFileByPath.mockReturnValue(mockFile);
			mockVault.read.mockResolvedValue(JSON.stringify(mockCanvasData));

			const result = await utils.findOrCreateTargetTextNode(
				"test.canvas",
				undefined,
				"Tasks Section"
			);

			expect(result).not.toBeNull();
			expect(result!.textNode.id).toBe("node-2");
			expect(result!.textNode.text).toContain("## Tasks Section");
		});

		it("should create new text node with section if section not found", async () => {
			const mockCanvasData: CanvasData = {
				nodes: [
					{
						type: "text",
						id: "existing-node",
						x: 0,
						y: 0,
						width: 250,
						height: 60,
						text: "Existing content",
					},
				],
				edges: [],
			};

			const mockFile = { path: "test.canvas" };
			mockVault.getFileByPath.mockReturnValue(mockFile);
			mockVault.read.mockResolvedValue(JSON.stringify(mockCanvasData));

			const result = await utils.findOrCreateTargetTextNode(
				"test.canvas",
				undefined,
				"New Section"
			);

			expect(result).not.toBeNull();
			expect(result!.canvasData.nodes).toHaveLength(2); // Original + new node
			expect(result!.textNode.text).toContain("## New Section");
			expect(result!.textNode.x).toBe(300); // Positioned to the right
		});

		it("should create new text node without section", async () => {
			const mockCanvasData: CanvasData = {
				nodes: [],
				edges: [],
			};

			const mockFile = { path: "test.canvas" };
			mockVault.getFileByPath.mockReturnValue(mockFile);
			mockVault.read.mockResolvedValue(JSON.stringify(mockCanvasData));

			const result = await utils.findOrCreateTargetTextNode(
				"test.canvas"
			);

			expect(result).not.toBeNull();
			expect(result!.canvasData.nodes).toHaveLength(1);
			expect(result!.textNode.text).toBe("");
			expect(result!.textNode.x).toBe(0); // First node at origin
		});

		it("should return null if file does not exist", async () => {
			mockVault.getFileByPath.mockReturnValue(null);

			const result = await utils.findOrCreateTargetTextNode(
				"non-existent.canvas"
			);

			expect(result).toBeNull();
		});

		it("should return null if Canvas JSON is invalid", async () => {
			const mockFile = { path: "test.canvas" };
			mockVault.getFileByPath.mockReturnValue(mockFile);
			mockVault.read.mockResolvedValue("invalid json");

			const result = await utils.findOrCreateTargetTextNode(
				"test.canvas"
			);

			expect(result).toBeNull();
		});
	});

	describe("insertTaskIntoSection", () => {
		it("should insert task into existing section", () => {
			const textNode: CanvasTextData = {
				type: "text",
				id: "node-1",
				x: 0,
				y: 0,
				width: 250,
				height: 60,
				text: "# Main\n\n## Tasks\n\n- [ ] Existing task\n\n## Other Section\n\nOther content",
			};

			const result = utils.insertTaskIntoSection(
				textNode,
				"- [ ] New task",
				"Tasks"
			);

			expect(result.success).toBe(true);
			expect(textNode.text).toContain("## Tasks\n\n- [ ] New task");
			expect(textNode.text).toContain("- [ ] Existing task");
		});

		it("should create new section if section not found", () => {
			const textNode: CanvasTextData = {
				type: "text",
				id: "node-1",
				x: 0,
				y: 0,
				width: 250,
				height: 60,
				text: "Existing content",
			};

			const result = utils.insertTaskIntoSection(
				textNode,
				"- [ ] New task",
				"New Section"
			);

			expect(result.success).toBe(true);
			expect(textNode.text).toContain("## New Section\n- [ ] New task");
		});

		it("should append task to end if no section specified", () => {
			const textNode: CanvasTextData = {
				type: "text",
				id: "node-1",
				x: 0,
				y: 0,
				width: 250,
				height: 60,
				text: "Existing content",
			};

			const result = utils.insertTaskIntoSection(
				textNode,
				"- [ ] New task"
			);

			expect(result.success).toBe(true);
			expect(textNode.text).toBe("Existing content\n- [ ] New task");
		});

		it("should replace empty content if no section specified", () => {
			const textNode: CanvasTextData = {
				type: "text",
				id: "node-1",
				x: 0,
				y: 0,
				width: 250,
				height: 60,
				text: "",
			};

			const result = utils.insertTaskIntoSection(
				textNode,
				"- [ ] New task"
			);

			expect(result.success).toBe(true);
			expect(textNode.text).toBe("- [ ] New task");
		});

		it("should handle errors gracefully", () => {
			const textNode: CanvasTextData = {
				type: "text",
				id: "node-1",
				x: 0,
				y: 0,
				width: 250,
				height: 60,
				text: "content",
			};

			// Force an error by making text non-writable
			Object.defineProperty(textNode, "text", {
				get: () => "content",
				set: () => {
					throw new Error("Cannot modify text");
				},
			});

			const result = utils.insertTaskIntoSection(
				textNode,
				"- [ ] New task"
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Error inserting task into section");
		});
	});

	describe("formatTaskForCanvas", () => {
		it("should use originalMarkdown when preserving metadata", () => {
			const task: Task = {
				id: "task-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Test task #project/test ⏫",
				metadata: {
					tags: ["#project/test"],
					priority: 4,
					children: [],
				},
			};

			const formatted = utils.formatTaskForCanvas(task, true);

			expect(formatted).toBe("- [x] Test task #project/test ⏫");
		});

		it("should format basic task without metadata", () => {
			const task: any = {
				id: "task-2",
				content: "Simple task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Simple task",
			};

			const formatted = utils.formatTaskForCanvas(task, false);

			expect(formatted).toBe("- [ ] Simple task");
		});

		it("should add metadata when preserving and available", () => {
			const task: any = {
				id: "task-3",
				content: "Task with metadata",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				metadata: {
					tags: [],
					children: [],
					dueDate: new Date("2024-01-15").getTime(),
					priority: 3,
					project: "test-project",
					context: "work",
				},
			};

			const formatted = utils.formatTaskForCanvas(task, true);

			expect(formatted).toContain("- [ ] Task with metadata");
			expect(formatted).toContain("📅 2024-01-15");
			expect(formatted).toContain("🔼"); // Medium priority
			expect(formatted).toContain("#project/test-project");
			expect(formatted).toContain("@work");
		});

		it("should handle different priority levels", () => {
			const priorities = [
				{ level: 1, emoji: "🔽" },
				{ level: 2, emoji: "" },
				{ level: 3, emoji: "🔼" },
				{ level: 4, emoji: "⏫" },
				{ level: 5, emoji: "🔺" },
			];

			priorities.forEach(({ level, emoji }) => {
				const task: any = {
					id: `task-${level}`,
					content: "Test task",
					filePath: "test.md",
					line: 0,
					completed: false,
					status: " ",
					metadata: {
						tags: [],
						children: [],
						priority: level,
					},
				};

				const formatted = utils.formatTaskForCanvas(task, true);

				if (emoji) {
					expect(formatted).toContain(emoji);
				} else {
					expect(formatted).toBe("- [ ] Test task");
				}
			});
		});
	});

	describe("saveCanvasData", () => {
		it("should successfully save Canvas data", async () => {
			const canvasData: CanvasData = {
				nodes: [
					{
						type: "text",
						id: "node-1",
						x: 0,
						y: 0,
						width: 250,
						height: 60,
						text: "Updated content",
					},
				],
				edges: [],
			};

			const mockFile = { path: "test.canvas" };
			mockVault.getFileByPath.mockReturnValue(mockFile);
			mockVault.modify.mockResolvedValue(undefined);

			const result = await utils.saveCanvasData(
				"test.canvas",
				canvasData
			);

			expect(result.success).toBe(true);
			expect(result.updatedContent).toBeDefined();
			expect(mockVault.modify).toHaveBeenCalledWith(
				mockFile,
				JSON.stringify(canvasData, null, 2)
			);
		});

		it("should handle file not found error", async () => {
			const canvasData: CanvasData = {
				nodes: [],
				edges: [],
			};

			mockVault.getFileByPath.mockReturnValue(null);

			const result = await utils.saveCanvasData(
				"non-existent.canvas",
				canvasData
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain(
				"Canvas file not found: non-existent.canvas"
			);
		});

		it("should handle save errors", async () => {
			const canvasData: CanvasData = {
				nodes: [],
				edges: [],
			};

			const mockFile = { path: "test.canvas" };
			mockVault.getFileByPath.mockReturnValue(mockFile);
			mockVault.modify.mockRejectedValue(
				new Error("Write permission denied")
			);

			const result = await utils.saveCanvasData(
				"test.canvas",
				canvasData
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain(
				"Error saving Canvas data: Write permission denied"
			);
		});
	});
});
