/**
 * Web worker for background processing of task indexing
 */

import { FileStats } from "obsidian";
import { Task } from "../types/TaskIndex";
import {
	BatchIndexResult,
	ErrorResult,
	IndexerCommand,
	TaskParseResult,
} from "./TaskIndexWorkerMessage";
import {
	DEFAULT_SYMBOLS,
	TASK_REGEX,
	TAG_REGEX,
	CONTEXT_REGEX,
} from "../../common/default-symbol";

// Helper function to create date field regex

function dateFieldRegex(symbols: string) {
	return fieldRegex(symbols, "(\\d{4}-\\d{2}-\\d{2})");
}

function fieldRegex(symbols: string, valueRegexString: string) {
	// \uFE0F? allows an optional Variant Selector 16 on emojis.
	let source = symbols + "\uFE0F?";
	if (valueRegexString !== "") {
		source += " *" + valueRegexString;
	}
	return new RegExp(source, "u");
}

// Regular expressions for task metadata
const START_DATE_REGEX = dateFieldRegex(DEFAULT_SYMBOLS.startDateSymbol);
const COMPLETED_DATE_REGEX = dateFieldRegex(DEFAULT_SYMBOLS.doneDateSymbol);
const DUE_DATE_REGEX = dateFieldRegex(DEFAULT_SYMBOLS.dueDateSymbol);
const SCHEDULED_DATE_REGEX = dateFieldRegex(
	DEFAULT_SYMBOLS.scheduledDateSymbol
);
const RECURRENCE_REGEX = fieldRegex(
	DEFAULT_SYMBOLS.recurrenceSymbol,
	"([a-zA-Z0-9, !]+)"
);
const PRIORITY_REGEX = /🔼|⏫|🔽|⏬|🔺|\[#[A-C]\]/;
const PRIORITY_MAP: Record<string, number> = {
	"⏫": 4, // High
	"🔼": 3, // Medium
	"🔽": 2, // Low
	"⏬": 1, // Lowest
	"🔺": 5, // Highest
	"[#A]": 4, // High (letter format)
	"[#B]": 3, // Medium (letter format)
	"[#C]": 2, // Low (letter format)
};

/**
 * Parse tasks from file content
 */
function parseTasksFromContent(filePath: string, content: string): Task[] {
	const lines = content.split(/\r?\n/);
	const tasks: Task[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const taskMatch = line.match(TASK_REGEX);

		if (taskMatch) {
			const [, prefix, status, content] = taskMatch;
			const completed = status.toLowerCase() === "x";

			// Generate a deterministic ID based on file path and line number
			// This helps with task tracking across worker calls
			const id = `${filePath}-L${i}`;

			// Basic task info
			const task: Task = {
				id,
				content: content.trim(),
				filePath,
				line: i,
				completed,
				status: status.trim(),
				originalMarkdown: line,
				tags: [],
				children: [],
			};

			// Extract metadata
			extractDates(task, content);
			extractTags(task, content);
			extractContext(task, content);
			extractPriority(task, content);

			tasks.push(task);
		}
	}

	// Build parent-child relationships
	buildTaskHierarchy(tasks);

	return tasks;
}

/**
 * Extract dates from task content
 */
function extractDates(task: Task, content: string): void {
	// Start date
	const startDateMatch = content.match(START_DATE_REGEX);
	if (startDateMatch) {
		task.startDate = new Date(startDateMatch[1]).getTime();
	}

	// Due date
	const dueDateMatch = content.match(DUE_DATE_REGEX);
	if (dueDateMatch) {
		task.dueDate = new Date(dueDateMatch[1]).getTime();
	}

	// Scheduled date
	const scheduledDateMatch = content.match(SCHEDULED_DATE_REGEX);
	if (scheduledDateMatch) {
		task.scheduledDate = new Date(scheduledDateMatch[1]).getTime();
	}

	// Completion date
	const completedDateMatch = content.match(COMPLETED_DATE_REGEX);
	if (completedDateMatch) {
		task.completedDate = new Date(completedDateMatch[1]).getTime();
	}
}

/**
 * Extract tags from task content
 */
function extractTags(task: Task, content: string): void {
	const tagMatches = content.match(TAG_REGEX) || [];
	task.tags = tagMatches.map((tag) => tag.trim());

	// Check for project tags
	const projectTag = task.tags.find((tag) => tag.startsWith("#project/"));
	if (projectTag) {
		task.project = projectTag.substring("#project/".length);
	}
}

/**
 * Extract context from task content
 */
function extractContext(task: Task, content: string): void {
	const contextMatches = content.match(CONTEXT_REGEX) || [];
	if (contextMatches.length > 0) {
		// Use the first context tag as the primary context
		task.context = contextMatches[0]?.substring(1); // Remove the @ symbol
	}
}

/**
 * Extract priority from task content
 */
function extractPriority(task: Task, content: string): void {
	const priorityMatch = content.match(PRIORITY_REGEX);
	if (priorityMatch) {
		task.priority = PRIORITY_MAP[priorityMatch[0]] || undefined;
	}
}

/**
 * Build parent-child relationships between tasks
 */
function buildTaskHierarchy(tasks: Task[]): void {
	// Sort tasks by line number
	tasks.sort((a, b) => a.line - b.line);

	// Build parent-child relationships based on indentation
	for (let i = 0; i < tasks.length; i++) {
		const currentTask = tasks[i];
		const currentIndent = getIndentLevel(currentTask.originalMarkdown);

		// Look for potential parent tasks (must be before current task and have less indentation)
		for (let j = i - 1; j >= 0; j--) {
			const potentialParent = tasks[j];
			const parentIndent = getIndentLevel(
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
function getIndentLevel(line: string): number {
	const match = line.match(/^(\s*)/);
	return match ? match[1].length : 0;
}

/**
 * Process a single file
 */
function processFile(
	filePath: string,
	content: string,
	stats: FileStats,
	metadata?: { listItems?: any[] }
): TaskParseResult {
	const startTime = performance.now();

	try {
		// 如果提供了 listItems 元数据，优先利用它来构建任务
		let tasks: Task[] = [];

		if (metadata?.listItems && metadata.listItems.length > 0) {
			// 使用 Obsidian 的元数据缓存来构建任务
			tasks = parseTasksFromListItems(
				filePath,
				content,
				metadata.listItems
			);
		} else {
			// 回退到正则表达式解析
			tasks = parseTasksFromContent(filePath, content);
		}

		const completedTasks = tasks.filter((t) => t.completed).length;

		return {
			type: "parseResult",
			filePath,
			tasks,
			stats: {
				totalTasks: tasks.length,
				completedTasks,
				processingTimeMs: Math.round(performance.now() - startTime),
			},
		};
	} catch (error) {
		console.error(`Error processing file ${filePath}:`, error);
		// 重新抛出错误，让外层调用者处理
		throw error;
	}
}

/**
 * Parse tasks from Obsidian's ListItemCache
 */
function parseTasksFromListItems(
	filePath: string,
	content: string,
	listItems: any[]
): Task[] {
	const tasks: Task[] = [];
	const lines = content.split(/\r?\n/);
	const tasksByLine: Record<number, Task> = {};

	// 过滤出任务项（有task属性的列表项）
	const taskListItems = listItems.filter((item) => item.task !== undefined);

	// 第一步：解析所有任务
	for (const item of taskListItems) {
		const line = item.position?.start?.line;
		if (line === undefined || line >= lines.length) continue;

		const lineContent = lines[line];
		if (!lineContent) continue;

		// 提取任务内容
		const contentMatch = lineContent.match(
			/^(([\s>]*)?(-|\d+\.|\*|\+)\s\[(.)\])\s*(.*)$/
		);
		if (!contentMatch) continue;

		// 任务内容在第5个捕获组
		const taskContent = contentMatch[5];
		if (!taskContent) continue;

		// 基本任务信息
		const task: Task = {
			id: `${filePath}-L${line}`,
			content: taskContent.trim(),
			filePath,
			line,
			completed: ["x", "X"].includes(item.task), // 空格表示未完成
			status: item.task,
			originalMarkdown: lineContent,
			tags: [],
			children: [],
		};

		// 提取元数据
		extractDates(task, taskContent);
		extractTags(task, taskContent);
		extractContext(task, taskContent);
		extractPriority(task, taskContent);

		tasks.push(task);
		tasksByLine[line] = task;
	}

	// 第二步：构建父子关系
	for (const item of taskListItems) {
		const line = item.position?.start?.line;
		if (line === undefined) continue;

		const task = tasksByLine[line];
		if (!task) continue;

		// 如果parent是正数，表示父项的行号
		if (item.parent >= 0) {
			const parentTask = tasksByLine[item.parent];
			if (parentTask) {
				task.parent = parentTask.id;
				parentTask.children.push(task.id);
			}
		}
	}

	return tasks;
}

/**
 * Process multiple files in batch
 */
function processBatch(
	files: { path: string; content: string; stats: FileStats }[]
): BatchIndexResult {
	const startTime = performance.now();
	const results: { filePath: string; taskCount: number }[] = [];
	let totalTasks = 0;

	for (const file of files) {
		try {
			const parseResult = processFile(
				file.path,
				file.content,
				file.stats
			);
			totalTasks += parseResult.stats.totalTasks;
			results.push({
				filePath: file.path,
				taskCount: parseResult.stats.totalTasks,
			});
		} catch (error) {
			console.error(
				`Error in batch processing for file ${file.path}:`,
				error
			);
			// Continue with other files even if one fails
		}
	}

	return {
		type: "batchResult",
		results,
		stats: {
			totalFiles: files.length,
			totalTasks,
			processingTimeMs: Math.round(performance.now() - startTime),
		},
	};
}

// Remove the self.onmessage handler and export the functionality directly
self.onmessage = async (event) => {
	try {
		const message = event.data as IndexerCommand;

		if (message.type === "parseTasks") {
			try {
				const result = processFile(
					message.filePath,
					message.content,
					message.stats,
					message.metadata
				);
				self.postMessage(result);
			} catch (error) {
				self.postMessage({
					type: "error",
					error:
						error instanceof Error ? error.message : String(error),
					filePath: message.filePath,
				} as ErrorResult);
			}
		} else if (message.type === "batchIndex") {
			const result = processBatch(message.files);
			self.postMessage(result);
		} else {
			self.postMessage({
				type: "error",
				error: `Unknown command type: ${(message as any).type}`,
			} as ErrorResult);
		}
	} catch (error) {
		self.postMessage({
			type: "error",
			error: error instanceof Error ? error.message : String(error),
		} as ErrorResult);
	}
};
