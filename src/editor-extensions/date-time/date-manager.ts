import { App } from "obsidian";
import {
	EditorState,
	Text,
	Transaction,
	TransactionSpec,
} from "@codemirror/state";
import TaskProgressBarPlugin from "../../index";
import { taskStatusChangeAnnotation } from "../task-operations/status-switcher";

/**
 * Creates an editor extension that automatically manages dates based on task status changes
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @returns An editor extension that can be registered with the plugin
 */
export function autoDateManagerExtension(
	app: App,
	plugin: TaskProgressBarPlugin
) {
	return EditorState.transactionFilter.of((tr) => {
		return handleAutoDateManagerTransaction(tr, app, plugin);
	});
}

/**
 * Handles transactions to detect task status changes and manage dates accordingly
 * @param tr The transaction to handle
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @returns The original transaction or a modified transaction
 */
function handleAutoDateManagerTransaction(
	tr: Transaction,
	app: App,
	plugin: TaskProgressBarPlugin
): TransactionSpec {
	// Only process transactions that change the document
	if (!tr.docChanged) {
		return tr;
	}

	// Skip if auto date management is disabled
	if (!plugin.settings.autoDateManager?.enabled) {
		return tr;
	}

	// Skip if this transaction was triggered by auto date management itself
	const annotationValue = tr.annotation(taskStatusChangeAnnotation);
	if (
		typeof annotationValue === "string" &&
		annotationValue.includes("autoDateManager")
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

	const { doc, lineNumber, oldStatus, newStatus } = taskStatusChangeInfo;

	// Determine what date operations need to be performed
	const dateOperations = determineDateOperations(
		oldStatus,
		newStatus,
		plugin,
		doc.line(lineNumber).text
	);

	if (dateOperations.length === 0) {
		return tr;
	}

	// Apply date operations to the task line
	return applyDateOperations(tr, doc, lineNumber, dateOperations, plugin);
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
	oldStatus: string;
	newStatus: string;
} | null {
	let taskChangedInfo: {
		doc: Text;
		lineNumber: number;
		oldStatus: string;
		newStatus: string;
	} | null = null;

	// Check each change in the transaction
	tr.changes.iterChanges(
		(
			fromA: number,
			toA: number,
			fromB: number,
			toB: number,
			inserted: Text
		) => {
			// Only process actual insertions that contain task markers
			if (inserted.length === 0) {
				return;
			}

			// Get the position context
			const pos = fromB;
			const newLine = tr.newDoc.lineAt(pos);
			const newLineText = newLine.text;

			// Check if this line contains a task marker
			const taskRegex = /^[\s|\t]*([-*+]|\d+\.)\s\[(.)]/i;
			const newTaskMatch = newLineText.match(taskRegex);

			if (newTaskMatch) {
				const newStatus = newTaskMatch[2];
				let oldStatus = " ";

				// Try to find the corresponding old task status
				// First, check if there was a deletion in this transaction that might correspond
				let foundCorrespondingOldTask = false;

				tr.changes.iterChanges(
					(oldFromA, oldToA, oldFromB, oldToB, oldInserted) => {
						// Look for deletions that might correspond to this insertion
						if (oldFromA < oldToA && !foundCorrespondingOldTask) {
							try {
								const deletedText =
									tr.startState.doc.sliceString(
										oldFromA,
										oldToA
									);
								const deletedLines = deletedText.split("\n");

								for (const deletedLine of deletedLines) {
									const oldTaskMatch =
										deletedLine.match(taskRegex);
									if (oldTaskMatch) {
										// Compare the task content (without status) to see if it's the same task
										const newTaskContent = newLineText
											.replace(taskRegex, "")
											.trim();
										const oldTaskContent = deletedLine
											.replace(taskRegex, "")
											.trim();

										// If the content matches, this is likely the same task
										if (newTaskContent === oldTaskContent) {
											oldStatus = oldTaskMatch[2];
											foundCorrespondingOldTask = true;
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

				// If we couldn't find a corresponding old task, try the original method
				if (!foundCorrespondingOldTask) {
					try {
						// Check if the change is actually modifying the task status character
						const taskStatusStart = newLineText.indexOf("[") + 1;
						const taskStatusEnd = newLineText.indexOf("]");

						// Only proceed if the change affects the task status area
						if (
							fromB <= newLine.from + taskStatusEnd &&
							toB >= newLine.from + taskStatusStart
						) {
							const oldPos = fromA;
							if (
								oldPos >= 0 &&
								oldPos < tr.startState.doc.length
							) {
								const oldLine =
									tr.startState.doc.lineAt(oldPos);
								const oldTaskMatch =
									oldLine.text.match(taskRegex);
								if (oldTaskMatch) {
									oldStatus = oldTaskMatch[2];
									foundCorrespondingOldTask = true;
								}
							}
						}
					} catch (e) {
						// Line might not exist in old document
					}
				}

				// Only process if we found a corresponding old task and the status actually changed
				if (foundCorrespondingOldTask && oldStatus !== newStatus) {
					taskChangedInfo = {
						doc: tr.newDoc,
						lineNumber: newLine.number,
						oldStatus: oldStatus,
						newStatus: newStatus,
					};
				}
			}
		}
	);

	return taskChangedInfo;
}

/**
 * Determines what date operations need to be performed based on status change
 * @param oldStatus The old task status
 * @param newStatus The new task status
 * @param plugin The plugin instance
 * @param lineText The current line text to check for existing dates
 * @returns Array of date operations to perform
 */
function determineDateOperations(
	oldStatus: string,
	newStatus: string,
	plugin: TaskProgressBarPlugin,
	lineText: string
): DateOperation[] {
	const operations: DateOperation[] = [];
	const settings = plugin.settings.autoDateManager;

	if (!settings) return operations;

	const oldStatusType = getStatusType(oldStatus, plugin);
	const newStatusType = getStatusType(newStatus, plugin);

	// If status types are the same, no date operations needed
	if (oldStatusType === newStatusType) {
		return operations;
	}

	// Remove old status date if it exists and is managed (but never remove start date)
	if (settings.manageCompletedDate && oldStatusType === "completed") {
		operations.push({
			type: "remove",
			dateType: "completed",
		});
	}
	if (settings.manageCancelledDate && oldStatusType === "abandoned") {
		operations.push({
			type: "remove",
			dateType: "cancelled",
		});
	}

	// Add new status date if it should be managed and doesn't already exist
	if (settings.manageCompletedDate && newStatusType === "completed") {
		operations.push({
			type: "add",
			dateType: "completed",
			format: settings.completedDateFormat || "YYYY-MM-DD",
		});
	}
	if (settings.manageStartDate && newStatusType === "inProgress") {
		// Only add start date if it doesn't already exist
		if (!hasExistingDate(lineText, "start", plugin)) {
			operations.push({
				type: "add",
				dateType: "start",
				format: settings.startDateFormat || "YYYY-MM-DD",
			});
		}
	}
	if (settings.manageCancelledDate && newStatusType === "abandoned") {
		operations.push({
			type: "add",
			dateType: "cancelled",
			format: settings.cancelledDateFormat || "YYYY-MM-DD",
		});
	}

	return operations;
}

/**
 * Checks if a specific date type already exists in the line
 * @param lineText The task line text
 * @param dateType The type of date to check for
 * @param plugin The plugin instance
 * @returns True if the date already exists
 */
function hasExistingDate(
	lineText: string,
	dateType: string,
	plugin: TaskProgressBarPlugin
): boolean {
	const useDataviewFormat =
		plugin.settings.preferMetadataFormat === "dataview";

	if (useDataviewFormat) {
		const fieldName = dateType === "start" ? "start" : dateType;
		const pattern = new RegExp(
			`\\[${fieldName}::\\s*\\d{4}-\\d{2}-\\d{2}(?:\\s+\\d{2}:\\d{2}(?::\\d{2})?)?\\]`
		);
		return pattern.test(lineText);
	} else {
		const dateMarker = getDateMarker(dateType, plugin);
		const pattern = new RegExp(
			`${escapeRegex(
				dateMarker
			)}\\s*\\d{4}-\\d{2}-\\d{2}(?:\\s+\\d{2}:\\d{2}(?::\\d{2})?)?`
		);
		return pattern.test(lineText);
	}
}

/**
 * Gets the status type (completed, inProgress, etc.) for a given status character
 * @param status The status character
 * @param plugin The plugin instance
 * @returns The status type
 */
function getStatusType(status: string, plugin: TaskProgressBarPlugin): string {
	const taskStatuses = plugin.settings.taskStatuses;

	if (taskStatuses.completed.split("|").includes(status)) {
		return "completed";
	}
	if (taskStatuses.inProgress.split("|").includes(status)) {
		return "inProgress";
	}
	if (taskStatuses.abandoned.split("|").includes(status)) {
		return "abandoned";
	}
	if (taskStatuses.planned.split("|").includes(status)) {
		return "planned";
	}
	if (taskStatuses.notStarted.split("|").includes(status)) {
		return "notStarted";
	}

	return "unknown";
}

/**
 * Applies date operations to the task line
 * @param tr The transaction
 * @param doc The document
 * @param lineNumber The line number of the task
 * @param operations The date operations to perform
 * @param plugin The plugin instance
 * @returns The modified transaction
 */
function applyDateOperations(
	tr: Transaction,
	doc: Text,
	lineNumber: number,
	operations: DateOperation[],
	plugin: TaskProgressBarPlugin
): TransactionSpec {
	// Early validation: ensure line number is within bounds
	if (lineNumber < 1 || lineNumber > tr.newDoc.lines) {
		console.warn(
			`[AutoDateManager] Line number ${lineNumber} is out of bounds (doc has ${tr.newDoc.lines} lines)`
		);
		return tr;
	}

	// IMPORTANT: Use the NEW document state, not the old one
	const line = tr.newDoc.line(lineNumber);

	// Validate line boundaries
	if (line.from > tr.newDoc.length || line.to > tr.newDoc.length) {
		console.warn(
			`[AutoDateManager] Line boundaries invalid: from=${line.from}, to=${line.to}, doc length=${tr.newDoc.length}`
		);
		return tr;
	}

	let lineText = line.text;
	const changes = [];

	// Removed verbose logging

	for (const operation of operations) {
		if (operation.type === "add") {
			// Add a new date
			const dateString = formatDate(operation.format!);
			const dateMarker = getDateMarker(operation.dateType, plugin);
			const useDataviewFormat =
				plugin.settings.preferMetadataFormat === "dataview";

			let dateText: string;
			if (useDataviewFormat) {
				dateText = ` ${dateMarker}${dateString}]`;
			} else {
				dateText = ` ${dateMarker} ${dateString}`;
			}

			// Find the appropriate insert position based on date type
			let insertPosition: number;
			if (operation.dateType === "completed") {
				// Completed date goes at the end (before block reference ID)
				insertPosition = findCompletedDateInsertPosition(
					lineText,
					plugin
				);
			} else {
				// Start date and cancelled date go after existing metadata but before completed date
				insertPosition = findMetadataInsertPosition(
					lineText,
					plugin,
					operation.dateType
				);
			}

			const absolutePosition = line.from + insertPosition;

			// Ensure position is within document bounds
			// Clamp to document length to prevent range errors
			const safePosition = Math.min(absolutePosition, tr.newDoc.length);
			const clampedPosition = Math.max(0, safePosition);

			// Keep minimal logging for debugging
			if (clampedPosition !== absolutePosition) {
				console.log(
					`[AutoDateManager] Position adjusted: ${absolutePosition} -> ${clampedPosition} (doc length: ${tr.newDoc.length})`
				);
			}

			changes.push({
				from: clampedPosition,
				to: clampedPosition,
				insert: dateText,
			});

			// Update lineText for subsequent operations
			lineText =
				lineText.slice(0, insertPosition) +
				dateText +
				lineText.slice(insertPosition);
		} else if (operation.type === "remove") {
			// Remove existing date
			const useDataviewFormat =
				plugin.settings.preferMetadataFormat === "dataview";
			let datePattern: RegExp;

			if (useDataviewFormat) {
				// For dataview format: [completion::2024-01-01] or [cancelled::2024-01-01]
				const fieldName =
					operation.dateType === "completed"
						? "completion"
						: operation.dateType === "cancelled"
						? "cancelled"
						: "unknown";
				datePattern = new RegExp(
					`\\s*\\[${fieldName}::\\s*\\d{4}-\\d{2}-\\d{2}(?:\\s+\\d{2}:\\d{2}(?::\\d{2})?)?\\]`,
					"g"
				);
			} else {
				// For emoji format: ✅ 2024-01-01 or ❌ 2024-01-01
				const dateMarker = getDateMarker(operation.dateType, plugin);
				datePattern = new RegExp(
					`\\s*${escapeRegex(
						dateMarker
					)}\\s*\\d{4}-\\d{2}-\\d{2}(?:\\s+\\d{2}:\\d{2}(?::\\d{2})?)?`,
					"g"
				);
			}

			// Find all matches and remove them (there might be multiple instances)
			// Work with the full lineText
			let match;
			const matchesToRemove = [];
			datePattern.lastIndex = 0; // Reset regex state

			while ((match = datePattern.exec(lineText)) !== null) {
				matchesToRemove.push({
					start: match.index,
					end: match.index + match[0].length,
					text: match[0],
				});
			}

			// Process matches in reverse order to maintain correct positions
			for (let i = matchesToRemove.length - 1; i >= 0; i--) {
				const matchToRemove = matchesToRemove[i];
				const absoluteFrom = line.from + matchToRemove.start;
				const absoluteTo = line.from + matchToRemove.end;

				// Ensure positions are within document bounds
				const safeFrom = Math.min(
					Math.max(0, absoluteFrom),
					tr.newDoc.length
				);
				const safeTo = Math.min(
					Math.max(0, absoluteTo),
					tr.newDoc.length
				);

				changes.push({
					from: safeFrom,
					to: safeTo,
					insert: "",
				});

				// Update lineText for subsequent operations
				lineText =
					lineText.slice(0, matchToRemove.start) +
					lineText.slice(matchToRemove.end);
			}
		}
	}

	if (changes.length > 0) {
		// CRITICAL FIX: When multiple transaction filters run in sequence,
		// positions must be handled very carefully.

		// Our positions are calculated relative to tr.newDoc (after previous changes).
		// However, when returning changes, CodeMirror expects them to be relative
		// to the state AFTER tr.changes is applied, which IS tr.newDoc.
		// So our positions should actually be correct as-is!

		// The issue might be that we're seeing the document length at one point
		// but by the time the changes are applied, something else has modified it.

		// Let's validate and ensure our positions don't exceed bounds
		const docLength = tr.newDoc.length;
		const validatedChanges = changes.map((change, i) => {
			// Ensure positions are within the document bounds of newDoc
			let validFrom = Math.min(Math.max(0, change.from), docLength);
			let validTo = Math.min(Math.max(0, change.to), docLength);

			// Ensure from <= to
			if (validFrom > validTo) {
				validTo = validFrom;
			}

			// Log only if positions changed
			if (change.from !== validFrom || change.to !== validTo) {
				console.log(
					`[AutoDateManager] Position adjusted: (${change.from},${change.to}) -> (${validFrom},${validTo})`
				);
			}

			return {
				from: validFrom,
				to: validTo,
				insert: change.insert,
			};
		});

		// Check if there are existing changes
		let existingChanges: Array<{
			fromA: number;
			toA: number;
			fromB: number;
			toB: number;
			inserted: string;
		}> = [];
		tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
			existingChanges.push({
				fromA,
				toA,
				fromB,
				toB,
				inserted: inserted.toString(),
			});
		});

		// Only log if there are existing changes (indicating multiple filters)
		if (existingChanges.length > 0) {
			console.log(
				`[AutoDateManager] Processing with ${existingChanges.length} existing changes from other filters`
			);
		}

		// IMPORTANT: When we return changes combined with tr.changes,
		// our change positions should be relative to the document state
		// AFTER tr.changes is applied (which is tr.newDoc).
		// This is exactly what we have, so we should be good.

		// Let's also add an extra safety check
		const finalChanges = validatedChanges.filter((change) => {
			if (change.from > docLength || change.to > docLength) {
				console.error(
					`[AutoDateManager] ERROR: Change position exceeds document length! from=${change.from}, to=${change.to}, docLength=${docLength}`
				);
				return false;
			}
			return true;
		});

		// Rebuild a single combined change list relative to the ORIGINAL doc
		// 1) Take the original transaction's changes as specs (relative to startState)
		const baseChangeSpecs: { from: number; to: number; insert: string }[] =
			[];
		tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
			baseChangeSpecs.push({
				from: fromA,
				to: toA,
				insert: inserted.toString(),
			});
		});
		// 2) Map our additional changes (currently in newDoc space) back to startState
		const inverse = tr.changes.invert(tr.startState.doc);
		const mappedFinalChanges = finalChanges.map((c) => ({
			from: inverse.mapPos(c.from, -1),
			to: inverse.mapPos(c.to, -1),
			insert: c.insert,
		}));
		return {
			changes: [...baseChangeSpecs, ...mappedFinalChanges],
			selection: tr.selection,
			annotations: [
				taskStatusChangeAnnotation.of("autoDateManager.dateUpdate"),
			],
		};
	}

	return tr;
}

/**
 * Formats a date according to the specified format
 * @param format The date format string
 * @returns The formatted date string
 */
function formatDate(format: string): string {
	const now = new Date();

	// Simple date formatting - you might want to use a more robust library
	return format
		.replace("YYYY", now.getFullYear().toString())
		.replace("MM", (now.getMonth() + 1).toString().padStart(2, "0"))
		.replace("DD", now.getDate().toString().padStart(2, "0"))
		.replace("HH", now.getHours().toString().padStart(2, "0"))
		.replace("mm", now.getMinutes().toString().padStart(2, "0"))
		.replace("ss", now.getSeconds().toString().padStart(2, "0"));
}

/**
 * Gets the date marker for a specific date type based on metadata format
 * @param dateType The type of date (completed, start, cancelled)
 * @param plugin The plugin instance
 * @returns The date marker string
 */
function getDateMarker(
	dateType: string,
	plugin: TaskProgressBarPlugin
): string {
	const settings = plugin.settings.autoDateManager;
	const useDataviewFormat =
		plugin.settings.preferMetadataFormat === "dataview";

	if (!settings) return "📅";

	switch (dateType) {
		case "completed":
			if (useDataviewFormat) {
				return "[completion::";
			}
			return settings.completedDateMarker || "✅";
		case "start":
			if (useDataviewFormat) {
				return "[start::";
			}
			return settings.startDateMarker || "🚀";
		case "cancelled":
			if (useDataviewFormat) {
				return "[cancelled::";
			}
			return settings.cancelledDateMarker || "❌";
		default:
			return "📅";
	}
}

/**
 * Finds the position where metadata (start date, cancelled date, etc.) should be inserted
 * @param lineText The task line text
 * @param plugin The plugin instance
 * @param dateType The type of date being inserted
 * @returns The position index where the metadata should be inserted
 */
function findMetadataInsertPosition(
	lineText: string,
	plugin: TaskProgressBarPlugin,
	dateType: string
): number {
	// Work with the full line text, don't extract block reference yet
	const blockRef = detectBlockReference(lineText);
	// Find the task marker and status
	const taskMatch = lineText.match(/^[\s|\t]*([-*+]|\d+\.)\s\[(.)\]\s*/);
	if (!taskMatch) return blockRef ? blockRef.index : lineText.length;

	// Start position is right after the task checkbox
	let position = taskMatch[0].length;

	// Find the actual end of task content by scanning through the text
	// This handles content with special characters, links, etc.
	let contentEnd = position;
	let inLink = 0; // Track nested [[links]]
	let inDataview = false; // Track [field:: value] metadata
	const remainingText = lineText.slice(position);

	for (let i = 0; i < remainingText.length; i++) {
		const char = remainingText[i];
		const nextChar = remainingText[i + 1];
		const twoChars = char + (nextChar || "");

		// Handle [[wiki links]] - they are part of content
		if (twoChars === "[[") {
			inLink++;
			contentEnd = position + i + 2;
			i++; // Skip next char
			continue;
		}
		if (twoChars === "]]" && inLink > 0) {
			inLink--;
			contentEnd = position + i + 2;
			i++; // Skip next char
			continue;
		}

		// If we're inside a link, everything is content
		if (inLink > 0) {
			contentEnd = position + i + 1;
			continue;
		}

		// Check for dataview metadata [field:: value]
		if (char === "[" && !inDataview) {
			const afterBracket = remainingText.slice(i + 1);
			if (afterBracket.match(/^[a-zA-Z]+::/)) {
				// This is dataview metadata, stop here
				break;
			}
		}

		// Check for tags (only if preceded by whitespace or at start)
		if (char === "#") {
			if (
				i === 0 ||
				remainingText[i - 1] === " " ||
				remainingText[i - 1] === "\t"
			) {
				// Check if this is actually a tag (followed by word characters)
				const afterHash = remainingText.slice(i + 1);
				if (afterHash.match(/^[\w-]+/)) {
					// This is a tag, stop here
					break;
				}
			}
		}

		// Check for date emojis (these are metadata markers)
		const dateEmojis = ["📅", "🚀", "✅", "❌", "🛫", "▶️", "⏰", "🏁"];
		if (dateEmojis.includes(char)) {
			// Check if this is followed by a date pattern
			const afterEmoji = remainingText.slice(i + 1);
			if (afterEmoji.match(/^\s*\d{4}-\d{2}-\d{2}/)) {
				// This is a date marker, stop here
				break;
			}
		}

		// Regular content character
		contentEnd = position + i + 1;
	}

	position = contentEnd;

	// Trim trailing whitespace
	while (position > taskMatch[0].length && lineText[position - 1] === " ") {
		position--;
	}

	// For cancelled date, we need special handling to insert after start dates if present
	if (dateType === "cancelled") {
		const useDataviewFormat =
			plugin.settings.preferMetadataFormat === "dataview";

		// Look for existing start date
		let startDateFound = false;
		if (useDataviewFormat) {
			const startDateMatch = lineText.match(/\[start::[^\]]*\]/);
			if (startDateMatch && startDateMatch.index !== undefined) {
				position = startDateMatch.index + startDateMatch[0].length;
				startDateFound = true;
			}
		} else {
			// First try with the configured start marker
			const startMarker = getDateMarker("start", plugin);
			const escapedStartMarker = escapeRegex(startMarker);
			const startDatePattern = new RegExp(
				`${escapedStartMarker}\\s*\\d{4}-\\d{2}-\\d{2}(?:\\s+\\d{2}:\\d{2}(?::\\d{2})?)?`
			);
			let startDateMatch = lineText.match(startDatePattern);

			// If not found, look for any common start date emoji patterns
			if (!startDateMatch) {
				// Common start date emojis: 🚀, 🛫, ▶️, ⏰, 🏁
				const commonStartEmojis = ["🚀", "🛫", "▶️", "⏰", "🏁"];
				for (const emoji of commonStartEmojis) {
					const pattern = new RegExp(
						`${escapeRegex(
							emoji
						)}\\s*\\d{4}-\\d{2}-\\d{2}(?:\\s+\\d{2}:\\d{2}(?::\\d{2})?)?`
					);
					startDateMatch = lineText.match(pattern);
					if (startDateMatch) {
						break;
					}
				}
			}

			if (startDateMatch && startDateMatch.index !== undefined) {
				position = startDateMatch.index + startDateMatch[0].length;
				startDateFound = true;
			}
		}

		// If no start date found, position is already correct from initial parsing
		// It points to the end of content before metadata
	} else if (dateType === "completed") {
		// For completed date, we want to go to the end of the line (before block reference)
		// This is different from cancelled/start dates which go after content/metadata
		position = lineText.length;

		// If there's a block reference, insert before it
		if (blockRef) {
			position = blockRef.index;
			// Remove trailing space if exists
			if (position > 0 && lineText[position - 1] === " ") {
				position--;
			}
		}
	} else {
		// For start date, the position has already been calculated correctly
		// in the initial content parsing above
		// No additional processing needed
	}

	// Ensure position doesn't exceed the block reference position
	if (blockRef && position > blockRef.index) {
		position = blockRef.index;
		// Remove trailing space if it exists
		if (position > 0 && lineText[position - 1] === " ") {
			position--;
		}
	}

	// Final validation: ensure position doesn't exceed line length
	position = Math.min(position, lineText.length);
	position = Math.max(0, position);

	// Removed verbose logging
	return position;
}

/**
 * Finds the position where completed date should be inserted (at the end, before block reference ID)
 * @param lineText The task line text
 * @param plugin The plugin instance
 * @returns The position index where the completed date should be inserted
 */
function findCompletedDateInsertPosition(
	lineText: string,
	plugin: TaskProgressBarPlugin
): number {
	// Use centralized block reference detection
	const blockRef = detectBlockReference(lineText);
	let position: number;

	if (blockRef) {
		// Insert before the block reference ID
		// Remove trailing space if exists
		position = blockRef.index;
		if (position > 0 && lineText[position - 1] === " ") {
			position--;
		}
	} else {
		// If no block reference, insert at the very end
		position = lineText.length;
	}

	// Validate position is within bounds
	position = Math.min(position, lineText.length);
	position = Math.max(0, position);

	return position;
}

/**
 * Escapes special regex characters
 * @param string The string to escape
 * @returns The escaped string
 */
function escapeRegex(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detects block reference ID in the text
 * @param text The text to check
 * @returns Object with block reference info or null if not found
 */
function detectBlockReference(text: string): {
	blockId: string;
	index: number;
	length: number;
	fullMatch: string;
} | null {
	// More comprehensive block reference pattern:
	// - Matches ^block-id format
	// - Can have optional whitespace before and after
	// - Block ID can contain letters, numbers, hyphens, and underscores
	// - Must be at the end of the line
	const blockRefPattern = /\s*(\^[A-Za-z0-9_-]+)\s*$/;
	const match = text.match(blockRefPattern);

	if (match && match.index !== undefined) {
		return {
			blockId: match[1],
			index: match.index,
			length: match[0].length,
			fullMatch: match[0],
		};
	}

	return null;
}

/**
 * Removes block reference from text temporarily
 * @param text The text containing block reference
 * @returns Object with cleaned text and block reference info
 */
function extractBlockReference(text: string): {
	cleanedText: string;
	blockRef: ReturnType<typeof detectBlockReference>;
} {
	const blockRef = detectBlockReference(text);

	if (blockRef) {
		const cleanedText = text.substring(0, blockRef.index).trimEnd();
		return { cleanedText, blockRef };
	}

	return { cleanedText: text, blockRef: null };
}

/**
 * Interface for date operations
 */
interface DateOperation {
	type: "add" | "remove";
	dateType: "completed" | "start" | "cancelled";
	format?: string;
}

export {
	handleAutoDateManagerTransaction,
	findTaskStatusChange,
	determineDateOperations,
	getStatusType,
	applyDateOperations,
	isMoveOperation,
	findMetadataInsertPosition,
	findCompletedDateInsertPosition,
};
