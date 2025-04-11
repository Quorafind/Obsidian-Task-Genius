/**
 * TaskManager - Primary interface for task management
 *
 * This class serves as the main entry point for all task-related operations,
 * wrapping the TaskIndexer implementation and providing a simplified API.
 */

import { App, Component, MetadataCache, TFile, Vault } from "obsidian";
import {
	Task,
	TaskFilter,
	SortingCriteria,
	TaskCache,
} from "./types/TaskIndex";
import { TaskIndexer } from "./import/TaskIndexer";
import { TaskWorkerManager } from "./workers/TaskWorkerManager";
import { LocalStorageCache } from "./persister";

/**
 * TaskManager options
 */
export interface TaskManagerOptions {
	/** Whether to use web workers for processing (if available) */
	useWorkers?: boolean;
	/** Number of workers to use (if workers are enabled) */
	maxWorkers?: number;
	/** Whether to print debug information */
	debug?: boolean;
}

/**
 * Default options for task manager
 */
const DEFAULT_OPTIONS: TaskManagerOptions = {
	useWorkers: true,
	maxWorkers: 2,
	debug: false,
};

/**
 * TaskManager provides a unified interface for working with tasks in Obsidian
 */
export class TaskManager extends Component {
	/** The primary task indexer implementation */
	private indexer: TaskIndexer;
	/** Optional worker manager for background processing */
	private workerManager?: TaskWorkerManager;
	/** Options for the task manager */
	private options: TaskManagerOptions;
	/** Whether the manager has been initialized */
	private initialized: boolean = false;
	/** Whether initialization is currently in progress */
	private isInitializing: boolean = false;
	/** Whether we should trigger update events after initialization */
	private updateEventPending: boolean = false;
	/** Local-storage backed cache of metadata objects. */
	persister: LocalStorageCache;

	/**
	 * Create a new task manager
	 */
	constructor(
		private app: App,
		private vault: Vault,
		private metadataCache: MetadataCache,
		private version: string,
		options: Partial<TaskManagerOptions> = {}
	) {
		super();
		this.options = { ...DEFAULT_OPTIONS, ...options };

		// Initialize the main indexer
		this.indexer = new TaskIndexer(
			this.app,
			this.vault,
			this.metadataCache
		);
		this.persister = new LocalStorageCache("primary", this.version);

		// Set up the worker manager if workers are enabled
		if (this.options.useWorkers) {
			try {
				this.workerManager = new TaskWorkerManager(
					this.vault,
					this.metadataCache,
					{
						maxWorkers: this.options.maxWorkers,
						debug: this.options.debug,
					}
				);
				this.log("Worker manager initialized");
			} catch (error) {
				console.error("Failed to initialize worker manager:", error);
				this.log("Falling back to single-threaded indexing");
			}
		}

		// Register event handlers
		this.registerEventHandlers();

		this.addChild(this.indexer);
		if (this.workerManager) {
			this.addChild(this.workerManager);
		}
	}

	/**
	 * Register event handlers for file changes
	 */
	private registerEventHandlers(): void {
		// Watch for file modifications
		this.registerEvent(
			this.metadataCache.on("changed", (file, content, cache) => {
				this.log("All files resolved, updating indexes");
				// Trigger a full index update when all files are resolved
				if (file instanceof TFile && file.extension === "md") {
					this.indexFile(file);
				}
			})
		);

		// Watch for individual file changes
		this.registerEvent(
			this.metadataCache.on("deleted", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.removeFileFromIndex(file);
				}
			})
		);

		// Watch for file deletions
		this.registerEvent(
			this.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile && file.extension === "md") {
					this.removeFileFromIndexByOldPath(oldPath);
					this.indexFile(file);
				}
			})
		);

		// Watch for new files
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.vault.on("create", (file) => {
					if (file instanceof TFile && file.extension === "md") {
						this.indexFile(file);
					}
				})
			);
		});
	}

	/**
	 * Initialize the task manager and index all files
	 */
	public async initialize(): Promise<void> {
		if (this.initialized) return;
		if (this.isInitializing) {
			this.log("Initialization already in progress, skipping");
			this.updateEventPending = true; // Mark event as pending when init completes
			return;
		}

		this.isInitializing = true;
		this.updateEventPending = true; // We'll trigger the event when done
		this.log("Initializing task manager");

		try {
			// 重置索引缓存，确保从空白开始
			this.indexer.resetCache();

			// 获取所有Markdown文件
			const files = this.vault.getMarkdownFiles();
			this.log(`Found ${files.length} files to index`);

			// 尝试从缓存加载任务数据并清理不存在的文件缓存
			try {
				const currentFilePaths = files.map((file) => file.path);
				const cleared = await this.persister.synchronize(
					currentFilePaths
				);
				if (cleared.size > 0) {
					this.log(
						`Dropped ${cleared.size} out-of-date file task caches`
					);
				}
			} catch (error) {
				console.error("Error synchronizing task cache:", error);
			}

			if (this.workerManager && files.length > 0) {
				try {
					// 分批处理文件以避免过度占用内存
					const batchSize = 50;
					let importedCount = 0;
					let cachedCount = 0;

					for (let i = 0; i < files.length; i += batchSize) {
						const batch = files.slice(i, i + batchSize);
						this.log(
							`Processing batch ${
								Math.floor(i / batchSize) + 1
							}/${Math.ceil(files.length / batchSize)} (${
								batch.length
							} files)`
						);

						// 处理批次中的每个文件
						for (const file of batch) {
							// 尝试从缓存加载
							try {
								const cached = await this.persister.loadFile<
									Task[]
								>(file.path);
								if (
									cached &&
									cached.time >= file.stat.mtime &&
									cached.version === this.version
								) {
									// 使用缓存数据更新索引
									this.indexer.updateIndexWithTasks(
										file.path,
										cached.data
									);
									this.log(
										`Loaded ${cached.data.length} tasks from cache for ${file.path}`
									);
									cachedCount++;
								} else {
									// 缓存不存在或已过期，使用worker处理
									// 不要触发事件 - 我们会在初始化完成后一次性触发
									await this.processFileWithoutEvents(file);
									importedCount++;
								}
							} catch (error) {
								console.error(
									`Error processing file ${file.path}:`,
									error
								);
								// 出错时使用主线程处理
								await this.indexer.indexFile(file);
								importedCount++;
							}
						}

						// 在批次之间让出时间给主线程
						await new Promise((resolve) => setTimeout(resolve, 0));
					}

					this.log(
						`Completed worker-based indexing (${importedCount} imported, ${cachedCount} from cache)`
					);
				} catch (error) {
					console.error(
						"Error using workers for initial indexing:",
						error
					);
					this.log("Falling back to single-threaded indexing");

					// 如果使用worker失败，重新初始化索引并使用单线程处理
					this.indexer.resetCache();
					await this.fallbackToMainThreadIndexing(files);
				}
			} else {
				// 没有worker或没有文件时，使用单线程索引
				await this.fallbackToMainThreadIndexing(files);
			}

			this.initialized = true;
			const totalTasks = this.indexer.getCache().tasks.size;
			this.log(`Task manager initialized with ${totalTasks} tasks`);

			// Trigger task cache updated event once initialization is complete
			if (this.updateEventPending) {
				this.app.workspace.trigger(
					"task-genius:task-cache-updated",
					this.indexer.getCache()
				);
				this.updateEventPending = false; // Reset the pending flag
			}
		} catch (error) {
			console.error("Task manager initialization failed:", error);
			this.updateEventPending = false; // Reset on error
		} finally {
			this.isInitializing = false;
		}
	}

	/**
	 * Process a file using worker without triggering events - used during initialization
	 */
	private async processFileWithoutEvents(file: TFile): Promise<void> {
		if (!this.workerManager) {
			// If worker manager is not available, use main thread processing
			await this.indexer.indexFile(file);
			// Cache the results
			const tasks = this.getTasksForFile(file.path);
			if (tasks.length > 0) {
				await this.persister.storeFile(file.path, tasks);
			}
			return;
		}

		try {
			// Use the worker to process the file
			const tasks = await this.workerManager.processFile(file);

			// Update the index with the tasks
			this.indexer.updateIndexWithTasks(file.path, tasks);

			// Store tasks in cache if there are any
			if (tasks.length > 0) {
				await this.persister.storeFile(file.path, tasks);
				this.log(
					`Processed and cached ${tasks.length} tasks in ${file.path}`
				);
			} else {
				// If no tasks were found, remove the file from cache
				await this.persister.removeFile(file.path);
			}

			// No event triggering in this version
		} catch (error) {
			console.error(`Worker error processing ${file.path}:`, error);
			// Fall back to main thread indexing
			await this.indexer.indexFile(file);
			// Cache the results after main thread processing
			const tasks = this.getTasksForFile(file.path);
			if (tasks.length > 0) {
				await this.persister.storeFile(file.path, tasks);
			}

			// No event triggering in this version
		}
	}

	/**
	 * Process a file using worker and update cache (with event triggering)
	 */
	private async processFileWithWorker(file: TFile): Promise<void> {
		if (!this.workerManager) {
			// If worker manager is not available, use main thread processing
			await this.indexer.indexFile(file);
			// Cache the results
			const tasks = this.getTasksForFile(file.path);
			if (tasks.length > 0) {
				await this.persister.storeFile(file.path, tasks);
			}
			return;
		}

		try {
			// Use the worker to process the file
			const tasks = await this.workerManager.processFile(file);

			// Update the index with the tasks
			this.indexer.updateIndexWithTasks(file.path, tasks);

			// Store tasks in cache if there are any
			if (tasks.length > 0) {
				await this.persister.storeFile(file.path, tasks);
				this.log(
					`Processed and cached ${tasks.length} tasks in ${file.path}`
				);
			} else {
				// If no tasks were found, remove the file from cache
				await this.persister.removeFile(file.path);
			}

			// Only trigger events if we're not in the process of initializing
			// This prevents circular event triggering during initialization
			if (!this.isInitializing) {
				// Trigger task cache updated event
				this.app.workspace.trigger(
					"task-genius:task-cache-updated",
					this.indexer.getCache()
				);
			}
		} catch (error) {
			console.error(`Worker error processing ${file.path}:`, error);
			// Fall back to main thread indexing
			await this.indexer.indexFile(file);
			// Cache the results after main thread processing
			const tasks = this.getTasksForFile(file.path);
			if (tasks.length > 0) {
				await this.persister.storeFile(file.path, tasks);
			}

			// Only trigger events if we're not in the process of initializing
			if (!this.isInitializing) {
				// Trigger task cache updated event
				this.app.workspace.trigger(
					"task-genius:task-cache-updated",
					this.indexer.getCache()
				);
			}
		}
	}

	/**
	 * 当worker处理失败时，使用主线程处理所有文件
	 */
	private async fallbackToMainThreadIndexing(files: TFile[]): Promise<void> {
		this.log(`Indexing ${files.length} files using main thread...`);

		// 使用更小的批量大小避免UI冻结
		const batchSize = 10;
		let importedCount = 0;
		let cachedCount = 0;

		for (let i = 0; i < files.length; i += batchSize) {
			const batch = files.slice(i, i + batchSize);

			// 处理批次中的每个文件
			for (const file of batch) {
				// 尝试从缓存加载
				try {
					const cached = await this.persister.loadFile<Task[]>(
						file.path
					);
					if (
						cached &&
						cached.time >= file.stat.mtime &&
						cached.version === this.version
					) {
						// 使用缓存数据更新索引
						this.indexer.updateIndexWithTasks(
							file.path,
							cached.data
						);
						this.log(
							`Loaded ${cached.data.length} tasks from cache for ${file.path}`
						);
						cachedCount++;
					} else {
						// 缓存不存在或已过期，使用主线程处理
						await this.indexer.indexFile(file);
						// 获取处理后的任务并存储到缓存
						const tasks = this.getTasksForFile(file.path);
						if (tasks.length > 0) {
							await this.persister.storeFile(file.path, tasks);
							this.log(
								`Processed and cached ${tasks.length} tasks in ${file.path}`
							);
						} else {
							// If no tasks were found, remove the file from cache if it exists
							if (await this.persister.hasFile(file.path)) {
								await this.persister.removeFile(file.path);
							}
						}
						importedCount++;
					}
				} catch (error) {
					console.error(`Error processing file ${file.path}:`, error);
					// 出错时使用主线程处理
					await this.indexer.indexFile(file);
					importedCount++;
				}
			}

			// 更新进度日志
			if ((i + batchSize) % 100 === 0 || i + batchSize >= files.length) {
				this.log(
					`Indexed ${Math.min(i + batchSize, files.length)}/${
						files.length
					} files (${Math.round(
						(Math.min(i + batchSize, files.length) / files.length) *
							100
					)}%)`
				);
			}

			// 让出时间给主线程
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		this.log(
			`Completed main-thread indexing (${importedCount} imported, ${cachedCount} from cache)`
		);

		// After all files are processed, only trigger the event at the end of batch processing
		// This helps prevent recursive event triggering during initialization
		if (!this.isInitializing) {
			// Trigger task cache updated event after completing indexing
			this.app.workspace.trigger(
				"task-genius:task-cache-updated",
				this.indexer.getCache()
			);
		}
	}

	/**
	 * Index a single file
	 */
	public async indexFile(file: TFile): Promise<void> {
		if (!this.initialized) {
			if (this.isInitializing) {
				this.log(
					`Skipping indexFile for ${file.path} - initialization in progress`
				);
				return;
			}

			this.log(`Need to initialize before indexing file: ${file.path}`);
			await this.initialize();

			// If initialization failed, return early
			if (!this.initialized) {
				console.warn(
					`Cannot index ${file.path} - initialization failed`
				);
				return;
			}
		}

		this.log(`Indexing file: ${file.path}`);

		// Use the worker if available
		if (this.workerManager) {
			// During initialization, use the method without event triggering
			if (this.isInitializing) {
				await this.processFileWithoutEvents(file);
			} else {
				await this.processFileWithWorker(file);
			}
		} else {
			// Use main thread indexing
			await this.indexer.indexFile(file);
			// Cache the results
			const tasks = this.getTasksForFile(file.path);
			if (tasks.length > 0) {
				await this.persister.storeFile(file.path, tasks);
				this.log(
					`Processed ${tasks.length} tasks in ${file.path} using main thread`
				);
			} else {
				// If no tasks found, remove from cache if it exists
				if (await this.persister.hasFile(file.path)) {
					await this.persister.removeFile(file.path);
				}
			}

			// Only trigger events if not initializing
			if (!this.isInitializing) {
				// Trigger task cache updated event
				this.app.workspace.trigger(
					"task-genius:task-cache-updated",
					this.indexer.getCache()
				);
			}
		}
	}

	/**
	 * Synchronize worker-processed tasks with the main indexer
	 */
	private syncWorkerResults(filePath: string, tasks: Task[]): void {
		// Directly update the indexer with the worker results
		this.indexer.updateIndexWithTasks(filePath, tasks);

		// Trigger task cache updated event
		this.app.workspace.trigger(
			"task-genius:task-cache-updated",
			this.indexer.getCache()
		);
	}

	/**
	 * Format a date for index keys (YYYY-MM-DD)
	 */
	private formatDateForIndex(date: number): string {
		const d = new Date(date);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
			2,
			"0"
		)}-${String(d.getDate()).padStart(2, "0")}`;
	}

	/**
	 * Remove a file from the index based on the old path
	 */
	private removeFileFromIndexByOldPath(oldPath: string): void {
		this.indexer.updateIndexWithTasks(oldPath, []);
		try {
			this.persister.removeFile(oldPath);
			this.log(`Removed ${oldPath} from cache`);

			// Trigger task cache updated event
			this.app.workspace.trigger(
				"task-genius:task-cache-updated",
				this.indexer.getCache()
			);
		} catch (error) {
			console.error(`Error removing ${oldPath} from cache:`, error);
		}
	}

	/**
	 * Remove a file from the index
	 */
	private removeFileFromIndex(file: TFile): void {
		// 使用 indexer 的方法来删除文件
		this.indexer.updateIndexWithTasks(file.path, []);

		// 从缓存中删除文件
		try {
			this.persister.removeFile(file.path);
			this.log(`Removed ${file.path} from cache`);

			// Trigger task cache updated event
			this.app.workspace.trigger(
				"task-genius:task-cache-updated",
				this.indexer.getCache()
			);
		} catch (error) {
			console.error(`Error removing ${file.path} from cache:`, error);
		}
	}

	/**
	 * Query tasks based on filters and sorting criteria
	 */
	public queryTasks(
		filters: TaskFilter[] = [],
		sortBy: SortingCriteria[] = []
	): Task[] {
		if (!this.initialized) {
			console.warn("Task manager not initialized, initializing now");
			// Instead of calling initialize() directly which causes recursion,
			// schedule it for the next event loop and return empty results for now
			setTimeout(() => {
				if (!this.initialized) {
					this.initialize().catch((error) => {
						console.error(
							"Error during delayed initialization:",
							error
						);
					});
				}
			}, 0);
			return [];
		}

		return this.indexer.queryTasks(filters, sortBy);
	}

	/**
	 * Get all tasks in the vault
	 */
	public getAllTasks(): Task[] {
		return this.queryTasks();
	}

	/**
	 * Get a task by ID
	 */
	public getTaskById(id: string): Task | undefined {
		return this.indexer.getTaskById(id);
	}

	/**
	 * Get all tasks in a file
	 */
	public getTasksForFile(filePath: string): Task[] {
		const cache = this.indexer.getCache();
		const taskIds = cache.files.get(filePath);

		if (!taskIds) return [];

		return Array.from(taskIds)
			.map((id) => cache.tasks.get(id))
			.filter((task): task is Task => task !== undefined);
	}

	/**
	 * Get tasks matching specific criteria
	 */
	public getTasksByFilter(filter: TaskFilter): Task[] {
		return this.queryTasks([filter]);
	}

	/**
	 * Get incomplete tasks
	 */
	public getIncompleteTasks(): Task[] {
		return this.queryTasks([
			{ type: "status", operator: "=", value: false },
		]);
	}

	/**
	 * Get completed tasks
	 */
	public getCompletedTasks(): Task[] {
		return this.queryTasks([
			{ type: "status", operator: "=", value: true },
		]);
	}

	/**
	 * Get tasks due today
	 */
	public getTasksDueToday(): Task[] {
		const today = new Date();
		const dateStr = `${today.getFullYear()}-${String(
			today.getMonth() + 1
		).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

		return this.queryTasks([
			{ type: "dueDate", operator: "=", value: dateStr },
		]);
	}

	/**
	 * Get overdue tasks
	 */
	public getOverdueTasks(): Task[] {
		const today = new Date();
		const dateStr = `${today.getFullYear()}-${String(
			today.getMonth() + 1
		).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

		return this.queryTasks([
			{ type: "dueDate", operator: "before", value: dateStr },
			{ type: "status", operator: "=", value: false },
		]);
	}

	/**
	 * Update an existing task
	 * This method updates both the task index and the task in the file
	 */
	public async updateTask(updatedTask: Task): Promise<void> {
		// Get the original task to compare changes
		const originalTask = this.indexer.getTaskById(updatedTask.id);
		if (!originalTask) {
			throw new Error(`Task with ID ${updatedTask.id} not found`);
		}

		try {
			// Get the file from the vault
			const file = this.vault.getFileByPath(updatedTask.filePath);
			if (!(file instanceof TFile) || !file) {
				throw new Error(`File not found: ${updatedTask.filePath}`);
			}

			// Read the file content
			const content = await this.vault.read(file);
			const lines = content.split("\n");

			// Get the line with the task
			const taskLine = lines[updatedTask.line];
			if (!taskLine) {
				throw new Error(
					`Task line ${updatedTask.line} not found in file ${updatedTask.filePath}`
				);
			}

			// Extract and preserve indentation
			const indentMatch = taskLine.match(/^(\s*)/);
			const indentation = indentMatch ? indentMatch[0] : "";

			// Build the updated task line
			let updatedLine = taskLine;

			// Update the task content (description)
			if (originalTask.content !== updatedTask.content) {
				// Replace the content part after the checkbox
				// This regex looks for the checkbox pattern and preserves it
				updatedLine = updatedLine.replace(
					/(\s*[-*+]\s*\[[^\]]*\]\s*).*$/,
					`$1${updatedTask.content}`
				);
			}

			// Update completion status if changed
			if (originalTask.completed !== updatedTask.completed) {
				const statusMark = updatedTask.completed ? "x" : " ";
				updatedLine = updatedLine.replace(
					/(\s*[-*+]\s*\[)[^\]]*(\]\s*)/,
					`$1${statusMark}$2`
				);
			}

			// Format date to string in YYYY-MM-DD format
			const formatDate = (
				date: number | undefined
			): string | undefined => {
				if (!date) return undefined;
				const d = new Date(date);
				return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
					2,
					"0"
				)}-${String(d.getDate()).padStart(2, "0")}`;
			};

			// Remove existing metadata symbols
			// Due dates
			updatedLine = updatedLine.replace(/📅\s*\d{4}-\d{2}-\d{2}/g, "");
			// Start dates
			updatedLine = updatedLine.replace(/🛫\s*\d{4}-\d{2}-\d{2}/g, "");
			// Scheduled dates
			updatedLine = updatedLine.replace(/⏳\s*\d{4}-\d{2}-\d{2}/g, "");
			// Completion dates
			updatedLine = updatedLine.replace(/✅\s*\d{4}-\d{2}-\d{2}/g, "");
			// Priority markers
			updatedLine = updatedLine.replace(
				/\s+(🔼|🔽|⏫|⏬|🔺|\[#[A-C]\])/g,
				""
			);
			// Recurrence
			updatedLine = updatedLine.replace(/🔁\s*[a-zA-Z0-9, !]+/g, "");

			// Add updated metadata at the end of the line
			const metadata = [];

			// Add priority if set
			if (updatedTask.priority) {
				let priorityMarker = "";
				switch (updatedTask.priority) {
					case 5:
						priorityMarker = "🔺";
						break; // Highest
					case 4:
						priorityMarker = "⏫";
						break; // High
					case 3:
						priorityMarker = "🔼";
						break; // Medium
					case 2:
						priorityMarker = "🔽";
						break; // Low
					case 1:
						priorityMarker = "⏬";
						break; // Lowest
					default:
						priorityMarker = "";
				}
				if (priorityMarker) {
					metadata.push(priorityMarker);
				}
			}

			// Add dates if set
			if (updatedTask.dueDate) {
				metadata.push(`📅 ${formatDate(updatedTask.dueDate)}`);
			}

			if (updatedTask.startDate) {
				metadata.push(`🛫 ${formatDate(updatedTask.startDate)}`);
			}

			if (updatedTask.scheduledDate) {
				metadata.push(`⏳ ${formatDate(updatedTask.scheduledDate)}`);
			}

			if (updatedTask.completedDate && updatedTask.completed) {
				metadata.push(`✅ ${formatDate(updatedTask.completedDate)}`);
			}

			// Add recurrence if set
			if (updatedTask.recurrence) {
				metadata.push(`🔁 ${updatedTask.recurrence}`);
			}

			// Update project tag
			// First, remove any existing project tag
			updatedLine = updatedLine.replace(/#project\/[^\s]+/g, "");
			// Add new project tag if set
			if (updatedTask.project) {
				metadata.push(`#project/${updatedTask.project}`);
			}

			// Update context
			// First, remove any existing context
			updatedLine = updatedLine.replace(/@[^\s]+/g, "");
			// Add new context if set
			if (updatedTask.context) {
				metadata.push(`@${updatedTask.context}`);
			}

			// Add all tags that aren't project tags
			if (updatedTask.tags) {
				const nonProjectTags = updatedTask.tags.filter(
					(tag) => !tag.startsWith("#project/")
				);

				// Remove existing non-project tags
				for (const tag of originalTask.tags || []) {
					if (!tag.startsWith("#project/")) {
						updatedLine = updatedLine.replace(
							new RegExp(
								tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
									"\\b",
								"g"
							),
							""
						);
					}
				}

				// Add new non-project tags
				metadata.push(...nonProjectTags);
			}

			// Append all metadata to the line
			if (metadata.length > 0) {
				// Clean up any duplicate spaces but preserve the task structure
				updatedLine = updatedLine.trim();
				updatedLine = `${updatedLine} ${metadata.join(" ")}`;
			}

			// Ensure indentation is preserved by adding it back
			if (indentation && !updatedLine.startsWith(indentation)) {
				updatedLine = `${indentation}${updatedLine.trimStart()}`;
			}

			// Update the line in the file
			if (updatedLine !== taskLine) {
				lines[updatedTask.line] = updatedLine;
				await this.vault.modify(file, lines.join("\n"));
			}

			const currentTasks = this.getTasksForFile(
				updatedTask.filePath
			).filter((task) => task.id !== updatedTask.id);

			// Update the task in the indexer
			// We'll temporarily update the task in memory and then reindex the file
			// to ensure all indices are properly updated
			this.indexer.updateIndexWithTasks(updatedTask.filePath, [
				...currentTasks,
				updatedTask,
			]);

			// Store in cache
			await this.persister.storeFile(updatedTask.filePath, [
				...currentTasks,
				updatedTask,
			]);

			// Trigger the task update event
			this.app.workspace.trigger(
				"task-genius:task-cache-updated",
				this.indexer.getCache()
			);

			this.log(
				`Updated task ${updatedTask.id} in file ${updatedTask.filePath}`
			);
		} catch (error) {
			console.error("Error updating task:", error);
			throw error;
		}
	}

	/**
	 * Force reindex all tasks by clearing all current indices and rebuilding from scratch
	 */
	public async forceReindex(): Promise<void> {
		this.log("Force reindexing all tasks");

		// Reset initialization state
		this.initialized = false;

		// Clear all caches
		this.indexer.resetCache();

		// Clear the persister cache
		try {
			await this.persister.clear();
			this.log("Cleared all cached task data");
		} catch (error) {
			console.error("Error clearing cache:", error);
		}

		// Re-initialize everything
		await this.initialize();

		// Trigger an update event
		this.app.workspace.trigger(
			"task-genius:task-cache-updated",
			this.indexer.getCache()
		);

		this.log("Force reindex complete");
	}

	/**
	 * Log a message if debugging is enabled
	 */
	private log(message: string): void {
		if (this.options.debug) {
			console.log(`[TaskManager] ${message}`);
		}
	}

	/**
	 * Clean up resources when the component is unloaded
	 */
	public onunload(): void {
		// Clean up worker manager if it exists
		if (this.workerManager) {
			this.workerManager.onunload();
		}

		super.onunload();
	}
}
