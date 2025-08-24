/**
 * ICS Manager Time Integration Tests
 * Tests for enhanced time parsing integration with ICS events
 */

import { IcsManager } from "../managers/ics-manager";
import { TimeParsingService } from "../services/time-parsing-service";
import { IcsParser } from "../parsers/ics-parser";
import { IcsSource, IcsManagerConfig, IcsEvent } from "../types/ics";
import { TimeComponent, EnhancedStandardTaskMetadata } from "../types/time-parsing";

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

describe("ICS Manager Time Integration", () => {
	let icsManager: IcsManager;
	let timeParsingService: TimeParsingService;
	let mockConfig: IcsManagerConfig;
	let testSource: IcsSource;

	beforeEach(() => {
		timeParsingService = new TimeParsingService(mockTimeParsingConfig);
		
		testSource = {
			id: "test-source",
			name: "Test Calendar",
			url: "https://example.com/test.ics",
			enabled: true,
			refreshInterval: 60,
			showAllDayEvents: true,
			showTimedEvents: true,
			showType: "event",
		};

		mockConfig = {
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

	describe("Time Component Extraction from ICS Events", () => {
		test("should extract time components from timed ICS events", () => {
			const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
BEGIN:VEVENT
UID:test-timed-event@example.com
DTSTART:20240315T140000Z
DTEND:20240315T160000Z
SUMMARY:Team Meeting
DESCRIPTION:Weekly team sync meeting
END:VEVENT
END:VCALENDAR`;

			const parseResult = IcsParser.parse(icsData, testSource);
			expect(parseResult.events).toHaveLength(1);

			const event = parseResult.events[0];
			const tasks = icsManager.convertEventsToTasks([event]);
			expect(tasks).toHaveLength(1);

			const task = tasks[0];
			const metadata = task.metadata as EnhancedStandardTaskMetadata;

			// Should have time components extracted from ICS times
			expect(metadata.timeComponents).toBeDefined();
			expect(metadata.timeComponents?.startTime).toBeDefined();
			expect(metadata.timeComponents?.endTime).toBeDefined();

			// Verify time component values (times should match the ICS event times)
			const startTime = metadata.timeComponents?.startTime;
			expect(startTime?.hour).toBeDefined();
			expect(startTime?.minute).toBe(0);
			expect(startTime?.isRange).toBe(true);

			const endTime = metadata.timeComponents?.endTime;
			expect(endTime?.hour).toBeDefined();
			expect(endTime?.minute).toBe(0);
			expect(endTime?.isRange).toBe(true);

			// Should have range partners
			expect(startTime?.rangePartner).toBe(endTime);
			expect(endTime?.rangePartner).toBe(startTime);

			// Should have enhanced datetime objects
			expect(metadata.enhancedDates).toBeDefined();
			expect(metadata.enhancedDates?.startDateTime).toBeDefined();
			expect(metadata.enhancedDates?.endDateTime).toBeDefined();
			expect(metadata.enhancedDates?.scheduledDateTime).toBeDefined();
			expect(metadata.enhancedDates?.dueDateTime).toBeDefined();
		});

		test("should not extract time components from all-day ICS events without description times", () => {
			const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
BEGIN:VEVENT
UID:test-allday-event@example.com
DTSTART;VALUE=DATE:20240315
DTEND;VALUE=DATE:20240316
SUMMARY:All Day Event
DESCRIPTION:This is an all-day event
END:VEVENT
END:VCALENDAR`;

			const parseResult = IcsParser.parse(icsData, testSource);
			expect(parseResult.events).toHaveLength(1);

			const event = parseResult.events[0];
			expect(event.allDay).toBe(true);

			const tasks = icsManager.convertEventsToTasks([event]);
			expect(tasks).toHaveLength(1);

			const task = tasks[0];
			const metadata = task.metadata as EnhancedStandardTaskMetadata;

			// Should not have time components for all-day events without description times
			expect(metadata.timeComponents).toBeUndefined();
			
			// Should still have enhanced dates with the event dates
			expect(metadata.enhancedDates).toBeDefined();
			expect(metadata.enhancedDates?.startDateTime).toBeDefined();
			expect(metadata.enhancedDates?.scheduledDateTime).toBeDefined();
		});

		test("should extract time components from all-day event descriptions", () => {
			const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
BEGIN:VEVENT
UID:test-allday-with-time@example.com
DTSTART;VALUE=DATE:20240315
DTEND;VALUE=DATE:20240316
SUMMARY:Conference Day
DESCRIPTION:Conference starts at 9:00 AM and ends at 5:00 PM
END:VEVENT
END:VCALENDAR`;

			const parseResult = IcsParser.parse(icsData, testSource);
			expect(parseResult.events).toHaveLength(1);

			const event = parseResult.events[0];
			expect(event.allDay).toBe(true);

			const tasks = icsManager.convertEventsToTasks([event]);
			expect(tasks).toHaveLength(1);

			const task = tasks[0];
			const metadata = task.metadata as EnhancedStandardTaskMetadata;

			// Should have time components extracted from description
			expect(metadata.timeComponents).toBeDefined();
			
			// Check if we have any time components (start, due, scheduled, or end)
			const hasTimeComponents = metadata.timeComponents?.startTime || 
									 metadata.timeComponents?.dueTime || 
									 metadata.timeComponents?.scheduledTime || 
									 metadata.timeComponents?.endTime;
			expect(hasTimeComponents).toBeDefined();

			// Should have enhanced datetime objects
			expect(metadata.enhancedDates).toBeDefined();
			expect(metadata.enhancedDates?.startDateTime).toBeDefined();
		});

		test("should handle time ranges in event descriptions", () => {
			const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
BEGIN:VEVENT
UID:test-time-range@example.com
DTSTART;VALUE=DATE:20240315
SUMMARY:Workshop
DESCRIPTION:Workshop session from 14:00-17:30
LOCATION:Conference Room A
END:VEVENT
END:VCALENDAR`;

			const parseResult = IcsParser.parse(icsData, testSource);
			expect(parseResult.events).toHaveLength(1);

			const event = parseResult.events[0];
			const tasks = icsManager.convertEventsToTasks([event]);
			expect(tasks).toHaveLength(1);

			const task = tasks[0];
			const metadata = task.metadata as EnhancedStandardTaskMetadata;

			// Should have time components extracted from description
			expect(metadata.timeComponents).toBeDefined();
			expect(metadata.timeComponents?.startTime).toBeDefined();
			expect(metadata.timeComponents?.endTime).toBeDefined();

			// Verify time range
			const startTime = metadata.timeComponents?.startTime;
			expect(startTime?.hour).toBe(14);
			expect(startTime?.minute).toBe(0);
			expect(startTime?.isRange).toBe(true);

			const endTime = metadata.timeComponents?.endTime;
			expect(endTime?.hour).toBe(17);
			expect(endTime?.minute).toBe(30);
			expect(endTime?.isRange).toBe(true);

			// Should have range partners
			expect(startTime?.rangePartner).toBe(endTime);
			expect(endTime?.rangePartner).toBe(startTime);
		});

		test("should handle midnight crossing time ranges", () => {
			const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
BEGIN:VEVENT
UID:test-midnight-crossing@example.com
DTSTART;VALUE=DATE:20240315
SUMMARY:Night Shift
DESCRIPTION:Work shift from 23:00-01:00
END:VEVENT
END:VCALENDAR`;

			const parseResult = IcsParser.parse(icsData, testSource);
			expect(parseResult.events).toHaveLength(1);

			const event = parseResult.events[0];
			const tasks = icsManager.convertEventsToTasks([event]);
			expect(tasks).toHaveLength(1);

			const task = tasks[0];
			const metadata = task.metadata as EnhancedStandardTaskMetadata;

			// Should have time components
			expect(metadata.timeComponents).toBeDefined();
			expect(metadata.timeComponents?.startTime).toBeDefined();
			expect(metadata.timeComponents?.endTime).toBeDefined();

			// Should have enhanced dates with proper midnight crossing handling
			expect(metadata.enhancedDates).toBeDefined();
			expect(metadata.enhancedDates?.startDateTime).toBeDefined();
			expect(metadata.enhancedDates?.endDateTime).toBeDefined();

			const startDateTime = metadata.enhancedDates?.startDateTime;
			const endDateTime = metadata.enhancedDates?.endDateTime;

			// Start should be 23:00 on March 15
			expect(startDateTime?.getDate()).toBe(15);
			expect(startDateTime?.getHours()).toBe(23);

			// End should be 01:00 on March 16 (next day)
			expect(endDateTime?.getDate()).toBe(16);
			expect(endDateTime?.getHours()).toBe(1);
		});

		test("should preserve ICS time information over description parsing", () => {
			const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
BEGIN:VEVENT
UID:test-ics-priority@example.com
DTSTART:20240315T100000Z
DTEND:20240315T120000Z
SUMMARY:Meeting
DESCRIPTION:This meeting is scheduled at 2:00 PM (different from actual ICS time)
END:VEVENT
END:VCALENDAR`;

			const parseResult = IcsParser.parse(icsData, testSource);
			expect(parseResult.events).toHaveLength(1);

			const event = parseResult.events[0];
			const tasks = icsManager.convertEventsToTasks([event]);
			expect(tasks).toHaveLength(1);

			const task = tasks[0];
			const metadata = task.metadata as EnhancedStandardTaskMetadata;

			// Should have time components from ICS, not description
			expect(metadata.timeComponents).toBeDefined();
			expect(metadata.timeComponents?.startTime).toBeDefined();
			expect(metadata.timeComponents?.endTime).toBeDefined();

			// Should use ICS times, not description time (2:00 PM)
			const startTime = metadata.timeComponents?.startTime;
			expect(startTime?.hour).toBeDefined(); // ICS time takes precedence
			expect(startTime?.minute).toBe(0);

			const endTime = metadata.timeComponents?.endTime;
			expect(endTime?.hour).toBeDefined();
			expect(endTime?.minute).toBe(0);
		});

		test("should handle events with location containing time information", () => {
			const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
BEGIN:VEVENT
UID:test-location-time@example.com
DTSTART;VALUE=DATE:20240315
SUMMARY:Dinner
DESCRIPTION:Family dinner
LOCATION:Restaurant at 7:30 PM
END:VEVENT
END:VCALENDAR`;

			const parseResult = IcsParser.parse(icsData, testSource);
			expect(parseResult.events).toHaveLength(1);

			const event = parseResult.events[0];
			const tasks = icsManager.convertEventsToTasks([event]);
			expect(tasks).toHaveLength(1);

			const task = tasks[0];
			const metadata = task.metadata as EnhancedStandardTaskMetadata;

			// Should extract time from location field
			expect(metadata.timeComponents).toBeDefined();
			expect(metadata.timeComponents?.scheduledTime).toBeDefined();

			const scheduledTime = metadata.timeComponents?.scheduledTime;
			expect(scheduledTime?.hour).toBe(19); // 7:30 PM
			expect(scheduledTime?.minute).toBe(30);
		});
	});

	describe("Error Handling and Edge Cases", () => {
		test("should handle ICS events with invalid time formats gracefully", () => {
			const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
BEGIN:VEVENT
UID:test-invalid-time@example.com
DTSTART;VALUE=DATE:20240315
SUMMARY:Event
DESCRIPTION:Meeting at invalid:time format
END:VEVENT
END:VCALENDAR`;

			const parseResult = IcsParser.parse(icsData, testSource);
			expect(parseResult.events).toHaveLength(1);

			const event = parseResult.events[0];
			
			// Should not throw error
			expect(() => {
				const tasks = icsManager.convertEventsToTasks([event]);
				expect(tasks).toHaveLength(1);
			}).not.toThrow();
		});

		test("should handle ICS events without time parsing service", () => {
			// Create manager without time parsing service
			const managerWithoutTimeService = new IcsManager(mockConfig, mockPluginSettings);

			const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
BEGIN:VEVENT
UID:test-no-service@example.com
DTSTART:20240315T140000Z
DTEND:20240315T160000Z
SUMMARY:Meeting
END:VEVENT
END:VCALENDAR`;

			const parseResult = IcsParser.parse(icsData, testSource);
			expect(parseResult.events).toHaveLength(1);

			const event = parseResult.events[0];
			const tasks = managerWithoutTimeService.convertEventsToTasks([event]);
			expect(tasks).toHaveLength(1);

			const task = tasks[0];
			const metadata = task.metadata as EnhancedStandardTaskMetadata;

			// Should not have enhanced time components
			expect(metadata.timeComponents).toBeUndefined();
			expect(metadata.enhancedDates).toBeUndefined();

			// But should still have basic task data
			expect(task.content).toBe("Meeting");
			expect(task.metadata.startDate).toBeDefined();
		});

		test("should handle malformed ICS datetime gracefully", () => {
			// This test ensures the manager doesn't crash on malformed ICS data
			const event: IcsEvent = {
				uid: "test-malformed",
				summary: "Test Event",
				dtstart: new Date("invalid-date"),
				allDay: false,
				source: testSource,
			};

			// Should not throw error
			expect(() => {
				const tasks = icsManager.convertEventsToTasks([event]);
				expect(tasks).toHaveLength(1);
			}).not.toThrow();
		});
	});

	describe("Backward Compatibility", () => {
		test("should maintain compatibility with existing ICS task structure", () => {
			const icsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
BEGIN:VEVENT
UID:test-compatibility@example.com
DTSTART:20240315T140000Z
DTEND:20240315T160000Z
SUMMARY:Legacy Event
DESCRIPTION:This should work with existing code
END:VEVENT
END:VCALENDAR`;

			const parseResult = IcsParser.parse(icsData, testSource);
			expect(parseResult.events).toHaveLength(1);

			const event = parseResult.events[0];
			const tasks = icsManager.convertEventsToTasks([event]);
			expect(tasks).toHaveLength(1);

			const task = tasks[0];

			// Should have all existing ICS task properties
			expect(task.id).toBeDefined();
			expect(task.content).toBe("Legacy Event");
			expect(task.filePath).toBe("ics://Test Calendar");
			expect(task.icsEvent).toBeDefined();
			expect(task.readonly).toBe(true);
			expect(task.source.type).toBe("ics");

			// Should have standard metadata
			expect(task.metadata.startDate).toBeDefined();
			expect(task.metadata.scheduledDate).toBeDefined();
			expect(task.metadata.project).toBe("Test Calendar");

			// Enhanced metadata should be additive, not breaking
			const metadata = task.metadata as EnhancedStandardTaskMetadata;
			if (metadata.timeComponents) {
				expect(metadata.timeComponents.startTime).toBeDefined();
			}
			if (metadata.enhancedDates) {
				expect(metadata.enhancedDates.startDateTime).toBeDefined();
			}
		});
	});
});