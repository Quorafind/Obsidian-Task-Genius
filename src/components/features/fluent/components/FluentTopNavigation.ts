import {
	setIcon,
	Menu,
	Notice,
	SearchComponent,
	Platform,
	Component,
} from "obsidian";
import TaskProgressBarPlugin from "@/index";
import { Task } from "@/types/task";
import { t } from "@/translations/helper";

export type ViewMode = "list" | "kanban" | "tree" | "calendar";

export class TopNavigation extends Component {
	private containerEl: HTMLElement;
	private plugin: TaskProgressBarPlugin;
	private searchInput: HTMLInputElement;
	private currentViewMode: ViewMode = "list";
	private notificationCount = 0;
	private availableModes: ViewMode[] = ["list", "kanban", "tree", "calendar"];
	private viewTabsContainer: HTMLElement | null = null;

	constructor(
		containerEl: HTMLElement,
		plugin: TaskProgressBarPlugin,
		private onSearch: (query: string) => void,
		private onViewModeChange: (mode: ViewMode) => void,
		private onFilterClick: () => void,
		private onSortClick: () => void,
		private onSettingsClick: () => void,
		availableModes?: ViewMode[],
		private onToggleSidebar?: () => void,
	) {
		super();
		this.containerEl = containerEl;
		this.plugin = plugin;
		if (availableModes) {
			this.availableModes = availableModes;
			// Ensure current mode is valid
			if (!this.availableModes.includes(this.currentViewMode)) {
				this.currentViewMode = this.availableModes[0] || "list";
			}
		}

		this.updateNotificationCount();
		this.render();
	}

	private async updateNotificationCount() {
		let tasks: Task[] = [];
		if (this.plugin.dataflowOrchestrator) {
			const queryAPI = this.plugin.dataflowOrchestrator.getQueryAPI();
			tasks = await queryAPI.getAllTasks();
		} else {
			tasks = this.plugin.preloadedTasks || [];
		}
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		this.notificationCount = tasks.filter((task: Task) => {
			if (task.completed) return false;
			const dueDate = task.metadata?.dueDate
				? new Date(task.metadata.dueDate)
				: null;
			return dueDate && dueDate <= today;
		}).length;

		this.updateNotificationBadge();
	}

	private render() {
		this.containerEl.empty();
		this.containerEl.addClass("fluent-top-navigation");

		// Hide entire navigation if no view modes are available
		if (this.availableModes.length === 0) {
			this.containerEl.hide();
			return;
		}

		// Show navigation when modes are available
		this.containerEl.show();

		// Left section - Hamburger menu (mobile) and Search
		const leftSection = this.containerEl.createDiv({
			cls: "fluent-nav-left",
		});

		const searchContainer = leftSection.createDiv({
			cls: "fluent-search-container",
		});

		new SearchComponent(searchContainer)
			.setPlaceholder(t("Search tasks, projects ..."))
			.onChange((value) => {
				this.onSearch(value);
			});

		// Center section - View mode tabs
		const centerSection = this.containerEl.createDiv({
			cls: "fluent-nav-center",
		});

		// Render view tabs (we know modes are available at this point)
		this.viewTabsContainer = centerSection.createDiv({
			cls: "fluent-view-tabs",
		});
		this.renderViewTabs();

		// Right section - Notifications and Settings
		const rightSection = this.containerEl.createDiv({
			cls: "fluent-nav-right",
		});

		// Notification button
		const notificationBtn = rightSection.createDiv({
			cls: "fluent-nav-icon-button",
		});
		setIcon(notificationBtn, "bell");
		const badge = notificationBtn.createDiv({
			cls: "fluent-notification-badge",
			text: String(this.notificationCount),
		});
		if (this.notificationCount === 0) {
			badge.hide();
		}
		this.registerDomEvent(notificationBtn, "click", (e) =>
			this.showNotifications(e),
		);

		// Settings button
		const settingsBtn = rightSection.createDiv({
			cls: "fluent-nav-icon-button",
		});
		setIcon(settingsBtn, "settings");
		this.registerDomEvent(settingsBtn, "click", () => this.onSettingsClick());
	}

	private createViewTab(
		container: HTMLElement,
		mode: ViewMode,
		icon: string,
		label: string,
	) {
		const tab = container.createEl("button", {
			cls: ["fluent-view-tab", "clickable-icon"],
			attr: { "data-mode": mode },
		});

		if (mode === this.currentViewMode) {
			tab.addClass("is-active");
		}

		setIcon(tab.createDiv({ cls: "fluent-view-tab-icon" }), icon);
		tab.createSpan({ text: label });

		this.registerDomEvent(tab, "click", () => {
			this.setViewMode(mode);
			this.onViewModeChange(mode);
		});
	}

	private setViewMode(mode: ViewMode) {
		this.currentViewMode = mode;

		this.containerEl.querySelectorAll(".fluent-view-tab").forEach((tab) => {
			tab.removeClass("is-active");
		});

		const activeTab = this.containerEl.querySelector(
			`[data-mode="${mode}"]`,
		);
		if (activeTab) {
			activeTab.addClass("is-active");
		}
	}

	private async showNotifications(event: MouseEvent) {
		const menu = new Menu();

		let tasks: Task[] = [];
		if (this.plugin.dataflowOrchestrator) {
			const queryAPI = this.plugin.dataflowOrchestrator.getQueryAPI();
			tasks = await queryAPI.getAllTasks();
		} else {
			tasks = this.plugin.preloadedTasks || [];
		}
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const overdueTasks = tasks
			.filter((task: Task) => {
				if (task.completed) return false;
				const dueDate = task.metadata?.dueDate
					? new Date(task.metadata.dueDate)
					: null;
				return dueDate && dueDate <= today;
			})
			.slice(0, 10);

		if (overdueTasks.length === 0) {
			menu.addItem((item) => {
				item.setTitle("No overdue tasks").setDisabled(true);
			});
		} else {
			menu.addItem((item) => {
				item.setTitle(
					`${overdueTasks.length} overdue tasks`,
				).setDisabled(true);
			});

			menu.addSeparator();

			overdueTasks.forEach((task) => {
				menu.addItem((item) => {
					item.setTitle(task.content || t("Untitled task"))
						.setIcon("alert-circle")
						.onClick(() => {
							new Notice(
								t("Task: {{content}}", {
									content: task.content || "",
								}),
							);
						});
				});
			});
		}

		menu.showAtMouseEvent(event);
	}

	private updateNotificationBadge() {
		const badge = this.containerEl.querySelector(
			".fluent-notification-badge",
		);
		if (badge instanceof HTMLElement) {
			badge.textContent = String(this.notificationCount);
			if (this.notificationCount === 0) {
				badge.hide();
			} else {
				badge.show();
			}
		}
	}

	public refresh() {
		this.updateNotificationCount();
	}

	public getSearchQuery(): string {
		return this.searchInput?.value || "";
	}

	public clearSearch() {
		if (this.searchInput) {
			this.searchInput.value = "";
			this.onSearch("");
		}
	}

	private renderViewTabs() {
		if (!this.viewTabsContainer) return;

		this.viewTabsContainer.empty();

		const modeConfig: Record<ViewMode, { icon: string; label: string }> = {
			list: { icon: "list", label: "List" },
			kanban: { icon: "layout-grid", label: "Kanban" },
			tree: { icon: "git-branch", label: "Tree" },
			calendar: { icon: "calendar", label: "Calendar" },
		};

		for (const mode of this.availableModes) {
			const config = modeConfig[mode];
			if (config) {
				this.createViewTab(
					this.viewTabsContainer,
					mode,
					config.icon,
					config.label,
				);
			}
		}
	}

	public updateAvailableModes(modes: ViewMode[]) {
		this.availableModes = modes;

		// Hide entire navigation if no modes available
		if (modes.length === 0) {
			this.containerEl.hide();
			return;
		}

		// Show navigation when modes are available
		this.containerEl.show();

		// If current mode is no longer available, switch to first available mode
		if (!modes.includes(this.currentViewMode)) {
			this.currentViewMode = modes[0];
			// Notify about the mode change
			this.onViewModeChange(this.currentViewMode);
		}

		// Update center section visibility (this should always be visible now since we handle empty modes above)
		const centerSection = this.containerEl.querySelector(
			".fluent-nav-center",
		) as HTMLElement;
		if (centerSection) {
			centerSection.show();
			// Re-render the view tabs
			if (!this.viewTabsContainer) {
				this.viewTabsContainer = centerSection.createDiv({
					cls: "fluent-view-tabs",
				});
			}
			this.renderViewTabs();
		}
	}

	public getCurrentViewMode(): ViewMode {
		return this.currentViewMode;
	}
}
