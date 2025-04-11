/**
 * High-performance task indexer implementation
 */

import {
	App,
	Component,
	FileStats,
	MetadataCache,
	TFile,
	Vault,
} from "obsidian";
import {
	SortingCriteria,
	Task,
	TaskCache,
	TaskFilter,
	TaskIndexer as TaskIndexerInterface,
	TaskParserConfig,
} from "../types/TaskIndex";
import { TaskParser } from "./TaskParser";

/**
 * Utility to format a date for index keys (YYYY-MM-DD)
 */
function formatDateForIndex(date: number): string {
	const d = new Date(date);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
		2,
		"0"
	)}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Implementation of the task indexer that focuses only on task-related data
 */
export class TaskIndexer extends Component implements TaskIndexerInterface {
	private taskCache: TaskCache;
	private parser: TaskParser;
	private lastIndexTime: Map<string, number> = new Map();

	// Queue for throttling file indexing
	private indexQueue: TFile[] = [];
	private isProcessingQueue = false;

	constructor(
		private app: App,
		private vault: Vault,
		private metadataCache: MetadataCache,
		config?: Partial<TaskParserConfig>
	) {
		super();
		this.taskCache = this.initEmptyCache();
		this.parser = new TaskParser(config);
		this.addChild(this.parser);

		// // Setup file change listeners for incremental updates
		// this.setupEventListeners();
	}

	/**
	 * Initialize an empty task cache
	 */
	private initEmptyCache(): TaskCache {
		return {
			tasks: new Map<string, Task>(),
			files: new Map<string, Set<string>>(),
			tags: new Map<string, Set<string>>(),
			projects: new Map<string, Set<string>>(),
			contexts: new Map<string, Set<string>>(),
			dueDate: new Map<string, Set<string>>(),
			startDate: new Map<string, Set<string>>(),
			scheduledDate: new Map<string, Set<string>>(),
			completed: new Map<boolean, Set<string>>(),
			priority: new Map<number, Set<string>>(),
		};
	}

	/**
	 * Setup file change event listeners
	 */
	private setupEventListeners(): void {
		// Watch for file modifications
		this.registerEvent(
			this.vault.on("modify", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.queueFileForIndexing(file);
				}
			})
		);

		// Watch for file deletions
		this.registerEvent(
			this.vault.on("delete", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.removeFileFromIndex(file);
				}
			})
		);

		// Watch for new files
		this.registerEvent(
			this.vault.on("create", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.queueFileForIndexing(file);
				}
			})
		);
	}

	/**
	 * Queue a file for indexing with throttling
	 */
	private queueFileForIndexing(file: TFile): void {
		if (!this.indexQueue.some((f) => f.path === file.path)) {
			this.indexQueue.push(file);
		}

		if (!this.isProcessingQueue) {
			this.processIndexQueue();
		}
	}

	/**
	 * Process the file index queue with throttling
	 */
	private async processIndexQueue(): Promise<void> {
		if (this.indexQueue.length === 0) {
			this.isProcessingQueue = false;
			return;
		}

		this.isProcessingQueue = true;
		const file = this.indexQueue.shift();

		if (file) {
			await this.indexFile(file);

			// Process next file after a small delay
			setTimeout(() => this.processIndexQueue(), 50);
		} else {
			this.isProcessingQueue = false;
		}
	}

	/**
	 * Initialize the task indexer
	 */
	public async initialize(): Promise<void> {
		// Start with an empty cache
		this.taskCache = this.initEmptyCache();

		// Get all markdown files
		const files = this.vault.getMarkdownFiles();

		// Index the files in batches to avoid UI freezing
		const batchSize = 20;
		for (let i = 0; i < files.length; i += batchSize) {
			const batch = files.slice(i, i + batchSize);

			await Promise.all(batch.map((file) => this.indexFile(file)));

			// Yield to main thread after each batch
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		console.log(
			`Task indexing complete: ${this.taskCache.tasks.size} tasks found`
		);
	}

	/**
	 * Get the current task cache
	 */
	public getCache(): TaskCache {
		return this.taskCache;
	}

	/**
	 * Index all files in the vault
	 */
	public async indexAllFiles(): Promise<void> {
		await this.initialize();
	}

	/**
	 * Index a single file
	 *
	 * This is an optimized version that only handles updating the index,
	 * not parsing the tasks. Actual task parsing should be done by a worker
	 * and the results passed directly to updateIndexWithTasks.
	 */
	public async indexFile(file: TFile): Promise<void> {
		try {
			// Skip if file has not been modified since last indexing
			const fileStats = await this.vault.adapter.stat(file.path);
			const lastMtime = this.lastIndexTime.get(file.path);

			if (lastMtime && fileStats?.mtime && fileStats.mtime <= lastMtime) {
				return;
			}

			// Read file content
			const fileContent = await this.vault.cachedRead(file);
			const metadata = this.metadataCache.getFileCache(file);

			// Parse tasks - in the main indexer we still need to do this
			// But in normal operations, this should be done by a worker
			const tasks = await this.parser.parseTasksFromFile(
				file,
				fileContent,
				metadata ?? undefined
			);

			// Update the index with the parsed tasks
			this.updateIndexWithTasks(file.path, tasks);
		} catch (error) {
			console.error(`Error indexing file ${file.path}:`, error);
		}
	}

	/**
	 * Update the index with tasks parsed by a worker
	 * This method should be called after task parsing is done
	 */
	public updateIndexWithTasks(filePath: string, tasks: Task[]): void {
		// Remove existing tasks for this file first
		this.removeFileFromIndex(filePath);

		// Update cache with new tasks
		const fileTaskIds = new Set<string>();

		for (const task of tasks) {
			// Store task in main task map
			this.taskCache.tasks.set(task.id, task);
			fileTaskIds.add(task.id);

			// Update all indexes
			this.updateIndexMaps(task);
		}

		// Update file index
		this.taskCache.files.set(filePath, fileTaskIds);
		this.lastIndexTime.set(filePath, Date.now());
	}

	/**
	 * Update index for a modified file - just an alias for indexFile
	 */
	public async updateIndex(file: TFile): Promise<void> {
		await this.indexFile(file);
	}

	/**
	 * Remove a file from the index
	 */
	private removeFileFromIndex(file: TFile | string): void {
		const filePath = typeof file === "string" ? file : file.path;
		const taskIds = this.taskCache.files.get(filePath);
		if (!taskIds) return;

		// Remove each task from all indexes
		for (const taskId of taskIds) {
			const task = this.taskCache.tasks.get(taskId);
			if (task) {
				this.removeTaskFromIndexes(task);
			}

			// Remove from main task map
			this.taskCache.tasks.delete(taskId);
		}

		// Remove from file index
		this.taskCache.files.delete(filePath);
		this.lastIndexTime.delete(filePath);
	}

	/**
	 * Update all index maps for a task
	 */
	private updateIndexMaps(task: Task): void {
		// Update completed status index
		let completedTasks =
			this.taskCache.completed.get(task.completed) || new Set();
		completedTasks.add(task.id);
		this.taskCache.completed.set(task.completed, completedTasks);

		// Update tag index
		for (const tag of task.tags) {
			let tagTasks = this.taskCache.tags.get(tag) || new Set();
			tagTasks.add(task.id);
			this.taskCache.tags.set(tag, tagTasks);
		}

		// Update project index
		if (task.project) {
			let projectTasks =
				this.taskCache.projects.get(task.project) || new Set();
			projectTasks.add(task.id);
			this.taskCache.projects.set(task.project, projectTasks);
		}

		// Update context index
		if (task.context) {
			let contextTasks =
				this.taskCache.contexts.get(task.context) || new Set();
			contextTasks.add(task.id);
			this.taskCache.contexts.set(task.context, contextTasks);
		}

		// Update date indexes
		if (task.dueDate) {
			const dateStr = formatDateForIndex(task.dueDate);
			let dueTasks = this.taskCache.dueDate.get(dateStr) || new Set();
			dueTasks.add(task.id);
			this.taskCache.dueDate.set(dateStr, dueTasks);
		}

		if (task.startDate) {
			const dateStr = formatDateForIndex(task.startDate);
			let startTasks = this.taskCache.startDate.get(dateStr) || new Set();
			startTasks.add(task.id);
			this.taskCache.startDate.set(dateStr, startTasks);
		}

		if (task.scheduledDate) {
			const dateStr = formatDateForIndex(task.scheduledDate);
			let scheduledTasks =
				this.taskCache.scheduledDate.get(dateStr) || new Set();
			scheduledTasks.add(task.id);
			this.taskCache.scheduledDate.set(dateStr, scheduledTasks);
		}

		// Update priority index
		if (task.priority !== undefined) {
			let priorityTasks =
				this.taskCache.priority.get(task.priority) || new Set();
			priorityTasks.add(task.id);
			this.taskCache.priority.set(task.priority, priorityTasks);
		}
	}

	/**
	 * Remove a task from all indexes
	 */
	private removeTaskFromIndexes(task: Task): void {
		// Remove from completed index
		const completedTasks = this.taskCache.completed.get(task.completed);
		if (completedTasks) {
			completedTasks.delete(task.id);
			if (completedTasks.size === 0) {
				this.taskCache.completed.delete(task.completed);
			}
		}

		// Remove from tag index
		for (const tag of task.tags) {
			const tagTasks = this.taskCache.tags.get(tag);
			if (tagTasks) {
				tagTasks.delete(task.id);
				if (tagTasks.size === 0) {
					this.taskCache.tags.delete(tag);
				}
			}
		}

		// Remove from project index
		if (task.project) {
			const projectTasks = this.taskCache.projects.get(task.project);
			if (projectTasks) {
				projectTasks.delete(task.id);
				if (projectTasks.size === 0) {
					this.taskCache.projects.delete(task.project);
				}
			}
		}

		// Remove from context index
		if (task.context) {
			const contextTasks = this.taskCache.contexts.get(task.context);
			if (contextTasks) {
				contextTasks.delete(task.id);
				if (contextTasks.size === 0) {
					this.taskCache.contexts.delete(task.context);
				}
			}
		}

		// Remove from date indexes
		if (task.dueDate) {
			const dateStr = formatDateForIndex(task.dueDate);
			const dueTasks = this.taskCache.dueDate.get(dateStr);
			if (dueTasks) {
				dueTasks.delete(task.id);
				if (dueTasks.size === 0) {
					this.taskCache.dueDate.delete(dateStr);
				}
			}
		}

		if (task.startDate) {
			const dateStr = formatDateForIndex(task.startDate);
			const startTasks = this.taskCache.startDate.get(dateStr);
			if (startTasks) {
				startTasks.delete(task.id);
				if (startTasks.size === 0) {
					this.taskCache.startDate.delete(dateStr);
				}
			}
		}

		if (task.scheduledDate) {
			const dateStr = formatDateForIndex(task.scheduledDate);
			const scheduledTasks = this.taskCache.scheduledDate.get(dateStr);
			if (scheduledTasks) {
				scheduledTasks.delete(task.id);
				if (scheduledTasks.size === 0) {
					this.taskCache.scheduledDate.delete(dateStr);
				}
			}
		}

		// Remove from priority index
		if (task.priority !== undefined) {
			const priorityTasks = this.taskCache.priority.get(task.priority);
			if (priorityTasks) {
				priorityTasks.delete(task.id);
				if (priorityTasks.size === 0) {
					this.taskCache.priority.delete(task.priority);
				}
			}
		}
	}

	/**
	 * Query tasks based on filters and sorting criteria
	 */
	public queryTasks(
		filters: TaskFilter[],
		sortBy: SortingCriteria[] = []
	): Task[] {
		if (filters.length === 0 && this.taskCache.tasks.size < 1000) {
			// If no filters and small task count, just return all tasks
			const allTasks = Array.from(this.taskCache.tasks.values());
			return this.applySorting(allTasks, sortBy);
		}

		// Start with a null set to indicate we haven't applied any filters yet
		let resultTaskIds: Set<string> | null = null;

		// Apply each filter
		for (const filter of filters) {
			const filteredIds = this.applyFilter(filter);

			if (resultTaskIds === null) {
				// First filter
				resultTaskIds = filteredIds;
			} else if (filter.conjunction === "OR") {
				// Union sets (OR)
				filteredIds.forEach((id) => resultTaskIds!.add(id));
			} else {
				// Intersection (AND is default)
				resultTaskIds = new Set(
					[...resultTaskIds].filter((id) => filteredIds.has(id))
				);
			}
		}

		// If we have no filters, include all tasks
		if (resultTaskIds === null) {
			resultTaskIds = new Set(this.taskCache.tasks.keys());
		}

		// Convert to task array
		const tasks = Array.from(resultTaskIds)
			.map((id) => this.taskCache.tasks.get(id)!)
			.filter((task) => task !== undefined);

		// Apply sorting
		return this.applySorting(tasks, sortBy);
	}

	/**
	 * Apply a filter to the task cache
	 */
	private applyFilter(filter: TaskFilter): Set<string> {
		switch (filter.type) {
			case "tag":
				return this.filterByTag(filter);
			case "project":
				return this.filterByProject(filter);
			case "context":
				return this.filterByContext(filter);
			case "status":
				return this.filterByStatus(filter);
			case "priority":
				return this.filterByPriority(filter);
			case "dueDate":
				return this.filterByDueDate(filter);
			case "startDate":
				return this.filterByStartDate(filter);
			case "scheduledDate":
				return this.filterByScheduledDate(filter);
			default:
				console.warn(`Unsupported filter type: ${filter.type}`);
				return new Set();
		}
	}

	/**
	 * Filter tasks by tag
	 */
	private filterByTag(filter: TaskFilter): Set<string> {
		if (filter.operator === "contains") {
			return this.taskCache.tags.get(filter.value as string) || new Set();
		} else if (filter.operator === "!=") {
			// Get all task IDs
			const allTaskIds = new Set(this.taskCache.tasks.keys());
			// Get tasks with the specified tag
			const tagTaskIds =
				this.taskCache.tags.get(filter.value as string) || new Set();
			// Return tasks that don't have the tag
			return new Set([...allTaskIds].filter((id) => !tagTaskIds.has(id)));
		}

		return new Set();
	}

	/**
	 * Filter tasks by project
	 */
	private filterByProject(filter: TaskFilter): Set<string> {
		if (filter.operator === "=") {
			return (
				this.taskCache.projects.get(filter.value as string) || new Set()
			);
		} else if (filter.operator === "!=") {
			// Get all task IDs
			const allTaskIds = new Set(this.taskCache.tasks.keys());
			// Get tasks with the specified project
			const projectTaskIds =
				this.taskCache.projects.get(filter.value as string) ||
				new Set();
			// Return tasks that don't have the project
			return new Set(
				[...allTaskIds].filter((id) => !projectTaskIds.has(id))
			);
		} else if (filter.operator === "empty") {
			// Get all task IDs
			const allTaskIds = new Set(this.taskCache.tasks.keys());
			// Get all tasks with any project
			const tasksWithProject = new Set<string>();
			for (const projectTasks of this.taskCache.projects.values()) {
				for (const taskId of projectTasks) {
					tasksWithProject.add(taskId);
				}
			}
			// Return tasks without a project
			return new Set(
				[...allTaskIds].filter((id) => !tasksWithProject.has(id))
			);
		}

		return new Set();
	}

	/**
	 * Filter tasks by context
	 */
	private filterByContext(filter: TaskFilter): Set<string> {
		if (filter.operator === "=") {
			return (
				this.taskCache.contexts.get(filter.value as string) || new Set()
			);
		} else if (filter.operator === "!=") {
			// Get all task IDs
			const allTaskIds = new Set(this.taskCache.tasks.keys());
			// Get tasks with the specified context
			const contextTaskIds =
				this.taskCache.contexts.get(filter.value as string) ||
				new Set();
			// Return tasks that don't have the context
			return new Set(
				[...allTaskIds].filter((id) => !contextTaskIds.has(id))
			);
		} else if (filter.operator === "empty") {
			// Get all task IDs
			const allTaskIds = new Set(this.taskCache.tasks.keys());
			// Get all tasks with any context
			const tasksWithContext = new Set<string>();
			for (const contextTasks of this.taskCache.contexts.values()) {
				for (const taskId of contextTasks) {
					tasksWithContext.add(taskId);
				}
			}
			// Return tasks without a context
			return new Set(
				[...allTaskIds].filter((id) => !tasksWithContext.has(id))
			);
		}

		return new Set();
	}

	/**
	 * Filter tasks by status (completed or not)
	 */
	private filterByStatus(filter: TaskFilter): Set<string> {
		if (filter.operator === "=") {
			return (
				this.taskCache.completed.get(filter.value as boolean) ||
				new Set()
			);
		}

		return new Set();
	}

	/**
	 * Filter tasks by priority
	 */
	private filterByPriority(filter: TaskFilter): Set<string> {
		if (filter.operator === "=") {
			return (
				this.taskCache.priority.get(filter.value as number) || new Set()
			);
		} else if (filter.operator === ">") {
			// Get tasks with priority higher than the specified value
			const result = new Set<string>();
			for (const [
				priority,
				taskIds,
			] of this.taskCache.priority.entries()) {
				if (priority > (filter.value as number)) {
					for (const taskId of taskIds) {
						result.add(taskId);
					}
				}
			}
			return result;
		} else if (filter.operator === "<") {
			// Get tasks with priority lower than the specified value
			const result = new Set<string>();
			for (const [
				priority,
				taskIds,
			] of this.taskCache.priority.entries()) {
				if (priority < (filter.value as number)) {
					for (const taskId of taskIds) {
						result.add(taskId);
					}
				}
			}
			return result;
		}

		return new Set();
	}

	/**
	 * Filter tasks by due date
	 */
	private filterByDueDate(filter: TaskFilter): Set<string> {
		if (filter.operator === "=") {
			// Exact match on date string (YYYY-MM-DD)
			return (
				this.taskCache.dueDate.get(filter.value as string) || new Set()
			);
		} else if (
			filter.operator === "before" ||
			filter.operator === "after"
		) {
			// Convert value to Date if it's a string
			let compareDate: Date;
			if (typeof filter.value === "string") {
				compareDate = new Date(filter.value);
			} else {
				compareDate = new Date(filter.value as number);
			}

			// Get all tasks with due dates
			const result = new Set<string>();
			for (const [dateStr, taskIds] of this.taskCache.dueDate.entries()) {
				const date = new Date(dateStr);

				if (
					(filter.operator === "before" && date < compareDate) ||
					(filter.operator === "after" && date > compareDate)
				) {
					for (const taskId of taskIds) {
						result.add(taskId);
					}
				}
			}
			return result;
		} else if (filter.operator === "empty") {
			// Get all task IDs
			const allTaskIds = new Set(this.taskCache.tasks.keys());
			// Get all tasks with any due date
			const tasksWithDueDate = new Set<string>();
			for (const dueTasks of this.taskCache.dueDate.values()) {
				for (const taskId of dueTasks) {
					tasksWithDueDate.add(taskId);
				}
			}
			// Return tasks without a due date
			return new Set(
				[...allTaskIds].filter((id) => !tasksWithDueDate.has(id))
			);
		}

		return new Set();
	}

	/**
	 * Filter tasks by start date
	 */
	private filterByStartDate(filter: TaskFilter): Set<string> {
		// Similar implementation to filterByDueDate
		if (filter.operator === "=") {
			return (
				this.taskCache.startDate.get(filter.value as string) ||
				new Set()
			);
		} else if (
			filter.operator === "before" ||
			filter.operator === "after"
		) {
			let compareDate: Date;
			if (typeof filter.value === "string") {
				compareDate = new Date(filter.value);
			} else {
				compareDate = new Date(filter.value as number);
			}

			const result = new Set<string>();
			for (const [
				dateStr,
				taskIds,
			] of this.taskCache.startDate.entries()) {
				const date = new Date(dateStr);

				if (
					(filter.operator === "before" && date < compareDate) ||
					(filter.operator === "after" && date > compareDate)
				) {
					for (const taskId of taskIds) {
						result.add(taskId);
					}
				}
			}
			return result;
		} else if (filter.operator === "empty") {
			const allTaskIds = new Set(this.taskCache.tasks.keys());
			const tasksWithStartDate = new Set<string>();
			for (const startTasks of this.taskCache.startDate.values()) {
				for (const taskId of startTasks) {
					tasksWithStartDate.add(taskId);
				}
			}
			return new Set(
				[...allTaskIds].filter((id) => !tasksWithStartDate.has(id))
			);
		}

		return new Set();
	}

	/**
	 * Filter tasks by scheduled date
	 */
	private filterByScheduledDate(filter: TaskFilter): Set<string> {
		// Similar implementation to filterByDueDate
		if (filter.operator === "=") {
			return (
				this.taskCache.scheduledDate.get(filter.value as string) ||
				new Set()
			);
		} else if (
			filter.operator === "before" ||
			filter.operator === "after"
		) {
			let compareDate: Date;
			if (typeof filter.value === "string") {
				compareDate = new Date(filter.value);
			} else {
				compareDate = new Date(filter.value as number);
			}

			const result = new Set<string>();
			for (const [
				dateStr,
				taskIds,
			] of this.taskCache.scheduledDate.entries()) {
				const date = new Date(dateStr);

				if (
					(filter.operator === "before" && date < compareDate) ||
					(filter.operator === "after" && date > compareDate)
				) {
					for (const taskId of taskIds) {
						result.add(taskId);
					}
				}
			}
			return result;
		} else if (filter.operator === "empty") {
			const allTaskIds = new Set(this.taskCache.tasks.keys());
			const tasksWithScheduledDate = new Set<string>();
			for (const scheduledTasks of this.taskCache.scheduledDate.values()) {
				for (const taskId of scheduledTasks) {
					tasksWithScheduledDate.add(taskId);
				}
			}
			return new Set(
				[...allTaskIds].filter((id) => !tasksWithScheduledDate.has(id))
			);
		}

		return new Set();
	}

	/**
	 * Apply sorting to tasks
	 */
	private applySorting(tasks: Task[], sortBy: SortingCriteria[]): Task[] {
		if (sortBy.length === 0) {
			// Default sorting: priority desc, due date asc
			return [...tasks].sort((a, b) => {
				// First by priority (high to low)
				const priorityA = a.priority || 0;
				const priorityB = b.priority || 0;
				if (priorityA !== priorityB) {
					return priorityB - priorityA;
				}

				// Then by due date (earliest first)
				const dueDateA = a.dueDate || Number.MAX_SAFE_INTEGER;
				const dueDateB = b.dueDate || Number.MAX_SAFE_INTEGER;
				return dueDateA - dueDateB;
			});
		}

		return [...tasks].sort((a, b) => {
			for (const { field, direction } of sortBy) {
				const valueA = a[field];
				const valueB = b[field];

				// Handle undefined values
				if (valueA === undefined && valueB === undefined) {
					continue;
				} else if (valueA === undefined) {
					return direction === "asc" ? 1 : -1;
				} else if (valueB === undefined) {
					return direction === "asc" ? -1 : 1;
				}

				// Compare values
				if (valueA !== valueB) {
					const multiplier = direction === "asc" ? 1 : -1;

					if (
						typeof valueA === "string" &&
						typeof valueB === "string"
					) {
						return valueA.localeCompare(valueB) * multiplier;
					} else if (
						typeof valueA === "number" &&
						typeof valueB === "number"
					) {
						return (valueA - valueB) * multiplier;
					} else if (
						valueA instanceof Date &&
						valueB instanceof Date
					) {
						return (
							(valueA.getTime() - valueB.getTime()) * multiplier
						);
					} else {
						// Convert to string and compare as fallback
						return (
							String(valueA).localeCompare(String(valueB)) *
							multiplier
						);
					}
				}
			}

			return 0;
		});
	}

	/**
	 * Get task by ID
	 */
	public getTaskById(id: string): Task | undefined {
		return this.taskCache.tasks.get(id);
	}

	/**
	 * Create a new task
	 */
	public async createTask(taskData: Partial<Task>): Promise<Task> {
		throw new Error("Not implemented");
	}

	/**
	 * Update an existing task
	 */
	public async updateTask(task: Task): Promise<void> {
		throw new Error("Not implemented");
	}

	/**
	 * Delete a task
	 */
	public async deleteTask(taskId: string): Promise<void> {
		throw new Error("Not implemented");
	}

	/**
	 * Reset the task cache to empty
	 */
	public resetCache(): void {
		this.taskCache = this.initEmptyCache();
		this.lastIndexTime.clear();
	}
}
