import { ParserPluginType, ParsePriority, ParseResult } from './ParsingTypes';

export interface SerializableParseContext {
    readonly filePath: string;
    readonly mtime: number;
    readonly size: number;
    readonly priority: ParsePriority;
    readonly options: Record<string, any>;
    readonly appVersion: string;
    readonly pluginVersion: string;
}

export type WorkerMessageType = 
    | 'PARSE_TASK'
    | 'HEALTH_CHECK'
    | 'GET_STATS'
    | 'CLEAR_CACHE';

export type WorkerResponseType = 
    | 'PARSE_SUCCESS'
    | 'PARSE_ERROR'
    | 'HEALTH_RESPONSE'
    | 'STATS_RESPONSE'
    | 'CACHE_CLEARED'
    | 'ERROR';

export interface BaseWorkerMessage {
    readonly type: WorkerMessageType;
    readonly taskId: string;
    readonly timestamp: number;
}

export interface ParseTaskMessage extends BaseWorkerMessage {
    readonly type: 'PARSE_TASK';
    readonly context: SerializableParseContext;
    readonly parserType: ParserPluginType;
    readonly priority: ParsePriority;
}

export interface HealthCheckMessage extends BaseWorkerMessage {
    readonly type: 'HEALTH_CHECK';
}

export interface GetStatsMessage extends BaseWorkerMessage {
    readonly type: 'GET_STATS';
}

export interface ClearCacheMessage extends BaseWorkerMessage {
    readonly type: 'CLEAR_CACHE';
}

export type WorkerMessage = 
    | ParseTaskMessage
    | HealthCheckMessage
    | GetStatsMessage
    | ClearCacheMessage;

export interface BaseWorkerResponse {
    readonly type: WorkerResponseType;
    readonly taskId: string;
    readonly timestamp: number;
}

export interface ParseSuccessResponse extends BaseWorkerResponse {
    readonly type: 'PARSE_SUCCESS';
    readonly result: ParseResult;
    readonly duration: number;
}

export interface ParseErrorResponse extends BaseWorkerResponse {
    readonly type: 'PARSE_ERROR';
    readonly error: string;
    readonly isRetryable: boolean;
}

export interface WorkerHealthStatus {
    readonly isHealthy: boolean;
    readonly isIdle: boolean;
    readonly currentTaskId: string | null;
    readonly tasksProcessed: number;
    readonly errorsEncountered: number;
    readonly lastHealthCheck: number;
    readonly memoryUsage: number;
}

export interface HealthResponse extends BaseWorkerResponse {
    readonly type: 'HEALTH_RESPONSE';
    readonly health: WorkerHealthStatus;
}

export interface WorkerStats {
    readonly tasksProcessed: number;
    readonly errorsEncountered: number;
    readonly averageTaskDuration: number;
    readonly currentLoad: number;
    readonly uptimeMs: number;
    readonly memoryUsage: number;
}

export interface StatsResponse extends BaseWorkerResponse {
    readonly type: 'STATS_RESPONSE';
    readonly stats: WorkerStats;
}

export interface CacheClearedResponse extends BaseWorkerResponse {
    readonly type: 'CACHE_CLEARED';
}

export interface ErrorResponse extends BaseWorkerResponse {
    readonly type: 'ERROR';
    readonly error: string;
}

export type WorkerResponse = 
    | ParseSuccessResponse
    | ParseErrorResponse
    | HealthResponse
    | StatsResponse
    | CacheClearedResponse
    | ErrorResponse;

export interface WorkerPoolConfig {
    readonly maxWorkers: number;
    readonly minWorkers: number;
    readonly idleTimeoutMs: number;
    readonly healthCheckIntervalMs: number;
    readonly maxTasksPerWorker: number;
    readonly workerTerminationTimeoutMs: number;
}

export interface WorkerInstance {
    readonly id: string;
    readonly worker: Worker;
    readonly createdAt: number;
    readonly stats: WorkerStats;
    isIdle: boolean;
    currentTaskId: string | null;
    lastUsed: number;
    tasksProcessed: number;
}

export interface WorkerTask<T = any> {
    readonly id: string;
    readonly message: WorkerMessage;
    readonly priority: ParsePriority;
    readonly createdAt: number;
    readonly timeoutMs: number;
    readonly resolve: (value: T) => void;
    readonly reject: (error: Error) => void;
    retryCount: number;
}

export function isParseTaskMessage(message: WorkerMessage): message is ParseTaskMessage {
    return message.type === 'PARSE_TASK';
}

export function isHealthCheckMessage(message: WorkerMessage): message is HealthCheckMessage {
    return message.type === 'HEALTH_CHECK';
}

export function isGetStatsMessage(message: WorkerMessage): message is GetStatsMessage {
    return message.type === 'GET_STATS';
}

export function isClearCacheMessage(message: WorkerMessage): message is ClearCacheMessage {
    return message.type === 'CLEAR_CACHE';
}

export function isParseSuccessResponse(response: WorkerResponse): response is ParseSuccessResponse {
    return response.type === 'PARSE_SUCCESS';
}

export function isParseErrorResponse(response: WorkerResponse): response is ParseErrorResponse {
    return response.type === 'PARSE_ERROR';
}

export function isHealthResponse(response: WorkerResponse): response is HealthResponse {
    return response.type === 'HEALTH_RESPONSE';
}

export function isStatsResponse(response: WorkerResponse): response is StatsResponse {
    return response.type === 'STATS_RESPONSE';
}

export function isErrorResponse(response: WorkerResponse): response is ErrorResponse {
    return response.type === 'ERROR';
}

export function createParseTaskMessage(
    taskId: string,
    context: SerializableParseContext,
    parserType: ParserPluginType,
    priority: ParsePriority = ParsePriority.NORMAL
): ParseTaskMessage {
    return {
        type: 'PARSE_TASK',
        taskId,
        context,
        parserType,
        priority,
        timestamp: Date.now()
    };
}

export function createHealthCheckMessage(taskId: string = `health-${Date.now()}`): HealthCheckMessage {
    return {
        type: 'HEALTH_CHECK',
        taskId,
        timestamp: Date.now()
    };
}

export function createGetStatsMessage(taskId: string = `stats-${Date.now()}`): GetStatsMessage {
    return {
        type: 'GET_STATS',
        taskId,
        timestamp: Date.now()
    };
}

export function createClearCacheMessage(taskId: string = `clear-${Date.now()}`): ClearCacheMessage {
    return {
        type: 'CLEAR_CACHE',
        taskId,
        timestamp: Date.now()
    };
}