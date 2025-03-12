import { App } from "obsidian";
import {
	EditorState,
	Text,
	Transaction,
	TransactionSpec,
} from "@codemirror/state";
import TaskProgressBarPlugin from "./taskProgressBarIndex";
import { taskStatusChangeAnnotation } from "./taskStatusSwitcher";

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
		marks: plugin.settings.taskStatusMarks,
	};
}

/**
 * Finds a task status change event in the transaction
 * @param tr The transaction to check
 * @returns Information about all changed task statuses or empty array if no status was changed
 */
function findTaskStatusChanges(tr: Transaction): {
	position: number;
	currentMark: string;
	wasCompleteTask: boolean;
}[] {
	const taskChanges: {
		position: number;
		currentMark: string;
		wasCompleteTask: boolean;
	}[] = [];

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

			// Debug log
			console.log("Inserted text:", JSON.stringify(insertedText));

			// Get the position context
			const pos = fromB;
			const originalLine = tr.startState.doc.lineAt(pos);
			const originalLineText = originalLine.text;
			const newLine = tr.newDoc.lineAt(pos);
			const newLineText = newLine.text;

			// Check if this line contains a task
			const taskRegex = /^[\s|\t]*([-*+]|\d+\.)\s\[(.)]/;
			const match = originalLineText.match(taskRegex);

			if (match) {
				console.log("Found task match:", match);
				let changedPosition: number | null = null;
				let currentMark: string | null = null;
				let wasCompleteTask = false;
				let isTaskChange = false;

				// Case 1: Complete task inserted at once (e.g., "- [x]")
				if (
					insertedText
						.trim()
						.match(/^(?:[\s|\t]*(?:[-*+]|\d+\.)\s\[.(?:\])?)/)
				) {
					// Get the mark position in the line
					const markIndex = newLineText.indexOf("[") + 1;
					changedPosition = newLine.from + markIndex;
					console.log("changedPosition", changedPosition);
					currentMark = match[2];
					wasCompleteTask = true;
					isTaskChange = true;
				}
				// Case 2: Just the mark character was inserted
				else if (insertedText.length === 1) {
					// Check if our insertion point is at the mark position
					const markIndex = newLineText.indexOf("[") + 1;
					if (pos === newLine.from + markIndex) {
						changedPosition = pos;
						console.log("changedPosition", changedPosition);
						currentMark = match[2];
						wasCompleteTask = true;
						isTaskChange = true;
					}
				}
				// Case 3: Multiple characters including a mark were inserted
				else if (
					insertedText.indexOf("[") !== -1 &&
					insertedText.indexOf("]") !== -1
				) {
					// Handle cases where part of a task including the mark was inserted
					const markIndex = newLineText.indexOf("[") + 1;
					changedPosition = newLine.from + markIndex;
					console.log("changedPosition", changedPosition);
					currentMark = match[2];
					wasCompleteTask = true;
					isTaskChange = true;
				}

				// If we found a task change, add it to our list
				if (
					changedPosition !== null &&
					currentMark !== null &&
					isTaskChange
				) {
					taskChanges.push({
						position: changedPosition,
						currentMark: currentMark,
						wasCompleteTask: wasCompleteTask,
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

	if (tr.annotation(taskStatusChangeAnnotation)) {
		return tr;
	}

	// Check if any task statuses were changed in this transaction
	const taskStatusChanges = findTaskStatusChanges(tr);
	if (taskStatusChanges.length === 0) {
		return tr;
	}

	// Get the task cycle and marks from plugin settings
	const { cycle, marks } = getTaskStatusConfig(plugin);

	console.log(cycle, marks);

	// If no cycle is defined, don't do anything
	if (cycle.length === 0) {
		return tr;
	}

	// Log for debugging
	console.log("Task status changes:", taskStatusChanges);
	console.log("Task cycle:", cycle);
	console.log("Task marks:", marks);

	// Build a new list of changes to replace the original ones
	const newChanges = [];

	// Process each task status change
	for (const taskStatusInfo of taskStatusChanges) {
		const { position, currentMark, wasCompleteTask } = taskStatusInfo;

		// Find the current status in the cycle
		let currentStatusIndex = -1;
		for (let i = 0; i < cycle.length; i++) {
			const state = cycle[i];
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
		const nextStatusIndex = (currentStatusIndex + 1) % cycle.length;
		const nextStatus = cycle[nextStatusIndex];
		const nextMark = marks[nextStatus] || " ";

		console.log("nextStatus", nextStatus, "nextMark", nextMark);

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

		console.log("markPosition", markPosition, "nextMark", nextMark);

		// Add a change to replace the current mark with the next one
		newChanges.push({
			from: markPosition,
			to: markPosition + 1,
			insert: nextMark,
		});
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
