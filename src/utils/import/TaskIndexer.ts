/**
 * High-performance task indexer implementation
 *
 * This indexer focuses solely on indexing and querying tasks.
 * Parsing is handled by external components.
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
} from "../../types/task";
import { isSupportedFileWithFilter } from "../fileTypeUtils";
import { FileFilterManager } from "../FileFilterManager";

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
 * Implementation of the task indexer that focuses only on indexing and querying
 */
export class TaskIndexer extends Component implements TaskIndexerInterface {
	private taskCache: TaskCache;
	private lastIndexTime: Map<string, number> = new Map();

	// Queue for throttling file indexing
	private indexQueue: TFile[] = [];
	private isProcessingQueue = false;

	// Callback for external parsing
	private parseFileCallback?: (file: TFile) => Promise<Task[]>;

	// File filter manager
	private fileFilterManager?: FileFilterManager;

	constructor(
		private app: App,
		private vault: Vault,
		private metadataCache: MetadataCache
	) {
		super();
		this.taskCache = this.initEmptyCache();

		// Setup file change listeners for incremental updates
		this.setupEventListeners();
	}

	/**
	 * Set the callback function for parsing files
	 */
	public setParseFileCallback(
		callback: (file: TFile) => Promise<Task[]>
	): void {
		this.parseFileCallback = callback;
	}

	/**
	 * Set the file filter manager
	 */
	public setFileFilterManager(filterManager?: FileFilterManager): void {
		this.fileFilterManager = filterManager;
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
			cancelledDate: new Map<string, Set<string>>(),
			onCompletion: new Map<string, Set<string>>(),
			dependsOn: new Map<string, Set<string>>(),
			taskId: new Map<string, Set<string>>(),
		};
	}

	/**
	 * Setup file change event listeners
	 */
	private setupEventListeners(): void {
		// Watch for file modifications
		this.registerEvent(
			this.vault.on("modify", (file) => {
				if (
					file instanceof TFile &&
					isSupportedFileWithFilter(file, this.fileFilterManager)
				) {
					this.queueFileForIndexing(file);
				}
			})
		);

		// Watch for file deletions
		this.registerEvent(
			this.vault.on("delete", (file) => {
				if (
					file instanceof TFile &&
					isSupportedFileWithFilter(file, this.fileFilterManager)
				) {
					this.removeFileFromIndex(file);
				}
			})
		);

		// Watch for new files
		this.registerEvent(
			this.vault.on("create", (file) => {
				if (
					file instanceof TFile &&
					isSupportedFileWithFilter(file, this.fileFilterManager)
				) {
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

		if (file && this.parseFileCallback) {
			try {
				// Use the external parsing callback
				const tasks = await this.parseFileCallback(file);
				this.updateIndexWithTasks(file.path, tasks);
			} catch (error) {
				console.error(
					`Error processing file ${file.path} in queue:`,
					error
				);
			}
		}

		// Process next file after a small delay
		setTimeout(() => this.processIndexQueue(), 50);
	}

	/**
	 * Initialize the task indexer
	 * Note: This no longer does any parsing - external components must provide tasks
	 */
	public async initialize(): Promise<void> {
		// Start with an empty cache
		this.taskCache = this.initEmptyCache();

		console.log(
			`Task indexer initialized with empty cache. Use updateIndexWithTasks to populate.`
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
	 * This is now a no-op - external components should handle parsing and call updateIndexWithTasks
	 */
	public async indexAllFiles(): Promise<void> {
		console.warn(
			"TaskIndexer.indexAllFiles is deprecated. Use external parsing components instead."
		);
		await this.initialize();
	}

	/**
	 * Index a single file using external parsing
	 * @deprecated Use updateIndexWithTasks with external parsing instead
	 */
	public async indexFile(file: TFile): Promise<void> {
		if (this.parseFileCallback) {
			try {
				const tasks = await this.parseFileCallback(file);
				this.updateIndexWithTasks(file.path, tasks);
			} catch (error) {
				console.error(`Error indexing file ${file.path}:`, error);
			}
		} else {
			console.warn(
				`No parse callback set for indexFile. Use setParseFileCallback() or updateIndexWithTasks() instead.`
			);
		}
	}

	/**
	 * Update the index with tasks parsed by external components
	 * This is the primary method for updating the index
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
	 * Update index for a modified file - just an alias for deprecated indexFile
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
		for (const tag of task.metadata.tags) {
			let tagTasks = this.taskCache.tags.get(tag) || new Set();
			tagTasks.add(task.id);
			this.taskCache.tags.set(tag, tagTasks);
		}

		// Update project index
		if (task.metadata.project) {
			let projectTasks =
				this.taskCache.projects.get(task.metadata.project) || new Set();
			projectTasks.add(task.id);
			this.taskCache.projects.set(task.metadata.project, projectTasks);
		}

		// Update context index
		if (task.metadata.context) {
			let contextTasks =
				this.taskCache.contexts.get(task.metadata.context) || new Set();
			contextTasks.add(task.id);
			this.taskCache.contexts.set(task.metadata.context, contextTasks);
		}

		// Update date indexes
		if (task.metadata.dueDate) {
			const dateStr = formatDateForIndex(task.metadata.dueDate);
			let dueTasks = this.taskCache.dueDate.get(dateStr) || new Set();
			dueTasks.add(task.id);
			this.taskCache.dueDate.set(dateStr, dueTasks);
		}

		if (task.metadata.startDate) {
			const dateStr = formatDateForIndex(task.metadata.startDate);
			let startTasks = this.taskCache.startDate.get(dateStr) || new Set();
			startTasks.add(task.id);
			this.taskCache.startDate.set(dateStr, startTasks);
		}

		if (task.metadata.scheduledDate) {
			const dateStr = formatDateForIndex(task.metadata.scheduledDate);
			let scheduledTasks =
				this.taskCache.scheduledDate.get(dateStr) || new Set();
			scheduledTasks.add(task.id);
			this.taskCache.scheduledDate.set(dateStr, scheduledTasks);
		}

		// Update priority index
		if (task.metadata.priority !== undefined) {
			let priorityTasks =
				this.taskCache.priority.get(task.metadata.priority) ||
				new Set();
			priorityTasks.add(task.id);
			this.taskCache.priority.set(task.metadata.priority, priorityTasks);
		}

		// Update cancelled date index
		if (task.metadata.cancelledDate) {
			const dateStr = formatDateForIndex(task.metadata.cancelledDate);
			let cancelledTasks =
				this.taskCache.cancelledDate.get(dateStr) || new Set();
			cancelledTasks.add(task.id);
			this.taskCache.cancelledDate.set(dateStr, cancelledTasks);
		}

		// Update onCompletion index
		if (task.metadata.onCompletion) {
			let onCompletionTasks =
				this.taskCache.onCompletion.get(task.metadata.onCompletion) ||
				new Set();
			onCompletionTasks.add(task.id);
			this.taskCache.onCompletion.set(
				task.metadata.onCompletion,
				onCompletionTasks
			);
		}

		// Update dependsOn index
		if (task.metadata.dependsOn && task.metadata.dependsOn.length > 0) {
			for (const dependency of task.metadata.dependsOn) {
				let dependsOnTasks =
					this.taskCache.dependsOn.get(dependency) || new Set();
				dependsOnTasks.add(task.id);
				this.taskCache.dependsOn.set(dependency, dependsOnTasks);
			}
		}

		// Update task ID index
		if (task.metadata.id) {
			let taskIdTasks =
				this.taskCache.taskId.get(task.metadata.id) || new Set();
			taskIdTasks.add(task.id);
			this.taskCache.taskId.set(task.metadata.id, taskIdTasks);
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
		for (const tag of task.metadata.tags) {
			const tagTasks = this.taskCache.tags.get(tag);
			if (tagTasks) {
				tagTasks.delete(task.id);
				if (tagTasks.size === 0) {
					this.taskCache.tags.delete(tag);
				}
			}
		}

		// Remove from project index
		if (task.metadata.project) {
			const projectTasks = this.taskCache.projects.get(
				task.metadata.project
			);
			if (projectTasks) {
				projectTasks.delete(task.id);
				if (projectTasks.size === 0) {
					this.taskCache.projects.delete(task.metadata.project);
				}
			}
		}

		// Remove from context index
		if (task.metadata.context) {
			const contextTasks = this.taskCache.contexts.get(
				task.metadata.context
			);
			if (contextTasks) {
				contextTasks.delete(task.id);
				if (contextTasks.size === 0) {
					this.taskCache.contexts.delete(task.metadata.context);
				}
			}
		}

		// Remove from date indexes
		if (task.metadata.dueDate) {
			const dateStr = formatDateForIndex(task.metadata.dueDate);
			const dueTasks = this.taskCache.dueDate.get(dateStr);
			if (dueTasks) {
				dueTasks.delete(task.id);
				if (dueTasks.size === 0) {
					this.taskCache.dueDate.delete(dateStr);
				}
			}
		}

		if (task.metadata.startDate) {
			const dateStr = formatDateForIndex(task.metadata.startDate);
			const startTasks = this.taskCache.startDate.get(dateStr);
			if (startTasks) {
				startTasks.delete(task.id);
				if (startTasks.size === 0) {
					this.taskCache.startDate.delete(dateStr);
				}
			}
		}

		if (task.metadata.scheduledDate) {
			const dateStr = formatDateForIndex(task.metadata.scheduledDate);
			const scheduledTasks = this.taskCache.scheduledDate.get(dateStr);
			if (scheduledTasks) {
				scheduledTasks.delete(task.id);
				if (scheduledTasks.size === 0) {
					this.taskCache.scheduledDate.delete(dateStr);
				}
			}
		}

		// Remove from priority index
		if (task.metadata.priority !== undefined) {
			const priorityTasks = this.taskCache.priority.get(
				task.metadata.priority
			);
			if (priorityTasks) {
				priorityTasks.delete(task.id);
				if (priorityTasks.size === 0) {
					this.taskCache.priority.delete(task.metadata.priority);
				}
			}
		}

		// Remove from cancelled date index
		if (task.metadata.cancelledDate) {
			const dateStr = formatDateForIndex(task.metadata.cancelledDate);
			const cancelledTasks = this.taskCache.cancelledDate.get(dateStr);
			if (cancelledTasks) {
				cancelledTasks.delete(task.id);
				if (cancelledTasks.size === 0) {
					this.taskCache.cancelledDate.delete(dateStr);
				}
			}
		}

		// Remove from onCompletion index
		if (task.metadata.onCompletion) {
			const onCompletionTasks = this.taskCache.onCompletion.get(
				task.metadata.onCompletion
			);
			if (onCompletionTasks) {
				onCompletionTasks.delete(task.id);
				if (onCompletionTasks.size === 0) {
					this.taskCache.onCompletion.delete(
						task.metadata.onCompletion
					);
				}
			}
		}

		// Remove from dependsOn index
		if (task.metadata.dependsOn && task.metadata.dependsOn.length > 0) {
			for (const dependency of task.metadata.dependsOn) {
				const dependsOnTasks = this.taskCache.dependsOn.get(dependency);
				if (dependsOnTasks) {
					dependsOnTasks.delete(task.id);
					if (dependsOnTasks.size === 0) {
						this.taskCache.dependsOn.delete(dependency);
					}
				}
			}
		}

		// Remove from task ID index
		if (task.metadata.id) {
			const taskIdTasks = this.taskCache.taskId.get(task.metadata.id);
			if (taskIdTasks) {
				taskIdTasks.delete(task.id);
				if (taskIdTasks.size === 0) {
					this.taskCache.taskId.delete(task.metadata.id);
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
				const priorityA = a.metadata.priority || 0;
				const priorityB = b.metadata.priority || 0;
				if (priorityA !== priorityB) {
					return priorityB - priorityA;
				}

				// Then by due date (earliest first)
				const dueDateA = a.metadata.dueDate || Number.MAX_SAFE_INTEGER;
				const dueDateB = b.metadata.dueDate || Number.MAX_SAFE_INTEGER;
				return dueDateA - dueDateB;
			});
		}

		return [...tasks].sort((a, b) => {
			for (const { field, direction } of sortBy) {
				let valueA: any;
				let valueB: any;

				// Check if field is in base task or metadata
				if (field in a) {
					valueA = (a as any)[field];
					valueB = (b as any)[field];
				} else {
					valueA = (a.metadata as any)[field];
					valueB = (b.metadata as any)[field];
				}

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
	 * Create a new task - Not implemented (handled by external components)
	 */
	public async createTask(taskData: Partial<Task>): Promise<Task> {
		throw new Error(
			"Task creation should be handled by external components"
		);
	}

	/**
	 * Update an existing task - Not implemented (handled by external components)
	 */
	public async updateTask(task: Task): Promise<void> {
		throw new Error(
			"Task updates should be handled by external components"
		);
	}

	/**
	 * Delete a task - Not implemented (handled by external components)
	 */
	public async deleteTask(taskId: string): Promise<void> {
		throw new Error(
			"Task deletion should be handled by external components"
		);
	}

	/**
	 * Reset the cache to empty
	 */
	public resetCache(): void {
		this.taskCache = this.initEmptyCache();
	}

	/**
	 * Set the cache from an external source (e.g. persisted cache)
	 */
	public setCache(cache: TaskCache): void {
		this.taskCache = cache;

		// Update lastIndexTime for all files in the cache
		for (const filePath of this.taskCache.files.keys()) {
			this.lastIndexTime.set(filePath, Date.now());
		}
	}
}
