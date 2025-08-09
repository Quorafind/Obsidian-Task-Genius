import { App, Editor, moment } from "obsidian";
import {
	EditorState,
	Transaction,
	TransactionSpec,
	StateEffect,
	Text,
} from "@codemirror/state";
import { Annotation } from "@codemirror/state";
import TaskProgressBarPlugin from "../index";
import { taskStatusChangeAnnotation } from "./taskStatusSwitcher";
import { priorityChangeAnnotation } from "./priorityPicker";
import { buildIndentString, getTabSize } from "../utils";
// @ts-ignore
import { foldable } from "@codemirror/language";
import { t } from "../translations/helper";
import {
	WorkflowDefinition,
	WorkflowStage,
} from "../common/setting-definition";

// Annotation that marks a transaction as a workflow change
export const workflowChangeAnnotation = Annotation.define<string>();

// Define a simple TextRange interface to match the provided code
interface TextRange {
	from: number;
	to: number;
}

/**
 * Calculate the foldable range for a position
 * @param state The editor state
 * @param pos The position to calculate the range for
 * @returns The text range or null if no foldable range is found
 */
function calculateRangeForTransform(
	state: EditorState,
	pos: number
): TextRange | null {
	const line = state.doc.lineAt(pos);
	const foldRange = foldable(state, line.from, line.to);

	if (!foldRange) {
		return null;
	}

	return { from: line.from, to: foldRange.to };
}

/**
 * Creates an editor extension that handles task workflow stage updates
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @returns An editor extension that can be registered with the plugin
 */
export function workflowExtension(app: App, plugin: TaskProgressBarPlugin) {
	return EditorState.transactionFilter.of((tr: Transaction) => {
		return handleWorkflowTransaction(tr, app, plugin);
	});
}

/**
 * Extract workflow tag from a line of text
 * @param lineText The line text to analyze
 * @returns An object containing workflow information or null if no workflow tag found
 */
export function extractWorkflowInfo(lineText: string): {
	workflowType: string;
	currentStage: string;
	subStage?: string;
} | null {
	// First check if this line has a stage marker [stage::id]
	const stageRegex = /\[stage::([^\]]+)\]/;
	const stageMatch = lineText.match(stageRegex);

	if (stageMatch) {
		const stageId = stageMatch[1];

		// Check if this is a substage ID (contains a dot or other separator)
		// In a real implementation, you might want to use a more specific pattern
		// based on how your substage IDs are formatted
		if (stageId.includes(".")) {
			const parts = stageId.split(".");
			return {
				workflowType: "fromParent", // Will be resolved later
				currentStage: parts[0],
				subStage: parts[1],
			};
		}

		return {
			workflowType: "fromParent", // Will be resolved later
			currentStage: stageId,
			subStage: undefined,
		};
	}

	// If no stage marker, check for workflow tag
	const workflowTagRegex = /#workflow\/([^\/\s]+)/;
	const match = lineText.match(workflowTagRegex);

	if (match) {
		return {
			workflowType: match[1],
			currentStage: "root",
			subStage: undefined,
		};
	}

	return null;
}

/**
 * Find the parent workflow for a task by looking up the document
 * @param doc The document text
 * @param lineNum The current line number
 * @returns The workflow type or null if not found
 */
export function findParentWorkflow(doc: Text, lineNum: number): string | null {
	// Ensure lineNum is in bounds (0-indexed for doc.line)
	const safeLineNum = Math.min(lineNum, doc.lines);

	// If the lineNum is invalid, return null
	if (safeLineNum <= 0) {
		return null;
	}

	// Get the current line's indentation
	const currentLineIndex = safeLineNum - 1; // Convert to 0-indexed
	const currentLine = doc.line(currentLineIndex + 1);
	const currentIndentMatch = currentLine.text.match(/^([\s|\t]*)/);
	const currentIndent = currentIndentMatch ? currentIndentMatch[1].length : 0;

	// Look upward through the document
	for (let i = currentLineIndex; i >= 0; i--) {
		// doc.line uses 1-indexed line numbers
		const line = doc.line(i + 1);
		const lineText = line.text;

		// Check the indentation level
		const indentMatch = lineText.match(/^([\s|\t]*)/);
		const indent = indentMatch ? indentMatch[1].length : 0;

		// Check for workflow tag in this line
		const workflowMatch = lineText.match(/#workflow\/([^\/\s]+)/);
		if (workflowMatch) {
			console.log(
				"Found workflow tag:",
				workflowMatch[0],
				"extracted ID:",
				workflowMatch[1]
			);
			// If this line has less indentation than our current line, it's a parent
			// OR if both lines have the same indentation level (including 0),
			// and this line is above the current line, it could be a project definition
			if (
				indent < currentIndent ||
				(indent === currentIndent && i < currentLineIndex)
			) {
				return workflowMatch[1];
			}
		}
	}

	return null;
}

/**
 * Handles transactions to detect task status changes to workflow-tagged tasks
 * @param tr The transaction to handle
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @returns The original transaction or a modified transaction
 */
export function handleWorkflowTransaction(
	tr: Transaction,
	app: App,
	plugin: TaskProgressBarPlugin
): TransactionSpec {
	// Only process if workflow feature is enabled
	if (!plugin.settings.workflow.enableWorkflow) {
		return tr;
	}

	// Only process transactions that change the document
	if (!tr.docChanged) {
		return tr;
	}

	// Skip if this transaction already has a workflow or task status annotation
	if (
		tr.annotation(workflowChangeAnnotation) ||
		tr.annotation(priorityChangeAnnotation) ||
		(tr.annotation(taskStatusChangeAnnotation) as string)?.startsWith(
			"workflowChange"
		)
	) {
		return tr;
	}

	// Extract changes from the transaction
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

	// Check if any change is a task completion
	const completedStatuses = plugin.settings.taskStatuses.completed.split("|");

	if (
		!changes.some(
			(c) =>
				completedStatuses.includes(c.text) ||
				completedStatuses.some(
					(status) =>
						c.text === `- [${status}]` || c.text === `[${status}]`
				)
		)
	) {
		return tr;
	}

	// Find all workflow tasks that have been completed
	let workflowUpdates: {
		line: number;
		lineText: string;
		workflowType: string;
		currentStage: string;
		currentSubStage?: string;
	}[] = [];

	for (const change of changes) {
		// Check if this is a task status change to completed
		if (
			completedStatuses.includes(change.text) ||
			completedStatuses.some(
				(status) =>
					change.text === `- [${status}]` ||
					change.text === `[${status}]`
			)
		) {
			const line = tr.newDoc.lineAt(change.fromB);
			const lineText = line.text;

			// Check if this line contains a task
			const taskRegex = /^([\s|\t]*)([-*+]|\d+\.)\s+\[(.)]/;
			const taskMatch = lineText.match(taskRegex);

			if (taskMatch) {
				// Use our helper to resolve complete workflow information
				const resolvedInfo = resolveWorkflowInfo(
					lineText,
					tr.newDoc,
					line.number,
					plugin
				);

				if (resolvedInfo) {
					// Add to our list of workflow updates
					workflowUpdates.push({
						line: line.number,
						lineText,
						workflowType: resolvedInfo.workflowType,
						currentStage: resolvedInfo.currentStage.id,
						currentSubStage: resolvedInfo.currentSubStage?.id,
					});
				}
			}
		}
	}

	const newChanges: { from: number; to: number; insert: string }[] = [];
	// Process each workflow update
	if (workflowUpdates.length > 0) {
		for (const update of workflowUpdates) {
			const line = tr.newDoc.line(update.line);
			const resolvedInfo = resolveWorkflowInfo(
				update.lineText,
				tr.newDoc,
				update.line,
				plugin
			);

			if (!resolvedInfo) continue;

			const {
				workflowType,
				currentStage,
				currentSubStage,
				workflow,
				isRootTask,
			} = resolvedInfo;

			// Handle timestamp removal and time calculation
			const timeChanges = processTimestampAndCalculateTime(
				line.text,
				tr.newDoc,
				line.from,
				line.number,
				workflowType,
				plugin
			);
			newChanges.push(...timeChanges);

			// Remove the [stage::] marker from the current line
			const stageMarkerRegex = /\s*\[stage::[^\]]+\]/;
			const stageMarker = line.text.match(stageMarkerRegex);
			if (
				stageMarker &&
				stageMarker.index &&
				plugin.settings.workflow.autoRemoveLastStageMarker
			) {
				// Create a change that removes the [stage::] marker
				newChanges.push({
					from: line.from + stageMarker.index,
					to: line.from + stageMarker.index + stageMarker[0].length,
					insert: "",
				});
			}

			// Handle terminal stage completion
			if (currentStage.type === "terminal") {
				// For terminal stages, we need to complete the root workflow task
				// Find and complete the root workflow task
				const currentIndentMatch = line.text.match(/^([\s|\t]*)/);
				const currentIndent = currentIndentMatch
					? currentIndentMatch[1].length
					: 0;
				const taskRegex = /^([\s|\t]*)([-*+]|\d+\.)\s+\[(.)]/;

				// Look upward to find the root workflow task (with less indentation and workflow tag)
				for (let i = update.line - 1; i >= 1; i--) {
					const checkLine = tr.newDoc.line(i);
					const checkIndentMatch =
						checkLine.text.match(/^([\s|\t]*)/);
					const checkIndent = checkIndentMatch
						? checkIndentMatch[1].length
						: 0;

					console.log("currentIndent", currentIndent);

					// If this line has less indentation and contains a workflow tag, it's likely the root task
					if (
						checkIndent < currentIndent &&
						checkLine.text.includes(`#workflow/${workflowType}`)
					) {
						console.log("checkLine", checkLine.text);
						const rootTaskMatch = checkLine.text.match(taskRegex);
						if (rootTaskMatch) {
							// Check if the root task is not already completed
							const rootTaskStatus = rootTaskMatch[3]; // Status character is in group 3
							const completedStatuses =
								plugin.settings.taskStatuses.completed.split(
									"|"
								);

							if (!completedStatuses.includes(rootTaskStatus)) {
								// Complete the root task
								const rootTaskStart =
									checkLine.from +
									rootTaskMatch[0].indexOf("[");
								newChanges.push({
									from: rootTaskStart + 1,
									to: rootTaskStart + 2,
									insert: "x",
								});
							}
							break; // Found and handled the root task, stop looking
						}
					}
				}
				continue; // Skip creating next stage task for terminal stages
			}

			// Determine the next stage using our helper function
			const { nextStageId, nextSubStageId } = determineNextStage(
				currentStage,
				workflow,
				currentSubStage
			);

			// Find the next stage object
			const nextStage = workflow.stages.find((s) => s.id === nextStageId);
			if (!nextStage) continue;

			// Find the next substage object if needed
			let nextSubStage:
				| { id: string; name: string; next?: string }
				| undefined;
			if (nextSubStageId && nextStage.subStages) {
				nextSubStage = nextStage.subStages.find(
					(ss) => ss.id === nextSubStageId
				);
			}

			// Create new task for the next stage
			const indentMatch = update.lineText.match(/^([\s|\t]*)/);
			let indentation = indentMatch ? indentMatch[1] : "";
			const tabSize = getTabSize(app);
			const defaultIndentation = buildIndentString(app);

			// If this is a root task, add additional indentation for the new task
			const newTaskIndentation = isRootTask
				? indentation + defaultIndentation
				: indentation;

			// Create task text for the next stage using our helper
			const completeTaskText = generateWorkflowTaskText(
				nextStage,
				newTaskIndentation,
				plugin,
				true,
				nextSubStage
			);

			// Determine the insertion point using our helper
			const insertionPoint = determineTaskInsertionPoint(
				line,
				tr.newDoc,
				indentation
			);

			// Add the new task(s) after the determined insertion point
			if (
				!(
					tr.annotation(taskStatusChangeAnnotation) ===
					"autoCompleteParent.DONE"
				)
			) {
				newChanges.push({
					from: insertionPoint,
					to: insertionPoint,
					insert: `\n${completeTaskText}`,
				});
			}
		}
	}

	if (newChanges.length > 0) {
		return {
			changes: [tr.changes, ...newChanges],
			selection: tr.selection,
			annotations: workflowChangeAnnotation.of("workflowChange"),
		};
	}

	return tr;
}

/**
 * Process timestamp and calculate spent time for workflow tasks
 * @param lineText The text of the line containing the task
 * @param doc The document text
 * @param lineFrom Starting position of the line in the document
 * @param lineNumber The line number in the document (1-based)
 * @param workflowType The workflow ID
 * @param plugin The plugin instance
 * @returns Array of changes to apply
 */
export function processTimestampAndCalculateTime(
	lineText: string,
	doc: Text,
	lineFrom: number,
	lineNumber: number,
	workflowType: string,
	plugin: TaskProgressBarPlugin
): { from: number; to: number; insert: string }[] {
	const changes: { from: number; to: number; insert: string }[] = [];

	const timestampFormat =
		plugin.settings.workflow.timestampFormat || "YYYY-MM-DD HH:mm:ss";
	const timestampLength = `🛫 ${moment().format(timestampFormat)}`.length;
	const startMarkIndex = lineText.indexOf("🛫");

	if (startMarkIndex === -1) {
		return changes;
	}

	const endMarkIndex = startMarkIndex + timestampLength;
	const timestamp = lineText.substring(startMarkIndex, endMarkIndex);
	const startTime = moment(timestamp, timestampFormat);
	const endTime = moment();
	const duration = moment.duration(endTime.diff(startTime));

	// Remove timestamp if enabled
	if (plugin.settings.workflow.removeTimestampOnTransition) {
		const timestampStart = lineFrom + startMarkIndex;
		const timestampEnd = timestampStart + timestampLength;
		changes.push({
			from: timestampStart - 1, // Include the space before the timestamp
			to: timestampEnd,
			insert: "",
		});
	}

	// Add spent time if enabled
	if (plugin.settings.workflow.calculateSpentTime) {
		const spentTime = moment
			.utc(duration.asMilliseconds())
			.format(plugin.settings.workflow.spentTimeFormat);

		// Determine insertion position (before any stage marker)
		const stageMarkerIndex = lineText.indexOf("[stage::");
		const insertPosition =
			lineFrom +
			(stageMarkerIndex !== -1 ? stageMarkerIndex : lineText.length);

		// Only add time to non-final stages or if not calculating full time
		if (
			!isLastWorkflowStageOrNotWorkflow(
				lineText,
				lineNumber,
				doc,
				plugin
			) ||
			!plugin.settings.workflow.calculateFullSpentTime
		) {
			changes.push({
				from: insertPosition,
				to: insertPosition,
				insert: ` (⏱️ ${spentTime})`,
			});
		}

		// Calculate and add total time for final stage if enabled
		if (
			plugin.settings.workflow.calculateFullSpentTime &&
			isLastWorkflowStageOrNotWorkflow(lineText, lineNumber, doc, plugin)
		) {
			const workflowTag = `#workflow/${workflowType}`;
			let totalDuration = moment.duration(0);
			let foundStartTime = false;
			const timeSpentRegex = /\(⏱️\s+([0-9:]+)\)/;

			// Get current task indentation level
			const currentIndentMatch = lineText.match(/^(\s*)/);
			const currentIndentLevel = currentIndentMatch
				? currentIndentMatch[1].length
				: 0;

			// Look up to find the root task
			for (let i = lineNumber - 1; i >= 1; i--) {
				// Ensure line is within document bounds (0-indexed in doc.line)
				if (i >= doc.lines) continue;

				// Use 0-indexed line number for doc.line
				const checkLine = doc.line(i);
				if (checkLine.text.includes(workflowTag)) {
					// Found root task, now look for all tasks with time spent markers
					for (let j = i; j <= lineNumber; j++) {
						// Ensure line is within document bounds
						if (j >= doc.lines) continue;

						// Use 0-indexed line number for doc.line
						const taskLine = doc.line(j);

						// Check indentation level - only include tasks with indentation less than or equal to current task
						const indentMatch = taskLine.text.match(/^(\s*)/);
						const indentLevel = indentMatch
							? indentMatch[1].length
							: 0;

						// Skip tasks with greater indentation (subtasks of other tasks)
						if (indentLevel > currentIndentLevel) {
							continue;
						}

						const timeSpentMatch =
							taskLine.text.match(timeSpentRegex);

						if (timeSpentMatch && timeSpentMatch[1]) {
							// Parse the time spent
							const timeParts = timeSpentMatch[1].split(":");
							let timeInMs = 0;

							if (timeParts.length === 3) {
								// HH:mm:ss format
								timeInMs =
									(parseInt(timeParts[0]) * 3600 +
										parseInt(timeParts[1]) * 60 +
										parseInt(timeParts[2])) *
									1000;
							} else if (timeParts.length === 2) {
								// mm:ss format
								timeInMs =
									(parseInt(timeParts[0]) * 60 +
										parseInt(timeParts[1])) *
									1000;
							}

							if (timeInMs > 0) {
								totalDuration.add(timeInMs);
								foundStartTime = true;
							}
						}
					}
					break;
				}
			}

			// If we couldn't find any time spent markers, use the current duration
			if (!foundStartTime) {
				totalDuration = duration;
				foundStartTime = true;
			} else {
				// Add the current task's duration to the total
				totalDuration.add(duration);
			}

			if (foundStartTime) {
				const totalSpentTime = moment
					.utc(totalDuration.asMilliseconds())
					.format(plugin.settings.workflow.spentTimeFormat);

				// Add total time to the current line
				changes.push({
					from: insertPosition,
					to: insertPosition,
					insert: ` (${t("Total")}: ${totalSpentTime})`,
				});
			}
		}
	}

	return changes;
}

/**
 * Updates the context menu with workflow options
 * @param menu The context menu to update
 * @param editor The editor instance
 * @param plugin The plugin instance
 */
export function updateWorkflowContextMenu(
	menu: any,
	editor: Editor,
	plugin: TaskProgressBarPlugin
) {
	if (!plugin.settings.workflow.enableWorkflow) {
		return;
	}

	const cursor = editor.getCursor();
	const line = editor.getLine(cursor.line);

	// Check if this line contains a task
	const taskRegex = /^([\s|\t]*)([-*+]|\d+\.)\s+\[(.)]/;
	const taskMatch = line.match(taskRegex);

	if (!taskMatch) {
		return;
	}

	// Check if this task has a workflow tag or stage marker
	const workflowInfo = extractWorkflowInfo(line);

	if (!workflowInfo) {
		// Add option to add workflow
		menu.addItem((item: any) => {
			item.setTitle(t("Workflow"));
			item.setIcon("list-ordered");

			// Create submenu
			const submenu = item.setSubmenu();

			// Add option to add workflow root
			submenu.addItem((addItem: any) => {
				addItem.setTitle(t("Add as workflow root"));
				addItem.setIcon("plus-circle");

				// Create a submenu for available workflows
				const workflowSubmenu = addItem.setSubmenu();

				plugin.settings.workflow.definitions.forEach((workflow) => {
					workflowSubmenu.addItem((wfItem: any) => {
						wfItem.setTitle(workflow.name);
						wfItem.onClick(() => {
							// Add workflow tag using dispatch
							editor.cm.dispatch({
								changes: {
									from: editor.posToOffset(cursor),
									to: editor.posToOffset(cursor),
									insert: `#workflow/${workflow.id}`,
								},
							});
						});
					});
				});
			});

			// Add quick workflow actions
			submenu.addSeparator();

			// Convert task to workflow template
			submenu.addItem((convertItem: any) => {
				convertItem.setTitle(t("Convert to workflow template"));
				convertItem.setIcon("convert");
				convertItem.onClick(() => {
					// Import the conversion function
					import("../commands/workflowCommands").then(
						({ convertTaskToWorkflowCommand }) => {
							convertTaskToWorkflowCommand(
								false,
								editor,
								null as any,
								plugin
							);
						}
					);
				});
			});

			// Start workflow here
			submenu.addItem((startItem: any) => {
				startItem.setTitle(t("Start workflow here"));
				startItem.setIcon("play");
				startItem.onClick(() => {
					import("../commands/workflowCommands").then(
						({ startWorkflowHereCommand }) => {
							startWorkflowHereCommand(
								false,
								editor,
								null as any,
								plugin
							);
						}
					);
				});
			});

			// Quick workflow creation
			submenu.addItem((quickItem: any) => {
				quickItem.setTitle(t("Create quick workflow"));
				quickItem.setIcon("zap");
				quickItem.onClick(() => {
					import("../commands/workflowCommands").then(
						({ createQuickWorkflowCommand }) => {
							createQuickWorkflowCommand(
								false,
								editor,
								null as any,
								plugin
							);
						}
					);
				});
			});
		});
		return;
	}

	// If we're here, the task has a workflow tag or stage marker
	// Resolve complete workflow information
	const resolvedInfo = resolveWorkflowInfo(
		line,
		editor.cm.state.doc,
		cursor.line + 1,
		plugin
	);

	if (!resolvedInfo) {
		return;
	}

	const {
		workflowType,
		currentStage,
		currentSubStage,
		workflow,
		isRootTask,
	} = resolvedInfo;

	menu.addItem((item: any) => {
		item.setTitle(t("Workflow"));
		item.setIcon("list-ordered");

		// Create submenu
		const submenu = item.setSubmenu();

		// Show available next stages
		if (currentStage.id === "_root_task_") {
			if (workflow.stages.length > 0) {
				const firstStage = workflow.stages[0];
				submenu.addItem((nextItem: any) => {
					nextItem.setTitle(
						`${t("Move to stage")} ${firstStage.name}`
					);
					nextItem.onClick(() => {
						const changes = createWorkflowStageTransition(
							plugin,
							editor,
							line,
							cursor.line,
							firstStage,
							true,
							undefined,
							undefined
						);

						editor.cm.dispatch({
							changes,
							annotations:
								taskStatusChangeAnnotation.of("workflowChange"),
						});
					});
				});
			}
		} else if (currentStage.canProceedTo) {
			currentStage.canProceedTo.forEach((nextStageId) => {
				const nextStage = workflow.stages.find(
					(s) => s.id === nextStageId
				);

				if (nextStage) {
					submenu.addItem((nextItem: any) => {
						// Check if this is the last stage
						const isLastStage = isLastWorkflowStageOrNotWorkflow(
							line,
							cursor.line,
							editor.cm.state.doc,
							plugin
						);

						// If last stage, show "Complete stage" instead of "Move to"
						nextItem.setTitle(
							isLastStage
								? `${t("Complete stage")}: ${nextStage.name}`
								: `${t("Move to stage")} ${nextStage.name}`
						);
						nextItem.onClick(() => {
							const changes = createWorkflowStageTransition(
								plugin,
								editor,
								line,
								cursor.line,
								nextStage,
								false,
								undefined,
								currentSubStage
							);
							editor.cm.dispatch({
								changes,
								annotations: taskStatusChangeAnnotation.of(
									isLastStage
										? "workflowChange.completeStage"
										: "workflowChange.moveToStage"
								),
							});
						});
					});
				}
			});
		} else if (currentStage.type === "terminal") {
			submenu.addItem((nextItem: any) => {
				nextItem.setTitle(t("Complete workflow"));
				nextItem.onClick(() => {
					const changes = createWorkflowStageTransition(
						plugin,
						editor,
						line,
						cursor.line,
						currentStage,
						false,
						undefined,
						currentSubStage
					);

					editor.cm.dispatch({
						changes,
						annotations:
							taskStatusChangeAnnotation.of("workflowChange"),
					});
				});
			});
		} else {
			// Use determineNextStage to find the next stage
			const { nextStageId } = determineNextStage(
				currentStage,
				workflow,
				currentSubStage
			);

			// Only add menu option if there's a valid next stage that's different from current
			if (nextStageId && nextStageId !== currentStage.id) {
				const nextStage = workflow.stages.find(
					(s) => s.id === nextStageId
				);
				if (nextStage) {
					submenu.addItem((nextItem: any) => {
						nextItem.setTitle(`${t("Move to")} ${nextStage.name}`);
						nextItem.onClick(() => {
							const changes = createWorkflowStageTransition(
								plugin,
								editor,
								line,
								cursor.line,
								nextStage,
								false,
								undefined,
								undefined
							);

							editor.cm.dispatch({
								changes,
								annotations:
									taskStatusChangeAnnotation.of(
										"workflowChange"
									),
							});
						});
					});
				}
			}
		}

		// Add option to add a child task with same stage
		submenu.addSeparator();
		submenu.addItem((addItem: any) => {
			addItem.setTitle(t("Add child task with same stage"));
			addItem.setIcon("plus-circle");
			addItem.onClick(() => {
				if (workflowInfo.currentStage === "root") {
					if (workflow.stages.length > 0) {
						const firstStage = workflow.stages[0];
						const changes = createWorkflowStageTransition(
							plugin,
							editor,
							line,
							cursor.line,
							firstStage,
							false,
							undefined,
							undefined
						);
						editor.cm.dispatch({
							changes,
							annotations:
								taskStatusChangeAnnotation.of("workflowChange"),
						});
					}
				} else if (currentStage.id === "_root_task_") {
					if (workflow.stages.length > 0) {
						const firstStage = workflow.stages[0];
						const changes = createWorkflowStageTransition(
							plugin,
							editor,
							line,
							cursor.line,
							firstStage,
							false,
							undefined,
							undefined
						);
						editor.cm.dispatch({
							changes,
							annotations:
								taskStatusChangeAnnotation.of("workflowChange"),
						});
					}
				} else {
					const changes = createWorkflowStageTransition(
						plugin,
						editor,
						line,
						cursor.line,
						currentStage,
						false,
						currentSubStage,
						undefined
					);
					editor.cm.dispatch({
						changes,
						annotations:
							taskStatusChangeAnnotation.of("workflowChange"),
					});
				}
			});
		});
	});
}

/**
 * Checks if a task line represents the final stage of a workflow or is not part of a workflow.
 * Returns true if it's the final stage or not a workflow task, false otherwise.
 * @param lineText The text of the line containing the task
 * @param lineNumber The line number (1-based)
 * @param doc The document text
 * @param plugin The plugin instance
 * @returns boolean
 */
export function isLastWorkflowStageOrNotWorkflow(
	lineText: string,
	lineNumber: number,
	doc: Text,
	plugin: TaskProgressBarPlugin
): boolean {
	console.log("=== isLastWorkflowStageOrNotWorkflow called ===");
	console.log(
		"Available workflow definitions:",
		plugin.settings.workflow.definitions.map((wf) => ({
			id: wf.id,
			name: wf.name,
		}))
	);

	// Extract basic workflow info
	const workflowInfo = extractWorkflowInfo(lineText);
	if (!workflowInfo) {
		console.log("not a workflow task");
		return true;
	}

	let workflowType = workflowInfo.workflowType;
	let currentStageId = workflowInfo.currentStage;
	let currentSubStageId = workflowInfo.subStage;

	// Resolve workflow type if it's derived from parent
	if (workflowType === "fromParent") {
		console.log(
			"Looking for parent workflow, lineNumber:",
			lineNumber,
			"doc.lines:",
			doc.lines
		);
		// Use safe line number for findParentWorkflow
		const safeLineNumber = Math.min(lineNumber, doc.lines);
		const parentWorkflow = findParentWorkflow(doc, safeLineNumber);

		console.log("Found parent workflow:", parentWorkflow);

		if (!parentWorkflow) {
			console.log("No parent workflow found");
			return true;
		}
		workflowType = parentWorkflow;
	}

	console.log("Final workflow type:", workflowType);

	// Find the workflow definition
	const workflow = plugin.settings.workflow.definitions.find(
		(wf: WorkflowDefinition) => wf.id === workflowType
	);

	console.log(
		"Available workflow definitions:",
		plugin.settings.workflow.definitions.map((wf) => ({
			id: wf.id,
			name: wf.name,
		}))
	);

	if (!workflow) {
		console.log("No workflow definition found for:", workflowType);
		return true; // Definition missing, treat as non-workflow
	}

	console.log("Found workflow definition:", workflow.name);

	// Handle root tasks - they are never the "last stage" in the sense of triggering parent completion
	// A root task completion should trigger the first stage, not parent completion.
	if (currentStageId === "root") {
		return false;
	}

	// Find the current stage definition
	const currentStage = workflow.stages.find((s) => s.id === currentStageId);
	if (!currentStage) {
		console.warn(
			`Stage definition not found: ${currentStageId} in workflow ${workflowType}`
		);
		return true; // Stage definition missing
	}

	// --- Check if it's the last stage ---

	// 1. Terminal Stage: Explicitly the end.
	if (currentStage.type === "terminal") {
		return true;
	}

	// 2. Cycle Stage with SubStages:
	if (
		currentStage.type === "cycle" &&
		currentStage.subStages &&
		currentSubStageId
	) {
		const currentSubStage = currentStage.subStages.find(
			(ss) => ss.id === currentSubStageId
		);
		if (!currentSubStage) {
			console.warn(
				`SubStage definition not found: ${currentSubStageId} in stage ${currentStageId}`
			);
			return true; // SubStage definition missing
		}
		// It's the last substage if it has no 'next' AND the parent stage has no 'canProceedTo' or linear 'next'
		const isLastSubStage = !currentSubStage.next;
		// Check if the main stage points anywhere else *after* this cycle potentially finishes
		const parentStageCanProceed =
			currentStage.canProceedTo && currentStage.canProceedTo.length > 0;
		const parentStageHasLinearNext =
			typeof currentStage.next === "string" ||
			(Array.isArray(currentStage.next) && currentStage.next.length > 0);

		// If it's the last known substage AND the main stage cannot proceed elsewhere,
		// then we consider this the end of this branch of the workflow.
		if (
			isLastSubStage &&
			!parentStageCanProceed &&
			!parentStageHasLinearNext
		) {
			// Additionally, ensure this main stage itself is the last in the overall sequence if no explicit next steps are defined
			const currentIndex = workflow.stages.findIndex(
				(s) => s.id === currentStage.id
			);
			if (currentIndex === workflow.stages.length - 1) {
				return true;
			}
		}
		// Otherwise, if it's a substage in a cycle, assume it's not the absolute final step
		return false;
	}

	// 3. Linear or Cycle (without SubStages being considered): Check for onward connections
	const hasExplicitNext =
		currentStage.next ||
		(currentStage.canProceedTo && currentStage.canProceedTo.length > 0);
	if (hasExplicitNext) {
		// If there's an explicit next stage defined, it's not the last one.
		return false;
	}

	// 4. Check sequence: If no explicit 'next', is it the last stage in the definition array?
	const currentIndex = workflow.stages.findIndex(
		(s) => s.id === currentStage.id
	);
	if (currentIndex < 0) {
		console.warn(
			`Current stage ${currentStage.id} not found in workflow stages array.`
		);
		return true; // Error condition
	}
	if (currentIndex === workflow.stages.length - 1) {
		// It's the last stage in the defined sequence without explicit next steps.
		return true;
	}

	// Default: Assume not the last stage if none of the above conditions met
	return false;
}

/**
 * Determines the next stage in a workflow based on the current stage and workflow definition
 * @param currentStage The current workflow stage
 * @param workflow The workflow definition
 * @param currentSubStage Optional current substage object
 * @returns Object containing the next stage ID and optional next substage ID
 */
export function determineNextStage(
	currentStage: WorkflowStage,
	workflow: WorkflowDefinition,
	currentSubStage?: { id: string; name: string; next?: string }
): { nextStageId: string; nextSubStageId?: string } {
	let nextStageId: string;
	let nextSubStageId: string | undefined;

	if (currentStage.id === "_root_task_") {
		// For root tasks, always use the first stage
		nextStageId = workflow.stages[0].id;
	} else if (currentStage.type === "terminal") {
		// Terminal stages have no next stage, return the same stage
		nextStageId = currentStage.id;
	} else if (currentStage.type === "cycle" && currentSubStage) {
		// If we have a substage in a cycle stage, check if it has a next substage
		if (currentSubStage.next) {
			// Move to the next substage within this cycle
			nextStageId = currentStage.id;
			nextSubStageId = currentSubStage.next;
		} else {
			// For cycle stages, if there's no explicit next substage:
			// Check if we should proceed to next main stage (when canProceedTo is defined)
			// Otherwise cycle back to the beginning

			if (
				currentStage.canProceedTo &&
				currentStage.canProceedTo.length > 0
			) {
				// Move to next main stage when at the end of a cycle
				nextStageId = currentStage.canProceedTo[0];
				nextSubStageId = undefined;
			} else {
				// No canProceedTo defined - cycle back
				const subStageCount = currentStage.subStages
					? currentStage.subStages.length
					: 0;

				if (subStageCount === 1) {
					// Only one substage - keep cycling the same substage
					nextStageId = currentStage.id;
					nextSubStageId = currentSubStage.id;
				} else if (subStageCount > 1) {
					// Multiple substages - cycle back to the first one
					nextStageId = currentStage.id;
					nextSubStageId = currentStage.subStages![0].id;
				} else {
					// Fallback - stay in the same stage
					nextStageId = currentStage.id;
					nextSubStageId = undefined;
				}
			}
		}
	} else if (currentStage.type === "linear") {
		// For linear stages, find the next stage
		if (typeof currentStage.next === "string") {
			nextStageId = currentStage.next;
		} else if (
			Array.isArray(currentStage.next) &&
			currentStage.next.length > 0
		) {
			nextStageId = currentStage.next[0];
		} else if (
			currentStage.canProceedTo &&
			currentStage.canProceedTo.length > 0
		) {
			nextStageId = currentStage.canProceedTo[0];
		} else {
			// Find the next stage in sequence
			const currentIndex = workflow.stages.findIndex(
				(s) => s.id === currentStage.id
			);
			if (
				currentIndex >= 0 &&
				currentIndex < workflow.stages.length - 1
			) {
				nextStageId = workflow.stages[currentIndex + 1].id;
			} else {
				// No next stage found, stay on current stage
				nextStageId = currentStage.id;
			}
		}
	} else if (currentStage.type === "cycle") {
		// For cycle stages, check if there are canProceedTo options
		if (currentStage.canProceedTo && currentStage.canProceedTo.length > 0) {
			nextStageId = currentStage.canProceedTo[0];
		} else {
			// Stay in the same stage
			nextStageId = currentStage.id;
		}
	} else {
		// Default fallback - stay in the same stage
		nextStageId = currentStage.id;
	}

	return { nextStageId, nextSubStageId };
}

// Helper function to create workflow stage transition
export function createWorkflowStageTransition(
	plugin: TaskProgressBarPlugin,
	editor: Editor,
	line: string,
	lineNumber: number,
	nextStage: WorkflowStage,
	isRootTask: boolean,
	nextSubStage?: { id: string; name: string; next?: string },
	currentSubStage?: { id: string; name: string; next?: string }
) {
	const doc = editor.cm.state.doc;
	const app = plugin.app;

	// Ensure line numbers are within document bounds (1-indexed in doc.line)
	const safeLineNumber = Math.min(lineNumber + 1, doc.lines);
	const lineStart = doc.line(safeLineNumber);

	const indentMatch = line.match(/^([\s|\t]*)/);
	const defaultIndentation = buildIndentString(app);
	const tabSize = getTabSize(app);
	let indentation = indentMatch
		? indentMatch[1] + (isRootTask ? defaultIndentation : "")
		: "";

	plugin.settings.workflow.autoAddTimestamp
		? ` 🛫 ${moment().format(
				plugin.settings.workflow.timestampFormat ||
					"YYYY-MM-DD HH:mm:ss"
		  )}`
		: "";

	let changes = [];

	// Complete the current task
	const taskRegex = /^([\s|\t]*)([-*+]|\d+\.)\s+\[(.)]/;
	const taskMatch = line.match(taskRegex);
	if (taskMatch) {
		const taskStart = lineStart.from + taskMatch[0].indexOf("[");
		changes.push({
			from: taskStart + 1,
			to: taskStart + 2,
			insert: "x",
		});
	}

	// Handle timestamp removal and time calculation using our helper function
	// Extract workflow type from the line or task context
	let workflowType = "";
	const workflowTagMatch = line.match(/#workflow\/([^\/\s]+)/);
	if (workflowTagMatch) {
		workflowType = workflowTagMatch[1];
	} else {
		// Try to find parent workflow if not directly specified
		workflowType =
			findParentWorkflow(doc, safeLineNumber) ||
			nextStage.id.split(".")[0];
	}

	const timeChanges = processTimestampAndCalculateTime(
		line,
		doc,
		lineStart.from,
		lineNumber,
		workflowType,
		plugin
	);
	changes.push(...timeChanges);

	// If we're transitioning from a sub-stage to a new main stage
	// Mark the current sub-stage as complete and reduce indentation
	if (
		currentSubStage &&
		!nextSubStage &&
		!isLastWorkflowStageOrNotWorkflow(line, lineNumber, doc, plugin)
	) {
		// First, mark the current sub-stage as complete
		const stageMarkerRegex = /\s*\[stage::[^\]]+\]/;
		const stageMarker = line.match(stageMarkerRegex);
		if (
			stageMarker &&
			stageMarker.index &&
			plugin.settings.workflow.autoRemoveLastStageMarker
		) {
			changes.push({
				from: lineStart.from + stageMarker.index,
				to: lineStart.from + stageMarker.index + stageMarker[0].length,
				insert: "",
			});
		}

		// Reduce indentation for the new task
		const newIndentation = indentation.slice(0, -tabSize);
		indentation = newIndentation;
	}

	// Create the new task text
	if (!isLastWorkflowStageOrNotWorkflow(line, lineNumber, doc, plugin)) {
		// Generate the task text using our helper
		const newTaskText = generateWorkflowTaskText(
			nextStage,
			indentation,
			plugin,
			true,
			nextSubStage
		);

		// Add the new task after the current line
		changes.push({
			from: lineStart.to,
			to: lineStart.to,
			insert: `\n${newTaskText}`,
		});
	}

	// Remove stage marker from current line if setting enabled
	if (plugin?.settings.workflow.autoRemoveLastStageMarker) {
		const stageMarkerRegex = /\s*\[stage::[^\]]+\]/;
		const stageMarker = line.match(stageMarkerRegex);
		if (stageMarker && stageMarker.index) {
			changes.push({
				from: lineStart.from + stageMarker.index,
				to: lineStart.from + stageMarker.index + stageMarker[0].length,
				insert: "",
			});
		}
	}

	return changes;
}

/**
 * Resolves complete workflow information for a task line
 * @param lineText The text of the line containing the task
 * @param doc The document text
 * @param lineNumber The line number (1-based)
 * @param plugin The plugin instance
 * @returns Complete workflow information or null if not a workflow task
 */
export function resolveWorkflowInfo(
	lineText: string,
	doc: Text,
	lineNumber: number,
	plugin: TaskProgressBarPlugin
): {
	workflowType: string;
	currentStage: WorkflowStage;
	currentSubStage?: { id: string; name: string; next?: string };
	workflow: WorkflowDefinition;
	isRootTask: boolean;
} | null {
	console.log("=== resolveWorkflowInfo called ===");
	console.log(
		"Available workflow definitions:",
		plugin.settings.workflow.definitions.map((wf) => ({
			id: wf.id,
			name: wf.name,
		}))
	);

	// Extract basic workflow info
	const workflowInfo = extractWorkflowInfo(lineText);
	if (!workflowInfo) {
		console.log("No workflow info extracted from line:", lineText);
		return null;
	}

	console.log("Extracted workflow info:", workflowInfo);

	let workflowType = workflowInfo.workflowType;
	let stageId = workflowInfo.currentStage;
	let subStageId = workflowInfo.subStage;

	// Resolve workflow type if derived from parent
	if (workflowType === "fromParent") {
		console.log(
			"Looking for parent workflow, lineNumber:",
			lineNumber,
			"doc.lines:",
			doc.lines
		);
		// Use safe line number for findParentWorkflow
		const safeLineNumber = Math.min(lineNumber, doc.lines);
		const parentWorkflow = findParentWorkflow(doc, safeLineNumber);

		console.log("Found parent workflow:", parentWorkflow);

		if (!parentWorkflow) {
			console.log("No parent workflow found");
			return null;
		}
		workflowType = parentWorkflow;
	}

	console.log("Final workflow type:", workflowType);

	// Find the workflow definition
	const workflow = plugin.settings.workflow.definitions.find(
		(wf: WorkflowDefinition) => wf.id === workflowType
	);
	if (!workflow) {
		console.log("No workflow definition found for:", workflowType);
		return null;
	}

	console.log("Found workflow definition:", workflow.name);

	// Determine if this is a root task
	const isRootTask =
		stageId === "root" ||
		(lineText.includes(`#workflow/${workflowType}`) &&
			!lineText.includes("[stage::"));

	console.log("Is root task:", isRootTask, "stageId:", stageId);

	// Find the current stage
	let currentStage: WorkflowStage;

	if (stageId === "root" || isRootTask) {
		// For root tasks, create a special stage that points to the first workflow stage
		currentStage = {
			id: "_root_task_",
			name: "Root Task",
			type: "linear",
			next:
				workflow.stages.length > 0 ? workflow.stages[0].id : undefined,
		};
	} else {
		// Find the stage in the workflow
		const foundStage = workflow.stages.find((s) => s.id === stageId);
		if (!foundStage) {
			console.log(
				"Stage not found in workflow:",
				stageId,
				"Available stages:",
				workflow.stages.map((s) => s.id)
			);
			return null;
		}
		currentStage = foundStage;
	}

	console.log("Current stage:", currentStage);

	// Find current substage if exists
	let currentSubStage:
		| { id: string; name: string; next?: string }
		| undefined;
	if (subStageId && currentStage.subStages) {
		currentSubStage = currentStage.subStages.find(
			(ss) => ss.id === subStageId
		);
	}

	console.log("Current substage:", currentSubStage);

	return {
		workflowType,
		currentStage,
		currentSubStage,
		workflow,
		isRootTask,
	};
}

/**
 * Generates text for a workflow task
 * @param nextStage The workflow stage to create task text for
 * @param nextSubStage Optional substage within the stage
 * @param indentation The indentation to use for the task
 * @param plugin The plugin instance
 * @param addSubtasks Whether to add subtasks for cycle stages
 * @param tabSize Tab size for indentation
 * @returns The generated task text
 */
export function generateWorkflowTaskText(
	nextStage: WorkflowStage,
	indentation: string,
	plugin: TaskProgressBarPlugin,
	addSubtasks: boolean = true,
	nextSubStage?: { id: string; name: string; next?: string }
): string {
	// Generate timestamp if configured
	const timestamp = plugin.settings.workflow.autoAddTimestamp
		? ` 🛫 ${moment().format(
				plugin.settings.workflow.timestampFormat ||
					"YYYY-MM-DD HH:mm:ss"
		  )}`
		: "";
	const defaultIndentation = buildIndentString(plugin.app);

	// Create task text
	if (nextSubStage) {
		// Create a task with substage
		return `${indentation}- [ ] ${nextStage.name} (${nextSubStage.name}) [stage::${nextStage.id}.${nextSubStage.id}]${timestamp}`;
	} else {
		// Create task for main stage
		let taskText = `${indentation}- [ ] ${nextStage.name} [stage::${nextStage.id}]${timestamp}`;

		// Add subtask for first substage if this is a cycle stage with substages
		if (
			addSubtasks &&
			nextStage.type === "cycle" &&
			nextStage.subStages &&
			nextStage.subStages.length > 0
		) {
			const firstSubStage = nextStage.subStages[0];
			const subTaskIndentation = indentation + defaultIndentation;
			taskText += `\n${subTaskIndentation}- [ ] ${nextStage.name} (${firstSubStage.name}) [stage::${nextStage.id}.${firstSubStage.id}]${timestamp}`;
		}

		return taskText;
	}
}

/**
 * Determines the insertion point for a new workflow task
 * @param line The current line information
 * @param doc The document text
 * @param indentation The current line's indentation
 * @returns The position to insert the new task
 */
export function determineTaskInsertionPoint(
	line: { number: number; to: number; text: string },
	doc: Text,
	indentation: string
): number {
	// Default insertion point is after the current line
	let insertionPoint = line.to;

	// Check if there are child tasks by looking for lines with greater indentation
	const lineIndent = indentation.length;
	let lastChildLine = line.number;
	let foundChildren = false;

	// Look at the next 20 lines to find potential child tasks
	// This is a reasonable limit for most task hierarchies
	for (
		let i = line.number + 1;
		i <= Math.min(line.number + 20, doc.lines);
		i++
	) {
		const checkLine = doc.line(i);
		const checkIndentMatch = checkLine.text.match(/^([\s|\t]*)/);
		const checkIndent = checkIndentMatch ? checkIndentMatch[1].length : 0;

		// If this line has greater indentation, it's a child task
		if (checkIndent > lineIndent) {
			lastChildLine = i;
			foundChildren = true;
		}
		// If indentation is less than or equal and we've already found children,
		// we've moved out of the child tasks block
		else if (foundChildren) {
			break;
		}
	}

	// If we found child tasks, insert after the last child
	if (foundChildren) {
		insertionPoint = doc.line(lastChildLine).to;
	}

	return insertionPoint;
}
