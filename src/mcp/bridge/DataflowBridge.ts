/**
 * DataflowBridge - MCP Bridge implementation using the new Dataflow architecture
 * Provides the same interface as TaskManagerBridge but uses QueryAPI for data access
 */

import { QueryAPI } from "@/dataflow/api/QueryAPI";
import { WriteAPI } from "@/dataflow/api/WriteAPI";
import TaskProgressBarPlugin from "@/index";
import { StandardTaskMetadata, Task } from "@/types/task";
import { moment } from "obsidian";
import {
	UpdateTaskArgs,
	DeleteTaskArgs,
	CreateTaskArgs,
	BatchUpdateTextArgs,
	BatchCreateSubtasksArgs,
} from "../types/mcp";

export class DataflowBridge {
	private queryAPI: QueryAPI;
	private writeAPI: WriteAPI;

	constructor(
		private plugin: TaskProgressBarPlugin,
		queryAPI: QueryAPI,
		writeAPI: WriteAPI,
	) {
		this.queryAPI = queryAPI;
		this.writeAPI = writeAPI;
	}

	/**
	 * Query tasks with flexible filtering
	 */
	async queryTasks(params: {
		filter?: {
			completed?: boolean;
			project?: string;
			tags?: string[];
			priority?: number;
			context?: string;
		};
		limit?: number;
		offset?: number;
		sort?: {
			field: string;
			order: "asc" | "desc";
		};
	}): Promise<{ tasks: Task[]; total: number }> {
		try {
			let tasks = await this.queryAPI.getAllTasks();

			// Apply filters
			if (params.filter) {
				const { completed, project, tags, priority, context } =
					params.filter;

				if (completed !== undefined) {
					tasks = tasks.filter((t) => t.completed === completed);
				}

				if (project) {
					tasks = tasks.filter((t) => {
						const p =
							t.metadata?.project ||
							(t.metadata as any)?.tgProject?.name;
						return p === project;
					});
				}

				if (tags && tags.length > 0) {
					tasks = tasks.filter((t) => {
						const taskTags = t.metadata?.tags || [];
						return tags.some((tag) => taskTags.includes(tag));
					});
				}

				if (priority !== undefined) {
					tasks = tasks.filter(
						(t) => t.metadata?.priority === priority,
					);
				}

				if (context) {
					tasks = tasks.filter(
						(t) => t.metadata?.context === context,
					);
				}
			}

			// Apply sorting
			if (params.sort) {
				const { field, order } = params.sort;
				tasks.sort((a, b) => {
					let aVal: any = a;
					let bVal: any = b;

					// Navigate nested fields
					const fieldParts = field.split(".");
					for (const part of fieldParts) {
						aVal = aVal?.[part];
						bVal = bVal?.[part];
					}

					// Handle null/undefined
					if (aVal === null || aVal === undefined) return 1;
					if (bVal === null || bVal === undefined) return -1;

					// Compare
					if (aVal < bVal) return order === "asc" ? -1 : 1;
					if (aVal > bVal) return order === "asc" ? 1 : -1;
					return 0;
				});
			}

			// Apply pagination
			const total = tasks.length;
			const offset = params.offset || 0;
			const limit = params.limit || 100;
			tasks = tasks.slice(offset, offset + limit);

			return { tasks, total };
		} catch (error) {
			console.error("DataflowBridge: Error querying tasks:", error);
			return { tasks: [], total: 0 };
		}
	}

	/**
	 * Query tasks for a specific project
	 */
	async queryProjectTasks(project: string): Promise<{ tasks: Task[] }> {
		try {
			const tasks = await this.queryAPI.getTasksByProject(project);
			return { tasks };
		} catch (error) {
			console.error(
				"DataflowBridge: Error querying project tasks:",
				error,
			);
			return { tasks: [] };
		}
	}

	/**
	 * Query tasks for a specific context
	 */
	async queryContextTasks(context: string): Promise<{ tasks: Task[] }> {
		try {
			const tasks = await this.queryAPI.getAllTasks();
			const filtered = tasks.filter(
				(t) => t.metadata?.context === context,
			);
			return { tasks: filtered };
		} catch (error) {
			console.error(
				"DataflowBridge: Error querying context tasks:",
				error,
			);
			return { tasks: [] };
		}
	}

	/**
	 * Query tasks by priority
	 */
	async queryByPriority(
		priority: number,
		limit?: number,
	): Promise<{ tasks: Task[] }> {
		try {
			const tasks = await this.queryAPI.getAllTasks();
			const filtered = tasks
				.filter((t) => t.metadata?.priority === priority)
				.slice(0, limit || 100);
			return { tasks: filtered };
		} catch (error) {
			console.error("DataflowBridge: Error querying by priority:", error);
			return { tasks: [] };
		}
	}

	/**
	 * Query tasks by date range
	 */
	async queryByDate(params: {
		dateType: "due" | "start" | "scheduled";
		from?: string;
		to?: string;
		limit?: number;
	}): Promise<{ tasks: Task[] }> {
		try {
			const fromMs = params.from
				? moment(params.from).valueOf()
				: undefined;
			const toMs = params.to ? moment(params.to).valueOf() : undefined;

			const tasks = await this.queryAPI.getTasksByDateRange({
				from: fromMs,
				to: toMs,
				field: params.dateType || "due",
			});

			return { tasks: tasks.slice(0, params.limit || 100) };
		} catch (error) {
			console.error("DataflowBridge: Error querying by date:", error);
			return { tasks: [] };
		}
	}

	/**
	 * Search tasks by text query
	 */
	async searchTasks(params: {
		query: string;
		searchIn?: string[];
		limit?: number;
	}): Promise<{ tasks: Task[] }> {
		try {
			const tasks = await this.queryAPI.getAllTasks();
			const query = params.query.toLowerCase();
			const searchIn = params.searchIn || [
				"content",
				"tags",
				"project",
				"context",
			];

			const filtered = tasks.filter((task) => {
				for (const field of searchIn) {
					switch (field) {
						case "content":
							if (task.content?.toLowerCase().includes(query))
								return true;
							break;
						case "tags":
							const tags = task.metadata?.tags || [];
							if (
								tags.some((tag) =>
									tag.toLowerCase().includes(query),
								)
							)
								return true;
							break;
						case "project": {
							const p =
								task.metadata?.project ||
								(task.metadata as StandardTaskMetadata)
									?.tgProject?.name;
							if (p?.toLowerCase().includes(query)) return true;
							break;
						}
						case "context":
							if (
								task.metadata?.context
									?.toLowerCase()
									.includes(query)
							)
								return true;
							break;
					}
				}
				return false;
			});

			return { tasks: filtered.slice(0, params.limit || 100) };
		} catch (error) {
			console.error("DataflowBridge: Error searching tasks:", error);
			return { tasks: [] };
		}
	}

	/**
	 * List all metadata (tags, projects, contexts)
	 */
	listAllTagsProjectsContexts(): {
		tags: string[];
		projects: string[];
		contexts: string[];
	} {
		try {
			// Since this is synchronous in TaskManagerBridge, we need to handle it differently
			// For now, return empty arrays - this would need to be refactored to be async
			console.warn(
				"DataflowBridge: listAllTagsProjectsContexts needs async refactoring",
			);
			return { tags: [], projects: [], contexts: [] };
		} catch (error) {
			console.error("DataflowBridge: Error listing metadata:", error);
			return { tags: [], projects: [], contexts: [] };
		}
	}

	/**
	 * List tasks for a period
	 */
	async listTasksForPeriod(params: {
		period: "day" | "month" | "year";
		date: string;
		dateType?: "due" | "start" | "scheduled";
		limit?: number;
	}): Promise<{ tasks: Task[] }> {
		try {
			const baseMoment = moment(params.date);
			let from: moment.Moment;
			let to: moment.Moment;

			switch (params.period) {
				case "day":
					from = baseMoment.clone().startOf("day");
					to = baseMoment.clone().endOf("day");
					break;
				case "month":
					from = baseMoment.clone().startOf("month");
					to = baseMoment.clone().endOf("month");
					break;
				case "year":
					from = baseMoment.clone().startOf("year");
					to = baseMoment.clone().endOf("year");
					break;
			}

			const tasks = await this.queryAPI.getTasksByDateRange({
				from: from.valueOf(),
				to: to.valueOf(),
				field: params.dateType || "due",
			});

			return { tasks: tasks.slice(0, params.limit || 100) };
		} catch (error) {
			console.error(
				"DataflowBridge: Error listing tasks for period:",
				error,
			);
			return { tasks: [] };
		}
	}

	/**
	 * List tasks in date range
	 */
	async listTasksInRange(params: {
		from: string;
		to: string;
		dateType?: "due" | "start" | "scheduled";
		limit?: number;
	}): Promise<{ tasks: Task[] }> {
		try {
			const tasks = await this.queryAPI.getTasksByDateRange({
				from: moment(params.from).valueOf(),
				to: moment(params.to).valueOf(),
				field: params.dateType || "due",
			});

			return { tasks: tasks.slice(0, params.limit || 100) };
		} catch (error) {
			console.error(
				"DataflowBridge: Error listing tasks in range:",
				error,
			);
			return { tasks: [] };
		}
	}

	// Write operations using WriteAPI

	async createTask(args: CreateTaskArgs): Promise<any> {
		return this.writeAPI.createTask(args);
	}

	async updateTask(args: UpdateTaskArgs): Promise<any> {
		return this.writeAPI.updateTask(args);
	}

	async deleteTask(args: DeleteTaskArgs): Promise<any> {
		return this.writeAPI.deleteTask(args);
	}

	async updateTaskStatus(args: {
		taskId: string;
		status?: string;
		completed?: boolean;
	}): Promise<any> {
		return this.writeAPI.updateTaskStatus(args);
	}

	async batchUpdateTaskStatus(args: {
		taskIds: string[];
		status?: string;
		completed?: boolean;
	}): Promise<any> {
		return this.writeAPI.batchUpdateTaskStatus(args);
	}

	async postponeTasks(args: {
		taskIds: string[];
		newDate: string;
	}): Promise<any> {
		return this.writeAPI.postponeTasks(args);
	}

	async batchUpdateText(args: BatchUpdateTextArgs): Promise<any> {
		return this.writeAPI.batchUpdateText(args);
	}

	async batchCreateSubtasks(args: BatchCreateSubtasksArgs): Promise<any> {
		return this.writeAPI.batchCreateSubtasks(args);
	}

	async createTaskInDailyNote(
		args: CreateTaskArgs & { heading?: string },
	): Promise<any> {
		return this.writeAPI.createTaskInDailyNote(args);
	}

	async addProjectTaskToQuickCapture(args: {
		content: string;
		project: string;
		tags?: string[];
		priority?: number;
		dueDate?: string;
		startDate?: string;
		context?: string;
		heading?: string;
		completed?: boolean;
		completedDate?: string;
	}): Promise<any> {
		return this.writeAPI.addProjectTaskToQuickCapture(args);
	}

	async batchCreateTasks(args: {
		tasks: CreateTaskArgs[];
		defaultFilePath?: string;
	}): Promise<{
		success: boolean;
		created: number;
		errors: string[];
	}> {
		const results = {
			success: true,
			created: 0,
			errors: [] as string[],
		};

		for (let i = 0; i < args.tasks.length; i++) {
			const task = args.tasks[i];
			try {
				// Use defaultFilePath if task doesn't specify filePath
				const taskArgs: CreateTaskArgs = {
					...task,
					filePath: task.filePath || args.defaultFilePath,
				};

				const result = await this.writeAPI.createTask(taskArgs);
				if (result.success) {
					results.created++;
				} else {
					results.errors.push(
						`Task ${i + 1}: ${result.error || "Failed to create"}`,
					);
				}
			} catch (error: any) {
				results.success = false;
				results.errors.push(`Task ${i + 1}: ${error.message}`);
			}
		}

		return results;
	}
}
