/**
 * Debug test for TimeParsingService
 */

import { TimeParsingService } from "../services/time-parsing-service";
import { TimeParsingConfig } from "../services/time-parsing-service";

describe("TimeParsingService Debug", () => {
	let timeParsingService: TimeParsingService;

	beforeEach(() => {
		const timeConfig: TimeParsingConfig = {
			enabled: true,
			supportedLanguages: ["en"],
			dateKeywords: {
				start: ["start", "from", "begins"],
				due: ["due", "deadline", "by"],
				scheduled: ["scheduled", "at", "@"],
			},
			removeOriginalText: false,
			perLineProcessing: true,
			realTimeReplacement: false,
		};

		timeParsingService = new TimeParsingService(timeConfig);
	});

	it("should parse time components from simple text", () => {
		const text = "Meeting at 2:30 PM";
		const result = timeParsingService.parseTimeComponents(text);
		
		// Check if we have any time components
		expect(result.timeComponents).toBeDefined();
		
		// Check specific time component
		if (result.timeComponents.scheduledTime) {
			expect(result.timeComponents.scheduledTime.hour).toBe(14);
			expect(result.timeComponents.scheduledTime.minute).toBe(30);
		} else if (result.timeComponents.dueTime) {
			expect(result.timeComponents.dueTime.hour).toBe(14);
			expect(result.timeComponents.dueTime.minute).toBe(30);
		} else {
			// Print what we actually got
			console.log("Actual result:", JSON.stringify(result, null, 2));
			fail("Expected either scheduledTime or dueTime to be defined");
		}
	});

	it("should parse time range", () => {
		const text = "Workshop 9:00-17:00";
		const result = timeParsingService.parseTimeComponents(text);
		
		console.log("Input text:", text);
		console.log("Parse result:", result);
		
		expect(result.timeComponents).toBeDefined();
		expect(Object.keys(result.timeComponents).length).toBeGreaterThan(0);
	});
});