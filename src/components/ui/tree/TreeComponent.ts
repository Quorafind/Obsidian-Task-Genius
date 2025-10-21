import { App, Component } from "obsidian";
import { TreeNode, TreeState } from "@/types/tree";
import { TreeItemRenderer } from "./TreeItemRenderer";

/**
 * Configuration for TreeComponent
 */
export interface TreeComponentConfig<T> {
	// Visual configuration
	classPrefix?: string;
	indentSize?: number;
	showToggle?: boolean;
	enableSelection?: boolean;
	enableMultiSelect?: boolean;

	// Content rendering
	renderContent: (node: TreeNode<T>, contentEl: HTMLElement) => void;
	iconResolver?: (node: TreeNode<T>) => string;

	// State persistence
	stateKey?: string;
	autoExpandLevel?: number;

	// Event handlers
	onNodeSelected?: (selectedNodes: Set<string>) => void;
	onNodeToggled?: (node: TreeNode<T>, isExpanded: boolean) => void;
	onMultiSelectToggled?: (isMultiSelect: boolean) => void;
}

/**
 * Generic tree component for rendering hierarchical data
 */
export class TreeComponent<T> extends Component {
	private containerEl: HTMLElement;
	private treeContainerEl: HTMLElement;
	private tree: TreeNode<T> | null = null;
	private selectedNodes: Set<string> = new Set();
	private expandedNodes: Set<string> = new Set();
	private nodeRenderers: Map<string, TreeItemRenderer<T>> = new Map();
	private isMultiSelectMode: boolean = false;

	constructor(
		private parentEl: HTMLElement,
		private config: TreeComponentConfig<T>,
		private app: App,
	) {
		super();
	}

	onload(): void {
		// Create container
		this.containerEl = this.parentEl.createDiv({
			cls: `${this.config.classPrefix || "tree"}-container`,
		});

		// Create tree container
		this.treeContainerEl = this.containerEl.createDiv({
			cls: `${this.config.classPrefix || "tree"}`,
		});

		// Set custom indent size if provided (as CSS variable)
		if (this.config.indentSize) {
			this.containerEl.style.setProperty(
				"--tree-indent-size",
				`${this.config.indentSize}px`,
			);
		}

		// Restore state if configured
		if (this.config.stateKey) {
			this.restoreTreeState();
		}
	}

	/**
	 * Set the tree data and render
	 */
	public setTree(tree: TreeNode<T>): void {
		this.tree = tree;

		// Apply auto-expand if configured
		if (
			this.config.autoExpandLevel !== undefined &&
			this.expandedNodes.size === 0
		) {
			this.autoExpandToLevel(tree, this.config.autoExpandLevel);
		} else if (this.expandedNodes.size > 0) {
			// Restore expanded state
			this.restoreExpandedState(tree);
		}

		// Render the tree
		this.renderTree();
	}

	/**
	 * Get the current tree
	 */
	public getTree(): TreeNode<T> | null {
		return this.tree;
	}

	/**
	 * Render the tree
	 */
	private renderTree(): void {
		// Clear existing renderers
		this.clearRenderers();

		// Clear DOM
		this.treeContainerEl.empty();

		if (!this.tree) {
			return;
		}

		// Skip root node if it's a placeholder
		const nodesToRender =
			this.tree.fullPath === "" ? this.tree.children : [this.tree];

		// Render nodes
		for (const node of nodesToRender) {
			this.renderNode(node, this.treeContainerEl);
		}

		// Update selection visuals
		this.updateSelectionVisuals();
	}

	/**
	 * Render a single node and its children
	 */
	private renderNode(node: TreeNode<T>, parentEl: HTMLElement): void {
		const container = parentEl.createDiv();

		const renderer = new TreeItemRenderer<T>(
			container,
			node,
			{
				renderContent: this.config.renderContent,
				iconResolver: this.config.iconResolver,
				classPrefix: this.config.classPrefix || "tree",
				showToggle: this.config.showToggle !== false,
				enableSelection: this.config.enableSelection !== false,
			},
			{
				onToggle: (node, isExpanded) => {
					this.handleNodeToggle(node, isExpanded);
				},
				onSelect: (node, isMultiSelect) => {
					this.handleNodeSelection(
						node,
						isMultiSelect || this.isMultiSelectMode,
					);
				},
			},
		);

		// Store renderer
		this.nodeRenderers.set(node.fullPath, renderer);

		// Apply selection state
		if (this.selectedNodes.has(node.fullPath)) {
			renderer.setSelected(true);
		}

		// Add to component lifecycle
		this.addChild(renderer);

		// Render children if expanded
		if (node.isExpanded && node.children.length > 0) {
			const childrenContainer = container.createDiv({
				cls: `${this.config.classPrefix || "tree"}-children`,
			});

			for (const child of node.children) {
				this.renderNode(child, childrenContainer);
			}
		}
	}

	/**
	 * Handle node selection
	 */
	private handleNodeSelection(
		node: TreeNode<T>,
		isMultiSelect: boolean,
	): void {
		if (!this.config.enableSelection) {
			return;
		}

		if (!isMultiSelect) {
			// Single selection
			this.selectedNodes.clear();
			this.selectedNodes.add(node.fullPath);
		} else {
			// Multi-selection
			if (this.selectedNodes.has(node.fullPath)) {
				this.selectedNodes.delete(node.fullPath);
			} else {
				this.selectedNodes.add(node.fullPath);
			}
		}

		// Update visuals
		this.updateSelectionVisuals();

		// Trigger event
		if (this.config.onNodeSelected) {
			this.config.onNodeSelected(new Set(this.selectedNodes));
		}

		// Persist state
		if (this.config.stateKey) {
			this.persistTreeState();
		}
	}

	/**
	 * Handle node toggle (expand/collapse)
	 */
	private handleNodeToggle(node: TreeNode<T>, isExpanded: boolean): void {
		node.isExpanded = isExpanded;

		// Update expanded nodes set
		if (isExpanded) {
			this.expandedNodes.add(node.fullPath);
		} else {
			this.expandedNodes.delete(node.fullPath);
		}

		// Re-render tree to show/hide children
		this.renderTree();

		// Trigger event
		if (this.config.onNodeToggled) {
			this.config.onNodeToggled(node, isExpanded);
		}

		// Persist state
		if (this.config.stateKey) {
			this.persistTreeState();
		}
	}

	/**
	 * Update visual selection state for all nodes
	 */
	private updateSelectionVisuals(): void {
		for (const [path, renderer] of this.nodeRenderers) {
			renderer.setSelected(this.selectedNodes.has(path));
		}
	}

	/**
	 * Clear all renderers
	 */
	private clearRenderers(): void {
		for (const renderer of this.nodeRenderers.values()) {
			this.removeChild(renderer);
		}
		this.nodeRenderers.clear();
	}

	/**
	 * Auto-expand nodes to a certain level
	 */
	private autoExpandToLevel(
		node: TreeNode<T>,
		level: number,
		currentLevel: number = 0,
	): void {
		if (currentLevel < level) {
			node.isExpanded = true;
			this.expandedNodes.add(node.fullPath);

			for (const child of node.children) {
				this.autoExpandToLevel(child, level, currentLevel + 1);
			}
		}
	}

	/**
	 * Restore expanded state from saved set
	 */
	private restoreExpandedState(node: TreeNode<T>): void {
		node.isExpanded =
			this.expandedNodes.has(node.fullPath) || node.fullPath === "";

		for (const child of node.children) {
			this.restoreExpandedState(child);
		}
	}

	/**
	 * Toggle multi-select mode
	 */
	public setMultiSelectMode(enabled: boolean): void {
		this.isMultiSelectMode = enabled;

		if (!enabled && this.selectedNodes.size === 0) {
			// Clear selection when disabling multi-select with no selection
			this.updateSelectionVisuals();
		}

		// Trigger event
		if (this.config.onMultiSelectToggled) {
			this.config.onMultiSelectToggled(enabled);
		}
	}

	/**
	 * Get multi-select mode status
	 */
	public getMultiSelectMode(): boolean {
		return this.isMultiSelectMode;
	}

	/**
	 * Get selected node paths
	 */
	public getSelectedPaths(): Set<string> {
		return new Set(this.selectedNodes);
	}

	/**
	 * Set selected node paths
	 */
	public setSelectedPaths(paths: Set<string>): void {
		this.selectedNodes = new Set(paths);
		this.updateSelectionVisuals();

		// Trigger event
		if (this.config.onNodeSelected) {
			this.config.onNodeSelected(new Set(this.selectedNodes));
		}
	}

	/**
	 * Clear selection
	 */
	public clearSelection(): void {
		this.selectedNodes.clear();
		this.updateSelectionVisuals();

		// Trigger event
		if (this.config.onNodeSelected) {
			this.config.onNodeSelected(new Set());
		}
	}

	/**
	 * Expand all nodes
	 */
	public expandAll(): void {
		if (!this.tree) return;

		const expandNode = (node: TreeNode<T>) => {
			node.isExpanded = true;
			this.expandedNodes.add(node.fullPath);
			node.children.forEach(expandNode);
		};

		expandNode(this.tree);
		this.renderTree();

		// Persist state
		if (this.config.stateKey) {
			this.persistTreeState();
		}
	}

	/**
	 * Collapse all nodes
	 */
	public collapseAll(): void {
		if (!this.tree) return;

		const collapseNode = (node: TreeNode<T>) => {
			node.isExpanded = false;
			node.children.forEach(collapseNode);
		};

		collapseNode(this.tree);
		this.expandedNodes.clear();
		this.renderTree();

		// Persist state
		if (this.config.stateKey) {
			this.persistTreeState();
		}
	}

	/**
	 * Find node by path
	 */
	public findNodeByPath(path: string): TreeNode<T> | undefined {
		if (!this.tree) return undefined;

		const search = (node: TreeNode<T>): TreeNode<T> | undefined => {
			if (node.fullPath === path) {
				return node;
			}

			for (const child of node.children) {
				const found = search(child);
				if (found) return found;
			}

			return undefined;
		};

		return search(this.tree);
	}

	/**
	 * Persist tree state to localStorage
	 */
	private persistTreeState(): void {
		if (!this.config.stateKey) return;

		const state: TreeState = {
			expandedNodes: Array.from(this.expandedNodes),
			selectedNodes: Array.from(this.selectedNodes),
		};

		this.app.saveLocalStorage(this.config.stateKey, JSON.stringify(state));
	}

	/**
	 * Restore tree state from localStorage
	 */
	private restoreTreeState(): void {
		if (!this.config.stateKey) return;

		try {
			const stored = (this.app as App).loadLocalStorage(
				this.config.stateKey,
			);
			if (stored) {
				const state: TreeState = JSON.parse(stored);
				this.expandedNodes = new Set(state.expandedNodes || []);
				this.selectedNodes = new Set(state.selectedNodes || []);
			}
		} catch (e) {
			console.error("Failed to restore tree state:", e);
		}
	}

	onunload(): void {
		// Clear renderers
		this.clearRenderers();

		// Clear DOM
		if (this.containerEl) {
			this.containerEl.empty();
			this.containerEl.remove();
		}
	}
}
