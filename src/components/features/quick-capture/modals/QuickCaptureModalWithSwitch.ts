import {
	App,
	Setting,
	TFile,
	Notice,
	Platform,
	MarkdownRenderer,
	moment,
} from "obsidian";
import {
	createEmbeddableMarkdownEditor,
	EmbeddableMarkdownEditor,
} from "@/editor-extensions/core/markdown-editor";
import TaskProgressBarPlugin from "@/index";
import { FileSuggest } from "@/components/ui/inputs/AutoComplete";
import { t } from "@/translations/helper";
import { MarkdownRendererComponent } from "@/components/ui/renderers/MarkdownRenderer";
import { StatusComponent } from "@/components/ui/feedback/StatusIndicator";
import { Task } from "@/types/task";
import {
	ContextSuggest,
	ProjectSuggest,
} from "@/components/ui/inputs/AutoComplete";
import {
	TimeParsingService,
	DEFAULT_TIME_PARSING_CONFIG,
	LineParseResult,
} from "@/services/time-parsing-service";
import { UniversalEditorSuggest } from "@/components/ui/suggest";
import {
	BaseQuickCaptureModal,
	QuickCaptureMode,
	TaskMetadata,
} from "./BaseQuickCaptureModal";
import { FileNameInput } from "../components/FileNameInput";

const LAST_USED_MODE_KEY = "task-genius.lastUsedQuickCaptureMode";

/**
 * Enhanced Quick Capture Modal extending the base class
 */
export class QuickCaptureModal extends BaseQuickCaptureModal {
	// Full mode specific elements
	private previewContainerEl: HTMLElement | null = null;
	private previewMarkdownEl: HTMLElement | null = null;
	private previewPlainEl: HTMLElement | null = null;
	private markdownRenderer: MarkdownRendererComponent | null = null;
	public timeParsingService: TimeParsingService;
	private universalSuggest: UniversalEditorSuggest | null = null;

	// Date input references
	private startDateInput?: HTMLInputElement;
	private dueDateInput?: HTMLInputElement;
	private scheduledDateInput?: HTMLInputElement;

	// File name input for file creation mode
	private fileNameInput: FileNameInput | null = null;

	// UI element references
	private targetSectionContainer: HTMLElement | null = null;
	private configPanel: HTMLElement | null = null;
	private metadataContainer: HTMLElement | null = null;

	// Debounce timer for real-time parsing
	private parseDebounceTimer?: number;

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		metadata?: TaskMetadata,
		useFullFeaturedMode: boolean = false,
	) {
		// Determine initial mode from local storage, default to checkbox
		let initialMode: QuickCaptureMode = "checkbox";
		try {
			const stored = app.loadLocalStorage(LAST_USED_MODE_KEY) as
				| string
				| null;
			if (stored === "checkbox" || stored === "file")
				initialMode = stored;
		} catch {}

		super(app, plugin, initialMode, metadata);

		// Initialize time parsing service
		this.timeParsingService = new TimeParsingService(
			this.plugin.settings.timeParsing || DEFAULT_TIME_PARSING_CONFIG,
		);
	}

	/**
	 * Initialize components after UI creation
	 */
	protected initializeComponents(): void {
		// Setup markdown editor only if not already initialized
		if (this.contentContainer && !this.markdownEditor) {
			const editorContainer = this.contentContainer.querySelector(
				".quick-capture-modal-editor",
			) as HTMLElement;
			if (editorContainer) {
				this.setupMarkdownEditor(editorContainer);
			}

			// Enable universal suggest after editor is created
			setTimeout(() => {
				if (this.markdownEditor?.editor?.editor) {
					this.universalSuggest =
						this.suggestManager.enableForQuickCaptureModal(
							this.markdownEditor.editor.editor,
						);
					this.universalSuggest.enable();
				}
			}, 100);
		}

		// Restore content if switching modes
		if (this.markdownEditor && this.capturedContent) {
			this.markdownEditor.set(this.capturedContent, false);
		}
	}

	/**
	 * Create UI - consistent layout for both modes
	 */
	protected createUI(): void {
		if (!this.contentContainer) return;

		// Create a layout container with two panels
		const layoutContainer = this.contentContainer.createDiv({
			cls: "quick-capture-layout",
		});

		// Create left panel for configuration
		const configPanel = layoutContainer.createDiv({
			cls: "quick-capture-config-panel",
		});

		// Create right panel for editor
		const editorPanel = layoutContainer.createDiv({
			cls: "quick-capture-editor-panel",
		});

		// Store config panel reference for updating
		this.configPanel = configPanel;

		// Create target section (will be updated based on mode)
		this.createTargetSection(configPanel);

		// Task metadata configuration (always shown)
		this.metadataContainer = configPanel.createDiv({
			cls: "quick-capture-metadata-container",
		});
		this.createTaskMetadataConfig(this.metadataContainer);

		// Create editor in right panel
		editorPanel.createDiv({
			text:
				this.currentMode === "file"
					? t("File Content")
					: t("Task Content"),
			cls: "quick-capture-section-title",
		});

		const editorContainer = editorPanel.createDiv({
			cls: "quick-capture-modal-editor",
		});

		// Preview container (available for both modes)
		this.previewContainerEl = editorPanel.createDiv({
			cls: "preview-container",
		});

		// Create separate containers for markdown (checkbox mode) and plain text (file mode)
		this.previewMarkdownEl = this.previewContainerEl.createDiv({
			cls: "preview-markdown",
		});
		this.previewPlainEl = this.previewContainerEl.createEl("pre", {
			cls: "preview-plain tg-file-preview",
		});

		// Only instantiate MarkdownRenderer in checkbox mode
		if (this.currentMode === "checkbox") {
			this.markdownRenderer = new MarkdownRendererComponent(
				this.app,
				this.previewMarkdownEl,
				"",
				false,
			);
		}

		// Set initial visibility based on mode
		if (this.previewMarkdownEl && this.previewPlainEl) {
			this.previewMarkdownEl.style.display =
				this.currentMode === "checkbox" ? "block" : "none";
			this.previewPlainEl.style.display =
				this.currentMode === "checkbox" ? "none" : "block";
		}
	}

	/**
	 * Create target section that will be updated based on mode
	 */
	private createTargetSection(container: HTMLElement): void {
		this.targetSectionContainer = container.createDiv({
			cls: "quick-capture-target-container",
		});

		// Initial display based on current mode
		this.updateTargetDisplay();
	}

	/**
	 * Update target display based on current mode
	 */
	protected updateTargetDisplay(): void {
		if (!this.targetSectionContainer) return;

		// Clear existing content
		this.targetSectionContainer.empty();

		if (this.currentMode === "checkbox") {
			// Checkbox mode: "Capture to: [target file]"
			this.createTargetFileSelector(this.targetSectionContainer);
		} else {
			// File mode: "Capture as: [file name input]"
			this.createFileNameSelector(this.targetSectionContainer);
		}

		// Update metadata section visibility
		if (this.metadataContainer) {
			this.metadataContainer.style.display = "block";
			if (this.metadataContainer.children.length === 0) {
				this.createTaskMetadataConfig(this.metadataContainer);
			}
		}

		// Update editor title
		const editorTitle = this.contentContainer?.querySelector(
			".quick-capture-section-title",
		);
		if (editorTitle) {
			editorTitle.setText(
				this.currentMode === "file"
					? t("File Content")
					: t("Task Content"),
			);
		}

		// Update preview visibility by toggling child containers
		if (this.previewMarkdownEl && this.previewPlainEl) {
			this.previewMarkdownEl.style.display =
				this.currentMode === "checkbox" ? "block" : "none";
			this.previewPlainEl.style.display =
				this.currentMode === "checkbox" ? "none" : "block";
		}
		// Ensure preview refresh after switching mode/target
		this.updatePreview();
	}

	/**
	 * Create file name selector for file mode
	 */
	private createFileNameSelector(container: HTMLElement): void {
		const fileNameContainer = container;

		fileNameContainer.createDiv({
			text: t("Capture as:"),
			cls: "quick-capture-section-title",
		});

		// Destroy previous file name input if exists
		if (this.fileNameInput) {
			this.fileNameInput.destroy();
			this.fileNameInput = null;
		}

		// Create new file name input
		this.fileNameInput = new FileNameInput(
			this.app,
			this.plugin,
			fileNameContainer,
			{
				placeholder: t("Enter file name..."),
				defaultValue:
					this.plugin.settings.quickCapture.defaultFileNameTemplate ||
					"{{DATE:YYYY-MM-DD}} - Task",
				currentFolder:
					this.plugin.settings.quickCapture.createFileMode
						?.defaultFolder,
				onChange: (value) => {
					this.taskMetadata.customFileName = value;
				},
			},
		);

		// Set initial value if exists
		if (this.taskMetadata.customFileName) {
			this.fileNameInput.setValue(this.taskMetadata.customFileName);
		}
	}

	/**
	 * Create target file selector
	 */
	private createTargetFileSelector(container: HTMLElement): void {
		const targetFileContainer = container.createDiv({
			cls: "quick-capture-target-container",
		});

		targetFileContainer.createDiv({
			text: t("Capture to:"),
			cls: "quick-capture-section-title",
		});

		const targetFileEl = targetFileContainer.createEl("div", {
			cls: "quick-capture-target",
			attr: {
				contenteditable:
					this.plugin.settings.quickCapture.targetType === "fixed"
						? "true"
						: "false",
				spellcheck: "false",
			},
			text: this.tempTargetFilePath,
		});

		// Only add file suggest for fixed file type
		if (this.plugin.settings.quickCapture.targetType === "fixed") {
			new FileSuggest(
				this.app,
				targetFileEl,
				this.plugin.settings.quickCapture,
				(file: TFile) => {
					targetFileEl.textContent = file.path;
					this.tempTargetFilePath = file.path;
					this.markdownEditor?.editor?.focus();
				},
			);
		}
	}

	/**
	 * Create task metadata configuration
	 */
	private createTaskMetadataConfig(container: HTMLElement): void {
		container.createDiv({
			text: t("Task Properties"),
			cls: "quick-capture-section-title",
		});

		// Status component
		const statusComponent = new StatusComponent(
			this.plugin,
			container,
			{
				status: this.taskMetadata.status,
			} as Task,
			{
				type: "quick-capture",
				onTaskStatusSelected: (status: string) => {
					this.taskMetadata.status = status;
					this.updatePreview();
				},
			},
		);
		statusComponent.load();

		// Date inputs
		this.createDateInputs(container);

		// Priority selector
		this.createPrioritySelector(container);

		// Project input
		this.createProjectInput(container);

		// Context input
		this.createContextInput(container);

		// Recurrence input
		this.createRecurrenceInput(container);
	}

	/**
	 * Create date inputs
	 */
	private createDateInputs(container: HTMLElement): void {
		// Start Date
		new Setting(container).setName(t("Start Date")).addText((text) => {
			text.setPlaceholder("YYYY-MM-DD")
				.setValue(
					this.taskMetadata.startDate
						? this.formatDate(this.taskMetadata.startDate)
						: "",
				)
				.onChange((value) => {
					if (value) {
						this.taskMetadata.startDate = this.parseDate(value);
						this.markAsManuallySet("startDate");
					} else {
						this.taskMetadata.startDate = undefined;
						if (this.taskMetadata.manuallySet) {
							this.taskMetadata.manuallySet.startDate = false;
						}
					}
					this.updatePreview();
				});
			text.inputEl.type = "date";
			this.startDateInput = text.inputEl;
		});

		// Due Date
		new Setting(container).setName(t("Due Date")).addText((text) => {
			text.setPlaceholder("YYYY-MM-DD")
				.setValue(
					this.taskMetadata.dueDate
						? this.formatDate(this.taskMetadata.dueDate)
						: "",
				)
				.onChange((value) => {
					if (value) {
						this.taskMetadata.dueDate = this.parseDate(value);
						this.markAsManuallySet("dueDate");
					} else {
						this.taskMetadata.dueDate = undefined;
						if (this.taskMetadata.manuallySet) {
							this.taskMetadata.manuallySet.dueDate = false;
						}
					}
					this.updatePreview();
				});
			text.inputEl.type = "date";
			this.dueDateInput = text.inputEl;
		});

		// Scheduled Date
		new Setting(container).setName(t("Scheduled Date")).addText((text) => {
			text.setPlaceholder("YYYY-MM-DD")
				.setValue(
					this.taskMetadata.scheduledDate
						? this.formatDate(this.taskMetadata.scheduledDate)
						: "",
				)
				.onChange((value) => {
					if (value) {
						this.taskMetadata.scheduledDate = this.parseDate(value);
						this.markAsManuallySet("scheduledDate");
					} else {
						this.taskMetadata.scheduledDate = undefined;
						if (this.taskMetadata.manuallySet) {
							this.taskMetadata.manuallySet.scheduledDate = false;
						}
					}
					this.updatePreview();
				});
			text.inputEl.type = "date";
			this.scheduledDateInput = text.inputEl;
		});
	}

	/**
	 * Create priority selector
	 */
	private createPrioritySelector(container: HTMLElement): void {
		new Setting(container)
			.setName(t("Priority"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("", t("None"))
					.addOption("5", t("Highest"))
					.addOption("4", t("High"))
					.addOption("3", t("Medium"))
					.addOption("2", t("Low"))
					.addOption("1", t("Lowest"))
					.setValue(this.taskMetadata.priority?.toString() || "")
					.onChange((value) => {
						this.taskMetadata.priority = value
							? parseInt(value)
							: undefined;
						this.updatePreview();
					});
			});
	}

	/**
	 * Create project input
	 */
	private createProjectInput(container: HTMLElement): void {
		new Setting(container).setName(t("Project")).addText((text) => {
			new ProjectSuggest(this.app, text.inputEl, this.plugin);
			text.setPlaceholder(t("Project name"))
				.setValue(this.taskMetadata.project || "")
				.onChange((value) => {
					this.taskMetadata.project = value || undefined;
					this.updatePreview();
				});
		});
	}

	/**
	 * Create context input
	 */
	private createContextInput(container: HTMLElement): void {
		new Setting(container).setName(t("Context")).addText((text) => {
			new ContextSuggest(this.app, text.inputEl, this.plugin);
			text.setPlaceholder(t("Context"))
				.setValue(this.taskMetadata.context || "")
				.onChange((value) => {
					this.taskMetadata.context = value || undefined;
					this.updatePreview();
				});
		});
	}

	/**
	 * Create recurrence input
	 */
	private createRecurrenceInput(container: HTMLElement): void {
		new Setting(container).setName(t("Recurrence")).addText((text) => {
			text.setPlaceholder(t("e.g., every day, every week"))
				.setValue(this.taskMetadata.recurrence || "")
				.onChange((value) => {
					this.taskMetadata.recurrence = value || undefined;
					this.updatePreview();
				});
		});
	}

	/**
	 * Setup markdown editor
	 */
	private setupMarkdownEditor(container: HTMLElement): void {
		setTimeout(() => {
			this.markdownEditor = createEmbeddableMarkdownEditor(
				this.app,
				container,
				{
					placeholder: this.plugin.settings.quickCapture.placeholder,
					singleLine: this.currentMode === "checkbox",

					onEnter: (editor, mod, shift) => {
						if (mod) {
							this.handleSubmit();
							return true;
						}
						// In checkbox mode, Enter submits
						if (this.currentMode === "checkbox") {
							this.handleSubmit();
							return true;
						}
						return false;
					},

					onEscape: (editor) => {
						this.close();
					},

					onSubmit: (editor) => {
						this.handleSubmit();
					},

					onChange: (update) => {
						this.capturedContent = this.markdownEditor?.value || "";

						// Clear previous debounce timer
						if (this.parseDebounceTimer) {
							clearTimeout(this.parseDebounceTimer);
						}

						// Debounce time parsing for both modes
						this.parseDebounceTimer = window.setTimeout(() => {
							this.performRealTimeParsing();
						}, 300);

						// Update preview in both modes
						this.updatePreview();
					},
				},
			);

			// Focus the editor
			this.markdownEditor?.editor?.focus();

			// Restore content if exists
			if (this.capturedContent && this.markdownEditor) {
				this.markdownEditor.set(this.capturedContent, false);
			}
		}, 50);
	}

	/**
	 * Update preview
	 */
	private updatePreview(): void {
		if (this.currentMode === "checkbox") {
			if (this.markdownRenderer) {
				this.markdownRenderer.render(
					this.processContentWithMetadata(this.capturedContent),
				);
			}
		} else {
			if (this.previewPlainEl) {
				const snapshot = this.capturedContent;
				this.computeFileModePreviewContent(snapshot).then(
					(finalContent) => {
						if (
							this.previewPlainEl &&
							this.capturedContent === snapshot
						) {
							this.previewPlainEl.textContent = finalContent;
						}
					},
				);
			}
		}
	}

	/**
	 * Build preview content for file mode by mirroring saveContent's file-mode processing
	 */
	private async computeFileModePreviewContent(
		content: string,
	): Promise<string> {
		const processedContent = this.processContentWithMetadata(content);
		return this.buildFileModeContent(content, processedContent, {
			preview: true,
		});
	}

	/**
	 * Process content with metadata
	 */
	protected processContentWithMetadata(content: string): string {
		// For file mode, just return content as-is
		if (this.currentMode === "file") {
			return content;
		}

		// Split content into lines
		const lines = content.split("\n");
		const processedLines: string[] = [];

		for (const line of lines) {
			if (!line.trim()) {
				processedLines.push(line);
				continue;
			}

			// Parse time expressions for this line
			const lineParseResult =
				this.timeParsingService.parseTimeExpressionsForLine(line);
			const cleanedLine = lineParseResult.cleanedLine;

			// Check for indentation
			const indentMatch = line.match(/^(\s+)/);
			const isSubTask = indentMatch && indentMatch[1].length > 0;

			// Check if line is already a task or list item
			const isTaskOrList = cleanedLine
				.trim()
				.match(/^(-|\d+\.|\*|\+)(\s+\[[^\]\[]+\])?/);

			if (isSubTask) {
				// Don't add metadata to sub-tasks
				const originalIndent = indentMatch[1];
				processedLines.push(
					originalIndent +
						this.cleanTemporaryMarks(cleanedLine.trim()),
				);
			} else if (isTaskOrList) {
				// Process as task
				if (cleanedLine.trim().match(/^(-|\d+\.|\*|\+)\s+\[[^\]]+\]/)) {
					processedLines.push(
						this.addLineMetadataToTask(
							cleanedLine,
							lineParseResult,
						),
					);
				} else {
					// Convert to task
					const listPrefix = cleanedLine
						.trim()
						.match(/^(-|\d+\.|\*|\+)/)?.[0];
					const restOfLine = this.cleanTemporaryMarks(
						cleanedLine
							.trim()
							.substring(listPrefix?.length || 0)
							.trim(),
					);
					const statusMark = this.taskMetadata.status || " ";
					const taskLine = `${listPrefix} [${statusMark}] ${restOfLine}`;
					processedLines.push(
						this.addLineMetadataToTask(taskLine, lineParseResult),
					);
				}
			} else {
				// Convert to task
				const statusMark = this.taskMetadata.status || " ";
				const cleanedContent = this.cleanTemporaryMarks(cleanedLine);
				const taskLine = `- [${statusMark}] ${cleanedContent}`;
				processedLines.push(
					this.addLineMetadataToTask(taskLine, lineParseResult),
				);
			}
		}

		return processedLines.join("\n");
	}

	/**
	 * Add line metadata to task
	 */
	private addLineMetadataToTask(
		taskLine: string,
		lineParseResult: LineParseResult,
	): string {
		const metadata = this.generateLineMetadata(lineParseResult);
		if (!metadata) return taskLine;
		return `${taskLine} ${metadata}`.trim();
	}

	/**
	 * Generate line metadata
	 */
	private generateLineMetadata(lineParseResult: LineParseResult): string {
		const metadata: string[] = [];
		const useDataviewFormat = this.preferMetadataFormat === "dataview";

		// Use line-specific dates first, fall back to global metadata
		const startDate =
			lineParseResult.startDate || this.taskMetadata.startDate;
		const dueDate = lineParseResult.dueDate || this.taskMetadata.dueDate;
		const scheduledDate =
			lineParseResult.scheduledDate || this.taskMetadata.scheduledDate;

		// Add dates
		if (startDate) {
			const formattedDate = this.formatDate(startDate);
			metadata.push(
				useDataviewFormat
					? `[start:: ${formattedDate}]`
					: `🛫 ${formattedDate}`,
			);
		}
		if (dueDate) {
			const formattedDate = this.formatDate(dueDate);
			metadata.push(
				useDataviewFormat
					? `[due:: ${formattedDate}]`
					: `📅 ${formattedDate}`,
			);
		}
		if (scheduledDate) {
			const formattedDate = this.formatDate(scheduledDate);
			metadata.push(
				useDataviewFormat
					? `[scheduled:: ${formattedDate}]`
					: `⏳ ${formattedDate}`,
			);
		}

		// Add priority
		if (this.taskMetadata.priority) {
			if (useDataviewFormat) {
				const priorityMap: { [key: number]: string } = {
					5: "highest",
					4: "high",
					3: "medium",
					2: "low",
					1: "lowest",
				};
				metadata.push(
					`[priority:: ${priorityMap[this.taskMetadata.priority]}]`,
				);
			} else {
				const priorityIcons = ["⏬", "🔽", "🔼", "⏫", "🔺"];
				metadata.push(priorityIcons[this.taskMetadata.priority - 1]);
			}
		}

		// Add project
		if (this.taskMetadata.project) {
			const projectPrefix =
				this.plugin.settings.projectTagPrefix?.[
					this.plugin.settings.preferMetadataFormat
				] || "project";
			metadata.push(
				useDataviewFormat
					? `[${projectPrefix}:: ${this.taskMetadata.project}]`
					: `#${projectPrefix}/${this.taskMetadata.project}`,
			);
		}

		// Add context
		if (this.taskMetadata.context) {
			const contextPrefix =
				this.plugin.settings.contextTagPrefix?.[
					this.plugin.settings.preferMetadataFormat
				] || "@";
			metadata.push(
				useDataviewFormat
					? `[context:: ${this.taskMetadata.context}]`
					: `${contextPrefix}${this.taskMetadata.context}`,
			);
		}

		// Add recurrence
		if (this.taskMetadata.recurrence) {
			metadata.push(
				useDataviewFormat
					? `[repeat:: ${this.taskMetadata.recurrence}]`
					: `🔁 ${this.taskMetadata.recurrence}`,
			);
		}

		return metadata.join(" ");
	}

	/**
	 * Clean temporary marks
	 */
	private cleanTemporaryMarks(content: string): string {
		let cleaned = content;
		cleaned = cleaned.replace(/\s*!\s*/g, " ");
		cleaned = cleaned.replace(/\s*~\s*/g, " ");
		cleaned = cleaned.replace(/\s*[🔺⏫🔼🔽⏬️]\s*/g, " ");
		cleaned = cleaned.replace(/\s*[📅🛫⏳✅➕❌]\s*/g, " ");
		cleaned = cleaned.replace(/\s*[📁🏠🏢🏪🏫🏬🏭🏯🏰]\s*/g, " ");
		cleaned = cleaned.replace(/\s*[🆔⛔🏁🔁]\s*/g, " ");
		cleaned = cleaned.replace(/\s*@\w*\s*/g, " ");
		cleaned = cleaned.replace(/\s*target:\s*/gi, " ");
		cleaned = cleaned.replace(/\s+/g, " ").trim();
		return cleaned;
	}

	/**
	 * Perform real-time parsing
	 */
	private performRealTimeParsing(): void {
		if (!this.capturedContent) return;

		const lines = this.capturedContent.split("\n");
		const lineParseResults =
			this.timeParsingService.parseTimeExpressionsPerLine(lines);

		// Aggregate dates from all lines
		let aggregatedStartDate: Date | undefined;
		let aggregatedDueDate: Date | undefined;
		let aggregatedScheduledDate: Date | undefined;

		for (const lineResult of lineParseResults) {
			if (lineResult.startDate && !aggregatedStartDate) {
				aggregatedStartDate = lineResult.startDate;
			}
			if (lineResult.dueDate && !aggregatedDueDate) {
				aggregatedDueDate = lineResult.dueDate;
			}
			if (lineResult.scheduledDate && !aggregatedScheduledDate) {
				aggregatedScheduledDate = lineResult.scheduledDate;
			}
		}

		// Update metadata (only if not manually set)
		if (aggregatedStartDate && !this.isManuallySet("startDate")) {
			this.taskMetadata.startDate = aggregatedStartDate;
			if (this.startDateInput) {
				this.startDateInput.value =
					this.formatDate(aggregatedStartDate);
			}
		}
		if (aggregatedDueDate && !this.isManuallySet("dueDate")) {
			this.taskMetadata.dueDate = aggregatedDueDate;
			if (this.dueDateInput) {
				this.dueDateInput.value = this.formatDate(aggregatedDueDate);
			}
		}
		if (aggregatedScheduledDate && !this.isManuallySet("scheduledDate")) {
			this.taskMetadata.scheduledDate = aggregatedScheduledDate;
			if (this.scheduledDateInput) {
				this.scheduledDateInput.value = this.formatDate(
					aggregatedScheduledDate,
				);
			}
		}
	}

	/**
	 * Check if metadata field was manually set
	 */
	private isManuallySet(
		field: "startDate" | "dueDate" | "scheduledDate",
	): boolean {
		return this.taskMetadata.manuallySet?.[field] || false;
	}

	/**
	 * Mark metadata field as manually set
	 */
	private markAsManuallySet(
		field: "startDate" | "dueDate" | "scheduledDate",
	): void {
		if (!this.taskMetadata.manuallySet) {
			this.taskMetadata.manuallySet = {};
		}
		this.taskMetadata.manuallySet[field] = true;
	}

	/**
	 * Reset UI elements
	 */
	protected resetUIElements(): void {
		// Reset date inputs
		if (this.startDateInput) this.startDateInput.value = "";
		if (this.dueDateInput) this.dueDateInput.value = "";
		if (this.scheduledDateInput) this.scheduledDateInput.value = "";

		// Clear file name input
		if (this.fileNameInput) {
			this.fileNameInput.clear();
		}

		// Clear preview
		if (this.previewContainerEl) {
			this.previewContainerEl.empty();
		}
	}

	/**
	 * Called when modal is closed
	 */
	onClose() {
		// Save last used mode if enabled
		if (this.plugin.settings.quickCapture.rememberLastMode) {
			this.plugin.settings.quickCapture.lastUsedMode = this.currentMode;
			this.plugin.saveSettings();
		}

		// Clean up
		if (this.universalSuggest) {
			this.universalSuggest.disable();
			this.universalSuggest = null;
		}

		if (this.parseDebounceTimer) {
			clearTimeout(this.parseDebounceTimer);
		}

		if (this.markdownRenderer) {
			this.markdownRenderer.unload();
			this.markdownRenderer = null;
		}

		if (this.fileNameInput) {
			this.fileNameInput.destroy();
			this.fileNameInput = null;
		}

		super.onClose();
	}
}
