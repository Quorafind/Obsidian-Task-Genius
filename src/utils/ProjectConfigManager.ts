/**
 * Project Configuration Manager
 *
 * Handles project configuration file reading and metadata parsing
 * This runs in the main thread, not in workers due to file system access limitations
 */

import { TFile, TFolder, Vault, MetadataCache, CachedMetadata } from "obsidian";
import { TgProject } from "../types/task";

export interface ProjectConfigData {
	project?: string;
	[key: string]: any;
}

export interface ProjectConfigManagerOptions {
	vault: Vault;
	metadataCache: MetadataCache;
	configFileName: string;
	searchRecursively: boolean;
	metadataKey: string;
	pathMappings: Array<{
		pathPattern: string;
		projectName: string;
		enabled: boolean;
	}>;
}

export class ProjectConfigManager {
	private vault: Vault;
	private metadataCache: MetadataCache;
	private configFileName: string;
	private searchRecursively: boolean;
	private metadataKey: string;
	private pathMappings: Array<{
		pathPattern: string;
		projectName: string;
		enabled: boolean;
	}>;

	// Cache for project configurations
	private configCache = new Map<string, ProjectConfigData>();
	private lastModifiedCache = new Map<string, number>();

	constructor(options: ProjectConfigManagerOptions) {
		this.vault = options.vault;
		this.metadataCache = options.metadataCache;
		this.configFileName = options.configFileName;
		this.searchRecursively = options.searchRecursively;
		this.metadataKey = options.metadataKey;
		this.pathMappings = options.pathMappings;
	}

	/**
	 * Get project configuration for a given file path
	 */
	async getProjectConfig(
		filePath: string
	): Promise<ProjectConfigData | null> {
		try {
			const configFile = await this.findProjectConfigFile(filePath);
			if (!configFile) {
				return null;
			}

			const configPath = configFile.path;
			const lastModified = configFile.stat.mtime;

			// Check cache
			if (
				this.configCache.has(configPath) &&
				this.lastModifiedCache.get(configPath) === lastModified
			) {
				return this.configCache.get(configPath) || null;
			}

			// Read and parse config file
			const content = await this.vault.read(configFile);
			const metadata = this.metadataCache.getFileCache(configFile);

			let configData: ProjectConfigData = {};

			// Parse frontmatter if available
			if (metadata?.frontmatter) {
				configData = { ...metadata.frontmatter };
			}

			// Parse content for additional project information
			const contentConfig = this.parseConfigContent(content);
			configData = { ...configData, ...contentConfig };

			// Update cache
			this.configCache.set(configPath, configData);
			this.lastModifiedCache.set(configPath, lastModified);

			return configData;
		} catch (error) {
			console.warn(
				`Failed to read project config for ${filePath}:`,
				error
			);
			return null;
		}
	}

	/**
	 * Get file metadata (frontmatter) for a given file
	 */
	getFileMetadata(filePath: string): Record<string, any> | null {
		try {
			const file = this.vault.getAbstractFileByPath(filePath);
			// Check if file exists and is a TFile (or has TFile-like properties for testing)
			if (!file || !("stat" in file)) {
				return null;
			}

			const metadata = this.metadataCache.getFileCache(file as TFile);
			return metadata?.frontmatter || null;
		} catch (error) {
			console.warn(`Failed to get file metadata for ${filePath}:`, error);
			return null;
		}
	}

	/**
	 * Determine tgProject for a task based on various sources
	 */
	async determineTgProject(filePath: string): Promise<TgProject | undefined> {
		// 1. Check path-based mappings first (highest priority)
		for (const mapping of this.pathMappings) {
			if (!mapping.enabled) continue;

			// Simple path matching - could be enhanced with glob patterns
			if (this.matchesPathPattern(filePath, mapping.pathPattern)) {
				return {
					type: "path",
					name: mapping.projectName,
					source: mapping.pathPattern,
					readonly: true,
				};
			}
		}

		// 2. Check file metadata (frontmatter)
		const fileMetadata = this.getFileMetadata(filePath);
		if (fileMetadata && fileMetadata[this.metadataKey]) {
			const projectFromMetadata = fileMetadata[this.metadataKey];
			if (
				typeof projectFromMetadata === "string" &&
				projectFromMetadata.trim()
			) {
				return {
					type: "metadata",
					name: projectFromMetadata.trim(),
					source: this.metadataKey,
					readonly: true,
				};
			}
		}

		// 3. Check project config file (lowest priority)
		const configData = await this.getProjectConfig(filePath);
		if (configData && configData.project) {
			const projectFromConfig = configData.project;
			if (
				typeof projectFromConfig === "string" &&
				projectFromConfig.trim()
			) {
				return {
					type: "config",
					name: projectFromConfig.trim(),
					source: this.configFileName,
					readonly: true,
				};
			}
		}

		return undefined;
	}

	/**
	 * Get enhanced metadata for a file (combines frontmatter and config)
	 */
	async getEnhancedMetadata(filePath: string): Promise<Record<string, any>> {
		const fileMetadata = this.getFileMetadata(filePath) || {};
		const configData = (await this.getProjectConfig(filePath)) || {};

		// Merge metadata, with file metadata taking precedence
		return { ...configData, ...fileMetadata };
	}

	/**
	 * Clear cache for a specific file or all files
	 */
	clearCache(filePath?: string): void {
		if (filePath) {
			// Clear cache for specific config file
			const configFile = this.findProjectConfigFileSync(filePath);
			if (configFile) {
				this.configCache.delete(configFile.path);
				this.lastModifiedCache.delete(configFile.path);
			}
		} else {
			// Clear all cache
			this.configCache.clear();
			this.lastModifiedCache.clear();
		}
	}

	/**
	 * Find project configuration file for a given file path
	 */
	private async findProjectConfigFile(
		filePath: string
	): Promise<TFile | null> {
		const file = this.vault.getAbstractFileByPath(filePath);
		if (!file) {
			return null;
		}

		let currentFolder = file.parent;

		while (currentFolder) {
			// Look for config file in current folder
			const configFile = currentFolder.children.find(
				(child: any) =>
					child &&
					child.name === this.configFileName &&
					"stat" in child // Check if it's a file-like object
			) as TFile | undefined;

			if (configFile) {
				return configFile;
			}

			// If not searching recursively, stop here
			if (!this.searchRecursively) {
				break;
			}

			// Move to parent folder
			currentFolder = currentFolder.parent;
		}

		return null;
	}

	/**
	 * Synchronous version of findProjectConfigFile for cache clearing
	 */
	private findProjectConfigFileSync(filePath: string): TFile | null {
		const file = this.vault.getAbstractFileByPath(filePath);
		if (!file) {
			return null;
		}

		let currentFolder = file.parent;

		while (currentFolder) {
			const configFile = currentFolder.children.find(
				(child: any) =>
					child &&
					child.name === this.configFileName &&
					"stat" in child // Check if it's a file-like object
			) as TFile | undefined;

			if (configFile) {
				return configFile;
			}

			if (!this.searchRecursively) {
				break;
			}

			currentFolder = currentFolder.parent;
		}

		return null;
	}

	/**
	 * Parse configuration content for project information
	 */
	private parseConfigContent(content: string): ProjectConfigData {
		const config: ProjectConfigData = {};

		// Simple parsing for project information
		// This could be enhanced to support more complex formats
		const lines = content.split("\n");

		for (const line of lines) {
			const trimmed = line.trim();

			// Skip empty lines and comments
			if (
				!trimmed ||
				trimmed.startsWith("#") ||
				trimmed.startsWith("//")
			) {
				continue;
			}

			// Look for key-value pairs
			const colonIndex = trimmed.indexOf(":");
			if (colonIndex > 0) {
				const key = trimmed.substring(0, colonIndex).trim();
				const value = trimmed.substring(colonIndex + 1).trim();

				if (key && value) {
					// Remove quotes if present
					const cleanValue = value.replace(/^["']|["']$/g, "");
					config[key] = cleanValue;
				}
			}
		}

		return config;
	}

	/**
	 * Check if a file path matches a path pattern
	 */
	private matchesPathPattern(filePath: string, pattern: string): boolean {
		// Simple pattern matching - could be enhanced with glob patterns
		// For now, just check if the file path contains the pattern
		const normalizedPath = filePath.replace(/\\/g, "/");
		const normalizedPattern = pattern.replace(/\\/g, "/");

		// Support wildcards
		if (pattern.includes("*")) {
			const regexPattern = pattern
				.replace(/\*/g, ".*")
				.replace(/\?/g, ".");
			const regex = new RegExp(`^${regexPattern}$`, "i");
			return regex.test(normalizedPath);
		}

		// Simple substring match
		return normalizedPath.includes(normalizedPattern);
	}

	/**
	 * Update configuration options
	 */
	updateOptions(options: Partial<ProjectConfigManagerOptions>): void {
		if (options.configFileName !== undefined) {
			this.configFileName = options.configFileName;
		}
		if (options.searchRecursively !== undefined) {
			this.searchRecursively = options.searchRecursively;
		}
		if (options.metadataKey !== undefined) {
			this.metadataKey = options.metadataKey;
		}
		if (options.pathMappings !== undefined) {
			this.pathMappings = options.pathMappings;
		}

		// Clear cache when options change
		this.clearCache();
	}
}
