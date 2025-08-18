/**
 * Investigation: Tags Inheritance and Metadata Fields
 */

import { MarkdownTaskParser } from "../dataflow/core/ConfigurableTaskParser";
import { getConfig } from "../common/task-parser-config";
import { createMockPlugin } from "./mockUtils";
import { DEFAULT_SETTINGS } from "../common/setting-definition";

describe("Tags Inheritance Investigation", () => {
	test("should investigate what fields are being inherited incorrectly", () => {
		const mockPlugin = createMockPlugin({
			...DEFAULT_SETTINGS,
			fileMetadataInheritance: {
				enabled: true,
				inheritFromFrontmatter: true,
				inheritFromFrontmatterForSubtasks: false,
			},
		});

		const config = getConfig("tasks", mockPlugin);
		const parser = new MarkdownTaskParser(config);

		const content = `- [>] 12312312
  - [ ] child task`;
		
		// Simulate problematic file metadata that might contain structural fields
		const fileMetadata = {
			tags: ["mobility"],
			children: ["some-other-task"], // This should NOT be inherited
			parent: "some-parent", // This should NOT be inherited
			heading: ["Some Heading"], // This should NOT be inherited
			id: "file-id", // This should NOT be inherited
			priority: "high", // This SHOULD be inherited
			area: "work", // This SHOULD be inherited
		};

		const tasks = parser.parseLegacy(content, "templify-asdasdasd-20250704120358.md", fileMetadata);

		const parentTask = tasks[0];
		const childTask = tasks[1];
		
		// Check parent task
		console.log("Parent task metadata:", JSON.stringify(parentTask.metadata, null, 2));
		
		// Check child task
		console.log("Child task metadata:", JSON.stringify(childTask.metadata, null, 2));
		
		// The problematic fields should NOT be inherited from file metadata
		expect(parentTask.metadata.children).not.toEqual(["some-other-task"]);
		expect(parentTask.metadata.parent).not.toBe("some-parent");
		expect(parentTask.metadata.id).not.toBe("file-id");
		
		// But the appropriate fields should be inherited
		expect(parentTask.metadata.priority).toBe(4); // "high" converted to 4
		expect(parentTask.metadata.area).toBe("work");
		expect(parentTask.metadata.tags).toContain("mobility");
		
		// Parent task should have correct structural fields
		expect(parentTask.metadata.children).toEqual([childTask.id]);
		expect(parentTask.metadata.parent).toBeUndefined();
		
		// Child task should have correct structural fields
		expect(childTask.metadata.children).toEqual([]);
		expect(childTask.metadata.parent).toBe(parentTask.id);
	});
});