/**
 * Unified Parsing Worker
 *
 * Consolidates all parsing operations (tasks, projects, metadata) into a single
 * high-performance worker. Uses the unified parser plugin system with batch processing
 * optimizations and intelligent resource management.
 */

import { 
    WorkerMessage, 
    TaskIndexMessage, 
    TaskIndexResponse,
    ProjectDataMessage, 
    ProjectDataResponse,
    WorkerResponse 
} from '../../utils/workers/TaskIndexWorkerMessage';
import { Task, TgProject } from '../../types/task';
import { SupportedFileType } from '../types/ParsingTypes';

// Import unified parsing system
import { MarkdownParserPlugin } from '../plugins/MarkdownParserPlugin';
import { CanvasParserPlugin } from '../plugins/CanvasParserPlugin';
import { MetadataParserPlugin } from '../plugins/MetadataParserPlugin';
import { ProjectParserPlugin } from '../plugins/ProjectParserPlugin';
import { ParseContext } from '../core/ParseContext';
import { ParsePriority, ParserPlugin } from '../types/ParsingTypes';

// Worker-specific interfaces
interface TaskWorkerSettings {
    enableDueDates: boolean;
    enablePriority: boolean;
    enableRecurrence: boolean;
    enableTags: boolean;
    dueDateFormat: string;
    prioritySymbols: { [priority: string]: string };
    recurrenceKeyword: string;
    tagPattern: string;
    projectMetadataKey: string;
}

interface ProjectWorkerConfig {
    pathMappings: Array<{
        pathPattern: string;
        projectName: string;
        enabled: boolean;
    }>;
    metadataMappings: Array<{
        sourceKey: string;
        targetKey: string;
        enabled: boolean;
    }>;
    defaultProjectNaming: {
        strategy: "filename" | "foldername" | "metadata";
        metadataKey?: string;
        stripExtension?: boolean;
        enabled: boolean;
    };
    metadataKey: string;
}

interface FileProjectData {
    filePath: string;
    fileMetadata: Record<string, any>;
    configData: Record<string, any>;
    directoryConfigPath?: string;
}

interface UnifiedParseRequest {
    type: 'unified_parse_request';
    requestId: string;
    operations: Array<{
        operationType: 'tasks' | 'projects' | 'metadata';
        filePath: string;
        content: string;
        fileType: SupportedFileType;
        fileMetadata?: Record<string, any>;
        configData?: Record<string, any>;
        settings?: any;
    }>;
    batchId?: string;
    priority?: ParsePriority;
}

interface UnifiedParseResponse {
    type: 'unified_parse_response';
    requestId: string;
    results: {
        tasks: { [filePath: string]: Task[] };
        projects: { [filePath: string]: TgProject | null };
        enhancedMetadata: { [filePath: string]: Record<string, any> };
    };
    processingTime: number;
    batchMetadata: {
        totalOperations: number;
        taskOperations: number;
        projectOperations: number;
        metadataOperations: number;
        successCount: number;
        errorCount: number;
        cacheHits: number;
        usedUnifiedParser: boolean;
    };
    errors?: string[];
}

// Parser instance cache
const parserCache = new Map<string, ParserPlugin>();
let taskWorkerSettings: TaskWorkerSettings | null = null;
let projectWorkerConfig: ProjectWorkerConfig | null = null;

// Performance tracking
let operationCount = 0;
let totalProcessingTime = 0;
let cacheHits = 0;

/**
 * Get parser instance for file type
 */
function getParser(fileType: SupportedFileType): ParserPlugin {
    let parser = parserCache.get(fileType);
    
    if (!parser) {
        switch (fileType) {
            case 'markdown':
                parser = new MarkdownParserPlugin();
                break;
            case 'canvas':
                parser = new CanvasParserPlugin();
                break;
            default:
                parser = new MarkdownParserPlugin(); // Fallback
        }
        parserCache.set(fileType, parser);
    }
    
    return parser;
}

/**
 * Get project parser instance
 */
function getProjectParser(): ProjectParserPlugin {
    let parser = parserCache.get('project') as ProjectParserPlugin;
    
    if (!parser) {
        parser = new ProjectParserPlugin();
        parserCache.set('project', parser);
    }
    
    return parser;
}

/**
 * Get metadata parser instance
 */
function getMetadataParser(): MetadataParserPlugin {
    let parser = parserCache.get('metadata') as MetadataParserPlugin;
    
    if (!parser) {
        parser = new MetadataParserPlugin();
        parserCache.set('metadata', parser);
    }
    
    return parser;
}

/**
 * Create worker-optimized parse context
 */
function createWorkerParseContext(
    filePath: string,
    content: string,
    fileType: SupportedFileType,
    settings: any,
    fileMetadata?: Record<string, any>,
    configData?: Record<string, any>,
    priority: ParsePriority = ParsePriority.NORMAL
): ParseContext {
    return {
        filePath,
        content,
        fileType,
        mtime: Date.now(),
        metadata: fileMetadata,
        projectConfig: {
            enableEnhancedProject: true,
            pathMappings: projectWorkerConfig?.pathMappings || [],
            metadataConfig: {
                enabled: true,
                metadataKey: projectWorkerConfig?.metadataKey || 'project'
            },
            configFile: {
                enabled: true,
                fileName: 'project.json'
            },
            ...configData
        },
        settings: settings || {},
        cacheManager: null as any, // Not available in worker
        eventManager: null as any, // Not available in worker
        priority
    };
}

/**
 * Parse tasks using unified parser
 */
async function parseTasksUnified(
    filePath: string,
    content: string,
    fileType: SupportedFileType,
    settings: TaskWorkerSettings,
    fileMetadata?: Record<string, any>
): Promise<Task[]> {
    try {
        const parser = getParser(fileType);
        const context = createWorkerParseContext(filePath, content, fileType, settings, fileMetadata);
        
        const result = await parser.parse(context);
        
        if (result.success && result.tasks) {
            // Apply enhanced project data if available
            const enhancedTasks = await applyEnhancedProjectData(result.tasks, filePath, fileMetadata);
            return enhancedTasks;
        }
        
        return [];
    } catch (error) {
        console.error(`Error parsing tasks for ${filePath}:`, error);
        return [];
    }
}

/**
 * Parse project data using unified parser
 */
async function parseProjectUnified(
    filePath: string,
    fileMetadata: Record<string, any>,
    configData: Record<string, any>
): Promise<TgProject | null> {
    try {
        const parser = getProjectParser();
        const context = createWorkerParseContext(filePath, '', 'markdown', {}, fileMetadata, configData);
        
        const result = await parser.parse(context);
        
        if (result.success && result.project) {
            return result.project;
        }
        
        return null;
    } catch (error) {
        console.error(`Error parsing project for ${filePath}:`, error);
        return null;
    }
}

/**
 * Parse enhanced metadata using unified parser
 */
async function parseMetadataUnified(
    filePath: string,
    fileMetadata: Record<string, any>,
    configData: Record<string, any>
): Promise<Record<string, any>> {
    try {
        const parser = getMetadataParser();
        const context = createWorkerParseContext(filePath, '', 'markdown', {}, fileMetadata, configData);
        
        const result = await parser.parse(context);
        
        if (result.success && result.metadata) {
            return result.metadata;
        }
        
        return { ...fileMetadata, ...configData };
    } catch (error) {
        console.error(`Error parsing metadata for ${filePath}:`, error);
        return { ...fileMetadata, ...configData };
    }
}

/**
 * Apply enhanced project data to tasks
 */
async function applyEnhancedProjectData(
    tasks: Task[],
    filePath: string,
    fileMetadata?: Record<string, any>
): Promise<Task[]> {
    if (!projectWorkerConfig || !fileMetadata) {
        return tasks;
    }
    
    try {
        const project = await parseProjectUnified(filePath, fileMetadata, {});
        const enhancedMetadata = await parseMetadataUnified(filePath, fileMetadata, {});
        
        return tasks.map(task => ({
            ...task,
            tgProject: project || task.tgProject,
            enhancedMetadata: {
                ...task.enhancedMetadata,
                ...enhancedMetadata
            }
        }));
    } catch (error) {
        console.error(`Error applying enhanced project data for ${filePath}:`, error);
        return tasks;
    }
}

/**
 * Legacy fallback for task parsing
 */
function parseTasksLegacy(
    filePath: string,
    content: string,
    settings: TaskWorkerSettings
): Task[] {
    // Simple regex-based parsing for backward compatibility
    const lines = content.split('\n');
    const tasks: Task[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Look for basic task patterns: - [ ] or - [x]
        const taskMatch = trimmed.match(/^[\s]*[-*+]\s*\[([ xX])\]\s*(.+)$/);
        if (taskMatch) {
            const isCompleted = taskMatch[1].toLowerCase() === 'x';
            const text = taskMatch[2];
            
            tasks.push({
                id: `${filePath}:${i}`,
                text,
                completed: isCompleted,
                filePath,
                lineNumber: i + 1,
                originalText: line,
                tags: [],
                priority: 3, // Default medium priority
                metadata: {},
                enhancedMetadata: {}
            });
        }
    }
    
    return tasks;
}

/**
 * Legacy fallback for project detection
 */
function detectProjectLegacy(
    filePath: string,
    fileMetadata: Record<string, any>
): TgProject | null {
    if (!projectWorkerConfig) return null;
    
    // Try path-based detection
    for (const mapping of projectWorkerConfig.pathMappings) {
        if (mapping.enabled && filePath.includes(mapping.pathPattern)) {
            return {
                type: 'path',
                name: mapping.projectName,
                source: mapping.pathPattern,
                readonly: true
            };
        }
    }
    
    // Try metadata-based detection
    const projectName = fileMetadata[projectWorkerConfig.metadataKey];
    if (projectName && typeof projectName === 'string') {
        return {
            type: 'metadata',
            name: projectName,
            source: projectWorkerConfig.metadataKey,
            readonly: true
        };
    }
    
    return null;
}

/**
 * Process unified parse request
 */
async function processUnifiedRequest(message: UnifiedParseRequest): Promise<UnifiedParseResponse> {
    const startTime = Date.now();
    const results = {
        tasks: {} as { [filePath: string]: Task[] },
        projects: {} as { [filePath: string]: TgProject | null },
        enhancedMetadata: {} as { [filePath: string]: Record<string, any> }
    };
    const errors: string[] = [];
    
    let taskOps = 0, projectOps = 0, metadataOps = 0, successCount = 0, errorCount = 0;
    
    try {
        // Group operations by file for efficiency
        const fileOperations = new Map<string, typeof message.operations[0][]>();
        
        for (const operation of message.operations) {
            const ops = fileOperations.get(operation.filePath) || [];
            ops.push(operation);
            fileOperations.set(operation.filePath, ops);
        }
        
        // Process each file's operations
        for (const [filePath, operations] of fileOperations) {
            try {
                for (const operation of operations) {
                    switch (operation.operationType) {
                        case 'tasks':
                            taskOps++;
                            try {
                                const tasks = await parseTasksUnified(
                                    operation.filePath,
                                    operation.content,
                                    operation.fileType,
                                    operation.settings || taskWorkerSettings!,
                                    operation.fileMetadata
                                );
                                results.tasks[operation.filePath] = tasks;
                                successCount++;
                            } catch (error) {
                                // Fallback to legacy parsing
                                const legacyTasks = parseTasksLegacy(
                                    operation.filePath,
                                    operation.content,
                                    operation.settings || taskWorkerSettings!
                                );
                                results.tasks[operation.filePath] = legacyTasks;
                                successCount++;
                            }
                            break;
                            
                        case 'projects':
                            projectOps++;
                            try {
                                const project = await parseProjectUnified(
                                    operation.filePath,
                                    operation.fileMetadata || {},
                                    operation.configData || {}
                                );
                                results.projects[operation.filePath] = project;
                                successCount++;
                            } catch (error) {
                                // Fallback to legacy detection
                                const legacyProject = detectProjectLegacy(
                                    operation.filePath,
                                    operation.fileMetadata || {}
                                );
                                results.projects[operation.filePath] = legacyProject;
                                successCount++;
                            }
                            break;
                            
                        case 'metadata':
                            metadataOps++;
                            try {
                                const metadata = await parseMetadataUnified(
                                    operation.filePath,
                                    operation.fileMetadata || {},
                                    operation.configData || {}
                                );
                                results.enhancedMetadata[operation.filePath] = metadata;
                                successCount++;
                            } catch (error) {
                                // Fallback to simple merge
                                results.enhancedMetadata[operation.filePath] = {
                                    ...operation.fileMetadata,
                                    ...operation.configData
                                };
                                successCount++;
                            }
                            break;
                    }
                }
            } catch (error) {
                const errorMsg = `Error processing operations for ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
                errors.push(errorMsg);
                errorCount++;
            }
        }
        
        operationCount += message.operations.length;
        const processingTime = Date.now() - startTime;
        totalProcessingTime += processingTime;
        
        return {
            type: 'unified_parse_response',
            requestId: message.requestId,
            results,
            processingTime,
            batchMetadata: {
                totalOperations: message.operations.length,
                taskOperations: taskOps,
                projectOperations: projectOps,
                metadataOperations: metadataOps,
                successCount,
                errorCount,
                cacheHits,
                usedUnifiedParser: true
            },
            errors: errors.length > 0 ? errors : undefined
        };
        
    } catch (error) {
        return {
            type: 'unified_parse_response',
            requestId: message.requestId,
            results: { tasks: {}, projects: {}, enhancedMetadata: {} },
            processingTime: Date.now() - startTime,
            batchMetadata: {
                totalOperations: message.operations.length,
                taskOperations: taskOps,
                projectOperations: projectOps,
                metadataOperations: metadataOps,
                successCount: 0,
                errorCount: 1,
                cacheHits: 0,
                usedUnifiedParser: false
            },
            errors: [error instanceof Error ? error.message : String(error)]
        };
    }
}

/**
 * Legacy task index processing (for backward compatibility)
 */
async function processTaskIndexRequest(message: TaskIndexMessage): Promise<TaskIndexResponse> {
    const startTime = Date.now();
    const results: { [filePath: string]: Task[] } = {};
    const errors: string[] = [];
    
    try {
        for (const fileData of message.fileContents) {
            try {
                const tasks = await parseTasksUnified(
                    fileData.filePath,
                    fileData.content,
                    fileData.fileType || 'markdown',
                    message.settings,
                    fileData.fileMetadata
                );
                results[fileData.filePath] = tasks;
            } catch (error) {
                // Fallback to legacy parsing
                const legacyTasks = parseTasksLegacy(
                    fileData.filePath,
                    fileData.content,
                    message.settings
                );
                results[fileData.filePath] = legacyTasks;
            }
        }
        
        return {
            type: 'task_index_response',
            requestId: message.requestId,
            results,
            processingTime: Date.now() - startTime,
            errors: errors.length > 0 ? errors : undefined,
            metadata: {
                fileCount: message.fileContents.length,
                totalTasks: Object.values(results).flat().length,
                usedUnifiedParser: true
            }
        };
        
    } catch (error) {
        return {
            type: 'task_index_response',
            requestId: message.requestId,
            results: {},
            processingTime: Date.now() - startTime,
            errors: [error instanceof Error ? error.message : String(error)],
            metadata: {
                fileCount: message.fileContents.length,
                totalTasks: 0,
                usedUnifiedParser: false
            }
        };
    }
}

/**
 * Legacy project data processing (for backward compatibility)
 */
async function processProjectDataRequest(message: ProjectDataMessage): Promise<ProjectDataResponse> {
    const startTime = Date.now();
    const results: { [filePath: string]: TgProject | null } = {};
    const enhancedMetadata: { [filePath: string]: Record<string, any> } = {};
    const errors: string[] = [];
    
    try {
        for (const fileData of message.fileDataList) {
            try {
                const project = await parseProjectUnified(
                    fileData.filePath,
                    fileData.fileMetadata,
                    fileData.configData
                );
                results[fileData.filePath] = project;
                
                const metadata = await parseMetadataUnified(
                    fileData.filePath,
                    fileData.fileMetadata,
                    fileData.configData
                );
                enhancedMetadata[fileData.filePath] = metadata;
                
            } catch (error) {
                // Fallback to legacy detection
                const legacyProject = detectProjectLegacy(
                    fileData.filePath,
                    fileData.fileMetadata
                );
                results[fileData.filePath] = legacyProject;
                enhancedMetadata[fileData.filePath] = {
                    ...fileData.fileMetadata,
                    ...fileData.configData
                };
            }
        }
        
        return {
            type: 'project_data_response',
            requestId: message.requestId,
            results,
            enhancedMetadata,
            processingTime: Date.now() - startTime,
            errors: errors.length > 0 ? errors : undefined,
            metadata: {
                fileCount: message.fileDataList.length,
                successCount: Object.values(results).filter(r => r !== null).length,
                errorCount: errors.length,
                usedUnifiedParser: true
            }
        };
        
    } catch (error) {
        return {
            type: 'project_data_response',
            requestId: message.requestId,
            results: {},
            enhancedMetadata: {},
            processingTime: Date.now() - startTime,
            errors: [error instanceof Error ? error.message : String(error)],
            metadata: {
                fileCount: message.fileDataList.length,
                successCount: 0,
                errorCount: 1,
                usedUnifiedParser: false
            }
        };
    }
}

/**
 * Update configurations
 */
function updateConfigurations(configs: {
    taskSettings?: TaskWorkerSettings;
    projectConfig?: ProjectWorkerConfig;
}): void {
    if (configs.taskSettings) {
        taskWorkerSettings = configs.taskSettings;
    }
    
    if (configs.projectConfig) {
        projectWorkerConfig = configs.projectConfig;
    }
    
    // Clear parser cache to pick up new configurations
    parserCache.clear();
}

/**
 * Clear all caches
 */
function clearAllCaches(): void {
    parserCache.clear();
    taskWorkerSettings = null;
    projectWorkerConfig = null;
    operationCount = 0;
    totalProcessingTime = 0;
    cacheHits = 0;
}

/**
 * Get worker performance statistics
 */
function getWorkerStats(): any {
    return {
        type: 'worker_stats',
        performance: {
            operationCount,
            totalProcessingTime,
            averageProcessingTime: operationCount > 0 ? totalProcessingTime / operationCount : 0,
            cacheHits,
            cacheHitRatio: operationCount > 0 ? cacheHits / operationCount : 0
        },
        cache: {
            parserCount: parserCache.size,
            hasTaskSettings: taskWorkerSettings !== null,
            hasProjectConfig: projectWorkerConfig !== null
        },
        timestamp: Date.now()
    };
}

// Worker message handler
self.onmessage = async function(event) {
    const message = event.data as WorkerMessage | UnifiedParseRequest;
    
    try {
        switch (message.type) {
            case 'unified_parse_request':
                const unifiedResult = await processUnifiedRequest(message);
                self.postMessage(unifiedResult);
                break;
                
            case 'task_index_request':
                const taskResult = await processTaskIndexRequest(message as TaskIndexMessage);
                self.postMessage(taskResult);
                break;
                
            case 'project_data_request':
                const projectResult = await processProjectDataRequest(message as ProjectDataMessage);
                self.postMessage(projectResult);
                break;
                
            case 'update_config':
                updateConfigurations((message as any).configs);
                self.postMessage({
                    type: 'config_updated',
                    timestamp: Date.now()
                });
                break;
                
            case 'clear_cache':
                clearAllCaches();
                self.postMessage({
                    type: 'cache_cleared',
                    timestamp: Date.now()
                });
                break;
                
            case 'get_stats':
                const stats = getWorkerStats();
                self.postMessage(stats);
                break;
                
            default:
                self.postMessage({
                    type: 'error',
                    error: `Unknown message type: ${(message as any).type}`,
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

// Export for type checking
export type { UnifiedParseRequest, UnifiedParseResponse };
export {};