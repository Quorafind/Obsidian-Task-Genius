/**
 * iCloud Calendar CalDAV Adapter
 * Implements iCloud Calendar integration using CalDAV protocol
 * Uses App-Specific Passwords for authentication
 */

import {
	CloudCalendarAdapter,
	CloudCalendarError,
	CloudUserInfo,
} from "./CloudCalendarAdapter";
import {
	CloudCalendarSource,
	EventFetchOptions,
	EventFetchResult,
	CalendarListResult,
	CloudProviderCapabilities,
} from "../../types/cloud-calendar";
import { IcsEvent, IcsSource } from "../../types/ics";
import { requestUrl } from "obsidian";

export class iCloudCalendarAdapter extends CloudCalendarAdapter {
	readonly name = "icloud";
	readonly apiBaseUrl = "https://caldav.icloud.com";
	readonly principalUrl = "https://caldav.icloud.com/";

	/**
	 * Get iCloud Calendar provider capabilities
	 */
	getCapabilities(): CloudProviderCapabilities {
		return {
			name: this.name,
			supportsRead: true,
			supportsWrite: true,
			supportsIncrementalSync: false, // CalDAV doesn't support incremental sync like Google
			supportsWebhooks: false,
			supportsRecurringEvents: true,
			maxEventsPerRequest: 1000,
			rateLimit: {
				requestsPerSecond: 5, // More conservative for CalDAV
				requestsPerDay: 10000,
			},
		};
	}

	/**
	 * Get list of calendars for the authenticated user
	 */
	async getCalendarList(accessToken: string): Promise<CalendarListResult> {
		this.validateAccessToken(accessToken);

		try {
			// For iCloud, accessToken contains both username and app password
			const { username, appPassword } =
				this.parseAccessToken(accessToken);

			// First, discover the principal URL
			const principalPath = await this.discoverPrincipal(
				username,
				appPassword
			);

			// Get calendar home set
			const calendarHomePath = await this.getCalendarHomeSet(
				username,
				appPassword,
				principalPath
			);

			// Get list of calendars
			const calendars = await this.getCalendarCollection(
				username,
				appPassword,
				calendarHomePath
			);

			return {
				calendars,
				nextPageToken: undefined, // CalDAV doesn't use pagination
				syncToken: undefined, // CalDAV doesn't support sync tokens
			};
		} catch (error) {
			throw this.handleCalDAVError(
				error,
				"Failed to fetch calendar list"
			);
		}
	}

	/**
	 * Get events from a specific calendar
	 */
	async getEvents(
		accessToken: string,
		calendarId: string,
		options: EventFetchOptions
	): Promise<EventFetchResult> {
		this.validateAccessToken(accessToken);
		this.validateCalendarId(calendarId);

		try {
			const { username, appPassword } =
				this.parseAccessToken(accessToken);

			// Build CalDAV REPORT query
			const reportXml = this.buildCalendarQuery(options);

			const response = await this.makeCalDAVRequest(
				username,
				appPassword,
				{
					url: calendarId, // calendarId is the full CalDAV URL
					method: "REPORT",
					headers: {
						"Content-Type": "application/xml; charset=utf-8",
						Depth: "1",
					},
					body: reportXml,
				}
			);

			const events = this.parseCalendarDataResponse(response, calendarId);

			return {
				events,
				nextPageToken: undefined,
				nextSyncToken: undefined,
				hasMore: false,
			};
		} catch (error) {
			throw this.handleCalDAVError(
				error,
				`Failed to fetch events from calendar ${calendarId}`
			);
		}
	}

	/**
	 * Test CalDAV connection and credentials
	 */
	async testConnection(accessToken: string): Promise<boolean> {
		try {
			const { username, appPassword } =
				this.parseAccessToken(accessToken);

			// Test with a simple OPTIONS request
			await this.makeCalDAVRequest(username, appPassword, {
				url: this.principalUrl,
				method: "OPTIONS",
			});

			return true;
		} catch (error) {
			console.warn("iCloud CalDAV connection test failed:", error);
			return false;
		}
	}

	/**
	 * Get user information (limited for CalDAV)
	 */
	async getUserInfo(accessToken: string): Promise<CloudUserInfo> {
		this.validateAccessToken(accessToken);

		try {
			const { username } = this.parseAccessToken(accessToken);

			return {
				id: username,
				email: username, // iCloud username is usually email
				name: username.split("@")[0], // Extract name from email
				picture: undefined,
				provider: this.name,
			};
		} catch (error) {
			throw this.handleCalDAVError(
				error,
				"Failed to get user information"
			);
		}
	}

	/**
	 * Create a new event (CalDAV PUT)
	 */
	async createEvent(
		accessToken: string,
		calendarId: string,
		event: IcsEvent
	): Promise<IcsEvent> {
		this.validateAccessToken(accessToken);
		this.validateCalendarId(calendarId);

		try {
			const { username, appPassword } =
				this.parseAccessToken(accessToken);

			// Generate unique event UID
			const eventUid = event.uid || this.generateEventUid();
			const eventUrl = `${calendarId}${eventUid}.ics`;

			// Convert to iCalendar format
			const icalData = this.convertIcsEventToiCal(event);

			await this.makeCalDAVRequest(username, appPassword, {
				url: eventUrl,
				method: "PUT",
				headers: {
					"Content-Type": "text/calendar; charset=utf-8",
					"If-None-Match": "*", // Ensure we're creating, not updating
				},
				body: icalData,
			});

			// Return the created event with updated UID
			return {
				...event,
				uid: eventUid,
			};
		} catch (error) {
			throw this.handleCalDAVError(error, "Failed to create event");
		}
	}

	/**
	 * Update an existing event
	 */
	async updateEvent(
		accessToken: string,
		calendarId: string,
		eventId: string,
		event: IcsEvent
	): Promise<IcsEvent> {
		this.validateAccessToken(accessToken);
		this.validateCalendarId(calendarId);

		try {
			const { username, appPassword } =
				this.parseAccessToken(accessToken);

			const eventUrl = `${calendarId}${eventId}.ics`;

			// Convert to iCalendar format
			const icalData = this.convertIcsEventToiCal(event);

			await this.makeCalDAVRequest(username, appPassword, {
				url: eventUrl,
				method: "PUT",
				headers: {
					"Content-Type": "text/calendar; charset=utf-8",
				},
				body: icalData,
			});

			return event;
		} catch (error) {
			throw this.handleCalDAVError(error, "Failed to update event");
		}
	}

	/**
	 * Delete an event
	 */
	async deleteEvent(
		accessToken: string,
		calendarId: string,
		eventId: string
	): Promise<void> {
		this.validateAccessToken(accessToken);
		this.validateCalendarId(calendarId);

		try {
			const { username, appPassword } =
				this.parseAccessToken(accessToken);

			const eventUrl = `${calendarId}${eventId}.ics`;

			await this.makeCalDAVRequest(username, appPassword, {
				url: eventUrl,
				method: "DELETE",
			});
		} catch (error) {
			throw this.handleCalDAVError(error, "Failed to delete event");
		}
	}

	/**
	 * Parse access token to extract username and app password
	 */
	private parseAccessToken(accessToken: string): {
		username: string;
		appPassword: string;
	} {
		try {
			// Access token is base64 encoded "username:appPassword"
			const decoded = atob(accessToken);
			const [username, appPassword] = decoded.split(":");

			if (!username || !appPassword) {
				throw new Error("Invalid access token format");
			}

			return { username, appPassword };
		} catch (error) {
			throw new CloudCalendarError(
				"invalid_token",
				"Invalid iCloud access token format"
			);
		}
	}

	/**
	 * Make authenticated CalDAV request
	 */
	private async makeCalDAVRequest(
		username: string,
		appPassword: string,
		options: {
			url: string;
			method: string;
			headers?: Record<string, string>;
			body?: string;
		}
	): Promise<any> {
		const auth = btoa(`${username}:${appPassword}`);

		const headers = {
			Authorization: `Basic ${auth}`,
			"User-Agent": "Obsidian Task Genius CalDAV Client",
			...options.headers,
		};

		try {
			const response = await requestUrl({
				url: options.url,
				method: options.method as any,
				headers,
				body: options.body,
			});

			return response.text || response.json;
		} catch (error) {
			throw error;
		}
	}

	/**
	 * Discover principal URL for the user
	 */
	private async discoverPrincipal(
		username: string,
		appPassword: string
	): Promise<string> {
		const propfindXml = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
	<d:prop>
		<d:current-user-principal/>
	</d:prop>
</d:propfind>`;

		const response = await this.makeCalDAVRequest(username, appPassword, {
			url: this.principalUrl,
			method: "PROPFIND",
			headers: {
				"Content-Type": "application/xml; charset=utf-8",
				Depth: "0",
			},
			body: propfindXml,
		});

		// Parse XML response to extract principal path
		const principalMatch = response.match(/<d:href>([^<]+)<\/d:href>/);
		if (!principalMatch) {
			throw new Error("Could not discover principal URL");
		}

		return principalMatch[1];
	}

	/**
	 * Get calendar home set for the principal
	 */
	private async getCalendarHomeSet(
		username: string,
		appPassword: string,
		principalPath: string
	): Promise<string> {
		const propfindXml = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
	<d:prop>
		<c:calendar-home-set/>
	</d:prop>
</d:propfind>`;

		const response = await this.makeCalDAVRequest(username, appPassword, {
			url: `${this.apiBaseUrl}${principalPath}`,
			method: "PROPFIND",
			headers: {
				"Content-Type": "application/xml; charset=utf-8",
				Depth: "0",
			},
			body: propfindXml,
		});

		// Parse XML response to extract calendar home set
		const homeSetMatch = response.match(/<d:href>([^<]+)<\/d:href>/);
		if (!homeSetMatch) {
			throw new Error("Could not find calendar home set");
		}

		return homeSetMatch[1];
	}

	/**
	 * Get calendar collection from home set
	 */
	private async getCalendarCollection(
		username: string,
		appPassword: string,
		calendarHomePath: string
	): Promise<CloudCalendarSource[]> {
		const propfindXml = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
	<d:prop>
		<d:displayname/>
		<d:resourcetype/>
		<c:calendar-description/>
		<cs:getctag/>
		<c:supported-calendar-component-set/>
	</d:prop>
</d:propfind>`;

		const response = await this.makeCalDAVRequest(username, appPassword, {
			url: `${this.apiBaseUrl}${calendarHomePath}`,
			method: "PROPFIND",
			headers: {
				"Content-Type": "application/xml; charset=utf-8",
				Depth: "1",
			},
			body: propfindXml,
		});

		return this.parseCalendarCollectionResponse(response);
	}

	/**
	 * Parse calendar collection response
	 */
	private parseCalendarCollectionResponse(
		xmlResponse: string
	): CloudCalendarSource[] {
		const calendars: CloudCalendarSource[] = [];

		// Simple XML parsing - in production, use a proper XML parser
		const responseMatches = xmlResponse.match(
			/<d:response>[\s\S]*?<\/d:response>/g
		);

		if (!responseMatches) {
			return calendars;
		}

		for (const responseXml of responseMatches) {
			// Check if this is a calendar resource
			if (!responseXml.includes("<c:calendar/>")) {
				continue;
			}

			const hrefMatch = responseXml.match(/<d:href>([^<]+)<\/d:href>/);
			const displayNameMatch = responseXml.match(
				/<d:displayname>([^<]*)<\/d:displayname>/
			);
			const descriptionMatch = responseXml.match(
				/<c:calendar-description>([^<]*)<\/c:calendar-description>/
			);

			if (hrefMatch) {
				const calendarUrl = hrefMatch[1];
				const displayName = displayNameMatch
					? displayNameMatch[1]
					: "Unnamed Calendar";
				const description = descriptionMatch
					? descriptionMatch[1]
					: undefined;

				calendars.push({
					id: `${this.apiBaseUrl}${calendarUrl}`,
					name: displayName,
					description,
					color: undefined, // CalDAV doesn't provide color info
					enabled: true,
					showType: "event",
					isPrimary: displayName.toLowerCase().includes("calendar"), // Heuristic
					accessRole: "owner", // Assume owner for user's own calendars
					timeZone: undefined,
				});
			}
		}

		return calendars;
	}

	/**
	 * Build CalDAV calendar query for events
	 */
	private buildCalendarQuery(options: EventFetchOptions): string {
		const startDate =
			options.startDate.toISOString().replace(/[-:]/g, "").split(".")[0] +
			"Z";
		const endDate =
			options.endDate.toISOString().replace(/[-:]/g, "").split(".")[0] +
			"Z";

		return `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:d="DAV:">
	<d:prop>
		<d:getetag/>
		<c:calendar-data/>
	</d:prop>
	<c:filter>
		<c:comp-filter name="VCALENDAR">
			<c:comp-filter name="VEVENT">
				<c:time-range start="${startDate}" end="${endDate}"/>
			</c:comp-filter>
		</c:comp-filter>
	</c:filter>
</c:calendar-query>`;
	}

	/**
	 * Parse calendar data response from CalDAV
	 */
	private parseCalendarDataResponse(
		xmlResponse: string,
		calendarId: string
	): IcsEvent[] {
		const events: IcsEvent[] = [];

		// Extract calendar data from XML response
		const calendarDataMatches = xmlResponse.match(
			/<c:calendar-data>[\s\S]*?<\/c:calendar-data>/g
		);

		if (!calendarDataMatches) {
			return events;
		}

		for (const calendarDataXml of calendarDataMatches) {
			// Extract iCalendar data (CDATA section)
			const icalDataMatch = calendarDataXml.match(
				/<!\[CDATA\[([\s\S]*?)\]\]>/
			);
			let icalData = icalDataMatch
				? icalDataMatch[1]
				: calendarDataXml.replace(/<\/?c:calendar-data>/g, "");

			// Parse iCalendar data
			const event = this.parseICalendarEvent(icalData, calendarId);
			if (event) {
				events.push(event);
			}
		}

		return events;
	}

	/**
	 * Parse iCalendar event data
	 */
	private parseICalendarEvent(
		icalData: string,
		calendarId: string
	): IcsEvent | null {
		try {
			const lines = icalData.split(/\r?\n/).filter((line) => line.trim());
			const event: Partial<IcsEvent> = {};

			// Create source
			const source: IcsSource = {
				id: `icloud-${calendarId}`,
				name: "iCloud Calendar",
				url: calendarId,
				enabled: true,
				showType: "event",
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
			};

			for (const line of lines) {
				const [key, ...valueParts] = line.split(":");
				const value = valueParts.join(":");

				switch (key) {
					case "UID":
						event.uid = value;
						break;
					case "SUMMARY":
						event.summary = value;
						break;
					case "DESCRIPTION":
						event.description = value;
						break;
					case "LOCATION":
						event.location = value;
						break;
					case "DTSTART":
						event.dtstart = this.parseICalDateTime(value);
						event.allDay = !value.includes("T");
						break;
					case "DTEND":
						event.dtend = this.parseICalDateTime(value);
						break;
					case "STATUS":
						event.status = value;
						break;
					case "CREATED":
						event.created = this.parseICalDateTime(value);
						break;
					case "LAST-MODIFIED":
						event.lastModified = this.parseICalDateTime(value);
						break;
				}
			}

			if (!event.uid || !event.summary || !event.dtstart) {
				return null;
			}

			return {
				uid: event.uid,
				summary: event.summary,
				description: event.description,
				dtstart: event.dtstart,
				dtend: event.dtend,
				allDay: event.allDay || false,
				location: event.location,
				categories: [],
				status: event.status,
				created: event.created,
				lastModified: event.lastModified,
				source,
				attendees: [],
			} as IcsEvent;
		} catch (error) {
			console.warn("Failed to parse iCalendar event:", error);
			return null;
		}
	}

	/**
	 * Parse iCalendar date/time format
	 */
	private parseICalDateTime(value: string): Date {
		// Handle different iCalendar date formats
		if (value.includes("T")) {
			// DateTime format: YYYYMMDDTHHMMSSZ
			const dateTimeStr = value.replace(/[TZ]/g, "");
			const year = parseInt(dateTimeStr.substr(0, 4));
			const month = parseInt(dateTimeStr.substr(4, 2)) - 1;
			const day = parseInt(dateTimeStr.substr(6, 2));
			const hour = parseInt(dateTimeStr.substr(8, 2)) || 0;
			const minute = parseInt(dateTimeStr.substr(10, 2)) || 0;
			const second = parseInt(dateTimeStr.substr(12, 2)) || 0;

			return new Date(Date.UTC(year, month, day, hour, minute, second));
		} else {
			// Date only format: YYYYMMDD
			const year = parseInt(value.substr(0, 4));
			const month = parseInt(value.substr(4, 2)) - 1;
			const day = parseInt(value.substr(6, 2));

			return new Date(year, month, day);
		}
	}

	/**
	 * Convert IcsEvent to iCalendar format
	 */
	private convertIcsEventToiCal(event: IcsEvent): string {
		const lines: string[] = [];

		lines.push("BEGIN:VCALENDAR");
		lines.push("VERSION:2.0");
		lines.push("PRODID:-//Obsidian Task Genius//CalDAV Client//EN");
		lines.push("BEGIN:VEVENT");

		lines.push(`UID:${event.uid}`);
		lines.push(`SUMMARY:${event.summary}`);

		if (event.description) {
			lines.push(`DESCRIPTION:${event.description}`);
		}

		if (event.location) {
			lines.push(`LOCATION:${event.location}`);
		}

		// Format dates
		if (event.allDay) {
			lines.push(
				`DTSTART;VALUE=DATE:${this.formatICalDate(event.dtstart)}`
			);
			if (event.dtend) {
				lines.push(
					`DTEND;VALUE=DATE:${this.formatICalDate(event.dtend)}`
				);
			}
		} else {
			lines.push(`DTSTART:${this.formatICalDateTime(event.dtstart)}`);
			if (event.dtend) {
				lines.push(`DTEND:${this.formatICalDateTime(event.dtend)}`);
			}
		}

		if (event.status) {
			lines.push(`STATUS:${event.status}`);
		}

		const now = new Date();
		lines.push(`DTSTAMP:${this.formatICalDateTime(now)}`);
		lines.push(`CREATED:${this.formatICalDateTime(event.created || now)}`);
		lines.push(
			`LAST-MODIFIED:${this.formatICalDateTime(
				event.lastModified || now
			)}`
		);

		lines.push("END:VEVENT");
		lines.push("END:VCALENDAR");

		return lines.join("\r\n");
	}

	/**
	 * Format date for iCalendar (YYYYMMDD)
	 */
	private formatICalDate(date: Date): string {
		const year = date.getFullYear();
		const month = (date.getMonth() + 1).toString().padStart(2, "0");
		const day = date.getDate().toString().padStart(2, "0");

		return `${year}${month}${day}`;
	}

	/**
	 * Format datetime for iCalendar (YYYYMMDDTHHMMSSZ)
	 */
	private formatICalDateTime(date: Date): string {
		const year = date.getUTCFullYear();
		const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
		const day = date.getUTCDate().toString().padStart(2, "0");
		const hour = date.getUTCHours().toString().padStart(2, "0");
		const minute = date.getUTCMinutes().toString().padStart(2, "0");
		const second = date.getUTCSeconds().toString().padStart(2, "0");

		return `${year}${month}${day}T${hour}${minute}${second}Z`;
	}

	/**
	 * Generate unique event UID
	 */
	private generateEventUid(): string {
		const timestamp = Date.now();
		const random = Math.random().toString(36).substr(2, 9);
		return `${timestamp}-${random}@obsidian-task-genius`;
	}

	/**
	 * Handle CalDAV errors
	 */
	private handleCalDAVError(error: any, context: string): CloudCalendarError {
		if (error instanceof CloudCalendarError) {
			return error;
		}

		// CalDAV-specific error handling
		if (error.status === 401) {
			return new CloudCalendarError(
				"unauthorized",
				"Invalid iCloud credentials or app-specific password",
				401
			);
		}

		if (error.status === 403) {
			return new CloudCalendarError(
				"forbidden",
				"Access denied to iCloud calendar",
				403
			);
		}

		if (error.status === 404) {
			return new CloudCalendarError(
				"not_found",
				"Calendar or event not found",
				404
			);
		}

		if (error.status === 507) {
			return new CloudCalendarError(
				"insufficient_storage",
				"iCloud storage quota exceeded",
				507
			);
		}

		// Default error handling
		const message = error.message || "Unknown CalDAV error";
		return new CloudCalendarError(
			error.code || "caldav_error",
			`${context}: ${message}`,
			error.status || 0
		);
	}
}
