import { App, Notice, Menu, setIcon, EditorPosition } from "obsidian";
import { createEmbeddableMarkdownEditor } from "@/editor-extensions/core/markdown-editor";
import TaskProgressBarPlugin from "@/index";
import { t } from "@/translations/helper";
import { MinimalQuickCaptureSuggest } from "@/components/features/quick-capture/suggest/MinimalQuickCaptureSuggest";
import { UniversalEditorSuggest } from "@/components/ui/suggest";
import { ConfigurableTaskParser } from "@/dataflow/core/ConfigurableTaskParser";
import { clearAllMarks } from "@/components/ui/renderers/MarkdownRenderer";
import {
	BaseQuickCaptureModal,
	QuickCaptureMode,
	TaskMetadata,
} from "./BaseQuickCaptureModal";
import { moment } from "obsidian";
import { processDateTemplates } from "@/utils/file/file-operations";
import { FileSuggest } from "@/components/ui/inputs/AutoComplete";
import { DatePickerModal } from "@/components/ui/date-picker/DatePickerModal";

/**
 * Minimal Quick Capture Modal extending the base class
 */
export class MinimalQuickCaptureModal extends BaseQuickCaptureModal {
	// UI Elements
	private dateButton: HTMLButtonElement | null = null;
	private priorityButton: HTMLButtonElement | null = null;
	private locationButton: HTMLButtonElement | null = null;
	private tagButton: HTMLButtonElement | null = null;

	// Suggest instances
	private minimalSuggest: MinimalQuickCaptureSuggest;
	private universalSuggest: UniversalEditorSuggest | null = null;
	private fileSuggest: FileSuggest | null = null;

	// UI element references
	private targetIndicator: HTMLElement | null = null;
	private fileNameInput: HTMLInputElement | null = null;
	private targetFileEl: HTMLDivElement | null = null;
	private editorContainer: HTMLElement | null = null;

	constructor(app: App, plugin: TaskProgressBarPlugin) {
		// Default to checkbox mode for task creation
		super(app, plugin, "checkbox");

		this.minimalSuggest = plugin.minimalQuickCaptureSuggest;

		// Initialize default metadata for checkbox mode
		const targetType = this.plugin.settings.quickCapture.targetType;
		this.taskMetadata.location =
			(targetType === "custom-file" ? "file" : targetType) || "fixed";
		this.taskMetadata.targetFile = this.getTargetFile();
	}

	onOpen() {
		// Store modal instance reference for suggest system
		(this.modalEl as any).__minimalQuickCaptureModal = this;
		this.modalEl.toggleClass("tg-minimal-capture-modal", true);

		// Set up the suggest system
		if (this.minimalSuggest) {
			this.minimalSuggest.setMinimalMode(true);
		}

		super.onOpen();
	}

	/**
	 * Initialize components after UI creation
	 */
	protected initializeComponents(): void {
		// Setup markdown editor only if not already initialized
		if (this.contentContainer && !this.markdownEditor) {
			const editorContainer = this.contentContainer.querySelector(
				".quick-capture-minimal-editor",
			) as HTMLElement;
			if (editorContainer) {
				this.setupMarkdownEditor(editorContainer);
			}

			// Enable universal suggest for minimal modal after editor is created
			setTimeout(() => {
				if (this.markdownEditor?.editor?.editor) {
					this.universalSuggest =
						this.suggestManager.enableForMinimalModal(
							this.markdownEditor.editor.editor,
						);
					this.universalSuggest.enable();
				}
			}, 100);
		}

		// Restore content if exists
		if (this.markdownEditor && this.capturedContent) {
			this.markdownEditor.set(this.capturedContent, false);
		}
	}

	/**
	 * Create UI - consistent layout for both modes
	 */
	protected createUI(): void {
		if (!this.contentContainer) return;

		// Target indicator (shows destination or file name)
		const targetContainer = this.contentContainer.createDiv({
			cls: "quick-capture-minimal-target-container",
		});

		this.targetIndicator = targetContainer.createDiv({
			cls: "quick-capture-minimal-target",
		});

		// Editor container - same for both modes
		const editorWrapper = this.contentContainer.createDiv({
			cls: "quick-capture-minimal-editor-container",
		});

		this.editorContainer = editorWrapper.createDiv({
			cls: "quick-capture-modal-editor quick-capture-minimal-editor",
		});

		// Quick action buttons container (only for checkbox mode)
		const buttonsContainer = this.contentContainer.createDiv({
			cls: "quick-capture-minimal-quick-actions",
		});

		this.createQuickActionButtons(buttonsContainer);

		// Update target display based on initial mode
		this.updateTargetDisplay();
	}

	/**
	 * Update target display based on current mode
	 */
	protected updateTargetDisplay(): void {
		if (!this.targetIndicator) return;

		this.targetIndicator.empty();

		if (this.currentMode === "checkbox") {
			// Show editable target file for checkbox mode
			const label = this.targetIndicator.createSpan({
				cls: "quick-capture-target-label",
				text: t("To: "),
			});

			// Create contenteditable element for target file path
			this.targetFileEl = this.targetIndicator.createEl("div", {
				cls: "quick-capture-target",
				attr: {
					contenteditable: "true",
					spellcheck: "false",
				},
				text: this.tempTargetFilePath,
			});

			// Add FileSuggest for file selection
			this.fileSuggest = new FileSuggest(
				this.app,
				this.targetFileEl,
				this.plugin.settings.quickCapture,
				(file) => {
					this.targetFileEl!.textContent = file.path;
					this.tempTargetFilePath = file.path;
					this.taskMetadata.targetFile = file.path;
					this.markdownEditor?.editor?.focus();
				},
			);

			// Update tempTargetFilePath when manually edited
			this.targetFileEl.addEventListener("blur", () => {
				if (this.targetFileEl) {
					this.tempTargetFilePath =
						this.targetFileEl.textContent || "";
					this.taskMetadata.targetFile = this.tempTargetFilePath;
				}
			});

			// Show quick action buttons
			const buttonsContainer = this.contentContainer?.querySelector(
				".quick-capture-minimal-quick-actions",
			);
			if (buttonsContainer) {
				(buttonsContainer as HTMLElement).style.display = "flex";
			}
		} else {
			// Show file name input for file mode with resolved path
			const label = this.targetIndicator.createSpan({
				cls: "quick-capture-target-label",
				text: t("Save as: "),
			});

			// Get the template value and resolve it immediately
			const templateValue =
				this.taskMetadata.customFileName ||
				this.plugin.settings.quickCapture.defaultFileNameTemplate ||
				"{{DATE:YYYY-MM-DD}} - Task";
			let resolvedPath = processDateTemplates(templateValue);

			// Add default folder if configured
			const defaultFolder =
				this.plugin.settings.quickCapture.createFileMode?.defaultFolder?.trim();
			if (
				this.plugin.settings?.fileSource?.enabled &&
				defaultFolder &&
				!resolvedPath.includes("/")
			) {
				resolvedPath = `${defaultFolder}/${resolvedPath}`;
			}

			// Add .md extension if not present
			if (!resolvedPath.endsWith(".md")) {
				resolvedPath += ".md";
			}

			// Create input with resolved path (editable)
			this.fileNameInput = this.targetIndicator.createEl("input", {
				cls: "quick-capture-minimal-file-input",
				attr: {
					type: "text",
					placeholder: t("Enter file name..."),
					value: resolvedPath,
				},
			});

			// Update the customFileName when input changes
			this.fileNameInput.addEventListener("input", () => {
				if (this.fileNameInput) {
					this.taskMetadata.customFileName = this.fileNameInput.value;
				}
			});

			// Keep quick action buttons visible in file mode
			const buttonsContainer = this.contentContainer?.querySelector(
				".quick-capture-minimal-quick-actions",
			);
			if (buttonsContainer) {
				(buttonsContainer as HTMLElement).style.display = "flex";
			}
		}
	}

	/**
	 * Create quick action buttons
	 */
	private createQuickActionButtons(container: HTMLElement): void {
		const leftContainer = container.createDiv({
			cls: "quick-actions-left",
		});

		this.dateButton = leftContainer.createEl("button", {
			cls: ["quick-action-button", "clickable-icon"],
			attr: { "aria-label": t("Set date") },
		});
		setIcon(this.dateButton, "calendar");
		this.dateButton.addEventListener("click", () => this.showDatePicker());
		this.updateButtonState(this.dateButton, !!this.taskMetadata.dueDate);

		this.priorityButton = leftContainer.createEl("button", {
			cls: ["quick-action-button", "clickable-icon"],
			attr: { "aria-label": t("Set priority") },
		});
		setIcon(this.priorityButton, "zap");
		this.priorityButton.addEventListener("click", () =>
			this.showPriorityMenu(),
		);
		this.updateButtonState(
			this.priorityButton,
			!!this.taskMetadata.priority,
		);

		this.locationButton = leftContainer.createEl("button", {
			cls: ["quick-action-button", "clickable-icon"],
			attr: { "aria-label": t("Set location") },
		});
		setIcon(this.locationButton, "folder");
		this.locationButton.addEventListener("click", () =>
			this.showLocationMenu(),
		);
		this.updateButtonState(
			this.locationButton,
			this.taskMetadata.location !==
				(this.plugin.settings.quickCapture.targetType || "fixed"),
		);

		this.tagButton = leftContainer.createEl("button", {
			cls: ["quick-action-button", "clickable-icon"],
			attr: { "aria-label": t("Add tags") },
		});
		setIcon(this.tagButton, "tag");
		this.tagButton.addEventListener("click", () => {});
		this.updateButtonState(
			this.tagButton,
			!!(this.taskMetadata.tags && this.taskMetadata.tags.length > 0),
		);
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
					placeholder: t("Enter your content..."),
					singleLine: false, // Allow multiline for both modes

					onEnter: (editor, mod, shift) => {
						// Cmd/Ctrl+Enter always submits
						if (mod) {
							this.handleSubmit();
							return true;
						}
						// In checkbox mode, plain Enter also submits for quick capture
						if (this.currentMode === "checkbox" && !shift) {
							this.handleSubmit();
							return true;
						}
						// In file mode or shift+enter, create new line
						return false;
					},

					onEscape: (editor) => {
						this.close();
					},

					onChange: (update) => {
						this.capturedContent = this.markdownEditor?.value || "";
						// Parse content and update button states only in checkbox mode
						if (this.currentMode === "checkbox") {
							this.parseContentAndUpdateButtons();
						}
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
	 * Update button state
	 */
	private updateButtonState(
		button: HTMLButtonElement,
		isActive: boolean,
	): void {
		if (isActive) {
			button.addClass("active");
		} else {
			button.removeClass("active");
		}
	}

	/**
	 * Show menu at specified coordinates
	 */
	private showMenuAtCoords(menu: Menu, x: number, y: number): void {
		menu.showAtMouseEvent(
			new MouseEvent("click", {
				clientX: x,
				clientY: y,
			}),
		);
	}

	// Date picker methods
	public showDatePickerAtCursor(cursorCoords: any, cursor: EditorPosition) {
		this.showDatePicker(cursor, cursorCoords);
	}

	public showDatePicker(cursor?: EditorPosition, coords?: any) {
		const quickDates = [
			{ label: t("Tomorrow"), date: moment().add(1, "day").toDate() },
			{
				label: t("Day after tomorrow"),
				date: moment().add(2, "day").toDate(),
			},
			{ label: t("Next week"), date: moment().add(1, "week").toDate() },
			{ label: t("Next month"), date: moment().add(1, "month").toDate() },
		];

		const menu = new Menu();

		quickDates.forEach((quickDate) => {
			menu.addItem((item) => {
				item.setTitle(quickDate.label);
				item.setIcon("calendar");
				item.onClick(() => {
					this.taskMetadata.dueDate = quickDate.date;
					this.updateButtonState(this.dateButton!, true);

					// If called from suggest, replace the ~ with date text
					if (cursor && this.markdownEditor) {
						this.replaceAtCursor(
							cursor,
							this.formatDate(quickDate.date),
						);
					}
				});
			});
		});

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("Choose date..."));
			item.setIcon("calendar-days");
			item.onClick(() => {
				// Open full date picker modal
				const datePickerModal = new DatePickerModal(
					this.app,
					this.plugin,
					this.taskMetadata.dueDate
						? moment(this.taskMetadata.dueDate).format("YYYY-MM-DD")
						: undefined,
					"📅",
				);

				datePickerModal.onDateSelected = (
					selectedDate: string | null,
				) => {
					if (selectedDate) {
						this.taskMetadata.dueDate =
							moment(selectedDate).toDate();
						this.updateButtonState(this.dateButton!, true);

						// If called from suggest, replace the ~ with date text
						if (cursor && this.markdownEditor) {
							this.replaceAtCursor(
								cursor,
								this.formatDate(this.taskMetadata.dueDate),
							);
						}
					}
				};

				datePickerModal.open();
			});
		});

		// Show menu
		if (coords) {
			this.showMenuAtCoords(menu, coords.left, coords.top);
		} else if (this.dateButton) {
			const rect = this.dateButton.getBoundingClientRect();
			this.showMenuAtCoords(menu, rect.left, rect.bottom + 5);
		}
	}

	// Priority menu methods
	public showPriorityMenuAtCursor(cursorCoords: any, cursor: EditorPosition) {
		this.showPriorityMenu(cursor, cursorCoords);
	}

	public showPriorityMenu(cursor?: EditorPosition, coords?: any) {
		const priorities = [
			{ level: 5, label: t("Highest"), icon: "🔺" },
			{ level: 4, label: t("High"), icon: "⏫" },
			{ level: 3, label: t("Medium"), icon: "🔼" },
			{ level: 2, label: t("Low"), icon: "🔽" },
			{ level: 1, label: t("Lowest"), icon: "⏬" },
		];

		const menu = new Menu();

		priorities.forEach((priority) => {
			menu.addItem((item) => {
				item.setTitle(`${priority.icon} ${priority.label}`);
				item.onClick(() => {
					this.taskMetadata.priority = priority.level;
					this.updateButtonState(this.priorityButton!, true);

					// If called from suggest, replace the ! with priority icon
					if (cursor && this.markdownEditor) {
						this.replaceAtCursor(cursor, priority.icon);
					}
				});
			});
		});

		// Show menu
		if (coords) {
			this.showMenuAtCoords(menu, coords.left, coords.top);
		} else if (this.priorityButton) {
			const rect = this.priorityButton.getBoundingClientRect();
			this.showMenuAtCoords(menu, rect.left, rect.bottom + 5);
		}
	}

	// Location menu methods
	public showLocationMenuAtCursor(cursorCoords: any, cursor: EditorPosition) {
		this.showLocationMenu(cursor, cursorCoords);
	}

	public showLocationMenu(cursor?: EditorPosition, coords?: any) {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle(t("Fixed location"));
			item.setIcon("file");
			item.onClick(() => {
				this.taskMetadata.location = "fixed";
				this.taskMetadata.targetFile =
					this.plugin.settings.quickCapture.targetFile;
				this.updateButtonState(
					this.locationButton!,
					this.taskMetadata.location !==
						(this.plugin.settings.quickCapture.targetType ||
							"fixed"),
				);

				// If called from suggest, replace the 📁 with file text
				if (cursor && this.markdownEditor) {
					this.replaceAtCursor(cursor, t("Fixed location"));
				}
			});
		});

		menu.addItem((item) => {
			item.setTitle(t("Daily note"));
			item.setIcon("calendar");
			item.onClick(() => {
				this.taskMetadata.location = "daily-note";
				this.taskMetadata.targetFile = this.getDailyNoteFile();
				this.updateButtonState(
					this.locationButton!,
					this.taskMetadata.location !==
						(this.plugin.settings.quickCapture?.targetType ||
							"fixed"),
				);

				// If called from suggest, replace the 📁 with daily note text
				if (cursor && this.markdownEditor) {
					this.replaceAtCursor(cursor, t("Daily note"));
				}
			});
		});

		// Only show custom file option when FileSource is enabled
		if (this.plugin.settings?.fileSource?.enabled) {
			menu.addItem((item) => {
				item.setTitle(t("Custom file"));
				item.setIcon("file-plus");
				item.onClick(() => {
					this.taskMetadata.location = "file";
					// Switch to file mode for custom file creation
					this.switchMode("file");
					// If called from suggest, replace the 📁 with custom file text
					if (cursor && this.markdownEditor) {
						this.replaceAtCursor(cursor, t("Custom file"));
					}
				});
			});
		}

		// Show menu
		if (coords) {
			this.showMenuAtCoords(menu, coords.left, coords.top);
		} else if (this.locationButton) {
			const rect = this.locationButton.getBoundingClientRect();
			this.showMenuAtCoords(menu, rect.left, rect.bottom + 5);
		}
	}

	/**
	 * Replace text at cursor position
	 */
	private replaceAtCursor(cursor: EditorPosition, replacement: string) {
		if (!this.markdownEditor) return;

		// Replace the character at cursor position using CodeMirror API
		const cm = (this.markdownEditor.editor as any).cm;
		if (cm && cm.replaceRange) {
			cm.replaceRange(
				replacement,
				{ line: cursor.line, ch: cursor.ch - 1 },
				cursor,
			);
		}
	}

	/**
	 * Get target file
	 */
	private getTargetFile(): string {
		const settings = this.plugin.settings.quickCapture;
		if (this.taskMetadata.location === "daily-note") {
			return this.getDailyNoteFile();
		}
		return settings.targetFile;
	}

	/**
	 * Get daily note file
	 */
	private getDailyNoteFile(): string {
		const settings = this.plugin.settings.quickCapture.dailyNoteSettings;
		const dateStr = moment().format(settings.format);
		return settings.folder
			? `${settings.folder}/${dateStr}.md`
			: `${dateStr}.md`;
	}

	/**
	 * Process content with metadata based on save strategy
	 */
	protected processContentWithMetadata(content: string): string {
		if (!content.trim()) return "";

		// For file mode, just return content as-is
		if (this.currentMode === "file") {
			return content;
		}

		// For checkbox mode, format as tasks
		const lines = content.split("\n");
		const processedLines = lines.map((line) => {
			const trimmed = line.trim();
			if (trimmed && !trimmed.startsWith("- [")) {
				// Use clearAllMarks to completely clean the content
				const cleanedContent = clearAllMarks(trimmed);
				return `- [ ] ${cleanedContent}`;
			}
			return line;
		});

		// Add metadata for checkbox mode
		return this.addMetadataToContent(processedLines.join("\n"));
	}

	/**
	 * Add metadata to content
	 */
	private addMetadataToContent(content: string): string {
		const metadata: string[] = [];

		// Add date metadata
		if (this.taskMetadata.dueDate) {
			metadata.push(`📅 ${this.formatDate(this.taskMetadata.dueDate)}`);
		}

		// Add priority metadata
		if (this.taskMetadata.priority) {
			const priorityIcons = ["⏬", "🔽", "🔼", "⏫", "🔺"];
			metadata.push(priorityIcons[this.taskMetadata.priority - 1]);
		}

		// Add tags
		if (this.taskMetadata.tags && this.taskMetadata.tags.length > 0) {
			metadata.push(...this.taskMetadata.tags.map((tag) => `#${tag}`));
		}

		// Add metadata to content
		if (metadata.length > 0) {
			return `${content} ${metadata.join(" ")}`;
		}

		return content;
	}

	/**
	 * Parse content and update button states
	 */
	public parseContentAndUpdateButtons(): void {
		try {
			const content = this.capturedContent.trim();
			if (!content) {
				// Update button states based on existing taskMetadata
				this.updateButtonState(
					this.dateButton!,
					!!this.taskMetadata.dueDate,
				);
				this.updateButtonState(
					this.priorityButton!,
					!!this.taskMetadata.priority,
				);
				this.updateButtonState(
					this.tagButton!,
					!!(
						this.taskMetadata.tags &&
						this.taskMetadata.tags.length > 0
					),
				);
				this.updateButtonState(
					this.locationButton!,
					!!(
						this.taskMetadata.location ||
						this.taskMetadata.targetFile
					),
				);
				return;
			}

			// Create a parser to extract metadata
			const parser = new ConfigurableTaskParser({});

			// Extract metadata and tags
			const [cleanedContent, metadata, tags] =
				parser.extractMetadataAndTags(content);

			// Update taskMetadata based on parsed content
			if (metadata.dueDate) {
				this.taskMetadata.dueDate = new Date(metadata.dueDate);
			}

			if (metadata.priority) {
				const priorityMap: Record<string, number> = {
					highest: 5,
					high: 4,
					medium: 3,
					low: 2,
					lowest: 1,
				};
				this.taskMetadata.priority =
					priorityMap[metadata.priority] || 3;
			}

			if (tags && tags.length > 0) {
				if (!this.taskMetadata.tags) {
					this.taskMetadata.tags = [];
				}
				// Merge new tags with existing ones
				tags.forEach((tag) => {
					if (!this.taskMetadata.tags!.includes(tag)) {
						this.taskMetadata.tags!.push(tag);
					}
				});
			}

			// Update button states
			this.updateButtonState(
				this.dateButton!,
				!!this.taskMetadata.dueDate,
			);
			this.updateButtonState(
				this.priorityButton!,
				!!this.taskMetadata.priority,
			);
			this.updateButtonState(
				this.tagButton!,
				!!(this.taskMetadata.tags && this.taskMetadata.tags.length > 0),
			);
			this.updateButtonState(
				this.locationButton!,
				!!(
					this.taskMetadata.location ||
					this.taskMetadata.targetFile ||
					metadata.project ||
					metadata.location
				),
			);
		} catch (error) {
			console.error("Error parsing content:", error);
			// On error, still update button states
			this.updateButtonState(
				this.dateButton!,
				!!this.taskMetadata.dueDate,
			);
			this.updateButtonState(
				this.priorityButton!,
				!!this.taskMetadata.priority,
			);
			this.updateButtonState(
				this.tagButton!,
				!!(this.taskMetadata.tags && this.taskMetadata.tags.length > 0),
			);
			this.updateButtonState(
				this.locationButton!,
				!!(this.taskMetadata.location || this.taskMetadata.targetFile),
			);
		}
	}

	/**
	 * Reset UI elements
	 */
	protected resetUIElements(): void {
		// Reset button states
		if (this.dateButton) this.updateButtonState(this.dateButton, false);
		if (this.priorityButton)
			this.updateButtonState(this.priorityButton, false);
		if (this.tagButton) this.updateButtonState(this.tagButton, false);
		if (this.locationButton)
			this.updateButtonState(this.locationButton, false);
	}

	/**
	 * Clean up on close
	 */
	onClose() {
		// Clean up universal suggest
		if (this.universalSuggest) {
			this.universalSuggest.disable();
			this.universalSuggest = null;
		}

		// Clean up file suggest
		if (this.fileSuggest) {
			this.fileSuggest.close();
			this.fileSuggest = null;
		}

		// Clean up suggest
		if (this.minimalSuggest) {
			this.minimalSuggest.setMinimalMode(false);
		}

		// Clean up modal reference
		delete (this.modalEl as any).__minimalQuickCaptureModal;

		super.onClose();
	}
}
