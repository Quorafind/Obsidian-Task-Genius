/**
 * Message types for task indexing worker communication
 */

import { CachedMetadata, FileStats, ListItemCache } from "obsidian";
import { Task } from "../types/TaskIndex";

/**
 * Command to parse tasks from a file
 */
export interface ParseTasksCommand {
	type: "parseTasks";

	/** The file path being processed */
	filePath: string;
	/** The file contents to parse */
	content: string;
	/** File stats information */
	stats: FileStats;
	/** Additional metadata from Obsidian cache */
	metadata?: {
		/** List items from Obsidian's metadata cache */
		listItems?: ListItemCache[];
		/** Full file metadata cache */
		fileCache?: CachedMetadata;
	};
	/** Whether to use dataview format */
	preferMetadataFormat?: "dataview" | "tasks";
}

/**
 * Command to batch index multiple files
 */
export interface BatchIndexCommand {
	type: "batchIndex";

	/** Files to process in batch */
	files: {
		/** The file path */
		path: string;
		/** The file content */
		content: string;
		/** File stats */
		stats: FileStats;
		/** Optional metadata */
		metadata?: {
			listItems?: ListItemCache[];
			fileCache?: CachedMetadata;
		};
	}[];
}

/**
 * Available commands that can be sent to the worker
 */
export type IndexerCommand = ParseTasksCommand | BatchIndexCommand;

/**
 * Result of task parsing
 */
export interface TaskParseResult {
	type: "parseResult";

	/** Path of the file that was processed */
	filePath: string;
	/** Tasks extracted from the file */
	tasks: Task[];
	/** Statistics about the parsing operation */
	stats: {
		/** Total number of tasks found */
		totalTasks: number;
		/** Number of completed tasks */
		completedTasks: number;
		/** Time taken to process in milliseconds */
		processingTimeMs: number;
	};
}

/**
 * Result of batch indexing
 */
export interface BatchIndexResult {
	type: "batchResult";

	/** Results for each file processed */
	results: {
		/** File path */
		filePath: string;
		/** Number of tasks found */
		taskCount: number;
	}[];
	/** Aggregated statistics */
	stats: {
		/** Total number of files processed */
		totalFiles: number;
		/** Total number of tasks found across all files */
		totalTasks: number;
		/** Total processing time in milliseconds */
		processingTimeMs: number;
	};
}

/**
 * Error response
 */
export interface ErrorResult {
	type: "error";

	/** Error message */
	error: string;
	/** File path that caused the error (if available) */
	filePath?: string;
}

/**
 * All possible results from the worker
 */
export type IndexerResult = TaskParseResult | BatchIndexResult | ErrorResult;
