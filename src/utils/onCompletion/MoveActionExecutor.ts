import { TFile } from 'obsidian';
import { BaseActionExecutor } from './BaseActionExecutor';
import { 
	OnCompletionConfig, 
	OnCompletionExecutionContext, 
	OnCompletionExecutionResult,
	OnCompletionActionType,
	OnCompletionMoveConfig
} from '../../types/onCompletion';

/**
 * Executor for move action - moves the completed task to another file/section
 */
export class MoveActionExecutor extends BaseActionExecutor {
	public async execute(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		if (!this.validateConfig(config)) {
			return this.createErrorResult('Invalid move configuration');
		}

		const moveConfig = config as OnCompletionMoveConfig;
		const { task, app } = context;

		try {
			// Get the source file containing the task
			const sourceFile = app.vault.getAbstractFileByPath(task.filePath);
			if (!(sourceFile instanceof TFile)) {
				return this.createErrorResult(`Source file not found: ${task.filePath}`);
			}

			// Get or create the target file
			let targetFile = app.vault.getAbstractFileByPath(moveConfig.targetFile);
			if (!(targetFile instanceof TFile)) {
				// Try to create the target file if it doesn't exist
				try {
					targetFile = await app.vault.create(moveConfig.targetFile, '');
				} catch (error) {
					return this.createErrorResult(`Failed to create target file: ${moveConfig.targetFile}`);
				}
			}

			// Read source and target file contents
			const sourceContent = await app.vault.read(sourceFile);
			const targetContent = await app.vault.read(targetFile);

			const sourceLines = sourceContent.split('\n');
			const targetLines = targetContent.split('\n');

			// Find and extract the task line from source
			if (task.line === undefined || task.line >= sourceLines.length) {
				return this.createErrorResult('Task line not found in source file');
			}

			const taskLine = sourceLines[task.line];
			
			// Remove the task from source file
			sourceLines.splice(task.line, 1);

			// Add the task to target file
			if (moveConfig.targetSection) {
				// Find the target section and insert after it
				const sectionIndex = targetLines.findIndex(line => 
					line.trim().startsWith('#') && line.includes(moveConfig.targetSection!)
				);
				
				if (sectionIndex !== -1) {
					// Insert after the section header
					targetLines.splice(sectionIndex + 1, 0, taskLine);
				} else {
					// Section not found, create it and add the task
					targetLines.push('', `## ${moveConfig.targetSection}`, taskLine);
				}
			} else {
				// No specific section, add to the end
				targetLines.push(taskLine);
			}

			// Write updated contents back to files
			await app.vault.modify(sourceFile, sourceLines.join('\n'));
			await app.vault.modify(targetFile, targetLines.join('\n'));

			const sectionText = moveConfig.targetSection ? ` (section: ${moveConfig.targetSection})` : '';
			return this.createSuccessResult(`Task moved to ${moveConfig.targetFile}${sectionText}`);

		} catch (error) {
			return this.createErrorResult(`Failed to move task: ${error.message}`);
		}
	}

	protected validateConfig(config: OnCompletionConfig): boolean {
		if (config.type !== OnCompletionActionType.MOVE) {
			return false;
		}

		const moveConfig = config as OnCompletionMoveConfig;
		return typeof moveConfig.targetFile === 'string' && moveConfig.targetFile.trim().length > 0;
	}

	public getDescription(config: OnCompletionConfig): string {
		const moveConfig = config as OnCompletionMoveConfig;
		const sectionText = moveConfig.targetSection ? ` (section: ${moveConfig.targetSection})` : '';
		return `Move task to ${moveConfig.targetFile}${sectionText}`;
	}
} 