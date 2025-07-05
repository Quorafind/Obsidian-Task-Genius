import { App, Component, Menu, setIcon } from "obsidian";
import { Task } from "../../types/task";
import { MarkdownRendererComponent } from "../MarkdownRenderer";
import "../../styles/task-list.css";
import { createTaskCheckbox } from "./details";
import { getRelativeTimeString } from "../../utils/dateUtil";
import { t } from "../../translations/helper";
import TaskProgressBarPlugin from "../../index";
import { TaskProgressBarSettings } from "../../common/setting-definition";
import { InlineEditor, InlineEditorOptions } from "./InlineEditor";
import { InlineEditorManager } from "./InlineEditorManager";

export class TaskListItemComponent extends Component {
	public element: HTMLElement;

	// Events
	public onTaskSelected: (task: Task) => void;
	public onTaskCompleted: (task: Task) => void;
	public onTaskUpdate: (task: Task, updatedTask: Task) => Promise<void>;

	public onTaskContextMenu: (event: MouseEvent, task: Task) => void;

	private markdownRenderer: MarkdownRendererComponent;
	private containerEl: HTMLElement;
	private contentEl: HTMLElement;

	private metadataEl: HTMLElement;

	private settings: TaskProgressBarSettings;

	// Use shared editor manager instead of individual editors
	private static editorManager: InlineEditorManager | null = null;

	constructor(
		private task: Task,
		private viewMode: string,
		private app: App,
		private plugin: TaskProgressBarPlugin
	) {
		super();

		this.element = createEl("div", {
			cls: "task-item",
			attr: { "data-task-id": this.task.id },
		});

		this.settings = this.plugin.settings;

		// Initialize shared editor manager if not exists
		if (!TaskListItemComponent.editorManager) {
			TaskListItemComponent.editorManager = new InlineEditorManager(
				this.app,
				this.plugin
			);
		}
	}

	/**
	 * Get the inline editor from the shared manager when needed
	 */
	private getInlineEditor(): InlineEditor {
		const editorOptions: InlineEditorOptions = {
			onTaskUpdate: async (originalTask: Task, updatedTask: Task) => {
				if (this.onTaskUpdate) {
					console.log(originalTask.content, updatedTask.content);
					try {
						await this.onTaskUpdate(originalTask, updatedTask);
						console.log(
							"listItem onTaskUpdate completed successfully"
						);
						// Don't update task reference here - let onContentEditFinished handle it
					} catch (error) {
						console.error("Error in listItem onTaskUpdate:", error);
						throw error; // Re-throw to let the InlineEditor handle it
					}
				} else {
					console.warn("No onTaskUpdate callback available");
				}
			},
			onContentEditFinished: (
				targetEl: HTMLElement,
				updatedTask: Task
			) => {
				// Update the task reference with the saved task
				this.task = updatedTask;

				// Re-render the markdown content after editing is finished
				this.renderMarkdown();

				// Now it's safe to update the full display
				this.updateTaskDisplay();

				// Release the editor from the manager
				TaskListItemComponent.editorManager?.releaseEditor(
					this.task.id
				);
			},
			onMetadataEditFinished: (
				targetEl: HTMLElement,
				updatedTask: Task,
				fieldType: string
			) => {
				// Update the task reference with the saved task
				this.task = updatedTask;

				// Update the task display to reflect metadata changes
				this.updateTaskDisplay();

				// Release the editor from the manager
				TaskListItemComponent.editorManager?.releaseEditor(
					this.task.id
				);
			},
			useEmbeddedEditor: true, // Enable Obsidian's embedded editor
		};

		return TaskListItemComponent.editorManager!.getEditor(
			this.task,
			editorOptions
		);
	}

	/**
	 * Check if this task is currently being edited
	 */
	private isCurrentlyEditing(): boolean {
		return (
			TaskListItemComponent.editorManager?.hasActiveEditor(
				this.task.id
			) || false
		);
	}

	onload() {
		this.registerDomEvent(this.element, "contextmenu", (event) => {
			console.log("contextmenu", event, this.task);
			if (this.onTaskContextMenu) {
				this.onTaskContextMenu(event, this.task);
			}
		});

		this.renderTaskItem();
	}

	private renderTaskItem() {
		this.element.empty();

		if (this.task.completed) {
			this.element.classList.add("task-completed");
		}

		// Task checkbox for completion status
		const checkboxEl = createEl(
			"div",
			{
				cls: "task-checkbox",
			},
			(el) => {
				// Create a checkbox input element
				const checkbox = createTaskCheckbox(
					this.task.status,
					this.task,
					el
				);

				this.registerDomEvent(checkbox, "click", (event) => {
					event.stopPropagation();

					if (this.onTaskCompleted) {
						this.onTaskCompleted(this.task);
					}

					if (this.task.status === " ") {
						checkbox.checked = true;
						checkbox.dataset.task = "x";
					}
				});
			}
		);

		this.element.appendChild(checkboxEl);
		this.containerEl = this.element.createDiv({
			cls: "task-item-container",
		});

		// Task content
		this.contentEl = createDiv({
			cls: "task-item-content",
		});

		this.containerEl.appendChild(this.contentEl);

		// Make content clickable for editing
		this.registerContentClickHandler();

		this.renderMarkdown();

		this.metadataEl = this.containerEl.createDiv({
			cls: "task-item-metadata",
		});

		this.renderMetadata();

		// Priority indicator if available
		if (this.task.metadata.priority) {
			console.log("priority", this.task.metadata.priority);

			// Convert priority to numeric value
			let numericPriority: number;
			if (typeof this.task.metadata.priority === "string") {
				switch ((this.task.metadata.priority as string).toLowerCase()) {
					case "low":
						numericPriority = 1;
						break;
					case "medium":
						numericPriority = 2;
						break;
					case "high":
						numericPriority = 3;
						break;
					default:
						numericPriority =
							parseInt(this.task.metadata.priority) || 1;
						break;
				}
			} else {
				numericPriority = this.task.metadata.priority;
			}

			const priorityEl = createDiv({
				cls: ["task-priority", `priority-${numericPriority}`],
			});

			// Priority icon based on level
			let icon = "•";
			icon = "!".repeat(numericPriority);

			priorityEl.textContent = icon;
			this.element.appendChild(priorityEl);
		}

		// Click handler to select task
		this.registerDomEvent(this.element, "click", () => {
			if (this.onTaskSelected) {
				this.onTaskSelected(this.task);
			}
		});
	}

	private renderMetadata() {
		this.metadataEl.empty();

		// For cancelled tasks, show cancelled date (independent of completion status)
		if (this.task.metadata.cancelledDate) {
			this.renderDateMetadata(
				"cancelled",
				this.task.metadata.cancelledDate
			);
		}

		// Display dates based on task completion status
		if (!this.task.completed) {
			// For incomplete tasks, show due, scheduled, and start dates

			// Due date if available
			if (this.task.metadata.dueDate) {
				this.renderDateMetadata("due", this.task.metadata.dueDate);
			}

			// Scheduled date if available
			if (this.task.metadata.scheduledDate) {
				this.renderDateMetadata(
					"scheduled",
					this.task.metadata.scheduledDate
				);
			}

			// Start date if available
			if (this.task.metadata.startDate) {
				this.renderDateMetadata("start", this.task.metadata.startDate);
			}

			// Recurrence if available
			if (this.task.metadata.recurrence) {
				this.renderRecurrenceMetadata();
			}
		} else {
			// For completed tasks, show completion date
			if (this.task.metadata.completedDate) {
				this.renderDateMetadata(
					"completed",
					this.task.metadata.completedDate
				);
			}

			// Created date if available
			if (this.task.metadata.createdDate) {
				this.renderDateMetadata(
					"created",
					this.task.metadata.createdDate
				);
			}
		}

		// Project badge if available and not in project view
		if (
			(this.task.metadata.project || this.task.metadata.tgProject) &&
			this.viewMode !== "projects"
		) {
			this.renderProjectMetadata();
		}

		// Tags if available
		if (this.task.metadata.tags && this.task.metadata.tags.length > 0) {
			this.renderTagsMetadata();
		}

		// OnCompletion if available
		if (this.task.metadata.onCompletion) {
			this.renderOnCompletionMetadata();
		}

		// DependsOn if available
		if (
			this.task.metadata.dependsOn &&
			this.task.metadata.dependsOn.length > 0
		) {
			this.renderDependsOnMetadata();
		}

		// ID if available
		if (this.task.metadata.id) {
			this.renderIdMetadata();
		}

		// Add metadata button for adding new metadata
		this.renderAddMetadataButton();
	}

	private renderDateMetadata(
		type:
			| "due"
			| "scheduled"
			| "start"
			| "completed"
			| "cancelled"
			| "created",
		dateValue: number
	) {
		const dateEl = this.metadataEl.createEl("div", {
			cls: ["task-date", `task-${type}-date`],
		});

		const date = new Date(dateValue);
		let dateText = "";
		let cssClass = "";

		if (type === "due") {
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			const tomorrow = new Date(today);
			tomorrow.setDate(tomorrow.getDate() + 1);

			// Format date
			if (date.getTime() < today.getTime()) {
				dateText =
					t("Overdue") +
					(this.settings.useRelativeTimeForDate
						? " | " + getRelativeTimeString(date)
						: "");
				cssClass = "task-overdue";
			} else if (date.getTime() === today.getTime()) {
				dateText = this.settings.useRelativeTimeForDate
					? getRelativeTimeString(date) || "Today"
					: "Today";
				cssClass = "task-due-today";
			} else if (date.getTime() === tomorrow.getTime()) {
				dateText = this.settings.useRelativeTimeForDate
					? getRelativeTimeString(date) || "Tomorrow"
					: "Tomorrow";
				cssClass = "task-due-tomorrow";
			} else {
				dateText = date.toLocaleDateString("en-US", {
					year: "numeric",
					month: "long",
					day: "numeric",
				});
			}
		} else {
			dateText = this.settings.useRelativeTimeForDate
				? getRelativeTimeString(date)
				: date.toLocaleDateString("en-US", {
						year: "numeric",
						month: "long",
						day: "numeric",
				  });
		}

		if (cssClass) {
			dateEl.classList.add(cssClass);
		}

		dateEl.textContent = dateText;
		dateEl.setAttribute("aria-label", date.toLocaleDateString());

		// Make date clickable for editing only if inline editor is enabled
		if (this.plugin.settings.enableInlineEditor) {
			this.registerDomEvent(dateEl, "click", (e) => {
				e.stopPropagation();
				if (!this.isCurrentlyEditing()) {
					const dateString = this.formatDateForInput(date);
					const fieldType =
						type === "due"
							? "dueDate"
							: type === "scheduled"
							? "scheduledDate"
							: type === "start"
							? "startDate"
							: type === "cancelled"
							? "cancelledDate"
							: type === "completed"
							? "completedDate"
							: null;

					if (fieldType) {
						this.getInlineEditor().showMetadataEditor(
							dateEl,
							fieldType,
							dateString
						);
					}
				}
			});
		}
	}

	private renderProjectMetadata() {
		// Determine which project to display: original project or tgProject
		let projectName: string | undefined;
		let isReadonly = false;

		if (this.task.metadata.project) {
			// Use original project if available
			projectName = this.task.metadata.project;
		} else if (this.task.metadata.tgProject) {
			// Use tgProject as fallback
			projectName = this.task.metadata.tgProject.name;
			isReadonly = this.task.metadata.tgProject.readonly || false;
		}

		if (!projectName) return;

		const projectEl = this.metadataEl.createEl("div", {
			cls: "task-project",
		});

		// Add a visual indicator for tgProject
		if (!this.task.metadata.project && this.task.metadata.tgProject) {
			projectEl.addClass("task-project-tg");
			projectEl.title = `Project from ${
				this.task.metadata.tgProject.type
			}: ${this.task.metadata.tgProject.source || ""}`;
		}

		projectEl.textContent = projectName.split("/").pop() || projectName;

		// Make project clickable for editing only if inline editor is enabled and not readonly
		if (this.plugin.settings.enableInlineEditor && !isReadonly) {
			this.registerDomEvent(projectEl, "click", (e) => {
				e.stopPropagation();
				if (!this.isCurrentlyEditing()) {
					this.getInlineEditor().showMetadataEditor(
						projectEl,
						"project",
						this.task.metadata.project || ""
					);
				}
			});
		}
	}

	private renderTagsMetadata() {
		const tagsContainer = this.metadataEl.createEl("div", {
			cls: "task-tags-container",
		});

		this.task.metadata.tags
			.filter((tag) => !tag.startsWith("#project"))
			.forEach((tag) => {
				const tagEl = tagsContainer.createEl("span", {
					cls: "task-tag",
					text: tag.startsWith("#") ? tag : `#${tag}`,
				});

				// Make tag clickable for editing only if inline editor is enabled
				if (this.plugin.settings.enableInlineEditor) {
					this.registerDomEvent(tagEl, "click", (e) => {
						e.stopPropagation();
						if (!this.isCurrentlyEditing()) {
							const tagsString =
								this.task.metadata.tags?.join(", ") || "";
							this.getInlineEditor().showMetadataEditor(
								tagsContainer,
								"tags",
								tagsString
							);
						}
					});
				}
			});
	}

	private renderRecurrenceMetadata() {
		const recurrenceEl = this.metadataEl.createEl("div", {
			cls: "task-date task-recurrence",
		});
		recurrenceEl.textContent = this.task.metadata.recurrence || "";

		// Make recurrence clickable for editing only if inline editor is enabled
		if (this.plugin.settings.enableInlineEditor) {
			this.registerDomEvent(recurrenceEl, "click", (e) => {
				e.stopPropagation();
				if (!this.isCurrentlyEditing()) {
					this.getInlineEditor().showMetadataEditor(
						recurrenceEl,
						"recurrence",
						this.task.metadata.recurrence || ""
					);
				}
			});
		}
	}

	private renderOnCompletionMetadata() {
		const onCompletionEl = this.metadataEl.createEl("div", {
			cls: "task-oncompletion",
		});
		onCompletionEl.textContent = `🏁 ${this.task.metadata.onCompletion}`;

		// Make onCompletion clickable for editing only if inline editor is enabled
		if (this.plugin.settings.enableInlineEditor) {
			this.registerDomEvent(onCompletionEl, "click", (e) => {
				e.stopPropagation();
				if (!this.isCurrentlyEditing()) {
					this.getInlineEditor().showMetadataEditor(
						onCompletionEl,
						"onCompletion",
						this.task.metadata.onCompletion || ""
					);
				}
			});
		}
	}

	private renderDependsOnMetadata() {
		const dependsOnEl = this.metadataEl.createEl("div", {
			cls: "task-dependson",
		});
		dependsOnEl.textContent = `⛔ ${this.task.metadata.dependsOn?.join(
			", "
		)}`;

		// Make dependsOn clickable for editing only if inline editor is enabled
		if (this.plugin.settings.enableInlineEditor) {
			this.registerDomEvent(dependsOnEl, "click", (e) => {
				e.stopPropagation();
				if (!this.isCurrentlyEditing()) {
					this.getInlineEditor().showMetadataEditor(
						dependsOnEl,
						"dependsOn",
						this.task.metadata.dependsOn?.join(", ") || ""
					);
				}
			});
		}
	}

	private renderIdMetadata() {
		const idEl = this.metadataEl.createEl("div", {
			cls: "task-id",
		});
		idEl.textContent = `🆔 ${this.task.metadata.id}`;

		// Make id clickable for editing only if inline editor is enabled
		if (this.plugin.settings.enableInlineEditor) {
			this.registerDomEvent(idEl, "click", (e) => {
				e.stopPropagation();
				if (!this.isCurrentlyEditing()) {
					this.getInlineEditor().showMetadataEditor(
						idEl,
						"id",
						this.task.metadata.id || ""
					);
				}
			});
		}
	}

	private renderAddMetadataButton() {
		// Only show add metadata button if inline editor is enabled
		if (!this.plugin.settings.enableInlineEditor) {
			return;
		}

		const addButtonContainer = this.metadataEl.createDiv({
			cls: "add-metadata-container",
		});

		// Create the add metadata button
		const addBtn = addButtonContainer.createEl("button", {
			cls: "add-metadata-btn",
			attr: { "aria-label": "Add metadata" },
		});
		setIcon(addBtn, "plus");

		this.registerDomEvent(addBtn, "click", (e) => {
			e.stopPropagation();
			// Show metadata menu directly instead of calling showAddMetadataButton
			this.showMetadataMenu(addBtn);
		});
	}

	private showMetadataMenu(buttonEl: HTMLElement): void {
		const editor = this.getInlineEditor();

		// Create a temporary menu container
		const menu = new Menu();

		const availableFields = [
			{ key: "project", label: "Project", icon: "folder" },
			{ key: "tags", label: "Tags", icon: "tag" },
			{ key: "context", label: "Context", icon: "at-sign" },
			{ key: "dueDate", label: "Due Date", icon: "calendar" },
			{ key: "startDate", label: "Start Date", icon: "play" },
			{ key: "scheduledDate", label: "Scheduled Date", icon: "clock" },
			{ key: "cancelledDate", label: "Cancelled Date", icon: "x" },
			{ key: "completedDate", label: "Completed Date", icon: "check" },
			{ key: "priority", label: "Priority", icon: "alert-triangle" },
			{ key: "recurrence", label: "Recurrence", icon: "repeat" },
			{ key: "onCompletion", label: "On Completion", icon: "flag" },
			{ key: "dependsOn", label: "Depends On", icon: "link" },
			{ key: "id", label: "Task ID", icon: "hash" },
		];

		// Filter out fields that already have values
		const fieldsToShow = availableFields.filter((field) => {
			switch (field.key) {
				case "project":
					return !this.task.metadata.project;
				case "tags":
					return (
						!this.task.metadata.tags ||
						this.task.metadata.tags.length === 0
					);
				case "context":
					return !this.task.metadata.context;
				case "dueDate":
					return !this.task.metadata.dueDate;
				case "startDate":
					return !this.task.metadata.startDate;
				case "scheduledDate":
					return !this.task.metadata.scheduledDate;
				case "cancelledDate":
					return !this.task.metadata.cancelledDate;
				case "completedDate":
					return !this.task.metadata.completedDate;
				case "priority":
					return !this.task.metadata.priority;
				case "recurrence":
					return !this.task.metadata.recurrence;
				case "onCompletion":
					return !this.task.metadata.onCompletion;
				case "dependsOn":
					return (
						!this.task.metadata.dependsOn ||
						this.task.metadata.dependsOn.length === 0
					);
				case "id":
					return !this.task.metadata.id;
				default:
					return true;
			}
		});

		// If no fields are available to add, show a message
		if (fieldsToShow.length === 0) {
			menu.addItem((item) => {
				item.setTitle(
					"All metadata fields are already set"
				).setDisabled(true);
			});
		} else {
			fieldsToShow.forEach((field) => {
				menu.addItem((item: any) => {
					item.setTitle(field.label)
						.setIcon(field.icon)
						.onClick(() => {
							// Create a temporary container for the metadata editor
							const tempContainer =
								buttonEl.parentElement!.createDiv({
									cls: "temp-metadata-editor-container",
								});

							editor.showMetadataEditor(
								tempContainer,
								field.key as any
							);
						});
				});
			});
		}

		menu.showAtPosition({
			x: buttonEl.getBoundingClientRect().left,
			y: buttonEl.getBoundingClientRect().bottom,
		});
	}

	private formatDateForInput(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	private renderMarkdown() {
		// Clear existing content if needed
		if (this.markdownRenderer) {
			this.removeChild(this.markdownRenderer);
		}

		// Clear the content element
		this.contentEl.empty();

		// Create new renderer
		this.markdownRenderer = new MarkdownRendererComponent(
			this.app,
			this.contentEl,
			this.task.filePath
		);
		this.addChild(this.markdownRenderer);

		// Render the markdown content
		this.markdownRenderer.render(this.task.originalMarkdown || "\u200b");

		// Re-register the click event for editing after rendering
		this.registerContentClickHandler();
	}

	/**
	 * Register click handler for content editing
	 */
	private registerContentClickHandler() {
		// Only enable inline editing if the setting is enabled
		if (!this.plugin.settings.enableInlineEditor) {
			return;
		}

		// Make content clickable for editing
		this.registerDomEvent(this.contentEl, "click", (e) => {
			e.stopPropagation();
			if (!this.isCurrentlyEditing()) {
				this.getInlineEditor().showContentEditor(this.contentEl);
			}
		});
	}

	private updateTaskDisplay() {
		// Re-render the entire task item
		this.renderTaskItem();
	}

	public getTask(): Task {
		return this.task;
	}

	public updateTask(task: Task) {
		const oldTask = this.task;
		this.task = task;

		// Update completion status
		if (oldTask.completed !== task.completed) {
			if (task.completed) {
				this.element.classList.add("task-completed");
			} else {
				this.element.classList.remove("task-completed");
			}
		}

		// If only the content changed, just update the markdown
		if (oldTask.originalMarkdown !== task.originalMarkdown) {
			// Just re-render the markdown content
			this.contentEl.empty();
			this.renderMarkdown();
		} else {
			// Full refresh needed for other changes
			this.updateTaskDisplay();
		}
	}

	public setSelected(selected: boolean) {
		if (selected) {
			this.element.classList.add("selected");
		} else {
			this.element.classList.remove("selected");
		}
	}

	onunload() {
		// Release editor from manager if this task was being edited
		if (
			TaskListItemComponent.editorManager?.hasActiveEditor(this.task.id)
		) {
			TaskListItemComponent.editorManager.releaseEditor(this.task.id);
		}

		this.element.detach();
	}
}
