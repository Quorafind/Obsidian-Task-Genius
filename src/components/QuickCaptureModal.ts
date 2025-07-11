import {
	App,
	Modal,
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
} from "../editor-ext/markdownEditor";
import TaskProgressBarPlugin from "../index";
import { saveCapture, processDateTemplates } from "../utils/fileUtils";
import { FileSuggest } from "../components/AutoComplete";
import { t } from "../translations/helper";
import { MarkdownRendererComponent } from "./MarkdownRenderer";
import { StatusComponent } from "./StatusComponent";
import { Task } from "../types/task";
import { ContextSuggest, ProjectSuggest } from "./AutoComplete";
import {
	TimeParsingService,
	DEFAULT_TIME_PARSING_CONFIG,
	ParsedTimeResult,
	LineParseResult,
} from "../utils/TimeParsingService";

interface TaskMetadata {
	startDate?: Date;
	dueDate?: Date;
	scheduledDate?: Date;
	priority?: number;
	project?: string;
	context?: string;
	recurrence?: string;
	status?: string;
	// Track which fields were manually set by user
	manuallySet?: {
		startDate?: boolean;
		dueDate?: boolean;
		scheduledDate?: boolean;
	};
}

/**
 * Sanitize filename by replacing unsafe characters with safe alternatives
 * This function only sanitizes the filename part, not directory separators
 * @param filename - The filename to sanitize
 * @returns The sanitized filename
 */
function sanitizeFilename(filename: string): string {
	// Replace unsafe characters with safe alternatives, but keep forward slashes for paths
	return filename
		.replace(/[<>:"|*?\\]/g, "-") // Replace unsafe chars with dash
		.replace(/\s+/g, " ") // Normalize whitespace
		.trim(); // Remove leading/trailing whitespace
}

/**
 * Sanitize a file path by sanitizing only the filename part while preserving directory structure
 * @param filePath - The file path to sanitize
 * @returns The sanitized file path
 */
function sanitizeFilePath(filePath: string): string {
	const pathParts = filePath.split("/");
	// Sanitize each part of the path except preserve the directory structure
	const sanitizedParts = pathParts.map((part, index) => {
		// For the last part (filename), we can be more restrictive
		if (index === pathParts.length - 1) {
			return sanitizeFilename(part);
		}
		// For directory names, we still need to avoid problematic characters but can be less restrictive
		return part
			.replace(/[<>:"|*?\\]/g, "-")
			.replace(/\s+/g, " ")
			.trim();
	});
	return sanitizedParts.join("/");
}

export class QuickCaptureModal extends Modal {
	plugin: TaskProgressBarPlugin;
	markdownEditor: EmbeddableMarkdownEditor | null = null;
	capturedContent: string = "";

	tempTargetFilePath: string = "";
	taskMetadata: TaskMetadata = {};
	useFullFeaturedMode: boolean = false;

	previewContainerEl: HTMLElement | null = null;
	markdownRenderer: MarkdownRendererComponent | null = null;

	preferMetadataFormat: "dataview" | "tasks" = "tasks";
	timeParsingService: TimeParsingService;

	// References to date input elements for updating from parsed dates
	startDateInput?: HTMLInputElement;
	dueDateInput?: HTMLInputElement;
	scheduledDateInput?: HTMLInputElement;

	// Reference to parsed time expressions display
	parsedTimeDisplayEl?: HTMLElement;

	// Debounce timer for real-time parsing
	private parseDebounceTimer?: number;

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		metadata?: TaskMetadata,
		useFullFeaturedMode: boolean = false
	) {
		super(app);
		this.plugin = plugin;

		// Initialize target file path based on target type
		if (this.plugin.settings.quickCapture.targetType === "daily-note") {
			const dateStr = moment().format(
				this.plugin.settings.quickCapture.dailyNoteSettings.format
			);
			// For daily notes, the format might include path separators (e.g., YYYY-MM/YYYY-MM-DD)
			// We need to preserve the path structure and only sanitize the final filename
			const pathWithDate = this.plugin.settings.quickCapture
				.dailyNoteSettings.folder
				? `${this.plugin.settings.quickCapture.dailyNoteSettings.folder}/${dateStr}.md`
				: `${dateStr}.md`;
			this.tempTargetFilePath = sanitizeFilePath(pathWithDate);
		} else {
			this.tempTargetFilePath =
				this.plugin.settings.quickCapture.targetFile;
		}

		this.preferMetadataFormat = this.plugin.settings.preferMetadataFormat;

		// Initialize time parsing service
		this.timeParsingService = new TimeParsingService(
			this.plugin.settings.timeParsing || DEFAULT_TIME_PARSING_CONFIG
		);

		if (metadata) {
			this.taskMetadata = metadata;
		}

		this.useFullFeaturedMode = useFullFeaturedMode && !Platform.isPhone;
	}

	onOpen() {
		const { contentEl } = this;
		this.modalEl.toggleClass("quick-capture-modal", true);

		if (this.useFullFeaturedMode) {
			this.modalEl.toggleClass(["quick-capture-modal", "full"], true);
			this.createFullFeaturedModal(contentEl);
		} else {
			this.createSimpleModal(contentEl);
		}
	}

	createSimpleModal(contentEl: HTMLElement) {
		this.titleEl.createDiv({
			text: t("Capture to"),
		});

		const targetFileEl = this.titleEl.createEl("div", {
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

		// Create container for the editor
		const editorContainer = contentEl.createDiv({
			cls: "quick-capture-modal-editor",
		});

		this.setupMarkdownEditor(editorContainer, targetFileEl);

		// Create button container
		const buttonContainer = contentEl.createDiv({
			cls: "quick-capture-modal-buttons",
		});

		// Create the buttons
		const submitButton = buttonContainer.createEl("button", {
			text: t("Capture"),
			cls: "mod-cta",
		});
		submitButton.addEventListener("click", () => this.handleSubmit());

		const cancelButton = buttonContainer.createEl("button", {
			text: t("Cancel"),
		});
		cancelButton.addEventListener("click", () => this.close());

		// Only add file suggest for fixed file type
		if (this.plugin.settings.quickCapture.targetType === "fixed") {
			new FileSuggest(
				this.app,
				targetFileEl,
				this.plugin.settings.quickCapture,
				(file: TFile) => {
					targetFileEl.textContent = file.path;
					this.tempTargetFilePath = file.path;
					// Focus current editor
					this.markdownEditor?.editor?.focus();
				}
			);
		}
	}

	createFullFeaturedModal(contentEl: HTMLElement) {
		// Create a layout container with two panels
		const layoutContainer = contentEl.createDiv({
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

		// Target file selector
		const targetFileContainer = configPanel.createDiv({
			cls: "quick-capture-target-container",
		});

		targetFileContainer.createDiv({
			text: t("Target File:"),
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
				}
			);
		}

		// Task metadata configuration
		configPanel.createDiv({
			text: t("Task Properties"),
			cls: "quick-capture-section-title",
		});

		// // Parsed time expressions display
		// const parsedTimeContainer = configPanel.createDiv({
		// 	cls: "quick-capture-parsed-time",
		// });

		// const parsedTimeTitle = parsedTimeContainer.createDiv({
		// 	text: t("Parsed Time Expressions"),
		// 	cls: "quick-capture-section-subtitle",
		// });

		// this.parsedTimeDisplayEl = parsedTimeContainer.createDiv({
		// 	cls: "quick-capture-parsed-time-display",
		// });

		const statusComponent = new StatusComponent(
			this.plugin,
			configPanel,
			{
				status: this.taskMetadata.status,
			} as Task,
			{
				type: "quick-capture",
				onTaskStatusSelected: (status: string) => {
					this.taskMetadata.status = status;
					this.updatePreview();
				},
			}
		);
		statusComponent.load();

		// Start Date
		new Setting(configPanel).setName(t("Start Date")).addText((text) => {
			text.setPlaceholder("YYYY-MM-DD")
				.setValue(
					this.taskMetadata.startDate
						? this.formatDate(this.taskMetadata.startDate)
						: ""
				)
				.onChange((value) => {
					if (value) {
						this.taskMetadata.startDate = this.parseDate(value);
						this.markAsManuallySet("startDate");
					} else {
						this.taskMetadata.startDate = undefined;
						// Reset manual flag when cleared
						if (this.taskMetadata.manuallySet) {
							this.taskMetadata.manuallySet.startDate = false;
						}
					}
					this.updatePreview();
				});
			text.inputEl.type = "date";
			// Store reference for updating from parsed dates
			this.startDateInput = text.inputEl;
		});

		// Due Date
		new Setting(configPanel).setName(t("Due Date")).addText((text) => {
			text.setPlaceholder("YYYY-MM-DD")
				.setValue(
					this.taskMetadata.dueDate
						? this.formatDate(this.taskMetadata.dueDate)
						: ""
				)
				.onChange((value) => {
					if (value) {
						this.taskMetadata.dueDate = this.parseDate(value);
						this.markAsManuallySet("dueDate");
					} else {
						this.taskMetadata.dueDate = undefined;
						// Reset manual flag when cleared
						if (this.taskMetadata.manuallySet) {
							this.taskMetadata.manuallySet.dueDate = false;
						}
					}
					this.updatePreview();
				});
			text.inputEl.type = "date";
			// Store reference for updating from parsed dates
			this.dueDateInput = text.inputEl;
		});

		// Scheduled Date
		new Setting(configPanel)
			.setName(t("Scheduled Date"))
			.addText((text) => {
				text.setPlaceholder("YYYY-MM-DD")
					.setValue(
						this.taskMetadata.scheduledDate
							? this.formatDate(this.taskMetadata.scheduledDate)
							: ""
					)
					.onChange((value) => {
						if (value) {
							this.taskMetadata.scheduledDate =
								this.parseDate(value);
							this.markAsManuallySet("scheduledDate");
						} else {
							this.taskMetadata.scheduledDate = undefined;
							// Reset manual flag when cleared
							if (this.taskMetadata.manuallySet) {
								this.taskMetadata.manuallySet.scheduledDate =
									false;
							}
						}
						this.updatePreview();
					});
				text.inputEl.type = "date";
				// Store reference for updating from parsed dates
				this.scheduledDateInput = text.inputEl;
			});

		// Priority
		new Setting(configPanel)
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

		// Project
		new Setting(configPanel).setName(t("Project")).addText((text) => {
			new ProjectSuggest(this.app, text.inputEl, this.plugin);
			text.setPlaceholder(t("Project name"))
				.setValue(this.taskMetadata.project || "")
				.onChange((value) => {
					this.taskMetadata.project = value || undefined;
					this.updatePreview();
				});
		});

		// Context
		new Setting(configPanel).setName(t("Context")).addText((text) => {
			new ContextSuggest(this.app, text.inputEl, this.plugin);
			text.setPlaceholder(t("Context"))
				.setValue(this.taskMetadata.context || "")
				.onChange((value) => {
					this.taskMetadata.context = value || undefined;
					this.updatePreview();
				});
		});

		// Recurrence
		new Setting(configPanel).setName(t("Recurrence")).addText((text) => {
			text.setPlaceholder(t("e.g., every day, every week"))
				.setValue(this.taskMetadata.recurrence || "")
				.onChange((value) => {
					this.taskMetadata.recurrence = value || undefined;
					this.updatePreview();
				});
		});

		// Create editor container in the right panel
		const editorContainer = editorPanel.createDiv({
			cls: "quick-capture-modal-editor",
		});

		editorPanel.createDiv({
			text: t("Task Content"),
			cls: "quick-capture-section-title",
		});

		this.previewContainerEl = editorPanel.createDiv({
			cls: "preview-container",
		});

		this.markdownRenderer = new MarkdownRendererComponent(
			this.app,
			this.previewContainerEl,
			"",
			false
		);

		this.setupMarkdownEditor(editorContainer);

		// Create button container
		const buttonContainer = contentEl.createDiv({
			cls: "quick-capture-modal-buttons",
		});

		// Create the buttons
		const submitButton = buttonContainer.createEl("button", {
			text: t("Capture"),
			cls: "mod-cta",
		});
		submitButton.addEventListener("click", () => this.handleSubmit());

		const cancelButton = buttonContainer.createEl("button", {
			text: t("Cancel"),
		});
		cancelButton.addEventListener("click", () => this.close());
	}

	updatePreview() {
		if (this.previewContainerEl) {
			this.markdownRenderer?.render(
				this.processContentWithMetadata(this.capturedContent)
			);
		}
	}

	setupMarkdownEditor(container: HTMLElement, targetFileEl?: HTMLElement) {
		// Create the markdown editor with our EmbeddableMarkdownEditor
		setTimeout(() => {
			this.markdownEditor = createEmbeddableMarkdownEditor(
				this.app,
				container,
				{
					placeholder: this.plugin.settings.quickCapture.placeholder,

					onEnter: (editor, mod, shift) => {
						if (mod) {
							// Submit on Cmd/Ctrl+Enter
							this.handleSubmit();
							return true;
						}
						// Allow normal Enter key behavior
						return false;
					},

					onEscape: (editor) => {
						// Close the modal on Escape
						this.close();
					},

					onSubmit: (editor) => {
						this.handleSubmit();
					},

					onChange: (update) => {
						// Handle changes if needed
						this.capturedContent = this.markdownEditor?.value || "";

						// Clear previous debounce timer
						if (this.parseDebounceTimer) {
							clearTimeout(this.parseDebounceTimer);
						}

						// Debounce time parsing to avoid excessive parsing on rapid typing
						this.parseDebounceTimer = window.setTimeout(() => {
							this.performRealTimeParsing();
						}, 300); // 300ms debounce

						// Update preview immediately for better responsiveness
						if (this.updatePreview) {
							this.updatePreview();
						}
					},
				}
			);

			this.markdownEditor?.scope.register(
				["Alt"],
				"c",
				(e: KeyboardEvent) => {
					e.preventDefault();
					if (!this.markdownEditor) return false;
					if (this.markdownEditor.value.trim() === "") {
						this.close();
						return true;
					} else {
						this.handleSubmit();
					}
					return true;
				}
			);

			if (targetFileEl) {
				this.markdownEditor?.scope.register(
					["Alt"],
					"x",
					(e: KeyboardEvent) => {
						e.preventDefault();
						// Only allow focus on target file if it's editable (fixed file type)
						if (
							this.plugin.settings.quickCapture.targetType ===
							"fixed"
						) {
							targetFileEl.focus();
						}
						return true;
					}
				);
			}

			// Focus the editor when it's created
			this.markdownEditor?.editor?.focus();
		}, 50);
	}

	async handleSubmit() {
		const content =
			this.capturedContent.trim() ||
			this.markdownEditor?.value.trim() ||
			"";

		if (!content) {
			new Notice(t("Nothing to capture"));
			return;
		}

		try {
			const processedContent = this.processContentWithMetadata(content);

			// Create options with current settings
			const captureOptions = {
				...this.plugin.settings.quickCapture,
				targetFile: this.tempTargetFilePath,
			};

			await saveCapture(this.app, processedContent, captureOptions);
			new Notice(t("Captured successfully"));
			this.close();
		} catch (error) {
			new Notice(`${t("Failed to save:")} ${error}`);
		}
	}

	processContentWithMetadata(content: string): string {
		// Step 1: Split content into lines FIRST to preserve line structure
		const lines = content.split("\n");
		const processedLines: string[] = [];
		const indentationRegex = /^(\s+)/;

		// Step 2: Process each line individually
		for (const line of lines) {
			if (!line.trim()) {
				processedLines.push(line);
				continue;
			}

			// Step 3: Parse time expressions for THIS line only
			const lineParseResult =
				this.timeParsingService.parseTimeExpressionsForLine(line);

			// Step 4: Use cleaned line content (with time expressions removed from this line)
			const cleanedLine = lineParseResult.cleanedLine;

			// Step 5: Check for indentation to identify sub-tasks
			const indentMatch = line.match(indentationRegex);
			const isSubTask = indentMatch && indentMatch[1].length > 0;

			// Step 6: Check if line is already a task or a list item
			const isTaskOrList = cleanedLine
				.trim()
				.match(/^(-|\d+\.|\*|\+)(\s+\[[^\]]+\])?/);

			if (isSubTask) {
				// Don't add metadata to sub-tasks, but still clean time expressions
				// Preserve the original indentation from the original line
				const originalIndent = indentMatch[1];
				const cleanedContent = cleanedLine.trim();
				processedLines.push(originalIndent + cleanedContent);
			} else if (isTaskOrList) {
				// If it's a task, add line-specific metadata
				if (cleanedLine.trim().match(/^(-|\d+\.|\*|\+)\s+\[[^\]]+\]/)) {
					processedLines.push(
						this.addLineMetadataToTask(cleanedLine, lineParseResult)
					);
				} else {
					// If it's a list item but not a task, convert to task and add line-specific metadata
					const listPrefix = cleanedLine
						.trim()
						.match(/^(-|\d+\.|\*|\+)/)?.[0];
					const restOfLine = cleanedLine
						.trim()
						.substring(listPrefix?.length || 0)
						.trim();

					// Use the specified status or default to empty checkbox
					const statusMark = this.taskMetadata.status || " ";
					const taskLine = `${listPrefix} [${statusMark}] ${restOfLine}`;
					processedLines.push(
						this.addLineMetadataToTask(taskLine, lineParseResult)
					);
				}
			} else {
				// Not a list item or task, convert to task and add line-specific metadata
				// Use the specified status or default to empty checkbox
				const statusMark = this.taskMetadata.status || " ";
				const taskLine = `- [${statusMark}] ${cleanedLine}`;
				processedLines.push(
					this.addLineMetadataToTask(taskLine, lineParseResult)
				);
			}
		}

		return processedLines.join("\n");
	}

	addMetadataToTask(taskLine: string): string {
		const metadata = this.generateMetadataString();
		if (!metadata) return taskLine;

		return `${taskLine} ${metadata}`.trim();
	}

	/**
	 * Add line-specific metadata to a task line
	 * @param taskLine - The task line to add metadata to
	 * @param lineParseResult - Parse result for this specific line
	 * @returns Task line with line-specific metadata
	 */
	addLineMetadataToTask(
		taskLine: string,
		lineParseResult: LineParseResult
	): string {
		const metadata = this.generateLineMetadata(lineParseResult);
		if (!metadata) return taskLine;

		return `${taskLine} ${metadata}`.trim();
	}

	/**
	 * Generate metadata string for a specific line using line-specific dates
	 * @param lineParseResult - Parse result for this specific line
	 * @returns Metadata string for this line
	 */
	generateLineMetadata(lineParseResult: LineParseResult): string {
		const metadata: string[] = [];
		const useDataviewFormat = this.preferMetadataFormat === "dataview";

		// Use line-specific dates first, fall back to global metadata
		const startDate =
			lineParseResult.startDate || this.taskMetadata.startDate;
		const dueDate = lineParseResult.dueDate || this.taskMetadata.dueDate;
		const scheduledDate =
			lineParseResult.scheduledDate || this.taskMetadata.scheduledDate;

		// Format dates to strings in YYYY-MM-DD format
		if (startDate) {
			const formattedStartDate = this.formatDate(startDate);
			metadata.push(
				useDataviewFormat
					? `[start:: ${formattedStartDate}]`
					: `🛫 ${formattedStartDate}`
			);
		}

		if (dueDate) {
			const formattedDueDate = this.formatDate(dueDate);
			metadata.push(
				useDataviewFormat
					? `[due:: ${formattedDueDate}]`
					: `📅 ${formattedDueDate}`
			);
		}

		if (scheduledDate) {
			const formattedScheduledDate = this.formatDate(scheduledDate);
			metadata.push(
				useDataviewFormat
					? `[scheduled:: ${formattedScheduledDate}]`
					: `⏳ ${formattedScheduledDate}`
			);
		}

		// Add priority if set (use global metadata)
		if (this.taskMetadata.priority) {
			if (useDataviewFormat) {
				// 使用 dataview 格式
				let priorityValue: string | number;
				switch (this.taskMetadata.priority) {
					case 5:
						priorityValue = "highest";
						break;
					case 4:
						priorityValue = "high";
						break;
					case 3:
						priorityValue = "medium";
						break;
					case 2:
						priorityValue = "low";
						break;
					case 1:
						priorityValue = "lowest";
						break;
					default:
						priorityValue = this.taskMetadata.priority;
				}
				metadata.push(`[priority:: ${priorityValue}]`);
			} else {
				// 使用 emoji 格式
				let priorityMarker = "";
				switch (this.taskMetadata.priority) {
					case 5:
						priorityMarker = "🔺";
						break; // Highest
					case 4:
						priorityMarker = "⏫";
						break; // High
					case 3:
						priorityMarker = "🔼";
						break; // Medium
					case 2:
						priorityMarker = "🔽";
						break; // Low
					case 1:
						priorityMarker = "⏬";
						break; // Lowest
				}
				if (priorityMarker) {
					metadata.push(priorityMarker);
				}
			}
		}

		// Add project if set (use global metadata)
		if (this.taskMetadata.project) {
			if (useDataviewFormat) {
				const projectPrefix =
					this.plugin.settings.projectTagPrefix?.[
						this.plugin.settings.preferMetadataFormat
					] || "project";
				metadata.push(
					`[${projectPrefix}:: ${this.taskMetadata.project}]`
				);
			} else {
				const projectPrefix =
					this.plugin.settings.projectTagPrefix?.[
						this.plugin.settings.preferMetadataFormat
					] || "project";
				metadata.push(`#${projectPrefix}/${this.taskMetadata.project}`);
			}
		}

		// Add context if set (use global metadata)
		if (this.taskMetadata.context) {
			if (useDataviewFormat) {
				const contextPrefix =
					this.plugin.settings.contextTagPrefix?.[
						this.plugin.settings.preferMetadataFormat
					] || "context";
				metadata.push(
					`[${contextPrefix}:: ${this.taskMetadata.context}]`
				);
			} else {
				const contextPrefix =
					this.plugin.settings.contextTagPrefix?.[
						this.plugin.settings.preferMetadataFormat
					] || "@";
				metadata.push(`${contextPrefix}${this.taskMetadata.context}`);
			}
		}

		// Add recurrence if set (use global metadata)
		if (this.taskMetadata.recurrence) {
			metadata.push(
				useDataviewFormat
					? `[repeat:: ${this.taskMetadata.recurrence}]`
					: `🔁 ${this.taskMetadata.recurrence}`
			);
		}

		return metadata.join(" ");
	}

	generateMetadataString(): string {
		const metadata: string[] = [];
		const useDataviewFormat = this.preferMetadataFormat === "dataview";

		// Format dates to strings in YYYY-MM-DD format
		if (this.taskMetadata.startDate) {
			const formattedStartDate = this.formatDate(
				this.taskMetadata.startDate
			);
			metadata.push(
				useDataviewFormat
					? `[start:: ${formattedStartDate}]`
					: `🛫 ${formattedStartDate}`
			);
		}

		if (this.taskMetadata.dueDate) {
			const formattedDueDate = this.formatDate(this.taskMetadata.dueDate);
			metadata.push(
				useDataviewFormat
					? `[due:: ${formattedDueDate}]`
					: `📅 ${formattedDueDate}`
			);
		}

		if (this.taskMetadata.scheduledDate) {
			const formattedScheduledDate = this.formatDate(
				this.taskMetadata.scheduledDate
			);
			metadata.push(
				useDataviewFormat
					? `[scheduled:: ${formattedScheduledDate}]`
					: `⏳ ${formattedScheduledDate}`
			);
		}

		// Add priority if set
		if (this.taskMetadata.priority) {
			if (useDataviewFormat) {
				// 使用 dataview 格式
				let priorityValue: string | number;
				switch (this.taskMetadata.priority) {
					case 5:
						priorityValue = "highest";
						break;
					case 4:
						priorityValue = "high";
						break;
					case 3:
						priorityValue = "medium";
						break;
					case 2:
						priorityValue = "low";
						break;
					case 1:
						priorityValue = "lowest";
						break;
					default:
						priorityValue = this.taskMetadata.priority;
				}
				metadata.push(`[priority:: ${priorityValue}]`);
			} else {
				// 使用 emoji 格式
				let priorityMarker = "";
				switch (this.taskMetadata.priority) {
					case 5:
						priorityMarker = "🔺";
						break; // Highest
					case 4:
						priorityMarker = "⏫";
						break; // High
					case 3:
						priorityMarker = "🔼";
						break; // Medium
					case 2:
						priorityMarker = "🔽";
						break; // Low
					case 1:
						priorityMarker = "⏬";
						break; // Lowest
				}
				if (priorityMarker) {
					metadata.push(priorityMarker);
				}
			}
		}

		// Add project if set
		if (this.taskMetadata.project) {
			if (useDataviewFormat) {
				const projectPrefix =
					this.plugin.settings.projectTagPrefix[
						this.plugin.settings.preferMetadataFormat
					] || "project";
				metadata.push(
					`[${projectPrefix}:: ${this.taskMetadata.project}]`
				);
			} else {
				const projectPrefix =
					this.plugin.settings.projectTagPrefix[
						this.plugin.settings.preferMetadataFormat
					] || "project";
				metadata.push(`#${projectPrefix}/${this.taskMetadata.project}`);
			}
		}

		// Add context if set
		if (this.taskMetadata.context) {
			if (useDataviewFormat) {
				const contextPrefix =
					this.plugin.settings.contextTagPrefix[
						this.plugin.settings.preferMetadataFormat
					] || "context";
				metadata.push(
					`[${contextPrefix}:: ${this.taskMetadata.context}]`
				);
			} else {
				const contextPrefix =
					this.plugin.settings.contextTagPrefix[
						this.plugin.settings.preferMetadataFormat
					] || "@";
				metadata.push(`${contextPrefix}${this.taskMetadata.context}`);
			}
		}

		// Add recurrence if set
		if (this.taskMetadata.recurrence) {
			metadata.push(
				useDataviewFormat
					? `[repeat:: ${this.taskMetadata.recurrence}]`
					: `🔁 ${this.taskMetadata.recurrence}`
			);
		}

		return metadata.join(" ");
	}

	formatDate(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
			2,
			"0"
		)}-${String(date.getDate()).padStart(2, "0")}`;
	}

	parseDate(dateString: string): Date {
		const [year, month, day] = dateString.split("-").map(Number);
		return new Date(year, month - 1, day); // month is 0-indexed in JavaScript Date
	}

	/**
	 * Check if a metadata field was manually set by the user
	 * @param field - The field name to check
	 * @returns True if the field was manually set
	 */
	isManuallySet(field: "startDate" | "dueDate" | "scheduledDate"): boolean {
		return this.taskMetadata.manuallySet?.[field] || false;
	}

	/**
	 * Mark a metadata field as manually set
	 * @param field - The field name to mark
	 */
	markAsManuallySet(field: "startDate" | "dueDate" | "scheduledDate"): void {
		if (!this.taskMetadata.manuallySet) {
			this.taskMetadata.manuallySet = {};
		}
		this.taskMetadata.manuallySet[field] = true;
	}

	/**
	 * Perform real-time parsing with debouncing
	 */
	private performRealTimeParsing(): void {
		if (!this.capturedContent) return;

		// Parse each line separately to get per-line results
		const lines = this.capturedContent.split("\n");
		const lineParseResults =
			this.timeParsingService.parseTimeExpressionsPerLine(lines);

		// Aggregate dates from all lines to update global metadata (only if not manually set)
		let aggregatedStartDate: Date | undefined;
		let aggregatedDueDate: Date | undefined;
		let aggregatedScheduledDate: Date | undefined;

		// Find the first occurrence of each date type across all lines
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

		// Update task metadata with aggregated dates (only if not manually set)
		if (aggregatedStartDate && !this.isManuallySet("startDate")) {
			this.taskMetadata.startDate = aggregatedStartDate;
			// Update UI input field
			if (this.startDateInput) {
				this.startDateInput.value =
					this.formatDate(aggregatedStartDate);
			}
		}
		if (aggregatedDueDate && !this.isManuallySet("dueDate")) {
			this.taskMetadata.dueDate = aggregatedDueDate;
			// Update UI input field
			if (this.dueDateInput) {
				this.dueDateInput.value = this.formatDate(aggregatedDueDate);
			}
		}
		if (aggregatedScheduledDate && !this.isManuallySet("scheduledDate")) {
			this.taskMetadata.scheduledDate = aggregatedScheduledDate;
			// Update UI input field
			if (this.scheduledDateInput) {
				this.scheduledDateInput.value = this.formatDate(
					aggregatedScheduledDate
				);
			}
		}
	}

	/**
	 * Update the parsed time expressions display
	 * @param parseResult - The result from time parsing
	 */
	// updateParsedTimeDisplay(parseResult: ParsedTimeResult): void {
	// 	if (!this.parsedTimeDisplayEl) return;

	// 	this.parsedTimeDisplayEl.empty();

	// 	if (parseResult.parsedExpressions.length === 0) {
	// 		this.parsedTimeDisplayEl.createDiv({
	// 			text: t("No time expressions found"),
	// 			cls: "quick-capture-no-expressions",
	// 		});
	// 		return;
	// 	}

	// 	parseResult.parsedExpressions.forEach((expression, index) => {
	// 		const expressionEl = this.parsedTimeDisplayEl!.createDiv({
	// 			cls: "quick-capture-expression-item",
	// 		});

	// 		const textEl = expressionEl.createSpan({
	// 			text: `"${expression.text}"`,
	// 			cls: "quick-capture-expression-text",
	// 		});

	// 		const arrowEl = expressionEl.createSpan({
	// 			text: " → ",
	// 			cls: "quick-capture-expression-arrow",
	// 		});

	// 		const dateEl = expressionEl.createSpan({
	// 			text: this.formatDate(expression.date),
	// 			cls: "quick-capture-expression-date",
	// 		});

	// 		const typeEl = expressionEl.createSpan({
	// 			text: ` (${expression.type})`,
	// 			cls: `quick-capture-expression-type quick-capture-type-${expression.type}`,
	// 		});
	// 	});
	// }

	onClose() {
		const { contentEl } = this;

		// Clear debounce timer
		if (this.parseDebounceTimer) {
			clearTimeout(this.parseDebounceTimer);
			this.parseDebounceTimer = undefined;
		}

		// Clean up the markdown editor
		if (this.markdownEditor) {
			this.markdownEditor.destroy();
			this.markdownEditor = null;
		}

		// Clear the content
		contentEl.empty();

		if (this.markdownRenderer) {
			this.markdownRenderer.unload();
			this.markdownRenderer = null;
		}
	}
}
