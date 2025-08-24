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

describe("Enhanced TimeParsingService", () => {
	let service: TimeParsingService;

	beforeEach(() => {
		service = new TimeParsingService(DEFAULT_TIME_PARSING_CONFIG);
	});

	describe("TimeComponent Interface", () => {
		test("should create TimeComponent from 24-hour format (12:00)", () => {
			const result = service.parseTimeExpressions(
				"Meeting at 12:00"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents).toBeDefined();
			expect(result.timeComponents.scheduledTime).toBeDefined();
			expect(result.timeComponents.scheduledTime?.hour).toBe(12);
			expect(result.timeComponents.scheduledTime?.minute).toBe(0);
			expect(result.timeComponents.scheduledTime?.originalText).toBe("12:00");
			expect(result.timeComponents.scheduledTime?.isRange).toBe(false);
		});

		test("should create TimeComponent from 24-hour format with seconds (12:00:00)", () => {
			const result = service.parseTimeExpressions(
				"Task at 12:00:00"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents).toBeDefined();
			expect(result.timeComponents.scheduledTime).toBeDefined();
			expect(result.timeComponents.scheduledTime?.hour).toBe(12);
			expect(result.timeComponents.scheduledTime?.minute).toBe(0);
			expect(result.timeComponents.scheduledTime?.second).toBe(0);
			expect(result.timeComponents.scheduledTime?.originalText).toBe("12:00:00");
		});

		test("should create TimeComponent from 12-hour format (1:30 PM)", () => {
			const result = service.parseTimeExpressions(
				"Meeting at 1:30 PM"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents).toBeDefined();
			expect(result.timeComponents.scheduledTime).toBeDefined();
			expect(result.timeComponents.scheduledTime?.hour).toBe(13);
			expect(result.timeComponents.scheduledTime?.minute).toBe(30);
			expect(result.timeComponents.scheduledTime?.originalText).toBe("1:30 PM");
		});

		test("should handle time range with hyphen separator (12:00-13:00)", () => {
			const result = service.parseTimeExpressions(
				"Meeting 12:00-13:00"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents).toBeDefined();
			expect(result.timeComponents.startTime).toBeDefined();
			expect(result.timeComponents.endTime).toBeDefined();
			expect(result.timeComponents.startTime?.hour).toBe(12);
			expect(result.timeComponents.startTime?.minute).toBe(0);
			expect(result.timeComponents.startTime?.isRange).toBe(true);
			expect(result.timeComponents.endTime?.hour).toBe(13);
			expect(result.timeComponents.endTime?.minute).toBe(0);
			expect(result.timeComponents.endTime?.isRange).toBe(true);
		});

		test("should handle time range with tilde separator (12:00~13:00)", () => {
			const result = service.parseTimeExpressions(
				"Meeting 12:00~13:00"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents).toBeDefined();
			expect(result.timeComponents.startTime).toBeDefined();
			expect(result.timeComponents.endTime).toBeDefined();
			expect(result.timeComponents.startTime?.hour).toBe(12);
			expect(result.timeComponents.endTime?.hour).toBe(13);
		});

		test("should handle time range with space separator (12:00 - 13:00)", () => {
			const result = service.parseTimeExpressions(
				"Meeting 12:00 - 13:00"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents).toBeDefined();
			expect(result.timeComponents.startTime).toBeDefined();
			expect(result.timeComponents.endTime).toBeDefined();
			expect(result.timeComponents.startTime?.hour).toBe(12);
			expect(result.timeComponents.endTime?.hour).toBe(13);
		});
	});

	describe("Enhanced ParsedTimeResult", () => {
		test("should include parsedExpressions with time components", () => {
			const result = service.parseTimeExpressions(
				"Task at 14:30 tomorrow"
			) as EnhancedParsedTimeResult;

			expect(result.parsedExpressions).toBeDefined();
			expect(result.parsedExpressions.length).toBeGreaterThan(0);
			
			const expression = result.parsedExpressions[0] as EnhancedTimeExpression;
			expect(expression.timeComponent).toBeDefined();
			expect(expression.timeComponent?.hour).toBe(14);
			expect(expression.timeComponent?.minute).toBe(30);
			expect(expression.isTimeRange).toBe(false);
		});

		test("should handle time ranges in parsedExpressions", () => {
			const result = service.parseTimeExpressions(
				"Meeting 14:00-16:00 tomorrow"
			) as EnhancedParsedTimeResult;

			expect(result.parsedExpressions).toBeDefined();
			const expression = result.parsedExpressions[0] as EnhancedTimeExpression;
			expect(expression.isTimeRange).toBe(true);
			expect(expression.rangeStart).toBeDefined();
			expect(expression.rangeEnd).toBeDefined();
			expect(expression.rangeStart?.hour).toBe(14);
			expect(expression.rangeEnd?.hour).toBe(16);
		});
	});

	describe("Time Pattern Recognition", () => {
		test("should recognize various 24-hour formats", () => {
			const testCases = [
				{ input: "09:00", expected: { hour: 9, minute: 0 } },
				{ input: "13:30", expected: { hour: 13, minute: 30 } },
				{ input: "23:59", expected: { hour: 23, minute: 59 } },
				{ input: "00:00", expected: { hour: 0, minute: 0 } },
			];

			testCases.forEach(({ input, expected }) => {
				const result = service.parseTimeExpressions(
					`Task at ${input}`
				) as EnhancedParsedTimeResult;
				expect(result.timeComponents.scheduledTime?.hour).toBe(expected.hour);
				expect(result.timeComponents.scheduledTime?.minute).toBe(expected.minute);
			});
		});

		test("should recognize various 12-hour formats", () => {
			const testCases = [
				{ input: "9:00 AM", expected: { hour: 9, minute: 0 } },
				{ input: "1:30 PM", expected: { hour: 13, minute: 30 } },
				{ input: "11:59 PM", expected: { hour: 23, minute: 59 } },
				{ input: "12:00 AM", expected: { hour: 0, minute: 0 } },
				{ input: "12:00 PM", expected: { hour: 12, minute: 0 } },
			];

			testCases.forEach(({ input, expected }) => {
				const result = service.parseTimeExpressions(
					`Task at ${input}`
				) as EnhancedParsedTimeResult;
				expect(result.timeComponents.scheduledTime?.hour).toBe(expected.hour);
				expect(result.timeComponents.scheduledTime?.minute).toBe(expected.minute);
			});
		});

		test("should handle midnight crossing ranges (23:00-01:00)", () => {
			const result = service.parseTimeExpressions(
				"Night shift 23:00-01:00"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents.startTime?.hour).toBe(23);
			expect(result.timeComponents.endTime?.hour).toBe(1);
			// Should indicate next day for end time
			expect(result.parsedExpressions[0]).toHaveProperty("crossesMidnight", true);
		});
	});

	describe("Time Validation", () => {
		test("should validate hour range (0-23)", () => {
			const result = service.parseTimeExpressions(
				"Task at 25:00"
			) as EnhancedParsedTimeResult;

			// Invalid time should not be parsed
			expect(result.timeComponents.scheduledTime).toBeUndefined();
		});

		test("should validate minute range (0-59)", () => {
			const result = service.parseTimeExpressions(
				"Task at 12:60"
			) as EnhancedParsedTimeResult;

			// Invalid time should not be parsed
			expect(result.timeComponents.scheduledTime).toBeUndefined();
		});

		test("should validate second range (0-59)", () => {
			const result = service.parseTimeExpressions(
				"Task at 12:30:60"
			) as EnhancedParsedTimeResult;

			// Invalid time should not be parsed
			expect(result.timeComponents.scheduledTime).toBeUndefined();
		});
	});

	describe("Error Handling", () => {
		test("should gracefully handle invalid time formats", () => {
			const result = service.parseTimeExpressions(
				"Task at invalid:time"
			) as EnhancedParsedTimeResult;

			expect(result.timeComponents).toBeDefined();
			expect(result.timeComponents.scheduledTime).toBeUndefined();
			expect(result.originalText).toBe("Task at invalid:time");
		});

		test("should fall back to date-only parsing when time parsing fails", () => {
			const result = service.parseTimeExpressions(
				"Task tomorrow at badtime"
			) as EnhancedParsedTimeResult;

			// Should still parse the date part
			expect(result.dueDate).toBeDefined();
			expect(result.timeComponents.dueTime).toBeUndefined();
		});
	});

	describe("Configuration", () => {
		test("should respect time parsing configuration", () => {
			const config: EnhancedTimeParsingConfig = {
				...DEFAULT_TIME_PARSING_CONFIG,
				timePatterns: {
					singleTime: [/\d{1,2}:\d{2}/],
					timeRange: [/\d{1,2}:\d{2}-\d{1,2}:\d{2}/],
					rangeSeparators: ["-", "~", " - "],
				},
				timeDefaults: {
					preferredFormat: "24h",
					defaultPeriod: "PM",
					midnightCrossing: "next-day",
				},
			};

			const enhancedService = new TimeParsingService(config);
			const result = enhancedService.parseTimeExpressions(
				"Task at 3:00"
			) as EnhancedParsedTimeResult;

			// With 24h preference and PM default, ambiguous 3:00 should be 15:00
			expect(result.timeComponents.scheduledTime?.hour).toBe(15);
		});
	});
});