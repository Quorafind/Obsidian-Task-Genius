/**
 * Task Parsing Service
 *
 * Provides enhanced task parsing with project configuration support for main thread operations.
 * This service is designed to complement the Worker-based parsing system by providing:
 *
 * 1. File system access for project configuration files
 * 2. Frontmatter metadata resolution
 * 3. Enhanced project detection that requires file system traversal
 *
 * Note: The bulk of task parsing is handled by the Worker system, which already
 * includes basic project configuration support. This service is for cases where
 * main thread file system access is required.
 */

import { Vault, MetadataCache } from "obsidian";
import { MarkdownTaskParser } from "./workers/ConfigurableTaskParser";
import {
	ProjectConfigManager,
	ProjectConfigManagerOptions,
} from "./ProjectConfigManager";
import { ProjectDataWorkerManager } from "./ProjectDataWorkerManager";
import { TaskParserConfig, EnhancedTask } from "../types/TaskParserConfig";
import { Task, TgProject } from "../types/task";

export interface TaskParsingServiceOptions {
	vault: Vault;
	metadataCache: MetadataCache;
	parserConfig: TaskParserConfig;
	projectConfigOptions?: {
		configFileName: string;
		searchRecursively: boolean;
		metadataKey: string;
		pathMappings: Array<{
			pathPattern: string;
			projectName: string;
			enabled: boolean;
		}>;
		metadataMappings: Array<{
			sourceKey: string;
			targetKey: string;
			enabled: boolean;
		}>;
		defaultProjectNaming: {
			strategy: "filename" | "foldername" | "metadata";
			metadataKey?: string;
			stripExtension?: boolean;
			enabled: boolean;
		};
		metadataConfigEnabled?: boolean;
		configFileEnabled?: boolean;
		detectionMethods?: Array<{
			type: "metadata" | "tag" | "link";
			propertyKey: string;
			linkFilter?: string;
			enabled: boolean;
		}>;
	};
}

export class TaskParsingService {
	private parser: MarkdownTaskParser;
	private projectConfigManager?: ProjectConfigManager;
	private projectDataWorkerManager?: ProjectDataWorkerManager;
	private vault: Vault;
	private metadataCache: MetadataCache;

	constructor(options: TaskParsingServiceOptions) {
		this.vault = options.vault;
		this.metadataCache = options.metadataCache;
		this.parser = new MarkdownTaskParser(options.parserConfig);

		// Initialize project config manager if enhanced project is enabled
		if (
			options.parserConfig.projectConfig?.enableEnhancedProject &&
			options.projectConfigOptions
		) {
			this.projectConfigManager = new ProjectConfigManager({
				vault: options.vault,
				metadataCache: options.metadataCache,
				...options.projectConfigOptions,
				enhancedProjectEnabled:
					options.parserConfig.projectConfig.enableEnhancedProject,
				metadataConfigEnabled:
					options.projectConfigOptions.metadataConfigEnabled ?? false,
				configFileEnabled:
					options.projectConfigOptions.configFileEnabled ?? false,
			});

			// Initialize project data worker manager for performance optimization
			this.projectDataWorkerManager = new ProjectDataWorkerManager({
				vault: options.vault,
				metadataCache: options.metadataCache,
				projectConfigManager: this.projectConfigManager,
			});
		}
	}

	/**
	 * Parse tasks from content with enhanced project support
	 */
	async parseTasksFromContent(
		content: string,
		filePath: string
	): Promise<EnhancedTask[]> {
		let fileMetadata: Record<string, any> | undefined;
		let projectConfigData: Record<string, any> | undefined;
		let tgProject: TgProject | undefined;

		// Get metadata based on whether enhanced project is enabled
		if (this.projectConfigManager) {
			try {
				// Always use enhanced metadata when project config manager is available
				// as it only exists when enhanced project is enabled
				const enhancedMetadata =
					await this.projectConfigManager.getEnhancedMetadata(
						filePath
					);
				fileMetadata = enhancedMetadata;

				// Get project configuration data
				projectConfigData =
					(await this.projectConfigManager.getProjectConfig(
						filePath
					)) || undefined;

				// Determine tgProject
				tgProject = await this.projectConfigManager.determineTgProject(
					filePath
				);
			} catch (error) {
				console.warn(
					`Failed to get enhanced metadata for ${filePath}:`,
					error
				);
				// Fallback to basic file metadata if enhanced metadata fails
				fileMetadata =
					this.projectConfigManager.getFileMetadata(filePath) ||
					undefined;
			}
		}

		// Parse tasks with metadata (enhanced or basic depending on configuration)
		return this.parser.parse(
			content,
			filePath,
			fileMetadata,
			projectConfigData,
			tgProject
		);
	}

	/**
	 * Parse tasks and return legacy Task format for compatibility
	 */
	async parseTasksFromContentLegacy(
		content: string,
		filePath: string
	): Promise<Task[]> {
		let fileMetadata: Record<string, any> | undefined;
		let projectConfigData: Record<string, any> | undefined;
		let tgProject: TgProject | undefined;

		// Get metadata based on whether enhanced project is enabled
		if (this.projectConfigManager) {
			try {
				// Always use enhanced metadata when project config manager is available
				// as it only exists when enhanced project is enabled
				const enhancedMetadata =
					await this.projectConfigManager.getEnhancedMetadata(
						filePath
					);
				fileMetadata = enhancedMetadata;

				// Get project configuration data
				projectConfigData =
					(await this.projectConfigManager.getProjectConfig(
						filePath
					)) || undefined;

				// Determine tgProject
				tgProject = await this.projectConfigManager.determineTgProject(
					filePath
				);
			} catch (error) {
				console.warn(
					`Failed to get enhanced metadata for ${filePath}:`,
					error
				);
				// Fallback to basic file metadata if enhanced metadata fails
				fileMetadata =
					this.projectConfigManager.getFileMetadata(filePath) ||
					undefined;
			}
		}

		// Parse tasks with metadata (enhanced or basic depending on configuration)
		return this.parser.parseLegacy(
			content,
			filePath,
			fileMetadata,
			projectConfigData,
			tgProject
		);
	}

	/**
	 * Parse tasks from content without enhanced project features
	 * This method always uses basic file metadata without MetadataMapping transforms
	 */
	async parseTasksFromContentBasic(
		content: string,
		filePath: string
	): Promise<Task[]> {
		// Parse tasks with NO metadata, project config, or tgProject
		// This ensures no enhanced features are applied
		return this.parser.parseLegacy(
			content,
			filePath,
			undefined, // No file metadata
			undefined, // No project config data
			undefined // No tgProject
		);
	}

	/**
	 * Parse a single task line
	 */
	async parseTaskLine(
		line: string,
		filePath: string,
		lineNumber: number
	): Promise<Task | null> {
		const tasks = await this.parseTasksFromContentLegacy(line, filePath);

		if (tasks.length > 0) {
			const task = tasks[0];
			// Override line number to match the expected behavior
			task.line = lineNumber;
			return task;
		}

		return null;
	}

	/**
	 * Get enhanced metadata for a file
	 */
	async getEnhancedMetadata(filePath: string): Promise<Record<string, any>> {
		if (!this.projectConfigManager) {
			return {};
		}

		try {
			return await this.projectConfigManager.getEnhancedMetadata(
				filePath
			);
		} catch (error) {
			console.warn(
				`Failed to get enhanced metadata for ${filePath}:`,
				error
			);
			return {};
		}
	}

	/**
	 * Get tgProject for a file
	 */
	async getTgProject(filePath: string): Promise<TgProject | undefined> {
		if (!this.projectConfigManager) {
			return undefined;
		}

		try {
			return await this.projectConfigManager.determineTgProject(filePath);
		} catch (error) {
			console.warn(
				`Failed to determine tgProject for ${filePath}:`,
				error
			);
			return undefined;
		}
	}

	/**
	 * Clear project configuration cache
	 */
	clearProjectConfigCache(filePath?: string): void {
		if (this.projectConfigManager) {
			this.projectConfigManager.clearCache(filePath);
		}
	}

	/**
	 * Update parser configuration
	 */
	updateParserConfig(config: TaskParserConfig): void {
		this.parser = new MarkdownTaskParser(config);
	}

	/**
	 * Update project configuration options
	 */
	updateProjectConfigOptions(
		options: Partial<ProjectConfigManagerOptions>
	): void {
		if (this.projectConfigManager) {
			this.projectConfigManager.updateOptions(options);
		}
	}

	/**
	 * Enable or disable enhanced project support
	 */
	setEnhancedProjectEnabled(
		enabled: boolean,
		projectConfigOptions?: {
			configFileName: string;
			searchRecursively: boolean;
			metadataKey: string;
			pathMappings: Array<{
				pathPattern: string;
				projectName: string;
				enabled: boolean;
			}>;
			metadataMappings: Array<{
				sourceKey: string;
				targetKey: string;
				enabled: boolean;
			}>;
			defaultProjectNaming: {
				strategy: "filename" | "foldername" | "metadata";
				metadataKey?: string;
				stripExtension?: boolean;
				enabled: boolean;
			};
			metadataConfigEnabled?: boolean;
			configFileEnabled?: boolean;
		}
	): void {
		if (enabled && projectConfigOptions) {
			// Create or update project config manager
			if (!this.projectConfigManager) {
				this.projectConfigManager = new ProjectConfigManager({
					vault: this.vault,
					metadataCache: this.metadataCache,
					...projectConfigOptions,
					enhancedProjectEnabled: enabled,
					metadataConfigEnabled:
						projectConfigOptions.metadataConfigEnabled ?? false,
					configFileEnabled:
						projectConfigOptions.configFileEnabled ?? false,
				});
			} else {
				this.projectConfigManager.updateOptions({
					...projectConfigOptions,
					enhancedProjectEnabled: enabled,
					metadataConfigEnabled:
						projectConfigOptions.metadataConfigEnabled ?? false,
					configFileEnabled:
						projectConfigOptions.configFileEnabled ?? false,
				});
			}
		} else if (!enabled) {
			// Disable project config manager or set it to disabled state
			if (this.projectConfigManager) {
				this.projectConfigManager.setEnhancedProjectEnabled(false);
			} else {
				this.projectConfigManager = undefined;
			}
		}
	}

	/**
	 * Check if enhanced project support is enabled
	 */
	isEnhancedProjectEnabled(): boolean {
		return (
			!!this.projectConfigManager &&
			this.projectConfigManager.isEnhancedProjectEnabled()
		);
	}

	/**
	 * Pre-compute enhanced project data for all files in the vault
	 * This is designed to be called before Worker processing to provide
	 * complete project information that requires file system access
	 *
	 * PERFORMANCE OPTIMIZATION: Now uses ProjectDataWorkerManager for efficient
	 * batch processing with caching and worker-based computation.
	 */
	async computeEnhancedProjectData(
		filePaths: string[]
	): Promise<import("./workers/TaskIndexWorkerMessage").EnhancedProjectData> {
		// Early return if enhanced project features are disabled
		if (
			!this.projectConfigManager ||
			!this.projectConfigManager.isEnhancedProjectEnabled()
		) {
			return {
				fileProjectMap: {},
				fileMetadataMap: {},
				projectConfigMap: {},
			};
		}

		const fileProjectMap: Record<
			string,
			{
				project: string;
				source: string;
				readonly: boolean;
			}
		> = {};
		const fileMetadataMap: Record<string, Record<string, any>> = {};
		const projectConfigMap: Record<string, Record<string, any>> = {};

		// Use optimized batch processing with worker manager if available
		if (this.projectDataWorkerManager) {
			try {
				console.log(
					`Computing enhanced project data for ${filePaths.length} files using optimized worker-based approach...`
				);
				const startTime = Date.now();

				// Get batch project data using optimized cache and worker processing
				const projectDataMap =
					await this.projectDataWorkerManager.getBatchProjectData(
						filePaths
					);

				// Convert to the format expected by workers
				for (const [filePath, cachedData] of projectDataMap) {
					if (cachedData.tgProject) {
						fileProjectMap[filePath] = {
							project: cachedData.tgProject.name,
							source:
								cachedData.tgProject.source ||
								cachedData.tgProject.type,
							readonly: cachedData.tgProject.readonly ?? true,
						};
					}

					if (Object.keys(cachedData.enhancedMetadata).length > 0) {
						fileMetadataMap[filePath] = cachedData.enhancedMetadata;
					}
				}

				// Build project config map from unique directories
				const uniqueDirectories = new Set<string>();
				for (const filePath of filePaths) {
					const dirPath = filePath.substring(
						0,
						filePath.lastIndexOf("/")
					);
					if (dirPath) {
						uniqueDirectories.add(dirPath);
					}
				}

				// Get project configs for unique directories only (optimization)
				for (const dirPath of uniqueDirectories) {
					try {
						// Use a file from this directory to get project config
						const sampleFilePath = filePaths.find(
							(path) =>
								path.substring(0, path.lastIndexOf("/")) ===
								dirPath
						);

						if (sampleFilePath) {
							const projectConfig =
								await this.projectConfigManager.getProjectConfig(
									sampleFilePath
								);
							if (
								projectConfig &&
								Object.keys(projectConfig).length > 0
							) {
								const enhancedProjectConfig =
									this.projectConfigManager.applyMappingsToMetadata(
										projectConfig
									);
								projectConfigMap[dirPath] =
									enhancedProjectConfig;
							}
						}
					} catch (error) {
						console.warn(
							`Failed to get project config for directory ${dirPath}:`,
							error
						);
					}
				}

				const processingTime = Date.now() - startTime;
				console.log(
					`Enhanced project data computation completed in ${processingTime}ms using optimized approach`
				);

				return {
					fileProjectMap,
					fileMetadataMap,
					projectConfigMap,
				};
			} catch (error) {
				console.warn(
					"Failed to use optimized project data computation, falling back to synchronous method:",
					error
				);
			}
		}

		// Fallback to original synchronous method if worker manager is not available
		console.log(
			`Computing enhanced project data for ${filePaths.length} files using fallback synchronous approach...`
		);
		const startTime = Date.now();

		// Process each file to determine its project and metadata (original logic)
		for (const filePath of filePaths) {
			try {
				// Get tgProject for this file
				const tgProject =
					await this.projectConfigManager.determineTgProject(
						filePath
					);
				if (tgProject) {
					fileProjectMap[filePath] = {
						project: tgProject.name,
						source: tgProject.source || tgProject.type,
						readonly: tgProject.readonly ?? true,
					};
				}

				// Get enhanced metadata for this file
				const enhancedMetadata =
					await this.projectConfigManager.getEnhancedMetadata(
						filePath
					);
				if (Object.keys(enhancedMetadata).length > 0) {
					fileMetadataMap[filePath] = enhancedMetadata;
				}

				// Get project config for this file's directory
				const projectConfig =
					await this.projectConfigManager.getProjectConfig(filePath);
				if (projectConfig && Object.keys(projectConfig).length > 0) {
					// Apply metadata mappings to project config data as well
					const enhancedProjectConfig =
						this.projectConfigManager.applyMappingsToMetadata(
							projectConfig
						);

					// Use directory path as key for project config
					const dirPath = filePath.substring(
						0,
						filePath.lastIndexOf("/")
					);
					projectConfigMap[dirPath] = enhancedProjectConfig;
				}
			} catch (error) {
				console.warn(
					`Failed to compute enhanced project data for ${filePath}:`,
					error
				);
			}
		}

		const processingTime = Date.now() - startTime;
		console.log(
			`Enhanced project data computation completed in ${processingTime}ms using fallback approach`
		);

		return {
			fileProjectMap,
			fileMetadataMap,
			projectConfigMap,
		};
	}

	/**
	 * Get enhanced project data for a specific file (for single file operations)
	 */
	async getEnhancedDataForFile(filePath: string): Promise<{
		tgProject?: import("../types/task").TgProject;
		fileMetadata?: Record<string, any>;
		projectConfigData?: Record<string, any>;
	}> {
		// Early return if enhanced project features are disabled
		if (
			!this.projectConfigManager ||
			!this.projectConfigManager.isEnhancedProjectEnabled()
		) {
			return {};
		}

		try {
			const [tgProject, enhancedMetadata, projectConfigData] =
				await Promise.all([
					this.projectConfigManager.determineTgProject(filePath),
					this.projectConfigManager.getEnhancedMetadata(filePath),
					this.projectConfigManager.getProjectConfig(filePath),
				]);

			return {
				tgProject,
				fileMetadata:
					Object.keys(enhancedMetadata).length > 0
						? enhancedMetadata
						: undefined,
				projectConfigData:
					projectConfigData &&
					Object.keys(projectConfigData).length > 0
						? projectConfigData
						: undefined,
			};
		} catch (error) {
			console.warn(`Failed to get enhanced data for ${filePath}:`, error);
			return {};
		}
	}

	/**
	 * Handle settings changes for project configuration
	 */
	onSettingsChange(): void {
		if (this.projectDataWorkerManager) {
			this.projectDataWorkerManager.onSettingsChange();
		}
	}

	/**
	 * Handle enhanced project setting changes
	 */
	onEnhancedProjectSettingChange(enabled: boolean): void {
		if (this.projectConfigManager) {
			this.projectConfigManager.setEnhancedProjectEnabled(enabled);
		}
		if (this.projectDataWorkerManager) {
			this.projectDataWorkerManager.onEnhancedProjectSettingChange(
				enabled
			);
		}
	}

	/**
	 * Clear cache for project data
	 */
	clearProjectDataCache(filePath?: string): void {
		if (this.projectDataWorkerManager) {
			this.projectDataWorkerManager.clearCache(filePath);
		}
		if (this.projectConfigManager) {
			this.projectConfigManager.clearCache(filePath);
		}
	}

	/**
	 * Clear all caches (project config, project data, and enhanced metadata)
	 * This is designed for scenarios like forceReindex where complete cache clearing is needed
	 */
	clearAllCaches(): void {
		// Clear project configuration caches
		this.clearProjectConfigCache();
		
		// Clear project data caches
		this.clearProjectDataCache();
		
		// Force clear all ProjectConfigManager caches including our new timestamp caches
		if (this.projectConfigManager) {
			// Call clearCache without parameters to clear ALL caches
			this.projectConfigManager.clearCache();
		}
		
		// Force clear all ProjectDataWorkerManager caches
		if (this.projectDataWorkerManager) {
			// Call clearCache without parameters to clear ALL caches
			this.projectDataWorkerManager.clearCache();
		}
	}

	/**
	 * Get cache performance statistics including detailed breakdown
	 */
	getProjectDataCacheStats() {
		const workerStats = this.projectDataWorkerManager?.getCacheStats();
		const configStats = this.projectConfigManager?.getCacheStats();
		
		return {
			workerManager: workerStats,
			configManager: configStats,
			combined: {
				totalFiles: ((workerStats as any)?.fileCacheSize || 0) + (configStats?.fileMetadataCache.size || 0),
				totalMemory: (configStats?.totalMemoryUsage.estimatedBytes || 0),
			}
		};
	}

	/**
	 * Get detailed cache statistics for monitoring and debugging
	 */
	getDetailedCacheStats(): {
		projectConfigManager?: any;
		projectDataWorkerManager?: any;
		summary: {
			totalCachedFiles: number;
			estimatedMemoryUsage: number;
			cacheTypes: string[];
		};
	} {
		const configStats = this.projectConfigManager?.getCacheStats();
		const workerStats = this.projectDataWorkerManager?.getCacheStats();
		
		const totalFiles = (configStats?.fileMetadataCache.size || 0) + 
			(configStats?.enhancedMetadataCache.size || 0) +
			((workerStats as any)?.fileCacheSize || 0);
			
		const cacheTypes = [];
		if (configStats?.fileMetadataCache.size) cacheTypes.push('fileMetadata');
		if (configStats?.enhancedMetadataCache.size) cacheTypes.push('enhancedMetadata');
		if (configStats?.configCache.size) cacheTypes.push('projectConfig');
		if ((workerStats as any)?.fileCacheSize) cacheTypes.push('projectData');
		
		return {
			projectConfigManager: configStats,
			projectDataWorkerManager: workerStats,
			summary: {
				totalCachedFiles: totalFiles,
				estimatedMemoryUsage: configStats?.totalMemoryUsage.estimatedBytes || 0,
				cacheTypes,
			}
		};
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		if (this.projectDataWorkerManager) {
			this.projectDataWorkerManager.destroy();
		}
	}
}
