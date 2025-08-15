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
	Platform,
} from "obsidian";
import { taskProgressBarExtension } from "./editor-ext/progressBarWidget";
import { taskTimerExtension } from "./editor-ext/taskTimer";
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
	autoMoveCompletedTasksCommand,
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
import { MinimalQuickCaptureModal } from "./components/MinimalQuickCaptureModal";
import { MinimalQuickCaptureSuggest } from "./components/MinimalQuickCaptureSuggest";
import { SuggestManager } from "./components/suggest";
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
import "./styles/quadrant/quadrant.css";
import "./styles/onboarding.css";
import "./styles/universal-suggest.css";
import { TaskSpecificView } from "./pages/TaskSpecificView";
import { TASK_SPECIFIC_VIEW_TYPE } from "./pages/TaskSpecificView";
import {
	TimelineSidebarView,
	TIMELINE_SIDEBAR_VIEW_TYPE,
} from "./components/timeline-sidebar/TimelineSidebarView";
import { getStatusIcon, getTaskGeniusIcon } from "./icon";
import { RewardManager } from "./utils/RewardManager";
import { HabitManager } from "./utils/HabitManager";
import { TaskGeniusIconManager } from "./utils/TaskGeniusIconManager";
import { monitorTaskCompletedExtension } from "./editor-ext/monitorTaskCompleted";
import { sortTasksInDocument } from "./commands/sortTaskCommands";
import { taskGutterExtension } from "./editor-ext/TaskGutterHandler";
import { autoDateManagerExtension } from "./editor-ext/autoDateManager";
import { taskMarkCleanupExtension } from "./editor-ext/taskMarkCleanup";
import { ViewManager } from "./pages/ViewManager";
import { IcsManager } from "./utils/ics/IcsManager";
import { VersionManager } from "./utils/VersionManager";
import { RebuildProgressManager } from "./utils/RebuildProgressManager";
import { OnboardingConfigManager } from "./utils/OnboardingConfigManager";
import { SettingsChangeDetector } from "./utils/SettingsChangeDetector";
import { OnboardingView, ONBOARDING_VIEW_TYPE } from "./components/onboarding/OnboardingView";
import { TaskTimerExporter } from "./utils/TaskTimerExporter";
import { TaskTimerManager } from "./utils/TaskTimerManager";
import { McpServerManager } from "./mcp/McpServerManager";

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

	// Task timer manager and exporter
	taskTimerManager: TaskTimerManager;
	taskTimerExporter: TaskTimerExporter;

	// ICS manager instance
	icsManager: IcsManager;

	// Minimal quick capture suggest
	minimalQuickCaptureSuggest: MinimalQuickCaptureSuggest;
	
	// Regular quick capture suggest
	quickCaptureSuggest: any;

	// Global suggest manager
	globalSuggestManager: SuggestManager;

	// Version manager instance
	versionManager: VersionManager;

	// Rebuild progress manager instance
	rebuildProgressManager: RebuildProgressManager;

	// Onboarding manager instance
	onboardingConfigManager: OnboardingConfigManager;
	settingsChangeDetector: SettingsChangeDetector;

	// Preloaded tasks:
	preloadedTasks: Task[] = [];

	// Setting tab
	settingTab: TaskProgressBarSettingTab;

	// Task Genius Icon manager instance
	taskGeniusIconManager: TaskGeniusIconManager;

	// MCP Server manager instance (desktop only)
	mcpServerManager?: McpServerManager;

	async onload() {
		await this.loadSettings();

		if (
			requireApiVersion("1.9.0") &&
			this.settings.betaTest?.enableBaseView
		) {
			const viewManager = new ViewManager(this.app, this);
			this.addChild(viewManager);
		}

		// Initialize version manager first
		this.versionManager = new VersionManager(this.app, this);
		this.addChild(this.versionManager);

		// Initialize onboarding config manager
		this.onboardingConfigManager = new OnboardingConfigManager(this);
		this.settingsChangeDetector = new SettingsChangeDetector(this);

		// Initialize global suggest manager
		this.globalSuggestManager = new SuggestManager(this.app, this);

		// Initialize rebuild progress manager
		this.rebuildProgressManager = new RebuildProgressManager();

		// Initialize task manager
		if (this.settings.enableView) {
			this.loadViews();

			addIcon("task-genius", getTaskGeniusIcon());
			addIcon("completed", getStatusIcon("completed"));
			addIcon("inProgress", getStatusIcon("inProgress"));
			addIcon("planned", getStatusIcon("planned"));
			addIcon("abandoned", getStatusIcon("abandoned"));
			addIcon("notStarted", getStatusIcon("notStarted"));

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
			// Initialize Task Genius Icon Manager
			this.taskGeniusIconManager = new TaskGeniusIconManager(this);
			this.addChild(this.taskGeniusIconManager);

			// Initialize MCP Server Manager (desktop only)
			if (Platform.isDesktopApp) {
				this.mcpServerManager = new McpServerManager(this);
				this.mcpServerManager.initialize();
			}

			// Check and show onboarding for first-time users
			this.checkAndShowOnboarding();

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
				// Check for version changes and handle rebuild if needed
				this.initializeTaskManagerWithVersionCheck().catch((error) => {
					console.error(
						"Failed to initialize task manager with version check:",
						error
					);
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

				// Register the Timeline Sidebar View
				this.registerView(
					TIMELINE_SIDEBAR_VIEW_TYPE,
					(leaf) => new TimelineSidebarView(leaf, this)
				);

				// Register the Onboarding View
				this.registerView(
					ONBOARDING_VIEW_TYPE,
					(leaf) => new OnboardingView(leaf, this, () => {
						console.log("Onboarding completed successfully");
						// Close the onboarding view and refresh views
						leaf.detach();
					})
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

				// Add a command to open the Timeline Sidebar View
				this.addCommand({
					id: "open-timeline-sidebar-view",
					name: t("Open Timeline Sidebar"),
					callback: () => {
						this.activateTimelineSidebarView();
					},
				});

				// Add a command to open the Onboarding/Setup View
				this.addCommand({
					id: "open-task-genius-setup",
					name: t("Open Task Genius Setup"),
					callback: () => {
						this.openOnboardingView();
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

			// Auto-open timeline sidebar if enabled
			if (
				this.settings.timelineSidebar.enableTimelineSidebar &&
				this.settings.timelineSidebar.autoOpenOnStartup
			) {
				// Delay opening to ensure workspace is ready
				setTimeout(() => {
					this.activateTimelineSidebarView().catch((error) => {
						console.error(
							"Failed to auto-open timeline sidebar:",
							error
						);
					});
				}, 1000);
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

		// Add command for quick capture with metadata
		this.addCommand({
			id: "quick-capture",
			name: t("Quick Capture"),
			callback: () => {
				// Create a modal with full task metadata options
				new QuickCaptureModal(this.app, this, {}, true).open();
			},
		});

		// Add command for minimal quick capture
		this.addCommand({
			id: "minimal-quick-capture",
			name: t("Minimal Quick Capture"),
			callback: () => {
				// Create a minimal modal for quick task capture
				new MinimalQuickCaptureModal(this.app, this).open();
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
						await this.taskManager.forceReindex();
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

			// Auto-move commands (using default settings)
			if (this.settings.completedTaskMover.enableAutoMove) {
				this.addCommand({
					id: "auto-move-completed-subtasks",
					name: t("Auto-move completed subtasks to default file"),
					editorCheckCallback: (checking, editor, ctx) => {
						return autoMoveCompletedTasksCommand(
							checking,
							editor,
							ctx,
							this,
							"allCompleted"
						);
					},
				});

				this.addCommand({
					id: "auto-move-direct-completed-subtasks",
					name: t(
						"Auto-move direct completed subtasks to default file"
					),
					editorCheckCallback: (checking, editor, ctx) => {
						return autoMoveCompletedTasksCommand(
							checking,
							editor,
							ctx,
							this,
							"directChildren"
						);
					},
				});

				this.addCommand({
					id: "auto-move-all-subtasks",
					name: t("Auto-move all subtasks to default file"),
					editorCheckCallback: (checking, editor, ctx) => {
						return autoMoveCompletedTasksCommand(
							checking,
							editor,
							ctx,
							this,
							"all"
						);
					},
				});
			}
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

			// Auto-move commands for incomplete tasks (using default settings)
			if (this.settings.completedTaskMover.enableIncompletedAutoMove) {
				this.addCommand({
					id: "auto-move-incomplete-subtasks",
					name: t("Auto-move incomplete subtasks to default file"),
					editorCheckCallback: (checking, editor, ctx) => {
						return autoMoveCompletedTasksCommand(
							checking,
							editor,
							ctx,
							this,
							"allIncompleted"
						);
					},
				});

				this.addCommand({
					id: "auto-move-direct-incomplete-subtasks",
					name: t(
						"Auto-move direct incomplete subtasks to default file"
					),
					editorCheckCallback: (checking, editor, ctx) => {
						return autoMoveCompletedTasksCommand(
							checking,
							editor,
							ctx,
							this,
							"directIncompletedChildren"
						);
					},
				});
			}
		}

		// Add command for toggling quick capture panel in editor
		this.addCommand({
			id: "toggle-quick-capture",
			name: t("Toggle quick capture panel in editor"),
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

		this.addCommand({
			id: "toggle-quick-capture-globally",
			name: t("Toggle quick capture panel in editor (Globally)"),
			callback: () => {
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

		// Task timer export/import commands
		if (this.settings.taskTimer?.enabled && this.taskTimerExporter) {
			this.addCommand({
				id: "export-task-timer-data",
				name: "Export task timer data",
				callback: async () => {
					try {
						const stats = this.taskTimerExporter.getExportStats();
						if (stats.activeTimers === 0) {
							new Notice("No timer data to export");
							return;
						}

						const jsonData = this.taskTimerExporter.exportToJSON(true);
						
						// Create a blob and download link
						const blob = new Blob([jsonData], { type: 'application/json' });
						const url = URL.createObjectURL(blob);
						const a = document.createElement('a');
						a.href = url;
						a.download = `task-timer-data-${new Date().toISOString().split('T')[0]}.json`;
						document.body.appendChild(a);
						a.click();
						document.body.removeChild(a);
						URL.revokeObjectURL(url);

						new Notice(`Exported ${stats.activeTimers} timer records`);
					} catch (error) {
						console.error("Error exporting timer data:", error);
						new Notice("Failed to export timer data");
					}
				},
			});

			this.addCommand({
				id: "import-task-timer-data",
				name: "Import task timer data",
				callback: async () => {
					try {
						// Create file input for JSON import
						const input = document.createElement('input');
						input.type = 'file';
						input.accept = '.json';
						
						input.onchange = async (e) => {
							const file = (e.target as HTMLInputElement).files?.[0];
							if (!file) return;

							try {
								const text = await file.text();
								const success = this.taskTimerExporter.importFromJSON(text);
								
								if (success) {
									new Notice("Timer data imported successfully");
								} else {
									new Notice("Failed to import timer data - invalid format");
								}
							} catch (error) {
								console.error("Error importing timer data:", error);
								new Notice("Failed to import timer data");
							}
						};

						input.click();
					} catch (error) {
						console.error("Error setting up import:", error);
						new Notice("Failed to set up import");
					}
				},
			});

			this.addCommand({
				id: "export-task-timer-yaml",
				name: "Export task timer data (YAML)",
				callback: async () => {
					try {
						const stats = this.taskTimerExporter.getExportStats();
						if (stats.activeTimers === 0) {
							new Notice("No timer data to export");
							return;
						}

						const yamlData = this.taskTimerExporter.exportToYAML(true);
						
						// Create a blob and download link
						const blob = new Blob([yamlData], { type: 'text/yaml' });
						const url = URL.createObjectURL(blob);
						const a = document.createElement('a');
						a.href = url;
						a.download = `task-timer-data-${new Date().toISOString().split('T')[0]}.yaml`;
						document.body.appendChild(a);
						a.click();
						document.body.removeChild(a);
						URL.revokeObjectURL(url);

						new Notice(`Exported ${stats.activeTimers} timer records to YAML`);
					} catch (error) {
						console.error("Error exporting timer data to YAML:", error);
						new Notice("Failed to export timer data to YAML");
					}
				},
			});

			this.addCommand({
				id: "backup-task-timer-data",
				name: "Create task timer backup",
				callback: async () => {
					try {
						const backupData = this.taskTimerExporter.createBackup();
						
						// Create a blob and download link
						const blob = new Blob([backupData], { type: 'application/json' });
						const url = URL.createObjectURL(blob);
						const a = document.createElement('a');
						a.href = url;
						a.download = `task-timer-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
						document.body.appendChild(a);
						a.click();
						document.body.removeChild(a);
						URL.revokeObjectURL(url);

						new Notice("Task timer backup created");
					} catch (error) {
						console.error("Error creating timer backup:", error);
						new Notice("Failed to create timer backup");
					}
				},
			});

			this.addCommand({
				id: "show-task-timer-stats",
				name: "Show task timer statistics",
				callback: () => {
					try {
						const stats = this.taskTimerExporter.getExportStats();
						
						let message = `Task Timer Statistics:\n`;
						message += `Active timers: ${stats.activeTimers}\n`;
						message += `Total duration: ${Math.round(stats.totalDuration / 60000)} minutes\n`;
						
						if (stats.oldestTimer) {
							message += `Oldest timer: ${stats.oldestTimer}\n`;
						}
						if (stats.newestTimer) {
							message += `Newest timer: ${stats.newestTimer}`;
						}

						new Notice(message, 10000);
					} catch (error) {
						console.error("Error getting timer stats:", error);
						new Notice("Failed to get timer statistics");
					}
				},
			});
		}
	}

	registerEditorExt() {
		this.registerEditorExtension([
			taskProgressBarExtension(this.app, this),
		]);

		// Add task timer extension
		if (this.settings.taskTimer?.enabled) {
			// Initialize task timer manager and exporter
			if (!this.taskTimerManager) {
				this.taskTimerManager = new TaskTimerManager(this.settings.taskTimer);
			}
			if (!this.taskTimerExporter) {
				this.taskTimerExporter = new TaskTimerExporter(this.taskTimerManager);
			}

			this.registerEditorExtension([
				taskTimerExtension(this),
			]);
		}

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

		// Initialize minimal quick capture suggest
		if (this.settings.quickCapture.enableMinimalMode) {
			this.minimalQuickCaptureSuggest = new MinimalQuickCaptureSuggest(
				this.app,
				this
			);
			this.registerEditorSuggest(this.minimalQuickCaptureSuggest);
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

		// Add task mark cleanup extension (always enabled)
		this.registerEditorExtension([taskMarkCleanupExtension()]);
	}

	onunload() {
		// Clean up global suggest manager
		if (this.globalSuggestManager) {
			this.globalSuggestManager.cleanup();
		}

		// Clean up task manager when plugin is unloaded
		if (this.taskManager) {
			this.taskManager.onunload();
		}

		// Clean up MCP server manager (desktop only)
		if (this.mcpServerManager) {
			this.mcpServerManager.cleanup();
		}

		// Task Genius Icon Manager cleanup is handled automatically by Component system
	}

	/**
	 * Check and show onboarding for first-time users or users who request it
	 */
	private async checkAndShowOnboarding(): Promise<void> {
		try {
			// Check if this is the first install and onboarding hasn't been completed
			const versionResult = await this.versionManager.checkVersionChange();
			const isFirstInstall = versionResult.versionInfo.isFirstInstall;
			const shouldShowOnboarding = this.onboardingConfigManager.shouldShowOnboarding();

			// For existing users with changes, let the view handle the async detection
			// For new users, show onboarding directly
			if ((isFirstInstall && shouldShowOnboarding) || 
				(!isFirstInstall && shouldShowOnboarding && this.settingsChangeDetector.hasUserMadeChanges())) {
				
				// Small delay to ensure UI is ready
				setTimeout(() => {
					this.openOnboardingView();
				}, 500);
			}
		} catch (error) {
			console.error("Failed to check onboarding status:", error);
		}
	}

	/**
	 * Open the onboarding view in a new leaf
	 */
	async openOnboardingView(): Promise<void> {
		const { workspace } = this.app;

		// Check if onboarding view is already open
		const existingLeaf = workspace.getLeavesOfType(ONBOARDING_VIEW_TYPE)[0];
		
		if (existingLeaf) {
			workspace.revealLeaf(existingLeaf);
			return;
		}

		// Create a new leaf in the main area and open the onboarding view
		const leaf = workspace.getLeaf("tab");
		await leaf.setViewState({ type: ONBOARDING_VIEW_TYPE });
		workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		const savedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, savedData);

		// Migrate old inheritance settings to new structure
		this.migrateInheritanceSettings(savedData);
	}

	private migrateInheritanceSettings(savedData: any) {
		// Check if old inheritance settings exist and new ones don't
		if (
			savedData?.projectConfig?.metadataConfig &&
			!savedData?.fileMetadataInheritance
		) {
			const oldConfig = savedData.projectConfig.metadataConfig;

			// Migrate to new structure
			this.settings.fileMetadataInheritance = {
				enabled: true,
				inheritFromFrontmatter:
					oldConfig.inheritFromFrontmatter ?? true,
				inheritFromFrontmatterForSubtasks:
					oldConfig.inheritFromFrontmatterForSubtasks ?? false,
			};

			// Remove old inheritance settings from project config
			if (this.settings.projectConfig?.metadataConfig) {
				delete (this.settings.projectConfig.metadataConfig as any)
					.inheritFromFrontmatter;
				delete (this.settings.projectConfig.metadataConfig as any)
					.inheritFromFrontmatterForSubtasks;
			}

			// Save the migrated settings
			this.saveSettings();
		}
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

	async activateTimelineSidebarView() {
		const { workspace } = this.app;

		// Check if view is already open
		const existingLeaf = workspace.getLeavesOfType(
			TIMELINE_SIDEBAR_VIEW_TYPE
		)[0];

		if (existingLeaf) {
			// If view is already open, just reveal it
			workspace.revealLeaf(existingLeaf);
			return;
		}

		// Open in the right sidebar
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: TIMELINE_SIDEBAR_VIEW_TYPE });
			workspace.revealLeaf(leaf);
		}
	}

	async triggerViewUpdate() {
		// Update Task Views
		const taskViewLeaves =
			this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
		if (taskViewLeaves.length > 0) {
			for (const leaf of taskViewLeaves) {
				if (leaf.view instanceof TaskView) {
					leaf.view.tasks = this.preloadedTasks;
					leaf.view.triggerViewUpdate();
				}
			}
		}

		// Update Timeline Sidebar Views
		const timelineViewLeaves = this.app.workspace.getLeavesOfType(
			TIMELINE_SIDEBAR_VIEW_TYPE
		);
		if (timelineViewLeaves.length > 0) {
			for (const leaf of timelineViewLeaves) {
				if (leaf.view instanceof TimelineSidebarView) {
					await leaf.view.triggerViewUpdate();
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

	/**
	 * Initialize task manager with version checking and rebuild handling
	 */
	private async initializeTaskManagerWithVersionCheck(): Promise<void> {
		let retryCount = 0;
		const maxRetries = 3;

		while (retryCount < maxRetries) {
			try {
				// Validate version storage integrity first
				const diagnosticInfo =
					await this.versionManager.getDiagnosticInfo();

				if (!diagnosticInfo.canWrite) {
					throw new Error(
						"Cannot write to version storage - storage may be corrupted"
					);
				}

				if (
					!diagnosticInfo.versionValid &&
					diagnosticInfo.previousVersion
				) {
					console.warn(
						"Invalid version data detected, attempting recovery"
					);
					await this.versionManager.recoverFromCorruptedVersion();
				}

				// Check for version changes
				const versionResult =
					await this.versionManager.checkVersionChange();

				if (versionResult.requiresRebuild) {
					console.log(`Task Genius: ${versionResult.rebuildReason}`);

					// Get all supported files for progress tracking
					const allFiles = this.app.vault
						.getFiles()
						.filter(
							(file) =>
								file.extension === "md" ||
								file.extension === "canvas"
						);

					// Start rebuild progress tracking
					this.rebuildProgressManager.startRebuild(
						allFiles.length,
						versionResult.rebuildReason
					);

					// Force clear all caches before rebuild
					if (this.taskManager.persister) {
						try {
							await this.taskManager.persister.clear();
						} catch (clearError) {
							console.warn(
								"Error clearing cache, attempting to recreate storage:",
								clearError
							);
							await this.taskManager.persister.recreate();
						}
					}

					// Set progress manager for the task manager
					this.taskManager.setProgressManager(
						this.rebuildProgressManager
					);

					// Initialize task manager (this will trigger the rebuild)
					await this.taskManager.initialize();

					// Mark rebuild as complete
					const finalTaskCount =
						this.taskManager.getAllTasks().length;
					this.rebuildProgressManager.completeRebuild(finalTaskCount);

					// Mark version as processed
					await this.versionManager.markVersionProcessed();
				} else {
					// No rebuild needed, normal initialization
					await this.taskManager.initialize();
				}

				// If we get here, initialization was successful
				return;
			} catch (error) {
				retryCount++;
				console.error(
					`Error during task manager initialization (attempt ${retryCount}/${maxRetries}):`,
					error
				);

				if (retryCount >= maxRetries) {
					// Final attempt failed, trigger emergency rebuild
					console.error(
						"All initialization attempts failed, triggering emergency rebuild"
					);

					try {
						const emergencyResult =
							await this.versionManager.handleEmergencyRebuild(
								`Initialization failed after ${maxRetries} attempts: ${error.message}`
							);

						// Get all supported files for progress tracking
						const allFiles = this.app.vault
							.getFiles()
							.filter(
								(file) =>
									file.extension === "md" ||
									file.extension === "canvas"
							);

						// Start emergency rebuild
						this.rebuildProgressManager.startRebuild(
							allFiles.length,
							emergencyResult.rebuildReason
						);

						// Force recreate storage
						if (this.taskManager.persister) {
							await this.taskManager.persister.recreate();
						}

						// Set progress manager for the task manager
						this.taskManager.setProgressManager(
							this.rebuildProgressManager
						);

						// Initialize with minimal error handling
						await this.taskManager.initialize();

						// Mark emergency rebuild as complete
						const finalTaskCount =
							this.taskManager.getAllTasks().length;
						this.rebuildProgressManager.completeRebuild(
							finalTaskCount
						);

						// Store current version
						await this.versionManager.markVersionProcessed();

						console.log("Emergency rebuild completed successfully");
						return;
					} catch (emergencyError) {
						console.error(
							"Emergency rebuild also failed:",
							emergencyError
						);
						this.rebuildProgressManager.failRebuild(
							`Emergency rebuild failed: ${emergencyError.message}`
						);
						throw new Error(
							`Task manager initialization failed completely: ${emergencyError.message}`
						);
					}
				} else {
					// Wait before retry
					await new Promise((resolve) =>
						setTimeout(resolve, 1000 * retryCount)
					);
				}
			}
		}
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
