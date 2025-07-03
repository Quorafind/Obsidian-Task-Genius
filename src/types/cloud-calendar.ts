/**
 * Cloud Calendar support types and interfaces
 * Supports Google Calendar and iCloud Calendar integration
 */

import { IcsEvent } from "./ics";

/** Cloud calendar configuration */
export interface CloudCalendarConfig {
	/** Unique identifier for this configuration */
	id: string;
	/** Cloud provider type */
	provider: "google" | "icloud";
	/** Display name for this configuration */
	name: string;
	/** Whether this configuration is enabled */
	enabled: boolean;
	/** OAuth 2.0 authentication configuration */
	auth: OAuth2Config;
	/** Selected calendars from this provider */
	calendars: CloudCalendarSource[];
	/** Synchronization settings */
	syncSettings: CloudSyncSettings;
	/** Last successful sync timestamp */
	lastSync?: number;
	/** Configuration creation timestamp */
	createdAt: number;
}

/** OAuth 2.0 configuration for cloud providers */
export interface OAuth2Config {
	/** OAuth client ID */
	clientId: string;
	/** OAuth client secret (optional for some flows) */
	clientSecret?: string;
	/** Access token */
	accessToken?: string;
	/** Refresh token */
	refreshToken?: string;
	/** Token expiry timestamp */
	tokenExpiry?: number;
	/** OAuth scopes */
	scopes: string[];
	/** Redirect URI for OAuth flow */
	redirectUri: string;
	/** Custom authorization URL (for custom providers) */
	authUrl?: string;
	/** Custom token URL (for custom providers) */
	tokenUrl?: string;
}

/** OAuth 2.0 tokens response */
export interface OAuth2Tokens {
	/** Access token for API calls */
	accessToken: string;
	/** Refresh token for token renewal */
	refreshToken?: string;
	/** Token type (usually "Bearer") */
	tokenType: string;
	/** Token expiration time in seconds */
	expiresIn: number;
	/** Granted scopes */
	scope?: string;
	/** Token issue timestamp */
	issuedAt: number;
}

/** Cloud calendar source (individual calendar) */
export interface CloudCalendarSource {
	/** Calendar ID from the provider */
	id: string;
	/** Calendar display name */
	name: string;
	/** Calendar description */
	description?: string;
	/** Calendar color */
	color?: string;
	/** Whether this calendar is enabled for sync */
	enabled: boolean;
	/** How to display events from this calendar */
	showType: "badge" | "event";
	/** Whether this is the primary calendar */
	isPrimary?: boolean;
	/** Calendar access role */
	accessRole?: "owner" | "reader" | "writer" | "freeBusyReader";
	/** Calendar time zone */
	timeZone?: string;
}

/** Cloud synchronization settings */
export interface CloudSyncSettings {
	/** Refresh interval in minutes */
	refreshInterval: number;
	/** How many days in the past to sync */
	syncPastDays: number;
	/** How many days in the future to sync */
	syncFutureDays: number;
	/** Whether to show all-day events */
	showAllDayEvents: boolean;
	/** Whether to show timed events */
	showTimedEvents: boolean;
	/** Maximum number of events per calendar */
	maxEventsPerCalendar: number;
	/** Whether to sync deleted events */
	syncDeletedEvents: boolean;
}

/** Cloud synchronization status */
export interface CloudSyncStatus {
	/** Configuration ID */
	configId: string;
	/** Cloud provider */
	provider: string;
	/** Last successful sync timestamp */
	lastSync?: number;
	/** Next scheduled sync timestamp */
	nextSync?: number;
	/** Current sync status */
	status: "idle" | "syncing" | "error" | "auth_required" | "disabled";
	/** Error message if status is error */
	error?: string;
	/** Number of events synced */
	eventCount?: number;
	/** Number of calendars synced */
	calendarsCount?: number;
	/** Sync duration in milliseconds */
	syncDuration?: number;
}

/** Cloud synchronization result */
export interface CloudSyncResult {
	/** Whether the sync was successful */
	success: boolean;
	/** Synced events */
	events: IcsEvent[];
	/** Available calendars */
	calendars: CloudCalendarSource[];
	/** Error message if failed */
	error?: string;
	/** Sync timestamp */
	timestamp: number;
	/** Sync duration in milliseconds */
	duration: number;
	/** Number of new events */
	newEvents: number;
	/** Number of updated events */
	updatedEvents: number;
	/** Number of deleted events */
	deletedEvents: number;
}

/** Event fetch options for cloud adapters */
export interface EventFetchOptions {
	/** Start date for event range */
	startDate: Date;
	/** End date for event range */
	endDate: Date;
	/** Maximum number of results */
	maxResults?: number;
	/** Whether to show deleted events */
	showDeleted?: boolean;
	/** Whether to expand recurring events */
	singleEvents?: boolean;
	/** Sync token for incremental sync */
	syncToken?: string;
	/** Page token for pagination */
	pageToken?: string;
}

/** Calendar list fetch result */
export interface CalendarListResult {
	/** List of calendars */
	calendars: CloudCalendarSource[];
	/** Next page token for pagination */
	nextPageToken?: string;
	/** Sync token for incremental updates */
	syncToken?: string;
}

/** Event fetch result from cloud provider */
export interface EventFetchResult {
	/** Fetched events */
	events: IcsEvent[];
	/** Next page token for pagination */
	nextPageToken?: string;
	/** Sync token for incremental sync */
	nextSyncToken?: string;
	/** Whether there are more events to fetch */
	hasMore: boolean;
}

/** Cloud provider capabilities */
export interface CloudProviderCapabilities {
	/** Provider name */
	name: string;
	/** Whether the provider supports read operations */
	supportsRead: boolean;
	/** Whether the provider supports write operations */
	supportsWrite: boolean;
	/** Whether the provider supports incremental sync */
	supportsIncrementalSync: boolean;
	/** Whether the provider supports webhooks */
	supportsWebhooks: boolean;
	/** Whether the provider supports recurring events */
	supportsRecurringEvents: boolean;
	/** Maximum events per request */
	maxEventsPerRequest: number;
	/** Rate limit information */
	rateLimit?: {
		requestsPerSecond: number;
		requestsPerDay: number;
	};
}

/** OAuth 2.0 authorization request */
export interface OAuth2AuthRequest {
	/** Provider name */
	provider: string;
	/** Client ID */
	clientId: string;
	/** Redirect URI */
	redirectUri: string;
	/** Requested scopes */
	scopes: string[];
	/** State parameter for security */
	state: string;
	/** Authorization URL */
	authUrl: string;
}

/** OAuth 2.0 authorization response */
export interface OAuth2AuthResponse {
	/** Authorization code */
	code?: string;
	/** Error code if authorization failed */
	error?: string;
	/** Error description */
	errorDescription?: string;
	/** State parameter for verification */
	state?: string;
}
