import {
	App,
	Component,
	setIcon,
	ExtraButtonComponent,
	Platform,
} from "obsidian";
import { Task, TgProject } from "@/types/task";
import { t } from "@/translations/helper";
import "@/styles/project-view.css";
import "@/styles/project-tree.css";
import { TaskListRendererComponent } from "./TaskList";
import TaskProgressBarPlugin from "@/index";
import { sortTasks } from "@/commands/sortTaskCommands";
import { getEffectiveProject } from "@/utils/task/task-operations";
import { createPopper } from "@popperjs/core";
import { getInitialViewMode, saveViewMode } from "@/utils/ui/view-mode-utils";
import { ProjectTreeComponent } from "./ProjectTreeComponent";
import { buildProjectTree } from "@/core/project-tree-builder";
import { TreeNode, ProjectNodeData } from "@/types/tree";
import { filterTasksByProjectPaths } from "@/core/project-filter";
import {
	formatProgressText,
	ProgressData,
} from "@/editor-extensions/ui-widgets/progress-bar-widget";

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
	private headerTopRightRowEl?: HTMLElement;
	private projectPropsBtnEl: HTMLElement | null = null;
	private projectPropsPopoverEl: HTMLElement | null = null;
	private projectPropsPopper: any = null;

	private outsideClickHandler?: (e: MouseEvent) => void;
	private escKeyHandler?: (e: KeyboardEvent) => void;

	// State
	private allTasks: Task[] = [];
	private filteredTasks: Task[] = [];
	private externalFilteredTasks: Task[] | null = null; // Externally filtered tasks from FluentView
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

	private currentInfoProject: string | null = null;

	private infoRenderGen: number = 0;

	constructor(
		private parentEl: HTMLElement,
		private app: App,
		private plugin: TaskProgressBarPlugin,
		private params: {
			onTaskSelected?: (task: Task | null) => void;
			onTaskCompleted?: (task: Task) => void;
			onTaskUpdate?: (task: Task, updatedTask: Task) => Promise<void>;
			onTaskContextMenu?: (event: MouseEvent, task: Task) => void;
		} = {},
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
		const savedTreeView = this.app.loadLocalStorage(
			"task-genius-project-tree-view",
		);
		this.isProjectTreeView = savedTreeView === "true";

		// Initialize the task renderer
		this.taskRenderer = new TaskListRendererComponent(
			this,
			this.taskListContainerEl,
			this.plugin,
			this.app,
			"projects",
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

		const headerButtons = headerEl.createDiv({
			cls: "projects-sidebar-header-btn-group",
		});

		// Add view toggle button for tree/list
		const treeToggleBtn = headerButtons.createDiv({
			cls: "projects-tree-toggle-btn",
		});
		setIcon(treeToggleBtn, this.isProjectTreeView ? "git-branch" : "list");
		treeToggleBtn.setAttribute("aria-label", t("Toggle tree/list view"));

		this.registerDomEvent(treeToggleBtn, "click", () => {
			this.toggleProjectTreeView();
		});

		// Add multi-select toggle button
		const multiSelectBtn = headerButtons.createDiv({
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
				},
			);
		}

		// Header main content container
		const headerMainContent = taskHeaderEl.createDiv({
			cls: "projects-header-main-content",
		});

		// First row: title and actions
		const headerTopRow = headerMainContent.createDiv({
			cls: "projects-header-top-row",
		});

		const taskTitleEl = headerTopRow
			.createDiv({ cls: "projects-header-top-left" })
			.createDiv({
				cls: "projects-task-title",
			});
		taskTitleEl.setText(t("Tasks"));

		const headerTopRightRow = headerTopRow.createDiv({
			cls: "projects-header-top-right",
		});
		this.headerTopRightRowEl = headerTopRightRow;

		const taskCountEl = headerTopRightRow.createDiv({
			cls: "projects-task-count",
		});
		taskCountEl.setText(`0 ${t("tasks")}`);

		// Add view toggle button
		const viewToggleBtn = headerTopRightRow.createDiv({
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

		// Initialize tgProject props button state
		this.updateTgProjectPropsButton(null);
	}

	public setTasks(tasks: Task[], filteredTasks?: Task[]) {
		this.allTasks = tasks;
		this.externalFilteredTasks = filteredTasks || null;
		this.allTasksMap = new Map(
			this.allTasks.map((task) => [task.id, task]),
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
				t("Select a project to see related tasks"),
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
				this.plugin,
			);

			// Set up event handlers
			this.projectTreeComponent.onNodeSelected = (
				selectedNodes: Set<string>,
				tasks: Task[],
			) => {
				this.selectedProjects.projects = Array.from(selectedNodes);
				this.updateSelectedTasks();
				const single =
					this.selectedProjects.projects.length === 1
						? this.selectedProjects.projects[0]
						: null;
				this.updateTgProjectPropsButton(single);
			};

			this.projectTreeComponent.onMultiSelectToggled = (
				isMultiSelect: boolean,
			) => {
				this.selectedProjects.isMultiSelect = isMultiSelect;
				if (
					!isMultiSelect &&
					this.selectedProjects.projects.length === 0
				) {
					this.taskRenderer.renderTasks(
						[],
						this.isTreeView,
						this.allTasksMap,
						t("Select a project to see related tasks"),
					);
					this.updateTaskListHeader(t("Tasks"), `0 ${t("tasks")}`);
				}
			};
			this.projectTreeComponent.load();
			// Set the tree that was already built
			if (this.projectTree) {
				this.projectTreeComponent.setTree(
					this.projectTree,
					this.allTasks,
				);
			}
		} else {
			// Render as flat list
			if (this.projectTreeComponent) {
				this.projectTreeComponent.unload();
				this.projectTreeComponent = undefined;
			}

			// Sort projects alphabetically
			const sortedProjects = Array.from(
				this.allProjectsMap.keys(),
			).sort();

			// Render each project
			sortedProjects.forEach((project) => {
				// Get tasks for this project
				const projectTaskIds = this.allProjectsMap.get(project);
				const taskCount = projectTaskIds?.size || 0;

				// Calculate completed tasks for this project
				let completedCount = 0;
				if (projectTaskIds) {
					projectTaskIds.forEach((taskId) => {
						const task = this.allTasksMap.get(taskId);
						if (task && this.getTaskStatus(task) === "completed") {
							completedCount++;
						}
					});
				}

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

				// Task count badge with progress
				const countEl = projectItem.createDiv({
					cls: "project-count",
				});

				// Show completed/total format
				if (
					this.plugin.settings.addProgressBarToProjectsView &&
					taskCount > 0
				) {
					countEl.setText(`${completedCount}/${taskCount}`);
					// Add data attributes for styling
					countEl.dataset.completed = completedCount.toString();
					countEl.dataset.total = taskCount.toString();

					countEl.toggleClass("has-progress", true);

					// Add completion class for visual feedback
					if (completedCount === taskCount) {
						countEl.classList.add("all-completed");
					} else if (completedCount > 0) {
						countEl.classList.add("partially-completed");
					}
				} else {
					countEl.setText(taskCount.toString());
				}

				// Store project name as data attribute
				projectItem.dataset.project = project;

				// Check if this project is already selected
				if (this.selectedProjects.projects.includes(project)) {
					projectItem.classList.add("selected");
				}

				// Add click handler
				this.registerDomEvent(projectItem, "click", (e) => {
					this.handleProjectSelection(
						project,
						e.ctrlKey || e.metaKey,
					);
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
					t("Select a project to see related tasks"),
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
					t("Select a project to see related tasks"),
				);
				this.updateTaskListHeader(t("Tasks"), `0 ${t("tasks")}`);
				this.updateTgProjectPropsButton(null);
			}
		}

		// Update tree component if it exists
		if (this.projectTreeComponent) {
			this.projectTreeComponent.setMultiSelectMode(
				this.selectedProjects.isMultiSelect,
			);
		}
	}

	/**
	 * Initialize view mode from saved state or global default
	 */
	private initializeViewMode() {
		this.isTreeView = getInitialViewMode(this.app, this.plugin, "projects");
		// Update the toggle button icon to match the initial state
		const viewToggleBtn = this.taskContainerEl?.querySelector(
			".view-toggle-btn",
		) as HTMLElement;
		if (viewToggleBtn) {
			setIcon(viewToggleBtn, this.isTreeView ? "git-branch" : "list");
		}
	}

	private toggleViewMode() {
		this.isTreeView = !this.isTreeView;

		// Update toggle button icon
		const viewToggleBtn = this.taskContainerEl.querySelector(
			".view-toggle-btn",
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
				t("Select a project to see related tasks"),
			);
			this.updateTaskListHeader(t("Tasks"), `0 ${t("tasks")}`);
			return;
		}

		// Use the project filter utility for inclusive filtering in tree view
		if (this.isProjectTreeView) {
			this.filteredTasks = filterTasksByProjectPaths(
				this.allTasks,
				this.selectedProjects.projects,
				this.plugin.settings.projectPathSeparator || "/",
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
				resultTaskIds.has(task.id),
			);
		}

		const viewConfig = this.plugin.settings.viewConfiguration.find(
			(view) => view.id === "projects",
		);
		if (viewConfig?.sortCriteria && viewConfig.sortCriteria.length > 0) {
			this.filteredTasks = sortTasks(
				this.filteredTasks,
				viewConfig.sortCriteria,
				this.plugin.settings,
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

		// Apply external filter if provided (from FluentView filter system)
		// This ensures project tasks respect global filter conditions
		if (this.externalFilteredTasks) {
			const externalFilteredIds = new Set(
				this.externalFilteredTasks.map((t) => t.id),
			);
			this.filteredTasks = this.filteredTasks.filter((task) =>
				externalFilteredIds.has(task.id),
			);
		}

		// Update the task list using the renderer
		this.renderTaskList();
	}

	private updateTaskListHeader(title: string, countText: string) {
		const taskHeaderEl = this.taskContainerEl.querySelector(
			".projects-task-title",
		);
		if (taskHeaderEl) {
			taskHeaderEl.textContent = title;
		}

		const taskCountEl = this.taskContainerEl.querySelector(
			".projects-task-count",
		);
		if (taskCountEl) {
			taskCountEl.textContent = countText;
		}

		// Update progress bar if enabled and projects are selected
		this.updateProgressBar();
	}

	private updateProgressBar() {
		// Check if progress bar should be shown
		if (
			!this.plugin.settings.addProgressBarToProjectsView ||
			this.plugin.settings.progressBarDisplayMode === "none" ||
			this.filteredTasks.length === 0
		) {
			// Hide progress bar container if it exists
			const progressContainer = this.taskContainerEl.querySelector(
				".projects-header-progress",
			);
			if (progressContainer) {
				progressContainer.remove();
			}
			return;
		}

		// Calculate progress data
		const progressData = this.calculateProgressData();

		// Get or create progress container
		let progressContainer = this.taskContainerEl.querySelector(
			".projects-header-progress",
		) as HTMLElement;

		if (!progressContainer) {
			const headerMainContent = this.taskContainerEl.querySelector(
				".projects-header-main-content",
			);
			if (headerMainContent) {
				progressContainer = headerMainContent.createDiv({
					cls: "projects-header-progress",
				});
			}
		} else {
			// Clear existing content
			progressContainer.empty();
		}

		if (!progressContainer) return;

		const displayMode = this.plugin.settings.progressBarDisplayMode;

		// Render graphical progress bar using existing progress bar styles
		if (displayMode === "graphical" || displayMode === "both") {
			// Create progress bar with same structure as existing widgets
			const progressBarEl = progressContainer.createSpan({
				cls: "cm-task-progress-bar projects-progress",
			});

			const progressBackGroundEl = progressBarEl.createDiv({
				cls: "progress-bar-inline-background",
			});

			// Calculate percentages
			const completedPercentage =
				Math.round(
					(progressData.completed / progressData.total) * 10000,
				) / 100;
			const inProgressPercentage = progressData.inProgress
				? Math.round(
						(progressData.inProgress / progressData.total) * 10000,
					) / 100
				: 0;
			const abandonedPercentage = progressData.abandoned
				? Math.round(
						(progressData.abandoned / progressData.total) * 10000,
					) / 100
				: 0;
			const plannedPercentage = progressData.planned
				? Math.round(
						(progressData.planned / progressData.total) * 10000,
					) / 100
				: 0;

			// Create progress segments
			const progressEl = progressBackGroundEl.createDiv({
				cls: "progress-bar-inline progress-completed",
			});
			progressEl.style.width = completedPercentage + "%";

			// Add additional status bars if needed
			if (progressData.inProgress && progressData.inProgress > 0) {
				const inProgressEl = progressBackGroundEl.createDiv({
					cls: "progress-bar-inline progress-in-progress",
				});
				inProgressEl.style.width = inProgressPercentage + "%";
				inProgressEl.style.left = completedPercentage + "%";
			}

			if (progressData.abandoned && progressData.abandoned > 0) {
				const abandonedEl = progressBackGroundEl.createDiv({
					cls: "progress-bar-inline progress-abandoned",
				});
				abandonedEl.style.width = abandonedPercentage + "%";
				abandonedEl.style.left =
					completedPercentage + inProgressPercentage + "%";
			}

			if (progressData.planned && progressData.planned > 0) {
				const plannedEl = progressBackGroundEl.createDiv({
					cls: "progress-bar-inline progress-planned",
				});
				plannedEl.style.width = plannedPercentage + "%";
				plannedEl.style.left =
					completedPercentage +
					inProgressPercentage +
					abandonedPercentage +
					"%";
			}

			// Apply progress level class
			let progressClass = "progress-bar-inline";
			switch (true) {
				case completedPercentage === 0:
					progressClass += " progress-bar-inline-empty";
					break;
				case completedPercentage > 0 && completedPercentage < 25:
					progressClass += " progress-bar-inline-0";
					break;
				case completedPercentage >= 25 && completedPercentage < 50:
					progressClass += " progress-bar-inline-1";
					break;
				case completedPercentage >= 50 && completedPercentage < 75:
					progressClass += " progress-bar-inline-2";
					break;
				case completedPercentage >= 75 && completedPercentage < 100:
					progressClass += " progress-bar-inline-3";
					break;
				case completedPercentage >= 100:
					progressClass += " progress-bar-inline-complete";
					break;
			}
			progressEl.className = progressClass;
		}

		// Render text progress
		if (displayMode === "text" || displayMode === "both") {
			const progressText = formatProgressText(progressData, this.plugin);
			if (progressText) {
				// If we're in text-only mode, create a simple text container
				// If we're in "both" mode, the text was already added to the progress bar
				if (displayMode === "text") {
					const textEl = progressContainer.createDiv({
						cls: "progress-status projects-progress-text",
					});
					textEl.setText(progressText);
				} else if (displayMode === "both") {
					// Add text to the existing progress bar container
					const progressBarEl = progressContainer.querySelector(
						".cm-task-progress-bar",
					);
					if (progressBarEl) {
						const textEl = progressBarEl.createDiv({
							cls: "progress-status",
						});
						textEl.setText(progressText);
					}
				}
			}
		}
	}

	private calculateProgressData(): ProgressData {
		const data: ProgressData = {
			completed: 0,
			total: this.filteredTasks.length,
			inProgress: 0,
			abandoned: 0,
			notStarted: 0,
			planned: 0,
		};

		this.filteredTasks.forEach((task) => {
			const status = this.getTaskStatus(task);

			switch (status) {
				case "completed":
					data.completed++;
					break;
				case "inProgress":
					data.inProgress = (data.inProgress || 0) + 1;
					break;
				case "abandoned":
					data.abandoned = (data.abandoned || 0) + 1;
					break;
				case "planned":
					data.planned = (data.planned || 0) + 1;
					break;
				case "notStarted":
				default:
					data.notStarted = (data.notStarted || 0) + 1;
					break;
			}
		});

		return data;
	}

	/**
	 * Get the task status based on plugin settings
	 * Follows the same logic as progress-bar-widget.ts
	 */
	private getTaskStatus(
		task: Task,
	): "completed" | "inProgress" | "abandoned" | "notStarted" | "planned" {
		// If task is marked as completed in the task object
		if (task.completed) {
			return "completed";
		}

		const mark = task.status;
		if (!mark) {
			return "notStarted";
		}

		// Priority 1: If useOnlyCountMarks is enabled
		if (this.plugin?.settings.useOnlyCountMarks) {
			const onlyCountMarks =
				this.plugin?.settings.onlyCountTaskMarks?.split("|") || [];
			if (onlyCountMarks.includes(mark)) {
				return "completed";
			} else {
				// If using onlyCountMarks and the mark is not in the list,
				// determine which other status it belongs to
				return this.determineNonCompletedStatus(mark);
			}
		}

		// Priority 2: If the mark is in excludeTaskMarks
		if (
			this.plugin?.settings.excludeTaskMarks &&
			this.plugin.settings.excludeTaskMarks.includes(mark)
		) {
			// Excluded marks are considered not started
			return "notStarted";
		}

		// Priority 3: Check against specific task statuses
		return this.determineTaskStatus(mark);
	}

	/**
	 * Helper to determine the non-completed status of a task mark
	 */
	private determineNonCompletedStatus(
		mark: string,
	): "inProgress" | "abandoned" | "notStarted" | "planned" {
		const inProgressMarks =
			this.plugin?.settings.taskStatuses?.inProgress?.split("|") || [
				"/",
				"-",
			];

		if (inProgressMarks.includes(mark)) {
			return "inProgress";
		}

		const abandonedMarks =
			this.plugin?.settings.taskStatuses?.abandoned?.split("|") || [">"];
		if (abandonedMarks.includes(mark)) {
			return "abandoned";
		}

		const plannedMarks = this.plugin?.settings.taskStatuses?.planned?.split(
			"|",
		) || ["?"];
		if (plannedMarks.includes(mark)) {
			return "planned";
		}

		// If the mark doesn't match any specific category, use the countOtherStatusesAs setting
		return (
			(this.plugin?.settings.countOtherStatusesAs as
				| "inProgress"
				| "abandoned"
				| "notStarted"
				| "planned") || "notStarted"
		);
	}

	/**
	 * Helper to determine the specific task status
	 */
	private determineTaskStatus(
		mark: string,
	): "completed" | "inProgress" | "abandoned" | "notStarted" | "planned" {
		const completedMarks =
			this.plugin?.settings.taskStatuses?.completed?.split("|") || [
				"x",
				"X",
			];
		if (completedMarks.includes(mark)) {
			return "completed";
		}

		const inProgressMarks =
			this.plugin?.settings.taskStatuses?.inProgress?.split("|") || [
				"/",
				"-",
			];
		if (inProgressMarks.includes(mark)) {
			return "inProgress";
		}

		const abandonedMarks =
			this.plugin?.settings.taskStatuses?.abandoned?.split("|") || [">"];
		if (abandonedMarks.includes(mark)) {
			return "abandoned";
		}

		const plannedMarks = this.plugin?.settings.taskStatuses?.planned?.split(
			"|",
		) || ["?"];
		if (plannedMarks.includes(mark)) {
			return "planned";
		}

		// If not matching any specific status, check if it's a not-started mark
		const notStartedMarks =
			this.plugin?.settings.taskStatuses?.notStarted?.split("|") || [" "];
		if (notStartedMarks.includes(mark)) {
			return "notStarted";
		}

		// If we get here, the mark doesn't match any of our defined categories
		// Use the countOtherStatusesAs setting to determine how to count it
		return (
			(this.plugin?.settings.countOtherStatusesAs as
				| "completed"
				| "inProgress"
				| "abandoned"
				| "notStarted"
				| "planned") || "notStarted"
		);
	}

	private renderTaskList() {
		// Update the header
		let title = t("Tasks");
		if (this.selectedProjects.projects.length === 1) {
			title = this.selectedProjects.projects[0];
		} else if (this.selectedProjects.projects.length > 1) {
			title = `${this.selectedProjects.projects.length} ${t(
				"projects selected",
			)}`;
		}
		const countText = `${this.filteredTasks.length} ${t("tasks")}`;
		this.updateTaskListHeader(title, countText);

		// Use the renderer to display tasks or empty state
		this.taskRenderer.renderTasks(
			this.filteredTasks,
			this.isTreeView,
			this.allTasksMap,
			t("No tasks in the selected projects"),
		);
	}

	public updateTask(updatedTask: Task) {
		// Update in our main tasks list
		const taskIndex = this.allTasks.findIndex(
			(t) => t.id === updatedTask.id,
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
				(t) => t.id === updatedTask.id,
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
			".projects-tree-toggle-btn",
		) as HTMLElement;
		if (treeToggleBtn) {
			setIcon(
				treeToggleBtn,
				this.isProjectTreeView ? "git-branch" : "list",
			);
		}

		// Save preference to localStorage for now
		this.app.saveLocalStorage(
			"task-genius-project-tree-view",
			this.isProjectTreeView.toString(),
		);

		// Rebuild project index and re-render
		this.buildProjectsIndex();
		this.renderProjectsList();
		// Update tasks and tgProject info button based on current selection
		if (this.selectedProjects.projects.length > 0) {
			this.updateSelectedTasks();
		}
		const single =
			this.selectedProjects.projects.length === 1
				? this.selectedProjects.projects[0]
				: null;
		this.updateTgProjectPropsButton(single);
	}

	/** Create or update the tgProject info button in the right header */
	private updateTgProjectPropsButton(selectedProject: string | null): void {
		if (!this.headerTopRightRowEl) return;
		// No selection: remove button and popover
		if (!selectedProject) {
			if (this.projectPropsBtnEl) {
				this.projectPropsBtnEl.remove();
				this.projectPropsBtnEl = null;
			}
			this.teardownProjectPropsUI();
			return;
		}
		// Show info button only when there exists a task with a real tgProject AND
		// (no metadata.project) OR (metadata.project equals tgProject.name).
		{
			const separator = this.plugin.settings.projectPathSeparator || "/";
			const hasInfo = this.allTasks.some((task) => {
				const p = getEffectiveProject(task);
				const match =
					p === selectedProject ||
					(p && p.startsWith(selectedProject + separator));
				if (!match) return false;
				const tg = (task.metadata as any)?.tgProject as any;
				if (!tg || typeof tg !== "object") return false;
				const mp = task.metadata?.project;
				return (
					mp === undefined ||
					mp === null ||
					mp === "" ||
					mp === tg.name
				);
			});
			if (!hasInfo) {
				if (this.projectPropsBtnEl) {
					this.projectPropsBtnEl.remove();
					this.projectPropsBtnEl = null;
				}
				this.teardownProjectPropsUI();
				return;
			}
		}
		// Ensure button exists
		if (!this.projectPropsBtnEl) {
			const btn = this.headerTopRightRowEl.createDiv({
				cls: "projects-props-btn",
				attr: {
					"aria-label": t("Show project info") || "Project info",
				},
			});
			setIcon(btn, "info");
			this.projectPropsBtnEl = btn;
			this.registerDomEvent(btn, "click", async (e) => {
				e.stopPropagation();
				if (this.projectPropsPopoverEl) {
					this.teardownProjectPropsUI();
					return;
				}
				// Create popover using createEl from document.body
				this.projectPropsPopoverEl = document.body.createEl("div", {
					cls: "tg-project-popover",
					attr: {
						style: "background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 8px 10px; box-shadow: var(--shadow-s); max-width: 420px; z-index: 9999;",
					},
				});
				const list = this.projectPropsPopoverEl.createDiv({
					cls: "tg-project-props",
				});
				this.projectPropsPopper = createPopper(
					btn,
					this.projectPropsPopoverEl,
					{
						placement: "bottom-end",
						modifiers: [
							{ name: "offset", options: { offset: [0, 8] } },
						],
					},
				);
				// Render-token to prevent stale async updates
				const gen = ++this.infoRenderGen;

				// Close on outside click or ESC

				this.registerDomEvent(
					this.projectPropsPopoverEl,
					"mousedown",
					(ev) => ev.stopPropagation(),
				);

				this.outsideClickHandler = (ev: MouseEvent) => {
					const target = ev.target as Node;
					if (!this.projectPropsPopoverEl) return;
					if (this.projectPropsPopoverEl.contains(target)) return;
					if (
						this.projectPropsBtnEl &&
						this.projectPropsBtnEl.contains(target)
					)
						return;
					this.teardownProjectPropsUI();
				};
				this.registerDomEvent(
					document,
					"mousedown",
					this.outsideClickHandler,
					{ capture: true },
				);

				this.escKeyHandler = (ev: KeyboardEvent) => {
					if (ev.key === "Escape") {
						this.teardownProjectPropsUI();
					}
				};
				this.registerDomEvent(document, "keydown", this.escKeyHandler);

				// Resolve representative task and tgProject using current selection
				const currentSelected =
					this.selectedProjects.projects.length === 1
						? this.selectedProjects.projects[0]
						: null;
				if (!currentSelected) {
					list.textContent =
						t("No project selected") || "No project selected";
					return;
				}
				this.currentInfoProject = currentSelected;
				// Gather tasks in this project group
				const separator =
					this.plugin.settings.projectPathSeparator || "/";
				const tasksInProject = this.allTasks.filter((task) => {
					const p = getEffectiveProject(task);
					return (
						p === currentSelected ||
						(p && p.startsWith(currentSelected + separator))
					);
				});
				const candidates = tasksInProject.filter((t) => {
					const tg = (t.metadata as any)?.tgProject as any;
					if (!tg || typeof tg !== "object") return false;
					const mp = t.metadata?.project;
					return (
						mp === undefined ||
						mp === null ||
						mp === "" ||
						mp === tg.name
					);
				});
				const taskPrefMatch = candidates.find((t) => {
					const mp = t.metadata?.project;
					const tg = (t.metadata as any)?.tgProject as any;
					return mp && tg && mp === tg.name;
				});
				const taskForResolve: Task | undefined =
					taskPrefMatch || candidates[0];
				if (!taskForResolve) {
					list.textContent =
						t("No task found in selection") || "No task found";
					return;
				}
				list.textContent = t("Loading...") || "Loading...";

				let enhanced: Record<string, any> = {};
				let configSourcePath: string | undefined;
				try {
					const resolver = (this.plugin.dataflowOrchestrator as any)
						?.projectResolver;
					if (resolver?.get) {
						const pdata = await resolver.get(
							taskForResolve.filePath,
						);
						enhanced = pdata?.enhancedMetadata || {};
						configSourcePath = pdata?.configSource;
					} else {
						const repo =
							this.plugin.dataflowOrchestrator?.getRepository();
						const storage = (repo as any)?.getStorage?.();
						const rec = storage
							? await storage.loadProject(taskForResolve.filePath)
							: null;
						enhanced = rec?.data?.enhancedMetadata || {};
						configSourcePath = rec?.data?.configSource;
					}
				} catch (err) {
					console.warn(
						"[Projects] Failed to load project metadata:",
						err,
					);
				}

				// Stale-guard: if a newer render started, abort
				if (gen !== this.infoRenderGen) {
					return;
				}

				// Choose tg strictly from the selected candidate (must exist by button rule)
				const tg =
					((taskForResolve?.metadata as any)?.tgProject as any) ||
					undefined;
				if (!tg) {
					this.teardownProjectPropsUI();
					return;
				}
				const entries: Array<[string, any]> = [];
				let fmKeys: Set<string> = new Set();
				const projectName =
					taskForResolve?.metadata?.project ??
					(tg as any).name ??
					currentSelected;
				entries.push(["project", projectName]);
				entries.push(["type", (tg as any).type]);
				if ((tg as any).source)
					entries.push(["source", (tg as any).source]);
				if ((tg as any).readonly !== undefined)
					entries.push(["readonly", (tg as any).readonly]);

				// If tgProject exists (incl. type=config), load its source file frontmatter and display
				if (tg) {
					if (configSourcePath) {
						entries.push(["configSource", configSourcePath]);
					}
					const metaPath =
						tg && (tg as any).type === "config" && configSourcePath
							? configSourcePath
							: taskForResolve.filePath;
					try {
						const abs =
							this.app.vault.getAbstractFileByPath(metaPath);
						if (abs && (abs as any).extension) {
							const file = abs as any; // TFile
							const fm =
								this.app.metadataCache.getFileCache(
									file,
								)?.frontmatter;
							if (fm && typeof fm === "object") {
								// record fm keys for de-duplication
								fmKeys = new Set(
									Object.keys(fm).filter((k) => {
										const kl = k.toLowerCase();
										return (
											kl !== "position" &&
											kl !== "projectname" &&
											kl !== "project"
										);
									}),
								);
								entries.push(["—", "—"]);
								entries.push(["sourceFile", metaPath]);
								for (const [k, v] of Object.entries(fm)) {
									if (k === "position") continue;
									const kl = k.toLowerCase();
									if (
										kl === "projectname" ||
										kl === "project"
									)
										continue;
									entries.push([`frontmatter.${k}`, v]);
								}
							}
						}
					} catch (e) {
						console.warn(
							"[Projects] Failed to read source frontmatter:",
							e,
						);
					}
				}

				// Build details from enhanced first, fallback to task metadata
				const sourceObj: Record<string, any> =
					Object.keys(enhanced).length > 0
						? enhanced
						: taskForResolve.metadata || {};
				const blacklist = new Set([
					"tgProject",
					"project",
					"children",
					"childrenIds",
					"parent",
					"parentId",
					"listMarker",
					"indentLevel",
					"actualIndent",
					"originalMarkdown",
					"line",
					"comment",
					"heading",
					"_subtaskInheritanceRules",
					"metadata",
				]);
				for (const [k, vRaw] of Object.entries(sourceObj)) {
					if (blacklist.has(k)) continue;
					if (vRaw === undefined || vRaw === null || vRaw === "")
						continue;
					// avoid duplicates: if key already comes from frontmatter, skip plain key
					if (fmKeys && fmKeys.has(k)) continue;
					let v: any = vRaw;
					// Format arrays/objects
					if (Array.isArray(v)) {
						if (v.length === 0) continue;
						if (k === "tags" || k === "dependsOn") {
							v = v.join(", ");
						} else {
							// Skip noisy arrays by default
							continue;
						}
					} else if (typeof v === "object") {
						// Skip nested objects by default to avoid noise
						continue;
					}
					// Format known date-like fields
					const kl = k.toLowerCase();
					if (
						(/date$/i.test(k) || kl.endsWith("date")) &&
						typeof v !== "string"
					) {
						const n = Number(v);
						if (!Number.isNaN(n) && n > 1e10) {
							try {
								v = new Date(n).toLocaleString();
							} catch {}
						}
					}
					entries.push([k, v]);
				}

				// Render entries
				list.empty();
				entries.forEach(([k, v]) => {
					const row = list.createDiv({
						attr: {
							style: "display:flex; gap:8px; align-items:center; padding:2px 0",
						},
					});
					const keyEl = row.createDiv({
						attr: {
							style: "opacity:0.7; min-width:120px;",
						},
					});
					keyEl.setText(String(k));
					const valEl = row.createDiv();
					valEl.setText(
						typeof v === "string" ? v : JSON.stringify(v),
					);
				});
			});
		}

		// If popover is open and selection changed, refresh content
		if (this.projectPropsPopoverEl && selectedProject) {
			if (this.currentInfoProject !== selectedProject) {
				this.currentInfoProject = selectedProject;
				// Recreate the popover to reflect new selection
				this.teardownProjectPropsUI();
				this.projectPropsBtnEl?.click();
			}
		}
	}

	/** Close and cleanup the popover */
	private teardownProjectPropsUI(): void {
		// Clear handler references (events are auto-cleaned by registerDomEvent)
		this.outsideClickHandler = undefined;
		this.escKeyHandler = undefined;

		// Destroy popper and remove popover
		if (
			this.projectPropsPopper &&
			typeof this.projectPropsPopper.destroy === "function"
		) {
			this.projectPropsPopper.destroy();
		}
		this.projectPropsPopper = null;
		if (this.projectPropsPopoverEl) {
			this.projectPropsPopoverEl.remove();
		}
		this.projectPropsPopoverEl = null;
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
