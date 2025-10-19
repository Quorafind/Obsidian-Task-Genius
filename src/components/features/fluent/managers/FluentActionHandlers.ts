import { App, Component, Menu, Notice, TFile } from "obsidian";
import TaskProgressBarPlugin from "@/index";
import { StandardTaskMetadata, Task } from "@/types/task";
import { QuickCaptureModal } from "@/components/features/quick-capture/modals/QuickCaptureModal";
import { ConfirmModal } from "@/components/ui/modals/ConfirmModal";
import { createTaskCheckbox } from "@/components/features/task/view/details";
import { emitTaskSelected } from "@/components/features/fluent/events/ui-event";
import { t } from "@/translations/helper";
import { ViewMode } from "../components/FluentTopNavigation";

/**
 * FluentActionHandlers - Handles all user actions and task operations
 *
 * Responsibilities:
 * - Task selection and deselection
 * - Task completion toggling
 * - Task updates (status, metadata, etc.)
 * - Task context menus
 * - Task deletion (with children support)
 * - Navigation actions (view switch, project select, search)
 * - Settings and UI actions
 */
export class FluentActionHandlers extends Component {
	// Task selection state
	private currentSelectedTaskId: string | null = null;
	private lastToggleTimestamp = 0;

	// Callbacks
	private onTaskSelectionChanged?: (task: Task | null) => void;
	private onTaskUpdated?: (taskId: string, updatedTask: Task) => void;
	private onTaskDeleted?: (taskId: string, deleteChildren: boolean) => void;
	private onNavigateToView?: (viewId: string) => void;
	private onSearchQueryChanged?: (query: string) => void;
	private onProjectSelected?: (projectId: string) => void;
	private onViewModeChanged?: (mode: ViewMode) => void;
	private showDetailsPanel?: (task: Task) => void;
	private toggleDetailsVisibility?: (visible: boolean) => void;
	private getIsDetailsVisible?: () => boolean;

	constructor(
		private app: App,
		private plugin: TaskProgressBarPlugin,
		private getWorkspaceId: () => string,
		private useSideLeaves: () => boolean,
	) {
		super();
	}

	/**
	 * Set callbacks for action results
	 */
	setCallbacks(callbacks: {
		onTaskSelectionChanged?: (task: Task | null) => void;
		onTaskUpdated?: (taskId: string, updatedTask: Task) => void;
		onTaskDeleted?: (taskId: string, deleteChildren: boolean) => void;
		onNavigateToView?: (viewId: string) => void;
		onSearchQueryChanged?: (query: string) => void;
		onProjectSelected?: (projectId: string) => void;
		onViewModeChanged?: (mode: ViewMode) => void;
		showDetailsPanel?: (task: Task) => void;
		toggleDetailsVisibility?: (visible: boolean) => void;
		getIsDetailsVisible?: () => boolean;
	}): void {
		this.onTaskSelectionChanged = callbacks.onTaskSelectionChanged;
		this.onTaskUpdated = callbacks.onTaskUpdated;
		this.onTaskDeleted = callbacks.onTaskDeleted;
		this.onNavigateToView = callbacks.onNavigateToView;
		this.onSearchQueryChanged = callbacks.onSearchQueryChanged;
		this.onProjectSelected = callbacks.onProjectSelected;
		this.onViewModeChanged = callbacks.onViewModeChanged;
		this.showDetailsPanel = callbacks.showDetailsPanel;
		this.toggleDetailsVisibility = callbacks.toggleDetailsVisibility;
		this.getIsDetailsVisible = callbacks.getIsDetailsVisible;
	}

	/**
	 * Handle task selection
	 */
	handleTaskSelection(task: Task | null): void {
		// Emit cross-view selection when using side leaves
		if (this.useSideLeaves()) {
			emitTaskSelected(this.app, {
				taskId: task?.id ?? null,
				origin: "main",
				workspaceId: this.getWorkspaceId(),
			});
		}

		if (task) {
			const now = Date.now();
			const timeSinceLastToggle = now - this.lastToggleTimestamp;

			if (this.currentSelectedTaskId !== task.id) {
				this.currentSelectedTaskId = task.id;
				this.showDetailsPanel?.(task);
				const isDetailsVisible = this.getIsDetailsVisible?.() ?? false;
				if (!isDetailsVisible) {
					this.toggleDetailsVisibility?.(true);
				}
				this.lastToggleTimestamp = now;
				this.onTaskSelectionChanged?.(task);
				return;
			}

			if (timeSinceLastToggle > 150) {
				const isDetailsVisible = this.getIsDetailsVisible?.() ?? false;
				this.toggleDetailsVisibility?.(!isDetailsVisible);
				this.lastToggleTimestamp = now;
			}
		} else {
			this.toggleDetailsVisibility?.(false);
			this.currentSelectedTaskId = null;
			this.onTaskSelectionChanged?.(null);
		}
	}

	/**
	 * Toggle task completion status
	 */
	async toggleTaskCompletion(task: Task): Promise<void> {
		if (!this.plugin.writeAPI) {
			new Notice("WriteAPI not available");
			return;
		}

		const updatedTask = { ...task, completed: !task.completed };

		if (updatedTask.completed) {
			updatedTask.metadata.completedDate = Date.now();
			const completedMark = (
				this.plugin.settings.taskStatuses.completed || "x"
			).split("|")[0];
			if (updatedTask.status !== completedMark) {
				updatedTask.status = completedMark;
			}
		} else {
			updatedTask.metadata.completedDate = undefined;
			const notStartedMark =
				this.plugin.settings.taskStatuses.notStarted || " ";
			if (this.isCompletedMark(updatedTask.status)) {
				updatedTask.status = notStartedMark;
			}
		}

		await this.handleTaskUpdate(task, updatedTask);
	}

	/**
	 * Handle task update
	 */
	async handleTaskUpdate(
		originalTask: Task,
		updatedTask: Task,
	): Promise<void> {
		if (!this.plugin.writeAPI) {
			console.error("WriteAPI not available");
			return;
		}

		try {
			const updates = this.extractChangedFields(
				originalTask,
				updatedTask,
			);
			const writeResult = await this.plugin.writeAPI.updateTask({
				taskId: originalTask.id,
				updates: updates,
			});

			if (!writeResult.success) {
				throw new Error(writeResult.error || "Failed to update task");
			}

			const updated = writeResult.task || updatedTask;

			// Notify about task update
			this.onTaskUpdated?.(originalTask.id, updated);

			new Notice(t("Task updated"));
		} catch (error) {
			console.error("Failed to update task:", error);
			new Notice("Failed to update task");
		}
	}

	/**
	 * Handle kanban task status update
	 */
	async handleKanbanTaskStatusUpdate(
		task: Task,
		newStatusMark: string,
	): Promise<void> {
		const isCompleted = this.isCompletedMark(newStatusMark);
		const completedDate = isCompleted ? Date.now() : undefined;

		if (task.status !== newStatusMark || task.completed !== isCompleted) {
			await this.handleTaskUpdate(task, {
				...task,
				status: newStatusMark,
				completed: isCompleted,
				metadata: {
					...task.metadata,
					completedDate: completedDate,
				},
			});
		}
	}

	/**
	 * Show task context menu
	 */
	handleTaskContextMenu(event: MouseEvent, task: Task): void {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle(t("Complete"));
			item.setIcon("check-square");
			item.onClick(() => {
				this.toggleTaskCompletion(task);
			});
		})
			.addItem((item) => {
				item.setIcon("square-pen");
				item.setTitle(t("Switch status"));
				const submenu = item.setSubmenu();

				// Get unique statuses from taskStatusMarks
				const statusMarks = this.plugin.settings.taskStatusMarks;
				const uniqueStatuses = new Map<string, string>();

				// Build a map of unique mark -> status name to avoid duplicates
				for (const status of Object.keys(statusMarks)) {
					const mark =
						statusMarks[status as keyof typeof statusMarks];
					if (!Array.from(uniqueStatuses.values()).includes(mark)) {
						uniqueStatuses.set(status, mark);
					}
				}

				// Create menu items from unique statuses
				for (const [status, mark] of uniqueStatuses) {
					submenu.addItem((item) => {
						item.titleEl.createEl(
							"span",
							{
								cls: "status-option-checkbox",
							},
							(el) => {
								createTaskCheckbox(mark, task, el);
							},
						);
						item.titleEl.createEl("span", {
							cls: "status-option",
							text: status,
						});
						item.onClick(async () => {
							const willComplete = this.isCompletedMark(mark);
							const updatedTask = {
								...task,
								status: mark,
								completed: willComplete,
							};

							if (!task.completed && willComplete) {
								updatedTask.metadata.completedDate = Date.now();
							} else if (task.completed && !willComplete) {
								updatedTask.metadata.completedDate = undefined;
							}

							await this.handleTaskUpdate(task, updatedTask);
						});
					});
				}
			})
			.addSeparator()
			.addItem((item) => {
				item.setTitle(t("Edit"));
				item.setIcon("pencil");
				item.onClick(() => {
					this.handleTaskSelection(task);
				});
			})
			.addItem((item) => {
				item.setTitle(t("Edit in File"));
				item.setIcon("pencil");
				item.onClick(() => {
					this.editTask(task);
				});
			})
			.addSeparator()
			.addItem((item) => {
				item.setTitle(t("Delete Task"));
				item.setIcon("trash");
				item.onClick(() => {
					this.confirmAndDeleteTask(event, task);
				});
			});

		menu.showAtMouseEvent(event);
	}

	/**
	 * Edit task in file
	 */
	private async editTask(task: Task): Promise<void> {
		const file = this.app.vault.getFileByPath(task.filePath);
		if (!(file instanceof TFile)) return;
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file, {
			eState: { line: task.line },
		});
	}

	/**
	 * Confirm and delete task (with children option)
	 */
	private confirmAndDeleteTask(event: MouseEvent, task: Task): void {
		const hasChildren =
			task.metadata &&
			task.metadata.children &&
			task.metadata.children.length > 0;

		if (hasChildren) {
			const menu = new Menu();
			menu.addItem((item) => {
				item.setTitle(t("Delete task only"));
				item.setIcon("trash");
				item.onClick(() => {
					this.deleteTask(task, false);
				});
			});
			menu.addItem((item) => {
				item.setTitle(t("Delete task and all subtasks"));
				item.setIcon("trash-2");
				item.onClick(() => {
					this.deleteTask(task, true);
				});
			});
			menu.addSeparator();
			menu.addItem((item) => {
				item.setTitle(t("Cancel"));
			});
			menu.showAtMouseEvent(event);
		} else {
			const modal = new ConfirmModal(this.plugin, {
				title: t("Delete Task"),
				message: t("Are you sure you want to delete this task?"),
				confirmText: t("Delete"),
				cancelText: t("Cancel"),
				onConfirm: (confirmed) => {
					if (confirmed) {
						this.deleteTask(task, false);
					}
				},
			});
			modal.open();
		}
	}

	/**
	 * Delete task (and optionally children)
	 */
	private async deleteTask(
		task: Task,
		deleteChildren: boolean,
	): Promise<void> {
		if (!this.plugin.writeAPI) {
			console.error("WriteAPI not available for deleteTask");
			new Notice(t("Failed to delete task"));
			return;
		}

		try {
			const result = await this.plugin.writeAPI.deleteTask({
				taskId: task.id,
				deleteChildren,
			});

			if (result.success) {
				new Notice(t("Task deleted"));

				// Notify about task deletion
				this.onTaskDeleted?.(task.id, deleteChildren);

				// Clear selection if deleted task was selected
				if (this.currentSelectedTaskId === task.id) {
					this.handleTaskSelection(null);
				}
			} else {
				new Notice(
					t("Failed to delete task") +
						": " +
						(result.error || "Unknown error"),
				);
			}
		} catch (error) {
			console.error("Error deleting task:", error);
			new Notice(
				t("Failed to delete task") + ": " + (error as any).message,
			);
		}
	}

	/**
	 * Handle navigation to a view or create new task
	 */
	handleNavigate(viewId: string): void {
		if (viewId === "new-task") {
			new QuickCaptureModal(this.app, this.plugin).open();
		} else {
			console.log(`[FluentAction] handleNavigate to ${viewId}`);
			this.onNavigateToView?.(viewId);
		}
	}

	/**
	 * Handle search query change
	 */
	handleSearch(query: string): void {
		this.onSearchQueryChanged?.(query);
	}

	/**
	 * Handle project selection
	 */
	handleProjectSelect(projectId: string): void {
		console.log(`[FluentAction] Project selected: ${projectId}`);
		this.onProjectSelected?.(projectId);
	}

	/**
	 * Handle view mode change (list/tree/kanban/calendar)
	 */
	handleViewModeChange(mode: ViewMode): void {
		this.onViewModeChanged?.(mode);
	}

	/**
	 * Handle settings button click
	 */
	handleSettingsClick(): void {
		// Open Obsidian settings and navigate to the plugin tab
		this.app.setting.open();
		this.app.setting.openTabById(this.plugin.manifest.id);
	}

	/**
	 * Check if a status mark indicates completion
	 */
	private isCompletedMark(mark: string): boolean {
		if (!mark) return false;
		try {
			const lower = mark.toLowerCase();
			const completedCfg = String(
				this.plugin.settings.taskStatuses?.completed || "x",
			);
			const completedSet = completedCfg
				.split("|")
				.map((s) => s.trim().toLowerCase())
				.filter(Boolean);
			return completedSet.includes(lower);
		} catch (_) {
			return false;
		}
	}

	/**
	 * Extract changed fields from task update
	 */
	private extractChangedFields(
		originalTask: Task,
		updatedTask: Task,
	): Partial<Task> {
		const changes: Partial<Task> = {};

		// Check top-level fields
		if (originalTask.content !== updatedTask.content) {
			changes.content = updatedTask.content;
		}
		if (originalTask.completed !== updatedTask.completed) {
			changes.completed = updatedTask.completed;
		}
		if (originalTask.status !== updatedTask.status) {
			changes.status = updatedTask.status;
		}

		// Check metadata fields
		const metadataChanges: Partial<typeof originalTask.metadata> = {};
		let hasMetadataChanges = false;

		const metadataFields = [
			"priority",
			"project",
			"tags",
			"context",
			"dueDate",
			"startDate",
			"scheduledDate",
			"completedDate",
			"recurrence",
		];

		for (const field of metadataFields) {
			const originalValue = (
				originalTask.metadata as StandardTaskMetadata
			)?.[field];
			const updatedValue = (
				updatedTask.metadata as StandardTaskMetadata
			)?.[field];

			if (field === "tags") {
				const origTags = originalValue || [];
				const updTags = updatedValue || [];
				if (
					origTags.length !== updTags.length ||
					!origTags.every((t: string, i: number) => t === updTags[i])
				) {
					metadataChanges.tags = updTags;
					hasMetadataChanges = true;
				}
			} else if (originalValue !== updatedValue) {
				(metadataChanges as StandardTaskMetadata)[field] = updatedValue;
				hasMetadataChanges = true;
			}
		}

		if (hasMetadataChanges) {
			changes.metadata = metadataChanges as any;
		}

		return changes;
	}

	/**
	 * Get current selected task ID
	 */
	getCurrentSelectedTaskId(): string | null {
		return this.currentSelectedTaskId;
	}

	/**
	 * Clear task selection
	 */
	clearSelection(): void {
		this.currentSelectedTaskId = null;
		this.onTaskSelectionChanged?.(null);
	}
}
