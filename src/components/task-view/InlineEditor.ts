import { App, Component, debounce, setIcon, Menu } from "obsidian";
import { Task } from "../../types/task";
import TaskProgressBarPlugin from "../../index";
import { ContextSuggest, ProjectSuggest, TagSuggest } from "../AutoComplete";
import { clearAllMarks } from "../MarkdownRenderer";
import {
	createEmbeddableMarkdownEditor,
	EmbeddableMarkdownEditor,
} from "../../editor-ext/markdownEditor";
import "../../styles/inline-editor.css";

export interface InlineEditorOptions {
	onTaskUpdate: (task: Task, updatedTask: Task) => Promise<void>;
	onContentEditFinished?: (targetEl: HTMLElement, task: Task) => void;
	onMetadataEditFinished?: (
		targetEl: HTMLElement,
		task: Task,
		fieldType: string
	) => void;
	onCancel?: () => void;
	useEmbeddedEditor?: boolean;
}

export class InlineEditor extends Component {
	private containerEl: HTMLElement;
	private task: Task;
	private options: InlineEditorOptions;
	private isEditing: boolean = false;
	private originalTask: Task | null = null;
	private isSaving: boolean = false;

	// Edit elements - only created when needed
	private contentInput: HTMLTextAreaElement | null = null;
	private embeddedEditor: EmbeddableMarkdownEditor | null = null;
	private activeInput: HTMLInputElement | HTMLSelectElement | null = null;
	private activeSuggest: ProjectSuggest | TagSuggest | ContextSuggest | null =
		null;

	// Debounced save function - only created when needed
	private debouncedSave: (() => void) | null = null;

	// Performance optimization: reuse event handlers
	private boundHandlers = {
		stopPropagation: (e: Event) => e.stopPropagation(),
		handleKeydown: (e: KeyboardEvent) => this.handleKeydown(e),
		handleBlur: (e: FocusEvent) => this.handleBlur(e),
		handleInput: (e: Event) => this.handleInput(e),
	};

	constructor(
		private app: App,
		private plugin: TaskProgressBarPlugin,
		task: Task,
		options: InlineEditorOptions
	) {
		super();
		// Don't clone task until editing starts - saves memory
		this.task = task;
		this.options = options;
	}

	onload() {
		// Only create container when component loads
		this.containerEl = createDiv({ cls: "inline-editor" });
	}

	/**
	 * Initialize editing state - called only when editing starts
	 */
	private initializeEditingState(): void {
		// Force cleanup any previous editing state
		if (this.isEditing) {
			console.warn("Editor already in editing state, forcing cleanup");
			this.cleanupEditors();
		}

		// Reset states
		this.isEditing = false;
		this.isSaving = false;

		// Store original task state for potential restoration - deep clone to avoid reference issues
		this.originalTask = { ...this.task };
	}

	/**
	 * Show inline editor for task content
	 */
	public showContentEditor(targetEl: HTMLElement): void {
		this.initializeEditingState();
		this.isEditing = true;

		// Store original content before clearing
		const originalContent = targetEl.innerHTML;
		targetEl.empty();

		// Extract the text content from the original markdown
		let editableContent = clearAllMarks(this.task.content);

		// If content is empty, try to extract from originalMarkdown
		if (!editableContent && this.task.originalMarkdown) {
			const markdownWithoutMarker = this.task.originalMarkdown.replace(
				/^\s*[-*+]\s*\[[^\]]*\]\s*/,
				""
			);
			editableContent = clearAllMarks(markdownWithoutMarker).trim();
		}

		// If still empty, use clearAllMarks on the content
		if (!editableContent && this.task.content) {
			editableContent = clearAllMarks(this.task.content).trim();
		}

		if (this.options.useEmbeddedEditor) {
			this.createEmbeddedEditor(targetEl, editableContent || "");
		} else {
			this.createTextareaEditor(targetEl, editableContent || "");
		}
	}

	private createEmbeddedEditor(targetEl: HTMLElement, content: string): void {
		// Create container for the embedded editor
		const editorContainer = targetEl.createDiv({
			cls: "inline-embedded-editor-container",
		});

		// Prevent event bubbling
		this.registerDomEvent(
			editorContainer,
			"click",
			this.boundHandlers.stopPropagation
		);
		this.registerDomEvent(
			editorContainer,
			"mousedown",
			this.boundHandlers.stopPropagation
		);

		try {
			this.embeddedEditor = createEmbeddableMarkdownEditor(
				this.app,
				editorContainer,
				{
					value: content,
					placeholder: "Enter task content...",
					cls: "inline-embedded-editor",
					onEnter: (editor: any, mod: any, shift: any) => {
						// Save and exit on Enter (regardless of shift)
						this.finishContentEdit(targetEl).catch(console.error);
						return true;
					},
					onEscape: (editor: any) => {
						this.cancelContentEdit(targetEl);
					},
					onBlur: (editor: any) => {
						this.finishContentEdit(targetEl).catch(console.error);
					},
					onChange: (update: any) => {
						// Update task content immediately but don't save
						this.task.content = this.embeddedEditor?.value || "";
					},
				}
			);

			// Focus the editor with better timing
			this.focusEditor();
		} catch (error) {
			console.error(
				"Failed to create embedded editor, falling back to textarea:",
				error
			);
			// Fallback to textarea if embedded editor fails
			editorContainer.remove();
			this.createTextareaEditor(targetEl, content);
		}
	}

	private createTextareaEditor(targetEl: HTMLElement, content: string): void {
		// Create content editor
		this.contentInput = targetEl.createEl("textarea", {
			cls: "inline-content-editor",
		});

		// Prevent event bubbling
		this.registerDomEvent(
			this.contentInput,
			"click",
			this.boundHandlers.stopPropagation
		);
		this.registerDomEvent(
			this.contentInput,
			"mousedown",
			this.boundHandlers.stopPropagation
		);

		// Set the value after creation
		this.contentInput.value = content;

		// Auto-resize textarea
		this.autoResizeTextarea(this.contentInput);

		// Focus and select all text
		this.contentInput.focus();
		this.contentInput.select();

		// Register events with optimized handlers
		this.registerDomEvent(
			this.contentInput,
			"input",
			this.boundHandlers.handleInput
		);
		this.registerDomEvent(
			this.contentInput,
			"blur",
			this.boundHandlers.handleBlur
		);
		this.registerDomEvent(
			this.contentInput,
			"keydown",
			this.boundHandlers.handleKeydown
		);
	}

	/**
	 * Show inline editor for metadata field
	 */
	public showMetadataEditor(
		targetEl: HTMLElement,
		fieldType:
			| "project"
			| "tags"
			| "context"
			| "dueDate"
			| "startDate"
			| "scheduledDate"
			| "priority"
			| "recurrence",
		currentValue?: string
	): void {
		this.initializeEditingState();
		this.isEditing = true;

		targetEl.empty();

		const editorContainer = targetEl.createDiv({
			cls: "inline-metadata-editor",
		});

		// Prevent event bubbling at container level
		this.registerDomEvent(
			editorContainer,
			"click",
			this.boundHandlers.stopPropagation
		);
		this.registerDomEvent(
			editorContainer,
			"mousedown",
			this.boundHandlers.stopPropagation
		);

		console.log("fieldType", fieldType);

		switch (fieldType) {
			case "project":
				this.createProjectEditor(editorContainer, currentValue);
				break;
			case "tags":
				this.createTagsEditor(editorContainer, currentValue);
				break;
			case "context":
				this.createContextEditor(editorContainer, currentValue);
				break;
			case "dueDate":
			case "startDate":
			case "scheduledDate":
				this.createDateEditor(editorContainer, fieldType, currentValue);
				break;
			case "priority":
				this.createPriorityEditor(editorContainer, currentValue);
				break;
			case "recurrence":
				this.createRecurrenceEditor(editorContainer, currentValue);
				break;
		}
	}

	/**
	 * Show add metadata button
	 */
	public showAddMetadataButton(targetEl: HTMLElement): void {
		const addBtn = targetEl.createEl("button", {
			cls: "add-metadata-btn",
			attr: { "aria-label": "Add metadata" },
		});
		setIcon(addBtn, "plus");

		this.registerDomEvent(addBtn, "click", (e) => {
			e.stopPropagation();
			this.showMetadataMenu(addBtn);
		});
	}

	private createProjectEditor(
		container: HTMLElement,
		currentValue?: string
	): void {
		const input = container.createEl("input", {
			type: "text",
			cls: "inline-project-input",
			value: currentValue || "",
			placeholder: "Enter project name",
		});

		this.activeInput = input;

		// Prevent event bubbling on input element
		this.registerDomEvent(
			input,
			"click",
			this.boundHandlers.stopPropagation
		);
		this.registerDomEvent(
			input,
			"mousedown",
			this.boundHandlers.stopPropagation
		);

		const updateProject = (value: string) => {
			this.task.project = value || undefined;
		};

		this.setupInputEvents(input, updateProject, "project");

		// Add autocomplete
		this.activeSuggest = new ProjectSuggest(this.app, input, this.plugin);

		// Focus and select
		input.focus();
		input.select();
	}

	private createTagsEditor(
		container: HTMLElement,
		currentValue?: string
	): void {
		const input = container.createEl("input", {
			type: "text",
			cls: "inline-tags-input",
			value: currentValue || "",
			placeholder: "Enter tags (comma separated)",
		});

		this.activeInput = input;

		// Prevent event bubbling on input element
		this.registerDomEvent(
			input,
			"click",
			this.boundHandlers.stopPropagation
		);
		this.registerDomEvent(
			input,
			"mousedown",
			this.boundHandlers.stopPropagation
		);

		const updateTags = (value: string) => {
			this.task.tags = value
				? value
						.split(",")
						.map((tag) => tag.trim())
						.filter((tag) => tag)
				: [];
		};

		this.setupInputEvents(input, updateTags, "tags");

		// Add autocomplete
		this.activeSuggest = new TagSuggest(this.app, input, this.plugin);

		// Focus and select
		input.focus();
		input.select();
	}

	private createContextEditor(
		container: HTMLElement,
		currentValue?: string
	): void {
		const input = container.createEl("input", {
			type: "text",
			cls: "inline-context-input",
			value: currentValue || "",
			placeholder: "Enter context",
		});

		this.activeInput = input;

		// Prevent event bubbling on input element
		this.registerDomEvent(
			input,
			"click",
			this.boundHandlers.stopPropagation
		);
		this.registerDomEvent(
			input,
			"mousedown",
			this.boundHandlers.stopPropagation
		);

		const updateContext = (value: string) => {
			this.task.context = value || undefined;
		};

		this.setupInputEvents(input, updateContext, "context");

		// Add autocomplete
		this.activeSuggest = new ContextSuggest(this.app, input, this.plugin);

		// Focus and select
		input.focus();
		input.select();
	}

	private createDateEditor(
		container: HTMLElement,
		fieldType: "dueDate" | "startDate" | "scheduledDate",
		currentValue?: string
	): void {
		const input = container.createEl("input", {
			type: "date",
			cls: "inline-date-input",
			value: currentValue || "",
		});

		this.activeInput = input;

		// Prevent event bubbling on input element
		this.registerDomEvent(
			input,
			"click",
			this.boundHandlers.stopPropagation
		);
		this.registerDomEvent(
			input,
			"mousedown",
			this.boundHandlers.stopPropagation
		);

		const updateDate = (value: string) => {
			if (value) {
				const [year, month, day] = value.split("-").map(Number);
				this.task[fieldType] = new Date(year, month - 1, day).getTime();
			} else {
				this.task[fieldType] = undefined;
			}
		};

		this.setupInputEvents(input, updateDate, fieldType);

		// Focus
		input.focus();
	}

	private createPriorityEditor(
		container: HTMLElement,
		currentValue?: string
	): void {
		const select = container.createEl("select", {
			cls: "inline-priority-select",
		});

		// Prevent event bubbling on select element
		this.registerDomEvent(
			select,
			"click",
			this.boundHandlers.stopPropagation
		);
		this.registerDomEvent(
			select,
			"mousedown",
			this.boundHandlers.stopPropagation
		);

		// Add priority options
		const options = [
			{ value: "", text: "None" },
			{ value: "1", text: "⏬️ Lowest" },
			{ value: "2", text: "🔽 Low" },
			{ value: "3", text: "🔼 Medium" },
			{ value: "4", text: "⏫ High" },
			{ value: "5", text: "🔺 Highest" },
		];

		options.forEach((option) => {
			const optionEl = select.createEl("option", {
				value: option.value,
				text: option.text,
			});
		});

		select.value = currentValue || "";
		this.activeInput = select;

		const updatePriority = (value: string) => {
			this.task.priority = value ? parseInt(value) : undefined;
		};

		this.setupInputEvents(select, updatePriority, "priority");

		// Focus
		select.focus();
	}

	private createRecurrenceEditor(
		container: HTMLElement,
		currentValue?: string
	): void {
		const input = container.createEl("input", {
			type: "text",
			cls: "inline-recurrence-input",
			value: currentValue || "",
			placeholder: "e.g. every day, every 2 weeks",
		});

		this.activeInput = input;

		// Prevent event bubbling on input element
		this.registerDomEvent(
			input,
			"click",
			this.boundHandlers.stopPropagation
		);
		this.registerDomEvent(
			input,
			"mousedown",
			this.boundHandlers.stopPropagation
		);

		const updateRecurrence = (value: string) => {
			this.task.recurrence = value || undefined;
		};

		this.setupInputEvents(input, updateRecurrence, "recurrence");

		// Focus and select
		input.focus();
		input.select();
	}

	private setupInputEvents(
		input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
		updateCallback: (value: string) => void,
		fieldType?: string
	): void {
		// Store the field type for later use
		(input as any)._fieldType = fieldType;
		(input as any)._updateCallback = updateCallback;

		this.registerDomEvent(input, "input", this.boundHandlers.handleInput);
		this.registerDomEvent(input, "blur", this.boundHandlers.handleBlur);
		this.registerDomEvent(
			input,
			"keydown",
			this.boundHandlers.handleKeydown
		);
	}

	// Optimized event handlers
	private handleInput(e: Event): void {
		const target = e.target as HTMLInputElement | HTMLTextAreaElement;

		if (target === this.contentInput) {
			// Auto-resize textarea
			this.autoResizeTextarea(target as HTMLTextAreaElement);
			// Update task content immediately but don't save
			this.task.content = target.value;
		} else if (target === this.activeInput) {
			// Handle metadata input
			const updateCallback = (target as any)._updateCallback;
			if (updateCallback) {
				updateCallback(target.value);
				this.debouncedSave?.();
			}
		}
	}

	private handleBlur(e: FocusEvent): void {
		const target = e.target as
			| HTMLInputElement
			| HTMLSelectElement
			| HTMLTextAreaElement;

		// Check if focus is moving to another element within our editor
		const relatedTarget = e.relatedTarget as HTMLElement;
		if (relatedTarget && this.containerEl?.contains(relatedTarget)) {
			return; // Don't finish edit if focus is staying within our editor
		}

		// For content editing, finish the edit
		if (target === this.contentInput && this.isEditing) {
			const contentEl = target.closest(
				".task-item-content"
			) as HTMLElement;
			if (contentEl) {
				this.finishContentEdit(contentEl).catch(console.error);
			}
			return;
		}

		// For metadata editing, finish the specific metadata edit
		if (target === this.activeInput && this.isEditing) {
			const fieldType = (target as any)._fieldType;
			const targetEl = target.closest(".inline-metadata-editor")
				?.parentElement as HTMLElement;
			if (targetEl && fieldType) {
				this.finishMetadataEdit(targetEl, fieldType).catch(
					console.error
				);
			}
		}
	}

	private handleKeydown(e: KeyboardEvent): void {
		if (e.key === "Escape") {
			const target = e.target as HTMLElement;

			if (target === this.contentInput) {
				const contentEl = target.closest(
					".task-item-content"
				) as HTMLElement;
				if (contentEl) {
					this.cancelContentEdit(contentEl);
				}
			} else if (target === this.activeInput) {
				const targetEl = target.closest(".inline-metadata-editor")
					?.parentElement as HTMLElement;
				if (targetEl) {
					this.cancelMetadataEdit(targetEl);
				}
			}
		} else if (e.key === "Enter" && !e.shiftKey) {
			const target = e.target as HTMLElement;

			if (target === this.activeInput) {
				e.preventDefault();
				const fieldType = (target as any)._fieldType;
				const targetEl = target.closest(".inline-metadata-editor")
					?.parentElement as HTMLElement;
				if (targetEl && fieldType) {
					this.finishMetadataEdit(targetEl, fieldType).catch(
						console.error
					);
				}
			}
			// For content editing, let the embedded editor handle Enter
		}
	}

	private autoResizeTextarea(textarea: HTMLTextAreaElement): void {
		textarea.style.height = "auto";
		textarea.style.height = textarea.scrollHeight + "px";
	}

	private focusEditor(): void {
		// Use requestAnimationFrame for better timing
		requestAnimationFrame(() => {
			if (this.embeddedEditor?.activeCM) {
				this.embeddedEditor.activeCM.focus();
				// Select all text
				this.embeddedEditor.activeCM.dispatch({
					selection: {
						anchor: 0,
						head: this.embeddedEditor.value.length,
					},
				});
			}
		});
	}

	private showMetadataMenu(buttonEl: HTMLElement): void {
		const menu = new Menu();

		const availableFields = [
			{ key: "project", label: "Project", icon: "folder" },
			{ key: "tags", label: "Tags", icon: "tag" },
			{ key: "context", label: "Context", icon: "at-sign" },
			{ key: "dueDate", label: "Due Date", icon: "calendar" },
			{ key: "startDate", label: "Start Date", icon: "play" },
			{ key: "scheduledDate", label: "Scheduled Date", icon: "clock" },
			{ key: "priority", label: "Priority", icon: "alert-triangle" },
			{ key: "recurrence", label: "Recurrence", icon: "repeat" },
		];

		// Filter out fields that already have values
		const fieldsToShow = availableFields.filter((field) => {
			switch (field.key) {
				case "project":
					return !this.task.project;
				case "tags":
					return !this.task.tags || this.task.tags.length === 0;
				case "context":
					return !this.task.context;
				case "dueDate":
					return !this.task.dueDate;
				case "startDate":
					return !this.task.startDate;
				case "scheduledDate":
					return !this.task.scheduledDate;
				case "priority":
					return !this.task.priority;
				case "recurrence":
					return !this.task.recurrence;
				default:
					return true;
			}
		});

		console.log("fieldsToShow", fieldsToShow);

		// If no fields are available to add, show a message
		if (fieldsToShow.length === 0) {
			menu.addItem((item) => {
				item.setTitle(
					"All metadata fields are already set"
				).setDisabled(true);
			});
		} else {
			fieldsToShow.forEach((field) => {
				menu.addItem((item) => {
					item.setTitle(field.label)
						.setIcon(field.icon)
						.onClick(() => {
							this.showMetadataEditor(
								buttonEl.parentElement!,
								field.key as any
							);
						});
				});
			});
		}

		menu.showAtPosition({
			x: buttonEl.getBoundingClientRect().left,
			y: buttonEl.getBoundingClientRect().bottom,
		});
	}

	private async saveTask(): Promise<boolean> {
		if (!this.isEditing || !this.originalTask || this.isSaving) {
			return false;
		}

		// Check if there are actual changes
		const hasChanges = this.hasTaskChanges(this.originalTask, this.task);
		if (!hasChanges) {
			console.log("No changes detected, skipping save");
			return true;
		}

		console.log("Content comparison:", {
			original: this.originalTask.content,
			current: this.task.content,
			changed: this.originalTask.content !== this.task.content,
		});

		this.isSaving = true;
		try {
			await this.options.onTaskUpdate(this.originalTask, this.task);
			console.log("Task update successful");
			this.originalTask = { ...this.task };
			return true;
		} catch (error) {
			console.error("Failed to save task:", error);
			// Revert changes on error
			this.task = { ...this.originalTask };
			return false;
		} finally {
			this.isSaving = false;
		}
	}

	private hasTaskChanges(originalTask: Task, updatedTask: Task): boolean {
		// Compare key properties that can be edited
		const compareProps = [
			"content",
			"project",
			"tags",
			"context",
			"priority",
			"dueDate",
			"startDate",
			"scheduledDate",
			"recurrence",
		];

		for (const prop of compareProps) {
			const originalValue = (originalTask as any)[prop];
			const updatedValue = (updatedTask as any)[prop];

			// Handle array comparison for tags
			if (prop === "tags") {
				const originalTags = Array.isArray(originalValue)
					? originalValue
					: [];
				const updatedTags = Array.isArray(updatedValue)
					? updatedValue
					: [];

				if (originalTags.length !== updatedTags.length) {
					return true;
				}

				for (let i = 0; i < originalTags.length; i++) {
					if (originalTags[i] !== updatedTags[i]) {
						return true;
					}
				}
			} else {
				// Simple value comparison
				if (originalValue !== updatedValue) {
					return true;
				}
			}
		}

		return false;
	}

	private async finishContentEdit(targetEl: HTMLElement): Promise<void> {
		// Prevent multiple concurrent saves
		if (this.isSaving) {
			console.log("Save already in progress, waiting...");
			// Wait for current save to complete
			while (this.isSaving) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		}

		// Get final content from the appropriate editor
		if (this.embeddedEditor) {
			this.task.content = this.embeddedEditor.value;
		} else if (this.contentInput) {
			this.task.content = this.contentInput.value;
		}

		// Save the task and wait for completion
		const saveSuccess = await this.saveTask();

		if (!saveSuccess) {
			console.error("Failed to save task, not finishing edit");
			return;
		}

		// Only proceed with cleanup after successful save
		this.isEditing = false;

		// Clean up embedded editor
		this.cleanupEditors();

		// Notify parent component to restore content display
		// Pass the updated task so parent can update its reference
		if (this.options.onContentEditFinished) {
			this.options.onContentEditFinished(targetEl, this.task);
		} else {
			// Fallback: just set text content
			targetEl.textContent = this.task.content;
		}

		// Release this editor back to the manager
		this.releaseFromManager();
	}

	private cancelContentEdit(targetEl: HTMLElement): void {
		this.isEditing = false;
		// Revert changes
		if (this.originalTask) {
			this.task.content = this.originalTask.content;
		}

		// Clean up embedded editor
		this.cleanupEditors();

		// Notify parent component to restore content display
		if (this.options.onContentEditFinished) {
			this.options.onContentEditFinished(targetEl, this.task);
		} else {
			// Fallback: just set text content
			targetEl.textContent = this.task.content;
		}

		// Release this editor back to the manager
		this.releaseFromManager();
	}

	private async finishMetadataEdit(
		targetEl: HTMLElement,
		fieldType: string
	): Promise<void> {
		// Prevent multiple concurrent saves
		if (this.isSaving) {
			console.log("Save already in progress, waiting...");
			while (this.isSaving) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		}

		// Save the task and wait for completion
		const saveSuccess = await this.saveTask();

		if (!saveSuccess) {
			console.error("Failed to save task metadata, not finishing edit");
			return;
		}

		// Clean up editors first
		this.cleanupEditors();

		// Reset editing state
		this.isEditing = false;
		this.originalTask = null;

		// Restore the metadata display
		targetEl.empty();
		this.restoreMetadataDisplay(targetEl, fieldType);

		// Notify parent component about metadata edit completion
		if (this.options.onMetadataEditFinished) {
			this.options.onMetadataEditFinished(targetEl, this.task, fieldType);
		}

		// Release this editor back to the manager
		this.releaseFromManager();
	}

	private cancelMetadataEdit(targetEl: HTMLElement): void {
		// Get field type before cleanup
		const fieldType = this.activeInput
			? (this.activeInput as any)._fieldType
			: null;

		// Revert changes
		if (this.originalTask) {
			this.task = { ...this.originalTask };
		}

		// Clean up editors first
		this.cleanupEditors();

		// Reset editing state
		this.isEditing = false;
		this.originalTask = null;

		// Restore the original metadata display
		if (fieldType) {
			targetEl.empty();
			this.restoreMetadataDisplay(targetEl, fieldType);
		}

		// Notify parent component about metadata edit completion (even if cancelled)
		if (this.options.onMetadataEditFinished && fieldType) {
			this.options.onMetadataEditFinished(targetEl, this.task, fieldType);
		}

		// Release this editor back to the manager
		this.releaseFromManager();
	}

	private restoreMetadataDisplay(
		targetEl: HTMLElement,
		fieldType: string
	): void {
		// Restore the appropriate metadata display based on field type
		switch (fieldType) {
			case "project":
				if (this.task.project) {
					targetEl.textContent =
						this.task.project.split("/").pop() || this.task.project;
					targetEl.className = "task-project";
				}
				break;
			case "tags":
				if (this.task.tags && this.task.tags.length > 0) {
					targetEl.className = "task-tags-container";
					this.task.tags
						.filter((tag) => !tag.startsWith("#project"))
						.forEach((tag) => {
							const tagEl = targetEl.createEl("span", {
								cls: "task-tag",
								text: tag.startsWith("#") ? tag : `#${tag}`,
							});
						});
				}
				break;
			case "context":
				if (this.task.context) {
					targetEl.textContent = this.task.context;
					targetEl.className = "task-context";
				}
				break;
			case "dueDate":
			case "startDate":
			case "scheduledDate":
				const dateValue = this.task[fieldType as keyof Task] as number;
				if (dateValue) {
					const date = new Date(dateValue);
					targetEl.textContent = date.toLocaleDateString("en-US", {
						year: "numeric",
						month: "long",
						day: "numeric",
					});
					targetEl.className = `task-date task-${fieldType}`;
				}
				break;
			case "recurrence":
				if (this.task.recurrence) {
					targetEl.textContent = this.task.recurrence;
					targetEl.className = "task-date task-recurrence";
				}
				break;
			case "priority":
				if (this.task.priority) {
					targetEl.textContent = "!".repeat(this.task.priority);
					targetEl.className = `task-priority priority-${this.task.priority}`;
				}
				break;
		}
	}

	private cleanupEditors(): void {
		// Clean up embedded editor
		if (this.embeddedEditor) {
			this.embeddedEditor.destroy();
			this.embeddedEditor = null;
		}

		// Clean up active input and suggest
		if (this.activeSuggest) {
			// Clean up suggest if it has a cleanup method
			if (typeof this.activeSuggest.close === "function") {
				this.activeSuggest.close();
			}
			this.activeSuggest = null;
		}

		this.activeInput = null;
		this.contentInput = null;
	}

	public isCurrentlyEditing(): boolean {
		return this.isEditing;
	}

	public getUpdatedTask(): Task {
		return this.task;
	}

	/**
	 * Update the task and options for reusing this editor instance
	 */
	public updateTask(task: Task, options: InlineEditorOptions): void {
		this.task = task;
		this.options = options;
		this.originalTask = null; // Reset original task
		this.isEditing = false;
		this.cleanupEditors();
	}

	/**
	 * Reset the editor state for pooling
	 */
	public reset(): void {
		this.isEditing = false;
		this.originalTask = null;
		this.isSaving = false;
		this.cleanupEditors();
		// Reset task to a clean state
		this.task = {} as Task;
	}

	onunload() {
		this.cleanupEditors();

		if (this.containerEl) {
			this.containerEl.remove();
		}
	}

	/**
	 * Release this editor back to the manager
	 */
	private releaseFromManager(): void {
		// Reset all editing states to ensure clean state for next use
		this.isEditing = false;
		this.originalTask = null;
		this.isSaving = false;

		// This will be called by the component that owns the editor manager
		// The actual release to manager will be handled by the calling component
	}
}
