// Mock Obsidian's prepareFuzzySearch
const mockPrepareFuzzySearch = jest.fn((query: string) => {
	return (target: string) => {
		// Simple mock implementation for testing
		return target.toLowerCase().includes(query.toLowerCase());
	};
});

// Mock translations
const mockT = jest.fn((key: string) => key);

jest.mock("obsidian", () => ({
	prepareFuzzySearch: mockPrepareFuzzySearch,
}));

jest.mock("../translations/helper", () => ({
	t: mockT,
}));

import { SettingsIndexer } from "../components/settings/SettingsIndexer";
import { SETTINGS_METADATA } from "../common/settings-metadata";

describe("Settings Search Tests", () => {
	let indexer: SettingsIndexer;

	beforeEach(() => {
		indexer = new SettingsIndexer();
		jest.clearAllMocks();
	});

	describe("Settings Metadata", () => {
		test("should have valid metadata structure", () => {
			expect(SETTINGS_METADATA).toBeDefined();
			expect(Array.isArray(SETTINGS_METADATA)).toBe(true);
			expect(SETTINGS_METADATA.length).toBeGreaterThan(0);

			// Check first few items have required fields
			const firstItem = SETTINGS_METADATA[0];
			expect(firstItem).toHaveProperty("id");
			expect(firstItem).toHaveProperty("tabId");
			expect(firstItem).toHaveProperty("name");
			expect(firstItem).toHaveProperty("translationKey");
			expect(firstItem).toHaveProperty("keywords");
			expect(Array.isArray(firstItem.keywords)).toBe(true);
		});

		test("should have progress bar settings", () => {
			const progressBarMain = SETTINGS_METADATA.find(
				(item) => item.id === "progress-bar-main"
			);
			expect(progressBarMain).toBeDefined();
			expect(progressBarMain?.name).toBe("Progress bar");
			expect(progressBarMain?.tabId).toBe("progress-bar");
			expect(progressBarMain?.keywords).toContain("progress");
		});

		test("should have enable task filter setting", () => {
			const taskFilter = SETTINGS_METADATA.find(
				(item) => item.id === "enable-task-filter"
			);
			expect(taskFilter).toBeDefined();
			expect(taskFilter?.name).toBe("Enable Task Filter");
			expect(taskFilter?.tabId).toBe("task-filter");
		});
	});

	describe("SettingsIndexer", () => {
		test("should initialize correctly", () => {
			expect(indexer).toBeDefined();

			// Should not be initialized yet
			const stats = indexer.getStats();
			expect(stats.itemCount).toBeGreaterThan(0);
		});

		test("should build index on first search", () => {
			const results = indexer.search("progress");
			expect(mockT).toHaveBeenCalled();
		});

		test("should search by name", () => {
			const results = indexer.search("progress");

			console.log("Search results for 'progress':", results.length);
			results.forEach((result) => {
				console.log(
					`- ${result.item.name} (${result.matchType}, score: ${result.score})`
				);
			});

			expect(results.length).toBeGreaterThan(0);

			// Should find progress bar settings
			const progressResult = results.find(
				(result) =>
					result.item.id === "progress-bar-main" ||
					result.item.name.toLowerCase().includes("progress")
			);
			expect(progressResult).toBeDefined();
		});

		test("should search by description", () => {
			const results = indexer.search("toggle");

			console.log("Search results for 'toggle':", results.length);
			results.forEach((result) => {
				console.log(
					`- ${result.item.name} (${result.matchType}, score: ${result.score})`
				);
				if (result.item.description) {
					console.log(
						`  Description: ${result.item.description.substring(
							0,
							100
						)}...`
					);
				}
			});

			expect(results.length).toBeGreaterThan(0);
		});

		test("should search by keywords", () => {
			const results = indexer.search("checkbox");

			console.log("Search results for 'checkbox':", results.length);
			results.forEach((result) => {
				console.log(
					`- ${result.item.name} (${result.matchType}, score: ${result.score})`
				);
				console.log(`  Keywords: ${result.item.keywords.join(", ")}`);
			});

			expect(results.length).toBeGreaterThan(0);
		});

		test("should prioritize name matches over description matches", () => {
			const results = indexer.search("filter");

			console.log("Search results for 'filter' with scores:");
			results.forEach((result) => {
				console.log(
					`- ${result.item.name} (${result.matchType}, score: ${result.score})`
				);
			});

			expect(results.length).toBeGreaterThan(0);

			// Find name matches and description matches
			const nameMatches = results.filter((r) => r.matchType === "name");
			const descriptionMatches = results.filter(
				(r) => r.matchType === "description"
			);

			if (nameMatches.length > 0 && descriptionMatches.length > 0) {
				// Name matches should have higher scores
				const highestNameScore = Math.max(
					...nameMatches.map((r) => r.score)
				);
				const highestDescScore = Math.max(
					...descriptionMatches.map((r) => r.score)
				);
				expect(highestNameScore).toBeGreaterThan(highestDescScore);
			}
		});

		test("should return empty results for empty query", () => {
			const results = indexer.search("");
			expect(results.length).toBe(0);
		});

		test("should return empty results for very short query", () => {
			const results = indexer.search("a");
			expect(results.length).toBe(0);
		});

		test("should return results for 2+ character query", () => {
			const results = indexer.search("pr");
			expect(results.length).toBeGreaterThan(0);
		});

		test("should limit results", () => {
			const results = indexer.search("task");
			console.log(`Found ${results.length} results for 'task'`);
			expect(results.length).toBeLessThanOrEqual(10); // Default limit
		});

		test("should handle case insensitive search", () => {
			const lowerResults = indexer.search("progress");
			const upperResults = indexer.search("PROGRESS");
			const mixedResults = indexer.search("Progress");

			expect(lowerResults.length).toBe(upperResults.length);
			expect(lowerResults.length).toBe(mixedResults.length);
		});
	});

	describe("Translation Integration", () => {
		test("should call translation function for setting names", () => {
			indexer.search("progress");

			// Should have called t() for translating setting names
			expect(mockT).toHaveBeenCalled();

			// Check if it was called with expected translation keys
			const calls = mockT.mock.calls.map((call: any) => call[0]);
			console.log("Translation calls:", calls.slice(0, 10)); // Show first 10 calls

			expect(calls).toContain("Progress bar");
		});
	});

	describe("Edge Cases", () => {
		test("should handle special characters in search", () => {
			const results = indexer.search("task-filter");
			expect(results.length).toBeGreaterThanOrEqual(0);
		});

		test("should handle unicode characters", () => {
			const results = indexer.search("设置");
			expect(results.length).toBeGreaterThanOrEqual(0);
		});

		test("should handle numbers in search", () => {
			const results = indexer.search("100");
			expect(results.length).toBeGreaterThanOrEqual(0);
		});
	});

	describe("Performance", () => {
		test("should build index quickly", () => {
			const start = performance.now();
			indexer.initialize();
			const end = performance.now();

			const buildTime = end - start;
			console.log(`Index build time: ${buildTime.toFixed(2)}ms`);
			expect(buildTime).toBeLessThan(50); // Should be under 50ms
		});

		test("should search quickly", () => {
			indexer.initialize(); // Pre-initialize

			const start = performance.now();
			const results = indexer.search("progress");
			const end = performance.now();

			const searchTime = end - start;
			console.log(
				`Search time: ${searchTime.toFixed(2)}ms for ${
					results.length
				} results`
			);
			expect(searchTime).toBeLessThan(10); // Should be under 10ms
		});
	});

	describe("Specific Setting Tests", () => {
		test("should find 'Enable Task Filter' setting", () => {
			const results = indexer.search("enable task filter");

			console.log("Searching for 'enable task filter':");
			results.forEach((result) => {
				console.log(`- ${result.item.name} (ID: ${result.item.id})`);
			});

			const exactMatch = results.find(
				(r) => r.item.id === "enable-task-filter"
			);
			expect(exactMatch).toBeDefined();
		});

		test("should find progress bar settings", () => {
			const results = indexer.search("progress bar");

			console.log("Searching for 'progress bar':");
			results.forEach((result) => {
				console.log(`- ${result.item.name} (ID: ${result.item.id})`);
			});

			const progressBarMain = results.find(
				(r) => r.item.id === "progress-bar-main"
			);
			expect(progressBarMain).toBeDefined();
			expect(progressBarMain?.matchType).toBe("name");
		});

		test("should find settings by partial name", () => {
			const results = indexer.search("workflow");

			console.log("Searching for 'workflow':");
			results.forEach((result) => {
				console.log(`- ${result.item.name} (ID: ${result.item.id})`);
			});

			expect(results.length).toBeGreaterThan(0);

			// Should find workflow-related settings
			const workflowSettings = results.filter(
				(r) =>
					r.item.name.toLowerCase().includes("workflow") ||
					r.item.tabId === "workflow"
			);
			expect(workflowSettings.length).toBeGreaterThan(0);
		});
	});
});
