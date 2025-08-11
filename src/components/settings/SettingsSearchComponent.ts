import { Component, setIcon } from "obsidian";
import { SettingsIndexer } from "./SettingsIndexer";
import { SearchResult } from "../../types/SettingsSearch";
import { t } from "../../translations/helper";
import { TaskProgressBarSettingTab } from "../../setting";

/**
 * 设置搜索组件
 * 提供设置项的搜索和导航功能
 * 继承 Component 以获得自动的事件生命周期管理
 */
export class SettingsSearchComponent extends Component {
	private settingTab: TaskProgressBarSettingTab;
	private indexer: SettingsIndexer;
	private containerEl: HTMLElement;
	private searchInputEl: HTMLInputElement;
	private resultsContainerEl: HTMLElement;
	private clearButton: HTMLElement;
	private currentResults: SearchResult[] = [];
	private selectedIndex = -1;
	private debounceTimer = 0;
	private isVisible = false;
	private blurTimeoutId = 0;

	constructor(settingTab: TaskProgressBarSettingTab, containerEl: HTMLElement) {
		super();
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
		this.searchInputEl.placeholder = t("Search settings...") + " (Ctrl+K)";
		this.searchInputEl.addClass("settings-search-input");
		this.searchInputEl.setAttribute("aria-label", t("Search settings"));
		this.searchInputEl.setAttribute("autocomplete", "off");
		this.searchInputEl.setAttribute("spellcheck", "false");

		// 创建清除按钮
		this.clearButton = searchInputContainer.createEl("button");
		this.clearButton.addClass("settings-search-clear");
		this.clearButton.setAttribute("aria-label", t("Clear search"));
		setIcon(this.clearButton, "x");
		this.clearButton.style.display = "none";

		// 创建搜索结果容器
		this.resultsContainerEl = searchContainer.createDiv();
		this.resultsContainerEl.addClass("settings-search-results");
		this.resultsContainerEl.style.display = "none";
		this.resultsContainerEl.setAttribute("role", "listbox");
		this.resultsContainerEl.setAttribute("aria-label", t("Search results"));
	}

	/**
	 * 设置事件监听器
	 * 使用 registerDomEvent 进行自动的生命周期管理
	 */
	private setupEventListeners(): void {
		// 清除按钮点击事件
		this.registerDomEvent(this.clearButton, "click", () => {
			this.clearSearch();
			this.searchInputEl.focus();
		});

		// 输入事件
		this.registerDomEvent(this.searchInputEl, "input", (e: Event) => {
			const query = (e.target as HTMLInputElement).value;
			this.handleSearchInput(query);
		});

		// 键盘事件
		this.registerDomEvent(this.searchInputEl, "keydown", (e: KeyboardEvent) => {
			this.handleKeyDown(e);
		});

		// 焦点事件
		this.registerDomEvent(this.searchInputEl, "focus", () => {
			if (this.currentResults.length > 0) {
				this.showResults();
			}
		});

		// 失去焦点事件
		this.registerDomEvent(this.searchInputEl, "blur", () => {
			// 延迟隐藏，允许点击搜索结果
			this.blurTimeoutId = window.setTimeout(() => {
				if (!this.resultsContainerEl.contains(document.activeElement)) {
					this.hideResults();
				}
			}, 200);
		});

		// 点击外部隐藏结果
		this.registerDomEvent(document, "click", (e: MouseEvent) => {
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
		this.clearButton.style.display = query.length > 0 ? "block" : "none";

		// 防抖搜索 - 减少延迟以提升响应速度
		clearTimeout(this.debounceTimer);
		this.debounceTimer = window.setTimeout(() => {
			this.performSearch(query);
		}, 100);
	}

	/**
	 * 执行搜索
	 */
	private performSearch(query: string): void {
		console.log(`[SettingsSearch] Performing search for: "${query}"`);

		if (query.length === 0) {
			console.log(`[SettingsSearch] Empty query, hiding results`);
			this.hideResults();
			return;
		}

		// 最少输入1个字符开始搜索，提升响应性
		if (query.length < 1) {
			console.log(`[SettingsSearch] Query too short (${query.length} chars), skipping search`);
			return;
		}

		// 增加搜索结果数量，让用户有更多选择
		this.currentResults = this.indexer.search(query, 12);
		this.selectedIndex = -1;

		console.log(`[SettingsSearch] Found ${this.currentResults.length} results:`);
		this.currentResults.forEach((result, index) => {
			console.log(`  ${index + 1}. ${result.item.name} (${result.matchType}, score: ${result.score})`);
		});

		if (this.currentResults.length > 0) {
			this.renderResults();
			this.showResults();
			// 自动选中第一个结果
			if (this.selectedIndex === -1) {
				this.setSelectedIndex(0);
			}
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

			// 使用 registerDomEvent 注册点击事件
			this.registerDomEvent(resultEl, "click", () => {
				this.selectResult(result);
			});

			// 使用 registerDomEvent 注册鼠标悬停事件
			this.registerDomEvent(resultEl, "mouseenter", () => {
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
				selectedEl.scrollIntoView({block: "nearest"});
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
		// 使用 register 注册 timeout 以确保正确清理
		const timeoutId = window.setTimeout(() => {
			this.scrollToSetting(settingId);
		}, 100);
		this.register(() => clearTimeout(timeoutId));
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
			const timeoutId = window.setTimeout(() => {
				settingElement.removeClass("settings-search-highlight");
			}, 2000);
			this.register(() => clearTimeout(timeoutId));
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
		this.clearButton.style.display = "none";
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
	 * 重写 onunload 方法以进行清理
	 * Component 会自动调用此方法
	 */
	onunload(): void {
		// 清理定时器
		clearTimeout(this.debounceTimer);
		clearTimeout(this.blurTimeoutId);

		// 清空容器
		this.containerEl.empty();

		// Component 基类会自动清理所有通过 registerDomEvent 注册的事件
	}

	/**
	 * 销毁组件（为了向后兼容保留此方法）
	 */
	public destroy(): void {
		this.unload();
	}
}
