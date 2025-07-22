/**
 * Unified Data Parsing Manager Tests
 * 
 * 测试统一数据解析管理器的核心功能
 */

// Import mocks first
import './__mocks__';
import { mockApp, mockVault, mockMetadataCache, mockPersister } from './__mocks__';

import { UnifiedDataParsingManager, UnifiedDataParsingManagerConfig } from "../../utils/data-managers/UnifiedDataParsingManager";

describe('UnifiedDataParsingManager', () => {
	let manager: UnifiedDataParsingManager;
	let config: UnifiedDataParsingManagerConfig;

	beforeEach(() => {
		config = {
			id: "test-unified-manager", 
			debug: true, // 启用debug模式来调试初始化问题
			useWorkers: false, // 测试时不使用Worker
			maxWorkers: 1,
		};

		manager = new UnifiedDataParsingManager(
			mockApp,
			mockVault,
			mockMetadataCache,
			mockPersister,
			config
		);
	});

	afterEach(async () => {
		if (manager) {
			manager.unload();
		}
	});

	describe('初始化', () => {
		test('应该能够成功创建管理器实例', () => {
			expect(manager).toBeInstanceOf(UnifiedDataParsingManager);
			expect(manager.getConfig().id).toBe("test-unified-manager");
		});

		test('应该能够获取初始化状态', () => {
			expect(manager.getInitialized()).toBe(false);
		});

		test('应该能够获取内存统计信息', () => {
			const stats = manager.getMemoryStats();
			
			expect(stats).toHaveProperty('cacheSize');
			expect(stats).toHaveProperty('estimatedMemoryUsage');
			expect(stats).toHaveProperty('activeListeners');
			expect(stats).toHaveProperty('lastCleanupTime');
			
			expect(typeof stats.cacheSize).toBe('number');
			expect(typeof stats.estimatedMemoryUsage).toBe('number');
			expect(typeof stats.activeListeners).toBe('number');
			expect(typeof stats.lastCleanupTime).toBe('number');
		});
	});

	describe('生命周期管理', () => {
		test('应该能够正确处理组件加载', async () => {
			// 检查初始状态
			const initialState = manager.getInitialized();
			
			// 检查manager是否有load方法以及其类型
			if (typeof manager.load !== 'function') {
				throw new Error(`manager.load 不是函数，类型: ${typeof manager.load}`);
			}
			
			try {
				// 直接调用onload方法看看会发生什么
				if (typeof manager.onload === 'function') {
					await manager.onload();
				} else {
					// 如果onload不存在，尝试load方法
					await manager.load();
				}
			} catch (error) {
				throw new Error(`初始化出错: ${error}. 初始状态: ${initialState}`);
			}
			
			// 验证初始化状态
			const isInitialized = manager.getInitialized();
			
			// 如果状态不对，抛出详细错误信息
			if (!isInitialized) {
				const hasOnload = typeof manager.onload === 'function';
				const hasLoad = typeof manager.load === 'function';
				throw new Error(`初始化失败! 初始状态: ${initialState}, 最终状态: ${isInitialized}, hasOnload: ${hasOnload}, hasLoad: ${hasLoad}, 配置: ${JSON.stringify(manager.getConfig())}`);
			}
			
			expect(isInitialized).toBe(true);
		});

		test('应该能够正确处理组件卸载', async () => {
			await manager.onload();
			expect(manager.getInitialized()).toBe(true);
			
			manager.unload();
			expect(manager.getInitialized()).toBe(false);
		});

		test('应该能够处理重复初始化', async () => {
			await manager.onload();
			expect(manager.getInitialized()).toBe(true);
			
			// 再次加载不应该出错
			await manager.onload();
			expect(manager.getInitialized()).toBe(true);
		});
	});

	describe('内存管理', () => {
		test('应该能够执行手动清理', () => {
			expect(() => {
				manager.forceCleanup();
			}).not.toThrow();
		});

		test('应该能够获取详细的内存统计', () => {
			const detailedStats = manager.getDetailedMemoryStats();
			
			expect(detailedStats).toHaveProperty('unified');
			expect(detailedStats).toHaveProperty('task');
			expect(detailedStats).toHaveProperty('project');
			expect(detailedStats).toHaveProperty('file');
			
			// 验证每个统计项的结构
			Object.values(detailedStats).forEach(stats => {
				expect(stats).toHaveProperty('cacheSize');
				expect(stats).toHaveProperty('estimatedMemoryUsage');
				expect(stats).toHaveProperty('activeListeners');
				expect(stats).toHaveProperty('lastCleanupTime');
			});
		});
	});

	describe('API接口', () => {
		beforeEach(async () => {
			await manager.onload();
		});

		test('应该能够获取任务列表', async () => {
			const tasks = await manager.getTasks();
			expect(Array.isArray(tasks)).toBe(true);
		});

		test('应该能够通过ID获取任务', async () => {
			const task = await manager.getTaskById('non-existent-id');
			expect(task).toBeUndefined();
		});

		test('应该能够查询任务', async () => {
			const tasks = await manager.queryTasks([], []);
			expect(Array.isArray(tasks)).toBe(true);
		});

		test('应该能够执行强制重新索引', async () => {
			await expect(manager.forceReindex()).resolves.not.toThrow();
		});
	});

	describe('错误处理', () => {
		test('应该能够处理初始化错误', async () => {
			// 模拟初始化错误
			const errorConfig = {
				...config,
				id: "", // 无效配置
			};

			const errorManager = new UnifiedDataParsingManager(
				mockApp,
				mockVault,
				mockMetadataCache,
				mockPersister,
				errorConfig
			);

			try {
				await errorManager.load();
				// 即使有错误，也应该能够处理
				expect(errorManager.getInitialized()).toBeDefined();
			} finally {
				errorManager.unload();
			}
		});

		test('应该能够处理未初始化的API调用', async () => {
			// 不初始化直接调用API
			await expect(manager.getTasks()).rejects.toThrow();
		});
	});

	describe('配置管理', () => {
		test('应该能够获取配置信息', () => {
			const retrievedConfig = manager.getConfig();
			
			expect(retrievedConfig.id).toBe(config.id);
			expect(retrievedConfig.debug).toBe(config.debug);
		});

		test('应该使用默认配置值', () => {
			const defaultConfig = {
				id: "test-default",
			};

			const defaultManager = new UnifiedDataParsingManager(
				mockApp,
				mockVault,
				mockMetadataCache,
				mockPersister,
				defaultConfig
			);

			const retrievedConfig = defaultManager.getConfig();
			
			expect(retrievedConfig.debug).toBe(false); // 默认值
			expect(retrievedConfig.cleanupInterval).toBeDefined();
			expect(retrievedConfig.maxCacheSize).toBeDefined();
			
			defaultManager.unload();
		});
	});
});

describe('UnifiedDataParsingManager 集成测试', () => {
	test('应该能够处理完整的生命周期', async () => {
		const config: UnifiedDataParsingManagerConfig = {
			id: "integration-test-manager",
			debug: true,
			useWorkers: false,
			maxWorkers: 1,
		};

		const manager = new UnifiedDataParsingManager(
			mockApp,
			mockVault,
			mockMetadataCache,
			mockPersister,
			config
		);

		try {
			// 1. 初始化
			await manager.onload();
			expect(manager.getInitialized()).toBe(true);

			// 2. 执行一些操作
			const initialStats = manager.getMemoryStats();
			expect(initialStats.cacheSize).toBeGreaterThanOrEqual(0);

			const tasks = await manager.getTasks();
			expect(Array.isArray(tasks)).toBe(true);

			// 3. 清理
			manager.forceCleanup();

			// 4. 卸载
			manager.unload();
			expect(manager.getInitialized()).toBe(false);

		} catch (error) {
			console.error("集成测试失败:", error);
			throw error;
		}
	});
});