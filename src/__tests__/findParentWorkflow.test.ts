import { Text } from "@codemirror/state";
import { findParentWorkflow } from "../editor-extensions/workflow/workflow-handler";

// Create a mock Text object for testing
function createMockDoc(lines: string[]): Text {
	const mockDoc = {
		lines: lines.length,
		line: (lineNum: number) => {
			const lineIndex = lineNum - 1; // Convert to 0-indexed
			if (lineIndex < 0 || lineIndex >= lines.length) {
				throw new Error(`Line ${lineNum} out of bounds`);
			}
			return {
				number: lineNum,
				from: 0, // Simplified for testing
				to: lines[lineIndex].length,
				text: lines[lineIndex],
			};
		},
	} as Text;

	return mockDoc;
}

describe("findParentWorkflow", () => {
	test("should find workflow when project info is on first line with same indentation", () => {
		const lines = [
			"#workflow/development",
			"- [ ] Task 1 [stage::planning]",
			"- [ ] Task 2 [stage::development]",
		];

		const doc = createMockDoc(lines);

		const result = findParentWorkflow(doc, 2); // Looking for parent of line 2

		expect(result).toBe("development");
	});

	test("should find workflow when project info is on parent line with less indentation", () => {
		const lines = [
			"# Project",
			"  #workflow/development",
			"  - [ ] Task 1 [stage::planning]",
			"    - [ ] Subtask [stage::development]",
		];

		const doc = createMockDoc(lines);

		const result = findParentWorkflow(doc, 4); // Looking for parent of line 4 (subtask)

		expect(result).toBe("development");
	});

	test("should find workflow when project info is on same indentation level but above", () => {
		const lines = [
			"#workflow/development",
			"",
			"- [ ] Task 1 [stage::planning]",
			"- [ ] Task 2 [stage::development]",
		];

		const doc = createMockDoc(lines);

		const result = findParentWorkflow(doc, 3); // Looking for parent of line 3

		expect(result).toBe("development");
	});

	test("should return null when no parent workflow is found", () => {
		const lines = [
			"# Project",
			"- [ ] Task 1 [stage::planning]",
			"- [ ] Task 2 [stage::development]",
		];

		const doc = createMockDoc(lines);

		const result = findParentWorkflow(doc, 2); // Looking for parent of line 2

		expect(result).toBeNull();
	});

	test("should not find workflow with greater indentation", () => {
		const lines = [
			"- [ ] Task 1",
			"  #workflow/development",
			"- [ ] Task 2 [stage::planning]",
		];

		const doc = createMockDoc(lines);

		const result = findParentWorkflow(doc, 3); // Looking for parent of line 3

		expect(result).toBeNull();
	});

	test("should handle invalid line numbers", () => {
		const lines = [
			"#workflow/development",
			"- [ ] Task 1 [stage::planning]",
		];

		const doc = createMockDoc(lines);

		const result1 = findParentWorkflow(doc, 0); // Invalid line number
		const result2 = findParentWorkflow(doc, -1); // Invalid line number

		expect(result1).toBeNull();
		expect(result2).toBeNull();
	});

	test("should find closest parent workflow when multiple exist", () => {
		const lines = [
			"#workflow/project1",
			"  #workflow/project2",
			"  - [ ] Task 1 [stage::planning]",
			"    - [ ] Subtask [stage::development]",
		];

		const doc = createMockDoc(lines);

		const result = findParentWorkflow(doc, 4); // Looking for parent of line 4 (subtask)

		expect(result).toBe("project2"); // Should find the closest parent
	});
});
