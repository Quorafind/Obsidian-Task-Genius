import {
	App,
	Modal,
	Notice,
	TFile,
	moment,
	EditorPosition,
	Menu,
	setIcon,
} from "obsidian";
import {
	createEmbeddableMarkdownEditor,
	EmbeddableMarkdownEditor,
} from "../editor-extensions/core/markdown-editor";
import TaskProgressBarPlugin from "../index";
import { saveCapture } from "../utils/file/file-operations";
import { t } from "../translations/helper";
import { MinimalQuickCaptureSuggest } from "./MinimalQuickCaptureSuggest";
import { DatePickerPopover } from "./date-picker/DatePickerPopover";
import { TagSuggest } from "./AutoComplete";
import { SuggestManager, UniversalEditorSuggest } from "./suggest";
import { ConfigurableTaskParser } from "../dataflow/core/ConfigurableTaskParser";
import { clearAllMarks } from "./MarkdownRenderer";

interface TaskMetadata {
	startDate?: Date;
	dueDate?: Date;
	scheduledDate?: Date;
	priority?: number;
	project?: string;
	context?: string;
	tags?: string[];
	location?: "fixed" | "daily-note";
	targetFile?: string;
}

export class MinimalQuickCaptureModal extends Modal {
	plugin: TaskProgressBarPlugin;
	markdownEditor: EmbeddableMarkdownEditor | null = null;
	capturedContent: string = "";
	taskMetadata: TaskMetadata = {};

	// UI Elements
	private dateButton: HTMLButtonElement | null = null;
	private priorityButton: HTMLButtonElement | null = null;
	private locationButton: HTMLButtonElement | null = null;
	private tagButton: HTMLButtonElement | null = null;

	// Suggest instances
	private minimalSuggest: MinimalQuickCaptureSuggest;
	private suggestManager: SuggestManager;
	private universalSuggest: UniversalEditorSuggest | null = null;

	constructor(app: App, plugin: TaskProgressBarPlugin) {
		super(app);
		this.plugin = plugin;
		this.minimalSuggest = plugin.minimalQuickCaptureSuggest;

		// Initialize suggest manager
		this.suggestManager = new SuggestManager(app, plugin);

		// Initialize default metadata with fallback
		const minimalSettings =
			this.plugin.settings.quickCapture.minimalModeSettings;
		this.taskMetadata.location =
			this.plugin.settings.quickCapture.targetType || "fixed";
		this.taskMetadata.targetFile = this.getTargetFile();
	}

	onOpen() {
		const { contentEl } = this;
		this.modalEl.addClass("quick-capture-modal");
		this.modalEl.addClass("minimal");

		// Store modal instance reference for suggest system
		(this.modalEl as any).__minimalQuickCaptureModal = this;

		// Start managing suggests with high priority
		this.suggestManager.startManaging();

		// Set up the suggest system
		if (this.minimalSuggest) {
			this.minimalSuggest.setMinimalMode(true);
		}

		// Create the interface
		this.createMinimalInterface(contentEl);

		// Enable universal suggest for minimal modal after editor is created
		setTimeout(() => {
			if (this.markdownEditor?.editor?.editor) {
				this.universalSuggest =
					this.suggestManager.enableForMinimalModal(
						this.markdownEditor.editor.editor
					);
				this.universalSuggest.enable();
			}
		}, 100);
	}

	onClose() {
		// Clean up universal suggest
		if (this.universalSuggest) {
			this.universalSuggest.disable();
			this.universalSuggest = null;
		}

		// Stop managing suggests and restore original order
		this.suggestManager.stopManaging();

		// Clean up suggest
		if (this.minimalSuggest) {
			this.minimalSuggest.setMinimalMode(false);
		}

		// Clean up editor
		if (this.markdownEditor) {
			this.markdownEditor.destroy();
			this.markdownEditor = null;
		}

		// Clean up modal reference
		delete (this.modalEl as any).__minimalQuickCaptureModal;

		// Clear content
		this.contentEl.empty();
	}

	private createMinimalInterface(contentEl: HTMLElement) {
		// Title
		this.titleEl.setText(t("Minimal Quick Capture"));

		// Editor container
		const editorContainer = contentEl.createDiv({
			cls: "quick-capture-minimal-editor-container",
		});

		this.setupMarkdownEditor(editorContainer);

		// Bottom buttons container
		const buttonsContainer = contentEl.createDiv({
			cls: "quick-capture-minimal-buttons",
		});

		this.createQuickActionButtons(buttonsContainer);
		this.createMainButtons(buttonsContainer);
	}

	private setupMarkdownEditor(container: HTMLElement) {
		setTimeout(() => {
			this.markdownEditor = createEmbeddableMarkdownEditor(
				this.app,
				container,
				{
					placeholder: t("Enter your task..."),
					singleLine: true, // Single line mode

					onEnter: (editor, mod, shift) => {
						if (mod) {
							// Submit on Cmd/Ctrl+Enter
							this.handleSubmit();
							return true;
						}
						// In minimal mode, Enter should also submit
						this.handleSubmit();
						return true;
					},

					onEscape: (editor) => {
						this.close();
					},

					onChange: (update) => {
						this.capturedContent = this.markdownEditor?.value || "";
						// Parse content and update button states
						this.parseContentAndUpdateButtons();
					},
				}
			);

			// Focus the editor
			this.markdownEditor?.editor?.focus();
		}, 50);
	}

	private createQuickActionButtons(container: HTMLElement) {
		const settings =
			this.plugin.settings.quickCapture.minimalModeSettings || {};
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
			this.showPriorityMenu()
		);
		this.updateButtonState(
			this.priorityButton,
			!!this.taskMetadata.priority
		);

		this.locationButton = leftContainer.createEl("button", {
			cls: ["quick-action-button", "clickable-icon"],
			attr: { "aria-label": t("Set location") },
		});
		setIcon(this.locationButton, "folder");
		this.locationButton.addEventListener("click", () =>
			this.showLocationMenu()
		);
		this.updateButtonState(
			this.locationButton,
			this.taskMetadata.location !==
				(this.plugin.settings.quickCapture.targetType || "fixed")
		);

		this.tagButton = leftContainer.createEl("button", {
			cls: ["quick-action-button", "clickable-icon"],
			attr: { "aria-label": t("Add tags") },
		});
		setIcon(this.tagButton, "tag");
		this.tagButton.addEventListener("click", () => {});
		this.updateButtonState(
			this.tagButton,
			!!(this.taskMetadata.tags && this.taskMetadata.tags.length > 0)
		);
	}

	private createMainButtons(container: HTMLElement) {
		const rightContainer = container.createDiv({
			cls: "quick-actions-right",
		});

		// Save button
		const saveButton = rightContainer.createEl("button", {
			text: t("Save"),
			cls: "mod-cta quick-action-save",
		});
		saveButton.addEventListener("click", () => this.handleSubmit());
	}

	private updateButtonState(button: HTMLButtonElement, isActive: boolean) {
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
			})
		);
	}

	// Methods called by MinimalQuickCaptureSuggest
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
							this.formatDate(quickDate.date)
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
				// Open full date picker
				// TODO: Implement full date picker integration
			});
		});

		// Show menu at cursor position if provided, otherwise at button
		if (coords) {
			this.showMenuAtCoords(menu, coords.left, coords.top);
		} else if (this.dateButton) {
			const rect = this.dateButton.getBoundingClientRect();
			this.showMenuAtCoords(
				menu,
				rect.left,
				rect.bottom + 5
			);
		}
	}

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

		// Show menu at cursor position if provided, otherwise at button
		if (coords) {
			this.showMenuAtCoords(menu, coords.left, coords.top);
		} else if (this.priorityButton) {
			const rect = this.priorityButton.getBoundingClientRect();
			this.showMenuAtCoords(
				menu,
				rect.left,
				rect.bottom + 5
			);
		}
	}

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
							"fixed")
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
							"fixed")
				);

				// If called from suggest, replace the 📁 with daily note text
				if (cursor && this.markdownEditor) {
					this.replaceAtCursor(cursor, t("Daily note"));
				}
			});
		});

		// Show menu at cursor position if provided, otherwise at button
		if (coords) {
			this.showMenuAtCoords(menu, coords.left, coords.top);
		} else if (this.locationButton) {
			const rect = this.locationButton.getBoundingClientRect();
			this.showMenuAtCoords(
				menu,
				rect.left,
				rect.bottom + 5
			);
		}
	}

	public showTagSelectorAtCursor(cursorCoords: any, cursor: EditorPosition) {}

	private replaceAtCursor(cursor: EditorPosition, replacement: string) {
		if (!this.markdownEditor) return;

		// Replace the character at cursor position using CodeMirror API
		const cm = (this.markdownEditor.editor as any).cm;
		if (cm && cm.replaceRange) {
			cm.replaceRange(
				replacement,
				{ line: cursor.line, ch: cursor.ch - 1 },
				cursor
			);
		}
	}

	private getTargetFile(): string {
		const settings = this.plugin.settings.quickCapture;
		if (this.taskMetadata.location === "daily-note") {
			return this.getDailyNoteFile();
		}
		return settings.targetFile;
	}

	private getDailyNoteFile(): string {
		const settings = this.plugin.settings.quickCapture.dailyNoteSettings;
		const dateStr = moment().format(settings.format);
		return settings.folder
			? `${settings.folder}/${dateStr}.md`
			: `${dateStr}.md`;
	}

	private formatDate(date: Date): string {
		return moment(date).format("YYYY-MM-DD");
	}

	private processMinimalContent(content: string): string {
		if (!content.trim()) return "";

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
		return processedLines.join("\n");
	}

	/**
	 * Clean temporary marks from user input that might conflict with formal metadata
	 */
	private cleanTemporaryMarks(content: string): string {
		let cleaned = content;

		// Remove standalone exclamation marks that users might type for priority
		cleaned = cleaned.replace(/\s*!\s*/g, " ");

		// Remove standalone tilde marks that users might type for date
		cleaned = cleaned.replace(/\s*~\s*/g, " ");

		// Remove standalone priority symbols that users might type
		cleaned = cleaned.replace(/\s*[🔺⏫🔼🔽⏬️]\s*/g, " ");

		// Remove standalone date symbols that users might type
		cleaned = cleaned.replace(/\s*[📅🛫⏳✅➕❌]\s*/g, " ");

		// Remove location/folder symbols that users might type
		cleaned = cleaned.replace(/\s*[📁🏠🏢🏪🏫🏬🏭🏯🏰]\s*/g, " ");

		// Remove other metadata symbols that users might type
		cleaned = cleaned.replace(/\s*[🆔⛔🏁🔁]\s*/g, " ");

		// Remove target/location prefix patterns (like @location, target:)
		cleaned = cleaned.replace(/\s*@\w*\s*/g, " ");
		cleaned = cleaned.replace(/\s*target:\s*/gi, " ");

		// Clean up multiple spaces and trim
		cleaned = cleaned.replace(/\s+/g, " ").trim();

		return cleaned;
	}

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

	private async handleSubmit() {
		const content = this.capturedContent.trim();

		if (!content) {
			new Notice(t("Nothing to capture"));
			return;
		}

		try {
			// Process content
			let processedContent = this.processMinimalContent(content);
			processedContent = this.addMetadataToContent(processedContent);

			// Save options
			const captureOptions = {
				...this.plugin.settings.quickCapture,
				targetFile:
					this.taskMetadata.targetFile || this.getTargetFile(),
				targetType: this.taskMetadata.location || "fixed",
			};

			await saveCapture(this.app, processedContent, captureOptions);
			new Notice(t("Captured successfully"));
			this.close();
		} catch (error) {
			new Notice(`${t("Failed to save:")} ${error}`);
		}
	}

	/**
	 * Parse the content and update button states based on extracted metadata
	 * Only update taskMetadata if actual marks exist in content, preserve manually set values
	 */
	public parseContentAndUpdateButtons(): void {
		try {
			const content = this.capturedContent.trim();
			if (!content) {
				// Update button states based on existing taskMetadata
				this.updateButtonState(this.dateButton!, !!this.taskMetadata.dueDate);
				this.updateButtonState(this.priorityButton!, !!this.taskMetadata.priority);
				this.updateButtonState(this.tagButton!, !!(this.taskMetadata.tags && this.taskMetadata.tags.length > 0));
				this.updateButtonState(this.locationButton!, !!(this.taskMetadata.location || this.taskMetadata.targetFile));
				return;
			}

			// Create a parser to extract metadata
			const parser = new ConfigurableTaskParser({
				// Use default configuration
			});

			// Extract metadata and tags
			const [cleanedContent, metadata, tags] = parser.extractMetadataAndTags(content);

			// Only update taskMetadata if we found actual marks in the content
			// This preserves manually set values from suggest system
			
			// Due date - only update if found in content
			if (metadata.dueDate) {
				this.taskMetadata.dueDate = new Date(metadata.dueDate);
			}
			// Don't delete existing dueDate if not found in content

			// Priority - only update if found in content
			if (metadata.priority) {
				const priorityMap: Record<string, number> = {
					"highest": 5,
					"high": 4,
					"medium": 3,
					"low": 2,
					"lowest": 1
				};
				this.taskMetadata.priority = priorityMap[metadata.priority] || 3;
			}
			// Don't delete existing priority if not found in content

			// Tags - only add new tags, don't replace existing ones
			if (tags && tags.length > 0) {
				if (!this.taskMetadata.tags) {
					this.taskMetadata.tags = [];
				}
				// Merge new tags with existing ones, avoid duplicates
				tags.forEach(tag => {
					if (!this.taskMetadata.tags!.includes(tag)) {
						this.taskMetadata.tags!.push(tag);
					}
				});
			}

			// Update button states based on current taskMetadata
			this.updateButtonState(this.dateButton!, !!this.taskMetadata.dueDate);
			this.updateButtonState(this.priorityButton!, !!this.taskMetadata.priority);
			this.updateButtonState(this.tagButton!, !!(this.taskMetadata.tags && this.taskMetadata.tags.length > 0));
			this.updateButtonState(this.locationButton!, !!(this.taskMetadata.location || this.taskMetadata.targetFile || metadata.project || metadata.location));

		} catch (error) {
			console.error("Error parsing content:", error);
			// On error, still update button states based on existing taskMetadata
			this.updateButtonState(this.dateButton!, !!this.taskMetadata.dueDate);
			this.updateButtonState(this.priorityButton!, !!this.taskMetadata.priority);
			this.updateButtonState(this.tagButton!, !!(this.taskMetadata.tags && this.taskMetadata.tags.length > 0));
			this.updateButtonState(this.locationButton!, !!(this.taskMetadata.location || this.taskMetadata.targetFile));
		}
	}
}
