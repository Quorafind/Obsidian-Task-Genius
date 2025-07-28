import { setIcon } from "obsidian";
import { SettingsIndexer } from "./SettingsIndexer";
import { SearchResult } from "../../types/SettingsSearch";
import { t } from "../../translations/helper";
import { TaskProgressBarSettingTab } from "../../setting";

/**
 * 设置搜索组件
 * 提供设置项的搜索和导航功能
 */
export class SettingsSearchComponent {
	private settingTab: TaskProgressBarSettingTab;
	private indexer: SettingsIndexer;
	private containerEl: HTMLElement;
	private searchInputEl: HTMLInputElement;
	private resultsContainerEl: HTMLElement;
	private currentResults: SearchResult[] = [];
	private selectedIndex: number = -1;
	private debounceTimer: number = 0;
	private isVisible: boolean = false;

	constructor(settingTab: TaskProgressBarSettingTab, containerEl: HTMLElement) {
		this.settingTab = settingTab;
		this.indexer = new SettingsIndexer();
		this.containerEl = containerEl;
		
		this.createSearchUI();
		this.setupEventListeners();
	}

	/**
	 * 创建搜索界面
	 */
	private createSearchUI(): void {
		// 创建搜索容器
		const searchContainer = this.containerEl.createDiv();
		searchContainer.addClass("settings-search-container");

		// 创建搜索输入框容器
		const searchInputContainer = searchContainer.createDiv();
		searchInputContainer.addClass("settings-search-input-container");

		// 创建搜索图标
		const searchIcon = searchInputContainer.createSpan();
		searchIcon.addClass("settings-search-icon");
		setIcon(searchIcon, "search");

		// 创建搜索输入框
		this.searchInputEl = searchInputContainer.createEl("input");
		this.searchInputEl.type = "text";
		this.searchInputEl.placeholder = t("Search settings...");
		this.searchInputEl.addClass("settings-search-input");

		// 创建清除按钮
		const clearButton = searchInputContainer.createEl("button");
		clearButton.addClass("settings-search-clear");
		clearButton.setAttribute("aria-label", t("Clear search"));
		setIcon(clearButton, "x");
		clearButton.style.display = "none";

		// 创建搜索结果容器
		this.resultsContainerEl = searchContainer.createDiv();
		this.resultsContainerEl.addClass("settings-search-results");
		this.resultsContainerEl.style.display = "none";

		// 清除按钮点击事件
		clearButton.addEventListener("click", () => {
			this.clearSearch();
		});
	}

	/**
	 * 设置事件监听器
	 */
	private setupEventListeners(): void {
		// 输入事件
		this.searchInputEl.addEventListener("input", (e) => {
			const query = (e.target as HTMLInputElement).value;
			this.handleSearchInput(query);
		});

		// 键盘事件
		this.searchInputEl.addEventListener("keydown", (e) => {
			this.handleKeyDown(e);
		});

		// 焦点事件
		this.searchInputEl.addEventListener("focus", () => {
			if (this.currentResults.length > 0) {
				this.showResults();
			}
		});

		// 失去焦点事件
		this.searchInputEl.addEventListener("blur", (e) => {
			// 延迟隐藏，允许点击搜索结果
			setTimeout(() => {
				if (!this.resultsContainerEl.contains(document.activeElement)) {
					this.hideResults();
				}
			}, 200);
		});

		// 点击外部隐藏结果
		document.addEventListener("click", (e) => {
			if (!this.containerEl.contains(e.target as Node)) {
				this.hideResults();
			}
		});
	}

	/**
	 * 处理搜索输入
	 */
	private handleSearchInput(query: string): void {
		// 更新清除按钮显示状态
		const clearButton = this.containerEl.querySelector(".settings-search-clear") as HTMLElement;
		if (clearButton) {
			clearButton.style.display = query.length > 0 ? "block" : "none";
		}

		// 防抖搜索
		clearTimeout(this.debounceTimer);
		this.debounceTimer = window.setTimeout(() => {
			this.performSearch(query);
		}, 150);
	}

	/**
	 * 执行搜索
	 */
	private performSearch(query: string): void {
		if (query.length === 0) {
			this.hideResults();
			return;
		}

		// 最少输入2个字符开始搜索
		if (query.length < 2) {
			return;
		}

		this.currentResults = this.indexer.search(query, 8);
		this.selectedIndex = -1;
		
		if (this.currentResults.length > 0) {
			this.renderResults();
			this.showResults();
		} else {
			this.renderNoResults();
			this.showResults();
		}
	}

	/**
	 * 渲染搜索结果
	 */
	private renderResults(): void {
		this.resultsContainerEl.empty();

		this.currentResults.forEach((result, index) => {
			const resultEl = this.resultsContainerEl.createDiv();
			resultEl.addClass("settings-search-result");
			resultEl.setAttribute("data-index", index.toString());

			// 设置项名称
			const nameEl = resultEl.createDiv();
			nameEl.addClass("settings-search-result-name");
			nameEl.textContent = result.item.name;

			// 所属分类和标签页
			const metaEl = resultEl.createDiv();
			metaEl.addClass("settings-search-result-meta");
			
			const categoryEl = metaEl.createSpan();
			categoryEl.addClass("settings-search-result-category");
			categoryEl.textContent = this.getCategoryDisplayName(result.item.category);

			// 描述（如果有）
			if (result.item.description && result.matchType === 'description') {
				const descEl = resultEl.createDiv();
				descEl.addClass("settings-search-result-desc");
				descEl.textContent = this.truncateText(result.item.description, 80);
			}

			// 点击事件
			resultEl.addEventListener("click", () => {
				this.selectResult(result);
			});

			// 鼠标悬停事件
			resultEl.addEventListener("mouseenter", () => {
				this.setSelectedIndex(index);
			});
		});
	}

	/**
	 * 渲染无结果状态
	 */
	private renderNoResults(): void {
		this.resultsContainerEl.empty();
		
		const noResultEl = this.resultsContainerEl.createDiv();
		noResultEl.addClass("settings-search-no-result");
		noResultEl.textContent = t("No settings found");
	}

	/**
	 * 处理键盘事件
	 */
	private handleKeyDown(e: KeyboardEvent): void {
		if (!this.isVisible || this.currentResults.length === 0) {
			if (e.key === "Escape") {
				this.clearSearch();
			}
			return;
		}

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				this.moveSelection(1);
				break;
			case "ArrowUp":
				e.preventDefault();
				this.moveSelection(-1);
				break;
			case "Enter":
				e.preventDefault();
				if (this.selectedIndex >= 0 && this.currentResults[this.selectedIndex]) {
					this.selectResult(this.currentResults[this.selectedIndex]);
				}
				break;
			case "Escape":
				e.preventDefault();
				this.clearSearch();
				break;
		}
	}

	/**
	 * 移动选择
	 */
	private moveSelection(direction: number): void {
		const newIndex = this.selectedIndex + direction;
		
		if (newIndex >= 0 && newIndex < this.currentResults.length) {
			this.setSelectedIndex(newIndex);
		}
	}

	/**
	 * 设置选中索引
	 */
	private setSelectedIndex(index: number): void {
		// 移除之前的选中状态
		const previousSelected = this.resultsContainerEl.querySelector(".settings-search-result-selected");
		if (previousSelected) {
			previousSelected.removeClass("settings-search-result-selected");
		}

		this.selectedIndex = index;

		// 添加新的选中状态
		if (index >= 0) {
			const selectedEl = this.resultsContainerEl.querySelector(`[data-index="${index}"]`);
			if (selectedEl) {
				selectedEl.addClass("settings-search-result-selected");
				selectedEl.scrollIntoView({ block: "nearest" });
			}
		}
	}

	/**
	 * 选择搜索结果
	 */
	private selectResult(result: SearchResult): void {
		// 跳转到对应的标签页和设置项
		this.navigateToSetting(result.item.tabId, result.item.id);
		
		// 清除搜索
		this.clearSearch();
	}

	/**
	 * 导航到指定设置项
	 */
	private navigateToSetting(tabId: string, settingId: string): void {
		// 切换到对应标签页
		this.settingTab.switchToTab(tabId);
		
		// 延迟滚动到设置项（等待标签页切换完成）
		setTimeout(() => {
			this.scrollToSetting(settingId);
		}, 100);
	}

	/**
	 * 滚动到指定设置项
	 */
	private scrollToSetting(settingId: string): void {
		// 查找具有对应ID的设置项元素
		const settingElement = this.containerEl.querySelector(`[data-setting-id="${settingId}"]`);
		
		if (settingElement) {
			// 滚动到设置项
			settingElement.scrollIntoView({ 
				behavior: "smooth", 
				block: "center" 
			});
			
			// 添加临时高亮效果
			settingElement.addClass("settings-search-highlight");
			setTimeout(() => {
				settingElement.removeClass("settings-search-highlight");
			}, 2000);
		}
	}

	/**
	 * 显示搜索结果
	 */
	private showResults(): void {
		this.resultsContainerEl.style.display = "block";
		this.isVisible = true;
	}

	/**
	 * 隐藏搜索结果
	 */
	private hideResults(): void {
		this.resultsContainerEl.style.display = "none";
		this.isVisible = false;
		this.selectedIndex = -1;
	}

	/**
	 * 清除搜索
	 */
	private clearSearch(): void {
		this.searchInputEl.value = "";
		this.currentResults = [];
		this.hideResults();
		
		// 隐藏清除按钮
		const clearButton = this.containerEl.querySelector(".settings-search-clear") as HTMLElement;
		if (clearButton) {
			clearButton.style.display = "none";
		}
	}

	/**
	 * 获取分类显示名称
	 */
	private getCategoryDisplayName(category: string): string {
		const categoryNames: Record<string, string> = {
			core: t("Core Settings"),
			display: t("Display & Progress"),
			management: t("Task Management"),
			workflow: t("Workflow & Automation"),
			gamification: t("Gamification"),
			integration: t("Integration"),
			advanced: t("Advanced"),
			info: t("Information")
		};
		
		return categoryNames[category] || category;
	}

	/**
	 * 截断文本
	 */
	private truncateText(text: string, maxLength: number): string {
		if (text.length <= maxLength) {
			return text;
		}
		return text.substring(0, maxLength - 3) + "...";
	}

	/**
	 * 销毁组件
	 */
	public destroy(): void {
		clearTimeout(this.debounceTimer);
		// 移除事件监听器等清理工作
		this.containerEl.empty();
	}
}