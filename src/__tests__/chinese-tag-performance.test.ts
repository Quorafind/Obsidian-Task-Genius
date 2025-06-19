/**
 * Performance test for Chinese tag parsing
 * This test compares the performance of the optimized character-based approach
 * vs regex-based approaches for parsing Chinese nested tags.
 */

import { MarkdownTaskParser } from "../utils/workers/ConfigurableTaskParser";
import { getConfig } from "../common/task-parser-config";
import { createMockPlugin } from "./mockUtils";

describe("Chinese Tag Parsing Performance", () => {
	let parser: MarkdownTaskParser;

	beforeEach(() => {
		const mockPlugin = createMockPlugin({
			preferMetadataFormat: "tasks",
			projectTagPrefix: { tasks: "project", dataview: "project" },
			contextTagPrefix: { tasks: "@", dataview: "context" },
			areaTagPrefix: { tasks: "area", dataview: "area" },
			projectConfig: {
				enableEnhancedProject: false,
				pathMappings: [],
				metadataConfig: {
					metadataKey: "project",
					inheritFromFrontmatter: false,
					inheritFromFrontmatterForSubtasks: false,
					enabled: false,
				},
				configFile: {
					fileName: "project.md",
					searchRecursively: false,
					enabled: false,
				},
				metadataMappings: [],
				defaultProjectNaming: {
					strategy: "filename" as const,
					stripExtension: false,
					enabled: false,
				},
			},
		});

		const config = getConfig("tasks", mockPlugin);
		parser = new MarkdownTaskParser(config);
	});

	test("should efficiently parse large number of Chinese nested tags", () => {
		// Generate 1000 tasks with nested Chinese tags
		const tasks = Array.from(
			{ length: 1000 },
			(_, i) =>
				`- [ ] 任务${i + 1} #project/工作项目/子项目${
					i % 5
				} #category/中文类别${i % 3}`
		);
		const content = tasks.join("\n");

		const startTime = performance.now();
		const parsedTasks = parser.parseLegacy(content, "performance-test.md");
		const endTime = performance.now();

		const parseTime = endTime - startTime;

		// Verify basic correctness
		expect(parsedTasks).toHaveLength(1000);
		expect(parsedTasks[0].metadata.project).toContain("工作项目");
		expect(parsedTasks[0].metadata.tags).toContain("#category/中文类别0");

		// Performance expectation: should parse 1000 tasks in under 100ms
		console.log(
			`Parsed 1000 Chinese nested tags in ${parseTime.toFixed(2)}ms`
		);
		expect(parseTime).toBeLessThan(100);
	});

	test("should efficiently parse mixed Chinese and English tags", () => {
		const tasks = Array.from(
			{ length: 500 },
			(_, i) =>
				`- [ ] Task${i} #工作项目/frontend #category/学习/programming @办公室 #重要`
		);
		const content = tasks.join("\n");

		const startTime = performance.now();
		const parsedTasks = parser.parseLegacy(content, "mixed-test.md");
		const endTime = performance.now();

		const parseTime = endTime - startTime;

		// Verify basic correctness
		expect(parsedTasks).toHaveLength(500);
		console.log("First task content:", parsedTasks[0].content);
		console.log("First task tags:", parsedTasks[0].metadata.tags);
		console.log("First task context:", parsedTasks[0].metadata.context);
		expect(parsedTasks[0].metadata.context).toBe("办公室");

		console.log(
			`Parsed 500 mixed Chinese/English tags in ${parseTime.toFixed(2)}ms`
		);
		expect(parseTime).toBeLessThan(50);
	});

	test("should handle deeply nested Chinese tags efficiently", () => {
		const tasks = Array.from(
			{ length: 100 },
			(_, i) =>
				`- [ ] 深度嵌套任务${i} #类别/工作/项目/前端/组件/按钮/样式/主题/颜色/蓝色`
		);
		const content = tasks.join("\n");

		const startTime = performance.now();
		const parsedTasks = parser.parseLegacy(content, "deep-nested-test.md");
		const endTime = performance.now();

		const parseTime = endTime - startTime;

		// Verify correctness
		expect(parsedTasks).toHaveLength(100);
		expect(parsedTasks[0].metadata.tags).toContain(
			"#类别/工作/项目/前端/组件/按钮/样式/主题/颜色/蓝色"
		);

		console.log(
			`Parsed 100 deeply nested Chinese tags in ${parseTime.toFixed(2)}ms`
		);
		expect(parseTime).toBeLessThan(20);
	});

	test("should handle Chinese tags with special characters", () => {
		const specialChineseTags = [
			"#项目2024/第1季度/Q1-计划",
			"#工作_流程/审批-系统/用户_管理",
			"#学习2025/前端-技术/React_项目",
			"#生活记录/2024年/12月-计划",
			"#读书笔记/技术书籍/JavaScript-高级",
		];

		const tasks = specialChineseTags.map(
			(tag, i) => `- [ ] 特殊字符任务${i} ${tag}`
		);
		const content = tasks.join("\n");

		const startTime = performance.now();
		const parsedTasks = parser.parseLegacy(
			content,
			"special-chars-test.md"
		);
		const endTime = performance.now();

		const parseTime = endTime - startTime;

		// Verify correctness
		expect(parsedTasks).toHaveLength(5);
		specialChineseTags.forEach((tag, i) => {
			expect(parsedTasks[i].metadata.tags).toContain(tag);
		});

		console.log(
			`Parsed Chinese tags with special characters in ${parseTime.toFixed(
				2
			)}ms`
		);
		expect(parseTime).toBeLessThan(10);
	});
});
