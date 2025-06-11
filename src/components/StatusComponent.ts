import { ExtraButtonComponent, Menu } from "obsidian";
import { Component } from "obsidian";
import TaskProgressBarPlugin from "../index";
import { Task } from "../types/task";
import { createTaskCheckbox } from "./task-view/details";
import { getStatusText } from "./task-view/details";
import { t } from "../translations/helper";

export class StatusComponent extends Component {
	constructor(
		private plugin: TaskProgressBarPlugin,
		private containerEl: HTMLElement,
		private task: Task,
		private params: {
			type?: "task-view" | "quick-capture";
			onTaskUpdate?: (task: Task, updatedTask: Task) => Promise<void>;
			onTaskStatusSelected?: (status: string) => void;
		}
	) {
		super();
	}

	onload(): void {
		this.containerEl.createDiv({ cls: "details-status-selector" }, (el) => {
			let containerEl = el;
			if (this.params.type === "quick-capture") {
				el.createEl("div", {
					cls: "quick-capture-status-selector-label",
					text: t("Status"),
				});

				containerEl = el.createDiv({
					cls: "quick-capture-status-selector",
				});
			}

			const allStatuses = Object.keys(
				this.plugin.settings.taskStatuses
			).map((status) => {
				return {
					status: status,
					text: this.plugin.settings.taskStatuses[
						status as keyof typeof this.plugin.settings.taskStatuses
					].split("|")[0],
				}; // Get the first status from each group
			});

			// Create five side-by-side status elements
			allStatuses.forEach((status) => {
				const statusEl = containerEl.createEl("div", {
					cls:
						"status-option" +
						(status.text === this.task.status
							? " current-status"
							: ""),
					attr: {
						"aria-label": getStatusText(
							status.status,
							this.plugin.settings
						),
					},
				});

				// Create checkbox-like element for the status
				const checkbox = createTaskCheckbox(
					status.text,
					this.task,
					statusEl
				);
				this.registerDomEvent(checkbox, "click", (evt) => {
					evt.stopPropagation();
					evt.preventDefault();
					if (status.text === this.getTaskStatus()) {
						return;
					}

					const options = {
						...this.task,
						status: status.text,
					};

					if (status.text === "x" && !this.task.completed) {
						options.completed = true;
						options.metadata.completedDate = new Date().getTime();
					}

					this.params.onTaskUpdate?.(this.task, options);
					this.params.onTaskStatusSelected?.(status.text);
				});
			});

			const moreStatus = el.createEl("div", {
				cls: "more-status",
			});
			const moreStatusBtn = new ExtraButtonComponent(moreStatus)
				.setIcon("ellipsis")
				.onClick(() => {
					const menu = new Menu();

					// Get unique statuses from taskStatusMarks
					const statusMarks = this.plugin.settings.taskStatusMarks;
					const uniqueStatuses = new Map<string, string>();

					// Build a map of unique mark -> status name to avoid duplicates
					for (const status of Object.keys(statusMarks)) {
						const mark =
							statusMarks[status as keyof typeof statusMarks];
						// If this mark is not already in the map, add it
						// This ensures each mark appears only once in the menu
						if (
							!Array.from(uniqueStatuses.values()).includes(mark)
						) {
							uniqueStatuses.set(status, mark);
						}
					}

					// Create menu items from unique statuses
					for (const [status, mark] of uniqueStatuses) {
						menu.addItem((item) => {
							item.titleEl.createEl(
								"span",
								{
									cls: "status-option-checkbox",
								},
								(el) => {
									createTaskCheckbox(mark, this.task, el);
								}
							);
							item.titleEl.createEl("span", {
								cls: "status-option",
								text: status,
							});
							item.onClick(() => {
								this.params.onTaskUpdate?.(this.task, {
									...this.task,
									status: mark,
								});
								this.params.onTaskStatusSelected?.(mark);
							});
						});
					}
					const rect =
						moreStatusBtn.extraSettingsEl?.getBoundingClientRect();
					if (rect) {
						menu.showAtPosition({
							x: rect.left,
							y: rect.bottom + 10,
						});
					}
				});
		});
	}

	private getTaskStatus() {
		return this.task.status || "";
	}
}
