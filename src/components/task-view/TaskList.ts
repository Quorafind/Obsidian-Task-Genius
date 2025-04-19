import { App, Component } from "obsidian";
import { Task } from "../../utils/types/TaskIndex";
import { TaskListItemComponent } from "./listItem";
import { TaskTreeItemComponent } from "./treeItem";
import { tasksToTree } from "../../utils/treeViewUtil";
import { t } from "../../translations/helper";

export class TaskListRendererComponent extends Component {
	private taskComponents: TaskListItemComponent[] = [];
	private treeComponents: TaskTreeItemComponent[] = [];
	private allTasksMap: Map<string, Task> = new Map(); // Store the full map

	// Event handlers to be set by the parent component
	public onTaskSelected: (task: Task) => void;
	public onTaskCompleted: (task: Task) => void;
	public onTaskContextMenu: (event: MouseEvent, task: Task) => void;

	constructor(
		private parent: Component, // Parent component to manage child lifecycle
		private containerEl: HTMLElement, // The HTML element to render tasks into
		private app: App,
		private context: string // Context identifier (e.g., "projects", "review")
	) {
		super();
		// Add this renderer as a child of the parent component
		parent.addChild(this);
	}

	/**
	 * Renders the list of tasks, clearing previous content by default.
	 * Can optionally append tasks instead of clearing.
	 * @param tasks - The list of tasks specific to this section/view.
	 * @param isTreeView - Whether to render as a tree or a flat list.
	 * @param allTasksMap - OPTIONAL: Map of all tasks for tree view context. Required if isTreeView is true.
	 * @param emptyMessage - Message to display if tasks array is empty.
	 * @param append - If true, appends tasks without clearing existing ones. Defaults to false.
	 */
	public renderTasks(
		tasks: Task[],
		isTreeView: boolean,
		allTasksMap?: Map<string, Task>, // Make it optional but required for tree view
		emptyMessage: string = t("No tasks found."),
		append: boolean = false
	) {
		if (!append) {
			this.cleanupComponents();
			this.containerEl.empty();
		}

		if (tasks.length === 0 && !append) {
			this.renderEmptyState(emptyMessage);
			return;
		}

		// Store the map if provided (primarily for tree view)
		if (allTasksMap) {
			this.allTasksMap = allTasksMap;
		} else if (isTreeView) {
			// Fallback: if tree view is requested but no map provided, build it from section tasks
			// This might lead to incomplete trees if parents are outside the section.
			console.warn(
				"TaskListRendererComponent: allTasksMap not provided for tree view. Tree may be incomplete."
			);
			this.allTasksMap = new Map(tasks.map((task) => [task.id, task]));
		}

		if (isTreeView) {
			if (!this.allTasksMap || this.allTasksMap.size === 0) {
				console.error(
					"TaskListRendererComponent: Cannot render tree view without allTasksMap."
				);
				this.renderEmptyState(
					"Error: Task data unavailable for tree view."
				); // Show error
				return;
			}
			this.renderTreeView(tasks, this.allTasksMap); // Pass the map
		} else {
			this.renderListView(tasks);
		}
	}

	private renderListView(tasks: Task[]) {
		const fragment = document.createDocumentFragment();
		tasks.forEach((task) => {
			const taskComponent = new TaskListItemComponent(
				task,
				this.context,
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
			taskComponent.onTaskContextMenu = (event, task) => {
				if (this.onTaskContextMenu) {
					this.onTaskContextMenu(event, task);
				}
			};

			// Load component and add to parent's children
			this.parent.addChild(taskComponent);
			taskComponent.load();

			// Add element to fragment
			fragment.appendChild(taskComponent.element);

			// Store for later cleanup
			this.taskComponents.push(taskComponent);
		});
		this.containerEl.appendChild(fragment);
	}

	private renderTreeView(
		sectionTasks: Task[],
		allTasksMap: Map<string, Task>
	) {
		const fragment = document.createDocumentFragment();
		const sectionTaskIds = new Set(sectionTasks.map((t) => t.id)); // IDs of tasks belonging to this section

		// --- Determine Root Tasks for Rendering ---
		const rootTasksToRenderMap = new Map<string, Task>(); // Use Map to avoid duplicates easily

		for (const task of sectionTasks) {
			let currentTask = task;
			let potentialRoot = task;

			// Traverse upwards to find the highest ancestor that is NOT in this section,
			// or stop at the task itself if it has no parent or its parent IS in the section.
			while (
				currentTask.parent &&
				!sectionTaskIds.has(currentTask.parent)
			) {
				const parentTask = allTasksMap.get(currentTask.parent);
				if (!parentTask) {
					// Parent ID exists but task not found in map - data inconsistency? Stop ascending.
					console.warn(
						`Parent task ${currentTask.parent} not found in allTasksMap.`
					);
					break;
				}
				potentialRoot = parentTask; // The parent becomes the new potential root for this branch
				currentTask = parentTask; // Continue checking the parent's parent
			}

			// Add the determined root task (could be the original task or an ancestor) to the map
			if (!rootTasksToRenderMap.has(potentialRoot.id)) {
				rootTasksToRenderMap.set(potentialRoot.id, potentialRoot);
			}
		}

		const rootTasksToRender = Array.from(rootTasksToRenderMap.values());

		// Optional: Sort root tasks (e.g., by line number)
		rootTasksToRender.sort((a, b) => a.line - b.line);

		// --- Render Tree Items ---
		rootTasksToRender.forEach((rootTask) => {
			// Find direct children of this root task using the *full* map
			const directChildren: Task[] = [];
			if (rootTask.children) {
				rootTask.children.forEach((childId) => {
					const childTask = allTasksMap.get(childId);
					if (childTask) {
						directChildren.push(childTask);
					} else {
						console.warn(
							`Child task ${childId} (parent: ${rootTask.id}) not found in allTasksMap.`
						);
					}
				});
			}
			// Optional: Sort direct children
			directChildren.sort((a, b) => a.line - b.line);

			const treeComponent = new TaskTreeItemComponent(
				rootTask,
				this.context,
				this.app,
				0, // Root level is 0
				directChildren, // Pass the actual children from the full map
				allTasksMap // Pass the full map for recursive building
			);

			// Set up event handlers
			treeComponent.onTaskSelected = (selectedTask) => {
				if (this.onTaskSelected) this.onTaskSelected(selectedTask);
			};
			treeComponent.onTaskCompleted = (task) => {
				if (this.onTaskCompleted) this.onTaskCompleted(task);
			};
			treeComponent.onTaskContextMenu = (event, task) => {
				if (this.onTaskContextMenu) this.onTaskContextMenu(event, task);
			};

			this.parent.addChild(treeComponent); // Use the parent component passed in constructor
			treeComponent.load();
			fragment.appendChild(treeComponent.element);
			this.treeComponents.push(treeComponent); // Store for cleanup
		});

		this.containerEl.appendChild(fragment);
	}

	private renderEmptyState(message: string) {
		this.containerEl.empty(); // Ensure container is empty
		const emptyEl = this.containerEl.createDiv({
			cls: `${this.context}-empty-state`, // Generic and specific class
		});
		emptyEl.setText(message);
	}

	/**
	 * Updates a specific task's visual representation if it's currently rendered.
	 * Now uses allTasksMap for context if needed.
	 * @param updatedTask - The task data that has changed.
	 */
	public updateTask(updatedTask: Task) {
		// Update the task in the stored map first
		if (this.allTasksMap.has(updatedTask.id)) {
			this.allTasksMap.set(updatedTask.id, updatedTask);
		}

		// Try updating in list view components
		const listItemComponent = this.taskComponents.find(
			(c) => c.getTask().id === updatedTask.id
		);
		if (listItemComponent) {
			listItemComponent.updateTask(updatedTask);
			return;
		}

		// Try updating in tree view components
		for (const treeComp of this.treeComponents) {
			if (treeComp.getTask().id === updatedTask.id) {
				treeComp.updateTask(updatedTask);
				return;
			} else {
				// updateTaskRecursively is defined in TaskTreeItemComponent
				const updatedInChildren =
					treeComp.updateTaskRecursively(updatedTask);
				if (updatedInChildren) {
					return;
				}
			}
		}

		// If the task wasn't found in the rendered components (e.g., it's an ancestor
		// rendered implicitly in tree view), we might not need to do anything visually here,
		// as the child component update should handle changes.
		// However, if the update could change the structure (e.g., parent link), a full re-render
		// might be safer in some cases, but let's avoid that for performance unless necessary.
	}

	/**
	 * Cleans up all rendered task components (list and tree).
	 * Should be called before rendering new tasks (unless appending).
	 */
	public cleanupComponents() {
		this.taskComponents.forEach((component) => {
			this.parent.removeChild(component); // Use parent's removeChild
		});
		this.taskComponents = [];

		this.treeComponents.forEach((component) => {
			this.parent.removeChild(component); // Use parent's removeChild
		});
		this.treeComponents = [];
	}

	onunload() {
		// Cleanup components when the renderer itself is unloaded
		this.cleanupComponents();
		// The containerEl is managed by the parent component, so we don't remove it here.
	}
}
