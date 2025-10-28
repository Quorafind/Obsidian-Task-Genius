import type {
	Task,
	TaskCache,
	TaskFilter,
	SortingCriteria,
	TaskIndexer as TaskIndexerInterface,
} from "../../types/task";
import type { App, Vault, MetadataCache, TFile } from "obsidian";
import { TaskIndexer } from "@/core/task-indexer";
import { Storage } from "@/dataflow/persistence/Storage";
import { emit, Events, Seq } from "@/dataflow/events/Events";

/**
 * Task Repository - combines TaskIndexer with Storage for a complete data layer
 * This is the central repository for all task data operations
 */
export class Repository {
	private indexer: TaskIndexer;
	private storage: Storage;
	private lastSequence: number = 0;
	private sourceSeq: number = 0; // Track source sequence to differentiate events
	private icsEvents: Task[] = []; // Store ICS events separately
	private fileTasks = new Map<string, Task>(); // Store file-level tasks

	// Persistence queue management
	private persistQueue = new Set<string>();
	private persistTimer: NodeJS.Timeout | null = null;
	private lastPersistTime = 0;
	private readonly PERSIST_DELAY = 1000; // 1 second debounce
	private readonly MAX_QUEUE_SIZE = 10; // Max 10 files before forcing persist
	private readonly MAX_PERSIST_INTERVAL = 5000; // Max 5 seconds between persists

	constructor(
		private app: App,
		private vault: Vault,
		private metadataCache: MetadataCache
	) {
		this.indexer = new TaskIndexer(app, vault, metadataCache);
		// Use a stable version string to avoid cache invalidation
		this.storage = new Storage(
			app.appId || "obsidian-task-genius",
			"1.0.0"
		);
	}

	/** Allow orchestrator to pass a central FileFilterManager down to indexer */
	public setFileFilterManager(filterManager: any) {
		// TaskIndexer has setFileFilterManager API
		(this.indexer as any).setFileFilterManager?.(filterManager);
	}

	/** Get all file paths currently present in the inline index */
	public async getIndexedFilePaths(): Promise<string[]> {
		const snapshot = await this.indexer.getIndexSnapshot();
		return Array.from(snapshot.files.keys());
	}

	/** Get all file paths that currently have file-level tasks */
	public getFileTaskPaths(): string[] {
		return Array.from(this.fileTasks.keys());
	}

	/**
	 * Initialize the repository (load persisted data if available)
	 */
	async initialize(): Promise<void> {
		console.log("[Repository] Initializing repository...");

		try {
			// Try to load consolidated index from storage
			console.log(
				"[Repository] Attempting to load consolidated index from storage..."
			);
			const consolidated = await this.storage.loadConsolidated();

			if (consolidated && consolidated.data) {
				// Restore the index from persisted data
				const snapshotTaskCount = consolidated.data?.tasks
					? consolidated.data.tasks instanceof Map
						? consolidated.data.tasks.size
						: Object.keys(consolidated.data.tasks).length
					: 0;
				console.log(
					`[Repository] Found persisted snapshot with ${snapshotTaskCount} tasks, restoring...`
				);
				await this.indexer.restoreFromSnapshot(consolidated.data);

				const taskCount = await this.indexer.getTotalTaskCount();
				console.log(
					`[Repository] Index restored successfully with ${taskCount} tasks`
				);

				// Emit cache ready event
				emit(this.app, Events.CACHE_READY, {
					initial: true,
					timestamp: Date.now(),
					seq: Seq.next(),
				});
			} else {
				console.log(
					"[Repository] No persisted data found, starting with empty index"
				);
			}

			// Load ICS events from storage
			console.log("[Repository] Loading ICS events from storage...");
			this.icsEvents = await this.storage.loadIcsEvents();
			console.log(
				`[Repository] Loaded ${this.icsEvents.length} ICS events from storage`
			);

			// Load file tasks from storage
			console.log("[Repository] Loading file tasks from storage...");
			this.fileTasks = await this.storage.loadFileTasks();
			console.log(
				`[Repository] Loaded ${this.fileTasks.size} file tasks from storage`
			);
		} catch (error) {
			console.error("[Repository] Error during initialization:", error);
			// Continue with empty index on error
			console.log("[Repository] Continuing with empty index after error");
		}
	}

	/**
	 * Update tasks for a specific file
	 * @param filePath - Path of the file
	 * @param tasks - Tasks to update
	 * @param sourceSeq - Optional source sequence to track event origin
	 * @param options - Optional controls (persist to storage, force event emission)
	 */
	async updateFile(
		filePath: string,
		tasks: Task[],
		sourceSeq?: number,
		options?: { persist?: boolean; forceEmit?: boolean }
	): Promise<void> {
		const persist = options?.persist !== false; // default true
		const forceEmit = options?.forceEmit === true;
		// Check if tasks have actually changed relative to storage
		const existingAugmented = await this.storage.loadAugmented(filePath);
		const hasChanges =
			!existingAugmented ||
			JSON.stringify(tasks) !== JSON.stringify(existingAugmented.data);

		// Always update the in-memory index for consistency
		await this.indexer.updateIndexWithTasks(filePath, tasks);

		// Optionally store augmented tasks to cache
		if (persist) {
			await this.storage.storeAugmented(filePath, tasks);
		}

		// Schedule persist operation for single file updates
		if (persist && hasChanges) {
			this.schedulePersist(filePath);
		}

		// Emit update event if there are actual changes OR forced by caller
		if (hasChanges || forceEmit) {
			this.lastSequence = Seq.next();
			emit(this.app, Events.TASK_CACHE_UPDATED, {
				changedFiles: [filePath],
				stats: {
					total: await this.indexer.getTotalTaskCount(),
					changed: tasks.length,
				},
				timestamp: Date.now(),
				seq: this.lastSequence,
				sourceSeq: sourceSeq || 0, // Include source sequence for loop detection
			});
		}
	}

	/**
	 * Update tasks for multiple files in batch
	 * @param updates - Map of file paths to tasks
	 * @param sourceSeq - Optional source sequence to track event origin
	 * @param options - Optional controls (persist to storage, force event emission)
	 */
	async updateBatch(
		updates: Map<string, Task[]>,
		sourceSeq?: number,
		options?: { persist?: boolean; forceEmit?: boolean }
	): Promise<void> {
		const persist = options?.persist !== false; // default true
		const forceEmit = options?.forceEmit === true;
		const changedFiles: string[] = [];
		let totalChanged = 0;
		let hasActualChanges = false;

		// Process each file update and check for actual changes
		for (const [filePath, tasks] of updates) {
			// Check if tasks have actually changed relative to storage
			const existingAugmented = await this.storage.loadAugmented(
				filePath
			);
			const hasChanges =
				!existingAugmented ||
				JSON.stringify(tasks) !==
					JSON.stringify(existingAugmented.data);

			await this.indexer.updateIndexWithTasks(filePath, tasks);
			if (persist) {
				await this.storage.storeAugmented(filePath, tasks);
			}

			if (hasChanges) {
				changedFiles.push(filePath);
				totalChanged += tasks.length;
				hasActualChanges = true;
			}
		}

		// Emit events and persist if there are actual changes OR forced by caller
		if (hasActualChanges || forceEmit) {
			if (persist && hasActualChanges) {
				// Persist the consolidated index after batch updates
				await this.persist();
				console.log(
					`[Repository] Persisted index after batch update of ${changedFiles.length} files with changes`
				);
			}

			// If forced emit but no changedFiles computed, include all update keys
			const filesToReport =
				changedFiles.length > 0
					? changedFiles
					: Array.from(updates.keys());

			this.lastSequence = Seq.next();
			emit(this.app, Events.TASK_CACHE_UPDATED, {
				changedFiles: filesToReport,
				stats: {
					total: await this.indexer.getTotalTaskCount(),
					changed: totalChanged,
				},
				timestamp: Date.now(),
				seq: this.lastSequence,
				sourceSeq: sourceSeq || 0, // Include source sequence for loop detection
			});
		} else {
			console.log(
				`[Repository] Batch update completed with no actual changes - skipping event emission`
			);
		}
	}

	/**
	 * Remove tasks for a file
	 */
	async removeFile(filePath: string): Promise<void> {
		await this.indexer.removeTasksFromFile(filePath);

		// Clear storage for this file
		await this.storage.clearFile(filePath);

		// Emit update event
		this.lastSequence = Seq.next();
		emit(this.app, Events.TASK_CACHE_UPDATED, {
			changedFiles: [filePath],
			stats: {
				total: await this.indexer.getTotalTaskCount(),
				changed: 0,
			},
			timestamp: Date.now(),
			seq: this.lastSequence,
		});
	}

	/**
	 * Remove a single task by ID
	 */
	async removeTaskById(taskId: string): Promise<void> {
		// Get the task to find its file path
		const task = await this.indexer.getTaskById(taskId);
		if (!task) return;

		// Remove from indexer
		await this.indexer.removeTask(taskId);

		// Schedule persist for the task's file
		this.schedulePersist(task.filePath);
	}

	/**
	 * Update ICS events in the repository
	 */
	async updateIcsEvents(events: Task[], sourceSeq?: number): Promise<void> {
		console.log(`[Repository] Updating ${events.length} ICS events`);

		// Store the new ICS events
		this.icsEvents = events;

		// Store ICS events to persistence
		await this.storage.storeIcsEvents(events);

		// Emit update event to notify views
		this.lastSequence = Seq.next();
		emit(this.app, Events.TASK_CACHE_UPDATED, {
			changedFiles: ["ics:events"], // Special marker for ICS events
			stats: {
				total: await this.getTotalTaskCount(),
				changed: events.length,
				icsEvents: events.length,
			},
			timestamp: Date.now(),
			seq: this.lastSequence,
			sourceSeq: sourceSeq || 0,
		});
	}

	/**
	 * Get total task count including ICS events and file tasks
	 */
	async getTotalTaskCount(): Promise<number> {
		const fileTaskCount = await this.indexer.getTotalTaskCount();
		return fileTaskCount + this.icsEvents.length + this.fileTasks.size;
	}

	/**
	 * Get all tasks from the index (including ICS events and file tasks)
	 */
	async all(): Promise<Task[]> {
		const regularTasks = await this.indexer.getAllTasks();
		const fileTaskArray = Array.from(this.fileTasks.values());
		// Merge file-based tasks with ICS events and file tasks
		return [...regularTasks, ...this.icsEvents, ...fileTaskArray];
	}

	/**
	 * Get tasks by project
	 */
	async byProject(project: string): Promise<Task[]> {
		const taskIds = await this.indexer.getTaskIdsByProject(project);
		const fileTasks = await this.getTasksByIds(taskIds);

		// Also filter ICS events by project if they have one
		const icsProjectTasks = this.icsEvents.filter(
			(task) => task.metadata?.project === project
		);

		return [...fileTasks, ...icsProjectTasks];
	}

	/**
	 * Get tasks by tags
	 */
	async byTags(tags: string[]): Promise<Task[]> {
		const taskIdSets = await Promise.all(
			tags.map((tag) => this.indexer.getTaskIdsByTag(tag))
		);

		// Find intersection of all tag sets
		if (taskIdSets.length === 0) return [];

		let intersection = new Set(taskIdSets[0]);
		for (let i = 1; i < taskIdSets.length; i++) {
			intersection = new Set(
				[...intersection].filter((id) => taskIdSets[i].has(id))
			);
		}

		return this.getTasksByIds(intersection);
	}

	/**
	 * Get tasks by completion status
	 */
	async byStatus(completed: boolean): Promise<Task[]> {
		const taskIds = await this.indexer.getTaskIdsByCompletionStatus(
			completed
		);
		return this.getTasksByIds(taskIds);
	}

	/**
	 * Get tasks by date range
	 */
	async byDateRange(opts: {
		from?: number;
		to?: number;
		field?: "due" | "start" | "scheduled";
	}): Promise<Task[]> {
		const field = opts.field || "due";
		const cache = await this.indexer.getCache();

		const dateIndex =
			field === "due"
				? cache.dueDate
				: field === "start"
				? cache.startDate
				: cache.scheduledDate;

		const taskIds = new Set<string>();

		for (const [dateStr, ids] of dateIndex) {
			const date = new Date(dateStr).getTime();

			if (opts.from && date < opts.from) continue;
			if (opts.to && date > opts.to) continue;

			for (const id of ids) {
				taskIds.add(id);
			}
		}

		return this.getTasksByIds(taskIds);
	}

	/**
	 * Get a task by ID
	 */
	async byId(id: string): Promise<Task | null> {
		return this.indexer.getTaskById(id) || null;
	}

	/**
	 * Query tasks with filter and sorting
	 */
	async query(
		filter?: TaskFilter,
		sorting?: SortingCriteria[]
	): Promise<Task[]> {
		const filters = filter ? [filter] : [];
		return this.indexer.queryTasks(filters, sorting);
	}

	/**
	 * Get index summary statistics
	 */
	async getSummary(): Promise<{
		total: number;
		byProject: Map<string, number>;
		byTag: Map<string, number>;
		byStatus: Map<boolean, number>;
	}> {
		const cache = await this.indexer.getCache();

		const byProject = new Map<string, number>();
		for (const [project, ids] of cache.projects) {
			byProject.set(project, ids.size);
		}

		const byTag = new Map<string, number>();
		for (const [tag, ids] of cache.tags) {
			byTag.set(tag, ids.size);
		}

		const byStatus = new Map<boolean, number>();
		for (const [status, ids] of cache.completed) {
			byStatus.set(status, ids.size);
		}

		return {
			total: cache.tasks.size,
			byProject,
			byTag,
			byStatus,
		};
	}

	/**
	 * Save the current index to persistent storage
	 */
	async persist(): Promise<void> {
		const snapshot = await this.indexer.getIndexSnapshot();
		await this.storage.storeConsolidated(snapshot);

		// Also persist file tasks
		await this.storage.storeFileTasks(this.fileTasks);
	}

	/**
	 * Schedule a persist operation with debouncing and batching
	 */
	private schedulePersist(source: string): void {
		this.persistQueue.add(source);

		// Check if we should persist immediately
		const shouldPersistNow =
			this.persistQueue.size >= this.MAX_QUEUE_SIZE ||
			Date.now() - this.lastPersistTime > this.MAX_PERSIST_INTERVAL;

		if (shouldPersistNow) {
			this.executePersist();
		} else {
			// Schedule delayed persist
			if (this.persistTimer) {
				clearTimeout(this.persistTimer);
			}
			this.persistTimer = setTimeout(() => {
				this.executePersist();
			}, this.PERSIST_DELAY);
		}
	}

	/**
	 * Execute the pending persist operation
	 */
	private async executePersist(): Promise<void> {
		if (this.persistTimer) {
			clearTimeout(this.persistTimer);
			this.persistTimer = null;
		}

		if (this.persistQueue.size > 0) {
			const queueSize = this.persistQueue.size;
			console.log(`[Repository] Persisting after ${queueSize} changes`);
			await this.persist();
			this.persistQueue.clear();
			this.lastPersistTime = Date.now();
		}
	}

	/**
	 * Clear all data
	 */
	async clear(): Promise<void> {
		await this.indexer.clearIndex();
		await this.storage.clear();
	}

	/**
	 * Set the parse file callback for the indexer
	 */
	setParseFileCallback(callback: (file: TFile) => Promise<Task[]>): void {
		this.indexer.setParseFileCallback(callback);
	}

	/**
	 * Get the underlying indexer (for advanced usage)
	 */
	getIndexer(): TaskIndexer {
		return this.indexer;
	}

	/**
	 * Get the underlying storage (for advanced usage)
	 */
	getStorage(): Storage {
		return this.storage;
	}

	/**
	 * Helper: Get tasks by a set of IDs
	 */
	private async getTasksByIds(
		taskIds: Set<string> | string[]
	): Promise<Task[]> {
		const tasks: Task[] = [];
		const ids = Array.isArray(taskIds) ? taskIds : Array.from(taskIds);

		for (const id of ids) {
			const task = await this.indexer.getTaskById(id);
			if (task) {
				tasks.push(task);
			}
		}

		return tasks;
	}

	/**
	 * Cleanup and ensure all pending data is persisted
	 */
	async cleanup(): Promise<void> {
		// Execute any pending persist operations
		await this.executePersist();
	}

	/**
	 * Update a file-level task (from FileSource)
	 */
	async updateFileTask(task: Task): Promise<void> {
		const filePath = task.filePath;
		if (!filePath) return;

		// Store the file task
		this.fileTasks.set(filePath, task);

		// Schedule persist for file tasks
		this.schedulePersist(`file-task:${filePath}`);

		// Emit update event
		this.lastSequence = Seq.next();
		emit(this.app, Events.TASK_CACHE_UPDATED, {
			changedFiles: [`file-task:${filePath}`],
			stats: {
				total: await this.getTotalTaskCount(),
				changed: 1,
				fileTasks: this.fileTasks.size,
			},
			timestamp: Date.now(),
			seq: this.lastSequence,
		});
	}

	/**
	 * Remove a file-level task (from FileSource)
	 */
	async removeFileTask(filePath: string): Promise<void> {
		if (!this.fileTasks.has(filePath)) return;

		// Remove the file task
		this.fileTasks.delete(filePath);

		// Schedule persist for file tasks
		this.schedulePersist(`file-task:${filePath}`);

		// Emit update event
		this.lastSequence = Seq.next();
		emit(this.app, Events.TASK_CACHE_UPDATED, {
			changedFiles: [`file-task:${filePath}`],
			stats: {
				total: await this.getTotalTaskCount(),
				changed: -1,
				fileTasks: this.fileTasks.size,
			},
			timestamp: Date.now(),
			seq: this.lastSequence,
		});
	}

	/**
	 * Get a task by its ID
	 */
	async getTaskById(taskId: string): Promise<Task | undefined> {
		// Get all tasks from the repository
		const allTasks = await this.all();

		// Find the task by ID
		const task = allTasks.find((t) => t.id === taskId);

		return task;
	}

	/**
	 * Update a single task directly (for inline editing)
	 * This avoids re-parsing the entire file
	 */
	async updateSingleTask(updatedTask: Task): Promise<void> {
		const filePath = updatedTask.filePath;
		if (!filePath) return;

		console.log(
			`[Repository] Updating single task: ${updatedTask.id} in ${filePath}`
		);

		// Load existing augmented tasks for the file
		const existingAugmented = await this.storage.loadAugmented(filePath);
		if (!existingAugmented) {
			console.warn(
				`[Repository] No existing tasks found for ${filePath}, cannot update single task`
			);
			return;
		}

		// Find and replace the task in the array
		const tasks = existingAugmented.data;
		const taskIndex = tasks.findIndex((t) => t.id === updatedTask.id);

		if (taskIndex === -1) {
			console.warn(
				`[Repository] Task ${updatedTask.id} not found in ${filePath}`
			);
			return;
		}

		// Update the task
		tasks[taskIndex] = updatedTask;

		// Update the index and storage
		await this.indexer.updateIndexWithTasks(filePath, tasks);
		await this.storage.storeAugmented(filePath, tasks);

		// Schedule persist operation
		this.schedulePersist(filePath);

		// Emit update event
		this.lastSequence = Seq.next();
		emit(this.app, Events.TASK_CACHE_UPDATED, {
			changedFiles: [filePath],
			stats: {
				total: await this.getTotalTaskCount(),
				changed: 1,
			},
			timestamp: Date.now(),
			seq: this.lastSequence,
			sourceSeq: undefined,
		});

		console.log(
			`[Repository] Single task ${updatedTask.id} updated successfully`
		);
	}
}
