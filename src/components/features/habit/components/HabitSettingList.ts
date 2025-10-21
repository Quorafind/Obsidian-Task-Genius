import {
	App,
	ButtonComponent,
	ExtraButtonComponent,
	Modal,
	Notice,
	setIcon,
} from "obsidian";
import { BaseHabitData } from "@/types/habit-card";
import TaskProgressBarPlugin from "@/index";
import { HabitEditDialog } from "@/components/features/habit/components/HabitEditDialog";
import { t } from "@/translations/helper";
import "@/styles/habit-list.css";

export interface HabitSettings {
	habits: BaseHabitData[];
	enableHabits: boolean;
}

export class HabitList {
	private plugin: TaskProgressBarPlugin;
	private containerEl: HTMLElement;
	private app: App;

	constructor(plugin: TaskProgressBarPlugin, containerEl: HTMLElement) {
		this.plugin = plugin;
		this.containerEl = containerEl;
		this.app = plugin.app;
		this.render();
	}

	render(): void {
		const { containerEl } = this;
		containerEl.empty();

		const addButtonContainer = containerEl.createDiv({
			cls: "habit-add-button-container",
		});
		new ButtonComponent(addButtonContainer)
			.setButtonText(t("Add new habit"))
			.setClass("habit-add-button")
			.onClick(() => {
				this.openHabitEditDialog();
			});

		if (!this.plugin.settings.habit) {
			this.plugin.settings.habit = { habits: [], enableHabits: true };
		} else if (!this.plugin.settings.habit.enableHabits) {
			this.plugin.settings.habit.enableHabits = true;
		}

		if (!this.plugin.settings.habit.habits) {
			this.plugin.settings.habit.habits = [];
		}

		const habits = this.plugin.settings.habit.habits || [];

		if (habits.length === 0) {
			this.renderEmptyState();
		} else {
			this.renderHabitList(habits);
		}
	}

	private renderEmptyState(): void {
		const emptyState = this.containerEl.createDiv({
			cls: "habit-empty-state",
		});
		emptyState.createEl("h2", { text: t("No habits yet") });
		emptyState.createEl("p", {
			text: t("Click the button above to add your first habit"),
		});
	}

	private renderHabitList(habits: BaseHabitData[]): void {
		const { containerEl } = this;

		const listContainer = containerEl.createDiv({
			cls: "habit-items-container",
		});

		habits.forEach((habit) => {
			const habitItem = listContainer.createDiv({ cls: "habit-item" });

			const iconEl = habitItem.createDiv({ cls: "habit-item-icon" });
			setIcon(iconEl, habit.icon || "circle-check");

			const infoEl = habitItem.createDiv({ cls: "habit-item-info" });
			infoEl.createEl("div", {
				cls: "habit-item-name",
				text: habit.name,
			});

			if (habit.description) {
				infoEl.createEl("div", {
					cls: "habit-item-description",
					text: habit.description,
				});
			}

			const typeLabels: Record<string, string> = {
				daily: t("Daily habit"),
				count: t("Count habit"),
				mapping: t("Mapping habit"),
				scheduled: t("Scheduled habit"),
			};

			const typeEl = infoEl.createEl("div", {
				cls: "habit-item-type",
				text: typeLabels[habit.type] || habit.type,
			});

			habitItem.createDiv(
				{
					cls: "habit-item-actions",
				},
				(el) => {
					new ExtraButtonComponent(el)
						.setTooltip(t("Edit"))
						.setIcon("edit")
						.onClick(() => {
							this.openHabitEditDialog(habit);
						});

					new ExtraButtonComponent(el)
						.setTooltip(t("Delete"))
						.setIcon("trash")
						.onClick(() => {
							this.deleteHabit(habit);
						});
				},
			);
		});
	}

	private openHabitEditDialog(habitData?: BaseHabitData): void {
		const dialog = new HabitEditDialog(
			this.app,
			this.plugin,
			habitData || null,
			(updatedHabit: BaseHabitData) => {
				// 确保habits数组已初始化
				if (!this.plugin.settings.habit.habits) {
					this.plugin.settings.habit.habits = [];
				}

				if (habitData) {
					// 更新已有习惯
					const habits = this.plugin.settings.habit.habits;
					const index = habits.findIndex(
						(h) => h.id === habitData.id,
					);
					if (index > -1) {
						habits[index] = updatedHabit;
					}
				} else {
					// 添加新习惯
					this.plugin.settings.habit.habits.push(updatedHabit);
				}

				// 保存设置并刷新显示
				this.plugin.saveSettings();
				// 重新初始化习惯索引，通知视图刷新
				this.plugin.habitManager?.initializeHabits();
				this.render();
				new Notice(habitData ? t("Habit updated") : t("Habit added"));
			},
		);

		dialog.open();
	}

	private deleteHabit(habit: BaseHabitData): void {
		// 显示确认对话框
		const habitName = habit.name;
		const modal = new Modal(this.app);
		modal.titleEl.setText(t("Delete habit"));

		const content = modal.contentEl.createDiv();
		content.setText(
			t(`Are you sure you want to delete the habit `) +
				`"${habitName}"?` +
				t("This action cannot be undone."),
		);

		modal.contentEl.createDiv(
			{
				cls: "habit-delete-modal-buttons",
			},
			(el) => {
				new ButtonComponent(el)
					.setButtonText(t("Cancel"))
					.setClass("habit-cancel-button")
					.onClick(() => {
						modal.close();
					});

				new ButtonComponent(el)
					.setWarning()
					.setButtonText(t("Delete"))
					.setClass("habit-delete-button-confirm")
					.onClick(() => {
						// 确保habits数组已初始化
						if (!this.plugin.settings.habit.habits) {
							this.plugin.settings.habit.habits = [];
							modal.close();
							return;
						}

						const habits = this.plugin.settings.habit.habits;
						const index = habits.findIndex(
							(h) => h.id === habit.id,
						);
						if (index > -1) {
							habits.splice(index, 1);
							this.plugin.saveSettings();
							// 重新初始化习惯索引，通知视图刷新
							this.plugin.habitManager?.initializeHabits();
							this.render();
							new Notice(t("Habit deleted"));
						}
						modal.close();
					});
			},
		);

		modal.open();
	}
}
