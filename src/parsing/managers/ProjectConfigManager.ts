/**
 * Unified Project Configuration Manager
 *
 * Migrated from original ProjectConfigManager to the new unified parsing system.
 * Handles project configuration file reading and metadata parsing using Component lifecycle.
 */

import { Component, TFile, TFolder, Vault, MetadataCache, CachedMetadata } from "obsidian";
import { TgProject } from "../../types/task";
import { ParseEventManager } from "../core/ParseEventManager";
import { UnifiedCacheManager } from "../core/UnifiedCacheManager";
import { ParseEventType } from "../events/ParseEvents";
import { CacheType } from "../types/ParsingTypes";

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
    eventManager?: ParseEventManager;
    cacheManager?: UnifiedCacheManager;
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
    enhancedProjectEnabled?: boolean;
    metadataConfigEnabled?: boolean;
    configFileEnabled?: boolean;
}

export class ProjectConfigManager extends Component {
    private vault: Vault;
    private metadataCache: MetadataCache;
    private eventManager?: ParseEventManager;
    private cacheManager?: UnifiedCacheManager;
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

    // Legacy caches (maintained for backward compatibility)
    private configCache = new Map<string, ProjectConfigData>();
    private lastModifiedCache = new Map<string, number>();
    private fileMetadataCache = new Map<string, Record<string, any>>();
    private fileMetadataTimestampCache = new Map<string, number>();
    private enhancedMetadataCache = new Map<string, Record<string, any>>();
    private enhancedMetadataTimestampCache = new Map<string, string>();

    constructor(options: ProjectConfigManagerOptions) {
        super();
        this.vault = options.vault;
        this.metadataCache = options.metadataCache;
        this.eventManager = options.eventManager;
        this.cacheManager = options.cacheManager;
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
        this.enhancedProjectEnabled = options.enhancedProjectEnabled ?? true;
        this.metadataConfigEnabled = options.metadataConfigEnabled ?? false;
        this.configFileEnabled = options.configFileEnabled ?? false;

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Listen for file changes to invalidate caches
        this.registerEvent(
            this.vault.on('modify', (file) => {
                this.invalidateFileCache(file.path);
                this.eventManager?.trigger(ParseEventType.PROJECT_CONFIG_CHANGED, {
                    filePath: file.path,
                    source: 'ProjectConfigManager'
                });
            })
        );

        this.registerEvent(
            this.vault.on('delete', (file) => {
                this.invalidateFileCache(file.path);
                this.eventManager?.trigger(ParseEventType.PROJECT_CONFIG_DELETED, {
                    filePath: file.path,
                    source: 'ProjectConfigManager'
                });
            })
        );

        this.registerEvent(
            this.vault.on('rename', (file, oldPath) => {
                this.invalidateFileCache(oldPath);
                this.invalidateFileCache(file.path);
                this.eventManager?.trigger(ParseEventType.PROJECT_CONFIG_RENAMED, {
                    oldPath,
                    newPath: file.path,
                    source: 'ProjectConfigManager'
                });
            })
        );

        // Listen for metadata cache changes
        this.registerEvent(
            this.metadataCache.on('changed', (file) => {
                this.invalidateFileMetadataCache(file.path);
                this.eventManager?.trigger(ParseEventType.FILE_METADATA_CHANGED, {
                    filePath: file.path,
                    source: 'ProjectConfigManager'
                });
            })
        );
    }

    /**
     * Check if enhanced project features are enabled
     */
    isEnhancedProjectEnabled(): boolean {
        return this.enhancedProjectEnabled;
    }

    /**
     * Get project configuration for a file
     */
    async getProjectConfig(filePath: string): Promise<ProjectConfigData | null> {
        if (!this.enhancedProjectEnabled) {
            return null;
        }

        const cacheKey = `project-config:${filePath}`;
        
        // Try unified cache first
        if (this.cacheManager) {
            const cached = this.cacheManager.get<ProjectConfigData>(cacheKey, CacheType.PROJECT_CONFIG);
            if (cached) {
                return cached;
            }
        }

        // Find config file
        const configFile = await this.findProjectConfigFile(filePath);
        if (!configFile) {
            return null;
        }

        try {
            const configContent = await this.vault.read(configFile);
            const config: ProjectConfigData = JSON.parse(configContent);

            // Cache the result
            if (this.cacheManager) {
                this.cacheManager.set(cacheKey, config, CacheType.PROJECT_CONFIG, {
                    mtime: configFile.stat.mtime,
                    ttl: 600000, // 10 minutes
                    dependencies: [configFile.path]
                });
            } else {
                // Fallback to legacy cache
                this.configCache.set(filePath, config);
                this.lastModifiedCache.set(filePath, configFile.stat.mtime);
            }

            return config;

        } catch (error) {
            console.error(`Error reading project config from ${configFile.path}:`, error);
            return null;
        }
    }

    /**
     * Get file metadata (frontmatter)
     */
    getFileMetadata(filePath: string): Record<string, any> | null {
        const cacheKey = `file-metadata:${filePath}`;
        
        // Try unified cache first
        if (this.cacheManager) {
            const cached = this.cacheManager.get<Record<string, any>>(cacheKey, CacheType.FILE_METADATA);
            if (cached) {
                return cached;
            }
        }

        const file = this.vault.getAbstractFileByPath(filePath);
        if (!file || !(file instanceof TFile)) {
            return null;
        }

        const cachedMetadata = this.metadataCache.getFileCache(file);
        const frontmatter = cachedMetadata?.frontmatter || {};

        // Cache the result
        if (this.cacheManager) {
            this.cacheManager.set(cacheKey, frontmatter, CacheType.FILE_METADATA, {
                mtime: file.stat.mtime,
                ttl: 300000, // 5 minutes
                dependencies: [filePath]
            });
        } else {
            // Fallback to legacy cache
            this.fileMetadataCache.set(filePath, frontmatter);
            this.fileMetadataTimestampCache.set(filePath, file.stat.mtime);
        }

        return frontmatter;
    }

    /**
     * Get enhanced metadata (frontmatter + mappings + config)
     */
    async getEnhancedMetadata(filePath: string): Promise<Record<string, any> | null> {
        const cacheKey = `enhanced-metadata:${filePath}`;
        
        // Try unified cache first
        if (this.cacheManager) {
            const cached = this.cacheManager.get<Record<string, any>>(cacheKey, CacheType.ENHANCED_METADATA);
            if (cached) {
                return cached;
            }
        }

        const frontmatter = this.getFileMetadata(filePath) || {};
        const projectConfig = await this.getProjectConfig(filePath) || {};

        // Apply metadata mappings
        const enhanced = { ...frontmatter };
        for (const mapping of this.metadataMappings) {
            if (mapping.enabled && frontmatter[mapping.sourceKey] !== undefined) {
                enhanced[mapping.targetKey] = frontmatter[mapping.sourceKey];
            }
        }

        // Merge with project config (project config takes lower precedence)
        for (const [key, value] of Object.entries(projectConfig)) {
            if (enhanced[key] === undefined) {
                enhanced[key] = value;
            }
        }

        // Cache the result
        if (this.cacheManager) {
            const file = this.vault.getAbstractFileByPath(filePath);
            this.cacheManager.set(cacheKey, enhanced, CacheType.ENHANCED_METADATA, {
                mtime: file instanceof TFile ? file.stat.mtime : Date.now(),
                ttl: 300000, // 5 minutes
                dependencies: [filePath]
            });
        } else {
            // Fallback to legacy cache
            const file = this.vault.getAbstractFileByPath(filePath);
            const timestamp = file instanceof TFile ? `${file.stat.mtime}_${Date.now()}` : `${Date.now()}_${Date.now()}`;
            this.enhancedMetadataCache.set(filePath, enhanced);
            this.enhancedMetadataTimestampCache.set(filePath, timestamp);
        }

        return enhanced;
    }

    /**
     * Determine TgProject for a file
     */
    async determineTgProject(filePath: string): Promise<TgProject | null> {
        if (!this.enhancedProjectEnabled) {
            return null;
        }

        const cacheKey = `tg-project:${filePath}`;
        
        // Try unified cache first
        if (this.cacheManager) {
            const cached = this.cacheManager.get<TgProject>(cacheKey, CacheType.PROJECT_DETECTION);
            if (cached) {
                return cached;
            }
        }

        let project: TgProject | null = null;

        // 1. Check path-based mappings
        for (const mapping of this.pathMappings) {
            if (!mapping.enabled) continue;
            
            if (this.matchesPathPattern(filePath, mapping.pathPattern)) {
                project = {
                    type: "path",
                    name: mapping.projectName,
                    source: mapping.pathPattern,
                    readonly: true,
                };
                break;
            }
        }

        // 2. Check file metadata - only if metadata detection is enabled
        if (!project && this.metadataConfigEnabled) {
            const metadata = this.getFileMetadata(filePath);
            const projectFromMetadata = metadata?.[this.metadataKey];
            
            if (projectFromMetadata && typeof projectFromMetadata === "string") {
                project = {
                    type: "metadata",
                    name: projectFromMetadata,
                    source: this.metadataKey,
                    readonly: true,
                };
            }
        }

        // 3. Check project config file - only if config file detection is enabled
        if (!project && this.configFileEnabled) {
            const config = await this.getProjectConfig(filePath);
            const projectFromConfig = config?.project;
            
            if (projectFromConfig && typeof projectFromConfig === "string") {
                project = {
                    type: "config",
                    name: projectFromConfig,
                    source: this.configFileName,
                    readonly: true,
                };
            }
        }

        // 4. Apply default naming strategy if enabled
        if (!project && this.defaultProjectNaming.enabled) {
            const defaultName = this.getDefaultProjectName(filePath);
            if (defaultName) {
                project = {
                    type: "default",
                    name: defaultName,
                    source: this.defaultProjectNaming.strategy,
                    readonly: true,
                };
            }
        }

        // Cache the result
        if (project && this.cacheManager) {
            const file = this.vault.getAbstractFileByPath(filePath);
            this.cacheManager.set(cacheKey, project, CacheType.PROJECT_DETECTION, {
                mtime: file instanceof TFile ? file.stat.mtime : Date.now(),
                ttl: 600000, // 10 minutes
                dependencies: [filePath]
            });
        }

        return project;
    }

    /**
     * Find project config file for a given file path
     */
    private async findProjectConfigFile(filePath: string): Promise<TFile | null> {
        const dir = filePath.substring(0, filePath.lastIndexOf('/'));
        return this.searchForConfigFile(dir);
    }

    /**
     * Search for config file recursively
     */
    private async searchForConfigFile(dirPath: string): Promise<TFile | null> {
        const configPath = `${dirPath}/${this.configFileName}`;
        const configFile = this.vault.getAbstractFileByPath(configPath);
        
        if (configFile instanceof TFile) {
            return configFile;
        }

        if (this.searchRecursively && dirPath.includes('/')) {
            const parentDir = dirPath.substring(0, dirPath.lastIndexOf('/'));
            return this.searchForConfigFile(parentDir);
        }

        return null;
    }

    /**
     * Check if file path matches pattern
     */
    private matchesPathPattern(filePath: string, pattern: string): boolean {
        // Simple pattern matching - in production use proper glob matching
        return filePath.includes(pattern);
    }

    /**
     * Get default project name based on strategy
     */
    private getDefaultProjectName(filePath: string): string | null {
        const strategy = this.defaultProjectNaming;
        
        switch (strategy.strategy) {
            case 'filename':
                let name = filePath.split('/').pop() || '';
                if (strategy.stripExtension) {
                    name = name.replace(/\.[^/.]+$/, '');
                }
                return name;
                
            case 'foldername':
                const parts = filePath.split('/');
                return parts[parts.length - 2] || null;
                
            case 'metadata':
                const metadata = this.getFileMetadata(filePath);
                return metadata?.[strategy.metadataKey || 'project'] || null;
                
            default:
                return null;
        }
    }

    /**
     * Invalidate file cache entries
     */
    private invalidateFileCache(filePath: string): void {
        if (this.cacheManager) {
            this.cacheManager.invalidateByPath(filePath);
        } else {
            // Fallback to legacy cache invalidation
            this.configCache.delete(filePath);
            this.lastModifiedCache.delete(filePath);
            this.enhancedMetadataCache.delete(filePath);
            this.enhancedMetadataTimestampCache.delete(filePath);
        }
    }

    /**
     * Invalidate file metadata cache
     */
    private invalidateFileMetadataCache(filePath: string): void {
        if (this.cacheManager) {
            this.cacheManager.invalidateByPath(filePath, CacheType.FILE_METADATA);
            this.cacheManager.invalidateByPath(filePath, CacheType.ENHANCED_METADATA);
        } else {
            // Fallback to legacy cache invalidation
            this.fileMetadataCache.delete(filePath);
            this.fileMetadataTimestampCache.delete(filePath);
            this.enhancedMetadataCache.delete(filePath);
            this.enhancedMetadataTimestampCache.delete(filePath);
        }
    }

    /**
     * Update configuration
     */
    updateConfiguration(options: Partial<ProjectConfigManagerOptions>): void {
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
            this.enhancedProjectEnabled = options.enhancedProjectEnabled;
        }
        if (options.metadataConfigEnabled !== undefined) {
            this.metadataConfigEnabled = options.metadataConfigEnabled;
        }
        if (options.configFileEnabled !== undefined) {
            this.configFileEnabled = options.configFileEnabled;
        }

        // Clear all caches when configuration changes
        this.clearAllCaches();

        this.eventManager?.trigger(ParseEventType.PROJECT_CONFIG_UPDATED, {
            source: 'ProjectConfigManager',
            changes: options
        });
    }

    /**
     * Clear all caches
     */
    clearAllCaches(): void {
        if (this.cacheManager) {
            this.cacheManager.invalidateByPattern('project-config:', CacheType.PROJECT_CONFIG);
            this.cacheManager.invalidateByPattern('file-metadata:', CacheType.FILE_METADATA);
            this.cacheManager.invalidateByPattern('enhanced-metadata:', CacheType.ENHANCED_METADATA);
            this.cacheManager.invalidateByPattern('tg-project:', CacheType.PROJECT_DETECTION);
        } else {
            // Fallback to legacy cache clearing
            this.configCache.clear();
            this.lastModifiedCache.clear();
            this.fileMetadataCache.clear();
            this.fileMetadataTimestampCache.clear();
            this.enhancedMetadataCache.clear();
            this.enhancedMetadataTimestampCache.clear();
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): {
        unified: boolean;
        configEntries: number;
        metadataEntries: number;
        enhancedEntries: number;
    } {
        if (this.cacheManager) {
            return {
                unified: true,
                configEntries: 0, // Unified cache doesn't expose individual counts
                metadataEntries: 0,
                enhancedEntries: 0
            };
        } else {
            return {
                unified: false,
                configEntries: this.configCache.size,
                metadataEntries: this.fileMetadataCache.size,
                enhancedEntries: this.enhancedMetadataCache.size
            };
        }
    }

    /**
     * Component lifecycle: cleanup on unload
     */
    onunload(): void {
        this.clearAllCaches();
        super.onunload();
    }
}