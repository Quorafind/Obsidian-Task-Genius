import { FileFilterManager } from "../managers/file-filter-manager";
import { FilterMode } from "../common/setting-definition";
import { FileFilterSettings } from "../common/setting-definition";

// Mock TFile for testing
class MockTFile {
	constructor(public path: string, public extension: string) {}
}

describe("FileFilterManager", () => {
	describe("Basic Filtering", () => {
		it("should allow all files when disabled", () => {
			const config: FileFilterSettings = {
				enabled: false,
				mode: FilterMode.BLACKLIST,
				rules: [{ type: "folder", path: ".obsidian", enabled: true }],
			};

			const manager = new FileFilterManager(config);
			const file = new MockTFile(".obsidian/config.json", "json") as any;

			expect(manager.shouldIncludeFile(file)).toBe(true);
		});

		it("should filter files in blacklist mode", () => {
			const config: FileFilterSettings = {
				enabled: true,
				mode: FilterMode.BLACKLIST,
				rules: [
					{ type: "folder", path: ".obsidian", enabled: true },
					{ type: "file", path: "temp.md", enabled: true },
				],
			};

			const manager = new FileFilterManager(config);

			// Should exclude files in .obsidian folder
			const obsidianFile = new MockTFile(
				".obsidian/config.json",
				"json"
			) as any;
			expect(manager.shouldIncludeFile(obsidianFile)).toBe(false);

			// Should exclude specific file
			const tempFile = new MockTFile("temp.md", "md") as any;
			expect(manager.shouldIncludeFile(tempFile)).toBe(false);

			// Should include other files
			const normalFile = new MockTFile("notes/my-note.md", "md") as any;
			expect(manager.shouldIncludeFile(normalFile)).toBe(true);
		});

		it("should filter files in whitelist mode", () => {
			const config: FileFilterSettings = {
				enabled: true,
				mode: FilterMode.WHITELIST,
				rules: [
					{ type: "folder", path: "notes", enabled: true },
					{ type: "file", path: "important.md", enabled: true },
				],
			};

			const manager = new FileFilterManager(config);

			// Should include files in notes folder
			const notesFile = new MockTFile("notes/my-note.md", "md") as any;
			expect(manager.shouldIncludeFile(notesFile)).toBe(true);

			// Should include specific file
			const importantFile = new MockTFile("important.md", "md") as any;
			expect(manager.shouldIncludeFile(importantFile)).toBe(true);

			// Should exclude other files
			const otherFile = new MockTFile("other/file.md", "md") as any;
			expect(manager.shouldIncludeFile(otherFile)).toBe(false);
		});
	});

	describe("Pattern Matching", () => {
		it("should match wildcard patterns", () => {
			const config: FileFilterSettings = {
				enabled: true,
				mode: FilterMode.BLACKLIST,
				rules: [
					{ type: "pattern", path: "*.tmp", enabled: true },
					{ type: "pattern", path: "temp/*", enabled: true },
				],
			};

			const manager = new FileFilterManager(config);

			// Should exclude .tmp files
			const tmpFile = new MockTFile("cache.tmp", "tmp") as any;
			expect(manager.shouldIncludeFile(tmpFile)).toBe(false);

			// Should exclude files in temp folder
			const tempFile = new MockTFile("temp/data.json", "json") as any;
			expect(manager.shouldIncludeFile(tempFile)).toBe(false);

			// Should include normal files
			const normalFile = new MockTFile("notes/note.md", "md") as any;
			expect(manager.shouldIncludeFile(normalFile)).toBe(true);
		});
	});

	describe("Folder Hierarchy", () => {
		it("should match nested folders", () => {
			const config: FileFilterSettings = {
				enabled: true,
				mode: FilterMode.BLACKLIST,
				rules: [{ type: "folder", path: "archive", enabled: true }],
			};

			const manager = new FileFilterManager(config);

			// Should exclude files in archive folder
			const archiveFile = new MockTFile("archive/old.md", "md") as any;
			expect(manager.shouldIncludeFile(archiveFile)).toBe(false);

			// Should exclude files in nested archive folders
			const nestedArchiveFile = new MockTFile(
				"archive/2023/old.md",
				"md"
			) as any;
			expect(manager.shouldIncludeFile(nestedArchiveFile)).toBe(false);

			// Should include files in other folders
			const normalFile = new MockTFile("notes/current.md", "md") as any;
			expect(manager.shouldIncludeFile(normalFile)).toBe(true);
		});
	});

	describe("Rule Management", () => {
		it("should respect disabled rules", () => {
			const config: FileFilterSettings = {
				enabled: true,
				mode: FilterMode.BLACKLIST,
				rules: [
					{ type: "folder", path: ".obsidian", enabled: false },
					{ type: "folder", path: ".trash", enabled: true },
				],
			};

			const manager = new FileFilterManager(config);

			// Should include files from disabled rule
			const obsidianFile = new MockTFile(
				".obsidian/config.json",
				"json"
			) as any;
			expect(manager.shouldIncludeFile(obsidianFile)).toBe(true);

			// Should exclude files from enabled rule
			const trashFile = new MockTFile(".trash/deleted.md", "md") as any;
			expect(manager.shouldIncludeFile(trashFile)).toBe(false);
		});

		it("should update configuration dynamically", () => {
			const initialConfig: FileFilterSettings = {
				enabled: true,
				mode: FilterMode.BLACKLIST,
				rules: [{ type: "folder", path: ".obsidian", enabled: true }],
			};

			const manager = new FileFilterManager(initialConfig);
			const file = new MockTFile(".obsidian/config.json", "json") as any;

			// Initially should exclude
			expect(manager.shouldIncludeFile(file)).toBe(false);

			// Update configuration to disable filtering
			const newConfig: FileFilterSettings = {
				enabled: false,
				mode: FilterMode.BLACKLIST,
				rules: [],
			};

			manager.updateConfig(newConfig);

			// Should now include
			expect(manager.shouldIncludeFile(file)).toBe(true);
		});
	});

	describe("Performance and Caching", () => {
		it("should cache filter results", () => {
			const config: FileFilterSettings = {
				enabled: true,
				mode: FilterMode.BLACKLIST,
				rules: [{ type: "folder", path: ".obsidian", enabled: true }],
			};

			const manager = new FileFilterManager(config);
			const file = new MockTFile(".obsidian/config.json", "json") as any;

			// First call
			const result1 = manager.shouldIncludeFile(file);

			// Second call should use cache
			const result2 = manager.shouldIncludeFile(file);

			expect(result1).toBe(result2);
			expect(result1).toBe(false);

			// Verify cache is working
			const stats = manager.getStats();
			expect(stats.cacheSize).toBeGreaterThan(0);
		});

		it("should clear cache when configuration changes", () => {
			const config: FileFilterSettings = {
				enabled: true,
				mode: FilterMode.BLACKLIST,
				rules: [{ type: "folder", path: ".obsidian", enabled: true }],
			};

			const manager = new FileFilterManager(config);
			const file = new MockTFile(".obsidian/config.json", "json") as any;

			// Populate cache
			manager.shouldIncludeFile(file);
			expect(manager.getStats().cacheSize).toBeGreaterThan(0);

			// Update configuration
			const newConfig: FileFilterSettings = {
				enabled: false,
				mode: FilterMode.BLACKLIST,
				rules: [],
			};

			manager.updateConfig(newConfig);

			// Cache should be cleared
			expect(manager.getStats().cacheSize).toBe(0);
		});
	});

	describe("Statistics", () => {
		it("should provide accurate statistics", () => {
			const config: FileFilterSettings = {
				enabled: true,
				mode: FilterMode.BLACKLIST,
				rules: [
					{ type: "folder", path: ".obsidian", enabled: true },
					{ type: "file", path: "temp.md", enabled: false },
					{ type: "pattern", path: "*.tmp", enabled: true },
				],
			};

			const manager = new FileFilterManager(config);
			const stats = manager.getStats();

			expect(stats.enabled).toBe(true);
			expect(stats.rulesCount).toBe(2); // Only enabled rules
			expect(stats.cacheSize).toBe(0); // No cache yet
		});
	});
});
