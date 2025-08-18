/**
 * Factory function for creating and initializing the dataflow system
 */

import type { App, Vault, MetadataCache } from "obsidian";
import type TaskProgressBarPlugin from "../index";
import type { ProjectConfigManagerOptions } from "../utils/ProjectConfigManager";

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
  console.log("Creating dataflow orchestrator...");
  
  const orchestrator = new DataflowOrchestrator(
    app,
    vault,
    metadataCache,
    plugin,
    projectOptions
  );
  
  console.log("Initializing dataflow orchestrator...");
  await orchestrator.initialize();
  
  console.log("Dataflow orchestrator ready");
  return orchestrator;
}

/**
 * Check if dataflow is enabled in settings
 */
export function isDataflowEnabled(plugin: TaskProgressBarPlugin): boolean {
  return plugin.settings.experimental?.dataflowEnabled ?? false;
}