import { Setting, Modal } from "obsidian";
import { t } from "../../translations/helper";
import { TaskProgressBarSettingTab } from "../../setting";
import { WorkflowDefinitionModal } from "../WorkflowDefinitionModal";
import { generateUniqueId } from "../../utils/id-generator";

export function renderWorkflowSettingsTab(
	settingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement
) {
	new Setting(containerEl)
		.setName(t("Workflow"))
		.setDesc(
			t("Configure task workflows for project and process management")
		)
		.setHeading();

	new Setting(containerEl)
		.setName(t("Enable workflow"))
		.setDesc(t("Toggle to enable the workflow system for tasks"))
		.addToggle((toggle) => {
			toggle
				.setValue(settingTab.plugin.settings.workflow.enableWorkflow)
				.onChange(async (value) => {
					settingTab.plugin.settings.workflow.enableWorkflow = value;
					settingTab.applySettingsUpdate();

					setTimeout(() => {
						settingTab.display();
					}, 200);
				});
		});

	if (!settingTab.plugin.settings.workflow.enableWorkflow) return;

	new Setting(containerEl)
		.setName(t("Auto-add timestamp"))
		.setDesc(
			t("Automatically add a timestamp to the task when it is created")
		)
		.addToggle((toggle) => {
			toggle
				.setValue(settingTab.plugin.settings.workflow.autoAddTimestamp)
				.onChange(async (value) => {
					settingTab.plugin.settings.workflow.autoAddTimestamp =
						value;
					settingTab.applySettingsUpdate();

					setTimeout(() => {
						settingTab.display();
					}, 200);
				});
		});

	if (settingTab.plugin.settings.workflow.autoAddTimestamp) {
		let fragment = document.createDocumentFragment();
		fragment.createEl("span", {
			text: t("Timestamp format:"),
		});
		fragment.createEl("span", {
			text: "   ",
		});
		const span = fragment.createEl("span");
		new Setting(containerEl)
			.setName(t("Timestamp format"))
			.setDesc(fragment)
			.addMomentFormat((format) => {
				format.setSampleEl(span);
				format.setDefaultFormat(
					settingTab.plugin.settings.workflow.timestampFormat ||
						"YYYY-MM-DD HH:mm:ss"
				);
				format
					.setValue(
						settingTab.plugin.settings.workflow.timestampFormat ||
							"YYYY-MM-DD HH:mm:ss"
					)
					.onChange((value) => {
						settingTab.plugin.settings.workflow.timestampFormat =
							value;
						settingTab.applySettingsUpdate();

						format.updateSample();
					});
			});

		new Setting(containerEl)
			.setName(t("Remove timestamp when moving to next stage"))
			.setDesc(
				t(
					"Remove the timestamp from the current task when moving to the next stage"
				)
			)
			.addToggle((toggle) => {
				toggle
					.setValue(
						settingTab.plugin.settings.workflow
							.removeTimestampOnTransition
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.workflow.removeTimestampOnTransition =
							value;
						settingTab.applySettingsUpdate();
					});
			});

		new Setting(containerEl)
			.setName(t("Calculate spent time"))
			.setDesc(
				t(
					"Calculate and display the time spent on the task when moving to the next stage"
				)
			)
			.addToggle((toggle) => {
				toggle
					.setValue(
						settingTab.plugin.settings.workflow.calculateSpentTime
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.workflow.calculateSpentTime =
							value;
						settingTab.applySettingsUpdate();

						setTimeout(() => {
							settingTab.display();
						}, 200);
					});
			});

		if (settingTab.plugin.settings.workflow.calculateSpentTime) {
			let fragment = document.createDocumentFragment();
			fragment.createEl("span", {
				text: t("Format for spent time:"),
			});
			fragment.createEl("span", {
				text: "   ",
			});
			const span = fragment.createEl("span", {
				text: "HH:mm:ss",
			});
			fragment.createEl("span", {
				text: ".   ",
			});
			fragment.createEl("span", {
				text: t("Calculate spent time when move to next stage."),
			});
			new Setting(containerEl)
				.setName(t("Spent time format"))
				.setDesc(fragment)
				.addMomentFormat((format) => {
					format.setSampleEl(span);
					format.setDefaultFormat(
						settingTab.plugin.settings.workflow.spentTimeFormat ||
							"HH:mm:ss"
					);
					format
						.setValue(
							settingTab.plugin.settings.workflow
								.spentTimeFormat || "HH:mm:ss"
						)
						.onChange((value) => {
							settingTab.plugin.settings.workflow.spentTimeFormat =
								value;
							settingTab.applySettingsUpdate();

							format.updateSample();
						});
				});

			new Setting(containerEl)
				.setName(t("Calculate full spent time"))
				.setDesc(
					t(
						"Calculate the full spent time from the start of the task to the last stage"
					)
				)
				.addToggle((toggle) => {
					toggle
						.setValue(
							settingTab.plugin.settings.workflow
								.calculateFullSpentTime
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.workflow.calculateFullSpentTime =
								value;
							settingTab.applySettingsUpdate();
						});
				});
		}
	}

	new Setting(containerEl)
		.setName(t("Auto remove last stage marker"))
		.setDesc(
			t(
				"Automatically remove the last stage marker when a task is completed"
			)
		)
		.addToggle((toggle) => {
			toggle
				.setValue(
					settingTab.plugin.settings.workflow
						.autoRemoveLastStageMarker
				)
				.onChange(async (value) => {
					settingTab.plugin.settings.workflow.autoRemoveLastStageMarker =
						value;
					settingTab.applySettingsUpdate();
				});
		});

	new Setting(containerEl)
		.setName(t("Auto-add next task"))
		.setDesc(
			t(
				"Automatically create a new task with the next stage when completing a task"
			)
		)
		.addToggle((toggle) => {
			toggle
				.setValue(settingTab.plugin.settings.workflow.autoAddNextTask)
				.onChange(async (value) => {
					settingTab.plugin.settings.workflow.autoAddNextTask = value;
					settingTab.applySettingsUpdate();
				});
		});

	// Workflow definitions list
	new Setting(containerEl)
		.setName(t("Workflow definitions"))
		.setDesc(
			t("Configure workflow templates for different types of processes")
		);

	// Create a container for the workflow list
	const workflowContainer = containerEl.createDiv({
		cls: "workflow-container",
	});

	// Function to display workflow list
	const refreshWorkflowList = () => {
		// Clear the container
		workflowContainer.empty();

		const workflows = settingTab.plugin.settings.workflow.definitions;

		if (workflows.length === 0) {
			workflowContainer.createEl("div", {
				cls: "no-workflows-message",
				text: t(
					"No workflow definitions created yet. Click 'Add New Workflow' to create one."
				),
			});
		}

		// Add each workflow in the list
		workflows.forEach((workflow, index) => {
			const workflowRow = workflowContainer.createDiv({
				cls: "workflow-row",
			});

			const workflowSetting = new Setting(workflowRow)
				.setName(workflow.name)
				.setDesc(workflow.description || "");

			// Add edit button
			workflowSetting.addExtraButton((button) => {
				button
					.setIcon("pencil")
					.setTooltip(t("Edit workflow"))
					.onClick(() => {
						new WorkflowDefinitionModal(
							settingTab.app,
							settingTab.plugin,
							workflow,
							(updatedWorkflow) => {
								// Update the workflow
								settingTab.plugin.settings.workflow.definitions[
									index
								] = updatedWorkflow;
								settingTab.applySettingsUpdate();
								refreshWorkflowList();
							}
						).open();
					});
			});

			// Add delete button
			workflowSetting.addExtraButton((button) => {
				button
					.setIcon("trash")
					.setTooltip(t("Remove workflow"))
					.onClick(() => {
						// Show confirmation dialog
						const modal = new Modal(settingTab.app);
						modal.titleEl.setText(t("Delete workflow"));

						const content = modal.contentEl.createDiv();
						content.setText(
							t(
								`Are you sure you want to delete the '${workflow.name}' workflow?`
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

						const deleteButton = buttonContainer.createEl("button");
						deleteButton.setText(t("Delete"));
						deleteButton.addClass("mod-warning");
						deleteButton.addEventListener("click", () => {
							// Remove the workflow
							settingTab.plugin.settings.workflow.definitions.splice(
								index,
								1
							);
							settingTab.applySettingsUpdate();
							refreshWorkflowList();
							modal.close();
						});

						modal.open();
					});
			});

			// Show stage information
			const stagesInfo = workflowRow.createDiv({
				cls: "workflow-stages-info",
			});

			if (workflow.stages.length > 0) {
				const stagesList = stagesInfo.createEl("ul");
				stagesList.addClass("workflow-stages-list");

				workflow.stages.forEach((stage) => {
					const stageItem = stagesList.createEl("li");
					stageItem.addClass("workflow-stage-item");
					stageItem.addClass(`workflow-stage-type-${stage.type}`);

					const stageName = stageItem.createSpan({
						text: stage.name,
					});

					if (stage.type === "cycle") {
						stageItem.addClass("workflow-stage-cycle");
						stageName.addClass("workflow-stage-name-cycle");
					} else if (stage.type === "terminal") {
						stageItem.addClass("workflow-stage-terminal");
						stageName.addClass("workflow-stage-name-terminal");
					}
				});
			}
		});

		// Add button to create a new workflow
		const addButtonContainer = workflowContainer.createDiv();
		new Setting(addButtonContainer).addButton((button) => {
			button
				.setButtonText(t("Add New Workflow"))
				.setCta()
				.onClick(() => {
					// Create a new empty workflow
					const newWorkflow = {
						id: generateUniqueId(),
						name: t("New Workflow"),
						description: "",
						stages: [],
						metadata: {
							version: "1.0",
							created: new Date().toISOString().split("T")[0],
							lastModified: new Date()
								.toISOString()
								.split("T")[0],
						},
					};

					// Show the edit modal for the new workflow
					new WorkflowDefinitionModal(
						settingTab.app,
						settingTab.plugin,
						newWorkflow,
						(createdWorkflow) => {
							// Add the workflow to the list
							settingTab.plugin.settings.workflow.definitions.push(
								createdWorkflow
							);
							settingTab.applySettingsUpdate();
							refreshWorkflowList();
						}
					).open();
				});
		});
	};

	// Initial render of the workflow list
	refreshWorkflowList();
}
