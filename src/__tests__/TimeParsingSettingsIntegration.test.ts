/**
 * Integration tests for time parsing settings integration
 * Tests that settings changes properly update TimeParsingService behavior
 */

import { TimeParsingService } from "../services/time-parsing-service";
import type { EnhancedTimeParsingConfig } from "../types/time-parsing";

describe("TimeParsingSettingsIntegration", () => {
	let service: TimeParsingService;
	let baseConfig: EnhancedTimeParsingConfig;

	beforeEach(() => {
		baseConfig = {
			enabled: true,
			supportedLanguages: ["en", "zh"],
			dateKeywords: {
				start: ["start", "begin", "from"],
				due: ["due", "deadline", "by", "until"],
				scheduled: ["scheduled", "on", "at"],
			},
			removeOriginalText: true,
			perLineProcessing: true,
			realTimeReplacement: true,
			timePatterns: {
				singleTime: [
					/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/g,
					/\b(1[0-2]|0?[1-9]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)\b/g,
				],
				timeRange: [
					/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*[-~～]\s*([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/g,
					/\b(1[0-2]|0?[1-9]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)?\s*[-~～]\s*(1[0-2]|0?[1-9]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)\b/g,
				],
				rangeSeparators: ["-", "~", "～", " - ", " ~ ", " ～ "],
			},
			timeDefaults: {
				preferredFormat: "24h",
				defaultPeriod: "AM",
				midnightCrossing: "next-day",
			},
		};

		service = new TimeParsingService(baseConfig);
	});

	describe("Settings Update Integration", () => {
		test("should update time format preferences", () => {
			// Update to 12h preference
			const updatedConfig = {
				...baseConfig,
				timeDefaults: {
					...baseConfig.timeDefaults,
					preferredFormat: "12h" as const,
				},
			};

			service.updateConfig(updatedConfig);

			// Verify the configuration was updated
			const config = service.getConfig();
			expect(config.timeDefaults?.preferredFormat).toBe("12h");
		});

		test("should update default AM/PM period", () => {
			// Update default period to PM
			const updatedConfig = {
				...baseConfig,
				timeDefaults: {
					...baseConfig.timeDefaults,
					defaultPeriod: "PM" as const,
				},
			};

			service.updateConfig(updatedConfig);

			// Verify the configuration was updated
			const config = service.getConfig();
			expect(config.timeDefaults?.defaultPeriod).toBe("PM");
		});

		test("should update midnight crossing behavior", () => {
			// Update midnight crossing to same-day
			const updatedConfig = {
				...baseConfig,
				timeDefaults: {
					...baseConfig.timeDefaults,
					midnightCrossing: "same-day" as const,
				},
			};

			service.updateConfig(updatedConfig);

			// Verify the configuration was updated
			const config = service.getConfig();
			expect(config.timeDefaults?.midnightCrossing).toBe("same-day");
		});

		test("should update time range separators", () => {
			// Update range separators
			const updatedConfig = {
				...baseConfig,
				timePatterns: {
					...baseConfig.timePatterns,
					rangeSeparators: ["-", "to", "until"],
				},
			};

			service.updateConfig(updatedConfig);

			// Verify the configuration was updated
			const config = service.getConfig();
			expect(config.timePatterns?.rangeSeparators).toEqual(["-", "to", "until"]);
		});

		test("should update date keywords", () => {
			// Update date keywords
			const updatedConfig = {
				...baseConfig,
				dateKeywords: {
					start: ["begin", "commence", "initiate"],
					due: ["deadline", "expires", "finish"],
					scheduled: ["planned", "arranged", "set"],
				},
			};

			service.updateConfig(updatedConfig);

			// Verify the configuration was updated
			const config = service.getConfig();
			expect(config.dateKeywords.start).toEqual(["begin", "commence", "initiate"]);
			expect(config.dateKeywords.due).toEqual(["deadline", "expires", "finish"]);
			expect(config.dateKeywords.scheduled).toEqual(["planned", "arranged", "set"]);
		});

		test("should disable/enable time parsing", () => {
			// Test enabled parsing
			let result = service.parseTimeExpressions("Meeting at 14:00 tomorrow");
			expect(result.parsedExpressions.length).toBeGreaterThan(0);

			// Disable parsing
			const disabledConfig = {
				...baseConfig,
				enabled: false,
			};

			service.updateConfig(disabledConfig);

			// Test disabled parsing
			result = service.parseTimeExpressions("Meeting at 14:00 tomorrow");
			expect(result.parsedExpressions.length).toBe(0);
			expect(result.cleanedText).toBe("Meeting at 14:00 tomorrow");
		});

		test("should update text removal behavior", () => {
			// Test with text removal enabled
			let result = service.parseTimeExpressions("Meeting tomorrow");
			expect(result.cleanedText).not.toBe("Meeting tomorrow");

			// Disable text removal
			const noRemovalConfig = {
				...baseConfig,
				removeOriginalText: false,
			};

			service.updateConfig(noRemovalConfig);

			// Test with text removal disabled
			result = service.parseTimeExpressions("Meeting tomorrow");
			expect(result.cleanedText).toBe("Meeting tomorrow");
		});
	});

	describe("Cache Invalidation", () => {
		test("should clear cache when settings change", () => {
			// Parse something to populate cache
			const text = "Meeting at 14:00 tomorrow";
			const result1 = service.parseTimeExpressions(text);

			// Update settings
			const updatedConfig = {
				...baseConfig,
				removeOriginalText: false,
			};

			service.updateConfig(updatedConfig);

			// Parse the same text again - should get different result due to cache invalidation
			const result2 = service.parseTimeExpressions(text);

			// Results should be different due to removeOriginalText setting change
			expect(result1.cleanedText).not.toBe(result2.cleanedText);
		});

		test("should handle cache clearing explicitly", () => {
			// Parse something to populate cache
			service.parseTimeExpressions("Meeting at 14:00 tomorrow");

			// Clear cache explicitly
			service.clearCache();

			// This should work without errors
			const result = service.parseTimeExpressions("Another meeting at 15:00");
			expect(result).toBeDefined();
		});
	});

	describe("Configuration Validation", () => {
		test("should handle partial configuration updates", () => {
			// Update only part of the configuration
			service.updateConfig({
				enabled: false,
			});

			const config = service.getConfig();
			expect(config.enabled).toBe(false);
			// Other settings should remain unchanged
			expect(config.supportedLanguages).toEqual(["en", "zh"]);
		});

		test("should handle invalid configuration gracefully", () => {
			// This should not throw an error
			expect(() => {
				service.updateConfig({
					// @ts-ignore - testing invalid config
					invalidProperty: "invalid",
				});
			}).not.toThrow();
		});

		test("should maintain configuration consistency", () => {
			const originalConfig = service.getConfig();

			// Update configuration
			const updates = {
				enabled: false,
				removeOriginalText: false,
			};

			service.updateConfig(updates);

			const updatedConfig = service.getConfig();

			// Updated properties should change
			expect(updatedConfig.enabled).toBe(false);
			expect(updatedConfig.removeOriginalText).toBe(false);

			// Unchanged properties should remain the same
			expect(updatedConfig.supportedLanguages).toEqual(originalConfig.supportedLanguages);
			expect(updatedConfig.dateKeywords).toEqual(originalConfig.dateKeywords);
		});
	});

	describe("Real-world Settings Scenarios", () => {
		test("should handle user switching from 12h to 24h format", () => {
			// Start with 12h format preference
			const config12h = {
				...baseConfig,
				timeDefaults: {
					...baseConfig.timeDefaults,
					preferredFormat: "12h" as const,
				},
			};

			service.updateConfig(config12h);

			// Verify initial configuration
			let config = service.getConfig();
			expect(config.timeDefaults?.preferredFormat).toBe("12h");

			// Switch to 24h format
			const config24h = {
				...baseConfig,
				timeDefaults: {
					...baseConfig.timeDefaults,
					preferredFormat: "24h" as const,
				},
			};

			service.updateConfig(config24h);

			// Verify configuration was updated
			config = service.getConfig();
			expect(config.timeDefaults?.preferredFormat).toBe("24h");
		});

		test("should handle user adding custom range separators", () => {
			// Add custom separators
			const customConfig = {
				...baseConfig,
				timePatterns: {
					...baseConfig.timePatterns,
					rangeSeparators: ["-", "~", "to", "until", "through"],
				},
			};

			service.updateConfig(customConfig);

			// Verify configuration was updated
			const config = service.getConfig();
			expect(config.timePatterns?.rangeSeparators).toEqual(["-", "~", "to", "until", "through"]);
		});

		test("should handle user customizing date keywords", () => {
			// Add custom keywords
			const customConfig = {
				...baseConfig,
				dateKeywords: {
					start: ["start", "begin", "commence", "kick off"],
					due: ["due", "deadline", "must finish", "complete by"],
					scheduled: ["scheduled", "planned", "set for", "arranged"],
				},
			};

			service.updateConfig(customConfig);

			// Test that new keywords work
			const result = service.parseTimeExpressions("Task must finish by tomorrow at 14:00");
			expect(result.dueDate).toBeDefined();
		});
	});
});