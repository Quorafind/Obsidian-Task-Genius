import { TFile } from 'obsidian';
import { BaseActionExecutor } from './BaseActionExecutor';
import { 
	OnCompletionConfig, 
	OnCompletionExecutionContext, 
	OnCompletionExecutionResult,
	OnCompletionActionType,
	OnCompletionArchiveConfig
} from '../../types/onCompletion';

/**
 * Executor for archive action - moves the completed task to an archive file
 */
export class ArchiveActionExecutor extends BaseActionExecutor {
	private readonly DEFAULT_ARCHIVE_FILE = 'Archive/Completed Tasks.md';
	private readonly DEFAULT_ARCHIVE_SECTION = 'Completed Tasks';

	public async execute(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		if (!this.validateConfig(config)) {
			return this.createErrorResult('Invalid archive configuration');
		}

		const archiveConfig = config as OnCompletionArchiveConfig;
		const { task, app, plugin } = context;

		try {
			// Determine archive file path
			const archiveFilePath = archiveConfig.archiveFile || 
				plugin.settings.onCompletion?.defaultArchiveFile || 
				this.DEFAULT_ARCHIVE_FILE;

			// Determine archive section
			const archiveSection = archiveConfig.archiveSection || this.DEFAULT_ARCHIVE_SECTION;

			// Get the source file containing the task
			const sourceFile = app.vault.getAbstractFileByPath(task.filePath);
			if (!(sourceFile instanceof TFile)) {
				return this.createErrorResult(`Source file not found: ${task.filePath}`);
			}

			// Get or create the archive file
			let archiveFile = app.vault.getAbstractFileByPath(archiveFilePath);
			if (!(archiveFile instanceof TFile)) {
				// Try to create the archive file if it doesn't exist
				try {
					// Ensure the directory exists
					const dirPath = archiveFilePath.substring(0, archiveFilePath.lastIndexOf('/'));
					if (dirPath && !app.vault.getAbstractFileByPath(dirPath)) {
						await app.vault.createFolder(dirPath);
					}
					
					archiveFile = await app.vault.create(archiveFilePath, `# Archive\n\n## ${archiveSection}\n\n`);
				} catch (error) {
					return this.createErrorResult(`Failed to create archive file: ${archiveFilePath}`);
				}
			}

			// Read source and archive file contents
			const sourceContent = await app.vault.read(sourceFile);
			const archiveContent = await app.vault.read(archiveFile);

			const sourceLines = sourceContent.split('\n');
			const archiveLines = archiveContent.split('\n');

			// Find and extract the task line from source
			if (task.line === undefined || task.line >= sourceLines.length) {
				return this.createErrorResult('Task line not found in source file');
			}

			const taskLine = sourceLines[task.line];
			
			// Add timestamp and source info to the task line
			const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
			const sourceInfo = `(from ${task.filePath})`;
			const archivedTaskLine = `${taskLine} - Completed ${timestamp} ${sourceInfo}`;
			
			// Remove the task from source file
			sourceLines.splice(task.line, 1);

			// Add the task to archive file
			const sectionIndex = archiveLines.findIndex(line => 
				line.trim().startsWith('#') && line.includes(archiveSection)
			);
			
			if (sectionIndex !== -1) {
				// Find the next section or end of file
				let insertIndex = archiveLines.length;
				for (let i = sectionIndex + 1; i < archiveLines.length; i++) {
					if (archiveLines[i].trim().startsWith('#')) {
						insertIndex = i;
						break;
					}
				}
				// Insert before the next section or at the end
				archiveLines.splice(insertIndex, 0, archivedTaskLine);
			} else {
				// Section not found, create it and add the task
				archiveLines.push('', `## ${archiveSection}`, archivedTaskLine);
			}

			// Write updated contents back to files
			await app.vault.modify(sourceFile, sourceLines.join('\n'));
			await app.vault.modify(archiveFile, archiveLines.join('\n'));

			return this.createSuccessResult(`Task archived to ${archiveFilePath} (section: ${archiveSection})`);

		} catch (error) {
			return this.createErrorResult(`Failed to archive task: ${error.message}`);
		}
	}

	protected validateConfig(config: OnCompletionConfig): boolean {
		return config.type === OnCompletionActionType.ARCHIVE;
	}

	public getDescription(config: OnCompletionConfig): string {
		const archiveConfig = config as OnCompletionArchiveConfig;
		const archiveFile = archiveConfig.archiveFile || this.DEFAULT_ARCHIVE_FILE;
		const archiveSection = archiveConfig.archiveSection || this.DEFAULT_ARCHIVE_SECTION;
		return `Archive task to ${archiveFile} (section: ${archiveSection})`;
	}
} 