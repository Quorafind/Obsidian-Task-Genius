/**
 * Status Mapper for ICS Events
 * Maps ICS events to specific task statuses based on various rules
 * Integrates with existing task status system from settings
 */

import {
	IcsEvent,
	IcsStatusMapping,
	TaskStatus,
	IcsEventWithHoliday,
} from "../types/ics";
import { TaskProgressBarSettings } from "../common/setting-definition";

export class StatusMapper {
	/**
	 * Apply status mapping to an ICS event using plugin settings
	 */
	static applyStatusMapping(
		event: IcsEvent | IcsEventWithHoliday,
		config: IcsStatusMapping | undefined,
		pluginSettings: TaskProgressBarSettings
	): string {
		// If no custom status mapping is configured, use default ICS status mapping
		if (!config?.enabled) {
			return this.mapIcsStatusToTaskStatus(event.status, pluginSettings);
		}

		// Check property-based rules first (higher priority)
		if (config.propertyRules) {
			const propertyStatus = this.applyPropertyRules(
				event,
				config.propertyRules,
				pluginSettings
			);
			if (propertyStatus) {
				return propertyStatus;
			}
		}

		// Apply timing-based rules
		const timingStatus = this.applyTimingRules(
			event,
			config.timingRules,
			pluginSettings
		);
		if (timingStatus) {
			return timingStatus;
		}

		// Fallback to original ICS status if no rules match
		return config.overrideIcsStatus
			? this.convertTaskStatusToString(
					config.timingRules.futureEvents,
					pluginSettings
			  )
			: this.mapIcsStatusToTaskStatus(event.status, pluginSettings);
	}

	/**
	 * Apply property-based status rules
	 */
	private static applyPropertyRules(
		event: IcsEvent | IcsEventWithHoliday,
		rules: NonNullable<IcsStatusMapping["propertyRules"]>,
		pluginSettings: TaskProgressBarSettings
	): string | null {
		// Holiday mapping (highest priority)
		if (rules.holidayMapping && "isHoliday" in event) {
			const holidayEvent = event as IcsEventWithHoliday;
			if (holidayEvent.isHoliday) {
				return this.convertTaskStatusToString(
					rules.holidayMapping.holidayStatus,
					pluginSettings
				);
			} else if (rules.holidayMapping.nonHolidayStatus) {
				return this.convertTaskStatusToString(
					rules.holidayMapping.nonHolidayStatus,
					pluginSettings
				);
			}
		}

		// Category mapping
		if (rules.categoryMapping && event.categories) {
			for (const category of event.categories) {
				const mappedStatus =
					rules.categoryMapping[category.toLowerCase()];
				if (mappedStatus) {
					return this.convertTaskStatusToString(
						mappedStatus,
						pluginSettings
					);
				}
			}
		}

		// Summary pattern mapping
		if (rules.summaryMapping) {
			for (const mapping of rules.summaryMapping) {
				try {
					const regex = new RegExp(mapping.pattern, "i");
					if (regex.test(event.summary)) {
						return this.convertTaskStatusToString(
							mapping.status,
							pluginSettings
						);
					}
				} catch (error) {
					console.warn(
						`Invalid regex pattern: ${mapping.pattern}`,
						error
					);
				}
			}
		}

		return null;
	}

	/**
	 * Apply timing-based status rules
	 */
	private static applyTimingRules(
		event: IcsEvent | IcsEventWithHoliday,
		rules: IcsStatusMapping["timingRules"],
		pluginSettings: TaskProgressBarSettings
	): string {
		const now = new Date();
		const today = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate()
		);

		const eventStart = new Date(event.dtstart);
		const eventEnd = event.dtend ? new Date(event.dtend) : eventStart;

		// Normalize event dates to start of day for comparison
		const eventStartDay = new Date(
			eventStart.getFullYear(),
			eventStart.getMonth(),
			eventStart.getDate()
		);
		const eventEndDay = new Date(
			eventEnd.getFullYear(),
			eventEnd.getMonth(),
			eventEnd.getDate()
		);

		// Check if event is in the past
		if (eventEndDay < today) {
			return this.convertTaskStatusToString(
				rules.pastEvents,
				pluginSettings
			);
		}

		// Check if event is happening today
		if (eventStartDay <= today && eventEndDay >= today) {
			return this.convertTaskStatusToString(
				rules.currentEvents,
				pluginSettings
			);
		}

		// Event is in the future
		return this.convertTaskStatusToString(
			rules.futureEvents,
			pluginSettings
		);
	}

	/**
	 * Convert TaskStatus to actual string using plugin settings
	 */
	private static convertTaskStatusToString(
		taskStatus: TaskStatus,
		pluginSettings: TaskProgressBarSettings
	): string {
		// Use the existing task status system from settings
		const statusMarks = pluginSettings.taskStatusMarks;

		// Map our TaskStatus enum to the status names used in settings
		const statusMapping: Record<TaskStatus, string> = {
			" ": "Not Started",
			x: "Completed",
			"-": "Abandoned",
			">": "In Progress",
			"<": "Planned",
			"!": "Important",
			"?": "Planned", // Map to existing status
			"/": "In Progress",
			"+": "Completed", // Map to existing status
			"*": "Important", // Map to existing status
			'"': "Not Started", // Map to existing status
			l: "Not Started",
			b: "Not Started",
			i: "Not Started",
			S: "Not Started",
			I: "Not Started",
			p: "Not Started",
			c: "Not Started",
			f: "Important",
			k: "Important",
			w: "Completed",
			u: "In Progress",
			d: "Abandoned",
		};

		const statusName = statusMapping[taskStatus];

		// Return the actual status mark from settings, fallback to the TaskStatus itself
		return statusMarks[statusName] || taskStatus;
	}

	/**
	 * Map original ICS status to task status using plugin settings
	 */
	private static mapIcsStatusToTaskStatus(
		icsStatus: string | undefined,
		pluginSettings: TaskProgressBarSettings
	): string {
		const statusMarks = pluginSettings.taskStatusMarks;

		switch (icsStatus?.toUpperCase()) {
			case "COMPLETED":
				return statusMarks["Completed"] || "x";
			case "CANCELLED":
				return statusMarks["Abandoned"] || "-";
			case "TENTATIVE":
				return statusMarks["Planned"] || "?";
			case "CONFIRMED":
			default:
				return statusMarks["Not Started"] || " ";
		}
	}

	/**
	 * Get default status mapping configuration
	 */
	static getDefaultConfig(): IcsStatusMapping {
		return {
			enabled: false,
			timingRules: {
				pastEvents: "x", // Mark past events as completed
				currentEvents: "/", // Mark current events as in progress
				futureEvents: " ", // Keep future events as incomplete
			},
			propertyRules: {
				categoryMapping: {
					holiday: "-", // Mark holidays as cancelled/abandoned
					vacation: "-", // Mark vacations as cancelled/abandoned
					假期: "-", // Mark Chinese holidays as cancelled/abandoned
					节日: "-", // Mark Chinese festivals as cancelled/abandoned
				},
				holidayMapping: {
					holidayStatus: "-", // Mark detected holidays as cancelled
					nonHolidayStatus: undefined, // Use timing rules for non-holidays
				},
			},
			overrideIcsStatus: true,
		};
	}

	/**
	 * Get available task statuses with descriptions
	 */
	static getAvailableStatuses(): Array<{
		value: TaskStatus;
		label: string;
		description: string;
	}> {
		return [
			{
				value: " ",
				label: "Incomplete",
				description: "Task is not yet completed",
			},
			{ value: "x", label: "Complete", description: "Task is completed" },
			{
				value: "-",
				label: "Cancelled",
				description: "Task is cancelled or abandoned",
			},
			{
				value: ">",
				label: "Forwarded",
				description: "Task is forwarded or rescheduled",
			},
			{
				value: "<",
				label: "Scheduled",
				description: "Task is scheduled",
			},
			{
				value: "!",
				label: "Important",
				description: "Task is marked as important",
			},
			{
				value: "?",
				label: "Question",
				description: "Task is tentative or questionable",
			},
			{
				value: "/",
				label: "In Progress",
				description: "Task is currently in progress",
			},
		];
	}

	/**
	 * Get status label for display
	 */
	static getStatusLabel(status: TaskStatus): string {
		const statusInfo = this.getAvailableStatuses().find(
			(s) => s.value === status
		);
		return statusInfo ? statusInfo.label : "Unknown";
	}

	/**
	 * Validate status mapping configuration
	 */
	static validateConfig(config: IcsStatusMapping): {
		valid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];

		// Validate timing rules
		if (!config.timingRules) {
			errors.push("Timing rules are required");
		} else {
			const availableStatuses = this.getAvailableStatuses().map(
				(s) => s.value
			);

			if (!availableStatuses.includes(config.timingRules.pastEvents)) {
				errors.push(
					`Invalid status for past events: ${config.timingRules.pastEvents}`
				);
			}
			if (!availableStatuses.includes(config.timingRules.currentEvents)) {
				errors.push(
					`Invalid status for current events: ${config.timingRules.currentEvents}`
				);
			}
			if (!availableStatuses.includes(config.timingRules.futureEvents)) {
				errors.push(
					`Invalid status for future events: ${config.timingRules.futureEvents}`
				);
			}
		}

		// Validate property rules if present
		if (config.propertyRules) {
			const availableStatuses = this.getAvailableStatuses().map(
				(s) => s.value
			);

			// Validate category mapping
			if (config.propertyRules.categoryMapping) {
				for (const [category, status] of Object.entries(
					config.propertyRules.categoryMapping
				)) {
					if (!availableStatuses.includes(status)) {
						errors.push(
							`Invalid status for category '${category}': ${status}`
						);
					}
				}
			}

			// Validate summary mapping
			if (config.propertyRules.summaryMapping) {
				for (const mapping of config.propertyRules.summaryMapping) {
					if (!availableStatuses.includes(mapping.status)) {
						errors.push(
							`Invalid status for pattern '${mapping.pattern}': ${mapping.status}`
						);
					}

					// Validate regex pattern
					try {
						new RegExp(mapping.pattern);
					} catch (error) {
						errors.push(
							`Invalid regex pattern: ${mapping.pattern}`
						);
					}
				}
			}

			// Validate holiday mapping
			if (config.propertyRules.holidayMapping) {
				if (
					!availableStatuses.includes(
						config.propertyRules.holidayMapping.holidayStatus
					)
				) {
					errors.push(
						`Invalid holiday status: ${config.propertyRules.holidayMapping.holidayStatus}`
					);
				}
				if (
					config.propertyRules.holidayMapping.nonHolidayStatus &&
					!availableStatuses.includes(
						config.propertyRules.holidayMapping.nonHolidayStatus
					)
				) {
					errors.push(
						`Invalid non-holiday status: ${config.propertyRules.holidayMapping.nonHolidayStatus}`
					);
				}
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}
}
