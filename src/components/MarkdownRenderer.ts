import {
	App,
	Component,
	MarkdownRenderer as ObsidianMarkdownRenderer,
	TFile,
} from "obsidian";
import { DEFAULT_SYMBOLS } from "../common/default-symbol";

export function clearAllMarks(markdown: string): string {
	if (!markdown) return markdown;

	// Remove task metadata symbols and their associated dates/values
	const symbolsToRemove = [
		DEFAULT_SYMBOLS.startDateSymbol,
		DEFAULT_SYMBOLS.createdDateSymbol,
		DEFAULT_SYMBOLS.scheduledDateSymbol,
		DEFAULT_SYMBOLS.dueDateSymbol,
		DEFAULT_SYMBOLS.doneDateSymbol,
		DEFAULT_SYMBOLS.cancelledDateSymbol,
		DEFAULT_SYMBOLS.recurrenceSymbol,
		DEFAULT_SYMBOLS.onCompletionSymbol,
		DEFAULT_SYMBOLS.dependsOnSymbol,
		DEFAULT_SYMBOLS.idSymbol,
	];

	let cleanedMarkdown = markdown;

	// Remove date fields (symbol followed by date)
	symbolsToRemove.forEach((symbol) => {
		const regex = new RegExp(
			`${symbol}\\uFE0F? *\\d{4}-\\d{2}-\\d{2}`,
			"gu"
		);
		cleanedMarkdown = cleanedMarkdown.replace(regex, "");
	});

	// Remove priority markers
	cleanedMarkdown = cleanedMarkdown.replace(/🔼|⏫|🔽|⏬|🔺|\[#[A-C]\]/g, "");

	// Remove recurrence information
	const recurrenceRegex = new RegExp(
		`${DEFAULT_SYMBOLS.recurrenceSymbol}\\uFE0F? *[a-zA-Z0-9, !]+`,
		"gu"
	);
	cleanedMarkdown = cleanedMarkdown.replace(recurrenceRegex, "");

	// Clean up any double spaces created by removing symbols
	cleanedMarkdown = cleanedMarkdown.replace(/\s+/g, " ").trim();

	cleanedMarkdown = cleanedMarkdown.replace(/^# /, "");
	cleanedMarkdown = cleanedMarkdown.replace(
		/^(-|\d+\.|\*|\+)\s\[(.)\]\s*/,
		""
	);
	return cleanedMarkdown.trim();
}

/**
 * A wrapper component for Obsidian's MarkdownRenderer
 * This provides a simpler interface for rendering markdown content in the plugin
 * with additional features for managing render state and optimizing updates
 */
export class MarkdownRendererComponent extends Component {
	private container: HTMLElement;
	private sourcePath: string;
	private currentFile: TFile | null = null;
	private renderQueue: Array<{ markdown: string; blockId?: string }> = [];
	private isRendering: boolean = false;
	private blockElements: Map<string, HTMLElement> = new Map();

	constructor(
		private app: App,
		container: HTMLElement,
		sourcePath: string = ""
	) {
		super();
		this.container = container;
		this.sourcePath = sourcePath;
	}

	/**
	 * Set the current file context for rendering
	 * @param file The file to use as context for rendering
	 */
	public setFile(file: TFile) {
		this.currentFile = file;
		this.sourcePath = file.path;
	}

	/**
	 * Get the current file being used for rendering context
	 */
	public get file(): TFile | null {
		return this.currentFile;
	}

	/**
	 * Render markdown content to the container
	 * @param markdown The markdown content to render
	 * @param clearContainer Whether to clear the container before rendering
	 */
	public async render(
		markdown: string,
		clearContainer: boolean = true
	): Promise<void> {
		if (clearContainer) {
			this.clear();
		}

		// Split content into blocks based on double line breaks
		const blocks = this.splitIntoBlocks(markdown);

		// Create block elements for each content block
		for (let i = 0; i < blocks.length; i++) {
			const blockId = `block-${Date.now()}-${i}`;
			const blockEl = this.container.createEl("div", {
				cls: ["markdown-block", "markdown-renderer"],
			});
			blockEl.dataset.blockId = blockId;
			this.blockElements.set(blockId, blockEl);

			// Queue this block for rendering
			this.queueRender(blocks[i], blockId);
		}

		// Start processing the queue
		this.processRenderQueue();
	}

	/**
	 * Split markdown content into blocks based on double line breaks
	 */
	private splitIntoBlocks(markdown: string): string[] {
		// Split on double newlines (paragraph breaks)
		return clearAllMarks(markdown)
			.split(/\n\s*\n/)
			.filter((block) => block.trim().length > 0);
	}

	/**
	 * Queue a markdown block for rendering
	 */
	private queueRender(markdown: string, blockId?: string): void {
		this.renderQueue.push({ markdown, blockId });
		this.processRenderQueue();
	}

	/**
	 * Process the render queue if not already processing
	 */
	private async processRenderQueue(): Promise<void> {
		if (this.isRendering || this.renderQueue.length === 0) {
			return;
		}

		this.isRendering = true;

		try {
			while (this.renderQueue.length > 0) {
				const item = this.renderQueue.shift();
				if (!item) continue;

				const { markdown, blockId } = item;

				if (blockId) {
					// Render to a specific block
					const blockEl = this.blockElements.get(blockId);
					if (blockEl) {
						blockEl.empty();
						await ObsidianMarkdownRenderer.render(
							this.app,
							markdown,
							blockEl,
							this.sourcePath,
							this
						);
					}
				} else {
					// Render to the main container
					await ObsidianMarkdownRenderer.render(
						this.app,
						markdown,
						this.container,
						this.sourcePath,
						this
					);
				}

				// Small delay to prevent UI freezing with large content
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		} finally {
			this.isRendering = false;
		}
	}

	/**
	 * Update a specific block with new content
	 * @param blockId The ID of the block to update
	 * @param markdown The new markdown content
	 */
	public updateBlock(blockId: string, markdown: string): void {
		if (this.blockElements.has(blockId)) {
			this.queueRender(markdown, blockId);
		}
	}

	/**
	 * Update the entire content with new markdown
	 * @param markdown The new markdown content
	 */
	public update(markdown: string): void {
		// Clear existing queue
		this.renderQueue = [];
		// Render the new content
		this.render(markdown, true);
	}

	/**
	 * Add a new block at the end of the container
	 * @param markdown The markdown content for the new block
	 * @returns The ID of the new block
	 */
	public addBlock(markdown: string): string {
		const blockId = `block-${Date.now()}-${this.blockElements.size}`;
		const blockEl = this.container.createEl("div", {
			cls: "markdown-block",
		});
		blockEl.dataset.blockId = blockId;
		this.blockElements.set(blockId, blockEl);

		this.queueRender(markdown, blockId);
		return blockId;
	}

	/**
	 * Remove a specific block
	 * @param blockId The ID of the block to remove
	 */
	public removeBlock(blockId: string): void {
		const blockEl = this.blockElements.get(blockId);
		if (blockEl) {
			blockEl.remove();
			this.blockElements.delete(blockId);
		}
	}

	/**
	 * Clear all content and blocks
	 */
	public clear(): void {
		this.container.empty();
		this.blockElements.clear();
		this.renderQueue = [];
	}

	onunload(): void {
		this.clear();
		super.onunload();
	}
}
