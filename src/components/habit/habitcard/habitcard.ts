import { Component } from "obsidian";
import {
	DailyHabitProps,
	HabitProps,
	MappingHabitProps,
} from "../../../types/habit-card";
import TaskProgressBarPlugin from "../../../index";
import { getTodayLocalDateString, getLocalDateString } from "../../../utils/date/date-formatter";

function getDatesInRange(startDate: string, endDate: string): string[] {
	const dates = [];
	let currentDate = new Date(startDate);
	const endDateObj = new Date(endDate);

	while (currentDate <= endDateObj) {
		dates.push(
			`${currentDate.getFullYear()}-${String(
				currentDate.getMonth() + 1
			).padStart(2, "0")}-${String(currentDate.getDate()).padStart(
				2,
				"0"
			)}`
		);
		currentDate.setDate(currentDate.getDate() + 1);
	}

	return dates;
}

export class HabitCard extends Component {
	heatmapDateRange: number = 30; // Default number of days for heatmaps

	constructor(
		public habit: HabitProps,
		public container: HTMLElement,
		public plugin: TaskProgressBarPlugin
	) {
		super();
	}

	render(): void {
		// Base rendering logic
		this.container.empty();
	}

	getHabitData(): HabitProps[] {
		const habits = this.plugin.habitManager?.habits || [];
		return habits;
	}

	renderProgressBar(container: HTMLElement, value: number, max: number) {
		const progressContainer = container.createDiv({
			cls: "habit-progress-container",
		});
		const progressBar = progressContainer.createDiv({
			cls: "habit-progress-bar",
		});
		const progressText = progressContainer.createDiv({
			cls: "habit-progress-text",
		});

		value = Math.max(0, value); // Ensure value is not negative
		max = Math.max(1, max); // Ensure max is at least 1 to avoid division by zero

		const percentage =
			max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
		progressBar.style.width = `${percentage}%`;
		progressText.setText(`${value}/${max}`);
		progressContainer.setAttribute(
			"aria-label",
			`Progress: ${value} out of ${max}`
		);

		if (value === max) {
			progressContainer.toggleClass("filled", true);
		} else {
			progressContainer.toggleClass("filled", false);
		}
	}

	// Basic heatmap renderer (shows last N days)
	renderHeatmap(
		container: HTMLElement,
		completions: Record<string, any>,
		size: "sm" | "md" | "lg",
		getVariantCondition: (value: any) => boolean, // Function to determine if cell is "filled"
		getCellValue?: (value: any) => string | HTMLElement | null // Optional function to get custom cell content
	) {
		const countsMap = {
			sm: 18,
			md: 18,
			lg: 30,
		};
		const heatmapRoot = container.createDiv({
			cls: `tg-heatmap-root heatmap-${size}`,
		});
		const heatmapContainer = heatmapRoot.createDiv({
			cls: `heatmap-container-simple`,
		});

		const endDate = new Date();
		const startDate = new Date(
			endDate.getTime() - (countsMap[size] - 1) * 24 * 60 * 60 * 1000
		);
		const dates = getDatesInRange(
			getLocalDateString(startDate),
			getLocalDateString(endDate)
		);

		// Render dates in reverse chronological order (most recent first)
		dates.reverse().forEach((date) => {
			const cellValue = completions[date];
			const isFilled = getVariantCondition(cellValue);
			const customContent = getCellValue ? getCellValue(cellValue) : null;

			const cell = heatmapContainer.createDiv({
				cls: `heatmap-cell heatmap-cell-square`, // Base class
			});
			cell.dataset.date = date;

			// Determine tooltip content
			let tooltipText = `${date}: `;
			if (cellValue === undefined || cellValue === null) {
				tooltipText += "Missed";
			} else if (typeof cellValue === "object") {
				// For scheduled: handled by custom renderer's aria-label
				if (!cell.hasAttribute("aria-label")) {
					// Set default if not set by custom renderer
					tooltipText += "Recorded";
				}
			} else if (typeof cellValue === "number" && size === "sm") {
				// Count habit
				tooltipText += `${cellValue} times`;
			} else if (typeof cellValue === "number" && customContent) {
				// Mapping habit (emoji shown)
				tooltipText += `${
					customContent instanceof HTMLElement
						? customContent.textContent
						: customContent
				}`; // Show emoji
			} else if (isFilled) {
				tooltipText += "Completed";
			} else {
				tooltipText += "Missed";
			}

			if (!cell.hasAttribute("aria-label")) {
				cell.setAttribute("aria-label", tooltipText);
			}

			if (customContent) {
				cell.addClass("has-custom-content");
				if (typeof customContent === "string") {
					cell.addClass("has-text-content");
					cell.setText(customContent);
				} else if (customContent instanceof HTMLElement) {
					cell.appendChild(customContent);
				}
			} else if (isFilled) {
				cell.addClass("filled");
			} else {
				cell.addClass("default");
			}
		});
	}

	toggleHabitCompletion(habitId: string, data?: any) {
		console.log(`Toggling completion for ${habitId}`, data);

		// 1. Get current habit state (use a deep copy to avoid mutation issues)
		const currentHabits = this.getHabitData(); // In real scenario, fetch from indexer
		const habitIndex = currentHabits.findIndex((h) => h.id === habitId);
		if (habitIndex === -1) {
			console.error("Habit not found:", habitId);
			return;
		}
		// Create a deep copy to modify - simple version for this example
		const habitToUpdate = JSON.parse(
			JSON.stringify(currentHabits[habitIndex])
		);
		const today = getTodayLocalDateString();

		// 2. Calculate new completion state based on habit type
		let newCompletionValue: any;
		habitToUpdate.completions = habitToUpdate.completions || {}; // Ensure completions exists
		const currentCompletionToday = habitToUpdate.completions[today];

		switch (habitToUpdate.type) {
			case "daily":
				const dailyHabit = habitToUpdate as DailyHabitProps;
				if (dailyHabit.completionText) {
					newCompletionValue = currentCompletionToday === 1 ? 0 : 1;
				} else {
					// Default behavior: toggle between 0 and 1
					newCompletionValue = currentCompletionToday ? 0 : 1;
				}
				break;
			case "count":
				newCompletionValue =
					(typeof currentCompletionToday === "number"
						? currentCompletionToday
						: 0) + 1;
				break;
			case "scheduled":
				if (!data || !data.id) {
					console.error(
						"Missing event data for scheduled habit toggle"
					);
					return;
				}
				// Ensure current completion is an object
				const currentEvents =
					typeof currentCompletionToday === "object" &&
					currentCompletionToday !== null
						? currentCompletionToday
						: {};
				newCompletionValue = {
					...currentEvents,
					[data.id]: data.details ?? "", // Store details, default to empty string
				};
				break;
			case "mapping":
				if (
					data === undefined ||
					data === null ||
					typeof data !== "number"
				) {
					console.error("Invalid value for mapping habit toggle");
					return;
				}
				const mappingHabit = habitToUpdate as MappingHabitProps;
				// Ensure the value is valid for this mapping
				if (!mappingHabit.mapping[data]) {
					console.error(`Invalid mapping value: ${data}`);
					return;
				}
				newCompletionValue = data; // Value comes from slider/button
				break;
			default:
				console.error("Unhandled habit type in toggleCompletion");
				return;
		}

		// Update the completion for today
		habitToUpdate.completions[today] = newCompletionValue;

		this.plugin.habitManager?.updateHabitInObsidian(habitToUpdate, today);
	}
}
