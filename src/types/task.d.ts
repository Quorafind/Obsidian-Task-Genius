/**
 * Optimized task indexing system focused on task-related data only
 */

import { Component, EventRef, TFile } from "obsidian";

/** Base task interface with only core required fields */
export interface BaseTask {
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
}

/** Standard task metadata interface */
export interface StandardTaskMetadata {
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
	/** Date when the task was cancelled */
	cancelledDate?: number;
	/** Recurrence pattern (Tasks plugin compatible) */
	recurrence?: string;
	/** Task completion action/command */
	onCompletion?: string;
	/** Task dependencies (IDs of tasks this depends on) */
	dependsOn?: string[];
	/** Unique task identifier */
	id?: string;

	/** Tags associated with the task */
	tags: string[];
	/** Project associated with task (derived from frontmatter or special tags) */
	project?: string;
	/** Context for the task (e.g. @home, @work) */
	context?: string;
	/** Area for the task (e.g. #area/work, #area/personal) */
	area?: string;
	/** Priority level (1-5, higher is more important) */
	priority?: number;

	/** Parent task ID for hierarchical tasks */
	parent?: string;
	/** Child task IDs */
	children: string[];

	/** Estimated time in minutes */
	estimatedTime?: number;
	/** Actual time spent in minutes */
	actualTime?: number;

	/** File statistics and metadata for auto-date extraction */
	useAsDateType?: "due" | "start" | "scheduled";

	/** Task belongs to which heading */
	heading?: string[];

	/** Task Genius enhanced project information */
	tgProject?: TgProject;
}

export interface StandardFileTaskMetadata extends StandardTaskMetadata {
	/** Task source */
	source: "file-metadata" | "file-tag";

	/** Source field */
	sourceField?: string;

	/** Source value */
	sourceValue?: string;

	/** Source tag */
	sourceTag?: string;
}

export interface CanvasTaskMetadata extends StandardTaskMetadata {
	/** Canvas node ID */
	canvasNodeId?: string;

	/** Canvas node position */
	canvasPosition?: {
		x: number;
		y: number;
		width: number;
		height: number;
	};

	/** Canvas node color */
	canvasColor?: string;

	/** Source type to distinguish canvas tasks */
	sourceType?: "canvas" | "markdown";
}

/** Task Genius Project interface */
export interface TgProject {
	/** Type of project source */
	type: "path" | "metadata" | "config" | "default";
	/** Project name */
	name: string;
	/** Source path or metadata key */
	source?: string;
	/** Whether this project is read-only (cannot be edited inline) */
	readonly?: boolean;
}

/** Extensible task interface with generic metadata support */
export interface Task<
	TMetadata extends StandardTaskMetadata = StandardTaskMetadata
> extends BaseTask {
	/** Task metadata */
	metadata: TMetadata;
}

/** Extended metadata interface for future expansion */
export interface ExtendedMetadata extends StandardTaskMetadata {
	/** Custom fields for future extensions */
	customFields?: Record<string, unknown>;
}

/** Legacy Task type for backward compatibility during migration */
export type LegacyTask = BaseTask & StandardTaskMetadata;

/** Helper type to extract all possible field names from Task and its metadata */
export type TaskFieldName = keyof BaseTask | keyof StandardTaskMetadata;

/** Utility functions for working with tasks */
export namespace TaskUtils {
	/** Get a property value from a task, handling both old and new structures */
	export function getTaskProperty<K extends TaskFieldName>(
		task: Task | LegacyTask,
		key: K
	): K extends keyof BaseTask
		? BaseTask[K]
		: K extends keyof StandardTaskMetadata
		? StandardTaskMetadata[K]
		: unknown;

	/** Set a property value on a task, handling both old and new structures */
	export function setTaskProperty<K extends keyof StandardTaskMetadata>(
		task: Task,
		key: K,
		value: StandardTaskMetadata[K]
	): void;

	/** Create a new task with the new structure from legacy data */
	export function createTaskFromLegacy(legacyData: LegacyTask): Task;

	/** Convert a task to legacy format for backward compatibility */
	export function taskToLegacy(task: Task): LegacyTask;
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

	/** Cancelled date index: cancelledDate(YYYY-MM-DD) -> Set<taskIds> */
	cancelledDate: Map<string, Set<string>>;

	/** On completion action index: action -> Set<taskIds> */
	onCompletion: Map<string, Set<string>>;

	/** Dependencies index: dependsOn -> Set<taskIds> */
	dependsOn: Map<string, Set<string>>;

	/** Task ID index: id -> Set<taskIds> */
	taskId: Map<string, Set<string>>;

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
		| "cancelledDate"
		| "onCompletion"
		| "dependsOn"
		| "id"
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
	field: TaskFieldName;
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
