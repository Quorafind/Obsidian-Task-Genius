import { App, Component, setIcon } from "obsidian";
import { Task, TaskFilter } from "../../utils/types/TaskIndex";
import { TaskListItemComponent } from "./listItem";
import { ViewMode } from "./sidebar";
import { tasksToTree, flattenTaskTree } from "../../utils/treeViewUtil";
import { TaskTreeItemComponent } from "./treeItem";

export class ContentComponent extends Component {
	public containerEl: HTMLElement;
	private headerEl: HTMLElement;
	private taskListEl: HTMLElement;
	private filterInput: HTMLInputElement;
	private titleEl: HTMLElement;
	private countEl: HTMLElement;
	private focusBtn: HTMLElement;

	// Task data
	private allTasks: Task[] = [];
	private filteredTasks: Task[] = [];
	private taskComponents: TaskListItemComponent[] = [];
	private selectedTask: Task | null = null;

	// Virtualization
	private taskListObserver: IntersectionObserver;
	private visibleTasks: Map<string, boolean> = new Map();
	private taskPageSize = 50;
	private currentViewMode: ViewMode = "forecast";
	private selectedProject: string | null = null;
	private focusFilter: string | null = null;
	private isTreeView: boolean = false;
	private treeComponents: TaskTreeItemComponent[] = [];

	// Events
	public onTaskSelected: (task: Task) => void;
	public onTaskCompleted: (task: Task) => void;

	constructor(private parentEl: HTMLElement, private app: App) {
		super();
	}

	onload() {
		// Create main content container
		this.containerEl = this.parentEl.createDiv({
			cls: "task-content",
		});

		// Create header
		this.createContentHeader();

		// Create task list container
		this.taskListEl = this.containerEl.createDiv({ cls: "task-list" });

		// Set up intersection observer for lazy loading
		this.initializeVirtualList();
	}

	private createContentHeader() {
		this.headerEl = this.containerEl.createDiv({
			cls: "content-header",
		});

		// View title
		this.titleEl = this.headerEl.createDiv({ cls: "content-title" });
		this.titleEl.setText("Forecast");

		// Task count
		this.countEl = this.headerEl.createDiv({ cls: "task-count" });
		this.countEl.setText("0 tasks");

		// Filter controls
		const filterEl = this.headerEl.createDiv({ cls: "content-filter" });

		// Filter input
		this.filterInput = filterEl.createEl("input", {
			cls: "filter-input",
			attr: {
				type: "text",
				placeholder: "Filter tasks...",
			},
		});

		// View toggle button
		const viewToggleBtn = this.headerEl.createDiv({
			cls: "view-toggle-btn",
		});
		setIcon(viewToggleBtn, "list");
		viewToggleBtn.setAttribute("aria-label", "Toggle list/tree view");

		this.registerDomEvent(viewToggleBtn, "click", () => {
			this.toggleViewMode();
		});

		// Focus filter button
		// const focusEl = this.headerEl.createDiv({ cls: "focus-filter" });
		// this.focusBtn = focusEl.createEl("button", { cls: "focus-button" });
		// this.focusBtn.setText("Focus");

		// // Event listeners
		// this.registerDomEvent(this.focusBtn, "click", () => {
		// 	this.toggleFocusFilter();
		// });

		this.registerDomEvent(this.filterInput, "input", () => {
			this.filterTasks(this.filterInput.value);
		});
	}

	private initializeVirtualList() {
		// Set up intersection observer for lazy loading
		this.taskListObserver = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					const taskId = entry.target.getAttribute("data-task-id");
					if (taskId) {
						this.visibleTasks.set(taskId, entry.isIntersecting);

						// Load more tasks if we're near the bottom
						if (
							entry.isIntersecting &&
							entry.target.classList.contains("task-load-marker")
						) {
							this.loadMoreTasks();
						}
					}
				});
			},
			{
				root: this.taskListEl,
				threshold: 0.1,
			}
		);
	}

	// private toggleFocusFilter() {
	// 	// Toggle focus state
	// 	if (this.focusFilter) {
	// 		this.focusFilter = null;
	// 		this.focusBtn.setText("Focus");
	// 		this.focusBtn.classList.remove("focused");
	// 	} else {
	// 		// Just an example - you could focus on a specific project or context
	// 		this.focusFilter = "Work";
	// 		this.focusBtn.setText("Unfocus");
	// 		this.focusBtn.classList.add("focused");
	// 	}

	// 	this.applyFilters();
	// 	this.refreshTaskList();
	// }

	private toggleViewMode() {
		this.isTreeView = !this.isTreeView;

		// Update toggle button icon
		const viewToggleBtn = this.headerEl.querySelector(
			".view-toggle-btn"
		) as HTMLElement;
		if (viewToggleBtn) {
			setIcon(viewToggleBtn, this.isTreeView ? "git-branch" : "list");
		}

		// Refresh the task list with the new view mode
		this.refreshTaskList();
	}

	public setTasks(tasks: Task[]) {
		this.allTasks = tasks;
		this.applyFilters();
		this.refreshTaskList();
	}

	public setViewMode(mode: ViewMode, project?: string | null) {
		this.currentViewMode = mode;
		if (project !== undefined) {
			this.selectedProject = project;
		}

		// Update title
		let title = mode.charAt(0).toUpperCase() + mode.slice(1);
		if (mode === "projects" && this.selectedProject) {
			const projectName = this.selectedProject.split("/").pop();
			if (projectName) {
				title = projectName;
			}
		}
		this.titleEl.setText(title);

		this.applyFilters();
		this.refreshTaskList();
	}

	private applyFilters() {
		// Start with all tasks
		let filtered = [...this.allTasks];

		// Apply view mode filter
		switch (this.currentViewMode) {
			case "inbox":
				// Tasks without a project
				filtered = filtered.filter((task) => !task.project);
				break;
			case "forecast":
				// Tasks due today or overdue
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				const todayTimestamp = today.getTime();

				filtered = filtered.filter((task) => {
					if (!task.completed && task.dueDate) {
						return task.dueDate <= todayTimestamp;
					}
					return false;
				});
				break;
			case "flagged":
				// Flagged or high priority tasks
				filtered = filtered.filter(
					(task) =>
						!task.completed &&
						(task.priority === 3 || task.tags.includes("flagged"))
				);
				break;
			case "projects":
				// If a project is selected, show its tasks
				if (this.selectedProject) {
					filtered = filtered.filter(
						(task) => task.project === this.selectedProject
					);
				} else {
					// Otherwise show all tasks with projects
					filtered = filtered.filter((task) => !!task.project);
				}
				break;
			case "review":
				// Tasks that need review (example: tasks without updates in the last week)
				const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
				filtered = filtered.filter(
					(task) =>
						!task.completed &&
						task.createdDate &&
						task.createdDate < weekAgo
				);
				break;
		}

		// Apply focus filter if set
		if (this.focusFilter) {
			const focusFilterLower = this.focusFilter.toLowerCase();
			filtered = filtered.filter(
				(task) =>
					task.context === this.focusFilter ||
					(task.tags && task.tags.includes(focusFilterLower))
			);
		}

		// Apply text filter if there's input in the filter field
		const textFilter = this.filterInput.value;
		if (textFilter) {
			const query = textFilter.toLowerCase();
			filtered = filtered.filter(
				(task) =>
					task.content.toLowerCase().includes(query) ||
					(task.project &&
						task.project.toLowerCase().includes(query)) ||
					(task.context &&
						task.context.toLowerCase().includes(query)) ||
					(task.tags &&
						task.tags.some((tag) =>
							tag.toLowerCase().includes(query)
						))
			);
		}

		// Sort tasks
		filtered.sort((a, b) => {
			// First by completion status
			if (a.completed !== b.completed) {
				return a.completed ? 1 : -1;
			}

			// Then by due date (if available)
			if (a.dueDate && b.dueDate) {
				return a.dueDate - b.dueDate;
			} else if (a.dueDate) {
				return -1;
			} else if (b.dueDate) {
				return 1;
			}

			// Then by priority (higher priority first)
			if (a.priority && b.priority) {
				return b.priority - a.priority;
			} else if (a.priority) {
				return -1;
			} else if (b.priority) {
				return 1;
			}

			// Finally by name
			return a.content.localeCompare(b.content);
		});

		this.filteredTasks = filtered;

		// Update the task count
		this.countEl.setText(`${this.filteredTasks.length} tasks`);
	}

	private filterTasks(query: string) {
		this.applyFilters();
		this.refreshTaskList();
	}

	private refreshTaskList() {
		// Clear existing tasks
		this.taskListEl.empty();
		this.visibleTasks.clear();

		// Clean up old task components
		this.taskComponents.forEach((component) => {
			component.unload();
		});
		this.taskComponents = [];

		// Clean up old tree components
		this.treeComponents.forEach((component) => {
			component.unload();
		});
		this.treeComponents = [];

		// Render based on view mode
		if (this.isTreeView) {
			this.renderTreeView();
		} else {
			// Load first batch of tasks in list view
			this.loadTaskBatch(0, this.taskPageSize);

			// Add a load marker at the end if there are more tasks
			if (this.filteredTasks.length > this.taskPageSize) {
				const loadMarker = this.taskListEl.createDiv({
					cls: "task-item task-load-marker",
					attr: { "data-task-id": "load-marker" },
				});

				this.taskListObserver.observe(loadMarker);
			}
		}
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
				this.currentViewMode,
				this.app,
				0,
				childTasks
			);

			// Set up event handlers
			treeComponent.onTaskSelected = (selectedTask) => {
				this.selectTask(selectedTask);
				if (this.onTaskSelected) {
					this.onTaskSelected(selectedTask);
				}
			};

			treeComponent.onTaskCompleted = (task) => {
				console.log("task completed", task);
				if (this.onTaskCompleted) {
					this.onTaskCompleted(task);
				}
			};

			// Load component
			this.addChild(treeComponent);
			treeComponent.load();

			// Add to DOM
			this.taskListEl.appendChild(treeComponent.element);

			// Store for later cleanup
			this.treeComponents.push(treeComponent);
		});

		// Add empty state if no tasks
		if (rootTasks.length === 0) {
			const emptyEl = this.taskListEl.createDiv({
				cls: "task-empty-state",
			});
			emptyEl.setText("No tasks found");
		}
	}

	private loadTaskBatch(start: number, count: number) {
		const end = Math.min(start + count, this.filteredTasks.length);
		const fragment = document.createDocumentFragment();

		for (let i = start; i < end; i++) {
			const task = this.filteredTasks[i];
			const taskComponent = new TaskListItemComponent(
				task,
				this.currentViewMode,
				this.app
			);

			// Set up event handlers
			taskComponent.onTaskSelected = (selectedTask) => {
				this.selectTask(selectedTask);
				if (this.onTaskSelected) {
					this.onTaskSelected(selectedTask);
				}
			};

			taskComponent.onTaskCompleted = (task) => {
				console.log("task completed", task);
				if (this.onTaskCompleted) {
					this.onTaskCompleted(task);
				}
			};

			// Load the component
			this.addChild(taskComponent);
			taskComponent.load();

			// Store for later cleanup
			this.taskComponents.push(taskComponent);

			// Add to DOM
			fragment.appendChild(taskComponent.element);

			// Observe this task for visibility
			this.taskListObserver.observe(taskComponent.element);
		}

		this.taskListEl.appendChild(fragment);

		return end;
	}

	private loadMoreTasks() {
		const currentCount = this.taskComponents.length;

		if (currentCount < this.filteredTasks.length) {
			// Remove current load marker
			const oldMarker =
				this.taskListEl.querySelector(".task-load-marker");
			if (oldMarker) {
				this.taskListObserver.unobserve(oldMarker);
				oldMarker.remove();
			}

			// Load next batch
			const newEnd = this.loadTaskBatch(currentCount, this.taskPageSize);

			// Add new load marker if there are more tasks
			if (newEnd < this.filteredTasks.length) {
				const loadMarker = this.taskListEl.createDiv({
					cls: "task-item task-load-marker",
					attr: { "data-task-id": "load-marker" },
				});

				this.taskListObserver.observe(loadMarker);
			}
		}
	}

	private selectTask(task: Task) {
		if (!task) return;

		// Set as the selected task
		this.selectedTask = task;

		// Update UI to show this task is selected
		this.taskComponents.forEach((component) => {
			component.setSelected(component.getTask().id === task.id);
		});
	}

	public updateTask(updatedTask: Task) {
		// Find and update the task component
		const component = this.taskComponents.find(
			(c) => c.getTask().id === updatedTask.id
		);

		if (component) {
			component.updateTask(updatedTask);
		}

		// Also update in our data arrays
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

		// If this is the selected task, update selection
		if (this.selectedTask && this.selectedTask.id === updatedTask.id) {
			this.selectedTask = updatedTask;
		}
	}

	public getSelectedTask(): Task | null {
		return this.selectedTask;
	}

	onunload() {
		// Clean up observer
		if (this.taskListObserver) {
			this.taskListObserver.disconnect();
		}

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
