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

interface TaskMetadata {
	startDate?: Date;
	dueDate?: Date;
	scheduledDate?: Date;
	priority?: number;
	project?: string;
	context?: string;
	recurrence?: string;
	status?: string;
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
					} else {
						this.taskMetadata.startDate = undefined;
					}
					this.updatePreview();
				});
			text.inputEl.type = "date";
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
					} else {
						this.taskMetadata.dueDate = undefined;
					}
					this.updatePreview();
				});
			text.inputEl.type = "date";
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
						} else {
							this.taskMetadata.scheduledDate = undefined;
						}
						this.updatePreview();
					});
				text.inputEl.type = "date";
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
		// Split content into lines
		const lines = content.split("\n");
		const processedLines: string[] = [];
		const indentationRegex = /^(\s+)/;

		for (const line of lines) {
			if (!line.trim()) {
				processedLines.push(line);
				continue;
			}

			// Check for indentation to identify sub-tasks
			const indentMatch = line.match(indentationRegex);
			const isSubTask = indentMatch && indentMatch[1].length > 0;

			// Check if line is already a task or a list item
			const isTaskOrList = line
				.trim()
				.match(/^(-|\d+\.|\*|\+)(\s+\[[^\]]+\])?/);

			if (isSubTask) {
				// Don't add metadata to sub-tasks
				processedLines.push(line);
			} else if (isTaskOrList) {
				// If it's a task, add metadata
				if (line.trim().match(/^(-|\d+\.|\*|\+)\s+\[[^\]]+\]/)) {
					processedLines.push(this.addMetadataToTask(line));
				} else {
					// If it's a list item but not a task, convert to task and add metadata
					const listPrefix = line
						.trim()
						.match(/^(-|\d+\.|\*|\+)/)?.[0];
					const restOfLine = line
						.trim()
						.substring(listPrefix?.length || 0)
						.trim();

					// Use the specified status or default to empty checkbox
					const statusMark = this.taskMetadata.status || " ";
					processedLines.push(
						this.addMetadataToTask(
							`${listPrefix} [${statusMark}] ${restOfLine}`
						)
					);
				}
			} else {
				// Not a list item or task, convert to task and add metadata
				// Use the specified status or default to empty checkbox
				const statusMark = this.taskMetadata.status || " ";
				processedLines.push(
					this.addMetadataToTask(`- [${statusMark}] ${line}`)
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

	onClose() {
		const { contentEl } = this;

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
