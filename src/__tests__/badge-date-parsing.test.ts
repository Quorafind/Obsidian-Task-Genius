/**
 * Badge Date Parsing Tests
 * Tests to verify date parsing issues in getBadgeEventsForDate
 */

import { moment } from "obsidian";

describe("Badge Date Parsing", () => {
	describe("Date input parsing", () => {
		test("should handle different date input formats", () => {
			console.log("=== Date Input Parsing Debug ===");

			// Test the actual data you provided
			const realIcsEventDate = "2020-01-31T16:00:00.000Z";
			const realQueryDate =
				"Sun Jul 06 2025 00:00:00 GMT+0800 (China Standard Time)";

			console.log("Real ICS event date:", realIcsEventDate);
			console.log("Real query date:", realQueryDate);

			// Parse the ICS event date
			const icsDate = new Date(realIcsEventDate);
			console.log("Parsed ICS date:", icsDate);
			console.log("ICS date ISO:", icsDate.toISOString());

			// Parse the query date (this might be the problem)
			const queryDate = new Date(realQueryDate);
			console.log("Parsed query date:", queryDate);
			console.log("Query date ISO:", queryDate.toISOString());
			console.log("Query date valid:", !isNaN(queryDate.getTime()));

			// Test moment parsing
			const icsMoment = moment(icsDate).startOf("day");
			const queryMoment = moment(queryDate).startOf("day");

			console.log("ICS moment:", icsMoment.format("YYYY-MM-DD"));
			console.log("Query moment:", queryMoment.format("YYYY-MM-DD"));

			// These should obviously not match (2020 vs 2025)
			const shouldMatch = icsMoment.isSame(queryMoment);
			console.log("Should match (obviously no):", shouldMatch);

			expect(shouldMatch).toBe(false); // They shouldn't match
		});

		test("should test various date string formats that might be passed", () => {
			console.log("\n=== Various Date Format Tests ===");

			const testFormats = [
				"Sun Jul 06 2025 00:00:00 GMT+0800 (China Standard Time)",
				"2025-07-06",
				"2025-07-06T00:00:00.000Z",
				"2025-07-06T00:00:00+08:00",
				new Date("2025-07-06"),
				new Date("2025-07-06T00:00:00.000Z"),
				1751731200000, // timestamp for 2025-07-06
			];

			testFormats.forEach((dateInput, index) => {
				console.log(
					`\nTest ${index + 1}: ${typeof dateInput} - ${dateInput}`
				);

				try {
					const parsedDate = new Date(dateInput as any);
					console.log("  Parsed:", parsedDate);
					console.log("  ISO:", parsedDate.toISOString());
					console.log("  Valid:", !isNaN(parsedDate.getTime()));

					const momentDate = moment(parsedDate).startOf("day");
					console.log("  Moment:", momentDate.format("YYYY-MM-DD"));
				} catch (error) {
					console.log("  Error:", error);
				}
			});
		});

		test("should test the specific scenario with real data", () => {
			console.log("\n=== Real Scenario Test ===");

			// Your real ICS task data
			const icsTask = {
				id: "ics-ics-1749431536058-nzoj4uxtw-2020-02-01-lc@infinet.github.io",
				content: "正月初八|六 2-1",
				filePath: "ics://农历",
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] 正月初八|六 2-1",
				metadata: {
					tags: [],
					children: [],
					startDate: 1580486400000,
					dueDate: 1580486400000,
					scheduledDate: 1580486400000,
					project: "农历",
					heading: [],
				},
				icsEvent: {
					uid: "2020-02-01-lc@infinet.github.io",
					summary: "正月初八|六 2-1",
					dtstart: "2020-01-31T16:00:00.000Z",
					allDay: true,
					source: {
						id: "ics-1749431536058-nzoj4uxtw",
						name: "农历",
						url: "https://lwlsw.github.io/Chinese-Lunar-Calendar-ics/chinese_lunar_my.ics",
						enabled: true,
						refreshInterval: 60,
						showAllDayEvents: true,
						showTimedEvents: true,
						showType: "badge",
					},
					dtend: "2020-01-31T16:00:00.000Z",
					status: "CONFIRMED",
				},
				readonly: true,
				source: {
					type: "ics",
					name: "农历",
					id: "ics-1749431536058-nzoj4uxtw",
				},
			};

			// Test different ways the date might be passed to getBadgeEventsForDate
			const possibleDateInputs = [
				"Sun Jul 06 2025 00:00:00 GMT+0800 (China Standard Time)",
				new Date(
					"Sun Jul 06 2025 00:00:00 GMT+0800 (China Standard Time)"
				),
				new Date("2025-07-06"),
				new Date(2025, 6, 6), // Month is 0-based
			];

			possibleDateInputs.forEach((dateInput, index) => {
				console.log(`\nDate input ${index + 1}:`, dateInput);

				// Simulate getBadgeEventsForDate logic
				const targetDate = moment(dateInput as any).startOf("day");
				const eventDate = moment(icsTask.icsEvent.dtstart).startOf(
					"day"
				);

				console.log(
					"  Target date moment:",
					targetDate.format("YYYY-MM-DD")
				);
				console.log(
					"  Event date moment:",
					eventDate.format("YYYY-MM-DD")
				);
				console.log("  Dates match:", eventDate.isSame(targetDate));
				console.log(
					"  String comparison:",
					eventDate.format("YYYY-MM-DD") ===
						targetDate.format("YYYY-MM-DD")
				);
			});
		});

		test("should test if the issue is with dtstart being a string", () => {
			console.log("\n=== dtstart String vs Date Test ===");

			const dtstartString = "2020-01-31T16:00:00.000Z";
			const dtstartDate = new Date(dtstartString);

			console.log("dtstart as string:", dtstartString);
			console.log("dtstart as Date:", dtstartDate);

			// Test moment parsing of both
			const momentFromString = moment(dtstartString).startOf("day");
			const momentFromDate = moment(dtstartDate).startOf("day");

			console.log(
				"Moment from string:",
				momentFromString.format("YYYY-MM-DD")
			);
			console.log(
				"Moment from Date:",
				momentFromDate.format("YYYY-MM-DD")
			);
			console.log(
				"Both moments equal:",
				momentFromString.isSame(momentFromDate)
			);

			// Test with a target date
			const targetDate = moment(new Date("2020-01-31")).startOf("day");
			console.log("Target date:", targetDate.format("YYYY-MM-DD"));
			console.log(
				"String moment matches target:",
				momentFromString.isSame(targetDate)
			);
			console.log(
				"Date moment matches target:",
				momentFromDate.isSame(targetDate)
			);
		});

		test("should test timezone handling", () => {
			console.log("\n=== Timezone Handling Test ===");

			// The ICS event is at 16:00 UTC on 2020-01-31
			// In China timezone (GMT+8), this would be 00:00 on 2020-02-01
			const dtstartUTC = "2020-01-31T16:00:00.000Z";
			const date = new Date(dtstartUTC);

			console.log("UTC date:", date.toISOString());
			console.log("Local date string:", date.toString());
			console.log("Local date only:", date.toDateString());

			// Test different ways to get the local date
			const localYear = date.getFullYear();
			const localMonth = date.getMonth();
			const localDay = date.getDate();

			console.log(
				"Local components:",
				localYear,
				localMonth + 1,
				localDay
			);

			// Create a local date for comparison
			const localDate = new Date(localYear, localMonth, localDay);
			console.log("Reconstructed local date:", localDate);

			// Test moment with different approaches
			const momentUTC = moment(date).startOf("day");
			const momentLocal = moment(localDate).startOf("day");

			console.log(
				"Moment UTC startOf day:",
				momentUTC.format("YYYY-MM-DD")
			);
			console.log(
				"Moment local startOf day:",
				momentLocal.format("YYYY-MM-DD")
			);

			// Test if they match a target date of 2020-02-01 (local date)
			const targetDate = moment(new Date("2020-02-01")).startOf("day");
			console.log("Target date:", targetDate.format("YYYY-MM-DD"));
			console.log("UTC moment matches:", momentUTC.isSame(targetDate));
			console.log(
				"Local moment matches:",
				momentLocal.isSame(targetDate)
			);
		});
	});
});
