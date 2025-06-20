/**
 * TaskManager - Primary interface for task management
 *
 * This class serves as the main entry point for all task-related operations,
 * wrapping the TaskIndexer implementation and providing a simplified API.
 */

import { App, Component, MetadataCache, TFile, Vault } from "obsidian";
import { Task, TaskFilter, SortingCriteria, TaskCache } from "../types/task";
import { TaskIndexer } from "./import/TaskIndexer";
import { TaskWorkerManager } from "./workers/TaskWorkerManager";
import { LocalStorageCache } from "./persister";
import TaskProgressBarPlugin from "../index";
import { RRule, RRuleSet, rrulestr } from "rrule";
import { MarkdownTaskParser } from "./workers/ConfigurableTaskParser";
import { getConfig } from "../common/task-parser-config";
import { getEffectiveProject, isProjectReadonly } from "./taskUtil";
import { HolidayDetector } from "./ics/HolidayDetector";
import {
	TaskParsingService,
	TaskParsingServiceOptions,
} from "./TaskParsingService";
import {
	isSupportedFile,
	getFileType,
	SupportedFileType,
} from "./fileTypeUtils";
import { CanvasParser } from "./parsing/CanvasParser";
import { CanvasTaskUpdater } from "./parsing/CanvasTaskUpdater";
import { FileMetadataTaskUpdater } from "./workers/FileMetadataTaskUpdater";
import { RebuildProgressManager } from "./RebuildProgressManager";

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
	/** Configurable task parser for main thread fallback */
	private taskParser: MarkdownTaskParser;
	/** Enhanced task parsing service with project support */
	private taskParsingService?: TaskParsingService;
	/** File metadata task updater for handling metadata-based tasks */
	private fileMetadataUpdater?: FileMetadataTaskUpdater;
	/** Canvas parser for .canvas files */
	private canvasParser: CanvasParser;
	/** Canvas task updater for modifying tasks in .canvas files */
	private canvasTaskUpdater: CanvasTaskUpdater;

	/**
	 * Create a new task manager
	 */
	constructor(
		private app: App,
		private vault: Vault,
		private metadataCache: MetadataCache,
		private plugin: TaskProgressBarPlugin,
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
		this.persister = new LocalStorageCache(
			this.app.appId,
			this.plugin.manifest?.version
		);

		// Initialize configurable task parser for main thread fallback
		this.taskParser = new MarkdownTaskParser(
			getConfig(this.plugin.settings.preferMetadataFormat, this.plugin)
		);

		// Initialize canvas parser
		this.canvasParser = new CanvasParser(
			getConfig(this.plugin.settings.preferMetadataFormat, this.plugin)
		);

		// Initialize canvas task updater
		this.canvasTaskUpdater = new CanvasTaskUpdater(this.vault, this.plugin);

		// Initialize enhanced task parsing service if enhanced project is enabled
		this.initializeTaskParsingService();

		// Set up the indexer's parse callback to use our parser
		this.indexer.setParseFileCallback(async (file: TFile) => {
			const content = await this.vault.cachedRead(file);
			return this.parseFileWithAppropriateParser(file.path, content);
		});

		// Initialize file parsing configuration
		this.updateFileParsingConfiguration();

		// Preload tasks from persister to improve initialization speed
		this.preloadTasksFromCache();

		// Set up the worker manager if workers are enabled
		if (this.options.useWorkers) {
			try {
				this.workerManager = new TaskWorkerManager(
					this.vault,
					this.metadataCache,
					{
						maxWorkers: this.options.maxWorkers,
						debug: this.options.debug,
						settings: this.plugin.settings,
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
	 * Initialize enhanced task parsing service if enhanced project is enabled
	 */
	private initializeTaskParsingService(): void {
		console.log("initializeTaskParsingService", this.plugin.settings);
		if (this.plugin.settings.projectConfig?.enableEnhancedProject) {
			const serviceOptions: TaskParsingServiceOptions = {
				vault: this.vault,
				metadataCache: this.metadataCache,
				parserConfig: getConfig(
					this.plugin.settings.preferMetadataFormat,
					this.plugin
				),
				projectConfigOptions: {
					configFileName:
						this.plugin.settings.projectConfig.configFile.fileName,
					searchRecursively:
						this.plugin.settings.projectConfig.configFile
							.searchRecursively,
					metadataKey:
						this.plugin.settings.projectConfig.metadataConfig
							.metadataKey,
					pathMappings:
						this.plugin.settings.projectConfig.pathMappings,
					metadataMappings:
						this.plugin.settings.projectConfig.metadataMappings ||
						[],
					defaultProjectNaming: this.plugin.settings.projectConfig
						.defaultProjectNaming || {
						strategy: "filename",
						stripExtension: true,
						enabled: false,
					},
				},
			};

			this.taskParsingService = new TaskParsingService(serviceOptions);
			this.log(
				"Enhanced task parsing service initialized with project support"
			);
		} else {
			this.taskParsingService = undefined;
		}
	}

	/**
	 * Update parsing configuration when settings change
	 */
	public updateParsingConfiguration(): void {
		// Update the regular parser
		this.taskParser = new MarkdownTaskParser(
			getConfig(this.plugin.settings.preferMetadataFormat, this.plugin)
		);

		// Update the canvas parser
		this.canvasParser.updateParserConfig(
			getConfig(this.plugin.settings.preferMetadataFormat, this.plugin)
		);

		// Reinitialize TaskParsingService to pick up new project configuration settings
		this.initializeTaskParsingService();

		// Clear project configuration cache to force re-reading of project config files
		if (this.taskParsingService) {
			this.taskParsingService.clearProjectConfigCache();
		}

		// Update worker manager settings if available
		if (this.workerManager) {
			// Worker manager will pick up the new settings automatically on next use
			// since it references this.plugin.settings directly
		}

		// Update file parsing configuration
		this.updateFileParsingConfiguration();

		this.log("Parsing configuration updated");
	}

	/**
	 * Update file parsing configuration when settings change
	 */
	public updateFileParsingConfiguration(): void {
		if (this.workerManager) {
			this.workerManager.setFileParsingConfig(
				this.plugin.settings.fileParsingConfig
			);
		}

		// Initialize or update file metadata updater
		if (
			this.plugin.settings.fileParsingConfig.enableFileMetadataParsing ||
			this.plugin.settings.fileParsingConfig.enableTagBasedTaskParsing
		) {
			this.fileMetadataUpdater = new FileMetadataTaskUpdater(
				this.app,
				this.plugin.settings.fileParsingConfig
			);
		} else {
			this.fileMetadataUpdater = undefined;
		}

		this.log("File parsing configuration updated");
	}

	/**
	 * Parse a file using the appropriate parser based on file type
	 */
	private parseFileWithAppropriateParser(
		filePath: string,
		content: string
	): Task[] {
		try {
			const fileType = getFileType({
				path: filePath,
				extension: filePath.split(".").pop() || "",
			} as TFile);

			let tasks: Task[] = [];

			if (fileType === SupportedFileType.CANVAS) {
				// Use canvas parser for .canvas files
				tasks = this.canvasParser.parseCanvasFile(content, filePath);
			} else if (fileType === SupportedFileType.MARKDOWN) {
				// Use markdown parser for .md files
				tasks = this.taskParser.parseLegacy(content, filePath);
			} else {
				// Unsupported file type
				return [];
			}

			// Apply heading filters if specified in settings
			return this.applyHeadingFilters(tasks);
		} catch (error) {
			console.error(
				`Error parsing file ${filePath} with appropriate parser:`,
				error
			);
			// Return empty array as fallback
			return [];
		}
	}

	/**
	 * Parse a file using the configurable parser (legacy method for markdown)
	 */
	private parseFileWithConfigurableParser(
		filePath: string,
		content: string
	): Task[] {
		try {
			// Use configurable parser for enhanced parsing
			const tasks = this.taskParser.parseLegacy(content, filePath);

			// Apply heading filters if specified in settings
			return this.applyHeadingFilters(tasks);
		} catch (error) {
			console.error(
				`Error parsing file ${filePath} with configurable parser:`,
				error
			);
			// Return empty array as fallback
			return [];
		}
	}

	/**
	 * Parse a file using enhanced parsing service (async version)
	 */
	private async parseFileWithEnhancedParser(
		filePath: string,
		content: string
	): Promise<Task[]> {
		try {
			if (this.taskParsingService) {
				// Use enhanced parsing service with project support
				const tasks =
					await this.taskParsingService.parseTasksFromContentLegacy(
						content,
						filePath
					);
				this.log(
					`Parsed ${tasks.length} tasks using enhanced parsing service for ${filePath}`
				);
				return this.applyHeadingFilters(tasks);
			} else {
				// Fallback to appropriate parser
				return this.parseFileWithAppropriateParser(filePath, content);
			}
		} catch (error) {
			console.error(
				`Error parsing file ${filePath} with enhanced parser:`,
				error
			);
			// Fallback to appropriate parser
			return this.parseFileWithAppropriateParser(filePath, content);
		}
	}

	/**
	 * Apply heading filters to a list of tasks
	 */
	private applyHeadingFilters(tasks: Task[]): Task[] {
		return tasks.filter((task) => {
			// Filter by ignore heading
			if (this.plugin.settings.ignoreHeading && task.metadata.heading) {
				const headings = Array.isArray(task.metadata.heading)
					? task.metadata.heading
					: [task.metadata.heading];

				if (
					headings.some((h) =>
						h.includes(this.plugin.settings.ignoreHeading)
					)
				) {
					return false;
				}
			}

			// Filter by focus heading
			if (this.plugin.settings.focusHeading && task.metadata.heading) {
				const headings = Array.isArray(task.metadata.heading)
					? task.metadata.heading
					: [task.metadata.heading];

				if (
					!headings.some((h) =>
						h.includes(this.plugin.settings.focusHeading)
					)
				) {
					return false;
				}
			}

			return true;
		});
	}

	/**
	 * Register event handlers for file changes
	 */
	private registerEventHandlers(): void {
		// Watch for markdown file metadata changes (for frontmatter, links, etc.)
		this.registerEvent(
			this.metadataCache.on("changed", (file, content, cache) => {
				// Skip processing during initialization to avoid excessive file processing
				if (this.isInitializing) {
					return;
				}

				this.log("File metadata changed, updating index");
				// Only process markdown files through metadata cache
				// Canvas files will be handled by vault.on("modify") below
				if (
					file instanceof TFile &&
					file.extension === "md" &&
					isSupportedFile(file)
				) {
					this.indexFile(file);
				}
			})
		);

		// Watch for direct file modifications (important for Canvas files)
		this.registerEvent(
			this.vault.on("modify", (file) => {
				// Skip processing during initialization to avoid excessive file processing
				if (this.isInitializing) {
					return;
				}

				this.log(`File modified: ${file.path}`);
				// Process all supported files, but prioritize Canvas files
				// since they don't trigger metadata cache events
				if (file instanceof TFile && isSupportedFile(file)) {
					// For Canvas files, always process through vault modify event
					// For markdown files, we'll get duplicate events but that's okay
					// since indexFile is idempotent
					if (file.extension === "canvas") {
						this.log(
							`Canvas file modified: ${file.path}, re-indexing`
						);
						this.indexFile(file);
					}
				}
			})
		);

		// Watch for individual file deletions
		this.registerEvent(
			this.metadataCache.on("deleted", (file) => {
				// Skip processing during initialization
				if (this.isInitializing) {
					return;
				}

				if (file instanceof TFile && isSupportedFile(file)) {
					this.removeFileFromIndex(file);
				}
			})
		);

		// Watch for file renames
		this.registerEvent(
			this.vault.on("rename", (file, oldPath) => {
				// Skip processing during initialization
				if (this.isInitializing) {
					return;
				}

				if (file instanceof TFile && isSupportedFile(file)) {
					this.removeFileFromIndexByOldPath(oldPath);
					this.indexFile(file);
				}
			})
		);

		// Watch for new files
		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.vault.on("create", (file) => {
					// Skip processing during initialization
					if (this.isInitializing) {
						return;
					}

					if (file instanceof TFile && isSupportedFile(file)) {
						this.indexFile(file);
					}
				})
			);
		});
	}

	/**
	 * Preload tasks from persistent cache for faster startup
	 */
	private async preloadTasksFromCache(): Promise<void> {
		try {
			// Try to load the consolidated cache first (much faster)
			const consolidatedCache =
				await this.persister.loadConsolidatedCache<TaskCache>(
					"taskCache"
				);

			if (consolidatedCache) {
				// Check if the cache is compatible with current version
				if (this.persister.isVersionCompatible(consolidatedCache)) {
					// We have a valid consolidated cache - use it directly
					this.log(
						`Loading consolidated task cache from version ${consolidatedCache.version}`
					);

					// Replace the indexer's cache with the cached version
					this.indexer.setCache(consolidatedCache.data);

					// Trigger a task cache updated event
					this.app.workspace.trigger(
						"task-genius:task-cache-updated",
						this.indexer.getCache()
					);

					this.plugin.preloadedTasks = Array.from(
						this.indexer.getCache().tasks.values()
					);

					this.plugin.triggerViewUpdate();

					this.log(
						`Preloaded ${
							this.indexer.getCache().tasks.size
						} tasks from consolidated cache`
					);
					return;
				} else {
					// Cache is incompatible, clear it and force rebuild
					this.log(
						`Consolidated cache version ${
							consolidatedCache.version
						} is incompatible with current version ${this.persister.getVersion()}, clearing cache`
					);
					await this.persister.clearIncompatibleCache();
					// Continue to rebuild below
				}
			}

			// Fall back to loading individual file caches
			this.log(
				"No consolidated cache found, falling back to file-by-file loading"
			);
			const cachedTasks = await this.persister.getAll<Task[]>();
			if (cachedTasks && Object.keys(cachedTasks).length > 0) {
				let compatibleCacheCount = 0;
				let incompatibleCacheCount = 0;

				// Update the indexer with all cached tasks, checking version compatibility
				for (const [filePath, cacheItem] of Object.entries(
					cachedTasks
				)) {
					if (cacheItem && cacheItem.data) {
						// Check version compatibility
						if (this.persister.isVersionCompatible(cacheItem)) {
							this.indexer.updateIndexWithTasks(
								filePath,
								cacheItem.data
							);
							this.log(
								`Preloaded ${cacheItem.data.length} tasks from cache for ${filePath}`
							);
							compatibleCacheCount++;
						} else {
							// Remove incompatible cache entry
							await this.persister.removeFile(filePath);
							incompatibleCacheCount++;
							this.log(
								`Removed incompatible cache for ${filePath} (version ${cacheItem.version})`
							);
						}
					}
				}

				this.log(
					`Preloading complete: ${compatibleCacheCount} compatible files, ${incompatibleCacheCount} incompatible files removed`
				);

				// Store the consolidated cache for next time
				await this.storeConsolidatedCache();

				// Trigger a task cache updated event
				this.app.workspace.trigger(
					"task-genius:task-cache-updated",
					this.indexer.getCache()
				);
				this.log(
					`Preloaded ${
						this.indexer.getCache().tasks.size
					} tasks from file caches`
				);
			} else {
				this.log("No cached tasks found for preloading");
			}
		} catch (error) {
			console.error("Error preloading tasks from cache:", error);
		}
	}

	/**
	 * Store the current task cache as a consolidated cache
	 */
	private async storeConsolidatedCache(): Promise<void> {
		try {
			const cache = this.indexer.getCache();
			await this.persister.storeConsolidatedCache("taskCache", cache);
			this.log(
				`Stored consolidated cache with ${cache.tasks.size} tasks`
			);
		} catch (error) {
			console.error("Error storing consolidated task cache:", error);
		}
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
			// Get all supported files (Markdown and Canvas)
			const allFiles = this.vault.getFiles();
			const files = allFiles.filter((file) => isSupportedFile(file));
			this.log(
				`Found ${files.length} supported files to index (${allFiles.length} total files)`
			);

			// Try to synchronize task cache with current files and clean up non-existent file caches
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

			// Get list of files that have already been preloaded from cache
			const preloadedFiles = new Set<string>();
			for (const taskId of this.indexer.getCache().tasks.keys()) {
				const task = this.indexer.getCache().tasks.get(taskId);
				if (task) {
					preloadedFiles.add(task.filePath);
				}
			}

			this.log(`${preloadedFiles.size} files already loaded from cache`);

			// Filter out files that have already been loaded from cache
			const filesToProcess = files.filter(
				(file) => !preloadedFiles.has(file.path)
			);
			this.log(`${filesToProcess.length} files still need processing`);

			if (this.workerManager && filesToProcess.length > 0) {
				try {
					// Pre-compute enhanced project data if TaskParsingService is available AND enhanced project is enabled
					let enhancedProjectData:
						| import("./workers/TaskIndexWorkerMessage").EnhancedProjectData
						| undefined;

					if (
						this.taskParsingService &&
						this.taskParsingService.isEnhancedProjectEnabled()
					) {
						this.log(
							"Pre-computing enhanced project data for worker processing..."
						);
						const allFilePaths = filesToProcess.map(
							(file) => file.path
						);
						enhancedProjectData =
							await this.taskParsingService.computeEnhancedProjectData(
								allFilePaths
							);
						this.log(
							`Pre-computed project data for ${
								Object.keys(enhancedProjectData.fileProjectMap)
									.length
							} files with projects`
						);
						this.log(
							`Pre-computed project data: ${JSON.stringify(
								enhancedProjectData
							)}`
						);

						// Update worker manager settings with enhanced data
						if (this.workerManager) {
							this.workerManager.setEnhancedProjectData(
								enhancedProjectData
							);
						}
					}

					// Process files in batches to avoid excessive memory usage
					const batchSize = 200;
					let importedCount = 0;
					let cachedCount = 0;

					for (let i = 0; i < filesToProcess.length; i += batchSize) {
						const batch = filesToProcess.slice(i, i + batchSize);
						this.log(
							`Processing batch ${
								Math.floor(i / batchSize) + 1
							}/${Math.ceil(
								filesToProcess.length / batchSize
							)} (${batch.length} files)`
						);

						// Update progress
						if (this.progressManager) {
							this.progressManager.updateStep(
								"Processing files",
								batch[0]?.path
							);
						}

						// Process each file in the batch
						for (const file of batch) {
							// Try to load from cache
							try {
								const cached = await this.persister.loadFile<
									Task[]
								>(file.path);
								if (
									cached &&
									cached.time >= file.stat.mtime &&
									this.persister.isVersionCompatible(cached)
								) {
									// Update index with cached data
									this.indexer.updateIndexWithTasks(
										file.path,
										cached.data
									);
									this.log(
										`Loaded ${cached.data.length} tasks from cache for ${file.path}`
									);
									cachedCount++;

									// Report progress
									if (this.progressManager) {
										this.progressManager.incrementProcessedFiles(
											cached.data.length
										);
									}
								} else {
									// Cache doesn't exist, is outdated, or version incompatible - process with worker
									if (
										cached &&
										!this.persister.isVersionCompatible(
											cached
										)
									) {
										this.log(
											`Cache for ${file.path} is version incompatible (${cached.version}), rebuilding`
										);
										await this.persister.removeFile(
											file.path
										);
									}
									// Don't trigger events - we'll trigger once when initialization is complete
									const processedTasks =
										await this.processFileWithoutEvents(
											file,
											enhancedProjectData
										);
									importedCount++;

									// Report progress
									if (this.progressManager) {
										this.progressManager.incrementProcessedFiles(
											processedTasks.length
										);
									}
								}
							} catch (error) {
								console.error(
									`Error processing file ${file.path}:`,
									error
								);
								// Fall back to main thread processing
								await this.indexer.indexFile(file);
								importedCount++;

								// Report progress
								if (this.progressManager) {
									this.progressManager.incrementProcessedFiles(
										0
									);
								}
							}
						}

						// Yield time to the main thread between batches
						await new Promise((resolve) => setTimeout(resolve, 0));
					}

					this.log(
						`Completed worker-based indexing (${importedCount} imported, ${cachedCount} from cache, ${preloadedFiles.size} preloaded)`
					);
				} catch (error) {
					console.error(
						"Error using workers for initial indexing:",
						error
					);
					this.log("Falling back to single-threaded indexing");

					// If worker usage fails, reinitialize index and use single-threaded processing
					// We'll preserve any preloaded data
					await this.fallbackToMainThreadIndexing(filesToProcess);
				}
			} else if (filesToProcess.length > 0) {
				// No worker or no files to process, use single-threaded indexing
				await this.fallbackToMainThreadIndexing(filesToProcess);
			}

			this.initialized = true;
			const totalTasks = this.indexer.getCache().tasks.size;
			this.log(`Task manager initialized with ${totalTasks} tasks`);

			// Clear progress manager reference after initialization
			this.progressManager = undefined;

			// Store the consolidated cache after we've finished processing everything
			await this.storeConsolidatedCache();

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
	private async processFileWithoutEvents(
		file: TFile,
		enhancedProjectData?: import("./workers/TaskIndexWorkerMessage").EnhancedProjectData
	): Promise<Task[]> {
		if (!this.workerManager) {
			// If worker manager is not available, use main thread processing
			await this.indexer.indexFile(file);
			// Cache the results
			const tasks = this.getTasksForFile(file.path);
			if (tasks.length > 0) {
				await this.persister.storeFile(file.path, tasks);
			}
			return tasks;
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
			return tasks;
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
			return tasks;
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

			console.log("tasks", tasks, file.path);
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
				// Update the consolidated cache
				await this.storeConsolidatedCache();

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
				// Update the consolidated cache
				await this.storeConsolidatedCache();

				// Trigger task cache updated event
				this.app.workspace.trigger(
					"task-genius:task-cache-updated",
					this.indexer.getCache()
				);
			}
		}
	}

	/**
	 * When worker processing fails, fall back to main thread processing
	 */
	private async fallbackToMainThreadIndexing(files: TFile[]): Promise<void> {
		this.log(`Indexing ${files.length} files using main thread...`);

		// Use smaller batch size to avoid UI freezing
		const batchSize = 10;
		let importedCount = 0;
		let cachedCount = 0;

		for (let i = 0; i < files.length; i += batchSize) {
			const batch = files.slice(i, i + batchSize);

			// Update progress
			if (this.progressManager) {
				this.progressManager.updateStep(
					"Processing files (main thread)",
					batch[0]?.path
				);
			}

			// Process each file in the batch
			for (const file of batch) {
				// Try to load from cache
				try {
					const cached = await this.persister.loadFile<Task[]>(
						file.path
					);
					if (
						cached &&
						cached.time >= file.stat.mtime &&
						this.persister.isVersionCompatible(cached)
					) {
						// Update index with cached data
						this.indexer.updateIndexWithTasks(
							file.path,
							cached.data
						);
						this.log(
							`Loaded ${cached.data.length} tasks from cache for ${file.path}`
						);
						cachedCount++;

						// Report progress
						if (this.progressManager) {
							this.progressManager.incrementProcessedFiles(
								cached.data.length
							);
						}
					} else {
						// Remove incompatible cache if it exists
						if (
							cached &&
							!this.persister.isVersionCompatible(cached)
						) {
							this.log(
								`Cache for ${file.path} is version incompatible (${cached.version}), rebuilding`
							);
							await this.persister.removeFile(file.path);
						}
						// Cache doesn't exist or is outdated, use main thread processing with appropriate parser
						const content = await this.vault.cachedRead(file);
						const tasks = this.parseFileWithAppropriateParser(
							file.path,
							content
						);

						// Update index with parsed tasks
						this.indexer.updateIndexWithTasks(file.path, tasks);

						// Store to cache
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

						// Report progress
						if (this.progressManager) {
							this.progressManager.incrementProcessedFiles(
								tasks.length
							);
						}
					}
				} catch (error) {
					console.error(`Error processing file ${file.path}:`, error);
					// Fall back to main thread processing with appropriate parser
					try {
						const content = await this.vault.cachedRead(file);
						const tasks = this.parseFileWithAppropriateParser(
							file.path,
							content
						);
						this.indexer.updateIndexWithTasks(file.path, tasks);

						if (tasks.length > 0) {
							await this.persister.storeFile(file.path, tasks);
						}

						// Report progress
						if (this.progressManager) {
							this.progressManager.incrementProcessedFiles(
								tasks.length
							);
						}
					} catch (fallbackError) {
						console.error(
							`Fallback parsing also failed for ${file.path}:`,
							fallbackError
						);
						// Report progress even on failure
						if (this.progressManager) {
							this.progressManager.incrementProcessedFiles(0);
						}
					}
					importedCount++;
				}
			}

			// Update progress log
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

			// Yield time to the main thread
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		const preloadedFiles =
			this.indexer.getCache().tasks.size - (importedCount + cachedCount);

		this.log(
			`Completed main-thread indexing (${importedCount} imported, ${cachedCount} from cache, approximately ${preloadedFiles} tasks from preload)`
		);

		// After all files are processed, only trigger the event at the end of batch processing
		// This helps prevent recursive event triggering during initialization
		if (!this.isInitializing) {
			// Update the consolidated cache
			await this.storeConsolidatedCache();

			// Trigger task cache updated event
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
			// Use main thread indexing with appropriate parser
			const content = await this.vault.cachedRead(file);
			const tasks = this.parseFileWithAppropriateParser(
				file.path,
				content
			);

			// Update index with parsed tasks
			this.indexer.updateIndexWithTasks(file.path, tasks);

			// Cache the results
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

	// 添加初始化节流标志
	private initializationPending: boolean = false;

	/** Optional progress manager for rebuild operations */
	private progressManager?: RebuildProgressManager;

	/**
	 * Set the progress manager for rebuild operations
	 */
	public setProgressManager(progressManager: RebuildProgressManager): void {
		this.progressManager = progressManager;
	}

	/**
	 * Query tasks based on filters and sorting criteria
	 */
	public queryTasks(
		filters: TaskFilter[] = [],
		sortBy: SortingCriteria[] = []
	): Task[] {
		if (!this.initialized) {
			// 使用节流机制避免多次初始化和重复警告
			if (!this.initializationPending && !this.isInitializing) {
				console.warn("Task manager not initialized, initializing now");
				this.initializationPending = true;
				// Instead of calling initialize() directly which causes recursion,
				// schedule it for the next event loop and return empty results for now
				setTimeout(() => {
					if (!this.initialized && !this.isInitializing) {
						this.initialize()
							.catch((error) => {
								console.error(
									"Error during delayed initialization:",
									error
								);
							})
							.finally(() => {
								this.initializationPending = false;
							});
					} else {
						this.initializationPending = false;
					}
				}, 0);
			}
			return [];
		}

		return this.indexer.queryTasks(filters, sortBy);
	}

	/**
	 * Get all tasks in the vault
	 */
	public getAllTasks(): Task[] {
		const markdownTasks = this.queryTasks();

		// Get ICS tasks if ICS manager is available
		try {
			const icsManager = this.plugin.getIcsManager();
			if (icsManager) {
				// Use holiday detection for better task filtering
				const icsEventsWithHoliday =
					icsManager.getAllEventsWithHolidayDetection();
				const icsTasks =
					icsManager.convertEventsWithHolidayToTasks(
						icsEventsWithHoliday
					);

				// Merge ICS tasks with markdown tasks
				return [...markdownTasks, ...icsTasks];
			}
		} catch (error) {
			console.error("Error getting all tasks:", error);
			// Fallback to original method
			try {
				const icsManager = this.plugin.getIcsManager();
				if (icsManager) {
					const icsEvents = icsManager.getAllEvents();
					const icsTasks = icsManager.convertEventsToTasks(icsEvents);
					return [...markdownTasks, ...icsTasks];
				}
			} catch (fallbackError) {
				console.error(
					"Error in fallback task retrieval:",
					fallbackError
				);
			}
		}

		return markdownTasks;
	}

	/**
	 * Get all tasks with ICS sync - use this for initial load
	 */
	public async getAllTasksWithSync(): Promise<Task[]> {
		const markdownTasks = this.queryTasks();

		// Get ICS tasks if ICS manager is available
		const icsManager = this.plugin.getIcsManager();
		if (icsManager) {
			try {
				const icsEvents = await icsManager.getAllEventsWithSync();
				// Apply holiday detection to synced events
				const icsEventsWithHoliday = icsEvents.map((event) => {
					const source = icsManager
						.getConfig()
						.sources.find((s: any) => s.id === event.source.id);
					if (source?.holidayConfig?.enabled) {
						return {
							...event,
							isHoliday: HolidayDetector.isHoliday(
								event,
								source.holidayConfig
							),
							showInForecast: true,
						};
					}
					return {
						...event,
						isHoliday: false,
						showInForecast: true,
					};
				});

				const icsTasks =
					icsManager.convertEventsWithHolidayToTasks(
						icsEventsWithHoliday
					);

				// Merge ICS tasks with markdown tasks
				return [...markdownTasks, ...icsTasks];
			} catch (error) {
				console.error(
					"Error getting tasks with holiday detection:",
					error
				);
				// Fallback to original method
				const icsEvents = await icsManager.getAllEventsWithSync();
				const icsTasks = icsManager.convertEventsToTasks(icsEvents);
				return [...markdownTasks, ...icsTasks];
			}
		}

		return markdownTasks;
	}

	/**
	 * get available context or projects from current all tasks
	 */
	public getAvailableContextOrProjects(): {
		contexts: string[];
		projects: string[];
	} {
		const allTasks = this.getAllTasks();

		const contextSet = new Set<string>();
		const projectSet = new Set<string>();

		for (const task of allTasks) {
			if (task.metadata.context) contextSet.add(task.metadata.context);
			const effectiveProject = getEffectiveProject(task);
			if (effectiveProject) projectSet.add(effectiveProject);
		}

		return {
			contexts: Array.from(contextSet),
			projects: Array.from(projectSet),
		};
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

		console.log(
			"originalTask",
			originalTask,
			updatedTask.metadata.dueDate,
			originalTask.metadata.dueDate
		);

		// Check if this is a Canvas task and handle it with Canvas updater
		if (CanvasTaskUpdater.isCanvasTask(originalTask)) {
			console.log("originalTask is a Canvas task");
			try {
				const result = await this.canvasTaskUpdater.updateCanvasTask(
					originalTask,
					updatedTask
				);
				console.log("result", result);

				if (result.success) {
					this.log(
						`Updated Canvas task ${updatedTask.id} in Canvas file`
					);

					// Re-index the file to pick up the changes - if this fails, don't fail the entire operation
					const file = this.vault.getFileByPath(updatedTask.filePath);
					if (file instanceof TFile) {
						try {
							await this.indexFile(file);
							this.log(
								`Successfully re-indexed Canvas file ${updatedTask.filePath} after task update`
							);
						} catch (indexError) {
							console.error(
								`Failed to re-index Canvas file ${updatedTask.filePath} after task update:`,
								indexError
							);
							// Don't throw the error - the Canvas update was successful
							// The index will be updated on the next file change event
						}
					}
					return;
				} else {
					throw new Error(
						result.error || "Failed to update Canvas task"
					);
				}
			} catch (error) {
				console.error(
					`Error updating Canvas task ${updatedTask.id}:`,
					error
				);
				throw error;
			}
		}

		// Check if this is a file metadata task and handle it specially
		if (
			this.fileMetadataUpdater &&
			this.fileMetadataUpdater.isFileMetadataTask(originalTask)
		) {
			try {
				const result =
					await this.fileMetadataUpdater.updateFileMetadataTask(
						originalTask,
						updatedTask
					);
				if (result.success) {
					this.log(`Updated file metadata task ${updatedTask.id}`);

					// Re-index the file to pick up the changes - if this fails, don't fail the entire operation
					const file = this.vault.getFileByPath(updatedTask.filePath);
					if (file instanceof TFile) {
						try {
							await this.indexFile(file);
							this.log(
								`Successfully re-indexed file ${updatedTask.filePath} after metadata task update`
							);
						} catch (indexError) {
							console.error(
								`Failed to re-index file ${updatedTask.filePath} after metadata task update:`,
								indexError
							);
							// Don't throw the error - the metadata update was successful
							// The index will be updated on the next file change event
						}
					}
					return;
				} else {
					throw new Error(
						result.error || "Failed to update file metadata task"
					);
				}
			} catch (error) {
				console.error(
					`Error updating file metadata task ${updatedTask.id}:`,
					error
				);
				throw error;
			}
		}

		// Check if this is a completion of a recurring task
		const isCompletingRecurringTask =
			!originalTask.completed &&
			updatedTask.completed &&
			updatedTask.metadata.recurrence;

		// Determine the metadata format from plugin settings
		const useDataviewFormat =
			this.plugin.settings.preferMetadataFormat === "dataview";

		try {
			const file = this.vault.getFileByPath(updatedTask.filePath);
			if (!(file instanceof TFile) || !file) {
				throw new Error(`File not found: ${updatedTask.filePath}`);
			}

			const content = await this.vault.read(file);
			const lines = content.split("\n");
			const taskLine = lines[updatedTask.line];
			console.log("taskLine", taskLine);
			if (!taskLine) {
				throw new Error(
					`Task line ${updatedTask.line} not found in file ${updatedTask.filePath}`
				);
			}

			const indentMatch = taskLine.match(/^(\s*)/);
			const indentation = indentMatch ? indentMatch[0] : "";
			let updatedLine = taskLine;

			// Update status if it exists in the updated task
			if (updatedTask.status) {
				updatedLine = updatedLine.replace(
					/(\s*[-*+]\s*\[)[^\]]*(\]\s*)/,
					`$1${updatedTask.status}$2`
				);
			}
			// Otherwise, update completion status if it changed
			else if (originalTask.completed !== updatedTask.completed) {
				const statusMark = updatedTask.completed ? "x" : " ";
				updatedLine = updatedLine.replace(
					/(\s*[-*+]\s*\[)[^\]]*(\]\s*)/,
					`$1${statusMark}$2`
				);
			}

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

			// --- Update content first, then clean up metadata ---
			// Extract the checkbox part and use the new content
			const checkboxMatch = updatedLine.match(
				/^(\s*[-*+]\s*\[[^\]]*\]\s*)/
			);
			const checkboxPart = checkboxMatch ? checkboxMatch[1] : "";

			// Start with the checkbox part + new content
			updatedLine = checkboxPart + updatedTask.content;

			// --- Remove existing metadata (both formats) ---
			// Emoji dates
			updatedLine = updatedLine.replace(/📅\s*\d{4}-\d{2}-\d{2}/g, "");
			updatedLine = updatedLine.replace(/🛫\s*\d{4}-\d{2}-\d{2}/g, "");
			updatedLine = updatedLine.replace(/⏳\s*\d{4}-\d{2}-\d{2}/g, "");
			updatedLine = updatedLine.replace(/✅\s*\d{4}-\d{2}-\d{2}/g, "");
			updatedLine = updatedLine.replace(/➕\s*\d{4}-\d{2}-\d{2}/g, ""); // Added created date emoji
			// Dataview dates (inline field format) - match key or emoji
			updatedLine = updatedLine.replace(
				/\[(?:due|🗓️)::\s*\d{4}-\d{2}-\d{2}\]/gi,
				""
			);
			updatedLine = updatedLine.replace(
				/\[(?:completion|✅)::\s*\d{4}-\d{2}-\d{2}\]/gi,
				""
			);
			updatedLine = updatedLine.replace(
				/\[(?:created|➕)::\s*\d{4}-\d{2}-\d{2}\]/gi,
				""
			);
			updatedLine = updatedLine.replace(
				/\[(?:start|🛫)::\s*\d{4}-\d{2}-\d{2}\]/gi,
				""
			);
			updatedLine = updatedLine.replace(
				/\[(?:scheduled|⏳)::\s*\d{4}-\d{2}-\d{2}\]/gi,
				""
			);

			// Emoji Priority markers
			updatedLine = updatedLine.replace(
				/\s+(🔼|🔽|⏫|⏬|🔺|\[#[A-C]\])/g,
				""
			);
			// Dataview Priority
			updatedLine = updatedLine.replace(/\[priority::\s*\w+\]/gi, ""); // Assuming priority value is a word like high, medium, etc. or number

			// Emoji Recurrence
			updatedLine = updatedLine.replace(/🔁\s*[^\s]+/g, "");
			// Dataview Recurrence
			updatedLine = updatedLine.replace(
				/\[(?:repeat|recurrence)::\s*[^\]]+\]/gi,
				""
			); // Allow 'repeat' or 'recurrence'

			// Dataview Project and Context (using configurable prefixes)
			const projectPrefix =
				this.plugin.settings.projectTagPrefix[
					this.plugin.settings.preferMetadataFormat
				] || "project";
			const contextPrefix =
				this.plugin.settings.contextTagPrefix[
					this.plugin.settings.preferMetadataFormat
				] || "@";
			updatedLine = updatedLine.replace(
				new RegExp(`\\[${projectPrefix}::\\s*[^\\]]+\\]`, "gi"),
				""
			);
			updatedLine = updatedLine.replace(
				new RegExp(`\\[${contextPrefix}::\\s*[^\\]]+\\]`, "gi"),
				""
			);

			// Remove ALL existing tags to prevent duplication
			// This includes general hashtags, project tags, and context tags
			updatedLine = updatedLine.replace(
				/#[^\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~\[\]\\\s]+/g,
				""
			); // Remove all hashtags
			updatedLine = updatedLine.replace(/@[^\s@]+/g, ""); // Remove all @ mentions/context tags

			// Clean up extra spaces
			updatedLine = updatedLine.replace(/\s+/g, " ").trim();

			// --- Add updated metadata ---
			const metadata = [];
			const formattedDueDate = formatDate(updatedTask.metadata.dueDate);
			const formattedStartDate = formatDate(
				updatedTask.metadata.startDate
			);
			const formattedScheduledDate = formatDate(
				updatedTask.metadata.scheduledDate
			);
			const formattedCompletedDate = formatDate(
				updatedTask.metadata.completedDate
			);

			// --- Add non-project/context tags first (1. Tags) ---
			if (
				updatedTask.metadata.tags &&
				updatedTask.metadata.tags.length > 0
			) {
				// Filter out project and context tags, and ensure uniqueness
				const projectPrefix =
					this.plugin.settings.projectTagPrefix[
						this.plugin.settings.preferMetadataFormat
					] || "project";
				const generalTags = updatedTask.metadata.tags.filter((tag) => {
					if (typeof tag !== "string") return false;
					// Skip project tags - they'll be handled separately
					if (tag.startsWith(`#${projectPrefix}/`)) return false;
					// Skip context tags if they match the current context
					if (
						tag.startsWith("@") &&
						updatedTask.metadata.context &&
						tag === `@${updatedTask.metadata.context}`
					)
						return false;
					return true;
				});

				// Ensure uniqueness and proper formatting
				const uniqueGeneralTags = [...new Set(generalTags)]
					.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
					.filter((tag) => tag.length > 1); // Filter out empty tags

				if (!useDataviewFormat && uniqueGeneralTags.length > 0) {
					metadata.push(...uniqueGeneralTags);
				} else if (useDataviewFormat && uniqueGeneralTags.length > 0) {
					// For dataview format, add tags as regular hashtags
					metadata.push(...uniqueGeneralTags);
				}
			}

			// 2. Project - Only write project if it's not a read-only tgProject
			// Check if the project should be written to the file
			const shouldWriteProject =
				updatedTask.metadata.project &&
				!isProjectReadonly(originalTask);

			if (shouldWriteProject) {
				if (useDataviewFormat) {
					const projectPrefix =
						this.plugin.settings.projectTagPrefix[
							this.plugin.settings.preferMetadataFormat
						] || "project";
					const projectField = `[${projectPrefix}:: ${updatedTask.metadata.project}]`;
					if (!metadata.includes(projectField)) {
						metadata.push(projectField);
					}
				} else {
					const projectPrefix =
						this.plugin.settings.projectTagPrefix[
							this.plugin.settings.preferMetadataFormat
						] || "project";
					const projectTag = `#${projectPrefix}/${updatedTask.metadata.project}`;
					if (!metadata.includes(projectTag)) {
						metadata.push(projectTag);
					}
				}
			}

			// 3. Context
			if (updatedTask.metadata.context) {
				if (useDataviewFormat) {
					const contextPrefix =
						this.plugin.settings.contextTagPrefix[
							this.plugin.settings.preferMetadataFormat
						] || "context";
					const contextField = `[${contextPrefix}:: ${updatedTask.metadata.context}]`;
					if (!metadata.includes(contextField)) {
						metadata.push(contextField);
					}
				} else {
					// For emoji format, always use @ prefix (not configurable)
					const contextTag = `@${updatedTask.metadata.context}`;
					if (!metadata.includes(contextTag)) {
						metadata.push(contextTag);
					}
				}
			}

			// 4. Priority
			if (updatedTask.metadata.priority) {
				if (useDataviewFormat) {
					let priorityValue: string | number;
					switch (updatedTask.metadata.priority) {
						case 5:
							priorityValue = "highest";
							break;
						case 4:
							priorityValue = "high";
							break;
						case 3:
							priorityValue = "medium";
							break;
						case 2:
							priorityValue = "low";
							break;
						case 1:
							priorityValue = "lowest";
							break;
						default:
							priorityValue = updatedTask.metadata.priority;
					}
					metadata.push(`[priority:: ${priorityValue}]`);
				} else {
					// Emoji format
					let priorityMarker = "";
					switch (updatedTask.metadata.priority) {
						case 5:
							priorityMarker = "🔺";
							break;
						case 4:
							priorityMarker = "⏫";
							break;
						case 3:
							priorityMarker = "🔼";
							break;
						case 2:
							priorityMarker = "🔽";
							break;
						case 1:
							priorityMarker = "⏬";
							break;
					}
					if (priorityMarker) metadata.push(priorityMarker);
				}
			}

			// 5. Recurrence
			if (updatedTask.metadata.recurrence) {
				metadata.push(
					useDataviewFormat
						? `[repeat:: ${updatedTask.metadata.recurrence}]`
						: `🔁 ${updatedTask.metadata.recurrence}`
				);
			}

			// 6. Start Date
			if (formattedStartDate) {
				// Check if this date should be skipped based on useAsDateType
				if (
					!(
						updatedTask.metadata.useAsDateType === "start" &&
						formatDate(originalTask.metadata.startDate) ===
							formattedStartDate
					)
				) {
					metadata.push(
						useDataviewFormat
							? `[start:: ${formattedStartDate}]`
							: `🛫 ${formattedStartDate}`
					);
				}
			}

			// 7. Scheduled Date
			if (formattedScheduledDate) {
				// Check if this date should be skipped based on useAsDateType
				if (
					!(
						updatedTask.metadata.useAsDateType === "scheduled" &&
						formatDate(originalTask.metadata.scheduledDate) ===
							formattedScheduledDate
					)
				) {
					metadata.push(
						useDataviewFormat
							? `[scheduled:: ${formattedScheduledDate}]`
							: `⏳ ${formattedScheduledDate}`
					);
				}
			}

			// 8. Due Date
			if (formattedDueDate) {
				// Check if this date should be skipped based on useAsDateType
				if (
					!(
						updatedTask.metadata.useAsDateType === "due" &&
						formatDate(originalTask.metadata.dueDate) ===
							formattedDueDate
					)
				) {
					metadata.push(
						useDataviewFormat
							? `[due:: ${formattedDueDate}]`
							: `📅 ${formattedDueDate}`
					);
				}
			}

			// 9. Completion Date (only if completed)
			if (formattedCompletedDate && updatedTask.completed) {
				metadata.push(
					useDataviewFormat
						? `[completion:: ${formattedCompletedDate}]`
						: `✅ ${formattedCompletedDate}`
				);
			}

			// Append all metadata to the line
			if (metadata.length > 0) {
				updatedLine = updatedLine.trim(); // Trim first to remove trailing space before adding metadata
				updatedLine = `${updatedLine} ${metadata.join(" ")}`;
			}

			// Ensure indentation is preserved
			if (indentation && !updatedLine.startsWith(indentation)) {
				updatedLine = `${indentation}${updatedLine.trimStart()}`;
			}

			if (updatedTask.completed && !originalTask.completed) {
				updatedTask &&
					this.app.workspace.trigger(
						"task-genius:task-completed",
						updatedTask
					);
			}

			console.log(
				"updatedLine",
				updatedLine,
				taskLine,
				updatedTask.content
			);

			// Update the line in the file content
			if (updatedLine !== taskLine) {
				lines[updatedTask.line] = updatedLine;

				// If this is a completed recurring task, create a new task with updated dates
				if (isCompletingRecurringTask) {
					try {
						const newTaskLine = this.createRecurringTask(
							updatedTask,
							indentation
						);

						// Insert the new task line after the current task
						lines.splice(updatedTask.line + 1, 0, newTaskLine);
						this.log(
							`Created new recurring task after line ${updatedTask.line}`
						);
					} catch (error) {
						console.error("Error creating recurring task:", error);
					}
				}

				// Modify the file first - this is the critical operation
				await this.vault.modify(file, lines.join("\n"));
				this.log(
					`Updated task ${updatedTask.id} in file ${updatedTask.filePath}`
				);
				this.log(updatedTask.originalMarkdown);

				// Re-index the modified file - if this fails, don't fail the entire operation
				try {
					await this.indexFile(file);
					this.log(
						`Successfully re-indexed file ${updatedTask.filePath} after task update`
					);
				} catch (indexError) {
					console.error(
						`Failed to re-index file ${updatedTask.filePath} after task update:`,
						indexError
					);
					// Don't throw the error - the file modification was successful
					// The index will be updated on the next file change event
				}
			} else {
				this.log(
					`Task ${updatedTask.id} content did not change. No file modification needed.`
				);
			}
		} catch (error) {
			console.error("Error updating task:", error);
			throw error;
		}
	}

	/**
	 * Creates a new task line based on a completed recurring task
	 */
	private createRecurringTask(
		completedTask: Task,
		indentation: string
	): string {
		// Calculate the next due date based on the recurrence pattern
		const nextDate = this.calculateNextDueDate(completedTask);

		// Create a new task with the same content but updated dates
		const newTask = { ...completedTask };

		// Reset completion status and date
		newTask.completed = false;
		newTask.metadata.completedDate = undefined;

		// Determine where to apply the next date based on what the original task had
		if (completedTask.metadata.dueDate) {
			// If original task had due date, update due date
			newTask.metadata.dueDate = nextDate;
		} else if (completedTask.metadata.scheduledDate) {
			// If original task only had scheduled date, update scheduled date
			newTask.metadata.scheduledDate = nextDate;
			newTask.metadata.dueDate = undefined; // Make sure due date is not set
		} else {
			newTask.metadata.dueDate = nextDate;
		}

		console.log(newTask);

		// Format dates for task markdown
		const formattedDueDate = newTask.metadata.dueDate
			? this.formatDateForDisplay(newTask.metadata.dueDate)
			: undefined;

		// For scheduled date, use the new calculated date if that's what was updated
		const formattedScheduledDate = newTask.metadata.scheduledDate
			? this.formatDateForDisplay(newTask.metadata.scheduledDate)
			: undefined;

		// For other dates, copy the original ones if they exist
		const formattedStartDate = completedTask.metadata.startDate
			? this.formatDateForDisplay(completedTask.metadata.startDate)
			: undefined;

		// Extract the original list marker (-, *, 1., etc.) from the original markdown
		let listMarker = "- ";
		if (completedTask.originalMarkdown) {
			// Match the list marker pattern: could be "- ", "* ", "1. ", etc.
			const listMarkerMatch = completedTask.originalMarkdown.match(
				/^(\s*)([*\-+]|\d+\.)\s+\[/
			);
			if (listMarkerMatch && listMarkerMatch[2]) {
				listMarker = listMarkerMatch[2] + " ";

				// If it's a numbered list, increment the number
				if (/^\d+\.$/.test(listMarkerMatch[2])) {
					const numberStr = listMarkerMatch[2].replace(/\.$/, "");
					const number = parseInt(numberStr);
					listMarker = number + 1 + ". ";
				}
			}
		}

		// Create the task markdown with the correct list marker
		const useDataviewFormat =
			this.plugin.settings.preferMetadataFormat === "dataview";

		// Extract clean content without any existing tags, project tags, or context tags
		let cleanContent = completedTask.content;

		// Remove all tags from the content to avoid duplication
		if (
			completedTask.metadata.tags &&
			completedTask.metadata.tags.length > 0
		) {
			// Get a unique list of tags to avoid processing duplicates
			const uniqueTags = [...new Set(completedTask.metadata.tags)];

			// Remove each tag from the content
			for (const tag of uniqueTags) {
				// Create a regex that looks for the tag preceded by whitespace or at start, and followed by whitespace or end
				// Don't use \b as it doesn't work with Unicode characters like Chinese
				const tagRegex = new RegExp(
					`(^|\\s)${tag.replace(
						/[.*+?^${}()|[\]\\]/g,
						"\\$&"
					)}(?=\\s|$)`,
					"g"
				);
				cleanContent = cleanContent.replace(tagRegex, " ").trim();
			}
		}

		// Remove project tags that might not be in the tags array
		if (completedTask.metadata.project) {
			const projectPrefix =
				this.plugin.settings.projectTagPrefix[
					this.plugin.settings.preferMetadataFormat
				] || "project";
			const projectTag = `#${projectPrefix}/${completedTask.metadata.project}`;
			const projectTagRegex = new RegExp(
				`(^|\\s)${projectTag.replace(
					/[.*+?^${}()|[\]\\]/g,
					"\\$&"
				)}(?=\\s|$)`,
				"g"
			);
			cleanContent = cleanContent.replace(projectTagRegex, " ").trim();
		}

		// Remove context tags that might not be in the tags array
		if (completedTask.metadata.context) {
			const contextTag = `@${completedTask.metadata.context}`;
			const contextTagRegex = new RegExp(
				`(^|\\s)${contextTag.replace(
					/[.*+?^${}()|[\]\\]/g,
					"\\$&"
				)}(?=\\s|$)`,
				"g"
			);
			cleanContent = cleanContent.replace(contextTagRegex, " ").trim();
		}

		// Normalize whitespace
		cleanContent = cleanContent.replace(/\s+/g, " ").trim();

		// Start with the basic task using the extracted list marker and clean content
		let newTaskLine = `${indentation}${listMarker}[ ] ${cleanContent}`;

		// Add metadata based on format preference
		const metadata = [];

		// 1. Tags (excluding project/context tags that are handled separately)
		if (
			completedTask.metadata.tags &&
			completedTask.metadata.tags.length > 0
		) {
			const projectPrefix =
				this.plugin.settings.projectTagPrefix[
					this.plugin.settings.preferMetadataFormat
				] || "project";
			const contextPrefix =
				this.plugin.settings.contextTagPrefix[
					this.plugin.settings.preferMetadataFormat
				] || "@";
			const tagsToAdd = completedTask.metadata.tags.filter((tag) => {
				// Skip non-string tags
				if (typeof tag !== "string") return false;
				// Skip project tags (handled separately)
				if (tag.startsWith(`#${projectPrefix}/`)) return false;
				// Skip context tags (handled separately)
				if (
					tag.startsWith(contextPrefix) &&
					completedTask.metadata.context &&
					tag === `${contextPrefix}${completedTask.metadata.context}`
				)
					return false;
				return true;
			});

			if (tagsToAdd.length > 0) {
				// Ensure uniqueness and proper formatting
				const uniqueTagsToAdd = [...new Set(tagsToAdd)].map((tag) =>
					tag.startsWith("#") ? tag : `#${tag}`
				);
				metadata.push(...uniqueTagsToAdd);
			}
		}

		// 2. Project - Only write project if it's not a read-only tgProject
		const shouldWriteProject =
			completedTask.metadata.project && !isProjectReadonly(completedTask);

		if (shouldWriteProject) {
			if (useDataviewFormat) {
				const projectPrefix =
					this.plugin.settings.projectTagPrefix[
						this.plugin.settings.preferMetadataFormat
					] || "project";
				metadata.push(
					`[${projectPrefix}:: ${completedTask.metadata.project}]`
				);
			} else {
				const projectPrefix =
					this.plugin.settings.projectTagPrefix[
						this.plugin.settings.preferMetadataFormat
					] || "project";
				const projectTag = `#${projectPrefix}/${completedTask.metadata.project}`;
				// Only add project tag if it's not already added in the tags section
				if (!metadata.includes(projectTag)) {
					metadata.push(projectTag);
				}
			}
		}

		// 3. Context
		if (completedTask.metadata.context) {
			if (useDataviewFormat) {
				const contextPrefix =
					this.plugin.settings.contextTagPrefix[
						this.plugin.settings.preferMetadataFormat
					] || "context";
				metadata.push(
					`[${contextPrefix}:: ${completedTask.metadata.context}]`
				);
			} else {
				const contextPrefix =
					this.plugin.settings.contextTagPrefix[
						this.plugin.settings.preferMetadataFormat
					] || "@";
				// For emoji format, always use @ prefix (not configurable)
				const contextTag = `${contextPrefix}${completedTask.metadata.context}`;
				// Only add context tag if it's not already in the metadata
				if (!metadata.includes(contextTag)) {
					metadata.push(contextTag);
				}
			}
		}

		// 4. Priority
		if (completedTask.metadata.priority) {
			if (useDataviewFormat) {
				let priorityValue: string | number;
				switch (completedTask.metadata.priority) {
					case 5:
						priorityValue = "highest";
						break;
					case 4:
						priorityValue = "high";
						break;
					case 3:
						priorityValue = "medium";
						break;
					case 2:
						priorityValue = "low";
						break;
					case 1:
						priorityValue = "lowest";
						break;
					default:
						priorityValue = completedTask.metadata.priority;
				}
				metadata.push(`[priority:: ${priorityValue}]`);
			} else {
				let priorityMarker = "";
				switch (completedTask.metadata.priority) {
					case 5:
						priorityMarker = "🔺";
						break;
					case 4:
						priorityMarker = "⏫";
						break;
					case 3:
						priorityMarker = "🔼";
						break;
					case 2:
						priorityMarker = "🔽";
						break;
					case 1:
						priorityMarker = "⏬";
						break;
				}
				if (priorityMarker) metadata.push(priorityMarker);
			}
		}

		// 5. Recurrence
		if (completedTask.metadata.recurrence) {
			metadata.push(
				useDataviewFormat
					? `[repeat:: ${completedTask.metadata.recurrence}]`
					: `🔁 ${completedTask.metadata.recurrence}`
			);
		}

		// 6. Start Date
		if (formattedStartDate) {
			metadata.push(
				useDataviewFormat
					? `[start:: ${formattedStartDate}]`
					: `🛫 ${formattedStartDate}`
			);
		}

		// 7. Scheduled Date
		if (formattedScheduledDate) {
			metadata.push(
				useDataviewFormat
					? `[scheduled:: ${formattedScheduledDate}]`
					: `⏳ ${formattedScheduledDate}`
			);
		}

		// 8. Due Date
		if (formattedDueDate) {
			metadata.push(
				useDataviewFormat
					? `[due:: ${formattedDueDate}]`
					: `📅 ${formattedDueDate}`
			);
		}

		// Append all metadata to the line
		if (metadata.length > 0) {
			newTaskLine = `${newTaskLine} ${metadata.join(" ")}`;
		}

		console.log(newTaskLine);

		return newTaskLine;
	}

	/**
	 * Calculates the next due date based on recurrence pattern
	 */
	private calculateNextDueDate(task: Task): number | undefined {
		if (!task.metadata.recurrence) return undefined;

		console.log(task);

		// Determine base date based on user settings
		let baseDate: Date;
		const recurrenceDateBase =
			this.plugin.settings.recurrenceDateBase || "due";

		if (recurrenceDateBase === "current") {
			// Always use current date
			baseDate = new Date();
		} else if (
			recurrenceDateBase === "scheduled" &&
			task.metadata.scheduledDate
		) {
			// Use scheduled date if available
			baseDate = new Date(task.metadata.scheduledDate);
		} else if (recurrenceDateBase === "due" && task.metadata.dueDate) {
			// Use due date if available (default behavior)
			baseDate = new Date(task.metadata.dueDate);
		} else {
			// Fallback to current date if the specified date type is not available
			baseDate = new Date();
		}

		// Ensure baseDate is at the beginning of the day for date-based recurrence
		baseDate.setHours(0, 0, 0, 0);

		try {
			// Attempt to parse using rrule first
			try {
				// Use the task's recurrence string directly if it's a valid RRULE string
				// Provide dtstart to rrulestr for context, especially for rules that might depend on the start date.
				const rule = rrulestr(task.metadata.recurrence, {
					dtstart: baseDate,
				});

				// We want the first occurrence strictly *after* the baseDate.
				// Adding a small time offset ensures we get the next instance even if baseDate itself is an occurrence.
				const afterDate = new Date(baseDate.getTime() + 1000); // 1 second after baseDate
				const nextOccurrence = rule.after(afterDate); // Find the first occurrence after this adjusted date

				if (nextOccurrence) {
					// Set time to start of day, assuming date-only recurrence for now
					nextOccurrence.setHours(0, 0, 0, 0);
					this.log(
						`Calculated next date using rrule for '${
							task.metadata.recurrence
						}': ${nextOccurrence.toISOString()}`
					);
					return nextOccurrence.getTime();
				} else {
					// No next occurrence found by rrule (e.g., rule has COUNT and finished)
					this.log(
						`[TaskManager] rrule couldn't find next occurrence for rule: ${task.metadata.recurrence}. Falling back.`
					);
					// Fall through to simple logic below
				}
			} catch (e) {
				// rrulestr failed, likely not a standard RRULE format. Fall back to simple parsing.
				if (e instanceof Error) {
					this.log(
						`[TaskManager] Failed to parse recurrence '${task.metadata.recurrence}' with rrule. Falling back to simple logic. Error: ${e.message}`
					);
				} else {
					this.log(
						`[TaskManager] Failed to parse recurrence '${task.metadata.recurrence}' with rrule. Falling back to simple logic. Unknown error.`
					);
				}
			}

			// --- Fallback Simple Parsing Logic ---
			this.log(
				`[TaskManager] Using fallback logic for recurrence: ${task.metadata.recurrence}`
			);
			const recurrence = task.metadata.recurrence.trim().toLowerCase();
			let nextDate = new Date(baseDate); // Start calculation from the base date

			// Calculate the next date based on the recurrence pattern
			const monthOnDayRegex =
				/every\s+month\s+on\s+the\s+(\d+)(st|nd|rd|th)/i;
			const monthOnDayMatch = recurrence.match(monthOnDayRegex);

			if (monthOnDayMatch) {
				const dayOfMonth = parseInt(monthOnDayMatch[1]);
				if (!isNaN(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31) {
					// Clone the base date for calculation
					const nextMonthDate = new Date(baseDate.getTime());

					// Move to the next month
					nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
					// Set to the specified date
					nextMonthDate.setDate(dayOfMonth);

					// Check if we need to move to the next month
					// If the base date's date has already passed the specified date and it's the same month, use the next month's corresponding date
					// If the base date's date hasn't passed the specified date and it's the same month, use the current month's corresponding date
					if (baseDate.getDate() < dayOfMonth) {
						// The base date hasn't passed the specified date, use the current month's date
						nextMonthDate.setMonth(baseDate.getMonth());
					}

					// Validate the date (handle 2/30, etc.)
					if (nextMonthDate.getDate() !== dayOfMonth) {
						// Invalid date, use the last day of the month
						nextMonthDate.setDate(0);
					}

					nextDate = nextMonthDate;
				} else {
					this.log(
						`[TaskManager] Invalid day of month: ${dayOfMonth}`
					);
					// Fall back to +1 day
					nextDate.setDate(baseDate.getDate() + 1);
				}
			}
			// Parse "every X days/weeks/months/years" format
			else if (recurrence.startsWith("every")) {
				const parts = recurrence.split(" ");
				if (parts.length >= 2) {
					let interval = 1;
					let unit = parts[1];
					if (parts.length >= 3 && !isNaN(parseInt(parts[1]))) {
						interval = parseInt(parts[1]);
						unit = parts[2];
					}
					if (unit.endsWith("s")) {
						unit = unit.substring(0, unit.length - 1);
					}
					switch (unit) {
						case "day":
							const dayBasedNextDate = new Date(
								baseDate.getTime()
							);
							dayBasedNextDate.setDate(
								dayBasedNextDate.getDate() + interval
							);
							nextDate = dayBasedNextDate;
							break;
						case "week":
							nextDate.setDate(baseDate.getDate() + interval * 7);
							break;
						case "month":
							const monthBasedNextDate = new Date(
								baseDate.getTime()
							);
							monthBasedNextDate.setMonth(
								monthBasedNextDate.getMonth() + interval
							);

							// Check if the date has changed
							nextDate = monthBasedNextDate;
							break;
						case "year":
							nextDate.setFullYear(
								baseDate.getFullYear() + interval
							);
							break;
						default:
							this.log(
								`[TaskManager] Unknown unit in recurrence '${recurrence}'. Defaulting to days.`
							);
							// 同样使用克隆日期对象进行计算
							const defaultNextDate = new Date(
								baseDate.getTime()
							);
							defaultNextDate.setDate(
								defaultNextDate.getDate() + interval
							);
							nextDate = defaultNextDate;
					}
				} else {
					// Malformed "every" rule, fallback to +1 day from baseDate
					this.log(
						`[TaskManager] Malformed 'every' rule '${recurrence}'. Defaulting to next day.`
					);
					const fallbackNextDate = new Date(baseDate.getTime());
					fallbackNextDate.setDate(fallbackNextDate.getDate() + 1);
					nextDate = fallbackNextDate;
				}
			}
			// Handle specific weekday recurrences like "every Monday"
			else if (
				recurrence.includes("monday") ||
				recurrence.includes("tuesday") ||
				recurrence.includes("wednesday") ||
				recurrence.includes("thursday") ||
				recurrence.includes("friday") ||
				recurrence.includes("saturday") ||
				recurrence.includes("sunday")
			) {
				const weekdays: { [key: string]: number } = {
					sunday: 0,
					monday: 1,
					tuesday: 2,
					wednesday: 3,
					thursday: 4,
					friday: 5,
					saturday: 6,
				};
				let targetDay = -1;
				for (const [day, value] of Object.entries(weekdays)) {
					if (recurrence.includes(day)) {
						targetDay = value;
						break;
					}
				}
				if (targetDay >= 0) {
					// Start calculation from the day *after* the baseDate
					nextDate.setDate(baseDate.getDate() + 1);
					while (nextDate.getDay() !== targetDay) {
						nextDate.setDate(nextDate.getDate() + 1);
					}
				} else {
					// Malformed weekday rule, fallback to +1 day from baseDate
					this.log(
						`[TaskManager] Malformed weekday rule '${recurrence}'. Defaulting to next day.`
					);
					nextDate.setDate(baseDate.getDate() + 1);
				}
			} else {
				// Unknown format, fallback to +1 day from baseDate
				this.log(
					`[TaskManager] Unknown recurrence format '${recurrence}'. Defaulting to next day.`
				);
				nextDate.setDate(baseDate.getDate() + 1);
			}

			// Ensure the calculated date is at the start of the day
			nextDate.setHours(0, 0, 0, 0);
			this.log(
				`Calculated next date using simple logic for '${
					task.metadata.recurrence
				}': ${nextDate.toISOString()}`
			);
			return nextDate.getTime();
		} catch (error) {
			console.error("Error calculating next date:", error);
			// Default fallback: add one day to baseDate
			const fallbackDate = new Date(baseDate);
			fallbackDate.setDate(fallbackDate.getDate() + 1);
			fallbackDate.setHours(0, 0, 0, 0);
			if (task.metadata.recurrence) {
				this.log(
					`Error calculating next date for '${
						task.metadata.recurrence
					}'. Defaulting to ${fallbackDate.toISOString()}`
				);
			} else {
				this.log(
					`Error calculating next date for task without recurrence. Defaulting to ${fallbackDate.toISOString()}`
				);
			}
			return fallbackDate.getTime();
		}
	}

	/**
	 * Format a date for display in task metadata
	 */
	private formatDateForDisplay(timestamp: number): string {
		const date = new Date(timestamp);
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
			2,
			"0"
		)}-${String(date.getDate()).padStart(2, "0")}`;
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

			// Explicitly remove the consolidated cache
			try {
				await this.persister.persister.removeItem(
					"consolidated:taskCache"
				);
				this.log("Cleared consolidated task cache");
			} catch (error) {
				console.error("Error clearing consolidated cache:", error);
			}

			this.log("Cleared all cached task data");
		} catch (error) {
			console.error("Error clearing cache:", error);
		}

		// Get all supported files for progress tracking
		const allFiles = this.app.vault
			.getFiles()
			.filter(
				(file) => file.extension === "md" || file.extension === "canvas"
			);

		// Create and start progress manager for force reindex
		const progressManager = new RebuildProgressManager();
		progressManager.startRebuild(
			allFiles.length,
			"Force reindex requested"
		);

		// Set progress manager for the task manager
		this.setProgressManager(progressManager);

		// Re-initialize everything
		await this.initialize();

		// Mark rebuild as complete
		const finalTaskCount = this.getAllTasks().length;
		progressManager.completeRebuild(finalTaskCount);

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

		// Clean up task parsing service and its workers if it exists
		if (this.taskParsingService) {
			this.taskParsingService.destroy();
			this.taskParsingService = undefined;
		}

		super.onunload();
	}
}
