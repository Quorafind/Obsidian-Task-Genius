import { App } from "obsidian";
import {
	EditorState,
	Text,
	Transaction,
	TransactionSpec,
} from "@codemirror/state";
import TaskProgressBarPlugin from "..";
import { taskStatusChangeAnnotation } from "./taskStatusSwitcher";
import { getTasksAPI } from "../utils";
import { priorityChangeAnnotation } from "./priorityPicker";

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
 * Finds a task status change event in the transaction
 * @param tr The transaction to check
 * @returns Information about all changed task statuses or empty array if no status was changed
 */
function findTaskStatusChanges(
	tr: Transaction,
	tasksPluginLoaded: boolean
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
						insertedText.includes("📅"))
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

	// Check if any task statuses were changed in this transaction
	const taskStatusChanges = findTaskStatusChanges(tr, !!getTasksAPI(plugin));
	if (taskStatusChanges.length === 0) {
		return tr;
	}

	// Get the task cycle and marks from plugin settings
	const { cycle, marks, excludeMarksFromCycle } = getTaskStatusConfig(plugin);
	const remainingCycle = cycle.filter(
		(state) => !excludeMarksFromCycle.includes(state)
	);

	// If no cycle is defined, don't do anything
	if (remainingCycle.length === 0) {
		return tr;
	}

	// Log for debugging

	// Build a new list of changes to replace the original ones
	const newChanges = [];

	// Process each task status change
	for (const taskStatusInfo of taskStatusChanges) {
		const { position, currentMark, wasCompleteTask, tasksInfo } =
			taskStatusInfo;

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

		// For newly inserted complete tasks, check if the mark matches the first status
		// If so, we may choose to leave it as is rather than immediately cycling it
		if (wasCompleteTask) {
			// Find the corresponding status for this mark
			let foundStatus = null;
			for (const [status, mark] of Object.entries(marks)) {
				if (mark === currentMark) {
					foundStatus = status;
					break;
				}
			}

			// If the mark is valid and this is a complete task insertion,
			// don't cycle it immediately
			if (foundStatus && !plugin.settings.alwaysCycleNewTasks) {
				console.log(
					`Complete task with valid mark '${currentMark}' inserted, leaving as is`
				);
				continue;
			}
		}

		// Find the exact position to place the mark
		const markPosition = position;

		// If nextMark is 'x', 'X', or space and we have Tasks plugin info, use the original insertion
		if (
			(nextMark === "x" || nextMark === "X" || nextMark === " ") &&
			tasksInfo !== null
		) {
			// Use the original insertion from Tasks plugin
			newChanges.push({
				from: tasksInfo.originalFromA,
				to: tasksInfo.originalToA,
				insert: tasksInfo.originalInsertedText,
			});
		} else {
			// Add a change to replace the current mark with the next one
			newChanges.push({
				from: markPosition,
				to: markPosition + 1,
				insert: nextMark,
			});
		}
	}

	// If we found any changes to make, create a new transaction
	if (newChanges.length > 0) {
		return {
			changes: newChanges,
			selection: tr.selection,
			annotations: taskStatusChangeAnnotation.of("taskStatusChange"),
		};
	}

	// If no changes were made, return the original transaction
	return tr;
}
