import { Editor, MarkdownView, MarkdownFileInfo, Notice, Menu } from "obsidian";
import TaskProgressBarPlugin from "../index";
import { QuickWorkflowModal } from "../components/QuickWorkflowModal";
import { WorkflowDefinitionModal } from "../components/WorkflowDefinitionModal";
import {
	analyzeTaskStructure,
	convertTaskStructureToWorkflow,
	createWorkflowStartingTask,
	convertCurrentTaskToWorkflowRoot,
	suggestWorkflowFromExisting,
} from "../utils/workflowConversion";
import { t } from "../translations/helper";

/**
 * Command to create a quick workflow
 */
export function createQuickWorkflowCommand(
	checking: boolean,
	editor: Editor,
	ctx: MarkdownView | MarkdownFileInfo,
	plugin: TaskProgressBarPlugin
): boolean {
	if (checking) {
		return plugin.settings.workflow.enableWorkflow;
	}

	new QuickWorkflowModal(plugin.app, plugin, (workflow) => {
		// Add the workflow to settings
		plugin.settings.workflow.definitions.push(workflow);
		plugin.saveSettings();
		new Notice(t("Workflow created successfully"));
	}).open();

	return true;
}

/**
 * Command to convert current task structure to workflow template
 */
export function convertTaskToWorkflowCommand(
	checking: boolean,
	editor: Editor,
	ctx: MarkdownView | MarkdownFileInfo,
	plugin: TaskProgressBarPlugin
): boolean {
	if (checking) {
		if (!plugin.settings.workflow.enableWorkflow) return false;
		
		// Check if cursor is on or near a task
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		return line.match(/^\s*[-*+] \[(.)\]/) !== null;
	}

	const cursor = editor.getCursor();
	const structure = analyzeTaskStructure(editor, cursor);
	
	if (!structure || !structure.isTask) {
		new Notice(t("No task structure found at cursor position"));
		return false;
	}

	// Check for existing similar workflows
	const suggestion = suggestWorkflowFromExisting(
		structure,
		plugin.settings.workflow.definitions
	);

	if (suggestion) {
		// Show a choice between using existing pattern or creating new
		const menu = new Menu();
		
		menu.addItem((item) => {
			item.setTitle(t("Use similar existing workflow"))
				.setIcon("copy")
				.onClick(() => {
					createWorkflowFromStructure(structure, suggestion.name, suggestion.id, plugin);
				});
		});

		menu.addItem((item) => {
			item.setTitle(t("Create new workflow"))
				.setIcon("plus")
				.onClick(() => {
					promptForWorkflowDetails(structure, plugin);
				});
		});

		menu.showAtMouseEvent(window.event as MouseEvent);
	} else {
		promptForWorkflowDetails(structure, plugin);
	}

	return true;
}

/**
 * Command to start a workflow at current position
 */
export function startWorkflowHereCommand(
	checking: boolean,
	editor: Editor,
	ctx: MarkdownView | MarkdownFileInfo,
	plugin: TaskProgressBarPlugin
): boolean {
	if (checking) {
		return plugin.settings.workflow.enableWorkflow && 
			   plugin.settings.workflow.definitions.length > 0;
	}

	const workflows = plugin.settings.workflow.definitions;
	
	if (workflows.length === 0) {
		new Notice(t("No workflows defined. Create a workflow first."));
		return false;
	}

	if (workflows.length === 1) {
		// If only one workflow, use it directly
		const cursor = editor.getCursor();
		createWorkflowStartingTask(editor, cursor, workflows[0], plugin);
		new Notice(t("Workflow task created"));
	} else {
		// Show workflow selection menu
		const menu = new Menu();
		
		workflows.forEach((workflow) => {
			menu.addItem((item) => {
				item.setTitle(workflow.name)
					.setIcon("workflow")
					.onClick(() => {
						const cursor = editor.getCursor();
						createWorkflowStartingTask(editor, cursor, workflow, plugin);
						new Notice(t("Workflow task created"));
					});
			});
		});

		menu.showAtMouseEvent(window.event as MouseEvent);
	}

	return true;
}

/**
 * Command to convert current task to workflow root
 */
export function convertToWorkflowRootCommand(
	checking: boolean,
	editor: Editor,
	ctx: MarkdownView | MarkdownFileInfo,
	plugin: TaskProgressBarPlugin
): boolean {
	if (checking) {
		if (!plugin.settings.workflow.enableWorkflow) return false;
		
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const taskMatch = line.match(/^\s*[-*+] \[(.)\]/);
		
		// Check if it's a task and doesn't already have a workflow tag
		return taskMatch !== null && !line.includes("#workflow/");
	}

	const workflows = plugin.settings.workflow.definitions;
	
	if (workflows.length === 0) {
		new Notice(t("No workflows defined. Create a workflow first."));
		return false;
	}

	const cursor = editor.getCursor();
	
	if (workflows.length === 1) {
		// If only one workflow, use it directly
		const success = convertCurrentTaskToWorkflowRoot(editor, cursor, workflows[0].id);
		if (success) {
			new Notice(t("Task converted to workflow root"));
		} else {
			new Notice(t("Failed to convert task"));
		}
	} else {
		// Show workflow selection menu
		const menu = new Menu();
		
		workflows.forEach((workflow) => {
			menu.addItem((item) => {
				item.setTitle(workflow.name)
					.setIcon("workflow")
					.onClick(() => {
						const success = convertCurrentTaskToWorkflowRoot(editor, cursor, workflow.id);
						if (success) {
							new Notice(t("Task converted to workflow root"));
						} else {
							new Notice(t("Failed to convert task"));
						}
					});
			});
		});

		menu.showAtMouseEvent(window.event as MouseEvent);
	}

	return true;
}

/**
 * Command to duplicate an existing workflow
 */
export function duplicateWorkflowCommand(
	checking: boolean,
	editor: Editor,
	ctx: MarkdownView | MarkdownFileInfo,
	plugin: TaskProgressBarPlugin
): boolean {
	if (checking) {
		return plugin.settings.workflow.enableWorkflow && 
			   plugin.settings.workflow.definitions.length > 0;
	}

	const workflows = plugin.settings.workflow.definitions;
	
	if (workflows.length === 0) {
		new Notice(t("No workflows to duplicate"));
		return false;
	}

	// Show workflow selection menu for duplication
	const menu = new Menu();
	
	workflows.forEach((workflow) => {
		menu.addItem((item) => {
			item.setTitle(t("Duplicate") + ": " + workflow.name)
				.setIcon("copy")
				.onClick(() => {
					const duplicatedWorkflow = {
						...workflow,
						id: workflow.id + "_copy",
						name: workflow.name + " (Copy)",
						metadata: {
							...workflow.metadata,
							created: new Date().toISOString().split("T")[0],
							lastModified: new Date().toISOString().split("T")[0],
						}
					};

					// Open the workflow definition modal for editing
					new WorkflowDefinitionModal(
						plugin.app,
						plugin,
						duplicatedWorkflow,
						(editedWorkflow) => {
							plugin.settings.workflow.definitions.push(editedWorkflow);
							plugin.saveSettings();
							new Notice(t("Workflow duplicated and saved"));
						}
					).open();
				});
		});
	});

	menu.showAtMouseEvent(window.event as MouseEvent);
	return true;
}

/**
 * Helper function to prompt for workflow details
 */
function promptForWorkflowDetails(structure: any, plugin: TaskProgressBarPlugin) {
	// Create a simple prompt for workflow name
	const workflowName = structure.content + " Workflow";
	const workflowId = workflowName
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, "")
		.replace(/\s+/g, "_")
		.substring(0, 30);

	createWorkflowFromStructure(structure, workflowName, workflowId, plugin);
}

/**
 * Helper function to create workflow from structure
 */
function createWorkflowFromStructure(
	structure: any,
	name: string,
	id: string,
	plugin: TaskProgressBarPlugin
) {
	const workflow = convertTaskStructureToWorkflow(structure, name, id);
	
	// Open the workflow definition modal for review and editing
	new WorkflowDefinitionModal(
		plugin.app,
		plugin,
		workflow,
		(finalWorkflow) => {
			plugin.settings.workflow.definitions.push(finalWorkflow);
			plugin.saveSettings();
			new Notice(t("Workflow created from task structure"));
		}
	).open();
}

/**
 * Command to show workflow quick actions menu
 */
export function showWorkflowQuickActionsCommand(
	checking: boolean,
	editor: Editor,
	ctx: MarkdownView | MarkdownFileInfo,
	plugin: TaskProgressBarPlugin
): boolean {
	if (checking) {
		return plugin.settings.workflow.enableWorkflow;
	}

	const menu = new Menu();

	// Quick workflow creation
	menu.addItem((item) => {
		item.setTitle(t("Create Quick Workflow"))
			.setIcon("plus-circle")
			.onClick(() => {
				createQuickWorkflowCommand(false, editor, ctx, plugin);
			});
	});

	// Convert task to workflow
	const cursor = editor.getCursor();
	const line = editor.getLine(cursor.line);
	if (line.match(/^\s*[-*+] \[(.)\]/)) {
		menu.addItem((item) => {
			item.setTitle(t("Convert Task to Workflow"))
				.setIcon("convert")
				.onClick(() => {
					convertTaskToWorkflowCommand(false, editor, ctx, plugin);
				});
		});

		if (!line.includes("#workflow/")) {
			menu.addItem((item) => {
				item.setTitle(t("Convert to Workflow Root"))
					.setIcon("workflow")
					.onClick(() => {
						convertToWorkflowRootCommand(false, editor, ctx, plugin);
					});
			});
		}
	}

	// Start workflow here
	menu.addItem((item) => {
		item.setTitle(t("Start Workflow Here"))
			.setIcon("play")
			.onClick(() => {
				startWorkflowHereCommand(false, editor, ctx, plugin);
			});
	});

	// Duplicate workflow
	if (plugin.settings.workflow.definitions.length > 0) {
		menu.addItem((item) => {
			item.setTitle(t("Duplicate Workflow"))
				.setIcon("copy")
				.onClick(() => {
					duplicateWorkflowCommand(false, editor, ctx, plugin);
				});
		});
	}

	menu.showAtMouseEvent(window.event as MouseEvent);
	return true;
}
