/**
 * MCP (Model Context Protocol) Type Definitions
 */

import { Task } from "../../types/task";

export interface McpServerConfig {
	enabled: boolean;
	port: number;
	host: string;
	authToken: string;
	enableCors: boolean;
	logLevel: "debug" | "info" | "warn" | "error";
}

export interface McpToolRequest {
	tool: string;
	arguments: Record<string, any>;
}

export interface McpToolResponse {
	content: Array<{
		type: "text" | "resource";
		text?: string;
		resource?: any;
	}>;
	isError?: boolean;
}

export interface QueryTasksArgs {
	filter?: {
		completed?: boolean;
		project?: string;
		context?: string;
		priority?: number;
		tags?: string[];
	};
	limit?: number;
	offset?: number;
	sort?: {
		field: keyof Task;
		order: "asc" | "desc";
	};
}

export interface UpdateTaskArgs {
	taskId: string;
	updates: Partial<Task>;
}

export interface DeleteTaskArgs {
	taskId: string;
}

export interface CreateTaskArgs {
	content: string;
	filePath?: string;
	project?: string;
	context?: string;
	priority?: number;
	dueDate?: string;
	startDate?: string;
	tags?: string[];
	parent?: string;
	completed?: boolean;
	completedDate?: string;
}

export interface BatchUpdateTextArgs {
	taskIds: string[];
	findText: string;
	replaceText: string;
}

export interface BatchCreateSubtasksArgs {
	parentTaskId: string;
	subtasks: Array<{
		content: string;
		priority?: number;
		dueDate?: string;
	}>;
}

export interface SearchTasksArgs {
	query: string;
	limit?: number;
	searchIn?: ("content" | "tags" | "project" | "context")[];
}

export interface QueryByDateArgs {
	dateType: "due" | "start" | "scheduled" | "completed";
	from?: string;
	to?: string;
	limit?: number;
}

export interface McpServerStatus {
	running: boolean;
	port?: number;
	startTime?: Date;
	requestCount?: number;
	lastError?: string;
}