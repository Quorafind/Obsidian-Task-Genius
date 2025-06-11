/**
 * Debug test for complex task parsing
 */

import { MarkdownTaskParser } from "../utils/workers/ConfigurableTaskParser";
import { getConfig } from "../common/task-parser-config";
import { createMockPlugin } from "./mockUtils";

describe("Debug Complex Task Parsing", () => {
	test("debug complex task step by step", () => {
		const mockPlugin = createMockPlugin({
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
		});

		const config = getConfig("tasks", mockPlugin);
		const parser = new MarkdownTaskParser(config);

		const content =
			"- [ ] Complex task #project/work @office 📅 2024-12-31 🔺 #important #urgent 🔁 every week";
		const tasks = parser.parseLegacy(content, "test.md");

		console.log("Parsed task:", JSON.stringify(tasks[0], null, 2));
		console.log("Config specialTagPrefixes:", config.specialTagPrefixes);

		expect(tasks).toHaveLength(1);
		expect(tasks[0].content).toBe("Complex task");
		expect(tasks[0].metadata.project).toBe("work");
		expect(tasks[0].metadata.context).toBe("office");
	});

	test("debug simple project tag", () => {
		const mockPlugin = createMockPlugin({
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
		});

		const config = getConfig("tasks", mockPlugin);
		const parser = new MarkdownTaskParser(config);

		const content = "- [ ] Simple task #project/work";
		const tasks = parser.parseLegacy(content, "test.md");

		console.log("Simple task:", JSON.stringify(tasks[0], null, 2));
		console.log("Config specialTagPrefixes:", config.specialTagPrefixes);

		expect(tasks).toHaveLength(1);
		expect(tasks[0].content).toBe("Simple task");
		expect(tasks[0].metadata.project).toBe("work");
	});
});
