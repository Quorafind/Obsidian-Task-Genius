/**
 * Workflow Optimization Tests
 *
 * Tests for the new workflow optimization features including:
 * - Quick workflow creation
 * - Task to workflow conversion
 * - Workflow starting task creation
 * - Workflow progress indicators
 * - Enhanced user experience features
 */

import {
	analyzeTaskStructure,
	convertTaskStructureToWorkflow,
	createWorkflowStartingTask,
	convertCurrentTaskToWorkflowRoot,
	suggestWorkflowFromExisting,
} from "../utils/workflowConversion";
import { WorkflowProgressIndicator } from "../components/WorkflowProgressIndicator";
import { createMockPlugin, createMockApp } from "./mockUtils";
import { WorkflowDefinition } from "../common/setting-definition";

// Mock Editor for testing
class MockEditor {
	private lines: string[];
	private cursor: { line: number; ch: number };

	constructor(content: string) {
		this.lines = content.split("\n");
		this.cursor = { line: 0, ch: 0 };
	}

	getValue(): string {
		return this.lines.join("\n");
	}

	getLine(line: number): string {
		return this.lines[line] || "";
	}

	getCursor() {
		return this.cursor;
	}

	setCursor(line: number, ch: number = 0) {
		this.cursor = { line, ch };
	}

	setLine(line: number, text: string) {
		this.lines[line] = text;
	}

	replaceRange(text: string, from: any, to: any) {
		// Simple implementation for testing
		const line = this.lines[from.line];
		const before = line.substring(0, from.ch);
		const after = line.substring(to.ch);
		const newContent = before + text + after;

		// Handle newlines by splitting into multiple lines
		if (newContent.includes("\n")) {
			const parts = newContent.split("\n");
			this.lines[from.line] = parts[0];
			// Insert additional lines if needed
			for (let i = 1; i < parts.length; i++) {
				this.lines.splice(from.line + i, 0, parts[i]);
			}
		} else {
			this.lines[from.line] = newContent;
		}
	}
}

describe("Workflow Optimization Features", () => {
	let mockPlugin: any;
	let mockApp: any;

	beforeEach(() => {
		mockPlugin = createMockPlugin();
		mockApp = createMockApp();

		// Add some sample workflows
		mockPlugin.settings.workflow.definitions = [
			{
				id: "simple_workflow",
				name: "Simple Workflow",
				description: "A basic workflow",
				stages: [
					{ id: "start", name: "Start", type: "linear" },
					{ id: "middle", name: "Middle", type: "linear" },
					{ id: "end", name: "End", type: "terminal" },
				],
				metadata: {
					version: "1.0",
					created: "2024-01-01",
					lastModified: "2024-01-01",
				},
			},
		];
	});

	describe("Task Structure Analysis", () => {
		test("should analyze simple task structure", () => {
			const content = `- [ ] Main Task
  - [ ] Subtask 1
  - [ ] Subtask 2`;

			const editor = new MockEditor(content);
			editor.setCursor(0);

			const structure = analyzeTaskStructure(
				editor as any,
				editor.getCursor()
			);

			expect(structure).toBeTruthy();
			expect(structure?.content).toBe("Main Task");
			expect(structure?.isTask).toBe(true);
			expect(structure?.children).toHaveLength(2);
			expect(structure?.children[0].content).toBe("Subtask 1");
			expect(structure?.children[1].content).toBe("Subtask 2");
		});

		test("should handle nested task structure", () => {
			const content = `- [ ] Project
  - [ ] Phase 1
    - [ ] Task 1.1
    - [ ] Task 1.2
  - [ ] Phase 2
    - [ ] Task 2.1`;

			const editor = new MockEditor(content);
			editor.setCursor(0);

			const structure = analyzeTaskStructure(
				editor as any,
				editor.getCursor()
			);

			expect(structure).toBeTruthy();
			expect(structure?.content).toBe("Project");
			expect(structure?.children).toHaveLength(2);
			expect(structure?.children[0].content).toBe("Phase 1");
			expect(structure?.children[0].children).toHaveLength(2);
		});

		test("should return null for non-task lines", () => {
			const content = `This is just text
Not a task`;

			const editor = new MockEditor(content);
			editor.setCursor(0);

			const structure = analyzeTaskStructure(
				editor as any,
				editor.getCursor()
			);

			expect(structure).toBeNull();
		});
	});

	describe("Task to Workflow Conversion", () => {
		test("should convert simple task structure to workflow", () => {
			const structure = {
				content: "Project Setup",
				level: 0,
				line: 0,
				isTask: true,
				status: " ",
				children: [
					{
						content: "Initialize Repository",
						level: 2,
						line: 1,
						isTask: true,
						status: " ",
						children: [],
					},
					{
						content: "Setup Dependencies",
						level: 2,
						line: 2,
						isTask: true,
						status: " ",
						children: [],
					},
				],
			};

			const workflow = convertTaskStructureToWorkflow(
				structure,
				"Project Setup Workflow",
				"project_setup"
			);

			expect(workflow.id).toBe("project_setup");
			expect(workflow.name).toBe("Project Setup Workflow");
			expect(workflow.stages).toHaveLength(3); // Root + 2 children
			expect(workflow.stages[0].name).toBe("Project Setup");
			expect(workflow.stages[1].name).toBe("Initialize Repository");
			expect(workflow.stages[2].name).toBe("Setup Dependencies");
		});

		test("should handle cycle stages with substages", () => {
			const structure = {
				content: "Development",
				level: 0,
				line: 0,
				isTask: true,
				status: " ",
				children: [
					{
						content: "Code",
						level: 2,
						line: 1,
						isTask: true,
						status: " ",
						children: [
							{
								content: "Write Tests",
								level: 4,
								line: 2,
								isTask: true,
								status: " ",
								children: [],
							},
							{
								content: "Implement Feature",
								level: 4,
								line: 3,
								isTask: true,
								status: " ",
								children: [],
							},
						],
					},
				],
			};

			const workflow = convertTaskStructureToWorkflow(
				structure,
				"Development Workflow",
				"development"
			);

			expect(workflow.stages).toHaveLength(2);
			expect(workflow.stages[1].type).toBe("cycle");
			expect(workflow.stages[1].subStages).toHaveLength(2);
			expect(workflow.stages[1].subStages?.[0].name).toBe("Write Tests");
		});
	});

	describe("Workflow Starting Task Creation", () => {
		test("should create workflow starting task at cursor", () => {
			const content = `Some existing content
`;
			const editor = new MockEditor(content);
			editor.setCursor(1);

			const workflow: WorkflowDefinition = {
				id: "test_workflow",
				name: "Test Workflow",
				description: "Test",
				stages: [],
				metadata: {
					version: "1.0",
					created: "2024-01-01",
					lastModified: "2024-01-01",
				},
			};

			createWorkflowStartingTask(
				editor as any,
				editor.getCursor(),
				workflow,
				mockPlugin
			);

			expect(editor.getLine(1)).toBe(
				"- [ ] Test Workflow #workflow/test_workflow"
			);
		});

		test("should handle indentation correctly", () => {
			const content = `  Some indented content
`;
			const editor = new MockEditor(content);
			editor.setCursor(0);

			const workflow: WorkflowDefinition = {
				id: "test_workflow",
				name: "Test Workflow",
				description: "Test",
				stages: [],
				metadata: {
					version: "1.0",
					created: "2024-01-01",
					lastModified: "2024-01-01",
				},
			};

			createWorkflowStartingTask(
				editor as any,
				editor.getCursor(),
				workflow,
				mockPlugin
			);

			// The function adds a new line after the existing content
			expect(editor.getLine(0)).toBe("  Some indented content");
			expect(editor.getLine(1)).toBe(
				"  - [ ] Test Workflow #workflow/test_workflow"
			);
		});
	});

	describe("Current Task to Workflow Root Conversion", () => {
		test("should convert task to workflow root", () => {
			const content = `- [ ] My Task`;
			const editor = new MockEditor(content);
			editor.setCursor(0);

			const success = convertCurrentTaskToWorkflowRoot(
				editor as any,
				editor.getCursor(),
				"my_workflow"
			);

			expect(success).toBe(true);
			expect(editor.getLine(0)).toBe(
				"- [ ] My Task #workflow/my_workflow"
			);
		});

		test("should not convert non-task lines", () => {
			const content = `Just some text`;
			const editor = new MockEditor(content);
			editor.setCursor(0);

			const success = convertCurrentTaskToWorkflowRoot(
				editor as any,
				editor.getCursor(),
				"my_workflow"
			);

			expect(success).toBe(false);
			expect(editor.getLine(0)).toBe("Just some text");
		});

		test("should not convert tasks that already have workflow tags", () => {
			const content = `- [ ] My Task #workflow/existing`;
			const editor = new MockEditor(content);
			editor.setCursor(0);

			const success = convertCurrentTaskToWorkflowRoot(
				editor as any,
				editor.getCursor(),
				"my_workflow"
			);

			expect(success).toBe(false);
			expect(editor.getLine(0)).toBe("- [ ] My Task #workflow/existing");
		});
	});

	describe("Workflow Suggestions", () => {
		test("should suggest similar workflow based on stage count", () => {
			const structure = {
				content: "New Project",
				level: 0,
				line: 0,
				isTask: true,
				status: " ",
				children: [
					{
						content: "Step 1",
						level: 2,
						line: 1,
						isTask: true,
						status: " ",
						children: [],
					},
					{
						content: "Step 2",
						level: 2,
						line: 2,
						isTask: true,
						status: " ",
						children: [],
					},
				],
			};

			const existingWorkflows = mockPlugin.settings.workflow.definitions;
			const suggestion = suggestWorkflowFromExisting(
				structure,
				existingWorkflows
			);

			expect(suggestion).toBeTruthy();
			expect(suggestion?.name).toBe("New Project Workflow");
			expect(suggestion?.stages).toHaveLength(3); // Same as existing workflow
		});

		test("should return null when no similar workflows exist", () => {
			const structure = {
				content: "Complex Project",
				level: 0,
				line: 0,
				isTask: true,
				status: " ",
				children: Array(10)
					.fill(null)
					.map((_, i) => ({
						content: `Step ${i + 1}`,
						level: 2,
						line: i + 1,
						isTask: true,
						status: " ",
						children: [],
					})),
			};

			const existingWorkflows = mockPlugin.settings.workflow.definitions;
			const suggestion = suggestWorkflowFromExisting(
				structure,
				existingWorkflows
			);

			expect(suggestion).toBeNull();
		});
	});

	describe("Workflow Progress Indicator", () => {
		test("should calculate progress correctly", () => {
			const workflow: WorkflowDefinition = {
				id: "test_workflow",
				name: "Test Workflow",
				description: "Test",
				stages: [
					{ id: "stage1", name: "Stage 1", type: "linear" },
					{ id: "stage2", name: "Stage 2", type: "linear" },
					{ id: "stage3", name: "Stage 3", type: "terminal" },
				],
				metadata: {
					version: "1.0",
					created: "2024-01-01",
					lastModified: "2024-01-01",
				},
			};

			const completedStages = ["stage1"];
			const currentStageId = "stage2";

			// Test the static calculation method
			const workflowTasks = [
				{ stage: "stage1", completed: true },
				{ stage: "stage1", completed: true },
				{ stage: "stage2", completed: false },
				{ stage: "stage3", completed: false },
			];

			const calculated =
				WorkflowProgressIndicator.calculateCompletedStages(
					workflowTasks,
					workflow
				);

			expect(calculated).toContain("stage1");
			expect(calculated).not.toContain("stage2");
		});

		test("should handle empty workflow tasks", () => {
			const workflow: WorkflowDefinition = {
				id: "test_workflow",
				name: "Test Workflow",
				description: "Test",
				stages: [{ id: "stage1", name: "Stage 1", type: "linear" }],
				metadata: {
					version: "1.0",
					created: "2024-01-01",
					lastModified: "2024-01-01",
				},
			};

			const calculated =
				WorkflowProgressIndicator.calculateCompletedStages(
					[],
					workflow
				);
			expect(calculated).toHaveLength(0);
		});
	});
});
