import { TFile } from "obsidian";
import { BaseActionExecutor } from "./BaseActionExecutor";
import {
	OnCompletionConfig,
	OnCompletionExecutionContext,
	OnCompletionExecutionResult,
	OnCompletionActionType,
	OnCompletionMoveConfig,
} from "../../types/onCompletion";

/**
 * Executor for move action - moves the completed task to another file/section
 */
export class MoveActionExecutor extends BaseActionExecutor {
	/**
	 * Execute move action for Canvas tasks
	 */
	protected async executeForCanvas(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		const moveConfig = config as OnCompletionMoveConfig;
		const { task, app } = context;

		try {
			const canvasUpdater = this.getCanvasTaskUpdater(context);

			// Check if target is a Canvas file
			if (moveConfig.targetFile.endsWith(".canvas")) {
				// Canvas to Canvas move
				// Create a cleaned version of the task without onCompletion metadata
				const cleanedTask = {
					...task,
					originalMarkdown: this.removeOnCompletionMetadata(
						task.originalMarkdown ||
							`- [${task.completed ? "x" : " "}] ${task.content}`
					),
					metadata: {
						...task.metadata,
						onCompletion: undefined, // Remove onCompletion from metadata
					},
				};

				const result = await canvasUpdater.moveCanvasTask(
					cleanedTask,
					moveConfig.targetFile,
					undefined, // targetNodeId - could be enhanced later
					moveConfig.targetSection
				);

				if (result.success) {
					const sectionText = moveConfig.targetSection
						? ` (section: ${moveConfig.targetSection})`
						: "";
					return this.createSuccessResult(
						`Task moved to Canvas file ${moveConfig.targetFile}${sectionText} successfully`
					);
				} else {
					return this.createErrorResult(
						result.error || "Failed to move Canvas task"
					);
				}
			} else {
				// Canvas to Markdown move
				return this.moveCanvasToMarkdown(context, moveConfig);
			}
		} catch (error) {
			return this.createErrorResult(
				`Error moving Canvas task: ${error.message}`
			);
		}
	}

	/**
	 * Execute move action for Markdown tasks
	 */
	protected async executeForMarkdown(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		const moveConfig = config as OnCompletionMoveConfig;
		const { task, app } = context;

		try {
			// Get the source file containing the task
			const sourceFile = app.vault.getFileByPath(task.filePath);
			if (!sourceFile) {
				return this.createErrorResult(
					`Source file not found: ${task.filePath}`
				);
			}

			// Get or create the target file
			let targetFile = app.vault.getFileByPath(moveConfig.targetFile);
			if (!targetFile) {
				// Try to create the target file if it doesn't exist
				try {
					targetFile = await app.vault.create(
						moveConfig.targetFile,
						""
					);
				} catch (error) {
					return this.createErrorResult(
						`Failed to create target file: ${moveConfig.targetFile}`
					);
				}
			}

			// Read source and target file contents
			const sourceContent = await app.vault.read(sourceFile);
			const targetContent = await app.vault.read(targetFile);

			const sourceLines = sourceContent.split("\n");
			const targetLines = targetContent.split("\n");

			// Find and extract the task line from source
			if (task.line === undefined || task.line >= sourceLines.length) {
				return this.createErrorResult(
					"Task line not found in source file"
				);
			}

			let taskLine = sourceLines[task.line];

			// Clean onCompletion metadata from the task line before moving
			taskLine = this.removeOnCompletionMetadata(taskLine);

			// Remove the task from source file
			sourceLines.splice(task.line, 1);

			// Add the task to target file
			if (moveConfig.targetSection) {
				// Find the target section and insert after it
				const sectionIndex = targetLines.findIndex(
					(line) =>
						line.trim().startsWith("#") &&
						line.includes(moveConfig.targetSection!)
				);

				if (sectionIndex !== -1) {
					// Find the end of this section (next section or end of file)
					let insertIndex = targetLines.length;
					for (
						let i = sectionIndex + 1;
						i < targetLines.length;
						i++
					) {
						if (targetLines[i].trim().startsWith("#")) {
							insertIndex = i;
							break;
						}
					}
					// Insert before the next section or at the end
					targetLines.splice(insertIndex, 0, taskLine);
				} else {
					// Section not found, create it and add the task
					targetLines.push(
						"",
						`## ${moveConfig.targetSection}`,
						taskLine
					);
				}
			} else {
				// No specific section, add to the end
				targetLines.push(taskLine);
			}

			// Write updated contents back to files
			await app.vault.modify(sourceFile, sourceLines.join("\n"));
			await app.vault.modify(targetFile, targetLines.join("\n"));

			const sectionText = moveConfig.targetSection
				? ` (section: ${moveConfig.targetSection})`
				: "";
			return this.createSuccessResult(
				`Task moved to ${moveConfig.targetFile}${sectionText} successfully`
			);
		} catch (error) {
			return this.createErrorResult(
				`Failed to move task: ${error.message}`
			);
		}
	}

	/**
	 * Move a Canvas task to a Markdown file
	 */
	private async moveCanvasToMarkdown(
		context: OnCompletionExecutionContext,
		moveConfig: OnCompletionMoveConfig
	): Promise<OnCompletionExecutionResult> {
		const { task, app } = context;

		try {
			// Get task content as markdown
			let taskContent =
				task.originalMarkdown ||
				`- [${task.completed ? "x" : " "}] ${task.content}`;

			// Clean onCompletion metadata from the task content before moving
			taskContent = this.removeOnCompletionMetadata(taskContent);

			// Add to Markdown target FIRST (before deleting from source)
			let targetFile = app.vault.getFileByPath(moveConfig.targetFile);
			if (!targetFile) {
				// Try to create the target file if it doesn't exist
				try {
					targetFile = await app.vault.create(
						moveConfig.targetFile,
						""
					);
				} catch (error) {
					return this.createErrorResult(
						`Failed to create target file: ${moveConfig.targetFile}`
					);
				}
			}

			// Read target file content
			const targetContent = await app.vault.read(targetFile as TFile);
			const targetLines = targetContent.split("\n");

			// Find insertion point
			let insertPosition = targetLines.length;
			if (moveConfig.targetSection) {
				for (let i = 0; i < targetLines.length; i++) {
					if (
						targetLines[i]
							.trim()
							.toLowerCase()
							.includes(moveConfig.targetSection.toLowerCase())
					) {
						insertPosition = i + 1;
						break;
					}
				}
			}

			// Insert task
			targetLines.splice(insertPosition, 0, taskContent);

			// Write updated target file
			await app.vault.modify(targetFile, targetLines.join("\n"));

			// Only delete from Canvas source AFTER successful target file update
			const canvasUpdater = this.getCanvasTaskUpdater(context);
			const deleteResult = await canvasUpdater.deleteCanvasTask(task);

			if (!deleteResult.success) {
				// Move succeeded but deletion failed - this is less critical
				// The task is safely moved, just not removed from source
				const sectionText = moveConfig.targetSection
					? ` (section: ${moveConfig.targetSection})`
					: "";
				return this.createErrorResult(
					`Task moved successfully to ${moveConfig.targetFile}${sectionText}, but failed to remove from Canvas: ${deleteResult.error}`
				);
			}

			const sectionText = moveConfig.targetSection
				? ` (section: ${moveConfig.targetSection})`
				: "";
			return this.createSuccessResult(
				`Task moved from Canvas to ${moveConfig.targetFile}${sectionText} successfully`
			);
		} catch (error) {
			return this.createErrorResult(
				`Failed to move Canvas task to Markdown: ${error.message}`
			);
		}
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

	protected validateConfig(config: OnCompletionConfig): boolean {
		if (config.type !== OnCompletionActionType.MOVE) {
			return false;
		}

		const moveConfig = config as OnCompletionMoveConfig;
		return (
			typeof moveConfig.targetFile === "string" &&
			moveConfig.targetFile.trim().length > 0
		);
	}

	public getDescription(config: OnCompletionConfig): string {
		const moveConfig = config as OnCompletionMoveConfig;
		const sectionText = moveConfig.targetSection
			? ` (section: ${moveConfig.targetSection})`
			: "";
		return `Move task to ${moveConfig.targetFile}${sectionText}`;
	}
}
