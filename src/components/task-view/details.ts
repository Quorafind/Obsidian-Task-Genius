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
import { Task } from "../../types/task";
import TaskProgressBarPlugin from "../../index";
import { TaskProgressBarSettings } from "../../common/setting-definition";
import "../../styles/task-details.css";
import { t } from "../../translations/helper";
import { clearAllMarks } from "../MarkdownRenderer";
import { StatusComponent } from "../StatusComponent";
import { ContextSuggest, ProjectSuggest, TagSuggest } from "../AutoComplete";
import { FileTask } from "../../types/file-task";
import { getEffectiveProject, isProjectReadonly } from "../../utils/taskUtil";

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
		// if (task.metadata.project) {
		// 	this.addMetadataField(metaEl, "Project", task.metadata.project);
		// }

		// if (task.metadata.dueDate) {
		// 	const dueDateText = new Date(task.metadata.dueDate).toLocaleDateString();
		// 	this.addMetadataField(metaEl, "Due Date", dueDateText);
		// }

		// if (task.metadata.startDate) {
		// 	const startDateText = new Date(task.metadata.startDate).toLocaleDateString();
		// 	this.addMetadataField(metaEl, "Start Date", startDateText);
		// }

		// if (task.metadata.scheduledDate) {
		// 	const scheduledDateText = new Date(
		// 		task.metadata.scheduledDate
		// 	).toLocaleDateString();
		// 	this.addMetadataField(metaEl, "Scheduled Date", scheduledDateText);
		// }

		// if (task.metadata.completedDate) {
		// 	const completedDateText = new Date(
		// 		task.metadata.completedDate
		// 	).toLocaleDateString();
		// 	this.addMetadataField(metaEl, "Completed", completedDateText);
		// }

		// if (task.metadata.priority) {
		// 	let priorityText = "Low";
		// 	switch (task.metadata.priority) {
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

		// if (task.metadata.tags && task.metadata.tags.length > 0) {
		// 	this.addMetadataField(metaEl, "Tags", task.metadata.tags.join(", "));
		// }

		// if (task.metadata.context) {
		// 	this.addMetadataField(metaEl, "Context", task.metadata.context);
		// }

		// if (task.metadata.recurrence) {
		// 	this.addMetadataField(metaEl, "Recurrence", task.metadata.recurrence);
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

		// Get effective project and readonly status
		const effectiveProject = getEffectiveProject(task);
		const isReadonly = isProjectReadonly(task);

		const projectInput = new TextComponent(projectField);
		projectInput.setValue(effectiveProject || "");

		// Add visual indicator for tgProject - only show if no user-set project exists
		if (
			task.metadata.tgProject &&
			(!task.metadata.project || !task.metadata.project.trim())
		) {
			const tgProject = task.metadata.tgProject;
			const indicator = projectField.createDiv({
				cls: "project-source-indicator",
			});

			// Create indicator text based on tgProject type
			let indicatorText = "";
			let indicatorIcon = "";

			switch (tgProject.type) {
				case "path":
					indicatorText =
						t("Auto-assigned from path") + `: ${tgProject.source}`;
					indicatorIcon = "📁";
					break;
				case "metadata":
					indicatorText =
						t("Auto-assigned from file metadata") +
						`: ${tgProject.source}`;
					indicatorIcon = "📄";
					break;
				case "config":
					indicatorText =
						t("Auto-assigned from config file") +
						`: ${tgProject.source}`;
					indicatorIcon = "⚙️";
					break;
				default:
					indicatorText =
						t("Auto-assigned") + `: ${tgProject.source}`;
					indicatorIcon = "🔗";
			}

			indicator.createEl("span", {
				cls: "indicator-icon",
				text: indicatorIcon,
			});
			indicator.createEl("span", {
				cls: "indicator-text",
				text: indicatorText,
			});

			if (isReadonly) {
				indicator.addClass("readonly-indicator");
				projectInput.setDisabled(true);
				projectField.createDiv({
					cls: "field-description readonly-description",
					text: t(
						"This project is automatically assigned and cannot be changed"
					),
				});
			} else {
				indicator.addClass("override-indicator");
				projectField.createDiv({
					cls: "field-description override-description",
					text: t(
						"You can override the auto-assigned project by entering a different value"
					),
				});
			}
		}

		new ProjectSuggest(this.app, projectInput.inputEl, this.plugin);

		// Tags field
		const tagsField = this.createFormField(this.editFormEl, t("Tags"));
		const tagsInput = new TextComponent(tagsField);
		console.log("tagsInput", tagsInput, task.metadata.tags);
		tagsInput.setValue(
			task.metadata.tags ? task.metadata.tags.join(", ") : ""
		);
		tagsField
			.createSpan({ cls: "field-description" })
			.setText(
				t("Comma separated") + " " + t("e.g. #tag1, #tag2, #tag3")
			);

		new TagSuggest(this.app, tagsInput.inputEl, this.plugin);

		// Context field
		const contextField = this.createFormField(
			this.editFormEl,
			t("Context")
		);
		const contextInput = new TextComponent(contextField);
		contextInput.setValue(task.metadata.context || "");

		new ContextSuggest(this.app, contextInput.inputEl, this.plugin);

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
		if (task.metadata.priority) {
			priorityDropdown.setValue(task.metadata.priority.toString());
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
		if (task.metadata.dueDate) {
			// Use local date to avoid timezone issues
			const date = new Date(task.metadata.dueDate);
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			dueDateInput.value = `${year}-${month}-${day}`;
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
		if (task.metadata.startDate) {
			// Use local date to avoid timezone issues
			const date = new Date(task.metadata.startDate);
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			startDateInput.value = `${year}-${month}-${day}`;
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
		if (task.metadata.scheduledDate) {
			// Use local date to avoid timezone issues
			const date = new Date(task.metadata.scheduledDate);
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			scheduledDateInput.value = `${year}-${month}-${day}`;
		}

		// Cancelled date
		const cancelledDateField = this.createFormField(
			this.editFormEl,
			t("Cancelled Date")
		);
		const cancelledDateInput = cancelledDateField.createEl("input", {
			type: "date",
			cls: "date-input",
		});
		if (task.metadata.cancelledDate) {
			// Use local date to avoid timezone issues
			const date = new Date(task.metadata.cancelledDate);
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			cancelledDateInput.value = `${year}-${month}-${day}`;
		}

		// On completion action
		const onCompletionField = this.createFormField(
			this.editFormEl,
			t("On Completion")
		);
		
		// Import OnCompletionConfigurator dynamically to avoid circular imports
		import("../onCompletion/OnCompletionConfigurator").then(({ OnCompletionConfigurator }) => {
			const onCompletionConfigurator = new OnCompletionConfigurator(
				onCompletionField,
				this.plugin,
				{
					initialValue: task.metadata.onCompletion || "",
					onChange: (value) => {
						// Update the task metadata immediately
						if (task.metadata) {
							task.metadata.onCompletion = value || undefined;
							// Trigger save
							saveTask();
						}
					},
					onValidationChange: (isValid, error) => {
						// Show validation feedback
						const existingMessage = onCompletionField.querySelector('.oncompletion-validation-message');
						if (existingMessage) {
							existingMessage.remove();
						}
						
						if (error) {
							const messageEl = onCompletionField.createDiv({
								cls: 'oncompletion-validation-message error',
								text: error
							});
						} else if (isValid) {
							const messageEl = onCompletionField.createDiv({
								cls: 'oncompletion-validation-message success',
								text: t('Configuration is valid')
							});
						}
					}
				}
			);
			
			this.addChild(onCompletionConfigurator);
		}).catch(error => {
			// Fallback to simple text input if OnCompletionConfigurator fails to load
			console.warn("Failed to load OnCompletionConfigurator, using fallback:", error);
			const onCompletionInput = new TextComponent(onCompletionField);
			onCompletionInput.setValue(task.metadata.onCompletion || "");
			onCompletionField
				.createSpan({ cls: "field-description" })
				.setText(t("Action to execute when task is completed"));
				
			// Register blur event for fallback input
			this.registerDomEvent(onCompletionInput.inputEl, "blur", () => {
				if (task.metadata) {
					task.metadata.onCompletion = onCompletionInput.getValue() || undefined;
					saveTask();
				}
			});
		});

		// Dependencies
		const dependsOnField = this.createFormField(
			this.editFormEl,
			t("Depends On")
		);
		const dependsOnInput = new TextComponent(dependsOnField);
		dependsOnInput.setValue(
			Array.isArray(task.metadata.dependsOn)
				? task.metadata.dependsOn.join(", ")
				: task.metadata.dependsOn || ""
		);
		dependsOnField
			.createSpan({ cls: "field-description" })
			.setText(
				t("Comma-separated list of task IDs this task depends on")
			);

		// Task ID
		const taskIdField = this.createFormField(this.editFormEl, t("Task ID"));
		const taskIdInput = new TextComponent(taskIdField);
		taskIdInput.setValue(task.metadata.id || "");
		taskIdField
			.createSpan({ cls: "field-description" })
			.setText(t("Unique identifier for this task"));

		// Recurrence pattern
		const recurrenceField = this.createFormField(
			this.editFormEl,
			t("Recurrence")
		);
		const recurrenceInput = new TextComponent(recurrenceField);
		recurrenceInput.setValue(task.metadata.recurrence || "");
		recurrenceField
			.createSpan({ cls: "field-description" })
			.setText(t("e.g. every day, every 2 weeks"));

		// Create a debounced save function
		const saveTask = debounce(async () => {
			// Create updated task object
			const updatedTask: Task = { ...task };

			// Update task properties
			updatedTask.content = contentInput.getValue();

			// Update metadata properties
			const metadata = { ...updatedTask.metadata };

			// Parse and update project - Only update if not readonly tgProject
			const projectValue = projectInput.getValue();
			if (!isReadonly) {
				metadata.project = projectValue || undefined;
			} else {
				// Preserve original project metadata for readonly tgProject
				metadata.project = task.metadata.project;
			}

			// Parse and update tags
			const tagsValue = tagsInput.getValue();
			metadata.tags = tagsValue
				? tagsValue
						.split(",")
						.map((tag) => tag.trim())
						.filter((tag) => tag)
				: [];

			// Update context
			const contextValue = contextInput.getValue();
			metadata.context = contextValue || undefined;

			// Parse and update priority
			const priorityValue = priorityDropdown.getValue();
			metadata.priority = priorityValue
				? parseInt(priorityValue)
				: undefined;

			// Parse dates and check if they've changed
			const dueDateValue = dueDateInput.value;
			if (dueDateValue) {
				// Create date in local timezone to avoid timezone offset issues
				const [year, month, day] = dueDateValue.split("-").map(Number);
				const newDueDate = new Date(year, month - 1, day).getTime();
				// Only update if the date has changed or is different from the original
				if (task.metadata.dueDate !== newDueDate) {
					metadata.dueDate = newDueDate;
				} else {
					metadata.dueDate = task.metadata.dueDate;
				}
			} else if (!dueDateValue && task.metadata.dueDate) {
				// Only update if field was cleared and previously had a value
				metadata.dueDate = undefined;
			} else {
				// Keep original value if both are empty/undefined
				metadata.dueDate = task.metadata.dueDate;
			}

			const startDateValue = startDateInput.value;
			if (startDateValue) {
				// Create date in local timezone to avoid timezone offset issues
				const [year, month, day] = startDateValue
					.split("-")
					.map(Number);
				const newStartDate = new Date(year, month - 1, day).getTime();
				// Only update if the date has changed or is different from the original
				if (task.metadata.startDate !== newStartDate) {
					metadata.startDate = newStartDate;
				} else {
					metadata.startDate = task.metadata.startDate;
				}
			} else if (!startDateValue && task.metadata.startDate) {
				// Only update if field was cleared and previously had a value
				metadata.startDate = undefined;
			} else {
				// Keep original value if both are empty/undefined
				metadata.startDate = task.metadata.startDate;
			}

			const scheduledDateValue = scheduledDateInput.value;
			if (scheduledDateValue) {
				// Create date in local timezone to avoid timezone offset issues
				const [year, month, day] = scheduledDateValue
					.split("-")
					.map(Number);
				const newScheduledDate = new Date(
					year,
					month - 1,
					day
				).getTime();
				// Only update if the date has changed or is different from the original
				if (task.metadata.scheduledDate !== newScheduledDate) {
					metadata.scheduledDate = newScheduledDate;
				} else {
					metadata.scheduledDate = task.metadata.scheduledDate;
				}
			} else if (!scheduledDateValue && task.metadata.scheduledDate) {
				// Only update if field was cleared and previously had a value
				metadata.scheduledDate = undefined;
			} else {
				// Keep original value if both are empty/undefined
				metadata.scheduledDate = task.metadata.scheduledDate;
			}

			const cancelledDateValue = cancelledDateInput.value;
			if (cancelledDateValue) {
				// Create date in local timezone to avoid timezone offset issues
				const [year, month, day] = cancelledDateValue
					.split("-")
					.map(Number);
				const newCancelledDate = new Date(
					year,
					month - 1,
					day
				).getTime();
				// Only update if the date has changed or is different from the original
				if (task.metadata.cancelledDate !== newCancelledDate) {
					metadata.cancelledDate = newCancelledDate;
				} else {
					metadata.cancelledDate = task.metadata.cancelledDate;
				}
			} else if (!cancelledDateValue && task.metadata.cancelledDate) {
				// Only update if field was cleared and previously had a value
				metadata.cancelledDate = undefined;
			} else {
				// Keep original value if both are empty/undefined
				metadata.cancelledDate = task.metadata.cancelledDate;
			}

			// onCompletion is now handled by OnCompletionConfigurator

			// Update dependencies
			const dependsOnValue = dependsOnInput.getValue();
			metadata.dependsOn = dependsOnValue
				? dependsOnValue
						.split(",")
						.map((id) => id.trim())
						.filter((id) => id)
				: undefined;

			// Update task ID
			const taskIdValue = taskIdInput.getValue();
			metadata.id = taskIdValue || undefined;

			// Update recurrence
			const recurrenceValue = recurrenceInput.getValue();
			metadata.recurrence = recurrenceValue || undefined;

			// Assign updated metadata back to task
			updatedTask.metadata = metadata;

			// Check if any task data has changed before updating
			const hasChanges = this.hasTaskChanges(task, updatedTask);

			console.log(
				"dueDate",
				task.metadata.dueDate,
				metadata.dueDate,
				hasChanges
			);

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
		// Remove blur events for date inputs to prevent duplicate saves
		// registerBlurEvent(dueDateInput);
		// registerBlurEvent(startDateInput);
		// registerBlurEvent(scheduledDateInput);
		// onCompletion input is now handled by OnCompletionConfigurator or in fallback
		registerBlurEvent(dependsOnInput.inputEl);
		registerBlurEvent(taskIdInput.inputEl);
		registerBlurEvent(recurrenceInput.inputEl);

		// Register change events for date inputs
		registerDateChangeEvent(dueDateInput);
		registerDateChangeEvent(startDateInput);
		registerDateChangeEvent(scheduledDateInput);
		registerDateChangeEvent(cancelledDateInput);
	}

	private hasTaskChanges(
		originalTask: Task | FileTask,
		updatedTask: Task | FileTask
	): boolean {
		// For FileTask objects, we need to avoid comparing the sourceEntry property
		// which contains circular references that can't be JSON.stringify'd
		const isFileTask =
			"isFileTask" in originalTask && originalTask.isFileTask;

		if (isFileTask) {
			// Compare all properties except sourceEntry for FileTask
			const originalCopy = { ...originalTask };
			const updatedCopy = { ...updatedTask };

			// Remove sourceEntry from comparison for FileTask
			if ("sourceEntry" in originalCopy) {
				delete (originalCopy as any).sourceEntry;
			}
			if ("sourceEntry" in updatedCopy) {
				delete (updatedCopy as any).sourceEntry;
			}

			try {
				return (
					JSON.stringify(originalCopy) !== JSON.stringify(updatedCopy)
				);
			} catch (error) {
				console.warn(
					"Failed to compare tasks with JSON.stringify, falling back to property comparison:",
					error
				);
				return this.compareTaskProperties(originalTask, updatedTask);
			}
		} else {
			// For regular Task objects, use JSON.stringify comparison
			try {
				return (
					JSON.stringify(originalTask) !== JSON.stringify(updatedTask)
				);
			} catch (error) {
				console.warn(
					"Failed to compare tasks with JSON.stringify, falling back to property comparison:",
					error
				);
				return this.compareTaskProperties(originalTask, updatedTask);
			}
		}
	}

	private compareTaskProperties(
		originalTask: Task | FileTask,
		updatedTask: Task | FileTask
	): boolean {
		// Compare key properties that can be edited in the form
		const compareProps = [
			"content",
			"project",
			"tags",
			"context",
			"priority",
			"dueDate",
			"startDate",
			"scheduledDate",
			"cancelledDate",
			"onCompletion",
			"dependsOn",
			"id",
			"recurrence",
		];

		for (const prop of compareProps) {
			const originalValue = (originalTask as any)[prop];
			const updatedValue = (updatedTask as any)[prop];

			// Handle array comparison for tags
			if (prop === "tags") {
				const originalTags = Array.isArray(originalValue)
					? originalValue
					: [];
				const updatedTags = Array.isArray(updatedValue)
					? updatedValue
					: [];

				if (originalTags.length !== updatedTags.length) {
					return true;
				}

				for (let i = 0; i < originalTags.length; i++) {
					if (originalTags[i] !== updatedTags[i]) {
						return true;
					}
				}
			} else {
				// Simple value comparison
				if (originalValue !== updatedValue) {
					return true;
				}
			}
		}

		return false;
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

	private async editTask(task: Task | FileTask) {
		if (typeof task === "object" && "isFileTask" in task) {
			const fileTask = task as FileTask;
			const file = this.app.vault.getAbstractFileByPath(
				fileTask.sourceEntry.file.path
			);
			if (!(file instanceof TFile)) return;
			const leaf = this.app.workspace.getLeaf(true);
			await leaf.openFile(file);
			const editor = this.app.workspace.activeEditor?.editor;
			if (editor) {
				editor.setCursor({ line: fileTask.line || 0, ch: 0 });
				editor.focus();
			}
			return;
		}

		// Get the file from the vault
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) return;

		// Open the file
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);

		// Try to set the cursor at the task's line
		const editor = this.app.workspace.activeEditor?.editor;
		if (editor) {
			editor.setCursor({ line: task.line || 0, ch: 0 });
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
