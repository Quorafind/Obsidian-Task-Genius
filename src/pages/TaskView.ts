import {
	ItemView,
	WorkspaceLeaf,
	TFile,
	Plugin,
	setIcon,
	ExtraButtonComponent,
} from "obsidian";
import { Task } from "../utils/types/TaskIndex";
import { SidebarComponent, ViewMode } from "../components/task-view/sidebar";
import { ContentComponent } from "../components/task-view/content";
import { ForecastComponent } from "../components/task-view/forecast";
import { TagsComponent } from "../components/task-view/tags";
import { ProjectsComponent } from "../components/task-view/projects";
import { TaskDetailsComponent } from "../components/task-view/details";
import "../styles/view.css";
import TaskProgressBarPlugin from "../index";
import { QuickCaptureModal } from "src/components/QuickCaptureModal";

export const TASK_VIEW_TYPE = "task-genius-view";

export class TaskView extends ItemView {
	// Main container elements
	private rootContainerEl: HTMLElement;

	// Component references
	private sidebarComponent: SidebarComponent;
	private contentComponent: ContentComponent;
	private forecastComponent: ForecastComponent;
	private tagsComponent: TagsComponent;
	private projectsComponent: ProjectsComponent;
	private detailsComponent: TaskDetailsComponent;

	// UI state management
	private isSidebarCollapsed: boolean = false;
	private isDetailsVisible: boolean = false;
	private sidebarToggleBtn: HTMLElement;
	private detailsToggleBtn: HTMLElement;
	private currentViewMode: ViewMode = "inbox";

	// Data management
	private tasks: Task[] = [];

	constructor(leaf: WorkspaceLeaf, private plugin: TaskProgressBarPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return TASK_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Task Genius";
	}

	async onOpen() {
		// Initialize the main container
		this.contentEl.toggleClass("task-genius-view", true);
		this.rootContainerEl = this.contentEl.createDiv({
			cls: "task-genius-container",
		});

		// Create the components
		this.initializeComponents();

		// Set up event listeners
		this.registerEvents();

		// Load initial data
		await this.loadTasks();

		// Set default view
		this.sidebarComponent.setViewMode(
			(this.app.loadLocalStorage("task-genius:view-mode") as ViewMode) ||
				"inbox"
		);

		// Initially hide details panel since no task is selected
		this.toggleDetailsVisibility(false);

		this.addAction("check-square", "capture", () => {
			const modal = new QuickCaptureModal(this.plugin.app, this.plugin);
			modal.open();
		});

		// @ts-expect-error internal obsidian api
		(this.leaf.tabHeaderStatusContainerEl as HTMLElement).empty();
		// @ts-expect-error internal obsidian api
		(this.leaf.tabHeaderStatusContainerEl as HTMLElement).createEl(
			"span",
			{
				cls: "task-genius-action-btn",
			},
			(el: HTMLElement) => {
				new ExtraButtonComponent(el)
					.setIcon("check-square")
					.setTooltip("Capture")
					.onClick(() => {
						const modal = new QuickCaptureModal(
							this.plugin.app,
							this.plugin
						);
						modal.open();
					});
			}
		);
	}

	private initializeComponents() {
		// Create the sidebar component
		this.sidebarComponent = new SidebarComponent(
			this.rootContainerEl,
			this.plugin
		);
		this.addChild(this.sidebarComponent);
		this.sidebarComponent.load();

		// Add toggle button to sidebar
		this.createSidebarToggle();

		// Create the content component
		this.contentComponent = new ContentComponent(
			this.rootContainerEl,
			this.plugin.app
		);
		this.addChild(this.contentComponent);
		this.contentComponent.load();

		// Create the forecast component (initially hidden)
		this.forecastComponent = new ForecastComponent(
			this.rootContainerEl,
			this.plugin.app
		);
		this.addChild(this.forecastComponent);
		this.forecastComponent.load();
		this.forecastComponent.containerEl.hide();

		// Create the tags component (initially hidden)
		this.tagsComponent = new TagsComponent(
			this.rootContainerEl,
			this.plugin.app
		);
		this.addChild(this.tagsComponent);
		this.tagsComponent.load();
		this.tagsComponent.containerEl.hide();

		// Create the projects component (initially hidden)
		this.projectsComponent = new ProjectsComponent(
			this.rootContainerEl,
			this.plugin.app
		);
		this.addChild(this.projectsComponent);
		this.projectsComponent.load();
		this.projectsComponent.containerEl.hide();

		// Create the details component
		this.detailsComponent = new TaskDetailsComponent(
			this.rootContainerEl,
			this.app,
			this.plugin
		);
		this.addChild(this.detailsComponent);
		this.detailsComponent.load();

		// Add toggle button to details
		this.createDetailsToggle();

		// Set up component events
		this.setupComponentEvents();
	}

	private createSidebarToggle() {
		// Create toggle button for sidebar
		const toggleContainer = this.sidebarComponent.containerEl.createDiv({
			cls: "panel-toggle-container",
		});

		this.sidebarToggleBtn = toggleContainer.createDiv({
			cls: "panel-toggle-btn",
		});
		setIcon(this.sidebarToggleBtn, "chevron-left");

		this.registerDomEvent(this.sidebarToggleBtn, "click", () => {
			this.toggleSidebar();
		});
	}

	private createDetailsToggle() {
		// Create toggle button for details panel
		const toggleContainer = this.detailsComponent.containerEl.createDiv({
			cls: "panel-toggle-container",
		});

		this.detailsToggleBtn = toggleContainer.createDiv({
			cls: "panel-toggle-btn",
		});
		setIcon(this.detailsToggleBtn, "chevron-right");

		this.registerDomEvent(this.detailsToggleBtn, "click", () => {
			this.toggleDetailsVisibility(!this.isDetailsVisible);
		});
	}

	private toggleSidebar() {
		this.isSidebarCollapsed = !this.isSidebarCollapsed;
		this.rootContainerEl.toggleClass(
			"sidebar-collapsed",
			this.isSidebarCollapsed
		);

		// Update sidebar component state
		this.sidebarComponent.setCollapsed(this.isSidebarCollapsed);

		// Update toggle button icon
		setIcon(
			this.sidebarToggleBtn,
			this.isSidebarCollapsed ? "chevron-right" : "chevron-left"
		);
	}

	private toggleDetailsVisibility(visible: boolean) {
		this.isDetailsVisible = visible;
		this.rootContainerEl.toggleClass("details-visible", visible);
		this.rootContainerEl.toggleClass("details-hidden", !visible);

		// Update details component state
		this.detailsComponent.setVisible(visible);

		// Update toggle button icon
		setIcon(
			this.detailsToggleBtn,
			visible ? "chevron-right" : "chevron-left"
		);
	}

	private setupComponentEvents() {
		// Handle task selection from content area
		this.contentComponent.onTaskSelected = (task: Task) => {
			if (task) {
				this.detailsComponent.showTaskDetails(task);
				this.toggleDetailsVisibility(true);
			}
		};

		this.contentComponent.onTaskCompleted = (task: Task) => {
			this.toggleTaskCompletion(task);
		};

		// Handle task completion toggle from details panel
		this.detailsComponent.onTaskToggleComplete = (task) => {
			this.toggleTaskCompletion(task);
		};

		// Handle task edit from details panel
		this.detailsComponent.onTaskEdit = (task) => {
			this.editTask(task);
		};

		// Handle task updates from the details panel
		this.detailsComponent.onTaskUpdate = async (
			originalTask,
			updatedTask
		) => {
			await this.updateTask(originalTask, updatedTask);
		};

		// Handle project selection from sidebar
		this.sidebarComponent.onProjectSelected = (project: string) => {
			// Set projects view mode with the selected project
			this.currentViewMode = "projects";
			// Hide other components and show projects component
			this.contentComponent.containerEl.hide();
			this.forecastComponent.containerEl.hide();
			this.tagsComponent.containerEl.hide();
			this.projectsComponent.containerEl.show();
			// Initialize projects component with the selected project
			this.projectsComponent.setTasks(this.tasks);
			// Manually select the project
			const projectItems =
				this.projectsComponent.containerEl.querySelectorAll(
					".project-list-item"
				);
			projectItems.forEach((item) => {
				const itemProject = item.getAttribute("data-project");
				if (itemProject === project) {
					// Simulate a click on the project item
					item.dispatchEvent(new MouseEvent("click"));
				}
			});
		};

		// Handle view mode changes from sidebar
		this.sidebarComponent.onViewModeChanged = (viewMode: ViewMode) => {
			this.currentViewMode = viewMode;

			// Hide all content components first
			this.contentComponent.containerEl.hide();
			this.forecastComponent.containerEl.hide();
			this.tagsComponent.containerEl.hide();
			this.projectsComponent.containerEl.hide();

			// Toggle visibility of components based on view mode
			if (viewMode === "forecast") {
				this.forecastComponent.containerEl.show();
				this.forecastComponent.setTasks(this.tasks);
			} else if (viewMode === "tags") {
				this.tagsComponent.containerEl.show();
				this.tagsComponent.setTasks(this.tasks);
			} else if (viewMode === "projects") {
				this.projectsComponent.containerEl.show();
				this.projectsComponent.setTasks(this.tasks);
			} else {
				this.contentComponent.containerEl.show();
				this.contentComponent.setViewMode(viewMode);
			}

			this.app.saveLocalStorage("task-genius:view-mode", viewMode);
		};

		// Handle task selection from forecast view
		this.forecastComponent.onTaskSelected = (task: Task) => {
			if (task) {
				this.detailsComponent.showTaskDetails(task);
				this.toggleDetailsVisibility(true);
			}
		};

		// Handle task completion toggle from forecast view
		this.forecastComponent.onTaskCompleted = (task: Task) => {
			this.toggleTaskCompletion(task);
		};

		// Handle task selection from tags view
		this.tagsComponent.onTaskSelected = (task: Task) => {
			if (task) {
				this.detailsComponent.showTaskDetails(task);
				this.toggleDetailsVisibility(true);
			}
		};

		// Handle task completion toggle from tags view
		this.tagsComponent.onTaskCompleted = (task: Task) => {
			this.toggleTaskCompletion(task);
		};

		// Handle task selection from projects view
		this.projectsComponent.onTaskSelected = (task: Task) => {
			if (task) {
				this.detailsComponent.showTaskDetails(task);
				this.toggleDetailsVisibility(true);
			}
		};

		// Handle task completion toggle from projects view
		this.projectsComponent.onTaskCompleted = (task: Task) => {
			this.toggleTaskCompletion(task);
		};
	}

	private async loadTasks() {
		// Get active task manager from plugin
		const taskManager = (this.plugin as TaskProgressBarPlugin).taskManager;
		if (!taskManager) return;

		// Get all tasks
		this.tasks = taskManager.getAllTasks();

		// Initialize the sidebar project tree
		// await this.sidebarComponent.initializeProjectTree(this.tasks);

		// Set tasks in components
		this.contentComponent.setTasks(this.tasks);
		this.forecastComponent.setTasks(this.tasks);
		this.tagsComponent.setTasks(this.tasks);
		this.projectsComponent.setTasks(this.tasks);
	}

	private async toggleTaskCompletion(task: Task) {
		// Clone the task to avoid direct mutation
		const updatedTask = { ...task, completed: !task.completed };

		if (updatedTask.completed) {
			updatedTask.completedDate = Date.now();
		} else {
			updatedTask.completedDate = undefined;
		}

		console.log("toggleTaskCompletion", updatedTask);

		// Get active task manager from plugin
		const taskManager = (this.plugin as TaskProgressBarPlugin).taskManager;
		console.log("taskManager", taskManager);
		if (!taskManager) return;

		// Update the task
		await taskManager.updateTask(updatedTask);

		// Update the task in all components
		this.contentComponent.updateTask(updatedTask);

		// Update in the appropriate view component
		if (this.currentViewMode === "forecast") {
			this.forecastComponent.updateTask(updatedTask);
		} else if (this.currentViewMode === "tags") {
			this.tagsComponent.updateTask(updatedTask);
		} else if (this.currentViewMode === "projects") {
			this.projectsComponent.updateTask(updatedTask);
		}

		// If this is the currently selected task, update details
		const selectedTask = this.contentComponent.getSelectedTask();
		if (selectedTask && selectedTask.id === updatedTask.id) {
			this.detailsComponent.showTaskDetails(updatedTask);
		}
	}

	private async updateTask(originalTask: Task, updatedTask: Task) {
		// Get active task manager from plugin
		const taskManager = (this.plugin as TaskProgressBarPlugin).taskManager;
		if (!taskManager) {
			throw new Error("Task manager not available");
		}

		// Update the task
		await taskManager.updateTask(updatedTask);

		// Update the task in all components
		this.contentComponent.updateTask(updatedTask);

		// Update in the appropriate view component
		if (this.currentViewMode === "forecast") {
			this.forecastComponent.updateTask(updatedTask);
		} else if (this.currentViewMode === "tags") {
			this.tagsComponent.updateTask(updatedTask);
		} else if (this.currentViewMode === "projects") {
			this.projectsComponent.updateTask(updatedTask);
		}

		return updatedTask;
	}

	private async editTask(task: Task) {
		// Get the file from the vault
		const file = this.app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) return;

		// Open the file
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);

		// Try to set the cursor at the task's line
		const editor = this.app.workspace.activeEditor?.editor;
		if (editor) {
			editor.setCursor({ line: task.line, ch: 0 });
			editor.focus();
		}
	}

	private registerEvents() {
		// Re-filter tasks when task cache is updated
		this.registerEvent(
			this.app.workspace.on(
				"task-genius:task-cache-updated",
				async () => {
					await this.loadTasks();
				}
			)
		);
	}

	async onClose() {
		// Clean up
		this.rootContainerEl.empty();
	}
}
