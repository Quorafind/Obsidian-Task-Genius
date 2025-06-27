import { TFile } from 'obsidian';
import { BaseActionExecutor } from './BaseActionExecutor';
import { 
	OnCompletionConfig, 
	OnCompletionExecutionContext, 
	OnCompletionExecutionResult,
	OnCompletionActionType,
	OnCompletionDuplicateConfig
} from '../../types/onCompletion';

/**
 * Executor for duplicate action - creates a copy of the completed task
 */
export class DuplicateActionExecutor extends BaseActionExecutor {
	public async execute(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		if (!this.validateConfig(config)) {
			return this.createErrorResult('Invalid duplicate configuration');
		}

		const duplicateConfig = config as OnCompletionDuplicateConfig;
		const { task, app } = context;

		try {
			// Get the source file containing the task
			const sourceFile = app.vault.getAbstractFileByPath(task.filePath);
			if (!(sourceFile instanceof TFile)) {
				return this.createErrorResult(`Source file not found: ${task.filePath}`);
			}

			// Determine target file (default to same file if not specified)
			let targetFile: TFile;
			if (duplicateConfig.targetFile) {
				targetFile = app.vault.getAbstractFileByPath(duplicateConfig.targetFile) as TFile;
				if (!(targetFile instanceof TFile)) {
					// Try to create the target file if it doesn't exist
					try {
						targetFile = await app.vault.create(duplicateConfig.targetFile, '');
					} catch (error) {
						return this.createErrorResult(`Failed to create target file: ${duplicateConfig.targetFile}`);
					}
				}
			} else {
				targetFile = sourceFile;
			}

			// Read source content
			const sourceContent = await app.vault.read(sourceFile);
			const sourceLines = sourceContent.split('\n');

			// Find the task line
			if (task.line === undefined || task.line >= sourceLines.length) {
				return this.createErrorResult('Task line not found in source file');
			}

			const originalTaskLine = sourceLines[task.line];
			
			// Create duplicate task line
			let duplicateTaskLine = this.createDuplicateTaskLine(originalTaskLine, duplicateConfig);

			// If target file is different from source, add to target file
			if (targetFile.path !== sourceFile.path) {
				const targetContent = await app.vault.read(targetFile);
				const targetLines = targetContent.split('\n');

				// Add to target file
				if (duplicateConfig.targetSection) {
					// Find the target section and insert after it
					const sectionIndex = targetLines.findIndex(line => 
						line.trim().startsWith('#') && line.includes(duplicateConfig.targetSection!)
					);
					
					if (sectionIndex !== -1) {
						// Insert after the section header
						targetLines.splice(sectionIndex + 1, 0, duplicateTaskLine);
					} else {
						// Section not found, create it and add the task
						targetLines.push('', `## ${duplicateConfig.targetSection}`, duplicateTaskLine);
					}
				} else {
					// No specific section, add to the end
					targetLines.push(duplicateTaskLine);
				}

				// Write updated target file
				await app.vault.modify(targetFile, targetLines.join('\n'));
			} else {
				// Same file - add duplicate after the original task
				sourceLines.splice(task.line + 1, 0, duplicateTaskLine);
				await app.vault.modify(sourceFile, sourceLines.join('\n'));
			}

			const locationText = targetFile.path !== sourceFile.path 
				? `to ${duplicateConfig.targetFile}` 
				: 'in same file';
			const sectionText = duplicateConfig.targetSection 
				? ` (section: ${duplicateConfig.targetSection})` 
				: '';

			return this.createSuccessResult(`Task duplicated ${locationText}${sectionText}`);

		} catch (error) {
			return this.createErrorResult(`Failed to duplicate task: ${error.message}`);
		}
	}

	private createDuplicateTaskLine(originalLine: string, config: OnCompletionDuplicateConfig): string {
		// Reset the task to incomplete state
		let duplicateLine = originalLine.replace(/^(\s*- \[)[xX\-](\])/, '$1 $2');

		if (!config.preserveMetadata) {
			// Remove completion-related metadata
			duplicateLine = duplicateLine
				.replace(/✅\s*\d{4}-\d{2}-\d{2}/g, '') // Remove completion date
				.replace(/⏰\s*\d{4}-\d{2}-\d{2}/g, '') // Remove scheduled date if desired
				.trim();
		}

		// Add duplicate indicator
		const timestamp = new Date().toISOString().split('T')[0];
		duplicateLine += ` (duplicated ${timestamp})`;

		return duplicateLine;
	}

	protected validateConfig(config: OnCompletionConfig): boolean {
		return config.type === OnCompletionActionType.DUPLICATE;
	}

	public getDescription(config: OnCompletionConfig): string {
		const duplicateConfig = config as OnCompletionDuplicateConfig;
		
		if (duplicateConfig.targetFile) {
			const sectionText = duplicateConfig.targetSection 
				? ` (section: ${duplicateConfig.targetSection})` 
				: '';
			return `Duplicate task to ${duplicateConfig.targetFile}${sectionText}`;
		} else {
			return 'Duplicate task in same file';
		}
	}
} 