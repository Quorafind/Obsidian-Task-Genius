/**
 * Task selection and bulk operations type definitions
 */

import { Task } from "./task";

/**
 * Bulk operation types
 */
export enum BulkOperationType {
	STATUS_CHANGE = "status_change",
	PROJECT_MOVE = "project_move",
	PRIORITY_SET = "priority_set",
	DATE_SET = "date_set",
	DELETE = "delete",
	TAG_ADD = "tag_add",
	TAG_REMOVE = "tag_remove",
}

/**
 * Date field types for bulk date operations
 */
export type DateFieldType =
	| "dueDate"
	| "startDate"
	| "scheduledDate"
	| "completedDate"
	| "cancelledDate"
	| "createdDate";

/**
 * Selection state interface
 */
export interface SelectionState {
	/** Set of selected task IDs */
	selectedTaskIds: Set<string>;
	/** Whether selection mode is active */
	isSelectionMode: boolean;
	/** Timestamp when selection mode was entered */
	selectionModeStartTime?: number;
}

/**
 * Bulk operation result
 */
export interface BulkOperationResult {
	/** Number of successful operations */
	successCount: number;
	/** Number of failed operations */
	failCount: number;
	/** Error messages for failed operations */
	errors: Array<{
		taskId: string;
		taskContent: string;
		error: string;
	}>;
	/** Total operations attempted */
	totalCount: number;
}

/**
 * Long press detector options
 */
export interface LongPressOptions {
	/** Detection threshold in milliseconds (default: 500ms) */
	threshold?: number;
	/** Movement tolerance in pixels (default: 10px) */
	moveTolerance?: number;
	/** Callback when long press is detected */
	onLongPress: () => void;
	/** Callback when long press starts (optional) */
	onLongPressStart?: () => void;
	/** Callback when long press is cancelled (optional) */
	onLongPressCancel?: () => void;
}

/**
 * Bulk operation configuration
 */
export interface BulkOperationConfig {
	/** Operation type */
	type: BulkOperationType;
	/** Target value (e.g., new status, project name, priority level) */
	value?: any;
	/** Additional metadata for the operation */
	metadata?: Record<string, any>;
}

/**
 * Selection event data
 */
export interface SelectionEventData {
	/** Selected task IDs */
	selectedTaskIds: string[];
	/** Selection mode state */
	isSelectionMode: boolean;
	/** Number of selected tasks */
	count: number;
}

/**
 * Selection mode change event data
 */
export interface SelectionModeChangeEventData {
	/** New selection mode state */
	isSelectionMode: boolean;
	/** Reason for mode change */
	reason?: "user_action" | "view_change" | "operation_complete" | "escape";
}
