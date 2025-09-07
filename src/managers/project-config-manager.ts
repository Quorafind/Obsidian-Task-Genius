/**
 * Project Configuration Manager
 *
 * Handles project configuration file reading and metadata parsing
 * This runs in the main thread, not in workers due to file system access limitations
 */

import { TFile, TFolder, Vault, MetadataCache, CachedMetadata } from "obsidian";
import { TgProject } from "../types/task";
import { ProjectDetectionMethod } from "../common/setting-definition";

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
	metadataConfigEnabled?: boolean; // Whether metadata-based detection is enabled
	configFileEnabled?: boolean; // Whether config file-based detection is enabled
	detectionMethods?: ProjectDetectionMethod[]; // Custom detection methods
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
	private metadataConfigEnabled: boolean;
	private configFileEnabled: boolean;
	private detectionMethods: ProjectDetectionMethod[];

	// Cache for project configurations
	private configCache = new Map<string, ProjectConfigData>();
	private lastModifiedCache = new Map<string, number>();

	// Cache for file metadata (frontmatter)
	private fileMetadataCache = new Map<string, Record<string, any>>();
	private fileMetadataTimestampCache = new Map<string, number>();

	// Cache for enhanced metadata (merged frontmatter + config + mappings)
	private enhancedMetadataCache = new Map<string, Record<string, any>>();
	private enhancedMetadataTimestampCache = new Map<string, string>(); // Composite key: fileTime_configTime

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
		this.metadataConfigEnabled = options.metadataConfigEnabled ?? false;
		this.configFileEnabled = options.configFileEnabled ?? false;
		this.detectionMethods = options.detectionMethods || [];
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
	 * Get file metadata (frontmatter) for a given file with timestamp caching
	 */
	getFileMetadata(filePath: string): Record<string, any> | null {
		// Early return if enhanced project features are disabled
		if (!this.enhancedProjectEnabled) {
			return null;
		}

		try {
			const file = this.vault.getFileByPath(filePath);
			// Check if file exists and is a TFile (or has TFile-like properties for testing)
			if (!file || !("stat" in file)) {
				return null;
			}

			const currentTimestamp = (file as TFile).stat.mtime;
			const cachedTimestamp =
				this.fileMetadataTimestampCache.get(filePath);

			// Check if cache is valid (file hasn't been modified)
			if (
				cachedTimestamp === currentTimestamp &&
				this.fileMetadataCache.has(filePath)
			) {
				return this.fileMetadataCache.get(filePath) || null;
			}

			// Cache miss or file modified - get fresh metadata
			const metadata = this.metadataCache.getFileCache(file as TFile);
			const frontmatter = metadata?.frontmatter || {};

			// Update cache with fresh data
			this.fileMetadataCache.set(filePath, frontmatter);
			this.fileMetadataTimestampCache.set(filePath, currentTimestamp);

			return frontmatter;
		} catch (error) {
			console.warn(`Failed to get file metadata for ${filePath}:`, error);
			return null;
		}
	}

	/**
	 * Normalize a project path to use consistent separators
	 * @param path The path to normalize
	 * @returns Normalized path with forward slashes
	 */
	public normalizeProjectPath(path: string): string {
		if (!path) return "";

		// Replace backslashes with forward slashes
		let normalized = path.replace(/\\/g, "/");

		// Remove duplicate slashes
		normalized = normalized.replace(/\/+/g, "/");

		// Remove leading and trailing slashes
		normalized = normalized.replace(/^\/|\/$/g, "");

		return normalized;
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
				// Normalize the project name to support nested paths
				const normalizedName = this.normalizeProjectPath(
					mapping.projectName
				);
				return {
					type: "path",
					name: normalizedName,
					source: mapping.pathPattern,
					readonly: true,
				};
			}
		}

		// 2. Check custom detection methods
		if (this.detectionMethods && this.detectionMethods.length > 0) {
			const file = this.vault.getFileByPath(filePath);
			if (file && file instanceof TFile) {
				const fileCache = this.metadataCache.getFileCache(file);
				const fileMetadata = this.getFileMetadata(filePath);

				for (const method of this.detectionMethods) {
					if (!method.enabled) continue;

					switch (method.type) {
						case "metadata":
							// Check if the specified metadata property exists
							if (
								fileMetadata &&
								fileMetadata[method.propertyKey]
							) {
								return {
									type: "metadata",
									name: String(
										fileMetadata[method.propertyKey]
									),
									source: method.propertyKey,
									readonly: true,
								};
							}
							break;

						case "tag":
							// Check if file has the specified tag (consider both inline and frontmatter tags)
							{
								const targetTag = method.propertyKey.startsWith(
									"#"
								)
									? method.propertyKey
									: `#${method.propertyKey}`;
								const normalizedTarget =
									targetTag.toLowerCase();
								const inlineTags = (fileCache?.tags || []).map(
									(tc) => tc.tag
								);
								const fmTagsRaw = fileCache?.frontmatter?.tags;
								const fmTagsArr = Array.isArray(fmTagsRaw)
									? fmTagsRaw
									: fmTagsRaw !== undefined
									? [fmTagsRaw]
									: [];
								const fmTagsNorm = fmTagsArr.map((t: any) => {
									const s = String(t || "");
									return s.startsWith("#") ? s : `#${s}`;
								});
								const allTags = [
									...inlineTags,
									...fmTagsNorm,
								].map((t) => String(t || "").toLowerCase());
								// For file-level detection: require exact match; do NOT treat hierarchical '#project/xxx' as match unless configured exactly
								const hasTag = allTags.some(
									(t) => t === normalizedTarget
								);

								if (hasTag) {
									// First try to use title or name from frontmatter as project name
									if (fileMetadata?.title) {
										return {
											type: "metadata",
											name: String(fileMetadata.title),
											source: "title (via tag)",
											readonly: true,
										};
									}
									if (fileMetadata?.name) {
										return {
											type: "metadata",
											name: String(fileMetadata.name),
											source: "name (via tag)",
											readonly: true,
										};
									}
									// Fallback: use the file name (without extension)
									const fileName =
										filePath.split("/").pop() || filePath;
									const nameWithoutExt = fileName.replace(
										/\.md$/i,
										""
									);
									return {
										type: "metadata",
										name: nameWithoutExt,
										source: `tag:${targetTag}`,
										readonly: true,
									};
								}
							}
							break;

						case "link":
							// Check all links in the file
							if (fileCache?.links) {
								for (const linkCache of fileCache.links) {
									const linkedNote = linkCache.link;

									// If there's a filter, check if the link matches
									if (method.linkFilter) {
										if (
											linkedNote.includes(
												method.linkFilter
											)
										) {
											// First try to use title or name from frontmatter as project name
											if (fileMetadata?.title) {
												return {
													type: "metadata",
													name: String(
														fileMetadata.title
													),
													source: "title (via link)",
													readonly: true,
												};
											}
											if (fileMetadata?.name) {
												return {
													type: "metadata",
													name: String(
														fileMetadata.name
													),
													source: "name (via link)",
													readonly: true,
												};
											}
											// Fallback: use the file name (without extension)
											const fileName =
												filePath.split("/").pop() ||
												filePath;
											const nameWithoutExt =
												fileName.replace(/\.md$/i, "");
											return {
												type: "metadata",
												name: nameWithoutExt,
												source: `link:${linkedNote}`,
												readonly: true,
											};
										}
									} else if (method.propertyKey) {
										// If a property key is specified, only check links in that metadata field
										if (
											fileMetadata &&
											fileMetadata[method.propertyKey]
										) {
											const propValue = String(
												fileMetadata[method.propertyKey]
											);
											// Check if this link is mentioned in the property
											if (
												propValue.includes(
													`[[${linkedNote}]]`
												)
											) {
												// First try to use title or name from frontmatter as project name
												if (fileMetadata?.title) {
													return {
														type: "metadata",
														name: String(
															fileMetadata.title
														),
														source: "title (via link)",
														readonly: true,
													};
												}
												if (fileMetadata?.name) {
													return {
														type: "metadata",
														name: String(
															fileMetadata.name
														),
														source: "name (via link)",
														readonly: true,
													};
												}
												// Fallback: use the file name (without extension)
												const fileName =
													filePath.split("/").pop() ||
													filePath;
												const nameWithoutExt =
													fileName.replace(
														/\.md$/i,
														""
													);
												return {
													type: "metadata",
													name: nameWithoutExt,
													source: `link:${linkedNote}`,
													readonly: true,
												};
											}
										}
									}
								}
							}
							break;
					}
				}
			}
		}

		// 3. Check file metadata (frontmatter) - only if metadata detection is enabled
		if (this.metadataConfigEnabled) {
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
		}

		// 3. Check project config file (lowest priority) - only if config file detection is enabled
		if (this.configFileEnabled) {
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
		}

		// 4. Apply default project naming strategy (lowest priority)
		if (this.defaultProjectNaming.enabled) {
			const defaultProject = this.generateDefaultProjectName(filePath);
			if (defaultProject) {
				// Normalize default project name as well
				const normalizedName =
					this.normalizeProjectPath(defaultProject);
				return {
					type: "default",
					name: normalizedName,
					source: this.defaultProjectNaming.strategy,
					readonly: true,
				};
			}
		}

		return undefined;
	}

	/**
	 * Get enhanced metadata for a file (combines frontmatter and config) with composite caching
	 */
	async getEnhancedMetadata(filePath: string): Promise<Record<string, any>> {
		// Early return if enhanced project features are disabled
		if (!this.enhancedProjectEnabled) {
			return {};
		}

		try {
			// Get file timestamp for cache key
			const file = this.vault.getFileByPath(filePath);
			if (!file || !("stat" in file)) {
				return {};
			}

			const fileTimestamp = (file as TFile).stat.mtime;

			// Get config file timestamp for cache key
			const configFile = await this.findProjectConfigFile(filePath);
			const configTimestamp = configFile ? configFile.stat.mtime : 0;

			// Create composite cache key
			const cacheKey = `${fileTimestamp}_${configTimestamp}`;
			const cachedCacheKey =
				this.enhancedMetadataTimestampCache.get(filePath);

			// Check if cache is valid (neither file nor config has been modified)
			if (
				cachedCacheKey === cacheKey &&
				this.enhancedMetadataCache.has(filePath)
			) {
				return this.enhancedMetadataCache.get(filePath) || {};
			}

			// Cache miss or files modified - compute fresh enhanced metadata
			const fileMetadata = this.getFileMetadata(filePath) || {};
			const configData = (await this.getProjectConfig(filePath)) || {};

			// Merge metadata, with file metadata taking precedence
			let mergedMetadata = { ...configData, ...fileMetadata };

			// Apply metadata mappings
			mergedMetadata = this.applyMetadataMappings(mergedMetadata);

			// Update cache with fresh data
			this.enhancedMetadataCache.set(filePath, mergedMetadata);
			this.enhancedMetadataTimestampCache.set(filePath, cacheKey);

			return mergedMetadata;
		} catch (error) {
			console.warn(
				`Failed to get enhanced metadata for ${filePath}:`,
				error
			);
			return {};
		}
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

			// Clear file-specific metadata caches
			this.fileMetadataCache.delete(filePath);
			this.fileMetadataTimestampCache.delete(filePath);
			this.enhancedMetadataCache.delete(filePath);
			this.enhancedMetadataTimestampCache.delete(filePath);
		} else {
			// Clear all caches
			this.configCache.clear();
			this.lastModifiedCache.clear();
			this.fileMetadataCache.clear();
			this.fileMetadataTimestampCache.clear();
			this.enhancedMetadataCache.clear();
			this.enhancedMetadataTimestampCache.clear();
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

		const file = this.vault.getFileByPath(filePath);
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

		const file = this.vault.getFileByPath(filePath);
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
				const {
					parseLocalDate,
				} = require("../utils/date/date-formatter");
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
				const normalizedPath = filePath.replace(/\\/g, "/");
				const pathParts = normalizedPath.split("/");

				// For path-based projects, build nested structure from folder path
				// e.g., "Projects/Web/Frontend/file.md" -> "Web/Frontend"
				if (pathParts.length > 1) {
					// Find if path contains a common project root folder
					const projectRootIndex = pathParts.findIndex(
						(part) =>
							part.toLowerCase() === "projects" ||
							part.toLowerCase() === "project"
					);

					if (
						projectRootIndex >= 0 &&
						projectRootIndex < pathParts.length - 2
					) {
						// Build project path from folders after the project root
						const projectParts = pathParts.slice(
							projectRootIndex + 1,
							pathParts.length - 1
						);
						return projectParts.join("/");
					}

					// Fallback to just parent folder name if no project root found
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
		if (options.metadataConfigEnabled !== undefined) {
			this.metadataConfigEnabled = options.metadataConfigEnabled;
		}
		if (options.configFileEnabled !== undefined) {
			this.configFileEnabled = options.configFileEnabled;
		}
		if (options.detectionMethods !== undefined) {
			this.detectionMethods = options.detectionMethods || [];
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
	 * Expose detection methods (used to decide if worker can be used)
	 */
	getDetectionMethods(): ProjectDetectionMethod[] {
		return this.detectionMethods || [];
	}

	/**
	 * Get project config data for a file (alias for getProjectConfig for compatibility)
	 */
	async getProjectConfigData(
		filePath: string
	): Promise<ProjectConfigData | null> {
		return await this.getProjectConfig(filePath);
	}

	/**
	 * Get cache performance statistics and monitoring information
	 */
	getCacheStats(): {
		configCache: {
			size: number;
			keys: string[];
		};
		fileMetadataCache: {
			size: number;
			hitRatio?: number;
		};
		enhancedMetadataCache: {
			size: number;
			hitRatio?: number;
		};
		totalMemoryUsage: {
			estimatedBytes: number;
		};
	} {
		// Calculate estimated memory usage (rough approximation)
		const configCacheSize = Array.from(this.configCache.values())
			.map((config) => JSON.stringify(config).length)
			.reduce((sum, size) => sum + size, 0);

		const fileMetadataCacheSize = Array.from(
			this.fileMetadataCache.values()
		)
			.map((metadata) => JSON.stringify(metadata).length)
			.reduce((sum, size) => sum + size, 0);

		const enhancedMetadataCacheSize = Array.from(
			this.enhancedMetadataCache.values()
		)
			.map((metadata) => JSON.stringify(metadata).length)
			.reduce((sum, size) => sum + size, 0);

		const totalMemoryUsage =
			configCacheSize + fileMetadataCacheSize + enhancedMetadataCacheSize;

		return {
			configCache: {
				size: this.configCache.size,
				keys: Array.from(this.configCache.keys()),
			},
			fileMetadataCache: {
				size: this.fileMetadataCache.size,
			},
			enhancedMetadataCache: {
				size: this.enhancedMetadataCache.size,
			},
			totalMemoryUsage: {
				estimatedBytes: totalMemoryUsage,
			},
		};
	}

	/**
	 * Clear stale cache entries based on file modification times
	 */
	async clearStaleEntries(): Promise<number> {
		let clearedCount = 0;

		// Check file metadata cache for stale entries
		for (const [
			filePath,
			timestamp,
		] of this.fileMetadataTimestampCache.entries()) {
			const file = this.vault.getFileByPath(filePath);
			if (
				!file ||
				!("stat" in file) ||
				(file as TFile).stat.mtime !== timestamp
			) {
				this.fileMetadataCache.delete(filePath);
				this.fileMetadataTimestampCache.delete(filePath);
				this.enhancedMetadataCache.delete(filePath);
				this.enhancedMetadataTimestampCache.delete(filePath);
				clearedCount++;
			}
		}

		return clearedCount;
	}
}
