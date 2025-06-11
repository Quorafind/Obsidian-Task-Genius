/**
 * Web worker for background processing of task indexing
 * Enhanced with configurable task parser
 */

import { FileStats } from "obsidian";
import { Task } from "../../types/task";
import {
	IndexerCommand,
	TaskParseResult,
	ErrorResult,
	BatchIndexResult,
	TaskWorkerSettings,
} from "./TaskIndexWorkerMessage";
import { parse } from "date-fns/parse";
import { MarkdownTaskParser } from "./ConfigurableTaskParser";
import { getConfig } from "../../common/task-parser-config";

/**
 * Enhanced task parsing using configurable parser
 */
function parseTasksWithConfigurableParser(
	filePath: string,
	content: string,
	settings: TaskWorkerSettings,
	fileMetadata?: Record<string, any>
): Task[] {
	try {
		const config = getConfig(settings.preferMetadataFormat);

		// Add project configuration to parser config
		if (settings.projectConfig) {
			config.projectConfig = settings.projectConfig;
		}

		const parser = new MarkdownTaskParser(config);

		// Use the parseLegacy method to get Task[] format for compatibility
		// Pass file metadata to the parser
		const tasks = parser.parseLegacy(content, filePath, fileMetadata);

		// Apply heading filters if specified
		return tasks.filter((task) => {
			// Filter by ignore heading
			if (settings.ignoreHeading && task.metadata.heading) {
				const headings = Array.isArray(task.metadata.heading)
					? task.metadata.heading
					: [task.metadata.heading];

				if (headings.some((h) => h.includes(settings.ignoreHeading))) {
					return false;
				}
			}

			// Filter by focus heading
			if (settings.focusHeading && task.metadata.heading) {
				const headings = Array.isArray(task.metadata.heading)
					? task.metadata.heading
					: [task.metadata.heading];

				if (!headings.some((h) => h.includes(settings.focusHeading))) {
					return false;
				}
			}

			return true;
		});
	} catch (error) {
		console.warn(
			"Configurable parser failed, falling back to legacy parser:",
			error
		);
		// Fallback to legacy parsing if configurable parser fails
		return parseTasksFromContentLegacy(
			filePath,
			content,
			settings.preferMetadataFormat,
			settings.ignoreHeading,
			settings.focusHeading
		);
	}
}

/**
 * Legacy parsing function kept as fallback
 */
function parseTasksFromContentLegacy(
	filePath: string,
	content: string,
	format: "tasks" | "dataview",
	ignoreHeading: string,
	focusHeading: string
): Task[] {
	// Basic fallback parsing for critical errors
	const lines = content.split("\n");
	const tasks: Task[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const taskMatch = line.match(/^(\s*[-*+]|\d+\.)\s*\[(.)\]\s*(.*)$/);

		if (taskMatch) {
			const [, , status, taskContent] = taskMatch;
			const completed = status.toLowerCase() === "x";

			tasks.push({
				id: `${filePath}-L${i}`,
				content: taskContent.trim(),
				filePath,
				line: i,
				completed,
				status,
				originalMarkdown: line,
				metadata: {
					tags: [],
					children: [],
					heading: [],
				},
			});
		}
	}

	return tasks;
}

/**
 * Extract date from file path
 */
function extractDateFromPath(
	filePath: string,
	settings: {
		useDailyNotePathAsDate: boolean;
		dailyNoteFormat: string;
		dailyNotePath: string;
	}
): number | undefined {
	if (!settings.useDailyNotePathAsDate) return undefined;

	// Remove file extension first
	let pathToMatch = filePath.replace(/\.[^/.]+$/, "");

	// If dailyNotePath is specified, remove it from the path
	if (
		settings.dailyNotePath &&
		pathToMatch.startsWith(settings.dailyNotePath)
	) {
		pathToMatch = pathToMatch.substring(settings.dailyNotePath.length);
		// Remove leading slash if present
		if (pathToMatch.startsWith("/")) {
			pathToMatch = pathToMatch.substring(1);
		}
	}

	// Try to match with the current path
	let dateFromPath = parse(pathToMatch, settings.dailyNoteFormat, new Date());

	// If no match, recursively try with subpaths
	if (isNaN(dateFromPath.getTime()) && pathToMatch.includes("/")) {
		return extractDateFromPath(
			pathToMatch.substring(pathToMatch.indexOf("/") + 1),
			{
				...settings,
				dailyNotePath: "", // Clear dailyNotePath for recursive calls
			}
		);
	}

	// Return the timestamp if we found a valid date
	if (!isNaN(dateFromPath.getTime())) {
		return dateFromPath.getTime();
	}

	return undefined;
}

/**
 * Process a single file using the configurable parser
 */
function processFile(
	filePath: string,
	content: string,
	stats: FileStats,
	settings: TaskWorkerSettings,
	metadata?: { fileCache?: any }
): TaskParseResult {
	const startTime = performance.now();
	try {
		// Extract frontmatter metadata if available
		let fileMetadata: Record<string, any> | undefined;
		if (metadata?.fileCache?.frontmatter) {
			fileMetadata = metadata.fileCache.frontmatter;
		}

		// Use the configurable parser
		const tasks = parseTasksWithConfigurableParser(
			filePath,
			content,
			settings,
			fileMetadata
		);
		const completedTasks = tasks.filter((t) => t.completed).length;

		// Apply daily note date extraction if configured
		try {
			if (
				(filePath.startsWith(settings.dailyNotePath) ||
					("/" + filePath).startsWith(settings.dailyNotePath)) &&
				settings.dailyNotePath &&
				settings.useDailyNotePathAsDate
			) {
				for (const task of tasks) {
					const dateFromPath = extractDateFromPath(filePath, {
						useDailyNotePathAsDate: settings.useDailyNotePathAsDate,
						dailyNoteFormat: settings.dailyNoteFormat
							.replace(/Y/g, "y")
							.replace(/D/g, "d"),
						dailyNotePath: settings.dailyNotePath,
					});
					if (dateFromPath) {
						if (
							settings.useAsDateType === "due" &&
							!task.metadata.dueDate
						) {
							task.metadata.dueDate = dateFromPath;
						} else if (
							settings.useAsDateType === "start" &&
							!task.metadata.startDate
						) {
							task.metadata.startDate = dateFromPath;
						} else if (
							settings.useAsDateType === "scheduled" &&
							!task.metadata.scheduledDate
						) {
							task.metadata.scheduledDate = dateFromPath;
						}

						task.metadata.useAsDateType = settings.useAsDateType;
					}
				}
			}
		} catch (error) {
			console.error(`Worker: Error processing file ${filePath}:`, error);
		}

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

/**
 * Process a batch of files
 */
function processBatch(
	files: {
		path: string;
		content: string;
		stats: FileStats;
		metadata?: { fileCache?: any };
	}[],
	settings: TaskWorkerSettings
): BatchIndexResult {
	const startTime = performance.now();
	const results: { filePath: string; taskCount: number }[] = [];
	let totalTasks = 0;
	let failedFiles = 0;

	for (const file of files) {
		try {
			const parseResult = processFile(
				file.path,
				file.content,
				file.stats,
				settings,
				file.metadata
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
		results,
		stats: {
			totalFiles: files.length,
			totalTasks,
			processingTimeMs: Math.round(performance.now() - startTime),
		},
	};
}

/**
 * Worker message handler
 */
self.onmessage = async (event) => {
	try {
		const message = event.data as IndexerCommand;

		// Provide default settings if missing
		const settings = message.settings || {
			preferMetadataFormat: "tasks",
			useDailyNotePathAsDate: false,
			dailyNoteFormat: "yyyy-MM-dd",
			useAsDateType: "due",
			dailyNotePath: "",
			ignoreHeading: "",
			focusHeading: "",
			projectConfig: undefined,
		};

		if (message.type === "parseTasks") {
			try {
				const result = processFile(
					message.filePath,
					message.content,
					message.stats,
					settings
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
			const result = processBatch(message.files, settings);
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
