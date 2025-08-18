/**
 * Simplified MCP Server implementation for Obsidian
 * Avoids external dependencies that can't be bundled
 */

import { IncomingMessage, ServerResponse } from "http";
import { AuthMiddleware } from "./auth/AuthMiddleware";
import { TaskManagerBridge } from "./bridge/TaskManagerBridge";
import { McpServerConfig } from "./types/mcp";
import TaskProgressBarPlugin from "../index";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const http = require("http");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const url = require("url");

export class McpServer {
	private httpServer: any;
	private authMiddleware: AuthMiddleware;
	private taskBridge: TaskManagerBridge;
	private isRunning: boolean = false;
	private requestCount: number = 0;
	private startTime?: Date;
	private actualPort?: number;
	private sessions: Map<string, { created: Date; lastAccess: Date }> = new Map();

	constructor(
		private plugin: TaskProgressBarPlugin,
		private config: McpServerConfig
	) {
		this.authMiddleware = new AuthMiddleware(config.authToken);
		this.taskBridge = new TaskManagerBridge(plugin, plugin.taskManager);
	}

	/**
	 * Generate a simple session ID
	 */
	private generateSessionId(): string {
		return `session-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
	}

	/**
	 * Compute a vault-aware server name, e.g., "my-vault-tasks"
	 */
	private getServerName(): string {
		try {
			const raw = this.plugin.app.vault.getName?.() || "vault";
			const slug = String(raw)
				.toLowerCase()
				.trim()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, "");
			return `${slug}-tasks`;
		} catch (e) {
			return "obsidian-tasks";
		}
	}

	/**
	 * Get prompt definitions
	 */
	private getPrompts(): any[] {
		return [
			{
				name: "daily_review",
				title: "Daily Task Review",
				description: "Review today's tasks and plan for tomorrow",
				arguments: [
					{
						name: "includeCompleted",
						description: "Include completed tasks in the review",
						required: false,
					},
				],
			},
			{
				name: "weekly_planning",
				title: "Weekly Planning",
				description: "Plan tasks for the upcoming week",
				arguments: [
					{
						name: "weekOffset",
						description: "Week offset from current week (0 for this week, 1 for next week)",
						required: false,
					},
				],
			},
			{
				name: "project_overview",
				title: "Project Overview",
				description: "Get an overview of all projects and their task counts",
				arguments: [],
			},
			{
				name: "overdue_tasks",
				title: "Overdue Tasks Summary",
				description: "List all overdue tasks organized by priority",
				arguments: [
					{
						name: "daysOverdue",
						description: "Minimum days overdue to include",
						required: false,
					},
				],
			},
			{
				name: "task_search",
				title: "Advanced Task Search",
				description: "Search for tasks with specific criteria",
				arguments: [
					{
						name: "query",
						description: "Search query text",
						required: true,
					},
					{
						name: "project",
						description: "Filter by project name",
						required: false,
					},
					{
						name: "priority",
						description: "Filter by priority (1-5)",
						required: false,
					},
				],
			},
		];
	}

	/**
	 * Get resource definitions
	 */
	private getResources(): any[] {
		// Return empty array for now - could be expanded to provide
		// vault statistics, task metrics, etc.
		return [];
	}

	/**
	 * Get tool definitions
	 */
	private getTools(): any[] {
		return [
			{
				name: "update_task_status",
				title: "Update Task Status",
				description: "Update a single task's completion or status field.",
				inputSchema: {
					type: "object",
					properties: {
						taskId: { type: "string" },
						status: { type: "string", description: "Optional status mark to set instead of completed" },
						completed: { type: "boolean", description: "Set completed true/false" },
					},
					required: ["taskId"],
				},
			},
			{
				name: "batch_update_task_status",
				title: "Batch Update Task Status",
				description: "Batch update completion/status for multiple tasks.",
				inputSchema: {
					type: "object",
					properties: {
						taskIds: { type: "array", items: { type: "string" } },
						status: { type: "string" },
						completed: { type: "boolean" },
					},
					required: ["taskIds"],
				},
			},
			{
				name: "postpone_tasks",
				title: "Postpone Tasks",
				description: "Batch postpone tasks to a new due date (YYYY-MM-DD)",
				inputSchema: {
					type: "object",
					properties: {
						taskIds: { type: "array", items: { type: "string" } },
						newDate: { type: "string" },
					},
					required: ["taskIds", "newDate"],
				},
			},
			{
				name: "list_all_metadata",
				title: "List Tags/Projects/Contexts",
				description: "List all used tags, project names, and contexts.",
				inputSchema: { type: "object", properties: {} },
			},
			{
				name: "list_tasks_for_period",
				title: "List Tasks For Period",
				description: "List tasks for a day/month/year based on dateType (default: due).",
				inputSchema: {
					type: "object",
					properties: {
						period: { type: "string", enum: ["day", "month", "year"] },
						date: { type: "string", description: "Base date YYYY-MM-DD" },
						dateType: { type: "string", enum: ["due", "start", "scheduled", "completed"], description: "Which date field to use" },
						limit: { type: "number" },
					},
					required: ["period", "date"],
				},
			},
			{
				name: "list_tasks_in_range",
				title: "List Tasks In Range",
				description: "List tasks between from/to dates (default dateType: due).",
				inputSchema: {
					type: "object",
					properties: {
						from: { type: "string" },
						to: { type: "string" },
						dateType: { type: "string", enum: ["due", "start", "scheduled", "completed"] },
						limit: { type: "number" },
					},
					required: ["from", "to"],
				},
			},
			{
				name: "add_project_quick_capture",
				title: "Add Project Task to Quick Capture",
				description: "Add a project-tagged task to the Quick Capture target (fixed or daily note).",
				inputSchema: {
					type: "object",
					properties: {
						content: { type: "string", description: "Task content text" },
						project: { type: "string", description: "Project name to tag as +project" },
						tags: { type: "array", items: { type: "string" } },
						priority: { type: "number", minimum: 1, maximum: 5 },
						dueDate: { type: "string" },
						startDate: { type: "string" },
						context: { type: "string" },
						heading: { type: "string" },
					},
					required: ["content", "project"],
				},
			},
			{
				name: "create_task_in_daily_note",
				title: "Create Task in Daily Note",
				description: "Create a task in today's daily note. Creates the note if missing. Supports creating already-completed tasks for recording purposes.",
				inputSchema: {
					type: "object",
					properties: {
						content: { type: "string", description: "Task content text" },
						dueDate: { type: "string", description: "Due date YYYY-MM-DD" },
						startDate: { type: "string", description: "Start date YYYY-MM-DD" },
						priority: { type: "number", minimum: 1, maximum: 5 },
						tags: { type: "array", items: { type: "string" } },
						project: { type: "string" },
						context: { type: "string" },
						heading: { type: "string", description: "Optional heading to place task under" },
						parent: { type: "string", description: "Optional parent task ID to create subtask under" },
						completed: { type: "boolean", description: "Whether the task is already completed (for recording purposes)" },
						completedDate: { type: "string", description: "Completion date YYYY-MM-DD (only used when completed is true)" },
					},
					required: ["content"],
				},
			},
			{
				name: "query_tasks",
				title: "Query Tasks",
				description: "Query tasks with filters and sorting options",
				inputSchema: {
					type: "object",
					properties: {
						filter: {
							type: "object",
							properties: {
								completed: { type: "boolean" },
								project: { type: "string" },
								context: { type: "string" },
								priority: { type: "number", minimum: 1, maximum: 5 },
								tags: { type: "array", items: { type: "string" } },
							},
						},
						limit: { type: "number" },
						offset: { type: "number" },
						sort: {
							type: "object",
							properties: {
								field: { type: "string" },
								order: { type: "string", enum: ["asc", "desc"] },
							},
						},
					},
				},
			},
			{
				name: "update_task",
				title: "Update Task",
				description: "Update a task by ID with new properties",
				inputSchema: {
					type: "object",
					properties: {
						taskId: { type: "string" },
						updates: { type: "object" },
					},
					required: ["taskId", "updates"],
				},
			},
			{
				name: "delete_task",
				title: "Delete Task",
				description: "Delete a task by ID",
				inputSchema: {
					type: "object",
					properties: {
						taskId: { type: "string" },
					},
					required: ["taskId"],
				},
			},
			{
				name: "create_task",
				title: "Create Task",
				description: "Create a new task with specified properties. If the target file does not exist, it will be created automatically. Supports creating already-completed tasks for recording purposes.",
				inputSchema: {
					type: "object",
					properties: {
						content: { type: "string", description: "Task content text" },
						filePath: { type: "string", description: "Target markdown file path (e.g., Daily/2025-08-15.md). If omitted, uses active file." },
						project: { type: "string", description: "Project name to append as +project" },
						context: { type: "string", description: "Context name to append as @context" },
						priority: { type: "number", minimum: 1, maximum: 5, description: "1-5 priority; adds ! markers" },
						dueDate: { type: "string", description: "Due date YYYY-MM-DD (adds 📅 marker)" },
						startDate: { type: "string", description: "Start date YYYY-MM-DD (adds 🛫 marker)" },
						tags: { type: "array", items: { type: "string" }, description: "Array of tags (without #)" },
						parent: { type: "string", description: "Parent task ID to create a subtask under" },
						completed: { type: "boolean", description: "Whether the task is already completed (for recording purposes)" },
						completedDate: { type: "string", description: "Completion date YYYY-MM-DD (only used when completed is true)" },
					},
					required: ["content"],
				},
			},
			{
				name: "query_project_tasks",
				title: "Query Project Tasks",
				description: "Get all tasks for a specific project",
				inputSchema: {
					type: "object",
					properties: {
						project: { type: "string" },
					},
					required: ["project"],
				},
			},
			{
				name: "query_context_tasks",
				title: "Query Context Tasks",
				description: "Get all tasks for a specific context",
				inputSchema: {
					type: "object",
					properties: {
						context: { type: "string" },
					},
					required: ["context"],
				},
			},
			{
				name: "query_by_priority",
				title: "Query by Priority",
				description: "Get tasks with a specific priority level",
				inputSchema: {
					type: "object",
					properties: {
						priority: { type: "number", minimum: 1, maximum: 5 },
						limit: { type: "number" },
					},
					required: ["priority"],
				},
			},
			{
				name: "query_by_due_date",
				title: "Query by Due Date",
				description: "Get tasks within a due date range",
				inputSchema: {
					type: "object",
					properties: {
						from: { type: "string" },
						to: { type: "string" },
						limit: { type: "number" },
					},
				},
			},
			{
				name: "query_by_start_date",
				title: "Query by Start Date",
				description: "Get tasks within a start date range",
				inputSchema: {
					type: "object",
					properties: {
						from: { type: "string" },
						to: { type: "string" },
						limit: { type: "number" },
					},
				},
			},
			{
				name: "batch_update_text",
				title: "Batch Update Text",
				description: "Find and replace text in multiple tasks",
				inputSchema: {
					type: "object",
					properties: {
						taskIds: { type: "array", items: { type: "string" } },
						findText: { type: "string" },
						replaceText: { type: "string" },
					},
					required: ["taskIds", "findText", "replaceText"],
				},
			},
			{
				name: "batch_create_subtasks",
				title: "Batch Create Subtasks",
				description: "Create multiple subtasks under a parent task",
				inputSchema: {
					type: "object",
					properties: {
						parentTaskId: { type: "string" },
						subtasks: {
							type: "array",
							items: {
								type: "object",
								properties: {
									content: { type: "string" },
									priority: { type: "number", minimum: 1, maximum: 5 },
									dueDate: { type: "string" },
								},
								required: ["content"],
							},
						},
					},
					required: ["parentTaskId", "subtasks"],
				},
			},
			{
				name: "search_tasks",
				title: "Search Tasks",
				description: "Search tasks by text query across multiple fields",
				inputSchema: {
					type: "object",
					properties: {
						query: { type: "string" },
						limit: { type: "number" },
						searchIn: {
							type: "array",
							items: {
								type: "string",
								enum: ["content", "tags", "project", "context"],
							},
						},
					},
					required: ["query"],
				},
			},
		];
	}

	/**
	 * Build prompt messages based on prompt name and arguments
	 */
	private buildPromptMessages(promptName: string, args: any): any[] {
		const messages = [];
		
		switch (promptName) {
			case "daily_review":
				messages.push({
					role: "user",
					content: {
						type: "text",
						text: `Please help me review my tasks for today. ${args?.includeCompleted ? 'Include completed tasks in the review.' : 'Focus on pending tasks only.'} Provide a summary of:
1. What tasks are due today
2. What tasks are overdue
3. High priority items that need attention
4. Suggested next actions`
					}
				});
				break;
				
			case "weekly_planning":
				const weekOffset = args?.weekOffset || 0;
				messages.push({
					role: "user",
					content: {
						type: "text",
						text: `Help me plan my tasks for ${weekOffset === 0 ? 'this week' : `week +${weekOffset}`}. Please:
1. List all tasks scheduled for the week
2. Identify any conflicts or overloaded days
3. Suggest task prioritization
4. Recommend which tasks could be rescheduled if needed`
					}
				});
				break;
				
			case "project_overview":
				messages.push({
					role: "user",
					content: {
						type: "text",
						text: `Provide a comprehensive overview of all my projects including:
1. List of all active projects
2. Task count per project (pending vs completed)
3. Projects with upcoming deadlines
4. Projects that may need more attention
5. Overall project health assessment`
					}
				});
				break;
				
			case "overdue_tasks":
				const daysOverdue = args?.daysOverdue || 0;
				messages.push({
					role: "user",
					content: {
						type: "text",
						text: `Show me all overdue tasks ${daysOverdue > 0 ? `that are at least ${daysOverdue} days overdue` : ''}. Please:
1. Group them by priority level
2. Highlight the most critical overdue items
3. Suggest which tasks to tackle first
4. Identify any tasks that might need to be rescheduled or cancelled`
					}
				});
				break;
				
			case "task_search":
				const query = args?.query || "";
				const project = args?.project;
				const priority = args?.priority;
				
				let searchPrompt = `Search for tasks matching: "${query}"`;
				if (project) searchPrompt += ` in project "${project}"`;
				if (priority) searchPrompt += ` with priority ${priority}`;
				
				messages.push({
					role: "user",
					content: {
						type: "text",
						text: `${searchPrompt}. Please:
1. List all matching tasks with their details
2. Group them by relevance or category
3. Highlight the most important matches
4. Provide a summary of the search results`
					}
				});
				break;
				
			default:
				messages.push({
					role: "user",
					content: {
						type: "text",
						text: `Execute the ${promptName} prompt with the provided arguments.`
					}
				});
		}
		
		return messages;
	}

	/**
	 * Execute a tool
	 */
	private async executeTool(toolName: string, args: any): Promise<any> {
		try {
			// Ensure TaskManager is available before executing tools
			if (!this.plugin.taskManager) {
				return {
					content: [{ type: "text", text: "Error: TaskManager not initialized. Please enable the main view or wait for plugin initialization." }],
					isError: true,
				};
			}
			// Rebind bridge if it's not initialized yet
			if (!this.taskBridge) {
				this.taskBridge = new TaskManagerBridge(this.plugin, this.plugin.taskManager);
			}
			let result: any;

			switch (toolName) {
				case "query_tasks":
					result = await this.taskBridge.queryTasks(args);
					break;
				case "update_task":
					result = await this.taskBridge.updateTask(args);
					break;
				case "delete_task":
					result = await this.taskBridge.deleteTask(args);
					break;
				case "create_task":
					result = await this.taskBridge.createTask(args);
					if (!result) throw new Error("create_task returned empty result");
					break;
				case "create_task_in_daily_note":
					result = await this.taskBridge.createTaskInDailyNote(args);
					if (!result) throw new Error("create_task_in_daily_note returned empty result");
					break;
				case "query_project_tasks":
					result = await this.taskBridge.queryProjectTasks(args.project);
					break;
				case "query_context_tasks":
					result = await this.taskBridge.queryContextTasks(args.context);
					break;
				case "query_by_priority":
					result = await this.taskBridge.queryByPriority(
						args.priority,
						args.limit
					);
					break;
				case "query_by_due_date":
					result = await this.taskBridge.queryByDate({
						dateType: "due",
						from: args.from,
						to: args.to,
						limit: args.limit,
					});
					break;
				case "query_by_start_date":
					result = await this.taskBridge.queryByDate({
						dateType: "start",
						from: args.from,
						to: args.to,
						limit: args.limit,
					});
					break;
				case "batch_update_text":
					result = await this.taskBridge.batchUpdateText(args);
					break;
				case "batch_create_subtasks":
					result = await this.taskBridge.batchCreateSubtasks(args);
					break;
				case "search_tasks":
					result = await this.taskBridge.searchTasks(args);
					break;
				case "add_project_quick_capture":
					result = await this.taskBridge.addProjectTaskToQuickCapture(args);
					break;
				case "update_task_status":
					result = await this.taskBridge.updateTaskStatus(args);
					break;
				case "batch_update_task_status":
					result = await this.taskBridge.batchUpdateTaskStatus(args);
					break;
				case "postpone_tasks":
					result = await this.taskBridge.postponeTasks(args);
					break;
				case "list_all_metadata":
					result = this.taskBridge.listAllTagsProjectsContexts();
					break;
				case "list_tasks_for_period":
					result = await this.taskBridge.listTasksForPeriod(args);
					break;
				case "list_tasks_in_range":
					result = await this.taskBridge.listTasksInRange(args);
					break;
				default:
					throw new Error(`Tool not found: ${toolName}`);
			}

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (error: any) {
			// Re-throw tool not found errors so they can be handled properly
			if (error.message.includes("Tool not found")) {
				throw error;
			}
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ success: false, error: error.message }, null, 2),
					},
				],
				isError: true,
			};
		}
	}

	/**
	 * Handle MCP protocol request
	 */
	private async handleMcpRequest(request: any, sessionId?: string): Promise<any> {
		const { method, params, id } = request;

		try {
			// Update session last access if exists
			if (sessionId && this.sessions.has(sessionId)) {
				const session = this.sessions.get(sessionId)!;
				session.lastAccess = new Date();
			}

			// Handle different MCP methods
			switch (method) {
				case "initialize":
					// Always create new session for initialize
					const newSessionId = this.generateSessionId();
					this.sessions.set(newSessionId, {
						created: new Date(),
						lastAccess: new Date(),
					});
					// Return sessionId for header processing
					return {
						jsonrpc: "2.0",
						id,
						result: {
							protocolVersion: "2025-06-18",
							serverInfo: {
								name: "obsidian-task-genius",
								version: this.plugin.manifest.version,
							},
							capabilities: {
								tools: {},
								resources: {},
								prompts: {},
								sampling: {},
							},
						},
						_sessionId: newSessionId,  // Internal field for header processing
					};

				case "tools/list":
					return {
						jsonrpc: "2.0",
						id,
						result: {
							tools: this.getTools(),
						},
					};

				case "prompts/list":
					return {
						jsonrpc: "2.0",
						id,
						result: {
							prompts: this.getPrompts(),
						},
					};

				case "prompts/get":
					const promptName = params?.name;
					const prompts = this.getPrompts();
					const prompt = prompts.find(p => p.name === promptName);
					if (!prompt) {
						return {
							jsonrpc: "2.0",
							id,
							error: {
								code: -32602,
								message: `Prompt not found: ${promptName}`,
							},
						};
					}
					return {
						jsonrpc: "2.0",
						id,
						result: {
							...prompt,
							// Build the prompt template based on the prompt name
							messages: this.buildPromptMessages(promptName, params?.arguments),
						},
					};

				case "resources/list":
					return {
						jsonrpc: "2.0",
						id,
						result: {
							resources: this.getResources(),
						},
					};

				case "resources/read":
					// Return error for now since we don't have resources
					return {
						jsonrpc: "2.0",
						id,
						error: {
							code: -32602,
							message: "No resources available",
						},
					};

				case "tools/call":
					const toolName = params?.name;
					const toolArgs = params?.arguments || {};
					try {
						const result = await this.executeTool(toolName, toolArgs);
						return {
							jsonrpc: "2.0",
							id,
							result,
						};
					} catch (error: any) {
						if (error.message.includes("Unknown tool") || error.message.includes("Tool not found")) {
							return {
								jsonrpc: "2.0",
								id,
								error: {
									code: -32602,
									message: error.message,
								},
							};
						}
						throw error;
					}

				default:
					return {
						jsonrpc: "2.0",
						id,
						error: {
							code: -32601,
							message: `Method not found: ${method}`,
						},
					};
			}
		} catch (error: any) {
			return {
				jsonrpc: "2.0",
				id,
				error: {
					code: -32603,
					message: error.message,
				},
			};
		}
	}

	async start(): Promise<void> {
		if (this.isRunning) {
			console.log("MCP Server is already running");
			return;
		}

		// Create HTTP server
		this.httpServer = http.createServer(
			async (req: IncomingMessage, res: ServerResponse) => {
				// Enable CORS if configured
				if (this.config.enableCors) {
					res.setHeader("Access-Control-Allow-Origin", "*");
					res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
					// Allow both canonical and lowercase header spellings for robustness, including MCP-Protocol-Version
					res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, authorization, Mcp-Session-Id, mcp-session-id, Mcp-App-Id, mcp-app-id, MCP-Protocol-Version, mcp-protocol-version, Accept");
					res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
				}

				// Handle OPTIONS for CORS preflight
				if (req.method === "OPTIONS") {
					res.statusCode = 200;
					res.end();
					return;
				}

				const parsedUrl = url.parse(req.url || "", true);
				const pathname = parsedUrl.pathname || "";

				// Health check endpoint
				if (pathname === "/health") {
					res.statusCode = 200;
					res.setHeader("Content-Type", "application/json");
					res.end(
						JSON.stringify({
							status: "healthy",
							uptime: this.startTime
								? Date.now() - this.startTime.getTime()
								: 0,
							requestCount: this.requestCount,
							sessions: this.sessions.size,
						})
					);
					return;
				}

				// MCP endpoint
				if (pathname === "/mcp" && req.method === "POST") {
					// Validate Origin header for security (DNS rebinding protection)
					const origin = req.headers.origin as string;
					if (origin && !this.isOriginAllowed(origin)) {
						res.statusCode = 403;
						res.setHeader("Content-Type", "application/json");
						res.end(
							JSON.stringify({
								error: "Forbidden",
								message: "Origin not allowed",
							})
						);
						return;
					}
					
					// Validate Accept header for POST requests
					const acceptHeader = req.headers.accept as string;
					if (!acceptHeader || !acceptHeader.includes("application/json")) {
						res.statusCode = 400;
						res.setHeader("Content-Type", "application/json");
						res.end(
							JSON.stringify({
								error: "Bad Request",
								message: "Accept header must include application/json for POST requests",
							})
						);
						return;
					}
					
					// Check MCP-Protocol-Version header
					// Default to 2025-03-26 if not provided (as per spec)
					const protocolVersion = (req.headers["mcp-protocol-version"] as string) || "2025-03-26";
					const supportedVersions = ["2024-11-05", "2025-03-26", "2025-06-18"];
					if (!supportedVersions.includes(protocolVersion)) {
						res.statusCode = 400;
						res.setHeader("Content-Type", "application/json");
						res.end(
							JSON.stringify({
								error: "Bad Request",
								message: `Unsupported MCP-Protocol-Version: ${protocolVersion}`,
							})
						);
						return;
					}
					
					// Authenticate request
					if (!this.authMiddleware.validateRequest(req)) {
						res.statusCode = 401;
						res.setHeader("Content-Type", "application/json");
						res.end(
							JSON.stringify({
								error: "Unauthorized",
								message: "Invalid or missing authentication token",
							})
						);
						return;
					}

					// Validate client app identity to avoid cross-vault confusion
					const expectedAppId = this.plugin.app.appId;
					const headerAppId = (req.headers["mcp-app-id"] as string) || "";
					const bearerAppId = this.authMiddleware.getClientAppId(req);
					const clientAppId = headerAppId || bearerAppId || "";
					
					if (!clientAppId || clientAppId !== expectedAppId) {
						res.statusCode = 400;
						res.setHeader("Content-Type", "application/json");
						res.end(
							JSON.stringify({
								error: "InvalidClient",
								message: "Missing or invalid client app id. Include header: mcp-app-id: <plugin.app.appId> or Authorization: Bearer <token>+<appId>.",
								details: { expectedAppId, received: clientAppId || null, source: headerAppId ? "header" : (bearerAppId ? "authorization" : "none") }
							})
						);
						return;
					}

					this.requestCount++;

					// Get session ID from headers
					let sessionId = req.headers["mcp-session-id"] as string;

					// Handle request body
					let body = "";
					req.on("data", (chunk) => {
						body += chunk.toString();
					});

					req.on("end", async () => {
						let request;
						try {
							request = JSON.parse(body);
						} catch (parseError: any) {
							res.statusCode = 400;
							res.setHeader("Content-Type", "application/json");
							res.end(
								JSON.stringify({
									jsonrpc: "2.0",
									error: {
										code: -32700,
										message: "Parse error: Invalid JSON",
									},
									id: null,
								})
							);
							return;
						}
						
						try {
							
							// For non-initialize requests, validate session exists
							if (request.method !== "initialize" && sessionId && !this.sessions.has(sessionId)) {
								console.warn("Invalid session ID:", sessionId);
								res.statusCode = 404;
								res.setHeader("Content-Type", "application/json");
								res.end(
									JSON.stringify({
										jsonrpc: "2.0",
										id: request.id,
										error: {
											code: -32603,
											message: "Invalid or expired session",
										},
									})
								);
								return;
							}
							
							// Handle MCP request
							this.config.logLevel === "debug" && console.log("[MCP] <-", request);
							const response = await this.handleMcpRequest(request, sessionId);
							this.config.logLevel === "debug" && console.log("[MCP] ->", response);

							// Add session ID to response headers for initialize request
							if (response._sessionId) {
								res.setHeader("Mcp-Session-Id", response._sessionId);
								// Remove internal field from response
								delete response._sessionId;
							}

							// Determine status code based on message type
							// If it's a notification (no id) or the client sent a response, return 202 Accepted
							const isNotification = !request.id;
							const isResponse = request.result !== undefined || request.error !== undefined;
							
							if (isNotification || isResponse) {
								res.statusCode = 202; // Accepted for notifications and responses
							} else {
								res.statusCode = 200; // OK for requests
							}
							
							res.setHeader("Content-Type", "application/json");
							res.end(JSON.stringify(response));
						} catch (error: any) {
							console.error("MCP request error:", error);
							res.statusCode = 500;
							res.setHeader("Content-Type", "application/json");
							res.end(
								JSON.stringify({
									jsonrpc: "2.0",
									error: {
										code: -32603,
										message: "Internal server error",
									},
									id: null,
								})
							);
						}
					});
					return;
				}

				// SSE endpoint for notifications (simplified - just returns empty)
				if (pathname === "/mcp" && req.method === "GET") {
					// Validate Accept header for GET requests (SSE)
					const acceptHeader = req.headers.accept as string;
					if (!acceptHeader || !acceptHeader.includes("text/event-stream")) {
						res.statusCode = 400;
						res.setHeader("Content-Type", "application/json");
						res.end(
							JSON.stringify({
								error: "Bad Request",
								message: "Accept header must include text/event-stream for GET requests",
							})
						);
						return;
					}
					
					const sessionId = req.headers["mcp-session-id"] as string;
					// Make session validation optional for SSE
					if (sessionId && !this.sessions.has(sessionId)) {
						console.warn("SSE connection with invalid session ID:", sessionId);
						// Continue anyway for compatibility
					}
					
					// Set up SSE headers
					res.writeHead(200, {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						"Connection": "keep-alive",
					});
					
					// Send initial connection message
					res.write("data: {\"type\":\"connected\"}\n\n");
					
					// Keep connection alive with heartbeat
					const heartbeat = setInterval(() => {
						res.write(": heartbeat\n\n");
					}, 30000);
					
					// Clean up on close
					req.on("close", () => {
						clearInterval(heartbeat);
					});
					
					return;
				}

				// Session termination
				if (pathname === "/mcp" && req.method === "DELETE") {
					const sessionId = req.headers["mcp-session-id"] as string;
					if (sessionId && this.sessions.has(sessionId)) {
						this.sessions.delete(sessionId);
					}
					res.statusCode = 204;
					res.end();
					return;
				}

				// Root endpoint - return 404 as per MCP spec
				if (pathname === "/") {
					res.statusCode = 404;
					res.setHeader("Content-Type", "application/json");
					res.end(
						JSON.stringify({
							error: "Not Found",
							message: "MCP server is running. Please use POST /mcp for JSON-RPC requests.",
							endpoint: "/mcp"
						})
					);
					return;
				}

				// 404 for other routes
				res.statusCode = 404;
				res.setHeader("Content-Type", "application/json");
				res.end(
					JSON.stringify({
						error: "Not found",
						message: `Path ${pathname} not found`,
					})
				);
			}
		);

		// Start the server
		return new Promise((resolve, reject) => {
			try {
				this.httpServer.listen(
					{
						port: this.config.port,
						host: this.config.host,
					},
					() => {
						this.isRunning = true;
						this.startTime = new Date();
						
						// Get actual port after binding (important when port is 0)
						const address = this.httpServer.address();
						this.actualPort = address?.port || this.config.port;
						
						console.log(
							`MCP Server started on ${this.config.host}:${this.actualPort}`
						);
						
						// Clean up old sessions periodically
						setInterval(() => {
							const now = Date.now();
							for (const [id, session] of this.sessions) {
								if (now - session.lastAccess.getTime() > 3600000) { // 1 hour
									this.sessions.delete(id);
								}
							}
						}, 60000); // Check every minute
						
						resolve();
					}
				);

				this.httpServer.on("error", (error: any) => {
					console.error("MCP Server error:", error);
					this.isRunning = false;
					reject(error);
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	async stop(): Promise<void> {
		if (!this.isRunning || !this.httpServer) {
			return;
		}

		// Clear sessions
		this.sessions.clear();

		// Close HTTP server
		return new Promise((resolve) => {
			this.httpServer.close(() => {
				this.isRunning = false;
				console.log("MCP Server stopped");
				resolve();
			});
		});
	}

	getStatus(): {
		running: boolean;
		port?: number;
		startTime?: Date;
		requestCount?: number;
		sessions?: number;
	} {
		return {
			running: this.isRunning,
			port: this.actualPort || this.config.port,
			startTime: this.startTime,
			requestCount: this.requestCount,
			sessions: this.sessions.size,
		};
	}

	updateConfig(config: Partial<McpServerConfig>): void {
		if (config.authToken) {
			this.authMiddleware.updateToken(config.authToken);
		}
		Object.assign(this.config, config);
	}

	/**
	 * Check if an origin is allowed (for DNS rebinding protection)
	 */
	private isOriginAllowed(origin: string): boolean {
		// Allow local origins
		const allowedOrigins = [
			"http://localhost",
			"http://127.0.0.1",
			"https://localhost",
			"https://127.0.0.1",
			"app://obsidian.md",
			"obsidian://",
		];
		
		// Check exact match or prefix match
		return allowedOrigins.some(allowed => 
			origin === allowed || origin.startsWith(allowed + ":")
		);
	}
}