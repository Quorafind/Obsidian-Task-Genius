/**
 * File Data Manager - 文件数据管理器
 * 
 * 专门负责文件监听和基础数据管理，包括：
 * 1. 统一管理文件变更监听
 * 2. 文件元数据缓存和更新
 * 3. 文件过滤和类型识别
 * 4. 为其他管理器提供文件基础服务
 */

import { App, EventRef, MetadataCache, TFile, Vault, CachedMetadata } from "obsidian";
import { BaseDataManager, BaseDataManagerConfig, MemoryStats } from "./BaseDataManager";
import { isSupportedFileWithFilter, getFileType, SupportedFileType } from "../fileTypeUtils";
import { FileFilterManager } from "../FileFilterManager";

/**
 * 文件数据管理器配置接口
 */
export interface FileDataManagerConfig extends BaseDataManagerConfig {
	/** 文件过滤器配置 */
	fileFilter?: {
		enabled: boolean;
		includePatterns: string[];
		excludePatterns: string[];
	};
	/** 是否监听文件变更 */
	watchFileChanges?: boolean;
	/** 文件变更防抖延迟（毫秒） */
	changeDebounceDelay?: number;
}

/**
 * 文件信息接口
 */
export interface FileInfo {
	path: string;
	name: string;
	extension: string;
	type: SupportedFileType;
	mtime: number;
	size: number;
	exists: boolean;
}

/**
 * 文件元数据信息接口
 */
export interface FileMetadataInfo {
	path: string;
	metadata?: CachedMetadata;
	frontmatter?: Record<string, any>;
	tags?: string[];
	links?: string[];
	headings?: string[];
	lastUpdated: number;
}

/**
 * 文件变更事件接口
 */
export interface FileChangeEvent {
	type: 'create' | 'modify' | 'delete' | 'rename';
	file: TFile;
	oldPath?: string; // for rename events
	timestamp: number;
}

/**
 * 文件数据管理器
 */
export class FileDataManager extends BaseDataManager {
	private app: App;
	private vault: Vault;
	private metadataCache: MetadataCache;

	// 文件过滤器
	private fileFilterManager?: FileFilterManager;

	// 缓存
	private fileInfoCache = new Map<string, FileInfo>();
	private fileMetadataCache = new Map<string, FileMetadataInfo>();

	// 防抖处理
	private changeDebounceTimers = new Map<string, NodeJS.Timeout>();
	private changeDebounceDelay: number;

	// 事件监听器引用
	private fileEventRefs: EventRef[] = [];

	constructor(
		app: App,
		vault: Vault,
		metadataCache: MetadataCache,
		config: FileDataManagerConfig
	) {
		super(config);

		this.app = app;
		this.vault = vault;
		this.metadataCache = metadataCache;
		
		this.changeDebounceDelay = config.changeDebounceDelay ?? 300;

		// 初始化文件过滤器
		if (config.fileFilter?.enabled) {
			this.fileFilterManager = new FileFilterManager(config.fileFilter);
		}
	}

	/**
	 * 初始化文件数据管理器
	 */
	protected async initialize(): Promise<void> {
		this.debug("初始化文件数据管理器");

		// 1. 建立文件变更监听
		const config = this.config as FileDataManagerConfig;
		if (config.watchFileChanges !== false) {
			this.setupFileEventListeners();
		}

		// 2. 建立元数据变更监听
		this.setupMetadataEventListeners();

		// 3. 初始化文件缓存
		await this.initializeFileCache();

		this.debug("文件数据管理器初始化完成");
	}

	/**
	 * 设置文件事件监听器
	 */
	private setupFileEventListeners(): void {
		this.debug("设置文件事件监听器");

		// 监听文件创建
		const createRef = this.vault.on('create', (file) => {
			if (file instanceof TFile) {
				this.handleFileChange({
					type: 'create',
					file,
					timestamp: Date.now(),
				});
			}
		});
		this.fileEventRefs.push(createRef);

		// 监听文件修改
		const modifyRef = this.vault.on('modify', (file) => {
			if (file instanceof TFile) {
				this.handleFileChange({
					type: 'modify',
					file,
					timestamp: Date.now(),
				});
			}
		});
		this.fileEventRefs.push(modifyRef);

		// 监听文件删除
		const deleteRef = this.vault.on('delete', (file) => {
			if (file instanceof TFile) {
				this.handleFileChange({
					type: 'delete',
					file,
					timestamp: Date.now(),
				});
			}
		});
		this.fileEventRefs.push(deleteRef);

		// 监听文件重命名
		const renameRef = this.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile) {
				this.handleFileChange({
					type: 'rename',
					file,
					oldPath,
					timestamp: Date.now(),
				});
			}
		});
		this.fileEventRefs.push(renameRef);
	}

	/**
	 * 设置元数据事件监听器
	 */
	private setupMetadataEventListeners(): void {
		this.debug("设置元数据事件监听器");

		// 监听元数据变更
		const metadataChangeRef = this.metadataCache.on('changed', (file, data, oldData) => {
			this.handleMetadataChange(file, data, oldData);
		});
		this.fileEventRefs.push(metadataChangeRef);

		// 监听元数据解析完成
		const metadataResolveRef = this.metadataCache.on('resolved', () => {
			this.debug("元数据缓存解析完成");
		});
		this.fileEventRefs.push(metadataResolveRef);
	}

	/**
	 * 初始化文件缓存
	 */
	private async initializeFileCache(): Promise<void> {
		this.debug("初始化文件缓存");

		try {
			// 获取所有文件
			const files = this.vault.getMarkdownFiles().concat(
				this.vault.getFiles().filter(f => f.extension === 'canvas')
			);

			this.debug(`发现 ${files.length} 个文件，开始建立缓存`);

			// 批量处理文件信息
			for (const file of files) {
				if (this.shouldProcessFile(file)) {
					await this.updateFileInfoCache(file);
					await this.updateFileMetadataCache(file);
				}
			}

			this.debug(`文件缓存初始化完成，共缓存 ${this.fileInfoCache.size} 个文件`);
		} catch (error) {
			console.error("初始化文件缓存失败:", error);
		}
	}

	/**
	 * 处理文件变更事件
	 */
	private handleFileChange(event: FileChangeEvent): void {
		const filePath = event.file.path;
		
		// 防抖处理
		const existingTimer = this.changeDebounceTimers.get(filePath);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		const timer = setTimeout(async () => {
			this.changeDebounceTimers.delete(filePath);
			await this.processFileChange(event);
		}, this.changeDebounceDelay);

		this.changeDebounceTimers.set(filePath, timer);
	}

	/**
	 * 实际处理文件变更
	 */
	private async processFileChange(event: FileChangeEvent): Promise<void> {
		const { type, file, oldPath } = event;

		this.debug(`处理文件变更: ${type} - ${file.path}`);

		try {
			switch (type) {
				case 'create':
					if (this.shouldProcessFile(file)) {
						await this.updateFileInfoCache(file);
						await this.updateFileMetadataCache(file);
						this.emitFileEvent('file-created', { filePath: file.path });
					}
					break;

				case 'modify':
					if (this.shouldProcessFile(file)) {
						await this.updateFileInfoCache(file);
						await this.updateFileMetadataCache(file);
						this.emitFileEvent('file-modified', { filePath: file.path });
					}
					break;

				case 'delete':
					this.removeFromCache(file.path);
					this.emitFileEvent('file-deleted', { filePath: file.path });
					break;

				case 'rename':
					if (oldPath) {
						this.removeFromCache(oldPath);
					}
					if (this.shouldProcessFile(file)) {
						await this.updateFileInfoCache(file);
						await this.updateFileMetadataCache(file);
					}
					this.emitFileEvent('file-renamed', { 
						filePath: file.path, 
						oldPath 
					});
					break;
			}
		} catch (error) {
			console.error(`处理文件变更失败 (${type} - ${file.path}):`, error);
		}
	}

	/**
	 * 处理元数据变更
	 */
	private async handleMetadataChange(
		file: TFile,
		data: CachedMetadata | null,
		oldData: CachedMetadata | null
	): Promise<void> {
		if (this.shouldProcessFile(file)) {
			await this.updateFileMetadataCache(file, data);
			this.emitFileEvent('metadata-changed', { 
				filePath: file.path,
				hasMetadata: !!data,
			});
		}
	}

	/**
	 * 判断是否应该处理此文件
	 */
	private shouldProcessFile(file: TFile): boolean {
		// 使用文件过滤器
		if (this.fileFilterManager) {
			return this.fileFilterManager.shouldProcessFile(file.path);
		}

		// 默认处理支持的文件类型
		return isSupportedFileWithFilter(file.path);
	}

	/**
	 * 更新文件信息缓存
	 */
	private async updateFileInfoCache(file: TFile): Promise<void> {
		try {
			const fileInfo: FileInfo = {
				path: file.path,
				name: file.name,
				extension: file.extension,
				type: getFileType(file.path),
				mtime: file.stat.mtime,
				size: file.stat.size,
				exists: true,
			};

			this.fileInfoCache.set(file.path, fileInfo);
		} catch (error) {
			console.warn(`更新文件信息缓存失败 (${file.path}):`, error);
		}
	}

	/**
	 * 更新文件元数据缓存
	 */
	private async updateFileMetadataCache(
		file: TFile, 
		metadata?: CachedMetadata | null
	): Promise<void> {
		try {
			// 如果没有传入metadata，从metadataCache获取
			if (metadata === undefined) {
				metadata = this.metadataCache.getFileCache(file);
			}

			const metadataInfo: FileMetadataInfo = {
				path: file.path,
				metadata: metadata ?? undefined,
				frontmatter: metadata?.frontmatter ?? undefined,
				tags: metadata?.tags?.map(t => t.tag) ?? [],
				links: metadata?.links?.map(l => l.link) ?? [],
				headings: metadata?.headings?.map(h => h.heading) ?? [],
				lastUpdated: Date.now(),
			};

			this.fileMetadataCache.set(file.path, metadataInfo);
		} catch (error) {
			console.warn(`更新文件元数据缓存失败 (${file.path}):`, error);
		}
	}

	/**
	 * 从缓存中移除文件
	 */
	private removeFromCache(filePath: string): void {
		this.fileInfoCache.delete(filePath);
		this.fileMetadataCache.delete(filePath);
	}

	/**
	 * 发送文件相关事件
	 */
	private emitFileEvent(eventType: string, data: any): void {
		this.emitEvent(eventType, {
			...data,
			source: 'file-data-manager',
			timestamp: Date.now(),
		});
	}

	/**
	 * 清理资源
	 */
	protected cleanup(): void {
		this.debug("清理文件数据管理器");

		// 清理防抖定时器
		for (const timer of this.changeDebounceTimers.values()) {
			clearTimeout(timer);
		}
		this.changeDebounceTimers.clear();

		// 清理事件监听器
		for (const ref of this.fileEventRefs) {
			try {
				ref.unload?.();
			} catch (error) {
				console.warn("清理文件事件监听器失败:", error);
			}
		}
		this.fileEventRefs = [];

		// 清理缓存
		this.fileInfoCache.clear();
		this.fileMetadataCache.clear();

		this.debug("文件数据管理器清理完成");
	}

	/**
	 * 获取内存使用统计
	 */
	getMemoryStats(): MemoryStats {
		const fileInfoSize = this.fileInfoCache.size;
		const metadataSize = this.fileMetadataCache.size;
		const timersSize = this.changeDebounceTimers.size;

		// 估算内存使用量
		// 文件信息: 约200B/文件
		// 元数据信息: 约500B/文件 
		// 定时器: 约100B/定时器
		const estimatedMemory = (fileInfoSize * 200) + (metadataSize * 500) + (timersSize * 100);

		return {
			cacheSize: fileInfoSize + metadataSize,
			estimatedMemoryUsage: estimatedMemory,
			activeListeners: this.fileEventRefs.length,
			lastCleanupTime: this.lastCleanupTime,
		};
	}

	/**
	 * 执行内存清理
	 */
	protected performMemoryCleanup(): void {
		this.debug("执行文件数据内存清理");

		const now = Date.now();
		const maxAge = 30 * 60 * 1000; // 30分钟

		// 清理过期的元数据缓存
		for (const [filePath, info] of this.fileMetadataCache.entries()) {
			if (now - info.lastUpdated > maxAge) {
				// 检查文件是否仍然存在
				const file = this.vault.getAbstractFileByPath(filePath);
				if (!file || !(file instanceof TFile)) {
					this.removeFromCache(filePath);
				}
			}
		}

		// 清理过期的防抖定时器
		for (const [filePath, timer] of this.changeDebounceTimers.entries()) {
			const file = this.vault.getAbstractFileByPath(filePath);
			if (!file || !(file instanceof TFile)) {
				clearTimeout(timer);
				this.changeDebounceTimers.delete(filePath);
			}
		}

		this.debug(`内存清理完成，文件缓存: ${this.fileInfoCache.size}，元数据缓存: ${this.fileMetadataCache.size}`);
	}

	// =================
	// 对外API接口
	// =================

	/**
	 * 获取文件信息
	 */
	getFileInfo(filePath: string): FileInfo | undefined {
		return this.fileInfoCache.get(filePath);
	}

	/**
	 * 获取文件元数据
	 */
	getFileMetadata(filePath: string): FileMetadataInfo | undefined {
		return this.fileMetadataCache.get(filePath);
	}

	/**
	 * 获取所有缓存的文件路径
	 */
	getAllCachedFiles(): string[] {
		return Array.from(this.fileInfoCache.keys());
	}

	/**
	 * 获取支持的文件列表
	 */
	getSupportedFiles(): TFile[] {
		return this.vault.getFiles().filter(file => this.shouldProcessFile(file));
	}

	/**
	 * 检查文件是否已缓存
	 */
	isFileCached(filePath: string): boolean {
		return this.fileInfoCache.has(filePath);
	}

	/**
	 * 强制更新文件缓存
	 */
	async refreshFileCache(filePath: string): Promise<void> {
		const file = this.vault.getAbstractFileByPath(filePath);
		if (file && file instanceof TFile && this.shouldProcessFile(file)) {
			await this.updateFileInfoCache(file);
			await this.updateFileMetadataCache(file);
		}
	}

	/**
	 * 批量刷新文件缓存
	 */
	async refreshAllFileCache(): Promise<void> {
		this.debug("开始批量刷新文件缓存");
		
		// 清空现有缓存
		this.fileInfoCache.clear();
		this.fileMetadataCache.clear();
		
		// 重新初始化
		await this.initializeFileCache();
		
		this.emitFileEvent('cache-refreshed', {
			fileCount: this.fileInfoCache.size,
		});
	}

	/**
	 * 获取文件过滤器
	 */
	getFileFilterManager(): FileFilterManager | undefined {
		return this.fileFilterManager;
	}

	/**
	 * 设置文件过滤器
	 */
	setFileFilterManager(filterManager?: FileFilterManager): void {
		this.fileFilterManager = filterManager;
	}

	/**
	 * 获取文件变更统计
	 */
	getFileChangeStats(): {
		totalFiles: number;
		cachedFiles: number;
		pendingChanges: number;
		activeListeners: number;
	} {
		return {
			totalFiles: this.vault.getFiles().length,
			cachedFiles: this.fileInfoCache.size,
			pendingChanges: this.changeDebounceTimers.size,
			activeListeners: this.fileEventRefs.length,
		};
	}
}