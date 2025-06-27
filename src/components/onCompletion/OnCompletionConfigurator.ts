import { Component, DropdownComponent, TextComponent, ToggleComponent } from 'obsidian';
import { 
	OnCompletionConfig, 
	OnCompletionActionType,
	OnCompletionParseResult
} from '../../types/onCompletion';
import TaskProgressBarPlugin from '../../index';
import { t } from '../../translations/helper';
import { TaskIdSuggest, FileLocationSuggest, ActionTypeSuggest } from './OnCompletionSuggesters';
import '../../styles/onCompletion.css';

export interface OnCompletionConfiguratorOptions {
	initialValue?: string;
	onChange?: (value: string) => void;
	onValidationChange?: (isValid: boolean, error?: string) => void;
}

/**
 * Component for configuring onCompletion actions with a user-friendly interface
 */
export class OnCompletionConfigurator extends Component {
	private containerEl: HTMLElement;
	private actionTypeDropdown: DropdownComponent;
	private configContainer: HTMLElement;
	private currentConfig: OnCompletionConfig | null = null;
	private currentRawValue: string = '';

	// Action-specific input components
	private taskIdsInput?: TextComponent;
	private targetFileInput?: TextComponent;
	private targetSectionInput?: TextComponent;
	private archiveFileInput?: TextComponent;
	private archiveSectionInput?: TextComponent;
	private preserveMetadataToggle?: ToggleComponent;

	constructor(
		parentEl: HTMLElement,
		private plugin: TaskProgressBarPlugin,
		private options: OnCompletionConfiguratorOptions = {}
	) {
		super();
		this.containerEl = parentEl.createDiv({ cls: 'oncompletion-configurator' });
		this.initializeUI();
		
		if (this.options.initialValue) {
			this.setValue(this.options.initialValue);
		}
	}

	private initializeUI() {
		// Action type selection
		const actionTypeContainer = this.containerEl.createDiv({ cls: 'oncompletion-action-type' });
		actionTypeContainer.createDiv({ cls: 'oncompletion-label', text: t('Action Type') });
		
		this.actionTypeDropdown = new DropdownComponent(actionTypeContainer);
		this.actionTypeDropdown.addOption('', t('Select action type...'));
		this.actionTypeDropdown.addOption(OnCompletionActionType.DELETE, t('Delete task'));
		this.actionTypeDropdown.addOption(OnCompletionActionType.KEEP, t('Keep task'));
		this.actionTypeDropdown.addOption(OnCompletionActionType.COMPLETE, t('Complete related tasks'));
		this.actionTypeDropdown.addOption(OnCompletionActionType.MOVE, t('Move task'));
		this.actionTypeDropdown.addOption(OnCompletionActionType.ARCHIVE, t('Archive task'));
		this.actionTypeDropdown.addOption(OnCompletionActionType.DUPLICATE, t('Duplicate task'));

		this.actionTypeDropdown.onChange((value) => {
			this.onActionTypeChange(value as OnCompletionActionType);
		});

		// Configuration container for action-specific options
		this.configContainer = this.containerEl.createDiv({ cls: 'oncompletion-config' });
	}

	private onActionTypeChange(actionType: OnCompletionActionType) {
		// Clear previous configuration
		this.configContainer.empty();
		this.currentConfig = null;

		if (!actionType) {
			this.updateValue();
			return;
		}

		// Create base configuration
		switch (actionType) {
			case OnCompletionActionType.DELETE:
				this.currentConfig = { type: OnCompletionActionType.DELETE };
				break;
			case OnCompletionActionType.KEEP:
				this.currentConfig = { type: OnCompletionActionType.KEEP };
				break;
			case OnCompletionActionType.COMPLETE:
				this.createCompleteConfiguration();
				break;
			case OnCompletionActionType.MOVE:
				this.createMoveConfiguration();
				break;
			case OnCompletionActionType.ARCHIVE:
				this.createArchiveConfiguration();
				break;
			case OnCompletionActionType.DUPLICATE:
				this.createDuplicateConfiguration();
				break;
		}

		this.updateValue();
	}

	private createCompleteConfiguration() {
		this.currentConfig = {
			type: OnCompletionActionType.COMPLETE,
			taskIds: []
		};

		const taskIdsContainer = this.configContainer.createDiv({ cls: 'oncompletion-field' });
		taskIdsContainer.createDiv({ cls: 'oncompletion-label', text: t('Task IDs') });
		
		this.taskIdsInput = new TextComponent(taskIdsContainer);
		this.taskIdsInput.setPlaceholder(t('Enter task IDs separated by commas'));
		this.taskIdsInput.onChange((value) => {
			if (this.currentConfig && this.currentConfig.type === OnCompletionActionType.COMPLETE) {
				(this.currentConfig as any).taskIds = value.split(',').map(id => id.trim()).filter(id => id);
				this.updateValue();
			}
		});

		// Add task ID suggester
		new TaskIdSuggest(this.plugin.app, this.taskIdsInput.inputEl, this.plugin);

		taskIdsContainer.createDiv({ 
			cls: 'oncompletion-description', 
			text: t('Comma-separated list of task IDs to complete when this task is completed') 
		});
	}

	private createMoveConfiguration() {
		this.currentConfig = {
			type: OnCompletionActionType.MOVE,
			targetFile: ''
		};

		// Target file input
		const targetFileContainer = this.configContainer.createDiv({ cls: 'oncompletion-field' });
		targetFileContainer.createDiv({ cls: 'oncompletion-label', text: t('Target File') });
		
		this.targetFileInput = new TextComponent(targetFileContainer);
		this.targetFileInput.setPlaceholder(t('Path to target file'));
		this.targetFileInput.onChange((value) => {
			if (this.currentConfig && this.currentConfig.type === OnCompletionActionType.MOVE) {
				(this.currentConfig as any).targetFile = value;
				this.updateValue();
			}
		});

		// Add file location suggester
		new FileLocationSuggest(this.plugin.app, this.targetFileInput.inputEl);

		// Target section input (optional)
		const targetSectionContainer = this.configContainer.createDiv({ cls: 'oncompletion-field' });
		targetSectionContainer.createDiv({ cls: 'oncompletion-label', text: t('Target Section (Optional)') });
		
		this.targetSectionInput = new TextComponent(targetSectionContainer);
		this.targetSectionInput.setPlaceholder(t('Section name in target file'));
		this.targetSectionInput.onChange((value) => {
			if (this.currentConfig && this.currentConfig.type === OnCompletionActionType.MOVE) {
				(this.currentConfig as any).targetSection = value || undefined;
				this.updateValue();
			}
		});
	}

	private createArchiveConfiguration() {
		this.currentConfig = {
			type: OnCompletionActionType.ARCHIVE
		};

		// Archive file input (optional)
		const archiveFileContainer = this.configContainer.createDiv({ cls: 'oncompletion-field' });
		archiveFileContainer.createDiv({ cls: 'oncompletion-label', text: t('Archive File (Optional)') });
		
		this.archiveFileInput = new TextComponent(archiveFileContainer);
		this.archiveFileInput.setPlaceholder(t('Default: Archive/Completed Tasks.md'));
		this.archiveFileInput.onChange((value) => {
			if (this.currentConfig && this.currentConfig.type === OnCompletionActionType.ARCHIVE) {
				(this.currentConfig as any).archiveFile = value || undefined;
				this.updateValue();
			}
		});

		// Add file location suggester
		new FileLocationSuggest(this.plugin.app, this.archiveFileInput.inputEl);

		// Archive section input (optional)
		const archiveSectionContainer = this.configContainer.createDiv({ cls: 'oncompletion-field' });
		archiveSectionContainer.createDiv({ cls: 'oncompletion-label', text: t('Archive Section (Optional)') });
		
		this.archiveSectionInput = new TextComponent(archiveSectionContainer);
		this.archiveSectionInput.setPlaceholder(t('Default: Completed Tasks'));
		this.archiveSectionInput.onChange((value) => {
			if (this.currentConfig && this.currentConfig.type === OnCompletionActionType.ARCHIVE) {
				(this.currentConfig as any).archiveSection = value || undefined;
				this.updateValue();
			}
		});
	}

	private createDuplicateConfiguration() {
		this.currentConfig = {
			type: OnCompletionActionType.DUPLICATE
		};

		// Target file input (optional)
		const targetFileContainer = this.configContainer.createDiv({ cls: 'oncompletion-field' });
		targetFileContainer.createDiv({ cls: 'oncompletion-label', text: t('Target File (Optional)') });
		
		this.targetFileInput = new TextComponent(targetFileContainer);
		this.targetFileInput.setPlaceholder(t('Default: same file'));
		this.targetFileInput.onChange((value) => {
			if (this.currentConfig && this.currentConfig.type === OnCompletionActionType.DUPLICATE) {
				(this.currentConfig as any).targetFile = value || undefined;
				this.updateValue();
			}
		});

		// Add file location suggester
		new FileLocationSuggest(this.plugin.app, this.targetFileInput.inputEl);

		// Target section input (optional)
		const targetSectionContainer = this.configContainer.createDiv({ cls: 'oncompletion-field' });
		targetSectionContainer.createDiv({ cls: 'oncompletion-label', text: t('Target Section (Optional)') });
		
		this.targetSectionInput = new TextComponent(targetSectionContainer);
		this.targetSectionInput.setPlaceholder(t('Section name in target file'));
		this.targetSectionInput.onChange((value) => {
			if (this.currentConfig && this.currentConfig.type === OnCompletionActionType.DUPLICATE) {
				(this.currentConfig as any).targetSection = value || undefined;
				this.updateValue();
			}
		});

		// Preserve metadata toggle
		const preserveMetadataContainer = this.configContainer.createDiv({ cls: 'oncompletion-field' });
		preserveMetadataContainer.createDiv({ cls: 'oncompletion-label', text: t('Preserve Metadata') });
		
		this.preserveMetadataToggle = new ToggleComponent(preserveMetadataContainer);
		this.preserveMetadataToggle.onChange((value) => {
			if (this.currentConfig && this.currentConfig.type === OnCompletionActionType.DUPLICATE) {
				(this.currentConfig as any).preserveMetadata = value;
				this.updateValue();
			}
		});

		preserveMetadataContainer.createDiv({ 
			cls: 'oncompletion-description', 
			text: t('Keep completion dates and other metadata in the duplicated task') 
		});
	}

	private updateValue() {
		if (!this.currentConfig) {
			this.currentRawValue = '';
		} else {
			// Generate simple format for basic actions, JSON for complex ones
			this.currentRawValue = this.generateRawValue(this.currentConfig);
		}

		// Validate the configuration
		const parseResult = this.plugin.taskManager?.getOnCompletionManager()?.parseOnCompletion(this.currentRawValue);
		const isValid = parseResult?.isValid ?? false;

		// Notify about changes
		if (this.options.onChange) {
			this.options.onChange(this.currentRawValue);
		}

		if (this.options.onValidationChange) {
			this.options.onValidationChange(isValid, parseResult?.error);
		}
	}

	private generateRawValue(config: OnCompletionConfig): string {
		switch (config.type) {
			case OnCompletionActionType.DELETE:
				return 'delete';
			case OnCompletionActionType.KEEP:
				return 'keep';
			case OnCompletionActionType.ARCHIVE:
				const archiveConfig = config as any;
				if (archiveConfig.archiveFile) {
					return `archive:${archiveConfig.archiveFile}`;
				}
				return 'archive';
			case OnCompletionActionType.COMPLETE:
				const completeConfig = config as any;
				if (completeConfig.taskIds && completeConfig.taskIds.length > 0) {
					return `complete:${completeConfig.taskIds.join(',')}`;
				}
				return '';
			case OnCompletionActionType.MOVE:
				const moveConfig = config as any;
				if (moveConfig.targetFile) {
					return `move:${moveConfig.targetFile}`;
				}
				return '';
			case OnCompletionActionType.DUPLICATE:
				const duplicateConfig = config as any;
				// Use JSON format for complex duplicate configurations
				if (duplicateConfig.targetFile || duplicateConfig.targetSection || duplicateConfig.preserveMetadata) {
					return JSON.stringify(config);
				}
				return 'duplicate';
			default:
				return JSON.stringify(config);
		}
	}

	public setValue(value: string) {
		this.currentRawValue = value;
		
		// Parse the value and update UI
		const parseResult = this.plugin.taskManager?.getOnCompletionManager()?.parseOnCompletion(value);
		if (parseResult?.isValid && parseResult.config) {
			this.currentConfig = parseResult.config;
			this.updateUIFromConfig(parseResult.config);
		} else {
			this.currentConfig = null;
			this.actionTypeDropdown.setValue('');
			this.configContainer.empty();
		}
	}

	private updateUIFromConfig(config: OnCompletionConfig) {
		this.actionTypeDropdown.setValue(config.type);
		this.onActionTypeChange(config.type);

		// Update specific configuration inputs
		switch (config.type) {
			case OnCompletionActionType.COMPLETE:
				const completeConfig = config as any;
				if (this.taskIdsInput && completeConfig.taskIds) {
					this.taskIdsInput.setValue(completeConfig.taskIds.join(', '));
				}
				break;
			case OnCompletionActionType.MOVE:
				const moveConfig = config as any;
				if (this.targetFileInput) {
					this.targetFileInput.setValue(moveConfig.targetFile || '');
				}
				if (this.targetSectionInput) {
					this.targetSectionInput.setValue(moveConfig.targetSection || '');
				}
				break;
			case OnCompletionActionType.ARCHIVE:
				const archiveConfig = config as any;
				if (this.archiveFileInput) {
					this.archiveFileInput.setValue(archiveConfig.archiveFile || '');
				}
				if (this.archiveSectionInput) {
					this.archiveSectionInput.setValue(archiveConfig.archiveSection || '');
				}
				break;
			case OnCompletionActionType.DUPLICATE:
				const duplicateConfig = config as any;
				if (this.targetFileInput) {
					this.targetFileInput.setValue(duplicateConfig.targetFile || '');
				}
				if (this.targetSectionInput) {
					this.targetSectionInput.setValue(duplicateConfig.targetSection || '');
				}
				if (this.preserveMetadataToggle) {
					this.preserveMetadataToggle.setValue(duplicateConfig.preserveMetadata || false);
				}
				break;
		}
	}

	public getValue(): string {
		return this.currentRawValue;
	}

	public getConfig(): OnCompletionConfig | null {
		return this.currentConfig;
	}

	public isValid(): boolean {
		const parseResult = this.plugin.taskManager?.getOnCompletionManager()?.parseOnCompletion(this.currentRawValue);
		return parseResult?.isValid ?? false;
	}

	onunload() {
		this.containerEl.remove();
	}
} 