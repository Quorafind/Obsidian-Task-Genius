/**
 * Metadata Parser Plugin - Unified file metadata task parsing
 * 
 * Integrates the logic from FileMetadataTaskParser into the unified parsing system
 * for extracting tasks from file frontmatter and tags.
 */

import { Component, CachedMetadata } from 'obsidian';
import { ParserPlugin } from './ParserPlugin';
import { ParseContext } from '../core/ParseContext';
import { ParseEventType } from '../events/ParseEvents';
import { 
    MetadataParseResult, 
    ParsePriority, 
    CacheType,
    ParsingStatistics 
} from '../types/ParsingTypes';
import { Task, StandardFileTaskMetadata } from '../../types/task';
import { FileParsingConfiguration } from '../../common/setting-definition';
import { Deferred } from '../utils/Deferred';

interface FileTaskParsingResult {
    tasks: Task[];
    errors: string[];
}

const DEFAULT_FILE_PARSING_CONFIG: FileParsingConfiguration = {
    enableFileMetadataParsing: true,
    enableTagBasedTaskParsing: true,
    metadataFieldsToParseAsTasks: ['todo', 'task', 'due', 'completed'],
    tagsToParseAsTasks: ['#todo', '#task'],
    taskContentFromMetadata: 'title',
    defaultTaskStatus: ' ',
};

export class MetadataParserPlugin extends ParserPlugin {
    name = 'metadata';
    supportedTypes = ['all'];
    private priority = ParsePriority.LOW;

    private config: FileParsingConfiguration;
    private parseQueue = new Map<string, Deferred<MetadataParseResult>>();
    private activeParses = 0;
    private readonly maxConcurrentParses = 5;

    constructor(config: Partial<FileParsingConfiguration> = {}) {
        super();
        this.config = { ...DEFAULT_FILE_PARSING_CONFIG, ...config };
    }

    protected setupEventListeners(): void {
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                this.invalidateCache(file.path);
                this.eventManager.trigger(ParseEventType.FILE_METADATA_CHANGED, {
                    filePath: file.path,
                    source: this.name
                });
            })
        );

        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                this.cacheManager.invalidateByPath(oldPath, CacheType.FILE_METADATA);
                this.eventManager.trigger(ParseEventType.FILE_RENAMED, {
                    oldPath,
                    newPath: file.path,
                    source: this.name
                });
            })
        );

        this.registerEvent(
            this.eventManager.on(ParseEventType.CACHE_INVALIDATED, (data) => {
                if (data.type === CacheType.FILE_METADATA) {
                    this.parseQueue.delete(data.key);
                }
            })
        );
    }

    public async parse(context: ParseContext): Promise<MetadataParseResult> {
        const startTime = performance.now();
        const cacheKey = this.generateCacheKey(context);

        try {
            this.eventManager.trigger(ParseEventType.PARSE_STARTED, {
                filePath: context.filePath,
                type: this.name,
                cacheKey
            });

            let cached = this.cacheManager.get<MetadataParseResult>(
                cacheKey, 
                CacheType.FILE_METADATA
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

            const deferred = new Deferred<MetadataParseResult>();
            this.parseQueue.set(cacheKey, deferred);
            this.activeParses++;

            try {
                const result = await this.parseInternal(context);
                
                this.cacheManager.set(
                    cacheKey, 
                    result, 
                    CacheType.FILE_METADATA,
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

    private async parseInternal(context: ParseContext): Promise<MetadataParseResult> {
        const fileCache = this.app.metadataCache.getFileCache(
            this.app.vault.getAbstractFileByPath(context.filePath)
        ) as CachedMetadata | null;

        if (!fileCache && !this.config.enableFileMetadataParsing && !this.config.enableTagBasedTaskParsing) {
            return {
                success: true,
                tasks: [],
                metadata: {
                    hasMetadata: false,
                    hasTags: false,
                    metadataFields: [],
                    tags: [],
                    tasksFromMetadata: 0,
                    tasksFromTags: 0
                },
                filePath: context.filePath,
                parseTime: performance.now()
            };
        }

        const parseResult = this.parseFileForTasks(
            context.filePath,
            context.content,
            fileCache
        );

        const result: MetadataParseResult = {
            success: parseResult.errors.length === 0,
            tasks: parseResult.tasks,
            metadata: {
                hasMetadata: !!(fileCache?.frontmatter),
                hasTags: !!(fileCache?.tags && fileCache.tags.length > 0),
                metadataFields: fileCache?.frontmatter ? Object.keys(fileCache.frontmatter) : [],
                tags: fileCache?.tags?.map(t => t.tag) || [],
                tasksFromMetadata: parseResult.tasks.filter(t => t.metadata.source === 'file-metadata').length,
                tasksFromTags: parseResult.tasks.filter(t => t.metadata.source === 'file-tag').length,
                errors: parseResult.errors
            },
            filePath: context.filePath,
            parseTime: performance.now()
        };

        if (parseResult.tasks.length > 0) {
            this.eventManager.trigger(ParseEventType.METADATA_TASKS_PARSED, {
                filePath: context.filePath,
                tasks: parseResult.tasks.map(t => ({ id: t.id, content: t.content })),
                source: this.name
            });
        }

        return result;
    }

    private parseFileForTasks(
        filePath: string,
        fileContent: string,
        fileCache?: CachedMetadata
    ): FileTaskParsingResult {
        const tasks: Task[] = [];
        const errors: string[] = [];

        try {
            if (this.config.enableFileMetadataParsing && fileCache?.frontmatter) {
                const metadataTasks = this.parseMetadataTasks(
                    filePath,
                    fileCache.frontmatter,
                    fileContent
                );
                tasks.push(...metadataTasks.tasks);
                errors.push(...metadataTasks.errors);
            }

            if (this.config.enableTagBasedTaskParsing && fileCache?.tags) {
                const tagTasks = this.parseTagTasks(
                    filePath,
                    fileCache.tags,
                    fileCache.frontmatter,
                    fileContent
                );
                tasks.push(...tagTasks.tasks);
                errors.push(...tagTasks.errors);
            }
        } catch (error) {
            errors.push(`Error parsing file ${filePath}: ${error.message}`);
        }

        return { tasks, errors };
    }

    private parseMetadataTasks(
        filePath: string,
        frontmatter: Record<string, any>,
        fileContent: string
    ): FileTaskParsingResult {
        const tasks: Task[] = [];
        const errors: string[] = [];

        for (const fieldName of this.config.metadataFieldsToParseAsTasks) {
            if (frontmatter[fieldName] !== undefined) {
                try {
                    const task = this.createTaskFromMetadata(
                        filePath,
                        fieldName,
                        frontmatter[fieldName],
                        frontmatter,
                        fileContent
                    );
                    if (task) {
                        tasks.push(task);
                    }
                } catch (error) {
                    errors.push(
                        `Error creating task from metadata field ${fieldName} in ${filePath}: ${error.message}`
                    );
                }
            }
        }

        return { tasks, errors };
    }

    private parseTagTasks(
        filePath: string,
        tags: Array<{ tag: string; position: any }>,
        frontmatter: Record<string, any> | undefined,
        fileContent: string
    ): FileTaskParsingResult {
        const tasks: Task[] = [];
        const errors: string[] = [];

        const fileTags = tags.map((t) => t.tag);

        for (const targetTag of this.config.tagsToParseAsTasks) {
            const normalizedTargetTag = targetTag.startsWith("#")
                ? targetTag
                : `#${targetTag}`;

            if (fileTags.some((tag) => tag === normalizedTargetTag)) {
                try {
                    const task = this.createTaskFromTag(
                        filePath,
                        normalizedTargetTag,
                        frontmatter,
                        fileContent
                    );
                    if (task) {
                        tasks.push(task);
                    }
                } catch (error) {
                    errors.push(
                        `Error creating task from tag ${normalizedTargetTag} in ${filePath}: ${error.message}`
                    );
                }
            }
        }

        return { tasks, errors };
    }

    private createTaskFromMetadata(
        filePath: string,
        fieldName: string,
        fieldValue: any,
        frontmatter: Record<string, any>,
        fileContent: string
    ): Task | null {
        const taskContent = this.getTaskContent(frontmatter, filePath);
        const taskId = `${filePath}-metadata-${fieldName}`;
        const status = this.determineTaskStatus(fieldName, fieldValue);
        const completed = status.toLowerCase() === "x";
        const metadata = this.extractTaskMetadata(frontmatter, fieldName, fieldValue);

        const task: Task = {
            id: taskId,
            content: taskContent,
            filePath,
            line: 0,
            completed,
            status,
            originalMarkdown: `- [${status}] ${taskContent}`,
            metadata: {
                ...metadata,
                tags: this.extractTags(frontmatter),
                children: [],
                heading: [],
                source: "file-metadata",
                sourceField: fieldName,
                sourceValue: fieldValue,
            } as StandardFileTaskMetadata,
        };

        return task;
    }

    private createTaskFromTag(
        filePath: string,
        tag: string,
        frontmatter: Record<string, any> | undefined,
        fileContent: string
    ): Task | null {
        const taskContent = this.getTaskContent(frontmatter, filePath);
        const taskId = `${filePath}-tag-${tag.replace("#", "")}`;
        const status = this.config.defaultTaskStatus;
        const completed = status.toLowerCase() === "x";
        const metadata = this.extractTaskMetadata(frontmatter || {}, "tag", tag);

        const task: Task = {
            id: taskId,
            content: taskContent,
            filePath,
            line: 0,
            completed,
            status,
            originalMarkdown: `- [${status}] ${taskContent}`,
            metadata: {
                ...metadata,
                tags: this.extractTags(frontmatter),
                children: [],
                heading: [],
                source: "file-tag",
                sourceTag: tag,
            } as StandardFileTaskMetadata,
        };

        return task;
    }

    private getTaskContent(
        frontmatter: Record<string, any> | undefined,
        filePath: string
    ): string {
        if (frontmatter && frontmatter[this.config.taskContentFromMetadata]) {
            return String(frontmatter[this.config.taskContentFromMetadata]);
        }

        const fileName = filePath.split("/").pop() || filePath;
        return fileName.replace(/\.[^/.]+$/, "");
    }

    private determineTaskStatus(fieldName: string, fieldValue: any): string {
        if (
            fieldName.toLowerCase().includes("complete") ||
            fieldName.toLowerCase().includes("done")
        ) {
            return fieldValue ? "x" : " ";
        }

        if (
            fieldName.toLowerCase().includes("todo") ||
            fieldName.toLowerCase().includes("task")
        ) {
            if (typeof fieldValue === "boolean") {
                return fieldValue ? "x" : " ";
            }
            if (typeof fieldValue === "string" && fieldValue.length === 1) {
                return fieldValue;
            }
        }

        if (fieldName.toLowerCase().includes("due")) {
            return " ";
        }

        return this.config.defaultTaskStatus;
    }

    private extractTaskMetadata(
        frontmatter: Record<string, any>,
        sourceField: string,
        sourceValue: any
    ): Record<string, any> {
        const metadata: Record<string, any> = {};

        if (frontmatter.dueDate) {
            metadata.dueDate = this.parseDate(frontmatter.dueDate);
        }
        if (frontmatter.startDate) {
            metadata.startDate = this.parseDate(frontmatter.startDate);
        }
        if (frontmatter.scheduledDate) {
            metadata.scheduledDate = this.parseDate(frontmatter.scheduledDate);
        }
        if (frontmatter.priority) {
            metadata.priority = this.parsePriority(frontmatter.priority);
        }
        if (frontmatter.project) {
            metadata.project = String(frontmatter.project);
        }
        if (frontmatter.context) {
            metadata.context = String(frontmatter.context);
        }
        if (frontmatter.area) {
            metadata.area = String(frontmatter.area);
        }

        if (sourceField.toLowerCase().includes("due") && sourceValue) {
            metadata.dueDate = this.parseDate(sourceValue);
        }

        return metadata;
    }

    private extractTags(frontmatter: Record<string, any> | undefined): string[] {
        if (!frontmatter) return [];

        const tags: string[] = [];

        if (frontmatter.tags) {
            if (Array.isArray(frontmatter.tags)) {
                tags.push(...frontmatter.tags.map((tag) => String(tag)));
            } else {
                tags.push(String(frontmatter.tags));
            }
        }

        if (frontmatter.tag) {
            if (Array.isArray(frontmatter.tag)) {
                tags.push(...frontmatter.tag.map((tag) => String(tag)));
            } else {
                tags.push(String(frontmatter.tag));
            }
        }

        return tags;
    }

    private parseDate(dateValue: any): number | undefined {
        if (!dateValue) return undefined;

        if (typeof dateValue === "number") {
            return dateValue;
        }

        if (typeof dateValue === "string") {
            const parsed = Date.parse(dateValue);
            return isNaN(parsed) ? undefined : parsed;
        }

        if (dateValue instanceof Date) {
            return dateValue.getTime();
        }

        return undefined;
    }

    private parsePriority(priorityValue: any): number | undefined {
        if (typeof priorityValue === "number") {
            return Math.max(1, Math.min(5, Math.round(priorityValue)));
        }

        if (typeof priorityValue === "string") {
            const num = parseInt(priorityValue, 10);
            if (!isNaN(num)) {
                return Math.max(1, Math.min(5, num));
            }

            const lower = priorityValue.toLowerCase();
            if (lower.includes("highest") || lower.includes("urgent")) return 5;
            if (lower.includes("high")) return 4;
            if (lower.includes("medium") || lower.includes("normal")) return 3;
            if (lower.includes("low")) return 2;
            if (lower.includes("lowest")) return 1;
        }

        return undefined;
    }

    private generateCacheKey(context: ParseContext): string {
        return `metadata:${context.filePath}:${context.mtime || 0}`;
    }

    private isCacheValid(cached: MetadataParseResult, context: ParseContext): boolean {
        return cached.filePath === context.filePath && 
               cached.parseTime !== undefined;
    }

    private invalidateCache(filePath: string): void {
        this.cacheManager.invalidateByPath(filePath, CacheType.FILE_METADATA);
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

    public updateConfig(config: Partial<FileParsingConfiguration>): void {
        this.config = { ...this.config, ...config };
        this.cacheManager.invalidateByPattern('metadata:', CacheType.FILE_METADATA);
        
        this.eventManager.trigger(ParseEventType.PARSER_CONFIG_CHANGED, {
            parserType: this.name,
            changes: config,
            source: this.name
        });
    }

    public getConfig(): FileParsingConfiguration {
        return { ...this.config };
    }
}