/**
 * Core Task Parser - Unified task parsing logic
 *
 * This is the single source of truth for all task parsing operations.
 * It provides both line-level and file-level parsing capabilities.
 */

import { Task } from "../../types/task";
import { TASK_REGEX } from "../../common/regex-define";
import { parseLocalDate } from "../dateUtil";
import {
	EMOJI_START_DATE_REGEX,
	EMOJI_COMPLETED_DATE_REGEX,
	EMOJI_DUE_DATE_REGEX,
	EMOJI_SCHEDULED_DATE_REGEX,
	EMOJI_CREATED_DATE_REGEX,
	EMOJI_RECURRENCE_REGEX,
	EMOJI_PRIORITY_REGEX,
	EMOJI_CONTEXT_REGEX,
	EMOJI_PROJECT_PREFIX,
	DV_START_DATE_REGEX,
	DV_COMPLETED_DATE_REGEX,
	DV_DUE_DATE_REGEX,
	DV_SCHEDULED_DATE_REGEX,
	DV_CREATED_DATE_REGEX,
	DV_RECURRENCE_REGEX,
	DV_PRIORITY_REGEX,
	DV_PROJECT_REGEX,
	DV_CONTEXT_REGEX,
	ANY_DATAVIEW_FIELD_REGEX,
	EMOJI_TAG_REGEX,
} from "../../common/regex-define";
import { PRIORITY_MAP } from "../../common/default-symbol";

/**
 * Metadata format for parsing
 */
export type MetadataFormat = "tasks" | "dataview";

/**
 * Core parsing configuration
 */
export interface CoreParsingOptions {
	/** Preferred metadata format */
	preferMetadataFormat: MetadataFormat;
	/** Whether to parse headings context */
	parseHeadings: boolean;
	/** Heading to ignore during parsing */
	ignoreHeading?: string;
	/** Focus only on specific heading */
	focusHeading?: string;
	/** Whether to parse hierarchy based on indentation */
	parseHierarchy: boolean;
}

/**
 * Default parsing options
 */
export const DEFAULT_PARSING_OPTIONS: CoreParsingOptions = {
	preferMetadataFormat: "tasks",
	parseHeadings: true,
	parseHierarchy: true,
};

/**
 * Core task parser that handles all parsing logic
 */
export class CoreTaskParser {
	private options: CoreParsingOptions;

	constructor(options: Partial<CoreParsingOptions> = {}) {
		this.options = { ...DEFAULT_PARSING_OPTIONS, ...options };
	}

	/**
	 * Parse a single task line
	 */
	parseTaskLine(
		filePath: string,
		line: string,
		lineNumber: number,
		headingContext: string[] = []
	): Task | null {
		const taskMatch = line.match(TASK_REGEX);
		if (!taskMatch) return null;

		const [fullMatch, , , , status, contentWithMetadata] = taskMatch;
		if (status === undefined || contentWithMetadata === undefined)
			return null;

		// Validate task status character
		const validStatusChars = /^[xX\s\/\-><\?!\*]$/;
		if (!validStatusChars.test(status)) {
			return null;
		}

		const completed = status.toLowerCase() === "x";
		const id = `${filePath}-L${lineNumber}`;

		const task: Task = {
			id,
			content: contentWithMetadata.trim(),
			filePath,
			line: lineNumber,
			completed,
			status: status,
			originalMarkdown: line,
			metadata: {
				tags: [],
				children: [],
				priority: undefined,
				startDate: undefined,
				dueDate: undefined,
				scheduledDate: undefined,
				completedDate: undefined,
				createdDate: undefined,
				recurrence: undefined,
				project: undefined,
				context: undefined,
				heading: [...headingContext],
			},
		};

		// Extract metadata in order
		let remainingContent = contentWithMetadata;
		remainingContent = this.extractDates(task, remainingContent);
		remainingContent = this.extractRecurrence(task, remainingContent);
		remainingContent = this.extractPriority(task, remainingContent);
		remainingContent = this.extractProject(task, remainingContent);
		remainingContent = this.extractContext(task, remainingContent);
		remainingContent = this.extractOnCompletion(task, remainingContent);
		remainingContent = this.extractDependsOn(task, remainingContent);
		remainingContent = this.extractId(task, remainingContent);
		remainingContent = this.extractTags(task, remainingContent);

		task.content = remainingContent.replace(/\s{2,}/g, " ").trim();

		return task;
	}

	/**
	 * Parse tasks from file content
	 */
	parseFileContent(filePath: string, content: string): Task[] {
		const lines = content.split(/\r?\n/);
		const tasks: Task[] = [];
		let inCodeBlock = false;
		const headings: string[] = [];

		// Parse ignore/focus headings
		const ignoreHeadings = this.options.ignoreHeading
			? this.options.ignoreHeading.split(",").map((h) => h.trim())
			: [];
		const focusHeadings = this.options.focusHeading
			? this.options.focusHeading.split(",").map((h) => h.trim())
			: [];

		// Check if current heading should be filtered
		const shouldFilterHeading = () => {
			if (focusHeadings.length > 0) {
				return !headings.some((h) =>
					focusHeadings.some((fh) => h.includes(fh))
				);
			}

			if (ignoreHeadings.length > 0) {
				return headings.some((h) =>
					ignoreHeadings.some((ih) => h.includes(ih))
				);
			}

			return false;
		};

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Handle code blocks
			if (
				line.trim().startsWith("```") ||
				line.trim().startsWith("~~~")
			) {
				inCodeBlock = !inCodeBlock;
				continue;
			}

			if (inCodeBlock) {
				continue;
			}

			// Handle headings
			if (this.options.parseHeadings) {
				const headingMatch = line.match(/^(#{1,6})\s+(.*?)(?:\s+#+)?$/);
				if (headingMatch) {
					const [_, headingMarkers, headingText] = headingMatch;
					const level = headingMarkers.length;

					// Update heading stack
					while (headings.length > 0) {
						const lastHeadingLevel = (
							headings[headings.length - 1].match(
								/^(#{1,6})/
							)?.[1] || ""
						).length;
						if (lastHeadingLevel >= level) {
							headings.pop();
						} else {
							break;
						}
					}

					headings.push(`${headingMarkers} ${headingText.trim()}`);
					continue;
				}
			}

			// Skip tasks under filtered headings
			if (shouldFilterHeading()) {
				continue;
			}

			// Parse task
			const task = this.parseTaskLine(filePath, line, i, [...headings]);
			if (task) {
				tasks.push(task);
			}
		}

		// Build hierarchy if enabled
		if (this.options.parseHierarchy) {
			this.buildTaskHierarchy(tasks);
		}

		return tasks;
	}

	/**
	 * Build parent-child relationships based on indentation
	 */
	private buildTaskHierarchy(tasks: Task[]): void {
		tasks.sort((a, b) => a.line - b.line);
		const taskStack: { task: Task; indent: number }[] = [];

		for (const currentTask of tasks) {
			const currentIndent = this.getIndentLevel(
				currentTask.originalMarkdown
			);

			while (
				taskStack.length > 0 &&
				taskStack[taskStack.length - 1].indent >= currentIndent
			) {
				taskStack.pop();
			}

			if (taskStack.length > 0) {
				const parentTask = taskStack[taskStack.length - 1].task;
				currentTask.metadata.parent = parentTask.id;
				if (!parentTask.metadata.children) {
					parentTask.metadata.children = [];
				}
				parentTask.metadata.children.push(currentTask.id);
			}

			taskStack.push({ task: currentTask, indent: currentIndent });
		}
	}

	/**
	 * Get indentation level of a line
	 */
	private getIndentLevel(line: string): number {
		const match = line.match(/^(\s*)/);
		return match ? match[1].length : 0;
	}

	// --- Metadata extraction methods ---

	private extractDates(task: Task, content: string): string {
		let remainingContent = content;
		const useDataview = this.options.preferMetadataFormat === "dataview";

		const tryParseAndAssign = (
			regex: RegExp,
			fieldName:
				| "dueDate"
				| "scheduledDate"
				| "startDate"
				| "completedDate"
				| "cancelledDate"
				| "createdDate"
		): boolean => {
			if (task.metadata[fieldName] !== undefined) return false;

			const match = remainingContent.match(regex);
			if (match && match[1]) {
				const dateVal = parseLocalDate(match[1]);
				if (dateVal !== undefined) {
					task.metadata[fieldName] = dateVal;
					remainingContent = remainingContent.replace(match[0], "");
					return true;
				}
			}
			return false;
		};

		// Due Date
		if (useDataview) {
			!tryParseAndAssign(DV_DUE_DATE_REGEX, "dueDate") &&
				tryParseAndAssign(EMOJI_DUE_DATE_REGEX, "dueDate");
		} else {
			!tryParseAndAssign(EMOJI_DUE_DATE_REGEX, "dueDate") &&
				tryParseAndAssign(DV_DUE_DATE_REGEX, "dueDate");
		}

		// Scheduled Date
		if (useDataview) {
			!tryParseAndAssign(DV_SCHEDULED_DATE_REGEX, "scheduledDate") &&
				tryParseAndAssign(EMOJI_SCHEDULED_DATE_REGEX, "scheduledDate");
		} else {
			!tryParseAndAssign(EMOJI_SCHEDULED_DATE_REGEX, "scheduledDate") &&
				tryParseAndAssign(DV_SCHEDULED_DATE_REGEX, "scheduledDate");
		}

		// Start Date
		if (useDataview) {
			!tryParseAndAssign(DV_START_DATE_REGEX, "startDate") &&
				tryParseAndAssign(EMOJI_START_DATE_REGEX, "startDate");
		} else {
			!tryParseAndAssign(EMOJI_START_DATE_REGEX, "startDate") &&
				tryParseAndAssign(DV_START_DATE_REGEX, "startDate");
		}

		// Completion Date
		if (useDataview) {
			!tryParseAndAssign(DV_COMPLETED_DATE_REGEX, "completedDate") &&
				tryParseAndAssign(EMOJI_COMPLETED_DATE_REGEX, "completedDate");
		} else {
			!tryParseAndAssign(EMOJI_COMPLETED_DATE_REGEX, "completedDate") &&
				tryParseAndAssign(DV_COMPLETED_DATE_REGEX, "completedDate");
		}

		// Created Date
		if (useDataview) {
			!tryParseAndAssign(DV_CREATED_DATE_REGEX, "createdDate") &&
				tryParseAndAssign(EMOJI_CREATED_DATE_REGEX, "createdDate");
		} else {
			!tryParseAndAssign(EMOJI_CREATED_DATE_REGEX, "createdDate") &&
				tryParseAndAssign(DV_CREATED_DATE_REGEX, "createdDate");
		}

		return remainingContent;
	}

	private extractRecurrence(task: Task, content: string): string {
		let remainingContent = content;
		const useDataview = this.options.preferMetadataFormat === "dataview";
		let match: RegExpMatchArray | null = null;

		if (useDataview) {
			match = remainingContent.match(DV_RECURRENCE_REGEX);
			if (match && match[1]) {
				task.metadata.recurrence = match[1].trim();
				remainingContent = remainingContent.replace(match[0], "");
				return remainingContent;
			}
		}

		match = remainingContent.match(EMOJI_RECURRENCE_REGEX);
		if (match && match[1]) {
			task.metadata.recurrence = match[1].trim();
			remainingContent = remainingContent.replace(match[0], "");
		}

		return remainingContent;
	}

	private extractPriority(task: Task, content: string): string {
		let remainingContent = content;
		const useDataview = this.options.preferMetadataFormat === "dataview";
		let match: RegExpMatchArray | null = null;

		if (useDataview) {
			match = remainingContent.match(DV_PRIORITY_REGEX);
			if (match && match[1]) {
				const priorityValue = match[1].trim().toLowerCase();
				const mappedPriority = PRIORITY_MAP[priorityValue];
				if (mappedPriority !== undefined) {
					task.metadata.priority = mappedPriority;
					remainingContent = remainingContent.replace(match[0], "");
					return remainingContent;
				} else {
					const numericPriority = parseInt(priorityValue, 10);
					if (!isNaN(numericPriority)) {
						task.metadata.priority = numericPriority;
						remainingContent = remainingContent.replace(
							match[0],
							""
						);
						return remainingContent;
					}
				}
			}
		}

		match = remainingContent.match(EMOJI_PRIORITY_REGEX);
		if (match && match[1]) {
			task.metadata.priority = PRIORITY_MAP[match[1]] ?? undefined;
			if (task.metadata.priority !== undefined) {
				remainingContent = remainingContent.replace(match[0], "");
			}
		}

		return remainingContent;
	}

	private extractProject(task: Task, content: string): string {
		let remainingContent = content;
		const useDataview = this.options.preferMetadataFormat === "dataview";
		let match: RegExpMatchArray | null = null;

		if (useDataview) {
			match = remainingContent.match(DV_PROJECT_REGEX);
			if (match && match[1]) {
				task.metadata.project = match[1].trim();
				remainingContent = remainingContent.replace(match[0], "");
				return remainingContent;
			}
		}

		const projectTagRegex = new RegExp(EMOJI_PROJECT_PREFIX + "([\\w/-]+)");
		match = remainingContent.match(projectTagRegex);
		if (match && match[1]) {
			task.metadata.project = match[1].trim();
		}

		return remainingContent;
	}

	private extractContext(task: Task, content: string): string {
		let remainingContent = content;
		const useDataview = this.options.preferMetadataFormat === "dataview";
		let match: RegExpMatchArray | null = null;

		if (useDataview) {
			match = remainingContent.match(DV_CONTEXT_REGEX);
			if (match && match[1]) {
				task.metadata.context = match[1].trim();
				remainingContent = remainingContent.replace(match[0], "");
				return remainingContent;
			}
		}

		// Skip @ contexts inside wiki links
		const wikiLinkMatches: string[] = [];
		const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
		let wikiMatch;
		while ((wikiMatch = wikiLinkRegex.exec(remainingContent)) !== null) {
			wikiLinkMatches.push(wikiMatch[0]);
		}

		const contextMatch = new RegExp(EMOJI_CONTEXT_REGEX.source, "").exec(
			remainingContent
		);

		if (contextMatch && contextMatch[1]) {
			const matchPosition = contextMatch.index;
			const isInsideWikiLink = wikiLinkMatches.some((link) => {
				const linkStart = remainingContent.indexOf(link);
				const linkEnd = linkStart + link.length;
				return matchPosition >= linkStart && matchPosition < linkEnd;
			});

			if (!isInsideWikiLink) {
				task.metadata.context = contextMatch[1].trim();
				remainingContent = remainingContent.replace(
					contextMatch[0],
					""
				);
			}
		}

		return remainingContent;
	}

	private extractOnCompletion(task: Task, content: string): string {
		let remainingContent = content;
		const useDataview = this.options.preferMetadataFormat === "dataview";
		let match: RegExpMatchArray | null = null;

		if (useDataview) {
			// Enhanced dataview format parsing - supports JSON and simple formats
			match = remainingContent.match(/\[onCompletion::\s*([^\]]+)\]/i);
			if (match && match[1]) {
				const onCompletionValue = match[1].trim();
				// Support both JSON and simple text formats
				task.metadata.onCompletion = onCompletionValue;
				remainingContent = remainingContent.replace(match[0], "");
				return remainingContent;
			}
		}

		// Enhanced emoji format parsing - supports complex configurations
		// Pattern: 🏁 value or 🏁value (with various possible values)
		match = remainingContent.match(/🏁\s*(.+?)(?=\s|$)/);
		if (match && match[1]) {
			let onCompletionValue = match[1].trim();
			
			// Handle JSON format in emoji notation
			if (onCompletionValue.startsWith('{')) {
				// Find the complete JSON object
				const jsonStart = remainingContent.indexOf('{', match.index!);
				let braceCount = 0;
				let jsonEnd = jsonStart;
				
				for (let i = jsonStart; i < remainingContent.length; i++) {
					if (remainingContent[i] === '{') braceCount++;
					if (remainingContent[i] === '}') braceCount--;
					if (braceCount === 0) {
						jsonEnd = i;
						break;
					}
				}
				
				if (braceCount === 0) {
					onCompletionValue = remainingContent.substring(jsonStart, jsonEnd + 1);
					// Remove the entire JSON object from content
					remainingContent = remainingContent.substring(0, match.index!) + 
						remainingContent.substring(jsonEnd + 1);
				}
			} else {
				// Simple format - remove the matched portion
				remainingContent = remainingContent.replace(match[0], "");
			}
			
			task.metadata.onCompletion = onCompletionValue;
			return remainingContent;
		}

		// Fallback: look for simple patterns without emoji
		match = remainingContent.match(/\bonCompletion:\s*([^\s]+)/i);
		if (match && match[1]) {
			task.metadata.onCompletion = match[1].trim();
			remainingContent = remainingContent.replace(match[0], "");
		}

		return remainingContent;
	}

	private extractDependsOn(task: Task, content: string): string {
		let remainingContent = content;
		const useDataview = this.options.preferMetadataFormat === "dataview";
		let match: RegExpMatchArray | null = null;

		if (useDataview) {
			match = remainingContent.match(/\[dependsOn::\s*([^\]]+)\]/i);
			if (match && match[1]) {
				// Split by comma and clean up
				task.metadata.dependsOn = match[1]
					.split(",")
					.map((id) => id.trim())
					.filter((id) => id.length > 0);
				remainingContent = remainingContent.replace(match[0], "");
				return remainingContent;
			}
		}

		match = remainingContent.match(/⛔\s*([^\s]+)/);
		if (match && match[1]) {
			// For emoji format, assume single dependency or comma-separated
			task.metadata.dependsOn = match[1]
				.split(",")
				.map((id) => id.trim())
				.filter((id) => id.length > 0);
			remainingContent = remainingContent.replace(match[0], "");
		}

		return remainingContent;
	}

	private extractId(task: Task, content: string): string {
		let remainingContent = content;
		const useDataview = this.options.preferMetadataFormat === "dataview";
		let match: RegExpMatchArray | null = null;

		if (useDataview) {
			match = remainingContent.match(/\[id::\s*([^\]]+)\]/i);
			if (match && match[1]) {
				task.metadata.id = match[1].trim();
				remainingContent = remainingContent.replace(match[0], "");
				return remainingContent;
			}
		}

		match = remainingContent.match(/🆔\s*([^\s]+)/);
		if (match && match[1]) {
			task.metadata.id = match[1].trim();
			remainingContent = remainingContent.replace(match[0], "");
		}

		return remainingContent;
	}

	private extractTags(task: Task, content: string): string {
		let remainingContent = content;
		const useDataview = this.options.preferMetadataFormat === "dataview";

		if (useDataview) {
			remainingContent = remainingContent.replace(
				ANY_DATAVIEW_FIELD_REGEX,
				""
			);
		}

		// Handle exclusions (links and inline code)
		const exclusions: { text: string; start: number; end: number }[] = [];

		// Find all wiki links, markdown links, and inline code
		const patterns = [
			/\[\[([^\]\[\]]+)\]\]/g,
			/\[([^\[\]]*)\]\((.*?)\)/g,
			/`([^`]+?)`/g,
		];

		for (const pattern of patterns) {
			let match: RegExpExecArray | null;
			pattern.lastIndex = 0;
			while ((match = pattern.exec(remainingContent)) !== null) {
				const overlaps = exclusions.some(
					(ex) =>
						Math.max(ex.start, match!.index) <
						Math.min(ex.end, match!.index + match![0].length)
				);
				if (!overlaps) {
					exclusions.push({
						text: match[0],
						start: match.index,
						end: match.index + match[0].length,
					});
				}
			}
		}

		// Sort exclusions by start position
		exclusions.sort((a, b) => a.start - b.start);

		// Create processed content with exclusions replaced by spaces
		let processedContent = remainingContent.split("");
		for (const ex of exclusions) {
			for (
				let i = ex.start;
				i < ex.end && i < processedContent.length;
				i++
			) {
				processedContent[i] = " ";
			}
		}
		const finalProcessedContent = processedContent.join("");

		// Find all tags
		const tagMatches = finalProcessedContent.match(EMOJI_TAG_REGEX) || [];
		task.metadata.tags = tagMatches.map((tag) => tag.trim());

		// Handle project tag derivation for non-dataview format
		if (!useDataview && !task.metadata.project) {
			const projectTag = task.metadata.tags.find(
				(tag) =>
					typeof tag === "string" &&
					tag.startsWith(EMOJI_PROJECT_PREFIX)
			);
			if (projectTag) {
				task.metadata.project = projectTag.substring(
					EMOJI_PROJECT_PREFIX.length
				);
			}
		}

		// Filter out project tags for dataview format
		if (useDataview) {
			task.metadata.tags = task.metadata.tags.filter(
				(tag) =>
					typeof tag === "string" &&
					!tag.startsWith(EMOJI_PROJECT_PREFIX)
			);
		}

		// Remove found tags from content
		let contentWithoutTagsOrContext = remainingContent;
		for (const tag of task.metadata.tags) {
			if (tag && tag !== "#") {
				const escapedTag = tag.replace(/[.*+?^${}()|[\\\]]/g, "\\$&");
				const tagRegex = new RegExp(
					`\s?` + escapedTag + `(?=\s|$)`,
					"g"
				);
				contentWithoutTagsOrContext =
					contentWithoutTagsOrContext.replace(tagRegex, "");
			}
		}

		// Remove context tags
		let finalContent = "";
		let lastIndex = 0;

		if (exclusions.length > 0) {
			for (const ex of exclusions) {
				const segment = contentWithoutTagsOrContext.substring(
					lastIndex,
					ex.start
				);
				finalContent += segment.replace(EMOJI_CONTEXT_REGEX, "").trim();
				finalContent += ex.text;
				lastIndex = ex.end;
			}
			const lastSegment =
				contentWithoutTagsOrContext.substring(lastIndex);
			finalContent += lastSegment.replace(EMOJI_CONTEXT_REGEX, "").trim();
		} else {
			finalContent = contentWithoutTagsOrContext
				.replace(EMOJI_CONTEXT_REGEX, "")
				.trim();
		}

		return finalContent.replace(/\s{2,}/g, " ").trim();
	}
}
