/**
 * Web worker for background processing of task indexing
 * Enhanced with configurable task parser
 */

import { FileStats } from "obsidian";
import { Task, TgProject } from "../../types/task";
import {
	IndexerCommand,
	TaskParseResult,
	ErrorResult,
	BatchIndexResult,
	TaskWorkerSettings,
} from "./task-index-message";
import { parse } from "date-fns/parse";
import { MarkdownTaskParser } from "../core/ConfigurableTaskParser";
import { getConfig } from "../../common/task-parser-config";
import { FileMetadataTaskParser } from "../../parsers/file-metadata-parser";
import { CanvasParser } from "../core/CanvasParser";
import { SupportedFileType } from "@/utils/file/file-type-detector";

/**
 * Enhanced task parsing using configurable parser
 */
function parseTasksWithConfigurableParser(
	filePath: string,
	content: string,
	settings: TaskWorkerSettings,
	fileMetadata?: Record<string, any>,
): Task[] {
	try {
		// Create a mock plugin object with settings for getConfig
		const mockPlugin = { settings };
		const config = getConfig(settings.preferMetadataFormat, mockPlugin);

		// Debug: show incoming prefixes and effective specialTagPrefixes keys
		try {
			console.debug("[Task Genius][Worker] incoming prefixes", {
				preferMetadataFormat: settings.preferMetadataFormat,
				projectTagPrefix: settings.projectTagPrefix,
				contextTagPrefix: settings.contextTagPrefix,
				areaTagPrefix: settings.areaTagPrefix,
			});
			console.debug(
				"[Task Genius][Worker] specialTagPrefixes keys (before)",
				Object.keys(config.specialTagPrefixes || {}),
			);
		} catch {}

		// Ensure case-insensitive prefixes by duplicating lower-case keys (avoid duplicates)
		if (config.specialTagPrefixes) {
			const lowerDup: Record<string, string> = {};
			for (const k of Object.keys(config.specialTagPrefixes)) {
				const lowerKey = String(k).toLowerCase();
				// Only add lowercase version if it doesn't already exist and is different from original
				if (lowerKey !== k && !config.specialTagPrefixes[lowerKey]) {
					lowerDup[lowerKey] = config.specialTagPrefixes[k];
				}
			}
			config.specialTagPrefixes = {
				...config.specialTagPrefixes,
				...lowerDup,
			};
			try {
				console.debug(
					"[Task Genius][Worker] specialTagPrefixes keys (after)",
					Object.keys(config.specialTagPrefixes),
				);
			} catch {}
		}

		// Add project configuration to parser config
		if (
			settings.projectConfig &&
			settings.projectConfig.enableEnhancedProject
		) {
			config.projectConfig = settings.projectConfig;
		}

		const parser = new MarkdownTaskParser(config);

		// Raw parsing only - no project enhancement per dataflow architecture
		// Project data will be handled by Augmentor in main thread

		const tasks = parser.parseLegacy(
			content,
			filePath,
			fileMetadata,
			undefined, // No project config in worker
			undefined, // No tgProject in worker
		);

		// Apply heading filters if specified
		return tasks.filter((task) => {
			// Parse comma-separated heading filters and normalize them
			// Remove leading # symbols since task.metadata.heading contains only the text
			const ignoreHeadings = settings.ignoreHeading
				? settings.ignoreHeading
						.split(",")
						.map((h) => {
							// Trim and remove leading # symbols
							const trimmed = h.trim();
							return trimmed.replace(/^#+\s*/, "");
						})
						.filter((h) => h)
				: [];

			const focusHeadings = settings.focusHeading
				? settings.focusHeading
						.split(",")
						.map((h) => {
							// Trim and remove leading # symbols
							const trimmed = h.trim();
							return trimmed.replace(/^#+\s*/, "");
						})
						.filter((h) => h)
				: [];

			// Filter by ignore heading
			if (ignoreHeadings.length > 0) {
				// If task has no heading and we have ignore headings, let it pass
				if (!task.metadata.heading) {
					return true;
				}

				const taskHeadings = Array.isArray(task.metadata.heading)
					? task.metadata.heading
					: [task.metadata.heading];

				// Check if any task heading matches any ignore heading
				if (
					taskHeadings.some((taskHeading) =>
						ignoreHeadings.some((ignoreHeading) =>
							taskHeading
								.toLowerCase()
								.includes(ignoreHeading.toLowerCase()),
						),
					)
				) {
					return false;
				}
			}

			// Filter by focus heading
			if (focusHeadings.length > 0) {
				// If task has no heading and we have focus headings, exclude it
				if (!task.metadata.heading) {
					return false;
				}

				const taskHeadings = Array.isArray(task.metadata.heading)
					? task.metadata.heading
					: [task.metadata.heading];

				// Check if any task heading matches any focus heading
				if (
					!taskHeadings.some((taskHeading) =>
						focusHeadings.some((focusHeading) =>
							taskHeading
								.toLowerCase()
								.includes(focusHeading.toLowerCase()),
						),
					)
				) {
					return false;
				}
			}

			return true;
		});
	} catch (error) {
		console.warn(
			"Configurable parser failed, falling back to legacy parser:",
			error,
		);
		// Fallback to legacy parsing if configurable parser fails
		return parseTasksFromContentLegacy(
			filePath,
			content,
			settings.preferMetadataFormat,
			settings.ignoreHeading,
			settings.focusHeading,
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
	focusHeading: string,
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
	},
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
			},
		);
	}

	// Return the timestamp if we found a valid date
	if (!isNaN(dateFromPath.getTime())) {
		return dateFromPath.getTime();
	}

	return undefined;
}

/**
 * Process a single file using the appropriate parser based on file type
 */
function processFile(
	filePath: string,
	content: string,
	fileExtension: string,
	stats: FileStats,
	settings: TaskWorkerSettings,
	metadata?: { fileCache?: any },
): TaskParseResult {
	const startTime = performance.now();
	try {
		// Extract frontmatter metadata if available
		let fileMetadata: Record<string, any> | undefined;
		if (metadata?.fileCache?.frontmatter) {
			fileMetadata = metadata.fileCache.frontmatter;
		}

		// Use the appropriate parser based on file type
		let tasks: Task[] = [];

		if (fileExtension === SupportedFileType.CANVAS) {
			// Use canvas parser for .canvas files
			const mockPlugin = { settings };
			const canvasParser = new CanvasParser(
				getConfig(settings.preferMetadataFormat, mockPlugin),
			);
			tasks = canvasParser.parseCanvasFile(content, filePath);
		} else if (fileExtension === SupportedFileType.MARKDOWN) {
			// Use configurable parser for .md files
			tasks = parseTasksWithConfigurableParser(
				filePath,
				content,
				settings,
				fileMetadata,
			);
		} else {
			// Unsupported file type
			console.warn(
				`Worker: Unsupported file type: ${fileExtension} for file: ${filePath}`,
			);
			tasks = [];
		}

		// Add file metadata tasks if file parsing is enabled and file type supports it
		// Only apply file metadata parsing to Markdown files, not Canvas files
		// Also check if fileMetadataInheritance is enabled for task metadata inheritance
		if (
			fileExtension === SupportedFileType.MARKDOWN &&
			settings.fileParsingConfig &&
			(settings.fileParsingConfig.enableFileMetadataParsing ||
				settings.fileParsingConfig.enableTagBasedTaskParsing ||
				settings.fileMetadataInheritance?.enabled)
		) {
			try {
				const fileMetadataParser = new FileMetadataTaskParser(
					settings.fileParsingConfig,
					settings.projectConfig?.metadataConfig?.detectionMethods,
				);

				const fileMetadataResult = fileMetadataParser.parseFileForTasks(
					filePath,
					content,
					metadata?.fileCache,
				);

				// Add file metadata tasks to the result
				tasks.push(...fileMetadataResult.tasks);

				// Log any errors from file metadata parsing
				if (fileMetadataResult.errors.length > 0) {
					console.warn(
						`Worker: File metadata parsing errors for ${filePath}:`,
						fileMetadataResult.errors,
					);
				}
			} catch (error) {
				console.error(
					`Worker: Error in file metadata parsing for ${filePath}:`,
					error,
				);
			}
		}

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
		extension: string;
		stats: FileStats;
		metadata?: { fileCache?: any };
	}[],
	settings: TaskWorkerSettings,
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
				file.extension,
				file.stats,
				settings,
				file.metadata,
			);
			totalTasks += parseResult.stats.totalTasks;
			results.push({
				filePath: parseResult.filePath,
				taskCount: parseResult.stats.totalTasks,
			});
		} catch (error) {
			console.error(
				`Worker: Error in batch processing for file ${file.path}:`,
				error,
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
			fileParsingConfig: undefined,
		};

		if (message.type === "parseTasks") {
			try {
				const result = processFile(
					message.filePath,
					message.content,
					message.fileExtension,
					message.stats,
					settings,
					message.metadata,
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
				message,
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
