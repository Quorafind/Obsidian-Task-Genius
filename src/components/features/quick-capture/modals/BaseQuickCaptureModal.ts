import {
	App,
	Modal,
	TFile,
	Notice,
	moment,
	ButtonComponent,
	setIcon,
} from "obsidian";
import TaskProgressBarPlugin from "@/index";
import {
	saveCapture,
	processDateTemplates,
} from "@/utils/file/file-operations";
import { t } from "@/translations/helper";
import { SuggestManager } from "@/components/ui/suggest";
import { EmbeddableMarkdownEditor } from "@/editor-extensions/core/markdown-editor";

/**
 * Quick capture save strategy types
 */
export type QuickCaptureMode = "checkbox" | "file";

/**
 * Task metadata interface
 */
export interface TaskMetadata {
	startDate?: Date;
	dueDate?: Date;
	scheduledDate?: Date;
	priority?: number;
	project?: string;
	context?: string;
	recurrence?: string;
	status?: string;
	tags?: string[];
	location?: "fixed" | "daily-note" | "file";
	targetFile?: string;
	customFileName?: string;
	// Track which fields were manually set by user
	manuallySet?: {
		startDate?: boolean;
		dueDate?: boolean;
		scheduledDate?: boolean;
	};
}

/**
 * Base class for all Quick Capture modals
 * Provides shared functionality and state management
 */
const LAST_USED_MODE_KEY = "task-genius.lastUsedQuickCaptureMode";

export abstract class BaseQuickCaptureModal extends Modal {
	plugin: TaskProgressBarPlugin;
	protected markdownEditor: EmbeddableMarkdownEditor | null = null;
	protected capturedContent: string = "";
	protected taskMetadata: TaskMetadata = {};
	protected currentMode: QuickCaptureMode;
	protected suggestManager: SuggestManager;
	protected inlineModeAvailable: boolean = true;
	protected fileModeAvailable: boolean = false;

	// UI Elements
	protected headerContainer: HTMLElement | null = null;
	protected contentContainer: HTMLElement | null = null;
	protected footerContainer: HTMLElement | null = null;

	// Settings
	protected tempTargetFilePath: string = "";
	protected preferMetadataFormat: "dataview" | "tasks" = "tasks";
	protected keepOpenAfterCapture: boolean = false;

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		initialMode: QuickCaptureMode = "checkbox",
		metadata?: TaskMetadata
	) {
		super(app);
		this.plugin = plugin;
		this.currentMode = initialMode;

		const scopeControls =
			this.plugin.settings.fileFilter?.scopeControls;
		this.inlineModeAvailable =
			scopeControls?.inlineTasksEnabled !== false;
		this.fileModeAvailable =
			(this.plugin.settings.fileSource?.enabled ?? false) &&
			scopeControls?.fileTasksEnabled !== false;
		if (!scopeControls) {
			this.inlineModeAvailable = true;
			this.fileModeAvailable =
				this.plugin.settings.fileSource?.enabled ?? false;
		}
		if (!this.inlineModeAvailable && !this.fileModeAvailable) {
			this.inlineModeAvailable = true;
		}

		// Initialize suggest manager
		this.suggestManager = new SuggestManager(app, plugin);

		// Initialize metadata
		if (metadata) {
			this.taskMetadata = metadata;
			// Auto-switch to file mode if location is file
			if (metadata.location === "file") {
				this.currentMode = "file";
			}
		}

		// If FileSource is disabled, force mode to checkbox
		if (this.currentMode === "file" && !this.fileModeAvailable) {
			this.currentMode = "checkbox";
		} else if (
			this.currentMode === "checkbox" &&
			!this.inlineModeAvailable &&
			this.fileModeAvailable
		) {
			this.currentMode = "file";
		}

		// Initialize settings
		this.preferMetadataFormat = this.plugin.settings.preferMetadataFormat;
		this.keepOpenAfterCapture =
			this.plugin.settings.quickCapture.keepOpenAfterCapture || false;

		// Initialize target file path
		this.initializeTargetFile();
	}

	/**
	 * Initialize target file based on settings
	 */
	protected initializeTargetFile(): void {
		const settings = this.plugin.settings.quickCapture;

		if (
			this.taskMetadata.location === "file" &&
			this.taskMetadata.customFileName
		) {
			this.tempTargetFilePath = this.taskMetadata.customFileName;
		} else if (settings.targetType === "daily-note") {
			const dateStr = moment().format(settings.dailyNoteSettings.format);
			const pathWithDate = settings.dailyNoteSettings.folder
				? `${settings.dailyNoteSettings.folder}/${dateStr}.md`
				: `${dateStr}.md`;
			this.tempTargetFilePath = this.sanitizeFilePath(pathWithDate);
		} else {
			this.tempTargetFilePath = settings.targetFile;
		}
	}

	/**
	 * Called when the modal is opened
	 */
	onOpen() {
		const {contentEl} = this;
		this.modalEl.toggleClass("quick-capture-modal", true);
		this.modalEl.toggleClass(`quick-capture-${this.currentMode}`, true);

		// Start managing suggests
		this.suggestManager.startManaging();

		// Create base UI structure
		this.createBaseUI(contentEl);

		// Let subclasses create their UI (should create editor container)
		this.createUI();

		// Initialize editor and other components after UI is created
		this.initializeComponents();
	}

	/**
	 * Create base UI structure
	 */
	protected createBaseUI(contentEl: HTMLElement): void {
		// Create header container
		this.titleEl.toggleClass("quick-capture-header", true);
		this.headerContainer = this.titleEl;
		this.createHeader();

		// Create content container
		this.contentContainer = contentEl.createDiv({
			cls: "quick-capture-content",
		});

		// Create footer container
		this.footerContainer = contentEl.createDiv({
			cls: "quick-capture-footer",
		});
		this.createFooter();
	}

	/**
	 * Create header with save strategy switcher and clear button
	 */
	protected createHeader(): void {
		if (!this.headerContainer) return;

		// Left side: Save strategy tabs with ARIA attributes
		const tabContainer = this.headerContainer.createDiv({
			cls: "quick-capture-tabs",
			attr: {
				role: "tablist",
				"aria-label": t("Save mode selection"),
			},
		});

		// Checkbox mode button (save as checkbox task)
		if (this.inlineModeAvailable) {
			const checkboxButton = new ButtonComponent(tabContainer)
				.setClass("quick-capture-tab")
				.onClick(() => this.switchMode("checkbox"));

			checkboxButton.buttonEl.toggleClass("clickable-icon", true);

			const checkboxButtonEl = checkboxButton.buttonEl;
			checkboxButtonEl.setAttribute("role", "tab");
			checkboxButtonEl.setAttribute(
				"aria-selected",
				String(this.currentMode === "checkbox")
			);
			checkboxButtonEl.setAttribute(
				"aria-controls",
				"quick-capture-content"
			);
			checkboxButtonEl.setAttribute("data-mode", "checkbox");

			if (this.currentMode === "checkbox") {
				checkboxButton.setClass("active");
			}

			// Manually create spans for icon and text
			checkboxButtonEl.empty();
			const checkboxIconSpan = checkboxButtonEl.createSpan({
				cls: "quick-capture-tab-icon",
			});
			setIcon(checkboxIconSpan, "check-square");
			checkboxButtonEl.createSpan({
				text: t("Checkbox"),
				cls: "quick-capture-tab-text",
			});
		}

		// File mode button (save as file) - only when FileSource is enabled
		if (this.fileModeAvailable) {
			const fileButton = new ButtonComponent(tabContainer)
				.setClass("quick-capture-tab")
				.onClick(() => this.switchMode("file"));

			fileButton.buttonEl.toggleClass("clickable-icon", true);

			const fileButtonEl = fileButton.buttonEl;
			fileButtonEl.setAttribute("role", "tab");
			fileButtonEl.setAttribute(
				"aria-selected",
				String(this.currentMode === "file")
			);
			fileButtonEl.setAttribute("aria-controls", "quick-capture-content");
			fileButtonEl.setAttribute("data-mode", "file");

			if (this.currentMode === "file") {
				fileButton.setClass("active");
			}

			fileButtonEl.empty();
			const fileIconSpan = fileButtonEl.createSpan({
				cls: "quick-capture-tab-icon",
			});
			setIcon(fileIconSpan, "file-plus");
			fileButtonEl.createSpan({
				text: t("File"),
				cls: "quick-capture-tab-text",
			});
		}

		if (!(this.fileModeAvailable && this.inlineModeAvailable)) {
			tabContainer.classList.add("is-hidden");
			tabContainer.setAttribute("aria-hidden", "true");
		}

		// Right side: Clear button with improved styling
		if (this.fileModeAvailable && this.inlineModeAvailable) {
			const clearButton = this.headerContainer.createEl("button", {
				text: t("Clear"),
				cls: ["quick-capture-clear", "clickable-icon"],
				attr: {
					"aria-label": t("Clear all content"),
					type: "button",
				},
			});
			clearButton.addEventListener("click", () => this.handleClear());
		}
	}

	/**
	 * Create footer with continue and action buttons
	 */
	protected createFooter(): void {
		if (!this.footerContainer) return;

		// Left side: Continue creating button
		const leftContainer = this.footerContainer.createDiv({
			cls: "quick-capture-footer-left",
		});

		const continueButton = leftContainer.createEl("button", {
			text: t("Continue & New"),
			cls: "quick-capture-continue",
		});
		continueButton.addEventListener("click", () =>
			this.handleContinueCreate()
		);

		// Right side: Main action buttons
		const rightContainer = this.footerContainer.createDiv({
			cls: "quick-capture-footer-right",
		});

		// Save/Create button
		const submitButton = rightContainer.createEl("button", {
			text:
				this.currentMode === "file" ? t("Save as File") : t("Add Task"),
			cls: "mod-cta",
		});
		submitButton.addEventListener("click", () => this.handleSubmit());

		// Cancel button
		const cancelButton = rightContainer.createEl("button", {
			text: t("Cancel"),
		});
		cancelButton.addEventListener("click", () => this.close());
	}

	/**
	 * Switch to a different mode
	 */
	protected async switchMode(mode: QuickCaptureMode): Promise<void> {
		if (mode === this.currentMode) return;
		// Prevent switching to unsupported modes
		if (mode === "file" && !this.fileModeAvailable) {
			new Notice(
				t(
					"File Task is disabled. Enable FileSource in Settings to use File mode."
				)
			);
			return;
		}
		if (mode === "checkbox" && !this.inlineModeAvailable) {
			return;
		}

		// Save current state
		const savedContent = this.capturedContent;
		const savedMetadata = {...this.taskMetadata};

		// Update mode
		this.currentMode = mode;
		// Persist last used mode to local storage
		try {
			this.app.saveLocalStorage(LAST_USED_MODE_KEY, mode);
		} catch {
		}

		// Update modal classes
		this.modalEl.removeClass(
			"quick-capture-checkbox",
			"quick-capture-file"
		);
		this.modalEl.addClass(`quick-capture-${mode}`);

		// Update tab active states
		const tabs =
			this.headerContainer?.querySelectorAll(".quick-capture-tab");
		tabs?.forEach((tab) => {
			tab.removeClass("active");
			const tabMode = tab.getAttribute("data-mode");
			if (tabMode === mode) {
				tab.addClass("active");
			}
			tab.setAttribute("aria-selected", String(tabMode === mode));
		});

		// Update only the target display instead of recreating everything
		this.updateTargetDisplay();

		// Restore metadata
		this.taskMetadata = savedMetadata;

		// Update button text
		const submitButton = this.footerContainer?.querySelector(
			".mod-cta"
		) as HTMLButtonElement;
		if (submitButton) {
			submitButton.setText(
				mode === "file" ? t("Save as File") : t("Add Task")
			);
		}
	}

	/**
	 * Handle clear action
	 */
	protected handleClear(): void {
		// Clear content
		this.capturedContent = "";
		if (this.markdownEditor) {
			this.markdownEditor.set("", false);
		}

		// Clear metadata but keep location settings
		const location = this.taskMetadata.location;
		const targetFile = this.taskMetadata.targetFile;
		this.taskMetadata = {
			location,
			targetFile,
		};

		// Reset any UI elements
		this.resetUIElements();

		// Focus editor
		this.markdownEditor?.editor?.focus();
	}

	/**
	 * Handle continue & create new
	 */
	protected async handleContinueCreate(): Promise<void> {
		// First, save the current task
		const content =
			this.capturedContent.trim() ||
			this.markdownEditor?.value.trim() ||
			"";

		if (!content) {
			new Notice(t("Nothing to capture"));
			return;
		}

		try {
			await this.saveContent(content);
			new Notice(t("Captured successfully"));

			// Clear for next task but keep settings
			this.handleClear();
		} catch (error) {
			new Notice(`${t("Failed to save:")} ${error}`);
		}
	}

	/**
	 * Handle submit action
	 */
	protected async handleSubmit(): Promise<void> {
		const content =
			this.capturedContent.trim() ||
			this.markdownEditor?.value.trim() ||
			"";

		if (!content) {
			new Notice(t("Nothing to capture"));
			return;
		}

		try {
			await this.saveContent(content);
			new Notice(
				this.currentMode === "file"
					? t("File saved successfully")
					: t("Task added successfully")
			);

			if (!this.keepOpenAfterCapture) {
				this.close();
			} else {
				this.handleClear();
			}
		} catch (error) {
			new Notice(`${t("Failed to save:")} ${error}`);
		}
	}

	/**
	 * Save content based on current mode and settings
	 */
	protected async saveContent(content: string): Promise<void> {
		let processedContent = this.processContentWithMetadata(content);

		let targetFile = this.tempTargetFilePath;

		// Handle file mode
		if (this.currentMode === "file" && this.taskMetadata.customFileName) {
			targetFile = processDateTemplates(this.taskMetadata.customFileName);
			if (!targetFile.endsWith(".md")) {
				targetFile += ".md";
			}
			// Prefix default folder when configured and FileSource is enabled
			const defaultFolder =
				this.plugin.settings.quickCapture.createFileMode?.defaultFolder?.trim();
			if (
				this.plugin.settings?.fileSource?.enabled &&
				defaultFolder &&
				!targetFile.includes("/")
			) {
				targetFile = this.sanitizeFilePath(
					`${defaultFolder}/${targetFile}`
				);
			}
			// Inject frontmatter (and tags) for File mode
			const useTemplate = !!this.plugin.settings.quickCapture.createFileMode?.useTemplate;
			const hasFrontmatter = processedContent.trimStart().startsWith("---");
			if (useTemplate) {
				// Only ensure frontmatter exists
				if (!hasFrontmatter) {
					processedContent = `---\nstatus: ${JSON.stringify(this.mapStatusToText(this.taskMetadata.status))}\n---\n\n${processedContent}`;
				}
			} else {
				// Build full frontmatter only when none exists
				if (!hasFrontmatter) {
					// Status -> textual metadata
					const statusText = this.mapStatusToText(this.taskMetadata.status);
					// Dates
					const startDate = this.taskMetadata.startDate
						? this.formatDate(this.taskMetadata.startDate)
						: undefined;
					const dueDate = this.taskMetadata.dueDate
						? this.formatDate(this.taskMetadata.dueDate)
						: undefined;
					const scheduledDate = this.taskMetadata.scheduledDate
						? this.formatDate(this.taskMetadata.scheduledDate)
						: undefined;
					// Priority/project/context
					const priorityVal =
						this.taskMetadata.priority !== undefined && this.taskMetadata.priority !== null
							? String(this.taskMetadata.priority)
							: undefined;
					const projectVal = this.taskMetadata.project || undefined;
					const contextVal = this.taskMetadata.context || undefined;
					// Repeat from recurrence
					const repeatVal = this.taskMetadata.recurrence || undefined;
					// Tags: do not use recognition config at creation; only write content tags when enabled
					const writeContentTags = !!this.plugin.settings.quickCapture.createFileMode?.writeContentTagsToFrontmatter;
					const mergedTags = writeContentTags ? this.extractTagsFromContentForFrontmatter(content) : [];
					// Build YAML lines
					const yamlLines: string[] = [];
					yamlLines.push(`status: ${JSON.stringify(statusText)}`);
					if (dueDate) yamlLines.push(`dueDate: ${JSON.stringify(dueDate)}`);
					if (startDate) yamlLines.push(`startDate: ${JSON.stringify(startDate)}`);
					if (scheduledDate) yamlLines.push(`scheduledDate: ${JSON.stringify(scheduledDate)}`);
					if (priorityVal) yamlLines.push(`priority: ${JSON.stringify(priorityVal)}`);
					if (projectVal) yamlLines.push(`project: ${JSON.stringify(projectVal)}`);
					if (contextVal) yamlLines.push(`context: ${JSON.stringify(contextVal)}`);
					if (repeatVal) yamlLines.push(`repeat: ${JSON.stringify(repeatVal)}`);
					if (mergedTags.length > 0) {
						yamlLines.push(`tags: [${mergedTags.map((t) => JSON.stringify(t)).join(", ")}]`);
					}
					processedContent = `---\n${yamlLines.join("\n")}\n---\n\n${processedContent}`;
				}
			}
		}

		// Convert location/targetType to valid QuickCaptureOptions type
		let targetType: "fixed" | "daily-note" | undefined = "fixed";
		if (this.taskMetadata.location === "daily-note") {
			targetType = "daily-note";
		} else if (
			this.taskMetadata.location === "file" ||
			this.taskMetadata.location === "fixed"
		) {
			targetType = "fixed";
		} else if (
			this.plugin.settings.quickCapture.targetType === "daily-note"
		) {
			targetType = "daily-note";
		} else {
			targetType = "fixed"; // Default to fixed for custom-file or any other type
		}

		const captureOptions = {
			...this.plugin.settings.quickCapture,
			targetFile,
			targetType,
			// For file mode, always replace
			appendToFile:
				this.currentMode === "file"
					? ("replace" as const)
					: this.plugin.settings.quickCapture.appendToFile,
		};

		await saveCapture(this.app, processedContent, captureOptions);
	}

	/**
	 * Process content with metadata
	 */
	protected abstract processContentWithMetadata(content: string): string;

	/**
	 * Create UI - subclasses should create their UI here
	 */
	protected abstract createUI(): void;

	/**
	 * Update target display when mode changes
	 */
	protected abstract updateTargetDisplay(): void;

	/**
	 * Initialize components after UI creation
	 */
	protected abstract initializeComponents(): void;

	/**
	 * Reset UI elements to default state
	 */
	protected abstract resetUIElements(): void;

	/**
	 * Sanitize file path
	 */
	protected sanitizeFilePath(filePath: string): string {
		const pathParts = filePath.split("/");
		const sanitizedParts = pathParts.map((part, index) => {
			if (index === pathParts.length - 1) {
				return this.sanitizeFilename(part);
			}
			return part
				.replace(/[<>:"|*?\\]/g, "-")
				.replace(/\s+/g, " ")
				.trim();
		});
		return sanitizedParts.join("/");
	}

	/**
	 * Sanitize filename
	 */

	/**
	 * Map UI status (symbol or text) to textual metadata
	 */
	protected mapStatusToText(status?: string): string {
		if (!status) return "not-started";
		if (status.length > 1) return status; // already textual
		switch (status) {
			case "x":
			case "X":
				return "completed";
			case "/":
			case ">":
				return "in-progress";
			case "?":
				return "planned";
			case "-":
				return "cancelled";
			case " ":
			default:
				return "not-started";
		}
	}

	/**
	 * Extract #tags from content for frontmatter tags array
	 * Simple regex scan; remove leading '#', dedupe
	 */
	protected extractTagsFromContentForFrontmatter(content: string): string[] {
		if (!content) return [];
		const tagRegex = /(^|\s)#([A-Za-z0-9_\/-]+)/g;
		const results = new Set<string>();
		let match: RegExpExecArray | null;
		while ((match = tagRegex.exec(content)) !== null) {
			const tag = match[2];
			if (tag) results.add(tag);
		}
		return Array.from(results);
	}

	protected sanitizeFilename(filename: string): string {
		return filename
			.replace(/[<>:"|*?\\]/g, "-")
			.replace(/\s+/g, " ")
			.trim();
	}

	/**
	 * Format date
	 */
	protected formatDate(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
			2,
			"0"
		)}-${String(date.getDate()).padStart(2, "0")}`;
	}

	/**
	 * Parse date
	 */
	protected parseDate(dateString: string): Date {
		const [year, month, day] = dateString.split("-").map(Number);
		return new Date(year, month - 1, day);
	}

	/**
	 * Called when the modal is closed
	 */
	onClose() {
		// Stop managing suggests
		this.suggestManager.stopManaging();

		// Clean up editor
		if (this.markdownEditor) {
			this.markdownEditor.destroy();
			this.markdownEditor = null;
		}

		// Clear content
		this.contentEl.empty();
	}
}
