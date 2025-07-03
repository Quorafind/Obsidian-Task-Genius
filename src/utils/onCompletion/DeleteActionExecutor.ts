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
			if (!(file instanceof TFile)) {
				return this.createErrorResult(
					`File not found: ${task.filePath}`
				);
			}

			// Read the current content
			const content = await app.vault.read(file);
			const lines = content.split("\n");

			// Find and remove the task line
			if (task.line !== undefined && task.line < lines.length) {
				// Remove the line containing the task
				lines.splice(task.line, 1);

				// Write the updated content back to the file
				const updatedContent = lines.join("\n");
				await app.vault.modify(file, updatedContent);

				return this.createSuccessResult(
					`Task deleted from ${task.filePath}`
				);
			} else {
				return this.createErrorResult("Task line not found in file");
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
}
