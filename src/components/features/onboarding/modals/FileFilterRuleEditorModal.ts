import { App, DropdownComponent, Modal, Setting, setIcon } from "obsidian";
import { t } from "@/translations/helper";
import TaskProgressBarPlugin from "@/index";
import { FilterMode, FileFilterRule } from "@/common/setting-definition";
import {
	FolderSuggest,
	SimpleFileSuggest as FileSuggest,
} from "@/components/ui/inputs/AutoComplete";
import "@/styles/file-filter-settings.css";

interface FileFilterRuleEditorModalOptions {
	autoAddRuleType?: FileFilterRule["type"];
	onClose?: () => void;
}

export class FileFilterRuleEditorModal extends Modal {
	private rulesContainer: HTMLElement | null = null;
	private statsContainer: HTMLElement | null = null;
	private pendingRule?: FileFilterRule;
	private readonly plugin: TaskProgressBarPlugin;
	private readonly options: FileFilterRuleEditorModalOptions;

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		options: FileFilterRuleEditorModalOptions = {},
	) {
		super(app);
		this.plugin = plugin;
		this.options = options;
	}

	onOpen(): void {
		this.modalEl.addClass("file-filter-rule-editor-modal");
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: t("Edit File Filter Rules") });
		contentEl.createEl("p", {
			text: t(
				"Configure which files, folders, or patterns are included during task indexing.",
			),
			cls: "setting-item-description",
		});

		new Setting(contentEl)
			.setName(t("Filter Mode"))
			.setDesc(
				t(
					"Whitelist: include only specified paths. Blacklist: exclude specified paths.",
				),
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						FilterMode.WHITELIST,
						t("Whitelist (Include only)"),
					)
					.addOption(FilterMode.BLACKLIST, t("Blacklist (Exclude)"))
					.setValue(this.plugin.settings.fileFilter.mode)
					.onChange(async (value: FilterMode) => {
						this.plugin.settings.fileFilter.mode = value;
						await this.plugin.saveSettings();
						this.updateStats();
					}),
			);

		const actionSetting = new Setting(contentEl);
		actionSetting.settingEl.addClass("file-filter-rule-actions");

		actionSetting
			.addButton((button) =>
				button
					.setButtonText(t("Add File Rule"))
					.setCta()
					.onClick(() => {
						this.addRule("file");
					}),
			)
			.addButton((button) =>
				button.setButtonText(t("Add Folder Rule")).onClick(() => {
					this.addRule("folder");
				}),
			)
			.addButton((button) =>
				button.setButtonText(t("Add Pattern Rule")).onClick(() => {
					this.addRule("pattern");
				}),
			);

		this.rulesContainer = contentEl.createDiv({
			cls: "file-filter-rules-container",
		});

		this.statsContainer = contentEl.createDiv({
			cls: "file-filter-stats-preview",
		});

		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText(t("Done"))
				.setCta()
				.onClick(() => this.close()),
		);

		this.renderRules();
		this.updateStats();

		if (this.options.autoAddRuleType) {
			this.addRule(this.options.autoAddRuleType).then((rule) => {
				this.pendingRule = rule;
			});
		}
	}

	onClose() {
		if (this.pendingRule && !this.pendingRule.path.trim()) {
			const index = this.plugin.settings.fileFilter.rules.indexOf(
				this.pendingRule,
			);
			if (index !== -1) {
				this.plugin.settings.fileFilter.rules.splice(index, 1);
				this.plugin.saveSettings();
			}
		}

		this.pendingRule = undefined;
		this.contentEl.empty();
		this.options.onClose?.();
	}

	private async addRule(
		type: FileFilterRule["type"],
	): Promise<FileFilterRule> {
		const newRule: FileFilterRule = {
			type,
			path: "",
			enabled: true,
		};

		this.plugin.settings.fileFilter.rules.push(newRule);
		await this.plugin.saveSettings();
		this.renderRules();
		this.updateStats();
		return newRule;
	}

	private renderRules() {
		if (!this.rulesContainer) return;

		const container = this.rulesContainer;
		container.empty();

		if (this.plugin.settings.fileFilter.rules.length === 0) {
			container.createEl("p", {
				text: t("No filter rules configured yet"),
				cls: "setting-item-description",
			});
			return;
		}

		this.plugin.settings.fileFilter.rules.forEach((rule, index) => {
			const ruleContainer = container.createDiv({
				cls: "file-filter-rule",
			});

			const typeContainer = ruleContainer.createDiv({
				cls: "file-filter-rule-type",
			});
			typeContainer.createEl("label", { text: t("Type:") });

			new DropdownComponent(typeContainer)
				.addOption("file", t("File"))
				.addOption("folder", t("Folder"))
				.addOption("pattern", t("Pattern"))
				.setValue(rule.type)
				.onChange(async (value: FileFilterRule["type"]) => {
					rule.type = value;
					await this.plugin.saveSettings();
					this.renderRules();
					this.updateStats();
				});

			const scopeContainer = ruleContainer.createDiv({
				cls: "file-filter-rule-scope",
			});
			scopeContainer.createEl("label", { text: t("Scope:") });
			new DropdownComponent(scopeContainer)
				.addOption("both", t("Both"))
				.addOption("inline", t("Inline"))
				.addOption("file", t("File"))
				.setValue((rule as any).scope || "both")
				.onChange(async (value: "both" | "inline" | "file") => {
					(rule as any).scope = value;
					await this.plugin.saveSettings();
				});

			const pathContainer = ruleContainer.createDiv({
				cls: "file-filter-rule-path",
			});
			pathContainer.createEl("label", { text: t("Path:") });

			const pathInput = pathContainer.createEl("input", {
				type: "text",
				value: rule.path,
				placeholder:
					rule.type === "pattern"
						? "*.tmp, temp/*"
						: rule.type === "folder"
							? "path/to/folder"
							: "path/to/file.md",
			});

			if (rule.type === "folder") {
				new FolderSuggest(
					this.plugin.app,
					pathInput,
					this.plugin,
					"single",
				);
			} else if (rule.type === "file") {
				new FileSuggest(pathInput, this.plugin, (file) => {
					rule.path = file.path;
					pathInput.value = file.path;
					this.plugin.saveSettings();
				});
			}

			pathInput.addEventListener("input", async () => {
				rule.path = pathInput.value;
				await this.plugin.saveSettings();
			});

			const enabledContainer = ruleContainer.createDiv({
				cls: "file-filter-rule-enabled",
			});
			enabledContainer.createEl("label", { text: t("Enabled:") });

			const enabledCheckbox = enabledContainer.createEl("input", {
				type: "checkbox",
			});
			enabledCheckbox.checked = rule.enabled;

			enabledCheckbox.addEventListener("change", async () => {
				rule.enabled = enabledCheckbox.checked;
				await this.plugin.saveSettings();
				this.updateStats();
			});

			const deleteButton = ruleContainer.createEl("button", {
				cls: "file-filter-rule-delete mod-destructive",
			});
			setIcon(deleteButton, "trash");
			deleteButton.title = t("Delete rule");

			deleteButton.addEventListener("click", async () => {
				this.plugin.settings.fileFilter.rules.splice(index, 1);
				await this.plugin.saveSettings();
				this.renderRules();
				this.updateStats();
			});
		});
	}

	private updateStats() {
		if (!this.statsContainer) return;

		const container = this.statsContainer;
		container.empty();

		const activeRules = this.plugin.settings.fileFilter.rules.filter(
			(rule) => rule.enabled,
		).length;

		const stats = [
			{
				label: t("Active Rules"),
				value: activeRules.toString(),
			},
			{
				label: t("Filter Mode"),
				value:
					this.plugin.settings.fileFilter.mode ===
					FilterMode.WHITELIST
						? t("Whitelist")
						: t("Blacklist"),
			},
			{
				label: t("Status"),
				value: this.plugin.settings.fileFilter.enabled
					? t("Enabled")
					: t("Disabled"),
			},
		];

		stats.forEach((stat) => {
			const statItem = container.createDiv({ cls: "filter-stat-item" });
			statItem.createSpan({
				text: stat.value,
				cls: "filter-stat-value",
			});
			statItem.createSpan({
				text: stat.label,
				cls: "filter-stat-label",
			});
		});
	}
}
