/**
 * Tests for FileMetadataTaskParser and FileMetadataTaskUpdater
 */

import { FileMetadataTaskParser } from "../parsers/file-metadata-parser";
import { FileMetadataTaskUpdater } from "../parsers/file-metadata-updater";
import { FileParsingConfiguration } from "../common/setting-definition";
import { StandardFileTaskMetadata, Task } from "../types/task";

describe("FileMetadataTaskParser", () => {
	let parser: FileMetadataTaskParser;
	let config: FileParsingConfiguration;

	beforeEach(() => {
		config = {
			enableFileMetadataParsing: true,
			metadataFieldsToParseAsTasks: [
				"dueDate",
				"todo",
				"complete",
				"task",
			],
			enableTagBasedTaskParsing: true,
			tagsToParseAsTasks: ["#todo", "#task", "#action", "#due"],
			taskContentFromMetadata: "title",
			defaultTaskStatus: " ",
			enableWorkerProcessing: true,
			enableMtimeOptimization: false,
			mtimeCacheSize: 1000,
		};
		parser = new FileMetadataTaskParser(config);
	});

	describe("parseFileForTasks", () => {
		it("should parse tasks from file metadata", () => {
			const filePath = "test.md";
			const fileContent = "# Test File\n\nSome content here.";
			const fileCache = {
				frontmatter: {
					title: "Test Task",
					dueDate: "2024-01-15",
					todo: true,
					priority: 2,
				},
				tags: [],
			};

			const result = parser.parseFileForTasks(
				filePath,
				fileContent,
				fileCache
			);

			expect(result.errors).toHaveLength(0);
			expect(result.tasks).toHaveLength(2); // One for dueDate, one for todo

			// Check dueDate task
			const dueDateTask = result.tasks.find(
				(t) =>
					(t.metadata as StandardFileTaskMetadata).sourceField ===
					"dueDate"
			);
			expect(dueDateTask).toBeDefined();
			expect(dueDateTask?.content).toBe("Test Task");
			expect(dueDateTask?.status).toBe(" "); // Due dates are typically incomplete
			expect(dueDateTask?.metadata.dueDate).toBeDefined();

			// Check todo task
			const todoTask = result.tasks.find(
				(t) =>
					(t.metadata as StandardFileTaskMetadata).sourceField ===
					"todo"
			);
			expect(todoTask).toBeDefined();
			expect(todoTask?.content).toBe("Test Task");
			expect(todoTask?.status).toBe("x"); // todo: true should be completed
		});

		it("should parse tasks from file tags", () => {
			const filePath = "test.md";
			const fileContent = "# Test File\n\nSome content here.";
			const fileCache = {
				frontmatter: {
					title: "Test Task",
				},
				tags: [
					{
						tag: "#todo",
						position: {
							start: { line: 0, col: 0 },
							end: { line: 0, col: 5 },
						},
					},
					{
						tag: "#action",
						position: {
							start: { line: 1, col: 0 },
							end: { line: 1, col: 7 },
						},
					},
				],
			};

			const result = parser.parseFileForTasks(
				filePath,
				fileContent,
				fileCache as any
			);

			expect(result.errors).toHaveLength(0);
			expect(result.tasks).toHaveLength(2); // One for #todo, one for #action

			// Check todo tag task
			const todoTask = result.tasks.find(
				(t) =>
					(t.metadata as StandardFileTaskMetadata).sourceTag ===
					"#todo"
			);
			expect(todoTask).toBeDefined();
			expect(todoTask?.content).toBe("Test Task");
			expect(todoTask?.status).toBe(" "); // Default status

			// Check action tag task
			const actionTask = result.tasks.find(
				(t) =>
					(t.metadata as StandardFileTaskMetadata).sourceTag ===
					"#action"
			);
			expect(actionTask).toBeDefined();
			expect(actionTask?.content).toBe("Test Task");
			expect(actionTask?.status).toBe(" "); // Default status
		});

		it("should use filename when title metadata is not available", () => {
			const filePath = "My Important Task.md";
			const fileContent = "# Test File\n\nSome content here.";
			const fileCache = {
				frontmatter: {
					dueDate: "2024-01-15",
				},
				tags: [],
			};

			const result = parser.parseFileForTasks(
				filePath,
				fileContent,
				fileCache
			);

			expect(result.errors).toHaveLength(0);
			expect(result.tasks).toHaveLength(1);
			expect(result.tasks[0].content).toBe("My Important Task"); // Filename without extension
		});

		it("should handle different task status determination", () => {
			const filePath = "test.md";
			const fileContent = "# Test File";
			const fileCache = {
				frontmatter: {
					title: "Test Task",
					complete: true,
					todo: false,
					dueDate: "2024-01-15",
				},
				tags: [],
			};

			const result = parser.parseFileForTasks(
				filePath,
				fileContent,
				fileCache
			);

			expect(result.errors).toHaveLength(0);
			expect(result.tasks).toHaveLength(3); // complete, todo, dueDate

			// Check complete task
			const completeTask = result.tasks.find(
				(t) =>
					(t.metadata as StandardFileTaskMetadata).sourceField ===
					"complete"
			);
			expect(completeTask?.status).toBe("x"); // complete: true should be completed

			// Check todo task
			const todoTask = result.tasks.find(
				(t) =>
					(t.metadata as StandardFileTaskMetadata).sourceField ===
					"todo"
			);
			expect(todoTask?.status).toBe(" "); // todo: false should be incomplete

			// Check dueDate task
			const dueDateTask = result.tasks.find(
				(t) =>
					(t.metadata as StandardFileTaskMetadata).sourceField ===
					"dueDate"
			);
			expect(dueDateTask?.status).toBe(" "); // Due dates are typically incomplete
		});

		it("should not create tasks when parsing is disabled", () => {
			const disabledConfig: FileParsingConfiguration = {
				enableFileMetadataParsing: false,
				metadataFieldsToParseAsTasks: ["dueDate", "todo"],
				enableTagBasedTaskParsing: false,
				tagsToParseAsTasks: ["#todo"],
				taskContentFromMetadata: "title",
				defaultTaskStatus: " ",
				enableWorkerProcessing: true,
				enableMtimeOptimization: false,
				mtimeCacheSize: 1000,
			};
			const disabledParser = new FileMetadataTaskParser(disabledConfig);

			const filePath = "test.md";
			const fileContent = "# Test File";
			const fileCache = {
				frontmatter: {
					title: "Test Task",
					dueDate: "2024-01-15",
				},
				tags: [
					{
						tag: "#todo",
						position: {
							start: { line: 0, col: 0 },
							end: { line: 0, col: 5 },
						},
					},
				],
			};

			const result = disabledParser.parseFileForTasks(
				filePath,
				fileContent,
				fileCache as any
			);

			expect(result.errors).toHaveLength(0);
			expect(result.tasks).toHaveLength(0); // No tasks should be created
		});

		it("should extract additional metadata correctly", () => {
			const filePath = "test.md";
			const fileContent = "# Test File";
			const fileCache = {
				frontmatter: {
					title: "Test Task",
					dueDate: "2024-01-15",
					priority: "high",
					project: "Work Project",
					context: "office",
					area: "development",
					tags: ["important", "urgent"],
				},
				tags: [],
			};

			const result = parser.parseFileForTasks(
				filePath,
				fileContent,
				fileCache
			);

			expect(result.errors).toHaveLength(0);
			expect(result.tasks).toHaveLength(1);

			const task = result.tasks[0];
			expect(task.metadata.priority).toBe(3); // "high" should be converted to 3
			expect(task.metadata.project).toBe("Work Project");
			expect(task.metadata.context).toBe("office");
			expect(task.metadata.area).toBe("development");
			expect(task.metadata.tags).toEqual(["important", "urgent"]);
		});

		it("should handle errors gracefully", () => {
			const filePath = "test.md";
			const fileContent = "# Test File";
			const fileCache = null; // This should not cause a crash

			const result = parser.parseFileForTasks(
				filePath,
				fileContent,
				fileCache as any
			);

			expect(result.tasks).toHaveLength(0);
			expect(result.errors).toHaveLength(0); // Should handle gracefully without errors
		});
	});

	describe("date parsing", () => {
		it("should parse various date formats", () => {
			const filePath = "test.md";
			const fileContent = "# Test File";
			const fileCache = {
				frontmatter: {
					title: "Test Task",
					dueDate: "2024-01-15",
					startDate: new Date("2024-01-10"),
					scheduledDate: 1705276800000, // Timestamp
				},
				tags: [],
			};

			const result = parser.parseFileForTasks(
				filePath,
				fileContent,
				fileCache
			);

			expect(result.tasks).toHaveLength(1); // Only dueDate is in the configured fields
			const task = result.tasks[0];
			expect(task.metadata.dueDate).toBeDefined();
			expect(typeof task.metadata.dueDate).toBe("number");
		});
	});

	describe("priority parsing", () => {
		it("should parse various priority formats", () => {
			const filePath = "test.md";
			const fileContent = "# Test File";
			const fileCache = {
				frontmatter: {
					title: "Test Task",
					dueDate: "2024-01-15",
					priority: "medium",
				},
				tags: [],
			};

			const result = parser.parseFileForTasks(
				filePath,
				fileContent,
				fileCache
			);

			expect(result.tasks).toHaveLength(1);
			const task = result.tasks[0];
			expect(task.metadata.priority).toBe(2); // "medium" should be converted to 2
		});
	});
});

describe("FileMetadataTaskUpdater", () => {
	let updater: FileMetadataTaskUpdater;
	let config: FileParsingConfiguration;
	let mockApp: any;

	beforeEach(() => {
		config = {
			enableFileMetadataParsing: true,
			metadataFieldsToParseAsTasks: [
				"dueDate",
				"todo",
				"complete",
				"task",
			],
			enableTagBasedTaskParsing: true,
			tagsToParseAsTasks: ["#todo", "#task", "#action", "#due"],
			taskContentFromMetadata: "title",
			defaultTaskStatus: " ",
			enableWorkerProcessing: true,
			enableMtimeOptimization: false,
			mtimeCacheSize: 1000,
		};

		// Mock Obsidian App
		mockApp = {
			vault: {
				getFileByPath: jest.fn(),
				read: jest.fn(),
				rename: jest.fn(),
			},
			fileManager: {
				processFrontMatter: jest.fn(),
			},
		};

		updater = new FileMetadataTaskUpdater(mockApp, config);
	});

	describe("isFileMetadataTask", () => {
		it("should identify file metadata tasks", () => {
			const metadataTask: Task = {
				id: "test.md-metadata-dueDate",
				content: "Test Task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test Task",
				metadata: {
					source: "file-metadata",
					sourceField: "dueDate",
					tags: [],
					children: [],
					heading: [],
				} as StandardFileTaskMetadata,
			};

			const tagTask: Task = {
				id: "test.md-tag-todo",
				content: "Test Task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test Task",
				metadata: {
					source: "file-tag",
					sourceTag: "#todo",
					tags: [],
					children: [],
					heading: [],
				} as StandardFileTaskMetadata,
			};

			const regularTask: Task = {
				id: "test.md-L5",
				content: "Regular Task",
				filePath: "test.md",
				line: 5,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Regular Task",
				metadata: {
					tags: [],
					children: [],
					heading: [],
				},
			};

			expect(updater.isFileMetadataTask(metadataTask)).toBe(true);
			expect(updater.isFileMetadataTask(tagTask)).toBe(true);
			expect(updater.isFileMetadataTask(regularTask)).toBe(false);
		});
	});

	describe("updateFileMetadataTask", () => {
		it("should handle file not found error", async () => {
			const originalTask: Task = {
				id: "nonexistent.md-metadata-dueDate",
				content: "Test Task",
				filePath: "nonexistent.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test Task",
				metadata: {
					source: "file-metadata",
					sourceField: "dueDate",
					tags: [],
					children: [],
					heading: [],
				} as StandardFileTaskMetadata,
			};

			const updatedTask = {
				...originalTask,
				completed: true,
				status: "x",
			};

			mockApp.vault.getFileByPath.mockReturnValue(null);

			const result = await updater.updateFileMetadataTask(
				originalTask,
				updatedTask
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain("File not found");
		});

		it("should handle non-file-metadata tasks", async () => {
			const regularTask: Task = {
				id: "test.md-L5",
				content: "Regular Task",
				filePath: "test.md",
				line: 5,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Regular Task",
				metadata: {
					tags: [],
					children: [],
					heading: [],
				},
			};

			const updatedTask = {
				...regularTask,
				completed: true,
				status: "x",
			};

			const result = await updater.updateFileMetadataTask(
				regularTask,
				updatedTask
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain("not a file metadata task");
		});
	});
});
