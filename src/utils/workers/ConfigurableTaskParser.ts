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
import { ContextDetector } from "./ContextDetector";

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

	// Date parsing cache to improve performance for large-scale parsing
	private static dateCache = new Map<string, number | undefined>();
	private static readonly MAX_CACHE_SIZE = 10000; // Limit cache size to prevent memory issues

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
				// A task is a subtask if it has a parent
				const isSubtask = parentId !== undefined;
				const inheritedMetadata = this.inheritFileMetadata(
					metadata,
					isSubtask
				);

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
						"startDate"
					),
					dueDate: this.extractLegacyDate(
						inheritedMetadata,
						"dueDate"
					),
					scheduledDate: this.extractLegacyDate(
						inheritedMetadata,
						"scheduledDate"
					),
					completedDate: this.extractLegacyDate(
						inheritedMetadata,
						"completedDate"
					),
					createdDate: this.extractLegacyDate(
						inheritedMetadata,
						"createdDate"
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

		let key = parts[0].trim();
		const value = parts[1].trim();

		// Map dataview keys to standard field names for consistency
		const dataviewKeyMapping: Record<string, string> = {
			due: "dueDate",
			start: "startDate",
			scheduled: "scheduledDate",
			completion: "completedDate",
			created: "createdDate",
			cancelled: "cancelledDate",
			id: "id",
			dependsOn: "dependsOn",
			onCompletion: "onCompletion",
		};

		// Apply key mapping if it exists
		const mappedKey = dataviewKeyMapping[key.toLowerCase()];
		if (mappedKey) {
			key = mappedKey;
		}

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

		// Handle special field processing
		let metadataValue: string;
		if (earliestEmoji.key === "dependsOn" && value) {
			// For dependsOn, split by comma and join back as string for metadata storage
			metadataValue = value
				.split(",")
				.map((id) => id.trim())
				.filter((id) => id.length > 0)
				.join(",");
		} else {
			// For priority emojis, use specific values based on the emoji
			metadataValue =
				value || this.getDefaultEmojiValue(earliestEmoji.emoji);
		}

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
		// Use ContextDetector to find unprotected hash symbols
		const detector = new ContextDetector(content);
		detector.detectAllProtectedRanges();

		const hashPos = detector.findNextUnprotectedHash(0);
		if (hashPos === -1) return null;

		// Enhanced word boundary check
		const isWordStart = this.isValidTagStart(content, hashPos);
		if (!isWordStart) {
			// Try to find the next unprotected hash
			const nextHashPos = detector.findNextUnprotectedHash(hashPos + 1);
			if (nextHashPos === -1) return null;

			// Recursively check the remaining content
			const remainingContent = content.substring(nextHashPos);
			const recurseResult = this.extractTag(remainingContent);
			if (recurseResult) {
				const [tag, beforeTag, afterTag] = recurseResult;
				return [
					tag,
					content.substring(0, nextHashPos) + beforeTag,
					afterTag,
				];
			}
			return null;
		}

		const afterHash = content.substring(hashPos + 1);
		let tagEnd = 0;

		// Find tag end, including '/' for special tags and Unicode characters
		for (let i = 0; i < afterHash.length; i++) {
			const char = afterHash[i];
			const charCode = char.charCodeAt(0);

			// Check if character is valid for tags:
			// - ASCII letters and numbers: a-z, A-Z, 0-9
			// - Special characters: /, -, _
			// - Unicode characters (including Chinese): > 127
			// - Exclude common separators and punctuation
			if (
				(charCode >= 48 && charCode <= 57) || // 0-9
				(charCode >= 65 && charCode <= 90) || // A-Z
				(charCode >= 97 && charCode <= 122) || // a-z
				char === "/" ||
				char === "-" ||
				char === "_" ||
				(charCode > 127 &&
					char !== "，" &&
					char !== "。" &&
					char !== "；" &&
					char !== "：" &&
					char !== "！" &&
					char !== "？" &&
					char !== "「" &&
					char !== "」" &&
					char !== "『" &&
					char !== "』" &&
					char !== "（" &&
					char !== "）" &&
					char !== "【" &&
					char !== "】" &&
					char !== '"' &&
					char !== '"' &&
					char !== "'" &&
					char !== "'" &&
					char !== " ")
			) {
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

	/**
	 * Enhanced word boundary check for tag start validation
	 */
	private isValidTagStart(content: string, hashPos: number): boolean {
		// Check if it's at the beginning of content
		if (hashPos === 0) return true;

		const prevChar = content[hashPos - 1];

		// Valid tag starts are preceded by:
		// 1. Whitespace
		// 2. Start of line
		// 3. Punctuation that typically separates words
		// 4. Opening brackets/parentheses

		// Invalid tag starts are preceded by:
		// 1. Alphanumeric characters (part of a word)
		// 2. Other hash symbols (multiple hashes)
		// 3. Special symbols that indicate non-tag context

		const validPrecedingChars = /[\s\(\[\{<,;:!?\-\+\*\/\\\|=]/;
		const invalidPrecedingChars = /[a-zA-Z0-9#@$%^&*]/;

		if (validPrecedingChars.test(prevChar)) {
			return true;
		}

		if (invalidPrecedingChars.test(prevChar)) {
			return false;
		}

		// For other characters (Unicode, etc.), use the original logic
		return !prevChar.match(/[a-zA-Z0-9#@$%^&*]/);
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

		// Find context end, similar to tag parsing but for context
		for (let i = 0; i < afterAt.length; i++) {
			const char = afterAt[i];
			const charCode = char.charCodeAt(0);

			// Check if character is valid for context:
			// - ASCII letters and numbers: a-z, A-Z, 0-9
			// - Special characters: -, _
			// - Unicode characters (including Chinese): > 127
			// - Exclude common separators and punctuation
			if (
				(charCode >= 48 && charCode <= 57) || // 0-9
				(charCode >= 65 && charCode <= 90) || // A-Z
				(charCode >= 97 && charCode <= 122) || // a-z
				char === "-" ||
				char === "_" ||
				(charCode > 127 &&
					char !== "，" &&
					char !== "。" &&
					char !== "；" &&
					char !== "：" &&
					char !== "！" &&
					char !== "？" &&
					char !== "「" &&
					char !== "」" &&
					char !== "『" &&
					char !== "』" &&
					char !== "（" &&
					char !== "）" &&
					char !== "【" &&
					char !== "】" &&
					char !== '"' &&
					char !== '"' &&
					char !== "'" &&
					char !== "'" &&
					char !== " ")
			) {
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

		// Use the standard PRIORITY_MAP for consistent priority values
		const priorityMap: Record<string, number> = {
			highest: 5,
			high: 4,
			medium: 3,
			low: 2,
			lowest: 1,
			urgent: 5, // Alias for highest
			critical: 5, // Alias for highest
			important: 4, // Alias for high
			normal: 3, // Alias for medium
			moderate: 3, // Alias for medium
			minor: 2, // Alias for low
			trivial: 1, // Alias for lowest
		};

		// First try to parse as number
		const numericPriority = parseInt(metadata.priority, 10);
		if (!isNaN(numericPriority)) {
			return numericPriority;
		}

		// Then try to map string values
		const mappedPriority = priorityMap[metadata.priority.toLowerCase()];
		return mappedPriority;
	}

	private extractLegacyDate(
		metadata: Record<string, string>,
		key: string
	): number | undefined {
		const dateStr = metadata[key];
		if (!dateStr) return undefined;

		// Check cache first to avoid repeated date parsing
		const cachedDate = MarkdownTaskParser.dateCache.get(dateStr);
		if (cachedDate !== undefined) {
			return cachedDate;
		}

		// Parse date and cache the result
		const date = parseLocalDate(dateStr);

		// Implement cache size limit to prevent memory issues
		if (
			MarkdownTaskParser.dateCache.size >=
			MarkdownTaskParser.MAX_CACHE_SIZE
		) {
			// Remove oldest entries (simple FIFO eviction)
			const firstKey = MarkdownTaskParser.dateCache.keys().next().value;
			if (firstKey) {
				MarkdownTaskParser.dateCache.delete(firstKey);
			}
		}

		MarkdownTaskParser.dateCache.set(dateStr, date);
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
			children: enhancedTask.children || [],
			metadata: {
				tags: enhancedTask.tags || enhancedTask.metadata.tags,
				children: enhancedTask.children,
				priority:
					enhancedTask.priority || enhancedTask.metadata.priority,
				startDate:
					enhancedTask.startDate || enhancedTask.metadata.startDate,
				dueDate: enhancedTask.dueDate || enhancedTask.metadata.dueDate,
				scheduledDate:
					enhancedTask.scheduledDate ||
					enhancedTask.metadata.scheduledDate,
				completedDate:
					enhancedTask.completedDate ||
					enhancedTask.metadata.completedDate,
				createdDate:
					enhancedTask.createdDate ||
					enhancedTask.metadata.createdDate,
				cancelledDate: enhancedTask.metadata.cancelledDate,
				recurrence:
					enhancedTask.recurrence || enhancedTask.metadata.recurrence,
				project: enhancedTask.project || enhancedTask.metadata.project,
				context: enhancedTask.context || enhancedTask.metadata.context,
				area: enhancedTask.metadata.area,
				id: enhancedTask.metadata.id,
				dependsOn: enhancedTask.metadata.dependsOn
					? enhancedTask.metadata.dependsOn
							.split(",")
							.map((id) => id.trim())
							.filter((id) => id.length > 0)
					: undefined,
				onCompletion: enhancedTask.metadata.onCompletion,
				heading: Array.isArray(enhancedTask.heading)
					? enhancedTask.heading
					: enhancedTask.heading
					? [enhancedTask.heading]
					: [],
				parent: enhancedTask.parentId,
				tgProject: enhancedTask.tgProject,
			},
		} as any;
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

		// 2. Check file metadata - only if metadata detection is enabled
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

		// 3. Check project config file - only if config file detection is enabled
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
	 * Static method to clear the date cache when needed (e.g., for memory management)
	 */
	public static clearDateCache(): void {
		MarkdownTaskParser.dateCache.clear();
	}

	/**
	 * Static method to get cache statistics
	 */
	public static getDateCacheStats(): { size: number; maxSize: number } {
		return {
			size: MarkdownTaskParser.dateCache.size,
			maxSize: MarkdownTaskParser.MAX_CACHE_SIZE,
		};
	}

	/**
	 * Inherit metadata from file frontmatter and project configuration
	 */
	private inheritFileMetadata(
		taskMetadata: Record<string, string>,
		isSubtask: boolean = false
	): Record<string, string> {
		// Helper function to convert priority values to numbers
		const convertPriorityValue = (value: any): string => {
			if (value === undefined || value === null) {
				return String(value);
			}

			// If it's already a number, convert to string and return
			if (typeof value === "number") {
				return String(value);
			}

			// If it's a string, try to convert priority values to numbers, but return as string
			// since the metadata record expects string values that will later be processed by extractLegacyPriority
			const strValue = String(value);
			const priorityMap: Record<string, number> = {
				highest: 5,
				high: 4,
				medium: 3,
				low: 2,
				lowest: 1,
				urgent: 5,
				critical: 5,
				important: 4,
				normal: 3,
				moderate: 3,
				minor: 2,
				trivial: 1,
			};

			// Try numeric conversion first
			const numericValue = parseInt(strValue, 10);
			if (!isNaN(numericValue)) {
				return String(numericValue);
			}

			// Try priority mapping
			const mappedPriority = priorityMap[strValue.toLowerCase()];
			if (mappedPriority !== undefined) {
				return String(mappedPriority);
			}

			// Return original value if no conversion applies
			return strValue;
		};

		// Always convert priority values in task metadata, even if inheritance is disabled
		const inherited = { ...taskMetadata };
		if (inherited.priority !== undefined) {
			inherited.priority = convertPriorityValue(inherited.priority);
		}

		// Early return if enhanced project features are disabled
		// Without enhanced project, metadata inheritance should not work
		if (!this.config.projectConfig?.enableEnhancedProject) {
			return inherited;
		}

		// Check if frontmatter inheritance is enabled
		if (
			!this.config.projectConfig?.metadataConfig?.inheritFromFrontmatter
		) {
			return inherited;
		}

		// Check if subtask inheritance is allowed
		if (
			isSubtask &&
			!this.config.projectConfig?.metadataConfig
				?.inheritFromFrontmatterForSubtasks
		) {
			return inherited;
		}

		// List of fields that should NOT be inherited (task-specific only)
		const nonInheritableFields = new Set([
			"id",
			"content",
			"status",
			"rawStatus",
			"completed",
			"line",
			"lineNumber",
			"originalMarkdown",
			"filePath",
			"heading",
			"headingLevel",
			"parent",
			"parentId",
			"children",
			"childrenIds",
			"tags", // Tags are task-specific
			"comment", // Comments are task-specific
			"indentLevel",
			"actualIndent",
			"listMarker",
		]);

		// Inherit from file metadata (frontmatter) if available
		if (this.fileMetadata) {
			for (const [key, value] of Object.entries(this.fileMetadata)) {
				// Only inherit if:
				// 1. The field is not in the non-inheritable list
				// 2. The task doesn't already have this field
				// 3. The value is not undefined/null
				if (
					!nonInheritableFields.has(key) &&
					!inherited[key] &&
					value !== undefined &&
					value !== null
				) {
					// Convert priority values to numbers before inheritance
					if (key === "priority") {
						inherited[key] = convertPriorityValue(value);
					} else {
						inherited[key] = String(value);
					}
				}
			}
		}

		// Inherit from project configuration data if available
		if (this.projectConfigCache) {
			for (const [key, value] of Object.entries(
				this.projectConfigCache
			)) {
				// Only inherit if:
				// 1. The field is not in the non-inheritable list
				// 2. The task doesn't already have this field (task metadata takes precedence)
				// 3. File metadata doesn't have this field (file metadata takes precedence over project config)
				// 4. The value is not undefined/null
				if (
					!nonInheritableFields.has(key) &&
					!inherited[key] &&
					!(
						this.fileMetadata &&
						this.fileMetadata[key] !== undefined
					) &&
					value !== undefined &&
					value !== null
				) {
					// Convert priority values to numbers before inheritance
					if (key === "priority") {
						inherited[key] = convertPriorityValue(value);
					} else {
						inherited[key] = String(value);
					}
				}
			}
		}

		return inherited;
	}
}
