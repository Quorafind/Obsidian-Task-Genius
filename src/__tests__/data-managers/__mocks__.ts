/**
 * Mock utilities for data manager tests
 */

// Mock localforage
export const mockLocalforage = {
	createInstance: jest.fn(() => ({
		setItem: jest.fn().mockResolvedValue(undefined),
		getItem: jest.fn().mockResolvedValue(null),
		removeItem: jest.fn().mockResolvedValue(undefined),
		keys: jest.fn().mockResolvedValue([]),
		clear: jest.fn().mockResolvedValue(undefined),
	})),
	dropInstance: jest.fn().mockResolvedValue(undefined),
	INDEXEDDB: 'INDEXEDDB',
	LOCALSTORAGE: 'LOCALSTORAGE',
	setItem: jest.fn().mockResolvedValue(undefined),
	getItem: jest.fn().mockResolvedValue(null),
	removeItem: jest.fn().mockResolvedValue(undefined),
	keys: jest.fn().mockResolvedValue([]),
	clear: jest.fn().mockResolvedValue(undefined),
};

// Mock app global
(global as any).app = {
	appId: "test-app",
	workspace: {
		on: jest.fn((event, handler) => ({ unload: jest.fn() })),
		off: jest.fn(),
		trigger: jest.fn(),
	},
};

// Mock Obsidian API
export const mockApp = {
	appId: "test-app",
	workspace: {
		on: jest.fn((event, handler) => ({ unload: jest.fn() })),
		off: jest.fn(),
		trigger: jest.fn(),
	}
} as any;

export const mockVault = {
	getMarkdownFiles: jest.fn(() => []),
	getFiles: jest.fn(() => []),
	getAbstractFileByPath: jest.fn(),
	cachedRead: jest.fn().mockResolvedValue("# Test content\n- [ ] Test task"),
	on: jest.fn((event, handler) => ({ unload: jest.fn() })),
	off: jest.fn(),
} as any;

export const mockMetadataCache = {
	getFileCache: jest.fn().mockReturnValue({
		frontmatter: { title: "Test File" },
		tags: [],
		links: [],
		headings: [],
	}),
	on: jest.fn((event, handler) => ({ unload: jest.fn() })),
	off: jest.fn(),
} as any;

export const mockPlugin = {
	manifest: { version: "1.0.0" },
	settings: {
		preferMetadataFormat: "tasks",
		useDailyNotePathAsDate: false,
		dailyNoteFormat: "yyyy-MM-dd",
		useAsDateType: "due",
		dailyNotePath: "",
		ignoreHeading: "",
		focusHeading: "",
	},
} as any;

export const mockPersister = {
	loadConsolidatedCache: jest.fn().mockResolvedValue(null),
	storeConsolidatedCache: jest.fn().mockResolvedValue(undefined),
	isVersionCompatible: jest.fn(() => true),
	clearIncompatibleCache: jest.fn().mockResolvedValue(0),
	loadFile: jest.fn().mockResolvedValue(null),
	storeFile: jest.fn().mockResolvedValue(undefined),
	removeFile: jest.fn().mockResolvedValue(undefined),
	synchronize: jest.fn().mockResolvedValue(new Set()),
	allKeys: jest.fn().mockResolvedValue([]),
	allFiles: jest.fn().mockResolvedValue([]),
	hasFile: jest.fn().mockResolvedValue(false),
	getStats: jest.fn().mockResolvedValue({ totalFiles: 0, cacheSize: 0 }),
	clear: jest.fn().mockResolvedValue(undefined),
} as any;

// Setup module mocks
jest.mock('localforage', () => mockLocalforage);

// Mock the persister module
jest.mock('../../utils/persister', () => ({
	LocalStorageCache: jest.fn().mockImplementation(() => ({
		persister: {
			setItem: jest.fn().mockResolvedValue(undefined),
			getItem: jest.fn().mockResolvedValue(null),
			removeItem: jest.fn().mockResolvedValue(undefined),
			keys: jest.fn().mockResolvedValue([]),
			clear: jest.fn().mockResolvedValue(undefined),
		},
		loadConsolidatedCache: jest.fn().mockResolvedValue(null),
		storeConsolidatedCache: jest.fn().mockResolvedValue(undefined),
		isVersionCompatible: jest.fn(() => true),
		clearIncompatibleCache: jest.fn().mockResolvedValue(0),
		loadFile: jest.fn().mockResolvedValue(null),
		storeFile: jest.fn().mockResolvedValue(undefined),
		removeFile: jest.fn().mockResolvedValue(undefined),
		synchronize: jest.fn().mockResolvedValue(new Set()),
		allKeys: jest.fn().mockResolvedValue([]),
		allFiles: jest.fn().mockResolvedValue([]),
		hasFile: jest.fn().mockResolvedValue(false),
		getStats: jest.fn().mockResolvedValue({ totalFiles: 0, cacheSize: 0 }),
		clear: jest.fn().mockResolvedValue(undefined),
	})),
}));

// Mock getConfig function
jest.mock('../../common/task-parser-config', () => ({
	getConfig: jest.fn(() => ({
		parseMetadata: true,
		parseTags: true,
		parseComments: true,
		parseHeadings: true,
		maxIndentSize: 8,
		maxParseIterations: 100000,
		maxMetadataIterations: 10000,
		maxTagLength: 100,
		maxEmojiValueLength: 200,
		maxStackOperations: 4000,
		maxStackSize: 1000,
		statusMapping: {},
		emojiMapping: {},
		metadataParseMode: 'both',
		specialTagPrefixes: {},
	})),
}));

// Mock file type utils
jest.mock('../../utils/fileTypeUtils', () => ({
	isSupportedFileWithFilter: jest.fn(() => true),
	getFileType: jest.fn(() => 'md'),
	SupportedFileType: {
		MD: 'md',
		CANVAS: 'canvas',
		UNKNOWN: 'unknown',
	},
}));

// Mock parsers
jest.mock('../../utils/workers/ConfigurableTaskParser', () => ({
	MarkdownTaskParser: jest.fn().mockImplementation(() => ({
		parseLegacy: jest.fn().mockResolvedValue([]),
		parse: jest.fn().mockResolvedValue([]),
	})),
}));

jest.mock('../../utils/parsing/CanvasParser', () => ({
	CanvasParser: jest.fn().mockImplementation(() => ({
		parseCanvasFile: jest.fn().mockResolvedValue([]),
	})),
}));

jest.mock('../../utils/workers/FileMetadataTaskParser', () => ({
	FileMetadataTaskParser: jest.fn().mockImplementation(() => ({
		parseFileForTasks: jest.fn().mockReturnValue({
			tasks: [],
			errors: [],
		}),
	})),
}));

// Mock other dependencies
jest.mock('../../utils/import/TaskIndexer', () => ({
	TaskIndexer: jest.fn().mockImplementation(() => ({
		setParseFileCallback: jest.fn(),
		setFileFilterManager: jest.fn(),
		indexAllFiles: jest.fn().mockResolvedValue(undefined),
		queryTasks: jest.fn().mockResolvedValue([]),
		getCache: jest.fn(() => ({
			tasks: new Map(),
			files: new Map(),
			tags: new Map(),
			projects: new Map(),
			contexts: new Map(),
			dueDate: new Map(),
			startDate: new Map(),
			scheduledDate: new Map(),
			completed: new Map(),
			priority: new Map(),
			cancelledDate: new Map(),
			onCompletion: new Map(),
			dependsOn: new Map(),
			taskId: new Map(),
			fileMtimes: new Map(),
			fileProcessedTimes: new Map(),
		})),
		load: jest.fn().mockResolvedValue(undefined),
		unload: jest.fn(),
	})),
}));

jest.mock('../../utils/workers/TaskWorkerManager', () => ({
	TaskWorkerManager: jest.fn().mockImplementation(() => ({
		setTaskIndexer: jest.fn(),
		load: jest.fn().mockResolvedValue(undefined),
		unload: jest.fn(),
	})),
}));

jest.mock('../../utils/ProjectConfigManager', () => ({
	ProjectConfigManager: jest.fn().mockImplementation(() => ({
		determineTgProject: jest.fn().mockResolvedValue(undefined),
		getEnhancedMetadata: jest.fn().mockResolvedValue({}),
		getProjectConfig: jest.fn().mockResolvedValue(undefined),
		clearCache: jest.fn(),
		load: jest.fn().mockResolvedValue(undefined),
		unload: jest.fn(),
	})),
}));

jest.mock('../../utils/FileFilterManager', () => ({
	FileFilterManager: jest.fn().mockImplementation(() => ({
		shouldProcessFile: jest.fn(() => true),
	})),
}));

// Mock data managers to prevent circular dependencies and initialization issues
jest.mock('../../utils/data-managers/TaskDataManager', () => ({
	TaskDataManager: jest.fn().mockImplementation(() => {
		// 简单的内存存储来模拟任务管理
		const tasks = new Map();
		
		return {
			load: jest.fn().mockResolvedValue(undefined),
			unload: jest.fn(),
			getInitialized: jest.fn(() => true),
			getTasks: jest.fn().mockResolvedValue([]),
			getTaskById: jest.fn().mockImplementation((id) => {
				return Promise.resolve(tasks.get(id));
			}),
			createTask: jest.fn().mockImplementation((partialTask) => {
				const newTask = {
					id: `mock-task-${Date.now()}`,
					content: partialTask.content || '',
					filePath: partialTask.filePath || '',
					line: partialTask.line || 0,
					completed: partialTask.completed || false,
					status: partialTask.status || ' ',
					originalMarkdown: `- [${partialTask.status || ' '}] ${partialTask.content || ''}`,
					metadata: partialTask.metadata || { tags: [], children: [], heading: [] },
				};
				tasks.set(newTask.id, newTask);
				return Promise.resolve(newTask);
			}),
			updateTask: jest.fn().mockImplementation((task) => {
				tasks.set(task.id, task);
				return Promise.resolve(undefined);
			}),
			deleteTask: jest.fn().mockImplementation((id) => {
				tasks.delete(id);
				return Promise.resolve(undefined);
			}),
			queryTasks: jest.fn().mockResolvedValue([]),
			indexFile: jest.fn().mockResolvedValue(undefined),
			indexAllFiles: jest.fn().mockResolvedValue(undefined),
			forceReindex: jest.fn().mockResolvedValue(undefined),
			getMemoryStats: jest.fn(() => ({
				cacheSize: tasks.size,
				estimatedMemoryUsage: tasks.size * 1000,
				activeListeners: 0,
				lastCleanupTime: Date.now(),
			})),
			forceCleanup: jest.fn(),
		};
	}),
}));

jest.mock('../../utils/data-managers/ProjectDataManager', () => ({
	ProjectDataManager: jest.fn().mockImplementation(() => ({
		load: jest.fn().mockResolvedValue(undefined),
		unload: jest.fn(),
		getInitialized: jest.fn(() => true),
		getMemoryStats: jest.fn(() => ({
			cacheSize: 0,
			estimatedMemoryUsage: 0,
			activeListeners: 0,
			lastCleanupTime: Date.now(),
		})),
		forceCleanup: jest.fn(),
	})),
}));

jest.mock('../../utils/data-managers/FileDataManager', () => ({
	FileDataManager: jest.fn().mockImplementation(() => ({
		load: jest.fn().mockResolvedValue(undefined),
		unload: jest.fn(),
		getInitialized: jest.fn(() => true),
		getMemoryStats: jest.fn(() => ({
			cacheSize: 0,
			estimatedMemoryUsage: 0,
			activeListeners: 0,
			lastCleanupTime: Date.now(),
		})),
		forceCleanup: jest.fn(),
	})),
}));