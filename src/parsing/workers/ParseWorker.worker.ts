import { 
    WorkerMessage, 
    WorkerResponse, 
    SerializableParseContext,
    ParseResult,
    WorkerHealthStatus,
    WorkerStats 
} from '../types/WorkerTypes';
import { ParserPluginType, ParsePriority } from '../types/ParsingTypes';

interface WorkerState {
    isIdle: boolean;
    currentTaskId: string | null;
    startTime: number | null;
    tasksProcessed: number;
    errorsEncountered: number;
    averageTaskDuration: number;
    lastHealthCheck: number;
}

class ParseWorkerImpl {
    private state: WorkerState = {
        isIdle: true,
        currentTaskId: null,
        startTime: null,
        tasksProcessed: 0,
        errorsEncountered: 0,
        averageTaskDuration: 0,
        lastHealthCheck: Date.now()
    };
    
    private taskDurations: number[] = [];
    private readonly maxDurationHistory = 50;
    
    async handleMessage(message: WorkerMessage): Promise<WorkerResponse> {
        const startTime = Date.now();
        
        try {
            switch (message.type) {
                case 'PARSE_TASK':
                    return await this.handleParseTask(message);
                    
                case 'HEALTH_CHECK':
                    return await this.handleHealthCheck();
                    
                case 'GET_STATS':
                    return await this.handleGetStats();
                    
                case 'CLEAR_CACHE':
                    return await this.handleClearCache();
                    
                default:
                    throw new Error(`Unknown message type: ${(message as any).type}`);
            }
        } catch (error) {
            this.state.errorsEncountered++;
            return {
                type: 'ERROR',
                taskId: message.taskId,
                error: error instanceof Error ? error.message : String(error),
                timestamp: Date.now()
            };
        } finally {
            const duration = Date.now() - startTime;
            this.updateTaskDuration(duration);
        }
    }
    
    private async handleParseTask(message: WorkerMessage & { type: 'PARSE_TASK' }): Promise<WorkerResponse> {
        const { taskId, context, parserType, priority } = message;
        
        this.state.isIdle = false;
        this.state.currentTaskId = taskId;
        this.state.startTime = Date.now();
        
        try {
            const result = await this.parseWithPlugin(parserType, context, priority);
            
            this.state.tasksProcessed++;
            
            return {
                type: 'PARSE_SUCCESS',
                taskId,
                result,
                duration: Date.now() - this.state.startTime!,
                timestamp: Date.now()
            };
        } finally {
            this.state.isIdle = true;
            this.state.currentTaskId = null;
            this.state.startTime = null;
        }
    }
    
    private async parseWithPlugin(
        parserType: ParserPluginType, 
        context: SerializableParseContext,
        priority: ParsePriority
    ): Promise<ParseResult> {
        switch (parserType) {
            case ParserPluginType.MARKDOWN:
                return await this.parseMarkdown(context);
                
            case ParserPluginType.CANVAS:
                return await this.parseCanvas(context);
                
            case ParserPluginType.METADATA:
                return await this.parseMetadata(context);
                
            case ParserPluginType.ICS:
                return await this.parseIcs(context);
                
            case ParserPluginType.PROJECT:
                return await this.parseProject(context);
                
            default:
                throw new Error(`Unsupported parser type: ${parserType}`);
        }
    }
    
    private async parseMarkdown(context: SerializableParseContext): Promise<ParseResult> {
        return {
            success: true,
            data: {
                type: 'markdown',
                content: `Parsed markdown: ${context.filePath}`,
                tasks: [],
                metadata: {}
            },
            duration: 50,
            timestamp: Date.now(),
            cacheKey: `md-${context.filePath}-${context.mtime}`
        };
    }
    
    private async parseCanvas(context: SerializableParseContext): Promise<ParseResult> {
        return {
            success: true,
            data: {
                type: 'canvas',
                content: `Parsed canvas: ${context.filePath}`,
                nodes: [],
                edges: []
            },
            duration: 75,
            timestamp: Date.now(),
            cacheKey: `canvas-${context.filePath}-${context.mtime}`
        };
    }
    
    private async parseMetadata(context: SerializableParseContext): Promise<ParseResult> {
        return {
            success: true,
            data: {
                type: 'metadata',
                frontmatter: {},
                properties: {},
                links: []
            },
            duration: 30,
            timestamp: Date.now(),
            cacheKey: `meta-${context.filePath}-${context.mtime}`
        };
    }
    
    private async parseIcs(context: SerializableParseContext): Promise<ParseResult> {
        return {
            success: true,
            data: {
                type: 'ics',
                events: [],
                timezone: 'UTC'
            },
            duration: 100,
            timestamp: Date.now(),
            cacheKey: `ics-${context.filePath}-${context.mtime}`
        };
    }
    
    private async parseProject(context: SerializableParseContext): Promise<ParseResult> {
        return {
            success: true,
            data: {
                type: 'project',
                projectId: `project-${Date.now()}`,
                name: context.filePath,
                tasks: [],
                metadata: {}
            },
            duration: 120,
            timestamp: Date.now(),
            cacheKey: `project-${context.filePath}-${context.mtime}`
        };
    }
    
    private async handleHealthCheck(): Promise<WorkerResponse> {
        const now = Date.now();
        this.state.lastHealthCheck = now;
        
        const status: WorkerHealthStatus = {
            isHealthy: true,
            isIdle: this.state.isIdle,
            currentTaskId: this.state.currentTaskId,
            tasksProcessed: this.state.tasksProcessed,
            errorsEncountered: this.state.errorsEncountered,
            lastHealthCheck: this.state.lastHealthCheck,
            memoryUsage: this.getMemoryUsage()
        };
        
        return {
            type: 'HEALTH_RESPONSE',
            taskId: 'health-check',
            health: status,
            timestamp: now
        };
    }
    
    private async handleGetStats(): Promise<WorkerResponse> {
        const stats: WorkerStats = {
            tasksProcessed: this.state.tasksProcessed,
            errorsEncountered: this.state.errorsEncountered,
            averageTaskDuration: this.state.averageTaskDuration,
            currentLoad: this.state.isIdle ? 0 : 1,
            uptimeMs: Date.now() - (this.state.startTime || Date.now()),
            memoryUsage: this.getMemoryUsage()
        };
        
        return {
            type: 'STATS_RESPONSE',
            taskId: 'get-stats',
            stats,
            timestamp: Date.now()
        };
    }
    
    private async handleClearCache(): Promise<WorkerResponse> {
        this.taskDurations = [];
        this.state.averageTaskDuration = 0;
        
        return {
            type: 'CACHE_CLEARED',
            taskId: 'clear-cache',
            timestamp: Date.now()
        };
    }
    
    private updateTaskDuration(duration: number): void {
        this.taskDurations.push(duration);
        
        if (this.taskDurations.length > this.maxDurationHistory) {
            this.taskDurations.shift();
        }
        
        this.state.averageTaskDuration = this.taskDurations.reduce((a, b) => a + b, 0) / this.taskDurations.length;
    }
    
    private getMemoryUsage(): number {
        if (typeof performance !== 'undefined' && performance.memory) {
            return performance.memory.usedJSHeapSize;
        }
        return 0;
    }
}

const workerImpl = new ParseWorkerImpl();

self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
    try {
        const response = await workerImpl.handleMessage(event.data);
        self.postMessage(response);
    } catch (error) {
        const errorResponse: WorkerResponse = {
            type: 'ERROR',
            taskId: event.data.taskId,
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now()
        };
        self.postMessage(errorResponse);
    }
});

export {};