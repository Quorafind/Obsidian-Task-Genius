import {
	editorInfoField,
	HoverParent,
	HoverPopover,
	MarkdownRenderer,
	Plugin,
	Editor,
	Menu,
	addIcon,
	requireApiVersion,
} from "obsidian";
import {
	taskProgressBarExtension,
	formatProgressText,
} from "./editor-ext/progressBarWidget";
import { updateProgressBarInElement } from "./components/readModeProgressbarWidget";
import { applyTaskTextMarks } from "./components/readModeTextMark";
import {
	DEFAULT_SETTINGS,
	TaskProgressBarSettings,
} from "./common/setting-definition";
import { TaskProgressBarSettingTab } from "./setting";
import { EditorView } from "@codemirror/view";
import { autoCompleteParentExtension } from "./editor-ext/autoCompleteParent";
import { taskStatusSwitcherExtension } from "./editor-ext/taskStatusSwitcher";
import { cycleCompleteStatusExtension } from "./editor-ext/cycleCompleteStatus";
import {
	workflowExtension,
	updateWorkflowContextMenu,
} from "./editor-ext/workflow";
import { workflowDecoratorExtension } from "./editor-ext/workflowDecorator";
import { workflowRootEnterHandlerExtension } from "./editor-ext/workflowRootEnterHandler";
import {
	priorityPickerExtension,
	TASK_PRIORITIES,
	LETTER_PRIORITIES,
	priorityChangeAnnotation,
} from "./editor-ext/priorityPicker";
import {
	cycleTaskStatusForward,
	cycleTaskStatusBackward,
} from "./commands/taskCycleCommands";
import { moveTaskCommand } from "./commands/taskMover";
import {
	moveCompletedTasksCommand,
	moveIncompletedTasksCommand,
} from "./commands/completedTaskMover";
import {
	createQuickWorkflowCommand,
	convertTaskToWorkflowCommand,
	startWorkflowHereCommand,
	convertToWorkflowRootCommand,
	duplicateWorkflowCommand,
	showWorkflowQuickActionsCommand,
} from "./commands/workflowCommands";
import { datePickerExtension } from "./editor-ext/datePicker";
import {
	quickCaptureExtension,
	toggleQuickCapture,
	quickCaptureState,
} from "./editor-ext/quickCapture";
import {
	taskFilterExtension,
	toggleTaskFilter,
	taskFilterState,
	migrateOldFilterOptions,
} from "./editor-ext/filterTasks";
import { Task } from "./types/task";
import { QuickCaptureModal } from "./components/QuickCaptureModal";
import { MarkdownView } from "obsidian";
import { Notice } from "obsidian";
import { t } from "./translations/helper";
import { TaskManager } from "./utils/TaskManager";
import { TaskView, TASK_VIEW_TYPE } from "./pages/TaskView";
import "./styles/global.css";
import "./styles/setting.css";
import "./styles/view.css";
import "./styles/view-config.css";
import "./styles/task-status.css";
import { TaskSpecificView } from "./pages/TaskSpecificView";
import { TASK_SPECIFIC_VIEW_TYPE } from "./pages/TaskSpecificView";
import { getTaskGeniusIcon } from "./icon";
import { RewardManager } from "./utils/RewardManager";
import { HabitManager } from "./utils/HabitManager";
import { monitorTaskCompletedExtension } from "./editor-ext/monitorTaskCompleted";
import { sortTasksInDocument } from "./commands/sortTaskCommands";
import { taskGutterExtension } from "./editor-ext/TaskGutterHandler";
import { autoDateManagerExtension } from "./editor-ext/autoDateManager";
import { ViewManager } from "./pages/ViewManager";
import { IcsManager } from "./utils/ics/IcsManager";

class TaskProgressBarPopover extends HoverPopover {
	plugin: TaskProgressBarPlugin;
	data: {
		completed: string;
		total: string;
		inProgress: string;
		abandoned: string;
		notStarted: string;
		planned: string;
	};

	constructor(
		plugin: TaskProgressBarPlugin,
		data: {
			completed: string;
			total: string;
			inProgress: string;
			abandoned: string;
			notStarted: string;
			planned: string;
		},
		parent: HoverParent,
		targetEl: HTMLElement,
		waitTime: number = 1000
	) {
		super(parent, targetEl, waitTime);

		this.hoverEl.toggleClass("task-progress-bar-popover", true);
		this.plugin = plugin;
		this.data = data;
	}

	onload(): void {
		MarkdownRenderer.render(
			this.plugin.app,
			`
| Status | Count |
| --- | --- |
| Total | ${this.data.total} |
| Completed | ${this.data.completed} |
| In Progress | ${this.data.inProgress} |
| Abandoned | ${this.data.abandoned} |
| Not Started | ${this.data.notStarted} |
| Planned | ${this.data.planned} |
`,
			this.hoverEl,
			"",
			this.plugin
		);
	}
}

export const showPopoverWithProgressBar = (
	plugin: TaskProgressBarPlugin,
	{
		progressBar,
		data,
		view,
	}: {
		progressBar: HTMLElement;
		data: {
			completed: string;
			total: string;
			inProgress: string;
			abandoned: string;
			notStarted: string;
			planned: string;
		};
		view: EditorView;
	}
) => {
	const editor = view.state.field(editorInfoField);
	if (!editor) return;
	new TaskProgressBarPopover(plugin, data, editor, progressBar);
};

export default class TaskProgressBarPlugin extends Plugin {
	settings: TaskProgressBarSettings;
	// Task manager instance
	taskManager: TaskManager;

	rewardManager: RewardManager;

	habitManager: HabitManager;

	// ICS manager instance
	icsManager: IcsManager;

	// Preloaded tasks:
	preloadedTasks: Task[] = [];

	// Setting tab
	settingTab: TaskProgressBarSettingTab;

	async onload() {
		await this.loadSettings();

		if (
			requireApiVersion("1.9.0") &&
			this.settings.betaTest?.enableBaseView
		) {
			const viewManager = new ViewManager(this.app, this);
			this.addChild(viewManager);
		}

		// Initialize task manager
		if (this.settings.enableView) {
			this.loadViews();

			addIcon("task-genius", getTaskGeniusIcon());

			this.taskManager = new TaskManager(
				this.app,
				this.app.vault,
				this.app.metadataCache,
				this,
				{
					useWorkers: true,
					debug: true, // Set to true for debugging
				}
			);

			this.addChild(this.taskManager);
		}

		if (this.settings.rewards.enableRewards) {
			this.rewardManager = new RewardManager(this);
			this.addChild(this.rewardManager);

			this.registerEditorExtension([
				monitorTaskCompletedExtension(this.app, this),
			]);
		}

		this.registerCommands();
		this.registerEditorExt();

		this.settingTab = new TaskProgressBarSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				if (this.settings.enablePriorityKeyboardShortcuts) {
					menu.addItem((item) => {
						item.setTitle(t("Set priority"));
						item.setIcon("list-ordered");
						// @ts-ignore
						const submenu = item.setSubmenu() as Menu;
						// Emoji priority commands
						Object.entries(TASK_PRIORITIES).forEach(
							([key, priority]) => {
								if (key !== "none") {
									submenu.addItem((item) => {
										item.setTitle(
											`${t("Set priority")}: ${
												priority.text
											}`
										);
										item.setIcon("arrow-big-up-dash");
										item.onClick(() => {
											setPriorityAtCursor(
												editor,
												priority.emoji
											);
										});
									});
								}
							}
						);

						submenu.addSeparator();

						// Letter priority commands
						Object.entries(LETTER_PRIORITIES).forEach(
							([key, priority]) => {
								submenu.addItem((item) => {
									item.setTitle(
										`${t("Set priority")}: ${key}`
									);
									item.setIcon("a-arrow-up");
									item.onClick(() => {
										setPriorityAtCursor(
											editor,
											`[#${key}]`
										);
									});
								});
							}
						);

						// Remove priority command
						submenu.addItem((item) => {
							item.setTitle(t("Remove Priority"));
							item.setIcon("list-x");
							// @ts-ignore
							item.setWarning(true);
							item.onClick(() => {
								removePriorityAtCursor(editor);
							});
						});
					});
				}

				// Add workflow context menu
				if (this.settings.workflow.enableWorkflow) {
					updateWorkflowContextMenu(menu, editor, this);
				}
			})
		);

		this.app.workspace.onLayoutReady(() => {
			if (this.settings.autoCompleteParent) {
				this.registerEditorExtension([
					autoCompleteParentExtension(this.app, this),
				]);
			}

			if (this.settings.enableCycleCompleteStatus) {
				this.registerEditorExtension([
					cycleCompleteStatusExtension(this.app, this),
				]);
			}

			this.registerMarkdownPostProcessor((el, ctx) => {
				// Apply custom task text marks (replaces checkboxes with styled marks)
				if (this.settings.enableTaskStatusSwitcher) {
					applyTaskTextMarks({
						plugin: this,
						element: el,
						ctx: ctx,
					});
				}

				// Apply progress bars (existing functionality)
				if (
					this.settings.enableProgressbarInReadingMode &&
					this.settings.progressBarDisplayMode !== "none"
				) {
					updateProgressBarInElement({
						plugin: this,
						element: el,
						ctx: ctx,
					});
				}
			});

			if (this.settings.enableView) {
				// Initialize task manager after the layout is ready
				this.taskManager.initialize().catch((error) => {
					console.error("Failed to initialize task manager:", error);
				});

				// Register the TaskView
				this.registerView(
					TASK_VIEW_TYPE,
					(leaf) => new TaskView(leaf, this)
				);

				this.registerView(
					TASK_SPECIFIC_VIEW_TYPE,
					(leaf) => new TaskSpecificView(leaf, this)
				);

				// Add a ribbon icon for opening the TaskView
				this.addRibbonIcon(
					"task-genius",
					t("Open Task Genius view"),
					() => {
						this.activateTaskView();
					}
				);
				// Add a command to open the TaskView
				this.addCommand({
					id: "open-task-genius-view",
					name: t("Open Task Genius view"),
					callback: () => {
						this.activateTaskView();
					},
				});
			}

			if (this.settings.habit.enableHabits) {
				this.habitManager = new HabitManager(this);
				this.addChild(this.habitManager);
			}

			// Initialize ICS manager if sources are configured
			if (this.settings.icsIntegration.sources.length > 0) {
				this.icsManager = new IcsManager(
					this.settings.icsIntegration,
					this.settings
				);
				this.addChild(this.icsManager);

				// Initialize ICS manager
				this.icsManager.initialize().catch((error) => {
					console.error("Failed to initialize ICS manager:", error);
				});
			}
		});

		// Migrate old presets to use the new filterMode setting
		if (
			this.settings.taskFilter &&
			this.settings.taskFilter.presetTaskFilters
		) {
			this.settings.taskFilter.presetTaskFilters =
				this.settings.taskFilter.presetTaskFilters.map(
					(preset: any) => {
						if (preset.options) {
							preset.options = migrateOldFilterOptions(
								preset.options
							);
						}
						return preset;
					}
				);
			await this.saveSettings();
		}

		// Add a global command for quick capture from anywhere
		this.addCommand({
			id: "global-quick-capture",
			name: t("Quick capture (Global)"),
			callback: () => {
				// Get the active leaf if available
				const activeLeaf =
					this.app.workspace.getActiveViewOfType(MarkdownView);

				if (activeLeaf && activeLeaf.editor) {
					// If we're in a markdown editor, use the editor command
					const editorView = activeLeaf.editor.cm as EditorView;

					// Import necessary functions dynamically to avoid circular dependencies

					try {
						// Show the quick capture panel
						editorView.dispatch({
							effects: toggleQuickCapture.of(true),
						});
					} catch (e) {
						// No quick capture state found, try to add the extension first
						// This is a simplified approach and might not work in all cases
						this.registerEditorExtension([
							quickCaptureExtension(this.app, this),
						]);

						// Try again after registering the extension
						setTimeout(() => {
							try {
								editorView.dispatch({
									effects: toggleQuickCapture.of(true),
								});
							} catch (e) {
								new Notice(
									t(
										"Could not open quick capture panel in the current editor"
									)
								);
							}
						}, 100);
					}
				} else {
					// No active markdown view, show a floating capture window instead
					// Create a simple modal with capture functionality
					new QuickCaptureModal(this.app, this).open();
				}
			},
		});

		// Add command for full-featured task capture
		this.addCommand({
			id: "full-featured-task-capture",
			name: t("Task capture with metadata"),
			callback: () => {
				// Create a modal with full task metadata options
				new QuickCaptureModal(this.app, this, {}, true).open();
			},
		});

		// Add command for toggling task filter
		this.addCommand({
			id: "toggle-task-filter",
			name: t("Toggle task filter panel"),
			editorCallback: (editor, ctx) => {
				const view = editor.cm as EditorView;

				if (view) {
					view.dispatch({
						effects: toggleTaskFilter.of(
							!view.state.field(taskFilterState)
						),
					});
				}
			},
		});
	}

	registerCommands() {
		if (this.settings.sortTasks) {
			this.addCommand({
				id: "sort-tasks-by-due-date",
				name: t("Sort Tasks in Section"),
				editorCallback: (editor: Editor, view: MarkdownView) => {
					const editorView = (editor as any).cm as EditorView;
					if (!editorView) return;

					const changes = sortTasksInDocument(
						editorView,
						this,
						false
					);

					if (changes) {
						new Notice(
							t(
								"Tasks sorted (using settings). Change application needs refinement."
							)
						);
					} else {
						// Notice is already handled within sortTasksInDocument if no changes or sorting disabled
					}
				},
			});

			this.addCommand({
				id: "sort-tasks-in-entire-document",
				name: t("Sort Tasks in Entire Document"),
				editorCallback: (editor: Editor, view: MarkdownView) => {
					const editorView = (editor as any).cm as EditorView;
					if (!editorView) return;

					const changes = sortTasksInDocument(editorView, this, true);

					if (changes) {
						const info = editorView.state.field(editorInfoField);
						if (!info || !info.file) return;
						this.app.vault.process(info.file, (data) => {
							return changes;
						});
						new Notice(
							t("Entire document sorted (using settings).")
						);
					} else {
						new Notice(
							t("Tasks already sorted or no tasks found.")
						);
					}
				},
			});
		}

		// Add command for cycling task status forward
		this.addCommand({
			id: "cycle-task-status-forward",
			name: t("Cycle task status forward"),
			editorCheckCallback: (checking, editor, ctx) => {
				return cycleTaskStatusForward(checking, editor, ctx, this);
			},
		});

		// Add command for cycling task status backward
		this.addCommand({
			id: "cycle-task-status-backward",
			name: t("Cycle task status backward"),
			editorCheckCallback: (checking, editor, ctx) => {
				return cycleTaskStatusBackward(checking, editor, ctx, this);
			},
		});

		if (this.settings.enableView) {
			// Add command to refresh the task index
			this.addCommand({
				id: "refresh-task-index",
				name: t("Refresh task index"),
				callback: async () => {
					try {
						new Notice(t("Refreshing task index..."));
						await this.taskManager.initialize();
						new Notice(t("Task index refreshed"));
					} catch (error) {
						console.error("Failed to refresh task index:", error);
						new Notice(t("Failed to refresh task index"));
					}
				},
			});

			// Add command to force reindex all tasks by clearing cache
			this.addCommand({
				id: "force-reindex-tasks",
				name: t("Force reindex all tasks"),
				callback: async () => {
					try {
						new Notice(
							t("Clearing task cache and rebuilding index...")
						);
						await this.taskManager.forceReindex();
						new Notice(t("Task index completely rebuilt"));
					} catch (error) {
						console.error("Failed to force reindex tasks:", error);
						new Notice(t("Failed to force reindex tasks"));
					}
				},
			});
		}

		// Add priority keyboard shortcuts commands
		if (this.settings.enablePriorityKeyboardShortcuts) {
			// Emoji priority commands
			Object.entries(TASK_PRIORITIES).forEach(([key, priority]) => {
				if (key !== "none") {
					this.addCommand({
						id: `set-priority-${key}`,
						name: `${t("Set priority")} ${priority.text}`,
						editorCallback: (editor) => {
							setPriorityAtCursor(editor, priority.emoji);
						},
					});
				}
			});

			// Letter priority commands
			Object.entries(LETTER_PRIORITIES).forEach(([key, priority]) => {
				this.addCommand({
					id: `set-priority-letter-${key}`,
					name: `${t("Set priority")} ${key}`,
					editorCallback: (editor) => {
						setPriorityAtCursor(editor, `[#${key}]`);
					},
				});
			});

			// Remove priority command
			this.addCommand({
				id: "remove-priority",
				name: t("Remove priority"),
				editorCallback: (editor) => {
					removePriorityAtCursor(editor);
				},
			});
		}

		// Add command for moving tasks
		this.addCommand({
			id: "move-task-to-file",
			name: t("Move task to another file"),
			editorCheckCallback: (checking, editor, ctx) => {
				return moveTaskCommand(checking, editor, ctx, this);
			},
		});

		// Add commands for moving completed tasks
		if (this.settings.completedTaskMover.enableCompletedTaskMover) {
			// Command for moving all completed subtasks and their children
			this.addCommand({
				id: "move-completed-subtasks-to-file",
				name: t("Move all completed subtasks to another file"),
				editorCheckCallback: (checking, editor, ctx) => {
					return moveCompletedTasksCommand(
						checking,
						editor,
						ctx,
						this,
						"allCompleted"
					);
				},
			});

			// Command for moving direct completed children
			this.addCommand({
				id: "move-direct-completed-subtasks-to-file",
				name: t("Move direct completed subtasks to another file"),
				editorCheckCallback: (checking, editor, ctx) => {
					return moveCompletedTasksCommand(
						checking,
						editor,
						ctx,
						this,
						"directChildren"
					);
				},
			});

			// Command for moving all subtasks (completed and uncompleted)
			this.addCommand({
				id: "move-all-subtasks-to-file",
				name: t("Move all subtasks to another file"),
				editorCheckCallback: (checking, editor, ctx) => {
					return moveCompletedTasksCommand(
						checking,
						editor,
						ctx,
						this,
						"all"
					);
				},
			});
		}

		// Add commands for moving incomplete tasks
		if (this.settings.completedTaskMover.enableIncompletedTaskMover) {
			// Command for moving all incomplete subtasks and their children
			this.addCommand({
				id: "move-incompleted-subtasks-to-file",
				name: t("Move all incomplete subtasks to another file"),
				editorCheckCallback: (checking, editor, ctx) => {
					return moveIncompletedTasksCommand(
						checking,
						editor,
						ctx,
						this,
						"allIncompleted"
					);
				},
			});

			// Command for moving direct incomplete children
			this.addCommand({
				id: "move-direct-incompleted-subtasks-to-file",
				name: t("Move direct incomplete subtasks to another file"),
				editorCheckCallback: (checking, editor, ctx) => {
					return moveIncompletedTasksCommand(
						checking,
						editor,
						ctx,
						this,
						"directIncompletedChildren"
					);
				},
			});
		}

		// Add command for toggling quick capture panel in editor
		this.addCommand({
			id: "toggle-quick-capture",
			name: t("Toggle quick capture panel"),
			editorCallback: (editor) => {
				const editorView = editor.cm as EditorView;

				try {
					// Check if the state field exists
					const stateField =
						editorView.state.field(quickCaptureState);

					// Toggle the quick capture panel
					editorView.dispatch({
						effects: toggleQuickCapture.of(!stateField),
					});
				} catch (e) {
					// Field doesn't exist, create it with value true (to show panel)
					editorView.dispatch({
						effects: toggleQuickCapture.of(true),
					});
				}
			},
		});

		// Workflow commands
		if (this.settings.workflow.enableWorkflow) {
			this.addCommand({
				id: "create-quick-workflow",
				name: t("Create quick workflow"),
				editorCheckCallback: (checking, editor, ctx) => {
					return createQuickWorkflowCommand(
						checking,
						editor,
						ctx,
						this
					);
				},
			});

			this.addCommand({
				id: "convert-task-to-workflow",
				name: t("Convert task to workflow template"),
				editorCheckCallback: (checking, editor, ctx) => {
					return convertTaskToWorkflowCommand(
						checking,
						editor,
						ctx,
						this
					);
				},
			});

			this.addCommand({
				id: "start-workflow-here",
				name: t("Start workflow here"),
				editorCheckCallback: (checking, editor, ctx) => {
					return startWorkflowHereCommand(
						checking,
						editor,
						ctx,
						this
					);
				},
			});

			this.addCommand({
				id: "convert-to-workflow-root",
				name: t("Convert current task to workflow root"),
				editorCheckCallback: (checking, editor, ctx) => {
					return convertToWorkflowRootCommand(
						checking,
						editor,
						ctx,
						this
					);
				},
			});

			this.addCommand({
				id: "duplicate-workflow",
				name: t("Duplicate workflow"),
				editorCheckCallback: (checking, editor, ctx) => {
					return duplicateWorkflowCommand(
						checking,
						editor,
						ctx,
						this
					);
				},
			});

			this.addCommand({
				id: "workflow-quick-actions",
				name: t("Workflow quick actions"),
				editorCheckCallback: (checking, editor, ctx) => {
					return showWorkflowQuickActionsCommand(
						checking,
						editor,
						ctx,
						this
					);
				},
			});
		}
	}

	registerEditorExt() {
		this.registerEditorExtension([
			taskProgressBarExtension(this.app, this),
		]);
		this.settings.taskGutter.enableTaskGutter &&
			this.registerEditorExtension([taskGutterExtension(this.app, this)]);
		this.settings.enableTaskStatusSwitcher &&
			this.settings.enableCustomTaskMarks &&
			this.registerEditorExtension([
				taskStatusSwitcherExtension(this.app, this),
			]);

		// Add priority picker extension
		if (this.settings.enablePriorityPicker) {
			this.registerEditorExtension([
				priorityPickerExtension(this.app, this),
			]);
		}

		// Add date picker extension
		if (this.settings.enableDatePicker) {
			this.registerEditorExtension([datePickerExtension(this.app, this)]);
		}

		// Add workflow extension
		if (this.settings.workflow.enableWorkflow) {
			this.registerEditorExtension([workflowExtension(this.app, this)]);
			this.registerEditorExtension([
				workflowDecoratorExtension(this.app, this),
			]);
			this.registerEditorExtension([
				workflowRootEnterHandlerExtension(this.app, this),
			]);
		}

		// Add quick capture extension
		if (this.settings.quickCapture.enableQuickCapture) {
			this.registerEditorExtension([
				quickCaptureExtension(this.app, this),
			]);
		}

		// Add task filter extension
		if (this.settings.taskFilter.enableTaskFilter) {
			this.registerEditorExtension([taskFilterExtension(this)]);
		}

		// Add auto date manager extension
		if (this.settings.autoDateManager.enabled) {
			this.registerEditorExtension([
				autoDateManagerExtension(this.app, this),
			]);
		}
	}

	onunload() {
		// Clean up task manager when plugin is unloaded
		if (this.taskManager) {
			this.taskManager.onunload();
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async loadViews() {
		const defaultViews = DEFAULT_SETTINGS.viewConfiguration;

		// Ensure all default views exist in user settings
		if (!this.settings.viewConfiguration) {
			this.settings.viewConfiguration = [];
		}

		// Add any missing default views to user settings
		defaultViews.forEach((defaultView) => {
			const existingView = this.settings.viewConfiguration.find(
				(v) => v.id === defaultView.id
			);
			if (!existingView) {
				this.settings.viewConfiguration.push({ ...defaultView });
			}
		});

		await this.saveSettings();
	}

	// Helper method to set priority at cursor position

	async activateTaskView() {
		const { workspace } = this.app;

		// Check if view is already open
		const existingLeaf = workspace.getLeavesOfType(TASK_VIEW_TYPE)[0];

		if (existingLeaf) {
			// If view is already open, just reveal it
			workspace.revealLeaf(existingLeaf);
			return;
		}

		// Otherwise, create a new leaf in the right split and open the view
		const leaf = workspace.getLeaf("tab");
		await leaf.setViewState({ type: TASK_VIEW_TYPE });
		workspace.revealLeaf(leaf);
	}

	async triggerViewUpdate() {
		const leaves = this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
		if (leaves.length > 0) {
			for (const leaf of leaves) {
				if (leaf.view instanceof TaskView) {
					leaf.view.tasks = this.preloadedTasks;
					leaf.view.triggerViewUpdate();
				}
			}
		}
	}

	/**
	 * Get the ICS manager instance
	 */
	getIcsManager(): IcsManager | undefined {
		return this.icsManager;
	}
}

function setPriorityAtCursor(editor: Editor, priority: string) {
	const cursor = editor.getCursor();
	const line = editor.getLine(cursor.line);
	const lineStart = editor.posToOffset({ line: cursor.line, ch: 0 });

	// Check if this line has a task
	const taskRegex =
		/^([\s|\t]*[-*+] \[.\].*?)(?:🔺|⏫|🔼|🔽|⏬️|\[#[A-C]\])?(\s*)$/;
	const match = line.match(taskRegex);

	if (match) {
		// Find the priority position
		const priorityRegex = /(?:🔺|⏫|🔼|🔽|⏬️|\[#[A-C]\])/;
		const priorityMatch = line.match(priorityRegex);

		// Replace any existing priority or add the new priority
		// @ts-ignore
		const cm = editor.cm as EditorView;
		if (priorityMatch) {
			// Replace existing priority
			cm.dispatch({
				changes: {
					from: lineStart + (priorityMatch.index || 0),
					to:
						lineStart +
						(priorityMatch.index || 0) +
						(priorityMatch[0]?.length || 0),
					insert: priority,
				},
				annotations: [priorityChangeAnnotation.of(true)],
			});
		} else {
			// Add new priority after task text
			const taskTextEnd = lineStart + match[1].length;
			cm.dispatch({
				changes: {
					from: taskTextEnd,
					to: taskTextEnd,
					insert: ` ${priority}`,
				},
				annotations: [priorityChangeAnnotation.of(true)],
			});
		}
	}
}

// Helper method to remove priority at cursor position
function removePriorityAtCursor(editor: Editor) {
	const cursor = editor.getCursor();
	const line = editor.getLine(cursor.line);
	const lineStart = editor.posToOffset({ line: cursor.line, ch: 0 });

	// Check if this line has a task with priority
	const priorityRegex = /(?:🔺|⏫|🔼|🔽|⏬️|\[#[A-C]\])/;
	const match = line.match(priorityRegex);

	if (match) {
		// Remove the priority
		// @ts-ignore
		const cm = editor.cm as EditorView;
		cm.dispatch({
			changes: {
				from: lineStart + (match.index || 0),
				to: lineStart + (match.index || 0) + (match[0]?.length || 0),
				insert: "",
			},
			annotations: [priorityChangeAnnotation.of(true)],
		});
	}
}
