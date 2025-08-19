import { App, Editor } from "obsidian";
import {
	EditorState,
	Text,
	Transaction,
	TransactionSpec,
} from "@codemirror/state";
import { getTabSize } from "../../utils";
import { taskStatusChangeAnnotation } from "../task-operations/status-switcher";
import TaskProgressBarPlugin from "../../index";
import {
	isLastWorkflowStageOrNotWorkflow,
	workflowChangeAnnotation,
} from "../workflow/workflow-handler";

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
 * Handles transactions to detect task status changes and manage parent task completion
 * @param tr The transaction to handle
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @returns The original transaction or a modified transaction with parent task updates
 */
function handleParentTaskUpdateTransaction(
	tr: Transaction,
	app: App,
	plugin: TaskProgressBarPlugin
): TransactionSpec {
	// Only process transactions that change the document
	if (!tr.docChanged) {
		return tr;
	}

	// Skip if auto-complete parent is disabled
	if (!plugin.settings.autoCompleteParent) {
		return tr;
	}

	// Skip if this transaction was triggered by the auto-complete parent feature itself
	const annotationValue = tr.annotation(taskStatusChangeAnnotation);
	if (
		typeof annotationValue === "string" &&
		annotationValue.includes("autoCompleteParent")
	) {
		return tr;
	}

	// Skip if this is a paste operation or other bulk operations
	if (tr.isUserEvent("input.paste") || tr.isUserEvent("set")) {
		return tr;
	}

	// Skip if this looks like a move operation (delete + insert of same content)
	if (isMoveOperation(tr)) {
		return tr;
	}

	// Check if a task status was changed in this transaction
	const taskStatusChangeInfo = findTaskStatusChange(tr);

	if (!taskStatusChangeInfo) {
		return tr;
	}

	const { doc, lineNumber } = taskStatusChangeInfo;

	// Find the parent task of the changed task
	const parentTaskInfo = findParentTask(doc, lineNumber);

	if (!parentTaskInfo) {
		return tr;
	}

	const { lineNumber: parentLineNumber, indentationLevel } = parentTaskInfo;

	// If auto-completion is enabled and all siblings are completed
	if (plugin.settings.autoCompleteParent) {
		if (
			areAllSiblingsCompleted(
				doc,
				parentLineNumber,
				indentationLevel,
				plugin
			)
		) {
			return completeParentTask(tr, parentLineNumber, doc);
		}
	}

	// If auto-in-progress is enabled
	if (plugin.settings.markParentInProgressWhenPartiallyComplete) {
		const parentCurrentStatus = getParentTaskStatus(doc, parentLineNumber);
		const allSiblingsCompleted = areAllSiblingsCompleted(
			doc,
			parentLineNumber,
			indentationLevel,
			plugin
		);
		const anySiblingHasStatus = anySiblingWithStatus(
			doc,
			parentLineNumber,
			indentationLevel,
			app
		);

		// Check if there are any child tasks at all
		const hasAnyChildTasks = hasAnyChildTasksAtLevel(
			doc,
			parentLineNumber,
			indentationLevel,
			app
		);

		// Mark as in-progress if:
		// 1. Parent is currently empty and any sibling has status, OR
		// 2. Parent is currently complete but not all siblings are complete and there are child tasks
		if (
			(parentCurrentStatus === " " && anySiblingHasStatus) ||
			(parentCurrentStatus === "x" &&
				!allSiblingsCompleted &&
				hasAnyChildTasks)
		) {
			const inProgressMarker =
				plugin.settings.taskStatuses.inProgress.split("|")[0] || "/";

			return markParentAsInProgress(tr, parentLineNumber, doc, [
				inProgressMarker,
			]);
		}
	}

	return tr;
}

/**
 * Detects if a transaction represents a move operation (line reordering)
 * @param tr The transaction to check
 * @returns True if this appears to be a move operation
 */
function isMoveOperation(tr: Transaction): boolean {
	const changes: Array<{
		type: "delete" | "insert";
		content: string;
		fromA: number;
		toA: number;
		fromB: number;
		toB: number;
	}> = [];

	// Collect all changes in the transaction
	tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
		// Record deletions
		if (fromA < toA) {
			const deletedText = tr.startState.doc.sliceString(fromA, toA);
			changes.push({
				type: "delete",
				content: deletedText,
				fromA,
				toA,
				fromB,
				toB,
			});
		}

		// Record insertions
		if (inserted.length > 0) {
			changes.push({
				type: "insert",
				content: inserted.toString(),
				fromA,
				toA,
				fromB,
				toB,
			});
		}
	});

	// Check if we have both deletions and insertions
	const deletions = changes.filter((c) => c.type === "delete");
	const insertions = changes.filter((c) => c.type === "insert");

	if (deletions.length === 0 || insertions.length === 0) {
		return false;
	}

	// Check if any deleted content matches any inserted content
	// This could indicate a move operation
	for (const deletion of deletions) {
		for (const insertion of insertions) {
			// Check for exact match or match with whitespace differences
			const deletedLines = deletion.content
				.split("\n")
				.filter((line) => line.trim());
			const insertedLines = insertion.content
				.split("\n")
				.filter((line) => line.trim());

			if (
				deletedLines.length === insertedLines.length &&
				deletedLines.length > 0
			) {
				let isMatch = true;
				for (let i = 0; i < deletedLines.length; i++) {
					// Compare content without leading/trailing whitespace but preserve task structure
					const deletedLine = deletedLines[i].trim();
					const insertedLine = insertedLines[i].trim();
					if (deletedLine !== insertedLine) {
						isMatch = false;
						break;
					}
				}
				if (isMatch) {
					return true;
				}
			}
		}
	}

	return false;
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
			if (inserted.length > 0 && taskChangedLine === null) {
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
 * Checks if all sibling tasks at the same indentation level as the parent's children are completed.
 * Considers workflow tasks: only treats them as completed if they are the final stage or not workflow tasks.
 * @param doc The document to check
 * @param parentLineNumber The line number of the parent task
 * @param parentIndentLevel The indentation level of the parent task
 * @param plugin The plugin instance
 * @returns True if all siblings are completed (considering workflow rules), false otherwise
 */
function areAllSiblingsCompleted(
	doc: Text,
	parentLineNumber: number,
	parentIndentLevel: number,
	plugin: TaskProgressBarPlugin
): boolean {
	const tabSize = getTabSize(plugin.app);

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
		const currentIndentText = indentMatch ? indentMatch[0] : "";
		const indentLevel = currentIndentText.length;

		// If we encounter a line with less or equal indentation to the parent,
		// we've moved out of the parent's children scope
		if (indentLevel <= parentIndentLevel) {
			break;
		}

		// Check if this is a direct child (exactly one level deeper)
		if (indentLevel === childIndentLevel) {
			// Check if it's a task
			const taskRegex = /^[\s|\t]*([-*+]|\d+\.)\s\[(.)\]/i;
			const taskMatch = lineText.match(taskRegex);

			if (taskMatch) {
				foundChild = true; // We found at least one child task
				const taskStatus = taskMatch[2]; // Status character is in group 2

				if (taskStatus !== "x" && taskStatus !== "X") {
					// Found an incomplete child task
					return false;
				} else {
					// Task IS marked [x] or [X]. Now, consider workflow.
					if (plugin.settings.workflow.enableWorkflow) {
						// Only perform the strict workflow stage check IF autoRemoveLastStageMarker is ON.
						// If autoRemoveLastStageMarker is OFF, we trust the '[x]' status for parent completion.
						if (
							plugin.settings.workflow.autoRemoveLastStageMarker
						) {
							// Setting is ON: Rely on the stage check.
							if (
								!isLastWorkflowStageOrNotWorkflow(
									lineText,
									i,
									doc,
									plugin
								)
							) {
								// It's [x], workflow is enabled, marker removal is ON,
								// but it's not considered the final stage by the check.
								return false;
							}
						}
						// else: Setting is OFF. Do nothing. The task is [x], so we consider it complete for parent checking.
					}
					// If workflow is disabled, or passed the workflow checks, continue loop.
				}
			}
		}
	}

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

	// If the parent is already marked as completed, don't modify it again
	const currentStatus = taskMarkerMatch[2];
	if (currentStatus === "x" || currentStatus === "X") {
		return tr;
	}

	// Check if there's already a pending change for this parent task in this transaction
	let alreadyChanging = false;
	tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
		const checkboxStart = parentLineText.indexOf("[") + 1;
		const markerStart = parentLine.from + checkboxStart;

		// Check if any change in the transaction affects the checkbox character
		if (markerStart >= fromB && markerStart < toB) {
			alreadyChanging = true;
		}
	});

	// If the task is already being changed in this transaction, don't add another change
	if (alreadyChanging) {
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
		annotations: [taskStatusChangeAnnotation.of("autoCompleteParent.DONE")],
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
			// Check if it's a task
			const taskRegex = /^[\s|\t]*([-*+]|\d+\.)\s\[(.)\]/i;
			const taskMatch = lineText.match(taskRegex);

			if (taskMatch) {
				// If the task has any status other than space, return true
				const taskStatus = taskMatch[2]; // Status character is in group 2
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

	// Get current status
	const currentStatus = taskMarkerMatch[2];

	// If the status is already the in-progress marker we want to set, don't change it
	if (currentStatus === taskStatusCycle[0]) {
		return tr;
	}

	// Check if there's already a pending change for this parent task in this transaction
	let alreadyChanging = false;
	tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
		const checkboxStart = parentLineText.indexOf("[") + 1;
		const markerStart = parentLine.from + checkboxStart;

		// Check if any change in the transaction affects the checkbox character
		if (markerStart >= fromB && markerStart < toB) {
			alreadyChanging = true;
		}
	});

	// If the task is already being changed in this transaction, don't add another change
	if (alreadyChanging) {
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
		annotations: [
			taskStatusChangeAnnotation.of("autoCompleteParent.IN_PROGRESS"),
		],
	};
}

/**
 * Checks if there are any child tasks at the specified indentation level
 * @param doc The document to check
 * @param parentLineNumber The line number of the parent task
 * @param parentIndentLevel The indentation level of the parent task
 * @param app The Obsidian app instance
 * @returns True if there are any child tasks, false otherwise
 */
function hasAnyChildTasksAtLevel(
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
			// Check if it's a task
			const taskRegex = /^[\s|\t]*([-*+]|\d+\.)\s\[(.)\]/i;
			if (taskRegex.test(lineText)) {
				return true; // Found at least one child task
			}
		}
	}

	return false;
}

export {
	handleParentTaskUpdateTransaction,
	findTaskStatusChange,
	findParentTask,
	areAllSiblingsCompleted,
	anySiblingWithStatus,
	getParentTaskStatus,
	hasAnyChildTasksAtLevel,
	taskStatusChangeAnnotation,
};
