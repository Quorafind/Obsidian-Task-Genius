import { EditorView } from "@codemirror/view";
import { App, editorInfoField, Menu } from "obsidian";
import TaskProgressBarPlugin from "../index";
import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import {
	extractWorkflowInfo,
	resolveWorkflowInfo,
	determineNextStage,
	generateWorkflowTaskText,
	createWorkflowStageTransition,
} from "./workflow";
import { t } from "../translations/helper";
import { buildIndentString } from "../utils";
import { taskStatusChangeAnnotation } from "./taskStatusSwitcher";

/**
 * Show workflow menu at cursor position
 * @param view The editor view
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @param lineNumber The line number where the menu should appear
 * @param workflowInfo The workflow information for the current line
 */
function showWorkflowMenu(
	view: EditorView,
	app: App,
	plugin: TaskProgressBarPlugin,
	lineNumber: number,
	workflowInfo: {
		workflowType: string;
		currentStage: string;
		subStage?: string;
	}
): void {
	const menu = new Menu();
	const line = view.state.doc.line(lineNumber);
	const lineText = line.text;

	// Resolve complete workflow information
	const resolvedInfo = resolveWorkflowInfo(
		lineText,
		view.state.doc,
		lineNumber,
		plugin
	);

	if (!resolvedInfo) {
		return;
	}

	const { currentStage, currentSubStage, workflow, isRootTask } =
		resolvedInfo;

	// Handle different workflow states
	if (workflowInfo.currentStage === "root" || isRootTask) {
		// Root workflow task options
		menu.addItem((item) => {
			item.setTitle(t("Start workflow"))
				.setIcon("play")
				.onClick(() => {
					startWorkflow(view, app, plugin, lineNumber);
				});
		});
	} else {
		// Stage task options - show next stage transitions
		if (currentStage.id === "_root_task_") {
			if (workflow.stages.length > 0) {
				const firstStage = workflow.stages[0];
				menu.addItem((item) => {
					item.setTitle(`${t("Move to stage")} ${firstStage.name}`)
						.setIcon("arrow-right")
						.onClick(() => {
							moveToNextStage(
								view,
								app,
								plugin,
								lineNumber,
								firstStage,
								true
							);
						});
				});
			}
		} else if (currentStage.canProceedTo) {
			currentStage.canProceedTo.forEach((nextStageId) => {
				const nextStage = workflow.stages.find(
					(s) => s.id === nextStageId
				);
				if (nextStage) {
					menu.addItem((item) => {
						item.setTitle(`${t("Move to stage")} ${nextStage.name}`)
							.setIcon("arrow-right")
							.onClick(() => {
								moveToNextStage(
									view,
									app,
									plugin,
									lineNumber,
									nextStage,
									false
								);
							});
					});
				}
			});
		} else if (currentStage.type === "terminal") {
			menu.addItem((item) => {
				item.setTitle(t("Complete workflow"))
					.setIcon("check")
					.onClick(() => {
						completeWorkflow(view, app, plugin, lineNumber);
					});
			});
		} else {
			// Use determineNextStage to find the next stage
			const { nextStageId, nextSubStageId } = determineNextStage(
				currentStage,
				workflow,
				currentSubStage
			);

			if (nextStageId) {
				const nextStage = workflow.stages.find(
					(s) => s.id === nextStageId
				);
				if (nextStage) {
					// Determine the menu title based on the transition type
					let menuTitle: string;

					if (
						nextStageId === currentStage.id &&
						nextSubStageId === currentSubStage?.id
					) {
						// Same stage and substage - cycling the same substage
						menuTitle = `${t("Continue")} ${nextStage.name}${
							nextSubStageId ? ` (${currentSubStage?.name})` : ""
						}`;
					} else if (
						nextStageId === currentStage.id &&
						nextSubStageId
					) {
						// Same stage but different substage
						const nextSubStage = nextStage.subStages?.find(
							(ss) => ss.id === nextSubStageId
						);
						menuTitle = `${t("Move to")} ${nextStage.name} (${
							nextSubStage?.name || nextSubStageId
						})`;
					} else {
						// Different stage
						menuTitle = `${t("Move to")} ${nextStage.name}`;
					}

					menu.addItem((item) => {
						item.setTitle(menuTitle)
							.setIcon("arrow-right")
							.onClick(() => {
								moveToNextStageWithSubStage(
									view,
									app,
									plugin,
									lineNumber,
									nextStage,
									false,
									nextSubStageId
										? nextStage.subStages?.find(
												(ss) => ss.id === nextSubStageId
										  )
										: undefined,
									currentSubStage
								);
							});
					});
				}
			}
		}

		// Add child task with same stage option
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("Add child task with same stage"))
				.setIcon("plus-circle")
				.onClick(() => {
					addChildTaskWithSameStage(
						view,
						app,
						plugin,
						lineNumber,
						currentStage,
						currentSubStage
					);
				});
		});
	}

	// Common options for all workflow tasks
	menu.addSeparator();

	// Add new task option (same level)
	menu.addItem((item) => {
		item.setTitle(t("Add new task"))
			.setIcon("plus")
			.onClick(() => {
				addNewSiblingTask(view, app, lineNumber);
			});
	});

	// Add new sub-task option
	menu.addItem((item) => {
		item.setTitle(t("Add new sub-task"))
			.setIcon("plus-circle")
			.onClick(() => {
				addNewSubTask(view, app, lineNumber);
			});
	});

	// Calculate menu position based on cursor
	const selection = view.state.selection.main;
	const coords = view.coordsAtPos(selection.head);

	if (coords) {
		// Show menu at cursor position
		menu.showAtPosition({ x: coords.left, y: coords.bottom });
	} else {
		// Fallback to mouse position
		menu.showAtMouseEvent(window.event as MouseEvent);
	}
}

/**
 * Add a new sibling task after the current line (same indentation level)
 * @param view The editor view
 * @param app The Obsidian app instance
 * @param lineNumber The current line number
 */
function addNewSiblingTask(
	view: EditorView,
	app: App,
	lineNumber: number
): void {
	const line = view.state.doc.line(lineNumber);
	const indentMatch = line.text.match(/^([\s|\t]*)/);
	const indentation = indentMatch ? indentMatch[1] : "";

	// Insert a new task at the same indentation level
	view.dispatch({
		changes: {
			from: line.to,
			to: line.to,
			insert: `\n${indentation}- [ ] `,
		},
		selection: {
			anchor: line.to + indentation.length + 7, // Position cursor after "- [ ] "
		},
	});

	// Focus the editor
	view.focus();
}

/**
 * Add a new sub-task after the current line (indented)
 * @param view The editor view
 * @param app The Obsidian app instance
 * @param lineNumber The current line number
 */
function addNewSubTask(view: EditorView, app: App, lineNumber: number): void {
	const line = view.state.doc.line(lineNumber);
	const indentMatch = line.text.match(/^([\s|\t]*)/);
	const indentation = indentMatch ? indentMatch[1] : "";
	const defaultIndentation = buildIndentString(app);
	const newTaskIndentation = indentation + defaultIndentation;

	// Insert a new sub-task with additional indentation
	view.dispatch({
		changes: {
			from: line.to,
			to: line.to,
			insert: `\n${newTaskIndentation}- [ ] `,
		},
		selection: {
			anchor: line.to + newTaskIndentation.length + 7, // Position cursor after "- [ ] "
		},
	});

	// Focus the editor
	view.focus();
}

/**
 * Start the workflow by creating the first stage task
 * @param view The editor view
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @param lineNumber The current line number
 */
function startWorkflow(
	view: EditorView,
	app: App,
	plugin: TaskProgressBarPlugin,
	lineNumber: number
): void {
	const line = view.state.doc.line(lineNumber);
	const lineText = line.text;

	// Extract workflow information
	const workflowInfo = extractWorkflowInfo(lineText);
	if (!workflowInfo) {
		return;
	}

	// Resolve complete workflow information
	const resolvedInfo = resolveWorkflowInfo(
		lineText,
		view.state.doc,
		lineNumber,
		plugin
	);

	if (!resolvedInfo || !resolvedInfo.workflow.stages.length) {
		return;
	}

	const { workflow } = resolvedInfo;
	const firstStage = workflow.stages[0];

	// Get indentation
	const indentMatch = lineText.match(/^([\s|\t]*)/);
	const indentation = indentMatch ? indentMatch[1] : "";
	const defaultIndentation = buildIndentString(app);
	const newTaskIndentation = indentation + defaultIndentation;

	// Create task text for the first stage
	const timestamp = plugin.settings.workflow.autoAddTimestamp
		? ` 🛫 ${new Date().toISOString().slice(0, 19).replace("T", " ")}`
		: "";

	let newTaskText = `${newTaskIndentation}- [ ] ${firstStage.name} [stage::${firstStage.id}]${timestamp}`;

	// Add subtask for first substage if this is a cycle stage with substages
	if (
		firstStage.type === "cycle" &&
		firstStage.subStages &&
		firstStage.subStages.length > 0
	) {
		const firstSubStage = firstStage.subStages[0];
		const subTaskIndentation = newTaskIndentation + defaultIndentation;
		newTaskText += `\n${subTaskIndentation}- [ ] ${firstStage.name} (${firstSubStage.name}) [stage::${firstStage.id}.${firstSubStage.id}]${timestamp}`;
	}

	// Insert the new task after the current line and move cursor to it
	const insertText = `\n${newTaskText}`;
	const newTaskLineStart = line.to + 1; // Start of the new line
	const cursorPosition = newTaskLineStart + newTaskIndentation.length + 7; // Position after "- [ ] "

	view.dispatch({
		changes: {
			from: line.to,
			to: line.to,
			insert: insertText,
		},
		selection: {
			anchor: cursorPosition,
		},
	});

	// Focus the editor
	view.focus();
}

/**
 * Creates an editor extension that handles Enter key for workflow root tasks
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @returns An editor extension that can be registered with the plugin
 */
export function workflowRootEnterHandlerExtension(
	app: App,
	plugin: TaskProgressBarPlugin
) {
	// Don't enable if workflow feature is disabled
	if (!plugin.settings.workflow.enableWorkflow) {
		return [];
	}

	const keymapExtension = Prec.high(
		keymap.of([
			{
				key: "Enter",
				run: (view: EditorView) => {
					// Get current cursor position
					const selection = view.state.selection.main;
					const line = view.state.doc.lineAt(selection.head);
					const lineText = line.text;

					// Check if this is a workflow root task
					const taskRegex = /^([\s|\t]*)([-*+]|\d+\.)\s+\[(.)]/;
					const taskMatch = lineText.match(taskRegex);

					if (!taskMatch) {
						return false; // Not a task, allow default behavior
					}

					// Check if this task has a workflow tag or stage marker
					const workflowInfo = extractWorkflowInfo(lineText);
					if (!workflowInfo) {
						return false; // Not a workflow task, allow default behavior
					}

					// Check if cursor is at the end of the line
					if (selection.head !== line.to) {
						return false; // Not at end of line, allow default behavior
					}

					// Show the workflow menu
					showWorkflowMenu(
						view,
						app,
						plugin,
						line.number,
						workflowInfo
					);

					return true; // Prevent default Enter behavior
				},
			},
		])
	);

	return [keymapExtension];
}

/**
 * Move to the next stage in workflow with substage support
 * @param view The editor view
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @param lineNumber The current line number
 * @param nextStage The next stage to move to
 * @param isRootTask Whether this is a root task
 * @param nextSubStage The next substage to move to
 * @param currentSubStage The current substage
 */
function moveToNextStageWithSubStage(
	view: EditorView,
	app: App,
	plugin: TaskProgressBarPlugin,
	lineNumber: number,
	nextStage: any,
	isRootTask: boolean,
	nextSubStage?: any,
	currentSubStage?: any
): void {
	const doc = view.state.doc;
	const line = doc.line(lineNumber);
	const lineText = line.text;

	// Validate that the line exists and is within document bounds
	if (lineNumber > doc.lines || lineNumber < 1) {
		console.warn(
			`Invalid line number: ${lineNumber}, doc has ${doc.lines} lines`
		);
		return;
	}

	// Create a mock Editor object that wraps the EditorView
	const editor = view.state.field(editorInfoField)?.editor;

	if (!editor) {
		console.warn("Editor not found");
		return;
	}

	// Use the existing createWorkflowStageTransition function
	const changes = createWorkflowStageTransition(
		plugin,
		editor,
		lineText,
		lineNumber - 1, // Convert to 0-based line number for the function
		nextStage,
		isRootTask,
		nextSubStage,
		currentSubStage
	);

	// Calculate cursor position for the new task
	let cursorPosition = line.to; // Default to end of current line

	// Find the insertion point for the new task from the changes
	const insertChange = changes.find(
		(change) => change.insert && change.insert.includes("- [ ]")
	);

	if (insertChange) {
		// Calculate position after the new task marker "- [ ] "
		const indentMatch = lineText.match(/^([\s|\t]*)/);
		const indentation = indentMatch ? indentMatch[1] : "";
		const defaultIndentation = buildIndentString(app);
		const newTaskIndentation =
			indentation + (isRootTask ? defaultIndentation : "");

		// Position after the insertion point + newline + indentation + "- [ ] "
		cursorPosition = insertChange.from + 1 + newTaskIndentation.length + 6;
	}

	// Apply all changes in a single transaction
	view.dispatch({
		changes,
		selection: {
			anchor: cursorPosition,
		},
		annotations: taskStatusChangeAnnotation.of("workflowChange"),
	});

	view.focus();
}

/**
 * Move to the next stage in workflow
 * @param view The editor view
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @param lineNumber The current line number
 * @param nextStage The next stage to move to
 * @param isRootTask Whether this is a root task
 */
function moveToNextStage(
	view: EditorView,
	app: App,
	plugin: TaskProgressBarPlugin,
	lineNumber: number,
	nextStage: any,
	isRootTask: boolean
): void {
	const doc = view.state.doc;
	const line = doc.line(lineNumber);
	const lineText = line.text;

	// Validate that the line exists and is within document bounds
	if (lineNumber > doc.lines || lineNumber < 1) {
		console.warn(
			`Invalid line number: ${lineNumber}, doc has ${doc.lines} lines`
		);
		return;
	}

	// Create a mock Editor object that wraps the EditorView
	const editor = view.state.field(editorInfoField)?.editor;

	if (!editor) {
		console.warn("Editor not found");
		return;
	}

	// Use the existing createWorkflowStageTransition function
	const changes = createWorkflowStageTransition(
		plugin,
		editor,
		lineText,
		lineNumber - 1, // Convert to 0-based line number for the function
		nextStage,
		isRootTask,
		undefined, // nextSubStage
		undefined // currentSubStage
	);

	// Calculate cursor position for the new task
	let cursorPosition = line.to; // Default to end of current line

	// Find the insertion point for the new task from the changes
	const insertChange = changes.find(
		(change) => change.insert && change.insert.includes("- [ ]")
	);

	if (insertChange) {
		// Calculate position after the new task marker "- [ ] "
		const indentMatch = lineText.match(/^([\s|\t]*)/);
		const indentation = indentMatch ? indentMatch[1] : "";
		const defaultIndentation = buildIndentString(app);
		const newTaskIndentation =
			indentation + (isRootTask ? defaultIndentation : "");

		// Position after the insertion point + newline + indentation + "- [ ] "
		cursorPosition = insertChange.from + 1 + newTaskIndentation.length + 6;
	}

	// Apply all changes in a single transaction
	view.dispatch({
		changes,
		selection: {
			anchor: cursorPosition,
		},
		annotations: taskStatusChangeAnnotation.of("workflowChange"),
	});

	view.focus();
}

/**
 * Complete the workflow
 * @param view The editor view
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @param lineNumber The current line number
 */
function completeWorkflow(
	view: EditorView,
	app: App,
	plugin: TaskProgressBarPlugin,
	lineNumber: number
): void {
	const line = view.state.doc.line(lineNumber);
	const taskRegex = /^([\s|\t]*)([-*+]|\d+\.)\s+\[(.)]/;
	const taskMatch = line.text.match(taskRegex);

	if (taskMatch) {
		const taskStart = line.from + taskMatch[0].indexOf("[");
		view.dispatch({
			changes: {
				from: taskStart + 1,
				to: taskStart + 2,
				insert: "x",
			},
		});
	}

	view.focus();
}

/**
 * Add a child task with the same stage
 * @param view The editor view
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @param lineNumber The current line number
 * @param currentStage The current stage
 * @param currentSubStage The current substage
 */
function addChildTaskWithSameStage(
	view: EditorView,
	app: App,
	plugin: TaskProgressBarPlugin,
	lineNumber: number,
	currentStage: any,
	currentSubStage?: any
): void {
	const line = view.state.doc.line(lineNumber);
	const indentMatch = line.text.match(/^([\s|\t]*)/);
	const indentation = indentMatch ? indentMatch[1] : "";
	const defaultIndentation = buildIndentString(app);
	const newTaskIndentation = indentation + defaultIndentation;

	// Create task text with the same stage
	const newTaskText = generateWorkflowTaskText(
		currentStage,
		newTaskIndentation,
		plugin,
		false,
		currentSubStage
	);

	// Insert the new task after the current line
	view.dispatch({
		changes: {
			from: line.to,
			to: line.to,
			insert: `\n${newTaskText}`,
		},
		selection: {
			anchor: line.to + newTaskIndentation.length + 7,
		},
	});

	view.focus();
}
