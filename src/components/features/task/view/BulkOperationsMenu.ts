/**
 * Bulk Operations Menu
 * Provides right-click context menu for bulk task operations
 */

import { App, Menu, Notice } from "obsidian";
import { Task } from "@/types/task";
import { TaskSelectionManager } from "@/components/features/task/selection/TaskSelectionManager";
import TaskProgressBarPlugin from "@/index";
import { t } from "@/translations/helper";
import { BulkOperationResult } from "@/types/selection";
import { createTaskCheckbox } from "./details";
import { ConfirmModal } from "@/components/ui";
import type { UpdateTaskArgs } from "@/dataflow/api/WriteAPI";
import { BulkDatePickerModal } from "@/components/ui/date-picker/BulkDatePickerModal";
import { BulkDateOffsetModal } from "@/components/ui/date-picker/BulkDateOffsetModal";
import { addDays } from "date-fns";
import { getCachedData } from "@/components/ui/inputs/AutoComplete";

/**
 * Create and show bulk operations menu
 */
export async function showBulkOperationsMenu(
	event: MouseEvent,
	app: App,
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): Promise<void> {
	const menu = new Menu();
	const selectedCount = selectionManager.getSelectedCount();

	// Menu title
	menu.addItem((item) => {
		item.setTitle(`${selectedCount} tasks selected`);
		item.setDisabled(true);
	});

	menu.addSeparator();

	// Bulk change status
	addBulkStatusChangeMenu(
		menu,
		plugin,
		selectionManager,
		onOperationComplete,
	);

	// Bulk set dates
	addBulkSetDateMenu(
		menu,
		app,
		plugin,
		selectionManager,
		onOperationComplete,
	);

	// Bulk set priority
	addBulkSetPriorityMenu(menu, plugin, selectionManager, onOperationComplete);

	// Bulk move to project
	await addBulkMoveToProjectMenu(
		menu,
		plugin,
		selectionManager,
		onOperationComplete,
	);

	menu.addSeparator();

	// Bulk delete
	addBulkDeleteMenu(menu, plugin, selectionManager, onOperationComplete);

	menu.addSeparator();

	// Selection management
	addSelectionManagementMenu(menu, selectionManager);

	// Show menu at mouse position
	menu.showAtMouseEvent(event);
}

/**
 * Add bulk status change submenu
 */
function addBulkStatusChangeMenu(
	menu: Menu,
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): void {
	menu.addItem((item) => {
		item.setIcon("square-pen");
		item.setTitle(t("Bulk change status"));
		const submenu = item.setSubmenu();

		// Get unique statuses from taskStatusMarks
		const statusMarks = plugin.settings.taskStatusMarks;
		const uniqueStatuses = new Map<string, string>();

		// Build a map of unique mark -> status name to avoid duplicates
		for (const status of Object.keys(statusMarks)) {
			const mark = statusMarks[status as keyof typeof statusMarks];
			if (!Array.from(uniqueStatuses.values()).includes(mark)) {
				uniqueStatuses.set(status, mark);
			}
		}

		// Create menu items from unique statuses
		for (const [status, mark] of uniqueStatuses) {
			submenu.addItem((subItem) => {
				// Create checkbox indicator
				subItem.titleEl.createEl(
					"span",
					{
						cls: "status-option-checkbox",
					},
					(el) => {
						createTaskCheckbox(mark, {} as Task, el);
					},
				);
				subItem.titleEl.createEl("span", {
					cls: "status-option",
					text: status,
				});
				subItem.onClick(async () => {
					await executeBulkStatusChange(
						mark,
						status,
						plugin,
						selectionManager,
						onOperationComplete,
					);
				});
			});
		}
	});
}

/**
 * Add bulk set date submenu
 */
function addBulkSetDateMenu(
	menu: Menu,
	app: App,
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): void {
	menu.addItem((item) => {
		item.setIcon("calendar");
		item.setTitle(t("Bulk set date"));
		const dateSubmenu = item.setSubmenu();

		// Set specific date submenu
		const setDateSubmenu = dateSubmenu.addItem((subItem) => {
			subItem.setTitle(t("Set specific date"));
			return subItem.setSubmenu();
		});

		setDateSubmenu.addItem((subItem) => {
			subItem.setTitle(t("Due date"));
			subItem.onClick(async () => {
				await showDatePickerForBulk(
					"dueDate",
					app,
					plugin,
					selectionManager,
					onOperationComplete,
				);
			});
		});

		setDateSubmenu.addItem((subItem) => {
			subItem.setTitle(t("Start date"));
			subItem.onClick(async () => {
				await showDatePickerForBulk(
					"startDate",
					app,
					plugin,
					selectionManager,
					onOperationComplete,
				);
			});
		});

		setDateSubmenu.addItem((subItem) => {
			subItem.setTitle(t("Scheduled date"));
			subItem.onClick(async () => {
				await showDatePickerForBulk(
					"scheduledDate",
					app,
					plugin,
					selectionManager,
					onOperationComplete,
				);
			});
		});

		// Postpone by submenu
		const postponeSubmenu = dateSubmenu.addItem((subItem) => {
			subItem.setTitle(t("Postpone by..."));
			return subItem.setSubmenu();
		});

		postponeSubmenu.addItem((subItem) => {
			subItem.setTitle(t("Due date"));
			subItem.onClick(async () => {
				await showDateOffsetForBulk(
					"dueDate",
					app,
					plugin,
					selectionManager,
					onOperationComplete,
				);
			});
		});

		postponeSubmenu.addItem((subItem) => {
			subItem.setTitle(t("Start date"));
			subItem.onClick(async () => {
				await showDateOffsetForBulk(
					"startDate",
					app,
					plugin,
					selectionManager,
					onOperationComplete,
				);
			});
		});

		postponeSubmenu.addItem((subItem) => {
			subItem.setTitle(t("Scheduled date"));
			subItem.onClick(async () => {
				await showDateOffsetForBulk(
					"scheduledDate",
					app,
					plugin,
					selectionManager,
					onOperationComplete,
				);
			});
		});

		dateSubmenu.addSeparator();

		// Clear dates submenu
		const clearSubmenu = dateSubmenu.addItem((subItem) => {
			subItem.setTitle(t("Clear dates"));
			return subItem.setSubmenu();
		});

		clearSubmenu.addItem((subItem) => {
			subItem.setTitle(t("Clear due date"));
			subItem.onClick(async () => {
				await executeBulkClearDate(
					"dueDate",
					plugin,
					selectionManager,
					onOperationComplete,
				);
			});
		});

		clearSubmenu.addItem((subItem) => {
			subItem.setTitle(t("Clear start date"));
			subItem.onClick(async () => {
				await executeBulkClearDate(
					"startDate",
					plugin,
					selectionManager,
					onOperationComplete,
				);
			});
		});

		clearSubmenu.addItem((subItem) => {
			subItem.setTitle(t("Clear scheduled date"));
			subItem.onClick(async () => {
				await executeBulkClearDate(
					"scheduledDate",
					plugin,
					selectionManager,
					onOperationComplete,
				);
			});
		});
	});
}

/**
 * Add bulk set priority submenu
 */
function addBulkSetPriorityMenu(
	menu: Menu,
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): void {
	menu.addItem((item) => {
		item.setIcon("alert-triangle");
		item.setTitle(t("Bulk set priority"));
		const submenu = item.setSubmenu();

		// Priority levels 1-5
		for (let priority = 1; priority <= 5; priority++) {
			submenu.addItem((subItem) => {
				subItem.setTitle(
					`${"!".repeat(priority)} Priority ${priority}`,
				);
				subItem.onClick(async () => {
					await executeBulkSetPriority(
						priority,
						plugin,
						selectionManager,
						onOperationComplete,
					);
				});
			});
		}

		submenu.addSeparator();

		// Clear priority
		submenu.addItem((subItem) => {
			subItem.setTitle(t("Clear priority"));
			subItem.onClick(async () => {
				await executeBulkClearPriority(
					plugin,
					selectionManager,
					onOperationComplete,
				);
			});
		});
	});
}

/**
 * Add bulk move to project submenu
 */
async function addBulkMoveToProjectMenu(
	menu: Menu,
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): Promise<void> {
	// Get all projects from cached data
	const projects = await getProjectList(plugin);

	menu.addItem((item) => {
		item.setIcon("folder");
		item.setTitle(t("Bulk move to project"));
		const submenu = item.setSubmenu();

		if (projects.length === 0) {
			submenu.addItem((subItem) => {
				subItem.setTitle(t("No projects available"));
				subItem.setDisabled(true);
			});
			return;
		}

		// Add each project
		projects.forEach((project) => {
			submenu.addItem((subItem) => {
				subItem.setTitle(project);
				subItem.onClick(async () => {
					await executeBulkMoveToProject(
						project,
						plugin,
						selectionManager,
						onOperationComplete,
					);
				});
			});
		});

		submenu.addSeparator();

		// Clear project
		submenu.addItem((subItem) => {
			subItem.setTitle(t("Clear project"));
			subItem.onClick(async () => {
				await executeBulkClearProject(
					plugin,
					selectionManager,
					onOperationComplete,
				);
			});
		});
	});
}

/**
 * Add bulk delete menu item
 */
function addBulkDeleteMenu(
	menu: Menu,
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): void {
	menu.addItem((item) => {
		item.setIcon("trash");
		item.setTitle(t("Bulk delete"));
		item.onClick(async () => {
			const count = selectionManager.getSelectedCount();

			// Show confirmation modal
			const confirmed = await new Promise<boolean>((resolve) => {
				new ConfirmModal(plugin, {
					title: t("Confirm bulk delete"),
					message: t(
						"Are you sure you want to delete {{count}} tasks?",
						{
							interpolation: {
								count: count.toString(),
							},
						},
					),
					confirmText: t("Delete"),
					cancelText: t("Cancel"),
					onConfirm: (result: boolean) => resolve(result),
				}).open();
			});

			if (confirmed) {
				await executeBulkDelete(
					plugin,
					selectionManager,
					onOperationComplete,
				);
			}
		});
	});
}

/**
 * Add selection management menu items
 */
function addSelectionManagementMenu(
	menu: Menu,
	selectionManager: TaskSelectionManager,
): void {
	menu.addItem((item) => {
		item.setTitle(t("Clear selection"));
		item.setIcon("x");
		item.onClick(() => {
			selectionManager.clearSelection();
			selectionManager.exitSelectionMode("user_action");
		});
	});
}

// ============================================================================
// Execution Functions
// ============================================================================

/**
 * Execute bulk status change
 */
async function executeBulkStatusChange(
	newStatus: string,
	statusName: string,
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): Promise<void> {
	const tasks = selectionManager.getSelectedTasks();

	const result = await executeBulkOperation(
		tasks,
		(task) => {
			const isCompletedStatus = plugin.settings.taskStatuses.completed
				.split("|")
				.includes(newStatus.toLowerCase());

			// Only return the fields that need to be updated
			const updates: Partial<Task> = {
				status: newStatus,
				completed: isCompletedStatus,
			};

			// Update completed date metadata if status changed
			if (isCompletedStatus && !task.completed) {
				updates.metadata = {
					...task.metadata,
					completedDate: Date.now(),
				};
			} else if (!isCompletedStatus && task.completed) {
				updates.metadata = {
					...task.metadata,
					completedDate: undefined,
				};
			}

			return updates;
		},
		plugin,
	);

	console.log(result, tasks);

	showOperationResult(result, `Changed status to "${statusName}"`);
	selectionManager.exitSelectionMode("operation_complete");
	onOperationComplete();
}

/**
 * Show date picker modal for bulk operation (specific date)
 */
async function showDatePickerForBulk(
	dateType: "dueDate" | "startDate" | "scheduledDate",
	app: App,
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): Promise<void> {
	const modal = new BulkDatePickerModal(app, plugin, dateType);
	modal.onDateSelected = async (timestamp: number) => {
		await executeBulkSetDate(
			dateType,
			timestamp,
			plugin,
			selectionManager,
			onOperationComplete,
		);
	};
	modal.open();
}

/**
 * Show date offset modal for bulk operation (postpone by X days)
 */
async function showDateOffsetForBulk(
	dateType: "dueDate" | "startDate" | "scheduledDate",
	app: App,
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): Promise<void> {
	const modal = new BulkDateOffsetModal(app, plugin, dateType);
	modal.onOffsetSelected = async (offsetDays: number) => {
		await executeBulkOffsetDate(
			dateType,
			offsetDays,
			plugin,
			selectionManager,
			onOperationComplete,
		);
	};
	modal.open();
}

/**
 * Execute bulk set date (specific date)
 */
async function executeBulkSetDate(
	dateType: "dueDate" | "startDate" | "scheduledDate",
	timestamp: number,
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): Promise<void> {
	const tasks = selectionManager.getSelectedTasks();

	const result = await executeBulkOperation(
		tasks,
		(task) => {
			return {
				metadata: {
					...task.metadata,
					[dateType]: timestamp,
				},
			};
		},
		plugin,
	);

	showOperationResult(result, `Set ${dateType}`);
	selectionManager.exitSelectionMode("operation_complete");
	onOperationComplete();
}

/**
 * Execute bulk offset date (postpone/advance by X days)
 */
async function executeBulkOffsetDate(
	dateType: "dueDate" | "startDate" | "scheduledDate",
	offsetDays: number,
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): Promise<void> {
	const tasks = selectionManager.getSelectedTasks();

	const result = await executeBulkOperation(
		tasks,
		(task) => {
			// Get current date or use today as base
			const currentTimestamp = task.metadata?.[dateType];
			const baseDate = currentTimestamp
				? new Date(currentTimestamp)
				: new Date();

			// Calculate new date
			const newDate = addDays(baseDate, offsetDays);
			const newTimestamp = newDate.getTime();

			return {
				metadata: {
					...task.metadata,
					[dateType]: newTimestamp,
				},
			};
		},
		plugin,
	);

	const action = offsetDays > 0 ? "Postponed" : "Advanced";
	const daysText = Math.abs(offsetDays) === 1 ? "day" : "days";
	showOperationResult(
		result,
		`${action} ${dateType} by ${Math.abs(offsetDays)} ${daysText}`,
	);
	selectionManager.exitSelectionMode("operation_complete");
	onOperationComplete();
}

/**
 * Execute bulk clear date
 */
async function executeBulkClearDate(
	dateType: "dueDate" | "startDate" | "scheduledDate",
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): Promise<void> {
	const tasks = selectionManager.getSelectedTasks();

	const result = await executeBulkOperation(
		tasks,
		(task) => {
			return {
				metadata: {
					...task.metadata,
					[dateType]: undefined,
				},
			};
		},
		plugin,
	);

	showOperationResult(result, `Cleared ${dateType}`);
	selectionManager.exitSelectionMode("operation_complete");
	onOperationComplete();
}

/**
 * Execute bulk set priority
 */
async function executeBulkSetPriority(
	priority: number,
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): Promise<void> {
	const tasks = selectionManager.getSelectedTasks();

	const result = await executeBulkOperation(
		tasks,
		(task) => {
			return {
				metadata: {
					...task.metadata,
					priority,
				},
			};
		},
		plugin,
	);

	showOperationResult(result, `Set priority to ${priority}`);
	selectionManager.exitSelectionMode("operation_complete");
	onOperationComplete();
}

/**
 * Execute bulk clear priority
 */
async function executeBulkClearPriority(
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): Promise<void> {
	const tasks = selectionManager.getSelectedTasks();

	const result = await executeBulkOperation(
		tasks,
		(task) => {
			return {
				metadata: {
					...task.metadata,
					priority: undefined,
				},
			};
		},
		plugin,
	);

	showOperationResult(result, "Cleared priority");
	selectionManager.exitSelectionMode("operation_complete");
	onOperationComplete();
}

/**
 * Execute bulk move to project
 */
async function executeBulkMoveToProject(
	project: string,
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): Promise<void> {
	const tasks = selectionManager.getSelectedTasks();

	const result = await executeBulkOperation(
		tasks,
		(task) => {
			return {
				metadata: {
					...task.metadata,
					project,
				},
			};
		},
		plugin,
	);

	showOperationResult(result, `Moved to project "${project}"`);
	selectionManager.exitSelectionMode("operation_complete");
	onOperationComplete();
}

/**
 * Execute bulk clear project
 */
async function executeBulkClearProject(
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): Promise<void> {
	const tasks = selectionManager.getSelectedTasks();

	const result = await executeBulkOperation(
		tasks,
		(task) => {
			return {
				metadata: {
					...task.metadata,
					project: undefined,
				},
			};
		},
		plugin,
	);

	showOperationResult(result, "Cleared project");
	selectionManager.exitSelectionMode("operation_complete");
	onOperationComplete();
}

/**
 * Execute bulk delete
 */
async function executeBulkDelete(
	plugin: TaskProgressBarPlugin,
	selectionManager: TaskSelectionManager,
	onOperationComplete: () => void,
): Promise<void> {
	const tasks = selectionManager.getSelectedTasks();
	let successCount = 0;
	let failCount = 0;
	const errors: BulkOperationResult["errors"] = [];

	for (const task of tasks) {
		try {
			if (!plugin.writeAPI) {
				throw new Error("WriteAPI not available");
			}
			const result = await plugin.writeAPI.deleteTask({
				taskId: task.id,
				deleteChildren: false,
			});
			if (result.success) {
				successCount++;
			} else {
				failCount++;
				errors.push({
					taskId: task.id,
					taskContent: task.content,
					error: result.error || "Unknown error",
				});
			}
		} catch (error) {
			failCount++;
			errors.push({
				taskId: task.id,
				taskContent: task.content,
				error: (error as Error).message || "Unknown error",
			});
		}
	}

	const result: BulkOperationResult = {
		successCount,
		failCount,
		errors,
		totalCount: tasks.length,
	};

	showOperationResult(result, "Deleted tasks");
	selectionManager.exitSelectionMode("operation_complete");
	onOperationComplete();
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generic bulk operation executor
 * Note: The operation function should return only the fields that need to be updated
 */
async function executeBulkOperation(
	tasks: Task[],
	operation: (task: Task) => Partial<Task>,
	plugin: TaskProgressBarPlugin,
): Promise<BulkOperationResult> {
	if (!plugin.writeAPI) {
		return {
			successCount: 0,
			failCount: tasks.length,
			errors: tasks.map((task) => ({
				taskId: task.id,
				taskContent: task.content,
				error: "WriteAPI not available",
			})),
			totalCount: tasks.length,
		};
	}

	const updateRequests: UpdateTaskArgs[] = [];
	const originalContent = new Map<string, string>();

	for (const task of tasks) {
		// Operation now returns only the fields to update, not the full task
		const updates = operation(task);

		updateRequests.push({
			taskId: task.id,
			updates,
		});
		originalContent.set(task.id, task.content);
	}

	const result =
		await plugin.writeAPI.updateTasksSequentially(updateRequests);

	const normalizedErrors = result.errors.map((error) => ({
		...error,
		taskContent:
			error.taskContent ||
			originalContent.get(error.taskId) ||
			error.taskContent,
	}));

	return {
		...result,
		errors: normalizedErrors,
	};
}

/**
 * Show operation result notification
 */
function showOperationResult(
	result: BulkOperationResult,
	operation: string,
): void {
	if (result.failCount === 0) {
		new Notice(
			`✓ ${operation}: ${result.successCount} tasks updated successfully`,
		);
	} else {
		new Notice(
			`⚠ ${operation}: ${result.successCount} succeeded, ${result.failCount} failed`,
		);

		// Log errors to console
		if (result.errors.length > 0) {
			console.error("Bulk operation errors:", result.errors);
		}
	}
}

/**
 * Get list of all projects using cached data
 */
async function getProjectList(
	plugin: TaskProgressBarPlugin,
): Promise<string[]> {
	try {
		// Load fresh data to ensure newly added projects appear
		const cachedData = await getCachedData(plugin, true);
		return cachedData.projects;
	} catch (error) {
		console.warn("Could not get projects from cached data:", error);
		return [];
	}
}
