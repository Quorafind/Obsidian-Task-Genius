/**
 * Tag Parsing Edge Cases Tests
 * 
 * Tests for improved tag parsing that handles various edge cases:
 * - Links with fragment identifiers
 * - Color codes
 * - Inline code
 * - Complex mixed scenarios
 */

import { MarkdownTaskParser } from "../dataflow/core/ConfigurableTaskParser";
import { getConfig } from "../common/task-parser-config";
import { createMockPlugin } from "./mockUtils";
import { ContextDetector } from "../utils/workers/ContextDetector";

describe("Tag Parsing Edge Cases", () => {
	let parser: MarkdownTaskParser;
	let mockPlugin: any;

	beforeEach(() => {
		mockPlugin = createMockPlugin({
			preferMetadataFormat: "tasks",
			projectTagPrefix: { tasks: "project", dataview: "project" },
			contextTagPrefix: { tasks: "@", dataview: "context" },
			areaTagPrefix: { tasks: "area", dataview: "area" },
			projectConfig: {
				enableEnhancedProject: false,
				pathMappings: [],
				metadataConfig: {
					metadataKey: "project",
					
					
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

	describe("ContextDetector", () => {
		test("should detect Obsidian links", () => {
			const content = "Task with [[Note#heading]] and #real-tag";
			const detector = new ContextDetector(content);
			const ranges = detector.detectAllProtectedRanges();

			expect(ranges).toHaveLength(1);
			expect(ranges[0].type).toBe('obsidian-link');
			expect(ranges[0].content).toBe('[[Note#heading]]');
			expect(ranges[0].start).toBe(10);
			expect(ranges[0].end).toBe(26);
		});

		test("should detect Markdown links", () => {
			const content = "Task with [link text](https://example.com#section) and #real-tag";
			const detector = new ContextDetector(content);
			const ranges = detector.detectAllProtectedRanges();

			expect(ranges).toHaveLength(1);
			expect(ranges[0].type).toBe('markdown-link');
			expect(ranges[0].content).toBe('[link text](https://example.com#section)');
		});

		test("should detect direct URLs", () => {
			const content = "Task with https://example.com#section and #real-tag";
			const detector = new ContextDetector(content);
			const ranges = detector.detectAllProtectedRanges();

			expect(ranges).toHaveLength(1);
			expect(ranges[0].type).toBe('url');
			expect(ranges[0].content).toBe('https://example.com#section');
		});

		test("should detect color codes", () => {
			const content = "Task with color #FF0000 and #real-tag";
			const detector = new ContextDetector(content);
			const ranges = detector.detectAllProtectedRanges();

			expect(ranges).toHaveLength(1);
			expect(ranges[0].type).toBe('color-code');
			expect(ranges[0].content).toBe('#FF0000');
		});

		test("should detect inline code", () => {
			const content = "Task with `#include <stdio.h>` and #real-tag";
			const detector = new ContextDetector(content);
			const ranges = detector.detectAllProtectedRanges();

			expect(ranges).toHaveLength(1);
			expect(ranges[0].type).toBe('inline-code');
			expect(ranges[0].content).toBe('`#include <stdio.h>`');
		});

		test("should find next unprotected hash", () => {
			const content = "Task with [[Note#heading]] and #real-tag";
			const detector = new ContextDetector(content);
			detector.detectAllProtectedRanges();

			const firstHash = detector.findNextUnprotectedHash(0);
			expect(firstHash).toBe(31); // Position of #real-tag
		});
	});

	describe("Link Fragment Protection", () => {
		test("should not treat Obsidian link fragments as tags", () => {
			const testCases = [
				"- [ ] Task with [[Note#heading]] and #real-tag",
				"- [ ] Task with [[中文笔记#中文标题]] and #中文标签",
				"- [ ] Multiple [[Link1#Title1]] [[Link2#Title2]] #tag1 #tag2",
			];

			testCases.forEach((content, index) => {
				const tasks = parser.parseLegacy(content, "test.md");
				expect(tasks).toHaveLength(1);
				
				if (index === 0) {
					expect(tasks[0].content).toContain("[[Note#heading]]");
					expect(tasks[0].metadata.tags).toEqual(["#real-tag"]);
				} else if (index === 1) {
					expect(tasks[0].content).toContain("[[中文笔记#中文标题]]");
					expect(tasks[0].metadata.tags).toEqual(["#中文标签"]);
				} else if (index === 2) {
					expect(tasks[0].content).toContain("[[Link1#Title1]]");
					expect(tasks[0].content).toContain("[[Link2#Title2]]");
					expect(tasks[0].metadata.tags).toEqual(["#tag1", "#tag2"]);
				}
			});
		});

		test("should not treat Markdown link fragments as tags", () => {
			const content = "- [ ] Task with [link](https://example.com#section) and #real-tag";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toContain("[link](https://example.com#section)");
			expect(tasks[0].metadata.tags).toEqual(["#real-tag"]);
		});

		test("should not treat direct URL fragments as tags", () => {
			const content = "- [ ] Task with https://example.com#section and #real-tag";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toContain("https://example.com#section");
			expect(tasks[0].metadata.tags).toEqual(["#real-tag"]);
		});
	});

	describe("Color Code Protection", () => {
		test("should not treat hex color codes as tags", () => {
			const testCases = [
				"- [ ] Task with color #FF0000 and #real-tag",
				"- [ ] Task with color #123456 and #real-tag",
				"- [ ] Task with color #abc and #real-tag",
				"- [ ] Task with color #ABC and #real-tag",
			];

			testCases.forEach(content => {
				const tasks = parser.parseLegacy(content, "test.md");
				expect(tasks).toHaveLength(1);
				expect(tasks[0].metadata.tags).toEqual(["#real-tag"]);
			});
		});

		test("should distinguish between color codes and valid tags", () => {
			const content = "- [ ] Task with #FF0000 #123abc #real-tag #project/work";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toContain("#FF0000");
			expect(tasks[0].content).toContain("#123abc");
			expect(tasks[0].metadata.tags).toEqual(["#real-tag"]);
			expect(tasks[0].metadata.project).toBe("work");
		});
	});

	describe("Inline Code Protection", () => {
		test("should not treat hash symbols in inline code as tags", () => {
			const testCases = [
				"- [ ] Task with `#include <stdio.h>` and #real-tag",
				"- [ ] Task with `#define MAX 100` and #real-tag",
				"- [ ] Task with ``#include `special` `` and #real-tag",
			];

			testCases.forEach(content => {
				const tasks = parser.parseLegacy(content, "test.md");
				expect(tasks).toHaveLength(1);
				expect(tasks[0].metadata.tags).toEqual(["#real-tag"]);
			});
		});
	});

	describe("Complex Mixed Scenarios", () => {
		test("should handle multiple protection types in one task", () => {
			const content = "- [ ] Complex task with [[Note#heading]] and [link](url#fragment) and `#include` and #FF0000 and #real-tag";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toContain("[[Note#heading]]");
			expect(tasks[0].content).toContain("[link](url#fragment)");
			expect(tasks[0].content).toContain("`#include`");
			expect(tasks[0].content).toContain("#FF0000");
			expect(tasks[0].metadata.tags).toEqual(["#real-tag"]);
		});

		test("should handle nested and overlapping contexts", () => {
			const content = "- [ ] Task with [[Note with `#code` inside]] and #real-tag";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toContain("[[Note with `#code` inside]]");
			expect(tasks[0].metadata.tags).toEqual(["#real-tag"]);
		});

		test("should preserve existing Chinese tag functionality", () => {
			const content = "- [ ] 中文任务 with [[中文笔记#标题]] and #中文标签 #project/中文项目";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toContain("[[中文笔记#标题]]");
			expect(tasks[0].metadata.tags).toEqual(["#中文标签"]);
			expect(tasks[0].metadata.project).toBe("中文项目");
		});
	});

	describe("Performance and Edge Cases", () => {
		test("should handle content with many hash symbols efficiently", () => {
			const hashSymbols = Array.from({ length: 100 }, (_, i) => `#${i}`).join(" ");
			const content = `- [ ] Task with many hashes: ${hashSymbols} and #real-tag`;
			
			const startTime = performance.now();
			const tasks = parser.parseLegacy(content, "test.md");
			const endTime = performance.now();

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.tags).toContain("#real-tag");
			expect(endTime - startTime).toBeLessThan(50); // Should be fast
		});

		test("should handle empty content gracefully", () => {
			const content = "- [ ] ";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].content).toBe("");
			expect(tasks[0].metadata.tags).toEqual([]);
		});
	});
});
