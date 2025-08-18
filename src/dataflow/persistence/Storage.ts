import type { Task, TaskCache } from "../../types/task";
import { LocalStorageCache, Cached } from "../../utils/persister";

/**
 * Storage record types with versioning and hashing
 */
export interface RawRecord {
  hash: string;
  time: number;
  version: string;
  schema: number;
  data: Task[];
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
  meta: {
    version: () => `meta:version`,
    schemaVersion: () => `meta:schemaVersion`,
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
    this.currentVersion = version || "unknown";
    this.cache = new LocalStorageCache(appId, this.currentVersion);
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
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Check if a cached record is valid based on version and schema
   */
  private isVersionValid(record: { version?: string; schema?: number }): boolean {
    return record.version === this.currentVersion && 
           record.schema === this.schemaVersion;
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
        await this.cache.clearFile(Keys.raw(path));
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
  async storeRaw(path: string, tasks: Task[]): Promise<void> {
    const record: RawRecord = {
      hash: this.generateHash(tasks),
      time: Date.now(),
      version: this.currentVersion,
      schema: this.schemaVersion,
      data: tasks,
    };
    
    await this.cache.storeFile(Keys.raw(path), record);
  }

  /**
   * Check if raw tasks are valid based on content hash
   */
  isRawValid(path: string, record: RawRecord, fileContent?: string): boolean {
    if (!this.isVersionValid(record)) return false;
    
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
      const cached = await this.cache.loadFile<ProjectRecord>(Keys.project(path));
      if (!cached || !cached.data) return null;
      
      // Check version compatibility
      if (!this.isVersionValid(cached.data)) {
        await this.cache.clearFile(Keys.project(path));
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
  async storeProject(path: string, data: { tgProject?: any; enhancedMetadata: Record<string, any> }): Promise<void> {
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
      const cached = await this.cache.loadFile<AugmentedRecord>(Keys.augmented(path));
      if (!cached || !cached.data) return null;
      
      // Check version compatibility
      if (!this.isVersionValid(cached.data)) {
        await this.cache.clearFile(Keys.augmented(path));
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
   * Load consolidated task index
   */
  async loadConsolidated(): Promise<ConsolidatedRecord | null> {
    try {
      const cached = await this.cache.loadFile<ConsolidatedRecord>(Keys.consolidated());
      if (!cached || !cached.data) return null;
      
      // Check version compatibility
      if (!this.isVersionValid(cached.data)) {
        await this.cache.clearFile(Keys.consolidated());
        return null;
      }
      
      return cached.data;
    } catch (error) {
      console.error("Error loading consolidated index:", error);
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
    
    await this.cache.storeFile(Keys.consolidated(), record);
  }

  /**
   * Clear storage for a specific file
   */
  async clearFile(path: string): Promise<void> {
    await Promise.all([
      this.cache.clearFile(Keys.raw(path)),
      this.cache.clearFile(Keys.project(path)),
      this.cache.clearFile(Keys.augmented(path)),
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
  async clearNamespace(namespace: "raw" | "project" | "augmented" | "consolidated"): Promise<void> {
    // Get all keys and filter by namespace
    const allKeys = await this.cache.getKeys();
    const prefix = namespace === "consolidated" ? Keys.consolidated() : `tasks.${namespace}:`;
    
    const keysToDelete = allKeys.filter(key => key.startsWith(prefix));
    
    for (const key of keysToDelete) {
      await this.cache.clearFile(key);
    }
  }

  /**
   * Update version information
   */
  async updateVersion(version: string, schemaVersion?: number): Promise<void> {
    this.currentVersion = version;
    if (schemaVersion !== undefined) {
      this.schemaVersion = schemaVersion;
    }
    
    // Store version metadata
    await this.cache.storeFile(Keys.meta.version(), { version: this.currentVersion });
    await this.cache.storeFile(Keys.meta.schemaVersion(), { schema: this.schemaVersion });
  }

  /**
   * Load version information
   */
  async loadVersion(): Promise<{ version: string; schema: number } | null> {
    try {
      const versionData = await this.cache.loadFile<{ version: string }>(Keys.meta.version());
      const schemaData = await this.cache.loadFile<{ schema: number }>(Keys.meta.schemaVersion());
      
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
    const allKeys = await this.cache.getKeys();
    
    const byNamespace: Record<string, number> = {
      raw: 0,
      project: 0,
      augmented: 0,
      consolidated: 0,
      meta: 0,
    };
    
    for (const key of allKeys) {
      if (key.startsWith("tasks.raw:")) byNamespace.raw++;
      else if (key.startsWith("project.data:")) byNamespace.project++;
      else if (key.startsWith("tasks.augmented:")) byNamespace.augmented++;
      else if (key.startsWith("consolidated:")) byNamespace.consolidated++;
      else if (key.startsWith("meta:")) byNamespace.meta++;
    }
    
    return {
      totalKeys: allKeys.length,
      byNamespace,
    };
  }
}