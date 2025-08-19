import { EditorView } from "@codemirror/view";
import { Extension, Transaction } from "@codemirror/state";
import { clearAllMarks } from "../../components/MarkdownRenderer";

/**
 * Extension to handle cleanup of task marks when text is selected and deleted
 * This ensures that when users select text containing task metadata (like priority marks)
 * and delete it, the marks are properly cleaned up
 */
export function taskMarkCleanupExtension(): Extension {
	return EditorView.updateListener.of((update) => {
		// Only process transactions that have changes
		if (!update.docChanged) return;

		// Check if this is a user deletion operation
		const tr = update.transactions[0];
		if (!tr || !isUserDeletion(tr)) return;

		// Process each change to see if we need to clean up marks
		tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
			// Only handle deletions (where text was removed)
			if (fromA >= toA) return;

			const deletedText = tr.startState.doc.sliceString(fromA, toA);
			const insertedText = inserted.toString();

			// Check if the deleted text contains task marks
			if (containsTaskMarks(deletedText)) {
				// Get the line containing the change
				const line = update.state.doc.lineAt(fromB);
				const lineText = line.text;

				// Check if this is a task line
				if (isTaskLine(lineText)) {
					// Clean the line of any orphaned marks
					const cleanedLine = cleanOrphanedMarks(lineText);
					
					if (cleanedLine !== lineText) {
						// Apply the cleanup
						update.view.dispatch({
							changes: {
								from: line.from,
								to: line.to,
								insert: cleanedLine
							}
						});
					}
				}
			}
		});
	});
}

/**
 * Check if a transaction represents a user deletion operation
 */
function isUserDeletion(tr: Transaction): boolean {
	// Check if this is a user input event
	if (!tr.isUserEvent("input.delete") && !tr.isUserEvent("input.deleteBackward")) {
		return false;
	}

	// Check if there are actual deletions
	let hasDeletions = false;
	tr.changes.iterChanges((fromA, toA) => {
		if (fromA < toA) {
			hasDeletions = true;
		}
	});

	return hasDeletions;
}

/**
 * Check if text contains task marks that might need cleanup
 */
function containsTaskMarks(text: string): boolean {
	// Check for priority marks
	const priorityRegex = /(?:🔺|⏫|🔼|🔽|⏬️|\[#[A-C]\]|!)/;
	if (priorityRegex.test(text)) return true;

	// Check for date marks
	const dateRegex = /(?:📅|🛫|⏳|✅|➕|❌)/;
	if (dateRegex.test(text)) return true;

	// Check for other metadata marks
	const metadataRegex = /(?:🆔|⛔|🏁|🔁|@|#)/;
	if (metadataRegex.test(text)) return true;

	return false;
}

/**
 * Check if a line is a task line
 */
function isTaskLine(line: string): boolean {
	const taskRegex = /^\s*[-*+]\s*\[[^\]]*\]/;
	return taskRegex.test(line);
}

/**
 * Clean orphaned marks from a task line
 * This removes marks that are no longer properly associated with content
 */
function cleanOrphanedMarks(line: string): string {
	// First, extract the task marker part
	const taskMarkerMatch = line.match(/^(\s*[-*+]\s*\[[^\]]*\]\s*)/);
	if (!taskMarkerMatch) return line;

	const taskMarker = taskMarkerMatch[1];
	const content = line.substring(taskMarker.length);

	// Use the existing clearAllMarks function to clean the content
	const cleanedContent = clearAllMarks(content);

	// If the content is now empty or just whitespace, remove orphaned marks
	if (!cleanedContent.trim()) {
		// Remove any trailing marks that are now orphaned
		const cleanedLine = taskMarker.trim();
		return cleanedLine;
	}

	// Reconstruct the line with cleaned content
	return taskMarker + cleanedContent;
}

/**
 * Check if marks in the line are orphaned (not properly associated with content)
 */
function hasOrphanedMarks(line: string): boolean {
	// Extract content after task marker
	const taskMarkerMatch = line.match(/^\s*[-*+]\s*\[[^\]]*\]\s*(.*)/);
	if (!taskMarkerMatch) return false;

	const content = taskMarkerMatch[1];
	
	// Check if there are marks but no meaningful content
	const hasMarks = containsTaskMarks(content);
	const hasContent = content.replace(/[🔺⏫🔼🔽⏬️📅🛫⏳✅➕❌🆔⛔🏁🔁@#!\[\]]/g, '').trim().length > 0;

	return hasMarks && !hasContent;
}
