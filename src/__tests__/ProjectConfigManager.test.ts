/**
 * ProjectConfigManager Tests
 *
 * Tests for project configuration management including:
 * - Path-based project mappings
 * - Metadata-based project detection
 * - Config file-based project detection
 * - Metadata field mappings
 * - Default project naming strategies
 */

import {
	ProjectConfigManager,
	ProjectConfigManagerOptions,
	MetadataMapping,
	ProjectNamingStrategy,
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

describe("ProjectConfigManager", () => {
	let vault: MockVault = new MockVault();
	let metadataCache: MockMetadataCache = new MockMetadataCache();
	let manager: ProjectConfigManager;

	const defaultOptions: ProjectConfigManagerOptions = {
		vault: vault as any,
		metadataCache: metadataCache as any,
		configFileName: "project.md",
		searchRecursively: true,
		metadataKey: "project",
		pathMappings: [],
		metadataMappings: [],
		defaultProjectNaming: {
			strategy: "filename",
			stripExtension: true,
			enabled: false,
		},
		enhancedProjectEnabled: true,
		metadataConfigEnabled: true,
		configFileEnabled: true,
	};

	beforeEach(() => {
		vault = new MockVault();
		metadataCache = new MockMetadataCache();

		const options = {
			...defaultOptions,
			vault: vault as any,
			metadataCache: metadataCache as any,
		};

		manager = new ProjectConfigManager(options);
	});

	describe("Path-based project mapping", () => {
		it("should detect project from path mappings", async () => {
			const pathMappings = [
				{
					pathPattern: "Projects/Work",
					projectName: "Work Project",
					enabled: true,
				},
				{
					pathPattern: "Personal",
					projectName: "Personal Project",
					enabled: true,
				},
			];

			manager.updateOptions({ pathMappings });

			const workProject = await manager.determineTgProject(
				"Projects/Work/task.md"
			);
			expect(workProject).toEqual({
				type: "path",
				name: "Work Project",
				source: "Projects/Work",
				readonly: true,
			});

			const personalProject = await manager.determineTgProject(
				"Personal/notes.md"
			);
			expect(personalProject).toEqual({
				type: "path",
				name: "Personal Project",
				source: "Personal",
				readonly: true,
			});
		});

		it("should ignore disabled path mappings", async () => {
			const pathMappings = [
				{
					pathPattern: "Projects/Work",
					projectName: "Work Project",
					enabled: false,
				},
			];

			manager.updateOptions({ pathMappings });

			const project = await manager.determineTgProject(
				"Projects/Work/task.md"
			);
			expect(project).toBeUndefined();
		});

		it("should support wildcard patterns", async () => {
			const pathMappings = [
				{
					pathPattern: "Projects/*",
					projectName: "Any Project",
					enabled: true,
				},
			];

			manager.updateOptions({ pathMappings });

			const project = await manager.determineTgProject(
				"Projects/SomeProject/task.md"
			);
			expect(project).toEqual({
				type: "path",
				name: "Any Project",
				source: "Projects/*",
				readonly: true,
			});
		});
	});

	describe("Metadata-based project detection", () => {
		it("should detect project from file frontmatter", async () => {
			vault.addFile("test.md", "# Test file");
			metadataCache.setFileMetadata("test.md", { project: "My Project" });

			const project = await manager.determineTgProject("test.md");
			expect(project).toEqual({
				type: "metadata",
				name: "My Project",
				source: "project",
				readonly: true,
			});
		});

		it("should use custom metadata key", async () => {
			manager.updateOptions({ metadataKey: "proj" });
			vault.addFile("test.md", "# Test file");
			metadataCache.setFileMetadata("test.md", {
				proj: "Custom Project",
			});

			const project = await manager.determineTgProject("test.md");
			expect(project).toEqual({
				type: "metadata",
				name: "Custom Project",
				source: "proj",
				readonly: true,
			});
		});

		it("should handle missing files gracefully", async () => {
			const project = await manager.determineTgProject("nonexistent.md");
			expect(project).toBeUndefined();
		});
	});

	describe("Config file-based project detection", () => {
		it("should detect project from config file", async () => {
			// Create a project config file
			vault.addFile(
				"Projects/project.md",
				`---
project: Config Project
---

# Project Configuration
`
			);

			// Mock the folder structure
			const file = vault.addFile("Projects/task.md", "- [ ] Test task");
			const folder = vault.addFolder("Projects");
			const configFile = vault.getAbstractFileByPath(
				"Projects/project.md"
			);
			if (configFile) {
				folder.children.push(configFile);
				file.parent = folder;
			}

			// Set metadata for config file
			metadataCache.setFileMetadata("Projects/project.md", {
				project: "Config Project",
			});

			const project = await manager.determineTgProject(
				"Projects/task.md"
			);
			expect(project).toEqual({
				type: "config",
				name: "Config Project",
				source: "project.md",
				readonly: true,
			});
		});

		it("should parse project from config file content", async () => {
			const configContent = `
# Project Configuration

project: Content Project
description: A project defined in content
`;
			vault.addFile("Projects/project.md", configContent);

			// Mock folder structure
			const file = vault.addFile("Projects/task.md", "- [ ] Test task");
			const folder = vault.addFolder("Projects");
			const configFile = vault.getAbstractFileByPath(
				"Projects/project.md"
			);
			if (configFile) {
				folder.children.push(configFile);
				file.parent = folder;
			}

			const project = await manager.determineTgProject(
				"Projects/task.md"
			);
			expect(project).toEqual({
				type: "config",
				name: "Content Project",
				source: "project.md",
				readonly: true,
			});
		});
	});

	describe("Metadata mappings", () => {
		it("should apply metadata mappings", async () => {
			const metadataMappings: MetadataMapping[] = [
				{
					sourceKey: "proj",
					targetKey: "project",
					enabled: true,
				},
				{
					sourceKey: "due_date",
					targetKey: "due",
					enabled: true,
				},
			];

			manager.updateOptions({ metadataMappings });

			vault.addFile("test.md", "# Test file");
			metadataCache.setFileMetadata("test.md", {
				proj: "Mapped Project",
				due_date: "2024-01-01",
				other: "value",
			});

			const enhancedMetadata = await manager.getEnhancedMetadata(
				"test.md"
			);
			expect(enhancedMetadata).toEqual({
				proj: "Mapped Project",
				due_date: "2024-01-01",
				other: "value",
				project: "Mapped Project",
				due: 1704038400000,
			});
		});

		it("should ignore disabled mappings", async () => {
			const metadataMappings: MetadataMapping[] = [
				{
					sourceKey: "proj",
					targetKey: "project",
					enabled: false,
				},
			];

			manager.updateOptions({ metadataMappings });

			vault.addFile("test.md", "# Test file");
			metadataCache.setFileMetadata("test.md", {
				proj: "Should Not Map",
			});

			const enhancedMetadata = await manager.getEnhancedMetadata(
				"test.md"
			);
			expect(enhancedMetadata).toEqual({
				proj: "Should Not Map",
			});
			expect(enhancedMetadata.project).toBeUndefined();
		});
	});

	describe("Default project naming", () => {
		it("should use filename as project name", async () => {
			const defaultProjectNaming: ProjectNamingStrategy = {
				strategy: "filename",
				stripExtension: true,
				enabled: true,
			};

			manager.updateOptions({ defaultProjectNaming });

			const project = await manager.determineTgProject(
				"Projects/my-document.md"
			);
			expect(project).toEqual({
				type: "default",
				name: "my-document",
				source: "filename",
				readonly: true,
			});
		});

		it("should use filename without stripping extension", async () => {
			const defaultProjectNaming: ProjectNamingStrategy = {
				strategy: "filename",
				stripExtension: false,
				enabled: true,
			};

			manager.updateOptions({ defaultProjectNaming });

			const project = await manager.determineTgProject(
				"Projects/my-document.md"
			);
			expect(project).toEqual({
				type: "default",
				name: "my-document.md",
				source: "filename",
				readonly: true,
			});
		});

		it("should use folder name as project name", async () => {
			const defaultProjectNaming: ProjectNamingStrategy = {
				strategy: "foldername",
				enabled: true,
			};

			manager.updateOptions({ defaultProjectNaming });

			const project = await manager.determineTgProject(
				"Projects/WorkFolder/task.md"
			);
			expect(project).toEqual({
				type: "default",
				name: "WorkFolder",
				source: "foldername",
				readonly: true,
			});
		});

		it("should use metadata value as project name", async () => {
			vault.addFile("anywhere/task.md", "# Test file");
			metadataCache.setFileMetadata("anywhere/task.md", {
				"project-name": "Global Project",
			});

			const defaultProjectNaming: ProjectNamingStrategy = {
				strategy: "metadata",
				metadataKey: "project-name",
				enabled: true,
			};

			manager.updateOptions({ defaultProjectNaming });

			const project = await manager.determineTgProject(
				"anywhere/task.md"
			);
			expect(project).toEqual({
				type: "default",
				name: "Global Project",
				source: "metadata",
				readonly: true,
			});
		});

		it("should not apply default naming when disabled", async () => {
			const defaultProjectNaming: ProjectNamingStrategy = {
				strategy: "filename",
				stripExtension: true,
				enabled: false,
			};

			manager.updateOptions({ defaultProjectNaming });

			const project = await manager.determineTgProject(
				"Projects/my-document.md"
			);
			expect(project).toBeUndefined();
		});
	});

	describe("Priority order", () => {
		it("should prioritize path mappings over metadata", async () => {
			const pathMappings = [
				{
					pathPattern: "Projects",
					projectName: "Path Project",
					enabled: true,
				},
			];

			manager.updateOptions({ pathMappings });

			vault.addFile("Projects/task.md", "# Test file");
			metadataCache.setFileMetadata("Projects/task.md", {
				project: "Metadata Project",
			});

			const project = await manager.determineTgProject(
				"Projects/task.md"
			);
			expect(project).toEqual({
				type: "path",
				name: "Path Project",
				source: "Projects",
				readonly: true,
			});
		});

		it("should prioritize metadata over config file", async () => {
			vault.addFile("Projects/task.md", "# Test file");
			vault.addFile("Projects/project.md", "project: Config Project");
			metadataCache.setFileMetadata("Projects/task.md", {
				project: "Metadata Project",
			});

			// Mock folder structure
			const file = vault.getAbstractFileByPath("Projects/task.md");
			const folder = vault.addFolder("Projects");
			const configFile = vault.getAbstractFileByPath(
				"Projects/project.md"
			);
			if (file && configFile) {
				folder.children.push(configFile);
				file.parent = folder;
			}

			const project = await manager.determineTgProject(
				"Projects/task.md"
			);
			expect(project).toEqual({
				type: "metadata",
				name: "Metadata Project",
				source: "project",
				readonly: true,
			});
		});

		it("should prioritize config file over default naming", async () => {
			const defaultProjectNaming: ProjectNamingStrategy = {
				strategy: "filename",
				stripExtension: true,
				enabled: true,
			};

			manager.updateOptions({ defaultProjectNaming });

			vault.addFile("Projects/task.md", "# Test file");
			vault.addFile("Projects/project.md", "project: Config Project");

			// Mock folder structure
			const file = vault.getAbstractFileByPath("Projects/task.md");
			const folder = vault.addFolder("Projects");
			const configFile = vault.getAbstractFileByPath(
				"Projects/project.md"
			);
			if (file && configFile) {
				folder.children.push(configFile);
				file.parent = folder;
			}

			const project = await manager.determineTgProject(
				"Projects/task.md"
			);
			expect(project).toEqual({
				type: "config",
				name: "Config Project",
				source: "project.md",
				readonly: true,
			});
		});
	});

	describe("Caching", () => {
		it("should cache project config data", async () => {
			vault.addFile("Projects/project.md", "project: Cached Project");
			vault.addFile("Projects/task.md", "# Test file");

			// Mock folder structure
			const file = vault.getAbstractFileByPath("Projects/task.md");
			const folder = vault.addFolder("Projects");
			const configFile = vault.getAbstractFileByPath(
				"Projects/project.md"
			);
			if (file && configFile) {
				folder.children.push(configFile);
				file.parent = folder;
			}

			// First call should read and cache
			const project1 = await manager.determineTgProject(
				"Projects/task.md"
			);

			// Second call should use cache
			const project2 = await manager.determineTgProject(
				"Projects/task.md"
			);

			expect(project1).toEqual(project2);
			expect(project1?.name).toBe("Cached Project");
		});

		it("should clear cache when options change", async () => {
			vault.addFile("test.md", "# Test file");
			metadataCache.setFileMetadata("test.md", {
				project: "Original Project",
			});

			const project1 = await manager.determineTgProject("test.md");
			expect(project1?.name).toBe("Original Project");

			// Change metadata key
			manager.updateOptions({ metadataKey: "proj" });
			metadataCache.setFileMetadata("test.md", { proj: "New Project" });

			const project2 = await manager.determineTgProject("test.md");
			expect(project2?.name).toBe("New Project");
		});
	});

	describe("Error handling", () => {
		it("should handle file access errors gracefully", async () => {
			// Mock vault that throws errors
			const errorVault = {
				getAbstractFileByPath: () => {
					throw new Error("File access error");
				},
			};

			const errorManager = new ProjectConfigManager({
				...defaultOptions,
				vault: errorVault as any,
			});

			const project = await errorManager.determineTgProject("test.md");
			expect(project).toBeUndefined();
		});

		it("should handle malformed config files gracefully", async () => {
			vault.addFile(
				"Projects/project.md",
				"Invalid content without proper format"
			);
			vault.addFile("Projects/task.md", "# Test file");

			// Mock folder structure
			const file = vault.getAbstractFileByPath("Projects/task.md");
			const folder = vault.addFolder("Projects");
			const configFile = vault.getAbstractFileByPath(
				"Projects/project.md"
			);
			if (file && configFile) {
				folder.children.push(configFile);
				file.parent = folder;
			}

			const project = await manager.determineTgProject(
				"Projects/task.md"
			);
			expect(project).toBeUndefined();
		});
	});

	describe("Enhanced project feature flag", () => {
		it("should respect enhanced project enabled flag", async () => {
			// Setup test data
			vault.addFile("test.md", "# Test file");
			metadataCache.setFileMetadata("test.md", {
				project: "Test Project",
			});

			// Create manager with enhanced project disabled
			const disabledManager = new ProjectConfigManager({
				...defaultOptions,
				enhancedProjectEnabled: false,
			});

			// All methods should return null/empty when disabled
			expect(
				await disabledManager.getProjectConfig("test.md")
			).toBeNull();
			expect(disabledManager.getFileMetadata("test.md")).toBeNull();
			expect(
				await disabledManager.determineTgProject("test.md")
			).toBeUndefined();
			expect(
				await disabledManager.getEnhancedMetadata("test.md")
			).toEqual({});
			expect(disabledManager.isEnhancedProjectEnabled()).toBe(false);
		});

		it("should allow enabling/disabling enhanced project features", async () => {
			// Setup test data
			vault.addFile("test.md", "# Test file");
			metadataCache.setFileMetadata("test.md", {
				project: "Test Project",
			});

			// Start with enabled
			manager.setEnhancedProjectEnabled(true);
			expect(manager.isEnhancedProjectEnabled()).toBe(true);
			expect(manager.getFileMetadata("test.md")).toEqual({
				project: "Test Project",
			});

			// Disable
			manager.setEnhancedProjectEnabled(false);
			expect(manager.isEnhancedProjectEnabled()).toBe(false);
			expect(manager.getFileMetadata("test.md")).toBeNull();

			// Re-enable
			manager.setEnhancedProjectEnabled(true);
			expect(manager.isEnhancedProjectEnabled()).toBe(true);
			expect(manager.getFileMetadata("test.md")).toEqual({
				project: "Test Project",
			});
		});

		it("should update enhanced project flag through updateOptions", () => {
			expect(manager.isEnhancedProjectEnabled()).toBe(true); // Default

			manager.updateOptions({ enhancedProjectEnabled: false });
			expect(manager.isEnhancedProjectEnabled()).toBe(false);

			manager.updateOptions({ enhancedProjectEnabled: true });
			expect(manager.isEnhancedProjectEnabled()).toBe(true);
		});

		it("should not process frontmatter metadata when enhanced project is disabled", async () => {
			// Setup test data with frontmatter
			vault.addFile("test.md", "# Test file");
			metadataCache.setFileMetadata("test.md", {
				project: "Frontmatter Project",
				priority: 5,
				dueDate: "2024-01-01",
				customField: "custom value",
			});

			// Create manager with enhanced project disabled
			const disabledManager = new ProjectConfigManager({
				...defaultOptions,
				enhancedProjectEnabled: false,
			});

			// All metadata-related methods should return null/empty when disabled
			expect(disabledManager.getFileMetadata("test.md")).toBeNull();
			expect(
				await disabledManager.getEnhancedMetadata("test.md")
			).toEqual({});

			// Even if frontmatter exists, it should not be accessible through disabled manager
			expect(
				await disabledManager.determineTgProject("test.md")
			).toBeUndefined();
		});
	});
});
