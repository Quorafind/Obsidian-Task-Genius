import { Setting, Notice, setIcon } from "obsidian";
import { ViewConfig, ViewFilterRule } from "../../common/setting-definition";
import { t } from "../../translations/helper";
import { TaskProgressBarSettingTab } from "../../setting";
import { ViewConfigModal } from "../ViewConfigModal";
import { TaskFilterComponent } from "../task-filter/ViewTaskFilter";

export function renderViewSettingsTab(
	settingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement
) {
	new Setting(containerEl)
		.setName(t("View Configuration"))
		.setDesc(
			t(
				"Configure the Task Genius sidebar views, visibility, order, and create custom views."
			)
		)
		.setHeading();

	new Setting(containerEl)
		.setName(t("Enable Task Genius Views"))
		.setDesc(
			t(
				"Enable Task Genius sidebar views to display and manage tasks. Requires the indexer to be enabled."
			)
		)
		.addToggle((toggle) => {
			toggle.setValue(settingTab.plugin.settings.enableView);
			toggle.onChange((value) => {
				if (value && !settingTab.plugin.settings.enableIndexer) {
					// If trying to enable views but indexer is disabled, show warning
					new Notice(
						t(
							"Cannot enable views without indexer. Please enable the indexer first in Index & Sources settings."
						)
					);
					toggle.setValue(false);
					return;
				}
				settingTab.plugin.settings.enableView = value;
				settingTab.applySettingsUpdate();
				settingTab.display(); // Refresh settings display
			});
		});

	if (!settingTab.plugin.settings.enableView) {
		// Show message when views are disabled
		new Setting(containerEl)
			.setName(t("Views are disabled"))
			.setDesc(
				t(
					"Enable Task Genius Views above to configure view settings."
				)
			);
		return;
	}

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

	// Date and Time Configuration Section
	new Setting(containerEl)
		.setName(t("Date and Time Display"))
		.setDesc(t("Configure how dates and times are displayed in views."))
		.setHeading();

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

	// Inline Editor Configuration
	new Setting(containerEl)
		.setName(t("Editor Configuration"))
		.setDesc(t("Configure inline editing and metadata positioning."))
		.setHeading();

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

}
