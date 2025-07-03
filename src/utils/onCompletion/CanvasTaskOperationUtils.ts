/**
 * Utility class for Canvas task operations
 * Provides common functionality for Canvas task manipulation across different executors
 */

import { TFile, App } from 'obsidian';
import { Task, CanvasTaskMetadata } from '../../types/task';
import { CanvasData, CanvasTextData } from '../../types/canvas';

export interface CanvasOperationResult {
	success: boolean;
	error?: string;
	updatedContent?: string;
}

/**
 * Utility class for Canvas task operations
 */
export class CanvasTaskOperationUtils {
	constructor(private app: App) {}

	/**
	 * Find or create a target text node in a Canvas file
	 */
	public async findOrCreateTargetTextNode(
		filePath: string,
		targetNodeId?: string,
		targetSection?: string
	): Promise<{ canvasData: CanvasData; textNode: CanvasTextData } | null> {
		try {
			const file = this.app.vault.getFileByPath(filePath);
			if (!file) {
				return null;
			}

			const content = await this.app.vault.read(file);
			const canvasData: CanvasData = JSON.parse(content);

			let targetNode: CanvasTextData;

			if (targetNodeId) {
				// Find existing node by ID
				const existingNode = canvasData.nodes.find(
					(node): node is CanvasTextData =>
						node.type === "text" && node.id === targetNodeId
				);

				if (!existingNode) {
					return null;
				}

				targetNode = existingNode;
			} else {
				// Find node by section or create new one
				if (targetSection) {
					const nodeWithSection = canvasData.nodes.find(
						(node): node is CanvasTextData =>
							node.type === "text" &&
							node.text.toLowerCase().includes(targetSection.toLowerCase())
					);

					if (nodeWithSection) {
						targetNode = nodeWithSection;
					} else {
						// Create new node with section
						targetNode = this.createNewTextNode(canvasData, targetSection);
						canvasData.nodes.push(targetNode);
					}
				} else {
					// Create new node without section
					targetNode = this.createNewTextNode(canvasData);
					canvasData.nodes.push(targetNode);
				}
			}

			return { canvasData, textNode: targetNode };
		} catch (error) {
			console.error('Error finding/creating target text node:', error);
			return null;
		}
	}

	/**
	 * Insert a task into a specific section within a text node
	 */
	public insertTaskIntoSection(
		textNode: CanvasTextData,
		taskContent: string,
		targetSection?: string
	): CanvasOperationResult {
		try {
			const lines = textNode.text.split('\n');

			if (targetSection) {
				// Find the target section and insert after it
				const sectionIndex = this.findSectionIndex(lines, targetSection);
				if (sectionIndex >= 0) {
					lines.splice(sectionIndex + 1, 0, taskContent);
				} else {
					// Section not found, create it and add the task
					if (textNode.text.trim()) {
						lines.push('', `## ${targetSection}`, taskContent);
					} else {
						lines.splice(0, 1, `## ${targetSection}`, taskContent);
					}
				}
			} else {
				// Add at the end of the text node
				if (textNode.text.trim()) {
					lines.push(taskContent);
				} else {
					lines[0] = taskContent;
				}
			}

			// Update the text node content
			textNode.text = lines.join('\n');

			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: `Error inserting task into section: ${error.message}`
			};
		}
	}

	/**
	 * Format a task for Canvas storage
	 */
	public formatTaskForCanvas(task: Task, preserveMetadata: boolean = true): string {
		if (task.originalMarkdown && preserveMetadata) {
			return task.originalMarkdown;
		}

		const status = task.completed ? 'x' : ' ';
		let formatted = `- [${status}] ${task.content}`;

		if (preserveMetadata && task.metadata) {
			// Add basic metadata
			const metadata: string[] = [];

			if (task.metadata.dueDate) {
				const dueDate = new Date(task.metadata.dueDate).toISOString().split('T')[0];
				metadata.push(`📅 ${dueDate}`);
			}

			if (task.metadata.priority && task.metadata.priority > 0) {
				const priorityEmoji = this.getPriorityEmoji(task.metadata.priority);
				metadata.push(priorityEmoji);
			}

			if (task.metadata.project) {
				metadata.push(`#project/${task.metadata.project}`);
			}

			if (task.metadata.context) {
				metadata.push(`@${task.metadata.context}`);
			}

			if (metadata.length > 0) {
				formatted += ` ${metadata.join(' ')}`;
			}
		}

		return formatted;
	}

	/**
	 * Create a new text node for Canvas
	 */
	private createNewTextNode(canvasData: CanvasData, initialContent?: string): CanvasTextData {
		// Generate a unique ID for the new node
		const nodeId = `task-node-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

		// Find a good position for the new node (avoid overlaps)
		const existingNodes = canvasData.nodes;
		let x = 0;
		let y = 0;

		if (existingNodes.length > 0) {
			// Position new node to the right of existing nodes
			const maxX = Math.max(...existingNodes.map(node => node.x + node.width));
			x = maxX + 50;
		}

		const text = initialContent ? `## ${initialContent}\n\n` : '';

		return {
			type: 'text',
			id: nodeId,
			x,
			y,
			width: 250,
			height: 60,
			text
		};
	}

	/**
	 * Find section index in text lines
	 */
	private findSectionIndex(lines: string[], sectionName: string): number {
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			// Check for markdown headings
			if (line.startsWith('#') && line.toLowerCase().includes(sectionName.toLowerCase())) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * Get priority emoji based on priority level
	 */
	private getPriorityEmoji(priority: number): string {
		switch (priority) {
			case 1: return '🔽'; // Low
			case 2: return ''; // Normal (no emoji)
			case 3: return '🔼'; // Medium
			case 4: return '⏫'; // High
			case 5: return '🔺'; // Highest
			default: return '';
		}
	}

	/**
	 * Save Canvas data to file
	 */
	public async saveCanvasData(filePath: string, canvasData: CanvasData): Promise<CanvasOperationResult> {
		try {
			const file = this.app.vault.getFileByPath(filePath);
			if (!file) {
				return {
					success: false,
					error: `Canvas file not found: ${filePath}`
				};
			}

			const updatedContent = JSON.stringify(canvasData, null, 2);
			await this.app.vault.modify(file, updatedContent);

			return {
				success: true,
				updatedContent
			};
		} catch (error) {
			return {
				success: false,
				error: `Error saving Canvas data: ${error.message}`
			};
		}
	}
}
