/**
 * BaseDataManager 测试 - 简化版本来调试Component继承问题
 */

// Import mocks first
import './__mocks__';

import { BaseDataManager, type BaseDataManagerConfig, type MemoryStats } from "../../utils/data-managers/BaseDataManager";

// 创建一个测试用的具体实现
class TestDataManager extends BaseDataManager {
	protected async initialize(): Promise<void> {
		console.log('TestDataManager initialize called');
		// 简单的测试实现
	}

	protected cleanup(): void {
		console.log('TestDataManager cleanup called');
		// 简单的测试实现
	}

	getMemoryStats(): MemoryStats {
		return {
			cacheSize: 0,
			estimatedMemoryUsage: 0,
			activeListeners: 0,
			lastCleanupTime: Date.now(),
		};
	}
}

describe('BaseDataManager', () => {
	let manager: TestDataManager;
	let config: BaseDataManagerConfig;

	beforeEach(() => {
		config = {
			id: "test-manager",
			debug: true,
		};

		manager = new TestDataManager(config);
	});

	afterEach(() => {
		if (manager) {
			manager.unload();
		}
	});

	test('应该能够创建实例', () => {
		expect(manager).toBeDefined();
		expect(manager.getInitialized()).toBe(false);
	});

	test('应该能够调用load方法', async () => {
		console.log('开始测试 load 方法...');
		
		const initialState = manager.getInitialized();
		console.log('初始状态:', initialState);

		try {
			await manager.load();
			console.log('load 方法完成');
		} catch (error) {
			console.error('load 方法出错:', error);
			throw error;
		}

		const finalState = manager.getInitialized();
		console.log('最终状态:', finalState);
		
		expect(finalState).toBe(true);
	});

	test('应该能够获取配置', () => {
		const retrievedConfig = manager.getConfig();
		expect(retrievedConfig.id).toBe(config.id);
		expect(retrievedConfig.debug).toBe(config.debug);
	});
});