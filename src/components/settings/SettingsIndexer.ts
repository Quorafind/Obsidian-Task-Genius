import { prepareFuzzySearch } from "obsidian";
import { SETTINGS_METADATA } from "../../common/settings-metadata";
import {
	SettingsSearchIndex,
	SettingSearchItem,
	SearchResult,
} from "../../types/SettingsSearch";
import { t } from "../../translations/helper";

/**
 * 高性能设置项索引器
 * 提供快速的设置项搜索和导航功能
 */
export class SettingsIndexer {
	private index: SettingsSearchIndex;
	private isInitialized: boolean = false;
	private rootEl: HTMLElement | null = null;

	constructor(rootEl?: HTMLElement | null) {
		this.index = {
			items: [],
			keywordMap: new Map(),
			tabMap: new Map(),
		};
		this.rootEl = rootEl ?? null;
	}

	/**
	 * 初始化索引 - 懒加载模式
	 */
	public initialize(): void {
		if (this.isInitialized) return;

		const startTime = performance.now();

		// 优先从 DOM 构建；如果不可用，则回退到静态元数据
		if (this.rootEl) {
			this.buildIndexFromDOM(this.rootEl);
		} else {
			this.buildIndexFromStatic();
		}

		const endTime = performance.now();
		console.log(
			`[SettingsIndexer] Index built in ${(endTime - startTime).toFixed(
				2
			)}ms with ${this.index.items.length} items`
		);

		this.isInitialized = true;
	}

	/**
	 * 从静态 SETTINGS_METADATA 构建索引（回退）
	 */
	private buildIndexFromStatic(): void {
		for (const item of SETTINGS_METADATA) {
			const translatedItem: SettingSearchItem = {
				...item,
				name: t(item.translationKey),
				description: item.descriptionKey
					? t(item.descriptionKey)
					: item.description,
			};
			this.addItemToIndex(translatedItem);
		}
	}

	/**
	 * 从 DOM 收集所有设置项，自动生成可导航的 ID、关键字等
	 */
	private buildIndexFromDOM(root: HTMLElement): void {
		// 查找所有设置 section
		const sectionEls = Array.from(
			root.querySelectorAll<HTMLElement>(".settings-tab-section")
		);
		const seenIds = new Set<string>();

		sectionEls.forEach((section) => {
			const tabId = section.getAttribute("data-tab-id") || "general";
			const category = section.getAttribute("data-category") || "core";

			const settingItems = Array.from(
				section.querySelectorAll<HTMLElement>(".setting-item")
			);
			settingItems.forEach((el, idx) => {
				const nameEl =
					el.querySelector<HTMLElement>(".setting-item-name");
				const descEl = el.querySelector<HTMLElement>(
					".setting-item-description"
				);
				const name = (nameEl?.textContent || "").trim();
				const description = (descEl?.textContent || "").trim();

				if (!name) return; // 跳过无名设置项（如纯容器/标题）

				// 复用已有 ID，否则生成稳定 ID
				let id = el.getAttribute("data-setting-id");
				if (!id || seenIds.has(id)) {
					id = this.generateStableId(tabId, name, idx);
					el.setAttribute("data-setting-id", id);
				}
				seenIds.add(id);

				const keywords = this.generateKeywords(name, description);

				const item: SettingSearchItem = {
					id,
					tabId,
					name,
					description: description || undefined,
					keywords,
					translationKey: name, // 已经是展示文案
					descriptionKey: description || undefined,
					category,
				};

				this.addItemToIndex(item);
			});
		});
	}

	private addItemToIndex(item: SettingSearchItem): void {
		this.index.items.push(item);

		// 关键词映射
		for (const keyword of item.keywords) {
			const normalizedKeyword = keyword.toLowerCase();
			if (!this.index.keywordMap.has(normalizedKeyword)) {
				this.index.keywordMap.set(normalizedKeyword, []);
			}
			this.index.keywordMap.get(normalizedKeyword)!.push(item.id);
		}

		// 标签页映射
		if (!this.index.tabMap.has(item.tabId)) {
			this.index.tabMap.set(item.tabId, []);
		}
		this.index.tabMap.get(item.tabId)!.push(item);
	}

	private generateStableId(tabId: string, name: string, idx: number): string {
		const slug = name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
		return `${tabId}-${slug || "setting"}-${idx}`;
	}

	private generateKeywords(name: string, description?: string): string[] {
		const text = `${name} ${description || ""}`.toLowerCase();
		const tokens = text
			.replace(/[^a-z0-9\s]+/g, " ")
			.split(/\s+/)
			.filter(Boolean);
		// 去重并限制数量，优先较长的词
		const uniq = Array.from(new Set(tokens));
		return uniq.sort((a, b) => b.length - a.length).slice(0, 12);
	}

	/**
	 * 构建设置项索引
	 */
	private buildIndex(): void {
		// 向后兼容：保留方法名，但内部不再使用；索引在 initialize 中构建
		this.index.items.length = 0;
		this.index.keywordMap.clear();
		this.index.tabMap.clear();
		if (this.rootEl) {
			this.buildIndexFromDOM(this.rootEl);
		} else {
			this.buildIndexFromStatic();
		}
	}

	/**
	 * 搜索设置项
	 * @param query 搜索查询
	 * @param maxResults 最大结果数量
	 * @returns 搜索结果数组
	 */
	public search(query: string, maxResults: number = 10): SearchResult[] {
		if (!this.isInitialized) {
			this.initialize();
		}

		if (!query || query.trim().length < 2) {
			return [];
		}

		const normalizedQuery = query.toLowerCase().trim();
		const results: SearchResult[] = [];
		const seenIds = new Set<string>();

		// 使用 Obsidian 的模糊搜索
		const fuzzySearch = prepareFuzzySearch(normalizedQuery);

		// 搜索设置项名称
		for (const item of this.index.items) {
			if (seenIds.has(item.id)) continue;

			const nameMatch = fuzzySearch(item.name.toLowerCase());
			if (nameMatch) {
				results.push({
					item,
					score: this.calculateScore(
						normalizedQuery,
						item.name,
						"name"
					),
					matchType: "name",
				});
				seenIds.add(item.id);
			}
		}

		// 搜索设置项描述
		for (const item of this.index.items) {
			if (seenIds.has(item.id) || !item.description) continue;

			const descMatch = fuzzySearch(item.description.toLowerCase());
			if (descMatch) {
				results.push({
					item,
					score: this.calculateScore(
						normalizedQuery,
						item.description,
						"description"
					),
					matchType: "description",
				});
				seenIds.add(item.id);
			}
		}

		// 搜索关键词
		for (const item of this.index.items) {
			if (seenIds.has(item.id)) continue;

			for (const keyword of item.keywords) {
				const keywordMatch = fuzzySearch(keyword.toLowerCase());
				if (keywordMatch) {
					results.push({
						item,
						score: this.calculateScore(
							normalizedQuery,
							keyword,
							"keyword"
						),
						matchType: "keyword",
					});
					seenIds.add(item.id);
					break; // 只需要一个关键词匹配即可
				}
			}
		}

		// 按分数排序并限制结果数量
		return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
	}

	/**
	 * 计算匹配分数
	 * @param query 查询字符串
	 * @param target 目标字符串
	 * @param matchType 匹配类型
	 * @returns 匹配分数
	 */
	private calculateScore(
		query: string,
		target: string,
		matchType: "name" | "description" | "keyword"
	): number {
		const lowerTarget = target.toLowerCase();
		const lowerQuery = query.toLowerCase();

		let score = 0;

		// 基础分数根据匹配类型
		const baseScores = {
			name: 100,
			description: 60,
			keyword: 80,
		};
		score += baseScores[matchType];

		// 精确匹配加分
		if (lowerTarget.includes(lowerQuery)) {
			score += 50;

			// 开头匹配额外加分
			if (lowerTarget.startsWith(lowerQuery)) {
				score += 30;
			}
		}

		// 长度相似性加分
		const lengthRatio = Math.min(query.length / target.length, 1);
		score += lengthRatio * 20;

		return score;
	}

	/**
	 * 根据标签页ID获取设置项
	 * @param tabId 标签页ID
	 * @returns 设置项数组
	 */
	public getItemsByTab(tabId: string): SettingSearchItem[] {
		if (!this.isInitialized) {
			this.initialize();
		}

		return this.index.tabMap.get(tabId) || [];
	}

	/**
	 * 根据设置项ID获取设置项
	 * @param itemId 设置项ID
	 * @returns 设置项或undefined
	 */
	public getItemById(itemId: string): SettingSearchItem | undefined {
		if (!this.isInitialized) {
			this.initialize();
		}

		return this.index.items.find((item) => item.id === itemId);
	}

	/**
	 * 获取所有可用的标签页ID
	 * @returns 标签页ID数组
	 */
	public getAllTabIds(): string[] {
		if (!this.isInitialized) {
			this.initialize();
		}

		return Array.from(this.index.tabMap.keys());
	}

	/**
	 * 获取索引统计信息
	 * @returns 索引统计
	 */
	public getStats(): {
		itemCount: number;
		tabCount: number;
		keywordCount: number;
	} {
		if (!this.isInitialized) {
			this.initialize();
		}

		return {
			itemCount: this.index.items.length,
			tabCount: this.index.tabMap.size,
			keywordCount: this.index.keywordMap.size,
		};
	}
}
