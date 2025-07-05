/**
 * ICS (iCalendar) support types and interfaces
 */

import { Task } from "./task";

/** ICS event source configuration */
export interface IcsSource {
	/** Unique identifier for the ICS source */
	id: string;
	/** Display name for the source */
	name: string;
	/** URL to the ICS file (supports http://, https://, and webcal:// protocols) */
	url: string;
	/** Whether this source is enabled */
	enabled: boolean;
	/** Color for events from this source */
	color?: string;
	/** Show type */
	showType: "badge" | "event";
	/** Refresh interval in minutes (default: 60) */
	refreshInterval: number;
	/** Last successful fetch timestamp */
	lastFetched?: number;
	/** Whether to show all-day events */
	showAllDayEvents: boolean;
	/** Whether to show timed events */
	showTimedEvents: boolean;
	/** Filter patterns to include/exclude events */
	filters?: IcsEventFilter;
	/** Authentication settings if needed */
	auth?: IcsAuthConfig;
	/** Text replacement rules for customizing event display */
	textReplacements?: IcsTextReplacement[];
	/** Holiday detection and grouping configuration */
	holidayConfig?: IcsHolidayConfig;
	/** Task status mapping configuration */
	statusMapping?: IcsStatusMapping;
}

/** ICS event filter configuration */
export interface IcsEventFilter {
	/** Include events matching these patterns */
	include?: {
		/** Summary/title patterns (regex supported) */
		summary?: string[];
		/** Description patterns (regex supported) */
		description?: string[];
		/** Location patterns (regex supported) */
		location?: string[];
		/** Categories to include */
		categories?: string[];
	};
	/** Exclude events matching these patterns */
	exclude?: {
		/** Summary/title patterns (regex supported) */
		summary?: string[];
		/** Description patterns (regex supported) */
		description?: string[];
		/** Location patterns (regex supported) */
		location?: string[];
		/** Categories to exclude */
		categories?: string[];
	};
}

/** Authentication configuration for ICS sources */
export interface IcsAuthConfig {
	/** Authentication type */
	type: "none" | "basic" | "bearer" | "custom";
	/** Username for basic auth */
	username?: string;
	/** Password for basic auth */
	password?: string;
	/** Bearer token */
	token?: string;
	/** Custom headers */
	headers?: Record<string, string>;
}

/** Text replacement rule for ICS events */
export interface IcsTextReplacement {
	/** Unique identifier for this replacement rule */
	id: string;
	/** Display name for this rule */
	name: string;
	/** Whether this rule is enabled */
	enabled: boolean;
	/** Target field to apply replacement to */
	target: "summary" | "description" | "location" | "all";
	/** Regular expression pattern to match */
	pattern: string;
	/** Replacement text (supports capture groups like $1, $2) */
	replacement: string;
	/** Regex flags (e.g., "gi" for global case-insensitive) */
	flags?: string;
}

/** Holiday detection and grouping configuration */
export interface IcsHolidayConfig {
	/** Whether to enable holiday detection */
	enabled: boolean;
	/** Patterns to identify holiday events */
	detectionPatterns: {
		/** Summary/title patterns (regex supported) */
		summary?: string[];
		/** Description patterns (regex supported) */
		description?: string[];
		/** Categories that indicate holidays */
		categories?: string[];
		/** Keywords that indicate holidays */
		keywords?: string[];
	};
	/** How to handle consecutive holiday events */
	groupingStrategy: "none" | "first-only" | "summary" | "range";
	/** Maximum gap between events to consider them consecutive (in days) */
	maxGapDays: number;
	/** Whether to show holiday events in forecast */
	showInForecast: boolean;
	/** Whether to show holiday events in calendar */
	showInCalendar: boolean;
	/** Custom display format for grouped holidays */
	groupDisplayFormat?: string;
}

/** Task status mapping configuration for ICS events */
export interface IcsStatusMapping {
	/** Whether to enable status mapping */
	enabled: boolean;
	/** Status mapping rules based on event timing */
	timingRules: {
		/** Status for past events */
		pastEvents: TaskStatus;
		/** Status for current events (happening today) */
		currentEvents: TaskStatus;
		/** Status for future events */
		futureEvents: TaskStatus;
	};
	/** Status mapping rules based on event properties */
	propertyRules?: {
		/** Status mapping based on event categories */
		categoryMapping?: Record<string, TaskStatus>;
		/** Status mapping based on event summary patterns */
		summaryMapping?: Array<{
			pattern: string;
			status: TaskStatus;
		}>;
		/** Status mapping based on holiday detection */
		holidayMapping?: {
			/** Status for detected holiday events */
			holidayStatus: TaskStatus;
			/** Status for non-holiday events */
			nonHolidayStatus?: TaskStatus;
		};
	};
	/** Override original ICS status */
	overrideIcsStatus: boolean;
}

/** Available task statuses for ICS event mapping */
export type TaskStatus =
	| " " // Incomplete
	| "x" // Complete
	| "-" // Cancelled/Abandoned
	| ">" // Forwarded/Rescheduled
	| "<" // Scheduled
	| "!" // Important
	| "?" // Question/Tentative
	| "/" // In Progress
	| "+" // Pro
	| "*" // Star
	| '"' // Quote
	| "l" // Location
	| "b" // Bookmark
	| "i" // Information
	| "S" // Savings
	| "I" // Idea
	| "p" // Pro
	| "c" // Character
	| "f" // Fire
	| "k" // Key
	| "w" // Win
	| "u" // Up
	| "d"; // Down

/** Raw ICS event data */
export interface IcsEvent {
	/** Unique identifier from ICS */
	uid: string;
	/** Event summary/title */
	summary: string;
	/** Event description */
	description?: string;
	/** Start date/time */
	dtstart: Date;
	/** End date/time */
	dtend?: Date;
	/** All-day event flag */
	allDay: boolean;
	/** Event location */
	location?: string;
	/** Event categories */
	categories?: string[];
	/** Event status (CONFIRMED, TENTATIVE, CANCELLED) */
	status?: string;
	/** Recurrence rule */
	rrule?: string;
	/** Exception dates */
	exdate?: Date[];
	/** Created timestamp */
	created?: Date;
	/** Last modified timestamp */
	lastModified?: Date;
	/** Event priority (0-9) */
	priority?: number;
	/** Event transparency (OPAQUE, TRANSPARENT) */
	transp?: string;
	/** Organizer information */
	organizer?: {
		name?: string;
		email?: string;
	};
	/** Attendees information */
	attendees?: Array<{
		name?: string;
		email?: string;
		role?: string;
		status?: string;
	}>;
	/** Custom properties */
	customProperties?: Record<string, string>;
	/** Source ICS configuration */
	source: IcsSource;
}

/** ICS event converted to Task format */
export interface IcsTask extends Task {
	/** Original ICS event data */
	icsEvent: IcsEvent;
	/** Whether this task is read-only (from ICS) */
	readonly: true;
	/** Whether this task is a badge */
	badge: boolean;
	/** Source information */
	source: {
		type: "ics";
		name: string;
		id: string;
	};
}

/** ICS parsing result */
export interface IcsParseResult {
	/** Successfully parsed events */
	events: IcsEvent[];
	/** Parsing errors */
	errors: Array<{
		line?: number;
		message: string;
		context?: string;
	}>;
	/** Calendar metadata */
	metadata: {
		/** Calendar name */
		calendarName?: string;
		/** Calendar description */
		description?: string;
		/** Time zone */
		timezone?: string;
		/** Version */
		version?: string;
		/** Product identifier */
		prodid?: string;
	};
}

/** ICS fetch result */
export interface IcsFetchResult {
	/** Whether the fetch was successful */
	success: boolean;
	/** Parsed result if successful */
	data?: IcsParseResult;
	/** Error message if failed */
	error?: string;
	/** HTTP status code */
	statusCode?: number;
	/** Fetch timestamp */
	timestamp: number;
}

/** ICS cache entry */
export interface IcsCacheEntry {
	/** Source ID */
	sourceId: string;
	/** Cached events */
	events: IcsEvent[];
	/** Cache timestamp */
	timestamp: number;
	/** Cache expiry time */
	expiresAt: number;
	/** ETag for HTTP caching */
	etag?: string;
	/** Last-Modified header */
	lastModified?: string;
}

/** ICS manager configuration */
export interface IcsManagerConfig {
	/** List of ICS sources */
	sources: IcsSource[];
	/** Global refresh interval in minutes */
	globalRefreshInterval: number;
	/** Maximum cache age in hours */
	maxCacheAge: number;
	/** Whether to enable background refresh */
	enableBackgroundRefresh: boolean;
	/** Network timeout in seconds */
	networkTimeout: number;
	/** Maximum number of events per source */
	maxEventsPerSource: number;
	/** Whether to show ICS events in calendar views */
	showInCalendar: boolean;
	/** Whether to show ICS events in task lists */
	showInTaskLists: boolean;
	/** Default color for ICS events */
	defaultEventColor: string;
}

/** ICS synchronization status */
export interface IcsSyncStatus {
	/** Source ID */
	sourceId: string;
	/** Last sync timestamp */
	lastSync?: number;
	/** Next scheduled sync */
	nextSync?: number;
	/** Sync status */
	status: "idle" | "syncing" | "error" | "disabled";
	/** Error message if status is error */
	error?: string;
	/** Number of events synced */
	eventCount?: number;
}

/** ICS event occurrence for recurring events */
export interface IcsEventOccurrence extends Omit<IcsEvent, "rrule" | "exdate"> {
	/** Original event UID */
	originalUid: string;
	/** Occurrence start time */
	occurrenceStart: Date;
	/** Occurrence end time */
	occurrenceEnd?: Date;
	/** Whether this is an exception */
	isException: boolean;
}

/** Holiday event group for consecutive holidays */
export interface IcsHolidayGroup {
	/** Unique identifier for this group */
	id: string;
	/** Group title/name */
	title: string;
	/** Start date of the holiday period */
	startDate: Date;
	/** End date of the holiday period */
	endDate: Date;
	/** Individual events in this group */
	events: IcsEvent[];
	/** Source configuration */
	source: IcsSource;
	/** Whether this is a single-day or multi-day holiday */
	isMultiDay: boolean;
	/** Display strategy for this group */
	displayStrategy: "first-only" | "summary" | "range";
}

/** Enhanced ICS event with holiday detection */
export interface IcsEventWithHoliday extends IcsEvent {
	/** Whether this event is detected as a holiday */
	isHoliday: boolean;
	/** Holiday group this event belongs to (if any) */
	holidayGroup?: IcsHolidayGroup;
	/** Whether this event should be shown in forecast */
	showInForecast: boolean;
}

/** Webcal URL validation and conversion result */
export interface WebcalValidationResult {
	/** Whether the URL is valid */
	isValid: boolean;
	/** Whether the URL is a webcal URL */
	isWebcal: boolean;
	/** The URL to use for fetching (converted if needed) */
	fetchUrl?: string;
	/** Error message if validation failed */
	error?: string;
	/** Warning message for user information */
	warning?: string;
}

/** Webcal-related error types */
export type WebcalError =
	| "invalid-url"
	| "conversion-failed"
	| "fetch-failed"
	| "protocol-not-supported"
	| "network-error";

/** Webcal conversion options */
export interface WebcalConversionOptions {
	/** Prefer HTTPS over HTTP when converting webcal URLs */
	preferHttps?: boolean;
	/** Custom protocol mapping for specific hosts */
	protocolMapping?: Record<string, "http" | "https">;
	/** Timeout for URL validation in milliseconds */
	validationTimeout?: number;
}
