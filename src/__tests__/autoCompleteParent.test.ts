import { App } from "obsidian";
import {
	Text,
	Transaction,
	TransactionSpec,
	EditorState,
	ChangeSet,
	Annotation,
} from "@codemirror/state";
import TaskProgressBarPlugin from ".."; // Adjust the import path as necessary
import {
	handleParentTaskUpdateTransaction,
	findTaskStatusChange,
	findParentTask,
	areAllSiblingsCompleted,
	anySiblingWithStatus,
	getParentTaskStatus,
	taskStatusChangeAnnotation, // Import the actual annotation
} from "../editor-ext/autoCompleteParent"; // Adjust the import path as necessary
import { TaskProgressBarSettings } from "src/common/setting-definition";
import { buildIndentString, getTabSize } from "../utils";

// --- Mock Setup ---

// Mock Annotation Type
const mockAnnotationType = {
	of: jest.fn().mockImplementation((value: string) => ({
		type: mockAnnotationType,
		value,
	})),
};
// Use the actual annotation object from the source file for checks
const mockParentTaskStatusChangeAnnotation = taskStatusChangeAnnotation;

// Mock Text Object
const createMockText = (content: string): Text => {
	const lines = content.split("\n");
	const doc = {
		toString: () => content,
		length: content.length,
		lines: lines.length,
		line: jest.fn((lineNum: number) => {
			if (lineNum < 1 || lineNum > lines.length) {
				throw new Error(
					`Line ${lineNum} out of range (1-${lines.length})`
				);
			}
			const text = lines[lineNum - 1];
			let from = 0;
			for (let i = 0; i < lineNum - 1; i++) {
				from += lines[i].length + 1; // +1 for newline
			}
			return {
				text: text,
				from,
				to: from + text.length,
				number: lineNum,
				length: text.length,
			};
		}),
		lineAt: jest.fn((pos: number) => {
			if (pos < 0 || pos > content.length) {
				throw new Error(
					`Position ${pos} out of range (0-${content.length})`
				);
			}
			let currentPos = 0;
			for (let i = 0; i < lines.length; i++) {
				const lineLength = lines[i].length;
				const lineStart = currentPos;
				const lineEnd = currentPos + lineLength;
				if (pos >= lineStart && pos <= lineEnd) {
					return {
						text: lines[i],
						from: lineStart,
						to: lineEnd,
						number: i + 1,
						length: lineLength,
					};
				}
				currentPos += lineLength + 1; // +1 for newline
			}
			// Handle edge case for position at the very end
			if (pos === content.length && lines.length > 0) {
				const lastLineIndex = lines.length - 1;
				const lastLine = lines[lastLineIndex];
				let from = 0;
				for (let i = 0; i < lastLineIndex; i++) {
					from += lines[i].length + 1;
				}
				return {
					text: lastLine,
					from: from,
					to: from + lastLine.length,
					number: lines.length,
					length: lastLine.length,
				};
			}
			throw new Error(`Could not find line at pos ${pos}`);
		}),
		// Add sliceString if needed by iterChanges simulation
		sliceString: jest.fn((from: number, to: number) =>
			content.slice(from, to)
		),
	};
	// @ts-ignore - Add self-reference for Text methods if necessary
	doc.doc = doc;
	return doc as Text;
};

// Mock ChangeSet
const createMockChangeSet = (doc: Text, changes: any[] = []): ChangeSet => {
	// Basic mock, might need refinement based on actual usage
	return {
		length: changes.length, // Length of the new document
		// @ts-ignore
		iterChanges: jest.fn((callback) => {
			changes.forEach((change) => {
				callback(
					change.fromA,
					change.toA,
					change.fromB,
					change.toB,
					createMockText(change.insertedText || "") // inserted text needs to be a Text object
				);
			});
		}),
		// Add other ChangeSet methods if needed: mapDesc, compose, mapPos, etc.
	} as ChangeSet;
};

// Mock Transaction Object
const createMockTransaction = (options: {
	startStateDocContent?: string;
	newDocContent?: string;
	changes?: {
		fromA: number;
		toA: number;
		fromB: number;
		toB: number;
		insertedText?: string;
	}[];
	docChanged?: boolean;
	isUserEvent?: string | false; // e.g., 'input.paste' or false
	annotations?: any[];
	selection?: { anchor: number; head: number };
}): Transaction => {
	const startDoc = createMockText(options.startStateDocContent ?? "");
	const newDoc = createMockText(
		options.newDocContent ?? options.startStateDocContent ?? ""
	);
	const changeSet = createMockChangeSet(newDoc, options.changes);

	const mockTr = {
		startState: { doc: startDoc /* other state props */ } as EditorState,
		newDoc: newDoc,
		changes: changeSet,
		docChanged:
			options.docChanged !== undefined
				? options.docChanged
				: !!options.changes?.length,
		isUserEvent: jest.fn((type: string) => {
			if (options.isUserEvent === false) return false;
			return options.isUserEvent === type;
		}),
		annotation: jest.fn(<T>(type: Annotation<T>): T | undefined => {
			const found = options.annotations?.find((ann) => ann.type === type);
			return found ? found.value : undefined;
		}),
		selection: options.selection || { anchor: 0, head: 0 },
		// Add other Transaction properties/methods if needed (effects, state, etc.)
	};

	// @ts-ignore - Allow adding mock state for testing purposes
	mockTr.state = { doc: newDoc };

	return mockTr as unknown as Transaction;
};

// Mock App Object
const createMockApp = (tabSize: number = 4): App => {
	const app = new App();
	// Override vault.getConfig if a specific tab size is provided
	if (tabSize !== 4) {
		// @ts-ignore - Override the getConfig function to return the specified tab size
		app.vault.getConfig = jest.fn((key: string) => {
			if (key === "tabSize") {
				return tabSize;
			}
			return undefined;
		});
	}
	return app;
};

// Mock Plugin Object
const createMockPlugin = (
	settings: Partial<{
		markParentInProgressWhenPartiallyComplete: boolean;
		taskStatuses: { inProgress: string; completed: string };
		workflow: {
			enableWorkflow: boolean;
			autoRemoveLastStageMarker: boolean;
			taskCountAffectsParent: boolean;
			autoAddTimestamp: boolean;
			timestampFormat: string;
			removeTimestampOnTransition: boolean;
			calculateSpentTime: boolean;
			spentTimeFormat: string;
			definitions: any[];
			autoAddNextTask: boolean;
			calculateFullSpentTime: boolean;
		};
	}> = {}
): TaskProgressBarPlugin => {
	const defaults = {
		markParentInProgressWhenPartiallyComplete: true,
		taskStatuses: {
			inProgress: "/",
			completed: "x|X",
		},
		workflow: {
			enableWorkflow: false,
			autoRemoveLastStageMarker: true,
			taskCountAffectsParent: true,
			autoAddTimestamp: false,
			timestampFormat: "YYYY-MM-DD HH:mm:ss",
			removeTimestampOnTransition: false,
			calculateSpentTime: false,
			spentTimeFormat: "HH:mm",
			definitions: [],
			autoAddNextTask: false,
			calculateFullSpentTime: false,
		},
	};

	// Deep merge settings
	const mergedSettings = {
		...defaults,
		...settings,
		taskStatuses: { ...defaults.taskStatuses, ...settings.taskStatuses },
		workflow: { ...defaults.workflow, ...settings.workflow },
	};

	// @ts-ignore
	return {
		settings: mergedSettings as unknown as TaskProgressBarSettings,
		app: new App(), // Add app property with mock App instance
	};
};

// --- Tests ---

describe("autoCompleteParent Helpers", () => {
	describe("findTaskStatusChange", () => {
		it("should return null if doc did not change (though handleParentTaskUpdateTransaction checks this first)", () => {
			const tr = createMockTransaction({ docChanged: false });
			expect(findTaskStatusChange(tr)).toBeNull();
		});

		it("should return null if no task-related change occurred", () => {
			const tr = createMockTransaction({
				startStateDocContent: "Some text",
				newDocContent: "Some other text",
				changes: [
					{
						fromA: 5,
						toA: 9,
						fromB: 5,
						toB: 10,
						insertedText: "other",
					},
				],
			});
			expect(findTaskStatusChange(tr)).toBeNull();
		});

		it("should detect a task status change from [ ] to [x]", () => {
			const tr = createMockTransaction({
				startStateDocContent: "- [ ] Task 1",
				newDocContent: "- [x] Task 1",
				changes: [
					{ fromA: 3, toA: 4, fromB: 3, toB: 4, insertedText: "x" },
				],
			});
			const result = findTaskStatusChange(tr);
			expect(result).not.toBeNull();
			expect(result?.lineNumber).toBe(1);
		});

		it("should detect a task status change from [ ] to [/]", () => {
			const tr = createMockTransaction({
				startStateDocContent: "  - [ ] Task 1",
				newDocContent: "  - [/] Task 1",
				changes: [
					{ fromA: 5, toA: 6, fromB: 5, toB: 6, insertedText: "/" },
				],
			});
			const result = findTaskStatusChange(tr);
			expect(result).not.toBeNull();
			expect(result?.lineNumber).toBe(1);
		});

		it("should detect a new task added", () => {
			const tr = createMockTransaction({
				startStateDocContent: "Some text",
				newDocContent: "Some text\n- [ ] New Task",
				changes: [
					{
						fromA: 9,
						toA: 9,
						fromB: 9,
						toB: 23,
						insertedText: "\n- [ ] New Task",
					},
				],
			});
			const result = findTaskStatusChange(tr);
			expect(result).not.toBeNull();
			expect(result?.lineNumber).toBe(2); // Line number where the new task is
		});

		it("should detect a new task added at the beginning", () => {
			const tr = createMockTransaction({
				startStateDocContent: "Some text",
				newDocContent: "- [ ] New Task\nSome text",
				// Indices need careful calculation
				changes: [
					{
						fromA: 0,
						toA: 0,
						fromB: 0,
						toB: 14,
						insertedText: "- [ ] New Task\n",
					},
				],
			});
			const result = findTaskStatusChange(tr);
			expect(result).not.toBeNull();
			expect(result?.lineNumber).toBe(1);
		});
	});

	describe("findParentTask", () => {
		const indent = buildIndentString(createMockApp());
		const doc = createMockText(
			"- [ ] Parent 1\n" + // 1
				`${indent}- [ ] Child 1.1\n` + // 2
				`${indent}  - [ ] Child 1.2\n` + // 3
				"- [ ] Parent 2\n" + // 4
				`${indent}- [ ] Child 2.1\n` + // 5
				`${indent}${indent}- [ ] Grandchild 2.1.1\n` + // 6
				`${indent}- [ ] Child 2.2` // 7
		);

		const mockApp = createMockApp();

		it("should return null for a top-level task", () => {
			expect(findParentTask(doc, 1)).toBeNull();
			expect(findParentTask(doc, 4)).toBeNull();
		});

		it("should find the parent of a child task", () => {
			const parent1 = findParentTask(doc, 2);
			expect(parent1).not.toBeNull();
			expect(parent1?.lineNumber).toBe(1);

			const parent2 = findParentTask(doc, 5);
			expect(parent2).not.toBeNull();
			expect(parent2?.lineNumber).toBe(4);
		});

		it("should find the parent of a grandchild task", () => {
			const parent = findParentTask(doc, 6);
			expect(parent).not.toBeNull();
			expect(parent?.lineNumber).toBe(5); // Direct parent, not grandparent
		});

		it("should handle different indentation levels", () => {
			const docWithTabs = createMockText(
				"- [ ] Parent\n" +
					"\t- [ ] Child with tab\n" +
					"\t\t- [ ] Grandchild with tabs"
			);

			const parent = findParentTask(docWithTabs, 3);
			expect(parent).not.toBeNull();
			expect(parent?.lineNumber).toBe(2);
		});

		it("should handle mixed indentation", () => {
			const docWithMixedIndent = createMockText(
				"- [ ] Parent\n" +
					"    - [ ] Child with spaces\n" +
					"\t- [ ] Child with tab"
			);

			const parent1 = findParentTask(docWithMixedIndent, 2);
			expect(parent1).not.toBeNull();
			expect(parent1?.lineNumber).toBe(1);

			const parent2 = findParentTask(docWithMixedIndent, 3);
			expect(parent2).not.toBeNull();
			expect(parent2?.lineNumber).toBe(1);
		});
	});

	describe("areAllSiblingsCompleted", () => {
		const mockPlugin = createMockPlugin();
		const indent = buildIndentString(createMockApp());

		it("should return true if all siblings are completed", () => {
			const doc = createMockText(
				"- [ ] Parent\n" +
					`${indent}- [x] Child 1\n` +
					`${indent}- [x] Child 2`
			);
			expect(areAllSiblingsCompleted(doc, 1, 0, mockPlugin)).toBe(true);
		});

		it("should return false if any sibling is not completed", () => {
			const doc = createMockText(
				"- [ ] Parent\n" +
					`${indent}- [x] Child 1\n` +
					`${indent}- [ ] Child 2`
			);
			expect(areAllSiblingsCompleted(doc, 1, 0, mockPlugin)).toBe(false);
		});

		it("should return false if any sibling is in progress", () => {
			const doc = createMockText(
				"- [ ] Parent\n" + "  - [x] Child 1\n" + "  - [/] Child 2"
			);
			expect(areAllSiblingsCompleted(doc, 1, 0, mockPlugin)).toBe(false);
		});

		it("should return true if there are no siblings", () => {
			const doc = createMockText("- [ ] Parent");
			expect(areAllSiblingsCompleted(doc, 1, 0, mockPlugin)).toBe(false);
		});

		it("should ignore grandchildren", () => {
			const doc = createMockText(
				"- [ ] Parent\n" +
					`${indent}- [x] Child 1\n` +
					`${indent}${indent}- [ ] Grandchild 1.1\n` + // Grandchild not completed
					`${indent}- [x] Child 2`
			);
			expect(areAllSiblingsCompleted(doc, 1, 0, mockPlugin)).toBe(true); // Only checks Child 1 & 2
		});
	});

	describe("anySiblingWithStatus", () => {
		const mockApp = createMockApp();
		const indent = buildIndentString(createMockApp());

		it("should return true if any sibling has status [/]", () => {
			const doc = createMockText(
				"- [ ] Parent\n" +
					`${indent}- [ ] Child 1\n` +
					`${indent}- [/] Child 2`
			);
			expect(anySiblingWithStatus(doc, 1, 0, mockApp)).toBe(true);
		});

		it("should return true if any sibling has status [x]", () => {
			const doc = createMockText(
				"- [ ] Parent\n" +
					`${indent}- [ ] Child 1\n` +
					`${indent}- [x] Child 2`
			);
			expect(anySiblingWithStatus(doc, 1, 0, mockApp)).toBe(true);
		});

		it("should return false if all siblings are [ ]", () => {
			const doc = createMockText(
				"- [ ] Parent\n" +
					`${indent}- [ ] Child 1\n` +
					`${indent}- [ ] Child 2`
			);
			expect(anySiblingWithStatus(doc, 1, 0, mockApp)).toBe(false);
		});

		it("should return false if there are no siblings", () => {
			const doc = createMockText("- [ ] Parent");
			expect(anySiblingWithStatus(doc, 1, 0, mockApp)).toBe(false);
		});

		it("should ignore grandchildren", () => {
			const doc = createMockText(
				"- [ ] Parent\n" +
					`${indent}- [ ] Child 1\n` +
					`${indent}${indent}- [/] Grandchild 1.1\n` + // Grandchild has status
					`${indent}- [ ] Child 2`
			);
			expect(anySiblingWithStatus(doc, 1, 0, mockApp)).toBe(false); // Checks only Child 1 & 2
		});
	});

	describe("getParentTaskStatus", () => {
		it("should return the status character for [ ]", () => {
			const doc = createMockText("- [ ] Parent Task");
			expect(getParentTaskStatus(doc, 1)).toBe(" ");
		});
		it("should return the status character for [x]", () => {
			const doc = createMockText("  - [x] Parent Task");
			expect(getParentTaskStatus(doc, 1)).toBe("x");
		});
		it("should return the status character for [/]", () => {
			const doc = createMockText("	- [/] Parent Task");
			expect(getParentTaskStatus(doc, 1)).toBe("/");
		});
		it("should return empty string if not a task", () => {
			const doc = createMockText("Just text");
			expect(getParentTaskStatus(doc, 1)).toBe("");
		});
	});
});

describe("handleParentTaskUpdateTransaction (Integration)", () => {
	const mockApp = createMockApp();

	it("should return original transaction if docChanged is false", () => {
		const mockPlugin = createMockPlugin();
		const tr = createMockTransaction({ docChanged: false });
		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);
		expect(result).toBe(tr);
	});

	it("should return original transaction for paste events", () => {
		const mockPlugin = createMockPlugin();
		const tr = createMockTransaction({
			startStateDocContent: "- [ ] Parent\n  - [ ] Child",
			newDocContent: "- [ ] Parent\n  - [x] Child",
			changes: [
				{ fromA: 18, toA: 19, fromB: 18, toB: 19, insertedText: "x" },
			],
			isUserEvent: "input.paste",
		});
		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);
		expect(result).toBe(tr);
	});

	it("should return original transaction if no task status change detected", () => {
		const mockPlugin = createMockPlugin();
		const tr = createMockTransaction({
			startStateDocContent: "Hello",
			newDocContent: "Hello World",
			changes: [
				{ fromA: 5, toA: 5, fromB: 5, toB: 11, insertedText: " World" },
			],
		});
		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);
		expect(result).toBe(tr);
	});

	it("should return original transaction if changed task has no parent", () => {
		const mockPlugin = createMockPlugin();
		const tr = createMockTransaction({
			startStateDocContent: "- [ ] Task",
			newDocContent: "- [x] Task",
			changes: [
				{ fromA: 3, toA: 4, fromB: 3, toB: 4, insertedText: "x" },
			],
		});
		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);
		expect(result).toBe(tr);
	});

	it("should complete parent when last child is completed", () => {
		const mockPlugin = createMockPlugin();
		const indent = buildIndentString(createMockApp());
		const tr = createMockTransaction({
			startStateDocContent: "- [ ] Parent\n" + `${indent}- [ ] Child`,
			newDocContent: "- [ ] Parent\n" + `${indent}- [x] Child`, // Doc content *before* parent update
			changes: [
				{ fromA: 18, toA: 19, fromB: 18, toB: 19, insertedText: "x" },
			], // Change in child
		});
		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);

		expect(result).not.toBe(tr);
		expect(result.changes).toHaveLength(2); // Original change + parent change
		// @ts-ignore - Accessing internal structure for test validation
		const parentChange = result.changes[1];
		expect(parentChange.from).toBe(3); // Position of space in parent: '- [ ]'
		expect(parentChange.to).toBe(4);
		expect(parentChange.insert).toBe("x");
		expect(result.annotations).toEqual([
			mockParentTaskStatusChangeAnnotation.of("autoCompleteParent.DONE"),
		]);
	});

	it("should NOT complete parent if it is already complete", () => {
		const mockPlugin = createMockPlugin();
		const indent = buildIndentString(createMockApp());
		const tr = createMockTransaction({
			startStateDocContent:
				"- [x] Parent\n" +
				`${indent}- [x] Child 1\n` +
				`${indent}- [ ] Child 2`,
			newDocContent:
				"- [x] Parent\n" +
				`${indent}- [x] Child 1\n` +
				`${indent}- [x] Child 2`, // Doc content *before* potential update
			changes: [
				{ fromA: 18, toA: 19, fromB: 18, toB: 19, insertedText: "x" },
			], // Change in Child 1
		});
		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);
		// Parent is already 'x', no change should happen even if Child 1 is completed
		expect(result).toBe(tr);
	});

	it("should mark parent as in progress when a child is unchecked (if setting enabled)", () => {
		const mockPlugin = createMockPlugin({
			markParentInProgressWhenPartiallyComplete: true,
			taskStatuses: { inProgress: "/", completed: "x" },
		});
		const tr = createMockTransaction({
			startStateDocContent: "- [x] Parent\n  - [x] Child",
			newDocContent: "- [x] Parent\n  - [ ] Child", // Doc content *before* parent update
			changes: [
				{ fromA: 18, toA: 19, fromB: 18, toB: 19, insertedText: " " },
			], // Child uncompleted
		});
		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);

		expect(result).not.toBe(tr);
		expect(result.changes).toHaveLength(2);
		// @ts-ignore
		const parentChange = result.changes[1];
		expect(parentChange.from).toBe(3); // Position of 'x' in parent: '- [x]'
		expect(parentChange.to).toBe(4);
		expect(parentChange.insert).toBe("/"); // Should be in progress marker
		expect(result.annotations).toEqual([
			mockParentTaskStatusChangeAnnotation.of(
				"autoCompleteParent.IN_PROGRESS"
			),
		]);
	});

	it("should NOT mark parent as in progress when a child is unchecked (if setting disabled)", () => {
		const mockPlugin = createMockPlugin({
			markParentInProgressWhenPartiallyComplete: false,
		});
		const tr = createMockTransaction({
			startStateDocContent: "- [x] Parent\n  - [x] Child",
			newDocContent: "- [x] Parent\n  - [ ] Child",
			changes: [
				{ fromA: 18, toA: 19, fromB: 18, toB: 19, insertedText: " " },
			],
		});
		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);
		expect(result).toBe(tr); // No change expected
	});

	it("should mark parent as in progress when first child gets a status (if setting enabled)", () => {
		const mockPlugin = createMockPlugin({
			markParentInProgressWhenPartiallyComplete: true,
			taskStatuses: { inProgress: "/", completed: "x" },
		});
		const indent = buildIndentString(createMockApp());
		const tr = createMockTransaction({
			startStateDocContent: "- [ ] Parent\n" + `${indent}- [ ] Child`,
			newDocContent: "- [ ] Parent\n" + `${indent}- [/] Child`, // Doc content *before* parent update
			changes: [
				{ fromA: 18, toA: 19, fromB: 18, toB: 19, insertedText: "/" },
			], // Child marked in progress
		});
		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);

		expect(result).not.toBe(tr);
		expect(result.changes).toHaveLength(2);
		// @ts-ignore
		const parentChange = result.changes[1];
		expect(parentChange.from).toBe(3); // Position of ' ' in parent: '- [ ]'
		expect(parentChange.to).toBe(4);
		expect(parentChange.insert).toBe("/");
		expect(result.annotations).toEqual([
			mockParentTaskStatusChangeAnnotation.of(
				"autoCompleteParent.IN_PROGRESS"
			),
		]);
	});

	it("should NOT mark parent as in progress when first child gets a status (if setting disabled)", () => {
		const mockPlugin = createMockPlugin({
			markParentInProgressWhenPartiallyComplete: false,
		});
		const tr = createMockTransaction({
			startStateDocContent: "- [ ] Parent\n  - [ ] Child",
			newDocContent: "- [ ] Parent\n  - [/] Child",
			changes: [
				{ fromA: 18, toA: 19, fromB: 18, toB: 19, insertedText: "/" },
			],
		});
		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);
		expect(result).toBe(tr);
	});

	it("should NOT mark parent as in progress if parent already has a status", () => {
		const mockPlugin = createMockPlugin({
			markParentInProgressWhenPartiallyComplete: true,
			taskStatuses: { inProgress: "/", completed: "x" },
		});
		const tr = createMockTransaction({
			startStateDocContent:
				"- [/] Parent\n  - [ ] Child 1\n  - [ ] Child 2",
			newDocContent: "- [/] Parent\n  - [x] Child 1\n  - [ ] Child 2",
			changes: [
				{ fromA: 18, toA: 19, fromB: 18, toB: 19, insertedText: "x" },
			], // Child 1 completed
		});
		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);
		// Parent already '/' and markParentInProgress only triggers if parent is ' ', so no change.
		expect(result).toBe(tr);
	});

	it("should ignore changes triggered by its own annotation (complete)", () => {
		const mockPlugin = createMockPlugin();
		const tr = createMockTransaction({
			startStateDocContent: "- [ ] Parent\n  - [ ] Child",
			newDocContent: "- [ ] Parent\n  - [x] Child", // Doc content *before* potential parent update
			changes: [
				{ fromA: 18, toA: 19, fromB: 18, toB: 19, insertedText: "x" },
			], // Change in child
			annotations: [
				mockParentTaskStatusChangeAnnotation.of(
					"autoCompleteParent.SOME_OTHER_ACTION"
				),
			], // Simulate annotation present
		});
		// Add a specific annotation value that includes 'autoCompleteParent'
		// @ts-ignore
		tr.annotation = jest.fn((type) => {
			if (type === mockParentTaskStatusChangeAnnotation) {
				return "autoCompleteParent.DONE"; // Simulate this transaction was caused by auto-complete
			}
			return undefined;
		});

		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);
		// Even though child is completed, the annotation should prevent parent completion
		expect(result).toBe(tr);
	});

	it("should ignore changes triggered by its own annotation (in progress)", () => {
		const indent = buildIndentString(createMockApp());
		const mockPlugin = createMockPlugin({
			markParentInProgressWhenPartiallyComplete: true,
			taskStatuses: { inProgress: "/", completed: "x" },
		});
		const tr = createMockTransaction({
			startStateDocContent: "- [ ] Parent\n" + `${indent}- [ ] Child`,
			newDocContent: "- [ ] Parent\n" + `${indent}- [/] Child`, // Doc content *before* potential parent update
			changes: [
				{ fromA: 18, toA: 19, fromB: 18, toB: 19, insertedText: "/" },
			], // Child marked in progress
			annotations: [
				mockParentTaskStatusChangeAnnotation.of(
					"autoCompleteParent.SOME_OTHER_ACTION"
				),
			], // Simulate annotation present
		});
		// @ts-ignore
		tr.annotation = jest.fn((type) => {
			if (type === mockParentTaskStatusChangeAnnotation) {
				return "autoCompleteParent.IN_PROGRESS"; // Simulate this transaction was caused by auto-complete
			}
			return undefined;
		});

		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);
		// Even though child got status, the annotation should prevent parent update
		expect(result).toBe(tr);
	});

	it("should mark parent as in progress when one child is completed but others remain incomplete", () => {
		const mockPlugin = createMockPlugin({
			markParentInProgressWhenPartiallyComplete: true,
			taskStatuses: { inProgress: "/", completed: "x" },
		});
		const indent = buildIndentString(createMockApp());
		const tr = createMockTransaction({
			startStateDocContent:
				"- [ ] Parent\n" +
				`${indent}- [ ] Child 1\n` +
				`${indent}- [ ] Child 2`,
			newDocContent:
				"- [ ] Parent\n" +
				`${indent}- [x] Child 1\n` +
				`${indent}- [ ] Child 2`, // Doc content *before* parent update
			changes: [
				{ fromA: 18, toA: 19, fromB: 18, toB: 19, insertedText: "x" },
			], // Change in Child 1
		});
		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);

		expect(result).not.toBe(tr);
		expect(result.changes).toHaveLength(2);
		// @ts-ignore
		const parentChange = result.changes[1];
		expect(parentChange.from).toBe(3); // Position of ' ' in parent: '- [ ]'
		expect(parentChange.to).toBe(4);
		expect(parentChange.insert).toBe("/"); // Should be in progress marker
		expect(result.annotations).toEqual([
			mockParentTaskStatusChangeAnnotation.of(
				"autoCompleteParent.IN_PROGRESS"
			),
		]);
	});

	it("should NOT change parent task status when deleting a dash with backspace", () => {
		const mockPlugin = createMockPlugin(); // Defaults: ' ', '/', 'x'

		// Set up a complete task and an incomplete task line below (just a dash)
		const startContent = "- [ ] Task 1\n- ";
		// After pressing Backspace to delete the dash on the second line, the first line task should not become [/]
		const newContent = "- [ ] Task 1";

		// Simulate pressing Backspace to delete the dash at the beginning of the second line
		const tr = createMockTransaction({
			startStateDocContent: startContent,
			newDocContent: newContent,
			changes: [
				{
					fromA: 15, // Position of the dash on the second line
					toA: 15, // End position of the dash
					fromB: 12, // Same position in the new content
					toB: 12, // Position after deletion
					insertedText: "", // Delete operation, no inserted text
				},
			],
			docChanged: true,
		});

		// The function should detect this is a deletion operation, not a task status change
		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);

		// Expect the original transaction to be returned (no modification)
		expect(result).toBe(tr);
		expect(result.changes).toEqual(tr.changes);
		expect(result.selection).toEqual(tr.selection);
	});

	it("should NOT change parent task status when deleting an indented dash", () => {
		const mockPlugin = createMockPlugin(); // Defaults: ' ', '/', 'x'
		const indent = buildIndentString(createMockApp());

		// Test with indentation
		const startContentIndented = "- [ ] Task 1\n" + indent + "- ";
		const newContentIndented = "- [ ] Task 1\n" + indent; // Delete the dash after indentation

		const trIndented = createMockTransaction({
			startStateDocContent: startContentIndented,
			newDocContent: newContentIndented,
			changes: [
				{
					fromA: 15, // Position of the dash after indentation
					toA: 16, // End position of the dash
					fromB: 15, // Same position in the new content
					toB: 14, // Position after deletion
					insertedText: "", // Delete operation, no inserted text
				},
			],
			docChanged: true,
		});

		const resultIndented = handleParentTaskUpdateTransaction(
			trIndented,
			mockApp,
			mockPlugin
		);

		// The function should not change parent task status when deleting a dash
		expect(resultIndented).toBe(trIndented);
		expect((resultIndented as any).changes).toEqual(
			(trIndented as any).changes
		);
		expect(resultIndented.selection).toEqual(trIndented.selection);
		// Verify no parent task status change annotation was added
		expect(resultIndented.annotations).not.toEqual(
			mockParentTaskStatusChangeAnnotation.of(
				"autoCompleteParent.COMPLETED"
			)
		);
		expect((resultIndented as any).annotations).not.toEqual(
			mockParentTaskStatusChangeAnnotation.of(
				"autoCompleteParent.IN_PROGRESS"
			)
		);
	});

	it("should prevent accidental parent status changes when deleting a dash and newline marker", () => {
		const mockPlugin = createMockPlugin(); // Defaults: ' ', '/', 'x'

		// Test erroneous behavior: deleting a dash incorrectly changes the status of the previous task
		const startContent = "- [ ] Task 1\n- ";
		const newContent = "- [ ] Task 1"; // Status incorrectly changed

		const tr = createMockTransaction({
			startStateDocContent: startContent,
			newDocContent: newContent,
			changes: [
				{
					fromA: 15, // Position of the dash on the second line
					toA: 15, // End position of the dash
					fromB: 12, // Position of the task status
					toB: 12, // End position of the status
					insertedText: "", // Incorrectly inserted new status
				},
			],
			docChanged: true,
		});

		// Even when receiving such a transaction, the function should detect this is not a valid status change
		const result = handleParentTaskUpdateTransaction(
			tr,
			mockApp,
			mockPlugin
		);

		console.log((result as any).changes);

		// The function should identify and prevent such accidental parent status changes
		expect(result).toBe(tr);
		expect(result.changes).toEqual(tr.changes);
		// Verify no new changes were added to modify parent task status
		// Use type assertion to access changes property in test mocks
		expect((result as any).changes.length).toBe(1);
	});
});

// Add more tests for edge cases, different indentation levels, workflow interactions etc.
