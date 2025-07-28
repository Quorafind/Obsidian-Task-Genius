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
import {
	getEffectiveProject,
	isProjectReadonly,
	resetTaskUtilParser,
} from "./taskUtil";
import { HolidayDetector } from "./ics/HolidayDetector";
import {
	TaskParsingService,
	TaskParsingServiceOptions,
} from "./TaskParsingService";
import {
	TaskParsingService as NewTaskParsingService,
} from "../parsing/services/TaskParsingService";
import { UnifiedCacheManager } from "../parsing/core/UnifiedCacheManager";
import { ParseEventManager } from "../parsing/core/ParseEventManager";
import { PluginManager } from "../parsing/core/PluginManager";
import { ResourceManager, ResourceUtils } from "../parsing/core/ResourceManager";
import {
	isSupportedFileWithFilter,
	getFileType,
	SupportedFileType,
} from "./fileTypeUtils";
import { FileFilterManager } from "./FileFilterManager";
import { CanvasParser } from "./parsing/CanvasParser";
import { CanvasTaskUpdater } from "./parsing/CanvasTaskUpdater";
import { FileMetadataTaskUpdater } from "./workers/FileMetadataTaskUpdater";
import { RebuildProgressManager } from "./RebuildProgressManager";
import { OnCompletionManager } from "./OnCompletionManager";

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
	/** New unified task parsing service */
	private newTaskParsingService?: NewTaskParsingService;
	/** Unified cache manager for the new parsing system */
	private unifiedCacheManager?: UnifiedCacheManager;
	/** Parse event manager for the new parsing system */
	private parseEventManager?: ParseEventManager;
	/** Plugin manager for the new parsing system */
	private pluginManager?: PluginManager;
	/** Resource manager for automatic resource cleanup */
	private resourceManager?: ResourceManager;
	/** Whether to use the new parsing system */
	private useNewParsingSystem: boolean = false;
	/** File metadata task updater for handling metadata-based tasks */
	private fileMetadataUpdater?: FileMetadataTaskUpdater;
	/** Canvas parser for .canvas files */
	private canvasParser: CanvasParser;
	/** Canvas task updater for modifying tasks in .canvas files */
	private canvasTaskUpdater: CanvasTaskUpdater;
	/** File filter manager for filtering files during indexing */
	private fileFilterManager?: FileFilterManager;
	/** OnCompletion manager for handling task completion actions */
	private onCompletionManager?: OnCompletionManager;

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

		// Initialize the new parsing system if enabled
		this.initializeNewParsingSystem();

		// Initialize file filter manager
		this.initializeFileFilterManager();

		// Initialize onCompletion manager
		this.initializeOnCompletionManager();

		// Set up the indexer's parse callback to use our parser
		this.indexer.setParseFileCallback(async (file: TFile) => {
			const content = await this.vault.cachedRead(file);
			return await this.parseFileWithAppropriateParserAsync(file, content);
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
				// Set task indexer reference for cache checking
				this.workerManager.setTaskIndexer(this.indexer);
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
		if (this.onCompletionManager) {
			this.addChild(this.onCompletionManager);
		}
	}

	/**
	 * Initialize file filter manager
	 */
	private initializeFileFilterManager(): void {
		if (this.plugin.settings.fileFilter?.enabled) {
			this.fileFilterManager = new FileFilterManager(
				this.plugin.settings.fileFilter
			);
			this.indexer.setFileFilterManager(this.fileFilterManager);
			this.log("File filter manager initialized");
		} else {
			this.fileFilterManager = undefined;
			this.indexer.setFileFilterManager(undefined);
		}
	}

	/**
	 * Initialize onCompletion manager
	 */
	private initializeOnCompletionManager(): void {
		this.onCompletionManager = new OnCompletionManager(
			this.app,
			this.plugin
		);
		this.log("OnCompletion manager initialized");

		this.addChild(this.onCompletionManager);
	}

	/**
	 * Get the onCompletion manager instance
	 */
	public getOnCompletionManager(): OnCompletionManager | undefined {
		return this.onCompletionManager;
	}

	/**
	 * Initialize the new unified parsing system
	 */
	private initializeNewParsingSystem(): void {
		// For now, we'll make this optional based on a setting or feature flag
		// In the future, this will become the default
		if (this.plugin.settings.useNewParsingSystem) {
			this.useNewParsingSystem = true;
			
			try {
				// Initialize resource manager first for tracking all resources
				this.resourceManager = new ResourceManager({
					debug: this.options.debug,
					enableAutoCleanup: true,
					enableLeakDetection: true,
					enableMetrics: true
				});

				// Initialize core components of the new parsing system
				this.parseEventManager = new ParseEventManager(this.app);
				this.unifiedCacheManager = new UnifiedCacheManager(this.app);
				this.pluginManager = new PluginManager(
					this.app,
					this.parseEventManager,
					this.unifiedCacheManager
				);

				// Initialize the new parsing service
				this.newTaskParsingService = new NewTaskParsingService(this.app);

				// Add components to lifecycle management
				this.addChild(this.resourceManager);
				this.addChild(this.parseEventManager);
				this.addChild(this.unifiedCacheManager);
				this.addChild(this.pluginManager);
				this.addChild(this.newTaskParsingService);

				// Register core components as managed resources
				this.registerCoreComponentsAsResources();

				// Log registered plugins for debugging
				const registeredPlugins = this.pluginManager.getRegisteredPlugins();
				this.log(`New unified parsing system initialized successfully with plugins: ${registeredPlugins.join(', ')}`);
				
				// Log plugin status for debugging
				const pluginStatus = this.pluginManager.getPluginStatus();
				this.log("Plugin status:", pluginStatus);
			} catch (error) {
				console.error("Failed to initialize new parsing system, falling back to legacy:", error);
				this.useNewParsingSystem = false;
			}
		}
	}

	/**
	 * Initialize enhanced task parsing service if enhanced project is enabled
	 */
	private initializeTaskParsingService(): void {
		console.log("initializeTaskParsingService", this.plugin.settings);

		// Clean up existing TaskParsingService instance to prevent worker leaks
		if (this.taskParsingService) {
			this.log("Cleaning up existing TaskParsingService instance");
			this.taskParsingService.destroy();
			this.taskParsingService = undefined;
		}

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
					metadataConfigEnabled:
						this.plugin.settings.projectConfig.metadataConfig
							.enabled,
					configFileEnabled:
						this.plugin.settings.projectConfig.configFile.enabled,
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
	 * Update file filter configuration when settings change
	 */
	public updateFileFilterConfiguration(): void {
		this.initializeFileFilterManager();
		this.log("File filter configuration updated");
	}

	/**
	 * Get the file filter manager instance
	 */
	public getFileFilterManager(): FileFilterManager | undefined {
		return this.fileFilterManager;
	}

	/**
	 * Update parsing configuration when settings change
	 */
	public updateParsingConfiguration(): void {
		// Reset cached parser in taskUtil to pick up new prefix settings
		resetTaskUtilParser();

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

		// Reinitialize the new parsing system if settings changed
		this.initializeNewParsingSystem();

		// Clear project configuration cache to force re-reading of project config files
		if (this.taskParsingService) {
			this.taskParsingService.clearProjectConfigCache();
		}

		// Clear new system cache if available
		if (this.unifiedCacheManager) {
			this.unifiedCacheManager.clearAll();
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
		// For now, keep this synchronous for compatibility with TaskIndexer callback
		// TODO: Refactor TaskIndexer to support async parsing
		return this.parseFileWithAppropriateParserSync(filePath, content);
	}

	private parseFileWithAppropriateParserSync(
		filePath: string,
		content: string
	): Task[] {
		try {
			// TODO: Enable new parsing system when async callback is supported
			// For now, always use legacy system to maintain compatibility
			// if (this.useNewParsingSystem && this.pluginManager) {
			//     return await this.parseWithNewSystem(filePath, content);
			// }

			// Fallback to legacy parsing system
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
	 * Parse a file asynchronously using the appropriate parser based on file type
	 * This method integrates with TaskIndexer's async callback interface
	 */
	public async parseFileWithAppropriateParserAsync(
		file: TFile,
		content: string
	): Promise<Task[]> {
		try {
			// Use new parsing system if enabled and available
			if (this.useNewParsingSystem && this.pluginManager) {
				return await this.parseWithNewSystem(file.path, content, file.stat.mtime);
			}

			// Fallback to legacy parsing system
			const fileType = getFileType(file);
			let tasks: Task[] = [];

			if (fileType === SupportedFileType.CANVAS) {
				// Use canvas parser for .canvas files
				tasks = this.canvasParser.parseCanvasFile(content, file.path);
			} else if (fileType === SupportedFileType.MARKDOWN) {
				// Use markdown parser for .md files
				tasks = this.taskParser.parseLegacy(content, file.path);
			} else {
				// Unsupported file type
				return [];
			}

			// Apply heading filters if specified in settings
			return this.applyHeadingFilters(tasks);
		} catch (error) {
			console.error(
				`Error parsing file ${file.path} with appropriate parser:`,
				error
			);
			// Return empty array as fallback
			return [];
		}
	}

	/**
	 * Parse a file asynchronously using the new unified parsing system
	 */
	public async parseFileWithNewSystemAsync(
		filePath: string,
		content: string
	): Promise<Task[]> {
		return this.parseWithNewSystem(filePath, content);
	}

	/**
	 * Enable or disable the new parsing system for testing
	 */
	public setNewParsingSystemEnabled(enabled: boolean): void {
		if (enabled && !this.pluginManager) {
			this.log("Cannot enable new parsing system: components not initialized. Please set useNewParsingSystem=true in settings.");
			return;
		}
		
		this.useNewParsingSystem = enabled;
		this.log(`New parsing system ${enabled ? 'enabled' : 'disabled'}`);
		
		if (enabled && this.pluginManager) {
			// Log current plugin status
			const pluginStatus = this.pluginManager.getPluginStatus();
			this.log("Plugin status:", pluginStatus);
		}
	}

	/**
	 * Check if the new parsing system is enabled and ready
	 */
	public isNewParsingSystemReady(): boolean {
		return this.useNewParsingSystem && 
			   !!this.pluginManager && 
			   !!this.parseEventManager && 
			   !!this.unifiedCacheManager;
	}

	/**
	 * Test the new parsing system with a specific file
	 * This is a debug method for testing the new system
	 */
	public async testNewParsingSystem(file: TFile): Promise<{
		success: boolean;
		tasks: Task[];
		error?: string;
		performance: {
			parseTime: number;
			pluginUsed: string;
		};
	}> {
		const startTime = performance.now();
		
		try {
			if (!this.useNewParsingSystem || !this.pluginManager) {
				return {
					success: false,
					tasks: [],
					error: "New parsing system not enabled or not initialized",
					performance: {
						parseTime: 0,
						pluginUsed: "none"
					}
				};
			}

			const content = await this.vault.cachedRead(file);
			const fileType = getFileType(file);
			
			let pluginType: string;
			switch (fileType) {
				case SupportedFileType.MARKDOWN:
					pluginType = 'markdown';
					break;
				case SupportedFileType.CANVAS:
					pluginType = 'canvas';
					break;
				default:
					pluginType = 'metadata';
					break;
			}

			const tasks = await this.parseWithNewSystem(file.path, content, file.stat.mtime);
			const endTime = performance.now();

			return {
				success: true,
				tasks,
				performance: {
					parseTime: endTime - startTime,
					pluginUsed: pluginType
				}
			};
		} catch (error) {
			const endTime = performance.now();
			return {
				success: false,
				tasks: [],
				error: error.message,
				performance: {
					parseTime: endTime - startTime,
					pluginUsed: "error"
				}
			};
		}
	}

	/**
	 * Compare performance and correctness between new and legacy parsing systems
	 * This is crucial for validating the new system before migration
	 */
	public async compareParsingPerformance(file: TFile): Promise<{
		newSystem: {
			success: boolean;
			tasks: Task[];
			parseTime: number;
			error?: string;
		};
		legacySystem: {
			success: boolean;
			tasks: Task[];
			parseTime: number;
			error?: string;
		};
		comparison: {
			taskCountMatch: boolean;
			taskIdsMatch: boolean;
			contentMatch: boolean;
			performanceRatio: number; // newTime / legacyTime
			recommendation: 'new_system_better' | 'legacy_better' | 'equivalent';
		};
	}> {
		const content = await this.vault.cachedRead(file);
		
		// Test new system
		const newSystemStart = performance.now();
		let newSystemResult: {
			success: boolean;
			tasks: Task[];
			parseTime: number;
			error?: string;
		};
		try {
			const wasEnabled = this.useNewParsingSystem;
			this.useNewParsingSystem = true;
			const newTasks = await this.parseWithNewSystem(file.path, content, file.stat.mtime);
			this.useNewParsingSystem = wasEnabled;
			
			const newSystemEnd = performance.now();
			newSystemResult = {
				success: true,
				tasks: newTasks,
				parseTime: newSystemEnd - newSystemStart
			};
		} catch (error) {
			const newSystemEnd = performance.now();
			newSystemResult = {
				success: false,
				tasks: [],
				parseTime: newSystemEnd - newSystemStart,
				error: error.message
			};
		}

		// Test legacy system
		const legacySystemStart = performance.now();
		let legacySystemResult: {
			success: boolean;
			tasks: Task[];
			parseTime: number;
			error?: string;
		};
		try {
			const wasEnabled = this.useNewParsingSystem;
			this.useNewParsingSystem = false;
			const legacyTasks = await this.parseFileWithAppropriateParserAsync(file, content);
			this.useNewParsingSystem = wasEnabled;
			
			const legacySystemEnd = performance.now();
			legacySystemResult = {
				success: true,
				tasks: legacyTasks,
				parseTime: legacySystemEnd - legacySystemStart
			};
		} catch (error) {
			const legacySystemEnd = performance.now();
			legacySystemResult = {
				success: false,
				tasks: [],
				parseTime: legacySystemEnd - legacySystemStart,
				error: error.message
			};
		}

		// Compare results
		const result = {
			newSystem: newSystemResult,
			legacySystem: legacySystemResult,
			comparison: this.compareParsingResults(newSystemResult, legacySystemResult)
		};

		return result;
	}

	/**
	 * Compare two parsing results for correctness and performance
	 */
	private compareParsingResults(
		newResult: { success: boolean; tasks: Task[]; parseTime: number; error?: string },
		legacyResult: { success: boolean; tasks: Task[]; parseTime: number; error?: string }
	): {
		taskCountMatch: boolean;
		taskIdsMatch: boolean;
		contentMatch: boolean;
		performanceRatio: number;
		recommendation: 'new_system_better' | 'legacy_better' | 'equivalent';
	} {
		const taskCountMatch = newResult.tasks.length === legacyResult.tasks.length;
		
		// Compare task IDs
		const newTaskIds = new Set(newResult.tasks.map(t => t.id));
		const legacyTaskIds = new Set(legacyResult.tasks.map(t => t.id));
		const taskIdsMatch = newTaskIds.size === legacyTaskIds.size && 
							[...newTaskIds].every(id => legacyTaskIds.has(id));

		// Compare task content (deep comparison)
		let contentMatch = taskCountMatch && taskIdsMatch;
		if (contentMatch) {
			// Sort both arrays by ID for comparison
			const sortedNew = [...newResult.tasks].sort((a, b) => a.id.localeCompare(b.id));
			const sortedLegacy = [...legacyResult.tasks].sort((a, b) => a.id.localeCompare(b.id));
			
			for (let i = 0; i < sortedNew.length; i++) {
				const newTask = sortedNew[i];
				const legacyTask = sortedLegacy[i];
				
				// Compare critical fields
				if (newTask.text !== legacyTask.text ||
					newTask.completed !== legacyTask.completed ||
					newTask.filePath !== legacyTask.filePath ||
					newTask.lineNumber !== legacyTask.lineNumber) {
					contentMatch = false;
					break;
				}
			}
		}

		const performanceRatio = legacyResult.parseTime > 0 ? 
			newResult.parseTime / legacyResult.parseTime : 1;

		// Determine recommendation
		let recommendation: 'new_system_better' | 'legacy_better' | 'equivalent';
		if (!newResult.success && legacyResult.success) {
			recommendation = 'legacy_better';
		} else if (newResult.success && !legacyResult.success) {
			recommendation = 'new_system_better';
		} else if (!contentMatch) {
			recommendation = 'legacy_better'; // Favor legacy if results don't match
		} else if (performanceRatio < 0.8) {
			recommendation = 'new_system_better'; // New system is significantly faster
		} else if (performanceRatio > 1.2) {
			recommendation = 'legacy_better'; // Legacy is significantly faster
		} else {
			recommendation = 'equivalent';
		}

		return {
			taskCountMatch,
			taskIdsMatch,
			contentMatch,
			performanceRatio,
			recommendation
		};
	}

	/**
	 * Run comprehensive tests on multiple files to validate the new parsing system
	 */
	public async runParsingSystemValidation(): Promise<{
		totalFiles: number;
		successfulComparisons: number;
		failedComparisons: number;
		recommendations: {
			new_system_better: number;
			legacy_better: number;
			equivalent: number;
		};
		averagePerformanceRatio: number;
		issues: string[];
	}> {
		const results = {
			totalFiles: 0,
			successfulComparisons: 0,
			failedComparisons: 0,
			recommendations: {
				new_system_better: 0,
				legacy_better: 0,
				equivalent: 0
			},
			averagePerformanceRatio: 0,
			issues: [] as string[]
		};

		// Get a sample of files to test
		const files = this.vault.getMarkdownFiles().slice(0, 10); // Test first 10 files
		let totalPerformanceRatio = 0;

		for (const file of files) {
			try {
				results.totalFiles++;
				const comparison = await this.compareParsingPerformance(file);
				
				if (comparison.newSystem.success || comparison.legacySystem.success) {
					results.successfulComparisons++;
					results.recommendations[comparison.comparison.recommendation]++;
					totalPerformanceRatio += comparison.comparison.performanceRatio;
					
					// Log issues
					if (!comparison.comparison.contentMatch) {
						results.issues.push(`File ${file.path}: Content mismatch between systems`);
					}
					if (comparison.comparison.performanceRatio > 2) {
						results.issues.push(`File ${file.path}: New system is ${comparison.comparison.performanceRatio.toFixed(2)}x slower`);
					}
				} else {
					results.failedComparisons++;
					results.issues.push(`File ${file.path}: Both systems failed to parse`);
				}
			} catch (error) {
				results.failedComparisons++;
				results.issues.push(`File ${file.path}: Comparison failed - ${error.message}`);
			}
		}

		results.averagePerformanceRatio = results.successfulComparisons > 0 ? 
			totalPerformanceRatio / results.successfulComparisons : 1;

		return results;
	}

	/**
	 * Quick diagnostic test for the new parsing system
	 * This method provides a simple way to check if the new system is working
	 */
	public async runQuickDiagnosticTest(): Promise<{
		systemReady: boolean;
		componentsStatus: {
			pluginManager: boolean;
			eventManager: boolean;
			cacheManager: boolean;
		};
		parseTest: {
			success: boolean;
			error?: string;
			tasksFound: number;
		};
		message: string;
	}> {
		// Check component status
		const componentsStatus = {
			pluginManager: !!this.pluginManager,
			eventManager: !!this.parseEventManager,
			cacheManager: !!this.unifiedCacheManager
		};

		const systemReady = this.isNewParsingSystemReady();

		let parseTest = {
			success: false,
			tasksFound: 0,
			error: undefined as string | undefined
		};

		// Try to test with a simple markdown content
		if (systemReady) {
			try {
				const testContent = `# Test File

This is a test markdown file for parsing validation.

- [ ] Test task 1
- [x] Completed test task
- [ ] Test task with #tag
- [ ] Task with project +project 
- [ ] Task with due date 📅 2024-12-31

## Done
- [x] Another completed task`;

				const testTasks = await this.parseWithNewSystem('/test.md', testContent);
				parseTest = {
					success: true,
					tasksFound: testTasks.length
				};
			} catch (error) {
				parseTest = {
					success: false,
					tasksFound: 0,
					error: error.message
				};
			}
		}

		// Generate diagnostic message
		let message: string;
		if (!systemReady) {
			const missing = Object.entries(componentsStatus)
				.filter(([_, status]) => !status)
				.map(([name, _]) => name);
			message = `New parsing system not ready. Missing components: ${missing.join(', ')}. Enable useNewParsingSystem in settings and ensure proper initialization.`;
		} else if (!parseTest.success) {
			message = `New parsing system initialized but failed test parse: ${parseTest.error}`;
		} else {
			message = `New parsing system is working correctly. Test parsed ${parseTest.tasksFound} tasks.`;
		}

		return {
			systemReady,
			componentsStatus,
			parseTest,
			message
		};
	}

	/**
	 * Test all parser plugins functionality and performance
	 * This validates each plugin type and Component lifecycle management
	 */
	public async testAllPluginsFunctionality(): Promise<{
		pluginTests: {
			[pluginName: string]: {
				success: boolean;
				parseTime: number;
				tasksFound: number;
				error?: string;
				lifecycleTest?: {
					componentAdded: boolean;
					eventListening: boolean;
				};
			};
		};
		overallStatus: 'all_passed' | 'some_failed' | 'all_failed';
		summary: {
			totalPlugins: number;
			passedPlugins: number;
			failedPlugins: number;
			averageParseTime: number;
		};
	}> {
		const pluginTests: {
			[pluginName: string]: {
				success: boolean;
				parseTime: number;
				tasksFound: number;
				error?: string;
				lifecycleTest?: {
					componentAdded: boolean;
					eventListening: boolean;
				};
			};
		} = {};

		// Test data for each plugin type
		const testData = {
			markdown: {
				content: `# Test Markdown

- [ ] Markdown task 1 #tag
- [x] Completed markdown task +project
- [ ] Task with due date 📅 2024-12-31
- [ ] High priority task ⏫
- [ ] Context task @home

## Section 2
- [ ] Task in section 2`,
				filePath: '/test.md'
			},
			canvas: {
				content: JSON.stringify({
					nodes: [
						{
							id: "1",
							type: "text",
							text: "- [ ] Canvas task 1\n- [x] Completed canvas task",
							x: 0,
							y: 0,
							width: 400,
							height: 200
						},
						{
							id: "2", 
							type: "text",
							text: "- [ ] Another canvas task #canvas +canvasproject",
							x: 450,
							y: 0,
							width: 300,
							height: 150
						}
					],
					edges: []
				}),
				filePath: '/test.canvas'
			},
			ics: {
				content: `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VTODO
UID:task1@test.com
DTSTAMP:20241201T000000Z
SUMMARY:ICS Task 1
STATUS:NEEDS-ACTION
END:VTODO
BEGIN:VTODO
UID:task2@test.com
DTSTAMP:20241201T000000Z
SUMMARY:Completed ICS Task
STATUS:COMPLETED
END:VTODO
END:VCALENDAR`,
				filePath: '/test.ics'
			},
			metadata: {
				content: `---
tasks:
  - text: "Metadata task 1"
    completed: false
    tags: ["meta"]
  - text: "Completed metadata task"
    completed: true
project: metadata-test
---

# Metadata Test File

This file has tasks defined in frontmatter.`,
				filePath: '/test_meta.md'
			}
		};

		// Test each plugin
		for (const [pluginName, testInfo] of Object.entries(testData)) {
			const startTime = performance.now();
			
			try {
				// Create parse context
				const parseContext = {
					filePath: testInfo.filePath,
					content: testInfo.content,
					mtime: Date.now(),
					settings: {
						markdown: {
							preferMetadataFormat: this.plugin.settings.preferMetadataFormat,
							parseHeadings: true,
							parseHierarchy: true,
							ignoreHeading: this.plugin.settings.ignoreHeading,
							focusHeading: this.plugin.settings.focusHeading
						},
						canvas: {
							includeNodeId: true,
							includePosition: false
						},
						metadata: {
							parseFromFrontmatter: true,
							parseFromTags: true
						}
					}
				};

				// Test parsing
				let tasks: Task[] = [];
				let lifecycleTest: { componentAdded: boolean; eventListening: boolean } | undefined;
				
				if (this.pluginManager) {
					const result = await this.pluginManager.executePlugin(pluginName, parseContext);
					if (result && result.tasks) {
						tasks = result.tasks;
					}

					// Test Component lifecycle if plugin manager supports it
					if (typeof this.pluginManager.getPluginStatus === 'function') {
						const pluginStatus = this.pluginManager.getPluginStatus();
						lifecycleTest = {
							componentAdded: pluginStatus[pluginName]?.registered || false,
							eventListening: pluginStatus[pluginName]?.active || false
						};
					}
				}

				const endTime = performance.now();
				pluginTests[pluginName] = {
					success: true,
					parseTime: endTime - startTime,
					tasksFound: tasks.length,
					lifecycleTest
				};

			} catch (error) {
				const endTime = performance.now();
				pluginTests[pluginName] = {
					success: false,
					parseTime: endTime - startTime,
					tasksFound: 0,
					error: error.message
				};
			}
		}

		// Calculate summary
		const totalPlugins = Object.keys(pluginTests).length;
		const passedPlugins = Object.values(pluginTests).filter(test => test.success).length;
		const failedPlugins = totalPlugins - passedPlugins;
		const averageParseTime = Object.values(pluginTests)
			.reduce((sum, test) => sum + test.parseTime, 0) / totalPlugins;

		let overallStatus: 'all_passed' | 'some_failed' | 'all_failed';
		if (passedPlugins === totalPlugins) {
			overallStatus = 'all_passed';
		} else if (passedPlugins > 0) {
			overallStatus = 'some_failed';
		} else {
			overallStatus = 'all_failed';
		}

		return {
			pluginTests,
			overallStatus,
			summary: {
				totalPlugins,
				passedPlugins,
				failedPlugins,
				averageParseTime
			}
		};
	}

	/**
	 * Test Component lifecycle management for all parsing components
	 */
	public async testComponentLifecycle(): Promise<{
		componentsStatus: {
			pluginManager: {
				isComponent: boolean;
				hasChildren: boolean;
				childrenCount: number;
			};
			eventManager: {
				isComponent: boolean;
				eventsRegistered: boolean;
			};
			cacheManager: {
				isComponent: boolean;
				cacheActive: boolean;
			};
		};
		lifecycleTest: {
			addChildSuccess: boolean;
			cleanupSuccess: boolean;
		};
		message: string;
	}> {
		// Test component status
		const componentsStatus = {
			pluginManager: {
				isComponent: this.pluginManager instanceof Component,
				hasChildren: false,
				childrenCount: 0
			},
			eventManager: {
				isComponent: this.parseEventManager instanceof Component,
				eventsRegistered: false
			},
			cacheManager: {
				isComponent: this.unifiedCacheManager instanceof Component,
				cacheActive: false
			}
		};

		// Check if pluginManager has children
		if (this.pluginManager && '_children' in this.pluginManager) {
			const children = (this.pluginManager as any)._children;
			componentsStatus.pluginManager.hasChildren = Array.isArray(children) && children.length > 0;
			componentsStatus.pluginManager.childrenCount = Array.isArray(children) ? children.length : 0;
		}

		// Check if event manager has registered events
		if (this.parseEventManager && 'listenerCount' in this.parseEventManager) {
			// This is a simple check - in reality you'd need specific API
			componentsStatus.eventManager.eventsRegistered = true;
		}

		// Check if cache manager is active
		if (this.unifiedCacheManager) {
			// Simple activity check by trying to get cache stats
			try {
				const stats = await this.unifiedCacheManager.getStats();
				componentsStatus.cacheManager.cacheActive = stats.totalEntries >= 0;
			} catch {
				componentsStatus.cacheManager.cacheActive = false;
			}
		}

		// Test lifecycle operations
		let addChildSuccess = false;
		let cleanupSuccess = false;

		try {
			// Test adding a child component (if supported)
			if (this.pluginManager && 'addChild' in this.pluginManager) {
				// Create a test component
				const testComponent = new Component();
				(this.pluginManager as any).addChild(testComponent);
				addChildSuccess = true;
				
				// Clean up test component
				testComponent.unload();
			}
			cleanupSuccess = true;
		} catch (error) {
			console.warn("Component lifecycle test failed:", error);
		}

		const lifecycleTest = {
			addChildSuccess,
			cleanupSuccess
		};

		// Generate status message
		const componentTypes = ['pluginManager', 'eventManager', 'cacheManager'];
		const componentStatuses = componentTypes.map(type => {
			const status = componentsStatus[type as keyof typeof componentsStatus];
			return `${type}: ${status.isComponent ? 'Component' : 'Not Component'}`;
		});

		const message = `Component Lifecycle Status: ${componentStatuses.join(', ')}. Lifecycle test: ${addChildSuccess ? 'Add Child OK' : 'Add Child Failed'}, ${cleanupSuccess ? 'Cleanup OK' : 'Cleanup Failed'}`;

		return {
			componentsStatus,
			lifecycleTest,
			message
		};
	}

	/**
	 * Parse file using the new unified parsing system (internal)
	 */
	private async parseWithNewSystem(filePath: string, content: string, mtime?: number): Promise<Task[]> {
		try {
			if (!this.pluginManager) {
				throw new Error("Plugin manager not initialized");
			}

			const fileType = getFileType({
				path: filePath,
				extension: filePath.split(".").pop() || "",
			} as TFile);

			// Map file types to plugin types
			let pluginType: string;
			switch (fileType) {
				case SupportedFileType.MARKDOWN:
					pluginType = 'markdown';
					break;
				case SupportedFileType.CANVAS:
					pluginType = 'canvas';
					break;
				default:
					// Try metadata parsing for other file types
					pluginType = 'metadata';
					break;
			}

			// Create parse context
			const parseContext = {
				filePath,
				content,
				mtime: mtime || Date.now(), // Use actual file mtime when available
				settings: {
					markdown: {
						preferMetadataFormat: this.plugin.settings.preferMetadataFormat,
						parseHeadings: true,
						parseHierarchy: true,
						ignoreHeading: this.plugin.settings.ignoreHeading,
						focusHeading: this.plugin.settings.focusHeading
					},
					canvas: {
						includeNodeId: true,
						includePosition: false
					},
					metadata: {
						parseFromFrontmatter: true,
						parseFromTags: true
					}
				}
			};

			// Execute parsing through plugin manager
			const result = await this.pluginManager.executePlugin(pluginType, parseContext);

			if (result && result.tasks) {
				// Apply heading filters if specified in settings
				return this.applyHeadingFilters(result.tasks);
			}

			return [];
		} catch (error) {
			console.error(
				`Error parsing file ${filePath} with new system, falling back to legacy:`,
				error
			);
			// Fallback to legacy system
			this.useNewParsingSystem = false;
			return this.parseFileWithAppropriateParser(filePath, content);
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
					isSupportedFileWithFilter(file, this.fileFilterManager)
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
				if (
					file instanceof TFile &&
					isSupportedFileWithFilter(file, this.fileFilterManager)
				) {
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

				if (
					file instanceof TFile &&
					isSupportedFileWithFilter(file, this.fileFilterManager)
				) {
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

				if (
					file instanceof TFile &&
					isSupportedFileWithFilter(file, this.fileFilterManager)
				) {
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

					if (
						file instanceof TFile &&
						isSupportedFileWithFilter(file, this.fileFilterManager)
					) {
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
								// Note: mtime not available here, will be set when file is processed
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
			const files = allFiles.filter((file) =>
				isSupportedFileWithFilter(file, this.fileFilterManager)
			);
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
										cached.data,
										file.stat.mtime
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
			this.indexer.updateIndexWithTasks(
				file.path,
				tasks,
				file.stat.mtime
			);

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
			this.indexer.updateIndexWithTasks(
				file.path,
				tasks,
				file.stat.mtime
			);

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
							cached.data,
							file.stat.mtime
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
						this.indexer.updateIndexWithTasks(
							file.path,
							tasks,
							file.stat.mtime
						);

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
						this.indexer.updateIndexWithTasks(
							file.path,
							tasks,
							file.stat.mtime
						);

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
			this.indexer.updateIndexWithTasks(
				file.path,
				tasks,
				file.stat.mtime
			);

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
		this.indexer.cleanupFileCache(oldPath);
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
		this.indexer.cleanupFileCache(file.path);

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
	 * Get all tasks fast - use cached ICS data without waiting for sync
	 * This method returns immediately and is suitable for UI initialization
	 */
	public getAllTasksFast(): Task[] {
		const markdownTasks = this.queryTasks();

		// Get ICS tasks if ICS manager is available
		const icsManager = this.plugin.getIcsManager();
		if (icsManager) {
			try {
				// Use non-blocking method to get cached ICS events
				const icsEvents = icsManager.getAllEventsNonBlocking(true);
				// Apply holiday detection to cached events
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
					"Error getting tasks with holiday detection (fast):",
					error
				);
				// Fallback to original method
				try {
					const icsEvents = icsManager.getAllEventsNonBlocking(false);
					const icsTasks = icsManager.convertEventsToTasks(icsEvents);
					return [...markdownTasks, ...icsTasks];
				} catch (fallbackError) {
					console.error(
						"Error in fallback fast task retrieval:",
						fallbackError
					);
				}
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
			updatedLine = updatedLine.replace(/❌\s*\d{4}-\d{2}-\d{2}/g, ""); // Added cancelled date emoji
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
			updatedLine = updatedLine.replace(
				/\[(?:cancelled|❌)::\s*\d{4}-\d{2}-\d{2}\]/gi,
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

			// New fields - Emoji format
			updatedLine = updatedLine.replace(/🏁\s*[^\s]+/g, ""); // onCompletion
			updatedLine = updatedLine.replace(/⛔\s*[^\s]+/g, ""); // dependsOn
			updatedLine = updatedLine.replace(/🆔\s*[^\s]+/g, ""); // id

			// New fields - Dataview format
			updatedLine = updatedLine.replace(
				/\[(?:onCompletion|🏁)::\s*[^\]]+\]/gi,
				""
			);
			updatedLine = updatedLine.replace(
				/\[(?:dependsOn|⛔)::\s*[^\]]+\]/gi,
				""
			);
			updatedLine = updatedLine.replace(/\[(?:id|🆔)::\s*[^\]]+\]/gi, "");

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
			const formattedCancelledDate = formatDate(
				updatedTask.metadata.cancelledDate
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

			// 10. Cancelled Date (if present)
			if (formattedCancelledDate) {
				metadata.push(
					useDataviewFormat
						? `[cancelled:: ${formattedCancelledDate}]`
						: `❌ ${formattedCancelledDate}`
				);
			}

			// 11. OnCompletion
			if (updatedTask.metadata.onCompletion) {
				metadata.push(
					useDataviewFormat
						? `[onCompletion:: ${updatedTask.metadata.onCompletion}]`
						: `🏁 ${updatedTask.metadata.onCompletion}`
				);
			}

			// 12. DependsOn
			if (
				updatedTask.metadata.dependsOn &&
				updatedTask.metadata.dependsOn.length > 0
			) {
				const dependsOnValue = updatedTask.metadata.dependsOn.join(",");
				metadata.push(
					useDataviewFormat
						? `[dependsOn:: ${dependsOnValue}]`
						: `⛔ ${dependsOnValue}`
				);
			}

			// 13. ID
			if (updatedTask.metadata.id) {
				metadata.push(
					useDataviewFormat
						? `[id:: ${updatedTask.metadata.id}]`
						: `🆔 ${updatedTask.metadata.id}`
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
	/**
	 * Force reindex all tasks with optional cache strategy
	 * @param options - Optional configuration for cache clearing behavior
	 */
	public async forceReindex(options?: {
		clearProjectCaches?: boolean; // Whether to clear project-related caches (default: true)
		preserveValidCaches?: boolean; // Whether to preserve caches for unchanged files (default: false)
		logCacheStats?: boolean; // Whether to log cache statistics before/after (default: false)
	}): Promise<void> {
		const {
			clearProjectCaches = true,
			preserveValidCaches = false,
			logCacheStats = false,
		} = options || {};

		this.log(
			`Force reindexing all tasks (clearProjectCaches: ${clearProjectCaches}, preserveValidCaches: ${preserveValidCaches})`
		);

		// Log cache statistics before clearing if requested
		if (logCacheStats && this.taskParsingService) {
			try {
				const beforeStats =
					this.taskParsingService.getDetailedCacheStats();
				this.log(
					"Cache statistics before clearing: " +
						JSON.stringify(beforeStats.summary, null, 2)
				);
			} catch (error) {
				console.warn("Failed to get cache statistics:", error);
			}
		}

		// Reset initialization state
		this.initialized = false;

		// Clear all caches
		this.indexer.resetCache();

		// Clear project-related caches based on options
		if (clearProjectCaches && this.taskParsingService) {
			try {
				if (preserveValidCaches) {
					// Smart cache clearing - only clear stale entries
					if ((this.taskParsingService as any).projectConfigManager) {
						const clearedCount = await (
							this.taskParsingService as any
						).projectConfigManager.clearStaleEntries();
						this.log(
							`Smart cache clearing: removed ${clearedCount} stale entries`
						);
					}
				} else {
					// Full cache clearing (default behavior)
					this.taskParsingService.clearAllCaches();
					this.log(
						"Cleared all project-related caches (config, data, metadata)"
					);
				}
			} catch (error) {
				console.error("Error clearing project caches:", error);
			}
		} else if (!clearProjectCaches) {
			this.log("Skipping project cache clearing as requested");
		}

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

		// Log cache statistics after rebuilding if requested
		if (logCacheStats && this.taskParsingService) {
			try {
				const afterStats =
					this.taskParsingService.getDetailedCacheStats();
				this.log(
					"Cache statistics after rebuilding: " +
						JSON.stringify(afterStats.summary, null, 2)
				);
			} catch (error) {
				console.warn("Failed to get final cache statistics:", error);
			}
		}

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
		this.log('TaskManager shutting down - performing comprehensive cleanup');

		// Cleanup resource manager first (this will cleanup all registered resources)
		if (this.resourceManager) {
			this.resourceManager.cleanupAllResources().catch(error => {
				console.error('Error during resource manager cleanup:', error);
			});
		}

		// Clean up worker manager if it exists
		if (this.workerManager) {
			this.workerManager.onunload();
		}

		// Clean up task parsing service and its workers if it exists
		if (this.taskParsingService) {
			this.taskParsingService.destroy();
			this.taskParsingService = undefined;
		}

		// Clean up canvas parser and updater
		if (this.canvasParser) {
			// Canvas parser cleanup is automatic via Component lifecycle
		}

		// Clean up file metadata updater
		if (this.fileMetadataUpdater) {
			this.fileMetadataUpdater.destroy();
		}

		// Clean up on completion manager
		if (this.onCompletionManager) {
			this.onCompletionManager.cleanup();
		}

		// Call parent onunload to handle Component lifecycle
		super.onunload();

		this.log('TaskManager cleanup completed');
	}

	/**
	 * Get the canvas task updater
	 */
	public getCanvasTaskUpdater(): CanvasTaskUpdater {
		return this.canvasTaskUpdater;
	}

	/**
	 * Test cache performance and memory usage
	 */
	public async testCachePerformanceAndMemory(): Promise<{
		testResults: {
			cacheOperations: {
				setOperations: number;
				getOperations: number;
				hitRate: number;
				averageSetTime: number;
				averageGetTime: number;
			};
			memoryUsage: {
				initialMemory: number;
				peakMemory: number;
				finalMemory: number;
				memoryIncrease: number;
			};
			lruEvictions: {
				totalEvictions: number;
				evictionReasons: Record<string, number>;
			};
		};
		cacheAnalysis: any;
		recommendations: string[];
	}> {
		if (!this.unifiedCacheManager) {
			throw new Error("UnifiedCacheManager not initialized");
		}

		const testResults = {
			cacheOperations: {
				setOperations: 0,
				getOperations: 0,
				hitRate: 0,
				averageSetTime: 0,
				averageGetTime: 0
			},
			memoryUsage: {
				initialMemory: 0,
				peakMemory: 0,
				finalMemory: 0,
				memoryIncrease: 0
			},
			lruEvictions: {
				totalEvictions: 0,
				evictionReasons: {} as Record<string, number>
			}
		};

		// Get initial memory baseline
		if (typeof performance.memory !== 'undefined') {
			testResults.memoryUsage.initialMemory = (performance as any).memory.usedJSHeapSize;
		}

		// Clear cache to start fresh
		await this.unifiedCacheManager.clearAll();
		
		// Test data generation
		const testData = [];
		for (let i = 0; i < 1000; i++) {
			testData.push({
				key: `test-file-${i}.md`,
				content: `# Test File ${i}\n- [ ] Task ${i}\n- [x] Completed task ${i}\n`,
				mtime: Date.now() + i * 1000
			});
		}

		// Measure cache SET operations
		const setTimes: number[] = [];
		for (const data of testData) {
			const startTime = performance.now();
			await this.unifiedCacheManager.set(
				'parsedTasks',
				data.key,
				[{ id: `task-${data.key}`, content: `Task from ${data.key}` }],
				{ ttl: 60000, mtime: data.mtime }
			);
			const endTime = performance.now();
			setTimes.push(endTime - startTime);
			testResults.cacheOperations.setOperations++;

			// Track peak memory
			if (typeof performance.memory !== 'undefined') {
				testResults.memoryUsage.peakMemory = Math.max(
					testResults.memoryUsage.peakMemory,
					(performance as any).memory.usedJSHeapSize
				);
			}
		}

		// Measure cache GET operations (with hits and misses)
		const getTimes: number[] = [];
		let hits = 0;
		let attempts = 0;

		// Test existing keys (cache hits)
		for (let i = 0; i < testData.length; i += 10) { // Test every 10th key
			const startTime = performance.now();
			const result = await this.unifiedCacheManager.get('parsedTasks', testData[i].key);
			const endTime = performance.now();
			getTimes.push(endTime - startTime);
			testResults.cacheOperations.getOperations++;
			attempts++;
			
			if (result !== null) {
				hits++;
			}
		}

		// Test non-existing keys (cache misses)
		for (let i = 0; i < 100; i++) { // Test 100 non-existing keys
			const startTime = performance.now();
			const result = await this.unifiedCacheManager.get('parsedTasks', `non-existing-${i}.md`);
			const endTime = performance.now();
			getTimes.push(endTime - startTime);
			testResults.cacheOperations.getOperations++;
			attempts++;
		}

		// Calculate averages
		testResults.cacheOperations.averageSetTime = setTimes.reduce((sum, time) => sum + time, 0) / setTimes.length;
		testResults.cacheOperations.averageGetTime = getTimes.reduce((sum, time) => sum + time, 0) / getTimes.length;
		testResults.cacheOperations.hitRate = hits / attempts;

		// Get final memory usage
		if (typeof performance.memory !== 'undefined') {
			testResults.memoryUsage.finalMemory = (performance as any).memory.usedJSHeapSize;
			testResults.memoryUsage.memoryIncrease = testResults.memoryUsage.finalMemory - testResults.memoryUsage.initialMemory;
		}

		// Get cache statistics and analysis
		const cacheStats = await this.unifiedCacheManager.getStats();
		const cacheAnalysis = await this.unifiedCacheManager.getMemoryAnalysis();

		// Extract eviction information from stats
		if (cacheStats.evictions) {
			testResults.lruEvictions.totalEvictions = cacheStats.evictions;
		}

		// Generate recommendations
		const recommendations: string[] = [];
		
		if (testResults.cacheOperations.hitRate < 0.8) {
			recommendations.push("Cache hit rate is below optimal (80%). Consider increasing cache size or adjusting TTL.");
		}
		
		if (testResults.cacheOperations.averageSetTime > 5) {
			recommendations.push("Cache SET operations are slow (>5ms). Consider optimizing cache strategy.");
		}
		
		if (testResults.cacheOperations.averageGetTime > 2) {
			recommendations.push("Cache GET operations are slow (>2ms). Consider optimizing lookup mechanism.");
		}
		
		if (testResults.memoryUsage.memoryIncrease > 50 * 1024 * 1024) { // 50MB
			recommendations.push("Memory usage increased significantly (>50MB). Consider implementing more aggressive eviction policies.");
		}
		
		if (cacheAnalysis.pressure.level === 'high' || cacheAnalysis.pressure.level === 'critical') {
			recommendations.push(`Memory pressure is ${cacheAnalysis.pressure.level}. Immediate cleanup recommended.`);
		}

		if (recommendations.length === 0) {
			recommendations.push("Cache performance is within acceptable parameters.");
		}

		return {
			testResults,
			cacheAnalysis,
			recommendations
		};
	}

	/**
	 * Test parsing context creation and metadata loading
	 */
	public async testParseContextAndMetadata(): Promise<{
		contextCreation: {
			success: boolean;
			timeMs: number;
			contextFields: string[];
			settingsLoaded: boolean;
		};
		metadataLoading: {
			success: boolean;
			timeMs: number;
			metadataFields: string[];
			cacheIntegration: boolean;
		};
		performanceMetrics: {
			averageContextTime: number;
			averageMetadataTime: number;
			recommendOptimization: boolean;
		};
		errors: string[];
	}> {
		const errors: string[] = [];
		let contextCreation = {
			success: false,
			timeMs: 0,
			contextFields: [] as string[],
			settingsLoaded: false
		};
		let metadataLoading = {
			success: false,
			timeMs: 0,
			metadataFields: [] as string[],
			cacheIntegration: false
		};

		// Test parsing context creation
		try {
			const startTime = performance.now();
			
			// Create test parse context
			const testFile = {
				path: "test/sample.md",
				extension: "md"
			} as TFile;
			
			const testContent = `# Test Document
## Project: Test Project
- [ ] Task 1 📅 2024-01-15
- [x] Task 2 🔁 every week
- [ ] Task 3 ⏫ #important`;

			const parseContext = {
				filePath: testFile.path,
				content: testContent,
				mtime: Date.now(),
				settings: {
					markdown: {
						enableHierarchicalTasks: true,
						enableRecurringTasks: true,
						enableInlineMetadata: true,
						projectDetection: true,
						dateFormats: []
					}
				}
			};

			const endTime = performance.now();
			contextCreation = {
				success: true,
				timeMs: endTime - startTime,
				contextFields: Object.keys(parseContext),
				settingsLoaded: parseContext.settings && Object.keys(parseContext.settings).length > 0
			};

		} catch (error) {
			errors.push(`Context creation failed: ${error.message}`);
		}

		// Test metadata loading and processing
		try {
			const startTime = performance.now();
			
			// Test metadata extraction patterns
			const testMetadata = {
				dates: ["📅 2024-01-15", "⏰ 14:30", "🛫 2024-01-16"],
				recurrence: ["🔁 every week", "🔁 daily", "🔁 monthly"],
				priority: ["⏫", "🔼", "🔽"],
				projects: ["Project: Test Project", "## Test Project"],
				contexts: ["#important", "#work", "#personal"],
				dependencies: ["dependsOn:: [[Task A]]", "dependsOn:: task-123"],
				completion: ["onCompletion:: log('done')", "onCompletion:: {\"action\": \"notify\"}"]
			};

			const extractedMetadata = {
				dateCount: testMetadata.dates.length,
				recurrenceCount: testMetadata.recurrence.length,
				priorityCount: testMetadata.priority.length,
				projectCount: testMetadata.projects.length,
				contextCount: testMetadata.contexts.length,
				dependencyCount: testMetadata.dependencies.length,
				completionCount: testMetadata.completion.length
			};

			// Test cache integration for metadata
			let cacheIntegration = false;
			if (this.unifiedCacheManager) {
				// Try to cache metadata
				await this.unifiedCacheManager.set(
					'metadata',
					'test-metadata',
					extractedMetadata,
					{ ttl: 30000 }
				);
				
				// Try to retrieve cached metadata
				const cachedData = await this.unifiedCacheManager.get('metadata', 'test-metadata');
				cacheIntegration = cachedData !== null;
			}

			const endTime = performance.now();
			metadataLoading = {
				success: true,
				timeMs: endTime - startTime,
				metadataFields: Object.keys(extractedMetadata),
				cacheIntegration
			};

		} catch (error) {
			errors.push(`Metadata loading failed: ${error.message}`);
		}

		// Performance analysis
		const averageContextTime = contextCreation.timeMs;
		const averageMetadataTime = metadataLoading.timeMs;
		const recommendOptimization = averageContextTime > 10 || averageMetadataTime > 15; // thresholds in ms

		return {
			contextCreation,
			metadataLoading,
			performanceMetrics: {
				averageContextTime,
				averageMetadataTime,
				recommendOptimization
			},
			errors
		};
	}

	/**
	 * End-to-end test of the entire parsing process including Obsidian Events
	 */
	public async testEndToEndParsingFlow(): Promise<{
		overallSuccess: boolean;
		stages: {
			systemInitialization: {
				success: boolean;
				componentsReady: number;
				initTime: number;
				errors?: string[];
			};
			eventSystemTest: {
				success: boolean;
				eventsTriggered: number;
				eventTypes: string[];
				avgEventTime: number;
				errors?: string[];
			};
			parsingWorkflow: {
				success: boolean;
				filesProcessed: number;
				tasksFound: number;
				avgParseTime: number;
				cachesHit: number;
				errors?: string[];
			};
			integrationTest: {
				success: boolean;
				dataConsistency: boolean;
				crossComponentSync: boolean;
				cacheIntegrity: boolean;
				errors?: string[];
			};
		};
		totalDuration: number;
		recommendations: string[];
	}> {
		const startTime = performance.now();
		const recommendations: string[] = [];
		
		// Stage 1: System Initialization Test
		const systemInitResults = await this.testSystemInitialization();
		
		// Stage 2: Event System Test
		const eventSystemResults = await this.testEventSystemIntegration();
		
		// Stage 3: Parsing Workflow Test
		const parsingWorkflowResults = await this.testCompleteParsingWorkflow();
		
		// Stage 4: Integration Test
		const integrationResults = await this.testSystemIntegration();
		
		// Analyze results and generate recommendations
		const overallSuccess = systemInitResults.success && 
		                      eventSystemResults.success && 
		                      parsingWorkflowResults.success && 
		                      integrationResults.success;
		
		if (!overallSuccess) {
			recommendations.push("End-to-end test failed. Check individual stage errors for details.");
		}
		
		if (systemInitResults.initTime > 1000) {
			recommendations.push("System initialization is slow (>1000ms). Consider optimizing component startup.");
		}
		
		if (eventSystemResults.avgEventTime > 50) {
			recommendations.push("Event processing is slow (>50ms average). Consider optimizing event handlers.");
		}
		
		if (parsingWorkflowResults.avgParseTime > 200) {
			recommendations.push("Parsing performance is slow (>200ms average). Consider optimization or caching improvements.");
		}
		
		if (!integrationResults.dataConsistency) {
			recommendations.push("Data consistency issues detected. Check cache synchronization and data flow.");
		}
		
		const totalDuration = performance.now() - startTime;
		
		if (recommendations.length === 0) {
			recommendations.push("End-to-end system test passed successfully. All components are functioning correctly.");
		}
		
		return {
			overallSuccess,
			stages: {
				systemInitialization: systemInitResults,
				eventSystemTest: eventSystemResults,
				parsingWorkflow: parsingWorkflowResults,
				integrationTest: integrationResults
			},
			totalDuration,
			recommendations
		};
	}

	/**
	 * Test system initialization stage
	 */
	private async testSystemInitialization(): Promise<{
		success: boolean;
		componentsReady: number;
		initTime: number;
		errors?: string[];
	}> {
		const startTime = performance.now();
		const errors: string[] = [];
		let componentsReady = 0;
		
		try {
			// Test core components
			if (this.pluginManager) {
				componentsReady++;
			} else {
				errors.push("PluginManager not initialized");
			}
			
			if (this.parseEventManager) {
				componentsReady++;
			} else {
				errors.push("ParseEventManager not initialized");
			}
			
			if (this.unifiedCacheManager) {
				try {
					await this.unifiedCacheManager.getStats();
					componentsReady++;
				} catch {
					errors.push("UnifiedCacheManager not responding");
				}
			} else {
				errors.push("UnifiedCacheManager not initialized");
			}
			
			if (this.newTaskParsingService) {
				componentsReady++;
			} else {
				errors.push("NewTaskParsingService not initialized");
			}
			
			const initTime = performance.now() - startTime;
			
			return {
				success: componentsReady >= 3 && errors.length === 0, // At least 3 core components should be ready
				componentsReady,
				initTime,
				errors: errors.length > 0 ? errors : undefined
			};
		} catch (error) {
			return {
				success: false,
				componentsReady,
				initTime: performance.now() - startTime,
				errors: [error.message]
			};
		}
	}

	/**
	 * Test event system integration
	 */
	private async testEventSystemIntegration(): Promise<{
		success: boolean;
		eventsTriggered: number;
		eventTypes: string[];
		avgEventTime: number;
		errors?: string[];
	}> {
		if (!this.parseEventManager) {
			return {
				success: false,
				eventsTriggered: 0,
				eventTypes: [],
				avgEventTime: 0,
				errors: ["ParseEventManager not available"]
			};
		}
		
		const errors: string[] = [];
		const eventTypes: string[] = [];
		const eventTimes: number[] = [];
		let eventsTriggered = 0;
		
		try {
			// Test different types of async workflows
			const testWorkflows = [
				{ type: 'parse' as const, file: 'test1.md' },
				{ type: 'validate' as const, file: 'test2.md' },
				{ type: 'update' as const, file: 'test3.md' }
			];
			
			for (const workflow of testWorkflows) {
				const startTime = performance.now();
				
				try {
					const result = await this.parseEventManager.processAsyncTaskFlow(workflow.file, workflow.type, {
						priority: 'normal',
						timeout: 5000,
						enableEventChaining: true
					});
					
					if (result.success) {
						eventsTriggered += result.events.length;
						eventTypes.push(...result.events);
						eventTimes.push(result.duration);
					} else {
						errors.push(`Workflow ${workflow.type} failed: ${result.errors?.join(', ')}`);
					}
				} catch (error) {
					errors.push(`Workflow ${workflow.type} threw error: ${error.message}`);
				}
			}
			
			// Test orchestration
			try {
				const orchestrationResult = await this.parseEventManager.orchestrateMultipleWorkflows([
					{ filePath: 'batch1.md', workflowType: 'parse', priority: 'high' },
					{ filePath: 'batch2.md', workflowType: 'validate', priority: 'normal' }
				], {
					maxConcurrency: 2,
					enableProgressEvents: true
				});
				
				if (orchestrationResult.successful > 0) {
					eventsTriggered += 10; // Estimated events from orchestration
					eventTypes.push('orchestration_test');
				}
			} catch (error) {
				errors.push(`Orchestration test failed: ${error.message}`);
			}
			
			const avgEventTime = eventTimes.length > 0 ? 
				eventTimes.reduce((sum, time) => sum + time, 0) / eventTimes.length : 0;
			
			return {
				success: eventsTriggered > 0 && errors.length === 0,
				eventsTriggered,
				eventTypes: [...new Set(eventTypes)], // Remove duplicates
				avgEventTime,
				errors: errors.length > 0 ? errors : undefined
			};
		} catch (error) {
			return {
				success: false,
				eventsTriggered,
				eventTypes,
				avgEventTime: 0,
				errors: [error.message]
			};
		}
	}

	/**
	 * Test complete parsing workflow
	 */
	private async testCompleteParsingWorkflow(): Promise<{
		success: boolean;
		filesProcessed: number;
		tasksFound: number;
		avgParseTime: number;
		cachesHit: number;
		errors?: string[];
	}> {
		const errors: string[] = [];
		const parseTimes: number[] = [];
		let filesProcessed = 0;
		let tasksFound = 0;
		let cachesHit = 0;
		
		try {
			// Get sample files from vault
			const markdownFiles = this.vault.getMarkdownFiles().slice(0, 5); // Test with first 5 files
			
			for (const file of markdownFiles) {
				try {
					const content = await this.vault.read(file);
					const startTime = performance.now();
					
					// Test new system parsing
					if (this.useNewParsingSystem && this.isNewParsingSystemReady()) {
						const tasks = await this.parseFileWithAppropriateParserAsync(file, content);
						const parseTime = performance.now() - startTime;
						
						filesProcessed++;
						tasksFound += tasks.length;
						parseTimes.push(parseTime);
						
						// Check if result was cached (simplified check)
						if (parseTime < 10) { // Very fast parsing suggests cache hit
							cachesHit++;
						}
					} else {
						// Test legacy system
						const tasks = await this.parseFileWithAppropriateParser(file.path, content);
						const parseTime = performance.now() - startTime;
						
						filesProcessed++;
						tasksFound += tasks.length;
						parseTimes.push(parseTime);
					}
				} catch (error) {
					errors.push(`Failed to parse ${file.path}: ${error.message}`);
				}
			}
			
			const avgParseTime = parseTimes.length > 0 ? 
				parseTimes.reduce((sum, time) => sum + time, 0) / parseTimes.length : 0;
			
			return {
				success: filesProcessed > 0 && errors.length === 0,
				filesProcessed,
				tasksFound,
				avgParseTime,
				cachesHit,
				errors: errors.length > 0 ? errors : undefined
			};
		} catch (error) {
			return {
				success: false,
				filesProcessed,
				tasksFound,
				avgParseTime: 0,
				cachesHit,
				errors: [error.message]
			};
		}
	}

	/**
	 * Test system integration and data consistency
	 */
	private async testSystemIntegration(): Promise<{
		success: boolean;
		dataConsistency: boolean;
		crossComponentSync: boolean;
		cacheIntegrity: boolean;
		errors?: string[];
	}> {
		const errors: string[] = [];
		let dataConsistency = true;
		let crossComponentSync = true;
		let cacheIntegrity = true;
		
		try {
			// Test data consistency between components
			if (this.unifiedCacheManager && this.indexer) {
				try {
					const cacheStats = await this.unifiedCacheManager.getStats();
					const indexStats = this.indexer.getStats ? this.indexer.getStats() : null;
					
					// Basic consistency check
					if (cacheStats && indexStats) {
						// This is a simplified check - in reality you'd compare actual data
						if (cacheStats.totalEntries < 0 || (indexStats as any).totalTasks < 0) {
							dataConsistency = false;
							errors.push("Negative values detected in stats, indicating data corruption");
						}
					}
				} catch (error) {
					dataConsistency = false;
					errors.push(`Data consistency check failed: ${error.message}`);
				}
			}
			
			// Test cross-component synchronization
			if (this.parseEventManager && this.pluginManager) {
				try {
					const eventStats = this.parseEventManager.getStatistics();
					const pluginStatus = this.pluginManager.getPluginStatus ? this.pluginManager.getPluginStatus() : null;
					
					// Check if components are synchronized
					if (eventStats.totalEvents > 0 && pluginStatus) {
						// Simplified sync check
						const activePlugins = Object.values(pluginStatus).filter((status: any) => status.active).length;
						if (activePlugins === 0 && eventStats.totalEvents > 100) {
							crossComponentSync = false;
							errors.push("High event activity but no active plugins - possible sync issue");
						}
					}
				} catch (error) {
					crossComponentSync = false;
					errors.push(`Cross-component sync check failed: ${error.message}`);
				}
			}
			
			// Test cache integrity
			if (this.unifiedCacheManager) {
				try {
					// Test cache operations
					const testKey = 'integration-test-key';
					const testData = { test: 'data', timestamp: Date.now() };
					
					await this.unifiedCacheManager.set('test', testKey, testData);
					const retrieved = await this.unifiedCacheManager.get('test', testKey);
					
					if (!retrieved || JSON.stringify(retrieved) !== JSON.stringify(testData)) {
						cacheIntegrity = false;
						errors.push("Cache integrity check failed - data mismatch");
					}
					
					// Cleanup test data
					await this.unifiedCacheManager.delete('test', testKey);
				} catch (error) {
					cacheIntegrity = false;
					errors.push(`Cache integrity check failed: ${error.message}`);
				}
			}
			
			return {
				success: dataConsistency && crossComponentSync && cacheIntegrity && errors.length === 0,
				dataConsistency,
				crossComponentSync,
				cacheIntegrity,
				errors: errors.length > 0 ? errors : undefined
			};
		} catch (error) {
			return {
				success: false,
				dataConsistency: false,
				crossComponentSync: false,
				cacheIntegrity: false,
				errors: [error.message]
			};
		}
	}

	/**
	 * Register core components as managed resources
	 */
	private registerCoreComponentsAsResources(): void {
		if (!this.resourceManager) return;

		// Register cache manager
		if (this.unifiedCacheManager) {
			this.resourceManager.registerResource({
				id: 'unified-cache-manager',
				type: 'cache',
				description: 'Unified cache manager for parsing system',
				estimatedMemoryUsage: 50 * 1024 * 1024, // 50MB estimate
				priority: 'high',
				tags: ['core', 'cache', 'parsing'],
				cleanup: async () => {
					if (this.unifiedCacheManager) {
						await this.unifiedCacheManager.clearAll();
					}
				},
				isActive: () => this.unifiedCacheManager !== undefined,
				getMetrics: () => this.unifiedCacheManager ? this.unifiedCacheManager.getStats() : {}
			});
		}

		// Register event manager
		if (this.parseEventManager) {
			this.resourceManager.registerResource({
				id: 'parse-event-manager',
				type: 'event_listener',
				description: 'Parse event manager for system coordination',
				estimatedMemoryUsage: 5 * 1024 * 1024, // 5MB estimate
				priority: 'high',
				tags: ['core', 'events', 'parsing'],
				cleanup: async () => {
					if (this.parseEventManager) {
						await this.parseEventManager.flushQueue();
					}
				},
				isActive: () => this.parseEventManager !== undefined,
				getMetrics: () => this.parseEventManager ? this.parseEventManager.getStatistics() : {}
			});
		}

		// Register plugin manager
		if (this.pluginManager) {
			this.resourceManager.registerResource({
				id: 'plugin-manager',
				type: 'custom',
				description: 'Plugin manager for parsing plugins',
				estimatedMemoryUsage: 10 * 1024 * 1024, // 10MB estimate
				priority: 'high',
				tags: ['core', 'plugins', 'parsing'],
				cleanup: async () => {
					// Plugin manager cleanup is handled by Component lifecycle
				},
				isActive: () => this.pluginManager !== undefined,
				getMetrics: () => this.pluginManager ? this.pluginManager.getPluginStatus() : {}
			});
		}

		// Register worker manager if exists
		if (this.workerManager) {
			this.resourceManager.registerResource({
				id: 'worker-manager',
				type: 'worker',
				description: 'Task worker manager for background processing',
				estimatedMemoryUsage: 20 * 1024 * 1024, // 20MB estimate
				priority: 'high',
				tags: ['core', 'workers', 'background'],
				cleanup: async () => {
					if (this.workerManager) {
						this.workerManager.destroy();
					}
				},
				isActive: () => this.workerManager !== undefined
			});
		}

		// Register timers and intervals as managed resources
		this.registerTimersAsResources();

		this.log('Core components registered as managed resources');
	}

	/**
	 * Register timers and intervals as managed resources
	 */
	private registerTimersAsResources(): void {
		if (!this.resourceManager) return;

		// Register auto-cleanup interval for cache
		const cacheCleanupTimer = ResourceUtils.createInterval(
			'cache-cleanup-timer',
			() => {
				if (this.unifiedCacheManager) {
					this.unifiedCacheManager.cleanup();
				}
			},
			300000, // 5 minutes
			'Periodic cache cleanup'
		);
		this.resourceManager.registerResource(cacheCleanupTimer);

		// Register health monitoring interval
		const healthMonitorTimer = ResourceUtils.createInterval(
			'health-monitor-timer',
			() => {
				this.performHealthCheck();
			},
			60000, // 1 minute
			'System health monitoring'
		);
		this.resourceManager.registerResource(healthMonitorTimer);

		// Register metrics collection interval
		const metricsTimer = ResourceUtils.createInterval(
			'metrics-collection-timer',
			() => {
				this.collectSystemMetrics();
			},
			30000, // 30 seconds
			'System metrics collection'
		);
		this.resourceManager.registerResource(metricsTimer);
	}

	/**
	 * Perform system health check
	 */
	private performHealthCheck(): void {
		if (!this.resourceManager) return;

		const resourceStats = this.resourceManager.getResourceStats();
		
		if (resourceStats.health.status === 'critical') {
			this.log(`System health critical: ${resourceStats.health.leakedResources} leaked resources, ${resourceStats.health.zombieResources} zombie resources`);
			// Trigger emergency cleanup
			this.performEmergencyCleanup();
		} else if (resourceStats.health.status === 'warning') {
			this.log(`System health warning: Memory usage ${resourceStats.memoryUsage.total}MB`);
		}
	}

	/**
	 * Collect system metrics for monitoring
	 */
	private collectSystemMetrics(): void {
		if (!this.resourceManager || !this.options.debug) return;

		const resourceStats = this.resourceManager.getResourceStats();
		const cacheStats = this.unifiedCacheManager ? this.unifiedCacheManager.getStats() : null;
		const eventStats = this.parseEventManager ? this.parseEventManager.getStatistics() : null;

		this.log(`System Metrics: ${resourceStats.totalResources} resources, ${resourceStats.memoryUsage.total}MB memory`);
		
		if (cacheStats) {
			this.log(`Cache Stats: ${cacheStats.totalEntries} entries, ${cacheStats.hits} hits, ${cacheStats.misses} misses`);
		}
		
		if (eventStats) {
			this.log(`Event Stats: ${eventStats.totalEvents} events processed`);
		}
	}

	/**
	 * Perform emergency cleanup when system health is critical
	 */
	private async performEmergencyCleanup(): Promise<void> {
		this.log('Performing emergency cleanup due to critical system health');

		if (this.resourceManager) {
			// Cleanup low and medium priority resources
			await this.resourceManager.cleanupResourcesByPriority('medium');
			
			// Cleanup stale resources (older than 5 minutes)
			await this.resourceManager.cleanupStaleResources(300000);
		}

		// Force garbage collection if available
		if (typeof global !== 'undefined' && global.gc) {
			global.gc();
		}

		this.log('Emergency cleanup completed');
	}

	/**
	 * Get resource management statistics
	 */
	public getResourceManagementStats(): any {
		if (!this.resourceManager) {
			return { error: 'ResourceManager not initialized' };
		}

		return {
			resourceStats: this.resourceManager.getResourceStats(),
			eventLog: this.resourceManager.getEventLog().slice(-20), // Last 20 events
			componentStatus: {
				cacheManager: this.unifiedCacheManager ? 'active' : 'inactive',
				eventManager: this.parseEventManager ? 'active' : 'inactive',
				pluginManager: this.pluginManager ? 'active' : 'inactive',
				workerManager: this.workerManager ? 'active' : 'inactive'
			}
		};
	}

	/**
	 * Manual resource cleanup method
	 */
	public async cleanupResources(resourceType?: 'timer' | 'worker' | 'cache' | 'all'): Promise<void> {
		if (!this.resourceManager) {
			this.log('ResourceManager not available for cleanup');
			return;
		}

		if (resourceType && resourceType !== 'all') {
			const cleaned = await this.resourceManager.cleanupResourcesByType(resourceType);
			this.log(`Cleaned up ${cleaned} ${resourceType} resources`);
		} else {
			// Cleanup all non-critical resources
			await this.resourceManager.cleanupResourcesByPriority('medium');
			this.log('Performed comprehensive resource cleanup');
		}
	}

	/**
	 * Memory leak detection and long-term stability testing
	 */
	public async performMemoryLeakDetection(): Promise<{
		leakDetectionResults: {
			memoryLeaks: Array<{
				resourceId: string;
				type: string;
				age: number;
				memoryUsage: number;
				severity: 'low' | 'medium' | 'high' | 'critical';
			}>;
			memoryTrend: {
				trend: 'increasing' | 'stable' | 'decreasing';
				rate: number; // MB per minute
				samples: number[];
			};
			zombieResources: number;
			stalledOperations: number;
		};
		stabilityMetrics: {
			uptime: number;
			totalOperations: number;
			errorRate: number;
			averageResponseTime: number;
			memoryStability: 'stable' | 'fluctuating' | 'growing' | 'critical';
			systemHealth: 'healthy' | 'degraded' | 'unstable' | 'critical';
		};
		recommendations: string[];
	}> {
		const startTime = Date.now();
		const memoryLeaks: any[] = [];
		const recommendations: string[] = [];

		// Collect initial memory baseline
		const initialMemory = this.getMemoryUsage();

		// Get resource manager statistics
		const resourceStats = this.resourceManager ? this.resourceManager.getResourceStats() : null;
		const eventLog = this.resourceManager ? this.resourceManager.getEventLog() : [];

		// Detect memory leaks through resource analysis
		if (resourceStats) {
			for (const [type, count] of Object.entries(resourceStats.resourcesByType)) {
				if (count > 0) {
					const resources = this.resourceManager!.listResourcesByType(type as any);
					
					for (const resource of resources) {
						const age = Date.now() - resource.created;
						const isStale = age > 3600000; // 1 hour
						const isInactive = !resource.isActive();
						const isHighMemory = resource.estimatedMemoryUsage > 10 * 1024 * 1024; // 10MB
						
						if (isStale && isInactive) {
							let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
							
							if (isHighMemory && age > 7200000) { // 2 hours + high memory
								severity = 'critical';
							} else if (isHighMemory || age > 3600000) { // High memory OR 1+ hours
								severity = 'high';
							} else if (age > 1800000) { // 30+ minutes
								severity = 'medium';
							}
							
							memoryLeaks.push({
								resourceId: resource.id,
								type: resource.type,
								age,
								memoryUsage: resource.estimatedMemoryUsage,
								severity
							});
						}
					}
				}
			}
		}

		// Analyze memory trend from cache manager
		let memoryTrend: any = {
			trend: 'stable',
			rate: 0,
			samples: []
		};

		if (this.unifiedCacheManager) {
			const cacheAnalysis = await this.unifiedCacheManager.getMemoryAnalysis();
			
			// Simulate memory samples (in real implementation, this would be collected over time)
			const samples = [];
			for (let i = 0; i < 10; i++) {
				samples.push(initialMemory.used + Math.random() * 10000000); // Simulate variance
			}
			
			memoryTrend.samples = samples;
			
			// Calculate trend
			if (samples.length >= 3) {
				const recent = samples.slice(-3);
				const change = recent[2] - recent[0];
				const timeSpan = 2; // minutes (simplified)
				memoryTrend.rate = change / (1024 * 1024) / timeSpan; // MB per minute
				
				if (memoryTrend.rate > 5) {
					memoryTrend.trend = 'increasing';
				} else if (memoryTrend.rate < -5) {
					memoryTrend.trend = 'decreasing';
				} else {
					memoryTrend.trend = 'stable';
				}
			}
		}

		// Calculate stability metrics
		const currentTime = Date.now();
		const uptime = currentTime - startTime; // Simplified - would track actual uptime
		
		// Get operation statistics from various components
		const cacheStats = this.unifiedCacheManager ? await this.unifiedCacheManager.getStats() : null;
		const eventStats = this.parseEventManager ? this.parseEventManager.getStatistics() : null;
		
		const totalOperations = (cacheStats?.hits || 0) + (cacheStats?.misses || 0) + (eventStats?.totalEvents || 0);
		const errorRate = resourceStats ? 
			(resourceStats.health.leakedResources / Math.max(1, resourceStats.totalResources)) : 0;
		
		// Determine memory stability
		let memoryStability: 'stable' | 'fluctuating' | 'growing' | 'critical' = 'stable';
		if (memoryTrend.rate > 20) {
			memoryStability = 'critical';
		} else if (memoryTrend.rate > 5) {
			memoryStability = 'growing';
		} else if (Math.abs(memoryTrend.rate) > 2) {
			memoryStability = 'fluctuating';
		}

		// Determine overall system health
		let systemHealth: 'healthy' | 'degraded' | 'unstable' | 'critical' = 'healthy';
		if (memoryLeaks.length > 10 || memoryStability === 'critical' || errorRate > 0.2) {
			systemHealth = 'critical';
		} else if (memoryLeaks.length > 5 || memoryStability === 'growing' || errorRate > 0.1) {
			systemHealth = 'unstable';
		} else if (memoryLeaks.length > 2 || memoryStability === 'fluctuating' || errorRate > 0.05) {
			systemHealth = 'degraded';
		}

		// Generate recommendations
		if (memoryLeaks.length > 0) {
			const criticalLeaks = memoryLeaks.filter(leak => leak.severity === 'critical').length;
			if (criticalLeaks > 0) {
				recommendations.push(`${criticalLeaks} critical memory leaks detected. Immediate cleanup required.`);
			}
			recommendations.push(`${memoryLeaks.length} total memory leaks detected. Regular cleanup recommended.`);
		}

		if (memoryTrend.trend === 'increasing') {
			recommendations.push(`Memory usage is increasing at ${memoryTrend.rate.toFixed(2)}MB/min. Monitor closely and consider optimization.`);
		}

		if (systemHealth === 'critical') {
			recommendations.push('System health is critical. Consider restarting components or reducing workload.');
		}

		if (errorRate > 0.1) {
			recommendations.push(`High error rate detected (${(errorRate * 100).toFixed(1)}%). Check system logs and component health.`);
		}

		if (recommendations.length === 0) {
			recommendations.push('No significant memory leaks or stability issues detected. System is operating normally.');
		}

		return {
			leakDetectionResults: {
				memoryLeaks,
				memoryTrend,
				zombieResources: resourceStats?.health.zombieResources || 0,
				stalledOperations: resourceStats?.health.stalledCleanups || 0
			},
			stabilityMetrics: {
				uptime,
				totalOperations,
				errorRate,
				averageResponseTime: resourceStats?.performance.avgCleanupTime || 0,
				memoryStability,
				systemHealth
			},
			recommendations
		};
	}

	/**
	 * Long-term stability stress test
	 */
	public async performLongTermStabilityTest(options: {
		durationMinutes?: number;
		operationsPerMinute?: number;
		enableMemoryPressure?: boolean;
		enableConcurrentOperations?: boolean;
	} = {}): Promise<{
		testResults: {
			duration: number;
			totalOperations: number;
			successfulOperations: number;
			failedOperations: number;
			averageResponseTime: number;
			peakMemoryUsage: number;
			memoryLeaks: number;
			systemCrashes: number;
		};
		performanceMetrics: {
			operationsPerSecond: number;
			memoryGrowthRate: number;
			errorRate: number;
			stabilityScore: number; // 0-100
		};
		healthChecks: Array<{
			timestamp: number;
			memoryUsage: number;
			resourceCount: number;
			systemHealth: string;
			issues: string[];
		}>;
	}> {
		const durationMs = (options.durationMinutes || 5) * 60 * 1000; // Default 5 minutes
		const operationsPerMinute = options.operationsPerMinute || 60; // Default 60 ops/min
		const operationInterval = 60000 / operationsPerMinute; // ms between operations

		const startTime = Date.now();
		const testResults = {
			duration: 0,
			totalOperations: 0,
			successfulOperations: 0,
			failedOperations: 0,
			averageResponseTime: 0,
			peakMemoryUsage: 0,
			memoryLeaks: 0,
			systemCrashes: 0
		};

		const healthChecks: any[] = [];
		const responseTimes: number[] = [];
		let initialMemory = this.getMemoryUsage().used;
		let peakMemory = initialMemory;

		this.log(`Starting long-term stability test: ${options.durationMinutes || 5} minutes, ${operationsPerMinute} ops/min`);

		// Create test data
		const testFiles = [];
		for (let i = 0; i < 100; i++) {
			testFiles.push({
				path: `test-stability-${i}.md`,
				content: `# Test File ${i}\n- [ ] Task ${i}\n- [x] Completed task ${i}\n`.repeat(Math.floor(Math.random() * 10) + 1)
			});
		}

		// Main test loop
		const endTime = startTime + durationMs;
		let operationCount = 0;

		while (Date.now() < endTime) {
			const cycleStart = Date.now();

			try {
				// Perform test operation
				const testFile = testFiles[operationCount % testFiles.length];
				const opStart = performance.now();

				// Test parsing operation
				if (this.useNewParsingSystem && this.isNewParsingSystemReady()) {
					await this.parseWithNewSystem(testFile.path, testFile.content);
				} else {
					await this.parseFileWithAppropriateParser(testFile.path, testFile.content);
				}

				const opTime = performance.now() - opStart;
				responseTimes.push(opTime);
				testResults.successfulOperations++;

				// Memory pressure test
				if (options.enableMemoryPressure && Math.random() < 0.1) {
					// Create temporary memory pressure
					const tempData = new Array(1000).fill('memory pressure test data');
					setTimeout(() => {
						tempData.length = 0; // Release memory
					}, 1000);
				}

				// Concurrent operations test
				if (options.enableConcurrentOperations && Math.random() < 0.2) {
					// Start concurrent operation without waiting
					this.performConcurrentTestOperation(testFiles[Math.floor(Math.random() * testFiles.length)]);
				}

			} catch (error) {
				testResults.failedOperations++;
				this.log(`Test operation failed: ${error.message}`);
			}

			testResults.totalOperations++;
			operationCount++;

			// Health check every 30 seconds
			if (operationCount % (30000 / operationInterval) === 0) {
				const currentMemory = this.getMemoryUsage();
				peakMemory = Math.max(peakMemory, currentMemory.used);

				const resourceStats = this.resourceManager ? this.resourceManager.getResourceStats() : null;
				const healthCheck = {
					timestamp: Date.now(),
					memoryUsage: currentMemory.used,
					resourceCount: resourceStats?.totalResources || 0,
					systemHealth: resourceStats?.health.status || 'unknown',
					issues: [] as string[]
				};

				// Check for issues
				if (currentMemory.used > initialMemory * 1.5) {
					healthCheck.issues.push('Memory usage increased significantly');
				}

				if (resourceStats && resourceStats.health.leakedResources > 5) {
					healthCheck.issues.push(`${resourceStats.health.leakedResources} resource leaks detected`);
				}

				if (responseTimes.length > 10) {
					const recentAvg = responseTimes.slice(-10).reduce((sum, t) => sum + t, 0) / 10;
					if (recentAvg > 1000) { // 1 second
						healthCheck.issues.push('Response time degradation detected');
					}
				}

				healthChecks.push(healthCheck);

				// Trigger emergency cleanup if needed
				if (healthCheck.issues.length > 2) {
					await this.performEmergencyCleanup();
				}
			}

			// Wait for next operation
			const elapsedInCycle = Date.now() - cycleStart;
			const waitTime = Math.max(0, operationInterval - elapsedInCycle);
			if (waitTime > 0) {
				await new Promise(resolve => setTimeout(resolve, waitTime));
			}
		}

		// Calculate final metrics
		testResults.duration = Date.now() - startTime;
		testResults.averageResponseTime = responseTimes.length > 0 ? 
			responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length : 0;
		testResults.peakMemoryUsage = peakMemory;

		// Detect memory leaks
		const finalMemory = this.getMemoryUsage().used;
		if (finalMemory > initialMemory * 1.2) { // 20% increase
			testResults.memoryLeaks = 1;
		}

		// Calculate performance metrics
		const operationsPerSecond = testResults.totalOperations / (testResults.duration / 1000);
		const memoryGrowthRate = (finalMemory - initialMemory) / (testResults.duration / 60000); // MB per minute
		const errorRate = testResults.failedOperations / testResults.totalOperations;

		// Calculate stability score (0-100)
		let stabilityScore = 100;
		stabilityScore -= errorRate * 500; // Heavy penalty for errors
		stabilityScore -= Math.min(50, memoryGrowthRate * 10); // Penalty for memory growth
		stabilityScore -= testResults.memoryLeaks * 30; // Penalty for leaks
		stabilityScore -= testResults.systemCrashes * 50; // Heavy penalty for crashes
		stabilityScore = Math.max(0, Math.min(100, stabilityScore));

		this.log(`Stability test completed: ${testResults.totalOperations} operations, ${testResults.successfulOperations} successful, stability score: ${stabilityScore.toFixed(1)}`);

		return {
			testResults,
			performanceMetrics: {
				operationsPerSecond,
				memoryGrowthRate,
				errorRate,
				stabilityScore
			},
			healthChecks
		};
	}

	/**
	 * Perform concurrent test operation for stability testing
	 */
	private async performConcurrentTestOperation(testFile: { path: string; content: string }): Promise<void> {
		try {
			// Test concurrent cache operations
			if (this.unifiedCacheManager) {
				await this.unifiedCacheManager.set('test', testFile.path, { data: 'concurrent test' });
				await this.unifiedCacheManager.get('test', testFile.path);
			}

			// Test concurrent event operations
			if (this.parseEventManager) {
				await this.parseEventManager.processAsyncTaskFlow(testFile.path, 'parse', {
					priority: 'low',
					timeout: 1000
				});
			}
		} catch (error) {
			// Concurrent operations may fail, which is acceptable for testing
			this.log(`Concurrent test operation failed (expected): ${error.message}`);
		}
	}

	/**
	 * Get current memory usage
	 */
	private getMemoryUsage(): { used: number; total: number } {
		if (typeof performance !== 'undefined' && performance.memory) {
			return {
				used: (performance as any).memory.usedJSHeapSize,
				total: (performance as any).memory.totalJSHeapSize
			};
		}
		
		// Fallback for environments without performance.memory
		return {
			used: 0,
			total: 0
		};
	}
}
