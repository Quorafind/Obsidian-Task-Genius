/**
 * Project Utilities Tests
 *
 * Tests for project-related utility functions
 */

import {
	getEffectiveProject,
	isProjectReadonly,
	hasProject,
} from "../utils/taskUtil";
import { Task } from "../types/task";
import { TgProject } from "../types/task";

describe("Project Utility Functions", () => {
	describe("getEffectiveProject", () => {
		test("should return original project when available", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					project: "Original Project",
					tgProject: {
						type: "path",
						name: "Path Project",
						source: "Projects/Work",
						readonly: true,
					},
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = getEffectiveProject(task);
			expect(result).toBe("Original Project");
		});

		test("should return tgProject name when no original project", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tgProject: {
						type: "metadata",
						name: "Metadata Project",
						source: "project",
						readonly: true,
					},
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = getEffectiveProject(task);
			expect(result).toBe("Metadata Project");
		});

		test("should return undefined when no project available", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = getEffectiveProject(task);
			expect(result).toBeUndefined();
		});

		test("should handle empty string project", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					project: "",
					tgProject: {
						type: "path",
						name: "Fallback Project",
						source: "Projects",
						readonly: true,
					},
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = getEffectiveProject(task);
			expect(result).toBe("Fallback Project");
		});

		test("should handle whitespace-only project", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					project: "   ",
					tgProject: {
						type: "config",
						name: "Config Project",
						source: "project.md",
						readonly: true,
					},
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = getEffectiveProject(task);
			expect(result).toBe("Config Project");
		});
	});

	describe("isProjectReadonly", () => {
		test("should return false for original project", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					project: "Original Project",
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = isProjectReadonly(task);
			expect(result).toBe(false);
		});

		test("should return true for tgProject", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tgProject: {
						type: "path",
						name: "Path Project",
						source: "Projects/Work",
						readonly: true,
					},
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = isProjectReadonly(task);
			expect(result).toBe(true);
		});

		test("should return false when no project", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = isProjectReadonly(task);
			expect(result).toBe(false);
		});

		test("should return false when original project exists even with tgProject", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					project: "Original Project",
					tgProject: {
						type: "metadata",
						name: "Metadata Project",
						source: "project",
						readonly: true,
					},
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = isProjectReadonly(task);
			expect(result).toBe(false);
		});

		test("should handle tgProject with readonly false", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tgProject: {
						type: "metadata",
						name: "Custom Project",
						source: "manual",
						readonly: false,
					},
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = isProjectReadonly(task);
			expect(result).toBe(false);
		});
	});

	describe("hasProject", () => {
		test("should return true when original project exists", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					project: "Original Project",
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = hasProject(task);
			expect(result).toBe(true);
		});

		test("should return true when tgProject exists", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tgProject: {
						type: "path",
						name: "Path Project",
						source: "Projects/Work",
						readonly: true,
					},
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = hasProject(task);
			expect(result).toBe(true);
		});

		test("should return false when no project exists", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = hasProject(task);
			expect(result).toBe(false);
		});

		test("should return false for empty string project", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					project: "",
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = hasProject(task);
			expect(result).toBe(false);
		});

		test("should return false for whitespace-only project", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					project: "   ",
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = hasProject(task);
			expect(result).toBe(false);
		});

		test("should return true when both projects exist", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					project: "Original Project",
					tgProject: {
						type: "metadata",
						name: "Metadata Project",
						source: "project",
						readonly: true,
					},
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = hasProject(task);
			expect(result).toBe(true);
		});

		test("should handle tgProject with empty name", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tgProject: {
						type: "path",
						name: "",
						source: "Projects/Work",
						readonly: true,
					},
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = hasProject(task);
			expect(result).toBe(false);
		});

		test("should handle tgProject with whitespace-only name", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tgProject: {
						type: "config",
						name: "   ",
						source: "project.md",
						readonly: true,
					},
					tags: [],
					children: [],
					heading: [],
				},
			};

			const result = hasProject(task);
			expect(result).toBe(false);
		});
	});

	describe("Edge Cases and Error Handling", () => {
		test("should handle undefined metadata", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: undefined as any,
			};

			expect(() => getEffectiveProject(task)).not.toThrow();
			expect(() => isProjectReadonly(task)).not.toThrow();
			expect(() => hasProject(task)).not.toThrow();

			expect(getEffectiveProject(task)).toBeUndefined();
			expect(isProjectReadonly(task)).toBe(false);
			expect(hasProject(task)).toBe(false);
		});

		test("should handle null metadata", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: null as any,
			};

			expect(() => getEffectiveProject(task)).not.toThrow();
			expect(() => isProjectReadonly(task)).not.toThrow();
			expect(() => hasProject(task)).not.toThrow();

			expect(getEffectiveProject(task)).toBeUndefined();
			expect(isProjectReadonly(task)).toBe(false);
			expect(hasProject(task)).toBe(false);
		});

		test("should handle malformed tgProject", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tgProject: {
						// Missing required fields
					} as any,
					tags: [],
					children: [],
					heading: [],
				},
			};

			expect(() => getEffectiveProject(task)).not.toThrow();
			expect(() => isProjectReadonly(task)).not.toThrow();
			expect(() => hasProject(task)).not.toThrow();

			expect(getEffectiveProject(task)).toBeUndefined();
			expect(isProjectReadonly(task)).toBe(false);
			expect(hasProject(task)).toBe(false);
		});

		test("should handle tgProject as non-object", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tgProject: "invalid" as any,
					tags: [],
					children: [],
					heading: [],
				},
			};

			expect(() => getEffectiveProject(task)).not.toThrow();
			expect(() => isProjectReadonly(task)).not.toThrow();
			expect(() => hasProject(task)).not.toThrow();

			expect(getEffectiveProject(task)).toBeUndefined();
			expect(isProjectReadonly(task)).toBe(false);
			expect(hasProject(task)).toBe(false);
		});
	});

	describe("TgProject Types", () => {
		test("should handle path type tgProject", () => {
			const tgProject: TgProject = {
				type: "path",
				name: "Path Project",
				source: "Projects/Work",
				readonly: true,
			};

			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tgProject,
					tags: [],
					children: [],
					heading: [],
				},
			};

			expect(getEffectiveProject(task)).toBe("Path Project");
			expect(isProjectReadonly(task)).toBe(true);
			expect(hasProject(task)).toBe(true);
		});

		test("should handle metadata type tgProject", () => {
			const tgProject: TgProject = {
				type: "metadata",
				name: "Metadata Project",
				source: "project",
				readonly: true,
			};

			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tgProject,
					tags: [],
					children: [],
					heading: [],
				},
			};

			expect(getEffectiveProject(task)).toBe("Metadata Project");
			expect(isProjectReadonly(task)).toBe(true);
			expect(hasProject(task)).toBe(true);
		});

		test("should handle config type tgProject", () => {
			const tgProject: TgProject = {
				type: "config",
				name: "Config Project",
				source: "project.md",
				readonly: true,
			};

			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tgProject,
					tags: [],
					children: [],
					heading: [],
				},
			};

			expect(getEffectiveProject(task)).toBe("Config Project");
			expect(isProjectReadonly(task)).toBe(true);
			expect(hasProject(task)).toBe(true);
		});
	});
});
