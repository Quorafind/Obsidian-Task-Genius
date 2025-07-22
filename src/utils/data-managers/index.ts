/**
 * Data Managers Module - 统一数据管理系统导出
 * 
 * 提供统一的数据解析和管理功能，包括：
 * - 任务数据管理
 * - 项目数据管理  
 * - 文件数据管理
 * - 生命周期管理
 * - 内存泄漏防护
 */

// 核心管理器
export { BaseDataManager, type BaseDataManagerConfig, type MemoryStats, type DataManagerEvent } from './BaseDataManager';
export { UnifiedDataParsingManager, type UnifiedDataParsingManagerConfig, ManagerEventType } from './UnifiedDataParsingManager';

// 子管理器
export { TaskDataManager, type TaskDataManagerConfig, TaskParserType } from './TaskDataManager';
export { ProjectDataManager, type ProjectDataManagerConfig, type ProjectInfo, type EnhancedMetadata } from './ProjectDataManager';
export { FileDataManager, type FileDataManagerConfig, type FileInfo, type FileMetadataInfo, type FileChangeEvent } from './FileDataManager';

// 兼容性适配器
export { TaskManagerAdapter, type TaskManagerOptions } from './TaskManagerAdapter';

// 工具函数和类型
export type { ITaskParser } from './TaskDataManager';

/**
 * 创建任务管理器适配器实例的便利函数
 */
import { App, MetadataCache, Vault } from "obsidian";
import { TaskManagerAdapter, TaskManagerOptions } from './TaskManagerAdapter';
import type TaskProgressBarPlugin from "../../index";

export function createTaskManager(
	app: App,
	vault: Vault,
	metadataCache: MetadataCache,
	plugin: TaskProgressBarPlugin,
	options?: Partial<TaskManagerOptions>
): TaskManagerAdapter {
	return new TaskManagerAdapter(app, vault, metadataCache, plugin, options);
}

/**
 * 版本信息
 */
export const DATA_MANAGERS_VERSION = "1.0.0";

/**
 * 默认配置
 */
export const DEFAULT_DATA_MANAGER_CONFIG = {
	debug: false,
	cleanupInterval: 5 * 60 * 1000, // 5分钟
	maxCacheSize: 1000,
	memoryLimit: 10 * 1024 * 1024, // 10MB
};

/**
 * 内存监控工具
 */
export class MemoryMonitor {
	private managers: BaseDataManager[] = [];

	addManager(manager: BaseDataManager): void {
		this.managers.push(manager);
	}

	removeManager(manager: BaseDataManager): void {
		const index = this.managers.indexOf(manager);
		if (index !== -1) {
			this.managers.splice(index, 1);
		}
	}

	getTotalMemoryUsage(): MemoryStats {
		let totalCacheSize = 0;
		let totalMemoryUsage = 0;
		let totalListeners = 0;
		let earliestCleanup = Date.now();

		for (const manager of this.managers) {
			const stats = manager.getMemoryStats();
			totalCacheSize += stats.cacheSize;
			totalMemoryUsage += stats.estimatedMemoryUsage;
			totalListeners += stats.activeListeners;
			
			if (stats.lastCleanupTime < earliestCleanup) {
				earliestCleanup = stats.lastCleanupTime;
			}
		}

		return {
			cacheSize: totalCacheSize,
			estimatedMemoryUsage: totalMemoryUsage,
			activeListeners: totalListeners,
			lastCleanupTime: earliestCleanup,
		};
	}

	forceCleanupAll(): void {
		for (const manager of this.managers) {
			try {
				manager.forceCleanup();
			} catch (error) {
				console.error("强制清理管理器失败:", error);
			}
		}
	}

	getDetailedReport(): {
		managers: Array<{
			id: string;
			stats: MemoryStats;
			healthy: boolean;
		}>;
		summary: MemoryStats;
		recommendations: string[];
	} {
		const managerReports = this.managers.map(manager => {
			const stats = manager.getMemoryStats();
			const config = manager.getConfig();
			
			// 简单的健康检查
			const healthy = 
				stats.estimatedMemoryUsage < (config.memoryLimit || 10 * 1024 * 1024) &&
				stats.cacheSize < (config.maxCacheSize || 1000);

			return {
				id: config.id,
				stats,
				healthy,
			};
		});

		const summary = this.getTotalMemoryUsage();
		const recommendations: string[] = [];

		// 生成建议
		if (summary.estimatedMemoryUsage > 50 * 1024 * 1024) { // 50MB
			recommendations.push("总内存使用量较高，建议执行清理操作");
		}

		if (summary.activeListeners > 100) {
			recommendations.push("活跃监听器数量较多，请检查是否有内存泄漏");
		}

		const unhealthyManagers = managerReports.filter(r => !r.healthy);
		if (unhealthyManagers.length > 0) {
			recommendations.push(`有 ${unhealthyManagers.length} 个管理器状态异常`);
		}

		return {
			managers: managerReports,
			summary,
			recommendations,
		};
	}
}

/**
 * 全局内存监控实例
 */
export const globalMemoryMonitor = new MemoryMonitor();