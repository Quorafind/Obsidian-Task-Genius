/**
 * Task Timer Formatter - Handles time duration formatting with template support
 */

export interface TimeComponents {
	hours: number;
	minutes: number;
	seconds: number;
	totalMilliseconds: number;
}

/**
 * Utility class for formatting time durations using template strings
 */
export class TaskTimerFormatter {
	/**
	 * Parse duration in milliseconds to time components
	 * @param duration Duration in milliseconds
	 * @returns Time components object
	 */
	static parseTimeComponents(duration: number): TimeComponents {
		const totalSeconds = Math.floor(duration / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		return {
			hours,
			minutes,
			seconds,
			totalMilliseconds: duration
		};
	}

	/**
	 * Format duration using a template string
	 * @param duration Duration in milliseconds
	 * @param template Template string with placeholders
	 * @returns Formatted duration string
	 */
	static formatDuration(duration: number, template: string): string {
		if (duration < 0) {
			duration = 0;
		}

		const components = this.parseTimeComponents(duration);
		let result = template;

		// Replace all placeholders
		result = result.replace(/\{h\}/g, components.hours.toString());
		result = result.replace(/\{m\}/g, components.minutes.toString());
		result = result.replace(/\{s\}/g, components.seconds.toString());
		result = result.replace(/\{ms\}/g, components.totalMilliseconds.toString());

		// Handle zero cleanup - remove segments that are zero
		result = this.cleanupZeroValues(result);

		// Clean up whitespace
		result = result.replace(/\s+/g, ' ').trim();

		// Return "0s" if result is empty
		return result || "0s";
	}

	/**
	 * Format duration with smart unit selection
	 * @param duration Duration in milliseconds
	 * @returns Formatted duration string with appropriate units
	 */
	static formatDurationSmart(duration: number): string {
		const components = this.parseTimeComponents(duration);

		if (components.hours > 0) {
			if (components.minutes > 0) {
				return `${components.hours}hrs${components.minutes}mins`;
			} else {
				return `${components.hours}hrs`;
			}
		} else if (components.minutes > 0) {
			if (components.seconds > 30) { // Round up if seconds > 30
				return `${components.minutes + 1}mins`;
			} else {
				return `${components.minutes}mins`;
			}
		} else if (components.seconds > 0) {
			return `${components.seconds}s`;
		} else {
			return "0s";
		}
	}

	/**
	 * Format duration for display in different contexts
	 * @param duration Duration in milliseconds
	 * @param context Context for formatting ('compact', 'detailed', 'precise')
	 * @returns Formatted duration string
	 */
	static formatForContext(duration: number, context: 'compact' | 'detailed' | 'precise'): string {
		const components = this.parseTimeComponents(duration);

		switch (context) {
			case 'compact':
				return this.formatDurationSmart(duration);

			case 'detailed':
				const parts: string[] = [];
				if (components.hours > 0) parts.push(`${components.hours}h`);
				if (components.minutes > 0) parts.push(`${components.minutes}m`);
				if (components.seconds > 0) parts.push(`${components.seconds}s`);
				return parts.join(' ') || '0s';

			case 'precise':
				if (components.hours > 0) {
					return `${components.hours}:${components.minutes.toString().padStart(2, '0')}:${components.seconds.toString().padStart(2, '0')}`;
				} else {
					return `${components.minutes}:${components.seconds.toString().padStart(2, '0')}`;
				}

			default:
				return this.formatDurationSmart(duration);
		}
	}

	/**
	 * Validate template string
	 * @param template Template string to validate
	 * @returns true if template is valid
	 */
	static validateTemplate(template: string): boolean {
		// Check for valid placeholders
		const validPlaceholders = /\{[hms]\}/g;
		const invalidPlaceholders = /\{[^hms\}]*\}/g;

		// Template should have at least one valid placeholder
		const hasValidPlaceholders = validPlaceholders.test(template);
		
		// Template should not have invalid placeholders
		const hasInvalidPlaceholders = invalidPlaceholders.test(template);

		return hasValidPlaceholders && !hasInvalidPlaceholders;
	}

	/**
	 * Get default template suggestions
	 * @returns Array of template suggestions with descriptions
	 */
	static getTemplateSuggestions(): Array<{ template: string; description: string; example: string }> {
		const sampleDuration = 2 * 3600000 + 35 * 60000 + 42 * 1000; // 2h 35m 42s

		return [
			{
				template: "{h}hrs{m}mins",
				description: "Hours and minutes (default)",
				example: this.formatDuration(sampleDuration, "{h}hrs{m}mins")
			},
			{
				template: "{h}h {m}m {s}s",
				description: "Full time with spaces",
				example: this.formatDuration(sampleDuration, "{h}h {m}m {s}s")
			},
			{
				template: "{h}:{m}:{s}",
				description: "Clock format",
				example: this.formatDuration(sampleDuration, "{h}:{m}:{s}")
			},
			{
				template: "{m}mins",
				description: "Minutes only",
				example: this.formatDuration(sampleDuration, "{m}mins")
			},
			{
				template: "({h}h{m}m)",
				description: "Parentheses format",
				example: this.formatDuration(sampleDuration, "({h}h{m}m)")
			}
		];
	}

	/**
	 * Clean up zero values from formatted string
	 * @param formatted Formatted string with potential zero values
	 * @returns Cleaned string
	 */
	private static cleanupZeroValues(formatted: string): string {
		// Remove zero hours, minutes, seconds if they appear at the start
		formatted = formatted.replace(/^0hrs?\b/i, '');
		formatted = formatted.replace(/^0mins?\b/i, '');
		formatted = formatted.replace(/^0secs?\b/i, '');
		formatted = formatted.replace(/^0s\b/i, '');

		// Remove zero values that appear after spaces (use word boundaries)
		formatted = formatted.replace(/\s+0hrs?\b/gi, '');
		formatted = formatted.replace(/\s+0mins?\b/gi, '');
		formatted = formatted.replace(/\s+0secs?\b/gi, '');
		formatted = formatted.replace(/\s+0s\b/gi, '');

		// Handle patterns like "0h 0m 15s" -> "15s"
		formatted = formatted.replace(/\b0[hm]\b\s*/g, '');

		return formatted;
	}

	/**
	 * Parse human-readable time string back to milliseconds
	 * @param timeString Human-readable time string (e.g., "2hrs30mins")
	 * @returns Duration in milliseconds, or 0 if parsing fails
	 */
	static parseTimeString(timeString: string): number {
		let totalMs = 0;

		// Match hours
		const hoursMatch = timeString.match(/(\d+)hrs?/i);
		if (hoursMatch) {
			totalMs += parseInt(hoursMatch[1]) * 3600000;
		}

		// Match minutes
		const minutesMatch = timeString.match(/(\d+)mins?/i);
		if (minutesMatch) {
			totalMs += parseInt(minutesMatch[1]) * 60000;
		}

		// Match seconds
		const secondsMatch = timeString.match(/(\d+)s(?:ecs?)?/i);
		if (secondsMatch) {
			totalMs += parseInt(secondsMatch[1]) * 1000;
		}

		return totalMs;
	}

	/**
	 * Format duration for export/import purposes
	 * @param duration Duration in milliseconds
	 * @returns ISO 8601 duration string
	 */
	static formatForExport(duration: number): string {
		const components = this.parseTimeComponents(duration);
		return `PT${components.hours}H${components.minutes}M${components.seconds}S`;
	}

	/**
	 * Parse ISO 8601 duration string
	 * @param isoDuration ISO 8601 duration string
	 * @returns Duration in milliseconds
	 */
	static parseFromExport(isoDuration: string): number {
		const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
		if (!match) {
			return 0;
		}

		const hours = parseInt(match[1] || '0');
		const minutes = parseInt(match[2] || '0');
		const seconds = parseInt(match[3] || '0');

		return hours * 3600000 + minutes * 60000 + seconds * 1000;
	}
}