import {
	App,
	ButtonComponent,
	Component,
	ItemView,
	Platform,
	WorkspaceLeaf,
} from "obsidian";
import TaskProgressBarPlugin from "@/index";
import { FluentSidebar } from "../components/FluentSidebar";
import { TaskDetailsComponent } from "@/components/features/task/view/details";
import { Task } from "@/types/task";
import { t } from "@/translations/helper";
import { TG_LEFT_SIDEBAR_VIEW_TYPE } from "../../../../pages/LeftSidebarView";
import { QuickCaptureModal } from "@/components/features/quick-capture/modals/QuickCaptureModal";
import {
	ViewTaskFilterModal,
	ViewTaskFilterPopover,
} from "@/components/features/task/filter";
import { RootFilterState } from "@/components/features/task/filter/ViewTaskFilter";

/**
 * FluentLayoutManager - Manages layout, sidebar, and details panel
 *
 * Responsibilities:
 * - Sidebar toggle (supports both leaves and non-leaves mode)
 * - Details panel visibility (supports both leaves and non-leaves mode)
 * - Mobile drawer management
 * - Responsive layout adjustments
 * - Header buttons (sidebar toggle, task count)
 *
 * KEY ARCHITECTURAL CONSIDERATION:
 * This manager handles TWO distinct modes:
 * 1. Leaves Mode (useWorkspaceSideLeaves: true): Sidebar/Details in separate workspace leaves
 * 2. Non-Leaves Mode: Sidebar/Details embedded in main view
 */
export class FluentLayoutManager extends Component {
	// Layout state
	public isSidebarCollapsed = false;
	public isDetailsVisible = false;
	public isMobileDrawerOpen = false;

	// UI elements
	private sidebarToggleBtn: HTMLElement | null = null;
	private drawerOverlay: HTMLElement | null = null;
	private detailsToggleBtn: HTMLElement | null = null;
	private mobileDetailsOverlayHandler?: (e: MouseEvent) => void;

	// Components (non-leaves mode only)
	public sidebar: FluentSidebar | null = null;
	public detailsComponent: TaskDetailsComponent | null = null;

	// Callbacks
	private onSidebarNavigate?: (viewId: string) => void;
	private onProjectSelect?: (projectId: string) => void;
	private onTaskToggleComplete?: (task: Task) => void;
	private onTaskEdit?: (task: Task) => void;
	private onTaskUpdate?: (
		originalTask: Task,
		updatedTask: Task,
	) => Promise<void>;
	private onFilterReset?: () => void;
	private getLiveFilterState?: () => RootFilterState | null;
	private leaf: WorkspaceLeaf;

	constructor(
		private app: App,
		private plugin: TaskProgressBarPlugin,
		private view: ItemView,
		private rootContainerEl: HTMLElement,
		private headerEl: HTMLElement,
		private titleEl: HTMLElement,
		private getTaskCount: () => number,
	) {
		super();

		this.leaf = view.leaf;
	}

	/**
	 * Set navigation callback
	 */
	setOnSidebarNavigate(callback: (viewId: string) => void): void {
		this.onSidebarNavigate = callback;
	}

	/**
	 * Set project select callback
	 */
	setOnProjectSelect(callback: (projectId: string) => void): void {
		this.onProjectSelect = callback;
	}

	/**
	 * Set task callbacks for details component
	 */
	setTaskCallbacks(callbacks: {
		onTaskToggleComplete: (task: Task) => void;
		onTaskEdit: (task: Task) => void;
		onTaskUpdate: (originalTask: Task, updatedTask: Task) => Promise<void>;
	}): void {
		this.onTaskToggleComplete = callbacks.onTaskToggleComplete;
		this.onTaskEdit = callbacks.onTaskEdit;
		this.onTaskUpdate = callbacks.onTaskUpdate;
	}

	/**
	 * Set filter callbacks
	 */
	setFilterCallbacks(callbacks: {
		onFilterReset: () => void;
		getLiveFilterState: () => RootFilterState | null;
	}): void {
		this.onFilterReset = callbacks.onFilterReset;
		this.getLiveFilterState = callbacks.getLiveFilterState;
	}

	/**
	 * Check if using workspace side leaves mode
	 */
	private useSideLeaves(): boolean {
		return !!this.plugin.settings.fluentView?.useWorkspaceSideLeaves;
	}

	/**
	 * Initialize sidebar (non-leaves mode only)
	 */
	initializeSidebar(containerEl: HTMLElement): void {
		if (this.useSideLeaves()) {
			containerEl.hide();
			console.log(
				"[FluentLayout] Using workspace side leaves: skip in-view sidebar",
			);
			return;
		}

		// On mobile, start with sidebar completely hidden (drawer closed)
		const initialCollapsedState = Platform.isPhone
			? true
			: this.isSidebarCollapsed;

		this.sidebar = new FluentSidebar(
			containerEl,
			this.plugin,
			(viewId) => {
				this.onSidebarNavigate?.(viewId);
				// Auto-close drawer on mobile after navigation
				if (Platform.isPhone) {
					this.closeMobileDrawer();
				}
			},
			(projectId) => {
				this.onProjectSelect?.(projectId);
				// Auto-close drawer on mobile after selection
				if (Platform.isPhone) {
					this.closeMobileDrawer();
				}
			},
			initialCollapsedState,
		);

		// Add sidebar as a child component for proper lifecycle management
		this.addChild(this.sidebar);
	}

	/**
	 * Initialize details component (non-leaves mode only)
	 */
	initializeDetailsComponent(): void {
		if (this.useSideLeaves()) {
			console.log(
				"[FluentLayout] Using workspace side leaves: skip in-view details panel",
			);
			return;
		}

		// Initialize details component (hidden by default)
		this.detailsComponent = new TaskDetailsComponent(
			this.rootContainerEl,
			this.app,
			this.plugin,
		);
		this.addChild(this.detailsComponent);
		this.detailsComponent.load();

		// Set up callbacks
		this.detailsComponent.onTaskToggleComplete = (task: Task) =>
			this.onTaskToggleComplete?.(task);
		this.detailsComponent.onTaskEdit = (task: Task) =>
			this.onTaskEdit?.(task);
		this.detailsComponent.onTaskUpdate = async (
			originalTask: Task,
			updatedTask: Task,
		) => {
			await this.onTaskUpdate?.(originalTask, updatedTask);
		};
		this.detailsComponent.toggleDetailsVisibility = (visible: boolean) => {
			this.toggleDetailsVisibility(visible);
		};
		this.detailsComponent.setVisible(this.isDetailsVisible);
	}

	/**
	 * Create sidebar toggle button in header
	 */
	createSidebarToggle(): void {
		const headerBtns = !Platform.isPhone
			? (this.headerEl?.querySelector(
					".view-header-nav-buttons",
				) as HTMLElement | null)
			: (this.headerEl?.querySelector(
					".view-header-left",
				) as HTMLElement);

		if (!headerBtns) {
			console.warn("[FluentLayout] header buttons container not found");
			return;
		}

		const container = headerBtns.createDiv({
			cls: "panel-toggle-container",
		});

		this.sidebarToggleBtn = container.createDiv({
			cls: "panel-toggle-btn",
		});

		const btn = new ButtonComponent(this.sidebarToggleBtn);
		btn.setIcon(Platform.isPhone ? "menu" : "panel-left-dashed")
			.setTooltip(t("Toggle Sidebar"))
			.setClass("clickable-icon")
			.onClick(() => this.toggleSidebar());
	}

	/**
	 * Create task count mark in title
	 */
	createTaskMark(): void {
		this.updateTaskMark();
	}

	/**
	 * Update task count in title
	 */
	updateTaskMark(): void {
		this.titleEl.setText(
			t("{{num}} Tasks", {
				interpolation: {
					num: this.getTaskCount(),
				},
			}),
		);
	}

	/**
	 * Toggle sidebar visibility
	 * Behavior differs based on mode:
	 * - Leaves mode: Toggle workspace left split
	 * - Non-leaves mode: Toggle internal sidebar component
	 * - Mobile: Toggle drawer overlay
	 */
	toggleSidebar(): void {
		if (this.useSideLeaves()) {
			// In side-leaf mode, toggle the left sidebar split collapse state
			const ws = this.app.workspace;
			const leftSplit = ws.leftSplit;
			const isCollapsed = !!leftSplit?.collapsed;

			if (isCollapsed) {
				// Expand and ensure our sidebar view
				leftSplit.expand();
				// Handle async ensureSideLeaf
				ws.ensureSideLeaf(TG_LEFT_SIDEBAR_VIEW_TYPE, "left", {
					active: false,
				}).then((leftLeaf) => {
					if (leftLeaf) {
						ws.revealLeaf?.(leftLeaf);
					}
				});
			} else {
				leftSplit.collapse();
			}
			return;
		}

		if (Platform.isPhone) {
			// On mobile, toggle the drawer open/closed
			if (this.isMobileDrawerOpen) {
				this.closeMobileDrawer();
			} else {
				this.openMobileDrawer();
			}
		} else {
			// On desktop, toggle collapse state
			this.isSidebarCollapsed = !this.isSidebarCollapsed;
			this.sidebar?.setCollapsed(this.isSidebarCollapsed);
			this.rootContainerEl?.toggleClass(
				"fluent-sidebar-collapsed",
				this.isSidebarCollapsed,
			);
		}
	}

	/**
	 * Open mobile drawer
	 */
	openMobileDrawer(): void {
		this.isMobileDrawerOpen = true;
		this.rootContainerEl?.addClass("drawer-open");
		if (this.drawerOverlay) {
			this.drawerOverlay.show();
		}
		// Show the sidebar
		this.sidebar?.setCollapsed(false);
	}

	/**
	 * Close mobile drawer
	 */
	closeMobileDrawer(): void {
		this.isMobileDrawerOpen = false;
		this.rootContainerEl?.removeClass("drawer-open");
		if (this.drawerOverlay) {
			this.drawerOverlay.hide();
		}
		// Hide the sidebar
		this.sidebar?.setCollapsed(true);
	}

	/**
	 * Set up drawer overlay for mobile
	 */
	setupDrawerOverlay(layoutContainer: HTMLElement): void {
		if (!Platform.isPhone) return;

		this.drawerOverlay = layoutContainer.createDiv({
			cls: "drawer-overlay",
		});
		this.drawerOverlay.hide();
		this.registerDomEvent(
			this.drawerOverlay,
			"click",
			() => {
				this.closeMobileDrawer();
			},
			{
				once: true,
			},
		);
	}

	/**
	 * Toggle details panel visibility
	 * Behavior differs based on mode:
	 * - Leaves mode: Toggle workspace right split
	 * - Non-leaves mode: Toggle internal details component
	 * - Mobile: Overlay with backdrop
	 */
	toggleDetailsVisibility(visible: boolean): void {
		this.isDetailsVisible = visible;

		if (this.useSideLeaves()) {
			// In side-leaf mode, reveal/collapse the right details pane
			const ws = this.app.workspace;
			if (visible) {
				// Try to expand right split if it's collapsed
				if (ws.rightSplit?.collapsed) {
					ws.rightSplit.expand();
				}
			} else {
				ws.rightSplit.collapse();
			}

			// Update header toggle visual state
			if (this.detailsToggleBtn) {
				this.detailsToggleBtn.toggleClass("is-active", visible);
				this.detailsToggleBtn.setAttribute(
					"aria-label",
					visible ? t("Hide Details") : t("Show Details"),
				);
			}
			return;
		}

		// Legacy/in-view mode
		this.rootContainerEl?.toggleClass("details-visible", visible);
		this.rootContainerEl?.toggleClass("details-hidden", !visible);

		if (this.detailsComponent) {
			this.detailsComponent.setVisible(visible);
		}

		if (this.detailsToggleBtn) {
			this.detailsToggleBtn.toggleClass("is-active", visible);
			this.detailsToggleBtn.setAttribute(
				"aria-label",
				visible ? t("Hide Details") : t("Show Details"),
			);
		}

		// On mobile, add click handler to overlay to close details
		if (Platform.isPhone && visible) {
			// Use setTimeout to avoid immediate close on open
			setTimeout(() => {
				const overlayClickHandler = (e: MouseEvent) => {
					// Check if click is on the overlay (pseudo-element area)
					const detailsEl =
						this.rootContainerEl?.querySelector(".task-details");
					if (detailsEl && !detailsEl.contains(e.target as Node)) {
						this.toggleDetailsVisibility(false);
						document.removeEventListener(
							"click",
							overlayClickHandler,
						);
					}
				};
				document.addEventListener("click", overlayClickHandler);
				this.mobileDetailsOverlayHandler = overlayClickHandler;
			}, 100);
		} else if (
			Platform.isPhone &&
			!visible &&
			this.mobileDetailsOverlayHandler
		) {
			document.removeEventListener(
				"click",
				this.mobileDetailsOverlayHandler,
			);
			delete this.mobileDetailsOverlayHandler;
		}
	}

	/**
	 * Store details toggle button reference
	 */
	setDetailsToggleBtn(btn: HTMLElement): void {
		this.detailsToggleBtn = btn;
		this.detailsToggleBtn.toggleClass("is-active", this.isDetailsVisible);
	}

	/**
	 * Check and auto-collapse sidebar on narrow screens (desktop only)
	 */
	checkAndCollapseSidebar(): void {
		// Skip auto-collapse on mobile, as we use drawer mode
		if (Platform.isPhone) {
			return;
		}

		// Auto-collapse on narrow panes (desktop only)
		try {
			const width = this.leaf?.width ?? 0;
			if (width > 0 && width < 768) {
				this.isSidebarCollapsed = true;
				this.sidebar?.setCollapsed(true);
				this.rootContainerEl?.addClass("fluent-sidebar-collapsed");
			}
		} catch (_) {
			// Ignore errors
		}
	}

	/**
	 * Handle window resize
	 */
	onResize(): void {
		// Only check and collapse on desktop
		if (!Platform.isPhone) {
			this.checkAndCollapseSidebar();
		}
	}

	/**
	 * Show task details in details panel
	 */
	showTaskDetails(task: Task): void {
		if (this.useSideLeaves()) {
			// In leaves mode, emit event to side leaf details view
			// This will be handled by the main view's event emission
			return;
		}

		this.detailsComponent?.showTaskDetails(task);
	}

	/**
	 * Set sidebar active item
	 */
	setSidebarActiveItem(viewId: string): void {
		this.sidebar?.setActiveItem(viewId);
	}

	/**
	 * Refresh sidebar project list
	 */
	refreshSidebarProjects(): void {
		this.sidebar?.projectList?.refresh();
	}

	/**
	 * Set active project in sidebar
	 */
	setActiveProject(projectId: string | null): void {
		this.sidebar?.projectList?.setActiveProject(projectId);
	}

	/**
	 * Create action buttons in view header
	 * - Details toggle button
	 * - Quick capture button
	 * - Filter button
	 * - Reset filter button (conditional)
	 */
	createActionButtons(): void {
		// Details toggle button
		this.detailsToggleBtn = this.view.addAction(
			"panel-right-dashed",
			t("Details"),
			() => {
				this.toggleDetailsVisibility(!this.isDetailsVisible);
			},
		);

		if (this.detailsToggleBtn) {
			this.detailsToggleBtn.toggleClass("panel-toggle-btn", true);
			this.detailsToggleBtn.toggleClass(
				"is-active",
				this.isDetailsVisible,
			);
		}

		// Capture button
		this.view.addAction("notebook-pen", t("Capture"), () => {
			const modal = new QuickCaptureModal(
				this.app,
				this.plugin,
				{},
				true,
			);
			modal.open();
		});

		// Filter button
		this.view.addAction("filter", t("Filter"), (e: MouseEvent) => {
			if (Platform.isDesktop) {
				const popover = new ViewTaskFilterPopover(
					this.app,
					undefined,
					this.plugin,
				);

				// Set up filter state when opening
				this.app.workspace.onLayoutReady(() => {
					setTimeout(() => {
						const liveFilterState = this.getLiveFilterState?.();
						if (liveFilterState && popover.taskFilterComponent) {
							popover.taskFilterComponent.loadFilterState(
								liveFilterState,
							);
						}
					}, 100);
				});

				popover.showAtPosition({ x: e.clientX, y: e.clientY });
			} else {
				const modal = new ViewTaskFilterModal(
					this.app,
					this.leaf.id,
					this.plugin,
				);

				modal.open();

				// Set initial filter state
				const liveFilterState = this.getLiveFilterState?.();
				if (liveFilterState && modal.taskFilterComponent) {
					setTimeout(() => {
						modal.taskFilterComponent.loadFilterState(
							liveFilterState,
						);
					}, 100);
				}
			}
		});

		// Update action buttons visibility
		this.updateActionButtons();
	}

	/**
	 * Update action buttons visibility (mainly Reset Filter button)
	 */
	updateActionButtons(): void {
		// Remove reset filter button if exists
		const resetButton = this.headerEl.querySelector(
			".view-action.task-filter-reset",
		);
		if (resetButton) {
			resetButton.remove();
		}

		// Add reset filter button if there are active filters
		const liveFilterState = this.getLiveFilterState?.();
		if (
			liveFilterState &&
			liveFilterState.filterGroups &&
			liveFilterState.filterGroups.length > 0
		) {
			this.view
				.addAction("reset", t("Reset Filter"), () => {
					this.onFilterReset?.();
				})
				.addClass("task-filter-reset");
		}
	}

	/**
	 * Clean up mobile event listeners
	 */
	onunload(): void {
		if (Platform.isPhone && (this as any).mobileDetailsOverlayHandler) {
			document.removeEventListener(
				"click",
				(this as any).mobileDetailsOverlayHandler,
			);
			delete (this as any).mobileDetailsOverlayHandler;
		}
		super.onunload();
	}
}
