import {
	Decoration,
	DecorationSet,
	EditorView,
	WidgetType,
} from "@codemirror/view";
import { EditorState, Range, StateField, Transaction, Facet } from "@codemirror/state";
import { MetadataCache, editorInfoField, editorEditorField, MarkdownView } from "obsidian";
import type TaskProgressBarPlugin from "../index";
import { TaskTimerSettings } from "../common/setting-definition";
import { TaskTimerMetadataDetector } from "../utils/TaskTimerMetadataDetector";
import { TaskTimerManager, TimerState } from "../utils/TaskTimerManager";
import { TaskTimerFormatter } from "../utils/TaskTimerFormatter";
import { taskStatusChangeAnnotation } from "./taskStatusSwitcher";
import "../styles/task-timer.css";

// Extension configuration for StateField access
interface TaskTimerConfig {
	settings: TaskTimerSettings;
	metadataCache: MetadataCache;
	plugin?: TaskProgressBarPlugin; // Add plugin reference
}

// Define a Facet to pass configuration to the StateField
const taskTimerConfigFacet = Facet.define<TaskTimerConfig, TaskTimerConfig>({
	combine: (values) => values[0] || null
});

/**
 * Widget for displaying task timer controls above parent tasks
 */
class TaskTimerWidget extends WidgetType {
	private dom: HTMLElement | null = null;
	private updateInterval: number | null = null;
	private timerState: TimerState | null = null;
	private currentTaskStatus: string | null = null;

	constructor(
		private readonly state: EditorState,
		private readonly settings: TaskTimerSettings,
		private readonly timerManager: TaskTimerManager,
		private readonly lineFrom: number,
		private readonly lineTo: number,
		private readonly filePath: string,
		private readonly plugin?: TaskProgressBarPlugin,
		private existingBlockId?: string
	) {
		super();
		// If we have a block ID, try to load existing timer state
		if (this.existingBlockId) {
			this.loadTimerState();
		}
	}

	eq(other: TaskTimerWidget) {
		// Get current task status from the line
		const line = this.state.doc.lineAt(this.lineFrom);
		const currentStatus = this.getTaskStatus(line.text);

		// Force widget recreation if task status has changed
		if (this.currentTaskStatus && this.currentTaskStatus !== currentStatus) {
			console.log("[TaskTimer] Task status changed from", this.currentTaskStatus, "to", currentStatus);
			return false;
		}

		// Force widget recreation if task becomes completed
		if (currentStatus === 'completed') {
			console.log("[TaskTimer] Task is completed, forcing widget removal");
			return false;
		}

		return (
			this.lineFrom === other.lineFrom &&
			this.lineTo === other.lineTo &&
			this.filePath === other.filePath &&
			this.existingBlockId === other.existingBlockId
		);
	}

	toDOM(): HTMLElement {
		if (this.dom) {
			this.refreshUI();
			return this.dom;
		}

		// Create a simple text-based widget
		this.dom = createDiv({cls: 'task-timer-widget'});

		// Get and store current task status
		const line = this.state.doc.lineAt(this.lineFrom);
		this.currentTaskStatus = this.getTaskStatus(line.text);

		// Add debug info
		console.log("[TaskTimer] Creating widget for line", this.lineFrom, "status:", this.currentTaskStatus, "blockId:", this.existingBlockId);

		// Load timer state if we have a block ID
		if (this.existingBlockId) {
			this.loadTimerState();
		} else {
			this.updateTimerState();
		}

		this.createContent();
		return this.dom;
	}

	/**
	 * Get task status from line text
	 */
	private getTaskStatus(lineText: string): 'pending' | 'in-progress' | 'completed' | 'cancelled' {
		// Extract the task marker
		const match = lineText.match(/\[([^\]]+)\]/);
		if (!match) return 'pending';

		const marker = match[1];
		const statuses = this.plugin?.settings?.taskStatuses || {
			completed: "x|X",
			inProgress: ">|/",
			abandoned: "-",
			planned: "?",
			notStarted: " "
		};

		// Check against configured markers
		if (statuses.completed.split('|').includes(marker)) {
			return 'completed';
		} else if (statuses.inProgress.split('|').includes(marker)) {
			return 'in-progress';
		} else if (statuses.abandoned.split('|').includes(marker)) {
			return 'cancelled';
		} else if (statuses.notStarted.split('|').includes(marker) || marker === ' ') {
			return 'pending';
		} else {
			// Default to pending for unknown markers
			return 'pending';
		}
	}

	/**
	 * Create content based on timer state
	 */
	private createContent(): void {
		if (!this.dom) return;

		this.dom.empty();

		// Always get fresh task status from current document
		const line = this.state.doc.lineAt(this.lineFrom);
		const taskStatus = this.getTaskStatus(line.text);
		this.currentTaskStatus = taskStatus; // Update stored status
		console.log("[TaskTimer] createContent - current task status:", taskStatus);

		// Don't show timer for completed tasks
		if (taskStatus === 'completed') {
			return;
		}

		// If we have a block ID and a timer state, show the timer regardless of task marker
		if (this.existingBlockId && this.timerState && this.timerState.status !== 'idle') {
			console.log("[TaskTimer] Found active timer for task with block ID");
			// Show timer based on existing state
			// Get total duration from timer manager
			const taskId = this.getTaskId();
			const elapsedMs = taskId ? this.timerManager.getCurrentDuration(taskId) : 0;

			const formattedTime = TaskTimerFormatter.formatDuration(elapsedMs, this.settings.timeFormat);
			const timeSpan = this.dom.createSpan();

			// Show paused state clearly
			if (this.timerState.status === 'paused') {
				timeSpan.setText(`⏸ ${formattedTime} (Paused) `);
			} else {
				timeSpan.setText(`⏱ ${formattedTime} `);
			}

			// Add action links based on timer state
			if (this.timerState.status === 'running') {
				this.addActionLink('Pause', () => this.pauseTimer());
				this.dom.appendText(' | ');
				this.addActionLink('Complete', () => this.completeTimer());
				// Start real-time updates
				this.startRealtimeUpdates();
			} else if (this.timerState.status === 'paused') {
				this.addActionLink('Resume', () => this.resumeTimer());
				this.dom.appendText(' | ');
				this.addActionLink('Complete', () => this.completeTimer());
			}
			this.dom.appendText(' | ');
			this.addActionLink('Reset', () => this.resetTimer());
			return;
		}

		// For in-progress tasks with existing block IDs
		if (taskStatus === 'in-progress' && this.existingBlockId) {
			// If there's an existing timer state, use it
			if (this.timerState && this.timerState.status !== 'idle') {
				// Show existing timer state
				// Get total duration from timer manager
				const taskId = this.getTaskId();
				const elapsedMs = taskId ? this.timerManager.getCurrentDuration(taskId) : 0;

				const formattedTime = TaskTimerFormatter.formatDuration(elapsedMs, this.settings.timeFormat);
				const timeSpan = this.dom.createSpan();

				// Show paused state clearly
				if (this.timerState.status === 'paused') {
					timeSpan.setText(`⏸ ${formattedTime} (Paused) `);
				} else {
					timeSpan.setText(`⏱ ${formattedTime} `);
				}

				// Add action links based on timer state
				if (this.timerState.status === 'running') {
					this.addActionLink('Pause', () => this.pauseTimer());
					this.dom.appendText(' | ');
					this.addActionLink('Complete', () => this.completeTimer());
				} else if (this.timerState.status === 'paused') {
					this.addActionLink('Resume', () => this.resumeTimer());
					this.dom.appendText(' | ');
					this.addActionLink('Complete', () => this.completeTimer());
				}
				this.dom.appendText(' | ');
				this.addActionLink('Reset', () => this.resetTimer());
			} else {
				// Task is in-progress with block ID but no timer state - auto-start timer
				console.log("[TaskTimer] In-progress task with block ID but no timer state, auto-starting");
				this.startTimer();
				// Timer will be shown after state update
				return;
			}
		} else if (!this.timerState || this.timerState.status === 'idle') {
			// Create text-style start button
			const startSpan = this.dom.createSpan({cls: 'task-timer-start'});
			startSpan.setText('Start Task');
			startSpan.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				console.log("[TaskTimer] Start button clicked");
				this.startTimer();
			});
		} else {
			// Show elapsed time
			// Get total duration from timer manager
			const taskId = this.getTaskId();
			const elapsedMs = taskId ? this.timerManager.getCurrentDuration(taskId) : 0;

			const formattedTime = TaskTimerFormatter.formatDuration(elapsedMs, this.settings.timeFormat);
			const timeSpan = this.dom.createSpan();

			// Show paused state clearly
			if (this.timerState.status === 'paused') {
				timeSpan.setText(`⏸ ${formattedTime} (Paused) `);
			} else {
				timeSpan.setText(`⏱ ${formattedTime} `);
			}

			// Add action links
			if (this.timerState.status === 'running') {
				this.addActionLink('Pause', () => this.pauseTimer());
				this.dom.appendText(' | ');
				this.addActionLink('Complete', () => this.completeTimer());
			} else if (this.timerState.status === 'paused') {
				this.addActionLink('Resume', () => this.resumeTimer());
				this.dom.appendText(' | ');
				this.addActionLink('Complete', () => this.completeTimer());
			}
			this.dom.appendText(' | ');
			this.addActionLink('Reset', () => this.resetTimer());
		}
	}

	/**
	 * Add clickable action link
	 */
	private addActionLink(text: string, action: () => void): void {
		if (!this.dom) return;

		const link = this.dom.createSpan({cls: 'task-timer-action'});
		link.setText(text);
		link.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			action();
		});
	}

	/**
	 * Get the CodeMirror EditorView from various sources
	 */
	private getEditorView(): EditorView | null {
		// Try to get from state field first
		const view = this.state.field(editorEditorField, false);
		if (view) {
			console.log("[TaskTimer] Got EditorView from editorEditorField");
			return view;
		}

		// Try from the plugin's app workspace
		if (this.plugin?.app) {
			const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView?.editor) {
				const editor = activeView.editor;
				// For CM6 editor
				if ((editor as any).cm) {
					console.log("[TaskTimer] Got EditorView from activeView.editor.cm");
					return (editor as any).cm;
				}
				// Some versions might have it as cm6
				if ((editor as any).cm6) {
					console.log("[TaskTimer] Got EditorView from activeView.editor.cm6");
					return (editor as any).cm6;
				}
			}
		}

		// Try from the app's active editor
		const app = (window as any).app;
		const activeLeaf = app?.workspace?.activeLeaf;

		if (activeLeaf?.view?.editor) {
			const editor = activeLeaf.view.editor;
			// Check for CodeMirror 6
			if (editor.cm) {
				console.log("[TaskTimer] Got EditorView from editor.cm");
				return editor.cm;
			}
			if (editor.cm6) {
				console.log("[TaskTimer] Got EditorView from editor.cm6");
				return editor.cm6;
			}
		}

		// Try to find the view through the widget's DOM element
		if (this.dom && this.dom.parentElement) {
			const cmContent = this.dom.closest('.cm-content');
			if (cmContent) {
				const cmEditor = cmContent.closest('.cm-editor');
				if (cmEditor && (cmEditor as any).cmView) {
					console.log("[TaskTimer] Got EditorView from DOM element");
					return (cmEditor as any).cmView.view;
				}
			}
		}

		console.error("[TaskTimer] Could not find EditorView through any method");
		return null;
	}

	/**
	 * Update task status marker in the document
	 */
	private updateTaskStatus(newStatus: string): boolean {
		const line = this.state.doc.lineAt(this.lineFrom);
		const lineText = line.text;

		// Check if this line contains a task
		const taskRegex = /^[\s|\t]*([-*+]|\d+\.)\s+\[[^]]*\]/;
		const match = lineText.match(taskRegex);

		if (!match) {
			// Not a task line
			return false;
		}

		// Replace task status marker - match any character(s) inside brackets
		const updatedText = lineText.replace(/\[([^\]]*)\]/, newStatus);

		console.log(`[TaskTimer] updateTaskStatus - original: "${lineText}"`);
		console.log(`[TaskTimer] updateTaskStatus - newStatus: "${newStatus}"`);
		console.log(`[TaskTimer] updateTaskStatus - updated: "${updatedText}"`);

		if (updatedText === lineText) {
			// No change needed
			console.log("[TaskTimer] updateTaskStatus - no change needed");
			return false;
		}

		// Get the editor view to use CodeMirror's dispatch
		const view = this.getEditorView();
		if (!view) {
			// Fallback to Obsidian API if no CodeMirror view
			const activeView = this.plugin?.app?.workspace?.getActiveViewOfType(MarkdownView);
			if (!activeView?.editor || !activeView.file) {
				return false;
			}

			// Check if we're updating the correct file
			if (activeView.file.path !== this.filePath) {
				return false;
			}

			// Update the line using Obsidian's editor API
			const lineNum = line.number - 1; // Convert to 0-based
			activeView.editor.setLine(lineNum, updatedText);
			return true;
		}

		// Use CodeMirror dispatch with annotation to prevent cycleCompleteStatus interference
		view.dispatch({
			changes: {
				from: line.from,
				to: line.to,
				insert: updatedText
			},
			annotations: taskStatusChangeAnnotation.of("taskTimer")
		});

		return true;
	}

	/**
	 * Start timer
	 */
	private startTimer(): void {
		try {
			let taskId = this.getTaskId();

			// If no existing block ID, generate one and insert it
			if (!taskId) {
				const blockId = this.timerManager.generateBlockId(this.settings.blockRefPrefix);

				// Get EditorView using our helper method
				const view = this.getEditorView();
				console.log("[TaskTimer] EditorView:", view);

				if (view) {
					const line = this.state.doc.lineAt(this.lineFrom);
					const lineText = line.text;
					const blockRef = ` ^${blockId}`;

					// Also update task status to in-progress
					const inProgressMarkers = (this.plugin?.settings?.taskStatuses?.inProgress || ">|/").split('|');
					const inProgressMarker = inProgressMarkers[0] || '/';
					const updatedText = lineText
						.replace(/\[([^\]]+)\]/, `[${inProgressMarker}]`)
						.trimEnd() + blockRef;

					console.log(`[TaskTimer] Updating line ${line.number}`);
					console.log("[TaskTimer] Original text:", lineText);
					console.log("[TaskTimer] Updated text:", updatedText);

					try {
						// Replace the entire line with updated status and block reference
						view.dispatch({
							changes: {
								from: line.from,
								to: line.to,
								insert: updatedText
							},
							annotations: taskStatusChangeAnnotation.of("taskTimer")
						});

						// Update our local reference
						this.existingBlockId = blockId;
						taskId = `${this.filePath}#^${blockId}`;

						// Start the timer after inserting block ID
						console.log(`[TaskTimer] Starting timer for newly created task: ${taskId}`);
						this.timerManager.startTimer(this.filePath, blockId);
						this.startRealtimeUpdates();
						this.updateTimerState();

						// Decorations will refresh automatically after text change
					} catch (err) {
						console.error("[TaskTimer] Error dispatching change:", err);
						return;
					}
				} else {
					console.error("[TaskTimer] No EditorView available");
					// Fallback: try to get editor from editorInfoField
					const editorInfo = this.state.field(editorInfoField);
					console.log("[TaskTimer] Trying editorInfo:", editorInfo);

					if (editorInfo?.editor) {
						const line = this.state.doc.lineAt(this.lineFrom);
						const lineText = line.text;

						// Also update task status to in-progress
						const inProgressMarkers = (this.plugin?.settings?.taskStatuses?.inProgress || ">|/").split('|');
						const inProgressMarker = inProgressMarkers[0] || '/';
						const updatedText = lineText
							.replace(/\[([^\]]+)\]/, `[${inProgressMarker}]`)
							.trimEnd() + ` ^${blockId}`;

						try {
							editorInfo.editor.replaceRange(updatedText,
								{line: line.number - 1, ch: 0},
								{line: line.number - 1, ch: lineText.length}
							);

							this.existingBlockId = blockId;
							taskId = `${this.filePath}#^${blockId}`;

							// Start timer for the fallback path as well
							console.log(`[TaskTimer] Starting timer for newly created task (fallback): ${taskId}`);
							this.timerManager.startTimer(this.filePath, blockId);
							this.startRealtimeUpdates();
							this.updateTimerState();
							this.refreshUI();
						} catch (err) {
							console.error("[TaskTimer] Fallback also failed:", err);
							return;
						}
					}
					return;
				}
			}

			// If we already have a task ID, just update the status if needed
			if (taskId && this.existingBlockId) {
				// Check current task status
				const line = this.state.doc.lineAt(this.lineFrom);
				const currentStatus = this.getTaskStatus(line.text);

				// Keep status update for start timer - it makes sense to mark as in-progress
				// This is different from pause/resume where status doesn't necessarily reflect timer state
				if (currentStatus !== 'in-progress') {
					const inProgressMarkers = (this.plugin?.settings?.taskStatuses?.inProgress || ">|/").split('|');
					const inProgressMarker = inProgressMarkers[0] || '/';
					this.updateTaskStatus(`[${inProgressMarker}]`);
				}

				// Start or resume the timer
				console.log(`[TaskTimer] Starting/resuming timer for task: ${taskId}`);
				this.timerManager.startTimer(this.filePath, this.existingBlockId);
				this.updateTimerState();
				this.refreshUI(); // This will start real-time updates if needed
				console.log("[TaskTimer] Timer started successfully");
			}
		} catch (error) {
			console.error("[TaskTimer] Error starting timer:", error);
			this.updateTimerState();
		}
	}

	/**
	 * Pause timer
	 */
	private pauseTimer(): void {
		try {
			// First check if the task is completed - should not pause completed tasks
			const line = this.state.doc.lineAt(this.lineFrom);
			const currentStatus = this.getTaskStatus(line.text);
			if (currentStatus === 'completed') {
				console.warn("[TaskTimer] Cannot pause a completed task");
				return;
			}

			const taskId = this.getTaskId();
			if (!taskId) {
				console.warn("[TaskTimer] Cannot pause timer - no task ID found");
				return;
			}

			console.log(`[TaskTimer] Pausing timer for task: ${taskId}`);
			this.timerManager.pauseTimer(taskId);

			// DON'T update task status - just pause the timer
			// The timer state is stored in localStorage and will persist
			// This avoids conflicts with autoDateManager and other plugins
			console.log("[TaskTimer] Timer paused without changing task status");

			// Stop updates immediately
			this.stopRealtimeUpdates();
			this.updateTimerState();
			this.refreshUI(); // Refresh UI to show paused state
			console.log("[TaskTimer] Timer paused successfully");
		} catch (error) {
			console.error("[TaskTimer] Error pausing timer:", error);
			this.updateTimerState();
		}
	}

	/**
	 * Resume timer
	 */
	private resumeTimer(): void {
		try {
			// First check if the task is completed - should not resume completed tasks
			const line = this.state.doc.lineAt(this.lineFrom);
			const currentStatus = this.getTaskStatus(line.text);
			if (currentStatus === 'completed') {
				console.warn("[TaskTimer] Cannot resume a completed task");
				return;
			}

			const taskId = this.getTaskId();
			if (!taskId) {
				console.warn("[TaskTimer] Cannot resume timer - no task ID found");
				return;
			}

			console.log(`[TaskTimer] Resuming timer for task: ${taskId}`);
			this.timerManager.resumeTimer(taskId);

			// DON'T update task status - just resume the timer
			// The user can manually change status if needed
			console.log("[TaskTimer] Timer resumed without changing task status");

			this.startRealtimeUpdates();
			this.updateTimerState();
			this.refreshUI(); // Refresh UI to show running state immediately
			console.log("[TaskTimer] Timer resumed successfully");
		} catch (error) {
			console.error("[TaskTimer] Error resuming timer:", error);
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

			// DON'T update task status - just reset the timer
			// Let user manually manage task status
			console.log("[TaskTimer] Timer reset without changing task status");

			this.stopRealtimeUpdates();
			this.updateTimerState();
			this.refreshUI(); // Refresh UI to show reset state
			console.log("[TaskTimer] Timer reset successfully");
		} catch (error) {
			console.error("[TaskTimer] Error resetting timer:", error);
			this.updateTimerState();
		}
	}

	/**
	 * Complete timer and update task
	 */
	private completeTimer(): void {
		try {
			// First check if the task is already completed
			const line = this.state.doc.lineAt(this.lineFrom);
			const currentStatus = this.getTaskStatus(line.text);
			if (currentStatus === 'completed') {
				console.warn("[TaskTimer] Task is already completed");
				return;
			}

			const taskId = this.getTaskId();
			if (!taskId) {
				console.warn("[TaskTimer] Cannot complete timer - no task ID found");
				return;
			}

			console.log(`[TaskTimer] Completing timer for task: ${taskId}`);

			// Get the timer state before completing
			const timerState = this.timerManager.getTimerState(taskId);
			if (!timerState) {
				console.warn("[TaskTimer] No timer state found for task:", taskId);
				return;
			}

			// Complete the timer and get the formatted duration
			const formattedDuration = this.timerManager.completeTimer(taskId);

			// Get EditorView to modify document
			const view = this.getEditorView();

			if (view) {
				const line = this.state.doc.lineAt(this.lineFrom);
				const lineText = line.text;

				// Create the updated text using configured completed marker
				const completedMarkers = (this.plugin?.settings?.taskStatuses?.completed || "x|X").split('|');
				const completedMarker = completedMarkers[0] || 'x';

				// First update the task status
				let updatedText = lineText.replace(/\[([^\]]+)\]/, `[${completedMarker}]`);

				// Check for block reference ID at the end
				const blockRefMatch = updatedText.match(/\s*\^[\w-]+\s*$/);
				if (blockRefMatch) {
					// Insert duration before the block reference ID
					const insertPosition = updatedText.length - blockRefMatch[0].length;
					updatedText = updatedText.slice(0, insertPosition) + ` (${formattedDuration})` + updatedText.slice(insertPosition);
				} else {
					// No block reference, add duration at the end
					updatedText = updatedText.replace(/\s*$/, ` (${formattedDuration})`);
				}

				console.log("[TaskTimer] Completing task - original:", lineText);
				console.log("[TaskTimer] Completing task - updated:", updatedText);

				try {
					// Use dispatch to replace the entire line
					view.dispatch({
						changes: {
							from: line.from,
							to: line.to,
							insert: updatedText
						}
					});
				} catch (err) {
					console.error("[TaskTimer] Error updating task:", err);
					// Try fallback
					const editorInfo = this.state.field(editorInfoField);
					if (editorInfo?.editor) {
						editorInfo.editor.replaceRange(updatedText,
							{line: line.number - 1, ch: 0},
							{line: line.number - 1, ch: lineText.length}
						);
					}
				}
			} else {
				console.error("[TaskTimer] No view available to complete task");
				return;
			}

			this.stopRealtimeUpdates();
			this.updateTimerState();
			console.log(`[TaskTimer] Timer completed successfully: ${formattedDuration}`);
		} catch (error) {
			console.error("[TaskTimer] Error completing timer:", error);
			this.updateTimerState();
		}
	}

	/**
	 * Load timer state from localStorage
	 */
	private loadTimerState(): void {
		if (!this.existingBlockId) return;

		// Use TaskTimerManager to get the timer state
		const taskId = this.getTaskId();
		if (taskId) {
			this.timerState = this.timerManager.getTimerState(taskId);
			if (this.timerState) {
				console.log("[TaskTimer] Loaded timer state for", this.filePath, this.existingBlockId, ":", this.timerState);
				// If timer is running, start real-time updates immediately
				if (this.timerState.status === 'running') {
					this.startRealtimeUpdates();
				}
			}
		}
	}

	/**
	 * Update timer state from localStorage
	 */
	private updateTimerState(): void {
		const taskId = this.getTaskId();
		if (taskId) {
			this.timerState = this.timerManager.getTimerState(taskId);
		}
	}

	/**
	 * Get task ID for this widget
	 */
	private getTaskId(): string | null {
		if (this.existingBlockId) {
			// Use the same format as TaskTimerManager.getStorageKey
			return `taskTimer_${this.filePath}#${this.existingBlockId}`;
		}
		return null;
	}

	/**
	 * Start real-time updates for running timer
	 */
	private startRealtimeUpdates(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
		}

		this.updateInterval = window.setInterval(() => {
			this.createContent(); // Update the entire content
		}, 1000); // Update every second
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
	 * Refresh the entire UI (used when state changes significantly)
	 */
	private refreshUI(): void {
		if (!this.dom) return;

		// Reload timer state if we have a block ID
		if (this.existingBlockId) {
			this.loadTimerState();
		} else {
			this.updateTimerState();
		}
		this.createContent();
	}

	destroy() {
		this.stopRealtimeUpdates();
		if (this.dom) {
			this.dom.remove();
			this.dom = null;
		}
	}
}

/**
 * StateField for managing task timer decorations
 * This handles block-level decorations properly in CodeMirror
 */
const taskTimerStateField = StateField.define<DecorationSet>({
	create(state: EditorState): DecorationSet {
		return createTaskTimerDecorations(state);
	},
	update(decorations: DecorationSet, transaction: Transaction): DecorationSet {
		// Check if this is an undo/redo operation
		const isUndoRedo = transaction.isUserEvent("undo") || transaction.isUserEvent("redo");

		// Recreate decorations on doc changes, state effects, or undo/redo
		if (transaction.docChanged || transaction.effects.length > 0 || isUndoRedo) {
			// Monitor all task status changes, not just undo/redo
			if (transaction.docChanged) {
				handleTaskStatusChange(transaction);
			}
			return createTaskTimerDecorations(transaction.state);
		}
		return decorations;
	},
	provide: (field: StateField<DecorationSet>) => EditorView.decorations.from(field)
});

/**
 * Create task timer decorations for the current state
 */
function createTaskTimerDecorations(state: EditorState): DecorationSet {
	// Get configuration from facet
	const timerConfig = state.facet(taskTimerConfigFacet);
	console.log("[TaskTimer] Creating decorations, timerConfig:", timerConfig);

	if (!timerConfig?.settings?.enabled) {
		console.log("[TaskTimer] Timer not enabled or no config");
		return Decoration.none;
	}

	// Get editor info to access app and file information
	const editorInfo = state.field(editorInfoField);
	if (!editorInfo?.app) {
		console.log("[TaskTimer] No editor info or app");
		return Decoration.none;
	}

	const file = editorInfo.app.workspace.getActiveFile();
	if (!file) {
		console.log("[TaskTimer] No active file");
		return Decoration.none;
	}

	console.log("[TaskTimer] Processing file:", file.path);

	const metadataDetector = new TaskTimerMetadataDetector(
		timerConfig.settings,
		timerConfig.metadataCache
	);

	if (!metadataDetector.isTaskTimerEnabled(file)) {
		console.log("[TaskTimer] Timer not enabled for file:", file.path);
		return Decoration.none;
	}

	console.log("[TaskTimer] Timer enabled for file, processing...");

	const timerManager = new TaskTimerManager(timerConfig.settings);
	const decorations: Range<Decoration>[] = [];
	const doc = state.doc;

	console.log("[TaskTimer] Document has", doc.lines, "lines");

	// Process all lines in the document
	for (let i = 1; i <= doc.lines; i++) {
		const line = doc.line(i);
		const lineText = line.text;

		// Check if this line contains a task
		if (isTaskLine(lineText)) {
			console.log("[TaskTimer] Found task line:", lineText.trim());

			// Check if this task has any subtasks (not just immediate next line)
			const currentIndent = lineText.match(/^(\s*)/)?.[1].length || 0;
			let hasSubtasks = false;

			// Look ahead for subtasks with greater indentation
			for (let j = i + 1; j <= doc.lines; j++) {
				const checkLine = doc.line(j);
				const checkLineText = checkLine.text;
				const checkIndent = checkLineText.match(/^(\s*)/)?.[1].length || 0;

				// If we hit a line with same or less indentation, stop checking
				if (checkLineText.trim() && checkIndent <= currentIndent) {
					break;
				}

				// If we find a task line with greater indentation, this is a parent
				if (checkIndent > currentIndent && isTaskLine(checkLineText)) {
					hasSubtasks = true;
					break;
				}
			}

			if (hasSubtasks) {
				// Check task status - only skip completed tasks without existing timers
				const taskStatusMatch = lineText.match(/^\s*[-*+]\s+\[([^\]]+)\]/);
				if (taskStatusMatch) {
					const statusChar = taskStatusMatch[1];
					const taskStatuses = timerConfig?.plugin?.settings?.taskStatuses || {
						completed: "x|X",
						abandoned: "-"
					};

					// Skip completed tasks only
					const completedMarkers = taskStatuses.completed.split('|');

					if (completedMarkers.includes(statusChar)) {
						console.log("[TaskTimer] Skipping completed task at line", i);
						continue;
					}

					// For abandoned tasks, check if they have an existing block ID with timer data
					const abandonedMarkers = taskStatuses.abandoned.split('|');
					if (abandonedMarkers.includes(statusChar)) {
						const blockId = extractBlockRef(lineText);
						if (!blockId) {
							console.log("[TaskTimer] Skipping abandoned task without block ID at line", i);
							continue;
						}
						// If abandoned task has a block ID, let it continue to show timer
						console.log("[TaskTimer] Abandoned task with block ID found, checking for timer state");
					}
				}

				console.log("[TaskTimer] Found parent task with subtasks at line", i);
				// Extract existing block reference if present
				const existingBlockId = extractBlockRef(lineText);

				// Create block-level timer widget decoration
				const timerDeco = Decoration.widget({
					widget: new TaskTimerWidget(
						state,
						timerConfig.settings,
						timerManager,
						line.from,
						line.to,
						file.path,
						timerConfig.plugin,
						existingBlockId
					),
					side: -1, // Place before the line
					block: true // This is now allowed in StateField
				});

				// Add decoration at the start of the line (this will appear above the task)
				decorations.push(timerDeco.range(line.from));
				console.log("[TaskTimer] Added timer decoration for line:", i);
			}
		}
	}

	console.log("[TaskTimer] Created", decorations.length, "timer decorations");
	return Decoration.set(decorations, true);
}

/**
 * Helper functions
 */
function isTaskLine(lineText: string): boolean {
	// Match any character inside square brackets
	return /^\s*[-*+]\s+\[[^\]]*\]/.test(lineText);
}


function extractBlockRef(lineText: string): string | undefined {
	// Match block reference anywhere in the line, not just at the end
	const match = lineText.match(/\^([a-zA-Z0-9\-_]+)/);
	return match ? match[1] : undefined;
}

/**
 * Handle timer state updates when task status changes
 * This monitors all status changes and automatically manages timers accordingly
 */
function handleTaskStatusChange(transaction: Transaction): void {
	// Get configuration from transaction state
	const timerConfig = transaction.state.facet(taskTimerConfigFacet);
	if (!timerConfig?.settings?.enabled || !timerConfig.plugin) {
		return;
	}

	const editorInfo = transaction.state.field(editorInfoField);
	if (!editorInfo?.app) {
		return;
	}

	const file = editorInfo.app.workspace.getActiveFile();
	if (!file) {
		return;
	}

	const timerManager = new TaskTimerManager(timerConfig.settings);
	const doc = transaction.state.doc;

	// Check each changed line for task status changes
	transaction.changes.iterChangedRanges((fromA: number, toA: number, fromB: number, toB: number) => {
		const startLine = doc.lineAt(fromB).number;
		const endLine = doc.lineAt(toB).number;

		for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
			if (lineNum > doc.lines) continue;

			const line = doc.line(lineNum);
			const lineText = line.text;

			// Check if this is a task line
			if (!isTaskLine(lineText)) continue;

			// Extract block reference
			const blockId = extractBlockRef(lineText);
			if (!blockId) continue;

			// Check task status
			const statusMatch = lineText.match(/^\s*[-*+]\s+\[([^\]]+)\]/);
			if (!statusMatch) continue;

			const statusChar = statusMatch[1];
			const taskStatuses = timerConfig?.plugin?.settings?.taskStatuses || {
				completed: "x|X",
				inProgress: ">|/",
				abandoned: "-",
				notStarted: " "
			};

			// Determine what to do based on the new status
			const inProgressMarkers = taskStatuses.inProgress.split('|');
			const abandonedMarkers = taskStatuses.abandoned.split('|');
			const completedMarkers = taskStatuses.completed.split('|');
			const notStartedMarkers = taskStatuses.notStarted.split('|');

			const taskId = `taskTimer_${file.path}#${blockId}`;
			const existingTimer = timerManager.getTimerState(taskId);

			console.log(`[TaskTimer] Status change detected: "${statusChar}" for task ${taskId}`);
			console.log(`[TaskTimer] Existing timer:`, existingTimer);

			if (inProgressMarkers.includes(statusChar)) {
				// Task is now in progress
				if (!existingTimer || existingTimer.status === 'idle') {
					console.log("[TaskTimer] Status -> In Progress: Starting new timer");
					timerManager.startTimer(file.path, blockId);
				} else if (existingTimer.status === 'paused') {
					console.log("[TaskTimer] Status -> In Progress: Resuming paused timer");
					timerManager.resumeTimer(taskId);
				} else if (existingTimer.status === 'running') {
					console.log("[TaskTimer] Status -> In Progress: Timer already running");
				}
			} else if (abandonedMarkers.includes(statusChar)) {
				// Task is now abandoned - pause timer if running
				if (existingTimer && existingTimer.status === 'running') {
					console.log("[TaskTimer] Status -> Abandoned: Pausing running timer");
					timerManager.pauseTimer(taskId);
				} else if (existingTimer && existingTimer.status === 'paused') {
					console.log("[TaskTimer] Status -> Abandoned: Timer already paused");
				}
			} else if (completedMarkers.includes(statusChar)) {
				// Task is completed - stop and save timer
				if (existingTimer && (existingTimer.status === 'running' || existingTimer.status === 'paused')) {
					console.log("[TaskTimer] Status -> Completed: Stopping timer and saving time");
					// Stop timer but preserve the elapsed time
					timerManager.pauseTimer(taskId);
				}
			} else if (notStartedMarkers.includes(statusChar)) {
				// Task is reset to not started - reset timer
				if (existingTimer) {
					console.log("[TaskTimer] Status -> Not Started: Resetting timer");
					timerManager.resetTimer(taskId);
				}
			}
		}
	});
}


/**
 * Main task timer extension function
 * Creates a StateField-based extension for proper block decorations
 */
export function taskTimerExtension(
	plugin: TaskProgressBarPlugin
) {
	// Create configuration object
	const config: TaskTimerConfig = {
		settings: plugin.settings.taskTimer,
		metadataCache: plugin.app.metadataCache,
		plugin
	};

	// Return both the facet configuration and the state field
	return [
		taskTimerConfigFacet.of(config),
		taskTimerStateField
	];
}
