/**
 * Tests for Project Source Worker Fix
 *
 * This test file verifies that the worker correctly rebuilds tgProject with proper source display:
 * 1. Metadata-based projects show correct "frontmatter" source
 * 2. Config file-based projects show correct "config-file" source
 * 3. Path-based projects show correct "path-mapping" source
 * 4. The worker logic correctly infers type from source characteristics
 */

import { MarkdownTaskParser } from "../dataflow/core/ConfigurableTaskParser";
import { TaskParserConfig, MetadataParseMode } from "../types/TaskParserConfig";

// Mock the worker logic for testing
function simulateWorkerTgProjectRebuild(projectInfo: {
	project: string;
	source: string;
	readonly: boolean;
}): {
	type: "metadata" | "path" | "config" | "default";
	name: string;
	source: string;
	readonly: boolean;
} {
	// This simulates the logic from TaskIndex.worker.ts
	let actualType: "metadata" | "path" | "config" | "default";
	let displaySource: string;

	// If source is one of the type values, use it directly
	if (
		["metadata", "path", "config", "default"].includes(projectInfo.source)
	) {
		actualType = projectInfo.source as
			| "metadata"
			| "path"
			| "config"
			| "default";
	}
	// Otherwise, infer type from source characteristics
	else if (projectInfo.source && projectInfo.source.includes("/")) {
		// Path patterns contain "/"
		actualType = "path";
	} else if (projectInfo.source && projectInfo.source.includes(".")) {
		// Config files contain "."
		actualType = "config";
	} else {
		// Metadata keys are simple strings without "/" or "."
		actualType = "metadata";
	}

	// Set appropriate display source based on type
	switch (actualType) {
		case "path":
			displaySource = "path-mapping";
			break;
		case "metadata":
			displaySource = "frontmatter";
			break;
		case "config":
			displaySource = "config-file";
			break;
		case "default":
			displaySource = "default-naming";
			break;
	}

	return {
		type: actualType,
		name: projectInfo.project,
		source: displaySource,
		readonly: projectInfo.readonly,
	};
}

describe("Project Source Worker Fix", () => {
	describe("Worker tgProject Rebuild Logic", () => {
		it("should correctly identify metadata-based projects", () => {
			const projectInfo = {
				project: "MyMetadataProject",
				source: "projectName", // This is a metadata key
				readonly: true,
			};

			const result = simulateWorkerTgProjectRebuild(projectInfo);

			expect(result.type).toBe("metadata");
			expect(result.name).toBe("MyMetadataProject");
			expect(result.source).toBe("frontmatter");
			expect(result.readonly).toBe(true);
		});

		it("should correctly identify config file-based projects", () => {
			const projectInfo = {
				project: "MyConfigProject",
				source: "project.md", // This is a config filename
				readonly: true,
			};

			const result = simulateWorkerTgProjectRebuild(projectInfo);

			expect(result.type).toBe("config");
			expect(result.name).toBe("MyConfigProject");
			expect(result.source).toBe("config-file");
			expect(result.readonly).toBe(true);
		});

		it("should correctly identify path-based projects", () => {
			const projectInfo = {
				project: "MyPathProject",
				source: "projects/", // This is a path pattern
				readonly: true,
			};

			const result = simulateWorkerTgProjectRebuild(projectInfo);

			expect(result.type).toBe("path");
			expect(result.name).toBe("MyPathProject");
			expect(result.source).toBe("path-mapping");
			expect(result.readonly).toBe(true);
		});

		it("should correctly handle direct type values", () => {
			// Test when source is directly the type value
			const metadataProjectInfo = {
				project: "DirectMetadataProject",
				source: "metadata", // Direct type value
				readonly: true,
			};

			const metadataResult =
				simulateWorkerTgProjectRebuild(metadataProjectInfo);
			expect(metadataResult.type).toBe("metadata");
			expect(metadataResult.source).toBe("frontmatter");

			const configProjectInfo = {
				project: "DirectConfigProject",
				source: "config", // Direct type value
				readonly: true,
			};

			const configResult =
				simulateWorkerTgProjectRebuild(configProjectInfo);
			expect(configResult.type).toBe("config");
			expect(configResult.source).toBe("config-file");

			const pathProjectInfo = {
				project: "DirectPathProject",
				source: "path", // Direct type value
				readonly: true,
			};

			const pathResult = simulateWorkerTgProjectRebuild(pathProjectInfo);
			expect(pathResult.type).toBe("path");
			expect(pathResult.source).toBe("path-mapping");
		});

		it("should correctly handle default project naming", () => {
			const projectInfo = {
				project: "DefaultProject",
				source: "default", // Direct type value
				readonly: true,
			};

			const result = simulateWorkerTgProjectRebuild(projectInfo);

			expect(result.type).toBe("default");
			expect(result.name).toBe("DefaultProject");
			expect(result.source).toBe("default-naming");
			expect(result.readonly).toBe(true);
		});

		it("should handle edge cases correctly", () => {
			// Test metadata key with special characters
			const specialMetadataInfo = {
				project: "SpecialProject",
				source: "custom_project_name", // Metadata key with underscore
				readonly: true,
			};

			const specialResult =
				simulateWorkerTgProjectRebuild(specialMetadataInfo);
			expect(specialResult.type).toBe("metadata");
			expect(specialResult.source).toBe("frontmatter");

			// Test config file with different extension
			const yamlConfigInfo = {
				project: "YamlProject",
				source: "project.yaml", // Different file extension
				readonly: true,
			};

			const yamlResult = simulateWorkerTgProjectRebuild(yamlConfigInfo);
			expect(yamlResult.type).toBe("config");
			expect(yamlResult.source).toBe("config-file");

			// Test complex path pattern
			const complexPathInfo = {
				project: "ComplexPathProject",
				source: "work/projects/", // Complex path pattern
				readonly: true,
			};

			const complexResult =
				simulateWorkerTgProjectRebuild(complexPathInfo);
			expect(complexResult.type).toBe("path");
			expect(complexResult.source).toBe("path-mapping");
		});
	});

	describe("Integration with Parser", () => {
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

		it("should correctly pass through tgProject when provided", () => {
			const taskContent = "- [ ] Test task";
			const filePath = "test.md";

			// Simulate the corrected tgProject from worker
			const correctedTgProject = {
				type: "metadata" as const,
				name: "WorkerCorrectedProject",
				source: "frontmatter",
				readonly: true,
			};

			const tasks = parser.parse(
				taskContent,
				filePath,
				undefined,
				undefined,
				correctedTgProject
			);

			expect(tasks).toHaveLength(1);
			const task = tasks[0];
			expect(task.tgProject).toBeDefined();
			expect(task.tgProject?.type).toBe("metadata");
			expect(task.tgProject?.name).toBe("WorkerCorrectedProject");
			expect(task.tgProject?.source).toBe("frontmatter");
		});
	});
});
