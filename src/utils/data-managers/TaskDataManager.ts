/**
 * Task Data Manager - 任务数据管理器
 * 
 * 专门负责任务数据的解析、缓存和管理，包括：
 * 1. 统一管理所有类型的任务解析器（Markdown、Canvas、ICS、FileMetadata）
 * 2. 任务缓存的生命周期管理
 * 3. 与其他数据管理器的协调
 * 4. Worker进程的管理和调度
 */

import { App, MetadataCache, TFile, Vault } from "obsidian";
import { BaseDataManager, BaseDataManagerConfig, MemoryStats } from "./BaseDataManager";
import { FileDataManager } from "./FileDataManager";
import { ProjectDataManager } from "./ProjectDataManager";
import { Task, TaskCache, TaskFilter, SortingCriteria } from "../../types/task";
import { TaskParserConfig } from "../../types/TaskParserConfig";
import { LocalStorageCache } from "../persister";
import { TaskIndexer } from "../import/TaskIndexer";
import { TaskWorkerManager } from "../workers/TaskWorkerManager";
import { MarkdownTaskParser } from "../workers/ConfigurableTaskParser";
import { CanvasParser } from "../parsing/CanvasParser";
import { FileMetadataTaskParser } from "../workers/FileMetadataTaskParser";
import { IcsParser } from "../ics/IcsParser";
import { getConfig } from "../../common/task-parser-config";
import { getFileType, SupportedFileType } from "../fileTypeUtils";

/**
 * 任务数据管理器配置接口
 */
export interface TaskDataManagerConfig extends BaseDataManagerConfig {
	/** 是否使用Worker进行后台处理 */
	useWorkers?: boolean;
	/** 最大Worker数量 */
	maxWorkers?: number;
	/** 任务解析配置 */
	parserConfig?: TaskParserConfig;
}

/**
 * 任务解析器类型枚举
 */
export enum TaskParserType {
	MARKDOWN = "markdown",
	CANVAS = "canvas", 
	FILE_METADATA = "file-metadata",
	ICS = "ics",
}

/**
 * 解析器接口统一定义
 */
export interface ITaskParser {
	readonly type: TaskParserType;
	readonly supportedFileTypes: SupportedFileType[];
	parse(content: string, filePath: string): Promise<Task[]>;
	parseLegacy?(content: string, filePath: string): Promise<Task[]>;
}

/**
 * 任务数据管理器
 */
export class TaskDataManager extends BaseDataManager {
	private app: App;
	private vault: Vault;
	private metadataCache: MetadataCache;
	private persister: LocalStorageCache;
	private fileDataManager: FileDataManager;
	private projectDataManager: ProjectDataManager;

	// 核心组件
	private taskIndexer: TaskIndexer;
	private workerManager?: TaskWorkerManager;
	
	// 解析器映射表
	private parsers = new Map<TaskParserType, ITaskParser>();
	private fileTypeToParsers = new Map<SupportedFileType, TaskParserType[]>();

	// 缓存和状态管理
	private taskCache: TaskCache;
	private lastIndexTime = new Map<string, number>();
	private indexingInProgress = new Set<string>();

	constructor(
		app: App,
		vault: Vault,
		metadataCache: MetadataCache,
		persister: LocalStorageCache,
		fileDataManager: FileDataManager,
		projectDataManager: ProjectDataManager,
		config: TaskDataManagerConfig
	) {
		super(config);

		this.app = app;
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.persister = persister;
		this.fileDataManager = fileDataManager;
		this.projectDataManager = projectDataManager;

		// 初始化任务索引器
		this.taskIndexer = new TaskIndexer(app, vault, metadataCache);
		this.addChild(this.taskIndexer);

		// 初始化空缓存
		this.taskCache = this.initEmptyTaskCache();
	}

	/**
	 * 初始化任务数据管理器
	 */
	protected async initialize(): Promise<void> {
		this.debug("初始化任务数据管理器");

		// 1. 初始化解析器
		await this.initializeParsers();

		// 2. 初始化Worker管理器（如果启用）
		await this.initializeWorkerManager();

		// 3. 设置任务索引器的解析回调
		this.setupTaskIndexer();

		// 4. 从缓存中恢复数据
		await this.loadFromCache();

		this.debug("任务数据管理器初始化完成");
	}

	/**
	 * 初始化所有解析器
	 */
	private async initializeParsers(): Promise<void> {
		this.debug("初始化任务解析器");

		const parserConfig = this.getParserConfig();

		// 1. 初始化Markdown解析器
		const markdownParser = new MarkdownTaskParserAdapter(
			new MarkdownTaskParser(parserConfig)
		);
		this.parsers.set(TaskParserType.MARKDOWN, markdownParser);

		// 2. 初始化Canvas解析器
		const canvasParser = new CanvasParserAdapter(
			new CanvasParser(parserConfig)
		);
		this.parsers.set(TaskParserType.CANVAS, canvasParser);

		// 3. 初始化文件元数据解析器
		const fileMetadataParser = new FileMetadataParserAdapter(
			new FileMetadataTaskParser({
				enableFileMetadataParsing: true,
				enableTagBasedTaskParsing: true,
				metadataFieldsToParseAsTasks: ["task", "todo", "action"],
				tagsToParseAsTasks: ["#task", "#todo", "#action"],
				defaultTaskStatus: " ",
				taskContentFromMetadata: "title",
			})
		);
		this.parsers.set(TaskParserType.FILE_METADATA, fileMetadataParser);

		// 4. 初始化ICS解析器（暂时占位，ICS不直接产生Task对象）
		// const icsParser = new IcsParserAdapter();
		// this.parsers.set(TaskParserType.ICS, icsParser);

		// 5. 建立文件类型到解析器的映射
		this.setupFileTypeMapping();

		this.debug("任务解析器初始化完成");
	}

	/**
	 * 建立文件类型到解析器的映射
	 */
	private setupFileTypeMapping(): void {
		// Markdown文件
		this.fileTypeToParsers.set("md", [TaskParserType.MARKDOWN, TaskParserType.FILE_METADATA]);
		
		// Canvas文件
		this.fileTypeToParsers.set("canvas", [TaskParserType.CANVAS]);
		
		// 其他文件（主要通过元数据解析）
		this.fileTypeToParsers.set("unknown", [TaskParserType.FILE_METADATA]);
	}

	/**
	 * 初始化Worker管理器
	 */
	private async initializeWorkerManager(): Promise<void> {
		const config = this.config as TaskDataManagerConfig;
		
		if (config.useWorkers) {
			try {
				this.workerManager = new TaskWorkerManager(
					this.vault,
					this.metadataCache,
					{
						maxWorkers: config.maxWorkers ?? 2,
						debug: config.debug ?? false,
						settings: config.parserConfig,
					}
				);
				this.addChild(this.workerManager);
				this.debug("Worker管理器初始化成功");
			} catch (error) {
				console.warn("Worker管理器初始化失败，使用主线程解析:", error);
				this.workerManager = undefined;
			}
		}
	}

	/**
	 * 设置任务索引器
	 */
	private setupTaskIndexer(): void {
		// 设置任务索引器的文件解析回调
		this.taskIndexer.setParseFileCallback(async (file: TFile) => {
			return this.parseFile(file);
		});

		// 设置文件过滤器（如果需要）
		// this.taskIndexer.setFileFilterManager(fileFilterManager);
	}

	/**
	 * 从缓存中加载数据
	 */
	private async loadFromCache(): Promise<void> {
		try {
			this.debug("从缓存加载任务数据");
			
			// 从持久化存储加载任务缓存
			const cached = await this.persister.loadConsolidatedCache<TaskCache>("task-cache");
			
			if (cached && cached.data) {
				// 验证缓存版本兼容性
				if (this.persister.isVersionCompatible(cached)) {
					this.taskCache = cached.data;
					this.debug(`从缓存加载了 ${this.taskCache.tasks.size} 个任务`);
				} else {
					this.debug("缓存版本不兼容，将重新索引");
					await this.persister.clearIncompatibleCache();
				}
			}
		} catch (error) {
			console.warn("从缓存加载任务数据失败:", error);
		}
	}

	/**
	 * 解析文件中的任务
	 */
	async parseFile(file: TFile): Promise<Task[]> {
		const filePath = file.path;
		
		// 防止重复解析同一文件
		if (this.indexingInProgress.has(filePath)) {
			this.debug(`文件 ${filePath} 正在解析中，跳过`);
			return [];
		}

		this.indexingInProgress.add(filePath);

		try {
			// 检查文件是否需要重新解析
			const fileStats = file.stat;
			const lastIndexed = this.lastIndexTime.get(filePath) ?? 0;
			
			if (fileStats.mtime <= lastIndexed) {
				this.debug(`文件 ${filePath} 未修改，使用缓存`);
				return this.getTasksByFile(filePath);
			}

			this.debug(`开始解析文件: ${filePath}`);

			// 获取文件内容
			const content = await this.vault.cachedRead(file);
			
			// 确定文件类型
			const fileType = getFileType(filePath);
			
			// 获取适用的解析器
			const parserTypes = this.fileTypeToParsers.get(fileType) ?? [TaskParserType.FILE_METADATA];
			
			// 解析任务
			const allTasks: Task[] = [];
			
			for (const parserType of parserTypes) {
				const parser = this.parsers.get(parserType);
				if (parser) {
					try {
						const tasks = await parser.parse(content, filePath);
						allTasks.push(...tasks);
						this.debug(`${parserType} 解析器找到 ${tasks.length} 个任务`);
					} catch (error) {
						console.warn(`${parserType} 解析器解析失败:`, error);
					}
				}
			}

			// 更新缓存
			this.updateTasksInCache(filePath, allTasks);
			this.lastIndexTime.set(filePath, Date.now());

			this.debug(`文件 ${filePath} 解析完成，共找到 ${allTasks.length} 个任务`);

			// 发送更新事件
			this.emitEvent("task-data-updated", {
				action: "file_parsed",
				filePath,
				taskCount: allTasks.length,
			});

			return allTasks;

		} catch (error) {
			console.error(`解析文件 ${filePath} 失败:`, error);
			return [];
		} finally {
			this.indexingInProgress.delete(filePath);
		}
	}

	/**
	 * 更新任务缓存
	 */
	private updateTasksInCache(filePath: string, tasks: Task[]): void {
		// 移除该文件的旧任务
		const oldTaskIds = this.taskCache.files.get(filePath) ?? new Set();
		for (const taskId of oldTaskIds) {
			this.removeTaskFromCache(taskId);
		}

		// 添加新任务到缓存
		const newTaskIds = new Set<string>();
		for (const task of tasks) {
			this.addTaskToCache(task);
			newTaskIds.add(task.id);
		}

		// 更新文件索引
		this.taskCache.files.set(filePath, newTaskIds);
	}

	/**
	 * 添加任务到缓存
	 */
	private addTaskToCache(task: Task): void {
		this.taskCache.tasks.set(task.id, task);
		
		// 更新各种索引
		this.updateTaskIndexes(task, 'add');
	}

	/**
	 * 从缓存中移除任务
	 */
	private removeTaskFromCache(taskId: string): void {
		const task = this.taskCache.tasks.get(taskId);
		if (task) {
			this.taskCache.tasks.delete(taskId);
			this.updateTaskIndexes(task, 'remove');
		}
	}

	/**
	 * 更新任务索引
	 */
	private updateTaskIndexes(task: Task, operation: 'add' | 'remove'): void {
		const updateIndex = <K>(map: Map<K, Set<string>>, key: K | undefined, taskId: string) => {
			if (key !== undefined && key !== null) {
				if (operation === 'add') {
					if (!map.has(key)) map.set(key, new Set());
					map.get(key)!.add(taskId);
				} else {
					const set = map.get(key);
					if (set) {
						set.delete(taskId);
						if (set.size === 0) map.delete(key);
					}
				}
			}
		};

		// 更新各种索引
		updateIndex(this.taskCache.completed, task.completed, task.id);
		updateIndex(this.taskCache.priority, task.metadata.priority, task.id);
		updateIndex(this.taskCache.projects, task.metadata.project, task.id);
		updateIndex(this.taskCache.contexts, task.metadata.context, task.id);

		// 更新标签索引
		if (task.metadata.tags) {
			for (const tag of task.metadata.tags) {
				updateIndex(this.taskCache.tags, tag, task.id);
			}
		}

		// 更新日期索引
		const formatDate = (date: number): string => {
			const d = new Date(date);
			return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		};

		if (task.metadata.dueDate) {
			updateIndex(this.taskCache.dueDate, formatDate(task.metadata.dueDate), task.id);
		}
		if (task.metadata.startDate) {
			updateIndex(this.taskCache.startDate, formatDate(task.metadata.startDate), task.id);
		}
		if (task.metadata.scheduledDate) {
			updateIndex(this.taskCache.scheduledDate, formatDate(task.metadata.scheduledDate), task.id);
		}
	}

	/**
	 * 清理资源
	 */
	protected cleanup(): void {
		this.debug("清理任务数据管理器");
		
		// 保存缓存
		this.saveToCache();
		
		// 清理内存
		this.taskCache = this.initEmptyTaskCache();
		this.lastIndexTime.clear();
		this.indexingInProgress.clear();
		
		this.debug("任务数据管理器清理完成");
	}

	/**
	 * 保存缓存到持久化存储
	 */
	private async saveToCache(): Promise<void> {
		try {
			this.debug("保存任务缓存");
			await this.persister.storeConsolidatedCache("task-cache", this.taskCache);
		} catch (error) {
			console.error("保存任务缓存失败:", error);
		}
	}

	/**
	 * 初始化空的任务缓存
	 */
	private initEmptyTaskCache(): TaskCache {
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
	 * 获取解析器配置
	 */
	private getParserConfig(): TaskParserConfig {
		const config = this.config as TaskDataManagerConfig;
		return config.parserConfig ?? getConfig("tasks");
	}

	/**
	 * 获取内存使用统计
	 */
	getMemoryStats(): MemoryStats {
		const tasksSize = this.taskCache.tasks.size;
		const filesSize = this.taskCache.files.size;
		const indexSize = this.taskCache.tags.size + this.taskCache.projects.size + 
						 this.taskCache.contexts.size + this.taskCache.dueDate.size;

		// 估算内存使用量（每个任务约1KB，每个索引条目约100B）
		const estimatedMemory = (tasksSize * 1024) + (indexSize * 100) + (filesSize * 200);

		return {
			cacheSize: tasksSize,
			estimatedMemoryUsage: estimatedMemory,
			activeListeners: this.eventRefs.length,
			lastCleanupTime: this.lastCleanupTime,
		};
	}

	/**
	 * 执行内存清理
	 */
	protected performMemoryCleanup(): void {
		this.debug("执行任务数据内存清理");
		
		// 清理过期的缓存项
		const now = Date.now();
		const maxAge = 60 * 60 * 1000; // 1小时
		
		// 清理过期的文件索引时间
		for (const [filePath, time] of this.lastIndexTime.entries()) {
			if (now - time > maxAge) {
				this.lastIndexTime.delete(filePath);
			}
		}
		
		// 保存当前缓存状态
		this.saveToCache();
	}

	// =================
	// 对外API接口
	// =================

	/**
	 * 获取所有任务
	 */
	async getTasks(filter?: TaskFilter[]): Promise<Task[]> {
		const tasks = Array.from(this.taskCache.tasks.values());
		return filter ? this.applyFilters(tasks, filter) : tasks;
	}

	/**
	 * 根据ID获取任务
	 */
	async getTaskById(taskId: string): Promise<Task | undefined> {
		return this.taskCache.tasks.get(taskId);
	}

	/**
	 * 根据文件路径获取任务
	 */
	getTasksByFile(filePath: string): Task[] {
		const taskIds = this.taskCache.files.get(filePath) ?? new Set();
		return Array.from(taskIds).map(id => this.taskCache.tasks.get(id)).filter(Boolean) as Task[];
	}

	/**
	 * 更新任务
	 */
	async updateTask(task: Task): Promise<void> {
		this.addTaskToCache(task);
		
		// 触发更新事件
		this.emitEvent("task-data-updated", {
			action: "task_updated",
			taskId: task.id,
		});
	}

	/**
	 * 删除任务
	 */
	async deleteTask(taskId: string): Promise<void> {
		this.removeTaskFromCache(taskId);
		
		// 触发更新事件
		this.emitEvent("task-data-updated", {
			action: "task_deleted",
			taskId,
		});
	}

	/**
	 * 索引文件
	 */
	async indexFile(file: TFile): Promise<void> {
		await this.parseFile(file);
	}

	/**
	 * 索引所有文件
	 */
	async indexAllFiles(): Promise<void> {
		return this.taskIndexer.indexAllFiles();
	}

	/**
	 * 查询任务
	 */
	async queryTasks(filters: TaskFilter[], sortBy: SortingCriteria[]): Promise<Task[]> {
		return this.taskIndexer.queryTasks(filters, sortBy);
	}

	/**
	 * 应用过滤器
	 */
	private applyFilters(tasks: Task[], filters: TaskFilter[]): Task[] {
		// TODO: 实现过滤逻辑
		return tasks;
	}

	/**
	 * 文件更新时的处理
	 */
	onFileUpdated(filePath: string): void {
		this.debug(`文件已更新: ${filePath}`);
		// 标记需要重新解析
		this.lastIndexTime.delete(filePath);
	}

	/**
	 * 项目数据更新时的处理
	 */
	onProjectDataUpdated(filePath: string): void {
		this.debug(`项目数据已更新: ${filePath}`);
		// 项目数据更新可能影响任务的项目字段，需要重新解析
		this.lastIndexTime.delete(filePath);
	}
}

// =================
// 解析器适配器类
// =================

/**
 * Markdown任务解析器适配器
 */
class MarkdownTaskParserAdapter implements ITaskParser {
	readonly type = TaskParserType.MARKDOWN;
	readonly supportedFileTypes: SupportedFileType[] = ["md"];
	
	constructor(private parser: MarkdownTaskParser) {}

	async parse(content: string, filePath: string): Promise<Task[]> {
		return this.parser.parseLegacy(content, filePath);
	}
}

/**
 * Canvas解析器适配器
 */
class CanvasParserAdapter implements ITaskParser {
	readonly type = TaskParserType.CANVAS;
	readonly supportedFileTypes: SupportedFileType[] = ["canvas"];
	
	constructor(private parser: CanvasParser) {}

	async parse(content: string, filePath: string): Promise<Task[]> {
		return this.parser.parseCanvasFile(content, filePath);
	}
}

/**
 * 文件元数据解析器适配器
 */
class FileMetadataParserAdapter implements ITaskParser {
	readonly type = TaskParserType.FILE_METADATA;
	readonly supportedFileTypes: SupportedFileType[] = ["md", "unknown"];
	
	constructor(private parser: FileMetadataTaskParser) {}

	async parse(content: string, filePath: string): Promise<Task[]> {
		// 这里需要获取文件的缓存元数据
		// 在实际实现中，可能需要从外部传入MetadataCache
		const result = this.parser.parseFileForTasks(filePath, content);
		return result.tasks;
	}
}