import { TimeComponent } from "../types/time-parsing";
import { StandardTaskMetadata, EnhancedStandardTaskMetadata } from "../types/task";

/**
 * Utility functions for converting between timestamps and TimeComponents
 * and combining date and time components into full datetime objects
 */

/**
 * Convert a timestamp to a TimeComponent (extracts time portion)
 * @param timestamp - Unix timestamp in milliseconds
 * @returns TimeComponent representing the time portion
 */
export function timestampToTimeComponent(timestamp: number): TimeComponent {
	const date = new Date(timestamp);
	return {
		hour: date.getHours(),
		minute: date.getMinutes(),
		second: date.getSeconds(),
		originalText: `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`,
		isRange: false
	};
}

/**
 * Convert a TimeComponent to time in milliseconds (time portion only)
 * @param timeComponent - TimeComponent to convert
 * @returns Time in milliseconds from start of day
 */
export function timeComponentToMilliseconds(timeComponent: TimeComponent): number {
	return (timeComponent.hour * 60 * 60 + timeComponent.minute * 60 + (timeComponent.second || 0)) * 1000;
}

/**
 * Combine a date timestamp with a TimeComponent to create a full datetime
 * @param dateTimestamp - Date portion as timestamp (time will be ignored)
 * @param timeComponent - Time component to combine
 * @returns Full datetime as Date object
 */
export function combineDateAndTime(dateTimestamp: number, timeComponent: TimeComponent): Date {
	const date = new Date(dateTimestamp);
	// Reset time to start of day, then add time component
	date.setHours(0, 0, 0, 0);
	date.setHours(timeComponent.hour, timeComponent.minute, timeComponent.second || 0, 0);
	return date;
}

/**
 * Extract date portion from timestamp (sets time to 00:00:00)
 * @param timestamp - Full datetime timestamp
 * @returns Date with time set to start of day
 */
export function extractDatePortion(timestamp: number): Date {
	const date = new Date(timestamp);
	date.setHours(0, 0, 0, 0);
	return date;
}

/**
 * Create enhanced datetime objects from standard metadata and time components
 * @param metadata - Standard task metadata with timestamps
 * @param timeComponents - Time components to combine with dates
 * @returns Enhanced dates object with combined datetime values
 */
export function createEnhancedDates(
	metadata: StandardTaskMetadata,
	timeComponents: NonNullable<EnhancedStandardTaskMetadata['timeComponents']>
): NonNullable<EnhancedStandardTaskMetadata['enhancedDates']> {
	const enhancedDates: NonNullable<EnhancedStandardTaskMetadata['enhancedDates']> = {};

	// Combine start date and time
	if (metadata.startDate && timeComponents.startTime) {
		enhancedDates.startDateTime = combineDateAndTime(metadata.startDate, timeComponents.startTime);
	}

	// Combine end date and time (use start date if no specific end date)
	if (timeComponents.endTime) {
		const baseDate = metadata.startDate || metadata.dueDate || metadata.scheduledDate;
		if (baseDate) {
			enhancedDates.endDateTime = combineDateAndTime(baseDate, timeComponents.endTime);
		}
	}

	// Combine due date and time
	if (metadata.dueDate && timeComponents.dueTime) {
		enhancedDates.dueDateTime = combineDateAndTime(metadata.dueDate, timeComponents.dueTime);
	}

	// Combine scheduled date and time
	if (metadata.scheduledDate && timeComponents.scheduledTime) {
		enhancedDates.scheduledDateTime = combineDateAndTime(metadata.scheduledDate, timeComponents.scheduledTime);
	}

	return enhancedDates;
}

/**
 * Convert standard task metadata to enhanced metadata with time components
 * @param metadata - Standard task metadata
 * @param timeComponents - Optional time components to add
 * @returns Enhanced task metadata
 */
export function enhanceTaskMetadata(
	metadata: StandardTaskMetadata,
	timeComponents?: NonNullable<EnhancedStandardTaskMetadata['timeComponents']>
): EnhancedStandardTaskMetadata {
	const enhanced: EnhancedStandardTaskMetadata = {
		...metadata
	};

	if (timeComponents) {
		enhanced.timeComponents = timeComponents;
		enhanced.enhancedDates = createEnhancedDates(metadata, timeComponents);
	}

	return enhanced;
}

/**
 * Extract time components from existing timestamps in metadata
 * @param metadata - Standard task metadata with timestamps
 * @returns Time components extracted from timestamps
 */
export function extractTimeComponentsFromMetadata(
	metadata: StandardTaskMetadata
): NonNullable<EnhancedStandardTaskMetadata['timeComponents']> {
	const timeComponents: NonNullable<EnhancedStandardTaskMetadata['timeComponents']> = {};

	if (metadata.startDate) {
		timeComponents.startTime = timestampToTimeComponent(metadata.startDate);
	}

	if (metadata.dueDate) {
		timeComponents.dueTime = timestampToTimeComponent(metadata.dueDate);
	}

	if (metadata.scheduledDate) {
		timeComponents.scheduledTime = timestampToTimeComponent(metadata.scheduledDate);
	}

	return timeComponents;
}

/**
 * Backward compatibility helper: convert enhanced metadata to standard format
 * @param enhanced - Enhanced task metadata
 * @returns Standard task metadata (loses time component information)
 */
export function downgradeToStandardMetadata(enhanced: EnhancedStandardTaskMetadata): StandardTaskMetadata {
	const { timeComponents, enhancedDates, ...standard } = enhanced;
	
	// If we have enhanced dates, use those as the primary timestamps
	if (enhancedDates) {
		if (enhancedDates.startDateTime) {
			standard.startDate = enhancedDates.startDateTime.getTime();
		}
		if (enhancedDates.dueDateTime) {
			standard.dueDate = enhancedDates.dueDateTime.getTime();
		}
		if (enhancedDates.scheduledDateTime) {
			standard.scheduledDate = enhancedDates.scheduledDateTime.getTime();
		}
	}

	return standard;
}

/**
 * Check if metadata has any time components
 * @param metadata - Enhanced task metadata
 * @returns True if metadata contains time components
 */
export function hasTimeComponents(metadata: EnhancedStandardTaskMetadata): boolean {
	return !!(metadata.timeComponents && (
		metadata.timeComponents.startTime ||
		metadata.timeComponents.endTime ||
		metadata.timeComponents.dueTime ||
		metadata.timeComponents.scheduledTime
	));
}

/**
 * Validate time component values
 * @param timeComponent - Time component to validate
 * @returns True if valid, false otherwise
 */
export function validateTimeComponent(timeComponent: TimeComponent): boolean {
	return (
		timeComponent.hour >= 0 && timeComponent.hour <= 23 &&
		timeComponent.minute >= 0 && timeComponent.minute <= 59 &&
		(timeComponent.second === undefined || (timeComponent.second >= 0 && timeComponent.second <= 59))
	);
}

/**
 * Create a time component from hour and minute values
 * @param hour - Hour (0-23)
 * @param minute - Minute (0-59)
 * @param second - Optional second (0-59)
 * @param originalText - Original text that was parsed
 * @returns TimeComponent object
 */
export function createTimeComponent(
	hour: number,
	minute: number,
	second?: number,
	originalText?: string
): TimeComponent {
	const timeComponent: TimeComponent = {
		hour,
		minute,
		second,
		originalText: originalText || `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}${second !== undefined ? ':' + second.toString().padStart(2, '0') : ''}`,
		isRange: false
	};

	if (!validateTimeComponent(timeComponent)) {
		throw new Error(`Invalid time component: ${hour}:${minute}${second !== undefined ? ':' + second : ''}`);
	}

	return timeComponent;
}