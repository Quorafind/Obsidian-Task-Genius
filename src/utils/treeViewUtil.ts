import { Task } from "./types/TaskIndex";

/**
 * Convert a flat list of tasks to a hierarchical tree structure
 * @param tasks Flat list of tasks
 * @returns List of root tasks with children populated recursively
 */
export function tasksToTree(tasks: Task[]): Task[] {
	// Create a map for quick task lookup
	const taskMap = new Map<string, Task>();
	tasks.forEach((task) => {
		taskMap.set(task.id, { ...task });
	});

	// Find root tasks and build hierarchy
	const rootTasks: Task[] = [];

	// First pass: connect children to parents
	tasks.forEach((task) => {
		const taskWithChildren = taskMap.get(task.id)!;

		if (task.parent && taskMap.has(task.parent)) {
			// This task has a parent, add it to parent's children
			const parent = taskMap.get(task.parent)!;
			if (!parent.children.includes(task.id)) {
				parent.children.push(task.id);
			}
		} else {
			// No parent or parent not in current set, treat as root
			rootTasks.push(taskWithChildren);
		}
	});

	return rootTasks;
}

/**
 * Flatten a tree of tasks back to a list, with child tasks following their parents
 * @param rootTasks List of root tasks with populated children
 * @param taskMap Map of all tasks by ID for lookup
 * @returns Flattened list of tasks in hierarchical order
 */
export function flattenTaskTree(
	rootTasks: Task[],
	taskMap: Map<string, Task>
): Task[] {
	const result: Task[] = [];

	function addTaskAndChildren(task: Task) {
		result.push(task);

		// Add all children recursively
		task.children.forEach((childId) => {
			const childTask = taskMap.get(childId);
			if (childTask) {
				addTaskAndChildren(childTask);
			}
		});
	}

	// Process all root tasks
	rootTasks.forEach((task) => {
		addTaskAndChildren(task);
	});

	return result;
}
