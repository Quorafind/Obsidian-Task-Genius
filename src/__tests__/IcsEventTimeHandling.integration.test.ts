/**
 * ICS Event Time Handling Integration Test
 * End-to-end test for ICS event time preservation and enhanced parsing
 */

import { IcsManager } from "../managers/ics-manager";
import { TimeParsingService } from "../services/time-parsing-service";
import { IcsParser } from "../parsers/ics-parser";
import { IcsSource, IcsManagerConfig } from "../types/ics";
import { EnhancedStandardTaskMetadata } from "../types/time-parsing";

// Mock Obsidian Component
jest.mock("obsidian", () => ({
	Component: class MockComponent {
		constructor() {}
		load() {}
		unload() {}
		onload() {}
		onunload() {}
		addChild() {}
		removeChild() {}
		register() {}
	},
	requestUrl: jest.fn(),
}));

// Mock minimal settings for testing
const mockPluginSettings = {
	taskStatusMarks: {
		"Not Started": " ",
		"In Progress": "/",
		Completed: "x",
		Abandoned: "-",
		Planned: "?",
	},
} as any;

// Mock time parsing config
const mockTimeParsingConfig = {
	enabled: true,
	supportedLanguages: ["en", "zh"],
	dateKeywords: {
		start: ["start", "from", "begins"],
		due: ["due", "by", "until"],
		scheduled: ["at", "on", "scheduled"],
	},
	removeOriginalText: false,
	perLineProcessing: true,
	realTimeReplacement: false,
};

describe("ICS Event Time Handling Integration", () => {
	let icsManager: IcsManager;
	let timeParsingService: TimeParsingService;

	beforeEach(() => {
		timeParsingService = new TimeParsingService(mockTimeParsingConfig);
		
		const testSource: IcsSource = {
			id: "integration-test",
			name: "Integration Test Calendar",
			url: "https://example.com/test.ics",
			enabled: true,
			refreshInterval: 60,
			showAllDayEvents: true,
			showTimedEvents: true,
			showType: "event",
		};

		const mockConfig: IcsManagerConfig = {
			sources: [testSource],
			globalRefreshInterval: 60,
			maxCacheAge: 24,
			enableBackgroundRefresh: false,
			networkTimeout: 30,
			maxEventsPerSource: 1000,
			showInCalendar: true,
			showInTaskLists: true,
			defaultEventColor: "#3498db",
		};

		icsManager = new IcsManager(mockConfig, mockPluginSettings, undefined, timeParsingService);
	});

	test("end-to-end ICS event with time components conversion", () => {
		// Real-world ICS data with various time formats
		const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Integration Test//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:meeting-with-time@example.com
DTSTART:20240315T093000Z
DTEND:20240315T103000Z
SUMMARY:Team Standup
DESCRIPTION:Daily standup meeting for the development team
LOCATION:Conference Room A
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:workshop-allday@example.com
DTSTART;VALUE=DATE:20240316
DTEND;VALUE=DATE:20240317
SUMMARY:Workshop Day
DESCRIPTION:Full-day workshop from 9:00 AM to 5:00 PM with lunch break at 12:00-13:00
LOCATION:Training Center
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:dinner-event@example.com
DTSTART;VALUE=DATE:20240317
SUMMARY:Team Dinner
DESCRIPTION:Team dinner at the restaurant
LOCATION:Italian Restaurant at 7:30 PM
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

		// Parse ICS data
		const testSource = icsManager.getConfig().sources[0];
		const parseResult = IcsParser.parse(icsData, testSource);
		
		expect(parseResult.events).toHaveLength(3);
		expect(parseResult.errors).toHaveLength(0);

		// Convert to tasks
		const tasks = icsManager.convertEventsToTasks(parseResult.events);
		expect(tasks).toHaveLength(3);

		// Test 1: Timed event with ICS time components
		const timedTask = tasks.find(t => t.content === "Team Standup");
		expect(timedTask).toBeDefined();
		
		const timedMetadata = timedTask!.metadata as EnhancedStandardTaskMetadata;
		expect(timedMetadata.timeComponents).toBeDefined();
		expect(timedMetadata.timeComponents?.startTime).toBeDefined();
		expect(timedMetadata.timeComponents?.endTime).toBeDefined();
		expect(timedMetadata.enhancedDates).toBeDefined();
		expect(timedMetadata.enhancedDates?.startDateTime).toBeDefined();
		expect(timedMetadata.enhancedDates?.endDateTime).toBeDefined();

		// Test 2: All-day event with time parsing from description
		const workshopTask = tasks.find(t => t.content === "Workshop Day");
		expect(workshopTask).toBeDefined();
		
		const workshopMetadata = workshopTask!.metadata as EnhancedStandardTaskMetadata;
		// Should have time components parsed from description
		expect(workshopMetadata.timeComponents).toBeDefined();
		expect(workshopMetadata.enhancedDates).toBeDefined();

		// Test 3: Event with time in location field
		const dinnerTask = tasks.find(t => t.content === "Team Dinner");
		expect(dinnerTask).toBeDefined();
		
		const dinnerMetadata = dinnerTask!.metadata as EnhancedStandardTaskMetadata;
		// Should have time components parsed from location
		expect(dinnerMetadata.timeComponents).toBeDefined();
		expect(dinnerMetadata.enhancedDates).toBeDefined();

		// Verify all tasks maintain backward compatibility
		for (const task of tasks) {
			expect(task.id).toBeDefined();
			expect(task.content).toBeDefined();
			expect(task.filePath).toBe("ics://Integration Test Calendar");
			expect(task.icsEvent).toBeDefined();
			expect(task.readonly).toBe(true);
			expect(task.source.type).toBe("ics");
			expect(task.metadata.startDate).toBeDefined();
			expect(task.metadata.project).toBe("Integration Test Calendar");
		}
	});

	test("ICS event time preservation with holiday detection", () => {
		const testSource = icsManager.getConfig().sources[0];
		
		// Add holiday configuration to source
		testSource.holidayConfig = {
			enabled: true,
			detectionPatterns: {
				summary: ["Holiday", "Festival"],
				categories: ["holiday"],
			},
			groupingStrategy: "summary",
			maxGapDays: 1,
			showInForecast: true,
			showInCalendar: true,
		};

		const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Holiday Test//EN
BEGIN:VEVENT
UID:holiday-event@example.com
DTSTART:20240315T120000Z
DTEND:20240315T130000Z
SUMMARY:Spring Festival Holiday
DESCRIPTION:Traditional spring festival celebration
CATEGORIES:holiday
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

		const parseResult = IcsParser.parse(icsData, testSource);
		expect(parseResult.events).toHaveLength(1);

		// Test holiday detection directly on events
		const events = parseResult.events;
		const eventsWithHoliday = icsManager.convertEventsWithHolidayToTasks(
			events.map(event => ({
				...event,
				isHoliday: true, // Simulate holiday detection
				showInForecast: true,
			}))
		);
		expect(eventsWithHoliday).toHaveLength(1);

		const task = eventsWithHoliday[0];
		const metadata = task.metadata as EnhancedStandardTaskMetadata;
		
		// Should still have time components despite holiday processing
		expect(metadata.timeComponents).toBeDefined();
		expect(metadata.timeComponents?.startTime).toBeDefined();
		expect(metadata.timeComponents?.endTime).toBeDefined();
		expect(metadata.enhancedDates).toBeDefined();
	});

	test("error handling in time component extraction", () => {
		const testSource = icsManager.getConfig().sources[0];

		// ICS data with potential parsing issues
		const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Error Test//EN
BEGIN:VEVENT
UID:problematic-event@example.com
DTSTART;VALUE=DATE:20240315
SUMMARY:Problematic Event
DESCRIPTION:Event with invalid time format: 25:99 and other text
LOCATION:Somewhere
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

		const parseResult = IcsParser.parse(icsData, testSource);
		expect(parseResult.events).toHaveLength(1);

		// Should not throw error during conversion
		expect(() => {
			const tasks = icsManager.convertEventsToTasks(parseResult.events);
			expect(tasks).toHaveLength(1);
			
			const task = tasks[0];
			expect(task.content).toBe("Problematic Event");
			
			// Should handle gracefully - may or may not have time components
			// but should not crash
			const metadata = task.metadata as EnhancedStandardTaskMetadata;
			expect(metadata).toBeDefined();
		}).not.toThrow();
	});
});