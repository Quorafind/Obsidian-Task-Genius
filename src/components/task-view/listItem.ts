import { App, Component } from "obsidian";
import { Task } from "../../utils/types/TaskIndex";
import { MarkdownRendererComponent } from "../MarkdownRenderer";
import "../../styles/task-list.css";

export class TaskListItemComponent extends Component {
	public element: HTMLElement;

	// Events
	public onTaskSelected: (task: Task) => void;
	public onTaskCompleted: (task: Task) => void;

	private markdownRenderer: MarkdownRendererComponent;
	private containerEl: HTMLElement;
	private contentEl: HTMLElement;

	private metadataEl: HTMLElement;

	constructor(
		private task: Task,
		private viewMode: string,
		private app: App
	) {
		super();

		this.element = createEl("div", {
			cls: "task-item",
			attr: { "data-task-id": this.task.id },
		});
	}

	onload() {
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
				const checkbox = el.createEl("input", {
					cls: "task-list-item-checkbox",
					type: "checkbox",
				});
				checkbox.dataset.task = this.task.status;
				if (this.task.status !== " ") {
					checkbox.checked = true;
				}

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
		this.contentEl = document.createElement("div");
		this.contentEl.className = "task-item-content";
		this.containerEl.appendChild(this.contentEl);

		this.renderMarkdown();

		this.metadataEl = this.containerEl.createDiv({
			cls: "task-item-metadata",
		});

		// Display dates based on task completion status
		if (!this.task.completed) {
			// For incomplete tasks, show due, scheduled, and start dates

			// Due date if available
			if (this.task.dueDate) {
				const dueEl = this.metadataEl.createEl("div", {
					cls: ["task-date", "task-due-date"],
				});
				const dueDate = new Date(this.task.dueDate);

				const today = new Date();
				today.setHours(0, 0, 0, 0);

				const tomorrow = new Date(today);
				tomorrow.setDate(tomorrow.getDate() + 1);

				// Format date
				let dateText = "";
				if (dueDate.getTime() < today.getTime()) {
					dateText = "Overdue";
					dueEl.classList.add("task-overdue");
				} else if (dueDate.getTime() === today.getTime()) {
					dateText = "Today";
					dueEl.classList.add("task-due-today");
				} else if (dueDate.getTime() === tomorrow.getTime()) {
					dateText = "Tomorrow";
				} else {
					dateText = dueDate.toLocaleDateString("en-US", {
						year: "numeric",
						month: "long",
						day: "numeric",
					});
				}

				dueEl.textContent = dateText;
				dueEl.setAttribute("aria-label", dueDate.toLocaleDateString());
			}

			// Scheduled date if available
			if (this.task.scheduledDate) {
				const scheduledEl = this.metadataEl.createEl("div", {
					cls: ["task-date", "task-scheduled-date"],
				});
				const scheduledDate = new Date(this.task.scheduledDate);

				scheduledEl.textContent = scheduledDate.toLocaleDateString(
					"en-US",
					{
						year: "numeric",
						month: "long",
						day: "numeric",
					}
				);
				scheduledEl.setAttribute(
					"aria-label",
					scheduledDate.toLocaleDateString()
				);
			}

			// Start date if available
			if (this.task.startDate) {
				const startEl = this.metadataEl.createEl("div", {
					cls: ["task-date", "task-start-date"],
				});
				const startDate = new Date(this.task.startDate);

				startEl.textContent = startDate.toLocaleDateString("en-US", {
					year: "numeric",
					month: "long",
					day: "numeric",
				});
				startEl.setAttribute(
					"aria-label",
					startDate.toLocaleDateString()
				);
			}

			// Recurrence if available
			if (this.task.recurrence) {
				const recurrenceEl = this.metadataEl.createEl("div", {
					cls: "task-date task-recurrence",
				});
				recurrenceEl.textContent = this.task.recurrence;
			}
		} else {
			// For completed tasks, show completion date
			if (this.task.completedDate) {
				const completedEl = this.metadataEl.createEl("div", {
					cls: ["task-date", "task-done-date"],
				});
				const completedDate = new Date(this.task.completedDate);

				completedEl.textContent = completedDate.toLocaleDateString(
					"en-US",
					{
						year: "numeric",
						month: "long",
						day: "numeric",
					}
				);
				completedEl.setAttribute(
					"aria-label",
					completedDate.toLocaleDateString()
				);
			}

			// Created date if available
			if (this.task.createdDate) {
				const createdEl = this.metadataEl.createEl("div", {
					cls: ["task-date", "task-created-date"],
				});
				const createdDate = new Date(this.task.createdDate);

				createdEl.textContent = createdDate.toLocaleDateString(
					"en-US",
					{
						year: "numeric",
						month: "long",
						day: "numeric",
					}
				);
				createdEl.setAttribute(
					"aria-label",
					createdDate.toLocaleDateString()
				);
			}
		}

		// Project badge if available and not in project view
		if (this.task.project && this.viewMode !== "projects") {
			const projectEl = this.metadataEl.createEl("div", {
				cls: "task-project",
			});
			projectEl.textContent =
				this.task.project.split("/").pop() || this.task.project;
		}

		// Priority indicator if available
		if (this.task.priority) {
			const priorityEl = document.createElement("div");
			priorityEl.className = `task-priority priority-${this.task.priority}`;

			// Priority icon based on level
			let icon = "•";
			icon = "!".repeat(this.task.priority);

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

	private renderMarkdown() {
		// Clear existing content if needed
		if (this.markdownRenderer) {
			this.removeChild(this.markdownRenderer);
		}

		// Create new renderer
		this.markdownRenderer = new MarkdownRendererComponent(
			this.app,
			this.contentEl,
			this.task.filePath
		);
		this.addChild(this.markdownRenderer);

		// Render the markdown content
		this.markdownRenderer.render(this.task.originalMarkdown);
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
			this.element.empty();
			this.onload();
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
		this.element.detach();
	}
}
