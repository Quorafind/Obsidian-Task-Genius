import { App, Component, MarkdownRenderer, Menu, TFile } from "obsidian";
import { Task } from "src/utils/types/TaskIndex"; // Adjust path
import { MarkdownRendererComponent } from "../MarkdownRenderer"; // Adjust path
import TaskProgressBarPlugin from "../../index"; // Adjust path

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
		task: Task
	) {
		super();
		this.plugin = plugin;
		this.task = task;
	}

	override onload(): void {
		this.element = this.containerEl.createDiv({
			cls: "kanban-card",
			attr: { "data-task-id": this.task.id },
		});

		if (this.task.completed) {
			this.element.classList.add("task-completed");
		}
		if (this.task.priority) {
			this.element.classList.add(`priority-${this.task.priority}`);
		}

		// --- Card Content ---
		this.contentEl = this.element.createDiv({ cls: "kanban-card-content" });
		this.renderMarkdown();

		// --- Card Metadata ---
		this.metadataEl = this.element.createDiv({
			cls: "kanban-card-metadata",
		});
		this.renderMetadata();

		// --- Context Menu ---
		this.registerDomEvent(this.element, "contextmenu", (event) => {
			this.showContextMenu(event);
		});

		// --- Click Action (e.g., open file) ---
		this.registerDomEvent(this.element, "click", (event) => {
			if (this.task.filePath) {
				const file = this.app.vault.getAbstractFileByPath(
					this.task.filePath
				);
				if (file instanceof TFile) {
					this.app.workspace
						.getLeaf(event.ctrlKey || event.metaKey)
						.openFile(file, {
							eState: { line: this.task.line },
						});
				}
			}
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
		// if (this.task.project) this.renderProject();

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
		dueEl.textContent = `Due: ${dateText}`;
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

	private renderTags() {
		const tagsContainer = this.metadataEl.createEl("div", {
			cls: "task-tags-container",
		});
		this.task.tags.forEach((tag) => {
			tagsContainer.createEl("span", {
				cls: "task-tag",
				text: tag.startsWith("#") ? tag : `#${tag}`,
			});
		});
	}

	private renderPriority() {
		const priorityEl = this.metadataEl.createDiv({
			cls: ["task-priority", `priority-${this.task.priority}`],
		});
		priorityEl.textContent = `${"!".repeat(this.task.priority || 0)}`;
		priorityEl.setAttribute("aria-label", `Priority ${this.task.priority}`);
	}

	private showContextMenu(event: MouseEvent) {
		event.preventDefault(); // Prevent default browser context menu
		const menu = new Menu();

		// --- Basic Task Actions ---
		menu.addItem((item) =>
			item
				.setTitle(
					`Mark as ${this.task.completed ? "incomplete" : "complete"}`
				)
				.setIcon("check-check")
				.onClick(async () => {
					const currentStatus = this.task.status;
					const statusCycle = this.plugin.settings.taskStatusCycle;
					const excludedStatuses =
						this.plugin.settings.excludeMarksFromCycle;
					const currentStatusIndex = statusCycle.findIndex(
						(status) => status === currentStatus
					);
					let nextStatusIndex =
						(currentStatusIndex + 1) % statusCycle.length;
					let nextStatus = statusCycle[nextStatusIndex];
					while (excludedStatuses.includes(nextStatus)) {
						nextStatusIndex =
							(nextStatusIndex + 1) % statusCycle.length;
						nextStatus = statusCycle[nextStatusIndex];
					}
					try {
						await this.plugin.taskManager.updateTask({
							...this.task,
							status: nextStatus,
						});
						// TODO: Refresh or update card state visually without full reload if possible
					} catch (err) {
						console.error("Failed to update task status:", err);
					}
				})
		);

		// --- Status Cycling ---
		const statusCycle = this.plugin.settings.taskStatusMarks;
		const currentStatusName =
			this.plugin.settings.taskStatusMarks[this.task.status] || "Unknown";

		if (Object.keys(statusCycle).length > 0) {
			menu.addSeparator();
			const statusSubMenu = menu.addItem((item) => {
				item.setTitle(`Set status (${currentStatusName})`);
				item.setIcon("refresh-cw"); // Or another relevant icon
				item.setSubmenu();
			});

			Object.keys(statusCycle).forEach((statusName) => {
				const statusMark = statusCycle[statusName];
				if (statusMark !== undefined) {
					statusSubMenu.addItem((item) =>
						item
							.setTitle(statusName)
							.setChecked(this.task.status === statusMark)
							.onClick(async () => {
								if (this.task.status !== statusMark) {
									try {
										await this.plugin.taskManager.updateTask(
											{
												...this.task,
												status: statusMark,
											}
										);
										// TODO: Refresh Kanban view or move card
									} catch (err) {
										console.error(
											`Failed to set status to ${statusName}:`,
											err
										);
									}
								}
							})
					);
				}
			});
		}

		// --- Navigation ---
		if (this.task.filePath) {
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle("Go to task")
					.setIcon("file-go")
					.onClick(() => {
						const file = this.app.vault.getAbstractFileByPath(
							this.task.filePath
						);
						if (file instanceof TFile) {
							this.app.workspace.getLeaf(false).openFile(file, {
								eState: { line: this.task.line },
							});
						}
					})
			);
		}

		menu.showAtMouseEvent(event);
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
			oldTask.priority !== newTask.priority
		) {
			this.renderMetadata();
		}
	}
}
