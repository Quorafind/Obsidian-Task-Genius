/**
 * Task Details Modal Component
 * Used in mobile environments to display the full task details and editing interface.
 */

import { App, Modal, TFile, MarkdownView, ButtonComponent } from "obsidian";
import { Task } from "../../types/task";
import TaskProgressBarPlugin from "../../index";
import { TaskMetadataEditor } from "./MetadataEditor";
import { t } from "../../translations/helper";

export class TaskDetailsModal extends Modal {
	private task: Task;
	private plugin: TaskProgressBarPlugin;
	private metadataEditor: TaskMetadataEditor;
	private onTaskUpdated: (task: Task) => Promise<void>;

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		task: Task,
		onTaskUpdated?: (task: Task) => Promise<void>
	) {
		super(app);
		this.task = task;
		this.plugin = plugin;
		this.onTaskUpdated = onTaskUpdated || (async () => {});

		// Set modal style
		this.modalEl.addClass("task-details-modal");
		this.titleEl.setText(t("Edit Task"));
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Create metadata editor, use full mode
		this.metadataEditor = new TaskMetadataEditor(
			contentEl,
			this.app,
			this.plugin,
			false // Full mode, not compact mode
		);

		// Initialize editor and display task
		this.metadataEditor.onload();
		this.metadataEditor.showTask(this.task);

		new ButtonComponent(this.contentEl)
			.setIcon("check")
			.setTooltip(t("Save"))
			.onClick(async () => {
				await this.onTaskUpdated(this.task);
				this.close();
			});

		// Listen for metadata change events
		this.metadataEditor.onMetadataChange = async (event) => {
			// Determine if the field is a top-level task property or metadata property
			const topLevelFields = ["status", "completed", "content"];
			const isTopLevelField = topLevelFields.includes(event.field);

			// Create a base task object with the updated field
			const updatedTask = {
				...this.task,
				line: this.task.line - 1,
				id: `${this.task.filePath}-L${this.task.line - 1}`,
			};

			if (isTopLevelField) {
				// Update top-level task property
				(updatedTask as any)[event.field] = event.value;
			} else {
				// Update metadata property
				updatedTask.metadata = {
					...this.task.metadata,
					[event.field]: event.value,
				};
			}

			// Handle special status field logic
			if (
				event.field === "status" &&
				(event.value === "x" || event.value === "X")
			) {
				updatedTask.completed = true;
				updatedTask.metadata = {
					...updatedTask.metadata,
					completedDate: Date.now(),
				};
				// Remove cancelled date if task is completed
				const { cancelledDate, ...metadataWithoutCancelledDate } =
					updatedTask.metadata;
				updatedTask.metadata = metadataWithoutCancelledDate;
			} else if (event.field === "status" && event.value === "-") {
				// If status is changing to cancelled, mark as not completed and add cancelled date
				updatedTask.completed = false;
				const { completedDate, ...metadataWithoutCompletedDate } =
					updatedTask.metadata;
				updatedTask.metadata = {
					...metadataWithoutCompletedDate,
					cancelledDate: Date.now(),
				};
			} else if (event.field === "status") {
				// If status is changing to something else, mark as not completed
				updatedTask.completed = false;
				const {
					completedDate,
					cancelledDate,
					...metadataWithoutDates
				} = updatedTask.metadata;
				updatedTask.metadata = metadataWithoutDates;
			}

			this.task = updatedTask;
		};
	}

	onClose() {
		const { contentEl } = this;
		if (this.metadataEditor) {
			this.metadataEditor.onunload();
		}
		contentEl.empty();
	}

	/**
	 * Updates a task field.
	 */
	private updateTaskField(field: string, value: any) {
		if (field in this.task) {
			(this.task as any)[field] = value;
		}
	}
}
