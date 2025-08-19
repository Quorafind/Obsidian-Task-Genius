/**
 * Holiday Detection and Grouping Utility
 * Detects holiday events and groups consecutive holidays for better display
 */

import {
	IcsEvent,
	IcsHolidayConfig,
	IcsHolidayGroup,
	IcsEventWithHoliday,
} from "../types/ics";

export class HolidayDetector {
	/**
	 * Detect if an event is a holiday based on configuration
	 */
	static isHoliday(event: IcsEvent, config: IcsHolidayConfig): boolean {
		if (!config.enabled) {
			return false;
		}

		const { detectionPatterns } = config;

		// Check summary patterns
		if (detectionPatterns.summary) {
			for (const pattern of detectionPatterns.summary) {
				try {
					const regex = new RegExp(pattern, "i");
					if (regex.test(event.summary)) {
						return true;
					}
				} catch (error) {
					console.warn(`Invalid regex pattern: ${pattern}`, error);
				}
			}
		}

		// Check description patterns
		if (detectionPatterns.description && event.description) {
			for (const pattern of detectionPatterns.description) {
				try {
					const regex = new RegExp(pattern, "i");
					if (regex.test(event.description)) {
						return true;
					}
				} catch (error) {
					console.warn(`Invalid regex pattern: ${pattern}`, error);
				}
			}
		}

		// Check categories
		if (detectionPatterns.categories && event.categories) {
			for (const category of detectionPatterns.categories) {
				if (
					event.categories.some((cat) =>
						cat.toLowerCase().includes(category.toLowerCase())
					)
				) {
					return true;
				}
			}
		}

		// Check keywords in summary and description
		if (detectionPatterns.keywords) {
			const textToCheck = [event.summary, event.description || ""].join(
				" "
			);

			for (const keyword of detectionPatterns.keywords) {
				if (textToCheck.toLowerCase().includes(keyword.toLowerCase())) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Group consecutive holiday events
	 */
	static groupConsecutiveHolidays(
		events: IcsEvent[],
		config: IcsHolidayConfig
	): IcsHolidayGroup[] {
		if (!config.enabled || config.groupingStrategy === "none") {
			return [];
		}

		// Filter and sort holiday events
		const holidayEvents = events
			.filter((event) => this.isHoliday(event, config))
			.sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime());

		if (holidayEvents.length === 0) {
			return [];
		}

		const groups: IcsHolidayGroup[] = [];
		let currentGroup: IcsEvent[] = [holidayEvents[0]];

		for (let i = 1; i < holidayEvents.length; i++) {
			const currentEvent = holidayEvents[i];
			const lastEvent = currentGroup[currentGroup.length - 1];

			// Calculate gap in days
			const gapDays = this.calculateDaysBetween(
				lastEvent.dtend || lastEvent.dtstart,
				currentEvent.dtstart
			);

			if (gapDays <= config.maxGapDays) {
				// Add to current group
				currentGroup.push(currentEvent);
			} else {
				// Create group from current events and start new group
				if (currentGroup.length > 0) {
					groups.push(this.createHolidayGroup(currentGroup, config));
				}
				currentGroup = [currentEvent];
			}
		}

		// Add the last group
		if (currentGroup.length > 0) {
			groups.push(this.createHolidayGroup(currentGroup, config));
		}

		return groups;
	}

	/**
	 * Process events with holiday detection and grouping
	 */
	static processEventsWithHolidayDetection(
		events: IcsEvent[],
		config: IcsHolidayConfig
	): IcsEventWithHoliday[] {
		if (!config.enabled) {
			// Return events as-is with holiday flags set to false
			return events.map((event) => ({
				...event,
				isHoliday: false,
				showInForecast: true,
			}));
		}

		// Group consecutive holidays
		const holidayGroups = this.groupConsecutiveHolidays(events, config);

		// Create a map of event UIDs to their holiday groups
		const eventToGroupMap = new Map<string, IcsHolidayGroup>();
		holidayGroups.forEach((group) => {
			group.events.forEach((event) => {
				eventToGroupMap.set(event.uid, group);
			});
		});

		// Process each event
		const processedEvents: IcsEventWithHoliday[] = [];

		events.forEach((event) => {
			const isHoliday = this.isHoliday(event, config);
			const holidayGroup = eventToGroupMap.get(event.uid);

			let showInForecast = true;

			if (isHoliday && holidayGroup) {
				// Apply grouping strategy
				switch (config.groupingStrategy) {
					case "first-only":
						// Only show the first event in the group
						showInForecast =
							holidayGroup.events[0].uid === event.uid;
						break;
					case "summary":
						// Show a summary event (first event with modified title)
						showInForecast =
							holidayGroup.events[0].uid === event.uid;
						break;
					case "range":
						// Show first and last events only
						const isFirst =
							holidayGroup.events[0].uid === event.uid;
						const isLast =
							holidayGroup.events[holidayGroup.events.length - 1]
								.uid === event.uid;
						showInForecast = isFirst || isLast;
						break;
					default:
						showInForecast = true;
				}

				// Override with config setting
				if (!config.showInForecast) {
					showInForecast = false;
				}
			}

			processedEvents.push({
				...event,
				isHoliday,
				holidayGroup,
				showInForecast,
			});
		});

		return processedEvents;
	}

	/**
	 * Create a holiday group from consecutive events
	 */
	private static createHolidayGroup(
		events: IcsEvent[],
		config: IcsHolidayConfig
	): IcsHolidayGroup {
		const sortedEvents = events.sort(
			(a, b) => a.dtstart.getTime() - b.dtstart.getTime()
		);
		const firstEvent = sortedEvents[0];
		const lastEvent = sortedEvents[sortedEvents.length - 1];

		const startDate = firstEvent.dtstart;
		const endDate = lastEvent.dtend || lastEvent.dtstart;
		const isMultiDay = sortedEvents.length > 1;

		// Generate group title based on strategy
		let title = firstEvent.summary;
		if (config.groupingStrategy === "summary" && isMultiDay) {
			if (config.groupDisplayFormat) {
				title = config.groupDisplayFormat
					.replace("{title}", firstEvent.summary)
					.replace("{count}", sortedEvents.length.toString())
					.replace("{startDate}", this.formatDate(startDate))
					.replace("{endDate}", this.formatDate(endDate));
			} else {
				title = `${firstEvent.summary} (${sortedEvents.length} days)`;
			}
		} else if (config.groupingStrategy === "range" && isMultiDay) {
			title = `${firstEvent.summary} - ${this.formatDateRange(
				startDate,
				endDate
			)}`;
		}

		return {
			id: `holiday-group-${firstEvent.uid}-${sortedEvents.length}`,
			title,
			startDate,
			endDate,
			events: sortedEvents,
			source: firstEvent.source,
			isMultiDay,
			displayStrategy:
				config.groupingStrategy === "none"
					? "first-only"
					: config.groupingStrategy,
		};
	}

	/**
	 * Calculate days between two dates
	 */
	private static calculateDaysBetween(date1: Date, date2: Date): number {
		const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
		const firstDate = new Date(date1);
		const secondDate = new Date(date2);

		// Reset time to start of day for accurate day calculation
		firstDate.setHours(0, 0, 0, 0);
		secondDate.setHours(0, 0, 0, 0);

		return Math.round(
			Math.abs((firstDate.getTime() - secondDate.getTime()) / oneDay)
		);
	}

	/**
	 * Format date for display
	 */
	private static formatDate(date: Date): string {
		return date.toLocaleDateString();
	}

	/**
	 * Format date range for display
	 */
	private static formatDateRange(startDate: Date, endDate: Date): string {
		const start = this.formatDate(startDate);
		const end = this.formatDate(endDate);
		return start === end ? start : `${start} - ${end}`;
	}

	/**
	 * Get default holiday configuration
	 */
	static getDefaultConfig(): IcsHolidayConfig {
		return {
			enabled: false,
			detectionPatterns: {
				summary: [
					"holiday",
					"vacation",
					"公假",
					"假期",
					"节日",
					"春节",
					"国庆",
					"中秋",
					"清明",
					"劳动节",
					"端午",
					"元旦",
					"Christmas",
					"New Year",
					"Easter",
					"Thanksgiving",
				],
				keywords: [
					"holiday",
					"vacation",
					"day off",
					"public holiday",
					"bank holiday",
					"假期",
					"休假",
					"节日",
					"公假",
				],
				categories: ["holiday", "vacation", "假期", "节日"],
			},
			groupingStrategy: "first-only",
			maxGapDays: 1,
			showInForecast: false,
			showInCalendar: true,
			groupDisplayFormat: "{title} ({count} days)",
		};
	}
}
