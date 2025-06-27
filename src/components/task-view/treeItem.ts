import { App, Component, setIcon, Menu } from "obsidian";
import { Task } from "../../types/task";
import { formatDate } from "../../utils/dateUtil";
import "../../styles/tree-view.css";
import { MarkdownRendererComponent } from "../MarkdownRenderer";
import { createTaskCheckbox } from "./details";
import {
	TaskProgressBarSettings,
	getViewSettingOrDefault,
	ViewMode,
} from "../../common/setting-definition";
import { getRelativeTimeString } from "../../utils/dateUtil";
import { t } from "../../translations/helper";
import TaskProgressBarPlugin from "../../index";
import { InlineEditor, InlineEditorOptions } from "./InlineEditor";
import { InlineEditorManager } from "./InlineEditorManager";

export class TaskTreeItemComponent extends Component {
	public element: HTMLElement;
	private task: Task;
	private isSelected: boolean = false;
	private isExpanded: boolean = true;
	private viewMode: string;
	private indentLevel: number = 0;
	private parentContainer: HTMLElement;
	private childrenContainer: HTMLElement;
	private childComponents: TaskTreeItemComponent[] = [];

	private toggleEl: HTMLElement;

	// Events
	public onTaskSelected: (task: Task) => void;
	public onTaskCompleted: (task: Task) => void;
	public onTaskUpdate: (task: Task, updatedTask: Task) => Promise<void>;
	public onToggleExpand: (taskId: string, isExpanded: boolean) => void;

	public onTaskContextMenu: (event: MouseEvent, task: Task) => void;

	private markdownRenderer: MarkdownRendererComponent;
	private contentEl: HTMLElement;
	private taskMap: Map<string, Task>;

	// Use shared editor manager instead of individual editors
	private static editorManager: InlineEditorManager | null = null;

	constructor(
		task: Task,
		viewMode: string,
		private app: App,
		indentLevel: number = 0,
		private childTasks: Task[] = [],
		taskMap: Map<string, Task>,
		private plugin: TaskProgressBarPlugin
	) {
		super();
		this.task = task;
		this.viewMode = viewMode;
		this.indentLevel = indentLevel;
		this.taskMap = taskMap;

		// Initialize shared editor manager if not exists
		if (!TaskTreeItemComponent.editorManager) {
			TaskTreeItemComponent.editorManager = new InlineEditorManager(
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
					try {
						await this.onTaskUpdate(originalTask, updatedTask);
						console.log(
							"treeItem onTaskUpdate completed successfully"
						);
						// Don't update task reference here - let onContentEditFinished handle it
					} catch (error) {
						console.error("Error in treeItem onTaskUpdate:", error);
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
				TaskTreeItemComponent.editorManager?.releaseEditor(
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
				TaskTreeItemComponent.editorManager?.releaseEditor(
					this.task.id
				);
			},
			useEmbeddedEditor: true, // Enable Obsidian's embedded editor
		};

		return TaskTreeItemComponent.editorManager!.getEditor(
			this.task,
			editorOptions
		);
	}

	/**
	 * Check if this task is currently being edited
	 */
	private isCurrentlyEditing(): boolean {
		return (
			TaskTreeItemComponent.editorManager?.hasActiveEditor(
				this.task.id
			) || false
		);
	}

	onload() {
		// Create task item container
		this.element = createDiv({
			cls: ["task-item", "tree-task-item"],
			attr: {
				"data-task-id": this.task.id,
			},
		});

		this.registerDomEvent(this.element, "contextmenu", (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (this.onTaskContextMenu) {
				this.onTaskContextMenu(e, this.task);
			}
		});

		// Create parent container
		this.parentContainer = this.element.createDiv({
			cls: "task-parent-container",
		});

		// Create task content
		this.renderTaskContent();

		// Create container for child tasks
		this.childrenContainer = this.element.createDiv({
			cls: "task-children-container",
		});

		// Render child tasks
		this.renderChildTasks();

		// Register click handler for selection
		this.registerDomEvent(this.parentContainer, "click", (e) => {
			// Only trigger if clicking on the task itself, not children
			if (
				e.target === this.parentContainer ||
				this.parentContainer.contains(e.target as Node)
			) {
				const isCheckbox = (e.target as HTMLElement).classList.contains(
					"task-checkbox"
				);

				if (isCheckbox) {
					e.stopPropagation();
					this.toggleTaskCompletion();
				} else if (
					(e.target as HTMLElement).classList.contains(
						"task-expand-toggle"
					)
				) {
					e.stopPropagation();
				} else {
					this.selectTask();
				}
			}
		});
	}

	private renderTaskContent() {
		// Clear existing content
		this.parentContainer.empty();
		this.parentContainer.classList.toggle("completed", this.task.completed);
		this.parentContainer.classList.toggle("selected", this.isSelected);

		// Indentation based on level
		if (this.indentLevel > 0) {
			const indentEl = this.parentContainer.createDiv({
				cls: "task-indent",
			});
			indentEl.style.width = `${this.indentLevel * 30}px`;
		}

		// Expand/collapse toggle for tasks with children
		if (
			this.task.metadata.children &&
			this.task.metadata.children.length > 0
		) {
			this.toggleEl = this.parentContainer.createDiv({
				cls: "task-expand-toggle",
			});
			setIcon(
				this.toggleEl,
				this.isExpanded ? "chevron-down" : "chevron-right"
			);

			// Register toggle event
			this.registerDomEvent(this.toggleEl, "click", (e) => {
				e.stopPropagation();
				this.toggleExpand();
			});
		}

		// Checkbox
		const checkboxEl = this.parentContainer.createDiv(
			{
				cls: "task-checkbox",
			},
			(el) => {
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

		const taskItemContainer = this.parentContainer.createDiv({
			cls: "task-item-container",
		});

		// Task content with markdown rendering
		this.contentEl = taskItemContainer.createDiv({
			cls: "task-item-content",
		});

		// Make content clickable for editing - only create editor when clicked
		this.registerContentClickHandler();

		this.renderMarkdown();

		// Metadata container
		const metadataEl = taskItemContainer.createDiv({
			cls: "task-metadata",
		});

		this.renderMetadata(metadataEl);

		// Priority indicator if available
		if (this.task.metadata.priority) {
			const priorityEl = createDiv({
				cls: [
					"task-priority",
					`priority-${this.task.metadata.priority}`,
				],
			});

			// Priority icon based on level
			let icon = "•";
			icon = "!".repeat(this.task.metadata.priority);

			priorityEl.textContent = icon;
			this.parentContainer.appendChild(priorityEl);
		}
	}

	private renderMetadata(metadataEl: HTMLElement) {
		metadataEl.empty();

		// For cancelled tasks, show cancelled date (independent of completion status)
		if (this.task.metadata.cancelledDate) {
			this.renderDateMetadata(
				metadataEl,
				"cancelled",
				this.task.metadata.cancelledDate
			);
		}

		// Display dates based on task completion status
		if (!this.task.completed) {
			// Due date if available
			if (this.task.metadata.dueDate) {
				this.renderDateMetadata(
					metadataEl,
					"due",
					this.task.metadata.dueDate
				);
			}

			// Scheduled date if available
			if (this.task.metadata.scheduledDate) {
				this.renderDateMetadata(
					metadataEl,
					"scheduled",
					this.task.metadata.scheduledDate
				);
			}

			// Start date if available
			if (this.task.metadata.startDate) {
				this.renderDateMetadata(
					metadataEl,
					"start",
					this.task.metadata.startDate
				);
			}

			// Recurrence if available
			if (this.task.metadata.recurrence) {
				this.renderRecurrenceMetadata(metadataEl);
			}
		} else {
			// For completed tasks, show completion date
			if (this.task.metadata.completedDate) {
				this.renderDateMetadata(
					metadataEl,
					"completed",
					this.task.metadata.completedDate
				);
			}

			// Created date if available
			if (this.task.metadata.createdDate) {
				this.renderDateMetadata(
					metadataEl,
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
			this.renderProjectMetadata(metadataEl);
		}

		// Tags if available
		if (this.task.metadata.tags && this.task.metadata.tags.length > 0) {
			this.renderTagsMetadata(metadataEl);
		}

		// OnCompletion if available
		if (this.task.metadata.onCompletion) {
			this.renderOnCompletionMetadata(metadataEl);
		}

		// DependsOn if available
		if (
			this.task.metadata.dependsOn &&
			this.task.metadata.dependsOn.length > 0
		) {
			this.renderDependsOnMetadata(metadataEl);
		}

		// ID if available
		if (this.task.metadata.id) {
			this.renderIdMetadata(metadataEl);
		}

		// Add metadata button for adding new metadata
		this.renderAddMetadataButton(metadataEl);
	}

	private renderDateMetadata(
		metadataEl: HTMLElement,
		type:
			| "due"
			| "scheduled"
			| "start"
			| "completed"
			| "cancelled"
			| "created",
		dateValue: number
	) {
		const dateEl = metadataEl.createEl("div", {
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
					(this.plugin.settings?.useRelativeTimeForDate
						? " | " + getRelativeTimeString(date)
						: "");
				cssClass = "task-overdue";
			} else if (date.getTime() === today.getTime()) {
				dateText = this.plugin.settings?.useRelativeTimeForDate
					? getRelativeTimeString(date) || "Today"
					: "Today";
				cssClass = "task-due-today";
			} else if (date.getTime() === tomorrow.getTime()) {
				dateText = this.plugin.settings?.useRelativeTimeForDate
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
			dateText = this.plugin.settings?.useRelativeTimeForDate
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
					const editor = this.getInlineEditor();
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
						editor.showMetadataEditor(
							dateEl,
							fieldType,
							dateString
						);
					}
				}
			});
		}
	}

	private renderProjectMetadata(metadataEl: HTMLElement) {
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

		const projectEl = metadataEl.createEl("div", {
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
					const editor = this.getInlineEditor();
					editor.showMetadataEditor(
						projectEl,
						"project",
						this.task.metadata.project || ""
					);
				}
			});
		}
	}

	private renderTagsMetadata(metadataEl: HTMLElement) {
		const tagsContainer = metadataEl.createEl("div", {
			cls: "task-tags-container",
		});

		const projectPrefix =
			this.plugin.settings.projectTagPrefix[
				this.plugin.settings.preferMetadataFormat
			] || "project";
		this.task.metadata.tags
			.filter((tag) => !tag.startsWith(`#${projectPrefix}`))
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
							const editor = this.getInlineEditor();
							const tagsString =
								this.task.metadata.tags?.join(", ") || "";
							editor.showMetadataEditor(
								tagsContainer,
								"tags",
								tagsString
							);
						}
					});
				}
			});
	}

	private renderRecurrenceMetadata(metadataEl: HTMLElement) {
		const recurrenceEl = metadataEl.createEl("div", {
			cls: "task-date task-recurrence",
		});
		recurrenceEl.textContent = this.task.metadata.recurrence || "";

		// Make recurrence clickable for editing only if inline editor is enabled
		if (this.plugin.settings.enableInlineEditor) {
			this.registerDomEvent(recurrenceEl, "click", (e) => {
				e.stopPropagation();
				if (!this.isCurrentlyEditing()) {
					const editor = this.getInlineEditor();
					editor.showMetadataEditor(
						recurrenceEl,
						"recurrence",
						this.task.metadata.recurrence || ""
					);
				}
			});
		}
	}

	private renderOnCompletionMetadata(metadataEl: HTMLElement) {
		const onCompletionEl = metadataEl.createEl("div", {
			cls: "task-oncompletion",
		});
		onCompletionEl.textContent = `🏁 ${this.task.metadata.onCompletion}`;

		// Make onCompletion clickable for editing only if inline editor is enabled
		if (this.plugin.settings.enableInlineEditor) {
			this.registerDomEvent(onCompletionEl, "click", (e) => {
				e.stopPropagation();
				if (!this.isCurrentlyEditing()) {
					const editor = this.getInlineEditor();
					editor.showMetadataEditor(
						onCompletionEl,
						"onCompletion",
						this.task.metadata.onCompletion || ""
					);
				}
			});
		}
	}

	private renderDependsOnMetadata(metadataEl: HTMLElement) {
		const dependsOnEl = metadataEl.createEl("div", {
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
					const editor = this.getInlineEditor();
					editor.showMetadataEditor(
						dependsOnEl,
						"dependsOn",
						this.task.metadata.dependsOn?.join(", ") || ""
					);
				}
			});
		}
	}

	private renderIdMetadata(metadataEl: HTMLElement) {
		const idEl = metadataEl.createEl("div", {
			cls: "task-id",
		});
		idEl.textContent = `🆔 ${this.task.metadata.id}`;

		// Make id clickable for editing only if inline editor is enabled
		if (this.plugin.settings.enableInlineEditor) {
			this.registerDomEvent(idEl, "click", (e) => {
				e.stopPropagation();
				if (!this.isCurrentlyEditing()) {
					const editor = this.getInlineEditor();
					editor.showMetadataEditor(
						idEl,
						"id",
						this.task.metadata.id || ""
					);
				}
			});
		}
	}

	private renderAddMetadataButton(metadataEl: HTMLElement) {
		// Only show add metadata button if inline editor is enabled
		if (!this.plugin.settings.enableInlineEditor) {
			return;
		}

		const addButtonContainer = metadataEl.createDiv({
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
		this.markdownRenderer.render(this.task.originalMarkdown);

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

		// Make content clickable for editing - only create editor when clicked
		this.registerDomEvent(this.contentEl, "click", (e) => {
			e.stopPropagation();
			if (!this.isCurrentlyEditing()) {
				const editor = this.getInlineEditor();
				editor.showContentEditor(this.contentEl);
			}
		});
	}

	private updateTaskDisplay() {
		// Re-render the task content
		this.renderTaskContent();
	}

	private renderChildTasks() {
		// Clear existing child components
		this.childComponents.forEach((component) => {
			component.unload();
		});
		this.childComponents = [];

		// Clear child container
		this.childrenContainer.empty();

		// Set visibility based on expanded state
		this.isExpanded
			? this.childrenContainer.show()
			: this.childrenContainer.hide();

		// Get view configuration to check if we should hide completed and abandoned tasks
		const viewConfig = getViewSettingOrDefault(
			this.plugin,
			this.viewMode as ViewMode
		);
		const abandonedStatus =
			this.plugin.settings.taskStatuses.abandoned.split("|");
		const completedStatus =
			this.plugin.settings.taskStatuses.completed.split("|");

		// Filter child tasks based on view configuration
		let tasksToRender = this.childTasks;
		if (viewConfig.hideCompletedAndAbandonedTasks) {
			tasksToRender = this.childTasks.filter((task) => {
				return (
					!task.completed &&
					!abandonedStatus.includes(task.status.toLowerCase()) &&
					!completedStatus.includes(task.status.toLowerCase())
				);
			});
		}

		// Render each filtered child task
		tasksToRender.forEach((childTask) => {
			// Find *grandchildren* by looking up children of the current childTask in the *full* taskMap
			const grandchildren: Task[] = [];
			this.taskMap.forEach((potentialGrandchild) => {
				if (potentialGrandchild.metadata.parent === childTask.id) {
					grandchildren.push(potentialGrandchild);
				}
			});

			const childComponent = new TaskTreeItemComponent(
				childTask,
				this.viewMode,
				this.app,
				this.indentLevel + 1,
				grandchildren, // Pass the correctly found grandchildren
				this.taskMap, // Pass the map down recursively
				this.plugin // Pass the plugin down
			);

			// Pass up events
			childComponent.onTaskSelected = (task) => {
				if (this.onTaskSelected) {
					this.onTaskSelected(task);
				}
			};

			childComponent.onTaskCompleted = (task) => {
				if (this.onTaskCompleted) {
					this.onTaskCompleted(task);
				}
			};

			childComponent.onToggleExpand = (taskId, isExpanded) => {
				if (this.onToggleExpand) {
					this.onToggleExpand(taskId, isExpanded);
				}
			};

			childComponent.onTaskContextMenu = (event, task) => {
				if (this.onTaskContextMenu) {
					this.onTaskContextMenu(event, task);
				}
			};

			// Load component
			this.addChild(childComponent);
			childComponent.load();

			// Add to DOM
			this.childrenContainer.appendChild(childComponent.element);

			// Store for later cleanup
			this.childComponents.push(childComponent);
		});
	}

	public updateChildTasks(childTasks: Task[]) {
		this.childTasks = childTasks;
		this.renderChildTasks();
	}

	private selectTask() {
		if (this.onTaskSelected) {
			this.onTaskSelected(this.task);
		}
	}

	private toggleTaskCompletion() {
		// 创建任务的副本并切换完成状态
		const updatedTask: Task = {
			...this.task,
			completed: !this.task.completed,
		};

		// 如果任务被标记为完成，设置完成日期
		if (!this.task.completed) {
			updatedTask.metadata = {
				...this.task.metadata,
				completedDate: Date.now(),
			};
		} else {
			// 如果任务被标记为未完成，移除完成日期
			updatedTask.metadata = {
				...this.task.metadata,
				completedDate: undefined,
			};
		}

		if (this.onTaskCompleted) {
			this.onTaskCompleted(updatedTask);
		}
	}

	private toggleExpand() {
		this.isExpanded = !this.isExpanded;

		if (this.toggleEl instanceof HTMLElement) {
			setIcon(
				this.toggleEl,
				this.isExpanded ? "chevron-down" : "chevron-right"
			);
		}

		// Show/hide children
		this.isExpanded
			? this.childrenContainer.show()
			: this.childrenContainer.hide();

		// Notify parent
		if (this.onToggleExpand) {
			this.onToggleExpand(this.task.id, this.isExpanded);
		}
	}

	public setSelected(selected: boolean) {
		this.isSelected = selected;
		this.element.classList.toggle("selected", selected);
	}

	public updateTask(task: Task) {
		const oldTask = this.task;
		this.task = task;
		this.renderTaskContent();

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
			this.element.empty();
			this.onload();
		}
	}

	/**
	 * Attempts to find and update a task within this component's children.
	 * @param updatedTask The task data to update.
	 * @returns True if the task was found and updated in the subtree, false otherwise.
	 */
	public updateTaskRecursively(updatedTask: Task): boolean {
		// Iterate through the direct child components of this item
		for (const childComp of this.childComponents) {
			// Check if the direct child is the task we're looking for
			if (childComp.getTask().id === updatedTask.id) {
				childComp.updateTask(updatedTask); // Update the child directly
				return true; // Task found and updated
			} else {
				// If not a direct child, ask this child to check its own children recursively
				const foundInChildren =
					childComp.updateTaskRecursively(updatedTask);
				if (foundInChildren) {
					return true; // Task was found deeper in this child's subtree
				}
			}
		}
		// If the loop finishes, the task was not found in this component's subtree
		return false;
	}

	public getTask(): Task {
		return this.task;
	}

	/**
	 * Updates the visual selection state of this component and its children.
	 * @param selectedId The ID of the task that should be marked as selected, or null to deselect all.
	 */
	public updateSelectionVisuals(selectedId: string | null) {
		const isNowSelected = this.task.id === selectedId;
		if (this.isSelected !== isNowSelected) {
			this.isSelected = isNowSelected;
			// Use the existing element reference if available, otherwise querySelector
			const elementToToggle =
				this.element ||
				this.parentContainer?.closest(".tree-task-item");
			if (elementToToggle) {
				elementToToggle.classList.toggle(
					"is-selected",
					this.isSelected
				);
				// Also ensure the parent container reflects selection if separate element
				if (this.parentContainer) {
					this.parentContainer.classList.toggle(
						"selected",
						this.isSelected
					);
				}
			} else {
				console.warn(
					"Could not find element to toggle selection class for task:",
					this.task.id
				);
			}
		}

		// Recursively update children
		this.childComponents.forEach((child) =>
			child.updateSelectionVisuals(selectedId)
		);
	}

	public setExpanded(expanded: boolean) {
		if (this.isExpanded !== expanded) {
			this.isExpanded = expanded;

			// Update icon
			if (this.toggleEl instanceof HTMLElement) {
				setIcon(
					this.toggleEl,
					this.isExpanded ? "chevron-down" : "chevron-right"
				);
			}

			// Show/hide children
			this.isExpanded
				? this.childrenContainer.show()
				: this.childrenContainer.hide();
		}
	}

	onunload() {
		// Release editor from manager if this task was being edited
		if (
			TaskTreeItemComponent.editorManager?.hasActiveEditor(this.task.id)
		) {
			TaskTreeItemComponent.editorManager.releaseEditor(this.task.id);
		}

		// Clean up child components
		this.childComponents.forEach((component) => {
			component.unload();
		});

		// Remove element from DOM if it exists
		if (this.element && this.element.parentNode) {
			this.element.remove();
		}
	}
}
