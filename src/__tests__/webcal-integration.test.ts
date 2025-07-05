/**
 * Webcal Integration Tests
 * Tests for webcal URL conversion and integration functionality
 */

import { WebcalUrlConverter } from "../utils/ics/WebcalUrlConverter";

describe("WebcalUrlConverter", () => {
	describe("convertWebcalUrl", () => {
		test("should convert webcal URL to https", () => {
			const url = "webcal://p110-caldav.icloud.com/published/2/test";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.wasWebcal).toBe(true);
			expect(result.convertedUrl).toBe(
				"https://p110-caldav.icloud.com/published/2/test"
			);
			expect(result.originalUrl).toBe(url);
		});

		test("should convert webcal URL with path and query parameters", () => {
			const url =
				"webcal://example.com/calendar.ics?param=value&other=test";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.wasWebcal).toBe(true);
			expect(result.convertedUrl).toBe(
				"https://example.com/calendar.ics?param=value&other=test"
			);
		});

		test("should handle case-insensitive webcal protocol", () => {
			const url = "WEBCAL://example.com/calendar.ics";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.wasWebcal).toBe(true);
			expect(result.convertedUrl).toBe(
				"https://example.com/calendar.ics"
			);
		});

		test("should use http for localhost", () => {
			const url = "webcal://localhost:3000/calendar.ics";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.wasWebcal).toBe(true);
			expect(result.convertedUrl).toBe(
				"http://localhost:3000/calendar.ics"
			);
		});

		test("should use http for 127.0.0.1", () => {
			const url = "webcal://127.0.0.1:8080/calendar.ics";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.wasWebcal).toBe(true);
			expect(result.convertedUrl).toBe(
				"http://127.0.0.1:8080/calendar.ics"
			);
		});

		test("should accept valid https URL without conversion", () => {
			const url = "https://example.com/calendar.ics";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.wasWebcal).toBe(false);
			expect(result.convertedUrl).toBe(url);
		});

		test("should accept valid http URL without conversion", () => {
			const url = "http://example.com/calendar.ics";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.wasWebcal).toBe(false);
			expect(result.convertedUrl).toBe(url);
		});

		test("should reject empty URL", () => {
			const result = WebcalUrlConverter.convertWebcalUrl("");

			expect(result.success).toBe(false);
			expect(result.wasWebcal).toBe(false);
			expect(result.error).toContain("URL cannot be empty");
		});

		test("should reject whitespace-only URL", () => {
			const result = WebcalUrlConverter.convertWebcalUrl("   ");

			expect(result.success).toBe(false);
			expect(result.wasWebcal).toBe(false);
			expect(result.error).toContain("URL cannot be empty");
		});

		test("should reject invalid URL format", () => {
			const result = WebcalUrlConverter.convertWebcalUrl("not-a-url");

			expect(result.success).toBe(false);
			expect(result.wasWebcal).toBe(false);
			expect(result.error).toContain("Invalid URL format");
		});

		test("should reject unsupported protocol", () => {
			const result = WebcalUrlConverter.convertWebcalUrl(
				"ftp://example.com/calendar.ics"
			);

			expect(result.success).toBe(false);
			expect(result.wasWebcal).toBe(false);
			expect(result.error).toContain("Invalid URL format");
		});

		test("should handle URL with fragments", () => {
			const url = "webcal://example.com/calendar.ics#section";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.wasWebcal).toBe(true);
			expect(result.convertedUrl).toBe(
				"https://example.com/calendar.ics#section"
			);
		});

		test("should handle URL with authentication info", () => {
			const url = "webcal://user:pass@example.com/calendar.ics";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.wasWebcal).toBe(true);
			expect(result.convertedUrl).toBe(
				"https://user:pass@example.com/calendar.ics"
			);
		});
	});

	describe("isWebcalUrl", () => {
		test("should identify webcal URLs", () => {
			expect(WebcalUrlConverter.isWebcalUrl("webcal://example.com")).toBe(
				true
			);
			expect(WebcalUrlConverter.isWebcalUrl("WEBCAL://example.com")).toBe(
				true
			);
			expect(WebcalUrlConverter.isWebcalUrl("WebCal://example.com")).toBe(
				true
			);
		});

		test("should not identify non-webcal URLs", () => {
			expect(WebcalUrlConverter.isWebcalUrl("https://example.com")).toBe(
				false
			);
			expect(WebcalUrlConverter.isWebcalUrl("http://example.com")).toBe(
				false
			);
			expect(WebcalUrlConverter.isWebcalUrl("ftp://example.com")).toBe(
				false
			);
			expect(WebcalUrlConverter.isWebcalUrl("example.com")).toBe(false);
			expect(WebcalUrlConverter.isWebcalUrl("")).toBe(false);
		});

		test("should handle URLs with whitespace", () => {
			expect(
				WebcalUrlConverter.isWebcalUrl("  webcal://example.com  ")
			).toBe(true);
			expect(
				WebcalUrlConverter.isWebcalUrl("  https://example.com  ")
			).toBe(false);
		});
	});

	describe("getFetchUrl", () => {
		test("should return converted URL for valid webcal", () => {
			const url = "webcal://example.com/calendar.ics";
			const fetchUrl = WebcalUrlConverter.getFetchUrl(url);

			expect(fetchUrl).toBe("https://example.com/calendar.ics");
		});

		test("should return original URL for valid http/https", () => {
			const url = "https://example.com/calendar.ics";
			const fetchUrl = WebcalUrlConverter.getFetchUrl(url);

			expect(fetchUrl).toBe(url);
		});

		test("should return null for invalid URL", () => {
			const fetchUrl = WebcalUrlConverter.getFetchUrl("invalid-url");

			expect(fetchUrl).toBe(null);
		});

		test("should return null for empty URL", () => {
			const fetchUrl = WebcalUrlConverter.getFetchUrl("");

			expect(fetchUrl).toBe(null);
		});
	});

	describe("getConversionDescription", () => {
		test("should describe successful webcal conversion", () => {
			const result = WebcalUrlConverter.convertWebcalUrl(
				"webcal://example.com/calendar.ics"
			);
			const description =
				WebcalUrlConverter.getConversionDescription(result);

			expect(description).toContain("Converted webcal URL to:");
			expect(description).toContain("https://example.com/calendar.ics");
		});

		test("should describe valid HTTP URL", () => {
			const result = WebcalUrlConverter.convertWebcalUrl(
				"https://example.com/calendar.ics"
			);
			const description =
				WebcalUrlConverter.getConversionDescription(result);

			expect(description).toContain("Valid HTTP/HTTPS URL:");
			expect(description).toContain("https://example.com/calendar.ics");
		});

		test("should describe conversion errors", () => {
			const result = WebcalUrlConverter.convertWebcalUrl("invalid-url");
			const description =
				WebcalUrlConverter.getConversionDescription(result);

			expect(description).toContain("Error:");
			expect(description).toContain("Invalid URL format");
		});
	});

	describe("Real-world URL scenarios", () => {
		test("should handle iCloud webcal URL", () => {
			const url =
				"webcal://p110-caldav.icloud.com/published/2/MTE1OTQ3OTAzNDAxMTU5NN9Kxibs06tCYSsC7GTzrvyViPGkfbZEn_8WMVGFcOzyjJ3ldmeaW-8szOZJQvs8jlkEVQoJJYDGsYisXTi9sVU";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.wasWebcal).toBe(true);
			expect(result.convertedUrl).toBe(
				"https://p110-caldav.icloud.com/published/2/MTE1OTQ3OTAzNDAxMTU5NN9Kxibs06tCYSsC7GTzrvyViPGkfbZEn_8WMVGFcOzyjJ3ldmeaW-8szOZJQvs8jlkEVQoJJYDGsYisXTi9sVU"
			);
		});

		test("should handle Google Calendar webcal URL", () => {
			const url =
				"webcal://calendar.google.com/calendar/ical/example%40gmail.com/public/basic.ics";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.wasWebcal).toBe(true);
			expect(result.convertedUrl).toBe(
				"https://calendar.google.com/calendar/ical/example%40gmail.com/public/basic.ics"
			);
		});

		test("should handle Outlook webcal URL", () => {
			const url =
				"webcal://outlook.live.com/owa/calendar/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000/cid-0000000000000000/calendar.ics";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.wasWebcal).toBe(true);
			expect(result.convertedUrl).toBe(
				"https://outlook.live.com/owa/calendar/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000/cid-0000000000000000/calendar.ics"
			);
		});

		test("should handle CalDAV server webcal URL", () => {
			const url =
				"webcal://caldav.example.com:8443/calendars/user/calendar.ics";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.wasWebcal).toBe(true);
			expect(result.convertedUrl).toBe(
				"https://caldav.example.com:8443/calendars/user/calendar.ics"
			);
		});
	});

	describe("Edge cases", () => {
		test("should handle URL with unusual characters", () => {
			const url =
				"webcal://example.com/calendar-with-dashes_and_underscores.ics";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.convertedUrl).toBe(
				"https://example.com/calendar-with-dashes_and_underscores.ics"
			);
		});

		test("should handle URL with encoded characters", () => {
			const url = "webcal://example.com/calendar%20with%20spaces.ics";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.convertedUrl).toBe(
				"https://example.com/calendar%20with%20spaces.ics"
			);
		});

		test("should handle URL with multiple subdirectories", () => {
			const url =
				"webcal://example.com/path/to/deeply/nested/calendar.ics";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.convertedUrl).toBe(
				"https://example.com/path/to/deeply/nested/calendar.ics"
			);
		});

		test("should handle URL with complex query parameters", () => {
			const url =
				"webcal://example.com/calendar.ics?timezone=UTC&format=ical&filter=work";
			const result = WebcalUrlConverter.convertWebcalUrl(url);

			expect(result.success).toBe(true);
			expect(result.convertedUrl).toBe(
				"https://example.com/calendar.ics?timezone=UTC&format=ical&filter=work"
			);
		});
	});
});

describe("Webcal Integration with ICS Manager", () => {
	// Mock tests to verify integration points
	test("should validate webcal URL in settings", () => {
		// This would test the integration with IcsSettingsTab
		const testUrl = "webcal://example.com/calendar.ics";
		const result = WebcalUrlConverter.convertWebcalUrl(testUrl);

		expect(result.success).toBe(true);
		expect(result.wasWebcal).toBe(true);
	});

	test("should convert webcal URL in fetch process", () => {
		// This would test the integration with IcsManager
		const testUrl = "webcal://example.com/calendar.ics";
		const fetchUrl = WebcalUrlConverter.getFetchUrl(testUrl);

		expect(fetchUrl).toBe("https://example.com/calendar.ics");
	});
});
