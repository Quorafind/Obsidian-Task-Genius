import { App, Component, Menu, Notice, TFile } from "obsidian";
import TaskProgressBarPlugin from "@/index";
import { StandardTaskMetadata, Task } from "@/types/task";
import { QuickCaptureModal } from "@/components/features/quick-capture/modals/QuickCaptureModalWithSwitch";
import { ConfirmModal } from "@/components/ui/modals/ConfirmModal";
import { createTaskCheckbox } from "@/components/features/task/view/details";
import { emitTaskSelected } from "@/components/features/fluent/events/ui-event";
import { DatePickerModal } from "@/components/ui/date-picker/DatePickerModal";
import { TextPromptModal } from "@/components/ui/modals/TextPromptModal";
import type { CreateTaskArgs } from "@/dataflow/api/WriteAPI";
import {
	getExistingDateTypes as getExistingDateTypesFromTask,
	postponeDate as postponeDateUtil,
	smartPostponeRelatedDates,
	TaskDateType,
} from "@/utils/dateOperations";
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
		successMessage?: string,
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

			new Notice(successMessage ?? t("Task updated"));
		} catch (error) {
			console.error("Failed to update task:", error);
			new Notice(t("Failed to update task"));
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
		});

		menu.addItem((item) => {
			item.setIcon("square-pen");
			item.setTitle(t("Switch status"));
			const submenu = item.setSubmenu();

			// Get unique statuses from taskStatusMarks
			const statusMarks = this.plugin.settings.taskStatusMarks;
			const uniqueStatuses = new Map<string, string>();

			// Build a map of unique mark -> status name to avoid duplicates
			for (const status of Object.keys(statusMarks)) {
				const mark = statusMarks[status as keyof typeof statusMarks];
				if (!Array.from(uniqueStatuses.values()).includes(mark)) {
					uniqueStatuses.set(status, mark);
				}
			}

			// Create menu items from unique statuses
			for (const [status, mark] of uniqueStatuses) {
				submenu.addItem((subItem) => {
					subItem.titleEl.createEl(
						"span",
						{
							cls: "status-option-checkbox",
						},
						(el) => {
							createTaskCheckbox(mark, task, el);
						},
					);
					subItem.titleEl.createEl("span", {
						cls: "status-option",
						text: status,
					});
					subItem.onClick(async () => {
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
		});

		this.addPriorityMenuItems(menu, task);
		this.addDateMenuItems(menu, task);

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("Set Project"));
			item.setIcon("folder");
			item.onClick(() => {
				this.setProject(task);
			});
		});
		menu.addItem((item) => {
			item.setTitle(t("Add Tags"));
			item.setIcon("tag");
			item.onClick(() => {
				this.addTags(task);
			});
		});

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("Duplicate Task"));
			item.setIcon("copy");
			item.onClick(() => {
				this.duplicateTask(task);
			});
		});

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("Edit"));
			item.setIcon("pencil");
			item.onClick(() => {
				this.handleTaskSelection(task);
			});
		});
		menu.addItem((item) => {
			item.setTitle(t("Edit in File"));
			item.setIcon("pencil");
			item.onClick(() => {
				this.editTask(task);
			});
		});

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("Delete Task"));
			item.setIcon("trash");
			item.onClick(() => {
				this.confirmAndDeleteTask(event, task);
			});
		});

		menu.showAtMouseEvent(event);
	}

	private addPriorityMenuItems(menu: Menu, task: Task): void {
		menu.addSeparator();

		menu.addItem((item) => {
			const subMenu = item
				.setTitle(t("Set Priority"))
				.setIcon("flag")
				.setSubmenu();

			const priorityLevels = [
				{ level: 5, label: "Highest", icon: "alert-triangle" },
				{ level: 4, label: "High", icon: "arrow-up" },
				{ level: 3, label: "Medium", icon: "minus" },
				{ level: 2, label: "Low", icon: "arrow-down" },
				{ level: 1, label: "Lowest", icon: "chevron-down" },
			] as const;

			priorityLevels.forEach(({ level, label, icon }) => {
				subMenu.addItem((subItem) => {
					subItem
						.setTitle(t(label))
						.setIcon(icon)
						.setChecked(task.metadata.priority === level)
						.onClick(() => {
							this.setPriority(task, level);
						});
				});
			});
		});
	}

	private async setPriority(task: Task, priority: number): Promise<void> {
		const updatedTask: Task = {
			...task,
			metadata: {
				...task.metadata,
				priority,
			},
		};

		await this.handleTaskUpdate(task, updatedTask, t("Priority updated"));
	}

	private addDateMenuItems(menu: Menu, task: Task): void {
		menu.addSeparator();

		const existingDates = this.getExistingDateTypes(task);
		const dateTypes: TaskDateType[] = [
			"dueDate",
			"startDate",
			"scheduledDate",
		];

		dateTypes.forEach((dateType) => {
			menu.addItem((item) => {
				item.setTitle(t(`Set ${this.getDateLabel(dateType)}`));
				item.setIcon("calendar");
				item.onClick(() => {
					this.openDatePicker(task, dateType);
				});
			});

			if (existingDates.includes(dateType)) {
				this.addPostponeDateMenu(menu, task, dateType);
			}
		});
	}

	private addPostponeDateMenu(
		menu: Menu,
		task: Task,
		dateType: TaskDateType,
	): void {
		menu.addItem((item) => {
			const subMenu = item
				.setTitle(t(`Postpone ${this.getDateLabel(dateType)}`))
				.setIcon("calendar-plus")
				.setSubmenu();

			const quickOptions = [
				{ days: 1, label: "1 day" },
				{ days: 2, label: "2 days" },
				{ days: 3, label: "3 days" },
				{ days: 7, label: "1 week" },
			] as const;

			quickOptions.forEach(({ days, label }) => {
				subMenu.addItem((subItem) => {
					subItem.setTitle(t(label)).onClick(() => {
						this.postponeDate(task, dateType, days);
					});
				});
			});

			subMenu.addSeparator();
			subMenu.addItem((subItem) => {
				subItem
					.setTitle(t("Custom..."))
					.setIcon("calendar")
					.onClick(() => {
						this.openDatePicker(task, dateType, true);
					});
			});
		});
	}

	private async postponeDate(
		task: Task,
		dateType: TaskDateType,
		offsetDays: number,
	): Promise<void> {
		try {
			const currentTimestamp = task.metadata?.[dateType];
			if (typeof currentTimestamp !== "number") {
				new Notice(t("No date to postpone"));
				return;
			}

			const newTimestamp = postponeDateUtil(currentTimestamp, offsetDays);
			const updatedMetadata = smartPostponeRelatedDates(
				task,
				dateType,
				newTimestamp,
				offsetDays,
			);

			const updatedTask: Task = {
				...task,
				metadata: updatedMetadata,
			};

			const action = offsetDays > 0 ? "postponed" : "advanced";
			const message = `${this.getDateLabel(dateType)} ${action} by ${Math.abs(offsetDays)} day(s)`;

			await this.handleTaskUpdate(task, updatedTask, t(message));
		} catch (error) {
			console.error(
				"[FluentActionHandlers] Failed to postpone date:",
				error,
			);
			new Notice(t("Failed to postpone date"));
		}
	}

	private openDatePicker(
		task: Task,
		dateType: TaskDateType,
		isPostpone: boolean = false,
	): void {
		const currentDate = task.metadata?.[dateType];
		const initialDate =
			typeof currentDate === "number"
				? new Date(currentDate).toISOString().split("T")[0]
				: undefined;

		const modal = new DatePickerModal(
			this.app,
			this.plugin,
			initialDate,
			this.getDateMark(dateType),
		);

		modal.onDateSelected = async (dateStr: string | null) => {
			if (!dateStr) return;

			const newTimestamp = new Date(dateStr).getTime();
			if (Number.isNaN(newTimestamp)) {
				new Notice(t("Invalid date selected"));
				return;
			}

			if (isPostpone && typeof currentDate === "number") {
				const offsetDays = Math.round(
					(newTimestamp - currentDate) / (24 * 60 * 60 * 1000),
				);

				const updatedMetadata = smartPostponeRelatedDates(
					task,
					dateType,
					newTimestamp,
					offsetDays,
				);

				const updatedTask: Task = {
					...task,
					metadata: updatedMetadata,
				};

				await this.handleTaskUpdate(
					task,
					updatedTask,
					t(`${this.getDateLabel(dateType)} updated`),
				);
			} else {
				const updatedTask: Task = {
					...task,
					metadata: {
						...task.metadata,
						[dateType]: newTimestamp,
					},
				};

				await this.handleTaskUpdate(
					task,
					updatedTask,
					t(`${this.getDateLabel(dateType)} updated`),
				);
			}
		};

		modal.open();
	}

	private async setProject(task: Task): Promise<void> {
		const currentProject = task.metadata?.project || "";
		const newProject = await new TextPromptModal(this.app, this.plugin, {
			title: t("Set Project"),
			placeholder: t("Enter project name"),
			initialValue: currentProject,
			okLabel: t("Save"),
			cancelLabel: t("Cancel"),
			allowEmpty: true,
			suggestion: "project",
		}).openAndWait();

		if (newProject === null) {
			return;
		}

		const normalized = newProject.trim();

		const updatedTask: Task = {
			...task,
			metadata: {
				...task.metadata,
				project: normalized || undefined,
			},
		};

		await this.handleTaskUpdate(task, updatedTask, t("Project updated"));
	}

	private async addTags(task: Task): Promise<void> {
		const newTagsInput = await new TextPromptModal(this.app, this.plugin, {
			title: t("Add Tags"),
			placeholder: t("tag-one, tag-two"),
			okLabel: t("Add"),
			cancelLabel: t("Cancel"),
			suggestion: "tag",
		}).openAndWait();
		if (newTagsInput === null) {
			return;
		}

		const tags = newTagsInput
			.split(",")
			.map((tag) => tag.trim())
			.filter(Boolean);

		if (tags.length === 0) {
			return;
		}

		const existingTags = task.metadata.tags ?? [];
		const mergedTags = Array.from(new Set([...existingTags, ...tags]));

		const updatedTask: Task = {
			...task,
			metadata: {
				...task.metadata,
				tags: mergedTags,
			},
		};

		await this.handleTaskUpdate(task, updatedTask, t("Tags added"));
	}

	private async duplicateTask(task: Task): Promise<void> {
		try {
			if (!this.plugin.writeAPI) {
				new Notice(t("WriteAPI not available"));
				return;
			}

			const formatDate = (timestamp?: number): string | undefined => {
				if (typeof timestamp !== "number") {
					return undefined;
				}
				return new Date(timestamp).toISOString().split("T")[0];
			};

			const tags = task.metadata.tags ?? [];

			const duplicateArgs: CreateTaskArgs = {
				content: `${task.content} (Copy)`,
				filePath: task.filePath,
				completed: false,
				tags: tags.length > 0 ? [...tags] : undefined,
				project: task.metadata.project,
				context: task.metadata.context,
				priority: task.metadata.priority,
				startDate: formatDate(task.metadata.startDate),
				dueDate: formatDate(task.metadata.dueDate),
			};

			const result = await this.plugin.writeAPI.createTask(duplicateArgs);

			if (result.success) {
				new Notice(t("Task duplicated"));
				this.onTaskUpdated?.(task.id, task);
			} else {
				throw new Error(result.error || "Failed to duplicate task");
			}
		} catch (error) {
			console.error(
				"[FluentActionHandlers] Failed to duplicate task:",
				error,
			);
			new Notice(t("Failed to duplicate task"));
		}
	}
	private getExistingDateTypes(task: Task): TaskDateType[] {
		return getExistingDateTypesFromTask(task);
	}

	private getDateLabel(dateType: TaskDateType): string {
		switch (dateType) {
			case "startDate":
				return "Start Date";
			case "scheduledDate":
				return "Scheduled Date";
			case "dueDate":
			default:
				return "Due Date";
		}
	}

	private getDateMark(dateType: TaskDateType): string {
		switch (dateType) {
			case "scheduledDate":
				return "⏳";
			case "startDate":
				return "🚀";
			case "dueDate":
			default:
				return "📅";
		}
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
