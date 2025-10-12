import { ItemView, MarkdownRenderer, WorkspaceLeaf } from "obsidian";
import type TaskProgressBarPlugin from "@/index";
import { getCachedChangelog } from "@/utils/changelog-cache";
import { t } from "@/translations/helper";

export const CHANGELOG_VIEW_TYPE = "task-genius-changelog";

interface ChangelogContent {
	version: string;
	markdown: string;
	sourceUrl: string;
}

export class ChangelogView extends ItemView {
	private plugin: TaskProgressBarPlugin;
	private content: ChangelogContent | null = null;
	private isLoading = false;
	private error: string | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TaskProgressBarPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return CHANGELOG_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t("Changelog");
	}

	getIcon(): string {
		return "task-genius";
	}

	async onOpen() {
		this.tryLoadCachedContent();
		await this.render();
	}

	async onClose() {
		this.containerEl.empty();
	}

	private tryLoadCachedContent(): void {
		const manifestVersion = this.plugin.manifest?.version;
		if (!manifestVersion) {
			return;
		}

		const isBeta = manifestVersion.toLowerCase().includes("beta");
		const cached = getCachedChangelog(manifestVersion, isBeta, this.app);

		console.log("[TG]", cached);
		if (!cached) {
			return;
		}

		this.isLoading = false;
		this.error = null;
		this.content = {
			version: cached.version,
			markdown: cached.markdown,
			sourceUrl: cached.sourceUrl,
		};
	}

	showLoading(version: string) {
		this.isLoading = true;
		this.error = null;
		this.content = {
			version,
			markdown: "",
			sourceUrl: "",
		};
		void this.render();
	}

	async setContent(content: ChangelogContent) {
		this.isLoading = false;
		this.error = null;
		this.content = content;
		await this.render();
	}

	showError(message: string) {
		this.isLoading = false;
		this.error = message;
		void this.render();
	}

	private async render(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("tg-changelog-view");

		const headerEl = containerEl.createDiv({
			cls: "tg-changelog-header",
		});

		headerEl.createEl("h2", {
			text: t("Task Genius Changelog"),
		});

		if (this.content?.version) {
			const metaEl = headerEl.createDiv({
				cls: "tg-changelog-meta",
			});

			metaEl.createSpan({
				text: `Version ${this.content.version}`,
			});

			if (this.content.sourceUrl) {
				metaEl.createSpan({ text: " • " });
				metaEl.createEl("a", {
					text: "View full changelog",
					href: "https://taskgenius.md/changelog",
					attr: {
						target: "_blank",
						rel: "noopener noreferrer",
					},
				});
			}
		}

		const bodyEl = containerEl.createDiv({
			cls: "tg-changelog-body markdown-preview-view",
		});

		if (this.isLoading) {
			bodyEl.createEl("p", { text: "Loading changelog..." });
			return;
		}

		if (this.error) {
			bodyEl.createEl("p", {
				text: this.error,
				attr: { class: "tg-changelog-error" },
			});
			return;
		}

		if (this.content?.markdown) {
			await MarkdownRenderer.render(
				this.plugin.app,
				this.content.markdown,
				bodyEl,
				"",
				this.plugin,
			);
			return;
		}

		bodyEl.createEl("p", {
			text: "No changelog information available.",
		});
	}
}
