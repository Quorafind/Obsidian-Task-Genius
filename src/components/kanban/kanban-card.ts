import { App, Component, MarkdownRenderer, Menu, TFile } from "obsidian";
import { Task } from "../../utils/types/TaskIndex"; // Adjust path
import { MarkdownRendererComponent } from "../MarkdownRenderer"; // Adjust path
import TaskProgressBarPlugin from "../../index"; // Adjust path
import { KanbanSpecificConfig } from "../../common/setting-definition";
import { createTaskCheckbox } from "../task-view/details";

export class KanbanCardComponent extends Component {
	public element: HTMLElement;
	private task: Task;
	private plugin: TaskProgressBarPlugin;
	private markdownRenderer: MarkdownRendererComponent;
	private contentEl: HTMLElement;
	private metadataEl: HTMLElement;

	// Events (Optional, could be handled by DragManager or view)
	// public onCardClick: (task: Task) => void;
	// public onCardContextMenu: (event: MouseEvent, task: Task) => void;

	constructor(
		private app: App,
		plugin: TaskProgressBarPlugin,
		private containerEl: HTMLElement, // The column's contentEl where the card should be added
		task: Task,
		private params: {
			onTaskSelected?: (task: Task) => void;
			onTaskCompleted?: (task: Task) => void;
			onTaskContextMenu?: (ev: MouseEvent, task: Task) => void;
			onFilterApply?: (
				filterType: string,
				value: string | number | string[]
			) => void;
		} = {}
	) {
		super();
		this.plugin = plugin;
		this.task = task;
	}

	override onload(): void {
		this.element = this.containerEl.createDiv({
			cls: "tg-kanban-card",
			attr: { "data-task-id": this.task.id },
		});

		if (this.task.completed) {
			this.element.classList.add("task-completed");
		}
		if (this.task.priority) {
			this.element.classList.add(`priority-${this.task.priority}`);
		}

		// --- Card Content ---
		this.element.createDiv(
			{
				cls: "tg-kanban-card-container",
			},
			(el) => {
				const checkbox = createTaskCheckbox(
					this.task.status,
					this.task,
					el
				);

				this.registerDomEvent(checkbox, "click", (ev) => {
					ev.stopPropagation();

					if (this.params?.onTaskCompleted) {
						this.params.onTaskCompleted(this.task);
					}

					if (this.task.status === " ") {
						checkbox.checked = true;
						checkbox.dataset.task = "x";
					}
				});

				if (
					(
						this.plugin.settings.viewConfiguration.find(
							(v) => v.id === "kanban"
						)?.specificConfig as KanbanSpecificConfig
					)?.showCheckbox
				) {
					checkbox.show();
				} else {
					checkbox.hide();
				}

				this.contentEl = el.createDiv("tg-kanban-card-content");
			}
		);
		this.renderMarkdown();

		// --- Card Metadata ---
		this.metadataEl = this.element.createDiv({
			cls: "tg-kanban-card-metadata",
		});
		this.renderMetadata();

		// --- Context Menu ---
		this.registerDomEvent(this.element, "contextmenu", (event) => {
			this.params.onTaskContextMenu?.(event, this.task);
		});
	}

	override onunload(): void {
		this.element?.remove();
	}

	private renderMarkdown() {
		this.contentEl.empty(); // Clear previous content
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

		// Render the markdown content (use originalMarkdown or just description)
		// Using originalMarkdown might be too much, maybe just the description part?
		this.markdownRenderer.render(
			this.task.content || this.task.originalMarkdown
		);
	}

	private renderMetadata() {
		this.metadataEl.empty();

		// Display dates (similar to TaskListItemComponent)
		if (!this.task.completed) {
			if (this.task.dueDate) this.renderDueDate();
			// Add scheduled, start dates if needed
		} else {
			if (this.task.completedDate) this.renderCompletionDate();
			// Add created date if needed
		}

		// Project (if not grouped by project already) - Kanban might inherently group by status
		if (this.task.project) this.renderProject();

		// Tags
		if (this.task.tags && this.task.tags.length > 0) this.renderTags();

		// Priority
		if (this.task.priority) this.renderPriority();
	}

	private renderDueDate() {
		const dueEl = this.metadataEl.createEl("div", {
			cls: ["task-date", "task-due-date"],
		});
		const dueDate = new Date(this.task.dueDate || "");
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

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
			dateText = dueDate.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
			});
		}
		dueEl.textContent = `${dateText}`;
		dueEl.setAttribute(
			"aria-label",
			`Due: ${dueDate.toLocaleDateString()}`
		);
	}

	private renderCompletionDate() {
		const completedEl = this.metadataEl.createEl("div", {
			cls: ["task-date", "task-done-date"],
		});
		const completedDate = new Date(this.task.completedDate || "");
		completedEl.textContent = `Done: ${completedDate.toLocaleDateString(
			undefined,
			{ month: "short", day: "numeric" }
		)}`;
		completedEl.setAttribute(
			"aria-label",
			`Completed: ${completedDate.toLocaleDateString()}`
		);
	}

	private renderProject() {
		const projectEl = this.metadataEl.createEl("div", {
			cls: ["task-project", "clickable-metadata"],
		});
		projectEl.textContent = this.task.project || "";
		projectEl.setAttribute("aria-label", `Project: ${this.task.project}`);

		// Make project clickable for filtering
		this.registerDomEvent(projectEl, "click", (ev) => {
			ev.stopPropagation();
			if (this.params.onFilterApply && this.task.project) {
				this.params.onFilterApply("project", this.task.project);
			}
		});
	}

	private renderTags() {
		const tagsContainer = this.metadataEl.createEl("div", {
			cls: "task-tags-container",
		});
		this.task.tags.forEach((tag) => {
			const tagEl = tagsContainer.createEl("span", {
				cls: ["task-tag", "clickable-metadata"],
				text: tag.startsWith("#") ? tag : `#${tag}`,
			});

			// Add support for colored tags plugin
			const tagName = tag.replace("#", "");
			tagEl.setAttribute("data-tag-name", tagName);

			// Check if colored tags plugin is available and apply colors
			this.applyTagColor(tagEl, tagName);

			// Make tag clickable for filtering
			this.registerDomEvent(tagEl, "click", (ev) => {
				ev.stopPropagation();
				if (this.params.onFilterApply) {
					this.params.onFilterApply("tag", tag);
				}
			});
		});
	}

	private renderPriority() {
		const priorityEl = this.metadataEl.createDiv({
			cls: [
				"task-priority",
				`priority-${this.task.priority}`,
				"clickable-metadata",
			],
		});
		priorityEl.textContent = `${"!".repeat(this.task.priority || 0)}`;
		priorityEl.setAttribute("aria-label", `Priority ${this.task.priority}`);

		// Make priority clickable for filtering
		this.registerDomEvent(priorityEl, "click", (ev) => {
			ev.stopPropagation();
			if (this.params.onFilterApply && this.task.priority) {
				// Convert numeric priority to icon representation for filter compatibility
				const priorityIcon = this.getPriorityIcon(this.task.priority);
				this.params.onFilterApply("priority", priorityIcon);
			}
		});
	}

	private getPriorityIcon(priority: number): string {
		const PRIORITY_ICONS: Record<number, string> = {
			5: "🔺",
			4: "⏫",
			3: "🔼",
			2: "🔽",
			1: "⏬",
		};
		return PRIORITY_ICONS[priority] || priority.toString();
	}

	private applyTagColor(tagEl: HTMLElement, tagName: string) {
		// Check if colored tags plugin is available
		// @ts-ignore - accessing global app for plugin check
		const coloredTagsPlugin = this.app.plugins.plugins["colored-tags"];

		if (coloredTagsPlugin && coloredTagsPlugin.settings) {
			const tagColors = coloredTagsPlugin.settings.tags;
			if (tagColors && tagColors[tagName]) {
				const color = tagColors[tagName];
				tagEl.style.setProperty("--tag-color", color);
				tagEl.classList.add("colored-tag");
			}
		}

		// Fallback: check for CSS custom properties set by other tag color plugins
		const computedStyle = getComputedStyle(document.body);
		const tagColorVar = computedStyle.getPropertyValue(
			`--tag-color-${tagName}`
		);
		if (tagColorVar) {
			tagEl.style.setProperty("--tag-color", tagColorVar);
			tagEl.classList.add("colored-tag");
		}
	}

	public getTask(): Task {
		return this.task;
	}

	// Optional: Method to update card display if task data changes
	public updateTask(newTask: Task) {
		const oldTask = this.task;
		this.task = newTask;

		// Update classes
		if (oldTask.completed !== newTask.completed) {
			this.element.classList.toggle("task-completed", newTask.completed);
		}
		if (oldTask.priority !== newTask.priority) {
			if (oldTask.priority)
				this.element.classList.remove(`priority-${oldTask.priority}`);
			if (newTask.priority)
				this.element.classList.add(`priority-${newTask.priority}`);
		}

		// Re-render content and metadata if needed
		if (
			oldTask.originalMarkdown !== newTask.originalMarkdown ||
			oldTask.content !== newTask.content
		) {
			// Adjust condition as needed
			this.renderMarkdown();
		}
		// Check if metadata-relevant fields changed
		if (
			oldTask.dueDate !== newTask.dueDate ||
			oldTask.completedDate !== newTask.completedDate ||
			oldTask.tags?.join(",") !== newTask.tags?.join(",") || // Simple comparison
			oldTask.priority !== newTask.priority ||
			oldTask.project !== newTask.project
		) {
			this.renderMetadata();
		}
	}
}
