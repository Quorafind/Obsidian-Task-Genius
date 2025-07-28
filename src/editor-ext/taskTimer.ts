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
import { TaskTimerSettings } from "../common/setting-definition";
import { TaskTimerMetadataDetector } from "../utils/TaskTimerMetadataDetector";
import { TaskTimerManager, TimerState } from "../utils/TaskTimerManager";
import { TaskTimerFormatter } from "../utils/TaskTimerFormatter";
import "../styles/task-timer.css";

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

		// Create a simple text-based widget
		this.dom = createDiv({ cls: 'task-timer-widget' });
		this.dom.style.cssText = 'margin: 2px 0; font-size: 0.9em; color: var(--text-muted);';
		this.updateTimerState();
		this.createContent();
		return this.dom;
	}

	/**
	 * Create content based on timer state
	 */
	private createContent(): void {
		if (!this.dom) return;
		
		this.dom.empty();
		
		if (!this.timerState || this.timerState.status === 'idle') {
			// Create text-style start button
			const startSpan = this.dom.createSpan();
			startSpan.style.cssText = 'cursor: pointer; text-decoration: underline; color: var(--text-accent);';
			startSpan.setText('Start Task');
			startSpan.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.startTimer();
			});
		} else {
			// Show elapsed time
			const elapsedMs = Date.now() - this.timerState.startTime + (this.timerState.elapsed || 0);
			const formattedTime = TaskTimerFormatter.formatDuration(elapsedMs, this.settings.timeFormat);
			const timeSpan = this.dom.createSpan();
			timeSpan.setText(`⏱ ${formattedTime} `);
			
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
		
		const link = this.dom.createSpan();
		link.style.cssText = 'cursor: pointer; text-decoration: underline; color: var(--text-accent);';
		link.setText(text);
		link.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			action();
		});
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
		
		this.updateTimerState();
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
			
			// Check if next line exists and has greater indentation (simple check)
			if (i < doc.lines) {
				const nextLine = doc.line(i + 1);
				const nextLineText = nextLine.text;
				
				// Simple indentation check
				const currentIndent = lineText.match(/^(\s*)/)?.[1].length || 0;
				const nextIndent = nextLineText.match(/^(\s*)/)?.[1].length || 0;
				
				// If next line has more indentation, this is a parent task
				if (nextIndent > currentIndent && nextLineText.trim()) {
					console.log("[TaskTimer] Found parent task with subtasks (next line indent:", nextIndent, "vs", currentIndent, ")");
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


function extractBlockRef(lineText: string): string | undefined {
	const match = lineText.match(/\^([a-zA-Z0-9\-_]+)\s*$/);
	return match ? match[1] : undefined;
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