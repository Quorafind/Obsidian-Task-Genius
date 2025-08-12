import { Component, setIcon } from "obsidian";
import { TreeNode, TreeNodeEvents } from "../../types/tree";

/**
 * Configuration for tree item rendering
 */
export interface TreeItemRendererConfig<T> {
	/** Function to render custom content for a node */
	renderContent: (node: TreeNode<T>, container: HTMLElement) => void;
	
	/** Function to determine the icon for a node */
	iconResolver?: (node: TreeNode<T>) => string;
	
	/** CSS class prefix for styling */
	classPrefix?: string;
	
	/** Whether to show expand/collapse toggle */
	showToggle?: boolean;
	
	/** Whether to enable selection */
	enableSelection?: boolean;
}

/**
 * Generic tree item renderer component
 * Provides reusable tree rendering logic for any hierarchical data
 */
export class TreeItemRenderer<T> extends Component {
	private containerEl: HTMLElement;
	private node: TreeNode<T>;
	private config: TreeItemRendererConfig<T>;
	private events: TreeNodeEvents<T>;
	private childRenderers: TreeItemRenderer<T>[] = [];
	
	// DOM elements
	private nodeEl: HTMLElement;
	private toggleEl?: HTMLElement;
	private iconEl?: HTMLElement;
	private contentEl: HTMLElement;
	private childrenContainerEl?: HTMLElement;
	
	constructor(
		containerEl: HTMLElement,
		node: TreeNode<T>,
		config: TreeItemRendererConfig<T>,
		events: TreeNodeEvents<T> = {}
	) {
		super();
		this.containerEl = containerEl;
		this.node = node;
		this.events = events;
		
		// Apply default config values
		this.config = {
			renderContent: config.renderContent,
			iconResolver: config.iconResolver || (() => "folder"),
			classPrefix: config.classPrefix || "tree",
			showToggle: config.showToggle !== false,
			enableSelection: config.enableSelection !== false
		} as Required<TreeItemRendererConfig<T>>;
	}
	
	onload(): void {
		this.render();
	}
	
	/**
	 * Render the tree node and its children
	 */
	private render(): void {
		const prefix = this.config.classPrefix;
		
		// Create main node container
		this.nodeEl = this.containerEl.createDiv({
			cls: `${prefix}-item`,
			attr: {
				"data-node-id": this.node.id,
				"data-level": this.node.level.toString(),
				"role": "treeitem"
			}
		});
		
		// Set CSS variable for level-based indentation
		this.nodeEl.style.setProperty('--tree-level', this.node.level.toString());
		
		// Set aria-expanded if node has children
		if (this.node.children.length > 0) {
			this.nodeEl.setAttribute('aria-expanded', this.node.isExpanded.toString());
		}
		
		// Apply selection state
		if (this.node.isSelected) {
			this.nodeEl.addClass("is-selected");
		}
		
		// Create node content container
		const nodeContentEl = this.nodeEl.createDiv({
			cls: `${prefix}-item-content`
		});
		
		// Create expand/collapse toggle if node has children
		if (this.config.showToggle && this.node.children.length > 0) {
			this.toggleEl = nodeContentEl.createDiv({
				cls: `${prefix}-item-toggle`
			});
			setIcon(this.toggleEl, this.node.isExpanded ? "chevron-down" : "chevron-right");
			
			this.registerDomEvent(this.toggleEl, "click", (e) => {
				e.stopPropagation();
				this.toggleExpanded();
			});
		} else if (this.config.showToggle) {
			// Add spacer for alignment when no children
			nodeContentEl.createDiv({
				cls: `${prefix}-item-toggle-spacer`
			});
		}
		
		// Create icon
		if (this.config.iconResolver) {
			this.iconEl = nodeContentEl.createDiv({
				cls: `${prefix}-item-icon`
			});
			const iconName = this.config.iconResolver(this.node);
			setIcon(this.iconEl, iconName);
		}
		
		// Create content container
		this.contentEl = nodeContentEl.createDiv({
			cls: `${prefix}-item-content-wrapper`
		});
		
		// Render custom content
		this.config.renderContent(this.node, this.contentEl);
		
		// Register click handler for selection
		if (this.config.enableSelection) {
			this.registerDomEvent(nodeContentEl, "click", (e) => {
				const isMultiSelect = e.ctrlKey || e.metaKey;
				this.selectNode(isMultiSelect);
			});
		}
		
		// Register context menu handler
		this.registerDomEvent(nodeContentEl, "contextmenu", (e) => {
			if (this.events.onContextMenu) {
				this.events.onContextMenu(this.node, e);
			}
		});
		
		// Render children if expanded
		if (this.node.children.length > 0) {
			this.childrenContainerEl = this.nodeEl.createDiv({
				cls: `${prefix}-item-children`
			});
			
			if (this.node.isExpanded) {
				this.renderChildren();
			} else {
				this.childrenContainerEl.hide();
			}
		}
	}
	
	/**
	 * Render child nodes
	 */
	private renderChildren(): void {
		if (!this.childrenContainerEl) return;
		
		// Clear existing children
		this.clearChildren();
		
		// Render each child
		for (const childNode of this.node.children) {
			const childRenderer = new TreeItemRenderer(
				this.childrenContainerEl,
				childNode,
				this.config,
				this.events
			);
			this.addChild(childRenderer);
			this.childRenderers.push(childRenderer);
		}
	}
	
	/**
	 * Clear child renderers
	 */
	private clearChildren(): void {
		for (const childRenderer of this.childRenderers) {
			this.removeChild(childRenderer);
		}
		this.childRenderers = [];
		if (this.childrenContainerEl) {
			this.childrenContainerEl.empty();
		}
	}
	
	/**
	 * Toggle expanded state
	 */
	private toggleExpanded(): void {
		this.setExpanded(!this.node.isExpanded);
	}
	
	/**
	 * Set expanded state
	 */
	public setExpanded(expanded: boolean): void {
		if (this.node.isExpanded === expanded) return;
		
		this.node.isExpanded = expanded;
		
		// Update toggle icon
		if (this.toggleEl) {
			setIcon(this.toggleEl, expanded ? "chevron-down" : "chevron-right");
		}
		
		// Show/hide children
		if (this.childrenContainerEl) {
			if (expanded) {
				this.renderChildren();
				this.childrenContainerEl.show();
			} else {
				this.childrenContainerEl.hide();
				this.clearChildren();
			}
		}
		
		// Trigger event
		if (this.events.onToggle) {
			this.events.onToggle(this.node, expanded);
		}
	}
	
	/**
	 * Select this node
	 */
	private selectNode(isMultiSelect: boolean): void {
		if (this.events.onSelect) {
			this.events.onSelect(this.node, isMultiSelect);
		}
	}
	
	/**
	 * Update selection visual state
	 */
	public setSelected(selected: boolean): void {
		this.node.isSelected = selected;
		if (selected) {
			this.nodeEl?.addClass("is-selected");
		} else {
			this.nodeEl?.removeClass("is-selected");
		}
	}
	
	/**
	 * Update the node data and re-render content
	 */
	public updateNode(node: TreeNode<T>): void {
		this.node = node;
		
		// Update content
		if (this.contentEl) {
			this.contentEl.empty();
			this.config.renderContent(this.node, this.contentEl);
		}
		
		// Update selection state
		this.setSelected(node.isSelected || false);
		
		// Update children if structure changed
		if (this.node.children.length > 0 && this.node.isExpanded) {
			this.renderChildren();
		}
	}
	
	/**
	 * Get the tree node
	 */
	public getNode(): TreeNode<T> {
		return this.node;
	}
	
	/**
	 * Find a child renderer by node ID
	 */
	public findChildRenderer(nodeId: string): TreeItemRenderer<T> | undefined {
		for (const childRenderer of this.childRenderers) {
			if (childRenderer.getNode().id === nodeId) {
				return childRenderer;
			}
			// Recursively search in children
			const found = childRenderer.findChildRenderer(nodeId);
			if (found) return found;
		}
		return undefined;
	}
	
	onunload(): void {
		this.clearChildren();
		this.nodeEl?.remove();
	}
}