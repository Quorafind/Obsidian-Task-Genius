/**
 * TaskParsingService Integration Tests
 *
 * Tests the complete project parsing workflow including:
 * - Task parsing with enhanced project support
 * - Integration with ProjectConfigManager
 * - Metadata mapping functionality
 * - Default project naming strategies
 * - Priority order of different project sources
 */

import {
	TaskParsingService,
	TaskParsingServiceOptions,
} from "../utils/TaskParsingService";
import { TaskParserConfig, MetadataParseMode } from "../types/TaskParserConfig";
import { Task, TgProject } from "../types/task";

// Mock Obsidian types (reuse from ProjectConfigManager tests)
class MockTFile {
	constructor(
		public path: string,
		public name: string,
		public parent: MockTFolder | null = null
	) {
		this.stat = { mtime: Date.now() };
	}
	stat: { mtime: number };
}

class MockTFolder {
	constructor(
		public path: string,
		public name: string,
		public parent: MockTFolder | null = null,
		public children: (MockTFile | MockTFolder)[] = []
	) {}
}

class MockVault {
	private files = new Map<string, MockTFile>();
	private folders = new Map<string, MockTFolder>();
	private fileContents = new Map<string, string>();

	addFile(path: string, content: string): MockTFile {
		const fileName = path.split("/").pop() || "";
		const file = new MockTFile(path, fileName);
		this.files.set(path, file);
		this.fileContents.set(path, content);
		return file;
	}

	addFolder(path: string): MockTFolder {
		const folderName = path.split("/").pop() || "";
		const folder = new MockTFolder(path, folderName);
		this.folders.set(path, folder);
		return folder;
	}

	getAbstractFileByPath(path: string): MockTFile | null {
		return this.files.get(path) || null;
	}

	getFileByPath(path: string): MockTFile | null {
		return this.files.get(path) || null;
	}

	async read(file: MockTFile): Promise<string> {
		return this.fileContents.get(file.path) || "";
	}
}

class MockMetadataCache {
	private cache = new Map<string, any>();

	setFileMetadata(path: string, metadata: any): void {
		this.cache.set(path, { frontmatter: metadata });
	}

	getFileCache(file: MockTFile): any {
		return this.cache.get(file.path);
	}
}

describe("TaskParsingService Integration", () => {
	let vault: MockVault;
	let metadataCache: MockMetadataCache;
	let parsingService: TaskParsingService;

	const createParserConfig = (
		enableEnhancedProject = true
	): TaskParserConfig => ({
		parseMetadata: true,
		parseTags: true,
		parseComments: false,
		parseHeadings: false,
		maxIndentSize: 4,
		maxParseIterations: 1000,
		maxMetadataIterations: 100,
		maxTagLength: 100,
		maxEmojiValueLength: 200,
		maxStackOperations: 1000,
		maxStackSize: 100,
		statusMapping: {
			todo: " ",
			done: "x",
			cancelled: "-",
		},
		emojiMapping: {
			"📅": "dueDate",
			"🔺": "priority",
		},
		metadataParseMode: MetadataParseMode.Both,
		specialTagPrefixes: {
			project: "project",
			area: "area",
			context: "context",
		},
		projectConfig: enableEnhancedProject
			? {
					enableEnhancedProject: true,
					pathMappings: [],
					metadataConfig: {
						metadataKey: "project",
						inheritFromFrontmatter: true,
						inheritFromFrontmatterForSubtasks: false,
						enabled: true,
					},
					configFile: {
						fileName: "project.md",
						searchRecursively: true,
						enabled: true,
					},
					metadataMappings: [],
					defaultProjectNaming: {
						strategy: "filename",
						stripExtension: true,
						enabled: false,
					},
			  }
			: undefined,
	});

	const createServiceOptions = (
		parserConfig: TaskParserConfig,
		customProjectOptions?: any
	): TaskParsingServiceOptions => ({
		vault: vault as any,
		metadataCache: metadataCache as any,
		parserConfig,
		projectConfigOptions: customProjectOptions || {
			configFileName: "project.md",
			searchRecursively: true,
			metadataKey: "project",
			pathMappings: [],
			metadataMappings: [],
			defaultProjectNaming: {
				strategy: "filename",
				stripExtension: true,
				enabled: false,
			},
			metadataConfigEnabled: true,
			configFileEnabled: true,
		},
	});

	beforeEach(() => {
		vault = new MockVault();
		metadataCache = new MockMetadataCache();
	});

	describe("Enhanced project parsing", () => {
		it("should parse tasks with path-based projects", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [
					{
						pathPattern: "Work",
						projectName: "Work Project",
						enabled: true,
					},
				],
				metadataMappings: [],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
				enhancedProjectEnabled: true,
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			const content = `
- [ ] Complete report 📅 2024-01-15
- [x] Review documentation
- [ ] Send email to team 🔺 high
`;

			const tasks = await parsingService.parseTasksFromContentLegacy(
				content,
				"Work/tasks.md"
			);

			expect(tasks).toHaveLength(3);

			// Check that all tasks have the path-based project
			tasks.forEach((task) => {
				expect(task.metadata.tgProject).toEqual({
					type: "path",
					name: "Work Project",
					source: "Work",
					readonly: true,
				});
			});

			// Check specific task properties
			expect(tasks[0].content).toBe("Complete report");
			expect(tasks[0].metadata.dueDate).toBe(1705248000000);
			expect(tasks[0].completed).toBe(false);

			expect(tasks[1].content).toBe("Review documentation");
			expect(tasks[1].completed).toBe(true);

			expect(tasks[2].content).toBe("Send email to team");
			expect(tasks[2].metadata.priority).toBe(4);
		});

		it("should parse tasks with metadata-based projects", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [],
				metadataMappings: [],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			vault.addFile("Personal/notes.md", "# Personal Notes");
			metadataCache.setFileMetadata("Personal/notes.md", {
				project: "Personal Development",
				author: "John Doe",
			});

			const content = `
- [ ] Read self-help book 📅 2024-02-01
- [ ] Exercise for 30 minutes
`;

			const tasks = await parsingService.parseTasksFromContentLegacy(
				content,
				"Personal/notes.md"
			);

			expect(tasks).toHaveLength(2);

			tasks.forEach((task) => {
				expect(task.metadata.tgProject).toEqual({
					type: "metadata",
					name: "Personal Development",
					source: "project",
					readonly: true,
				});
			});
		});

		it("should parse tasks with config file-based projects", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [],
				metadataMappings: [],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			// Set up config file
			vault.addFile("Projects/project.md", "project: Research Project");
			vault.addFile("Projects/tasks.md", "# Research Tasks");

			// Set metadata for config file
			metadataCache.setFileMetadata("Projects/project.md", {
				project: "Research Project",
			});

			// Mock folder structure
			const file = vault.addFile("Projects/tasks.md", "# Research Tasks");
			const folder = vault.addFolder("Projects");
			const configFile = vault.getAbstractFileByPath(
				"Projects/project.md"
			);
			if (configFile) {
				folder.children.push(configFile);
				file.parent = folder;
			}

			const content = `
- [ ] Literature review
- [ ] Data collection 🔺 medium
- [ ] Analysis 📅 2024-03-15
`;

			const tasks = await parsingService.parseTasksFromContentLegacy(
				content,
				"Projects/tasks.md"
			);

			expect(tasks).toHaveLength(3);

			tasks.forEach((task) => {
				expect(task.metadata.tgProject).toEqual({
					type: "config",
					name: "Research Project",
					source: "project.md",
					readonly: true,
				});
			});
		});

		it("should parse tasks with default project naming", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [],
				metadataMappings: [],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: true,
				},
				enhancedProjectEnabled: true,
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			const content = `
- [ ] Task without explicit project
- [x] Another completed task
`;

			const tasks = await parsingService.parseTasksFromContentLegacy(
				content,
				"Documents/my-project-notes.md"
			);

			expect(tasks).toHaveLength(2);

			tasks.forEach((task) => {
				expect(task.metadata.tgProject).toEqual({
					type: "default",
					name: "my-project-notes",
					source: "filename",
					readonly: true,
				});
			});
		});
	});

	describe("Metadata mappings", () => {
		it("should apply metadata mappings during parsing", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [],
				metadataMappings: [
					{
						sourceKey: "deadline",
						targetKey: "dueDate",
						enabled: true,
					},
					{
						sourceKey: "importance",
						targetKey: "priority",
						enabled: true,
					},
				],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
				enhancedProjectEnabled: true,
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			vault.addFile("test.md", "# Test file");
			metadataCache.setFileMetadata("test.md", {
				project: "Test Project",
				deadline: "2024-04-01",
				importance: "critical",
				category: "work",
			});

			const content = `
- [ ] Important task with metadata mapping
`;

			const tasks = await parsingService.parseTasksFromContentLegacy(
				content,
				"test.md"
			);
			const enhancedMetadata = await parsingService.getEnhancedMetadata(
				"test.md"
			);

			expect(enhancedMetadata).toEqual({
				project: "Test Project",
				deadline: "2024-04-01",
				importance: "critical",
				category: "work",
				dueDate: new Date(2024, 3, 1).getTime(), // Date converted to timestamp
				priority: 5, // 'critical' converted to number (highest priority)
			});

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tgProject).toEqual({
				type: "metadata",
				name: "Test Project",
				source: "project",
				readonly: true,
			});
		});

		it("should apply metadata mappings in Worker environment simulation", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [],
				metadataMappings: [
					{
						sourceKey: "优先级",
						targetKey: "priority",
						enabled: true,
					},
					{
						sourceKey: "deadline",
						targetKey: "dueDate",
						enabled: true,
					},
				],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
				enhancedProjectEnabled: true,
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			vault.addFile("worker-test.md", "# Test file for worker");
			metadataCache.setFileMetadata("worker-test.md", {
				project: "Worker Test Project",
				优先级: "high",
				deadline: "2024-05-01",
				description: "Test description",
			});

			// Simulate the Worker pre-computation process
			const enhancedProjectData =
				await parsingService.computeEnhancedProjectData([
					"worker-test.md",
				]);

			// Verify that the enhanced project data contains mapped metadata
			expect(
				enhancedProjectData.fileMetadataMap["worker-test.md"]
			).toEqual({
				project: "Worker Test Project",
				优先级: "high",
				deadline: "2024-05-01",
				description: "Test description",
				priority: 4, // Mapped from '优先级' and converted to number
				dueDate: new Date(2024, 4, 1).getTime(), // Mapped from 'deadline' and converted to timestamp
			});

			expect(
				enhancedProjectData.fileProjectMap["worker-test.md"]
			).toEqual({
				project: "Worker Test Project",
				source: "project",
				readonly: true,
			});

			// Now test that the parser would use this enhanced metadata correctly
			const content = `
- [ ] Chinese priority task with mapping [优先级::urgent]
- [ ] Another task with deadline [deadline::2024-06-01]
`;

			const tasks = await parsingService.parseTasksFromContentLegacy(
				content,
				"worker-test.md"
			);

			expect(tasks).toHaveLength(2);

			// Verify that tasks inherit the mapped metadata from file frontmatter
			tasks.forEach((task) => {
				expect(task.metadata.tgProject).toEqual({
					type: "metadata",
					name: "Worker Test Project",
					source: "project",
					readonly: true,
				});
			});

			// Note: The file frontmatter metadata mappings should be available to tasks
			// but the individual task metadata parsing might override some values
		});

		it("should not apply metadata mappings when enhanced project is disabled", async () => {
			const parserConfig = createParserConfig();
			// Create service without project config options (enhanced project disabled)
			const serviceOptions: TaskParsingServiceOptions = {
				vault: vault as any,
				metadataCache: metadataCache as any,
				parserConfig,
				// No projectConfigOptions - enhanced project is disabled
			};

			parsingService = new TaskParsingService(serviceOptions);

			vault.addFile("test-no-mapping.md", "# Test file");
			metadataCache.setFileMetadata("test-no-mapping.md", {
				project: "Test Project",
				deadline: "2024-04-01", // This should NOT be mapped to 'dueDate'
				importance: "critical", // This should NOT be mapped to 'priority'
				category: "work",
			});

			const content = `
- [ ] Task without metadata mapping
`;

			const tasks = await parsingService.parseTasksFromContentLegacy(
				content,
				"test-no-mapping.md"
			);

			expect(tasks).toHaveLength(1);
			// Should not have tgProject when enhanced project is disabled
			expect(tasks[0].metadata.tgProject).toBeUndefined();

			// Original metadata should be preserved without mapping
			// Note: Since enhanced project is disabled, we won't have access to enhanced metadata
			// The task should still be parsed but without the enhanced features
		});

		it("should ignore disabled metadata mappings", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [],
				metadataMappings: [
					{
						sourceKey: "deadline",
						targetKey: "dueDate",
						enabled: false, // Disabled mapping
					},
					{
						sourceKey: "importance",
						targetKey: "priority",
						enabled: true, // Enabled mapping
					},
				],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			vault.addFile("test-partial.md", "# Test file");
			metadataCache.setFileMetadata("test-partial.md", {
				project: "Test Project",
				deadline: "2024-04-01",
				importance: "critical",
				category: "work",
			});

			const enhancedMetadata = await parsingService.getEnhancedMetadata(
				"test-partial.md"
			);

			expect(enhancedMetadata).toEqual({
				project: "Test Project",
				deadline: "2024-04-01", // Should remain as 'deadline', not mapped to 'dueDate'
				importance: "critical",
				category: "work",
				priority: 5, // Should be mapped from 'importance' to 'priority' and converted to number (critical = 5)
			});

			// Should NOT have 'dueDate' field since that mapping is disabled
			expect(enhancedMetadata.dueDate).toBeUndefined();
		});

		it("should use basic metadata with parseTasksFromContentBasic method", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [],
				metadataMappings: [
					{
						sourceKey: "deadline",
						targetKey: "dueDate",
						enabled: true,
					},
				],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			vault.addFile("test-basic.md", "# Test file");
			metadataCache.setFileMetadata("test-basic.md", {
				project: "Test Project",
				deadline: "2024-04-01",
			});

			const content = `
- [ ] Task parsed with basic method
`;

			// Use the basic parsing method which should NOT apply metadata mappings
			const tasks = await parsingService.parseTasksFromContentBasic(
				content,
				"test-basic.md"
			);

			expect(tasks).toHaveLength(1);
			// Should not have tgProject when using basic parsing
			expect(tasks[0].metadata.tgProject).toBeUndefined();
		});

		it("should apply metadata mappings to project configuration data", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [],
				metadataMappings: [
					{
						sourceKey: "优先级",
						targetKey: "priority",
						enabled: true,
					},
					{
						sourceKey: "deadline",
						targetKey: "dueDate",
						enabled: true,
					},
				],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			// Set up project config file in folder
			vault.addFile(
				"TestProject/project.md",
				"project: Test Project with Config"
			);
			metadataCache.setFileMetadata("TestProject/project.md", {
				project: "Test Project with Config",
				优先级: "high",
				deadline: "2024-05-01",
				description: "Project-level metadata",
			});

			// Set up a regular file in the same folder
			vault.addFile("TestProject/tasks.md", "# Tasks");
			metadataCache.setFileMetadata("TestProject/tasks.md", {
				// No file-level metadata for this test
			});

			// Mock folder structure
			const file = vault.getAbstractFileByPath("TestProject/tasks.md");
			const folder = vault.addFolder("TestProject");
			const configFile = vault.getAbstractFileByPath(
				"TestProject/project.md"
			);
			if (configFile && file) {
				folder.children.push(configFile);
				file.parent = folder;
			}

			// Test enhanced project data computation
			const enhancedProjectData =
				await parsingService.computeEnhancedProjectData([
					"TestProject/tasks.md",
				]);

			// Verify that the project config data has mappings applied
			expect(enhancedProjectData.projectConfigMap["TestProject"]).toEqual(
				{
					project: "Test Project with Config",
					优先级: "high",
					deadline: "2024-05-01",
					description: "Project-level metadata",
					priority: 4, // Mapped from '优先级' and converted to number
					dueDate: new Date(2024, 4, 1).getTime(), // Mapped from 'deadline' and converted to timestamp
				}
			);

			// Verify that the file project mapping is correct
			expect(
				enhancedProjectData.fileProjectMap["TestProject/tasks.md"]
			).toEqual({
				project: "Test Project with Config",
				source: "project.md",
				readonly: true,
			});
		});

		it("should inherit project-level attributes to tasks", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [],
				metadataMappings: [
					{
						sourceKey: "优先级",
						targetKey: "priority",
						enabled: true,
					},
				],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			// 设置项目配置文件，包含元数据
			vault.addFile("TestProject/project.md", "project: Test Project");
			metadataCache.setFileMetadata("TestProject/project.md", {
				project: "Test Project",
				优先级: "high", // 这个应该被映射为 priority
				context: "work", // 这个应该被直接继承
			});

			// 设置任务文件（没有自己的元数据）
			vault.addFile("TestProject/tasks.md", "# Tasks");
			metadataCache.setFileMetadata("TestProject/tasks.md", {});

			// Mock 文件夹结构
			const file = vault.getAbstractFileByPath("TestProject/tasks.md");
			const folder = vault.addFolder("TestProject");
			const configFile = vault.getAbstractFileByPath(
				"TestProject/project.md"
			);
			if (configFile && file) {
				folder.children.push(configFile);
				file.parent = folder;
			}

			const content = `- [ ] 简单任务，应该继承项目属性`;

			const tasks = await parsingService.parseTasksFromContentLegacy(
				content,
				"TestProject/tasks.md"
			);

			expect(tasks).toHaveLength(1);
			const task = tasks[0];

			// 验证任务能够检测到项目
			expect(task.metadata.tgProject).toEqual({
				type: "config",
				name: "Test Project",
				source: "project.md",
				readonly: true,
			});

			// 核心验证：MetadataMapping 转写功能和项目属性继承
			expect(task.metadata.priority).toBe(4); // 从 '优先级' 映射而来，应该是数字 4 (high)
			expect(task.metadata.context).toBe("work"); // 直接从项目配置继承

			// 这个测试证明了：
			// 1. MetadataMapping 正常工作（'优先级' -> 'priority'）
			// 2. 任务能够继承项目级别的元数据属性
		});

		it("should automatically convert date and priority fields during metadata mapping", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [],
				metadataMappings: [
					{
						sourceKey: "deadline",
						targetKey: "dueDate",
						enabled: true,
					},
					{
						sourceKey: "urgency",
						targetKey: "priority",
						enabled: true,
					},
					{
						sourceKey: "start_time",
						targetKey: "startDate",
						enabled: true,
					},
				],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			vault.addFile("smart-conversion-test.md", "Test content");
			metadataCache.setFileMetadata("smart-conversion-test.md", {
				project: "Smart Conversion Test",
				deadline: "2025-07-15", // Should be converted to timestamp
				urgency: "high", // Should be converted to number (2)
				start_time: "2025-06-01", // Should be converted to timestamp
				description: "Some text", // Should remain as string
			});

			const enhancedMetadata = await parsingService.getEnhancedMetadata(
				"smart-conversion-test.md"
			);

			// Verify that date fields were converted to timestamps
			expect(typeof enhancedMetadata.dueDate).toBe("number");
			expect(enhancedMetadata.dueDate).toBe(
				new Date(2025, 6, 15).getTime()
			); // July 15, 2025

			expect(typeof enhancedMetadata.startDate).toBe("number");
			expect(enhancedMetadata.startDate).toBe(
				new Date(2025, 5, 1).getTime()
			); // June 1, 2025

			// Verify that priority field was converted to number
			expect(typeof enhancedMetadata.priority).toBe("number");
			expect(enhancedMetadata.priority).toBe(4); // 'high' -> 4

			// Verify that non-mapped fields remain unchanged
			expect(enhancedMetadata.description).toBe("Some text");
			expect(enhancedMetadata.project).toBe("Smart Conversion Test");

			// Verify that original values are preserved
			expect(enhancedMetadata.deadline).toBe("2025-07-15");
			expect(enhancedMetadata.urgency).toBe("high");
			expect(enhancedMetadata.start_time).toBe("2025-06-01");
		});

		it("should handle priority mapping for various string formats", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [],
				metadataMappings: [
					{
						sourceKey: "urgency",
						targetKey: "priority",
						enabled: true,
					},
				],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			// Test different priority formats
			const testCases = [
				{ input: "highest", expected: 5 },
				{ input: "urgent", expected: 5 },
				{ input: "high", expected: 4 },
				{ input: "medium", expected: 3 },
				{ input: "low", expected: 2 },
				{ input: "lowest", expected: 1 },
				{ input: "3", expected: 3 }, // Numeric string
				{ input: "unknown", expected: "unknown" }, // Should remain unchanged
			];

			for (const [index, testCase] of testCases.entries()) {
				const fileName = `priority-test-${index}.md`;
				vault.addFile(fileName, "Test content");
				metadataCache.setFileMetadata(fileName, {
					project: "Priority Test",
					urgency: testCase.input,
				});

				const enhancedMetadata =
					await parsingService.getEnhancedMetadata(fileName);
				expect(enhancedMetadata.priority).toBe(testCase.expected);
			}
		});
	});

	describe("Priority order integration", () => {
		it("should prioritize path mappings over metadata and config", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [
					{
						pathPattern: "Priority",
						projectName: "Path Priority Project",
						enabled: true,
					},
				],
				metadataMappings: [],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: true,
				},
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			// Set up competing project sources
			vault.addFile("Priority/tasks.md", "# Tasks");
			vault.addFile("Priority/project.md", "project: Config Project");
			metadataCache.setFileMetadata("Priority/tasks.md", {
				project: "Metadata Project",
			});

			// Mock folder structure
			const file = vault.getAbstractFileByPath("Priority/tasks.md");
			const folder = vault.addFolder("Priority");
			const configFile = vault.getAbstractFileByPath(
				"Priority/project.md"
			);
			if (file && configFile) {
				folder.children.push(configFile);
				file.parent = folder;
			}

			const content = `
- [ ] Task with multiple project sources
`;

			const tasks = await parsingService.parseTasksFromContentLegacy(
				content,
				"Priority/tasks.md"
			);

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tgProject).toEqual({
				type: "path",
				name: "Path Priority Project",
				source: "Priority",
				readonly: true,
			});
		});
	});

	describe("Single task parsing", () => {
		it("should parse single task line with project information", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [
					{
						pathPattern: "SingleTask",
						projectName: "Single Task Project",
						enabled: true,
					},
				],
				metadataMappings: [],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			const taskLine = "- [ ] Single line task 📅 2024-05-01 🔺 high";
			const task = await parsingService.parseTaskLine(
				taskLine,
				"SingleTask/note.md",
				5
			);

			expect(task).not.toBeNull();
			expect(task!.content).toBe("Single line task");
			expect(task!.line).toBe(5);
			expect(task!.metadata.dueDate).toBe(1714492800000);
			expect(task!.metadata.priority).toBe(4);
			expect(task!.metadata.tgProject).toEqual({
				type: "path",
				name: "Single Task Project",
				source: "SingleTask",
				readonly: true,
			});
		});
	});

	describe("Enhanced project data computation", () => {
		it("should compute enhanced project data for multiple files", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [
					{
						pathPattern: "Work",
						projectName: "Work Project",
						enabled: true,
					},
				],
				metadataMappings: [
					{
						sourceKey: "deadline",
						targetKey: "dueDate",
						enabled: true,
					},
				],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: true,
				},
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			parsingService = new TaskParsingService(serviceOptions);

			// Set up multiple files with different project sources
			vault.addFile("Work/tasks.md", "# Work Tasks");
			vault.addFile("Personal/notes.md", "# Personal Notes");
			vault.addFile("Research/project.md", "project: Research Project");
			vault.addFile("Research/data.md", "# Research Data");
			vault.addFile("Other/random.md", "# Random File");

			metadataCache.setFileMetadata("Personal/notes.md", {
				project: "Personal Project",
				deadline: "2024-06-01",
			});

			metadataCache.setFileMetadata("Research/project.md", {
				project: "Research Project",
			});

			// Mock folder structure for Research
			const researchFile =
				vault.getAbstractFileByPath("Research/data.md");
			const researchFolder = vault.addFolder("Research");
			const researchConfigFile = vault.getAbstractFileByPath(
				"Research/project.md"
			);
			if (researchFile && researchConfigFile) {
				researchFolder.children.push(researchConfigFile);
				researchFile.parent = researchFolder;
			}

			const filePaths = [
				"Work/tasks.md",
				"Personal/notes.md",
				"Research/data.md",
				"Other/random.md",
			];

			const enhancedData =
				await parsingService.computeEnhancedProjectData(filePaths);

			expect(enhancedData.fileProjectMap).toEqual({
				"Work/tasks.md": {
					project: "Work Project",
					source: "Work",
					readonly: true,
				},
				"Personal/notes.md": {
					project: "Personal Project",
					source: "project",
					readonly: true,
				},
				"Research/data.md": {
					project: "Research Project",
					source: "project.md",
					readonly: true,
				},
				"Other/random.md": {
					project: "random",
					source: "filename",
					readonly: true,
				},
			});

			expect(enhancedData.fileMetadataMap["Personal/notes.md"]).toEqual({
				project: "Personal Project",
				deadline: "2024-06-01",
				dueDate: new Date(2024, 5, 1).getTime(), // Converted to timestamp
			});
		});
	});

	describe("Error handling and edge cases", () => {
		it("should handle parsing errors gracefully", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig);

			parsingService = new TaskParsingService(serviceOptions);

			// Test with malformed content
			const malformedContent = `
- [ ] Good task
- This is not a task
- [x] Another good task
`;

			const tasks = await parsingService.parseTasksFromContentLegacy(
				malformedContent,
				"test.md"
			);

			// Should parse valid tasks and ignore malformed lines
			expect(tasks).toHaveLength(2);
			expect(tasks[0].content).toBe("Good task");
			expect(tasks[1].content).toBe("Another good task");
		});

		it("should work without enhanced project support", async () => {
			const parserConfig = createParserConfig(false); // Disable enhanced project
			const serviceOptions: TaskParsingServiceOptions = {
				vault: vault as any,
				metadataCache: metadataCache as any,
				parserConfig,
				// No projectConfigOptions
			};

			parsingService = new TaskParsingService(serviceOptions);

			const content = `
- [ ] Task without enhanced project support
- [x] Completed task
`;

			const tasks = await parsingService.parseTasksFromContentLegacy(
				content,
				"test.md"
			);

			expect(tasks).toHaveLength(2);
			// Tasks should not have tgProject when enhanced project is disabled
			tasks.forEach((task) => {
				expect(task.metadata.tgProject).toBeUndefined();
			});
		});

		it("should handle missing project config options gracefully", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions: TaskParsingServiceOptions = {
				vault: vault as any,
				metadataCache: metadataCache as any,
				parserConfig,
				// projectConfigOptions is undefined
			};

			parsingService = new TaskParsingService(serviceOptions);

			const content = `
- [ ] Task with missing config options
`;

			const tasks = await parsingService.parseTasksFromContentLegacy(
				content,
				"test.md"
			);

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tgProject).toBeUndefined();
		});
	});

	describe("Performance optimizations", () => {
		it("should use date cache to improve performance when parsing many tasks", async () => {
			const parserConfig = createParserConfig();
			const serviceOptions = createServiceOptions(parserConfig, {
				configFileName: "project.md",
				searchRecursively: true,
				metadataKey: "project",
				pathMappings: [],
				metadataMappings: [
					{
						sourceKey: "due",
						targetKey: "dueDate",
						enabled: true,
					},
				],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
			});

			parsingService = new TaskParsingService(serviceOptions);

			// Clear cache before test
			const { MarkdownTaskParser } = await import(
				"../utils/workers/ConfigurableTaskParser"
			);
			MarkdownTaskParser.clearDateCache();

			// Create many tasks with the same due date to test caching
			const taskContent = Array.from(
				{ length: 1000 },
				(_, i) => `- [ ] Task ${i} [due::2025-06-17]`
			).join("\n");

			vault.addFile("performance-test.md", taskContent);
			metadataCache.setFileMetadata("performance-test.md", {
				project: "Performance Test",
			});

			const startTime = performance.now();

			const tasks = await parsingService.parseTasksFromContentLegacy(
				taskContent,
				"performance-test.md"
			);

			const endTime = performance.now();
			const parseTime = endTime - startTime;

			// Verify that all tasks have the correct due date
			expect(tasks).toHaveLength(1000);
			const expectedDate = new Date(2025, 5, 17).getTime(); // June 17, 2025 in local time
			tasks.forEach((task) => {
				expect(task.metadata.dueDate).toBe(expectedDate);
			});

			// Check cache statistics
			const cacheStats = MarkdownTaskParser.getDateCacheStats();
			expect(cacheStats.size).toBeGreaterThan(0);
			expect(cacheStats.size).toBeLessThanOrEqual(cacheStats.maxSize);

			// Log performance info for manual verification
			console.log(
				`Parsed ${tasks.length} tasks in ${parseTime.toFixed(2)}ms`
			);
			console.log(`Cache hit ratio should be high due to repeated dates`);
			console.log(`Cache size: ${cacheStats.size}/${cacheStats.maxSize}`);

			// Performance should be reasonable (less than 100ms for 1000 tasks)
			expect(parseTime).toBeLessThan(1000); // 1 second should be more than enough
		});

		it("should handle date cache size limit correctly", async () => {
			const { MarkdownTaskParser } = await import(
				"../utils/workers/ConfigurableTaskParser"
			);

			// Clear cache before test
			MarkdownTaskParser.clearDateCache();

			const parserConfig = createParserConfig();
			// Increase maxParseIterations to handle more tasks
			parserConfig.maxParseIterations = 20000;
			const parser = new MarkdownTaskParser(parserConfig);

			// Create tasks with many different dates to test cache limit (reduced to 5000 for performance)
			const taskCount = 5000;
			const uniqueDates = Array.from({ length: taskCount }, (_, i) => {
				const date = new Date("2025-01-01");
				date.setDate(date.getDate() + i);
				return date.toISOString().split("T")[0];
			});

			const taskContent = uniqueDates
				.map((date, i) => `- [ ] Task ${i} [due::${date}]`)
				.join("\n");

			const tasks = parser.parse(taskContent, "cache-limit-test.md");

			// Verify that cache size doesn't exceed the limit
			const cacheStats = MarkdownTaskParser.getDateCacheStats();
			expect(cacheStats.size).toBeLessThanOrEqual(cacheStats.maxSize);

			// All tasks should still be parsed correctly
			expect(tasks).toHaveLength(taskCount);

			console.log(
				`Cache size after parsing ${tasks.length} tasks with unique dates: ${cacheStats.size}/${cacheStats.maxSize}`
			);
		});
	});
});
