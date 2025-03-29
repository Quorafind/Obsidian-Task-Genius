import { App, Modal, Setting, TFile, Notice } from "obsidian";
import {
	createEmbeddableMarkdownEditor,
	EmbeddableMarkdownEditor,
} from "../editor-ext/markdownEditor";
import TaskProgressBarPlugin from "../index";
import { saveCapture } from "../utils/fileUtils";
import { FileSuggest } from "../editor-ext/quickCapture";

export class QuickCaptureModal extends Modal {
	plugin: TaskProgressBarPlugin;
	markdownEditor: EmbeddableMarkdownEditor | null = null;
	capturedContent: string = "";

	tempTargetFilePath: string = "";

	constructor(app: App, plugin: TaskProgressBarPlugin) {
		super(app);
		this.plugin = plugin;

		this.tempTargetFilePath = this.plugin.settings.quickCapture.targetFile;
	}

	onOpen() {
		const { contentEl } = this;
		this.modalEl.toggleClass("quick-capture-modal", true);

		this.titleEl.createDiv({
			text: "Capture to",
		});

		const targetFileEl = this.titleEl.createEl("div", {
			cls: "quick-capture-target",
			attr: {
				contenteditable: "true",
				spellcheck: "false",
			},
			text: this.tempTargetFilePath,
		});

		// Create container for the editor
		const editorContainer = contentEl.createDiv({
			cls: "quick-capture-modal-editor",
		});

		// Create the markdown editor with our EmbeddableMarkdownEditor
		setTimeout(() => {
			this.markdownEditor = createEmbeddableMarkdownEditor(
				this.app,
				editorContainer,
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
			this.markdownEditor?.scope.register(
				["Alt"],
				"x",
				(e: KeyboardEvent) => {
					e.preventDefault();
					targetFileEl.focus();
					return true;
				}
			);

			// Focus the editor when it's created
			this.markdownEditor?.editor?.focus();
		}, 50);

		// Create button container
		const buttonContainer = contentEl.createDiv({
			cls: "quick-capture-modal-buttons",
		});

		// Create the buttons
		const submitButton = buttonContainer.createEl("button", {
			text: "Capture",
			cls: "mod-cta",
		});
		submitButton.addEventListener("click", () => this.handleSubmit());

		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
		});
		cancelButton.addEventListener("click", () => this.close());

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

	async handleSubmit() {
		const content =
			this.capturedContent.trim() ||
			this.markdownEditor?.value.trim() ||
			"";

		if (!content) {
			new Notice("Nothing to capture");
			return;
		}

		try {
			await saveCapture(this.app, content, {
				...this.plugin.settings.quickCapture,
				targetFile: this.tempTargetFilePath,
			});
			new Notice("Captured successfully");
			this.close();
		} catch (error) {
			new Notice(`Failed to save: ${error}`);
		}
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
	}
}
