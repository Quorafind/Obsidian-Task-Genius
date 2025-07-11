import {
	TimeParsingService,
	DEFAULT_TIME_PARSING_CONFIG,
	LineParseResult,
} from "../utils/TimeParsingService";

describe("TimeParsingService", () => {
	let service: TimeParsingService;

	beforeEach(() => {
		service = new TimeParsingService(DEFAULT_TIME_PARSING_CONFIG);
	});

	describe("English Time Expressions", () => {
		test('should parse "tomorrow"', () => {
			const result = service.parseTimeExpressions("go to bed tomorrow");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].text).toBe("tomorrow");
			expect(result.parsedExpressions[0].type).toBe("due");
			expect(result.dueDate).toBeDefined();
			expect(result.cleanedText).toBe("go to bed");
		});

		test('should parse "next week"', () => {
			const result = service.parseTimeExpressions("meeting next week");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].text).toBe("next week");
			expect(result.parsedExpressions[0].type).toBe("due");
			expect(result.dueDate).toBeDefined();
		});

		test('should parse "in 3 days"', () => {
			const result = service.parseTimeExpressions(
				"finish project in 3 days"
			);

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].text).toBe("in 3 days");
			expect(result.dueDate).toBeDefined();

			// Check that the date is approximately 3 days from now
			const now = new Date();
			const threeDaysLater = new Date(
				now.getTime() + 3 * 24 * 60 * 60 * 1000
			);
			const parsedDate = result.dueDate!;

			expect(
				Math.abs(parsedDate.getTime() - threeDaysLater.getTime())
			).toBeLessThan(24 * 60 * 60 * 1000);
		});

		test('should parse "by Friday"', () => {
			const result = service.parseTimeExpressions(
				"submit report by Friday"
			);

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].text).toBe("Friday");
			expect(result.dueDate).toBeDefined();
		});

		test('should detect start date with "start" keyword', () => {
			const result = service.parseTimeExpressions(
				"start project tomorrow"
			);

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].type).toBe("start");
			expect(result.startDate).toBeDefined();
		});

		test('should detect scheduled date with "scheduled" keyword', () => {
			const result = service.parseTimeExpressions(
				"meeting scheduled for tomorrow"
			);

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].type).toBe("scheduled");
			expect(result.scheduledDate).toBeDefined();
		});
	});

	describe("Chinese Time Expressions", () => {
		test('should parse "明天"', () => {
			const result = service.parseTimeExpressions("明天开会");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].text).toBe("明天");
			expect(result.parsedExpressions[0].type).toBe("due");
			expect(result.dueDate).toBeDefined();
			expect(result.cleanedText).toBe("开会");
		});

		test('should parse "后天"', () => {
			const result = service.parseTimeExpressions("后天完成任务");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].text).toBe("后天");
			expect(result.dueDate).toBeDefined();

			// Check that the date is approximately 2 days from now
			const now = new Date();
			const twoDaysLater = new Date(
				now.getTime() + 2 * 24 * 60 * 60 * 1000
			);
			const parsedDate = result.dueDate!;

			expect(
				Math.abs(parsedDate.getTime() - twoDaysLater.getTime())
			).toBeLessThan(24 * 60 * 60 * 1000);
		});

		test('should parse "3天后"', () => {
			const result = service.parseTimeExpressions("3天后提交报告");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].text).toBe("3天后");
			expect(result.dueDate).toBeDefined();
		});

		test('should parse "下周"', () => {
			const result = service.parseTimeExpressions("下周完成项目");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].text).toBe("下周");
			expect(result.dueDate).toBeDefined();
		});

		test('should parse "下周一"', () => {
			const result = service.parseTimeExpressions("下周一开会");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].text).toBe("下周一");
			expect(result.parsedExpressions[0].type).toBe("due");
			expect(result.dueDate).toBeDefined();
			expect(result.cleanedText).toBe("开会");

			// Check that the parsed date is a Monday and in the next week
			const parsedDate = result.dueDate!;
			expect(parsedDate.getDay()).toBe(1); // Monday is day 1

			// Should be at least 1 day from now (next week)
			const now = new Date();
			expect(parsedDate.getTime()).toBeGreaterThan(now.getTime());
		});

		test('should parse "上周三"', () => {
			const result = service.parseTimeExpressions("上周三的会议");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].text).toBe("上周三");
			expect(result.dueDate).toBeDefined();

			// Check that the parsed date is a Wednesday and in the past week
			const parsedDate = result.dueDate!;
			expect(parsedDate.getDay()).toBe(3); // Wednesday is day 3

			// Should be in the past (last week)
			const now = new Date();
			expect(parsedDate.getTime()).toBeLessThan(now.getTime());
		});

		test('should parse "这周五"', () => {
			const result = service.parseTimeExpressions("这周五截止");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].text).toBe("这周五");
			expect(result.dueDate).toBeDefined();

			// Check that the parsed date is a Friday
			const parsedDate = result.dueDate!;
			expect(parsedDate.getDay()).toBe(5); // Friday is day 5
		});

		test('should parse "星期二"', () => {
			const result = service.parseTimeExpressions("星期二提交");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].text).toBe("星期二");
			expect(result.dueDate).toBeDefined();

			// Check that the parsed date is a Tuesday
			const parsedDate = result.dueDate!;
			expect(parsedDate.getDay()).toBe(2); // Tuesday is day 2
		});

		test('should parse "周六"', () => {
			const result = service.parseTimeExpressions("周六休息");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].text).toBe("周六");
			expect(result.dueDate).toBeDefined();

			// Check that the parsed date is a Saturday
			const parsedDate = result.dueDate!;
			expect(parsedDate.getDay()).toBe(6); // Saturday is day 6
		});

		test('should parse "礼拜天"', () => {
			const result = service.parseTimeExpressions("礼拜天聚会");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].text).toBe("礼拜天");
			expect(result.dueDate).toBeDefined();

			// Check that the parsed date is a Sunday
			const parsedDate = result.dueDate!;
			expect(parsedDate.getDay()).toBe(0); // Sunday is day 0
		});

		test('should detect start date with Chinese "开始" keyword', () => {
			const result = service.parseTimeExpressions("开始项目明天");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].type).toBe("start");
			expect(result.startDate).toBeDefined();
		});

		test('should detect scheduled date with Chinese "安排" keyword', () => {
			const result = service.parseTimeExpressions("安排会议明天");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].type).toBe("scheduled");
			expect(result.scheduledDate).toBeDefined();
		});
	});

	describe("Text Cleaning", () => {
		test("should remove single time expression", () => {
			const result = service.parseTimeExpressions("go to bed tomorrow");
			expect(result.cleanedText).toBe("go to bed");
		});

		test("should remove multiple time expressions", () => {
			const result = service.parseTimeExpressions(
				"start project tomorrow and finish by next week"
			);
			// The exact cleaned text depends on chrono parsing, but it should remove time expressions
			expect(result.cleanedText).not.toContain("tomorrow");
			expect(result.cleanedText).not.toContain("next week");
		});

		test("should handle punctuation around time expressions", () => {
			const result = service.parseTimeExpressions(
				"meeting, tomorrow, important"
			);
			expect(result.cleanedText).toBe("meeting, important");
		});

		test("should preserve text when removeOriginalText is false", () => {
			const config = {
				...DEFAULT_TIME_PARSING_CONFIG,
				removeOriginalText: false,
			};
			const serviceNoRemove = new TimeParsingService(config);
			const result =
				serviceNoRemove.parseTimeExpressions("go to bed tomorrow");

			expect(result.cleanedText).toBe("go to bed tomorrow");
		});
	});

	describe("Multiple Date Types", () => {
		test("should parse multiple different date types", () => {
			const result = service.parseTimeExpressions(
				"start project tomorrow, due by next Friday, scheduled for next week"
			);

			expect(result.parsedExpressions.length).toBeGreaterThan(1);
			// Should have different types of dates
			const types = result.parsedExpressions.map((expr) => expr.type);
			expect(new Set(types).size).toBeGreaterThan(1);
		});
	});

	describe("Edge Cases", () => {
		test("should handle empty text", () => {
			const result = service.parseTimeExpressions("");

			expect(result.parsedExpressions).toHaveLength(0);
			expect(result.cleanedText).toBe("");
			expect(result.startDate).toBeUndefined();
			expect(result.dueDate).toBeUndefined();
			expect(result.scheduledDate).toBeUndefined();
		});

		test("should handle text with no time expressions", () => {
			const result = service.parseTimeExpressions("just a regular task");

			expect(result.parsedExpressions).toHaveLength(0);
			expect(result.cleanedText).toBe("just a regular task");
		});

		test("should handle disabled service", () => {
			const config = { ...DEFAULT_TIME_PARSING_CONFIG, enabled: false };
			const disabledService = new TimeParsingService(config);
			const result =
				disabledService.parseTimeExpressions("go to bed tomorrow");

			expect(result.parsedExpressions).toHaveLength(0);
			expect(result.cleanedText).toBe("go to bed tomorrow");
		});
	});

	describe("Configuration Updates", () => {
		test("should update configuration", () => {
			const newConfig = { enabled: false };
			service.updateConfig(newConfig);

			const config = service.getConfig();
			expect(config.enabled).toBe(false);
		});

		test("should preserve other config values when updating", () => {
			const originalConfig = service.getConfig();
			service.updateConfig({ enabled: false });

			const updatedConfig = service.getConfig();
			expect(updatedConfig.enabled).toBe(false);
			expect(updatedConfig.supportedLanguages).toEqual(
				originalConfig.supportedLanguages
			);
			expect(updatedConfig.dateKeywords).toEqual(
				originalConfig.dateKeywords
			);
		});
	});

	describe("Date Type Determination", () => {
		test("should default to due date when no keywords found", () => {
			const result = service.parseTimeExpressions("tomorrow");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].type).toBe("due");
		});

		test("should prioritize start keywords", () => {
			const result = service.parseTimeExpressions("begin work tomorrow");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].type).toBe("start");
		});

		test("should prioritize due keywords", () => {
			const result = service.parseTimeExpressions("deadline tomorrow");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].type).toBe("due");
		});

		test("should prioritize scheduled keywords", () => {
			const result = service.parseTimeExpressions("scheduled tomorrow");

			expect(result.parsedExpressions).toHaveLength(1);
			expect(result.parsedExpressions[0].type).toBe("scheduled");
		});
	});

	describe("Per-Line Processing", () => {
		test("should parse single line correctly", () => {
			const result = service.parseTimeExpressionsForLine("task tomorrow");

			expect(result.originalLine).toBe("task tomorrow");
			expect(result.cleanedLine).toBe("task");
			expect(result.dueDate).toBeDefined();
			expect(result.parsedExpressions).toHaveLength(1);
		});

		test("should parse multiple lines independently", () => {
			const lines = [
				"task 1 tomorrow",
				"task 2 next week",
				"task 3 no date",
			];
			const results = service.parseTimeExpressionsPerLine(lines);

			expect(results).toHaveLength(3);

			// First line
			expect(results[0].originalLine).toBe("task 1 tomorrow");
			expect(results[0].cleanedLine).toBe("task 1");
			expect(results[0].dueDate).toBeDefined();

			// Second line
			expect(results[1].originalLine).toBe("task 2 next week");
			expect(results[1].cleanedLine).toBe("task 2");
			expect(results[1].dueDate).toBeDefined();

			// Third line
			expect(results[2].originalLine).toBe("task 3 no date");
			expect(results[2].cleanedLine).toBe("task 3 no date");
			expect(results[2].dueDate).toBeUndefined();
		});

		test("should handle different date types per line", () => {
			const lines = [
				"start project tomorrow",
				"meeting scheduled for next week",
				"deadline by Friday",
			];
			const results = service.parseTimeExpressionsPerLine(lines);

			expect(results).toHaveLength(3);
			expect(results[0].startDate).toBeDefined();
			expect(results[1].scheduledDate).toBeDefined();
			expect(results[2].dueDate).toBeDefined();
		});

		test("should preserve line structure in multiline content", () => {
			const content = "task 1 tomorrow\ntask 2 next week\ntask 3";
			const lines = content.split("\n");
			const results = service.parseTimeExpressionsPerLine(lines);

			expect(results).toHaveLength(3);

			// Verify each line is processed independently
			const cleanedLines = results.map((r) => r.cleanedLine);
			const reconstructed = cleanedLines.join("\n");

			expect(reconstructed).toBe("task 1\ntask 2\ntask 3");
		});

		test("should handle empty lines", () => {
			const lines = ["task tomorrow", "", "another task"];
			const results = service.parseTimeExpressionsPerLine(lines);

			expect(results).toHaveLength(3);
			expect(results[0].dueDate).toBeDefined();
			expect(results[1].dueDate).toBeUndefined();
			expect(results[1].cleanedLine).toBe("");
			expect(results[2].dueDate).toBeUndefined();
		});

		test("should handle Chinese time expressions per line", () => {
			const lines = ["任务1 明天", "任务2 下周", "任务3"];
			const results = service.parseTimeExpressionsPerLine(lines);

			expect(results).toHaveLength(3);
			expect(results[0].cleanedLine).toBe("任务1");
			expect(results[0].dueDate).toBeDefined();
			expect(results[1].cleanedLine).toBe("任务2");
			expect(results[1].dueDate).toBeDefined();
			expect(results[2].cleanedLine).toBe("任务3");
			expect(results[2].dueDate).toBeUndefined();
		});
	});
});
