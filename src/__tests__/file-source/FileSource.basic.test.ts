/**
 * Basic tests for FileSource
 */

import { FileSource } from "../../dataflow/sources/FileSource";
import type { FileSourceConfiguration } from "../../types/file-source";

// Mock Obsidian API
const mockApp = {
  vault: {
    getAbstractFileByPath: jest.fn(),
    cachedRead: jest.fn(),
    offref: jest.fn(),
    getMarkdownFiles: jest.fn(() => [])
  },
  metadataCache: {
    getFileCache: jest.fn()
  },
  workspace: {
    trigger: jest.fn(),
    on: jest.fn(() => ({ unload: jest.fn() }))
  }
} as any;

// Mock file object
const mockFile = {
  path: 'test.md',
  stat: {
    ctime: 1000000,
    mtime: 2000000
  }
};

describe('FileSource', () => {
  let fileSource: FileSource;
  let config: Partial<FileSourceConfiguration>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    config = {
      enabled: false,
      recognitionStrategies: {
        metadata: {
          enabled: true,
          taskFields: ['dueDate', 'status'],
          requireAllFields: false
        },
        tags: {
          enabled: true,
          taskTags: ['#task', '#todo'],
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
      },
      fileTaskProperties: {
        contentSource: 'filename',
        stripExtension: true,
        defaultStatus: ' ',
        preferFrontmatterTitle: true
      },
      performance: {
        enableWorkerProcessing: false,
        enableCaching: true,
        cacheTTL: 300000
      },
    };

    fileSource = new FileSource(mockApp, config);
  });

  afterEach(() => {
    if (fileSource) {
      fileSource.destroy();
    }
  });

  describe('initialization', () => {
    it('should initialize with provided configuration', () => {
      expect(fileSource).toBeInstanceOf(FileSource);
    });

    it('should not initialize when disabled', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      fileSource.initialize();
      
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('[FileSource] Initializing'));
      
      consoleSpy.mockRestore();
    });

    it('should initialize when enabled', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Enable FileSource
      fileSource.updateConfiguration({ enabled: true });
      fileSource.initialize();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[FileSource] Initializing'));
      
      consoleSpy.mockRestore();
    });

    it('should not initialize twice', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      fileSource.updateConfiguration({ enabled: true });
      fileSource.initialize();
      fileSource.initialize(); // Second call
      
      // Should only log once
      const initLogs = consoleSpy.mock.calls.filter((call: any[]) => 
        call[0]?.includes('[FileSource] Initializing')
      );
      expect(initLogs).toHaveLength(1);
      
      consoleSpy.mockRestore();
    });
  });

  describe('file relevance checking', () => {
    beforeEach(() => {
      fileSource.updateConfiguration({ enabled: true });
      fileSource.initialize();
    });

    it('should identify markdown files as relevant', async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockApp.vault.cachedRead.mockResolvedValue('# Test content');
      mockApp.metadataCache.getFileCache.mockReturnValue({});

      const result = await fileSource.shouldCreateFileTask('test.md');
      
      // Should not throw error and should process the file
      expect(mockApp.vault.getAbstractFileByPath).toHaveBeenCalledWith('test.md');
    });

    it('should reject non-markdown files', async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue({ 
        ...mockFile, 
        path: 'test.txt' 
      });

      const result = await fileSource.shouldCreateFileTask('test.txt');
      
      expect(result).toBe(false);
      expect(mockApp.vault.getAbstractFileByPath).not.toHaveBeenCalled();
    });

    it('should reject excluded patterns', async () => {
      const result = await fileSource.shouldCreateFileTask('.obsidian/workspace.json');
      
      expect(result).toBe(false);
      expect(mockApp.vault.getAbstractFileByPath).not.toHaveBeenCalled();
    });

    it('should reject hidden files', async () => {
      const result = await fileSource.shouldCreateFileTask('.hidden-file.md');
      
      expect(result).toBe(false);
      expect(mockApp.vault.getAbstractFileByPath).not.toHaveBeenCalled();
    });
  });

  describe('metadata-based recognition', () => {
    beforeEach(() => {
      fileSource.updateConfiguration({ enabled: true });
      fileSource.initialize();
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockApp.vault.cachedRead.mockResolvedValue('# Test content');
    });

    it('should recognize file with task metadata', async () => {
      const fileCache = {
        frontmatter: {
          dueDate: '2024-01-01',
          status: 'pending'
        }
      };
      mockApp.metadataCache.getFileCache.mockReturnValue(fileCache);

      const result = await fileSource.shouldCreateFileTask('test.md');
      
      expect(result).toBe(true);
    });

    it('should recognize file with any task field when requireAllFields is false', async () => {
      const fileCache = {
        frontmatter: {
          dueDate: '2024-01-01'
          // missing 'status' but requireAllFields is false
        }
      };
      mockApp.metadataCache.getFileCache.mockReturnValue(fileCache);

      const result = await fileSource.shouldCreateFileTask('test.md');
      
      expect(result).toBe(true);
    });

    it('should not recognize file without task metadata', async () => {
      const fileCache = {
        frontmatter: {
          title: 'Test File',
          description: 'Just a regular file'
        }
      };
      mockApp.metadataCache.getFileCache.mockReturnValue(fileCache);

      const result = await fileSource.shouldCreateFileTask('test.md');
      
      expect(result).toBe(false);
    });

    it('should not recognize file without frontmatter', async () => {
      const fileCache = {};
      mockApp.metadataCache.getFileCache.mockReturnValue(fileCache);

      const result = await fileSource.shouldCreateFileTask('test.md');
      
      expect(result).toBe(false);
    });
  });

  describe('tag-based recognition', () => {
    beforeEach(() => {
      fileSource.updateConfiguration({ 
        enabled: true,
        recognitionStrategies: {
          metadata: { 
            enabled: false,
            taskFields: config.recognitionStrategies!.metadata.taskFields,
            requireAllFields: config.recognitionStrategies!.metadata.requireAllFields
          },
          tags: { 
            enabled: true,
            taskTags: config.recognitionStrategies!.tags.taskTags,
            matchMode: config.recognitionStrategies!.tags.matchMode
          },
          templates: config.recognitionStrategies!.templates,
          paths: config.recognitionStrategies!.paths
        }
      });
      fileSource.initialize();
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockApp.vault.cachedRead.mockResolvedValue('# Test content');
    });

    it('should recognize file with task tags', async () => {
      const fileCache = {
        tags: [
          { tag: '#task' },
          { tag: '#important' }
        ]
      };
      mockApp.metadataCache.getFileCache.mockReturnValue(fileCache);

      const result = await fileSource.shouldCreateFileTask('test.md');
      
      expect(result).toBe(true);
    });

    it('should not recognize file without task tags', async () => {
      const fileCache = {
        tags: [
          { tag: '#note' },
          { tag: '#reference' }
        ]
      };
      mockApp.metadataCache.getFileCache.mockReturnValue(fileCache);

      const result = await fileSource.shouldCreateFileTask('test.md');
      
      expect(result).toBe(false);
    });

    it('should not recognize file without tags', async () => {
      const fileCache = {};
      mockApp.metadataCache.getFileCache.mockReturnValue(fileCache);

      const result = await fileSource.shouldCreateFileTask('test.md');
      
      expect(result).toBe(false);
    });
  });

  describe('task creation', () => {
    beforeEach(() => {
      fileSource.updateConfiguration({ enabled: true });
      fileSource.initialize();
      mockApp.vault.getAbstractFileByPath.mockReturnValue(mockFile);
      mockApp.vault.cachedRead.mockResolvedValue('# Test content');
    });

    it('should create file task with correct structure', async () => {
      const fileCache = {
        frontmatter: {
          dueDate: '2024-01-01',
          status: 'x',
          priority: 2,
          project: 'Test Project'
        }
      };
      mockApp.metadataCache.getFileCache.mockReturnValue(fileCache);

      const task = await fileSource.createFileTask('test.md');
      
      expect(task).toBeTruthy();
      expect(task!.id).toBe('file-source:test.md');
      expect(task!.content).toBe('test'); // filename without extension
      expect(task!.filePath).toBe('test.md');
      expect(task!.line).toBe(0);
      expect(task!.completed).toBe(true); // status is 'x'
      expect(task!.status).toBe('x');
      expect(task!.metadata.source).toBe('file-source');
      expect(task!.metadata.recognitionStrategy).toBe('metadata');
      expect(task!.metadata.fileTimestamps.created).toBe(1000000);
      expect(task!.metadata.fileTimestamps.modified).toBe(2000000);
      expect(task!.metadata.priority).toBe(2);
      expect(task!.metadata.project).toBe('Test Project');
    });

    it('should use default status when not specified', async () => {
      const fileCache = {
        frontmatter: {
          dueDate: '2024-01-01'
        }
      };
      mockApp.metadataCache.getFileCache.mockReturnValue(fileCache);

      const task = await fileSource.createFileTask('test.md');
      
      expect(task!.status).toBe(' '); // default status
      expect(task!.completed).toBe(false);
    });

    it('should handle missing file gracefully', async () => {
      mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

      const task = await fileSource.createFileTask('nonexistent.md');
      
      expect(task).toBeNull();
    });

    it('should handle file read errors gracefully', async () => {
      mockApp.vault.cachedRead.mockRejectedValue(new Error('File read error'));

      const task = await fileSource.createFileTask('test.md');
      
      expect(task).toBeNull();
    });

    it('should remove project tag when used to derive project metadata', async () => {
      const fileCache = {
        frontmatter: {
          tags: ['context/foo']
        },
        tags: [
          { tag: '#project/Alpha' },
          { tag: '#task' }
        ]
      };
      mockApp.metadataCache.getFileCache.mockReturnValue(fileCache);

      const task = await fileSource.createFileTask('test.md');

      expect(task).toBeTruthy();
      expect(task!.metadata.project).toBe('Alpha');
      expect(task!.metadata.tags).toEqual(expect.arrayContaining(['#task', '#context/foo']));
      expect(task!.metadata.tags).not.toContain('#project/Alpha');
    });
  });

  describe('statistics', () => {
    it('should provide initial statistics', () => {
      const stats = fileSource.getStats();
      
      expect(stats.initialized).toBe(false);
      expect(stats.trackedFileCount).toBe(0);
      expect(stats.recognitionBreakdown.metadata).toBe(0);
      expect(stats.recognitionBreakdown.tag).toBe(0);
      expect(stats.lastUpdate).toBe(0);
      expect(stats.lastUpdateSeq).toBe(0);
    });
  });

  describe('configuration updates', () => {
    it('should update configuration', () => {
      const newConfig = { enabled: true };
      
      fileSource.updateConfiguration(newConfig);
      
      // Configuration should be updated (we can't directly test it without exposing the config)
      // But we can test that it doesn't throw errors
      expect(() => fileSource.updateConfiguration(newConfig)).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should destroy cleanly', () => {
      fileSource.updateConfiguration({ enabled: true });
      fileSource.initialize();
      
      expect(() => fileSource.destroy()).not.toThrow();
      
      const stats = fileSource.getStats();
      expect(stats.initialized).toBe(false);
      expect(stats.trackedFileCount).toBe(0);
    });

    it('should handle destroy when not initialized', () => {
      expect(() => fileSource.destroy()).not.toThrow();
    });
  });

  describe('refresh', () => {
    it('should handle refresh when disabled', async () => {
      await expect(fileSource.refresh()).resolves.not.toThrow();
    });

    it('should handle refresh when enabled', async () => {
      fileSource.updateConfiguration({ enabled: true });
      fileSource.initialize();
      
      await expect(fileSource.refresh()).resolves.not.toThrow();
    });
  });
});