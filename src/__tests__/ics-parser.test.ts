/**
 * ICS Parser Tests
 * Tests for parsing Chinese Lunar Calendar ICS data
 */

import { IcsParser } from "../utils/ics/IcsParser";
import { IcsSource, IcsEvent } from "../types/ics";

describe("ICS Parser", () => {
	const testSource: IcsSource = {
		id: "test-chinese-lunar",
		name: "Chinese Lunar Calendar Test",
		url: "https://lwlsw.github.io/Chinese-Lunar-Calendar-ics/chinese_lunar_my.ics",
		enabled: true,
		refreshInterval: 60,
		showAllDayEvents: true,
		showTimedEvents: true,
		showType: "event",
	};

	let icsContent: string;

	beforeAll(async () => {
		// Fetch the actual ICS content for testing
		try {
			const response = await fetch(testSource.url);
			if (!response.ok) {
				throw new Error(
					`HTTP ${response.status}: ${response.statusText}`
				);
			}
			icsContent = await response.text();
			console.log(`Fetched ICS content: ${icsContent.length} characters`);
		} catch (error) {
			console.warn("Failed to fetch ICS content, using mock data");
			icsContent = getMockIcsContent();
		}
	});

	describe("Basic Parsing", () => {
		test("should parse ICS content without errors", () => {
			const result = IcsParser.parse(icsContent, testSource);

			expect(result).toBeDefined();
			expect(result.events).toBeDefined();
			expect(result.errors).toBeDefined();
			expect(result.metadata).toBeDefined();

			console.log(
				`Parsed ${result.events.length} events with ${result.errors.length} errors`
			);
		});

		test("should extract calendar metadata", () => {
			const result = IcsParser.parse(icsContent, testSource);

			expect(result.metadata).toBeDefined();
			// Chinese Lunar Calendar should have some metadata
			if (result.metadata.calendarName) {
				expect(typeof result.metadata.calendarName).toBe("string");
			}
			if (result.metadata.version) {
				expect(result.metadata.version).toBe("2.0");
			}
		});

		test("should parse events with required fields", () => {
			const result = IcsParser.parse(icsContent, testSource);

			expect(result.events.length).toBeGreaterThan(0);

			// Check first few events have required fields
			const sampleEvents = result.events.slice(0, 5);
			sampleEvents.forEach((event, index) => {
				expect(event.uid).toBeDefined();
				expect(event.summary).toBeDefined();
				expect(event.dtstart).toBeDefined();
				expect(event.source).toBe(testSource);

				console.log(
					`Event ${index + 1}: ${
						event.summary
					} on ${event.dtstart.toDateString()}`
				);
			});
		});
	});

	describe("Chinese Lunar Calendar Specific Tests", () => {
		test("should parse lunar festival events", () => {
			const result = IcsParser.parse(icsContent, testSource);

			// Look for common Chinese festivals
			const festivals = result.events.filter(
				(event) =>
					event.summary.includes("春节") ||
					event.summary.includes("中秋") ||
					event.summary.includes("端午") ||
					event.summary.includes("元宵") ||
					event.summary.includes("七夕") ||
					event.summary.includes("重阳")
			);

			expect(festivals.length).toBeGreaterThan(0);
			console.log(`Found ${festivals.length} Chinese festival events`);

			festivals.slice(0, 3).forEach((festival) => {
				console.log(
					`Festival: ${
						festival.summary
					} on ${festival.dtstart.toDateString()}`
				);
			});
		});

		test("should parse lunar month events", () => {
			const result = IcsParser.parse(icsContent, testSource);

			// Look for lunar month indicators
			const lunarEvents = result.events.filter(
				(event) =>
					event.summary.includes("农历") ||
					event.summary.includes("正月") ||
					event.summary.includes("二月") ||
					event.summary.includes("三月") ||
					event.summary.includes("初一") ||
					event.summary.includes("十五")
			);

			expect(lunarEvents.length).toBeGreaterThan(0);
			console.log(`Found ${lunarEvents.length} lunar calendar events`);
		});

		test("should handle all-day events correctly", () => {
			const result = IcsParser.parse(icsContent, testSource);

			const allDayEvents = result.events.filter((event) => event.allDay);
			const timedEvents = result.events.filter((event) => !event.allDay);

			console.log(
				`All-day events: ${allDayEvents.length}, Timed events: ${timedEvents.length}`
			);

			// Most Chinese lunar calendar events should be all-day
			expect(allDayEvents.length).toBeGreaterThan(0);
		});
	});

	describe("Date Parsing", () => {
		test("should parse dates correctly", () => {
			const result = IcsParser.parse(icsContent, testSource);

			result.events.slice(0, 10).forEach((event) => {
				expect(event.dtstart).toBeInstanceOf(Date);
				expect(event.dtstart.getTime()).not.toBeNaN();

				if (event.dtend) {
					expect(event.dtend).toBeInstanceOf(Date);
					expect(event.dtend.getTime()).not.toBeNaN();
					expect(event.dtend.getTime()).toBeGreaterThanOrEqual(
						event.dtstart.getTime()
					);
				}
			});
		});

		test("should handle current year events", () => {
			const result = IcsParser.parse(icsContent, testSource);
			const currentYear = new Date().getFullYear();

			const currentYearEvents = result.events.filter(
				(event) => event.dtstart.getFullYear() === currentYear
			);

			expect(currentYearEvents.length).toBeGreaterThan(0);
			console.log(
				`Found ${currentYearEvents.length} events for ${currentYear}`
			);
		});
	});

	describe("Error Handling", () => {
		test("should handle malformed ICS content gracefully", () => {
			const malformedContent = `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:Test
BEGIN:VEVENT
UID:test-1
SUMMARY:Test Event
INVALID_PROPERTY_WITHOUT_COLON
END:VEVENT
END:VCALENDAR
			`;

			const result = IcsParser.parse(malformedContent, testSource);

			expect(result.events).toBeDefined();
			expect(result.errors).toBeDefined();
			expect(result.errors.length).toBeGreaterThan(0);
		});

		test("should handle empty content", () => {
			const result = IcsParser.parse("", testSource);

			expect(result.events).toHaveLength(0);
			expect(result.errors).toBeDefined();
		});

		test("should handle non-ICS content", () => {
			const result = IcsParser.parse(
				"This is not ICS content",
				testSource
			);

			expect(result.events).toHaveLength(0);
			expect(result.errors).toBeDefined();
		});
	});

	describe("Performance Tests", () => {
		test("should parse large ICS content efficiently", () => {
			const startTime = performance.now();
			const result = IcsParser.parse(icsContent, testSource);
			const endTime = performance.now();

			const parseTime = endTime - startTime;
			console.log(
				`Parsing took ${parseTime.toFixed(2)}ms for ${
					result.events.length
				} events`
			);

			// Should parse within reasonable time (adjust threshold as needed)
			expect(parseTime).toBeLessThan(5000); // 5 seconds max
		});
	});
});

/**
 * Mock ICS content for testing when network is unavailable
 */
function getMockIcsContent(): string {
	return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Chinese Lunar Calendar//EN
CALSCALE:GREGORIAN
X-WR-CALNAME:中国农历
X-WR-CALDESC:中国传统农历节日
BEGIN:VEVENT
UID:spring-festival-2024
DTSTART;VALUE=DATE:20240210
SUMMARY:春节 (农历正月初一)
DESCRIPTION:中国传统新年，农历正月初一
CATEGORIES:节日,传统节日
STATUS:CONFIRMED
TRANSP:TRANSPARENT
END:VEVENT
BEGIN:VEVENT
UID:lantern-festival-2024
DTSTART;VALUE=DATE:20240224
SUMMARY:元宵节 (农历正月十五)
DESCRIPTION:农历正月十五，传统元宵节
CATEGORIES:节日,传统节日
STATUS:CONFIRMED
TRANSP:TRANSPARENT
END:VEVENT
BEGIN:VEVENT
UID:dragon-boat-festival-2024
DTSTART;VALUE=DATE:20240610
SUMMARY:端午节 (农历五月初五)
DESCRIPTION:农历五月初五，纪念屈原
CATEGORIES:节日,传统节日
STATUS:CONFIRMED
TRANSP:TRANSPARENT
END:VEVENT
BEGIN:VEVENT
UID:mid-autumn-festival-2024
DTSTART;VALUE=DATE:20240917
SUMMARY:中秋节 (农历八月十五)
DESCRIPTION:农历八月十五，团圆节
CATEGORIES:节日,传统节日
STATUS:CONFIRMED
TRANSP:TRANSPARENT
END:VEVENT
BEGIN:VEVENT
UID:double-ninth-festival-2024
DTSTART;VALUE=DATE:20241011
SUMMARY:重阳节 (农历九月初九)
DESCRIPTION:农历九月初九，登高节
CATEGORIES:节日,传统节日
STATUS:CONFIRMED
TRANSP:TRANSPARENT
END:VEVENT
END:VCALENDAR`;
}
