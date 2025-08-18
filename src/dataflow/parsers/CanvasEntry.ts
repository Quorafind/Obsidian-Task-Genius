import { CanvasParser } from "../../dataflow/core/CanvasParser";
import type { Task } from "../../types/task";
import { getConfig } from "../../common/task-parser-config";
import TaskProgressBarPlugin from "../../index";

// This entry requires plugin to provide config like original code did
export async function parseCanvas(plugin: TaskProgressBarPlugin, file: { path: string }, content?: string): Promise<Task[]> {
  const config = getConfig(plugin.settings.preferMetadataFormat, plugin);
  const parser = new CanvasParser(config);
  const filePath = file.path;
  const text = content ?? await plugin.app.vault.cachedRead(file as any);
  return parser.parseCanvasFile(text, filePath);
}

