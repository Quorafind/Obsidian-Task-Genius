import { ButtonComponent, Component, Notice, setIcon } from "obsidian";
import { CountHabitProps } from "../../../types/habit-card";
import { HabitCard } from "./habitcard";
import { t } from "../../../translations/helper";
import TaskProgressBarPlugin from "../../../index";
import { getTodayLocalDateString } from "../../../utils/date/date-formatter";

export class CountHabitCard extends HabitCard {
	constructor(
		public habit: CountHabitProps,
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
			cls: "habit-card count-habit-card",
		});

		const contentWrapper = card.createDiv({ cls: "card-content-wrapper" });

		const button = new ButtonComponent(contentWrapper)
			.setClass("habit-icon-button")
			.setIcon((this.habit.icon as string) || "plus-circle")
			.onClick(() => {
				this.toggleHabitCompletion(this.habit.id);
				if (this.habit.max && countToday + 1 === this.habit.max) {
					new Notice(`${t("Goal reached")} ${this.habit.name}! ✅`);
				} else if (this.habit.max && countToday + 1 > this.habit.max) {
					new Notice(`${t("Exceeded goal")} ${this.habit.name}! 💪`);
				}
			});

		const today = getTodayLocalDateString();
		let countToday = this.habit.completions[today] ?? 0;

		const infoDiv = contentWrapper.createDiv(
			{ cls: "habit-info" },
			(el) => {
				el.createEl("div", {
					cls: "habit-card-name",
					text: this.habit.name,
				});
				el.createEl("span", {
					cls: "habit-active-day",
					text: this.habit.completions[today]
						? `${t("Active")} ${t("today")}`
						: `${t("Inactive")} ${t("today")}`,
				});
			}
		);

		const progressArea = contentWrapper.createDiv({
			cls: "habit-progress-area",
		});
		const heatmapContainer = progressArea.createDiv({
			cls: "habit-heatmap-small",
		});
		if (this.habit.max && this.habit.max > 0) {
			this.renderHeatmap(
				heatmapContainer,
				this.habit.completions,
				"md",
				(value: any) => value >= (this.habit.max ?? 0)
			);
			this.renderProgressBar(progressArea, countToday, this.habit.max);
		}
	}
}
