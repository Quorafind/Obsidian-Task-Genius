/**
 * File Task Manager Implementation
 * Manages tasks at the file level using Bases plugin data
 */

import { App } from "obsidian";
import { Task } from "../types/task";
import {
	FileTask,
	FileTaskManager,
	FileTaskPropertyMapping,
	FileTaskViewConfig,
} from "../types/file-task";
import { TFile } from "obsidian";

// BasesEntry interface (copied from types to avoid import issues)
interface BasesEntry {
	ctx: {
		_local: any;
		app: App;
		filter: any;
		formulas: any;
		localUsed: boolean;
	};
	file: {
		parent: any;
		deleted: boolean;
		vault: any;
		path: string;
		name: string;
		extension: string;
		getShortName(): string;
	};
	formulas: Record<string, any>;
	implicit: {
		file: any;
		name: string;
		path: string;
		folder: string;
		ext: string;
	};
	lazyEvalCache: Record<string, any>;
	properties: Record<string, any>;
	getValue(prop: {
		type: "property" | "file" | "formula";
		name: string;
	}): any;
	updateProperty(key: string, value: any): void;
	getFormulaValue(formula: string): any;
	getPropertyKeys(): string[];
}

/** Default property mapping for file-level tasks using dataview standard keys */
export const DEFAULT_FILE_TASK_MAPPING: FileTaskPropertyMapping = {
	contentProperty: "title",
	statusProperty: "status",
	completedProperty: "completed",
	createdDateProperty: "created", // dataview standard: created
	startDateProperty: "start", // dataview standard: start
	scheduledDateProperty: "scheduled", // dataview standard: scheduled
	dueDateProperty: "due", // dataview standard: due
	completedDateProperty: "completion", // dataview standard: completion
	recurrenceProperty: "repeat", // dataview standard: repeat
	tagsProperty: "tags",
	projectProperty: "project",
	contextProperty: "context",
	priorityProperty: "priority",
	estimatedTimeProperty: "estimatedTime",
	actualTimeProperty: "actualTime",
};

export class FileTaskManagerImpl implements FileTaskManager {
	constructor(private app: App) {}

	/**
	 * Convert a BasesEntry to a FileTask
	 */
	entryToFileTask(
		entry: BasesEntry,
		mapping: FileTaskPropertyMapping = DEFAULT_FILE_TASK_MAPPING
	): FileTask {
		const properties = entry.properties || {};

		// Generate unique ID based on file path
		const id = `file-task-${entry.file.path}`;

		// Log available properties for debugging (only for first few entries)
		if (Math.random() < 0.1) {
			// Log 10% of entries to avoid spam
			console.log(
				`[FileTaskManager] Available properties for ${entry.file.name}:`,
				Object.keys(properties)
			);
		}

		// Extract content from the specified property or use file name without extension
		let content = this.getPropertyValue(entry, mapping.contentProperty);
		if (!content) {
			// Use file name without extension as content
			const fileName = entry.file.name;
			const lastDotIndex = fileName.lastIndexOf(".");
			content =
				lastDotIndex > 0
					? fileName.substring(0, lastDotIndex)
					: fileName;
		}

		// Extract status
		const status =
			this.getPropertyValue(entry, mapping.statusProperty) || " ";

		// Extract completion state
		const completed =
			this.getBooleanPropertyValue(entry, mapping.completedProperty) ||
			false;

		// Extract dates
		const createdDate = this.getDatePropertyValue(
			entry,
			mapping.createdDateProperty
		);
		const startDate = this.getDatePropertyValue(
			entry,
			mapping.startDateProperty
		);
		const scheduledDate = this.getDatePropertyValue(
			entry,
			mapping.scheduledDateProperty
		);
		const dueDate = this.getDatePropertyValue(
			entry,
			mapping.dueDateProperty
		);
		const completedDate = this.getDatePropertyValue(
			entry,
			mapping.completedDateProperty
		);

		// Extract other properties
		const recurrence = this.getPropertyValue(
			entry,
			mapping.recurrenceProperty
		);
		const tags =
			this.getArrayPropertyValue(entry, mapping.tagsProperty) || [];
		const project = this.getPropertyValue(entry, mapping.projectProperty);
		const context = this.getPropertyValue(entry, mapping.contextProperty);
		const priority = this.getNumberPropertyValue(
			entry,
			mapping.priorityProperty
		);
		const estimatedTime = this.getNumberPropertyValue(
			entry,
			mapping.estimatedTimeProperty
		);
		const actualTime = this.getNumberPropertyValue(
			entry,
			mapping.actualTimeProperty
		);

		const fileTask: FileTask = {
			id,
			content,
			filePath: entry.file.path,
			completed,
			status,
			metadata: {
				tags: tags || [],
				children: [], // File tasks don't have children by default

				// Optional properties
				...(createdDate && { createdDate }),
				...(startDate && { startDate }),
				...(scheduledDate && { scheduledDate }),
				...(dueDate && { dueDate }),
				...(completedDate && { completedDate }),
				...(recurrence && { recurrence }),
				...(project && { project }),
				...(context && { context }),
				...(priority && { priority }),
				...(estimatedTime && { estimatedTime }),
				...(actualTime && { actualTime }),
			},
			sourceEntry: entry,
			isFileTask: true,
		};

		return fileTask;
	}

	/**
	 * Convert a FileTask back to property updates
	 */
	fileTaskToPropertyUpdates(
		task: FileTask,
		mapping: FileTaskPropertyMapping = DEFAULT_FILE_TASK_MAPPING
	): Record<string, any> {
		const updates: Record<string, any> = {};

		// Don't update content property as it should be handled by file renaming
		// updates[mapping.contentProperty] = task.content;
		updates[mapping.statusProperty] = task.status;
		updates[mapping.completedProperty] = task.completed;

		// Optional properties
		if (
			task.metadata.createdDate !== undefined &&
			mapping.createdDateProperty
		) {
			updates[mapping.createdDateProperty] = this.formatDateForProperty(
				task.metadata.createdDate
			);
		}
		if (
			task.metadata.startDate !== undefined &&
			mapping.startDateProperty
		) {
			updates[mapping.startDateProperty] = this.formatDateForProperty(
				task.metadata.startDate
			);
		}
		if (
			task.metadata.scheduledDate !== undefined &&
			mapping.scheduledDateProperty
		) {
			updates[mapping.scheduledDateProperty] = this.formatDateForProperty(
				task.metadata.scheduledDate
			);
		}
		if (task.metadata.dueDate !== undefined && mapping.dueDateProperty) {
			updates[mapping.dueDateProperty] = this.formatDateForProperty(
				task.metadata.dueDate
			);
		}
		if (
			task.metadata.completedDate !== undefined &&
			mapping.completedDateProperty
		) {
			updates[mapping.completedDateProperty] = this.formatDateForProperty(
				task.metadata.completedDate
			);
		}
		if (
			task.metadata.recurrence !== undefined &&
			mapping.recurrenceProperty
		) {
			updates[mapping.recurrenceProperty] = task.metadata.recurrence;
		}
		if (task.metadata.tags.length > 0 && mapping.tagsProperty) {
			updates[mapping.tagsProperty] = task.metadata.tags;
		}
		if (task.metadata.project !== undefined && mapping.projectProperty) {
			updates[mapping.projectProperty] = task.metadata.project;
		}
		if (task.metadata.context !== undefined && mapping.contextProperty) {
			updates[mapping.contextProperty] = task.metadata.context;
		}
		if (task.metadata.priority !== undefined && mapping.priorityProperty) {
			updates[mapping.priorityProperty] = task.metadata.priority;
		}
		if (
			task.metadata.estimatedTime !== undefined &&
			mapping.estimatedTimeProperty
		) {
			updates[mapping.estimatedTimeProperty] =
				task.metadata.estimatedTime;
		}
		if (
			task.metadata.actualTime !== undefined &&
			mapping.actualTimeProperty
		) {
			updates[mapping.actualTimeProperty] = task.metadata.actualTime;
		}

		return updates;
	}

	/**
	 * Update a file task by updating its properties
	 */
	async updateFileTask(
		task: FileTask,
		updates: Partial<FileTask>
	): Promise<void> {
		// Merge updates into the task
		const updatedTask = { ...task, ...updates };

		// Handle file renaming if content changed
		if (updates.content && updates.content !== task.content) {
			await this.updateFileName(task, updates.content);
		}

		// Convert to property updates (excluding content which is handled by file renaming)
		const propertyUpdates = this.fileTaskToPropertyUpdates(updatedTask);

		console.log(
			`[FileTaskManager] Updating file task ${task.content} with properties:`,
			propertyUpdates
		);

		// Update properties through the source entry
		for (const [key, value] of Object.entries(propertyUpdates)) {
			try {
				task.sourceEntry.updateProperty(key, value);
			} catch (error) {
				console.error(`Failed to update property ${key}:`, error);
			}
		}
	}

	/**
	 * Update file name when task content changes
	 */
	private async updateFileName(
		task: FileTask,
		newContent: string
	): Promise<void> {
		try {
			const file = this.app.vault.getFileByPath(task.filePath);
			if (file) {
				const currentPath = task.filePath;
				const lastSlashIndex = currentPath.lastIndexOf("/");
				const directory =
					lastSlashIndex > 0
						? currentPath.substring(0, lastSlashIndex)
						: "";
				const extension = currentPath.substring(
					currentPath.lastIndexOf(".")
				);

				// Ensure newContent doesn't already have the extension
				let cleanContent = newContent;
				if (cleanContent.endsWith(extension)) {
					cleanContent = cleanContent.substring(
						0,
						cleanContent.length - extension.length
					);
				}

				const newPath = directory
					? `${directory}/${cleanContent}${extension}`
					: `${cleanContent}${extension}`;

				// Only rename if the new path is different
				if (newPath !== currentPath) {
					await this.app.fileManager.renameFile(file, newPath);
					// Update the task's filePath to reflect the new path
					task.filePath = newPath;
					console.log(
						`[FileTaskManager] Renamed file from ${currentPath} to ${newPath}`
					);
				}
			}
		} catch (error) {
			console.error(`[FileTaskManager] Failed to rename file:`, error);
		}
	}

	/**
	 * Get all file tasks from a list of entries
	 */
	getFileTasksFromEntries(
		entries: BasesEntry[],
		mapping: FileTaskPropertyMapping = DEFAULT_FILE_TASK_MAPPING
	): FileTask[] {
		// Filter out non-markdown files
		const markdownEntries = entries.filter((entry) => {
			return entry.file.extension === "md";
		});

		console.log(
			`[FileTaskManager] Filtered ${entries.length} entries to ${markdownEntries.length} markdown files`
		);

		return markdownEntries.map((entry) =>
			this.entryToFileTask(entry, mapping)
		);
	}

	/**
	 * Filter file tasks based on criteria
	 */
	filterFileTasks(tasks: FileTask[], filters: any): FileTask[] {
		// This is a simplified implementation - you can extend this based on your filtering needs
		return tasks.filter((task) => {
			// Add your filtering logic here
			return true;
		});
	}

	// Helper methods for property extraction

	private getPropertyValue(
		entry: BasesEntry,
		propertyName?: string
	): string | undefined {
		if (!propertyName) return undefined;
		try {
			const value = entry.getValue({
				type: "property",
				name: propertyName,
			});
			if (value === null || value === undefined) return undefined;
			return String(value);
		} catch {
			return undefined;
		}
	}

	private getBooleanPropertyValue(
		entry: BasesEntry,
		propertyName?: string
	): boolean | undefined {
		if (!propertyName) return undefined;
		try {
			const value = entry.getValue({
				type: "property",
				name: propertyName,
			});
			if (typeof value === "boolean") return value;
			if (typeof value === "string") {
				const lower = value.toLowerCase();
				return lower === "true" || lower === "yes" || lower === "1";
			}
			return Boolean(value);
		} catch {
			return undefined;
		}
	}

	private getNumberPropertyValue(
		entry: BasesEntry,
		propertyName?: string
	): number | undefined {
		if (!propertyName) return undefined;
		try {
			const value = entry.getValue({
				type: "property",
				name: propertyName,
			});
			const num = Number(value);
			return isNaN(num) ? undefined : num;
		} catch {
			return undefined;
		}
	}

	private getDatePropertyValue(
		entry: BasesEntry,
		propertyName?: string
	): number | undefined {
		if (!propertyName) return undefined;
		try {
			const value = entry.getValue({
				type: "property",
				name: propertyName,
			});

			if (value === null || value === undefined) return undefined;

			// Handle timestamp (number)
			if (typeof value === "number") return value;

			// Handle date string
			if (typeof value === "string") {
				// Support various date formats commonly used in dataview
				const dateStr = value.trim();
				if (!dateStr) return undefined;

				// Try parsing as ISO date first (YYYY-MM-DD)
				if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
					// Parse as local date to avoid timezone issues
					const [year, month, day] = dateStr.split("-").map(Number);
					const date = new Date(year, month - 1, day);
					return isNaN(date.getTime()) ? undefined : date.getTime();
				}

				// Try parsing as general date (but be careful about timezone)
				const date = new Date(dateStr);
				return isNaN(date.getTime()) ? undefined : date.getTime();
			}

			// Handle Date object
			if (value instanceof Date) {
				return isNaN(value.getTime()) ? undefined : value.getTime();
			}

			return undefined;
		} catch {
			return undefined;
		}
	}

	private getArrayPropertyValue(
		entry: BasesEntry,
		propertyName?: string
	): string[] | undefined {
		if (!propertyName) return undefined;
		try {
			const value = entry.getValue({
				type: "property",
				name: propertyName,
			});
			if (value === null || value === undefined) return undefined;

			// Handle array values
			if (Array.isArray(value)) {
				return value
					.map((v) => String(v))
					.filter((v) => v.trim().length > 0);
			}

			// Handle string values (comma-separated or space-separated)
			if (typeof value === "string") {
				const str = value.trim();
				if (!str) return undefined;

				// Try to parse as comma-separated values first
				if (str.includes(",")) {
					return str
						.split(",")
						.map((v) => v.trim())
						.filter((v) => v.length > 0);
				}

				// Try to parse as space-separated values (for tags)
				if (str.includes(" ")) {
					return str
						.split(/\s+/)
						.map((v) => v.trim())
						.filter((v) => v.length > 0);
				}

				// Single value
				return [str];
			}

			return undefined;
		} catch {
			return undefined;
		}
	}

	private formatDateForProperty(timestamp: number): string {
		const date = new Date(timestamp);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	/**
	 * Validate and log property mapping effectiveness
	 */
	public validatePropertyMapping(
		entries: BasesEntry[],
		mapping: FileTaskPropertyMapping = DEFAULT_FILE_TASK_MAPPING
	): void {
		if (entries.length === 0) return;

		const propertyUsage: Record<string, number> = {};
		const availableProperties = new Set<string>();

		// Analyze property usage across all entries
		entries.forEach((entry) => {
			const properties = entry.properties || {};
			Object.keys(properties).forEach((prop) => {
				availableProperties.add(prop);
			});

			// Check which mapping properties are actually found
			Object.entries(mapping).forEach(([key, propName]) => {
				if (propName && properties[propName] !== undefined) {
					propertyUsage[propName] =
						(propertyUsage[propName] || 0) + 1;
				}
			});
		});

		// Warn about unused mappings
		Object.entries(mapping).forEach(([key, propName]) => {
			if (propName && !propertyUsage[propName]) {
				console.warn(
					`[FileTaskManager] Property "${propName}" (${key}) not found in any entries`
				);
			}
		});
	}
}
