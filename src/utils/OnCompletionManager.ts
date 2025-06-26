import { Component, App } from 'obsidian';
import { Task } from '../types/task';
import { 
	OnCompletionConfig, 
	OnCompletionActionType, 
	OnCompletionExecutionContext, 
	OnCompletionExecutionResult,
	OnCompletionParseResult
} from '../types/onCompletion';
import TaskProgressBarPlugin from '../index';
import { BaseActionExecutor } from './onCompletion/BaseActionExecutor';
import { DeleteActionExecutor } from './onCompletion/DeleteActionExecutor';
import { KeepActionExecutor } from './onCompletion/KeepActionExecutor';
import { CompleteActionExecutor } from './onCompletion/CompleteActionExecutor';
import { MoveActionExecutor } from './onCompletion/MoveActionExecutor';
import { ArchiveActionExecutor } from './onCompletion/ArchiveActionExecutor';
import { DuplicateActionExecutor } from './onCompletion/DuplicateActionExecutor';

export class OnCompletionManager extends Component {
	private executors: Map<OnCompletionActionType, BaseActionExecutor>;

	constructor(
		private app: App,
		private plugin: TaskProgressBarPlugin
	) {
		super();
		this.executors = new Map();
		this.initializeExecutors();
	}

	onload() {
		// Listen for task completion events
		this.plugin.registerEvent(
			this.app.workspace.on('task-genius:task-completed', this.handleTaskCompleted.bind(this))
		);

		console.log('OnCompletionManager loaded');
	}

	private initializeExecutors() {
		this.executors.set(OnCompletionActionType.DELETE, new DeleteActionExecutor());
		this.executors.set(OnCompletionActionType.KEEP, new KeepActionExecutor());
		this.executors.set(OnCompletionActionType.COMPLETE, new CompleteActionExecutor());
		this.executors.set(OnCompletionActionType.MOVE, new MoveActionExecutor());
		this.executors.set(OnCompletionActionType.ARCHIVE, new ArchiveActionExecutor());
		this.executors.set(OnCompletionActionType.DUPLICATE, new DuplicateActionExecutor());
	}

	private async handleTaskCompleted(task: Task) {
		if (!task.metadata.onCompletion) {
			return;
		}

		try {
			const parseResult = this.parseOnCompletion(task.metadata.onCompletion);
			
			if (!parseResult.isValid || !parseResult.config) {
				console.warn('Invalid onCompletion configuration:', parseResult.error);
				return;
			}

			await this.executeOnCompletion(task, parseResult.config);
		} catch (error) {
			console.error('Error executing onCompletion action:', error);
		}
	}

	public parseOnCompletion(onCompletionValue: string): OnCompletionParseResult {
		if (!onCompletionValue || typeof onCompletionValue !== 'string') {
			return {
				config: null,
				rawValue: onCompletionValue || '',
				isValid: false,
				error: 'Empty or invalid onCompletion value'
			};
		}

		const trimmedValue = onCompletionValue.trim().toLowerCase();

		try {
			// Try to parse as JSON first (structured format)
			if (trimmedValue.startsWith('{')) {
				const config = JSON.parse(onCompletionValue) as OnCompletionConfig;
				return {
					config,
					rawValue: onCompletionValue,
					isValid: this.validateConfig(config),
					error: this.validateConfig(config) ? undefined : 'Invalid configuration structure'
				};
			}

			// Parse simple text format
			const config = this.parseSimpleFormat(trimmedValue);
			return {
				config,
				rawValue: onCompletionValue,
				isValid: config !== null,
				error: config === null ? 'Unrecognized onCompletion format' : undefined
			};
		} catch (error) {
			return {
				config: null,
				rawValue: onCompletionValue,
				isValid: false,
				error: `Parse error: ${error.message}`
			};
		}
	}

	private parseSimpleFormat(value: string): OnCompletionConfig | null {
		switch (value) {
			case 'delete':
				return { type: OnCompletionActionType.DELETE };
			case 'keep':
				return { type: OnCompletionActionType.KEEP };
			case 'archive':
				return { type: OnCompletionActionType.ARCHIVE };
			default:
				// Check for parameterized formats
				if (value.startsWith('complete:')) {
					const taskIds = value.substring(9).split(',').map(id => id.trim()).filter(id => id);
					return {
						type: OnCompletionActionType.COMPLETE,
						taskIds
					};
				}
				if (value.startsWith('move:')) {
					const targetFile = value.substring(5).trim();
					return {
						type: OnCompletionActionType.MOVE,
						targetFile
					};
				}
				if (value.startsWith('archive:')) {
					const archiveFile = value.substring(8).trim();
					return {
						type: OnCompletionActionType.ARCHIVE,
						archiveFile
					};
				}
				if (value.startsWith('duplicate:')) {
					const targetFile = value.substring(10).trim();
					return {
						type: OnCompletionActionType.DUPLICATE,
						targetFile
					};
				}
				return null;
		}
	}

	private validateConfig(config: OnCompletionConfig): boolean {
		if (!config || !config.type) {
			return false;
		}

		switch (config.type) {
			case OnCompletionActionType.DELETE:
			case OnCompletionActionType.KEEP:
				return true;
			case OnCompletionActionType.COMPLETE:
				return Array.isArray((config as any).taskIds) && (config as any).taskIds.length > 0;
			case OnCompletionActionType.MOVE:
				return typeof (config as any).targetFile === 'string' && (config as any).targetFile.trim().length > 0;
			case OnCompletionActionType.ARCHIVE:
			case OnCompletionActionType.DUPLICATE:
				return true; // These can work with default values
			default:
				return false;
		}
	}

	public async executeOnCompletion(
		task: Task, 
		config: OnCompletionConfig
	): Promise<OnCompletionExecutionResult> {
		const executor = this.executors.get(config.type);
		
		if (!executor) {
			return {
				success: false,
				error: `No executor found for action type: ${config.type}`
			};
		}

		const context: OnCompletionExecutionContext = {
			task,
			plugin: this.plugin,
			app: this.app
		};

		try {
			return await executor.execute(context, config);
		} catch (error) {
			return {
				success: false,
				error: `Execution failed: ${error.message}`
			};
		}
	}

	onunload() {
		this.executors.clear();
		console.log('OnCompletionManager unloaded');
	}
} 