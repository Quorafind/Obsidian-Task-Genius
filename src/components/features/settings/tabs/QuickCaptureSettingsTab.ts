import { Setting, Notice, TFile, TFolder } from "obsidian";
import { TaskProgressBarSettingTab } from "@/setting";
import { t } from "@/translations/helper";
import { FolderSuggest } from "@/components/ui/inputs/AutoComplete";
import type { QuickCaptureTemplateDefinition } from "@/common/setting-definition";

export function renderQuickCaptureSettingsTab(
	settingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement,
) {
	new Setting(containerEl).setName(t("Quick capture")).setHeading();

	new Setting(containerEl)
		.setName(t("Enable quick capture"))
		.setDesc(t("Toggle this to enable Org-mode style quick capture panel."))
		.addToggle((toggle) =>
			toggle
				.setValue(
					settingTab.plugin.settings.quickCapture.enableQuickCapture,
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.quickCapture.enableQuickCapture =
						value;
					settingTab.applySettingsUpdate();

					setTimeout(() => {
						settingTab.display();
					}, 200);
				}),
		);

	if (!settingTab.plugin.settings.quickCapture.enableQuickCapture) return;

	// Target type selection
	new Setting(containerEl)
		.setName(t("Target type"))
		.setDesc(t("Choose whether to capture to a fixed file or daily note"))
		.addDropdown((dropdown) =>
			dropdown
				.addOption("fixed", t("Fixed file"))
				.addOption("daily-note", t("Daily note"))
				.setValue(settingTab.plugin.settings.quickCapture.targetType)
				.onChange(async (value) => {
					settingTab.plugin.settings.quickCapture.targetType =
						value as "fixed" | "daily-note";
					settingTab.applySettingsUpdate();
					// Refresh the settings display to show/hide relevant options
					setTimeout(() => {
						settingTab.display();
					}, 100);
				}),
		);

	// Fixed file settings
	if (settingTab.plugin.settings.quickCapture.targetType === "fixed") {
		new Setting(containerEl)
			.setName(t("Target file"))
			.setDesc(
				t(
					"The file where captured text will be saved. You can include a path, e.g., 'folder/Quick Capture.md'. Supports date templates like {{DATE:YYYY-MM-DD}} or {{date:YYYY-MM-DD-HHmm}}",
				),
			)
			.addText((text) =>
				text
					.setValue(
						settingTab.plugin.settings.quickCapture.targetFile,
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.quickCapture.targetFile =
							value;
						settingTab.applySettingsUpdate();
					}),
			);
	}

	// Daily note settings
	if (settingTab.plugin.settings.quickCapture.targetType === "daily-note") {
		// Sync with daily notes plugin button
		new Setting(containerEl)
			.setName(t("Sync with Daily Notes plugin"))
			.setDesc(
				t("Automatically sync settings from the Daily Notes plugin"),
			)
			.addButton((button) =>
				button.setButtonText(t("Sync now")).onClick(async () => {
					try {
						// Get daily notes plugin settings
						const dailyNotesPlugin = (settingTab.app as any)
							.internalPlugins.plugins["daily-notes"];
						if (dailyNotesPlugin && dailyNotesPlugin.enabled) {
							const dailyNotesSettings =
								dailyNotesPlugin.instance?.options || {};

							console.log(dailyNotesSettings);

							settingTab.plugin.settings.quickCapture.dailyNoteSettings =
								{
									format:
										dailyNotesSettings.format ||
										"YYYY-MM-DD",
									folder: dailyNotesSettings.folder || "",
									template: dailyNotesSettings.template || "",
								};

							await settingTab.plugin.saveSettings();

							// Refresh the settings display
							setTimeout(() => {
								settingTab.display();
							}, 200);

							new Notice(
								t("Daily notes settings synced successfully"),
							);
						} else {
							new Notice(t("Daily Notes plugin is not enabled"));
						}
					} catch (error) {
						console.error(
							"Failed to sync daily notes settings:",
							error,
						);
						new Notice(t("Failed to sync daily notes settings"));
					}
				}),
			);

		new Setting(containerEl)
			.setName(t("Daily note format"))
			.setDesc(t("Date format for daily notes (e.g., YYYY-MM-DD)"))
			.addText((text) =>
				text
					.setValue(
						settingTab.plugin.settings.quickCapture
							.dailyNoteSettings?.format || "YYYY-MM-DD",
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.quickCapture.dailyNoteSettings.format =
							value;
						settingTab.applySettingsUpdate();
					}),
			);

		new Setting(containerEl)
			.setName(t("Daily note folder"))
			.setDesc(t("Folder path for daily notes (leave empty for root)"))
			.addText((text) =>
				text
					.setValue(
						settingTab.plugin.settings.quickCapture
							.dailyNoteSettings?.folder || "",
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.quickCapture.dailyNoteSettings.folder =
							value;
						settingTab.applySettingsUpdate();
					}),
			);

		new Setting(containerEl)
			.setName(t("Daily note template"))
			.setDesc(t("Template file path for new daily notes (optional)"))
			.addText((text) =>
				text
					.setValue(
						settingTab.plugin.settings.quickCapture
							.dailyNoteSettings?.template || "",
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.quickCapture.dailyNoteSettings.template =
							value;
						settingTab.applySettingsUpdate();
					}),
			);
	}

	// Target heading setting (for both types)
	new Setting(containerEl)
		.setName(t("Target heading"))
		.setDesc(
			t(
				"Optional heading to append content under (leave empty to append to file)",
			),
		)
		.addText((text) =>
			text
				.setValue(
					settingTab.plugin.settings.quickCapture.targetHeading || "",
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.quickCapture.targetHeading =
						value;
					settingTab.applySettingsUpdate();
				}),
		);

	new Setting(containerEl)
		.setName(t("Placeholder text"))
		.setDesc(t("Placeholder text to display in the capture panel"))
		.addText((text) =>
			text
				.setValue(settingTab.plugin.settings.quickCapture.placeholder)
				.onChange(async (value) => {
					settingTab.plugin.settings.quickCapture.placeholder = value;
					settingTab.applySettingsUpdate();
				}),
		);

	new Setting(containerEl)
		.setName(t("Append to file"))
		.setDesc(t("How to add captured content to the target location"))
		.addDropdown((dropdown) =>
			dropdown
				.addOption("append", t("Append"))
				.addOption("prepend", t("Prepend"))
				.addOption("replace", t("Replace"))
				.setValue(settingTab.plugin.settings.quickCapture.appendToFile)
				.onChange(async (value) => {
					settingTab.plugin.settings.quickCapture.appendToFile =
						value as "append" | "prepend" | "replace";
					settingTab.applySettingsUpdate();
				}),
		);

	// Task prefix setting
	new Setting(containerEl)
		.setName(t("Auto-add task prefix"))
		.setDesc(
			t("Automatically add task checkbox prefix to captured content"),
		)
		.addToggle((toggle) =>
			toggle
				.setValue(
					settingTab.plugin.settings.quickCapture.autoAddTaskPrefix ??
						true,
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.quickCapture.autoAddTaskPrefix =
						value;
					settingTab.applySettingsUpdate();
					// Refresh to show/hide the prefix format field
					setTimeout(() => {
						settingTab.display();
					}, 100);
				}),
		);

	// Custom task prefix
	if (settingTab.plugin.settings.quickCapture.autoAddTaskPrefix) {
		new Setting(containerEl)
			.setName(t("Task prefix format"))
			.setDesc(
				t(
					"The prefix to add before captured content (e.g., '- [ ]' for task, '- ' for list item)",
				),
			)
			.addText((text) =>
				text
					.setValue(
						settingTab.plugin.settings.quickCapture.taskPrefix ||
							"- [ ]",
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.quickCapture.taskPrefix =
							value || "- [ ]";
						settingTab.applySettingsUpdate();
					}),
			);
	}

	new Setting(containerEl).setName(t("Enhanced")).setHeading();

	// Keep open after capture
	new Setting(containerEl)
		.setName(t("Keep open after capture"))
		.setDesc(t("Keep the modal open after capturing content"))
		.addToggle((toggle) =>
			toggle
				.setValue(
					settingTab.plugin.settings.quickCapture
						.keepOpenAfterCapture || false,
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.quickCapture.keepOpenAfterCapture =
						value;
					settingTab.applySettingsUpdate();
				}),
		);

	// Remember last mode
	new Setting(containerEl)
		.setName(t("Remember last mode"))
		.setDesc(t("Remember the last used quick capture mode"))
		.addToggle((toggle) =>
			toggle
				.setValue(
					settingTab.plugin.settings.quickCapture.rememberLastMode ??
						true,
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.quickCapture.rememberLastMode =
						value;
					settingTab.applySettingsUpdate();
				}),
		);

	// File creation mode settings
	new Setting(containerEl).setName(t("File Creation Mode")).setHeading();

	// Initialize createFileMode if not exists and keep a local reference for type safety
	const createFileMode =
		(settingTab.plugin.settings.quickCapture.createFileMode ||= {
			defaultFolder: "",
			useTemplate: false,
			templateFile: "",
		});

	// Default folder for file creation
	new Setting(containerEl)
		.setName(t("Default folder for new files"))
		.setDesc(
			t(
				"Used by File mode (requires FileSource). Leave empty for vault root.",
			),
		)
		.addText((text) =>
			text
				.setValue(createFileMode.defaultFolder || "")
				.onChange(async (value) => {
					createFileMode.defaultFolder = value;
					settingTab.applySettingsUpdate();
				}),
		);

	// Use template for new files
	new Setting(containerEl)
		.setName(t("Use template for new files"))
		.setDesc(
			t(
				"When File mode is used, create the new note from a template and then insert the captured content.",
			),
		)
		.addToggle((toggle) =>
			toggle
				.setValue(createFileMode.useTemplate || false)
				.onChange(async (value) => {
					createFileMode.useTemplate = value;
					settingTab.applySettingsUpdate();
					// Refresh to show/hide template field
					setTimeout(() => {
						settingTab.display();
					}, 100);
				}),
		);

	if (createFileMode.useTemplate) {
		const templateFolderPath = (createFileMode.templateFolder || "").trim();
		const folderFile = templateFolderPath
			? settingTab.app.vault.getAbstractFileByPath(templateFolderPath)
			: null;
		const folderExists = folderFile instanceof TFolder;
		const templateFiles: TFile[] = [];

		if (folderExists) {
			const collectMarkdownFiles = (folder: TFolder) => {
				for (const child of folder.children) {
					if (child instanceof TFolder) {
						collectMarkdownFiles(child);
					} else if (
						child instanceof TFile &&
						child.extension.toLowerCase() === "md"
					) {
						templateFiles.push(child);
					}
				}
			};
			collectMarkdownFiles(folderFile);
			templateFiles.sort((a, b) => a.path.localeCompare(b.path));
		}

		new Setting(containerEl)
			.setName(t("Template folder"))
			.setDesc(
				folderExists || !templateFolderPath
					? t(
							"Folder that contains Quick Capture templates for File mode.",
						)
					: t("Selected folder was not found in the vault."),
			)
			.addText((text) => {
				text.setPlaceholder(t("Templates/Quick Capture"))
					.setValue(createFileMode.templateFolder || "")
					.onChange(async (value) => {
						const previous = createFileMode.templateFolder || "";
						const normalized = value.trim();
						createFileMode.templateFolder = normalized;
						if (previous !== normalized) {
							createFileMode.templateFile = "";
						}
						settingTab.applySettingsUpdate();
						setTimeout(() => {
							settingTab.display();
						}, 100);
					});

				new FolderSuggest(
					settingTab.app,
					text.inputEl,
					settingTab.plugin,
					"single",
				);
			});

		new Setting(containerEl)
			.setName(t("Template note"))
			.setDesc(
				!templateFolderPath
					? t(
							"Select a template folder above to enable the dropdown.",
						)
					: !folderExists
						? t(
								"Template folder is invalid; update the folder to continue.",
							)
						: templateFiles.length > 0
							? t(
									"Choose the note that should be copied; {{CONTENT}} placeholders are replaced, otherwise the captured text is appended.",
								)
							: t(
									"No markdown notes were found in the selected folder.",
								),
			)
			.addDropdown((dropdown) => {
				dropdown.addOption("", t("None"));

				const existingTemplate = createFileMode.templateFile || "";
				if (
					existingTemplate &&
					!templateFiles.some(
						(file) => file.path === existingTemplate,
					)
				) {
					dropdown.addOption(existingTemplate, existingTemplate);
				}

				for (const file of templateFiles) {
					dropdown.addOption(file.path, file.basename);
				}

				dropdown.setValue(createFileMode.templateFile || "");
				dropdown.onChange(async (value) => {
					createFileMode.templateFile = value;
					settingTab.applySettingsUpdate();
				});

				if (!templateFiles.length || !folderExists) {
					dropdown.selectEl.disabled = true;
				}
			});
	}

	// Write content tags (#tags) to frontmatter
	new Setting(containerEl)
		.setName(t("Write content tags to frontmatter"))
		.setDesc(
			t(
				"If enabled, #tags in the editor content are written into YAML frontmatter tags (merged and deduplicated)",
			),
		)
		.addToggle((toggle) =>
			toggle
				.setValue(createFileMode.writeContentTagsToFrontmatter || false)
				.onChange(async (value) => {
					createFileMode.writeContentTagsToFrontmatter = value;
					settingTab.applySettingsUpdate();
				}),
		);

	// Default file name template (File mode)
	new Setting(containerEl)
		.setName(t("Default file name template"))
		.setDesc(
			t(
				"Used by File mode to prefill the file name input (supports date templates like {{DATE:YYYY-MM-DD}})",
			),
		)
		.addText((text) =>
			text
				.setValue(
					settingTab.plugin.settings.quickCapture
						.defaultFileNameTemplate ||
						"{{DATE:YYYY-MM-DD}} - Task",
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.quickCapture.defaultFileNameTemplate =
						value;
					settingTab.applySettingsUpdate();
				}),
		);

	// File name templates management
	new Setting(containerEl)
		.setName(t("Quick Name Templates"))
		.setDesc(
			t("Manage file name templates for quick selection in File mode"),
		);

	const defaultTemplates: QuickCaptureTemplateDefinition[] = [
		{ name: "Daily Note", template: "{{DATE:YYYY-MM-DD}}" },
		{ name: "Meeting", template: "{{DATE:YYYY-MM-DD}} - Meeting" },
		{ name: "Task", template: "{{DATE:YYYY-MM-DD}} - Task" },
		{ name: "Project", template: "Project - {{DATE:YYYY-MM}}" },
		{ name: "Notes", template: "Notes - {{DATE:YYYY-MM-DD-HHmm}}" },
	];

	const rawTemplates = settingTab.plugin.settings.quickCapture
		.fileNameTemplates as unknown;
	let templates: QuickCaptureTemplateDefinition[];
	let templatesUpdated = false;

	if (Array.isArray(rawTemplates)) {
		const hasInvalidEntries = rawTemplates.some(
			(item) =>
				!item ||
				typeof item !== "object" ||
				typeof (item as { template?: unknown }).template !== "string",
		);

		if (hasInvalidEntries) {
			templates = (rawTemplates as unknown[]).map((item) => {
				if (typeof item === "string") {
					return { name: item, template: item };
				}

				const rawTemplate = (item as { template?: unknown }).template;
				const templateValue =
					typeof rawTemplate === "string" ? rawTemplate : "";

				const rawName = (item as { name?: unknown }).name;
				const nameValue =
					typeof rawName === "string" && rawName.length > 0
						? rawName
						: templateValue;

				return { name: nameValue, template: templateValue };
			});
			templatesUpdated = true;
		} else {
			templates = rawTemplates as QuickCaptureTemplateDefinition[];
		}
	} else {
		templates = defaultTemplates.map((item) => ({ ...item }));
		templatesUpdated = true;
	}

	if (templatesUpdated) {
		settingTab.plugin.settings.quickCapture.fileNameTemplates = templates;
		settingTab.applySettingsUpdate();
	}

	const templatesContainer = containerEl.createDiv({
		cls: "file-name-templates-container",
	});

	const saveTemplates = () => {
		settingTab.plugin.settings.quickCapture.fileNameTemplates = templates;
		settingTab.applySettingsUpdate();
	};

	const refreshTemplates = () => {
		templatesContainer.empty();

		templates.forEach((template, index) => {
			const templateSetting = new Setting(templatesContainer);

			templateSetting.addText((text) => {
				text.setValue(template.name || "")
					.setPlaceholder(t("Enter file name..."))
					.onChange(async (value) => {
						template.name = value;
						saveTemplates();
					});
			});

			templateSetting.addText((text) => {
				text.setValue(template.template || "")
					.setPlaceholder(t("Enter template..."))
					.onChange(async (value) => {
						template.template = value;
						saveTemplates();
					});
			});

			templateSetting.addExtraButton((button) =>
				button
					.setIcon("trash")
					.setTooltip(t("Remove"))
					.onClick(async () => {
						templates.splice(index, 1);
						saveTemplates();
						refreshTemplates();
					}),
			);
		});

		new Setting(templatesContainer).addButton((button) =>
			button.setButtonText(t("Add Template")).onClick(async () => {
				templates.push({
					name: "",
					template: "{{DATE:YYYY-MM-DD}} - Task",
				});
				saveTemplates();
				refreshTemplates();
			}),
		);
	};

	refreshTemplates();

	// Template file path

	// Minimal mode settings
	new Setting(containerEl).setName(t("Minimal Mode")).setHeading();

	new Setting(containerEl)
		.setName(t("Enable minimal mode"))
		.setDesc(
			t(
				"Enable simplified single-line quick capture with inline suggestions",
			),
		)
		.addToggle((toggle) =>
			toggle
				.setValue(
					settingTab.plugin.settings.quickCapture.enableMinimalMode,
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.quickCapture.enableMinimalMode =
						value;
					settingTab.applySettingsUpdate();
					// Refresh the settings display to show/hide minimal mode options
					setTimeout(() => {
						settingTab.display();
					}, 100);
				}),
		);

	if (!settingTab.plugin.settings.quickCapture.enableMinimalMode) return;

	if (!settingTab.plugin.settings.quickCapture.minimalModeSettings) {
		settingTab.plugin.settings.quickCapture.minimalModeSettings = {
			suggestTrigger: "/",
		};
	}

	// Suggest trigger character
	new Setting(containerEl)
		.setName(t("Suggest trigger character"))
		.setDesc(t("Character to trigger the suggestion menu"))
		.addText((text) =>
			text
				.setValue(
					settingTab.plugin.settings.quickCapture.minimalModeSettings
						.suggestTrigger,
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.quickCapture.minimalModeSettings.suggestTrigger =
						value || "/";
					settingTab.applySettingsUpdate();
				}),
		);
}
