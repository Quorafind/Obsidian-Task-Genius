import {
	editorInfoField,
	HoverParent,
	HoverPopover,
	MarkdownRenderer,
	Plugin,
	Editor,
	Menu,
} from "obsidian";
import { taskProgressBarExtension } from "./editor-ext/widget";
import { updateProgressBarInElement } from "./components/readModeWidget";
import { applyTaskTextMarks } from "./components/readModeTextMark";
import {
	DEFAULT_SETTINGS,
	TaskProgressBarSettings,
	TaskProgressBarSettingTab,
} from "./setting";
import { EditorView } from "@codemirror/view";
import { autoCompleteParentExtension } from "./editor-ext/autoCompleteParent";
import { taskStatusSwitcherExtension } from "./editor-ext/taskStatusSwitcher";
import { cycleCompleteStatusExtension } from "./editor-ext/cycleCompleteStatus";
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
import { datePickerExtension } from "./editor-ext/datePicker";

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

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new TaskProgressBarSettingTab(this.app, this));
		this.registerEditorExtension([
			taskProgressBarExtension(this.app, this),
		]);
		this.settings.enableTaskStatusSwitcher &&
			this.settings.enableCustomTaskMarks &&
			this.registerEditorExtension([
				taskStatusSwitcherExtension(this.app, this),
			]);
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
			updateProgressBarInElement({
				plugin: this,
				element: el,
				ctx: ctx,
			});
		});

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

		// Add command for cycling task status forward
		this.addCommand({
			id: "cycle-task-status-forward",
			name: "Cycle task status forward",
			editorCheckCallback: (checking, editor, ctx) => {
				return cycleTaskStatusForward(checking, editor, ctx, this);
			},
		});

		// Add command for cycling task status backward
		this.addCommand({
			id: "cycle-task-status-backward",
			name: "Cycle task status backward",
			editorCheckCallback: (checking, editor, ctx) => {
				return cycleTaskStatusBackward(checking, editor, ctx, this);
			},
		});

		// Add priority keyboard shortcuts commands
		if (this.settings.enablePriorityKeyboardShortcuts) {
			// Emoji priority commands
			Object.entries(TASK_PRIORITIES).forEach(([key, priority]) => {
				if (key !== "none") {
					this.addCommand({
						id: `set-priority-${key}`,
						name: `Set ${priority.text}`,
						editorCallback: (editor) => {
							this.setPriorityAtCursor(editor, priority.emoji);
						},
					});
				}
			});

			// Letter priority commands
			Object.entries(LETTER_PRIORITIES).forEach(([key, priority]) => {
				this.addCommand({
					id: `set-priority-letter-${key}`,
					name: `Set priority ${key}`,
					editorCallback: (editor) => {
						this.setPriorityAtCursor(editor, `[#${key}]`);
					},
				});
			});

			// Remove priority command
			this.addCommand({
				id: "remove-priority",
				name: "Remove priority",
				editorCallback: (editor) => {
					this.removePriorityAtCursor(editor);
				},
			});
		}

		// Add command for moving tasks
		this.addCommand({
			id: "move-task-to-file",
			name: "Move task to another file",
			editorCheckCallback: (checking, editor, ctx) => {
				return moveTaskCommand(checking, editor, this);
			},
		});

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				if (this.settings.enablePriorityKeyboardShortcuts) {
					menu.addItem((item) => {
						item.setTitle("Set priority");
						item.setIcon("list-ordered");
						// @ts-ignore
						const submenu = item.setSubmenu() as Menu;
						// Emoji priority commands
						Object.entries(TASK_PRIORITIES).forEach(
							([key, priority]) => {
								if (key !== "none") {
									submenu.addItem((item) => {
										item.setTitle(`Set ${priority.text}`);
										item.setIcon("arrow-big-up-dash");
										item.onClick(() => {
											this.setPriorityAtCursor(
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
									item.setTitle(`Set priority ${key}`);
									item.setIcon("a-arrow-up");
									item.onClick(() => {
										this.setPriorityAtCursor(
											editor,
											`[#${key}]`
										);
									});
								});
							}
						);

						// Remove priority command
						submenu.addItem((item) => {
							item.setTitle("Remove Priority");
							item.setIcon("list-x");
							// @ts-ignore
							item.setWarning(true);
							item.onClick(() => {
								this.removePriorityAtCursor(editor);
							});
						});
					});
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
		});
	}

	onunload() {}

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

	// Helper method to set priority at cursor position
	setPriorityAtCursor(editor: Editor, priority: string) {
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
	removePriorityAtCursor(editor: Editor) {
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
					to:
						lineStart +
						(match.index || 0) +
						(match[0]?.length || 0),
					insert: "",
				},
				annotations: [priorityChangeAnnotation.of(true)],
			});
		}
	}
}
