/**
 * Bulk Date Picker Modal
 * Modal for selecting a specific date for bulk operations
 */

import { App, Modal } from "obsidian";
import { DatePickerComponent } from "./DatePickerComponent";
import type TaskProgressBarPlugin from "@/index";

export class BulkDatePickerModal extends Modal {
	public datePickerComponent: DatePickerComponent;
	public onDateSelected: ((timestamp: number) => void) | null = null;
	private plugin?: TaskProgressBarPlugin;
	private dateType: "dueDate" | "startDate" | "scheduledDate";

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		dateType: "dueDate" | "startDate" | "scheduledDate"
	) {
		super(app);
		this.plugin = plugin;
		this.dateType = dateType;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("bulk-date-picker-modal");

		// Add title
		const title = contentEl.createEl("h3", {
			text: `Set ${this.dateType} for selected tasks`,
		});
		title.style.marginBottom = "var(--size-4-3)";

		// Create date picker component
		this.datePickerComponent = new DatePickerComponent(
			contentEl,
			this.app,
			this.plugin,
			undefined, // No initial date
			this.getDateEmoji()
		);

		this.datePickerComponent.onload();

		// Set up date change callback
		this.datePickerComponent.setOnDateChange((dateString: string) => {
			if (this.onDateSelected) {
				// Convert date string to timestamp
				const timestamp = new Date(dateString).getTime();
				this.onDateSelected(timestamp);
			}
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;

		if (this.datePickerComponent) {
			this.datePickerComponent.onunload();
		}

		contentEl.empty();
	}

	private getDateEmoji(): string {
		switch (this.dateType) {
			case "dueDate":
				return "📅";
			case "startDate":
				return "🛫";
			case "scheduledDate":
				return "⏳";
			default:
				return "📅";
		}
	}
}
