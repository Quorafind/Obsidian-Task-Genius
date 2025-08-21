import { App, Component, setIcon } from "obsidian";
import { Task } from "../../types/task";
import { TaskListItemComponent } from "./listItem"; // Re-import needed components
import {
	ViewMode,
	getViewSettingOrDefault,
	SortCriterion,
} from "../../common/setting-definition"; // 导入 SortCriterion
import { tasksToTree } from "../../utils/ui/tree-view-utils"; // Re-import needed utils
import { TaskTreeItemComponent } from "./treeItem"; // Re-import needed components
import { t } from "../../translations/helper";
import TaskProgressBarPlugin from "../../index";
import { getInitialViewMode, saveViewMode } from "../../utils/ui/view-mode-utils";

// @ts-ignore
import { filterTasks } from "../../utils/task/task-filter-utils";
import { sortTasks } from "../../commands/sortTaskCommands"; // 导入 sortTasks 函数

interface ContentComponentParams {
	onTaskSelected?: (task: Task | null) => void;
	onTaskCompleted?: (task: Task) => void;
	onTaskUpdate?: (originalTask: Task, updatedTask: Task) => Promise<void>;
	onTaskContextMenu?: (event: MouseEvent, task: Task) => void;
}

export class ContentComponent extends Component {
	public containerEl: HTMLElement;
	private headerEl: HTMLElement;
	private taskListEl: HTMLElement; // Container for rendering
	private filterInput: HTMLInputElement;
	private titleEl: HTMLElement;
	private countEl: HTMLElement;

	// Task data
	private allTasks: Task[] = [];
	private notFilteredTasks: Task[] = [];
	private filteredTasks: Task[] = []; // Tasks after filters applied
	private selectedTask: Task | null = null;

	// Child Components (managed by InboxComponent for lazy loading)
	private taskComponents: TaskListItemComponent[] = [];
	private treeComponents: TaskTreeItemComponent[] = [];

	// Virtualization State
	private taskListObserver: IntersectionObserver;
	private taskPageSize = 50; // Number of tasks to load per batch
	private nextTaskIndex = 0; // Index for next list item batch
	private nextRootTaskIndex = 0; // Index for next tree root batch
	private rootTasks: Task[] = []; // Root tasks for tree view

	// State
	private currentViewId: ViewMode = "inbox"; // Renamed from currentViewMode
	private selectedProjectForView: string | null = null; // Keep track if a specific project is filtered (for project view)
	private focusFilter: string | null = null; // Keep focus filter if needed
	private isTreeView: boolean = false;
	private isRendering: boolean = false; // Guard against concurrent renders
	private pendingForceRefresh: boolean = false; // Track if a force refresh is pending

	constructor(
		private parentEl: HTMLElement,
		private app: App,
		private plugin: TaskProgressBarPlugin,
		private params: ContentComponentParams = {}
	) {
		super();
	}

	onload() {
		// Create main content container
		this.containerEl = this.parentEl.createDiv({ cls: "task-content" });

		// Create header
		this.createContentHeader();

		// Create task list container
		this.taskListEl = this.containerEl.createDiv({ cls: "task-list" });

		// Initialize view mode from saved state or global default
		this.initializeViewMode();

		// Set up intersection observer for lazy loading
		this.initializeVirtualList();
	}

	private createContentHeader() {
		this.headerEl = this.containerEl.createDiv({ cls: "content-header" });

		// View title - will be updated in setViewMode
		this.titleEl = this.headerEl.createDiv({
			cls: "content-title",
			text: t("Inbox"), // Default title
		});

		// Task count
		this.countEl = this.headerEl.createDiv({
			cls: "task-count",
			text: t("0 tasks"),
		});

		// Filter controls
		const filterEl = this.headerEl.createDiv({ cls: "content-filter" });
		this.filterInput = filterEl.createEl("input", {
			cls: "filter-input",
			attr: { type: "text", placeholder: t("Filter tasks...") },
		});

		// View toggle button
		const viewToggleBtn = this.headerEl.createDiv({
			cls: "view-toggle-btn",
		});
		setIcon(viewToggleBtn, "list"); // Set initial icon
		viewToggleBtn.setAttribute("aria-label", t("Toggle list/tree view"));
		this.registerDomEvent(viewToggleBtn, "click", () => {
			this.toggleViewMode();
		});

		// Focus filter button (remains commented out)
		// ...

		// Event listeners
		this.registerDomEvent(this.filterInput, "input", () => {
			this.filterTasks(this.filterInput.value);
		});
	}

	private initializeVirtualList() {
		this.taskListObserver = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (
						entry.isIntersecting &&
						entry.target.classList.contains("task-load-marker")
					) {
						// console.log(
						// 	"Load marker intersecting, calling loadMoreTasks..."
						// );
						// Target is the load marker, load more tasks
						this.loadMoreTasks();
					}
				});
			},
			{
				root: this.taskListEl, // Observe within the task list container
				threshold: 0.1, // Trigger when 10% of the marker is visible
			}
		);
	}

	/**
	 * Initialize view mode from saved state or global default
	 */
	private initializeViewMode() {
		this.isTreeView = getInitialViewMode(
			this.app,
			this.plugin,
			this.currentViewId
		);
		// Update the toggle button icon to match the initial state
		const viewToggleBtn = this.headerEl?.querySelector(
			".view-toggle-btn"
		) as HTMLElement;
		if (viewToggleBtn) {
			setIcon(viewToggleBtn, this.isTreeView ? "git-branch" : "list");
		}
	}

	private toggleViewMode() {
		this.isTreeView = !this.isTreeView;
		const viewToggleBtn = this.headerEl.querySelector(
			".view-toggle-btn"
		) as HTMLElement;
		if (viewToggleBtn) {
			setIcon(viewToggleBtn, this.isTreeView ? "git-branch" : "list");
		}
		// Save the new view mode state
		saveViewMode(this.app, this.currentViewId, this.isTreeView);
		this.refreshTaskList(); // Refresh list completely on view mode change
	}

	public setTasks(tasks: Task[], notFilteredTasks: Task[], forceRefresh: boolean = false) {
		// Allow forced refresh for cases where we know the data has changed
		if (forceRefresh) {
			console.log("ContentComponent: Forced refresh requested");
			// Cancel any ongoing rendering if force refresh is requested
			this.isRendering = false;
			this.pendingForceRefresh = true;
			this.allTasks = tasks;
			this.notFilteredTasks = notFilteredTasks;
			this.applyFilters();
			this.refreshTaskList();
			return;
		}

		// If a force refresh is pending, skip non-forced updates
		if (this.pendingForceRefresh) {
			console.log("ContentComponent: Skipping non-forced update, force refresh is pending");
			return;
		}

		// Prevent unnecessary refreshes if data hasn't actually changed
		// Check if the array reference has changed (which indicates an update)
		if (this.allTasks === tasks && 
			this.notFilteredTasks === notFilteredTasks) {
			console.log("ContentComponent: Same array references, skipping refresh");
			return;
		}

		// Additional check for actual content changes
		if (this.allTasks.length === tasks.length &&
			this.notFilteredTasks.length === notFilteredTasks.length &&
			tasks.length > 0) {
			// Quick check - if same length and not empty, check if first few tasks are identical
			const sampleSize = Math.min(5, tasks.length);
			let unchanged = true;
			for (let i = 0; i < sampleSize; i++) {
				if (this.allTasks[i]?.id !== tasks[i]?.id ||
					this.allTasks[i]?.originalMarkdown !== tasks[i]?.originalMarkdown) {
					unchanged = false;
					break;
				}
			}
			if (unchanged) {
				console.log("ContentComponent: Tasks unchanged, skipping refresh");
				return;
			}
		}

		this.allTasks = tasks;
		this.notFilteredTasks = notFilteredTasks;
		this.applyFilters();
		this.refreshTaskList();
	}

	// Updated method signature
	public setViewMode(viewId: ViewMode, project?: string | null) {
		this.currentViewId = viewId;
		this.selectedProjectForView = project === undefined ? null : project;

		// Update title based on the view config
		const viewConfig = getViewSettingOrDefault(this.plugin, viewId);
		let title = t(viewConfig.name);

		// Special handling for project view title (if needed, maybe handled by component itself)
		// if (viewId === "projects" && this.selectedProjectForView) {
		// 	const projectName = this.selectedProjectForView.split("/").pop();
		// 	title = projectName || t("Project");
		// }
		this.titleEl.setText(title);

		// Re-initialize view mode for the new view
		this.initializeViewMode();

		this.applyFilters();
		this.refreshTaskList();
	}

	private applyFilters() {
		// Call the centralized filter utility
		this.filteredTasks = filterTasks(
			this.allTasks,
			this.currentViewId,
			this.plugin,
			{ textQuery: this.filterInput?.value } // Pass text query from input
		);

		const sortCriteria = this.plugin.settings.viewConfiguration.find(
			(view) => view.id === this.currentViewId
		)?.sortCriteria;
		if (sortCriteria && sortCriteria.length > 0) {
			this.filteredTasks = sortTasks(
				this.filteredTasks,
				sortCriteria,
				this.plugin.settings
			);
		} else {
			// Default sorting: completed tasks last, then by priority, due date, and content
			this.filteredTasks.sort((a, b) => {
				const completedA = a.completed;
				const completedB = b.completed;
				if (completedA !== completedB) return completedA ? 1 : -1;

				// Access priority from metadata
				const prioA = a.metadata.priority ?? 0;
				const prioB = b.metadata.priority ?? 0;
				if (prioA !== prioB) return prioB - prioA;

				// Access due date from metadata
				const dueA = a.metadata.dueDate ?? Infinity;
				const dueB = b.metadata.dueDate ?? Infinity;
				if (dueA !== dueB) return dueA - dueB;

				return a.content.localeCompare(b.content);
			});
		}

		// Update the task count display
		this.countEl.setText(`${this.filteredTasks.length} ${t("tasks")}`);
	}

	private filterTasks(query: string) {
		this.applyFilters(); // Re-apply all filters including the new text query
		this.refreshTaskList();
	}

	private cleanupComponents() {
		// Unload and clear previous components
		this.taskComponents.forEach((component) => this.removeChild(component));
		this.taskComponents = [];
		this.treeComponents.forEach((component) => this.removeChild(component));
		this.treeComponents = [];
		// Disconnect observer from any previous elements
		this.taskListObserver.disconnect();
		// Clear the container
		this.taskListEl.empty();
	}

	private refreshTaskList() {
		// Allow force refresh to override concurrent rendering
		if (this.pendingForceRefresh) {
			console.log("ContentComponent: Processing pending force refresh");
			this.isRendering = false; // Cancel any ongoing render
		}
		
		// Prevent concurrent renders (unless force refresh)
		if (this.isRendering) {
			console.log("ContentComponent: Already rendering, skipping refresh");
			return;
		}
		
		this.isRendering = true;
		
		try {
			this.cleanupComponents(); // Clear previous state and components

			// Reset indices for lazy loading
			this.nextTaskIndex = 0;
			this.nextRootTaskIndex = 0;
			this.rootTasks = [];

			if (this.filteredTasks.length === 0) {
				this.addEmptyState(t("No tasks found."));
				return;
			}

			// Render based on view mode
			if (this.isTreeView) {
				const taskMap = new Map<string, Task>();
				// Add all non-filtered tasks to the taskMap
				this.notFilteredTasks.forEach((task) => taskMap.set(task.id, task));
				this.rootTasks = tasksToTree(this.filteredTasks); // Calculate root tasks
				this.loadRootTaskBatch(taskMap); // Load the first batch
			} else {
				this.loadTaskBatch(); // Load the first batch
			}

			// Add load marker if necessary
			this.checkAndAddLoadMarker();
		} finally {
			// Reset rendering flag after completion
			setTimeout(() => {
				this.isRendering = false;
				this.pendingForceRefresh = false; // Reset force refresh flag
			}, 50); // Small delay to prevent immediate re-entry
		}
	}

	private loadTaskBatch(): number {
		const fragment = document.createDocumentFragment();
		const countToLoad = this.taskPageSize;
		const start = this.nextTaskIndex;
		const end = Math.min(start + countToLoad, this.filteredTasks.length);

		// console.log(`Loading list tasks from ${start} to ${end}`);

		for (let i = start; i < end; i++) {
			const task = this.filteredTasks[i];
			const taskComponent = new TaskListItemComponent(
				task,
				this.currentViewId, // Pass currentViewId
				this.app,
				this.plugin
			);

			// Attach event handlers
			taskComponent.onTaskSelected = this.selectTask.bind(this);
			taskComponent.onTaskCompleted = (t) => {
				if (this.params.onTaskCompleted) this.params.onTaskCompleted(t);
			};
			taskComponent.onTaskUpdate = async (originalTask, updatedTask) => {
				if (this.params.onTaskUpdate) {
					console.log(
						"ContentComponent onTaskUpdate",
						originalTask.content,
						updatedTask.content
					);
					await this.params.onTaskUpdate(originalTask, updatedTask);
				}
			};
			taskComponent.onTaskContextMenu = (e, t) => {
				if (this.params.onTaskContextMenu)
					this.params.onTaskContextMenu(e, t);
			};

			this.addChild(taskComponent); // Manage lifecycle
			taskComponent.load();
			fragment.appendChild(taskComponent.element);
			this.taskComponents.push(taskComponent); // Keep track of rendered components
		}

		this.taskListEl.appendChild(fragment);
		this.nextTaskIndex = end; // Update index for the next batch
		return end; // Return the new end index
	}

	private loadRootTaskBatch(taskMap: Map<string, Task>): number {
		const fragment = document.createDocumentFragment();
		const countToLoad = this.taskPageSize;
		const start = this.nextRootTaskIndex;
		const end = Math.min(start + countToLoad, this.rootTasks.length);

		// Make sure all non-filtered tasks are in the taskMap
		this.notFilteredTasks.forEach((task) => {
			if (!taskMap.has(task.id)) {
				taskMap.set(task.id, task);
			}
		});

		for (let i = start; i < end; i++) {
			const rootTask = this.rootTasks[i];
			const childTasks = this.notFilteredTasks.filter(
				(task) => task.metadata.parent === rootTask.id
			);

			const treeComponent = new TaskTreeItemComponent(
				rootTask,
				this.currentViewId, // Pass currentViewId
				this.app,
				0,
				childTasks,
				taskMap,
				this.plugin
			);

			// Attach event handlers
			treeComponent.onTaskSelected = this.selectTask.bind(this);
			treeComponent.onTaskCompleted = (t) => {
				if (this.params.onTaskCompleted) this.params.onTaskCompleted(t);
			};
			treeComponent.onTaskUpdate = async (originalTask, updatedTask) => {
				if (this.params.onTaskUpdate) {
					await this.params.onTaskUpdate(originalTask, updatedTask);
				}
			};
			treeComponent.onTaskContextMenu = (e, t) => {
				if (this.params.onTaskContextMenu)
					this.params.onTaskContextMenu(e, t);
			};

			this.addChild(treeComponent); // Manage lifecycle
			treeComponent.load();
			fragment.appendChild(treeComponent.element);
			this.treeComponents.push(treeComponent); // Keep track of rendered components
		}

		this.taskListEl.appendChild(fragment);
		this.nextRootTaskIndex = end; // Update index for the next batch
		return end; // Return the new end index
	}

	private checkAndAddLoadMarker() {
		this.removeLoadMarker(); // Remove existing marker first

		const moreTasksExist = this.isTreeView
			? this.nextRootTaskIndex < this.rootTasks.length
			: this.nextTaskIndex < this.filteredTasks.length;

		// console.log(
		// 	`Check load marker: moreTasksExist = ${moreTasksExist} (Tree: ${this.nextRootTaskIndex}/${this.rootTasks.length}, List: ${this.nextTaskIndex}/${this.filteredTasks.length})`
		// );

		if (moreTasksExist) {
			this.addLoadMarker();
		}
	}

	private addLoadMarker() {
		const loadMarker = this.taskListEl.createDiv({
			cls: "task-load-marker",
			attr: { "data-task-id": "load-marker" }, // Use data attribute for identification
		});
		loadMarker.setText(t("Loading more..."));
		// console.log("Adding load marker and observing.");
		this.taskListObserver.observe(loadMarker); // Observe the marker
	}

	private removeLoadMarker() {
		const oldMarker = this.taskListEl.querySelector(".task-load-marker");
		if (oldMarker) {
			this.taskListObserver.unobserve(oldMarker); // Stop observing before removing
			oldMarker.remove();
		}
	}

	private loadMoreTasks() {
		// console.log("Load more tasks triggered...");
		this.removeLoadMarker(); // Remove the current marker

		if (this.isTreeView) {
			if (this.nextRootTaskIndex < this.rootTasks.length) {
				// console.log(
				// 	`Loading more TREE tasks from index ${this.nextRootTaskIndex}`
				// );
				const taskMap = new Map<string, Task>();
				this.filteredTasks.forEach((task) =>
					taskMap.set(task.id, task)
				);
				this.loadRootTaskBatch(taskMap);
			} else {
				// console.log("No more TREE tasks to load.");
			}
		} else {
			if (this.nextTaskIndex < this.filteredTasks.length) {
				// console.log(
				// 	`Loading more LIST tasks from index ${this.nextTaskIndex}`
				// );
				this.loadTaskBatch();
			} else {
				// console.log("No more LIST tasks to load.");
			}
		}

		// Add the marker back if there are still more tasks after loading the batch
		this.checkAndAddLoadMarker();
	}

	private addEmptyState(message: string) {
		this.cleanupComponents(); // Ensure list is clean
		const emptyEl = this.taskListEl.createDiv({ cls: "task-empty-state" });
		emptyEl.setText(message);
	}

	private selectTask(task: Task | null) {
		if (this.selectedTask?.id === task?.id && task !== null) {
			// If clicking the already selected task, deselect it (or toggle details - handled by TaskView)
			// this.selectedTask = null;
			// console.log("Task deselected (in ContentComponent):", task?.id);
			// // Update visual state of the item if needed (remove highlight)
			// const itemEl = this.taskListEl.querySelector(`[data-task-row-id="${task.id}"]`);
			// itemEl?.removeClass('is-selected'); // Example class
			// if(this.onTaskSelected) this.onTaskSelected(null); // Notify parent
			// return;
		}

		// Deselect previous task visually if needed
		if (this.selectedTask) {
			// const prevItemEl = this.taskListEl.querySelector(`[data-task-row-id="${this.selectedTask.id}"]`);
			// prevItemEl?.removeClass('is-selected');
		}

		this.selectedTask = task;
		// console.log("Task selected (in ContentComponent):", task?.id);

		// Select new task visually if needed
		if (task) {
			// const newItemEl = this.taskListEl.querySelector(`[data-task-row-id="${task.id}"]`);
			// newItemEl?.addClass('is-selected');
		}

		if (this.params.onTaskSelected) {
			this.params.onTaskSelected(task);
		}
	}

	public updateTask(updatedTask: Task) {
		// Update the task in the main data source
		const taskIndexAll = this.allTasks.findIndex(
			(t) => t.id === updatedTask.id
		);
		if (taskIndexAll !== -1) {
			this.allTasks[taskIndexAll] = { ...updatedTask };
		}

		// 同时更新 notFilteredTasks 中的任务
		const taskIndexNotFiltered = this.notFilteredTasks.findIndex(
			(t) => t.id === updatedTask.id
		);
		if (taskIndexNotFiltered !== -1) {
			this.notFilteredTasks[taskIndexNotFiltered] = { ...updatedTask };
		}

		// Update selected task state if it was the one updated
		if (this.selectedTask && this.selectedTask.id === updatedTask.id) {
			this.selectedTask = { ...updatedTask };
		}

		// Re-apply filters to see if the task should still be visible and update count
		const previousFilteredTasksLength = this.filteredTasks.length;
		this.applyFilters();
		const taskStillVisible = this.filteredTasks.some(
			(t) => t.id === updatedTask.id
		);

		// Option 1: Task still visible after filtering, update in place
		if (taskStillVisible) {
			// Find the updated task from filteredTasks (which has been refreshed from allTasks)
			const taskFromFiltered = this.filteredTasks.find(t => t.id === updatedTask.id);
			if (!taskFromFiltered) {
				return;
			}
			
			// Find the rendered component and update it
			if (!this.isTreeView) {
				const component = this.taskComponents.find(
					(c) => c.getTask().id === updatedTask.id
				);
				component?.updateTask(taskFromFiltered); // Update rendered component with filtered task
			} else {
				// For tree view, check root components and recursively search
				let updated = false;
				for (const rootComp of this.treeComponents) {
					if (rootComp.getTask().id === updatedTask.id) {
						rootComp.updateTask(taskFromFiltered);
						updated = true;
						break;
					} else {
						if (rootComp.updateTaskRecursively(taskFromFiltered)) {
							updated = true;
							break;
						}
					}
				}
			}
		}
		// Option 2: Task visibility changed or something else requires full refresh
		else {
			this.refreshTaskList();
			return; // Exit early as refresh handles everything
		}

		// Update count display if it wasn't handled by a full refresh
		if (this.filteredTasks.length !== previousFilteredTasksLength) {
			this.countEl.setText(`${this.filteredTasks.length} ${t("tasks")}`);
		}
	}

	public getSelectedTask(): Task | null {
		return this.selectedTask;
	}

	onunload() {
		this.cleanupComponents(); // Use the cleanup method
		this.containerEl.empty(); // Extra safety
		this.containerEl.remove();
	}
}
