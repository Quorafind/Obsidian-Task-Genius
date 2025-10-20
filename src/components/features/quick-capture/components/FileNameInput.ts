import {
	App,
	TFile,
	AbstractInputSuggest,
	prepareFuzzySearch,
	SearchResult,
	DropdownComponent,
} from "obsidian";
import { t } from "@/translations/helper";
import { processDateTemplates } from "@/utils/file/file-operations";
import type { QuickCaptureTemplateDefinition } from "@/common/setting-definition";
import type TaskProgressBarPlugin from "@/index";

/**
 * File name suggest for quick capture file creation mode
 */
export class FileNameSuggest extends AbstractInputSuggest<TFile> {
	private currentFolder = "";
	private fileTemplates: string[] = [
		"{{DATE:YYYY-MM-DD}} - Meeting Notes",
		"{{DATE:YYYY-MM-DD}} - Daily Log",
		"{{DATE:YYYY-MM-DD}} - Task List",
		"Project - {{DATE:YYYY-MM}}",
		"Notes - {{DATE:YYYY-MM-DD-HHmm}}",
	];
	protected textInputEl: HTMLInputElement;

	constructor(
		app: App,
		textInputEl: HTMLInputElement,
		currentFolder?: string,
	) {
		super(app, textInputEl);
		this.textInputEl = textInputEl;
		this.currentFolder = currentFolder || "";
	}

	/**
	 * Get suggestions based on input
	 */
	getSuggestions(inputStr: string): TFile[] {
		const files = this.app.vault.getMarkdownFiles();
		const lowerInputStr = inputStr.toLowerCase();
		const suggestions: TFile[] = [];

		// Filter files in current folder
		const folderFiles = files.filter((file) => {
			if (
				this.currentFolder &&
				!file.path.startsWith(this.currentFolder)
			) {
				return false;
			}
			return file.basename.toLowerCase().contains(lowerInputStr);
		});

		// Add matching files
		suggestions.push(...folderFiles.slice(0, 5));

		return suggestions;
	}

	/**
	 * Render a suggestion
	 */
	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.basename);
		el.createDiv({
			cls: "suggestion-folder",
			text: file.parent?.path || "/",
		});
	}

	/**
	 * Select a suggestion
	 */
	selectSuggestion(file: TFile): void {
		this.textInputEl.value = file.basename;
		this.textInputEl.trigger("input");
		this.close();
	}
}

/**
 * File name input component with template support
 */
export class FileNameInput {
	private container: HTMLElement;
	private inputEl: HTMLInputElement | null = null;
	private suggest: FileNameSuggest | null = null;
	private templateDropdown: DropdownComponent | null = null;
	private app: App;
	private plugin: TaskProgressBarPlugin;
	private onChange?: (value: string) => void;

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		container: HTMLElement,
		options?: {
			placeholder?: string;
			defaultValue?: string;
			currentFolder?: string;
			onChange?: (value: string) => void;
		},
	) {
		this.app = app;
		this.plugin = plugin;
		this.container = container;
		this.onChange = options?.onChange;

		this.render(options);
	}

	/**
	 * Render the component
	 */
	private render(options?: {
		placeholder?: string;
		defaultValue?: string;
		currentFolder?: string;
	}): void {
		// Create input container
		const inputContainer = this.container.createDiv({
			cls: "file-name-input-container",
		});

		// Label
		inputContainer.createEl("label", {
			text: t("File Name"),
			cls: "file-name-label",
		});

		// Input field with default template applied
		const defaultValue = processDateTemplates(
			options?.defaultValue || "{{DATE:YYYY-MM-DD}}",
		);
		const wrapper = inputContainer.createDiv({
			cls: "file-name-input-wrapper",
		});

		this.inputEl = wrapper.createEl("input", {
			type: "text",
			cls: "file-name-input",
			placeholder: options?.placeholder || t("Enter file name..."),
			value: defaultValue,
		});

		// Add suggest
		this.suggest = new FileNameSuggest(
			this.app,
			this.inputEl,
			options?.currentFolder,
		);

		// Create template dropdown
		this.createTemplateDropdown(wrapper);

		// Event listeners
		this.inputEl.addEventListener("input", () => {
			if (this.onChange) {
				this.onChange(this.getValue());
			}
		});
	}

	/**
	 * Create template dropdown
	 */
	private createTemplateDropdown(container: HTMLElement): void {
		// Create dropdown container with input on the left and dropdown on the right
		const dropdownContainer = container.createDiv({
			cls: "file-name-template-container",
		});

		// Create dropdown
		this.templateDropdown = new DropdownComponent(dropdownContainer);

		// Get templates from settings and normalize legacy data if needed
		const defaultTemplates: QuickCaptureTemplateDefinition[] = [
			{ name: "Daily Note", template: "{{DATE:YYYY-MM-DD}}" },
			{ name: "Meeting", template: "{{DATE:YYYY-MM-DD}} - Meeting" },
			{ name: "Task", template: "{{DATE:YYYY-MM-DD}} - Task" },
			{ name: "Project", template: "Project - {{DATE:YYYY-MM}}" },
			{ name: "Notes", template: "Notes - {{DATE:YYYY-MM-DD-HHmm}}" },
		];

		const rawTemplates = this.plugin.settings.quickCapture
			.fileNameTemplates as
			| QuickCaptureTemplateDefinition[]
			| string[]
			| undefined;

		const { templates, updated } = this.normalizeTemplates(
			rawTemplates,
			defaultTemplates,
		);

		if (updated) {
			this.plugin.settings.quickCapture.fileNameTemplates = templates;
			if (typeof this.plugin.saveSettings === "function") {
				this.plugin.saveSettings();
			}
		}

		// Add empty option as default
		this.templateDropdown.addOption("", t("Select a template..."));

		// Add template options
		templates.forEach((template) => {
			const preview = processDateTemplates(template.template);
			const trimmedName = (template.name || "").trim();
			const labelBase = trimmedName.length
				? trimmedName
				: template.template;
			const displayLabel =
				labelBase === preview ? labelBase : `${labelBase} — ${preview}`;

			this.templateDropdown?.addOption(template.template, displayLabel);
		});

		// Set dropdown value
		this.templateDropdown.setValue("");

		// Handle dropdown change
		this.templateDropdown.onChange((template) => {
			if (template && this.inputEl) {
				// Process template immediately
				const processedValue = processDateTemplates(template);
				this.inputEl.value = processedValue;
				if (this.onChange) {
					this.onChange(this.getValue());
				}
				this.inputEl.focus();
			}
		});
	}

	private normalizeTemplates(
		raw: QuickCaptureTemplateDefinition[] | string[] | undefined,
		fallback: QuickCaptureTemplateDefinition[],
	): { templates: QuickCaptureTemplateDefinition[]; updated: boolean } {
		if (!Array.isArray(raw)) {
			return {
				templates: fallback.map((item) => ({ ...item })),
				updated: true,
			};
		}

		let updated = false;
		const templates = (raw as unknown[]).map((item) => {
			if (typeof item === "string") {
				updated = true;
				return { name: item, template: item };
			}

			if (item && typeof item === "object") {
				const rawTemplate = (item as { template?: unknown }).template;
				const templateValue =
					typeof rawTemplate === "string" ? rawTemplate : "";
				if (typeof rawTemplate !== "string") {
					updated = true;
				}

				const rawName = (item as { name?: unknown }).name;
				const formattedName =
					typeof rawName === "string" ? rawName.trim() : "";
				const nameValue = formattedName.length
					? formattedName
					: templateValue;
				if (typeof rawName !== "string" || formattedName.length === 0) {
					updated = true;
				}

				return { name: nameValue, template: templateValue };
			}

			updated = true;
			return { name: "", template: "" };
		});

		return { templates, updated };
	}

	/**
	 * Get the current value
	 */
	getValue(): string {
		if (!this.inputEl) return "";
		// Just return the value directly since templates are already processed
		return this.inputEl.value;
	}

	/**
	 * Set the value
	 */
	setValue(value: string): void {
		if (this.inputEl) {
			this.inputEl.value = value;
		}
	}

	/**
	 * Clear the input
	 */
	clear(): void {
		this.setValue("");
	}

	/**
	 * Focus the input
	 */
	focus(): void {
		this.inputEl?.focus();
	}

	/**
	 * Destroy the component
	 */
	destroy(): void {
		this.suggest?.close();
		this.templateDropdown = null;
		this.container.empty();
	}
}
