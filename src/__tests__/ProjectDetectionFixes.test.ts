/**
 * Tests for Project Detection Fixes
 *
 * This test file verifies that the fixes for project detection issues work correctly:
 * 1. Metadata detection can be properly enabled/disabled
 * 2. Config file detection can be properly enabled/disabled
 * 3. Search recursively setting works correctly
 * 4. Each detection method respects its enabled state
 */

import {
	ProjectConfigManager,
	ProjectConfigManagerOptions,
} from "../managers/project-config-manager";

// Mock Obsidian types
class MockTFile {
	constructor(
		public path: string,
		public name: string,
		public parent: MockTFolder | null = null
	) {
		this.stat = { mtime: Date.now() };
	}
	stat: { mtime: number };
}

class MockTFolder {
	constructor(
		public path: string,
		public name: string,
		public parent: MockTFolder | null = null,
		public children: (MockTFile | MockTFolder)[] = []
	) {}
}

class MockVault {
	private files = new Map<string, MockTFile>();
	private fileContents = new Map<string, string>();

	addFile(path: string, content: string): MockTFile {
		const fileName = path.split("/").pop() || "";
		const file = new MockTFile(path, fileName);
		this.files.set(path, file);
		this.fileContents.set(path, content);
		return file;
	}

	addFolder(path: string): MockTFolder {
		const folderName = path.split("/").pop() || "";
		return new MockTFolder(path, folderName);
	}

	getAbstractFileByPath(path: string): MockTFile | null {
		return this.files.get(path) || null;
	}

	async read(file: MockTFile): Promise<string> {
		return this.fileContents.get(file.path) || "";
	}
}

class MockMetadataCache {
	private cache = new Map<string, any>();

	setFileMetadata(path: string, metadata: any): void {
		this.cache.set(path, { frontmatter: metadata });
	}

	getFileCache(file: MockTFile): any {
		return this.cache.get(file.path);
	}
}

describe("Project Detection Fixes", () => {
	let vault: MockVault;
	let metadataCache: MockMetadataCache;
	let defaultOptions: ProjectConfigManagerOptions;

	beforeEach(() => {
		vault = new MockVault();
		metadataCache = new MockMetadataCache();

		defaultOptions = {
			vault: vault as any,
			metadataCache: metadataCache as any,
			configFileName: "project.md",
			searchRecursively: false,
			metadataKey: "project",
			pathMappings: [],
			metadataMappings: [],
			defaultProjectNaming: {
				strategy: "filename",
				stripExtension: true,
				enabled: false,
			},
			enhancedProjectEnabled: true,
			metadataConfigEnabled: false,
			configFileEnabled: false,
		};
	});

	describe("Metadata Detection Enable/Disable", () => {
		it("should NOT detect project from frontmatter when metadata detection is disabled", async () => {
			// Setup test file with frontmatter
			vault.addFile("test.md", "# Test file");
			metadataCache.setFileMetadata("test.md", {
				projectName: "MyProject", // Note: using projectName instead of project
				priority: 5,
			});

			// Create manager with metadata detection DISABLED
			const manager = new ProjectConfigManager({
				...defaultOptions,
				metadataKey: "projectName", // Set correct metadata key
				metadataConfigEnabled: false, // DISABLED
			});

			// Should NOT detect project from metadata when disabled
			const result = await manager.determineTgProject("test.md");
			expect(result).toBeUndefined();
		});

		it("should detect project from frontmatter when metadata detection is enabled", async () => {
			// Setup test file with frontmatter
			vault.addFile("test.md", "# Test file");
			metadataCache.setFileMetadata("test.md", {
				projectName: "MyProject",
				priority: 5,
			});

			// Create manager with metadata detection ENABLED
			const manager = new ProjectConfigManager({
				...defaultOptions,
				metadataKey: "projectName", // Set correct metadata key
				metadataConfigEnabled: true, // ENABLED
			});

			// Should detect project from metadata when enabled
			const result = await manager.determineTgProject("test.md");
			expect(result).toBeDefined();
			expect(result?.type).toBe("metadata");
			expect(result?.name).toBe("MyProject");
			expect(result?.source).toBe("projectName");
		});

		it("should respect different metadata keys", async () => {
			// Setup test file with custom metadata key
			vault.addFile("test.md", "# Test file");
			metadataCache.setFileMetadata("test.md", {
				customProject: "CustomProject",
				project: "DefaultProject", // This should be ignored
			});

			// Create manager with custom metadata key
			const manager = new ProjectConfigManager({
				...defaultOptions,
				metadataKey: "customProject",
				metadataConfigEnabled: true,
			});

			const result = await manager.determineTgProject("test.md");
			expect(result).toBeDefined();
			expect(result?.name).toBe("CustomProject");
			expect(result?.source).toBe("customProject");
		});
	});

	describe("Config File Detection Enable/Disable", () => {
		it("should NOT detect project from config file when config file detection is disabled", async () => {
			// Setup test file and config file
			vault.addFile("folder/test.md", "# Test file");
			vault.addFile(
				"folder/project.md",
				"project: ConfigProject\ndescription: Test project"
			);

			// Create manager with config file detection DISABLED
			const manager = new ProjectConfigManager({
				...defaultOptions,
				configFileEnabled: false, // DISABLED
			});

			// Should NOT detect project from config file when disabled
			const result = await manager.determineTgProject("folder/test.md");
			expect(result).toBeUndefined();
		});

		it("should detect project from config file when config file detection is enabled", async () => {
			// Setup test file and config file
			const testFile = vault.addFile("folder/test.md", "# Test file");
			vault.addFile(
				"folder/project.md",
				"project: ConfigProject\ndescription: Test project"
			);

			// Mock folder structure
			const folder = vault.addFolder("folder");
			const configFile = vault.getAbstractFileByPath("folder/project.md");
			if (configFile) {
				folder.children.push(configFile);
				testFile.parent = folder;
			}

			// Create manager with config file detection ENABLED
			const manager = new ProjectConfigManager({
				...defaultOptions,
				configFileEnabled: true, // ENABLED
			});

			// Should detect project from config file when enabled
			const result = await manager.determineTgProject("folder/test.md");
			expect(result).toBeDefined();
			expect(result?.type).toBe("config");
			expect(result?.name).toBe("ConfigProject");
			expect(result?.source).toBe("project.md");
		});
	});

	describe("Search Recursively Setting", () => {
		it("should NOT search parent directories when searchRecursively is false", async () => {
			// Setup nested structure with config file in parent
			vault.addFile("parent/project.md", "project: ParentProject");
			vault.addFile("parent/child/test.md", "# Test file");

			// Create manager with recursive search DISABLED
			const manager = new ProjectConfigManager({
				...defaultOptions,
				searchRecursively: false, // DISABLED
				configFileEnabled: true,
			});

			// Should NOT find parent config file
			const result = await manager.determineTgProject(
				"parent/child/test.md"
			);
			expect(result).toBeUndefined();
		});

		it("should search parent directories when searchRecursively is true", async () => {
			// Setup nested structure with config file in parent
			vault.addFile("parent/project.md", "project: ParentProject");
			const testFile = vault.addFile(
				"parent/child/test.md",
				"# Test file"
			);

			// Mock folder structure
			const parentFolder = vault.addFolder("parent");
			const childFolder = vault.addFolder("parent/child");
			const configFile = vault.getAbstractFileByPath("parent/project.md");

			if (configFile) {
				parentFolder.children.push(configFile);
			}
			parentFolder.children.push(childFolder);
			childFolder.parent = parentFolder;
			testFile.parent = childFolder;

			// Create manager with recursive search ENABLED
			const manager = new ProjectConfigManager({
				...defaultOptions,
				searchRecursively: true, // ENABLED
				configFileEnabled: true,
			});

			// Should find parent config file
			const result = await manager.determineTgProject(
				"parent/child/test.md"
			);
			expect(result).toBeDefined();
			expect(result?.type).toBe("config");
			expect(result?.name).toBe("ParentProject");
		});
	});

	describe("Detection Method Priority and Independence", () => {
		it("should respect priority: path > metadata > config file", async () => {
			// Setup all detection methods
			vault.addFile("projects/test.md", "# Test file");
			vault.addFile("projects/project.md", "project: ConfigProject");
			metadataCache.setFileMetadata("projects/test.md", {
				project: "MetadataProject",
			});

			// Create manager with path mapping (highest priority)
			const manager = new ProjectConfigManager({
				...defaultOptions,
				pathMappings: [
					{
						pathPattern: "projects/",
						projectName: "PathProject",
						enabled: true,
					},
				],
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			const result = await manager.determineTgProject("projects/test.md");
			expect(result).toBeDefined();
			expect(result?.type).toBe("path");
			expect(result?.name).toBe("PathProject");
		});

		it("should fall back to metadata when path mapping is disabled", async () => {
			// Setup all detection methods
			vault.addFile("projects/test.md", "# Test file");
			vault.addFile("projects/project.md", "project: ConfigProject");
			metadataCache.setFileMetadata("projects/test.md", {
				project: "MetadataProject",
			});

			// Create manager with path mapping disabled
			const manager = new ProjectConfigManager({
				...defaultOptions,
				pathMappings: [
					{
						pathPattern: "projects/",
						projectName: "PathProject",
						enabled: false, // DISABLED
					},
				],
				metadataConfigEnabled: true,
				configFileEnabled: true,
			});

			const result = await manager.determineTgProject("projects/test.md");
			expect(result).toBeDefined();
			expect(result?.type).toBe("metadata");
			expect(result?.name).toBe("MetadataProject");
		});

		it("should fall back to config file when both path and metadata are disabled", async () => {
			// Setup all detection methods
			const testFile = vault.addFile("projects/test.md", "# Test file");
			vault.addFile("projects/project.md", "project: ConfigProject");
			metadataCache.setFileMetadata("projects/test.md", {
				project: "MetadataProject",
			});

			// Mock folder structure
			const folder = vault.addFolder("projects");
			const configFile = vault.getAbstractFileByPath(
				"projects/project.md"
			);
			if (configFile) {
				folder.children.push(configFile);
				testFile.parent = folder;
			}

			// Create manager with path and metadata disabled
			const manager = new ProjectConfigManager({
				...defaultOptions,
				pathMappings: [
					{
						pathPattern: "projects/",
						projectName: "PathProject",
						enabled: false, // DISABLED
					},
				],
				metadataConfigEnabled: false, // DISABLED
				configFileEnabled: true,
			});

			const result = await manager.determineTgProject("projects/test.md");
			expect(result).toBeDefined();
			expect(result?.type).toBe("config");
			expect(result?.name).toBe("ConfigProject");
		});

		it("should return undefined when all detection methods are disabled", async () => {
			// Setup all detection methods
			vault.addFile("projects/test.md", "# Test file");
			vault.addFile("projects/project.md", "project: ConfigProject");
			metadataCache.setFileMetadata("projects/test.md", {
				project: "MetadataProject",
			});

			// Create manager with ALL detection methods disabled
			const manager = new ProjectConfigManager({
				...defaultOptions,
				pathMappings: [
					{
						pathPattern: "projects/",
						projectName: "PathProject",
						enabled: false, // DISABLED
					},
				],
				metadataConfigEnabled: false, // DISABLED
				configFileEnabled: false, // DISABLED
			});

			const result = await manager.determineTgProject("projects/test.md");
			expect(result).toBeUndefined();
		});
	});

	describe("Enhanced Project Feature Toggle", () => {
		it("should return undefined when enhanced project is disabled", async () => {
			// Setup test data
			vault.addFile("test.md", "# Test file");
			metadataCache.setFileMetadata("test.md", {
				project: "TestProject",
			});

			// Create manager with enhanced project DISABLED
			const manager = new ProjectConfigManager({
				...defaultOptions,
				enhancedProjectEnabled: false, // DISABLED
				metadataConfigEnabled: true,
			});

			const result = await manager.determineTgProject("test.md");
			expect(result).toBeUndefined();
		});
	});
});
