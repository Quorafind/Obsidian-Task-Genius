import { Component, App, setIcon } from "obsidian";
import { createPopper, Instance as PopperInstance } from "@popperjs/core";
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
import { t } from "../../translations/helper";

interface ControlsPopoverConfig {
	triggerElement: HTMLElement;
	onGroupingChange: (config: GroupingConfig) => void;
	onFiltersChange: (filters: ActiveFilter[]) => void;
	onGroupToggle: (groupId: string) => void;
	onExpandCollapseAll: (expand: boolean) => void;
	onScrollToDate: (date: Date) => void;
	initialGroupingConfig: GroupingConfig;
	initialTasks: Task[];
	plugin: TaskProgressBarPlugin;
}

export class GanttControlsPopover extends Component {
	private triggerElement: HTMLElement;
	private popoverElement: HTMLElement | null = null;
	private popperInstance: PopperInstance | null = null;
	private isVisible: boolean = false;

	private groupingControls: GanttGroupingControls | null = null;
	private filterComponent: FilterComponent | null = null;
	private activeTab: "grouping" | "filters" | "config" = "grouping";

	constructor(private config: ControlsPopoverConfig) {
		super();
		this.triggerElement = config.triggerElement;
	}

	onload(): void {
		this.setupTrigger();
	}

	onunload(): void {
		this.hide();
		this.cleanup();
	}

	private setupTrigger(): void {
		// 设置触发按钮样式
		this.triggerElement.addClass("gantt-controls-trigger");
		this.triggerElement.setAttribute(
			"title",
			t("Configure grouping and filters")
		);

		// 添加图标
		this.triggerElement.empty();
		const iconEl = this.triggerElement.createDiv(
			"gantt-trigger-icon clickable-icon"
		);
		setIcon(iconEl, "sliders-horizontal");

		// 添加点击事件
		this.registerDomEvent(this.triggerElement, "click", (e) => {
			e.stopPropagation();
			this.toggle();
		});

		// 添加键盘支持
		this.triggerElement.setAttribute("tabindex", "0");
		this.registerDomEvent(this.triggerElement, "keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				this.toggle();
			}
		});
	}

	private createPopover(): void {
		if (this.popoverElement) return;

		// 创建弹出层容器
		this.popoverElement = document.body.createDiv("gantt-controls-popover");
		this.popoverElement.style.zIndex = "1000";

		// 创建箭头
		const arrow = this.popoverElement.createDiv("gantt-popover-arrow");
		arrow.setAttribute("data-popper-arrow", "");

		// 创建内容容器
		const content = this.popoverElement.createDiv("gantt-popover-content");

		// 创建头部
		this.createPopoverHeader(content);

		// 创建标签内容
		this.createTabContent(content);

		// 设置 Popper
		this.popperInstance = createPopper(
			this.triggerElement,
			this.popoverElement,
			{
				placement: "bottom-start",
				modifiers: [
					{
						name: "offset",
						options: {
							offset: [0, 8],
						},
					},
					{
						name: "preventOverflow",
						options: {
							boundary: "viewport",
							padding: 16,
						},
					},
					{
						name: "flip",
						options: {
							fallbackPlacements: [
								"bottom-end",
								"top-start",
								"top-end",
							],
						},
					},
				],
			}
		);

		// 添加外部点击关闭
		setTimeout(() => {
			this.registerDomEvent(document, "click", (e) => {
				if (
					!this.popoverElement?.contains(e.target as Node) &&
					!this.triggerElement.contains(e.target as Node)
				) {
					this.hide();
				}
			});
		}, 0);

		// 添加 ESC 键关闭
		this.registerDomEvent(document, "keydown", (e) => {
			if (e.key === "Escape" && this.isVisible) {
				this.hide();
			}
		});
	}

	private createPopoverHeader(container: HTMLElement): void {
		const header = container.createDiv("gantt-popover-header");

		// 标签按钮
		const tabsContainer = header.createDiv("gantt-popover-tabs");

		const groupingTab = tabsContainer.createDiv("gantt-popover-tab");
		if (this.activeTab === "grouping") {
			groupingTab.addClass("gantt-popover-tab--active");
		}
		const groupingIcon = groupingTab.createDiv("gantt-tab-icon");
		setIcon(groupingIcon, "layers");
		groupingTab.createSpan("gantt-tab-text").textContent = t("Grouping");

		const filtersTab = tabsContainer.createDiv("gantt-popover-tab");
		if (this.activeTab === "filters") {
			filtersTab.addClass("gantt-popover-tab--active");
		}
		const filtersIcon = filtersTab.createDiv("gantt-tab-icon");
		setIcon(filtersIcon, "filter");
		filtersTab.createSpan("gantt-tab-text").textContent = t("Filters");

		const configTab = tabsContainer.createDiv("gantt-popover-tab");
		if (this.activeTab === "config") {
			configTab.addClass("gantt-popover-tab--active");
		}
		const configIcon = configTab.createDiv("gantt-tab-icon");
		setIcon(configIcon, "settings");
		configTab.createSpan("gantt-tab-text").textContent = t("Config");

		// 标签点击事件
		this.registerDomEvent(groupingTab, "click", () =>
			this.switchTab("grouping")
		);
		this.registerDomEvent(filtersTab, "click", () =>
			this.switchTab("filters")
		);
		this.registerDomEvent(configTab, "click", () =>
			this.switchTab("config")
		);

		// 关闭按钮
		const closeButton = header.createDiv("gantt-popover-close");
		setIcon(closeButton, "x");
		this.registerDomEvent(closeButton, "click", () => this.hide());
	}

	private createTabContent(container: HTMLElement): void {
		const tabContent = container.createDiv("gantt-popover-tab-content");

		// 分组标签内容
		const groupingPanel = tabContent.createDiv("gantt-popover-panel");
		groupingPanel.setAttribute("data-tab", "grouping");
		if (this.activeTab === "grouping") {
			groupingPanel.addClass("gantt-popover-panel--active");
		}

		this.groupingControls = this.addChild(
			new GanttGroupingControls({
				container: groupingPanel,
				initialConfig: this.config.initialGroupingConfig,
				onChange: this.config.onGroupingChange,
				onToggleGroup: this.config.onGroupToggle,
				onExpandCollapseAll: this.config.onExpandCollapseAll,
			})
		);

		// 过滤器标签内容
		const filtersPanel = tabContent.createDiv("gantt-popover-panel");
		filtersPanel.setAttribute("data-tab", "filters");
		if (this.activeTab === "filters") {
			filtersPanel.addClass("gantt-popover-panel--active");
		}

		this.filterComponent = this.addChild(
			new FilterComponent(
				{
					container: filtersPanel,
					options: buildFilterOptionsFromTasks(
						this.config.initialTasks
					),
					onChange: this.config.onFiltersChange,
					components: [
						new ScrollToDateButton(
							filtersPanel,
							this.config.onScrollToDate
						),
					],
				},
				this.config.plugin
			)
		);

		// 配置标签内容
		const configPanel = tabContent.createDiv("gantt-popover-panel");
		configPanel.setAttribute("data-tab", "config");
		if (this.activeTab === "config") {
			configPanel.addClass("gantt-popover-panel--active");
		}
		this.createConfigPanel(configPanel);
	}

	private createConfigPanel(container: HTMLElement): void {
		const configContent = container.createDiv("gantt-config-content");

		// 视图选项
		const viewSection = configContent.createDiv("gantt-config-section");
		const viewHeader = viewSection.createDiv("gantt-config-section-header");

		const viewIcon = viewHeader.createDiv("gantt-config-section-icon");
		setIcon(viewIcon, "eye");
		viewHeader.createSpan("gantt-config-section-title").textContent =
			t("View Options");

		const viewOptions = viewSection.createDiv("gantt-config-options");
		this.createToggleOption(
			viewOptions,
			t("Show Task Labels"),
			true,
			() => {}
		);
		this.createToggleOption(
			viewOptions,
			t("Show Today Line"),
			true,
			() => {}
		);
		this.createToggleOption(
			viewOptions,
			t("Show Weekends"),
			true,
			() => {}
		);
		this.createToggleOption(
			viewOptions,
			t("Show Dependencies"),
			false,
			() => {}
		);

		// 时间范围快速选择
		const timeSection = configContent.createDiv("gantt-config-section");
		const timeHeader = timeSection.createDiv("gantt-config-section-header");

		const timeIcon = timeHeader.createDiv("gantt-config-section-icon");
		setIcon(timeIcon, "calendar");
		timeHeader.createSpan("gantt-config-section-title").textContent =
			t("Quick Navigation");

		const timeControls = timeSection.createDiv("gantt-config-controls");
		const quickRangeButtons = timeControls.createDiv(
			"gantt-config-button-group"
		);

		[
			t("Today"),
			t("This Week"),
			t("This Month"),
			t("Next 3 Months"),
		].forEach((range) => {
			const button = quickRangeButtons.createEl("button", {
				cls: "gantt-config-button gantt-config-button--small",
				text: range,
			});
			this.registerDomEvent(button, "click", () => {
				let targetDate = new Date();
				switch (range) {
					case "Today":
						break;
					case "This Week":
						targetDate.setDate(
							targetDate.getDate() - targetDate.getDay()
						);
						break;
					case "This Month":
						targetDate.setDate(1);
						break;
					case "Next 3 Months":
						targetDate.setMonth(targetDate.getMonth() + 1, 1);
						break;
				}
				this.config.onScrollToDate(targetDate);
				this.hide(); // 执行操作后关闭弹出层
			});
		});
	}

	private createToggleOption(
		container: HTMLElement,
		label: string,
		checked: boolean,
		onChange: (checked: boolean) => void
	): void {
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

	private switchTab(tab: "grouping" | "filters" | "config"): void {
		if (tab === this.activeTab || !this.popoverElement) return;

		this.activeTab = tab;

		// 更新标签按钮状态
		this.popoverElement
			.querySelectorAll(".gantt-popover-tab")
			.forEach((tabEl, index) => {
				tabEl.removeClass("gantt-popover-tab--active");
				if (
					(index === 0 && tab === "grouping") ||
					(index === 1 && tab === "filters") ||
					(index === 2 && tab === "config")
				) {
					tabEl.addClass("gantt-popover-tab--active");
				}
			});

		// 更新面板状态
		this.popoverElement
			.querySelectorAll(".gantt-popover-panel")
			.forEach((panel) => {
				panel.removeClass("gantt-popover-panel--active");
				if (panel.getAttribute("data-tab") === tab) {
					panel.addClass("gantt-popover-panel--active");
				}
			});
	}

	public show(): void {
		if (this.isVisible) return;

		this.createPopover();
		this.isVisible = true;
		this.triggerElement.addClass("gantt-controls-trigger--active");

		// 更新 Popper 位置
		if (this.popperInstance) {
			this.popperInstance.update();
		}
	}

	public hide(): void {
		if (!this.isVisible) return;

		this.isVisible = false;
		this.triggerElement.removeClass("gantt-controls-trigger--active");

		if (this.popoverElement) {
			this.popoverElement.style.transition =
				"opacity 0.15s ease, transform 0.15s ease";
			this.popoverElement.style.opacity = "0";
			this.popoverElement.style.transform = "translateY(-8px)";

			setTimeout(() => {
				this.cleanup();
			}, 150);
		}
	}

	public toggle(): void {
		if (this.isVisible) {
			this.hide();
		} else {
			this.show();
		}
	}

	private cleanup(): void {
		if (this.popperInstance) {
			this.popperInstance.destroy();
			this.popperInstance = null;
		}

		if (this.popoverElement) {
			this.popoverElement.remove();
			this.popoverElement = null;
		}
	}

	// 公共方法
	public updateFilterOptions(tasks: Task[]): void {
		if (this.filterComponent) {
			this.filterComponent.updateFilterOptions(tasks);
		}
	}

	public getActiveFilters(): ActiveFilter[] {
		return this.filterComponent?.getActiveFilters() || [];
	}

	public updateGroupingConfig(config: GroupingConfig): void {
		if (this.groupingControls) {
			this.groupingControls.updateConfig(config);
		}
	}
}
