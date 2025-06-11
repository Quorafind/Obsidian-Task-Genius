/**
 * Project Configuration Manager Tests
 */

import {
	ProjectConfigManager,
	ProjectConfigManagerOptions,
} from "../utils/ProjectConfigManager";
import { TgProject } from "../types/task";

// Mock Obsidian types
const mockVault = {
	getAbstractFileByPath: jest.fn(),
	read: jest.fn(),
} as any;

const mockMetadataCache = {
	getFileCache: jest.fn(),
} as any;

// Create a proper TFile mock
class MockTFile {
	path: string;
	name: string;
	parent: any;
	stat: any;

	constructor(path: string, name: string, parent: any = null) {
		this.path = path;
		this.name = name;
		this.parent = parent;
		this.stat = { mtime: 1234567890 };
	}
}

const mockFile = new MockTFile("test/project.md", "project.md");

const mockFolder = {
	children: [mockFile],
	parent: null,
} as any;

describe("ProjectConfigManager", () => {
	let manager: ProjectConfigManager;
	let options: ProjectConfigManagerOptions;

	beforeEach(() => {
		jest.clearAllMocks();

		options = {
			vault: mockVault,
			metadataCache: mockMetadataCache,
			configFileName: "project.md",
			searchRecursively: true,
			metadataKey: "project",
			pathMappings: [
				{
					pathPattern: "Projects/Work/*",
					projectName: "Work Project",
					enabled: true,
				},
				{
					pathPattern: "Personal/*",
					projectName: "Personal Project",
					enabled: true,
				},
			],
		};

		manager = new ProjectConfigManager(options);
	});

	describe("getFileMetadata", () => {
		test("should return frontmatter metadata", () => {
			const testFile = new MockTFile("test/file.md", "file.md");
			const mockMetadata = {
				frontmatter: {
					project: "Test Project",
					priority: "high",
				},
			};

			mockVault.getAbstractFileByPath.mockReturnValue(testFile);
			mockMetadataCache.getFileCache.mockReturnValue(mockMetadata);

			const result = manager.getFileMetadata("test/file.md");

			expect(result).toEqual({
				project: "Test Project",
				priority: "high",
			});
		});

		test("should return null if file not found", () => {
			mockVault.getAbstractFileByPath.mockReturnValue(null);

			const result = manager.getFileMetadata("nonexistent.md");

			expect(result).toBeNull();
		});

		test("should return null if no frontmatter", () => {
			const testFile = new MockTFile("test/file.md", "file.md");
			mockVault.getAbstractFileByPath.mockReturnValue(testFile);
			mockMetadataCache.getFileCache.mockReturnValue({});

			const result = manager.getFileMetadata("test/file.md");

			expect(result).toBeNull();
		});
	});

	describe("determineTgProject", () => {
		test("should return path-based project with highest priority", async () => {
			const result = await manager.determineTgProject(
				"Projects/Work/task.md"
			);

			expect(result).toEqual({
				type: "path",
				name: "Work Project",
				source: "Projects/Work/*",
				readonly: true,
			});
		});

		test("should return metadata-based project if no path match", async () => {
			const testFile = new MockTFile("other/task.md", "task.md");
			const mockMetadata = {
				frontmatter: {
					project: "Metadata Project",
				},
			};

			mockVault.getAbstractFileByPath.mockReturnValue(testFile);
			mockMetadataCache.getFileCache.mockReturnValue(mockMetadata);

			const result = await manager.determineTgProject("other/task.md");

			expect(result).toEqual({
				type: "metadata",
				name: "Metadata Project",
				source: "project",
				readonly: true,
			});
		});

		test("should return config-based project as fallback", async () => {
			// Mock file structure
			const configFile = new MockTFile("other/project.md", "project.md");
			const parentFolder = {
				children: [configFile],
				parent: null,
			};
			const testFile = new MockTFile("other/task.md", "task.md");
			testFile.parent = parentFolder;

			mockVault.getAbstractFileByPath.mockReturnValue(testFile);
			mockVault.read.mockResolvedValue("project: Config Project\n");
			mockMetadataCache.getFileCache
				.mockReturnValueOnce({}) // No frontmatter for task file
				.mockReturnValueOnce({}); // No frontmatter for config file

			const result = await manager.determineTgProject("other/task.md");

			expect(result).toEqual({
				type: "config",
				name: "Config Project",
				source: "project.md",
				readonly: true,
			});
		});

		test("should return undefined if no project found", async () => {
			const testFile = new MockTFile("other/task.md", "task.md");
			testFile.parent = { children: [], parent: null };

			mockVault.getAbstractFileByPath.mockReturnValue(testFile);
			mockMetadataCache.getFileCache.mockReturnValue({});

			const result = await manager.determineTgProject("other/task.md");

			expect(result).toBeUndefined();
		});
	});

	describe("path pattern matching", () => {
		test("should match wildcard patterns", async () => {
			const testCases = [
				{ path: "Projects/Work/subfolder/task.md", shouldMatch: true },
				{ path: "Projects/Work/task.md", shouldMatch: true },
				{ path: "Projects/Personal/task.md", shouldMatch: false },
				{ path: "Other/task.md", shouldMatch: false },
			];

			for (const testCase of testCases) {
				const result = await manager.determineTgProject(testCase.path);

				if (testCase.shouldMatch) {
					expect(result?.type).toBe("path");
					expect(result?.name).toBe("Work Project");
				} else {
					// Should either be undefined or not a path-based project
					expect(result?.type).not.toBe("path");
				}
			}
		});
	});

	describe("caching", () => {
		test("should cache project config data", async () => {
			const configFile = new MockTFile("test/project.md", "project.md");
			const parentFolder = {
				children: [configFile],
				parent: null,
			};
			const testFile = new MockTFile("test/task.md", "task.md");
			testFile.parent = parentFolder;

			mockVault.getAbstractFileByPath.mockReturnValue(testFile);
			mockVault.read.mockResolvedValue("project: Cached Project\n");
			mockMetadataCache.getFileCache.mockReturnValue({});

			// First call
			const result1 = await manager.determineTgProject("test/task.md");

			// Second call should use cache
			const result2 = await manager.determineTgProject("test/task.md");

			expect(mockVault.read).toHaveBeenCalledTimes(1);
			expect(result1).toEqual(result2);
		});

		test("should clear cache when requested", async () => {
			manager.clearCache();

			// Cache should be empty after clearing
			// This is mainly to ensure the method doesn't throw
			expect(() => manager.clearCache()).not.toThrow();
		});
	});

	describe("configuration updates", () => {
		test("should update options and clear cache", () => {
			const newOptions = {
				configFileName: "config.md",
				metadataKey: "proj",
			};

			manager.updateOptions(newOptions);

			// Should not throw and cache should be cleared
			expect(() => manager.clearCache()).not.toThrow();
		});
	});

	describe("error handling", () => {
		test("should handle file read errors gracefully", async () => {
			const configFile = new MockTFile("test/project.md", "project.md");
			const parentFolder = {
				children: [configFile],
				parent: null,
			};
			const testFile = new MockTFile("test/task.md", "task.md");
			testFile.parent = parentFolder;

			mockVault.getAbstractFileByPath.mockReturnValue(testFile);
			mockVault.read.mockRejectedValue(new Error("File read error"));

			const result = await manager.determineTgProject("test/task.md");

			// Should not throw and should return undefined or metadata-based result
			expect(result?.type).not.toBe("config");
		});

		test("should handle metadata cache errors gracefully", () => {
			const testFile = new MockTFile("test/file.md", "file.md");
			mockVault.getAbstractFileByPath.mockReturnValue(testFile);
			mockMetadataCache.getFileCache.mockImplementation(() => {
				throw new Error("Metadata cache error");
			});

			const result = manager.getFileMetadata("test/file.md");

			expect(result).toBeNull();
		});
	});
});
