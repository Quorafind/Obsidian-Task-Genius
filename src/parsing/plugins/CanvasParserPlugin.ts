/**
 * Canvas Parser Plugin - Unified canvas task parsing
 * 
 * Integrates the logic from CanvasParser into the unified parsing system
 * for parsing tasks from Obsidian Canvas files.
 */

import { Component } from 'obsidian';
import { ParserPlugin } from './ParserPlugin';
import { ParseContext } from '../core/ParseContext';
import { ParseEventType } from '../events/ParseEvents';
import { 
    CanvasParseResult, 
    ParsePriority, 
    CacheType,
    ParsingStatistics 
} from '../types/ParsingTypes';
import { Task, CanvasTaskMetadata, TgProject } from '../../types/task';
import { 
    CanvasData, 
    CanvasTextData, 
    ParsedCanvasContent,
    CanvasParsingOptions 
} from '../../types/canvas';
import { TaskParserConfig } from '../../types/TaskParserConfig';
import { MarkdownParserPlugin } from './MarkdownParserPlugin';
import { Deferred } from '../utils/Deferred';

const DEFAULT_CANVAS_PARSING_OPTIONS: CanvasParsingOptions = {
    includeNodeIds: false,
    includePositions: false,
    nodeSeparator: "\n\n",
    preserveLineBreaks: true,
};

export class CanvasParserPlugin extends ParserPlugin {
    name = 'canvas';
    supportedTypes = ['canvas'];
    private priority = ParsePriority.NORMAL;

    private markdownPlugin: MarkdownParserPlugin;
    private options: CanvasParsingOptions;
    private parseQueue = new Map<string, Deferred<CanvasParseResult>>();
    private activeParses = 0;
    private readonly maxConcurrentParses = 2;

    constructor(markdownPlugin: MarkdownParserPlugin) {
        super();
        this.markdownPlugin = markdownPlugin;
        this.options = { ...DEFAULT_CANVAS_PARSING_OPTIONS };
    }

    protected setupEventListeners(): void {
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file.extension === 'canvas') {
                    this.invalidateCache(file.path);
                    this.eventManager.trigger(ParseEventType.FILE_CONTENT_CHANGED, {
                        filePath: file.path,
                        source: this.name
                    });
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                if (file.extension === 'canvas') {
                    this.cacheManager.invalidateByPath(oldPath, CacheType.CANVAS_TASKS);
                    this.eventManager.trigger(ParseEventType.FILE_RENAMED, {
                        oldPath,
                        newPath: file.path,
                        source: this.name
                    });
                }
            })
        );

        this.registerEvent(
            this.eventManager.on(ParseEventType.CACHE_INVALIDATED, (data) => {
                if (data.type === CacheType.CANVAS_TASKS) {
                    this.parseQueue.delete(data.key);
                }
            })
        );
    }

    public async parse(context: ParseContext): Promise<CanvasParseResult> {
        const startTime = performance.now();
        const cacheKey = this.generateCacheKey(context);

        try {
            this.eventManager.trigger(ParseEventType.PARSE_STARTED, {
                filePath: context.filePath,
                type: this.name,
                cacheKey
            });

            let cached = this.cacheManager.get<CanvasParseResult>(
                cacheKey, 
                CacheType.CANVAS_TASKS
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

            const deferred = new Deferred<CanvasParseResult>();
            this.parseQueue.set(cacheKey, deferred);
            this.activeParses++;

            try {
                const result = await this.parseInternal(context);
                
                this.cacheManager.set(
                    cacheKey, 
                    result, 
                    CacheType.CANVAS_TASKS,
                    {
                        mtime: context.mtime,
                        ttl: 600000,
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

    private async parseInternal(context: ParseContext): Promise<CanvasParseResult> {
        try {
            if (!this.isValidCanvasContent(context.content)) {
                return {
                    success: false,
                    tasks: [],
                    metadata: {
                        totalNodes: 0,
                        textNodes: 0,
                        tasksFound: 0,
                        error: 'Invalid canvas content'
                    },
                    filePath: context.filePath,
                    parseTime: performance.now()
                };
            }

            const canvasData: CanvasData = JSON.parse(context.content);
            const parsedContent = this.extractCanvasContent(canvasData, context.filePath);
            
            if (!parsedContent || !parsedContent.textContent.trim()) {
                return {
                    success: true,
                    tasks: [],
                    metadata: {
                        totalNodes: canvasData.nodes.length,
                        textNodes: parsedContent?.textNodes.length || 0,
                        tasksFound: 0
                    },
                    filePath: context.filePath,
                    parseTime: performance.now()
                };
            }

            const tasks = await this.parseTasksFromCanvasContent(parsedContent, context);

            const result: CanvasParseResult = {
                success: true,
                tasks,
                metadata: {
                    totalNodes: canvasData.nodes.length,
                    textNodes: parsedContent.textNodes.length,
                    tasksFound: tasks.length,
                    options: this.options
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

        } catch (error) {
            return {
                success: false,
                tasks: [],
                metadata: {
                    totalNodes: 0,
                    textNodes: 0,
                    tasksFound: 0,
                    error: error instanceof Error ? error.message : String(error)
                },
                filePath: context.filePath,
                parseTime: performance.now()
            };
        }
    }

    private extractCanvasContent(
        canvasData: CanvasData,
        filePath: string
    ): ParsedCanvasContent {
        const textNodes = canvasData.nodes.filter(
            (node): node is CanvasTextData => node.type === "text"
        );

        const textContents: string[] = [];

        for (const textNode of textNodes) {
            let nodeContent = textNode.text;

            if (this.options.includeNodeIds) {
                nodeContent = `<!-- Node ID: ${textNode.id} -->\n${nodeContent}`;
            }

            if (this.options.includePositions) {
                nodeContent = `<!-- Position: x=${textNode.x}, y=${textNode.y} -->\n${nodeContent}`;
            }

            if (!this.options.preserveLineBreaks) {
                nodeContent = nodeContent.replace(/\n/g, " ");
            }

            textContents.push(nodeContent);
        }

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

    private async parseTasksFromCanvasContent(
        parsedContent: ParsedCanvasContent,
        context: ParseContext
    ): Promise<Task<CanvasTaskMetadata>[]> {
        const { textContent, filePath } = parsedContent;

        const markdownContext = {
            ...context,
            content: textContent,
            fileType: 'markdown' as const
        };

        const markdownResult = await this.markdownPlugin.parse(markdownContext);
        const tasks = markdownResult.tasks || [];

        return tasks.map((task) =>
            this.enhanceTaskWithCanvasMetadata(task, parsedContent)
        );
    }

    private enhanceTaskWithCanvasMetadata(
        task: Task,
        parsedContent: ParsedCanvasContent
    ): Task<CanvasTaskMetadata> {
        const sourceNode = this.findSourceNode(task, parsedContent);

        if (sourceNode) {
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
            (task.metadata as CanvasTaskMetadata).sourceType = "canvas";
        }

        return task as Task<CanvasTaskMetadata>;
    }

    private findSourceNode(
        task: Task,
        parsedContent: ParsedCanvasContent
    ): CanvasTextData | null {
        const { textNodes } = parsedContent;

        for (const node of textNodes) {
            if (node.text.includes(task.originalMarkdown)) {
                return node;
            }
        }

        return null;
    }

    private isValidCanvasContent(content: string): boolean {
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

    private generateCacheKey(context: ParseContext): string {
        return `canvas:${context.filePath}:${context.mtime || 0}`;
    }

    private isCacheValid(cached: CanvasParseResult, context: ParseContext): boolean {
        return cached.filePath === context.filePath && 
               cached.parseTime !== undefined;
    }

    private invalidateCache(filePath: string): void {
        this.cacheManager.invalidateByPath(filePath, CacheType.CANVAS_TASKS);
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

    public updateOptions(options: Partial<CanvasParsingOptions>): void {
        this.options = { ...this.options, ...options };
        this.cacheManager.invalidateByPattern('canvas:', CacheType.CANVAS_TASKS);
        
        this.eventManager.trigger(ParseEventType.PARSER_CONFIG_CHANGED, {
            parserType: this.name,
            changes: options,
            source: this.name
        });
    }

    public getOptions(): CanvasParsingOptions {
        return { ...this.options };
    }

    public extractTextOnly(content: string): string {
        try {
            const canvasData: CanvasData = JSON.parse(content);
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