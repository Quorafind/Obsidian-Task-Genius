/**
 * Generic tree node structure for hierarchical data representation
 */

/**
 * Generic tree node interface
 * @template T The type of data stored in the node
 */
export interface TreeNode<T> {
	/** Unique identifier for the node */
	id: string;
	
	/** Display name for the node */
	name: string;
	
	/** Full path from root to this node */
	fullPath: string;
	
	/** Node-specific data */
	data: T;
	
	/** Child nodes */
	children: TreeNode<T>[];
	
	/** Parent node reference (optional) */
	parent?: TreeNode<T>;
	
	/** Depth level in the tree (0 for root) */
	level: number;
	
	/** Whether this node is expanded in the UI */
	isExpanded: boolean;
	
	/** Whether this node is selected */
	isSelected?: boolean;
}

/**
 * Project-specific node data
 */
export interface ProjectNodeData {
	/** Set of task IDs directly belonging to this project */
	directTaskIds: Set<string>;
	
	/** Set of all task IDs including children projects */
	allTaskIds: Set<string>;
	
	/** Number of direct tasks */
	directTaskCount: number;
	
	/** Total number of tasks including children */
	totalTaskCount: number;
	
	/** Whether this project is read-only (from tgProject) */
	isReadonly?: boolean;
	
	/** Source type if from tgProject */
	sourceType?: 'path' | 'metadata' | 'config' | 'default';
}

/**
 * Tree state for persistence
 */
export interface TreeState {
	/** Array of expanded node paths (for JSON serialization) */
	expandedNodes: string[];
	
	/** Array of selected node paths (for JSON serialization) */
	selectedNodes: string[];
	
	/** Current view mode */
	viewMode?: 'list' | 'tree';
}

/**
 * Tree node event handlers
 */
export interface TreeNodeEvents<T> {
	/** Called when a node is toggled (expanded/collapsed) */
	onToggle?: (node: TreeNode<T>, isExpanded: boolean) => void;
	
	/** Called when a node is selected */
	onSelect?: (node: TreeNode<T>, isMultiSelect: boolean) => void;
	
	/** Called when a node is right-clicked */
	onContextMenu?: (node: TreeNode<T>, event: MouseEvent) => void;
}