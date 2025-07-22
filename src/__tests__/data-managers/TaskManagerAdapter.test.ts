/**
 * Task Manager Adapter Tests
 * 
 * 测试任务管理器适配器的兼容性
 */

// Import mocks first
import './__mocks__';
import { mockApp, mockVault, mockMetadataCache, mockPlugin } from './__mocks__';

import { TaskManagerAdapter, TaskManagerOptions } from "../../utils/data-managers/TaskManagerAdapter";
import { Task } from "../../types/task";

describe('TaskManagerAdapter', () => {
	let adapter: TaskManagerAdapter;
	let options: TaskManagerOptions;

	beforeEach(() => {
		options = {
			useWorkers: false, // 测试时不使用Worker
			maxWorkers: 1,
			debug: false,
		};

		adapter = new TaskManagerAdapter(
			mockApp,
			mockVault,
			mockMetadataCache,
			mockPlugin,
			options
		);
	});

	afterEach(() => {
		if (adapter) {
			adapter.unload();
		}
	});

	describe('基本API兼容性', () => {
		test('应该具有所有必要的方法', () => {
			// 检查核心方法存在
			expect(typeof adapter.initialize).toBe('function');
			expect(typeof adapter.getTasks).toBe('function');
			expect(typeof adapter.getTaskById).toBe('function');
			expect(typeof adapter.updateTask).toBe('function');
			expect(typeof adapter.deleteTask).toBe('function');
			expect(typeof adapter.createTask).toBe('function');
			expect(typeof adapter.indexFile).toBe('function');
			expect(typeof adapter.indexAllFiles).toBe('function');
			expect(typeof adapter.queryTasks).toBe('function');
			expect(typeof adapter.forceReindex).toBe('function');

			// 检查兼容性方法存在
			expect(typeof adapter.getCache).toBe('function');
			expect(typeof adapter.getMemoryStats).toBe('function');
			expect(typeof adapter.clearCache).toBe('function');
			expect(typeof adapter.getInitialized).toBe('function');
		});

		test('应该具有兼容性属性', () => {
			expect(adapter.persister).toBeDefined();
		});
	});

	describe('初始化兼容性', () => {
		test('应该能够正常初始化', async () => {
			expect(adapter.getInitialized()).toBe(false);
			
			await adapter.initialize();
			
			expect(adapter.getInitialized()).toBe(true);
		});

		test('应该能够处理重复初始化', async () => {
			await adapter.initialize();
			expect(adapter.getInitialized()).toBe(true);
			
			// 再次初始化不应该出错
			await adapter.initialize();
			expect(adapter.getInitialized()).toBe(true);
		});
	});

	describe('任务管理API兼容性', () => {
		beforeEach(async () => {
			await adapter.initialize();
		});

		test('getTasks 应该返回任务数组', async () => {
			const tasks = await adapter.getTasks();
			expect(Array.isArray(tasks)).toBe(true);
		});

		test('getTaskById 应该处理不存在的任务', async () => {
			const task = await adapter.getTaskById('non-existent-id');
			expect(task).toBeUndefined();
		});

		test('createTask 应该能创建新任务', async () => {
			const partialTask: Partial<Task> = {
				content: "Test task",
				filePath: "/test/file.md",
			};

			const newTask = await adapter.createTask(partialTask);
			
			expect(newTask).toBeDefined();
			expect(newTask.id).toBeDefined();
			expect(newTask.content).toBe("Test task");
			expect(newTask.filePath).toBe("/test/file.md");
			expect(newTask.completed).toBe(false);
			expect(newTask.status).toBe(" ");
		});

		test('updateTask 应该能更新任务', async () => {
			const task: Task = {
				id: "test-task-1",
				content: "Updated task",
				filePath: "/test/file.md",
				line: 0,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Updated task",
				metadata: {
					tags: [],
					children: [],
					heading: [],
				},
			};

			await expect(adapter.updateTask(task)).resolves.not.toThrow();
		});

		test('deleteTask 应该能删除任务', async () => {
			await expect(adapter.deleteTask("test-task-1")).resolves.not.toThrow();
		});

		test('queryTasks 应该返回任务数组', async () => {
			const tasks = await adapter.queryTasks([], []);
			expect(Array.isArray(tasks)).toBe(true);
		});
	});

	describe('缓存和统计API兼容性', () => {
		beforeEach(async () => {
			await adapter.initialize();
		});

		test('getCache 应该返回TaskCache结构', () => {
			const cache = adapter.getCache();
			
			expect(cache).toBeDefined();
			expect(cache.tasks).toBeInstanceOf(Map);
			expect(cache.files).toBeInstanceOf(Map);
			expect(cache.tags).toBeInstanceOf(Map);
			expect(cache.projects).toBeInstanceOf(Map);
			expect(cache.completed).toBeInstanceOf(Map);
		});

		test('getMemoryStats 应该返回统计信息', () => {
			const stats = adapter.getMemoryStats();
			
			expect(stats).toBeDefined();
			expect(stats.unified).toBeDefined();
			expect(stats.task).toBeDefined();
			expect(stats.project).toBeDefined();
			expect(stats.file).toBeDefined();
		});

		test('clearCache 应该能正常执行', () => {
			expect(() => {
				adapter.clearCache();
			}).not.toThrow();
		});
	});

	describe('文件索引API兼容性', () => {
		beforeEach(async () => {
			await adapter.initialize();
		});

		const mockFile = {
			path: "/test/file.md",
			name: "file.md",
			extension: "md",
			stat: { mtime: Date.now(), size: 1000 },
		} as any;

		test('indexFile 应该能索引文件', async () => {
			await expect(adapter.indexFile(mockFile)).resolves.not.toThrow();
		});

		test('indexAllFiles 应该能索引所有文件', async () => {
			await expect(adapter.indexAllFiles()).resolves.not.toThrow();
		});

		test('updateIndex 应该作为indexFile的别名', async () => {
			await expect(adapter.updateIndex(mockFile)).resolves.not.toThrow();
		});

		test('forceReindex 应该能强制重新索引', async () => {
			await expect(adapter.forceReindex()).resolves.not.toThrow();
		});
	});

	describe('高级功能API', () => {
		beforeEach(async () => {
			await adapter.initialize();
		});

		test('getPerformanceStats 应该返回性能统计', () => {
			const stats = adapter.getPerformanceStats();
			
			expect(stats).toBeDefined();
			expect(stats.memoryStats).toBeDefined();
			expect(stats.initialized).toBeDefined();
			expect(stats.managerStatus).toBeDefined();
		});

		test('getUnifiedManager 应该返回统一管理器实例', () => {
			const unifiedManager = adapter.getUnifiedManager();
			expect(unifiedManager).toBeDefined();
		});

		test('healthCheck 应该返回健康检查结果', async () => {
			const health = await adapter.healthCheck();
			
			expect(health).toBeDefined();
			expect(typeof health.healthy).toBe('boolean');
			expect(Array.isArray(health.issues)).toBe(true);
			expect(health.stats).toBeDefined();
		});
	});

	describe('错误处理', () => {
		test('未初始化时调用API应该自动初始化', async () => {
			// 不初始化直接调用，应该自动初始化而不是抛出错误
			const tasks = await adapter.getTasks();
			expect(Array.isArray(tasks)).toBe(true);
			expect(adapter.getInitialized()).toBe(true);
		});

		test('应该能处理无效的任务创建', async () => {
			await adapter.initialize();
			
			const invalidTask = {} as Partial<Task>;
			const newTask = await adapter.createTask(invalidTask);
			
			// 应该填充默认值
			expect(newTask.id).toBeDefined();
			expect(newTask.content).toBe("");
			expect(newTask.filePath).toBe("");
		});
	});
});

describe('TaskManagerAdapter 集成测试', () => {
	test('应该能够处理完整的任务生命周期', async () => {
		const adapter = new TaskManagerAdapter(
			mockApp,
			mockVault,
			mockMetadataCache,
			mockPlugin,
			{ useWorkers: false, debug: false }
		);

		try {
			// 1. 初始化
			await adapter.initialize();
			expect(adapter.getInitialized()).toBe(true);

			// 2. 创建任务
			const newTask = await adapter.createTask({
				content: "Integration test task",
				filePath: "/test/integration.md",
			});
			expect(newTask.id).toBeDefined();

			// 3. 获取任务
			const retrievedTask = await adapter.getTaskById(newTask.id);
			expect(retrievedTask?.content).toBe("Integration test task");

			// 4. 更新任务
			const updatedTask = {
				...newTask,
				completed: true,
				status: "x",
			};
			await adapter.updateTask(updatedTask);

			// 5. 检查统计
			const stats = adapter.getMemoryStats();
			expect(stats).toBeDefined();

			// 6. 健康检查
			const health = await adapter.healthCheck();
			expect(health.healthy).toBeDefined();

			// 7. 清理
			await adapter.deleteTask(newTask.id);

		} finally {
			adapter.unload();
		}
	});
});