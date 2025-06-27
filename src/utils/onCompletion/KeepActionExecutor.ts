import { BaseActionExecutor } from './BaseActionExecutor';
import { 
	OnCompletionConfig, 
	OnCompletionExecutionContext, 
	OnCompletionExecutionResult,
	OnCompletionActionType,
	OnCompletionKeepConfig
} from '../../types/onCompletion';

/**
 * Executor for keep action - leaves the completed task as is (no action)
 */
export class KeepActionExecutor extends BaseActionExecutor {
	public async execute(
		context: OnCompletionExecutionContext,
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		if (!this.validateConfig(config)) {
			return this.createErrorResult('Invalid keep configuration');
		}

		// Keep action does nothing - just return success
		return this.createSuccessResult('Task kept in place');
	}

	protected validateConfig(config: OnCompletionConfig): boolean {
		return config.type === OnCompletionActionType.KEEP;
	}

	public getDescription(config: OnCompletionConfig): string {
		return 'Keep the completed task in place (no action)';
	}
} 