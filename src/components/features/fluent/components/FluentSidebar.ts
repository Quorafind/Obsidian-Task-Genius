import {
	App,
	Component,
	setIcon,
	Menu,
	Notice,
	Modal,
	Platform,
} from "obsidian";
import { WorkspaceSelector } from "./WorkspaceSelector";
import {
	Project,
	ProjectList,
} from "@/components/features/fluent/components/ProjectList";
import { FluentTaskNavigationItem } from "@/types/fluent-types";
import { WorkspaceData } from "@/types/workspace";
import {
	onWorkspaceSwitched,
	onWorkspaceDeleted,
	onWorkspaceCreated,
} from "@/components/features/fluent/events/ui-event";
import TaskProgressBarPlugin from "@/index";
import { t } from "@/translations/helper";
import { ViewConfigModal } from "@/components/features/task/view/modals/ViewConfigModal";
import { TASK_SPECIFIC_VIEW_TYPE } from "@/pages/TaskSpecificView";
import { ViewConfig, ViewFilterRule } from "@/common/setting-definition";
import { Events, on } from "@/dataflow/events/Events";

export class FluentSidebar extends Component {
	private containerEl: HTMLElement;
	private plugin: TaskProgressBarPlugin;
	private workspaceSelector: WorkspaceSelector;
	public projectList: ProjectList;
	private collapsed = false;
	private currentWorkspaceId: string;
	private isTreeView = false;
	private otherViewsSection: HTMLElement | null = null;
	private railEl: HTMLElement | null = null;

	private primaryItems: FluentTaskNavigationItem[] = [
		{ id: "inbox", label: t("Inbox"), icon: "inbox", type: "primary" },
		{
			id: "today",
			label: t("Today"),
			icon: "calendar-days",
			type: "primary",
		},
		{
			id: "upcoming",
			label: t("Upcoming"),
			icon: "calendar",
			type: "primary",
		},
		{ id: "flagged", label: t("Flagged"), icon: "flag", type: "primary" },
	];

	private otherItems: FluentTaskNavigationItem[] = [];

	constructor(
		containerEl: HTMLElement,
		plugin: TaskProgressBarPlugin,
		private onNavigate: (viewId: string) => void,
		private onProjectSelect: (projectId: string) => void,
		collapsed = false,
	) {
		super();
		this.containerEl = containerEl;
		this.plugin = plugin;
		this.collapsed = collapsed;
		this.currentWorkspaceId =
			plugin.workspaceManager?.getActiveWorkspace().id || "";
	}

	private isViewVisible(viewId: string): boolean {
		const manager = this.plugin.workspaceManager;
		if (!manager) return true;
		const workspaceId =
			this.currentWorkspaceId || manager.getActiveWorkspace()?.id;
		return !manager.isViewHidden(viewId, workspaceId);
	}

	private render() {
		this.containerEl.empty();
		this.containerEl.addClass("fluent-sidebar");
		this.containerEl.toggleClass("is-collapsed", this.collapsed);

		// Desktop: show rail mode when collapsed
		// Mobile: always render full sidebar (CSS handles visibility)
		if (this.collapsed && !Platform.isPhone) {
			this.railEl = this.containerEl.createDiv({
				cls: "fluent-sidebar-rail",
			});
			this.renderRailMode();
			return;
		}

		// Header with workspace selector and new task button
		const header = this.containerEl.createDiv({
			cls: "fluent-sidebar-header",
		});

		const workspaceSelectorEl = header.createDiv();
		if (this.plugin.workspaceManager) {
			this.workspaceSelector = new WorkspaceSelector(
				workspaceSelectorEl,
				this.plugin,
				(workspaceId: string) =>
					this.handleWorkspaceChange(workspaceId),
			);
		}

		// New Task Button
		const newTaskBtn = header.createEl("button", {
			cls: "fluent-new-task-btn",
		});
		setIcon(newTaskBtn.createDiv({ cls: "fluent-new-task-icon" }), "plus");
		newTaskBtn.createDiv({
			cls: "fluent-new-task-text",
			text: t("New Task"),
		});
		this.registerDomEvent(newTaskBtn, "click", () =>
			this.onNavigate("new-task"),
		);

		// Main navigation area
		const content = this.containerEl.createDiv({
			cls: "fluent-sidebar-content",
		});

		// Primary navigation section
		const primarySection = content.createDiv({
			cls: "fluent-sidebar-section",
		});
		this.renderNavigationItems(primarySection, this.primaryItems);

		// Projects section
		const isProjectsHidden =
			this.plugin.workspaceManager?.isSidebarComponentHidden(
				"projects-list",
			);

		if (!isProjectsHidden) {
			const projectsSection = content.createDiv({
				cls: "fluent-sidebar-section",
			});
			const projectHeader = projectsSection.createDiv({
				cls: "fluent-section-header",
			});

			projectHeader.createSpan({ text: t("Projects") });

			// Button container for tree toggle and sort
			const buttonContainer = projectHeader.createDiv({
				cls: "fluent-project-header-buttons",
			});

			// Tree/List toggle button
			const treeToggleBtn = buttonContainer.createDiv({
				cls: "fluent-tree-toggle-btn",
				attr: { "aria-label": t("Toggle tree/list view") },
			});
			// Load saved view mode preference
			this.isTreeView =
				this.plugin.app.loadLocalStorage(
					"task-genius-project-view-mode",
				) === "tree";
			setIcon(treeToggleBtn, this.isTreeView ? "git-branch" : "list");

			this.registerDomEvent(treeToggleBtn, "click", () => {
				this.isTreeView = !this.isTreeView;
				setIcon(treeToggleBtn, this.isTreeView ? "git-branch" : "list");
				// Save preference
				this.plugin.app.saveLocalStorage(
					"task-genius-project-view-mode",
					this.isTreeView ? "tree" : "list",
				);
				// Update project list view mode
				if (this.projectList) {
					(this.projectList as ProjectList).setViewMode?.(
						this.isTreeView,
					);
				}
			});

			// Sort button
			const sortProjectBtn = buttonContainer.createDiv({
				cls: "fluent-sort-project-btn",
				attr: { "aria-label": t("Sort projects") },
			});
			setIcon(sortProjectBtn, "arrow-up-down");

			// Pass sort button to project list for menu handling
			this.registerDomEvent(sortProjectBtn, "click", () => {
				(this.projectList as ProjectList).showSortMenu?.(
					sortProjectBtn,
				);
			});

			const projectListEl = projectsSection.createDiv();
			this.projectList = new ProjectList(
				projectListEl,
				this.plugin,
				this.onProjectSelect,
				this.isTreeView,
			);
			// Add ProjectList as a child component
			this.addChild(this.projectList);
		}

		// Other views section
		const isOtherViewsHidden =
			this.plugin.workspaceManager?.isSidebarComponentHidden(
				"other-views",
			);

		if (!isOtherViewsHidden) {
			this.otherViewsSection = content.createDiv({
				cls: "fluent-sidebar-section",
			});
			this.renderOtherViewsSection();
		}
	}

	private renderRailMode() {
		if (!this.railEl) {
			return;
		}

		// Clear existing content
		this.railEl.empty();

		// Workspace menu button
		const wsBtn = this.railEl.createDiv({
			cls: "fluent-rail-btn",
			attr: { "aria-label": t("Workspace") },
		});
		setIcon(wsBtn, "layers");
		this.registerDomEvent(wsBtn, "click", (e) =>
			this.showWorkspaceMenuWithManager(e as MouseEvent),
		);

		// Primary view icons
		this.primaryItems
			.filter((item) => this.isViewVisible(item.id))
			.forEach((item) => {
				const btn = this.railEl!.createDiv({
					cls: "fluent-rail-btn",
					attr: { "aria-label": item.label, "data-view-id": item.id },
				});
				setIcon(btn, item.icon);
				this.registerDomEvent(btn, "click", () => {
					this.setActiveItem(item.id);
					this.onNavigate(item.id);
				});
				// Add context menu handler for rail button
				this.registerDomEvent(btn, "contextmenu", (e) => {
					this.showViewContextMenu(e as MouseEvent, item.id);
				});
			});

		// Other view icons with overflow menu when > 5
		if (
			!this.plugin.workspaceManager?.isSidebarComponentHidden(
				"other-views",
			)
		) {
			const allOtherItems = this.computeOtherItems();
			const visibleCount =
				this.plugin?.settings?.fluentView?.fluentConfig
					?.maxOtherViewsBeforeOverflow ?? 5;
			const displayedOther: FluentTaskNavigationItem[] =
				allOtherItems.slice(0, visibleCount);
			const remainingOther: FluentTaskNavigationItem[] =
				allOtherItems.slice(visibleCount);

			displayedOther.forEach((item: FluentTaskNavigationItem) => {
				const btn = this.railEl!.createDiv({
					cls: "fluent-rail-btn",
					attr: {
						"aria-label": item.label,
						"data-view-id": item.id,
					},
				});
				setIcon(btn, item.icon);
				this.registerDomEvent(btn, "click", () => {
					this.setActiveItem(item.id);
					this.onNavigate(item.id);
				});
				// Add context menu handler for rail button
				this.registerDomEvent(btn, "contextmenu", (e) => {
					this.showViewContextMenu(e as MouseEvent, item.id);
				});
			});

			if (remainingOther.length > 0) {
				const moreBtn = this.railEl.createDiv({
					cls: "fluent-rail-btn",
					attr: { "aria-label": t("More views") },
				});
				setIcon(moreBtn, "more-horizontal");
				this.registerDomEvent(moreBtn, "click", (e) =>
					this.showOtherViewsMenu(e as MouseEvent, remainingOther),
				);
			}
		}

		// Projects menu button
		if (
			!this.plugin.workspaceManager?.isSidebarComponentHidden(
				"projects-list",
			)
		) {
			const projBtn = this.railEl.createDiv({
				cls: "fluent-rail-btn",
				attr: { "aria-label": t("Projects") },
			});
			setIcon(projBtn, "folder");
			this.registerDomEvent(projBtn, "click", (e) =>
				this.showProjectMenu(e as MouseEvent),
			);
		}

		// Add (New Task) button
		const addBtn = this.railEl.createDiv({
			cls: "fluent-rail-btn",
			attr: { "aria-label": t("New Task") },
		});
		setIcon(addBtn, "plus");
		this.registerDomEvent(addBtn, "click", () =>
			this.onNavigate("new-task"),
		);
	}

	private renderOtherViewsSection() {
		if (!this.otherViewsSection || this.collapsed) {
			return;
		}

		// Clear existing content
		this.otherViewsSection.empty();

		// Create header
		const otherHeader = this.otherViewsSection.createDiv({
			cls: "fluent-section-header",
		});

		const allOtherItems = this.computeOtherItems();
		const visibleCount =
			this.plugin?.settings?.fluentView?.fluentConfig
				?.maxOtherViewsBeforeOverflow ?? 5;
		const displayedOther: FluentTaskNavigationItem[] = allOtherItems.slice(
			0,
			visibleCount,
		);
		const remainingOther: FluentTaskNavigationItem[] =
			allOtherItems.slice(visibleCount);

		otherHeader.createSpan({ text: t("Other Views") });

		if (remainingOther.length > 0) {
			const moreBtn = otherHeader.createDiv({
				cls: "fluent-section-action",
				attr: { "aria-label": t("More views") },
			});
			setIcon(moreBtn, "more-horizontal");
			this.registerDomEvent(moreBtn, "click", (e) =>
				this.showOtherViewsMenu(e as MouseEvent, remainingOther),
			);
		}

		this.renderNavigationItems(this.otherViewsSection, displayedOther);
	}

	private computeOtherItems(): FluentTaskNavigationItem[] {
		try {
			const cfg = this.plugin?.settings?.viewConfiguration;
			if (!Array.isArray(cfg)) return this.otherItems;

			const primaryIds = new Set(this.primaryItems.map((i) => i.id));
			// No longer exclude projects view - users can access it from both Projects list and Other Views
			const excludeIds = new Set<string>([]);
			const seen = new Set<string>();
			const items: FluentTaskNavigationItem[] = [];

			for (const v of cfg) {
				if (!v || v.visible === false) continue;
				const id = String(v.id);
				if (primaryIds.has(id) || excludeIds.has(id)) continue;
				if (seen.has(id)) continue;
				items.push({
					id,
					label: v.name || id,
					icon: v.icon || "list-plus",
					type: "other",
				});
				seen.add(id);
			}

			const result = items.length ? items : this.otherItems;
			return result.filter((item) => this.isViewVisible(item.id));
		} catch (e) {
			return this.otherItems.filter((item) =>
				this.isViewVisible(item.id),
			);
		}
	}

	onload() {
		// On mobile, ensure we render the full sidebar content
		// even though it starts "collapsed" (hidden off-screen)
		if (Platform.isPhone && this.collapsed) {
			// Temporarily set to not collapsed to render full content
			const wasCollapsed = this.collapsed;
			this.collapsed = false;
			this.render();
			this.collapsed = wasCollapsed;
			// Apply the collapsed class for CSS positioning
			this.containerEl.addClass("is-collapsed");
		} else {
			this.render();
		}

		// Subscribe to workspace events
		if (this.plugin.workspaceManager) {
			this.registerEvent(
				onWorkspaceSwitched(this.plugin.app, (payload) => {
					this.currentWorkspaceId = payload.workspaceId;
					this.render();
				}),
			);

			this.registerEvent(
				onWorkspaceDeleted(this.plugin.app, () => {
					this.render();
				}),
			);

			this.registerEvent(
				onWorkspaceCreated(this.plugin.app, () => {
					this.render();
				}),
			);
		}
	}

	onunload() {
		// Clean up is handled by Component base class
		this.containerEl.empty();
	}

	public setCollapsed(collapsed: boolean) {
		this.collapsed = collapsed;
		// On mobile, don't re-render when toggling collapse
		// The CSS will handle the drawer animation
		if (!Platform.isPhone) {
			this.render();
		} else {
			// Just toggle the class for mobile
			this.containerEl.toggleClass("is-collapsed", collapsed);
		}
	}

	private async handleWorkspaceChange(workspaceId: string) {
		if (this.plugin.workspaceManager) {
			await this.plugin.workspaceManager.setActiveWorkspace(workspaceId);
			this.currentWorkspaceId = workspaceId;
		}
	}

	private showWorkspaceMenuWithManager(event: MouseEvent) {
		if (!this.plugin.workspaceManager) return;

		const menu = new Menu();
		const workspaces = this.plugin.workspaceManager.getAllWorkspaces();
		const currentWorkspace =
			this.plugin.workspaceManager.getActiveWorkspace();

		workspaces.forEach((w) => {
			menu.addItem((item) => {
				const isDefault =
					this.plugin.workspaceManager?.isDefaultWorkspace(w.id);
				const title = isDefault ? `${w.name}` : w.name;

				item.setTitle(title)
					.setIcon("layers")
					.onClick(async () => {
						await this.handleWorkspaceChange(w.id);
					});
				if (w.id === currentWorkspace.id) item.setChecked(true);
			});
		});

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("Create Workspace"))
				.setIcon("plus")
				.onClick(() => this.showCreateWorkspaceDialog());
		});

		menu.showAtMouseEvent(event);
	}

	private showCreateWorkspaceDialog() {
		class CreateWorkspaceModal extends Modal {
			private nameInput: HTMLInputElement;

			constructor(
				private plugin: TaskProgressBarPlugin,
				private onCreated: () => void,
			) {
				super(plugin.app);
			}

			onOpen() {
				const { contentEl } = this;
				contentEl.createEl("h2", { text: t("Create New Workspace") });

				const inputContainer = contentEl.createDiv();
				inputContainer.createEl("label", {
					text: t("Workspace Name:"),
				});
				this.nameInput = inputContainer.createEl("input", {
					type: "text",
					placeholder: t("Enter workspace name..."),
				});

				const buttonContainer = contentEl.createDiv({
					cls: "modal-button-container",
				});
				const createButton = buttonContainer.createEl("button", {
					text: t("Create"),
				});
				const cancelButton = buttonContainer.createEl("button", {
					text: t("Cancel"),
				});

				createButton.addEventListener("click", async () => {
					const name = this.nameInput.value.trim();
					if (name && this.plugin.workspaceManager) {
						await this.plugin.workspaceManager.createWorkspace(
							name,
						);
						new Notice(
							t('Workspace "{{name}}" created', {
								interpolation: {
									name: name,
								},
							}),
						);
						this.onCreated();
						this.close();
					} else {
						new Notice(t("Please enter a workspace name"));
					}
				});

				cancelButton.addEventListener("click", () => {
					this.close();
				});

				this.nameInput.focus();
			}

			onClose() {
				const { contentEl } = this;
				contentEl.empty();
			}
		}

		new CreateWorkspaceModal(this.plugin, () => this.render()).open();
	}

	private showProjectMenu(event: MouseEvent) {
		// Try to use existing project list data; if missing, build a temporary one
		let projects: Project[] = [];
		const anyList: ProjectList = this.projectList as ProjectList;
		if (anyList && typeof anyList.getProjects === "function") {
			projects = anyList.getProjects();
		} else {
			const temp = createDiv();
			const tempList: ProjectList = new ProjectList(
				temp,
				this.plugin,
				this.onProjectSelect,
			);
			if (typeof tempList.getProjects === "function") {
				projects = tempList.getProjects();
			}
		}
		const menu = new Menu();
		projects.forEach((p) => {
			menu.addItem((item) => {
				item.setTitle(p.name)
					.setIcon("folder")
					.onClick(() => {
						this.onProjectSelect(p.filterKey);
					});
			});
		});
		menu.showAtMouseEvent(event);
	}

	private showOtherViewsMenu(
		event: MouseEvent,
		items: FluentTaskNavigationItem[],
	) {
		const menu = new Menu();
		items.forEach((it: FluentTaskNavigationItem) => {
			menu.addItem((mi) => {
				mi.setTitle(it.label)
					.setIcon(it.icon)
					.onClick(() => {
						this.setActiveItem(it.id);
						this.onNavigate(it.id);
					});
			});
		});
		menu.showAtMouseEvent(event);
	}

	private showViewContextMenu(event: MouseEvent, viewId: string) {
		event.preventDefault();
		event.stopPropagation();

		const menu = new Menu();

		// Check if this is a primary view
		const isPrimaryView = this.primaryItems.some(
			(item) => item.id === viewId,
		);

		// Open in new tab
		menu.addItem((item) => {
			item.setTitle(t("Open in new tab"))
				.setIcon("plus-square")
				.onClick(() => {
					const leaf = this.plugin.app.workspace.getLeaf("tab");
					leaf.setViewState({
						type: TASK_SPECIFIC_VIEW_TYPE,
						state: {
							viewId: viewId,
						},
					});
				});
		});

		// Open settings
		menu.addItem((item) => {
			item.setTitle(t("Open settings"))
				.setIcon("settings")
				.onClick(async () => {
					// Special handling for habit view
					if (viewId === "habit") {
						(this.plugin.app as App).setting.open();
						(this.plugin.app as App).setting.openTabById(
							this.plugin.manifest.id,
						);
						setTimeout(() => {
							if (this.plugin.settingTab) {
								this.plugin.settingTab.openTab("habit");
							}
						}, 100);
						return;
					}

					// Normal handling for other views
					const view = this.plugin.settings.viewConfiguration.find(
						(v) => v.id === viewId,
					);
					if (!view) {
						return;
					}
					const currentRules = view?.filterRules || {};
					new ViewConfigModal(
						this.plugin.app,
						this.plugin,
						view,
						currentRules,
						(
							updatedView: ViewConfig,
							updatedRules: ViewFilterRule,
						) => {
							const currentIndex =
								this.plugin.settings.viewConfiguration.findIndex(
									(v) => v.id === updatedView.id,
								);
							if (currentIndex !== -1) {
								this.plugin.settings.viewConfiguration[
									currentIndex
								] = {
									...updatedView,
									filterRules: updatedRules,
								};
								this.plugin.saveSettings();
								// Re-render if visibility changed
								if (view.visible !== updatedView.visible) {
									this.render();
								}
								// Trigger view config changed event
								this.plugin.app.workspace.trigger(
									"task-genius:view-config-changed",
									{ reason: "edit", viewId: viewId },
								);
							}
						},
					).open();
				});
		});

		// Hide in sidebar - only for non-primary views
		if (!isPrimaryView) {
			// Copy view
			menu.addItem((item) => {
				item.setTitle(t("Copy view"))
					.setIcon("copy")
					.onClick(() => {
						const view =
							this.plugin.settings.viewConfiguration.find(
								(v) => v.id === viewId,
							);
						if (!view) {
							return;
						}
						// Create a copy of the current view
						new ViewConfigModal(
							this.plugin.app,
							this.plugin,
							null, // null for create mode
							null, // null for create mode
							(
								createdView: ViewConfig,
								createdRules: ViewFilterRule,
							) => {
								if (
									!this.plugin.settings.viewConfiguration.some(
										(v) => v.id === createdView.id,
									)
								) {
									this.plugin.settings.viewConfiguration.push(
										{
											...createdView,
											filterRules: createdRules,
										},
									);
									this.plugin.saveSettings();
									// Re-render the sidebar to show the new view
									this.render();
									// Trigger view config changed event
									this.plugin.app.workspace.trigger(
										"task-genius:view-config-changed",
										{
											reason: "create",
											viewId: createdView.id,
										},
									);
									new Notice(
										t("View copied successfully: ") +
											createdView.name,
									);
								} else {
									new Notice(
										t("Error: View ID already exists."),
									);
								}
							},
							view, // Pass current view as copy source
							view.id,
						).open();
					});
			});

			menu.addItem((item) => {
				item.setTitle(t("Hide in sidebar"))
					.setIcon("eye-off")
					.onClick(() => {
						const view =
							this.plugin.settings.viewConfiguration.find(
								(v) => v.id === viewId,
							);
						if (!view) {
							return;
						}
						view.visible = false;
						this.plugin.saveSettings();
						// Re-render based on current mode
						if (this.collapsed) {
							this.renderRailMode();
						} else {
							this.renderOtherViewsSection();
						}
						// Trigger view config changed event
						this.plugin.app.workspace.trigger(
							"task-genius:view-config-changed",
							{ reason: "visibility", viewId: viewId },
						);
					});
			});
		}

		// Delete (for custom views only)
		const view = this.plugin.settings.viewConfiguration.find(
			(v) => v.id === viewId,
		);
		if (view?.type === "custom") {
			menu.addSeparator();
			menu.addItem((item) => {
				item.setTitle(t("Delete"))
					.setIcon("trash")
					.setWarning(true)
					.onClick(() => {
						this.plugin.settings.viewConfiguration =
							this.plugin.settings.viewConfiguration.filter(
								(v) => v.id !== viewId,
							);
						this.plugin.saveSettings();
						// Re-render based on current mode
						if (this.collapsed) {
							this.renderRailMode();
						} else {
							this.renderOtherViewsSection();
						}
						// Trigger view config changed event
						this.plugin.app.workspace.trigger(
							"task-genius:view-config-changed",
							{ reason: "delete", viewId: viewId },
						);
						new Notice(t("View deleted: ") + view.name);
					});
			});
		}

		menu.showAtMouseEvent(event);
	}

	private renderNavigationItems(
		containerEl: HTMLElement,
		items: FluentTaskNavigationItem[],
	) {
		const visibleItems = items.filter((item) =>
			this.isViewVisible(item.id),
		);
		if (!visibleItems.length) return;

		const list = containerEl.createDiv({ cls: "fluent-navigation-list" });
		visibleItems.forEach((item) => {
			const itemEl = list.createDiv({
				cls: "fluent-navigation-item",
				attr: { "data-view-id": item.id },
			});
			const icon = itemEl.createDiv({ cls: "fluent-navigation-icon" });
			setIcon(icon, item.icon);
			itemEl.createSpan({
				cls: "fluent-navigation-label",
				text: item.label,
			});
			if (item.badge) {
				itemEl.createDiv({
					cls: "fluent-navigation-badge",
					text: String(item.badge),
				});
			}
			this.registerDomEvent(itemEl, "click", () => {
				this.setActiveItem(item.id);
				this.onNavigate(item.id);
			});
			// Add context menu handler
			this.registerDomEvent(itemEl, "contextmenu", (e) => {
				this.showViewContextMenu(e as MouseEvent, item.id);
			});
		});
	}

	public setActiveItem(viewId: string) {
		// Clear active state from both full navigation items and rail buttons
		this.containerEl
			.querySelectorAll(
				".fluent-navigation-item, .fluent-rail-btn[data-view-id]",
			)
			.forEach((el) => {
				el.removeClass("is-active");
			});
		// Apply to any element that carries this view id (works in both modes)
		const activeEls = this.containerEl.querySelectorAll(
			`[data-view-id="${viewId}"]`,
		);
		activeEls.forEach((el) => el.addClass("is-active"));
	}

	public updateWorkspace(workspaceOrId: string | WorkspaceData) {
		const workspaceId =
			typeof workspaceOrId === "string"
				? workspaceOrId
				: workspaceOrId.id;
		this.currentWorkspaceId = workspaceId;
		this.workspaceSelector?.setWorkspace(workspaceId);
		this.projectList?.refresh();
	}

	/**
	 * Enable or disable project list interaction
	 * Used when showing full projects overview to prevent conflicting navigation
	 */
	public setProjectListEnabled(enabled: boolean) {
		if (!this.projectList) return;
		this.projectList.setEnabled(enabled);
	}
}
