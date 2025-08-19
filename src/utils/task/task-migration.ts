/**
 * Task migration utilities for handling the transition from legacy to new task structure
 */

import {
	Task,
	LegacyTask,
	StandardTaskMetadata,
	BaseTask,
	TaskFieldName,
} from "../../types/task";

/** Get a property value from a task, handling both old and new structures */
export function getTaskProperty<K extends TaskFieldName>(
	task: Task | LegacyTask,
	key: K
): any {
	// Check if this is a BaseTask property
	if (key in task && typeof (task as any)[key] !== "undefined") {
		return (task as any)[key];
	}

	// Check if this is a metadata property on new structure
	if ("metadata" in task && task.metadata && key in task.metadata) {
		return task.metadata[key as keyof StandardTaskMetadata];
	}

	// Fallback for legacy structure
	return (task as any)[key];
}

/** Set a property value on a task, handling both old and new structures */
export function setTaskProperty<K extends keyof StandardTaskMetadata>(
	task: Task,
	key: K,
	value: StandardTaskMetadata[K]
): void {
	if (!task.metadata) {
		task.metadata = {} as StandardTaskMetadata;
	}
	task.metadata[key] = value;
}

/** Create a new task with the new structure from legacy data */
export function createTaskFromLegacy(legacyData: LegacyTask): Task {
	const {
		id,
		content,
		filePath,
		line,
		completed,
		status,
		originalMarkdown,
		...metadata
	} = legacyData;

	return {
		id,
		content,
		filePath,
		line,
		completed,
		status,
		originalMarkdown,
		metadata: {
			// Include all metadata fields with proper defaults
			...metadata,
			// Ensure required array fields are always arrays
			tags: metadata.tags || [],
			children: metadata.children || [],
		},
	};
}

/** Convert a task to legacy format for backward compatibility */
export function taskToLegacy(task: Task): LegacyTask {
	return {
		...task,
		...task.metadata,
	};
}

/** Check if a task uses the new structure */
export function isNewTaskStructure(task: Task | LegacyTask): task is Task {
	return "metadata" in task && typeof task.metadata === "object";
}

/** Safely access metadata properties */
export function getMetadataProperty<K extends keyof StandardTaskMetadata>(
	task: Task | LegacyTask,
	key: K
): StandardTaskMetadata[K] | undefined {
	if (isNewTaskStructure(task)) {
		return task.metadata?.[key];
	}
	return (task as any)[key];
}

/** Safely set metadata properties */
export function setMetadataProperty<K extends keyof StandardTaskMetadata>(
	task: Task | LegacyTask,
	key: K,
	value: StandardTaskMetadata[K]
): void {
	if (isNewTaskStructure(task)) {
		if (!task.metadata) {
			task.metadata = {} as StandardTaskMetadata;
		}
		task.metadata[key] = value;
	} else {
		(task as any)[key] = value;
	}
}

/** Create an empty task with the new structure */
export function createEmptyTask(baseData: Partial<BaseTask>): Task {
	return {
		id: baseData.id || "",
		content: baseData.content || "",
		filePath: baseData.filePath || "",
		line: baseData.line || 0,
		completed: baseData.completed || false,
		status: baseData.status || " ",
		originalMarkdown: baseData.originalMarkdown || "",
		metadata: {
			tags: [],
			children: [],
		},
	};
}
