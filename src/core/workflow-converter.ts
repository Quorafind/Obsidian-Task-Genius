import { Editor, EditorPosition } from "obsidian";
import { WorkflowDefinition, WorkflowStage } from "../common/setting-definition";
import TaskProgressBarPlugin from "../index";
import { t } from "../translations/helper";

/**
 * Utility functions for converting tasks to workflows and vice versa
 */

export interface TaskStructure {
	content: string;
	level: number;
	line: number;
	isTask: boolean;
	status: string;
	children: TaskStructure[];
}

/**
 * Analyzes the current task structure around the cursor position
 */
export function analyzeTaskStructure(
	editor: Editor,
	cursor: EditorPosition
): TaskStructure | null {
	const lines = editor.getValue().split('\n');
	const currentLine = cursor.line;
	
	// Find the root task or start of the structure
	const rootLine = findRootTask(lines, currentLine);
	if (rootLine === -1) return null;

	return parseTaskStructure(lines, rootLine);
}

/**
 * Finds the root task line for the current context
 */
function findRootTask(lines: string[], currentLine: number): number {
	// Start from current line and go up to find the root
	for (let i = currentLine; i >= 0; i--) {
		const line = lines[i];
		const taskMatch = line.match(/^(\s*)[-*+] \[(.)\]/);
		
		if (taskMatch) {
			const indentation = taskMatch[1].length;
			
			// If this is at the root level (no indentation) or 
			// if the previous lines don't have tasks with less indentation
			if (indentation === 0) {
				return i;
			}
			
			// Check if there's a parent task with less indentation
			let hasParent = false;
			for (let j = i - 1; j >= 0; j--) {
				const parentLine = lines[j];
				const parentMatch = parentLine.match(/^(\s*)[-*+] \[(.)\]/);
				
				if (parentMatch && parentMatch[1].length < indentation) {
					hasParent = true;
					break;
				}
				
				// Stop if we hit a non-empty line that's not a task
				if (parentLine.trim() && !parentMatch) {
					break;
				}
			}
			
			if (!hasParent) {
				return i;
			}
		}
	}
	
	return -1;
}

/**
 * Parses task structure starting from a given line
 */
function parseTaskStructure(lines: string[], startLine: number): TaskStructure {
	const line = lines[startLine];
	const taskMatch = line.match(/^(\s*)[-*+] \[(.)\](.+)/);
	
	if (!taskMatch) {
		return {
			content: line.trim(),
			level: 0,
			line: startLine,
			isTask: false,
			status: '',
			children: []
		};
	}

	const indentation = taskMatch[1].length;
	const status = taskMatch[2];
	const content = taskMatch[3].trim();
	
	const structure: TaskStructure = {
		content,
		level: indentation,
		line: startLine,
		isTask: true,
		status,
		children: []
	};

	// Find children
	let i = startLine + 1;
	while (i < lines.length) {
		const childLine = lines[i];
		
		// Skip empty lines
		if (!childLine.trim()) {
			i++;
			continue;
		}
		
		const childMatch = childLine.match(/^(\s*)[-*+] \[(.)\]/);
		
		if (childMatch) {
			const childIndentation = childMatch[1].length;
			
			// If this is a child (more indented)
			if (childIndentation > indentation) {
				const childStructure = parseTaskStructure(lines, i);
				structure.children.push(childStructure);
				
				// Skip the lines that were parsed as part of this child
				i = findNextSiblingLine(lines, i, childIndentation) || lines.length;
			} else {
				// This is a sibling or parent, stop parsing children
				break;
			}
		} else {
			// Non-task line, stop if it's at the same or less indentation
			const lineIndentation = childLine.match(/^(\s*)/)?.[1].length || 0;
			if (lineIndentation <= indentation) {
				break;
			}
			i++;
		}
	}

	return structure;
}

/**
 * Finds the next sibling line at the same indentation level
 */
function findNextSiblingLine(lines: string[], currentLine: number, indentation: number): number | null {
	for (let i = currentLine + 1; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim()) continue;
		
		const match = line.match(/^(\s*)/);
		const lineIndentation = match ? match[1].length : 0;
		
		if (lineIndentation <= indentation) {
			return i;
		}
	}
	return null;
}

/**
 * Converts a task structure to a workflow definition
 */
export function convertTaskStructureToWorkflow(
	structure: TaskStructure,
	workflowName: string,
	workflowId: string
): WorkflowDefinition {
	const stages: WorkflowStage[] = [];
	
	// Convert the main task and its children to stages
	if (structure.isTask) {
		// Add the root task as the first stage
		stages.push({
			id: generateStageId(structure.content),
			name: structure.content,
			type: structure.children.length > 0 ? "linear" : "terminal"
		});
		
		// Convert children to stages
		structure.children.forEach((child, index) => {
			const stage = convertTaskToStage(child, index === structure.children.length - 1);
			stages.push(stage);
		});
		
		// Set up stage transitions
		for (let i = 0; i < stages.length - 1; i++) {
			stages[i].next = stages[i + 1].id;
		}
	}

	return {
		id: workflowId,
		name: workflowName,
		description: t("Workflow generated from task structure"),
		stages,
		metadata: {
			version: "1.0",
			created: new Date().toISOString().split("T")[0],
			lastModified: new Date().toISOString().split("T")[0],
		}
	};
}

/**
 * Converts a single task to a workflow stage
 */
function convertTaskToStage(task: TaskStructure, isLast: boolean): WorkflowStage {
	const stage: WorkflowStage = {
		id: generateStageId(task.content),
		name: task.content,
		type: isLast ? "terminal" : "linear"
	};

	// If the task has children, make it a cycle stage with substages
	if (task.children.length > 0) {
		stage.type = "cycle";
		stage.subStages = task.children.map((child, index) => ({
			id: generateStageId(child.content),
			name: child.content,
			next: index < task.children.length - 1 ? 
				generateStageId(task.children[index + 1].content) : 
				generateStageId(task.children[0].content) // Cycle back to first
		}));
	}

	return stage;
}

/**
 * Generates a stage ID from content
 */
function generateStageId(content: string): string {
	return content
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, "")
		.replace(/\s+/g, "_")
		.substring(0, 30);
}

/**
 * Creates a workflow starting task at the current cursor position
 */
export function createWorkflowStartingTask(
	editor: Editor,
	cursor: EditorPosition,
	workflow: WorkflowDefinition,
	plugin: TaskProgressBarPlugin
): void {
	const currentLine = editor.getLine(cursor.line);
	const indentMatch = currentLine.match(/^(\s*)/);
	const indentation = indentMatch ? indentMatch[1] : "";
	
	// Create the root workflow task
	const rootTaskText = `${indentation}- [ ] ${workflow.name} #workflow/${workflow.id}`;
	
	// If we're on an empty line, replace it; otherwise insert a new line
	if (currentLine.trim() === "") {
		editor.setLine(cursor.line, rootTaskText);
	} else {
		editor.replaceRange(
			`\n${rootTaskText}`,
			{ line: cursor.line, ch: currentLine.length },
			{ line: cursor.line, ch: currentLine.length }
		);
	}
}

/**
 * Converts current task to workflow root by adding workflow tag
 */
export function convertCurrentTaskToWorkflowRoot(
	editor: Editor,
	cursor: EditorPosition,
	workflowId: string
): boolean {
	const currentLine = editor.getLine(cursor.line);
	const taskMatch = currentLine.match(/^(\s*)[-*+] \[(.)\](.+)/);
	
	if (!taskMatch) {
		return false;
	}

	const [, indentation, status, content] = taskMatch;
	
	// Check if it already has a workflow tag
	if (content.includes("#workflow/")) {
		return false;
	}

	// Add the workflow tag
	const newContent = `${indentation}- [${status}]${content} #workflow/${workflowId}`;
	editor.setLine(cursor.line, newContent);
	
	return true;
}

/**
 * Analyzes existing workflows to suggest similar patterns
 */
export function suggestWorkflowFromExisting(
	structure: TaskStructure,
	existingWorkflows: WorkflowDefinition[]
): WorkflowDefinition | null {
	// Simple heuristic: find workflow with similar number of stages
	const stageCount = 1 + structure.children.length;
	
	const similarWorkflow = existingWorkflows.find(workflow => 
		Math.abs(workflow.stages.length - stageCount) <= 1
	);
	
	if (similarWorkflow) {
		// Create a modified version of the similar workflow
		return {
			...similarWorkflow,
			id: generateStageId(structure.content + "_workflow"),
			name: `${structure.content} Workflow`,
			description: t("Workflow based on existing pattern"),
			metadata: {
				version: "1.0",
				created: new Date().toISOString().split("T")[0],
				lastModified: new Date().toISOString().split("T")[0],
			}
		};
	}
	
	return null;
}
