import {
	App,
	Modal,
	Setting,
	Notice,
	ButtonComponent,
	DropdownComponent,
} from "obsidian";
import TaskProgressBarPlugin from "../index";
import { WorkflowDefinition, WorkflowStage } from "../common/setting-definition";
import { t } from "../translations/helper";

/**
 * Quick workflow creation modal for streamlined workflow setup
 */
export class QuickWorkflowModal extends Modal {
	plugin: TaskProgressBarPlugin;
	onSave: (workflow: WorkflowDefinition) => void;
	workflow: Partial<WorkflowDefinition>;
	templateType: string = "custom";

	// Predefined workflow templates
	private templates = {
		simple: {
			name: t("Simple Linear Workflow"),
			description: t("A basic linear workflow with sequential stages"),
			stages: [
				{ id: "todo", name: t("To Do"), type: "linear" as const },
				{ id: "in_progress", name: t("In Progress"), type: "linear" as const },
				{ id: "done", name: t("Done"), type: "terminal" as const },
			],
		},
		project: {
			name: t("Project Management"),
			description: t("Standard project management workflow"),
			stages: [
				{ id: "planning", name: t("Planning"), type: "linear" as const },
				{
					id: "development",
					name: t("Development"),
					type: "cycle" as const,
					subStages: [
						{ id: "coding", name: t("Coding") },
						{ id: "testing", name: t("Testing") },
					],
				},
				{ id: "review", name: t("Review"), type: "linear" as const },
				{ id: "completed", name: t("Completed"), type: "terminal" as const },
			],
		},
		research: {
			name: t("Research Process"),
			description: t("Academic or professional research workflow"),
			stages: [
				{ id: "literature_review", name: t("Literature Review"), type: "linear" as const },
				{ id: "data_collection", name: t("Data Collection"), type: "cycle" as const },
				{ id: "analysis", name: t("Analysis"), type: "cycle" as const },
				{ id: "writing", name: t("Writing"), type: "linear" as const },
				{ id: "published", name: t("Published"), type: "terminal" as const },
			],
		},
		custom: {
			name: t("Custom Workflow"),
			description: t("Create a custom workflow from scratch"),
			stages: [],
		},
	};

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		onSave: (workflow: WorkflowDefinition) => void
	) {
		super(app);
		this.plugin = plugin;
		this.onSave = onSave;
		this.workflow = {
			id: "",
			name: "",
			description: "",
			stages: [],
			metadata: {
				version: "1.0",
				created: new Date().toISOString().split("T")[0],
				lastModified: new Date().toISOString().split("T")[0],
			},
		};
	}

	onOpen() {
		const { contentEl, titleEl } = this;
		this.modalEl.toggleClass("quick-workflow-modal", true);

		titleEl.setText(t("Quick Workflow Creation"));

		this.createTemplateSelection(contentEl);
		this.createWorkflowForm(contentEl);
		this.createButtons(contentEl);
	}

	private createTemplateSelection(container: HTMLElement) {
		const templateSection = container.createDiv({ cls: "workflow-template-section" });

		new Setting(templateSection)
			.setName(t("Workflow Template"))
			.setDesc(t("Choose a template to start with or create a custom workflow"))
			.addDropdown((dropdown) => {
				Object.entries(this.templates).forEach(([key, template]) => {
					dropdown.addOption(key, template.name);
				});

				dropdown.setValue(this.templateType).onChange((value) => {
					this.templateType = value;
					this.applyTemplate();
					this.refreshForm();
				});
			});

		// Template description
		const descContainer = templateSection.createDiv({ cls: "template-description" });
		this.updateTemplateDescription(descContainer);
	}

	private createWorkflowForm(container: HTMLElement) {
		const formSection = container.createDiv({ cls: "workflow-form-section" });

		// Basic workflow info
		new Setting(formSection)
			.setName(t("Workflow Name"))
			.setDesc(t("A descriptive name for your workflow"))
			.addText((text) => {
				text.setValue(this.workflow.name || "")
					.setPlaceholder(t("Enter workflow name"))
					.onChange((value) => {
						this.workflow.name = value;
						// Auto-generate ID if not manually set
						if (!this.workflow.id || this.workflow.id === this.generateIdFromName(this.workflow.name || "")) {
							this.workflow.id = this.generateIdFromName(value);
						}
					});
			});

		new Setting(formSection)
			.setName(t("Workflow ID"))
			.setDesc(t("Unique identifier (auto-generated from name)"))
			.addText((text) => {
				text.setValue(this.workflow.id || "")
					.setPlaceholder("workflow_id")
					.onChange((value) => {
						this.workflow.id = value;
					});
			});

		new Setting(formSection)
			.setName(t("Description"))
			.setDesc(t("Optional description of the workflow purpose"))
			.addTextArea((textarea) => {
				textarea
					.setValue(this.workflow.description || "")
					.setPlaceholder(t("Describe your workflow..."))
					.onChange((value) => {
						this.workflow.description = value;
					});
				textarea.inputEl.rows = 2;
			});

		// Stages preview
		this.createStagesPreview(formSection);
	}

	private createStagesPreview(container: HTMLElement) {
		const stagesSection = container.createDiv({ cls: "workflow-stages-preview" });
		
		const stagesHeader = new Setting(stagesSection)
			.setName(t("Workflow Stages"))
			.setDesc(t("Preview of workflow stages (edit after creation for advanced options)"));

		stagesHeader.addButton((button) => {
			button
				.setButtonText(t("Add Stage"))
				.setIcon("plus")
				.onClick(() => {
					this.addQuickStage();
				});
		});

		this.renderStagesPreview(stagesSection);
	}

	private renderStagesPreview(container: HTMLElement) {
		// Clear existing preview
		const existingPreview = container.querySelector(".stages-preview-list");
		if (existingPreview) {
			existingPreview.remove();
		}

		if (!this.workflow.stages || this.workflow.stages.length === 0) {
			container.createDiv({
				cls: "no-stages-message",
				text: t("No stages defined. Choose a template or add stages manually."),
			});
			return;
		}

		const stagesList = container.createDiv({ cls: "stages-preview-list" });

		this.workflow.stages.forEach((stage, index) => {
			const stageItem = stagesList.createDiv({ cls: "stage-preview-item" });
			
			const stageInfo = stageItem.createDiv({ cls: "stage-info" });
			stageInfo.createSpan({ cls: "stage-name", text: stage.name });
			stageInfo.createSpan({ cls: "stage-type", text: `(${stage.type})` });

			const stageActions = stageItem.createDiv({ cls: "stage-actions" });
			
			// Remove button
			const removeBtn = new ButtonComponent(stageActions);
			removeBtn
				.setIcon("trash")
				.setTooltip(t("Remove stage"))
				.onClick(() => {
					this.workflow.stages?.splice(index, 1);
					this.renderStagesPreview(container);
				});
		});
	}

	private createButtons(container: HTMLElement) {
		const buttonContainer = container.createDiv({ cls: "workflow-modal-buttons" });

		const cancelButton = buttonContainer.createEl("button", {
			text: t("Cancel"),
			cls: "workflow-cancel-button",
		});
		cancelButton.addEventListener("click", () => this.close());

		const saveButton = buttonContainer.createEl("button", {
			text: t("Create Workflow"),
			cls: "workflow-save-button mod-cta",
		});
		saveButton.addEventListener("click", () => this.handleSave());
	}

	private applyTemplate() {
		const template = this.templates[this.templateType as keyof typeof this.templates];
		if (template) {
			this.workflow.name = template.name;
			this.workflow.id = this.generateIdFromName(template.name);
			this.workflow.description = template.description;
			this.workflow.stages = JSON.parse(JSON.stringify(template.stages));
		}
	}

	private updateTemplateDescription(container: HTMLElement) {
		container.empty();
		const template = this.templates[this.templateType as keyof typeof this.templates];
		if (template) {
			container.createEl("p", {
				cls: "template-desc-text",
				text: template.description,
			});
		}
	}

	private refreshForm() {
		this.contentEl.empty();
		this.createTemplateSelection(this.contentEl);
		this.createWorkflowForm(this.contentEl);
		this.createButtons(this.contentEl);
	}

	private addQuickStage() {
		if (!this.workflow.stages) {
			this.workflow.stages = [];
		}

		const stageName = `Stage ${this.workflow.stages.length + 1}`;
		const newStage: WorkflowStage = {
			id: this.generateIdFromName(stageName),
			name: stageName,
			type: "linear",
		};

		this.workflow.stages.push(newStage);
		this.renderStagesPreview(this.contentEl.querySelector(".workflow-stages-preview") as HTMLElement);
	}

	private generateIdFromName(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, "")
			.replace(/\s+/g, "_")
			.substring(0, 30);
	}

	private handleSave() {
		if (!this.workflow.name || !this.workflow.id) {
			new Notice(t("Please provide a workflow name and ID"));
			return;
		}

		if (!this.workflow.stages || this.workflow.stages.length === 0) {
			new Notice(t("Please add at least one stage to the workflow"));
			return;
		}

		// Ensure the workflow has all required properties
		const completeWorkflow: WorkflowDefinition = {
			id: this.workflow.id,
			name: this.workflow.name,
			description: this.workflow.description || "",
			stages: this.workflow.stages,
			metadata: this.workflow.metadata || {
				version: "1.0",
				created: new Date().toISOString().split("T")[0],
				lastModified: new Date().toISOString().split("T")[0],
			},
		};

		this.onSave(completeWorkflow);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}
