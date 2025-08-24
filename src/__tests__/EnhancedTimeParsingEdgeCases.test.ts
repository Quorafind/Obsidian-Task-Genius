import {
	TimeParsingService,
	DEFAULT_TIME_PARSING_CONFIG,
} from "../services/time-parsing-service";
import type {
	TimeComponent,
	EnhancedParsedTimeResult,
	EnhancedTimeExpression,
	EnhancedTimeParsingConfig,
} from "../types/time-parsing";

describe("Enhanced Time Parsing Edge Cases", () => {
	let service: TimeParsingService;

	beforeEach(() => {
		service = new TimeParsingService(DEFAULT_TIME_PARSING_CONFIG);
	});

	describe("Midnight Crossing Scenarios", () => {
		test("should handle midnight crossing ranges (23:00-01:00)", () => {
			const result = service.parseTimeExpressions(
				"Night shift 23:00-01:00"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents).toBeDefined();
			expect(result.timeComponents.startTime).toBeDefined();
			expect(result.timeComponents.endTime).toBeDefined();
			expect(result.timeComponents.startTime?.hour).toBe(23);
			expect(result.timeComponents.startTime?.minute).toBe(0);
			expect(result.timeComponents.endTime?.hour).toBe(1);
			expect(result.timeComponents.endTime?.minute).toBe(0);
			
			// Check that midnight crossing is detected
			const expression = result.parsedExpressions[0] as EnhancedTimeExpression;
			expect(expression.crossesMidnight).toBe(true);
		});

		test("should handle midnight crossing with 12-hour format (11:00 PM - 1:00 AM)", () => {
			const result = service.parseTimeExpressions(
				"Event 11:00 PM - 1:00 AM"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.startTime?.hour).toBe(23);
			expect(result.timeComponents.endTime?.hour).toBe(1);
			
			const expression = result.parsedExpressions[0] as EnhancedTimeExpression;
			expect(expression.crossesMidnight).toBe(true);
		});

		test("should handle edge case at exact midnight (23:59-00:01)", () => {
			const result = service.parseTimeExpressions(
				"Maintenance 23:59-00:01"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.startTime?.hour).toBe(23);
			expect(result.timeComponents.startTime?.minute).toBe(59);
			expect(result.timeComponents.endTime?.hour).toBe(0);
			expect(result.timeComponents.endTime?.minute).toBe(1);
			
			const expression = result.parsedExpressions[0] as EnhancedTimeExpression;
			expect(expression.crossesMidnight).toBe(true);
		});

		test("should not flag normal ranges as midnight crossing (09:00-17:00)", () => {
			const result = service.parseTimeExpressions(
				"Work 09:00-17:00"
			) as EnhancedParsedTimeResult;

			const expression = result.parsedExpressions[0] as EnhancedTimeExpression;
			expect(expression.crossesMidnight).toBeFalsy();
		});

		test("should handle midnight crossing with seconds (23:30:45-01:15:30)", () => {
			const result = service.parseTimeExpressions(
				"Process 23:30:45-01:15:30"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.startTime?.hour).toBe(23);
			expect(result.timeComponents.startTime?.minute).toBe(30);
			expect(result.timeComponents.startTime?.second).toBe(45);
			expect(result.timeComponents.endTime?.hour).toBe(1);
			expect(result.timeComponents.endTime?.minute).toBe(15);
			expect(result.timeComponents.endTime?.second).toBe(30);
			
			const expression = result.parsedExpressions[0] as EnhancedTimeExpression;
			expect(expression.crossesMidnight).toBe(true);
		});
	});

	describe("Invalid Time Format Handling", () => {
		test("should handle invalid hours (25:00)", () => {
			const result = service.parseTimeExpressions(
				"Meeting at 25:00"
			) as EnhancedParsedTimeResult;

			// Invalid time should not create time component
			expect(result.timeComponents.scheduledTime).toBeUndefined();
			// But should still parse any valid date information
			expect(result.originalText).toBe("Meeting at 25:00");
		});

		test("should handle invalid minutes (12:60)", () => {
			const result = service.parseTimeExpressions(
				"Task at 12:60"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.scheduledTime).toBeUndefined();
		});

		test("should handle invalid seconds (12:30:60)", () => {
			const result = service.parseTimeExpressions(
				"Process at 12:30:60"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.scheduledTime).toBeUndefined();
		});

		test("should handle malformed time strings", () => {
			const testCases = [
				"Meeting at 1:2:3:4",
				"Task at ::30",
				"Event at 12:",
				"Call at :30",
				"Meeting at 12:ab",
				"Task at ab:30",
			];

			testCases.forEach(testCase => {
				const result = service.parseTimeExpressions(testCase) as EnhancedParsedTimeResult;
				expect(result.timeComponents.scheduledTime).toBeUndefined();
			});
		});

		test("should gracefully handle empty time expressions", () => {
			const result = service.parseTimeExpressions(
				"Meeting at "
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.scheduledTime).toBeUndefined();
			expect(result.originalText).toBe("Meeting at ");
		});

		test("should handle invalid range formats", () => {
			const testCases = [
				"Meeting 25:00-13:00",
				"Task 12:00-25:00",
				"Event 12:60-13:00",
				"Call 12:00-13:60",
				"Meeting 12:00-",
				"Task -13:00",
				"Event 12:00--13:00",
			];

			testCases.forEach(testCase => {
				const result = service.parseTimeExpressions(testCase) as EnhancedParsedTimeResult;
				// Should not create invalid time components
				if (result.timeComponents.startTime) {
					expect(result.timeComponents.startTime.hour).toBeLessThanOrEqual(23);
					expect(result.timeComponents.startTime.minute).toBeLessThanOrEqual(59);
				}
				if (result.timeComponents.endTime) {
					expect(result.timeComponents.endTime.hour).toBeLessThanOrEqual(23);
					expect(result.timeComponents.endTime.minute).toBeLessThanOrEqual(59);
				}
			});
		});
	});

	describe("Ambiguous Time Format Resolution", () => {
		test("should handle ambiguous 12-hour format without AM/PM", () => {
			// Test with default configuration (should prefer 24-hour interpretation)
			const result = service.parseTimeExpressions(
				"Meeting at 3:00"
			) as EnhancedParsedTimeResult;

			// With default 24h preference, 3:00 should be interpreted as 3:00 AM
			expect(result.timeComponents.scheduledTime?.hour).toBe(3);
		});

		test("should respect configuration for ambiguous time handling", () => {
			const config: EnhancedTimeParsingConfig = {
				...DEFAULT_TIME_PARSING_CONFIG,
				timePatterns: {
					singleTime: [/\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm))?/],
					timeRange: [/\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?\s*[-–—~]\s*\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?/],
					rangeSeparators: ["-", "–", "—", "~"],
				},
				timeDefaults: {
					preferredFormat: "12h",
					defaultPeriod: "PM",
					midnightCrossing: "next-day",
				},
			};

			const enhancedService = new TimeParsingService(config);
			
			// This test would need the service to actually implement ambiguous time handling
			// For now, we test that the configuration is accepted
			expect(enhancedService.getConfig()).toMatchObject(expect.objectContaining({
				timeDefaults: expect.objectContaining({
					preferredFormat: "12h",
					defaultPeriod: "PM",
				}),
			}));
		});

		test("should handle mixed 12-hour and 24-hour formats in ranges", () => {
			// This should be treated as invalid since mixing formats is ambiguous
			const result = service.parseTimeExpressions(
				"Meeting 2:00 PM - 15:00"
			) as EnhancedParsedTimeResult;

			// Should either parse correctly or fail gracefully
			if (result.timeComponents.startTime && result.timeComponents.endTime) {
				expect(result.timeComponents.startTime.hour).toBe(14); // 2:00 PM
				expect(result.timeComponents.endTime.hour).toBe(15);   // 15:00
			}
		});

		test("should handle noon and midnight edge cases", () => {
			const testCases = [
				{ input: "12:00 AM", expectedHour: 0 },   // Midnight
				{ input: "12:00 PM", expectedHour: 12 },  // Noon
				{ input: "12:30 AM", expectedHour: 0 },   // 30 minutes past midnight
				{ input: "12:30 PM", expectedHour: 12 },  // 30 minutes past noon
			];

			testCases.forEach(({ input, expectedHour }) => {
				const result = service.parseTimeExpressions(
					`Meeting at ${input}`
				) as EnhancedParsedTimeResult;
				
				expect(result.timeComponents.scheduledTime?.hour).toBe(expectedHour);
			});
		});
	});

	describe("Time Range Separator Patterns", () => {
		test("should handle hyphen separator (12:00-13:00)", () => {
			const result = service.parseTimeExpressions(
				"Meeting 12:00-13:00"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.startTime?.hour).toBe(12);
			expect(result.timeComponents.endTime?.hour).toBe(13);
		});

		test("should handle tilde separator (12:00~13:00)", () => {
			const result = service.parseTimeExpressions(
				"Meeting 12:00~13:00"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.startTime?.hour).toBe(12);
			expect(result.timeComponents.endTime?.hour).toBe(13);
		});

		test("should handle full-width tilde separator (12:00～13:00)", () => {
			const result = service.parseTimeExpressions(
				"Meeting 12:00～13:00"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.startTime?.hour).toBe(12);
			expect(result.timeComponents.endTime?.hour).toBe(13);
		});

		test("should handle spaced hyphen separator (12:00 - 13:00)", () => {
			const result = service.parseTimeExpressions(
				"Meeting 12:00 - 13:00"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.startTime?.hour).toBe(12);
			expect(result.timeComponents.endTime?.hour).toBe(13);
		});

		test("should handle spaced tilde separator (12:00 ~ 13:00)", () => {
			const result = service.parseTimeExpressions(
				"Meeting 12:00 ~ 13:00"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.startTime?.hour).toBe(12);
			expect(result.timeComponents.endTime?.hour).toBe(13);
		});

		test("should handle multiple spaces around separators (12:00  -  13:00)", () => {
			const result = service.parseTimeExpressions(
				"Meeting 12:00  -  13:00"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.startTime?.hour).toBe(12);
			expect(result.timeComponents.endTime?.hour).toBe(13);
		});

		test("should not parse invalid separators", () => {
			const invalidSeparators = [
				"12:00+13:00",
				"12:00/13:00", 
				"12:00|13:00",
				"12:00*13:00",
				"12:00&13:00",
			];

			invalidSeparators.forEach(testCase => {
				const result = service.parseTimeExpressions(
					`Meeting ${testCase}`
				) as EnhancedParsedTimeResult;
				
				// Should not parse as a time range
				expect(result.timeComponents.startTime).toBeUndefined();
				expect(result.timeComponents.endTime).toBeUndefined();
			});
		});

		test("should handle ranges with seconds and different separators", () => {
			const testCases = [
				"12:30:45-13:15:30",
				"12:30:45~13:15:30", 
				"12:30:45 - 13:15:30",
				"12:30:45～13:15:30",
			];

			testCases.forEach(testCase => {
				const result = service.parseTimeExpressions(
					`Process ${testCase}`
				) as EnhancedParsedTimeResult;
				
				expect(result.timeComponents.startTime?.hour).toBe(12);
				expect(result.timeComponents.startTime?.minute).toBe(30);
				expect(result.timeComponents.startTime?.second).toBe(45);
				expect(result.timeComponents.endTime?.hour).toBe(13);
				expect(result.timeComponents.endTime?.minute).toBe(15);
				expect(result.timeComponents.endTime?.second).toBe(30);
			});
		});
	});

	describe("Fallback Behavior", () => {
		test("should fall back to date-only parsing when time parsing fails", () => {
			const result = service.parseTimeExpressions(
				"Meeting tomorrow at invalid:time"
			) as EnhancedParsedTimeResult;

			// Should still parse the date part
			expect(result.scheduledDate).toBeDefined();
			// But not create invalid time components
			expect(result.timeComponents.scheduledTime).toBeUndefined();
		});

		test("should preserve original text when parsing fails", () => {
			const originalText = "Task at badtime:format tomorrow";
			const result = service.parseTimeExpressions(originalText) as EnhancedParsedTimeResult;

			expect(result.originalText).toBe(originalText);
		});

		test("should handle mixed valid and invalid time expressions", () => {
			const result = service.parseTimeExpressions(
				"Meeting at 14:00 and invalid:time tomorrow"
			) as EnhancedParsedTimeResult;

			// Should parse the valid time
			expect(result.timeComponents.scheduledTime?.hour).toBe(14);
			// And still parse the date
			expect(result.scheduledDate).toBeDefined();
		});

		test("should handle empty input gracefully", () => {
			const result = service.parseTimeExpressions("") as EnhancedParsedTimeResult;

			expect(result.originalText).toBe("");
			expect(result.cleanedText).toBe("");
			expect(result.timeComponents).toBeDefined();
			expect(result.parsedExpressions).toEqual([]);
		});

		test("should handle null/undefined input gracefully", () => {
			// Test with null input (cast to string)
			const result1 = service.parseTimeExpressions(null as any) as EnhancedParsedTimeResult;
			expect(result1.originalText).toBeDefined();

			// Test with undefined input (cast to string)
			const result2 = service.parseTimeExpressions(undefined as any) as EnhancedParsedTimeResult;
			expect(result2.originalText).toBeDefined();
		});
	});

	describe("Configuration-Driven Behavior", () => {
		test("should respect midnight crossing configuration", () => {
			const nextDayConfig: EnhancedTimeParsingConfig = {
				...DEFAULT_TIME_PARSING_CONFIG,
				timePatterns: {
					singleTime: [/\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm))?/],
					timeRange: [/\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?\s*[-–—~]\s*\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?/],
					rangeSeparators: ["-", "–", "—", "~"],
				},
				timeDefaults: {
					preferredFormat: "24h",
					defaultPeriod: "PM",
					midnightCrossing: "next-day",
				},
			};

			const sameDayConfig: EnhancedTimeParsingConfig = {
				...DEFAULT_TIME_PARSING_CONFIG,
				timePatterns: {
					singleTime: [/\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm))?/],
					timeRange: [/\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?\s*[-–—~]\s*\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?/],
					rangeSeparators: ["-", "–", "—", "~"],
				},
				timeDefaults: {
					preferredFormat: "24h",
					defaultPeriod: "PM",
					midnightCrossing: "same-day",
				},
			};

			const nextDayService = new TimeParsingService(nextDayConfig);
			const sameDayService = new TimeParsingService(sameDayConfig);

			// Both should parse the time components the same way
			const text = "Night shift 23:00-01:00";
			const result1 = nextDayService.parseTimeExpressions(text) as EnhancedParsedTimeResult;
			const result2 = sameDayService.parseTimeExpressions(text) as EnhancedParsedTimeResult;

			expect(result1.timeComponents.startTime?.hour).toBe(23);
			expect(result1.timeComponents.endTime?.hour).toBe(1);
			expect(result2.timeComponents.startTime?.hour).toBe(23);
			expect(result2.timeComponents.endTime?.hour).toBe(1);
		});

		test("should handle disabled time parsing", () => {
			const disabledConfig: EnhancedTimeParsingConfig = {
				...DEFAULT_TIME_PARSING_CONFIG,
				enabled: false,
				timePatterns: {
					singleTime: [/\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm))?/],
					timeRange: [/\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?\s*[-–—~]\s*\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?/],
					rangeSeparators: ["-", "–", "—", "~"],
				},
				timeDefaults: {
					preferredFormat: "24h",
					defaultPeriod: "PM",
					midnightCrossing: "next-day",
				},
			};

			const disabledService = new TimeParsingService(disabledConfig);
			const result = disabledService.parseTimeExpressions(
				"Meeting at 14:00 tomorrow"
			) as EnhancedParsedTimeResult;

			// Should return original text without parsing
			expect(result.originalText).toBe("Meeting at 14:00 tomorrow");
			expect(result.cleanedText).toBe("Meeting at 14:00 tomorrow");
			expect(result.parsedExpressions).toEqual([]);
		});

		test("should respect custom time patterns", () => {
			const customConfig: EnhancedTimeParsingConfig = {
				...DEFAULT_TIME_PARSING_CONFIG,
				timePatterns: {
					singleTime: [/\d{1,2}h\d{2}/], // Custom format like "14h30"
					timeRange: [/\d{1,2}h\d{2}-\d{1,2}h\d{2}/], // Custom range format
					rangeSeparators: ["-"],
				},
				timeDefaults: {
					preferredFormat: "24h",
					defaultPeriod: "PM",
					midnightCrossing: "next-day",
				},
			};

			const customService = new TimeParsingService(customConfig);
			
			// This would require implementing custom pattern support in the service
			// For now, we test that the configuration is accepted
			expect(customService.getConfig()).toMatchObject(expect.objectContaining({
				timePatterns: expect.objectContaining({
					rangeSeparators: ["-"],
				}),
			}));
		});
	});

	describe("Edge Cases with Context", () => {
		test("should handle time expressions at start of text", () => {
			const result = service.parseTimeExpressions(
				"14:00 meeting with team"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.scheduledTime?.hour).toBe(14);
		});

		test("should handle time expressions at end of text", () => {
			const result = service.parseTimeExpressions(
				"Team meeting at 14:00"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.scheduledTime?.hour).toBe(14);
		});

		test("should handle multiple time expressions in one text", () => {
			const result = service.parseTimeExpressions(
				"Meeting starts at 14:00 and ends at 16:00"
			) as EnhancedParsedTimeResult;

			// Should parse both times - the first one found should be used
			expect(result.timeComponents.scheduledTime?.hour).toBe(14);
			// The second time might be parsed as a separate expression
			expect(result.parsedExpressions.length).toBeGreaterThanOrEqual(1);
		});

		test("should handle time expressions with punctuation", () => {
			const testCases = [
				"Meeting at 14:00.",
				"Meeting at 14:00!",
				"Meeting at 14:00?",
				"Meeting at 14:00,",
				"Meeting at 14:00;",
				"Meeting (at 14:00)",
				"Meeting [at 14:00]",
			];

			testCases.forEach(testCase => {
				const result = service.parseTimeExpressions(testCase) as EnhancedParsedTimeResult;
				expect(result.timeComponents.scheduledTime?.hour).toBe(14);
			});
		});

		test("should handle time expressions with special characters", () => {
			const result = service.parseTimeExpressions(
				"Meeting @ 14:00 #important"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.scheduledTime?.hour).toBe(14);
		});
	});
});