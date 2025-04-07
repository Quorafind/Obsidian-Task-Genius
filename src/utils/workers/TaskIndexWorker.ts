/**
 * Web worker for background processing of task indexing
 */

import { FileStats } from "obsidian";
import { Task } from "../types/TaskIndex";
import { 
	BatchIndexCommand, 
	BatchIndexResult, 
	ErrorResult, 
	IndexerCommand, 
	IndexerResult, 
	ParseTasksCommand, 
	TaskParseResult 
} from "./TaskIndexWorkerMessage";

/**
 * Regular expressions for parsing task components
 */
const TASK_REGEX = /^([\s>]*- \[(.)\])\s*(.*)$/m;
const START_DATE_REGEX = /📅 (\d{4}-\d{2}-\d{2})/;
const COMPLETED_DATE_REGEX = /✅ (\d{4}-\d{2}-\d{2})/;
const DUE_DATE_REGEX = /⏳ (\d{4}-\d{2}-\d{2})/;
const SCHEDULED_DATE_REGEX = /⏰ (\d{4}-\d{2}-\d{2})/;
const RECURRENCE_REGEX = /🔁 (.*?)(?=\s|$)/;
const TAG_REGEX = /#[\w\/-]+/g;
const CONTEXT_REGEX = /@[\w-]+/g;
const PRIORITY_REGEX = /🔼|⏫|🔽|⏬️|🔺|\[#[A-C]\]/;
const PRIORITY_MAP: Record<string, number> = {
	"⏫": 3, // High
	"🔼": 2, // Medium
	"🔽": 1, // Low
	"⏬️": 1, // Lowest
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
			tasks = parseTasksFromListItems(filePath, content, metadata.listItems);
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
		throw error;
	}
}

/**
 * Parse tasks from Obsidian's ListItemCache
 */
function parseTasksFromListItems(filePath: string, content: string, listItems: any[]): Task[] {
	const tasks: Task[] = [];
	const lines = content.split(/\r?\n/);
	
	// 遍历所有列表项，找出任务项
	for (const item of listItems) {
		// 只处理任务项（有task属性的列表项）
		if (item.task !== undefined) {
			const line = item.position?.start?.line;
			if (line === undefined) continue;
			
			const lineContent = lines[line];
			if (!lineContent) continue;
			
			// 基本任务信息
			const task: Task = {
				id: `${filePath}-L${line}`,
				content: extractTaskContent(lineContent),
				filePath,
				line,
				completed: item.task !== ' ', // 空格表示未完成
				originalMarkdown: lineContent,
				tags: [],
				children: [],
			};
			
			// 提取元数据
			extractDates(task, task.content);
			extractTags(task, task.content);
			extractContext(task, task.content);
			extractPriority(task, task.content);
			
			tasks.push(task);
		}
	}
	
	// 构建父子关系
	buildTaskHierarchyFromListItems(tasks, listItems);
	
	return tasks;
}

/**
 * 从任务文本中提取实际内容（移除checkbox部分）
 */
function extractTaskContent(line: string): string {
	const taskMatch = line.match(TASK_REGEX);
	if (taskMatch) {
		return taskMatch[3].trim();
	}
	return line.trim();
}

/**
 * 从 ListItemCache 构建任务层级关系
 */
function buildTaskHierarchyFromListItems(tasks: Task[], listItems: any[]): void {
	// 创建行号到任务的映射
	const lineToTask = new Map<number, Task>();
	tasks.forEach(task => {
		lineToTask.set(task.line, task);
	});
	
	// 建立父子关系
	for (const item of listItems) {
		if (item.task !== undefined) {
			const line = item.position?.start?.line;
			if (line === undefined) continue;
			
			const task = lineToTask.get(line);
			if (!task) continue;
			
			// 查找父任务
			if (item.parent > 0) { // 正数表示父项的行号
				const parentTask = lineToTask.get(item.parent);
				if (parentTask) {
					task.parent = parentTask.id;
					parentTask.children.push(task.id);
				}
			}
		}
	}
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

/**
 * Web worker message handler
 */
self.onmessage = async (event) => {
	try {
		const message = event.data as IndexerCommand;

		if (message.type === "parseTasks") {
			const result = processFile(
				message.filePath,
				message.content,
				message.stats,
				message.metadata
			);
			self.postMessage(result);
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
