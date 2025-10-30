import {
	addIcon,
	Editor,
	editorInfoField,
	MarkdownView,
	Menu,
	Notice,
	Platform,
	Plugin,
} from "obsidian";
import { taskProgressBarExtension } from "./editor-extensions/ui-widgets/progress-bar-widget";
import { taskTimerExtension } from "./editor-extensions/date-time/task-timer";
import { updateProgressBarInElement } from "./components/features/read-mode/ReadModeProgressBarWidget";
import { applyTaskTextMarks } from "./components/features/read-mode/ReadModeTextMark";
import {
	DEFAULT_SETTINGS,
	TaskProgressBarSettings,
} from "./common/setting-definition";
import { TaskProgressBarSettingTab } from "./setting";
import { EditorView } from "@codemirror/view";
import { autoCompleteParentExtension } from "./editor-extensions/autocomplete/parent-task-updater";
import { taskStatusSwitcherExtension } from "./editor-extensions/task-operations/status-switcher";
import { cycleCompleteStatusExtension } from "./editor-extensions/task-operations/status-cycler";
import {
	updateWorkflowContextMenu,
	workflowExtension,
} from "./editor-extensions/workflow/workflow-handler";
import { workflowDecoratorExtension } from "./editor-extensions/ui-widgets/workflow-decorator";
import { workflowRootEnterHandlerExtension } from "./editor-extensions/workflow/workflow-enter-handler";
import {
	LETTER_PRIORITIES,
	priorityPickerExtension,
	TASK_PRIORITIES,
} from "./editor-extensions/ui-widgets/priority-picker";
import {
	cycleTaskStatusBackward,
	cycleTaskStatusForward,
} from "./commands/taskCycleCommands";
import { moveTaskCommand } from "./commands/taskMover";
import {
	autoMoveCompletedTasksCommand,
	moveCompletedTasksCommand,
	moveIncompletedTasksCommand,
} from "./commands/completedTaskMover";
import {
	convertTaskToWorkflowCommand,
	convertToWorkflowRootCommand,
	createQuickWorkflowCommand,
	duplicateWorkflowCommand,
	showWorkflowQuickActionsCommand,
	startWorkflowHereCommand,
} from "./commands/workflowCommands";
import { datePickerExtension } from "./editor-extensions/date-time/date-picker";
import {
	quickCaptureExtension,
	quickCaptureState,
	toggleQuickCapture,
} from "./editor-extensions/core/quick-capture-panel";
import {
	migrateOldFilterOptions,
	taskFilterExtension,
	taskFilterState,
	toggleTaskFilter,
} from "./editor-extensions/core/task-filter-panel";
import { Task } from "./types/task";
// Import the enhanced QuickCaptureModal and MinimalQuickCaptureModal
import { QuickCaptureModal } from "./components/features/quick-capture/modals/QuickCaptureModalWithSwitch";
import { MinimalQuickCaptureModal } from "./components/features/quick-capture/modals/MinimalQuickCaptureModalWithSwitch";
import { MinimalQuickCaptureSuggest } from "./components/features/quick-capture/suggest/MinimalQuickCaptureSuggest";
import { SuggestManager } from "@/components/ui/suggest";
import { t } from "./translations/helper";
import { TASK_VIEW_TYPE, TaskView } from "./pages/TaskView";
import "./styles/global.css";
import "./styles/setting.css";
import "./styles/view.css";
import "./styles/view-config.css";
import "./styles/task-status.css";
import "./styles/task-selection.css";
import "./styles/quadrant/quadrant.css";
import "./styles/onboarding.css";
import "./styles/universal-suggest.css";
import "./styles/noise.css";
import "./styles/changelog.css";
import {
	TASK_SPECIFIC_VIEW_TYPE,
	TaskSpecificView,
} from "./pages/TaskSpecificView";
import {
	TIMELINE_SIDEBAR_VIEW_TYPE,
	TimelineSidebarView,
} from "./components/features/timeline-sidebar/TimelineSidebarView";
import { getStatusIcon, getTaskGeniusIcon } from "./icon";
import { RewardManager } from "./managers/reward-manager";
import { HabitManager } from "./managers/habit-manager";
import { TaskGeniusIconManager } from "./managers/icon-manager";
import { monitorTaskCompletedExtension } from "./editor-extensions/task-operations/completion-monitor";
import { sortTasksInDocument } from "./commands/sortTaskCommands";
import { taskGutterExtension } from "./editor-extensions/task-operations/gutter-marker";
import { autoDateManagerExtension } from "./editor-extensions/date-time/date-manager";
import { taskMarkCleanupExtension } from "./editor-extensions/task-operations/mark-cleanup";
import { IcsManager } from "./managers/ics-manager";
import { FluentIntegration } from "./components/features/fluent/FluentIntegration";
import { ObsidianUriHandler } from "./utils/ObsidianUriHandler";
import { VersionManager } from "./managers/version-manager";
import { RebuildProgressManager } from "./managers/rebuild-progress-manager";
import DesktopIntegrationManager from "./managers/desktop-integration-manager";
import { OnboardingConfigManager } from "./managers/onboarding-manager";
import { OnCompletionManager } from "./managers/completion-manager";
import { SettingsChangeDetector } from "./services/settings-change-detector";
import {
	ONBOARDING_VIEW_TYPE,
	OnboardingView,
} from "./components/features/onboarding/OnboardingView";
import { registerTaskGeniusBasesViews } from "@/pages/bases/registerBasesViews";
import { TaskTimerExporter } from "./services/timer-export-service";
import { TaskTimerManager } from "./managers/timer-manager";
import { McpServerManager } from "./mcp/McpServerManager";
import { createDataflow } from "./dataflow/createDataflow";
import type { DataflowOrchestrator } from "./dataflow/Orchestrator";
import { WriteAPI } from "./dataflow/api/WriteAPI";
import { Events } from "./dataflow/events/Events";
import {
	installWorkspaceDragMonitor,
	registerRestrictedDnDViewTypes,
} from "./patches/workspace-dnd-patch";
import { FLUENT_TASK_VIEW } from "./pages/FluentTaskView";
import {
	removePriorityAtCursor,
	setPriorityAtCursor,
} from "./utils/task/curosr-priority-utils";
import { QuickCaptureSuggest } from "@/editor-extensions/autocomplete/task-metadata-suggest";
import { WorkspaceManager } from "@/components/features/fluent/managers/WorkspaceManager";
import {
	CHANGELOG_VIEW_TYPE,
	ChangelogView,
} from "./components/features/changelog/ChangelogView";
import { ChangelogManager } from "./managers/changelog-manager";

export default class TaskProgressBarPlugin extends Plugin {
	settings: TaskProgressBarSettings;

	// Dataflow orchestrator instance (primary architecture)
	dataflowOrchestrator?: DataflowOrchestrator;

	// Write API for dataflow architecture
	writeAPI?: WriteAPI;

	// Notification manager (desktop)
	notificationManager?: DesktopIntegrationManager;

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
	quickCaptureSuggest: QuickCaptureSuggest;

	// Global suggest manager
	globalSuggestManager: SuggestManager;

	// Version manager instance
	versionManager: VersionManager;

	// Changelog manager instance
	changelogManager: ChangelogManager;

	// Rebuild progress manager instance
	rebuildProgressManager: RebuildProgressManager;

	// Onboarding manager instance
	onboardingConfigManager: OnboardingConfigManager;
	settingsChangeDetector: SettingsChangeDetector;

	// Preloaded tasks:
	preloadedTasks: Task[] = [];

	// Setting tab
	settingTab: TaskProgressBarSettingTab;

	// Workspace manager instance
	workspaceManager?: WorkspaceManager;

	// Task Genius Icon manager instance
	taskGeniusIconManager: TaskGeniusIconManager;

	// MCP Server manager instance (desktop only)
	mcpServerManager?: McpServerManager;

	// URI handler instance
	uriHandler?: ObsidianUriHandler;

	// OnCompletion manager instance
	onCompletionManager?: OnCompletionManager;

	// fluent Integration instance
	fluentIntegration?: FluentIntegration;

	// Deferred initialization guards
	private coreCommandsRegistered = false;
	private viewsRegistered = false;
	private onboardingViewRegistered = false;
	private viewCommandsRegistered = false;
	private extendedCommandsScheduled = false;
	private editorExtensionsRegistered = false;
	private iconsDeferred = false;

	async onload() {
		console.time("[Task Genius] onload");
		await this.loadSettings();

		// Initialize version manager first
		this.versionManager = new VersionManager(this.app, this);
		this.addChild(this.versionManager);

		this.changelogManager = new ChangelogManager(this);
		this.registerView(
			CHANGELOG_VIEW_TYPE,
			(leaf) => new ChangelogView(leaf, this),
		);

		// Initialize onboarding config manager
		this.onboardingConfigManager = new OnboardingConfigManager(this);
		this.settingsChangeDetector = new SettingsChangeDetector(this);

		// Initialize global suggest manager
		this.globalSuggestManager = new SuggestManager(this.app, this);

		this.workspaceManager = new WorkspaceManager(this);
		this.workspaceManager.ensureDefaultWorkspaceInvariant();

		// Initialize URI handler
		this.uriHandler = new ObsidianUriHandler(this);
		this.uriHandler.register();

		// Initialize rebuild progress manager
		this.rebuildProgressManager = new RebuildProgressManager();

		if (this.settings.enableIndexer && this.settings.enableView) {
			this.loadViews();
		}

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
											}`,
										);
										item.setIcon("arrow-big-up-dash");
										item.onClick(() => {
											setPriorityAtCursor(
												editor,
												priority.emoji,
											);
										});
									});
								}
							},
						);

						submenu.addSeparator();

						// Letter priority commands
						Object.entries(LETTER_PRIORITIES).forEach(
							([key, priority]) => {
								submenu.addItem((item) => {
									item.setTitle(
										`${t("Set priority")}: ${key}`,
									);
									item.setIcon("a-arrow-up");
									item.onClick(() => {
										setPriorityAtCursor(
											editor,
											`[#${key}]`,
										);
									});
								});
							},
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
			}),
		);

		this.app.workspace.onLayoutReady(async () => {
			console.time("[Task Genius] onLayoutReady");

			await this.initializeDeferredStartup();

			// Update workspace leaves when layout is ready
			const deferWorkspaceLeaves =
				this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
			const deferSpecificLeaves = this.app.workspace.getLeavesOfType(
				TASK_SPECIFIC_VIEW_TYPE,
			);
			const deferTaskGeniusLeaves =
				this.app.workspace.getLeavesOfType(FLUENT_TASK_VIEW);
			[
				...deferWorkspaceLeaves,
				...deferSpecificLeaves,
				...deferTaskGeniusLeaves,
			].forEach((leaf) => {
				leaf.loadIfDeferred();
			});
			// Initialize Task Genius Icon Manager
			this.taskGeniusIconManager = new TaskGeniusIconManager(this);
			this.addChild(this.taskGeniusIconManager);

			// Initialize MCP Server Manager (desktop only)
			if (Platform.isDesktopApp) {
				this.mcpServerManager = new McpServerManager(this);
				this.mcpServerManager.initialize();

				// Initialize Notification Manager (desktop only)
				this.notificationManager = new DesktopIntegrationManager(this);
				this.addChild(this.notificationManager);

				// Subscribe to task cache updates to inform notifications
				this.registerEvent(
					this.app.workspace.on(
						Events.TASK_CACHE_UPDATED as any,
						() => this.notificationManager?.onTaskCacheUpdated(),
					),
				);
			}

			// Check if user upgraded from intermediate version and show onboarding
			await this.checkMigrationAndMaybeShowOnboarding();

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

			if (this.settings.habit.enableHabits) {
				this.habitManager = new HabitManager(this);
				this.addChild(this.habitManager);
			}

			// Initialize ICS manager if sources are configured
			if (this.settings.icsIntegration.sources.length > 0) {
				this.icsManager = new IcsManager(
					this.settings.icsIntegration,
					this.settings,
					this,
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
							error,
						);
					});
				}, 1000);
			}

			this.maybeShowChangelog();

			console.timeEnd("[Task Genius] onLayoutReady");
		});

		await this.migratePresetTaskFiltersIfNeeded();

		this.registerCoreCommands();

		console.timeEnd("[Task Genius] onload");
	}

	private async initializeDeferredStartup(): Promise<void> {
		this.registerOnboardingView();

		if (!this.settings.enableIndexer) {
			this.scheduleExtendedCommands();
			return;
		}

		console.time("[Task Genius] initializeIndexer");

		await this.ensureFluentIntegration();

		if (this.settings.enableView) {
			this.registerTaskViews();
			this.installWorkspaceGuards();
			this.registerViewCommands();
			this.deferIconRegistration();
		}

		const dataflowInitialized = await this.initializeDataflowOrchestrator();
		if (!dataflowInitialized) {
			this.scheduleExtendedCommands();
			console.timeEnd("[Task Genius] initializeIndexer");
			return;
		}

		try {
			await this.initializeDataflowWithVersionCheck();
		} catch (error) {
			console.error(
				"[Plugin] Dataflow version check failed during startup:",
				error,
			);
		}

		this.initializeWriteAPI();
		this.initializeOnCompletionManager();

		if (this.settings.rewards.enableRewards) {
			this.initializeRewardManager();
		}

		this.scheduleExtendedCommands();

		console.timeEnd("[Task Genius] initializeIndexer");
	}

	private async ensureFluentIntegration(): Promise<void> {
		if (this.fluentIntegration) {
			return;
		}

		this.fluentIntegration = new FluentIntegration(this);
		await this.fluentIntegration.migrateSettings();
		this.fluentIntegration.register();
	}

	private registerTaskViews(): void {
		if (this.viewsRegistered) {
			return;
		}
		this.viewsRegistered = true;

		this.registerOnboardingView();

		this.registerView(TASK_VIEW_TYPE, (leaf) => new TaskView(leaf, this));

		this.registerView(
			TASK_SPECIFIC_VIEW_TYPE,
			(leaf) => new TaskSpecificView(leaf, this),
		);

		this.registerView(
			TIMELINE_SIDEBAR_VIEW_TYPE,
			(leaf) => new TimelineSidebarView(leaf, this),
		);

		try {
			registerTaskGeniusBasesViews(this);
		} catch (error) {
			console.log("Failed to register Bases views:", error);
		}
	}

	private registerOnboardingView(): void {
		if (this.onboardingViewRegistered) {
			return;
		}
		this.onboardingViewRegistered = true;

		this.registerView(
			ONBOARDING_VIEW_TYPE,
			(leaf) =>
				new OnboardingView(leaf, this, () => {
					console.log("Onboarding completed successfully");
					leaf.detach();
				}),
		);
	}

	private registerViewCommands(): void {
		if (this.viewCommandsRegistered) {
			return;
		}
		this.viewCommandsRegistered = true;

		this.addCommand({
			id: "open-task-genius-view",
			name: t("Open Task Genius view"),
			callback: () => {
				this.activateTaskView();
			},
		});

		this.addCommand({
			id: "open-timeline-sidebar-view",
			name: t("Open Timeline Sidebar"),
			callback: () => {
				this.activateTimelineSidebarView();
			},
		});

		this.addCommand({
			id: "open-task-genius-setup",
			name: t("Open Task Genius Setup"),
			callback: () => {
				this.openOnboardingView();
			},
		});

		this.addCommand({
			id: "open-task-genius-changelog",
			name: t("Open Task Genius changelog"),
			callback: () => {
				if (!this.changelogManager) {
					return;
				}

				const targetVersion =
					this.manifest?.version ||
					this.settings.changelog.lastVersion;

				if (!targetVersion) {
					return;
				}

				const isBeta = targetVersion.toLowerCase().includes("beta");
				this.changelogManager.openChangelog(targetVersion, isBeta);
			},
		});
	}

	private deferIconRegistration(): void {
		if (this.iconsDeferred) {
			return;
		}
		this.iconsDeferred = true;

		const registerIcons = () => {
			addIcon("task-genius", getTaskGeniusIcon());
			addIcon("completed", getStatusIcon("completed"));
			addIcon("inProgress", getStatusIcon("inProgress"));
			addIcon("planned", getStatusIcon("planned"));
			addIcon("abandoned", getStatusIcon("abandoned"));
			addIcon("notStarted", getStatusIcon("notStarted"));

			this.addRibbonIcon(
				"task-genius",
				t("Open Task Genius view"),
				() => {
					this.activateTaskView();
				},
			);
		};

		const idle = (window as any)?.requestIdleCallback;
		if (typeof idle === "function") {
			idle(registerIcons);
		} else {
			setTimeout(registerIcons, 0);
		}
	}

	private installWorkspaceGuards(): void {
		installWorkspaceDragMonitor(this);
		try {
			registerRestrictedDnDViewTypes(FLUENT_TASK_VIEW);
		} catch {}
	}

	private async initializeDataflowOrchestrator(): Promise<boolean> {
		try {
			this.dataflowOrchestrator = await createDataflow(
				this.app,
				this.app.vault,
				this.app.metadataCache,
				this,
				{
					configFileName:
						this.settings.projectConfig?.configFile?.fileName ||
						"project.md",
					searchRecursively:
						this.settings.projectConfig?.configFile
							?.searchRecursively ?? true,
					metadataKey:
						this.settings.projectConfig?.metadataConfig
							?.metadataKey || "project",
					pathMappings:
						this.settings.projectConfig?.pathMappings || [],
					metadataMappings:
						this.settings.projectConfig?.metadataMappings || [],
					defaultProjectNaming: this.settings.projectConfig
						?.defaultProjectNaming || {
						strategy: "filename",
						stripExtension: true,
						enabled: false,
					},
					enhancedProjectEnabled:
						this.settings.projectConfig?.enableEnhancedProject ??
						false,
					metadataConfigEnabled:
						this.settings.projectConfig?.metadataConfig?.enabled ??
						false,
					configFileEnabled:
						this.settings.projectConfig?.configFile?.enabled ??
						false,
					detectionMethods:
						this.settings.projectConfig?.metadataConfig
							?.detectionMethods || [],
				},
			);
			return true;
		} catch (error) {
			console.error(
				"[Plugin] Failed to initialize dataflow orchestrator:",
				error,
			);
			new Notice(
				t("Failed to initialize task system. Please restart Obsidian."),
			);
			this.dataflowOrchestrator = undefined;
			return false;
		}
	}

	private initializeWriteAPI(): void {
		const dataflow = this.dataflowOrchestrator;
		if (!dataflow) {
			return;
		}

		const repository = dataflow.getRepository();

		const getTaskById = async (id: string): Promise<Task | null> => {
			try {
				const task = await repository.getTaskById(id);
				return task ?? null;
			} catch (e) {
				console.warn("Failed to get task from dataflow", e);
				return null;
			}
		};

		this.writeAPI = new WriteAPI(
			this.app,
			this.app.vault,
			this.app.metadataCache,
			this,
			getTaskById,
		);
	}

	private initializeOnCompletionManager(): void {
		if (this.onCompletionManager) {
			return;
		}
		this.onCompletionManager = new OnCompletionManager(this.app, this);
		this.addChild(this.onCompletionManager);
		console.log("[Plugin] OnCompletionManager initialized");
	}

	private initializeRewardManager(): void {
		if (this.rewardManager) {
			return;
		}
		this.rewardManager = new RewardManager(this);
		this.addChild(this.rewardManager);

		this.registerEditorExtension([
			monitorTaskCompletedExtension(this.app, this),
		]);
	}

	private scheduleExtendedCommands(): void {
		if (this.extendedCommandsScheduled) {
			return;
		}
		this.extendedCommandsScheduled = true;

		setTimeout(() => {
			try {
				this.registerCommands();
				this.ensureEditorExtensionsRegistered();
			} catch (error) {
				console.error(
					"[Plugin] Failed registering deferred commands:",
					error,
				);
			}
		}, 100);
	}

	private ensureEditorExtensionsRegistered(): void {
		if (this.editorExtensionsRegistered) {
			return;
		}
		this.editorExtensionsRegistered = true;
		this.registerEditorExt();
	}

	private registerCoreCommands(): void {
		if (this.coreCommandsRegistered) {
			return;
		}
		this.coreCommandsRegistered = true;

		this.addCommand({
			id: "quick-capture",
			name: t("Quick Capture"),
			callback: () => {
				new QuickCaptureModal(this.app, this, undefined, true).open();
			},
		});

		this.addCommand({
			id: "minimal-quick-capture",
			name: t("Minimal Quick Capture"),
			callback: () => {
				new MinimalQuickCaptureModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "quick-file-create",
			name: t("Quick File Create"),
			callback: () => {
				const modal = new QuickCaptureModal(this.app, this, {
					location: "file",
				});
				modal.open();
			},
		});

		this.addCommand({
			id: "toggle-task-filter",
			name: t("Toggle task filter panel"),
			editorCallback: (editor) => {
				const view = editor.cm as EditorView;
				if (!view) {
					return;
				}
				view.dispatch({
					effects: toggleTaskFilter.of(
						!view.state.field(taskFilterState),
					),
				});
			},
		});
	}

	private async migratePresetTaskFiltersIfNeeded(): Promise<void> {
		const presets = this.settings.taskFilter?.presetTaskFilters;
		if (!presets) {
			return;
		}

		console.time("[Task Genius] migratePresetTaskFilters");
		this.settings.taskFilter.presetTaskFilters = presets.map(
			(preset: any) => {
				if (preset.options) {
					preset.options = migrateOldFilterOptions(preset.options);
				}
				return preset;
			},
		);
		await this.saveSettings();
		console.timeEnd("[Task Genius] migratePresetTaskFilters");
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
						false,
					);

					if (changes) {
						new Notice(
							t(
								"Tasks sorted (using settings). Change application needs refinement.",
							),
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
							t("Entire document sorted (using settings)."),
						);
					} else {
						new Notice(
							t("Tasks already sorted or no tasks found."),
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

		if (this.settings.enableIndexer) {
			// // Add command to refresh the task index
			// this.addCommand({
			// 	id: "refresh-task-index",
			// 	name: t("Refresh task index"),
			// 	callback: async () => {
			// 		try {
			// 			new Notice(t("Refreshing task index..."));

			// 			// Check if dataflow is enabled
			// 			if (
			// 				this.settings?.enableIndexer &&
			// 				this.dataflowOrchestrator
			// 			) {
			// 				// Use dataflow orchestrator for refresh
			// 				console.log(
			// 					"[Command] Refreshing task index via dataflow",
			// 				);

			// 				// Re-scan all files to refresh the index
			// 				const files = this.app.vault.getMarkdownFiles();
			// 				const canvasFiles = this.app.vault
			// 					.getFiles()
			// 					.filter((f) => f.extension === "canvas");
			// 				const allFiles = [...files, ...canvasFiles];

			// 				// Process files in batches
			// 				const batchSize = 50;
			// 				for (
			// 					let i = 0;
			// 					i < allFiles.length;
			// 					i += batchSize
			// 				) {
			// 					const batch = allFiles.slice(i, i + batchSize);
			// 					await Promise.all(
			// 						batch.map((file) =>
			// 							(
			// 								this.dataflowOrchestrator as any
			// 							).processFileImmediate(file),
			// 						),
			// 					);
			// 				}

			// 				// Refresh ICS events if available
			// 				const icsSource = (this.dataflowOrchestrator as any)
			// 					.icsSource;
			// 				if (icsSource) {
			// 					await icsSource.refresh();
			// 				}
			// 			}
			// 			// else {
			// 			// 	// Use legacy task manager
			// 			// 	await this.taskManager.initialize();
			// 			// }

			// 			new Notice(t("Task index refreshed"));
			// 		} catch (error) {
			// 			console.error("Failed to refresh task index:", error);
			// 			new Notice(t("Failed to refresh task index"));
			// 		}
			// 	},
			// });

			// Add command to force reindex all tasks by clearing cache
			this.addCommand({
				id: "force-reindex-tasks",
				name: t("Force reindex all tasks"),
				callback: async () => {
					try {
						// Check if dataflow is enabled
						if (
							this.settings?.enableIndexer &&
							this.dataflowOrchestrator
						) {
							// Use dataflow orchestrator for force reindex
							console.log(
								"[Command] Force reindexing via dataflow",
							);
							new Notice(
								t(
									"Clearing task cache and rebuilding index...",
								),
							);

							// Clear all caches and rebuild from scratch
							await this.dataflowOrchestrator.rebuild();

							// Refresh ICS events after rebuild
							const icsSource = (
								this
									.dataflowOrchestrator as DataflowOrchestrator
							).icsSource;
							if (icsSource) {
								await icsSource.refresh();
							}

							new Notice(t("Task index completely rebuilt"));
						} else {
							// No dataflow available
							new Notice(t("Task system not initialized"));
						}
					} catch (error) {
						console.error("Failed to force reindex tasks:", error);
						new Notice(t("Failed to force reindex tasks"));
					}
				},
			});
		}

		// Habit commands
		this.addCommand({
			id: "reindex-habits",
			name: t("Reindex habits"),
			callback: async () => {
				try {
					await this.habitManager?.initializeHabits();
					new Notice(t("Habit index refreshed"));
				} catch (e) {
					console.error("Failed to reindex habits", e);
					new Notice(t("Failed to refresh habit index"));
				}
			},
		});

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
						"allCompleted",
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
						"directChildren",
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
						"all",
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
							"allCompleted",
						);
					},
				});

				this.addCommand({
					id: "auto-move-direct-completed-subtasks",
					name: t(
						"Auto-move direct completed subtasks to default file",
					),
					editorCheckCallback: (checking, editor, ctx) => {
						return autoMoveCompletedTasksCommand(
							checking,
							editor,
							ctx,
							this,
							"directChildren",
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
							"all",
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
						"allIncompleted",
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
						"directIncompletedChildren",
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
							"allIncompleted",
						);
					},
				});

				this.addCommand({
					id: "auto-move-direct-incomplete-subtasks",
					name: t(
						"Auto-move direct incomplete subtasks to default file",
					),
					editorCheckCallback: (checking, editor, ctx) => {
						return autoMoveCompletedTasksCommand(
							checking,
							editor,
							ctx,
							this,
							"directIncompletedChildren",
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
										"Could not open quick capture panel in the current editor",
									),
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
						this,
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
						this,
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
						this,
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
						this,
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
						this,
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
						this,
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

						const jsonData =
							this.taskTimerExporter.exportToJSON(true);

						// Create a blob and download link
						const blob = new Blob([jsonData], {
							type: "application/json",
						});
						const url = URL.createObjectURL(blob);
						const a = document.createElement("a");
						a.href = url;
						a.download = `task-timer-data-${
							new Date().toISOString().split("T")[0]
						}.json`;
						document.body.appendChild(a);
						a.click();
						document.body.removeChild(a);
						URL.revokeObjectURL(url);

						new Notice(
							`Exported ${stats.activeTimers} timer records`,
						);
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
						const input = document.createElement("input");
						input.type = "file";
						input.accept = ".json";

						input.onchange = async (e) => {
							const file = (e.target as HTMLInputElement)
								.files?.[0];
							if (!file) return;

							try {
								const text = await file.text();
								const success =
									this.taskTimerExporter.importFromJSON(text);

								if (success) {
									new Notice(
										"Timer data imported successfully",
									);
								} else {
									new Notice(
										"Failed to import timer data - invalid format",
									);
								}
							} catch (error) {
								console.error(
									"Error importing timer data:",
									error,
								);
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

						const yamlData =
							this.taskTimerExporter.exportToYAML(true);

						// Create a blob and download link
						const blob = new Blob([yamlData], {
							type: "text/yaml",
						});
						const url = URL.createObjectURL(blob);
						const a = document.createElement("a");
						a.href = url;
						a.download = `task-timer-data-${
							new Date().toISOString().split("T")[0]
						}.yaml`;
						document.body.appendChild(a);
						a.click();
						document.body.removeChild(a);
						URL.revokeObjectURL(url);

						new Notice(
							`Exported ${stats.activeTimers} timer records to YAML`,
						);
					} catch (error) {
						console.error(
							"Error exporting timer data to YAML:",
							error,
						);
						new Notice("Failed to export timer data to YAML");
					}
				},
			});

			this.addCommand({
				id: "backup-task-timer-data",
				name: "Create task timer backup",
				callback: async () => {
					try {
						const backupData =
							this.taskTimerExporter.createBackup();

						// Create a blob and download link
						const blob = new Blob([backupData], {
							type: "application/json",
						});
						const url = URL.createObjectURL(blob);
						const a = document.createElement("a");
						a.href = url;
						a.download = `task-timer-backup-${new Date()
							.toISOString()
							.replace(/[:.]/g, "-")}.json`;
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
						message += `Total duration: ${Math.round(
							stats.totalDuration / 60000,
						)} minutes\n`;

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
				this.taskTimerManager = new TaskTimerManager(
					this.settings.taskTimer,
				);
			}
			if (!this.taskTimerExporter) {
				this.taskTimerExporter = new TaskTimerExporter(
					this.taskTimerManager,
				);
			}

			this.registerEditorExtension([taskTimerExtension(this)]);
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
				this,
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

		// Bases views are automatically unregistered by Obsidian when plugin unloads

		// Clean up dataflow orchestrator (experimental)
		if (this.dataflowOrchestrator) {
			this.dataflowOrchestrator.cleanup().catch((error) => {
				console.error(
					"Error cleaning up dataflow orchestrator:",
					error,
				);
			});
			// Set to undefined to prevent any further access
			this.dataflowOrchestrator = undefined;
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
			const versionResult =
				await this.versionManager.checkVersionChange();
			const isFirstInstall = versionResult.versionInfo.isFirstInstall;
			const shouldShowOnboarding =
				this.onboardingConfigManager.shouldShowOnboarding();

			// For existing users with changes, let the view handle the async detection
			// For new users, show onboarding directly
			if (
				(isFirstInstall && shouldShowOnboarding) ||
				(!isFirstInstall &&
					shouldShowOnboarding &&
					this.settingsChangeDetector.hasUserMadeChanges())
			) {
				// Small delay to ensure UI is ready
				this.openOnboardingView();
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

	async closeAllViewsFromTaskGenius() {
		const { workspace } = this.app;
		const v1Leaves = workspace.getLeavesOfType(TASK_VIEW_TYPE);
		v1Leaves.forEach((leaf) => leaf.detach());
		const v2Leaves = workspace.getLeavesOfType(FLUENT_TASK_VIEW);
		v2Leaves.forEach((leaf) => leaf.detach());
		const specificLeaves = workspace.getLeavesOfType(
			TASK_SPECIFIC_VIEW_TYPE,
		);
		specificLeaves.forEach((leaf) => leaf.detach());
		const timelineLeaves = workspace.getLeavesOfType(
			TIMELINE_SIDEBAR_VIEW_TYPE,
		);
		timelineLeaves.forEach((leaf) => leaf.detach());
		const changelogLeaves = workspace.getLeavesOfType(CHANGELOG_VIEW_TYPE);
		changelogLeaves.forEach((leaf) => leaf.detach());
	}

	/**
	 * Compare two semantic version strings
	 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
	 */
	private compareVersions(v1: string, v2: string): number {
		if (v1 === v2) return 0;

		const v1Parts = v1.split(".").map((n) => parseInt(n, 10) || 0);
		const v2Parts = v2.split(".").map((n) => parseInt(n, 10) || 0);

		const maxLength = Math.max(v1Parts.length, v2Parts.length);

		for (let i = 0; i < maxLength; i++) {
			const p1 = v1Parts[i] || 0;
			const p2 = v2Parts[i] || 0;

			if (p1 < p2) return -1;
			if (p1 > p2) return 1;
		}

		return 0;
	}

	/**
	 * Check if user upgraded from 9.8.14 < version < 9.9.0 and show onboarding
	 * This ensures users who upgraded from intermediate versions see the setup guide
	 */
	private async checkMigrationAndMaybeShowOnboarding(): Promise<void> {
		try {
			// Get version info from VersionManager
			const versionResult =
				await this.versionManager.checkVersionChange();
			const previousVersion = versionResult.versionInfo.previous;

			// Get last version from changelog settings
			const lastVersion = this.settings.changelog?.lastVersion || "";

			// Get current version
			const currentVersion = this.manifest?.version;
			if (!currentVersion) {
				return;
			}

			// Check if user upgraded from >9.8.14 and <9.9.0
			// AND hasn't seen the 9.9.0 onboarding yet
			if (
				previousVersion &&
				this.compareVersions(previousVersion, "9.8.14") > 0 &&
				this.compareVersions(previousVersion, "9.9.0") < 0 &&
				lastVersion !== "9.9.0"
			) {
				console.log(
					`[Task Genius] Migration detected: ${previousVersion} -> ${currentVersion}, opening onboarding`,
				);

				// Directly open onboarding view (same pattern as maybeShowChangelog)
				this.openOnboardingView();

				// Mark as shown by updating lastVersion
				this.settings.changelog.lastVersion = currentVersion;
				await this.saveSettings();
			}
		} catch (error) {
			console.error(
				"[Task Genius] Failed to check migration onboarding:",
				error,
			);
		}
	}

	private maybeShowChangelog(): void {
		try {
			if (!this.changelogManager) {
				return;
			}

			const manifestVersion = this.manifest?.version;
			if (!manifestVersion) {
				return;
			}

			const changelogSettings = this.settings.changelog;
			if (!changelogSettings?.enabled) {
				return;
			}

			const lastVersion = changelogSettings.lastVersion || "";
			if (manifestVersion === lastVersion) {
				return;
			}

			const isBeta = manifestVersion.toLowerCase().includes("beta");
			this.changelogManager.openChangelog(manifestVersion, isBeta);
		} catch (error) {
			console.error("[Task Genius] Failed to show changelog:", error);
		}
	}

	async loadSettings() {
		const savedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, savedData);
		this.settings.changelog = Object.assign(
			{
				enabled: true,
				lastVersion: "",
			},
			this.settings.changelog ?? {},
		);
		try {
			console.debug(
				"[Plugin][loadSettings] fileMetadataInheritance (raw):",
				savedData?.fileMetadataInheritance,
			);
			console.debug(
				"[Plugin][loadSettings] fileMetadataInheritance (effective):",
				this.settings.fileMetadataInheritance,
			);
		} catch {}

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
		try {
			console.debug(
				"[Plugin][saveSettings] fileMetadataInheritance:",
				this.settings?.fileMetadataInheritance,
			);
		} catch {}
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
				(v) => v.id === defaultView.id,
			);
			if (!existingView) {
				this.settings.viewConfiguration.push({ ...defaultView });
			}
		});

		await this.saveSettings();
	}

	// Helper method to set priority at cursor position

	private isActivatingView = false;

	async activateTaskView() {
		// Prevent multiple simultaneous activations
		if (this.isActivatingView) {
			return;
		}

		this.isActivatingView = true;
		try {
			const { workspace } = this.app;

			const viewType = this.settings.fluentView?.enableFluent
				? FLUENT_TASK_VIEW
				: TASK_VIEW_TYPE;
			// Check if view is already open
			const existingLeaves = workspace.getLeavesOfType(viewType);

			if (existingLeaves.length > 0) {
				// If view is already open, just reveal the first one
				workspace.revealLeaf(existingLeaves[0]);

				// Close any duplicate views
				for (let i = 1; i < existingLeaves.length; i++) {
					existingLeaves[i].detach();
				}
				return;
			}

			// Otherwise, create a new leaf and open the view
			const leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: viewType });
			await workspace.revealLeaf(leaf);
		} finally {
			this.isActivatingView = false;
		}
	}

	private isActivatingSidebar = false;

	async activateTimelineSidebarView() {
		// Prevent multiple simultaneous activations
		if (this.isActivatingSidebar) {
			return;
		}

		this.isActivatingSidebar = true;
		try {
			const { workspace } = this.app;

			// Check if view is already open
			const existingLeaves = workspace.getLeavesOfType(
				TIMELINE_SIDEBAR_VIEW_TYPE,
			);

			if (existingLeaves.length > 0) {
				// If view is already open, just reveal the first one
				workspace.revealLeaf(existingLeaves[0]);

				// Close any duplicate views
				for (let i = 1; i < existingLeaves.length; i++) {
					existingLeaves[i].detach();
				}
				return;
			}

			// Open in the right sidebar
			const leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: TIMELINE_SIDEBAR_VIEW_TYPE });
				workspace.revealLeaf(leaf);
			}
		} finally {
			this.isActivatingSidebar = false;
		}
	}

	async triggerViewUpdate() {
		// Update Task Views
		const taskViewLeaves =
			this.app.workspace.getLeavesOfType(TASK_VIEW_TYPE);
		if (taskViewLeaves.length > 0) {
			for (const leaf of taskViewLeaves) {
				if (leaf.view instanceof TaskView) {
					// Avoid overwriting existing tasks with empty preloadedTasks during settings updates
					if (
						Array.isArray(this.preloadedTasks) &&
						this.preloadedTasks.length > 0
					) {
						leaf.view.tasks = this.preloadedTasks;
					}
					leaf.view.triggerViewUpdate();
				}
			}
		}

		// Update Timeline Sidebar Views
		const timelineViewLeaves = this.app.workspace.getLeavesOfType(
			TIMELINE_SIDEBAR_VIEW_TYPE,
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
	 * Initialize dataflow with version checking and rebuild handling
	 */
	private async initializeDataflowWithVersionCheck(): Promise<void> {
		if (!this.dataflowOrchestrator) {
			console.error("Dataflow orchestrator not available");
			return;
		}

		try {
			// Validate version storage integrity first
			const diagnosticInfo =
				await this.versionManager.getDiagnosticInfo();

			if (!diagnosticInfo.canWrite) {
				throw new Error(
					"Cannot write to version storage - storage may be corrupted",
				);
			}

			if (
				!diagnosticInfo.versionValid &&
				diagnosticInfo.previousVersion
			) {
				console.warn(
					"Invalid version data detected, attempting recovery",
				);
				await this.versionManager.recoverFromCorruptedVersion();
			}

			// Check for version changes
			const versionResult =
				await this.versionManager.checkVersionChange();

			if (versionResult.requiresRebuild) {
				console.log(
					`Task Genius (Dataflow): ${versionResult.rebuildReason}`,
				);

				// Get all supported files for progress tracking
				const allFiles = this.app.vault
					.getFiles()
					.filter(
						(file) =>
							file.extension === "md" ||
							file.extension === "canvas",
					);

				// Start rebuild progress tracking
				this.rebuildProgressManager.startRebuild(
					allFiles.length,
					versionResult.rebuildReason,
				);

				// After dataflow rebuild, refresh habits to keep in sync
				try {
					await this.habitManager?.initializeHabits();
				} catch (e) {
					console.warn("Failed to refresh habits after rebuild", e);
				}

				// Trigger dataflow rebuild
				await this.dataflowOrchestrator.rebuild();

				// Get final task count from dataflow
				const queryAPI = this.dataflowOrchestrator.getQueryAPI();
				const allTasks = await queryAPI.getAllTasks();
				const finalTaskCount = allTasks.length;

				// Mark rebuild as complete
				this.rebuildProgressManager.completeRebuild(finalTaskCount);

				// Mark version as processed
				await this.versionManager.markVersionProcessed();
			} else {
				// No rebuild needed, dataflow already initialized during creation
				console.log(
					"Task Genius (Dataflow): No rebuild needed, using existing cache",
				);
			}
		} catch (error) {
			console.error(
				"Error during dataflow initialization with version check:",
				error,
			);

			// Trigger emergency rebuild for dataflow
			try {
				const emergencyResult =
					await this.versionManager.handleEmergencyRebuild(
						`Dataflow initialization failed: ${error.message}`,
					);

				// Get all supported files for progress tracking
				const allFiles = this.app.vault
					.getFiles()
					.filter(
						(file) =>
							file.extension === "md" ||
							file.extension === "canvas",
					);

				// Start emergency rebuild
				this.rebuildProgressManager.startRebuild(
					allFiles.length,
					emergencyResult.rebuildReason,
				);

				// Force rebuild dataflow
				await this.dataflowOrchestrator.rebuild();

				// Get final task count
				const queryAPI = this.dataflowOrchestrator.getQueryAPI();
				const allTasks = await queryAPI.getAllTasks();
				const finalTaskCount = allTasks.length;

				// Mark emergency rebuild as complete
				this.rebuildProgressManager.completeRebuild(finalTaskCount);

				// Store current version
				await this.versionManager.markVersionProcessed();

				console.log(
					"Emergency dataflow rebuild completed successfully",
				);
			} catch (emergencyError) {
				console.error(
					"Emergency dataflow rebuild failed:",
					emergencyError,
				);
				throw emergencyError;
			}
		}
	}

	/**
	 * Initialize task manager with version checking and rebuild handling
	 * @deprecated This method is no longer used as TaskManager has been removed
	 * This method is kept for reference only and will be removed in future versions
	 */
	private async initializeTaskManagerWithVersionCheck(): Promise<void> {
		// This method is deprecated and should not be called
		console.warn(
			"initializeTaskManagerWithVersionCheck is deprecated and should not be used",
		);
		return Promise.resolve();
	}
}
