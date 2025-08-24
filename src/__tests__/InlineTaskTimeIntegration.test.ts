/**
 * Integration tests for inline task parsing with enhanced time parsing
 */

import { MarkdownTaskParser, ConfigurableTaskParser } from "../dataflow/core/ConfigurableTaskParser";
import { TimeParsingService } from "../services/time-parsing-service";
import { TimeParsingConfig } from "../services/time-parsing-service";
import { TaskParserConfig, MetadataParseMode } from "../types/TaskParserConfig";
import { EnhancedStandardTaskMetadata } from "../types/time-parsing";

describe("Inline Task Time Integration", () => {
	let timeParsingService: TimeParsingService;
	let taskParser: MarkdownTaskParser;

	beforeEach(() => {
		// Create time parsing service with test configuration
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

		// Create task parser with time parsing service
		const parserConfig: Partial<TaskParserConfig> = {
			parseMetadata: true,
			parseTags: true,
			parseComments: false,
			parseHeadings: false,
			metadataParseMode: MetadataParseMode.Both,
		};

		taskParser = new ConfigurableTaskParser(parserConfig, timeParsingService);
	});

	describe("Single Time Extraction", () => {
		it("should extract single time from inline task", () => {
			const markdown = "- [ ] Meeting at 2:30 PM";
			const tasks = taskParser.parse(markdown, "test.md");

			expect(tasks).toHaveLength(1);
			const task = tasks[0];

			expect(task.content).toBe("Meeting at 2:30 PM");
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents).toBeDefined();
			
			// Check time component (could be dueTime or scheduledTime based on context)
			const timeComponent = (task.metadata as EnhancedStandardTaskMetadata).timeComponents?.dueTime || (task.metadata as EnhancedStandardTaskMetadata).timeComponents?.scheduledTime;
			expect(timeComponent).toBeDefined();
			expect(timeComponent?.hour).toBe(14);
			expect(timeComponent?.minute).toBe(30);
		});

		it("should extract 24-hour format time", () => {
			const markdown = "- [ ] Call client at 15:45";
			const tasks = taskParser.parse(markdown, "test.md");

			expect(tasks).toHaveLength(1);
			const task = tasks[0];

			expect(task.content).toBe("Call client at 15:45");
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents).toBeDefined();
			
			const timeComponent = (task.metadata as EnhancedStandardTaskMetadata).timeComponents?.dueTime || (task.metadata as EnhancedStandardTaskMetadata).timeComponents?.scheduledTime;
			expect(timeComponent).toBeDefined();
			expect(timeComponent?.hour).toBe(15);
			expect(timeComponent?.minute).toBe(45);
		});
	});

	describe("Time Range Extraction", () => {
		it("should extract time range from inline task", () => {
			const markdown = "- [ ] Workshop 9:00-17:00";
			const tasks = taskParser.parse(markdown, "test.md");

			expect(tasks).toHaveLength(1);
			const task = tasks[0];

			expect(task.content).toBe("Workshop 9:00-17:00");
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents).toBeDefined();
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents?.startTime).toBeDefined();
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents?.endTime).toBeDefined();
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents?.startTime?.hour).toBe(9);
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents?.startTime?.minute).toBe(0);
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents?.endTime?.hour).toBe(17);
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents?.endTime?.minute).toBe(0);
		});

		it("should extract 12-hour format time range", () => {
			const markdown = "- [ ] Meeting 2:30 PM - 4:00 PM";
			const tasks = taskParser.parse(markdown, "test.md");

			expect(tasks).toHaveLength(1);
			const task = tasks[0];

			expect(task.content).toBe("Meeting 2:30 PM - 4:00 PM");
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents).toBeDefined();
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents?.startTime).toBeDefined();
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents?.endTime).toBeDefined();
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents?.startTime?.hour).toBe(14);
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents?.startTime?.minute).toBe(30);
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents?.endTime?.hour).toBe(16);
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents?.endTime?.minute).toBe(0);
		});
	});

	describe("Time with Metadata Integration", () => {
		it("should combine time components with dataview metadata", () => {
			const markdown = "- [ ] Doctor appointment at 3:30 PM [due::2025-08-25]";
			const tasks = taskParser.parse(markdown, "test.md");

			expect(tasks).toHaveLength(1);
			const task = tasks[0];

			expect(task.content).toBe("Doctor appointment at 3:30 PM");
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents).toBeDefined();
			
			// Check time component
			const timeComponent = (task.metadata as EnhancedStandardTaskMetadata).timeComponents?.dueTime || (task.metadata as EnhancedStandardTaskMetadata).timeComponents?.scheduledTime;
			expect(timeComponent).toBeDefined();
			expect(timeComponent?.hour).toBe(15);
			expect(timeComponent?.minute).toBe(30);

			// Check that enhanced datetime was created
			expect((task.metadata as EnhancedStandardTaskMetadata).enhancedDates?.dueDateTime).toBeDefined();
			const dueDateTime = (task.metadata as EnhancedStandardTaskMetadata).enhancedDates?.dueDateTime;
			if (dueDateTime) {
				expect(dueDateTime.getFullYear()).toBe(2025);
				expect(dueDateTime.getMonth()).toBe(7); // August (0-based)
				expect(dueDateTime.getDate()).toBe(25);
				expect(dueDateTime.getHours()).toBe(15);
				expect(dueDateTime.getMinutes()).toBe(30);
			}
		});

		it("should handle emoji metadata with time components", () => {
			const markdown = "- [ ] Project deadline at 5:00 PM 📅 2025-08-25";
			const tasks = taskParser.parse(markdown, "test.md");

			expect(tasks).toHaveLength(1);
			const task = tasks[0];

			expect(task.content).toBe("Project deadline at 5:00 PM");
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents).toBeDefined();
			
			const timeComponent = (task.metadata as EnhancedStandardTaskMetadata).timeComponents?.dueTime || (task.metadata as EnhancedStandardTaskMetadata).timeComponents?.scheduledTime;
			expect(timeComponent).toBeDefined();
			expect(timeComponent?.hour).toBe(17);
			expect(timeComponent?.minute).toBe(0);

			// Check enhanced datetime
			expect((task.metadata as EnhancedStandardTaskMetadata).enhancedDates?.dueDateTime).toBeDefined();
		});
	});

	describe("Multiple Tasks", () => {
		it("should extract time components from multiple tasks", () => {
			const markdown = `- [ ] Morning meeting at 9:00 AM
- [ ] Lunch break 12:00-13:00
- [ ] Afternoon call at 3:30 PM`;

			const tasks = taskParser.parse(markdown, "test.md");

			expect(tasks).toHaveLength(3);

			// First task
			expect(tasks[0].content).toBe("Morning meeting at 9:00 AM");
			const time1 = (tasks[0].metadata as EnhancedStandardTaskMetadata).timeComponents?.dueTime || (tasks[0].metadata as EnhancedStandardTaskMetadata).timeComponents?.scheduledTime;
			expect(time1?.hour).toBe(9);
			expect(time1?.minute).toBe(0);

			// Second task (time range)
			expect(tasks[1].content).toBe("Lunch break 12:00-13:00");
			expect((tasks[1].metadata as EnhancedStandardTaskMetadata).timeComponents?.startTime?.hour).toBe(12);
			expect((tasks[1].metadata as EnhancedStandardTaskMetadata).timeComponents?.endTime?.hour).toBe(13);

			// Third task
			expect(tasks[2].content).toBe("Afternoon call at 3:30 PM");
			const time3 = (tasks[2].metadata as EnhancedStandardTaskMetadata).timeComponents?.dueTime || (tasks[2].metadata as EnhancedStandardTaskMetadata).timeComponents?.scheduledTime;
			expect(time3?.hour).toBe(15);
			expect(time3?.minute).toBe(30);
		});
	});

	describe("Hierarchical Tasks", () => {
		it("should extract time components from nested tasks", () => {
			const markdown = `- [ ] Project meeting 2:00 PM - 4:00 PM
  - [ ] Review agenda at 1:45 PM
  - [ ] Prepare slides at 1:30 PM`;

			const tasks = taskParser.parse(markdown, "test.md");

			expect(tasks).toHaveLength(3);

			// Parent task (time range)
			expect(tasks[0].content).toBe("Project meeting 2:00 PM - 4:00 PM");
			expect((tasks[0].metadata as EnhancedStandardTaskMetadata).timeComponents?.startTime?.hour).toBe(14);
			expect((tasks[0].metadata as EnhancedStandardTaskMetadata).timeComponents?.endTime?.hour).toBe(16);

			// Child tasks
			expect(tasks[1].content).toBe("Review agenda at 1:45 PM");
			const time1 = (tasks[1].metadata as EnhancedStandardTaskMetadata).timeComponents?.dueTime || (tasks[1].metadata as EnhancedStandardTaskMetadata).timeComponents?.scheduledTime;
			expect(time1?.hour).toBe(13);
			expect(time1?.minute).toBe(45);

			expect(tasks[2].content).toBe("Prepare slides at 1:30 PM");
			const time2 = (tasks[2].metadata as EnhancedStandardTaskMetadata).timeComponents?.dueTime || (tasks[2].metadata as EnhancedStandardTaskMetadata).timeComponents?.scheduledTime;
			expect(time2?.hour).toBe(13);
			expect(time2?.minute).toBe(30);
		});
	});

	describe("Error Handling", () => {
		it("should handle tasks without time information gracefully", () => {
			const markdown = "- [ ] Simple task without time";
			const tasks = taskParser.parse(markdown, "test.md");

			expect(tasks).toHaveLength(1);
			const task = tasks[0];

			expect(task.content).toBe("Simple task without time");
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents).toBeUndefined();
			expect((task.metadata as EnhancedStandardTaskMetadata).enhancedDates).toBeUndefined();
		});

		it("should handle invalid time formats gracefully", () => {
			const markdown = "- [ ] Task with invalid time 25:99";
			const tasks = taskParser.parse(markdown, "test.md");

			expect(tasks).toHaveLength(1);
			const task = tasks[0];

			expect(task.content).toBe("Task with invalid time 25:99");
			// Should not crash, may or may not have time components depending on parsing
		});

		it("should work without time parsing service", () => {
			const parserWithoutTime = new ConfigurableTaskParser();
			const markdown = "- [ ] Meeting at 2:30 PM";
			const tasks = parserWithoutTime.parse(markdown, "test.md");

			expect(tasks).toHaveLength(1);
			const task = tasks[0];

			expect(task.content).toBe("Meeting at 2:30 PM");
			expect((task.metadata as EnhancedStandardTaskMetadata).timeComponents).toBeUndefined();
		});
	});
});