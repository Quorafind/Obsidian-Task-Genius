/**
 * Unified Data Parsing Manager - 统一数据解析管理器
 * 
 * 这是整个数据解析系统的核心管理器，负责：
 * 1. 协调任务数据、项目数据、文件数据三个子管理器
 * 2. 统一管理生命周期，防止内存泄漏
 * 3. 提供统一的对外API接口
 * 4. 处理管理器间的事件协调和数据同步
 */

import { App, Component, MetadataCache, TFile, Vault } from "obsidian";
import { BaseDataManager, BaseDataManagerConfig, DataManagerEvent, MemoryStats } from "./BaseDataManager";
import { TaskDataManager } from "./TaskDataManager";
import { ProjectDataManager } from "./ProjectDataManager";  
import { FileDataManager } from "./FileDataManager";
import { Task, TaskFilter, SortingCriteria } from "../../types/task";
import { LocalStorageCache } from "../persister";

/**
 * 统一数据解析管理器配置接口
 */
export interface UnifiedDataParsingManagerConfig extends BaseDataManagerConfig {
	/** 是否使用Worker进行后台处理 */
	useWorkers?: boolean;
	/** 最大Worker数量 */
	maxWorkers?: number;
	/** 插件设置引用 */
	pluginSettings?: any;
}

/**
 * 管理器间的协调事件类型
 */
export enum ManagerEventType {
	TASK_DATA_UPDATED = "task-data-updated",
	PROJECT_DATA_UPDATED = "project-data-updated", 
	FILE_DATA_UPDATED = "file-data-updated",
	CACHE_CLEARED = "cache-cleared",
	MEMORY_WARNING = "memory-warning",
	ERROR_OCCURRED = "error-occurred",
}

/**
 * 统一数据解析管理器
 * 作为整个数据解析系统的入口点和协调中心
 */
export class UnifiedDataParsingManager extends BaseDataManager {
	private app: App;
	private vault: Vault;
	private metadataCache: MetadataCache;
	private persister: LocalStorageCache;

	// 三个子管理器
	private taskDataManager?: TaskDataManager;
	private projectDataManager?: ProjectDataManager;
	private fileDataManager?: FileDataManager;

	// 管理器状态
	private managersInitialized: boolean = false;
	private initializationPromise?: Promise<void>;

	constructor(
		app: App,
		vault: Vault, 
		metadataCache: MetadataCache,
		persister: LocalStorageCache,
		config: UnifiedDataParsingManagerConfig
	) {
		super({
			id: config.id || "unified-data-parsing", // 使用传入的id
			debug: config.debug ?? false,
			...config,
		});

		this.app = app;
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.persister = persister;
	}

	/**
	 * 初始化所有子管理器
	 */
	protected async initialize(): Promise<void> {
		if (this.initializationPromise) {
			return this.initializationPromise;
		}

		this.initializationPromise = this.initializeManagers();
		await this.initializationPromise;
	}

	/**
	 * 初始化各个子管理器
	 */
	private async initializeManagers(): Promise<void> {
		try {
			this.debug("开始初始化子管理器");

			// 1. 初始化文件数据管理器（最底层）
			try {
				this.fileDataManager = new FileDataManager(
					this.app,
					this.vault,
					this.metadataCache,
					{
						id: "file-data-manager",
						debug: this.config.debug,
						cleanupInterval: this.config.cleanupInterval,
						maxCacheSize: this.config.maxCacheSize,
					}
				);
				this.addChild(this.fileDataManager);
				await this.fileDataManager.load();
				this.debug("文件数据管理器已初始化");
			} catch (error) {
				throw new Error(`FileDataManager 初始化失败: ${error}`);
			}

			// 2. 初始化项目数据管理器（中间层）
			this.projectDataManager = new ProjectDataManager(
				this.vault,
				this.metadataCache,
				this.fileDataManager,
				{
					id: "project-data-manager", 
					debug: this.config.debug,
					cleanupInterval: this.config.cleanupInterval,
					maxCacheSize: this.config.maxCacheSize,
				}
			);
			this.addChild(this.projectDataManager);
			await this.projectDataManager.load();
			this.debug("项目数据管理器已初始化");

			// 3. 初始化任务数据管理器（最上层）
			this.taskDataManager = new TaskDataManager(
				this.app,
				this.vault,
				this.metadataCache,
				this.persister,
				this.fileDataManager,
				this.projectDataManager,
				{
					id: "task-data-manager",
					debug: this.config.debug,
					cleanupInterval: this.config.cleanupInterval,
					maxCacheSize: this.config.maxCacheSize,
					useWorkers: (this.config as UnifiedDataParsingManagerConfig).useWorkers,
					maxWorkers: (this.config as UnifiedDataParsingManagerConfig).maxWorkers,
				}
			);
			this.addChild(this.taskDataManager);
			await this.taskDataManager.load();
			this.debug("任务数据管理器已初始化");

			this.managersInitialized = true;
			this.debug("所有子管理器初始化完成");

			// 触发初始化完成事件
			this.emitEvent(ManagerEventType.TASK_DATA_UPDATED, {
				action: "managers_initialized"
			});

		} catch (error) {
			console.error("子管理器初始化失败:", error);
			this.managersInitialized = false;
			throw error;
		}
	}

	/**
	 * 清理所有子管理器
	 */
	protected cleanup(): void {
		this.debug("开始清理子管理器");
		
		// 子管理器会通过 Component 系统自动清理
		// 这里只需要重置状态
		this.managersInitialized = false;
		this.initializationPromise = undefined;
		
		this.debug("子管理器清理完成");
	}

	/**
	 * 设置管理器间的事件协调
	 */
	protected setupEventListeners(): void {
		// 监听任务数据更新事件
		this.onEvent(ManagerEventType.TASK_DATA_UPDATED, (event) => {
			this.handleTaskDataUpdate(event);
		});

		// 监听项目数据更新事件
		this.onEvent(ManagerEventType.PROJECT_DATA_UPDATED, (event) => {
			this.handleProjectDataUpdate(event);
		});

		// 监听文件数据更新事件
		this.onEvent(ManagerEventType.FILE_DATA_UPDATED, (event) => {
			this.handleFileDataUpdate(event);
		});

		// 监听内存警告事件
		this.onEvent(ManagerEventType.MEMORY_WARNING, (event) => {
			this.handleMemoryWarning(event);
		});

		// 监听错误事件
		this.onEvent(ManagerEventType.ERROR_OCCURRED, (event) => {
			this.handleError(event);
		});
	}

	/**
	 * 处理任务数据更新事件
	 */
	private handleTaskDataUpdate(event: DataManagerEvent): void {
		this.debug("处理任务数据更新事件", event.data);
		
		// 可以在这里处理任务数据更新后的后续逻辑
		// 比如通知UI刷新、触发其他管理器的相关操作等
	}

	/**
	 * 处理项目数据更新事件
	 */
	private handleProjectDataUpdate(event: DataManagerEvent): void {
		this.debug("处理项目数据更新事件", event.data);
		
		// 项目数据更新可能需要重新解析相关任务
		if (this.taskDataManager && event.data?.filePath) {
			// 通知任务管理器某个文件的项目配置已更新
			this.taskDataManager.onProjectDataUpdated?.(event.data.filePath);
		}
	}

	/**
	 * 处理文件数据更新事件
	 */
	private handleFileDataUpdate(event: DataManagerEvent): void {
		this.debug("处理文件数据更新事件", event.data);
		
		// 文件数据更新可能影响项目和任务数据
		const filePath = event.data?.filePath;
		if (filePath) {
			// 通知项目管理器文件已更新
			this.projectDataManager?.onFileUpdated?.(filePath);
			
			// 通知任务管理器文件已更新
			this.taskDataManager?.onFileUpdated?.(filePath);
		}
	}

	/**
	 * 处理内存警告事件
	 */
	private handleMemoryWarning(event: DataManagerEvent): void {
		this.debug("收到内存警告，开始清理", event.data);
		
		// 触发所有管理器的内存清理
		this.forceCleanupAllManagers();
	}

	/**
	 * 处理错误事件
	 */
	private handleError(event: DataManagerEvent): void {
		console.error(`管理器错误 [${event.source}]:`, event.data);
		
		// 可以在这里实现错误恢复逻辑
		// 比如重置出错的管理器、记录错误日志等
	}

	/**
	 * 强制清理所有管理器
	 */
	private forceCleanupAllManagers(): void {
		this.debug("强制清理所有管理器");
		
		this.taskDataManager?.forceCleanup();
		this.projectDataManager?.forceCleanup();
		this.fileDataManager?.forceCleanup();
	}

	/**
	 * 获取内存使用统计
	 */
	getMemoryStats(): MemoryStats {
		const taskStats = this.taskDataManager?.getMemoryStats() ?? {
			cacheSize: 0, estimatedMemoryUsage: 0, activeListeners: 0, lastCleanupTime: 0
		};
		
		const projectStats = this.projectDataManager?.getMemoryStats() ?? {
			cacheSize: 0, estimatedMemoryUsage: 0, activeListeners: 0, lastCleanupTime: 0
		};
		
		const fileStats = this.fileDataManager?.getMemoryStats() ?? {
			cacheSize: 0, estimatedMemoryUsage: 0, activeListeners: 0, lastCleanupTime: 0
		};

		return {
			cacheSize: taskStats.cacheSize + projectStats.cacheSize + fileStats.cacheSize,
			estimatedMemoryUsage: taskStats.estimatedMemoryUsage + projectStats.estimatedMemoryUsage + fileStats.estimatedMemoryUsage,
			activeListeners: taskStats.activeListeners + projectStats.activeListeners + fileStats.activeListeners + this.eventRefs.length,
			lastCleanupTime: Math.min(taskStats.lastCleanupTime, projectStats.lastCleanupTime, fileStats.lastCleanupTime, this.lastCleanupTime),
		};
	}

	// =================
	// 对外API接口
	// =================

	/**
	 * 确保管理器已初始化
	 */
	private async ensureManagersReady(): Promise<void> {
		if (!this.isInitialized) {
			throw new Error("UnifiedDataParsingManager not initialized. Call load() first.");
		}
		if (!this.managersInitialized) {
			await this.initialize();
		}
	}

	/**
	 * 获取任务数据
	 */
	async getTasks(filter?: TaskFilter[]): Promise<Task[]> {
		await this.ensureManagersReady();
		return this.taskDataManager!.getTasks(filter);
	}

	/**
	 * 获取任务by ID
	 */
	async getTaskById(taskId: string): Promise<Task | undefined> {
		await this.ensureManagersReady();
		return this.taskDataManager!.getTaskById(taskId);
	}

	/**
	 * 更新任务
	 */
	async updateTask(task: Task): Promise<void> {
		await this.ensureManagersReady();
		return this.taskDataManager!.updateTask(task);
	}

	/**
	 * 删除任务
	 */
	async deleteTask(taskId: string): Promise<void> {
		await this.ensureManagersReady();
		return this.taskDataManager!.deleteTask(taskId);
	}

	/**
	 * 索引文件
	 */
	async indexFile(file: TFile): Promise<void> {
		await this.ensureManagersReady();
		return this.taskDataManager!.indexFile(file);
	}

	/**
	 * 索引所有文件
	 */
	async indexAllFiles(): Promise<void> {
		await this.ensureManagersReady();
		return this.taskDataManager!.indexAllFiles();
	}

	/**
	 * 查询任务
	 */
	async queryTasks(filters: TaskFilter[], sortBy: SortingCriteria[]): Promise<Task[]> {
		await this.ensureManagersReady();
		return this.taskDataManager!.queryTasks(filters, sortBy);
	}

	/**
	 * 强制重新索引
	 */
	async forceReindex(): Promise<void> {
		await this.ensureManagersReady();
		
		// 清理所有缓存
		this.forceCleanupAllManagers();
		
		// 重新索引所有文件
		await this.taskDataManager!.indexAllFiles();
		
		this.emitEvent(ManagerEventType.TASK_DATA_UPDATED, {
			action: "force_reindex_completed"
		});
	}

	/**
	 * 获取详细的内存统计信息
	 */
	getDetailedMemoryStats(): {
		unified: MemoryStats;
		task: MemoryStats;
		project: MemoryStats;
		file: MemoryStats;
	} {
		return {
			unified: this.getMemoryStats(),
			task: this.taskDataManager?.getMemoryStats() ?? { cacheSize: 0, estimatedMemoryUsage: 0, activeListeners: 0, lastCleanupTime: 0 },
			project: this.projectDataManager?.getMemoryStats() ?? { cacheSize: 0, estimatedMemoryUsage: 0, activeListeners: 0, lastCleanupTime: 0 },
			file: this.fileDataManager?.getMemoryStats() ?? { cacheSize: 0, estimatedMemoryUsage: 0, activeListeners: 0, lastCleanupTime: 0 },
		};
	}
}