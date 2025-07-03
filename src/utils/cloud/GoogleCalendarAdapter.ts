/**
 * Google Calendar API Adapter
 * Implements Google Calendar API integration for calendar and event access
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

export class GoogleCalendarAdapter extends CloudCalendarAdapter {
	readonly name = "google";
	readonly apiBaseUrl = "https://www.googleapis.com/calendar/v3";
	readonly userInfoUrl = "https://www.googleapis.com/oauth2/v2/userinfo";

	/**
	 * Get Google Calendar provider capabilities
	 */
	getCapabilities(): CloudProviderCapabilities {
		return {
			name: this.name,
			supportsRead: true,
			supportsWrite: true,
			supportsIncrementalSync: true,
			supportsWebhooks: true,
			supportsRecurringEvents: true,
			maxEventsPerRequest: 2500,
			rateLimit: {
				requestsPerSecond: 10,
				requestsPerDay: 1000000,
			},
		};
	}

	/**
	 * Get list of calendars for the authenticated user
	 */
	async getCalendarList(accessToken: string): Promise<CalendarListResult> {
		this.validateAccessToken(accessToken);

		try {
			const response = await this.retryOperation(async () => {
				return await this.makeAuthenticatedRequest(accessToken, {
					url: `${this.apiBaseUrl}/users/me/calendarList`,
					method: "GET",
				});
			});

			const calendars: CloudCalendarSource[] = response.items.map(
				(item: any) => this.convertGoogleCalendarToCloudSource(item)
			);

			return {
				calendars,
				nextPageToken: response.nextPageToken,
				syncToken: response.nextSyncToken,
			};
		} catch (error) {
			throw this.handleGoogleAPIError(
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
			const params = this.buildEventRequestParams(options);
			const url = `${this.apiBaseUrl}/calendars/${encodeURIComponent(
				calendarId
			)}/events?${params}`;

			const response = await this.retryOperation(async () => {
				return await this.makeAuthenticatedRequest(accessToken, {
					url,
					method: "GET",
				});
			});

			const events: IcsEvent[] = response.items
				.map((item: any) =>
					this.convertGoogleEventToIcs(item, calendarId)
				)
				.filter(
					(event: IcsEvent | null) => event !== null
				) as IcsEvent[];

			return {
				events,
				nextPageToken: response.nextPageToken,
				nextSyncToken: response.nextSyncToken,
				hasMore: !!response.nextPageToken,
			};
		} catch (error) {
			throw this.handleGoogleAPIError(
				error,
				`Failed to fetch events from calendar ${calendarId}`
			);
		}
	}

	/**
	 * Test API connection and token validity
	 */
	async testConnection(accessToken: string): Promise<boolean> {
		try {
			await this.makeAuthenticatedRequest(accessToken, {
				url: `${this.apiBaseUrl}/users/me/calendarList`,
				method: "GET",
			});
			return true;
		} catch (error) {
			console.warn("Google Calendar connection test failed:", error);
			return false;
		}
	}

	/**
	 * Get user information
	 */
	async getUserInfo(accessToken: string): Promise<CloudUserInfo> {
		this.validateAccessToken(accessToken);

		try {
			const response = await this.makeAuthenticatedRequest(accessToken, {
				url: this.userInfoUrl,
				method: "GET",
			});

			return {
				id: response.id,
				email: response.email,
				name: response.name || response.email,
				picture: response.picture,
				provider: this.name,
			};
		} catch (error) {
			throw this.handleGoogleAPIError(
				error,
				"Failed to fetch user information"
			);
		}
	}

	/**
	 * Create a new event
	 */
	async createEvent(
		accessToken: string,
		calendarId: string,
		event: IcsEvent
	): Promise<IcsEvent> {
		this.validateAccessToken(accessToken);
		this.validateCalendarId(calendarId);

		try {
			const googleEvent = this.convertIcsEventToGoogle(event);

			const response = await this.retryOperation(async () => {
				return await this.makeAuthenticatedRequest(accessToken, {
					url: `${this.apiBaseUrl}/calendars/${encodeURIComponent(
						calendarId
					)}/events`,
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(googleEvent),
				});
			});

			return this.convertGoogleEventToIcs(response, calendarId);
		} catch (error) {
			throw this.handleGoogleAPIError(error, "Failed to create event");
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
			const googleEvent = this.convertIcsEventToGoogle(event);

			const response = await this.retryOperation(async () => {
				return await this.makeAuthenticatedRequest(accessToken, {
					url: `${this.apiBaseUrl}/calendars/${encodeURIComponent(
						calendarId
					)}/events/${encodeURIComponent(eventId)}`,
					method: "PUT",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(googleEvent),
				});
			});

			return this.convertGoogleEventToIcs(response, calendarId);
		} catch (error) {
			throw this.handleGoogleAPIError(error, "Failed to update event");
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
			await this.retryOperation(async () => {
				return await this.makeAuthenticatedRequest(accessToken, {
					url: `${this.apiBaseUrl}/calendars/${encodeURIComponent(
						calendarId
					)}/events/${encodeURIComponent(eventId)}`,
					method: "DELETE",
				});
			});
		} catch (error) {
			throw this.handleGoogleAPIError(error, "Failed to delete event");
		}
	}

	/**
	 * Convert Google Calendar to CloudCalendarSource
	 */
	private convertGoogleCalendarToCloudSource(
		googleCalendar: any
	): CloudCalendarSource {
		return {
			id: googleCalendar.id,
			name:
				googleCalendar.summary ||
				googleCalendar.summaryOverride ||
				"Unnamed Calendar",
			description: googleCalendar.description,
			color: googleCalendar.backgroundColor || googleCalendar.colorId,
			enabled: true, // Default to enabled
			showType: "event", // Default to event display
			isPrimary: googleCalendar.primary || false,
			accessRole: this.mapGoogleAccessRole(googleCalendar.accessRole),
			timeZone: googleCalendar.timeZone,
		};
	}

	/**
	 * Convert Google Event to ICS Event
	 */
	private convertGoogleEventToIcs(
		googleEvent: any,
		calendarId: string
	): IcsEvent {
		// Create a mock ICS source for the event
		const source: IcsSource = {
			id: `google-${calendarId}`,
			name: "Google Calendar",
			url: "",
			enabled: true,
			showType: "event",
			refreshInterval: 60,
			showAllDayEvents: true,
			showTimedEvents: true,
		};

		// Parse dates
		const dtstart = this.parseGoogleDateTime(googleEvent.start);
		const dtend = googleEvent.end
			? this.parseGoogleDateTime(googleEvent.end)
			: undefined;
		const allDay = !!(
			googleEvent.start?.date && !googleEvent.start?.dateTime
		);

		// Parse attendees
		const attendees =
			googleEvent.attendees?.map((attendee: any) => ({
				name: attendee.displayName,
				email: attendee.email,
				role: attendee.organizer ? "organizer" : "attendee",
				status: attendee.responseStatus,
			})) || [];

		// Parse organizer
		const organizer = googleEvent.organizer
			? {
					name: googleEvent.organizer.displayName,
					email: googleEvent.organizer.email,
			  }
			: undefined;

		return {
			uid: googleEvent.id,
			summary: googleEvent.summary || "Untitled Event",
			description: googleEvent.description,
			dtstart,
			dtend,
			allDay,
			location: googleEvent.location,
			categories: googleEvent.categories || [],
			status: this.mapGoogleEventStatus(googleEvent.status),
			rrule: googleEvent.recurrence?.[0], // Google uses array, ICS uses string
			created: googleEvent.created
				? new Date(googleEvent.created)
				: undefined,
			lastModified: googleEvent.updated
				? new Date(googleEvent.updated)
				: undefined,
			transp: googleEvent.transparency?.toUpperCase(),
			organizer,
			attendees,
			source,
		};
	}

	/**
	 * Convert ICS Event to Google Event format
	 */
	private convertIcsEventToGoogle(icsEvent: IcsEvent): any {
		const googleEvent: any = {
			summary: icsEvent.summary,
			description: icsEvent.description,
			location: icsEvent.location,
			status: this.mapIcsEventStatusToGoogle(icsEvent.status),
			transparency: icsEvent.transp?.toLowerCase(),
		};

		// Handle dates
		if (icsEvent.allDay) {
			googleEvent.start = { date: this.formatDateOnly(icsEvent.dtstart) };
			if (icsEvent.dtend) {
				googleEvent.end = { date: this.formatDateOnly(icsEvent.dtend) };
			}
		} else {
			googleEvent.start = { dateTime: icsEvent.dtstart.toISOString() };
			if (icsEvent.dtend) {
				googleEvent.end = { dateTime: icsEvent.dtend.toISOString() };
			}
		}

		// Handle recurrence
		if (icsEvent.rrule) {
			googleEvent.recurrence = [icsEvent.rrule];
		}

		// Handle attendees
		if (icsEvent.attendees && icsEvent.attendees.length > 0) {
			googleEvent.attendees = icsEvent.attendees.map((attendee) => ({
				email: attendee.email,
				displayName: attendee.name,
				responseStatus: attendee.status || "needsAction",
			}));
		}

		return googleEvent;
	}

	/**
	 * Build event request parameters
	 */
	private buildEventRequestParams(options: EventFetchOptions): string {
		const params = new URLSearchParams();

		// Date range
		params.set("timeMin", this.formatDateForAPI(options.startDate));
		params.set("timeMax", this.formatDateForAPI(options.endDate));

		// Other options
		if (options.maxResults) {
			params.set(
				"maxResults",
				Math.min(options.maxResults, 2500).toString()
			);
		}

		if (options.pageToken) {
			params.set("pageToken", options.pageToken);
		}

		if (options.syncToken) {
			params.set("syncToken", options.syncToken);
		}

		if (options.singleEvents !== undefined) {
			params.set("singleEvents", options.singleEvents.toString());
		}

		if (options.showDeleted !== undefined) {
			params.set("showDeleted", options.showDeleted.toString());
		}

		// Default parameters
		params.set("orderBy", "startTime");
		params.set("singleEvents", "true"); // Expand recurring events

		return params.toString();
	}

	/**
	 * Parse Google DateTime object
	 */
	private parseGoogleDateTime(googleDateTime: any): Date {
		if (googleDateTime.dateTime) {
			return new Date(googleDateTime.dateTime);
		} else if (googleDateTime.date) {
			return new Date(googleDateTime.date + "T00:00:00");
		}
		throw new Error("Invalid Google DateTime format");
	}

	/**
	 * Format date for all-day events (YYYY-MM-DD)
	 */
	private formatDateOnly(date: Date): string {
		return date.toISOString().split("T")[0];
	}

	/**
	 * Map Google access role to our format
	 */
	private mapGoogleAccessRole(
		role: string
	): CloudCalendarSource["accessRole"] {
		switch (role) {
			case "owner":
				return "owner";
			case "reader":
				return "reader";
			case "writer":
				return "writer";
			case "freeBusyReader":
				return "freeBusyReader";
			default:
				return "reader";
		}
	}

	/**
	 * Map Google event status to ICS status
	 */
	private mapGoogleEventStatus(status: string): string {
		switch (status) {
			case "confirmed":
				return "CONFIRMED";
			case "tentative":
				return "TENTATIVE";
			case "cancelled":
				return "CANCELLED";
			default:
				return "CONFIRMED";
		}
	}

	/**
	 * Map ICS event status to Google status
	 */
	private mapIcsEventStatusToGoogle(status?: string): string {
		switch (status?.toUpperCase()) {
			case "CONFIRMED":
				return "confirmed";
			case "TENTATIVE":
				return "tentative";
			case "CANCELLED":
				return "cancelled";
			default:
				return "confirmed";
		}
	}

	/**
	 * Handle Google API errors with specific error mapping
	 */
	private handleGoogleAPIError(
		error: any,
		context: string
	): CloudCalendarError {
		if (error instanceof CloudCalendarError) {
			return error;
		}

		// Google-specific error handling
		if (error.statusCode === 403) {
			const message = error.description || error.message || "";
			if (
				message.includes("quotaExceeded") ||
				message.includes("rateLimitExceeded")
			) {
				return new CloudCalendarError(
					"rate_limited",
					"Google API rate limit exceeded",
					429
				);
			}
			if (message.includes("insufficientPermissions")) {
				return new CloudCalendarError(
					"forbidden",
					"Insufficient permissions for Google Calendar",
					403
				);
			}
		}

		if (error.statusCode === 404) {
			return new CloudCalendarError(
				"not_found",
				"Calendar or event not found",
				404
			);
		}

		// Default error handling
		const message =
			error.description || error.message || "Unknown Google API error";
		return new CloudCalendarError(
			error.code || "google_api_error",
			`${context}: ${message}`,
			error.statusCode || 0
		);
	}
}
