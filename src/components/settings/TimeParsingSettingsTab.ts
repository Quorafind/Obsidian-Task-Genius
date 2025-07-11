import { PluginSettingTab, Setting } from "obsidian";
import { t } from "../../translations/helper";
import { TaskProgressBarSettingTab } from "../../setting";

export function renderTimeParsingSettingsTab(
	pluginSettingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement
) {
	containerEl.createEl("h2", { text: t("Time Parsing Settings") });

	// Enable Time Parsing
	new Setting(containerEl)
		.setName(t("Enable Time Parsing"))
		.setDesc(
			t(
				"Automatically parse natural language time expressions in Quick Capture"
			)
		)
		.addToggle((toggle) =>
			toggle
				.setValue(
					pluginSettingTab.plugin.settings.timeParsing?.enabled ??
						true
				)
				.onChange(async (value) => {
					if (!pluginSettingTab.plugin.settings.timeParsing) {
						pluginSettingTab.plugin.settings.timeParsing = {
							enabled: value,
							supportedLanguages: ["en", "zh"],
							dateKeywords: {
								start: ["start", "begin", "from", "开始", "从"],
								due: [
									"due",
									"deadline",
									"by",
									"until",
									"截止",
									"到期",
									"之前",
								],
								scheduled: [
									"scheduled",
									"on",
									"at",
									"安排",
									"计划",
									"在",
								],
							},
							removeOriginalText: true,
							perLineProcessing: true,
							realTimeReplacement: true,
						};
					} else {
						pluginSettingTab.plugin.settings.timeParsing.enabled =
							value;
					}
					pluginSettingTab.applySettingsUpdate();
				})
		);

	// Remove Original Text
	new Setting(containerEl)
		.setName(t("Remove Original Time Expressions"))
		.setDesc(t("Remove parsed time expressions from the task text"))
		.addToggle((toggle) =>
			toggle
				.setValue(
					pluginSettingTab.plugin.settings.timeParsing
						?.removeOriginalText ?? true
				)
				.onChange(async (value) => {
					if (!pluginSettingTab.plugin.settings.timeParsing) return;
					pluginSettingTab.plugin.settings.timeParsing.removeOriginalText =
						value;
					pluginSettingTab.applySettingsUpdate();
				})
		);

	// Supported Languages
	containerEl.createEl("h3", { text: t("Supported Languages") });
	containerEl.createEl("p", {
		text: t(
			"Currently supports English and Chinese time expressions. More languages may be added in future updates."
		),
		cls: "setting-item-description",
	});

	// Date Keywords Configuration
	containerEl.createEl("h3", { text: t("Date Keywords Configuration") });

	// Start Date Keywords
	new Setting(containerEl)
		.setName(t("Start Date Keywords"))
		.setDesc(t("Keywords that indicate start dates (comma-separated)"))
		.addTextArea((text) => {
			const keywords =
				pluginSettingTab.plugin.settings.timeParsing?.dateKeywords
					?.start || [];
			text.setValue(keywords.join(", "))
				.setPlaceholder("start, begin, from, 开始, 从")
				.onChange(async (value) => {
					if (!pluginSettingTab.plugin.settings.timeParsing) return;
					pluginSettingTab.plugin.settings.timeParsing.dateKeywords.start =
						value
							.split(",")
							.map((k) => k.trim())
							.filter((k) => k.length > 0);
					pluginSettingTab.applySettingsUpdate();
				});
			text.inputEl.rows = 2;
		});

	// Due Date Keywords
	new Setting(containerEl)
		.setName(t("Due Date Keywords"))
		.setDesc(t("Keywords that indicate due dates (comma-separated)"))
		.addTextArea((text) => {
			const keywords =
				pluginSettingTab.plugin.settings.timeParsing?.dateKeywords
					?.due || [];
			text.setValue(keywords.join(", "))
				.setPlaceholder("due, deadline, by, until, 截止, 到期, 之前")
				.onChange(async (value) => {
					if (!pluginSettingTab.plugin.settings.timeParsing) return;
					pluginSettingTab.plugin.settings.timeParsing.dateKeywords.due =
						value
							.split(",")
							.map((k) => k.trim())
							.filter((k) => k.length > 0);
					pluginSettingTab.applySettingsUpdate();
				});
			text.inputEl.rows = 2;
		});

	// Scheduled Date Keywords
	new Setting(containerEl)
		.setName(t("Scheduled Date Keywords"))
		.setDesc(t("Keywords that indicate scheduled dates (comma-separated)"))
		.addTextArea((text) => {
			const keywords =
				pluginSettingTab.plugin.settings.timeParsing?.dateKeywords
					?.scheduled || [];
			text.setValue(keywords.join(", "))
				.setPlaceholder("scheduled, on, at, 安排, 计划, 在")
				.onChange(async (value) => {
					if (!pluginSettingTab.plugin.settings.timeParsing) return;
					pluginSettingTab.plugin.settings.timeParsing.dateKeywords.scheduled =
						value
							.split(",")
							.map((k) => k.trim())
							.filter((k) => k.length > 0);
					pluginSettingTab.applySettingsUpdate();
				});
			text.inputEl.rows = 2;
		});

	// Examples
	containerEl.createEl("h3", { text: t("Examples") });
	const examplesEl = containerEl.createEl("div", {
		cls: "time-parsing-examples",
	});

	const examples = [
		{ input: "go to bed tomorrow", output: "go to bed 📅 2025-01-05" },
		{ input: "meeting next week", output: "meeting 📅 2025-01-11" },
		{ input: "project due by Friday", output: "project 📅 2025-01-04" },
		{ input: "明天开会", output: "开会 📅 2025-01-05" },
		{ input: "3天后完成", output: "完成 📅 2025-01-07" },
	];

	examples.forEach((example) => {
		const exampleEl = examplesEl.createEl("div", {
			cls: "time-parsing-example",
		});
		exampleEl.createEl("span", {
			text: "Input: ",
			cls: "example-label",
		});
		exampleEl.createEl("code", {
			text: example.input,
			cls: "example-input",
		});
		exampleEl.createEl("br");
		exampleEl.createEl("span", {
			text: "Output: ",
			cls: "example-label",
		});
		exampleEl.createEl("code", {
			text: example.output,
			cls: "example-output",
		});
	});
}
