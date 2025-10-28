/**
 * FileTaskSettings - UI component for File Task configuration
 *
 * Provides a settings interface for configuring how files can be recognized
 * and treated as tasks with various strategies and options.
 */

import { Setting, Notice } from "obsidian";
import type TaskProgressBarPlugin from "@/index";
import type {
	FileSourceConfiguration,
	MetadataMappingConfig,
} from "@/types/file-source";
import { t } from "@/translations/helper";
import { ListConfigModal } from "@/components/ui/modals/ListConfigModal";

/**
 * Create File Task settings UI
 */
export interface FileSourceSettingsOptions {
	showEnableToggle?: boolean;
}

export function createFileSourceSettings(
	containerEl: HTMLElement,
	plugin: TaskProgressBarPlugin,
	options: FileSourceSettingsOptions = {},
): void {
	const config = plugin.settings?.fileSource;

	if (!config) {
		console.warn(
			"[FileSourceSettings] Missing fileSource configuration on plugin settings",
		);
		return;
	}

	// Main FileSource enable/disable toggle
	if (options.showEnableToggle !== false) {
		createEnableToggle(containerEl, plugin, config);
	}

	if (config.enabled) {
		// Recognition strategies section
		createRecognitionStrategiesSection(containerEl, plugin, config);

		// Metadata mappings only apply when metadata recognition is active
		if (config.recognitionStrategies.metadata.enabled) {
			createMetadataMappingsSection(containerEl, plugin);
		}

		// File task properties section
		createFileTaskPropertiesSection(containerEl, plugin, config);

		// Status mapping section
		createStatusMappingSection(containerEl, plugin, config);

		// Performance section
		createPerformanceSection(containerEl, plugin, config);

		// Advanced section
		createAdvancedSection(containerEl, plugin, config);
	}
}

/**
 * Create the main enable/disable toggle
 */
function createEnableToggle(
	containerEl: HTMLElement,
	plugin: TaskProgressBarPlugin,
	config: FileSourceConfiguration,
): void {
	// Don't create duplicate header since we're now embedded in IndexSettingsTab

	new Setting(containerEl)
		.setName(t("Enable File Task"))
		.setDesc(
			t(
				"Allow files to be recognized and treated as tasks based on their metadata, tags, or file paths. This provides advanced recognition strategies beyond simple metadata parsing.",
			),
		)
		.addToggle((toggle) =>
			toggle.setValue(config.enabled).onChange(async (value) => {
				plugin.settings.fileSource.enabled = value;
				await plugin.saveSettings();

				// Refresh the settings display
				containerEl.empty();
				createFileSourceSettings(containerEl, plugin);
			}),
		);
}

/**
 * Create recognition strategies section
 */
function createRecognitionStrategiesSection(
	containerEl: HTMLElement,
	plugin: TaskProgressBarPlugin,
	config: FileSourceConfiguration,
): void {
	new Setting(containerEl)
		.setHeading()
		.setName(t("Recognition Strategies"))
		.setDesc(
			t(
				"Configure how files are recognized as tasks. At least one strategy must be enabled.",
			),
		);

	// Metadata strategy
	const metadataContainer = containerEl.createDiv(
		"file-source-strategy-container",
	);

	new Setting(metadataContainer)
		.setName(t("Metadata-based Recognition"))
		.setDesc(
			t(
				"Recognize files as tasks if they have specific frontmatter fields",
			),
		)
		.addToggle((toggle) =>
			toggle
				.setValue(config.recognitionStrategies.metadata.enabled)
				.onChange(async (value) => {
					plugin.settings.fileSource.recognitionStrategies.metadata.enabled =
						value;
					await plugin.saveSettings();
					// Refresh to show/hide fields
					containerEl.empty();
					createFileSourceSettings(containerEl, plugin);
				}),
		);

	if (config.recognitionStrategies.metadata.enabled) {
		new Setting(metadataContainer)
			.setName(t("Task Fields"))
			.setDesc(
				t(
					"Configure metadata fields that indicate a file should be treated as a task (e.g., dueDate, status, priority)",
				),
			)
			.addButton((button) => {
				const getTaskFields = () => {
					return (
						config.recognitionStrategies.metadata.taskFields ?? []
					);
				};

				const updateButtonText = () => {
					const fields = getTaskFields();
					if (fields.length === 0) {
						button.setButtonText(t("Configure Task Fields"));
					} else {
						button.setButtonText(
							t("{{count}} field(s) configured", {
								interpolation: {
									count: fields.length.toString(),
								},
							}),
						);
					}
				};

				updateButtonText();
				button.onClick(() => {
					new ListConfigModal(plugin, {
						title: t("Configure Task Fields"),
						description: t(
							"Add metadata fields that indicate a file should be treated as a task (e.g., dueDate, status, priority)",
						),
						placeholder: t("Enter metadata field name"),
						values: getTaskFields(),
						onSave: async (values) => {
							plugin.settings.fileSource.recognitionStrategies.metadata.taskFields =
								values;
							await plugin.saveSettings();
							updateButtonText();
							new Notice(
								t(
									"Task fields updated. Rebuild the task index to apply to existing files.",
								),
								6000,
							);
						},
					}).open();
				});
			});

		new Setting(metadataContainer)
			.setName(t("Require All Fields"))
			.setDesc(
				t(
					"Require all specified fields to be present (otherwise any field is sufficient)",
				),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						config.recognitionStrategies.metadata.requireAllFields,
					)
					.onChange(async (value) => {
						plugin.settings.fileSource.recognitionStrategies.metadata.requireAllFields =
							value;
						await plugin.saveSettings();
					}),
			);
	}

	// Tag strategy
	const tagContainer = containerEl.createDiv(
		"file-source-strategy-container",
	);

	new Setting(tagContainer)
		.setName(t("Tag-based Recognition"))
		.setDesc(t("Recognize files as tasks if they have specific tags"))
		.addToggle((toggle) =>
			toggle
				.setValue(config.recognitionStrategies.tags.enabled)
				.onChange(async (value) => {
					plugin.settings.fileSource.recognitionStrategies.tags.enabled =
						value;
					await plugin.saveSettings();
					// Refresh to show/hide fields
					containerEl.empty();
					createFileSourceSettings(containerEl, plugin);
				}),
		);

	if (config.recognitionStrategies.tags.enabled) {
		new Setting(tagContainer)
			.setName(t("Task Tags"))
			.setDesc(
				t(
					"Configure tags that indicate a file should be treated as a task (e.g., #task, #todo, #actionable)",
				),
			)
			.addButton((button) => {
				const getTaskTags = () => {
					return config.recognitionStrategies.tags.taskTags ?? [];
				};

				const updateButtonText = () => {
					const tags = getTaskTags();
					if (tags.length === 0) {
						button.setButtonText(t("Configure Task Tags"));
					} else {
						button.setButtonText(
							t("{{count}} tag(s) configured", {
								interpolation: {
									count: tags.length.toString(),
								},
							}),
						);
					}
				};

				updateButtonText();
				button.onClick(() => {
					new ListConfigModal(plugin, {
						title: t("Configure Task Tags"),
						description: t(
							"Add tags that indicate a file should be treated as a task (e.g., #task, #todo, #actionable)",
						),
						placeholder: t("Enter tag (e.g., #task)"),
						values: getTaskTags(),
						onSave: async (values) => {
							plugin.settings.fileSource.recognitionStrategies.tags.taskTags =
								values;
							await plugin.saveSettings();
							updateButtonText();
							new Notice(
								t(
									"Task tags updated. Rebuild the task index to apply to existing files.",
								),
								6000,
							);
						},
					}).open();
				});
			});

		new Setting(tagContainer)
			.setName(t("Tag Matching Mode"))
			.setDesc(t("How tags should be matched against file tags"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("exact", t("Exact match"))
					.addOption("prefix", t("Prefix match"))
					.addOption("contains", t("Contains match"))
					.setValue(config.recognitionStrategies.tags.matchMode)
					.onChange(
						async (value: "exact" | "prefix" | "contains") => {
							plugin.settings.fileSource.recognitionStrategies.tags.matchMode =
								value;
							await plugin.saveSettings();
						},
					),
			);
	}

	// Path strategy
	const pathContainer = containerEl.createDiv(
		"file-source-strategy-container",
	);

	new Setting(pathContainer)
		.setName(t("Path-based Recognition"))
		.setDesc(t("Recognize files as tasks based on their file path"))
		.addToggle((toggle) =>
			toggle
				.setValue(config.recognitionStrategies.paths.enabled)
				.onChange(async (value) => {
					plugin.settings.fileSource.recognitionStrategies.paths.enabled =
						value;
					await plugin.saveSettings();
					// Refresh settings interface
					containerEl.empty();
					createFileSourceSettings(containerEl, plugin);
				}),
		);

	if (config.recognitionStrategies.paths.enabled) {
		new Setting(pathContainer)
			.setName(t("Task Paths"))
			.setDesc(
				t(
					"Configure paths that contain task files (e.g., Projects/, Tasks/2024/, Work/TODO/)",
				),
			)
			.addButton((button) => {
				const getTaskPaths = () => {
					return config.recognitionStrategies.paths.taskPaths ?? [];
				};

				const updateButtonText = () => {
					const paths = getTaskPaths();
					if (paths.length === 0) {
						button.setButtonText(t("Configure Task Paths"));
					} else {
						button.setButtonText(
							t("{{count}} path(s) configured", {
								interpolation: {
									count: paths.length.toString(),
								},
							}),
						);
					}
				};

				updateButtonText();
				button.onClick(() => {
					new ListConfigModal(plugin, {
						title: t("Configure Task Paths"),
						description: t(
							"Add paths that contain task files (e.g., Projects/, Tasks/2024/, Work/TODO/)",
						),
						placeholder: t(
							"Enter path (e.g., Projects/, Tasks/**/*.md)",
						),
						values: getTaskPaths(),
						onSave: async (values) => {
							plugin.settings.fileSource.recognitionStrategies.paths.taskPaths =
								values;
							await plugin.saveSettings();
							updateButtonText();
							new Notice(
								t(
									"Task paths updated. Rebuild the task index to apply to existing files.",
								),
								6000,
							);
						},
					}).open();
				});
			});

		new Setting(pathContainer)
			.setName(t("Path Matching Mode"))
			.setDesc(t("How paths should be matched"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"prefix",
						t("Prefix (e.g., Projects/ matches Projects/App.md)"),
					)
					.addOption(
						"glob",
						t("Glob pattern (e.g., Projects/**/*.md)"),
					)
					.addOption("regex", t("Regular expression (advanced)"))
					.setValue(config.recognitionStrategies.paths.matchMode)
					.onChange(async (value: "prefix" | "regex" | "glob") => {
						plugin.settings.fileSource.recognitionStrategies.paths.matchMode =
							value;
						await plugin.saveSettings();
						// Refresh to show updated examples
						containerEl.empty();
						createFileSourceSettings(containerEl, plugin);
					}),
			);

		// Add examples based on current mode
		const examples = pathContainer.createDiv("setting-item-description");

		const currentMode = config.recognitionStrategies.paths.matchMode;
		let exampleText = "";

		switch (currentMode) {
			case "prefix":
				exampleText =
					t("Examples:") +
					"\n" +
					"• Projects/ → " +
					t("matches all files under Projects folder") +
					"\n" +
					"• Tasks/2024/ → " +
					t("matches all files under Tasks/2024 folder");
				break;
			case "glob":
				exampleText =
					t("Examples:") +
					"\n" +
					"• Projects/**/*.md → " +
					t("all .md files in Projects and subfolders") +
					"\n" +
					"• Tasks/*.task.md → " +
					t("files ending with .task.md in Tasks folder") +
					"\n" +
					"• Work/*/TODO.md → " +
					t("TODO.md in any direct subfolder of Work");
				break;
			case "regex":
				exampleText =
					t("Examples:") +
					"\n" +
					"• ^Projects/.*\\.md$ → " +
					t("all .md files in Projects folder") +
					"\n" +
					"• ^Tasks/\\d{4}-\\d{2}-\\d{2} → " +
					t("files starting with date in Tasks");
				break;
		}

		examples.createEl("pre", {
			text: exampleText,
			attr: { style: "font-size: 0.9em; color: var(--text-muted);" },
		});
	}
}

/**
 * Create metadata mappings section
 */
function createMetadataMappingsSection(
	containerEl: HTMLElement,
	plugin: TaskProgressBarPlugin,
): void {
	new Setting(containerEl)
		.setName(t("Metadata Mappings"))
		.setDesc(t("Configure how metadata fields are mapped and transformed"))
		.setHeading();

	const metadataMappingsContainer = containerEl.createDiv({
		cls: "file-source-metadata-mappings-container",
	});

	const ensureMappingsArray = () => {
		if (
			!Array.isArray(plugin.settings.fileSource.metadataMappings)
		) {
			plugin.settings.fileSource.metadataMappings = [];
		}
	};

	const targetOptions = [
		"status",
		"project",
		"context",
		"area",
		"priority",
		"tags",
		"startDate",
		"scheduledDate",
		"dueDate",
		"completedDate",
		"createdDate",
		"recurrence",
	];

	const refreshMetadataMappings = () => {
		metadataMappingsContainer.empty();
		ensureMappingsArray();

		const mappings =
			plugin.settings.fileSource
				.metadataMappings as MetadataMappingConfig[];

		if (mappings.length === 0) {
			metadataMappingsContainer.createDiv({
				cls: "setting-item-description",
				text: t("No metadata mappings configured yet."),
			});
		}

		const usedTargetKeys = new Set(
			mappings
				.filter(
					(mapping) => mapping.enabled && mapping.targetKey,
				)
				.map((mapping) => mapping.targetKey),
		);

		mappings.forEach((mapping, index) => {
			const mappingRow = metadataMappingsContainer.createDiv({
				cls: "file-source-metadata-mapping-row",
			});

			const availableTargetKeys = targetOptions.filter(
				(key) =>
					!usedTargetKeys.has(key) ||
					key === mapping.targetKey,
			);

			new Setting(mappingRow)
				.setName(`${t("Mapping")} ${index + 1}`)
				.addText((text) => {
					text
						.setPlaceholder(t("Source key (e.g., proj)"))
						.setValue(mapping.sourceKey)
						.onChange(async (value) => {
							ensureMappingsArray();
							plugin.settings.fileSource.metadataMappings[
								index
							].sourceKey = value;
							await plugin.saveSettings();
						});
				})
				.addDropdown((dropdown) => {
					dropdown.addOption("", t("Select target field"));
					availableTargetKeys.forEach((key) => {
						dropdown.addOption(key, key);
					});

					dropdown
						.setValue(mapping.targetKey)
						.onChange(async (value) => {
							ensureMappingsArray();
							plugin.settings.fileSource.metadataMappings[
								index
							].targetKey = value;
							await plugin.saveSettings();
							refreshMetadataMappings();
						});
				})
				.addToggle((toggle) => {
					toggle
						.setTooltip(t("Enabled"))
						.setValue(mapping.enabled)
						.onChange(async (value) => {
							ensureMappingsArray();
							plugin.settings.fileSource.metadataMappings[
								index
							].enabled = value;
							await plugin.saveSettings();
							refreshMetadataMappings();
						});
				})
				.addButton((button) => {
					button
						.setIcon("trash")
						.setTooltip(t("Remove"))
						.onClick(async () => {
							ensureMappingsArray();
							plugin.settings.fileSource.metadataMappings.splice(
								index,
								1,
							);
							await plugin.saveSettings();
							refreshMetadataMappings();
						});
				});
		});

		new Setting(metadataMappingsContainer).addButton((button) =>
			button
				.setButtonText(t("Add Metadata Mapping"))
				.setCta()
				.onClick(async () => {
					ensureMappingsArray();
					plugin.settings.fileSource.metadataMappings.push({
						sourceKey: "",
						targetKey: "",
						enabled: true,
					});
					await plugin.saveSettings();
					refreshMetadataMappings();
				}),
		);
	};

	refreshMetadataMappings();
}

/**
 * Create file task properties section
 */
function createFileTaskPropertiesSection(
	containerEl: HTMLElement,
	plugin: TaskProgressBarPlugin,
	config: FileSourceConfiguration,
): void {
	new Setting(containerEl)
		.setHeading()
		.setName(t("Task Properties for Files"));

	new Setting(containerEl)
		.setName(t("Task Title Source"))
		.setDesc(
			t(
				"What should be used as the task title when a file becomes a task",
			),
		)
		.addDropdown((dropdown) =>
			dropdown
				.addOption("filename", t("Filename"))
				.addOption("title", t("Frontmatter title"))
				.addOption("h1", t("First H1 heading"))
				.addOption("custom", t("Custom metadata field"))
				.setValue(config.fileTaskProperties.contentSource)
				.onChange(
					async (value: "filename" | "title" | "h1" | "custom") => {
						plugin.settings.fileSource.fileTaskProperties.contentSource =
							value;
						await plugin.saveSettings();

						// Refresh to show/hide custom field input
						containerEl.empty();
						createFileSourceSettings(containerEl, plugin);
					},
				),
		);

	if (config.fileTaskProperties.contentSource === "custom") {
		new Setting(containerEl)
			.setName(t("Custom Content Field"))
			.setDesc(t("Name of the metadata field to use as task content"))
			.addText((text) =>
				text
					.setPlaceholder("taskContent")
					.setValue(
						config.fileTaskProperties.customContentField || "",
					)
					.onChange(async (value) => {
						plugin.settings.fileSource.fileTaskProperties.customContentField =
							value;
						await plugin.saveSettings();
					}),
			);
	}

	if (config.fileTaskProperties.contentSource === "filename") {
		new Setting(containerEl)
			.setName(t("Strip File Extension"))
			.setDesc(
				t(
					"Remove the .md extension from filename when using as task content",
				),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(config.fileTaskProperties.stripExtension)
					.onChange(async (value) => {
						plugin.settings.fileSource.fileTaskProperties.stripExtension =
							value;
						await plugin.saveSettings();
					}),
			);
	}

	new Setting(containerEl)
		.setName(t("Prefer Frontmatter Title"))
		.setDesc(
			t(
				"When updating task content, prefer updating frontmatter title over renaming the file. This protects the original filename.",
			),
		)
		.addToggle((toggle) =>
			toggle
				.setValue(config.fileTaskProperties.preferFrontmatterTitle)
				.onChange(async (value) => {
					plugin.settings.fileSource.fileTaskProperties.preferFrontmatterTitle =
						value;
					await plugin.saveSettings();
				}),
		);

	new Setting(containerEl)
		.setName(t("Default Task Status"))
		.setDesc(t("Default status for newly created file tasks"))
		.addText((text) =>
			text
				.setPlaceholder(" ")
				.setValue(config.fileTaskProperties.defaultStatus)
				.onChange(async (value) => {
					plugin.settings.fileSource.fileTaskProperties.defaultStatus =
						value;
					await plugin.saveSettings();
				}),
		);
}

/**
 * Create status mapping section
 */
function createStatusMappingSection(
	containerEl: HTMLElement,
	plugin: TaskProgressBarPlugin,
	config: FileSourceConfiguration,
): void {
	new Setting(containerEl)
		.setName(t("Status Mapping"))
		.setHeading()
		.setDesc(
			t(
				"Map between human-readable metadata values (e.g., 'completed') and task symbols (e.g., 'x').",
			),
		);

	new Setting(containerEl)
		.setName(t("Enable Status Mapping"))
		.setDesc(
			t(
				"Automatically convert between metadata status values and task symbols",
			),
		)
		.addToggle((toggle) =>
			toggle
				.setValue(config.statusMapping?.enabled || false)
				.onChange(async (value) => {
					if (!config.statusMapping) {
						config.statusMapping = {
							enabled: false,
							metadataToSymbol: {},
							symbolToMetadata: {},
							autoDetect: false,
							caseSensitive: false,
						};
					}

					plugin.settings.fileSource.statusMapping.enabled = value;
					await plugin.saveSettings();

					// Refresh to show/hide mapping options
					containerEl.empty();
					createFileSourceSettings(containerEl, plugin);
				}),
		);

	if (config.statusMapping && config.statusMapping.enabled) {
		// Sync mapping from Task Status Settings
		new Setting(containerEl)
			.setName(t("Sync from Task Status Settings"))
			.setDesc(
				t(
					"Populate FileSource status mapping from your checkbox status configuration",
				),
			)
			.addButton((button) =>
				button
					.setButtonText(t("Sync now"))
					.setCta()
					.onClick(async () => {
						try {
							const orchestrator = (plugin as any)
								.dataflowOrchestrator;
							if (orchestrator?.updateSettings) {
								// Delegate to orchestrator so in-memory FileSource mapping syncs immediately
								orchestrator.updateSettings(plugin.settings);
								new Notice(
									t("FileSource status mapping synced"),
								);
							} else {
								// Fallback: derive symbol->metadata mapping from Task Status settings
								const taskStatuses = (plugin.settings
									.taskStatuses || {}) as Record<
									string,
									string
								>;
								const symbolToType: Record<string, string> = {};
								for (const [type, symbols] of Object.entries(
									taskStatuses,
								)) {
									const list = String(symbols)
										.split("|")
										.filter(Boolean);
									for (const sym of list) {
										if (sym === "/>") {
											symbolToType["/"] = type;
											symbolToType[">"] = type;
											continue;
										}
										if (sym.length === 1)
											symbolToType[sym] = type;
										else {
											for (const ch of sym)
												symbolToType[ch] = type;
										}
									}
								}
								const typeToMetadata: Record<string, string> = {
									completed: "completed",
									inProgress: "in-progress",
									planned: "planned",
									abandoned: "cancelled",
									notStarted: "not-started",
								};
								plugin.settings.fileSource.statusMapping =
									plugin.settings.fileSource
										.statusMapping || {
										enabled: true,
										metadataToSymbol: {},
										symbolToMetadata: {},
										autoDetect: true,
										caseSensitive: false,
									};
								plugin.settings.fileSource.statusMapping.symbolToMetadata =
									{};
								for (const [symbol, type] of Object.entries(
									symbolToType,
								)) {
									const md = typeToMetadata[type];
									if (md)
										plugin.settings.fileSource.statusMapping.symbolToMetadata[
											symbol
										] = md;
								}
								await plugin.saveSettings();
								new Notice(
									t("FileSource status mapping synced"),
								);
							}
						} catch (e) {
							console.error(
								"Failed to sync FileSource status mapping:",
								e,
							);
							new Notice(t("Failed to sync mapping"));
						}
					}),
			);

		new Setting(containerEl)
			.setName(t("Case Sensitive Matching"))
			.setDesc(t("Enable case-sensitive matching for status values"))
			.addToggle((toggle) =>
				toggle
					.setValue(config.statusMapping.caseSensitive)
					.onChange(async (value) => {
						plugin.settings.fileSource.statusMapping.caseSensitive =
							value;
						await plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName(t("Auto-detect Status Mappings"))
			.setDesc(t("Automatically sync with task status configuration"))
			.addToggle((toggle) =>
				toggle
					.setValue(config.statusMapping.autoDetect)
					.onChange(async (value) => {
						plugin.settings.fileSource.statusMapping.autoDetect =
							value;
						await plugin.saveSettings();
					}),
			);

		// Common status mappings display
		const mappingsContainer = containerEl.createDiv(
			"file-source-status-mappings",
		);
		mappingsContainer.createEl("h5", { text: t("Common Mappings") });

		const mappingsList = mappingsContainer.createEl("div", {
			cls: "status-mapping-list",
		});

		// Show some example mappings
		const examples = [
			{ metadata: "completed", symbol: "x" },
			{ metadata: "in-progress", symbol: "/" },
			{ metadata: "planned", symbol: "?" },
			{ metadata: "cancelled", symbol: "-" },
			{ metadata: "not-started", symbol: " " },
		];

		const table = mappingsList.createEl("table", {
			cls: "status-mapping-table",
		});
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: t("Metadata Value") });
		headerRow.createEl("th", { text: "→" });
		headerRow.createEl("th", { text: t("Task Symbol") });

		const tbody = table.createEl("tbody");
		examples.forEach((example) => {
			const row = tbody.createEl("tr");
			row.createEl("td", { text: example.metadata });
			row.createEl("td", { text: "→" });
			row.createEl("td", {
				text: example.symbol === " " ? "(space)" : example.symbol,
			});
		});

		// Add custom mapping management UI
		containerEl.createEl("h5", { text: t("Custom Mappings") });

		const customMappingDesc = containerEl.createEl("p");
		customMappingDesc.textContent = t(
			"Add custom status mappings for your workflow.",
		);

		// Add mapping input
		new Setting(containerEl)
			.setName(t("Add Custom Mapping"))
			.setDesc(t("Enter metadata value and symbol (e.g., 'done:x')"))
			.addText((text) =>
				text.setPlaceholder("done:x").onChange(async (value) => {
					if (value.includes(":")) {
						const [metadata, symbol] = value.split(":", 2);
						if (metadata && symbol) {
							plugin.settings.fileSource.statusMapping.metadataToSymbol[
								metadata
							] = symbol;

							// Also update reverse mapping if not exists
							if (
								!plugin.settings.fileSource.statusMapping
									.symbolToMetadata[symbol]
							) {
								plugin.settings.fileSource.statusMapping.symbolToMetadata[
									symbol
								] = metadata;
							}

							await plugin.saveSettings();
							text.setValue("");
						}
					}
				}),
			)
			.addButton((button) =>
				button
					.setButtonText(t("Add"))
					.setCta()
					.onClick(() => {
						// Trigger the text change event with the current value
						const textInput = containerEl.querySelector(
							".setting-item:last-child input[type='text']",
						) as HTMLInputElement;
						if (textInput) {
							textInput.dispatchEvent(new Event("change"));
						}
					}),
			);

		// Note about Task Status Settings integration
		const integrationNote = containerEl.createDiv(
			"setting-item-description",
		);
		integrationNote.createEl("strong", { text: t("Note:") });
		integrationNote.createEl("span", {
			text:
				" " +
				t("Status mappings work with your Task Status Settings. ") +
				t(
					"The symbols defined here should match those in your checkbox status configuration.",
				),
		});
	}
}

/**
 * @deprecated
 * Create performance section
 */
function createPerformanceSection(
	containerEl: HTMLElement,
	plugin: TaskProgressBarPlugin,
	config: FileSourceConfiguration,
): void {
	new Setting(containerEl).setHeading().setName(t("Performance"));

	// new Setting(containerEl)
	// 	.setName(t("Enable Caching"))
	// 	.setDesc(t("Cache file task results to improve performance"))
	// 	.addToggle((toggle) =>
	// 		toggle
	// 			.setValue(config.performance.enableCaching)
	// 			.onChange(async (value) => {
	// 				plugin.settings.fileSource.performance.enableCaching =
	// 					value;
	// 				await plugin.saveSettings();
	// 			}),
	// 	);

	// Note: Worker Processing setting has been moved to IndexSettingsTab.ts > Performance Configuration section
	// This avoids duplication and provides centralized control for all worker processing

	new Setting(containerEl)
		.setName(t("Cache TTL"))
		.setDesc(
			t(
				"Time-to-live for cached results in milliseconds (default: 300000 = 5 minutes)",
			),
		)
		.addText((text) =>
			text
				.setPlaceholder("300000")
				.setValue(String(config.performance.cacheTTL || 300000))
				.onChange(async (value) => {
					const ttl = parseInt(value) || 300000;
					plugin.settings.fileSource.performance.cacheTTL = ttl;
					await plugin.saveSettings();
				}),
		);
}

/**
 * Create advanced section
 */
function createAdvancedSection(
	containerEl: HTMLElement,
	plugin: TaskProgressBarPlugin,
	config: FileSourceConfiguration,
): void {
	// new Setting(containerEl).setHeading().setName(t("Advanced"));

	// Statistics section
	const statsContainer = containerEl.createDiv("file-source-stats");
	new Setting(statsContainer).setHeading().setName(t("Statistics"));

	const statusText = config.enabled
		? t("File Task is enabled and monitoring files")
		: t("File Task is disabled");

	statsContainer.createEl("p", { text: statusText });

	if (config.enabled) {
		const strategiesText = getEnabledStrategiesText(config);
		statsContainer.createEl("p", {
			text: t("Active strategies: ") + strategiesText,
		});
	}
}

/**
 * Get text description of enabled strategies
 */
function getEnabledStrategiesText(config: FileSourceConfiguration): string {
	const enabled: string[] = [];

	if (config.recognitionStrategies.metadata.enabled)
		enabled.push(t("Metadata"));
	if (config.recognitionStrategies.tags.enabled) enabled.push(t("Tags"));
	if (config.recognitionStrategies.templates.enabled)
		enabled.push(t("Templates"));
	if (config.recognitionStrategies.paths.enabled) enabled.push(t("Paths"));

	return enabled.length > 0 ? enabled.join(", ") : t("None");
}
