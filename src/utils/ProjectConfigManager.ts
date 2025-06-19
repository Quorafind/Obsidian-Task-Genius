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

export interface MetadataMapping {
	sourceKey: string;
	targetKey: string;
	enabled: boolean;
}

export interface ProjectNamingStrategy {
	strategy: "filename" | "foldername" | "metadata";
	metadataKey?: string;
	stripExtension?: boolean;
	enabled: boolean;
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
	metadataMappings: MetadataMapping[];
	defaultProjectNaming: ProjectNamingStrategy;
	enhancedProjectEnabled?: boolean; // Optional flag to control feature availability
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
	private metadataMappings: MetadataMapping[];
	private defaultProjectNaming: ProjectNamingStrategy;
	private enhancedProjectEnabled: boolean;

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
		this.metadataMappings = options.metadataMappings || [];
		this.defaultProjectNaming = options.defaultProjectNaming || {
			strategy: "filename",
			stripExtension: true,
			enabled: false,
		};
		this.enhancedProjectEnabled = options.enhancedProjectEnabled ?? true; // Default to enabled for backward compatibility
	}

	/**
	 * Check if enhanced project features are enabled
	 */
	isEnhancedProjectEnabled(): boolean {
		return this.enhancedProjectEnabled;
	}

	/**
	 * Set enhanced project feature state
	 */
	setEnhancedProjectEnabled(enabled: boolean): void {
		this.enhancedProjectEnabled = enabled;
		if (!enabled) {
			// Clear cache when disabling to prevent stale data
			this.clearCache();
		}
	}

	/**
	 * Get project configuration for a given file path
	 */
	async getProjectConfig(
		filePath: string
	): Promise<ProjectConfigData | null> {
		// Early return if enhanced project features are disabled
		if (!this.enhancedProjectEnabled) {
			return null;
		}

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
		// Early return if enhanced project features are disabled
		if (!this.enhancedProjectEnabled) {
			return null;
		}

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
		// Early return if enhanced project features are disabled
		if (!this.enhancedProjectEnabled) {
			return undefined;
		}

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

		// 4. Apply default project naming strategy (lowest priority)
		if (this.defaultProjectNaming.enabled) {
			const defaultProject = this.generateDefaultProjectName(filePath);
			if (defaultProject) {
				return {
					type: "default",
					name: defaultProject,
					source: this.defaultProjectNaming.strategy,
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
		// Early return if enhanced project features are disabled
		if (!this.enhancedProjectEnabled) {
			return {};
		}

		const fileMetadata = this.getFileMetadata(filePath) || {};
		const configData = (await this.getProjectConfig(filePath)) || {};

		// Merge metadata, with file metadata taking precedence
		let mergedMetadata = { ...configData, ...fileMetadata };

		// Apply metadata mappings
		mergedMetadata = this.applyMetadataMappings(mergedMetadata);

		return mergedMetadata;
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
		// Early return if enhanced project features are disabled
		if (!this.enhancedProjectEnabled) {
			return null;
		}

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
		// Early return if enhanced project features are disabled
		if (!this.enhancedProjectEnabled) {
			return null;
		}

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
	 * Apply metadata mappings to transform source metadata keys to target keys
	 */
	private applyMetadataMappings(
		metadata: Record<string, any>
	): Record<string, any> {
		const result = { ...metadata };

		for (const mapping of this.metadataMappings) {
			if (!mapping.enabled) continue;

			const sourceValue = metadata[mapping.sourceKey];
			if (sourceValue !== undefined) {
				// Apply intelligent type conversion for common field types
				result[mapping.targetKey] = this.convertMetadataValue(
					mapping.targetKey,
					sourceValue
				);
			}
		}

		return result;
	}

	/**
	 * Convert metadata value based on target key type
	 */
	private convertMetadataValue(targetKey: string, value: any): any {
		// Date field detection patterns
		const dateFieldPatterns = [
			"due",
			"dueDate",
			"deadline",
			"start",
			"startDate",
			"started",
			"scheduled",
			"scheduledDate",
			"scheduled_for",
			"completed",
			"completedDate",
			"finished",
			"created",
			"createdDate",
			"created_at",
		];

		// Priority field detection patterns
		const priorityFieldPatterns = ["priority", "urgency", "importance"];

		// Check if it's a date field
		const isDateField = dateFieldPatterns.some((pattern) =>
			targetKey.toLowerCase().includes(pattern.toLowerCase())
		);

		// Check if it's a priority field
		const isPriorityField = priorityFieldPatterns.some((pattern) =>
			targetKey.toLowerCase().includes(pattern.toLowerCase())
		);

		if (isDateField && typeof value === "string") {
			// Try to convert date string to timestamp for better performance
			if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
				// Use the same date parsing logic as MarkdownTaskParser
				const { parseLocalDate } = require("./dateUtil");
				const timestamp = parseLocalDate(value);
				return timestamp !== undefined ? timestamp : value;
			}
		} else if (isPriorityField && typeof value === "string") {
			// Convert priority string to number using the standard PRIORITY_MAP scale
			const priorityMap: Record<string, number> = {
				highest: 5,
				urgent: 5,
				critical: 5,
				high: 4,
				important: 4,
				medium: 3,
				normal: 3,
				moderate: 3,
				low: 2,
				minor: 2,
				lowest: 1,
				trivial: 1,
			};

			const numericPriority = parseInt(value, 10);
			if (!isNaN(numericPriority)) {
				return numericPriority;
			}

			const mappedPriority = priorityMap[value.toLowerCase()];
			if (mappedPriority !== undefined) {
				return mappedPriority;
			}
		}

		// Return original value if no conversion is needed
		return value;
	}

	/**
	 * Public method to apply metadata mappings to any metadata object
	 */
	public applyMappingsToMetadata(
		metadata: Record<string, any>
	): Record<string, any> {
		return this.applyMetadataMappings(metadata);
	}

	/**
	 * Generate default project name based on configured strategy
	 */
	private generateDefaultProjectName(filePath: string): string | null {
		// Early return if enhanced project features are disabled
		if (
			!this.enhancedProjectEnabled ||
			!this.defaultProjectNaming.enabled
		) {
			return null;
		}

		switch (this.defaultProjectNaming.strategy) {
			case "filename": {
				const fileName = filePath.split("/").pop() || "";
				if (this.defaultProjectNaming.stripExtension) {
					return fileName.replace(/\.[^/.]+$/, "");
				}
				return fileName;
			}
			case "foldername": {
				const pathParts = filePath.split("/");
				// Get the parent folder name
				if (pathParts.length > 1) {
					return pathParts[pathParts.length - 2] || "";
				}
				return "";
			}
			case "metadata": {
				const metadataKey = this.defaultProjectNaming.metadataKey;
				if (!metadataKey) {
					return null;
				}
				const fileMetadata = this.getFileMetadata(filePath);
				if (fileMetadata && fileMetadata[metadataKey]) {
					const value = fileMetadata[metadataKey];
					return typeof value === "string"
						? value.trim()
						: String(value);
				}
				return null;
			}
			default:
				return null;
		}
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
		if (options.metadataMappings !== undefined) {
			this.metadataMappings = options.metadataMappings;
		}
		if (options.defaultProjectNaming !== undefined) {
			this.defaultProjectNaming = options.defaultProjectNaming;
		}
		if (options.enhancedProjectEnabled !== undefined) {
			this.setEnhancedProjectEnabled(options.enhancedProjectEnabled);
		}

		// Clear cache when options change
		this.clearCache();
	}

	/**
	 * Get worker configuration for project data computation
	 */
	getWorkerConfig(): {
		pathMappings: Array<{
			pathPattern: string;
			projectName: string;
			enabled: boolean;
		}>;
		metadataMappings: MetadataMapping[];
		defaultProjectNaming: ProjectNamingStrategy;
		metadataKey: string;
	} {
		return {
			pathMappings: this.pathMappings,
			metadataMappings: this.metadataMappings,
			defaultProjectNaming: this.defaultProjectNaming,
			metadataKey: this.metadataKey,
		};
	}

	/**
	 * Get project config data for a file (alias for getProjectConfig for compatibility)
	 */
	async getProjectConfigData(
		filePath: string
	): Promise<ProjectConfigData | null> {
		return await this.getProjectConfig(filePath);
	}
}
