/**
 * Integration Example: How to use the new dataflow system
 * 
 * This file demonstrates how to integrate the new dataflow architecture
 * with the existing Task Genius plugin infrastructure.
 */

import type { App, TFile, Vault, MetadataCache } from "obsidian";
import type TaskGeniusPlugin from "../main";
import { createDataflow, DataflowOrchestrator, Events, on } from "./index";

/**
 * Example 1: Basic integration in plugin onload
 */
export async function integrateDataflowInPlugin(plugin: TaskGeniusPlugin) {
  // Create and initialize the dataflow orchestrator
  const dataflow = await createDataflow(
    plugin.app,
    plugin.app.vault,
    plugin.app.metadataCache,
    plugin,
    {
      // Project configuration options (optional)
      configFileName: plugin.settings.projectConfigFileName || "tg-project.md",
      searchRecursively: plugin.settings.searchProjectConfigRecursively ?? true,
      metadataKey: plugin.settings.projectMetadataKey || "tgProject",
      enhancedProjectEnabled: plugin.settings.enhancedProjectEnabled ?? true,
    }
  );
  
  // Store reference for later use
  (plugin as any).dataflow = dataflow;
  
  // Set up event listeners for file changes
  plugin.registerEvent(
    plugin.app.vault.on("modify", async (file) => {
      if (file instanceof TFile) {
        await dataflow.processFile(file);
      }
    })
  );
  
  plugin.registerEvent(
    plugin.app.vault.on("create", async (file) => {
      if (file instanceof TFile) {
        await dataflow.processFile(file);
      }
    })
  );
  
  plugin.registerEvent(
    plugin.app.vault.on("delete", async (file) => {
      await dataflow.removeFile(file.path);
    })
  );
  
  plugin.registerEvent(
    plugin.app.vault.on("rename", async (file, oldPath) => {
      if (file instanceof TFile) {
        await dataflow.renameFile(oldPath, file.path);
      }
    })
  );
  
  return dataflow;
}

/**
 * Example 2: How views can subscribe to task updates
 */
export function subscribeViewToTaskUpdates(
  app: App,
  viewId: string,
  renderCallback: (tasks: any[]) => void
) {
  // Get dataflow instance from plugin
  const plugin = (app as any).plugins.plugins["task-genius"];
  const dataflow: DataflowOrchestrator = plugin?.dataflow;
  
  if (!dataflow) {
    console.error("Dataflow not initialized");
    return;
  }
  
  // Subscribe to task cache updates
  const eventRef = on(app, Events.TASK_CACHE_UPDATED, async (payload) => {
    // Query tasks based on view requirements
    const queryAPI = dataflow.getQueryAPI();
    
    // Example: Get all incomplete tasks
    const tasks = await queryAPI.byStatus(false);
    
    // Render the tasks in the view
    renderCallback(tasks);
  });
  
  return eventRef;
}

/**
 * Example 3: Querying tasks using the new API
 */
export async function queryTasksExample(dataflow: DataflowOrchestrator) {
  const queryAPI = dataflow.getQueryAPI();
  
  // Get all tasks
  const allTasks = await queryAPI.all();
  console.log(`Total tasks: ${allTasks.length}`);
  
  // Get tasks by project
  const projectTasks = await queryAPI.byProject("MyProject");
  console.log(`Tasks in MyProject: ${projectTasks.length}`);
  
  // Get tasks by tags
  const taggedTasks = await queryAPI.byTags(["important", "urgent"]);
  console.log(`Important and urgent tasks: ${taggedTasks.length}`);
  
  // Get tasks by date range
  const dueSoon = await queryAPI.byDateRange({
    from: Date.now(),
    to: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days from now
    field: "due"
  });
  console.log(`Tasks due in next 7 days: ${dueSoon.length}`);
  
  // Get task statistics
  const summary = await queryAPI.getSummary();
  console.log("Task statistics:", summary);
  
  // Advanced query with filter and sorting
  const filtered = await queryAPI.query(
    {
      completed: false,
      project: "Work",
      tags: ["review"]
    },
    [
      { field: "dueDate", order: "asc" },
      { field: "priority", order: "desc" }
    ]
  );
  console.log(`Filtered Work tasks for review: ${filtered.length}`);
}

/**
 * Example 4: Migrating from old TaskManager to new dataflow
 */
export async function migrateFromOldSystem(
  plugin: TaskGeniusPlugin,
  oldTaskManager: any
) {
  console.log("Starting migration to new dataflow system...");
  
  // Create new dataflow system
  const dataflow = await integrateDataflowInPlugin(plugin);
  
  // Perform migration
  const { DataflowMigration } = await import("./index");
  
  // Check if migration is needed
  const storage = dataflow.getQueryAPI().getRepository().getStorage();
  const needsMigration = await DataflowMigration.needsMigration(storage);
  
  if (needsMigration) {
    await DataflowMigration.migrate(dataflow, oldTaskManager);
    console.log("Migration completed successfully");
  } else {
    console.log("No migration needed - already on new system");
  }
  
  // Update views to use new event system
  updateViewsToNewEventSystem(plugin.app);
  
  return dataflow;
}

/**
 * Example 5: Updating views to use new event system
 */
function updateViewsToNewEventSystem(app: App) {
  // Example: Update a task list view
  const workspace = app.workspace;
  
  // Find all task views
  workspace.getLeavesOfType("task-list").forEach(leaf => {
    const view = leaf.view as any;
    
    // Remove old setTasks approach
    if (view.setTasks) {
      console.log(`Updating view ${view.getDisplayText()} to new event system`);
      
      // Subscribe to new events
      view.registerEvent(
        on(app, Events.TASK_CACHE_UPDATED, async () => {
          // Get dataflow instance
          const plugin = (app as any).plugins.plugins["task-genius"];
          const dataflow: DataflowOrchestrator = plugin?.dataflow;
          
          if (dataflow) {
            const queryAPI = dataflow.getQueryAPI();
            const tasks = await queryAPI.all();
            
            // Update view with new tasks
            view.tasks = tasks;
            view.render();
          }
        })
      );
    }
  });
}

/**
 * Example 6: Handling settings changes
 */
export async function handleSettingsChange(
  dataflow: DataflowOrchestrator,
  changedSettings: string[]
) {
  // Determine which scopes are affected
  const scopes: string[] = [];
  
  if (changedSettings.some(s => s.includes("parsing"))) {
    scopes.push("parser");
  }
  
  if (changedSettings.some(s => s.includes("project") || s.includes("inherit"))) {
    scopes.push("augment", "project");
  }
  
  if (changedSettings.some(s => s.includes("index") || s.includes("cache"))) {
    scopes.push("index");
  }
  
  // Notify dataflow of settings change
  await dataflow.onSettingsChange(scopes);
}

/**
 * Example 7: Performance monitoring
 */
export async function monitorDataflowPerformance(dataflow: DataflowOrchestrator) {
  // Get current statistics
  const stats = await dataflow.getStats();
  
  console.log("Dataflow Performance Stats:");
  console.log(`- Total tasks indexed: ${stats.indexStats.total}`);
  console.log(`- Tasks by project:`, stats.indexStats.byProject);
  console.log(`- Storage keys: ${stats.storageStats.totalKeys}`);
  console.log(`- Storage by namespace:`, stats.storageStats.byNamespace);
  console.log(`- Processing queue size: ${stats.queueSize}`);
  
  // Set up periodic monitoring
  setInterval(async () => {
    const currentStats = await dataflow.getStats();
    if (currentStats.queueSize > 10) {
      console.warn(`High processing queue: ${currentStats.queueSize} files pending`);
    }
  }, 30000); // Check every 30 seconds
}

/**
 * Example 8: Custom task processing pipeline
 */
export async function customTaskProcessing(
  dataflow: DataflowOrchestrator,
  file: TFile,
  customProcessor?: (tasks: any[]) => any[]
) {
  // Get the repository for direct access
  const repository = dataflow.getQueryAPI().getRepository();
  
  // Parse the file
  const tasks = await parseFileCustom(file);
  
  // Apply custom processing if provided
  const processedTasks = customProcessor ? customProcessor(tasks) : tasks;
  
  // Update the repository directly
  await repository.updateFile(file.path, processedTasks);
}

async function parseFileCustom(file: TFile): Promise<any[]> {
  // Custom parsing logic here
  return [];
}

/**
 * Example 9: Backup and restore
 */
export async function backupDataflow(dataflow: DataflowOrchestrator): Promise<string> {
  const repository = dataflow.getQueryAPI().getRepository();
  
  // Persist current state
  await repository.persist();
  
  // Get all data for backup
  const stats = await dataflow.getStats();
  const allTasks = await dataflow.getQueryAPI().all();
  
  const backup = {
    timestamp: Date.now(),
    stats,
    tasks: allTasks,
    version: "1.0.0"
  };
  
  return JSON.stringify(backup);
}

export async function restoreDataflow(
  dataflow: DataflowOrchestrator,
  backupJson: string
) {
  const backup = JSON.parse(backupJson);
  
  // Clear current data
  const repository = dataflow.getQueryAPI().getRepository();
  await repository.clear();
  
  // Restore tasks by file
  const tasksByFile = new Map<string, any[]>();
  for (const task of backup.tasks) {
    const filePath = task.filePath || task.path;
    if (!tasksByFile.has(filePath)) {
      tasksByFile.set(filePath, []);
    }
    tasksByFile.get(filePath)!.push(task);
  }
  
  // Update repository with restored tasks
  await repository.updateBatch(tasksByFile);
  
  console.log(`Restored ${backup.tasks.length} tasks from backup`);
}