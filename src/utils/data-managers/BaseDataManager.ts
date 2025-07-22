/**
 * Base Data Manager - 统一数据管理器的抽象基类
 * 
 * 提供统一的生命周期管理接口，确保所有数据管理器都有一致的：
 * - 初始化和清理流程
 * - 内存管理机制 
 * - 事件处理系统
 * - 错误处理策略
 */

import { Component, EventRef } from "obsidian";

/**
 * 数据管理器的基础事件接口
 */
export interface DataManagerEvent {
	type: string;
	data?: any;
	timestamp: number;
	source: string;
}

/**
 * 内存使用统计接口
 */
export interface MemoryStats {
	/** 缓存的对象数量 */
	cacheSize: number;
	/** 估算的内存使用量（字节） */
	estimatedMemoryUsage: number;
	/** 活跃的事件监听器数量 */
	activeListeners: number;
	/** 最后一次清理时间 */
	lastCleanupTime: number;
}

/**
 * 数据管理器配置接口
 */
export interface BaseDataManagerConfig {
	/** 数据管理器的唯一标识符 */
	id: string;
	/** 是否启用调试模式 */
	debug?: boolean;
	/** 缓存清理间隔（毫秒），默认5分钟 */
	cleanupInterval?: number;
	/** 最大缓存大小，默认1000 */
	maxCacheSize?: number;
	/** 内存使用限制（字节），默认10MB */
	memoryLimit?: number;
}

/**
 * 数据管理器抽象基类
 */
export abstract class BaseDataManager extends Component {
	protected config: BaseDataManagerConfig;
	protected eventRefs: EventRef[] = [];
	protected cleanupTimer?: NodeJS.Timeout;
	protected lastCleanupTime: number = 0;
	protected isInitialized: boolean = false;

	constructor(config: BaseDataManagerConfig) {
		super();
		this.config = {
			debug: false,
			cleanupInterval: 5 * 60 * 1000, // 5分钟
			maxCacheSize: 1000,
			memoryLimit: 10 * 1024 * 1024, // 10MB
			...config,
		};
	}

	/**
	 * 组件加载时的初始化
	 */
	async onload(): Promise<void> {
		try {
			this.debug("初始化数据管理器开始");
			
			// 执行子类特定的初始化
			await this.initialize();
			
			// 设置定时清理
			this.setupCleanupTimer();
			
			// 注册事件监听器
			this.setupEventListeners();
			
			this.isInitialized = true;
			this.debug("数据管理器初始化完成 - isInitialized:", this.isInitialized);
		} catch (error) {
			this.isInitialized = false;
			// 在测试环境中，抛出详细错误信息便于调试
			throw new Error(`${this.config.id} 初始化失败: ${error}. isInitialized: ${this.isInitialized}`);
		}
	}

	/**
	 * 组件卸载时的清理
	 */
	onunload(): void {
		try {
			this.debug("开始清理数据管理器");
			
			// 标记为未初始化
			this.isInitialized = false;
			
			// 清理定时器
			if (this.cleanupTimer) {
				clearInterval(this.cleanupTimer);
				this.cleanupTimer = undefined;
			}
			
			// 移除事件监听器
			this.removeEventListeners();
			
			// 执行子类特定的清理
			this.cleanup();
			
			this.debug("数据管理器清理完成");
		} catch (error) {
			console.error(`${this.config.id} 清理失败:`, error);
		}
	}

	/**
	 * 抽象方法：子类必须实现的初始化逻辑
	 */
	protected abstract initialize(): Promise<void>;

	/**
	 * 抽象方法：子类必须实现的清理逻辑
	 */
	protected abstract cleanup(): void;

	/**
	 * 抽象方法：子类必须实现的内存统计
	 */
	abstract getMemoryStats(): MemoryStats;

	/**
	 * 设置事件监听器（子类可重写）
	 */
	protected setupEventListeners(): void {
		// 默认不设置任何监听器，子类可以重写此方法
	}

	/**
	 * 移除事件监听器
	 */
	protected removeEventListeners(): void {
		this.eventRefs.forEach(ref => {
			if (ref) {
				try {
					// EventRef没有unload方法，应该使用app.workspace.offref
					if (this.app && this.app.workspace && typeof this.app.workspace.offref === 'function') {
						this.app.workspace.offref(ref);
					}
				} catch (error) {
					console.error(`${this.config.id} 移除事件监听器失败:`, error);
				}
			}
		});
		this.eventRefs = [];
	}

	/**
	 * 设置定时清理机制
	 */
	private setupCleanupTimer(): void {
		if (this.config.cleanupInterval && this.config.cleanupInterval > 0) {
			this.cleanupTimer = setInterval(() => {
				this.performCleanup();
			}, this.config.cleanupInterval);
		}
	}

	/**
	 * 执行清理操作
	 */
	protected performCleanup(): void {
		try {
			this.debug("执行定期清理");
			
			const stats = this.getMemoryStats();
			const needsCleanup = 
				stats.cacheSize > this.config.maxCacheSize! ||
				stats.estimatedMemoryUsage > this.config.memoryLimit!;
			
			if (needsCleanup) {
				this.debug(`内存使用超限，开始清理：缓存大小=${stats.cacheSize}，内存使用=${stats.estimatedMemoryUsage}`);
				this.performMemoryCleanup();
			}
			
			this.lastCleanupTime = Date.now();
			
		} catch (error) {
			console.error(`${this.config.id} 清理过程出错:`, error);
		}
	}

	/**
	 * 执行内存清理（子类可重写）
	 */
	protected performMemoryCleanup(): void {
		// 默认实现为空，子类应该重写此方法
		this.debug("执行默认内存清理（无操作）");
	}

	/**
	 * 发送事件（用于管理器间通信）
	 */
	protected emitEvent(type: string, data?: any): void {
		const event: DataManagerEvent = {
			type,
			data,
			timestamp: Date.now(),
			source: this.config.id,
		};
		
		// 使用 Obsidian 的工作区事件系统
		// @ts-ignore - workspace 在实际运行时可用
		if (this.app && this.app.workspace) {
			this.app.workspace.trigger(`data-manager:${type}`, event);
		}
		
		this.debug(`发送事件: ${type}`, data);
	}

	/**
	 * 监听事件（用于管理器间通信）
	 */
	protected onEvent(type: string, handler: (event: DataManagerEvent) => void): void {
		// @ts-ignore - workspace 在实际运行时可用
		if (this.app && this.app.workspace) {
			const ref = this.app.workspace.on(`data-manager:${type}`, handler);
			this.eventRefs.push(ref);
		}
	}

	/**
	 * 调试日志输出
	 */
	protected debug(message: string, ...args: any[]): void {
		if (this.config.debug) {
			console.log(`[${this.config.id}] ${message}`, ...args);
		}
	}

	/**
	 * 检查是否已初始化
	 */
	protected ensureInitialized(): void {
		if (!this.isInitialized) {
			throw new Error(`${this.config.id} 尚未初始化`);
		}
	}

	/**
	 * 获取配置信息
	 */
	getConfig(): Readonly<BaseDataManagerConfig> {
		return { ...this.config };
	}

	/**
	 * 获取是否已初始化状态
	 */
	getInitialized(): boolean {
		return this.isInitialized;
	}

	/**
	 * 手动触发清理
	 */
	forceCleanup(): void {
		this.performCleanup();
	}
}