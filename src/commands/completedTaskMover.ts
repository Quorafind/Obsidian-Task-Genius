import {
	App,
	FuzzySuggestModal,
	TFile,
	Notice,
	Editor,
	FuzzyMatch,
	SuggestModal,
	MetadataCache,
	MarkdownView,
	MarkdownFileInfo,
	moment,
} from "obsidian";
import TaskProgressBarPlugin from "../index";
import { buildIndentString, getTabSize } from "../utils";
import { t } from "../translations/helper";

/**
 * Shared utilities for task manipulation
 */
export class TaskUtils {
	// Get indentation of a line
	static getIndentation(line: string, app: App): number {
		const match = line.match(/^(\s*)/);
		return match ? match[1].length : 0;
	}

	// Get tab size from app
	static getTabSize(app: App): number {
		return getTabSize(app);
	}

	// Process custom marker with date variables
	static processCustomMarker(marker: string): string {
		// Return empty string if marker is undefined or null
		if (!marker) return "";

		// Replace {{DATE:format}} with formatted date
		return marker.replace(/\{\{DATE:([^}]+)\}\}/g, (match, format) => {
			return moment().format(format);
		});
	}

	// Process date marker with {{date}} placeholder
	static processDateMarker(marker: string): string {
		// Return empty string if marker is undefined or null
		if (!marker) return "";

		return marker.replace(/\{\{date\}\}/g, () => {
			return moment().format("YYYY-MM-DD");
		});
	}

	// Add marker to task (version, date, or custom)
	static addMarkerToTask(
		taskLine: string,
		settings: any,
		currentFile: TFile,
		app: App,
		isRoot = false
	): string {
		const {
			taskMarkerType,
			versionMarker,
			dateMarker,
			customMarker,
			withCurrentFileLink,
		} = settings.completedTaskMover;

		// Extract blockid if exists
		const blockidMatch = taskLine.match(/^(.*?)(?:\s+^[a-zA-Z0-9]{6}$)?$/);
		if (!blockidMatch) return taskLine;

		const mainContent = blockidMatch[1].trimEnd();
		const blockid = blockidMatch[2]?.trim();

		// Create base task line with marker
		let markedTaskLine = mainContent;

		// Basic check to ensure the task line doesn't already have this marker
		if (
			!(versionMarker && mainContent.includes(versionMarker)) &&
			!(dateMarker && mainContent.includes(dateMarker)) &&
			!mainContent.includes(this.processCustomMarker(customMarker))
		) {
			switch (taskMarkerType) {
				case "version":
					if (versionMarker) {
						markedTaskLine = `${mainContent} ${versionMarker}`;
					}
					break;
				case "date":
					const processedDateMarker =
						this.processDateMarker(dateMarker);
					if (processedDateMarker) {
						markedTaskLine = `${mainContent} ${processedDateMarker}`;
					}
					break;
				case "custom":
					const processedCustomMarker =
						this.processCustomMarker(customMarker);
					if (processedCustomMarker) {
						markedTaskLine = `${mainContent} ${processedCustomMarker}`;
					}
					break;
				default:
					markedTaskLine = mainContent;
			}
		}

		// Add link to the current file if setting is enabled and this is a root task
		if (withCurrentFileLink && isRoot) {
			const link = app.fileManager.generateMarkdownLink(
				currentFile,
				currentFile.path
			);
			markedTaskLine = `${markedTaskLine} from ${link}`;
		}

		// Add back the blockid if it exists
		if (blockid) {
			markedTaskLine = `${markedTaskLine} ${blockid}`;
		}

		return markedTaskLine;
	}

	// Add marker to incomplete task (version, date, or custom)
	static addMarkerToIncompletedTask(
		taskLine: string,
		settings: any,
		currentFile: TFile,
		app: App,
		isRoot = false
	): string {
		const {
			incompletedTaskMarkerType,
			incompletedVersionMarker,
			incompletedDateMarker,
			incompletedCustomMarker,
			withCurrentFileLinkForIncompleted,
		} = settings.completedTaskMover;

		// Extract blockid if exists
		const blockidMatch = taskLine.match(/^(.*?)(?:\s+^[a-zA-Z0-9]{6}$)?$/);
		if (!blockidMatch) return taskLine;

		const mainContent = blockidMatch[1].trimEnd();
		const blockid = blockidMatch[2]?.trim();

		// Create base task line with marker
		let markedTaskLine = mainContent;

		// Basic check to ensure the task line doesn't already have this marker
		if (
			!(
				incompletedVersionMarker &&
				mainContent.includes(incompletedVersionMarker)
			) &&
			!(
				incompletedDateMarker &&
				mainContent.includes(incompletedDateMarker)
			) &&
			!mainContent.includes(
				this.processCustomMarker(incompletedCustomMarker)
			)
		) {
			switch (incompletedTaskMarkerType) {
				case "version":
					if (incompletedVersionMarker) {
						markedTaskLine = `${mainContent} ${incompletedVersionMarker}`;
					}
					break;
				case "date":
					const processedDateMarker = this.processDateMarker(
						incompletedDateMarker
					);
					if (processedDateMarker) {
						markedTaskLine = `${mainContent} ${processedDateMarker}`;
					}
					break;
				case "custom":
					const processedCustomMarker = this.processCustomMarker(
						incompletedCustomMarker
					);
					if (processedCustomMarker) {
						markedTaskLine = `${mainContent} ${processedCustomMarker}`;
					}
					break;
				default:
					markedTaskLine = mainContent;
			}
		}

		// Add link to the current file if setting is enabled and this is a root task
		if (withCurrentFileLinkForIncompleted && isRoot) {
			const link = app.fileManager.generateMarkdownLink(
				currentFile,
				currentFile.path
			);
			markedTaskLine = `${markedTaskLine} from ${link}`;
		}

		// Add back the blockid if it exists
		if (blockid) {
			markedTaskLine = `${markedTaskLine} ${blockid}`;
		}

		return markedTaskLine;
	}

	// Check if a task mark represents a completed task
	static isCompletedTaskMark(mark: string, settings: any): boolean {
		const completedMarks = settings.taskStatuses.completed?.split("|") || [
			"x",
			"X",
		];

		// If treatAbandonedAsCompleted is enabled, also consider abandoned tasks as completed
		if (settings.completedTaskMover.treatAbandonedAsCompleted) {
			const abandonedMarks = settings.taskStatuses.abandoned?.split(
				"|"
			) || ["-"];
			return (
				completedMarks.includes(mark) || abandonedMarks.includes(mark)
			);
		}

		return completedMarks.includes(mark);
	}

	// Check if a task mark represents an incomplete task
	static isIncompletedTaskMark(mark: string, settings: any): boolean {
		const completedMarks = settings.taskStatuses.completed?.split("|") || [
			"x",
			"X",
		];

		// If treatAbandonedAsCompleted is enabled, also consider abandoned tasks as completed
		let abandonedMarks: string[] = [];
		if (settings.completedTaskMover.treatAbandonedAsCompleted) {
			abandonedMarks = settings.taskStatuses.abandoned?.split("|") || [
				"-",
			];
		}

		// A task is incomplete if it's not completed and not abandoned (when treated as completed)
		return !completedMarks.includes(mark) && !abandonedMarks.includes(mark);
	}

	// Complete tasks if the setting is enabled
	static completeTaskIfNeeded(taskLine: string, settings: any): string {
		// If completeAllMovedTasks is not enabled, return the original line
		if (!settings.completedTaskMover.completeAllMovedTasks) {
			return taskLine;
		}

		// Check if it's a task line with checkbox
		const taskMatch = taskLine.match(/^(\s*(?:-|\d+\.|\*)\s+\[)(.)(].*)$/);

		if (!taskMatch) {
			return taskLine; // Not a task line, return as is
		}

		// Get the completion symbol (first character in completed status)
		const completedMark =
			settings.taskStatuses.completed?.split("|")[0] || "x";

		// Replace the current mark with the completed mark
		return `${taskMatch[1]}${completedMark}${taskMatch[3]}`;
	}

	// Reset indentation for new files
	static resetIndentation(content: string, app: App): string {
		const lines = content.split("\n");

		// Find the minimum indentation in all lines
		let minIndent = Number.MAX_SAFE_INTEGER;
		for (const line of lines) {
			if (line.trim().length === 0) continue; // Skip empty lines
			const indent = this.getIndentation(line, app);
			minIndent = Math.min(minIndent, indent);
		}

		// If no valid minimum found, or it's already 0, return as is
		if (minIndent === Number.MAX_SAFE_INTEGER || minIndent === 0) {
			return content;
		}

		// Remove the minimum indentation from each line
		return lines
			.map((line) => {
				if (line.trim().length === 0) return line; // Keep empty lines unchanged
				return line.substring(minIndent);
			})
			.join("\n");
	}

	// Find the parent task index for a given task
	static findParentTaskIndex(
		taskIndex: number,
		taskIndent: number,
		allTasks: {
			line: string;
			index: number;
			indent: number;
			isCompleted: boolean;
		}[]
	): number {
		// Look for the closest task with one level less indentation
		for (
			let i = allTasks.findIndex((t) => t.index === taskIndex) - 1;
			i >= 0;
			i--
		) {
			if (allTasks[i].indent < taskIndent) {
				return allTasks[i].index;
			}
		}
		return -1;
	}

	// Adjust indentation for target files
	// Adjust indentation for target files
	static adjustIndentation(
		taskContent: string,
		targetIndent: number,
		app: App
	): string {
		const lines = taskContent.split("\n");

		// Get the indentation of the first line (parent task)
		const firstLineIndent = this.getIndentation(lines[0], app);

		// Calculate the indentation difference
		const indentDiff = targetIndent - firstLineIndent;

		if (indentDiff === 0) {
			return taskContent;
		}

		// Adjust indentation for all lines, maintaining relative hierarchy
		return lines
			.map((line, index) => {
				const currentIndent = this.getIndentation(line, app);

				// For the first line (parent task), set exactly to targetIndent
				if (index === 0) {
					return (
						buildIndentString(app).repeat(targetIndent) +
						line.substring(currentIndent)
					);
				}

				// For child tasks, maintain relative indentation difference from parent
				// Calculate relative indent level compared to the parent task
				const relativeIndent = currentIndent - firstLineIndent;

				// Apply the new base indentation plus the relative indent
				const newIndent = Math.max(0, targetIndent + relativeIndent);

				return (
					buildIndentString(app).repeat(newIndent / getTabSize(app)) +
					line.trimStart()
				);
			})
			.join("\n");
	}

	// Process tasks from multiple selected lines
	static processSelectedTasks(
		editor: Editor,
		taskLines: number[],
		moveMode:
			| "allCompleted"
			| "directChildren"
			| "all"
			| "allIncompleted"
			| "directIncompletedChildren",
		settings: any,
		currentFile: TFile,
		app: App,
		isSourceFile: boolean = true
	): {
		content: string;
		linesToRemove: number[];
	} {
		// Sort task lines in descending order to process bottom-up
		const sortedTaskLines = [...taskLines].sort((a, b) => b - a);

		// Use Sets to avoid duplicates for lines to remove and content to copy
		const linesToRemoveSet = new Set<number>();
		const contentMap = new Map<number, string[]>();

		// First pass: collect all lines to remove and content to copy
		for (const taskLine of sortedTaskLines) {
			const result = this.processSingleSelectedTask(
				editor,
				taskLine,
				moveMode,
				settings,
				currentFile,
				app,
				isSourceFile
			);

			// Store content lines for this task
			contentMap.set(taskLine, result.content.split("\n"));

			// Add lines to remove to the set
			result.linesToRemove.forEach((line) => linesToRemoveSet.add(line));
		}

		// Second pass: build the final content by properly ordering task content
		// Sort tasks from top to bottom for content ordering
		const orderedTaskLines = [...taskLines].sort((a, b) => a - b);

		const allResultLines: string[] = [];

		// Process each task in order (top to bottom)
		for (let i = 0; i < orderedTaskLines.length; i++) {
			const taskLine = orderedTaskLines[i];

			// Skip if this task is contained within another task's removal range
			if (
				orderedTaskLines.some((otherLine) => {
					if (otherLine === taskLine) return false;

					const content = editor.getValue();
					const lines = content.split("\n");
					const otherIndent = this.getIndentation(
						lines[otherLine],
						app
					);
					const taskIndent = this.getIndentation(
						lines[taskLine],
						app
					);

					// Check if this task is a subtask of another selected task
					return (
						taskLine > otherLine &&
						taskIndent > otherIndent &&
						!orderedTaskLines.some(
							(line) =>
								line > otherLine &&
								line < taskLine &&
								this.getIndentation(lines[line], app) <=
									otherIndent
						)
					);
				})
			) {
				continue;
			}

			// Add a blank line between task groups if not the first task
			if (allResultLines.length > 0) {
				allResultLines.push("");
			}

			// Add the content for this task
			const taskContent = contentMap.get(taskLine);
			if (taskContent) {
				allResultLines.push(...taskContent);
			}
		}

		// Convert the set to an array
		const allLinesToRemove = Array.from(linesToRemoveSet);

		return {
			content: allResultLines
				.filter((line) => line.trim() !== "")
				.join("\n"),
			linesToRemove: allLinesToRemove,
		};
	}

	// Process a single selected task
	static processSingleSelectedTask(
		editor: Editor,
		taskLine: number,
		moveMode:
			| "allCompleted"
			| "directChildren"
			| "all"
			| "allIncompleted"
			| "directIncompletedChildren",
		settings: any,
		currentFile: TFile,
		app: App,
		isSourceFile: boolean = true
	): {
		content: string;
		linesToRemove: number[];
	} {
		const content = editor.getValue();
		const lines = content.split("\n");
		const resultLines: string[] = [];
		const linesToRemove: number[] = [];

		// Get the current task line
		const currentLine = lines[taskLine];
		const currentIndent = this.getIndentation(currentLine, app);

		// Extract the parent task's mark
		const parentTaskMatch = currentLine.match(/\[(.)]/);
		const parentTaskMark = parentTaskMatch ? parentTaskMatch[1] : "";

		// Clone parent task with marker based on move mode
		let parentTaskWithMarker: string;
		if (
			moveMode === "allIncompleted" ||
			moveMode === "directIncompletedChildren"
		) {
			parentTaskWithMarker = this.addMarkerToIncompletedTask(
				currentLine,
				settings,
				currentFile,
				app,
				true
			);
		} else {
			parentTaskWithMarker = this.addMarkerToTask(
				currentLine,
				settings,
				currentFile,
				app,
				true
			);
			// Complete parent task if setting is enabled (only for completed task modes)
			parentTaskWithMarker = this.completeTaskIfNeeded(
				parentTaskWithMarker,
				settings
			);
		}

		// Include the current line and completed child tasks
		resultLines.push(parentTaskWithMarker);

		// If we're moving all subtasks, we'll collect them all
		if (moveMode === "all") {
			for (let i = taskLine + 1; i < lines.length; i++) {
				const line = lines[i];
				const lineIndent = this.getIndentation(line, app);

				// If indentation is less or equal to current task, we've exited the child tasks
				if (lineIndent <= currentIndent) {
					break;
				}

				resultLines.push(this.completeTaskIfNeeded(line, settings));
				linesToRemove.push(i);
			}

			// Add the main task line to remove
			linesToRemove.push(taskLine);
		}
		// If we're moving only completed tasks or direct children
		else {
			// First pass: collect all child tasks to analyze
			const childTasks: {
				line: string;
				index: number;
				indent: number;
				isCompleted: boolean;
				isIncompleted: boolean;
			}[] = [];

			for (let i = taskLine + 1; i < lines.length; i++) {
				const line = lines[i];
				const lineIndent = this.getIndentation(line, app);

				// If indentation is less or equal to current task, we've exited the child tasks
				if (lineIndent <= currentIndent) {
					break;
				}

				// Check if this is a task
				const taskMatch = line.match(/\[(.)]/);
				if (taskMatch) {
					const taskMark = taskMatch[1];
					const isCompleted = this.isCompletedTaskMark(
						taskMark,
						settings
					);
					const isIncompleted = this.isIncompletedTaskMark(
						taskMark,
						settings
					);

					childTasks.push({
						line,
						index: i,
						indent: lineIndent,
						isCompleted,
						isIncompleted,
					});
				} else {
					// Non-task lines should be included with their related task
					childTasks.push({
						line,
						index: i,
						indent: lineIndent,
						isCompleted: false, // Non-task lines aren't completed
						isIncompleted: false, // Non-task lines aren't incomplete either
					});
				}
			}

			// Process child tasks based on the mode
			if (moveMode === "allCompleted") {
				// Only include completed tasks (and their children)
				const completedTasks = new Set<number>();
				const tasksToInclude = new Set<number>();
				const parentTasksToPreserve = new Set<number>();

				// First identify all completed tasks
				childTasks.forEach((task) => {
					if (task.isCompleted) {
						completedTasks.add(task.index);
						tasksToInclude.add(task.index);

						// Add all parent tasks up to the root task
						let currentTask = task;
						let parentIndex = this.findParentTaskIndex(
							currentTask.index,
							currentTask.indent,
							childTasks
						);

						while (parentIndex !== -1) {
							tasksToInclude.add(parentIndex);
							// Only mark parent tasks for removal if they're completed
							const parentTask = childTasks.find(
								(t) => t.index === parentIndex
							);
							if (!parentTask) break;

							if (!parentTask.isCompleted) {
								parentTasksToPreserve.add(parentIndex);
							}

							parentIndex = this.findParentTaskIndex(
								parentTask.index,
								parentTask.indent,
								childTasks
							);
						}
					}
				});

				// Then include all children of completed tasks
				childTasks.forEach((task) => {
					const parentIndex = this.findParentTaskIndex(
						task.index,
						task.indent,
						childTasks
					);
					if (parentIndex !== -1 && completedTasks.has(parentIndex)) {
						tasksToInclude.add(task.index);
					}
				});

				// Add the selected items to results, sorting by index to maintain order
				const tasksByIndex = [...tasksToInclude].sort((a, b) => a - b);

				resultLines.length = 0; // Clear resultLines before rebuilding

				// Add parent task with marker
				resultLines.push(parentTaskWithMarker);

				// Add child tasks in order
				for (const taskIndex of tasksByIndex) {
					const task = childTasks.find((t) => t.index === taskIndex);
					if (!task) continue;

					// Add marker to parent tasks that are preserved
					if (parentTasksToPreserve.has(taskIndex)) {
						let taskLine = this.addMarkerToTask(
							task.line,
							settings,
							currentFile,
							app,
							false
						);
						// Complete the task if setting is enabled
						taskLine = this.completeTaskIfNeeded(
							taskLine,
							settings
						);
						resultLines.push(taskLine);
					} else {
						// Complete the task if setting is enabled
						resultLines.push(
							this.completeTaskIfNeeded(task.line, settings)
						);
					}

					// Only add to linesToRemove if it's completed or a child of completed
					if (!parentTasksToPreserve.has(taskIndex)) {
						linesToRemove.push(taskIndex);
					}
				}

				// If parent task is completed, add it to lines to remove
				if (this.isCompletedTaskMark(parentTaskMark, settings)) {
					linesToRemove.push(taskLine);
				}
			} else if (moveMode === "directChildren") {
				// Only include direct children that are completed
				const completedDirectChildren = new Set<number>();

				// Determine the minimum indentation level of direct children
				let minChildIndent = Number.MAX_SAFE_INTEGER;
				for (const task of childTasks) {
					if (
						task.indent > currentIndent &&
						task.indent < minChildIndent
					) {
						minChildIndent = task.indent;
					}
				}

				// Now identify all direct children using the calculated indentation
				for (const task of childTasks) {
					const isDirectChild = task.indent === minChildIndent;
					if (isDirectChild && task.isCompleted) {
						completedDirectChildren.add(task.index);
					}
				}

				// Include all identified direct completed children and their subtasks
				resultLines.length = 0; // Clear resultLines before rebuilding

				// Add parent task with marker
				resultLines.push(parentTaskWithMarker);

				// Add direct completed children in order
				const sortedChildIndices = [...completedDirectChildren].sort(
					(a, b) => a - b
				);
				for (const taskIndex of sortedChildIndices) {
					// Add the direct completed child
					const task = childTasks.find((t) => t.index === taskIndex);
					if (!task) continue;

					resultLines.push(
						this.completeTaskIfNeeded(task.line, settings)
					);
					linesToRemove.push(taskIndex);

					// Add all its subtasks (regardless of completion status)
					let i =
						childTasks.findIndex((t) => t.index === taskIndex) + 1;
					const taskIndent = task.indent;

					while (i < childTasks.length) {
						const subtask = childTasks[i];
						if (subtask.indent <= taskIndent) break; // Exit if we're back at same or lower indent level

						resultLines.push(
							this.completeTaskIfNeeded(subtask.line, settings)
						);
						linesToRemove.push(subtask.index);
						i++;
					}
				}

				// If parent task is completed, add it to lines to remove
				if (this.isCompletedTaskMark(parentTaskMark, settings)) {
					linesToRemove.push(taskLine);
				}
			} else if (moveMode === "allIncompleted") {
				// Only include incomplete tasks (and their children)
				const incompletedTasks = new Set<number>();
				const tasksToInclude = new Set<number>();
				const parentTasksToPreserve = new Set<number>();

				// First identify all incomplete tasks
				childTasks.forEach((task) => {
					if (task.isIncompleted) {
						incompletedTasks.add(task.index);
						tasksToInclude.add(task.index);

						// Add all parent tasks up to the root task
						let currentTask = task;
						let parentIndex = this.findParentTaskIndex(
							currentTask.index,
							currentTask.indent,
							childTasks
						);

						while (parentIndex !== -1) {
							tasksToInclude.add(parentIndex);
							// Only mark parent tasks for removal if they're incomplete
							const parentTask = childTasks.find(
								(t) => t.index === parentIndex
							);
							if (!parentTask) break;

							if (!parentTask.isIncompleted) {
								parentTasksToPreserve.add(parentIndex);
							}

							parentIndex = this.findParentTaskIndex(
								parentTask.index,
								parentTask.indent,
								childTasks
							);
						}
					}
				});

				// Then include all children of incomplete tasks
				childTasks.forEach((task) => {
					const parentIndex = this.findParentTaskIndex(
						task.index,
						task.indent,
						childTasks
					);
					if (
						parentIndex !== -1 &&
						incompletedTasks.has(parentIndex)
					) {
						tasksToInclude.add(task.index);
					}
				});

				// Add the selected items to results, sorting by index to maintain order
				const tasksByIndex = [...tasksToInclude].sort((a, b) => a - b);

				resultLines.length = 0; // Clear resultLines before rebuilding

				// Add parent task with marker
				resultLines.push(parentTaskWithMarker);

				// Add child tasks in order
				for (const taskIndex of tasksByIndex) {
					const task = childTasks.find((t) => t.index === taskIndex);
					if (!task) continue;

					// Add marker to parent tasks that are preserved
					if (parentTasksToPreserve.has(taskIndex)) {
						let taskLine = this.addMarkerToIncompletedTask(
							task.line,
							settings,
							currentFile,
							app,
							false
						);
						resultLines.push(taskLine);
					} else {
						// Keep the task as is (don't complete it)
						resultLines.push(task.line);
					}

					// Only add to linesToRemove if it's incomplete or a child of incomplete
					if (!parentTasksToPreserve.has(taskIndex)) {
						linesToRemove.push(taskIndex);
					}
				}

				// If parent task is incomplete, add it to lines to remove
				if (this.isIncompletedTaskMark(parentTaskMark, settings)) {
					linesToRemove.push(taskLine);
				}
			} else if (moveMode === "directIncompletedChildren") {
				// Only include direct children that are incomplete
				const incompletedDirectChildren = new Set<number>();

				// Determine the minimum indentation level of direct children
				let minChildIndent = Number.MAX_SAFE_INTEGER;
				for (const task of childTasks) {
					if (
						task.indent > currentIndent &&
						task.indent < minChildIndent
					) {
						minChildIndent = task.indent;
					}
				}

				// Now identify all direct children using the calculated indentation
				for (const task of childTasks) {
					const isDirectChild = task.indent === minChildIndent;
					if (isDirectChild && task.isIncompleted) {
						incompletedDirectChildren.add(task.index);
					}
				}

				// Include all identified direct incomplete children and their subtasks
				resultLines.length = 0; // Clear resultLines before rebuilding

				// Add parent task with marker
				resultLines.push(parentTaskWithMarker);

				// Add direct incomplete children in order
				const sortedChildIndices = [...incompletedDirectChildren].sort(
					(a, b) => a - b
				);
				for (const taskIndex of sortedChildIndices) {
					// Add the direct incomplete child
					const task = childTasks.find((t) => t.index === taskIndex);
					if (!task) continue;

					resultLines.push(task.line);
					linesToRemove.push(taskIndex);

					// Add all its subtasks (regardless of completion status)
					let i =
						childTasks.findIndex((t) => t.index === taskIndex) + 1;
					const taskIndent = task.indent;

					while (i < childTasks.length) {
						const subtask = childTasks[i];
						if (subtask.indent <= taskIndent) break; // Exit if we're back at same or lower indent level

						resultLines.push(subtask.line);
						linesToRemove.push(subtask.index);
						i++;
					}
				}

				// If parent task is incomplete, add it to lines to remove
				if (this.isIncompletedTaskMark(parentTaskMark, settings)) {
					linesToRemove.push(taskLine);
				}
			}
		}

		return {
			content: resultLines.join("\n"),
			linesToRemove: linesToRemove,
		};
	}

	// Remove tasks from source file
	static removeTasksFromFile(editor: Editor, linesToRemove: number[]): void {
		if (!linesToRemove || linesToRemove.length === 0) {
			return;
		}

		const content = editor.getValue();
		const lines = content.split("\n");

		// Get lines to remove (sorted in descending order to avoid index shifting)
		const sortedLinesToRemove = [...linesToRemove].sort((a, b) => b - a);

		// Create a transaction to remove the lines
		editor.transaction({
			changes: sortedLinesToRemove.map((lineIndex) => {
				// Calculate start and end positions
				const startPos = {
					line: lineIndex,
					ch: 0,
				};

				// For the end position, use the next line's start or end of document
				const endPos =
					lineIndex + 1 < lines.length
						? { line: lineIndex + 1, ch: 0 }
						: { line: lineIndex, ch: lines[lineIndex].length };

				return {
					from: startPos,
					to: endPos,
					text: "",
				};
			}),
		});
	}
}

/**
 * Modal for selecting a target file to move completed tasks to
 */
export class CompletedTaskFileSelectionModal extends FuzzySuggestModal<
	TFile | string
> {
	plugin: TaskProgressBarPlugin;
	editor: Editor;
	currentFile: TFile;
	taskLines: number[];
	moveMode:
		| "allCompleted"
		| "directChildren"
		| "all"
		| "allIncompleted"
		| "directIncompletedChildren";

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		editor: Editor,
		currentFile: TFile,
		taskLines: number[],
		moveMode:
			| "allCompleted"
			| "directChildren"
			| "all"
			| "allIncompleted"
			| "directIncompletedChildren"
	) {
		super(app);
		this.plugin = plugin;
		this.editor = editor;
		this.currentFile = currentFile;
		this.taskLines = taskLines;
		this.moveMode = moveMode;
		this.setPlaceholder("Select a file or type to create a new one");
	}

	getItems(): (TFile | string)[] {
		// Get all markdown files
		const files = this.app.vault.getMarkdownFiles();

		// Filter out the current file
		const filteredFiles = files.filter(
			(file) => file.path !== this.currentFile.path
		);

		// Sort files by path
		filteredFiles.sort((a, b) => a.path.localeCompare(b.path));

		return filteredFiles;
	}

	getItemText(item: TFile | string): string {
		if (typeof item === "string") {
			return `Create new file: ${item}`;
		}
		return item.path;
	}

	renderSuggestion(item: FuzzyMatch<TFile | string>, el: HTMLElement): void {
		const match = item.item;
		if (typeof match === "string") {
			el.createEl("div", { text: `${t("Create new file:")} ${match}` });
		} else {
			el.createEl("div", { text: match.path });
		}
	}

	onChooseItem(item: TFile | string, evt: MouseEvent | KeyboardEvent): void {
		if (typeof item === "string") {
			// Create a new file
			this.createNewFileWithTasks(item);
		} else {
			// Show modal to select insertion point in existing file
			new CompletedTaskBlockSelectionModal(
				this.app,
				this.plugin,
				this.editor,
				this.currentFile,
				item,
				this.taskLines,
				this.moveMode
			).open();
		}
	}

	// If the query doesn't match any existing files, add an option to create a new file
	getSuggestions(query: string): FuzzyMatch<TFile | string>[] {
		const suggestions = super.getSuggestions(query);

		if (
			query &&
			!suggestions.some(
				(match) =>
					typeof match.item === "string" && match.item === query
			)
		) {
			// Check if it's a valid file path
			if (this.isValidFileName(query)) {
				// Add option to create a new file with this name
				suggestions.push({
					item: query,
					match: { score: 1, matches: [] },
				} as FuzzyMatch<string>);
			}
		}

		// Limit results to 20 to avoid performance issues
		return suggestions.slice(0, 20);
	}

	private isValidFileName(name: string): boolean {
		// Basic validation for file names
		return name.length > 0 && !name.includes("/") && !name.includes("\\");
	}

	private async createNewFileWithTasks(fileName: string) {
		try {
			// Ensure file name has .md extension
			if (!fileName.endsWith(".md")) {
				fileName += ".md";
			}

			// Get completed tasks content
			const { content, linesToRemove } = TaskUtils.processSelectedTasks(
				this.editor,
				this.taskLines,
				this.moveMode,
				this.plugin.settings,
				this.currentFile,
				this.app
			);

			// Reset indentation for new file (remove all indentation from tasks)
			const resetIndentContent = TaskUtils.resetIndentation(
				content,
				this.app
			);

			// Create file in the same folder as current file
			const folder = this.currentFile.parent;
			const filePath = folder ? `${folder.path}/${fileName}` : fileName;

			// Create the file
			const newFile = await this.app.vault.create(
				filePath,
				resetIndentContent
			);

			// Remove the completed tasks from the current file
			TaskUtils.removeTasksFromFile(this.editor, linesToRemove);

			// Open the new file
			this.app.workspace.getLeaf(true).openFile(newFile);

			new Notice(`${t("Completed tasks moved to")} ${fileName}`);
		} catch (error) {
			new Notice(`${t("Failed to create file:")} ${error}`);
			console.error(error);
		}
	}
}

/**
 * Modal for selecting a block to insert after in the target file
 */
export class CompletedTaskBlockSelectionModal extends SuggestModal<{
	id: string;
	text: string;
	level: number;
}> {
	plugin: TaskProgressBarPlugin;
	editor: Editor;
	sourceFile: TFile;
	targetFile: TFile;
	taskLines: number[];
	metadataCache: MetadataCache;
	moveMode:
		| "allCompleted"
		| "directChildren"
		| "all"
		| "allIncompleted"
		| "directIncompletedChildren";

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		editor: Editor,
		sourceFile: TFile,
		targetFile: TFile,
		taskLines: number[],
		moveMode:
			| "allCompleted"
			| "directChildren"
			| "all"
			| "allIncompleted"
			| "directIncompletedChildren"
	) {
		super(app);
		this.plugin = plugin;
		this.editor = editor;
		this.sourceFile = sourceFile;
		this.targetFile = targetFile;
		this.taskLines = taskLines;
		this.metadataCache = app.metadataCache;
		this.moveMode = moveMode;
		this.setPlaceholder("Select a block to insert after");
	}

	async getSuggestions(
		query: string
	): Promise<{ id: string; text: string; level: number }[]> {
		// Get file content
		const fileContent = await this.app.vault.read(this.targetFile);
		const lines = fileContent.split("\n");

		// Get file cache to find headings and list items
		const fileCache = this.metadataCache.getFileCache(this.targetFile);

		let blocks: { id: string; text: string; level: number }[] = [];

		// Add an option to insert at the beginning of the file
		blocks.push({
			id: "beginning",
			text: t("Beginning of file"),
			level: 0,
		});

		blocks.push({
			id: "end",
			text: t("End of file"),
			level: 0,
		});

		// Add headings
		if (fileCache && fileCache.headings) {
			for (const heading of fileCache.headings) {
				const text = lines[heading.position.start.line];
				blocks.push({
					id: `heading-${heading.position.start.line}`,
					text: text,
					level: heading.level,
				});
			}
		}

		// Add list items
		if (fileCache && fileCache.listItems) {
			for (const listItem of fileCache.listItems) {
				const text = lines[listItem.position.start.line];
				blocks.push({
					id: `list-${listItem.position.start.line}`,
					text: text,
					level: TaskUtils.getIndentation(text, this.app),
				});
			}
		}

		// Filter blocks based on query
		if (query) {
			blocks = blocks.filter((block) =>
				block.text.toLowerCase().includes(query.toLowerCase())
			);
		}

		// Limit results to 20 to avoid performance issues
		return blocks.slice(0, 20);
	}

	renderSuggestion(
		block: { id: string; text: string; level: number },
		el: HTMLElement
	) {
		const indent = "  ".repeat(block.level);

		if (block.id === "beginning" || block.id === "end") {
			el.createEl("div", { text: block.text });
		} else {
			el.createEl("div", { text: `${indent}${block.text}` });
		}
	}

	onChooseSuggestion(
		block: { id: string; text: string; level: number },
		evt: MouseEvent | KeyboardEvent
	) {
		this.moveCompletedTasksToTargetFile(block);
	}

	private async moveCompletedTasksToTargetFile(block: {
		id: string;
		text: string;
		level: number;
	}) {
		try {
			// Get completed tasks content
			const { content, linesToRemove } = TaskUtils.processSelectedTasks(
				this.editor,
				this.taskLines,
				this.moveMode,
				this.plugin.settings,
				this.sourceFile,
				this.app
			);

			// Read target file content
			const fileContent = await this.app.vault.read(this.targetFile);
			const lines = fileContent.split("\n");

			let insertPosition: number;
			let indentLevel: number = 0;

			if (block.id === "beginning") {
				insertPosition = 0;
			} else if (block.id === "end") {
				insertPosition = lines.length;
			} else {
				// Extract line number from block id
				const lineMatch = block.id.match(/-(\d+)$/);
				if (!lineMatch) {
					throw new Error("Invalid block ID");
				}

				const lineNumber = parseInt(lineMatch[1]);
				insertPosition = lineNumber + 1;

				// Get indentation of the target block
				indentLevel = TaskUtils.getIndentation(
					lines[lineNumber],
					this.app
				);
			}

			// Adjust indentation of task content to match the target block
			const indentedTaskContent = TaskUtils.adjustIndentation(
				content,
				indentLevel,
				this.app
			);

			// Insert task at the position
			const newContent = [
				...lines.slice(0, insertPosition),
				indentedTaskContent,
				...lines.slice(insertPosition),
			].join("\n");

			// Update target file
			await this.app.vault.modify(this.targetFile, newContent);

			// Remove completed tasks from source file
			TaskUtils.removeTasksFromFile(this.editor, linesToRemove);

			new Notice(
				`${t("Completed tasks moved to")} ${this.targetFile.path}`
			);
		} catch (error) {
			new Notice(`${t("Failed to move tasks:")} ${error}`);
			console.error(error);
		}
	}
}

/**
 * Command to move the completed tasks to another file
 */
export function moveCompletedTasksCommand(
	checking: boolean,
	editor: Editor,
	ctx: MarkdownView | MarkdownFileInfo,
	plugin: TaskProgressBarPlugin,
	moveMode:
		| "allCompleted"
		| "directChildren"
		| "all"
		| "allIncompleted"
		| "directIncompletedChildren"
): boolean {
	// Get the current file
	const currentFile = ctx.file;

	if (checking) {
		// If checking, return true if we're in a markdown file and cursor is on a task line
		if (!currentFile || currentFile.extension !== "md") {
			return false;
		}

		const selection = editor.getSelection();
		if (selection.length === 0) {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);
			// Check if line is a task with any of the supported list markers (-, 1., *)
			return line.match(/^\s*(-|\d+\.|\*) \[(.)\]/i) !== null;
		}
		return true;
	}

	// Execute the command
	if (!currentFile) {
		new Notice(t("No active file found"));
		return false;
	}

	// Get all selections to support multi-line selection
	const selections = editor.listSelections();

	// Extract all selected lines from the selections
	const selectedLinesSet = new Set<number>();
	selections.forEach((selection) => {
		// Get the start and end lines (accounting for selection direction)
		const startLine = Math.min(selection.anchor.line, selection.head.line);
		const endLine = Math.max(selection.anchor.line, selection.head.line);

		// Add all lines in this selection range
		for (let line = startLine; line <= endLine; line++) {
			selectedLinesSet.add(line);
		}
	});

	// Convert Set to Array for further processing
	const selectedLines = Array.from(selectedLinesSet);

	new CompletedTaskFileSelectionModal(
		plugin.app,
		plugin,
		editor,
		currentFile,
		selectedLines,
		moveMode
	).open();

	return true;
}

/**
 * Command to move the incomplete tasks to another file
 */
export function moveIncompletedTasksCommand(
	checking: boolean,
	editor: Editor,
	ctx: MarkdownView | MarkdownFileInfo,
	plugin: TaskProgressBarPlugin,
	moveMode: "allIncompleted" | "directIncompletedChildren"
): boolean {
	// Get the current file
	const currentFile = ctx.file;

	if (checking) {
		// If checking, return true if we're in a markdown file and cursor is on a task line
		if (!currentFile || currentFile.extension !== "md") {
			return false;
		}

		const selection = editor.getSelection();
		if (selection.length === 0) {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);
			// Check if line is a task with any of the supported list markers (-, 1., *)
			return line.match(/^\s*(-|\d+\.|\*) \[(.)\]/i) !== null;
		}
		return true;
	}

	// Execute the command
	if (!currentFile) {
		new Notice(t("No active file found"));
		return false;
	}

	// Get all selections to support multi-line selection
	const selections = editor.listSelections();

	// Extract all selected lines from the selections
	const selectedLinesSet = new Set<number>();
	selections.forEach((selection) => {
		// Get the start and end lines (accounting for selection direction)
		const startLine = Math.min(selection.anchor.line, selection.head.line);
		const endLine = Math.max(selection.anchor.line, selection.head.line);

		// Add all lines in this selection range
		for (let line = startLine; line <= endLine; line++) {
			selectedLinesSet.add(line);
		}
	});

	// Convert Set to Array for further processing
	const selectedLines = Array.from(selectedLinesSet);

	new CompletedTaskFileSelectionModal(
		plugin.app,
		plugin,
		editor,
		currentFile,
		selectedLines,
		moveMode
	).open();

	return true;
}

/**
 * Auto-move completed tasks using default settings
 */
export async function autoMoveCompletedTasks(
	editor: Editor,
	currentFile: TFile,
	plugin: TaskProgressBarPlugin,
	taskLines: number[],
	moveMode:
		| "allCompleted"
		| "directChildren"
		| "all"
		| "allIncompleted"
		| "directIncompletedChildren"
): Promise<boolean> {
	const settings = plugin.settings.completedTaskMover;

	// Check if auto-move is enabled and default file is set
	const isCompletedMode =
		moveMode === "allCompleted" ||
		moveMode === "directChildren" ||
		moveMode === "all";
	const isAutoMoveEnabled = isCompletedMode
		? settings.enableAutoMove
		: settings.enableIncompletedAutoMove;
	const defaultTargetFile = isCompletedMode
		? settings.defaultTargetFile
		: settings.incompletedDefaultTargetFile;
	const defaultInsertionMode = isCompletedMode
		? settings.defaultInsertionMode
		: settings.incompletedDefaultInsertionMode;
	const defaultHeadingName = isCompletedMode
		? settings.defaultHeadingName
		: settings.incompletedDefaultHeadingName;

	if (!isAutoMoveEnabled || !defaultTargetFile) {
		return false; // Auto-move not configured, fall back to manual selection
	}

	try {
		// Get tasks content
		const { content, linesToRemove } = TaskUtils.processSelectedTasks(
			editor,
			taskLines,
			moveMode,
			plugin.settings,
			currentFile,
			plugin.app
		);

		// Find or create target file
		let targetFile = plugin.app.vault.getFileByPath(defaultTargetFile);

		if (!targetFile) {
			// Create the file if it doesn't exist
			targetFile = await plugin.app.vault.create(defaultTargetFile, "");
		}

		if (!(targetFile instanceof TFile)) {
			throw new Error(`Target path ${defaultTargetFile} is not a file`);
		}

		// Read target file content
		const fileContent = await plugin.app.vault.read(targetFile);
		const lines = fileContent.split("\n");

		let insertPosition: number;
		let indentLevel: number = 0;

		// Determine insertion position based on mode
		switch (defaultInsertionMode) {
			case "beginning":
				insertPosition = 0;
				break;
			case "end":
				insertPosition = lines.length;
				break;
			case "after-heading":
				// Find the heading or create it
				const headingPattern = new RegExp(
					`^#+\\s+${defaultHeadingName.replace(
						/[.*+?^${}()|[\]\\]/g,
						"\\$&"
					)}\\s*$`,
					"i"
				);
				let headingLineIndex = lines.findIndex((line) =>
					headingPattern.test(line)
				);

				if (headingLineIndex === -1) {
					// Create the heading at the end of the file
					if (
						lines.length > 0 &&
						lines[lines.length - 1].trim() !== ""
					) {
						lines.push(""); // Add empty line before heading
					}
					lines.push(`## ${defaultHeadingName}`);
					lines.push(""); // Add empty line after heading
					headingLineIndex = lines.length - 2; // Index of the heading line
				}

				insertPosition = headingLineIndex + 1;
				// Skip any empty lines after the heading
				while (
					insertPosition < lines.length &&
					lines[insertPosition].trim() === ""
				) {
					insertPosition++;
				}
				break;
			default:
				insertPosition = lines.length;
		}

		// Adjust indentation of task content
		const indentedTaskContent = TaskUtils.adjustIndentation(
			content,
			indentLevel,
			plugin.app
		);

		// Insert task at the position
		const newContent = [
			...lines.slice(0, insertPosition),
			indentedTaskContent,
			...lines.slice(insertPosition),
		].join("\n");

		// Update target file
		await plugin.app.vault.modify(targetFile, newContent);

		// Remove tasks from source file
		TaskUtils.removeTasksFromFile(editor, linesToRemove);

		const taskType = isCompletedMode ? "completed" : "incomplete";
		new Notice(
			`${t("Auto-moved")} ${taskType} ${t(
				"tasks to"
			)} ${defaultTargetFile}`
		);

		return true;
	} catch (error) {
		new Notice(`${t("Failed to auto-move tasks:")} ${error}`);
		console.error(error);
		return false;
	}
}

/**
 * Command to auto-move completed tasks using default settings
 */
export function autoMoveCompletedTasksCommand(
	checking: boolean,
	editor: Editor,
	ctx: MarkdownView | MarkdownFileInfo,
	plugin: TaskProgressBarPlugin,
	moveMode:
		| "allCompleted"
		| "directChildren"
		| "all"
		| "allIncompleted"
		| "directIncompletedChildren"
): boolean {
	// Get the current file
	const currentFile = ctx.file;

	if (checking) {
		// Check if auto-move is enabled for this mode
		const isCompletedMode =
			moveMode === "allCompleted" ||
			moveMode === "directChildren" ||
			moveMode === "all";
		const isAutoMoveEnabled = isCompletedMode
			? plugin.settings.completedTaskMover.enableAutoMove
			: plugin.settings.completedTaskMover.enableIncompletedAutoMove;
		const defaultTargetFile = isCompletedMode
			? plugin.settings.completedTaskMover.defaultTargetFile
			: plugin.settings.completedTaskMover.incompletedDefaultTargetFile;

		if (!isAutoMoveEnabled || !defaultTargetFile) {
			return false; // Auto-move not configured
		}

		// If checking, return true if we're in a markdown file and cursor is on a task line
		if (!currentFile || currentFile.extension !== "md") {
			return false;
		}

		const selection = editor.getSelection();
		if (selection.length === 0) {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);
			// Check if line is a task with any of the supported list markers (-, 1., *)
			return line.match(/^\s*(-|\d+\.|\*) \[(.)\]/i) !== null;
		}
		return true;
	}

	// Execute the command
	if (!currentFile) {
		new Notice(t("No active file found"));
		return false;
	}

	// Get all selections to support multi-line selection
	const selections = editor.listSelections();

	// Extract all selected lines from the selections
	const selectedLinesSet = new Set<number>();
	selections.forEach((selection) => {
		// Get the start and end lines (accounting for selection direction)
		const startLine = Math.min(selection.anchor.line, selection.head.line);
		const endLine = Math.max(selection.anchor.line, selection.head.line);

		// Add all lines in this selection range
		for (let line = startLine; line <= endLine; line++) {
			selectedLinesSet.add(line);
		}
	});

	// Convert Set to Array for further processing
	const selectedLines = Array.from(selectedLinesSet);

	// Try auto-move first, fall back to manual selection if it fails
	autoMoveCompletedTasks(
		editor,
		currentFile,
		plugin,
		selectedLines,
		moveMode
	).then((success) => {
		if (!success) {
			// Fall back to manual selection
			new CompletedTaskFileSelectionModal(
				plugin.app,
				plugin,
				editor,
				currentFile,
				selectedLines,
				moveMode
			).open();
		}
	});

	return true;
}
