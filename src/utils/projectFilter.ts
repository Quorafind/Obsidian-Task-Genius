/**
 * Project Filter Utilities
 * 
 * Utilities for filtering tasks based on project selection
 */

import { Task } from "../types/task";
import { TreeNode, ProjectNodeData } from "../types/tree";
import { getEffectiveProject } from "./taskUtil";

/**
 * Filter tasks by selected project nodes (includes children)
 * @param tasks All tasks to filter
 * @param selectedNodes Selected project nodes
 * @returns Filtered tasks that belong to selected projects or their children
 */
export function filterTasksByProjectNodes(
	tasks: Task[],
	selectedNodes: TreeNode<ProjectNodeData>[]
): Task[] {
	if (selectedNodes.length === 0) {
		return [];
	}
	
	// Collect all task IDs from selected nodes (includes children)
	const taskIds = new Set<string>();
	
	for (const node of selectedNodes) {
		// Add all task IDs from this node (includes descendants)
		node.data.allTaskIds.forEach(id => taskIds.add(id));
	}
	
	// Filter tasks by collected IDs
	return tasks.filter(task => taskIds.has(task.id));
}

/**
 * Filter tasks by project paths (includes children)
 * @param tasks All tasks to filter
 * @param selectedPaths Selected project paths
 * @param separator Path separator
 * @returns Filtered tasks
 */
export function filterTasksByProjectPaths(
	tasks: Task[],
	selectedPaths: string[],
	separator: string = "/"
): Task[] {
	if (selectedPaths.length === 0) {
		return [];
	}
	
	return tasks.filter(task => {
		const taskProject = getEffectiveProjectPath(task);
		if (!taskProject) return false;
		
		// Check if task belongs to any selected project or their children
		return selectedPaths.some(selectedPath => 
			isTaskInProject(taskProject, selectedPath, true, separator)
		);
	});
}

/**
 * Get the effective project path for a task
 * @param task The task to get project path from
 * @returns The project path or undefined
 */
export function getEffectiveProjectPath(task: Task): string | undefined {
	return getEffectiveProject(task);
}

/**
 * Check if a task belongs to a project (with optional child inclusion)
 * @param taskProject The task's project path
 * @param projectPath The project path to check against
 * @param includeChildren Whether to include child projects
 * @param separator Path separator
 * @returns True if task belongs to the project
 */
export function isTaskInProject(
	taskProject: string,
	projectPath: string,
	includeChildren: boolean = true,
	separator: string = "/"
): boolean {
	// Normalize paths
	const normalizedTaskProject = normalizeProjectPath(taskProject, separator);
	const normalizedProjectPath = normalizeProjectPath(projectPath, separator);
	
	// Exact match
	if (normalizedTaskProject === normalizedProjectPath) {
		return true;
	}
	
	// Check if task is in a child project
	if (includeChildren) {
		// Check if task project starts with the selected project path
		// e.g., task in "Project/SubProject" matches selected "Project"
		return normalizedTaskProject.startsWith(normalizedProjectPath + separator);
	}
	
	return false;
}

/**
 * Normalize a project path
 * @param path The path to normalize
 * @param separator The separator to use
 * @returns Normalized path
 */
function normalizeProjectPath(path: string, separator: string): string {
	if (!path) return "";
	
	// Replace any separators with the standard one
	let normalized = path.replace(/[/\\]/g, separator);
	
	// Remove duplicate separators
	const regex = new RegExp(`${escapeRegExp(separator)}+`, 'g');
	normalized = normalized.replace(regex, separator);
	
	// Remove leading and trailing separators
	normalized = normalized.replace(
		new RegExp(`^${escapeRegExp(separator)}|${escapeRegExp(separator)}$`, 'g'),
		''
	);
	
	return normalized;
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Group tasks by their project paths
 * @param tasks Tasks to group
 * @param separator Path separator
 * @returns Map of project paths to tasks
 */
export function groupTasksByProject(
	tasks: Task[],
	separator: string = "/"
): Map<string, Task[]> {
	const grouped = new Map<string, Task[]>();
	
	for (const task of tasks) {
		const project = getEffectiveProjectPath(task);
		if (!project) continue;
		
		const normalized = normalizeProjectPath(project, separator);
		if (!grouped.has(normalized)) {
			grouped.set(normalized, []);
		}
		grouped.get(normalized)!.push(task);
	}
	
	return grouped;
}

/**
 * Get all parent project paths for a given path
 * @param projectPath The project path
 * @param separator Path separator
 * @returns Array of parent paths (excluding the path itself)
 */
export function getParentProjects(
	projectPath: string,
	separator: string = "/"
): string[] {
	const normalized = normalizeProjectPath(projectPath, separator);
	if (!normalized) return [];
	
	const parts = normalized.split(separator);
	const parents: string[] = [];
	
	// Build parent paths from root to immediate parent
	for (let i = 1; i < parts.length; i++) {
		parents.push(parts.slice(0, i).join(separator));
	}
	
	return parents;
}

/**
 * Get all child project paths from a list of projects
 * @param allProjects All project paths
 * @param parentPath The parent path to find children for
 * @param directOnly Whether to return only direct children
 * @param separator Path separator
 * @returns Array of child project paths
 */
export function getChildProjects(
	allProjects: string[],
	parentPath: string,
	directOnly: boolean = false,
	separator: string = "/"
): string[] {
	const normalizedParent = normalizeProjectPath(parentPath, separator);
	const children: string[] = [];
	
	for (const project of allProjects) {
		const normalized = normalizeProjectPath(project, separator);
		
		// Skip if not a child
		if (!normalized.startsWith(normalizedParent + separator)) {
			continue;
		}
		
		if (directOnly) {
			// Check if it's a direct child (no additional separators)
			const relativePath = normalized.substring(normalizedParent.length + 1);
			if (!relativePath.includes(separator)) {
				children.push(project);
			}
		} else {
			children.push(project);
		}
	}
	
	return children;
}