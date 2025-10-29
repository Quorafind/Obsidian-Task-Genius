/**
 * WriteAPI - Handles all write operations in the Dataflow architecture
 *
 * This API provides methods for creating, updating, and deleting tasks
 * by directly modifying vault files. Changes trigger ObsidianSource events
 * which automatically update the index through the Orchestrator.
 */

import { App, TFile, Vault, MetadataCache, moment } from "obsidian";
import { Task, CanvasTaskMetadata } from "@/types/task";
import TaskProgressBarPlugin from "@/index";
import {
	createDailyNote,
	getAllDailyNotes,
	getDailyNote,
	appHasDailyNotesPluginLoaded,
	getDailyNoteSettings,
} from "obsidian-daily-notes-interface";
import {
	saveCapture,
	processDateTemplates,
} from "@/utils/file/file-operations";
import { Events, emit } from "../events/Events";
import { CanvasTaskUpdater } from "@/parsers/canvas-task-updater";
import { rrulestr } from "rrule";
import { EMOJI_TAG_REGEX, TOKEN_CONTEXT_REGEX } from "@/common/regex-define";
import { BulkOperationResult } from "@/types/selection";

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
	deleteChildren?: boolean;
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
	canvasTaskUpdater: CanvasTaskUpdater;
	private writeQueue: Promise<void>;

	constructor(
		private app: App,
		private vault: Vault,
		private metadataCache: MetadataCache,
		private plugin: TaskProgressBarPlugin,
		private getTaskById: (id: string) => Promise<Task | null> | Task | null,
	) {
		this.canvasTaskUpdater = new CanvasTaskUpdater(vault, plugin);
		this.writeQueue = Promise.resolve();
	}

	private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
		const run = this.writeQueue
			.catch(() => undefined)
			.then(operation);

		this.writeQueue = run.then(
			() => undefined,
			() => undefined,
		);

		return run;
	}

	/**
	 * Update a task's status or completion state
	 */
	async updateTaskStatus(args: {
		taskId: string;
		status?: string;
		completed?: boolean;
	}): Promise<{ success: boolean; task?: Task; error?: string }> {
		return this.enqueueWrite(() =>
			this.performUpdateTaskStatus(args),
		);
	}

	private async performUpdateTaskStatus(args: {
		taskId: string;
		status?: string;
		completed?: boolean;
	}): Promise<{ success: boolean; task?: Task; error?: string }> {
		try {
			const task = await Promise.resolve(this.getTaskById(args.taskId));
			if (!task) {
				return { success: false, error: "Task not found" };
			}

			// Check if this is a Canvas task
			if (CanvasTaskUpdater.isCanvasTask(task)) {
				return this.updateCanvasTask({
					taskId: args.taskId,
					updates: {
						status: args.status,
						completed: args.completed,
					},
				});
			}

			const file = this.vault.getAbstractFileByPath(
				task.filePath,
			) as TFile;
			if (!file) {
				return { success: false, error: "File not found" };
			}

			const content = await this.vault.read(file);
			const lines = content.split("\n");

			if (task.line < 0 || task.line >= lines.length) {
				return { success: false, error: "Invalid line number" };
			}

			let taskLine = lines[task.line];

			// Update status or completion (support both status symbol and completed boolean)
			const configuredCompleted = (
				this.plugin.settings.taskStatuses?.completed || "x"
			).split("|")[0];
			const willComplete =
				args.completed === true ||
				(args.status !== undefined &&
					((typeof (args.status as any).toLowerCase === "function" &&
						(args.status as any).toLowerCase() === "x") ||
						args.status === configuredCompleted));
			// Determine mark to write to checkbox
			const markToWrite =
				args.status !== undefined
					? (args.status as string)
					: willComplete
						? "x"
						: " ";
			taskLine = taskLine.replace(
				/(\s*[-*+]\s*\[)[^\]]*(\]\s*)/,
				`$1${markToWrite}$2`,
			);
			// Handle date writing based on status changes
			const previousMark = task.status || " ";
			const isCompleting = willComplete && !task.completed;
			const isAbandoning = markToWrite === "-" && previousMark !== "-";
			const isStarting =
				(markToWrite === ">" || markToWrite === "/") &&
				(previousMark === " " || previousMark === "?");

			// Add completion date if completing and not already present
			if (isCompleting) {
				const hasCompletionMeta = /(\[completion::|✅)/.test(taskLine);
				if (!hasCompletionMeta) {
					const completionDate = moment().format("YYYY-MM-DD");
					const useDataviewFormat =
						this.plugin.settings.preferMetadataFormat ===
						"dataview";
					const completionMeta = useDataviewFormat
						? `[completion:: ${completionDate}]`
						: `✅ ${completionDate}`;
					taskLine = this.insertDateAtCorrectPosition(
						taskLine,
						completionMeta,
						"completed",
					);
				}
			}

			// Add cancelled date if abandoning
			if (
				isAbandoning &&
				this.plugin.settings.autoDateManager?.manageCancelledDate
			) {
				const hasCancelledMeta = /(\[cancelled::|❌)/.test(taskLine);
				if (!hasCancelledMeta) {
					const cancelledDate = moment().format("YYYY-MM-DD");
					const useDataviewFormat =
						this.plugin.settings.preferMetadataFormat ===
						"dataview";
					const cancelledMeta = useDataviewFormat
						? `[cancelled:: ${cancelledDate}]`
						: `❌ ${cancelledDate}`;
					taskLine = this.insertDateAtCorrectPosition(
						taskLine,
						cancelledMeta,
						"cancelled",
					);
				}
			}

			// Add start date if starting
			if (
				isStarting &&
				this.plugin.settings.autoDateManager?.manageStartDate
			) {
				const hasStartMeta = /(\[start::|🛫|🚀)/.test(taskLine);
				if (!hasStartMeta) {
					const startDate = moment().format("YYYY-MM-DD");
					const useDataviewFormat =
						this.plugin.settings.preferMetadataFormat ===
						"dataview";
					const startMeta = useDataviewFormat
						? `[start:: ${startDate}]`
						: `🛫 ${startDate}`;
					taskLine = this.insertDateAtCorrectPosition(
						taskLine,
						startMeta,
						"start",
					);
				}
			}

			lines[task.line] = taskLine;

			// If completing a recurring task, insert the next occurrence right after
			const isCompletingRecurringTask =
				willComplete && !task.completed && task.metadata?.recurrence;
			if (isCompletingRecurringTask) {
				try {
					const indentMatch = taskLine.match(/^(\s*)/);
					const indentation = indentMatch ? indentMatch[0] : "";
					const newTaskLine = this.createRecurringTask(
						{
							...task,
							completed: true,
							metadata: {
								...task.metadata,
								completedDate: Date.now(),
							},
						} as Task,
						indentation,
					);
					lines.splice(task.line + 1, 0, newTaskLine);
				} catch (e) {
					console.error(
						"WriteAPI: failed to create next recurring task from updateTaskStatus:",
						e,
					);
				}
			}

			// Notify about write operation
			emit(this.app, Events.WRITE_OPERATION_START, {
				path: file.path,
				taskId: args.taskId,
			});
			await this.vault.modify(file, lines.join("\n"));
			emit(this.app, Events.WRITE_OPERATION_COMPLETE, {
				path: file.path,
				taskId: args.taskId,
			});

			// Trigger task-completed event if task was just completed
			if (args.completed === true && !task.completed) {
				const updatedTask = { ...task, completed: true };
				this.app.workspace.trigger(
					"task-genius:task-completed",
					updatedTask,
				);
			}

			return { success: true };
		} catch (error) {
			console.error("WriteAPI: Error updating task status:", error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Update a task with new properties
	 */
	async updateTask(
		args: UpdateTaskArgs,
	): Promise<{ success: boolean; task?: Task; error?: string }> {
		return this.enqueueWrite(() => this.performUpdateTask(args));
	}

	private async performUpdateTask(
		args: UpdateTaskArgs,
	): Promise<{ success: boolean; task?: Task; error?: string }> {
		try {
			const originalTask = await Promise.resolve(
				this.getTaskById(args.taskId),
			);
			if (!originalTask) {
				return { success: false, error: "Task not found" };
			}

			// Check if this is a Canvas task
			if (CanvasTaskUpdater.isCanvasTask(originalTask)) {
				return this.updateCanvasTask(args);
			}

			// Handle FileSource (file-level) tasks differently
			const isFileSourceTask =
				(originalTask as any)?.metadata?.source === "file-source" ||
				originalTask.id.startsWith("file-source:");
			if (isFileSourceTask) {
				return this.updateFileSourceTask(
					originalTask,
					args.updates,
					args.taskId,
				);
			}

			const file = this.vault.getAbstractFileByPath(
				originalTask.filePath,
			) as TFile;
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

			// Track previous status for date management
			const previousStatus = originalTask.status || " ";
			let newStatus = previousStatus;

			// Update checkbox status or status mark
			if (args.updates.status !== undefined) {
				// Prefer explicit status mark if provided
				const statusMark = args.updates.status as string;
				newStatus = statusMark;
				taskLine = taskLine.replace(
					/(\s*[-*+]\s*\[)[^\]]*(\]\s*)/,
					`$1${statusMark}$2`,
				);
			} else if (args.updates.completed !== undefined) {
				// Fallback to setting based on completed boolean
				const statusMark = args.updates.completed ? "x" : " ";
				newStatus = statusMark;
				taskLine = taskLine.replace(
					/(\s*[-*+]\s*\[)[^\]]*(\]\s*)/,
					`$1${statusMark}$2`,
				);
			}

			// Handle date writing based on status changes
			const configuredCompleted = (
				this.plugin.settings.taskStatuses?.completed || "x"
			).split("|")[0];
			const isCompleting =
				(newStatus === "x" || newStatus === configuredCompleted) &&
				previousStatus !== "x" &&
				previousStatus !== configuredCompleted;
			const isAbandoning = newStatus === "-" && previousStatus !== "-";
			const isStarting =
				(newStatus === ">" || newStatus === "/") &&
				(previousStatus === " " || previousStatus === "?");

			// Add completion date if completing
			if (isCompleting && !args.updates.metadata?.completedDate) {
				const hasCompletionMeta = /(\[completion::|✅)/.test(taskLine);
				if (!hasCompletionMeta) {
					const completionDate = moment().format("YYYY-MM-DD");
					const useDataviewFormat =
						this.plugin.settings.preferMetadataFormat ===
						"dataview";
					const completionMeta = useDataviewFormat
						? `[completion:: ${completionDate}]`
						: `✅ ${completionDate}`;
					taskLine = this.insertDateAtCorrectPosition(
						taskLine,
						completionMeta,
						"completed",
					);
				}
			}

			// Add cancelled date if abandoning
			if (
				isAbandoning &&
				this.plugin.settings.autoDateManager?.manageCancelledDate
			) {
				const hasCancelledMeta = /(\[cancelled::|❌)/.test(taskLine);
				if (!hasCancelledMeta) {
					const cancelledDate = moment().format("YYYY-MM-DD");
					const useDataviewFormat =
						this.plugin.settings.preferMetadataFormat ===
						"dataview";
					const cancelledMeta = useDataviewFormat
						? `[cancelled:: ${cancelledDate}]`
						: `❌ ${cancelledDate}`;
					taskLine = this.insertDateAtCorrectPosition(
						taskLine,
						cancelledMeta,
						"cancelled",
					);
				}
			}

			// Add start date if starting
			if (
				isStarting &&
				this.plugin.settings.autoDateManager?.manageStartDate
			) {
				const hasStartMeta = /(\[start::|🛫|🚀)/.test(taskLine);
				if (!hasStartMeta) {
					const startDate = moment().format("YYYY-MM-DD");
					const useDataviewFormat =
						this.plugin.settings.preferMetadataFormat ===
						"dataview";
					const startMeta = useDataviewFormat
						? `[start:: ${startDate}]`
						: `🛫 ${startDate}`;
					taskLine = this.insertDateAtCorrectPosition(
						taskLine,
						startMeta,
						"start",
					);
				}
			}

			// Update content if changed (but prevent clearing content)
			if (
				args.updates.content !== undefined &&
				args.updates.content !== ""
			) {
				// Extract the task prefix and metadata
				const prefixMatch = taskLine.match(
					/^(\s*[-*+]\s*\[[^\]]*\]\s*)/,
				);
				if (prefixMatch) {
					const prefix = prefixMatch[1];
					// Preserve trailing metadata (strict: trailing-only, recognized keys; links/code sanitized)
					const afterPrefix = taskLine.substring(prefix.length);
					const sanitized2 = afterPrefix
						.replace(/\[\[[^\]]*\]\]/g, (m) => "x".repeat(m.length))
						.replace(/\[[^\]]*\]\([^\)]*\)/g, (m) =>
							"x".repeat(m.length),
						)
						.replace(/`[^`]*`/g, (m) => "x".repeat(m.length));
					const esc2 = (s: string) =>
						s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					const projectKey2 =
						this.plugin.settings.projectTagPrefix?.dataview ||
						"project";
					const contextKey2 =
						this.plugin.settings.contextTagPrefix?.dataview ||
						"context";
					const dvKeysGroup2 = [
						"tags",
						esc2(projectKey2),
						esc2(contextKey2),
						"priority",
						"repeat",
						"start",
						"scheduled",
						"due",
						"completion",
						"cancelled",
						"onCompletion",
						"dependsOn",
						"id",
					].join("|");
					const baseEmoji2 = "(🔺|⏫|🔼|🔽|⏬|🛫|⏳|📅|✅|🔁)";
					const dvFieldToken2 = `\\[(?:${dvKeysGroup2})\\s*::[^\\]]*\\]`;
					const tagToken2 = EMOJI_TAG_REGEX.source;
					const atToken2 = TOKEN_CONTEXT_REGEX.source;
					const emojiSeg2 = `(?:${baseEmoji2}[^\\n]*)`;
					const token2 = `(?:${emojiSeg2}|${dvFieldToken2}|${tagToken2}|${atToken2})`;
					const trailing2 = new RegExp(`(?:\\s+${token2})+$`);
					const tm2 = sanitized2.match(trailing2);
					const trailingMeta = tm2
						? afterPrefix.slice(
								afterPrefix.length - (tm2[0]?.length || 0),
							)
						: "";
					taskLine = `${prefix}${args.updates.content}${trailingMeta}`;
				}
			} else if (args.updates.content === "") {
				// Log warning if attempting to clear content
				console.warn(
					"[WriteAPI] Prevented clearing task content for task:",
					originalTask.id,
				);
			}

			// Update metadata if changed
			if (args.updates.metadata) {
				const md: any = args.updates.metadata || {};
				const mdKeys = Object.keys(md);
				const onlyCompletionDate =
					mdKeys.length > 0 &&
					mdKeys.every((k) => k === "completedDate");
				if (onlyCompletionDate) {
					// Patch completion date in-place to avoid dropping other metadata
					// Remove existing completion markers first
					taskLine = taskLine
						.replace(/\s*\[completion::\s*[^\]]+\]/i, "")
						.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/, "");
					if (md.completedDate) {
						const dateStr =
							typeof md.completedDate === "number"
								? moment(md.completedDate).format("YYYY-MM-DD")
								: String(md.completedDate);
						const useDataviewFormat =
							this.plugin.settings.preferMetadataFormat ===
							"dataview";
						const completionMeta = useDataviewFormat
							? `[completion:: ${dateStr}]`
							: `✅ ${dateStr}`;
						taskLine = `${taskLine} ${completionMeta}`;
					}
				} else {
					// Only regenerate trailing metadata when updates include managed keys.
					const managedKeys = new Set([
						"tags",
						"project",
						"context",
						"priority",
						"repeat",
						"startDate",
						"dueDate",
						"scheduledDate",
						"recurrence",
						"completedDate",
						"onCompletion",
						"dependsOn",
						"id",
					]);
					const hasManagedUpdate = mdKeys.some((k) =>
						managedKeys.has(k),
					);
					if (!hasManagedUpdate) {
						// Ignore unknown metadata-only updates to avoid stripping user content like [projt::new]
						// and keep taskLine as-is.
					} else {
						// Remove existing metadata and regenerate from merged values
						// First, extract the checkbox prefix
						const checkboxMatch = taskLine.match(
							/^(\s*[-*+]\s*\[[^\]]*\]\s*)/,
						);
						if (checkboxMatch) {
							const checkboxPrefix = checkboxMatch[1];
							const afterCheckbox = taskLine.substring(
								checkboxPrefix.length,
							);

							// Find where metadata starts (look for emoji markers or dataview fields)
							// Updated pattern to avoid matching wiki links [[...]] or markdown links [text](url)
							// To avoid false positives, sanitize out wiki links [[...]], markdown links [text](url), and inline code `...`
							const sanitized = afterCheckbox
								// Use non-whitespace placeholders to prevent \s+ from consuming across links/code
								.replace(/\[\[[^\]]*\]\]/g, (m) =>
									"x".repeat(m.length),
								)
								.replace(/\[[^\]]*\]\([^\)]*\)/g, (m) =>
									"x".repeat(m.length),
								)
								.replace(/`[^`]*`/g, (m) =>
									"x".repeat(m.length),
								);

							// Build trailing-metadata matcher. Recognize Dataview fields and
							// tolerate spaces inside known tokens like #project/... and @context...
							const esc = (s: string) =>
								s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
							const dvProjectKey =
								this.plugin.settings.projectTagPrefix
									?.dataview || "project";
							const dvContextKey =
								this.plugin.settings.contextTagPrefix
									?.dataview || "context";
							const dvKeysGroup = [
								"tags",
								esc(dvProjectKey),
								esc(dvContextKey),
								"priority",
								"repeat",
								"start",
								"scheduled",
								"due",
								"completion",
								"cancelled",
								"onCompletion",
								"dependsOn",
								"id",
							].join("|");
							const baseEmoji = "(🔺|⏫|🔼|🔽|⏬|🛫|⏳|📅|✅|🔁)";
							const dvFieldToken = `\\[(?:${dvKeysGroup})\\s*::[^\\]]*\\]`;
							// Tasks-format prefixes
							const projectPrefixTasks =
								this.plugin.settings.projectTagPrefix?.tasks ||
								"project";
							const contextPrefixTasks =
								this.plugin.settings.contextTagPrefix?.tasks ||
								"@";
							// Allow spaces within project/context values when stripping trailing metadata
							const projectWideToken = `#${esc(
								projectPrefixTasks,
							)}/[^\\n\\r]*`;
							const atWideToken = `${esc(
								contextPrefixTasks,
							)}[^\\n\\r]*`;
							const tagToken = EMOJI_TAG_REGEX.source;
							const atToken = TOKEN_CONTEXT_REGEX.source;
							const emojiSeg = `(?:${baseEmoji}[^\\n]*)`;
							// Prefer the wide tokens first so we consume the full trailing segment
							const token = `(?:${emojiSeg}|${dvFieldToken}|${projectWideToken}|${atWideToken}|${tagToken}|${atToken})`;
							const trailing = new RegExp(`(?:\\s+${token})+$`);
							const tm = sanitized.match(trailing);

							// Extract the task content (everything before trailing metadata)
							const taskContentRaw = tm
								? afterCheckbox
										.substring(
											0,
											sanitized.length -
												(tm[0]?.length || 0),
										)
										.trim()
								: afterCheckbox.trim();

							// If we are regenerating managed metadata, scrub inline project tokens from content
							let taskContent = taskContentRaw;
							try {
								const dvProjectKeyInline =
									this.plugin.settings.projectTagPrefix
										?.dataview || "project";
								const projectPrefixTasksInline =
									this.plugin.settings.projectTagPrefix
										?.tasks || "project";
								// Remove Dataview-style inline project fields anywhere in content
								const dvProjectRe = new RegExp(
									`\\[\\s*${esc(
										dvProjectKeyInline,
									)}\\s*::[^\\]]*\\]`,
									"gi",
								);
								taskContent = taskContent
									.replace(dvProjectRe, "")
									.trim();
								// Remove tasks-style inline project tags like #project/xxx (stop at next whitespace)
								const projectInlineRe = new RegExp(
									`(^|\\s)#${esc(
										projectPrefixTasksInline,
									)}/[^\\s#@+]+`,
									"g",
								);
								taskContent = taskContent.replace(
									projectInlineRe,
									"$1",
								);
								// Collapse extra spaces left by removals
								taskContent = taskContent
									.replace(/\s{2,}/g, " ")
									.trim();
							} catch (e) {
								// Best-effort cleanup; ignore regex issues
							}

							console.log(
								"edit content",
								taskContent,
								afterCheckbox,
							);

							const mergedMd = {
								...originalTask.metadata,
								...args.updates.metadata,
							} as any;
							const completedFlag =
								args.updates.completed !== undefined
									? !!args.updates.completed
									: !!originalTask.completed;
							const newMetadata = this.generateMetadata({
								tags: mergedMd.tags,
								project: mergedMd.project,
								context: mergedMd.context,
								priority: mergedMd.priority,
								startDate: mergedMd.startDate,
								dueDate: mergedMd.dueDate,
								scheduledDate: mergedMd.scheduledDate,
								recurrence: mergedMd.recurrence,
								completed: completedFlag,
								completedDate: mergedMd.completedDate,
								onCompletion: mergedMd.onCompletion,
								dependsOn: mergedMd.dependsOn,
								id: mergedMd.id,
							});
							taskLine = `${checkboxPrefix}${taskContent}${
								newMetadata ? ` ${newMetadata}` : ""
							}`;
						}
					}
				}
			}

			lines[originalTask.line] = taskLine;

			// Check if this is a completion of a recurring task
			const isCompletingRecurringTask =
				!originalTask.completed &&
				args.updates.completed === true &&
				originalTask.metadata?.recurrence;

			// If this is a completed recurring task, create a new task with updated dates
			if (isCompletingRecurringTask) {
				try {
					const indentMatch = taskLine.match(/^(\s*)/);
					const indentation = indentMatch ? indentMatch[0] : "";
					const newTaskLine = this.createRecurringTask(
						{
							...originalTask,
							...args.updates,
							metadata: {
								...originalTask.metadata,
								...(args.updates.metadata || {}),
							},
						} as Task,
						indentation,
					);

					// Insert the new task line after the current task
					lines.splice(originalTask.line + 1, 0, newTaskLine);
					console.log(
						`Created new recurring task after line ${originalTask.line}`,
					);
				} catch (error) {
					console.error("Error creating recurring task:", error);
				}
			}

			// Notify about write operation
			emit(this.app, Events.WRITE_OPERATION_START, {
				path: file.path,
				taskId: args.taskId,
			});
			await this.vault.modify(file, lines.join("\n"));

			// Create the updated task object with the new content
			const updatedTaskObj: Task = {
				...originalTask,
				...args.updates,
				metadata: {
					...originalTask.metadata,
					...(args.updates.metadata || {}),
				},
				originalMarkdown: taskLine,
			};

			// Emit write operation complete
			emit(this.app, Events.WRITE_OPERATION_COMPLETE, {
				path: file.path,
				taskId: args.taskId,
			});

			// Trigger task-completed event if task was just completed
			if (args.updates.completed === true && !originalTask.completed) {
				this.app.workspace.trigger(
					"task-genius:task-completed",
					updatedTaskObj,
				);
			}

			return { success: true, task: updatedTaskObj };
		} catch (error) {
			console.error("WriteAPI: Error updating task:", error);
			return { success: false, error: String(error) };
		}
	}

	async updateTasksSequentially(
		argsList: UpdateTaskArgs[],
	): Promise<BulkOperationResult> {
		return this.enqueueWrite(async () => {
			// Emit batch operation start event
			emit(this.app, Events.BATCH_OPERATION_START, {
				count: argsList.length,
			});

			const summary: BulkOperationResult = {
				successCount: 0,
				failCount: 0,
				errors: [],
				totalCount: argsList.length,
			};

			try {
				for (const args of argsList) {
					const originalTask = await Promise.resolve(
						this.getTaskById(args.taskId),
					);
					const updateResult = await this.performUpdateTask(args);
					if (updateResult.success) {
						summary.successCount++;
					} else {
						summary.failCount++;
						summary.errors.push({
							taskId: args.taskId,
							taskContent: originalTask?.content || "",
							error: updateResult.error || "Unknown error",
						});
					}
				}

				return summary;
			} finally {
				// Emit batch operation complete event (always, even if error occurred)
				emit(this.app, Events.BATCH_OPERATION_COMPLETE, {
					successCount: summary.successCount,
					failCount: summary.failCount,
				});
			}
		});
	}

	/**
	 * Update a file-source task (modifies file itself, not task content)
	 */
	private async updateFileSourceTask(
		originalTask: Task,
		updates: Partial<Task>,
		taskId: string,
	): Promise<{ success: boolean; task?: Task; error?: string }> {
		const file = this.vault.getAbstractFileByPath(
			originalTask.filePath,
		) as TFile;
		if (!file) {
			return { success: false, error: "File not found" };
		}

		// Announce start of write operation
		emit(this.app, Events.WRITE_OPERATION_START, {
			path: file.path,
			taskId,
		});

		// Will be updated if file is renamed
		let newFilePath = originalTask.filePath;

		// Get file source configuration
		const fileSourceConfig = this.plugin.settings.fileSource;

		// Helper function to get the actual frontmatter key for a standard field
		// This handles custom metadata mappings (e.g., "proj" -> "project")
		const getFrontmatterKey = (standardKey: string): string => {
			const metadataMappings = fileSourceConfig?.metadataMappings || [];

			// Find an enabled mapping where targetKey matches the standard key
			const mapping = metadataMappings.find(
				(m) => m.enabled && m.targetKey === standardKey && m.sourceKey
			);

			// Return the source key if mapping exists, otherwise use standard key
			return mapping ? mapping.sourceKey : standardKey;
		};

		// Handle status/completed updates by writing to frontmatter
		const hasStatusUpdate = updates.status !== undefined && updates.status !== originalTask.status;
		const hasCompletedUpdate = updates.completed !== undefined && updates.completed !== originalTask.completed;
		const hasMetadataUpdates = updates.metadata !== undefined;

		if (hasStatusUpdate || hasCompletedUpdate || hasMetadataUpdates) {
			try {
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					// Handle status update
					if (hasStatusUpdate && updates.status !== undefined) {
						// Map status symbol to metadata value using statusMapping
						const statusMapping = fileSourceConfig?.statusMapping;
						let statusValue = updates.status;

						if (statusMapping?.enabled && statusMapping.symbolToMetadata) {
							statusValue = statusMapping.symbolToMetadata[updates.status] || updates.status;
						}

						// Use custom field name if mapped
						const statusKey = getFrontmatterKey('status');
						(fm as any)[statusKey] = statusValue;
						console.log(`[WriteAPI][FileSource] Updated ${statusKey}: ${originalTask.status} -> ${statusValue} (symbol: ${updates.status})`);
					}

					// Handle metadata updates
					if (hasMetadataUpdates && updates.metadata) {
						const metadata = updates.metadata;

						// Priority
						if (metadata.priority !== undefined) {
							const priorityKey = getFrontmatterKey('priority');
							if (metadata.priority === null || metadata.priority === 0) {
								delete (fm as any)[priorityKey];
							} else {
								(fm as any)[priorityKey] = metadata.priority;
							}
						}

						// Dates
						if (metadata.dueDate !== undefined) {
							const dueDateKey = getFrontmatterKey('dueDate');
							if (metadata.dueDate) {
								(fm as any)[dueDateKey] = new Date(metadata.dueDate).toISOString().split('T')[0];
							} else {
								delete (fm as any)[dueDateKey];
							}
						}

						if (metadata.startDate !== undefined) {
							const startDateKey = getFrontmatterKey('startDate');
							if (metadata.startDate) {
								(fm as any)[startDateKey] = new Date(metadata.startDate).toISOString().split('T')[0];
							} else {
								delete (fm as any)[startDateKey];
							}
						}

						if (metadata.scheduledDate !== undefined) {
							const scheduledDateKey = getFrontmatterKey('scheduledDate');
							if (metadata.scheduledDate) {
								(fm as any)[scheduledDateKey] = new Date(metadata.scheduledDate).toISOString().split('T')[0];
							} else {
								delete (fm as any)[scheduledDateKey];
							}
						}

						if (metadata.completedDate !== undefined) {
							const completedDateKey = getFrontmatterKey('completedDate');
							if (metadata.completedDate) {
								(fm as any)[completedDateKey] = new Date(metadata.completedDate).toISOString().split('T')[0];
							} else {
								delete (fm as any)[completedDateKey];
							}
						}

						// Project and context
						if (metadata.project !== undefined) {
							const projectKey = getFrontmatterKey('project');
							if (metadata.project) {
								(fm as any)[projectKey] = metadata.project;
							} else {
								delete (fm as any)[projectKey];
							}
						}

						if (metadata.context !== undefined) {
							const contextKey = getFrontmatterKey('context');
							if (metadata.context) {
								(fm as any)[contextKey] = metadata.context;
							} else {
								delete (fm as any)[contextKey];
							}
						}

						// Tags
						if (metadata.tags !== undefined) {
							const tagsKey = getFrontmatterKey('tags');
							if (Array.isArray(metadata.tags) && metadata.tags.length > 0) {
								(fm as any)[tagsKey] = metadata.tags;
							} else {
								delete (fm as any)[tagsKey];
							}
						}

						// Area
						if (metadata.area !== undefined) {
							const areaKey = getFrontmatterKey('area');
							if (metadata.area) {
								(fm as any)[areaKey] = metadata.area;
							} else {
								delete (fm as any)[areaKey];
							}
						}

						// Recurrence
						if (metadata.recurrence !== undefined) {
							const recurrenceKey = getFrontmatterKey('recurrence');
							if (metadata.recurrence) {
								(fm as any)[recurrenceKey] = metadata.recurrence;
							} else {
								delete (fm as any)[recurrenceKey];
							}
						}
					}
				});

				console.log(`[WriteAPI][FileSource] Updated frontmatter for file-source task: ${file.path}`);
			} catch (error) {
				console.error(
					"WriteAPI: Error updating file-source task frontmatter:",
					error,
				);
				return { success: false, error: String(error) };
			}
		}

		// Handle content updates (i.e., renaming the file itself)
		if (
			updates.content !== undefined &&
			updates.content !== originalTask.content
		) {
			try {
				// Get effective content field settings
				const settings =
					this.plugin.settings.fileSource?.fileTaskProperties || {};
				const displayMode = settings.contentSource || "filename";
				const preferFrontmatterTitle = settings.preferFrontmatterTitle;
				const customContentField = (settings as any).customContentField;

				switch (displayMode) {
					case "title": {
						await this.app.fileManager.processFrontMatter(
							file,
							(fm) => {
								(fm as any).title = updates.content;
							},
						);
						console.log(
							"[WriteAPI][FileSource] wrote fm.title (branch: title)",
							{ title: updates.content },
						);
						const cacheAfter =
							this.app.metadataCache.getFileCache(file);
						console.log(
							"[WriteAPI][FileSource] cache fm.title after write (branch: title)",
							{ title: cacheAfter?.frontmatter?.title },
						);
						break;
					}
					case "h1": {
						await this.updateH1Heading(file, updates.content!);
						break;
					}
					case "custom": {
						if (customContentField) {
							await this.app.fileManager.processFrontMatter(
								file,
								(fm) => {
									(fm as any)[customContentField] =
										updates.content;
								},
							);
							console.log(
								"[WriteAPI][FileSource] wrote fm[customContentField] (branch: custom)",
								{
									field: customContentField,
									value: updates.content,
								},
							);
							const cacheAfter =
								this.app.metadataCache.getFileCache(file);
							console.log(
								"[WriteAPI][FileSource] cache fm[customContentField] after write (branch: custom)",
								{
									field: customContentField,
									value: cacheAfter?.frontmatter?.[
										customContentField
									],
								},
							);
						} else if (preferFrontmatterTitle) {
							await this.app.fileManager.processFrontMatter(
								file,
								(fm) => {
									(fm as any).title = updates.content;
								},
							);
							console.log(
								"[WriteAPI][FileSource] wrote fm.title (branch: custom fallback)",
								{ title: updates.content },
							);
							const cacheAfter2 =
								this.app.metadataCache.getFileCache(file);
							console.log(
								"[WriteAPI][FileSource] cache fm.title after write (branch: custom fallback)",
								{ title: cacheAfter2?.frontmatter?.title },
							);
						} else {
							newFilePath = await this.renameFile(
								file,
								updates.content!,
							);
							console.log(
								"[WriteAPI][FileSource] renamed file (branch: custom fallback)",
								{ newFilePath },
							);
						}
						break;
					}
					case "filename":
					default: {
						if (preferFrontmatterTitle) {
							await this.app.fileManager.processFrontMatter(
								file,
								(fm) => {
									(fm as any).title = updates.content;
								},
							);
							console.log(
								"[WriteAPI][FileSource] wrote fm.title (branch: filename/default)",
								{ title: updates.content },
							);
							const cacheAfter =
								this.app.metadataCache.getFileCache(file);
							console.log(
								"[WriteAPI][FileSource] cache fm.title after write (branch: filename/default)",
								{ title: cacheAfter?.frontmatter?.title },
							);
						} else {
							newFilePath = await this.renameFile(
								file,
								updates.content!,
							);
							console.log(
								"[WriteAPI][FileSource] renamed file (branch: filename/default)",
								{ newFilePath },
							);
						}
						break;
					}
				}

				// Announce completion of write operation
				emit(this.app, Events.WRITE_OPERATION_COMPLETE, {
					path: newFilePath,
					taskId,
				});
			} catch (error) {
				console.error(
					"WriteAPI: Error updating file-source task content:",
					error,
				);
				return { success: false, error: String(error) };
			}
		}

		// Build the updated task object
		const updatedTaskObj: Task = {
			...originalTask,
			...updates,
			filePath: newFilePath,
			// Keep id in sync with FileSource convention when path changes
			id:
				originalTask.id.startsWith("file-source:") &&
				newFilePath !== originalTask.filePath
					? `file-source:${newFilePath}`
					: originalTask.id,
			originalMarkdown: `[${
				updates.content ?? originalTask.content
			}](${newFilePath})`,
		};

		// Emit file-task update so repository updates fileTasks map directly
		emit(this.app, Events.FILE_TASK_UPDATED, { task: updatedTaskObj });

		return { success: true, task: updatedTaskObj };
	}

	private async updateH1Heading(
		file: TFile,
		newHeading: string,
	): Promise<void> {
		const content = await this.vault.read(file);
		const lines = content.split("\n");
		// Find first H1 after optional frontmatter
		let h1Index = -1;
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].startsWith("# ")) {
				h1Index = i;
				break;
			}
		}
		if (h1Index >= 0) {
			lines[h1Index] = `# ${newHeading}`;
		} else {
			let insertIndex = 0;
			if (content.startsWith("---")) {
				const fmEnd = content.indexOf("\n---\n", 3);
				if (fmEnd >= 0) {
					const fmLines =
						content.substring(0, fmEnd + 5).split("\n").length - 1;
					insertIndex = fmLines;
				}
			}
			lines.splice(insertIndex, 0, `# ${newHeading}`, "");
		}
		await this.vault.modify(file, lines.join("\n"));
	}

	private async renameFile(file: TFile, newTitle: string): Promise<string> {
		const currentPath = file.path;
		const lastSlash = currentPath.lastIndexOf("/");
		const directory =
			lastSlash > 0 ? currentPath.substring(0, lastSlash) : "";
		const extension = currentPath.substring(currentPath.lastIndexOf("."));
		const sanitized = this.sanitizeFileName(newTitle);
		const newPath = directory
			? `${directory}/${sanitized}${extension}`
			: `${sanitized}${extension}`;
		if (newPath !== currentPath) {
			await this.vault.rename(file, newPath);
		}
		return newPath;
	}

	private sanitizeFileName(name: string): string {
		return name.replace(/[<>:"/\\|?*]/g, "_");
	}

	/**
	 * Create a new task
	 */
	async createTask(
		args: CreateTaskArgs,
	): Promise<{ success: boolean; task?: Task; error?: string }> {
		try {
			let filePath = args.filePath;

			if (!filePath) {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					filePath = activeFile.path;
				} else {
					return {
						success: false,
						error: "No filePath provided and no active file",
					};
				}
			}

			const file = this.vault.getAbstractFileByPath(filePath) as TFile;
			if (!file) {
				return { success: false, error: "File not found" };
			}

			const content = await this.vault.read(file);

			// Build task content
			const checkboxState = args.completed ? "[x]" : "[ ]";
			let taskContent = `- ${checkboxState} ${args.content}`;
			const metadata = this.generateMetadata({
				tags: args.tags,
				project: args.project,
				context: args.context,
				priority: args.priority,
				startDate: args.startDate
					? moment(args.startDate).valueOf()
					: undefined,
				dueDate: args.dueDate
					? moment(args.dueDate).valueOf()
					: undefined,
				completed: args.completed,
				completedDate: args.completedDate
					? moment(args.completedDate).valueOf()
					: undefined,
			});
			if (metadata) {
				taskContent += ` ${metadata}`;
			}

			let newContent = content;
			if (args.parent) {
				// Insert as subtask
				newContent = this.insertSubtask(
					content,
					args.parent,
					taskContent,
				);
			} else {
				// Append to end of file
				newContent = content
					? `${content}\n${taskContent}`
					: taskContent;
			}

			// Notify about write operation
			emit(this.app, Events.WRITE_OPERATION_START, { path: file.path });
			await this.vault.modify(file, newContent);
			emit(this.app, Events.WRITE_OPERATION_COMPLETE, {
				path: file.path,
			});

			return { success: true };
		} catch (error) {
			console.error("WriteAPI: Error creating task:", error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Delete a task and optionally its children
	 */
	async deleteTask(
		args: DeleteTaskArgs,
	): Promise<{ success: boolean; error?: string }> {
		try {
			const task = await Promise.resolve(this.getTaskById(args.taskId));
			if (!task) {
				return { success: false, error: "Task not found" };
			}

			// Check if this is a Canvas task
			if (CanvasTaskUpdater.isCanvasTask(task)) {
				return this.deleteCanvasTask(args);
			}

			const file = this.vault.getAbstractFileByPath(
				task.filePath,
			) as TFile;
			if (!file) {
				return { success: false, error: "File not found" };
			}

			const content = await this.vault.read(file);
			const lines = content.split("\n");

			// Collect all tasks to delete
			const deletedTaskIds: string[] = [args.taskId];

			if (args.deleteChildren) {
				// Get all descendant tasks
				const descendantIds = await this.getDescendantTaskIds(
					args.taskId,
				);
				deletedTaskIds.push(...descendantIds);
			}

			// Get all task line numbers to delete
			const linesToDelete = new Set<number>();
			for (const taskId of deletedTaskIds) {
				const task = await Promise.resolve(this.getTaskById(taskId));
				if (task && task.filePath === file.path) {
					linesToDelete.add(task.line);
				}
			}

			// Delete lines from bottom to top to maintain line numbers
			const sortedLines = Array.from(linesToDelete).sort((a, b) => b - a);
			for (const lineNum of sortedLines) {
				lines.splice(lineNum, 1);
			}

			// Notify about write operation
			emit(this.app, Events.WRITE_OPERATION_START, {
				path: file.path,
				taskId: args.taskId,
			});
			await this.vault.modify(file, lines.join("\n"));
			emit(this.app, Events.WRITE_OPERATION_COMPLETE, {
				path: file.path,
				taskId: args.taskId,
			});

			// Emit TASK_DELETED event with all deleted task IDs
			emit(this.app, Events.TASK_DELETED, {
				taskId: args.taskId,
				filePath: task.filePath,
				deletedTaskIds,
				mode: args.deleteChildren ? "subtree" : "single",
			});

			return { success: true };
		} catch (error) {
			console.error("WriteAPI: Error deleting task:", error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Batch update text in multiple tasks
	 */
	async batchUpdateText(
		args: BatchUpdateTextArgs,
	): Promise<{ success: boolean; updatedCount: number; error?: string }> {
		try {
			let updatedCount = 0;
			const fileUpdates = new Map<string, Map<number, string>>();

			// Group tasks by file
			for (const taskId of args.taskIds) {
				const task = await Promise.resolve(this.getTaskById(taskId));
				if (!task) continue;

				// Skip Canvas tasks
				if (CanvasTaskUpdater.isCanvasTask(task)) continue;

				// Update the task content
				const updatedContent = task.content.replace(
					args.findText,
					args.replaceText,
				);
				if (updatedContent !== task.content) {
					if (!fileUpdates.has(task.filePath)) {
						fileUpdates.set(task.filePath, new Map());
					}
					fileUpdates
						.get(task.filePath)!
						.set(task.line, updatedContent);
					updatedCount++;
				}
			}

			// Apply updates to files
			for (const [filePath, lineUpdates] of fileUpdates) {
				const file = this.vault.getAbstractFileByPath(
					filePath,
				) as TFile;
				if (!file) continue;

				const content = await this.vault.read(file);
				const lines = content.split("\n");

				for (const [lineNum, newContent] of lineUpdates) {
					if (lineNum >= 0 && lineNum < lines.length) {
						const taskLine = lines[lineNum];
						const prefixMatch = taskLine.match(
							/^(\s*[-*+]\s*\[[^\]]*\]\s*)/,
						);
						if (prefixMatch) {
							const prefix = prefixMatch[1];
							// Preserve trailing metadata (strict trailing-only, recognized keys)
							const afterPrefix2 = taskLine.substring(
								prefix.length,
							);
							const sanitized3 = afterPrefix2
								.replace(/\[\[[^\]]*\]\]/g, (m) =>
									"x".repeat(m.length),
								)
								.replace(/\[[^\]]*\]\([^\)]*\)/g, (m) =>
									"x".repeat(m.length),
								)
								.replace(/`[^`]*`/g, (m) =>
									"x".repeat(m.length),
								);
							const esc3 = (s: string) =>
								s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
							const projectKey3 =
								this.plugin.settings.projectTagPrefix
									?.dataview || "project";
							const contextKey3 =
								this.plugin.settings.contextTagPrefix
									?.dataview || "context";
							const dvKeysGroup3 = [
								"tags",
								esc3(projectKey3),
								esc3(contextKey3),
								"priority",
								"repeat",
								"start",
								"scheduled",
								"due",
								"completion",
								"cancelled",
								"onCompletion",
								"dependsOn",
								"id",
							].join("|");
							const baseEmoji3 =
								"(🔺|⏫|🔼|🔽|⏬|🛫|⏳|📅|✅|🔁)";
							const dvFieldToken3 = `\\[(?:${dvKeysGroup3})\\s*::[^\\]]*\\]`;
							const tagToken3 = EMOJI_TAG_REGEX.source;
							const atToken3 = TOKEN_CONTEXT_REGEX.source;
							const emojiSeg3 = `(?:${baseEmoji3}[^\\n]*)`;
							const token3 = `(?:${emojiSeg3}|${dvFieldToken3}|${tagToken3}|${atToken3})`;
							const trailing3 = new RegExp(`(?:\\s+${token3})+$`);
							const tm3 = sanitized3.match(trailing3);
							const trailingMeta2 = tm3
								? afterPrefix2.slice(
										afterPrefix2.length -
											(tm3[0]?.length || 0),
									)
								: "";
							lines[lineNum] =
								`${prefix}${newContent}${trailingMeta2}`;
						}
					}
				}

				// Notify about write operation
				emit(this.app, Events.WRITE_OPERATION_START, {
					path: file.path,
				});
				await this.vault.modify(file, lines.join("\n"));
				emit(this.app, Events.WRITE_OPERATION_COMPLETE, {
					path: file.path,
				});
			}

			return { success: true, updatedCount };
		} catch (error) {
			console.error("WriteAPI: Error in batch update text:", error);
			return { success: false, updatedCount: 0, error: String(error) };
		}
	}

	/**
	 * Create multiple subtasks under a parent task
	 */
	async batchCreateSubtasks(
		args: BatchCreateSubtasksArgs,
	): Promise<{ success: boolean; createdCount: number; error?: string }> {
		try {
			const parentTask = await Promise.resolve(
				this.getTaskById(args.parentTaskId),
			);
			if (!parentTask) {
				return {
					success: false,
					createdCount: 0,
					error: "Parent task not found",
				};
			}

			// Check if this is a Canvas task
			if (CanvasTaskUpdater.isCanvasTask(parentTask)) {
				// Handle Canvas subtasks differently if needed
				return {
					success: false,
					createdCount: 0,
					error: "Canvas task subtasks not supported yet",
				};
			}

			const file = this.vault.getAbstractFileByPath(
				parentTask.filePath,
			) as TFile;
			if (!file) {
				return {
					success: false,
					createdCount: 0,
					error: "File not found",
				};
			}

			const content = await this.vault.read(file);
			const lines = content.split("\n");

			// Get the parent task's indentation
			const parentLine = lines[parentTask.line];
			const indentMatch = parentLine.match(/^(\s*)/);
			const parentIndent = indentMatch ? indentMatch[0] : "";
			const subtaskIndent = parentIndent + "\t";

			// Build subtask lines
			const subtaskLines: string[] = [];
			for (const subtask of args.subtasks) {
				let subtaskContent = `${subtaskIndent}- [ ] ${subtask.content}`;
				const metadata = this.generateMetadata({
					priority: subtask.priority,
					dueDate: subtask.dueDate
						? moment(subtask.dueDate).valueOf()
						: undefined,
				});
				if (metadata) {
					subtaskContent += ` ${metadata}`;
				}
				subtaskLines.push(subtaskContent);
			}

			// Find the insertion point (after parent task and its existing subtasks)
			let insertLine = parentTask.line + 1;
			const parentIndentLevel = parentIndent.length;
			while (insertLine < lines.length) {
				const line = lines[insertLine];
				const lineIndentMatch = line.match(/^(\s*)/);
				const lineIndentLevel = lineIndentMatch
					? lineIndentMatch[0].length
					: 0;
				if (
					lineIndentLevel <= parentIndentLevel &&
					line.trim() !== ""
				) {
					break;
				}
				insertLine++;
			}

			// Insert the subtasks
			lines.splice(insertLine, 0, ...subtaskLines);

			// Notify about write operation
			emit(this.app, Events.WRITE_OPERATION_START, {
				path: file.path,
				taskId: args.parentTaskId,
			});
			await this.vault.modify(file, lines.join("\n"));
			emit(this.app, Events.WRITE_OPERATION_COMPLETE, {
				path: file.path,
				taskId: args.parentTaskId,
			});

			return { success: true, createdCount: subtaskLines.length };
		} catch (error) {
			console.error("WriteAPI: Error creating subtasks:", error);
			return { success: false, createdCount: 0, error: String(error) };
		}
	}

	/**
	 * Backward-compatible: batch update task status (wrapper)
	 */
	async batchUpdateTaskStatus(args: {
		taskIds: string[];
		status?: string;
		completed?: boolean;
	}): Promise<{
		updated: string[];
		failed: Array<{ id: string; error: string }>;
	}> {
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
				failed.push({
					id: taskId,
					error: result.error || "Unknown error",
				});
			}
		}

		return { updated, failed };
	}

	/**
	 * Backward-compatible: postpone tasks to a new date (wrapper)
	 */
	async postponeTasks(args: { taskIds: string[]; newDate: string }): Promise<{
		updated: string[];
		failed: Array<{ id: string; error: string }>;
	}> {
		const updated: string[] = [];
		const failed: Array<{ id: string; error: string }> = [];

		const parseDateOrOffset = (input: string): number | null => {
			const abs = Date.parse(input);
			if (!isNaN(abs)) return abs;
			const m = input.match(/^\+(\d+)([dwmy])$/i);
			if (!m) return null;
			const n = parseInt(m[1], 10);
			const unit = m[2].toLowerCase();
			const base = new Date();
			switch (unit) {
				case "d":
					base.setDate(base.getDate() + n);
					break;
				case "w":
					base.setDate(base.getDate() + n * 7);
					break;
				case "m":
					base.setMonth(base.getMonth() + n);
					break;
				case "y":
					base.setFullYear(base.getFullYear() + n);
					break;
			}
			return base.getTime();
		};

		const newDateMs = parseDateOrOffset(args.newDate);
		if (newDateMs === null) {
			return {
				updated: [],
				failed: args.taskIds.map((id) => ({
					id,
					error: "Invalid date format",
				})),
			};
		}

		for (const taskId of args.taskIds) {
			const result = await this.updateTask({
				taskId,
				updates: { metadata: { dueDate: newDateMs } as any },
			});

			if (result.success) {
				updated.push(taskId);
			} else {
				failed.push({
					id: taskId,
					error: result.error || "Unknown error",
				});
			}
		}

		return { updated, failed };
	}

	/**
	 * Get all descendant task IDs for a given task
	 */
	private async getDescendantTaskIds(taskId: string): Promise<string[]> {
		const descendants: string[] = [];
		const task = await Promise.resolve(this.getTaskById(taskId));
		if (!task) return descendants;

		// This would need to be implemented based on your task hierarchy logic
		// For now, returning empty array as a placeholder
		return descendants;
	}

	/**
	 * Find a task line by ID in an array of lines
	 */
	private findTaskLineById(
		lines: string[],
		taskId: string,
	): { line: number; content: string } | null {
		// This would need to match the task ID format used in your system
		// For now, returning null as a placeholder
		return null;
	}

	/**
	 * Get the indentation level of a line
	 */
	private getIndent(line: string): string {
		const match = line.match(/^(\s*)/);
		return match ? match[0] : "";
	}

	/**
	 * Add a task to the daily note
	 */
	async addTaskToDailyNote(args: {
		content: string;
		parent?: string;
		tags?: string[];
		project?: string;
		context?: string;
		priority?: number;
		startDate?: string;
		dueDate?: string;
		heading?: string;
		completed?: boolean;
		completedDate?: string;
	}): Promise<{ success: boolean; error?: string }> {
		try {
			// Get or create daily note
			let dailyNoteFile: TFile | null;
			const hasDailyNotesPlugin = appHasDailyNotesPluginLoaded();

			if (hasDailyNotesPlugin) {
				// Use Daily Notes plugin
				const dailyNotes = getAllDailyNotes();
				const todayMoment = moment();
				let todayNote = getDailyNote(todayMoment, dailyNotes);

				if (!todayNote) {
					todayNote = await createDailyNote(todayMoment);
				}
				dailyNoteFile = todayNote;
			} else {
				// Create our own daily note
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
				const path = folder
					? `${folder}/${dateStr}.md`
					: `${dateStr}.md`;

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
				let file = this.vault.getAbstractFileByPath(
					path,
				) as TFile | null;
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
				startDate: args.startDate
					? moment(args.startDate).valueOf()
					: undefined,
				dueDate: args.dueDate
					? moment(args.dueDate).valueOf()
					: undefined,
				completed: args.completed,
				completedDate: args.completedDate
					? moment(args.completedDate).valueOf()
					: undefined,
			});
			if (metadata) {
				taskContent += ` ${metadata}`;
			}

			// Append under optional heading
			const file = dailyNoteFile;
			const current = await this.vault.read(file);
			let newContent = current;

			if (args.parent) {
				newContent = this.insertSubtask(
					current,
					args.parent,
					taskContent,
				);
			} else {
				// Use heading from Quick Capture settings if available
				const fallbackHeading =
					args.heading ||
					this.plugin.settings.quickCapture?.targetHeading?.trim();
				if (fallbackHeading) {
					const headingRegex = new RegExp(
						`^#{1,6}\\s+${fallbackHeading.replace(
							/[.*+?^${}()|[\]\\]/g,
							"\\$&",
						)}\\s*$`,
						"m",
					);
					if (headingRegex.test(current)) {
						newContent = current.replace(
							headingRegex,
							`$&\n\n${taskContent}`,
						);
					} else {
						newContent = `${current}${
							current.endsWith("\n") ? "" : "\n"
						}\n## ${fallbackHeading}\n\n${taskContent}`;
					}
				} else {
					newContent = current
						? `${current}\n${taskContent}`
						: taskContent;
				}
			}

			// Notify about write operation
			emit(this.app, Events.WRITE_OPERATION_START, { path: file.path });
			await this.vault.modify(file, newContent);
			emit(this.app, Events.WRITE_OPERATION_COMPLETE, {
				path: file.path,
			});
			return { success: true };
		} catch (error) {
			console.error(
				"WriteAPI: Error creating task in daily note:",
				error,
			);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Backward-compatible: create a task in daily note (wrapper)
	 */
	async createTaskInDailyNote(
		args: CreateTaskArgs & { heading?: string },
	): Promise<{ success: boolean; error?: string }> {
		return this.addTaskToDailyNote({
			content: args.content,
			parent: args.parent,
			tags: args.tags,
			project: args.project,
			context: args.context,
			priority: args.priority,
			startDate: args.startDate,
			dueDate: args.dueDate,
			heading: (args as any).heading,
			completed: !!args.completed,
			completedDate: args.completedDate,
		});
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
				startDate: args.startDate
					? moment(args.startDate).valueOf()
					: undefined,
				dueDate: args.dueDate
					? moment(args.dueDate).valueOf()
					: undefined,
				completed: args.completed,
				completedDate: args.completedDate
					? moment(args.completedDate).valueOf()
					: undefined,
			});
			if (metadata) {
				line += ` ${metadata}`;
			}

			// Save to quick capture
			await saveCapture(this.app, line, {
				targetHeading: args.heading,
				targetFile: this.plugin.settings.quickCapture?.targetFile,
				targetType:
					this.plugin.settings.quickCapture?.targetType || "fixed",
				appendToFile: "append",
			});
			const filePath =
				this.plugin.settings.quickCapture?.targetFile ||
				"quick-capture.md"; // Use the target file

			// Notify about write operation
			emit(this.app, Events.WRITE_OPERATION_START, { path: filePath });
			emit(this.app, Events.WRITE_OPERATION_COMPLETE, { path: filePath });

			return { filePath, success: true };
		} catch (error) {
			console.error(
				"WriteAPI: Error adding project task to quick capture:",
				error,
			);
			throw error;
		}
	}

	// ===== Helper Methods =====

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
		onCompletion?: string;
		dependsOn?: string[] | string;
		id?: string;
	}): string {
		const metadata: string[] = [];
		const useDataviewFormat =
			this.plugin.settings.preferMetadataFormat === "dataview";

		// Tags
		if (args.tags?.length) {
			if (useDataviewFormat) {
				metadata.push(`[tags:: ${args.tags.join(", ")}]`);
			} else {
				// Ensure tags don't already have # prefix before adding one
				metadata.push(
					...args.tags.map((tag) =>
						tag.startsWith("#") ? tag : `#${tag}`,
					),
				);
			}
		}

		// Project
		if (args.project) {
			if (useDataviewFormat) {
				const projectPrefix =
					this.plugin.settings.projectTagPrefix?.dataview ||
					"project";
				// Dataview 格式保留原始空格
				metadata.push(`[${projectPrefix}:: ${args.project}]`);
			} else {
				const projectPrefix =
					this.plugin.settings.projectTagPrefix?.tasks || "project";
				// Tasks 格式：空格使用 "-" 连接
				const sanitizedProject = String(args.project)
					.trim()
					.replace(/\s+/g, "-");
				metadata.push(`#${projectPrefix}/${sanitizedProject}`);
			}
		}

		// Context
		if (args.context) {
			if (useDataviewFormat) {
				const contextPrefix =
					this.plugin.settings.contextTagPrefix?.dataview ||
					"context";
				// Dataview 格式保留原始空格
				metadata.push(`[${contextPrefix}:: ${args.context}]`);
			} else {
				const contextPrefix =
					this.plugin.settings.contextTagPrefix?.tasks || "@";
				// Tasks 格式：空格使用 "-" 连接
				const sanitizedContext = String(args.context)
					.trim()
					.replace(/\s+/g, "-");
				metadata.push(`${contextPrefix}${sanitizedContext}`);
			}
		}

		// Priority
		// Only add priority if it's a valid number between 1-5
		if (
			typeof args.priority === "number" &&
			args.priority >= 1 &&
			args.priority <= 5
		) {
			if (useDataviewFormat) {
				let priorityValue: string;
				switch (args.priority) {
					case 5:
						priorityValue = "highest";
						break;
					case 4:
						priorityValue = "high";
						break;
					case 3:
						priorityValue = "medium";
						break;
					case 2:
						priorityValue = "low";
						break;
					case 1:
						priorityValue = "lowest";
						break;
					default:
						priorityValue = String(args.priority);
				}
				metadata.push(`[priority:: ${priorityValue}]`);
			} else {
				let priorityMarker = "";
				switch (args.priority) {
					case 5:
						priorityMarker = "🔺";
						break;
					case 4:
						priorityMarker = "⏫";
						break;
					case 3:
						priorityMarker = "🔼";
						break;
					case 2:
						priorityMarker = "🔽";
						break;
					case 1:
						priorityMarker = "⏬";
						break;
				}
				if (priorityMarker) metadata.push(priorityMarker);
			}
		}

		// Recurrence
		if (args.recurrence) {
			metadata.push(
				useDataviewFormat
					? `[repeat:: ${args.recurrence}]`
					: `🔁 ${args.recurrence}`,
			);
		}

		// Start Date
		if (args.startDate) {
			const dateStr = moment(args.startDate).format("YYYY-MM-DD");
			metadata.push(
				useDataviewFormat ? `[start:: ${dateStr}]` : `🛫 ${dateStr}`,
			);
		}

		// Scheduled Date
		if (args.scheduledDate) {
			const dateStr = moment(args.scheduledDate).format("YYYY-MM-DD");
			metadata.push(
				useDataviewFormat
					? `[scheduled:: ${dateStr}]`
					: `⏳ ${dateStr}`,
			);
		}

		// Due Date
		if (args.dueDate) {
			const dateStr = moment(args.dueDate).format("YYYY-MM-DD");
			metadata.push(
				useDataviewFormat ? `[due:: ${dateStr}]` : `📅 ${dateStr}`,
			);
		}

		// Completion Date
		if (args.completed && args.completedDate) {
			const dateStr = moment(args.completedDate).format("YYYY-MM-DD");
			metadata.push(
				useDataviewFormat
					? `[completion:: ${dateStr}]`
					: `✅ ${dateStr}`,
			);
		}

		// On Completion action
		if (args.onCompletion) {
			metadata.push(
				useDataviewFormat
					? `[onCompletion:: ${args.onCompletion}]`
					: `🏁 ${args.onCompletion}`,
			);
		}

		// Depends On
		if (
			args.dependsOn &&
			(Array.isArray(args.dependsOn) ? args.dependsOn.length > 0 : true)
		) {
			const dependsStr = Array.isArray(args.dependsOn)
				? args.dependsOn.join(", ")
				: args.dependsOn;
			metadata.push(
				useDataviewFormat
					? `[dependsOn:: ${dependsStr}]`
					: `⛔ ${dependsStr}`,
			);
		}

		// ID
		if (args.id) {
			metadata.push(
				useDataviewFormat ? `[id:: ${args.id}]` : `🆔 ${args.id}`,
			);
		}

		return metadata.join(" ");
	}

	/**
	 * Insert a subtask under a parent task
	 */
	private insertSubtask(
		content: string,
		parentTaskId: string,
		subtaskContent: string,
	): string {
		const lines = content.split("\n");
		const parentTask = this.findTaskLineById(lines, parentTaskId);

		if (parentTask) {
			const indent = this.getIndent(lines[parentTask.line]);
			const subtaskIndent = indent + "\t";
			const subtaskLine = `${subtaskIndent}${subtaskContent}`;

			// Find where to insert the subtask
			let insertLine = parentTask.line + 1;
			const parentIndentLevel = indent.length;

			// Find the end of existing subtasks
			while (insertLine < lines.length) {
				const line = lines[insertLine];
				const lineIndent = this.getIndent(line);
				if (
					lineIndent.length <= parentIndentLevel &&
					line.trim() !== ""
				) {
					break;
				}
				insertLine++;
			}

			lines.splice(insertLine, 0, subtaskLine);
			return lines.join("\n");
		}

		// If parent not found, append to end
		return content ? `${content}\n${subtaskContent}` : subtaskContent;
	}

	/**
	 * Simple recurrence pattern parser
	 */
	private parseSimpleRecurrence(pattern: string): {
		interval: number;
		unit: string;
	} {
		const match = pattern.match(/(\d+)\s*([dwmy])/i);
		if (match) {
			return {
				interval: parseInt(match[1]),
				unit: match[2].toLowerCase(),
			};
		}

		// Try parsing "every X days/weeks/months/years"
		const everyMatch = pattern.match(
			/every\s+(\d+)?\s*(day|week|month|year)s?/i,
		);
		if (everyMatch) {
			return {
				interval: everyMatch[1] ? parseInt(everyMatch[1]) : 1,
				unit: everyMatch[2].toLowerCase().charAt(0),
			};
		}

		// Default to daily
		return { interval: 1, unit: "d" };
	}

	/**
	 * Add interval to date based on unit
	 */
	private addInterval(base: Date, interval: number, unit: string): number {
		const n = interval;
		switch (unit) {
			case "d":
				base.setDate(base.getDate() + n);
				break;
			case "w":
				base.setDate(base.getDate() + n * 7);
				break;
			case "m":
				base.setMonth(base.getMonth() + n);
				break;
			case "y":
				base.setFullYear(base.getFullYear() + n);
				break;
		}

		// Normalize to local midnight
		base.setHours(0, 0, 0, 0);
		return base.getTime();
	}

	// ===== Canvas Task Methods =====

	/**
	 * Update a Canvas task
	 */
	async updateCanvasTask(
		args: UpdateTaskArgs,
	): Promise<{ success: boolean; task?: Task; error?: string }> {
		try {
			const originalTask = await Promise.resolve(
				this.getTaskById(args.taskId),
			);
			if (!originalTask) {
				return { success: false, error: "Task not found" };
			}

			// Ensure it's a Canvas task
			if (!CanvasTaskUpdater.isCanvasTask(originalTask)) {
				return { success: false, error: "Task is not a Canvas task" };
			}

			// Create updated task object (deep-merge metadata to preserve unchanged fields)
			const updatedTask = {
				...originalTask,
				...args.updates,
				metadata: {
					...originalTask.metadata,
					...(args.updates as any).metadata,
				},
			} as Task<CanvasTaskMetadata>;

			// Use CanvasTaskUpdater to update the task
			const result = await this.canvasTaskUpdater.updateCanvasTask(
				originalTask as Task<CanvasTaskMetadata>,
				updatedTask,
			);

			if (result.success) {
				// Emit task updated event for dataflow
				emit(this.app, Events.TASK_UPDATED, { task: updatedTask });

				// Trigger task-completed event if task was just completed
				if (
					args.updates.completed === true &&
					!originalTask.completed
				) {
					this.app.workspace.trigger(
						"task-genius:task-completed",
						updatedTask,
					);
				}

				return { success: true, task: updatedTask };
			} else {
				return { success: false, error: result.error };
			}
		} catch (error) {
			console.error("WriteAPI: Error updating Canvas task:", error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Delete a Canvas task
	 */
	async deleteCanvasTask(
		args: DeleteTaskArgs,
	): Promise<{ success: boolean; error?: string }> {
		try {
			const task = await Promise.resolve(this.getTaskById(args.taskId));
			if (!task) {
				return { success: false, error: "Task not found" };
			}

			// Ensure it's a Canvas task
			if (!CanvasTaskUpdater.isCanvasTask(task)) {
				return { success: false, error: "Task is not a Canvas task" };
			}

			// Collect all tasks to delete
			const deletedTaskIds: string[] = [args.taskId];

			if (args.deleteChildren) {
				// Get all descendant tasks
				const descendantIds = await this.getDescendantTaskIds(
					args.taskId,
				);
				deletedTaskIds.push(...descendantIds);
			}

			// Use CanvasTaskUpdater to delete the task(s)
			const result = await this.canvasTaskUpdater.deleteCanvasTask(
				task as Task<CanvasTaskMetadata>,
				args.deleteChildren,
			);

			if (result.success) {
				// Emit TASK_DELETED event with all deleted task IDs
				emit(this.app, Events.TASK_DELETED, {
					taskId: args.taskId,
					filePath: task.filePath,
					deletedTaskIds,
					mode: args.deleteChildren ? "subtree" : "single",
				});
			}

			return result;
		} catch (error) {
			console.error("WriteAPI: Error deleting Canvas task:", error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Move a Canvas task to another location
	 */
	async moveCanvasTask(args: {
		taskId: string;
		targetFilePath: string;
		targetNodeId?: string;
		targetSection?: string;
	}): Promise<{ success: boolean; error?: string }> {
		try {
			const task = await Promise.resolve(this.getTaskById(args.taskId));
			if (!task) {
				return { success: false, error: "Task not found" };
			}

			// Ensure it's a Canvas task
			if (!CanvasTaskUpdater.isCanvasTask(task)) {
				return { success: false, error: "Task is not a Canvas task" };
			}

			// Use CanvasTaskUpdater to move the task
			const result = await this.canvasTaskUpdater.moveCanvasTask(
				task as Task<CanvasTaskMetadata>,
				args.targetFilePath,
				args.targetNodeId,
				args.targetSection,
			);

			return result;
		} catch (error) {
			console.error("WriteAPI: Error moving Canvas task:", error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Duplicate a Canvas task
	 */
	async duplicateCanvasTask(args: {
		taskId: string;
		targetFilePath?: string;
		targetNodeId?: string;
		targetSection?: string;
		preserveMetadata?: boolean;
	}): Promise<{ success: boolean; error?: string }> {
		try {
			const task = await Promise.resolve(this.getTaskById(args.taskId));
			if (!task) {
				return { success: false, error: "Task not found" };
			}

			// Ensure it's a Canvas task
			if (!CanvasTaskUpdater.isCanvasTask(task)) {
				return { success: false, error: "Task is not a Canvas task" };
			}

			// Use CanvasTaskUpdater to duplicate the task
			const result = await this.canvasTaskUpdater.duplicateCanvasTask(
				task as Task<CanvasTaskMetadata>,
				args.targetFilePath,
				args.targetNodeId,
				args.targetSection,
				args.preserveMetadata,
			);

			return result;
		} catch (error) {
			console.error("WriteAPI: Error duplicating Canvas task:", error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Add a new task to a Canvas node
	 */
	async addTaskToCanvasNode(args: {
		filePath: string;
		content: string;
		targetNodeId?: string;
		targetSection?: string;
		completed?: boolean;
		metadata?: Partial<CanvasTaskMetadata>;
	}): Promise<{ success: boolean; error?: string }> {
		try {
			// Format task content with checkbox
			const checkboxState = args.completed ? "[x]" : "[ ]";
			let taskContent = `- ${checkboxState} ${args.content}`;

			// Add metadata if provided
			if (args.metadata) {
				const metadataStr = this.generateMetadata(args.metadata as any);
				if (metadataStr) {
					taskContent += ` ${metadataStr}`;
				}
			}

			// Use CanvasTaskUpdater to add the task
			const result = await this.canvasTaskUpdater.addTaskToCanvasNode(
				args.filePath,
				taskContent,
				args.targetNodeId,
				args.targetSection,
			);

			return result;
		} catch (error) {
			console.error("WriteAPI: Error adding task to Canvas node:", error);
			return { success: false, error: String(error) };
		}
	}

	/**
	 * Check if a task is a Canvas task
	 */
	isCanvasTask(task: Task): boolean {
		return CanvasTaskUpdater.isCanvasTask(task);
	}

	/**
	 * Insert date metadata at the correct position in the task line
	 */
	private insertDateAtCorrectPosition(
		taskLine: string,
		dateMetadata: string,
		dateType: "completed" | "cancelled" | "start",
	): string {
		// Check for block reference at the end
		const blockRefPattern = /\s*(\^[a-zA-Z0-9-]+)$/;
		const blockRefMatch = taskLine.match(blockRefPattern);

		if (blockRefMatch && blockRefMatch.index !== undefined) {
			// Insert before block reference
			const insertPos = blockRefMatch.index;
			return (
				taskLine.slice(0, insertPos) +
				" " +
				dateMetadata +
				taskLine.slice(insertPos)
			);
		}

		// For completion date, add at the very end
		if (dateType === "completed") {
			return taskLine + " " + dateMetadata;
		}

		// For cancelled and start dates, insert after task content but before other metadata
		// Find where metadata starts (tags, dates, etc)
		// Detect strict trailing metadata (recognized keys) on full line
		const sanitizedFull = taskLine
			.replace(/\[\[[^\]]*\]\]/g, (m) => "x".repeat(m.length))
			.replace(/\[[^\]]*\]\([^\)]*\)/g, (m) => "x".repeat(m.length))
			.replace(/`[^`]*`/g, (m) => "x".repeat(m.length));
		const escD = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const projectKeyD =
			this.plugin.settings.projectTagPrefix?.dataview || "project";
		const contextKeyD =
			this.plugin.settings.contextTagPrefix?.dataview || "context";
		const dvKeysGroupD = [
			"tags",
			escD(projectKeyD),
			escD(contextKeyD),
			"priority",
			"repeat",
			"start",
			"scheduled",
			"due",
			"completion",
			"cancelled",
			"onCompletion",
			"dependsOn",
			"id",
		].join("|");
		const baseEmojiD = "(🔺|⏫|🔼|🔽|⏬|🛫|⏳|📅|✅|🔁)";
		const dvFieldTokenD = `\\[(?:${dvKeysGroupD})\\s*::[^\\]]*\\]`;
		const tagTokenD = "#[A-Za-z][\\w/-]*";
		const atTokenD = "@[A-Za-z][\\w/-]*";
		const plusTokenD = "\\+[A-Za-z][\\w/-]*";
		const emojiSegD = `(?:${baseEmojiD}[^\\n]*)`;
		const tokenD = `(?:${emojiSegD}|${dvFieldTokenD}|${tagTokenD}|${atTokenD}|${plusTokenD})`;
		const trailingD = new RegExp(`(?:\\s+${tokenD})+$`);
		const tmD = sanitizedFull.match(trailingD);

		if (tmD) {
			const insertPos = taskLine.length - (tmD[0]?.length || 0);
			return (
				taskLine.slice(0, insertPos) +
				" " +
				dateMetadata +
				taskLine.slice(insertPos)
			);
		}

		// No metadata found, add at the end
		return taskLine + " " + dateMetadata;
	}

	/**
	 * Creates a new recurring task line from a completed task
	 */
	private createRecurringTask(
		completedTask: Task,
		indentation: string,
	): string {
		// Calculate the next due date based on the recurrence pattern
		const nextDate = this.calculateNextDueDate(completedTask);

		// Create a new task with the same content but updated dates
		const newTask = { ...completedTask };
		// Reset completion status and date
		newTask.completed = false;
		newTask.metadata.completedDate = undefined;

		// Determine where to apply the next date based on what the original task had
		if (completedTask.metadata.dueDate) {
			// If original task had due date, update due date
			newTask.metadata.dueDate = nextDate;
		} else if (completedTask.metadata.scheduledDate) {
			// If original task only had scheduled date, update scheduled date
			newTask.metadata.scheduledDate = nextDate;
			newTask.metadata.dueDate = undefined; // Make sure due date is not set
		} else {
			newTask.metadata.dueDate = nextDate;
		}

		// Extract the original list marker (-, *, 1., etc.) from the original markdown
		let listMarker = "- ";
		if (completedTask.originalMarkdown) {
			// Match the list marker pattern: could be "- ", "* ", "1. ", etc.
			const listMarkerMatch = completedTask.originalMarkdown.match(
				/^(\s*)([*\-+]|\d+\.)\s+\[/,
			);
			if (listMarkerMatch && listMarkerMatch[2]) {
				listMarker = listMarkerMatch[2] + " ";
				// If it's a numbered list, increment the number
				if (/^\d+\.$/.test(listMarkerMatch[2])) {
					const numberStr = listMarkerMatch[2].replace(/\.$/, "");
					const number = parseInt(numberStr);
					listMarker = number + 1 + ". ";
				}
			}
		}

		// Start with the basic task using the extracted list marker and clean content
		let newTaskLine = `${indentation}${listMarker}[ ] ${completedTask.content}`;

		// Generate metadata for the new task
		const metadata = this.generateMetadata({
			tags: newTask.metadata.tags,
			project: newTask.metadata.project,
			context: newTask.metadata.context,
			priority: newTask.metadata.priority,
			startDate: newTask.metadata.startDate,
			dueDate: newTask.metadata.dueDate,
			scheduledDate: newTask.metadata.scheduledDate,
			recurrence: newTask.metadata.recurrence,
			onCompletion: newTask.metadata.onCompletion,
			dependsOn: newTask.metadata.dependsOn,
			id: newTask.metadata.id,
		});

		if (metadata) {
			newTaskLine += ` ${metadata}`;
		}

		return newTaskLine;
	}

	/**
	 * Calculates the next due date for a recurring task
	 * Fixed to properly handle weekly and monthly recurrence
	 */
	private calculateNextDueDate(task: Task): number | undefined {
		if (!task.metadata?.recurrence) return undefined;

		// Determine base date based on user settings
		let baseDate: Date;
		const recurrenceDateBase =
			this.plugin.settings.recurrenceDateBase || "due";

		if (recurrenceDateBase === "current") {
			// Always use current date
			baseDate = new Date();
		} else if (
			recurrenceDateBase === "scheduled" &&
			task.metadata.scheduledDate
		) {
			// Use scheduled date if available
			baseDate = new Date(task.metadata.scheduledDate);
		} else if (recurrenceDateBase === "due" && task.metadata.dueDate) {
			// Use due date if available (default behavior)
			baseDate = new Date(task.metadata.dueDate);
		} else {
			// Fallback to current date if the specified date type is not available
			baseDate = new Date();
		}

		// Ensure baseDate is at the beginning of the day for date-based recurrence
		baseDate.setHours(0, 0, 0, 0);

		try {
			// Try parsing with rrule first
			try {
				const rule = rrulestr(task.metadata.recurrence, {
					dtstart: baseDate,
				});

				// Get current date for comparison
				const now = new Date();
				const todayStart = new Date(now);
				todayStart.setHours(0, 0, 0, 0);

				// We want the first occurrence strictly after today (not just after baseDate)
				// This ensures the next task is always in the future
				const afterDate = new Date(
					Math.max(baseDate.getTime(), todayStart.getTime()) + 1000,
				); // 1 second after the later of baseDate or today
				const nextOccurrence = rule.after(afterDate);

				if (nextOccurrence) {
					// Set time to start of day
					nextOccurrence.setHours(0, 0, 0, 0);
					// Ensure it's in the future
					if (nextOccurrence.getTime() > todayStart.getTime()) {
						// Convert to UTC noon timestamp for consistent storage
						const year = nextOccurrence.getFullYear();
						const month = nextOccurrence.getMonth();
						const day = nextOccurrence.getDate();
						return Date.UTC(year, month, day, 12, 0, 0);
					}
					// If somehow still not in future, try getting the next occurrence
					const futureOccurrence = rule.after(
						new Date(todayStart.getTime() + 86400000),
					); // Tomorrow
					if (futureOccurrence) {
						futureOccurrence.setHours(0, 0, 0, 0);
						// Convert to UTC noon timestamp
						const year = futureOccurrence.getFullYear();
						const month = futureOccurrence.getMonth();
						const day = futureOccurrence.getDate();
						return Date.UTC(year, month, day, 12, 0, 0);
					}
				}
			} catch (e) {
				// rrulestr failed, fall back to simple parsing
				console.log(
					`Failed to parse recurrence '${task.metadata.recurrence}' with rrule. Falling back to simple logic.`,
				);
			}

			// --- Fallback Simple Parsing Logic ---
			const recurrence = task.metadata.recurrence.trim().toLowerCase();
			const now = new Date();
			const todayStart = new Date(now);
			todayStart.setHours(0, 0, 0, 0);

			// Parse "every X days/weeks/months/years" format
			if (recurrence.startsWith("every")) {
				const parts = recurrence.split(" ");
				if (parts.length >= 2) {
					let interval = 1;
					let unit = parts[1];
					if (parts.length >= 3 && !isNaN(parseInt(parts[1]))) {
						interval = parseInt(parts[1]);
						unit = parts[2];
					}
					if (unit.endsWith("s")) {
						unit = unit.substring(0, unit.length - 1);
					}

					// Start from base date
					let nextDate = new Date(baseDate);

					// Keep advancing the date until it's in the future
					while (nextDate.getTime() <= todayStart.getTime()) {
						switch (unit) {
							case "day":
								nextDate.setDate(nextDate.getDate() + interval);
								break;
							case "week":
								nextDate.setDate(
									nextDate.getDate() + interval * 7,
								);
								break;
							case "month":
								// Save the original day of month for proper month rolling
								const originalDay = baseDate.getDate();
								nextDate.setMonth(
									nextDate.getMonth() + interval,
								);
								// If day has changed (e.g., Jan 31 -> Feb 28), adjust back
								if (nextDate.getDate() !== originalDay) {
									nextDate.setDate(0); // Go to last day of previous month
								}
								break;
							case "year":
								nextDate.setFullYear(
									nextDate.getFullYear() + interval,
								);
								break;
							default:
								// Default to days if unit is not recognized
								nextDate.setDate(nextDate.getDate() + interval);
								break;
						}
					}

					// Normalize to midnight
					nextDate.setHours(0, 0, 0, 0);

					// Convert to UTC noon timestamp for consistent storage
					const year = nextDate.getFullYear();
					const month = nextDate.getMonth();
					const day = nextDate.getDate();
					return Date.UTC(year, month, day, 12, 0, 0);
				}
			}

			// Handle simple pattern like "1d", "1w", "1m", "1y"
			const simpleMatch = recurrence.match(/^(\d+)([dwmy])$/);
			if (simpleMatch) {
				const interval = parseInt(simpleMatch[1]);
				const unit = simpleMatch[2];

				let nextDate = new Date(baseDate);

				// Keep advancing the date until it's in the future
				while (nextDate.getTime() <= todayStart.getTime()) {
					switch (unit) {
						case "d":
							nextDate.setDate(nextDate.getDate() + interval);
							break;
						case "w":
							nextDate.setDate(nextDate.getDate() + interval * 7);
							break;
						case "m":
							const originalDay = baseDate.getDate();
							nextDate.setMonth(nextDate.getMonth() + interval);
							// Handle month-end edge cases
							if (nextDate.getDate() !== originalDay) {
								nextDate.setDate(0);
							}
							break;
						case "y":
							nextDate.setFullYear(
								nextDate.getFullYear() + interval,
							);
							break;
					}
				}

				// Normalize to midnight
				nextDate.setHours(0, 0, 0, 0);

				// Convert to UTC noon timestamp
				const year = nextDate.getFullYear();
				const month = nextDate.getMonth();
				const day = nextDate.getDate();
				return Date.UTC(year, month, day, 12, 0, 0);
			}

			// If we can't parse it, return tomorrow as default
			const tomorrow = new Date(todayStart);
			tomorrow.setDate(tomorrow.getDate() + 1);
			const year = tomorrow.getFullYear();
			const month = tomorrow.getMonth();
			const day = tomorrow.getDate();
			return Date.UTC(year, month, day, 12, 0, 0);
		} catch (error) {
			console.error("Error calculating next due date:", error);
			// Return tomorrow as fallback
			const tomorrow = new Date();
			tomorrow.setDate(tomorrow.getDate() + 1);
			tomorrow.setHours(0, 0, 0, 0);
			const year = tomorrow.getFullYear();
			const month = tomorrow.getMonth();
			const day = tomorrow.getDate();
			return Date.UTC(year, month, day, 12, 0, 0);
		}
	}
}
