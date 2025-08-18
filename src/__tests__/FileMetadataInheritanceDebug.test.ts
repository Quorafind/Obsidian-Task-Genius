/**
 * Debug File Metadata Inheritance
 */

import { MarkdownTaskParser } from "../dataflow/core/ConfigurableTaskParser";
import { getConfig } from "../common/task-parser-config";
import { createMockPlugin } from "./mockUtils";
import { DEFAULT_SETTINGS } from "../common/setting-definition";

describe("Debug File Metadata Inheritance", () => {
	test("should debug inheritance process", () => {
		const mockPlugin = createMockPlugin({
			...DEFAULT_SETTINGS,
			fileMetadataInheritance: {
				enabled: true,
				inheritFromFrontmatter: true,
				inheritFromFrontmatterForSubtasks: false,
			},
		});

		const config = getConfig("tasks", mockPlugin);
		console.log("Config fileMetadataInheritance:", config.fileMetadataInheritance);

		const parser = new MarkdownTaskParser(config);

		const content = "- [ ] Test task";
		const fileMetadata = {
			priority: "high",
			testField: "testValue",
		};

		const tasks = parser.parseLegacy(content, "test.md", fileMetadata);

		// 检查 priority 字段在任务中是否正确继承
		const task = tasks[0];
		
		// 使用 throw error 来调试更详细的信息
		throw new Error(`Debug detailed info:
		Config enabled: ${config.fileMetadataInheritance?.enabled}
		File metadata keys: ${Object.keys(fileMetadata).join(', ')}
		File metadata values: ${JSON.stringify(fileMetadata)}
		Task metadata keys: ${Object.keys(task?.metadata || {}).join(', ')}
		Task metadata: ${JSON.stringify(task?.metadata)}
		Task priority: ${task?.metadata?.priority} (type: ${typeof task?.metadata?.priority})
		Task testField: ${task?.metadata?.testField} (exists: ${'testField' in (task?.metadata || {})})
		Priority inherited: ${task?.metadata?.priority === 4}
		TestField inherited: ${task?.metadata?.testField === 'testValue'}`);

		expect(tasks).toHaveLength(1);
	});
});