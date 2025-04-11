/**
 * Optimized task parser focused on task data only
 */

import {
	CachedMetadata,
	Component,
	FileStats,
	ListItemCache,
	TFile,
} from "obsidian";
import { Task, TaskParserConfig } from "../types/TaskIndex";
import { v4 as uuidv4 } from "uuid";

/**
 * Default configuration for the task parser
 */
export const DEFAULT_TASK_PARSER_CONFIG: TaskParserConfig = {
	taskRegex: /^(([\s>]*)?(-|\d+\.|\*|\+)\s\[(.)\])\s*(.*)$/m,
	startDateFormat: "📅 YYYY-MM-DD",
	dueDateFormat: "⏳ YYYY-MM-DD",
	scheduledDateFormat: "⏰ YYYY-MM-DD",
	projectPrefix: "#project/",
	contextPrefix: "@",
	priorityMarkers: {
		"🔺": 5, // Highest
		"⏫": 4, // High
		"🔼": 3, // Medium
		"🔽": 2, // Low
		"⏬️": 1, // Lowest
		"[#A]": 4, // High (letter format)
		"[#B]": 3, // Medium (letter format)
		"[#C]": 2, // Low (letter format)
	},
};

export class TaskParser extends Component {
	// Regular expressions for parsing task components
	private readonly startDateRegex = /📅 (\d{4}-\d{2}-\d{2})/;
	private readonly completedDateRegex = /✅ (\d{4}-\d{2}-\d{2})/;
	private readonly dueDateRegex = /⏳\s(\d{4}-\d{2}-\d{2})/;
	private readonly scheduledDateRegex = /⏰\s(\d{4}-\d{2}-\d{2})/;
	private readonly recurrenceRegex = /🔁 (.*?)(?=\s|$)/;
	private readonly tagRegex = /#[\w\/-]+/g;
	private readonly contextRegex = /@[\w-]+/g;
	private readonly priorityRegex = /🔼|⏫|🔽|⏬️|🔺|\[#[A-C]\]/;
	private readonly estimatedTimeRegex = /estimated:\s*(\d+)([hm])/i;

	private config: TaskParserConfig;

	constructor(config: Partial<TaskParserConfig> = {}) {
		super();
		this.config = { ...DEFAULT_TASK_PARSER_CONFIG, ...config };
	}

	/**
	 * Parse a task from a text line and list item metadata
	 */
	parseTask(
		text: string,
		filePath: string,
		lineNum: number,
		listItem?: ListItemCache
	): Task | null {
		// If we have list item metadata, use it to determine if this is a task
		if (listItem) {
			if (listItem.task === undefined) {
				// This list item is not a task
				return null;
			}

			// Get task content by removing the checkbox part
			const contentMatch = text.match(
				/^(([\s>]*)?(-|\d+\.|\*|\+)\s\[(.)\])\s*(.*)$/
			);
			if (!contentMatch) return null;

			// Content is now in capture group 5
			const content = contentMatch[5];
			if (!content) return null;

			const completed = listItem.task !== " ";

			// Create the task object
			const task: Task = {
				id: uuidv4(),
				content: content.trim(),
				filePath,
				line: lineNum,
				completed,
				status: listItem.task,
				originalMarkdown: text,
				tags: [],
				children: [],
			};

			// Extract metadata
			this.extractDates(task, content);
			this.extractTags(task, content);
			this.extractContext(task, content);
			this.extractPriority(task, content);
			this.extractEstimatedTime(task, content);
			this.extractRecurrence(task, content);

			return task;
		} else {
			// Fallback to regex-based parsing when list item metadata is not available
			const match = text.match(this.config.taskRegex);
			if (!match) return null;

			// Adjust indices based on the updated regex
			const [, , , , status, content] = match;
			if (!content) return null;

			const completed = status.toLowerCase() === "x";

			// Basic task info
			const task: Task = {
				id: uuidv4(),
				content: content.trim(),
				filePath,
				line: lineNum,
				completed,
				status,
				originalMarkdown: text,
				tags: [],
				children: [],
			};

			// Extract metadata
			this.extractDates(task, content);
			this.extractTags(task, content);
			this.extractContext(task, content);
			this.extractPriority(task, content);
			this.extractEstimatedTime(task, content);
			this.extractRecurrence(task, content);

			return task;
		}
	}

	/**
	 * Extract dates from task content
	 */
	private extractDates(task: Task, content: string): void {
		// Add more comprehensive date matching for various date formats
		// Start date - both emoji and regular formats
		const startDateMatch =
			content.match(this.startDateRegex) ||
			content.match(
				/start(?:s|ed)?(?:\s+on)?(?:\s*:\s*|\s+)(\d{4}-\d{2}-\d{2})/i
			);

		if (startDateMatch) {
			try {
				task.startDate = new Date(startDateMatch[1]).getTime();
			} catch (e) {
				console.error(
					"Failed to parse start date:",
					startDateMatch[1],
					e
				);
			}
		}

		// Due date - both emoji and regular formats
		const dueDateMatch =
			content.match(this.dueDateRegex) ||
			content.match(/due(?:\s+on)?(?:\s*:\s*|\s+)(\d{4}-\d{2}-\d{2})/i);

		if (dueDateMatch) {
			try {
				task.dueDate = new Date(dueDateMatch[1]).getTime();
			} catch (e) {
				console.error("Failed to parse due date:", dueDateMatch[1], e);
			}
		}

		// Scheduled date - both emoji and regular formats
		const scheduledDateMatch =
			content.match(this.scheduledDateRegex) ||
			content.match(
				/scheduled?(?:\s+on)?(?:\s*:\s*|\s+)(\d{4}-\d{2}-\d{2})/i
			);

		if (scheduledDateMatch) {
			try {
				task.scheduledDate = new Date(scheduledDateMatch[1]).getTime();
			} catch (e) {
				console.error(
					"Failed to parse scheduled date:",
					scheduledDateMatch[1],
					e
				);
			}
		}

		// Completion date - both emoji and regular formats
		const completedDateMatch =
			content.match(this.completedDateRegex) ||
			content.match(
				/completed?(?:\s+on)?(?:\s*:\s*|\s+)(\d{4}-\d{2}-\d{2})/i
			);

		if (completedDateMatch) {
			try {
				task.completedDate = new Date(completedDateMatch[1]).getTime();
			} catch (e) {
				console.error(
					"Failed to parse completion date:",
					completedDateMatch[1],
					e
				);
			}
		}
	}

	/**
	 * Extract tags from task content
	 */
	private extractTags(task: Task, content: string): void {
		const tagMatches = content.match(this.tagRegex) || [];
		task.tags = tagMatches.map((tag) => tag.trim());

		// Check for project tags
		const projectTag = task.tags.find((tag) =>
			tag.startsWith(this.config.projectPrefix!)
		);
		if (projectTag) {
			task.project = projectTag.substring(
				this.config.projectPrefix!.length
			);
		}
	}

	/**
	 * Extract context from task content
	 */
	private extractContext(task: Task, content: string): void {
		const contextMatches = content.match(this.contextRegex) || [];
		if (contextMatches.length > 0) {
			// Use the first context tag as the primary context
			task.context = contextMatches[0]?.substring(1); // Remove the @ symbol
		}
	}

	/**
	 * Extract priority from task content
	 */
	private extractPriority(task: Task, content: string): void {
		const priorityMatch = content.match(this.priorityRegex);
		if (priorityMatch && this.config.priorityMarkers) {
			task.priority =
				this.config.priorityMarkers[priorityMatch[0]] || undefined;
		}
	}

	/**
	 * Extract estimated time from task content
	 */
	private extractEstimatedTime(task: Task, content: string): void {
		const timeMatch = content.match(this.estimatedTimeRegex);
		if (timeMatch) {
			const value = parseInt(timeMatch[1]);
			const unit = timeMatch[2].toLowerCase();

			if (unit === "h") {
				task.estimatedTime = value * 60; // Convert hours to minutes
			} else {
				task.estimatedTime = value; // Already in minutes
			}
		}
	}

	/**
	 * Extract recurrence information from task content
	 */
	private extractRecurrence(task: Task, content: string): void {
		const recurrenceMatch = content.match(this.recurrenceRegex);
		if (recurrenceMatch) {
			task.recurrence = recurrenceMatch[1];
		}
	}

	/**
	 * Generate markdown text from a task object
	 */
	generateMarkdown(task: Task): string {
		let markdown = `- [${task.completed ? "x" : " "}] ${task.content}`;

		// This is simplified - a full implementation would reconstruct the original
		// markdown with all the metadata in the correct format

		return markdown;
	}

	/**
	 * Parse all tasks from a file
	 */
	async parseTasksFromFile(
		file: TFile,
		fileContent: string,
		metadata?: CachedMetadata
	): Promise<Task[]> {
		const lines = fileContent.split("\n");
		const tasks: Task[] = [];
		const tasksByLine: Record<number, Task> = {};

		// If we have metadata with list items, use it to identify tasks
		if (metadata?.listItems && metadata.listItems.length > 0) {
			// Get list items that are tasks (have a task property)
			const taskListItems = metadata.listItems.filter(
				(item) => item.task !== undefined
			);

			// Process each task list item
			for (const listItem of taskListItems) {
				const lineNum = listItem.position.start.line;
				if (lineNum >= 0 && lineNum < lines.length) {
					const line = lines[lineNum];

					try {
						const task = this.parseTask(
							line,
							file.path,
							lineNum,
							listItem
						);

						if (task) {
							tasks.push(task);
							tasksByLine[lineNum] = task;
						}
					} catch (error) {
						console.error(
							`Error parsing task at line ${lineNum} in file ${file.path}:`,
							error
						);
						console.error(`Line content: "${line}"`);
						console.error(`ListItem:`, listItem);
					}
				}
			}

			// Build parent-child relationships using metadata
			for (const listItem of taskListItems) {
				const lineNum = listItem.position.start.line;
				const task = tasksByLine[lineNum];

				if (task && listItem.parent >= 0) {
					const parentTask = tasksByLine[listItem.parent];
					if (parentTask) {
						task.parent = parentTask.id;
						parentTask.children.push(task.id);
					}
				}
			}
		} else {
			// Fallback to regex-based parsing when metadata is not available
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				try {
					const task = this.parseTask(line, file.path, i);

					if (task) {
						tasks.push(task);
						tasksByLine[i] = task;
					}
				} catch (error) {
					console.error(
						`Error parsing task at line ${i} in file ${file.path}:`,
						error
					);
					console.error(`Line content: "${line}"`);
				}
			}

			// Build parent-child relationships based on indentation
			this.buildTaskHierarchyByIndent(tasks);
		}

		return tasks;
	}

	/**
	 * Build parent-child relationships between tasks based on indentation
	 * Used as fallback when metadata is not available
	 */
	private buildTaskHierarchyByIndent(tasks: Task[]): void {
		// Sort tasks by line number
		tasks.sort((a, b) => a.line - b.line);

		// Build parent-child relationships based on indentation
		for (let i = 0; i < tasks.length; i++) {
			const currentTask = tasks[i];
			const currentIndent = this.getIndentLevel(
				currentTask.originalMarkdown
			);

			// Look for potential parent tasks (must be before current task and have less indentation)
			for (let j = i - 1; j >= 0; j--) {
				const potentialParent = tasks[j];
				const parentIndent = this.getIndentLevel(
					potentialParent.originalMarkdown
				);

				if (parentIndent < currentIndent) {
					// Found a parent
					currentTask.parent = potentialParent.id;
					potentialParent.children.push(currentTask.id);
					break;
				}
			}
		}
	}

	/**
	 * Get indentation level of a line
	 */
	private getIndentLevel(line: string): number {
		const match = line.match(/^(\s*)/);
		return match ? match[1].length : 0;
	}
}
