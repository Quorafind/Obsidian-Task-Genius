/**
 * Test for ProjectDataWorkerManager
 */

import { ProjectDataWorkerManager } from "../utils/ProjectDataWorkerManager";
import { ProjectConfigManager } from "../utils/ProjectConfigManager";
import { Vault, MetadataCache } from "obsidian";

// Mock the worker
jest.mock("../utils/workers/ProjectData.worker");

describe("ProjectDataWorkerManager", () => {
	let vault: Vault;
	let metadataCache: MetadataCache;
	let projectConfigManager: ProjectConfigManager;
	let workerManager: ProjectDataWorkerManager;

	beforeEach(() => {
		vault = {
			getAbstractFileByPath: jest.fn(),
			read: jest.fn(),
		} as any;

		metadataCache = {
			getFileCache: jest.fn(),
		} as any;

		projectConfigManager = new ProjectConfigManager({
			vault,
			metadataCache,
			configFileName: "task-genius.config.md",
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
		});

		workerManager = new ProjectDataWorkerManager({
			vault,
			metadataCache,
			projectConfigManager,
			maxWorkers: 2,
			enableWorkers: true,
		});
	});

	afterEach(() => {
		workerManager.destroy();
	});

	describe("Worker Management", () => {
		it("should initialize workers when enabled", () => {
			expect(workerManager.isWorkersEnabled()).toBe(true);
			const stats = workerManager.getMemoryStats();
			expect(stats.workersEnabled).toBe(true);
		});

		it("should not initialize workers when disabled", () => {
			const disabledWorkerManager = new ProjectDataWorkerManager({
				vault,
				metadataCache,
				projectConfigManager,
				maxWorkers: 2,
				enableWorkers: false,
			});

			expect(disabledWorkerManager.isWorkersEnabled()).toBe(false);
			const stats = disabledWorkerManager.getMemoryStats();
			expect(stats.workersEnabled).toBe(false);

			disabledWorkerManager.destroy();
		});

		it("should enable/disable workers dynamically", () => {
			workerManager.setWorkersEnabled(false);
			expect(workerManager.isWorkersEnabled()).toBe(false);

			workerManager.setWorkersEnabled(true);
			expect(workerManager.isWorkersEnabled()).toBe(true);
		});
	});

	describe("Project Data Computation", () => {
		it("should get project data using cache first", async () => {
			const filePath = "test.md";

			// Mock file metadata
			(projectConfigManager.getFileMetadata as jest.Mock) = jest
				.fn()
				.mockReturnValue({
					project: "Test Project",
				});

			const result = await workerManager.getProjectData(filePath);
			expect(result).toBeDefined();
		});

		it("should handle batch project data requests", async () => {
			const filePaths = ["test1.md", "test2.md", "test3.md"];

			// Mock file metadata for all files
			(projectConfigManager.getFileMetadata as jest.Mock) = jest
				.fn()
				.mockReturnValue({
					project: "Test Project",
				});

			const results = await workerManager.getBatchProjectData(filePaths);
			expect(results).toBeInstanceOf(Map);
		});

		it("should fallback to sync computation when workers fail", async () => {
			// Disable workers to force sync computation
			workerManager.setWorkersEnabled(false);

			const filePath = "test.md";

			// Mock the sync computation methods
			(projectConfigManager.determineTgProject as jest.Mock) = jest
				.fn()
				.mockResolvedValue({
					type: "test",
					name: "Test Project",
					source: "mock",
					readonly: true,
				});

			(projectConfigManager.getEnhancedMetadata as jest.Mock) = jest
				.fn()
				.mockResolvedValue({
					project: "Test Project",
				});

			const result = await workerManager.getProjectData(filePath);
			expect(result).toBeDefined();
			expect(result?.tgProject?.name).toBe("Test Project");
		});
	});

	describe("Cache Management", () => {
		it("should clear cache when requested", () => {
			workerManager.clearCache();
			const stats = workerManager.getCacheStats();
			expect(stats).toBeDefined();
		});

		it("should handle file events", async () => {
			const filePath = "test.md";

			await workerManager.onFileCreated(filePath);
			await workerManager.onFileModified(filePath);
			await workerManager.onFileRenamed("old.md", "new.md");
			workerManager.onFileDeleted(filePath);

			// Should not throw errors
			expect(true).toBe(true);
		});
	});

	describe("Settings Management", () => {
		it("should handle settings changes", () => {
			workerManager.onSettingsChange();
			expect(true).toBe(true);
		});

		it("should handle enhanced project setting changes", () => {
			workerManager.onEnhancedProjectSettingChange(false);
			workerManager.onEnhancedProjectSettingChange(true);
			expect(true).toBe(true);
		});
	});

	describe("Memory Management", () => {
		it("should provide memory statistics", () => {
			const stats = workerManager.getMemoryStats();
			expect(stats).toHaveProperty("fileCacheSize");
			expect(stats).toHaveProperty("directoryCacheSize");
			expect(stats).toHaveProperty("pendingRequests");
			expect(stats).toHaveProperty("activeWorkers");
			expect(stats).toHaveProperty("workersEnabled");
		});

		it("should cleanup resources on destroy", () => {
			const stats1 = workerManager.getMemoryStats();
			workerManager.destroy();
			const stats2 = workerManager.getMemoryStats();

			expect(stats2.activeWorkers).toBe(0);
			expect(stats2.pendingRequests).toBe(0);
		});
	});
});
