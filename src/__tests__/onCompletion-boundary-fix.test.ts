/**
 * Test for onCompletion boundary parsing fix
 * 
 * This test specifically verifies that the fix for parsing onCompletion values
 * with file extensions works correctly.
 */

import { MarkdownTaskParser } from "../utils/workers/ConfigurableTaskParser";
import { getConfig } from "../common/task-parser-config";

describe("OnCompletion Boundary Parsing Fix", () => {
	let parser: MarkdownTaskParser;

	beforeEach(() => {
		parser = new MarkdownTaskParser(getConfig("tasks"));
	});

	describe("File Extension Boundary Detection", () => {
		test("should stop parsing at .md extension followed by space", () => {
			const content = "- [ ] Task 🏁 move:archive.md #tag1";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.onCompletion).toBe("move:archive.md");
			expect(tasks[0].metadata.tags).toContain("#tag1");
		});

		test("should stop parsing at .canvas extension followed by space", () => {
			const content = "- [ ] Task 🏁 move:project.canvas #tag1";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.onCompletion).toBe("move:project.canvas");
			expect(tasks[0].metadata.tags).toContain("#tag1");
		});

		test("should handle file paths with spaces before extension", () => {
			const content = "- [ ] Task 🏁 move:my archive file.md #tag1";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.onCompletion).toBe("move:my archive file.md");
			expect(tasks[0].metadata.tags).toContain("#tag1");
		});

		test("should handle heading references after file extension", () => {
			const content = "- [ ] Task 🏁 move:archive.md#section-1 #tag1";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.onCompletion).toBe("move:archive.md#section-1");
			expect(tasks[0].metadata.tags).toContain("#tag1");
		});

		test("should handle complex paths with folders", () => {
			const content = "- [ ] Task 🏁 move:folder/subfolder/archive.md #tag1";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.onCompletion).toBe("move:folder/subfolder/archive.md");
			expect(tasks[0].metadata.tags).toContain("#tag1");
		});

		test("should handle multiple emojis after file extension", () => {
			const content = "- [ ] Task 🏁 move:done.md 📅 2024-01-01 #tag1";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.onCompletion).toBe("move:done.md");
			expect(tasks[0].metadata.dueDate).toBeDefined();
			expect(tasks[0].metadata.tags).toContain("#tag1");
		});

		test("should not break on files without extensions", () => {
			const content = "- [ ] Task 🏁 delete #tag1";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.onCompletion).toBe("delete");
			expect(tasks[0].metadata.tags).toContain("#tag1");
		});

		test("should handle edge case with extension in middle of filename", () => {
			const content = "- [ ] Task 🏁 move:file.md.backup #tag1";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			// Should not stop at .md because it's not followed by space or end
			expect(tasks[0].metadata.onCompletion).toBe("move:file.md.backup");
			expect(tasks[0].metadata.tags).toContain("#tag1");
		});
	});

	describe("Regression Tests", () => {
		test("should maintain backward compatibility with simple actions", () => {
			const content = "- [ ] Task 🏁 delete";
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.onCompletion).toBe("delete");
		});

		test("should maintain compatibility with JSON format", () => {
			const content = '- [ ] Task 🏁 {"type":"move","targetFile":"archive.md"}';
			const tasks = parser.parseLegacy(content, "test.md");

			expect(tasks).toHaveLength(1);
			expect(tasks[0].metadata.onCompletion).toBe('{"type":"move","targetFile":"archive.md"}');
		});
	});
});
