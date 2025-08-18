import { CanvasParser } from "../../utils/parsing/CanvasParser";
import type { Task } from "../../types/task";
import { getConfig } from "../../common/task-parser-config";
import TaskProgressBarPlugin from "../../index";

// This entry requires plugin to provide config like original code did
export async function parseCanvas(content: string, filePath: string, plugin: TaskProgressBarPlugin): Promise<Task[]> {
  const config = getConfig(plugin.settings.preferMetadataFormat, plugin);
  const parser = new CanvasParser(config);
  return parser.parseCanvasFile(content, filePath);
}

