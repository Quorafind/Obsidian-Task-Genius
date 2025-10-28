/**
 * Tests for frontmatter title protection in FileTaskManager
 */

import { App } from "obsidian";
import { FileTaskManagerImpl } from "@/managers/file-task-manager";
import { FileTask } from "../../types/file-task";
import { FileSourceConfiguration } from "../../types/file-source";

// Mock Obsidian App
const mockApp = {
  vault: {
    getFileByPath: jest.fn(),
  },
  fileManager: {
    renameFile: jest.fn(),
  },
} as unknown as App;

// Mock BasesEntry
const createMockBasesEntry = (filePath: string, properties: Record<string, any> = {}) => ({
  ctx: {
    _local: {},
    app: mockApp,
    filter: {},
    formulas: {},
    localUsed: false,
  },
  file: {
    parent: null,
    deleted: false,
    vault: null,
    path: filePath,
    name: filePath.split('/').pop() || filePath,
    extension: 'md',
    getShortName: () => filePath.split('/').pop() || filePath,
  },
  formulas: {},
  implicit: {
    file: null,
    name: filePath.split('/').pop() || filePath,
    path: filePath,
    folder: filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '',
    ext: 'md',
  },
  lazyEvalCache: {},
  properties,
  updateProperty: jest.fn(),
  getValue: jest.fn((prop: any) => {
    if (prop.type === 'property') {
      return properties[prop.name];
    }
    return undefined;
  }),
  getFormulaValue: jest.fn(),
  getPropertyKeys: jest.fn(() => Object.keys(properties)),
});

describe('FileTaskManager - Frontmatter Title Protection', () => {
  let fileTaskManager: FileTaskManagerImpl;
  let mockConfig: FileSourceConfiguration;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig = {
      enabled: true,
      recognitionStrategies: {
        metadata: { enabled: true, taskFields: ['status'], requireAllFields: false },
        tags: { enabled: false, taskTags: [], matchMode: 'exact' },
        templates: { enabled: false, templatePaths: [], checkTemplateMetadata: false },
        paths: { enabled: false, taskPaths: [], matchMode: 'prefix' }
      },
      metadataMappings: [],
      fileTaskProperties: {
        contentSource: 'title',
        stripExtension: true,
        defaultStatus: ' ',
        preferFrontmatterTitle: true
      },
      relationships: {
        enableChildRelationships: false,
        enableMetadataInheritance: false,
        inheritanceFields: []
      },
      performance: {
        enableWorkerProcessing: false,
        enableCaching: false,
        cacheTTL: 0
      },
      statusMapping: {
        enabled: true,
        metadataToSymbol: {},
        symbolToMetadata: {},
        autoDetect: false,
        caseSensitive: false
      }
    };

    fileTaskManager = new FileTaskManagerImpl(mockApp, mockConfig);
  });

  describe('handleContentUpdate', () => {
    it('should update frontmatter title when preferFrontmatterTitle is enabled and contentSource is title', async () => {
      const mockEntry = createMockBasesEntry('test-file.md', { title: 'Original Title' });
      const fileTask: FileTask = {
        id: 'test-id',
        content: 'Original Title',
        filePath: 'test-file.md',
        completed: false,
        status: ' ',
        metadata: {
          tags: [],
          children: []
        },
        sourceEntry: mockEntry,
        isFileTask: true
      };

      await fileTaskManager.updateFileTask(fileTask, { content: 'New Title' });

      // Should update frontmatter title, not rename file
      expect(mockEntry.updateProperty).toHaveBeenCalledWith('title', 'New Title');
      expect(mockApp.fileManager.renameFile).not.toHaveBeenCalled();
    });

    it('should rename file when preferFrontmatterTitle is disabled', async () => {
      // Disable frontmatter title preference
      mockConfig.fileTaskProperties.preferFrontmatterTitle = false;
      fileTaskManager = new FileTaskManagerImpl(mockApp, mockConfig);

      const mockFile = { path: 'test-file.md' };
      jest.mocked(mockApp.vault.getFileByPath).mockReturnValue(mockFile);

      const mockEntry = createMockBasesEntry('test-file.md', { title: 'Original Title' });
      const fileTask: FileTask = {
        id: 'test-id',
        content: 'Original Title',
        filePath: 'test-file.md',
        completed: false,
        status: ' ',
        metadata: {
          tags: [],
          children: []
        },
        sourceEntry: mockEntry,
        isFileTask: true
      };

      await fileTaskManager.updateFileTask(fileTask, { content: 'New Title' });

      // Should rename file, not update frontmatter
      expect(mockApp.fileManager.renameFile).toHaveBeenCalledWith(mockFile, 'New Title.md');
      expect(mockEntry.updateProperty).not.toHaveBeenCalledWith('title', 'New Title');
    });

    it('should rename file when contentSource is not title', async () => {
      // Change content source to filename
      mockConfig.fileTaskProperties.contentSource = 'filename';
      fileTaskManager = new FileTaskManagerImpl(mockApp, mockConfig);

      const mockFile = { path: 'test-file.md' };
      jest.mocked(mockApp.vault.getFileByPath).mockReturnValue(mockFile);

      const mockEntry = createMockBasesEntry('test-file.md');
      const fileTask: FileTask = {
        id: 'test-id',
        content: 'test-file',
        filePath: 'test-file.md',
        completed: false,
        status: ' ',
        metadata: {
          tags: [],
          children: []
        },
        sourceEntry: mockEntry,
        isFileTask: true
      };

      await fileTaskManager.updateFileTask(fileTask, { content: 'new-filename' });

      // Should rename file even with preferFrontmatterTitle enabled
      expect(mockApp.fileManager.renameFile).toHaveBeenCalledWith(mockFile, 'new-filename.md');
      expect(mockEntry.updateProperty).not.toHaveBeenCalledWith('title', 'new-filename');
    });

    it('should fallback to file renaming when frontmatter update fails', async () => {
      const mockFile = { path: 'test-file.md' };
      jest.mocked(mockApp.vault.getFileByPath).mockReturnValue(mockFile);

      const mockEntry = createMockBasesEntry('test-file.md', { title: 'Original Title' });
      // Make updateProperty throw an error
      mockEntry.updateProperty.mockImplementation(() => {
        throw new Error('Failed to update property');
      });

      const fileTask: FileTask = {
        id: 'test-id',
        content: 'Original Title',
        filePath: 'test-file.md',
        completed: false,
        status: ' ',
        metadata: {
          tags: [],
          children: []
        },
        sourceEntry: mockEntry,
        isFileTask: true
      };

      await fileTaskManager.updateFileTask(fileTask, { content: 'New Title' });

      // Should try frontmatter first, then fallback to file renaming
      expect(mockEntry.updateProperty).toHaveBeenCalledWith('title', 'New Title');
      expect(mockApp.fileManager.renameFile).toHaveBeenCalledWith(mockFile, 'New Title.md');
    });

    it('should update content property when contentSource is not filename', async () => {
      // Set contentSource to 'title' (not filename)
      mockConfig.fileTaskProperties.contentSource = 'title';
      fileTaskManager = new FileTaskManagerImpl(mockApp, mockConfig);

      const mockEntry = createMockBasesEntry('test-file.md', { title: 'Original Title' });
      const fileTask: FileTask = {
        id: 'test-id',
        content: 'Original Title',
        filePath: 'test-file.md',
        completed: false,
        status: ' ',
        metadata: {
          tags: [],
          children: []
        },
        sourceEntry: mockEntry,
        isFileTask: true
      };

      await fileTaskManager.updateFileTask(fileTask, { content: 'New Title', status: 'x' });

      // Should update both content and status properties
      expect(mockEntry.updateProperty).toHaveBeenCalledWith('title', 'New Title');
      expect(mockEntry.updateProperty).toHaveBeenCalledWith('status', 'x');
      expect(mockEntry.updateProperty).toHaveBeenCalledWith('completed', false);
    });

    it('should handle custom content field updates', async () => {
      // Set contentSource to 'custom' with a custom field
      mockConfig.fileTaskProperties.contentSource = 'custom';
      mockConfig.fileTaskProperties.customContentField = 'taskName';
      fileTaskManager = new FileTaskManagerImpl(mockApp, mockConfig);

      const mockEntry = createMockBasesEntry('test-file.md', { taskName: 'Original Task' });
      const fileTask: FileTask = {
        id: 'test-id',
        content: 'Original Task',
        filePath: 'test-file.md',
        completed: false,
        status: ' ',
        metadata: {
          tags: [],
          children: []
        },
        sourceEntry: mockEntry,
        isFileTask: true
      };

      await fileTaskManager.updateFileTask(fileTask, { content: 'New Task Name' });

      // Should update the custom field
      expect(mockEntry.updateProperty).toHaveBeenCalledWith('taskName', 'New Task Name');
    });
  });
});
