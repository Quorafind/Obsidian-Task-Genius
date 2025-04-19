/**
 * Optimized task indexing system focused on task-related data only
 */

import { Component, EventRef, TFile } from "obsidian";

/** Core task data structure */
export interface Task {
	/** Unique identifier for the task */
	id: string;
	/** Task content text */
	content: string;
	/** File path where the task is located */
	filePath: string;
	/** Line number in the file */
	line: number;
	/** Whether the task is completed or not */
	completed: boolean;
	/** Status of the task */
	status: string;
	/** Original markdown text */
	originalMarkdown: string;

	/** Creation date (optional) */
	createdDate?: number;
	/** Start date for the task (Tasks plugin compatible) */
	startDate?: number;
	/** Scheduled date (Tasks plugin compatible) */
	scheduledDate?: number;
	/** Due date for the task */
	dueDate?: number;
	/** Date when the task was completed */
	completedDate?: number;
	/** Recurrence pattern (Tasks plugin compatible) */
	recurrence?: string;

	/** Tags associated with the task */
	tags: string[];
	/** Project associated with task (derived from frontmatter or special tags) */
	project?: string;
	/** Context for the task (e.g. @home, @work) */
	context?: string;
	/** Priority level (1-3, higher is more important) */
	priority?: number;

	/** Parent task ID for hierarchical tasks */
	parent?: string;
	/** Child task IDs */
	children: string[];

	/** Estimated time in minutes */
	estimatedTime?: number;
	/** Actual time spent in minutes */
	actualTime?: number;
}

/** High-performance cache structure for tasks */
export interface TaskCache {
	/** Main task store: taskId -> Task */
	tasks: Map<string, Task>;

	/** File index: filePath -> Set<taskIds> */
	files: Map<string, Set<string>>;

	/** Tag index: tag -> Set<taskIds> */
	tags: Map<string, Set<string>>;

	/** Project index: project -> Set<taskIds> */
	projects: Map<string, Set<string>>;

	/** Context index: context -> Set<taskIds> */
	contexts: Map<string, Set<string>>;

	/** Due date index: dueDate(YYYY-MM-DD) -> Set<taskIds> */
	dueDate: Map<string, Set<string>>;

	/** Start date index: startDate(YYYY-MM-DD) -> Set<taskIds> */
	startDate: Map<string, Set<string>>;

	/** Scheduled date index: scheduledDate(YYYY-MM-DD) -> Set<taskIds> */
	scheduledDate: Map<string, Set<string>>;

	/** Completion status index: boolean -> Set<taskIds> */
	completed: Map<boolean, Set<string>>;

	/** Priority index: priority -> Set<taskIds> */
	priority: Map<number, Set<string>>;
}

/** Task filter interface for querying tasks */
export interface TaskFilter {
	type:
		| "tag"
		| "project"
		| "context"
		| "dueDate"
		| "startDate"
		| "scheduledDate"
		| "status"
		| "priority"
		| "recurrence";
	operator:
		| "="
		| "!="
		| "<"
		| ">"
		| "contains"
		| "empty"
		| "not-empty"
		| "before"
		| "after";
	value: any;
	conjunction?: "AND" | "OR";
}

/** Sort criteria for task lists */
export interface SortingCriteria {
	field: keyof Task;
	direction: "asc" | "desc";
}

/** Task parsing configuration */
export interface TaskParserConfig {
	/** Regular expression to match task items */
	taskRegex: RegExp;
	/** Start date format for parsing */
	startDateFormat?: string;
	/** Due date format for parsing */
	dueDateFormat?: string;
	/** Scheduled date format for parsing */
	scheduledDateFormat?: string;
	/** Project tag prefix */
	projectPrefix?: string;
	/** Context tag prefix */
	contextPrefix?: string;
	/** Task priority markers */
	priorityMarkers?: Record<string, number>;
	/** Prefer metadata format */
	preferMetadataFormat?: "dataview" | "tasks";
}

/** Task indexer interface */
export interface TaskIndexer extends Component {
	/** Initialize the task indexer */
	initialize(): Promise<void>;

	/** Get the current task cache */
	getCache(): TaskCache;

	/** Index a single file */
	indexFile(file: TFile): Promise<void>;

	/** Index all files in the vault */
	indexAllFiles(): Promise<void>;

	/** Update index for a modified file */
	updateIndex(file: TFile): Promise<void>;

	/** Query tasks based on filters and sorting criteria */
	queryTasks(filters: TaskFilter[], sortBy: SortingCriteria[]): Task[];

	/** Get task by ID */
	getTaskById(id: string): Task | undefined;

	/** Create a new task */
	createTask(task: Partial<Task>): Promise<Task>;

	/** Update an existing task */
	updateTask(task: Task): Promise<void>;

	/** Delete a task */
	deleteTask(taskId: string): Promise<void>;
}
