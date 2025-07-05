import { App, Component, setIcon, Menu, MarkdownView } from "obsidian";
import TaskProgressBarPlugin from "../../index";
import { Task } from "../../types/task";
import { createTaskCheckbox } from "../task-view/details";
import { MarkdownRendererComponent } from "../MarkdownRenderer";
import { t } from "../../translations/helper";

export class QuadrantCardComponent extends Component {
	plugin: TaskProgressBarPlugin;
	app: App;
	public containerEl: HTMLElement;
	private task: Task;
	private checkboxEl: HTMLElement;
	private contentEl: HTMLElement;
	private metadataEl: HTMLElement;
	private markdownRenderer: MarkdownRendererComponent;
	private params: {
		onTaskStatusUpdate?: (
			taskId: string,
			newStatusMark: string
		) => Promise<void>;
		onTaskSelected?: (task: Task) => void;
		onTaskCompleted?: (task: Task) => void;
		onTaskContextMenu?: (ev: MouseEvent, task: Task) => void;
		onTaskUpdated?: (task: Task) => Promise<void>;
	};

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		containerEl: HTMLElement,
		task: Task,
		params: {
			onTaskStatusUpdate?: (
				taskId: string,
				newStatusMark: string
			) => Promise<void>;
			onTaskSelected?: (task: Task) => void;
			onTaskCompleted?: (task: Task) => void;
			onTaskContextMenu?: (ev: MouseEvent, task: Task) => void;
			onTaskUpdated?: (task: Task) => Promise<void>;
		} = {}
	) {
		super();
		this.app = app;
		this.plugin = plugin;
		this.containerEl = containerEl;
		this.task = task;
		this.params = params;

		// Initialize markdown renderer
		this.markdownRenderer = new MarkdownRendererComponent(
			this.app,
			this.containerEl,
			this.task.filePath,
			true // hideMarks = true
		);
		this.addChild(this.markdownRenderer);
	}

	override onload() {
		super.onload();
		this.render();
	}

	private render() {
		this.containerEl.empty();
		this.containerEl.addClass("tg-quadrant-card");
		this.containerEl.setAttribute("data-task-id", this.task.id);

		// Add priority class for styling
		const priorityClass = this.getPriorityClass();
		if (priorityClass) {
			this.containerEl.addClass(priorityClass);
		}

		// Create card header with checkbox and actions
		this.createHeader();

		// Create task content
		this.createContent();

		// Create metadata section
		this.createMetadata();

		// Add event listeners
		this.addEventListeners();
	}

	private createHeader() {
		const headerEl = this.containerEl.createDiv("tg-quadrant-card-header");

		// Task checkbox
		this.checkboxEl = headerEl.createDiv("tg-quadrant-card-checkbox");
		const checkbox = createTaskCheckbox(
			this.task.status,
			this.task,
			this.checkboxEl
		);

		// Add change event listener for checkbox
		checkbox.addEventListener("change", () => {
			const newStatus = checkbox.checked ? "x" : " ";
			if (this.params.onTaskStatusUpdate) {
				this.params.onTaskStatusUpdate(this.task.id, newStatus);
			}
		});

		// Actions menu
		const actionsEl = headerEl.createDiv("tg-quadrant-card-actions");
		const moreBtn = actionsEl.createEl("button", {
			cls: "tg-quadrant-card-more-btn",
			attr: { "aria-label": t("More actions") },
		});
		setIcon(moreBtn, "more-horizontal");

		moreBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.showContextMenu(e);
		});
	}

	private createContent() {
		this.contentEl = this.containerEl.createDiv("tg-quadrant-card-content");

		// Task title/content - use markdown renderer
		const titleEl = this.contentEl.createDiv("tg-quadrant-card-title");

		// Create a new markdown renderer for this specific content
		const contentRenderer = new MarkdownRendererComponent(
			this.app,
			titleEl,
			this.task.filePath,
			true // hideMarks = true
		);
		this.addChild(contentRenderer);

		// Render the task content
		contentRenderer.render(this.task.content, true);

		// Priority indicator (use the logic from listItem.ts for numeric priority)
		// See @file_context_0 for reference

		// Tags
		const tags = this.extractTags();
		if (tags.length > 0) {
			const tagsEl = this.contentEl.createDiv("tg-quadrant-card-tags");
			tags.forEach((tag) => {
				const tagEl = tagsEl.createSpan("tg-quadrant-card-tag");
				tagEl.textContent = tag;

				// Add special styling for urgent/important tags
				if (tag === "#urgent") {
					tagEl.addClass("tg-quadrant-tag--urgent");
				} else if (tag === "#important") {
					tagEl.addClass("tg-quadrant-tag--important");
				}
			});
		}
	}

	private createMetadata() {
		this.metadataEl = this.containerEl.createDiv(
			"tg-quadrant-card-metadata"
		);

		// Due date
		const dueDate = this.getTaskDueDate();
		if (dueDate) {
			const dueDateEl = this.metadataEl.createDiv(
				"tg-quadrant-card-due-date"
			);

			const dueDateText = dueDateEl.createSpan(
				"tg-quadrant-card-due-date-text"
			);
			dueDateText.textContent = this.formatDueDate(dueDate);

			// Add urgency styling
			if (this.isDueSoon(dueDate)) {
				dueDateEl.addClass("tg-quadrant-card-due-date--urgent");
			} else if (this.isOverdue(dueDate)) {
				dueDateEl.addClass("tg-quadrant-card-due-date--overdue");
			}
		}

		// File info
		this.metadataEl.createDiv("tg-quadrant-card-file-info", (el) => {
			if (this.task.metadata.priority) {
				// 将优先级转换为数字
				let numericPriority: number;
				if (typeof this.task.metadata.priority === "string") {
					switch (
						(this.task.metadata.priority as string).toLowerCase()
					) {
						case "lowest":
							numericPriority = 1;
							break;
						case "low":
							numericPriority = 2;
							break;
						case "medium":
							numericPriority = 3;
							break;
						case "high":
							numericPriority = 4;
							break;
						case "highest":
							numericPriority = 5;
							break;
						default:
							numericPriority =
								parseInt(this.task.metadata.priority) || 1;
							break;
					}
				} else {
					numericPriority = this.task.metadata.priority;
				}

				const priorityEl = el.createDiv({
					cls: [
						"tg-quadrant-card-priority",
						`priority-${numericPriority}`,
					],
				});

				// 根据优先级数字显示不同数量的感叹号
				let icon = "!".repeat(numericPriority);
				priorityEl.textContent = icon;
			}

			// File name
			const fileName = el.createSpan("tg-quadrant-card-file-name");
			fileName.textContent = this.getFileName();

			// Line number
			const lineEl = el.createSpan("tg-quadrant-card-line");
			lineEl.textContent = `L${this.task.line}`;
		});
	}

	private addEventListeners() {
		// Card click to select task
		this.containerEl.addEventListener("click", (e) => {
			if (
				e.target === this.checkboxEl ||
				this.checkboxEl.contains(e.target as Node)
			) {
				return; // Don't select when clicking checkbox
			}

			if (this.params.onTaskSelected) {
				this.params.onTaskSelected(this.task);
			}
		});

		// Right-click context menu
		this.containerEl.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			e.stopPropagation();

			if (this.params.onTaskContextMenu) {
				this.params.onTaskContextMenu(e, this.task);
			} else {
				this.showContextMenu(e);
			}
		});

		// Double-click to open file
		this.containerEl.addEventListener("dblclick", (e) => {
			e.stopPropagation();
			this.openTaskInFile();
		});
	}

	private showContextMenu(e: MouseEvent) {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle(t("Open in file"))
				.setIcon("external-link")
				.onClick(() => {
					this.openTaskInFile();
				});
		});

		menu.addItem((item) => {
			item.setTitle(t("Copy task"))
				.setIcon("copy")
				.onClick(() => {
					navigator.clipboard.writeText(this.task.originalMarkdown);
				});
		});

		menu.addSeparator();

		// Check if task already has urgent or important tags (check both content and metadata)
		const hasUrgentTag =
			this.task.content.includes("#urgent") ||
			this.task.metadata.tags?.includes("#urgent");
		const hasImportantTag =
			this.task.content.includes("#important") ||
			this.task.metadata.tags?.includes("#important");

		if (!hasUrgentTag) {
			menu.addItem((item) => {
				item.setTitle(t("Mark as urgent"))
					.setIcon("zap")
					.onClick(() => {
						this.addTagToTask("#urgent");
					});
			});
		} else {
			menu.addItem((item) => {
				item.setTitle(t("Remove urgent tag"))
					.setIcon("zap-off")
					.onClick(() => {
						this.removeTagFromTask("#urgent");
					});
			});
		}

		if (!hasImportantTag) {
			menu.addItem((item) => {
				item.setTitle(t("Mark as important"))
					.setIcon("star")
					.onClick(() => {
						this.addTagToTask("#important");
					});
			});
		} else {
			menu.addItem((item) => {
				item.setTitle(t("Remove important tag"))
					.setIcon("star-off")
					.onClick(() => {
						this.removeTagFromTask("#important");
					});
			});
		}

		menu.showAtMouseEvent(e);
	}

	private async openTaskInFile() {
		const file = this.app.vault.getFileByPath(this.task.filePath);
		if (file) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file as any);

			// Navigate to the specific line
			const view = leaf.view;
			if (view && view instanceof MarkdownView && view.editor) {
				const lineNumber = this.task.line - 1;
				view.editor.setCursor(lineNumber, 0);
				view.editor.scrollIntoView(
					{
						from: { line: lineNumber, ch: 0 },
						to: { line: lineNumber, ch: 0 },
					},
					true
				);
			}
		}
	}

	private async addTagToTask(tag: string) {
		try {
			// Create a copy of the task with the new tag
			const updatedTask = { ...this.task };

			// Initialize tags array if it doesn't exist
			if (!updatedTask.metadata.tags) {
				updatedTask.metadata.tags = [];
			}

			// Add the tag if it doesn't already exist
			if (!updatedTask.metadata.tags.includes(tag)) {
				updatedTask.metadata.tags = [...updatedTask.metadata.tags, tag];
			}

			// Update the local task reference and re-render
			this.task = updatedTask;
			this.render();

			// Notify parent component about task update
			if (this.params.onTaskUpdated) {
				await this.params.onTaskUpdated(updatedTask);
			}
		} catch (error) {
			console.error(
				`Failed to add tag ${tag} to task ${this.task.id}:`,
				error
			);
		}
	}

	private async removeTagFromTask(tag: string) {
		try {
			// Create a copy of the task without the tag
			const updatedTask = { ...this.task };

			// Remove the tag from the tags array
			updatedTask.metadata.tags = updatedTask.metadata.tags.filter(
				(t) => t !== tag
			);

			// Update the local task reference and re-render
			this.task = updatedTask;
			this.render();

			// Notify parent component about task update
			if (this.params.onTaskUpdated) {
				await this.params.onTaskUpdated(updatedTask);
			}
		} catch (error) {
			console.error(
				`Failed to remove tag ${tag} from task ${this.task.id}:`,
				error
			);
		}
	}

	private extractTags(): string[] {
		const tags = this.task.content.match(/#[\w-]+/g) || [];
		return tags;
	}

	private getPriorityClass(): string {
		if (this.task.content.includes("🔺"))
			return "tg-quadrant-card--priority-highest";
		if (this.task.content.includes("⏫"))
			return "tg-quadrant-card--priority-high";
		if (this.task.content.includes("🔼"))
			return "tg-quadrant-card--priority-medium";
		if (this.task.content.includes("🔽"))
			return "tg-quadrant-card--priority-low";
		if (this.task.content.includes("⏬"))
			return "tg-quadrant-card--priority-lowest";
		return "";
	}

	private getTaskDueDate(): Date | null {
		// Extract due date from task content - this is a simplified implementation
		const match = this.task.content.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
		if (match) {
			return new Date(match[1]);
		}
		return null;
	}

	private formatDueDate(date: Date): string {
		const now = new Date();
		const diff = date.getTime() - now.getTime();
		const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

		if (days < 0) {
			const overdueDays = Math.abs(days);
			return t("Overdue by") + " " + overdueDays + " " + t("days");
		} else if (days === 0) {
			return t("Due today");
		} else if (days === 1) {
			return t("Due tomorrow");
		} else if (days <= 7) {
			return t("Due in") + " " + days + " " + t("days");
		} else {
			return date.toLocaleDateString();
		}
	}

	private isDueSoon(date: Date): boolean {
		const now = new Date();
		const diff = date.getTime() - now.getTime();
		const days = diff / (1000 * 60 * 60 * 24);
		return days >= 0 && days <= 3; // Due within 3 days
	}

	private isOverdue(date: Date): boolean {
		const now = new Date();
		return date.getTime() < now.getTime();
	}

	private getFileName(): string {
		const parts = this.task.filePath.split("/");
		return parts[parts.length - 1].replace(/\.md$/, "");
	}

	public getTask(): Task {
		return this.task;
	}

	public updateTask(task: Task) {
		this.task = task;
		this.render();
	}
}
