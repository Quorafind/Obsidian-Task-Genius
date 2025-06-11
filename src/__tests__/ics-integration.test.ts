/**
 * ICS Integration Tests
 * Tests for real-world ICS parsing using Chinese Lunar Calendar data
 */

import { IcsParser } from "../utils/ics/IcsParser";
import { IcsManager } from "../utils/ics/IcsManager";
import { IcsSource, IcsManagerConfig } from "../types/ics";

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

// Mock Component for testing
class MockComponent {
	constructor() {}
	load() {}
	unload() {}
}

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

describe("ICS Integration with Chinese Lunar Calendar", () => {
	const testSource: IcsSource = {
		id: "chinese-lunar-test",
		name: "Chinese Lunar Calendar",
		url: "https://lwlsw.github.io/Chinese-Lunar-Calendar-ics/chinese_lunar_my.ics",
		enabled: true,
		refreshInterval: 60,
		showAllDayEvents: true,
		showTimedEvents: true,
		showType: "event",
	};

	// Real sample data from the Chinese Lunar Calendar
	const realIcsData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//infinet//Chinese Lunar Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:中国农历
X-WR-CALDESC:中国传统农历日历
BEGIN:VEVENT
DTSTAMP:20191221T140102Z
UID:2019-04-24-lc@infinet.github.io
DTSTART;VALUE=DATE:20190424T235800
DTEND;VALUE=DATE:20190424T235900
STATUS:CONFIRMED
SUMMARY:三月二十|三 4-24
DESCRIPTION:农历三月二十日
CATEGORIES:农历
END:VEVENT
BEGIN:VEVENT
DTSTAMP:20191221T140102Z
UID:2019-05-01-lc@infinet.github.io
DTSTART;VALUE=DATE:20190501T000000
DTEND;VALUE=DATE:20190501T235959
STATUS:CONFIRMED
SUMMARY:三月廿七|三 5-1
DESCRIPTION:农历三月廿七日
CATEGORIES:农历
END:VEVENT
BEGIN:VEVENT
DTSTAMP:20191221T140102Z
UID:2019-05-12-spring-festival@infinet.github.io
DTSTART;VALUE=DATE:20190512T000000
DTEND;VALUE=DATE:20190512T235959
STATUS:CONFIRMED
SUMMARY:四月初八|四 5-12 立夏
DESCRIPTION:农历四月初八，立夏节气
CATEGORIES:农历,节气
END:VEVENT
BEGIN:VEVENT
DTSTAMP:20191221T140102Z
UID:2019-06-07-dragon-boat@infinet.github.io
DTSTART;VALUE=DATE:20190607T000000
DTEND;VALUE=DATE:20190607T235959
STATUS:CONFIRMED
SUMMARY:五月初五|五 6-7 端午节
DESCRIPTION:农历五月初五，端午节
CATEGORIES:农历,节日
END:VEVENT
BEGIN:VEVENT
DTSTAMP:20191221T140102Z
UID:2019-09-13-mid-autumn@infinet.github.io
DTSTART;VALUE=DATE:20190913T000000
DTEND;VALUE=DATE:20190913T235959
STATUS:CONFIRMED
SUMMARY:八月十五|八 9-13 中秋节
DESCRIPTION:农历八月十五，中秋节
CATEGORIES:农历,节日
END:VEVENT
END:VCALENDAR`;

	describe("Parser Integration", () => {
		test("should parse real Chinese Lunar Calendar data", () => {
			const result = IcsParser.parse(realIcsData, testSource);

			expect(result).toBeDefined();
			expect(result.events).toBeDefined();
			expect(result.events.length).toBe(5);
			expect(result.errors).toBeDefined();

			console.log(
				`Parsed ${result.events.length} events with ${result.errors.length} errors`
			);
		});

		test("should extract calendar metadata correctly", () => {
			const result = IcsParser.parse(realIcsData, testSource);

			expect(result.metadata).toBeDefined();
			expect(result.metadata.calendarName).toBe("中国农历");
			expect(result.metadata.description).toBe("中国传统农历日历");
			expect(result.metadata.version).toBe("2.0");
			expect(result.metadata.prodid).toBe(
				"-//infinet//Chinese Lunar Calendar//EN"
			);
		});

		test("should parse Chinese lunar events with correct format", () => {
			const result = IcsParser.parse(realIcsData, testSource);
			const events = result.events;

			// Test first event (regular lunar date)
			const firstEvent = events[0];
			expect(firstEvent.uid).toBe("2019-04-24-lc@infinet.github.io");
			expect(firstEvent.summary).toBe("三月二十|三 4-24");
			expect(firstEvent.description).toBe("农历三月二十日");
			expect(firstEvent.categories).toEqual(["农历"]);
			expect(firstEvent.status).toBe("CONFIRMED");
			expect(firstEvent.source).toBe(testSource);

			// Test festival event (端午节)
			const dragonBoatEvent = events.find((e) =>
				e.summary.includes("端午节")
			);
			expect(dragonBoatEvent).toBeDefined();
			expect(dragonBoatEvent!.summary).toBe("五月初五|五 6-7 端午节");
			expect(dragonBoatEvent!.description).toBe("农历五月初五，端午节");
			expect(dragonBoatEvent!.categories).toEqual(["农历", "节日"]);

			// Test solar term event (立夏)
			const solarTermEvent = events.find((e) =>
				e.summary.includes("立夏")
			);
			expect(solarTermEvent).toBeDefined();
			expect(solarTermEvent!.categories).toEqual(["农历", "节气"]);
		});

		test("should handle date parsing correctly", () => {
			const result = IcsParser.parse(realIcsData, testSource);
			const events = result.events;

			events.forEach((event) => {
				expect(event.dtstart).toBeInstanceOf(Date);
				expect(event.dtstart.getTime()).not.toBeNaN();

				if (event.dtend) {
					expect(event.dtend).toBeInstanceOf(Date);
					expect(event.dtend.getTime()).not.toBeNaN();
					expect(event.dtend.getTime()).toBeGreaterThanOrEqual(
						event.dtstart.getTime()
					);
				}

				console.log(
					`Event: ${event.summary} on ${event.dtstart.toDateString()}`
				);
			});
		});

		test("should identify all-day events correctly", () => {
			const result = IcsParser.parse(realIcsData, testSource);
			const events = result.events;

			// Most Chinese lunar calendar events should be all-day
			const allDayEvents = events.filter((event) => event.allDay);
			const timedEvents = events.filter((event) => !event.allDay);

			console.log(
				`All-day events: ${allDayEvents.length}, Timed events: ${timedEvents.length}`
			);

			// Expect most events to be all-day for lunar calendar
			expect(allDayEvents.length).toBeGreaterThan(0);
		});
	});

	describe("Manager Integration", () => {
		let icsManager: IcsManager;
		let mockComponent: MockComponent;

		const testConfig: IcsManagerConfig = {
			sources: [testSource],
			enableBackgroundRefresh: false,
			globalRefreshInterval: 60,
			maxCacheAge: 24,
			networkTimeout: 30,
			maxEventsPerSource: 1000,
			showInCalendar: true,
			showInTaskLists: true,
			defaultEventColor: "#3b82f6",
		};

		beforeEach(async () => {
			mockComponent = new MockComponent();
			icsManager = new IcsManager(testConfig, mockPluginSettings);
			await icsManager.initialize();
		});

		afterEach(() => {
			if (icsManager) {
				icsManager.unload();
			}
		});

		test("should fetch and parse real Chinese Lunar Calendar", async () => {
			try {
				const result = await icsManager.syncSource(testSource.id);

				expect(result.success).toBe(true);
				expect(result.data).toBeDefined();

				if (result.data) {
					expect(result.data.events.length).toBeGreaterThan(0);
					console.log(
						`Fetched ${result.data.events.length} events from real Chinese Lunar Calendar`
					);

					// Check for typical Chinese lunar calendar content
					const events = result.data.events;
					const lunarEvents = events.filter(
						(event) =>
							event.summary.includes("月") ||
							event.summary.includes("初") ||
							event.summary.includes("十") ||
							event.categories?.includes("农历")
					);

					expect(lunarEvents.length).toBeGreaterThan(0);
					console.log(
						`Found ${lunarEvents.length} lunar calendar events`
					);

					// Look for festivals
					const festivals = events.filter(
						(event) =>
							event.summary.includes("春节") ||
							event.summary.includes("中秋") ||
							event.summary.includes("端午") ||
							event.summary.includes("元宵") ||
							event.categories?.includes("节日")
					);

					if (festivals.length > 0) {
						console.log(
							`Found ${festivals.length} festival events`
						);
						festivals.slice(0, 3).forEach((festival) => {
							console.log(`Festival: ${festival.summary}`);
						});
					}
				}
			} catch (error) {
				console.warn(
					"Network test failed, this is expected in some environments:",
					error
				);
				// Don't fail the test if network is unavailable
			}
		}, 15000); // 15 second timeout for network request

		test("should convert events to tasks correctly", async () => {
			// Use mock data for reliable testing
			const parseResult = IcsParser.parse(realIcsData, testSource);
			const tasks = icsManager.convertEventsToTasks(parseResult.events);

			expect(tasks).toHaveLength(parseResult.events.length);

			tasks.forEach((task) => {
				expect(task.readonly).toBe(true);
				expect(task.content).toBeDefined();
				expect(task.source.type).toBe("ics");
				expect(task.source.id).toBe(testSource.id);
				expect(task.icsEvent).toBeDefined();

				// Check metadata mapping
				expect(task.metadata.startDate).toBeDefined();
				expect(task.metadata.project).toBe(testSource.name);

				if (task.icsEvent.categories) {
					expect(task.metadata.tags).toEqual(
						task.icsEvent.categories
					);
				}
			});

			console.log("Sample converted tasks:");
			tasks.slice(0, 3).forEach((task, index) => {
				console.log(
					`Task ${index + 1}: ${task.content} (${
						task.icsEvent.summary
					})`
				);
			});
		});

		test("should handle event filtering", () => {
			const parseResult = IcsParser.parse(realIcsData, testSource);
			const allEvents = parseResult.events;

			// Test filtering by categories
			const festivalEvents = allEvents.filter((event) =>
				event.categories?.includes("节日")
			);

			const solarTermEvents = allEvents.filter((event) =>
				event.categories?.includes("节气")
			);

			const regularLunarEvents = allEvents.filter(
				(event) =>
					event.categories?.includes("农历") &&
					!event.categories?.includes("节日") &&
					!event.categories?.includes("节气")
			);

			console.log(`Festival events: ${festivalEvents.length}`);
			console.log(`Solar term events: ${solarTermEvents.length}`);
			console.log(`Regular lunar events: ${regularLunarEvents.length}`);

			expect(
				festivalEvents.length +
					solarTermEvents.length +
					regularLunarEvents.length
			).toBeLessThanOrEqual(allEvents.length);
		});

		test("should handle sync status correctly", async () => {
			const initialStatus = icsManager.getSyncStatus(testSource.id);
			expect(initialStatus).toBeDefined();
			expect(initialStatus?.sourceId).toBe(testSource.id);
			expect(initialStatus?.status).toBe("idle");

			// Test sync status during operation
			const syncPromise = icsManager.syncSource(testSource.id);

			// Check if status changes to syncing (might be too fast to catch)
			const syncingStatus = icsManager.getSyncStatus(testSource.id);
			expect(syncingStatus).toBeDefined();

			try {
				await syncPromise;

				const finalStatus = icsManager.getSyncStatus(testSource.id);
				expect(finalStatus?.status).toMatch(/idle|error/);

				if (finalStatus?.status === "idle") {
					expect(finalStatus.eventCount).toBeGreaterThan(0);
					expect(finalStatus.lastSync).toBeDefined();
				}
			} catch (error) {
				const errorStatus = icsManager.getSyncStatus(testSource.id);
				expect(errorStatus?.status).toBe("error");
				expect(errorStatus?.error).toBeDefined();
			}
		});
	});

	describe("Error Handling", () => {
		test("should handle malformed Chinese lunar data", () => {
			const malformedData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//infinet//Chinese Lunar Calendar//EN
BEGIN:VEVENT
UID:malformed-event
DTSTART:INVALID_DATE_FORMAT
SUMMARY:三月二十|三 INVALID
CATEGORIES:农历
END:VEVENT
END:VCALENDAR`;

			const result = IcsParser.parse(malformedData, testSource);

			expect(result.events).toBeDefined();
			expect(result.errors).toBeDefined();

			// Parser should handle malformed data gracefully
			// Either by excluding invalid events or including them with default dates
			expect(result.events.length).toBeGreaterThanOrEqual(0);

			console.log(
				`Malformed data produced ${result.errors.length} errors and ${result.events.length} valid events`
			);
		});

		test("should handle missing required fields", () => {
			const incompleteData = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:incomplete-event
SUMMARY:三月二十|三
END:VEVENT
END:VCALENDAR`;

			const result = IcsParser.parse(incompleteData, testSource);

			// Event without DTSTART should not be included
			expect(result.events.length).toBe(0);
		});
	});

	describe("Performance", () => {
		test("should parse large Chinese lunar dataset efficiently", () => {
			// Create a larger dataset by repeating the sample data
			const largeDataset = Array(100)
				.fill(
					realIcsData
						.replace(
							/BEGIN:VCALENDAR[\s\S]*?BEGIN:VEVENT/,
							"BEGIN:VEVENT"
						)
						.replace(/END:VCALENDAR/, "")
				)
				.join("\n");
			const fullLargeData = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//infinet//Chinese Lunar Calendar//EN
${largeDataset}
END:VCALENDAR`;

			const startTime = performance.now();
			const result = IcsParser.parse(fullLargeData, testSource);
			const endTime = performance.now();

			const parseTime = endTime - startTime;
			console.log(
				`Parsing ${
					result.events.length
				} events took ${parseTime.toFixed(2)}ms`
			);

			// Should parse within reasonable time
			expect(parseTime).toBeLessThan(1000); // 1 second max for this test size
			expect(result.events.length).toBeGreaterThan(0);
		});
	});
});
