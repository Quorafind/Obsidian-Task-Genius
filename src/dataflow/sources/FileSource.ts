/**
 * FileSource - Main implementation for FileSource feature
 *
 * This source integrates files as tasks into the dataflow architecture.
 * It follows the same patterns as ObsidianSource and IcsSource.
 */

import type { App, TFile, EventRef, CachedMetadata } from "obsidian";
import type { Task } from "@/types/task";
import type {
	FileSourceConfiguration,
	FileSourceTaskMetadata,
	FileSourceStats,
	FileTaskCache,
	RecognitionStrategy,
	PathRecognitionConfig,
	TemplateRecognitionConfig,
} from "@/types/file-source";

import { Events, emit, Seq, on } from "../events/Events";
import { FileSourceConfig } from "./FileSourceConfig";

import { FileFilterManager } from "@/managers/file-filter-manager";

/**
 * FileSource - Independent event source for file-based tasks
 *
 * Subscribes to file events and transforms qualifying files into tasks
 * following the established dataflow patterns.
 */
export class FileSource {
	private config: FileSourceConfig;
	private isInitialized = false;
	private lastUpdateSeq = 0;

	// Event references for cleanup
	private eventRefs: EventRef[] = [];

	// Cache for tracking file task state
	private fileTaskCache = new Map<string, FileTaskCache>();

	// Debouncing for rapid changes
	private pendingUpdates = new Map<string, NodeJS.Timeout>();
	private readonly DEBOUNCE_DELAY = 300; // ms

	// Statistics tracking
	private stats: FileSourceStats = {
		initialized: false,
		trackedFileCount: 0,
		recognitionBreakdown: {
			metadata: 0,
			tag: 0,
			template: 0,
			path: 0,
		},
		lastUpdate: 0,
		lastUpdateSeq: 0,
	};

	constructor(
		private app: App,
		initialConfig?: Partial<FileSourceConfiguration>,
		private fileFilterManager?: FileFilterManager,
	) {
		this.config = new FileSourceConfig(initialConfig);
	}

	/**
	 * Initialize FileSource and start listening for events
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) return;
		if (!this.config.isEnabled()) return;

		console.log("[FileSource] Initializing FileSource...");

		// Subscribe to configuration changes
		this.config.onChange((newConfig) => {
			this.handleConfigChange(newConfig);
		});

		// Subscribe to file events
		this.subscribeToFileEvents();

		this.isInitialized = true;
		this.stats.initialized = true;

		try {
			await this.performInitialScan();
		} catch (error) {
			console.error("[FileSource] Initial scan failed", error);
		}

		console.log(
			`[FileSource] Initialized with strategies: ${this.config
				.getEnabledStrategies()
				.join(", ")}`,
		);
	}

	/**
	 * Subscribe to relevant file events
	 */
	private subscribeToFileEvents(): void {
		// Subscribe to FILE_UPDATED events from ObsidianSource
		this.eventRefs.push(
			on(this.app, Events.FILE_UPDATED, (payload) => {
				if (payload?.path) {
					this.handleFileUpdate(payload.path, payload.reason);
				}
			}),
		);

		// Subscribe to more granular events if they exist
		// These would be added to Events.ts later in Phase 2
		this.eventRefs.push(
			on(
				this.app,
				"task-genius:file-metadata-changed" as any,
				(payload) => {
					if (payload?.path) {
						this.handleFileMetadataChange(payload.path);
					}
				},
			),
		);

		this.eventRefs.push(
			on(
				this.app,
				"task-genius:file-content-changed" as any,
				(payload) => {
					if (payload?.path) {
						this.handleFileContentChange(payload.path);
					}
				},
			),
		);
	}

	/**
	 * Handle file update events with debouncing
	 */
	private handleFileUpdate(filePath: string, reason: string): void {
		if (!this.isInitialized || !this.config.isEnabled()) return;
		const relevant = this.isRelevantFile(filePath);

		if (!relevant) return;

		// Clear existing timeout for this file
		const existingTimeout = this.pendingUpdates.get(filePath);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
		}

		// Set new debounced timeout
		const timeout = setTimeout(async () => {
			this.pendingUpdates.delete(filePath);

			try {
				await this.processFileUpdate(filePath, reason);
			} catch (error) {
				console.error(
					`[FileSource] Error processing file update for ${filePath}:`,
					error,
				);
			}
		}, this.DEBOUNCE_DELAY);

		this.pendingUpdates.set(filePath, timeout);
	}

	/**
	 * Handle granular metadata changes (Phase 2 enhancement)
	 */
	private handleFileMetadataChange(filePath: string): void {
		if (!this.shouldUpdateFileTask(filePath, "metadata")) return;
		this.handleFileUpdate(filePath, "frontmatter");
	}

	/**
	 * Handle granular content changes (Phase 2 enhancement)
	 */
	private handleFileContentChange(filePath: string): void {
		if (!this.shouldUpdateFileTask(filePath, "content")) return;
		this.handleFileUpdate(filePath, "modify");
	}

	/**
	 * Process a file update and determine if it should be a file task
	 */
	private async processFileUpdate(
		filePath: string,
		reason: string,
	): Promise<void> {
		if (reason === "delete") {
			await this.removeFileTask(filePath);
			return;
		}

		const shouldBeTask = await this.shouldCreateFileTask(filePath);
		const existingCache = this.fileTaskCache.get(filePath);
		const wasTask = existingCache?.fileTaskExists ?? false;

		if (shouldBeTask && !wasTask) {
			// File should become a task
			await this.createFileTask(filePath);
		} else if (shouldBeTask && wasTask) {
			// File is already a task, check if it needs updating
			await this.updateFileTask(filePath);
		} else if (!shouldBeTask && wasTask) {
			// File should no longer be a task
			await this.removeFileTask(filePath);
		}
		// else: File is not and should not be a task, do nothing
	}

	/**
	 * Check if a file should be treated as a task
	 */
	async shouldCreateFileTask(filePath: string): Promise<boolean> {
		// Fast reject non-relevant files before any IO
		if (!this.isRelevantFile(filePath)) return false;

		const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
		if (!file) return false;

		try {
			const fileContent = await this.app.vault.cachedRead(file);
			const fileCache = this.app.metadataCache.getFileCache(file);

			return this.evaluateRecognitionStrategies(
				filePath,
				fileContent,
				fileCache,
			);
		} catch (error) {
			console.error(
				`[FileSource] Error reading file ${filePath}:`,
				error,
			);
			return false;
		}
	}

	/**
	 * Evaluate all enabled recognition strategies
	 */
	private evaluateRecognitionStrategies(
		filePath: string,
		fileContent: string,
		fileCache: CachedMetadata | null,
	): boolean {
		const config = this.config.getConfig();
		const { recognitionStrategies } = config;

		// Check metadata strategy
		if (recognitionStrategies.metadata.enabled) {
			if (
				this.matchesMetadataStrategy(
					filePath,
					fileContent,
					fileCache,
					recognitionStrategies.metadata,
				)
			) {
				return true;
			}
		}

		// Check tag strategy
		if (recognitionStrategies.tags.enabled) {
			if (
				this.matchesTagStrategy(
					filePath,
					fileContent,
					fileCache,
					recognitionStrategies.tags,
				)
			) {
				return true;
			}
		}

		// Check template strategy (Phase 2)
		if (recognitionStrategies.templates.enabled) {
			if (
				this.matchesTemplateStrategy(
					filePath,
					fileContent,
					fileCache,
					recognitionStrategies.templates,
				)
			) {
				return true;
			}
		}

		// Check path strategy (Phase 2)
		if (recognitionStrategies.paths.enabled) {
			if (
				this.matchesPathStrategy(
					filePath,
					fileContent,
					fileCache,
					recognitionStrategies.paths,
				)
			) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check if file matches metadata strategy
	 */
	private matchesMetadataStrategy(
		filePath: string,
		fileContent: string,
		fileCache: CachedMetadata | null,
		config: any,
	): boolean {
		if (!fileCache?.frontmatter) return false;

		const { taskFields, requireAllFields } = config;
		const frontmatter = fileCache.frontmatter;

		const matchingFields = taskFields.filter(
			(field: string) =>
				frontmatter.hasOwnProperty(field) &&
				frontmatter[field] !== undefined,
		);

		if (requireAllFields) {
			return matchingFields.length === taskFields.length;
		} else {
			return matchingFields.length > 0;
		}
	}

	/**
	 * Check if file matches tag strategy
	 */
	private matchesTagStrategy(
		filePath: string,
		fileContent: string,
		fileCache: CachedMetadata | null,
		config: any,
	): boolean {
		if (!fileCache?.tags) return false;

		const { taskTags, matchMode } = config;
		const fileTags = fileCache.tags.map((tag) => tag.tag);

		return taskTags.some((taskTag: string) => {
			return fileTags.some((fileTag) => {
				switch (matchMode) {
					case "exact":
						return fileTag === taskTag;
					case "prefix":
						return fileTag.startsWith(taskTag);
					case "contains":
						return fileTag.includes(taskTag);
					default:
						return fileTag === taskTag;
				}
			});
		});
	}

	/**
	 * Check if file matches template strategy
	 */
	private matchesTemplateStrategy(
		filePath: string,
		fileContent: string,
		fileCache: CachedMetadata | null,
		config: TemplateRecognitionConfig,
	): boolean {
		if (
			!config.enabled ||
			!config.templatePaths ||
			config.templatePaths.length === 0
		) {
			return false;
		}

		// Check if file matches any template path
		return config.templatePaths.some((templatePath) => {
			// Check direct path inclusion
			if (filePath.includes(templatePath)) {
				return true;
			}

			// Check frontmatter template references
			if (config.checkTemplateMetadata && fileCache?.frontmatter) {
				const frontmatter = fileCache.frontmatter;
				return (
					frontmatter.template === templatePath ||
					frontmatter.templateFile === templatePath ||
					frontmatter.templatePath === templatePath
				);
			}

			return false;
		});
	}

	/**
	 * Check if file matches path strategy
	 */
	private matchesPathStrategy(
		filePath: string,
		fileContent: string,
		fileCache: CachedMetadata | null,
		config: PathRecognitionConfig,
	): boolean {
		if (
			!config.enabled ||
			!config.taskPaths ||
			config.taskPaths.length === 0
		) {
			return false;
		}

		// Normalize path (use forward slashes)
		const normalizedPath = filePath.replace(/\\/g, "/");

		// Check each configured path pattern
		for (const pattern of config.taskPaths) {
			const normalizedPattern = pattern.replace(/\\/g, "/");

			switch (config.matchMode) {
				case "prefix":
					if (normalizedPath.startsWith(normalizedPattern)) {
						console.log(
							`[FileSource] Path matches prefix pattern: ${pattern} for ${filePath}`,
						);
						return true;
					}
					break;

				case "regex":
					try {
						const regex = new RegExp(normalizedPattern);
						if (regex.test(normalizedPath)) {
							console.log(
								`[FileSource] Path matches regex pattern: ${pattern} for ${filePath}`,
							);
							return true;
						}
					} catch (e) {
						console.warn(
							`[FileSource] Invalid regex pattern: ${pattern}`,
							e,
						);
					}
					break;

				case "glob":
					if (
						this.matchGlobPattern(normalizedPath, normalizedPattern)
					) {
						console.log(
							`[FileSource] Path matches glob pattern: ${pattern} for ${filePath}`,
						);
						return true;
					}
					break;
			}
		}

		return false;
	}

	/**
	 * Match a path against a glob pattern
	 * Supports: * (any chars except /), ** (any chars), ? (single char)
	 */
	private matchGlobPattern(path: string, pattern: string): boolean {
		// Convert glob pattern to regular expression
		let regexPattern = pattern
			.replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special chars
			.replace(/\*\*/g, "§§§") // Temporary placeholder for **
			.replace(/\*/g, "[^/]*") // * matches any chars except /
			.replace(/§§§/g, ".*") // ** matches any chars
			.replace(/\?/g, "[^/]"); // ? matches single char

		// If pattern ends with /, match all files in that directory
		if (pattern.endsWith("/")) {
			regexPattern = `^${regexPattern}.*`;
		} else {
			regexPattern = `^${regexPattern}$`;
		}

		try {
			const regex = new RegExp(regexPattern);
			return regex.test(path);
		} catch (e) {
			console.warn(
				`[FileSource] Failed to compile glob pattern: ${pattern}`,
				e,
			);
			return false;
		}
	}

	/**
	 * Create a new file task
	 */
	async createFileTask(
		filePath: string,
	): Promise<Task<FileSourceTaskMetadata> | null> {
		const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
		if (!file) return null;

		try {
			const fileContent = await this.app.vault.cachedRead(file);
			const fileCache = this.app.metadataCache.getFileCache(file);

			const fileTask = await this.buildFileTask(
				filePath,
				fileContent,
				fileCache,
			);
			if (!fileTask) return null;

			// Update cache
			this.updateFileTaskCache(filePath, fileTask);

			// Update statistics
			this.updateStatistics(fileTask.metadata.recognitionStrategy, 1);

			// Emit file task event
			this.emitFileTaskUpdate("created", fileTask);

			return fileTask;
		} catch (error) {
			console.error(
				`[FileSource] Error creating file task for ${filePath}:`,
				error,
			);
			return null;
		}
	}

	/**
	 * Update an existing file task
	 */
	async updateFileTask(
		filePath: string,
	): Promise<Task<FileSourceTaskMetadata> | null> {
		// For Phase 1, just recreate the task
		// Phase 2 will add smart update detection
		return await this.createFileTask(filePath);
	}

	/**
	 * Remove a file task
	 */
	async removeFileTask(filePath: string): Promise<void> {
		const existingCache = this.fileTaskCache.get(filePath);
		if (!existingCache?.fileTaskExists) return;

		// Remove from cache
		this.fileTaskCache.delete(filePath);

		// Update statistics
		this.stats.trackedFileCount = Math.max(
			0,
			this.stats.trackedFileCount - 1,
		);

		// Emit removal event
		const seq = Seq.next();
		this.lastUpdateSeq = seq;

		emit(this.app, Events.FILE_TASK_REMOVED, {
			filePath,
			timestamp: Date.now(),
			seq,
		});

		console.log(`[FileSource] Removed file task: ${filePath}`);
	}

	/**
	 * Build a file task from file data
	 */
	private async buildFileTask(
		filePath: string,
		fileContent: string,
		fileCache: CachedMetadata | null,
	): Promise<Task<FileSourceTaskMetadata> | null> {
		const config = this.config.getConfig();
		const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
		if (!file) return null;

		// Determine which strategy matched
		const strategy = this.getMatchingStrategy(
			filePath,
			fileContent,
			fileCache,
		);
		if (!strategy) return null;

		// Generate task content based on configuration
		const content = this.generateTaskContent(
			filePath,
			fileContent,
			fileCache,
		);
		const safeContent =
			typeof content === "string"
				? content
				: filePath.split("/").pop() || filePath;

		// Extract metadata from frontmatter
		const metadata = this.extractTaskMetadata(
			filePath,
			fileContent,
			fileCache,
			strategy,
		);

		// Create the file task
		const fileTask: Task<FileSourceTaskMetadata> = {
			id: `file-source:${filePath}`,
			content: safeContent,
			filePath,
			line: 0, // File tasks are at line 0
			completed: metadata.status === "x" || metadata.status === "X",
			status: metadata.status || config.fileTaskProperties.defaultStatus,
			originalMarkdown: `**${safeContent}**`,
			metadata: {
				...metadata,
				source: "file-source",
				recognitionStrategy: strategy.name,
				recognitionCriteria: strategy.criteria,
				fileTimestamps: {
					created: file.stat.ctime,
					modified: file.stat.mtime,
				},
				childTasks: [], // Will be populated in Phase 3
				tags: metadata.tags || [],
				children: [], // Required by StandardTaskMetadata
			},
		};

		return fileTask;
	}

	/**
	 * Get the matching recognition strategy for a file
	 */
	private getMatchingStrategy(
		filePath: string,
		fileContent: string,
		fileCache: CachedMetadata | null,
	): { name: RecognitionStrategy; criteria: string } | null {
		const config = this.config.getConfig();

		if (
			config.recognitionStrategies.metadata.enabled &&
			this.matchesMetadataStrategy(
				filePath,
				fileContent,
				fileCache,
				config.recognitionStrategies.metadata,
			)
		) {
			return { name: "metadata", criteria: "frontmatter" };
		}

		if (
			config.recognitionStrategies.tags.enabled &&
			this.matchesTagStrategy(
				filePath,
				fileContent,
				fileCache,
				config.recognitionStrategies.tags,
			)
		) {
			return { name: "tag", criteria: "file-tags" };
		}

		// Check path strategy
		if (
			config.recognitionStrategies.paths.enabled &&
			this.matchesPathStrategy(
				filePath,
				fileContent,
				fileCache,
				config.recognitionStrategies.paths,
			)
		) {
			return {
				name: "path",
				criteria:
					config.recognitionStrategies.paths.taskPaths.join(", "),
			};
		}

		// Template-based recognition
		const templateConfig = config.recognitionStrategies.templates;
		if (templateConfig.enabled && templateConfig.templatePaths.length > 0) {
			// Check if file matches any template path
			const matchesTemplate = templateConfig.templatePaths.some(
				(templatePath) => {
					// Simple path matching - could be enhanced with more sophisticated matching
					return (
						filePath.includes(templatePath) ||
						fileCache?.frontmatter?.template === templatePath ||
						fileCache?.frontmatter?.templateFile === templatePath
					);
				},
			);

			if (matchesTemplate) {
				return {
					name: "template",
					criteria: templateConfig.templatePaths.join(", "),
				};
			}
		}

		return null;
	}

	/**
	 * Generate task content based on configuration
	 */
	private generateTaskContent(
		filePath: string,
		fileContent: string,
		fileCache: CachedMetadata | null,
	): string {
		const config = this.config.getConfig().fileTaskProperties;
		const fileName = filePath.split("/").pop() || filePath;
		const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");

		switch (config.contentSource) {
			case "filename":
				// If user prefers frontmatter title, show it over filename
				if (
					config.preferFrontmatterTitle &&
					fileCache?.frontmatter?.title
				) {
					return fileCache.frontmatter.title as string;
				}
				return config.stripExtension ? fileNameWithoutExt : fileName;

			case "title":
				// Always prefer frontmatter title if available, fallback to filename without extension
				return (
					(fileCache?.frontmatter?.title as string) ||
					fileNameWithoutExt
				);

			case "h1":
				const h1 = fileCache?.headings?.find((h) => h.level === 1);
				return (h1?.heading as string) || fileNameWithoutExt;

			case "custom":
				if (config.customContentField && fileCache?.frontmatter) {
					const val =
						fileCache.frontmatter[config.customContentField];
					if (val) return val as string;
					// If custom field not present, optionally prefer frontmatter title
					if (
						config.preferFrontmatterTitle &&
						fileCache.frontmatter.title
					) {
						return fileCache.frontmatter.title as string;
					}
					return fileNameWithoutExt;
				}
				// No custom field specified: optionally prefer frontmatter title
				if (
					config.preferFrontmatterTitle &&
					fileCache?.frontmatter?.title
				) {
					return fileCache.frontmatter.title as string;
				}
				return fileNameWithoutExt;

			default:
				// Default to respecting preferFrontmatterTitle when available
				if (
					config.preferFrontmatterTitle &&
					fileCache?.frontmatter?.title
				) {
					return fileCache.frontmatter.title as string;
				}
				return config.stripExtension ? fileNameWithoutExt : fileName;
		}
	}

	/**
	 * Extract task metadata from file
	 */
	private extractTaskMetadata(
		filePath: string,
		fileContent: string,
		fileCache: CachedMetadata | null,
		strategy: { name: RecognitionStrategy; criteria: string },
	): Partial<FileSourceTaskMetadata> {
		const config = this.config.getConfig();
		const frontmatter = fileCache?.frontmatter || {};

		// Derive status from frontmatter and eagerly map textual metadata to a symbol
		const rawStatus = frontmatter.status ?? "";
		const toSymbol = (val: string): string => {
			if (!val) return config.fileTaskProperties.defaultStatus;
			// Already a single-character mark
			if (val.length === 1) return val;
			const sm = this.config.getConfig().statusMapping;
			const target = sm.caseSensitive ? val : String(val).toLowerCase();
			// Try configured metadata->symbol table first
			for (const [k, sym] of Object.entries(sm.metadataToSymbol || {})) {
				const key = sm.caseSensitive ? k : k.toLowerCase();
				if (key === target) return sym;
			}
			// Fallback to common defaults to be robust
			const defaults: Record<string, string> = {
				completed: "x",
				done: "x",
				finished: "x",
				"in-progress": "/",
				"in progress": "/",
				doing: "/",
				planned: "?",
				todo: "?",
				cancelled: "-",
				canceled: "-",
				"not-started": " ",
				"not started": " ",
			};
			const norm = String(val).toLowerCase();
			if (defaults[norm] !== undefined) return defaults[norm];
			return config.fileTaskProperties.defaultStatus;
		};
		let status = rawStatus
			? toSymbol(rawStatus)
			: config.fileTaskProperties.defaultStatus;
		if (rawStatus && status !== rawStatus) {
			console.log(
				`[FileSource] Mapped status '${rawStatus}' to '${status}' for ${filePath}`,
			);
		}

		// TODO: Future enhancement - read frontmatter.repeat and map into FileSourceTaskMetadata (e.g., as recurrence)

		// Extract standard task metadata
		const metadata: Partial<FileSourceTaskMetadata> = {
			dueDate: this.parseDate(frontmatter.dueDate || frontmatter.due),
			startDate: this.parseDate(
				frontmatter.startDate || frontmatter.start,
			),
			scheduledDate: this.parseDate(
				frontmatter.scheduledDate || frontmatter.scheduled,
			),
			priority:
				frontmatter.priority ||
				config.fileTaskProperties.defaultPriority,
			project: frontmatter.project,
			context: frontmatter.context,
			area: frontmatter.area,
			tags: fileCache?.tags?.map((tag) => tag.tag) || [],
			status: status,
			children: [],
		};

		return metadata;
	}

	/**
	 * Convert a task symbol back to metadata value for file updates
	 * This will be used in Phase 3 when implementing file task updates
	 */
	private mapSymbolToFileMetadata(symbol: string): string {
		const config = this.config.getConfig();

		if (!config.statusMapping.enabled) {
			return symbol;
		}

		// Map symbol back to preferred metadata value
		return this.config.mapSymbolToMetadata(symbol);
	}

	/**
	 * Parse date from various formats
	 */
	private parseDate(dateValue: any): number | undefined {
		if (!dateValue) return undefined;

		if (typeof dateValue === "number") {
			return dateValue;
		}

		if (typeof dateValue === "string") {
			const parsed = Date.parse(dateValue);
			return isNaN(parsed) ? undefined : parsed;
		}

		if (dateValue instanceof Date) {
			return dateValue.getTime();
		}

		return undefined;
	}

	/**
	 * Update file task cache
	 */
	private updateFileTaskCache(
		filePath: string,
		task: Task<FileSourceTaskMetadata>,
	): void {
		const frontmatterHash = this.generateFrontmatterHash(filePath);

		this.fileTaskCache.set(filePath, {
			fileTaskExists: true,
			frontmatterHash,
			childTaskIds: new Set(task.metadata.childTasks || []),
			lastUpdated: Date.now(),
		});
	}

	/**
	 * Generate hash for frontmatter for change detection
	 */
	private generateFrontmatterHash(filePath: string): string {
		const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
		if (!file) return "";

		const fileCache = this.app.metadataCache.getFileCache(file);
		if (!fileCache?.frontmatter) return "";

		// Simple hash of frontmatter JSON
		const frontmatterStr = JSON.stringify(
			fileCache.frontmatter,
			Object.keys(fileCache.frontmatter).sort(),
		);
		return this.simpleHash(frontmatterStr);
	}

	/**
	 * Simple hash function
	 */
	private simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return hash.toString(36);
	}

	/**
	 * Check if file needs updating (stub for Phase 2)
	 */
	private shouldUpdateFileTask(
		filePath: string,
		changeType: "metadata" | "content",
	): boolean {
		// Simple check for Phase 1 - always update if file is tracked
		return this.fileTaskCache.has(filePath);
	}

	/**
	 * Update statistics
	 */
	private updateStatistics(
		strategy: RecognitionStrategy,
		delta: number,
	): void {
		this.stats.recognitionBreakdown[strategy] += delta;
		this.stats.trackedFileCount += delta;
		this.stats.lastUpdate = Date.now();
		this.stats.lastUpdateSeq = this.lastUpdateSeq;
	}

	/**
	 * Emit file task update event
	 */
	private emitFileTaskUpdate(
		action: "created" | "updated" | "removed",
		task: Task<FileSourceTaskMetadata>,
	): void {
		const seq = Seq.next();
		this.lastUpdateSeq = seq;

		emit(this.app, Events.FILE_TASK_UPDATED, {
			action,
			task,
			timestamp: Date.now(),
			seq,
		});

		console.log(`[FileSource] File task ${action}: ${task.filePath}`);
	}

	/**
	 * Check if file is relevant for processing
	 */
	private isRelevantFile(filePath: string): boolean {
		// Fast-path filters first
		// Only process markdown files for now (additional file type support can be added later)
		if (!filePath.endsWith(".md")) {
			return false;
		}

		// Skip system/hidden files
		if (filePath.startsWith(".") || filePath.includes("/.")) {
			return false;
		}

		// Apply centralized FileFilterManager for 'file' scope filtering if available
		if (this.fileFilterManager) {
			const include = this.fileFilterManager.shouldIncludePath(
				filePath,
				"file",
			);
			if (!include) return false;
		}

		return true;
	}

	/**
	 * Perform initial scan of existing files
	 */
	private async performInitialScan(): Promise<void> {
		console.log("[FileSource] Performing initial scan...");

		const mdFiles = this.app.vault.getMarkdownFiles();
		console.log(
			`[FileSource] Found ${mdFiles.length} markdown files to check`,
		);

		let scannedCount = 0;
		let taskCount = 0;
		let relevantCount = 0;

		for (const file of mdFiles) {
			if (this.isRelevantFile(file.path)) {
				relevantCount++;
				try {
					const shouldBeTask = await this.shouldCreateFileTask(
						file.path,
					);
					if (shouldBeTask) {
						const task = await this.createFileTask(file.path);
						if (task) {
							taskCount++;
						}
					}
					scannedCount++;
				} catch (error) {
					console.error(
						`[FileSource] Error scanning ${file.path}:`,
						error,
					);
				}
			}
		}

		console.log(
			`[FileSource] Initial scan complete: ${mdFiles.length} total files, ${relevantCount} relevant, ${scannedCount} scanned, ${taskCount} file tasks created`,
		);

		if (taskCount === 0 && relevantCount > 0) {
			console.log(
				`[FileSource] No file tasks created. Check if your files match the configured recognition strategies:`,
			);
			const config = this.config.getConfig();
			if (config.recognitionStrategies.metadata.enabled) {
				console.log(
					`[FileSource] - Metadata strategy: requires frontmatter with fields: ${config.recognitionStrategies.metadata.taskFields.join(
						", ",
					)}`,
				);
			}
			if (config.recognitionStrategies.tags.enabled) {
				console.log(
					`[FileSource] - Tag strategy: requires tags: ${config.recognitionStrategies.tags.taskTags.join(
						", ",
					)}`,
				);
			}
			if (config.recognitionStrategies.paths.enabled) {
				console.log(
					`[FileSource] - Path strategy: requires files in paths: ${config.recognitionStrategies.paths.taskPaths.join(
						", ",
					)}`,
				);
			}
		}
	}

	/**
	 * Handle configuration changes
	 */
	private handleConfigChange(newConfig: FileSourceConfiguration): void {
		if (!newConfig.enabled && this.isInitialized) {
			// FileSource is being disabled
			this.destroy();
			return;
		}

		if (newConfig.enabled && !this.isInitialized) {
			// FileSource is being enabled
			this.initialize();
			return;
		}

		// Configuration changed while active - might need to rescan
		// This is a Phase 2 enhancement
		console.log("[FileSource] Configuration updated");
	}

	/**
	 * Get current statistics
	 */
	getStats(): FileSourceStats {
		return { ...this.stats };
	}

	/**
	 * Get all file tasks (stub for Phase 2)
	 */
	async getAllFileTasks(): Promise<Task<FileSourceTaskMetadata>[]> {
		// This will be implemented properly in Phase 3 with Repository integration
		return [];
	}

	/**
	 * Update configuration
	 */
	updateConfiguration(config: Partial<FileSourceConfiguration>): void {
		this.config.updateConfig(config);
	}

	/**
	 * Sync FileSource status mapping from plugin TaskStatus settings
	 */
	public syncStatusMappingFromSettings(
		taskStatuses: Record<string, string>,
	): void {
		try {
			this.config.syncWithTaskStatuses(taskStatuses);
		} catch (e) {
			console.warn(
				"[FileSource] Failed to sync status mapping from settings",
				e,
			);
		}
	}

	/**
	 * Alias for updateConfiguration to match expected interface
	 */
	updateConfig(config: Partial<FileSourceConfiguration>): void {
		this.updateConfiguration(config);
	}

	/**
	 * Force refresh of all file tasks
	 */
	async refresh(): Promise<void> {
		if (!this.isInitialized || !this.config.isEnabled()) return;

		// Clear cache and re-scan
		this.fileTaskCache.clear();
		this.stats.trackedFileCount = 0;
		this.stats.recognitionBreakdown = {
			metadata: 0,
			tag: 0,
			template: 0,
			path: 0,
		};

		await this.performInitialScan();
	}

	/**
	 * Cleanup and destroy FileSource
	 */
	destroy(): void {
		if (!this.isInitialized) return;

		console.log("[FileSource] Destroying FileSource...");

		// Clear all debouncing timeouts
		for (const timeout of this.pendingUpdates.values()) {
			clearTimeout(timeout);
		}
		this.pendingUpdates.clear();

		// Clear event listeners
		for (const ref of this.eventRefs) {
			this.app.vault.offref(ref);
		}
		this.eventRefs = [];

		// Clear cache
		this.fileTaskCache.clear();

		// Reset statistics
		this.stats = {
			initialized: false,
			trackedFileCount: 0,
			recognitionBreakdown: { metadata: 0, tag: 0, template: 0, path: 0 },
			lastUpdate: 0,
			lastUpdateSeq: 0,
		};

		// Emit cleanup event
		emit(this.app, Events.FILE_TASK_REMOVED, {
			filePath: null, // Indicates all file tasks removed
			timestamp: Date.now(),
			seq: Seq.next(),
			destroyed: true,
		});

		this.isInitialized = false;

		console.log("[FileSource] Cleanup complete");
	}

	/**
	 * Cleanup resources and stop listening to events
	 */
	cleanup(): void {
		// Unsubscribe from all events
		this.eventRefs.forEach((ref) => {
			if (
				this.app.workspace &&
				typeof this.app.workspace.offref === "function"
			) {
				this.app.workspace.offref(ref);
			}
		});
		this.eventRefs = [];

		// Clear pending updates
		this.pendingUpdates.forEach((timeout) => clearTimeout(timeout));
		this.pendingUpdates.clear();

		// Clear cache
		this.fileTaskCache.clear();

		// Reset state
		this.isInitialized = false;
		this.stats.initialized = false;

		console.log("[FileSource] Cleaned up and stopped");
	}
}
