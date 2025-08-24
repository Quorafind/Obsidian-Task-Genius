import { App, Modal } from "obsidian";

export class IframeModal extends Modal {
	private url: string;
	private title?: string;

	constructor(app: App, url: string, title?: string) {
		super(app);
		this.url = url;
		this.title = title;
	}

	onOpen() {
		if (this.title) {
			this.titleEl.setText(this.title);
		}

		const { contentEl } = this;
		this.modalEl.toggleClass("task-genius-iframe-modal", true);
		contentEl.empty();

		const container = contentEl.createDiv({ cls: "iframe-modal-container" });
		container.setAttr("style", "width: 100%; height: 80vh; display: flex;");

		const iframe = container.createEl("iframe");
		iframe.setAttr("src", this.url);
		iframe.setAttr("style", "flex: 1; border: none; width: 100%; height: 100%;");
	}

	onClose() {
		this.contentEl.empty();
	}
}

