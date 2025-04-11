import localforage from "localforage";

/** A piece of data that has been cached for a specific version and time. */
export interface Cached<T> {
	/** The version of the plugin that the data was written to cache with. */
	version: string;
	/** The UNIX epoch time in milliseconds that the data was written to cache. */
	time: number;
	/** The data that was cached. */
	data: T;
}

/** Storage wrapper for persistent caching with IndexedDB/localStorage */
export class LocalStorageCache {
	/** Main storage instance */
	public persister: LocalForage;
	/** Storage namespace prefix */
	private readonly cachePrefix = "taskgenius/cache/";
	/** Whether initialization is complete */
	private initialized = false;

	/**
	 * Create a new local storage cache
	 * @param appId The application ID for the cache namespace
	 * @param version Current plugin version for cache invalidation
	 */
	constructor(
		public readonly appId: string,
		public readonly version: string
	) {
		this.persister = localforage.createInstance({
			name: this.cachePrefix + this.appId,
			driver: [localforage.INDEXEDDB],
			description: "TaskGenius metadata cache for files and tasks",
		});

		// Attempt initial setup
		this.initialize();
	}

	/**
	 * Initialize the storage backend and verify it's working
	 */
	private async initialize(): Promise<void> {
		try {
			// Test write/read
			await this.persister.setItem("__test__", true);
			await this.persister.removeItem("__test__");
			this.initialized = true;
		} catch (error) {
			console.error(
				"Failed to initialize IndexedDB cache, falling back to localStorage:",
				error
			);
			this.persister = localforage.createInstance({
				name: this.cachePrefix + this.appId,
				driver: [localforage.LOCALSTORAGE],
				description: "TaskGenius metadata fallback cache",
			});
			this.initialized = true;
		}
	}

	/**
	 * Drop and recreate the storage instance
	 */
	public async recreate(): Promise<void> {
		try {
			await localforage.dropInstance({
				name: this.cachePrefix + this.appId,
			});
		} catch (error) {
			console.error("Error dropping storage instance:", error);
		}

		this.persister = localforage.createInstance({
			name: this.cachePrefix + this.appId,
			driver: [localforage.INDEXEDDB],
			description: "TaskGenius metadata cache for files and tasks",
		});

		this.initialized = false;
		await this.initialize();
	}

	/**
	 * Load metadata for a file from cache
	 * @param path File path to load
	 * @returns Cached data or null if not found
	 */
	public async loadFile<T = any>(path: string): Promise<Cached<T> | null> {
		if (!this.initialized) await this.initialize();

		try {
			const key = this.fileKey(path);
			const data = await this.persister.getItem<Cached<T>>(key);
			return data;
		} catch (error) {
			console.error(`Error loading cache for ${path}:`, error);
			return null;
		}
	}

	/**
	 * Store metadata for a file in cache
	 * @param path File path to store
	 * @param data Data to cache
	 */
	public async storeFile<T = any>(path: string, data: T): Promise<void> {
		if (!this.initialized) await this.initialize();

		try {
			const key = this.fileKey(path);
			await this.persister.setItem(key, {
				version: this.version,
				time: Date.now(),
				data,
			} as Cached<T>);
		} catch (error) {
			console.error(`Error storing cache for ${path}:`, error);
		}
	}

	/**
	 * Remove stale file entries from cache
	 * @param existing Set of paths that should remain in cache
	 * @returns Set of removed paths
	 */
	public async synchronize(
		existing: string[] | Set<string>
	): Promise<Set<string>> {
		if (!this.initialized) await this.initialize();

		try {
			const existingPaths = new Set(existing);
			const cachedFiles = await this.allFiles();
			const staleFiles = new Set<string>();

			for (const file of cachedFiles) {
				if (!existingPaths.has(file)) {
					staleFiles.add(file);
					await this.persister.removeItem(this.fileKey(file));
				}
			}

			return staleFiles;
		} catch (error) {
			console.error("Error synchronizing cache:", error);
			return new Set();
		}
	}

	/**
	 * Get all keys in the cache
	 */
	public async allKeys(): Promise<string[]> {
		if (!this.initialized) await this.initialize();

		try {
			return await this.persister.keys();
		} catch (error) {
			console.error("Error getting cache keys:", error);
			return [];
		}
	}

	/**
	 * Get all file paths stored in cache
	 */
	public async allFiles(): Promise<string[]> {
		const filePrefix = "file:";

		try {
			const keys = await this.allKeys();
			return keys
				.filter((key) => key.startsWith(filePrefix))
				.map((key) => key.substring(filePrefix.length));
		} catch (error) {
			console.error("Error getting cached files:", error);
			return [];
		}
	}

	/**
	 * Get storage key for a file path
	 */
	public fileKey(path: string): string {
		return "file:" + path;
	}

	/**
	 * Check if a file exists in cache
	 */
	public async hasFile(path: string): Promise<boolean> {
		if (!this.initialized) await this.initialize();

		try {
			return (await this.persister.getItem(this.fileKey(path))) !== null;
		} catch {
			return false;
		}
	}

	/**
	 * Remove a file from cache
	 */
	public async removeFile(path: string): Promise<void> {
		if (!this.initialized) await this.initialize();

		try {
			await this.persister.removeItem(this.fileKey(path));
		} catch (error) {
			console.error(`Error removing cache for ${path}:`, error);
		}
	}

	/**
	 * Get cache statistics
	 */
	public async getStats(): Promise<{
		totalFiles: number;
		cacheSize: number;
	}> {
		try {
			const files = await this.allFiles();
			return {
				totalFiles: files.length,
				cacheSize: files.length,
			};
		} catch (error) {
			console.error("Error getting cache stats:", error);
			return { totalFiles: 0, cacheSize: 0 };
		}
	}

	/**
	 * Clear all entries from the cache
	 */
	public async clear(): Promise<void> {
		if (!this.initialized) await this.initialize();

		try {
			await this.persister.clear();
		} catch (error) {
			console.error("Error clearing cache:", error);

			// Fallback if clear fails: try to recreate the storage
			await this.recreate();
		}
	}
}
