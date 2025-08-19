import { App, TFile, Vault, MetadataCache } from "obsidian";
import type { Task } from "../types/task";
import type { ProjectConfigManagerOptions } from "../managers/project-config-manager";

import { QueryAPI } from "./api/QueryAPI";
import { Repository } from "./indexer/Repository";
import { Resolver as ProjectResolver } from "./project/Resolver";
import { Augmentor, AugmentContext } from "./augment/Augmentor";
import { Storage } from "./persistence/Storage";
import { Events, emit, Seq } from "./events/Events";
import { WorkerOrchestrator } from "./workers/WorkerOrchestrator";
import { ObsidianSource } from "./sources/ObsidianSource";
import { TaskWorkerManager } from "./workers/TaskWorkerManager";
import { ProjectDataWorkerManager } from "./workers/ProjectDataWorkerManager";

// Parser imports
import { parseMarkdown } from "./parsers/MarkdownEntry";
import { parseCanvas } from "./parsers/CanvasEntry";
import { parseFileMeta } from "./parsers/FileMetaEntry";

/**
 * DataflowOrchestrator - Coordinates all dataflow components
 * This is the main entry point for the new dataflow architecture
 */
export class DataflowOrchestrator {
  private queryAPI: QueryAPI;
  private repository: Repository;
  private projectResolver: ProjectResolver;
  private augmentor: Augmentor;
  private storage: Storage;
  private workerOrchestrator: WorkerOrchestrator;
  private obsidianSource: ObsidianSource;
  
  // Processing queue for throttling
  private processingQueue = new Map<string, NodeJS.Timeout>();
  private readonly DEBOUNCE_DELAY = 300; // ms

  constructor(
    private app: App,
    private vault: Vault,
    private metadataCache: MetadataCache,
    private plugin: any, // Plugin instance for parser access
    projectOptions?: Partial<ProjectConfigManagerOptions>
  ) {
    // Initialize components
    this.queryAPI = new QueryAPI(app, vault, metadataCache);
    this.repository = this.queryAPI.getRepository();
    this.projectResolver = new ProjectResolver(app, vault, metadataCache, projectOptions);
    this.augmentor = new Augmentor();
    this.storage = this.repository.getStorage();
    
    // Initialize worker orchestrator
    const taskWorkerManager = new TaskWorkerManager(vault, metadataCache);
    const projectWorkerManager = new ProjectDataWorkerManager({
      vault,
      metadataCache,
      projectConfigManager: this.projectResolver.getConfigManager()
    });
    this.workerOrchestrator = new WorkerOrchestrator(taskWorkerManager, projectWorkerManager);
    
    // Initialize Obsidian event source
    this.obsidianSource = new ObsidianSource(app, vault, metadataCache);
  }

  /**
   * Initialize the orchestrator (load persisted data)
   */
  async initialize(): Promise<void> {
    await this.queryAPI.initialize();
    
    // Initialize ObsidianSource to start listening for events
    this.obsidianSource.initialize();
    
    // Emit initial ready event
    emit(this.app, Events.CACHE_READY, {
      initial: true,
      timestamp: Date.now(),
      seq: Seq.next()
    });
  }

  /**
   * Process a file change (parse, augment, index)
   */
  async processFile(file: TFile): Promise<void> {
    const filePath = file.path;
    
    // Debounce rapid changes
    if (this.processingQueue.has(filePath)) {
      clearTimeout(this.processingQueue.get(filePath));
    }
    
    const timeoutId = setTimeout(async () => {
      this.processingQueue.delete(filePath);
      await this.processFileImmediate(file);
    }, this.DEBOUNCE_DELAY);
    
    this.processingQueue.set(filePath, timeoutId);
  }

  /**
   * Process a file immediately without debouncing
   */
  private async processFileImmediate(file: TFile): Promise<void> {
    const filePath = file.path;
    
    try {
      // Step 1: Check cache and parse if needed
      const rawCached = await this.storage.loadRaw(filePath);
      const fileContent = await this.vault.cachedRead(file);
      
      let rawTasks: Task[];
      if (rawCached && this.storage.isRawValid(filePath, rawCached, fileContent)) {
        // Use cached raw tasks
        rawTasks = rawCached.data;
      } else {
        // Parse the file
        rawTasks = await this.parseFile(file);
        
        // Store raw tasks with file content for hash
        await this.storage.storeRaw(filePath, rawTasks, fileContent);
      }
      
      // Step 2: Get project data (can be parallelized)
      const projectData = await this.projectResolver.get(filePath);
      
      // Store project data
      await this.storage.storeProject(filePath, {
        tgProject: projectData.tgProject,
        enhancedMetadata: projectData.enhancedMetadata
      });
      
      // Step 3: Augment tasks with project and file metadata
      const fileMetadata = this.metadataCache.getFileCache(file);
      const augmentContext: AugmentContext = {
        filePath,
        fileMeta: fileMetadata?.frontmatter || {},
        projectName: projectData.tgProject?.name,
        projectMeta: projectData.enhancedMetadata,
        tasks: rawTasks
      };
      const augmentedTasks = await this.augmentor.merge(augmentContext);
      
      // Step 4: Update repository (index + storage + events)
      await this.repository.updateFile(filePath, augmentedTasks);
      
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
      
      // Emit error event
      emit(this.app, Events.FILE_UPDATED, {
        path: filePath,
        reason: "error",
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Parse a file based on its type
   */
  private async parseFile(file: TFile): Promise<Task[]> {
    const extension = file.extension.toLowerCase();
    
    // Parse based on file type
    let tasks: Task[] = [];
    
    if (extension === "md") {
      // Parse markdown tasks
      const content = await this.vault.cachedRead(file);
      const markdownTasks = await parseMarkdown(file.path, content);
      tasks.push(...markdownTasks);
      
      // Parse file-level tasks from frontmatter
      const fileMetaTasks = await parseFileMeta(this.plugin, file.path);
      tasks.push(...fileMetaTasks);
      
    } else if (extension === "canvas") {
      // Parse canvas tasks
      const canvasTasks = await parseCanvas(this.plugin, file);
      tasks.push(...canvasTasks);
    }
    
    return tasks;
  }

  /**
   * Process multiple files in batch
   */
  async processBatch(files: TFile[]): Promise<void> {
    const updates = new Map<string, Task[]>();
    
    for (const file of files) {
      try {
        const filePath = file.path;
        
        // Parse file
        const rawTasks = await this.parseFile(file);
        
        // Get project data
        const projectData = await this.projectResolver.get(filePath);
        
        // Augment tasks
        const fileMetadata = this.metadataCache.getFileCache(file);
        const augmentContext: AugmentContext = {
          filePath,
          fileMeta: fileMetadata?.frontmatter || {},
          projectName: projectData.tgProject?.name,
          projectMeta: projectData.enhancedMetadata,
          tasks: rawTasks
        };
        const augmentedTasks = await this.augmentor.merge(augmentContext);
        
        updates.set(filePath, augmentedTasks);
        
      } catch (error) {
        console.error(`Error processing file ${file.path} in batch:`, error);
      }
    }
    
    // Update repository in batch
    if (updates.size > 0) {
      await this.repository.updateBatch(updates);
    }
  }

  /**
   * Remove a file from the index
   */
  async removeFile(filePath: string): Promise<void> {
    await this.repository.removeFile(filePath);
  }

  /**
   * Handle file rename
   */
  async renameFile(oldPath: string, newPath: string): Promise<void> {
    // Remove old file
    await this.removeFile(oldPath);
    
    // Process new file
    const file = this.vault.getAbstractFileByPath(newPath);
    if (file instanceof TFile) {
      await this.processFile(file);
    }
  }

  /**
   * Clear all data and rebuild
   */
  async rebuild(): Promise<void> {
    // Clear all data
    await this.repository.clear();
    
    // Process all markdown and canvas files
    const files = this.vault.getMarkdownFiles();
    const canvasFiles = this.vault.getFiles().filter(f => f.extension === "canvas");
    
    const allFiles = [...files, ...canvasFiles];
    
    // Process in batches for performance
    const BATCH_SIZE = 50;
    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      const batch = allFiles.slice(i, i + BATCH_SIZE);
      await this.processBatch(batch);
    }
    
    // Persist the rebuilt index
    await this.repository.persist();
    
    // Emit ready event
    emit(this.app, Events.CACHE_READY, {
      initial: false,
      timestamp: Date.now(),
      seq: Seq.next()
    });
  }

  /**
   * Handle settings change
   */
  async onSettingsChange(scopes: string[]): Promise<void> {
    // Clear relevant caches based on scope
    if (scopes.includes("parser")) {
      await this.storage.clearNamespace("raw");
    }
    
    if (scopes.includes("augment") || scopes.includes("project")) {
      await this.storage.clearNamespace("augmented");
      await this.storage.clearNamespace("project");
      this.projectResolver.clearCache();
    }
    
    if (scopes.includes("index")) {
      await this.storage.clearNamespace("consolidated");
    }
    
    // Emit settings changed event
    emit(this.app, Events.SETTINGS_CHANGED, {
      scopes,
      timestamp: Date.now()
    });
    
    // Trigger rebuild if needed
    if (scopes.some(s => ["parser", "augment", "project"].includes(s))) {
      await this.rebuild();
    }
  }

  /**
   * Update project configuration options
   */
  updateProjectOptions(options: Partial<ProjectConfigManagerOptions>): void {
    this.projectResolver.updateOptions(options);
  }

  /**
   * Get the query API for external access
   */
  getQueryAPI(): QueryAPI {
    return this.queryAPI;
  }

  /**
   * Get statistics about the dataflow system
   */
  async getStats(): Promise<{
    indexStats: any;
    storageStats: any;
    queueSize: number;
    workerStats?: any;
    sourceStats?: any;
  }> {
    const indexStats = await this.queryAPI.getSummary();
    const storageStats = await this.storage.getStats();
    
    return {
      indexStats,
      storageStats,
      queueSize: this.processingQueue.size,
      workerStats: this.workerOrchestrator.getMetrics(),
      sourceStats: this.obsidianSource.getStats()
    };
  }

  /**
   * Get the worker orchestrator for advanced worker management
   */
  getWorkerOrchestrator(): WorkerOrchestrator {
    return this.workerOrchestrator;
  }

  /**
   * Get the Obsidian source for event management
   */
  getObsidianSource(): ObsidianSource {
    return this.obsidianSource;
  }

  /**
   * Get the augmentor for inheritance strategy management
   */
  getAugmentor(): Augmentor {
    return this.augmentor;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Clear all pending timeouts
    for (const timeout of this.processingQueue.values()) {
      clearTimeout(timeout);
    }
    this.processingQueue.clear();
    
    // Cleanup ObsidianSource
    this.obsidianSource.destroy();
    
    // Cleanup WorkerOrchestrator
    this.workerOrchestrator.destroy();
    
    // Persist current state
    await this.repository.persist();
  }
}