import { App, Modal, Notice, Setting } from "obsidian";
import TaskProgressBarPlugin from "@/index";
import { ProjectSuggest, TagSuggest } from "@/components/ui/inputs/AutoComplete";
import { t } from "@/translations/helper";

export type TextPromptSuggestion = "project" | "tag";

export interface TextPromptOptions {
	title: string;
	placeholder?: string;
	initialValue?: string;
	okLabel?: string;
	cancelLabel?: string;
	allowEmpty?: boolean;
	suggestion?: TextPromptSuggestion;
}

export class TextPromptModal extends Modal {
	private readonly allowEmpty: boolean;
	private currentValue: string;
	private resolvePromise: ((value: string | null) => void) | null = null;
	private resolved = false;
	private inputEl: HTMLInputElement | null = null;
	private inputKeydownHandler?: (event: KeyboardEvent) => void;

	constructor(
		app: App,
		private readonly plugin: TaskProgressBarPlugin,
		private readonly options: TextPromptOptions,
	) {
		super(app);
		this.currentValue = options.initialValue ?? "";
		this.allowEmpty = options.allowEmpty ?? false;
	}

	openAndWait(): Promise<string | null> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.open();
		});
	}

	onOpen(): void {
		this.titleEl.setText(this.options.title);
		const { contentEl } = this;
		contentEl.empty();

		const inputSetting = new Setting(contentEl);
		inputSetting.setName(t("Set value")).addText((text) => {
			text.setPlaceholder(this.options.placeholder ?? "");
			text.setValue(this.currentValue);
			text.onChange((value) => {
				this.currentValue = value;
			});
			this.inputEl = text.inputEl;
		});

		if (this.inputEl) {
			if (this.options.suggestion === "project") {
				new ProjectSuggest(this.app, this.inputEl, this.plugin);
			} else if (this.options.suggestion === "tag") {
				new TagSuggest(this.app, this.inputEl, this.plugin);
			}

			this.inputKeydownHandler = (event: KeyboardEvent) => {
				if (event.key === "Enter" && !event.isComposing) {
					event.preventDefault();
					this.handleSubmit();
				}
			};
			this.inputEl.addEventListener("keydown", this.inputKeydownHandler);
		}

		const buttonSetting = new Setting(contentEl);
		buttonSetting.addButton((btn) => {
			btn.setButtonText(this.options.cancelLabel ?? t("Cancel"));
			btn.onClick(() => {
				this.finish(null);
			});
		});
		buttonSetting.addButton((btn) => {
			btn.setButtonText(this.options.okLabel ?? t("Save")).setCta();
			btn.onClick(() => {
				this.handleSubmit();
			});
		});

		window.setTimeout(() => {
			if (this.inputEl) {
				this.inputEl.focus();
				this.inputEl.select();
			}
		}, 50);
	}

	onClose(): void {
		if (this.inputEl && this.inputKeydownHandler) {
			this.inputEl.removeEventListener("keydown", this.inputKeydownHandler);
		}
		this.contentEl.empty();
		if (!this.resolved) {
			this.resolved = true;
			this.resolvePromise?.(null);
		}
	}

	private handleSubmit(): void {
		const trimmedValue = this.currentValue.trim();
		if (!this.allowEmpty && trimmedValue.length === 0) {
			new Notice(t("Value cannot be empty"));
			return;
		}
		this.finish(trimmedValue);
	}

	private finish(value: string | null): void {
		if (this.resolved) return;
		this.resolved = true;
		this.resolvePromise?.(value);
		this.close();
	}
}
