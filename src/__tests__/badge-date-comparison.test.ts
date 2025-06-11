/**
 * Badge Date Comparison Tests
 * Tests to verify moment date comparison issues in badge rendering
 */

import { moment } from "obsidian";

describe("Badge Date Comparison", () => {
	describe("Moment isSame comparison", () => {
		test("should compare dates correctly with different input types", () => {
			console.log("=== Date Comparison Debug ===");

			// Test different ways dates might be created
			const targetDate = new Date("2024-01-15T00:00:00.000Z");
			const eventDate1 = new Date("2024-01-15T10:00:00.000Z"); // Same day, different time
			const eventDate2 = new Date("2024-01-15T00:00:00.000Z"); // Exact same
			const eventDate3 = new Date("2024-01-16T00:00:00.000Z"); // Different day

			console.log("Target date:", targetDate.toISOString());
			console.log("Event date 1:", eventDate1.toISOString());
			console.log("Event date 2:", eventDate2.toISOString());
			console.log("Event date 3:", eventDate3.toISOString());

			// Test moment comparison
			const targetMoment = moment(targetDate).startOf("day");
			const eventMoment1 = moment(eventDate1).startOf("day");
			const eventMoment2 = moment(eventDate2).startOf("day");
			const eventMoment3 = moment(eventDate3).startOf("day");

			console.log("\nMoment objects:");
			console.log("Target moment:", targetMoment.format("YYYY-MM-DD"));
			console.log("Event moment 1:", eventMoment1.format("YYYY-MM-DD"));
			console.log("Event moment 2:", eventMoment2.format("YYYY-MM-DD"));
			console.log("Event moment 3:", eventMoment3.format("YYYY-MM-DD"));

			// Test isSame
			const isSame1 = eventMoment1.isSame(targetMoment);
			const isSame2 = eventMoment2.isSame(targetMoment);
			const isSame3 = eventMoment3.isSame(targetMoment);

			console.log("\nisSame results:");
			console.log("Event 1 isSame target:", isSame1);
			console.log("Event 2 isSame target:", isSame2);
			console.log("Event 3 isSame target:", isSame3);

			// Test with 'day' unit
			const isSameDay1 = eventMoment1.isSame(targetMoment, "day");
			const isSameDay2 = eventMoment2.isSame(targetMoment, "day");
			const isSameDay3 = eventMoment3.isSame(targetMoment, "day");

			console.log("\nisSame with 'day' unit:");
			console.log("Event 1 isSame target (day):", isSameDay1);
			console.log("Event 2 isSame target (day):", isSameDay2);
			console.log("Event 3 isSame target (day):", isSameDay3);

			// Assertions
			expect(isSame1).toBe(true); // Same day after startOf('day')
			expect(isSame2).toBe(true); // Same day
			expect(isSame3).toBe(false); // Different day

			expect(isSameDay1).toBe(true);
			expect(isSameDay2).toBe(true);
			expect(isSameDay3).toBe(false);
		});

		test("should handle timezone issues correctly", () => {
			console.log("\n=== Timezone Comparison Debug ===");

			// Simulate potential timezone issues
			const utcDate = new Date("2024-01-15T10:00:00.000Z");
			const localDate = new Date("2024-01-15T10:00:00"); // No Z, local time

			console.log("UTC date:", utcDate.toISOString());
			console.log("Local date:", localDate.toISOString());
			console.log("UTC date local string:", utcDate.toString());
			console.log("Local date local string:", localDate.toString());

			const utcMoment = moment(utcDate).startOf("day");
			const localMoment = moment(localDate).startOf("day");
			const targetMoment = moment(new Date("2024-01-15")).startOf("day");

			console.log("\nMoment formats:");
			console.log("UTC moment:", utcMoment.format("YYYY-MM-DD HH:mm:ss"));
			console.log(
				"Local moment:",
				localMoment.format("YYYY-MM-DD HH:mm:ss")
			);
			console.log(
				"Target moment:",
				targetMoment.format("YYYY-MM-DD HH:mm:ss")
			);

			const utcSame = utcMoment.isSame(targetMoment, "day");
			const localSame = localMoment.isSame(targetMoment, "day");

			console.log("\nComparison results:");
			console.log("UTC same as target:", utcSame);
			console.log("Local same as target:", localSame);

			// Both should be true for the same day
			expect(utcSame).toBe(true);
			expect(localSame).toBe(true);
		});

		test("should debug actual badge comparison scenario", () => {
			console.log("\n=== Actual Badge Scenario Debug ===");

			// Simulate the actual scenario from getBadgeEventsForDate
			const inputDate = new Date("2024-01-15"); // Date passed to getBadgeEventsForDate
			const icsEventDate = new Date("2024-01-15T10:00:00Z"); // ICS event dtstart

			console.log("Input date:", inputDate.toISOString());
			console.log("ICS event date:", icsEventDate.toISOString());

			// This is what happens in getBadgeEventsForDate
			const targetDate = moment(inputDate).startOf("day");
			const eventDate = moment(icsEventDate).startOf("day");

			console.log(
				"Target date moment:",
				targetDate.format("YYYY-MM-DD HH:mm:ss")
			);
			console.log(
				"Event date moment:",
				eventDate.format("YYYY-MM-DD HH:mm:ss")
			);

			// Test the comparison
			const isSameResult = eventDate.isSame(targetDate);
			const isSameDayResult = eventDate.isSame(targetDate, "day");

			console.log("isSame result:", isSameResult);
			console.log("isSame with 'day' unit:", isSameDayResult);

			// Debug internal values
			console.log("\nInternal debug:");
			console.log("Target date valueOf:", targetDate.valueOf());
			console.log("Event date valueOf:", eventDate.valueOf());
			console.log("Target date _date:", (targetDate as any)._date);
			console.log("Event date _date:", (eventDate as any)._date);

			// This should be true
			expect(isSameResult).toBe(true);
			expect(isSameDayResult).toBe(true);
		});

		test("should test edge cases with different date formats", () => {
			console.log("\n=== Edge Cases Debug ===");

			// Test various date input formats
			const testCases = [
				{
					name: "String date",
					target: "2024-01-15",
					event: "2024-01-15T10:00:00Z",
				},
				{
					name: "Timestamp",
					target: new Date("2024-01-15").getTime(),
					event: new Date("2024-01-15T10:00:00Z").getTime(),
				},
				{
					name: "Date objects",
					target: new Date("2024-01-15"),
					event: new Date("2024-01-15T10:00:00Z"),
				},
			];

			testCases.forEach((testCase, index) => {
				console.log(`\nTest case ${index + 1}: ${testCase.name}`);
				console.log("Target:", testCase.target);
				console.log("Event:", testCase.event);

				const targetMoment = moment(testCase.target).startOf("day");
				const eventMoment = moment(testCase.event).startOf("day");

				console.log(
					"Target moment:",
					targetMoment.format("YYYY-MM-DD HH:mm:ss")
				);
				console.log(
					"Event moment:",
					eventMoment.format("YYYY-MM-DD HH:mm:ss")
				);

				const isSame = eventMoment.isSame(targetMoment);
				console.log("isSame result:", isSame);

				expect(isSame).toBe(true);
			});
		});

		test("should identify the specific issue with mock moment", () => {
			console.log("\n=== Mock Moment Issue Debug ===");

			// Test the exact scenario that might be failing
			const date = new Date("2024-01-15");
			const icsEventDtstart = new Date("2024-01-15T10:00:00Z");

			console.log("Original dates:");
			console.log("Date:", date);
			console.log("ICS event dtstart:", icsEventDtstart);

			// Create moments like in the actual code
			const targetDate = moment(date).startOf("day");
			const eventDate = moment(icsEventDtstart).startOf("day");

			console.log("\nMoment objects:");
			console.log("Target date:", targetDate);
			console.log("Event date:", eventDate);

			// Check internal structure
			console.log("\nInternal structure:");
			console.log("Target date _date:", (targetDate as any)._date);
			console.log("Event date _date:", (eventDate as any)._date);

			// Test the comparison
			const result = eventDate.isSame(targetDate);
			console.log("\nComparison result:", result);

			// Manual comparison for debugging
			if ((targetDate as any)._date && (eventDate as any)._date) {
				const targetDateStr = (targetDate as any)._date
					.toISOString()
					.split("T")[0];
				const eventDateStr = (eventDate as any)._date
					.toISOString()
					.split("T")[0];
				console.log("Manual string comparison:");
				console.log("Target date string:", targetDateStr);
				console.log("Event date string:", eventDateStr);
				console.log("Strings equal:", targetDateStr === eventDateStr);
			}

			expect(result).toBe(true);
		});
	});
});
