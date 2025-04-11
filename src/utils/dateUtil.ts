/**
 * Format a date in a human-readable format
 * @param date Date to format
 * @returns Formatted date string
 */
export function formatDate(date: Date): string {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);

	// Check if date is today or tomorrow
	if (date.getTime() === today.getTime()) {
		return "Today";
	} else if (date.getTime() === tomorrow.getTime()) {
		return "Tomorrow";
	}

	// Format as Month Day, Year for other dates
	const options: Intl.DateTimeFormatOptions = {
		month: "short",
		day: "numeric",
	};

	// Only add year if it's not the current year
	if (date.getFullYear() !== now.getFullYear()) {
		options.year = "numeric";
	}

	return date.toLocaleDateString(undefined, options);
}
