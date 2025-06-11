import {
	App,
	Component,
	setIcon,
	ExtraButtonComponent,
	Platform,
} from "obsidian";
import { Task } from "../../types/task";
import { TaskListItemComponent } from "./listItem";
import { t } from "../../translations/helper";
import "../../styles/tag-view.css";
import { TaskTreeItemComponent } from "./treeItem";
import { TaskListRendererComponent } from "./TaskList";
import TaskProgressBarPlugin from "../../index";
import { sortTasks } from "../../commands/sortTaskCommands";

interface SelectedTags {
	tags: string[];
	tasks: Task[];
	isMultiSelect: boolean;
}

interface TagSection {
	tag: string;
	tasks: Task[];
	isExpanded: boolean;
	renderer?: TaskListRendererComponent;
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
	private leftColumnEl: HTMLElement;

	// Child components
	private taskComponents: TaskListItemComponent[] = [];
	private treeComponents: TaskTreeItemComponent[] = [];
	private mainTaskRenderer: TaskListRendererComponent | null = null;

	// State
	private allTasks: Task[] = [];
	private filteredTasks: Task[] = [];
	private tagSections: TagSection[] = [];
	private selectedTags: SelectedTags = {
		tags: [],
		tasks: [],
		isMultiSelect: false,
	};
	private allTagsMap: Map<string, Set<string>> = new Map(); // tag -> taskIds
	private isTreeView: boolean = false;
	private allTasksMap: Map<string, Task> = new Map();
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
		this.leftColumnEl = parentEl.createDiv({
			cls: "tags-left-column",
		});

		// Header for the tags section
		const headerEl = this.leftColumnEl.createDiv({
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

		// Add close button for mobile
		if (Platform.isPhone) {
			const closeBtn = headerEl.createDiv({
				cls: "tags-sidebar-close",
			});

			new ExtraButtonComponent(closeBtn).setIcon("x").onClick(() => {
				this.toggleLeftColumnVisibility(false);
			});
		}

		// Tags list container
		this.tagsListEl = this.leftColumnEl.createDiv({
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

		// Add sidebar toggle button for mobile
		if (Platform.isPhone) {
			taskHeaderEl.createEl(
				"div",
				{
					cls: "tags-sidebar-toggle",
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
		this.allTasksMap = new Map(
			this.allTasks.map((task) => [task.id, task])
		);
		this.buildTagsIndex();
		this.renderTagsList();

		// If tags were already selected, update the tasks
		if (this.selectedTags.tags.length > 0) {
			this.updateSelectedTasks();
		} else {
			this.cleanupRenderers();
			this.renderEmptyTaskList(t("Select a tag to see related tasks"));
		}
	}

	private buildTagsIndex() {
		// Clear existing index
		this.allTagsMap.clear();

		// Build a map of tags to task IDs
		this.allTasks.forEach((task) => {
			if (task.metadata.tags && task.metadata.tags.length > 0) {
				task.metadata.tags.forEach((tag) => {
					// Skip non-string tags
					if (typeof tag !== "string") {
						return;
					}

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
				attr: {
					"data-tag": fullPath,
					"aria-label": fullPath,
				},
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
				this.cleanupRenderers();
				this.renderEmptyTaskList(
					t("Select a tag to see related tasks")
				);
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

		// Hide sidebar on mobile after selection
		if (Platform.isPhone) {
			this.toggleLeftColumnVisibility(false);
		}
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
				this.cleanupRenderers();
				this.renderEmptyTaskList(
					t("Select a tag to see related tasks")
				);
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

		// Re-render the task list with the new mode
		this.renderTaskList();
	}

	private updateSelectedTasks() {
		if (this.selectedTags.tags.length === 0) {
			this.cleanupRenderers();
			this.renderEmptyTaskList(t("Select a tag to see related tasks"));
			return;
		}

		// Get tasks that have ANY of the selected tags (OR logic)
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
			// Join all sets (OR logic)
			const resultTaskIds = new Set<string>();

			// Union all sets
			taskSets.forEach((set) => {
				set.forEach((id) => resultTaskIds.add(id));
			});

			// Convert task IDs to actual task objects
			this.filteredTasks = this.allTasks.filter((task) =>
				resultTaskIds.has(task.id)
			);

			const viewConfig = this.plugin.settings.viewConfiguration.find(
				(view) => view.id === "tags"
			);
			if (
				viewConfig?.sortCriteria &&
				viewConfig.sortCriteria.length > 0
			) {
				this.filteredTasks = sortTasks(
					this.filteredTasks,
					viewConfig.sortCriteria,
					this.plugin.settings
				);
			} else {
				this.filteredTasks.sort((a, b) => {
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
					const dueDateA =
						a.metadata.dueDate || Number.MAX_SAFE_INTEGER;
					const dueDateB =
						b.metadata.dueDate || Number.MAX_SAFE_INTEGER;
					return dueDateA - dueDateB;
				});
			}
		}

		// Decide whether to create sections or render flat/tree
		if (!this.isTreeView && this.selectedTags.tags.length > 1) {
			this.createTagSections();
		} else {
			// Render directly without sections
			this.tagSections = [];
			this.renderTaskList();
		}
	}

	private createTagSections() {
		// Clear previous sections and their renderers
		this.cleanupRenderers();
		this.tagSections = [];

		// Group tasks by the selected tags they match (including children)
		const tagTaskMap = new Map<string, Task[]>();
		this.selectedTags.tags.forEach((tag) => {
			const tasksForThisTagBranch = this.filteredTasks.filter((task) => {
				if (!task.metadata.tags) return false;
				return task.metadata.tags.some(
					(taskTag) =>
						// Skip non-string tags
						typeof taskTag === "string" &&
						(taskTag === tag || taskTag.startsWith(tag + "/"))
				);
			});

			if (tasksForThisTagBranch.length > 0) {
				// Ensure tasks aren't duplicated across sections if selection overlaps (e.g., #parent and #parent/child)
				// This simple grouping might show duplicates if a task has both selected tags.
				// For OR logic display, maybe better to render all `filteredTasks` under one combined header?
				// Let's stick to sections per selected tag for now.
				tagTaskMap.set(tag, tasksForThisTagBranch);
			}
		});

		// Create section objects
		tagTaskMap.forEach((tasks, tag) => {
			this.tagSections.push({
				tag: tag,
				tasks: tasks,
				isExpanded: true,
				// Renderer will be created in renderTagSections
			});
		});

		// Sort sections by tag name
		this.tagSections.sort((a, b) => a.tag.localeCompare(b.tag));

		// Update the task list view
		this.renderTaskList();
	}

	private updateTaskListHeader() {
		const taskHeaderEl =
			this.taskContainerEl.querySelector(".tags-task-title");
		if (taskHeaderEl) {
			if (this.selectedTags.tags.length === 1) {
				taskHeaderEl.textContent = `#${this.selectedTags.tags[0].replace(
					"#",
					""
				)}`;
			} else if (this.selectedTags.tags.length > 1) {
				taskHeaderEl.textContent = `${
					this.selectedTags.tags.length
				} ${t("tags selected")}`;
			} else {
				taskHeaderEl.textContent = t("Tasks");
			}
		}

		const taskCountEl =
			this.taskContainerEl.querySelector(".tags-task-count");
		if (taskCountEl) {
			// Use filteredTasks length for the total count across selections/sections
			taskCountEl.textContent = `${this.filteredTasks.length} ${t(
				"tasks"
			)}`;
		}
	}

	private cleanupRenderers() {
		// Cleanup main renderer if it exists
		if (this.mainTaskRenderer) {
			this.removeChild(this.mainTaskRenderer);
			this.mainTaskRenderer = null;
		}
		// Cleanup section renderers
		this.tagSections.forEach((section) => {
			if (section.renderer) {
				this.removeChild(section.renderer);
				section.renderer = undefined;
			}
		});
		// Clear the container manually as renderers might not have cleared it if just removed
		this.taskListContainerEl.empty();
	}

	private renderTaskList() {
		this.cleanupRenderers(); // Clean up any previous renderers
		this.updateTaskListHeader(); // Update title and count

		if (
			this.filteredTasks.length === 0 &&
			this.selectedTags.tags.length > 0
		) {
			// We have selected tags, but no tasks match
			this.renderEmptyTaskList(t("No tasks with the selected tags"));
			return;
		}
		if (
			this.filteredTasks.length === 0 &&
			this.selectedTags.tags.length === 0
		) {
			// No tags selected yet
			this.renderEmptyTaskList(t("Select a tag to see related tasks"));
			return;
		}

		// Decide rendering mode: sections or flat/tree
		const useSections =
			!this.isTreeView &&
			this.tagSections.length > 0 &&
			this.selectedTags.tags.length > 1;

		if (useSections) {
			this.renderTagSections();
		} else {
			// Use a single main renderer for flat list or tree view
			this.mainTaskRenderer = new TaskListRendererComponent(
				this,
				this.taskListContainerEl,
				this.plugin,
				this.app,
				"tags"
			);
			this.params.onTaskSelected &&
				(this.mainTaskRenderer.onTaskSelected =
					this.params.onTaskSelected);
			this.params.onTaskCompleted &&
				(this.mainTaskRenderer.onTaskCompleted =
					this.params.onTaskCompleted);
			this.params.onTaskUpdate &&
				(this.mainTaskRenderer.onTaskUpdate = this.params.onTaskUpdate);
			this.params.onTaskContextMenu &&
				(this.mainTaskRenderer.onTaskContextMenu =
					this.params.onTaskContextMenu);

			this.mainTaskRenderer.renderTasks(
				this.filteredTasks,
				this.isTreeView,
				this.allTasksMap,
				// Empty message handled above, so this shouldn't be shown
				t("No tasks found.")
			);
		}
	}

	private renderTagSections() {
		// Assumes cleanupRenderers was called before this
		this.tagSections.forEach((section) => {
			const sectionEl = this.taskListContainerEl.createDiv({
				cls: "task-tag-section",
			});

			// Section header
			const headerEl = sectionEl.createDiv({ cls: "tag-section-header" });
			const toggleEl = headerEl.createDiv({ cls: "section-toggle" });
			setIcon(
				toggleEl,
				section.isExpanded ? "chevron-down" : "chevron-right"
			);
			const titleEl = headerEl.createDiv({ cls: "section-title" });
			titleEl.setText(`#${section.tag.replace("#", "")}`);
			const countEl = headerEl.createDiv({ cls: "section-count" });
			countEl.setText(`${section.tasks.length}`);

			// Task container for the renderer
			const taskListEl = sectionEl.createDiv({ cls: "section-tasks" });
			if (!section.isExpanded) {
				taskListEl.hide();
			}

			// Create a renderer for this section
			section.renderer = new TaskListRendererComponent(
				this,
				taskListEl, // Render inside this section's container
				this.plugin,
				this.app,
				"tags"
			);
			this.params.onTaskSelected &&
				(section.renderer.onTaskSelected = this.params.onTaskSelected);
			this.params.onTaskCompleted &&
				(section.renderer.onTaskCompleted =
					this.params.onTaskCompleted);
			this.params.onTaskUpdate &&
				(section.renderer.onTaskUpdate = this.params.onTaskUpdate);
			this.params.onTaskContextMenu &&
				(section.renderer.onTaskContextMenu =
					this.params.onTaskContextMenu);

			// Render tasks for this section (always list view within sections)
			section.renderer.renderTasks(
				section.tasks,
				this.isTreeView,
				this.allTasksMap,
				t("No tasks found for this tag.")
			);

			// Register toggle event
			this.registerDomEvent(headerEl, "click", () => {
				section.isExpanded = !section.isExpanded;
				setIcon(
					toggleEl,
					section.isExpanded ? "chevron-down" : "chevron-right"
				);
				section.isExpanded ? taskListEl.show() : taskListEl.hide();
			});
		});
	}

	private renderEmptyTaskList(message: string) {
		this.cleanupRenderers(); // Ensure no renderers are active
		this.taskListContainerEl.empty(); // Clear the main container

		// Optionally update header (already done in renderTaskList)
		// this.updateTaskListHeader();

		// Display the message
		const emptyEl = this.taskListContainerEl.createDiv({
			cls: "tags-empty-state",
		});
		emptyEl.setText(message);
	}

	public updateTask(updatedTask: Task) {
		let needsFullRefresh = false;
		const taskIndex = this.allTasks.findIndex(
			(t) => t.id === updatedTask.id
		);

		if (taskIndex !== -1) {
			const oldTask = this.allTasks[taskIndex];
			// Check if tags changed, necessitating a rebuild/re-render
			const tagsChanged =
				!oldTask.metadata.tags ||
				!updatedTask.metadata.tags ||
				oldTask.metadata.tags.join(",") !==
					updatedTask.metadata.tags.join(",");

			if (tagsChanged) {
				needsFullRefresh = true;
			}
			this.allTasks[taskIndex] = updatedTask;
		} else {
			this.allTasks.push(updatedTask);
			needsFullRefresh = true; // New task, requires full refresh
		}

		// If tags changed or task is new, rebuild index and fully refresh UI
		if (needsFullRefresh) {
			this.buildTagsIndex();
			this.renderTagsList(); // Update left sidebar
			this.updateSelectedTasks(); // Recalculate filtered tasks and re-render right panel
		} else {
			// Otherwise, update the task in the filtered list
			const filteredIndex = this.filteredTasks.findIndex(
				(t) => t.id === updatedTask.id
			);
			if (filteredIndex !== -1) {
				this.filteredTasks[filteredIndex] = updatedTask;

				// Find the correct renderer (main or section) and update the task
				if (this.mainTaskRenderer) {
					this.mainTaskRenderer.updateTask(updatedTask);
				} else {
					this.tagSections.forEach((section) => {
						// Check if the task belongs to this section's tag branch
						if (
							updatedTask.metadata.tags?.some(
								(taskTag: string) =>
									// Skip non-string tags
									typeof taskTag === "string" &&
									(taskTag === section.tag ||
										taskTag.startsWith(section.tag + "/"))
							)
						) {
							// Check if the task is actually in this section's list
							if (
								section.tasks.some(
									(t) => t.id === updatedTask.id
								)
							) {
								section.renderer?.updateTask(updatedTask);
							}
						}
					});
				}
				// Optional: Re-sort if needed, then call renderTaskList or relevant section update
			} else {
				// Task might have become visible/invisible due to update, requires re-filtering
				this.updateSelectedTasks();
			}
		}
	}

	onunload() {
		// Renderers are children, cleaned up automatically.
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
