import { 
	OnCompletionConfig, 
	OnCompletionExecutionContext, 
	OnCompletionExecutionResult 
} from '../../types/onCompletion';

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
	public abstract execute(
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
	protected createSuccessResult(message?: string): OnCompletionExecutionResult {
		return {
			success: true,
			message
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
			error
		};
	}
} 