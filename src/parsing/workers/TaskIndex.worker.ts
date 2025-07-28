/**
 * Unified Task Index Worker
 * 
 * Migrated from original TaskIndex.worker.ts to the new unified parsing system
 * while maintaining backward compatibility with existing message interfaces.
 */

import { Task, TgProject } from "../../types/task";
import {
    IndexerCommand,
    TaskParseResult,
    ErrorResult,
    BatchIndexResult,
    TaskWorkerSettings,
} from "../../utils/workers/TaskIndexWorkerMessage";
import { SupportedFileType } from "../../utils/fileTypeUtils";

// Import new parsing system components
import { MarkdownParserPlugin } from "../plugins/MarkdownParserPlugin";
import { CanvasParserPlugin } from "../plugins/CanvasParserPlugin";
import { MetadataParserPlugin } from "../plugins/MetadataParserPlugin";
import { ParseContext } from "../core/ParseContext";
import { ParsePriority, CacheType } from "../types/ParsingTypes";

// Cache for parser instances (avoid recreation)
const parserCache = new Map<string, any>();

/**
 * Get or create parser instance for file type
 */
function getParser(fileType: SupportedFileType, settings: TaskWorkerSettings) {
    const cacheKey = `${fileType}-${JSON.stringify(settings)}`;
    
    if (parserCache.has(cacheKey)) {
        return parserCache.get(cacheKey);
    }
    
    let parser: any;
    
    switch (fileType) {
        case 'markdown':
            parser = new MarkdownParserPlugin();
            break;
        case 'canvas':
            const markdownParser = new MarkdownParserPlugin();
            parser = new CanvasParserPlugin(markdownParser);
            break;
        default:
            // Fallback to metadata parser for other file types
            parser = new MetadataParserPlugin();
            break;
    }
    
    parserCache.set(cacheKey, parser);
    return parser;
}

/**
 * Create a mock parse context for worker environment
 */
function createWorkerParseContext(
    filePath: string,
    content: string,
    fileType: SupportedFileType,
    settings: TaskWorkerSettings,
    fileMetadata?: Record<string, any>
): ParseContext {
    // Extract file stats from path (simplified for worker)
    const mtime = Date.now(); // In real implementation, this would come from file stats
    
    return {
        filePath,
        content,
        fileType,
        mtime,
        metadata: fileMetadata,
        projectConfig: settings.projectConfig,
        settings: {
            markdown: {
                preferMetadataFormat: settings.preferMetadataFormat || 'tasks',
                parseHeadings: true,
                parseHierarchy: true
            }
        },
        cacheManager: null as any, // Not available in worker
        eventManager: null as any, // Not available in worker
        priority: ParsePriority.NORMAL
    };
}

/**
 * Enhanced task parsing using new unified parser system
 */
async function parseTasksWithUnifiedParser(
    filePath: string,
    content: string,
    fileType: SupportedFileType,
    settings: TaskWorkerSettings,
    fileMetadata?: Record<string, any>
): Promise<Task[]> {
    try {
        const parser = getParser(fileType, settings);
        const context = createWorkerParseContext(filePath, content, fileType, settings, fileMetadata);
        
        // Parse using the unified parser
        const result = await parser.parse(context);
        
        if (!result.success || !result.tasks) {
            console.warn(`Parsing failed for ${filePath}:`, result.metadata?.error);
            return [];
        }
        
        // Apply enhanced project data if available
        const enhancedTasks = result.tasks.map(task => 
            applyEnhancedProjectData(task, filePath, settings)
        );
        
        return enhancedTasks;
        
    } catch (error) {
        console.error(`Error parsing tasks in ${filePath}:`, error);
        return [];
    }
}

/**
 * Apply enhanced project data to tasks (maintains backward compatibility)
 */
function applyEnhancedProjectData(
    task: Task,
    filePath: string,
    settings: TaskWorkerSettings
): Task {
    if (!settings.enhancedProjectData || !settings.projectConfig?.enableEnhancedProject) {
        return task;
    }
    
    // Apply pre-computed project information
    const projectInfo = settings.enhancedProjectData.fileProjectMap[filePath];
    if (projectInfo) {
        let actualType: "metadata" | "path" | "config" | "default";
        
        if (["metadata", "path", "config", "default"].includes(projectInfo.source)) {
            actualType = projectInfo.source as "metadata" | "path" | "config" | "default";
        } else if (projectInfo.source?.includes("/")) {
            actualType = "path";
        } else if (projectInfo.source?.includes(".")) {
            actualType = "config";
        } else {
            actualType = "metadata";
        }
        
        const tgProject: TgProject = {
            type: actualType,
            name: projectInfo.name,
            source: projectInfo.source,
            readonly: true,
        };
        
        task.metadata.tgProject = tgProject;
    }
    
    return task;
}

/**
 * Legacy fallback parser for compatibility
 */
function parseLegacyTasks(
    filePath: string,
    content: string,
    settings: TaskWorkerSettings,
    fileMetadata?: Record<string, any>
): Task[] {
    try {
        // Import legacy parsers dynamically
        const { MarkdownTaskParser } = require("../workers/ConfigurableTaskParser");
        const { getConfig } = require("../../common/task-parser-config");
        
        const mockPlugin = { settings };
        const config = getConfig(settings.preferMetadataFormat, mockPlugin);
        
        if (settings.projectConfig && settings.projectConfig.enableEnhancedProject) {
            config.projectConfig = settings.projectConfig;
        }
        
        const parser = new MarkdownTaskParser(config);
        return parser.parseLegacy(filePath, content, fileMetadata);
        
    } catch (error) {
        console.error("Legacy parser fallback failed:", error);
        return [];
    }
}

/**
 * Extract daily note date from filename
 */
function extractDailyNoteDate(filePath: string, settings: TaskWorkerSettings): number | undefined {
    if (!settings.dailyNoteConfig?.enabled) {
        return undefined;
    }
    
    const fileName = filePath.split('/').pop()?.replace('.md', '') || '';
    const format = settings.dailyNoteConfig.format || 'YYYY-MM-DD';
    
    try {
        const { parse } = require("date-fns/parse");
        const date = parse(fileName, format, new Date());
        return date.getTime();
    } catch (error) {
        return undefined;
    }
}

/**
 * Process single file task indexing
 */
async function processFile(
    filePath: string,
    content: string,
    settings: TaskWorkerSettings,
    fileMetadata?: Record<string, any>,
    fileStats?: { mtime: number; }
): Promise<TaskParseResult | ErrorResult> {
    try {
        // Determine file type
        const fileType: SupportedFileType = filePath.endsWith('.canvas') ? 'canvas' : 'markdown';
        
        // Use unified parser system
        let tasks = await parseTasksWithUnifiedParser(
            filePath,
            content,
            fileType,
            settings,
            fileMetadata
        );
        
        // Fallback to legacy parser if unified parser fails
        if (tasks.length === 0 && content.includes('- [')) {
            tasks = parseLegacyTasks(filePath, content, settings, fileMetadata);
        }
        
        // Apply daily note date extraction
        const dailyNoteDate = extractDailyNoteDate(filePath, settings);
        if (dailyNoteDate) {
            tasks = tasks.map(task => ({
                ...task,
                metadata: {
                    ...task.metadata,
                    dailyNoteDate
                }
            }));
        }
        
        // Filter by heading if specified
        if (settings.headingFilter) {
            tasks = tasks.filter(task => {
                const headings = task.metadata.heading || [];
                return headings.some(heading => 
                    heading.toLowerCase().includes(settings.headingFilter!.toLowerCase())
                );
            });
        }
        
        return {
            type: 'success',
            filePath,
            tasks,
            metadata: {
                fileType,
                taskCount: tasks.length,
                processingTime: Date.now(),
                usedUnifiedParser: true
            }
        };
        
    } catch (error) {
        return {
            type: 'error',
            filePath,
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now()
        };
    }
}

/**
 * Process batch of files
 */
async function processBatch(
    files: Array<{
        path: string;
        content: string;
        metadata?: Record<string, any>;
        stats?: { mtime: number; };
    }>,
    settings: TaskWorkerSettings
): Promise<BatchIndexResult> {
    const results: TaskParseResult[] = [];
    const errors: ErrorResult[] = [];
    const startTime = Date.now();
    
    for (const file of files) {
        const result = await processFile(
            file.path,
            file.content,
            settings,
            file.metadata,
            file.stats
        );
        
        if (result.type === 'success') {
            results.push(result);
        } else {
            errors.push(result);
        }
    }
    
    return {
        type: 'batch_complete',
        results,
        errors,
        totalFiles: files.length,
        processingTime: Date.now() - startTime,
        metadata: {
            successCount: results.length,
            errorCount: errors.length,
            totalTasks: results.reduce((sum, r) => sum + r.tasks.length, 0),
            usedUnifiedParser: true
        }
    };
}

// Worker message handler
self.onmessage = async function(event) {
    const { command, data } = event.data as IndexerCommand;
    
    try {
        switch (command) {
            case 'parseFile':
                const result = await processFile(
                    data.filePath,
                    data.content,
                    data.settings,
                    data.fileMetadata,
                    data.fileStats
                );
                self.postMessage(result);
                break;
                
            case 'parseBatch':
                const batchResult = await processBatch(data.files, data.settings);
                self.postMessage(batchResult);
                break;
                
            case 'clearCache':
                parserCache.clear();
                self.postMessage({ 
                    type: 'cache_cleared', 
                    timestamp: Date.now() 
                });
                break;
                
            case 'getStats':
                self.postMessage({
                    type: 'stats',
                    cacheSize: parserCache.size,
                    timestamp: Date.now()
                });
                break;
                
            default:
                self.postMessage({
                    type: 'error',
                    error: `Unknown command: ${command}`,
                    timestamp: Date.now()
                });
        }
    } catch (error) {
        self.postMessage({
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now()
        });
    }
};

// Export for type checking (not used in worker context)
export {};