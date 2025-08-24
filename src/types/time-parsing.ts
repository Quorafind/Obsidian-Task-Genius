import { ParsedTimeResult, TimeParsingConfig } from "../services/time-parsing-service";
import { StandardTaskMetadata } from "./task";

/**
 * Time component structure representing parsed time information
 */
export interface TimeComponent {
	/** Hour (0-23) */
	hour: number;
	/** Minute (0-59) */
	minute: number;
	/** Second (0-59, optional) */
	second?: number;
	/** Original text that was parsed */
	originalText: string;
	/** Whether this is part of a time range */
	isRange: boolean;
	/** Range partner (for start/end time pairs) */
	rangePartner?: TimeComponent;
}

/**
 * Enhanced expression with time range support
 */
export interface EnhancedTimeExpression {
	text: string;
	date: Date;
	type: "start" | "due" | "scheduled";
	index: number;
	length: number;
	// New time-specific fields
	timeComponent?: TimeComponent;
	isTimeRange: boolean;
	rangeStart?: TimeComponent;
	rangeEnd?: TimeComponent;
	crossesMidnight?: boolean;
}

/**
 * Extended ParsedTimeResult to include time components
 */
export interface EnhancedParsedTimeResult extends ParsedTimeResult {
	// Time-specific components
	timeComponents: {
		startTime?: TimeComponent;
		endTime?: TimeComponent;
		dueTime?: TimeComponent;
		scheduledTime?: TimeComponent;
	};
	// Enhanced expressions with time information
	parsedExpressions: Array<EnhancedTimeExpression>;
}

/**
 * Enhanced configuration for time parsing
 */
export interface EnhancedTimeParsingConfig extends TimeParsingConfig {
	timePatterns: {
		/** Single time patterns (12:00, 12:00:00, 1:30 PM) */
		singleTime: RegExp[];
		/** Time range patterns (12:00-13:00, 12:00 - 13:00, 12:00~13:00) */
		timeRange: RegExp[];
		/** Time separators for ranges */
		rangeSeparators: string[];
	};
	timeDefaults: {
		/** Default format preference (12-hour vs 24-hour) */
		preferredFormat: "12h" | "24h";
		/** Default AM/PM when ambiguous */
		defaultPeriod: "AM" | "PM";
		/** How to handle midnight crossing ranges */
		midnightCrossing: "next-day" | "same-day" | "error";
	};
}

/**
 * Time parsing error for enhanced error handling
 */
export interface TimeParsingError {
	type: "invalid-format" | "midnight-crossing" | "ambiguous-time" | "range-error";
	originalText: string;
	position: number;
	message: string;
	fallbackUsed: boolean;
	fallbackValue?: TimeComponent;
}

/**
 * Enhanced parse result with error tracking
 */
export interface EnhancedParseResult {
	success: boolean;
	result?: EnhancedParsedTimeResult;
	errors: TimeParsingError[];
	warnings: string[];
}

/**
 * Enhanced task metadata interface with time components
 */
export interface EnhancedStandardTaskMetadata extends StandardTaskMetadata {
	/** Time-specific metadata (separate from date timestamps) */
	timeComponents?: {
		/** Start time component */
		startTime?: TimeComponent;
		/** End time component (for time ranges) */
		endTime?: TimeComponent;
		/** Due time component */
		dueTime?: TimeComponent;
		/** Scheduled time component */
		scheduledTime?: TimeComponent;
	};
	
	/** Enhanced date fields that combine date + time */
	enhancedDates?: {
		/** Full datetime for start (combines startDate + startTime) */
		startDateTime?: Date;
		/** Full datetime for end (combines date + endTime) */
		endDateTime?: Date;
		/** Full datetime for due (combines dueDate + dueTime) */
		dueDateTime?: Date;
		/** Full datetime for scheduled (combines scheduledDate + scheduledTime) */
		scheduledDateTime?: Date;
	};
}