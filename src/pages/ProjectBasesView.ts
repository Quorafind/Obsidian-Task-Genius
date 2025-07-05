/**
 * Projects Bases View
 * Specialized view for project-based task management
 */

import { App, Menu } from "obsidian";
import { BaseTaskBasesView } from "./BaseTaskBasesView";
import { ProjectsComponent } from "../components/task-view/projects";
import TaskProgressBarPlugin from "../index";
import { filterTasks } from "../utils/TaskFilterUtils";
import { t } from "../translations/helper";
import { Task } from "../types/task";

export class ProjectBasesView extends BaseTaskBasesView {
	type = "projects-bases-view";

	private projectsComponent: ProjectsComponent;
	private isLoaded = false;

	constructor(
		containerEl: HTMLElement,
		app: App,
		plugin: TaskProgressBarPlugin
	) {
		super(containerEl, app, plugin, "projects");
		this.initializeComponents();
	}

	private initializeComponents(): void {
		// Create projects component for project tasks
		this.projectsComponent = new ProjectsComponent(
			this.containerEl,
			this.app,
			this.plugin,
			{
				onTaskSelected: (task) => {
					console.log("[ProjectBasesView] Task selected:", task);
					this.handleTaskSelection(task);
				},
				onTaskCompleted: (task) => {
					console.log("[ProjectBasesView] Task completed:", task);
					this.handleTaskCompletionLocal(task);
				},
				onTaskContextMenu: (event, task) => {
					console.log("[ProjectBasesView] Task context menu:", task);
					this.handleTaskContextMenu(event, task);
				},
			}
		);

		this.addChild(this.projectsComponent);
	}

	// Abstract method implementations
	protected onConfigUpdated(): void {
		console.log(
			"[ProjectBasesView] onConfigUpdated called, isLoaded:",
			this.isLoaded
		);

		if (this.isLoaded) {
			// Convert data again in case configuration affects data processing
			this.convertEntriesToTasks();
			this.updateProjectTasks();
		}
	}

	protected onDataUpdated(): void {
		// Handle data updates - convert data and update tasks
		console.log(
			"[ProjectBasesView] onDataUpdated called, isLoaded:",
			this.isLoaded
		);

		// Force convert entries to tasks to get latest data
		this.convertEntriesToTasks();

		// Then update the view
		this.updateProjectTasks();
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
		this.projectsComponent.load();
		this.isLoaded = true;
		this.updateProjectTasks();
	}

	protected onViewUnload(): void {
		this.isLoaded = false;
	}

	protected onViewResize(): void {
		// Projects component handles its own resize
	}

	protected getCustomActions(): Array<{
		name: string;
		callback: () => void;
		icon: string;
	}> {
		return [
			{
				name: t("New Project"),
				icon: "folder-plus",
				callback: () => {
					this.createNewProject();
				},
			},
			{
				name: t("Archive Completed"),
				icon: "archive",
				callback: () => {
					this.archiveCompletedProjects();
				},
			},
			{
				name: t("Project Statistics"),
				icon: "bar-chart",
				callback: () => {
					this.showProjectStatistics();
				},
			},
		];
	}

	protected getEditMenuItems(): Array<{
		displayName: string;
		component: (container: HTMLElement) => any;
	}> {
		return [
			{
				displayName: "Project Settings",
				component: (container: HTMLElement) => {
					return this.createProjectSettingsComponent(container);
				},
			},
		];
	}

	private updateProjectTasks(): void {
		console.log(
			"[ProjectBasesView] updateProjectTasks called, isLoaded:",
			this.isLoaded
		);

		if (!this.isLoaded) {
			console.log(
				"[ProjectBasesView] View not loaded yet, skipping update"
			);
			return;
		}

		console.log(
			"[ProjectBasesView] Processing",
			this.tasks.length,
			"total tasks"
		);

		try {
			// Filter tasks for projects view (tasks with projects)
			const projectTasks = filterTasks(
				this.tasks,
				"projects",
				this.plugin
			);

			console.log(
				`[ProjectBasesView] Filtered ${projectTasks.length} project tasks from ${this.tasks.length} total tasks`
			);

			// Update projects component with filtered tasks
			this.projectsComponent.setTasks(projectTasks);

			console.log(
				`[ProjectBasesView] Successfully updated ProjectsComponent with ${projectTasks.length} project tasks`
			);
		} catch (error) {
			console.error(
				"[ProjectBasesView] Error updating project tasks:",
				error
			);
			this.showErrorState("Failed to update project tasks");
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
				"[ProjectBasesView] Error handling task completion:",
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

	private createNewProject(): void {
		console.log("[ProjectBasesView] Creating new project");
		// This would open a new project creation modal
	}

	private archiveCompletedProjects(): void {
		console.log("[ProjectBasesView] Archiving completed projects");
		// This would archive all completed projects
	}

	private showProjectStatistics(): void {
		console.log("[ProjectBasesView] Showing project statistics");
		// This would show project completion statistics
	}

	private createProjectSettingsComponent(container: HTMLElement): any {
		const settingsEl = container.createDiv({
			cls: "projects-view-settings",
		});

		settingsEl.createEl("h3", {
			text: "Project Settings",
		});

		const optionsEl = settingsEl.createDiv({
			cls: "settings-options",
		});

		// Show project hierarchy
		const hierarchyEl = optionsEl.createDiv({
			cls: "setting-item",
		});

		hierarchyEl.createEl("label", {
			text: "Show project hierarchy",
		});

		const hierarchyToggle = hierarchyEl.createEl("input", {
			type: "checkbox",
		});
		hierarchyToggle.checked = true;

		// Group by project
		const groupingEl = optionsEl.createDiv({
			cls: "setting-item",
		});

		groupingEl.createEl("label", {
			text: "Group tasks by project",
		});

		const groupingToggle = groupingEl.createEl("input", {
			type: "checkbox",
		});
		groupingToggle.checked = true;

		// Show completed projects
		const completedEl = optionsEl.createDiv({
			cls: "setting-item",
		});

		completedEl.createEl("label", {
			text: "Show completed projects",
		});

		const completedToggle = completedEl.createEl("input", {
			type: "checkbox",
		});

		return settingsEl;
	}

	private showEmptyState(): void {
		this.hideEmptyState();

		const emptyEl = this.createEmptyContainer("No project tasks found");
		emptyEl.addClass("projects-empty-state");

		const helpEl = emptyEl.createDiv({
			cls: "projects-empty-help",
		});

		helpEl.createEl("p", {
			text: "Tasks with project assignments will appear here.",
		});

		const helpText = helpEl.createEl("div", {
			cls: "projects-help-text",
		});

		helpText.createEl("p", {
			text: "To assign a task to a project:",
		});

		const helpList = helpText.createEl("ul");
		helpList.createEl("li", {
			text: "Add #project/projectname tag to the task",
		});
		helpList.createEl("li", {
			text: "Use project:: property in frontmatter",
		});

		const createBtn = helpEl.createEl("button", {
			cls: "projects-create-btn",
			text: "Create Project",
		});

		createBtn.addEventListener("click", () => {
			this.createNewProject();
		});
	}

	private hideEmptyState(): void {
		const emptyEl = this.containerEl.querySelector(".projects-empty-state");
		if (emptyEl) {
			emptyEl.remove();
		}
	}

	private showErrorState(message: string): void {
		this.containerEl.empty();
		this.createErrorContainer(message);
	}
}
