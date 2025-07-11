import { App, Component } from "obsidian";
import { Task } from "../../types/task";
import { TaskListItemComponent } from "./listItem";
import { TaskTreeItemComponent } from "./treeItem";
import { tasksToTree } from "../../utils/treeViewUtil";
import { t } from "../../translations/helper";
import TaskProgressBarPlugin from "../../index";

export class TaskListRendererComponent extends Component {
	private taskComponents: TaskListItemComponent[] = [];
	private treeComponents: TaskTreeItemComponent[] = [];
	private allTasksMap: Map<string, Task> = new Map(); // Store the full map

	// Event handlers to be set by the parent component
	public onTaskSelected: (task: Task) => void;
	public onTaskCompleted: (task: Task) => void;
	public onTaskUpdate: (task: Task, updatedTask: Task) => Promise<void>;
	public onTaskContextMenu: (event: MouseEvent, task: Task) => void;

	constructor(
		private parent: Component, // Parent component to manage child lifecycle
		private containerEl: HTMLElement, // The HTML element to render tasks into
		private plugin: TaskProgressBarPlugin,
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
		allTasksMap: Map<string, Task>, // Make it optional but required for tree view
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
				this.app,
				this.plugin
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
			taskComponent.onTaskUpdate = async (originalTask, updatedTask) => {
				console.log(
					"TaskListRendererComponent onTaskUpdate",
					this.onTaskUpdate,
					originalTask.content,
					updatedTask.content
				);
				if (this.onTaskUpdate) {
					console.log(
						"TaskListRendererComponent onTaskUpdate",
						originalTask.content,
						updatedTask.content
					);
					await this.onTaskUpdate(originalTask, updatedTask);
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
		// Helper function to mark subtree as processed
		const markSubtreeAsProcessed = (
			rootTask: Task,
			sectionTaskIds: Set<string>,
			processedTaskIds: Set<string>
		) => {
			if (sectionTaskIds.has(rootTask.id)) {
				processedTaskIds.add(rootTask.id);
			}

			if (rootTask.metadata.children) {
				rootTask.metadata.children.forEach((childId) => {
					const childTask = allTasksMap.get(childId);
					if (childTask) {
						markSubtreeAsProcessed(
							childTask,
							sectionTaskIds,
							processedTaskIds
						);
					}
				});
			}
		};

		// Identify true root tasks to avoid duplicate rendering
		const rootTasksToRender: Task[] = [];
		const processedTaskIds = new Set<string>();

		for (const task of sectionTasks) {
			// Skip already processed tasks
			if (processedTaskIds.has(task.id)) {
				continue;
			}

			// Check if this is a root task (no parent or parent not in current section)
			if (
				!task.metadata.parent ||
				!sectionTaskIds.has(task.metadata.parent)
			) {
				// This is a root task
				let actualRoot = task;

				// If has parent but parent not in current section, find the complete root
				if (task.metadata.parent) {
					let currentTask = task;
					while (
						currentTask.metadata.parent &&
						!sectionTaskIds.has(currentTask.metadata.parent)
					) {
						const parentTask = allTasksMap.get(
							currentTask.metadata.parent
						);
						if (!parentTask) {
							console.warn(
								`Parent task ${currentTask.metadata.parent} not found in allTasksMap.`
							);
							break;
						}
						actualRoot = parentTask;
						currentTask = parentTask;
					}
				}

				// Add root task to render list if not already added
				if (!rootTasksToRender.some((t) => t.id === actualRoot.id)) {
					rootTasksToRender.push(actualRoot);
				}

				// Mark entire subtree as processed to avoid duplicate rendering
				markSubtreeAsProcessed(
					actualRoot,
					sectionTaskIds,
					processedTaskIds
				);
			}
		}

		// Optional: Sort root tasks (e.g., by line number)
		rootTasksToRender.sort((a, b) => a.line - b.line);

		// --- Render Tree Items ---
		rootTasksToRender.forEach((rootTask) => {
			// Find direct children of this root task using the *full* map
			const directChildren: Task[] = [];
			if (rootTask.metadata.children) {
				rootTask.metadata.children.forEach((childId: string) => {
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
				allTasksMap, // Pass the full map for recursive building
				this.plugin
			);

			// Set up event handlers
			treeComponent.onTaskSelected = (selectedTask) => {
				if (this.onTaskSelected) this.onTaskSelected(selectedTask);
			};
			treeComponent.onTaskCompleted = (task) => {
				if (this.onTaskCompleted) this.onTaskCompleted(task);
			};
			treeComponent.onTaskUpdate = async (originalTask, updatedTask) => {
				if (this.onTaskUpdate) {
					await this.onTaskUpdate(originalTask, updatedTask);
				}
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
