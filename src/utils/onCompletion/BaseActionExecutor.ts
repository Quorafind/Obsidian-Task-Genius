import {
	OnCompletionConfig,
	OnCompletionExecutionContext,
	OnCompletionExecutionResult,
} from "../../types/onCompletion";
import { Task, CanvasTaskMetadata } from "../../types/task";
import { CanvasTaskUpdater } from "../parsing/CanvasTaskUpdater";

/**
 * Abstract base class for all onCompletion action executors
 */
export abstract class BaseActionExecutor {
	/**
	 * Execute the onCompletion action
	 * @param context Execution context containing task, plugin, and app references
	 * @param config Configuration for the specific action
	 * @returns Promise resolving to execution result
	 */
	public async execute(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		if (!this.validateConfig(config)) {
			return this.createErrorResult("Invalid configuration");
		}
		
		// Route to appropriate execution method based on task type
		if (this.isCanvasTask(context.task)) {
			return this.executeForCanvas(context, config);
		} else {
			return this.executeForMarkdown(context, config);
		}
	}

	/**
	 * Execute the action for Canvas tasks
	 * @param context Execution context
	 * @param config Configuration for the action
	 * @returns Promise resolving to execution result
	 */
	protected abstract executeForCanvas(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult>;

	/**
	 * Execute the action for Markdown tasks
	 * @param context Execution context
	 * @param config Configuration for the action
	 * @returns Promise resolving to execution result
	 */
	protected abstract executeForMarkdown(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult>;

	/**
	 * Validate the configuration for this executor type
	 * @param config Configuration to validate
	 * @returns true if configuration is valid, false otherwise
	 */
	protected abstract validateConfig(config: OnCompletionConfig): boolean;

	/**
	 * Get a human-readable description of the action
	 * @param config Configuration for the action
	 * @returns Description string
	 */
	public abstract getDescription(config: OnCompletionConfig): string;

	/**
	 * Helper method to create a success result
	 * @param message Optional success message
	 * @returns Success result
	 */
	protected createSuccessResult(
		message?: string
	): OnCompletionExecutionResult {
		return {
			success: true,
			message,
		};
	}

	/**
	 * Helper method to create an error result
	 * @param error Error message
	 * @returns Error result
	 */
	protected createErrorResult(error: string): OnCompletionExecutionResult {
		return {
			success: false,
			error,
		};
	}

	/**
	 * Check if a task is a Canvas task
	 * @param task Task to check
	 * @returns true if task is a Canvas task
	 */
	protected isCanvasTask(task: Task): task is Task<CanvasTaskMetadata> {
		return CanvasTaskUpdater.isCanvasTask(task);
	}

	/**
	 * Get Canvas task updater instance from context
	 * @param context Execution context
	 * @returns CanvasTaskUpdater instance
	 */
	protected getCanvasTaskUpdater(
		context: OnCompletionExecutionContext
	): CanvasTaskUpdater {
		return context.plugin.taskManager.getCanvasTaskUpdater();
	}
}
