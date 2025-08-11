export interface SettingSearchItem {
	id: string;                    // 唯一标识符
	tabId: string;                 // 所属标签页ID
	name: string;                  // 设置项名称
	description?: string;          // 设置项描述
	keywords: string[];            // 搜索关键词
	translationKey: string;        // 翻译键值
	descriptionKey?: string;       // 描述翻译键值
	category: string;              // 所属分类
}

export interface SettingsSearchIndex {
	items: SettingSearchItem[];
	keywordMap: Map<string, string[]>; // 关键词到设置ID的映射
	tabMap: Map<string, SettingSearchItem[]>; // 标签页到设置项的映射
}

export interface SearchResult {
	item: SettingSearchItem;
	score: number;                 // 匹配分数
	matchType: 'name' | 'description' | 'keyword'; // 匹配类型
}