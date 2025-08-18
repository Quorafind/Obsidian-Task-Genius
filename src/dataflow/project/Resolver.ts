import type { TgProject } from "../../types/task";
import type { App, Vault, MetadataCache } from "obsidian";
import { ProjectConfigManager, ProjectConfigManagerOptions } from "../../utils/ProjectConfigManager";
import { ProjectDataCache, CachedProjectData } from "../../utils/ProjectDataCache";

export interface ProjectData {
  tgProject?: TgProject;
  enhancedMetadata: Record<string, any>;
  timestamp: number;
  configSource?: string;
}

/**
 * Project resolver that integrates existing project management infrastructure
 * This is the single source of truth for project identification
 */
export class Resolver {
  private projectConfigManager: ProjectConfigManager;
  private projectDataCache: ProjectDataCache;

  constructor(
    private app: App,
    private vault: Vault,
    private metadataCache: MetadataCache,
    options?: Partial<ProjectConfigManagerOptions>
  ) {
    // Initialize with default options that can be overridden
    const defaultOptions: ProjectConfigManagerOptions = {
      vault: this.vault,
      metadataCache: this.metadataCache,
      configFileName: options?.configFileName || "tg-project.md",
      searchRecursively: options?.searchRecursively ?? true,
      metadataKey: options?.metadataKey || "tgProject",
      pathMappings: options?.pathMappings || [],
      metadataMappings: options?.metadataMappings || [],
      defaultProjectNaming: options?.defaultProjectNaming || {
        strategy: "filename",
        stripExtension: true,
        enabled: false,
      },
      enhancedProjectEnabled: options?.enhancedProjectEnabled ?? true,
      metadataConfigEnabled: options?.metadataConfigEnabled ?? false,
      configFileEnabled: options?.configFileEnabled ?? false,
      detectionMethods: options?.detectionMethods || [],
    };

    this.projectConfigManager = new ProjectConfigManager(defaultOptions);
    this.projectDataCache = new ProjectDataCache(
      this.vault,
      this.metadataCache,
      this.projectConfigManager
    );
  }

  /**
   * Get project data for a file, using cache when available
   */
  async get(filePath: string): Promise<ProjectData> {
    const cachedData = await this.projectDataCache.getProjectData(filePath);
    
    if (cachedData) {
      return {
        tgProject: cachedData.tgProject,
        enhancedMetadata: cachedData.enhancedMetadata,
        timestamp: cachedData.timestamp,
        configSource: cachedData.configSource,
      };
    }

    // If no project data found, return empty metadata
    return {
      enhancedMetadata: {},
      timestamp: Date.now(),
    };
  }

  /**
   * Get project data for multiple files in batch
   */
  async getBatch(filePaths: string[]): Promise<Map<string, ProjectData>> {
    const batchData = await this.projectDataCache.getBatchProjectData(filePaths);
    const result = new Map<string, ProjectData>();

    for (const [path, cached] of batchData) {
      result.set(path, {
        tgProject: cached.tgProject,
        enhancedMetadata: cached.enhancedMetadata,
        timestamp: cached.timestamp,
        configSource: cached.configSource,
      });
    }

    // Fill in missing entries
    for (const path of filePaths) {
      if (!result.has(path)) {
        result.set(path, {
          enhancedMetadata: {},
          timestamp: Date.now(),
        });
      }
    }

    return result;
  }

  /**
   * Clear cache for specific files
   */
  clearCache(filePaths?: string[]): void {
    this.projectDataCache.clearCache(filePaths);
  }

  /**
   * Update project config manager options
   */
  updateOptions(options: Partial<ProjectConfigManagerOptions>): void {
    this.projectConfigManager.updateOptions(options);
  }

  /**
   * Get the underlying project config manager (for advanced usage)
   */
  getConfigManager(): ProjectConfigManager {
    return this.projectConfigManager;
  }

  /**
   * Get the underlying project data cache (for advanced usage)
   */
  getDataCache(): ProjectDataCache {
    return this.projectDataCache;
  }
}