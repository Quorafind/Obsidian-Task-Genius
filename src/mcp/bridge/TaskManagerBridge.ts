/**
 * TaskManagerBridge - Bridge between MCP tools and TaskManager
 */

import { Task } from "../../types/task";
import { TaskManager } from "../../utils/TaskManager";
import {
	QueryTasksArgs,
	UpdateTaskArgs,
	DeleteTaskArgs,
	CreateTaskArgs,
	BatchUpdateTextArgs,
	BatchCreateSubtasksArgs,
	SearchTasksArgs,
	QueryByDateArgs,
	BatchCreateTasksArgs,
} from "../types/mcp";
import { moment, TFile } from "obsidian";
import TaskProgressBarPlugin from "../../index";
import {
	createDailyNote,
	getAllDailyNotes,
	getDailyNote,
	appHasDailyNotesPluginLoaded,
	getDailyNoteSettings,
} from "obsidian-daily-notes-interface";
import { saveCapture, processDateTemplates } from "../../utils/fileUtils";

export class TaskManagerBridge {
	constructor(
		private plugin: TaskProgressBarPlugin,
		private taskManager: TaskManager
	) {}

	async queryTasks(args: QueryTasksArgs): Promise<{ tasks: Task[], total: number }> {
		const allTasks = await this.taskManager.getAllTasks();
		let filteredTasks = [...allTasks];

		if (args.filter) {
			const { completed, project, context, priority, tags } = args.filter;

			if (completed !== undefined) {
				filteredTasks = filteredTasks.filter(
					(task) => task.completed === completed
				);
			}

			if (project) {
				filteredTasks = filteredTasks.filter(
					(task) =>
						task.metadata.project === project ||
						task.metadata.tgProject?.name === project
				);
			}

			if (context) {
				filteredTasks = filteredTasks.filter(
					(task) => task.metadata.context === context
				);
			}

			if (priority !== undefined) {
				filteredTasks = filteredTasks.filter(
					(task) => task.metadata.priority === priority
				);
			}

			if (tags && tags.length > 0) {
				filteredTasks = filteredTasks.filter((task) =>
					tags.some((tag) => task.metadata.tags.includes(tag))
				);
			}
		}

		if (args.sort) {
			const { field, order } = args.sort;
			filteredTasks.sort((a, b) => {
				const aVal = this.getTaskFieldValue(a, field);
				const bVal = this.getTaskFieldValue(b, field);

				if (aVal < bVal) return order === "asc" ? -1 : 1;
				if (aVal > bVal) return order === "asc" ? 1 : -1;
				return 0;
			});
		}

		const total = filteredTasks.length;
		const offset = args.offset || 0;
		const limit = args.limit || filteredTasks.length;
		return {
			tasks: filteredTasks.slice(offset, offset + limit),
			total
		};
	}

	async updateTask(args: UpdateTaskArgs): Promise<{ success: boolean; task?: Task }> {
		const task = await this.taskManager.getTaskById(args.taskId);
		if (!task) return { success: false };

		// Merge the updates with the existing task
		const updatedTask: Task = {
			...task,
			...args.updates,
			metadata: {
				...task.metadata,
				...(args.updates.metadata || {}),
			},
		};

		await this.taskManager.updateTask(updatedTask);
		const result = await this.taskManager.getTaskById(args.taskId);
		return { success: true, task: result || task };
	}

	async deleteTask(args: DeleteTaskArgs): Promise<{ success: boolean; message?: string }> {
		const task = await this.taskManager.getTaskById(args.taskId);
		if (!task) return { success: false, message: "Task not found" };

		const file = this.plugin.app.vault.getAbstractFileByPath(
			task.filePath
		) as TFile;
		if (!file) return { success: false, message: "File not found" };

		const content = await this.plugin.app.vault.read(file);
		const lines = content.split("\n");

		if (task.line > 0 && task.line <= lines.length) {
			lines.splice(task.line - 1, 1);
			await this.plugin.app.vault.modify(file, lines.join("\n"));
			return { success: true };
		}

		return { success: false, message: "Invalid line number" };
	}

	async createTask(args: CreateTaskArgs): Promise<{ success: boolean; task?: Task; message?: string }> {
		let filePath = args.filePath;
		const vault = this.plugin.app.vault;

		if (!filePath) {
			const activeFile = this.plugin.app.workspace.getActiveFile();
			if (activeFile) {
				filePath = activeFile.path;
			} else {
				return { success: false, message: "No filePath provided and no active file available" };
			}
		}

		// Build task markdown line with proper metadata formatting
		const checkboxState = args.completed ? "[x]" : "[ ]";
		let taskContent = `- ${checkboxState} ${args.content}`;
		const metadata = this.generateMetadata({
			tags: args.tags,
			project: args.project,
			context: args.context,
			priority: args.priority,
			startDate: args.startDate,
			dueDate: args.dueDate,
			completed: args.completed,
			completedDate: args.completedDate
		});
		if (metadata) {
			taskContent += ` ${metadata}`;
		}

		// Ensure file exists (create folders/file if missing)
		let file = vault.getAbstractFileByPath(filePath) as TFile | null;
		if (!file) {
			// Create directory structure if needed
			const parts = filePath.split("/");
			if (parts.length > 1) {
				const dir = parts.slice(0, -1).join("/");
				try { await vault.createFolder(dir); } catch (_) { /* ignore if exists */ }
			}
			// Create file with initial task content
			file = await vault.create(filePath, `${taskContent}\n`);
		} else {
			// Append task to existing file (or insert as subtask)
			const content = await vault.read(file);
			let insertedLine = -1;
			let newContent = "";
			
			if (args.parent) {
				const result = await this.insertSubtask(content, args.parent, taskContent);
				newContent = result.content;
				insertedLine = result.insertedLine;
			} else {
				newContent = (content ? content + "\n" : "") + taskContent;
				const lines = newContent.split("\n");
				insertedLine = lines.length - 1;
			}
			
			await vault.modify(file, newContent);
		}

		await this.taskManager.indexFile(file);

		const tasks = this.taskManager.getTasksForFile(file.path);
		
		// Find the task at the inserted line
		let created: Task | undefined;
		if (args.parent && insertedLine >= 0) {
			// For subtasks, find by line number (1-based in task IDs)
			const expectedId = `${file.path}-L${insertedLine + 1}`;
			created = tasks.find(t => t.id === expectedId);
		} else {
			// For regular tasks appended to end, use the last task
			created = tasks[tasks.length - 1];
		}
		
		if (!created) {
			return { success: false, message: "Task created but could not be indexed or found" };
		}
		return { success: true, task: created };
	}


	/** Create a task in today's daily note, creating the note if needed */
	async createTaskInDailyNote(args: CreateTaskArgs & { heading?: string }): Promise<Task> {
		const app = this.plugin.app;
		// Try using Daily Notes plugin if available
		let dailyNoteFile: TFile | null = null;
		try {
			if (appHasDailyNotesPluginLoaded()) {
				// Use noon to avoid timezone edge cases
				const date = moment().set("hour", 12);
				const existing = getDailyNote(date, getAllDailyNotes());
				if (existing) {
					dailyNoteFile = existing;
				} else {
					dailyNoteFile = await createDailyNote(date);
				}
			}
		} catch (e) {
			// Fallback to manual creation if daily notes plugin unavailable or fails
		}

		if (!dailyNoteFile) {
			// Fallback: compute path as <folder>/<YYYY-MM-DD>.md based on daily note settings if available
			const qc = this.plugin.settings.quickCapture;
			let folder = qc?.dailyNoteSettings?.folder || "";
			const format = qc?.dailyNoteSettings?.format || "YYYY-MM-DD";
			if (!folder) {
				try { folder = getDailyNoteSettings().folder || ""; } catch {}
			}
			const dateStr = moment().format(format);
			const path = folder ? `${folder}/${dateStr}.md` : `${dateStr}.md`;
			// Ensure folders
			const parts = path.split("/");
			if (parts.length > 1) {
				const dir = parts.slice(0, -1).join("/");
				try { await app.vault.createFolder(dir); } catch {}
			}
			// Create empty file if not exists
			let file = app.vault.getAbstractFileByPath(path) as TFile | null;
			if (!file) {
				file = await app.vault.create(path, "");
			}
			dailyNoteFile = file;
		}

		// Compose task content with proper metadata formatting
		const checkboxState = args.completed ? "[x]" : "[ ]";
		let taskContent = `- ${checkboxState} ${args.content}`;
		const metadata = this.generateMetadata({
			tags: args.tags,
			project: args.project,
			context: args.context,
			priority: args.priority,
			startDate: args.startDate,
			dueDate: args.dueDate,
			completed: args.completed,
			completedDate: args.completedDate
		});
		if (metadata) {
			taskContent += ` ${metadata}`;
		}

		// Append under optional heading
		const file = dailyNoteFile;
		const current = await app.vault.read(file);
		let newContent = current;
		let insertedLine = -1;
		
		if (args.parent) {
			const result = await this.insertSubtask(current, args.parent, taskContent);
			newContent = result.content;
			insertedLine = result.insertedLine;
		} else {
			// Use heading from Quick Capture settings if available
			const fallbackHeading = this.plugin.settings.quickCapture?.targetHeading?.trim();
			if (fallbackHeading) {
				const headingRegex = new RegExp(`^#{1,6}\\s+${fallbackHeading.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*$`, "m");
				if (headingRegex.test(current)) {
					newContent = current.replace(headingRegex, `$&\n\n${taskContent}`);
				} else {
					newContent = `${current}${current.endsWith("\n") ? "" : "\n"}\n## ${fallbackHeading}\n\n${taskContent}`;
				}
			} else {
				newContent = current ? `${current}\n${taskContent}` : taskContent;
				const lines = newContent.split("\n");
				insertedLine = lines.length - 1;
			}
		}
		await app.vault.modify(file, newContent);
		await this.taskManager.indexFile(file);
		const tasks = this.taskManager.getTasksForFile(file.path);
		
		// Find the task at the inserted line
		let created: Task | undefined;
		if (args.parent && insertedLine >= 0) {
			// For subtasks, find by line number (1-based in task IDs)
			const expectedId = `${file.path}-L${insertedLine + 1}`;
			created = tasks.find(t => t.id === expectedId);
		} else {
			// For regular tasks, use the last task
			created = tasks[tasks.length - 1];
		}
		
		if (!created) throw new Error("Task created in daily note but not found after indexing");
		return created;
	}


	async batchUpdateText(args: BatchUpdateTextArgs): Promise<Task[]> {
		const updatedTasks: Task[] = [];

		for (const taskId of args.taskIds) {
			const task = await this.taskManager.getTaskById(taskId);
			if (!task) continue;

			const newContent = task.content.replace(
				args.findText,
				args.replaceText
			);

			const updated = await this.updateTask({
				taskId,
				updates: { content: newContent },
			});

			if (updated.success && updated.task) {
				updatedTasks.push(updated.task);
			}
		}

		return updatedTasks;
	}

	async batchCreateSubtasks(args: BatchCreateSubtasksArgs): Promise<Task[]> {
		const parentTask = await this.taskManager.getTaskById(args.parentTaskId);
		if (!parentTask) return [];

		const createdTasks: Task[] = [];

		for (const subtaskData of args.subtasks) {
			const subtask = await this.createTask({
				...subtaskData,
				parent: args.parentTaskId,
				filePath: parentTask.filePath,
			});

			if (subtask.success && subtask.task) {
				createdTasks.push(subtask.task);
			}
		}

		return createdTasks;
	}

	async searchTasks(args: SearchTasksArgs): Promise<Task[]> {
		const allTasks = await this.taskManager.getAllTasks();
		const query = args.query.toLowerCase();
		const searchIn = args.searchIn || ["content"];

		let matchedTasks = allTasks.filter((task) => {
			for (const field of searchIn) {
				switch (field) {
					case "content":
						if (task.content.toLowerCase().includes(query)) return true;
						break;
					case "tags":
						if (
							task.metadata.tags.some((tag) =>
								tag.toLowerCase().includes(query)
							)
						)
							return true;
						break;
					case "project":
						if (task.metadata.project?.toLowerCase().includes(query))
							return true;
						if (
							task.metadata.tgProject?.name.toLowerCase().includes(query)
						)
							return true;
						break;
					case "context":
						if (task.metadata.context?.toLowerCase().includes(query))
							return true;
						break;
				}
			}
			return false;
		});

		const limit = args.limit || matchedTasks.length;
		return matchedTasks.slice(0, limit);
	}

	async queryByDate(args: QueryByDateArgs): Promise<Task[]> {
		const allTasks = await this.taskManager.getAllTasks();
		// Parse dates as start and end of day for proper comparison
		const fromDate = args.from ? new Date(args.from + "T00:00:00").getTime() : 0;
		const toDate = args.to
			? new Date(args.to + "T23:59:59.999").getTime()
			: Date.now() + 365 * 24 * 60 * 60 * 1000;

		let filteredTasks = allTasks.filter((task) => {
			let taskDate: number | undefined;

			switch (args.dateType) {
				case "due":
					taskDate = task.metadata.dueDate;
					break;
				case "start":
					taskDate = task.metadata.startDate;
					break;
				case "scheduled":
					taskDate = task.metadata.scheduledDate;
					break;
				case "completed":
					taskDate = task.metadata.completedDate;
					break;
			}

			if (!taskDate) return false;
			return taskDate >= fromDate && taskDate <= toDate;
		});

		filteredTasks.sort((a, b) => {
			const aDate = this.getTaskDateValue(a, args.dateType);
			const bDate = this.getTaskDateValue(b, args.dateType);
			return (aDate || 0) - (bDate || 0);
		});

		const limit = args.limit || filteredTasks.length;
		return filteredTasks.slice(0, limit);
	}

	async queryProjectTasks(project: string): Promise<Task[]> {
		const result = await this.queryTasks({
			filter: { project },
		});
		return result.tasks;
	}

	async queryContextTasks(context: string): Promise<Task[]> {
		const result = await this.queryTasks({
			filter: { context },
		});
		return result.tasks;
	}

	async queryByPriority(priority: number, limit?: number): Promise<Task[]> {
		const result = await this.queryTasks({
			filter: { priority },
			limit,
			sort: { field: "content", order: "asc" },
		});
		return result.tasks;
	}

	private getTaskFieldValue(task: Task, field: keyof Task): any {
		if (field in task) {
			return (task as any)[field];
		}
		if (field in task.metadata) {
			return (task.metadata as any)[field];
		}
		return undefined;
	}

	private getTaskDateValue(
		task: Task,
		dateType: "due" | "start" | "scheduled" | "completed"
	): number | undefined {
		switch (dateType) {
			case "due":
				return task.metadata.dueDate;
			case "start":
				return task.metadata.startDate;
			case "scheduled":
				return task.metadata.scheduledDate;
			case "completed":
				return task.metadata.completedDate;
		}
	}

	private async insertSubtask(
		content: string,
		parentTaskId: string,
		subtaskContent: string
	): Promise<{ content: string; insertedLine: number }> {
		// Get the parent task from TaskManager to find its line number
		const parentTask = await this.taskManager.getTaskById(parentTaskId);
		if (!parentTask) {
			// If parent not found, append to end
			const lines = content.split("\n");
			lines.push(subtaskContent.trim());
			return { content: lines.join("\n"), insertedLine: lines.length - 1 };
		}

		const lines = content.split("\n");
		// Line in task is 1-based, array is 0-based
		const parentLineIndex = parentTask.line - 1;
		
		if (parentLineIndex >= 0 && parentLineIndex < lines.length) {
			const indent = this.getIndent(lines[parentLineIndex]);
			const subtaskIndent = indent + "\t";
			lines.splice(
				parentLineIndex + 1,
				0,
				subtaskIndent + subtaskContent.trim()
			);
			return { content: lines.join("\n"), insertedLine: parentLineIndex + 1 };
		}

		// Fallback: append to end
		lines.push(subtaskContent.trim());
		return { content: lines.join("\n"), insertedLine: lines.length - 1 };
	}

	private async findTaskLineById(
		taskId: string
	): Promise<{ line: number } | null> {
		// Get the task from TaskManager
		const task = await this.taskManager.getTaskById(taskId);
		if (!task) return null;
		
		// Task line is 1-based, return 0-based index for array operations
		return { line: task.line - 1 };
	}

	/** Add a project-tagged task into Quick Capture target (fixed or daily-note) */
	async addProjectTaskToQuickCapture(args: { content: string; project: string; tags?: string[]; priority?: number; dueDate?: string; startDate?: string; context?: string; heading?: string; completed?: boolean; completedDate?: string; }): Promise<{ filePath: string; task?: Task }> {
		const qc = this.plugin.settings.quickCapture;
		if (!qc) throw new Error("Quick Capture settings not found");
		// Build task line with proper metadata formatting
		const checkboxState = args.completed ? "[x]" : "[ ]";
		let line = `- ${checkboxState} ${args.content}`;
		const metadata = this.generateMetadata({
			tags: args.tags,
			project: args.project,
			context: args.context,
			priority: args.priority,
			startDate: args.startDate,
			dueDate: args.dueDate,
			completed: args.completed,
			completedDate: args.completedDate
		});
		if (metadata) {
			line += ` ${metadata}`;
		}
		// Compute target filePath similar to saveCapture
		let filePath: string;
		if (qc.targetType === "daily-note" && qc.dailyNoteSettings) {
			const dateStr = moment().format(qc.dailyNoteSettings.format || "YYYY-MM-DD");
			filePath = (qc.dailyNoteSettings.folder ? `${qc.dailyNoteSettings.folder.replace(/\/$/,"")}/` : "") + `${dateStr}.md`;
		} else {
			filePath = processDateTemplates(qc.targetFile || "Quick Capture.md");
		}
		// Get tasks before adding new one (for comparison)
		const file = this.plugin.app.vault.getFileByPath(filePath) as TFile | null;
		let tasksBeforeCount = 0;
		if (file) {
			await this.taskManager.indexFile(file);
			tasksBeforeCount = this.taskManager.getTasksForFile(file.path).length;
		}
		
		// Persist using shared saver (creates folders/files as needed, handles heading)
		await saveCapture(this.plugin.app, line, {
			targetFile: qc.targetFile,
			appendToFile: qc.appendToFile,
			targetType: qc.targetType,
			targetHeading: args.heading || qc.targetHeading,
			dailyNoteSettings: qc.dailyNoteSettings,
		});
		
		// Try to index and return the created task
		const updatedFile = this.plugin.app.vault.getFileByPath(filePath) as TFile | null;
		if (updatedFile) {
			await this.taskManager.indexFile(updatedFile);
			const tasks = this.taskManager.getTasksForFile(updatedFile.path);
			// Find the newly added task (should be the one that wasn't there before)
			if (tasks.length > tasksBeforeCount) {
				// Return the last new task added
				return { filePath, task: tasks[tasks.length - 1] };
			}
		}
		return { filePath };
	}

	/**
	 * Generate metadata string based on format preference (dataview vs tasks)
	 */
	private generateMetadata(args: {
		tags?: string[];
		project?: string;
		context?: string;
		priority?: number;
		startDate?: string;
		dueDate?: string;
		scheduledDate?: string;
		recurrence?: string;
		completed?: boolean;
		completedDate?: string;
	}): string {
		const metadata: string[] = [];
		const useDataviewFormat = this.plugin.settings.preferMetadataFormat === "dataview";

		// 1. Tags (always use hashtag format for both dataview and tasks)
		if (args.tags?.length) {
			// Always use hashtags format regardless of metadata format preference
			metadata.push(...args.tags.map(tag => `#${tag}`));
		}

		// 2. Project
		if (args.project) {
			if (useDataviewFormat) {
				const projectPrefix = this.plugin.settings.projectTagPrefix?.dataview || "project";
				metadata.push(`[${projectPrefix}:: ${args.project}]`);
			} else {
				const projectPrefix = this.plugin.settings.projectTagPrefix?.tasks || "project";
				metadata.push(`#${projectPrefix}/${args.project}`);
			}
		}

		// 3. Context
		if (args.context) {
			if (useDataviewFormat) {
				const contextPrefix = this.plugin.settings.contextTagPrefix?.dataview || "context";
				metadata.push(`[${contextPrefix}:: ${args.context}]`);
			} else {
				const contextPrefix = this.plugin.settings.contextTagPrefix?.tasks || "@";
				metadata.push(`${contextPrefix}${args.context}`);
			}
		}

		// 4. Priority
		if (args.priority !== undefined && args.priority > 0) {
			if (useDataviewFormat) {
				let priorityValue: string;
				switch (args.priority) {
					case 5: priorityValue = "highest"; break;
					case 4: priorityValue = "high"; break;
					case 3: priorityValue = "medium"; break;
					case 2: priorityValue = "low"; break;
					case 1: priorityValue = "lowest"; break;
					default: priorityValue = String(args.priority);
				}
				metadata.push(`[priority:: ${priorityValue}]`);
			} else {
				let priorityMarker = "";
				switch (args.priority) {
					case 5: priorityMarker = "🔺"; break;
					case 4: priorityMarker = "⏫"; break;
					case 3: priorityMarker = "🔼"; break;
					case 2: priorityMarker = "🔽"; break;
					case 1: priorityMarker = "⏬"; break;
				}
				if (priorityMarker) metadata.push(priorityMarker);
			}
		}

		// 5. Recurrence
		if (args.recurrence) {
			metadata.push(
				useDataviewFormat
					? `[repeat:: ${args.recurrence}]`
					: `🔁 ${args.recurrence}`
			);
		}

		// 6. Start Date
		if (args.startDate) {
			metadata.push(
				useDataviewFormat
					? `[start:: ${args.startDate}]`
					: `🛫 ${args.startDate}`
			);
		}

		// 7. Scheduled Date
		if (args.scheduledDate) {
			metadata.push(
				useDataviewFormat
					? `[scheduled:: ${args.scheduledDate}]`
					: `⏳ ${args.scheduledDate}`
			);
		}

		// 8. Due Date
		if (args.dueDate) {
			metadata.push(
				useDataviewFormat
					? `[due:: ${args.dueDate}]`
					: `📅 ${args.dueDate}`
			);
		}

		// 9. Completion Date (only if completed)
		if (args.completed && args.completedDate) {
			metadata.push(
				useDataviewFormat
					? `[completion:: ${args.completedDate}]`
					: `✅ ${args.completedDate}`
			);
		}

		return metadata.join(" ");
	}

	/** Update a single task status or completion */
	async updateTaskStatus(args: { taskId: string; status?: string; completed?: boolean }): Promise<Task | null> {
		const task = await this.taskManager.getTaskById(args.taskId);
		if (!task) return null;
		const updated: Task = { ...task } as Task;
		if (args.status !== undefined) (updated as any).status = args.status;
		if (args.completed !== undefined) updated.completed = args.completed;
		await this.taskManager.updateTask(updated);
		return await this.taskManager.getTaskById(args.taskId) || null;
	}

	/** Batch update task statuses */
	async batchUpdateTaskStatus(args: { taskIds: string[]; status?: string; completed?: boolean }): Promise<{ updated: string[]; failed: Array<{id:string; error:string}> }> {
		const updated: string[] = [];
		const failed: Array<{id:string; error:string}> = [];
		for (const id of args.taskIds || []) {
			try {
				const res = await this.updateTaskStatus({ taskId: id, status: args.status, completed: args.completed });
				if (res) updated.push(id); else failed.push({ id, error: "Task not found" });
			} catch (e:any) { failed.push({ id, error: e.message||String(e) }); }
		}
		return { updated, failed };
	}

	/** Batch postpone tasks to a new due date (YYYY-MM-DD or relative like +1d/+2w/+1m/+1y) */
	async postponeTasks(args: { taskIds: string[]; newDate: string }): Promise<{ updated: string[]; failed: Array<{id:string; error:string}> }> {
		const ts = this.parseDateOrOffset(args.newDate);
		if (ts === null) throw new Error("Invalid newDate; expected YYYY-MM-DD or +Nd/+Nw/+Nm/+Ny");
		const updated: string[] = [];
		const failed: Array<{id:string; error:string}> = [];
		for (const id of args.taskIds || []) {
			try {
				const task = this.taskManager.getTaskById(id);
				if (!task) { failed.push({id, error:"Task not found"}); continue; }
				const newTask: Task = { ...task, metadata: { ...task.metadata, dueDate: ts } } as Task;
				await this.taskManager.updateTask(newTask);
				updated.push(id);
			} catch(e:any) { failed.push({ id, error: e.message||String(e)}); }
		}
		return { updated, failed };
	}

	private parseDateOrOffset(input: string): number | null {
		// Absolute YYYY-MM-DD
		const abs = Date.parse(input);
		if (!isNaN(abs)) return abs;
		// Relative +Nd/+Nw/+Nm/+Ny
		const m = input.match(/^\+(\d+)([dwmy])$/i);
		if (!m) return null;
		const n = parseInt(m[1], 10);
		const unit = m[2].toLowerCase();
		const base = new Date();
		switch (unit) {
			case 'd': base.setDate(base.getDate() + n); break;
			case 'w': base.setDate(base.getDate() + n * 7); break;
			case 'm': base.setMonth(base.getMonth() + n); break;
			case 'y': base.setFullYear(base.getFullYear() + n); break;
		}
		// Normalize to local midnight for consistency
		base.setHours(0,0,0,0);
		return base.getTime();
	}

	/** List all used tags, projects, and contexts */
	listAllTagsProjectsContexts(): { tags: string[]; projects: string[]; contexts: string[] } {
		const all = this.taskManager.getAllTasks();
		const tags = new Set<string>();
		const projects = new Set<string>();
		const contexts = new Set<string>();
		for (const t of all) {
			for (const tag of t.metadata.tags || []) tags.add(tag);
			if (t.metadata.context) contexts.add(t.metadata.context);
			const proj = (t.metadata.tgProject?.name) || t.metadata.project;
			if (proj) projects.add(proj);
		}
		return { tags: Array.from(tags), projects: Array.from(projects), contexts: Array.from(contexts) };
	}

	/** Helpers to compute date range */
	private periodRange(period: 'day'|'month'|'year', base: string): { from: string; to: string } {
		const d = new Date(base);
		if (period === 'day') {
			// For a single day, use the same date for both from and to
			const dateStr = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0,10);
			return { from: dateStr, to: dateStr };
		}
		if (period === 'month') {
			const from = new Date(d.getFullYear(), d.getMonth(), 1);
			const to = new Date(d.getFullYear(), d.getMonth()+1, 0);
			return { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10) };
		}
		const from = new Date(d.getFullYear(), 0, 1);
		const to = new Date(d.getFullYear(), 11, 31);
		return { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10) };
	}

	async listTasksForPeriod(args: { period: 'day'|'month'|'year'; date: string; dateType?: 'due'|'start'|'scheduled'|'completed'; limit?: number }): Promise<Task[]> {
		const { from, to } = this.periodRange(args.period, args.date);
		return this.queryByDate({ dateType: args.dateType||'due', from, to, limit: args.limit });
	}

	async listTasksInRange(args: { from: string; to: string; dateType?: 'due'|'start'|'scheduled'|'completed'; limit?: number }): Promise<Task[]> {
		return this.queryByDate({ dateType: args.dateType||'due', from: args.from, to: args.to, limit: args.limit });
	}

	private getIndent(line: string): string {
		const match = line.match(/^(\s*)/);
		return match ? match[1] : "";
	}

	/** Batch create multiple tasks */
	async batchCreateTasks(args: BatchCreateTasksArgs): Promise<{ success: boolean; created: number; errors: string[] }> {
		const results = {
			success: true,
			created: 0,
			errors: [] as string[]
		};

		for (let i = 0; i < args.tasks.length; i++) {
			const task = args.tasks[i];
			try {
				// Use defaultFilePath if task doesn't specify filePath
				const taskArgs: CreateTaskArgs = {
					...task,
					filePath: task.filePath || args.defaultFilePath
				};
				
				const result = await this.createTask(taskArgs);
				if (result.success) {
					results.created++;
				} else {
					results.errors.push(`Task ${i + 1}: ${result.message || 'Failed to create'}`);
				}
			} catch (error: any) {
				results.success = false;
				results.errors.push(`Task ${i + 1}: ${error.message}`);
			}
		}

		return results;
	}
}