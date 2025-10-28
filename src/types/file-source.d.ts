/**
 * FileSource Type Definitions
 * 
 * Core types for the FileSource feature that enables files to be recognized
 * as tasks based on their metadata properties.
 */

import type { StandardTaskMetadata } from "./task";

/** Recognition strategies for identifying files as tasks */
export type RecognitionStrategy = "metadata" | "tag" | "template" | "path";

/** Extended metadata for file source tasks */
export interface FileSourceTaskMetadata extends StandardTaskMetadata {
  /** Task source identifier */
  source: "file-source";
  
  /** Recognition strategy that identified this file as a task */
  recognitionStrategy: RecognitionStrategy;
  
  /** Recognition criteria that matched */
  recognitionCriteria: string;
  
  /** File creation/modification timestamps */
  fileTimestamps: {
    created: number;
    modified: number;
  };
  
  /** Child task relationships */
  childTasks: string[]; // IDs of tasks within this file
  
  /** Project relationship (if file is also a project) */
  projectData?: {
    isProject: boolean;
    projectName?: string;
    projectType?: string;
  };
}

/** Configuration for metadata-based recognition */
export interface MetadataRecognitionConfig {
  enabled: boolean;
  /** Metadata fields that make a file a task */
  taskFields: string[];
  /** Require all fields or any field */
  requireAllFields: boolean;
}

/** Configuration for tag-based recognition */
export interface TagRecognitionConfig {
  enabled: boolean;
  /** Tags that make a file a task */
  taskTags: string[];
  /** Tag matching mode */
  matchMode: "exact" | "prefix" | "contains";
}

/** Configuration for template-based recognition */
export interface TemplateRecognitionConfig {
  enabled: boolean;
  /** Template files or patterns */
  templatePaths: string[];
  /** Check template metadata */
  checkTemplateMetadata: boolean;
}

/** Configuration for path-based recognition */
export interface PathRecognitionConfig {
  enabled: boolean;
  /** Path patterns that contain file tasks */
  taskPaths: string[];
  /** Pattern matching mode */
  matchMode: "prefix" | "regex" | "glob";
}

/** Recognition strategies configuration */
export interface RecognitionStrategiesConfig {
  metadata: MetadataRecognitionConfig;
  tags: TagRecognitionConfig;
  templates: TemplateRecognitionConfig;
  paths: PathRecognitionConfig;
}

/** Metadata mapping configuration for normalizing frontmatter keys */
export interface MetadataMappingConfig {
  /** Source frontmatter key */
  sourceKey: string;
  /** Target standard metadata field */
  targetKey: string;
  /** Whether this mapping is active */
  enabled: boolean;
}

/** File task properties configuration */
export interface FileTaskPropertiesConfig {
  /** Default task content source */
  contentSource: "filename" | "title" | "h1" | "custom";
  /** Custom content field (if contentSource is "custom") */
  customContentField?: string;
  /** Strip file extension from content */
  stripExtension: boolean;
  /** Default status for new file tasks */
  defaultStatus: string;
  /** Default priority for new file tasks */
  defaultPriority?: number;
  /** Prefer frontmatter title over file renaming when updating task content */
  preferFrontmatterTitle: boolean;
}

/** Relationship configuration */
export interface RelationshipsConfig {
  /** Enable file-task to child-task relationships */
  enableChildRelationships: boolean;
  /** Inherit metadata from file to child tasks */
  enableMetadataInheritance: boolean;
  /** Metadata fields to inherit */
  inheritanceFields: string[];
}

/** Performance configuration */
export interface PerformanceConfig {
  /** Enable worker processing for file tasks */
  enableWorkerProcessing: boolean;
  /** Cache file task results */
  enableCaching: boolean;
  /** Cache TTL in milliseconds */
  cacheTTL: number;
}

/**
 * Configuration for mapping between file metadata status values and task status symbols
 */
export interface StatusMappingConfig {
  /** Enable status mapping between metadata values and symbols */
  enabled: boolean;
  
  /** Map from human-readable metadata values to task status symbols
   * e.g., "completed" → "x", "in-progress" → "/" */
  metadataToSymbol: Record<string, string>;
  
  /** Map from task status symbols to preferred metadata values
   * e.g., "x" → "completed", "/" → "in-progress" */
  symbolToMetadata: Record<string, string>;
  
  /** Auto-detect common status patterns */
  autoDetect: boolean;
  
  /** Case sensitivity for status value matching */
  caseSensitive: boolean;
}

/** Main FileSource configuration interface */
export interface FileSourceConfiguration {
  /** Enable FileSource feature */
  enabled: boolean;
  
  /** Recognition strategies */
  recognitionStrategies: RecognitionStrategiesConfig;

  /** Metadata mappings for normalizing custom frontmatter fields */
  metadataMappings: MetadataMappingConfig[];
  
  /** File task properties */
  fileTaskProperties: FileTaskPropertiesConfig;
  
  /** Relationship configuration */
  relationships: RelationshipsConfig;
  
  /** Performance configuration */
  performance: PerformanceConfig;
  
  /** Status mapping configuration */
  statusMapping: StatusMappingConfig;
}

/** Statistics interface for FileSource */
export interface FileSourceStats {
  /** Whether FileSource is initialized */
  initialized: boolean;
  /** Number of files being tracked as tasks */
  trackedFileCount: number;
  /** Breakdown by recognition strategy */
  recognitionBreakdown: Record<RecognitionStrategy, number>;
  /** Last update timestamp */
  lastUpdate: number;
  /** Last update sequence number */
  lastUpdateSeq: number;
}

/** Interface for recognition strategy implementations */
export interface RecognitionStrategyInterface {
  /** Strategy name */
  name: RecognitionStrategy;
  
  /** Check if file matches this strategy */
  matches(filePath: string, fileContent: string, fileCache: any): boolean;
  
  /** Extract task metadata from file */
  extractMetadata(filePath: string, fileContent: string, fileCache: any): Partial<FileSourceTaskMetadata>;
  
  /** Get strategy configuration */
  getConfig(): any;
  
  /** Update strategy configuration */
  updateConfig(config: any): void;
}

/** Update decision for change detection */
export interface UpdateDecision {
  update: boolean;
  reason: 'not-a-file-task' | 'task-status-changed' | 
          'task-properties-changed' | 'children-structure-changed' | 
          'no-relevant-changes';
  details?: any;
}

/** File task cache structure for change detection */
export interface FileTaskCache {
  /** Whether file is tracked as a task */
  fileTaskExists: boolean;
  /** Hash of frontmatter for quick property change detection */
  frontmatterHash: string;
  /** Set of child task IDs for structure tracking */
  childTaskIds: Set<string>;
  /** Last updated timestamp */
  lastUpdated: number;
}
