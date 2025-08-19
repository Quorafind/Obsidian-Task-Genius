import { App, Modal, Setting } from "obsidian";
import { t } from "../../translations/helper";
import { TaskProgressBarSettingTab } from "../../setting";
import { migrateOldFilterOptions } from "../../editor-ext/filterTasks";
import { generateUniqueId } from "../../utils/id-generator";

class PresetFilterModal extends Modal {
	constructor(app: App, private preset: any, private onSave: () => void) {
		super(app);
		// Migrate old preset options if needed
		if (this.preset && this.preset.options) {
			this.preset.options = migrateOldFilterOptions(this.preset.options);
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Set modal title
		this.titleEl.setText(t("Edit Filter: ") + this.preset.name);

		// Create form for filter options
		new Setting(contentEl).setName(t("Filter name")).addText((text) => {
			text.setValue(this.preset.name).onChange((value) => {
				this.preset.name = value;
			});
		});

		// Task status section
		new Setting(contentEl)
			.setName(t("Checkbox Status"))
			.setDesc(t("Include or exclude tasks based on their status"));

		const statusOptions = [
			{ id: "includeCompleted", name: t("Include Completed Tasks") },
			{ id: "includeInProgress", name: t("Include In Progress Tasks") },
			{ id: "includeAbandoned", name: t("Include Abandoned Tasks") },
			{ id: "includeNotStarted", name: t("Include Not Started Tasks") },
			{ id: "includePlanned", name: t("Include Planned Tasks") },
		];

		for (const option of statusOptions) {
			new Setting(contentEl).setName(option.name).addToggle((toggle) => {
				toggle
					.setValue(this.preset.options[option.id])
					.onChange((value) => {
						this.preset.options[option.id] = value;
					});
			});
		}

		// Related tasks section
		new Setting(contentEl)
			.setName(t("Related Tasks"))
			.setDesc(
				t("Include parent, child, and sibling tasks in the filter")
			);

		const relatedOptions = [
			{ id: "includeParentTasks", name: t("Include Parent Tasks") },
			{ id: "includeChildTasks", name: t("Include Child Tasks") },
			{ id: "includeSiblingTasks", name: t("Include Sibling Tasks") },
		];

		for (const option of relatedOptions) {
			new Setting(contentEl).setName(option.name).addToggle((toggle) => {
				toggle
					.setValue(this.preset.options[option.id])
					.onChange((value) => {
						this.preset.options[option.id] = value;
					});
			});
		}

		// Advanced filter section
		new Setting(contentEl)
			.setName(t("Advanced Filter"))
			.setDesc(
				t(
					"Use boolean operations: AND, OR, NOT. Example: 'text content AND #tag1'"
				)
			);

		new Setting(contentEl)
			.setName(t("Filter query"))
			.setDesc(
				t(
					"Use boolean operations: AND, OR, NOT. Example: 'text content AND #tag1'"
				)
			)
			.addText((text) => {
				text.setValue(this.preset.options.advancedFilterQuery).onChange(
					(value) => {
						this.preset.options.advancedFilterQuery = value;
					}
				);
			});

		new Setting(contentEl)
			.setName(t("Filter Mode"))
			.setDesc(
				t("Choose whether to show or hide tasks that match the filters")
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption("INCLUDE", t("Show matching tasks"))
					.addOption("EXCLUDE", t("Hide matching tasks"))
					.setValue(this.preset.options.filterMode || "INCLUDE")
					.onChange((value: "INCLUDE" | "EXCLUDE") => {
						this.preset.options.filterMode = value;
					});
			});

		// Save and cancel buttons
		new Setting(contentEl)
			.addButton((button) => {
				button
					.setButtonText(t("Save"))
					.setCta()
					.onClick(() => {
						this.onSave();
						this.close();
					});
			})
			.addButton((button) => {
				button.setButtonText(t("Cancel")).onClick(() => {
					this.close();
				});
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export function renderTaskFilterSettingsTab(
	settingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement
) {
	new Setting(containerEl).setName(t("Task Filter")).setHeading();

	new Setting(containerEl)
		.setName(t("Enable Task Filter"))
		.setDesc(t("Toggle this to enable the task filter panel"))
		.addToggle((toggle) => {
			toggle
				.setValue(
					settingTab.plugin.settings.taskFilter.enableTaskFilter
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.taskFilter.enableTaskFilter =
						value;
					settingTab.applySettingsUpdate();
				});
		});

	// Preset filters section
	new Setting(containerEl)
		.setName(t("Preset Filters"))
		.setDesc(
			t(
				"Create and manage preset filters for quick access to commonly used task filters."
			)
		);

	// Add a container for the preset filters
	const presetFiltersContainer = containerEl.createDiv({
		cls: "preset-filters-container",
	});

	// Function to refresh the preset filters list
	const refreshPresetFiltersList = () => {
		// Clear the container
		presetFiltersContainer.empty();

		// Get current preset filters
		const presetFilters =
			settingTab.plugin.settings.taskFilter.presetTaskFilters;

		if (presetFilters.length === 0) {
			presetFiltersContainer.createEl("div", {
				cls: "no-presets-message",
				text: t(
					"No preset filters created yet. Click 'Add New Preset' to create one."
				),
			});
		}

		// Add each preset filter in the list
		presetFilters.forEach((preset, index) => {
			const presetRow = presetFiltersContainer.createDiv({
				cls: "preset-filter-row",
			});

			// Create the setting
			const presetSetting = new Setting(presetRow)
				.setName(`${t("Preset")} #${index + 1}`)
				.addText((text) => {
					text.setValue(preset.name)
						.setPlaceholder(t("Preset name"))
						.onChange((value) => {
							preset.name = value;
							settingTab.applySettingsUpdate();
						});
				});

			// Add buttons for editing, removing
			presetSetting.addExtraButton((button) => {
				button
					.setIcon("pencil")
					.setTooltip(t("Edit Filter"))
					.onClick(() => {
						// Show modal to edit filter options
						new PresetFilterModal(settingTab.app, preset, () => {
							settingTab.applySettingsUpdate();
							refreshPresetFiltersList();
						}).open();
					});
			});

			presetSetting.addExtraButton((button) => {
				button
					.setIcon("trash")
					.setTooltip(t("Remove"))
					.onClick(() => {
						// Remove the preset
						presetFilters.splice(index, 1);
						settingTab.applySettingsUpdate();
						refreshPresetFiltersList();
					});
			});
		});

		// Add button to add new preset
		const addButtonContainer = presetFiltersContainer.createDiv();
		new Setting(addButtonContainer)
			.addButton((button) => {
				button
					.setButtonText(t("Add New Preset"))
					.setCta()
					.onClick(() => {
						// Add a new preset with default options
						const newPreset = {
							id: generateUniqueId(),
							name: t("New Filter"),
							options: {
								includeCompleted: true,
								includeInProgress: true,
								includeAbandoned: true,
								includeNotStarted: true,
								includePlanned: true,
								includeParentTasks: true,
								includeChildTasks: true,
								includeSiblingTasks: false,
								advancedFilterQuery: "",
								filterMode: "INCLUDE" as "INCLUDE" | "EXCLUDE",
							},
						};

						settingTab.plugin.settings.taskFilter.presetTaskFilters.push(
							newPreset
						);
						settingTab.applySettingsUpdate();

						// Open the edit modal for the new preset
						new PresetFilterModal(settingTab.app, newPreset, () => {
							settingTab.applySettingsUpdate();
							refreshPresetFiltersList();
						}).open();

						refreshPresetFiltersList();
					});
			})
			.addButton((button) => {
				button
					.setButtonText(t("Reset to Default Presets"))
					.onClick(() => {
						// Show confirmation modal
						const modal = new Modal(settingTab.app);
						modal.titleEl.setText(t("Reset to Default Presets"));

						const content = modal.contentEl.createDiv();
						content.setText(
							t(
								"This will replace all your current presets with the default set. Are you sure?"
							)
						);

						const buttonContainer = modal.contentEl.createDiv({
							cls: "tg-modal-button-container modal-button-container",
						});

						const cancelButton = buttonContainer.createEl("button");
						cancelButton.setText(t("Cancel"));
						cancelButton.addEventListener("click", () => {
							modal.close();
						});

						const confirmButton =
							buttonContainer.createEl("button");
						confirmButton.setText(t("Reset"));
						confirmButton.addClass("mod-warning");
						confirmButton.addEventListener("click", () => {
							createDefaultPresetFilters(settingTab);
							refreshPresetFiltersList();
							modal.close();
						});

						modal.open();
					});
			});
	};

	// Initial render of the preset filters list
	refreshPresetFiltersList();
}

function createDefaultPresetFilters(settingTab: TaskProgressBarSettingTab) {
	// Clear existing presets if any
	settingTab.plugin.settings.taskFilter.presetTaskFilters = [];

	// Add default presets
	const defaultPresets = [
		{
			id: generateUniqueId(),
			name: t("Incomplete tasks"),
			options: {
				includeCompleted: false,
				includeInProgress: true,
				includeAbandoned: false,
				includeNotStarted: true,
				includePlanned: true,
				includeParentTasks: true,
				includeChildTasks: true,
				includeSiblingTasks: false,
				advancedFilterQuery: "",
				filterMode: "INCLUDE" as "INCLUDE" | "EXCLUDE",
			},
		},
		{
			id: generateUniqueId(),
			name: t("In progress tasks"),
			options: {
				includeCompleted: false,
				includeInProgress: true,
				includeAbandoned: false,
				includeNotStarted: false,
				includePlanned: false,
				includeParentTasks: true,
				includeChildTasks: true,
				includeSiblingTasks: false,
				advancedFilterQuery: "",
				filterMode: "INCLUDE" as "INCLUDE" | "EXCLUDE",
			},
		},
		{
			id: generateUniqueId(),
			name: t("Completed tasks"),
			options: {
				includeCompleted: true,
				includeInProgress: false,
				includeAbandoned: false,
				includeNotStarted: false,
				includePlanned: false,
				includeParentTasks: false,
				includeChildTasks: true,
				includeSiblingTasks: false,
				advancedFilterQuery: "",
				filterMode: "INCLUDE" as "INCLUDE" | "EXCLUDE",
			},
		},
		{
			id: generateUniqueId(),
			name: t("All tasks"),
			options: {
				includeCompleted: true,
				includeInProgress: true,
				includeAbandoned: true,
				includeNotStarted: true,
				includePlanned: true,
				includeParentTasks: true,
				includeChildTasks: true,
				includeSiblingTasks: true,
				advancedFilterQuery: "",
				filterMode: "INCLUDE" as "INCLUDE" | "EXCLUDE",
			},
		},
	];

	// Add default presets to settings
	settingTab.plugin.settings.taskFilter.presetTaskFilters = defaultPresets;
	settingTab.applySettingsUpdate();
}
