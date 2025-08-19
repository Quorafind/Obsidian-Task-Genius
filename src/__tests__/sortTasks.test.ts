import { sortTasksInDocument } from "../commands/sortTaskCommands";
import {
	createMockText,
	createMockPlugin,
	createMockEditorView,
} from "./mockUtils";

describe("sortTasksInDocument", () => {
	it("should identify and sort tasks", () => {
		// Original content: mixed task order
		const originalContent = `
- [ ] Incomplete task 1
- [x] Completed task
- [/] In progress task`;

		// Create mock EditorView and plugin
		const mockView = createMockEditorView(originalContent);
		const mockPlugin = createMockPlugin({
			sortTasks: true,
			sortCriteria: [{ field: "status", order: "asc" }],
		});

		const result = sortTasksInDocument(mockView, mockPlugin, true);

		// Expected result: text sorted by status
		const expectedContent = `
- [ ] Incomplete task 1
- [/] In progress task
- [x] Completed task`;

		// Verify sort result
		expect(result).toEqual(expectedContent);
	});

	it("should place completed tasks at the end regardless of sort criteria", () => {
		// Original content: mixed task order
		const originalContent = `
- [x] Completed task 1
- [ ] Incomplete task [priority:: high] [due:: 2025-05-01]
- [/] In progress task [start:: 2025-04-01]
- [x] Completed task 2`;

		// Create mock EditorView and plugin
		const mockView = createMockEditorView(originalContent);
		const mockPlugin = createMockPlugin({
			preferMetadataFormat: "dataview",
			sortTasks: true,
			sortCriteria: [
				{ field: "completed", order: "asc" },
				{ field: "priority", order: "asc" },
			],
		});

		// Call sort function
		const result = sortTasksInDocument(mockView, mockPlugin, true);

		// Expected result: 现在按 completed 然后 priority 排序
		const expectedContent = `
- [ ] Incomplete task [priority:: high] [due:: 2025-05-01]
- [/] In progress task [start:: 2025-04-01]
- [x] Completed task 1
- [x] Completed task 2`;

		// Verify sort result
		expect(result).toEqual(expectedContent);
	});

	it("should maintain relative position of non-contiguous task blocks", () => {
		// Original content: two task blocks separated by non-task lines
		const originalContent = `
First task block:
- [x] Completed task 1
- [ ] Incomplete task 1

Middle non-task content

Second task block:
- [x] Completed task 2
- [ ] Incomplete task 2`;

		// Create mock EditorView and plugin
		const mockView = createMockEditorView(originalContent);
		const mockPlugin = createMockPlugin({
			sortTasks: true,
			sortCriteria: [{ field: "status", order: "asc" }],
		});

		// Call sort function
		const result = sortTasksInDocument(mockView, mockPlugin, true);

		// Expected result: each block sorted internally, but blocks maintain relative position
		const expectedContent = `
First task block:
- [ ] Incomplete task 1
- [x] Completed task 1

Middle non-task content

Second task block:
- [ ] Incomplete task 2
- [x] Completed task 2`;

		// Verify sort result
		expect(result).toEqual(expectedContent);
	});

	it("should preserve task hierarchy (parent-child relationships)", () => {
		// Original content: tasks with parent-child relationships
		const originalContent = `
- [x] Parent task 1
  - [ ] Child task 1
  - [/] Child task 2
- [ ] Parent task 2
  - [x] Child task 3`;

		// Create mock EditorView and plugin
		const mockView = createMockEditorView(originalContent);
		const mockPlugin = createMockPlugin({
			sortTasks: true,
			sortCriteria: [{ field: "status", order: "asc" }],
		});

		// Call sort function
		const result = sortTasksInDocument(mockView, mockPlugin, true);

		// Expected result: parent tasks sorted, child tasks follow their respective parents
		const expectedContent = `
- [ ] Parent task 2
  - [x] Child task 3
- [x] Parent task 1
  - [ ] Child task 1
  - [/] Child task 2`;

		// Verify sort result
		expect(result).toEqual(expectedContent);
	});

	it("should sort tasks by multiple criteria", () => {
		// Original content: tasks with various metadata
		const originalContent = `
- [ ] Low priority [priority:: 1] [due:: 2025-05-01]
- [ ] High priority [priority:: 3]
- [ ] Medium priority with due date [priority:: 2] [due:: 2025-04-01]
- [ ] Medium priority with later due date [priority:: 2] [due:: 2025-06-01]`;

		// Create mock EditorView and plugin
		const mockView = createMockEditorView(originalContent);
		const mockPlugin = createMockPlugin({
			preferMetadataFormat: "dataview",
			sortTasks: true,
			sortCriteria: [
				{ field: "priority", order: "asc" },
				{ field: "dueDate", order: "asc" },
			],
		});

		// Call sort function
		const result = sortTasksInDocument(mockView, mockPlugin, true);

		// Expected result: sorted first by priority (1->2->3), then by due date (early->late)
		const expectedContent = `
- [ ] Low priority [priority:: 1] [due:: 2025-05-01]
- [ ] Medium priority with due date [priority:: 2] [due:: 2025-04-01]
- [ ] Medium priority with later due date [priority:: 2] [due:: 2025-06-01]
- [ ] High priority [priority:: 3]`;

		// Verify sort result
		expect(result).toEqual(expectedContent);
	});

	it("should return null when there are no tasks to sort", () => {
		// Original content: no tasks
		const originalContent = `
This is a document with no tasks
Just regular text content`;

		// Create mock EditorView and plugin
		const mockView = createMockEditorView(originalContent);
		const mockPlugin = createMockPlugin({
			sortTasks: true,
			sortCriteria: [{ field: "status", order: "asc" }],
		});

		// Call sort function
		const result = sortTasksInDocument(mockView, mockPlugin, true);

		// Verify result is null
		expect(result).toBeNull();
	});

	it("should correctly sort tasks with dataview inline fields", () => {
		// Original content: tasks with simple format
		const originalContent = `
- [ ] Task B
- [ ] Task A  
- [x] Completed Task C`;

		// Create mock EditorView and plugin with dataview enabled
		const mockView = createMockEditorView(originalContent);
		const mockPlugin = createMockPlugin({
			preferMetadataFormat: "dataview",
			sortTasks: true,
			sortCriteria: [
				{ field: "completed", order: "asc" },
				{ field: "content", order: "asc" },
			],
		});

		// Call sort function
		const result = sortTasksInDocument(mockView, mockPlugin, true);

		// Expected result: sorted by completed first, then content alphabetically
		const expectedContent = `
- [ ] Task A  
- [ ] Task B
- [x] Completed Task C`;

		// Verify sort result
		expect(result).toEqual(expectedContent);
	});

	it("should correctly sort tasks with Tasks plugin emojis", () => {
		// Original content: tasks with Tasks plugin emojis
		const originalContent = `
- [ ] Task C 📅 2025-01-03
- [ ] Task A 📅 2025-01-01
- [x] Completed Task B 📅 2025-01-02`;

		// Create mock EditorView and plugin with tasks plugin enabled
		const mockView = createMockEditorView(originalContent);
		const mockPlugin = createMockPlugin({
			preferMetadataFormat: "tasks",
			sortTasks: true,
			sortCriteria: [
				{ field: "completed", order: "asc" },
				{ field: "dueDate", order: "asc" },
			],
		});

		// Debug: Test parseTaskLine directly
		const { parseTaskLine } = require("../utils/task/task-operations");
		const testLine = "- [ ] Task A 📅 2025-01-01";
		const parsedTask = parseTaskLine(
			"test.md",
			testLine,
			1,
			"tasks",
			mockPlugin
		);
		console.log("Parsed task:", parsedTask);
		console.log("Due date:", parsedTask?.metadata?.dueDate);

		// Call sort function
		const result = sortTasksInDocument(mockView, mockPlugin, true);

		// Expected result: sorted by completed first, then due date
		const expectedContent = `
- [ ] Task A 📅 2025-01-01
- [ ] Task C 📅 2025-01-03
- [x] Completed Task B 📅 2025-01-02`;

		// Verify sort result
		expect(result).toEqual(expectedContent);
	});
});
