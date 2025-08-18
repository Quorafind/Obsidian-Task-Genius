import { MarkdownTaskParser } from "../../utils/workers/ConfigurableTaskParser";
import type { Task } from "../../types/task";
import { TaskParserConfig, MetadataParseMode } from "../../types/TaskParserConfig";

// Default config for compatibility
const defaultConfig: TaskParserConfig = {
  parseMetadata: true,
  parseTags: true,
  parseComments: true,
  parseHeadings: true,
  maxIndentSize: 10,
  maxParseIterations: 1000,
  maxMetadataIterations: 10,
  maxTagLength: 50,
  maxEmojiValueLength: 100,
  maxStackOperations: 100,
  maxStackSize: 50,
  statusMapping: {},
  emojiMapping: {},
  metadataParseMode: MetadataParseMode.Both,
  specialTagPrefixes: {}
};

const parser = new MarkdownTaskParser(defaultConfig);

export async function parseMarkdown(content: string, filePath: string, fileMetadata?: Record<string, any>): Promise<Task[]> {
  // Use existing legacy output for compatibility
  return parser.parseLegacy(content, filePath, fileMetadata);
}

