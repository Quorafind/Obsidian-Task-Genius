import { processDateTemplates } from "../utils/fileUtils";

// Mock moment function to return predictable results
jest.mock("obsidian", () => ({
	moment: jest.fn(() => ({
		format: jest.fn((format: string) => {
			// Mock current date as 2024-01-15 14:30:00
			switch (format) {
				case "YYYY-MM-DD":
					return "2024-01-15";
				case "YYYY-MM-DD HH:mm":
					return "2024-01-15 14:30";
				case "YYYY":
					return "2024";
				case "MM":
					return "01";
				case "DD":
					return "15";
				case "HH:mm":
					return "14:30";
				default:
					return format; // Return format as-is for unknown formats
			}
		}),
	})),
}));

describe("Date Templates", () => {
	test("should replace {{DATE:YYYY-MM-DD}} with current date", () => {
		const input = "folder/{{DATE:YYYY-MM-DD}}.md";
		const result = processDateTemplates(input);
		expect(result).toBe("folder/2024-01-15.md");
	});

	test("should replace {{date:YYYY-MM-DD HH:mm}} with current date and time", () => {
		const input = "notes/{{date:YYYY-MM-DD HH:mm}}.md";
		const result = processDateTemplates(input);
		expect(result).toBe("notes/2024-01-15 14:30.md");
	});

	test("should handle multiple date templates in one path", () => {
		const input = "{{DATE:YYYY}}/{{DATE:MM}}/{{DATE:DD}}.md";
		const result = processDateTemplates(input);
		expect(result).toBe("2024/01/15.md");
	});

	test("should handle case insensitive DATE keyword", () => {
		const input1 = "{{DATE:YYYY-MM-DD}}.md";
		const input2 = "{{date:YYYY-MM-DD}}.md";

		const result1 = processDateTemplates(input1);
		const result2 = processDateTemplates(input2);

		expect(result1).toBe("2024-01-15.md");
		expect(result2).toBe("2024-01-15.md");
	});

	test("should leave non-template text unchanged", () => {
		const input = "regular/path/file.md";
		const result = processDateTemplates(input);
		expect(result).toBe("regular/path/file.md");
	});

	test("should handle mixed template and regular text", () => {
		const input = "daily-notes/{{DATE:YYYY-MM-DD}}-journal.md";
		const result = processDateTemplates(input);
		expect(result).toBe("daily-notes/2024-01-15-journal.md");
	});

	test("should handle invalid format gracefully", () => {
		const input = "{{DATE:INVALID_FORMAT}}.md";
		const result = processDateTemplates(input);
		// Should return the original template if format is invalid
		expect(result).toBe("INVALID_FORMAT.md");
	});

	test("should handle empty string", () => {
		const input = "";
		const result = processDateTemplates(input);
		expect(result).toBe("");
	});

	test("should handle malformed templates", () => {
		const input1 = "{{DATE:}}.md"; // Empty format
		const input2 = "{{DATE.md"; // Missing closing braces
		const input3 = "DATE:YYYY-MM-DD}}.md"; // Missing opening braces

		const result1 = processDateTemplates(input1);
		const result2 = processDateTemplates(input2);
		const result3 = processDateTemplates(input3);

		// Should leave malformed templates unchanged
		expect(result1).toBe("{{DATE:}}.md"); // Empty format should return original match
		expect(result2).toBe("{{DATE.md");
		expect(result3).toBe("DATE:YYYY-MM-DD}}.md");
	});
});
