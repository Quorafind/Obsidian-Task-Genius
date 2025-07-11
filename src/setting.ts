import {
	App,
	PluginSettingTab,
	setIcon,
	ButtonComponent,
	Setting,
} from "obsidian";
import TaskProgressBarPlugin from ".";

import { t } from "./translations/helper";
import "./styles/setting.css";
import "./styles/setting-v2.css";
import "./styles/beta-warning.css";
import {
	renderAboutSettingsTab,
	renderBetaTestSettingsTab,
	renderHabitSettingsTab,
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
	IcsSettingsComponent,
} from "./components/settings";
import { renderFileFilterSettingsTab } from "./components/settings/FileFilterSettingsTab";
import { renderTimeParsingSettingsTab } from "./components/settings/TimeParsingSettingsTab";

export class TaskProgressBarSettingTab extends PluginSettingTab {
	plugin: TaskProgressBarPlugin;
	private applyDebounceTimer: number = 0;

	// Tabs management
	private currentTab: string = "general";
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
			id: "view-settings",
			name: t("Views & Index"),
			icon: "layout",
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
			category: "management",
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
			id: "beta-test",
			name: t("Beta Features"),
			icon: "flask-conical",
			category: "advanced",
		},
		{ id: "about", name: t("About"), icon: "info", category: "info" },
	];

	constructor(app: App, plugin: TaskProgressBarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	applySettingsUpdate() {
		clearTimeout(this.applyDebounceTimer);
		const plugin = this.plugin;
		this.applyDebounceTimer = window.setTimeout(async () => {
			await plugin.saveSettings();

			// Update TaskManager parsing configuration if it exists
			if (plugin.taskManager) {
				plugin.taskManager.updateParsingConfiguration();
			}

			// Trigger view updates to reflect setting changes
			await plugin.triggerViewUpdate();
		}, 100);
	}

	// Tabs management with categories
	private createCategorizedTabsUI() {
		this.containerEl.toggleClass("task-genius-settings", true);

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
							: "")
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

	private switchToTab(tabId: string) {
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
			".settings-tab-section"
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
			".settings-tabs-categorized-container"
		);
		const settingsHeader = this.containerEl.querySelector(
			".task-genius-settings-header"
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

		console.log(
			"Tab switched to:",
			tabId,
			"Active sections:",
			this.containerEl.querySelectorAll(".settings-tab-section-active")
				.length
		);
	}

	public openTab(tabId: string) {
		this.currentTab = tabId;
		this.display();
	}

	private createTabSection(tabId: string): HTMLElement {
		// Get the sections container
		const sectionsContainer = this.containerEl.querySelector(
			".settings-tab-sections"
		);
		if (!sectionsContainer) return this.containerEl;

		// Create section element
		const section = sectionsContainer.createDiv();
		section.addClass("settings-tab-section");
		if (this.currentTab === tabId) {
			section.addClass("settings-tab-section-active");
		}
		section.setAttribute("data-tab-id", tabId);

		// Create header
		if (tabId !== "general") {
			const headerEl = section.createDiv();
			headerEl.addClass("settings-tab-section-header");

			const button = new ButtonComponent(headerEl)
				.setClass("header-button")
				.onClick(() => {
					this.currentTab = "general";
					this.display();
				});

			const iconEl = button.buttonEl.createEl("span");
			iconEl.addClass("header-button-icon");
			setIcon(iconEl, "arrow-left");

			const textEl = button.buttonEl.createEl("span");
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

		// View Settings Tab
		const viewSettingsSection = this.createTabSection("view-settings");
		this.displayViewSettings(viewSettingsSection);

		// Reward Tab
		const rewardSection = this.createTabSection("reward");
		this.displayRewardSettings(rewardSection);

		// Habit Tab
		const habitSection = this.createTabSection("habit");
		this.displayHabitSettings(habitSection);

		// ICS Integration Tab
		const icsSection = this.createTabSection("ics-integration");
		this.displayIcsSettings(icsSection);

		// Beta Test Tab
		const betaTestSection = this.createTabSection("beta-test");
		this.displayBetaTestSettings(betaTestSection);

		// About Tab
		const aboutSection = this.createTabSection("about");
		this.displayAboutSettings(aboutSection);

		// Initialize the correct tab state
		this.switchToTab(this.currentTab);
	}

	private displayGeneralSettings(containerEl: HTMLElement): void {}

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
			}
		);
		icsSettingsComponent.display();
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
}
