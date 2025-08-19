/**
 * WriteAPI - Handles all write operations in the Dataflow architecture
 * 
 * This API provides methods for creating, updating, and deleting tasks
 * by directly modifying vault files. Changes trigger ObsidianSource events
 * which automatically update the index through the Orchestrator.
 */

import { App, TFile, Vault, MetadataCache, moment } from "obsidian";
import { Task } from "../../types/task";
import TaskProgressBarPlugin from "../../index";
import {
	createDailyNote,
	getAllDailyNotes,
	getDailyNote,
	appHasDailyNotesPluginLoaded,
	getDailyNoteSettings,
} from "obsidian-daily-notes-interface";
import { saveCapture, processDateTemplates } from "../../utils/file/file-operations";
import { Events, emit } from "../events/Events";

/**
 * Arguments for creating a task
 */
export interface CreateTaskArgs {
	content: string;
	filePath?: string;
	parent?: string;
	tags?: string[];
	project?: string;
	context?: string;
	priority?: number;
	startDate?: string;
	dueDate?: string;
	completed?: boolean;
	completedDate?: string;
}

/**
 * Arguments for updating a task
 */
export interface UpdateTaskArgs {
	taskId: string;
	updates: Partial<Task>;
}

/**
 * Arguments for deleting a task
 */
export interface DeleteTaskArgs {
	taskId: string;
}

/**
 * Arguments for batch text update
 */
export interface BatchUpdateTextArgs {
	taskIds: string[];
	findText: string;
	replaceText: string;
}

/**
 * Arguments for batch subtask creation
 */
export interface BatchCreateSubtasksArgs {
	parentTaskId: string;
	subtasks: Array<{
		content: string;
		priority?: number;
		dueDate?: string;
	}>;
}

export class WriteAPI {
	constructor(
		private app: App,
		private vault: Vault,
		private metadataCache: MetadataCache,
		private plugin: TaskProgressBarPlugin,
		private getTaskById: (id: string) => Task | null
	) {}

	/**
	 * Update a task's status or completion state
	 */
	async updateTaskStatus(args: {
		taskId: string;
		status?: string;
		completed?: boolean;
	}): Promise<{ success: boolean; task?: Task; error?: string }> {
		try {
			const task = this.getTaskById(args.taskId);
			if (!task) {
				return { success: false, error: "Task not found" };
			}

			const file = this.vault.getAbstractFileByPath(task.filePath) as TFile;
			if (!file) {
				return { success: false, error: "File not found" };
			}

			const content = await this.vault.read(file);
			const lines = content.split("\n");

			if (task.line < 0 || task.line >= lines.length) {
				return { success: false, error: "Invalid line number" };
			}

			let taskLine = lines[task.line];

			// Update status or completion
			if (args.status !== undefined) {
				taskLine = taskLine.replace(
					/(\s*[-*+]\s*\[)[^\]]*(\]\s*)/,
					`$1${args.status}$2`
				);
			} else if (args.completed !== undefined) {
				const statusMark = args.completed ? "x" : " ";
				taskLine = taskLine.replace(
					/(\s*[-*+]\s*\[)[^\]]*(\]\s*)/,
					`$1${statusMark}$2`
				);

				// Add completion date if completing
				if (args.completed && !task.metadata.completedDate) {
					const completionDate = moment().format("YYYY-MM-DD");
					const useDataviewFormat = this.plugin.settings.preferMetadataFormat === "dataview";
					const completionMeta = useDataviewFormat
						? `[completion:: ${completionDate}]`
						: `✅ ${completionDate}`;
					taskLine = `${taskLine} ${completionMeta}`;
				}
			}

			lines[task.line] = taskLine;
			
			// Notify about write operation
			emit(this.app, Events.WRITE_OPERATION_START, { path: file.path, taskId: args.taskId });
			await this.vault.modify(file, lines.join("\n"));
			emit(this.app, Events.WRITE_OPERATION_COMPLETE, { path: file.path, taskId: args.taskId });

			return { success: true };
		} catch (error) {
			console.error("WriteAPI: Error updating task status:", error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Update a task with new properties
	 */
	async updateTask(args: UpdateTaskArgs): Promise<{ success: boolean; task?: Task; error?: string }> {
		try {
			const originalTask = this.getTaskById(args.taskId);
			if (!originalTask) {
				return { success: false, error: "Task not found" };
			}

			const file = this.vault.getAbstractFileByPath(originalTask.filePath) as TFile;
			if (!file) {
				return { success: false, error: "File not found" };
			}

			const content = await this.vault.read(file);
			const lines = content.split("\n");

			if (originalTask.line < 0 || originalTask.line >= lines.length) {
				return { success: false, error: "Invalid line number" };
			}

			const updatedTask = { ...originalTask, ...args.updates };
			let taskLine = lines[originalTask.line];

			// Update checkbox status
			if (args.updates.completed !== undefined) {
				const statusMark = args.updates.completed ? "x" : " ";
				taskLine = taskLine.replace(
					/(\s*[-*+]\s*\[)[^\]]*(\]\s*)/,
					`$1${statusMark}$2`
				);
			}

			// Update content if changed
			if (args.updates.content && args.updates.content !== originalTask.content) {
				// Extract the task prefix and metadata
				const prefixMatch = taskLine.match(/^(\s*[-*+]\s*\[[^\]]*\]\s*)/);
				if (prefixMatch) {
					const prefix = prefixMatch[1];
					// Find where metadata starts (look for emoji markers or dataview fields)
					const metadataMatch = taskLine.match(/([\s]+(🔺|⏫|🔼|🔽|⏬|🛫|⏳|📅|✅|🔁|\[[\w]+::|#|@|\+).*)?$/);
					const metadata = metadataMatch ? metadataMatch[0] : "";
					taskLine = `${prefix}${args.updates.content}${metadata}`;
				}
			}

			// Update metadata if changed
			if (args.updates.metadata) {
				// Remove existing metadata and regenerate
				const prefixMatch = taskLine.match(/^(\s*[-*+]\s*\[[^\]]*\]\s*[^🔺⏫🔼🔽⏬🛫⏳📅✅🔁\[#@+]*)/);
				if (prefixMatch) {
					const taskPrefix = prefixMatch[0];
					const newMetadata = this.generateMetadata({
						...originalTask.metadata,
						...args.updates.metadata,
					});
					taskLine = `${taskPrefix}${newMetadata ? ` ${newMetadata}` : ""}`;
				}
			}

			lines[originalTask.line] = taskLine;
			
			// Notify about write operation
			emit(this.app, Events.WRITE_OPERATION_START, { path: file.path, taskId: args.taskId });
			await this.vault.modify(file, lines.join("\n"));
			emit(this.app, Events.WRITE_OPERATION_COMPLETE, { path: file.path, taskId: args.taskId });

			return { success: true };
		} catch (error) {
			console.error("WriteAPI: Error updating task:", error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Create a new task
	 */
	async createTask(args: CreateTaskArgs): Promise<{ success: boolean; task?: Task; error?: string }> {
		try {
			let filePath = args.filePath;

			if (!filePath) {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					filePath = activeFile.path;
				} else {
					return { success: false, error: "No filePath provided and no active file" };
				}
			}

			// Build task content
			const checkboxState = args.completed ? "[x]" : "[ ]";
			let taskContent = `- ${checkboxState} ${args.content}`;
			const metadata = this.generateMetadata({
				tags: args.tags,
				project: args.project,
				context: args.context,
				priority: args.priority,
				startDate: args.startDate ? moment(args.startDate).valueOf() : undefined,
				dueDate: args.dueDate ? moment(args.dueDate).valueOf() : undefined,
				completed: args.completed,
				completedDate: args.completedDate ? moment(args.completedDate).valueOf() : undefined,
			});
			if (metadata) {
				taskContent += ` ${metadata}`;
			}

			// Ensure file exists
			let file = this.vault.getAbstractFileByPath(filePath) as TFile | null;
			if (!file) {
				// Create directory structure if needed
				const parts = filePath.split("/");
				if (parts.length > 1) {
					const dir = parts.slice(0, -1).join("/");
					try {
						await this.vault.createFolder(dir);
					} catch {
						// Ignore if exists
					}
				}
				// Create file
				file = await this.vault.create(filePath, `${taskContent}\n`);
			} else {
				// Append to existing file or insert as subtask
				const content = await this.vault.read(file);
				const newContent = args.parent
					? this.insertSubtask(content, args.parent, taskContent)
					: (content ? content + "\n" : "") + taskContent;
				
				// Notify about write operation
				emit(this.app, Events.WRITE_OPERATION_START, { path: file.path });
				await this.vault.modify(file, newContent);
				emit(this.app, Events.WRITE_OPERATION_COMPLETE, { path: file.path });
			}

			return { success: true };
		} catch (error) {
			console.error("WriteAPI: Error creating task:", error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Delete a task
	 */
	async deleteTask(args: DeleteTaskArgs): Promise<{ success: boolean; error?: string }> {
		try {
			const task = this.getTaskById(args.taskId);
			if (!task) {
				return { success: false, error: "Task not found" };
			}

			const file = this.vault.getAbstractFileByPath(task.filePath) as TFile;
			if (!file) {
				return { success: false, error: "File not found" };
			}

			const content = await this.vault.read(file);
			const lines = content.split("\n");

			if (task.line >= 0 && task.line < lines.length) {
				lines.splice(task.line, 1);
				
				// Notify about write operation
				emit(this.app, Events.WRITE_OPERATION_START, { path: file.path, taskId: args.taskId });
				await this.vault.modify(file, lines.join("\n"));
				emit(this.app, Events.WRITE_OPERATION_COMPLETE, { path: file.path, taskId: args.taskId });
				return { success: true };
			}

			return { success: false, error: "Invalid line number" };
		} catch (error) {
			console.error("WriteAPI: Error deleting task:", error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Batch update task statuses
	 */
	async batchUpdateTaskStatus(args: {
		taskIds: string[];
		status?: string;
		completed?: boolean;
	}): Promise<{ updated: string[]; failed: Array<{ id: string; error: string }> }> {
		const updated: string[] = [];
		const failed: Array<{ id: string; error: string }> = [];

		for (const taskId of args.taskIds) {
			const result = await this.updateTaskStatus({
				taskId,
				status: args.status,
				completed: args.completed,
			});

			if (result.success) {
				updated.push(taskId);
			} else {
				failed.push({ id: taskId, error: result.error || "Unknown error" });
			}
		}

		return { updated, failed };
	}

	/**
	 * Postpone tasks to a new date
	 */
	async postponeTasks(args: {
		taskIds: string[];
		newDate: string;
	}): Promise<{ updated: string[]; failed: Array<{ id: string; error: string }> }> {
		const updated: string[] = [];
		const failed: Array<{ id: string; error: string }> = [];

		const newDateMs = this.parseDateOrOffset(args.newDate);
		if (newDateMs === null) {
			return {
				updated: [],
				failed: args.taskIds.map(id => ({ id, error: "Invalid date format" })),
			};
		}

		for (const taskId of args.taskIds) {
			const result = await this.updateTask({
				taskId,
				updates: {
					metadata: {
						dueDate: newDateMs,
					} as any,
				},
			});

			if (result.success) {
				updated.push(taskId);
			} else {
				failed.push({ id: taskId, error: result.error || "Unknown error" });
			}
		}

		return { updated, failed };
	}

	/**
	 * Batch update text in tasks
	 */
	async batchUpdateText(args: BatchUpdateTextArgs): Promise<{ tasks: Task[] }> {
		const updatedTasks: Task[] = [];

		for (const taskId of args.taskIds) {
			const task = this.getTaskById(taskId);
			if (!task) continue;

			const newContent = task.content.replace(args.findText, args.replaceText);
			const result = await this.updateTask({
				taskId,
				updates: { content: newContent },
			});

			if (result.success) {
				const updatedTask = this.getTaskById(taskId);
				if (updatedTask) {
					updatedTasks.push(updatedTask);
				}
			}
		}

		return { tasks: updatedTasks };
	}

	/**
	 * Batch create subtasks
	 */
	async batchCreateSubtasks(args: BatchCreateSubtasksArgs): Promise<{ tasks: Task[] }> {
		const parentTask = this.getTaskById(args.parentTaskId);
		if (!parentTask) {
			return { tasks: [] };
		}

		const createdTasks: Task[] = [];

		for (const subtaskData of args.subtasks) {
			const result = await this.createTask({
				...subtaskData,
				parent: args.parentTaskId,
				filePath: parentTask.filePath,
			});

			if (result.success && result.task) {
				createdTasks.push(result.task);
			}
		}

		return { tasks: createdTasks };
	}

	/**
	 * Create a task in today's daily note
	 */
	async createTaskInDailyNote(args: CreateTaskArgs & { heading?: string }): Promise<{ success: boolean; task?: Task; error?: string }> {
		try {
			// Try using Daily Notes plugin if available
			let dailyNoteFile: TFile | null = null;
			
			if (appHasDailyNotesPluginLoaded()) {
				const date = moment().set("hour", 12);
				const existing = getDailyNote(date, getAllDailyNotes());
				if (existing) {
					dailyNoteFile = existing;
				} else {
					dailyNoteFile = await createDailyNote(date);
				}
			}

			if (!dailyNoteFile) {
				// Fallback: compute path manually
				const qc = this.plugin.settings.quickCapture;
				let folder = qc?.dailyNoteSettings?.folder || "";
				const format = qc?.dailyNoteSettings?.format || "YYYY-MM-DD";
				if (!folder) {
					try {
						folder = getDailyNoteSettings().folder || "";
					} catch {
						// Ignore
					}
				}
				const dateStr = moment().format(format);
				const path = folder ? `${folder}/${dateStr}.md` : `${dateStr}.md`;

				// Ensure folders
				const parts = path.split("/");
				if (parts.length > 1) {
					const dir = parts.slice(0, -1).join("/");
					try {
						await this.vault.createFolder(dir);
					} catch {
						// Ignore if exists
					}
				}

				// Create file if not exists
				let file = this.vault.getAbstractFileByPath(path) as TFile | null;
				if (!file) {
					file = await this.vault.create(path, "");
				}
				dailyNoteFile = file;
			}

			// Build task content
			const checkboxState = args.completed ? "[x]" : "[ ]";
			let taskContent = `- ${checkboxState} ${args.content}`;
			const metadata = this.generateMetadata({
				tags: args.tags,
				project: args.project,
				context: args.context,
				priority: args.priority,
				startDate: args.startDate ? moment(args.startDate).valueOf() : undefined,
				dueDate: args.dueDate ? moment(args.dueDate).valueOf() : undefined,
				completed: args.completed,
				completedDate: args.completedDate ? moment(args.completedDate).valueOf() : undefined,
			});
			if (metadata) {
				taskContent += ` ${metadata}`;
			}

			// Append under optional heading
			const file = dailyNoteFile;
			const current = await this.vault.read(file);
			let newContent = current;

			if (args.parent) {
				newContent = this.insertSubtask(current, args.parent, taskContent);
			} else {
				// Use heading from Quick Capture settings if available
				const fallbackHeading = args.heading || this.plugin.settings.quickCapture?.targetHeading?.trim();
				if (fallbackHeading) {
					const headingRegex = new RegExp(
						`^#{1,6}\\s+${fallbackHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
						"m"
					);
					if (headingRegex.test(current)) {
						newContent = current.replace(headingRegex, `$&\n\n${taskContent}`);
					} else {
						newContent = `${current}${current.endsWith("\n") ? "" : "\n"}\n## ${fallbackHeading}\n\n${taskContent}`;
					}
				} else {
					newContent = current ? `${current}\n${taskContent}` : taskContent;
				}
			}

			// Notify about write operation
			emit(this.app, Events.WRITE_OPERATION_START, { path: file.path });
			await this.vault.modify(file, newContent);
			emit(this.app, Events.WRITE_OPERATION_COMPLETE, { path: file.path });
			return { success: true };
		} catch (error) {
			console.error("WriteAPI: Error creating task in daily note:", error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Add a project task to quick capture
	 */
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
	}): Promise<{ filePath: string; success: boolean }> {
		try {
			const qc = this.plugin.settings.quickCapture;
			if (!qc) {
				throw new Error("Quick Capture settings not found");
			}

			// Build task line
			const checkboxState = args.completed ? "[x]" : "[ ]";
			let line = `- ${checkboxState} ${args.content}`;
			const metadata = this.generateMetadata({
				tags: args.tags,
				project: args.project,
				context: args.context,
				priority: args.priority,
				startDate: args.startDate ? moment(args.startDate).valueOf() : undefined,
				dueDate: args.dueDate ? moment(args.dueDate).valueOf() : undefined,
				completed: args.completed,
				completedDate: args.completedDate ? moment(args.completedDate).valueOf() : undefined,
			});
			if (metadata) {
				line += ` ${metadata}`;
			}

			// Compute target filePath
			let filePath: string;
			if (qc.targetType === "daily-note" && qc.dailyNoteSettings) {
				const dateStr = moment().format(qc.dailyNoteSettings.format || "YYYY-MM-DD");
				filePath = (qc.dailyNoteSettings.folder ? `${qc.dailyNoteSettings.folder.replace(/\/$/, "")}/` : "") + `${dateStr}.md`;
			} else {
				filePath = processDateTemplates(qc.targetFile || "Quick Capture.md");
			}

			// Save using shared saver
			await saveCapture(this.app, line, {
				targetFile: qc.targetFile,
				appendToFile: qc.appendToFile,
				targetType: qc.targetType,
				targetHeading: args.heading || qc.targetHeading,
				dailyNoteSettings: qc.dailyNoteSettings,
			});

			return { filePath, success: true };
		} catch (error) {
			console.error("WriteAPI: Error adding project task to quick capture:", error);
			return { filePath: "", success: false };
		}
	}

	/**
	 * Generate metadata string based on format preference
	 */
	private generateMetadata(args: {
		tags?: string[];
		project?: string;
		context?: string;
		priority?: number;
		startDate?: number;
		dueDate?: number;
		scheduledDate?: number;
		recurrence?: string;
		completed?: boolean;
		completedDate?: number;
	}): string {
		const metadata: string[] = [];
		const useDataviewFormat = this.plugin.settings.preferMetadataFormat === "dataview";

		// Tags
		if (args.tags?.length) {
			if (useDataviewFormat) {
				metadata.push(`[tags:: ${args.tags.join(", ")}]`);
			} else {
				metadata.push(...args.tags.map(tag => `#${tag}`));
			}
		}

		// Project
		if (args.project) {
			if (useDataviewFormat) {
				const projectPrefix = this.plugin.settings.projectTagPrefix?.dataview || "project";
				metadata.push(`[${projectPrefix}:: ${args.project}]`);
			} else {
				const projectPrefix = this.plugin.settings.projectTagPrefix?.tasks || "project";
				metadata.push(`#${projectPrefix}/${args.project}`);
			}
		}

		// Context
		if (args.context) {
			if (useDataviewFormat) {
				const contextPrefix = this.plugin.settings.contextTagPrefix?.dataview || "context";
				metadata.push(`[${contextPrefix}:: ${args.context}]`);
			} else {
				const contextPrefix = this.plugin.settings.contextTagPrefix?.tasks || "@";
				metadata.push(`${contextPrefix}${args.context}`);
			}
		}

		// Priority
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

		// Recurrence
		if (args.recurrence) {
			metadata.push(
				useDataviewFormat
					? `[repeat:: ${args.recurrence}]`
					: `🔁 ${args.recurrence}`
			);
		}

		// Start Date
		if (args.startDate) {
			const dateStr = moment(args.startDate).format("YYYY-MM-DD");
			metadata.push(
				useDataviewFormat
					? `[start:: ${dateStr}]`
					: `🛫 ${dateStr}`
			);
		}

		// Scheduled Date
		if (args.scheduledDate) {
			const dateStr = moment(args.scheduledDate).format("YYYY-MM-DD");
			metadata.push(
				useDataviewFormat
					? `[scheduled:: ${dateStr}]`
					: `⏳ ${dateStr}`
			);
		}

		// Due Date
		if (args.dueDate) {
			const dateStr = moment(args.dueDate).format("YYYY-MM-DD");
			metadata.push(
				useDataviewFormat
					? `[due:: ${dateStr}]`
					: `📅 ${dateStr}`
			);
		}

		// Completion Date
		if (args.completed && args.completedDate) {
			const dateStr = moment(args.completedDate).format("YYYY-MM-DD");
			metadata.push(
				useDataviewFormat
					? `[completion:: ${dateStr}]`
					: `✅ ${dateStr}`
			);
		}

		return metadata.join(" ");
	}

	/**
	 * Insert a subtask under a parent task
	 */
	private insertSubtask(content: string, parentTaskId: string, subtaskContent: string): string {
		const lines = content.split("\n");
		const parentTask = this.findTaskLineById(lines, parentTaskId);

		if (parentTask) {
			const indent = this.getIndent(lines[parentTask.line]);
			const subtaskIndent = indent + "\t";
			lines.splice(parentTask.line + 1, 0, subtaskIndent + subtaskContent.trim());
		}

		return lines.join("\n");
	}

	/**
	 * Find task line by ID
	 */
	private findTaskLineById(lines: string[], taskId: string): { line: number } | null {
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes(taskId)) {
				return { line: i };
			}
		}
		return null;
	}

	/**
	 * Get indentation of a line
	 */
	private getIndent(line: string): string {
		const match = line.match(/^(\s*)/);
		return match ? match[1] : "";
	}

	/**
	 * Parse date or relative offset
	 */
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
			case "d": base.setDate(base.getDate() + n); break;
			case "w": base.setDate(base.getDate() + n * 7); break;
			case "m": base.setMonth(base.getMonth() + n); break;
			case "y": base.setFullYear(base.getFullYear() + n); break;
		}

		// Normalize to local midnight
		base.setHours(0, 0, 0, 0);
		return base.getTime();
	}
}