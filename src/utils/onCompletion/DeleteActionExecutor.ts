import { TFile } from "obsidian";
import { BaseActionExecutor } from "./BaseActionExecutor";
import {
	OnCompletionConfig,
	OnCompletionExecutionContext,
	OnCompletionExecutionResult,
	OnCompletionActionType,
	OnCompletionDeleteConfig,
} from "../../types/onCompletion";

/**
 * Executor for delete action - removes the completed task from the file
 */
export class DeleteActionExecutor extends BaseActionExecutor {
	/**
	 * Execute delete action for Canvas tasks
	 */
	protected async executeForCanvas(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		const { task } = context;

		try {
			const canvasUpdater = this.getCanvasTaskUpdater(context);
			const result = await canvasUpdater.deleteCanvasTask(task);

			if (result.success) {
				return this.createSuccessResult(
					`Task deleted from Canvas file ${task.filePath}`
				);
			} else {
				return this.createErrorResult(
					result.error || "Failed to delete Canvas task"
				);
			}
		} catch (error) {
			return this.createErrorResult(
				`Error deleting Canvas task: ${error.message}`
			);
		}
	}

	/**
	 * Execute delete action for Markdown tasks
	 */
	protected async executeForMarkdown(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		const { task, app } = context;

		try {
			// Get the file containing the task
			const file = app.vault.getFileByPath(task.filePath);
			if (!file) {
				return this.createErrorResult(
					`File not found: ${task.filePath}`
				);
			}

			// Read the current content
			const content = await app.vault.read(file);
			const lines = content.split("\n");

			// Find the task line to delete
			let taskLineIndex = -1;

			// First try to find by originalMarkdown if available
			if (task.originalMarkdown) {
				taskLineIndex = lines.findIndex(
					(line) => line.trim() === task.originalMarkdown?.trim()
				);
			}

			// If not found by originalMarkdown, try by line number
			if (
				taskLineIndex === -1 &&
				task.line !== undefined &&
				task.line < lines.length
			) {
				taskLineIndex = task.line;
			}

			// If still not found, try by lineNumber property (for backward compatibility)
			if (
				taskLineIndex === -1 &&
				(task as any).lineNumber !== undefined &&
				(task as any).lineNumber < lines.length
			) {
				taskLineIndex = (task as any).lineNumber;
			}

			if (taskLineIndex !== -1) {
				// Remove the line containing the task
				lines.splice(taskLineIndex, 1);

				// Clean up consecutive empty lines that might result from deletion
				this.cleanupConsecutiveEmptyLines(lines);

				// Write the updated content back to the file
				const updatedContent = lines.join("\n");
				await app.vault.modify(file, updatedContent);

				return this.createSuccessResult("Task deleted successfully");
			} else {
				return this.createErrorResult("Task not found in file");
			}
		} catch (error) {
			return this.createErrorResult(
				`Failed to delete task: ${error.message}`
			);
		}
	}

	protected validateConfig(config: OnCompletionConfig): boolean {
		return config.type === OnCompletionActionType.DELETE;
	}

	public getDescription(config: OnCompletionConfig): string {
		return "Delete the completed task from the file";
	}

	/**
	 * Clean up consecutive empty lines, keeping at most one empty line between content
	 */
	private cleanupConsecutiveEmptyLines(lines: string[]): void {
		for (let i = lines.length - 1; i >= 1; i--) {
			// If current line and previous line are both empty, remove current line
			if (lines[i].trim() === "" && lines[i - 1].trim() === "") {
				lines.splice(i, 1);
			}
		}
	}
}
