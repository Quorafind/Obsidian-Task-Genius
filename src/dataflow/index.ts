/**
 * Dataflow module exports
 * This is the main entry point for the new dataflow architecture
 */

// Core orchestrator
export { DataflowOrchestrator } from "./Orchestrator";

// API layer
export { QueryAPI } from "./api/QueryAPI";

// Event system
export { Events, emit, on, Seq, onTaskCacheUpdated, emitTaskCacheUpdated } from "./events/Events";
export type { SeqClock } from "./events/Events";

// Repository and storage
export { Repository } from "./indexer/Repository";
export { Storage, Keys } from "./persistence/Storage";
export type { RawRecord, ProjectRecord, AugmentedRecord, ConsolidatedRecord } from "./persistence/Storage";

// Project resolution
export { Resolver as ProjectResolver } from "./project/Resolver";
export type { ProjectData } from "./project/Resolver";

// Task augmentation
export { Augmentor } from "./augment/Augmentor";
export type { FileContext, AugmentContext, InheritanceStrategy } from "./augment/Augmentor";

// Worker management
export { WorkerOrchestrator } from "./workers/WorkerOrchestrator";

// Event sources
export { ObsidianSource } from "./sources/ObsidianSource";

// Parsers
export { parseMarkdown } from "./parsers/MarkdownEntry";
export { parseCanvas } from "./parsers/CanvasEntry";
export { parseFileMeta } from "./parsers/FileMetaEntry";

/**
 * Factory function to create and initialize the dataflow system
 */
export async function createDataflow(
  app: any,
  vault: any,
  metadataCache: any,
  plugin: any,
  projectOptions?: any
): Promise<DataflowOrchestrator> {
  const orchestrator = new DataflowOrchestrator(
    app,
    vault,
    metadataCache,
    plugin,
    projectOptions
  );
  
  await orchestrator.initialize();
  
  return orchestrator;
}

/**
 * Migration helper to transition from old to new system
 */
export class DataflowMigration {
  /**
   * Check if migration is needed
   */
  static async needsMigration(storage: Storage): Promise<boolean> {
    const version = await storage.loadVersion();
    return !version || version.schema < 1;
  }
  
  /**
   * Perform migration from old system to new
   */
  static async migrate(
    orchestrator: DataflowOrchestrator,
    oldTaskManager: any
  ): Promise<void> {
    console.log("Starting dataflow migration...");
    
    // Get all tasks from old system
    const oldTasks = await oldTaskManager.getAllTasks();
    
    // Group tasks by file
    const tasksByFile = new Map<string, any[]>();
    for (const task of oldTasks) {
      const filePath = task.filePath || task.path;
      if (!filePath) continue;
      
      if (!tasksByFile.has(filePath)) {
        tasksByFile.set(filePath, []);
      }
      tasksByFile.get(filePath)!.push(task);
    }
    
    // Process each file through new system
    for (const [filePath, tasks] of tasksByFile) {
      const file = orchestrator["vault"].getAbstractFileByPath(filePath);
      if (file) {
        await orchestrator.processFile(file);
      }
    }
    
    console.log(`Migration complete. Processed ${tasksByFile.size} files.`);
  }
}