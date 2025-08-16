import {
	format,
	isToday,
	isTomorrow,
	isThisYear,
	parse,
	parseISO,
	isValid,
	startOfDay,
} from "date-fns";
import { enUS } from "date-fns/locale";

/**
 * Format a date in a human-readable format
 * @param date Date to format
 * @returns Formatted date string
 */
export function formatDate(date: Date): string {
	if (isToday(date)) {
		return "Today";
	} else if (isTomorrow(date)) {
		return "Tomorrow";
	}

	// Format as Month Day, Year for other dates
	if (isThisYear(date)) {
		return format(date, "MMM d");
	} else {
		return format(date, "MMM d, yyyy");
	}
}

/**
 * Parse a date string in various formats
 * @param dateString Date string to parse
 * @param customFormats Optional array of custom date format patterns to try
 * @returns Parsed date as a number or undefined if invalid
 */
export function parseLocalDate(
	dateString: string,
	customFormats?: string[]
): number | undefined {
	if (!dateString) return undefined;

	// Trim whitespace
	dateString = dateString.trim();

	// Skip template strings
	if (dateString.includes("{{") || dateString.includes("}}")) {
		return undefined;
	}

	// Define default format patterns to try with date-fns
	const defaultFormats = [
		"yyyy-MM-dd", // ISO format
		"yyyy/MM/dd", // YYYY/MM/DD
		"dd-MM-yyyy", // DD-MM-YYYY
		"dd/MM/yyyy", // DD/MM/YYYY
		"MM-dd-yyyy", // MM-DD-YYYY
		"MM/dd/yyyy", // MM/DD/YYYY
		"yyyy.MM.dd", // YYYY.MM.DD
		"dd.MM.yyyy", // DD.MM.YYYY
		"yyyy年M月d日", // Chinese/Japanese format
		"MMM d, yyyy", // MMM DD, YYYY (e.g., Jan 15, 2025)
		"MMM dd, yyyy", // MMM DD, YYYY with leading zero
		"d MMM yyyy", // DD MMM YYYY (e.g., 15 Jan 2025)
		"dd MMM yyyy", // DD MMM YYYY with leading zero
		"yyyyMMddHHmmss",
		"yyyyMMdd_HHmmss",
	];

	// Combine custom formats with default formats
	const allFormats = customFormats
		? [...customFormats, ...defaultFormats]
		: defaultFormats;

	// Try each format with date-fns parse
	for (const formatString of allFormats) {
		try {
			const parsedDate = parse(dateString, formatString, new Date(), {
				locale: enUS,
			});

			// Check if the parsed date is valid
			if (isValid(parsedDate)) {
				// Set to start of day to match original behavior
				const normalizedDate = startOfDay(parsedDate);
				return normalizedDate.getTime();
			}
		} catch (e) {
			// Silently continue to next format
			continue;
		}
	}

	// Try parseISO as a fallback for ISO strings
	try {
		const isoDate = parseISO(dateString);
		if (isValid(isoDate)) {
			const normalizedDate = startOfDay(isoDate);
			return normalizedDate.getTime();
		}
	} catch (e) {
		// Silently continue
	}

	// If all parsing attempts fail, log a warning
	console.warn(`Worker: Could not parse date: ${dateString}`);
	return undefined;
}

/**
 * Get today's date in local timezone as YYYY-MM-DD format
 * This fixes the issue where using toISOString() can return yesterday's date
 * for users in timezones ahead of UTC
 * @returns Today's date in YYYY-MM-DD format in local timezone
 */
export function getTodayLocalDateString(): string {
	const today = new Date();
	const year = today.getFullYear();
	const month = String(today.getMonth() + 1).padStart(2, "0");
	const day = String(today.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * Convert a Date object to YYYY-MM-DD format in local timezone
 * This fixes the issue where using toISOString() can return wrong date
 * for users in timezones ahead of UTC
 * @param date The date to format
 * @returns Date in YYYY-MM-DD format in local timezone
 */
export function getLocalDateString(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * Convert a date to a relative time string, such as
 * "yesterday", "today", "tomorrow", etc.
 * using Intl.RelativeTimeFormat
 */
export function getRelativeTimeString(
	date: Date | number,
	lang = navigator.language
): string {
	// 允许传入日期对象或时间戳
	const timeMs = typeof date === "number" ? date : date.getTime();

	// 获取当前日期（去除时分秒）
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	// 获取传入日期（去除时分秒）
	const targetDate = new Date(timeMs);
	targetDate.setHours(0, 0, 0, 0);

	// 计算日期差（以天为单位）
	const deltaDays = Math.round(
		(targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
	);

	// 创建相对时间格式化器
	const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });

	// 返回格式化后的相对时间字符串
	return rtf.format(deltaDays, "day");
}
