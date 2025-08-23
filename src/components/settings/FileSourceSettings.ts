/**
 * FileTaskSettings - UI component for File Task configuration
 *
 * Provides a settings interface for configuring how files can be recognized
 * and treated as tasks with various strategies and options.
 */

import { Setting } from "obsidian";
import type TaskProgressBarPlugin from "../../index";
import type { FileSourceConfiguration } from "../../types/file-source";
import { t } from "../../translations/helper";

/**
 * Create File Task settings UI
 */
export function createFileSourceSettings(
	containerEl: HTMLElement,
	plugin: TaskProgressBarPlugin,
): void {
	const config = plugin.settings.fileSource;

	// Main FileSource enable/disable toggle
	createEnableToggle(containerEl, plugin, config);

	if (config.enabled) {
		// Recognition strategies section
		createRecognitionStrategiesSection(containerEl, plugin, config);

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
		// Container for metadata fields list
		const fieldsContainer = metadataContainer.createDiv({
			cls: "task-genius-metadata-fields-container",
		});

		fieldsContainer.createEl("h4", {
			text: t("Task Fields"),
			cls: "task-genius-fields-header",
		});

		fieldsContainer.createEl("p", {
			text: t(
				"Add metadata fields that indicate a file should be treated as a task (e.g., dueDate, status, priority)",
			),
			cls: "setting-item-description",
		});

		// Container for field list
		const fieldListContainer = fieldsContainer.createDiv({
			cls: "task-genius-field-list",
		});

		// Function to render the field list
		const renderFieldList = () => {
			fieldListContainer.empty();

			const fields = config.recognitionStrategies.metadata.taskFields ?? [];

			// Render existing fields
			fields.forEach((field, index) => {
				const fieldItem = fieldListContainer.createDiv({
					cls: "task-genius-field-item",
				});

				// Field input
				const fieldInput = fieldItem.createEl("input", {
					type: "text",
					value: field,
					cls: "task-genius-field-input",
					placeholder: t("Enter metadata field name"),
				});

				fieldInput.addEventListener("input", async (e) => {
					const target = e.target as HTMLInputElement;
					plugin.settings.fileSource.recognitionStrategies.metadata.taskFields[index] =
						target.value.trim();
					await plugin.saveSettings();
				});

				// Delete button
				const deleteBtn = fieldItem.createEl("button", {
					cls: "task-genius-field-delete-btn",
					text: "×",
					attr: {
						"aria-label": t("Delete field"),
						title: t("Delete this field"),
					},
				});

				deleteBtn.addEventListener("click", async () => {
					plugin.settings.fileSource.recognitionStrategies.metadata.taskFields.splice(
						index,
						1,
					);
					await plugin.saveSettings();
					renderFieldList();
				});
			});

			// Add new field button
			const addFieldBtn = fieldListContainer.createEl("button", {
				cls: "task-genius-add-field-btn",
				text: t("+ Add Metadata Field"),
			});

			addFieldBtn.addEventListener("click", async () => {
				if (!plugin.settings.fileSource.recognitionStrategies.metadata.taskFields) {
					plugin.settings.fileSource.recognitionStrategies.metadata.taskFields = [];
				}
				plugin.settings.fileSource.recognitionStrategies.metadata.taskFields.push("");
				await plugin.saveSettings();
				renderFieldList();

				// Focus on the new input
				const inputs = fieldListContainer.querySelectorAll(
					".task-genius-field-input",
				);
				const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
				if (lastInput) {
					lastInput.focus();
				}
			});
		};

		// Initial render
		renderFieldList();

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
		// Container for tags list
		const tagsContainer = tagContainer.createDiv({
			cls: "task-genius-tags-container",
		});

		tagsContainer.createEl("h4", {
			text: t("Task Tags"),
			cls: "task-genius-tags-header",
		});

		tagsContainer.createEl("p", {
			text: t(
				"Add tags that indicate a file should be treated as a task (e.g., #task, #todo, #actionable)",
			),
			cls: "setting-item-description",
		});

		// Container for tag list
		const tagListContainer = tagsContainer.createDiv({
			cls: "task-genius-tag-list",
		});

		// Function to render the tag list
		const renderTagList = () => {
			tagListContainer.empty();

			const tags = config.recognitionStrategies.tags.taskTags ?? [];

			// Render existing tags
			tags.forEach((tag, index) => {
				const tagItem = tagListContainer.createDiv({
					cls: "task-genius-tag-item",
				});

				// Tag input
				const tagInput = tagItem.createEl("input", {
					type: "text",
					value: tag,
					cls: "task-genius-tag-input",
					placeholder: t("Enter tag (e.g., #task)"),
				});

				tagInput.addEventListener("input", async (e) => {
					const target = e.target as HTMLInputElement;
					plugin.settings.fileSource.recognitionStrategies.tags.taskTags[index] =
						target.value.trim();
					await plugin.saveSettings();
				});

				// Delete button
				const deleteBtn = tagItem.createEl("button", {
					cls: "task-genius-tag-delete-btn",
					text: "×",
					attr: {
						"aria-label": t("Delete tag"),
						title: t("Delete this tag"),
					},
				});

				deleteBtn.addEventListener("click", async () => {
					plugin.settings.fileSource.recognitionStrategies.tags.taskTags.splice(
						index,
						1,
					);
					await plugin.saveSettings();
					renderTagList();
				});
			});

			// Add new tag button
			const addTagBtn = tagListContainer.createEl("button", {
				cls: "task-genius-add-tag-btn",
				text: t("+ Add Tag"),
			});

			addTagBtn.addEventListener("click", async () => {
				if (!plugin.settings.fileSource.recognitionStrategies.tags.taskTags) {
					plugin.settings.fileSource.recognitionStrategies.tags.taskTags = [];
				}
				plugin.settings.fileSource.recognitionStrategies.tags.taskTags.push("");
				await plugin.saveSettings();
				renderTagList();

				// Focus on the new input
				const inputs = tagListContainer.querySelectorAll(
					".task-genius-tag-input",
				);
				const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
				if (lastInput) {
					lastInput.focus();
				}
			});
		};

		// Initial render
		renderTagList();

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
		// Container for paths list
		const pathsContainer = pathContainer.createDiv({
			cls: "task-genius-paths-container",
		});

		pathsContainer.createEl("h4", {
			text: t("Task Paths"),
			cls: "task-genius-paths-header",
		});

		pathsContainer.createEl("p", {
			text: t(
				"Add paths that contain task files (e.g., Projects/, Tasks/2024/, Work/TODO/)",
			),
			cls: "setting-item-description",
		});

		// Container for path list
		const pathListContainer = pathsContainer.createDiv({
			cls: "task-genius-path-list",
		});

		// Function to render the path list
		const renderPathList = () => {
			pathListContainer.empty();

			const paths = config.recognitionStrategies.paths.taskPaths ?? [];

			// Render existing paths
			paths.forEach((path, index) => {
				const pathItem = pathListContainer.createDiv({
					cls: "task-genius-path-item",
				});

				// Path input
				const pathInput = pathItem.createEl("input", {
					type: "text",
					value: path,
					cls: "task-genius-path-input",
					placeholder: t("Enter path (e.g., Projects/, Tasks/**/*.md)"),
				});

				pathInput.addEventListener("input", async (e) => {
					const target = e.target as HTMLInputElement;
					plugin.settings.fileSource.recognitionStrategies.paths.taskPaths[index] =
						target.value.trim();
					await plugin.saveSettings();
				});

				// Delete button
				const deleteBtn = pathItem.createEl("button", {
					cls: "task-genius-path-delete-btn",
					text: "×",
					attr: {
						"aria-label": t("Delete path"),
						title: t("Delete this path"),
					},
				});

				deleteBtn.addEventListener("click", async () => {
					plugin.settings.fileSource.recognitionStrategies.paths.taskPaths.splice(
						index,
						1,
					);
					await plugin.saveSettings();
					renderPathList();
				});
			});

			// Add new path button
			const addPathBtn = pathListContainer.createEl("button", {
				cls: "task-genius-add-path-btn",
				text: t("+ Add Path"),
			});

			addPathBtn.addEventListener("click", async () => {
				if (!plugin.settings.fileSource.recognitionStrategies.paths.taskPaths) {
					plugin.settings.fileSource.recognitionStrategies.paths.taskPaths = [];
				}
				plugin.settings.fileSource.recognitionStrategies.paths.taskPaths.push("");
				await plugin.saveSettings();
				renderPathList();

				// Focus on the new input
				const inputs = pathListContainer.querySelectorAll(
					".task-genius-path-input",
				);
				const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
				if (lastInput) {
					lastInput.focus();
				}
			});
		};

		// Initial render
		renderPathList();

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
		examples.style.marginTop = "10px";

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
					if(!config.statusMapping) {
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
		integrationNote.innerHTML =
			`<strong>${t("Note:")}</strong> ` +
			t("Status mappings work with your Task Status Settings. ") +
			t(
				"The symbols defined here should match those in your checkbox status configuration.",
			);
	}
}

/**
 * Create performance section
 */
function createPerformanceSection(
	containerEl: HTMLElement,
	plugin: TaskProgressBarPlugin,
	config: FileSourceConfiguration,
): void {
	new Setting(containerEl).setHeading().setName(t("Performance"));

	new Setting(containerEl)
		.setName(t("Enable Caching"))
		.setDesc(t("Cache file task results to improve performance"))
		.addToggle((toggle) =>
			toggle
				.setValue(config.performance.enableCaching)
				.onChange(async (value) => {
					plugin.settings.fileSource.performance.enableCaching =
						value;
					await plugin.saveSettings();
				}),
		);

	// Note: Worker Processing setting has been moved to IndexSettingsTab.ts > Performance Configuration section
	// This avoids duplication and provides centralized control for all worker processing
	
	new Setting(containerEl)
		.setName(t("Cache TTL"))
		.setDesc(t("Time-to-live for cached results in milliseconds (default: 300000 = 5 minutes)"))
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
	new Setting(containerEl).setHeading().setName(t("Advanced"));

	// Statistics section
	const statsContainer = containerEl.createDiv("file-source-stats");
	statsContainer.createEl("h5", { text: t("File Task Status") });

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
