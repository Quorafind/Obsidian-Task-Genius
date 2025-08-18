import { FileMetadataTaskParser } from "../../utils/workers/FileMetadataTaskParser";
import type { Task } from "../../types/task";
import type TaskGeniusPlugin from "../../main";

/**
 * Parse file-level tasks from frontmatter and tags
 * Project detection is disabled here - project will be added in augment stage
 */
export async function parseFileMeta(
  plugin: TaskGeniusPlugin,
  filePath: string
): Promise<Task[]> {
  const file = plugin.app.vault.getAbstractFileByPath(filePath);
  if (!file) return [];
  
  const fileCache = plugin.app.metadataCache.getFileCache(file);
  if (!fileCache) return [];
  
  const fileContent = await plugin.app.vault.cachedRead(file);
  
  // Create parser with project detection disabled (pass undefined for detection methods)
  const parser = new FileMetadataTaskParser(
    plugin.settings.fileParsingConfig,
    undefined // No project detection methods - handled by ProjectResolver
  );
  
  const { tasks } = parser.parseFileForTasks(filePath, fileContent, fileCache);
  return tasks;
}

