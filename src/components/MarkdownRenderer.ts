import {
	App,
	Component,
	MarkdownRenderer as ObsidianMarkdownRenderer,
	TFile,
} from "obsidian";
import { DEFAULT_SYMBOLS, TAG_REGEX } from "../common/default-symbol";

/**
 * Remove tags while protecting content inside wiki links
 */
function removeTagsWithLinkProtection(text: string): string {
	let result = "";
	let i = 0;

	while (i < text.length) {
		// Check if we're at the start of a wiki link
		if (i < text.length - 1 && text[i] === "[" && text[i + 1] === "[") {
			// Find the end of the wiki link
			let linkEnd = i + 2;
			let bracketCount = 1;

			while (linkEnd < text.length - 1 && bracketCount > 0) {
				if (text[linkEnd] === "]" && text[linkEnd + 1] === "]") {
					bracketCount--;
					if (bracketCount === 0) {
						linkEnd += 2;
						break;
					}
				} else if (text[linkEnd] === "[" && text[linkEnd + 1] === "[") {
					bracketCount++;
					linkEnd++;
				}
				linkEnd++;
			}

			// Add the entire wiki link without tag processing
			result += text.substring(i, linkEnd);
			i = linkEnd;
		} else if (text[i] === "#") {
			// Check if this is a tag (not inside a link)
			const tagMatch = text.substring(i).match(TAG_REGEX);
			if (tagMatch && tagMatch.index === 0) {
				// Skip the entire tag
				i += tagMatch[0].length;
			} else {
				// Not a tag, keep the character
				result += text[i];
				i++;
			}
		} else {
			// Regular character, keep it
			result += text[i];
			i++;
		}
	}

	return result;
}

export function clearAllMarks(markdown: string): string {
	if (!markdown) return markdown;

	let cleanedMarkdown = markdown;

	// --- Remove Emoji/Symbol Style Metadata ---

	const symbolsToRemove = [
		DEFAULT_SYMBOLS.startDateSymbol, // 🛫
		DEFAULT_SYMBOLS.createdDateSymbol, // ➕
		DEFAULT_SYMBOLS.scheduledDateSymbol, // ⏳
		DEFAULT_SYMBOLS.dueDateSymbol, // 📅
		DEFAULT_SYMBOLS.doneDateSymbol, // ✅
		"❌", // cancelledDate
	].filter(Boolean); // Filter out any potentially undefined symbols

	// Remove date fields (symbol followed by date)
	symbolsToRemove.forEach((symbol) => {
		if (!symbol) return; // Should be redundant due to filter, but safe
		// Escape the symbol for use in regex
		const escapedSymbol = symbol.replace(/[.*+?^${}()|[\\\]]/g, "\\$&");
		const regex = new RegExp(
			`${escapedSymbol}\\uFE0F? *\\d{4}-\\d{2}-\\d{2}`, // Use escaped symbol
			"gu"
		);
		cleanedMarkdown = cleanedMarkdown.replace(regex, "");
	});

	// Remove priority markers (Emoji and Taskpaper style)
	cleanedMarkdown = cleanedMarkdown.replace(
		/\s+(?:[🔺⏫🔼🔽⏬️⏬]|\[#[A-C]\])/gu,
		""
	);

	// Remove non-date metadata fields (id, dependsOn, onCompletion)
	cleanedMarkdown = cleanedMarkdown.replace(/🆔\s*[^\s]+/g, ""); // Remove id
	cleanedMarkdown = cleanedMarkdown.replace(/⛔\s*[^\s]+/g, ""); // Remove dependsOn
	cleanedMarkdown = cleanedMarkdown.replace(/🏁\s*[^\s]+/g, ""); // Remove onCompletion

	// Remove recurrence information (Symbol + value)
	if (DEFAULT_SYMBOLS.recurrenceSymbol) {
		const escapedRecurrenceSymbol =
			DEFAULT_SYMBOLS.recurrenceSymbol.replace(
				/[.*+?^${}()|[\\\]]/g,
				"\\$&"
			);
		// Create a string of escaped date/completion symbols for the lookahead
		const escapedOtherSymbols = symbolsToRemove
			.map((s) => s!.replace(/[.*+?^${}()|[\\\]]/g, "\\$&"))
			.join("");
		
		// Add escaped non-date symbols to lookahead
		const escapedNonDateSymbols = ["🆔", "⛔", "🏁"]
			.map((s) => s.replace(/[.*+?^${}()|[\\\]]/g, "\\$&"))
			.join("");

		const recurrenceRegex = new RegExp(
			`${escapedRecurrenceSymbol}\\uFE0F? *.*?` +
				// Lookahead for: space followed by (any date/completion/recurrence symbol OR non-date symbols OR @ OR #) OR end of string
				`(?=\s(?:[${escapedOtherSymbols}${escapedNonDateSymbols}${escapedRecurrenceSymbol}]|@|#)|$)`,
			"gu"
		);
		cleanedMarkdown = cleanedMarkdown.replace(recurrenceRegex, "");
	}

	// --- Remove Dataview Style Metadata ---
	cleanedMarkdown = cleanedMarkdown.replace(
		/\[(?:due|📅|completion|✅|created|➕|start|🛫|scheduled|⏳|cancelled|❌|id|🆔|dependsOn|⛔|onCompletion|🏁|priority|repeat|recurrence|🔁|project|context)::\s*[^\]]+\]/gi,
		// Corrected the emoji in the previous attempt
		""
	);

	// --- General Cleaning ---
	// Process tags and context tags while preserving links (both wiki and markdown) and inline code

	interface PreservedSegment {
		text: string;
		index: number;
		length: number;
		id: string; // Add unique identifier for better tracking
	}

	const preservedSegments: PreservedSegment[] = [];
	const inlineCodeRegex = /`([^`]+?)`/g; // Matches `code`
	const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
	const markdownLinkRegex = /\[([^\[\]]*)\]\((.*?)\)/g; // Regex for [text](link)
	let match: RegExpExecArray | null;
	let segmentCounter = 0;

	// Find all inline code blocks first
	inlineCodeRegex.lastIndex = 0;
	while ((match = inlineCodeRegex.exec(cleanedMarkdown)) !== null) {
		preservedSegments.push({
			text: match[0],
			index: match.index,
			length: match[0].length,
			id: `code_${segmentCounter++}`,
		});
	}

	// Find all wiki links (avoid overlaps with already found segments like inline code)
	wikiLinkRegex.lastIndex = 0;
	while ((match = wikiLinkRegex.exec(cleanedMarkdown)) !== null) {
		const currentStart = match.index;
		const currentEnd = currentStart + match[0].length;
		const overlaps = preservedSegments.some(
			(ps) =>
				Math.max(ps.index, currentStart) <
				Math.min(ps.index + ps.length, currentEnd)
		);
		if (!overlaps) {
			preservedSegments.push({
				text: match[0],
				index: currentStart,
				length: match[0].length,
				id: `wiki_${segmentCounter++}`,
			});
		}
	}

	// Find all markdown links (avoid overlaps with existing segments)
	markdownLinkRegex.lastIndex = 0;
	while ((match = markdownLinkRegex.exec(cleanedMarkdown)) !== null) {
		const currentStart = match.index;
		const currentEnd = currentStart + match[0].length;
		const overlaps = preservedSegments.some(
			(ps) =>
				Math.max(ps.index, currentStart) <
				Math.min(ps.index + ps.length, currentEnd)
		);
		if (!overlaps) {
			preservedSegments.push({
				text: match[0],
				index: currentStart,
				length: match[0].length,
				id: `md_${segmentCounter++}`,
			});
		}
	}

	// Create a temporary version of markdown with all preserved segments replaced by unique placeholders
	let tempMarkdown = cleanedMarkdown;
	const placeholderMap = new Map<string, string>(); // Map placeholder to original text

	if (preservedSegments.length > 0) {
		// Sort segments by index in descending order to process from end to beginning
		// This prevents indices from shifting when replacing
		preservedSegments.sort((a, b) => b.index - a.index);

		for (const segment of preservedSegments) {
			// Use unique placeholder with segment ID to avoid conflicts
			const placeholder = `__PRESERVED_${segment.id}__`;
			placeholderMap.set(placeholder, segment.text);

			tempMarkdown =
				tempMarkdown.substring(0, segment.index) +
				placeholder +
				tempMarkdown.substring(segment.index + segment.length);
		}
	}

	// Remove tags from temporary markdown (where links/code are placeholders)
	tempMarkdown = removeTagsWithLinkProtection(tempMarkdown);

	// Remove context tags from temporary markdown
	tempMarkdown = tempMarkdown.replace(/@[\w-]+/g, "");

	// Remove any remaining tags that might have been missed
	tempMarkdown = tempMarkdown.replace(TAG_REGEX, "");

	// Now restore the preserved segments by replacing placeholders with original content
	for (const [placeholder, originalText] of placeholderMap) {
		tempMarkdown = tempMarkdown.replace(placeholder, originalText);
	}

	// Task marker and final cleaning (applied to the string with links/code restored)
	tempMarkdown = tempMarkdown.replace(
		/^([\s>]*)?(-|\d+\.|\*|\+)\s\[(.)\]\s*/,
		""
	);
	tempMarkdown = tempMarkdown.replace(/^# /, "");
	tempMarkdown = tempMarkdown.replace(/\s+/g, " ").trim();

	return tempMarkdown;
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
		sourcePath: string = "",
		private hideMarks: boolean = true
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
		if (!this.hideMarks) {
			return markdown
				.split(/\n\s*\n/)
				.filter((block) => block.trim().length > 0);
		}
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
