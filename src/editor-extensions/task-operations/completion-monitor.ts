import { App, debounce, editorInfoField } from "obsidian";
import { EditorState, Transaction, Text } from "@codemirror/state";
import TaskProgressBarPlugin from "../../index"; // Adjust path if needed
import { parseTaskLine } from "../../utils/task/task-operations"; // Adjust path if needed
import { taskStatusChangeAnnotation } from "./status-switcher";
import { Task } from "../../types/task";

const debounceTrigger = debounce((app: App, task: Task) => {
	app.workspace.trigger("task-genius:task-completed", task);
}, 200);

/**
 * Creates an editor extension that monitors task completion events.
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @returns An editor extension
 */
export function monitorTaskCompletedExtension(
	app: App,
	plugin: TaskProgressBarPlugin
) {
	return EditorState.transactionFilter.of((tr) => {
		// Handle the transaction to check for task completions
		handleMonitorTaskCompletionTransaction(tr, app, plugin);
		// Always return the original transaction, as we are only monitoring
		return tr;
	});
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

	// Count the number of changes to determine if this could be a move
	let changeCount = 0;

	// Collect all changes in the transaction
	tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
		changeCount++;

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

	// Simple edits (like changing a single character) are unlikely to be moves
	// Most single-character task status changes involve only 1 change
	if (changeCount <= 1) {
		return false;
	}

	// Check if we have both deletions and insertions
	const deletions = changes.filter((c) => c.type === "delete");
	const insertions = changes.filter((c) => c.type === "insert");

	if (deletions.length === 0 || insertions.length === 0) {
		return false;
	}

	// For a move operation, we typically expect:
	// 1. Multiple changes (deletion + insertion)
	// 2. The deleted and inserted content should be substantial (not just a character)
	// 3. The content should match exactly

	// Check if any deleted content matches any inserted content
	for (const deletion of deletions) {
		for (const insertion of insertions) {
			// Skip if the content is too short (likely a status character change)
			if (
				deletion.content.trim().length < 10 ||
				insertion.content.trim().length < 10
			) {
				continue;
			}

			// Check for exact match
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

				// If we found a substantial content match, this is likely a move
				if (isMatch) {
					return true;
				}
			}
		}
	}

	return false;
}

/**
 * Handles transactions to detect when a task is marked as completed.
 * @param tr The transaction to handle
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 */
function handleMonitorTaskCompletionTransaction(
	tr: Transaction,
	app: App,
	plugin: TaskProgressBarPlugin
) {
	// Only process transactions that change the document
	if (!tr.docChanged) {
		return;
	}

	console.log("monitorTaskCompletedExtension", tr.changes);

	if (tr.isUserEvent("set") && tr.changes.length > 1) {
		return tr;
	}

	if (tr.isUserEvent("input.paste")) {
		return tr;
	}

	// Skip if this looks like a move operation (delete + insert of same content)
	if (isMoveOperation(tr)) {
		return;
	}

	// Regex to identify a completed task line
	const completedTaskRegex = /^[\s|\t]*([-*+]|\d+\.)\s+\[[xX]\]/;
	// Regex to identify any task line (to check the previous state)
	const anyTaskRegex = /^[\s|\t]*([-*+]|\d+\.)\s+\[.\]/;

	tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
		// Only process actual insertions that might contain completed tasks
		if (inserted.length === 0) {
			return;
		}

		// Determine the range of lines affected by the change in the new document state
		const affectedLinesStart = tr.newDoc.lineAt(fromB).number;
		// Check the line where the change ends, in case the change spans lines or adds new lines
		const affectedLinesEnd = tr.newDoc.lineAt(toB).number;

		// Iterate through each line potentially affected by this change
		for (let i = affectedLinesStart; i <= affectedLinesEnd; i++) {
			// Ensure the line number is valid in the new document
			if (i > tr.newDoc.lines) continue;

			const newLine = tr.newDoc.line(i);
			const newLineText = newLine.text;

			// Check if the line in the new state represents a completed task
			if (completedTaskRegex.test(newLineText)) {
				let originalLineText = "";
				let wasTaskBefore = false;
				let foundCorrespondingTask = false;

				// First, try to find the corresponding task in deleted content
				tr.changes.iterChanges(
					(oldFromA, oldToA, oldFromB, oldToB, oldInserted) => {
						// Look for deletions that might correspond to this insertion
						if (oldFromA < oldToA && !foundCorrespondingTask) {
							try {
								const deletedText =
									tr.startState.doc.sliceString(
										oldFromA,
										oldToA
									);
								const deletedLines = deletedText.split("\n");

								for (const deletedLine of deletedLines) {
									const deletedTaskMatch =
										deletedLine.match(anyTaskRegex);
									if (deletedTaskMatch) {
										// Compare the task content (without status) to see if it's the same task
										const newTaskContent = newLineText
											.replace(anyTaskRegex, "")
											.trim();
										const deletedTaskContent = deletedLine
											.replace(anyTaskRegex, "")
											.trim();

										// If the content matches, this is likely the same task
										if (
											newTaskContent ===
											deletedTaskContent
										) {
											originalLineText = deletedLine;
											wasTaskBefore = true;
											foundCorrespondingTask = true;
											break;
										}
									}
								}
							} catch (e) {
								// Ignore errors when trying to get deleted text
							}
						}
					}
				);

				// If we couldn't find a corresponding task in deletions, try the original method
				if (!foundCorrespondingTask) {
					try {
						// Map the beginning of the current line in the new doc back to the original doc
						// Use -1 bias to prefer mapping to the state *before* the character was inserted
						const originalPos = tr.changes.mapPos(newLine.from, -1);

						if (originalPos !== null) {
							const originalLine =
								tr.startState.doc.lineAt(originalPos);
							originalLineText = originalLine.text;
							// Check if the original line was a task (of any status)
							wasTaskBefore = anyTaskRegex.test(originalLineText);
							foundCorrespondingTask = true;
						}
					} catch (e) {
						// Ignore errors if the line didn't exist or changed drastically
						// console.warn("Could not get original line state for completion check:", e);
					}
				}

				// Log completion only if:
				// 1. We found a corresponding task in the original state
				// 2. The line was a task before
				// 3. It was NOT already complete in the previous state
				// 4. It's now complete
				if (
					foundCorrespondingTask &&
					wasTaskBefore &&
					!completedTaskRegex.test(originalLineText)
				) {
					const editorInfo = tr.startState.field(editorInfoField);
					const filePath = editorInfo?.file?.path || "unknown file";

					// Parse the task details using the utility function
					const task = parseTaskLine(
						filePath,
						newLineText,
						newLine.number, // line numbers are 1-based
						plugin.settings.preferMetadataFormat, // Use plugin setting for format preference
						plugin // Pass plugin for configurable prefix support
					);
					console.log(task);

					// Optionally, trigger a custom event that other parts of the plugin or Obsidian could listen to
					if (task) {
						console.log("trigger task-completed event");
						debounceTrigger(app, task);
					}

					// Optimization: If we've confirmed completion for this line,
					// no need to re-check it due to other changes within the same transaction.
					// We break the inner loop (over lines) and continue to the next change set (iterChanges).
					// Note: This assumes one completion per line per transaction is sufficient to log.
					break;
				}
			}
		}
	});
}
