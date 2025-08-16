import { Setting, Notice, setIcon } from "obsidian";
import { ViewConfig, ViewFilterRule } from "../../common/setting-definition";
import { t } from "../../translations/helper";
import { TaskProgressBarSettingTab } from "../../setting";
import { SingleFolderSuggest } from "../AutoComplete";
import { ConfirmModal } from "../ConfirmModal";
import { ViewConfigModal } from "../ViewConfigModal";
import { TaskFilterComponent } from "../task-filter/ViewTaskFilter";

export function renderViewSettingsTab(
	settingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement
) {
	new Setting(containerEl)
		.setName(t("View & Index Configuration"))
		.setDesc(
			t(
				"Configure the Task Genius sidebar views, visibility, order, and create custom views."
			)
		)
		.setHeading();

	new Setting(containerEl)
		.setName(t("Enable task genius view"))
		.setDesc(
			t(
				"Enable task genius view will also enable the task genius indexer, which will provide the task genius view results from whole vault."
			)
		)
		.addToggle((toggle) => {
			toggle.setValue(settingTab.plugin.settings.enableView);
			toggle.onChange((value) => {
				settingTab.plugin.settings.enableView = value;
				settingTab.applySettingsUpdate();
				settingTab.display(); // Refresh settings display
			});
		});

	new Setting(containerEl)
		.setName(t("Default view mode"))
		.setDesc(
			t(
				"Choose the default display mode for all views. This affects how tasks are displayed when you first open a view or create a new view."
			)
		)
		.addDropdown((dropdown) => {
			dropdown
				.addOption("list", t("List View"))
				.addOption("tree", t("Tree View"))
				.setValue(settingTab.plugin.settings.defaultViewMode)
				.onChange((value) => {
					settingTab.plugin.settings.defaultViewMode = value as
						| "list"
						| "tree";
					settingTab.applySettingsUpdate();
				});
		});

	new Setting(containerEl)
		.setName(t("Prefer metadata format of task"))
		.setDesc(
			t(
				"You can choose dataview format or tasks format, that will influence both index and save format."
			)
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

	// Project Tree View Settings
	new Setting(containerEl)
		.setName(t("Project Tree View Settings"))
		.setDesc(t("Configure how projects are displayed in tree view."))
		.setHeading();

	new Setting(containerEl)
		.setName(t("Default project view mode"))
		.setDesc(
			t(
				"Choose whether to display projects as a flat list or hierarchical tree by default."
			)
		)
		.addDropdown((dropdown) => {
			dropdown
				.addOption("list", t("List View"))
				.addOption("tree", t("Tree View"))
				.setValue(settingTab.plugin.settings.projectViewDefaultMode)
				.onChange((value) => {
					settingTab.plugin.settings.projectViewDefaultMode = value as
						| "list"
						| "tree";
					settingTab.applySettingsUpdate();
				});
		});

	new Setting(containerEl)
		.setName(t("Auto-expand project tree"))
		.setDesc(
			t(
				"Automatically expand all project nodes when opening the project view in tree mode."
			)
		)
		.addToggle((toggle) => {
			toggle
				.setValue(settingTab.plugin.settings.projectTreeAutoExpand)
				.onChange((value) => {
					settingTab.plugin.settings.projectTreeAutoExpand = value;
					settingTab.applySettingsUpdate();
				});
		});

	new Setting(containerEl)
		.setName(t("Show empty project folders"))
		.setDesc(
			t(
				"Display project folders even if they don't contain any tasks."
			)
		)
		.addToggle((toggle) => {
			toggle
				.setValue(settingTab.plugin.settings.projectTreeShowEmptyFolders)
				.onChange((value) => {
					settingTab.plugin.settings.projectTreeShowEmptyFolders = value;
					settingTab.applySettingsUpdate();
				});
		});

	new Setting(containerEl)
		.setName(t("Project path separator"))
		.setDesc(
			t(
				"Character used to separate project hierarchy levels (e.g., '/' in 'Project/SubProject')."
			)
		)
		.addText((text) => {
			text
				.setPlaceholder("/")
				.setValue(settingTab.plugin.settings.projectPathSeparator)
				.onChange((value) => {
					settingTab.plugin.settings.projectPathSeparator = value || "/";
					settingTab.applySettingsUpdate();
				});
		});

	// Task Parser Configuration Section
	new Setting(containerEl)
		.setName(t("Task Parser Configuration"))
		.setDesc(t("Configure how task metadata is parsed and recognized."))
		.setHeading();

	// Date Format Configuration
	new Setting(containerEl)
		.setName(t("Enable custom date formats"))
		.setDesc(
			t(
				"Enable custom date format patterns for parsing dates. When enabled, the parser will try your custom formats before falling back to default formats."
			)
		)
		.addToggle((toggle) => {
			toggle
				.setValue(settingTab.plugin.settings.enableCustomDateFormats ?? false)
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
			cls: "task-genius-formats-header"
		});
		
		dateFormatsContainer.createEl("p", {
			text: t("Add custom date format patterns. Date patterns: yyyy (4-digit year), yy (2-digit year), MM (2-digit month), M (1-2 digit month), dd (2-digit day), d (1-2 digit day), MMM (short month name), MMMM (full month name). Time patterns: HH (2-digit hour), mm (2-digit minute), ss (2-digit second). Use single quotes for literals (e.g., 'T' for ISO format)."),
			cls: "setting-item-description"
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
					placeholder: t("Enter date format (e.g., yyyy-MM-dd or yyyyMMdd_HHmmss)"),
				});
				
				formatInput.addEventListener("input", (e) => {
					const target = e.target as HTMLInputElement;
					settingTab.plugin.settings.customDateFormats![index] = target.value.trim();
					settingTab.applySettingsUpdate();
				});
				
				// Delete button
				const deleteBtn = formatItem.createEl("button", {
					cls: "task-genius-format-delete-btn",
					text: "×",
					attr: {
						"aria-label": t("Delete format"),
						"title": t("Delete this format"),
					}
				});
				
				deleteBtn.addEventListener("click", () => {
					settingTab.plugin.settings.customDateFormats!.splice(index, 1);
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
				const inputs = formatListContainer.querySelectorAll(".task-genius-format-input");
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
			cls: "task-genius-examples-header"
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
						"Customize the prefix used for project tags in dataview format (e.g., 'project' for [project:: myproject]). Changes require reindexing."
				  )
				: t(
						"Customize the prefix used for project tags (e.g., 'project' for #project/myproject). Changes require reindexing."
				  )
		)
		.addText((text) => {
			text.setPlaceholder("project")
				.setValue(
					settingTab.plugin.settings.projectTagPrefix[
						settingTab.plugin.settings.preferMetadataFormat
					]
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.projectTagPrefix[
						settingTab.plugin.settings.preferMetadataFormat
					] = value || "project";
					settingTab.applySettingsUpdate();
					// Update format examples
					const updateFn = (containerEl as any).updateFormatExamples;
					if (updateFn) updateFn();
				});
		});

	// Context tag prefix with special handling
	new Setting(containerEl)
		.setName(t("Context tag prefix"))
		.setDesc(
			isDataviewFormat
				? t(
						"Customize the prefix used for context tags in dataview format (e.g., 'context' for [context:: home]). Changes require reindexing."
				  )
				: t(
						"Customize the prefix used for context tags (e.g., '@home' for @home). Changes require reindexing."
				  )
		)
		.addText((text) => {
			text.setPlaceholder("context")
				.setValue(
					settingTab.plugin.settings.contextTagPrefix[
						settingTab.plugin.settings.preferMetadataFormat
					]
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.contextTagPrefix[
						settingTab.plugin.settings.preferMetadataFormat
					] = value || (isDataviewFormat ? "context" : "@");
					settingTab.applySettingsUpdate();
					// Update format examples
					const updateFn = (containerEl as any).updateFormatExamples;
					if (updateFn) updateFn();
				});
		});

	// // Area tag prefix
	// new Setting(containerEl)
	// 	.setName(t("Area tag prefix"))
	// 	.setDesc(
	// 		isDataviewFormat
	// 			? t(
	// 					"Customize the prefix used for area tags in dataview format (e.g., 'area' for [area:: work]). Changes require reindexing."
	// 			  )
	// 			: t(
	// 					"Customize the prefix used for area tags (e.g., 'area' for #area/work). Changes require reindexing."
	// 			  )
	// 	)
	// 	.addText((text) => {
	// 		text.setPlaceholder("area")
	// 			.setValue(
	// 				settingTab.plugin.settings.areaTagPrefix[
	// 					settingTab.plugin.settings.preferMetadataFormat
	// 				]
	// 			)
	// 			.onChange(async (value) => {
	// 				settingTab.plugin.settings.areaTagPrefix[
	// 					settingTab.plugin.settings.preferMetadataFormat
	// 				] = value || "area";
	// 				settingTab.applySettingsUpdate();
	// 				// Update format examples
	// 				const updateFn = (containerEl as any).updateFormatExamples;
	// 				if (updateFn) updateFn();
	// 			});
	// 	});

	// Add format examples section
	const exampleContainer = containerEl.createDiv({
		cls: "task-genius-format-examples",
	});

	// Function to update format examples
	const updateFormatExamples = () => {
		exampleContainer.empty();
		exampleContainer.createEl("strong", {
			text: t("Format Examples:"),
		});

		const currentIsDataviewFormat =
			settingTab.plugin.settings.preferMetadataFormat === "dataview";

		if (currentIsDataviewFormat) {
			exampleContainer.createEl("br");
			exampleContainer.createEl("span", {
				text: `• ${t("Project")}: [${
					settingTab.plugin.settings.projectTagPrefix[
						settingTab.plugin.settings.preferMetadataFormat
					]
				}:: myproject]`,
			});
			exampleContainer.createEl("span", {
				text: `• ${t("Context")}: [${
					settingTab.plugin.settings.contextTagPrefix[
						settingTab.plugin.settings.preferMetadataFormat
					]
				}:: home]`,
			});
			exampleContainer.createEl("span", {
				text: `• ${t("Area")}: [${
					settingTab.plugin.settings.areaTagPrefix[
						settingTab.plugin.settings.preferMetadataFormat
					]
				}:: work]`,
			});
		} else {
			exampleContainer.createEl("br");
			exampleContainer.createEl("span", {
				text: `• ${t("Project")}: #${
					settingTab.plugin.settings.projectTagPrefix[
						settingTab.plugin.settings.preferMetadataFormat
					]
				}/myproject`,
			});
			exampleContainer.createEl("span", {
				text: `• ${t("Context")}: @home (${t("always uses @ prefix")})`,
			});
			exampleContainer.createEl("span", {
				text: `• ${t("Area")}: #${
					settingTab.plugin.settings.areaTagPrefix[
						settingTab.plugin.settings.preferMetadataFormat
					]
				}/work`,
			});
		}
	};

	// Initial display of format examples
	updateFormatExamples();

	// Store the update function for later use
	(containerEl as any).updateFormatExamples = updateFormatExamples;

	// File Parsing Configuration Section
	new Setting(containerEl)
		.setName(t("File Parsing Configuration"))
		.setDesc(
			t("Configure how to extract tasks from file metadata and tags.")
		)
		.setHeading();

	new Setting(containerEl)
		.setName(t("Enable file metadata parsing"))
		.setDesc(
			t(
				"Parse tasks from file frontmatter metadata fields. When enabled, files with specific metadata fields will be treated as tasks."
			)
		)
		.addToggle((toggle) => {
			toggle.setValue(
				settingTab.plugin.settings.fileParsingConfig
					.enableFileMetadataParsing
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
								"File metadata parsing enabled. Rebuilding task index..."
							)
						);
						await settingTab.plugin.taskManager.forceReindex();
						new Notice(t("Task index rebuilt successfully"));
					} catch (error) {
						console.error(
							"Failed to reindex after enabling file metadata parsing:",
							error
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
					"Comma-separated list of metadata fields that should be treated as tasks (e.g., dueDate, todo, complete, task)"
				)
			)
			.addText((text) => {
				text.setPlaceholder("dueDate, todo, complete, task")
					.setValue(
						settingTab.plugin.settings.fileParsingConfig.metadataFieldsToParseAsTasks.join(
							", "
						)
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
					"Which metadata field to use as task content. If not found, will use filename."
				)
			)
			.addText((text) => {
				text.setPlaceholder("title")
					.setValue(
						settingTab.plugin.settings.fileParsingConfig
							.taskContentFromMetadata
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
					"Default status for tasks created from metadata (space for incomplete, x for complete)"
				)
			)
			.addText((text) => {
				text.setPlaceholder(" ")
					.setValue(
						settingTab.plugin.settings.fileParsingConfig
							.defaultTaskStatus
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
				"Parse tasks from file tags. When enabled, files with specific tags will be treated as tasks."
			)
		)
		.addToggle((toggle) => {
			toggle.setValue(
				settingTab.plugin.settings.fileParsingConfig
					.enableTagBasedTaskParsing
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
					"Comma-separated list of tags that should be treated as tasks (e.g., #todo, #task, #action, #due)"
				)
			)
			.addText((text) => {
				text.setPlaceholder("#todo, #task, #action, #due")
					.setValue(
						settingTab.plugin.settings.fileParsingConfig.tagsToParseAsTasks.join(
							", "
						)
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

	new Setting(containerEl)
		.setName(t("Enable worker processing"))
		.setDesc(
			t(
				"Use background worker for file parsing to improve performance. Recommended for large vaults."
			)
		)
		.addToggle((toggle) => {
			toggle.setValue(
				settingTab.plugin.settings.fileParsingConfig
					.enableWorkerProcessing
			);
			toggle.onChange((value) => {
				settingTab.plugin.settings.fileParsingConfig.enableWorkerProcessing =
					value;
				settingTab.applySettingsUpdate();
			});
		});

	new Setting(containerEl)
		.setName(t("Use daily note path as date"))
		.setDesc(
			t(
				"If enabled, the daily note path will be used as the date for tasks."
			)
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
				"Task Genius will use moment.js and also this format to parse the daily note path."
			),
		});
		descFragment.createEl("div", {
			text: t(
				"You need to set `yyyy` instead of `YYYY` in the format string. And `dd` instead of `DD`."
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
					settingTab.plugin
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
					"You can choose due, start, or scheduled as the date type for tasks."
				)
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

	new Setting(containerEl)
		.setName(t("Use relative time for date"))
		.setDesc(
			t(
				"Use relative time for date in task list item, e.g. 'yesterday', 'today', 'tomorrow', 'in 2 days', '3 months ago', etc."
			)
		)
		.addToggle((toggle) => {
			toggle.setValue(settingTab.plugin.settings.useRelativeTimeForDate);
			toggle.onChange((value) => {
				settingTab.plugin.settings.useRelativeTimeForDate = value;
				settingTab.applySettingsUpdate();
			});
		});

	new Setting(containerEl)
		.setName(t("Enable inline editor"))
		.setDesc(
			t(
				"Enable inline editing of task content and metadata directly in task views. When disabled, tasks can only be edited in the source file."
			)
		)
		.addToggle((toggle) => {
			toggle.setValue(settingTab.plugin.settings.enableInlineEditor);
			toggle.onChange((value) => {
				settingTab.plugin.settings.enableInlineEditor = value;
				settingTab.applySettingsUpdate();
			});
		});

	new Setting(containerEl)
		.setName(t("Enable dynamic metadata positioning"))
		.setDesc(
			t(
				"Intelligently position task metadata. When enabled, metadata appears on the same line as short tasks and below long tasks. When disabled, metadata always appears below the task content."
			)
		)
		.addToggle((toggle) => {
			toggle.setValue(settingTab.plugin.settings.enableDynamicMetadataPositioning);
			toggle.onChange((value) => {
				settingTab.plugin.settings.enableDynamicMetadataPositioning = value;
				settingTab.applySettingsUpdate();
			});
		});

	new Setting(containerEl)
		.setName(t("Ignore all tasks behind heading"))
		.setDesc(
			t(
				"Enter the heading to ignore, e.g. '## Project', '## Inbox', separated by comma"
			)
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
				"Enter the heading to focus, e.g. '## Project', '## Inbox', separated by comma"
			)
		)
		.addText((text) => {
			text.setValue(settingTab.plugin.settings.focusHeading);
			text.onChange((value) => {
				settingTab.plugin.settings.focusHeading = value;
				settingTab.applySettingsUpdate();
			});
		});

	if (!settingTab.plugin.settings.enableView) return;

	// --- Global Filter Section ---
	new Setting(containerEl)
		.setName(t("Global Filter Configuration"))
		.setDesc(
			t(
				"Configure global filter rules that apply to all Views by default. Individual Views can override these settings."
			)
		)
		.setHeading();

	// Global filter container
	const globalFilterContainer = containerEl.createDiv({
		cls: "global-filter-container",
	});

	// Global filter component
	let globalFilterComponent: TaskFilterComponent | null = null;

	// Initialize global filter component
	const initializeGlobalFilter = () => {
		if (globalFilterComponent) {
			globalFilterComponent.onunload();
		}

		// Pre-save the global filter state to localStorage so TaskFilterComponent can load it
		if (settingTab.plugin.settings.globalFilterRules.advancedFilter) {
			settingTab.app.saveLocalStorage(
				"task-genius-view-filter-global-filter",
				settingTab.plugin.settings.globalFilterRules.advancedFilter
			);
		}

		globalFilterComponent = new TaskFilterComponent(
			globalFilterContainer,
			settingTab.app,
			"global-filter", // Use a special leafId for global filter
			settingTab.plugin
		);

		// Load the component
		globalFilterComponent.onload();

		// Listen for filter changes
		const handleGlobalFilterChange = (filterState: any) => {
			if (globalFilterComponent) {
				// Update global filter rules in settings
				settingTab.plugin.settings.globalFilterRules = {
					...settingTab.plugin.settings.globalFilterRules,
					advancedFilter: filterState,
				};
				settingTab.applySettingsUpdate();

				// 触发视图刷新以应用新的全局筛选器
				// 使用插件的triggerViewUpdate方法刷新所有TaskView
				settingTab.plugin.triggerViewUpdate();
			}
		};

		// Register event listener for global filter changes
		settingTab.plugin.registerEvent(
			settingTab.app.workspace.on(
				"task-genius:filter-changed",
				(filterState, leafId) => {
					if (leafId === "global-filter") {
						handleGlobalFilterChange(filterState);
					}
				}
			)
		);
	};

	// Initialize the global filter component
	initializeGlobalFilter();

	// Store cleanup function for later use
	(containerEl as any).cleanupGlobalFilter = () => {
		if (globalFilterComponent) {
			globalFilterComponent.onunload();
			globalFilterComponent = null;
		}
	};

	// --- New View Management Section ---
	new Setting(containerEl)
		.setName(t("Manage Views"))
		.setDesc(
			t(
				"Configure sidebar views, order, visibility, and hide/show completed tasks per view."
			)
		)
		.setHeading();

	const viewListContainer = containerEl.createDiv({
		cls: "view-management-list",
	});

	// Function to render the list of views
	const renderViewList = () => {
		viewListContainer.empty();

		settingTab.plugin.settings.viewConfiguration.forEach((view, index) => {
			const viewSetting = new Setting(viewListContainer)
				.setName(view.name)
				.setDesc(`[${view.type}]`)
				.addToggle((toggle) => {
					/* Visibility Toggle */
					toggle
						.setTooltip(t("Show in sidebar"))
						.setValue(view.visible)
						.onChange(async (value) => {
							settingTab.plugin.settings.viewConfiguration[
								index
							].visible = value;
							settingTab.applySettingsUpdate();
						});
				});

			// Edit button - Now available for ALL views to edit rules/name/icon
			viewSetting.addExtraButton((button) => {
				button
					.setIcon("pencil")
					.setTooltip(t("Edit View"))
					.onClick(() => {
						if (view.id === "habit") {
							settingTab.openTab("habit");
							return;
						}
						// Get current rules (might be undefined for defaults initially)
						const currentRules = view.filterRules || {};
						new ViewConfigModal(
							settingTab.app,
							settingTab.plugin,
							view,
							currentRules,
							(
								updatedView: ViewConfig,
								updatedRules: ViewFilterRule
							) => {
								const currentIndex =
									settingTab.plugin.settings.viewConfiguration.findIndex(
										(v) => v.id === updatedView.id
									);
								if (currentIndex !== -1) {
									// Update the view config in the array
									settingTab.plugin.settings.viewConfiguration[
										currentIndex
									] = {
										...updatedView,
										filterRules: updatedRules,
									}; // Ensure rules are saved back to viewConfig
									settingTab.applySettingsUpdate();
									renderViewList(); // Re-render the settings list
								}
							}
						).open();
					});
				button.extraSettingsEl.addClass("view-edit-button"); // Add class for potential styling
			});

			// Copy button - Available for ALL views to create a copy
			viewSetting.addExtraButton((button) => {
				button
					.setIcon("copy")
					.setTooltip(t("Copy View"))
					.onClick(() => {
						// Create a copy of the current view
						new ViewConfigModal(
							settingTab.app,
							settingTab.plugin,
							null, // null for create mode
							null, // null for create mode
							(
								createdView: ViewConfig,
								createdRules: ViewFilterRule
							) => {
								if (
									!settingTab.plugin.settings.viewConfiguration.some(
										(v) => v.id === createdView.id
									)
								) {
									// Save with filter rules embedded
									settingTab.plugin.settings.viewConfiguration.push(
										{
											...createdView,
											filterRules: createdRules,
										}
									);
									settingTab.applySettingsUpdate();
									renderViewList();
									new Notice(
										t("View copied successfully: ") +
											createdView.name
									);
								} else {
									new Notice(
										t("Error: View ID already exists.")
									);
								}
							},
							view // 传入当前视图作为拷贝源
						).open();
					});
				button.extraSettingsEl.addClass("view-copy-button");
			});

			// Reordering buttons
			viewSetting.addExtraButton((button) => {
				button
					.setIcon("arrow-up")
					.setTooltip(t("Move Up"))
					.setDisabled(index === 0)
					.onClick(() => {
						if (index > 0) {
							const item =
								settingTab.plugin.settings.viewConfiguration.splice(
									index,
									1
								)[0];
							settingTab.plugin.settings.viewConfiguration.splice(
								index - 1,
								0,
								item
							);
							settingTab.applySettingsUpdate();
							renderViewList(); // Re-render the list
						}
					});
				button.extraSettingsEl.addClass("view-order-button");
			});
			viewSetting.addExtraButton((button) => {
				button
					.setIcon("arrow-down")
					.setTooltip(t("Move Down"))
					.setDisabled(
						index ===
							settingTab.plugin.settings.viewConfiguration
								.length -
								1
					)
					.onClick(() => {
						if (
							index <
							settingTab.plugin.settings.viewConfiguration
								.length -
								1
						) {
							const item =
								settingTab.plugin.settings.viewConfiguration.splice(
									index,
									1
								)[0];
							settingTab.plugin.settings.viewConfiguration.splice(
								index + 1,
								0,
								item
							);
							settingTab.applySettingsUpdate();
							renderViewList(); // Re-render the list
						}
					});
				button.extraSettingsEl.addClass("view-order-button");
			});

			// Delete button - ONLY for custom views
			if (view.type === "custom") {
				viewSetting.addExtraButton((button) => {
					button
						.setIcon("trash")
						.setTooltip(t("Delete View"))
						.onClick(() => {
							// TODO: Add confirmation modal before deleting
							settingTab.plugin.settings.viewConfiguration.splice(
								index,
								1
							);
							// No need to delete from customViewDefinitions anymore
							settingTab.applySettingsUpdate();
							renderViewList();
						});
					button.extraSettingsEl.addClass("view-delete-button");
				});
			}

			// Add new view icon
			const fragement = document.createDocumentFragment();
			const icon = fragement.createEl("i", {
				cls: "view-icon",
			});
			setIcon(icon, view.icon);
			viewSetting.settingEl.prepend(fragement);
		});
	};

	renderViewList(); // Initial render

	// Add New Custom View Button (Logic unchanged)
	const addBtnContainer = containerEl.createDiv();
	new Setting(addBtnContainer).addButton((button) => {
		button
			.setButtonText(t("Add Custom View"))
			.setCta()
			.onClick(() => {
				new ViewConfigModal(
					settingTab.app,
					settingTab.plugin,
					null,
					null,
					(createdView: ViewConfig, createdRules: ViewFilterRule) => {
						if (
							!settingTab.plugin.settings.viewConfiguration.some(
								(v) => v.id === createdView.id
							)
						) {
							// Save with filter rules embedded
							settingTab.plugin.settings.viewConfiguration.push({
								...createdView,
								filterRules: createdRules,
							});
							settingTab.applySettingsUpdate();
							renderViewList();
						} else {
							new Notice(t("Error: View ID already exists."));
						}
					}
				).open();
			});
	});

	// --- Keep Rebuild Index ---
	new Setting(containerEl)
		.setName(t("Rebuild index"))
		.setClass("mod-warning")
		.addButton((button) => {
			button.setButtonText(t("Rebuild")).onClick(async () => {
				new ConfirmModal(settingTab.plugin, {
					title: t("Reindex"),
					message: t(
						"Are you sure you want to force reindex all tasks?"
					),
					confirmText: t("Reindex"),
					cancelText: t("Cancel"),
					onConfirm: async (confirmed: boolean) => {
						if (!confirmed) return;
						try {
							new Notice(
								t("Clearing task cache and rebuilding index...")
							);
							await settingTab.plugin.taskManager.forceReindex();
							new Notice(t("Task index completely rebuilt"));
						} catch (error) {
							console.error(
								"Failed to force reindex tasks:",
								error
							);
							new Notice(t("Failed to force reindex tasks"));
						}
					},
				}).open();
			});
		});
}
