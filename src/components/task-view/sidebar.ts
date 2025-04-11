import { Component, setIcon, Plugin } from "obsidian";
import { Task } from "../../utils/types/TaskIndex";

export type ViewMode =
	| "forecast"
	| "projects"
	| "inbox"
	| "review"
	| "flagged"
	| "tags";

export class SidebarComponent extends Component {
	// UI elements
	public containerEl: HTMLElement;
	private projectTreeEl: HTMLElement;
	private navEl: HTMLElement;

	// State
	private selectedProject: string | null = null;
	private selectedViewMode: ViewMode = "forecast";
	private isCollapsed: boolean = false;

	// Events
	public onProjectSelected: (project: string) => void;
	public onViewModeChanged: (mode: ViewMode) => void;

	constructor(private parentEl: HTMLElement, private plugin: Plugin) {
		super();
	}

	onload() {
		// Create sidebar container
		this.containerEl = this.parentEl.createDiv({
			cls: "task-sidebar",
		});

		// Create navigation items in sidebar
		this.createSidebarNavigation();

		// Create tree view container in sidebar
		// this.projectTreeEl = this.containerEl.createDiv({
		// 	cls: "project-tree",
		// });
	}

	private createSidebarNavigation() {
		this.navEl = this.containerEl.createDiv({ cls: "sidebar-nav" });

		// Create navigation items
		const createNavItem = (id: ViewMode, text: string, icon: string) => {
			const item = this.navEl.createDiv({ cls: "sidebar-nav-item" });
			item.dataset.view = id;

			const iconEl = item.createDiv({ cls: "sidebar-nav-icon" });
			setIcon(iconEl, icon);

			const textEl = item.createDiv({ cls: "sidebar-nav-text" });
			textEl.setText(text);

			this.registerDomEvent(item, "click", () => {
				this.setViewMode(id);
			});

			return item;
		};

		createNavItem("inbox", "Inbox", "inbox");
		createNavItem("forecast", "Forecast", "calendar");
		createNavItem("projects", "Projects", "list-todo");
		createNavItem("tags", "Tags", "tag");
		createNavItem("flagged", "Flagged", "flag");
		createNavItem("review", "Review", "eye");
	}

	// public async initializeProjectTree(tasks: Task[]) {
	// 	// Clear existing content
	// 	this.projectTreeEl.empty();

	// 	// Extract projects
	// 	const projects = new Set<string>();
	// 	tasks.forEach((task: Task) => {
	// 		if (task.project) {
	// 			projects.add(task.project);
	// 		}
	// 	});

	// 	// Create project tree
	// 	const treeRoot = this.projectTreeEl.createDiv({ cls: "tree-root" });

	// 	// Create tree item for each project
	// 	Array.from(projects)
	// 		.sort()
	// 		.forEach((project) => {
	// 			this.createProjectTreeItem(treeRoot, project, tasks);
	// 		});
	// }

	// private createProjectTreeItem(
	// 	parentEl: HTMLElement,
	// 	project: string,
	// 	tasks: Task[]
	// ) {
	// 	const parts = project.split("/");
	// 	const name = parts[parts.length - 1];

	// 	const itemEl = parentEl.createDiv({ cls: "tree-item" });
	// 	itemEl.dataset.project = project;

	// 	// Tree item toggle if it has children
	// 	const hasChildren = false; // Determine if this project has sub-projects

	// 	if (hasChildren) {
	// 		const toggleEl = itemEl.createDiv({ cls: "tree-item-toggle" });
	// 		setIcon(toggleEl, "chevron-right");

	// 		this.registerDomEvent(toggleEl, "click", (e) => {
	// 			e.stopPropagation();
	// 			if (itemEl.classList.contains("expanded")) {
	// 				itemEl.classList.remove("expanded");
	// 				setIcon(toggleEl, "chevron-right");
	// 			} else {
	// 				itemEl.classList.add("expanded");
	// 				setIcon(toggleEl, "chevron-down");
	// 			}
	// 		});
	// 	} else {
	// 		itemEl.createDiv({ cls: "tree-item-indent" });
	// 	}

	// 	// Project icon
	// 	const iconEl = itemEl.createDiv({ cls: "tree-item-icon" });
	// 	setIcon(iconEl, "folder");

	// 	// Project name
	// 	const nameEl = itemEl.createDiv({ cls: "tree-item-name" });
	// 	nameEl.setText(name);

	// 	// Project task count
	// 	const countEl = itemEl.createDiv({ cls: "tree-item-count" });

	// 	// Count tasks for this project
	// 	const projectTasks = tasks.filter((task) => task.project === project);
	// 	countEl.setText(projectTasks.length.toString());

	// 	// Add click handler to select this project
	// 	this.registerDomEvent(itemEl, "click", () => {
	// 		this.selectProject(project);
	// 	});
	// }

	// public selectProject(project: string) {
	// 	// Update selected project
	// 	this.selectedProject = project;

	// 	// Update UI to show this project is selected
	// 	const projectEls = this.projectTreeEl.querySelectorAll(".tree-item");
	// 	projectEls.forEach((el) => {
	// 		if (el.getAttribute("data-project") === project) {
	// 			el.classList.add("selected");
	// 		} else {
	// 			el.classList.remove("selected");
	// 		}
	// 	});

	// 	// Set view mode to projects and notify parent
	// 	this.setViewMode("projects");

	// 	// Trigger the callback
	// 	if (this.onProjectSelected) {
	// 		this.onProjectSelected(project);
	// 	}
	// }

	public setViewMode(mode: ViewMode) {
		this.selectedViewMode = mode;

		// Update sidebar active item
		const navItems = this.containerEl.querySelectorAll(".sidebar-nav-item");
		navItems.forEach((el) => {
			const isSelected = el.getAttribute("data-view") === mode;
			if (isSelected) {
				el.classList.add("selected");
			} else {
				el.classList.remove("selected");
			}
		});

		// Trigger the callback
		if (this.onViewModeChanged) {
			this.onViewModeChanged(mode);
		}
	}

	public setCollapsed(collapsed: boolean) {
		this.isCollapsed = collapsed;
		this.containerEl.toggleClass("collapsed", collapsed);

		// When collapsed, hide all text elements and tree
		if (collapsed) {
			this.projectTreeEl.hide();

			// Hide text elements
			const textEls = this.navEl.querySelectorAll(".sidebar-nav-text");
			textEls.forEach((el) => el.addClass("hidden"));
		} else {
			this.projectTreeEl.show();

			// Show text elements
			const textEls = this.navEl.querySelectorAll(".sidebar-nav-text");
			textEls.forEach((el) => el.removeClass("hidden"));
		}
	}

	public getSelectedProject(): string | null {
		return this.selectedProject;
	}

	public getSelectedViewMode(): ViewMode {
		return this.selectedViewMode;
	}

	onunload() {
		this.containerEl.empty();
		this.containerEl.remove();
	}
}
