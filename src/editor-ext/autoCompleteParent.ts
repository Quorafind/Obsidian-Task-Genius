import { App, Editor } from "obsidian";
import {
	EditorState,
	Text,
	Transaction,
	TransactionSpec,
} from "@codemirror/state";
import { getTabSize } from "../utils";
import { taskStatusChangeAnnotation } from "./taskStatusSwitcher";
import TaskProgressBarPlugin from "..";

/**
 * Creates an editor extension that automatically updates parent tasks based on child task status changes
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @returns An editor extension that can be registered with the plugin
 */
export function autoCompleteParentExtension(
	app: App,
	plugin: TaskProgressBarPlugin
) {
	return EditorState.transactionFilter.of((tr) => {
		return handleParentTaskUpdateTransaction(tr, app, plugin);
	});
}

/**
 * Handles transactions to detect task status changes and process parent task updates
 * @param tr The transaction to handle
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @returns The original transaction or a modified transaction
 */
export function handleParentTaskUpdateTransaction(
	tr: Transaction,
	app: App,
	plugin: TaskProgressBarPlugin
): TransactionSpec {
	// Only process transactions that change the document
	if (!tr.docChanged) {
		return tr;
	}

	// Check if a task status was changed or a new task was added in this transaction
	const taskStatusChangeInfo = findTaskStatusChange(tr);

	if (!taskStatusChangeInfo) {
		return tr;
	}

	console.log(taskStatusChangeInfo);

	// Check if the changed task has a parent task
	const { doc, lineNumber } = taskStatusChangeInfo;
	const parentInfo = findParentTask(doc, lineNumber);

	console.log(parentInfo);
	if (!parentInfo) {
		return tr;
	}

	// Check if all siblings are completed
	const allSiblingsCompleted = areAllSiblingsCompleted(
		doc,
		parentInfo.lineNumber,
		parentInfo.indentationLevel,
		app
	);

	// Get current parent status
	const parentStatus = getParentTaskStatus(doc, parentInfo.lineNumber);
	const isParentCompleted = parentStatus === "x" || parentStatus === "X";

	// If all siblings are completed, mark the parent task as completed
	if (allSiblingsCompleted) {
		return completeParentTask(tr, parentInfo.lineNumber, doc);
	}

	// If the parent is already completed but not all siblings are completed,
	// it means a new task was added after the parent was completed,
	// so we should revert the parent to "In Progress"
	if (
		isParentCompleted &&
		!allSiblingsCompleted &&
		plugin.settings.markParentInProgressWhenPartiallyComplete
	) {
		return markParentAsInProgress(
			tr,
			parentInfo.lineNumber,
			doc,
			plugin.settings.taskStatuses.inProgress.split("|") || ["/"]
		);
	}

	// Check if any sibling is completed or has any status other than empty
	const anySiblingsWithStatus = anySiblingWithStatus(
		doc,
		parentInfo.lineNumber,
		parentInfo.indentationLevel,
		app
	);

	// If any siblings have a status and the feature is enabled, mark the parent as "In Progress"
	if (
		anySiblingsWithStatus &&
		plugin.settings.markParentInProgressWhenPartiallyComplete
	) {
		// Only update if the parent is not already marked as "In Progress" or completed
		const inProgressStatuses = plugin.settings.taskStatuses.inProgress
			.trim()
			.split("|") || ["/", ">"];

		if (
			!inProgressStatuses.includes(parentStatus) &&
			parentStatus !== "x" &&
			parentStatus !== "X"
		) {
			return markParentAsInProgress(
				tr,
				parentInfo.lineNumber,
				doc,
				inProgressStatuses
			);
		}
	}

	return tr;
}

/**
 * Finds any task status change in the transaction
 * @param tr The transaction to check
 * @returns Information about the task with changed status or null if no task status was changed
 */
function findTaskStatusChange(tr: Transaction): {
	doc: Text;
	lineNumber: number;
} | null {
	let taskChangedLine: number | null = null;

	// Check each change in the transaction
	tr.changes.iterChanges(
		(
			fromA: number,
			toA: number,
			fromB: number,
			toB: number,
			inserted: Text
		) => {
			// Check if this is a new line insertion with a task marker
			if (inserted.length > 0) {
				const insertedText = inserted.toString();

				// First check for tasks with preceding newline (common case when adding a task in the middle of a document)
				const newTaskMatch = insertedText.match(
					/\n[\s|\t]*([-*+]|\d+\.)\s\[ \]/
				);

				if (newTaskMatch) {
					// A new task was added, find the line number
					try {
						const line = tr.newDoc.lineAt(
							fromB + insertedText.indexOf(newTaskMatch[0]) + 1
						);
						taskChangedLine = line.number;
						return; // We found a new task, no need to continue checking
					} catch (e) {
						// Line calculation might fail, continue with other checks
					}
				}

				// Also check for tasks without preceding newline (e.g., at the beginning of a document)
				const taskAtStartMatch = insertedText.match(
					/^[\s|\t]*([-*+]|\d+\.)\s\[ \]/
				);

				if (taskAtStartMatch) {
					try {
						const line = tr.newDoc.lineAt(fromB);
						taskChangedLine = line.number;
						return; // We found a new task, no need to continue checking
					} catch (e) {
						// Line calculation might fail, continue with other checks
					}
				}
			}

			// Get the position context
			const pos = fromB;
			const line = tr.newDoc.lineAt(pos);
			const lineText = line.text;

			// Check if this line contains a task marker
			const taskRegex = /^[\s|\t]*([-*+]|\d+\.)\s\[(.)]/i;
			const taskMatch = lineText.match(taskRegex);

			if (taskMatch) {
				// Get the old line if it exists in the old document
				let oldLine = null;
				try {
					const oldPos = fromA;
					if (oldPos >= 0 && oldPos < tr.startState.doc.length) {
						oldLine = tr.startState.doc.lineAt(oldPos);
					}
				} catch (e) {
					// Line might not exist in old document
				}

				// If we couldn't get the old line or the content has changed in the task marker area
				if (
					!oldLine ||
					(inserted.length > 0 &&
						line.from + lineText.indexOf("[") <= toB &&
						line.from + lineText.indexOf("]") >= fromB)
				) {
					taskChangedLine = line.number;
				}
			}
		}
	);

	if (taskChangedLine === null) {
		return null;
	}

	return {
		doc: tr.newDoc,
		lineNumber: taskChangedLine,
	};
}

/**
 * Finds the parent task of a given task line
 * @param doc The document to search in
 * @param lineNumber The line number of the task
 * @returns Information about the parent task or null if no parent was found
 */
function findParentTask(
	doc: Text,
	lineNumber: number
): {
	lineNumber: number;
	indentationLevel: number;
} | null {
	// Get the current line and its indentation level
	const currentLine = doc.line(lineNumber);
	const currentLineText = currentLine.text;
	console.log(currentLineText, currentLine);
	const currentIndentMatch = currentLineText.match(/^[\s|\t]*/);
	const currentIndentLevel = currentIndentMatch
		? currentIndentMatch[0].length
		: 0;

	// If we're at the top level, there's no parent
	if (currentIndentLevel === 0) {
		return null;
	}

	// Determine if the current line uses spaces or tabs for indentation
	const usesSpaces =
		currentIndentMatch && currentIndentMatch[0].includes(" ");
	const usesTabs = currentIndentMatch && currentIndentMatch[0].includes("\t");

	// Look backwards for a line with less indentation that contains a task
	for (let i = lineNumber - 1; i >= 1; i--) {
		const line = doc.line(i);
		const lineText = line.text;

		// Skip empty lines
		if (lineText.trim() === "") {
			continue;
		}

		// Get the indentation level of this line
		const indentMatch = lineText.match(/^[\s|\t]*/);
		const indentLevel = indentMatch ? indentMatch[0].length : 0;

		// Check if the indentation type matches (spaces vs tabs)
		const lineUsesSpaces = indentMatch && indentMatch[0].includes(" ");
		const lineUsesTabs = indentMatch && indentMatch[0].includes("\t");

		// If indentation types don't match, this can't be a parent
		// Only compare when both lines have some indentation
		if (indentLevel > 0 && currentIndentLevel > 0) {
			if (
				(usesSpaces && !lineUsesSpaces) ||
				(usesTabs && !lineUsesTabs)
			) {
				continue;
			}
		}

		// If this line has less indentation than the current line
		if (indentLevel < currentIndentLevel) {
			// Check if it's a task
			const taskRegex = /^[\s|\t]*([-*+]|\d+\.)\s\[(.)\]/i;
			if (taskRegex.test(lineText)) {
				return {
					lineNumber: i,
					indentationLevel: indentLevel,
				};
			}

			// If it's not a task, it can't be a parent task
			// If it's a heading or other structural element, we keep looking
			if (!lineText.startsWith("#") && !lineText.startsWith(">")) {
				break;
			}
		}
	}

	return null;
}

/**
 * Checks if all sibling tasks at the same indentation level as the parent's children are completed
 * @param doc The document to check
 * @param parentLineNumber The line number of the parent task
 * @param parentIndentLevel The indentation level of the parent task
 * @returns True if all siblings are completed, false otherwise
 */
function areAllSiblingsCompleted(
	doc: Text,
	parentLineNumber: number,
	parentIndentLevel: number,
	app: App
): boolean {
	const tabSize = getTabSize(app);

	// The expected indentation level for child tasks
	const childIndentLevel = parentIndentLevel + tabSize;

	// Track if we found at least one child
	let foundChild = false;

	// Search forward from the parent line
	for (let i = parentLineNumber + 1; i <= doc.lines; i++) {
		const line = doc.line(i);
		const lineText = line.text;

		// Skip empty lines
		if (lineText.trim() === "") {
			continue;
		}

		// Get the indentation of this line
		const indentMatch = lineText.match(/^[\s|\t]*/);
		const indentLevel = indentMatch ? indentMatch[0].length : 0;

		// If we encounter a line with less or equal indentation to the parent,
		// we've moved out of the parent's children scope
		if (indentLevel <= parentIndentLevel) {
			break;
		}

		// If this is a direct child of the parent (exactly one level deeper)
		if (indentLevel === childIndentLevel) {
			// Create a regex to match tasks based on the indentation level
			const taskRegex = new RegExp(
				`^[\\s|\\t]{${childIndentLevel}}([-*+]|\\d+\\.)\\s\\[(.)\\]`
			);

			const taskMatch = lineText.match(taskRegex);
			if (taskMatch) {
				foundChild = true;

				// If we find an incomplete task, return false
				const taskStatus = taskMatch[2];

				if (taskStatus !== "x" && taskStatus !== "X") {
					return false;
				}
			}
		}
	}

	// If we found at least one child and all were completed, return true
	return foundChild;
}

/**
 * Completes a parent task by modifying the transaction
 * @param tr The transaction to modify
 * @param parentLineNumber The line number of the parent task
 * @param doc The document
 * @returns The modified transaction
 */
function completeParentTask(
	tr: Transaction,
	parentLineNumber: number,
	doc: Text
): TransactionSpec {
	const parentLine = doc.line(parentLineNumber);
	const parentLineText = parentLine.text;

	// Find the task marker position
	const taskMarkerMatch = parentLineText.match(
		/^[\s|\t]*([-*+]|\d+\.)\s\[(.)\]/
	);
	if (!taskMarkerMatch) {
		return tr;
	}

	// Calculate the position where we need to insert 'x'
	// Find the exact position of the checkbox character
	const checkboxStart = parentLineText.indexOf("[") + 1;
	const markerStart = parentLine.from + checkboxStart;

	// Create a new transaction that adds the completion marker 'x' to the parent task
	return {
		changes: [
			tr.changes,
			{
				from: markerStart,
				to: markerStart + 1,
				insert: "x",
			},
		],
		selection: tr.selection,
		annotations: [taskStatusChangeAnnotation.of("taskStatusChange")],
	};
}

/**
 * Checks if any sibling tasks have any status (not empty)
 * @param doc The document to check
 * @param parentLineNumber The line number of the parent task
 * @param parentIndentLevel The indentation level of the parent task
 * @param app The Obsidian app instance
 * @returns True if any siblings have a status, false otherwise
 */
function anySiblingWithStatus(
	doc: Text,
	parentLineNumber: number,
	parentIndentLevel: number,
	app: App
): boolean {
	const tabSize = getTabSize(app);

	// The expected indentation level for child tasks
	const childIndentLevel = parentIndentLevel + tabSize;

	// Search forward from the parent line
	for (let i = parentLineNumber + 1; i <= doc.lines; i++) {
		const line = doc.line(i);
		const lineText = line.text;

		// Skip empty lines
		if (lineText.trim() === "") {
			continue;
		}

		// Get the indentation of this line
		const indentMatch = lineText.match(/^[\s|\t]*/);
		const indentLevel = indentMatch ? indentMatch[0].length : 0;

		// If we encounter a line with less or equal indentation to the parent,
		// we've moved out of the parent's children scope
		if (indentLevel <= parentIndentLevel) {
			break;
		}

		// If this is a direct child of the parent (exactly one level deeper)
		if (indentLevel === childIndentLevel) {
			// Create a regex to match tasks based on the indentation level
			const taskRegex = new RegExp(
				`^[\\s|\\t]{${childIndentLevel}}([-*+]|\\d+\\.)\\s\\[(.)\\]`
			);

			const taskMatch = lineText.match(taskRegex);
			if (taskMatch) {
				// If the task has any status other than space, return true
				const taskStatus = taskMatch[2];
				if (taskStatus !== " ") {
					return true;
				}
			}
		}
	}

	return false;
}

/**
 * Gets the current status of a parent task
 * @param doc The document
 * @param parentLineNumber The line number of the parent task
 * @returns The task status character
 */
function getParentTaskStatus(doc: Text, parentLineNumber: number): string {
	const parentLine = doc.line(parentLineNumber);
	const parentLineText = parentLine.text;

	// Find the task marker
	const taskMarkerMatch = parentLineText.match(
		/^[\s|\t]*([-*+]|\d+\.)\s\[(.)]/
	);

	if (!taskMarkerMatch) {
		return "";
	}

	return taskMarkerMatch[2];
}

/**
 * Marks a parent task as "In Progress" by modifying the transaction
 * @param tr The transaction to modify
 * @param parentLineNumber The line number of the parent task
 * @param doc The document
 * @returns The modified transaction
 */
function markParentAsInProgress(
	tr: Transaction,
	parentLineNumber: number,
	doc: Text,
	taskStatusCycle: string[]
): TransactionSpec {
	const parentLine = doc.line(parentLineNumber);
	const parentLineText = parentLine.text;

	// Find the task marker position, accepting any current status (not just empty)
	const taskMarkerMatch = parentLineText.match(
		/^[\s|\t]*([-*+]|\d+\.)\s\[(.)\]/
	);
	if (!taskMarkerMatch) {
		return tr;
	}

	// Calculate the position where we need to insert the "In Progress" marker
	// Find the exact position of the checkbox character
	const checkboxStart = parentLineText.indexOf("[") + 1;
	const markerStart = parentLine.from + checkboxStart;

	// Create a new transaction that adds the "In Progress" marker to the parent task
	return {
		changes: [
			tr.changes,
			{
				from: markerStart,
				to: markerStart + 1,
				insert: taskStatusCycle[0],
			},
		],
		selection: tr.selection,
		annotations: [taskStatusChangeAnnotation.of("taskStatusChange")],
	};
}
