import { Setting, Notice, setIcon } from "obsidian";
import { TaskProgressBarSettingTab } from "@/setting";
import { t } from "@/translations/helper";
import { SingleFolderSuggest } from "@/components/ui/inputs/AutoComplete";
import { ConfirmModal } from "@/components/ui/modals/ConfirmModal";
import { ListConfigModal } from "@/components/ui/modals/ListConfigModal";
import { createFileSourceSettings } from "../components/FileSourceSettingsSection";
import type {
	FileFilterScopeControls,
	TaskProgressBarSettings,
} from "@/common/setting-definition";
import { FileSourceConfiguration } from "@/types/file-source";

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
	// SECTION 0: Core Architecture Configuration
	// ========================================
	new Setting(containerEl)
		.setName(t("Enable Indexer"))
		.addToggle((toggle) => {
			toggle.setValue(settingTab.plugin.settings.enableIndexer ?? true);
			toggle.onChange(async (value) => {
				settingTab.plugin.settings.enableIndexer = value;
				settingTab.applySettingsUpdate();
				settingTab.display(); // Refresh settings display

				// Show restart notice
				new Notice(
					t(
						"Please restart Obsidian for the Indexer change to take effect.",
					),
					8000,
				);
			});
		});

	// ========================================
	// SECTION 1: Task Source Configuration
	// ========================================
	const scopeControls = ensureScopeControls(settingTab.plugin.settings);

	const taskSourceWrapper = containerEl.createDiv({
		cls: "tg-index-task-source-wrapper",
	});
	const switcherRow = taskSourceWrapper.createDiv({
		cls: "fluent-view-tabs tg-index-task-source-switcher",
	});
	const inlineSwitcherButton = switcherRow.createEl("button", {
		cls: "fluent-view-tab clickable-icon",
	});
	const inlineTabIcon = inlineSwitcherButton.createSpan({
		cls: "fluent-view-tab-icon",
	});
	setIcon(inlineTabIcon, "check-square");
	inlineSwitcherButton
		.createSpan({ cls: "fluent-view-tab-label" })
		.setText(t("Checkbox Tasks"));

	const fileSwitcherButton = switcherRow.createEl("button", {
		cls: "fluent-view-tab clickable-icon",
	});
	const fileTabIcon = fileSwitcherButton.createSpan({
		cls: "fluent-view-tab-icon",
	});
	setIcon(fileTabIcon, "file-text");
	fileSwitcherButton
		.createSpan({ cls: "fluent-view-tab-label" })
		.setText(t("File Tasks"));

	const sourcePanels = taskSourceWrapper.createDiv({
		cls: "tg-index-task-source-panels",
	});
	const inlineContainer = sourcePanels.createDiv({
		cls: "tg-index-task-source-panel",
	});
	const fileContainer = sourcePanels.createDiv({
		cls: "tg-index-task-source-panel",
	});

	// Inline task configuration content is rendered into inlineContainer
	(() => {
		let containerEl: HTMLElement = inlineContainer;
		const inlineContentEnabled = scopeControls.inlineTasksEnabled !== false;

		new Setting(containerEl)
			.setName(t("Enable checkbox tasks"))
			.setDesc(
				t(
					"Index markdown checkbox tasks. Disable this if you only want to use file-based or external task sources.",
				),
			)
			.addToggle((toggle) => {
				toggle.setValue(inlineContentEnabled);
				toggle.onChange((value) => {
					const controls = ensureScopeControls(
						settingTab.plugin.settings,
					);
					controls.inlineTasksEnabled = value;
					settingTab.applySettingsUpdate();
					if (!value) {
						new Notice(
							t(
								"Checkbox task indexing disabled. The index will prune inline tasks shortly.",
							),
							6000,
						);
					}
					updateInlineBodyState(value);
				});
			});

		const inlineBodyEl = containerEl.createDiv({
			cls: "tg-source-settings-body",
		});
		const updateInlineBodyState = (enabled: boolean) => {
			inlineBodyEl.classList.toggle("tg-source-disabled", !enabled);
		};
		updateInlineBodyState(inlineContentEnabled);
		containerEl = inlineBodyEl;

		new Setting(containerEl)
			.setName(t("Inline task parsing"))
			.setDesc(t("Configure how tasks are parsed from markdown content."))
			.setHeading();

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
						settingTab.plugin.settings.preferMetadataFormat =
							value as "dataview" | "tasks";
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
						settingTab.plugin.settings.enableCustomDateFormats ??
							false,
					)
					.onChange((value) => {
						settingTab.plugin.settings.enableCustomDateFormats =
							value;
						settingTab.applySettingsUpdate();
						settingTab.display(); // Refresh to show/hide custom formats settings
					});
			});

		if (settingTab.plugin.settings.enableCustomDateFormats) {
			new Setting(containerEl)
				.setName(t("Custom date formats"))
				.setDesc(t("Configure custom date format patterns."))
				.addButton((button) => {
					const getCustomFormats = () => {
						return (
							settingTab.plugin.settings.customDateFormats ?? []
						);
					};

					const updateButtonText = () => {
						const formats = getCustomFormats();
						if (formats.length === 0) {
							button.setButtonText(t("Configure Date Formats"));
						} else {
							button.setButtonText(
								t("{{count}} format(s) configured", {
									interpolation: {
										count: formats.length.toString(),
									},
								}),
							);
						}
					};

					updateButtonText();
					button.onClick(() => {
						new ListConfigModal(settingTab.plugin, {
							title: t("Configure Custom Date Formats"),
							description: t(
								"Add custom date format patterns. Date patterns: yyyy (4-digit year), yy (2-digit year), MM (2-digit month), M (1-2 digit month), dd (2-digit day), d (1-2 digit day), MMM (short month name), MMMM (full month name). Time patterns: HH (2-digit hour), mm (2-digit minute), ss (2-digit second). Use single quotes for literals (e.g., 'T' for ISO format).",
							),
							placeholder: t(
								"Enter date format (e.g., yyyy-MM-dd or yyyyMMdd_HHmmss)",
							),
							values: getCustomFormats(),
							onSave: (values) => {
								settingTab.plugin.settings.customDateFormats =
									values;
								settingTab.applySettingsUpdate();
								updateButtonText();
								new Notice(
									t(
										"Date formats updated. The parser will now recognize these custom formats.",
									),
									6000,
								);
							},
						}).open();
					});
				});

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
					"Configure headings to ignore. Tasks under these headings will be excluded from indexing.",
				),
			)
			.addButton((button) => {
				const getIgnoreHeadings = () => {
					const value =
						settingTab.plugin.settings.ignoreHeading || "";
					return value
						.split(",")
						.map((h) => h.trim())
						.filter((h) => h);
				};

				const updateButtonText = () => {
					const headings = getIgnoreHeadings();
					if (headings.length === 0) {
						button.setButtonText(t("Configure Ignore Headings"));
					} else {
						button.setButtonText(
							t("{{count}} heading(s) configured", {
								interpolation: {
									count: headings.length.toString(),
								},
							}),
						);
					}
				};

				updateButtonText();
				button.onClick(() => {
					new ListConfigModal(settingTab.plugin, {
						title: t("Configure Ignore Headings"),
						description: t(
							"Add headings to ignore. Tasks under these headings will be excluded from indexing. Examples: '## Project', '## Inbox', '# Archive'",
						),
						placeholder: t("Enter heading (e.g., ## Inbox)"),
						values: getIgnoreHeadings(),
						onSave: (values) => {
							settingTab.plugin.settings.ignoreHeading =
								values.join(", ");
							settingTab.applySettingsUpdate();
							updateButtonText();
							new Notice(
								t(
									"Heading filters updated. Rebuild the task index to apply to existing tasks.",
								),
								6000,
							);
						},
					}).open();
				});
			});

		new Setting(containerEl)
			.setName(t("Focus all tasks behind heading"))
			.setDesc(
				t(
					"Configure headings to focus on. Only tasks under these headings will be included in indexing.",
				),
			)
			.addButton((button) => {
				const getFocusHeadings = () => {
					const value = settingTab.plugin.settings.focusHeading || "";
					return value
						.split(",")
						.map((h) => h.trim())
						.filter((h) => h);
				};

				const updateButtonText = () => {
					const headings = getFocusHeadings();
					if (headings.length === 0) {
						button.setButtonText(t("Configure Focus Headings"));
					} else {
						button.setButtonText(
							t("{{count}} heading(s) configured", {
								interpolation: {
									count: headings.length.toString(),
								},
							}),
						);
					}
				};

				updateButtonText();
				button.onClick(() => {
					new ListConfigModal(settingTab.plugin, {
						title: t("Configure Focus Headings"),
						description: t(
							"Add headings to focus on. Only tasks under these headings will be included in indexing. Examples: '## Project', '## Inbox', '# Tasks'",
						),
						placeholder: t("Enter heading (e.g., ## Tasks)"),
						values: getFocusHeadings(),
						onSave: (values) => {
							settingTab.plugin.settings.focusHeading =
								values.join(", ");
							settingTab.applySettingsUpdate();
							updateButtonText();
							new Notice(
								t(
									"Heading filters updated. Rebuild the task index to apply to existing tasks.",
								),
								6000,
							);
						},
					}).open();
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
				toggle.setValue(
					settingTab.plugin.settings.useDailyNotePathAsDate,
				);
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

		// File Metadata Inheritance Settings
		new Setting(containerEl)
			.setName(t("File Metadata Inheritance"))
			.setDesc(
				t("Configure how tasks inherit metadata from file frontmatter"),
			)
			.setHeading();

		new Setting(containerEl)
			.setName(t("Enable file metadata inheritance"))
			.setDesc(
				t(
					"Allow tasks to inherit metadata properties from their file's frontmatter",
				),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						settingTab.plugin.settings.fileMetadataInheritance
							.enabled,
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.fileMetadataInheritance.enabled =
							value;
						settingTab.applySettingsUpdate();

						new ConfirmModal(settingTab.plugin, {
							title: t("Reindex"),
							message: t(
								"This change affects how tasks inherit metadata from files. Rebuild the index now so changes take effect immediately?",
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
									await settingTab.plugin.dataflowOrchestrator?.onSettingsChange(
										["parser"],
									);
									new Notice(
										t("Task index completely rebuilt"),
									);
								} catch (error) {
									console.error(
										"Failed to reindex after inheritance setting change:",
										error,
									);
									new Notice(t("Failed to reindex tasks"));
								}
							},
						}).open();

						setTimeout(() => {
							settingTab.display();
						}, 200);
					}),
			);

		if (settingTab.plugin.settings.fileMetadataInheritance.enabled) {
			new Setting(containerEl)
				.setName(t("Inherit from frontmatter"))
				.setDesc(
					t(
						"Tasks inherit metadata properties like priority, context, etc. from file frontmatter when not explicitly set on the task",
					),
				)
				.addToggle((toggle) =>
					toggle
						.setValue(
							settingTab.plugin.settings.fileMetadataInheritance
								.inheritFromFrontmatter,
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.fileMetadataInheritance.inheritFromFrontmatter =
								value;
							settingTab.applySettingsUpdate();

							new ConfirmModal(settingTab.plugin, {
								title: t("Reindex"),
								message: t(
									"This change affects how tasks inherit metadata from files. Rebuild the index now so changes take effect immediately?",
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
										await settingTab.plugin.dataflowOrchestrator?.onSettingsChange(
											["parser"],
										);
										new Notice(
											t("Task index completely rebuilt"),
										);
									} catch (error) {
										console.error(
											"Failed to reindex after inheritance setting change:",
											error,
										);
										new Notice(
											t("Failed to reindex tasks"),
										);
									}
								},
							}).open();
						}),
				);

			new Setting(containerEl)
				.setName(t("Inherit from frontmatter for subtasks"))
				.setDesc(
					t(
						"Allow subtasks to inherit metadata from file frontmatter. When disabled, only top-level tasks inherit file metadata",
					),
				)
				.addToggle((toggle) =>
					toggle
						.setValue(
							settingTab.plugin.settings.fileMetadataInheritance
								.inheritFromFrontmatterForSubtasks,
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.fileMetadataInheritance.inheritFromFrontmatterForSubtasks =
								value;
							settingTab.applySettingsUpdate();

							new ConfirmModal(settingTab.plugin, {
								title: t("Reindex"),
								message: t(
									"This change affects how tasks inherit metadata from files. Rebuild the index now so changes take effect immediately?",
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
										await settingTab.plugin.dataflowOrchestrator?.onSettingsChange(
											["parser"],
										);
										new Notice(
											t("Task index completely rebuilt"),
										);
									} catch (error) {
										console.error(
											"Failed to reindex after inheritance setting change:",
											error,
										);
										new Notice(
											t("Failed to reindex tasks"),
										);
									}
								},
							}).open();
						}),
				);
		}
	})();

	// ========================================
	// SECTION 2: File Task Configuration
	// ========================================
	(() => {
		const containerEl = fileContainer;
		const fileSourceSettings = settingTab.plugin.settings.fileSource;
		const fileTasksEnabled =
			scopeControls.fileTasksEnabled !== false &&
			Boolean(fileSourceSettings?.enabled);

		new Setting(containerEl)
			.setName(t("Enable file tasks"))
			.setDesc(
				t(
					"Allow Task Genius to recognize files as tasks using metadata, tags, or templates.",
				),
			)
			.addToggle((toggle) => {
				toggle.setValue(fileTasksEnabled);
				toggle.onChange((value) => {
					const controls = ensureScopeControls(
						settingTab.plugin.settings,
					);
					controls.fileTasksEnabled = value;

					if (!settingTab.plugin.settings.fileSource) {
						settingTab.plugin.settings.fileSource = {
							enabled: value,
						} as FileSourceConfiguration;
					} else {
						settingTab.plugin.settings.fileSource.enabled = value;
					}

					settingTab.applySettingsUpdate();
					updateFileBodyState(value);
					renderFileSourceSection();
					if (!value) {
						new Notice(
							t(
								"File task recognition disabled. Existing file tasks will be pruned shortly.",
							),
							6000,
						);
					}
				});
			});

		const fileBodyEl = containerEl.createDiv({
			cls: "tg-source-settings-body",
		});
		const updateFileBodyState = (enabled: boolean) => {
			fileBodyEl.classList.toggle("tg-source-disabled", !enabled);
		};
		updateFileBodyState(fileTasksEnabled);

		const fileSettingsContainer = fileBodyEl;

		const fileSourceContainerEl = fileSettingsContainer.createDiv(
			"file-source-container",
		);

		const renderFileSourceSection = () => {
			fileSourceContainerEl.empty();
			if (settingTab.plugin.settings.fileSource?.enabled) {
				createFileSourceSettings(
					fileSourceContainerEl,
					settingTab.plugin,
					{
						showEnableToggle: false,
					},
				);
			} else {
				fileSourceContainerEl.createDiv({
					cls: "setting-item-description",
					text: t(
						"File tasks are disabled. Enable them to configure recognition strategies.",
					),
				});
			}
		};

		renderFileSourceSection();
	})();

	const setActiveTaskSourcePanel = (panel: "inline" | "file") => {
		inlineContainer.toggleAttribute("hidden", panel !== "inline");
		fileContainer.toggleAttribute("hidden", panel !== "file");
		inlineSwitcherButton.classList.toggle("is-active", panel === "inline");
		fileSwitcherButton.classList.toggle("is-active", panel === "file");
	};

	const initialPanel: "inline" | "file" =
		scopeControls.inlineTasksEnabled === false &&
		scopeControls.fileTasksEnabled !== false
			? "file"
			: "inline";

	setActiveTaskSourcePanel(initialPanel);

	inlineSwitcherButton.addEventListener("click", () =>
		setActiveTaskSourcePanel("inline"),
	);
	fileSwitcherButton.addEventListener("click", () =>
		setActiveTaskSourcePanel("file"),
	);

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
			// Use the new fileSource.performance.enableWorkerProcessing setting
			toggle.setValue(
				settingTab.plugin.settings.fileSource?.performance
					?.enableWorkerProcessing ?? true,
			);
			toggle.onChange((value) => {
				// Ensure fileSource and performance objects exist
				if (!settingTab.plugin.settings.fileSource) {
					// Initialize with minimal required properties
					settingTab.plugin.settings.fileSource = {
						enabled: false,
						performance: {
							enableWorkerProcessing: true,
							enableCaching: true,
							cacheTTL: 300000,
						},
					} as any;
				}
				if (!settingTab.plugin.settings.fileSource.performance) {
					settingTab.plugin.settings.fileSource.performance = {
						enableWorkerProcessing: true,
						enableCaching: true,
						cacheTTL: 300000,
					};
				}
				// Update the setting
				settingTab.plugin.settings.fileSource.performance.enableWorkerProcessing =
					value;

				// Also update the legacy fileParsingConfig for backward compatibility
				if (settingTab.plugin.settings.fileParsingConfig) {
					settingTab.plugin.settings.fileParsingConfig.enableWorkerProcessing =
						value;
				}

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
							if (settingTab.plugin.dataflowOrchestrator) {
								await settingTab.plugin.dataflowOrchestrator.rebuild();
							}
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

function ensureScopeControls(
	settings: TaskProgressBarSettings,
): FileFilterScopeControls {
	const scopeControls =
		settings.fileFilter.scopeControls ??
		(settings.fileFilter.scopeControls = {
			inlineTasksEnabled: true,
			fileTasksEnabled: settings.fileSource?.enabled ?? false,
		});

	if (scopeControls.inlineTasksEnabled === undefined) {
		scopeControls.inlineTasksEnabled = true;
	}
	if (scopeControls.fileTasksEnabled === undefined) {
		scopeControls.fileTasksEnabled = settings.fileSource?.enabled ?? false;
	}

	return scopeControls;
}
