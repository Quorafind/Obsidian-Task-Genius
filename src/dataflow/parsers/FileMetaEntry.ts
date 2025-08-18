import { FileMetadataTaskParser } from "../../utils/workers/FileMetadataTaskParser";
import type { Task } from "../../types/task";
import type { FileParsingConfiguration } from "../../common/setting-definition";

// Project detection is disabled here; project will be added in augment stage
export async function parseFileMeta(
  content: string,
  filePath: string,
  fileCache: any,
  config: FileParsingConfiguration
): Promise<Task[]> {
  const parser = new FileMetadataTaskParser({
    ...config,
    // ensure project detection defaults are respected; detection methods are passed as undefined here
  } as any, undefined);
  const { tasks } = parser.parseFileForTasks(filePath, content, fileCache);
  return tasks;
}

