import type { Task, TaskCache } from "../../types/task";
import { LocalStorageCache, Cached } from "../../cache/local-storage-cache";

/**
 * Storage record types with versioning and hashing
 */
export interface RawRecord {
	hash: string;
	time: number;
	version: string;
	schema: number;
	data: Task[];
	mtime?: number; // File modification time
}

export interface ProjectRecord {
	hash: string;
	time: number;
	version: string;
	schema: number;
	data: {
		tgProject?: any;
		enhancedMetadata: Record<string, any>;
	};
}

export interface AugmentedRecord {
	hash: string;
	time: number;
	version: string;
	schema: number;
	data: Task[];
}

export interface ConsolidatedRecord {
	time: number;
	version: string;
	schema: number;
	data: TaskCache;
}

/**
 * Storage key namespace definitions
 */
export const Keys = {
	raw: (path: string) => `tasks.raw:${path}`,
	project: (path: string) => `project.data:${path}`,
	augmented: (path: string) => `tasks.augmented:${path}`,
	consolidated: () => `consolidated:taskIndex`,
	icsEvents: () => `ics:events`,
	fileTasks: () => `file:tasks`,
	meta: {
		version: () => `meta:version`,
		schemaVersion: () => `meta:schemaVersion`,
		custom: (key: string) => `meta:${key}`,
	},
};

/**
 * Storage adapter that integrates with LocalStorageCache
 * Provides namespace management, versioning, and content hashing
 */
export class Storage {
	private cache: LocalStorageCache;
	private currentVersion: string;
	private schemaVersion: number = 1;

	constructor(appId: string, version?: string) {
		this.currentVersion = version || "1.0.0"; // Use stable version instead of "unknown"
		this.cache = new LocalStorageCache(appId, this.currentVersion);
		console.log(
			`[Storage] Initialized with appId: ${appId}, version: ${this.currentVersion}`
		);
	}

	/**
	 * Generate content hash for cache validation
	 * Using a simple hash function suitable for browser environment
	 */
	private generateHash(content: any): string {
		const str = JSON.stringify(content);
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash).toString(16);
	}

	/**
	 * Check if a cached record is valid based on version and schema
	 */
	private isVersionValid(record: {
		version?: string;
		schema?: number;
	}): boolean {
		return (
			record.version === this.currentVersion &&
			record.schema === this.schemaVersion
		);
	}

	/**
	 * Load raw tasks for a file
	 */
	async loadRaw(path: string): Promise<RawRecord | null> {
		try {
			const cached = await this.cache.loadFile<RawRecord>(Keys.raw(path));
			if (!cached || !cached.data) return null;

			// Check version compatibility
			if (!this.isVersionValid(cached.data)) {
				await this.cache.removeFile(Keys.raw(path));
				return null;
			}

			return cached.data;
		} catch (error) {
			console.error(`Error loading raw tasks for ${path}:`, error);
			return null;
		}
	}

	/**
	 * Store raw tasks for a file
	 */
	async storeRaw(
		path: string,
		tasks: Task[],
		fileContent?: string,
		mtime?: number
	): Promise<void> {
		const record: RawRecord = {
			hash: this.generateHash(fileContent || tasks),
			time: Date.now(),
			version: this.currentVersion,
			schema: this.schemaVersion,
			data: tasks,
			mtime: mtime, // Store file modification time
		};

		await this.cache.storeFile(Keys.raw(path), record);
	}

	/**
	 * Check if raw tasks are valid based on content hash and modification time
	 */
	isRawValid(
		path: string,
		record: RawRecord,
		fileContent?: string,
		mtime?: number
	): boolean {
		if (!this.isVersionValid(record)) return false;

		// Check modification time if provided
		if (mtime !== undefined && record.mtime !== undefined) {
			if (record.mtime !== mtime) {
				return false; // File has been modified
			}
		}

		// If file content provided, check hash
		if (fileContent) {
			const expectedHash = this.generateHash(fileContent);
			return record.hash === expectedHash;
		}

		return true;
	}

	/**
	 * Load project data for a file
	 */
	async loadProject(path: string): Promise<ProjectRecord | null> {
		try {
			const cached = await this.cache.loadFile<ProjectRecord>(
				Keys.project(path)
			);
			if (!cached || !cached.data) return null;

			// Check version compatibility
			if (!this.isVersionValid(cached.data)) {
				await this.cache.removeFile(Keys.project(path));
				return null;
			}

			return cached.data;
		} catch (error) {
			console.error(`Error loading project data for ${path}:`, error);
			return null;
		}
	}

	/**
	 * Store project data for a file
	 */
	async storeProject(
		path: string,
		data: { tgProject?: any; enhancedMetadata: Record<string, any> }
	): Promise<void> {
		const record: ProjectRecord = {
			hash: this.generateHash(data),
			time: Date.now(),
			version: this.currentVersion,
			schema: this.schemaVersion,
			data,
		};

		await this.cache.storeFile(Keys.project(path), record);
	}

	/**
	 * Load augmented tasks for a file
	 */
	async loadAugmented(path: string): Promise<AugmentedRecord | null> {
		try {
			const cached = await this.cache.loadFile<AugmentedRecord>(
				Keys.augmented(path)
			);
			if (!cached || !cached.data) return null;

			// Check version compatibility
			if (!this.isVersionValid(cached.data)) {
				await this.cache.removeFile(Keys.augmented(path));
				return null;
			}

			return cached.data;
		} catch (error) {
			console.error(`Error loading augmented tasks for ${path}:`, error);
			return null;
		}
	}

	/**
	 * Store augmented tasks for a file
	 */
	async storeAugmented(path: string, tasks: Task[]): Promise<void> {
		const record: AugmentedRecord = {
			hash: this.generateHash(tasks),
			time: Date.now(),
			version: this.currentVersion,
			schema: this.schemaVersion,
			data: tasks,
		};

		await this.cache.storeFile(Keys.augmented(path), record);
	}

	/**
	 * Store ICS events
	 */
	async storeIcsEvents(events: Task[]): Promise<void> {
		const record = {
			time: Date.now(),
			version: this.currentVersion,
			schema: this.schemaVersion,
			data: events,
		};

		await this.cache.storeFile(Keys.icsEvents(), record);
		console.log(`[Storage] Stored ${events.length} ICS events`);
	}

	/**
	 * Load ICS events
	 */
	async loadIcsEvents(): Promise<Task[]> {
		try {
			const cached = await this.cache.loadFile<any>(Keys.icsEvents());
			if (!cached || !cached.data) {
				return [];
			}

			// Check version compatibility
			if (!this.isVersionValid(cached.data)) {
				await this.cache.removeFile(Keys.icsEvents());
				return [];
			}

			return cached.data.data || [];
		} catch (error) {
			console.error("[Storage] Error loading ICS events:", error);
			return [];
		}
	}

	/**
	 * Store file tasks (from FileSource)
	 */
	async storeFileTasks(tasks: Map<string, Task>): Promise<void> {
		const record = {
			time: Date.now(),
			version: this.currentVersion,
			schema: this.schemaVersion,
			data: Array.from(tasks.entries()),
		};

		await this.cache.storeFile(Keys.fileTasks(), record);
		console.log(`[Storage] Stored ${tasks.size} file tasks`);
	}

	/**
	 * Load file tasks (from FileSource)
	 */
	async loadFileTasks(): Promise<Map<string, Task>> {
		try {
			const cached = await this.cache.loadFile<any>(Keys.fileTasks());
			if (!cached || !cached.data) {
				return new Map();
			}

			// Check version compatibility
			if (!this.isVersionValid(cached.data)) {
				await this.cache.removeFile(Keys.fileTasks());
				return new Map();
			}

			const entries = cached.data.data || [];
			return new Map(entries);
		} catch (error) {
			console.error("[Storage] Error loading file tasks:", error);
			return new Map();
		}
	}

	/**
	 * Load consolidated task index
	 */
	async loadConsolidated(): Promise<ConsolidatedRecord | null> {
		try {
			const cached =
				await this.cache.loadConsolidatedCache<ConsolidatedRecord>(
					"taskIndex"
				);
			if (!cached || !cached.data) {
				console.log("[Storage] No consolidated cache found");
				return null;
			}

			// Check version compatibility
			if (!this.isVersionValid(cached.data)) {
				console.log(
					"[Storage] Consolidated cache version mismatch, clearing..."
				);
				await this.cache.removeFile(Keys.consolidated());
				return null;
			}

			console.log(
				`[Storage] Loaded consolidated cache with ${
					cached.data.data ? Object.keys(cached.data.data).length : 0
				} entries`
			);
			return cached.data;
		} catch (error) {
			console.error("[Storage] Error loading consolidated index:", error);
			return null;
		}
	}

	/**
	 * Store consolidated task index
	 */
	async storeConsolidated(taskCache: TaskCache): Promise<void> {
		const record: ConsolidatedRecord = {
			time: Date.now(),
			version: this.currentVersion,
			schema: this.schemaVersion,
			data: taskCache,
		};
		const count = taskCache ? Object.keys(taskCache).length : 0;
		console.log(
			`[Storage] Storing consolidated cache with ${count} entries`
		);
		await this.cache.storeConsolidatedCache("taskIndex", record);
	}

	/**
	 * Save arbitrary meta data (small JSON)
	 */
	async saveMeta<T = any>(key: string, value: T): Promise<void> {
		await this.cache.storeFile(Keys.meta.custom(key), value as any);
	}

	/**
	 * Load arbitrary meta data
	 */
	async loadMeta<T = any>(key: string): Promise<T | null> {
		const rec = await this.cache.loadFile<T>(Keys.meta.custom(key));
		return rec?.data ?? null;
	}

	/**
	 * List all augmented paths (lightweight: from keys only)
	 */
	async listAugmentedPaths(): Promise<string[]> {
		const all = await this.cache.allFiles();
		const prefix = "tasks.augmented:";
		return all
			.filter((k) => k.startsWith(prefix))
			.map((k) => k.substring(prefix.length));
	}

	/**
	 * List all raw paths (lightweight: from keys only)
	 */
	async listRawPaths(): Promise<string[]> {
		const all = await this.cache.allFiles();
		const prefix = "tasks.raw:";
		return all
			.filter((k) => k.startsWith(prefix))
			.map((k) => k.substring(prefix.length));
	}

	/**
	 * Clear storage for a specific file
	 */
	async clearFile(path: string): Promise<void> {
		await Promise.all([
			this.cache.removeFile(Keys.raw(path)),
			this.cache.removeFile(Keys.project(path)),
			this.cache.removeFile(Keys.augmented(path)),
		]);
	}

	/**
	 * Clear all storage
	 */
	async clear(): Promise<void> {
		await this.cache.clear();
	}

	/**
	 * Clear storage for a specific namespace
	 */
	async clearNamespace(
		namespace: "raw" | "project" | "augmented" | "consolidated"
	): Promise<void> {
		// Get all file paths and filter by namespace
		const allFiles = await this.cache.allFiles();

		// Map namespace to prefix patterns
		const prefixMap = {
			raw: "tasks.raw:",
			project: "project.data:",
			augmented: "tasks.augmented:",
			consolidated: "consolidated:",
		};

		const prefix = prefixMap[namespace];
		const filesToDelete = allFiles.filter((file) =>
			file.startsWith(prefix)
		);

		for (const file of filesToDelete) {
			await this.cache.removeFile(file);
		}
	}

	/**
	 * Update version information
	 */
	async updateVersion(
		version: string,
		schemaVersion?: number
	): Promise<void> {
		this.currentVersion = version;
		if (schemaVersion !== undefined) {
			this.schemaVersion = schemaVersion;
		}

		// Store version metadata
		await this.cache.storeFile(Keys.meta.version(), {
			version: this.currentVersion,
		});
		await this.cache.storeFile(Keys.meta.schemaVersion(), {
			schema: this.schemaVersion,
		});
	}

	/**
	 * Load version information
	 */
	async loadVersion(): Promise<{ version: string; schema: number } | null> {
		try {
			const versionData = await this.cache.loadFile<{ version: string }>(
				Keys.meta.version()
			);
			const schemaData = await this.cache.loadFile<{ schema: number }>(
				Keys.meta.schemaVersion()
			);

			if (versionData && schemaData) {
				return {
					version: versionData.data.version,
					schema: schemaData.data.schema,
				};
			}
		} catch (error) {
			console.error("Error loading version information:", error);
		}

		return null;
	}

	/**
	 * Get storage statistics
	 */
	async getStats(): Promise<{
		totalKeys: number;
		byNamespace: Record<string, number>;
	}> {
		const allFiles = await this.cache.allFiles();

		const byNamespace: Record<string, number> = {
			raw: 0,
			project: 0,
			augmented: 0,
			consolidated: 0,
			meta: 0,
		};

		for (const file of allFiles) {
			if (file.startsWith("tasks.raw:")) byNamespace.raw++;
			else if (file.startsWith("project.data:")) byNamespace.project++;
			else if (file.startsWith("tasks.augmented:"))
				byNamespace.augmented++;
			else if (file.startsWith("consolidated:"))
				byNamespace.consolidated++;
			else if (file.startsWith("meta:")) byNamespace.meta++;
		}

		return {
			totalKeys: allFiles.length,
			byNamespace,
		};
	}
}
