import {
	App,
	Keymap,
	Setting,
	TextComponent,
	editorInfoField,
	moment,
} from "obsidian";
import { StateField, StateEffect, Facet } from "@codemirror/state";
import {
	EditorView,
	showPanel,
	ViewUpdate,
	Panel,
	Decoration,
	DecorationSet,
} from "@codemirror/view";
import TaskProgressBarPlugin from "../index";
import {
	parseAdvancedFilterQuery,
	evaluateFilterNode,
} from "../utils/filterUtils";

// Effect to toggle the filter panel
export const toggleTaskFilter = StateEffect.define<boolean>();

// Define a state field to track whether the panel is open
export const taskFilterState = StateField.define<boolean>({
	create: () => false,
	update(value, tr) {
		for (let e of tr.effects) {
			if (e.is(toggleTaskFilter)) {
				if (tr.state.field(editorInfoField)?.file) {
					value = e.value;
				}
			}
		}
		return value;
	},
	provide: (field) =>
		showPanel.from(field, (active) =>
			active ? createTaskFilterPanel : null
		),
});

// Interface for filter options
export interface TaskFilterOptions {
	// Filter task statuses
	includeCompleted: boolean;
	includeInProgress: boolean;
	includeAbandoned: boolean;
	includeNotStarted: boolean;
	includePlanned: boolean;

	// Include parent and child tasks
	includeParentTasks: boolean;
	includeChildTasks: boolean;
	includeSiblingTasks: boolean; // New option for including sibling tasks

	// Advanced search query
	advancedFilterQuery: string;
	useAdvancedFilter: boolean;

	// Filter out/in tasks
	filterOutTasks: boolean;
}

// Default filter options
export const DEFAULT_FILTER_OPTIONS: TaskFilterOptions = {
	includeCompleted: true,
	includeInProgress: true,
	includeAbandoned: true,
	includeNotStarted: true,
	includePlanned: true,

	includeParentTasks: true,
	includeChildTasks: true,
	includeSiblingTasks: false, // Default to false for backward compatibility

	advancedFilterQuery: "",
	useAdvancedFilter: false,

	filterOutTasks: false,
};

// Facet to provide filter options
export const taskFilterOptions = Facet.define<
	TaskFilterOptions,
	TaskFilterOptions
>({
	combine: (values) => {
		// Start with default values
		const result = { ...DEFAULT_FILTER_OPTIONS };

		// Combine all values, with later definitions overriding earlier ones
		for (const value of values) {
			Object.assign(result, value);
		}

		return result;
	},
});

// Store the currently active filters
let activeFilters: TaskFilterOptions = { ...DEFAULT_FILTER_OPTIONS };
// Store the active hidden task ranges
let hiddenTaskRanges: Array<{ from: number; to: number }> = [];

// Helper function to get filter option value safely with proper typing
function getFilterOption(
	options: TaskFilterOptions,
	key: keyof TaskFilterOptions
): any {
	return options[key];
}

// Extended Task interface with additional properties for filtering
export interface Task {
	from: number;
	to: number;
	text: string;
	status: "completed" | "inProgress" | "abandoned" | "notStarted" | "planned";
	indentation: number;
	parentTask?: Task;
	childTasks: Task[];
	// Added properties for advanced filtering
	priority?: string; // Format: #A, #B, #C, etc. or emoji priorities
	date?: string; // Any date found in the task
	tags: string[]; // All tags found in the task
}

function filterPanelDisplay(
	view: EditorView,
	dom: HTMLElement,
	options: TaskFilterOptions,
	plugin: TaskProgressBarPlugin
) {
	// Create header with title
	const headerContainer = dom.createEl("div", {
		cls: "task-filter-header-container",
	});

	headerContainer.createEl("span", {
		cls: "task-filter-title",
		text: "Filter Tasks",
	});

	// Create the filter options section
	const filterOptionsDiv = dom.createEl("div", {
		cls: "task-filter-options",
	});

	// Add Advanced Filter Query Input
	const advancedSection = filterOptionsDiv.createEl("div", {
		cls: "task-filter-section",
	});

	let queryInput: TextComponent | null = null;

	// Text input for advanced filter
	new Setting(advancedSection)
		.setName("Query")
		.setDesc(
			"Use boolean operations: AND, OR, NOT. Example: 'text content AND #tag1 AND DATE:<2022-01-02 NOT PRIORITY:>=#B' - Supports >, <, =, >=, <=, != for PRIORITY and DATE."
		)
		.addText((text) => {
			queryInput = text;
			text.setValue(
				getFilterOption(options, "advancedFilterQuery")
			).onChange((value) => {
				activeFilters.advancedFilterQuery = value;
			});

			text.inputEl.addEventListener("keydown", (event) => {
				if (event.key === "Enter") {
					if (Keymap.isModEvent(event)) {
						activeFilters.filterOutTasks = true;
						applyTaskFilters(view, plugin);
					} else {
						activeFilters.filterOutTasks = false;
						applyTaskFilters(view, plugin);
					}
				} else if (event.key === "Escape") {
					view.dispatch({ effects: toggleTaskFilter.of(false) });
				}
			});

			text.inputEl.toggleClass("task-filter-query-input", true);
		});

	new Setting(advancedSection)
		.setName("Filter out tasks")
		.setDesc(
			"If true, tasks that match the query will be hidden, otherwise they will be shown"
		)
		.addToggle((toggle) => {
			toggle
				.setValue(getFilterOption(options, "filterOutTasks"))
				.onChange((value: boolean) => {
					activeFilters.filterOutTasks = value;
					applyTaskFilters(view, plugin);
				});
		});

	// Status filter checkboxes
	const statusSection = filterOptionsDiv.createEl("div", {
		cls: "task-filter-section",
	});

	new Setting(statusSection).setName("Task Status").setHeading();

	const statuses = [
		{ id: "Completed", label: "Completed" },
		{ id: "InProgress", label: "In Progress" },
		{ id: "Abandoned", label: "Abandoned" },
		{ id: "NotStarted", label: "Not Started" },
		{ id: "Planned", label: "Planned" },
	];

	for (const status of statuses) {
		const propName = `include${status.id}` as keyof TaskFilterOptions;

		new Setting(statusSection).setName(status.label).addToggle((toggle) => {
			toggle
				.setValue(getFilterOption(options, propName))
				.onChange((value: boolean) => {
					(activeFilters as any)[propName] = value;
					applyTaskFilters(view, plugin);
				});
		});
	}

	// Advanced filter options
	const relatedSection = filterOptionsDiv.createEl("div", {
		cls: "task-filter-section",
	});

	new Setting(relatedSection).setName("Include Related Tasks").setHeading();

	// Parent/Child task inclusion options
	const relatedOptions = [
		{ id: "ParentTasks", label: "Parent Tasks" },
		{ id: "ChildTasks", label: "Child Tasks" },
		{ id: "SiblingTasks", label: "Sibling Tasks" },
	];

	for (const option of relatedOptions) {
		const propName = `include${option.id}` as keyof TaskFilterOptions;

		new Setting(relatedSection)
			.setName(option.label)
			.addToggle((toggle) => {
				toggle
					.setValue(getFilterOption(options, propName))
					.onChange((value: boolean) => {
						(activeFilters as any)[propName] = value;
						applyTaskFilters(view, plugin);
					});
			});
	}

	new Setting(dom)
		.addButton((button) => {
			button.setCta();
			button.setButtonText("Apply").onClick(() => {
				applyTaskFilters(view, plugin);
			});
		})
		.addButton((button) => {
			button.buttonEl.toggleClass("mod-destructive", true);
			button.setButtonText("Reset").onClick(() => {
				resetTaskFilters(view);

				if (queryInput && queryInput.inputEl) {
					queryInput.inputEl.value = "";
				}
			});
		})
		.addButton((button) => {
			button.buttonEl.toggleClass("mod-destructive", true);
			button.setButtonText("Close").onClick(() => {
				view.dispatch({ effects: toggleTaskFilter.of(false) });
			});
		});

	const focusInput = () => {
		if (queryInput && queryInput.inputEl) {
			queryInput.inputEl.focus();
		}
	};

	return { focusInput };
}

// Create the task filter panel
function createTaskFilterPanel(view: EditorView): Panel {
	const dom = createDiv({
		cls: "task-filter-panel",
	});

	const plugin = view.state.facet(pluginFacet);
	const options = view.state.facet(taskFilterOptions);

	const { focusInput } = filterPanelDisplay(view, dom, options, plugin);

	return {
		dom,
		top: true,
		mount: () => {
			focusInput();
		},
		update: (update: ViewUpdate) => {
			// Update panel content if needed
		},
		destroy: () => {
			// Clear any filters when the panel is closed
			// Use setTimeout to avoid dispatching during an update
			setTimeout(() => {
				resetTaskFilters(view);
			}, 0);
		},
	};
}

// Apply the current task filters
function applyTaskFilters(view: EditorView, plugin: TaskProgressBarPlugin) {
	// Clear existing hidden ranges
	hiddenTaskRanges = [];

	// Find tasks in the document
	const tasks = findAllTasks(view, plugin.settings.taskStatuses);

	// Build a map of matching tasks for quick lookup
	const matchingTaskIds = new Set<number>();

	// First identify tasks that match the filter directly
	tasks.forEach((task, index) => {
		const baseResult = shouldHideTask(task, {
			...activeFilters,
			includeParentTasks: false,
			includeChildTasks: false,
			includeSiblingTasks: false,
		});

		if (!baseResult) {
			matchingTaskIds.add(index);
		}
	});

	// Then identify parent/child relationships to preserve
	if (
		activeFilters.includeParentTasks ||
		activeFilters.includeChildTasks ||
		activeFilters.includeSiblingTasks
	) {
		for (let i = 0; i < tasks.length; i++) {
			if (matchingTaskIds.has(i)) {
				const task = tasks[i];

				// Include parents if enabled
				if (activeFilters.includeParentTasks) {
					let parent = task.parentTask;
					while (parent) {
						const parentIndex = tasks.indexOf(parent);
						if (parentIndex !== -1) {
							matchingTaskIds.add(parentIndex);
						}
						parent = parent.parentTask;
					}
				}

				// Include children if enabled
				if (activeFilters.includeChildTasks) {
					const addChildren = (parentTask: Task) => {
						for (const child of parentTask.childTasks) {
							const childIndex = tasks.indexOf(child);
							if (childIndex !== -1) {
								matchingTaskIds.add(childIndex);
								// Recursively add grandchildren
								addChildren(child);
							}
						}
					};

					addChildren(task);
				}

				// Include siblings if enabled
				if (activeFilters.includeSiblingTasks && task.parentTask) {
					for (const sibling of task.parentTask.childTasks) {
						if (sibling !== task) {
							// Don't include self
							const siblingIndex = tasks.indexOf(sibling);
							if (siblingIndex !== -1) {
								matchingTaskIds.add(siblingIndex);
							}
						}
					}
				}
			}
		}
	}

	// Determine which tasks to hide
	const tasksToHide = tasks.filter(
		(task, index) => !matchingTaskIds.has(index)
	);

	// Store the ranges to hide
	hiddenTaskRanges = tasksToHide.map((task) => ({
		from: task.from,
		to: task.to,
	}));

	// Apply decorations to hide filtered tasks
	applyHiddenTaskDecorations(view);
}

// Reset all task filters
function resetTaskFilters(view: EditorView) {
	// Reset active filters to defaults
	activeFilters = { ...DEFAULT_FILTER_OPTIONS };

	// Clear hidden ranges
	hiddenTaskRanges = [];

	// Remove all task-hiding decorations
	applyHiddenTaskDecorations(view);
}

// Find all tasks in the document and build the task hierarchy
function findAllTasks(
	view: EditorView,
	taskStatusMarks: Record<string, string>
): Task[] {
	const doc = view.state.doc;
	const tasks: Task[] = [];
	const taskStack: Task[] = [];

	// Extract status marks for matching
	const completedMarks = taskStatusMarks.completed.split("|");
	const inProgressMarks = taskStatusMarks.inProgress.split("|");
	const abandonedMarks = taskStatusMarks.abandoned.split("|");
	const notStartedMarks = taskStatusMarks.notStarted.split("|");
	const plannedMarks = taskStatusMarks.planned.split("|");

	// Simple regex to match task lines
	const taskRegex = /^(\s*)(-|\*|(\d+\.)) \[(.)\] (.*)$/gm;

	// Regex for extracting priorities (both letter format and emoji)
	const priorityRegex =
		/\[(#[A-Z])\]|(?:🔺|⏫|🔼|🔽|⏬️|🔴|🟠|🟡|🟢|🔵|⚪️|⚫️)/g;

	// Regex for extracting tags
	const tagRegex =
		/#([a-zA-Z0-9_\-/\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\u3131-\uD79D]+)/g;

	// Regex for extracting dates (looking for YYYY-MM-DD format or other common date formats)
	const dateRegex =
		/\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}|\d{2}\/\d{2}\/\d{4}/g;

	// Search the document for task lines
	for (let i = 1; i <= doc.lines; i++) {
		const line = doc.line(i);
		const lineText = line.text;

		// Reset the regex
		taskRegex.lastIndex = 0;
		let m;

		if ((m = taskRegex.exec(lineText))) {
			const indentation = m[1].length;
			const statusMark = m[4]; // The character inside brackets
			const taskText = m[5]; // The text after the checkbox

			// Determine task status based on the mark
			let status:
				| "completed"
				| "inProgress"
				| "abandoned"
				| "notStarted"
				| "planned";

			// Match the status mark against our configured marks
			if (completedMarks.includes(statusMark)) {
				status = "completed";
			} else if (inProgressMarks.includes(statusMark)) {
				status = "inProgress";
			} else if (abandonedMarks.includes(statusMark)) {
				status = "abandoned";
			} else if (plannedMarks.includes(statusMark)) {
				status = "planned";
			} else {
				status = "notStarted";
			}

			// Extract priority
			priorityRegex.lastIndex = 0;
			const priorityMatch = priorityRegex.exec(taskText);
			let priority = priorityMatch ? priorityMatch[0] : undefined;

			// Extract tags
			tagRegex.lastIndex = 0;
			const tags: string[] = [];
			let tagMatch;
			while ((tagMatch = tagRegex.exec(taskText)) !== null) {
				tags.push(tagMatch[0]);
			}

			// Extract date
			dateRegex.lastIndex = 0;
			const dateMatch = dateRegex.exec(taskText);
			let date = dateMatch ? dateMatch[0] : undefined;

			// Create the task object
			const task: Task = {
				from: line.from,
				to: line.to,
				text: taskText,
				status,
				indentation,
				childTasks: [],
				priority,
				date,
				tags,
			};

			// Fix: Build hierarchy - find the parent for this task
			// Pop items from stack until we find a potential parent with less indentation
			while (
				taskStack.length > 0 &&
				taskStack[taskStack.length - 1].indentation >= indentation
			) {
				taskStack.pop();
			}

			// If we still have items in the stack, the top item is our parent
			if (taskStack.length > 0) {
				const parent = taskStack[taskStack.length - 1];
				task.parentTask = parent;
				parent.childTasks.push(task);
			}

			// Add to the task list and stack
			tasks.push(task);
			taskStack.push(task);
		}
	}

	return tasks;
}

// Determine if a task should be hidden based on filter criteria
function shouldHideTask(task: Task, filters: TaskFilterOptions): boolean {
	// If the task has a matching parent and we want to include parent tasks
	if (filters.includeParentTasks) {
		// Check for any descendant that matches the query
		const hasMatchingChild = hasMatchingDescendant(task, filters);
		if (hasMatchingChild) return false;
	}

	// If using advanced filter, apply that logic
	if (filters.advancedFilterQuery.trim() !== "") {
		try {
			const parseResult = parseAdvancedFilterQuery(
				filters.advancedFilterQuery
			);
			const result = evaluateFilterNode(parseResult, task);
			if (filters.filterOutTasks) {
				return result;
			} else {
				return !result;
			}
		} catch (error) {
			console.error("Error evaluating advanced filter:", error);
			// Fall back to basic filtering if parsing fails
		}
	}

	// Basic status filters
	if (!filters.includeCompleted && task.status === "completed") return true;
	if (!filters.includeInProgress && task.status === "inProgress") return true;
	if (!filters.includeAbandoned && task.status === "abandoned") return true;
	if (!filters.includeNotStarted && task.status === "notStarted") return true;
	if (!filters.includePlanned && task.status === "planned") return true;

	return false;
}

// Helper function to check if a task has a descendant that matches the filter
function hasMatchingDescendant(
	task: Task,
	filters: TaskFilterOptions
): boolean {
	// Check if any direct child matches
	for (const child of task.childTasks) {
		// Temporarily ignore parent/child include settings to avoid recursion issues
		const tempFilters = { ...filters };
		tempFilters.includeParentTasks = false;
		tempFilters.includeChildTasks = false;

		// If the child itself doesn't match the hide criteria (would be shown),
		// then this parent should also be shown
		if (!shouldHideTask(child, tempFilters)) {
			return true;
		}

		// Recursively check grandchildren
		if (hasMatchingDescendant(child, tempFilters)) {
			return true;
		}
	}

	return false;
}

// Apply decorations to hide filtered tasks
function applyHiddenTaskDecorations(view: EditorView) {
	// Create decorations for hidden tasks
	const decorations = hiddenTaskRanges.map((range) => {
		return Decoration.replace({
			inclusive: true,
			block: true,
		}).range(range.from, range.to);
	});

	// Apply the decorations
	if (decorations.length > 0) {
		view.dispatch({
			effects: filterTasksEffect.of(
				Decoration.none.update({
					add: decorations,
					filter: () => false,
				})
			),
		});
	} else {
		// Clear decorations if no tasks to hide
		view.dispatch({
			effects: filterTasksEffect.of(Decoration.none),
		});
	}
}

// State field to handle hidden task decorations
export const filterTasksEffect = StateEffect.define<DecorationSet>();

export const filterTasksField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(decorations, tr) {
		decorations = decorations.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(filterTasksEffect)) {
				decorations = effect.value;
			}
		}
		return decorations;
	},
	provide(field) {
		return EditorView.decorations.from(field);
	},
});

// Facets to make app and plugin instances available to the panel
export const appFacet = Facet.define<App, App>({
	combine: (values) => values[0],
});

export const pluginFacet = Facet.define<
	TaskProgressBarPlugin,
	TaskProgressBarPlugin
>({
	combine: (values) => values[0],
});

// Create the extension to enable task filtering in an editor
export function taskFilterExtension(plugin: TaskProgressBarPlugin) {
	return [
		taskFilterState,
		filterTasksField,
		taskFilterOptions.of(DEFAULT_FILTER_OPTIONS),
		pluginFacet.of(plugin),
	];
}
