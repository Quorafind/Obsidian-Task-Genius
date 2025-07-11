/**
 * File-level task system for managing tasks at the file level
 * Compatible with existing Task interface but uses file properties for data storage
 */

import { App } from "obsidian";
import { Task } from "./task";

// Forward declaration for BasesEntry
interface BasesEntry {
	ctx: {
		_local: any;
		app: App;
		filter: any;
		formulas: any;
		localUsed: boolean;
	};
	file: {
		parent: any;
		deleted: boolean;
		vault: any;
		path: string;
		name: string;
		extension: string;
		getShortName(): string;
	};
	formulas: Record<string, any>;
	implicit: {
		file: any;
		name: string;
		path: string;
		folder: string;
		ext: string;
	};
	lazyEvalCache: Record<string, any>;
	properties: Record<string, any>;
	getValue(prop: {
		type: "property" | "file" | "formula";
		name: string;
	}): any;
	updateProperty(key: string, value: any): void;
	getFormulaValue(formula: string): any;
	getPropertyKeys(): string[];
}

/** File-level task that extends the base Task interface */
export interface FileTask extends Omit<Task, "line" | "originalMarkdown"> {
	/** File-level task doesn't have line numbers */
	line?: never;
	/** File-level task doesn't have original markdown */
	originalMarkdown?: never;

	/** Source entry from Bases plugin */
	sourceEntry: BasesEntry;

	/** Indicates this is a file-level task */
	isFileTask: true;
}

/** Configuration for file-level task property mapping */
export interface FileTaskPropertyMapping {
	/** Property name for task content */
	contentProperty: string;
	/** Property name for task status */
	statusProperty: string;
	/** Property name for completion state */
	completedProperty: string;
	/** Property name for creation date */
	createdDateProperty?: string;
	/** Property name for start date */
	startDateProperty?: string;
	/** Property name for scheduled date */
	scheduledDateProperty?: string;
	/** Property name for due date */
	dueDateProperty?: string;
	/** Property name for completed date */
	completedDateProperty?: string;
	/** Property name for recurrence */
	recurrenceProperty?: string;
	/** Property name for tags */
	tagsProperty?: string;
	/** Property name for project */
	projectProperty?: string;
	/** Property name for context */
	contextProperty?: string;
	/** Property name for priority */
	priorityProperty?: string;
	/** Property name for estimated time */
	estimatedTimeProperty?: string;
	/** Property name for actual time */
	actualTimeProperty?: string;
}

/** Default property mapping for file-level tasks */
export declare const DEFAULT_FILE_TASK_MAPPING: FileTaskPropertyMapping;

/** File task manager interface */
export interface FileTaskManager {
	/** Convert a BasesEntry to a FileTask */
	entryToFileTask(
		entry: BasesEntry,
		mapping?: FileTaskPropertyMapping
	): FileTask;

	/** Convert a FileTask back to property updates */
	fileTaskToPropertyUpdates(
		task: FileTask,
		mapping?: FileTaskPropertyMapping
	): Record<string, any>;

	/** Update a file task by updating its properties */
	updateFileTask(task: FileTask, updates: Partial<FileTask>): Promise<void>;

	/** Get all file tasks from a list of entries */
	getFileTasksFromEntries(
		entries: BasesEntry[],
		mapping?: FileTaskPropertyMapping
	): FileTask[];

	/** Filter file tasks based on criteria */
	filterFileTasks(tasks: FileTask[], filters: any): FileTask[];
}

/** File task view configuration */
export interface FileTaskViewConfig {
	/** Property mapping configuration */
	propertyMapping: FileTaskPropertyMapping;

	/** Whether to show completed tasks */
	showCompleted: boolean;

	/** Default view mode for file tasks */
	defaultViewMode: string;

	/** Custom status mappings */
	statusMappings?: Record<string, string>;
}
