import { Component, App } from "obsidian";
import { GanttGroupingControls } from "./grouping-controls";
import {
	FilterComponent,
	buildFilterOptionsFromTasks,
} from "../inview-filter/filter";
import { ActiveFilter } from "../inview-filter/filter-type";
import { ScrollToDateButton } from "../inview-filter/custom/scroll-to-date-button";
import { GroupingConfig } from "../../types/gantt-grouping";
import { Task } from "../../types/task";
import TaskProgressBarPlugin from "../../index";

interface TabControlsConfig {
	container: HTMLElement;
	onGroupingChange: (config: GroupingConfig) => void;
	onFiltersChange: (filters: ActiveFilter[]) => void;
	onGroupToggle: (groupId: string) => void;
	onExpandCollapseAll: (expand: boolean) => void;
	onScrollToDate: (date: Date) => void;
	initialGroupingConfig: GroupingConfig;
	initialTasks: Task[];
	plugin: TaskProgressBarPlugin;
}

export class GanttTabControls extends Component {
	private containerEl: HTMLElement;
	private tabsContainerEl: HTMLElement;
	private contentContainerEl: HTMLElement;
	private activeTab: "grouping" | "filters" | "config" = "grouping";

	private groupingControls: GanttGroupingControls | null = null;
	private filterComponent: FilterComponent | null = null;

	constructor(private config: TabControlsConfig) {
		super();
		this.containerEl = config.container;
		this.containerEl.empty();
		this.containerEl.addClass("gantt-tab-controls");

		this.createTabStructure();
		this.initializeComponents();
	}

	private createTabStructure() {
		// Create tabs header
		this.tabsContainerEl = this.containerEl.createDiv("gantt-tab-header");

		// Create tab buttons
		const groupingTab = this.tabsContainerEl.createDiv(
			"gantt-tab-button gantt-tab-button--active"
		);
		groupingTab.createSpan(
			"gantt-tab-icon"
		).innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M3 12h18M3 18h18"></path></svg>`;
		groupingTab.createSpan("gantt-tab-label").textContent = "Grouping";

		const filtersTab = this.tabsContainerEl.createDiv("gantt-tab-button");
		filtersTab.createSpan(
			"gantt-tab-icon"
		).innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"></path></svg>`;
		filtersTab.createSpan("gantt-tab-label").textContent = "Filters";

		const configTab = this.tabsContainerEl.createDiv("gantt-tab-button");
		configTab.createSpan(
			"gantt-tab-icon"
		).innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
		configTab.createSpan("gantt-tab-label").textContent = "Config";

		// Add click handlers
		this.registerDomEvent(groupingTab, "click", () =>
			this.switchTab("grouping")
		);
		this.registerDomEvent(filtersTab, "click", () =>
			this.switchTab("filters")
		);
		this.registerDomEvent(configTab, "click", () =>
			this.switchTab("config")
		);

		// Create content area
		this.contentContainerEl =
			this.containerEl.createDiv("gantt-tab-content");
	}

	private initializeComponents() {
		// Initialize grouping controls
		const groupingContentEl = this.contentContainerEl.createDiv(
			"gantt-tab-panel gantt-tab-panel--active"
		);
		groupingContentEl.setAttribute("data-tab", "grouping");

		this.groupingControls = this.addChild(
			new GanttGroupingControls({
				container: groupingContentEl,
				initialConfig: this.config.initialGroupingConfig,
				onChange: this.config.onGroupingChange,
				onToggleGroup: this.config.onGroupToggle,
				onExpandCollapseAll: this.config.onExpandCollapseAll,
			})
		);

		// Initialize filter component
		const filtersContentEl =
			this.contentContainerEl.createDiv("gantt-tab-panel");
		filtersContentEl.setAttribute("data-tab", "filters");

		this.filterComponent = this.addChild(
			new FilterComponent(
				{
					container: filtersContentEl,
					options: buildFilterOptionsFromTasks(
						this.config.initialTasks
					),
					onChange: this.config.onFiltersChange,
					components: [
						new ScrollToDateButton(
							filtersContentEl,
							this.config.onScrollToDate
						),
					],
				},
				this.config.plugin
			)
		);

		// Initialize config panel
		const configContentEl =
			this.contentContainerEl.createDiv("gantt-tab-panel");
		configContentEl.setAttribute("data-tab", "config");
		this.createConfigPanel(configContentEl);
	}

	private createConfigPanel(container: HTMLElement) {
		const configGrid = container.createDiv("gantt-config-grid");

		// View Options Section
		const viewSection = configGrid.createDiv("gantt-config-section");
		const viewHeader = viewSection.createDiv("gantt-config-section-header");
		viewHeader.createSpan(
			"gantt-config-section-icon"
		).innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
		viewHeader.createSpan("gantt-config-section-title").textContent =
			"View Options";

		const viewOptions = viewSection.createDiv("gantt-config-options");
		this.createToggleOption(
			viewOptions,
			"Show Task Labels",
			true,
			() => {}
		);
		this.createToggleOption(viewOptions, "Show Today Line", true, () => {});
		this.createToggleOption(viewOptions, "Show Weekends", true, () => {});
		this.createToggleOption(
			viewOptions,
			"Show Dependencies",
			false,
			() => {}
		);

		// Display Options Section
		const displaySection = configGrid.createDiv("gantt-config-section");
		const displayHeader = displaySection.createDiv(
			"gantt-config-section-header"
		);
		displayHeader.createSpan(
			"gantt-config-section-icon"
		).innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
		displayHeader.createSpan("gantt-config-section-title").textContent =
			"Display";

		const displayOptions = displaySection.createDiv("gantt-config-options");
		this.createToggleOption(
			displayOptions,
			"Compact Mode",
			false,
			() => {}
		);
		this.createToggleOption(
			displayOptions,
			"Virtual Scrolling",
			true,
			() => {}
		);
		this.createToggleOption(
			displayOptions,
			"Smooth Animations",
			true,
			() => {}
		);

		// Time Range Section
		const timeSection = configGrid.createDiv("gantt-config-section");
		const timeHeader = timeSection.createDiv("gantt-config-section-header");
		timeHeader.createSpan(
			"gantt-config-section-icon"
		).innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><polyline points="12,6 12,12 16,14"></polyline></svg>`;
		timeHeader.createSpan("gantt-config-section-title").textContent =
			"Time Range";

		const timeControls = timeSection.createDiv("gantt-config-controls");
		const quickRangeContainer = timeControls.createDiv(
			"gantt-config-control-group"
		);
		quickRangeContainer.createSpan(
			"gantt-config-control-label"
		).textContent = "Quick Range";
		const quickRangeButtons = quickRangeContainer.createDiv(
			"gantt-config-button-group"
		);

		["This Week", "This Month", "Next 3 Months", "This Year"].forEach(
			(range) => {
				const button = quickRangeButtons.createEl("button", {
					cls: "gantt-config-button gantt-config-button--small",
					text: range,
				});
				this.registerDomEvent(button, "click", () => {
					// Handle quick range selection
					let targetDate = new Date();
					switch (range) {
						case "This Week":
							// Go to start of current week
							targetDate.setDate(
								targetDate.getDate() - targetDate.getDay()
							);
							break;
						case "This Month":
							// Go to start of current month
							targetDate.setDate(1);
							break;
						case "Next 3 Months":
							// Go to start of next month
							targetDate.setMonth(targetDate.getMonth() + 1, 1);
							break;
						case "This Year":
							// Go to start of current year
							targetDate = new Date(
								targetDate.getFullYear(),
								0,
								1
							);
							break;
					}
					this.config.onScrollToDate(targetDate);
				});
			}
		);
	}

	private createToggleOption(
		container: HTMLElement,
		label: string,
		checked: boolean,
		onChange: (checked: boolean) => void
	) {
		const option = container.createDiv("gantt-config-toggle-option");
		const checkbox = option.createEl("input", {
			type: "checkbox",
			cls: "gantt-config-toggle-checkbox",
		}) as HTMLInputElement;
		checkbox.checked = checked;

		const labelEl = option.createSpan("gantt-config-toggle-label");
		labelEl.textContent = label;

		this.registerDomEvent(checkbox, "change", () => {
			onChange(checkbox.checked);
		});

		this.registerDomEvent(option, "click", (e) => {
			if (e.target !== checkbox) {
				checkbox.checked = !checkbox.checked;
				onChange(checkbox.checked);
			}
		});
	}

	private switchTab(tab: "grouping" | "filters" | "config") {
		if (tab === this.activeTab) return;

		// Update tab buttons
		this.tabsContainerEl
			.querySelectorAll(".gantt-tab-button")
			.forEach((btn, index) => {
				btn.removeClass("gantt-tab-button--active");
				if (
					(index === 0 && tab === "grouping") ||
					(index === 1 && tab === "filters") ||
					(index === 2 && tab === "config")
				) {
					btn.addClass("gantt-tab-button--active");
				}
			});

		// Update content panels
		this.contentContainerEl
			.querySelectorAll(".gantt-tab-panel")
			.forEach((panel) => {
				panel.removeClass("gantt-tab-panel--active");
				if (panel.getAttribute("data-tab") === tab) {
					panel.addClass("gantt-tab-panel--active");
				}
			});

		this.activeTab = tab;
	}

	// Public methods for updating from parent component
	public updateFilterOptions(tasks: Task[]) {
		if (this.filterComponent) {
			this.filterComponent.updateFilterOptions(tasks);
		}
	}

	public getActiveFilters(): ActiveFilter[] {
		return this.filterComponent?.getActiveFilters() || [];
	}

	public updateGroupingConfig(config: GroupingConfig) {
		if (this.groupingControls) {
			// Update grouping controls if needed
		}
	}

	onunload() {
		super.onunload();
		// Child components are automatically unloaded
	}
}
