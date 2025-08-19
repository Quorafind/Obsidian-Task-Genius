/**
 * ICS (iCalendar) Parser
 * Parses iCalendar format data into structured events
 */

import { IcsEvent, IcsParseResult, IcsSource } from "../types/ics";

export class IcsParser {
	// Pre-compiled regular expressions for better performance
	private static readonly CN_REGEX = /CN=([^;:]+)/;
	private static readonly ROLE_REGEX = /ROLE=([^;:]+)/;
	private static readonly PARTSTAT_REGEX = /PARTSTAT=([^;:]+)/;

	// Cache for parsed content to avoid re-parsing identical content
	private static readonly parseCache = new Map<string, IcsParseResult>();
	private static readonly MAX_CACHE_SIZE = 50; // Limit cache size to prevent memory leaks

	// Property handler map for faster lookup
	private static readonly PROPERTY_HANDLERS = new Map<string, (event: Partial<IcsEvent>, value: string, fullLine: string) => void>([
		['UID', (event, value) => { event.uid = value; }],
		['SUMMARY', (event, value) => { event.summary = IcsParser.unescapeText(value); }],
		['DESCRIPTION', (event, value) => { event.description = IcsParser.unescapeText(value); }],
		['LOCATION', (event, value) => { event.location = IcsParser.unescapeText(value); }],
		['STATUS', (event, value) => { event.status = value.toUpperCase(); }],
		['PRIORITY', (event, value) => {
			const priority = parseInt(value, 10);
			if (!isNaN(priority)) event.priority = priority;
		}],
		['TRANSP', (event, value) => { event.transp = value.toUpperCase(); }],
		['RRULE', (event, value) => { event.rrule = value; }],
		['DTSTART', (event, value, fullLine) => {
			const result = IcsParser.parseDateTime(value, fullLine);
			event.dtstart = result.date;
			if (result.allDay !== undefined) event.allDay = result.allDay;
		}],
		['DTEND', (event, value, fullLine) => {
			event.dtend = IcsParser.parseDateTime(value, fullLine).date;
		}],
		['CREATED', (event, value, fullLine) => {
			event.created = IcsParser.parseDateTime(value, fullLine).date;
		}],
		['LAST-MODIFIED', (event, value, fullLine) => {
			event.lastModified = IcsParser.parseDateTime(value, fullLine).date;
		}],
		['CATEGORIES', (event, value) => {
			event.categories = value.split(",").map(cat => cat.trim());
		}],
		['EXDATE', (event, value, fullLine) => {
			if (!event.exdate) event.exdate = [];
			const exdates = value.split(",");
			for (const exdate of exdates) {
				const date = IcsParser.parseDateTime(exdate.trim(), fullLine).date;
				event.exdate.push(date);
			}
		}],
		['ORGANIZER', (event, value, fullLine) => {
			event.organizer = IcsParser.parseOrganizer(value, fullLine);
		}],
		['ATTENDEE', (event, value, fullLine) => {
			if (!event.attendees) event.attendees = [];
			event.attendees.push(IcsParser.parseAttendee(value, fullLine));
		}]
	]);
	/**
	 * Parse ICS content string into events
	 * Includes caching mechanism for improved performance
	 */
	static parse(content: string, source: IcsSource): IcsParseResult {
		// Create cache key based on content hash and source id
		const cacheKey = this.createCacheKey(content, source.id);

		// Check cache first
		const cached = this.parseCache.get(cacheKey);
		if (cached) {
			// Return deep copy to prevent mutation of cached data
			return {
				events: cached.events.map(event => ({ ...event, source })),
				errors: [...cached.errors],
				metadata: { ...cached.metadata }
			};
		}
		const result: IcsParseResult = {
			events: [],
			errors: [],
			metadata: {},
		};

		try {
			const lines = this.unfoldLines(content.split(/\r?\n/));
			let currentEvent: Partial<IcsEvent> | null = null;
			let inCalendar = false;
			let lineNumber = 0;

			for (const line of lines) {
				lineNumber++;
				const trimmedLine = line.trim();

				if (!trimmedLine || trimmedLine.startsWith("#")) {
					continue; // Skip empty lines and comments
				}

				try {
					const [property, value] = this.parseLine(trimmedLine);

					switch (property) {
						case "BEGIN":
							if (value === "VCALENDAR") {
								inCalendar = true;
							} else if (value === "VEVENT" && inCalendar) {
								currentEvent = { source };
							}
							break;

						case "END":
							if (value === "VEVENT" && currentEvent) {
								const event = this.finalizeEvent(currentEvent);
								if (event) {
									result.events.push(event);
								}
								currentEvent = null;
							} else if (value === "VCALENDAR") {
								inCalendar = false;
							}
							break;

						case "VERSION":
							if (inCalendar && !currentEvent) {
								result.metadata.version = value;
							}
							break;

						case "PRODID":
							if (inCalendar && !currentEvent) {
								result.metadata.prodid = value;
							}
							break;

						case "CALSCALE":
							if (inCalendar && !currentEvent) {
								// Usually GREGORIAN, can be ignored for most purposes
							}
							break;

						case "X-WR-CALNAME":
							if (inCalendar && !currentEvent) {
								result.metadata.calendarName = value;
							}
							break;

						case "X-WR-CALDESC":
							if (inCalendar && !currentEvent) {
								result.metadata.description = value;
							}
							break;

						case "X-WR-TIMEZONE":
							if (inCalendar && !currentEvent) {
								result.metadata.timezone = value;
							}
							break;

						default:
							if (currentEvent) {
								this.parseEventProperty(
									currentEvent,
									property,
									value,
									trimmedLine
								);
							}
							break;
					}
				} catch (error) {
					result.errors.push({
						line: lineNumber,
						message: `Error parsing line: ${error.message}`,
						context: trimmedLine,
					});
				}
			}
		} catch (error) {
			result.errors.push({
				message: `Fatal parsing error: ${error.message}`,
			});
		}

		// Cache the result before returning
		this.cacheResult(cacheKey, result);

		return result;
	}

	/**
	 * Create cache key from content and source id
	 */
	private static createCacheKey(content: string, sourceId: string): string {
		// Simple hash function for cache key
		let hash = 0;
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return `${sourceId}-${hash}`;
	}

	/**
	 * Cache parsing result with size limit
	 */
	private static cacheResult(key: string, result: IcsParseResult): void {
		// Implement LRU-like behavior by clearing cache when it gets too large
		if (this.parseCache.size >= this.MAX_CACHE_SIZE) {
			// Clear oldest entries (simple approach - clear half the cache)
			const entries = Array.from(this.parseCache.entries());
			const keepCount = Math.floor(this.MAX_CACHE_SIZE / 2);
			this.parseCache.clear();

			// Keep the most recent entries
			for (let i = entries.length - keepCount; i < entries.length; i++) {
				this.parseCache.set(entries[i][0], entries[i][1]);
			}
		}

		// Store a copy to prevent external mutations
		this.parseCache.set(key, {
			events: result.events.map(event => ({ ...event })),
			errors: [...result.errors],
			metadata: { ...result.metadata }
		});
	}

	/**
	 * Unfold lines according to RFC 5545
	 * Lines can be folded by inserting CRLF followed by a space or tab
	 * Optimized version using array join instead of string concatenation
	 */
	private static unfoldLines(lines: string[]): string[] {
		const unfolded: string[] = [];
		const currentLineParts: string[] = [];
		let hasCurrentLine = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const firstChar = line.charCodeAt(0);

			// Check for space (32) or tab (9) at the beginning
			if (firstChar === 32 || firstChar === 9) {
				// This is a continuation of the previous line
				if (hasCurrentLine) {
					currentLineParts.push(' '); // Add space between folded parts
					currentLineParts.push(line.slice(1));
				}
			} else {
				// This is a new line
				if (hasCurrentLine) {
					unfolded.push(currentLineParts.join(''));
					currentLineParts.length = 0; // Clear array efficiently
				}
				currentLineParts.push(line);
				hasCurrentLine = true;
			}
		}

		if (hasCurrentLine) {
			unfolded.push(currentLineParts.join(''));
		}

		return unfolded;
	}

	/**
	 * Parse a single line into property and value
	 * Optimized version with reduced string operations
	 */
	private static parseLine(line: string): [string, string] {
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) {
			throw new Error("Invalid line format: missing colon");
		}

		// Extract property name (before any parameters) and value in one pass
		const semicolonIndex = line.indexOf(";");
		let property: string;

		if (semicolonIndex !== -1 && semicolonIndex < colonIndex) {
			// Property has parameters
			property = line.slice(0, semicolonIndex).toUpperCase();
		} else {
			// No parameters
			property = line.slice(0, colonIndex).toUpperCase();
		}

		const value = line.slice(colonIndex + 1);
		return [property, value];
	}

	/**
	 * Parse event-specific properties
	 * Optimized version using property handler map for faster lookup
	 */
	private static parseEventProperty(
		event: Partial<IcsEvent>,
		property: string,
		value: string,
		fullLine: string
	): void {
		// Use property handler map for faster lookup
		const handler = this.PROPERTY_HANDLERS.get(property);
		if (handler) {
			handler(event, value, fullLine);
		} else if (property.charCodeAt(0) === 88 && property.charCodeAt(1) === 45) { // "X-"
			// Store custom properties (X- prefix check optimized)
			if (!event.customProperties) {
				event.customProperties = {};
			}
			event.customProperties[property] = value;
		}
	}

	/**
	 * Parse date/time values
	 * Optimized version with reduced string operations and better parsing
	 */
	private static parseDateTime(
		value: string,
		fullLine: string
	): { date: Date; allDay?: boolean } {
		// Check if it's an all-day event (VALUE=DATE parameter)
		const isAllDay = fullLine.indexOf("VALUE=DATE") !== -1;

		// Extract actual date/time string, handling timezone info efficiently
		let dateStr = value;
		const tzidIndex = dateStr.indexOf("TZID=");
		if (tzidIndex !== -1) {
			// Extract the actual date/time part after timezone
			const colonIndex = dateStr.lastIndexOf(":");
			if (colonIndex !== -1) {
				dateStr = dateStr.slice(colonIndex + 1);
			}
		}

		// Handle UTC times (ending with Z)
		const isUtc = dateStr.charCodeAt(dateStr.length - 1) === 90; // 'Z'
		if (isUtc) {
			dateStr = dateStr.slice(0, -1);
		}

		// Parse date components using more efficient approach
		const dateStrLen = dateStr.length;
		let date: Date;

		if (isAllDay || dateStrLen === 8) {
			// All-day event or date-only format: YYYYMMDD
			// Use direct character code parsing for better performance
			const year = this.parseIntFromString(dateStr, 0, 4);
			const month = this.parseIntFromString(dateStr, 4, 2) - 1; // Month is 0-based
			const day = this.parseIntFromString(dateStr, 6, 2);
			date = new Date(year, month, day);
		} else {
			// Date-time format: YYYYMMDDTHHMMSS
			const year = this.parseIntFromString(dateStr, 0, 4);
			const month = this.parseIntFromString(dateStr, 4, 2) - 1;
			const day = this.parseIntFromString(dateStr, 6, 2);
			const hour = this.parseIntFromString(dateStr, 9, 2);
			const minute = this.parseIntFromString(dateStr, 11, 2);
			const second = dateStrLen >= 15 ? this.parseIntFromString(dateStr, 13, 2) : 0;

			if (isUtc) {
				date = new Date(Date.UTC(year, month, day, hour, minute, second));
			} else {
				date = new Date(year, month, day, hour, minute, second);
			}
		}

		return { date, allDay: isAllDay };
	}

	/**
	 * Parse integer from string slice without creating substring
	 * More efficient than parseInt(str.substring(...))
	 */
	private static parseIntFromString(str: string, start: number, length: number): number {
		let result = 0;
		const end = start + length;
		for (let i = start; i < end && i < str.length; i++) {
			const digit = str.charCodeAt(i) - 48; // '0' is 48
			if (digit >= 0 && digit <= 9) {
				result = result * 10 + digit;
			}
		}
		return result;
	}

	/**
	 * Parse organizer information
	 * Optimized version using pre-compiled regex and efficient string operations
	 */
	private static parseOrganizer(
		value: string,
		fullLine: string
	): { name?: string; email?: string } {
		const organizer: { name?: string; email?: string } = {};

		// Extract email from MAILTO: prefix (optimized check)
		if (value.charCodeAt(0) === 77 && value.startsWith("MAILTO:")) { // 'M'
			organizer.email = value.slice(7);
		}

		// Extract name from CN parameter using pre-compiled regex
		const cnMatch = fullLine.match(this.CN_REGEX);
		if (cnMatch) {
			organizer.name = this.unescapeText(cnMatch[1]);
		}

		return organizer;
	}

	/**
	 * Parse attendee information
	 * Optimized version using pre-compiled regex and efficient string operations
	 */
	private static parseAttendee(
		value: string,
		fullLine: string
	): { name?: string; email?: string; role?: string; status?: string } {
		const attendee: {
			name?: string;
			email?: string;
			role?: string;
			status?: string;
		} = {};

		// Extract email from MAILTO: prefix (optimized check)
		if (value.charCodeAt(0) === 77 && value.startsWith("MAILTO:")) { // 'M'
			attendee.email = value.slice(7);
		}

		// Extract name from CN parameter using pre-compiled regex
		const cnMatch = fullLine.match(this.CN_REGEX);
		if (cnMatch) {
			attendee.name = this.unescapeText(cnMatch[1]);
		}

		// Extract role from ROLE parameter using pre-compiled regex
		const roleMatch = fullLine.match(this.ROLE_REGEX);
		if (roleMatch) {
			attendee.role = roleMatch[1];
		}

		// Extract status from PARTSTAT parameter using pre-compiled regex
		const statusMatch = fullLine.match(this.PARTSTAT_REGEX);
		if (statusMatch) {
			attendee.status = statusMatch[1];
		}

		return attendee;
	}

	/**
	 * Unescape text according to RFC 5545
	 * Optimized version that only processes if escape sequences are found
	 */
	private static unescapeText(text: string): string {
		// Quick check if text contains escape sequences
		if (text.indexOf('\\') === -1) {
			return text;
		}

		// Only perform replacements if escape sequences are present
		return text
			.replace(/\\n/g, "\n")
			.replace(/\\,/g, ",")
			.replace(/\\;/g, ";")
			.replace(/\\\\/g, "\\");
	}

	/**
	 * Clear parsing cache to free memory
	 */
	static clearCache(): void {
		this.parseCache.clear();
	}

	/**
	 * Get cache statistics for monitoring
	 */
	static getCacheStats(): { size: number; maxSize: number } {
		return {
			size: this.parseCache.size,
			maxSize: this.MAX_CACHE_SIZE
		};
	}

	/**
	 * Finalize and validate event
	 */
	private static finalizeEvent(event: Partial<IcsEvent>): IcsEvent | null {
		// Required fields validation
		if (!event.uid || !event.summary || !event.dtstart) {
			return null;
		}

		// Set default values
		const finalEvent: IcsEvent = {
			uid: event.uid,
			summary: event.summary,
			dtstart: event.dtstart,
			allDay: event.allDay ?? false,
			source: event.source!,
			description: event.description,
			dtend: event.dtend,
			location: event.location,
			categories: event.categories,
			status: event.status,
			rrule: event.rrule,
			exdate: event.exdate,
			created: event.created,
			lastModified: event.lastModified,
			priority: event.priority,
			transp: event.transp,
			organizer: event.organizer,
			attendees: event.attendees,
			customProperties: event.customProperties,
		};

		return finalEvent;
	}
}
