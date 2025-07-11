/**
 * Tags Bases View
 * Specialized view for tag-based task organization
 */

import { App, Menu } from "obsidian";
import { BaseTaskBasesView } from "./BaseTaskBasesView";
import { TagsComponent } from "../components/task-view/tags";
import TaskProgressBarPlugin from "../index";
import { filterTasks } from "../utils/TaskFilterUtils";
import { t } from "../translations/helper";
import { Task } from "../types/task";

export class TagsBasesView extends BaseTaskBasesView {
	type = "tags-bases-view";

	private tagsComponent: TagsComponent;
	private isLoaded = false;

	constructor(
		containerEl: HTMLElement,
		app: App,
		plugin: TaskProgressBarPlugin
	) {
		super(containerEl, app, plugin, "tags");
		this.initializeComponents();
	}

	private initializeComponents(): void {
		// Create tags component
		this.tagsComponent = new TagsComponent(
			this.containerEl,
			this.app,
			this.plugin,
			{
				onTaskSelected: (task) => {
					// Handle task selection using base class method
					console.log("[TagsBasesView] Task selected:", task);
					this.handleTaskSelection(task);
				},
				onTaskCompleted: (task) => {
					// Handle task completion using base class method
					console.log("[TagsBasesView] Task completed:", task);
					this.handleTaskCompletionLocal(task);
				},
				onTaskContextMenu: (event, task) => {
					// Handle context menu
					console.log("[TagsBasesView] Task context menu:", task);
					this.handleTaskContextMenu(event, task);
				},
			}
		);

		this.addChild(this.tagsComponent);
	}

	// Abstract method implementations
	protected onConfigUpdated(): void {
		console.log(
			"[TagsBasesView] onConfigUpdated called, isLoaded:",
			this.isLoaded
		);

		if (this.isLoaded) {
			// Convert data again in case configuration affects data processing
			this.convertEntriesToTasks();
			this.updateTagTasks();
		}
	}

	protected onDataUpdated(): void {
		// Handle data updates - convert data and update tasks
		console.log(
			"[TagsBasesView] onDataUpdated called, isLoaded:",
			this.isLoaded
		);

		// Force convert entries to tasks to get latest data
		this.convertEntriesToTasks();

		// Then update the view
		this.updateTagTasks();
	}

	protected onDisplay(): void {
		this.containerEl.removeClass("is-loading");
		if (this.tasks.length === 0) {
			this.showEmptyState();
		} else {
			this.hideEmptyState();
		}
	}

	protected onViewLoad(): void {
		this.tagsComponent.load();
		this.isLoaded = true;
		this.updateTagTasks();
	}

	protected onViewUnload(): void {
		this.isLoaded = false;
	}

	protected onViewResize(): void {
		// Tags component handles its own resize
	}

	protected getCustomActions(): Array<{
		name: string;
		callback: () => void;
		icon: string;
	}> {
		return [
			{
				name: t("Manage Tags"),
				icon: "tags",
				callback: () => {
					this.openTagManager();
				},
			},
		];
	}

	protected getEditMenuItems(): Array<{
		displayName: string;
		component: (container: HTMLElement) => any;
	}> {
		return [];
	}

	private updateTagTasks(): void {
		console.log(
			"[TagsBasesView] updateTagTasks called, isLoaded:",
			this.isLoaded
		);

		if (!this.isLoaded) {
			console.log("[TagsBasesView] View not loaded yet, skipping update");
			return;
		}

		console.log(
			"[TagsBasesView] Processing",
			this.tasks.length,
			"total tasks"
		);

		try {
			// Filter tasks for tags view (tasks with tags)
			const tagTasks = filterTasks(this.tasks, "tags", this.plugin);

			console.log(
				`[TagsBasesView] Filtered ${tagTasks.length} tagged tasks from ${this.tasks.length} total tasks`
			);

			// Update tags component with filtered tasks
			this.tagsComponent.setTasks(tagTasks);

			console.log(
				`[TagsBasesView] Successfully updated TagsComponent with ${tagTasks.length} tagged tasks`
			);
		} catch (error) {
			console.error("[TagsBasesView] Error updating tag tasks:", error);
			this.showErrorState("Failed to update tag tasks");
		}
	}

	private async handleTaskCompletionLocal(task: Task): Promise<void> {
		// Use base class method for task completion
		try {
			await super.handleTaskCompletion(task);
			// Trigger refresh after completion
			setTimeout(() => {
				this.refreshTasks();
			}, 100);
		} catch (error) {
			console.error(
				"[TagsBasesView] Error handling task completion:",
				error
			);
		}
	}

	/**
	 * Handle task context menu
	 */
	private handleTaskContextMenu(event: MouseEvent, task: Task): void {
		const menu = new Menu();

		menu.addItem((item: any) => {
			item.setTitle(t("Complete"));
			item.setIcon("check-square");
			item.onClick(() => {
				this.handleTaskCompletionLocal(task);
			});
		})
			.addSeparator()
			.addItem((item: any) => {
				item.setTitle(t("Edit"));
				item.setIcon("pencil");
				item.onClick(() => {
					this.handleTaskSelection(task); // Open details view for editing
				});
			})
			.addItem((item: any) => {
				item.setTitle(t("Edit in File"));
				item.setIcon("file-edit");
				item.onClick(() => {
					this.handleTaskEdit(task);
				});
			});

		menu.showAtMouseEvent(event);
	}

	private openTagManager(): void {
		console.log("[TagsBasesView] Opening tag manager");
		// This would open a tag management modal
	}

	private showEmptyState(): void {
		this.hideEmptyState();

		const emptyEl = this.createEmptyContainer("No tagged tasks found");
		emptyEl.addClass("tags-empty-state");
	}

	private hideEmptyState(): void {
		const emptyEl = this.containerEl.querySelector(".tags-empty-state");
		if (emptyEl) {
			emptyEl.remove();
		}
	}

	private showErrorState(message: string): void {
		this.containerEl.empty();
		this.createErrorContainer(message);
	}
}
