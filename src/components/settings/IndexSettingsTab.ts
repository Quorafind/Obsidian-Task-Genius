import { Setting, Notice } from "obsidian";
import { TaskProgressBarSettingTab } from "../../setting";
import { t } from "../../translations/helper";
import { SingleFolderSuggest } from "../AutoComplete";
import { ConfirmModal } from "../ConfirmModal";

/**
 * Renders the Index Settings tab that consolidates all indexing-related settings
 * including Inline Tasks, File Tasks, and Project detection
 */
export function renderIndexSettingsTab(
	settingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement,
) {
	// Main heading
	new Setting(containerEl)
		.setName(t("Index & Task Source Configuration"))
		.setDesc(
			t(
				"Configure how Task Genius discovers and indexes tasks from various sources including inline tasks, file metadata, and projects.",
			),
		)
		.setHeading();

	// ========================================
	// SECTION 1: Inline Task Configuration
	// ========================================
	new Setting(containerEl)
		.setName(t("Inline task parsing"))
		.setDesc(t("Configure how tasks are parsed from markdown content."))
		.setHeading();

	new Setting(containerEl)
		.setName(t("Enable Task Genius indexer"))
		.setDesc(
			t(
				"Enable the Task Genius indexer to scan and index tasks from your entire vault. This is required for task views and search functionality.",
			),
		)
		.addToggle((toggle) => {
			toggle.setValue(settingTab.plugin.settings.enableIndexer);
			toggle.onChange((value) => {
				settingTab.plugin.settings.enableIndexer = value;
				if (!value) {
					// If indexer is disabled, also disable views
					settingTab.plugin.settings.enableView = false;
				}
				settingTab.applySettingsUpdate();
				settingTab.display(); // Refresh settings display
			});
		});

	new Setting(containerEl)
		.setName(t("Prefer metadata format of task"))
		.setDesc(
			t(
				"You can choose dataview format or tasks format, that will influence both index and save format.",
			),
		)
		.addDropdown((dropdown) => {
			dropdown
				.addOption("dataview", "Dataview")
				.addOption("tasks", "Tasks")
				.setValue(settingTab.plugin.settings.preferMetadataFormat)
				.onChange(async (value) => {
					settingTab.plugin.settings.preferMetadataFormat = value as
						| "dataview"
						| "tasks";
					settingTab.applySettingsUpdate();
					// Re-render the settings to update prefix configuration UI
					setTimeout(() => {
						settingTab.display();
					}, 200);
				});
		});

	// Date Format Configuration
	new Setting(containerEl)
		.setName(t("Enable custom date formats"))
		.setDesc(
			t(
				"Enable custom date format patterns for parsing dates. When enabled, the parser will try your custom formats before falling back to default formats.",
			),
		)
		.addToggle((toggle) => {
			toggle
				.setValue(
					settingTab.plugin.settings.enableCustomDateFormats ?? false,
				)
				.onChange((value) => {
					settingTab.plugin.settings.enableCustomDateFormats = value;
					settingTab.applySettingsUpdate();
					settingTab.display(); // Refresh to show/hide custom formats settings
				});
		});

	if (settingTab.plugin.settings.enableCustomDateFormats) {
		// Container for custom date formats
		const dateFormatsContainer = containerEl.createDiv({
			cls: "task-genius-date-formats-container",
		});

		// Header with description
		dateFormatsContainer.createEl("h3", {
			text: t("Custom date formats"),
			cls: "task-genius-formats-header",
		});

		dateFormatsContainer.createEl("p", {
			text: t(
				"Add custom date format patterns. Date patterns: yyyy (4-digit year), yy (2-digit year), MM (2-digit month), M (1-2 digit month), dd (2-digit day), d (1-2 digit day), MMM (short month name), MMMM (full month name). Time patterns: HH (2-digit hour), mm (2-digit minute), ss (2-digit second). Use single quotes for literals (e.g., 'T' for ISO format).",
			),
			cls: "setting-item-description",
		});

		// Container for format list
		const formatListContainer = dateFormatsContainer.createDiv({
			cls: "task-genius-format-list",
		});

		// Function to render the format list
		const renderFormatList = () => {
			formatListContainer.empty();

			const formats = settingTab.plugin.settings.customDateFormats ?? [];

			// Render existing formats
			formats.forEach((format, index) => {
				const formatItem = formatListContainer.createDiv({
					cls: "task-genius-format-item",
				});

				// Format input
				const formatInput = formatItem.createEl("input", {
					type: "text",
					value: format,
					cls: "task-genius-format-input",
					placeholder: t(
						"Enter date format (e.g., yyyy-MM-dd or yyyyMMdd_HHmmss)",
					),
				});

				formatInput.addEventListener("input", (e) => {
					const target = e.target as HTMLInputElement;
					settingTab.plugin.settings.customDateFormats![index] =
						target.value.trim();
					settingTab.applySettingsUpdate();
				});

				// Delete button
				const deleteBtn = formatItem.createEl("button", {
					cls: "task-genius-format-delete-btn",
					text: "×",
					attr: {
						"aria-label": t("Delete format"),
						title: t("Delete this format"),
					},
				});

				deleteBtn.addEventListener("click", () => {
					settingTab.plugin.settings.customDateFormats!.splice(
						index,
						1,
					);
					settingTab.applySettingsUpdate();
					renderFormatList();
				});
			});

			// Add new format button
			const addFormatBtn = formatListContainer.createEl("button", {
				cls: "task-genius-add-format-btn",
				text: t("+ Add Date Format"),
			});

			addFormatBtn.addEventListener("click", () => {
				if (!settingTab.plugin.settings.customDateFormats) {
					settingTab.plugin.settings.customDateFormats = [];
				}
				settingTab.plugin.settings.customDateFormats.push("");
				settingTab.applySettingsUpdate();
				renderFormatList();

				// Focus on the new input
				const inputs = formatListContainer.querySelectorAll(
					".task-genius-format-input",
				);
				const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
				if (lastInput) {
					lastInput.focus();
				}
			});
		};

		// Initial render
		renderFormatList();

		// Add example dates section
		const examplesContainer = containerEl.createDiv({
			cls: "task-genius-date-examples",
		});

		examplesContainer.createEl("h4", {
			text: t("Format Examples:"),
			cls: "task-genius-examples-header",
		});

		const exampleFormats = [
			{ format: "yyyy-MM-dd", example: "2025-08-16" },
			{ format: "dd/MM/yyyy", example: "16/08/2025" },
			{ format: "MM-dd-yyyy", example: "08-16-2025" },
			{ format: "yyyy.MM.dd", example: "2025.08.16" },
			{ format: "yyyyMMdd", example: "20250816" },
			{ format: "yyyyMMdd_HHmmss", example: "20250816_144403" },
			{ format: "yyyyMMddHHmmss", example: "20250816144403" },
			{ format: "yyyy-MM-dd'T'HH:mm", example: "2025-08-16T14:44" },
			{ format: "dd MMM yyyy", example: "16 Aug 2025" },
			{ format: "MMM dd, yyyy", example: "Aug 16, 2025" },
			{ format: "yyyy年MM月dd日", example: "2025年08月16日" },
		];

		const table = examplesContainer.createEl("table", {
			cls: "task-genius-date-examples-table",
		});

		const headerRow = table.createEl("tr");
		headerRow.createEl("th", { text: t("Format Pattern") });
		headerRow.createEl("th", { text: t("Example") });

		exampleFormats.forEach(({ format, example }) => {
			const row = table.createEl("tr");
			row.createEl("td", { text: format });
			row.createEl("td", { text: example });
		});
	}

	// Get current metadata format to show appropriate settings
	const isDataviewFormat =
		settingTab.plugin.settings.preferMetadataFormat === "dataview";

	// Project tag prefix
	new Setting(containerEl)
		.setName(t("Project tag prefix"))
		.setDesc(
			isDataviewFormat
				? t(
						"Customize the prefix used for project tags in dataview format (e.g., 'project' for [project:: myproject]). Changes require reindexing.",
					)
				: t(
						"Customize the prefix used for project tags (e.g., 'project' for #project/myproject). Changes require reindexing.",
					),
		)
		.addText((text) => {
			text.setPlaceholder("project")
				.setValue(
					settingTab.plugin.settings.projectTagPrefix[
						settingTab.plugin.settings.preferMetadataFormat
					],
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.projectTagPrefix[
						settingTab.plugin.settings.preferMetadataFormat
					] = value || "project";
					settingTab.applySettingsUpdate();
				});
		});

	// Context tag prefix with special handling
	new Setting(containerEl)
		.setName(t("Context tag prefix"))
		.setDesc(
			isDataviewFormat
				? t(
						"Customize the prefix used for context tags in dataview format (e.g., 'context' for [context:: home]). Changes require reindexing.",
					)
				: t(
						"Customize the prefix used for context tags (e.g., '@home' for @home). Changes require reindexing.",
					),
		)
		.addText((text) => {
			text.setPlaceholder("context")
				.setValue(
					settingTab.plugin.settings.contextTagPrefix[
						settingTab.plugin.settings.preferMetadataFormat
					],
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.contextTagPrefix[
						settingTab.plugin.settings.preferMetadataFormat
					] = value || (isDataviewFormat ? "context" : "@");
					settingTab.applySettingsUpdate();
				});
		});

	new Setting(containerEl)
		.setName(t("Ignore all tasks behind heading"))
		.setDesc(
			t(
				"Enter the heading to ignore, e.g. '## Project', '## Inbox', separated by comma",
			),
		)
		.addText((text) => {
			text.setValue(settingTab.plugin.settings.ignoreHeading);
			text.onChange((value) => {
				settingTab.plugin.settings.ignoreHeading = value;
				settingTab.applySettingsUpdate();
			});
		});

	new Setting(containerEl)
		.setName(t("Focus all tasks behind heading"))
		.setDesc(
			t(
				"Enter the heading to focus, e.g. '## Project', '## Inbox', separated by comma",
			),
		)
		.addText((text) => {
			text.setValue(settingTab.plugin.settings.focusHeading);
			text.onChange((value) => {
				settingTab.plugin.settings.focusHeading = value;
				settingTab.applySettingsUpdate();
			});
		});

	new Setting(containerEl)
		.setName(t("Use daily note path as date"))
		.setDesc(
			t(
				"If enabled, the daily note path will be used as the date for tasks.",
			),
		)
		.addToggle((toggle) => {
			toggle.setValue(settingTab.plugin.settings.useDailyNotePathAsDate);
			toggle.onChange((value) => {
				settingTab.plugin.settings.useDailyNotePathAsDate = value;
				settingTab.applySettingsUpdate();

				setTimeout(() => {
					settingTab.display();
				}, 200);
			});
		});

	if (settingTab.plugin.settings.useDailyNotePathAsDate) {
		const descFragment = document.createDocumentFragment();
		descFragment.createEl("div", {
			text: t(
				"Task Genius will use moment.js and also this format to parse the daily note path.",
			),
		});
		descFragment.createEl("div", {
			text: t(
				"You need to set `yyyy` instead of `YYYY` in the format string. And `dd` instead of `DD`.",
			),
		});
		new Setting(containerEl)
			.setName(t("Daily note format"))
			.setDesc(descFragment)
			.addText((text) => {
				text.setValue(settingTab.plugin.settings.dailyNoteFormat);
				text.onChange((value) => {
					settingTab.plugin.settings.dailyNoteFormat = value;
					settingTab.applySettingsUpdate();
				});
			});

		new Setting(containerEl)
			.setName(t("Daily note path"))
			.setDesc(t("Select the folder that contains the daily note."))
			.addText((text) => {
				new SingleFolderSuggest(
					settingTab.app,
					text.inputEl,
					settingTab.plugin,
				);
				text.setValue(settingTab.plugin.settings.dailyNotePath);
				text.onChange((value) => {
					settingTab.plugin.settings.dailyNotePath = value;
					settingTab.applySettingsUpdate();
				});
			});

		new Setting(containerEl)
			.setName(t("Use as date type"))
			.setDesc(
				t(
					"You can choose due, start, or scheduled as the date type for tasks.",
				),
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption("due", t("Due"))
					.addOption("start", t("Start"))
					.addOption("scheduled", t("Scheduled"))
					.setValue(settingTab.plugin.settings.useAsDateType)
					.onChange(async (value) => {
						settingTab.plugin.settings.useAsDateType = value as
							| "due"
							| "start"
							| "scheduled";
						settingTab.applySettingsUpdate();
					});
			});
	}

	// ========================================
	// SECTION 2: File Task Configuration
	// ========================================
	new Setting(containerEl)
		.setName(t("File Task Configuration"))
		.setDesc(
			t("Configure how to extract tasks from file metadata and tags."),
		)
		.setHeading();

	new Setting(containerEl)
		.setName(t("Enable file metadata parsing"))
		.setDesc(
			t(
				"Parse tasks from file frontmatter metadata fields. When enabled, files with specific metadata fields will be treated as tasks.",
			),
		)
		.addToggle((toggle) => {
			toggle.setValue(
				settingTab.plugin.settings.fileParsingConfig
					.enableFileMetadataParsing,
			);
			toggle.onChange(async (value) => {
				const previousValue =
					settingTab.plugin.settings.fileParsingConfig
						.enableFileMetadataParsing;
				settingTab.plugin.settings.fileParsingConfig.enableFileMetadataParsing =
					value;
				settingTab.applySettingsUpdate();

				// If file metadata parsing was just enabled, trigger a full reindex
				if (!previousValue && value && settingTab.plugin.taskManager) {
					try {
						new Notice(
							t(
								"File metadata parsing enabled. Rebuilding task index...",
							),
						);
						await settingTab.plugin.taskManager.forceReindex();
						new Notice(t("Task index rebuilt successfully"));
					} catch (error) {
						console.error(
							"Failed to reindex after enabling file metadata parsing:",
							error,
						);
						new Notice(t("Failed to rebuild task index"));
					}
				}

				settingTab.display(); // Refresh to show/hide related settings
			});
		});

	if (
		settingTab.plugin.settings.fileParsingConfig.enableFileMetadataParsing
	) {
		new Setting(containerEl)
			.setName(t("Metadata fields to parse as tasks"))
			.setDesc(
				t(
					"Comma-separated list of metadata fields that should be treated as tasks (e.g., dueDate, todo, complete, task)",
				),
			)
			.addText((text) => {
				text.setPlaceholder("dueDate, todo, complete, task")
					.setValue(
						settingTab.plugin.settings.fileParsingConfig.metadataFieldsToParseAsTasks.join(
							", ",
						),
					)
					.onChange((value) => {
						settingTab.plugin.settings.fileParsingConfig.metadataFieldsToParseAsTasks =
							value
								.split(",")
								.map((field) => field.trim())
								.filter((field) => field.length > 0);
						settingTab.applySettingsUpdate();
					});
			});

		new Setting(containerEl)
			.setName(t("Task content from metadata"))
			.setDesc(
				t(
					"Which metadata field to use as task content. If not found, will use filename.",
				),
			)
			.addText((text) => {
				text.setPlaceholder("title")
					.setValue(
						settingTab.plugin.settings.fileParsingConfig
							.taskContentFromMetadata,
					)
					.onChange((value) => {
						settingTab.plugin.settings.fileParsingConfig.taskContentFromMetadata =
							value || "title";
						settingTab.applySettingsUpdate();
					});
			});

		new Setting(containerEl)
			.setName(t("Default task status"))
			.setDesc(
				t(
					"Default status for tasks created from metadata (space for incomplete, x for complete)",
				),
			)
			.addText((text) => {
				text.setPlaceholder(" ")
					.setValue(
						settingTab.plugin.settings.fileParsingConfig
							.defaultTaskStatus,
					)
					.onChange((value) => {
						settingTab.plugin.settings.fileParsingConfig.defaultTaskStatus =
							value || " ";
						settingTab.applySettingsUpdate();
					});
			});
	}

	new Setting(containerEl)
		.setName(t("Enable tag-based task parsing"))
		.setDesc(
			t(
				"Parse tasks from file tags. When enabled, files with specific tags will be treated as tasks.",
			),
		)
		.addToggle((toggle) => {
			toggle.setValue(
				settingTab.plugin.settings.fileParsingConfig
					.enableTagBasedTaskParsing,
			);
			toggle.onChange((value) => {
				settingTab.plugin.settings.fileParsingConfig.enableTagBasedTaskParsing =
					value;
				settingTab.applySettingsUpdate();
				settingTab.display(); // Refresh to show/hide related settings
			});
		});

	if (
		settingTab.plugin.settings.fileParsingConfig.enableTagBasedTaskParsing
	) {
		new Setting(containerEl)
			.setName(t("Tags to parse as tasks"))
			.setDesc(
				t(
					"Comma-separated list of tags that should be treated as tasks (e.g., #todo, #task, #action, #due)",
				),
			)
			.addText((text) => {
				text.setPlaceholder("#todo, #task, #action, #due")
					.setValue(
						settingTab.plugin.settings.fileParsingConfig.tagsToParseAsTasks.join(
							", ",
						),
					)
					.onChange((value) => {
						settingTab.plugin.settings.fileParsingConfig.tagsToParseAsTasks =
							value
								.split(",")
								.map((tag) => tag.trim())
								.filter((tag) => tag.length > 0);
						settingTab.applySettingsUpdate();
					});
			});
	}

	// FileSource Settings Integration
	if (settingTab.plugin.settings.fileSource) {
		new Setting(containerEl)
			.setName(t("Enable FileSource feature"))
			.setDesc(
				t(
					"Enable FileSource to recognize files as tasks based on metadata properties. Files can serve dual roles as both Projects and Tasks.",
				),
			)
			.addToggle((toggle) => {
				toggle
					.setValue(settingTab.plugin.settings.fileSource.enabled)
					.onChange(async (value) => {
						settingTab.plugin.settings.fileSource.enabled = value;
						settingTab.applySettingsUpdate();
						settingTab.display();
					});
			});

		if (settingTab.plugin.settings.fileSource.enabled) {
			// Metadata recognition settings
			new Setting(containerEl)
				.setName(t("FileSource: Metadata-based recognition"))
				.setDesc(
					t(
						"Recognize files as tasks when they contain specific metadata fields",
					),
				)
				.addToggle((toggle) => {
					toggle
						.setValue(
							settingTab.plugin.settings.fileSource
								.recognitionStrategies.metadata.enabled,
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.fileSource.recognitionStrategies.metadata.enabled =
								value;
							settingTab.applySettingsUpdate();
						});
				});

			// Tag recognition settings
			new Setting(containerEl)
				.setName(t("FileSource: Tag-based recognition"))
				.setDesc(
					t(
						"Recognize files as tasks when they contain specific tags",
					),
				)
				.addToggle((toggle) => {
					toggle
						.setValue(
							settingTab.plugin.settings.fileSource
								.recognitionStrategies.tags.enabled,
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.fileSource.recognitionStrategies.tags.enabled =
								value;
							settingTab.applySettingsUpdate();
						});
				});
		}
	}

	// ========================================
	// SECTION 3: Performance Settings
	// ========================================
	new Setting(containerEl)
		.setName(t("Performance Configuration"))
		.setDesc(t("Configure performance-related indexing settings"))
		.setHeading();

	new Setting(containerEl)
		.setName(t("Enable worker processing"))
		.setDesc(
			t(
				"Use background worker for file parsing to improve performance. Recommended for large vaults.",
			),
		)
		.addToggle((toggle) => {
			toggle.setValue(
				settingTab.plugin.settings.fileParsingConfig
					.enableWorkerProcessing,
			);
			toggle.onChange((value) => {
				settingTab.plugin.settings.fileParsingConfig.enableWorkerProcessing =
					value;
				settingTab.applySettingsUpdate();
			});
		});

	// ========================================
	// SECTION 5: Index Maintenance
	// ========================================
	new Setting(containerEl)
		.setName(t("Index Maintenance"))
		.setDesc(t("Tools for managing and rebuilding the task index"))
		.setHeading();

	new Setting(containerEl)
		.setName(t("Rebuild index"))
		.setDesc(
			t(
				"Force a complete rebuild of the task index. Use this if you notice missing or incorrect tasks.",
			),
		)
		.setClass("mod-warning")
		.addButton((button) => {
			button.setButtonText(t("Rebuild")).onClick(async () => {
				new ConfirmModal(settingTab.plugin, {
					title: t("Reindex"),
					message: t(
						"Are you sure you want to force reindex all tasks?",
					),
					confirmText: t("Reindex"),
					cancelText: t("Cancel"),
					onConfirm: async (confirmed: boolean) => {
						if (!confirmed) return;
						try {
							new Notice(
								t(
									"Clearing task cache and rebuilding index...",
								),
							);
							await settingTab.plugin.taskManager.forceReindex();
							new Notice(t("Task index completely rebuilt"));
						} catch (error) {
							console.error(
								"Failed to force reindex tasks:",
								error,
							);
							new Notice(t("Failed to force reindex tasks"));
						}
					},
				}).open();
			});
		});
}
