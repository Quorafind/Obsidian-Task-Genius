/**
 * File Metadata Task Updater
 * Handles updating tasks that were created from file metadata and tags
 */

import { App, TFile, Vault } from "obsidian";
import { StandardFileTaskMetadata, Task } from "../types/task";
import { FileParsingConfiguration } from "../common/setting-definition";

export interface FileMetadataUpdateResult {
	success: boolean;
	error?: string;
}

export class FileMetadataTaskUpdater {
	private app: App;
	private vault: Vault;
	private config: FileParsingConfiguration;

	constructor(app: App, config: FileParsingConfiguration) {
		this.app = app;
		this.vault = app.vault;
		this.config = config;
	}

	/**
	 * Update a task that was created from file metadata
	 */
	async updateFileMetadataTask(
		originalTask: Task,
		updatedTask: Task
	): Promise<FileMetadataUpdateResult> {
		try {
			// Check if this is a file metadata task
			if (!this.isFileMetadataTask(originalTask)) {
				return {
					success: false,
					error: "Task is not a file metadata task",
				};
			}

			const file = this.vault.getFileByPath(originalTask.filePath);
			if (!(file instanceof TFile)) {
				return {
					success: false,
					error: `File not found: ${originalTask.filePath}`,
				};
			}

			// Handle different types of file metadata tasks
			if (
				(originalTask.metadata as StandardFileTaskMetadata).source ===
				"file-metadata"
			) {
				return await this.updateMetadataFieldTask(
					file,
					originalTask,
					updatedTask
				);
			} else if (
				(originalTask.metadata as StandardFileTaskMetadata).source ===
				"file-tag"
			) {
				return await this.updateTagTask(
					file,
					originalTask,
					updatedTask
				);
			}

			return {
				success: false,
				error: "Unknown file metadata task type",
			};
		} catch (error) {
			return {
				success: false,
				error: `Error updating file metadata task: ${error.message}`,
			};
		}
	}

	/**
	 * Check if a task is a file metadata task
	 */
	isFileMetadataTask(task: Task): boolean {
		return (
			(task.metadata as StandardFileTaskMetadata).source ===
				"file-metadata" ||
			(task.metadata as StandardFileTaskMetadata).source === "file-tag"
		);
	}

	/**
	 * Update a task created from a metadata field
	 */
	private async updateMetadataFieldTask(
		file: TFile,
		originalTask: Task,
		updatedTask: Task
	): Promise<FileMetadataUpdateResult> {
		try {
			const sourceField = (
				originalTask.metadata as StandardFileTaskMetadata
			).sourceField;
			if (!sourceField) {
				return {
					success: false,
					error: "No source field found for metadata task",
				};
			}

			// Read current file content
			const content = await this.vault.read(file);
			const frontmatterUpdates: Record<string, any> = {};

			// Handle content changes (file renaming)
			if (updatedTask.content !== originalTask.content) {
				await this.updateFileName(file, updatedTask.content);
			}

			// Handle status changes
			if (
				updatedTask.status !== originalTask.status ||
				updatedTask.completed !== originalTask.completed
			) {
				frontmatterUpdates[sourceField] =
					this.convertStatusToMetadataValue(
						sourceField,
						updatedTask.status,
						updatedTask.completed
					);
			}

			// Handle metadata changes
			if (this.hasMetadataChanges(originalTask, updatedTask)) {
				const metadataUpdates = this.extractMetadataUpdates(
					originalTask,
					updatedTask
				);
				Object.assign(frontmatterUpdates, metadataUpdates);
			}

			// Apply frontmatter updates if any
			if (Object.keys(frontmatterUpdates).length > 0) {
				await this.updateFrontmatter(file, frontmatterUpdates);
			}

			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: `Error updating metadata field task: ${error.message}`,
			};
		}
	}

	/**
	 * Update a task created from a file tag
	 */
	private async updateTagTask(
		file: TFile,
		originalTask: Task,
		updatedTask: Task
	): Promise<FileMetadataUpdateResult> {
		try {
			// Handle content changes (file renaming)
			if (updatedTask.content !== originalTask.content) {
				await this.updateFileName(file, updatedTask.content);
			}

			// For tag-based tasks, we can update the frontmatter metadata
			// but we don't modify the tags themselves as they might be used for other purposes
			const frontmatterUpdates: Record<string, any> = {};

			// Handle metadata changes
			if (this.hasMetadataChanges(originalTask, updatedTask)) {
				const metadataUpdates = this.extractMetadataUpdates(
					originalTask,
					updatedTask
				);
				Object.assign(frontmatterUpdates, metadataUpdates);
			}

			// For status changes in tag-based tasks, we could add a completion field
			if (updatedTask.completed !== originalTask.completed) {
				frontmatterUpdates.completed = updatedTask.completed;
			}

			// Apply frontmatter updates if any
			if (Object.keys(frontmatterUpdates).length > 0) {
				await this.updateFrontmatter(file, frontmatterUpdates);
			}

			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: `Error updating tag task: ${error.message}`,
			};
		}
	}

	/**
	 * Update file name when task content changes
	 */
	private async updateFileName(
		file: TFile,
		newContent: string
	): Promise<void> {
		try {
			const currentPath = file.path;
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

			// Sanitize filename
			const sanitizedContent = cleanContent.replace(/[<>:"/\\|?*]/g, "_");
			const newPath = directory
				? `${directory}/${sanitizedContent}${extension}`
				: `${sanitizedContent}${extension}`;

			if (newPath !== currentPath) {
				await this.vault.rename(file, newPath);
			}
		} catch (error) {
			console.error("Error updating file name:", error);
			throw error;
		}
	}

	/**
	 * Update frontmatter metadata
	 */
	private async updateFrontmatter(
		file: TFile,
		updates: Record<string, any>
	): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(
				file,
				(frontmatter) => {
					Object.assign(frontmatter, updates);
				}
			);
		} catch (error) {
			console.error("Error updating frontmatter:", error);
			throw error;
		}
	}

	/**
	 * Convert task status back to metadata value
	 */
	private convertStatusToMetadataValue(
		fieldName: string,
		status: string,
		completed: boolean
	): any {
		// If field name suggests completion
		if (
			fieldName.toLowerCase().includes("complete") ||
			fieldName.toLowerCase().includes("done")
		) {
			return completed;
		}

		// If field name suggests todo/task
		if (
			fieldName.toLowerCase().includes("todo") ||
			fieldName.toLowerCase().includes("task")
		) {
			return completed;
		}

		// For other fields, return the status character
		return status;
	}

	/**
	 * Check if there are metadata changes
	 */
	private hasMetadataChanges(originalTask: Task, updatedTask: Task): boolean {
		const metadataFields = [
			"dueDate",
			"startDate",
			"scheduledDate",
			"priority",
			"project",
			"context",
			"area",
		] as const;

		return metadataFields.some((field) => {
			const originalValue = (originalTask.metadata as any)[field];
			const updatedValue = (updatedTask.metadata as any)[field];
			return originalValue !== updatedValue;
		});
	}

	/**
	 * Extract metadata updates
	 */
	private extractMetadataUpdates(
		originalTask: Task,
		updatedTask: Task
	): Record<string, any> {
		const updates: Record<string, any> = {};
		const metadataFields = [
			"dueDate",
			"startDate",
			"scheduledDate",
			"priority",
			"project",
			"context",
			"area",
		] as const;

		metadataFields.forEach((field) => {
			const originalValue = (originalTask.metadata as any)[field];
			const updatedValue = (updatedTask.metadata as any)[field];

			if (originalValue !== updatedValue) {
				if (
					field.includes("Date") &&
					typeof updatedValue === "number"
				) {
					// Convert timestamp back to date string
					updates[field] = new Date(updatedValue)
						.toISOString()
						.split("T")[0];
				} else {
					updates[field] = updatedValue;
				}
			}
		});

		return updates;
	}
}
