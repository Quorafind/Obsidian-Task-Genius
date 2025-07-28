/**
 * Markdown Parser Plugin - Unified markdown task parsing
 * 
 * Integrates the logic from CoreTaskParser and MarkdownTaskParser
 * into a unified parsing solution for markdown content.
 */

import { Component } from 'obsidian';
import { ParserPlugin } from './ParserPlugin';
import { ParseContext } from '../core/ParseContext';
import { ParseEventType } from '../events/ParseEvents';
import { 
    MarkdownParseResult, 
    ParsePriority, 
    CacheType,
    ParsingStatistics 
} from '../types/ParsingTypes';
import { Task, TgProject, EnhancedTask } from '../../types/task';
import { TaskParserConfig, MetadataParseMode } from '../../types/TaskParserConfig';
import { ContextDetector } from '../../utils/workers/ContextDetector';
import { TASK_REGEX } from '../../common/regex-define';
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
} from '../../common/regex-define';
import { PRIORITY_MAP } from '../../common/default-symbol';
import { parseLocalDate } from '../../utils/dateUtil';
import { Deferred } from '../utils/Deferred';

type MetadataFormat = "tasks" | "dataview";

interface CoreParsingOptions {
    preferMetadataFormat: MetadataFormat;
    parseHeadings: boolean;
    ignoreHeading?: string;
    focusHeading?: string;
    parseHierarchy: boolean;
}

const DEFAULT_PARSING_OPTIONS: CoreParsingOptions = {
    preferMetadataFormat: "tasks",
    parseHeadings: true,
    parseHierarchy: true,
};

export class MarkdownParserPlugin extends ParserPlugin {
    name = 'markdown';
    supportedTypes = ['markdown', 'md'];
    private priority = ParsePriority.HIGH;

    private static readonly dateCache = new Map<string, number | undefined>();
    private static readonly MAX_CACHE_SIZE = 10000;

    private indentStack: Array<{
        taskId: string;
        indentLevel: number;
        actualSpaces: number;
    }> = [];

    private parseQueue = new Map<string, Deferred<MarkdownParseResult>>();
    private activeParses = 0;
    private readonly maxConcurrentParses = 3;

    protected setupEventListeners(): void {
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (file.extension === 'md') {
                    this.invalidateCache(file.path);
                    this.eventManager.trigger(ParseEventType.FILE_METADATA_CHANGED, {
                        filePath: file.path,
                        source: this.name
                    });
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file.extension === 'md') {
                    this.invalidateCache(file.path);
                    this.eventManager.trigger(ParseEventType.FILE_CONTENT_CHANGED, {
                        filePath: file.path,
                        source: this.name
                    });
                }
            })
        );

        this.registerEvent(
            this.eventManager.on(ParseEventType.CACHE_INVALIDATED, (data) => {
                if (data.type === CacheType.MARKDOWN_TASKS) {
                    this.parseQueue.delete(data.key);
                }
            })
        );
    }

    public async parse(context: ParseContext): Promise<MarkdownParseResult> {
        const startTime = performance.now();
        const cacheKey = this.generateCacheKey(context);

        try {
            this.eventManager.trigger(ParseEventType.PARSE_STARTED, {
                filePath: context.filePath,
                type: this.name,
                cacheKey
            });

            let cached = this.cacheManager.get<MarkdownParseResult>(
                cacheKey, 
                CacheType.MARKDOWN_TASKS
            );
            if (cached && this.isCacheValid(cached, context)) {
                this.updateStatistics({ cacheHits: 1 });
                return cached;
            }

            if (this.parseQueue.has(cacheKey)) {
                return await this.parseQueue.get(cacheKey)!.promise;
            }

            if (this.activeParses >= this.maxConcurrentParses) {
                await this.waitForSlot();
            }

            const deferred = new Deferred<MarkdownParseResult>();
            this.parseQueue.set(cacheKey, deferred);
            this.activeParses++;

            try {
                const result = await this.parseInternal(context);
                
                this.cacheManager.set(
                    cacheKey, 
                    result, 
                    CacheType.MARKDOWN_TASKS,
                    {
                        mtime: context.mtime,
                        ttl: 300000,
                        dependencies: [context.filePath]
                    }
                );

                deferred.resolve(result);
                
                const endTime = performance.now();
                this.updateStatistics({
                    cacheMisses: 1,
                    parseTime: endTime - startTime,
                    tasksFound: result.tasks?.length || 0
                });

                this.eventManager.trigger(ParseEventType.PARSE_COMPLETED, {
                    filePath: context.filePath,
                    type: this.name,
                    duration: endTime - startTime,
                    tasksFound: result.tasks?.length || 0
                });

                return result;

            } catch (error) {
                deferred.reject(error);
                this.eventManager.trigger(ParseEventType.PARSE_FAILED, {
                    filePath: context.filePath,
                    type: this.name,
                    error: error instanceof Error ? error.message : String(error)
                });
                throw error;

            } finally {
                this.parseQueue.delete(cacheKey);
                this.activeParses--;
            }

        } catch (error) {
            const endTime = performance.now();
            this.updateStatistics({
                errors: 1,
                parseTime: endTime - startTime
            });
            throw error;
        }
    }

    private async parseInternal(context: ParseContext): Promise<MarkdownParseResult> {
        const config = this.createParsingConfig(context);
        const options: CoreParsingOptions = {
            ...DEFAULT_PARSING_OPTIONS,
            ...context.settings?.markdown
        };

        const tasks: Task[] = [];
        const enhancedTasks: EnhancedTask[] = [];
        const lines = context.content.split(/\r?\n/);
        let inCodeBlock = false;
        const headings: string[] = [];
        this.indentStack = [];

        const ignoreHeadings = options.ignoreHeading
            ? options.ignoreHeading.split(",").map((h) => h.trim())
            : [];
        const focusHeadings = options.focusHeading
            ? options.focusHeading.split(",").map((h) => h.trim())
            : [];

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

            if (line.trim().startsWith("```") || line.trim().startsWith("~~~")) {
                inCodeBlock = !inCodeBlock;
                continue;
            }

            if (inCodeBlock) {
                continue;
            }

            if (options.parseHeadings) {
                const headingMatch = line.match(/^(#{1,6})\s+(.*?)(?:\s+#+)?$/);
                if (headingMatch) {
                    const [_, headingMarkers, headingText] = headingMatch;
                    const level = headingMarkers.length;

                    while (headings.length > 0) {
                        const lastHeadingLevel = (
                            headings[headings.length - 1].match(/^(#{1,6})/)?.[1] || ""
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

            if (shouldFilterHeading()) {
                continue;
            }

            const task = this.parseTaskLine(
                context.filePath,
                line,
                i,
                [...headings],
                options,
                config
            );
            
            if (task) {
                tasks.push(task);

                const enhancedTask = this.convertToEnhancedTask(
                    task,
                    line,
                    i,
                    headings,
                    context
                );
                enhancedTasks.push(enhancedTask);
            }
        }

        if (options.parseHierarchy) {
            this.buildTaskHierarchy(tasks);
            this.buildEnhancedTaskHierarchy(enhancedTasks);
        }

        const result: MarkdownParseResult = {
            success: true,
            tasks,
            enhancedTasks,
            metadata: {
                totalLines: lines.length,
                taskLines: tasks.length,
                headings: headings.length,
                parseMode: options.preferMetadataFormat,
                hasCodeBlocks: context.content.includes('```')
            },
            filePath: context.filePath,
            parseTime: performance.now()
        };

        this.eventManager.trigger(ParseEventType.TASKS_PARSED, {
            filePath: context.filePath,
            tasks: tasks.map(t => ({ id: t.id, content: t.content })),
            source: this.name
        });

        return result;
    }

    private parseTaskLine(
        filePath: string,
        line: string,
        lineNumber: number,
        headingContext: string[],
        options: CoreParsingOptions,
        config: TaskParserConfig
    ): Task | null {
        const taskMatch = line.match(TASK_REGEX);
        if (!taskMatch) return null;

        const [fullMatch, , , , status, contentWithMetadata] = taskMatch;
        if (status === undefined || contentWithMetadata === undefined) return null;

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

        let remainingContent = contentWithMetadata;
        remainingContent = this.extractDates(task, remainingContent, options);
        remainingContent = this.extractRecurrence(task, remainingContent, options);
        remainingContent = this.extractPriority(task, remainingContent, options);
        remainingContent = this.extractProject(task, remainingContent, options);
        remainingContent = this.extractContext(task, remainingContent, options);
        remainingContent = this.extractOnCompletion(task, remainingContent, options);
        remainingContent = this.extractDependsOn(task, remainingContent, options);
        remainingContent = this.extractId(task, remainingContent, options);
        remainingContent = this.extractTags(task, remainingContent, options);

        task.content = remainingContent.replace(/\s{2,}/g, " ").trim();

        return task;
    }

    private convertToEnhancedTask(
        task: Task,
        line: string,
        lineNumber: number,
        headings: string[],
        context: ParseContext
    ): EnhancedTask {
        const actualIndent = this.getIndentLevel(line);
        const [parentId, indentLevel] = this.findParentAndLevel(actualIndent);

        const enhancedTask: EnhancedTask = {
            id: task.id,
            content: task.content,
            status: task.status,
            rawStatus: task.status,
            completed: task.completed,
            indentLevel,
            parentId,
            childrenIds: [],
            metadata: { ...task.metadata },
            tags: task.metadata.tags || [],
            lineNumber: lineNumber + 1,
            actualIndent,
            heading: headings[headings.length - 1],
            headingLevel: headings.length,
            listMarker: this.extractListMarker(line.trim()),
            filePath: task.filePath,
            originalMarkdown: task.originalMarkdown,
            tgProject: context.projectConfig?.project as TgProject,

            line: task.line,
            children: [],
            priority: task.metadata.priority,
            startDate: task.metadata.startDate,
            dueDate: task.metadata.dueDate,
            scheduledDate: task.metadata.scheduledDate,
            completedDate: task.metadata.completedDate,
            createdDate: task.metadata.createdDate,
            recurrence: task.metadata.recurrence,
            project: task.metadata.project,
            context: task.metadata.context,
        };

        this.updateIndentStack(task.id, indentLevel, actualIndent);

        return enhancedTask;
    }

    private buildTaskHierarchy(tasks: Task[]): void {
        tasks.sort((a, b) => a.line - b.line);
        const taskStack: { task: Task; indent: number }[] = [];

        for (const currentTask of tasks) {
            const currentIndent = this.getIndentLevel(currentTask.originalMarkdown);

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

    private buildEnhancedTaskHierarchy(tasks: EnhancedTask[]): void {
        tasks.sort((a, b) => a.line - b.line);

        for (const task of tasks) {
            if (task.parentId) {
                const parentTask = tasks.find(t => t.id === task.parentId);
                if (parentTask) {
                    parentTask.childrenIds.push(task.id);
                    parentTask.children.push(task.id);
                }
            }
        }
    }

    private findParentAndLevel(actualSpaces: number): [string | undefined, number] {
        if (this.indentStack.length === 0 || actualSpaces === 0) {
            return [undefined, 0];
        }

        for (let i = this.indentStack.length - 1; i >= 0; i--) {
            const { taskId, indentLevel, actualSpaces: spaces } = this.indentStack[i];
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
        while (this.indentStack.length > 0) {
            const lastItem = this.indentStack[this.indentStack.length - 1];
            if (lastItem.actualSpaces >= actualSpaces) {
                this.indentStack.pop();
            } else {
                break;
            }
        }

        this.indentStack.push({ taskId, indentLevel, actualSpaces });
    }

    private getIndentLevel(line: string): number {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }

    private extractListMarker(trimmed: string): string {
        for (const marker of ["-", "*", "+"]) {
            if (trimmed.startsWith(marker)) {
                return marker;
            }
        }

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

        return trimmed.charAt(0) || " ";
    }

    private createParsingConfig(context: ParseContext): TaskParserConfig {
        return {
            parseMetadata: true,
            parseTags: true,
            parseComments: true,
            parseHeadings: true,
            maxIndentSize: 100,
            maxParseIterations: 100,
            maxMetadataIterations: 50,
            maxTagLength: 50,
            maxEmojiValueLength: 50,
            maxStackOperations: 1000,
            maxStackSize: 50,
            statusMapping: {
                "TODO": " ",
                "IN_PROGRESS": "/",
                "DONE": "x",
                "CANCELLED": "-"
            },
            emojiMapping: {
                "📅": "dueDate",
                "🛫": "startDate",
                "⏳": "scheduledDate",
                "✅": "completedDate",
                "➕": "createdDate",
                "❌": "cancelledDate",
                "🆔": "id",
                "⛔": "dependsOn",
                "🏁": "onCompletion",
                "🔁": "repeat",
                "🔺": "priority",
                "⏫": "priority",
                "🔼": "priority",
                "🔽": "priority",
                "⏬": "priority"
            },
            metadataParseMode: MetadataParseMode.Both,
            specialTagPrefixes: {
                "project": "project",
                "@": "context"
            },
            ...context.settings?.markdownParser
        };
    }

    private extractDates(task: Task, content: string, options: CoreParsingOptions): string {
        let remainingContent = content;
        const useDataview = options.preferMetadataFormat === "dataview";

        const tryParseAndAssign = (
            regex: RegExp,
            fieldName: "dueDate" | "scheduledDate" | "startDate" | "completedDate" | "cancelledDate" | "createdDate"
        ): boolean => {
            if (task.metadata[fieldName] !== undefined) return false;

            const match = remainingContent.match(regex);
            if (match && match[1]) {
                const dateVal = this.parseDate(match[1]);
                if (dateVal !== undefined) {
                    task.metadata[fieldName] = dateVal;
                    remainingContent = remainingContent.replace(match[0], "");
                    return true;
                }
            }
            return false;
        };

        if (useDataview) {
            !tryParseAndAssign(DV_DUE_DATE_REGEX, "dueDate") &&
                tryParseAndAssign(EMOJI_DUE_DATE_REGEX, "dueDate");
            !tryParseAndAssign(DV_SCHEDULED_DATE_REGEX, "scheduledDate") &&
                tryParseAndAssign(EMOJI_SCHEDULED_DATE_REGEX, "scheduledDate");
            !tryParseAndAssign(DV_START_DATE_REGEX, "startDate") &&
                tryParseAndAssign(EMOJI_START_DATE_REGEX, "startDate");
            !tryParseAndAssign(DV_COMPLETED_DATE_REGEX, "completedDate") &&
                tryParseAndAssign(EMOJI_COMPLETED_DATE_REGEX, "completedDate");
            !tryParseAndAssign(DV_CREATED_DATE_REGEX, "createdDate") &&
                tryParseAndAssign(EMOJI_CREATED_DATE_REGEX, "createdDate");
        } else {
            !tryParseAndAssign(EMOJI_DUE_DATE_REGEX, "dueDate") &&
                tryParseAndAssign(DV_DUE_DATE_REGEX, "dueDate");
            !tryParseAndAssign(EMOJI_SCHEDULED_DATE_REGEX, "scheduledDate") &&
                tryParseAndAssign(DV_SCHEDULED_DATE_REGEX, "scheduledDate");
            !tryParseAndAssign(EMOJI_START_DATE_REGEX, "startDate") &&
                tryParseAndAssign(DV_START_DATE_REGEX, "startDate");
            !tryParseAndAssign(EMOJI_COMPLETED_DATE_REGEX, "completedDate") &&
                tryParseAndAssign(DV_COMPLETED_DATE_REGEX, "completedDate");
            !tryParseAndAssign(EMOJI_CREATED_DATE_REGEX, "createdDate") &&
                tryParseAndAssign(DV_CREATED_DATE_REGEX, "createdDate");
        }

        return remainingContent;
    }

    private extractRecurrence(task: Task, content: string, options: CoreParsingOptions): string {
        let remainingContent = content;
        const useDataview = options.preferMetadataFormat === "dataview";
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

    private extractPriority(task: Task, content: string, options: CoreParsingOptions): string {
        let remainingContent = content;
        const useDataview = options.preferMetadataFormat === "dataview";
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
                        remainingContent = remainingContent.replace(match[0], "");
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

    private extractProject(task: Task, content: string, options: CoreParsingOptions): string {
        let remainingContent = content;
        const useDataview = options.preferMetadataFormat === "dataview";
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

    private extractContext(task: Task, content: string, options: CoreParsingOptions): string {
        let remainingContent = content;
        const useDataview = options.preferMetadataFormat === "dataview";
        let match: RegExpMatchArray | null = null;

        if (useDataview) {
            match = remainingContent.match(DV_CONTEXT_REGEX);
            if (match && match[1]) {
                task.metadata.context = match[1].trim();
                remainingContent = remainingContent.replace(match[0], "");
                return remainingContent;
            }
        }

        const wikiLinkMatches: string[] = [];
        const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
        let wikiMatch;
        while ((wikiMatch = wikiLinkRegex.exec(remainingContent)) !== null) {
            wikiLinkMatches.push(wikiMatch[0]);
        }

        const contextMatch = new RegExp(EMOJI_CONTEXT_REGEX.source, "").exec(remainingContent);

        if (contextMatch && contextMatch[1]) {
            const matchPosition = contextMatch.index;
            const isInsideWikiLink = wikiLinkMatches.some((link) => {
                const linkStart = remainingContent.indexOf(link);
                const linkEnd = linkStart + link.length;
                return matchPosition >= linkStart && matchPosition < linkEnd;
            });

            if (!isInsideWikiLink) {
                task.metadata.context = contextMatch[1].trim();
                remainingContent = remainingContent.replace(contextMatch[0], "");
            }
        }

        return remainingContent;
    }

    private extractOnCompletion(task: Task, content: string, options: CoreParsingOptions): string {
        let remainingContent = content;
        const useDataview = options.preferMetadataFormat === "dataview";
        let match: RegExpMatchArray | null = null;

        if (useDataview) {
            match = remainingContent.match(/\[onCompletion::\s*([^\]]+)\]/i);
            if (match && match[1]) {
                const onCompletionValue = match[1].trim();
                task.metadata.onCompletion = onCompletionValue;
                remainingContent = remainingContent.replace(match[0], "");
                return remainingContent;
            }
        }

        match = remainingContent.match(/🏁\s*(.+?)(?=\s|$)/);
        if (match && match[1]) {
            let onCompletionValue = match[1].trim();
            
            if (onCompletionValue.startsWith('{')) {
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
                    remainingContent = remainingContent.substring(0, match.index!) + 
                        remainingContent.substring(jsonEnd + 1);
                }
            } else {
                remainingContent = remainingContent.replace(match[0], "");
            }
            
            task.metadata.onCompletion = onCompletionValue;
            return remainingContent;
        }

        match = remainingContent.match(/\bonCompletion:\s*([^\s]+)/i);
        if (match && match[1]) {
            task.metadata.onCompletion = match[1].trim();
            remainingContent = remainingContent.replace(match[0], "");
        }

        return remainingContent;
    }

    private extractDependsOn(task: Task, content: string, options: CoreParsingOptions): string {
        let remainingContent = content;
        const useDataview = options.preferMetadataFormat === "dataview";
        let match: RegExpMatchArray | null = null;

        if (useDataview) {
            match = remainingContent.match(/\[dependsOn::\s*([^\]]+)\]/i);
            if (match && match[1]) {
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
            task.metadata.dependsOn = match[1]
                .split(",")
                .map((id) => id.trim())
                .filter((id) => id.length > 0);
            remainingContent = remainingContent.replace(match[0], "");
        }

        return remainingContent;
    }

    private extractId(task: Task, content: string, options: CoreParsingOptions): string {
        let remainingContent = content;
        const useDataview = options.preferMetadataFormat === "dataview";
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

    private extractTags(task: Task, content: string, options: CoreParsingOptions): string {
        let remainingContent = content;
        const useDataview = options.preferMetadataFormat === "dataview";

        if (useDataview) {
            remainingContent = remainingContent.replace(ANY_DATAVIEW_FIELD_REGEX, "");
        }

        const exclusions: { text: string; start: number; end: number }[] = [];

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

        exclusions.sort((a, b) => a.start - b.start);

        let processedContent = remainingContent.split("");
        for (const ex of exclusions) {
            for (let i = ex.start; i < ex.end && i < processedContent.length; i++) {
                processedContent[i] = " ";
            }
        }
        const finalProcessedContent = processedContent.join("");

        const tagMatches = finalProcessedContent.match(EMOJI_TAG_REGEX) || [];
        task.metadata.tags = tagMatches.map((tag) => tag.trim());

        if (!useDataview && !task.metadata.project) {
            const projectTag = task.metadata.tags.find(
                (tag) =>
                    typeof tag === "string" &&
                    tag.startsWith(EMOJI_PROJECT_PREFIX)
            );
            if (projectTag) {
                task.metadata.project = projectTag.substring(EMOJI_PROJECT_PREFIX.length);
            }
        }

        if (useDataview) {
            task.metadata.tags = task.metadata.tags.filter(
                (tag) =>
                    typeof tag === "string" &&
                    !tag.startsWith(EMOJI_PROJECT_PREFIX)
            );
        }

        let contentWithoutTagsOrContext = remainingContent;
        for (const tag of task.metadata.tags) {
            if (tag && tag !== "#") {
                const escapedTag = tag.replace(/[.*+?^${}()|[\\\]]/g, "\\$&");
                const tagRegex = new RegExp(`\s?` + escapedTag + `(?=\s|$)`, "g");
                contentWithoutTagsOrContext = contentWithoutTagsOrContext.replace(tagRegex, "");
            }
        }

        let finalContent = "";
        let lastIndex = 0;

        if (exclusions.length > 0) {
            for (const ex of exclusions) {
                const segment = contentWithoutTagsOrContext.substring(lastIndex, ex.start);
                finalContent += segment.replace(EMOJI_CONTEXT_REGEX, "").trim();
                finalContent += ex.text;
                lastIndex = ex.end;
            }
            const lastSegment = contentWithoutTagsOrContext.substring(lastIndex);
            finalContent += lastSegment.replace(EMOJI_CONTEXT_REGEX, "").trim();
        } else {
            finalContent = contentWithoutTagsOrContext
                .replace(EMOJI_CONTEXT_REGEX, "")
                .trim();
        }

        return finalContent.replace(/\s{2,}/g, " ").trim();
    }

    private parseDate(dateStr: string): number | undefined {
        const cached = MarkdownParserPlugin.dateCache.get(dateStr);
        if (cached !== undefined) {
            return cached;
        }

        const date = parseLocalDate(dateStr);

        if (MarkdownParserPlugin.dateCache.size >= MarkdownParserPlugin.MAX_CACHE_SIZE) {
            const firstKey = MarkdownParserPlugin.dateCache.keys().next().value;
            if (firstKey) {
                MarkdownParserPlugin.dateCache.delete(firstKey);
            }
        }

        MarkdownParserPlugin.dateCache.set(dateStr, date);
        return date;
    }

    private generateCacheKey(context: ParseContext): string {
        return `markdown:${context.filePath}:${context.mtime || 0}`;
    }

    private isCacheValid(cached: MarkdownParseResult, context: ParseContext): boolean {
        return cached.filePath === context.filePath && 
               cached.parseTime !== undefined;
    }

    private invalidateCache(filePath: string): void {
        this.cacheManager.invalidateByPath(filePath, CacheType.MARKDOWN_TASKS);
    }

    private async waitForSlot(): Promise<void> {
        return new Promise<void>((resolve) => {
            const checkSlot = () => {
                if (this.activeParses < this.maxConcurrentParses) {
                    resolve();
                } else {
                    setTimeout(checkSlot, 10);
                }
            };
            checkSlot();
        });
    }

    private updateStatistics(stats: Partial<ParsingStatistics>): void {
        this.statistics = {
            ...this.statistics,
            ...stats,
            cacheHits: (this.statistics.cacheHits || 0) + (stats.cacheHits || 0),
            cacheMisses: (this.statistics.cacheMisses || 0) + (stats.cacheMisses || 0),
            errors: (this.statistics.errors || 0) + (stats.errors || 0),
            parseTime: (this.statistics.parseTime || 0) + (stats.parseTime || 0),
            tasksFound: (this.statistics.tasksFound || 0) + (stats.tasksFound || 0)
        };
    }

    public static clearDateCache(): void {
        MarkdownParserPlugin.dateCache.clear();
    }

    public static getDateCacheStats(): { size: number; maxSize: number } {
        return {
            size: MarkdownParserPlugin.dateCache.size,
            maxSize: MarkdownParserPlugin.MAX_CACHE_SIZE,
        };
    }
}