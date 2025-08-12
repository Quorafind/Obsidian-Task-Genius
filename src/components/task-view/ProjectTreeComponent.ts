import { Component, App } from "obsidian";
import { TreeNode, ProjectNodeData } from "../../types/tree";
import { TreeComponent } from "../common/TreeComponent";
import { Task } from "../../types/task";
import { 
	buildProjectTreeFromTasks, 
	findNodeByPath, 
	getAllDescendants
} from "../../utils/projectTreeBuilder";
import { t } from "../../translations/helper";
import TaskProgressBarPlugin from "../../index";

/**
 * Project tree component for hierarchical project display
 */
export class ProjectTreeComponent extends Component {
	private treeComponent: TreeComponent<ProjectNodeData>;
	private projectTree: TreeNode<ProjectNodeData> | null = null;
	private allTasks: Task[] = [];
	
	// Events
	public onNodeSelected?: (selectedNodes: Set<string>, tasks: Task[]) => void;
	public onMultiSelectToggled?: (isMultiSelect: boolean) => void;
	
	constructor(
		private parentEl: HTMLElement,
		private app: App,
		private plugin: TaskProgressBarPlugin
	) {
		super();
	}
	
	onload(): void {
		// Create tree component with project-specific configuration
		this.treeComponent = new TreeComponent<ProjectNodeData>(
			this.parentEl,
			{
				classPrefix: 'project-tree',
				indentSize: 24, // 使用稍大的缩进以适应项目层级
				showToggle: true,
				enableSelection: true,
				enableMultiSelect: true,
				stateKey: 'task-genius-project-tree-state',
				autoExpandLevel: 1,
				
				renderContent: (node, contentEl) => {
					// Project name
					const nameEl = contentEl.createSpan({
						cls: "project-tree-item-name",
						text: node.name
					});
					
					// Task count badges
					const countsEl = contentEl.createSpan({
						cls: "project-tree-item-counts"
					});
					
					// Direct task count
					if (node.data.directTaskCount > 0) {
						countsEl.createSpan({
							cls: "project-tree-item-count-direct",
							text: node.data.directTaskCount.toString()
						});
					}
					
					// Total task count (if has children)
					if (node.children.length > 0 && node.data.totalTaskCount > node.data.directTaskCount) {
						countsEl.createSpan({
							cls: "project-tree-item-count-total",
							text: node.data.totalTaskCount.toString()
						});
					}
				},
				
				iconResolver: (node) => {
					// Use different icons based on node state
					if (node.children.length > 0) {
						return node.isExpanded ? "folder-open" : "folder";
					}
					return "file";
				},
				
				onNodeSelected: (selectedNodes) => {
					// Get tasks for selected nodes
					const tasks = this.getTasksForSelection(selectedNodes);
					
					// Trigger event
					if (this.onNodeSelected) {
						this.onNodeSelected(selectedNodes, tasks);
					}
				},
				
				onMultiSelectToggled: (isMultiSelect) => {
					if (this.onMultiSelectToggled) {
						this.onMultiSelectToggled(isMultiSelect);
					}
				}
			}
		);
		
		this.addChild(this.treeComponent);
		this.treeComponent.load();
	}
	
	/**
	 * Build tree from tasks
	 */
	public buildTree(tasks: Task[]): void {
		this.allTasks = tasks;
		
		// Build project tree
		const separator = this.plugin.settings.projectPathSeparator || "/";
		this.projectTree = buildProjectTreeFromTasks(tasks, separator);
		
		// Set tree in component
		if (this.projectTree) {
			this.treeComponent.setTree(this.projectTree);
		}
	}
	
	/**
	 * Set the project tree directly (instead of building from tasks)
	 */
	public setTree(tree: TreeNode<ProjectNodeData>, tasks: Task[]): void {
		this.projectTree = tree;
		this.allTasks = tasks;
		
		// Set tree in component
		this.treeComponent.setTree(tree);
	}
	
	/**
	 * Get tasks for current selection (includes child nodes)
	 */
	private getTasksForSelection(selectedNodes: Set<string>): Task[] {
		if (!this.projectTree || selectedNodes.size === 0) {
			return [];
		}
		
		// Collect all task IDs from selected nodes and their children
		const taskIds = new Set<string>();
		
		for (const nodePath of selectedNodes) {
			const node = findNodeByPath(this.projectTree, nodePath);
			if (node) {
				// Add all tasks from this node (includes children)
				node.data.allTaskIds.forEach(id => taskIds.add(id));
			}
		}
		
		// Filter tasks by collected IDs
		return this.allTasks.filter(task => taskIds.has(task.id));
	}
	
	/**
	 * Set multi-select mode
	 */
	public setMultiSelectMode(enabled: boolean): void {
		this.treeComponent.setMultiSelectMode(enabled);
	}
	
	/**
	 * Get selected paths
	 */
	public getSelectedPaths(): Set<string> {
		return this.treeComponent.getSelectedPaths();
	}
	
	/**
	 * Set selected paths
	 */
	public setSelectedPaths(paths: Set<string>): void {
		this.treeComponent.setSelectedPaths(paths);
	}
	
	/**
	 * Clear selection
	 */
	public clearSelection(): void {
		this.treeComponent.clearSelection();
	}
	
	/**
	 * Expand all nodes
	 */
	public expandAll(): void {
		this.treeComponent.expandAll();
	}
	
	/**
	 * Collapse all nodes
	 */
	public collapseAll(): void {
		this.treeComponent.collapseAll();
	}
	
	onunload(): void {
		// The tree component will be cleaned up automatically
		// as it's added as a child component
	}
}