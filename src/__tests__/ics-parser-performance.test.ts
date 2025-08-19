/**
 * ICS Parser Performance Tests
 * Tests for optimized parsing performance
 */

import { IcsParser } from "../parsers/ics-parser";
import { IcsSource } from "../types/ics";

describe("ICS Parser Performance", () => {
	const testSource: IcsSource = {
		id: "test-performance",
		name: "Performance Test",
		url: "test://performance",
		enabled: true,
		refreshInterval: 60,
		showAllDayEvents: true,
		showTimedEvents: true,
		showType: "event",
	};

	// Mock ICS content with multiple events
	const createMockIcsContent = (eventCount: number): string => {
		const events = [];
		for (let i = 0; i < eventCount; i++) {
			const date = new Date(2024, 0, i + 1);
			const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
			
			events.push(`BEGIN:VEVENT
UID:event-${i}@test.com
DTSTART;VALUE=DATE:${dateStr}
DTEND;VALUE=DATE:${dateStr}
SUMMARY:Test Event ${i}
DESCRIPTION:This is test event number ${i}
LOCATION:Test Location ${i}
STATUS:CONFIRMED
CATEGORIES:test,performance
PRIORITY:5
CREATED:20240101T120000Z
LAST-MODIFIED:20240101T120000Z
END:VEVENT`);
		}

		return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
CALSCALE:GREGORIAN
X-WR-CALNAME:Performance Test Calendar
X-WR-CALDESC:Calendar for performance testing
${events.join('\n')}
END:VCALENDAR`;
	};

	beforeEach(() => {
		// Clear cache before each test
		IcsParser.clearCache();
	});

	describe("Parsing Performance", () => {
		test("should parse small ICS content quickly", () => {
			const content = createMockIcsContent(10);
			
			const startTime = performance.now();
			const result = IcsParser.parse(content, testSource);
			const endTime = performance.now();
			
			const parseTime = endTime - startTime;
			
			expect(result.events).toHaveLength(10);
			expect(result.errors).toHaveLength(0);
			expect(parseTime).toBeLessThan(50); // Should be very fast for small content
			
			console.log(`Small content (10 events) parsing took ${parseTime.toFixed(2)}ms`);
		});

		test("should parse medium ICS content efficiently", () => {
			const content = createMockIcsContent(100);
			
			const startTime = performance.now();
			const result = IcsParser.parse(content, testSource);
			const endTime = performance.now();
			
			const parseTime = endTime - startTime;
			
			expect(result.events).toHaveLength(100);
			expect(result.errors).toHaveLength(0);
			expect(parseTime).toBeLessThan(200); // Should be fast for medium content
			
			console.log(`Medium content (100 events) parsing took ${parseTime.toFixed(2)}ms`);
		});

		test("should parse large ICS content within reasonable time", () => {
			const content = createMockIcsContent(1000);
			
			const startTime = performance.now();
			const result = IcsParser.parse(content, testSource);
			const endTime = performance.now();
			
			const parseTime = endTime - startTime;
			
			expect(result.events).toHaveLength(1000);
			expect(result.errors).toHaveLength(0);
			expect(parseTime).toBeLessThan(1000); // Should be under 1 second for large content
			
			console.log(`Large content (1000 events) parsing took ${parseTime.toFixed(2)}ms`);
		});
	});

	describe("Caching Performance", () => {
		test("should benefit from caching on repeated parsing", () => {
			const content = createMockIcsContent(100);
			
			// First parse (no cache)
			const startTime1 = performance.now();
			const result1 = IcsParser.parse(content, testSource);
			const endTime1 = performance.now();
			const firstParseTime = endTime1 - startTime1;
			
			// Second parse (with cache)
			const startTime2 = performance.now();
			const result2 = IcsParser.parse(content, testSource);
			const endTime2 = performance.now();
			const secondParseTime = endTime2 - startTime2;
			
			expect(result1.events).toHaveLength(100);
			expect(result2.events).toHaveLength(100);
			expect(secondParseTime).toBeLessThan(firstParseTime * 0.5); // Cache should be at least 50% faster
			
			console.log(`First parse: ${firstParseTime.toFixed(2)}ms, Cached parse: ${secondParseTime.toFixed(2)}ms`);
			console.log(`Cache speedup: ${(firstParseTime / secondParseTime).toFixed(2)}x`);
		});

		test("should manage cache size properly", () => {
			const cacheStatsBefore = IcsParser.getCacheStats();
			expect(cacheStatsBefore.size).toBe(0);
			
			// Parse multiple different contents to fill cache
			for (let i = 0; i < 60; i++) { // More than MAX_CACHE_SIZE (50)
				const content = createMockIcsContent(5) + `\n<!-- unique-${i} -->`;
				IcsParser.parse(content, { ...testSource, id: `test-${i}` });
			}
			
			const cacheStatsAfter = IcsParser.getCacheStats();
			expect(cacheStatsAfter.size).toBeLessThanOrEqual(cacheStatsAfter.maxSize);
			
			console.log(`Cache size after filling: ${cacheStatsAfter.size}/${cacheStatsAfter.maxSize}`);
		});
	});

	describe("Memory Efficiency", () => {
		test("should handle string operations efficiently", () => {
			// Test with content that has many folded lines
			const foldedContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test Calendar//EN
BEGIN:VEVENT
UID:folded-test@test.com
DTSTART:20240101T120000Z
SUMMARY:This is a very long summary that will be folded across multiple
 lines to test the unfolding optimization and ensure it works correctly
 with the new array-based approach instead of string concatenation
DESCRIPTION:This is also a very long description that spans multiple
 lines and contains various escape sequences like \\n newlines and \\,
 commas and \\; semicolons to test the unescaping optimization
END:VEVENT
END:VCALENDAR`;

			const startTime = performance.now();
			const result = IcsParser.parse(foldedContent, testSource);
			const endTime = performance.now();
			
			expect(result.events).toHaveLength(1);
			expect(result.events[0].summary).toContain("folded across multiple lines");
			expect(result.events[0].description).toContain("newlines");
			
			console.log(`Folded content parsing took ${(endTime - startTime).toFixed(2)}ms`);
		});
	});
});
