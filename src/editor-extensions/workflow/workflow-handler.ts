import { App, Editor, moment } from "obsidian";
import {
	EditorState,
	Transaction,
	TransactionSpec,
	Text,
} from "@codemirror/state";
import { Annotation } from "@codemirror/state";
import TaskProgressBarPlugin from "@/index";
import { taskStatusChangeAnnotation } from "@/editor-extensions/task-operations/status-switcher";
import { priorityChangeAnnotation } from "@/editor-extensions/ui-widgets/priority-picker";
import { buildIndentString } from "@/utils";
// @ts-ignore
import { foldable } from "@codemirror/language";
import { t } from "@/translations/helper";
import { WorkflowDefinition, WorkflowStage } from "@/common/setting-definition";
import {
	convertTaskToWorkflowCommand,
	createQuickWorkflowCommand,
	startWorkflowHereCommand,
} from "@/commands/workflowCommands";

// Annotation that marks a transaction as a workflow change
export const workflowChangeAnnotation = Annotation.define<string>();

const WORKFLOW_TAG_REGEX = /#workflow\/([^\/\s]+)/;
const STAGE_MARKER_REGEX = /\[stage::([^\]]+)\]/;
const STAGE_MARKER_DISPLAY_REGEX = /\s*\[stage::[^\]]+\]/;
const TASK_REGEX = /^(\s*)([-*+]|\d+\.)\s+\[(.)]/;
const TIME_SPENT_REGEX = /\(⏱️\s+([0-9:]+)\)/;
const ROOT_STAGE_ID = "_root_task_";
const STAGE_SEPARATOR = ".";

type WorkflowSubStage = { id: string; name: string; next?: string };

export interface WorkflowInfo {
	workflowType: string;
	currentStage: string;
	subStage?: string;
}

export interface ResolvedWorkflowInfo {
	workflowType: string;
	currentStage: WorkflowStage;
	currentSubStage?: WorkflowSubStage;
	workflow: WorkflowDefinition;
	isRootTask: boolean;
}

interface WorkflowUpdate {
	lineNumber: number;
	lineText: string;
	resolvedInfo: ResolvedWorkflowInfo;
}

interface StageMarkerMatch extends RegExpMatchArray {
	index: number;
}

function getIndentation(text: string): string {
	const match = text.match(/^(\s*)/);
	return match ? match[1] : "";
}

function removeTrailingIndentation(
	indentation: string,
	app: App,
	levels: number = 1
): string {
	const indentUnit = buildIndentString(app);
	const removal = indentUnit.repeat(levels);

	if (indentation.endsWith(removal)) {
		return indentation.slice(
			0,
			Math.max(0, indentation.length - removal.length)
		);
	}

	// Fallback: remove whitespace characters equal to indentUnit length * levels
	const fallbackLength = indentUnit.length * levels;
	return indentation.slice(
		0,
		Math.max(0, indentation.length - fallbackLength)
	);
}

function ensureWithinBounds(lineNumber: number, doc: Text): number {
	if (lineNumber < 1) {
		return 1;
	}

	if (lineNumber > doc.lines) {
		return doc.lines;
	}

	return lineNumber;
}

function safelyFindStageMarker(lineText: string): StageMarkerMatch | null {
	const match = lineText.match(STAGE_MARKER_DISPLAY_REGEX);
	return match && typeof match.index === "number"
		? (match as StageMarkerMatch)
		: null;
}

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
export function extractWorkflowInfo(lineText: string): WorkflowInfo | null {
	const stageMatch = lineText.match(STAGE_MARKER_REGEX);

	if (stageMatch) {
		const stageId = stageMatch[1];

		if (stageId.includes(STAGE_SEPARATOR)) {
			const [stage, subStage] = stageId.split(STAGE_SEPARATOR);
			return {
				workflowType: "fromParent",
				currentStage: stage,
				subStage,
			};
		}

		return {
			workflowType: "fromParent",
			currentStage: stageId,
		};
	}

	const workflowMatch = lineText.match(WORKFLOW_TAG_REGEX);

	if (workflowMatch) {
		return {
			workflowType: workflowMatch[1],
			currentStage: "root",
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
	const safeLineNum = ensureWithinBounds(lineNum, doc);

	if (safeLineNum <= 1) {
		return null;
	}

	const currentLineIndex = safeLineNum - 1;
	const currentLine = doc.line(currentLineIndex + 1);
	const currentIndent = getIndentation(currentLine.text).length;

	for (let i = currentLineIndex; i >= 0; i--) {
		const line = doc.line(i + 1);
		const lineText = line.text;
		const indent = getIndentation(lineText).length;

		const workflowMatch = lineText.match(WORKFLOW_TAG_REGEX);
		if (workflowMatch) {
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
	const tsAnn = tr.annotation(taskStatusChangeAnnotation) as
		| string
		| undefined;
	if (
		tr.annotation(workflowChangeAnnotation) ||
		tr.annotation(priorityChangeAnnotation) ||
		tsAnn?.startsWith("workflowChange") ||
		tsAnn?.startsWith("autoDateManager")
	) {
		return tr;
	}

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

	const completedStatuses = plugin.settings.taskStatuses.completed.split("|");
	const isCompletionChange = (text: string) =>
		completedStatuses.includes(text) ||
		completedStatuses.some(
			(status) => text === `- [${status}]` || text === `[${status}]`
		);

	if (!changes.some((c) => isCompletionChange(c.text))) {
		return tr;
	}

	const workflowUpdates: WorkflowUpdate[] = [];

	for (const change of changes) {
		if (!isCompletionChange(change.text)) {
			continue;
		}

		const line = tr.newDoc.lineAt(change.fromB);
		const lineText = line.text;
		const taskMatch = lineText.match(TASK_REGEX);

		if (!taskMatch) {
			continue;
		}

		const resolvedInfo = resolveWorkflowInfo(
			lineText,
			tr.newDoc,
			line.number,
			plugin
		);

		if (resolvedInfo) {
			workflowUpdates.push({
				lineNumber: line.number,
				lineText,
				resolvedInfo,
			});
		}
	}

	// Check if there are existing changes from other transaction filters
	// (e.g., date manager) and adjust our calculations accordingly
	let existingChangeAdjustment = 0;
	let hasExistingChanges = false;

	tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
		// Calculate how much the document has grown from existing changes
		const insertedLength = inserted.length;
		const deletedLength = toA - fromA;
		existingChangeAdjustment += insertedLength - deletedLength;
		hasExistingChanges = true;
	});

	// Logging moved to where it's used

	const newChanges: { from: number; to: number; insert: string }[] = [];
	// Process each workflow update
	if (workflowUpdates.length > 0) {
		for (const update of workflowUpdates) {
			const { resolvedInfo, lineNumber, lineText } = update;
			const line = tr.newDoc.line(lineNumber);
			const {
				workflowType,
				currentStage,
				currentSubStage,
				workflow,
				isRootTask,
			} = resolvedInfo;

			if (!workflow.stages.length) {
				continue;
			}

			// Handle timestamp removal and time calculation
			const timeChanges = processTimestampAndCalculateTime(
				line.text,
				tr.newDoc,
				line.from,
				line.number,
				workflowType,
				plugin
			);

			// Adjust time change positions if there are existing changes
			const adjustedTimeChanges = timeChanges;

			for (const change of adjustedTimeChanges) {
				newChanges.push(change);
			}

			let stageRemovalChange: {
				from: number;
				to: number;
				insert: string;
			} | null = null;

			// Remove the [stage::] marker from the current line
			if (plugin.settings.workflow.autoRemoveLastStageMarker) {
				const stageMarker = safelyFindStageMarker(line.text);
				if (stageMarker) {
					let fromPos = line.from + stageMarker.index;
					let toPos =
						line.from + stageMarker.index + stageMarker[0].length;

					stageRemovalChange = {
						from: fromPos,
						to: toPos,
						insert: "",
					};
					newChanges.push(stageRemovalChange);
				}
			}

			if (currentStage.type === "terminal") {
				const indentation = getIndentation(line.text).length;
				const taskMatch = line.text.match(TASK_REGEX);

				if (!taskMatch) {
					continue;
				}

				const completedStatuses =
					plugin.settings.taskStatuses.completed.split("|");

				for (let i = lineNumber - 1; i >= 1; i--) {
					const checkLine = tr.newDoc.line(i);
					const checkIndent = getIndentation(checkLine.text).length;

					if (
						checkIndent < indentation &&
						checkLine.text.includes(`#workflow/${workflowType}`)
					) {
						const rootTaskMatch = checkLine.text.match(TASK_REGEX);
						if (rootTaskMatch) {
							const rootTaskStatus = rootTaskMatch[3];
							if (!completedStatuses.includes(rootTaskStatus)) {
								let rootTaskStart =
									checkLine.from +
									rootTaskMatch[0].indexOf("[");

								// Adjust positions if there are existing changes
								if (hasExistingChanges) {
									rootTaskStart = Math.max(
										0,
										rootTaskStart - existingChangeAdjustment
									);
								}

								newChanges.push({
									from: rootTaskStart + 1,
									to: rootTaskStart + 2,
									insert: "x",
								});
							}
						}
						break;
					}
				}
				continue;
			}

			const { nextStageId, nextSubStageId } = determineNextStage(
				currentStage,
				workflow,
				currentSubStage
			);

			// Guard: If completing a parent cycle stage (no currentSubStage) and there's no explicit
			// next main stage configured (nextStageId remains current), skip auto-creating the first
			// substage to avoid unintended child looping when advancing parent via menu.
			if (
				currentStage.type === "cycle" &&
				!currentSubStage &&
				nextStageId === currentStage.id
			) {
				// Optional debug
				console.debug(
					"[WorkflowHandler] Skip auto-substage creation for parent cycle stage completion",
					{ line: line.number, stage: currentStage.id }
				);
				continue;
			}

			const nextStage = workflow.stages.find((s) => s.id === nextStageId);
			if (!nextStage) continue;

			let nextSubStage: WorkflowSubStage | undefined;
			if (nextSubStageId && nextStage.subStages) {
				nextSubStage = nextStage.subStages.find(
					(ss) => ss.id === nextSubStageId
				);
			}

			const indentation = getIndentation(lineText);
			const defaultIndentation = buildIndentString(app);
			const newTaskIndentation = isRootTask
				? indentation + defaultIndentation
				: indentation;

			const completeTaskText = generateWorkflowTaskText(
				nextStage,
				newTaskIndentation,
				plugin,
				true,
				nextSubStage
			);

			const insertionPoint = determineTaskInsertionPoint(
				line,
				tr.newDoc,
				indentation
			);

			const insertionAdjustment = calculateInsertionAdjustment(
				insertionPoint,
				line.from,
				[
					...timeChanges,
					...(stageRemovalChange ? [stageRemovalChange] : []),
				]
			);

			// Calculate the adjusted insertion point
			let adjustedInsertionPoint = insertionPoint + insertionAdjustment;

			// Ensure the insertion point is within the new document bounds (after original changes)
			adjustedInsertionPoint = Math.min(
				adjustedInsertionPoint,
				tr.newDoc.length
			);
			adjustedInsertionPoint = Math.max(0, adjustedInsertionPoint);

			if (
				!(
					tr.annotation(taskStatusChangeAnnotation) ===
					"autoCompleteParent.DONE"
				)
			) {
				newChanges.push({
					from: adjustedInsertionPoint,
					to: adjustedInsertionPoint,
					insert: `\n${completeTaskText}`,
				});
			}
		}
	}

	if (newChanges.length > 0) {
		// Log only if processing with existing changes
		if (hasExistingChanges) {
			console.log(
				`[WorkflowHandler] Applied ${newChanges.length} changes (adjusted for existing changes)`
			);
		}

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
		const mappedNewChanges = newChanges.map((c) => ({
			from: inverse.mapPos(c.from, -1),
			to: inverse.mapPos(c.to, -1),
			insert: c.insert,
		}));
		return {
			changes: [...baseChangeSpecs, ...mappedNewChanges],
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
	const timestampToken = `🛫 ${moment().format(timestampFormat)}`;
	const timestampLength = timestampToken.length;
	const startMarkIndex = lineText.indexOf("🛫");

	if (startMarkIndex === -1) {
		return changes;
	}

	const endMarkIndex = startMarkIndex + timestampLength;
	const timestampText = lineText.substring(startMarkIndex, endMarkIndex);
	const startTime = moment(
		timestampText.replace("🛫 ", ""),
		timestampFormat,
		true
	);

	if (!startTime.isValid()) {
		return changes;
	}

	const endTime = moment();
	const duration = moment.duration(endTime.diff(startTime));
	const isFinalStage = isLastWorkflowStageOrNotWorkflow(
		lineText,
		lineNumber,
		doc,
		plugin
	);

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
		// Determine insertion position (before any stage marker)
		const stageMarkerIndex = lineText.indexOf("[stage::");
		const insertPosition =
			lineFrom +
			(stageMarkerIndex !== -1 ? stageMarkerIndex : lineText.length);

		// Guard: avoid duplicating local spent time if it already exists on the line
		if (!TIME_SPENT_REGEX.test(lineText)) {
			const spentTime = moment
				.utc(duration.asMilliseconds())
				.format(plugin.settings.workflow.spentTimeFormat);

			if (
				!isFinalStage ||
				!plugin.settings.workflow.calculateFullSpentTime
			) {
				changes.push({
					from: insertPosition,
					to: insertPosition,
					insert: ` (⏱️ ${spentTime})`,
				});
			}
		}

		// Calculate and add total time for final stage if enabled
		if (plugin.settings.workflow.calculateFullSpentTime && isFinalStage) {
			const workflowTag = `#workflow/${workflowType}`;
			let totalDuration = moment.duration(0);
			let foundStartTime = false;

			// Get current task indentation level
			const currentIndentLevel = getIndentation(lineText).length;

			// Look up to find the root task
			for (let i = lineNumber - 1; i >= 1; i--) {
				if (i > doc.lines) continue;

				const checkLine = doc.line(i);
				if (checkLine.text.includes(workflowTag)) {
					// Found root task, now look for all tasks with time spent markers
					for (let j = i; j <= lineNumber; j++) {
						if (j > doc.lines) continue;

						const taskLine = doc.line(j);

						const indentLevel = getIndentation(
							taskLine.text
						).length;

						if (indentLevel > currentIndentLevel) {
							continue;
						}

						const timeSpentMatch =
							taskLine.text.match(TIME_SPENT_REGEX);

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
					convertTaskToWorkflowCommand(
						false,
						editor,
						null as any,
						plugin
					);
				});
			});

			// Start workflow here
			submenu.addItem((startItem: any) => {
				startItem.setTitle(t("Start workflow here"));
				startItem.setIcon("play");
				startItem.onClick(() => {
					startWorkflowHereCommand(
						false,
						editor,
						null as any,
						plugin
					);
				});
			});

			// Quick workflow creation
			submenu.addItem((quickItem: any) => {
				quickItem.setTitle(t("Create quick workflow"));
				quickItem.setIcon("zap");
				quickItem.onClick(() => {
					createQuickWorkflowCommand(
						false,
						editor,
						null as any,
						plugin
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
							annotations: [
								taskStatusChangeAnnotation.of("workflowChange"),
								workflowChangeAnnotation.of("workflowChange"),
							],
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
								annotations: [
									taskStatusChangeAnnotation.of(
										isLastStage
											? "workflowChange.completeStage"
											: "workflowChange.moveToStage"
									),
									workflowChangeAnnotation.of(
										"workflowChange"
									),
								],
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
						annotations: [
							taskStatusChangeAnnotation.of("workflowChange"),
							workflowChangeAnnotation.of("workflowChange"),
						],
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
								annotations: [
									taskStatusChangeAnnotation.of(
										"workflowChange"
									),
									workflowChangeAnnotation.of(
										"workflowChange"
									),
								],
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
							annotations: [
								taskStatusChangeAnnotation.of("workflowChange"),
								workflowChangeAnnotation.of("workflowChange"),
							],
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
							annotations: [
								taskStatusChangeAnnotation.of("workflowChange"),
								workflowChangeAnnotation.of("workflowChange"),
							],
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
						annotations: [
							taskStatusChangeAnnotation.of("workflowChange"),
							workflowChangeAnnotation.of("workflowChange"),
						],
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
	const workflowInfo = extractWorkflowInfo(lineText);
	if (!workflowInfo) {
		return true;
	}

	let workflowType = workflowInfo.workflowType;
	let currentStageId = workflowInfo.currentStage;
	let currentSubStageId = workflowInfo.subStage;

	if (workflowType === "fromParent") {
		const safeLineNumber = ensureWithinBounds(lineNumber, doc);
		const parentWorkflow = findParentWorkflow(doc, safeLineNumber);

		if (!parentWorkflow) {
			return true;
		}
		workflowType = parentWorkflow;
	}

	const workflow = plugin.settings.workflow.definitions.find(
		(wf: WorkflowDefinition) => wf.id === workflowType
	);

	if (!workflow) {
		return true;
	}

	if (currentStageId === "root") {
		return false;
	}

	const currentStage = workflow.stages.find((s) => s.id === currentStageId);
	if (!currentStage) {
		return true;
	}

	if (currentStage.type === "terminal") {
		return true;
	}

	if (
		currentStage.type === "cycle" &&
		currentStage.subStages &&
		currentSubStageId
	) {
		const currentSubStage = currentStage.subStages.find(
			(ss) => ss.id === currentSubStageId
		);
		if (!currentSubStage) {
			return true;
		}

		const isLastSubStage = !currentSubStage.next;
		const parentStageCanProceed =
			currentStage.canProceedTo && currentStage.canProceedTo.length > 0;
		const parentStageHasLinearNext =
			typeof currentStage.next === "string" ||
			(Array.isArray(currentStage.next) && currentStage.next.length > 0);

		if (
			isLastSubStage &&
			!parentStageCanProceed &&
			!parentStageHasLinearNext
		) {
			const currentIndex = workflow.stages.findIndex(
				(s) => s.id === currentStage.id
			);
			if (currentIndex === workflow.stages.length - 1) {
				return true;
			}
		}
		return false;
	}

	const hasExplicitNext =
		currentStage.next ||
		(currentStage.canProceedTo && currentStage.canProceedTo.length > 0);
	if (hasExplicitNext) {
		return false;
	}

	const currentIndex = workflow.stages.findIndex(
		(s) => s.id === currentStage.id
	);
	if (currentIndex < 0) {
		return true;
	}
	if (currentIndex === workflow.stages.length - 1) {
		return true;
	}

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
	currentSubStage?: WorkflowSubStage
): { nextStageId: string; nextSubStageId?: string } {
	let nextStageId = currentStage.id;
	let nextSubStageId: string | undefined;

	if (currentStage.id === ROOT_STAGE_ID) {
		nextStageId = workflow.stages[0]?.id ?? currentStage.id;
		return { nextStageId, nextSubStageId };
	}

	if (currentStage.type === "terminal") {
		return { nextStageId, nextSubStageId };
	}

	if (currentStage.type === "cycle" && currentSubStage) {
		if (currentSubStage.next) {
			nextStageId = currentStage.id;
			nextSubStageId = currentSubStage.next;
			return { nextStageId, nextSubStageId };
		}

		if (currentStage.canProceedTo?.length) {
			nextStageId = currentStage.canProceedTo[0];
			return { nextStageId, nextSubStageId };
		}

		const subStageCount = currentStage.subStages?.length ?? 0;
		if (subStageCount === 1) {
			nextStageId = currentStage.id;
			nextSubStageId = currentSubStage.id;
		} else if (subStageCount > 1) {
			nextStageId = currentStage.id;
			nextSubStageId = currentStage.subStages![0].id;
		}
		return { nextStageId, nextSubStageId };
	}

	if (currentStage.type === "linear") {
		if (typeof currentStage.next === "string") {
			nextStageId = currentStage.next;
		} else if (
			Array.isArray(currentStage.next) &&
			currentStage.next.length
		) {
			nextStageId = currentStage.next[0];
		} else if (currentStage.canProceedTo?.length) {
			nextStageId = currentStage.canProceedTo[0];
		} else {
			const currentIndex = workflow.stages.findIndex(
				(stage) => stage.id === currentStage.id
			);
			if (
				currentIndex >= 0 &&
				currentIndex < workflow.stages.length - 1
			) {
				nextStageId = workflow.stages[currentIndex + 1].id;
			}
		}
		return { nextStageId, nextSubStageId };
	}

	if (currentStage.type === "cycle") {
		if (currentStage.canProceedTo?.length) {
			nextStageId = currentStage.canProceedTo[0];
		}
		return { nextStageId, nextSubStageId };
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
	nextSubStage?: WorkflowSubStage,
	currentSubStage?: WorkflowSubStage
) {
	const doc = editor.cm.state.doc;
	const app = plugin.app;

	const safeLineNumber = ensureWithinBounds(lineNumber + 1, doc);
	const lineStart = doc.line(safeLineNumber);

	const defaultIndentation = buildIndentString(app);
	let indentation = getIndentation(line);
	if (isRootTask) {
		indentation += defaultIndentation;
	}

	const changes: { from: number; to: number; insert: string }[] = [];
	const isFinalStage = isLastWorkflowStageOrNotWorkflow(
		line,
		lineNumber,
		doc,
		plugin
	);

	const taskMatch = line.match(TASK_REGEX);
	if (taskMatch) {
		const taskStart = lineStart.from + taskMatch[0].indexOf("[");
		changes.push({
			from: taskStart + 1,
			to: taskStart + 2,
			insert: "x",
		});
	}

	let workflowType = "";
	const workflowTagMatch = line.match(WORKFLOW_TAG_REGEX);
	if (workflowTagMatch) {
		workflowType = workflowTagMatch[1];
	} else {
		workflowType =
			findParentWorkflow(doc, safeLineNumber) ||
			nextStage.id.split(STAGE_SEPARATOR)[0];
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
	if (currentSubStage && !nextSubStage && !isFinalStage) {
		const stageMarker = safelyFindStageMarker(line);
		if (stageMarker && plugin.settings.workflow.autoRemoveLastStageMarker) {
			changes.push({
				from: lineStart.from + stageMarker.index,
				to: lineStart.from + stageMarker.index + stageMarker[0].length,
				insert: "",
			});
		}

		indentation = removeTrailingIndentation(indentation, app);
	}

	if (!isFinalStage) {
		const newTaskText = generateWorkflowTaskText(
			nextStage,
			indentation,
			plugin,
			true,
			nextSubStage
		);

		// Add the new task after the current line
		// Ensure the insertion point is within document bounds
		const insertPoint = Math.min(lineStart.to, doc.length);
		changes.push({
			from: insertPoint,
			to: insertPoint,
			insert: `\n${newTaskText}`,
		});
	}

	// Remove stage marker from current line if setting enabled
	if (plugin?.settings.workflow.autoRemoveLastStageMarker) {
		const stageMarker = safelyFindStageMarker(line);
		if (stageMarker) {
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
	currentSubStage?: WorkflowSubStage;
	workflow: WorkflowDefinition;
	isRootTask: boolean;
} | null {
	const workflowInfo = extractWorkflowInfo(lineText);
	if (!workflowInfo) {
		return null;
	}

	let workflowType = workflowInfo.workflowType;
	let stageId = workflowInfo.currentStage;
	let subStageId = workflowInfo.subStage;

	if (workflowType === "fromParent") {
		const safeLineNumber = ensureWithinBounds(lineNumber, doc);
		const parentWorkflow = findParentWorkflow(doc, safeLineNumber);

		if (!parentWorkflow) {
			return null;
		}
		workflowType = parentWorkflow;
	}

	const workflow = plugin.settings.workflow.definitions.find(
		(wf: WorkflowDefinition) => wf.id === workflowType
	);
	if (!workflow) {
		return null;
	}

	const isRootTask =
		stageId === "root" ||
		(lineText.includes(`#workflow/${workflowType}`) &&
			!lineText.includes("[stage::"));

	let currentStage: WorkflowStage;

	if (stageId === "root" || isRootTask) {
		currentStage = {
			id: ROOT_STAGE_ID,
			name: "Root Task",
			type: "linear",
			next:
				workflow.stages.length > 0 ? workflow.stages[0].id : undefined,
		};
	} else {
		const foundStage = workflow.stages.find((s) => s.id === stageId);
		if (!foundStage) {
			return null;
		}
		currentStage = foundStage;
	}

	let currentSubStage: WorkflowSubStage | undefined;
	if (subStageId && currentStage.subStages) {
		currentSubStage = currentStage.subStages.find(
			(ss) => ss.id === subStageId
		);
	}

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
 * @returns The generated task text
 */
export function generateWorkflowTaskText(
	nextStage: WorkflowStage,
	indentation: string,
	plugin: TaskProgressBarPlugin,
	addSubtasks: boolean = true,
	nextSubStage?: WorkflowSubStage
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
		return `${indentation}- [ ] ${nextStage.name} (${nextSubStage.name}) [stage::${nextStage.id}${STAGE_SEPARATOR}${nextSubStage.id}]${timestamp}`;
	}

	let taskText = `${indentation}- [ ] ${nextStage.name} [stage::${nextStage.id}]${timestamp}`;

	if (
		addSubtasks &&
		nextStage.type === "cycle" &&
		nextStage.subStages &&
		nextStage.subStages.length > 0
	) {
		const firstSubStage = nextStage.subStages[0];
		const subTaskIndentation = indentation + defaultIndentation;
		taskText += `\n${subTaskIndentation}- [ ] ${nextStage.name} (${firstSubStage.name}) [stage::${nextStage.id}${STAGE_SEPARATOR}${firstSubStage.id}]${timestamp}`;
	}

	return taskText;
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

	// Validate that the initial insertion point is within bounds
	if (insertionPoint > doc.length) {
		insertionPoint = doc.length;
	}

	// Check if there are child tasks by looking for lines with greater indentation
	const lineIndent = indentation.length;
	let lastChildLine = line.number;
	let foundChildren = false;

	// Look at the next 20 lines to find potential child tasks
	// This is a reasonable limit for most task hierarchies
	const maxSearchLine = Math.min(line.number + 20, doc.lines);

	for (let i = line.number + 1; i <= maxSearchLine; i++) {
		// Ensure the line number is valid
		if (i > doc.lines) {
			break;
		}

		const checkLine = doc.line(i);
		const checkIndent = getIndentation(checkLine.text).length;

		if (checkIndent > lineIndent) {
			lastChildLine = i;
			foundChildren = true;
		} else if (foundChildren) {
			break;
		}
	}

	// If we found child tasks, insert after the last child
	if (foundChildren && lastChildLine <= doc.lines) {
		const lastChild = doc.line(lastChildLine);
		insertionPoint = lastChild.to;

		// Ensure the insertion point doesn't exceed document bounds
		if (insertionPoint > doc.length) {
			insertionPoint = doc.length;
		}
	}

	return insertionPoint;
}

function calculateInsertionAdjustment(
	baseInsertionPoint: number,
	lineStart: number,
	changes: { from: number; to: number; insert: string }[]
): number {
	let adjustment = 0;

	// Sort changes by position (descending) to process from end to beginning
	const sortedChanges = [...changes].sort((a, b) => b.from - a.from);

	for (const change of sortedChanges) {
		const changeStart = change.from;
		const changeEnd = change.to ?? change.from;

		// Only consider changes that occur before the insertion point
		// This accounts for ALL changes that affect the insertion position
		if (changeStart >= baseInsertionPoint) {
			continue;
		}

		const insertedLength = change.insert ? change.insert.length : 0;
		const removedLength = changeEnd - changeStart;

		// If the change ends before the insertion point, adjust by the full amount
		if (changeEnd <= baseInsertionPoint) {
			adjustment += insertedLength - removedLength;
		} else {
			// If the change partially overlaps, only adjust by the part before insertion point
			const effectiveRemovedLength = baseInsertionPoint - changeStart;
			adjustment += insertedLength - effectiveRemovedLength;
		}
	}

	return adjustment;
}
