import { App, Component, setIcon } from "obsidian";
import { Task } from "../../utils/types/TaskIndex";
import { TaskListItemComponent } from "./listItem";
import { t } from "../../translations/helper";
import "../../styles/project-view.css";
import { tasksToTree, flattenTaskTree } from "../../utils/treeViewUtil";
import { TaskTreeItemComponent } from "./treeItem";

interface SelectedProjects {
	projects: string[];
	tasks: Task[];
	isMultiSelect: boolean;
}

export class ProjectsComponent extends Component {
	// UI Elements
	public containerEl: HTMLElement;
	private projectsHeaderEl: HTMLElement;
	private projectsListEl: HTMLElement;
	private taskContainerEl: HTMLElement;
	private taskListContainerEl: HTMLElement;
	private titleEl: HTMLElement;
	private countEl: HTMLElement;

	// Child components
	private taskComponents: TaskListItemComponent[] = [];
	private treeComponents: TaskTreeItemComponent[] = [];

	// State
	private allTasks: Task[] = [];
	private filteredTasks: Task[] = [];
	private selectedProjects: SelectedProjects = {
		projects: [],
		tasks: [],
		isMultiSelect: false,
	};
	private allProjectsMap: Map<string, Set<string>> = new Map(); // project -> taskIds
	private isTreeView: boolean = false;

	// Events
	public onTaskSelected: (task: Task) => void;
	public onTaskCompleted: (task: Task) => void;

	constructor(private parentEl: HTMLElement, private app: App) {
		super();
	}

	onload() {
		// Create main container
		this.containerEl = this.parentEl.createDiv({
			cls: "projects-container",
		});

		// Create content container for columns
		const contentContainer = this.containerEl.createDiv({
			cls: "projects-content",
		});

		// Left column: create projects list
		this.createLeftColumn(contentContainer);

		// Right column: create task list for selected projects
		this.createRightColumn(contentContainer);
	}

	private createProjectsHeader() {
		this.projectsHeaderEl = this.containerEl.createDiv({
			cls: "projects-header",
		});

		// Title and project count
		const titleContainer = this.projectsHeaderEl.createDiv({
			cls: "projects-title-container",
		});

		this.titleEl = titleContainer.createDiv({
			cls: "projects-title",
			text: t("Projects"),
		});

		this.countEl = titleContainer.createDiv({
			cls: "projects-count",
		});
		this.countEl.setText("0 projects");
	}

	private createLeftColumn(parentEl: HTMLElement) {
		const leftColumnEl = parentEl.createDiv({
			cls: "projects-left-column",
		});

		// Header for the projects section
		const headerEl = leftColumnEl.createDiv({
			cls: "projects-sidebar-header",
		});

		const headerTitle = headerEl.createDiv({
			cls: "projects-sidebar-title",
			text: t("Projects"),
		});

		// Add multi-select toggle button
		const multiSelectBtn = headerEl.createDiv({
			cls: "projects-multi-select-btn",
		});
		setIcon(multiSelectBtn, "list-plus");
		multiSelectBtn.setAttribute("aria-label", t("Toggle multi-select"));

		this.registerDomEvent(multiSelectBtn, "click", () => {
			this.toggleMultiSelect();
		});

		// Projects list container
		this.projectsListEl = leftColumnEl.createDiv({
			cls: "projects-sidebar-list",
		});
	}

	private createRightColumn(parentEl: HTMLElement) {
		this.taskContainerEl = parentEl.createDiv({
			cls: "projects-right-column",
		});

		// Task list header
		const taskHeaderEl = this.taskContainerEl.createDiv({
			cls: "projects-task-header",
		});

		const taskTitleEl = taskHeaderEl.createDiv({
			cls: "projects-task-title",
		});
		taskTitleEl.setText(t("Tasks"));

		const taskCountEl = taskHeaderEl.createDiv({
			cls: "projects-task-count",
		});
		taskCountEl.setText("0 tasks");

		// Add view toggle button
		const viewToggleBtn = taskHeaderEl.createDiv({
			cls: "view-toggle-btn",
		});
		setIcon(viewToggleBtn, "list");
		viewToggleBtn.setAttribute("aria-label", t("Toggle list/tree view"));

		this.registerDomEvent(viewToggleBtn, "click", () => {
			this.toggleViewMode();
		});

		// Task list container
		this.taskListContainerEl = this.taskContainerEl.createDiv({
			cls: "projects-task-list",
		});
	}

	public setTasks(tasks: Task[]) {
		this.allTasks = tasks;
		this.buildProjectsIndex();
		this.renderProjectsList();

		// If projects were already selected, update the tasks
		if (this.selectedProjects.projects.length > 0) {
			this.updateSelectedTasks();
		} else {
			this.renderEmptyTaskList();
		}
	}

	private buildProjectsIndex() {
		// Clear existing index
		this.allProjectsMap.clear();

		// Build a map of projects to task IDs
		this.allTasks.forEach((task) => {
			if (task.project) {
				if (!this.allProjectsMap.has(task.project)) {
					this.allProjectsMap.set(task.project, new Set());
				}
				this.allProjectsMap.get(task.project)?.add(task.id);
			}
		});

		// Update projects count
		this.countEl?.setText(`${this.allProjectsMap.size} projects`);
	}

	private renderProjectsList() {
		// Clear existing list
		this.projectsListEl.empty();

		// Sort projects alphabetically
		const sortedProjects = Array.from(this.allProjectsMap.keys()).sort();

		// Render each project
		sortedProjects.forEach((project) => {
			// Get task count for this project
			const taskCount = this.allProjectsMap.get(project)?.size || 0;

			// Create project item
			const projectItem = this.projectsListEl.createDiv({
				cls: "project-list-item",
			});

			// Project icon
			const projectIconEl = projectItem.createDiv({
				cls: "project-icon",
			});
			setIcon(projectIconEl, "folder");

			// Project name
			const projectNameEl = projectItem.createDiv({
				cls: "project-name",
			});
			projectNameEl.setText(project);

			// Task count badge
			const countEl = projectItem.createDiv({
				cls: "project-count",
			});
			countEl.setText(taskCount.toString());

			// Store project name as data attribute
			projectItem.dataset.project = project;

			// Check if this project is already selected
			if (this.selectedProjects.projects.includes(project)) {
				projectItem.classList.add("selected");
			}

			// Add click handler
			this.registerDomEvent(projectItem, "click", (e) => {
				this.handleProjectSelection(project, e.ctrlKey || e.metaKey);
			});
		});

		// Add empty state if no projects
		if (sortedProjects.length === 0) {
			const emptyEl = this.projectsListEl.createDiv({
				cls: "projects-empty-state",
			});
			emptyEl.setText(t("No projects found"));
		}
	}

	private handleProjectSelection(project: string, isCtrlPressed: boolean) {
		if (this.selectedProjects.isMultiSelect || isCtrlPressed) {
			// Multi-select mode
			const index = this.selectedProjects.projects.indexOf(project);
			if (index === -1) {
				// Add to selection
				this.selectedProjects.projects.push(project);
			} else {
				// Remove from selection
				this.selectedProjects.projects.splice(index, 1);
			}

			// If no projects selected and not in multi-select mode, reset
			if (
				this.selectedProjects.projects.length === 0 &&
				!this.selectedProjects.isMultiSelect
			) {
				this.renderEmptyTaskList();
				return;
			}
		} else {
			// Single-select mode
			this.selectedProjects.projects = [project];
		}

		// Update UI to show which projects are selected
		const projectItems =
			this.projectsListEl.querySelectorAll(".project-list-item");
		projectItems.forEach((item) => {
			const itemProject = item.getAttribute("data-project");
			if (
				itemProject &&
				this.selectedProjects.projects.includes(itemProject)
			) {
				item.classList.add("selected");
			} else {
				item.classList.remove("selected");
			}
		});

		// Update tasks based on selected projects
		this.updateSelectedTasks();
	}

	private toggleMultiSelect() {
		this.selectedProjects.isMultiSelect =
			!this.selectedProjects.isMultiSelect;

		// Update UI to reflect multi-select mode
		if (this.selectedProjects.isMultiSelect) {
			this.containerEl.classList.add("multi-select-mode");
		} else {
			this.containerEl.classList.remove("multi-select-mode");

			// If no projects are selected, reset the view
			if (this.selectedProjects.projects.length === 0) {
				this.renderEmptyTaskList();
			}
		}
	}

	private toggleViewMode() {
		this.isTreeView = !this.isTreeView;

		// Update toggle button icon
		const viewToggleBtn = this.taskContainerEl.querySelector(
			".view-toggle-btn"
		) as HTMLElement;
		if (viewToggleBtn) {
			setIcon(viewToggleBtn, this.isTreeView ? "git-branch" : "list");
		}

		// Update tasks display
		this.renderTaskList();
	}

	private updateSelectedTasks() {
		if (this.selectedProjects.projects.length === 0) {
			this.renderEmptyTaskList();
			return;
		}

		// Get tasks from all selected projects (OR logic)
		const resultTaskIds = new Set<string>();

		// Union all task sets from selected projects
		this.selectedProjects.projects.forEach((project) => {
			const taskIds = this.allProjectsMap.get(project);
			if (taskIds) {
				taskIds.forEach((id) => resultTaskIds.add(id));
			}
		});

		// Convert task IDs to actual task objects
		this.filteredTasks = this.allTasks.filter((task) =>
			resultTaskIds.has(task.id)
		);

		// Sort tasks by priority and due date
		this.filteredTasks.sort((a, b) => {
			// First by completion status
			if (a.completed !== b.completed) {
				return a.completed ? 1 : -1;
			}

			// Then by priority (high to low)
			const priorityA = a.priority || 0;
			const priorityB = b.priority || 0;
			if (priorityA !== priorityB) {
				return priorityB - priorityA;
			}

			// Then by due date (early to late)
			const dueDateA = a.dueDate || Number.MAX_SAFE_INTEGER;
			const dueDateB = b.dueDate || Number.MAX_SAFE_INTEGER;
			return dueDateA - dueDateB;
		});

		// Update the task list
		this.renderTaskList();
	}

	private renderTaskList() {
		// Clean up existing task components
		this.taskComponents.forEach((component) => {
			component.unload();
		});
		this.taskComponents = [];

		// Clean up existing tree components
		this.treeComponents.forEach((component) => {
			component.unload();
		});
		this.treeComponents = [];

		// Clear container
		this.taskListContainerEl.empty();

		// Update the header with selected projects
		const taskHeaderEl = this.taskContainerEl.querySelector(
			".projects-task-title"
		);
		if (taskHeaderEl) {
			if (this.selectedProjects.projects.length === 1) {
				// Show the project name if only one selected
				taskHeaderEl.textContent = this.selectedProjects.projects[0];
			} else {
				// Show count if multiple selected
				taskHeaderEl.textContent = `${
					this.selectedProjects.projects.length
				} ${t("projects selected")}`;
			}
		}

		// Update task count
		const taskCountEl = this.taskContainerEl.querySelector(
			".projects-task-count"
		);
		if (taskCountEl) {
			taskCountEl.textContent = `${this.filteredTasks.length} ${t(
				"tasks"
			)}`;
		}

		if (this.filteredTasks.length === 0) {
			// Show empty state
			const emptyEl = this.taskListContainerEl.createDiv({
				cls: "projects-empty-state",
			});
			emptyEl.setText(t("No tasks in the selected projects"));
			return;
		}

		// Render tasks based on view mode
		if (this.isTreeView) {
			this.renderTreeView();
		} else {
			this.renderListView();
		}
	}

	private renderListView() {
		// Render each task
		this.filteredTasks.forEach((task) => {
			const taskComponent = new TaskListItemComponent(
				task,
				"projects",
				this.app
			);

			// Set up event handlers
			taskComponent.onTaskSelected = (selectedTask) => {
				if (this.onTaskSelected) {
					this.onTaskSelected(selectedTask);
				}
			};

			taskComponent.onTaskCompleted = (completedTask) => {
				if (this.onTaskCompleted) {
					this.onTaskCompleted(completedTask);
				}
			};

			// Load component
			this.addChild(taskComponent);
			taskComponent.load();

			// Add to DOM
			this.taskListContainerEl.appendChild(taskComponent.element);

			// Store for later cleanup
			this.taskComponents.push(taskComponent);
		});
	}

	private renderTreeView() {
		// Convert tasks to tree structure
		const rootTasks = tasksToTree(this.filteredTasks);
		const taskMap = new Map<string, Task>();
		this.filteredTasks.forEach((task) => taskMap.set(task.id, task));

		// Render root tasks with their children
		rootTasks.forEach((rootTask) => {
			// Find direct children
			const childTasks = this.filteredTasks.filter(
				(task) => task.parent === rootTask.id
			);

			const treeComponent = new TaskTreeItemComponent(
				rootTask,
				"projects",
				this.app,
				0,
				childTasks
			);

			// Set up event handlers
			treeComponent.onTaskSelected = (selectedTask) => {
				if (this.onTaskSelected) {
					this.onTaskSelected(selectedTask);
				}
			};

			treeComponent.onTaskCompleted = (task) => {
				if (this.onTaskCompleted) {
					this.onTaskCompleted(task);
				}
			};

			// Load component
			this.addChild(treeComponent);
			treeComponent.load();

			// Add to DOM
			this.taskListContainerEl.appendChild(treeComponent.element);

			// Store for later cleanup
			this.treeComponents.push(treeComponent);
		});
	}

	private renderEmptyTaskList() {
		// Clean up existing components
		this.taskComponents.forEach((component) => {
			component.unload();
		});
		this.taskComponents = [];

		// Clear container
		this.taskListContainerEl.empty();

		// Reset the header
		const taskHeaderEl = this.taskContainerEl.querySelector(
			".projects-task-title"
		);
		if (taskHeaderEl) {
			taskHeaderEl.textContent = t("Tasks");
		}

		// Reset task count
		const taskCountEl = this.taskContainerEl.querySelector(
			".projects-task-count"
		);
		if (taskCountEl) {
			taskCountEl.textContent = "0 tasks";
		}

		// Show instruction state
		const emptyEl = this.taskListContainerEl.createDiv({
			cls: "projects-empty-state",
		});
		emptyEl.setText(t("Select a project to see related tasks"));
	}

	public updateTask(updatedTask: Task) {
		// Find and update the task component
		const component = this.taskComponents.find(
			(c) => c.getTask().id === updatedTask.id
		);

		if (component) {
			component.updateTask(updatedTask);
		}

		// Update in our tasks lists
		const taskIndex = this.allTasks.findIndex(
			(t) => t.id === updatedTask.id
		);
		if (taskIndex !== -1) {
			this.allTasks[taskIndex] = updatedTask;
		}

		const filteredIndex = this.filteredTasks.findIndex(
			(t) => t.id === updatedTask.id
		);
		if (filteredIndex !== -1) {
			this.filteredTasks[filteredIndex] = updatedTask;
		}

		// Rebuild project index and rerender if project changed
		const oldTask = this.allTasks[taskIndex];
		if (!oldTask || oldTask.project !== updatedTask.project) {
			this.buildProjectsIndex();
			this.renderProjectsList();
			this.updateSelectedTasks();
		}
	}

	onunload() {
		// Clean up task components
		this.taskComponents.forEach((component) => {
			component.unload();
		});

		// Clean up tree components
		this.treeComponents.forEach((component) => {
			component.unload();
		});

		this.containerEl.empty();
		this.containerEl.remove();
	}
}
