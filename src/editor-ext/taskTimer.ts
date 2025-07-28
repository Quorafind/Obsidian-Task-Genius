import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { EditorState, Range } from "@codemirror/state";
import { TFile, App, MetadataCache } from "obsidian";
import { foldable, syntaxTree, tokenClassNodeProp } from "@codemirror/language";
import { RegExpCursor } from "./regexp-cursor";
import { TaskTimerSettings } from "../common/setting-definition";
import { TaskTimerMetadataDetector } from "../utils/TaskTimerMetadataDetector";
import { TaskTimerManager, TimerState } from "../utils/TaskTimerManager";
import { TaskTimerFormatter } from "../utils/TaskTimerFormatter";
import "../styles/task-timer.css";

interface TextRange {
	from: number;
	to: number;
}

/**
 * Widget for displaying task timer controls above parent tasks
 */
class TaskTimerWidget extends WidgetType {
	private dom: HTMLElement | null = null;
	private updateInterval: number | null = null;
	private timerState: TimerState | null = null;

	constructor(
		private readonly app: App,
		private readonly settings: TaskTimerSettings,
		private readonly view: EditorView,
		private readonly timerManager: TaskTimerManager,
		private readonly lineFrom: number,
		private readonly lineTo: number,
		private readonly filePath: string,
		private readonly existingBlockId?: string
	) {
		super();
	}

	eq(other: TaskTimerWidget) {
		return (
			this.lineFrom === other.lineFrom &&
			this.lineTo === other.lineTo &&
			this.filePath === other.filePath &&
			this.existingBlockId === other.existingBlockId
		);
	}

	/**
	 * Extract existing block reference from task line
	 */
	private extractBlockRef(lineText: string): string | null {
		const blockRefMatch = lineText.match(/\^(timer-[a-zA-Z0-9-]+)$/);
		return blockRefMatch ? blockRefMatch[1] : null;
	}

	/**
	 * Get task ID for timer management
	 */
	private getTaskId(): string {
		const line = this.view.state.doc.lineAt(this.lineFrom);
		const lineText = this.view.state.doc.sliceString(line.from, line.to);
		const blockId = this.extractBlockRef(lineText) || this.existingBlockId;
		
		if (blockId) {
			return this.timerManager.getTimerByFileAndBlock(this.filePath, blockId)?.taskId || "";
		}
		return "";
	}

	/**
	 * Update timer state and refresh UI
	 */
	private updateTimerState(): void {
		const taskId = this.getTaskId();
		if (taskId) {
			this.timerState = this.timerManager.getTimerState(taskId);
		} else {
			this.timerState = null;
		}
		this.refreshUI();
	}

	/**
	 * Start or resume timer
	 */
	private async startTimer(): Promise<void> {
		try {
			const line = this.view.state.doc.lineAt(this.lineFrom);
			const lineText = this.view.state.doc.sliceString(line.from, line.to);
			let blockId = this.extractBlockRef(lineText);

			console.log(`[TaskTimer] Starting timer for task at line ${this.lineFrom}, file: ${this.filePath}`);

			// If no block reference exists, create one and insert it
			if (!blockId) {
				blockId = this.timerManager.startTimer(this.filePath);
				
				if (!blockId) {
					console.error("[TaskTimer] Failed to generate block ID for timer");
					throw new Error("Failed to generate timer block ID");
				}
				
				// Insert block reference at the end of the task line
				const insertPos = line.to;
				const blockRef = ` ^${blockId}`;
				
				try {
					this.view.dispatch({
						changes: { from: insertPos, insert: blockRef }
					});
					console.log(`[TaskTimer] Successfully inserted block reference: ${blockRef}`);
				} catch (dispatchError) {
					console.error("[TaskTimer] Failed to insert block reference:", dispatchError);
					// Clean up the timer that was created
					this.timerManager.removeTimer(this.timerManager.getStorageKey(this.filePath, blockId));
					throw dispatchError;
				}
			} else {
				// Resume existing timer
				console.log(`[TaskTimer] Resuming existing timer with block ID: ${blockId}`);
				this.timerManager.startTimer(this.filePath, blockId);
			}

			// Start real-time updates
			this.startRealtimeUpdates();
			this.updateTimerState();
			
			console.log("[TaskTimer] Timer started successfully");
		} catch (error) {
			console.error("[TaskTimer] Critical error starting timer:", error);
			// Show user-friendly error message
			if (error.message?.includes("block ID")) {
				console.error("[TaskTimer] Block ID generation failed - this may indicate localStorage issues");
			}
			// Ensure we clean up any partial state
			this.stopRealtimeUpdates();
			this.updateTimerState();
		}
	}

	/**
	 * Pause timer
	 */
	private pauseTimer(): void {
		try {
			const taskId = this.getTaskId();
			if (!taskId) {
				console.warn("[TaskTimer] Cannot pause timer - no task ID found");
				return;
			}
			
			console.log(`[TaskTimer] Pausing timer for task: ${taskId}`);
			this.timerManager.pauseTimer(taskId);
			this.stopRealtimeUpdates();
			this.updateTimerState();
			console.log("[TaskTimer] Timer paused successfully");
		} catch (error) {
			console.error("[TaskTimer] Error pausing timer:", error);
			// Ensure UI state is updated even if pause failed
			this.updateTimerState();
		}
	}

	/**
	 * Resume timer
	 */
	private resumeTimer(): void {
		try {
			const taskId = this.getTaskId();
			if (!taskId) {
				console.warn("[TaskTimer] Cannot resume timer - no task ID found");
				return;
			}
			
			console.log(`[TaskTimer] Resuming timer for task: ${taskId}`);
			this.timerManager.resumeTimer(taskId);
			this.startRealtimeUpdates();
			this.updateTimerState();
			console.log("[TaskTimer] Timer resumed successfully");
		} catch (error) {
			console.error("[TaskTimer] Error resuming timer:", error);
			// Ensure UI state is updated even if resume failed
			this.stopRealtimeUpdates();
			this.updateTimerState();
		}
	}

	/**
	 * Reset timer
	 */
	private resetTimer(): void {
		try {
			const taskId = this.getTaskId();
			if (!taskId) {
				console.warn("[TaskTimer] Cannot reset timer - no task ID found");
				return;
			}
			
			console.log(`[TaskTimer] Resetting timer for task: ${taskId}`);
			this.timerManager.resetTimer(taskId);
			this.updateTimerState();
			console.log("[TaskTimer] Timer reset successfully");
		} catch (error) {
			console.error("[TaskTimer] Error resetting timer:", error);
			// Ensure UI state is updated even if reset failed
			this.updateTimerState();
		}
	}

	/**
	 * Complete timer and update task
	 */
	private async completeTimer(): Promise<void> {
		try {
			const taskId = this.getTaskId();
			if (!taskId) {
				console.warn("[TaskTimer] Cannot complete timer - no task ID found");
				return;
			}

			console.log(`[TaskTimer] Completing timer for task: ${taskId}`);

			// Get formatted duration
			const formattedDuration = this.timerManager.completeTimer(taskId);
			
			if (!formattedDuration) {
				console.error("[TaskTimer] Failed to get formatted duration from timer manager");
				throw new Error("Failed to complete timer - no duration returned");
			}
			
			// Find the task line and update it
			const line = this.view.state.doc.lineAt(this.lineFrom);
			const lineText = this.view.state.doc.sliceString(line.from, line.to);
			
			console.log(`[TaskTimer] Original task text: ${lineText}`);
			
			// Validate that this is actually a task line
			if (!/\[(.)\]/.test(lineText)) {
				console.error("[TaskTimer] Line does not appear to be a task - aborting completion");
				throw new Error("Invalid task format - cannot complete timer");
			}
			
			// Mark task as completed and add time
			let updatedText = lineText.replace(/\[(.)\]/, '[x]');
			
			// Insert formatted time before block reference if it exists
			const blockRefMatch = updatedText.match(/(\s\^timer-[a-zA-Z0-9-]+)$/);
			if (blockRefMatch) {
				updatedText = updatedText.replace(blockRefMatch[1], ` ${formattedDuration}${blockRefMatch[1]}`);
			} else {
				updatedText += ` ${formattedDuration}`;
			}

			console.log(`[TaskTimer] Updated task text: ${updatedText}`);

			try {
				// Apply changes
				this.view.dispatch({
					changes: { from: line.from, to: line.to, insert: updatedText }
				});
				console.log("[TaskTimer] Successfully updated task with completion time");
			} catch (dispatchError) {
				console.error("[TaskTimer] Failed to update task text:", dispatchError);
				// If we can't update the text, we need to restore the timer
				console.log("[TaskTimer] Attempting to restore timer state due to text update failure");
				// Note: This is complex to implement safely, so we'll log the issue
				throw new Error("Failed to update task text - timer state may be inconsistent");
			}

			this.stopRealtimeUpdates();
			this.updateTimerState();
			console.log("[TaskTimer] Timer completed successfully");
		} catch (error) {
			console.error("[TaskTimer] Critical error completing timer:", error);
			// Ensure we stop real-time updates and refresh UI state
			this.stopRealtimeUpdates();
			this.updateTimerState();
			
			// Log specific error scenarios for debugging
			if (error.message?.includes("duration")) {
				console.error("[TaskTimer] Duration calculation failed - may indicate localStorage corruption");
			} else if (error.message?.includes("task format")) {
				console.error("[TaskTimer] Task format validation failed - line may not be a valid task");
			} else if (error.message?.includes("text update")) {
				console.error("[TaskTimer] Text update failed - document may be read-only or corrupted");
			}
		}
	}

	/**
	 * Start real-time updates for running timer
	 */
	private startRealtimeUpdates(): void {
		this.stopRealtimeUpdates();
		
		// Use a longer interval to reduce performance impact
		// Update every 5 seconds instead of every second for better performance
		this.updateInterval = window.setInterval(() => {
			// Only update if the widget is still visible and timer is running
			if (this.dom && this.timerState?.status === 'running') {
				this.refreshTimeDisplay();
			} else {
				// Stop updates if conditions are no longer met
				this.stopRealtimeUpdates();
			}
		}, 5000);
	}

	/**
	 * Stop real-time updates
	 */
	private stopRealtimeUpdates(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
	}

	/**
	 * Get current timer duration for display
	 */
	private getCurrentDuration(): number {
		const taskId = this.getTaskId();
		return taskId ? this.timerManager.getCurrentDuration(taskId) : 0;
	}

	/**
	 * Format duration for display
	 */
	private formatDuration(duration: number): string {
		return TaskTimerFormatter.formatForContext(duration, 'compact');
	}

	/**
	 * Create timer control buttons
	 */
	private createButtons(container: HTMLElement): void {
		const buttonsContainer = container.createEl("div", { cls: "task-timer-buttons" });

		if (!this.timerState) {
			// Show start button
			const startBtn = buttonsContainer.createEl("button", {
				cls: "task-timer-button start",
				text: "Start Task"
			});
			startBtn.addEventListener("click", () => this.startTimer());
		} else {
			// Show buttons based on timer state
			if (this.timerState.status === 'running') {
				// Pause button
				const pauseBtn = buttonsContainer.createEl("button", {
					cls: "task-timer-button pause",
					text: "Pause"
				});
				pauseBtn.addEventListener("click", () => this.pauseTimer());
			} else if (this.timerState.status === 'paused') {
				// Resume button
				const resumeBtn = buttonsContainer.createEl("button", {
					cls: "task-timer-button resume",
					text: "Resume"
				});
				resumeBtn.addEventListener("click", () => this.resumeTimer());
			}

			// Reset button (always available when timer exists)
			const resetBtn = buttonsContainer.createEl("button", {
				cls: "task-timer-button reset",
				text: "Reset"
			});
			resetBtn.addEventListener("click", () => this.resetTimer());

			// Complete button (always available when timer exists)
			const completeBtn = buttonsContainer.createEl("button", {
				cls: "task-timer-button complete",
				text: "Complete"
			});
			completeBtn.addEventListener("click", () => this.completeTimer());
		}
	}

	/**
	 * Create timer display
	 */
	private createTimeDisplay(container: HTMLElement): void {
		if (this.timerState && (this.timerState.status === 'running' || this.timerState.status === 'paused')) {
			const currentDuration = this.getCurrentDuration();
			const formattedTime = this.formatDuration(currentDuration);
			
			const display = container.createEl("div", {
				cls: `task-timer-display ${this.timerState.status === 'running' ? 'running' : ''}`,
				text: formattedTime
			});

			// Add accessibility attributes
			display.setAttribute("aria-label", `Timer: ${formattedTime}`);
		}
	}

	/**
	 * Refresh only the time display (performance optimization)
	 */
	private refreshTimeDisplay(): void {
		if (!this.dom || !this.timerState) return;
		
		// Find existing time display element
		const timeDisplay = this.dom.querySelector('.task-timer-display') as HTMLElement;
		if (timeDisplay && (this.timerState.status === 'running' || this.timerState.status === 'paused')) {
			const currentDuration = this.getCurrentDuration();
			const formattedTime = this.formatDuration(currentDuration);
			
			// Only update if the text actually changed to avoid unnecessary DOM manipulation
			if (timeDisplay.textContent !== formattedTime) {
				timeDisplay.textContent = formattedTime;
				timeDisplay.setAttribute("aria-label", `Timer: ${formattedTime}`);
			}
		}
	}

	/**
	 * Refresh the entire UI (used for state changes)
	 */
	private refreshUI(): void {
		if (this.dom) {
			// Clear existing content
			this.dom.empty();
			
			// Add status class
			this.dom.className = `task-timer-widget ${this.timerState?.status || 'idle'}`;
			
			// Recreate UI elements
			this.createTimeDisplay(this.dom);
			this.createButtons(this.dom);
		}
	}

	toDOM(): HTMLElement {
		if (this.dom) {
			this.refreshUI();
			return this.dom;
		}

		// Create the main container
		this.dom = createDiv("task-timer-widget");
		
		// Initialize timer state
		this.updateTimerState();
		
		// Create UI elements
		this.createTimeDisplay(this.dom);
		this.createButtons(this.dom);

		// Start real-time updates if timer is running
		if (this.timerState?.status === 'running') {
			this.startRealtimeUpdates();
		}

		return this.dom;
	}

	destroy(): void {
		this.stopRealtimeUpdates();
		if (this.dom) {
			this.dom.remove();
			this.dom = null;
		}
	}

	ignoreEvent(): boolean {
		return false;
	}
}

/**
 * Task Timer View Plugin
 */
export function taskTimerExtension(
	app: App,
	settings: TaskTimerSettings,
	metadataCache: MetadataCache
) {
	return ViewPlugin.fromClass(
		class {
			timerDecorations: DecorationSet = Decoration.none;
			private metadataDetector: TaskTimerMetadataDetector;
			private timerManager: TaskTimerManager;
			private lastUpdateTime: number = 0;
			private cachedFileEnabled: boolean | null = null;
			private cachedFilePath: string | null = null;
			private readonly UPDATE_THROTTLE_MS = 500; // Throttle updates to improve performance

			constructor(public view: EditorView) {
				this.metadataDetector = new TaskTimerMetadataDetector(settings, metadataCache);
				this.timerManager = new TaskTimerManager(settings);
				
				let { timers } = this.getDeco(view);
				this.timerDecorations = timers;
			}

			update(update: ViewUpdate) {
				// Throttle updates to improve performance
				const now = Date.now();
				if (now - this.lastUpdateTime < this.UPDATE_THROTTLE_MS) {
					return;
				}

				// Only update if document changed or viewport changed significantly
				if (update.docChanged || update.viewportChanged) {
					// Reset file cache if document changed
					if (update.docChanged) {
						this.cachedFileEnabled = null;
						this.cachedFilePath = null;
					}

					let { timers } = this.getDeco(update.view);
					this.timerDecorations = timers;
					this.lastUpdateTime = now;
				}
			}

			getDeco(view: EditorView): { timers: DecorationSet } {
				if (!settings.enabled) {
					return { timers: Decoration.none };
				}

				// Get current file with caching
				const file = this.getCurrentFile();
				if (!file) {
					return { timers: Decoration.none };
				}

				// Use cached result if file hasn't changed
				if (this.cachedFilePath === file.path && this.cachedFileEnabled !== null) {
					if (!this.cachedFileEnabled) {
						return { timers: Decoration.none };
					}
				} else {
					// Update cache
					this.cachedFilePath = file.path;
					this.cachedFileEnabled = this.metadataDetector.isTaskTimerEnabled(file);
					
					if (!this.cachedFileEnabled) {
						return { timers: Decoration.none };
					}
				}

				let { state } = view;
				let timerDecos: Range<Decoration>[] = [];

				// Process only visible ranges for better performance
				for (let part of view.visibleRanges) {
					// Skip very small ranges to avoid unnecessary processing
					if (part.to - part.from < 10) {
						continue;
					}

					try {
						// Find parent tasks (tasks with subtasks)
						let taskCursor = new RegExpCursor(
							state.doc,
							"^[\\t|\\s]*([-*+]|\\d+\\.)\\s\\[(.)\\]",
							{},
							part.from,
							part.to
						);

						this.processParentTasks(taskCursor, timerDecos, view, file);
					} catch (err) {
						console.debug("Error processing task timer decorations:", err);
						continue;
					}
				}

				return {
					timers: Decoration.set(timerDecos.sort((a, b) => a.from - b.from))
				};
			}

			/**
			 * Process parent tasks and add timer widgets
			 */
			private processParentTasks(
				cursor: RegExpCursor,
				decorations: Range<Decoration>[],
				view: EditorView,
				file: TFile
			): void {
				let processedCount = 0;
				const MAX_WIDGETS_PER_UPDATE = 20; // Limit widgets per update for performance
				
				while (!cursor.next().done && processedCount < MAX_WIDGETS_PER_UPDATE) {
					let { from } = cursor.value;
					const linePos = view.state.doc.lineAt(from)?.from;

					// Don't add timers in code blocks or frontmatter
					const syntaxNode = syntaxTree(view.state).resolveInner(linePos + 1);
					const nodeProps = syntaxNode.type.prop(tokenClassNodeProp);
					const excludedSection = [
						"hmd-codeblock",
						"hmd-frontmatter",
					].find((token) => nodeProps?.split(" ").includes(token));

					if (excludedSection) continue;

					const line = view.state.doc.lineAt(linePos);
					const lineText = view.state.doc.sliceString(line.from, line.to);

					// Quick regex check first (more efficient than complex checks)
					if (!/^[\s|\t]*([-*+]|\d+\.)\s\[(.)\]/.test(lineText)) {
						continue;
					}

					// Check if this task has subtasks (is foldable) - use cached calculation if possible
					const range = this.calculateRangeForTransform(view.state, line.to);
					if (!range || range.from >= range.to) {
						continue;
					}

					// Lightweight check for subtasks - only check first few lines of range
					const rangeText = view.state.doc.sliceString(range.from, Math.min(range.to, range.from + 500));
					const hasSubTasks = this.hasSubTasks(rangeText, lineText);
					
					if (!hasSubTasks) {
						continue;
					}

					// Extract existing block reference if present (cached in line text)
					const existingBlockId = this.extractBlockRef(lineText);

					// Create timer widget decoration
					let timerDeco = Decoration.widget({
						widget: new TaskTimerWidget(
							app,
							settings,
							view,
							this.timerManager,
							line.from,
							line.to,
							file.path,
							existingBlockId
						),
						side: -1, // Place before the line
						block: true // Make it a block-level widget
					});

					// Add decoration at the start of the line (above the task)
					decorations.push(timerDeco.range(line.from, line.from));
					processedCount++;
				}
			}

			/**
			 * Check if a task has subtasks
			 */
			private hasSubTasks(rangeText: string, parentLineText: string): boolean {
				const lines = rangeText.split('\n');
				if (lines.length <= 1) return false;

				// Get parent indentation
				const parentIndent = parentLineText.match(/^[\s|\t]*/)?.[0] || "";
				
				// Look for child tasks or list items
				for (let i = 1; i < lines.length; i++) {
					const line = lines[i].trim();
					if (!line) continue;

					const lineIndent = lines[i].match(/^[\s|\t]*/)?.[0] || "";
					
					// If this line has more indentation than parent, it's a child
					if (lineIndent.length > parentIndent.length) {
						// Check if it's a task or list item
						if (/^([-*+]|\d+\.)\s/.test(line)) {
							return true;
						}
					}
				}

				return false;
			}

			/**
			 * Extract block reference from task line
			 */
			private extractBlockRef(lineText: string): string | null {
				const blockRefMatch = lineText.match(/\^(timer-[a-zA-Z0-9-]+)$/);
				return blockRefMatch ? blockRefMatch[1] : null;
			}

			/**
			 * Calculate foldable range for a task (reused from progressBarWidget)
			 */
			private calculateRangeForTransform(
				state: EditorState,
				pos: number
			): TextRange | null {
				const line = state.doc.lineAt(pos);
				const foldRange = foldable(state, line.from, line.to);

				if (!foldRange) {
					return null;
				}

				return { from: line.from, to: foldRange.to };
			}

			/**
			 * Get current file from editor
			 */
			private getCurrentFile(): TFile | null {
				const activeLeaf = app.workspace.activeLeaf;
				if (!activeLeaf || activeLeaf.view.getViewType() !== "markdown") {
					return null;
				}

				// @ts-ignore - Access file from markdown view
				return activeLeaf.view.file || null;
			}

			/**
			 * Update settings for all components
			 */
			updateSettings(newSettings: TaskTimerSettings): void {
				this.metadataDetector.updateSettings(newSettings);
				this.timerManager.updateSettings(newSettings);
				
				// Refresh decorations
				let { timers } = this.getDeco(this.view);
				this.timerDecorations = timers;
			}
		},
		{
			provide: (plugin) => [
				EditorView.decorations.of(
					(v) => v.plugin(plugin)?.timerDecorations || Decoration.none
				),
			],
		}
	);
}