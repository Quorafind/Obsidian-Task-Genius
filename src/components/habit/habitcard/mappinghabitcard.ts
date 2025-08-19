import {
	ButtonComponent,
	Component,
	Notice,
	setIcon,
	Setting,
	SliderComponent,
} from "obsidian";
import { MappingHabitProps } from "../../../types/habit-card";
import { HabitCard } from "./habitcard";
import TaskProgressBarPlugin from "../../../index";
import { getTodayLocalDateString } from "../../../utils/date/date-formatter";

export class MappingHabitCard extends HabitCard {
	constructor(
		public habit: MappingHabitProps,
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
			cls: "habit-card mapping-habit-card",
		});
		const header = card.createDiv({ cls: "card-header" });
		const titleDiv = header.createDiv({ cls: "card-title" });
		const iconEl = titleDiv.createSpan({ cls: "habit-icon" });
		setIcon(iconEl, (this.habit.icon as string) || "smile-plus"); // Better default icon
		titleDiv.createSpan({ text: this.habit.name, cls: "habit-name" });

		const contentWrapper = card.createDiv({ cls: "card-content-wrapper" });

		const heatmapContainer = contentWrapper.createDiv({
			cls: "habit-heatmap-medium",
		});
		this.renderHeatmap(
			heatmapContainer,
			this.habit.completions,
			"md",
			(value: any) => typeof value === "number" && value > 0, // Check if it's a positive number
			(value: number) => {
				// Custom renderer for emoji
				if (typeof value !== "number" || value <= 0) return null;
				const emoji = this.habit.mapping?.[value] || "?";
				const cellContent = createSpan({ text: emoji });

				// Add tooltip showing the mapped value label if available
				if (this.habit.mapping && this.habit.mapping[value]) {
					cellContent.setAttribute(
						"aria-label",
						`${this.habit.mapping[value]}`
					);
					cellContent.addClass("has-tooltip");
				} else {
					cellContent.setAttribute("aria-label", `Value: ${value}`);
				}

				return cellContent;
			}
		);

		const controlsDiv = contentWrapper.createDiv({ cls: "habit-controls" });
		const today = getTodayLocalDateString();
		const defaultValue = Object.keys(this.habit.mapping || {})
			.map(Number)
			.includes(3)
			? 3
			: Object.keys(this.habit.mapping || {})
					.map(Number)
					.sort((a, b) => a - b)[0] || 1;
		let currentSelection = this.habit.completions[today] ?? defaultValue;

		const mappingButton = new ButtonComponent(controlsDiv)
			.setButtonText(this.habit.mapping?.[currentSelection] || "?")
			.setClass("habit-mapping-button")
			.onClick(() => {
				if (
					currentSelection > 0 &&
					this.habit.mapping?.[currentSelection]
				) {
					// Ensure a valid selection is made
					this.toggleHabitCompletion(this.habit.id, currentSelection);

					const noticeText =
						this.habit.mapping &&
						this.habit.mapping[currentSelection]
							? `Recorded ${this.habit.name} as ${this.habit.mapping[currentSelection]}`
							: `Recorded ${this.habit.name} as ${this.habit.mapping[currentSelection]}`;

					new Notice(noticeText);
				} else {
					new Notice(
						"Please select a valid value using the slider first."
					);
				}
			});

		// Slider using Obsidian Setting

		const slider = new SliderComponent(controlsDiv);
		const mappingKeys = Object.keys(this.habit.mapping || {})
			.map(Number)
			.sort((a, b) => a - b);
		const min = mappingKeys[0] || 1;
		const max = mappingKeys[mappingKeys.length - 1] || 5;
		slider
			.setLimits(min, max, 1)
			.setValue(currentSelection)
			.setDynamicTooltip()
			.onChange((value) => {
				currentSelection = value;

				console.log(this.habit.mapping?.[currentSelection]);

				mappingButton.buttonEl.setText(
					this.habit.mapping?.[currentSelection] || "?"
				);
			});
	}
}
