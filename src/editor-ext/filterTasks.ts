import {
	App,
	DropdownComponent,
	ItemView,
	Keymap,
	MarkdownView,
	Menu,
	Setting,
	TextComponent,
	View,
	debounce,
	editorEditorField,
	editorInfoField,
	moment,
} from "obsidian";
import { StateField, StateEffect, Facet, EditorState } from "@codemirror/state";
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

// Effect to update active filter options
export const updateActiveFilters = StateEffect.define<TaskFilterOptions>();

// Effect to update hidden task ranges
export const updateHiddenTaskRanges =
	StateEffect.define<Array<{ from: number; to: number }>>();

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

// Define a state field to track active filters for each editor view
export const activeFiltersState = StateField.define<TaskFilterOptions>({
	create: () => ({ ...DEFAULT_FILTER_OPTIONS }),
	update(value, tr) {
		for (let e of tr.effects) {
			if (e.is(updateActiveFilters)) {
				value = e.value;
			}
		}
		return value;
	},
});

export const actionButtonState = StateField.define<boolean>({
	create: (state: EditorState) => {
		// Initialize as false, will be set to true once action button is added
		return false;
	},
	update(value, tr) {
		// Check if this is the first time we're loading
		if (!value) {
			setTimeout(() => {
				// Get the editor view from the transaction state
				const view = tr.state.field(
					editorInfoField
				) as unknown as ItemView;
				const editor = tr.state.field(editorEditorField);
				if (view && editor) {
					// @ts-ignore
					if (view.filterAction) {
						return true;
					}
					const plugin = tr.state.facet(pluginFacet);
					// Add preset menu action button to the markdown view
					const filterAction = view.addAction(
						"filter",
						"task-filter-presets",
						(event) => {
							// Create dropdown menu for filter presets
							const menu = new Menu();

							const activeFilters =
								getActiveFiltersForView(editor);

							if (
								activeFilters &&
								checkFilterChanges(editor, plugin)
							) {
								menu.addItem((item) => {
									item.setTitle("Reset").onClick(() => {
										editor?.dispatch({
											effects: updateActiveFilters.of(
												DEFAULT_FILTER_OPTIONS
											),
										});
										applyTaskFilters(editor, plugin);
										editor.dispatch({
											effects: toggleTaskFilter.of(false),
										});
									});
								});
							}
							menu.addItem((item) => {
								item.setTitle(
									editor.state.field(taskFilterState)
										? "Hide filter panel"
										: "Show filter panel"
								).onClick(() => {
									editor?.dispatch({
										effects: toggleTaskFilter.of(
											!editor.state.field(taskFilterState)
										),
									});
								});
							});

							menu.addSeparator();

							// Add presets from plugin settings
							if (
								plugin &&
								plugin.settings.taskFilter.presetTaskFilters
							) {
								plugin.settings.taskFilter.presetTaskFilters.forEach(
									(preset) => {
										menu.addItem((item) => {
											item.setTitle(preset.name).onClick(
												() => {
													// Apply the selected preset
													if (editor) {
														editor.dispatch({
															effects:
																updateActiveFilters.of(
																	{
																		...preset.options,
																	}
																),
														});
														// Apply filters immediately
														applyTaskFilters(
															editor,
															plugin
														);
													}
												}
											);
										});
									}
								);
							}

							// Show the menu
							menu.showAtMouseEvent(event);
						}
					);

					// @ts-ignore
					view.filterAction = filterAction;
				}
			}, 0);
			return true;
		}
		return value;
	},
});

// Define a state field to track hidden task ranges for each editor view
export const hiddenTaskRangesState = StateField.define<
	Array<{ from: number; to: number }>
>({
	create: () => [],
	update(value, tr) {
		// Update if there's an explicit update effect
		for (let e of tr.effects) {
			if (e.is(updateHiddenTaskRanges)) {
				return e.value;
			}
		}

		// Otherwise, map ranges through document changes
		if (tr.docChanged) {
			value = value.map((range) => ({
				from: tr.changes.mapPos(range.from),
				to: tr.changes.mapPos(range.to),
			}));
		}
		return value;
	},
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

function checkFilterChanges(view: EditorView, plugin: TaskProgressBarPlugin) {
	// Get active filters from the state instead of the facet
	const options = getActiveFiltersForView(view);

	// Check if current filter options are the same as default options
	const isDefault = Object.keys(DEFAULT_FILTER_OPTIONS).every((key) => {
		return (
			options[key as keyof TaskFilterOptions] ===
			DEFAULT_FILTER_OPTIONS[key as keyof TaskFilterOptions]
		);
	});

	// Return whether there are any changes from default
	return !isDefault;
}

function filterPanelDisplay(
	view: EditorView,
	dom: HTMLElement,
	options: TaskFilterOptions,
	plugin: TaskProgressBarPlugin
) {
	// Get current active filters from state
	let activeFilters = getActiveFiltersForView(view);

	const debounceFilter = debounce(
		(view: EditorView, plugin: TaskProgressBarPlugin) => {
			applyTaskFilters(view, plugin);
		},
		2000
	);

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

	// Add preset filter selector
	const presetContainer = filterOptionsDiv.createEl("div", {
		cls: "task-filter-preset-container",
	});

	const presetFilters = plugin.settings.taskFilter.presetTaskFilters || [];

	let d: DropdownComponent | null = null;

	if (presetFilters.length > 0) {
		new Setting(presetContainer)
			.setName("Preset filters")
			.setDesc("Select a saved filter preset to apply")
			.addDropdown((dropdown) => {
				// Add an empty option
				dropdown.addOption("", "Select a preset...");
				d = dropdown;
				// Add each preset as an option
				presetFilters.forEach((preset) => {
					dropdown.addOption(preset.id, preset.name);
				});

				dropdown.onChange((selectedId) => {
					if (selectedId) {
						// Find the selected preset
						const selectedPreset = presetFilters.find(
							(p) => p.id === selectedId
						);
						if (selectedPreset) {
							// Apply the preset's filter options
							activeFilters = { ...selectedPreset.options };
							// Update state with new active filters
							view.dispatch({
								effects: updateActiveFilters.of({
									...activeFilters,
								}),
							});

							// Update the UI to reflect the selected options
							updateFilterUI();

							// Apply the filters
							applyTaskFilters(view, plugin);
						}
					} else {
						// Reset to default options
						activeFilters = { ...DEFAULT_FILTER_OPTIONS };
						// Update state with new active filters
						view.dispatch({
							effects: updateActiveFilters.of({
								...activeFilters,
							}),
						}); // Update the UI to reflect the selected options
						updateFilterUI();

						// Apply the filters
						applyTaskFilters(view, plugin);
					}
				});
			});
	}

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
				// Update state with new active filters
				view.dispatch({
					effects: updateActiveFilters.of({ ...activeFilters }),
				});
				debounceFilter(view, plugin);
			});

			text.inputEl.addEventListener("keydown", (event) => {
				if (event.key === "Enter") {
					if (Keymap.isModEvent(event)) {
						activeFilters.filterOutTasks = true;
						// Update state with new active filters
						view.dispatch({
							effects: updateActiveFilters.of({
								...activeFilters,
							}),
						});
						debounceFilter(view, plugin);
					} else {
						activeFilters.filterOutTasks = false;
						// Update state with new active filters
						view.dispatch({
							effects: updateActiveFilters.of({
								...activeFilters,
							}),
						});
						debounceFilter(view, plugin);
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
					// Update state with new active filters
					view.dispatch({
						effects: updateActiveFilters.of({ ...activeFilters }),
					});

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

	// Store status toggles for updating when preset is selected
	const statusToggles: Record<string, any> = {};

	for (const status of statuses) {
		const propName = `include${status.id}` as keyof TaskFilterOptions;

		new Setting(statusSection).setName(status.label).addToggle((toggle) => {
			statusToggles[propName] = toggle;
			toggle
				.setValue(getFilterOption(options, propName))
				.onChange((value: boolean) => {
					(activeFilters as any)[propName] = value;
					// Update state with new active filters
					view.dispatch({
						effects: updateActiveFilters.of({ ...activeFilters }),
					});
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

	// Store related toggles for updating when preset is selected
	const relatedToggles: Record<string, any> = {};

	for (const option of relatedOptions) {
		const propName = `include${option.id}` as keyof TaskFilterOptions;

		new Setting(relatedSection)
			.setName(option.label)
			.addToggle((toggle) => {
				relatedToggles[propName] = toggle;
				toggle
					.setValue(getFilterOption(options, propName))
					.onChange((value: boolean) => {
						(activeFilters as any)[propName] = value;
						// Update state with new active filters
						view.dispatch({
							effects: updateActiveFilters.of({
								...activeFilters,
							}),
						});

						applyTaskFilters(view, plugin);
					});
			});
	}

	// Action buttons
	new Setting(dom)
		.addButton((button) => {
			button.setCta();
			button.setButtonText("Apply").onClick(() => {
				applyTaskFilters(view, plugin);
			});
		})
		.addButton((button) => {
			button.setCta();
			button.setButtonText("Save").onClick(() => {
				// Check if there are any changes to save
				if (checkFilterChanges(view, plugin)) {
					// Get current active filters from state
					const currentActiveFilters = getActiveFiltersForView(view);

					const newPreset = {
						id:
							Date.now().toString() +
							Math.random().toString(36).substr(2, 9),
						name: "New Preset",
						options: { ...currentActiveFilters },
					};

					// Add to settings
					plugin.settings.taskFilter.presetTaskFilters.push(
						newPreset
					);
					plugin.saveSettings();

					new Notice("Preset saved");
				} else {
					new Notice("No changes to save");
				}
			});
		})
		.addButton((button) => {
			button.buttonEl.toggleClass("mod-destructive", true);
			button.setButtonText("Reset").onClick(() => {
				resetTaskFilters(view);

				if (queryInput && queryInput.inputEl) {
					queryInput.inputEl.value = "";
				}

				activeFilters = { ...DEFAULT_FILTER_OPTIONS };
				// Update state with new active filters
				view.dispatch({
					effects: updateActiveFilters.of({
						...activeFilters,
					}),
				}); // Update the UI to reflect the selected options
				updateFilterUI();
				if (d) {
					d.setValue("");
				}

				// Apply the filters
				applyTaskFilters(view, plugin);
			});
		})
		.addButton((button) => {
			button.buttonEl.toggleClass("mod-destructive", true);
			button.setButtonText("Close").onClick(() => {
				view.dispatch({ effects: toggleTaskFilter.of(false) });
			});
		});

	// Function to update UI elements when a preset is selected
	function updateFilterUI() {
		const activeFilters = getActiveFiltersForView(view);
		// Update query input
		if (queryInput) {
			queryInput.setValue(activeFilters.advancedFilterQuery);
		}

		// Update status toggles
		for (const status of statuses) {
			const propName = `include${status.id}` as keyof TaskFilterOptions;
			if (statusToggles[propName]) {
				statusToggles[propName].setValue(
					(activeFilters as any)[propName]
				);
			}
		}

		// Update related toggles
		for (const option of relatedOptions) {
			const propName = `include${option.id}` as keyof TaskFilterOptions;
			if (relatedToggles[propName]) {
				relatedToggles[propName].setValue(
					(activeFilters as any)[propName]
				);
			}
		}
	}

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

	// Use the activeFiltersState instead of the taskFilterOptions
	// This ensures we're showing the actual current state for this editor
	const activeFilters = getActiveFiltersForView(view);

	const { focusInput } = filterPanelDisplay(view, dom, activeFilters, plugin);

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
			// setTimeout(() => {
			// 	resetTaskFilters(view);
			// }, 0);
		},
	};
}

// Apply the current task filters
function applyTaskFilters(view: EditorView, plugin: TaskProgressBarPlugin) {
	// Get current active filters from state
	const activeFilters = getActiveFiltersForView(view);

	// Find tasks in the document
	const tasks = findAllTasks(view, plugin.settings.taskStatuses);

	// Build a map of matching tasks for quick lookup
	const matchingTaskIds = new Set<number>();

	// Calculate new hidden task ranges
	let hiddenTaskRanges: Array<{ from: number; to: number }> = [];

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

	// Update hidden ranges in the state
	view.dispatch({
		effects: updateHiddenTaskRanges.of(hiddenTaskRanges),
	});

	// Apply decorations to hide filtered tasks
	applyHiddenTaskDecorations(view, hiddenTaskRanges);
}

// Reset all task filters
function resetTaskFilters(view: EditorView) {
	// Reset active filters to defaults in state
	view.dispatch({
		effects: [
			updateActiveFilters.of({ ...DEFAULT_FILTER_OPTIONS }),
			updateHiddenTaskRanges.of([]),
		],
	});

	// Apply decorations to hide filtered tasks
	applyHiddenTaskDecorations(view, []);
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

/**
 * Determines if a task should be hidden based on filter criteria
 * @param task The task to evaluate
 * @param filters The filter options to apply
 * @returns True if the task should be hidden, false otherwise
 */
function shouldHideTask(task: Task, filters: TaskFilterOptions): boolean {
	// First check if the task matches basic filter criteria
	if (matchesBasicFilters(task, filters)) {
		return !shouldShowDueToRelationships(task, filters);
	}

	// Check against advanced filter if enabled
	if (filters.advancedFilterQuery.trim() !== "") {
		const matchesAdvanced = matchesAdvancedFilter(task, filters);
		if (matchesAdvanced) {
			return !shouldShowDueToRelationships(task, filters);
		}
	}

	return false;
}

/**
 * Checks if a task matches the basic status filters
 */
function matchesBasicFilters(task: Task, filters: TaskFilterOptions): boolean {
	return (
		(!filters.includeCompleted && task.status === "completed") ||
		(!filters.includeInProgress && task.status === "inProgress") ||
		(!filters.includeAbandoned && task.status === "abandoned") ||
		(!filters.includeNotStarted && task.status === "notStarted") ||
		(!filters.includePlanned && task.status === "planned")
	);
}

/**
 * Evaluates if a task matches the advanced filter query
 */
function matchesAdvancedFilter(
	task: Task,
	filters: TaskFilterOptions
): boolean {
	try {
		const parseResult = parseAdvancedFilterQuery(
			filters.advancedFilterQuery
		);
		const result = evaluateFilterNode(parseResult, task);
		return filters.filterOutTasks ? result : !result;
	} catch (error) {
		console.error("Error evaluating advanced filter:", error);
		return false;
	}
}

/**
 * Determines if a task should be shown due to its relationships
 * despite matching filter criteria
 */
function shouldShowDueToRelationships(
	task: Task,
	filters: TaskFilterOptions
): boolean {
	// Check parent relationship
	if (filters.includeParentTasks && task.childTasks.length > 0) {
		if (hasMatchingDescendant(task, filters)) {
			return true;
		}
	}

	// Check child relationship
	if (filters.includeChildTasks && task.parentTask) {
		const tempFilters = createRelationshipFreeFilters(filters);
		if (!shouldHideTask(task.parentTask, tempFilters)) {
			return true;
		}
	}

	// Check sibling relationship
	if (filters.includeSiblingTasks && task.parentTask) {
		const tempFilters = createRelationshipFreeFilters(filters);
		for (const sibling of task.parentTask.childTasks) {
			if (sibling !== task && !shouldHideTask(sibling, tempFilters)) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Creates a copy of filters with relationship settings disabled
 * to prevent recursion issues
 */
function createRelationshipFreeFilters(
	filters: TaskFilterOptions
): TaskFilterOptions {
	return {
		...filters,
		includeParentTasks: false,
		includeChildTasks: false,
		includeSiblingTasks: false,
	};
}

/**
 * Checks if a task has any descendant that matches the filter criteria
 * @param task The parent task to check
 * @param filters The filter options to apply
 * @returns True if any descendant matches the filter
 */
function hasMatchingDescendant(
	task: Task,
	filters: TaskFilterOptions
): boolean {
	// Check each child task
	for (const child of task.childTasks) {
		const tempFilters = createRelationshipFreeFilters(filters);

		// Check if this child would be visible on its own
		if (
			!matchesBasicFilters(child, tempFilters) &&
			!(
				tempFilters.advancedFilterQuery.trim() !== "" &&
				matchesAdvancedFilter(child, tempFilters)
			)
		) {
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
function applyHiddenTaskDecorations(
	view: EditorView,
	ranges: Array<{ from: number; to: number }> = []
) {
	// Create decorations for hidden tasks
	const decorations = ranges.map((range) => {
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
		activeFiltersState,
		hiddenTaskRangesState,
		actionButtonState,
		filterTasksField,
		taskFilterOptions.of(DEFAULT_FILTER_OPTIONS),
		pluginFacet.of(plugin),
	];
}

/**
 * Gets the active filter options for a specific editor view
 * @param view The editor view to get active filters for
 * @returns The active filter options for the view
 */
export function getActiveFiltersForView(view: EditorView): TaskFilterOptions {
	if (view.state.field(activeFiltersState, false)) {
		return view.state.field(activeFiltersState);
	}
	return { ...DEFAULT_FILTER_OPTIONS };
}

/**
 * Gets the hidden task ranges for a specific editor view
 * @param view The editor view to get hidden ranges for
 * @returns The array of hidden task ranges
 */
export function getHiddenTaskRangesForView(
	view: EditorView
): Array<{ from: number; to: number }> {
	if (view.state.field(hiddenTaskRangesState, false)) {
		return view.state.field(hiddenTaskRangesState);
	}
	return [];
}
