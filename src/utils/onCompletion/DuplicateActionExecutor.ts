import { TFile } from "obsidian";
import { BaseActionExecutor } from "./BaseActionExecutor";
import {
	OnCompletionConfig,
	OnCompletionExecutionContext,
	OnCompletionExecutionResult,
	OnCompletionActionType,
	OnCompletionDuplicateConfig,
} from "../../types/onCompletion";

/**
 * Executor for duplicate action - creates a copy of the completed task
 */
export class DuplicateActionExecutor extends BaseActionExecutor {
	/**
	 * Execute duplicate action for Canvas tasks
	 */
	protected async executeForCanvas(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		const duplicateConfig = config as OnCompletionDuplicateConfig;
		const { task, app } = context;

		try {
			const canvasUpdater = this.getCanvasTaskUpdater(context);

			// Check if target is a Canvas file
			const targetFile = duplicateConfig.targetFile || task.filePath;
			if (targetFile.endsWith(".canvas")) {
				// Canvas to Canvas duplicate
				const result = await canvasUpdater.duplicateCanvasTask(
					task,
					targetFile,
					undefined, // targetNodeId - could be enhanced later
					duplicateConfig.targetSection,
					duplicateConfig.preserveMetadata
				);

				if (result.success) {
					const locationText =
						targetFile !== task.filePath
							? `to ${duplicateConfig.targetFile}`
							: "in same file";
					const sectionText = duplicateConfig.targetSection
						? ` (section: ${duplicateConfig.targetSection})`
						: "";
					return this.createSuccessResult(
						`Task duplicated ${locationText}${sectionText}`
					);
				} else {
					return this.createErrorResult(
						result.error || "Failed to duplicate Canvas task"
					);
				}
			} else {
				// Canvas to Markdown duplicate
				return this.duplicateCanvasToMarkdown(context, duplicateConfig);
			}
		} catch (error) {
			return this.createErrorResult(
				`Error duplicating Canvas task: ${error.message}`
			);
		}
	}

	/**
	 * Execute duplicate action for Markdown tasks
	 */
	protected async executeForMarkdown(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		const duplicateConfig = config as OnCompletionDuplicateConfig;
		const { task, app } = context;

		try {
			// Get the source file containing the task
			const sourceFile = app.vault.getFileByPath(task.filePath);
			if (!(sourceFile instanceof TFile)) {
				return this.createErrorResult(
					`Source file not found: ${task.filePath}`
				);
			}

			// Determine target file (default to same file if not specified)
			let targetFile: TFile;
			if (duplicateConfig.targetFile) {
				targetFile = app.vault.getFileByPath(
					duplicateConfig.targetFile
				) as TFile;
				if (!(targetFile instanceof TFile)) {
					// Try to create the target file if it doesn't exist
					try {
						targetFile = await app.vault.create(
							duplicateConfig.targetFile,
							""
						);
					} catch (error) {
						return this.createErrorResult(
							`Failed to create target file: ${duplicateConfig.targetFile}`
						);
					}
				}
			} else {
				targetFile = sourceFile;
			}

			// Read source content
			const sourceContent = await app.vault.read(sourceFile);
			const sourceLines = sourceContent.split("\n");

			// Find the task line
			if (task.line === undefined || task.line >= sourceLines.length) {
				return this.createErrorResult(
					"Task line not found in source file"
				);
			}

			const originalTaskLine = sourceLines[task.line];

			// Create duplicate task line
			let duplicateTaskLine = this.createDuplicateTaskLine(
				originalTaskLine,
				duplicateConfig
			);

			// If target file is different from source, add to target file
			if (targetFile.path !== sourceFile.path) {
				const targetContent = await app.vault.read(targetFile);
				const targetLines = targetContent.split("\n");

				// Add to target file
				if (duplicateConfig.targetSection) {
					// Find the target section and insert after it
					const sectionIndex = targetLines.findIndex(
						(line) =>
							line.trim().startsWith("#") &&
							line.includes(duplicateConfig.targetSection!)
					);

					if (sectionIndex !== -1) {
						// Insert after the section header
						targetLines.splice(
							sectionIndex + 1,
							0,
							duplicateTaskLine
						);
					} else {
						// Section not found, create it and add the task
						targetLines.push(
							"",
							`## ${duplicateConfig.targetSection}`,
							duplicateTaskLine
						);
					}
				} else {
					// No specific section, add to the end
					targetLines.push(duplicateTaskLine);
				}

				// Write updated target file
				await app.vault.modify(targetFile, targetLines.join("\n"));
			} else {
				// Same file - add duplicate after the original task
				sourceLines.splice(task.line + 1, 0, duplicateTaskLine);
				await app.vault.modify(sourceFile, sourceLines.join("\n"));
			}

			const locationText =
				targetFile.path !== sourceFile.path
					? `to ${duplicateConfig.targetFile}`
					: "in same file";
			const sectionText = duplicateConfig.targetSection
				? ` (section: ${duplicateConfig.targetSection})`
				: "";

			return this.createSuccessResult(
				`Task duplicated ${locationText}${sectionText}`
			);
		} catch (error) {
			return this.createErrorResult(
				`Failed to duplicate task: ${error.message}`
			);
		}
	}

	/**
	 * Duplicate a Canvas task to a Markdown file
	 */
	private async duplicateCanvasToMarkdown(
		context: OnCompletionExecutionContext,
		duplicateConfig: OnCompletionDuplicateConfig
	): Promise<OnCompletionExecutionResult> {
		const { task, app } = context;

		try {
			// Get task content as markdown
			let taskContent =
				task.originalMarkdown ||
				`- [${task.completed ? "x" : " "}] ${task.content}`;

			// Reset completion status
			taskContent = taskContent.replace(
				/^(\s*[-*+]\s*\[)[xX\-](\])/,
				"$1 $2"
			);

			if (!duplicateConfig.preserveMetadata) {
				// Remove completion-related metadata
				taskContent = taskContent
					.replace(/✅\s*\d{4}-\d{2}-\d{2}/g, "") // Remove completion date
					.replace(/⏰\s*\d{4}-\d{2}-\d{2}/g, "") // Remove scheduled date if desired
					.trim();
			}

			// Add duplicate indicator
			const timestamp = new Date().toISOString().split("T")[0];
			taskContent += ` (duplicated ${timestamp})`;

			// Add to Markdown target
			const targetFile = duplicateConfig.targetFile || task.filePath;
			let targetFileObj = app.vault.getFileByPath(targetFile);
			if (!targetFileObj) {
				// Try to create the target file if it doesn't exist
				try {
					targetFileObj = await app.vault.create(targetFile, "");
				} catch (error) {
					return this.createErrorResult(
						`Failed to create target file: ${targetFile}`
					);
				}
			}

			// Read target file content
			const targetContent = await app.vault.read(targetFileObj as TFile);
			const targetLines = targetContent.split("\n");

			// Find insertion point
			let insertPosition = targetLines.length;
			if (duplicateConfig.targetSection) {
				for (let i = 0; i < targetLines.length; i++) {
					if (
						targetLines[i]
							.trim()
							.toLowerCase()
							.includes(
								duplicateConfig.targetSection.toLowerCase()
							)
					) {
						insertPosition = i + 1;
						break;
					}
				}
			}

			// Insert task
			targetLines.splice(insertPosition, 0, taskContent);

			// Write updated target file
			await app.vault.modify(targetFileObj, targetLines.join("\n"));

			const locationText =
				targetFile !== task.filePath
					? `to ${duplicateConfig.targetFile}`
					: "in same file";
			const sectionText = duplicateConfig.targetSection
				? ` (section: ${duplicateConfig.targetSection})`
				: "";

			return this.createSuccessResult(
				`Task duplicated from Canvas ${locationText}${sectionText}`
			);
		} catch (error) {
			return this.createErrorResult(
				`Failed to duplicate Canvas task to Markdown: ${error.message}`
			);
		}
	}

	private createDuplicateTaskLine(
		originalLine: string,
		config: OnCompletionDuplicateConfig
	): string {
		// Reset the task to incomplete state
		let duplicateLine = originalLine.replace(
			/^(\s*- \[)[xX\-](\])/,
			"$1 $2"
		);

		if (!config.preserveMetadata) {
			// Remove completion-related metadata
			duplicateLine = duplicateLine
				.replace(/✅\s*\d{4}-\d{2}-\d{2}/g, "") // Remove completion date
				.replace(/⏰\s*\d{4}-\d{2}-\d{2}/g, "") // Remove scheduled date if desired
				.trim();
		}

		// Add duplicate indicator
		const timestamp = new Date().toISOString().split("T")[0];
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
				: "";
			return `Duplicate task to ${duplicateConfig.targetFile}${sectionText}`;
		} else {
			return "Duplicate task in same file";
		}
	}
}
