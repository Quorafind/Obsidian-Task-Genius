/**
 * Settings Migration Utility
 * 
 * Handles migration of duplicate and overlapping settings to consolidate
 * configuration and eliminate confusion for users.
 */

import type { TaskProgressBarSettings } from "../common/setting-definition";
import type { FileSourceConfiguration } from "../types/file-source";

export interface MigrationResult {
  migrated: boolean;
  details: string[];
  warnings: string[];
}

/**
 * Migrate duplicate settings to unified FileSource configuration
 */
export function migrateFileParsingSettings(settings: TaskProgressBarSettings): MigrationResult {
  const result: MigrationResult = {
    migrated: false,
    details: [],
    warnings: []
  };

  // Ensure fileSource exists
  if (!settings.fileSource) {
    settings.fileSource = createDefaultFileSourceConfig();
    result.details.push("Created default FileSource configuration");
  }

  // Migration 1: fileParsingConfig.enableFileMetadataParsing → fileSource.enabled
  if (settings.fileParsingConfig?.enableFileMetadataParsing === true && !settings.fileSource.enabled) {
    settings.fileSource.enabled = true;
    result.migrated = true;
    result.details.push("Migrated: Enable file metadata parsing → Enable FileSource");
  }

  // Migration 2: Tag-based parsing
  if (settings.fileParsingConfig?.enableTagBasedTaskParsing === true) {
    if (!settings.fileSource.recognitionStrategies.tags.enabled) {
      settings.fileSource.recognitionStrategies.tags.enabled = true;
      result.migrated = true;
      result.details.push("Migrated: Tag-based task parsing → FileSource tag recognition");
    }

    // Migrate tag patterns
    if (settings.fileParsingConfig.tagsToParseAsTasks?.length > 0) {
      settings.fileSource.recognitionStrategies.tags.taskTags = [
        ...new Set([
          ...settings.fileSource.recognitionStrategies.tags.taskTags,
          ...settings.fileParsingConfig.tagsToParseAsTasks
        ])
      ];
      result.details.push("Migrated: Tag patterns for task recognition");
    }
  }

  // Migration 3: Metadata fields
  if (settings.fileParsingConfig?.metadataFieldsToParseAsTasks?.length > 0) {
    if (!settings.fileSource.recognitionStrategies.metadata.enabled) {
      settings.fileSource.recognitionStrategies.metadata.enabled = true;
      result.migrated = true;
      result.details.push("Migrated: Metadata parsing → FileSource metadata recognition");
    }

    settings.fileSource.recognitionStrategies.metadata.taskFields = [
      ...new Set([
        ...settings.fileSource.recognitionStrategies.metadata.taskFields,
        ...settings.fileParsingConfig.metadataFieldsToParseAsTasks
      ])
    ];
    result.details.push("Migrated: Metadata fields for task recognition");
  }

  // Migration 4: Worker processing settings
  if (settings.fileParsingConfig?.enableWorkerProcessing === true) {
    settings.fileSource.performance.enableWorkerProcessing = true;
    result.migrated = true;
    result.details.push("Migrated: Worker processing setting");
  }

  // Migration 5: Default task status
  if (settings.fileParsingConfig?.defaultTaskStatus) {
    settings.fileSource.fileTaskProperties.defaultStatus = settings.fileParsingConfig.defaultTaskStatus;
    result.details.push("Migrated: Default task status");
  }

  // Migration 6: Task content source
  if (settings.fileParsingConfig?.taskContentFromMetadata) {
    if (settings.fileParsingConfig.taskContentFromMetadata === "title") {
      settings.fileSource.fileTaskProperties.contentSource = "title";
    } else {
      settings.fileSource.fileTaskProperties.contentSource = "custom";
      settings.fileSource.fileTaskProperties.customContentField = settings.fileParsingConfig.taskContentFromMetadata;
    }
    result.details.push("Migrated: Task content source");
  }

  // Check for conflicts and warn user
  if (settings.fileParsingConfig?.enableFileMetadataParsing === true && settings.fileSource.enabled === false) {
    result.warnings.push("Conflict detected: File metadata parsing enabled but FileSource disabled");
  }

  return result;
}

/**
 * Clean up deprecated settings after successful migration
 */
export function cleanupDeprecatedSettings(settings: TaskProgressBarSettings): MigrationResult {
  const result: MigrationResult = {
    migrated: false,
    details: [],
    warnings: []
  };

  // Only clean up if FileSource is enabled (migration was successful)
  if (!settings.fileSource?.enabled) {
    result.warnings.push("Skipping cleanup: FileSource not enabled");
    return result;
  }

  // Reset deprecated fileParsingConfig flags that are now handled by FileSource
  if (settings.fileParsingConfig?.enableFileMetadataParsing === true) {
    settings.fileParsingConfig.enableFileMetadataParsing = false;
    result.migrated = true;
    result.details.push("Disabled deprecated: Enable file metadata parsing");
  }

  if (settings.fileParsingConfig?.enableTagBasedTaskParsing === true) {
    settings.fileParsingConfig.enableTagBasedTaskParsing = false;
    result.migrated = true;
    result.details.push("Disabled deprecated: Tag-based task parsing");
  }

  // Clear migrated arrays to avoid confusion
  if (settings.fileParsingConfig?.metadataFieldsToParseAsTasks?.length > 0) {
    settings.fileParsingConfig.metadataFieldsToParseAsTasks = [];
    result.details.push("Cleared deprecated: Metadata fields array");
  }

  if (settings.fileParsingConfig?.tagsToParseAsTasks?.length > 0) {
    settings.fileParsingConfig.tagsToParseAsTasks = [];
    result.details.push("Cleared deprecated: Task tags array");
  }

  return result;
}

/**
 * Migrate duplicate project settings
 */
export function migrateProjectSettings(settings: TaskProgressBarSettings): MigrationResult {
  const result: MigrationResult = {
    migrated: false,
    details: [],
    warnings: []
  };

  // Check for duplicate project detection methods
  if (settings.projectConfig?.enableEnhancedProject && settings.fileSource?.enabled) {
    result.warnings.push("Both enhanced project features and FileSource are enabled - consider consolidating");
  }

  // Note: fileSourceConfig was removed - if any code was using it, 
  // it should now use fileSource instead
  result.details.push("Project configuration uses projectConfig for enhanced features");

  return result;
}

/**
 * Migrate time parsing settings to enhanced configuration
 */
export function migrateTimeParsingSettings(settings: TaskProgressBarSettings): MigrationResult {
  const result: MigrationResult = {
    migrated: false,
    details: [],
    warnings: []
  };

  // Check if timeParsing exists but lacks enhanced configuration
  if (settings.timeParsing && !settings.timeParsing.timePatterns) {
    // Add enhanced time parsing configuration with defaults
    settings.timeParsing.timePatterns = {
      singleTime: [
        /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/g, // 24-hour format
        /\b(1[0-2]|0?[1-9]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)\b/g, // 12-hour format
      ],
      timeRange: [
        /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*[-~～]\s*([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/g, // 24-hour range
        /\b(1[0-2]|0?[1-9]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)?\s*[-~～]\s*(1[0-2]|0?[1-9]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)\b/g, // 12-hour range
      ],
      rangeSeparators: ["-", "~", "～", " - ", " ~ ", " ～ "],
    };
    
    result.migrated = true;
    result.details.push("Added enhanced time parsing patterns configuration");
  }

  if (settings.timeParsing && !settings.timeParsing.timeDefaults) {
    // Add time defaults configuration
    settings.timeParsing.timeDefaults = {
      preferredFormat: "24h",
      defaultPeriod: "AM",
      midnightCrossing: "next-day",
    };
    
    result.migrated = true;
    result.details.push("Added time parsing defaults configuration");
  }

  return result;
}

/**
 * Run all migrations
 */
export function runAllMigrations(settings: TaskProgressBarSettings): MigrationResult {
  const results: MigrationResult[] = [];
  
  // Run individual migrations
  results.push(migrateFileParsingSettings(settings));
  results.push(migrateProjectSettings(settings));
  results.push(migrateTimeParsingSettings(settings));
  
  // Only cleanup if migrations were successful
  const hasSuccessfulMigrations = results.some(r => r.migrated);
  if (hasSuccessfulMigrations) {
    results.push(cleanupDeprecatedSettings(settings));
  }

  // Combine results
  return {
    migrated: results.some(r => r.migrated),
    details: results.flatMap(r => r.details),
    warnings: results.flatMap(r => r.warnings)
  };
}

/**
 * Create default FileSource configuration
 */
function createDefaultFileSourceConfig(): FileSourceConfiguration {
  return {
    enabled: false,
    recognitionStrategies: {
      metadata: {
        enabled: false,
        taskFields: ["dueDate", "status", "priority", "assigned"],
        requireAllFields: false
      },
      tags: {
        enabled: false,
        taskTags: ["#task", "#actionable", "#todo"],
        matchMode: "exact"
      },
      templates: {
        enabled: false,
        templatePaths: ["Templates/Task Template.md"],
        checkTemplateMetadata: true
      },
      paths: {
        enabled: false,
        taskPaths: ["Projects/", "Tasks/"],
        matchMode: "prefix"
      }
    },
    metadataMappings: [],
    fileTaskProperties: {
      contentSource: "filename",
      stripExtension: true,
      defaultStatus: " ",
      defaultPriority: undefined,
      preferFrontmatterTitle: true
    },
    relationships: {
      enableChildRelationships: true,
      enableMetadataInheritance: true,
      inheritanceFields: ["project", "priority", "context"]
    },
    performance: {
      enableWorkerProcessing: true,
      enableCaching: true,
      cacheTTL: 300000
    },
    statusMapping: {
      enabled: true,
      metadataToSymbol: {
        'completed': 'x',
        'done': 'x',
        'in-progress': '/',
        'planned': '?',
        'cancelled': '-',
        'not-started': ' '
      },
      symbolToMetadata: {
        'x': 'completed',
        '/': 'in-progress',
        '?': 'planned',
        '-': 'cancelled',
        ' ': 'not-started'
      },
      autoDetect: true,
      caseSensitive: false
    }
  };
}

/**
 * Check if settings have duplicates that need migration
 */
export function hasSettingsDuplicates(settings: TaskProgressBarSettings): boolean {
  // Check for the main duplicate: file metadata parsing enabled in both systems
  const fileParsingEnabled = settings.fileParsingConfig?.enableFileMetadataParsing === true;
  const fileSourceEnabled = settings.fileSource?.enabled === true;
  
  if (fileParsingEnabled && !fileSourceEnabled) {
    return true;
  }

  // Check for tag parsing duplicates
  const tagParsingEnabled = settings.fileParsingConfig?.enableTagBasedTaskParsing === true;
  const tagRecognitionEnabled = settings.fileSource?.recognitionStrategies?.tags?.enabled === true;
  
  if (tagParsingEnabled && !tagRecognitionEnabled) {
    return true;
  }

  // Check for worker processing duplicates
  const workerParsingEnabled = settings.fileParsingConfig?.enableWorkerProcessing === true;
  const workerSourceEnabled = settings.fileSource?.performance?.enableWorkerProcessing === true;
  
  if (workerParsingEnabled !== workerSourceEnabled) {
    return true;
  }

  return false;
}