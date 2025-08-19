import { Component, Notice, setIcon } from "obsidian";
import { DailyHabitProps } from "../../../types/habit-card";
import { HabitCard } from "./habitcard";
import { t } from "../../../translations/helper";
import TaskProgressBarPlugin from "../../../index";
import { getTodayLocalDateString } from "../../../utils/date/date-formatter";

export class DailyHabitCard extends HabitCard {
	constructor(
		public habit: DailyHabitProps,
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
			cls: "habit-card daily-habit-card",
		});
		const header = card.createDiv({ cls: "card-header" });

		const titleDiv = header.createDiv({ cls: "card-title" });
		const iconEl = titleDiv.createSpan({ cls: "habit-icon" });
		setIcon(iconEl, (this.habit.icon as string) || "dice"); // Use default icon 'dice' if none provided

		// Add completion text indicator if defined
		const titleText = this.habit.completionText
			? `${this.habit.name} (${this.habit.completionText})`
			: this.habit.name;

		titleDiv
			.createSpan({ text: titleText, cls: "habit-name" })
			.onClickEvent(() => {
				new Notice(`Chart for ${this.habit.name} (Not Implemented)`);
				// TODO: Implement Chart Dialog
			});

		const checkboxContainer = header.createDiv({
			cls: "habit-checkbox-container",
		});
		const checkbox = checkboxContainer.createEl("input", {
			type: "checkbox",
			cls: "habit-checkbox",
		});
		const today = getTodayLocalDateString();

		// Check if completed based on completion text or any value
		let isCompletedToday = false;
		const todayValue = this.habit.completions[today];

		if (this.habit.completionText) {
			// If completionText is defined, check if value is 1 (meaning it matched completionText)
			isCompletedToday = todayValue === 1;
		} else {
			// Default behavior: any truthy value means completed
			isCompletedToday = !!todayValue;
		}

		checkbox.checked = isCompletedToday;

		this.registerDomEvent(checkbox, "click", (e) => {
			e.preventDefault(); // Prevent default toggle, handle manually
			this.toggleHabitCompletion(this.habit.id);
			if (!isCompletedToday) {
				// Optional: trigger confetti only on completion
				new Notice(`${t("Completed")} ${this.habit.name}! 🎉`);
			}
		});

		const contentWrapper = card.createDiv({ cls: "card-content-wrapper" });
		this.renderHeatmap(
			contentWrapper,
			this.habit.completions,
			"lg",
			(value: any) => {
				// If completionText is defined, check if value is 1 (meaning it matched completionText)
				if (this.habit.completionText) {
					return value === 1;
				}
				// Default behavior: any truthy value means completed
				return value > 0;
			}
		);
	}
}
