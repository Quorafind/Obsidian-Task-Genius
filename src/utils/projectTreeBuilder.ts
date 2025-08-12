/**
 * Project Tree Builder
 * 
 * Utilities for building hierarchical project structures from flat project lists
 */

import { TreeNode, ProjectNodeData } from "../types/tree";
import { Task } from "../types/task";
import { getEffectiveProject } from "./taskUtil";

/**
 * Parse a project path into segments
 * @param projectName The project name/path to parse
 * @param separator The path separator (default: "/")
 * @returns Array of path segments
 */
export function parseProjectPath(projectName: string, separator: string = "/"): string[] {
	if (!projectName || !projectName.trim()) {
		return [];
	}
	
	// Normalize the path by trimming and removing duplicate separators
	const normalized = projectName
		.trim()
		.replace(new RegExp(`${escapeRegExp(separator)}+`, 'g'), separator)
		.replace(new RegExp(`^${escapeRegExp(separator)}|${escapeRegExp(separator)}$`, 'g'), '');
	
	if (!normalized) {
		return [];
	}
	
	return normalized.split(separator);
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a hierarchical tree structure from a flat map of projects
 * @param projectsMap Map of project names to task IDs
 * @returns Root node of the project tree
 */
export function buildProjectTree(
	projectsMap: Map<string, Set<string>>,
	separator: string = "/"
): TreeNode<ProjectNodeData> {
	// Create root node
	const root: TreeNode<ProjectNodeData> = {
		id: "root",
		name: "Projects",
		fullPath: "",
		data: {
			directTaskIds: new Set(),
			allTaskIds: new Set(),
			directTaskCount: 0,
			totalTaskCount: 0
		},
		children: [],
		level: 0,
		isExpanded: true
	};
	
	// Build tree structure
	for (const [projectPath, taskIds] of projectsMap.entries()) {
		const segments = parseProjectPath(projectPath, separator);
		if (segments.length === 0) continue;
		
		let currentNode = root;
		let currentPath = "";
		
		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];
			const isLeaf = i === segments.length - 1;
			
			// Build the full path up to this segment
			currentPath = currentPath ? `${currentPath}${separator}${segment}` : segment;
			
			// Check if this child already exists
			let childNode = currentNode.children.find(child => child.name === segment);
			
			if (!childNode) {
				// Create new node
				childNode = {
					id: currentPath,
					name: segment,
					fullPath: currentPath,
					data: {
						directTaskIds: isLeaf ? taskIds : new Set(),
						allTaskIds: new Set(taskIds), // Will be updated later
						directTaskCount: isLeaf ? taskIds.size : 0,
						totalTaskCount: taskIds.size // Will be updated later
					},
					children: [],
					parent: currentNode,
					level: currentNode.level + 1,
					isExpanded: false
				};
				
				currentNode.children.push(childNode);
			} else if (isLeaf) {
				// Update existing node with direct tasks
				childNode.data.directTaskIds = taskIds;
				childNode.data.directTaskCount = taskIds.size;
			}
			
			currentNode = childNode;
		}
	}
	
	// Calculate cumulative task counts (bottom-up)
	calculateCumulativeCounts(root);
	
	// Sort children alphabetically at each level
	sortTreeAlphabetically(root);
	
	return root;
}

/**
 * Calculate cumulative task counts for all nodes
 */
function calculateCumulativeCounts(node: TreeNode<ProjectNodeData>): Set<string> {
	// Start with direct tasks
	const allTaskIds = new Set(node.data.directTaskIds);
	
	// Add tasks from all children
	for (const child of node.children) {
		const childTaskIds = calculateCumulativeCounts(child);
		childTaskIds.forEach(id => allTaskIds.add(id));
	}
	
	// Update node data
	node.data.allTaskIds = allTaskIds;
	node.data.totalTaskCount = allTaskIds.size;
	
	return allTaskIds;
}

/**
 * Sort tree children alphabetically at each level
 */
function sortTreeAlphabetically(node: TreeNode<ProjectNodeData>): void {
	node.children.sort((a, b) => a.name.localeCompare(b.name));
	
	// Recursively sort children
	for (const child of node.children) {
		sortTreeAlphabetically(child);
	}
}

/**
 * Build a project tree from a list of tasks
 * @param tasks List of tasks to process
 * @param separator Path separator
 * @returns Root node of the project tree
 */
export function buildProjectTreeFromTasks(
	tasks: Task[],
	separator: string = "/"
): TreeNode<ProjectNodeData> {
	// Build project map
	const projectsMap = new Map<string, Set<string>>();
	
	for (const task of tasks) {
		const projectName = getEffectiveProject(task);
		if (!projectName) continue;
		
		if (!projectsMap.has(projectName)) {
			projectsMap.set(projectName, new Set());
		}
		projectsMap.get(projectName)?.add(task.id);
	}
	
	return buildProjectTree(projectsMap, separator);
}

/**
 * Find a node in the tree by its path
 * @param root Root node of the tree
 * @param path Path to search for
 * @returns The node if found, undefined otherwise
 */
export function findNodeByPath(
	root: TreeNode<ProjectNodeData>,
	path: string
): TreeNode<ProjectNodeData> | undefined {
	if (path === "" || path === root.fullPath) {
		return root;
	}
	
	// BFS to find the node
	const queue: TreeNode<ProjectNodeData>[] = [root];
	
	while (queue.length > 0) {
		const node = queue.shift()!;
		
		if (node.fullPath === path) {
			return node;
		}
		
		queue.push(...node.children);
	}
	
	return undefined;
}

/**
 * Get all descendant nodes of a given node
 * @param node The parent node
 * @returns Array of all descendant nodes
 */
export function getAllDescendants(
	node: TreeNode<ProjectNodeData>
): TreeNode<ProjectNodeData>[] {
	const descendants: TreeNode<ProjectNodeData>[] = [];
	const queue = [...node.children];
	
	while (queue.length > 0) {
		const current = queue.shift()!;
		descendants.push(current);
		queue.push(...current.children);
	}
	
	return descendants;
}

/**
 * Expand or collapse all nodes in the tree
 * @param root Root node of the tree
 * @param expanded Whether to expand (true) or collapse (false)
 */
export function setAllNodesExpanded(
	root: TreeNode<ProjectNodeData>,
	expanded: boolean
): void {
	const queue: TreeNode<ProjectNodeData>[] = [root];
	
	while (queue.length > 0) {
		const node = queue.shift()!;
		node.isExpanded = expanded;
		queue.push(...node.children);
	}
}

/**
 * Get paths of all expanded nodes
 * @param root Root node of the tree
 * @returns Set of expanded node paths
 */
export function getExpandedPaths(root: TreeNode<ProjectNodeData>): Set<string> {
	const expandedPaths = new Set<string>();
	const queue: TreeNode<ProjectNodeData>[] = [root];
	
	while (queue.length > 0) {
		const node = queue.shift()!;
		if (node.isExpanded && node.fullPath !== "") {
			expandedPaths.add(node.fullPath);
		}
		queue.push(...node.children);
	}
	
	return expandedPaths;
}

/**
 * Restore expanded state from a set of paths
 * @param root Root node of the tree
 * @param expandedPaths Set of paths that should be expanded
 */
export function restoreExpandedState(
	root: TreeNode<ProjectNodeData>,
	expandedPaths: Set<string>
): void {
	const queue: TreeNode<ProjectNodeData>[] = [root];
	
	while (queue.length > 0) {
		const node = queue.shift()!;
		node.isExpanded = expandedPaths.has(node.fullPath) || node.fullPath === "";
		queue.push(...node.children);
	}
}