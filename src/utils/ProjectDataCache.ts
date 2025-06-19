/**
 * Enhanced Project Data Cache Manager
 *
 * Provides high-performance caching for project data with directory-level optimizations
 * and batch processing capabilities to reduce main thread blocking.
 */

import { TFile, Vault, MetadataCache } from "obsidian";
import { TgProject } from "../types/task";
import {
	ProjectConfigData,
	ProjectConfigManager,
} from "./ProjectConfigManager";

export interface CachedProjectData {
	tgProject?: TgProject;
	enhancedMetadata: Record<string, any>;
	timestamp: number;
	configSource?: string; // path to config file used
}

export interface DirectoryCache {
	configFile?: TFile;
	configData?: ProjectConfigData;
	configTimestamp: number;
	paths: Set<string>; // files using this config
}

export interface ProjectCacheStats {
	totalFiles: number;
	cachedFiles: number;
	directoryCacheHits: number;
	configCacheHits: number;
	lastUpdateTime: number;
}

export class ProjectDataCache {
	private vault: Vault;
	private metadataCache: MetadataCache;
	private projectConfigManager: ProjectConfigManager;

	// File-level cache for computed project data
	private fileCache = new Map<string, CachedProjectData>();

	// Directory-level cache for project config files
	private directoryCache = new Map<string, DirectoryCache>();

	// Batch processing optimization
	private pendingUpdates = new Set<string>();
	private batchUpdateTimer?: NodeJS.Timeout;
	private readonly BATCH_DELAY = 100; // ms

	// Performance tracking
	private stats: ProjectCacheStats = {
		totalFiles: 0,
		cachedFiles: 0,
		directoryCacheHits: 0,
		configCacheHits: 0,
		lastUpdateTime: 0,
	};

	constructor(
		vault: Vault,
		metadataCache: MetadataCache,
		projectConfigManager: ProjectConfigManager
	) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.projectConfigManager = projectConfigManager;
	}

	/**
	 * Get cached project data for a file or compute if not cached
	 */
	async getProjectData(filePath: string): Promise<CachedProjectData | null> {
		if (!this.projectConfigManager.isEnhancedProjectEnabled()) {
			return null;
		}

		const cached = this.fileCache.get(filePath);
		if (cached && this.isCacheValid(filePath, cached)) {
			return cached;
		}

		return await this.computeAndCacheProjectData(filePath);
	}

	/**
	 * Batch get project data for multiple files with optimizations
	 */
	async getBatchProjectData(
		filePaths: string[]
	): Promise<Map<string, CachedProjectData>> {
		const result = new Map<string, CachedProjectData>();

		if (!this.projectConfigManager.isEnhancedProjectEnabled()) {
			return result;
		}

		// Separate cached from uncached files
		const uncachedPaths: string[] = [];
		const cachedPaths: string[] = [];

		for (const filePath of filePaths) {
			const cached = this.fileCache.get(filePath);
			if (cached && this.isCacheValid(filePath, cached)) {
				result.set(filePath, cached);
				cachedPaths.push(filePath);
			} else {
				uncachedPaths.push(filePath);
			}
		}

		this.stats.configCacheHits += cachedPaths.length;

		// Process uncached files in batches by directory for efficiency
		if (uncachedPaths.length > 0) {
			const batchedByDirectory = this.groupByDirectory(uncachedPaths);

			for (const [directory, paths] of batchedByDirectory) {
				const directoryData = await this.getOrCreateDirectoryCache(
					directory
				);

				for (const filePath of paths) {
					const projectData =
						await this.computeProjectDataWithDirectoryCache(
							filePath,
							directoryData
						);
					if (projectData) {
						result.set(filePath, projectData);
					}
				}
			}
		}

		this.stats.totalFiles = filePaths.length;
		this.stats.cachedFiles = cachedPaths.length;
		this.stats.lastUpdateTime = Date.now();

		return result;
	}

	/**
	 * Compute project data using directory-level cache for efficiency
	 */
	private async computeProjectDataWithDirectoryCache(
		filePath: string,
		directoryCache: DirectoryCache
	): Promise<CachedProjectData | null> {
		try {
			const tgProject =
				await this.projectConfigManager.determineTgProject(filePath);

			// Get enhanced metadata efficiently using cached config data
			let enhancedMetadata: Record<string, any> = {};

			// Get file metadata
			const fileMetadata =
				this.projectConfigManager.getFileMetadata(filePath) || {};

			// Use cached config data if available
			const configData = directoryCache.configData || {};

			// Merge and apply mappings
			const mergedMetadata = { ...configData, ...fileMetadata };
			enhancedMetadata =
				this.projectConfigManager.applyMappingsToMetadata(
					mergedMetadata
				);

			const projectData: CachedProjectData = {
				tgProject,
				enhancedMetadata,
				timestamp: Date.now(),
				configSource: directoryCache.configFile?.path,
			};

			// Cache the result
			this.fileCache.set(filePath, projectData);

			// Update directory cache file tracking
			directoryCache.paths.add(filePath);

			return projectData;
		} catch (error) {
			console.warn(
				`Failed to compute project data for ${filePath}:`,
				error
			);
			return null;
		}
	}

	/**
	 * Get or create directory cache for project config files
	 */
	private async getOrCreateDirectoryCache(
		directory: string
	): Promise<DirectoryCache> {
		let cached = this.directoryCache.get(directory);

		if (cached) {
			// Check if cache is still valid
			if (cached.configFile) {
				const currentTimestamp = cached.configFile.stat.mtime;
				if (currentTimestamp === cached.configTimestamp) {
					this.stats.directoryCacheHits++;
					return cached;
				}
			} else {
				// No config file in this directory, cache is still valid
				return cached;
			}
		}

		// Create new directory cache
		cached = {
			configTimestamp: 0,
			paths: new Set(),
		};

		// Look for config file in this directory
		const configFile = await this.findConfigFileInDirectory(directory);
		if (configFile) {
			cached.configFile = configFile;
			cached.configTimestamp = configFile.stat.mtime;

			// Read and cache config data
			try {
				const content = await this.vault.read(configFile);
				const metadata = this.metadataCache.getFileCache(configFile);

				let configData: ProjectConfigData = {};
				if (metadata?.frontmatter) {
					configData = { ...metadata.frontmatter };
				}

				// Parse additional config content
				const contentConfig = this.parseConfigContent(content);
				configData = { ...configData, ...contentConfig };

				cached.configData = configData;
			} catch (error) {
				console.warn(
					`Failed to read config file ${configFile.path}:`,
					error
				);
			}
		}

		this.directoryCache.set(directory, cached);
		return cached;
	}

	/**
	 * Find project config file in a specific directory (non-recursive)
	 */
	private async findConfigFileInDirectory(
		directory: string
	): Promise<TFile | null> {
		const abstractFile = this.vault.getAbstractFileByPath(directory);
		if (!abstractFile || !("children" in abstractFile)) {
			return null;
		}

		const configFileName = "task-genius.config.md"; // TODO: Make configurable
		const configFile = (abstractFile as any).children.find(
			(child: any) =>
				child && child.name === configFileName && "stat" in child
		) as TFile | undefined;

		return configFile || null;
	}

	/**
	 * Group file paths by their parent directory
	 */
	private groupByDirectory(filePaths: string[]): Map<string, string[]> {
		const groups = new Map<string, string[]>();

		for (const filePath of filePaths) {
			const directory = this.getDirectoryPath(filePath);
			const existing = groups.get(directory) || [];
			existing.push(filePath);
			groups.set(directory, existing);
		}

		return groups;
	}

	/**
	 * Get directory path from file path
	 */
	private getDirectoryPath(filePath: string): string {
		const lastSlash = filePath.lastIndexOf("/");
		return lastSlash > 0 ? filePath.substring(0, lastSlash) : "";
	}

	/**
	 * Check if cached data is still valid
	 */
	private isCacheValid(filePath: string, cached: CachedProjectData): boolean {
		const file = this.vault.getAbstractFileByPath(filePath);
		if (!file || !("stat" in file)) {
			return false;
		}

		// Check if file has been modified since caching
		const fileTimestamp = (file as TFile).stat.mtime;
		if (fileTimestamp > cached.timestamp) {
			return false;
		}

		// Check if config file has been modified
		if (cached.configSource) {
			const configFile = this.vault.getAbstractFileByPath(
				cached.configSource
			);
			if (configFile && "stat" in configFile) {
				const configTimestamp = (configFile as TFile).stat.mtime;
				const directory = this.getDirectoryPath(filePath);
				const dirCache = this.directoryCache.get(directory);
				if (dirCache && configTimestamp > dirCache.configTimestamp) {
					return false;
				}
			}
		}

		return true;
	}

	/**
	 * Compute and cache project data for a single file
	 */
	private async computeAndCacheProjectData(
		filePath: string
	): Promise<CachedProjectData | null> {
		const directory = this.getDirectoryPath(filePath);
		const directoryCache = await this.getOrCreateDirectoryCache(directory);
		return await this.computeProjectDataWithDirectoryCache(
			filePath,
			directoryCache
		);
	}

	/**
	 * Parse config file content (copied from ProjectConfigManager for efficiency)
	 */
	private parseConfigContent(content: string): ProjectConfigData {
		const config: ProjectConfigData = {};
		const lines = content.split("\n");

		for (const line of lines) {
			const trimmed = line.trim();
			if (
				!trimmed ||
				trimmed.startsWith("#") ||
				trimmed.startsWith("//")
			) {
				continue;
			}

			const colonIndex = trimmed.indexOf(":");
			if (colonIndex > 0) {
				const key = trimmed.substring(0, colonIndex).trim();
				const value = trimmed.substring(colonIndex + 1).trim();

				if (key && value) {
					const cleanValue = value.replace(/^["']|["']$/g, "");
					config[key] = cleanValue;
				}
			}
		}

		return config;
	}

	/**
	 * Clear cache for specific file or all files
	 */
	clearCache(filePath?: string): void {
		if (filePath) {
			this.fileCache.delete(filePath);

			// Clear from directory cache tracking
			const directory = this.getDirectoryPath(filePath);
			const dirCache = this.directoryCache.get(directory);
			if (dirCache) {
				dirCache.paths.delete(filePath);
			}
		} else {
			this.fileCache.clear();
			this.directoryCache.clear();
		}
	}

	/**
	 * Clear directory cache when config files change
	 */
	clearDirectoryCache(directory: string): void {
		const dirCache = this.directoryCache.get(directory);
		if (dirCache) {
			// Clear all files that used this directory's config
			for (const filePath of dirCache.paths) {
				this.fileCache.delete(filePath);
			}
			this.directoryCache.delete(directory);
		}
	}

	/**
	 * Get cache performance statistics
	 */
	getStats(): ProjectCacheStats {
		return { ...this.stats };
	}

	/**
	 * Schedule batch update for multiple files
	 */
	scheduleBatchUpdate(filePaths: string[]): void {
		for (const filePath of filePaths) {
			this.pendingUpdates.add(filePath);
		}

		if (this.batchUpdateTimer) {
			clearTimeout(this.batchUpdateTimer);
		}

		this.batchUpdateTimer = setTimeout(() => {
			this.processBatchUpdates();
		}, this.BATCH_DELAY);
	}

	/**
	 * Process pending batch updates
	 */
	private async processBatchUpdates(): Promise<void> {
		if (this.pendingUpdates.size === 0) {
			return;
		}

		const pathsToUpdate = Array.from(this.pendingUpdates);
		this.pendingUpdates.clear();

		// Clear cache for updated files
		for (const filePath of pathsToUpdate) {
			this.clearCache(filePath);
		}

		// Pre-compute data for updated files
		await this.getBatchProjectData(pathsToUpdate);
	}

	/**
	 * Update cache when enhanced project setting changes
	 */
	onEnhancedProjectSettingChange(enabled: boolean): void {
		if (!enabled) {
			this.clearCache();
		}
	}

	/**
	 * Handle file modification events for incremental updates
	 */
	async onFileModified(filePath: string): Promise<void> {
		// Clear cache for the modified file
		this.clearCache(filePath);

		// Check if it's a project config file
		if (
			filePath.endsWith(".config.md") ||
			filePath.includes("task-genius")
		) {
			// Clear directory cache since config may have changed
			const directory = this.getDirectoryPath(filePath);
			this.clearDirectoryCache(directory);
		}

		// Schedule batch update for this file
		this.scheduleBatchUpdate([filePath]);
	}

	/**
	 * Handle file deletion events
	 */
	onFileDeleted(filePath: string): void {
		this.clearCache(filePath);

		// Update directory cache if it was a config file
		if (
			filePath.endsWith(".config.md") ||
			filePath.includes("task-genius")
		) {
			const directory = this.getDirectoryPath(filePath);
			this.clearDirectoryCache(directory);
		}
	}

	/**
	 * Handle file creation events
	 */
	async onFileCreated(filePath: string): Promise<void> {
		// If it's a config file, clear directory cache to pick up new config
		if (
			filePath.endsWith(".config.md") ||
			filePath.includes("task-genius")
		) {
			const directory = this.getDirectoryPath(filePath);
			this.clearDirectoryCache(directory);
		}

		// Pre-compute data for new file
		await this.getProjectData(filePath);
	}

	/**
	 * Handle file rename/move events
	 */
	async onFileRenamed(oldPath: string, newPath: string): Promise<void> {
		// Clear cache for old path
		this.clearCache(oldPath);

		// Update relevant directory caches
		const oldDirectory = this.getDirectoryPath(oldPath);
		const newDirectory = this.getDirectoryPath(newPath);

		if (oldPath.endsWith(".config.md") || oldPath.includes("task-genius")) {
			this.clearDirectoryCache(oldDirectory);
		}

		if (newPath.endsWith(".config.md") || newPath.includes("task-genius")) {
			this.clearDirectoryCache(newDirectory);
		}

		// Pre-compute data for new path
		await this.getProjectData(newPath);
	}

	/**
	 * Validate and refresh cache entries that may be stale
	 */
	async refreshStaleEntries(): Promise<void> {
		const staleFiles: string[] = [];

		for (const [filePath, cachedData] of this.fileCache.entries()) {
			if (!this.isCacheValid(filePath, cachedData)) {
				staleFiles.push(filePath);
			}
		}

		if (staleFiles.length > 0) {
			console.log(
				`Refreshing ${staleFiles.length} stale project data cache entries`
			);
			await this.getBatchProjectData(staleFiles);
		}
	}

	/**
	 * Preload project data for recently accessed files
	 */
	async preloadRecentFiles(filePaths: string[]): Promise<void> {
		const uncachedFiles = filePaths.filter(
			(path) => !this.fileCache.has(path)
		);

		if (uncachedFiles.length > 0) {
			console.log(
				`Preloading project data for ${uncachedFiles.length} recent files`
			);
			await this.getBatchProjectData(uncachedFiles);
		}
	}

	/**
	 * Set project data in cache (for external updates)
	 */
	async setProjectData(
		filePath: string,
		projectData: CachedProjectData
	): Promise<void> {
		this.fileCache.set(filePath, projectData);

		// Update directory cache tracking
		const directory = this.getDirectoryPath(filePath);
		const dirCache = this.directoryCache.get(directory);
		if (dirCache) {
			dirCache.paths.add(filePath);
		}
	}
}
