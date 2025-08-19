import {
	Component,
	DropdownComponent,
	Notice,
	setIcon,
	Setting,
} from "obsidian";
import { ScheduledHabitProps } from "../../../types/habit-card";
import { HabitCard } from "./habitcard";
import TaskProgressBarPlugin from "../../../index";
import { t } from "../../../translations/helper";
import { EventDetailModal } from "../habit";
import { getTodayLocalDateString } from "../../../utils/date/date-formatter";

function renderPieDotSVG(completed: number, total: number): string {
	if (total <= 0) return "";
	const percentage = (completed / total) * 100;
	const radius = 8; // SVG viewbox units
	const circumference = 2 * Math.PI * radius;
	const offset = circumference - (percentage / 100) * circumference;

	// Simple SVG circle progress
	return `
        <svg viewBox="0 0 20 20" width="100%" height="100%">
            <circle cx="10" cy="10" r="${radius}" fill="transparent" stroke="var(--background-modifier-border)" stroke-width="3"></circle>
            <circle cx="10" cy="10" r="${radius}" fill="transparent"
                    stroke="var(--interactive-accent)"
                    stroke-width="3"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${offset}"
                    transform="rotate(-90 10 10)">
            </circle>
            ${
				completed > 0
					? `<text x="10" y="10" text-anchor="middle" dy=".3em" font-size="8px" fill="var(--text-muted)">${completed}</text>`
					: ""
			}
        </svg>
    `;
}

export class ScheduledHabitCard extends HabitCard {
	constructor(
		public habit: ScheduledHabitProps,
		public container: HTMLElement,
		public plugin: TaskProgressBarPlugin
	) {
		super(habit, container, plugin);
	}

	onload(): void {
		super.onload();
		this.render();
	}

	render(): void {
		super.render();

		const card = this.container.createDiv({
			cls: "habit-card scheduled-habit-card",
		});
		const header = card.createDiv({ cls: "card-header" });
		const titleDiv = header.createDiv({ cls: "card-title" });
		const iconEl = titleDiv.createSpan({ cls: "habit-icon" });
		setIcon(iconEl, (this.habit.icon as string) || "calendar-clock"); // Better default icon
		titleDiv
			.createSpan({ text: this.habit.name, cls: "habit-name" })
			.onClickEvent(() => {
				new Notice(`Chart for ${this.habit.name} (Not Implemented)`);
				// TODO: Implement Chart Dialog
			});

		const contentWrapper = card.createDiv({ cls: "card-content-wrapper" });

		const heatmapContainer = contentWrapper.createDiv({
			cls: "habit-heatmap-medium",
		});
		this.renderHeatmap(
			heatmapContainer,
			this.habit.completions,
			"md",
			(value: any) =>
				value &&
				typeof value === "object" &&
				Object.keys(value).length > 0, // Check if it's an object with keys
			(value: Record<string, string>) => {
				// Custom cell renderer
				if (
					!value ||
					typeof value !== "object" ||
					Object.keys(value).length === 0
				)
					return null;
				const completedCount = Object.keys(value).length;
				// Ensure events array exists and has length
				const totalEvents = Array.isArray(this.habit.events)
					? this.habit.events.length
					: 0;
				const pieDiv = createDiv({ cls: "pie-dot-container" });
				pieDiv.innerHTML = renderPieDotSVG(completedCount, totalEvents);
				// Add tooltip showing completed events for the day
				const tooltipText = Object.entries(value)
					.map(([name, detail]) =>
						detail ? `${name}: ${detail}` : name
					)
					.join("\n");
				pieDiv.setAttribute(
					"aria-label",
					tooltipText || "No events completed"
				);
				return pieDiv;
			}
		);

		const controlsDiv = contentWrapper.createDiv({ cls: "habit-controls" });
		const today = getTodayLocalDateString();
		// Ensure completions for today exists and is an object
		const todaysCompletions: Record<string, string> =
			typeof this.habit.completions[today] === "object" &&
			this.habit.completions[today] !== null
				? this.habit.completions[today]
				: {};
		const completedEventsToday = Object.keys(todaysCompletions).length;
		const totalEvents = Array.isArray(this.habit.events)
			? this.habit.events.length
			: 0;
		const allEventsDoneToday =
			totalEvents > 0 && completedEventsToday >= totalEvents;

		// Use Obsidian Setting for dropdown
		const eventDropdown = new DropdownComponent(controlsDiv)
			.addOption(
				"",
				allEventsDoneToday ? t("All Done!") : t("Select event...")
			)
			.setValue("")
			.onChange((eventName) => {
				if (eventName) {
					// Open modal to get details
					new EventDetailModal(
						this.plugin.app,
						eventName,
						(details: string) => {
							this.toggleHabitCompletion(this.habit.id, {
								id: eventName,
								details: details,
							});
						}
					).open();
				}
				// Reset dropdown after selection or modal close
				eventDropdown.setValue("");
			})
			.setDisabled(allEventsDoneToday || totalEvents === 0);
		if (Array.isArray(this.habit.events)) {
			this.habit.events.forEach((event) => {
				// Ensure event name exists and is not already completed
				if (event?.name && !todaysCompletions[event.name]) {
					eventDropdown.addOption(event.name, event.name);
				}
			});
		}

		eventDropdown.selectEl.toggleClass("habit-event-dropdown", true);

		this.renderProgressBar(controlsDiv, completedEventsToday, totalEvents);
	}
}
