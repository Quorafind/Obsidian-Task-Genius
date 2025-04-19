import {
	Component,
	ExtraButtonComponent,
	TFile,
	ButtonComponent,
	DropdownComponent,
	TextComponent,
	moment,
	App,
	Menu,
	debounce,
} from "obsidian";
import { Task } from "../../utils/types/TaskIndex";
import TaskProgressBarPlugin from "../../index";
import { TaskProgressBarSettings } from "../../common/setting-definition";
import "../../styles/task-details.css";
import { t } from "../../translations/helper";
import { clearAllMarks } from "../MarkdownRenderer";
import { StatusComponent } from "../StatusComponent";

function getStatus(task: Task, settings: TaskProgressBarSettings) {
	const status = Object.keys(settings.taskStatuses).find((key) => {
		return settings.taskStatuses[key as keyof typeof settings.taskStatuses]
			.split("|")
			.includes(task.status);
	});

	const statusTextMap = {
		notStarted: "Not Started",
		abandoned: "Abandoned",
		planned: "Planned",
		completed: "Completed",
		inProgress: "In Progress",
	};

	return statusTextMap[status as keyof typeof statusTextMap] || "No status";
}

export function getStatusText(
	status: string,
	settings: TaskProgressBarSettings
) {
	const statusTextMap = {
		notStarted: "Not Started",
		abandoned: "Abandoned",
		planned: "Planned",
		completed: "Completed",
		inProgress: "In Progress",
	};

	return statusTextMap[status as keyof typeof statusTextMap] || "No status";
}

export function createTaskCheckbox(
	status: string,
	task: Task,
	container: HTMLElement
) {
	const checkbox = container.createEl("input", {
		cls: "task-list-item-checkbox",
		type: "checkbox",
	});
	console.log("status", status, task.status);
	checkbox.dataset.task = status;
	if (status !== " ") {
		checkbox.checked = true;
	}

	return checkbox;
}

export class TaskDetailsComponent extends Component {
	public containerEl: HTMLElement;
	private contentEl: HTMLElement;
	public currentTask: Task | null = null;
	private isVisible: boolean = true;
	private isEditing: boolean = false;
	private editFormEl: HTMLElement | null = null;

	// Events
	public onTaskEdit: (task: Task) => void;
	public onTaskUpdate: (task: Task, updatedTask: Task) => Promise<void>;
	public onTaskToggleComplete: (task: Task) => void;

	public toggleDetailsVisibility: (visible: boolean) => void;

	constructor(
		private parentEl: HTMLElement,
		private app: App,
		private plugin: TaskProgressBarPlugin
	) {
		super();
	}

	onload() {
		// Create details container
		this.containerEl = this.parentEl.createDiv({
			cls: "task-details",
		});

		// Initial empty state
		this.showEmptyState();
	}

	private showEmptyState() {
		this.containerEl.empty();

		const emptyEl = this.containerEl.createDiv({ cls: "details-empty" });
		emptyEl.setText(t("Select a task to view details"));
	}

	private getTaskStatus() {
		return this.currentTask?.status || "";
	}

	public showTaskDetails(task: Task) {
		console.log("showTaskDetails", task);
		if (!task) {
			this.currentTask = null;
			this.showEmptyState();
			return;
		}

		this.currentTask = task;
		this.isEditing = false;

		// Clear existing content
		this.containerEl.empty();

		// Create details header
		const headerEl = this.containerEl.createDiv({ cls: "details-header" });
		headerEl.setText(t("Task Details"));

		headerEl.createEl(
			"div",
			{
				cls: "details-close-btn",
			},
			(el) => {
				new ExtraButtonComponent(el).setIcon("x").onClick(() => {
					this.toggleDetailsVisibility &&
						this.toggleDetailsVisibility(false);
				});
			}
		);

		// Create content container
		this.contentEl = this.containerEl.createDiv({ cls: "details-content" });

		// Task name
		const nameEl = this.contentEl.createEl("h2", { cls: "details-name" });
		nameEl.setText(clearAllMarks(task.content));

		// Task status
		this.contentEl.createDiv({ cls: "details-status-container" }, (el) => {
			const labelEl = el.createDiv({ cls: "details-status-label" });
			labelEl.setText(t("Status"));

			const statusEl = el.createDiv({ cls: "details-status" });
			statusEl.setText(getStatus(task, this.plugin.settings));
		});

		const statusComponent = new StatusComponent(
			this.plugin,
			this.contentEl,
			task,
			{
				onTaskUpdate: this.onTaskUpdate,
			}
		);

		this.addChild(statusComponent);

		// // Task metadata
		const metaEl = this.contentEl.createDiv({ cls: "details-metadata" });

		// // Add metadata fields
		// if (task.project) {
		// 	this.addMetadataField(metaEl, "Project", task.project);
		// }

		// if (task.dueDate) {
		// 	const dueDateText = new Date(task.dueDate).toLocaleDateString();
		// 	this.addMetadataField(metaEl, "Due Date", dueDateText);
		// }

		// if (task.startDate) {
		// 	const startDateText = new Date(task.startDate).toLocaleDateString();
		// 	this.addMetadataField(metaEl, "Start Date", startDateText);
		// }

		// if (task.scheduledDate) {
		// 	const scheduledDateText = new Date(
		// 		task.scheduledDate
		// 	).toLocaleDateString();
		// 	this.addMetadataField(metaEl, "Scheduled Date", scheduledDateText);
		// }

		// if (task.completedDate) {
		// 	const completedDateText = new Date(
		// 		task.completedDate
		// 	).toLocaleDateString();
		// 	this.addMetadataField(metaEl, "Completed", completedDateText);
		// }

		// if (task.priority) {
		// 	let priorityText = "Low";
		// 	switch (task.priority) {
		// 		case 1:
		// 			priorityText = "Lowest";
		// 			break;
		// 		case 2:
		// 			priorityText = "Low";
		// 			break;
		// 		case 3:
		// 			priorityText = "Medium";
		// 			break;
		// 		case 4:
		// 			priorityText = "High";
		// 			break;
		// 		case 5:
		// 			priorityText = "Highest";
		// 			break;
		// 		default:
		// 			priorityText = "Low";
		// 	}
		// 	this.addMetadataField(metaEl, "Priority", priorityText);
		// }

		// if (task.tags && task.tags.length > 0) {
		// 	this.addMetadataField(metaEl, "Tags", task.tags.join(", "));
		// }

		// if (task.context) {
		// 	this.addMetadataField(metaEl, "Context", task.context);
		// }

		// if (task.recurrence) {
		// 	this.addMetadataField(metaEl, "Recurrence", task.recurrence);
		// }

		// Task file location
		this.addMetadataField(metaEl, t("File"), task.filePath);

		// Add action controls
		const actionsEl = this.contentEl.createDiv({ cls: "details-actions" });

		// Edit in panel button
		this.showEditForm(task);

		// Edit in file button
		const editInFileBtn = actionsEl.createEl("button", {
			cls: "details-edit-file-btn",
		});
		editInFileBtn.setText(t("Edit in File"));

		this.registerDomEvent(editInFileBtn, "click", () => {
			if (this.onTaskEdit) {
				this.onTaskEdit(task);
			} else {
				this.editTask(task);
			}
		});

		// Toggle completion button
		const toggleBtn = actionsEl.createEl("button", {
			cls: "details-toggle-btn",
		});
		toggleBtn.setText(
			task.completed ? t("Mark Incomplete") : t("Mark Complete")
		);

		this.registerDomEvent(toggleBtn, "click", () => {
			if (this.onTaskToggleComplete) {
				this.onTaskToggleComplete(task);
			}
		});
	}

	private showEditForm(task: Task) {
		if (!task) return;

		this.isEditing = true;

		// Create edit form
		this.editFormEl = this.contentEl.createDiv({
			cls: "details-edit-form",
		});

		// Task content/title
		const contentField = this.createFormField(
			this.editFormEl,
			t("Task Title")
		);
		const contentInput = new TextComponent(contentField);
		console.log("contentInput", contentInput, task.content);
		contentInput.setValue(clearAllMarks(task.content));
		contentInput.inputEl.addClass("details-edit-content");

		// Project dropdown
		const projectField = this.createFormField(
			this.editFormEl,
			t("Project")
		);
		const projectInput = new TextComponent(projectField);
		projectInput.setValue(task.project || "");

		// Tags field
		const tagsField = this.createFormField(this.editFormEl, t("Tags"));
		const tagsInput = new TextComponent(tagsField);
		tagsInput.setValue(task.tags ? task.tags.join(", ") : "");
		tagsField
			.createSpan({ cls: "field-description" })
			.setText(t("Comma separated"));

		// Context field
		const contextField = this.createFormField(
			this.editFormEl,
			t("Context")
		);
		const contextInput = new TextComponent(contextField);
		contextInput.setValue(task.context || "");

		// Priority dropdown
		const priorityField = this.createFormField(
			this.editFormEl,
			t("Priority")
		);
		const priorityDropdown = new DropdownComponent(priorityField);
		priorityDropdown.addOption("", t("None"));
		priorityDropdown.addOption("1", "⏬️ " + t("Lowest"));
		priorityDropdown.addOption("2", "🔽 " + t("Low"));
		priorityDropdown.addOption("3", "🔼 " + t("Medium"));
		priorityDropdown.addOption("4", "⏫ " + t("High"));
		priorityDropdown.addOption("5", "🔺 " + t("Highest"));
		if (task.priority) {
			priorityDropdown.setValue(task.priority.toString());
		} else {
			priorityDropdown.setValue("");
		}

		// Due date
		const dueDateField = this.createFormField(
			this.editFormEl,
			t("Due Date")
		);
		const dueDateInput = dueDateField.createEl("input", {
			type: "date",
			cls: "date-input",
		});
		if (task.dueDate) {
			dueDateInput.value = moment(task.dueDate).format("YYYY-MM-DD");
		}

		// Start date
		const startDateField = this.createFormField(
			this.editFormEl,
			t("Start Date")
		);
		const startDateInput = startDateField.createEl("input", {
			type: "date",
			cls: "date-input",
		});
		if (task.startDate) {
			startDateInput.value = moment(task.startDate).format("YYYY-MM-DD");
		}

		// Scheduled date
		const scheduledDateField = this.createFormField(
			this.editFormEl,
			t("Scheduled Date")
		);
		const scheduledDateInput = scheduledDateField.createEl("input", {
			type: "date",
			cls: "date-input",
		});
		if (task.scheduledDate) {
			scheduledDateInput.value = moment(task.scheduledDate).format(
				"YYYY-MM-DD"
			);
		}

		// Recurrence pattern
		const recurrenceField = this.createFormField(
			this.editFormEl,
			t("Recurrence")
		);
		const recurrenceInput = new TextComponent(recurrenceField);
		recurrenceInput.setValue(task.recurrence || "");
		recurrenceField
			.createSpan({ cls: "field-description" })
			.setText(t("e.g. every day, every 2 weeks"));

		// Create a debounced save function
		const saveTask = debounce(async () => {
			// Create updated task object
			const updatedTask: Task = { ...task };

			// Update task properties
			updatedTask.content = contentInput.getValue();
			updatedTask.project = projectInput.getValue() || undefined;

			// Parse tags
			const tagsValue = tagsInput.getValue();
			updatedTask.tags = tagsValue
				? tagsValue
						.split(",")
						.map((tag) => tag.trim())
						.filter((tag) => tag)
				: [];

			updatedTask.context = contextInput.getValue() || undefined;

			// Parse priority
			const priorityValue = priorityDropdown.getValue();
			updatedTask.priority = priorityValue
				? parseInt(priorityValue)
				: undefined;

			// Parse dates and check if they've changed
			const dueDateValue = dueDateInput.value;
			if (dueDateValue) {
				const newDueDate = moment(dueDateValue, "YYYY-MM-DD").valueOf();
				// Only update if the date has changed or is different from the original
				if (task.dueDate !== newDueDate) {
					updatedTask.dueDate = newDueDate;
				} else {
					updatedTask.dueDate = task.dueDate;
				}
			} else if (!dueDateValue && task.dueDate) {
				// Only update if field was cleared and previously had a value
				updatedTask.dueDate = undefined;
			} else {
				// Keep original value if both are empty/undefined
				updatedTask.dueDate = task.dueDate;
			}

			const startDateValue = startDateInput.value;
			if (startDateValue) {
				const newStartDate = moment(
					startDateValue,
					"YYYY-MM-DD"
				).valueOf();
				// Only update if the date has changed or is different from the original
				if (task.startDate !== newStartDate) {
					updatedTask.startDate = newStartDate;
				} else {
					updatedTask.startDate = task.startDate;
				}
			} else if (!startDateValue && task.startDate) {
				// Only update if field was cleared and previously had a value
				updatedTask.startDate = undefined;
			} else {
				// Keep original value if both are empty/undefined
				updatedTask.startDate = task.startDate;
			}

			const scheduledDateValue = scheduledDateInput.value;
			if (scheduledDateValue) {
				const newScheduledDate = moment(
					scheduledDateValue,
					"YYYY-MM-DD"
				).valueOf();
				// Only update if the date has changed or is different from the original
				if (task.scheduledDate !== newScheduledDate) {
					updatedTask.scheduledDate = newScheduledDate;
				} else {
					updatedTask.scheduledDate = task.scheduledDate;
				}
			} else if (!scheduledDateValue && task.scheduledDate) {
				// Only update if field was cleared and previously had a value
				updatedTask.scheduledDate = undefined;
			} else {
				// Keep original value if both are empty/undefined
				updatedTask.scheduledDate = task.scheduledDate;
			}

			updatedTask.recurrence = recurrenceInput.getValue() || undefined;

			// Check if any task data has changed before updating
			const hasChanges =
				JSON.stringify(task) !== JSON.stringify(updatedTask);

			// Call the update callback only if there are changes
			if (this.onTaskUpdate && hasChanges) {
				try {
					await this.onTaskUpdate(task, updatedTask);

					// Update the current task reference but don't redraw the UI
					this.currentTask = updatedTask;
					console.log("updatedTask", updatedTask);
					this.showTaskDetails(updatedTask);
				} catch (error) {
					console.error("Failed to update task:", error);
					// TODO: Show error message to user
				}
			}
		}, 800); // 800ms debounce time

		// Register blur events for all input elements
		const registerBlurEvent = (
			el: HTMLInputElement | HTMLSelectElement
		) => {
			this.registerDomEvent(el, "blur", () => {
				saveTask();
			});
		};

		// Register change events for date inputs
		const registerDateChangeEvent = (el: HTMLInputElement) => {
			this.registerDomEvent(el, "change", () => {
				saveTask();
			});
		};

		// Register all input elements
		registerBlurEvent(contentInput.inputEl);
		registerBlurEvent(projectInput.inputEl);
		registerBlurEvent(tagsInput.inputEl);
		registerBlurEvent(contextInput.inputEl);
		registerBlurEvent(priorityDropdown.selectEl);
		registerBlurEvent(dueDateInput);
		registerBlurEvent(startDateInput);
		registerBlurEvent(scheduledDateInput);
		registerBlurEvent(recurrenceInput.inputEl);

		// Register change events for date inputs
		registerDateChangeEvent(dueDateInput);
		registerDateChangeEvent(startDateInput);
		registerDateChangeEvent(scheduledDateInput);
	}

	private createFormField(
		container: HTMLElement,
		label: string
	): HTMLElement {
		const fieldEl = container.createDiv({ cls: "details-form-field" });

		fieldEl.createDiv({ cls: "details-form-label", text: label });

		return fieldEl.createDiv({ cls: "details-form-input" });
	}

	private addMetadataField(
		container: HTMLElement,
		label: string,
		value: string
	) {
		const fieldEl = container.createDiv({ cls: "metadata-field" });

		const labelEl = fieldEl.createDiv({ cls: "metadata-label" });
		labelEl.setText(label);

		const valueEl = fieldEl.createDiv({ cls: "metadata-value" });
		valueEl.setText(value);
	}

	private async editTask(task: Task) {
		// Get the file from the vault
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) return;

		// Open the file
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);

		// Try to set the cursor at the task's line
		const editor = this.app.workspace.activeEditor?.editor;
		if (editor) {
			editor.setCursor({ line: task.line, ch: 0 });
			editor.focus();
		}
	}

	public setVisible(visible: boolean) {
		this.isVisible = visible;

		if (visible) {
			this.containerEl.show();
			this.containerEl.addClass("visible");
			this.containerEl.removeClass("hidden");
		} else {
			this.containerEl.addClass("hidden");
			this.containerEl.removeClass("visible");

			// Optionally hide with animation, then truly hide
			setTimeout(() => {
				if (!this.isVisible) {
					this.containerEl.hide();
				}
			}, 300); // match animation duration of 0.3s
		}
	}

	public getCurrentTask(): Task | null {
		return this.currentTask;
	}

	public isCurrentlyEditing(): boolean {
		return this.isEditing;
	}

	onunload() {
		this.containerEl.empty();
		this.containerEl.remove();
	}
}
