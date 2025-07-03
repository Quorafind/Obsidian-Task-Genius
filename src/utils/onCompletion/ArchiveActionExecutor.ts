import { App, TFile } from "obsidian";
import { BaseActionExecutor } from "./BaseActionExecutor";
import {
	OnCompletionConfig,
	OnCompletionExecutionContext,
	OnCompletionExecutionResult,
	OnCompletionActionType,
	OnCompletionArchiveConfig,
} from "../../types/onCompletion";

/**
 * Executor for archive action - moves the completed task to an archive file
 */
export class ArchiveActionExecutor extends BaseActionExecutor {
	private readonly DEFAULT_ARCHIVE_FILE = "Archive/Completed Tasks.md";
	private readonly DEFAULT_ARCHIVE_SECTION = "Completed Tasks";

	/**
	 * Execute archive action for Canvas tasks
	 */
	protected async executeForCanvas(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		const archiveConfig = config as OnCompletionArchiveConfig;
		const { task, app } = context;

		console.log("executeForCanvas", context, config, task);

		try {
			// Get task content as markdown and clean it
			let taskContent =
				task.originalMarkdown ||
				`- [${task.completed ? "x" : " "}] ${task.content}`;

			// Clean onCompletion metadata and ensure task is marked as completed
			taskContent = this.removeOnCompletionMetadata(taskContent);
			taskContent = this.ensureTaskIsCompleted(taskContent);

			// Archive to Markdown file FIRST (before deleting from source)
			const archiveFile =
				archiveConfig.archiveFile || this.DEFAULT_ARCHIVE_FILE;
			const archiveSection =
				archiveConfig.archiveSection || this.DEFAULT_ARCHIVE_SECTION;

			const archiveResult = await this.addTaskToArchiveFile(
				app,
				taskContent,
				archiveFile,
				archiveSection,
				context
			);

			if (!archiveResult.success) {
				return this.createErrorResult(
					archiveResult.error || "Failed to archive Canvas task"
				);
			}

			// Only delete from Canvas source AFTER successful archiving
			const canvasUpdater = this.getCanvasTaskUpdater(context);
			const deleteResult = await canvasUpdater.deleteCanvasTask(task);

			if (!deleteResult.success) {
				// Archive succeeded but deletion failed - this is less critical
				// The task is safely archived, just not removed from source
				return this.createErrorResult(
					`Task archived successfully to ${archiveFile}, but failed to remove from Canvas: ${deleteResult.error}`
				);
			}

			return this.createSuccessResult(
				`Task archived from Canvas to ${archiveFile}`
			);
		} catch (error) {
			return this.createErrorResult(
				`Error archiving Canvas task: ${error.message}`
			);
		}
	}

	/**
	 * Execute archive action for Markdown tasks
	 */
	protected async executeForMarkdown(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		const archiveConfig = config as OnCompletionArchiveConfig;
		const { task, app, plugin } = context;

		try {
			// Determine archive file path
			const archiveFilePath =
				archiveConfig.archiveFile ||
				plugin.settings.onCompletion?.defaultArchiveFile ||
				this.DEFAULT_ARCHIVE_FILE;

			// Determine archive section
			const archiveSection =
				archiveConfig.archiveSection || this.DEFAULT_ARCHIVE_SECTION;

			// Get the source file containing the task
			const sourceFile = app.vault.getFileByPath(task.filePath);
			if (!sourceFile) {
				return this.createErrorResult(
					`Source file not found: ${task.filePath}`
				);
			}

			// Get or create the archive file
			let archiveFile = app.vault.getFileByPath(archiveFilePath);
			if (!archiveFile) {
				// Try to create the archive file if it doesn't exist
				try {
					// Ensure the directory exists
					const dirPath = archiveFilePath.substring(
						0,
						archiveFilePath.lastIndexOf("/")
					);
					if (dirPath && !app.vault.getAbstractFileByPath(dirPath)) {
						await app.vault.createFolder(dirPath);
					}

					archiveFile = await app.vault.create(
						archiveFilePath,
						`# Archive\n\n## ${archiveSection}\n\n`
					);
				} catch (error) {
					return this.createErrorResult(
						`Failed to create archive file: ${archiveFilePath}`
					);
				}
			}

			// Read source and archive file contents
			const sourceContent = await app.vault.read(sourceFile);
			const archiveContent = await app.vault.read(archiveFile as TFile);

			const sourceLines = sourceContent.split("\n");
			const archiveLines = archiveContent.split("\n");

			// Find and extract the task line from source
			if (task.line === undefined || task.line >= sourceLines.length) {
				return this.createErrorResult(
					"Task line not found in source file"
				);
			}

			let taskLine = sourceLines[task.line];

			// Clean onCompletion metadata and ensure task is marked as completed
			taskLine = this.removeOnCompletionMetadata(taskLine);
			taskLine = this.ensureTaskIsCompleted(taskLine);

			// Add timestamp and source info to the task line
			const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
			const sourceInfo = `(from ${task.filePath})`;
			const completionMarker = this.getCompletionMarker(
				context,
				timestamp
			);
			const archivedTaskLine = `${taskLine} ${completionMarker} ${sourceInfo}`;

			// Remove the task from source file
			sourceLines.splice(task.line, 1);

			// Add the task to archive file
			const sectionIndex = archiveLines.findIndex(
				(line) =>
					line.trim().startsWith("#") && line.includes(archiveSection)
			);

			if (sectionIndex !== -1) {
				// Find the next section or end of file
				let insertIndex = archiveLines.length;
				for (let i = sectionIndex + 1; i < archiveLines.length; i++) {
					if (archiveLines[i].trim().startsWith("#")) {
						insertIndex = i;
						break;
					}
				}
				// Insert before the next section or at the end
				archiveLines.splice(insertIndex, 0, archivedTaskLine);
			} else {
				// Section not found, create it and add the task
				archiveLines.push("", `## ${archiveSection}`, archivedTaskLine);
			}

			// Write updated contents back to files
			await app.vault.modify(sourceFile, sourceLines.join("\n"));
			await app.vault.modify(
				archiveFile as TFile,
				archiveLines.join("\n")
			);

			return this.createSuccessResult(
				`Task archived to ${archiveFilePath} (section: ${archiveSection})`
			);
		} catch (error) {
			return this.createErrorResult(
				`Failed to archive task: ${error.message}`
			);
		}
	}

	/**
	 * Add a task to the archive file
	 */
	private async addTaskToArchiveFile(
		app: App,
		taskContent: string,
		archiveFilePath: string,
		archiveSection: string,
		context: OnCompletionExecutionContext
	): Promise<{ success: boolean; error?: string }> {
		try {
			// Get or create the archive file
			let archiveFile = app.vault.getFileByPath(archiveFilePath);

			console.log("archiveFile", archiveFile, archiveFilePath);
			if (!archiveFile) {
				// Try to create the archive file if it doesn't exist
				try {
					// Ensure the directory exists
					const dirPath = archiveFilePath.substring(
						0,
						archiveFilePath.lastIndexOf("/")
					);
					if (dirPath && !app.vault.getAbstractFileByPath(dirPath)) {
						await app.vault.createFolder(dirPath);
					}

					archiveFile = await app.vault.create(
						archiveFilePath,
						`# Archive\n\n## ${archiveSection}\n\n`
					);
				} catch (error) {
					return {
						success: false,
						error: `Failed to create archive file: ${archiveFilePath}`,
					};
				}
			}

			// Read archive file content
			const archiveContent = await app.vault.read(archiveFile as TFile);
			const archiveLines = archiveContent.split("\n");

			// Add timestamp using preferMetadataFormat
			const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
			const completionMarker = this.getCompletionMarker(
				context,
				timestamp
			);
			const archivedTaskLine = `${taskContent} ${completionMarker}`;

			// Add the task to archive file
			const sectionIndex = archiveLines.findIndex(
				(line: string) =>
					line.trim().startsWith("#") && line.includes(archiveSection)
			);

			if (sectionIndex !== -1) {
				// Find the next section or end of file
				let insertIndex = archiveLines.length;
				for (let i = sectionIndex + 1; i < archiveLines.length; i++) {
					if (archiveLines[i].trim().startsWith("#")) {
						insertIndex = i;
						break;
					}
				}
				// Insert before the next section or at the end
				archiveLines.splice(insertIndex, 0, archivedTaskLine);
			} else {
				// Section not found, create it and add the task
				archiveLines.push("", `## ${archiveSection}`, archivedTaskLine);
			}

			// Write updated archive file
			await app.vault.modify(
				archiveFile as TFile,
				archiveLines.join("\n")
			);

			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: `Failed to add task to archive: ${error.message}`,
			};
		}
	}

	protected validateConfig(config: OnCompletionConfig): boolean {
		return config.type === OnCompletionActionType.ARCHIVE;
	}

	public getDescription(config: OnCompletionConfig): string {
		const archiveConfig = config as OnCompletionArchiveConfig;
		const archiveFile =
			archiveConfig.archiveFile || this.DEFAULT_ARCHIVE_FILE;
		const archiveSection =
			archiveConfig.archiveSection || this.DEFAULT_ARCHIVE_SECTION;
		return `Archive task to ${archiveFile} (section: ${archiveSection})`;
	}

	/**
	 * Remove onCompletion metadata from task content
	 * Supports both emoji format (🏁) and dataview format ([onCompletion::])
	 */
	private removeOnCompletionMetadata(content: string): string {
		let cleaned = content;

		// Remove emoji format onCompletion (🏁 value)
		// Handle simple formats first
		cleaned = cleaned.replace(/🏁\s+[^\s{]+/g, "");

		// Handle JSON format in emoji notation (🏁 {"type": "move", ...})
		// Find and remove complete JSON objects after 🏁
		let match;
		while ((match = cleaned.match(/🏁\s*\{/)) !== null) {
			const startIndex = match.index!;
			const jsonStart = cleaned.indexOf("{", startIndex);
			let braceCount = 0;
			let jsonEnd = jsonStart;

			for (let i = jsonStart; i < cleaned.length; i++) {
				if (cleaned[i] === "{") braceCount++;
				if (cleaned[i] === "}") braceCount--;
				if (braceCount === 0) {
					jsonEnd = i;
					break;
				}
			}

			if (braceCount === 0) {
				// Remove the entire 🏁 + JSON object
				cleaned =
					cleaned.substring(0, startIndex) +
					cleaned.substring(jsonEnd + 1);
			} else {
				// Malformed JSON, just remove the 🏁 part
				cleaned =
					cleaned.substring(0, startIndex) +
					cleaned.substring(startIndex + match[0].length);
			}
		}

		// Remove dataview format onCompletion ([onCompletion:: value])
		cleaned = cleaned.replace(/\[onCompletion::\s*[^\]]*\]/gi, "");

		// Clean up extra spaces
		cleaned = cleaned.replace(/\s+/g, " ").trim();

		return cleaned;
	}

	/**
	 * Ensure task is marked as completed (change [ ] to [x])
	 */
	private ensureTaskIsCompleted(content: string): string {
		// Replace any checkbox format with completed checkbox
		return content.replace(/^(\s*[-*+]\s*)\[[^\]]*\](\s*)/, "$1[x]$2");
	}

	/**
	 * Get completion marker based on preferMetadataFormat setting
	 */
	private getCompletionMarker(
		context: OnCompletionExecutionContext,
		timestamp: string
	): string {
		const useDataviewFormat =
			context.plugin.settings.preferMetadataFormat === "dataview";

		if (useDataviewFormat) {
			return `[completion:: ${timestamp}]`;
		} else {
			return `✅ ${timestamp}`;
		}
	}
}
