/**
 * Unified Project Data Worker
 * 
 * Migrated from original ProjectData.worker.ts to the new unified parsing system.
 * Handles project data computation using the new ProjectParserPlugin architecture.
 */

import { WorkerMessage, ProjectDataMessage, ProjectDataResponse, WorkerResponse } from '../../utils/workers/TaskIndexWorkerMessage';
import { TgProject } from '../../types/task';

// Import unified parsing components
import { ProjectParserPlugin } from '../plugins/ProjectParserPlugin';
import { ParseContext } from '../core/ParseContext';
import { ParsePriority } from '../types/ParsingTypes';

// Project data computation interfaces
interface ProjectMapping {
    pathPattern: string;
    projectName: string;
    enabled: boolean;
}

interface MetadataMapping {
    sourceKey: string;
    targetKey: string;
    enabled: boolean;
}

interface ProjectNamingStrategy {
    strategy: "filename" | "foldername" | "metadata";
    metadataKey?: string;
    stripExtension?: boolean;
    enabled: boolean;
}

interface ProjectWorkerConfig {
    pathMappings: ProjectMapping[];
    metadataMappings: MetadataMapping[];
    defaultProjectNaming: ProjectNamingStrategy;
    metadataKey: string;
}

interface FileProjectData {
    filePath: string;
    fileMetadata: Record<string, any>;
    configData: Record<string, any>;
    directoryConfigPath?: string;
}

// Cache for parser instance
let projectParser: ProjectParserPlugin | null = null;
let workerConfig: ProjectWorkerConfig | null = null;

/**
 * Get or create project parser instance
 */
function getProjectParser(): ProjectParserPlugin {
    if (!projectParser) {
        projectParser = new ProjectParserPlugin();
    }
    return projectParser;
}

/**
 * Create mock parse context for worker environment
 */
function createWorkerProjectContext(
    filePath: string,
    content: string,
    fileMetadata?: Record<string, any>,
    configData?: Record<string, any>
): ParseContext {
    return {
        filePath,
        content,
        fileType: 'markdown',
        mtime: Date.now(),
        metadata: fileMetadata,
        projectConfig: {
            enableEnhancedProject: true,
            pathMappings: workerConfig?.pathMappings || [],
            metadataConfig: {
                enabled: true,
                metadataKey: workerConfig?.metadataKey || 'project'
            },
            configFile: {
                enabled: true,
                fileName: 'project.json'
            },
            ...configData
        },
        settings: {},
        cacheManager: null as any, // Not available in worker
        eventManager: null as any, // Not available in worker
        priority: ParsePriority.NORMAL
    };
}

/**
 * Compute project data using unified parser system
 */
async function computeProjectDataUnified(fileData: FileProjectData): Promise<TgProject | null> {
    try {
        const parser = getProjectParser();
        const context = createWorkerProjectContext(
            fileData.filePath,
            '', // Content not needed for project detection
            fileData.fileMetadata,
            fileData.configData
        );
        
        const result = await parser.parse(context);
        
        if (result.success && result.project) {
            return result.project;
        }
        
        return null;
        
    } catch (error) {
        console.error(`Error computing project data for ${fileData.filePath}:`, error);
        return null;
    }
}

/**
 * Apply metadata mappings (legacy compatibility)
 */
function applyMetadataMappings(
    originalMetadata: Record<string, any>,
    mappings: MetadataMapping[]
): Record<string, any> {
    const enhancedMetadata = { ...originalMetadata };
    
    for (const mapping of mappings) {
        if (mapping.enabled && originalMetadata[mapping.sourceKey] !== undefined) {
            enhancedMetadata[mapping.targetKey] = originalMetadata[mapping.sourceKey];
        }
    }
    
    return enhancedMetadata;
}

/**
 * Legacy path-based project detection
 */
function detectProjectFromPath(filePath: string, pathMappings: ProjectMapping[]): TgProject | null {
    for (const mapping of pathMappings) {
        if (!mapping.enabled) continue;
        
        // Simple pattern matching (in production, use proper glob matching)
        if (filePath.includes(mapping.pathPattern)) {
            return {
                type: 'path',
                name: mapping.projectName,
                source: mapping.pathPattern,
                readonly: true
            };
        }
    }
    return null;
}

/**
 * Legacy metadata-based project detection
 */
function detectProjectFromMetadata(
    fileMetadata: Record<string, any>,
    metadataKey: string
): TgProject | null {
    const projectName = fileMetadata[metadataKey];
    if (projectName && typeof projectName === 'string') {
        return {
            type: 'metadata',
            name: projectName,
            source: metadataKey,
            readonly: true
        };
    }
    return null;
}

/**
 * Legacy config-based project detection
 */
function detectProjectFromConfig(configData: Record<string, any>): TgProject | null {
    const projectName = configData.project;
    if (projectName && typeof projectName === 'string') {
        return {
            type: 'config',
            name: projectName,
            source: 'project.json',
            readonly: true
        };
    }
    return null;
}

/**
 * Fallback legacy project detection
 */
function computeProjectDataLegacy(fileData: FileProjectData): TgProject | null {
    if (!workerConfig) return null;
    
    // Try path-based detection first
    let project = detectProjectFromPath(fileData.filePath, workerConfig.pathMappings);
    if (project) return project;
    
    // Try metadata-based detection
    project = detectProjectFromMetadata(fileData.fileMetadata, workerConfig.metadataKey);
    if (project) return project;
    
    // Try config-based detection
    project = detectProjectFromConfig(fileData.configData);
    if (project) return project;
    
    // Try default naming strategy
    if (workerConfig.defaultProjectNaming.enabled) {
        const strategy = workerConfig.defaultProjectNaming;
        let projectName: string;
        
        switch (strategy.strategy) {
            case 'filename':
                projectName = fileData.filePath.split('/').pop() || '';
                if (strategy.stripExtension) {
                    projectName = projectName.replace(/\.[^/.]+$/, '');
                }
                break;
            case 'foldername':
                const parts = fileData.filePath.split('/');
                projectName = parts[parts.length - 2] || '';
                break;
            case 'metadata':
                projectName = fileData.fileMetadata[strategy.metadataKey || 'project'] || '';
                break;
            default:
                return null;
        }
        
        if (projectName) {
            return {
                type: 'default',
                name: projectName,
                source: strategy.strategy,
                readonly: true
            };
        }
    }
    
    return null;
}

/**
 * Main computation function
 */
async function computeProjectData(message: ProjectDataMessage): Promise<ProjectDataResponse> {
    const startTime = Date.now();
    const results: { [filePath: string]: TgProject | null } = {};
    const enhancedMetadata: { [filePath: string]: Record<string, any> } = {};
    const errors: string[] = [];
    
    try {
        for (const fileData of message.fileDataList) {
            try {
                // Apply metadata mappings first
                const enhanced = workerConfig ? 
                    applyMetadataMappings(fileData.fileMetadata, workerConfig.metadataMappings) :
                    fileData.fileMetadata;
                
                enhancedMetadata[fileData.filePath] = enhanced;
                
                // Try unified parser first
                let project = await computeProjectDataUnified(fileData);
                
                // Fallback to legacy detection if unified parser fails
                if (!project) {
                    project = computeProjectDataLegacy(fileData);
                }
                
                results[fileData.filePath] = project;
                
            } catch (error) {
                const errorMsg = `Error processing ${fileData.filePath}: ${error instanceof Error ? error.message : String(error)}`;
                errors.push(errorMsg);
                console.error(errorMsg);
                results[fileData.filePath] = null;
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
 * Update worker configuration
 */
function updateConfig(config: ProjectWorkerConfig): void {
    workerConfig = config;
    
    // Reset parser instance to pick up new configuration
    projectParser = null;
}

/**
 * Clear worker cache
 */
function clearCache(): void {
    projectParser = null;
    workerConfig = null;
}

/**
 * Get worker statistics
 */
function getWorkerStats(): any {
    return {
        type: 'project_stats',
        hasParser: projectParser !== null,
        hasConfig: workerConfig !== null,
        configMappings: workerConfig?.pathMappings.length || 0,
        timestamp: Date.now()
    };
}

// Worker message handler
self.onmessage = async function(event) {
    const message = event.data as WorkerMessage;
    
    try {
        switch (message.type) {
            case 'project_data_request':
                const result = await computeProjectData(message);
                self.postMessage(result);
                break;
                
            case 'update_config':
                updateConfig(message.config);
                self.postMessage({
                    type: 'config_updated',
                    timestamp: Date.now()
                });
                break;
                
            case 'clear_cache':
                clearCache();
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
export {};