/**
 * Manager for task indexing web workers
 */

import {
	CachedMetadata,
	Component,
	ListItemCache,
	MetadataCache,
	TFile,
	Vault,
} from "obsidian";
import { Task } from "../../types/task";
import {
	ErrorResult,
	IndexerResult,
	ParseTasksCommand,
	TaskParseResult,
} from "./TaskIndexWorkerMessage";
import { FileMetadataTaskParser } from "./FileMetadataTaskParser";
import { FileParsingConfiguration } from "../../common/setting-definition";

// Import worker and utilities
// @ts-ignore Ignore type error for worker import
import TaskWorker from "./TaskIndex.worker";
import { Deferred, deferred } from "./deferred";

// Using similar queue structure as importer.ts
import { Queue } from "@datastructures-js/queue";

/**
 * Options for worker pool
 */
export interface WorkerPoolOptions {
	/** Maximum number of workers to use */
	maxWorkers: number;
	/** Target CPU utilization (0.1 to 1.0) */
	cpuUtilization: number;
	/** Whether to enable debug logging */
	debug?: boolean;
	/** Settings for the task indexer */
	settings?: {
		preferMetadataFormat: "dataview" | "tasks";
		useDailyNotePathAsDate: boolean;
		dailyNoteFormat: string;
		useAsDateType: "due" | "start" | "scheduled";
		dailyNotePath: string;
		ignoreHeading: string;
		focusHeading: string;
		fileParsingConfig?: FileParsingConfiguration;
	};
}

/**
 * Default worker pool options
 */
export const DEFAULT_WORKER_OPTIONS: WorkerPoolOptions = {
	maxWorkers: 1, // Reduced from 2 to 1 to minimize total worker count
	cpuUtilization: 0.75,
	debug: false,
	settings: {
		preferMetadataFormat: "tasks",
		useDailyNotePathAsDate: false,
		dailyNoteFormat: "yyyy-MM-dd",
		useAsDateType: "due",
		dailyNotePath: "",
		ignoreHeading: "",
		focusHeading: "",
	},
};

/**
 * Task priority levels
 */
enum TaskPriority {
	HIGH = 0, // 高优先级 - 用于初始化和用户交互任务
	NORMAL = 1, // 普通优先级 - 用于标准的文件索引更新
	LOW = 2, // 低优先级 - 用于批量后台任务
}

/**
 * A worker in the pool of executing workers
 */
interface PoolWorker {
	/** The id of this worker */
	id: number;
	/** The raw underlying worker */
	worker: Worker;
	/** UNIX time indicating the next time this worker is available for execution */
	availableAt: number;
	/** The active task this worker is processing, if any */
	active?: [TFile, Deferred<any>, number, TaskPriority];
}

/**
 * Task metadata from Obsidian cache
 */
interface TaskMetadata {
	/** List item cache information */
	listItems?: ListItemCache[];
	/** Raw file content */
	content: string;
	/** File stats */
	stats: {
		ctime: number;
		mtime: number;
		size: number;
	};
}

/**
 * Queue item with priority
 */
interface QueueItem {
	file: TFile;
	promise: Deferred<any>;
	priority: TaskPriority;
}

/**
 * Worker pool for task processing
 */
export class TaskWorkerManager extends Component {
	/** Worker pool */
	private workers: Map<number, PoolWorker> = new Map();
	/** Prioritized task queues */
	private queues: Queue<QueueItem>[] = [
		new Queue<QueueItem>(), // 高优先级队列
		new Queue<QueueItem>(), // 普通优先级队列
		new Queue<QueueItem>(), // 低优先级队列
	];
	/** Map of outstanding tasks by file path */
	private outstanding: Map<string, Promise<any>> = new Map();
	/** Whether the pool is currently active */
	private active: boolean = true;
	/** Worker pool options */
	private options: WorkerPoolOptions;
	/** Vault instance */
	private vault: Vault;
	/** Metadata cache for accessing file metadata */
	private metadataCache: MetadataCache;
	/** Next worker ID to assign */
	private nextWorkerId: number = 0;
	/** Tracking progress for large operations */
	private processedFiles: number = 0;
	private totalFilesToProcess: number = 0;
	/** Whether we're currently processing a large batch */
	private isProcessingBatch: boolean = false;
	/** Maximum number of retry attempts for a task */
	private maxRetries: number = 2;
	/** File metadata task parser */
	private fileMetadataParser?: FileMetadataTaskParser;
	/** Whether workers have been initialized to prevent multiple initialization */
	private initialized: boolean = false;

	/**
	 * Create a new worker pool
	 */
	constructor(
		vault: Vault,
		metadataCache: MetadataCache,
		options: Partial<WorkerPoolOptions> = {}
	) {
		super();
		this.options = { ...DEFAULT_WORKER_OPTIONS, ...options };
		this.vault = vault;
		this.metadataCache = metadataCache;

		// Initialize workers up to max
		this.initializeWorkers();
	}

	/**
	 * Set file parsing configuration
	 */
	public setFileParsingConfig(config: FileParsingConfiguration): void {
		if (
			config.enableFileMetadataParsing ||
			config.enableTagBasedTaskParsing
		) {
			this.fileMetadataParser = new FileMetadataTaskParser(config);
		} else {
			this.fileMetadataParser = undefined;
		}

		// Update worker options to include file parsing config
		if (this.options.settings) {
			this.options.settings.fileParsingConfig = config;
		} else {
			this.options.settings = {
				preferMetadataFormat: "tasks",
				useDailyNotePathAsDate: false,
				dailyNoteFormat: "yyyy-MM-dd",
				useAsDateType: "due",
				dailyNotePath: "",
				ignoreHeading: "",
				focusHeading: "",
				fileParsingConfig: config,
			};
		}
	}

	/**
	 * Initialize workers in the pool
	 */
	private initializeWorkers(): void {
		// Prevent multiple initialization
		if (this.initialized) {
			this.log("Workers already initialized, skipping initialization");
			return;
		}

		// Ensure any existing workers are cleaned up first
		if (this.workers.size > 0) {
			this.log("Cleaning up existing workers before re-initialization");
			this.cleanupWorkers();
		}

		const workerCount = Math.min(
			this.options.maxWorkers,
			navigator.hardwareConcurrency || 2
		);

		for (let i = 0; i < workerCount; i++) {
			try {
				const worker = this.newWorker();
				this.workers.set(worker.id, worker);
				this.log(`Initialized worker #${worker.id}`);
			} catch (error) {
				console.error("Failed to initialize worker:", error);
			}
		}

		this.initialized = true;
		this.log(
			`Initialized ${this.workers.size} workers (requested ${workerCount})`
		);

		// Check if we have any workers
		if (this.workers.size === 0) {
			console.warn(
				"No workers could be initialized, falling back to main thread processing"
			);
		}
	}

	/**
	 * Create a new worker
	 */
	private newWorker(): PoolWorker {
		const worker: PoolWorker = {
			id: this.nextWorkerId++,
			worker: new TaskWorker(),
			availableAt: Date.now(),
		};

		worker.worker.onmessage = (evt: MessageEvent) => {
			this.finish(worker, evt.data).catch((error) => {
				console.error("Error in finish handler:", error);
				// Handle the error by rejecting the active promise if it exists
				if (worker.active) {
					const [file, promise] = worker.active;
					promise.reject(error);
					worker.active = undefined;
					this.outstanding.delete(file.path);
					this.schedule();
				}
			});
		};
		worker.worker.onerror = (event: ErrorEvent) => {
			console.error("Worker error:", event);

			// If there's an active task, retry or reject it
			if (worker.active) {
				const [file, promise, retries, priority] = worker.active;

				if (retries < this.maxRetries) {
					// Retry the task
					this.log(
						`Retrying task for ${file.path} (attempt ${
							retries + 1
						})`
					);
					this.queueTaskWithPriority(
						file,
						promise,
						priority,
						retries + 1
					);
				} else {
					// Max retries reached, reject the promise
					promise.reject("Worker error after max retries");
				}

				worker.active = undefined;
				this.schedule();
			}
		};

		return worker;
	}

	/**
	 * Process a single file for tasks
	 */
	public processFile(
		file: TFile,
		priority: TaskPriority = TaskPriority.NORMAL
	): Promise<Task[]> {
		// De-bounce repeated requests for the same file
		let existing = this.outstanding.get(file.path);
		if (existing) return existing;

		let promise = deferred<Task[]>();
		this.outstanding.set(file.path, promise);

		this.queueTaskWithPriority(file, promise, priority);
		return promise;
	}

	/**
	 * Queue a task with specified priority
	 */
	private queueTaskWithPriority(
		file: TFile,
		promise: Deferred<Task[]>,
		priority: TaskPriority,
		retries: number = 0
	): void {
		this.queues[priority].enqueue({
			file,
			promise,
			priority,
		});

		// If this is the first retry, schedule immediately
		if (retries === 0) {
			this.schedule();
		}
	}

	/**
	 * Process multiple files in a batch
	 */
	public async processBatch(
		files: TFile[],
		priority: TaskPriority = TaskPriority.HIGH
	): Promise<Map<string, Task[]>> {
		if (files.length === 0) {
			return new Map<string, Task[]>();
		}

		this.isProcessingBatch = true;
		this.processedFiles = 0;
		this.totalFilesToProcess = files.length;

		this.log(`Processing batch of ${files.length} files`);

		// 创建一个结果映射
		const resultMap = new Map<string, Task[]>();

		try {
			// 将文件分成更小的批次，避免一次性提交太多任务
			const batchSize = 10;
			// 限制并发处理的文件数
			const concurrencyLimit = Math.min(this.options.maxWorkers * 2, 5);

			// 使用一个简单的信号量来控制并发
			let activePromises = 0;
			const processingQueue: Array<() => Promise<void>> = [];

			// 辅助函数，处理队列中的下一个任务
			const processNext = async () => {
				if (processingQueue.length === 0) return;

				if (activePromises < concurrencyLimit) {
					activePromises++;
					const nextTask = processingQueue.shift();
					if (nextTask) {
						try {
							await nextTask();
						} catch (error) {
							console.error(
								"Error processing batch task:",
								error
							);
						} finally {
							activePromises--;
							// 继续处理队列
							await processNext();
						}
					}
				}
			};

			for (let i = 0; i < files.length; i += batchSize) {
				const subBatch = files.slice(i, i + batchSize);

				// 为子批次创建处理任务并添加到队列
				processingQueue.push(async () => {
					// 为每个文件创建Promise
					const subBatchPromises = subBatch.map(async (file) => {
						try {
							const tasks = await this.processFile(
								file,
								priority
							);
							resultMap.set(file.path, tasks);
							return { file, tasks };
						} catch (error) {
							console.error(
								`Error processing file ${file.path}:`,
								error
							);
							return { file, tasks: [] };
						}
					});

					// 等待所有子批次文件处理完成
					const results = await Promise.all(subBatchPromises);

					// 更新进度
					this.processedFiles += results.length;
					const progress = Math.round(
						(this.processedFiles / this.totalFilesToProcess) * 100
					);
					if (
						progress % 10 === 0 ||
						this.processedFiles === this.totalFilesToProcess
					) {
						this.log(
							`Batch progress: ${progress}% (${this.processedFiles}/${this.totalFilesToProcess})`
						);
					}
				});

				// 启动处理队列
				processNext();
			}

			// 等待所有队列中的任务完成
			while (activePromises > 0 || processingQueue.length > 0) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		} catch (error) {
			console.error("Error during batch processing:", error);
		} finally {
			this.isProcessingBatch = false;
			this.log(`Completed batch processing of ${files.length} files`);
		}

		return resultMap;
	}

	/**
	 * Safely serialize CachedMetadata for worker transfer
	 * Removes non-serializable objects like functions and circular references
	 */
	private serializeCachedMetadata(fileCache: CachedMetadata | null): any {
		if (!fileCache) return undefined;

		try {
			// Create a safe copy with only serializable properties
			const safeCopy: any = {};

			// Copy basic properties that are typically safe to serialize
			const safeProperties = [
				"frontmatter",
				"tags",
				"headings",
				"sections",
				"listItems",
				"links",
				"embeds",
				"blocks",
			];

			for (const prop of safeProperties) {
				if ((fileCache as any)[prop] !== undefined) {
					// Deep clone to avoid any potential circular references
					safeCopy[prop] = JSON.parse(
						JSON.stringify((fileCache as any)[prop])
					);
				}
			}

			return safeCopy;
		} catch (error) {
			console.warn(
				"Failed to serialize CachedMetadata, using fallback:",
				error
			);
			// Fallback: only include frontmatter which is most commonly needed
			return {
				frontmatter: fileCache.frontmatter
					? JSON.parse(JSON.stringify(fileCache.frontmatter))
					: undefined,
			};
		}
	}

	/**
	 * Get task metadata from the file and Obsidian cache
	 */
	private async getTaskMetadata(file: TFile): Promise<TaskMetadata> {
		// Get file content
		const content = await this.vault.cachedRead(file);

		// Get file metadata from Obsidian cache
		const fileCache = this.metadataCache.getFileCache(file);

		return {
			listItems: fileCache?.listItems,
			content,
			stats: {
				ctime: file.stat.ctime,
				mtime: file.stat.mtime,
				size: file.stat.size,
			},
		};
	}

	/**
	 * Execute next task from the queue
	 */
	private schedule(): void {
		if (!this.active) return;

		// 检查所有队列，按优先级从高到低获取任务
		let queueItem: QueueItem | undefined;

		for (let priority = 0; priority < this.queues.length; priority++) {
			if (!this.queues[priority].isEmpty()) {
				queueItem = this.queues[priority].dequeue();
				break;
			}
		}

		if (!queueItem) return; // 所有队列都为空

		const worker = this.availableWorker();
		if (!worker) {
			// 没有可用的工作线程，将任务重新入队
			this.queues[queueItem.priority].enqueue(queueItem);
			return;
		}

		const { file, promise, priority } = queueItem;
		worker.active = [file, promise, 0, priority]; // 0 表示重试次数

		try {
			this.getTaskMetadata(file)
				.then((metadata) => {
					const command: ParseTasksCommand = {
						type: "parseTasks",
						filePath: file.path,
						content: metadata.content,
						fileExtension: file.extension,
						stats: metadata.stats,
						metadata: {
							listItems: metadata.listItems || [],
							fileCache: this.serializeCachedMetadata(
								this.metadataCache.getFileCache(file)
							),
						},
						settings: this.options.settings || {
							preferMetadataFormat: "tasks",
							useDailyNotePathAsDate: false,
							dailyNoteFormat: "yyyy-MM-dd",
							useAsDateType: "due",
							dailyNotePath: "",
							ignoreHeading: "",
							focusHeading: "",
							fileParsingConfig: undefined,
						},
					};

					worker.worker.postMessage(command);
				})
				.catch((error) => {
					console.error(`Error reading file ${file.path}:`, error);
					promise.reject(error);
					worker.active = undefined;

					// 移除未完成的任务
					this.outstanding.delete(file.path);

					// 处理下一个任务
					this.schedule();
				});
		} catch (error) {
			console.error(`Error processing file ${file.path}:`, error);
			promise.reject(error);
			worker.active = undefined;

			// 移除未完成的任务
			this.outstanding.delete(file.path);

			// 处理下一个任务
			this.schedule();
		}
	}

	/**
	 * Handle worker completion and process result
	 */
	private async finish(
		worker: PoolWorker,
		data: IndexerResult
	): Promise<void> {
		if (!worker.active) {
			console.log("Received a stale worker message. Ignoring.", data);
			return;
		}

		const [file, promise, retries, priority] = worker.active;

		// Resolve or reject the promise based on result
		if (data.type === "error") {
			// 错误处理 - 如果没有超过重试次数，重试
			const errorResult = data as ErrorResult;

			if (retries < this.maxRetries) {
				this.log(
					`Retrying task for ${file.path} due to error: ${errorResult.error}`
				);
				this.queueTaskWithPriority(
					file,
					promise,
					priority,
					retries + 1
				);
			} else {
				promise.reject(new Error(errorResult.error));
				this.outstanding.delete(file.path);
			}
		} else if (data.type === "parseResult") {
			const parseResult = data as TaskParseResult;

			// Combine worker tasks with file metadata tasks
			let allTasks = [...parseResult.tasks];

			if (this.fileMetadataParser) {
				try {
					const fileCache = this.metadataCache.getFileCache(file);
					const fileContent = await this.vault.cachedRead(file);
					const fileMetadataResult =
						this.fileMetadataParser.parseFileForTasks(
							file.path,
							fileContent,
							fileCache || undefined
						);

					// Add file metadata tasks to the result
					allTasks.push(...fileMetadataResult.tasks);

					// Log any errors from file metadata parsing
					if (fileMetadataResult.errors.length > 0) {
						console.warn(
							`File metadata parsing errors for ${file.path}:`,
							fileMetadataResult.errors
						);
					}
				} catch (error) {
					console.error(
						`Error in file metadata parsing for ${file.path}:`,
						error
					);
				}
			}

			promise.resolve(allTasks);
			this.outstanding.delete(file.path);
		} else if (data.type === "batchResult") {
			// For batch results, we handle differently as we don't have tasks directly
			promise.reject(
				new Error("Batch results should be handled by processBatch")
			);
			this.outstanding.delete(file.path);
		} else {
			promise.reject(
				new Error(`Unexpected result type: ${(data as any).type}`)
			);
			this.outstanding.delete(file.path);
		}

		// Check if we should remove this worker (if we're over capacity)
		if (this.workers.size > this.options.maxWorkers) {
			this.workers.delete(worker.id);
			this.terminate(worker);
		} else {
			// Calculate delay based on CPU utilization target
			const now = Date.now();
			const processingTime = worker.active ? now - worker.availableAt : 0;
			const throttle = Math.max(0.1, this.options.cpuUtilization) - 1.0;
			const delay = Math.max(0, processingTime * throttle);

			worker.active = undefined;

			if (delay <= 0) {
				worker.availableAt = now;
				this.schedule();
			} else {
				worker.availableAt = now + delay;
				setTimeout(() => this.schedule(), delay);
			}
		}
	}

	/**
	 * Get an available worker
	 */
	private availableWorker(): PoolWorker | undefined {
		const now = Date.now();

		// Find a worker that's not busy and is available
		for (const worker of this.workers.values()) {
			if (!worker.active && worker.availableAt <= now) {
				return worker;
			}
		}

		// Create a new worker if we haven't reached capacity
		if (this.workers.size < this.options.maxWorkers) {
			const worker = this.newWorker();
			this.workers.set(worker.id, worker);
			return worker;
		}

		return undefined;
	}

	/**
	 * Terminate a worker
	 */
	private terminate(worker: PoolWorker): void {
		worker.worker.terminate();

		if (worker.active) {
			worker.active[1].reject("Terminated");
			worker.active = undefined;
		}

		this.log(`Terminated worker #${worker.id}`);
	}

	/**
	 * Clean up existing workers without affecting the active state
	 */
	private cleanupWorkers(): void {
		// Terminate all workers
		for (const worker of this.workers.values()) {
			this.terminate(worker);
		}
		this.workers.clear();

		// Clear all remaining queued tasks and reject their promises
		for (const queue of this.queues) {
			while (!queue.isEmpty()) {
				const queueItem = queue.dequeue();
				if (queueItem) {
					queueItem.promise.reject("Workers being reinitialized");
					this.outstanding.delete(queueItem.file.path);
				}
			}
		}

		this.log("Cleaned up existing workers");
	}

	/**
	 * Reset throttling for all workers
	 */
	public unthrottle(): void {
		const now = Date.now();
		for (const worker of this.workers.values()) {
			worker.availableAt = now;
		}
		this.schedule();
	}

	/**
	 * Shutdown the worker pool
	 */
	public onunload(): void {
		this.active = false;

		// Terminate all workers
		for (const worker of this.workers.values()) {
			this.terminate(worker);
			this.workers.delete(worker.id);
		}

		// Clear all remaining queued tasks and reject their promises
		for (const queue of this.queues) {
			while (!queue.isEmpty()) {
				const queueItem = queue.dequeue();
				if (queueItem) {
					queueItem.promise.reject("Terminated");
					this.outstanding.delete(queueItem.file.path);
				}
			}
		}

		// Reset initialization flag to allow re-initialization if needed
		this.initialized = false;

		this.log("Worker pool shut down");
	}

	/**
	 * Get the number of pending tasks
	 */
	public getPendingTaskCount(): number {
		return this.queues.reduce((total, queue) => total + queue.size(), 0);
	}

	/**
	 * Get the current batch processing progress
	 */
	public getBatchProgress(): {
		current: number;
		total: number;
		percentage: number;
	} {
		return {
			current: this.processedFiles,
			total: this.totalFilesToProcess,
			percentage:
				this.totalFilesToProcess > 0
					? Math.round(
							(this.processedFiles / this.totalFilesToProcess) *
								100
					  )
					: 0,
		};
	}

	/**
	 * Set enhanced project data for worker processing
	 */
	public setEnhancedProjectData(
		enhancedProjectData: import("./TaskIndexWorkerMessage").EnhancedProjectData
	): void {
		// Update the settings with enhanced project data
		if (this.options.settings) {
			(this.options.settings as any).enhancedProjectData =
				enhancedProjectData;
		}
	}

	/**
	 * Check if the worker pool is currently processing a batch
	 */
	public isProcessingBatchTask(): boolean {
		return this.isProcessingBatch;
	}

	/**
	 * Log a message if debugging is enabled
	 */
	private log(message: string): void {
		if (this.options.debug) {
			console.log(`[TaskWorkerManager] ${message}`);
		}
	}
}
