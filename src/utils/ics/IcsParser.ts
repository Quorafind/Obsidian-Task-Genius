/**
 * ICS (iCalendar) Parser
 * Parses iCalendar format data into structured events
 */

import { IcsEvent, IcsParseResult, IcsSource } from "../../types/ics";

export class IcsParser {
	/**
	 * Parse ICS content string into events
	 */
	static parse(content: string, source: IcsSource): IcsParseResult {
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

		return result;
	}

	/**
	 * Unfold lines according to RFC 5545
	 * Lines can be folded by inserting CRLF followed by a space or tab
	 */
	private static unfoldLines(lines: string[]): string[] {
		const unfolded: string[] = [];
		let currentLine = "";

		for (const line of lines) {
			if (line.startsWith(" ") || line.startsWith("\t")) {
				// This is a continuation of the previous line
				currentLine += line.substring(1);
			} else {
				// This is a new line
				if (currentLine) {
					unfolded.push(currentLine);
				}
				currentLine = line;
			}
		}

		if (currentLine) {
			unfolded.push(currentLine);
		}

		return unfolded;
	}

	/**
	 * Parse a single line into property and value
	 */
	private static parseLine(line: string): [string, string] {
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) {
			throw new Error("Invalid line format: missing colon");
		}

		const propertyPart = line.substring(0, colonIndex);
		const value = line.substring(colonIndex + 1);

		// Extract property name (before any parameters)
		const semicolonIndex = propertyPart.indexOf(";");
		const property =
			semicolonIndex === -1
				? propertyPart
				: propertyPart.substring(0, semicolonIndex);

		return [property.toUpperCase(), value];
	}

	/**
	 * Parse event-specific properties
	 */
	private static parseEventProperty(
		event: Partial<IcsEvent>,
		property: string,
		value: string,
		fullLine: string
	): void {
		switch (property) {
			case "UID":
				event.uid = value;
				break;

			case "SUMMARY":
				event.summary = this.unescapeText(value);
				break;

			case "DESCRIPTION":
				event.description = this.unescapeText(value);
				break;

			case "LOCATION":
				event.location = this.unescapeText(value);
				break;

			case "DTSTART":
				const startResult = this.parseDateTime(value, fullLine);
				event.dtstart = startResult.date;
				if (startResult.allDay !== undefined) {
					event.allDay = startResult.allDay;
				}
				break;

			case "DTEND":
				const endResult = this.parseDateTime(value, fullLine);
				event.dtend = endResult.date;
				break;

			case "STATUS":
				event.status = value.toUpperCase();
				break;

			case "CATEGORIES":
				event.categories = value.split(",").map((cat) => cat.trim());
				break;

			case "PRIORITY":
				const priority = parseInt(value, 10);
				if (!isNaN(priority)) {
					event.priority = priority;
				}
				break;

			case "TRANSP":
				event.transp = value.toUpperCase();
				break;

			case "CREATED":
				event.created = this.parseDateTime(value, fullLine).date;
				break;

			case "LAST-MODIFIED":
				event.lastModified = this.parseDateTime(value, fullLine).date;
				break;

			case "RRULE":
				event.rrule = value;
				break;

			case "EXDATE":
				if (!event.exdate) {
					event.exdate = [];
				}
				// EXDATE can contain multiple dates separated by commas
				const exdates = value.split(",");
				for (const exdate of exdates) {
					const date = this.parseDateTime(
						exdate.trim(),
						fullLine
					).date;
					event.exdate.push(date);
				}
				break;

			case "ORGANIZER":
				event.organizer = this.parseOrganizer(value, fullLine);
				break;

			case "ATTENDEE":
				if (!event.attendees) {
					event.attendees = [];
				}
				event.attendees.push(this.parseAttendee(value, fullLine));
				break;

			default:
				// Store custom properties
				if (property.startsWith("X-")) {
					if (!event.customProperties) {
						event.customProperties = {};
					}
					event.customProperties[property] = value;
				}
				break;
		}
	}

	/**
	 * Parse date/time values
	 */
	private static parseDateTime(
		value: string,
		fullLine: string
	): { date: Date; allDay?: boolean } {
		// Check if it's an all-day event (VALUE=DATE parameter)
		const isAllDay = fullLine.includes("VALUE=DATE");

		// Remove timezone info for now (basic implementation)
		let dateStr = value;
		if (dateStr.includes("TZID=")) {
			// Extract the actual date/time part after timezone
			const colonIndex = dateStr.lastIndexOf(":");
			if (colonIndex !== -1) {
				dateStr = dateStr.substring(colonIndex + 1);
			}
		}

		// Handle UTC times (ending with Z)
		const isUtc = dateStr.endsWith("Z");
		if (isUtc) {
			dateStr = dateStr.slice(0, -1);
		}

		let date: Date;

		if (isAllDay || dateStr.length === 8) {
			// All-day event or date-only format: YYYYMMDD
			const year = parseInt(dateStr.substring(0, 4), 10);
			const month = parseInt(dateStr.substring(4, 6), 10) - 1; // Month is 0-based
			const day = parseInt(dateStr.substring(6, 8), 10);
			date = new Date(year, month, day);
		} else {
			// Date-time format: YYYYMMDDTHHMMSS
			const year = parseInt(dateStr.substring(0, 4), 10);
			const month = parseInt(dateStr.substring(4, 6), 10) - 1;
			const day = parseInt(dateStr.substring(6, 8), 10);
			const hour = parseInt(dateStr.substring(9, 11), 10);
			const minute = parseInt(dateStr.substring(11, 13), 10);
			const second = parseInt(dateStr.substring(13, 15), 10) || 0;

			if (isUtc) {
				date = new Date(
					Date.UTC(year, month, day, hour, minute, second)
				);
			} else {
				date = new Date(year, month, day, hour, minute, second);
			}
		}

		return { date, allDay: isAllDay };
	}

	/**
	 * Parse organizer information
	 */
	private static parseOrganizer(
		value: string,
		fullLine: string
	): { name?: string; email?: string } {
		const organizer: { name?: string; email?: string } = {};

		// Extract email from MAILTO: prefix
		if (value.startsWith("MAILTO:")) {
			organizer.email = value.substring(7);
		}

		// Extract name from CN parameter
		const cnMatch = fullLine.match(/CN=([^;:]+)/);
		if (cnMatch) {
			organizer.name = this.unescapeText(cnMatch[1]);
		}

		return organizer;
	}

	/**
	 * Parse attendee information
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

		// Extract email from MAILTO: prefix
		if (value.startsWith("MAILTO:")) {
			attendee.email = value.substring(7);
		}

		// Extract name from CN parameter
		const cnMatch = fullLine.match(/CN=([^;:]+)/);
		if (cnMatch) {
			attendee.name = this.unescapeText(cnMatch[1]);
		}

		// Extract role from ROLE parameter
		const roleMatch = fullLine.match(/ROLE=([^;:]+)/);
		if (roleMatch) {
			attendee.role = roleMatch[1];
		}

		// Extract status from PARTSTAT parameter
		const statusMatch = fullLine.match(/PARTSTAT=([^;:]+)/);
		if (statusMatch) {
			attendee.status = statusMatch[1];
		}

		return attendee;
	}

	/**
	 * Unescape text according to RFC 5545
	 */
	private static unescapeText(text: string): string {
		return text
			.replace(/\\n/g, "\n")
			.replace(/\\,/g, ",")
			.replace(/\\;/g, ";")
			.replace(/\\\\/g, "\\");
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
