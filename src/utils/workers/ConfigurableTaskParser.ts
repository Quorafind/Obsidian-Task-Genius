/**
 * Configurable Markdown Task Parser
 * Based on Rust implementation design with TypeScript adaptation
 */

import { Task } from "../../types/task";
import {
	TaskParserConfig,
	EnhancedTask,
	MetadataParseMode,
} from "../../types/TaskParserConfig";
import { parseLocalDate } from "../dateUtil";
import { TASK_REGEX } from "../../common/regex-define";
import { TgProject } from "../../types/task";

export class MarkdownTaskParser {
	private config: TaskParserConfig;
	private tasks: EnhancedTask[] = [];
	private indentStack: Array<{
		taskId: string;
		indentLevel: number;
		actualSpaces: number;
	}> = [];
	private currentHeading?: string;
	private currentHeadingLevel?: number;
	private fileMetadata?: Record<string, any>; // Store file frontmatter metadata
	private projectConfigCache?: Record<string, any>; // Cache for project config files

	constructor(config: TaskParserConfig) {
		this.config = config;
	}

	/**
	 * Create parser with predefined status mapping
	 */
	static createWithStatusMapping(
		config: TaskParserConfig,
		statusMapping: Record<string, string>
	): MarkdownTaskParser {
		const newConfig = { ...config, statusMapping };
		return new MarkdownTaskParser(newConfig);
	}

	/**
	 * Parse markdown content and return enhanced tasks
	 */
	parse(
		input: string,
		filePath: string = "",
		fileMetadata?: Record<string, any>,
		projectConfigData?: Record<string, any>,
		tgProject?: TgProject
	): EnhancedTask[] {
		this.reset();
		this.fileMetadata = fileMetadata;

		// Store project config data if provided
		if (projectConfigData) {
			this.projectConfigCache = projectConfigData;
		}

		const lines = input.split(/\r?\n/);
		let i = 0;
		let parseIteration = 0;
		let inCodeBlock = false;

		while (i < lines.length) {
			parseIteration++;
			if (parseIteration > this.config.maxParseIterations) {
				console.warn(
					"Warning: Maximum parse iterations reached, stopping to prevent infinite loop"
				);
				break;
			}

			const line = lines[i];

			// Check for code block fences
			if (
				line.trim().startsWith("```") ||
				line.trim().startsWith("~~~")
			) {
				inCodeBlock = !inCodeBlock;
				i++;
				continue;
			}

			if (inCodeBlock) {
				i++;
				continue;
			}

			// Check if it's a heading line
			if (this.config.parseHeadings) {
				const headingResult = this.extractHeading(line);
				if (headingResult) {
					const [level, headingText] = headingResult;
					this.currentHeading = headingText;
					this.currentHeadingLevel = level;
					i++;
					continue;
				}
			}

			const taskLineResult = this.extractTaskLine(line);
			if (taskLineResult) {
				const [actualSpaces, , content, listMarker] = taskLineResult;
				const taskId = `${filePath}-L${i}`;

				const [parentId, indentLevel] =
					this.findParentAndLevel(actualSpaces);
				const [taskContent, rawStatus] = this.parseTaskContent(content);
				const completed = rawStatus.toLowerCase() === "x";
				const status = this.getStatusFromMapping(rawStatus);
				const [cleanedContent, metadata, tags] =
					this.extractMetadataAndTags(taskContent);

				// Inherit metadata from file frontmatter
				const inheritedMetadata = this.inheritFileMetadata(metadata);

				// Use provided tgProject or determine from config
				const taskTgProject =
					tgProject || this.determineTgProject(filePath);

				// Check for multiline comments
				const [comment, linesToSkip] =
					this.config.parseComments && i + 1 < lines.length
						? this.extractMultilineComment(
								lines,
								i + 1,
								actualSpaces
						  )
						: [undefined, 0];

				i += linesToSkip;

				const enhancedTask: EnhancedTask = {
					id: taskId,
					content: cleanedContent,
					status,
					rawStatus,
					completed,
					indentLevel,
					parentId,
					childrenIds: [],
					metadata: inheritedMetadata,
					tags,
					comment,
					lineNumber: i + 1,
					actualIndent: actualSpaces,
					heading: this.currentHeading,
					headingLevel: this.currentHeadingLevel,
					listMarker,
					filePath,
					originalMarkdown: line,
					tgProject: taskTgProject,

					// Legacy fields for backward compatibility
					line: i,
					children: [],
					priority: this.extractLegacyPriority(inheritedMetadata),
					startDate: this.extractLegacyDate(
						inheritedMetadata,
						"start_date"
					),
					dueDate: this.extractLegacyDate(inheritedMetadata, "due"),
					scheduledDate: this.extractLegacyDate(
						inheritedMetadata,
						"scheduled"
					),
					completedDate: this.extractLegacyDate(
						inheritedMetadata,
						"completed_date"
					),
					createdDate: this.extractLegacyDate(
						inheritedMetadata,
						"created_date"
					),
					recurrence: inheritedMetadata.recurrence,
					project: inheritedMetadata.project,
					context: inheritedMetadata.context,
				};

				if (parentId && this.tasks.length > 0) {
					const parentTask = this.tasks.find(
						(t) => t.id === parentId
					);
					if (parentTask) {
						parentTask.childrenIds.push(taskId);
						parentTask.children.push(taskId); // Legacy field
					}
				}

				this.updateIndentStack(taskId, indentLevel, actualSpaces);
				this.tasks.push(enhancedTask);
			}

			i++;
		}

		return [...this.tasks];
	}

	/**
	 * Parse and return legacy Task format for compatibility
	 */
	parseLegacy(
		input: string,
		filePath: string = "",
		fileMetadata?: Record<string, any>,
		projectConfigData?: Record<string, any>,
		tgProject?: TgProject
	): Task[] {
		const enhancedTasks = this.parse(
			input,
			filePath,
			fileMetadata,
			projectConfigData,
			tgProject
		);
		return enhancedTasks.map((task) => this.convertToLegacyTask(task));
	}

	/**
	 * Parse a single task line
	 */
	parseTask(line: string, filePath: string = "", lineNum: number = 0): Task {
		const enhancedTask = this.parse(line, filePath);
		return this.convertToLegacyTask({
			...enhancedTask[0],
			line: lineNum,
			id: `${filePath}-L${lineNum}`,
		});
	}

	private reset(): void {
		this.tasks = [];
		this.indentStack = [];
		this.currentHeading = undefined;
		this.currentHeadingLevel = undefined;
	}

	private extractTaskLine(
		line: string
	): [number, number, string, string] | null {
		const trimmed = line.trim();
		const actualSpaces = line.length - trimmed.length;

		if (this.isTaskLine(trimmed)) {
			const listMarker = this.extractListMarker(trimmed);
			return [actualSpaces, actualSpaces, trimmed, listMarker];
		}

		return null;
	}

	private extractListMarker(trimmed: string): string {
		// Check unordered list markers
		for (const marker of ["-", "*", "+"]) {
			if (trimmed.startsWith(marker)) {
				return marker;
			}
		}

		// Check ordered list markers
		const chars = trimmed.split("");
		let i = 0;

		while (i < chars.length && /\d/.test(chars[i])) {
			i++;
		}

		if (i > 0 && i < chars.length) {
			if (chars[i] === "." || chars[i] === ")") {
				return chars.slice(0, i + 1).join("");
			}
		}

		// Fallback: return first character
		return trimmed.charAt(0) || " ";
	}

	private isTaskLine(trimmed: string): boolean {
		// Use existing TASK_REGEX from common/regex-define
		return TASK_REGEX.test(trimmed);
	}

	private parseTaskContent(content: string): [string, string] {
		const taskMatch = content.match(TASK_REGEX);
		if (
			taskMatch &&
			taskMatch[4] !== undefined &&
			taskMatch[5] !== undefined
		) {
			const status = taskMatch[4];
			const taskContent = taskMatch[5].trim();
			return [taskContent, status];
		}

		// Fallback - treat as unchecked task
		return [content, " "];
	}

	private extractMetadataAndTags(
		content: string
	): [string, Record<string, string>, string[]] {
		const metadata: Record<string, string> = {};
		const tags: string[] = [];
		let cleanedContent = "";
		let remaining = content;

		let metadataIteration = 0;
		while (metadataIteration < this.config.maxMetadataIterations) {
			metadataIteration++;
			let foundMatch = false;

			// Check dataview format metadata [key::value]
			if (
				this.config.parseMetadata &&
				(this.config.metadataParseMode ===
					MetadataParseMode.DataviewOnly ||
					this.config.metadataParseMode === MetadataParseMode.Both)
			) {
				const bracketMatch = this.extractDataviewMetadata(remaining);
				if (bracketMatch) {
					const [key, value, newRemaining] = bracketMatch;
					metadata[key] = value;
					remaining = newRemaining;
					foundMatch = true;
					continue;
				}
			}

			// Check emoji metadata
			if (
				!foundMatch &&
				this.config.parseMetadata &&
				(this.config.metadataParseMode ===
					MetadataParseMode.EmojiOnly ||
					this.config.metadataParseMode === MetadataParseMode.Both)
			) {
				const emojiMatch = this.extractEmojiMetadata(remaining);
				if (emojiMatch) {
					const [key, value, beforeContent, afterRemaining] =
						emojiMatch;

					// Process tags in the content before emoji
					const [beforeCleaned, beforeMetadata, beforeTags] =
						this.extractTagsOnly(beforeContent);

					// Merge metadata and tags from before content
					for (const tag of beforeTags) {
						tags.push(tag);
					}
					for (const [k, v] of Object.entries(beforeMetadata)) {
						metadata[k] = v;
					}

					metadata[key] = value;
					cleanedContent += beforeCleaned;
					remaining = afterRemaining;
					foundMatch = true;
					continue;
				}
			}

			// Check context (@symbol)
			if (!foundMatch && this.config.parseTags) {
				const contextMatch = this.extractContext(remaining);
				if (contextMatch) {
					const [context, beforeContent, afterRemaining] =
						contextMatch;
					metadata.context = context;
					cleanedContent += beforeContent;
					remaining = afterRemaining;
					foundMatch = true;
					continue;
				}
			}

			// Check tags and special tags
			if (!foundMatch && this.config.parseTags) {
				const tagMatch = this.extractTag(remaining);
				if (tagMatch) {
					const [tag, beforeContent, afterRemaining] = tagMatch;

					// Check if it's a special tag format (prefix/value)
					// Remove # prefix for checking special tags
					const tagWithoutHash = tag.startsWith("#")
						? tag.substring(1)
						: tag;
					const slashPos = tagWithoutHash.indexOf("/");
					if (slashPos !== -1) {
						const prefix = tagWithoutHash.substring(0, slashPos);
						const value = tagWithoutHash.substring(slashPos + 1);

						const metadataKey =
							this.config.specialTagPrefixes[prefix];
						if (
							metadataKey &&
							this.config.metadataParseMode !==
								MetadataParseMode.None
						) {
							metadata[metadataKey] = value;
						} else {
							tags.push(tag);
						}
					} else {
						tags.push(tag);
					}

					cleanedContent += beforeContent;
					remaining = afterRemaining;
					foundMatch = true;
					continue;
				}
			}

			if (!foundMatch) {
				cleanedContent += remaining;
				break;
			}
		}

		return [cleanedContent.trim(), metadata, tags];
	}

	private extractDataviewMetadata(
		content: string
	): [string, string, string] | null {
		const start = content.indexOf("[");
		if (start === -1) return null;

		const end = content.indexOf("]", start);
		if (end === -1) return null;

		const bracketContent = content.substring(start + 1, end);
		if (!bracketContent.includes("::")) return null;

		const parts = bracketContent.split("::", 2);
		if (parts.length !== 2) return null;

		const key = parts[0].trim();
		const value = parts[1].trim();

		if (key && value) {
			const before = content.substring(0, start);
			const after = content.substring(end + 1);
			return [key, value, before + after];
		}

		return null;
	}

	private extractEmojiMetadata(
		content: string
	): [string, string, string, string] | null {
		// Find the earliest emoji
		let earliestEmoji: { pos: number; emoji: string; key: string } | null =
			null;

		for (const [emoji, key] of Object.entries(this.config.emojiMapping)) {
			const pos = content.indexOf(emoji);
			if (pos !== -1) {
				if (!earliestEmoji || pos < earliestEmoji.pos) {
					earliestEmoji = { pos, emoji, key };
				}
			}
		}

		if (!earliestEmoji) return null;

		const beforeEmoji = content.substring(0, earliestEmoji.pos);
		const afterEmoji = content.substring(
			earliestEmoji.pos + earliestEmoji.emoji.length
		);

		// Extract value after emoji
		const valueStartMatch = afterEmoji.match(/^\s*/);
		const valueStart = valueStartMatch ? valueStartMatch[0].length : 0;
		const valuePart = afterEmoji.substring(valueStart);

		let valueEnd = valuePart.length;
		for (let i = 0; i < valuePart.length; i++) {
			const char = valuePart[i];
			// Check if we encounter other emojis or special characters
			if (
				Object.keys(this.config.emojiMapping).some((e) =>
					valuePart.substring(i).startsWith(e)
				) ||
				["[", "#"].includes(char)
			) {
				valueEnd = i;
				break;
			}
		}

		const value = valuePart.substring(0, valueEnd).trim();

		// For priority emojis, use specific values based on the emoji
		const metadataValue =
			value || this.getDefaultEmojiValue(earliestEmoji.emoji);

		const newPos =
			earliestEmoji.pos +
			earliestEmoji.emoji.length +
			valueStart +
			valueEnd;
		const afterRemaining = content.substring(newPos);

		return [earliestEmoji.key, metadataValue, beforeEmoji, afterRemaining];
	}

	private getDefaultEmojiValue(emoji: string): string {
		const defaultValues: Record<string, string> = {
			"🔺": "highest",
			"⏫": "high",
			"🔼": "medium",
			"🔽": "low",
			"⏬️": "lowest",
			"⏬": "lowest",
		};

		return defaultValues[emoji] || "true";
	}

	private extractTag(content: string): [string, string, string] | null {
		const hashPos = content.indexOf("#");
		if (hashPos === -1) return null;

		// Check if it's a word start
		const isWordStart =
			hashPos === 0 ||
			content[hashPos - 1].match(/\s/) ||
			!content[hashPos - 1].match(/[a-zA-Z0-9#@$%^&*]/);

		if (!isWordStart) return null;

		const afterHash = content.substring(hashPos + 1);
		let tagEnd = 0;

		// Find tag end, including '/' for special tags
		for (let i = 0; i < afterHash.length; i++) {
			const char = afterHash[i];
			if (char.match(/[a-zA-Z0-9\/\-_]/)) {
				tagEnd = i + 1;
			} else {
				break;
			}
		}

		if (tagEnd > 0) {
			const fullTag = "#" + afterHash.substring(0, tagEnd); // Include # prefix
			const before = content.substring(0, hashPos);
			const after = content.substring(hashPos + 1 + tagEnd);
			return [fullTag, before, after];
		}

		return null;
	}

	private extractContext(content: string): [string, string, string] | null {
		const atPos = content.indexOf("@");
		if (atPos === -1) return null;

		// Check if it's a word start
		const isWordStart =
			atPos === 0 ||
			content[atPos - 1].match(/\s/) ||
			!content[atPos - 1].match(/[a-zA-Z0-9#@$%^&*]/);

		if (!isWordStart) return null;

		const afterAt = content.substring(atPos + 1);
		let contextEnd = 0;

		// Find context end
		for (let i = 0; i < afterAt.length; i++) {
			const char = afterAt[i];
			if (char.match(/[a-zA-Z0-9\-_]/)) {
				contextEnd = i + 1;
			} else {
				break;
			}
		}

		if (contextEnd > 0) {
			const context = afterAt.substring(0, contextEnd);
			const before = content.substring(0, atPos);
			const after = content.substring(atPos + 1 + contextEnd);
			return [context, before, after];
		}

		return null;
	}

	private extractTagsOnly(
		content: string
	): [string, Record<string, string>, string[]] {
		const metadata: Record<string, string> = {};
		const tags: string[] = [];
		let cleanedContent = "";
		let remaining = content;

		while (true) {
			let foundMatch = false;

			// Check dataview format metadata
			if (
				this.config.parseMetadata &&
				(this.config.metadataParseMode ===
					MetadataParseMode.DataviewOnly ||
					this.config.metadataParseMode === MetadataParseMode.Both)
			) {
				const bracketMatch = this.extractDataviewMetadata(remaining);
				if (bracketMatch) {
					const [key, value, newRemaining] = bracketMatch;
					metadata[key] = value;
					remaining = newRemaining;
					foundMatch = true;
					continue;
				}
			}

			// Check context (@symbol)
			if (!foundMatch && this.config.parseTags) {
				const contextMatch = this.extractContext(remaining);
				if (contextMatch) {
					const [context, beforeContent, afterRemaining] =
						contextMatch;

					// Recursively process the content before context
					const [beforeCleaned, beforeMetadata, beforeTags] =
						this.extractTagsOnly(beforeContent);

					// Merge metadata and tags from before content
					for (const tag of beforeTags) {
						tags.push(tag);
					}
					for (const [k, v] of Object.entries(beforeMetadata)) {
						metadata[k] = v;
					}

					metadata.context = context;
					cleanedContent += beforeCleaned;
					remaining = afterRemaining;
					foundMatch = true;
					continue;
				}
			}

			// Check tags
			if (!foundMatch && this.config.parseTags) {
				const tagMatch = this.extractTag(remaining);
				if (tagMatch) {
					const [tag, beforeContent, afterRemaining] = tagMatch;

					// Check special tag format
					// Remove # prefix for checking special tags
					const tagWithoutHash = tag.startsWith("#")
						? tag.substring(1)
						: tag;
					const slashPos = tagWithoutHash.indexOf("/");
					if (slashPos !== -1) {
						const prefix = tagWithoutHash.substring(0, slashPos);
						const value = tagWithoutHash.substring(slashPos + 1);

						const metadataKey =
							this.config.specialTagPrefixes[prefix];
						if (
							metadataKey &&
							this.config.metadataParseMode !==
								MetadataParseMode.None
						) {
							metadata[metadataKey] = value;
						} else {
							tags.push(tag);
						}
					} else {
						tags.push(tag);
					}

					cleanedContent += beforeContent;
					remaining = afterRemaining;
					foundMatch = true;
					continue;
				}
			}

			if (!foundMatch) {
				cleanedContent += remaining;
				break;
			}
		}

		return [cleanedContent.trim(), metadata, tags];
	}

	private findParentAndLevel(
		actualSpaces: number
	): [string | undefined, number] {
		if (this.indentStack.length === 0 || actualSpaces === 0) {
			return [undefined, 0];
		}

		for (let i = this.indentStack.length - 1; i >= 0; i--) {
			const {
				taskId,
				indentLevel,
				actualSpaces: spaces,
			} = this.indentStack[i];
			if (spaces < actualSpaces) {
				return [taskId, indentLevel + 1];
			}
		}

		return [undefined, 0];
	}

	private updateIndentStack(
		taskId: string,
		indentLevel: number,
		actualSpaces: number
	): void {
		let stackOperations = 0;

		while (this.indentStack.length > 0) {
			stackOperations++;
			if (stackOperations > this.config.maxStackOperations) {
				console.warn(
					"Warning: Maximum stack operations reached, clearing stack"
				);
				this.indentStack = [];
				break;
			}

			const lastItem = this.indentStack[this.indentStack.length - 1];
			if (lastItem.actualSpaces >= actualSpaces) {
				this.indentStack.pop();
			} else {
				break;
			}
		}

		if (this.indentStack.length >= this.config.maxStackSize) {
			this.indentStack.splice(
				0,
				this.indentStack.length - this.config.maxStackSize + 1
			);
		}

		this.indentStack.push({ taskId, indentLevel, actualSpaces });
	}

	private getStatusFromMapping(rawStatus: string): string | undefined {
		// Find status name corresponding to raw character
		for (const [statusName, mappedChar] of Object.entries(
			this.config.statusMapping
		)) {
			if (mappedChar === rawStatus) {
				return statusName;
			}
		}
		return undefined;
	}

	private extractHeading(line: string): [number, string] | null {
		const trimmed = line.trim();
		if (!trimmed.startsWith("#")) return null;

		let level = 0;
		for (const char of trimmed) {
			if (char === "#") {
				level++;
			} else if (char.match(/\s/)) {
				break;
			} else {
				return null; // Not a valid heading format
			}
		}

		if (level > 0 && level <= 6) {
			const headingText = trimmed.substring(level).trim();
			if (headingText) {
				return [level, headingText];
			}
		}

		return null;
	}

	private extractMultilineComment(
		lines: string[],
		startIndex: number,
		actualSpaces: number
	): [string | undefined, number] {
		const commentLines: string[] = [];
		let i = startIndex;
		let linesConsumed = 0;

		while (i < lines.length) {
			const line = lines[i];
			const trimmed = line.trimStart();
			const nextSpaces = line.length - trimmed.length;

			// Only consider as comment if next line is not a task line and has deeper indentation
			if (nextSpaces > actualSpaces && !this.isTaskLine(trimmed)) {
				commentLines.push(trimmed);
				linesConsumed++;
			} else {
				break;
			}

			i++;
		}

		if (commentLines.length === 0) {
			return [undefined, 0];
		} else {
			const comment = commentLines.join("\n");
			return [comment, linesConsumed];
		}
	}

	// Legacy compatibility methods
	private extractLegacyPriority(
		metadata: Record<string, string>
	): number | undefined {
		if (!metadata.priority) return undefined;

		const priorityMap: Record<string, number> = {
			highest: 1,
			high: 2,
			medium: 3,
			low: 4,
			lowest: 5,
		};

		const numericPriority = parseInt(metadata.priority, 10);
		if (!isNaN(numericPriority)) {
			return numericPriority;
		}

		return priorityMap[metadata.priority.toLowerCase()];
	}

	private extractLegacyDate(
		metadata: Record<string, string>,
		key: string
	): number | undefined {
		const dateStr = metadata[key];
		if (!dateStr) return undefined;

		const date = parseLocalDate(dateStr);
		return date;
	}

	private convertToLegacyTask(enhancedTask: EnhancedTask): Task {
		return {
			id: enhancedTask.id,
			content: enhancedTask.content,
			filePath: enhancedTask.filePath,
			line: enhancedTask.line,
			completed: enhancedTask.completed,
			status: enhancedTask.rawStatus,
			originalMarkdown: enhancedTask.originalMarkdown,
			metadata: {
				tags: enhancedTask.tags,
				children: enhancedTask.children,
				priority: enhancedTask.priority,
				startDate: enhancedTask.startDate,
				dueDate: enhancedTask.dueDate,
				scheduledDate: enhancedTask.scheduledDate,
				completedDate: enhancedTask.completedDate,
				createdDate: enhancedTask.createdDate,
				recurrence: enhancedTask.recurrence,
				project: enhancedTask.project,
				context: enhancedTask.context,
				area: enhancedTask.metadata.area,
				heading: Array.isArray(enhancedTask.heading)
					? enhancedTask.heading
					: enhancedTask.heading
					? [enhancedTask.heading]
					: [],
				parent: enhancedTask.parentId,
				tgProject: enhancedTask.tgProject,
			},
		};
	}

	/**
	 * Load project configuration for the given file path
	 */
	private loadProjectConfig(filePath: string): void {
		if (!this.config.projectConfig) return;

		// This is a simplified implementation for the worker environment
		// In a real implementation, you would need to pass project config data
		// from the main thread or implement file reading in the worker
		this.projectConfigCache = {};
	}

	/**
	 * Determine tgProject for a task based on various sources
	 */
	private determineTgProject(filePath: string): TgProject | undefined {
		if (!this.config.projectConfig?.enableEnhancedProject) {
			return undefined;
		}

		const config = this.config.projectConfig;

		// 1. Check path-based mappings
		if (config.pathMappings && config.pathMappings.length > 0) {
			for (const mapping of config.pathMappings) {
				if (!mapping.enabled) continue;

				// Simple path matching (in a real implementation, you'd use glob patterns)
				if (filePath.includes(mapping.pathPattern)) {
					return {
						type: "path",
						name: mapping.projectName,
						source: mapping.pathPattern,
						readonly: true,
					};
				}
			}
		}

		// 2. Check file metadata
		if (config.metadataConfig?.enabled && this.fileMetadata) {
			const metadataKey = config.metadataConfig.metadataKey || "project";
			const projectFromMetadata = this.fileMetadata[metadataKey];

			if (
				projectFromMetadata &&
				typeof projectFromMetadata === "string"
			) {
				return {
					type: "metadata",
					name: projectFromMetadata,
					source: metadataKey,
					readonly: true,
				};
			}
		}

		// 3. Check project config file
		if (config.configFile?.enabled && this.projectConfigCache) {
			const projectFromConfig = this.projectConfigCache.project;

			if (projectFromConfig && typeof projectFromConfig === "string") {
				return {
					type: "config",
					name: projectFromConfig,
					source: config.configFile.fileName,
					readonly: true,
				};
			}
		}

		return undefined;
	}

	/**
	 * Inherit metadata from file frontmatter
	 */
	private inheritFileMetadata(
		taskMetadata: Record<string, string>
	): Record<string, string> {
		if (
			!this.fileMetadata ||
			!this.config.projectConfig?.metadataConfig?.inheritFromFrontmatter
		) {
			return taskMetadata;
		}

		const inherited = { ...taskMetadata };

		// Inherit common metadata fields if not already present in task
		const inheritableFields = [
			"dueDate",
			"startDate",
			"scheduledDate",
			"priority",
			"context",
		];

		for (const field of inheritableFields) {
			if (!inherited[field] && this.fileMetadata[field]) {
				inherited[field] = String(this.fileMetadata[field]);
			}
		}

		return inherited;
	}
}
