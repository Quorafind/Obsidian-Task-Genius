import { App, PluginSettingTab, Setting, Modal } from "obsidian";
import TaskProgressBarPlugin from ".";
import { allStatusCollections } from "./task-status";
import { TaskFilterOptions } from "./editor-ext/filterTasks";

export interface TaskProgressBarSettings {
	showProgressBar: boolean;
	addTaskProgressBarToHeading: boolean;
	addProgressBarToNonTaskBullet: boolean;
	enableHeadingProgressBar: boolean;
	addNumberToProgressBar: boolean;
	showPercentage: boolean;

	progressRanges: Array<{
		min: number;
		max: number;
		text: string;
	}>;

	autoCompleteParent: boolean;
	supportHoverToShowProgressInfo: boolean;
	markParentInProgressWhenPartiallyComplete: boolean;
	countSubLevel: boolean;
	hideProgressBarBasedOnConditions: boolean;
	hideProgressBarTags: string;
	hideProgressBarFolders: string;
	hideProgressBarMetadata: string;

	// Task state settings
	taskStatuses: {
		completed: string;
		inProgress: string;
		abandoned: string;
		notStarted: string;
		planned: string;
	};

	countOtherStatusesAs: string;

	// Control which tasks to count
	excludeTaskMarks: string;
	useOnlyCountMarks: boolean;
	onlyCountTaskMarks: string;

	// Progress range text customization
	customizeProgressRanges: boolean;

	// Task status switcher settings
	enableTaskStatusSwitcher: boolean;
	enableCustomTaskMarks: boolean;
	taskStatusCycle: string[];
	taskStatusMarks: Record<string, string>;
	excludeMarksFromCycle: string[];

	// Priority picker settings
	enablePriorityPicker: boolean;
	enablePriorityKeyboardShortcuts: boolean;

	// Date picker settings
	enableDatePicker: boolean;
	dateMark: string;
	// Cycle complete status settings
	enableCycleCompleteStatus: boolean;
	alwaysCycleNewTasks: boolean;

	// Completed task mover settings
	completedTaskMover: {
		enableCompletedTaskMover: boolean;
		taskMarkerType: "version" | "date" | "custom";
		versionMarker: string;
		dateMarker: string;
		customMarker: string;
		completeAllMovedTasks: boolean;
		treatAbandonedAsCompleted: boolean;
		withCurrentFileLink: boolean;
	};

	// Quick capture settings
	quickCapture: {
		enableQuickCapture: boolean;
		targetFile: string;
		placeholder: string;
		appendToFile: "append" | "prepend" | "replace";
	};

	// Task filter settings
	taskFilter: {
		enableTaskFilter: boolean;
		keyboardShortcut: string;
		presetTaskFilters: Array<{
			id: string;
			name: string;
			options: TaskFilterOptions;
		}>;
	};
}

export const DEFAULT_SETTINGS: TaskProgressBarSettings = {
	showProgressBar: false,
	addTaskProgressBarToHeading: false,
	addProgressBarToNonTaskBullet: false,
	enableHeadingProgressBar: false,
	addNumberToProgressBar: false,
	autoCompleteParent: false,
	supportHoverToShowProgressInfo: false,
	markParentInProgressWhenPartiallyComplete: false,
	showPercentage: false,
	countSubLevel: true,
	hideProgressBarBasedOnConditions: false,
	hideProgressBarTags: "no-progress-bar",
	hideProgressBarFolders: "",
	hideProgressBarMetadata: "hide-progress-bar",

	// Default task statuses
	taskStatuses: {
		completed: "x|X",
		inProgress: ">|/",
		abandoned: "-",
		notStarted: " ",
		planned: "?",
	},

	countOtherStatusesAs: "notStarted",

	// Control which tasks to count
	excludeTaskMarks: "",
	onlyCountTaskMarks: "x|X",
	useOnlyCountMarks: false,

	// Progress range text customization
	customizeProgressRanges: false,
	progressRanges: [
		{ min: 0, max: 20, text: "Just started {{PROGRESS}}%" },
		{ min: 20, max: 40, text: "Making progress {{PROGRESS}}%" },
		{ min: 40, max: 60, text: "Half way {{PROGRESS}}%" },
		{ min: 60, max: 80, text: "Good progress {{PROGRESS}}%" },
		{ min: 80, max: 100, text: "Almost there {{PROGRESS}}%" },
	],

	// Task status switcher settings
	enableTaskStatusSwitcher: false,
	enableCustomTaskMarks: false,
	taskStatusCycle: ["TODO", "DOING", "IN-PROGRESS", "DONE"],
	taskStatusMarks: {
		TODO: " ",
		DOING: "-",
		"IN-PROGRESS": ">",
		DONE: "x",
	},
	excludeMarksFromCycle: [],

	// Priority picker settings
	enablePriorityPicker: false,
	enablePriorityKeyboardShortcuts: false,

	// Date picker settings
	enableDatePicker: false,
	dateMark: "📅,📆,⏳,🛫",
	// Cycle complete status settings
	enableCycleCompleteStatus: true,
	alwaysCycleNewTasks: false,

	// Completed task mover settings
	completedTaskMover: {
		enableCompletedTaskMover: false,
		taskMarkerType: "version",
		versionMarker: "version 1.0",
		dateMarker: "archived on {{date}}",
		customMarker: "moved {{DATE:YYYY-MM-DD HH:mm}}",
		completeAllMovedTasks: false,
		treatAbandonedAsCompleted: false,
		withCurrentFileLink: false,
	},

	// Quick capture settings
	quickCapture: {
		enableQuickCapture: false,
		targetFile: "Quick Capture.md",
		placeholder: "Capture thoughts, tasks, or ideas...",
		appendToFile: "append",
	},

	// Task filter settings
	taskFilter: {
		enableTaskFilter: true,
		keyboardShortcut: "Alt-f",
		presetTaskFilters: [],
	},
};

export class TaskProgressBarSettingTab extends PluginSettingTab {
	plugin: TaskProgressBarPlugin;
	private applyDebounceTimer: number = 0;

	constructor(app: App, plugin: TaskProgressBarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	applySettingsUpdate() {
		clearTimeout(this.applyDebounceTimer);
		const plugin = this.plugin;
		this.applyDebounceTimer = window.setTimeout(() => {
			plugin.saveSettings();
		}, 100);
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Task Genius")
			.setDesc(
				"Comprehensive task management plugin for Obsidian with progress bars, task status cycling, and advanced task tracking features."
			)
			.setHeading();

		new Setting(containerEl)
			.setName("Show progress bar")
			.setDesc("Toggle this to show the progress bar.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showProgressBar)
					.onChange(async (value) => {
						this.plugin.settings.showProgressBar = value;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("Support hover to show progress info")
			.setDesc(
				"Toggle this to allow this plugin to show progress info when hovering over the progress bar."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.supportHoverToShowProgressInfo
					)
					.onChange(async (value) => {
						this.plugin.settings.supportHoverToShowProgressInfo =
							value;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("Add progress bar to non-task bullet")
			.setDesc(
				"Toggle this to allow adding progress bars to regular list items (non-task bullets)."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.addProgressBarToNonTaskBullet
					)
					.onChange(async (value) => {
						this.plugin.settings.addProgressBarToNonTaskBullet =
							value;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("Add progress bar to Heading")
			.setDesc(
				"Toggle this to allow this plugin to add progress bar for Task below the headings."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.addTaskProgressBarToHeading)
					.onChange(async (value) => {
						this.plugin.settings.addTaskProgressBarToHeading =
							value;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("Enable heading progress bars")
			.setDesc(
				"Add progress bars to headings to show progress of all tasks under that heading."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableHeadingProgressBar)
					.onChange(async (value) => {
						this.plugin.settings.enableHeadingProgressBar = value;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("Auto complete parent task")
			.setDesc(
				"Toggle this to allow this plugin to auto complete parent task when all child tasks are completed."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoCompleteParent)
					.onChange(async (value) => {
						this.plugin.settings.autoCompleteParent = value;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("Mark parent as 'In Progress' when partially complete")
			.setDesc(
				"When some but not all child tasks are completed, mark the parent task as 'In Progress'. Only works when 'Auto complete parent' is enabled."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings
							.markParentInProgressWhenPartiallyComplete
					)
					.onChange(async (value) => {
						this.plugin.settings.markParentInProgressWhenPartiallyComplete =
							value;
						this.applySettingsUpdate();
					})
			);

		this.showNumberToProgressbar();

		new Setting(containerEl)
			.setName("Count sub children level of current Task")
			.setDesc("Toggle this to allow this plugin to count sub tasks.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.countSubLevel)
					.onChange(async (value) => {
						this.plugin.settings.countSubLevel = value;
						this.applySettingsUpdate();
					})
			);

		// Task Status Settings
		new Setting(containerEl)
			.setName("Task Status Settings")
			.setDesc(
				"Select a predefined task status collection or customize your own"
			)
			.setHeading()
			.addDropdown((dropdown) => {
				dropdown.addOption("custom", "Custom");
				for (const statusCollection of allStatusCollections) {
					dropdown.addOption(statusCollection, statusCollection);
				}

				// Set default value to custom
				dropdown.setValue("custom");

				dropdown.onChange(async (value) => {
					if (value === "custom") {
						return;
					}

					// Confirm before applying the theme
					const modal = new Modal(this.app);
					modal.titleEl.setText(`Apply ${value} Theme?`);

					const content = modal.contentEl.createDiv();
					content.setText(
						`This will override your current task status settings with the ${value} theme. Do you want to continue?`
					);

					const buttonContainer = modal.contentEl.createDiv();
					buttonContainer.addClass("modal-button-container");

					const cancelButton = buttonContainer.createEl("button");
					cancelButton.setText("Cancel");
					cancelButton.addEventListener("click", () => {
						dropdown.setValue("custom");
						modal.close();
					});

					const confirmButton = buttonContainer.createEl("button");
					confirmButton.setText("Apply Theme");
					confirmButton.addClass("mod-cta");
					confirmButton.addEventListener("click", async () => {
						modal.close();

						// Apply the selected theme's task statuses
						try {
							// Import the function dynamically based on the selected theme
							const functionName =
								value.toLowerCase() + "SupportedStatuses";
							const statusesModule = await import(
								"./task-status"
							);

							// Use type assertion for the dynamic function access
							const getStatuses = (statusesModule as any)[
								functionName
							];

							if (typeof getStatuses === "function") {
								const statuses = getStatuses();

								// Create a map to collect all statuses of each type
								const statusMap: Record<string, string[]> = {
									completed: [],
									inProgress: [],
									abandoned: [],
									notStarted: [],
									planned: [],
								};

								// Group statuses by their type
								for (const [symbol, _, type] of statuses) {
									if (type in statusMap) {
										statusMap[
											type as keyof typeof statusMap
										].push(symbol);
									}
								}

								// Update the settings with the collected statuses
								for (const type of Object.keys(
									this.plugin.settings.taskStatuses
								)) {
									if (
										statusMap[type] &&
										statusMap[type].length > 0
									) {
										(
											this.plugin.settings
												.taskStatuses as Record<
												string,
												string
											>
										)[type] = statusMap[type].join("|");
									}
								}

								// Save settings and refresh the display
								this.applySettingsUpdate();
								this.display();
							}
						} catch (error) {
							console.error(
								"Failed to apply task status theme:",
								error
							);
						}
					});

					modal.open();
				});
			});

		new Setting(containerEl)
			.setName("Completed task markers")
			.setDesc(
				'Characters in square brackets that represent completed tasks. Example: "x|X"'
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.taskStatuses.completed)
					.setValue(this.plugin.settings.taskStatuses.completed)
					.onChange(async (value) => {
						this.plugin.settings.taskStatuses.completed =
							value || DEFAULT_SETTINGS.taskStatuses.completed;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("Planned task markers")
			.setDesc(
				'Characters in square brackets that represent planned tasks. Example: "?"'
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.taskStatuses.planned)
					.setValue(this.plugin.settings.taskStatuses.planned)
					.onChange(async (value) => {
						this.plugin.settings.taskStatuses.planned =
							value || DEFAULT_SETTINGS.taskStatuses.planned;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("In progress task markers")
			.setDesc(
				'Characters in square brackets that represent tasks in progress. Example: ">|/"'
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.taskStatuses.inProgress)
					.setValue(this.plugin.settings.taskStatuses.inProgress)
					.onChange(async (value) => {
						this.plugin.settings.taskStatuses.inProgress =
							value || DEFAULT_SETTINGS.taskStatuses.inProgress;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("Abandoned task markers")
			.setDesc(
				'Characters in square brackets that represent abandoned tasks. Example: "-"'
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.taskStatuses.abandoned)
					.setValue(this.plugin.settings.taskStatuses.abandoned)
					.onChange(async (value) => {
						this.plugin.settings.taskStatuses.abandoned =
							value || DEFAULT_SETTINGS.taskStatuses.abandoned;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("Not started task markers")
			.setDesc(
				'Characters in square brackets that represent not started tasks. Default is space " "'
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.taskStatuses.notStarted)
					.setValue(this.plugin.settings.taskStatuses.notStarted)
					.onChange(async (value) => {
						this.plugin.settings.taskStatuses.notStarted =
							value || DEFAULT_SETTINGS.taskStatuses.notStarted;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("Count other statuses as")
			.setDesc(
				'Select the status to count other statuses as. Default is "Not Started".'
			)
			.addDropdown((dropdown) => {
				dropdown.addOption("notStarted", "Not Started");
				dropdown.addOption("abandoned", "Abandoned");
				dropdown.addOption("planned", "Planned");
				dropdown.addOption("completed", "Completed");
				dropdown.addOption("inProgress", "In Progress");
			});

		// Task Counting Settings
		new Setting(containerEl)
			.setName("Task Counting Settings")
			.setDesc("Toggle this to allow this plugin to count sub tasks.")
			.setHeading();

		new Setting(containerEl)
			.setName("Exclude specific task markers")
			.setDesc(
				'Specify task markers to exclude from counting. Example: "?|/"'
			)
			.addText((text) =>
				text
					.setPlaceholder("")
					.setValue(this.plugin.settings.excludeTaskMarks)
					.onChange(async (value) => {
						this.plugin.settings.excludeTaskMarks = value;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("Only count specific task markers")
			.setDesc("Toggle this to only count specific task markers")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useOnlyCountMarks)
					.onChange(async (value) => {
						this.plugin.settings.useOnlyCountMarks = value;
						this.applySettingsUpdate();

						setTimeout(() => {
							this.display();
						}, 200);
					})
			);

		if (this.plugin.settings.useOnlyCountMarks) {
			new Setting(containerEl)
				.setName("Specific task markers to count")
				.setDesc(
					'Specify which task markers to count. Example: "x|X|>"'
				)
				.addText((text) =>
					text
						.setPlaceholder(DEFAULT_SETTINGS.onlyCountTaskMarks)
						.setValue(this.plugin.settings.onlyCountTaskMarks)
						.onChange(async (value) => {
							if (value.length === 0) {
								this.plugin.settings.onlyCountTaskMarks =
									DEFAULT_SETTINGS.onlyCountTaskMarks;
							} else {
								this.plugin.settings.onlyCountTaskMarks = value;
							}
							this.applySettingsUpdate();
						})
				);
		}

		new Setting(containerEl)
			.setName("Conditional Progress Bar Display")
			.setHeading();

		new Setting(containerEl)
			.setName("Hide progress bars based on conditions")
			.setDesc(
				"Toggle this to enable hiding progress bars based on tags, folders, or metadata."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.hideProgressBarBasedOnConditions
					)
					.onChange(async (value) => {
						this.plugin.settings.hideProgressBarBasedOnConditions =
							value;
						this.applySettingsUpdate();

						setTimeout(() => {
							this.display();
						}, 200);
					})
			);

		if (this.plugin.settings.hideProgressBarBasedOnConditions) {
			new Setting(containerEl)
				.setName("Hide by tags")
				.setDesc(
					'Specify tags that will hide progress bars (comma-separated, without #). Example: "no-progress-bar,hide-progress"'
				)
				.addText((text) =>
					text
						.setPlaceholder(DEFAULT_SETTINGS.hideProgressBarTags)
						.setValue(this.plugin.settings.hideProgressBarTags)
						.onChange(async (value) => {
							this.plugin.settings.hideProgressBarTags = value;
							this.applySettingsUpdate();
						})
				);

			new Setting(containerEl)
				.setName("Hide by folders")
				.setDesc(
					'Specify folder paths that will hide progress bars (comma-separated). Example: "Daily Notes,Projects/Hidden"'
				)
				.addText((text) =>
					text
						.setPlaceholder("folder1,folder2/subfolder")
						.setValue(this.plugin.settings.hideProgressBarFolders)
						.onChange(async (value) => {
							this.plugin.settings.hideProgressBarFolders = value;
							this.applySettingsUpdate();
						})
				);

			new Setting(containerEl)
				.setName("Hide by metadata")
				.setDesc(
					'Specify frontmatter metadata that will hide progress bars. Example: "hide-progress-bar: true"'
				)
				.addText((text) =>
					text
						.setPlaceholder(
							DEFAULT_SETTINGS.hideProgressBarMetadata
						)
						.setValue(this.plugin.settings.hideProgressBarMetadata)
						.onChange(async (value) => {
							this.plugin.settings.hideProgressBarMetadata =
								value;
							this.applySettingsUpdate();
						})
				);
		}

		this.containerEl.createEl("h2", { text: "Task Status Switcher" });

		new Setting(containerEl)
			.setName("Enable task status switcher")
			.setDesc(
				"Enable/disable the ability to cycle through task states by clicking."
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enableTaskStatusSwitcher)
					.onChange(async (value) => {
						this.plugin.settings.enableTaskStatusSwitcher = value;
						this.applySettingsUpdate();
					});
			});

		new Setting(containerEl)
			.setName("Enable custom task marks")
			.setDesc(
				"Replace default checkboxes with styled text marks that follow your task status cycle when clicked."
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enableCustomTaskMarks)
					.onChange(async (value) => {
						this.plugin.settings.enableCustomTaskMarks = value;
						this.applySettingsUpdate();
					});
			});

		new Setting(containerEl)
			.setName("Enable cycle complete status")
			.setDesc(
				"Enable/disable the ability to automatically cycle through task states when pressing a mark."
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enableCycleCompleteStatus)
					.onChange(async (value) => {
						this.plugin.settings.enableCycleCompleteStatus = value;
						this.applySettingsUpdate();
					});
			});

		new Setting(containerEl)
			.setName("Always cycle new tasks")
			.setDesc(
				"When enabled, newly inserted tasks will immediately cycle to the next status. When disabled, newly inserted tasks with valid marks will keep their original mark."
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.alwaysCycleNewTasks)
					.onChange(async (value) => {
						this.plugin.settings.alwaysCycleNewTasks = value;
						this.applySettingsUpdate();
					});
			});

		new Setting(containerEl)
			.setName("Task Status Cycle and Marks")
			.setDesc(
				"Define task states and their corresponding marks. The order from top to bottom defines the cycling sequence."
			);

		// Create a container for the task states list
		const taskStatesContainer = containerEl.createDiv({
			cls: "task-states-container",
		});

		// Function to refresh the task states list
		const refreshTaskStatesList = () => {
			// Clear the container
			taskStatesContainer.empty();

			// Get current cycle and marks
			const cycle = this.plugin.settings.taskStatusCycle;
			const marks = this.plugin.settings.taskStatusMarks;

			// Initialize excludeMarksFromCycle if it doesn't exist
			if (!this.plugin.settings.excludeMarksFromCycle) {
				this.plugin.settings.excludeMarksFromCycle = [];
			}

			// Add each status in the cycle
			cycle.forEach((state, index) => {
				const stateRow = taskStatesContainer.createDiv({
					cls: "task-state-row",
				});

				// Create the setting
				const stateSetting = new Setting(stateRow)
					.setName(`Status #${index + 1}`)
					.addText((text) => {
						text.setValue(state)
							.setPlaceholder("Status name")
							.onChange((value) => {
								// Update the state name in both cycle and marks
								const oldState = cycle[index];
								cycle[index] = value;

								// If the old state had a mark, preserve it with the new name
								if (oldState in marks) {
									marks[value] = marks[oldState];
									delete marks[oldState];
								}

								this.applySettingsUpdate();
							});
					})
					.addText((text) => {
						text.setValue(marks[state] || " ")
							.setPlaceholder("Mark")
							.onChange((value) => {
								// Only use the first character
								const mark = value.trim().charAt(0) || " ";
								marks[state] = mark;
								this.applySettingsUpdate();
							});
						text.inputEl.maxLength = 1;
						text.inputEl.style.width = "40px";
					});

				// Add toggle for including in cycle
				stateSetting.addToggle((toggle) => {
					toggle
						.setTooltip("Include in cycle")
						.setValue(
							!this.plugin.settings.excludeMarksFromCycle.includes(
								state
							)
						)
						.onChange((value) => {
							if (!value) {
								// Add to exclude list if not already there
								if (
									!this.plugin.settings.excludeMarksFromCycle.includes(
										state
									)
								) {
									this.plugin.settings.excludeMarksFromCycle.push(
										state
									);
								}
							} else {
								// Remove from exclude list
								this.plugin.settings.excludeMarksFromCycle =
									this.plugin.settings.excludeMarksFromCycle.filter(
										(s) => s !== state
									);
							}
							this.applySettingsUpdate();
						});
				});

				// Add buttons for moving up/down and removing
				stateSetting.addExtraButton((button) => {
					button
						.setIcon("arrow-up")
						.setTooltip("Move up")
						.onClick(() => {
							if (index > 0) {
								// Swap with the previous item
								[cycle[index - 1], cycle[index]] = [
									cycle[index],
									cycle[index - 1],
								];
								this.applySettingsUpdate();
								refreshTaskStatesList();
							}
						});
					button.extraSettingsEl.style.marginRight = "0";
				});

				stateSetting.addExtraButton((button) => {
					button
						.setIcon("arrow-down")
						.setTooltip("Move down")
						.onClick(() => {
							if (index < cycle.length - 1) {
								// Swap with the next item
								[cycle[index], cycle[index + 1]] = [
									cycle[index + 1],
									cycle[index],
								];
								this.applySettingsUpdate();
								refreshTaskStatesList();
							}
						});
					button.extraSettingsEl.style.marginRight = "0";
				});

				stateSetting.addExtraButton((button) => {
					button
						.setIcon("trash")
						.setTooltip("Remove")
						.onClick(() => {
							// Remove from cycle
							cycle.splice(index, 1);
							// Don't remove from marks to preserve settings
							this.applySettingsUpdate();
							refreshTaskStatesList();
						});
					button.extraSettingsEl.style.marginRight = "0";
				});
			});

			// Add button to add new status
			const addButtonContainer = taskStatesContainer.createDiv();
			new Setting(addButtonContainer).addButton((button) => {
				button
					.setButtonText("Add Status")
					.setCta()
					.onClick(() => {
						// Add a new status to the cycle with a default mark
						const newStatus = `STATUS_${cycle.length + 1}`;
						cycle.push(newStatus);
						marks[newStatus] = " ";
						this.applySettingsUpdate();
						refreshTaskStatesList();
					});
			});
		};

		// Initial render of the task states list
		refreshTaskStatesList();

		this.addPriorityPickerSettings();
		this.addDatePickerSettings();
		this.addQuickCaptureSettings();

		// Add Completed Task Mover settings
		new Setting(containerEl).setName("Completed Task Mover").setHeading();

		new Setting(containerEl)
			.setName("Enable completed task mover")
			.setDesc(
				"Toggle this to enable commands for moving completed tasks to another file."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.completedTaskMover
							.enableCompletedTaskMover
					)
					.onChange(async (value) => {
						this.plugin.settings.completedTaskMover.enableCompletedTaskMover =
							value;
						this.applySettingsUpdate();

						setTimeout(() => {
							this.display();
						}, 200);
					})
			);

		if (this.plugin.settings.completedTaskMover.enableCompletedTaskMover) {
			new Setting(containerEl)
				.setName("Task marker type")
				.setDesc("Choose what type of marker to add to moved tasks")
				.addDropdown((dropdown) => {
					dropdown
						.addOption("version", "Version marker")
						.addOption("date", "Date marker")
						.addOption("custom", "Custom marker")
						.setValue(
							this.plugin.settings.completedTaskMover
								.taskMarkerType
						)
						.onChange(
							async (value: "version" | "date" | "custom") => {
								this.plugin.settings.completedTaskMover.taskMarkerType =
									value;
								this.applySettingsUpdate();

								setTimeout(() => {
									this.display();
								}, 200);
							}
						);
				});

			// Show specific settings based on marker type
			const markerType =
				this.plugin.settings.completedTaskMover.taskMarkerType;

			if (markerType === "version") {
				new Setting(containerEl)
					.setName("Version marker text")
					.setDesc(
						"Text to append to tasks when moved (e.g., 'version 1.0')"
					)
					.addText((text) =>
						text
							.setPlaceholder("version 1.0")
							.setValue(
								this.plugin.settings.completedTaskMover
									.versionMarker
							)
							.onChange(async (value) => {
								this.plugin.settings.completedTaskMover.versionMarker =
									value;
								this.applySettingsUpdate();
							})
					);
			} else if (markerType === "date") {
				new Setting(containerEl)
					.setName("Date marker text")
					.setDesc(
						"Text to append to tasks when moved (e.g., 'archived on 2023-12-31')"
					)
					.addText((text) =>
						text
							.setPlaceholder("archived on {{date}}")
							.setValue(
								this.plugin.settings.completedTaskMover
									.dateMarker
							)
							.onChange(async (value) => {
								this.plugin.settings.completedTaskMover.dateMarker =
									value;
								this.applySettingsUpdate();
							})
					);
			} else if (markerType === "custom") {
				new Setting(containerEl)
					.setName("Custom marker text")
					.setDesc(
						"Use {{DATE:format}} for date formatting (e.g., {{DATE:YYYY-MM-DD}})"
					)
					.addText((text) =>
						text
							.setPlaceholder("moved {{DATE:YYYY-MM-DD HH:mm}}")
							.setValue(
								this.plugin.settings.completedTaskMover
									.customMarker
							)
							.onChange(async (value) => {
								this.plugin.settings.completedTaskMover.customMarker =
									value;
								this.applySettingsUpdate();
							})
					);
			}

			new Setting(containerEl)
				.setName("Treat abandoned tasks as completed")
				.setDesc(
					"If enabled, abandoned tasks will be treated as completed."
				)
				.addToggle((toggle) => {
					toggle.setValue(
						this.plugin.settings.completedTaskMover
							.treatAbandonedAsCompleted
					);
					toggle.onChange((value) => {
						this.plugin.settings.completedTaskMover.treatAbandonedAsCompleted =
							value;
						this.applySettingsUpdate();
					});
				});

			new Setting(containerEl)
				.setName("Complete all moved tasks")
				.setDesc(
					"If enabled, all moved tasks will be marked as completed."
				)
				.addToggle((toggle) => {
					toggle.setValue(
						this.plugin.settings.completedTaskMover
							.completeAllMovedTasks
					);
					toggle.onChange((value) => {
						this.plugin.settings.completedTaskMover.completeAllMovedTasks =
							value;
						this.applySettingsUpdate();
					});
				});

			new Setting(containerEl)
				.setName("With current file link")
				.setDesc(
					"A link to the current file will be added to the parent task of the moved tasks."
				)
				.addToggle((toggle) => {
					toggle.setValue(
						this.plugin.settings.completedTaskMover
							.withCurrentFileLink
					);
					toggle.onChange((value) => {
						this.plugin.settings.completedTaskMover.withCurrentFileLink =
							value;
						this.applySettingsUpdate();
					});
				});
		}

		// Add task filter settings
		this.addTaskFilterSettings();

		new Setting(containerEl).setName("Say Thank You").setHeading();

		new Setting(containerEl)
			.setName("Donate")
			.setDesc(
				"If you like this plugin, consider donating to support continued development:"
			)
			.addButton((bt) => {
				bt.buttonEl.outerHTML = `<a href="https://www.buymeacoffee.com/boninall"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=boninall&button_colour=6495ED&font_colour=ffffff&font_family=Inter&outline_colour=000000&coffee_colour=FFDD00"></a>`;
			});
	}

	showNumberToProgressbar() {
		new Setting(this.containerEl)
			.setName("Add number to the Progress Bar")
			.setDesc(
				"Toggle this to allow this plugin to add tasks number to progress bar."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.addNumberToProgressBar)
					.onChange(async (value) => {
						this.plugin.settings.addNumberToProgressBar = value;
						this.applySettingsUpdate();

						setTimeout(() => {
							this.display();
						}, 200);
					})
			);

		if (this.plugin.settings.addNumberToProgressBar) {
			new Setting(this.containerEl)
				.setName("Show percentage")
				.setDesc(
					"Toggle this to allow this plugin to show percentage in the progress bar."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.showPercentage)
						.onChange(async (value) => {
							this.plugin.settings.showPercentage = value;
							this.applySettingsUpdate();

							setTimeout(() => {
								this.display();
							}, 200);
						})
				);

			if (this.plugin.settings.showPercentage) {
				new Setting(this.containerEl)
					.setName("Customize progress text")
					.setDesc(
						"Toggle this to customize text representation for different progress percentage ranges."
					)
					.addToggle((toggle) =>
						toggle
							.setValue(
								this.plugin.settings.customizeProgressRanges
							)
							.onChange(async (value) => {
								this.plugin.settings.customizeProgressRanges =
									value;
								this.applySettingsUpdate();

								setTimeout(() => {
									this.display();
								}, 200);
							})
					);

				if (this.plugin.settings.customizeProgressRanges) {
					this.addProgressRangesSettings();
				}
			}
		}
	}

	addProgressRangesSettings() {
		new Setting(this.containerEl)
			.setName("Progress Ranges")
			.setDesc(
				"Define progress ranges and their corresponding text representations."
			)
			.setHeading();

		// Display existing ranges
		this.plugin.settings.progressRanges.forEach((range, index) => {
			new Setting(this.containerEl)
				.setName(`Range ${index + 1}: ${range.min}%-${range.max}%`)
				.setDesc(
					`Use {{PROGRESS}} as a placeholder for the percentage value`
				)
				.addText((text) =>
					text
						.setPlaceholder(
							"Template text with {{PROGRESS}} placeholder"
						)
						.setValue(range.text)
						.onChange(async (value) => {
							this.plugin.settings.progressRanges[index].text =
								value;
							this.applySettingsUpdate();
						})
				)
				.addButton((button) => {
					button.setButtonText("Delete").onClick(async () => {
						this.plugin.settings.progressRanges.splice(index, 1);
						this.applySettingsUpdate();
						this.display();
					});
				});
		});

		new Setting(this.containerEl)
			.setName("Add new range")
			.setDesc("Add a new progress percentage range with custom text");

		// Add a new range
		const newRangeSetting = new Setting(this.containerEl);
		newRangeSetting.infoEl.detach();

		newRangeSetting
			.addText((text) =>
				text
					.setPlaceholder("Min percentage (0-100)")
					.setValue("")
					.onChange(async (value) => {
						// This will be handled when the user clicks the Add button
					})
			)
			.addText((text) =>
				text
					.setPlaceholder("Max percentage (0-100)")
					.setValue("")
					.onChange(async (value) => {
						// This will be handled when the user clicks the Add button
					})
			)
			.addText((text) =>
				text
					.setPlaceholder("Text template (use {{PROGRESS}})")
					.setValue("")
					.onChange(async (value) => {
						// This will be handled when the user clicks the Add button
					})
			)
			.addButton((button) => {
				button.setButtonText("Add").onClick(async () => {
					const settingsContainer = button.buttonEl.parentElement;
					if (!settingsContainer) return;

					const inputs = settingsContainer.querySelectorAll("input");
					if (inputs.length < 3) return;

					const min = parseInt(inputs[0].value);
					const max = parseInt(inputs[1].value);
					const text = inputs[2].value;

					if (isNaN(min) || isNaN(max) || !text) {
						return;
					}

					this.plugin.settings.progressRanges.push({
						min,
						max,
						text,
					});

					// Clear inputs
					inputs[0].value = "";
					inputs[1].value = "";
					inputs[2].value = "";

					this.applySettingsUpdate();
					this.display();
				});
			});

		// Reset to defaults
		new Setting(this.containerEl)
			.setName("Reset to defaults")
			.setDesc("Reset progress ranges to default values")
			.addButton((button) => {
				button.setButtonText("Reset").onClick(async () => {
					this.plugin.settings.progressRanges = [
						{ min: 0, max: 20, text: "Just started {{PROGRESS}}%" },
						{
							min: 20,
							max: 40,
							text: "Making progress {{PROGRESS}}%",
						},
						{ min: 40, max: 60, text: "Half way {{PROGRESS}}%" },
						{
							min: 60,
							max: 80,
							text: "Good progress {{PROGRESS}}%",
						},
						{
							min: 80,
							max: 100,
							text: "Almost there {{PROGRESS}}%",
						},
					];
					this.applySettingsUpdate();
					this.display();
				});
			});
	}

	addPriorityPickerSettings() {
		const { containerEl } = this;

		new Setting(containerEl)
			.setName("Priority Picker Settings")
			.setDesc(
				"Toggle to enable priority picker dropdown for emoji and letter format priorities."
			)
			.setHeading();

		new Setting(containerEl)
			.setName("Enable priority picker")
			.setDesc(
				"Toggle to enable priority picker dropdown for emoji and letter format priorities."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enablePriorityPicker)
					.onChange(async (value) => {
						this.plugin.settings.enablePriorityPicker = value;
						this.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName("Enable priority keyboard shortcuts")
			.setDesc(
				"Toggle to enable keyboard shortcuts for setting task priorities."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.enablePriorityKeyboardShortcuts
					)
					.onChange(async (value) => {
						this.plugin.settings.enablePriorityKeyboardShortcuts =
							value;
						this.applySettingsUpdate();
					})
			);
	}

	addDatePickerSettings() {
		new Setting(this.containerEl).setName("Date picker").setHeading();

		new Setting(this.containerEl)
			.setName("Enable date picker")
			.setDesc(
				"Toggle this to enable date picker for tasks. This will add a calendar icon near your tasks which you can click to select a date."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableDatePicker)
					.onChange(async (value) => {
						this.plugin.settings.enableDatePicker = value;
						this.applySettingsUpdate();
					})
			);

		// Date mark setting
		new Setting(this.containerEl)
			.setName("Date mark")
			.setDesc(
				"Emoji mark to identify dates. You can use multiple emoji separated by commas."
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.dateMark)
					.onChange(async (value) => {
						this.plugin.settings.dateMark = value;
						this.applySettingsUpdate();
					})
			);
	}

	addQuickCaptureSettings() {
		new Setting(this.containerEl).setName("Quick capture").setHeading();

		new Setting(this.containerEl)
			.setName("Enable quick capture")
			.setDesc(
				"Toggle this to enable Org-mode style quick capture panel. Press Alt+C to open the capture panel."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.settings.quickCapture.enableQuickCapture
					)
					.onChange(async (value) => {
						this.plugin.settings.quickCapture.enableQuickCapture =
							value;
						this.applySettingsUpdate();

						setTimeout(() => {
							this.display();
						}, 200);
					})
			);

		if (!this.plugin.settings.quickCapture.enableQuickCapture) return;

		new Setting(this.containerEl)
			.setName("Target file")
			.setDesc(
				"The file where captured text will be saved. You can include a path, e.g., 'folder/Quick Capture.md'"
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.quickCapture.targetFile)
					.onChange(async (value) => {
						this.plugin.settings.quickCapture.targetFile = value;
						this.applySettingsUpdate();
					})
			);

		new Setting(this.containerEl)
			.setName("Placeholder text")
			.setDesc("Placeholder text to display in the capture panel")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.quickCapture.placeholder)
					.onChange(async (value) => {
						this.plugin.settings.quickCapture.placeholder = value;
						this.applySettingsUpdate();
					})
			);

		new Setting(this.containerEl)
			.setName("Append to file")
			.setDesc(
				"If enabled, captured text will be appended to the target file. If disabled, it will replace the file content."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("append", "Append")
					.addOption("prepend", "Prepend")
					.addOption("replace", "Replace")
					.setValue(this.plugin.settings.quickCapture.appendToFile)
					.onChange(async (value) => {
						this.plugin.settings.quickCapture.appendToFile =
							value as "append" | "prepend" | "replace";
						this.applySettingsUpdate();
					})
			);
	}

	addTaskFilterSettings() {
		const containerEl = this.containerEl;

		new Setting(containerEl).setName("Task Filter").setHeading();

		new Setting(containerEl)
			.setName("Enable Task Filter")
			.setDesc("Toggle this to enable the task filter panel")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.taskFilter.enableTaskFilter)
					.onChange(async (value) => {
						this.plugin.settings.taskFilter.enableTaskFilter =
							value;
						this.applySettingsUpdate();
					});
			});

		// Preset filters section
		new Setting(containerEl)
			.setName("Preset Filters")
			.setDesc(
				"Create and manage preset filters for quick access to commonly used task filters."
			);

		// Add a container for the preset filters
		const presetFiltersContainer = containerEl.createDiv({
			cls: "preset-filters-container",
		});

		// Function to refresh the preset filters list
		const refreshPresetFiltersList = () => {
			// Clear the container
			presetFiltersContainer.empty();

			// Get current preset filters
			const presetFilters =
				this.plugin.settings.taskFilter.presetTaskFilters;

			if (presetFilters.length === 0) {
				presetFiltersContainer.createEl("div", {
					cls: "no-presets-message",
					text: "No preset filters created yet. Click 'Add New Preset' to create one.",
				});
			}

			// Add each preset filter in the list
			presetFilters.forEach((preset, index) => {
				const presetRow = presetFiltersContainer.createDiv({
					cls: "preset-filter-row",
				});

				// Create the setting
				const presetSetting = new Setting(presetRow)
					.setName(`Preset #${index + 1}`)
					.addText((text) => {
						text.setValue(preset.name)
							.setPlaceholder("Preset name")
							.onChange((value) => {
								preset.name = value;
								this.applySettingsUpdate();
							});
					});

				// Add buttons for editing, removing
				presetSetting.addExtraButton((button) => {
					button
						.setIcon("pencil")
						.setTooltip("Edit Filter")
						.onClick(() => {
							// Show modal to edit filter options
							new PresetFilterModal(this.app, preset, () => {
								this.applySettingsUpdate();
								refreshPresetFiltersList();
							}).open();
						});
				});

				presetSetting.addExtraButton((button) => {
					button
						.setIcon("trash")
						.setTooltip("Remove")
						.onClick(() => {
							// Remove the preset
							presetFilters.splice(index, 1);
							this.applySettingsUpdate();
							refreshPresetFiltersList();
						});
				});
			});

			// Add button to add new preset
			const addButtonContainer = presetFiltersContainer.createDiv();
			new Setting(addButtonContainer)
				.addButton((button) => {
					button
						.setButtonText("Add New Preset")
						.setCta()
						.onClick(() => {
							// Add a new preset with default options
							const newPreset = {
								id: this.generateUniqueId(),
								name: "New Filter",
								options: {
									includeCompleted: true,
									includeInProgress: true,
									includeAbandoned: true,
									includeNotStarted: true,
									includePlanned: true,
									includeParentTasks: true,
									includeChildTasks: true,
									includeSiblingTasks: false,
									advancedFilterQuery: "",
									filterOutTasks: false,
								},
							};

							this.plugin.settings.taskFilter.presetTaskFilters.push(
								newPreset
							);
							this.applySettingsUpdate();

							// Open the edit modal for the new preset
							new PresetFilterModal(this.app, newPreset, () => {
								this.applySettingsUpdate();
								refreshPresetFiltersList();
							}).open();

							refreshPresetFiltersList();
						});
				})
				.addButton((button) => {
					button
						.setButtonText("Reset to Default Presets")
						.onClick(() => {
							// Show confirmation modal
							const modal = new Modal(this.app);
							modal.titleEl.setText("Reset to Default Presets");

							const content = modal.contentEl.createDiv();
							content.setText(
								"This will replace all your current presets with the default set. Are you sure?"
							);

							const buttonContainer = modal.contentEl.createDiv();
							buttonContainer.addClass("modal-button-container");

							const cancelButton =
								buttonContainer.createEl("button");
							cancelButton.setText("Cancel");
							cancelButton.addEventListener("click", () => {
								modal.close();
							});

							const confirmButton =
								buttonContainer.createEl("button");
							confirmButton.setText("Reset");
							confirmButton.addClass("mod-warning");
							confirmButton.addEventListener("click", () => {
								this.createDefaultPresetFilters();
								refreshPresetFiltersList();
								modal.close();
							});

							modal.open();
						});
				});
		};

		// Initial render of the preset filters list
		refreshPresetFiltersList();
	}

	// Generate a unique ID for preset filters
	generateUniqueId(): string {
		return Date.now().toString() + Math.random().toString(36).substr(2, 9);
	}

	// Create default preset filters
	createDefaultPresetFilters() {
		// Clear existing presets if any
		this.plugin.settings.taskFilter.presetTaskFilters = [];

		// Add default presets
		const defaultPresets = [
			{
				id: this.generateUniqueId(),
				name: "Incomplete Tasks",
				options: {
					includeCompleted: false,
					includeInProgress: true,
					includeAbandoned: false,
					includeNotStarted: true,
					includePlanned: true,
					includeParentTasks: true,
					includeChildTasks: true,
					includeSiblingTasks: false,
					advancedFilterQuery: "",
					filterOutTasks: false,
				},
			},
			{
				id: this.generateUniqueId(),
				name: "In Progress Tasks",
				options: {
					includeCompleted: false,
					includeInProgress: true,
					includeAbandoned: false,
					includeNotStarted: false,
					includePlanned: false,
					includeParentTasks: true,
					includeChildTasks: true,
					includeSiblingTasks: false,
					advancedFilterQuery: "",
					filterOutTasks: false,
				},
			},
			{
				id: this.generateUniqueId(),
				name: "Completed Tasks",
				options: {
					includeCompleted: true,
					includeInProgress: false,
					includeAbandoned: false,
					includeNotStarted: false,
					includePlanned: false,
					includeParentTasks: false,
					includeChildTasks: true,
					includeSiblingTasks: false,
					advancedFilterQuery: "",
					filterOutTasks: false,
				},
			},
			{
				id: this.generateUniqueId(),
				name: "All Tasks",
				options: {
					includeCompleted: true,
					includeInProgress: true,
					includeAbandoned: true,
					includeNotStarted: true,
					includePlanned: true,
					includeParentTasks: true,
					includeChildTasks: true,
					includeSiblingTasks: true,
					advancedFilterQuery: "",
					filterOutTasks: false,
				},
			},
		];

		// Add default presets to settings
		this.plugin.settings.taskFilter.presetTaskFilters = defaultPresets;
		this.applySettingsUpdate();
	}
}

class PresetFilterModal extends Modal {
	constructor(app: App, private preset: any, private onSave: () => void) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Set modal title
		this.titleEl.setText("Edit Filter: " + this.preset.name);

		// Create form for filter options
		new Setting(contentEl).setName("Filter name").addText((text) => {
			text.setValue(this.preset.name).onChange((value) => {
				this.preset.name = value;
			});
		});

		// Task status section
		new Setting(contentEl)
			.setName("Task Status")
			.setDesc("Include or exclude tasks based on their status");

		const statusOptions = [
			{ id: "includeCompleted", name: "Include Completed Tasks" },
			{ id: "includeInProgress", name: "Include In Progress Tasks" },
			{ id: "includeAbandoned", name: "Include Abandoned Tasks" },
			{ id: "includeNotStarted", name: "Include Not Started Tasks" },
			{ id: "includePlanned", name: "Include Planned Tasks" },
		];

		for (const option of statusOptions) {
			new Setting(contentEl).setName(option.name).addToggle((toggle) => {
				toggle
					.setValue(this.preset.options[option.id])
					.onChange((value) => {
						this.preset.options[option.id] = value;
					});
			});
		}

		// Related tasks section
		new Setting(contentEl)
			.setName("Related Tasks")
			.setDesc("Include parent, child, and sibling tasks in the filter");

		const relatedOptions = [
			{ id: "includeParentTasks", name: "Include Parent Tasks" },
			{ id: "includeChildTasks", name: "Include Child Tasks" },
			{ id: "includeSiblingTasks", name: "Include Sibling Tasks" },
		];

		for (const option of relatedOptions) {
			new Setting(contentEl).setName(option.name).addToggle((toggle) => {
				toggle
					.setValue(this.preset.options[option.id])
					.onChange((value) => {
						this.preset.options[option.id] = value;
					});
			});
		}

		// Advanced filter section
		new Setting(contentEl)
			.setName("Advanced Filter")
			.setDesc(
				"Use boolean operations: AND, OR, NOT. Example: 'text content AND #tag1'"
			);

		new Setting(contentEl)
			.setName("Filter query")
			.setDesc(
				"Use boolean operations: AND, OR, NOT. Example: 'text content AND #tag1'"
			)
			.addText((text) => {
				text.setValue(this.preset.options.advancedFilterQuery).onChange(
					(value) => {
						this.preset.options.advancedFilterQuery = value;
					}
				);
			});

		new Setting(contentEl)
			.setName("Filter out tasks")
			.setDesc(
				"If enabled, tasks that match the query will be hidden, otherwise they will be shown"
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.preset.options.filterOutTasks)
					.onChange((value) => {
						this.preset.options.filterOutTasks = value;
					});
			});

		// Save and cancel buttons
		new Setting(contentEl)
			.addButton((button) => {
				button
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						this.onSave();
						this.close();
					});
			})
			.addButton((button) => {
				button.setButtonText("Cancel").onClick(() => {
					this.close();
				});
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
