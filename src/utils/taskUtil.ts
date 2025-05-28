import { PRIORITY_MAP } from "../common/default-symbol";
import { parseLocalDate } from "./dateUtil";
import { Task } from "../types/task";
import {
	DV_DUE_DATE_REGEX,
	EMOJI_DUE_DATE_REGEX,
	DV_SCHEDULED_DATE_REGEX,
	EMOJI_SCHEDULED_DATE_REGEX,
	DV_START_DATE_REGEX,
	EMOJI_START_DATE_REGEX,
	DV_COMPLETED_DATE_REGEX,
	EMOJI_COMPLETED_DATE_REGEX,
	DV_CREATED_DATE_REGEX,
	EMOJI_CREATED_DATE_REGEX,
	DV_RECURRENCE_REGEX,
	EMOJI_RECURRENCE_REGEX,
	DV_PRIORITY_REGEX,
	EMOJI_PRIORITY_REGEX,
	DV_PROJECT_REGEX,
	EMOJI_PROJECT_PREFIX,
	DV_CONTEXT_REGEX,
	EMOJI_CONTEXT_REGEX,
	ANY_DATAVIEW_FIELD_REGEX,
	EMOJI_TAG_REGEX,
	TASK_REGEX,
} from "../common/regex-define";

export type MetadataFormat = "tasks" | "dataview"; // Define the type for clarity

export function extractDates(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";

	const tryParseAndAssign = (
		regex: RegExp,
		fieldName:
			| "dueDate"
			| "scheduledDate"
			| "startDate"
			| "completedDate"
			| "createdDate"
	): boolean => {
		if (task[fieldName] !== undefined) return false; // Already assigned

		const match = remainingContent.match(regex);
		if (match && match[1]) {
			const dateVal = parseLocalDate(match[1]);
			if (dateVal !== undefined) {
				task[fieldName] = dateVal; // Direct assignment is type-safe
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

export function extractRecurrence(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";
	let match: RegExpMatchArray | null = null;

	if (useDataview) {
		match = remainingContent.match(DV_RECURRENCE_REGEX);
		if (match && match[1]) {
			task.recurrence = match[1].trim();
			remainingContent = remainingContent.replace(match[0], "");
			return remainingContent; // Found preferred format
		}
	}

	// Try emoji format (primary or fallback)
	match = remainingContent.match(EMOJI_RECURRENCE_REGEX);
	if (match && match[1]) {
		task.recurrence = match[1].trim();
		remainingContent = remainingContent.replace(match[0], "");
	}

	return remainingContent;
}

export function extractPriority(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";
	let match: RegExpMatchArray | null = null;

	if (useDataview) {
		match = remainingContent.match(DV_PRIORITY_REGEX);
		if (match && match[1]) {
			const priorityValue = match[1].trim().toLowerCase();
			const mappedPriority = PRIORITY_MAP[priorityValue];
			if (mappedPriority !== undefined) {
				task.priority = mappedPriority;
				remainingContent = remainingContent.replace(match[0], "");
				return remainingContent;
			} else {
				const numericPriority = parseInt(priorityValue, 10);
				if (!isNaN(numericPriority)) {
					task.priority = numericPriority;
					remainingContent = remainingContent.replace(match[0], "");
					return remainingContent;
				}
			}
		}
	}

	// Try emoji format (primary or fallback)
	match = remainingContent.match(EMOJI_PRIORITY_REGEX);
	if (match && match[1]) {
		task.priority = PRIORITY_MAP[match[1]] ?? undefined;
		if (task.priority !== undefined) {
			remainingContent = remainingContent.replace(match[0], "");
		}
	}

	return remainingContent;
}

export function extractProject(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";
	let match: RegExpMatchArray | null = null;

	if (useDataview) {
		match = remainingContent.match(DV_PROJECT_REGEX);
		if (match && match[1]) {
			task.project = match[1].trim();
			remainingContent = remainingContent.replace(match[0], "");
			return remainingContent; // Found preferred format
		}
	}

	// Try #project/ prefix (primary or fallback)
	const projectTagRegex = new RegExp(EMOJI_PROJECT_PREFIX + "([\\w/-]+)");
	match = remainingContent.match(projectTagRegex);
	if (match && match[1]) {
		task.project = match[1].trim();
		// Do not remove here; let tag extraction handle it
	}

	return remainingContent;
}

export function extractContext(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";
	let match: RegExpMatchArray | null = null;

	if (useDataview) {
		match = remainingContent.match(DV_CONTEXT_REGEX);
		if (match && match[1]) {
			task.context = match[1].trim();
			remainingContent = remainingContent.replace(match[0], "");
			return remainingContent; // Found preferred format
		}
	}

	// Skip @ contexts inside wiki links [[...]]
	// First, extract all wiki link patterns
	const wikiLinkMatches: string[] = [];
	const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
	let wikiMatch;
	while ((wikiMatch = wikiLinkRegex.exec(remainingContent)) !== null) {
		wikiLinkMatches.push(wikiMatch[0]);
	}

	// Try @ prefix (primary or fallback)
	// Use .exec to find the first match only for @context
	const contextMatch = new RegExp(EMOJI_CONTEXT_REGEX.source, "").exec(
		remainingContent
	); // Non-global search for first

	if (contextMatch && contextMatch[1]) {
		// Check if this @context is inside a wiki link
		const matchPosition = contextMatch.index;
		const isInsideWikiLink = wikiLinkMatches.some((link) => {
			const linkStart = remainingContent.indexOf(link);
			const linkEnd = linkStart + link.length;
			return matchPosition >= linkStart && matchPosition < linkEnd;
		});

		// Only process if not inside a wiki link
		if (!isInsideWikiLink) {
			task.context = contextMatch[1].trim();
			// Remove the first matched context tag here to avoid it being parsed as a general tag
			remainingContent = remainingContent.replace(contextMatch[0], "");
		}
	}

	return remainingContent;
}

export function extractTags(
	task: Task,
	content: string,
	format: MetadataFormat
): string {
	let remainingContent = content;
	const useDataview = format === "dataview";

	// If using Dataview, remove all potential DV fields first
	if (useDataview) {
		remainingContent = remainingContent.replace(
			ANY_DATAVIEW_FIELD_REGEX,
			""
		);
	}

	// Exclude links (both wiki and markdown) and inline code from tag processing
	const generalWikiLinkRegex = /\[\[([^\]\[\]]+)\]\]/g; // Matches [[content]]
	const aliasedWikiLinkRegex = /\[\[(?!.+?:)([^\]\[\]]+)\|([^\]\[\]]+)\]\]/g; // Matches [[link|alias]]
	const markdownLinkRegex = /\[([^\[\]]*)\]\((.*?)\)/g;
	const inlineCodeRegex = /`([^`]+?)`/g; // Matches `code`

	const exclusions: { text: string; start: number; end: number }[] = [];
	let match: RegExpExecArray | null;
	let processedContent = remainingContent;

	// Find all general wiki links and their positions
	generalWikiLinkRegex.lastIndex = 0;
	while ((match = generalWikiLinkRegex.exec(remainingContent)) !== null) {
		exclusions.push({
			text: match[0],
			start: match.index,
			end: match.index + match[0].length,
		});
	}

	// Find all aliased wiki links
	aliasedWikiLinkRegex.lastIndex = 0;
	while ((match = aliasedWikiLinkRegex.exec(remainingContent)) !== null) {
		const overlaps = exclusions.some(
			(ex) =>
				Math.max(ex.start, match!.index) <
				Math.min(ex.end, match!.index + match![0].length)
		);
		if (!overlaps) {
			exclusions.push({
				text: match![0],
				start: match!.index,
				end: match!.index + match![0].length,
			});
		}
	}

	// Find all markdown links
	markdownLinkRegex.lastIndex = 0;
	while ((match = markdownLinkRegex.exec(remainingContent)) !== null) {
		const overlaps = exclusions.some(
			(ex) =>
				Math.max(ex.start, match!.index) <
				Math.min(ex.end, match!.index + match![0].length)
		);
		if (!overlaps) {
			exclusions.push({
				text: match![0],
				start: match!.index,
				end: match!.index + match![0].length,
			});
		}
	}

	// Find all inline code blocks
	inlineCodeRegex.lastIndex = 0;
	while ((match = inlineCodeRegex.exec(remainingContent)) !== null) {
		// Check for overlaps with existing exclusions (e.g. a code block inside a link, though unlikely for tags)
		const overlaps = exclusions.some(
			(ex) =>
				Math.max(ex.start, match!.index) <
				Math.min(ex.end, match!.index + match![0].length)
		);
		if (!overlaps) {
			exclusions.push({
				text: match![0], // Store the full match `code`
				start: match!.index,
				end: match!.index + match![0].length,
			});
		}
	}

	// Sort exclusions by start position to process them correctly
	exclusions.sort((a, b) => a.start - b.start);

	// Temporarily replace excluded segments (links, inline code) with placeholders
	if (exclusions.length > 0) {
		let offset = 0; // This offset logic needs care if lengths change.
		// Using spaces as placeholders maintains original string length and indices for subsequent operations.
		let tempProcessedContent = processedContent.split("");

		for (const ex of exclusions) {
			// Replace the content of the exclusion with spaces
			for (let i = ex.start; i < ex.end; i++) {
				// Check boundary condition for tempProcessedContent
				if (i < tempProcessedContent.length) {
					tempProcessedContent[i] = " ";
				}
			}
		}
		processedContent = tempProcessedContent.join("");
	}

	// Find all #tags in the content with links and inline code replaced by placeholders
	const tagMatches = processedContent.match(EMOJI_TAG_REGEX) || [];
	task.tags = tagMatches.map((tag) => tag.trim());

	// If using 'tasks' (emoji) format, derive project from tags if not set
	// Also make sure project wasn't already set by DV format before falling back
	if (!useDataview && !task.project) {
		const projectTag = task.tags.find(
			(tag) =>
				typeof tag === "string" && tag.startsWith(EMOJI_PROJECT_PREFIX)
		);
		if (projectTag) {
			task.project = projectTag.substring(EMOJI_PROJECT_PREFIX.length);
		}
	}

	// If using Dataview format, filter out any remaining #project/ tags from the tag list
	if (useDataview) {
		task.tags = task.tags.filter(
			(tag) =>
				typeof tag === "string" && !tag.startsWith(EMOJI_PROJECT_PREFIX)
		);
	}

	// Remove found tags (including potentially #project/ tags if format is 'tasks') from the original remaining content
	let contentWithoutTagsOrContext = remainingContent;
	for (const tag of task.tags) {
		// Ensure the tag is not empty or just '#' before creating regex
		if (tag && tag !== "#") {
			const escapedTag = tag.replace(/[.*+?^${}()|[\\\]]/g, "\\$&");
			const tagRegex = new RegExp(`\s?` + escapedTag + `(?=\s|$)`, "g");
			contentWithoutTagsOrContext = contentWithoutTagsOrContext.replace(
				tagRegex,
				""
			);
		}
	}

	// Also remove any remaining @context tags, making sure not to remove them from within links or inline code
	// We need to re-use the `exclusions` logic for this.
	let finalContent = "";
	let lastIndex = 0;
	// Use the original `remainingContent` that has had tags removed but not context yet,
	// but for context removal, we refer to `exclusions` based on the *original* content.
	let contentForContextRemoval = contentWithoutTagsOrContext;

	if (exclusions.length > 0) {
		// Process content segments between exclusions
		for (const ex of exclusions) {
			// Segment before the current exclusion
			const segment = contentForContextRemoval.substring(
				lastIndex,
				ex.start
			);
			// Remove @context from this segment
			finalContent += segment.replace(EMOJI_CONTEXT_REGEX, "").trim(); // Using global regex here
			// Add the original excluded text (link or code) back
			finalContent += ex.text; // Add the original link/code text back
			lastIndex = ex.end;
		}
		// Process the remaining segment after the last exclusion
		const lastSegment = contentForContextRemoval.substring(lastIndex);
		finalContent += lastSegment.replace(EMOJI_CONTEXT_REGEX, "").trim(); // Global regex
	} else {
		// No exclusions, safe to remove @context directly from the whole content
		finalContent = contentForContextRemoval
			.replace(EMOJI_CONTEXT_REGEX, "")
			.trim(); // Global regex
	}

	// Clean up extra spaces that might result from replacements
	finalContent = finalContent.replace(/\s{2,}/g, " ").trim();

	return finalContent;
}

/**
 * Parse a single task line using regex and metadata format preference
 */
export function parseTaskLine(
	filePath: string,
	line: string,
	lineNumber: number,
	format: MetadataFormat
): Task | null {
	const taskMatch = line.match(TASK_REGEX);

	if (!taskMatch) return null;

	const [fullMatch, , , , status, contentWithMetadata] = taskMatch;
	if (status === undefined || contentWithMetadata === undefined) return null;

	const completed = status.toLowerCase() === "x";
	const id = `${filePath}-L${lineNumber}`;

	const task: Task = {
		id,
		content: contentWithMetadata.trim(), // Will be set after extraction
		filePath,
		line: lineNumber,
		completed,
		status: status,
		originalMarkdown: line,
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
		heading: [],
	};

	// Extract metadata in order
	let remainingContent = contentWithMetadata;
	remainingContent = extractDates(task, remainingContent, format);
	remainingContent = extractRecurrence(task, remainingContent, format);
	remainingContent = extractPriority(task, remainingContent, format);
	remainingContent = extractProject(task, remainingContent, format); // Extract project before context/tags
	remainingContent = extractContext(task, remainingContent, format);
	remainingContent = extractTags(task, remainingContent, format); // Tags last

	task.content = remainingContent.replace(/\s{2,}/g, " ").trim();

	return task;
}

export function parseTasksFromContent(
	path: string,
	content: string,
	format: MetadataFormat
): Task[] {
	const tasks: Task[] = [];
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const task = parseTaskLine(path, line, i + 1, format);
		if (task) {
			tasks.push(task);
		}
	}
	return tasks;
}
