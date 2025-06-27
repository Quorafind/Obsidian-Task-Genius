import { TFile } from 'obsidian';
import { BaseActionExecutor } from './BaseActionExecutor';
import { 
	OnCompletionConfig, 
	OnCompletionExecutionContext, 
	OnCompletionExecutionResult,
	OnCompletionActionType,
	OnCompletionDeleteConfig
} from '../../types/onCompletion';

/**
 * Executor for delete action - removes the completed task from the file
 */
export class DeleteActionExecutor extends BaseActionExecutor {
	public async execute(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		if (!this.validateConfig(config)) {
			return this.createErrorResult('Invalid delete configuration');
		}

		const { task, app } = context;

		try {
			// Get the file containing the task
			const file = app.vault.getAbstractFileByPath(task.filePath);
			if (!(file instanceof TFile)) {
				return this.createErrorResult(`File not found: ${task.filePath}`);
			}

			// Read the current content
			const content = await app.vault.read(file);
			const lines = content.split('\n');

			// Find and remove the task line
			if (task.line !== undefined && task.line < lines.length) {
				// Remove the line containing the task
				lines.splice(task.line, 1);

				// Write the updated content back to the file
				const updatedContent = lines.join('\n');
				await app.vault.modify(file, updatedContent);

				return this.createSuccessResult(`Task deleted from ${task.filePath}`);
			} else {
				return this.createErrorResult('Task line not found in file');
			}
		} catch (error) {
			return this.createErrorResult(`Failed to delete task: ${error.message}`);
		}
	}

	protected validateConfig(config: OnCompletionConfig): boolean {
		return config.type === OnCompletionActionType.DELETE;
	}

	public getDescription(config: OnCompletionConfig): string {
		return 'Delete the completed task from the file';
	}
} 