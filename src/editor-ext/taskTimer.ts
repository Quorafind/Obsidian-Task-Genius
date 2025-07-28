import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { EditorState, Range, StateField } from "@codemirror/state";
import { TFile, App, MetadataCache, editorInfoField } from "obsidian";
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

// Extension configuration for StateField access
interface TaskTimerConfig {
	settings: TaskTimerSettings;
	metadataCache: MetadataCache;
}

// StateField configuration
let timerConfig: TaskTimerConfig | null = null;

/**
 * Widget for displaying task timer controls above parent tasks
 */
class TaskTimerWidget extends WidgetType {
	private dom: HTMLElement | null = null;
	private updateInterval: number | null = null;
	private timerState: TimerState | null = null;

	constructor(
		private readonly state: EditorState,
		private readonly settings: TaskTimerSettings,
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

	toDOM(): HTMLElement {
		if (this.dom) {
			this.refreshUI();
			return this.dom;
		}

		this.dom = createDiv({ cls: `task-timer-widget ${this.timerState?.status || 'idle'}` });
		this.createTimeDisplay(this.dom);
		this.createButtons(this.dom);
		return this.dom;
	}

	/**
	 * Create time display area
	 */
	private createTimeDisplay(container: HTMLElement): void {
		const timeSpan = container.createSpan({ cls: "task-timer-display" });
		this.updateTimerState();
		this.refreshTimeDisplay();
	}

	/**
	 * Create action buttons
	 */
	private createButtons(container: HTMLElement): void {
		const buttonContainer = container.createDiv({ cls: "task-timer-buttons" });
		
		this.updateTimerState();
		
		if (!this.timerState || this.timerState.status === 'idle') {
			const startButton = buttonContainer.createEl("button", {
				cls: "task-timer-button start",
				text: "Start Task"
			});
			startButton.addEventListener("click", (e) => {
				e.preventDefault();
				this.startTimer();
			});
		} else if (this.timerState.status === 'running') {
			const pauseButton = buttonContainer.createEl("button", {
				cls: "task-timer-button pause",
				text: "Pause"
			});
			pauseButton.addEventListener("click", (e) => {
				e.preventDefault();
				this.pauseTimer();
			});

			const resetButton = buttonContainer.createEl("button", {
				cls: "task-timer-button reset",
				text: "Reset"
			});
			resetButton.addEventListener("click", (e) => {
				e.preventDefault();
				this.resetTimer();
			});

			const completeButton = buttonContainer.createEl("button", {
				cls: "task-timer-button complete",
				text: "Complete"
			});
			completeButton.addEventListener("click", (e) => {
				e.preventDefault();
				this.completeTimer();
			});
		} else if (this.timerState.status === 'paused') {
			const resumeButton = buttonContainer.createEl("button", {
				cls: "task-timer-button resume",
				text: "Resume"
			});
			resumeButton.addEventListener("click", (e) => {
				e.preventDefault();
				this.resumeTimer();
			});

			const resetButton = buttonContainer.createEl("button", {
				cls: "task-timer-button reset",
				text: "Reset"
			});
			resetButton.addEventListener("click", (e) => {
				e.preventDefault();
				this.resetTimer();
			});

			const completeButton = buttonContainer.createEl("button", {
				cls: "task-timer-button complete",
				text: "Complete"
			});
			completeButton.addEventListener("click", (e) => {
				e.preventDefault();
				this.completeTimer();
			});
		}
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
				taskId = `${this.filePath}#^${blockId}`;
				
				// Insert block reference into the task line
				const editorInfo = this.state.field(editorInfoField);
				if (editorInfo?.editor) {
					const line = this.state.doc.lineAt(this.lineFrom);
					const lineText = line.text;
					const updatedText = lineText.trimEnd() + ` ^${blockId}`;
					
					editorInfo.editor.replaceRange(updatedText,
						{ line: line.number - 1, ch: 0 },
						{ line: line.number - 1, ch: lineText.length }
					);
				}
			}

			console.log(`[TaskTimer] Starting timer for task: ${taskId}`);
			this.timerManager.startTimer(taskId);
			this.startRealtimeUpdates();
			this.updateTimerState();
			console.log("[TaskTimer] Timer started successfully");
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
			this.stopRealtimeUpdates();
			this.updateTimerState();
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

			// Calculate elapsed time
			const elapsedMs = this.timerManager.completeTimer(taskId);
			const formattedDuration = TaskTimerFormatter.formatDuration(elapsedMs, this.settings.timeFormat);

			// Get editor info to access editor
			const editorInfo = this.state.field(editorInfoField);
			if (!editorInfo?.editor) {
				console.warn("[TaskTimer] Cannot access editor");
				return;
			}

			// Update the task line to mark as complete and add duration
			const lineText = this.state.doc.lineAt(this.lineFrom).text;
			const completedTaskText = lineText
				.replace(/\[[ ]\]/, '[x]') // Mark as completed
				.replace(/\s*$/, ` (${formattedDuration})`); // Add duration at end

			// Apply the change to the document using the editor
			const line = this.state.doc.lineAt(this.lineFrom);
			editorInfo.editor.replaceRange(completedTaskText, 
				{ line: line.number - 1, ch: 0 }, 
				{ line: line.number - 1, ch: line.text.length }
			);

			this.stopRealtimeUpdates();
			this.updateTimerState();
			console.log(`[TaskTimer] Timer completed successfully: ${formattedDuration}`);
		} catch (error) {
			console.error("[TaskTimer] Error completing timer:", error);
			this.updateTimerState();
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
			return `${this.filePath}#^${this.existingBlockId}`;
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
			this.refreshTimeDisplay();
		}, 5000); // Update every 5 seconds for performance
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
	 * Refresh only the time display (performance optimization)
	 */
	private refreshTimeDisplay(): void {
		if (!this.dom) return;
		
		const timeDisplay = this.dom.querySelector('.task-timer-display') as HTMLElement;
		if (!timeDisplay) return;

		this.updateTimerState();
		
		if (this.timerState) {
			const elapsedMs = Date.now() - this.timerState.startTime;
			const formattedTime = TaskTimerFormatter.formatDuration(elapsedMs, this.settings.timeFormat);
			
			// Only update if the text has changed
			if (timeDisplay.textContent !== formattedTime) {
				timeDisplay.textContent = formattedTime;
			}
			
			// Update animation class
			if (this.timerState.status === 'running') {
				timeDisplay.addClass('running');
			} else {
				timeDisplay.removeClass('running');
			}
		} else {
			timeDisplay.textContent = "00:00";
			timeDisplay.removeClass('running');
		}
	}

	/**
	 * Refresh the entire UI (used when state changes significantly)
	 */
	private refreshUI(): void {
		if (!this.dom) return;
		
		// Update widget class
		this.dom.className = `task-timer-widget ${this.timerState?.status || 'idle'}`;
		
		// Clear and recreate content
		this.dom.empty();
		this.createTimeDisplay(this.dom);
		this.createButtons(this.dom);
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
	update(decorations: DecorationSet, transaction): DecorationSet {
		if (transaction.docChanged) {
			return createTaskTimerDecorations(transaction.state);
		}
		return decorations;
	},
	provide: (field) => EditorView.decorations.from(field)
});

/**
 * Create task timer decorations for the current state
 */
function createTaskTimerDecorations(state: EditorState): DecorationSet {
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
			
			// Use existing folding logic to check if this is a parent task
			const range = calculateRangeForTransform(state, {
				from: line.from,
				to: line.to,
			});
			
			if (
				range &&
				range.to > line.to &&
				hasSubTasks(doc.sliceString(range.from, range.to), lineText)
			) {
				console.log("[TaskTimer] Found parent task with subtasks");
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
						existingBlockId
					),
					side: -1,
					block: true // This is now allowed in StateField
				});
				
				// Add decoration at the start of the line
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
	return /^\s*[-*+]\s+\[[ xX]\]/.test(lineText);
}

function hasSubTasks(rangeText: string, parentLineText: string): boolean {
	const lines = rangeText.split("\n");
	if (lines.length <= 1) return false;
	
	// Get parent indentation level
	const parentMatch = parentLineText.match(/^(\s*)/);
	const parentIndent = parentMatch ? parentMatch[1].length : 0;
	
	// Check subsequent lines for subtasks
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		if (isTaskLine(line)) {
			const lineMatch = line.match(/^(\s*)/);
			const lineIndent = lineMatch ? lineMatch[1].length : 0;
			if (lineIndent > parentIndent) {
				return true; // Found a subtask with greater indentation
			}
		}
	}
	return false;
}

function extractBlockRef(lineText: string): string | undefined {
	const match = lineText.match(/\^([a-zA-Z0-9\-_]+)\s*$/);
	return match ? match[1] : undefined;
}

function calculateRangeForTransform(
	state: EditorState,
	range: TextRange
): TextRange | null {
	const tree = syntaxTree(state);
	
	// Find the node at the current position
	let node = tree.resolveInner(range.from, 1);
	
	// Traverse up to find a foldable node
	while (node) {
		if (foldable(state, node.from, node.to)) {
			// This node is foldable, so it represents a section
			return {
				from: node.from,
				to: node.to,
			};
		}
		node = node.parent;
	}
	
	// If no foldable node found, return the original range
	return range;
}

/**
 * Main task timer extension function
 * Creates a StateField-based extension for proper block decorations
 */
export function taskTimerExtension(
	app: App,
	settings: TaskTimerSettings,
	metadataCache: MetadataCache
) {
	// Set global configuration for StateField access
	timerConfig = {
		settings,
		metadataCache
	};
	
	return [taskTimerStateField];
}