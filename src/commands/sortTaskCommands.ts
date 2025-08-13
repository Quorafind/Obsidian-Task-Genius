import { EditorView } from "@codemirror/view";
import { Notice } from "obsidian";
import { parseTaskLine, MetadataFormat } from "../utils/taskUtil";
import { Task as IndexerTask } from "../types/task";
import TaskProgressBarPlugin from "../index";
import {
	TaskProgressBarSettings,
	SortCriterion,
	DEFAULT_SETTINGS,
} from "../common/setting-definition";
import { t } from "../translations/helper";

// Task statuses (aligned with common usage and sorting needs)
export enum SortableTaskStatus {
	Overdue = "overdue", // Calculated, not a raw status
	DueSoon = "due_soon", // Calculated, not a raw status - Placeholder
	InProgress = "/",
	Incomplete = " ",
	Forwarded = ">",
	Question = "?",
	// Add other non-completed, non-cancelled statuses here
	Completed = "x",
	Cancelled = "-",
	// Add other terminal statuses here
}

// Interface for tasks used within the sorting command, closely matching IndexerTask
// We add calculated fields needed for sorting
export interface SortableTask
	extends Omit<
		IndexerTask,
		"id" | "children" | "parent" | "filePath" | "line"
	> {
	id: string; // Use generated ID like line-${lineNumber} or keep parsed one? Let's keep parsed one.
	lineNumber: number; // 0-based, relative to document start
	indentation: number;
	children: SortableTask[];
	parent?: SortableTask;
	calculatedStatus: SortableTaskStatus | string; // Status used for sorting
	// Fields mapped from parsed Task
	originalMarkdown: string;
	status: string;
	completed: boolean;
	content: string;
	priority?: number;
	dueDate?: number;
	startDate?: number;
	scheduledDate?: number;
	tags: string[]; // Changed from tags? to tags to match base Task interface
	// Add any other fields from IndexerTask if needed by sorting criteria
	// createdDate?: number;
	// completedDate?: number;
	// recurrence?: string;
	// project?: string;
	// context?: string;
	// tags?: string[]; // Keep tags if needed for sorting/filtering later? Not currently used.
}

// Simple function to get indentation (tabs or spaces)
function getIndentationLevel(line: string): number {
	const match = line.match(/^(\s*)/);
	if (!match) return 0;
	// Simple approach: count characters. Could refine to handle tabs vs spaces if necessary.
	return match[1].length;
}

// --- Refactored Task Parsing using taskUtil ---
export function parseTasksForSorting(
	blockText: string,
	lineOffset: number = 0,
	filePath: string, // Added filePath
	format: MetadataFormat, // Added format
	plugin?: TaskProgressBarPlugin // Added plugin for configurable prefix support
): SortableTask[] {
	const lines = blockText.split("\n");
	const tasks: SortableTask[] = [];
	// taskMap uses the absolute line number as key
	const taskMap: { [lineNumber: number]: SortableTask } = {};
	let currentParentStack: SortableTask[] = [];

	lines.forEach((line, index) => {
		const lineNumber = lineOffset + index; // Calculate absolute line number (0-based)

		// Use the robust parser from taskUtil
		// Note: parseTaskLine expects 1-based line number for ID generation, pass lineNumber + 1
		const parsedTask = parseTaskLine(
			filePath,
			line,
			lineNumber + 1,
			format,
			plugin // Pass plugin for configurable prefix support
		); // Pass 1-based line number

		if (parsedTask) {
			// We have a valid task line, now map it to SortableTask
			const indentation = getIndentationLevel(line);

			// --- Calculate Sortable Status ---
			let calculatedStatus: SortableTaskStatus | string =
				parsedTask.status;
			const now = new Date();
			now.setHours(0, 0, 0, 0);
			const todayTimestamp = now.getTime();

			if (
				!parsedTask.completed &&
				parsedTask.status !== SortableTaskStatus.Cancelled && // Compare against enum
				parsedTask.metadata.dueDate &&
				parsedTask.metadata.dueDate < todayTimestamp
			) {
				calculatedStatus = SortableTaskStatus.Overdue; // Use enum
			} else {
				// Ensure the original status maps to the enum if possible
				calculatedStatus = Object.values(SortableTaskStatus).includes(
					parsedTask.status as SortableTaskStatus
				)
					? (parsedTask.status as SortableTaskStatus)
					: parsedTask.status;
			}

			// --- Create SortableTask ---
			const sortableTask: SortableTask = {
				// Map fields from parsedTask
				id: parsedTask.id, // Use ID from parser
				originalMarkdown: parsedTask.originalMarkdown,
				status: parsedTask.status,
				completed: parsedTask.completed,
				content: parsedTask.content,
				priority: parsedTask.metadata.priority,
				dueDate: parsedTask.metadata.dueDate,
				startDate: parsedTask.metadata.startDate,
				scheduledDate: parsedTask.metadata.scheduledDate,
				tags: parsedTask.metadata.tags || [], // Map tags, default to empty array
				// Fields specific to SortableTask / required for sorting logic
				lineNumber: lineNumber, // Keep 0-based line number for sorting stability
				indentation: indentation,
				children: [],
				calculatedStatus: calculatedStatus,
				metadata: parsedTask.metadata,
				// parent will be set below
			};

			// --- Build Hierarchy ---
			taskMap[lineNumber] = sortableTask; // Use 0-based absolute line number

			// Find parent based on indentation
			while (
				currentParentStack.length > 0 &&
				indentation <= // Child must have greater indentation than parent
					currentParentStack[currentParentStack.length - 1]
						.indentation
			) {
				currentParentStack.pop();
			}

			if (currentParentStack.length > 0) {
				const parent =
					currentParentStack[currentParentStack.length - 1];
				parent.children.push(sortableTask);
				sortableTask.parent = parent;
			} else {
				tasks.push(sortableTask); // Add as top-level task within the block
			}

			currentParentStack.push(sortableTask); // Push current task onto stack
		} else {
			// Non-task line encountered
			// Keep the stack, assuming tasks under a non-task might still be related hierarchically.
		}
	});

	return tasks; // Return top-level tasks found within the block
}

// --- 3. Sorting Logic ---

// Generates the status order map based on plugin settings
function getDynamicStatusOrder(settings: TaskProgressBarSettings): {
	[key: string]: number;
} {
	const order: { [key: string]: number } = {};
	let currentOrder = 1;

	// --- High Priority Statuses ---
	// Always put Overdue first
	order[SortableTaskStatus.Overdue] = currentOrder++;
	// Optionally add DueSoon if defined and needed
	// order[SortableTaskStatus.DueSoon] = currentOrder++;

	// --- Statuses from Cycle ---
	const cycle = settings.taskStatusCycle || [];
	const marks = settings.taskStatusMarks || {};
	const exclude = settings.excludeMarksFromCycle || [];
	const completedMarkers = (settings.taskStatuses?.completed || "x|X").split(
		"|"
	);
	const cancelledMarkers = (settings.taskStatuses?.abandoned || "-").split(
		"|"
	); // Example: Use abandoned as cancelled

	const includedInCycle: string[] = [];
	const completedInCycle: string[] = [];
	const cancelledInCycle: string[] = [];

	// Iterate through the defined cycle
	for (const statusName of cycle) {
		const mark = marks[statusName];
		if (mark && !exclude.includes(statusName)) {
			// Check if this status is considered completed or cancelled
			if (completedMarkers.includes(mark)) {
				completedInCycle.push(mark);
			} else if (cancelledMarkers.includes(mark)) {
				cancelledInCycle.push(mark);
			} else {
				// Add other statuses in their cycle order
				if (!(mark in order)) {
					// Avoid overwriting Overdue/DueSoon if their marks somehow appear
					order[mark] = currentOrder++;
				}
				includedInCycle.push(mark);
			}
		}
	}

	// --- Add Completed and Cancelled Statuses (from cycle) at the end ---
	// Place completed statuses towards the end
	completedInCycle.forEach((mark) => {
		if (!(mark in order)) {
			order[mark] = 98; // Assign a high number for sorting towards the end
		}
	});
	// Place cancelled statuses last
	cancelledInCycle.forEach((mark) => {
		if (!(mark in order)) {
			order[mark] = 99; // Assign the highest number
		}
	});

	// --- Fallback for statuses defined in settings but not in the cycle ---
	// (This part might be complex depending on desired behavior for statuses outside the cycle)
	// Example: Add all defined marks from settings.taskStatuses if they aren't already in the order map.
	for (const statusType in settings.taskStatuses) {
		const markers = (settings.taskStatuses[statusType] || "").split("|");
		markers.forEach((mark) => {
			if (mark && !(mark in order)) {
				// Decide where to put these: maybe group them?
				// Simple approach: put them after cycle statuses but before completed/cancelled defaults
				if (completedMarkers.includes(mark)) {
					order[mark] = 98;
				} else if (cancelledMarkers.includes(mark)) {
					order[mark] = 99;
				} else {
					order[mark] = currentOrder++; // Add after the main cycle items
				}
			}
		});
	}

	// Ensure default ' ' and 'x' have some order if not defined elsewhere
	if (!(" " in order)) order[" "] = order[" "] ?? 10; // Default incomplete reasonably high
	if (!("x" in order)) order["x"] = order["x"] ?? 98; // Default complete towards end

	return order;
}

// Compares two tasks based on the given criteria AND plugin settings
function compareTasks<
	T extends {
		calculatedStatus?: string | SortableTaskStatus;
		status?: string;
		completed?: boolean;
		priority?: number;
		dueDate?: number;
		startDate?: number;
		scheduledDate?: number;
		createdDate?: number;
		completedDate?: number;
		content?: string;
		tags?: string[];
		project?: string;
		context?: string;
		recurrence?: string;
		filePath?: string;
		line?: number;
		lineNumber?: number;
		metadata?: Record<string, any>;
	}
>(
	taskA: T,
	taskB: T,
	criteria: SortCriterion[],
	statusOrder: { [key: string]: number }
): number {
	// Helper to read field from top-level or metadata fallback
	const getField = (obj: any, field: string) => {
		if (obj == null) return undefined;
		const top = obj[field];
		if (top !== undefined && top !== null) return top;
		return obj.metadata ? obj.metadata[field] : undefined;
	};

	// 初始化Collator用于文本排序优化
	const sortCollator = new Intl.Collator(undefined, {
		usage: "sort",
		sensitivity: "base", // 不区分大小写
		numeric: true, // 智能处理数字
	});

	// 创建排序工厂对象
	const sortFactory = {
		status: (a: T, b: T, order: "asc" | "desc") => {
			// Status comparison logic (relies on statusOrder having numbers)
			// 使用calculatedStatus优先，如果没有则使用status
			const statusA = (a as any).calculatedStatus || (a as any).status || "";
			const statusB = (b as any).calculatedStatus || (b as any).status || "";

			const valA = statusOrder[statusA] ?? 1000; // Assign a high number for unknown statuses
			const valB = statusOrder[statusB] ?? 1000;

			if (typeof valA === "number" && typeof valB === "number") {
				const comparison = valA - valB; // Lower number means higher rank in status order
				return order === "asc" ? comparison : -comparison;
			} else {
				// Fallback if statusOrder contains non-numbers (shouldn't happen ideally)
				console.warn(
					`Non-numeric status order values detected: ${valA}, ${valB}`
				);
				return 0; // Treat as equal if non-numeric
			}
		},

		completed: (a: T, b: T, order: "asc" | "desc") => {
			// Completed status comparison
			const aCompleted = !!(a as any).completed;
			const bCompleted = !!(b as any).completed;

			if (aCompleted === bCompleted) {
				return 0; // Both have same completion status
			}

			// For asc: incomplete tasks first (false < true)
			// For desc: completed tasks first (true > false)
			const comparison = aCompleted ? 1 : -1;
			return order === "asc" ? comparison : -comparison;
		},

		priority: (a: T, b: T, order: "asc" | "desc") => {
			// Priority comparison: higher number means higher priority (1=Lowest, 5=Highest)
			const valA = getField(a, "priority");
			const valB = getField(b, "priority");
			const aHasPriority = valA !== undefined && valA !== null && valA > 0;
			const bHasPriority = valB !== undefined && valB !== null && valB > 0;

			// Handle null/empty values - empty values should always go to the end
			if (!aHasPriority && !bHasPriority) {
				return 0; // Both lack priority
			} else if (!aHasPriority) {
				// A lacks priority - no priority tasks go to the end
				return 1;
			} else if (!bHasPriority) {
				// B lacks priority - no priority tasks go to the end
				return -1;
			} else {
				// Both have numeric priorities - simple numeric comparison
				// For asc: 1, 2, 3, 4, 5 (Low to High)
				// For desc: 5, 4, 3, 2, 1 (High to Low)
				const comparison = (valA as number) - (valB as number);
				return order === "asc" ? comparison : -comparison;
			}
		},

		dueDate: (a: T, b: T, order: "asc" | "desc") => {
			return sortByDate("dueDate", a, b, order);
		},

		startDate: (a: T, b: T, order: "asc" | "desc") => {
			return sortByDate("startDate", a, b, order);
		},

		scheduledDate: (a: T, b: T, order: "asc" | "desc") => {
			return sortByDate("scheduledDate", a, b, order);
		},

		createdDate: (a: T, b: T, order: "asc" | "desc") => {
			return sortByDate("createdDate", a, b, order);
		},

		completedDate: (a: T, b: T, order: "asc" | "desc") => {
			return sortByDate("completedDate", a, b, order);
		},

		content: (a: T, b: T, order: "asc" | "desc") => {
			// 使用Collator进行更智能的文本比较，代替简单的localeCompare
			// 首先检查content是否存在
			const contentA = (a as any).content?.trim() || null;
			const contentB = (b as any).content?.trim() || null;

			// Handle null/empty values - empty values should always go to the end
			if (!contentA && !contentB) return 0;
			if (!contentA) return 1; // A is empty, goes to end
			if (!contentB) return -1; // B is empty, goes to end

			const comparison = sortCollator.compare(contentA, contentB);
			return order === "asc" ? comparison : -comparison;
		},

		tags: (a: T, b: T, order: "asc" | "desc") => {
			// Sort by tags - convert array to string for comparison
			const tagsAVal = getField(a, "tags");
			const tagsBVal = getField(b, "tags");
			const tagsA =
				Array.isArray(tagsAVal) && tagsAVal.length > 0
					? (tagsAVal as string[]).join(", ")
					: null;
			const tagsB =
				Array.isArray(tagsBVal) && tagsBVal.length > 0
					? (tagsBVal as string[]).join(", ")
					: null;

			// Handle null/empty values - empty values should always go to the end
			if (!tagsA && !tagsB) return 0;
			if (!tagsA) return 1; // A is empty, goes to end
			if (!tagsB) return -1; // B is empty, goes to end

			const comparison = sortCollator.compare(tagsA, tagsB);
			return order === "asc" ? comparison : -comparison;
		},

		project: (a: T, b: T, order: "asc" | "desc") => {
			const projectA = (getField(a, "project") as string | undefined)
				?.trim() || null;
			const projectB = (getField(b, "project") as string | undefined)
				?.trim() || null;

			// Handle null/empty values - empty values should always go to the end
			if (!projectA && !projectB) return 0;
			if (!projectA) return 1; // A is empty, goes to end
			if (!projectB) return -1; // B is empty, goes to end

			const comparison = sortCollator.compare(projectA, projectB);
			return order === "asc" ? comparison : -comparison;
		},

		context: (a: T, b: T, order: "asc" | "desc") => {
			const contextA = (getField(a, "context") as string | undefined)
				?.trim() || null;
			const contextB = (getField(b, "context") as string | undefined)
				?.trim() || null;

			// Handle null/empty values - empty values should always go to the end
			if (!contextA && !contextB) return 0;
			if (!contextA) return 1; // A is empty, goes to end
			if (!contextB) return -1; // B is empty, goes to end

			const comparison = sortCollator.compare(contextA, contextB);
			return order === "asc" ? comparison : -comparison;
		},

		recurrence: (a: T, b: T, order: "asc" | "desc") => {
			const recurrenceA = (getField(a, "recurrence") as string | undefined)
				?.trim() || null;
			const recurrenceB = (getField(b, "recurrence") as string | undefined)
				?.trim() || null;

			// Handle null/empty values - empty values should always go to the end
			if (!recurrenceA && !recurrenceB) return 0;
			if (!recurrenceA) return 1; // A is empty, goes to end
			if (!recurrenceB) return -1; // B is empty, goes to end

			const comparison = sortCollator.compare(recurrenceA, recurrenceB);
			return order === "asc" ? comparison : -comparison;
		},

		filePath: (a: T, b: T, order: "asc" | "desc") => {
			const filePathA = (a as any).filePath?.trim() || null;
			const filePathB = (b as any).filePath?.trim() || null;

			// Handle null/empty values - empty values should always go to the end
			if (!filePathA && !filePathB) return 0;
			if (!filePathA) return 1; // A is empty, goes to end
			if (!filePathB) return -1; // B is empty, goes to end

			const comparison = sortCollator.compare(filePathA, filePathB);
			return order === "asc" ? comparison : -comparison;
		},

		lineNumber: (a: T, b: T, order: "asc" | "desc") => {
			return ((a as any).line || 0) - ((b as any).line || 0);
		},
	};

	// 通用日期排序函数
	function sortByDate(
		field:
			| "dueDate"
			| "startDate"
			| "scheduledDate"
			| "createdDate"
			| "completedDate",
		a: T,
		b: T,
		order: "asc" | "desc"
	): number {
		const valA = getField(a, field);
		const valB = getField(b, field);
		const aHasDate = valA !== undefined && valA !== null;
		const bHasDate = valB !== undefined && valB !== null;

		let comparison = 0;
		if (!aHasDate && !bHasDate) {
			comparison = 0; // Both lack date
		} else if (!aHasDate) {
			// A lacks date. 'asc' means Dates->None. None is last (+1).
			comparison = 1;
		} else if (!bHasDate) {
			// B lacks date. 'asc' means Dates->None. None is last. B is last, so A is first (-1).
			comparison = -1;
		} else {
			// Both have numeric dates (timestamps)
			const dateA = valA as number;
			const dateB = valB as number;
			const now = Date.now();

			// Check if dates are overdue
			const aIsOverdue = dateA < now;
			const bIsOverdue = dateB < now;

			if (aIsOverdue && bIsOverdue) {
				// Both are overdue - for overdue dates, show most overdue first (oldest dates first)
				// So we want earlier dates to come first, regardless of asc/desc order
				comparison = dateA - dateB;
			} else if (aIsOverdue && !bIsOverdue) {
				// A is overdue, B is not - overdue tasks should come first
				comparison = -1;
			} else if (!aIsOverdue && bIsOverdue) {
				// B is overdue, A is not - overdue tasks should come first
				comparison = 1;
			} else {
				// Both are future dates - normal date comparison
				comparison = dateA - dateB;
			}
		}

		return order === "asc" ? comparison : -comparison;
	}

	// 使用工厂方法进行排序
	for (const criterion of criteria) {
		if (criterion.field in sortFactory) {
			const sortMethod =
				sortFactory[criterion.field as keyof typeof sortFactory];
			const result = sortMethod(taskA, taskB, criterion.order);
			if (result !== 0) {
				return result;
			}
		}
	}

	// Maintain original relative order if all criteria are equal
	// 检查是否有lineNumber属性
	if ((taskA as any).line !== undefined && (taskB as any).line !== undefined) {
		return ((taskA as any).line as number) - ((taskB as any).line as number);
	} else if (
		(taskA as any).lineNumber !== undefined &&
		(taskB as any).lineNumber !== undefined
	) {
		return (
			(taskA as any).lineNumber as number
		) - ((taskB as any).lineNumber as number);
	}
	return 0;
}

// Find continuous task blocks (including subtasks)
export function findContinuousTaskBlocks(
	tasks: SortableTask[]
): SortableTask[][] {
	if (tasks.length === 0) return [];

	// Sort by line number
	const sortedTasks = [...tasks].sort((a, b) => a.lineNumber - b.lineNumber);

	// Task blocks array
	const blocks: SortableTask[][] = [];
	let currentBlock: SortableTask[] = [sortedTasks[0]];

	// Recursively find the maximum line number of a task and all its children
	function getMaxLineNumberWithChildren(task: SortableTask): number {
		if (!task.children || task.children.length === 0)
			return task.lineNumber;

		let maxLine = task.lineNumber;
		for (const child of task.children) {
			const childMaxLine = getMaxLineNumberWithChildren(child);
			maxLine = Math.max(maxLine, childMaxLine);
		}

		return maxLine;
	}

	// Check all tasks, group into continuous blocks
	for (let i = 1; i < sortedTasks.length; i++) {
		const prevTask = sortedTasks[i - 1];
		const currentTask = sortedTasks[i];

		// Check the maximum line number of the previous task (including all subtasks)
		const prevMaxLine = getMaxLineNumberWithChildren(prevTask);

		// If the current task line number is the next line after the previous task or its subtasks, it belongs to the same block
		if (currentTask.lineNumber <= prevMaxLine + 1) {
			currentBlock.push(currentTask);
		} else {
			// Otherwise start a new block
			blocks.push([...currentBlock]);
			currentBlock = [currentTask];
		}
	}

	// Add the last block
	if (currentBlock.length > 0) {
		blocks.push(currentBlock);
	}

	return blocks;
}

// Generic sorting function that accepts any task object that matches the specific conditions
export function sortTasks<
	T extends {
		calculatedStatus?: string | SortableTaskStatus;
		status?: string;
		completed?: boolean;
		priority?: number;
		dueDate?: number;
		startDate?: number;
		scheduledDate?: number;
		createdDate?: number;
		completedDate?: number;
		content?: string;
		tags?: string[];
		project?: string;
		context?: string;
		recurrence?: string;
		filePath?: string;
		line?: number;
		children?: any[]; // Accept any children type
	}
>(
	tasks: T[],
	criteria: SortCriterion[],
	settings: TaskProgressBarSettings
): T[] {
	const statusOrder = getDynamicStatusOrder(settings);

	// Handle special case: if tasks are Task type, add calculatedStatus property to each task
	const preparedTasks = tasks.map((task) => {
		// If already has calculatedStatus, skip
		if (task.calculatedStatus) return task;

		// Otherwise, add calculatedStatus
		return {
			...task,
			calculatedStatus: task.status || "",
		};
	});

	preparedTasks.sort((a, b) => compareTasks(a, b, criteria, statusOrder));

	return preparedTasks as T[]; // 类型断言回原类型
}

// Recursively sort tasks and their subtasks
function sortTasksRecursively(
	tasks: SortableTask[],
	criteria: SortCriterion[],
	settings: TaskProgressBarSettings
): SortableTask[] {
	const statusOrder = getDynamicStatusOrder(settings);
	// Sort tasks at the current level
	tasks.sort((a, b) => compareTasks(a, b, criteria, statusOrder));

	// Recursively sort each task's subtasks
	for (const task of tasks) {
		if (task.children && task.children.length > 0) {
			// Ensure sorted subtasks are saved back to task.children
			task.children = sortTasksRecursively(
				task.children,
				criteria,
				settings
			);
		}
	}

	return tasks; // Return the sorted task array
}

// Main function: Parses, sorts, and generates Codemirror changes
export function sortTasksInDocument(
	view: EditorView,
	plugin: TaskProgressBarPlugin,
	fullDocument: boolean = false
): string | null {
	const app = plugin.app;
	const activeFile = app.workspace.getActiveFile(); // Assume command runs on active file
	if (!activeFile) {
		new Notice("Sort Tasks: No active file found.");
		return null;
	}
	const filePath = activeFile.path; // Get file path
	const cache = app.metadataCache.getFileCache(activeFile);
	if (!cache) {
		new Notice("Sort Tasks: Metadata cache not available.");
		return null;
	}

	const doc = view.state.doc;
	const settings = plugin.settings;
	const metadataFormat: MetadataFormat = settings.preferMetadataFormat;

	// --- Get sortCriteria from settings ---
	const sortCriteria = settings.sortCriteria || DEFAULT_SETTINGS.sortCriteria; // Get from settings, use default if missing
	if (!settings.sortTasks || !sortCriteria || sortCriteria.length === 0) {
		new Notice(
			t(
				"Task sorting is disabled or no sort criteria are defined in settings."
			)
		);
		return null; // Exit if sorting is disabled or no criteria
	}

	let startLine = 0;
	let endLine = doc.lines - 1;
	let scopeMessage = "full document"; // For logging

	if (!fullDocument) {
		const cursor = view.state.selection.main.head;
		const cursorLine = doc.lineAt(cursor).number - 1; // 0-based

		// Try to find scope based on cursor position (heading or document)
		const headings = cache.headings || [];
		let containingHeading = null;
		let nextHeadingLine = doc.lines; // Default to end of doc

		// Find the heading the cursor is currently in
		for (let i = headings.length - 1; i >= 0; i--) {
			if (headings[i].position.start.line <= cursorLine) {
				containingHeading = headings[i];
				startLine = containingHeading.position.start.line; // Start from heading line

				// Find the line number of the next heading at the same or lower level
				for (let j = i + 1; j < headings.length; j++) {
					if (headings[j].level <= containingHeading.level) {
						nextHeadingLine = headings[j].position.start.line;
						break;
					}
				}
				scopeMessage = `heading section "${containingHeading.heading}"`;
				break; // Found the containing heading
			}
		}

		// Set the endLine for the section
		if (containingHeading) {
			endLine = nextHeadingLine - 1; // End before the next heading
		} else {
			// Cursor is not under any heading, sort the whole document
			startLine = 0;
			endLine = doc.lines - 1;
			scopeMessage = "full document (cursor not in heading)";
		}

		// Ensure endLine is not less than startLine (e.g., empty heading section)
		if (endLine < startLine) {
			endLine = startLine;
		}
	} else {
		// fullDocument is true, range is already set (0 to doc.lines - 1)
		scopeMessage = "full document (forced)";
	}

	// Get the text content of the determined block
	const fromOffsetOriginal = doc.line(startLine + 1).from; // 1-based for doc.line
	const toOffsetOriginal = doc.line(endLine + 1).to;
	// Ensure offsets are valid
	if (fromOffsetOriginal > toOffsetOriginal) {
		new Notice(`Sort Tasks: Invalid range calculated for ${scopeMessage}.`);
		return null;
	}
	const originalBlockText = doc.sliceString(
		fromOffsetOriginal,
		toOffsetOriginal
	);

	// 1. Parse tasks *using the new function*, providing offset, path, and format
	const blockTasks = parseTasksForSorting(
		originalBlockText,
		startLine,
		filePath,
		metadataFormat, // Pass determined format
		plugin // Pass plugin for configurable prefix support
	);
	if (blockTasks.length === 0) {
		const noticeMsg = `Sort Tasks: No tasks found in the ${scopeMessage} (Lines ${
			startLine + 1
		}-${endLine + 1}) to sort.`;
		new Notice(noticeMsg);
		return null;
	}

	// Find continuous task blocks
	const taskBlocks = findContinuousTaskBlocks(blockTasks);

	// 2. Sort each continuous block separately
	for (let i = 0; i < taskBlocks.length; i++) {
		// Replace tasks in the original block with sorted tasks
		// Pass the criteria fetched from settings
		taskBlocks[i] = sortTasksRecursively(
			taskBlocks[i],
			sortCriteria, // Use criteria from settings
			settings
		);
	}

	// 3. Update the original blockTasks to reflect sorting results
	// Clear the original blockTasks
	blockTasks.length = 0;

	// Merge all sorted blocks back into blockTasks
	for (const block of taskBlocks) {
		for (const task of block) {
			blockTasks.push(task);
		}
	}

	// 4. Rebuild text directly from sorted blockTasks
	const originalBlockLines = originalBlockText.split("\n");
	let newBlockLines: string[] = [...originalBlockLines]; // Copy original lines
	const processedLineIndices = new Set<number>(); // Track processed line indices

	// Find indices of all task lines
	const taskLineIndices = new Set<number>();
	for (const task of blockTasks) {
		// Convert to index relative to block
		const relativeIndex = task.lineNumber - startLine;
		if (relativeIndex >= 0 && relativeIndex < originalBlockLines.length) {
			taskLineIndices.add(relativeIndex);
		}
	}

	// For each task block, find its starting position and sort tasks at that position
	for (const block of taskBlocks) {
		// Find the minimum line number (relative to block)
		let minRelativeLineIndex = Number.MAX_SAFE_INTEGER;
		for (const task of block) {
			const relativeIndex = task.lineNumber - startLine;
			if (
				relativeIndex >= 0 &&
				relativeIndex < originalBlockLines.length &&
				relativeIndex < minRelativeLineIndex
			) {
				minRelativeLineIndex = relativeIndex;
			}
		}

		if (minRelativeLineIndex === Number.MAX_SAFE_INTEGER) {
			continue; // Skip invalid blocks
		}

		// Collect all task line content in this block
		const blockContent: string[] = [];

		// Recursively add tasks and their subtasks
		function addSortedTaskContent(task: SortableTask) {
			blockContent.push(task.originalMarkdown);

			// Mark this line as processed
			const relativeIndex = task.lineNumber - startLine;
			if (
				relativeIndex >= 0 &&
				relativeIndex < originalBlockLines.length
			) {
				processedLineIndices.add(relativeIndex);
			}

			// Process subtasks
			if (task.children && task.children.length > 0) {
				for (const child of task.children) {
					addSortedTaskContent(child);
				}
			}
		}

		// Only process top-level tasks
		for (const task of block) {
			if (!task.parent) {
				// Only process top-level tasks
				addSortedTaskContent(task);
			}
		}

		// Replace content at original position
		let currentLine = minRelativeLineIndex;
		for (const line of blockContent) {
			newBlockLines[currentLine++] = line;
		}
	}

	// Remove processed lines (replaced task lines)
	const finalLines: string[] = [];
	for (let i = 0; i < newBlockLines.length; i++) {
		if (!taskLineIndices.has(i) || processedLineIndices.has(i)) {
			finalLines.push(newBlockLines[i]);
		}
	}

	const newBlockText = finalLines.join("\n");

	// 5. Only return new text if the block actually changed
	if (originalBlockText === newBlockText) {
		const noticeMsg = `Sort Tasks: Tasks are already sorted in the ${scopeMessage} (Lines ${
			startLine + 1
		}-${endLine + 1}).`;
		new Notice(noticeMsg);
		return null;
	}

	const noticeMsg = `Sort Tasks: Sorted tasks in the ${scopeMessage} (Lines ${
		startLine + 1
	}-${endLine + 1}).`;
	new Notice(noticeMsg);

	// Directly return the changed text
	return newBlockText;
}
