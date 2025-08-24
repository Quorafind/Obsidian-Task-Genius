/**
 * Integration tests for FileTaskManager with enhanced time parsing
 */

import { FileTaskManagerImpl } from "../managers/file-task-manager";
import { TimeParsingService } from "../services/time-parsing-service";
import { TimeParsingConfig } from "../services/time-parsing-service";
import { App } from "obsidian";

// Mock Obsidian App
const mockApp = {
	vault: {
		getFileByPath: jest.fn(),
		read: jest.fn(),
		modify: jest.fn(),
	},
	fileManager: {
		renameFile: jest.fn(),
	},
} as unknown as App;

// Mock BasesEntry for testing
interface MockBasesEntry {
	ctx: any;
	file: {
		parent: any;
		deleted: boolean;
		vault: any;
		path: string;
		name: string;
		extension: string;
		getShortName(): string;
	};
	formulas: Record<string, any>;
	implicit: {
		file: any;
		name: string;
		path: string;
		folder: string;
		ext: string;
	};
	lazyEvalCache: Record<string, any>;
	properties: Record<string, any>;
	getValue(prop: { type: "property" | "file" | "formula"; name: string }): any;
	updateProperty(key: string, value: any): void;
	getFormulaValue(formula: string): any;
	getPropertyKeys(): string[];
}

describe("FileTaskManager Time Integration", () => {
	let fileTaskManager: FileTaskManagerImpl;
	let timeParsingService: TimeParsingService;

	beforeEach(() => {
		// Create time parsing service with test configuration
		const timeConfig: TimeParsingConfig = {
			enabled: true,
			supportedLanguages: ["en"],
			dateKeywords: {
				start: ["start", "from", "begins"],
				due: ["due", "deadline", "by"],
				scheduled: ["scheduled", "at", "@"],
			},
			removeOriginalText: false,
			perLineProcessing: true,
			realTimeReplacement: false,
		};

		timeParsingService = new TimeParsingService(timeConfig);
		fileTaskManager = new FileTaskManagerImpl(mockApp, undefined, timeParsingService);
	});

	describe("Time Component Extraction", () => {
		it("should extract single time from task content", () => {
			// First test the time parsing service directly
			const directResult = timeParsingService.parseTimeComponents("Meeting at 2:30 PM");
			
			const mockEntry: MockBasesEntry = {
				ctx: {},
				file: {
					parent: null,
					deleted: false,
					vault: null,
					path: "test-task.md",
					name: "test-task.md",
					extension: "md",
					getShortName: () => "test-task",
				},
				formulas: {},
				implicit: {
					file: null,
					name: "test-task",
					path: "test-task.md",
					folder: "",
					ext: "md",
				},
				lazyEvalCache: {},
				properties: {
					title: "Meeting at 2:30 PM",
					status: " ",
					completed: false,
				},
				getValue: jest.fn((prop) => {
					if (prop.name === "title") return "Meeting at 2:30 PM";
					if (prop.name === "status") return " ";
					if (prop.name === "completed") return false;
					return undefined;
				}),
				updateProperty: jest.fn(),
				getFormulaValue: jest.fn(),
				getPropertyKeys: jest.fn(() => ["title", "status", "completed"]),
			};

			const fileTask = fileTaskManager.entryToFileTask(mockEntry);

			// Debug: Check what we got from direct parsing
			expect(directResult.timeComponents).toBeDefined();
			const hasTimeComponents = Object.keys(directResult.timeComponents).length > 0;
			expect(hasTimeComponents).toBe(true);

			expect(fileTask.content).toBe("Meeting at 2:30 PM");
			
			// If direct parsing works but file task doesn't, there's an integration issue
			if (hasTimeComponents && !fileTask.metadata.timeComponents) {
				throw new Error(`Direct parsing found time components but FileTaskManager didn't. Direct result: ${JSON.stringify(directResult)}`);
			}
			
			expect(fileTask.metadata.timeComponents).toBeDefined();
			expect(fileTask.metadata.timeComponents?.dueTime || fileTask.metadata.timeComponents?.scheduledTime).toBeDefined();
			
			const timeComponent = fileTask.metadata.timeComponents?.dueTime || fileTask.metadata.timeComponents?.scheduledTime;
			expect(timeComponent?.hour).toBe(14);
			expect(timeComponent?.minute).toBe(30);
		});

		it("should extract time range from task content", () => {
			const mockEntry: MockBasesEntry = {
				ctx: {},
				file: {
					parent: null,
					deleted: false,
					vault: null,
					path: "workshop.md",
					name: "workshop.md",
					extension: "md",
					getShortName: () => "workshop",
				},
				formulas: {},
				implicit: {
					file: null,
					name: "workshop",
					path: "workshop.md",
					folder: "",
					ext: "md",
				},
				lazyEvalCache: {},
				properties: {
					title: "Workshop 9:00-17:00",
					status: " ",
					completed: false,
				},
				getValue: jest.fn((prop) => {
					if (prop.name === "title") return "Workshop 9:00-17:00";
					if (prop.name === "status") return " ";
					if (prop.name === "completed") return false;
					return undefined;
				}),
				updateProperty: jest.fn(),
				getFormulaValue: jest.fn(),
				getPropertyKeys: jest.fn(() => ["title", "status", "completed"]),
			};

			const fileTask = fileTaskManager.entryToFileTask(mockEntry);

			expect(fileTask.content).toBe("Workshop 9:00-17:00");
			expect(fileTask.metadata.timeComponents).toBeDefined();
			expect(fileTask.metadata.timeComponents?.startTime).toBeDefined();
			expect(fileTask.metadata.timeComponents?.endTime).toBeDefined();
			expect(fileTask.metadata.timeComponents?.startTime?.hour).toBe(9);
			expect(fileTask.metadata.timeComponents?.startTime?.minute).toBe(0);
			expect(fileTask.metadata.timeComponents?.endTime?.hour).toBe(17);
			expect(fileTask.metadata.timeComponents?.endTime?.minute).toBe(0);
		});

		it("should combine date timestamps with time components", () => {
			const mockEntry: MockBasesEntry = {
				ctx: {},
				file: {
					parent: null,
					deleted: false,
					vault: null,
					path: "appointment.md",
					name: "appointment.md",
					extension: "md",
					getShortName: () => "appointment",
				},
				formulas: {},
				implicit: {
					file: null,
					name: "appointment",
					path: "appointment.md",
					folder: "",
					ext: "md",
				},
				lazyEvalCache: {},
				properties: {
					title: "Doctor appointment at 3:30 PM",
					status: " ",
					completed: false,
					due: "2025-08-25", // Date in YYYY-MM-DD format
				},
				getValue: jest.fn((prop) => {
					if (prop.name === "title") return "Doctor appointment at 3:30 PM";
					if (prop.name === "status") return " ";
					if (prop.name === "completed") return false;
					if (prop.name === "due") return "2025-08-25";
					return undefined;
				}),
				updateProperty: jest.fn(),
				getFormulaValue: jest.fn(),
				getPropertyKeys: jest.fn(() => ["title", "status", "completed", "due"]),
			};

			const fileTask = fileTaskManager.entryToFileTask(mockEntry);

			expect(fileTask.content).toBe("Doctor appointment at 3:30 PM");
			
			// Check time component (could be dueTime or scheduledTime based on context)
			const timeComponent = fileTask.metadata.timeComponents?.dueTime || fileTask.metadata.timeComponents?.scheduledTime;
			expect(timeComponent).toBeDefined();
			expect(timeComponent?.hour).toBe(15);
			expect(timeComponent?.minute).toBe(30);
			
			// Check that enhanced datetime was created
			expect(fileTask.metadata.enhancedDates?.dueDateTime).toBeDefined();
			const dueDateTime = fileTask.metadata.enhancedDates?.dueDateTime;
			if (dueDateTime) {
				expect(dueDateTime.getFullYear()).toBe(2025);
				expect(dueDateTime.getMonth()).toBe(7); // August (0-based)
				expect(dueDateTime.getDate()).toBe(25);
				expect(dueDateTime.getHours()).toBe(15);
				expect(dueDateTime.getMinutes()).toBe(30);
			}
		});

		it("should handle tasks without time information gracefully", () => {
			const mockEntry: MockBasesEntry = {
				ctx: {},
				file: {
					parent: null,
					deleted: false,
					vault: null,
					path: "simple-task.md",
					name: "simple-task.md",
					extension: "md",
					getShortName: () => "simple-task",
				},
				formulas: {},
				implicit: {
					file: null,
					name: "simple-task",
					path: "simple-task.md",
					folder: "",
					ext: "md",
				},
				lazyEvalCache: {},
				properties: {
					title: "Simple task without time",
					status: " ",
					completed: false,
				},
				getValue: jest.fn((prop) => {
					if (prop.name === "title") return "Simple task without time";
					if (prop.name === "status") return " ";
					if (prop.name === "completed") return false;
					return undefined;
				}),
				updateProperty: jest.fn(),
				getFormulaValue: jest.fn(),
				getPropertyKeys: jest.fn(() => ["title", "status", "completed"]),
			};

			const fileTask = fileTaskManager.entryToFileTask(mockEntry);

			expect(fileTask.content).toBe("Simple task without time");
			expect(fileTask.metadata.timeComponents).toBeUndefined();
			expect(fileTask.metadata.enhancedDates).toBeUndefined();
		});
	});

	describe("Task Updates with Time Components", () => {
		it("should re-extract time components when content is updated", async () => {
			const mockEntry: MockBasesEntry = {
				ctx: {},
				file: {
					parent: null,
					deleted: false,
					vault: null,
					path: "meeting.md",
					name: "meeting.md",
					extension: "md",
					getShortName: () => "meeting",
				},
				formulas: {},
				implicit: {
					file: null,
					name: "meeting",
					path: "meeting.md",
					folder: "",
					ext: "md",
				},
				lazyEvalCache: {},
				properties: {
					title: "Meeting at 2:00 PM",
					status: " ",
					completed: false,
				},
				getValue: jest.fn((prop) => {
					if (prop.name === "title") return "Meeting at 2:00 PM";
					if (prop.name === "status") return " ";
					if (prop.name === "completed") return false;
					return undefined;
				}),
				updateProperty: jest.fn(),
				getFormulaValue: jest.fn(),
				getPropertyKeys: jest.fn(() => ["title", "status", "completed"]),
			};

			const fileTask = fileTaskManager.entryToFileTask(mockEntry);

			// Verify initial time component (could be dueTime or scheduledTime)
			const initialTimeComponent = fileTask.metadata.timeComponents?.dueTime || fileTask.metadata.timeComponents?.scheduledTime;
			expect(initialTimeComponent?.hour).toBe(14);
			expect(initialTimeComponent?.minute).toBe(0);

			// Update the task content with new time
			await fileTaskManager.updateFileTask(fileTask, {
				content: "Meeting at 4:30 PM",
			});

			// Verify time component was updated
			const updatedTimeComponent = fileTask.metadata.timeComponents?.dueTime || fileTask.metadata.timeComponents?.scheduledTime;
			expect(updatedTimeComponent?.hour).toBe(16);
			expect(updatedTimeComponent?.minute).toBe(30);
		});
	});

	describe("Error Handling", () => {
		it("should handle time parsing errors gracefully", () => {
			// Create a file task manager without time parsing service
			const fileTaskManagerNoTime = new FileTaskManagerImpl(mockApp);

			const mockEntry: MockBasesEntry = {
				ctx: {},
				file: {
					parent: null,
					deleted: false,
					vault: null,
					path: "test.md",
					name: "test.md",
					extension: "md",
					getShortName: () => "test",
				},
				formulas: {},
				implicit: {
					file: null,
					name: "test",
					path: "test.md",
					folder: "",
					ext: "md",
				},
				lazyEvalCache: {},
				properties: {
					title: "Task with invalid time 25:99",
					status: " ",
					completed: false,
				},
				getValue: jest.fn((prop) => {
					if (prop.name === "title") return "Task with invalid time 25:99";
					if (prop.name === "status") return " ";
					if (prop.name === "completed") return false;
					return undefined;
				}),
				updateProperty: jest.fn(),
				getFormulaValue: jest.fn(),
				getPropertyKeys: jest.fn(() => ["title", "status", "completed"]),
			};

			// Should not throw error even without time parsing service
			const fileTask = fileTaskManagerNoTime.entryToFileTask(mockEntry);
			expect(fileTask.content).toBe("Task with invalid time 25:99");
			expect(fileTask.metadata.timeComponents).toBeUndefined();
		});
	});
});