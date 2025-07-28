/**
 * Unified Project Data Cache Manager
 *
 * Migrated from original ProjectDataCache to the new unified parsing system.
 * Provides high-performance caching using the UnifiedCacheManager infrastructure.
 */

import { Component, TFile, Vault, MetadataCache } from "obsidian";
import { TgProject } from "../../types/task";
import { ProjectConfigManager } from "../managers/ProjectConfigManager";
import { UnifiedCacheManager } from "../core/UnifiedCacheManager";
import { ParseEventManager } from "../core/ParseEventManager";
import { ParseEventType } from "../events/ParseEvents";
import { CacheType } from "../types/ParsingTypes";

export interface CachedProjectData {
    tgProject?: TgProject;
    enhancedMetadata: Record<string, any>;
    timestamp: number;
    configSource?: string;
}

export interface DirectoryCache {
    configFile?: TFile;
    configData?: Record<string, any>;
    configTimestamp: number;
    paths: Set<string>;
}

export interface ProjectCacheStats {
    totalFiles: number;
    cachedFiles: number;
    directoryCacheHits: number;
    configCacheHits: number;
    lastUpdateTime: number;
    unifiedCacheEnabled: boolean;
}

export class ProjectDataCache extends Component {
    private vault: Vault;
    private metadataCache: MetadataCache;
    private projectConfigManager: ProjectConfigManager;
    private unifiedCache?: UnifiedCacheManager;
    private eventManager?: ParseEventManager;

    // Legacy caches (maintained for backward compatibility)
    private fileCache = new Map<string, CachedProjectData>();
    private directoryCache = new Map<string, DirectoryCache>();

    // Batch processing optimization
    private pendingUpdates = new Set<string>();
    private batchUpdateTimer?: NodeJS.Timeout;
    private readonly BATCH_DELAY = 100; // ms

    // Statistics
    private stats: ProjectCacheStats = {
        totalFiles: 0,
        cachedFiles: 0,
        directoryCacheHits: 0,
        configCacheHits: 0,
        lastUpdateTime: Date.now(),
        unifiedCacheEnabled: false
    };

    constructor(
        vault: Vault,
        metadataCache: MetadataCache,
        projectConfigManager: ProjectConfigManager,
        unifiedCache?: UnifiedCacheManager,
        eventManager?: ParseEventManager
    ) {
        super();
        this.vault = vault;
        this.metadataCache = metadataCache;
        this.projectConfigManager = projectConfigManager;
        this.unifiedCache = unifiedCache;
        this.eventManager = eventManager;
        this.stats.unifiedCacheEnabled = !!unifiedCache;

        // Add as child component for lifecycle management
        this.addChild(this.projectConfigManager);

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Listen for file changes to invalidate caches
        this.registerEvent(
            this.vault.on('modify', (file) => {
                this.invalidateFileCache(file.path);
                this.scheduleUpdate(file.path);
            })
        );

        this.registerEvent(
            this.vault.on('delete', (file) => {
                this.invalidateFileCache(file.path);
                this.removeFromCache(file.path);
            })
        );

        this.registerEvent(
            this.vault.on('rename', (file, oldPath) => {
                this.invalidateFileCache(oldPath);
                this.invalidateFileCache(file.path);
                this.removeFromCache(oldPath);
                this.scheduleUpdate(file.path);
            })
        );

        // Listen for metadata changes
        this.registerEvent(
            this.metadataCache.on('changed', (file) => {
                this.invalidateFileCache(file.path);
                this.scheduleUpdate(file.path);
            })
        );

        // Listen for project config changes
        if (this.eventManager) {
            this.registerEvent(
                this.eventManager.subscribe(ParseEventType.PROJECT_CONFIG_CHANGED, (data) => {
                    this.invalidateDirectoryCache(data.filePath);
                })
            );

            this.registerEvent(
                this.eventManager.subscribe(ParseEventType.PROJECT_CONFIG_UPDATED, () => {
                    this.clearAllCaches();
                })
            );
        }
    }

    /**
     * Get cached project data for a file
     */
    async getProjectData(filePath: string, useCache = true): Promise<CachedProjectData | null> {
        if (!useCache) {
            return this.computeProjectData(filePath);
        }

        const cacheKey = `project-data:${filePath}`;

        // Try unified cache first
        if (this.unifiedCache) {
            const cached = this.unifiedCache.get<CachedProjectData>(cacheKey, CacheType.PROJECT_DATA);
            if (cached) {
                this.stats.configCacheHits++;
                return cached;
            }
        } else {
            // Fallback to legacy cache
            const cached = this.fileCache.get(filePath);
            if (cached) {
                const file = this.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile && cached.timestamp >= file.stat.mtime) {
                    this.stats.configCacheHits++;
                    return cached;
                }
            }
        }

        // Compute fresh data
        const projectData = await this.computeProjectData(filePath);
        if (projectData) {
            await this.setProjectData(filePath, projectData);
        }

        return projectData;
    }

    /**
     * Set project data in cache
     */
    async setProjectData(filePath: string, data: CachedProjectData): Promise<void> {
        const cacheKey = `project-data:${filePath}`;

        if (this.unifiedCache) {
            const file = this.vault.getAbstractFileByPath(filePath);
            this.unifiedCache.set(cacheKey, data, CacheType.PROJECT_DATA, {
                mtime: file instanceof TFile ? file.stat.mtime : Date.now(),
                ttl: 600000, // 10 minutes
                dependencies: [filePath]
            });
        } else {
            // Fallback to legacy cache
            this.fileCache.set(filePath, data);
        }

        this.stats.cachedFiles++;
        this.stats.lastUpdateTime = Date.now();

        this.eventManager?.emit(ParseEventType.PROJECT_DATA_CACHED, {
            filePath,
            hasProject: !!data.tgProject,
            source: 'ProjectDataCache'
        });
    }

    /**
     * Compute project data for a file
     */
    private async computeProjectData(filePath: string): Promise<CachedProjectData | null> {
        try {
            this.stats.totalFiles++;

            // Get TgProject from ProjectConfigManager
            const tgProject = await this.projectConfigManager.determineTgProject(filePath);
            
            // Get enhanced metadata
            const enhancedMetadata = await this.projectConfigManager.getEnhancedMetadata(filePath) || {};

            // Get config source
            const configSource = tgProject?.source || undefined;

            const result: CachedProjectData = {
                tgProject,
                enhancedMetadata,
                timestamp: Date.now(),
                configSource
            };

            return result;

        } catch (error) {
            console.error(`Error computing project data for ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Get project data for multiple files (batch operation)
     */
    async getProjectDataBatch(filePaths: string[]): Promise<Map<string, CachedProjectData | null>> {
        const results = new Map<string, CachedProjectData | null>();
        const uncachedFiles: string[] = [];

        // First pass: check cache for each file
        for (const filePath of filePaths) {
            const cacheKey = `project-data:${filePath}`;
            let cached: CachedProjectData | null = null;

            if (this.unifiedCache) {
                cached = this.unifiedCache.get<CachedProjectData>(cacheKey, CacheType.PROJECT_DATA);
            } else {
                const legacyCached = this.fileCache.get(filePath);
                if (legacyCached) {
                    const file = this.vault.getAbstractFileByPath(filePath);
                    if (file instanceof TFile && legacyCached.timestamp >= file.stat.mtime) {
                        cached = legacyCached;
                    }
                }
            }

            if (cached) {
                results.set(filePath, cached);
                this.stats.configCacheHits++;
            } else {
                uncachedFiles.push(filePath);
            }
        }

        // Second pass: compute data for uncached files
        for (const filePath of uncachedFiles) {
            const projectData = await this.computeProjectData(filePath);
            results.set(filePath, projectData);
            
            if (projectData) {
                await this.setProjectData(filePath, projectData);
            }
        }

        return results;
    }

    /**
     * Schedule batch update for file
     */
    private scheduleUpdate(filePath: string): void {
        this.pendingUpdates.add(filePath);

        if (this.batchUpdateTimer) {
            clearTimeout(this.batchUpdateTimer);
        }

        this.batchUpdateTimer = setTimeout(() => {
            this.processPendingUpdates();
        }, this.BATCH_DELAY);
    }

    /**
     * Process pending batch updates
     */
    private async processPendingUpdates(): Promise<void> {
        const filesToUpdate = Array.from(this.pendingUpdates);
        this.pendingUpdates.clear();

        if (filesToUpdate.length === 0) return;

        this.eventManager?.trigger(ParseEventType.BATCH_STARTED, {
            batchId: `project-cache-${Date.now()}`,
            taskCount: filesToUpdate.length,
            timestamp: Date.now()
        });

        try {
            await this.getProjectDataBatch(filesToUpdate);

            this.eventManager?.trigger(ParseEventType.BATCH_COMPLETED, {
                batchId: `project-cache-${Date.now()}`,
                taskCount: filesToUpdate.length,
                duration: 0, // Calculated elsewhere
                timestamp: Date.now()
            });

        } catch (error) {
            console.error('Error processing pending project data updates:', error);
        }
    }

    /**
     * Invalidate file cache
     */
    private invalidateFileCache(filePath: string): void {
        if (this.unifiedCache) {
            this.unifiedCache.invalidateByPath(filePath, CacheType.PROJECT_DATA);
        } else {
            this.fileCache.delete(filePath);
        }
    }

    /**
     * Invalidate directory cache
     */
    private invalidateDirectoryCache(configFilePath: string): void {
        const dirPath = configFilePath.substring(0, configFilePath.lastIndexOf('/'));
        const dirCache = this.directoryCache.get(dirPath);
        
        if (dirCache) {
            // Invalidate all files in this directory
            for (const filePath of dirCache.paths) {
                this.invalidateFileCache(filePath);
            }
            this.directoryCache.delete(dirPath);
        }

        if (this.unifiedCache) {
            this.unifiedCache.invalidateByPattern(`project-data:${dirPath}/`);
        }
    }

    /**
     * Remove file from cache
     */
    private removeFromCache(filePath: string): void {
        this.invalidateFileCache(filePath);
        
        // Update directory cache
        for (const [dirPath, dirCache] of this.directoryCache) {
            dirCache.paths.delete(filePath);
        }
    }

    /**
     * Clear all caches
     */
    clearAllCaches(): void {
        if (this.unifiedCache) {
            this.unifiedCache.invalidateByPattern('project-data:', CacheType.PROJECT_DATA);
        } else {
            this.fileCache.clear();
        }
        
        this.directoryCache.clear();
        this.pendingUpdates.clear();
        
        if (this.batchUpdateTimer) {
            clearTimeout(this.batchUpdateTimer);
            this.batchUpdateTimer = undefined;
        }

        this.stats = {
            ...this.stats,
            totalFiles: 0,
            cachedFiles: 0,
            directoryCacheHits: 0,
            configCacheHits: 0,
            lastUpdateTime: Date.now()
        };

        this.eventManager?.trigger(ParseEventType.CACHE_CLEARED, {
            cacheType: 'ProjectDataCache',
            source: 'ProjectDataCache'
        });
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): ProjectCacheStats {
        return { ...this.stats };
    }

    /**
     * Preload project data for multiple files
     */
    async preloadProjectData(filePaths: string[]): Promise<void> {
        const batchSize = 50; // Process in batches to avoid blocking

        for (let i = 0; i < filePaths.length; i += batchSize) {
            const batch = filePaths.slice(i, i + batchSize);
            await this.getProjectDataBatch(batch);
            
            // Small delay between batches to prevent UI blocking
            if (i + batchSize < filePaths.length) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
    }

    /**
     * Get memory usage estimation
     */
    getMemoryUsage(): { 
        unified: boolean;
        fileCache: number; 
        directoryCache: number; 
        pendingUpdates: number;
        totalEntries: number;
    } {
        if (this.unifiedCache) {
            return {
                unified: true,
                fileCache: 0, // Managed by unified cache
                directoryCache: this.directoryCache.size,
                pendingUpdates: this.pendingUpdates.size,
                totalEntries: this.directoryCache.size + this.pendingUpdates.size
            };
        } else {
            return {
                unified: false,
                fileCache: this.fileCache.size,
                directoryCache: this.directoryCache.size,
                pendingUpdates: this.pendingUpdates.size,
                totalEntries: this.fileCache.size + this.directoryCache.size + this.pendingUpdates.size
            };
        }
    }

    /**
     * Force refresh project data for a file
     */
    async refreshProjectData(filePath: string): Promise<CachedProjectData | null> {
        this.invalidateFileCache(filePath);
        return this.getProjectData(filePath, false);
    }

    /**
     * Component lifecycle: cleanup on unload
     */
    onunload(): void {
        if (this.batchUpdateTimer) {
            clearTimeout(this.batchUpdateTimer);
        }
        
        this.clearAllCaches();
        super.onunload();
    }
}