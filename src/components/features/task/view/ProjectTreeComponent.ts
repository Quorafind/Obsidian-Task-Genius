import { Component, App } from "obsidian";
import { TreeNode, ProjectNodeData } from "@/types/tree";
import { TreeComponent } from "@/components/ui/tree/TreeComponent";
import { Task } from "@/types/task";
import {
	buildProjectTreeFromTasks,
	findNodeByPath,
	getAllDescendants,
} from "@/core/project-tree-builder";
import TaskProgressBarPlugin from "@/index";

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
		private plugin: TaskProgressBarPlugin,
	) {
		super();
	}

	onload(): void {
		// Create tree component with project-specific configuration
		this.treeComponent = new TreeComponent<ProjectNodeData>(
			this.parentEl,
			{
				classPrefix: "project-tree",
				indentSize: 24, // 使用稍大的缩进以适应项目层级
				showToggle: true,
				enableSelection: true,
				enableMultiSelect: true,
				stateKey: "task-genius-project-tree-state",
				autoExpandLevel: 1,

				renderContent: (node, contentEl) => {
					// Project name
					const nameEl = contentEl.createSpan({
						cls: "project-tree-item-name",
						text: node.name,
					});

					// Task count badges
					const countsEl = contentEl.createSpan({
						cls: "project-tree-item-counts",
					});

					// Calculate completed count for this node
					const calculateCompletedCount = (taskIds: Set<string>) => {
						let completed = 0;
						taskIds.forEach((taskId) => {
							const task = this.allTasks.find(
								(t) => t.id === taskId,
							);
							if (task && this.isTaskCompleted(task)) {
								completed++;
							}
						});
						return completed;
					};

					// Direct task count
					if (node.data.directTaskCount > 0) {
						const directCompleted = calculateCompletedCount(
							node.data.directTaskIds,
						);
						const directCountEl = countsEl.createSpan({
							cls: "project-tree-item-count-direct",
						});

						if (this.plugin.settings.addProgressBarToProjectsView) {
							directCountEl.setText(
								`${directCompleted}/${node.data.directTaskCount}`,
							);
							directCountEl.dataset.completed =
								directCompleted.toString();
							directCountEl.dataset.total =
								node.data.directTaskCount.toString();

							if (directCompleted === node.data.directTaskCount) {
								directCountEl.classList.add("all-completed");
							} else if (directCompleted > 0) {
								directCountEl.classList.add(
									"partially-completed",
								);
							}
						} else {
							directCountEl.setText(
								node.data.directTaskCount.toString(),
							);
						}
					}

					// Total task count (if has children)
					if (
						node.children.length > 0 &&
						node.data.totalTaskCount > node.data.directTaskCount
					) {
						const totalCompleted = calculateCompletedCount(
							node.data.allTaskIds,
						);
						const totalCountEl = countsEl.createSpan({
							cls: "project-tree-item-count-total",
						});

						if (this.plugin.settings.addProgressBarToProjectsView) {
							totalCountEl.setText(
								`${totalCompleted}/${node.data.totalTaskCount}`,
							);
							totalCountEl.dataset.completed =
								totalCompleted.toString();
							totalCountEl.dataset.total =
								node.data.totalTaskCount.toString();

							if (totalCompleted === node.data.totalTaskCount) {
								totalCountEl.classList.add("all-completed");
							} else if (totalCompleted > 0) {
								totalCountEl.classList.add(
									"partially-completed",
								);
							}
						} else {
							totalCountEl.setText(
								node.data.totalTaskCount.toString(),
							);
						}
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
				},
			},
			this.app,
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
	 * Check if a task is completed based on plugin settings
	 */
	private isTaskCompleted(task: Task): boolean {
		// If task is marked as completed in the task object
		if (task.completed) {
			return true;
		}

		const mark = task.status;
		if (!mark) {
			return false;
		}

		// Priority 1: If useOnlyCountMarks is enabled
		if (this.plugin?.settings.useOnlyCountMarks) {
			const onlyCountMarks =
				this.plugin?.settings.onlyCountTaskMarks?.split("|") || [];
			return onlyCountMarks.includes(mark);
		}

		// Priority 2: If the mark is in excludeTaskMarks, don't count it
		if (
			this.plugin?.settings.excludeTaskMarks &&
			this.plugin.settings.excludeTaskMarks.includes(mark)
		) {
			return false;
		}

		// Priority 3: Check against the task statuses
		const completedMarks =
			this.plugin?.settings.taskStatuses?.completed?.split("|") || [
				"x",
				"X",
			];
		return completedMarks.includes(mark);
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
				node.data.allTaskIds.forEach((id) => taskIds.add(id));
			}
		}

		// Filter tasks by collected IDs
		return this.allTasks.filter((task) => taskIds.has(task.id));
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
