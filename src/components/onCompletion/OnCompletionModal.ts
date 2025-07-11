import { App, Modal } from "obsidian";
import {
	OnCompletionConfigurator,
	OnCompletionConfiguratorOptions,
} from "./OnCompletionConfigurator";
import TaskProgressBarPlugin from "../../index";
import { t } from "../../translations/helper";
import "../../styles/onCompletion.css";

export interface OnCompletionModalOptions {
	initialValue?: string;
	onSave: (value: string) => void;
	onCancel?: () => void;
}

/**
 * Modal for configuring OnCompletion actions
 */
export class OnCompletionModal extends Modal {
	private configurator: OnCompletionConfigurator;
	private options: OnCompletionModalOptions;
	private plugin: TaskProgressBarPlugin;
	private currentValue: string = "";
	private isValid: boolean = false;

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		options: OnCompletionModalOptions
	) {
		super(app);
		this.plugin = plugin;
		this.options = options;
		this.currentValue = options.initialValue || "";

		// Set modal properties
		this.modalEl.addClass("oncompletion-modal");
		this.titleEl.setText(t("Configure On Completion Action"));
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Create configurator container
		const configuratorContainer = contentEl.createDiv({
			cls: "oncompletion-modal-content",
		});

		// Initialize OnCompletionConfigurator
		const configuratorOptions: OnCompletionConfiguratorOptions = {
			initialValue: this.currentValue,
			onChange: (value) => {
				this.currentValue = value;
			},
			onValidationChange: (isValid, error) => {
				this.isValid = isValid;
				this.updateSaveButtonState();
			},
		};

		this.configurator = new OnCompletionConfigurator(
			configuratorContainer,
			this.plugin,
			configuratorOptions
		);

		this.configurator.onload();

		// Create button container
		const buttonContainer = contentEl.createDiv({
			cls: "oncompletion-modal-buttons",
		});

		// Save button
		const saveButton = buttonContainer.createEl("button", {
			text: t("Save"),
			cls: "mod-cta",
		});
		saveButton.addEventListener("click", () => this.handleSave());

		// Cancel button
		const cancelButton = buttonContainer.createEl("button", {
			text: t("Cancel"),
		});
		cancelButton.addEventListener("click", () => this.handleCancel());

		// Reset button
		const resetButton = buttonContainer.createEl("button", {
			text: t("Reset"),
		});
		resetButton.addEventListener("click", () => this.handleReset());

		// Store button references for state management
		(this as any).saveButton = saveButton;
		(this as any).resetButton = resetButton;

		// Set initial button state
		this.updateSaveButtonState();
	}

	private updateSaveButtonState() {
		const saveButton = (this as any).saveButton as HTMLButtonElement;
		if (saveButton) {
			saveButton.disabled =
				!this.isValid && this.currentValue.trim() !== "";
		}
	}

	private handleSave() {
		if (this.options.onSave) {
			this.options.onSave(this.currentValue);
		}
		this.close();
	}

	private handleCancel() {
		if (this.options.onCancel) {
			this.options.onCancel();
		}
		this.close();
	}

	private handleReset() {
		this.currentValue = "";
		this.configurator.setValue("");
		this.updateSaveButtonState();
	}

	onClose() {
		const { contentEl } = this;
		if (this.configurator) {
			this.configurator.unload();
		}
		contentEl.empty();
	}
}
