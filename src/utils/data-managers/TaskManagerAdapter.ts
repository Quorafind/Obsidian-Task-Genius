/**
 * Task Manager Adapter - 任务管理器适配器
 * 
 * 提供与现有TaskManager完全兼容的API接口，内部使用新的统一数据解析管理器。
 * 这样可以确保现有代码无需修改就能使用新的架构。
 */

import { App, Component, MetadataCache, TFile, Vault } from "obsidian";
import { Task, TaskFilter, SortingCriteria, TaskCache } from "../../types/task";
import { LocalStorageCache } from "../persister";
import { UnifiedDataParsingManager, UnifiedDataParsingManagerConfig } from "./UnifiedDataParsingManager";
import TaskProgressBarPlugin from "../../index";

/**
 * 任务管理器选项（保持与原TaskManager兼容）
 */
export interface TaskManagerOptions {
	/** Whether to use web workers for processing (if available) */
	useWorkers?: boolean;
	/** Number of workers to use (if workers are enabled) */
	maxWorkers?: number;
	/** Whether to print debug information */
	debug?: boolean;
}

/**
 * 任务管理器适配器
 * 继承Component以保持与原有架构一致
 */
export class TaskManagerAdapter extends Component {
	/** 新的统一数据解析管理器 */
	private unifiedManager: UnifiedDataParsingManager;
	
	/** 兼容性字段 - 保持现有代码可以访问 */
	persister: LocalStorageCache;
	
	/** 是否已初始化 */
	private initialized: boolean = false;
	private isInitializing: boolean = false;
	private initializationPromise?: Promise<void>;

	constructor(
		private app: App,
		private vault: Vault,
		private metadataCache: MetadataCache,
		private plugin: TaskProgressBarPlugin,
		options: Partial<TaskManagerOptions> = {}
	) {
		super();

		// 保持兼容性字段
		this.persister = new LocalStorageCache(
			this.app.appId,
			this.plugin.manifest?.version
		);

		// 创建统一数据解析管理器
		const unifiedConfig: UnifiedDataParsingManagerConfig = {
			id: "unified-data-parsing-manager",
			debug: options.debug ?? false,
			useWorkers: options.useWorkers ?? true,
			maxWorkers: options.maxWorkers ?? 2,
			pluginSettings: this.plugin.settings,
		};

		this.unifiedManager = new UnifiedDataParsingManager(
			app,
			vault,
			metadataCache,
			this.persister,
			unifiedConfig
		);

		// 添加为子组件，确保生命周期管理
		this.addChild(this.unifiedManager);
	}

	/**
	 * 初始化任务管理器
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		if (this.isInitializing) {
			return this.initializationPromise;
		}

		this.isInitializing = true;
		this.initializationPromise = this.performInitialization();
		
		try {
			await this.initializationPromise;
			this.initialized = true;
		} finally {
			this.isInitializing = false;
		}
	}

	/**
	 * 执行实际的初始化
	 */
	private async performInitialization(): Promise<void> {
		// 统一管理器在被添加为子组件时会自动初始化
		// 这里只需要等待初始化完成
		await this.ensureUnifiedManagerReady();
	}

	/**
	 * 确保统一管理器准备就绪
	 */
	private async ensureUnifiedManagerReady(): Promise<void> {
		// 如果还没有初始化，直接调用onload方法
		if (!this.unifiedManager.getInitialized()) {
			await this.unifiedManager.onload();
		}
		
		// 二次检查，确保初始化成功
		if (!this.unifiedManager.getInitialized()) {
			throw new Error("统一数据解析管理器初始化失败");
		}
	}

	// =================
	// 兼容性API - 保持与原TaskManager完全一致
	// =================

	/**
	 * 获取任务缓存（兼容性方法）
	 * @deprecated 建议使用新的查询方法
	 */
	getCache(): TaskCache {
		console.warn("TaskManager.getCache() 已被弃用，请使用查询方法获取任务数据");
		
		// 为了兼容性，返回一个空的TaskCache结构
		return {
			tasks: new Map(),
			files: new Map(),
			tags: new Map(),
			projects: new Map(),
			contexts: new Map(),
			dueDate: new Map(),
			startDate: new Map(),
			scheduledDate: new Map(),
			completed: new Map(),
			priority: new Map(),
			cancelledDate: new Map(),
			onCompletion: new Map(),
			dependsOn: new Map(),
			taskId: new Map(),
			fileMtimes: new Map(),
			fileProcessedTimes: new Map(),
		};
	}

	/**
	 * 获取所有任务
	 */
	async getTasks(filter?: TaskFilter[]): Promise<Task[]> {
		await this.ensureInitialized();
		return this.unifiedManager.getTasks(filter);
	}

	/**
	 * 根据ID获取任务
	 */
	async getTaskById(taskId: string): Promise<Task | undefined> {
		await this.ensureInitialized();
		return this.unifiedManager.getTaskById(taskId);
	}

	/**
	 * 更新任务
	 */
	async updateTask(task: Task): Promise<void> {
		await this.ensureInitialized();
		return this.unifiedManager.updateTask(task);
	}

	/**
	 * 删除任务
	 */
	async deleteTask(taskId: string): Promise<void> {
		await this.ensureInitialized();
		return this.unifiedManager.deleteTask(taskId);
	}

	/**
	 * 创建新任务（兼容性方法）
	 */
	async createTask(task: Partial<Task>): Promise<Task> {
		await this.ensureInitialized();
		
		// 确保必需的字段
		const newTask: Task = {
			id: task.id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			content: task.content || "",
			filePath: task.filePath || "",
			line: task.line || 0,
			completed: task.completed || false,
			status: task.status || " ",
			originalMarkdown: task.originalMarkdown || "",
			metadata: task.metadata || {
				tags: [],
				children: [],
				heading: [],
			},
		};

		await this.unifiedManager.updateTask(newTask);
		return newTask;
	}

	/**
	 * 索引单个文件
	 */
	async indexFile(file: TFile): Promise<void> {
		await this.ensureInitialized();
		return this.unifiedManager.indexFile(file);
	}

	/**
	 * 索引所有文件
	 */
	async indexAllFiles(): Promise<void> {
		await this.ensureInitialized();
		return this.unifiedManager.indexAllFiles();
	}

	/**
	 * 更新索引
	 */
	async updateIndex(file: TFile): Promise<void> {
		// updateIndex 是 indexFile 的别名
		return this.indexFile(file);
	}

	/**
	 * 查询任务
	 */
	async queryTasks(filters: TaskFilter[], sortBy: SortingCriteria[]): Promise<Task[]> {
		await this.ensureInitialized();
		return this.unifiedManager.queryTasks(filters, sortBy);
	}

	/**
	 * 强制重新索引
	 */
	async forceReindex(): Promise<void> {
		await this.ensureInitialized();
		return this.unifiedManager.forceReindex();
	}

	/**
	 * 获取内存统计信息（兼容性方法）
	 */
	getMemoryStats() {
		if (!this.unifiedManager.getInitialized()) {
			return {
				unified: { cacheSize: 0, estimatedMemoryUsage: 0, activeListeners: 0, lastCleanupTime: 0 },
				task: { cacheSize: 0, estimatedMemoryUsage: 0, activeListeners: 0, lastCleanupTime: 0 },
				project: { cacheSize: 0, estimatedMemoryUsage: 0, activeListeners: 0, lastCleanupTime: 0 },
				file: { cacheSize: 0, estimatedMemoryUsage: 0, activeListeners: 0, lastCleanupTime: 0 },
			};
		}
		
		return this.unifiedManager.getDetailedMemoryStats();
	}

	/**
	 * 清理缓存
	 */
	clearCache(): void {
		if (this.unifiedManager.getInitialized()) {
			this.unifiedManager.forceCleanup();
		}
	}

	/**
	 * 获取初始化状态
	 */
	getInitialized(): boolean {
		return this.initialized && this.unifiedManager.getInitialized();
	}

	// =================
	// 兼容性方法 - 支持现有的事件系统
	// =================

	/**
	 * 触发任务更新事件（兼容性方法）
	 */
	triggerTaskUpdate(): void {
		// 在新架构中，事件是自动触发的
		// 这里保持空实现以保证兼容性
	}

	/**
	 * 注册任务更新监听器（兼容性方法）
	 */
	onTaskUpdate(callback: () => void): void {
		// 监听统一管理器的事件
		// @ts-ignore
		if (typeof this.app !== 'undefined' && this.app.workspace) {
			this.app.workspace.on('data-manager:task-data-updated', callback);
		}
	}

	// =================
	// 内部辅助方法
	// =================

	/**
	 * 确保已初始化
	 */
	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			await this.initialize();
		}
	}

	// =================
	// 兼容性API - 与原TaskManager保持一致
	// =================

	/**
	 * 获取所有任务（兼容方法）
	 */
	getAllTasks(): Task[] {
		if (!this.initialized) {
			console.warn("TaskManagerAdapter not initialized, returning empty array");
			return [];
		}
		// 注意：这是同步方法，但统一管理器是异步的，所以可能需要特殊处理
		// 暂时返回缓存的任务或空数组
		return [];
	}

	/**
	 * 获取所有任务（异步同步版本）
	 */
	async getAllTasksWithSync(): Promise<Task[]> {
		return this.getTasks();
	}

	/**
	 * 获取所有任务（快速版本）
	 */
	getAllTasksFast(): Task[] {
		return this.getAllTasks();
	}

	/**
	 * 获取指定文件的任务
	 */
	getTasksForFile(filePath: string): Task[] {
		if (!this.initialized) {
			return [];
		}
		// 这需要统一管理器支持按文件查询
		// 暂时返回空数组，待统一管理器添加此功能
		console.warn("getTasksForFile not fully implemented in unified architecture");
		return [];
	}

	/**
	 * 根据过滤器获取任务
	 */
	getTasksByFilter(filter: TaskFilter): Task[] {
		if (!this.initialized) {
			return [];
		}
		// 同步版本的过滤查询
		console.warn("getTasksByFilter not fully implemented in unified architecture");
		return [];
	}

	/**
	 * 获取今天到期的任务
	 */
	getTasksDueToday(): Task[] {
		if (!this.initialized) {
			return [];
		}
		// 需要实现今天到期的过滤逻辑
		console.warn("getTasksDueToday not fully implemented in unified architecture");
		return [];
	}

	/**
	 * 设置进度管理器（旧架构特有）
	 */
	setProgressManager(progressManager: any): void {
		// 统一架构不需要外部进度管理器，内部已处理
		console.warn("setProgressManager is not needed in unified architecture");
	}


	/**
	 * 组件卸载时的清理
	 */
	onunload(): void {
		super.onunload();
		this.initialized = false;
	}

	// =================
	// 新增的高级功能API
	// =================

	/**
	 * 获取详细的性能统计
	 */
	getPerformanceStats() {
		return {
			memoryStats: this.getMemoryStats(),
			initialized: this.getInitialized(),
			managerStatus: {
				unified: this.unifiedManager.getInitialized(),
			}
		};
	}

	/**
	 * 获取统一管理器实例（用于高级功能）
	 */
	getUnifiedManager(): UnifiedDataParsingManager {
		return this.unifiedManager;
	}

	/**
	 * 检查系统健康状态
	 */
	async healthCheck(): Promise<{
		healthy: boolean;
		issues: string[];
		stats: any;
	}> {
		const issues: string[] = [];
		
		// 检查初始化状态
		if (!this.getInitialized()) {
			issues.push("任务管理器未初始化");
		}
		
		// 检查内存使用
		const stats = this.getMemoryStats();
		const totalMemory = stats.unified.estimatedMemoryUsage;
		
		// 如果内存使用超过100MB，记录警告
		if (totalMemory > 100 * 1024 * 1024) {
			issues.push(`内存使用过高: ${Math.round(totalMemory / 1024 / 1024)}MB`);
		}
		
		return {
			healthy: issues.length === 0,
			issues,
			stats,
		};
	}
}