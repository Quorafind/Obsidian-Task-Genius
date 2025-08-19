import { getTodayLocalDateString, getLocalDateString } from "../utils/date/date-formatter";

describe("dateUtil", () => {
	describe("getTodayLocalDateString", () => {
		test("should return today's date in YYYY-MM-DD format in local timezone", () => {
			const result = getTodayLocalDateString();
			const today = new Date();
			const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
			
			expect(result).toBe(expected);
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		});

		test("should not be affected by timezone differences", () => {
			// This test verifies that our function returns the local date
			// regardless of what toISOString() would return
			const result = getTodayLocalDateString();
			const today = new Date();
			const isoDate = today.toISOString().split('T')[0];
			
			// The result should match the local date calculation
			const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
			expect(result).toBe(localDate);
			
			// Note: result might differ from isoDate if user is in a timezone ahead of UTC
			// and it's early morning, but that's the bug we're fixing
		});
	});

	describe("getLocalDateString", () => {
		test("should convert Date object to YYYY-MM-DD format in local timezone", () => {
			const testDate = new Date(2024, 0, 15); // January 15, 2024 (month is 0-indexed)
			const result = getLocalDateString(testDate);
			
			expect(result).toBe("2024-01-15");
		});

		test("should handle different dates correctly", () => {
			const testCases = [
				{ date: new Date(2024, 11, 31), expected: "2024-12-31" }, // December 31, 2024
				{ date: new Date(2023, 0, 1), expected: "2023-01-01" },   // January 1, 2023
				{ date: new Date(2024, 5, 15), expected: "2024-06-15" },  // June 15, 2024
			];

			testCases.forEach(({ date, expected }) => {
				expect(getLocalDateString(date)).toBe(expected);
			});
		});

		test("should not be affected by timezone when converting local Date objects", () => {
			const testDate = new Date(2024, 0, 15, 10, 30, 0); // January 15, 2024, 10:30 AM local time
			const result = getLocalDateString(testDate);
			
			// Should always return the local date part
			expect(result).toBe("2024-01-15");
			
			// Verify it matches our manual calculation
			const expected = `${testDate.getFullYear()}-${String(testDate.getMonth() + 1).padStart(2, '0')}-${String(testDate.getDate()).padStart(2, '0')}`;
			expect(result).toBe(expected);
		});
	});
});
