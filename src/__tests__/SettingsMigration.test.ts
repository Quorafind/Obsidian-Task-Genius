/**
 * Tests for Settings Migration functionality
 */

import { 
  migrateFileParsingSettings, 
  cleanupDeprecatedSettings,
  hasSettingsDuplicates,
  runAllMigrations 
} from '../utils/SettingsMigration';
import { DEFAULT_SETTINGS, type TaskProgressBarSettings } from '../common/setting-definition';

describe('Settings Migration', () => {
  let testSettings: TaskProgressBarSettings;

  beforeEach(() => {
    // Create a copy of default settings for testing
    testSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  });

  describe('hasSettingsDuplicates', () => {
    it('should detect when file metadata parsing is enabled but FileSource is disabled', () => {
      testSettings.fileParsingConfig.enableFileMetadataParsing = true;
      testSettings.fileSource.enabled = false;
      
      expect(hasSettingsDuplicates(testSettings)).toBe(true);
    });

    it('should detect when tag parsing is enabled but FileSource tag recognition is disabled', () => {
      testSettings.fileParsingConfig.enableTagBasedTaskParsing = true;
      testSettings.fileSource.recognitionStrategies.tags.enabled = false;
      
      expect(hasSettingsDuplicates(testSettings)).toBe(true);
    });

    it('should return false when no duplicates exist', () => {
      expect(hasSettingsDuplicates(testSettings)).toBe(false);
    });
  });

  describe('migrateFileParsingSettings', () => {
    it('should migrate file metadata parsing to FileSource', () => {
      testSettings.fileParsingConfig.enableFileMetadataParsing = true;
      testSettings.fileSource.enabled = false;
      
      const result = migrateFileParsingSettings(testSettings);
      
      expect(result.migrated).toBe(true);
      expect(testSettings.fileSource.enabled).toBe(true);
      expect(result.details).toContain('Migrated: Enable file metadata parsing → Enable FileSource');
    });

    it('should migrate tag-based parsing settings', () => {
      testSettings.fileParsingConfig.enableTagBasedTaskParsing = true;
      testSettings.fileParsingConfig.tagsToParseAsTasks = ['#custom-tag', '#work'];
      testSettings.fileSource.recognitionStrategies.tags.enabled = false;
      
      const result = migrateFileParsingSettings(testSettings);
      
      expect(result.migrated).toBe(true);
      expect(testSettings.fileSource.recognitionStrategies.tags.enabled).toBe(true);
      expect(testSettings.fileSource.recognitionStrategies.tags.taskTags).toContain('#custom-tag');
      expect(testSettings.fileSource.recognitionStrategies.tags.taskTags).toContain('#work');
    });

    it('should migrate metadata fields for task recognition', () => {
      testSettings.fileParsingConfig.metadataFieldsToParseAsTasks = ['custom-field', 'project-task'];
      testSettings.fileSource.recognitionStrategies.metadata.enabled = false;
      
      const result = migrateFileParsingSettings(testSettings);
      
      expect(result.migrated).toBe(true);
      expect(testSettings.fileSource.recognitionStrategies.metadata.enabled).toBe(true);
      expect(testSettings.fileSource.recognitionStrategies.metadata.taskFields).toContain('custom-field');
      expect(testSettings.fileSource.recognitionStrategies.metadata.taskFields).toContain('project-task');
    });

    it('should migrate worker processing settings', () => {
      testSettings.fileParsingConfig.enableWorkerProcessing = true;
      
      const result = migrateFileParsingSettings(testSettings);
      
      expect(result.migrated).toBe(true);
      expect(testSettings.fileSource.performance.enableWorkerProcessing).toBe(true);
      expect(result.details).toContain('Migrated: Worker processing setting');
    });

    it('should migrate task content source settings', () => {
      testSettings.fileParsingConfig.taskContentFromMetadata = 'custom-title';
      
      const result = migrateFileParsingSettings(testSettings);
      
      expect(testSettings.fileSource.fileTaskProperties.contentSource).toBe('custom');
      expect(testSettings.fileSource.fileTaskProperties.customContentField).toBe('custom-title');
      expect(result.details).toContain('Migrated: Task content source');
    });

    it('should handle title content source correctly', () => {
      testSettings.fileParsingConfig.taskContentFromMetadata = 'title';
      
      const result = migrateFileParsingSettings(testSettings);
      
      expect(testSettings.fileSource.fileTaskProperties.contentSource).toBe('title');
      expect(testSettings.fileSource.fileTaskProperties.customContentField).toBeUndefined();
    });
  });

  describe('cleanupDeprecatedSettings', () => {
    it('should not cleanup if FileSource is disabled', () => {
      testSettings.fileParsingConfig.enableFileMetadataParsing = true;
      testSettings.fileSource.enabled = false;
      
      const result = cleanupDeprecatedSettings(testSettings);
      
      expect(result.migrated).toBe(false);
      expect(result.warnings).toContain('Skipping cleanup: FileSource not enabled');
      expect(testSettings.fileParsingConfig.enableFileMetadataParsing).toBe(true);
    });

    it('should cleanup deprecated settings when FileSource is enabled', () => {
      testSettings.fileParsingConfig.enableFileMetadataParsing = true;
      testSettings.fileParsingConfig.enableTagBasedTaskParsing = true;
      testSettings.fileParsingConfig.metadataFieldsToParseAsTasks = ['old-field'];
      testSettings.fileParsingConfig.tagsToParseAsTasks = ['#old-tag'];
      testSettings.fileSource.enabled = true;
      
      const result = cleanupDeprecatedSettings(testSettings);
      
      expect(result.migrated).toBe(true);
      expect(testSettings.fileParsingConfig.enableFileMetadataParsing).toBe(false);
      expect(testSettings.fileParsingConfig.enableTagBasedTaskParsing).toBe(false);
      expect(testSettings.fileParsingConfig.metadataFieldsToParseAsTasks).toEqual([]);
      expect(testSettings.fileParsingConfig.tagsToParseAsTasks).toEqual([]);
      
      expect(result.details).toContain('Disabled deprecated: Enable file metadata parsing');
      expect(result.details).toContain('Disabled deprecated: Tag-based task parsing');
      expect(result.details).toContain('Cleared deprecated: Metadata fields array');
      expect(result.details).toContain('Cleared deprecated: Task tags array');
    });
  });

  describe('runAllMigrations', () => {
    it('should run complete migration workflow', () => {
      // Set up scenario with duplicates
      testSettings.fileParsingConfig.enableFileMetadataParsing = true;
      testSettings.fileParsingConfig.enableTagBasedTaskParsing = true;
      testSettings.fileParsingConfig.metadataFieldsToParseAsTasks = ['task-field'];
      testSettings.fileParsingConfig.tagsToParseAsTasks = ['#task-tag'];
      testSettings.fileSource.enabled = false;
      
      const result = runAllMigrations(testSettings);
      
      expect(result.migrated).toBe(true);
      
      // Check migration happened
      expect(testSettings.fileSource.enabled).toBe(true);
      expect(testSettings.fileSource.recognitionStrategies.tags.enabled).toBe(true);
      expect(testSettings.fileSource.recognitionStrategies.metadata.enabled).toBe(true);
      
      // Check cleanup happened
      expect(testSettings.fileParsingConfig.enableFileMetadataParsing).toBe(false);
      expect(testSettings.fileParsingConfig.enableTagBasedTaskParsing).toBe(false);
      expect(testSettings.fileParsingConfig.metadataFieldsToParseAsTasks).toEqual([]);
      expect(testSettings.fileParsingConfig.tagsToParseAsTasks).toEqual([]);
      
      // Check we have migration details
      expect(result.details.length).toBeGreaterThan(0);
    });

    it('should not run cleanup if migration fails', () => {
      // No migration needed
      const result = runAllMigrations(testSettings);
      
      expect(result.migrated).toBe(false);
      expect(result.details.length).toBeLessThanOrEqual(1); // Only project config detail
    });
  });

  describe('edge cases', () => {
    it('should handle missing fileSource gracefully', () => {
      // @ts-ignore - Simulating corrupted settings
      delete testSettings.fileSource;
      testSettings.fileParsingConfig.enableFileMetadataParsing = true;
      
      const result = migrateFileParsingSettings(testSettings);
      
      expect(result.migrated).toBe(true);
      expect(testSettings.fileSource).toBeDefined();
      expect(testSettings.fileSource.enabled).toBe(true);
      expect(result.details).toContain('Created default FileSource configuration');
    });

    it('should merge tags without duplicates', () => {
      testSettings.fileParsingConfig.enableTagBasedTaskParsing = true;
      testSettings.fileParsingConfig.tagsToParseAsTasks = ['#task', '#work'];
      testSettings.fileSource.recognitionStrategies.tags.taskTags = ['#task', '#existing'];
      
      const result = migrateFileParsingSettings(testSettings);
      
      const finalTags = testSettings.fileSource.recognitionStrategies.tags.taskTags;
      expect(finalTags).toContain('#task');
      expect(finalTags).toContain('#work');
      expect(finalTags).toContain('#existing');
      // Should not have duplicates
      expect(finalTags.filter(tag => tag === '#task')).toHaveLength(1);
    });

    it('should merge metadata fields without duplicates', () => {
      testSettings.fileParsingConfig.metadataFieldsToParseAsTasks = ['dueDate', 'custom'];
      testSettings.fileSource.recognitionStrategies.metadata.taskFields = ['dueDate', 'existing'];
      
      const result = migrateFileParsingSettings(testSettings);
      
      const finalFields = testSettings.fileSource.recognitionStrategies.metadata.taskFields;
      expect(finalFields).toContain('dueDate');
      expect(finalFields).toContain('custom');
      expect(finalFields).toContain('existing');
      // Should not have duplicates
      expect(finalFields.filter(field => field === 'dueDate')).toHaveLength(1);
    });
  });
});