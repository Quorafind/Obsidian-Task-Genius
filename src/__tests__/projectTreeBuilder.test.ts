/**
 * Tests for project tree builder utilities
 */

import { 
	parseProjectPath, 
	buildProjectTree, 
	buildProjectTreeFromTasks,
	findNodeByPath,
	getAllDescendants,
	getExpandedPaths,
	restoreExpandedState
} from '../utils/projectTreeBuilder';
import { TreeNode, ProjectNodeData } from '../types/tree';
import { Task } from '../types/task';

describe('parseProjectPath', () => {
	it('should parse simple project path', () => {
		const result = parseProjectPath('Project/SubProject');
		expect(result).toEqual(['Project', 'SubProject']);
	});

	it('should handle custom separator', () => {
		const result = parseProjectPath('Project::SubProject', '::');
		expect(result).toEqual(['Project', 'SubProject']);
	});

	it('should handle empty path', () => {
		const result = parseProjectPath('');
		expect(result).toEqual([]);
	});

	it('should trim whitespace', () => {
		const result = parseProjectPath('  Project/SubProject  ');
		expect(result).toEqual(['Project', 'SubProject']);
	});

	it('should handle duplicate separators', () => {
		const result = parseProjectPath('Project//SubProject///Task');
		expect(result).toEqual(['Project', 'SubProject', 'Task']);
	});

	it('should handle leading and trailing separators', () => {
		const result = parseProjectPath('/Project/SubProject/');
		expect(result).toEqual(['Project', 'SubProject']);
	});
});

describe('buildProjectTree', () => {
	it('should build tree from flat project map', () => {
		const projectsMap = new Map<string, Set<string>>([
			['Project A', new Set(['task1', 'task2'])],
			['Project A/SubProject 1', new Set(['task3'])],
			['Project A/SubProject 2', new Set(['task4', 'task5'])],
			['Project B', new Set(['task6'])]
		]);

		const tree = buildProjectTree(projectsMap);

		expect(tree.id).toBe('root');
		expect(tree.children.length).toBe(2);

		const projectA = tree.children.find(n => n.name === 'Project A');
		expect(projectA).toBeDefined();
		expect(projectA!.children.length).toBe(2);
		expect(projectA!.data.directTaskCount).toBe(2);
		expect(projectA!.data.totalTaskCount).toBe(5);

		const subProject1 = projectA!.children.find(n => n.name === 'SubProject 1');
		expect(subProject1).toBeDefined();
		expect(subProject1!.data.directTaskCount).toBe(1);
		expect(subProject1!.data.totalTaskCount).toBe(1);
	});

	it('should handle single level projects', () => {
		const projectsMap = new Map<string, Set<string>>([
			['Project A', new Set(['task1', 'task2'])],
			['Project B', new Set(['task3'])]
		]);

		const tree = buildProjectTree(projectsMap);

		expect(tree.children.length).toBe(2);
		expect(tree.children[0].children.length).toBe(0);
		expect(tree.children[1].children.length).toBe(0);
	});

	it('should handle deep nesting', () => {
		const projectsMap = new Map<string, Set<string>>([
			['A/B/C/D', new Set(['task1'])]
		]);

		const tree = buildProjectTree(projectsMap);

		let current = tree;
		const expectedNames = ['A', 'B', 'C', 'D'];
		
		for (const name of expectedNames) {
			expect(current.children.length).toBe(1);
			current = current.children[0];
			expect(current.name).toBe(name);
		}
		
		expect(current.children.length).toBe(0);
	});

	it('should sort children alphabetically', () => {
		const projectsMap = new Map<string, Set<string>>([
			['Zebra', new Set(['task1'])],
			['Apple', new Set(['task2'])],
			['Banana', new Set(['task3'])]
		]);

		const tree = buildProjectTree(projectsMap);

		expect(tree.children[0].name).toBe('Apple');
		expect(tree.children[1].name).toBe('Banana');
		expect(tree.children[2].name).toBe('Zebra');
	});

	it('should calculate cumulative task counts correctly', () => {
		const projectsMap = new Map<string, Set<string>>([
			['Parent', new Set(['task1', 'task2'])],
			['Parent/Child1', new Set(['task3', 'task4'])],
			['Parent/Child1/GrandChild', new Set(['task5'])],
			['Parent/Child2', new Set(['task6'])]
		]);

		const tree = buildProjectTree(projectsMap);
		const parent = tree.children[0];

		expect(parent.data.directTaskCount).toBe(2);
		expect(parent.data.totalTaskCount).toBe(6);

		const child1 = parent.children.find(n => n.name === 'Child1');
		expect(child1!.data.directTaskCount).toBe(2);
		expect(child1!.data.totalTaskCount).toBe(3);
	});
});

describe('buildProjectTreeFromTasks', () => {
	it('should build tree from task list', () => {
		const tasks: Task[] = [
			{
				id: 'task1',
				content: 'Task 1',
				filePath: 'file1.md',
				line: 1,
				completed: false,
				status: ' ',
				originalMarkdown: '- [ ] Task 1',
				metadata: {
					project: 'Project A/SubProject 1',
					tags: [],
					children: []
				}
			},
			{
				id: 'task2',
				content: 'Task 2',
				filePath: 'file2.md',
				line: 1,
				completed: false,
				status: ' ',
				originalMarkdown: '- [ ] Task 2',
				metadata: {
					project: 'Project A',
					tags: [],
					children: []
				}
			},
			{
				id: 'task3',
				content: 'Task 3',
				filePath: 'file3.md',
				line: 1,
				completed: false,
				status: ' ',
				originalMarkdown: '- [ ] Task 3',
				metadata: {
					tgProject: {
						type: 'path',
						name: 'Project B',
						readonly: true
					},
					tags: [],
					children: []
				}
			}
		];

		const tree = buildProjectTreeFromTasks(tasks);

		expect(tree.children.length).toBe(2);
		
		const projectA = tree.children.find(n => n.name === 'Project A');
		expect(projectA).toBeDefined();
		expect(projectA!.data.totalTaskCount).toBe(2);
		
		const projectB = tree.children.find(n => n.name === 'Project B');
		expect(projectB).toBeDefined();
		expect(projectB!.data.totalTaskCount).toBe(1);
	});
});

describe('findNodeByPath', () => {
	let tree: TreeNode<ProjectNodeData>;

	beforeEach(() => {
		const projectsMap = new Map<string, Set<string>>([
			['Project A', new Set(['task1'])],
			['Project A/SubProject 1', new Set(['task2'])],
			['Project B', new Set(['task3'])]
		]);
		tree = buildProjectTree(projectsMap);
	});

	it('should find node by path', () => {
		const node = findNodeByPath(tree, 'Project A/SubProject 1');
		expect(node).toBeDefined();
		expect(node!.name).toBe('SubProject 1');
	});

	it('should return root for empty path', () => {
		const node = findNodeByPath(tree, '');
		expect(node).toBe(tree);
	});

	it('should return undefined for non-existent path', () => {
		const node = findNodeByPath(tree, 'Project C');
		expect(node).toBeUndefined();
	});
});

describe('getAllDescendants', () => {
	it('should get all descendant nodes', () => {
		const projectsMap = new Map<string, Set<string>>([
			['Parent', new Set(['task1'])],
			['Parent/Child1', new Set(['task2'])],
			['Parent/Child1/GrandChild', new Set(['task3'])],
			['Parent/Child2', new Set(['task4'])]
		]);

		const tree = buildProjectTree(projectsMap);
		const parent = tree.children[0];
		const descendants = getAllDescendants(parent);

		expect(descendants.length).toBe(3);
		
		const names = descendants.map(d => d.name);
		expect(names).toContain('Child1');
		expect(names).toContain('Child2');
		expect(names).toContain('GrandChild');
	});

	it('should return empty array for leaf node', () => {
		const projectsMap = new Map<string, Set<string>>([
			['Project', new Set(['task1'])]
		]);

		const tree = buildProjectTree(projectsMap);
		const project = tree.children[0];
		const descendants = getAllDescendants(project);

		expect(descendants.length).toBe(0);
	});
});

describe('expand/collapse state management', () => {
	let tree: TreeNode<ProjectNodeData>;

	beforeEach(() => {
		const projectsMap = new Map<string, Set<string>>([
			['A', new Set(['task1'])],
			['A/B', new Set(['task2'])],
			['A/B/C', new Set(['task3'])],
			['D', new Set(['task4'])]
		]);
		tree = buildProjectTree(projectsMap);
	});

	it('should get expanded paths', () => {
		// Expand some nodes
		tree.children[0].isExpanded = true;
		tree.children[0].children[0].isExpanded = true;

		const expandedPaths = getExpandedPaths(tree);

		expect(expandedPaths.has('A')).toBe(true);
		expect(expandedPaths.has('A/B')).toBe(true);
		expect(expandedPaths.has('D')).toBe(false);
	});

	it('should restore expanded state', () => {
		const expandedPaths = new Set(['A', 'A/B']);
		
		restoreExpandedState(tree, expandedPaths);

		expect(tree.children[0].isExpanded).toBe(true);
		expect(tree.children[0].children[0].isExpanded).toBe(true);
		expect(tree.children[1].isExpanded).toBe(false);
	});
});