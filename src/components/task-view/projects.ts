import {
	App,
	Component,
	setIcon,
	ExtraButtonComponent,
	Platform,
} from "obsidian";
import { Task } from "../../types/task";
import { t } from "../../translations/helper";
import "../../styles/project-view.css";
import "../../styles/project-tree.css";
import { TaskListRendererComponent } from "./TaskList";
import TaskProgressBarPlugin from "../../index";
import { sortTasks } from "../../commands/sortTaskCommands";
import { getEffectiveProject } from "../../utils/taskUtil";
import { getInitialViewMode, saveViewMode } from "../../utils/viewModeUtils";
import { ProjectTreeComponent } from "./ProjectTreeComponent";
import { buildProjectTree } from "../../utils/projectTreeBuilder";
import { TreeNode, ProjectNodeData } from "../../types/tree";
import { filterTasksByProjectPaths } from "../../utils/projectFilter";

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
	private leftColumnEl: HTMLElement;

	// Child components
	private taskRenderer: TaskListRendererComponent;

	// State
	private allTasks: Task[] = [];
	private filteredTasks: Task[] = [];
	private selectedProjects: SelectedProjects = {
		projects: [],
		tasks: [],
		isMultiSelect: false,
	};
	private allProjectsMap: Map<string, Set<string>> = new Map();
	private isTreeView: boolean = false;
	private allTasksMap: Map<string, Task> = new Map();
	private isProjectTreeView: boolean = false;
	private projectTreeComponent?: ProjectTreeComponent;
	private projectTree?: TreeNode<ProjectNodeData>;
	constructor(
		private parentEl: HTMLElement,
		private app: App,
		private plugin: TaskProgressBarPlugin,
		private params: {
			onTaskSelected?: (task: Task | null) => void;
			onTaskCompleted?: (task: Task) => void;
			onTaskUpdate?: (task: Task, updatedTask: Task) => Promise<void>;
			onTaskContextMenu?: (event: MouseEvent, task: Task) => void;
		} = {}
	) {
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

		// Initialize view mode from saved state or global default
		this.initializeViewMode();
		
		// Load project tree view preference from localStorage
		const savedTreeView = localStorage.getItem('task-genius-project-tree-view');
		this.isProjectTreeView = savedTreeView === 'true';

		// Initialize the task renderer
		this.taskRenderer = new TaskListRendererComponent(
			this,
			this.taskListContainerEl,
			this.plugin,
			this.app,
			"projects"
		);

		// Connect event handlers
		this.taskRenderer.onTaskSelected = (task) => {
			if (this.params.onTaskSelected) this.params.onTaskSelected(task);
		};
		this.taskRenderer.onTaskCompleted = (task) => {
			if (this.params.onTaskCompleted) this.params.onTaskCompleted(task);
		};
		this.taskRenderer.onTaskUpdate = async (originalTask, updatedTask) => {
			if (this.params.onTaskUpdate) {
				await this.params.onTaskUpdate(originalTask, updatedTask);
			}
		};
		this.taskRenderer.onTaskContextMenu = (event, task) => {
			if (this.params.onTaskContextMenu)
				this.params.onTaskContextMenu(event, task);
		};
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
		this.countEl.setText(`0 ${t("projects")}`);
	}

	private createLeftColumn(parentEl: HTMLElement) {
		this.leftColumnEl = parentEl.createDiv({
			cls: "projects-left-column",
		});

		// Add close button for mobile

		// Header for the projects section
		const headerEl = this.leftColumnEl.createDiv({
			cls: "projects-sidebar-header",
		});

		const headerTitle = headerEl.createDiv({
			cls: "projects-sidebar-title",
			text: t("Projects"),
		});

		// Add view toggle button for tree/list
		const treeToggleBtn = headerEl.createDiv({
			cls: "projects-tree-toggle-btn",
		});
		setIcon(treeToggleBtn, this.isProjectTreeView ? "git-branch" : "list");
		treeToggleBtn.setAttribute("aria-label", t("Toggle tree/list view"));
		
		this.registerDomEvent(treeToggleBtn, "click", () => {
			this.toggleProjectTreeView();
		});
		
		// Add multi-select toggle button
		const multiSelectBtn = headerEl.createDiv({
			cls: "projects-multi-select-btn",
		});
		setIcon(multiSelectBtn, "list-plus");
		multiSelectBtn.setAttribute("aria-label", t("Toggle multi-select"));

		if (Platform.isPhone) {
			const closeBtn = headerEl.createDiv({
				cls: "projects-sidebar-close",
			});

			new ExtraButtonComponent(closeBtn).setIcon("x").onClick(() => {
				this.toggleLeftColumnVisibility(false);
			});
		}
		this.registerDomEvent(multiSelectBtn, "click", () => {
			this.toggleMultiSelect();
		});

		// Projects list container
		this.projectsListEl = this.leftColumnEl.createDiv({
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

		// Add sidebar toggle button for mobile
		if (Platform.isPhone) {
			taskHeaderEl.createEl(
				"div",
				{
					cls: "projects-sidebar-toggle",
				},
				(el) => {
					new ExtraButtonComponent(el)
						.setIcon("sidebar")
						.onClick(() => {
							this.toggleLeftColumnVisibility();
						});
				}
			);
		}

		const taskTitleEl = taskHeaderEl.createDiv({
			cls: "projects-task-title",
		});
		taskTitleEl.setText(t("Tasks"));

		const taskCountEl = taskHeaderEl.createDiv({
			cls: "projects-task-count",
		});
		taskCountEl.setText(`0 ${t("tasks")}`);

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
		this.allTasksMap = new Map(
			this.allTasks.map((task) => [task.id, task])
		);
		this.buildProjectsIndex();
		this.renderProjectsList();

		// If projects were already selected, update the tasks
		if (this.selectedProjects.projects.length > 0) {
			this.updateSelectedTasks();
		} else {
			this.taskRenderer.renderTasks(
				[],
				this.isTreeView,
				this.allTasksMap,
				t("Select a project to see related tasks")
			);
			this.updateTaskListHeader(t("Tasks"), `0 ${t("tasks")}`);
		}
	}

	private buildProjectsIndex() {
		// Clear existing index
		this.allProjectsMap.clear();

		// Build a map of projects to task IDs
		this.allTasks.forEach((task) => {
			const effectiveProject = getEffectiveProject(task);
			if (effectiveProject) {
				if (!this.allProjectsMap.has(effectiveProject)) {
					this.allProjectsMap.set(effectiveProject, new Set());
				}
				this.allProjectsMap.get(effectiveProject)?.add(task.id);
			}
		});

		// Build project tree if in tree view
		if (this.isProjectTreeView) {
			const separator = this.plugin.settings.projectPathSeparator || "/";
			this.projectTree = buildProjectTree(this.allProjectsMap, separator);
		}

		// Update projects count
		this.countEl?.setText(`${this.allProjectsMap.size} projects`);
	}

	private renderProjectsList() {
		// Clear existing list
		this.projectsListEl.empty();

		if (this.isProjectTreeView && this.projectTree) {
			// Render as tree
			if (this.projectTreeComponent) {
				this.projectTreeComponent.unload();
			}
			
			this.projectTreeComponent = new ProjectTreeComponent(
				this.projectsListEl,
				this.app,
				this.plugin
			);
			
			// Set up event handlers
			this.projectTreeComponent.onNodeSelected = (selectedNodes: Set<string>, tasks: Task[]) => {
				this.selectedProjects.projects = Array.from(selectedNodes);
				this.updateSelectedTasks();
			};
			
			this.projectTreeComponent.onMultiSelectToggled = (isMultiSelect: boolean) => {
				this.selectedProjects.isMultiSelect = isMultiSelect;
				if (!isMultiSelect && this.selectedProjects.projects.length === 0) {
					this.taskRenderer.renderTasks(
						[],
						this.isTreeView,
						this.allTasksMap,
						t("Select a project to see related tasks")
					);
					this.updateTaskListHeader(t("Tasks"), `0 ${t("tasks")}`);
				}
			};
			this.projectTreeComponent.load();
			// Set the tree that was already built
			if (this.projectTree) {
				this.projectTreeComponent.setTree(this.projectTree, this.allTasks);
			}
		} else {
			// Render as flat list
			if (this.projectTreeComponent) {
				this.projectTreeComponent.unload();
				this.projectTreeComponent = undefined;
			}
			
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
				this.taskRenderer.renderTasks(
					[],
					this.isTreeView,
					this.allTasksMap,
					t("Select a project to see related tasks")
				);
				this.updateTaskListHeader(t("Tasks"), `0 ${t("tasks")}`);
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
				this.taskRenderer.renderTasks(
					[],
					this.isTreeView,
					this.allTasksMap,
					t("Select a project to see related tasks")
				);
				this.updateTaskListHeader(t("Tasks"), `0 ${t("tasks")}`);
			}
		}
		
		// Update tree component if it exists
		if (this.projectTreeComponent) {
			this.projectTreeComponent.setMultiSelectMode(this.selectedProjects.isMultiSelect);
		}
	}

	/**
	 * Initialize view mode from saved state or global default
	 */
	private initializeViewMode() {
		this.isTreeView = getInitialViewMode(this.app, this.plugin, "projects");
		// Update the toggle button icon to match the initial state
		const viewToggleBtn = this.taskContainerEl?.querySelector(
			".view-toggle-btn"
		) as HTMLElement;
		if (viewToggleBtn) {
			setIcon(viewToggleBtn, this.isTreeView ? "git-branch" : "list");
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

		// Save the new view mode state
		saveViewMode(this.app, "projects", this.isTreeView);

		// Update tasks display using the renderer
		this.renderTaskList();
	}

	private updateSelectedTasks() {
		if (this.selectedProjects.projects.length === 0) {
			this.taskRenderer.renderTasks(
				[],
				this.isTreeView,
				this.allTasksMap,
				t("Select a project to see related tasks")
			);
			this.updateTaskListHeader(t("Tasks"), `0 ${t("tasks")}`);
			return;
		}

		// Use the project filter utility for inclusive filtering in tree view
		if (this.isProjectTreeView) {
			this.filteredTasks = filterTasksByProjectPaths(
				this.allTasks,
				this.selectedProjects.projects,
				this.plugin.settings.projectPathSeparator || "/"
			);
		} else {
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
		}

		const viewConfig = this.plugin.settings.viewConfiguration.find(
			(view) => view.id === "projects"
		);
		if (viewConfig?.sortCriteria && viewConfig.sortCriteria.length > 0) {
			this.filteredTasks = sortTasks(
				this.filteredTasks,
				viewConfig.sortCriteria,
				this.plugin.settings
			);
		} else {
			// Sort tasks by priority and due date
			// Sort tasks by priority and due date
			this.filteredTasks.sort((a, b) => {
				// First by completion status
				if (a.completed !== b.completed) {
					return a.completed ? 1 : -1;
				}

				// Then by priority (high to low)
				const priorityA = a.metadata.priority || 0;
				const priorityB = b.metadata.priority || 0;
				if (priorityA !== priorityB) {
					return priorityB - priorityA;
				}

				// Then by due date (early to late)
				const dueDateA = a.metadata.dueDate || Number.MAX_SAFE_INTEGER;
				const dueDateB = b.metadata.dueDate || Number.MAX_SAFE_INTEGER;
				return dueDateA - dueDateB;
			});
		}

		// Update the task list using the renderer
		this.renderTaskList();
	}

	private updateTaskListHeader(title: string, countText: string) {
		const taskHeaderEl = this.taskContainerEl.querySelector(
			".projects-task-title"
		);
		if (taskHeaderEl) {
			taskHeaderEl.textContent = title;
		}

		const taskCountEl = this.taskContainerEl.querySelector(
			".projects-task-count"
		);
		if (taskCountEl) {
			taskCountEl.textContent = countText;
		}
	}

	private renderTaskList() {
		// Update the header
		let title = t("Tasks");
		if (this.selectedProjects.projects.length === 1) {
			title = this.selectedProjects.projects[0];
		} else if (this.selectedProjects.projects.length > 1) {
			title = `${this.selectedProjects.projects.length} ${t(
				"projects selected"
			)}`;
		}
		const countText = `${this.filteredTasks.length} ${t("tasks")}`;
		this.updateTaskListHeader(title, countText);

		// Use the renderer to display tasks or empty state
		this.taskRenderer.renderTasks(
			this.filteredTasks,
			this.isTreeView,
			this.allTasksMap,
			t("No tasks in the selected projects")
		);
	}

	public updateTask(updatedTask: Task) {
		// Update in our main tasks list
		const taskIndex = this.allTasks.findIndex(
			(t) => t.id === updatedTask.id
		);
		let needsFullRefresh = false;
		if (taskIndex !== -1) {
			const oldTask = this.allTasks[taskIndex];
			// Check if project assignment changed, which affects the sidebar/filtering
			if (oldTask.metadata.project !== updatedTask.metadata.project) {
				needsFullRefresh = true;
			}
			this.allTasks[taskIndex] = updatedTask;
		} else {
			// Task is potentially new, add it and refresh
			this.allTasks.push(updatedTask);
			needsFullRefresh = true;
		}

		// If project changed or task is new, rebuild index and fully refresh UI
		if (needsFullRefresh) {
			this.buildProjectsIndex();
			this.renderProjectsList(); // Update left sidebar
			this.updateSelectedTasks(); // Recalculate filtered tasks and re-render right panel
		} else {
			// Otherwise, just update the task in the filtered list and the renderer
			const filteredIndex = this.filteredTasks.findIndex(
				(t) => t.id === updatedTask.id
			);
			if (filteredIndex !== -1) {
				this.filteredTasks[filteredIndex] = updatedTask;
				// Ask the renderer to update the specific component
				this.taskRenderer.updateTask(updatedTask);
				// Optional: Re-sort if sorting criteria changed, then re-render
				// this.renderTaskList();
			} else {
				// Task might have become visible due to the update, requires re-filtering
				this.updateSelectedTasks();
			}
		}
	}

	private toggleProjectTreeView() {
		this.isProjectTreeView = !this.isProjectTreeView;
		
		// Update button icon
		const treeToggleBtn = this.leftColumnEl.querySelector(
			".projects-tree-toggle-btn"
		) as HTMLElement;
		if (treeToggleBtn) {
			setIcon(treeToggleBtn, this.isProjectTreeView ? "git-branch" : "list");
		}
		
		// Save preference to localStorage for now
		localStorage.setItem('task-genius-project-tree-view', this.isProjectTreeView.toString());
		
		// Rebuild project index and re-render
		this.buildProjectsIndex();
		this.renderProjectsList();
		
		// Update selected tasks if any projects are selected
		if (this.selectedProjects.projects.length > 0) {
			this.updateSelectedTasks();
		}
	}
	
	onunload() {
		if (this.projectTreeComponent) {
			this.projectTreeComponent.unload();
		}
		this.containerEl.empty();
		this.containerEl.remove();
	}

	// Toggle left column visibility with animation support
	private toggleLeftColumnVisibility(visible?: boolean) {
		if (visible === undefined) {
			// Toggle based on current state
			visible = !this.leftColumnEl.hasClass("is-visible");
		}

		if (visible) {
			this.leftColumnEl.addClass("is-visible");
			this.leftColumnEl.show();
		} else {
			this.leftColumnEl.removeClass("is-visible");

			// Wait for animation to complete before hiding
			setTimeout(() => {
				if (!this.leftColumnEl.hasClass("is-visible")) {
					this.leftColumnEl.hide();
				}
			}, 300); // Match CSS transition duration
		}
	}
}
