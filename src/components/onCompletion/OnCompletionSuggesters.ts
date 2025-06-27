import { App, TFile, TFolder, FuzzySuggestModal, Suggest } from 'obsidian';
import TaskProgressBarPlugin from '../../index';

/**
 * Suggester for task IDs
 */
export class TaskIdSuggest extends Suggest<string> {
	constructor(
		private app: App,
		inputEl: HTMLInputElement,
		private plugin: TaskProgressBarPlugin
	) {
		super(app, inputEl);
	}

	getSuggestions(query: string): string[] {
		if (!this.plugin.taskManager) {
			return [];
		}

		// Get all tasks that have IDs
		const allTasks = this.plugin.taskManager.getAllTasks();
		const taskIds = allTasks
			.filter(task => task.metadata.id)
			.map(task => task.metadata.id!)
			.filter(id => id.toLowerCase().includes(query.toLowerCase()));

		return taskIds.slice(0, 10); // Limit to 10 suggestions
	}

	renderSuggestion(taskId: string, el: HTMLElement): void {
		el.createDiv({ text: taskId, cls: 'task-id-suggestion' });
		
		// Try to find the task and show its content
		const task = this.plugin.taskManager?.getTaskById(taskId);
		if (task) {
			el.createDiv({ 
				text: task.content, 
				cls: 'task-content-preview' 
			});
		}
	}

	selectSuggestion(taskId: string): void {
		// Handle multiple task IDs in the input
		const currentValue = this.inputEl.value;
		const lastCommaIndex = currentValue.lastIndexOf(',');
		
		if (lastCommaIndex !== -1) {
			// Replace the last partial ID
			const beforeLastComma = currentValue.substring(0, lastCommaIndex + 1);
			this.inputEl.value = beforeLastComma + ' ' + taskId;
		} else {
			// Replace the entire value
			this.inputEl.value = taskId;
		}
		
		this.inputEl.trigger('input');
		this.close();
	}
}

/**
 * Suggester for file locations
 */
export class FileLocationSuggest extends Suggest<TFile> {
	constructor(
		private app: App,
		inputEl: HTMLInputElement
	) {
		super(app, inputEl);
	}

	getSuggestions(query: string): TFile[] {
		const files = this.app.vault.getMarkdownFiles();
		return files
			.filter(file => file.path.toLowerCase().includes(query.toLowerCase()))
			.slice(0, 10); // Limit to 10 suggestions
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.createDiv({ text: file.name, cls: 'file-name' });
		el.createDiv({ text: file.path, cls: 'file-path' });
	}

	selectSuggestion(file: TFile): void {
		this.inputEl.value = file.path;
		this.inputEl.trigger('input');
		this.close();
	}
}

/**
 * Suggester for action types (used in simple text input scenarios)
 */
export class ActionTypeSuggest extends Suggest<string> {
	private readonly actionTypes = [
		'delete',
		'keep', 
		'archive',
		'move:',
		'complete:',
		'duplicate'
	];

	constructor(
		private app: App,
		inputEl: HTMLInputElement
	) {
		super(app, inputEl);
	}

	getSuggestions(query: string): string[] {
		return this.actionTypes
			.filter(action => action.toLowerCase().includes(query.toLowerCase()));
	}

	renderSuggestion(actionType: string, el: HTMLElement): void {
		el.createDiv({ text: actionType, cls: 'action-type-suggestion' });
		
		// Add description
		const description = this.getActionDescription(actionType);
		if (description) {
			el.createDiv({ 
				text: description, 
				cls: 'action-description' 
			});
		}
	}

	private getActionDescription(actionType: string): string {
		switch (actionType) {
			case 'delete':
				return 'Remove the completed task from the file';
			case 'keep':
				return 'Keep the completed task in place';
			case 'archive':
				return 'Move the completed task to an archive file';
			case 'move:':
				return 'Move the completed task to another file';
			case 'complete:':
				return 'Mark related tasks as completed';
			case 'duplicate':
				return 'Create a copy of the completed task';
			default:
				return '';
		}
	}

	selectSuggestion(actionType: string): void {
		this.inputEl.value = actionType;
		this.inputEl.trigger('input');
		this.close();
	}
}

/**
 * Modal for selecting files with folder navigation
 */
export class FileSelectionModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private onChoose: (file: TFile) => void
	) {
		super(app);
		this.setPlaceholder('Type to search for files...');
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
} 