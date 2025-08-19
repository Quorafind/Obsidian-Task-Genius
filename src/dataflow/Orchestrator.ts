import { App, TFile, Vault, MetadataCache, EventRef } from "obsidian";
import type { Task, TgProject } from "../types/task";
import type { ProjectConfigManagerOptions } from "../managers/project-config-manager";

import { QueryAPI } from "./api/QueryAPI";
import { Repository } from "./indexer/Repository";
import { Resolver as ProjectResolver } from "./project/Resolver";
import { Augmentor, AugmentContext } from "./augment/Augmentor";
import { Storage } from "./persistence/Storage";
import { Events, emit, Seq, on } from "./events/Events";
import { WorkerOrchestrator } from "./workers/WorkerOrchestrator";
import { ObsidianSource } from "./sources/ObsidianSource";
import { TaskWorkerManager } from "./workers/TaskWorkerManager";
import { ProjectDataWorkerManager } from "./workers/ProjectDataWorkerManager";

// Parser imports
import { parseMarkdown } from "./parsers/MarkdownEntry";
import { parseCanvas } from "./parsers/CanvasEntry";
import { parseFileMeta } from "./parsers/FileMetaEntry";
import { ConfigurableTaskParser } from "./core/ConfigurableTaskParser";

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
  
  // Event references for cleanup
  private eventRefs: EventRef[] = [];
  
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
    
    // Check if we need to perform initial scan
    const taskCount = (await this.queryAPI.getAllTasks()).length;
    if (taskCount === 0) {
      console.log("[DataflowOrchestrator] No cached tasks found, performing initial scan...");
      
      // Get all markdown and canvas files
      const mdFiles = this.vault.getMarkdownFiles();
      const canvasFiles = this.vault.getFiles().filter(f => f.extension === "canvas");
      const allFiles = [...mdFiles, ...canvasFiles];
      
      console.log(`[DataflowOrchestrator] Found ${allFiles.length} files to process`);
      
      // Process in batches for performance
      const BATCH_SIZE = 50;
      for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
        const batch = allFiles.slice(i, i + BATCH_SIZE);
        await this.processBatch(batch);
      }
      
      // Persist the initial index
      await this.repository.persist();
      
      const finalTaskCount = (await this.queryAPI.getAllTasks()).length;
      console.log(`[DataflowOrchestrator] Initial scan complete, indexed ${finalTaskCount} tasks`);
    }
    
    // Initialize ObsidianSource to start listening for events
    this.obsidianSource.initialize();
    
    // Subscribe to file update events from ObsidianSource
    this.subscribeToEvents();
    
    // Emit initial ready event
    emit(this.app, Events.CACHE_READY, {
      initial: true,
      timestamp: Date.now(),
      seq: Seq.next()
    });
  }

  /**
   * Subscribe to events from ObsidianSource and WriteAPI
   */
  private subscribeToEvents(): void {
    // Listen for file updates from ObsidianSource
    this.eventRefs.push(
      on(this.app, Events.FILE_UPDATED, async (payload: any) => {
        const { path, reason } = payload;
        console.log(`[DataflowOrchestrator] FILE_UPDATED event: ${path} (${reason})`);
        
        if (reason === 'delete') {
          // Remove file from index
          await this.repository.removeFile(path);
        } else {
          // Process file update (create, modify, rename, frontmatter)
          const file = this.vault.getAbstractFileByPath(path) as TFile;
          if (file) {
            await this.processFile(file);
          }
        }
      })
    );
    
    // Listen for batch updates
    this.eventRefs.push(
      on(this.app, Events.TASK_CACHE_UPDATED, async (payload: any) => {
        const { changedFiles } = payload;
        if (changedFiles && Array.isArray(changedFiles)) {
          console.log(`[DataflowOrchestrator] Batch update for ${changedFiles.length} files`);
          
          // Process each file
          for (const filePath of changedFiles) {
            const file = this.vault.getAbstractFileByPath(filePath) as TFile;
            if (file) {
              await this.processFile(file);
            }
          }
        }
      })
    );
    
    // Listen for WriteAPI completion events to trigger re-processing
    this.eventRefs.push(
      on(this.app, Events.WRITE_OPERATION_COMPLETE, async (payload: any) => {
        const { path } = payload;
        console.log(`[DataflowOrchestrator] WRITE_OPERATION_COMPLETE: ${path}`);
        
        // Process the file after WriteAPI completes
        const file = this.vault.getAbstractFileByPath(path) as TFile;
        if (file) {
          // Process immediately without debounce for WriteAPI operations
          await this.processFileImmediate(file);
        }
      })
    );
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
      // Step 1: Get file modification time
      const fileStat = await this.vault.adapter.stat(filePath);
      const mtime = fileStat?.mtime;
      
      // Step 2: Check cache and parse if needed
      const rawCached = await this.storage.loadRaw(filePath);
      const fileContent = await this.vault.cachedRead(file);
      
      let rawTasks: Task[];
      let projectData: Awaited<ReturnType<typeof this.projectResolver.get>>;
      
      if (rawCached && this.storage.isRawValid(filePath, rawCached, fileContent, mtime)) {
        // Use cached raw tasks - file hasn't changed
        console.log(`[DataflowOrchestrator] Using cached tasks for ${filePath} (mtime match)`); 
        rawTasks = rawCached.data;
        // Still need to get project data for augmentation
        projectData = await this.projectResolver.get(filePath);
      } else {
        // Parse the file
        console.log(`[DataflowOrchestrator] Parsing ${filePath} (cache miss or mtime mismatch)`);
        
        // Get project data first for parsing
        projectData = await this.projectResolver.get(filePath);
        rawTasks = await this.parseFile(file, projectData.tgProject);
        
        // Store raw tasks with file content and mtime
        await this.storage.storeRaw(filePath, rawTasks, fileContent, mtime);
      }
      
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
        projectMeta: {
          ...projectData.enhancedMetadata,
          tgProject: projectData.tgProject  // Include tgProject in projectMeta
        },
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
   * Parse a file based on its type using ConfigurableTaskParser
   */
  private async parseFile(file: TFile, tgProject?: TgProject): Promise<Task[]> {
    const extension = file.extension.toLowerCase();
    
    // Parse based on file type
    let tasks: Task[] = [];
    
    if (extension === "md") {
      // Use ConfigurableTaskParser for markdown files
      const content = await this.vault.cachedRead(file);
      const fileCache = this.metadataCache.getFileCache(file);
      const fileMetadata = fileCache?.frontmatter || {};
      
      // Create parser with plugin settings
      const parser = new ConfigurableTaskParser({
        parseMetadata: true,
        parseTags: true,
        parseComments: true,
        parseHeadings: true,
        customDateFormats: this.plugin.settings.customDateFormats,
        statusMapping: this.plugin.settings.statusMapping || {},
        emojiMapping: this.plugin.settings.emojiMapping || {},
        specialTagPrefixes: this.plugin.settings.specialTagPrefixes || {},
        fileMetadataInheritance: this.plugin.settings.fileMetadataInheritance,
        projectConfig: this.plugin.settings.projectConfig
      });
      
      // Parse tasks using ConfigurableTaskParser with tgProject
      const markdownTasks = parser.parseLegacy(content, file.path, fileMetadata, undefined, tgProject);
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
   * Process multiple files in batch using workers for parallel processing
   */
  async processBatch(files: TFile[], useWorkers: boolean = true): Promise<void> {
    const updates = new Map<string, Task[]>();
    let skippedCount = 0;
    
    // Decide whether to use workers based on batch size and configuration
    const shouldUseWorkers = useWorkers && files.length > 5; // Use workers for batches > 5 files
    
    if (shouldUseWorkers) {
      // Use WorkerOrchestrator for parallel processing
      console.log(`[DataflowOrchestrator] Using workers to process ${files.length} files in parallel`);
      
      try {
        // Configure worker manager with plugin settings
        const taskWorkerManager = this.workerOrchestrator['taskWorkerManager'] as TaskWorkerManager;
        if (taskWorkerManager) {
          taskWorkerManager.updateSettings({
            preferMetadataFormat: this.plugin.settings.preferMetadataFormat || 'tasks',
            customDateFormats: this.plugin.settings.customDateFormats,
            fileMetadataInheritance: this.plugin.settings.fileMetadataInheritance,
            projectConfig: this.plugin.settings.projectConfig
          });
        }
        
        // Parse all files in parallel using workers (raw parsing only, no project data)
        console.log(`[DataflowOrchestrator] Parsing ${files.length} files with workers (raw extraction)...`);
        const parsedResults = await this.workerOrchestrator.batchParse(files, "normal");
        
        // Compute project data in parallel with storage operations
        const projectDataPromises = new Map<string, Promise<any>>();
        for (const file of files) {
          projectDataPromises.set(file.path, this.projectResolver.get(file.path));
        }
        
        // Process each parsed result
        for (const [filePath, rawTasks] of parsedResults) {
          try {
            const file = files.find(f => f.path === filePath);
            if (!file) continue;
            
            // Get file modification time for caching
            const fileStat = await this.vault.adapter.stat(filePath);
            const mtime = fileStat?.mtime;
            const fileContent = await this.vault.cachedRead(file);
            
            // Store parsed tasks with mtime (can happen in parallel)
            const storePromise = this.storage.storeRaw(filePath, rawTasks, fileContent, mtime);
            
            // Get project data for augmentation (already computing in parallel)
            const projectData = await projectDataPromises.get(filePath);
            
            // Wait for storage to complete
            await storePromise;
            
            // Augment tasks with project data
            const fileMetadata = this.metadataCache.getFileCache(file);
            const augmentContext: AugmentContext = {
              filePath,
              fileMeta: fileMetadata?.frontmatter || {},
              projectName: projectData?.tgProject?.name,
              projectMeta: projectData ? {
                ...projectData.enhancedMetadata || {},
                tgProject: projectData.tgProject  // Include tgProject in projectMeta
              } : {},
              tasks: rawTasks
            };
            const augmentedTasks = await this.augmentor.merge(augmentContext);
            
            updates.set(filePath, augmentedTasks);
          } catch (error) {
            console.error(`Error processing parsed result for ${filePath}:`, error);
          }
        }
        
        console.log(`[DataflowOrchestrator] Worker processing complete, parsed ${parsedResults.size} files`);
        
      } catch (error) {
        console.error("[DataflowOrchestrator] Worker processing failed, falling back to sequential:", error);
        // Fall back to sequential processing
        await this.processBatchSequential(files, updates, skippedCount);
      }
    } else {
      // Use sequential processing for small batches or when workers are disabled
      await this.processBatchSequential(files, updates, skippedCount);
    }
    
    if (skippedCount > 0) {
      console.log(`[DataflowOrchestrator] Skipped ${skippedCount} unchanged files`);
    }
    
    // Update repository in batch
    if (updates.size > 0) {
      await this.repository.updateBatch(updates);
    }
  }
  
  /**
   * Process files sequentially (fallback or for small batches)
   */
  private async processBatchSequential(
    files: TFile[],
    updates: Map<string, Task[]>,
    skippedCount: number
  ): Promise<number> {
    let localSkippedCount = 0;
    
    for (const file of files) {
      try {
        const filePath = file.path;
        
        // Get file modification time
        const fileStat = await this.vault.adapter.stat(file.path);
        const mtime = fileStat?.mtime;
        
        // Check if we can skip this file based on cached data
        const rawCached = await this.storage.loadRaw(filePath);
        const fileContent = await this.vault.cachedRead(file);
        
        if (rawCached && this.storage.isRawValid(filePath, rawCached, fileContent, mtime)) {
          // Skip this file - it hasn't changed
          skippedCount++;
          
          // Use cached raw tasks for augmentation
          const rawTasks = rawCached.data;
          
          // Get project data
          const projectData = await this.projectResolver.get(filePath);
          
          // Augment tasks
          const fileMetadata = this.metadataCache.getFileCache(file);
          const augmentContext: AugmentContext = {
            filePath,
            fileMeta: fileMetadata?.frontmatter || {},
            projectName: projectData.tgProject?.name,
            projectMeta: {
              ...projectData.enhancedMetadata,
              tgProject: projectData.tgProject  // Include tgProject in projectMeta
            },
            tasks: rawTasks
          };
          const augmentedTasks = await this.augmentor.merge(augmentContext);
          
          updates.set(filePath, augmentedTasks);
        } else {
          // Parse file as it has changed or is new
          // Get project data first for parsing
          const projectData = await this.projectResolver.get(filePath);
          const rawTasks = await this.parseFile(file, projectData.tgProject);
          
          // Store raw tasks with mtime
          await this.storage.storeRaw(filePath, rawTasks, fileContent, mtime);
          
          // Augment tasks
          const fileMetadata = this.metadataCache.getFileCache(file);
          const augmentContext: AugmentContext = {
            filePath,
            fileMeta: fileMetadata?.frontmatter || {},
            projectName: projectData.tgProject?.name,
            projectMeta: {
              ...projectData.enhancedMetadata,
              tgProject: projectData.tgProject  // Include tgProject in projectMeta
            },
            tasks: rawTasks
          };
          const augmentedTasks = await this.augmentor.merge(augmentContext);
          
          updates.set(filePath, augmentedTasks);
        }
        
      } catch (error) {
        console.error(`Error processing file ${file.path} sequentially:`, error);
      }
    }
    
    return localSkippedCount;
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
    
    // Unsubscribe from events
    for (const ref of this.eventRefs) {
      this.app.vault.offref(ref);
    }
    this.eventRefs = [];
    
    // Cleanup ObsidianSource
    this.obsidianSource.destroy();
    
    // Cleanup WorkerOrchestrator
    this.workerOrchestrator.destroy();
    
    // Persist current state
    await this.repository.persist();
  }
}