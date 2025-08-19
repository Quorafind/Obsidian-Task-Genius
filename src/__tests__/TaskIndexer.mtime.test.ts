/**
 * Tests for TaskIndexer mtime-based caching functionality
 */

import { TaskIndexer } from "../core/task-indexer";
import { Task } from "../types/task";

// Mock obsidian Component class
jest.mock("obsidian", () => ({
	...jest.requireActual("obsidian"),
	Component: class {
		registerEvent = jest.fn();
		unload = jest.fn();
	},
	TFile: jest.fn(),
}));

// Mock dependencies
const mockApp = {} as any;
const mockVault = {
	on: jest.fn().mockReturnValue({}),
	off: jest.fn(),
} as any;
const mockMetadataCache = {} as any;

describe("TaskIndexer mtime functionality", () => {
	let indexer: TaskIndexer;

	beforeEach(() => {
		indexer = new TaskIndexer(mockApp, mockVault, mockMetadataCache);
	});

	afterEach(() => {
		if (indexer && typeof indexer.unload === 'function') {
			indexer.unload();
		}
	});

	describe("mtime comparison", () => {
		test("should detect file changes when mtime is newer", () => {
			const filePath = "test.md";
			const oldMtime = 1000;
			const newMtime = 2000;

			// Set initial mtime
			indexer.updateFileMtime(filePath, oldMtime);

			// Check if file is changed with newer mtime
			expect(indexer.isFileChanged(filePath, newMtime)).toBe(true);
		});

		test("should not detect changes when mtime is same", () => {
			const filePath = "test.md";
			const mtime = 1000;

			// Set initial mtime
			indexer.updateFileMtime(filePath, mtime);

			// Check if file is changed with same mtime
			expect(indexer.isFileChanged(filePath, mtime)).toBe(false);
		});

		test("should detect changes for unknown files", () => {
			const filePath = "unknown.md";
			const mtime = 1000;

			// Check if unknown file is considered changed
			expect(indexer.isFileChanged(filePath, mtime)).toBe(true);
		});
	});

	describe("cache validation", () => {
		test("should have valid cache when file hasn't changed and has tasks", () => {
			const filePath = "test.md";
			const mtime = 1000;
			const tasks: Task[] = [
				{
					id: "task1",
					content: "Test task",
					filePath,
					line: 1,
					completed: false,
					status: " ",
					originalMarkdown: "- [ ] Test task",
					metadata: {
						tags: [],
						project: undefined,
						context: undefined,
						priority: undefined,
						dueDate: undefined,
						startDate: undefined,
						scheduledDate: undefined,
						completedDate: undefined,
						cancelledDate: undefined,
						createdDate: undefined,
						recurrence: undefined,
						dependsOn: [],
						onCompletion: undefined,
						taskId: undefined,
						children: [],
					},
				},
			];

			// Add tasks and set mtime
			indexer.updateIndexWithTasks(filePath, tasks, mtime);

			// Check if cache is valid
			expect(indexer.hasValidCache(filePath, mtime)).toBe(true);
		});

		test("should not have valid cache when file has changed", () => {
			const filePath = "test.md";
			const oldMtime = 1000;
			const newMtime = 2000;
			const tasks: Task[] = [];

			// Add tasks with old mtime
			indexer.updateIndexWithTasks(filePath, tasks, oldMtime);

			// Check if cache is invalid with new mtime
			expect(indexer.hasValidCache(filePath, newMtime)).toBe(false);
		});

		test("should not have valid cache when no tasks exist", () => {
			const filePath = "test.md";
			const mtime = 1000;

			// Don't add any tasks, just set mtime
			indexer.updateFileMtime(filePath, mtime);

			// Check if cache is invalid when no tasks exist
			expect(indexer.hasValidCache(filePath, mtime)).toBe(false);
		});
	});

	describe("cache cleanup", () => {
		test("should clean up file cache properly", () => {
			const filePath = "test.md";
			const mtime = 1000;
			const tasks: Task[] = [];

			// Add tasks and set mtime
			indexer.updateIndexWithTasks(filePath, tasks, mtime);

			// Verify cache exists
			expect(indexer.getFileLastMtime(filePath)).toBe(mtime);

			// Clean up cache
			indexer.cleanupFileCache(filePath);

			// Verify cache is cleaned
			expect(indexer.getFileLastMtime(filePath)).toBeUndefined();
		});
	});

	describe("cache consistency", () => {
		test("should validate and fix cache consistency", () => {
			const filePath = "test.md";
			const mtime = 1000;

			// Manually add mtime without tasks (inconsistent state)
			indexer.updateFileMtime(filePath, mtime);

			// Validate consistency (should clean up orphaned mtime)
			indexer.validateCacheConsistency();

			// Verify orphaned mtime is cleaned up
			expect(indexer.getFileLastMtime(filePath)).toBeUndefined();
		});
	});
});
