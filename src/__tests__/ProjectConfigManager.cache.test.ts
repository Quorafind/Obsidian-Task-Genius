/**
 * Performance tests for ProjectConfigManager cache optimizations
 */

import { ProjectConfigManager, ProjectConfigManagerOptions } from "../managers/project-config-manager";
import { TFile, Vault, MetadataCache } from "obsidian";

// Mock implementations
const createMockFile = (path: string, mtime: number, frontmatter?: any): TFile => ({
	path,
	name: path.split("/").pop() || "",
	basename: path.split("/").pop()?.replace(/\.[^/.]+$/, "") || "",
	extension: path.split(".").pop() || "",
	stat: { 
		ctime: mtime - 1000, 
		mtime, 
		size: 1000 
	},
	vault: {} as Vault,
	parent: null,
} as TFile);

const createMockVault = (files: Map<string, TFile>) => ({
	getFileByPath: (path: string) => files.get(path) || null,
	getAbstractFileByPath: (path: string) => files.get(path) || null,
	read: async (file: TFile) => `---\nproject: test\n---\nContent`,
} as Vault);

const createMockMetadataCache = (metadata: Map<string, any>) => ({
	getFileCache: (file: TFile) => ({
		frontmatter: metadata.get(file.path) || {}
	}),
} as MetadataCache);

describe("ProjectConfigManager Cache Performance", () => {
	let projectConfigManager: ProjectConfigManager;
	let mockFiles: Map<string, TFile>;
	let mockMetadata: Map<string, any>;
	let vault: Vault;
	let metadataCache: MetadataCache;

	beforeEach(() => {
		mockFiles = new Map();
		mockMetadata = new Map();
		vault = createMockVault(mockFiles);
		metadataCache = createMockMetadataCache(mockMetadata);

		const options: ProjectConfigManagerOptions = {
			vault,
			metadataCache,
			configFileName: "task-genius.config.md",
			searchRecursively: true,
			metadataKey: "project",
			pathMappings: [],
			metadataMappings: [],
			defaultProjectNaming: {
				strategy: "filename",
				enabled: false,
			},
			enhancedProjectEnabled: true,
		};

		projectConfigManager = new ProjectConfigManager(options);
	});

	describe("getFileMetadata caching", () => {
		it("should cache file metadata based on mtime", () => {
			const filePath = "test.md";
			const mtime = Date.now();
			const frontmatter = { project: "test-project", priority: "high" };

			// Setup mock file and metadata
			mockFiles.set(filePath, createMockFile(filePath, mtime, frontmatter));
			mockMetadata.set(filePath, frontmatter);

			// First call - should read from metadataCache
			const result1 = projectConfigManager.getFileMetadata(filePath);
			expect(result1).toEqual(frontmatter);

			// Second call with same mtime - should return cached result
			const result2 = projectConfigManager.getFileMetadata(filePath);
			expect(result2).toEqual(frontmatter);
			expect(result2).toBe(result1); // Should be same object reference (cached)
		});

		it("should invalidate cache when file mtime changes", () => {
			const filePath = "test.md";
			const initialMtime = Date.now();
			const updatedMtime = initialMtime + 1000;
			const initialFrontmatter = { project: "initial" };
			const updatedFrontmatter = { project: "updated" };

			// Setup initial file
			mockFiles.set(filePath, createMockFile(filePath, initialMtime));
			mockMetadata.set(filePath, initialFrontmatter);

			// First call
			const result1 = projectConfigManager.getFileMetadata(filePath);
			expect(result1).toEqual(initialFrontmatter);

			// Update file mtime and metadata
			mockFiles.set(filePath, createMockFile(filePath, updatedMtime));
			mockMetadata.set(filePath, updatedFrontmatter);

			// Second call - should detect file change and return new data
			const result2 = projectConfigManager.getFileMetadata(filePath);
			expect(result2).toEqual(updatedFrontmatter);
			expect(result2).not.toBe(result1); // Should be different object (cache miss)
		});
	});

	describe("getEnhancedMetadata caching", () => {
		it("should cache enhanced metadata based on composite key", async () => {
			const filePath = "test.md";
			const mtime = Date.now();
			const frontmatter = { priority: "high" };

			// Setup mock file
			mockFiles.set(filePath, createMockFile(filePath, mtime));
			mockMetadata.set(filePath, frontmatter);

			// First call
			const result1 = await projectConfigManager.getEnhancedMetadata(filePath);
			expect(result1).toEqual(frontmatter);

			// Second call with same file state - should return cached result
			const result2 = await projectConfigManager.getEnhancedMetadata(filePath);
			expect(result2).toEqual(frontmatter);
		});

		it("should invalidate cache when either file or config changes", async () => {
			const filePath = "test.md";
			const initialMtime = Date.now();
			const updatedMtime = initialMtime + 1000;
			const initialFrontmatter = { priority: "high" };
			const updatedFrontmatter = { priority: "low" };

			// Setup initial state
			mockFiles.set(filePath, createMockFile(filePath, initialMtime));
			mockMetadata.set(filePath, initialFrontmatter);

			// First call
			const result1 = await projectConfigManager.getEnhancedMetadata(filePath);
			expect(result1).toEqual(initialFrontmatter);

			// Update file
			mockFiles.set(filePath, createMockFile(filePath, updatedMtime));
			mockMetadata.set(filePath, updatedFrontmatter);

			// Second call - should detect change and return new data
			const result2 = await projectConfigManager.getEnhancedMetadata(filePath);
			expect(result2).toEqual(updatedFrontmatter);
		});
	});

	describe("Cache statistics", () => {
		it("should provide accurate cache statistics", () => {
			const filePath1 = "test1.md";
			const filePath2 = "test2.md";
			const mtime = Date.now();

			// Setup files
			mockFiles.set(filePath1, createMockFile(filePath1, mtime));
			mockFiles.set(filePath2, createMockFile(filePath2, mtime));
			mockMetadata.set(filePath1, { project: "test1" });
			mockMetadata.set(filePath2, { project: "test2" });

			// Load data into cache
			projectConfigManager.getFileMetadata(filePath1);
			projectConfigManager.getFileMetadata(filePath2);

			const stats = projectConfigManager.getCacheStats();
			expect(stats.fileMetadataCache.size).toBe(2);
			expect(stats.totalMemoryUsage.estimatedBytes).toBeGreaterThan(0);
		});
	});

	describe("Cache clearing", () => {
		it("should clear specific file from all related caches", async () => {
			const filePath = "test.md";
			const mtime = Date.now();

			mockFiles.set(filePath, createMockFile(filePath, mtime));
			mockMetadata.set(filePath, { project: "test" });

			// Load data into caches
			projectConfigManager.getFileMetadata(filePath);
			await projectConfigManager.getEnhancedMetadata(filePath);

			// Verify data is cached
			let stats = projectConfigManager.getCacheStats();
			expect(stats.fileMetadataCache.size).toBe(1);
			expect(stats.enhancedMetadataCache.size).toBe(1);

			// Clear cache for specific file
			projectConfigManager.clearCache(filePath);

			// Verify cache is cleared
			stats = projectConfigManager.getCacheStats();
			expect(stats.fileMetadataCache.size).toBe(0);
			expect(stats.enhancedMetadataCache.size).toBe(0);
		});

		it("should clear all caches when no file path provided", async () => {
			const filePath1 = "test1.md";
			const filePath2 = "test2.md";
			const mtime = Date.now();

			mockFiles.set(filePath1, createMockFile(filePath1, mtime));
			mockFiles.set(filePath2, createMockFile(filePath2, mtime));
			mockMetadata.set(filePath1, { project: "test1" });
			mockMetadata.set(filePath2, { project: "test2" });

			// Load data into caches
			projectConfigManager.getFileMetadata(filePath1);
			projectConfigManager.getFileMetadata(filePath2);

			// Verify data is cached
			let stats = projectConfigManager.getCacheStats();
			expect(stats.fileMetadataCache.size).toBe(2);

			// Clear all caches
			projectConfigManager.clearCache();

			// Verify all caches are cleared
			stats = projectConfigManager.getCacheStats();
			expect(stats.fileMetadataCache.size).toBe(0);
			expect(stats.enhancedMetadataCache.size).toBe(0);
		});
	});

	describe("Stale cache cleanup", () => {
		it("should remove stale entries when clearStaleEntries is called", async () => {
			const filePath = "test.md";
			const initialMtime = Date.now();
			const frontmatter = { project: "test" };

			// Setup initial file
			mockFiles.set(filePath, createMockFile(filePath, initialMtime));
			mockMetadata.set(filePath, frontmatter);

			// Load into cache
			projectConfigManager.getFileMetadata(filePath);

			// Verify cache is populated
			let stats = projectConfigManager.getCacheStats();
			expect(stats.fileMetadataCache.size).toBe(1);

			// Simulate file deletion by removing from mock vault
			mockFiles.delete(filePath);

			// Clear stale entries
			const clearedCount = await projectConfigManager.clearStaleEntries();
			expect(clearedCount).toBe(1);

			// Verify cache is cleaned
			stats = projectConfigManager.getCacheStats();
			expect(stats.fileMetadataCache.size).toBe(0);
		});
	});
});