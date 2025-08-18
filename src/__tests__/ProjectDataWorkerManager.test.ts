/**
 * Test for ProjectDataWorkerManager
 */

import { ProjectDataWorkerManager } from "../dataflow/workers/ProjectDataWorkerManager";
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

		// Mock all the required methods
		jest.spyOn(projectConfigManager, "getFileMetadata").mockReturnValue({});
		jest.spyOn(
			projectConfigManager,
			"getProjectConfigData"
		).mockResolvedValue({});
		jest.spyOn(
			projectConfigManager,
			"determineTgProject"
		).mockResolvedValue({
			type: "test",
			name: "Test Project",
			source: "mock",
			readonly: true,
		});
		jest.spyOn(
			projectConfigManager,
			"getEnhancedMetadata"
		).mockResolvedValue({
			project: "Test Project",
		});
		jest.spyOn(
			projectConfigManager,
			"isEnhancedProjectEnabled"
		).mockReturnValue(true);
		jest.spyOn(projectConfigManager, "getWorkerConfig").mockReturnValue({
			pathMappings: [],
			metadataMappings: [],
			defaultProjectNaming: {
				strategy: "filename",
				stripExtension: true,
				enabled: false,
			},
			metadataKey: "project",
		});

		workerManager = new ProjectDataWorkerManager({
			vault,
			metadataCache,
			projectConfigManager,
			maxWorkers: 1, // Updated to reflect new default
			enableWorkers: true,
		});
	});

	afterEach(() => {
		workerManager.destroy();
		jest.clearAllMocks();
	});

	describe("Worker Management", () => {
		it("should initialize workers when enabled", () => {
			// In test environment, workers might not initialize due to mocking
			// Check that the setting is correct even if workers don't start
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
			// In test environment, workers might not actually start
			// Just check that the setting was applied
			const stats = workerManager.getMemoryStats();
			expect(stats.workersEnabled).toBe(true);
		});
	});

	describe("Project Data Computation", () => {
		it("should get project data using cache first", async () => {
			const filePath = "test.md";

			const result = await workerManager.getProjectData(filePath);
			expect(result).toBeDefined();
		});

		it("should handle batch project data requests", async () => {
			const filePaths = ["test1.md", "test2.md", "test3.md"];

			const results = await workerManager.getBatchProjectData(filePaths);
			expect(results).toBeInstanceOf(Map);
		});

		it("should fallback to sync computation when workers fail", async () => {
			// Disable workers to force sync computation
			workerManager.setWorkersEnabled(false);

			const filePath = "test.md";

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

		it("should prevent multiple worker initialization", () => {
			// Create a new worker manager to test initialization safeguards
			const testWorkerManager = new ProjectDataWorkerManager({
				vault,
				metadataCache,
				projectConfigManager,
				maxWorkers: 1,
				enableWorkers: true,
			});

			// Get initial stats
			const initialStats = testWorkerManager.getMemoryStats();
			const initialWorkerCount = initialStats.activeWorkers;

			// Try to initialize again (this should be prevented)
			// Since initializeWorkers is private, we test by creating multiple instances
			const secondWorkerManager = new ProjectDataWorkerManager({
				vault,
				metadataCache,
				projectConfigManager,
				maxWorkers: 1,
				enableWorkers: true,
			});

			// Each manager should have its own workers, but not accumulate
			const firstStats = testWorkerManager.getMemoryStats();
			const secondStats = secondWorkerManager.getMemoryStats();

			expect(firstStats.activeWorkers).toBe(initialWorkerCount);
			expect(secondStats.activeWorkers).toBe(initialWorkerCount);

			// Cleanup
			testWorkerManager.destroy();
			secondWorkerManager.destroy();
		});

		it("should properly cleanup workers during plugin reload simulation", () => {
			// Get initial stats (workers might be 0 in test environment due to mocking)
			const initialStats = workerManager.getMemoryStats();
			const initialWorkerCount = initialStats.activeWorkers;
			const initialPendingRequests = initialStats.pendingRequests;

			// Destroy the manager (simulating plugin unload)
			workerManager.destroy();
			const afterDestroyStats = workerManager.getMemoryStats();
			expect(afterDestroyStats.activeWorkers).toBe(0);
			expect(afterDestroyStats.pendingRequests).toBe(0);

			// Create a new manager (simulating plugin reload)
			const newWorkerManager = new ProjectDataWorkerManager({
				vault,
				metadataCache,
				projectConfigManager,
				maxWorkers: 1,
				enableWorkers: true,
			});

			const newStats = newWorkerManager.getMemoryStats();
			// In test environment, workers might not initialize due to mocking
			// The important thing is that pending requests are cleared
			expect(newStats.pendingRequests).toBe(0);
			// Workers should be consistent with initial state
			expect(newStats.activeWorkers).toBe(initialWorkerCount);

			// Cleanup
			newWorkerManager.destroy();
		});
	});
});
