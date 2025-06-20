/**
 * Canvas file parser for extracting tasks from Obsidian Canvas files
 */

import { Task, CanvasTaskMetadata } from "../../types/task";
import {
	CanvasData,
	CanvasTextData,
	ParsedCanvasContent,
	CanvasParsingOptions,
	AllCanvasNodeData,
} from "../../types/canvas";
import { MarkdownTaskParser } from "../workers/ConfigurableTaskParser";
import { TaskParserConfig } from "../../types/TaskParserConfig";

/**
 * Default options for canvas parsing
 */
export const DEFAULT_CANVAS_PARSING_OPTIONS: CanvasParsingOptions = {
	includeNodeIds: false,
	includePositions: false,
	nodeSeparator: "\n\n",
	preserveLineBreaks: true,
};

/**
 * Canvas file parser that extracts tasks from text nodes
 */
export class CanvasParser {
	private markdownParser: MarkdownTaskParser;
	private options: CanvasParsingOptions;

	constructor(
		parserConfig: TaskParserConfig,
		options: Partial<CanvasParsingOptions> = {}
	) {
		this.markdownParser = new MarkdownTaskParser(parserConfig);
		this.options = { ...DEFAULT_CANVAS_PARSING_OPTIONS, ...options };
	}

	/**
	 * Parse a canvas file and extract tasks from text nodes
	 */
	public parseCanvasFile(canvasContent: string, filePath: string): Task[] {
		let canvasData: CanvasData | null = null;
		let parsedContent: ParsedCanvasContent | null = null;

		try {
			// Parse the JSON content
			canvasData = JSON.parse(canvasContent);

			if (!canvasData) {
				return [];
			}

			// Extract and parse content
			parsedContent = this.extractCanvasContent(canvasData, filePath);

			if (!parsedContent) {
				return [];
			}

			// Parse tasks from the extracted text content
			const tasks = this.parseTasksFromCanvasContent(parsedContent);

			return tasks;
		} catch (error) {
			console.error(`Error parsing canvas file ${filePath}:`, error);
			return [];
		} finally {
			// Clear references to help garbage collection
			canvasData = null;
			parsedContent = null;
		}
	}

	/**
	 * Extract text content from canvas data
	 */
	private extractCanvasContent(
		canvasData: CanvasData,
		filePath: string
	): ParsedCanvasContent {
		// Filter text nodes
		const textNodes = canvasData.nodes.filter(
			(node): node is CanvasTextData => node.type === "text"
		);

		// Extract text content from all text nodes
		const textContents: string[] = [];

		for (const textNode of textNodes) {
			let nodeContent = textNode.text;

			// Add node metadata if requested
			if (this.options.includeNodeIds) {
				nodeContent = `<!-- Node ID: ${textNode.id} -->\n${nodeContent}`;
			}

			if (this.options.includePositions) {
				nodeContent = `<!-- Position: x=${textNode.x}, y=${textNode.y} -->\n${nodeContent}`;
			}

			// Handle line breaks
			if (!this.options.preserveLineBreaks) {
				nodeContent = nodeContent.replace(/\n/g, " ");
			}

			textContents.push(nodeContent);
		}

		// Combine all text content
		const combinedText = textContents.join(
			this.options.nodeSeparator || "\n\n"
		);

		return {
			canvasData,
			textContent: combinedText,
			textNodes,
			filePath,
		};
	}

	/**
	 * Parse tasks from extracted canvas content
	 */
	private parseTasksFromCanvasContent(
		parsedContent: ParsedCanvasContent
	): Task[] {
		const { textContent, filePath, textNodes } = parsedContent;

		// Use the markdown parser to extract tasks from the combined text
		const tasks = this.markdownParser.parseLegacy(textContent, filePath);

		// Enhance tasks with canvas-specific metadata
		return tasks.map((task) =>
			this.enhanceTaskWithCanvasMetadata(task, parsedContent)
		);
	}

	/**
	 * Enhance a task with canvas-specific metadata
	 */
	private enhanceTaskWithCanvasMetadata(
		task: Task,
		parsedContent: ParsedCanvasContent
	): Task<CanvasTaskMetadata> {
		// Try to find which text node this task came from
		const sourceNode = this.findSourceNode(task, parsedContent);

		if (sourceNode) {
			// Add canvas-specific metadata
			const canvasMetadata: CanvasTaskMetadata = {
				...task.metadata,
				canvasNodeId: sourceNode.id,
				canvasPosition: {
					x: sourceNode.x,
					y: sourceNode.y,
					width: sourceNode.width,
					height: sourceNode.height,
				},
				canvasColor: sourceNode.color,
				sourceType: "canvas",
			};

			task.metadata = canvasMetadata;
		} else {
			// Even if we can't find the source node, mark it as canvas
			(task.metadata as CanvasTaskMetadata).sourceType = "canvas";
		}

		return task as Task<CanvasTaskMetadata>;
	}

	/**
	 * Find the source text node for a given task
	 */
	private findSourceNode(
		task: Task,
		parsedContent: ParsedCanvasContent
	): CanvasTextData | null {
		const { textNodes } = parsedContent;

		// Simple heuristic: find the node that contains the task content
		for (const node of textNodes) {
			if (node.text.includes(task.originalMarkdown)) {
				return node;
			}
		}

		return null;
	}

	/**
	 * Update parser configuration
	 */
	public updateParserConfig(config: TaskParserConfig): void {
		this.markdownParser = new MarkdownTaskParser(config);
	}

	/**
	 * Update parsing options
	 */
	public updateOptions(options: Partial<CanvasParsingOptions>): void {
		this.options = { ...this.options, ...options };
	}

	/**
	 * Get current parsing options
	 */
	public getOptions(): CanvasParsingOptions {
		return { ...this.options };
	}

	/**
	 * Validate canvas file content
	 */
	public static isValidCanvasContent(content: string): boolean {
		try {
			const data = JSON.parse(content);
			return (
				typeof data === "object" &&
				data !== null &&
				Array.isArray(data.nodes) &&
				Array.isArray(data.edges)
			);
		} catch {
			return false;
		}
	}

	/**
	 * Extract only text content without parsing tasks (useful for preview)
	 */
	public extractTextOnly(canvasContent: string): string {
		try {
			const canvasData: CanvasData = JSON.parse(canvasContent);
			const textNodes = canvasData.nodes.filter(
				(node): node is CanvasTextData => node.type === "text"
			);

			return textNodes
				.map((node) => node.text)
				.join(this.options.nodeSeparator || "\n\n");
		} catch (error) {
			console.error("Error extracting text from canvas:", error);
			return "";
		}
	}
}
