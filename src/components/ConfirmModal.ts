import { App, ButtonComponent, Modal, MarkdownRenderer } from "obsidian";
import TaskProgressBarPlugin from "../index";
import "../styles/modal.css";

export class ConfirmModal extends Modal {
	private plugin: TaskProgressBarPlugin;

	constructor(
		plugin: TaskProgressBarPlugin,
		public params: {
			title: string;
			message: string;
			confirmText: string;
			cancelText: string;
			onConfirm: (confirmed: boolean) => void;
		}
	) {
		super(plugin.app);
		this.plugin = plugin;
	}

	async onOpen() {
		this.titleEl.setText(this.params.title);

		// Check if message contains newlines to determine if Markdown rendering is needed
		if (this.params.message.includes('\n')) {
			// Use MarkdownRenderer for multi-line content
			await MarkdownRenderer.render(
				this.plugin.app,
				this.params.message,
				this.contentEl,
				'',
				this.plugin
			);
		} else {
			// Use setText for single-line content
			this.contentEl.setText(this.params.message);
		}

		const buttonsContainer = this.contentEl.createEl("div", {
			cls: "confirm-modal-buttons",
		});

		new ButtonComponent(buttonsContainer)
			.setButtonText(this.params.confirmText)
			.setCta()
			.onClick(() => {
				this.params.onConfirm(true);
				this.close();
			});

		new ButtonComponent(buttonsContainer)
			.setButtonText(this.params.cancelText)
			.setCta()
			.onClick(() => {
				this.params.onConfirm(false);
				this.close();
			});
	}

	onClose() {
		this.contentEl.empty();
	}
}
