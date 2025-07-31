import { App, editorInfoField } from "obsidian";
import {
	EditorState,
	Text,
	Transaction,
	TransactionSpec,
} from "@codemirror/state";
import TaskProgressBarPlugin from "../index";
import { taskStatusChangeAnnotation } from "./taskStatusSwitcher";
import { getTasksAPI } from "../utils";
import { priorityChangeAnnotation } from "./priorityPicker";
import { parseTaskLine } from "../utils/taskUtil";

/**
 * Creates an editor extension that cycles through task statuses when a user clicks on a task marker
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @returns An editor extension that can be registered with the plugin
 */
export function cycleCompleteStatusExtension(
	app: App,
	plugin: TaskProgressBarPlugin
) {
	return EditorState.transactionFilter.of((tr) => {
		return handleCycleCompleteStatusTransaction(tr, app, plugin);
	});
}

/**
 * Gets the task status configuration from the plugin settings
 * @param plugin The plugin instance
 * @returns Object containing the task cycle and marks
 */
function getTaskStatusConfig(plugin: TaskProgressBarPlugin) {
	return {
		cycle: plugin.settings.taskStatusCycle,
		excludeMarksFromCycle: plugin.settings.excludeMarksFromCycle || [],
		marks: plugin.settings.taskStatusMarks,
	};
}

/**
 * Checks if a replacement operation is a valid task marker replacement
 * @param tr The transaction containing selection and change information
 * @param fromA Start position of the replacement
 * @param toA End position of the replacement
 * @param insertedText The text being inserted
 * @param originalText The text being replaced
 * @param pos The position in the new document
 * @param newLineText The full line text after the change
 * @param plugin The plugin instance for accessing settings
 * @returns true if this is a valid task marker replacement, false otherwise
 */
function isValidTaskMarkerReplacement(
	tr: Transaction,
	fromA: number,
	toA: number,
	insertedText: string,
	originalText: string,
	pos: number,
	newLineText: string,
	plugin: TaskProgressBarPlugin
): boolean {
	// Only single character replacements are considered valid task marker operations
	if (toA - fromA !== 1 || insertedText.length !== 1) {
		return false;
	}

	// Check if user actively selected text before replacement
	const startSelection = tr.startState.selection.main;
	const hasUserSelection = startSelection && !startSelection.empty;

	// If user had a selection that covers the replacement range, this is intentional replacement
	if (hasUserSelection && startSelection && fromA >= startSelection.from && toA <= startSelection.to) {
		console.log(
			`User selection detected (${startSelection.from}-${startSelection.to}) covering replacement range (${fromA}-${toA}). Skipping automatic cycling as this is user-intended replacement.`
		);
		return false;
	}

	// Get valid task status marks from plugin settings
	const {marks} = getTaskStatusConfig(plugin);
	const validMarks = Object.values(marks);

	// Check if both the original and inserted characters are valid task status marks
	const isOriginalValidMark = validMarks.includes(originalText) || originalText === ' ';
	const isInsertedValidMark = validMarks.includes(insertedText) || insertedText === ' ';

	// If either character is not a valid task mark, this is likely manual input
	if (!isOriginalValidMark || !isInsertedValidMark) {
		return false;
	}

	// Check if the replacement position is at a task marker location
	const taskRegex = /^[\s|\t]*([-*+]|\d+\.)\s+\[(.)]/;
	const match = newLineText.match(taskRegex);

	if (!match) {
		return false;
	}

	// Log successful validation for debugging
	console.log(
		`Valid task marker replacement detected. No user selection or selection doesn't cover replacement range. Original: '${originalText}' -> New: '${insertedText}' at position ${fromA}-${toA}`
	);

	return true;
}

/**
 * Finds a task status change event in the transaction
 * @param tr The transaction to check
 * @param tasksPluginLoaded Whether the Obsidian Tasks plugin is loaded
 * @param plugin The plugin instance (optional for backwards compatibility)
 * @returns Information about all changed task statuses or empty array if no status was changed
 */
export function findTaskStatusChanges(
	tr: Transaction,
	tasksPluginLoaded: boolean,
	plugin?: TaskProgressBarPlugin
): {
	position: number;
	currentMark: string;
	wasCompleteTask: boolean;
	tasksInfo: {
		isTaskChange: boolean;
		originalFromA: number;
		originalToA: number;
		originalFromB: number;
		originalToB: number;
		originalInsertedText: string;
	} | null;
}[] {
	const taskChanges: {
		position: number;
		currentMark: string;
		wasCompleteTask: boolean;
		tasksInfo: {
			isTaskChange: boolean;
			originalFromA: number;
			originalToA: number;
			originalFromB: number;
			originalToB: number;
			originalInsertedText: string;
		} | null;
	}[] = [];

	// Check if this is a multi-line indentation change (increase or decrease)
	// If so, return empty array
	let isMultiLineIndentationChange = false;
	if (tr.changes.length > 1) {
		const changes: {
			fromA: number;
			toA: number;
			fromB: number;
			toB: number;
			text: string;
		}[] = [];
		tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
			changes.push({
				fromA,
				toA,
				fromB,
				toB,
				text: inserted.toString(),
			});
		});

		// Check if all changes are on different lines and are just indentation changes
		if (changes.length > 1) {
			const allIndentChanges = changes.every(
				(change) =>
					change.text === "\t" ||
					change.text === "    " ||
					(change.text === "" &&
						(tr.startState.doc.sliceString(
								change.fromA,
								change.toA
							) === "\t" ||
							tr.startState.doc.sliceString(
								change.fromA,
								change.toA
							) === "    "))
			);

			if (allIndentChanges) {
				isMultiLineIndentationChange = true;
			}
		}
	}

	if (isMultiLineIndentationChange) {
		return [];
	}

	// Check for deletion operations that might affect line content
	// like deleting a dash character at the beginning of a task line
	let isDeletingTaskMarker = false;
	tr.changes.iterChanges(
		(
			fromA: number,
			toA: number,
			fromB: number,
			toB: number,
			inserted: Text
		) => {
			// Check for deletion operation (inserted text is empty)
			if (inserted.toString() === "" && toA > fromA) {
				// Get the deleted content
				const deletedContent = tr.startState.doc.sliceString(
					fromA,
					toA
				);
				// Check if the deleted content is a dash character
				if (deletedContent === "-") {
					// Check if the dash is at the beginning of a line or after indentation
					const line = tr.startState.doc.lineAt(fromA);
					const textBeforeDash = line.text.substring(
						0,
						fromA - line.from
					);
					if (textBeforeDash.trim() === "") {
						isDeletingTaskMarker = true;
					}
				}
			}
		}
	);

	if (isDeletingTaskMarker) {
		return [];
	}

	// Check each change in the transaction
	tr.changes.iterChanges(
		(
			fromA: number,
			toA: number,
			fromB: number,
			toB: number,
			inserted: Text
		) => {
			// Get the inserted text
			const insertedText = inserted.toString();

			// Check if this is a new task creation with a newline
			if (insertedText.includes("\n")) {
				console.log(
					"New task creation detected with newline, skipping"
				);
				return;
			}

			if (insertedText.includes("[[") || insertedText.includes("]]")) {
				console.log("Link detected, skipping");
				return;
			}

			if (fromB > tr.startState.doc.length) {
				return;
			}

			// Get the position context
			const pos = fromB;
			const originalLine = tr.startState.doc.lineAt(pos);
			const originalLineText = originalLine.text;

			if (originalLineText.trim() === "") {
				return;
			}

			const newLine = tr.newDoc.lineAt(pos);
			const newLineText = newLine.text;

			// Check if this line contains a task
			const taskRegex = /^[\s|\t]*([-*+]|\d+\.)\s+\[(.)]/;
			const match = originalLineText.match(taskRegex);
			const newMatch = newLineText.match(taskRegex);

			// Handle pasted task content
			if (newMatch && !match && insertedText === newLineText) {
				const markIndex = newLineText.indexOf("[") + 1;
				const changedPosition = newLine.from + markIndex;
				const currentMark = newMatch[2];

				taskChanges.push({
					position: changedPosition,
					currentMark: currentMark,
					wasCompleteTask: true,
					tasksInfo: {
						isTaskChange: true,
						originalFromA: fromA,
						originalToA: toA,
						originalFromB: fromB,
						originalToB: toB,
						originalInsertedText: insertedText,
					},
				});
				return;
			}

			if (match) {
				let changedPosition: number | null = null;
				let currentMark: string | null = null;
				let wasCompleteTask = false;
				let isTaskChange = false;
				let triggerByTasks = false;
				// Case 1: Complete task inserted at once (e.g., "- [x]")
				if (
					insertedText
						.trim()
						.match(/^(?:[\s|\t]*(?:[-*+]|\d+\.)\s+\[.(?:\])?)/)
				) {
					// Get the mark position in the line
					const markIndex = newLineText.indexOf("[") + 1;
					changedPosition = newLine.from + markIndex;

					currentMark = match[2];
					wasCompleteTask = true;
					isTaskChange = true;
				}
				// Case 2: Just the mark character was inserted
				else if (insertedText.length === 1) {
					// Check if our insertion point is at the mark position
					const markIndex = newLineText.indexOf("[") + 1;
					// Don't trigger when typing the "[" character itself, only when editing the status mark within brackets
					if (
						pos === newLine.from + markIndex &&
						insertedText !== "["
					) {
						// Check if this is a replacement operation and validate if it's a valid task marker replacement
						if (fromA !== toA) {
							const originalText = tr.startState.doc.sliceString(fromA, toA);

							// Only perform validation if plugin is provided
							if (plugin) {
								const isValidReplacement = isValidTaskMarkerReplacement(
									tr,
									fromA,
									toA,
									insertedText,
									originalText,
									pos,
									newLineText,
									plugin
								);

								if (!isValidReplacement) {
									console.log(
										`Detected invalid task marker replacement (fromA=${fromA}, toA=${toA}). User manually input '${insertedText}' (original: '${originalText}'), skipping automatic cycling.`
									);
									return; // Skip this change, don't add to taskChanges
								}

								console.log(
									`Detected valid task marker replacement (fromA=${fromA}, toA=${toA}). Original: '${originalText}' -> New: '${insertedText}', proceeding with automatic cycling.`
								);
							} else {
								// Fallback to original logic for backwards compatibility
								console.log(
									`Detected replacement operation (fromA=${fromA}, toA=${toA}). User manually input '${insertedText}', skipping automatic cycling.`
								);
								return; // Skip this change, don't add to taskChanges
							}
						}

						changedPosition = pos;

						currentMark = match[2];
						wasCompleteTask = true;
						isTaskChange = true;
					}
				}
				// Case 3: Multiple characters including a mark were inserted
				else if (
					insertedText.indexOf("[") !== -1 &&
					insertedText.indexOf("]") !== -1 &&
					insertedText !== "[]"
				) {
					// Handle cases where part of a task including the mark was inserted
					const markIndex = newLineText.indexOf("[") + 1;
					changedPosition = newLine.from + markIndex;

					currentMark = match[2];
					wasCompleteTask = true;
					isTaskChange = true;
				}

				if (
					tasksPluginLoaded &&
					newLineText === insertedText &&
					(insertedText.includes("✅") ||
						insertedText.includes("❌") ||
						insertedText.includes("🛫") ||
						insertedText.includes("📅") ||
						originalLineText.includes("✅") ||
						originalLineText.includes("❌") ||
						originalLineText.includes("🛫") ||
						originalLineText.includes("📅"))
				) {
					triggerByTasks = true;
				}

				if (
					changedPosition !== null &&
					currentMark !== null &&
					isTaskChange
				) {
					// If we found a task change, add it to our list
					taskChanges.push({
						position: changedPosition,
						currentMark: currentMark,
						wasCompleteTask: wasCompleteTask,
						tasksInfo: triggerByTasks
							? {
								isTaskChange: triggerByTasks,
								originalFromA: fromA,
								originalToA: toA,
								originalFromB: fromB,
								originalToB: toB,
								originalInsertedText: insertedText,
							}
							: null,
					});
				}
			}
		}
	);

	return taskChanges;
}

/**
 * Handles transactions to detect task status changes and cycle through available statuses
 * @param tr The transaction to handle
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @returns The original transaction or a modified transaction
 */
export function handleCycleCompleteStatusTransaction(
	tr: Transaction,
	app: App,
	plugin: TaskProgressBarPlugin
): TransactionSpec {
	// Only process transactions that change the document and are user input events
	if (!tr.docChanged) {
		return tr;
	}

	if (
		tr.annotation(taskStatusChangeAnnotation) ||
		tr.annotation(priorityChangeAnnotation)
	) {
		return tr;
	}

	if (tr.isUserEvent("set") && tr.changes.length > 1) {
		return tr;
	}

	if (tr.isUserEvent("input.paste")) {
		return tr;
	}

	console.log(tr.changes, "changes");

	// Check for markdown link insertion (cmd+k)
	if (tr.isUserEvent("input.autocomplete")) {
		// Look for typical markdown link pattern [text]() in the changes
		let isMarkdownLinkInsertion = false;
		tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
			const insertedText = inserted.toString();
			// Check if the insertedText matches a markdown link pattern
			if (
				insertedText.includes("](") &&
				insertedText.startsWith("[") &&
				insertedText.endsWith(")")
			) {
				isMarkdownLinkInsertion = true;
			}
		});

		if (isMarkdownLinkInsertion) {
			return tr;
		}
	}

	// Check for suspicious transaction that might be a task deletion
	// For example, when user presses backspace to delete a dash at the beginning of a task line
	let hasInvalidTaskChange = false;
	tr.changes.iterChanges(
		(
			fromA: number,
			toA: number,
			fromB: number,
			toB: number,
			inserted: Text
		) => {
			// Check if this removes a dash character and somehow modifies a task marker elsewhere
			const insertedText = inserted.toString();
			const deletedText = tr.startState.doc.sliceString(fromA, toA);
			// Dash deletion but position change indicates task marker modification
			if (
				deletedText === "-" &&
				insertedText === "" &&
				(fromB !== fromA || toB !== toA) &&
				tr.newDoc
					.sliceString(
						Math.max(0, fromB - 5),
						Math.min(fromB + 5, tr.newDoc.length)
					)
					.includes("[")
			) {
				hasInvalidTaskChange = true;
			}
		}
	);

	if (hasInvalidTaskChange) {
		return tr;
	}

	// Check if any task statuses were changed in this transaction
	const taskStatusChanges = findTaskStatusChanges(tr, !!getTasksAPI(plugin), plugin);
	if (taskStatusChanges.length === 0) {
		return tr;
	}

	// Get the task cycle and marks from plugin settings
	const {cycle, marks, excludeMarksFromCycle} = getTaskStatusConfig(plugin);
	const remainingCycle = cycle.filter(
		(state) => !excludeMarksFromCycle.includes(state)
	);

	// If no cycle is defined, don't do anything
	if (remainingCycle.length === 0) {
		return tr;
	}

	// Additional check: if the transaction changes a task's status while also deleting content elsewhere
	// it might be an invalid operation caused by backspace key
	let hasTaskAndDeletion = false;
	if (tr.changes.length > 1) {
		const changes: {
			fromA: number;
			toA: number;
			fromB: number;
			toB: number;
			text: string;
		}[] = [];
		tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
			changes.push({
				fromA,
				toA,
				fromB,
				toB,
				text: inserted.toString(),
			});
		});

		// Check for deletions and task changes in the same transaction
		const hasDeletion = changes.some(
			(change) => change.text === "" && change.toA > change.fromA
		);
		const hasTaskMarkerChange = changes.some((change) => {
			// Check if this change affects a task marker position [x]
			const pos = change.fromB;
			try {
				const line = tr.newDoc.lineAt(pos);
				return line.text.includes("[") && line.text.includes("]");
			} catch (e) {
				return false;
			}
		});

		if (hasDeletion && hasTaskMarkerChange) {
			hasTaskAndDeletion = true;
		}
	}

	if (hasTaskAndDeletion) {
		return tr;
	}

	// Check if the transaction is just indentation or unindentation
	let isIndentationChange = false;
	tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
		// Check if from the start of a line
		const isLineStart =
			fromA === 0 ||
			tr.startState.doc.sliceString(fromA - 1, fromA) === "\n";

		if (isLineStart) {
			const originalLine = tr.startState.doc.lineAt(fromA).text;
			const newLine = inserted.toString();

			// Check for indentation (adding spaces/tabs at beginning)
			if (
				newLine.trim() === originalLine.trim() &&
				newLine.length > originalLine.length
			) {
				isIndentationChange = true;
			}

			// Check for unindentation (removing spaces/tabs from beginning)
			if (
				originalLine.trim() === newLine.trim() &&
				originalLine.length > newLine.length
			) {
				isIndentationChange = true;
			}
		}
	});

	if (isIndentationChange) {
		return tr;
	}

	// Check if the transaction is just deleting a line after a task
	// or replacing the entire content with the exact same line
	let isLineDeleteOrReplace = false;
	tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
		const deletedText = tr.startState.doc.sliceString(fromA, toA);
		const insertedText = inserted.toString();
		const taskMarkerPattern = /(?:-|\*|\+|\d+\.)\s\[.\]/;

		// Check if deleting a line that contains a newline
		if (deletedText.includes("\n") && !insertedText.includes("\n")) {
			// If we're replacing with a task line (with any status marker), this is a line deletion

			if (
				taskMarkerPattern.test(insertedText) &&
				taskMarkerPattern.test(deletedText)
			) {
				// Check if we're just keeping the task line but deleting what comes after
				const taskLine = insertedText.trim();
				if (deletedText.includes(taskLine)) {
					isLineDeleteOrReplace = true;
				}
			}
		}

		// Check if we're replacing the entire content with a full line that includes task markers
		if (
			fromA === 0 &&
			toA === tr.startState.doc.length &&
			taskMarkerPattern.test(insertedText) &&
			!insertedText.includes("\n")
		) {
			isLineDeleteOrReplace = true;
		}
	});

	if (isLineDeleteOrReplace) {
		return tr;
	}

	// Build a new list of changes to replace the original ones
	const newChanges = [];
	let completingTask = false;

	// Process each task status change
	for (const taskStatusInfo of taskStatusChanges) {
		const {position, currentMark, wasCompleteTask, tasksInfo} =
			taskStatusInfo;

		if (tasksInfo?.isTaskChange) {
			console.log(tasksInfo);
			continue;
		}

		// Find the current status in the cycle
		let currentStatusIndex = -1;
		for (let i = 0; i < remainingCycle.length; i++) {
			const state = remainingCycle[i];
			if (marks[state] === currentMark) {
				currentStatusIndex = i;
				break;
			}
		}

		// If we couldn't find the current status in the cycle, start from the first one
		if (currentStatusIndex === -1) {
			currentStatusIndex = 0;
		}

		// Calculate the next status
		const nextStatusIndex =
			(currentStatusIndex + 1) % remainingCycle.length;
		const nextStatus = remainingCycle[nextStatusIndex];
		const nextMark = marks[nextStatus] || " ";

		// Check if the current mark is the same as what would be the next mark in the cycle
		// If they are the same, we don't need to process this further
		if (currentMark === nextMark) {
			console.log(
				`Current mark '${currentMark}' is already the next mark in the cycle. Skipping processing.`
			);
			continue;
		}

		// NEW: Check if user's input already matches the next mark in the cycle
		// Get the user's input from the transaction
		let userInputMark: string | null = null;
		tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
			const insertedText = inserted.toString();
			// Check if this change is at the task marker position
			if (fromB === position && insertedText.length === 1) {
				userInputMark = insertedText;
			}
		});

		// If user's input already matches the next mark, don't cycle
		if (userInputMark === nextMark) {
			console.log(
				`User input '${userInputMark}' already matches the next mark '${nextMark}' in the cycle. Skipping processing.`
			);
			continue;
		}

		// Get line context for the current position to check task type
		const posLine = tr.newDoc.lineAt(position);
		const newLineText = posLine.text;
		const originalPosLine = tr.startState.doc.lineAt(
			Math.min(position, tr.startState.doc.length)
		);
		const originalLineText = originalPosLine.text;

		// For newly inserted complete tasks, check if the mark matches the first status
		// If so, we may choose to leave it as is rather than immediately cycling it
		if (wasCompleteTask) {
			// Find the corresponding status for this mark
			for (const [_, mark] of Object.entries(marks)) {
				if (mark === currentMark) {
					break;
				}
			}

			// Check if this is a brand new task insertion with "[ ]" (space) mark
			const isNewEmptyTask =
				currentMark === " " &&
				// Verify the original content contains the full task marker with "[ ]"
				(tasksInfo?.originalInsertedText?.includes("[ ]") ||
					// Or check if the line now contains a task marker that wasn't there before
					(newLineText.includes("[ ]") &&
						!originalLineText.includes("[ ]")));

			// Additional check for when a user is specifically creating a task with [ ]
			const isManualTaskCreation =
				currentMark === " " &&
				// Check if the insertion includes the full task syntax
				((insertedText) => {
					// Look for common patterns of task creation
					return (
						insertedText?.includes("- [ ]") ||
						insertedText?.includes("* [ ]") ||
						insertedText?.includes("+ [ ]") ||
						/^\d+\.\s+\[\s\]/.test(insertedText || "")
					);
				})(tasksInfo?.originalInsertedText);

			// Don't cycle newly created empty tasks, even if alwaysCycleNewTasks is true
			// This prevents unexpected data loss when creating a task
			if (isNewEmptyTask || isManualTaskCreation) {
				console.log(
					`New empty task detected with mark ' ', leaving as is regardless of alwaysCycleNewTasks setting`
				);
				continue;
			}

			// If the mark is valid and this is a complete task insertion,
			// don't cycle it immediately - we've removed alwaysCycleNewTasks entirely
		}

		// Find the exact position to place the mark
		const markPosition = position;

		// Get the line information to ensure we don't go beyond the current line
		const lineAtMark = tr.newDoc.lineAt(markPosition);
		const lineEnd = lineAtMark.to;

		// Check if the mark position is within the current line and valid
		if (markPosition < lineAtMark.from || markPosition >= lineEnd) {
			console.log(
				`Mark position ${markPosition} is beyond the current line range ${lineAtMark.from}-${lineEnd}, skipping processing`
			);
			continue;
		}

		// Ensure the modification range doesn't exceed the current line
		const validTo = Math.min(markPosition + 1, lineEnd);
		if (validTo <= markPosition) {
			console.log(
				`Invalid modification range ${markPosition}-${validTo}, skipping processing`
			);
			continue;
		}

		if (nextMark === "x" || nextMark === "X") {
			completingTask = true;
		}

		// If nextMark is 'x', 'X', or space and we have Tasks plugin info, use the original insertion
		if (
			(nextMark === "x" || nextMark === "X" || nextMark === " ") &&
			tasksInfo !== null
		) {
			// Verify if the Tasks plugin's modification range is within the same line
			const origLineAtFromA = tr.startState.doc.lineAt(
				tasksInfo.originalFromA
			);
			const origLineAtToA = tr.startState.doc.lineAt(
				Math.min(tasksInfo.originalToA, tr.startState.doc.length)
			);

			if (origLineAtFromA.number !== origLineAtToA.number) {
				console.log(
					`Tasks plugin modification range spans multiple lines ${origLineAtFromA.number}-${origLineAtToA.number}, using safe modification range`
				);
				// Use the safe modification range
				newChanges.push({
					from: markPosition,
					to: validTo,
					insert: nextMark,
				});
			} else {
				// Use the original insertion from Tasks plugin
				newChanges.push({
					from: tasksInfo.originalFromA,
					to: tasksInfo.originalToA,
					insert: tasksInfo.originalInsertedText,
				});
			}
		} else {
			// Add a change to replace the current mark with the next one
			newChanges.push({
				from: markPosition,
				to: validTo,
				insert: nextMark,
			});
		}
	}

	// If we found any changes to make, create a new transaction
	if (newChanges.length > 0) {
		const editorInfo = tr.startState.field(editorInfoField);
		const change = newChanges[0];
		const line = tr.newDoc.lineAt(change.from);
		const task = parseTaskLine(
			editorInfo?.file?.path || "",
			line.text,
			line.number,
			plugin.settings.preferMetadataFormat,
			plugin // Pass plugin for configurable prefix support
		);
		// if (completingTask && task) {
		// 	app.workspace.trigger("task-genius:task-completed", task);
		// }
		return {
			changes: newChanges,
			selection: tr.selection,
			annotations: taskStatusChangeAnnotation.of("taskStatusChange"),
		};
	}

	// If no changes were made, return the original transaction
	return tr;
}

export { taskStatusChangeAnnotation };
export { priorityChangeAnnotation };
