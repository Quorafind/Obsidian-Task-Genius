import {
	App,
	PluginSettingTab,
	setIcon,
	ButtonComponent,
	Platform,
	requireApiVersion,
	debounce,
} from "obsidian";
import TaskProgressBarPlugin from ".";

import { t } from "./translations/helper";
import "./styles/setting.css";
import "./styles/setting-v2.css";
import "./styles/beta-warning.css";
import "./styles/settings-search.css";
import "./styles/settings-migration.css";
import "./styles/workspace-settings-selector.css";
import {
	renderAboutSettingsTab,
	renderBetaTestSettingsTab,
	renderHabitSettingsTab,
	renderInterfaceSettingsTab,
	renderProgressSettingsTab,
	renderTaskStatusSettingsTab,
	renderDatePrioritySettingsTab,
	renderTaskFilterSettingsTab,
	renderWorkflowSettingsTab,
	renderQuickCaptureSettingsTab,
	renderTaskHandlerSettingsTab,
	renderViewSettingsTab,
	renderProjectSettingsTab,
	renderRewardSettingsTab,
	renderTimelineSidebarSettingsTab,
	renderIndexSettingsTab,
	IcsSettingsComponent,
	renderDesktopIntegrationSettingsTab,
} from "./components/features/settings";
import { renderFileFilterSettingsTab } from "./components/features/settings/tabs/FileFilterSettingsTab";
import { renderTimeParsingSettingsTab } from "./components/features/settings/tabs/TimeParsingSettingsTab";
import { SettingsSearchComponent } from "./components//features/settings/components/SettingsSearchComponent";
import { renderMcpIntegrationSettingsTab } from "./components/features/settings/tabs/McpIntegrationSettingsTab";
import { IframeModal } from "@/components/ui/modals/IframeModal";
import { renderTaskTimerSettingTab } from "./components/features/settings/tabs/TaskTimerSettingsTab";
import { renderBasesSettingsTab } from "./components/features/settings/tabs/BasesSettingsTab";
import { renderWorkspaceSettingsTab } from "@/components/features/settings/tabs/WorkspaceSettingTab";

export class TaskProgressBarSettingTab extends PluginSettingTab {
	plugin: TaskProgressBarPlugin;
	private debouncedApplySettings: () => void;
	private debouncedApplyNotifications: () => void;
	private searchComponent: SettingsSearchComponent | null = null;

	// Tabs management
	private currentTab: string = "general";
	public containerEl: HTMLElement;
	private tabs: Array<{
		id: string;
		name: string;
		icon: string;
		category?: string;
	}> = [
		// Core Settings
		{
			id: "general",
			name: t("General"),
			icon: "settings",
			category: "core",
		},
		{
			id: "index",
			name: t("Index & Sources"),
			icon: "database",
			category: "core",
		},
		{
			id: "view-settings",
			name: t("Views"),
			icon: "layout",
			category: "core",
		},
		{
			id: "interface",
			name: t("Interface"),
			icon: "layout-dashboard",
			category: "core",
		},
		{
			id: "file-filter",
			name: t("File Filter"),
			icon: "folder-x",
			category: "core",
		},

		// Display & Progress
		{
			id: "progress-bar",
			name: t("Progress Display"),
			icon: "trending-up",
			category: "display",
		},
		{
			id: "task-status",
			name: t("Checkbox Status"),
			icon: "checkbox-glyph",
			category: "display",
		},

		// Task Management
		{
			id: "task-handler",
			name: t("Task Handler"),
			icon: "list-checks",
			category: "management",
		},
		{
			id: "task-filter",
			name: t("Task Filter"),
			icon: "filter",
			category: "management",
		},

		{
			id: "project",
			name: t("Projects"),
			icon: "folder-open",
			category: "core",
		},

		// Workflow & Automation
		{
			id: "workflow",
			name: t("Workflows"),
			icon: "git-branch",
			category: "workflow",
		},
		{
			id: "date-priority",
			name: t("Dates & Priority"),
			icon: "calendar-clock",
			category: "workflow",
		},
		{
			id: "quick-capture",
			name: t("Quick Capture"),
			icon: "zap",
			category: "workflow",
		},
		{
			id: "task-timer",
			name: "Task Timer",
			icon: "timer",
			category: "workflow",
		},
		{
			id: "time-parsing",
			name: t("Time Parsing"),
			icon: "clock",
			category: "workflow",
		},
		{
			id: "timeline-sidebar",
			name: t("Timeline Sidebar"),
			icon: "clock",
			category: "workflow",
		},

		// Gamification
		{
			id: "reward",
			name: t("Rewards"),
			icon: "gift",
			category: "gamification",
		},
		{
			id: "habit",
			name: t("Habits"),
			icon: "repeat",
			category: "gamification",
		},

		// Integration & Advanced
		{
			id: "ics-integration",
			name: t("Calendar Sync"),
			icon: "calendar-plus",
			category: "integration",
		},
		{
			id: "desktop-integration",
			name: t("Desktop Integration"),
			icon: "monitor",
			category: "integration",
		},
		{
			id: "mcp-integration",
			name: t("MCP Integration"),
			icon: "network",
			category: "integration",
		},
		{
			id: "bases-support",
			name: t("Bases Support"),
			icon: "layout",
			category: "integration",
		},
		{
			id: "workspaces",
			name: t("Workspaces"),
			icon: "layers",
			category: "integration",
		},
		{
			id: "beta-test",
			name: t("Beta Features"),
			icon: "flask-conical",
			category: "advanced",
		},
		// {
		// 	id: "experimental",
		// 	name: t("Experimental"),
		// 	icon: "beaker",
		// 	category: "advanced",
		// },
		{ id: "about", name: t("About"), icon: "info", category: "info" },
	];

	constructor(app: App, plugin: TaskProgressBarPlugin) {
		super(app, plugin);
		this.plugin = plugin;

		// Initialize debounced functions
		this.debouncedApplySettings = debounce(
			async () => {
				await plugin.saveSettings();

				// Update dataflow orchestrator with new settings
				if (plugin.dataflowOrchestrator) {
					// Call async updateSettings and await to ensure incremental reindex completes
					await plugin.dataflowOrchestrator.updateSettings(
						plugin.settings,
					);
				}

				// Reload notification manager to apply changes immediately
				await plugin.notificationManager?.reloadSettings();

				// Trigger view updates to reflect setting changes
				await plugin.triggerViewUpdate();
			},
			100,
			true,
		);

		this.debouncedApplyNotifications = debounce(
			async () => {
				await plugin.saveSettings();
				// Only refresh notification-related UI; do not touch dataflow orchestrator
				await plugin.notificationManager?.reloadSettings();
				// Minimal view updates are unnecessary here
			},
			100,
			true,
		);
	}

	applySettingsUpdate() {
		this.debouncedApplySettings();
	}

	// Lightweight updater for notifications/tray changes to avoid reloading task caches
	applyNotificationsUpdateLight() {
		this.debouncedApplyNotifications();
	}

	// 创建搜索组件
	private createSearchComponent() {
		if (this.searchComponent) {
			this.searchComponent.destroy();
		}
		this.searchComponent = new SettingsSearchComponent(
			this,
			this.containerEl,
		);
	}

	// Tabs management with categories
	private createCategorizedTabsUI() {
		this.containerEl.toggleClass("task-genius-settings", true);

		// 创建搜索组件
		this.createSearchComponent();

		// Group tabs by category
		const categories = {
			core: { name: t("Core Settings"), tabs: [] as typeof this.tabs },
			display: {
				name: t("Display & Progress"),
				tabs: [] as typeof this.tabs,
			},
			management: {
				name: t("Task Management"),
				tabs: [] as typeof this.tabs,
			},
			workflow: {
				name: t("Workflow & Automation"),
				tabs: [] as typeof this.tabs,
			},
			gamification: {
				name: t("Gamification"),
				tabs: [] as typeof this.tabs,
			},
			integration: {
				name: t("Integration"),
				tabs: [] as typeof this.tabs,
			},
			advanced: { name: t("Advanced"), tabs: [] as typeof this.tabs },
			info: { name: t("Information"), tabs: [] as typeof this.tabs },
		};

		// Group tabs by category
		this.tabs.forEach((tab) => {
			// Skip MCP tab on non-desktop platforms
			if (tab.id === "mcp-integration" && !Platform.isDesktopApp) {
				return;
			}
			// Skip workspaces tab from main navigation (accessed via dropdown)
			if (tab.id === "workspaces") {
				return;
			}
			const category = tab.category || "core";
			if (categories[category as keyof typeof categories]) {
				categories[category as keyof typeof categories].tabs.push(tab);
			}
		});

		// Create categorized tabs container
		const tabsContainer = this.containerEl.createDiv();
		tabsContainer.addClass("settings-tabs-categorized-container");

		// Create tabs for each category
		Object.entries(categories).forEach(([categoryKey, category]) => {
			if (category.tabs.length === 0) return;

			// Create category section
			const categorySection = tabsContainer.createDiv();
			categorySection.addClass("settings-category-section");

			// Category header
			const categoryHeader = categorySection.createDiv();
			categoryHeader.addClass("settings-category-header");
			categoryHeader.setText(category.name);

			// Category tabs container
			const categoryTabsContainer = categorySection.createDiv();
			categoryTabsContainer.addClass("settings-category-tabs");

			// Create tabs for this category
			category.tabs.forEach((tab) => {
				const tabEl = categoryTabsContainer.createDiv();
				tabEl.addClass("settings-tab");
				if (this.currentTab === tab.id) {
					tabEl.addClass("settings-tab-active");
				}
				tabEl.setAttribute("data-tab-id", tab.id);
				tabEl.setAttribute("data-category", categoryKey);

				// Add icon
				const iconEl = tabEl.createSpan();
				iconEl.addClass("settings-tab-icon");
				setIcon(iconEl, tab.icon);

				// Add label
				const labelEl = tabEl.createSpan();
				labelEl.addClass("settings-tab-label");
				labelEl.setText(
					tab.name +
						(tab.id === "about"
							? " v" + this.plugin.manifest.version
							: ""),
				);

				// Add click handler
				tabEl.addEventListener("click", () => {
					this.switchToTab(tab.id);
				});
			});
		});

		// Create sections container
		const sectionsContainer = this.containerEl.createDiv();
		sectionsContainer.addClass("settings-tab-sections");
	}

	public switchToTab(tabId: string) {
		console.log("Switching to tab:", tabId);

		// Update current tab
		this.currentTab = tabId;

		// Update active tab states
		const tabs = this.containerEl.querySelectorAll(".settings-tab");
		tabs.forEach((tab) => {
			if (tab.getAttribute("data-tab-id") === tabId) {
				tab.addClass("settings-tab-active");
			} else {
				tab.removeClass("settings-tab-active");
			}
		});

		// Show active section, hide others
		const sections = this.containerEl.querySelectorAll(
			".settings-tab-section",
		);
		sections.forEach((section) => {
			if (section.getAttribute("data-tab-id") === tabId) {
				section.addClass("settings-tab-section-active");
				(section as unknown as HTMLElement).style.display = "block";
			} else {
				section.removeClass("settings-tab-section-active");
				(section as unknown as HTMLElement).style.display = "none";
			}
		});

		// Handle tab container and header visibility based on selected tab
		const tabsContainer = this.containerEl.querySelector(
			".settings-tabs-categorized-container",
		);
		const settingsHeader = this.containerEl.querySelector(
			".task-genius-settings-header",
		);

		if (tabId === "general") {
			// Show tabs and header for general tab
			if (tabsContainer)
				(tabsContainer as unknown as HTMLElement).style.display =
					"flex";
			if (settingsHeader)
				(settingsHeader as unknown as HTMLElement).style.display =
					"block";
		} else {
			// Hide tabs and header for specific tab pages
			if (tabsContainer)
				(tabsContainer as unknown as HTMLElement).style.display =
					"none";
			if (settingsHeader)
				(settingsHeader as unknown as HTMLElement).style.display =
					"none";
		}

		// Special handling for workspaces tab - ensure it's still accessible via dropdown
		if (tabId === "workspaces") {
			// Make sure the workspace section is visible even though the tab is hidden
			const workspaceSection = this.containerEl.querySelector(
				'[data-tab-id="workspaces"]',
			);
			if (workspaceSection) {
				(workspaceSection as unknown as HTMLElement).style.display =
					"block";
				workspaceSection.addClass("settings-tab-section-active");
			}
		}
	}

	public openTab(tabId: string) {
		this.currentTab = tabId;
		this.display();
	}

	/**
	 * Navigate to a specific tab via URI
	 */
	public navigateToTab(
		tabId: string,
		section?: string,
		search?: string,
	): void {
		// Set the current tab
		this.currentTab = tabId;

		// Re-display the settings
		this.display();

		// Wait for display to complete
		setTimeout(() => {
			// If search is provided, perform search
			if (search && this.searchComponent) {
				this.searchComponent.performSearch(search);
			}

			// If section is provided, scroll to it
			if (section) {
				this.scrollToSection(section);
			}
		}, 100);
	}

	/**
	 * Scroll to a specific section within the current tab
	 */
	private scrollToSection(sectionId: string): void {
		// Look for headers containing the section ID
		const headers = this.containerEl.querySelectorAll("h3, h4");
		headers.forEach((header: HTMLElement) => {
			const headerText = header.textContent?.toLowerCase();
			if (
				headerText &&
				headerText.includes(sectionId.replace("-", " "))
			) {
				header.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		});

		// Special handling for MCP sections
		if (sectionId === "cursor" && this.currentTab === "mcp-integration") {
			const cursorSection = this.containerEl.querySelector(
				".mcp-client-section",
			);
			if (cursorSection) {
				const header =
					cursorSection.querySelector(".mcp-client-header");
				if (header && header.textContent?.includes("Cursor")) {
					// Click to expand
					(header as HTMLElement).click();
					cursorSection.scrollIntoView({
						behavior: "smooth",
						block: "start",
					});
				}
			}
		}
	}

	private createTabSection(tabId: string): HTMLElement {
		// Get the sections container
		const sectionsContainer = this.containerEl.querySelector(
			".settings-tab-sections",
		);
		if (!sectionsContainer) return this.containerEl;

		// Create section element
		const section = sectionsContainer.createDiv();
		section.addClass("settings-tab-section");
		if (this.currentTab === tabId) {
			section.addClass("settings-tab-section-active");
		}
		section.setAttribute("data-tab-id", tabId);

		// Attach category for search indexer
		const tabInfo = this.tabs.find((t) => t.id === tabId);
		if (tabInfo?.category) {
			section.setAttribute("data-category", tabInfo.category);
		}

		// Create header
		if (tabId !== "general") {
			const headerEl = section.createDiv();
			headerEl.addClass("settings-tab-section-header");

			// Left: How to use button (opens iframe modal with docs)
			const howToBtn = new ButtonComponent(headerEl);
			howToBtn.setClass("header-button");
			howToBtn.setClass("how-to-button");
			howToBtn.onClick(() => {
				const url = this.getHowToUseUrl(tabId);
				try {
					new IframeModal(
						this.app,
						url,
						`How to use — ${tabInfo?.name ?? tabId}`,
					).open();
				} catch (e) {
					window.open(url);
				}
			});

			const howToIconEl = howToBtn.buttonEl.createEl("span");
			howToIconEl.addClass("header-button-icon");
			setIcon(howToIconEl, "book");

			const howToTextEl = howToBtn.buttonEl.createEl("span");
			howToTextEl.addClass("header-button-text");
			howToTextEl.setText(t("How to use"));

			// Right: Back to main settings
			const backBtn = new ButtonComponent(headerEl)
				.setClass("header-button")
				.onClick(() => {
					this.currentTab = "general";
					this.display();
				});
			backBtn.setClass("header-button-back");

			const iconEl = backBtn.buttonEl.createEl("span");
			iconEl.addClass("header-button-icon");
			setIcon(iconEl, "arrow-left");

			const textEl = backBtn.buttonEl.createEl("span");
			textEl.addClass("header-button-text");
			textEl.setText(t("Back to main settings"));
		}

		return section;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Ensure we start with general tab if no tab is set
		if (!this.currentTab) {
			this.currentTab = "general";
		}

		// Create tabs UI with categories
		this.createCategorizedTabsUI();

		// General Tab
		const generalSection = this.createTabSection("general");
		this.displayGeneralSettings(generalSection);

		// Progress Bar Tab
		const progressBarSection = this.createTabSection("progress-bar");
		this.displayProgressBarSettings(progressBarSection);

		// Checkbox Status Tab
		const taskStatusSection = this.createTabSection("task-status");
		this.displayTaskStatusSettings(taskStatusSection);

		// Task Filter Tab
		const taskFilterSection = this.createTabSection("task-filter");
		this.displayTaskFilterSettings(taskFilterSection);

		// File Filter Tab
		const fileFilterSection = this.createTabSection("file-filter");
		this.displayFileFilterSettings(fileFilterSection);

		// Task Handler Tab
		const taskHandlerSection = this.createTabSection("task-handler");
		this.displayTaskHandlerSettings(taskHandlerSection);

		// Quick Capture Tab
		const quickCaptureSection = this.createTabSection("quick-capture");
		this.displayQuickCaptureSettings(quickCaptureSection);

		// Task Timer Tab
		const taskTimerSection = this.createTabSection("task-timer");
		this.displayTaskTimerSettings(taskTimerSection);

		// Time Parsing Tab
		const timeParsingSection = this.createTabSection("time-parsing");
		this.displayTimeParsingSettings(timeParsingSection);

		// Timeline Sidebar Tab
		const timelineSidebarSection =
			this.createTabSection("timeline-sidebar");
		this.displayTimelineSidebarSettings(timelineSidebarSection);

		// Workflow Tab
		const workflowSection = this.createTabSection("workflow");
		this.displayWorkflowSettings(workflowSection);

		// Date & Priority Tab
		const datePrioritySection = this.createTabSection("date-priority");
		this.displayDatePrioritySettings(datePrioritySection);

		// Project Tab
		const projectSection = this.createTabSection("project");
		this.displayProjectSettings(projectSection);

		// Index Settings Tab
		const indexSection = this.createTabSection("index");
		this.displayIndexSettings(indexSection);

		// View Settings Tab
		const viewSettingsSection = this.createTabSection("view-settings");
		this.displayViewSettings(viewSettingsSection);

		// Interface Tab
		const interfaceSection = this.createTabSection("interface");
		this.displayInterfaceSettings(interfaceSection);

		// Reward Tab
		const rewardSection = this.createTabSection("reward");
		this.displayRewardSettings(rewardSection);

		// Habit Tab
		const habitSection = this.createTabSection("habit");
		this.displayHabitSettings(habitSection);

		// ICS Integration Tab
		const icsSection = this.createTabSection("ics-integration");
		this.displayIcsSettings(icsSection);

		// Notifications Tab
		const notificationsSection = this.createTabSection(
			"desktop-integration",
		);
		this.displayDesktopIntegrationSettings(notificationsSection);

		// MCP Integration Tab (only on desktop)
		if (Platform.isDesktopApp) {
			const mcpSection = this.createTabSection("mcp-integration");
			this.displayMcpSettings(mcpSection);
		}

		if (requireApiVersion("1.9.10")) {
			const basesSection = this.createTabSection("bases-support");
			this.displayBasesSettings(basesSection);
		}

		// Workspaces Tab
		const workspacesSection = this.createTabSection("workspaces");
		this.displayWorkspacesSettings(workspacesSection);

		// Beta Test Tab
		const betaTestSection = this.createTabSection("beta-test");
		this.displayBetaTestSettings(betaTestSection);

		// // Experimental Tab
		// const experimentalSection = this.createTabSection("experimental");
		// this.displayExperimentalSettings(experimentalSection);

		// About Tab
		const aboutSection = this.createTabSection("about");
		this.displayAboutSettings(aboutSection);

		// Initialize the correct tab state
		this.switchToTab(this.currentTab);
	}

	private getHowToUseUrl(tabId: string): string {
		const base = "https://taskgenius.md/docs";
		switch (tabId) {
			case "index":
				return `${base}/task-view/indexer`;
			case "view-settings":
				return `${base}/task-view`;
			case "interface":
				return `${base}/interface`;
			case "file-filter":
				return `${base}/file-filter`;
			case "progress-bar":
				return `${base}/progress-bars`;
			case "task-status":
				return `${base}/task-status`;
			case "task-handler":
				return `${base}/task-gutter`;
			case "task-filter":
				return `${base}/filtering`;
			case "project":
				return `${base}/project`;
			case "date-priority":
				return `${base}/date-priority`;
			case "quick-capture":
				return `${base}/quick-capture`;
			case "task-timer":
				return `${base}/task-timer`;
			case "time-parsing":
				return `${base}/time-parsing`;
			case "workflow":
				return `${base}/workflows`;
			case "timeline-sidebar":
				return `${base}/task-view/timeline-sidebar-view`;
			case "reward":
				return `${base}/reward`;
			case "habit":
				return `${base}/habit`;
			case "ics-integration":
				return `${base}/ics-support`;
			case "mcp-integration":
				return `${base}/mcp-integration`;
			case "bases-support":
				return `${base}/bases-support`;
			case "desktop-integration":
				return `${base}/bases-support`;
			case "workspaces":
				return `${base}/workspaces`;
			case "beta-test":
				return `${base}/getting-started`;
			case "experimental":
				return `${base}/getting-started`;
			case "about":
				return `${base}/getting-started`;
			default:
				return `${base}/getting-started`;
		}
	}

	private displayGeneralSettings(containerEl: HTMLElement): void {
		// Notifications and Desktop integration
	}

	private displayProgressBarSettings(containerEl: HTMLElement): void {
		renderProgressSettingsTab(this, containerEl);
	}

	private displayTaskStatusSettings(containerEl: HTMLElement): void {
		renderTaskStatusSettingsTab(this, containerEl);
	}

	private displayDatePrioritySettings(containerEl: HTMLElement): void {
		renderDatePrioritySettingsTab(this, containerEl);
	}

	private displayTaskFilterSettings(containerEl: HTMLElement): void {
		renderTaskFilterSettingsTab(this, containerEl);
	}

	private displayFileFilterSettings(containerEl: HTMLElement): void {
		renderFileFilterSettingsTab(this, containerEl);
	}

	private displayWorkflowSettings(containerEl: HTMLElement): void {
		renderWorkflowSettingsTab(this, containerEl);
	}

	private displayQuickCaptureSettings(containerEl: HTMLElement): void {
		renderQuickCaptureSettingsTab(this, containerEl);
	}

	private displayTaskTimerSettings(containerEl: HTMLElement): void {
		this.renderTaskTimerSettingsTab(containerEl);
	}

	private displayTimeParsingSettings(containerEl: HTMLElement): void {
		renderTimeParsingSettingsTab(this, containerEl);
	}

	private displayTimelineSidebarSettings(containerEl: HTMLElement): void {
		renderTimelineSidebarSettingsTab(this, containerEl);
	}

	private displayTaskHandlerSettings(containerEl: HTMLElement): void {
		renderTaskHandlerSettingsTab(this, containerEl);
	}

	private displayViewSettings(containerEl: HTMLElement): void {
		renderViewSettingsTab(this, containerEl);
	}

	private displayInterfaceSettings(containerEl: HTMLElement): void {
		renderInterfaceSettingsTab(this, containerEl);
	}

	private displayIndexSettings(containerEl: HTMLElement): void {
		renderIndexSettingsTab(this, containerEl);
	}

	private displayProjectSettings(containerEl: HTMLElement): void {
		renderProjectSettingsTab(this, containerEl);
	}

	private displayIcsSettings(containerEl: HTMLElement): void {
		const icsSettingsComponent = new IcsSettingsComponent(
			this.plugin,
			containerEl,
			() => {
				this.currentTab = "general";
				this.display();
			},
		);
		icsSettingsComponent.display();
	}

	private displayDesktopIntegrationSettings(containerEl: HTMLElement): void {
		renderDesktopIntegrationSettingsTab(this, containerEl);
	}

	private displayMcpSettings(containerEl: HTMLElement): void {
		renderMcpIntegrationSettingsTab(containerEl, this.plugin, () =>
			this.applySettingsUpdate(),
		);
	}

	private displayBasesSettings(containerEl: HTMLElement): void {
		renderBasesSettingsTab(this, containerEl);
	}

	private displayAboutSettings(containerEl: HTMLElement): void {
		renderAboutSettingsTab(this, containerEl);
	}

	// START: New Reward Settings Section
	private displayRewardSettings(containerEl: HTMLElement): void {
		renderRewardSettingsTab(this, containerEl);
	}

	private displayHabitSettings(containerEl: HTMLElement): void {
		renderHabitSettingsTab(this, containerEl);
	}

	private displayBetaTestSettings(containerEl: HTMLElement): void {
		renderBetaTestSettingsTab(this, containerEl);
	}

	private displayWorkspacesSettings(containerEl: HTMLElement): void {
		renderWorkspaceSettingsTab(this, containerEl);
	}

	// private displayExperimentalSettings(containerEl: HTMLElement): void {
	// 	this.renderExperimentalSettingsTab(containerEl);
	// }

	private renderTaskTimerSettingsTab(containerEl: HTMLElement): void {
		renderTaskTimerSettingTab(this, containerEl);
	}
}
