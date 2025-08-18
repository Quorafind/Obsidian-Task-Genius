/**
 * Tests for Project Source Display Issues
 *
 * This test file verifies that project sources are correctly identified and displayed:
 * 1. Metadata-based projects show as "metadata" type, not "config"
 * 2. Config file-based projects show as "config" type
 * 3. Path-based projects show as "path" type
 * 4. The backup determineTgProject method in ConfigurableTaskParser works correctly
 */

import { MarkdownTaskParser } from "../dataflow/core/ConfigurableTaskParser";
import { TaskParserConfig, MetadataParseMode } from "../types/TaskParserConfig";

// Mock Obsidian types
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

describe("Project Source Display", () => {
	let parser: MarkdownTaskParser;
	let defaultConfig: TaskParserConfig;

	beforeEach(() => {
		defaultConfig = {
			parseMetadata: true,
			metadataParseMode: MetadataParseMode.Both,
			parseTags: true,
			parseComments: true,
			parseHeadings: true,
			maxIndentSize: 8,
			maxParseIterations: 100000,
			maxMetadataIterations: 10,
			maxTagLength: 100,
			maxEmojiValueLength: 200,
			maxStackOperations: 4000,
			maxStackSize: 1000,
			emojiMapping: {
				"🔺": "priority",
				"⏫": "priority",
				"🔼": "priority",
				"🔽": "priority",
				"⏬": "priority",
			},
			specialTagPrefixes: {
				due: "dueDate",
				start: "startDate",
				scheduled: "scheduledDate",
			},
			statusMapping: {
				todo: " ",
				done: "x",
				cancelled: "-",
				forwarded: ">",
				scheduled: "<",
				question: "?",
				important: "!",
				star: "*",
				quote: '"',
				location: "l",
				bookmark: "b",
				information: "i",
				savings: "S",
				idea: "I",
				pros: "p",
				cons: "c",
				fire: "f",
				key: "k",
				win: "w",
				up: "u",
				down: "d",
			},
			projectConfig: {
				enableEnhancedProject: true,
				metadataConfig: {
					enabled: true,
					metadataKey: "projectName",
					
					
				},
				configFile: {
					enabled: true,
					fileName: "project.md",
					searchRecursively: false,
				},
				pathMappings: [],
				metadataMappings: [],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
			},
		};

		parser = new MarkdownTaskParser(defaultConfig);
	});

	describe("Metadata-based Project Detection", () => {
		it("should correctly identify metadata-based projects with type 'metadata'", () => {
			const taskContent = "- [ ] Test task";
			const filePath = "test.md";
			const fileMetadata = {
				projectName: "MyMetadataProject",
				priority: 3,
			};

			const tasks = parser.parse(taskContent, filePath, fileMetadata);

			expect(tasks).toHaveLength(1);
			const task = tasks[0];
			expect(task.tgProject).toBeDefined();
			expect(task.tgProject?.type).toBe("metadata");
			expect(task.tgProject?.name).toBe("MyMetadataProject");
			expect(task.tgProject?.source).toBe("projectName");
		});

		it("should NOT detect metadata projects when metadata detection is disabled", () => {
			// Disable metadata detection
			const configWithDisabledMetadata = {
				...defaultConfig,
				projectConfig: {
					...defaultConfig.projectConfig!,
					metadataConfig: {
						...defaultConfig.projectConfig!.metadataConfig,
						enabled: false, // DISABLED
					},
				},
			};

			parser = new MarkdownTaskParser(configWithDisabledMetadata);

			const taskContent = "- [ ] Test task";
			const filePath = "test.md";
			const fileMetadata = {
				projectName: "MyMetadataProject",
				priority: 3,
			};

			const tasks = parser.parse(taskContent, filePath, fileMetadata);

			expect(tasks).toHaveLength(1);
			const task = tasks[0];
			expect(task.tgProject).toBeUndefined();
		});

		it("should use correct metadata key for project detection", () => {
			// Use custom metadata key
			const configWithCustomKey = {
				...defaultConfig,
				projectConfig: {
					...defaultConfig.projectConfig!,
					metadataConfig: {
						...defaultConfig.projectConfig!.metadataConfig,
						metadataKey: "customProject",
					},
				},
			};

			parser = new MarkdownTaskParser(configWithCustomKey);

			const taskContent = "- [ ] Test task";
			const filePath = "test.md";
			const fileMetadata = {
				customProject: "CustomKeyProject",
				projectName: "ShouldBeIgnored", // This should be ignored
			};

			const tasks = parser.parse(taskContent, filePath, fileMetadata);

			expect(tasks).toHaveLength(1);
			const task = tasks[0];
			expect(task.tgProject).toBeDefined();
			expect(task.tgProject?.type).toBe("metadata");
			expect(task.tgProject?.name).toBe("CustomKeyProject");
			expect(task.tgProject?.source).toBe("customProject");
		});
	});

	describe("Config File-based Project Detection", () => {
		it("should correctly identify config file-based projects with type 'config'", () => {
			const taskContent = "- [ ] Test task";
			const filePath = "folder/test.md";
			const projectConfigData = {
				project: "MyConfigProject",
				description: "Test project from config",
			};

			const tasks = parser.parse(
				taskContent,
				filePath,
				undefined,
				projectConfigData
			);

			expect(tasks).toHaveLength(1);
			const task = tasks[0];
			expect(task.tgProject).toBeDefined();
			expect(task.tgProject?.type).toBe("config");
			expect(task.tgProject?.name).toBe("MyConfigProject");
			expect(task.tgProject?.source).toBe("project.md");
		});

		it("should NOT detect config file projects when config file detection is disabled", () => {
			// Disable config file detection
			const configWithDisabledConfigFile = {
				...defaultConfig,
				projectConfig: {
					...defaultConfig.projectConfig!,
					configFile: {
						...defaultConfig.projectConfig!.configFile,
						enabled: false, // DISABLED
					},
				},
			};

			parser = new MarkdownTaskParser(configWithDisabledConfigFile);

			const taskContent = "- [ ] Test task";
			const filePath = "folder/test.md";
			const projectConfigData = {
				project: "MyConfigProject",
				description: "Test project from config",
			};

			const tasks = parser.parse(
				taskContent,
				filePath,
				undefined,
				projectConfigData
			);

			expect(tasks).toHaveLength(1);
			const task = tasks[0];
			expect(task.tgProject).toBeUndefined();
		});
	});

	describe("Path-based Project Detection", () => {
		it("should correctly identify path-based projects with type 'path'", () => {
			// Enable path mapping
			const configWithPathMapping = {
				...defaultConfig,
				projectConfig: {
					...defaultConfig.projectConfig!,
					pathMappings: [
						{
							pathPattern: "projects/",
							projectName: "MyPathProject",
							enabled: true,
						},
					],
				},
			};

			parser = new MarkdownTaskParser(configWithPathMapping);

			const taskContent = "- [ ] Test task";
			const filePath = "projects/subfolder/test.md";

			const tasks = parser.parse(taskContent, filePath);

			expect(tasks).toHaveLength(1);
			const task = tasks[0];
			expect(task.tgProject).toBeDefined();
			expect(task.tgProject?.type).toBe("path");
			expect(task.tgProject?.name).toBe("MyPathProject");
			expect(task.tgProject?.source).toBe("projects/");
		});

		it("should NOT detect path projects when path mapping is disabled", () => {
			// Disable path mapping
			const configWithDisabledPathMapping = {
				...defaultConfig,
				projectConfig: {
					...defaultConfig.projectConfig!,
					pathMappings: [
						{
							pathPattern: "projects/",
							projectName: "MyPathProject",
							enabled: false, // DISABLED
						},
					],
				},
			};

			parser = new MarkdownTaskParser(configWithDisabledPathMapping);

			const taskContent = "- [ ] Test task";
			const filePath = "projects/subfolder/test.md";

			const tasks = parser.parse(taskContent, filePath);

			expect(tasks).toHaveLength(1);
			const task = tasks[0];
			expect(task.tgProject).toBeUndefined();
		});
	});

	describe("Project Detection Priority", () => {
		it("should prioritize path > metadata > config file", () => {
			// Enable all detection methods
			const configWithAllMethods = {
				...defaultConfig,
				projectConfig: {
					...defaultConfig.projectConfig!,
					pathMappings: [
						{
							pathPattern: "projects/",
							projectName: "PathProject",
							enabled: true,
						},
					],
					metadataConfig: {
						...defaultConfig.projectConfig!.metadataConfig,
						enabled: true,
					},
					configFile: {
						...defaultConfig.projectConfig!.configFile,
						enabled: true,
					},
				},
			};

			parser = new MarkdownTaskParser(configWithAllMethods);

			const taskContent = "- [ ] Test task";
			const filePath = "projects/test.md";
			const fileMetadata = {
				projectName: "MetadataProject",
			};
			const projectConfigData = {
				project: "ConfigProject",
			};

			const tasks = parser.parse(
				taskContent,
				filePath,
				fileMetadata,
				projectConfigData
			);

			expect(tasks).toHaveLength(1);
			const task = tasks[0];
			expect(task.tgProject).toBeDefined();
			expect(task.tgProject?.type).toBe("path"); // Should prioritize path
			expect(task.tgProject?.name).toBe("PathProject");
		});

		it("should fall back to metadata when path is disabled", () => {
			// Disable path mapping, enable metadata and config
			const configWithMetadataFallback = {
				...defaultConfig,
				projectConfig: {
					...defaultConfig.projectConfig!,
					pathMappings: [
						{
							pathPattern: "projects/",
							projectName: "PathProject",
							enabled: false, // DISABLED
						},
					],
					metadataConfig: {
						...defaultConfig.projectConfig!.metadataConfig,
						enabled: true,
					},
					configFile: {
						...defaultConfig.projectConfig!.configFile,
						enabled: true,
					},
				},
			};

			parser = new MarkdownTaskParser(configWithMetadataFallback);

			const taskContent = "- [ ] Test task";
			const filePath = "projects/test.md";
			const fileMetadata = {
				projectName: "MetadataProject",
			};
			const projectConfigData = {
				project: "ConfigProject",
			};

			const tasks = parser.parse(
				taskContent,
				filePath,
				fileMetadata,
				projectConfigData
			);

			expect(tasks).toHaveLength(1);
			const task = tasks[0];
			expect(task.tgProject).toBeDefined();
			expect(task.tgProject?.type).toBe("metadata"); // Should fall back to metadata
			expect(task.tgProject?.name).toBe("MetadataProject");
		});

		it("should fall back to config file when both path and metadata are disabled", () => {
			// Disable path and metadata, enable config file
			const configWithConfigFallback = {
				...defaultConfig,
				projectConfig: {
					...defaultConfig.projectConfig!,
					pathMappings: [
						{
							pathPattern: "projects/",
							projectName: "PathProject",
							enabled: false, // DISABLED
						},
					],
					metadataConfig: {
						...defaultConfig.projectConfig!.metadataConfig,
						enabled: false, // DISABLED
					},
					configFile: {
						...defaultConfig.projectConfig!.configFile,
						enabled: true,
					},
				},
			};

			parser = new MarkdownTaskParser(configWithConfigFallback);

			const taskContent = "- [ ] Test task";
			const filePath = "projects/test.md";
			const fileMetadata = {
				projectName: "MetadataProject",
			};
			const projectConfigData = {
				project: "ConfigProject",
			};

			const tasks = parser.parse(
				taskContent,
				filePath,
				fileMetadata,
				projectConfigData
			);

			expect(tasks).toHaveLength(1);
			const task = tasks[0];
			expect(task.tgProject).toBeDefined();
			expect(task.tgProject?.type).toBe("config"); // Should fall back to config file
			expect(task.tgProject?.name).toBe("ConfigProject");
		});
	});
});
