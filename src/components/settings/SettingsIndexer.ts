import { prepareFuzzySearch } from "obsidian";
import { SETTINGS_METADATA } from "../../data/settings-metadata";
import { SettingsSearchIndex, SettingSearchItem, SearchResult } from "../../types/SettingsSearch";
import { t } from "../../translations/helper";

/**
 * 高性能设置项索引器
 * 提供快速的设置项搜索和导航功能
 */
export class SettingsIndexer {
	private index: SettingsSearchIndex;
	private isInitialized: boolean = false;

	constructor() {
		this.index = {
			items: [],
			keywordMap: new Map(),
			tabMap: new Map()
		};
	}

	/**
	 * 初始化索引 - 懒加载模式
	 */
	public initialize(): void {
		if (this.isInitialized) {
			return;
		}

		const startTime = performance.now();
		
		// 构建索引
		this.buildIndex();
		
		const endTime = performance.now();
		console.log(`Settings index built in ${(endTime - startTime).toFixed(2)}ms`);
		
		this.isInitialized = true;
	}

	/**
	 * 构建设置项索引
	 */
	private buildIndex(): void {
		// 处理每个设置项
		for (const item of SETTINGS_METADATA) {
			// 翻译设置项名称和描述
			const translatedItem: SettingSearchItem = {
				...item,
				name: t(item.translationKey),
				description: item.descriptionKey ? t(item.descriptionKey) : item.description
			};

			this.index.items.push(translatedItem);

			// 构建关键词映射
			for (const keyword of item.keywords) {
				const normalizedKeyword = keyword.toLowerCase();
				if (!this.index.keywordMap.has(normalizedKeyword)) {
					this.index.keywordMap.set(normalizedKeyword, []);
				}
				this.index.keywordMap.get(normalizedKeyword)!.push(item.id);
			}

			// 构建标签页映射
			if (!this.index.tabMap.has(item.tabId)) {
				this.index.tabMap.set(item.tabId, []);
			}
			this.index.tabMap.get(item.tabId)!.push(translatedItem);
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

		if (!query || query.trim().length === 0) {
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
					score: this.calculateScore(normalizedQuery, item.name, 'name'),
					matchType: 'name'
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
					score: this.calculateScore(normalizedQuery, item.description, 'description'),
					matchType: 'description'
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
						score: this.calculateScore(normalizedQuery, keyword, 'keyword'),
						matchType: 'keyword'
					});
					seenIds.add(item.id);
					break; // 只需要一个关键词匹配即可
				}
			}
		}

		// 按分数排序并限制结果数量
		return results
			.sort((a, b) => b.score - a.score)
			.slice(0, maxResults);
	}

	/**
	 * 计算匹配分数
	 * @param query 查询字符串
	 * @param target 目标字符串
	 * @param matchType 匹配类型
	 * @returns 匹配分数
	 */
	private calculateScore(query: string, target: string, matchType: 'name' | 'description' | 'keyword'): number {
		const lowerTarget = target.toLowerCase();
		const lowerQuery = query.toLowerCase();

		let score = 0;

		// 基础分数根据匹配类型
		const baseScores = {
			name: 100,
			description: 60,
			keyword: 80
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

		return this.index.items.find(item => item.id === itemId);
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
	public getStats(): { itemCount: number; tabCount: number; keywordCount: number } {
		if (!this.isInitialized) {
			this.initialize();
		}

		return {
			itemCount: this.index.items.length,
			tabCount: this.index.tabMap.size,
			keywordCount: this.index.keywordMap.size
		};
	}
}