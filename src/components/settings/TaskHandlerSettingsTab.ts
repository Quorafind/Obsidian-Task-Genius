import { Setting } from "obsidian";
import {
	SortCriterion,
	DEFAULT_SETTINGS,
} from "../../common/setting-definition";
import { TaskProgressBarSettingTab } from "../../setting";
import { t } from "../../translations/helper";

export function renderTaskHandlerSettingsTab(
	settingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement
) {
	new Setting(containerEl)
		.setName(t("Task Gutter"))
		.setDesc(t("Configure the task gutter."))
		.setHeading();

	new Setting(containerEl)
		.setName(t("Enable task gutter"))
		.setDesc(t("Toggle this to enable the task gutter."))
		.addToggle((toggle) => {
			toggle.setValue(
				settingTab.plugin.settings.taskGutter.enableTaskGutter
			);
			toggle.onChange(async (value) => {
				settingTab.plugin.settings.taskGutter.enableTaskGutter = value;
				settingTab.applySettingsUpdate();
			});
		});

	// Add Completed Task Mover settings
	new Setting(containerEl).setName(t("Completed Task Mover")).setHeading();

	new Setting(containerEl)
		.setName(t("Enable completed task mover"))
		.setDesc(
			t(
				"Toggle this to enable commands for moving completed tasks to another file."
			)
		)
		.addToggle((toggle) =>
			toggle
				.setValue(
					settingTab.plugin.settings.completedTaskMover
						.enableCompletedTaskMover
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.completedTaskMover.enableCompletedTaskMover =
						value;
					settingTab.applySettingsUpdate();

					setTimeout(() => {
						settingTab.display();
					}, 200);
				})
		);

	if (
		settingTab.plugin.settings.completedTaskMover.enableCompletedTaskMover
	) {
		new Setting(containerEl)
			.setName(t("Task marker type"))
			.setDesc(t("Choose what type of marker to add to moved tasks"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("version", "Version marker")
					.addOption("date", "Date marker")
					.addOption("custom", "Custom marker")
					.setValue(
						settingTab.plugin.settings.completedTaskMover
							.taskMarkerType
					)
					.onChange(async (value: "version" | "date" | "custom") => {
						settingTab.plugin.settings.completedTaskMover.taskMarkerType =
							value;
						settingTab.applySettingsUpdate();
					});
			});

		// Show specific settings based on marker type
		const markerType =
			settingTab.plugin.settings.completedTaskMover.taskMarkerType;

		if (markerType === "version") {
			new Setting(containerEl)
				.setName(t("Version marker text"))
				.setDesc(
					t(
						"Text to append to tasks when moved (e.g., 'version 1.0')"
					)
				)
				.addText((text) =>
					text
						.setPlaceholder("version 1.0")
						.setValue(
							settingTab.plugin.settings.completedTaskMover
								.versionMarker
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.completedTaskMover.versionMarker =
								value;
							settingTab.applySettingsUpdate();
						})
				);
		} else if (markerType === "date") {
			new Setting(containerEl)
				.setName(t("Date marker text"))
				.setDesc(
					t(
						"Text to append to tasks when moved (e.g., 'archived on 2023-12-31')"
					)
				)
				.addText((text) =>
					text
						.setPlaceholder("archived on {{date}}")
						.setValue(
							settingTab.plugin.settings.completedTaskMover
								.dateMarker
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.completedTaskMover.dateMarker =
								value;
							settingTab.applySettingsUpdate();
						})
				);
		} else if (markerType === "custom") {
			new Setting(containerEl)
				.setName(t("Custom marker text"))
				.setDesc(
					t(
						"Use {{DATE:format}} for date formatting (e.g., {{DATE:YYYY-MM-DD}}"
					)
				)
				.addText((text) =>
					text
						.setPlaceholder("moved {{DATE:YYYY-MM-DD HH:mm}}")
						.setValue(
							settingTab.plugin.settings.completedTaskMover
								.customMarker
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.completedTaskMover.customMarker =
								value;
							settingTab.applySettingsUpdate();
						})
				);
		}

		new Setting(containerEl)
			.setName(t("Treat abandoned tasks as completed"))
			.setDesc(
				t("If enabled, abandoned tasks will be treated as completed.")
			)
			.addToggle((toggle) => {
				toggle.setValue(
					settingTab.plugin.settings.completedTaskMover
						.treatAbandonedAsCompleted
				);
				toggle.onChange((value) => {
					settingTab.plugin.settings.completedTaskMover.treatAbandonedAsCompleted =
						value;
					settingTab.applySettingsUpdate();
				});
			});

		new Setting(containerEl)
			.setName(t("Complete all moved tasks"))
			.setDesc(
				t("If enabled, all moved tasks will be marked as completed.")
			)
			.addToggle((toggle) => {
				toggle.setValue(
					settingTab.plugin.settings.completedTaskMover
						.completeAllMovedTasks
				);
				toggle.onChange((value) => {
					settingTab.plugin.settings.completedTaskMover.completeAllMovedTasks =
						value;
					settingTab.applySettingsUpdate();
				});
			});

		new Setting(containerEl)
			.setName(t("With current file link"))
			.setDesc(
				t(
					"A link to the current file will be added to the parent task of the moved tasks."
				)
			)
			.addToggle((toggle) => {
				toggle.setValue(
					settingTab.plugin.settings.completedTaskMover
						.withCurrentFileLink
				);
				toggle.onChange((value) => {
					settingTab.plugin.settings.completedTaskMover.withCurrentFileLink =
						value;
					settingTab.applySettingsUpdate();
				});
			});

		// Auto-move settings for completed tasks
		new Setting(containerEl)
			.setName(t("Enable auto-move for completed tasks"))
			.setDesc(
				t(
					"Automatically move completed tasks to a default file without manual selection."
				)
			)
			.addToggle((toggle) => {
				toggle.setValue(
					settingTab.plugin.settings.completedTaskMover.enableAutoMove
				);
				toggle.onChange((value) => {
					settingTab.plugin.settings.completedTaskMover.enableAutoMove =
						value;
					settingTab.applySettingsUpdate();
					settingTab.display(); // Refresh to show/hide auto-move settings
				});
			});

		if (settingTab.plugin.settings.completedTaskMover.enableAutoMove) {
			new Setting(containerEl)
				.setName(t("Default target file"))
				.setDesc(
					t(
						"Default file to move completed tasks to (e.g., 'Archive.md')"
					)
				)
				.addText((text) =>
					text
						.setPlaceholder("Archive.md")
						.setValue(
							settingTab.plugin.settings.completedTaskMover
								.defaultTargetFile
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.completedTaskMover.defaultTargetFile =
								value;
							settingTab.applySettingsUpdate();
						})
				);

			new Setting(containerEl)
				.setName(t("Default insertion mode"))
				.setDesc(
					t("Where to insert completed tasks in the target file")
				)
				.addDropdown((dropdown) => {
					dropdown
						.addOption("beginning", t("Beginning of file"))
						.addOption("end", t("End of file"))
						.addOption("after-heading", t("After heading"))
						.setValue(
							settingTab.plugin.settings.completedTaskMover
								.defaultInsertionMode
						)
						.onChange(
							async (
								value: "beginning" | "end" | "after-heading"
							) => {
								settingTab.plugin.settings.completedTaskMover.defaultInsertionMode =
									value;
								settingTab.applySettingsUpdate();
								settingTab.display(); // Refresh to show/hide heading setting
							}
						);
				});

			if (
				settingTab.plugin.settings.completedTaskMover
					.defaultInsertionMode === "after-heading"
			) {
				new Setting(containerEl)
					.setName(t("Default heading name"))
					.setDesc(
						t(
							"Heading name to insert tasks after (will be created if it doesn't exist)"
						)
					)
					.addText((text) =>
						text
							.setPlaceholder("Completed Tasks")
							.setValue(
								settingTab.plugin.settings.completedTaskMover
									.defaultHeadingName
							)
							.onChange(async (value) => {
								settingTab.plugin.settings.completedTaskMover.defaultHeadingName =
									value;
								settingTab.applySettingsUpdate();
							})
					);
			}
		}
	}

	// Add Incomplete Task Mover settings
	new Setting(containerEl).setName(t("Incomplete Task Mover")).setHeading();

	new Setting(containerEl)
		.setName(t("Enable incomplete task mover"))
		.setDesc(
			t(
				"Toggle this to enable commands for moving incomplete tasks to another file."
			)
		)
		.addToggle((toggle) =>
			toggle
				.setValue(
					settingTab.plugin.settings.completedTaskMover
						.enableIncompletedTaskMover
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.completedTaskMover.enableIncompletedTaskMover =
						value;
					settingTab.applySettingsUpdate();
				})
		);

	if (
		settingTab.plugin.settings.completedTaskMover.enableIncompletedTaskMover
	) {
		new Setting(containerEl)
			.setName(t("Incomplete task marker type"))
			.setDesc(
				t("Choose what type of marker to add to moved incomplete tasks")
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption("version", "Version marker")
					.addOption("date", "Date marker")
					.addOption("custom", "Custom marker")
					.setValue(
						settingTab.plugin.settings.completedTaskMover
							.incompletedTaskMarkerType
					)
					.onChange(async (value: "version" | "date" | "custom") => {
						settingTab.plugin.settings.completedTaskMover.incompletedTaskMarkerType =
							value;
						settingTab.applySettingsUpdate();
					});
			});

		// Show specific settings based on marker type
		const incompletedMarkerType =
			settingTab.plugin.settings.completedTaskMover
				.incompletedTaskMarkerType;

		if (incompletedMarkerType === "version") {
			new Setting(containerEl)
				.setName(t("Incomplete version marker text"))
				.setDesc(
					t(
						"Text to append to incomplete tasks when moved (e.g., 'version 1.0')"
					)
				)
				.addText((text) =>
					text
						.setPlaceholder("version 1.0")
						.setValue(
							settingTab.plugin.settings.completedTaskMover
								.incompletedVersionMarker
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.completedTaskMover.incompletedVersionMarker =
								value;
							settingTab.applySettingsUpdate();
						})
				);
		} else if (incompletedMarkerType === "date") {
			new Setting(containerEl)
				.setName(t("Incomplete date marker text"))
				.setDesc(
					t(
						"Text to append to incomplete tasks when moved (e.g., 'moved on 2023-12-31')"
					)
				)
				.addText((text) =>
					text
						.setPlaceholder("moved on {{date}}")
						.setValue(
							settingTab.plugin.settings.completedTaskMover
								.incompletedDateMarker
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.completedTaskMover.incompletedDateMarker =
								value;
							settingTab.applySettingsUpdate();
						})
				);
		} else if (incompletedMarkerType === "custom") {
			new Setting(containerEl)
				.setName(t("Incomplete custom marker text"))
				.setDesc(
					t(
						"Use {{DATE:format}} for date formatting (e.g., {{DATE:YYYY-MM-DD}}"
					)
				)
				.addText((text) =>
					text
						.setPlaceholder("moved {{DATE:YYYY-MM-DD HH:mm}}")
						.setValue(
							settingTab.plugin.settings.completedTaskMover
								.incompletedCustomMarker
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.completedTaskMover.incompletedCustomMarker =
								value;
							settingTab.applySettingsUpdate();
						})
				);
		}

		new Setting(containerEl)
			.setName(t("With current file link for incomplete tasks"))
			.setDesc(
				t(
					"A link to the current file will be added to the parent task of the moved incomplete tasks."
				)
			)
			.addToggle((toggle) => {
				toggle.setValue(
					settingTab.plugin.settings.completedTaskMover
						.withCurrentFileLinkForIncompleted
				);
				toggle.onChange((value) => {
					settingTab.plugin.settings.completedTaskMover.withCurrentFileLinkForIncompleted =
						value;
					settingTab.applySettingsUpdate();
				});
			});

		// Auto-move settings for incomplete tasks
		new Setting(containerEl)
			.setName(t("Enable auto-move for incomplete tasks"))
			.setDesc(
				t(
					"Automatically move incomplete tasks to a default file without manual selection."
				)
			)
			.addToggle((toggle) => {
				toggle.setValue(
					settingTab.plugin.settings.completedTaskMover
						.enableIncompletedAutoMove
				);
				toggle.onChange((value) => {
					settingTab.plugin.settings.completedTaskMover.enableIncompletedAutoMove =
						value;
					settingTab.applySettingsUpdate();
					settingTab.display(); // Refresh to show/hide auto-move settings
				});
			});

		if (
			settingTab.plugin.settings.completedTaskMover
				.enableIncompletedAutoMove
		) {
			new Setting(containerEl)
				.setName(t("Default target file for incomplete tasks"))
				.setDesc(
					t(
						"Default file to move incomplete tasks to (e.g., 'Backlog.md')"
					)
				)
				.addText((text) =>
					text
						.setPlaceholder("Backlog.md")
						.setValue(
							settingTab.plugin.settings.completedTaskMover
								.incompletedDefaultTargetFile
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.completedTaskMover.incompletedDefaultTargetFile =
								value;
							settingTab.applySettingsUpdate();
						})
				);

			new Setting(containerEl)
				.setName(t("Default insertion mode for incomplete tasks"))
				.setDesc(
					t("Where to insert incomplete tasks in the target file")
				)
				.addDropdown((dropdown) => {
					dropdown
						.addOption("beginning", t("Beginning of file"))
						.addOption("end", t("End of file"))
						.addOption("after-heading", t("After heading"))
						.setValue(
							settingTab.plugin.settings.completedTaskMover
								.incompletedDefaultInsertionMode
						)
						.onChange(
							async (
								value: "beginning" | "end" | "after-heading"
							) => {
								settingTab.plugin.settings.completedTaskMover.incompletedDefaultInsertionMode =
									value;
								settingTab.applySettingsUpdate();
								settingTab.display(); // Refresh to show/hide heading setting
							}
						);
				});

			if (
				settingTab.plugin.settings.completedTaskMover
					.incompletedDefaultInsertionMode === "after-heading"
			) {
				new Setting(containerEl)
					.setName(t("Default heading name for incomplete tasks"))
					.setDesc(
						t(
							"Heading name to insert incomplete tasks after (will be created if it doesn't exist)"
						)
					)
					.addText((text) =>
						text
							.setPlaceholder("Incomplete Tasks")
							.setValue(
								settingTab.plugin.settings.completedTaskMover
									.incompletedDefaultHeadingName
							)
							.onChange(async (value) => {
								settingTab.plugin.settings.completedTaskMover.incompletedDefaultHeadingName =
									value;
								settingTab.applySettingsUpdate();
							})
					);
			}
		}
	}

	// --- Task Sorting Settings ---
	new Setting(containerEl)
		.setName(t("Task Sorting"))
		.setDesc(t("Configure how tasks are sorted in the document."))
		.setHeading();

	new Setting(containerEl)
		.setName(t("Enable Task Sorting"))
		.setDesc(t("Toggle this to enable commands for sorting tasks."))
		.addToggle((toggle) => {
			toggle
				.setValue(settingTab.plugin.settings.sortTasks)
				.onChange(async (value) => {
					settingTab.plugin.settings.sortTasks = value;
					settingTab.applySettingsUpdate();
					// Refresh the settings display to show/hide criteria section
					settingTab.display(); // Or just this section if optimized
				});
		});

	if (settingTab.plugin.settings.sortTasks) {
		new Setting(containerEl)
			.setName(t("Sort Criteria"))
			.setDesc(
				t(
					"Define the order in which tasks should be sorted. Criteria are applied sequentially."
				)
			)
			.setHeading();

		const criteriaContainer = containerEl.createDiv({
			cls: "sort-criteria-container",
		});

		const refreshCriteriaList = () => {
			criteriaContainer.empty();
			const criteria = settingTab.plugin.settings.sortCriteria || [];

			if (criteria.length === 0) {
				criteriaContainer.createEl("p", {
					text: t("No sort criteria defined. Add criteria below."),
					cls: "setting-item-description",
				});
			}

			criteria.forEach((criterion, index) => {
				const criterionSetting = new Setting(criteriaContainer)
					.setClass("sort-criterion-row")
					.addDropdown((dropdown) => {
						dropdown
							.addOption("status", t("Status"))
							.addOption("priority", t("Priority"))
							.addOption("dueDate", t("Due Date"))
							.addOption("startDate", t("Start Date"))
							.addOption("scheduledDate", t("Scheduled Date"))
							.addOption("content", t("Content"))
							.addOption("lineNumber", t("Line Number"))
							.setValue(criterion.field)
							.onChange((value: SortCriterion["field"]) => {
								settingTab.plugin.settings.sortCriteria[
									index
								].field = value;
								settingTab.applySettingsUpdate();
							});
					})
					.addDropdown((dropdown) => {
						dropdown
							.addOption("asc", t("Ascending")) // Ascending might mean different things (e.g., High -> Low for priority)
							.addOption("desc", t("Descending")) // Descending might mean different things (e.g., Low -> High for priority)
							.setValue(criterion.order)
							.onChange((value: SortCriterion["order"]) => {
								settingTab.plugin.settings.sortCriteria[
									index
								].order = value;
								settingTab.applySettingsUpdate();
							});
						// Add tooltips explaining what asc/desc means for each field type if possible
						if (criterion.field === "priority") {
							dropdown.selectEl.title = t(
								"Ascending: High -> Low -> None. Descending: None -> Low -> High"
							);
						} else if (
							["dueDate", "startDate", "scheduledDate"].includes(
								criterion.field
							)
						) {
							dropdown.selectEl.title = t(
								"Ascending: Earlier -> Later -> None. Descending: None -> Later -> Earlier"
							);
						} else if (criterion.field === "status") {
							dropdown.selectEl.title = t(
								"Ascending respects status order (Overdue first). Descending reverses it."
							);
						} else {
							dropdown.selectEl.title = t(
								"Ascending: A-Z. Descending: Z-A"
							);
						}
					});

				// Controls for reordering and deleting
				criterionSetting.addExtraButton((button) => {
					button
						.setIcon("arrow-up")
						.setTooltip(t("Move Up"))
						.setDisabled(index === 0)
						.onClick(() => {
							if (index > 0) {
								const item =
									settingTab.plugin.settings.sortCriteria.splice(
										index,
										1
									)[0];
								settingTab.plugin.settings.sortCriteria.splice(
									index - 1,
									0,
									item
								);
								settingTab.applySettingsUpdate();
								refreshCriteriaList();
							}
						});
				});
				criterionSetting.addExtraButton((button) => {
					button
						.setIcon("arrow-down")
						.setTooltip(t("Move Down"))
						.setDisabled(index === criteria.length - 1)
						.onClick(() => {
							if (index < criteria.length - 1) {
								const item =
									settingTab.plugin.settings.sortCriteria.splice(
										index,
										1
									)[0];
								settingTab.plugin.settings.sortCriteria.splice(
									index + 1,
									0,
									item
								);
								settingTab.applySettingsUpdate();
								refreshCriteriaList();
							}
						});
				});
				criterionSetting.addExtraButton((button) => {
					button
						.setIcon("trash")
						.setTooltip(t("Remove Criterion"))
						.onClick(() => {
							settingTab.plugin.settings.sortCriteria.splice(
								index,
								1
							);
							settingTab.applySettingsUpdate();
							refreshCriteriaList();
						});
					// Add class to the container element of the extra button
					button.extraSettingsEl.addClass("mod-warning");
				});
			});

			// Button to add a new criterion
			new Setting(criteriaContainer)
				.addButton((button) => {
					button
						.setButtonText(t("Add Sort Criterion"))
						.setCta()
						.onClick(() => {
							const newCriterion: SortCriterion = {
								field: "status",
								order: "asc",
							};
							if (!settingTab.plugin.settings.sortCriteria) {
								settingTab.plugin.settings.sortCriteria = [];
							}
							settingTab.plugin.settings.sortCriteria.push(
								newCriterion
							);
							settingTab.applySettingsUpdate();
							refreshCriteriaList();
						});
				})
				.addButton((button) => {
					// Button to reset to defaults
					button.setButtonText(t("Reset to Defaults")).onClick(() => {
						// Optional: Add confirmation dialog here
						settingTab.plugin.settings.sortCriteria = [
							...DEFAULT_SETTINGS.sortCriteria,
						]; // Use spread to copy
						settingTab.applySettingsUpdate();
						refreshCriteriaList();
					});
				});
		};

		refreshCriteriaList(); // Initial render
	}

	// Add OnCompletion settings
	new Setting(containerEl).setName(t("On Completion")).setHeading();

	new Setting(containerEl)
		.setName(t("Enable OnCompletion"))
		.setDesc(t("Enable automatic actions when tasks are completed"))
		.addToggle((toggle) =>
			toggle
				.setValue(
					settingTab.plugin.settings.onCompletion.enableOnCompletion
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.onCompletion.enableOnCompletion =
						value;
					settingTab.applySettingsUpdate();
					settingTab.display(); // Refresh to show/hide onCompletion settings
				})
		);

	if (settingTab.plugin.settings.onCompletion.enableOnCompletion) {
		new Setting(containerEl)
			.setName(t("Default Archive File"))
			.setDesc(t("Default file for archive action"))
			.addText((text) =>
				text
					.setPlaceholder("Archive/Completed Tasks.md")
					.setValue(
						settingTab.plugin.settings.onCompletion.defaultArchiveFile
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.onCompletion.defaultArchiveFile =
							value;
						settingTab.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName(t("Default Archive Section"))
			.setDesc(t("Default section for archive action"))
			.addText((text) =>
				text
					.setPlaceholder("Completed Tasks")
					.setValue(
						settingTab.plugin.settings.onCompletion.defaultArchiveSection
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.onCompletion.defaultArchiveSection =
							value;
						settingTab.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName(t("Show Advanced Options"))
			.setDesc(t("Show advanced configuration options in task editors"))
			.addToggle((toggle) =>
				toggle
					.setValue(
						settingTab.plugin.settings.onCompletion.showAdvancedOptions
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.onCompletion.showAdvancedOptions =
							value;
						settingTab.applySettingsUpdate();
					})
			);
	}
}
