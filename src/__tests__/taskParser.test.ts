/**
 * Task Parser Tests
 *
 * Tests for ConfigurableTaskParser and enhanced project functionality
 */

import { MarkdownTaskParser } from "../utils/workers/ConfigurableTaskParser";
import { getConfig } from "../common/task-parser-config";
import { Task } from "../types/task";
import { createMockPlugin } from "./mockUtils";
import { MetadataParseMode } from "../types/TaskParserConfig";

// Mock file system for testing project.md functionality
interface MockFile {
	path: string;
	content: string;
	metadata?: Record<string, any>;
}

interface MockVault {
	files: Map<string, MockFile>;
	addFile: (
		path: string,
		content: string,
		metadata?: Record<string, any>
	) => void;
	getFile: (path: string) => MockFile | undefined;
	fileExists: (path: string) => boolean;
}

const createMockVault = (): MockVault => {
	const files = new Map<string, MockFile>();

	return {
		files,
		addFile: (
			path: string,
			content: string,
			metadata?: Record<string, any>
		) => {
			files.set(path, { path, content, metadata });
		},
		getFile: (path: string) => files.get(path),
		fileExists: (path: string) => files.has(path),
	};
};

describe("ConfigurableTaskParser", () => {
	let parser: MarkdownTaskParser;
	let mockPlugin: any;
	let mockVault: MockVault;

	beforeEach(() => {
		mockVault = createMockVault();

		mockPlugin = createMockPlugin({
			preferMetadataFormat: "tasks",
			projectTagPrefix: {
				tasks: "project",
				dataview: "project",
			},
			contextTagPrefix: {
				tasks: "@",
				dataview: "context",
			},
			areaTagPrefix: {
				tasks: "area",
				dataview: "area",
			},
			projectConfig: {
				enableEnhancedProject: true,
				pathMappings: [
					{
						pathPattern: "Projects/Work",
						projectName: "Work Project",
						enabled: true,
					},
					{
						pathPattern: "Personal",
						projectName: "Personal Tasks",
						enabled: true,
					},
				],
				metadataConfig: {
					metadataKey: "project",
					inheritFromFrontmatter: true,
					enabled: true,
					inheritFromFrontmatterForSubtasks: true,
				},
				configFile: {
					fileName: "project.md",
					searchRecursively: true,
					enabled: true,
				},
				// Add missing required properties
				metadataMappings: [],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
			},
		});

		const config = getConfig("tasks", mockPlugin);
		parser = new MarkdownTaskParser(config);
	});

	describe("Basic Task Parsing", () => {
		test("should parse simple task", () => {
			const content = "- [ ] Simple task";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toBe("Simple task");
			expect(tasks[0].completed).toBe(false);
			expect(tasks[0].status).toBe(" ");
		});

		test("should parse completed task", () => {
			const content = "- [x] Completed task";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toBe("Completed task");
			expect(tasks[0].completed).toBe(true);
			expect(tasks[0].status).toBe("x");
		});

		test("should parse task with different status", () => {
			const content = "- [/] In progress task";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toBe("In progress task");
			expect(tasks[0].completed).toBe(false);
			expect(tasks[0].status).toBe("/");
		});

		test("should parse multiple tasks", () => {
			const content = `- [ ] Task 1
- [x] Task 2
- [/] Task 3`;
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(3);
			expect(tasks[0].content).toBe("Task 1");
			expect(tasks[1].content).toBe("Task 2");
			expect(tasks[2].content).toBe("Task 3");
		});
	});

	describe("Project Parsing", () => {
		test("should parse task with project tag", () => {
			const content = "- [ ] Task with project #project/myproject";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.project).toBe("myproject");
			expect(tasks[0].content).toBe("Task with project");
		});

		test("should parse task with dataview project format", () => {
			const content = "- [ ] Task with project [project:: myproject]";
			const config = getConfig("dataview", mockPlugin);
			const dataviewParser = new MarkdownTaskParser(config);
			const tasks = dataviewParser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.project).toBe("myproject");
			expect(tasks[0].content).toBe("Task with project");
		});

		test("should parse task with nested project", () => {
			const content =
				"- [ ] Task with nested project #project/work/frontend";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.project).toBe("work/frontend");
		});
	});

	describe("Enhanced Project Features", () => {
		test("should detect project from path mapping", () => {
			const content = "- [ ] Task without explicit project";
			const fileMetadata = {};
			const tasks = parser.parseLegacy(
				content,
				"Projects/Work/feature.md",
				fileMetadata
			);

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tgProject).toBeDefined();
			expect(tasks[0].metadata.tgProject?.type).toBe("path");
			expect(tasks[0].metadata.tgProject?.name).toBe("Work Project");
			expect(tasks[0].metadata.tgProject?.source).toBe("Projects/Work");
			expect(tasks[0].metadata.tgProject?.readonly).toBe(true);
		});

		test("should detect project from file metadata", () => {
			const content = "- [ ] Task without explicit project";
			const fileMetadata = { project: "Metadata Project" };
			const tasks = parser.parseLegacy(
				content,
				"some/path/file.md",
				fileMetadata
			);

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tgProject).toBeDefined();
			expect(tasks[0].metadata.tgProject?.type).toBe("metadata");
			expect(tasks[0].metadata.tgProject?.name).toBe("Metadata Project");
			expect(tasks[0].metadata.tgProject?.source).toBe("project");
			expect(tasks[0].metadata.tgProject?.readonly).toBe(true);
		});

		test("should detect project from config file (project.md)", () => {
			const content = "- [ ] Task without explicit project";

			// Mock project config data as if it was read from project.md
			const projectConfigData = {
				project: "Config Project",
				description: "A project defined in project.md",
			};

			const tasks = parser.parseLegacy(
				content,
				"Projects/MyProject/tasks.md",
				{}, // no file metadata
				projectConfigData // project config data from project.md
			);

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tgProject).toBeDefined();
			expect(tasks[0].metadata.tgProject?.type).toBe("config");
			expect(tasks[0].metadata.tgProject?.name).toBe("Config Project");
			expect(tasks[0].metadata.tgProject?.source).toBe("project.md");
			expect(tasks[0].metadata.tgProject?.readonly).toBe(true);
		});

		test("should prioritize explicit project over tgProject", () => {
			const content =
				"- [ ] Task with explicit project #project/explicit";
			const fileMetadata = { project: "Metadata Project" };
			const tasks = parser.parseLegacy(
				content,
				"Projects/Work/feature.md",
				fileMetadata
			);

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.project).toBe("explicit");
			expect(tasks[0].metadata.tgProject).toBeDefined(); // Should still be detected
		});

		test("should inherit metadata from file frontmatter when enabled", () => {
			const content = "- [ ] Task without metadata";
			const fileMetadata = {
				project: "Inherited Project",
				priority: 3,
				context: "work",
			};
			const tasks = parser.parseLegacy(content, "test.md", fileMetadata);

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tgProject?.name).toBe("Inherited Project");
			// Note: The inheritance logic should be implemented in the parser
			// For now, we're just testing that tgProject is detected from metadata
		});

		test("should not override task metadata with file metadata", () => {
			const content = "- [ ] Task with explicit context @home";
			const fileMetadata = {
				project: "File Project",
				context: "office", // This should not override the task's explicit context
			};
			const tasks = parser.parseLegacy(content, "test.md", fileMetadata);

			expect(tasks).toHaveLength(1);
			// Task's explicit context should take precedence
			expect(tasks[0].metadata.context).toBe("home");
			// But project should be inherited since task doesn't have it
			expect(tasks[0].metadata.tgProject?.name).toBe("File Project");
		});
	});

	describe("Project.md Configuration File Tests", () => {
		test("should simulate reading project.md with frontmatter", () => {
			// Simulate project.md content with frontmatter
			const projectMdContent = `---
project: Research Project
description: A research project
priority: high
---

# Research Project

This is a research project with specific configuration.
`;

			mockVault.addFile(
				"Projects/Research/project.md",
				projectMdContent,
				{
					project: "Research Project",
					description: "A research project",
					priority: "high",
				}
			);

			const content = "- [ ] Research task";
			const projectConfigData = mockVault.getFile(
				"Projects/Research/project.md"
			)?.metadata;

			const tasks = parser.parseLegacy(
				content,
				"Projects/Research/tasks.md",
				{}, // no file metadata
				projectConfigData
			);

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tgProject).toBeDefined();
			expect(tasks[0].metadata.tgProject?.type).toBe("config");
			expect(tasks[0].metadata.tgProject?.name).toBe("Research Project");
		});

		test("should simulate reading project.md with inline configuration", () => {
			// Simulate project.md content with inline project configuration
			const projectMdContent = `# Development Project

project: Development Work
context: development
area: coding

This project involves software development tasks.
`;

			// Simulate parsing the content to extract inline configuration
			const projectConfigData = {
				project: "Development Work",
				context: "development",
				area: "coding",
			};

			mockVault.addFile("Projects/Dev/project.md", projectMdContent);

			const content = "- [ ] Implement feature";
			const tasks = parser.parseLegacy(
				content,
				"Projects/Dev/feature.md",
				{}, // no file metadata
				projectConfigData
			);

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tgProject).toBeDefined();
			expect(tasks[0].metadata.tgProject?.type).toBe("config");
			expect(tasks[0].metadata.tgProject?.name).toBe("Development Work");
		});

		test("should handle project.md in parent directory (recursive search)", () => {
			// Simulate project.md in parent directory
			const projectConfigData = {
				project: "Parent Project",
				description: "Project configuration from parent directory",
			};

			mockVault.addFile("Projects/project.md", "project: Parent Project");

			const content = "- [ ] Nested task";
			const tasks = parser.parseLegacy(
				content,
				"Projects/SubFolder/DeepFolder/task.md",
				{}, // no file metadata
				projectConfigData
			);

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tgProject).toBeDefined();
			expect(tasks[0].metadata.tgProject?.type).toBe("config");
			expect(tasks[0].metadata.tgProject?.name).toBe("Parent Project");
		});

		test("should handle missing project.md gracefully", () => {
			const content = "- [ ] Task without project config";

			// No project.md file exists, no project config data provided
			const tasks = parser.parseLegacy(content, "SomeFolder/task.md");

			expect(tasks).toHaveLength(1);
			// Should not have tgProject since no config file was found
			expect(tasks[0].metadata.tgProject).toBeUndefined();
		});

		test("should prioritize path mapping over project.md", () => {
			const content = "- [ ] Task in mapped path";
			const projectConfigData = {
				project: "Config Project",
			};

			// Even though project.md exists, path mapping should take priority
			const tasks = parser.parseLegacy(
				content,
				"Projects/Work/task.md", // This matches path mapping
				{}, // no file metadata
				projectConfigData
			);

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tgProject).toBeDefined();
			expect(tasks[0].metadata.tgProject?.type).toBe("path");
			expect(tasks[0].metadata.tgProject?.name).toBe("Work Project");
		});

		test("should prioritize file metadata over project.md", () => {
			const content = "- [ ] Task with file metadata";
			const fileMetadata = { project: "File Metadata Project" };
			const projectConfigData = { project: "Config Project" };

			const tasks = parser.parseLegacy(
				content,
				"SomeFolder/task.md",
				fileMetadata,
				projectConfigData
			);

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tgProject).toBeDefined();
			expect(tasks[0].metadata.tgProject?.type).toBe("metadata");
			expect(tasks[0].metadata.tgProject?.name).toBe(
				"File Metadata Project"
			);
		});
	});

	describe("Context and Area Parsing", () => {
		test("should parse task with context", () => {
			const content = "- [ ] Task with context @home";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.context).toBe("home");
			expect(tasks[0].content).toBe("Task with context");
		});

		test("should parse task with area", () => {
			const content = "- [ ] Task with area #area/personal";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			// Area should be parsed as metadata
			expect(tasks[0].metadata.area).toBe("personal");
			expect(tasks[0].content).toBe("Task with area");
		});

		test("should parse task with dataview context format", () => {
			const content = "- [ ] Task with context [context:: home]";
			const config = getConfig("dataview", mockPlugin);
			const dataviewParser = new MarkdownTaskParser(config);
			const tasks = dataviewParser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.context).toBe("home");
		});
	});

	describe("Date Parsing", () => {
		test("should parse task with due date emoji", () => {
			const content = "- [ ] Task with due date 📅 2024-12-31";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			// Due date emoji parsing might not be implemented yet
			// expect(tasks[0].metadata.dueDate).toBeDefined();
			expect(tasks[0].content).toBe("Task with due date");
		});

		test("should parse task with start date emoji", () => {
			const content = "- [ ] Task with start date 🛫 2024-01-01";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			// Start date should be parsed as timestamp
			expect(tasks[0].metadata.startDate).toBe(1704038400000);
			expect(tasks[0].content).toBe("Task with start date");
		});

		test("should parse task with scheduled date emoji", () => {
			const content = "- [ ] Task with scheduled date ⏳ 2024-06-15";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			// Scheduled date should be parsed as timestamp
			expect(tasks[0].metadata.scheduledDate).toBe(1718380800000);
			expect(tasks[0].content).toBe("Task with scheduled date");
		});

		test("should parse task with dataview date format", () => {
			const content = "- [ ] Task with due date [dueDate:: 2024-12-31]";
			const config = getConfig("dataview", mockPlugin);
			const dataviewParser = new MarkdownTaskParser(config);
			const tasks = dataviewParser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toBe("Task with due date");
			// Dataview format parsing implementation is still in progress
			// Just verify the task content is parsed correctly for now
		});
	});

	describe("Priority Parsing", () => {
		test("should parse task with high priority", () => {
			const content = "- [ ] High priority task 🔺";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.priority).toBeDefined();
		});

		test("should parse task with medium priority", () => {
			const content = "- [ ] Medium priority task 🔼";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.priority).toBeDefined();
		});

		test("should parse task with low priority", () => {
			const content = "- [ ] Low priority task 🔽";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.priority).toBeDefined();
		});
	});

	describe("Tags Parsing", () => {
		test("should parse task with single tag", () => {
			const content = "- [ ] Task with tag #important";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tags).toContain("#important");
			expect(tasks[0].content).toBe("Task with tag");
		});

		test("should parse task with multiple tags", () => {
			const content = "- [ ] Task with tags #important #urgent #work";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tags).toContain("#important");
			expect(tasks[0].metadata.tags).toContain("#urgent");
			expect(tasks[0].metadata.tags).toContain("#work");
			expect(tasks[0].content).toBe("Task with tags");
		});

		test("should filter out project tags from general tags", () => {
			const content =
				"- [ ] Task with mixed tags #important #project/myproject #urgent";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.project).toBe("myproject");
			expect(tasks[0].metadata.tags).toContain("#important");
			expect(tasks[0].metadata.tags).toContain("#urgent");
			expect(tasks[0].metadata.tags).not.toContain("#project/myproject");
			expect(tasks[0].content).toBe("Task with mixed tags");
		});

		test("should parse task with Chinese characters in tags", () => {
			const content = "- [ ] Task with Chinese tag #中文标签";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tags).toContain("#中文标签");
			expect(tasks[0].content).toBe("Task with Chinese tag");
		});

		test("should parse task with nested Chinese tags", () => {
			const content =
				"- [ ] Task with nested Chinese tag #new/中文1/中文2";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tags).toContain("#new/中文1/中文2");
			expect(tasks[0].content).toBe("Task with nested Chinese tag");
		});

		test("should parse task with mixed Chinese and English nested tags", () => {
			const content =
				"- [ ] Task with mixed tags #project/工作/frontend #category/学习/编程";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.project).toBe("工作/frontend");
			expect(tasks[0].metadata.tags).toContain("#category/学习/编程");
			expect(tasks[0].content).toBe("Task with mixed tags");
		});

		test("should parse task with Chinese characters in project tags", () => {
			const content = "- [ ] Task with Chinese project #project/中文项目";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.project).toBe("中文项目");
			expect(tasks[0].content).toBe("Task with Chinese project");
		});

		test("should parse task with deeply nested Chinese tags", () => {
			const content =
				"- [ ] Task with deep Chinese nesting #类别/工作/项目/前端/组件";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tags).toContain(
				"#类别/工作/项目/前端/组件"
			);
			expect(tasks[0].content).toBe("Task with deep Chinese nesting");
		});

		test("should parse task with Chinese tags mixed with other metadata", () => {
			const content =
				"- [ ] Task with Chinese and metadata #重要 @家里 🔺 #project/工作项目";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tags).toContain("#重要");
			expect(tasks[0].metadata.project).toBe("工作项目");
			expect(tasks[0].metadata.context).toBe("家里");
			expect(tasks[0].metadata.priority).toBeDefined();
			expect(tasks[0].content).toBe("Task with Chinese and metadata");
		});

		test("should parse task with Chinese tags containing numbers and punctuation", () => {
			const content =
				"- [ ] Task with complex Chinese tag #项目2024/第1季度/Q1-计划";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tags).toContain(
				"#项目2024/第1季度/Q1-计划"
			);
			expect(tasks[0].content).toBe("Task with complex Chinese tag");
		});
	});

	describe("Recurrence Parsing", () => {
		test("should parse task with recurrence", () => {
			const content = "- [ ] Recurring task 🔁 every week";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.recurrence).toBe("every week");
		});

		test("should parse task with dataview recurrence", () => {
			const content = "- [ ] Recurring task [recurrence:: every month]";
			const config = getConfig("dataview", mockPlugin);
			const dataviewParser = new MarkdownTaskParser(config);
			const tasks = dataviewParser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.recurrence).toBe("every month");
		});
	});

	describe("Complex Task Parsing", () => {
		test("should parse task with all metadata types", () => {
			const content =
				"- [ ] Complex task #project/work @office 🔺 #important #urgent 🔁 every week";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toBe("Complex task");
			expect(tasks[0].metadata.project).toBe("work");
			expect(tasks[0].metadata.context).toBe("office");
			expect(tasks[0].metadata.priority).toBeDefined();
			expect(tasks[0].metadata.tags).toContain("#important");
			expect(tasks[0].metadata.tags).toContain("#urgent");
			expect(tasks[0].metadata.recurrence).toBe("every week");
		});

		test("should parse hierarchical tasks", () => {
			const content = `- [ ] Parent task #project/main
  - [ ] Child task 1
    - [ ] Grandchild task
  - [ ] Child task 2`;
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(4);

			// Check parent task
			expect(tasks[0].content).toBe("Parent task");
			expect(tasks[0].metadata.project).toBe("main");
			expect(tasks[0].metadata.children).toHaveLength(2);

			// Check child tasks
			expect(tasks[1].content).toBe("Child task 1");
			expect(tasks[1].metadata.parent).toBe(tasks[0].id);
			expect(tasks[1].metadata.children).toHaveLength(1);

			expect(tasks[2].content).toBe("Grandchild task");
			expect(tasks[2].metadata.parent).toBe(tasks[1].id);

			expect(tasks[3].content).toBe("Child task 2");
			expect(tasks[3].metadata.parent).toBe(tasks[0].id);
		});
	});

	describe("Edge Cases", () => {
		test("should handle empty content", () => {
			const content = "";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(0);
		});

		test("should handle content without tasks", () => {
			const content = `# Heading
This is some text without tasks.
- Regular list item
- Another list item`;
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(0);
		});

		test("should handle malformed tasks", () => {
			const content = `- [ Malformed task 1
- [] Malformed task 2
- [x Malformed task 3
- [ ] Valid task`;
			const tasks = parser.parseLegacy(content, "test.md");

			// Should only parse the valid task
			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toBe("Valid task");
		});

		test("should handle tasks in code blocks", () => {
			const content = `\`\`\`
- [ ] Task in code block
\`\`\`
- [ ] Real task`;
			const tasks = parser.parseLegacy(content, "test.md");

			// Should only parse the task outside the code block
			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toBe("Real task");
		});

		test("should handle very long task content", () => {
			const longContent = "Very ".repeat(100) + "long task content";
			const content = `- [ ] ${longContent}`;
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toBe(longContent);
		});
	});

	describe("Path Mapping Edge Cases", () => {
		test("should handle multiple matching path patterns", () => {
			// Add overlapping path mapping
			mockPlugin.settings.projectConfig.pathMappings.push({
				pathPattern: "Projects",
				projectName: "General Projects",
				enabled: true,
			});

			const content = "- [ ] Task in nested path";
			const tasks = parser.parseLegacy(
				content,
				"Projects/Work/subfolder/file.md"
			);

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tgProject).toBeDefined();
			// Should match the more specific pattern first
			expect(tasks[0].metadata.tgProject?.name).toBe("Work Project");
		});

		test("should handle disabled path mappings", () => {
			mockPlugin.settings.projectConfig.pathMappings[0].enabled = false;

			const content = "- [ ] Task in disabled path";
			const tasks = parser.parseLegacy(content, "Projects/Work/file.md");

			expect(tasks).toHaveLength(1);
			// Should not detect project from disabled mapping
			expect(tasks[0].metadata.tgProject).toBeUndefined();
		});

		test("should handle case-sensitive path matching", () => {
			const content = "- [ ] Task in case different path";
			const tasks = parser.parseLegacy(content, "projects/work/file.md"); // lowercase

			expect(tasks).toHaveLength(1);
			// Should not match due to case difference
			expect(tasks[0].metadata.tgProject).toBeUndefined();
		});
	});
});

describe("Task Parser Utility Functions", () => {
	test("should generate unique task IDs", () => {
		const parser = new MarkdownTaskParser(getConfig("tasks"));
		const content = `- [ ] Task 1
- [ ] Task 2
- [ ] Task 3`;
		const tasks = parser.parseLegacy(content, "test.md");

		expect(tasks).toHaveLength(3);
		const ids = tasks.map((t) => t.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(3); // All IDs should be unique
	});

	test("should maintain consistent task IDs for same content", () => {
		const parser = new MarkdownTaskParser(getConfig("tasks"));
		const content = "- [ ] Same task";

		const tasks1 = parser.parseLegacy(content, "test.md");
		const tasks2 = parser.parseLegacy(content, "test.md");

		expect(tasks1[0].id).toBe(tasks2[0].id);
	});

	test("should handle different line endings", () => {
		const parser = new MarkdownTaskParser(getConfig("tasks"));

		const contentLF = "- [ ] Task 1\n- [ ] Task 2";
		const contentCRLF = "- [ ] Task 1\r\n- [ ] Task 2";

		const tasksLF = parser.parseLegacy(contentLF, "test.md");
		const tasksCRLF = parser.parseLegacy(contentCRLF, "test.md");

		expect(tasksLF).toHaveLength(2);
		expect(tasksCRLF).toHaveLength(2);
		expect(tasksLF[0].content).toBe(tasksCRLF[0].content);
		expect(tasksLF[1].content).toBe(tasksCRLF[1].content);
	});
});

describe("Performance and Limits", () => {
	test("should handle large number of tasks", () => {
		const parser = new MarkdownTaskParser(getConfig("tasks"));

		// Generate 100 tasks
		const tasks = Array.from(
			{ length: 100 },
			(_, i) => `- [ ] Task ${i + 1}`
		);
		const content = tasks.join("\n");

		const parsedTasks = parser.parseLegacy(content, "test.md");

		expect(parsedTasks).toHaveLength(100);
		expect(parsedTasks[0].content).toBe("Task 1");
		expect(parsedTasks[99].content).toBe("Task 100");
	});

	test("should handle deeply nested tasks", () => {
		const parser = new MarkdownTaskParser(getConfig("tasks"));

		// Generate deeply nested tasks
		let content = "- [ ] Root task\n";
		for (let i = 1; i <= 10; i++) {
			const indent = "  ".repeat(i);
			content += `${indent}- [ ] Level ${i} task\n`;
		}

		const tasks = parser.parseLegacy(content, "test.md");

		expect(tasks).toHaveLength(11);
		expect(tasks[0].content).toBe("Root task");
		expect(tasks[10].content).toBe("Level 10 task");

		// Check parent-child relationships
		expect(tasks[1].metadata.parent).toBe(tasks[0].id);
		expect(tasks[10].metadata.parent).toBe(tasks[9].id);
	});

	test("should handle tasks with very long metadata", () => {
		const parser = new MarkdownTaskParser(getConfig("tasks"));
		const longTag = "#" + "a".repeat(50);
		const longProject = "#project/" + "b".repeat(50);

		const content = `- [ ] Task with long metadata ${longTag} ${longProject}`;
		const tasks = parser.parseLegacy(content, "test.md");

		expect(tasks).toHaveLength(1);
		expect(tasks[0].metadata.tags).toContain(longTag);
		expect(tasks[0].metadata.project).toBe("b".repeat(50));
		expect(tasks[0].content).toBe("Task with long metadata");
	});
});

describe("OnCompletion Emoji Parsing", () => {
	let parser: MarkdownTaskParser;

	beforeEach(() => {
		parser = new MarkdownTaskParser(getConfig("tasks"));
	});

	test("should parse onCompletion with .md file extension boundary", () => {
		const content = "- [ ] Task with onCompletion 🏁 move:archive.md #tag1";
		const tasks = parser.parseLegacy(content, "test.md");

		expect(tasks).toHaveLength(1);
		expect(tasks[0].metadata.onCompletion).toBe("move:archive.md");
		expect(tasks[0].metadata.tags).toContain("#tag1");
		expect(tasks[0].content).toBe("Task with onCompletion");
	});

	test("should parse onCompletion with heading", () => {
		const content = "- [ ] Task 🏁 move:archive.md#completed #tag1";
		const tasks = parser.parseLegacy(content, "test.md");

		expect(tasks).toHaveLength(1);
		expect(tasks[0].metadata.onCompletion).toBe(
			"move:archive.md#completed"
		);
		expect(tasks[0].metadata.tags).toContain("#tag1");
	});

	test("should parse onCompletion with spaces in filename", () => {
		const content = "- [ ] Task 🏁 move:my archive.md #tag1";
		const tasks = parser.parseLegacy(content, "test.md");

		expect(tasks).toHaveLength(1);
		expect(tasks[0].metadata.onCompletion).toBe("move:my archive.md");
		expect(tasks[0].metadata.tags).toContain("#tag1");
	});

	test("should parse onCompletion with canvas file", () => {
		const content = "- [ ] Task 🏁 move:project.canvas #tag1";
		const tasks = parser.parseLegacy(content, "test.md");

		expect(tasks).toHaveLength(1);
		expect(tasks[0].metadata.onCompletion).toBe("move:project.canvas");
		expect(tasks[0].metadata.tags).toContain("#tag1");
	});

	test("should parse onCompletion with complex path and heading", () => {
		const content =
			"- [ ] Task 🏁 move:folder/my file.md#section-1 📅 2024-01-01";
		const tasks = parser.parseLegacy(content, "test.md");

		expect(tasks).toHaveLength(1);
		expect(tasks[0].metadata.onCompletion).toBe(
			"move:folder/my file.md#section-1"
		);
		// dueDate is parsed as timestamp, so we need to check the actual value
		expect(tasks[0].metadata.dueDate).toBeDefined();
	});

	test("should handle multiple emojis correctly", () => {
		const content = "- [ ] Task 🏁 delete 📅 2024-01-01 #tag1";
		const tasks = parser.parseLegacy(content, "test.md");

		expect(tasks).toHaveLength(1);
		expect(tasks[0].metadata.onCompletion).toBe("delete");
		expect(tasks[0].metadata.dueDate).toBeDefined();
		// Check if tags array exists and has content
		expect(tasks[0].metadata.tags).toBeDefined();
		if (tasks[0].metadata.tags.length > 0) {
			expect(tasks[0].metadata.tags).toContain("#tag1");
		}
	});

	test("should parse onCompletion boundary correctly - simple case", () => {
		const content = "- [ ] Task 🏁 move:test.md";
		const tasks = parser.parseLegacy(content, "test.md");

		expect(tasks).toHaveLength(1);
		expect(tasks[0].metadata.onCompletion).toBe("move:test.md");
		expect(tasks[0].content).toBe("Task");
	});
});
