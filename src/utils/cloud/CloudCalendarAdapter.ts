/**
 * Cloud Calendar Adapter Abstract Base Class
 * Defines the interface for cloud calendar service adapters
 */

import { requestUrl, RequestUrlParam } from "obsidian";
import {
	CloudCalendarSource,
	EventFetchOptions,
	EventFetchResult,
	CalendarListResult,
	CloudProviderCapabilities,
} from "../../types/cloud-calendar";
import { IcsEvent } from "../../types/ics";

export abstract class CloudCalendarAdapter {
	/** Provider name identifier */
	abstract readonly name: string;

	/** Base API URL for the provider */
	abstract readonly apiBaseUrl: string;

	/** Provider capabilities */
	abstract getCapabilities(): CloudProviderCapabilities;

	/**
	 * Get list of calendars for the authenticated user
	 */
	abstract getCalendarList(accessToken: string): Promise<CalendarListResult>;

	/**
	 * Get events from a specific calendar
	 */
	abstract getEvents(
		accessToken: string,
		calendarId: string,
		options: EventFetchOptions
	): Promise<EventFetchResult>;

	/**
	 * Test API connection and token validity
	 */
	abstract testConnection(accessToken: string): Promise<boolean>;

	/**
	 * Get user information (optional)
	 */
	async getUserInfo?(accessToken: string): Promise<CloudUserInfo>;

	/**
	 * Create a new event (optional - for write-enabled adapters)
	 */
	async createEvent?(
		accessToken: string,
		calendarId: string,
		event: IcsEvent
	): Promise<IcsEvent>;

	/**
	 * Update an existing event (optional - for write-enabled adapters)
	 */
	async updateEvent?(
		accessToken: string,
		calendarId: string,
		eventId: string,
		event: IcsEvent
	): Promise<IcsEvent>;

	/**
	 * Delete an event (optional - for write-enabled adapters)
	 */
	async deleteEvent?(
		accessToken: string,
		calendarId: string,
		eventId: string
	): Promise<void>;

	/**
	 * Helper method to make authenticated API requests
	 */
	protected async makeAuthenticatedRequest(
		accessToken: string,
		params: Omit<RequestUrlParam, "headers"> & {
			headers?: Record<string, string>;
		}
	): Promise<any> {
		const headers = {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/json",
			...params.headers,
		};

		try {
			const response = await requestUrl({
				...params,
				headers,
			});

			if (response.status >= 400) {
				throw new CloudCalendarError(
					this.getErrorCode(response.status),
					`HTTP ${response.status}: ${
						response.text || "Unknown error"
					}`,
					response.status
				);
			}

			return response.json;
		} catch (error) {
			if (error instanceof CloudCalendarError) {
				throw error;
			}

			// Network or other errors
			throw new CloudCalendarError(
				"network_error",
				error instanceof Error
					? error.message
					: "Network request failed",
				0
			);
		}
	}

	/**
	 * Helper method for paginated requests
	 */
	protected async makePaginatedRequest<T>(
		accessToken: string,
		url: string,
		options: {
			pageToken?: string;
			maxResults?: number;
			params?: Record<string, string>;
		} = {}
	): Promise<PaginatedResponse<T>> {
		const params = new URLSearchParams();

		if (options.pageToken) {
			params.set("pageToken", options.pageToken);
		}

		if (options.maxResults) {
			params.set("maxResults", options.maxResults.toString());
		}

		if (options.params) {
			for (const [key, value] of Object.entries(options.params)) {
				params.set(key, value);
			}
		}

		const fullUrl = `${url}?${params.toString()}`;

		const response = await this.makeAuthenticatedRequest(accessToken, {
			url: fullUrl,
			method: "GET",
		});

		return {
			items: response.items || [],
			nextPageToken: response.nextPageToken,
			totalItems: response.totalItems,
		};
	}

	/**
	 * Convert HTTP status code to error code
	 */
	protected getErrorCode(statusCode: number): string {
		switch (statusCode) {
			case 400:
				return "bad_request";
			case 401:
				return "unauthorized";
			case 403:
				return "forbidden";
			case 404:
				return "not_found";
			case 429:
				return "rate_limited";
			case 500:
				return "server_error";
			case 502:
			case 503:
			case 504:
				return "service_unavailable";
			default:
				return "unknown_error";
		}
	}

	/**
	 * Format date for API requests
	 */
	protected formatDateForAPI(date: Date): string {
		return date.toISOString();
	}

	/**
	 * Parse date from API response
	 */
	protected parseDateFromAPI(dateString: string): Date {
		return new Date(dateString);
	}

	/**
	 * Validate access token format
	 */
	protected validateAccessToken(accessToken: string): void {
		if (!accessToken || typeof accessToken !== "string") {
			throw new CloudCalendarError(
				"invalid_token",
				"Access token is required"
			);
		}

		if (accessToken.trim().length === 0) {
			throw new CloudCalendarError(
				"invalid_token",
				"Access token cannot be empty"
			);
		}
	}

	/**
	 * Validate calendar ID format
	 */
	protected validateCalendarId(calendarId: string): void {
		if (!calendarId || typeof calendarId !== "string") {
			throw new CloudCalendarError(
				"invalid_calendar_id",
				"Calendar ID is required"
			);
		}

		if (calendarId.trim().length === 0) {
			throw new CloudCalendarError(
				"invalid_calendar_id",
				"Calendar ID cannot be empty"
			);
		}
	}

	/**
	 * Handle rate limiting with exponential backoff
	 */
	protected async handleRateLimit(retryAfter?: number): Promise<void> {
		const delay = retryAfter
			? retryAfter * 1000
			: Math.random() * 2000 + 1000;

		console.warn(`CloudCalendarAdapter: Rate limited, waiting ${delay}ms`);

		return new Promise((resolve) => {
			setTimeout(resolve, delay);
		});
	}

	/**
	 * Check if error is retryable
	 */
	protected isRetryableError(error: CloudCalendarError): boolean {
		return (
			error.code === "rate_limited" ||
			error.code === "server_error" ||
			error.code === "service_unavailable" ||
			error.code === "network_error"
		);
	}

	/**
	 * Retry operation with exponential backoff
	 */
	protected async retryOperation<T>(
		operation: () => Promise<T>,
		maxRetries: number = 3,
		baseDelay: number = 1000
	): Promise<T> {
		let lastError: CloudCalendarError;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await operation();
			} catch (error) {
				lastError =
					error instanceof CloudCalendarError
						? error
						: new CloudCalendarError(
								"unknown_error",
								error instanceof Error
									? error.message
									: "Unknown error"
						  );

				if (
					attempt === maxRetries ||
					!this.isRetryableError(lastError)
				) {
					throw lastError;
				}

				// Wait before retry with exponential backoff
				const delay =
					baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		throw lastError!;
	}
}

/**
 * Cloud Calendar Error Class
 */
export class CloudCalendarError extends Error {
	public readonly code: string;
	public readonly description: string;
	public readonly statusCode: number;

	constructor(code: string, description: string, statusCode: number = 0) {
		super(`CloudCalendar Error: ${code} - ${description}`);
		this.name = "CloudCalendarError";
		this.code = code;
		this.description = description;
		this.statusCode = statusCode;
	}

	/**
	 * Check if error is retryable
	 */
	isRetryable(): boolean {
		return (
			this.code === "rate_limited" ||
			this.code === "server_error" ||
			this.code === "service_unavailable" ||
			this.code === "network_error"
		);
	}

	/**
	 * Check if error requires re-authentication
	 */
	requiresReauth(): boolean {
		return this.code === "unauthorized" || this.statusCode === 401;
	}
}

/**
 * Cloud User Information
 */
export interface CloudUserInfo {
	/** User ID */
	id: string;
	/** Email address */
	email: string;
	/** Display name */
	name: string;
	/** Profile picture URL */
	picture?: string;
	/** Provider name */
	provider: string;
}

/**
 * Paginated Response
 */
export interface PaginatedResponse<T> {
	/** Items in current page */
	items: T[];
	/** Token for next page */
	nextPageToken?: string;
	/** Total number of items */
	totalItems?: number;
}
