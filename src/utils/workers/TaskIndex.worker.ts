/**
 * Web worker for background processing of task indexing
 */

import { FileStats } from "obsidian"; // Assuming ListItemCache is not directly available/serializable to worker, rely on regex
import { Task } from "../types/TaskIndex"; // Task type definition needed
import {
	// Assume these types are defined and exported from TaskIndexWorkerMessage.ts
	// Need to add preferMetadataFormat to IndexerCommand payloads where relevant
	IndexerCommand,
	TaskParseResult,
	ErrorResult,
	BatchIndexResult, // Keep if batch processing is still used
} from "./TaskIndexWorkerMessage";

// --- Define Regexes similar to TaskParser ---

// Task identification
const TASK_REGEX = /^(([\s>]*)?(-|\d+\.|\*|\+)\s\[(.)\])\s*(.*)$/m;

// --- Emoji/Tasks Style Regexes ---
const EMOJI_START_DATE_REGEX = /🛫\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_COMPLETED_DATE_REGEX = /✅\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_DUE_DATE_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_SCHEDULED_DATE_REGEX = /⏳\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_CREATED_DATE_REGEX = /➕\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_RECURRENCE_REGEX = /🔁\s*(.*?)(?=\s(?:🗓️|🛫|⏳|✅|➕|🔁|@|#)|$)/u;
const EMOJI_PRIORITY_REGEX = /(([🔺⏫🔼🔽⏬️⏬])|(\[#[A-E]\]))/u; // Using the corrected variant selector
const EMOJI_CONTEXT_REGEX = /@([\w-]+)/g;
const EMOJI_TAG_REGEX = /#([\w/-]+)/g; // Includes #project/ tags
const EMOJI_PROJECT_PREFIX = "#project/";

// --- Dataview Style Regexes ---
const DV_START_DATE_REGEX = /\[(?:start|🛫)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_COMPLETED_DATE_REGEX =
	/\[(?:completion|✅)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_DUE_DATE_REGEX = /\[(?:due|🗓️)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_SCHEDULED_DATE_REGEX = /\[(?:scheduled|⏳)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_CREATED_DATE_REGEX = /\[(?:created|➕)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_RECURRENCE_REGEX = /\[(?:repeat|recurrence|🔁)::\s*([^\]]+)\]/i;
const DV_PRIORITY_REGEX = /\[priority::\s*([^\]]+)\]/i;
const DV_PROJECT_REGEX = /\[project::\s*([^\]]+)\]/i;
const DV_CONTEXT_REGEX = /\[context::\s*([^\]]+)\]/i;
// Dataview Tag Regex is the same, applied after DV field removal
const ANY_DATAVIEW_FIELD_REGEX = /\[\w+(?:|🗓️|✅|➕|🛫|⏳|🔁)::\s*[^\]]+\]/gi;

// --- Priority Mapping --- (Combine from TaskParser)
const PRIORITY_MAP: Record<string, number> = {
	"🔺": 5,
	"⏫": 4,
	"🔼": 3,
	"🔽": 2,
	"⏬️": 1,
	"⏬": 1,
	"[#A]": 4,
	"[#B]": 3,
	"[#C]": 2, // Keep Taskpaper style? Maybe remove later
	highest: 5,
	high: 4,
	medium: 3,
	low: 2,
	lowest: 1,
	// Consider adding number string keys? e.g. "5": 5?
};

type MetadataFormat = "tasks" | "dataview"; // Define the type for clarity

// --- Helper function to parse date string ---
function parseLocalDate(dateString: string): number | undefined {
	if (!dateString) return undefined;
	const parts = dateString.split("-");
	if (parts.length === 3) {
		const year = parseInt(parts[0], 10);
		const month = parseInt(parts[1], 10); // 1-based month
		const day = parseInt(parts[2], 10);
		if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
			// Create Date object using UTC to avoid timezone shifts affecting the date part
			// Then get time. Or just use local date constructor if consistency is guaranteed.
			// Using local date constructor:
			return new Date(year, month - 1, day).getTime();
		}
	}
	console.warn(`Worker: Invalid date format encountered: ${dateString}`);
	return undefined;
}

// --- Refactored Metadata Extraction Functions ---

// Each function now takes task, content, and format, returns remaining content
// They modify the task object directly.

function extractDates(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";

	const tryParseAndAssign = (
		regex: RegExp,
		fieldName:
			| "dueDate"
			| "scheduledDate"
			| "startDate"
			| "completedDate"
			| "createdDate"
	): boolean => {
		if (task[fieldName] !== undefined) return false; // Already assigned

		const match = remainingContent.match(regex);
		if (match && match[1]) {
			const dateVal = parseLocalDate(match[1]);
			if (dateVal !== undefined) {
				task[fieldName] = dateVal; // Direct assignment is type-safe
				remainingContent = remainingContent.replace(match[0], "");
				return true;
			}
		}
		return false;
	};

	// Due Date
	if (useDataview) {
		!tryParseAndAssign(DV_DUE_DATE_REGEX, "dueDate") &&
			tryParseAndAssign(EMOJI_DUE_DATE_REGEX, "dueDate");
	} else {
		!tryParseAndAssign(EMOJI_DUE_DATE_REGEX, "dueDate") &&
			tryParseAndAssign(DV_DUE_DATE_REGEX, "dueDate");
	}

	// Scheduled Date
	if (useDataview) {
		!tryParseAndAssign(DV_SCHEDULED_DATE_REGEX, "scheduledDate") &&
			tryParseAndAssign(EMOJI_SCHEDULED_DATE_REGEX, "scheduledDate");
	} else {
		!tryParseAndAssign(EMOJI_SCHEDULED_DATE_REGEX, "scheduledDate") &&
			tryParseAndAssign(DV_SCHEDULED_DATE_REGEX, "scheduledDate");
	}

	// Start Date
	if (useDataview) {
		!tryParseAndAssign(DV_START_DATE_REGEX, "startDate") &&
			tryParseAndAssign(EMOJI_START_DATE_REGEX, "startDate");
	} else {
		!tryParseAndAssign(EMOJI_START_DATE_REGEX, "startDate") &&
			tryParseAndAssign(DV_START_DATE_REGEX, "startDate");
	}

	// Completion Date
	if (useDataview) {
		!tryParseAndAssign(DV_COMPLETED_DATE_REGEX, "completedDate") &&
			tryParseAndAssign(EMOJI_COMPLETED_DATE_REGEX, "completedDate");
	} else {
		!tryParseAndAssign(EMOJI_COMPLETED_DATE_REGEX, "completedDate") &&
			tryParseAndAssign(DV_COMPLETED_DATE_REGEX, "completedDate");
	}

	// Created Date
	if (useDataview) {
		!tryParseAndAssign(DV_CREATED_DATE_REGEX, "createdDate") &&
			tryParseAndAssign(EMOJI_CREATED_DATE_REGEX, "createdDate");
	} else {
		!tryParseAndAssign(EMOJI_CREATED_DATE_REGEX, "createdDate") &&
			tryParseAndAssign(DV_CREATED_DATE_REGEX, "createdDate");
	}

	return remainingContent;
}

function extractRecurrence(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";
	let match: RegExpMatchArray | null = null;

	if (useDataview) {
		match = remainingContent.match(DV_RECURRENCE_REGEX);
		if (match && match[1]) {
			task.recurrence = match[1].trim();
			remainingContent = remainingContent.replace(match[0], "");
			return remainingContent; // Found preferred format
		}
	}

	// Try emoji format (primary or fallback)
	match = remainingContent.match(EMOJI_RECURRENCE_REGEX);
	if (match && match[1]) {
		task.recurrence = match[1].trim();
		remainingContent = remainingContent.replace(match[0], "");
	}

	return remainingContent;
}

function extractPriority(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";
	let match: RegExpMatchArray | null = null;

	if (useDataview) {
		match = remainingContent.match(DV_PRIORITY_REGEX);
		if (match && match[1]) {
			const priorityValue = match[1].trim().toLowerCase();
			const mappedPriority = PRIORITY_MAP[priorityValue];
			if (mappedPriority !== undefined) {
				task.priority = mappedPriority;
				remainingContent = remainingContent.replace(match[0], "");
				return remainingContent;
			} else {
				const numericPriority = parseInt(priorityValue, 10);
				if (!isNaN(numericPriority)) {
					task.priority = numericPriority;
					remainingContent = remainingContent.replace(match[0], "");
					return remainingContent;
				}
			}
		}
	}

	// Try emoji format (primary or fallback)
	match = remainingContent.match(EMOJI_PRIORITY_REGEX);
	if (match && match[1]) {
		task.priority = PRIORITY_MAP[match[1]] ?? undefined;
		if (task.priority !== undefined) {
			remainingContent = remainingContent.replace(match[0], "");
		}
	}

	return remainingContent;
}

function extractProject(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";
	let match: RegExpMatchArray | null = null;

	if (useDataview) {
		match = remainingContent.match(DV_PROJECT_REGEX);
		if (match && match[1]) {
			task.project = match[1].trim();
			remainingContent = remainingContent.replace(match[0], "");
			return remainingContent; // Found preferred format
		}
	}

	// Try #project/ prefix (primary or fallback)
	const projectTagRegex = new RegExp(EMOJI_PROJECT_PREFIX + "([\\w/-]+)");
	match = remainingContent.match(projectTagRegex);
	if (match && match[1]) {
		task.project = match[1].trim();
		// Do not remove here; let tag extraction handle it
	}

	return remainingContent;
}

function extractContext(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";
	let match: RegExpMatchArray | null = null;

	if (useDataview) {
		match = remainingContent.match(DV_CONTEXT_REGEX);
		if (match && match[1]) {
			task.context = match[1].trim();
			remainingContent = remainingContent.replace(match[0], "");
			return remainingContent; // Found preferred format
		}
	}

	// Try @ prefix (primary or fallback)
	// Use .exec to find the first match only for @context
	const contextMatch = new RegExp(EMOJI_CONTEXT_REGEX.source, "").exec(
		remainingContent
	); // Non-global search for first
	if (contextMatch && contextMatch[1]) {
		task.context = contextMatch[1].trim();
		// Remove the first matched context tag here to avoid it being parsed as a general tag
		remainingContent = remainingContent.replace(contextMatch[0], "");
	}

	return remainingContent;
}

function extractTags(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";

	// If using Dataview, remove all potential DV fields first
	if (useDataview) {
		remainingContent = remainingContent.replace(
			ANY_DATAVIEW_FIELD_REGEX,
			""
		);
	}

	// Find all #tags in the potentially cleaned content
	const tagMatches = remainingContent.match(EMOJI_TAG_REGEX) || [];
	task.tags = tagMatches.map((tag) => tag.trim());

	// If using 'tasks' (emoji) format, derive project from tags if not set
	// Also make sure project wasn't already set by DV format before falling back
	if (!useDataview && !task.project) {
		const projectTag = task.tags.find((tag) =>
			tag.startsWith(EMOJI_PROJECT_PREFIX)
		);
		if (projectTag) {
			task.project = projectTag.substring(EMOJI_PROJECT_PREFIX.length);
		}
	}

	// If using Dataview format, filter out any remaining #project/ tags from the tag list
	if (useDataview) {
		task.tags = task.tags.filter(
			(tag) => !tag.startsWith(EMOJI_PROJECT_PREFIX)
		);
	}

	// Remove found tags (including potentially #project/ tags if format is 'tasks') from the remaining content
	let contentWithoutTags = remainingContent;
	for (const tag of task.tags) {
		// Ensure the tag is not empty or just '#' before creating regex
		if (tag && tag !== "#") {
			const tagRegex = new RegExp(
				`\s?${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\s|$)`,
				"g"
			);
			contentWithoutTags = contentWithoutTags.replace(tagRegex, "");
		}
	}
	// Also remove any remaining @context tags (if multiple existed and not handled by extractContext)
	contentWithoutTags = contentWithoutTags.replace(/@[\w-]+/g, "").trim();

	return contentWithoutTags.trim();
}

/**
 * Parse tasks from file content using regex and metadata format preference
 */
function parseTasksFromContent(
	filePath: string,
	content: string,
	format: MetadataFormat
): Task[] {
	const lines = content.split(/\r?\n/);
	const tasks: Task[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const taskMatch = line.match(TASK_REGEX);

		if (taskMatch) {
			const [fullMatch, , , , status, contentWithMetadata] = taskMatch;
			if (status === undefined || contentWithMetadata === undefined)
				continue;

			const completed = status.toLowerCase() === "x";
			const id = `${filePath}-L${i}`;

			const task: Task = {
				id,
				content: contentWithMetadata.trim(), // Will be set after extraction
				filePath,
				line: i,
				completed,
				status: status,
				originalMarkdown: line,
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
			};

			// Extract metadata in order
			let remainingContent = contentWithMetadata;
			remainingContent = extractDates(task, remainingContent, format);
			remainingContent = extractRecurrence(
				task,
				remainingContent,
				format
			);
			remainingContent = extractPriority(task, remainingContent, format);
			remainingContent = extractProject(task, remainingContent, format); // Extract project before context/tags
			remainingContent = extractContext(task, remainingContent, format);
			remainingContent = extractTags(task, remainingContent, format); // Tags last

			task.content = remainingContent.replace(/\s{2,}/g, " ").trim();

			tasks.push(task);
		}
	}
	buildTaskHierarchy(tasks); // Call hierarchy builder if needed
	return tasks;
}

/**
 * Process a single file - NOW ACCEPTS METADATA FORMAT
 */
function processFile(
	filePath: string,
	content: string,
	stats: FileStats,
	preferMetadataFormat: MetadataFormat = "tasks"
): TaskParseResult {
	const startTime = performance.now();
	try {
		const tasks = parseTasksFromContent(
			filePath,
			content,
			preferMetadataFormat
		);
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
		console.error(`Worker: Error processing file ${filePath}:`, error);
		throw error;
	}
}

// --- Batch processing function remains largely the same, but calls updated processFile ---
function processBatch(
	files: { path: string; content: string; stats: FileStats }[],
	preferMetadataFormat: MetadataFormat
): BatchIndexResult {
	// Ensure return type matches definition
	const startTime = performance.now();
	const results: { filePath: string; taskCount: number }[] = [];
	let totalTasks = 0;
	let failedFiles = 0; // Keep track for potential logging, but not returned in stats

	for (const file of files) {
		try {
			const parseResult = processFile(
				file.path,
				file.content,
				file.stats,
				preferMetadataFormat
			);
			totalTasks += parseResult.stats.totalTasks;
			results.push({
				filePath: parseResult.filePath,
				taskCount: parseResult.stats.totalTasks,
			});
		} catch (error) {
			console.error(
				`Worker: Error in batch processing for file ${file.path}:`,
				error
			);
			failedFiles++;
		}
	}

	return {
		type: "batchResult",
		results, // Now matches expected type
		stats: {
			// Only include fields defined in the type
			totalFiles: files.length,
			totalTasks,
			processingTimeMs: Math.round(performance.now() - startTime),
		},
	};
}

// --- Update message handler to access properties directly ---
self.onmessage = async (event) => {
	try {
		const message = event.data as IndexerCommand; // Keep using IndexerCommand union type

		// Access preferMetadataFormat directly FROM message, NOT message.payload
		// Provide default 'tasks' if missing
		const format =
			(message as any).preferMetadataFormat === "dataview"
				? "dataview"
				: "tasks";

		// Using 'as any' here because I cannot modify IndexerCommand type directly,
		// but the sending code MUST add this property to the message object.

		if (message.type === "parseTasks") {
			// Type guard for ParseTasksCommand
			try {
				// Access properties directly from message
				const result = processFile(
					message.filePath,
					message.content,
					message.stats,
					format
				);
				self.postMessage(result);
			} catch (error) {
				self.postMessage({
					type: "error",
					error:
						error instanceof Error ? error.message : String(error),
					filePath: message.filePath, // Access directly
				} as ErrorResult);
			}
		} else if (message.type === "batchIndex") {
			// Type guard for BatchIndexCommand
			// Access properties directly from message
			const result = processBatch(message.files, format);
			self.postMessage(result);
		} else {
			console.error(
				"Worker: Unknown or invalid command message:",
				message
			);
			self.postMessage({
				type: "error",
				error: `Unknown command type: ${(message as any).type}`,
			} as ErrorResult);
		}
	} catch (error) {
		console.error("Worker: General error in onmessage handler:", error);
		self.postMessage({
			type: "error",
			error: error instanceof Error ? error.message : String(error),
		} as ErrorResult);
	}
};

// Remove buildTaskHierarchy and getIndentLevel if not used by parseTasksFromContent
// Or keep them if you plan to add indentation-based hierarchy later.
/**
 * Build parent-child relationships based on indentation
 */
function buildTaskHierarchy(tasks: Task[]): void {
	tasks.sort((a, b) => a.line - b.line);
	const taskStack: { task: Task; indent: number }[] = [];
	for (const currentTask of tasks) {
		const currentIndent = getIndentLevel(currentTask.originalMarkdown);
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

/**
 * Get indentation level of a line
 */
function getIndentLevel(line: string): number {
	const match = line.match(/^(\s*)/);
	return match ? match[1].length : 0;
}
