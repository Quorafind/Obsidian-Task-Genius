/**
 * Factory function for creating and initializing the dataflow system
 */

import type { App, Vault, MetadataCache } from "obsidian";
import type TaskProgressBarPlugin from "../index";
import type { ProjectConfigManagerOptions } from "../managers/project-config-manager";

import { DataflowOrchestrator } from "./Orchestrator";

/**
 * Create and initialize a new dataflow orchestrator
 */
export async function createDataflow(
  app: App,
  vault: Vault,
  metadataCache: MetadataCache,
  plugin: TaskProgressBarPlugin,
  projectOptions?: Partial<ProjectConfigManagerOptions>
): Promise<DataflowOrchestrator> {
  const startTime = Date.now();
  console.log("[createDataflow] Creating dataflow orchestrator...");
  
  const orchestrator = new DataflowOrchestrator(
    app,
    vault,
    metadataCache,
    plugin,
    projectOptions
  );
  // Expose orchestrator immediately so early consumers can subscribe to events
  plugin.dataflowOrchestrator = orchestrator;
  
  console.log("[createDataflow] Initializing dataflow orchestrator...");
  try {
    await orchestrator.initialize();
    const elapsed = Date.now() - startTime;
    console.log(`[createDataflow] Dataflow orchestrator ready (took ${elapsed}ms)`);
  } catch (error) {
    console.error("[createDataflow] Failed to initialize orchestrator:", error);
    if (plugin.dataflowOrchestrator === orchestrator) {
      plugin.dataflowOrchestrator = undefined;
    }
    throw error;
  }
  
  return orchestrator;
}

/**
 * Check if dataflow is enabled in settings
 */
export function isDataflowEnabled(plugin: TaskProgressBarPlugin): boolean {
  return plugin.settings.enableIndexer ?? true;
}
