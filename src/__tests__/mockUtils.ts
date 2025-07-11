import { App } from "obsidian";
import {
	Text,
	Transaction,
	TransactionSpec,
	EditorState,
	ChangeSet,
	Annotation,
	EditorSelection,
	AnnotationType,
} from "@codemirror/state";
import TaskProgressBarPlugin from "../index"; // Adjust the import path as necessary
import {
	taskStatusChangeAnnotation, // Import the actual annotation
} from "../editor-ext/autoCompleteParent"; // Adjust the import path as necessary
import { TaskProgressBarSettings } from "../common/setting-definition";
import { EditorView } from "@codemirror/view";
import { Task } from "../types/task";

const mockAnnotationType = {
	of: jest.fn().mockImplementation((value: string) => ({
		type: mockAnnotationType,
		value,
	})),
};
// Use the actual annotation object from the source file for checks
const mockParentTaskStatusChangeAnnotation = taskStatusChangeAnnotation;

// Mock Text Object - Consolidated version
export const createMockText = (content: string): Text => {
	const lines = content.split("\n");
	const doc = {
		toString: () => content,
		length: content.length,
		lines: lines.length,
		line: jest.fn((lineNum: number) => {
			if (lineNum < 1 || lineNum > lines.length) {
				throw new Error(
					`Line ${lineNum} out of range (1-${lines.length})`
				);
			}
			const text = lines[lineNum - 1];
			let from = 0;
			for (let i = 0; i < lineNum - 1; i++) {
				from += lines[i].length + 1; // +1 for newline
			}
			return {
				text: text,
				from,
				to: from + text.length,
				number: lineNum,
				length: text.length,
			};
		}),
		lineAt: jest.fn((pos: number) => {
			// Ensure pos is within valid range
			pos = Math.max(0, Math.min(pos, content.length));
			let currentPos = 0;
			for (let i = 0; i < lines.length; i++) {
				const lineLength = lines[i].length;
				const lineStart = currentPos;
				const lineEnd = currentPos + lineLength;
				// Check if pos is within the current line or at the very end of the document
				if (pos >= lineStart && pos <= lineEnd) {
					return {
						text: lines[i],
						from: lineStart,
						to: lineEnd,
						number: i + 1,
						length: lineLength,
					};
				}
				currentPos += lineLength + 1; // +1 for newline
			}
			// Handle edge case: position at the very end of the file after the last newline
			if (
				pos === content.length &&
				lines.length > 0 &&
				content.endsWith("\n")
			) {
				const lastLineIndex = lines.length - 1;
				const lastLine = lines[lastLineIndex];
				let from = content.length - lastLine.length - 1; // Position after the last newline
				return {
					text: lastLine,
					from: from,
					to: from + lastLine.length,
					number: lines.length,
					length: lastLine.length,
				};
			} else if (
				pos === content.length &&
				lines.length > 0 &&
				!content.endsWith("\n")
			) {
				// Position exactly at the end of the last line (no trailing newline)
				const lastLineIndex = lines.length - 1;
				const lastLine = lines[lastLineIndex];
				let from = 0;
				for (let i = 0; i < lastLineIndex; i++) {
					from += lines[i].length + 1;
				}
				return {
					text: lastLine,
					from: from,
					to: from + lastLine.length,
					number: lines.length,
					length: lastLine.length,
				};
			}
			// If the content is empty or pos is 0 in an empty doc
			if (content === "" && pos === 0) {
				return {
					text: "",
					from: 0,
					to: 0,
					number: 1,
					length: 0,
				};
			}
		}),
		sliceString: jest.fn((from: number, to: number) =>
			content.slice(from, to)
		),
	};
	// @ts-ignore - Add self-reference for Text methods if necessary
	doc.doc = doc;
	return doc as Text;
};

// Mock ChangeSet - Consolidated version
const createMockChangeSet = (doc: Text, changes: any[] = []): ChangeSet => {
	return {
		length: doc.length,
		// @ts-ignore
		iterChanges: jest.fn(
			(
				callback: (
					fromA: number,
					toA: number,
					fromB: number,
					toB: number,
					inserted: Text
				) => void
			) => {
				changes.forEach((change) => {
					// Basic validation to prevent errors on undefined values
					const fromA = change.fromA ?? 0;
					const toA = change.toA ?? fromA;
					const fromB = change.fromB ?? 0;
					const insertedText = change.insertedText ?? "";
					const toB = change.toB ?? fromB + insertedText.length;
					callback(
						fromA,
						toA,
						fromB,
						toB,
						createMockText(insertedText) // inserted text needs to be a Text object
					);
				});
			}
		),
		// Add other necessary ChangeSet methods if needed, even if mocked simply
		// @ts-ignore
		mapDesc: jest.fn(() => ({
			/* mock */
		})),
		// @ts-ignore
		compose: jest.fn(() => ({
			/* mock */
		})),
		// @ts-ignore
		mapPos: jest.fn(() => 0),
		// @ts-ignore
		toJSON: jest.fn(() => ({
			/* mock */
		})),
		// @ts-ignore
		any: jest.fn(() => false),
		// @ts-ignore
		get desc() {
			return {
				/* mock */
			};
		},
		// @ts-ignore
		get empty() {
			return changes.length === 0;
		},
		// ... and potentially others like 'apply', 'invert', etc. if used
	} as unknown as ChangeSet;
};

// Mock Transaction Object - Consolidated version
const createMockTransaction = (options: {
	startStateDocContent?: string;
	newDocContent?: string;
	changes?: {
		fromA: number;
		toA: number;
		fromB: number;
		toB: number;
		insertedText?: string;
	}[];
	docChanged?: boolean;
	isUserEvent?: string | false; // e.g., 'input.paste' or false
	annotations?: { type: AnnotationType<any>; value: any }[]; // Use Annotation instead of AnnotationType
	selection?: { anchor: number; head: number };
}): Transaction => {
	const startDoc = createMockText(options.startStateDocContent ?? "");
	const newDoc = createMockText(
		options.newDocContent ?? options.startStateDocContent ?? ""
	);
	// Ensure changes array exists and is valid
	const validChanges =
		options.changes?.map((c) => ({
			fromA: c.fromA ?? 0,
			toA: c.toA ?? c.fromA ?? 0,
			fromB: c.fromB ?? 0,
			insertedText: c.insertedText ?? "",
			toB: c.toB ?? (c.fromB ?? 0) + (c.insertedText ?? "").length,
		})) || [];
	const changeSet = createMockChangeSet(newDoc, validChanges);

	// Create a proper EditorSelection object instead of just using an anchor/head object
	const selectionObj = options.selection || { anchor: 0, head: 0 };
	const editorSelection = EditorSelection.single(
		selectionObj.anchor,
		selectionObj.head
	); // Use EditorSelection.single for proper creation

	const mockTr = {
		newDoc: newDoc,
		changes: changeSet,
		docChanged:
			options.docChanged !== undefined
				? options.docChanged
				: !!validChanges.length,
		isUserEvent: jest.fn((type: string) => {
			if (options.isUserEvent === false) return false;
			return options.isUserEvent === type;
		}),
		annotation: jest.fn(<T>(type: AnnotationType<T>): T | undefined => {
			const found = options.annotations?.find((ann) => ann.type === type);
			return found ? found.value : undefined;
		}),
		selection: editorSelection,
		// Add required Transaction properties with basic mocks
		effects: [],
		scrollIntoView: false,
		newSelection: editorSelection,
		state: {
			doc: newDoc,
			selection: editorSelection,
			// Add other required state properties with basic mocks
			facet: jest.fn(() => null),
			field: jest.fn(() => null),
			fieldInvalidated: jest.fn(() => false),
			toJSON: jest.fn(() => ({})),
			replaceSelection: jest.fn(),
			changeByRange: jest.fn(),
			changes: jest.fn(),
			toText: jest.fn(() => newDoc),
			// @ts-ignore
			values: [],
			// @ts-ignore
			apply: jest.fn(() => ({})),
			// @ts-ignore
			update: jest.fn(() => ({})),
			// @ts-ignore
			sliceDoc: jest.fn(() => ""),
		} as unknown as EditorState,
		startState: EditorState.create({ doc: startDoc }),
		reconfigured: false,
	};

	return mockTr as unknown as Transaction;
};

// Mock App Object - Consolidated version
const createMockApp = (): App => {
	// Create a mock app object with all necessary properties
	const mockApp = {
		// Workspace mock
		workspace: {
			getActiveFile: jest.fn(() => ({
				path: "test.md",
				name: "test.md",
			})),
			getActiveViewOfType: jest.fn(),
			getLeaf: jest.fn(),
			createLeafBySplit: jest.fn(),
			on: jest.fn(),
			off: jest.fn(),
			trigger: jest.fn(),
			onLayoutReady: jest.fn(),
		},
		// MetadataCache mock
		metadataCache: {
			getFileCache: jest.fn(() => ({
				headings: [],
			})),
			getCache: jest.fn(),
			on: jest.fn(),
			off: jest.fn(),
			trigger: jest.fn(),
		},
		// Vault mock with all necessary methods for ActionExecutor tests
		vault: {
			getFileByPath: jest.fn(),
			getAbstractFileByPath: jest.fn(),
			read: jest.fn(),
			modify: jest.fn(),
			create: jest.fn(),
			createFolder: jest.fn(),
			delete: jest.fn(),
			rename: jest.fn(),
			exists: jest.fn(),
			getFiles: jest.fn(() => []),
			getFolders: jest.fn(() => []),
			on: jest.fn(),
			off: jest.fn(),
			trigger: jest.fn(),
		},
		// Keymap mock
		keymap: {
			pushScope: jest.fn(),
			popScope: jest.fn(),
			getModifiers: jest.fn(),
		},
		// Scope mock
		scope: {
			register: jest.fn(),
			unregister: jest.fn(),
		},
		// FileManager mock
		fileManager: {
			generateMarkdownLink: jest.fn(),
			getNewFileParent: jest.fn(),
			processFrontMatter: jest.fn(),
		},
		// MetadataTypeManager mock
		metadataTypeManager: {
			getPropertyInfo: jest.fn(),
			getAllPropertyInfos: jest.fn(),
		},
		// Additional App properties that might be needed
		plugins: {
			plugins: {},
			manifests: {},
			enabledPlugins: new Set(),
			getPlugin: jest.fn(),
			enablePlugin: jest.fn(),
			disablePlugin: jest.fn(),
		},
		// Storage methods
		loadLocalStorage: jest.fn(),
		saveLocalStorage: jest.fn(),
		// Event handling
		on: jest.fn(),
		off: jest.fn(),
		trigger: jest.fn(),
		// Other common App methods
		openWithDefaultApp: jest.fn(),
		showInFolder: jest.fn(),
	} as unknown as App;

	return mockApp;
};

// Mock Plugin Object - Consolidated version with merged settings
const createMockPlugin = (
	settings: Partial<TaskProgressBarSettings> = {} // Use TaskProgressBarSettings directly
): TaskProgressBarPlugin => {
	const defaults: Partial<TaskProgressBarSettings> = {
		// Default settings from both original versions combined
		markParentInProgressWhenPartiallyComplete: true,
		taskStatuses: {
			inProgress: "/",
			completed: "x|X",
			abandoned: "-",
			planned: "?",
			notStarted: " ",
		},
		taskStatusCycle: ["TODO", "IN_PROGRESS", "DONE"],
		taskStatusMarks: { TODO: " ", IN_PROGRESS: "/", DONE: "x" },
		excludeMarksFromCycle: [],
		workflow: {
			enableWorkflow: false,
			autoRemoveLastStageMarker: true,
			autoAddTimestamp: false,
			timestampFormat: "YYYY-MM-DD HH:mm:ss",
			removeTimestampOnTransition: false,
			calculateSpentTime: false,
			spentTimeFormat: "HH:mm",
			definitions: [],
			autoAddNextTask: false,
			calculateFullSpentTime: false,
		},
		// Add sorting defaults
		sortTasks: true,
		sortCriteria: [
			{ field: "completed", order: "asc" },
			{ field: "status", order: "asc" },
			{ field: "priority", order: "asc" },
			{ field: "dueDate", order: "asc" },
		],
		// Add metadata format default
		preferMetadataFormat: "tasks",
	};

	// Deep merge provided settings with defaults
	// Basic deep merge - might need a library for complex nested objects if issues arise
	const mergedSettings = {
		...defaults,
		...settings,
		taskStatuses: { ...defaults.taskStatuses, ...settings.taskStatuses },
		taskStatusMarks: {
			...defaults.taskStatusMarks,
			...settings.taskStatusMarks,
		},
		workflow: { ...defaults.workflow, ...settings.workflow },
		sortCriteria: settings.sortCriteria || defaults.sortCriteria,
	};

	// Create mock app instance
	const mockApp = createMockApp();

	// Create mock task manager with Canvas task updater
	const mockTaskManager = {
		getCanvasTaskUpdater: jest.fn(() => createMockCanvasTaskUpdater()),
		// Add other TaskManager methods as needed
		refreshTasks: jest.fn(),
		getTasks: jest.fn(() => []),
		addTask: jest.fn(),
		updateTask: jest.fn(),
		deleteTask: jest.fn(),
	};

	// Return the plugin with all necessary properties
	return {
		settings: mergedSettings as TaskProgressBarSettings,
		app: mockApp,
		taskManager: mockTaskManager,
		rewardManager: {
			// Mock RewardManager
			showReward: jest.fn(),
			addReward: jest.fn(),
		},
		habitManager: {
			// Mock HabitManager
			getHabits: jest.fn(() => []),
			addHabit: jest.fn(),
			updateHabit: jest.fn(),
		},
		icsManager: {
			// Mock IcsManager
			getEvents: jest.fn(() => []),
			refreshEvents: jest.fn(),
		},
		versionManager: {
			// Mock VersionManager
			getCurrentVersion: jest.fn(() => "1.0.0"),
			checkForUpdates: jest.fn(),
		},
		rebuildProgressManager: {
			// Mock RebuildProgressManager
			startRebuild: jest.fn(),
			getProgress: jest.fn(() => 0),
		},
		preloadedTasks: [],
		settingTab: {
			// Mock SettingTab
			display: jest.fn(),
			hide: jest.fn(),
		},
		// Plugin lifecycle methods
		onload: jest.fn(),
		onunload: jest.fn(),
		// Command registration methods
		registerCommands: jest.fn(),
		registerEditorExt: jest.fn(),
		// Settings methods
		loadSettings: jest.fn(),
		saveSettings: jest.fn(),
		// View methods
		loadViews: jest.fn(),
		activateTaskView: jest.fn(),
		activateTimelineSidebarView: jest.fn(),
		triggerViewUpdate: jest.fn(),
		getIcsManager: jest.fn(),
		initializeTaskManagerWithVersionCheck: jest.fn(),
		// Plugin base class properties
		addRibbonIcon: jest.fn(),
		addCommand: jest.fn(),
		addSettingTab: jest.fn(),
		registerView: jest.fn(),
		registerEditorExtension: jest.fn(),
		registerMarkdownPostProcessor: jest.fn(),
		registerEvent: jest.fn(),
		addChild: jest.fn(),
		removeChild: jest.fn(),
		register: jest.fn(),
		registerInterval: jest.fn(),
		registerDomEvent: jest.fn(),
		registerObsidianProtocolHandler: jest.fn(),
		registerEditorSuggest: jest.fn(),
		registerHoverLinkSource: jest.fn(),
		registerMarkdownCodeBlockProcessor: jest.fn(),
		// Plugin manifest and loading state
		manifest: {
			id: "task-progress-bar",
			name: "Task Progress Bar",
			version: "1.0.0",
			minAppVersion: "0.15.0",
			description: "Mock plugin for testing",
			author: "Test Author",
			authorUrl: "",
			fundingUrl: "",
			isDesktopOnly: false,
		},
		_loaded: true,
	} as unknown as TaskProgressBarPlugin;
};

// Mock EditorView Object
const createMockEditorView = (docContent: string): EditorView => {
	const doc = createMockText(docContent);
	const mockState = {
		doc: doc,
		// Add other minimal required EditorState properties/methods if needed by the tests
		// For sortTasks, primarily 'doc' is accessed via view.state.doc
		facet: jest.fn(() => []),
		field: jest.fn(() => undefined),
		fieldInvalidated: jest.fn(() => false),
		toJSON: jest.fn(() => ({})),
		replaceSelection: jest.fn(),
		changeByRange: jest.fn(),
		changes: jest.fn(() => ({
			/* mock ChangeSet */
		})),
		toText: jest.fn(() => doc),
		sliceDoc: jest.fn((from = 0, to = doc.length) =>
			doc.sliceString(from, to)
		),
		// @ts-ignore
		values: [],
		// @ts-ignore
		apply: jest.fn((tr: any) => mockState), // Return the same state for simplicity
		// @ts-ignore
		update: jest.fn((spec: any) => ({
			state: mockState,
			transactions: [],
		})), // Basic update mock
		// @ts-ignore
		selection: {
			ranges: [{ from: 0, to: 0 }],
			mainIndex: 0,
			main: { from: 0, to: 0 },
		}, // Minimal selection mock
	} as unknown as EditorState;

	const mockView = {
		state: mockState,
		dispatch: jest.fn(), // Mock dispatch function
		// Add other EditorView properties/methods if needed by tests
		// For example, if viewport information is accessed
		// viewport: { from: 0, to: doc.length },
		// contentDOM: document.createElement('div'), // Basic DOM element mock
	} as unknown as EditorView;

	return mockView;
};

// Canvas Testing Utilities

/**
 * Create mock Canvas data
 */
export function createMockCanvasData(nodes: any[] = [], edges: any[] = []) {
	return {
		nodes,
		edges,
	};
}

/**
 * Create mock Canvas text node
 */
export function createMockCanvasTextNode(
	id: string,
	text: string,
	x: number = 0,
	y: number = 0,
	width: number = 250,
	height: number = 60
) {
	return {
		type: "text" as const,
		id,
		x,
		y,
		width,
		height,
		text,
	};
}

/**
 * Create mock Canvas task with metadata
 */
export function createMockCanvasTask(
	id: string,
	content: string,
	filePath: string,
	nodeId: string,
	completed: boolean = false,
	originalMarkdown?: string
) {
	return {
		id,
		content,
		filePath,
		line: 0,
		completed,
		status: completed ? "x" : " ",
		originalMarkdown:
			originalMarkdown || `- [${completed ? "x" : " "}] ${content}`,
		metadata: {
			sourceType: "canvas" as const,
			canvasNodeId: nodeId,
			tags: [],
			children: [],
		},
	};
}

/**
 * Create mock execution context for onCompletion tests
 */
export function createMockExecutionContext(task: any, plugin?: any, app?: any) {
	return {
		task,
		plugin: plugin || createMockPlugin(),
		app: app || createMockApp(),
	};
}

/**
 * Mock Canvas task updater with common methods
 */
export function createMockCanvasTaskUpdater() {
	return {
		deleteCanvasTask: jest.fn(),
		moveCanvasTask: jest.fn(),
		duplicateCanvasTask: jest.fn(),
		addTaskToCanvasNode: jest.fn(),
		isCanvasTask: jest.fn(),
	};
}

/**
 * Create a mock Task object with all required fields
 */
export function createMockTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "test-task-id",
		content: "Test task content",
		completed: false,
		status: " ",
		metadata: {
			tags: [],
			children: [],
			...overrides.metadata,
		},
		filePath: "test.md",
		line: 1,
		originalMarkdown: "- [ ] Test task content",
		...overrides,
	};
}

export {
	// createMockText is already exported inline
	createMockChangeSet, // Export the consolidated function
	createMockTransaction, // Export the consolidated function
	createMockApp, // Export the consolidated function
	createMockPlugin, // Export the consolidated function
	mockParentTaskStatusChangeAnnotation,
	createMockEditorView, // Export the new function
};
