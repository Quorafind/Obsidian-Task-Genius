import {
	App,
	DropdownComponent,
	ItemView,
	Keymap,
	MarkdownFileInfo,
	MarkdownView,
	Menu,
	Notice,
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
import TaskProgressBarPlugin from "../../index";
import {
	parseAdvancedFilterQuery,
	evaluateFilterNode,
	parsePriorityFilterValue,
} from "../../utils/task/filter-compatibility";
import { t } from "../../translations/helper";
import { Task as TaskIndexTask } from "../../types/task";
import "../../styles/task-filter.css";

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
				if (
					view &&
					editor &&
					(view as unknown as MarkdownFileInfo)?.file
				) {
					// @ts-ignore
					if (view.filterAction) {
						return true;
					}
					const plugin = tr.state.facet(pluginFacet);
					// Add preset menu action button to the markdown view
					const filterAction = view?.addAction(
						"filter",
						t("Filter Tasks"),
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
									item.setTitle(t("Reset")).onClick(() => {
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
										? t("Hide filter panel")
										: t("Show filter panel")
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
					plugin.register(() => {
						filterAction.detach();
						// @ts-ignore
						view.filterAction = null;
					});

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

	// Global filter mode - true to show matching tasks, false to hide matching tasks
	filterMode: "INCLUDE" | "EXCLUDE";
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

	filterMode: "INCLUDE",
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

// Ensure backward compatibility for older preset configurations that might use filterOutTasks
export function migrateOldFilterOptions(options: any): TaskFilterOptions {
	// Create a new object with default options
	const migrated = { ...DEFAULT_FILTER_OPTIONS };

	// Copy all valid properties from the old options
	Object.keys(DEFAULT_FILTER_OPTIONS).forEach((key) => {
		if (key in options && options[key] !== undefined) {
			(migrated as any)[key] = options[key];
		}
	});

	// Handle filterOutTasks to filterMode migration if needed
	if ("filterOutTasks" in options && options.filterMode === undefined) {
		migrated.filterMode = options.filterOutTasks ? "EXCLUDE" : "INCLUDE";
	}

	return migrated;
}

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

// Helper function to map local Task to the format expected by evaluateFilterNode
// Only includes fields actually used by evaluateFilterNode in filterUtils.ts
function mapTaskForFiltering(task: Task): TaskIndexTask {
	let priorityValue: number | undefined = undefined;
	if (task.priority) {
		const parsedPriority = parsePriorityFilterValue(task.priority);
		if (parsedPriority !== null) {
			priorityValue = parsedPriority;
		}
	}

	let dueDateTimestamp: number | undefined = undefined;
	if (task.date) {
		// Try parsing various common formats, strict parsing
		const parsedDate = moment(
			task.date,
			[moment.ISO_8601, "YYYY-MM-DD", "DD.MM.YYYY", "MM/DD/YYYY"],
			true
		);
		if (parsedDate.isValid()) {
			dueDateTimestamp = parsedDate.valueOf(); // Get timestamp in ms
		} else {
			// Optional: Log parsing errors if needed
			// console.warn(`Could not parse date: ${task.date} for task: ${task.text}`);
		}
	}

	return {
		id: `${task.from}-${task.to}`,
		content: task.text,
		filePath: "",
		line: 0,
		completed: task.status === "completed",
		status: task.status,
		originalMarkdown: task.text,
		metadata: {
			tags: task.tags,
			priority: priorityValue,
			dueDate: dueDateTimestamp,
			children: [],
		},
	} as TaskIndexTask;
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
		text: t("Filter Tasks"),
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
			.setName(t("Preset filters"))
			.setDesc(t("Select a saved filter preset to apply"))
			.addDropdown((dropdown) => {
				// Add an empty option
				dropdown.addOption("", t("Select a preset..."));
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
		.setName(t("Query"))
		.setDesc(
			t(
				"Use boolean operations: AND, OR, NOT. Example: 'text content AND #tag1 AND DATE:<2022-01-02 NOT PRIORITY:>=#B' - Supports >, <, =, >=, <=, != for PRIORITY and DATE."
			)
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
						// Use Ctrl+Enter to switch to EXCLUDE mode
						activeFilters.filterMode = "EXCLUDE";
						// Update state with new active filters
						view.dispatch({
							effects: updateActiveFilters.of({
								...activeFilters,
							}),
						});
						debounceFilter(view, plugin);
					} else {
						// Regular Enter uses INCLUDE mode
						activeFilters.filterMode = "INCLUDE";
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

	// Add Filter Mode selector
	const filterModeSection = filterOptionsDiv.createEl("div", {
		cls: "task-filter-section",
	});

	let filterModeDropdown: DropdownComponent | null = null;

	new Setting(filterModeSection)
		.setName(t("Filter Mode"))
		.setDesc(
			t(
				"Choose whether to include or exclude tasks that match the filters"
			)
		)
		.addDropdown((dropdown) => {
			filterModeDropdown = dropdown;
			dropdown
				.addOption("INCLUDE", t("Show matching tasks"))
				.addOption("EXCLUDE", t("Hide matching tasks"))
				.setValue(getFilterOption(options, "filterMode"))
				.onChange((value: "INCLUDE" | "EXCLUDE") => {
					activeFilters.filterMode = value;
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

	new Setting(statusSection).setName(t("Checkbox Status")).setHeading();

	const statuses = [
		{ id: "Completed", label: t("Completed") },
		{ id: "InProgress", label: t("In Progress") },
		{ id: "Abandoned", label: t("Abandoned") },
		{ id: "NotStarted", label: t("Not Started") },
		{ id: "Planned", label: t("Planned") },
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

	new Setting(relatedSection)
		.setName(t("Include Related Tasks"))
		.setHeading();

	// Parent/Child task inclusion options
	const relatedOptions = [
		{ id: "ParentTasks", label: t("Parent Tasks") },
		{ id: "ChildTasks", label: t("Child Tasks") },
		{ id: "SiblingTasks", label: t("Sibling Tasks") },
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
			button.setButtonText(t("Apply")).onClick(() => {
				applyTaskFilters(view, plugin);
			});
		})
		.addButton((button) => {
			button.setCta();
			button.setButtonText(t("Save")).onClick(() => {
				// Check if there are any changes to save
				if (checkFilterChanges(view, plugin)) {
					// Get current active filters from state
					const currentActiveFilters = getActiveFiltersForView(view);

					const newPreset = {
						id:
							Date.now().toString() +
							Math.random().toString(36).substr(2, 9),
						name: t("New Preset"),
						options: { ...currentActiveFilters },
					};

					// Add to settings
					plugin.settings.taskFilter.presetTaskFilters.push(
						newPreset
					);
					plugin.saveSettings();

					new Notice(t("Preset saved"));
				} else {
					new Notice(t("No changes to save"));
				}
			});
		})
		.addButton((button) => {
			button.buttonEl.toggleClass("mod-destructive", true);
			button.setButtonText(t("Reset")).onClick(() => {
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
			button.setButtonText(t("Close")).onClick(() => {
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

		// Update filter mode dropdown if it exists
		if (filterModeDropdown) {
			filterModeDropdown.setValue(activeFilters.filterMode);
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
	// Set for tasks that directly match primary filters
	const directMatchTaskIds = new Set<number>();

	// Calculate new hidden task ranges
	let hiddenTaskRanges: Array<{ from: number; to: number }> = [];

	// First identify tasks that pass status filters (mandatory)
	const statusFilteredTasks: Array<{ task: Task; index: number }> = [];
	tasks.forEach((task, index) => {
		// Check if task passes status filters
		const passesStatusFilter =
			(activeFilters.includeCompleted && task.status === "completed") ||
			(activeFilters.includeInProgress && task.status === "inProgress") ||
			(activeFilters.includeAbandoned && task.status === "abandoned") ||
			(activeFilters.includeNotStarted && task.status === "notStarted") ||
			(activeFilters.includePlanned && task.status === "planned");

		// Only process tasks that match status filters
		if (passesStatusFilter) {
			statusFilteredTasks.push({ task, index });
		}
	});

	// Then apply query filters to status-filtered tasks
	for (const { task, index } of statusFilteredTasks) {
		// Check advanced query if present
		let matchesQuery = true;
		if (activeFilters.advancedFilterQuery.trim() !== "") {
			try {
				const parseResult = parseAdvancedFilterQuery(
					activeFilters.advancedFilterQuery
				);
				const result = evaluateFilterNode(
					parseResult,
					mapTaskForFiltering(task) as unknown as TaskIndexTask
				);
				// Use the direct result, filter mode will be handled later
				matchesQuery = result;
			} catch (error) {
				console.error("Error evaluating advanced filter:", error);
			}
		}

		// If the task passes both status and query filters
		if (matchesQuery) {
			directMatchTaskIds.add(index);
			matchingTaskIds.add(index);
		}
	}

	// Now identify parent/child/sibling relationships only for tasks that match primary filters
	if (
		activeFilters.includeParentTasks ||
		activeFilters.includeChildTasks ||
		activeFilters.includeSiblingTasks
	) {
		for (let i = 0; i < tasks.length; i++) {
			if (directMatchTaskIds.has(i)) {
				const task = tasks[i];

				// Include parents if enabled AND they match status filters
				if (activeFilters.includeParentTasks) {
					let parent = task.parentTask;
					while (parent) {
						// Only include parent if it matches status filters
						if (
							(activeFilters.includeCompleted &&
								parent.status === "completed") ||
							(activeFilters.includeInProgress &&
								parent.status === "inProgress") ||
							(activeFilters.includeAbandoned &&
								parent.status === "abandoned") ||
							(activeFilters.includeNotStarted &&
								parent.status === "notStarted") ||
							(activeFilters.includePlanned &&
								parent.status === "planned")
						) {
							const parentIndex = tasks.indexOf(parent);
							if (parentIndex !== -1) {
								matchingTaskIds.add(parentIndex);
							}
						}
						parent = parent.parentTask;
					}
				}

				// Include children if enabled AND they match status filters
				if (activeFilters.includeChildTasks) {
					const addChildren = (parentTask: Task) => {
						for (const child of parentTask.childTasks) {
							// Only include child if it matches status filters
							if (
								(activeFilters.includeCompleted &&
									child.status === "completed") ||
								(activeFilters.includeInProgress &&
									child.status === "inProgress") ||
								(activeFilters.includeAbandoned &&
									child.status === "abandoned") ||
								(activeFilters.includeNotStarted &&
									child.status === "notStarted") ||
								(activeFilters.includePlanned &&
									child.status === "planned")
							) {
								const childIndex = tasks.indexOf(child);
								if (childIndex !== -1) {
									matchingTaskIds.add(childIndex);
									// Recursively add grandchildren
									addChildren(child);
								}
							}
						}
					};

					addChildren(task);
				}

				// Include siblings if enabled AND they match status filters
				if (activeFilters.includeSiblingTasks && task.parentTask) {
					for (const sibling of task.parentTask.childTasks) {
						if (sibling !== task) {
							// Only include sibling if it matches status filters
							if (
								(activeFilters.includeCompleted &&
									sibling.status === "completed") ||
								(activeFilters.includeInProgress &&
									sibling.status === "inProgress") ||
								(activeFilters.includeAbandoned &&
									sibling.status === "abandoned") ||
								(activeFilters.includeNotStarted &&
									sibling.status === "notStarted") ||
								(activeFilters.includePlanned &&
									sibling.status === "planned")
							) {
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
	}

	// Determine which tasks to hide based on the filter mode
	let tasksToHide: Task[];
	if (activeFilters.filterMode === "INCLUDE") {
		// In INCLUDE mode, hide tasks that don't match
		tasksToHide = tasks.filter(
			(task, index) => !matchingTaskIds.has(index)
		);
	} else {
		// In EXCLUDE mode, hide tasks that do match
		tasksToHide = tasks.filter((task, index) => matchingTaskIds.has(index));
	}

	// Store the ranges to hide
	hiddenTaskRanges = tasksToHide.map((task) => ({
		from: task.from,
		to: task.to,
	}));

	// Update hidden ranges in the state
	view.dispatch({
		effects: updateHiddenTaskRanges.of(hiddenTaskRanges),
	});

	view.state
		.field(editorInfoField)
		// @ts-ignore
		?.filterAction?.toggleClass(
			"task-filter-active",
			checkFilterChanges(view, plugin)
		);

	// Apply decorations to hide filtered tasks
	applyHiddenTaskDecorations(view, hiddenTaskRanges);
}

/**
 * Determines if a task should be hidden based on filter criteria
 * @param task The task to evaluate
 * @param filters The filter options to apply
 * @returns True if the task should be hidden, false otherwise
 */
function shouldHideTask(task: Task, filters: TaskFilterOptions): boolean {
	// First check status filters (these are non-negotiable)
	const passesStatusFilter =
		(filters.includeCompleted && task.status === "completed") ||
		(filters.includeInProgress && task.status === "inProgress") ||
		(filters.includeAbandoned && task.status === "abandoned") ||
		(filters.includeNotStarted && task.status === "notStarted") ||
		(filters.includePlanned && task.status === "planned");

	// If it doesn't pass status filter, always hide it
	if (!passesStatusFilter) {
		return true;
	}

	// Then check query filter if present
	if (filters.advancedFilterQuery.trim() !== "") {
		try {
			const parseResult = parseAdvancedFilterQuery(
				filters.advancedFilterQuery
			);
			const result = evaluateFilterNode(
				parseResult,
				mapTaskForFiltering(task)
			);
			// Determine visibility based on filter mode
			const shouldShow =
				(filters.filterMode === "INCLUDE" && result) ||
				(filters.filterMode === "EXCLUDE" && !result);

			// If it doesn't meet display criteria, check if it should be shown due to relationships
			if (!shouldShow) {
				return !shouldShowDueToRelationships(task, filters);
			}
		} catch (error) {
			console.error("Error evaluating advanced filter:", error);
		}
	}

	return false;
}

/**
 * Determines if a task should be shown due to its relationships
 * despite failing query filter
 */
function shouldShowDueToRelationships(
	task: Task,
	filters: TaskFilterOptions
): boolean {
	// Only consider relationships for tasks that pass status filters
	// Parent relationship
	if (filters.includeParentTasks && task.childTasks.length > 0) {
		if (hasMatchingDescendant(task, filters)) {
			return true;
		}
	}

	// Child relationship
	if (filters.includeChildTasks && task.parentTask) {
		// First check if parent passes status filter
		const parentPassesStatusFilter =
			(filters.includeCompleted &&
				task.parentTask.status === "completed") ||
			(filters.includeInProgress &&
				task.parentTask.status === "inProgress") ||
			(filters.includeAbandoned &&
				task.parentTask.status === "abandoned") ||
			(filters.includeNotStarted &&
				task.parentTask.status === "notStarted") ||
			(filters.includePlanned && task.parentTask.status === "planned");

		if (parentPassesStatusFilter) {
			// Then check query filter (if present)
			let parentPassesQueryFilter = true;
			if (filters.advancedFilterQuery.trim() !== "") {
				try {
					const parseResult = parseAdvancedFilterQuery(
						filters.advancedFilterQuery
					);
					const result = evaluateFilterNode(
						parseResult,
						mapTaskForFiltering(task.parentTask)
					);
					// Determine visibility based on filter mode
					parentPassesQueryFilter =
						(filters.filterMode === "INCLUDE" && result) ||
						(filters.filterMode === "EXCLUDE" && !result);
				} catch (error) {
					console.error("Error evaluating advanced filter:", error);
				}
			}

			if (parentPassesQueryFilter) {
				return true;
			}
		}
	}

	// Sibling relationship
	if (filters.includeSiblingTasks && task.parentTask) {
		for (const sibling of task.parentTask.childTasks) {
			if (sibling === task) continue; // Skip self

			// First check if sibling passes status filter
			const siblingPassesStatusFilter =
				(filters.includeCompleted && sibling.status === "completed") ||
				(filters.includeInProgress &&
					sibling.status === "inProgress") ||
				(filters.includeAbandoned && sibling.status === "abandoned") ||
				(filters.includeNotStarted &&
					sibling.status === "notStarted") ||
				(filters.includePlanned && sibling.status === "planned");

			if (siblingPassesStatusFilter) {
				// Then check query filter (if present)
				let siblingPassesQueryFilter = true;
				if (filters.advancedFilterQuery.trim() !== "") {
					try {
						const parseResult = parseAdvancedFilterQuery(
							filters.advancedFilterQuery
						);
						const result = evaluateFilterNode(
							parseResult,
							mapTaskForFiltering(sibling)
						);
						// Determine visibility based on filter mode
						siblingPassesQueryFilter =
							(filters.filterMode === "INCLUDE" && result) ||
							(filters.filterMode === "EXCLUDE" && !result);
					} catch (error) {
						console.error(
							"Error evaluating advanced filter:",
							error
						);
					}
				}

				if (siblingPassesQueryFilter) {
					return true;
				}
			}
		}
	}

	return false;
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
		// First check if child passes status filter (mandatory)
		const childPassesStatusFilter =
			(filters.includeCompleted && child.status === "completed") ||
			(filters.includeInProgress && child.status === "inProgress") ||
			(filters.includeAbandoned && child.status === "abandoned") ||
			(filters.includeNotStarted && child.status === "notStarted") ||
			(filters.includePlanned && child.status === "planned");

		if (childPassesStatusFilter) {
			// Then check query filter if present
			let childPassesQueryFilter = true;
			if (filters.advancedFilterQuery.trim() !== "") {
				try {
					const parseResult = parseAdvancedFilterQuery(
						filters.advancedFilterQuery
					);
					const result = evaluateFilterNode(
						parseResult,
						mapTaskForFiltering(child)
					);
					// Determine visibility based on filter mode
					childPassesQueryFilter =
						(filters.filterMode === "INCLUDE" && result) ||
						(filters.filterMode === "EXCLUDE" && !result);
				} catch (error) {
					console.error("Error evaluating advanced filter:", error);
				}
			}

			if (childPassesQueryFilter) {
				return true;
			}
		}

		// Recursively check grandchildren
		if (hasMatchingDescendant(child, filters)) {
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
		const activeFilters = view.state.field(activeFiltersState);
		// Ensure the active filters are properly migrated
		return migrateOldFilterOptions(activeFilters);
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

// Reset all task filters
function resetTaskFilters(view: EditorView) {
	// Reset active filters to defaults in state
	view.dispatch({
		effects: [
			updateActiveFilters.of({ ...DEFAULT_FILTER_OPTIONS }),
			updateHiddenTaskRanges.of([]),
		],
	});

	view.state
		.field(editorInfoField)
		// @ts-ignore
		?.filterAction?.toggleClass(
			"task-filter-active",
			false // Always false on reset
		);

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
