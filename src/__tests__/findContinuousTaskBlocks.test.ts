import {
	findContinuousTaskBlocks,
	SortableTask,
	SortableTaskStatus,
} from "../commands/sortTaskCommands";

// 创建SortableTask的辅助函数
function createMockTask(
	lineNumber: number,
	indentation: number = 0,
	children: SortableTask[] = [],
	completed: boolean = false
): SortableTask {
	const status = completed ? "x" : " ";
	return {
		id: `test-${lineNumber}`,
		lineNumber,
		indentation,
		children,
		parent: undefined,
		calculatedStatus: completed
			? SortableTaskStatus.Completed
			: SortableTaskStatus.Incomplete,
		originalMarkdown: `${" ".repeat(
			indentation
		)}- [${status}] Task at line ${lineNumber}`,
		status,
		completed,
		content: `Task at line ${lineNumber}`,
		tags: [],
		metadata: {
			tags: [],
			children: [],
			project: "",
			context: "",
			priority: 0,
		},
	} as SortableTask;
}

describe("findContinuousTaskBlocks", () => {
	it("应该能够识别连续的任务块", () => {
		// 创建模拟任务数据
		const mockTasks: SortableTask[] = [
			// 第一个任务块（连续行号：0,1,2）
			createMockTask(0),
			createMockTask(1),
			createMockTask(2),

			// 第二个任务块（连续行号：5,6）- 与第一个块之间有空行
			createMockTask(5),
			createMockTask(6),
		];

		// 执行函数
		const blocks = findContinuousTaskBlocks(mockTasks);

		// 验证结果
		expect(blocks.length).toBe(2); // 应该识别出两个不连续的任务块
		expect(blocks[0].length).toBe(3); // 第一个块有3个任务
		expect(blocks[1].length).toBe(2); // 第二个块有2个任务

		// 验证块中任务的行号
		expect(blocks[0].map((t) => t.lineNumber)).toEqual([0, 1, 2]);
		expect(blocks[1].map((t) => t.lineNumber)).toEqual([5, 6]);
	});

	it("应该正确处理带有子任务的任务块", () => {
		// 创建子任务
		const childTask1 = createMockTask(1, 2);
		const childTask2 = createMockTask(2, 2);

		// 创建带有子任务的模拟数据
		const parentTask = createMockTask(0, 0, [childTask1, childTask2]);
		childTask1.parent = parentTask;
		childTask2.parent = parentTask;

		const mockTasks: SortableTask[] = [
			// 任务块1：父任务（包含子任务）
			parentTask,

			// 任务块2：独立任务
			createMockTask(5),
		];

		// 执行函数
		const blocks = findContinuousTaskBlocks(mockTasks);

		// 验证结果
		expect(blocks.length).toBe(2); // 应该识别出两个不连续的任务块

		// 验证第一个块包含父任务
		expect(blocks[0].length).toBe(1);
		expect(blocks[0][0].lineNumber).toBe(0);
		expect(blocks[0][0].children.length).toBe(2);
		expect(blocks[0][0].children[0].lineNumber).toBe(1);
		expect(blocks[0][0].children[1].lineNumber).toBe(2);

		// 验证第二个块包含独立任务
		expect(blocks[1].length).toBe(1);
		expect(blocks[1][0].lineNumber).toBe(5);
	});

	it("应该将任务及其子任务视为一个连续块", () => {
		// 创建一个带有子任务的任务，子任务在不连续的行
		const child1 = createMockTask(2, 2);
		const child2 = createMockTask(4, 2);

		const parent1 = createMockTask(0, 0, [child1]);
		child1.parent = parent1;

		const parent2 = createMockTask(3, 0, [child2]);
		child2.parent = parent2;

		const mockTasks: SortableTask[] = [parent1, parent2];

		// 执行函数 - 行号是 0, 2, 3, 4
		const blocks = findContinuousTaskBlocks(mockTasks);

		// 验证结果 - 应该是一个连续块，因为父任务的最大行号 + 1 >= 下一个任务的行号
		expect(blocks.length).toBe(1); // 应该识别为一个连续块
		expect(blocks[0].length).toBe(2); // 包含两个父任务
	});

	it("在没有任务的情况下应返回空数组", () => {
		const emptyTasks: SortableTask[] = [];
		const blocks = findContinuousTaskBlocks(emptyTasks);
		expect(blocks).toEqual([]);
	});

	it("对于乱序输入的任务应正确排序并分组", () => {
		// 创建乱序排列的任务
		const mockTasks: SortableTask[] = [
			createMockTask(5), // 第二个块
			createMockTask(1), // 第一个块
			createMockTask(6), // 第二个块
			createMockTask(0), // 第一个块
			createMockTask(2), // 第一个块
		];

		// 执行函数
		const blocks = findContinuousTaskBlocks(mockTasks);

		// 验证结果 - 应该先排序，然后分成两个块
		expect(blocks.length).toBe(2);

		// 第一个块（0,1,2）
		expect(blocks[0].length).toBe(3);
		expect(blocks[0].map((t) => t.lineNumber).sort()).toEqual([0, 1, 2]);

		// 第二个块（5,6）
		expect(blocks[1].length).toBe(2);
		expect(blocks[1].map((t) => t.lineNumber).sort()).toEqual([5, 6]);
	});
});
