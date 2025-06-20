import { Component, App, Modal, setIcon } from "obsidian";
import { createPopper, Instance as PopperInstance } from "@popperjs/core";
import TaskProgressBarPlugin from "../../index";

export interface GanttViewTab {
	id: string;
	name: string;
	config: GanttViewConfig;
	lastModified: number;
	isActive: boolean;
}

export interface GanttViewConfig {
	groupingConfig: any;
	filters: any[];
	viewSettings: any;
	dateRange?: {
		start: Date;
		end: Date;
	};
}

export interface GanttViewTabsOptions {
	container: HTMLElement;
	plugin: TaskProgressBarPlugin;
	onTabChange: (tab: GanttViewTab) => void;
	onTabCreate: (tab: GanttViewTab) => void;
	onTabDelete: (tabId: string) => void;
	onTabRename: (tabId: string, newName: string) => void;
}

export class GanttViewTabs extends Component {
	private container: HTMLElement;
	private plugin: TaskProgressBarPlugin;
	private onTabChange: (tab: GanttViewTab) => void;
	private onTabCreate: (tab: GanttViewTab) => void;
	private onTabDelete: (tabId: string) => void;
	private onTabRename: (tabId: string, newName: string) => void;

	private tabs: GanttViewTab[] = [];
	private activeTabId: string | null = null;
	private storageKey = "gantt-view-tabs";

	// UI Elements
	private tabsContainer: HTMLElement;
	private addTabButton: HTMLElement;
	private settingsButton: HTMLElement;
	private popperInstance: PopperInstance | null = null;

	constructor(options: GanttViewTabsOptions) {
		super();
		this.container = options.container;
		this.plugin = options.plugin;
		this.onTabChange = options.onTabChange;
		this.onTabCreate = options.onTabCreate;
		this.onTabDelete = options.onTabDelete;
		this.onTabRename = options.onTabRename;
	}

	onload(): void {
		this.loadTabsFromStorage();
		this.render();

		// 如果没有标签，创建默认标签
		if (this.tabs.length === 0) {
			this.createDefaultTab();
		}

		// 激活第一个标签或上次活动的标签
		this.activateInitialTab();
	}

	onunload(): void {
		this.saveTabsToStorage();
		if (this.popperInstance) {
			this.popperInstance.destroy();
			this.popperInstance = null;
		}
		this.container.empty();
	}

	private render(): void {
		this.container.empty();
		this.container.addClass("gantt-view-tabs");

		// 创建紧凑的标签栏
		this.createCompactTabBar();
	}

	private createCompactTabBar(): void {
		const tabBar = this.container.createDiv("gantt-tab-bar");

		// 标签容器（可滚动）
		this.tabsContainer = tabBar.createDiv("gantt-tabs-container");
		this.renderTabs();

		// 控制按钮容器
		const controlsContainer = tabBar.createDiv("gantt-tab-controls");

		// 添加标签按钮
		this.addTabButton = controlsContainer.createDiv("gantt-tab-add-button");
		setIcon(this.addTabButton, "plus");
		this.addTabButton.setAttribute("title", "Add new view");
		this.registerDomEvent(this.addTabButton, "click", () => this.createNewTab());

		// 设置按钮（打开 modal）
		this.settingsButton = controlsContainer.createDiv(
			"gantt-tab-settings-button"
		);
		setIcon(this.settingsButton, "settings");
		this.settingsButton.setAttribute("title", "View settings");
		this.registerDomEvent(this.settingsButton, "click", (e) =>
			this.openSettingsModal(e)
		);
	}

	private renderTabs(): void {
		this.tabsContainer.empty();

		this.tabs.forEach((tab) => {
			const tabElement = this.tabsContainer.createDiv("gantt-tab-item");
			if (tab.isActive) {
				tabElement.addClass("gantt-tab-item--active");
			}

			// 标签内容
			const tabContent = tabElement.createDiv("gantt-tab-content");

			const tabName = tabContent.createSpan("gantt-tab-name");
			tabName.textContent = tab.name;

			// 标签操作按钮
			const tabActions = tabElement.createDiv("gantt-tab-actions");

			// 重命名按钮
			const renameButton = tabActions.createDiv(
				"gantt-tab-action-button"
			);
			setIcon(renameButton, "edit");
			renameButton.setAttribute("title", "Rename view");

			// 删除按钮（只有在多个标签时显示）
			if (this.tabs.length > 1) {
				const deleteButton = tabActions.createDiv(
					"gantt-tab-action-button gantt-tab-delete-button"
				);
				setIcon(deleteButton, "x");
				deleteButton.setAttribute("title", "Delete view");
				this.registerDomEvent(deleteButton, "click", (e) => {
					e.stopPropagation();
					this.deleteTab(tab.id);
				});
			}

			// 事件监听器
			this.registerDomEvent(tabElement, "click", () =>
				this.activateTab(tab.id)
			);
			this.registerDomEvent(renameButton, "click", (e) => {
				e.stopPropagation();
				this.renameTab(tab.id);
			});

			// 右键菜单
			this.registerDomEvent(tabElement, "contextmenu", (e) => {
				e.preventDefault();
				this.showTabContextMenu(e, tab);
			});
		});
	}

	private createNewTab(): void {
		const newTab: GanttViewTab = {
			id: this.generateTabId(),
			name: `View ${this.tabs.length + 1}`,
			config: this.getDefaultConfig(),
			lastModified: Date.now(),
			isActive: false,
		};

		this.tabs.push(newTab);
		this.activateTab(newTab.id);
		this.renderTabs();
		this.saveTabsToStorage();
		this.onTabCreate(newTab);

		// 自动重命名新标签
		setTimeout(() => this.renameTab(newTab.id), 100);
	}

	private deleteTab(tabId: string): void {
		if (this.tabs.length <= 1) return; // 至少保留一个标签

		const tabIndex = this.tabs.findIndex((tab) => tab.id === tabId);
		if (tabIndex === -1) return;

		const wasActive = this.tabs[tabIndex].isActive;
		this.tabs.splice(tabIndex, 1);

		// 如果删除的是活动标签，激活相邻的标签
		if (wasActive) {
			const nextIndex = Math.min(tabIndex, this.tabs.length - 1);
			this.activateTab(this.tabs[nextIndex].id);
		}

		this.renderTabs();
		this.saveTabsToStorage();
		this.onTabDelete(tabId);
	}

	private renameTab(tabId: string): void {
		const tab = this.tabs.find((t) => t.id === tabId);
		if (!tab) return;

		const modal = new TabRenameModal(
			this.plugin.app,
			tab.name,
			(newName) => {
				if (newName && newName.trim()) {
					tab.name = newName.trim();
					tab.lastModified = Date.now();
					this.renderTabs();
					this.saveTabsToStorage();
					this.onTabRename(tabId, newName.trim());
				}
			}
		);
		modal.open();
	}

	private activateTab(tabId: string): void {
		// 取消激活所有标签
		this.tabs.forEach((tab) => (tab.isActive = false));

		// 激活选中的标签
		const tab = this.tabs.find((t) => t.id === tabId);
		if (tab) {
			tab.isActive = true;
			this.activeTabId = tabId;
			this.renderTabs();
			this.saveTabsToStorage();
			this.onTabChange(tab);
		}
	}

	private showTabContextMenu(event: MouseEvent, tab: GanttViewTab): void {
		// 创建上下文菜单
		const menu = this.container.createDiv("gantt-tab-context-menu");
		menu.style.position = "absolute";
		menu.style.left = `${event.clientX}px`;
		menu.style.top = `${event.clientY}px`;
		menu.style.zIndex = "1000";

		// 重命名选项
		const renameOption = menu.createDiv("gantt-context-menu-item");
		renameOption.textContent = "Rename";
		this.registerDomEvent(renameOption, "click", () => {
			this.renameTab(tab.id);
			menu.remove();
		});

		// 复制选项
		const duplicateOption = menu.createDiv("gantt-context-menu-item");
		duplicateOption.textContent = "Duplicate";
		this.registerDomEvent(duplicateOption, "click", () => {
			this.duplicateTab(tab.id);
			menu.remove();
		});

		// 删除选项（如果有多个标签）
		if (this.tabs.length > 1) {
			const deleteOption = menu.createDiv(
				"gantt-context-menu-item gantt-context-menu-item--danger"
			);
			deleteOption.textContent = "Delete";
			this.registerDomEvent(deleteOption, "click", () => {
				this.deleteTab(tab.id);
				menu.remove();
			});
		}

		// 点击外部关闭菜单
		const closeMenu = (e: MouseEvent) => {
			if (!menu.contains(e.target as Node)) {
				menu.remove();
				document.removeEventListener("click", closeMenu);
			}
		};
		setTimeout(() => document.addEventListener("click", closeMenu), 0);
	}

	private duplicateTab(tabId: string): void {
		const originalTab = this.tabs.find((t) => t.id === tabId);
		if (!originalTab) return;

		const newTab: GanttViewTab = {
			id: this.generateTabId(),
			name: `${originalTab.name} Copy`,
			config: JSON.parse(JSON.stringify(originalTab.config)), // 深拷贝配置
			lastModified: Date.now(),
			isActive: false,
		};

		this.tabs.push(newTab);
		this.activateTab(newTab.id);
		this.renderTabs();
		this.saveTabsToStorage();
		this.onTabCreate(newTab);
	}

	private openSettingsModal(event: MouseEvent): void {
		const modal = new GanttViewSettingsModal(this.plugin.app, {
			tabs: this.tabs,
			onTabsReorder: (reorderedTabs) => {
				this.tabs = reorderedTabs;
				this.renderTabs();
				this.saveTabsToStorage();
			},
			onExportTabs: () => this.exportTabs(),
			onImportTabs: (importedTabs) => this.importTabs(importedTabs),
			onResetTabs: () => this.resetTabs(),
		});
		modal.open();
	}

	private createDefaultTab(): void {
		const defaultTab: GanttViewTab = {
			id: this.generateTabId(),
			name: "Default View",
			config: this.getDefaultConfig(),
			lastModified: Date.now(),
			isActive: true,
		};
		this.tabs.push(defaultTab);
	}

	private activateInitialTab(): void {
		const activeTab = this.tabs.find((tab) => tab.isActive) || this.tabs[0];
		if (activeTab) {
			this.activateTab(activeTab.id);
		}
	}

	private getDefaultConfig(): GanttViewConfig {
		return {
			groupingConfig: {
				primaryGroupBy: "none",
				secondaryGroupBy: "none",
				showGroupHeaders: true,
				collapsibleGroups: true,
				defaultExpanded: true,
			},
			filters: [],
			viewSettings: {
				showTaskLabels: true,
				showToday: true,
				showWeekends: true,
			},
		};
	}

	private generateTabId(): string {
		return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	private loadTabsFromStorage(): void {
		try {
			const stored = localStorage.getItem(this.storageKey);
			if (stored) {
				this.tabs = JSON.parse(stored);
				// 确保只有一个活动标签
				let hasActive = false;
				this.tabs.forEach((tab) => {
					if (tab.isActive && !hasActive) {
						hasActive = true;
					} else {
						tab.isActive = false;
					}
				});
			}
		} catch (error) {
			console.error("Failed to load tabs from storage:", error);
			this.tabs = [];
		}
	}

	private saveTabsToStorage(): void {
		try {
			localStorage.setItem(this.storageKey, JSON.stringify(this.tabs));
		} catch (error) {
			console.error("Failed to save tabs to storage:", error);
		}
	}

	private exportTabs(): string {
		return JSON.stringify(this.tabs, null, 2);
	}

	private importTabs(importedData: string): void {
		try {
			const importedTabs = JSON.parse(importedData) as GanttViewTab[];
			// 验证导入的数据
			if (Array.isArray(importedTabs) && importedTabs.length > 0) {
				// 重新生成 ID 以避免冲突
				importedTabs.forEach((tab) => {
					tab.id = this.generateTabId();
					tab.isActive = false;
				});
				this.tabs = [...this.tabs, ...importedTabs];
				this.renderTabs();
				this.saveTabsToStorage();
			}
		} catch (error) {
			console.error("Failed to import tabs:", error);
		}
	}

	private resetTabs(): void {
		this.tabs = [];
		this.createDefaultTab();
		this.activateInitialTab();
		this.renderTabs();
		this.saveTabsToStorage();
	}

	// 公共方法
	public getActiveTab(): GanttViewTab | null {
		return this.tabs.find((tab) => tab.isActive) || null;
	}

	public updateActiveTabConfig(config: Partial<GanttViewConfig>): void {
		const activeTab = this.getActiveTab();
		if (activeTab) {
			activeTab.config = { ...activeTab.config, ...config };
			activeTab.lastModified = Date.now();
			this.saveTabsToStorage();
		}
	}

	public getAllTabs(): GanttViewTab[] {
		return [...this.tabs];
	}
}

// 重命名模态框
class TabRenameModal extends Modal {
	private currentName: string;
	private onRename: (newName: string) => void;

	constructor(
		app: App,
		currentName: string,
		onRename: (newName: string) => void
	) {
		super(app);
		this.currentName = currentName;
		this.onRename = onRename;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("gantt-rename-modal");

		// 标题
		contentEl.createEl("h3", { text: "Rename View" });

		// 输入框
		const input = contentEl.createEl("input", {
			type: "text",
			value: this.currentName,
			cls: "gantt-rename-input",
		});
		input.focus();
		input.select();

		// 按钮容器
		const buttonContainer = contentEl.createDiv("gantt-modal-buttons");

		// 取消按钮
		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
			cls: "gantt-modal-button gantt-modal-button--secondary",
		});
		cancelButton.addEventListener("click", () => this.close());

		// 确认按钮
		const confirmButton = buttonContainer.createEl("button", {
			text: "Rename",
			cls: "gantt-modal-button gantt-modal-button--primary",
		});
		confirmButton.addEventListener("click", () => {
			this.onRename(input.value);
			this.close();
		});

		// Enter 键确认
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				this.onRename(input.value);
				this.close();
			} else if (e.key === "Escape") {
				this.close();
			}
		});
	}
}

// 设置模态框
class GanttViewSettingsModal extends Modal {
	private options: {
		tabs: GanttViewTab[];
		onTabsReorder: (tabs: GanttViewTab[]) => void;
		onExportTabs: () => string;
		onImportTabs: (data: string) => void;
		onResetTabs: () => void;
	};

	constructor(app: App, options: any) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("gantt-settings-modal");

		// 标题
		contentEl.createEl("h2", { text: "Gantt View Settings" });

		// 标签管理部分
		this.createTabManagementSection(contentEl);

		// 导入导出部分
		this.createImportExportSection(contentEl);

		// 重置部分
		this.createResetSection(contentEl);
	}

	private createTabManagementSection(container: HTMLElement): void {
		const section = container.createDiv("gantt-settings-section");
		section.createEl("h3", { text: "Manage Views" });

		const tabsList = section.createDiv("gantt-tabs-list");
		this.options.tabs.forEach((tab, index) => {
			const tabItem = tabsList.createDiv("gantt-tab-list-item");

			const tabInfo = tabItem.createDiv("gantt-tab-info");
			tabInfo.createSpan("gantt-tab-list-name").textContent = tab.name;
			tabInfo.createSpan(
				"gantt-tab-list-modified"
			).textContent = `Modified: ${new Date(
				tab.lastModified
			).toLocaleDateString()}`;

			const tabActions = tabItem.createDiv("gantt-tab-list-actions");

			// 上移按钮
			if (index > 0) {
				const upButton = tabActions.createEl("button", { text: "↑" });
				upButton.addEventListener("click", () => {
					[this.options.tabs[index], this.options.tabs[index - 1]] = [
						this.options.tabs[index - 1],
						this.options.tabs[index],
					];
					this.options.onTabsReorder(this.options.tabs);
					this.onOpen(); // 重新渲染
				});
			}

			// 下移按钮
			if (index < this.options.tabs.length - 1) {
				const downButton = tabActions.createEl("button", { text: "↓" });
				downButton.addEventListener("click", () => {
					[this.options.tabs[index], this.options.tabs[index + 1]] = [
						this.options.tabs[index + 1],
						this.options.tabs[index],
					];
					this.options.onTabsReorder(this.options.tabs);
					this.onOpen(); // 重新渲染
				});
			}
		});
	}

	private createImportExportSection(container: HTMLElement): void {
		const section = container.createDiv("gantt-settings-section");
		section.createEl("h3", { text: "Import / Export" });

		// 导出按钮
		const exportButton = section.createEl("button", {
			text: "Export Views",
			cls: "gantt-modal-button",
		});
		exportButton.addEventListener("click", () => {
			const data = this.options.onExportTabs();
			navigator.clipboard.writeText(data).then(() => {
				// 显示成功消息
				const message = section.createDiv("gantt-success-message");
				message.textContent = "Views exported to clipboard!";
				setTimeout(() => message.remove(), 3000);
			});
		});

		// 导入区域
		const importArea = section.createDiv("gantt-import-area");
		const importTextarea = importArea.createEl("textarea", {
			placeholder: "Paste exported view data here...",
			cls: "gantt-import-textarea",
		});

		const importButton = importArea.createEl("button", {
			text: "Import Views",
			cls: "gantt-modal-button",
		});
		importButton.addEventListener("click", () => {
			if (importTextarea.value.trim()) {
				this.options.onImportTabs(importTextarea.value.trim());
				importTextarea.value = "";
				this.onOpen(); // 重新渲染
			}
		});
	}

	private createResetSection(container: HTMLElement): void {
		const section = container.createDiv("gantt-settings-section");
		section.createEl("h3", { text: "Reset" });

		const resetButton = section.createEl("button", {
			text: "Reset All Views",
			cls: "gantt-modal-button gantt-modal-button--danger",
		});
		resetButton.addEventListener("click", () => {
			if (
				confirm(
					"Are you sure you want to reset all views? This cannot be undone."
				)
			) {
				this.options.onResetTabs();
				this.close();
			}
		});
	}
}
