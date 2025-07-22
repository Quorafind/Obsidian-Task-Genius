/**
 * Project Data Manager - 项目数据管理器
 * 
 * 专门负责项目配置和元数据管理，包括：
 * 1. 项目配置文件的解析和缓存
 * 2. 文件元数据中项目信息的提取
 * 3. 项目数据的继承和映射规则
 * 4. 为任务管理器提供项目相关服务
 */

import { MetadataCache, Vault, TFile } from "obsidian";
import { BaseDataManager, BaseDataManagerConfig, MemoryStats } from "./BaseDataManager";
import { FileDataManager, FileMetadataInfo } from "./FileDataManager";
import { TgProject } from "../../types/task";
import { 
	ProjectConfigManager, 
	ProjectConfigManagerOptions,
	ProjectConfigData,
	MetadataMapping,
	ProjectNamingStrategy 
} from "../ProjectConfigManager";

/**
 * 项目数据管理器配置接口
 */
export interface ProjectDataManagerConfig extends BaseDataManagerConfig {
	/** 项目配置管理器选项 */
	projectConfigOptions?: Partial<ProjectConfigManagerOptions>;
	/** 是否启用增强项目功能 */
	enhancedProjectEnabled?: boolean;
	/** 是否启用元数据映射 */
	metadataMappingEnabled?: boolean;
	/** 项目配置文件名 */
	configFileName?: string;
	/** 是否递归搜索配置文件 */
	searchRecursively?: boolean;
}

/**
 * 项目信息接口
 */
export interface ProjectInfo {
	/** 项目名称 */
	name: string;
	/** 项目类型/来源 */
	type: 'path' | 'metadata' | 'config' | 'default';
	/** 项目配置数据 */
	config?: Record<string, any>;
	/** 项目路径 */
	path: string;
	/** 是否只读 */
	readonly: boolean;
	/** 最后更新时间 */
	lastUpdated: number;
}

/**
 * 增强的元数据接口
 */
export interface EnhancedMetadata {
	/** 原始元数据 */
	original: Record<string, any>;
	/** 映射后的元数据 */
	mapped: Record<string, any>;
	/** 继承的项目配置 */
	projectConfig?: Record<string, any>;
	/** 项目信息 */
	tgProject?: TgProject;
	/** 最后更新时间 */
	lastUpdated: number;
}

/**
 * 项目数据管理器
 */
export class ProjectDataManager extends BaseDataManager {
	private vault: Vault;
	private metadataCache: MetadataCache;
	private fileDataManager: FileDataManager;

	// 核心组件
	private projectConfigManager?: ProjectConfigManager;

	// 缓存
	private projectInfoCache = new Map<string, ProjectInfo>(); // path -> project info
	private fileProjectCache = new Map<string, TgProject>(); // filePath -> project
	private enhancedMetadataCache = new Map<string, EnhancedMetadata>(); // filePath -> enhanced metadata

	// 配置选项
	private enhancedProjectEnabled: boolean;
	private metadataMappingEnabled: boolean;

	constructor(
		vault: Vault,
		metadataCache: MetadataCache,
		fileDataManager: FileDataManager,
		config: ProjectDataManagerConfig
	) {
		super(config);

		this.vault = vault;
		this.metadataCache = metadataCache;
		this.fileDataManager = fileDataManager;

		this.enhancedProjectEnabled = config.enhancedProjectEnabled ?? false;
		this.metadataMappingEnabled = config.metadataMappingEnabled ?? false;
	}

	/**
	 * 初始化项目数据管理器
	 */
	protected async initialize(): Promise<void> {
		this.debug("初始化项目数据管理器");

		// 1. 初始化项目配置管理器
		if (this.enhancedProjectEnabled) {
			await this.initializeProjectConfigManager();
		}

		// 2. 初始化项目数据缓存
		await this.initializeProjectCache();

		// 3. 监听文件数据变更
		this.setupFileDataListeners();

		this.debug("项目数据管理器初始化完成");
	}

	/**
	 * 初始化项目配置管理器
	 */
	private async initializeProjectConfigManager(): Promise<void> {
		const config = this.config as ProjectDataManagerConfig;
		
		if (!config.projectConfigOptions) {
			this.debug("未配置项目配置选项，跳过项目配置管理器初始化");
			return;
		}

		try {
			const projectConfigOptions: ProjectConfigManagerOptions = {
				vault: this.vault,
				metadataCache: this.metadataCache,
				configFileName: config.configFileName ?? 'project.json',
				searchRecursively: config.searchRecursively ?? true,
				metadataKey: 'project',
				pathMappings: [],
				metadataMappings: [],
				defaultProjectNaming: {
					strategy: 'foldername',
					enabled: true,
					stripExtension: true,
				},
				enhancedProjectEnabled: this.enhancedProjectEnabled,
				metadataConfigEnabled: true,
				configFileEnabled: true,
				...config.projectConfigOptions,
			};

			this.projectConfigManager = new ProjectConfigManager(projectConfigOptions);
			this.debug("项目配置管理器初始化成功");
		} catch (error) {
			console.error("项目配置管理器初始化失败:", error);
		}
	}

	/**
	 * 初始化项目数据缓存
	 */
	private async initializeProjectCache(): Promise<void> {
		this.debug("初始化项目数据缓存");

		if (!this.projectConfigManager) {
			this.debug("项目配置管理器未初始化，跳过项目缓存初始化");
			return;
		}

		try {
			// 获取所有支持的文件
			const files = this.fileDataManager.getSupportedFiles();
			
			this.debug(`开始为 ${files.length} 个文件初始化项目缓存`);

			// 批量处理文件的项目信息
			const batchSize = 50;
			for (let i = 0; i < files.length; i += batchSize) {
				const batch = files.slice(i, i + batchSize);
				await this.processBatch(batch);
				
				// 给其他任务让出时间
				if (i % 100 === 0) {
					await new Promise(resolve => setTimeout(resolve, 0));
				}
			}

			this.debug(`项目缓存初始化完成，共缓存 ${this.fileProjectCache.size} 个文件的项目信息`);
		} catch (error) {
			console.error("初始化项目缓存失败:", error);
		}
	}

	/**
	 * 批量处理文件
	 */
	private async processBatch(files: TFile[]): Promise<void> {
		const promises = files.map(file => this.updateFileProjectCache(file.path));
		await Promise.allSettled(promises);
	}

	/**
	 * 设置文件数据监听器
	 */
	private setupFileDataListeners(): void {
		// 监听文件变更
		this.onEvent('file-modified', (event) => {
			if (event.data?.filePath) {
				this.handleFileChange(event.data.filePath);
			}
		});

		// 监听文件创建
		this.onEvent('file-created', (event) => {
			if (event.data?.filePath) {
				this.handleFileChange(event.data.filePath);
			}
		});

		// 监听文件删除
		this.onEvent('file-deleted', (event) => {
			if (event.data?.filePath) {
				this.handleFileDelete(event.data.filePath);
			}
		});

		// 监听元数据变更
		this.onEvent('metadata-changed', (event) => {
			if (event.data?.filePath) {
				this.handleMetadataChange(event.data.filePath);
			}
		});
	}

	/**
	 * 处理文件变更
	 */
	private async handleFileChange(filePath: string): Promise<void> {
		this.debug(`处理文件变更: ${filePath}`);
		
		try {
			// 检查是否是项目配置文件
			if (this.isProjectConfigFile(filePath)) {
				await this.handleProjectConfigChange(filePath);
			} else {
				// 普通文件变更，更新项目缓存
				await this.updateFileProjectCache(filePath);
			}
		} catch (error) {
			console.warn(`处理文件变更失败 (${filePath}):`, error);
		}
	}

	/**
	 * 处理文件删除
	 */
	private handleFileDelete(filePath: string): void {
		this.debug(`处理文件删除: ${filePath}`);
		
		// 从缓存中移除
		this.fileProjectCache.delete(filePath);
		this.enhancedMetadataCache.delete(filePath);
		
		// 如果是项目配置文件，清理相关缓存
		if (this.isProjectConfigFile(filePath)) {
			this.clearProjectConfigCache(filePath);
		}
	}

	/**
	 * 处理元数据变更
	 */
	private async handleMetadataChange(filePath: string): Promise<void> {
		this.debug(`处理元数据变更: ${filePath}`);
		
		// 元数据变更可能影响项目信息，需要更新缓存
		await this.updateFileProjectCache(filePath);
	}

	/**
	 * 处理项目配置文件变更
	 */
	private async handleProjectConfigChange(filePath: string): Promise<void> {
		this.debug(`处理项目配置文件变更: ${filePath}`);
		
		if (!this.projectConfigManager) return;

		try {
			// 清理该配置文件的缓存
			this.projectConfigManager.clearCache(filePath);
			
			// 找出受影响的文件并更新它们的项目缓存
			const affectedFiles = this.findFilesAffectedByConfig(filePath);
			
			for (const affectedFile of affectedFiles) {
				await this.updateFileProjectCache(affectedFile);
			}

			// 发送项目配置更新事件
			this.emitEvent('project-config-updated', {
				configFile: filePath,
				affectedFiles: affectedFiles.length,
			});
		} catch (error) {
			console.error(`处理项目配置文件变更失败 (${filePath}):`, error);
		}
	}

	/**
	 * 更新文件的项目缓存
	 */
	private async updateFileProjectCache(filePath: string): Promise<void> {
		if (!this.projectConfigManager) return;

		try {
			// 获取文件的项目信息
			const tgProject = await this.projectConfigManager.determineTgProject(filePath);
			
			if (tgProject) {
				this.fileProjectCache.set(filePath, tgProject);
			} else {
				this.fileProjectCache.delete(filePath);
			}

			// 更新增强元数据缓存
			await this.updateEnhancedMetadataCache(filePath);

		} catch (error) {
			console.warn(`更新文件项目缓存失败 (${filePath}):`, error);
		}
	}

	/**
	 * 更新增强元数据缓存
	 */
	private async updateEnhancedMetadataCache(filePath: string): Promise<void> {
		if (!this.projectConfigManager || !this.metadataMappingEnabled) return;

		try {
			// 获取文件的原始元数据
			const fileMetadata = this.fileDataManager.getFileMetadata(filePath);
			if (!fileMetadata?.frontmatter) return;

			// 获取增强元数据
			const enhancedMetadata = await this.projectConfigManager.getEnhancedMetadata(filePath);
			
			// 获取项目配置
			const projectConfig = await this.projectConfigManager.getProjectConfig(filePath);
			
			// 获取项目信息
			const tgProject = this.fileProjectCache.get(filePath);

			const enhanced: EnhancedMetadata = {
				original: fileMetadata.frontmatter,
				mapped: enhancedMetadata,
				projectConfig: projectConfig || undefined,
				tgProject,
				lastUpdated: Date.now(),
			};

			this.enhancedMetadataCache.set(filePath, enhanced);

		} catch (error) {
			console.warn(`更新增强元数据缓存失败 (${filePath}):`, error);
		}
	}

	/**
	 * 判断是否是项目配置文件
	 */
	private isProjectConfigFile(filePath: string): boolean {
		const config = this.config as ProjectDataManagerConfig;
		const configFileName = config.configFileName ?? 'project.json';
		return filePath.endsWith(configFileName);
	}

	/**
	 * 查找受配置文件影响的文件
	 */
	private findFilesAffectedByConfig(configFilePath: string): string[] {
		const configDir = configFilePath.substring(0, configFilePath.lastIndexOf('/'));
		
		// 找出该目录及子目录下的所有文件
		const affectedFiles: string[] = [];
		
		for (const filePath of this.fileDataManager.getAllCachedFiles()) {
			if (filePath.startsWith(configDir)) {
				affectedFiles.push(filePath);
			}
		}
		
		return affectedFiles;
	}

	/**
	 * 清理项目配置缓存
	 */
	private clearProjectConfigCache(configFilePath: string): void {
		if (this.projectConfigManager) {
			this.projectConfigManager.clearCache(configFilePath);
		}
		
		// 清理相关的项目信息缓存
		const affectedFiles = this.findFilesAffectedByConfig(configFilePath);
		for (const filePath of affectedFiles) {
			this.fileProjectCache.delete(filePath);
			this.enhancedMetadataCache.delete(filePath);
		}
	}

	/**
	 * 清理资源
	 */
	protected cleanup(): void {
		this.debug("清理项目数据管理器");
		
		// 清理缓存
		this.projectInfoCache.clear();
		this.fileProjectCache.clear();
		this.enhancedMetadataCache.clear();
		
		this.debug("项目数据管理器清理完成");
	}

	/**
	 * 获取内存使用统计
	 */
	getMemoryStats(): MemoryStats {
		const projectInfoSize = this.projectInfoCache.size;
		const fileProjectSize = this.fileProjectCache.size;
		const enhancedMetadataSize = this.enhancedMetadataCache.size;

		// 估算内存使用量
		// 项目信息: 约300B/项目
		// 文件项目映射: 约150B/文件
		// 增强元数据: 约800B/文件
		const estimatedMemory = (projectInfoSize * 300) + 
								(fileProjectSize * 150) + 
								(enhancedMetadataSize * 800);

		return {
			cacheSize: projectInfoSize + fileProjectSize + enhancedMetadataSize,
			estimatedMemoryUsage: estimatedMemory,
			activeListeners: this.eventRefs.length,
			lastCleanupTime: this.lastCleanupTime,
		};
	}

	/**
	 * 执行内存清理
	 */
	protected performMemoryCleanup(): void {
		this.debug("执行项目数据内存清理");

		const now = Date.now();
		const maxAge = 60 * 60 * 1000; // 1小时

		// 清理过期的增强元数据缓存
		for (const [filePath, metadata] of this.enhancedMetadataCache.entries()) {
			if (now - metadata.lastUpdated > maxAge) {
				// 检查文件是否仍然存在
				if (!this.fileDataManager.isFileCached(filePath)) {
					this.enhancedMetadataCache.delete(filePath);
					this.fileProjectCache.delete(filePath);
				}
			}
		}

		// 触发项目配置管理器的清理
		if (this.projectConfigManager) {
			this.projectConfigManager.clearCache();
		}

		this.debug(`项目数据内存清理完成，项目缓存: ${this.fileProjectCache.size}，元数据缓存: ${this.enhancedMetadataCache.size}`);
	}

	// =================
	// 对外API接口
	// =================

	/**
	 * 获取文件的项目信息
	 */
	getFileProject(filePath: string): TgProject | undefined {
		return this.fileProjectCache.get(filePath);
	}

	/**
	 * 获取文件的增强元数据
	 */
	getEnhancedMetadata(filePath: string): Record<string, any> {
		const enhanced = this.enhancedMetadataCache.get(filePath);
		return enhanced?.mapped ?? {};
	}

	/**
	 * 获取文件的项目配置
	 */
	async getProjectConfig(filePath: string): Promise<Record<string, any> | undefined> {
		if (!this.projectConfigManager) return undefined;
		
		try {
			return await this.projectConfigManager.getProjectConfig(filePath);
		} catch (error) {
			console.warn(`获取项目配置失败 (${filePath}):`, error);
			return undefined;
		}
	}

	/**
	 * 获取所有项目信息
	 */
	getAllProjects(): Map<string, TgProject> {
		return new Map(this.fileProjectCache);
	}

	/**
	 * 检查是否启用了增强项目功能
	 */
	isEnhancedProjectEnabled(): boolean {
		return this.enhancedProjectEnabled;
	}

	/**
	 * 刷新指定文件的项目数据
	 */
	async refreshFileProjectData(filePath: string): Promise<void> {
		await this.updateFileProjectCache(filePath);
		
		this.emitEvent('project-data-updated', {
			action: 'file_refreshed',
			filePath,
		});
	}

	/**
	 * 批量刷新项目数据
	 */
	async refreshAllProjectData(): Promise<void> {
		this.debug("开始批量刷新项目数据");
		
		// 清空缓存
		this.fileProjectCache.clear();
		this.enhancedMetadataCache.clear();
		
		// 重新初始化
		await this.initializeProjectCache();
		
		this.emitEvent('project-data-updated', {
			action: 'cache_refreshed',
			fileCount: this.fileProjectCache.size,
		});
	}

	/**
	 * 获取项目统计信息
	 */
	getProjectStats(): {
		totalFiles: number;
		filesWithProjects: number;
		uniqueProjects: number;
		enhancedMetadataFiles: number;
	} {
		const uniqueProjects = new Set();
		
		for (const project of this.fileProjectCache.values()) {
			uniqueProjects.add(project.name);
		}

		return {
			totalFiles: this.fileDataManager.getAllCachedFiles().length,
			filesWithProjects: this.fileProjectCache.size,
			uniqueProjects: uniqueProjects.size,
			enhancedMetadataFiles: this.enhancedMetadataCache.size,
		};
	}

	/**
	 * 文件更新时的回调（从其他管理器调用）
	 */
	async onFileUpdated(filePath: string): Promise<void> {
		await this.handleFileChange(filePath);
	}
}