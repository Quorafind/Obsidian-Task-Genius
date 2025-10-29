import { moment } from "obsidian";
import { Task } from "../../types/task";
import {
	ViewMode,
	getViewSettingOrDefault,
} from "../../common/setting-definition";
import TaskProgressBarPlugin from "../../index";
import { sortTasks } from "@/commands/sortTaskCommands";
import {
	Filter,
	FilterGroup,
	RootFilterState,
} from "@/components/features/task/filter/ViewTaskFilter";
import { hasProject } from "./task-operations";

// 从ViewTaskFilter.ts导入相关接口

interface FilterOptions {
	textQuery?: string;
	selectedDate?: Date; // For forecast-like filtering
	// Add other potential options needed by specific views later
	// selectedProject?: string;
	// selectedTags?: string[];

	settings?: {
		useDailyNotePathAsDate: boolean;
		dailyNoteFormat: string;
		useAsDateType: "due" | "start" | "scheduled";
	};

	// 添加高级过滤器选项
	advancedFilter?: RootFilterState;
}

/**
 * Parses a date filter string (e.g., 'today', 'next week', '2024-12-31')
 * and returns a moment object representing the start of that day.
 * Returns null if parsing fails.
 */
function parseDateFilterString(dateString: string): moment.Moment | null {
	if (!dateString) return null;
	const lowerCaseDate = dateString.toLowerCase().trim();
	let targetDate = moment(); // Default to today

	// Simple relative dates
	if (lowerCaseDate === "today") {
		// Already moment()
	} else if (lowerCaseDate === "tomorrow") {
		targetDate = moment().add(1, "day");
	} else if (lowerCaseDate === "yesterday") {
		targetDate = moment().subtract(1, "day");
	} else if (lowerCaseDate === "next week") {
		targetDate = moment().add(1, "week").startOf("week"); // Start of next week
	} else if (lowerCaseDate === "last week") {
		targetDate = moment().subtract(1, "week").startOf("week"); // Start of last week
	} else if (lowerCaseDate === "next month") {
		targetDate = moment().add(1, "month").startOf("month");
	} else if (lowerCaseDate === "last month") {
		targetDate = moment().subtract(1, "month").startOf("month");
	} else {
		// Try parsing as YYYY-MM-DD
		const parsed = moment(lowerCaseDate, "YYYY-MM-DD", true); // Strict parsing
		if (parsed.isValid()) {
			targetDate = parsed;
		} else {
			// Could add more complex parsing here (e.g., "in 3 days")
			console.warn(`Could not parse date filter string: ${dateString}`);
			return null;
		}
	}

	return targetDate.startOf("day");
}

/**
 * Checks if a task is not completed based on view settings and task status.
 *
 * @param plugin The plugin instance
 * @param task The task to check
 * @param viewId The current view mode
 * @returns true if the task is not completed according to view settings
 */
export function isNotCompleted(
	plugin: TaskProgressBarPlugin,
	task: Task,
	viewId: ViewMode,
): boolean {
	const viewConfig = getViewSettingOrDefault(plugin, viewId);
	const abandonedStatus = plugin.settings.taskStatuses.abandoned.split("|");
	const completedStatus = plugin.settings.taskStatuses.completed.split("|");

	if (viewConfig.hideCompletedAndAbandonedTasks) {
		return (
			!task.completed &&
			!abandonedStatus.includes(task.status.toLowerCase()) &&
			!completedStatus.includes(task.status.toLowerCase())
		);
	}

	return true;
}

/**
 * Checks if a task is blank based on view settings and task content.
 *
 * @param plugin The plugin instance
 * @param task The task to check
 * @param viewId The current view mode
 * @returns true if the task is blank
 */
export function isBlank(
	plugin: TaskProgressBarPlugin,
	task: Task,
	viewId: ViewMode,
): boolean {
	const viewConfig = getViewSettingOrDefault(plugin, viewId);

	if (viewConfig.filterBlanks) {
		return task.content.trim() !== "";
	}

	return true;
}

/**
 * 从RootFilterState应用过滤条件到任务列表
 * @param task 要过滤的任务
 * @param filterState 过滤状态
 * @returns 如果任务满足过滤条件则返回true
 */
export function applyAdvancedFilter(
	task: Task,
	filterState: RootFilterState,
): boolean {
	// 如果没有过滤器组或过滤器组为空，返回所有任务
	if (!filterState.filterGroups || filterState.filterGroups.length === 0) {
		return true;
	}

	// 根据根条件确定如何组合过滤组
	const groupResults = filterState.filterGroups.map((group) => {
		return applyFilterGroup(task, group);
	});

	// 根据根条件组合结果
	if (filterState.rootCondition === "all") {
		return groupResults.every((result) => result);
	} else if (filterState.rootCondition === "any") {
		return groupResults.some((result) => result);
	} else if (filterState.rootCondition === "none") {
		return !groupResults.some((result) => result);
	}

	return true;
}

/**
 * 将过滤组应用于任务
 * @param task 要过滤的任务
 * @param group 过滤组
 * @returns 如果任务满足组条件则返回true
 */
function applyFilterGroup(task: Task, group: FilterGroup): boolean {
	// 如果过滤器为空，返回所有任务
	if (!group.filters || group.filters.length === 0) {
		return true;
	}

	const filterResults = group.filters.map((filter) => {
		return applyFilter(task, filter);
	});

	// 根据组条件组合结果
	if (group.groupCondition === "all") {
		return filterResults.every((result) => result);
	} else if (group.groupCondition === "any") {
		return filterResults.some((result) => result);
	} else if (group.groupCondition === "none") {
		return !filterResults.some((result) => result);
	}

	return true;
}

/**
 * 将单个过滤器应用于任务
 * @param task 要过滤的任务
 * @param filter 过滤器
 * @returns 如果任务满足过滤条件则返回true
 */
function applyFilter(task: Task, filter: Filter): boolean {
	const { property, condition, value } = filter;

	// 对于空条件，始终返回true
	if (!condition) {
		return true;
	}

	switch (property) {
		case "content":
			return applyContentFilter(task.content, condition, value);
		case "status":
			return applyStatusFilter(task.status, condition, value);
		case "priority":
			return applyPriorityFilter(
				task.metadata.priority,
				condition,
				value,
			);
		case "dueDate":
			return applyDateFilter(task.metadata.dueDate, condition, value);
		case "startDate":
			return applyDateFilter(task.metadata.startDate, condition, value);
		case "scheduledDate":
			return applyDateFilter(
				task.metadata.scheduledDate,
				condition,
				value,
			);
		case "tags":
			return applyTagsFilter(task.metadata.tags, condition, value);
		case "filePath":
			return applyFilePathFilter(task.filePath, condition, value);
		case "project":
			return applyProjectFilter(task.metadata.project, condition, value);
		case "completed":
			return applyCompletedFilter(task.completed, condition);
		default:
			// 处理其他属性
			return true;
	}
}

/**
 * 内容过滤器实现
 */
function applyContentFilter(
	content: string,
	condition: string,
	value?: string,
): boolean {
	if (!content) content = "";
	if (!value) value = "";

	switch (condition) {
		case "contains":
			return content.toLowerCase().includes(value.toLowerCase());
		case "doesNotContain":
			return !content.toLowerCase().includes(value.toLowerCase());
		case "is":
			return content.toLowerCase() === value.toLowerCase();
		case "isNot":
			return content.toLowerCase() !== value.toLowerCase();
		case "startsWith":
			return content.toLowerCase().startsWith(value.toLowerCase());
		case "endsWith":
			return content.toLowerCase().endsWith(value.toLowerCase());
		case "isEmpty":
			return content.trim() === "";
		case "isNotEmpty":
			return content.trim() !== "";
		default:
			return true;
	}
}

/**
 * 状态过滤器实现
 */
function applyStatusFilter(
	status: string,
	condition: string,
	value?: string,
): boolean {
	if (!status) status = "";
	if (!value) value = "";

	switch (condition) {
		case "contains":
			return status.toLowerCase().includes(value.toLowerCase());
		case "doesNotContain":
			return !status.toLowerCase().includes(value.toLowerCase());
		case "is":
			return status.toLowerCase() === value.toLowerCase();
		case "isNot":
			return status.toLowerCase() !== value.toLowerCase();
		case "isEmpty":
			return status.trim() === "";
		case "isNotEmpty":
			return status.trim() !== "";
		default:
			return true;
	}
}

/**
 * 优先级过滤器实现
 */
function applyPriorityFilter(
	priority: number | undefined,
	condition: string,
	value?: string,
): boolean {
	// 如果没有设置优先级，将其视为0
	const taskPriority = typeof priority === "number" ? priority : 0;

	// 对于空值条件
	switch (condition) {
		case "isEmpty":
			return priority === undefined;
		case "isNotEmpty":
			return priority !== undefined;
	}

	if (!value) return true;

	// 尝试将值转换为数字
	let numValue: number;
	try {
		numValue = parseInt(value);
		if (isNaN(numValue)) numValue = 0;
	} catch {
		numValue = 0;
	}

	switch (condition) {
		case "is":
			return taskPriority === numValue;
		case "isNot":
			return taskPriority !== numValue;
		default:
			return true;
	}
}

/**
 * 日期过滤器实现
 */
function applyDateFilter(
	date: number | undefined,
	condition: string,
	value?: string,
): boolean {
	// 处理空值条件
	switch (condition) {
		case "isEmpty":
			return date === undefined;
		case "isNotEmpty":
			return date !== undefined;
	}

	// 如果任务没有日期或过滤值为空，则匹配条件很特殊
	if (date === undefined || !value) {
		// 对于需要日期的条件，如果没有日期则不匹配
		if (["is", "isNot", ">", "<", ">=", "<="].includes(condition)) {
			return false;
		}
		return true;
	}

	// 解析日期
	const taskDate = moment(date).startOf("day");
	const filterDate = moment(value, "YYYY-MM-DD").startOf("day");

	if (!taskDate.isValid() || !filterDate.isValid()) {
		return false;
	}

	switch (condition) {
		case "is":
			return taskDate.isSame(filterDate, "day");
		case "isNot":
			return !taskDate.isSame(filterDate, "day");
		case ">":
			return taskDate.isAfter(filterDate, "day");
		case "<":
			return taskDate.isBefore(filterDate, "day");
		case ">=":
			return taskDate.isSameOrAfter(filterDate, "day");
		case "<=":
			return taskDate.isSameOrBefore(filterDate, "day");
		default:
			return true;
	}
}

/**
 * 标签过滤器实现
 */
function applyTagsFilter(
	tags: string[],
	condition: string,
	value?: string,
): boolean {
	if (!tags) tags = [];
	if (!value) value = "";

	const lowerValue = value.toLowerCase();

	switch (condition) {
		case "contains":
			return tags.some((tag) => tag.toLowerCase().includes(lowerValue));
		case "doesNotContain":
			return !tags.some((tag) => tag.toLowerCase().includes(lowerValue));
		case "isEmpty":
			return tags.length === 0;
		case "isNotEmpty":
			return tags.length > 0;
		default:
			return true;
	}
}

/**
 * 文件路径过滤器实现
 */
function applyFilePathFilter(
	filePath: string,
	condition: string,
	value?: string,
): boolean {
	if (!filePath) filePath = "";
	if (!value) value = "";

	switch (condition) {
		case "contains":
			return filePath.toLowerCase().includes(value.toLowerCase());
		case "doesNotContain":
			return !filePath.toLowerCase().includes(value.toLowerCase());
		case "is":
			return filePath.toLowerCase() === value.toLowerCase();
		case "isNot":
			return filePath.toLowerCase() !== value.toLowerCase();
		case "startsWith":
			return filePath.toLowerCase().startsWith(value.toLowerCase());
		case "endsWith":
			return filePath.toLowerCase().endsWith(value.toLowerCase());
		case "isEmpty":
			return filePath.trim() === "";
		case "isNotEmpty":
			return filePath.trim() !== "";
		default:
			return true;
	}
}

/**
 * 项目过滤器实现
 */
function applyProjectFilter(
	project: string | undefined,
	condition: string,
	value?: string,
): boolean {
	const proj = (project ?? "").toLowerCase();
	const val = (value ?? "").toLowerCase();

	switch (condition) {
		case "contains":
			return proj.includes(val);
		case "doesNotContain":
			return !proj.includes(val);
		case "is":
			return proj === val;
		case "isNot":
			return proj !== val;
		case "startsWith":
			return proj.startsWith(val);
		case "endsWith":
			return proj.endsWith(val);
		case "isEmpty":
			return proj.trim() === "";
		case "isNotEmpty":
			return proj.trim() !== "";
		default:
			return true;
	}
}

/**
 * 完成状态过滤器实现
 */
function applyCompletedFilter(completed: boolean, condition: string): boolean {
	switch (condition) {
		case "isTrue":
			return completed === true;
		case "isFalse":
			return completed === false;
		default:
			return true;
	}
}

/**
 * Centralized function to filter tasks based on view configuration and options.
 * Includes completion status filtering.
 */
export function filterTasks(
	allTasks: Task[],
	viewId: ViewMode,
	plugin: TaskProgressBarPlugin,
	options: FilterOptions = {},
): Task[] {
	let filtered = [...allTasks];
	const viewConfig = getViewSettingOrDefault(plugin, viewId);
	const filterRules = viewConfig.filterRules || {};
	const globalFilterRules = plugin.settings.globalFilterRules || {};

	// --- 过滤 ICS 事件在不应展示的视图中（例如 inbox）---
	// ICS 事件应仅在日历/日程类视图（calendar/forecast）中展示
	const isCalendarView =
		viewId === "calendar" ||
		(typeof viewId === "string" && viewId.startsWith("calendar"));
	const isForecastView =
		viewId === "forecast" ||
		(typeof viewId === "string" && viewId.startsWith("forecast"));

	if (!isCalendarView && !isForecastView) {
		filtered = filtered.filter((task) => {
			// 识别 ICS 事件任务（优先从 metadata.source 读取，兼容 legacy source 字段）
			const metaSourceType =
				(task as any).metadata?.source?.type ??
				(task as any).source?.type;
			const isIcsTask = metaSourceType === "ics";
			// 非 ICS 保留；ICS 在此类视图中过滤掉
			return !isIcsTask;
		});
	}

	// --- 基本筛选：隐藏已完成和空白任务 ---
	// 注意：这些是基础过滤条件，始终应用
	if (viewConfig.hideCompletedAndAbandonedTasks) {
		filtered = filtered.filter((task) =>
			isNotCompleted(plugin, task, viewId),
		);
	}

	if (viewConfig.filterBlanks) {
		filtered = filtered.filter((task) => task.content.trim() !== "");
	}

	// --- 应用全局筛选器（如果存在） ---
	if (
		globalFilterRules.advancedFilter &&
		globalFilterRules.advancedFilter.filterGroups?.length > 0
	) {
		console.log("应用全局筛选器:", globalFilterRules.advancedFilter);
		filtered = filtered.filter((task) =>
			applyAdvancedFilter(task, globalFilterRules.advancedFilter!),
		);
	}

	// --- 应用视图配置中的基础高级过滤器（如果存在） ---
	if (
		filterRules.advancedFilter &&
		filterRules.advancedFilter.filterGroups?.length > 0
	) {
		console.log(
			"应用视图配置中的基础高级过滤器:",
			filterRules.advancedFilter,
		);
		filtered = filtered.filter((task) =>
			applyAdvancedFilter(task, filterRules.advancedFilter!),
		);
	}

	// --- 应用传入的实时高级过滤器（如果存在） ---
	if (
		options.advancedFilter &&
		options.advancedFilter.filterGroups?.length > 0
	) {
		console.log("应用传入的实时高级过滤器:", options.advancedFilter);
		filtered = filtered.filter((task) =>
			applyAdvancedFilter(task, options.advancedFilter!),
		);

		// 如果有实时高级过滤器，应用基本规则后直接返回
		// 应用 isNotCompleted 过滤器（基于视图配置的 hideCompletedAndAbandonedTasks）
		filtered = filtered.filter((task) =>
			isNotCompleted(plugin, task, viewId),
		);

		// 应用 isBlank 过滤器（基于视图配置的 filterBlanks）
		filtered = filtered.filter((task) => isBlank(plugin, task, viewId));

		// 应用通用文本搜索（来自选项）
		if (options.textQuery) {
			const textFilter = options.textQuery.toLowerCase();
			filtered = filtered.filter(
				(task) =>
					task.content.toLowerCase().includes(textFilter) ||
					task.metadata.project?.toLowerCase().includes(textFilter) ||
					task.metadata.context?.toLowerCase().includes(textFilter) ||
					task.metadata.tags?.some((tag) =>
						tag.toLowerCase().includes(textFilter),
					),
			);
		}

		// 有实时高级过滤器时，跳过应用默认视图逻辑和默认过滤规则
		return filtered;
	}

	// --- 以下是无高级过滤器时的默认行为 ---

	// --- Apply Filter Rules defined in ViewConfig ---
	if (filterRules.textContains) {
		const query = filterRules.textContains.toLowerCase();
		filtered = filtered.filter((task) =>
			task.content.toLowerCase().includes(query),
		);
	}
	if (filterRules.tagsInclude && filterRules.tagsInclude.length > 0) {
		filtered = filtered.filter((task) =>
			filterRules.tagsInclude?.some((tag) =>
				task.metadata.tags.some(
					(taskTag) => typeof taskTag === "string" && taskTag === tag,
				),
			),
		);
	}
	if (filterRules.tagsExclude && filterRules.tagsExclude.length > 0) {
		filtered = filtered.filter((task) => {
			if (!task.metadata.tags || task.metadata.tags.length === 0) {
				return true; // Keep tasks with no tags
			}

			// Convert task tags to lowercase for case-insensitive comparison
			const taskTagsLower = task.metadata.tags.map((tag) =>
				tag.toLowerCase(),
			);

			// Check if any excluded tag is in the task's tags
			return !filterRules.tagsExclude?.some((excludeTag) => {
				const tagLower = excludeTag.toLowerCase();
				return (
					taskTagsLower.includes(tagLower) ||
					taskTagsLower.includes("#" + tagLower)
				);
			});
		});
	}
	if (filterRules.project) {
		filtered = filtered.filter(
			(task) =>
				task.metadata.project?.trim() === filterRules.project?.trim(),
		);
	}
	if (filterRules.priority !== undefined) {
		filtered = filtered.filter((task) => {
			if (filterRules.priority === "none") {
				return task.metadata.priority === undefined;
			} else if (filterRules.priority?.includes(",")) {
				return filterRules.priority
					.split(",")
					.includes(String(task.metadata.priority ?? 0));
			} else {
				return (
					task.metadata.priority ===
					parseInt(filterRules.priority ?? "0")
				);
			}
		});
	}
	if (filterRules.statusInclude && filterRules.statusInclude.length > 0) {
		filtered = filtered.filter((task) =>
			filterRules.statusInclude?.includes(task.status),
		);
	}
	if (filterRules.statusExclude && filterRules.statusExclude.length > 0) {
		filtered = filtered.filter(
			(task) => !filterRules.statusExclude?.includes(task.status),
		);
	}
	// Path filters (Added based on content.ts logic)
	if (filterRules.pathIncludes) {
		const query = filterRules.pathIncludes
			.split(",")
			.filter((p) => p.trim() !== "")
			.map((p) => p.trim().toLowerCase());
		filtered = filtered.filter((task) =>
			query.some((q) => task.filePath.toLowerCase().includes(q)),
		);
	}

	if (filterRules.pathExcludes) {
		const query = filterRules.pathExcludes
			.split(",")
			.filter((p) => p.trim() !== "")
			.map((p) => p.trim().toLowerCase());
		filtered = filtered.filter((task) => {
			// Only exclude if ALL exclusion patterns are not found in the path
			return !query.some((q) => task.filePath.toLowerCase().includes(q));
		});
	}

	// --- Apply Date Filters from rules ---
	if (filterRules.dueDate) {
		const targetDueDate = parseDateFilterString(filterRules.dueDate);
		if (targetDueDate) {
			filtered = filtered.filter((task) =>
				task.metadata.dueDate
					? moment(task.metadata.dueDate).isSame(targetDueDate, "day")
					: false,
			);
		}
	}
	if (filterRules.startDate) {
		const targetStartDate = parseDateFilterString(filterRules.startDate);
		if (targetStartDate) {
			filtered = filtered.filter((task) =>
				task.metadata.startDate
					? moment(task.metadata.startDate).isSame(
							targetStartDate,
							"day",
						)
					: false,
			);
		}
	}
	if (filterRules.scheduledDate) {
		const targetScheduledDate = parseDateFilterString(
			filterRules.scheduledDate,
		);
		if (targetScheduledDate) {
			filtered = filtered.filter((task) =>
				task.metadata.scheduledDate
					? moment(task.metadata.scheduledDate).isSame(
							targetScheduledDate,
							"day",
						)
					: false,
			);
		}
	}

	// --- Apply Default View Logic (if no rules applied OR as overrides) ---
	// We only apply these if no specific rules were matched, OR if the view ID has hardcoded logic.
	// A better approach might be to represent *all* default views with filterRules in DEFAULT_SETTINGS.
	// For now, keep the switch for explicit default behaviours not covered by rules.
	if (Object.keys(filterRules).length === 0) {
		// Only apply default logic if no rules were defined for this view
		switch (viewId) {
			case "inbox": {
				filtered = filtered.filter((task) => !hasProject(task));
				break;
			}
			case "today": {
				const today = moment().startOf("day");
				const isToday = (d?: string | number | Date) =>
					d ? moment(d).isSame(today, "day") : false;
				filtered = filtered.filter(
					(task) =>
						isToday(task.metadata?.dueDate) ||
						isToday(task.metadata?.scheduledDate) ||
						isToday(task.metadata?.startDate),
				);
				break;
			}
			case "upcoming": {
				const start = moment().startOf("day");
				const end = moment().add(7, "days").endOf("day");
				const inNext7Days = (d?: string | number | Date) =>
					d
						? moment(d).isAfter(start, "day") &&
							moment(d).isSameOrBefore(end, "day")
						: false;
				filtered = filtered.filter(
					(task) =>
						inNext7Days(task.metadata?.dueDate) ||
						inNext7Days(task.metadata?.scheduledDate) ||
						inNext7Days(task.metadata?.startDate),
				);
				break;
			}
			case "flagged": {
				filtered = filtered.filter(
					(task) =>
						(task.metadata.priority ?? 0) >= 3 ||
						(task.metadata.tags?.includes("flagged") ?? false) ||
						(task.metadata.tags?.includes("#flagged") ?? false),
				);
				break;
			}
			// Projects, Tags, Review logic are handled by their specific components / options
		}
	}

	// --- Apply `isNotCompleted` Filter ---
	// This uses the hideCompletedAndAbandonedTasks setting from the viewConfig
	filtered = filtered.filter((task) => isNotCompleted(plugin, task, viewId));

	// --- Apply `isBlank` Filter ---
	// This uses the filterBlanks setting from the viewConfig
	filtered = filtered.filter((task) => isBlank(plugin, task, viewId));

	// --- Apply General Text Search (from options) ---
	if (options.textQuery) {
		const textFilter = options.textQuery.toLowerCase();
		filtered = filtered.filter(
			(task) =>
				task.content.toLowerCase().includes(textFilter) ||
				task.metadata.project?.toLowerCase().includes(textFilter) ||
				task.metadata.context?.toLowerCase().includes(textFilter) ||
				task.metadata.tags?.some((tag) =>
					tag.toLowerCase().includes(textFilter),
				),
		);
	}

	// --- Apply `hasDueDate` Filter ---
	if (filterRules.hasDueDate) {
		if (filterRules.hasDueDate === "any") {
			// Do nothing
		} else if (filterRules.hasDueDate === "hasDate") {
			filtered = filtered.filter((task) => task.metadata.dueDate);
		} else if (filterRules.hasDueDate === "noDate") {
			filtered = filtered.filter((task) => !task.metadata.dueDate);
		}
	}

	// --- Apply `hasStartDate` Filter ---
	if (filterRules.hasStartDate) {
		if (filterRules.hasStartDate === "any") {
			// Do nothing
		} else if (filterRules.hasStartDate === "hasDate") {
			filtered = filtered.filter((task) => task.metadata.startDate);
		} else if (filterRules.hasStartDate === "noDate") {
			filtered = filtered.filter((task) => !task.metadata.startDate);
		}
	}

	// --- Apply `hasScheduledDate` Filter ---
	if (filterRules.hasScheduledDate) {
		if (filterRules.hasScheduledDate === "any") {
			// Do nothing
		} else if (filterRules.hasScheduledDate === "hasDate") {
			filtered = filtered.filter((task) => task.metadata.scheduledDate);
		} else if (filterRules.hasScheduledDate === "noDate") {
			filtered = filtered.filter((task) => !task.metadata.scheduledDate);
		}
	}

	// --- Apply `hasCompletedDate` Filter ---
	if (filterRules.hasCompletedDate) {
		if (filterRules.hasCompletedDate === "any") {
			// Do nothing
		} else if (filterRules.hasCompletedDate === "hasDate") {
			filtered = filtered.filter((task) => task.metadata.completedDate);
		} else if (filterRules.hasCompletedDate === "noDate") {
			filtered = filtered.filter((task) => !task.metadata.completedDate);
		}
	}

	// --- Apply `hasRecurrence` Filter ---
	if (filterRules.hasRecurrence) {
		if (filterRules.hasRecurrence === "any") {
			// Do nothing
		} else if (filterRules.hasRecurrence === "hasProperty") {
			filtered = filtered.filter((task) => task.metadata.recurrence);
		} else if (filterRules.hasRecurrence === "noProperty") {
			filtered = filtered.filter((task) => !task.metadata.recurrence);
		}
	}

	// --- Apply `hasCreatedDate` Filter ---
	if (filterRules.hasCreatedDate) {
		if (filterRules.hasCreatedDate === "any") {
			// Do nothing
		} else if (filterRules.hasCreatedDate === "hasDate") {
			filtered = filtered.filter((task) => task.metadata.createdDate);
		} else if (filterRules.hasCreatedDate === "noDate") {
			filtered = filtered.filter((task) => !task.metadata.createdDate);
		}
	}

	return filtered;
}
