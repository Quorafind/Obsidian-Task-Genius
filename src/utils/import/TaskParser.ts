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
		highest: 5,
		high: 4,
		medium: 3,
		low: 2,
		lowest: 1,
		a: 4,
		b: 3,
		c: 2,
	},
	preferMetadataFormat: "tasks",
};

export class TaskParser extends Component {
	// Regular expressions for parsing task components
	private readonly startDateRegex = /🛫\s*(\d{4}-\d{2}-\d{2})/;
	private readonly completedDateRegex = /✅\s*(\d{4}-\d{2}-\d{2})/;
	private readonly dueDateRegex = /📅\s(\d{4}-\d{2}-\d{2})/;
	private readonly scheduledDateRegex = /⏳\s*(\d{4}-\d{2}-\d{2})/;
	private readonly recurrenceRegex = /🔁 (.*?)(?=\s|$)/;
	private readonly tagRegex = /#[\w\/-]+/g;
	private readonly contextRegex = /@[\w-]+/g;
	private readonly priorityRegex = /🔼|⏫|🔽|⏬️|🔺|\[#[A-C]\]/;
	private readonly estimatedTimeRegex = /estimated:\s*(\d+)([hm])/i;

	// Emoji-based regexes
	private readonly emojiStartDateRegex = /🛫\s*(\d{4}-\d{2}-\d{2})/;
	private readonly emojiCompletedDateRegex = /✅\s*(\d{4}-\d{2}-\d{2})/;
	private readonly emojiDueDateRegex = /📅\s*(\d{4}-\d{2}-\d{2})/;
	private readonly emojiScheduledDateRegex = /⏳\s*(\d{4}-\d{2}-\d{2})/;
	private readonly emojiCreatedDateRegex = /➕\s*(\d{4}-\d{2}-\d{2})/;
	private readonly emojiRecurrenceRegex =
		/🔁\s*(.*?)(?=\s(?:📅|🛫|⏳|✅|➕|🔁|@|#)|$)/u;
	private readonly emojiPriorityRegex = /(([🔺⏫🔼🔽⏬️⏬])|([#A-C]))/u;
	private readonly emojiContextRegex = /@([\w-]+)/g;
	private readonly emojiTagRegex = /#([\w/-]+)/g;

	// Dataview-based regexes
	private readonly dvStartDateRegex =
		/\[(?:start|🛫)::\s*(\d{4}-\d{2}-\d{2})\]/i;
	private readonly dvCompletedDateRegex =
		/\[(?:completion|✅)::\s*(\d{4}-\d{2}-\d{2})\]/i;
	private readonly dvDueDateRegex = /\[(?:due|🗓️)::\s*(\d{4}-\d{2}-\d{2})\]/i;
	private readonly dvScheduledDateRegex =
		/\[(?:scheduled|⏳)::\s*(\d{4}-\d{2}-\d{2})\]/i;
	private readonly dvCreatedDateRegex =
		/\[(?:created|➕)::\s*(\d{4}-\d{2}-\d{2})\]/i;
	private readonly dvRecurrenceRegex =
		/\[(?:repeat|recurrence|🔁)::\s*([^\]]+)\]/i;
	private readonly dvPriorityRegex = /\[priority::\s*([^\]]+)\]/i;
	private readonly dvProjectRegex = /\[project::\s*([^\]]+)\]/i;
	private readonly dvContextRegex = /\[context::\s*([^\]]+)\]/i;
	private readonly dvTagRegex = /#([\w/-]+)/g;

	// General fallback regexes
	private readonly anyDataviewFieldRegex =
		/\[\w+(?:|🗓️|✅|➕|🛫|⏳|🔁)::\s*[^\]]+\]/gi;

	private config: TaskParserConfig;

	constructor(config: Partial<TaskParserConfig> = {}) {
		super();
		this.config = { ...DEFAULT_TASK_PARSER_CONFIG, ...config };
		if (config.priorityMarkers) {
			this.config.priorityMarkers = {
				...DEFAULT_TASK_PARSER_CONFIG.priorityMarkers,
				...config.priorityMarkers,
			};
		}
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
		const taskIdentifierMatch = text.match(this.config.taskRegex);
		if (!taskIdentifierMatch) return null;

		const status = listItem?.task ?? taskIdentifierMatch[4];
		if (status === undefined) return null;

		const completed = status.toLowerCase() === "x";
		const contentWithMetadata = taskIdentifierMatch[5] ?? "";
		const id = `${filePath}-L${lineNum}`;

		const task: Task = {
			id,
			content: "",
			filePath,
			line: lineNum,
			completed,
			status,
			originalMarkdown: text,
			tags: [],
			children: [],
			priority: undefined,
			startDate: undefined,
			dueDate: undefined,
			scheduledDate: undefined,
			completedDate: undefined,
			createdDate: undefined,
			recurrence: undefined,
			project: undefined,
			context: undefined,
			estimatedTime: undefined,
		};

		let remainingContent = this.extractMetadata(task, contentWithMetadata);

		task.content = remainingContent.trim();

		return task;
	}

	private extractMetadata(task: Task, content: string): string {
		let remainingContent = content;

		remainingContent = this.extractDates(task, remainingContent);

		remainingContent = this.extractRecurrence(task, remainingContent);

		remainingContent = this.extractPriority(task, remainingContent);

		remainingContent = this.extractProject(task, remainingContent);
		remainingContent = this.extractContext(task, remainingContent);

		remainingContent = this.extractTags(task, remainingContent);

		remainingContent = remainingContent.replace(/\s{2,}/g, " ").trim();

		return remainingContent;
	}

	/**
	 * Extract dates (Start, Due, Scheduled, Completion, Created)
	 * Prioritizes based on config, falls back to other formats.
	 * Returns content with extracted dates removed.
	 */
	private extractDates(task: Task, content: string): string {
		let remainingContent = content;
		const preferDataview = this.config.preferMetadataFormat === "dataview";

		// Define extraction functions for cleaner code
		const parseAndAssignDate = (
			regex: RegExp,
			dateField: keyof Pick<
				Task,
				| "startDate"
				| "dueDate"
				| "scheduledDate"
				| "completedDate"
				| "createdDate"
			>
		): boolean => {
			if (task[dateField] !== undefined) return false; // Already extracted

			const match = remainingContent.match(regex);
			if (match && match[1]) {
				try {
					// Attempt to parse YYYY-MM-DD as local date midnight
					const parts = match[1].split("-");
					if (parts.length === 3) {
						const year = parseInt(parts[0], 10);
						const month = parseInt(parts[1], 10); // 1-based
						const day = parseInt(parts[2], 10);
						if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
							task[dateField] = new Date(
								year,
								month - 1,
								day
							).getTime();
							remainingContent = remainingContent.replace(
								match[0],
								""
							); // Remove from content
							return true; // Found and extracted
						}
					}
				} catch (e) {
					console.error(
						`Failed to parse date ${match[1]} for field ${String(
							dateField
						)}:`,
						e
					);
				}
			}
			return false; // Not found or failed to parse
		};

		// --- Process each date type explicitly ---

		// Due Date
		if (preferDataview) {
			if (!parseAndAssignDate(this.dvDueDateRegex, "dueDate")) {
				parseAndAssignDate(this.emojiDueDateRegex, "dueDate"); // Fallback
			}
		} else {
			if (!parseAndAssignDate(this.emojiDueDateRegex, "dueDate")) {
				parseAndAssignDate(this.dvDueDateRegex, "dueDate"); // Fallback
			}
		}

		// Scheduled Date
		if (preferDataview) {
			if (
				!parseAndAssignDate(this.dvScheduledDateRegex, "scheduledDate")
			) {
				parseAndAssignDate(
					this.emojiScheduledDateRegex,
					"scheduledDate"
				);
			}
		} else {
			if (
				!parseAndAssignDate(
					this.emojiScheduledDateRegex,
					"scheduledDate"
				)
			) {
				parseAndAssignDate(this.dvScheduledDateRegex, "scheduledDate");
			}
		}

		// Start Date
		if (preferDataview) {
			if (!parseAndAssignDate(this.dvStartDateRegex, "startDate")) {
				parseAndAssignDate(this.emojiStartDateRegex, "startDate");
			}
		} else {
			if (!parseAndAssignDate(this.emojiStartDateRegex, "startDate")) {
				parseAndAssignDate(this.dvStartDateRegex, "startDate");
			}
		}

		// Completed Date
		if (preferDataview) {
			if (
				!parseAndAssignDate(this.dvCompletedDateRegex, "completedDate")
			) {
				parseAndAssignDate(
					this.emojiCompletedDateRegex,
					"completedDate"
				);
			}
		} else {
			if (
				!parseAndAssignDate(
					this.emojiCompletedDateRegex,
					"completedDate"
				)
			) {
				parseAndAssignDate(this.dvCompletedDateRegex, "completedDate");
			}
		}

		// Created Date
		if (preferDataview) {
			if (!parseAndAssignDate(this.dvCreatedDateRegex, "createdDate")) {
				parseAndAssignDate(this.emojiCreatedDateRegex, "createdDate");
			}
		} else {
			if (
				!parseAndAssignDate(this.emojiCreatedDateRegex, "createdDate")
			) {
				parseAndAssignDate(this.dvCreatedDateRegex, "createdDate");
			}
		}

		// Add fallback for text-based dates if needed here

		return remainingContent;
	}

	private extractRecurrence(task: Task, content: string): string {
		let remainingContent = content;
		const preferDataview = this.config.preferMetadataFormat === "dataview";
		let match: RegExpMatchArray | null = null;

		if (preferDataview) {
			match = remainingContent.match(this.dvRecurrenceRegex);
			if (match && match[1]) {
				task.recurrence = match[1].trim();
				remainingContent = remainingContent.replace(match[0], "");
				return remainingContent;
			}
		}

		match = remainingContent.match(this.emojiRecurrenceRegex);
		if (match && match[1]) {
			task.recurrence = match[1].trim();
			remainingContent = remainingContent.replace(match[0], "");
		}

		return remainingContent;
	}

	private extractPriority(task: Task, content: string): string {
		let remainingContent = content;
		const preferDataview = this.config.preferMetadataFormat === "dataview";
		let match: RegExpMatchArray | null = null;

		if (preferDataview) {
			match = remainingContent.match(this.dvPriorityRegex);
			if (match && match[1]) {
				const priorityValue = match[1].trim().toLowerCase();
				task.priority =
					this.config.priorityMarkers![priorityValue] ?? undefined;
				if (task.priority !== undefined) {
					remainingContent = remainingContent.replace(match[0], "");
					return remainingContent;
				} else {
					const numericPriority = parseInt(priorityValue, 10);
					if (!isNaN(numericPriority)) {
						task.priority = numericPriority;
						remainingContent = remainingContent.replace(
							match[0],
							""
						);
						return remainingContent;
					}
				}
			}
		}

		match = remainingContent.match(this.emojiPriorityRegex);
		if (match && match[1] && this.config.priorityMarkers) {
			let priorityValue = match[1].trim().toLowerCase();

			// 处理 [#A], [#B], [#C], [#D], [#E] 格式的优先级
			if (priorityValue === "a" || priorityValue === "[#a]") {
				task.priority = 5; // A 是最高优先级 5
			} else if (priorityValue === "b" || priorityValue === "[#b]") {
				task.priority = 4; // B 是高优先级 4
			} else if (priorityValue === "c" || priorityValue === "[#c]") {
				task.priority = 3; // C 是中优先级 3
			} else if (priorityValue === "d" || priorityValue === "[#d]") {
				task.priority = 2; // D 是低优先级 2
			} else if (priorityValue === "e" || priorityValue === "[#e]") {
				task.priority = 1; // E 是最低优先级 1
			} else {
				task.priority =
					this.config.priorityMarkers![priorityValue] ?? undefined;
			}

			if (task.priority !== undefined) {
				remainingContent = remainingContent.replace(match[0], "");
			}
		}

		return remainingContent;
	}

	private extractProject(task: Task, content: string): string {
		let remainingContent = content;
		const preferDataview = this.config.preferMetadataFormat === "dataview";
		let match: RegExpMatchArray | null = null;

		if (preferDataview) {
			match = remainingContent.match(this.dvProjectRegex);
			if (match && match[1]) {
				task.project = match[1].trim();
				remainingContent = remainingContent.replace(match[0], "");
				return remainingContent;
			}
		}

		const projectTagRegex = new RegExp(
			this.config.projectPrefix + "([\\w/-]+)"
		);
		match = remainingContent.match(projectTagRegex);
		if (match && match[1]) {
			task.project = match[1].trim();
		}

		return remainingContent;
	}

	private extractContext(task: Task, content: string): string {
		let remainingContent = content;
		const preferDataview = this.config.preferMetadataFormat === "dataview";
		let match: RegExpMatchArray | null = null;

		if (preferDataview) {
			match = remainingContent.match(this.dvContextRegex);
			if (match && match[1]) {
				task.context = match[1].trim();
				remainingContent = remainingContent.replace(match[0], "");
				return remainingContent;
			}
		}

		match = remainingContent.match(this.emojiContextRegex);
		if (match && match[1]) {
			task.context = match[1].trim();
			remainingContent = remainingContent.replace(match[0], "");
		}

		return remainingContent;
	}

	private extractTags(task: Task, content: string): string {
		let remainingContent = content;
		const preferDataview = this.config.preferMetadataFormat === "dataview";

		if (preferDataview) {
			remainingContent = remainingContent.replace(
				this.anyDataviewFieldRegex,
				""
			);
		}

		const tagMatches = remainingContent.match(this.emojiTagRegex) || [];
		task.tags = tagMatches.map((tag) => tag.trim());

		if (!preferDataview && !task.project) {
			const projectTag = task.tags.find((tag) =>
				tag.startsWith(this.config.projectPrefix!)
			);
			if (projectTag) {
				task.project = projectTag.substring(
					this.config.projectPrefix!.length
				);
			}
		}

		if (preferDataview) {
			task.tags = task.tags.filter(
				(tag) => !tag.startsWith(this.config.projectPrefix!)
			);
		}

		let contentWithoutTags = remainingContent;
		for (const tag of task.tags) {
			const tagRegex = new RegExp(
				`\s?${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\s|$)`,
				"g"
			);
			contentWithoutTags = contentWithoutTags.replace(tagRegex, "");
		}
		contentWithoutTags = contentWithoutTags.replace(/@[\w-]+/g, "").trim();

		return contentWithoutTags.trim();
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

		if (metadata?.listItems && metadata.listItems.length > 0) {
			const taskListItems = metadata.listItems.filter(
				(item) => item.task !== undefined
			);

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
							error,
							`Line: "${line}"`,
							listItem
						);
					}
				}
			}

			for (const listItem of taskListItems) {
				const lineNum = listItem.position.start.line;
				const task = tasksByLine[lineNum];
				if (task && listItem.parent >= 0) {
					const parentTask = tasksByLine[listItem.parent];
					if (parentTask) {
						task.parent = parentTask.id;
						if (!parentTask.children) {
							parentTask.children = [];
						}
						parentTask.children.push(task.id);
					}
				}
			}
		} else {
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
						error,
						`Line: "${line}"`
					);
				}
			}

			this.buildTaskHierarchyByIndent(tasks);
		}

		return tasks;
	}

	private buildTaskHierarchyByIndent(tasks: Task[]): void {
		tasks.sort((a, b) => a.line - b.line);
		const taskStack: { task: Task; indent: number }[] = [];

		for (const currentTask of tasks) {
			const currentIndent = this.getIndentLevel(
				currentTask.originalMarkdown
			);

			while (
				taskStack.length > 0 &&
				taskStack[taskStack.length - 1].indent >= currentIndent
			) {
				taskStack.pop();
			}

			if (taskStack.length > 0) {
				const parentTask = taskStack[taskStack.length - 1].task;
				currentTask.parent = parentTask.id;
				if (!parentTask.children) {
					parentTask.children = [];
				}
				parentTask.children.push(currentTask.id);
			}

			taskStack.push({ task: currentTask, indent: currentIndent });
		}
	}

	private getIndentLevel(line: string): number {
		const match = line.match(/^(\s*)/);
		return match ? match[1].length : 0;
	}
}
