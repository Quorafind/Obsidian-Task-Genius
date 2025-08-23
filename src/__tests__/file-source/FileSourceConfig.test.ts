/**
 * Tests for FileSourceConfig
 */

import { FileSourceConfig, DEFAULT_FILE_SOURCE_CONFIG } from "../../dataflow/sources/FileSourceConfig";
import type { FileSourceConfiguration } from "../../types/file-source";

describe('FileSourceConfig', () => {
  let config: FileSourceConfig;

  beforeEach(() => {
    config = new FileSourceConfig();
  });

  afterEach(() => {
    // Clean up any listeners
    if (config) {
      // Config doesn't expose cleanup method, but we can create a new instance
      config = new FileSourceConfig();
    }
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const result = config.getConfig();
      expect(result).toEqual(DEFAULT_FILE_SOURCE_CONFIG);
    });

    it('should initialize with partial configuration', () => {
      const partial: Partial<FileSourceConfiguration> = {
        enabled: true,
        recognitionStrategies: {
          metadata: {
            enabled: false,
            taskFields: ['custom'],
            requireAllFields: true
          },
          tags: {
            enabled: false,
            taskTags: [],
            matchMode: 'exact'
          },
          templates: {
            enabled: false,
            templatePaths: [],
            checkTemplateMetadata: true
          },
          paths: {
            enabled: false,
            taskPaths: [],
            matchMode: 'prefix'
          }
        }
      };

      const customConfig = new FileSourceConfig(partial);
      const result = customConfig.getConfig();

      expect(result.enabled).toBe(true);
      expect(result.recognitionStrategies.metadata.enabled).toBe(false);
      expect(result.recognitionStrategies.metadata.taskFields).toEqual(['custom']);
      expect(result.recognitionStrategies.metadata.requireAllFields).toBe(true);
      
      // Other properties should have defaults
      expect(result.recognitionStrategies.tags.enabled).toBe(false); // Set to false in partial config
    });
  });

  describe('configuration updates', () => {
    it('should update configuration and notify listeners', () => {
      return new Promise<void>((resolve) => {
        const updates: Partial<FileSourceConfiguration> = {
          enabled: true,
          fileTaskProperties: {
            contentSource: 'title',
            stripExtension: false,
            defaultStatus: 'x',
            preferFrontmatterTitle: true
          }
        };

        config.onChange((newConfig) => {
          expect(newConfig.enabled).toBe(true);
          expect(newConfig.fileTaskProperties.contentSource).toBe('title');
          expect(newConfig.fileTaskProperties.stripExtension).toBe(false);
          expect(newConfig.fileTaskProperties.defaultStatus).toBe('x');
          resolve();
        });

        config.updateConfig(updates);
      });
    });

    it('should not notify listeners if configuration does not change', () => {
      const listener = jest.fn();
      config.onChange(listener);

      // Update with same values
      config.updateConfig({ enabled: false });
      
      expect(listener).not.toHaveBeenCalled();
    });

    it('should allow multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      config.onChange(listener1);
      config.onChange(listener2);

      config.updateConfig({ enabled: true });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should allow unsubscribing listeners', () => {
      const listener = jest.fn();
      const unsubscribe = config.onChange(listener);

      config.updateConfig({ enabled: true });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      config.updateConfig({ enabled: false });
      expect(listener).toHaveBeenCalledTimes(1); // Should not be called again
    });
  });

  describe('enabled strategies', () => {
    it('should return empty array when all strategies disabled', () => {
      config.updateConfig({
        recognitionStrategies: {
          metadata: { ...DEFAULT_FILE_SOURCE_CONFIG.recognitionStrategies.metadata, enabled: false },
          tags: { ...DEFAULT_FILE_SOURCE_CONFIG.recognitionStrategies.tags, enabled: false },
          templates: { ...DEFAULT_FILE_SOURCE_CONFIG.recognitionStrategies.templates, enabled: false },
          paths: { ...DEFAULT_FILE_SOURCE_CONFIG.recognitionStrategies.paths, enabled: false }
        }
      });
      
      const strategies = config.getEnabledStrategies();
      expect(strategies).toEqual([]);
    });

    it('should return enabled strategies', () => {
      config.updateConfig({
        recognitionStrategies: {
          metadata: { ...DEFAULT_FILE_SOURCE_CONFIG.recognitionStrategies.metadata, enabled: true },
          tags: { ...DEFAULT_FILE_SOURCE_CONFIG.recognitionStrategies.tags, enabled: true },
          templates: { ...DEFAULT_FILE_SOURCE_CONFIG.recognitionStrategies.templates, enabled: false },
          paths: { ...DEFAULT_FILE_SOURCE_CONFIG.recognitionStrategies.paths, enabled: false }
        }
      });

      const strategies = config.getEnabledStrategies();
      expect(strategies).toContain('metadata');
      expect(strategies).toContain('tags');
      expect(strategies).not.toContain('templates');
      expect(strategies).not.toContain('paths');
    });
  });

  describe('configuration validation', () => {
    it('should validate valid configuration', () => {
      const validConfig: Partial<FileSourceConfiguration> = {
        enabled: true,
        recognitionStrategies: {
          metadata: {
            enabled: true,
            taskFields: ['dueDate', 'priority'],
            requireAllFields: false
          },
          tags: {
            enabled: false,
            taskTags: ['#test'],
            matchMode: 'exact'
          },
          templates: {
            enabled: false,
            templatePaths: ['template.md'],
            checkTemplateMetadata: true
          },
          paths: {
            enabled: false,
            taskPaths: ['test/'],
            matchMode: 'prefix'
          }
        }
      };

      const errors = config.validateConfig(validConfig);
      expect(errors).toEqual([]);
    });

    it('should detect when no strategies are enabled', () => {
      const invalidConfig: Partial<FileSourceConfiguration> = {
        enabled: true,
        recognitionStrategies: {
          metadata: { enabled: false, taskFields: [], requireAllFields: false },
          tags: { enabled: false, taskTags: [], matchMode: 'exact' },
          templates: { enabled: false, templatePaths: [], checkTemplateMetadata: true },
          paths: { enabled: false, taskPaths: [], matchMode: 'prefix' }
        }
      };

      const errors = config.validateConfig(invalidConfig);
      expect(errors).toContain('At least one recognition strategy must be enabled');
    });

    it('should validate empty task fields', () => {
      const invalidConfig: Partial<FileSourceConfiguration> = {
        recognitionStrategies: {
          metadata: {
            enabled: true,
            taskFields: [],
            requireAllFields: false
          },
          tags: {
            enabled: false,
            taskTags: [],
            matchMode: 'exact'
          },
          templates: {
            enabled: false,
            templatePaths: [],
            checkTemplateMetadata: true
          },
          paths: {
            enabled: false,
            taskPaths: [],
            matchMode: 'prefix'
          }
        }
      };

      const errors = config.validateConfig(invalidConfig);
      expect(errors).toContain('Metadata strategy requires at least one task field');
    });

    it('should validate custom content source', () => {
      const invalidConfig: Partial<FileSourceConfiguration> = {
        fileTaskProperties: {
          contentSource: 'custom',
          stripExtension: true,
          defaultStatus: ' ',
          preferFrontmatterTitle: true
          // Missing customContentField
        }
      };

      const errors = config.validateConfig(invalidConfig);
      expect(errors).toContain('Custom content source requires customContentField to be specified');
    });

    it('should validate cache TTL', () => {
      const invalidConfig: Partial<FileSourceConfiguration> = {
        performance: {
          enableWorkerProcessing: true,
          enableCaching: true,
          cacheTTL: -1000
        }
      };

      const errors = config.validateConfig(invalidConfig);
      expect(errors).toContain('Cache TTL must be a positive number');
    });
  });

  describe('configuration presets', () => {
    it('should create basic preset', () => {
      const preset = FileSourceConfig.createPreset('basic');
      
      expect(preset.enabled).toBe(true);
      expect(preset.recognitionStrategies?.metadata.enabled).toBe(true);
      expect(preset.recognitionStrategies?.tags.enabled).toBe(false);
      expect(preset.recognitionStrategies?.templates.enabled).toBe(false);
      expect(preset.recognitionStrategies?.paths.enabled).toBe(false);
    });

    it('should create metadata-only preset', () => {
      const preset = FileSourceConfig.createPreset('metadata-only');
      
      expect(preset.enabled).toBe(true);
      expect(preset.recognitionStrategies?.metadata.enabled).toBe(true);
      expect(preset.recognitionStrategies?.tags.enabled).toBe(false);
    });

    it('should create tag-only preset', () => {
      const preset = FileSourceConfig.createPreset('tag-only');
      
      expect(preset.enabled).toBe(true);
      expect(preset.recognitionStrategies?.metadata.enabled).toBe(false);
      expect(preset.recognitionStrategies?.tags.enabled).toBe(true);
    });

    it('should create full preset', () => {
      const preset = FileSourceConfig.createPreset('full');
      
      expect(preset.enabled).toBe(true);
      expect(preset.recognitionStrategies?.metadata.enabled).toBe(true);
      expect(preset.recognitionStrategies?.tags.enabled).toBe(true);
      expect(preset.recognitionStrategies?.templates.enabled).toBe(false);
      expect(preset.recognitionStrategies?.paths.enabled).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('should return false by default', () => {
      expect(config.isEnabled()).toBe(false);
    });

    it('should return true when enabled', () => {
      config.updateConfig({ enabled: true });
      expect(config.isEnabled()).toBe(true);
    });
  });
});