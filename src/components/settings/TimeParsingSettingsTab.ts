import { PluginSettingTab, Setting } from "obsidian";
import { t } from "../../translations/helper";
import { TaskProgressBarSettingTab } from "../../setting";
import type { EnhancedTimeParsingConfig } from "../../types/time-parsing";

export function renderTimeParsingSettingsTab(
	pluginSettingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement
) {
	containerEl.createEl("h2", { text: t("Time Parsing Settings") });

	// Ensure timeParsing settings exist with enhanced configuration
	if (!pluginSettingTab.plugin.settings.timeParsing) {
		pluginSettingTab.plugin.settings.timeParsing = {
			enabled: true,
			supportedLanguages: ["en", "zh"],
			dateKeywords: {
				start: ["start", "begin", "from", "开始", "从"],
				due: ["due", "deadline", "by", "until", "截止", "到期", "之前"],
				scheduled: ["scheduled", "on", "at", "安排", "计划", "在"],
			},
			removeOriginalText: true,
			perLineProcessing: true,
			realTimeReplacement: true,
			timePatterns: {
				singleTime: [
					/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/g,
					/\b(1[0-2]|0?[1-9]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)\b/g,
				],
				timeRange: [
					/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*[-~～]\s*([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/g,
					/\b(1[0-2]|0?[1-9]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)?\s*[-~～]\s*(1[0-2]|0?[1-9]):([0-5]\d)(?::([0-5]\d))?\s*(AM|PM|am|pm)\b/g,
				],
				rangeSeparators: ["-", "~", "～", " - ", " ~ ", " ～ "],
			},
			timeDefaults: {
				preferredFormat: "24h" as const,
				defaultPeriod: "AM" as const,
				midnightCrossing: "next-day" as const,
			},
		} as EnhancedTimeParsingConfig;
	}

	// Enable Time Parsing
	new Setting(containerEl)
		.setName(t("Enable Time Parsing"))
		.setDesc(
			t(
				"Automatically parse natural language time expressions and specific times (12:00, 1:30 PM, 12:00-13:00)"
			)
		)
		.addToggle((toggle) =>
			toggle
				.setValue(pluginSettingTab.plugin.settings.timeParsing.enabled)
				.onChange(async (value) => {
					pluginSettingTab.plugin.settings.timeParsing.enabled = value;
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

	// Time Format Configuration
	containerEl.createEl("h3", { text: t("Time Format Configuration") });

	// Preferred Time Format
	new Setting(containerEl)
		.setName(t("Preferred Time Format"))
		.setDesc(t("Default format preference for ambiguous time expressions"))
		.addDropdown((dropdown) => {
			dropdown
				.addOption("12h", t("12-hour format (1:30 PM)"))
				.addOption("24h", t("24-hour format (13:30)"))
				.setValue(pluginSettingTab.plugin.settings.timeParsing.timeDefaults?.preferredFormat || "24h")
				.onChange(async (value: "12h" | "24h") => {
					if (!pluginSettingTab.plugin.settings.timeParsing.timeDefaults) {
						pluginSettingTab.plugin.settings.timeParsing.timeDefaults = {
							preferredFormat: value,
							defaultPeriod: "AM",
							midnightCrossing: "next-day",
						};
					} else {
						pluginSettingTab.plugin.settings.timeParsing.timeDefaults.preferredFormat = value;
					}
					pluginSettingTab.applySettingsUpdate();
				});
		});

	// Default AM/PM Period
	new Setting(containerEl)
		.setName(t("Default AM/PM Period"))
		.setDesc(t("Default period when AM/PM is ambiguous in 12-hour format"))
		.addDropdown((dropdown) => {
			dropdown
				.addOption("AM", t("AM (Morning)"))
				.addOption("PM", t("PM (Afternoon/Evening)"))
				.setValue(pluginSettingTab.plugin.settings.timeParsing.timeDefaults?.defaultPeriod || "AM")
				.onChange(async (value: "AM" | "PM") => {
					if (!pluginSettingTab.plugin.settings.timeParsing.timeDefaults) {
						pluginSettingTab.plugin.settings.timeParsing.timeDefaults = {
							preferredFormat: "24h",
							defaultPeriod: value,
							midnightCrossing: "next-day",
						};
					} else {
						pluginSettingTab.plugin.settings.timeParsing.timeDefaults.defaultPeriod = value;
					}
					pluginSettingTab.applySettingsUpdate();
				});
		});

	// Midnight Crossing Behavior
	new Setting(containerEl)
		.setName(t("Midnight Crossing Behavior"))
		.setDesc(t("How to handle time ranges that cross midnight (e.g., 23:00-01:00)"))
		.addDropdown((dropdown) => {
			dropdown
				.addOption("next-day", t("Next day (23:00 today - 01:00 tomorrow)"))
				.addOption("same-day", t("Same day (treat as error)"))
				.addOption("error", t("Show error"))
				.setValue(pluginSettingTab.plugin.settings.timeParsing.timeDefaults?.midnightCrossing || "next-day")
				.onChange(async (value: "next-day" | "same-day" | "error") => {
					if (!pluginSettingTab.plugin.settings.timeParsing.timeDefaults) {
						pluginSettingTab.plugin.settings.timeParsing.timeDefaults = {
							preferredFormat: "24h",
							defaultPeriod: "AM",
							midnightCrossing: value,
						};
					} else {
						pluginSettingTab.plugin.settings.timeParsing.timeDefaults.midnightCrossing = value;
					}
					pluginSettingTab.applySettingsUpdate();
				});
		});

	// Time Range Separators
	new Setting(containerEl)
		.setName(t("Time Range Separators"))
		.setDesc(t("Characters used to separate time ranges (comma-separated)"))
		.addTextArea((text) => {
			const separators = pluginSettingTab.plugin.settings.timeParsing.timePatterns?.rangeSeparators || ["-", "~", "～"];
			text.setValue(separators.join(", "))
				.setPlaceholder("-, ~, ～, ' - ', ' ~ '")
				.onChange(async (value) => {
					if (!pluginSettingTab.plugin.settings.timeParsing.timePatterns) {
						pluginSettingTab.plugin.settings.timeParsing.timePatterns = {
							singleTime: [],
							timeRange: [],
							rangeSeparators: value.split(",").map(s => s.trim()).filter(s => s.length > 0),
						};
					} else {
						pluginSettingTab.plugin.settings.timeParsing.timePatterns.rangeSeparators = 
							value.split(",").map(s => s.trim()).filter(s => s.length > 0);
					}
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
		// Date examples
		{ input: "go to bed tomorrow", output: "go to bed 📅 2025-01-05" },
		{ input: "meeting next week", output: "meeting 📅 2025-01-11" },
		{ input: "project due by Friday", output: "project 📅 2025-01-04" },
		{ input: "明天开会", output: "开会 📅 2025-01-05" },
		{ input: "3天后完成", output: "完成 📅 2025-01-07" },
		// Time examples
		{ input: "meeting at 2:30 PM", output: "meeting 📅 2025-01-04 ⏰ 14:30" },
		{ input: "workshop 9:00-17:00", output: "workshop 📅 2025-01-04 ⏰ 09:00-17:00" },
		{ input: "call scheduled 12:00", output: "call 📅 2025-01-04 ⏰ 12:00" },
		{ input: "lunch 12:00～13:00", output: "lunch 📅 2025-01-04 ⏰ 12:00-13:00" },
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
