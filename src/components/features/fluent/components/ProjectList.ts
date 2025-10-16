import { Component, Platform, setIcon, Menu, Modal, App } from "obsidian";
import TaskProgressBarPlugin from "@/index";
import { Task } from "@/types/task";
import {
	ProjectPopover,
	ProjectModal,
	EditProjectModal,
} from "./ProjectPopover";
import type { CustomProject } from "@/common/setting-definition";
import { t } from "@/translations/helper";
import { onWorkspaceSwitched } from "@/components/features/fluent/events/ui-event";

interface Project {
	id: string;
	name: string;
	displayName?: string;
	color: string;
	taskCount: number;
	createdAt?: number;
	updatedAt?: number;
	isVirtual?: boolean; // Flag for intermediate nodes
}

interface ProjectTreeNode {
	project: Project;
	children: ProjectTreeNode[];
	level: number;
	parent?: ProjectTreeNode;
	expanded: boolean;
	path: string[];
	fullPath: string;
}

type SortOption =
	| "name-asc"
	| "name-desc"
	| "tasks-asc"
	| "tasks-desc"
	| "created-asc"
	| "created-desc";

export class ProjectList extends Component {
	private containerEl: HTMLElement;
	private plugin: TaskProgressBarPlugin;
	private projects: Project[] = [];
	private activeProjectId: string | null = null;
	private onProjectSelect: (projectId: string) => void;
	private currentPopover: ProjectPopover | null = null;
	private currentSort: SortOption = "name-asc";
	private readonly STORAGE_KEY = "task-genius-project-sort";
	private readonly EXPANDED_KEY = "task-genius-project-expanded";
	private collator: Intl.Collator;
	private isTreeView = false;
	private expandedNodes: Set<string> = new Set();
	private treeNodes: ProjectTreeNode[] = [];

	constructor(
		containerEl: HTMLElement,
		plugin: TaskProgressBarPlugin,
		onProjectSelect: (projectId: string) => void,
		isTreeView = false
	) {
		super();
		this.containerEl = containerEl;
		this.plugin = plugin;
		this.onProjectSelect = onProjectSelect;
		this.isTreeView = isTreeView;

		// Initialize collator with locale-sensitive sorting
		// Use numeric option to handle numbers naturally (e.g., "Project 2" < "Project 10")
		this.collator = new Intl.Collator(undefined, {
			numeric: true,
			sensitivity: "base", // Case-insensitive comparison
		});
	}

	async onload() {
		await this.loadSortPreference();
		await this.loadExpandedNodes();
		await this.loadProjects();
		this.render();

		// Listen for workspace switches to refresh the project list
		this.registerEvent(
			onWorkspaceSwitched(this.plugin.app, () => {
				// Debounce the refresh to allow tasks to load in the new workspace
				this.refreshWithDelay();
			}),
		);
	}

	private refreshTimeoutId: NodeJS.Timeout | null = null;

	private refreshWithDelay() {
		// Clear any pending refresh
		if (this.refreshTimeoutId) {
			clearTimeout(this.refreshTimeoutId);
		}

		// Schedule a refresh with a small delay to allow tasks to load
		this.refreshTimeoutId = setTimeout(() => {
			this.refresh();
			this.refreshTimeoutId = null;
		}, 100);
	}

	onunload() {
		// Clean up any pending refresh timeout
		if (this.refreshTimeoutId) {
			clearTimeout(this.refreshTimeoutId);
			this.refreshTimeoutId = null;
		}

		// Clean up any open popover
		if (this.currentPopover) {
			this.removeChild(this.currentPopover);
			this.currentPopover = null;
		}

		// Clear container
		this.containerEl.empty();
	}

	private async loadProjects() {
		let tasks: Task[] = [];
		if (this.plugin.dataflowOrchestrator) {
			const queryAPI = this.plugin.dataflowOrchestrator.getQueryAPI();
			tasks = await queryAPI.getAllTasks();
		} else {
			tasks = this.plugin.preloadedTasks || [];
		}
		const projectMap = new Map<string, Project>();

		tasks.forEach((task: Task) => {
			const projectName = task.metadata?.project;
			if (projectName) {
				if (!projectMap.has(projectName)) {
					// Convert dashes back to spaces for display
					const displayName = projectName.replace(/-/g, " ");
					projectMap.set(projectName, {
						id: projectName,
						name: projectName,
						displayName: displayName,
						color: this.generateColorForProject(projectName),
						taskCount: 0,
					});
				}
				const project = projectMap.get(projectName);
				if (project) {
					project.taskCount++;
				}
			}
		});

		this.projects = Array.from(projectMap.values());

		// Load custom projects
		this.loadCustomProjects();

		// Apply sorting
		this.sortProjects();

		// Build tree structure if in tree view
		if (this.isTreeView) {
			this.buildTreeStructure();
		}

		this.render();
	}

	private async loadSortPreference() {
		const saved = await this.plugin.app.loadLocalStorage(this.STORAGE_KEY);
		if (saved && this.isValidSortOption(saved)) {
			this.currentSort = saved as SortOption;
		}
	}

	private async saveSortPreference() {
		await this.plugin.app.saveLocalStorage(
			this.STORAGE_KEY,
			this.currentSort
		);
	}

	private isValidSortOption(value: string): boolean {
		return [
			"name-asc",
			"name-desc",
			"tasks-asc",
			"tasks-desc",
			"created-asc",
			"created-desc",
		].includes(value);
	}

	private async loadExpandedNodes() {
		const saved = await this.plugin.app.loadLocalStorage(this.EXPANDED_KEY);
		if (saved && Array.isArray(saved)) {
			this.expandedNodes = new Set(saved);
		}
	}

	private async saveExpandedNodes() {
		await this.plugin.app.saveLocalStorage(
			this.EXPANDED_KEY,
			Array.from(this.expandedNodes)
		);
	}

	public setViewMode(isTreeView: boolean) {
		this.isTreeView = isTreeView;
		this.render();
	}

	private sortProjects() {
		this.projects.sort((a, b) => {
			switch (this.currentSort) {
				case "name-asc":
					return this.collator.compare(
						a.displayName || a.name,
						b.displayName || b.name
					);
				case "name-desc":
					return this.collator.compare(
						b.displayName || b.name,
						a.displayName || a.name
					);
				case "tasks-asc":
					return a.taskCount - b.taskCount;
				case "tasks-desc":
					return b.taskCount - a.taskCount;
				case "created-asc":
					return (a.createdAt || 0) - (b.createdAt || 0);
				case "created-desc":
					return (b.createdAt || 0) - (a.createdAt || 0);
				default:
					return 0;
			}
		});
	}

	private buildTreeStructure() {
		const nodeMap = new Map<string, ProjectTreeNode>();
		const rootNodes: ProjectTreeNode[] = [];
		const separator = this.plugin.settings.projectPathSeparator || "/";

		// Process each project and create intermediate nodes as needed
		this.projects.forEach((project) => {
			const segments = this.parseProjectPath(project.name);
			if (segments.length === 0) return;

			let currentPath = "";
			let parentNode: ProjectTreeNode | undefined;

			// Create or get nodes for each segment in the path
			for (let i = 0; i < segments.length; i++) {
				const segment = segments[i];
				const isLeaf = i === segments.length - 1;

				// Build the full path up to this segment
				currentPath = currentPath
					? `${currentPath}${separator}${segment}`
					: segment;

				// Check if node already exists
				let node = nodeMap.get(currentPath);

				if (!node) {
					// Create node - use actual project for leaf, virtual for intermediate
					const nodeProject = isLeaf
						? project
						: {
							id: currentPath,
							name: currentPath,
							displayName: segment,
							color: this.generateColorForProject(
								currentPath
							),
							taskCount: 0,
							isVirtual: true,
						};

					node = {
						project: nodeProject,
						children: [],
						level: i,
						expanded: this.expandedNodes.has(currentPath),
						path: segments.slice(0, i + 1),
						fullPath: currentPath,
						parent: parentNode,
					};

					nodeMap.set(currentPath, node);

					// Add to parent's children or root
					if (parentNode) {
						parentNode.children.push(node);
					} else {
						rootNodes.push(node);
					}
				} else if (isLeaf && node.project.isVirtual) {
					// Update virtual node with actual project data
					node.project = project;
				}

				parentNode = node;
			}
		});

		// Sort tree nodes recursively
		this.sortTreeNodes(rootNodes);
		this.treeNodes = rootNodes;

		// Update task counts for parent nodes
		this.updateParentTaskCounts(rootNodes);
	}

	private parseProjectPath(projectName: string): string[] {
		// Parse project path using / as separator
		// For example: "parent/child" becomes ["parent", "child"]
		const separator = this.plugin.settings.projectPathSeparator || "/";
		if (!projectName || !projectName.trim()) {
			return [];
		}

		// Normalize the path by trimming and removing duplicate separators
		const normalized = projectName
			.trim()
			.replace(
				new RegExp(`${this.escapeRegExp(separator)}+`, "g"),
				separator
			)
			.replace(
				new RegExp(
					`^${this.escapeRegExp(separator)}|${this.escapeRegExp(
						separator
					)}$`,
					"g"
				),
				""
			);

		if (!normalized) {
			return [];
		}

		return normalized.split(separator);
	}

	private escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	private sortTreeNodes(nodes: ProjectTreeNode[]) {
		nodes.forEach((node) => {
			if (node.children.length > 0) {
				this.sortTreeNodes(node.children);
			}
		});

		nodes.sort((a, b) => {
			switch (this.currentSort) {
				case "name-asc":
					return this.collator.compare(
						a.project.displayName || a.project.name,
						b.project.displayName || b.project.name
					);
				case "name-desc":
					return this.collator.compare(
						b.project.displayName || b.project.name,
						a.project.displayName || a.project.name
					);
				case "tasks-asc":
					return a.project.taskCount - b.project.taskCount;
				case "tasks-desc":
					return b.project.taskCount - a.project.taskCount;
				case "created-asc":
					return (
						(a.project.createdAt || 0) - (b.project.createdAt || 0)
					);
				case "created-desc":
					return (
						(b.project.createdAt || 0) - (a.project.createdAt || 0)
					);
				default:
					return 0;
			}
		});
	}

	private updateParentTaskCounts(nodes: ProjectTreeNode[]) {
		nodes.forEach((node) => {
			if (node.children.length > 0) {
				this.updateParentTaskCounts(node.children);
				// Sum up child task counts
				const childTotal = node.children.reduce(
					(sum, child) => sum + child.project.taskCount,
					0
				);
				// For virtual nodes, set count to child total
				// For real nodes, add child total to existing count
				if (node.project.isVirtual) {
					node.project.taskCount = childTotal;
				} else {
					node.project.taskCount =
						node.project.taskCount + childTotal;
				}
			}
		});
	}

	private toggleNodeExpanded(nodePath: string) {
		if (this.expandedNodes.has(nodePath)) {
			this.expandedNodes.delete(nodePath);
		} else {
			this.expandedNodes.add(nodePath);
		}
		this.saveExpandedNodes();
		this.render();
	}

	private generateColorForProject(projectName: string): string {
		const colors = [
			"#e74c3c",
			"#3498db",
			"#2ecc71",
			"#f39c12",
			"#9b59b6",
			"#1abc9c",
			"#34495e",
			"#e67e22",
		];

		let hash = 0;
		for (let i = 0; i < projectName.length; i++) {
			hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
		}

		return colors[Math.abs(hash) % colors.length];
	}

	private render() {
		this.containerEl.empty();
		this.containerEl.addClass("fluent-project-list");
		if (this.isTreeView) {
			this.containerEl.addClass("is-tree-view");
		} else {
			this.containerEl.removeClass("is-tree-view");
		}

		const scrollArea = this.containerEl.createDiv({
			cls: "fluent-project-scroll",
		});

		if (this.isTreeView) {
			// Build tree structure first
			this.buildTreeStructure();
			// Render tree view
			this.renderTreeNodes(scrollArea, this.treeNodes, 0);
		} else {
			// Render flat list view
			this.projects.forEach((project) => {
				this.renderProjectItem(scrollArea, project, 0, false);
			});
		}

		// Add new project button
		const addProjectBtn = scrollArea.createDiv({
			cls: "fluent-project-item fluent-add-project",
		});

		const addIcon = addProjectBtn.createDiv({
			cls: "fluent-project-add-icon",
		});
		addIcon.createDiv({cls: "fluent-project-color-dashed"});

		addProjectBtn.createSpan({
			cls: "fluent-project-name",
			text: t("Add Project"),
		});

		this.registerDomEvent(addProjectBtn, "click", () => {
			this.handleAddProject(addProjectBtn);
		});
	}

	private renderTreeNodes(
		container: HTMLElement,
		nodes: ProjectTreeNode[],
		level: number
	) {
		nodes.forEach((node) => {
			const hasChildren = node.children.length > 0;
			this.renderProjectItem(
				container,
				node.project,
				level,
				hasChildren,
				node
			);

			if (hasChildren && node.expanded) {
				this.renderTreeNodes(container, node.children, level + 1);
			}
		});
	}

	private renderProjectItem(
		container: HTMLElement,
		project: Project,
		level: number,
		hasChildren: boolean,
		treeNode?: ProjectTreeNode
	) {
		const projectItem = container.createDiv({
			cls: "fluent-project-item",
			attr: {
				"data-project-id": project.id,
				"data-level": String(level),
			},
		});

		// Add virtual class for styling
		if (project.isVirtual) {
			projectItem.addClass("is-virtual");
		}

		if (this.activeProjectId === project.id) {
			projectItem.addClass("is-active");
		}

		if (this.isTreeView && level > 0) {
			projectItem.style.paddingLeft = `${level * 20 + 8}px`;
		}

		// Expand/collapse chevron for tree view
		if (this.isTreeView && hasChildren) {
			const chevron = projectItem.createDiv({
				cls: "fluent-project-chevron",
			});
			const isExpanded = treeNode?.expanded || false;
			setIcon(chevron, isExpanded ? "chevron-down" : "chevron-right");

			this.registerDomEvent(chevron, "click", (e: MouseEvent) => {
				e.stopPropagation();
				// Use fullPath for virtual nodes
				const nodeId = treeNode?.fullPath || project.id;
				this.toggleNodeExpanded(nodeId);
			});
		} else if (this.isTreeView) {
			// Add spacer for items without children to align them
			projectItem.createDiv({cls: "fluent-project-chevron-spacer"});
		}

		const projectColor = projectItem.createDiv({
			cls: "fluent-project-color",
		});
		projectColor.style.backgroundColor = project.color;

		// In tree view, show only the last segment of the path
		// In list view, show the full name
		let displayText: string;
		if (this.isTreeView) {
			if (project.isVirtual) {
				// Virtual nodes already have displayName as the segment
				displayText = project.displayName || project.name;
			} else {
				// For real projects, extract the last segment
				const separator =
					this.plugin.settings.projectPathSeparator || "/";
				const nameToSplit = project.name;
				const segments = nameToSplit.split(separator);
				const lastSegment =
					segments[segments.length - 1] || project.name;

				// If project has a custom displayName, try to preserve it
				// but still show only the relevant part for the tree level
				if (
					project.displayName &&
					project.displayName !== project.name
				) {
					const displaySegments =
						project.displayName.split(separator);
					displayText =
						displaySegments[displaySegments.length - 1] ||
						lastSegment;
				} else {
					displayText = lastSegment;
				}
			}
		} else {
			// In list view, show full name or custom displayName
			displayText = project.displayName || project.name;
		}

		const projectName = projectItem.createSpan({
			cls: "fluent-project-name",
			text: displayText,
		});

		const projectCount = projectItem.createSpan({
			cls: "fluent-project-count",
			text: String(project.taskCount),
		});

		this.registerDomEvent(projectItem, "click", (e: MouseEvent) => {
			// Don't trigger if clicking on chevron
			if (!(e.target as HTMLElement).closest(".fluent-project-chevron")) {
				// Virtual nodes select all their children
				if (project.isVirtual && treeNode) {
					this.selectVirtualNode(treeNode);
				} else {
					this.setActiveProject(project.id);
					this.onProjectSelect(project.id);
				}
			}
		});

		// Add context menu handler (only for non-virtual projects)
		if (!project.isVirtual) {
			this.registerDomEvent(
				projectItem,
				"contextmenu",
				(e: MouseEvent) => {
					e.preventDefault();
					this.showProjectContextMenu(e, project);
				}
			);
		}
	}

	private selectVirtualNode(node: ProjectTreeNode) {
		// Collect all non-virtual descendant project IDs
		const projectIds: string[] = [];
		const collectProjects = (n: ProjectTreeNode) => {
			if (!n.project.isVirtual) {
				projectIds.push(n.project.id);
			}
			n.children.forEach((child) => collectProjects(child));
		};
		collectProjects(node);

		// Select the first real project if any
		if (projectIds.length > 0) {
			this.setActiveProject(projectIds[0]);
			this.onProjectSelect(projectIds[0]);
		}
	}

	public setActiveProject(projectId: string | null) {
		this.activeProjectId = projectId;

		this.containerEl
			.querySelectorAll(".fluent-project-item")
			.forEach((el) => {
				el.removeClass("is-active");
			});

		if (projectId) {
			const activeEl = this.containerEl.querySelector(
				`[data-project-id="${projectId}"]`
			);
			if (activeEl) {
				activeEl.addClass("is-active");
			}
		}
	}

	public getProjects() {
		return this.projects;
	}

	public refresh() {
		this.loadProjects();
	}

	private handleAddProject(buttonEl: HTMLElement) {
		// Clean up any existing popover
		if (this.currentPopover) {
			this.removeChild(this.currentPopover);
			this.currentPopover = null;
		}

		if (Platform.isPhone) {
			// Mobile: Use Obsidian Modal
			const modal = new ProjectModal(
				this.plugin.app,
				this.plugin,
				async (project) => {
					await this.saveProject(project);
				}
			);
			modal.open();
		} else {
			// Desktop: Use popover
			this.currentPopover = new ProjectPopover(
				this.plugin,
				buttonEl,
				async (project) => {
					await this.saveProject(project);
					if (this.currentPopover) {
						this.removeChild(this.currentPopover);
						this.currentPopover = null;
					}
				},
				() => {
					if (this.currentPopover) {
						this.removeChild(this.currentPopover);
						this.currentPopover = null;
					}
				}
			);
			this.addChild(this.currentPopover);
		}
	}

	private async saveProject(project: CustomProject) {
		// Initialize customProjects if it doesn't exist
		if (!this.plugin.settings.projectConfig) {
			this.plugin.settings.projectConfig = {
				enableEnhancedProject: false,
				pathMappings: [],
				metadataConfig: {
					metadataKey: "project",
					enabled: false,
				},
				configFile: {
					fileName: "project.md",
					searchRecursively: true,
					enabled: false,
				},
				metadataMappings: [],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
				customProjects: [],
			};
		}

		if (!this.plugin.settings.projectConfig.customProjects) {
			this.plugin.settings.projectConfig.customProjects = [];
		}

		// Add the new project
		this.plugin.settings.projectConfig.customProjects.push(project);

		// Save settings
		await this.plugin.saveSettings();

		// Refresh the project list
		this.loadProjects();
	}

	private loadCustomProjects() {
		const customProjects =
			this.plugin.settings.projectConfig?.customProjects || [];

		// Merge custom projects into the projects array
		customProjects.forEach((customProject) => {
			// Check if project already exists by name
			const existingIndex = this.projects.findIndex(
				(p) => p.name === customProject.name
			);

			if (existingIndex === -1) {
				// Add new custom project
				this.projects.push({
					id: customProject.id,
					name: customProject.name,
					displayName:
						customProject.displayName || customProject.name,
					color: customProject.color,
					taskCount: 0, // Will be updated by task counting
					createdAt: customProject.createdAt,
					updatedAt: customProject.updatedAt,
				});
			} else {
				// Update existing project with custom color
				this.projects[existingIndex].id = customProject.id;
				this.projects[existingIndex].color = customProject.color;
				this.projects[existingIndex].displayName =
					customProject.displayName || customProject.name;
				this.projects[existingIndex].createdAt =
					customProject.createdAt;
				this.projects[existingIndex].updatedAt =
					customProject.updatedAt;
			}
		});
	}

	private showSortMenu(buttonEl: HTMLElement) {
		const menu = new Menu();

		const sortOptions: {
			label: string;
			value: SortOption;
			icon: string;
		}[] = [
			{label: t("Name (A-Z)"), value: "name-asc", icon: "arrow-up-a-z"},
			{
				label: t("Name (Z-A)"),
				value: "name-desc",
				icon: "arrow-down-a-z",
			},
			{
				label: t("Tasks (Low to High)"),
				value: "tasks-asc",
				icon: "arrow-up-1-0",
			},
			{
				label: t("Tasks (High to Low)"),
				value: "tasks-desc",
				icon: "arrow-down-1-0",
			},
			{
				label: t("Created (Oldest First)"),
				value: "created-asc",
				icon: "clock",
			},
			{
				label: t("Created (Newest First)"),
				value: "created-desc",
				icon: "history",
			},
		];

		sortOptions.forEach((option) => {
			menu.addItem((item) => {
				item.setTitle(option.label)
					.setIcon(option.icon)
					.onClick(async () => {
						this.currentSort = option.value;
						await this.saveSortPreference();
						this.sortProjects();
						this.render();
					});
				if (this.currentSort === option.value) {
					item.setChecked(true);
				}
			});
		});

		menu.showAtMouseEvent(
			new MouseEvent("click", {
				view: window,
				bubbles: true,
				cancelable: true,
				clientX: buttonEl.getBoundingClientRect().left,
				clientY: buttonEl.getBoundingClientRect().bottom,
			})
		);
	}

	private showProjectContextMenu(event: MouseEvent, project: Project) {
		const menu = new Menu();

		// Check if this is a custom project
		const isCustomProject =
			this.plugin.settings.projectConfig?.customProjects?.some(
				(cp) => cp.id === project.id || cp.name === project.name
			);

		// Edit Project option
		menu.addItem((item) => {
			item.setTitle(t("Edit Project")).setIcon("edit");

			if (isCustomProject) {
				item.onClick(() => {
					this.editProject(project);
				});
			} else {
				item.setDisabled(true);
			}
		});

		// Delete Project option
		menu.addItem((item) => {
			item.setTitle(t("Delete Project")).setIcon("trash");

			if (isCustomProject) {
				item.onClick(() => {
					this.deleteProject(project);
				});
			} else {
				item.setDisabled(true);
			}
		});

		menu.showAtMouseEvent(event);
	}

	private editProject(project: Project) {
		// Find the custom project data
		let customProject =
			this.plugin.settings.projectConfig?.customProjects?.find(
				(cp) => cp.id === project.id || cp.name === project.name
			);

		if (!customProject) {
			// Create a new custom project entry if it doesn't exist
			customProject = {
				id: project.id,
				name: project.name,
				displayName: project.displayName || project.name,
				color: project.color,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
		}

		// Open edit modal
		const modal = new EditProjectModal(
			this.plugin.app,
			this.plugin,
			customProject,
			async (updatedProject) => {
				await this.updateProject(updatedProject);
			}
		);
		modal.open();
	}

	private async updateProject(updatedProject: CustomProject) {
		// Initialize if needed
		if (!this.plugin.settings.projectConfig) {
			this.plugin.settings.projectConfig = {
				enableEnhancedProject: false,
				pathMappings: [],
				metadataConfig: {
					metadataKey: "project",
					enabled: false,
				},
				configFile: {
					fileName: "project.md",
					searchRecursively: true,
					enabled: false,
				},
				metadataMappings: [],
				defaultProjectNaming: {
					strategy: "filename",
					stripExtension: true,
					enabled: false,
				},
				customProjects: [],
			};
		}

		if (!this.plugin.settings.projectConfig.customProjects) {
			this.plugin.settings.projectConfig.customProjects = [];
		}

		// Find and update the project
		const index =
			this.plugin.settings.projectConfig.customProjects.findIndex(
				(cp) => cp.id === updatedProject.id
			);

		if (index !== -1) {
			this.plugin.settings.projectConfig.customProjects[index] =
				updatedProject;
		} else {
			this.plugin.settings.projectConfig.customProjects.push(
				updatedProject
			);
		}

		// Save settings
		await this.plugin.saveSettings();

		// Refresh the project list
		this.loadProjects();
	}

	private deleteProject(project: Project) {
		// Confirm deletion
		const modal = new (class extends Modal {
			private onConfirm: () => void;

			constructor(app: App, onConfirm: () => void) {
				super(app);
				this.onConfirm = onConfirm;
			}

			onOpen() {
				const {contentEl} = this;
				contentEl.createEl("h2", {text: t("Delete Project")});
				contentEl.createEl("p", {
					text: t(
						`Are you sure you want to delete "${
							project.displayName || project.name
						}"?`
					),
				});
				contentEl.createEl("p", {
					cls: "mod-warning",
					text: t("This action cannot be undone."),
				});

				const buttonContainer = contentEl.createDiv({
					cls: "modal-button-container",
				});

				const cancelBtn = buttonContainer.createEl("button", {
					text: t("Cancel"),
				});
				cancelBtn.addEventListener("click", () => this.close());

				const confirmBtn = buttonContainer.createEl("button", {
					text: t("Delete"),
					cls: "mod-warning",
				});
				confirmBtn.addEventListener("click", () => {
					this.onConfirm();
					this.close();
				});
			}

			onClose() {
				const {contentEl} = this;
				contentEl.empty();
			}
		})(this.plugin.app, async () => {
			// Remove from custom projects
			if (this.plugin.settings.projectConfig?.customProjects) {
				const index =
					this.plugin.settings.projectConfig.customProjects.findIndex(
						(cp) => cp.id === project.id || cp.name === project.name
					);

				if (index !== -1) {
					this.plugin.settings.projectConfig.customProjects.splice(
						index,
						1
					);
					await this.plugin.saveSettings();

					// If this was the active project, clear selection
					if (this.activeProjectId === project.id) {
						this.setActiveProject(null);
						this.onProjectSelect("");
					}

					// Refresh the project list
					this.loadProjects();
				}
			}
		});

		modal.open();
	}
}
