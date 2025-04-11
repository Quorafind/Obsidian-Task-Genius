import { App, Component, setIcon } from "obsidian";
import { Task } from "../../utils/types/TaskIndex";
import { TaskListItemComponent } from "./listItem";
import { t } from "../../translations/helper";
import "../../styles/tag-view.css";
import { tasksToTree, flattenTaskTree } from "../../utils/treeViewUtil";
import { TaskTreeItemComponent } from "./treeItem";

interface SelectedTags {
	tags: string[];
	tasks: Task[];
	isMultiSelect: boolean;
}

export class TagsComponent extends Component {
	// UI Elements
	public containerEl: HTMLElement;
	private tagsHeaderEl: HTMLElement;
	private tagsListEl: HTMLElement;
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
	private selectedTags: SelectedTags = {
		tags: [],
		tasks: [],
		isMultiSelect: false,
	};
	private allTagsMap: Map<string, Set<string>> = new Map(); // tag -> taskIds
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
			cls: "tags-container",
		});

		// Create content container for columns
		const contentContainer = this.containerEl.createDiv({
			cls: "tags-content",
		});

		// Left column: create tags list
		this.createLeftColumn(contentContainer);

		// Right column: create task list for selected tags
		this.createRightColumn(contentContainer);
	}

	private createTagsHeader() {
		this.tagsHeaderEl = this.containerEl.createDiv({
			cls: "tags-header",
		});

		// Title and task count
		const titleContainer = this.tagsHeaderEl.createDiv({
			cls: "tags-title-container",
		});

		this.titleEl = titleContainer.createDiv({
			cls: "tags-title",
			text: t("Tags"),
		});

		this.countEl = titleContainer.createDiv({
			cls: "tags-count",
		});
		this.countEl.setText("0 tags");
	}

	private createLeftColumn(parentEl: HTMLElement) {
		const leftColumnEl = parentEl.createDiv({
			cls: "tags-left-column",
		});

		// Header for the tags section
		const headerEl = leftColumnEl.createDiv({
			cls: "tags-sidebar-header",
		});

		const headerTitle = headerEl.createDiv({
			cls: "tags-sidebar-title",
			text: t("Tags"),
		});

		// Add multi-select toggle button
		const multiSelectBtn = headerEl.createDiv({
			cls: "tags-multi-select-btn",
		});
		setIcon(multiSelectBtn, "list-plus");
		multiSelectBtn.setAttribute("aria-label", t("Toggle multi-select"));

		this.registerDomEvent(multiSelectBtn, "click", () => {
			this.toggleMultiSelect();
		});

		// Tags list container
		this.tagsListEl = leftColumnEl.createDiv({
			cls: "tags-sidebar-list",
		});
	}

	private createRightColumn(parentEl: HTMLElement) {
		this.taskContainerEl = parentEl.createDiv({
			cls: "tags-right-column",
		});

		// Task list header
		const taskHeaderEl = this.taskContainerEl.createDiv({
			cls: "tags-task-header",
		});

		const taskTitleEl = taskHeaderEl.createDiv({
			cls: "tags-task-title",
		});
		taskTitleEl.setText(t("Tasks"));

		const taskCountEl = taskHeaderEl.createDiv({
			cls: "tags-task-count",
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
			cls: "tags-task-list",
		});
	}

	public setTasks(tasks: Task[]) {
		this.allTasks = tasks;
		this.buildTagsIndex();
		this.renderTagsList();

		// If tags were already selected, update the tasks
		if (this.selectedTags.tags.length > 0) {
			this.updateSelectedTasks();
		} else {
			this.renderEmptyTaskList();
		}
	}

	private buildTagsIndex() {
		// Clear existing index
		this.allTagsMap.clear();

		// Build a map of tags to task IDs
		this.allTasks.forEach((task) => {
			if (task.tags && task.tags.length > 0) {
				task.tags.forEach((tag) => {
					if (!this.allTagsMap.has(tag)) {
						this.allTagsMap.set(tag, new Set());
					}
					this.allTagsMap.get(tag)?.add(task.id);
				});
			}
		});

		// Update tags count
		this.countEl?.setText(`${this.allTagsMap.size} tags`);
	}

	private renderTagsList() {
		// Clear existing list
		this.tagsListEl.empty();

		// Sort tags alphabetically
		const sortedTags = Array.from(this.allTagsMap.keys()).sort();

		// Create hierarchical structure for nested tags
		const tagHierarchy: Record<string, any> = {};

		sortedTags.forEach((tag) => {
			const parts = tag.split("/");
			let current = tagHierarchy;

			parts.forEach((part, index) => {
				if (!current[part]) {
					current[part] = {
						_tasks: new Set(),
						_path: parts.slice(0, index + 1).join("/"),
					};
				}

				// Add tasks to this level
				const taskIds = this.allTagsMap.get(tag);
				if (taskIds) {
					taskIds.forEach((id) => current[part]._tasks.add(id));
				}

				current = current[part];
			});
		});

		// Render the hierarchy
		this.renderTagHierarchy(tagHierarchy, this.tagsListEl, 0);
	}

	private renderTagHierarchy(
		node: Record<string, any>,
		parentEl: HTMLElement,
		level: number
	) {
		// Sort keys alphabetically, but exclude metadata properties
		const keys = Object.keys(node)
			.filter((k) => !k.startsWith("_"))
			.sort();

		keys.forEach((key) => {
			const childNode = node[key];
			const fullPath = childNode._path;
			const taskCount = childNode._tasks.size;

			// Create tag item
			const tagItem = parentEl.createDiv({
				cls: "tag-list-item",
			});

			// Add indent based on level
			if (level > 0) {
				const indentEl = tagItem.createDiv({
					cls: "tag-indent",
				});
				indentEl.style.width = `${level * 20}px`;
			}

			// Tag icon and color
			const tagIconEl = tagItem.createDiv({
				cls: "tag-icon",
			});
			setIcon(tagIconEl, "hash");

			// Tag name and count
			const tagNameEl = tagItem.createDiv({
				cls: "tag-name",
			});
			tagNameEl.setText(key.replace("#", ""));

			const tagCountEl = tagItem.createDiv({
				cls: "tag-count",
			});
			tagCountEl.setText(taskCount.toString());

			// Store the full tag path as data attribute
			tagItem.dataset.tag = fullPath;

			// Check if this tag is already selected
			if (this.selectedTags.tags.includes(fullPath)) {
				tagItem.classList.add("selected");
			}

			// Add click handler
			this.registerDomEvent(tagItem, "click", (e) => {
				this.handleTagSelection(fullPath, e.ctrlKey || e.metaKey);
			});

			// If this node has children, render them recursively
			const hasChildren =
				Object.keys(childNode).filter((k) => !k.startsWith("_"))
					.length > 0;
			if (hasChildren) {
				// Create a container for children
				const childrenContainer = parentEl.createDiv({
					cls: "tag-children",
				});

				// Render children
				this.renderTagHierarchy(
					childNode,
					childrenContainer,
					level + 1
				);
			}
		});
	}

	private handleTagSelection(tag: string, isCtrlPressed: boolean) {
		if (this.selectedTags.isMultiSelect || isCtrlPressed) {
			// Multi-select mode
			const index = this.selectedTags.tags.indexOf(tag);
			if (index === -1) {
				// Add to selection
				this.selectedTags.tags.push(tag);
			} else {
				// Remove from selection
				this.selectedTags.tags.splice(index, 1);
			}

			// If no tags selected and not in multi-select mode, reset
			if (
				this.selectedTags.tags.length === 0 &&
				!this.selectedTags.isMultiSelect
			) {
				this.renderEmptyTaskList();
				return;
			}
		} else {
			// Single-select mode
			this.selectedTags.tags = [tag];
		}

		// Update UI to show which tags are selected
		const tagItems = this.tagsListEl.querySelectorAll(".tag-list-item");
		tagItems.forEach((item) => {
			const itemTag = item.getAttribute("data-tag");
			if (itemTag && this.selectedTags.tags.includes(itemTag)) {
				item.classList.add("selected");
			} else {
				item.classList.remove("selected");
			}
		});

		// Update tasks based on selected tags
		this.updateSelectedTasks();
	}

	private toggleMultiSelect() {
		this.selectedTags.isMultiSelect = !this.selectedTags.isMultiSelect;

		// Update UI to reflect multi-select mode
		if (this.selectedTags.isMultiSelect) {
			this.containerEl.classList.add("multi-select-mode");
		} else {
			this.containerEl.classList.remove("multi-select-mode");

			// If no tags are selected, reset the view
			if (this.selectedTags.tags.length === 0) {
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
		if (this.selectedTags.tags.length === 0) {
			this.renderEmptyTaskList();
			return;
		}

		// Get tasks that have ALL the selected tags (AND logic)
		console.log(this.selectedTags.tags);
		const taskSets: Set<string>[] = this.selectedTags.tags.map((tag) => {
			// For each selected tag, include tasks from child tags
			const matchingTasks = new Set<string>();

			// Add direct matches from this exact tag
			const directMatches = this.allTagsMap.get(tag);
			if (directMatches) {
				directMatches.forEach((id) => matchingTasks.add(id));
			}

			// Add matches from child tags (those that start with parent tag path + /)
			this.allTagsMap.forEach((taskIds, childTag) => {
				if (childTag !== tag && childTag.startsWith(tag + "/")) {
					taskIds.forEach((id) => matchingTasks.add(id));
				}
			});

			return matchingTasks;
		});
		console.log(taskSets, this.allTagsMap);

		if (taskSets.length === 0) {
			this.filteredTasks = [];
		} else {
			// Start with the first set
			let resultTaskIds = new Set<string>(taskSets[0]);

			// Intersect with other sets
			for (let i = 1; i < taskSets.length; i++) {
				resultTaskIds = new Set(
					[...resultTaskIds].filter((id) => taskSets[i].has(id))
				);
			}

			console.log(resultTaskIds);

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
		}

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

		// Update the header with selected tags
		const taskHeaderEl =
			this.taskContainerEl.querySelector(".tags-task-title");
		if (taskHeaderEl) {
			if (this.selectedTags.tags.length === 1) {
				// Show the tag name if only one selected
				taskHeaderEl.textContent = `#${this.selectedTags.tags[0].replace(
					"#",
					""
				)}`;
			} else {
				// Show count if multiple selected
				taskHeaderEl.textContent = `${
					this.selectedTags.tags.length
				} ${t("tags selected")}`;
			}
		}

		// Update task count
		const taskCountEl =
			this.taskContainerEl.querySelector(".tags-task-count");
		if (taskCountEl) {
			taskCountEl.textContent = `${this.filteredTasks.length} ${t(
				"tasks"
			)}`;
		}

		if (this.filteredTasks.length === 0) {
			// Show empty state
			const emptyEl = this.taskListContainerEl.createDiv({
				cls: "tags-empty-state",
			});
			emptyEl.setText(t("No tasks with the selected tags"));
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
				"tags",
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
				"tags",
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
		const taskHeaderEl =
			this.taskContainerEl.querySelector(".tags-task-title");
		if (taskHeaderEl) {
			taskHeaderEl.textContent = t("Tasks");
		}

		// Reset task count
		const taskCountEl =
			this.taskContainerEl.querySelector(".tags-task-count");
		if (taskCountEl) {
			taskCountEl.textContent = "0 tasks";
		}

		// Show instruction state
		const emptyEl = this.taskListContainerEl.createDiv({
			cls: "tags-empty-state",
		});
		emptyEl.setText(t("Select a tag to see related tasks"));
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

		// Rebuild tag index and rerender if tags changed
		const oldTask = this.allTasks[taskIndex];
		if (
			!oldTask ||
			!oldTask.tags ||
			!updatedTask.tags ||
			oldTask.tags.join(",") !== updatedTask.tags.join(",")
		) {
			this.buildTagsIndex();
			this.renderTagsList();
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
