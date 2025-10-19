import TaskProgressBarPlugin from '@/index';
import {
	Component,
	debounce,
	MarkdownPostProcessorContext,
	setIcon,
	TFile,
} from "obsidian";
import { getTasksAPI } from "@/utils";
import { parseTaskLine } from '@/utils/task/task-operations';

// This component replaces standard checkboxes with custom text marks in reading view
export function applyTaskTextMarks({
	plugin,
	element,
	ctx,
}: {
	plugin: TaskProgressBarPlugin;
	element: HTMLElement;
	ctx: MarkdownPostProcessorContext;
}) {
	// Find all task list items in the element - handle both ul and ol lists
	const taskItems = element.findAll(".task-list-item");

	// Track processed task items to avoid duplicates
	const processedItems = new Set();

	for (const taskItem of taskItems) {
		// Skip if this task item already has our custom mark
		if (
			taskItem.querySelector(".task-text-mark") ||
			processedItems.has(taskItem)
		) {
			continue;
		}

		// Mark this item as processed
		processedItems.add(taskItem);

		// Get the original checkbox
		const checkbox = taskItem.querySelector(
			".task-list-item-checkbox"
		) as HTMLInputElement;

		if (!checkbox) continue;

		// Get the current task mark
		const dataTask = taskItem.getAttribute("data-task") || " ";

		// Create our custom text mark component
		new TaskTextMark(plugin, taskItem, checkbox, dataTask, ctx).load();
	}
}

class TaskTextMark extends Component {
	private markEl: HTMLElement;
	private bulletEl: HTMLElement;
	private markContainerEl: HTMLElement;

	constructor(
		private plugin: TaskProgressBarPlugin,
		private taskItem: HTMLElement,
		private originalCheckbox: HTMLInputElement,
		private currentMark: string,
		private ctx: MarkdownPostProcessorContext
	) {
		super();
	}

	load() {
		if ((this.ctx as any)?.el?.hasClass("planner-sticky-block-content")) {
			return;
		}

		if (this.plugin.settings.enableCustomTaskMarks) {
			// Create container for custom task mark
			this.markContainerEl = createEl("span", {
				cls: "task-state-container",
				attr: { "data-task-state": this.currentMark },
			});

			// Create bullet element
			this.bulletEl = this.markContainerEl.createEl("span", {
				cls: "task-fake-bullet",
			});

			// Create custom mark element
			this.markEl = this.markContainerEl.createEl("span", {
				cls: "task-state",
				attr: { "data-task-state": this.currentMark },
			});

			// Apply styling based on current status
			this.styleMarkByStatus();

			// Insert custom mark after the checkbox
			this.originalCheckbox.parentElement?.insertBefore(
				this.markContainerEl,
				this.originalCheckbox.nextSibling
			);

			// Register click handler for status cycling
			this.registerDomEvent(this.markEl, "click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.debounceCycleTaskStatus();
			});
		} else {
			// When custom marks are disabled, clone the checkbox for interaction
			const newCheckbox = this.originalCheckbox.cloneNode(
				true
			) as HTMLInputElement;

			// Insert cloned checkbox
			this.originalCheckbox.parentElement?.insertBefore(
				newCheckbox,
				this.originalCheckbox.nextSibling
			);

			// Register click handler on the cloned checkbox
			this.registerDomEvent(newCheckbox, "click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.debounceCycleTaskStatus();
			});
		}

		// Hide the original checkbox in both cases
		this.originalCheckbox.hide();

		return this;
	}

	styleMarkByStatus() {
		// Clear any previous content
		this.markEl.empty();

		// Get current mark's status type
		const status = this.getTaskStatusFromMark(this.currentMark);

		if (status) {
			this.markEl.setText(status);
		} else {
			this.markEl.setText(this.currentMark);
		}
	}

	debounceCycleTaskStatus = debounce(() => {
		this.cycleTaskStatus();
	}, 200);

	triggerMarkUpdate(nextMark: string) {
		if (this.plugin.settings.enableCustomTaskMarks) {
			this.taskItem.setAttribute("data-task", nextMark);
			this.markEl.setAttribute("data-task-state", nextMark);
			this.styleMarkByStatus();
		}
	}

	cycleTaskStatus() {
		// Get the section info to locate the task in the file
		const sectionInfo = this.ctx.getSectionInfo(this.taskItem);

		const file = this.ctx.sourcePath
			? this.plugin.app.vault.getFileByPath(this.ctx.sourcePath)
			: null;
		if (!file || !(file instanceof TFile)) return;

		// Fallback for callouts - check if we're in a callout and sectionInfo is not available
		interface CalloutInfo {
			lineStart: number;
			start: number;
			end: number;
			text: string;
		}
		let calloutInfo: CalloutInfo | null = null;
		if (!sectionInfo) {
			// Check if containerEl exists and has cmView (for callouts)
			// @ts-ignore - TypeScript doesn't know about containerEl and cmView properties
			if (this.ctx.containerEl?.cmView) {
				// @ts-ignore - Accessing dynamic properties
				const cmView = this.ctx.containerEl.cmView;
				// Check if this is a callout
				if (cmView.widget.clazz === "cm-callout") {
					calloutInfo = {
						lineStart: 0, // We'll calculate relative position
						start: cmView.widget.start,
						end: cmView.widget.end,
						text: cmView.widget.text,
					};
				}
			}

			// If we couldn't get callout info either, we can't proceed
			if (!calloutInfo) return;
		}

		// Get cycle configuration from plugin settings
		const cycle = this.plugin.settings.taskStatusCycle || [];
		const marks = this.plugin.settings.taskStatusMarks || {};
		const excludeMarksFromCycle =
			this.plugin.settings.excludeMarksFromCycle || [];

		// Filter out excluded marks
		const remainingCycle = cycle.filter(
			(state) => !excludeMarksFromCycle.includes(state)
		);

		if (remainingCycle.length === 0) return;

		// Find current state in cycle
		let currentState =
			Object.keys(marks).find(
				(state) => marks[state] === this.currentMark
			) || remainingCycle[0];

		// Find next state in cycle
		const currentIndex = remainingCycle.indexOf(currentState);
		const nextIndex = (currentIndex + 1) % remainingCycle.length;
		const nextState = remainingCycle[nextIndex];
		const nextMark = marks[nextState] || " ";
		// Check if next state is DONE and Tasks plugin is available
		const tasksApi = getTasksAPI(this.plugin);
		const canToggleWithTasksApi = nextState === "DONE" && !!tasksApi;
		const isCurrentDone = currentState === "DONE";

		// Update the underlying file using the process method for atomic operations
		this.plugin.app.vault.process(file, (content) => {
			const lines = content.split("\n");
			let actualLineIndex: number;
			let taskLine: string;

			if (sectionInfo) {
				// Standard method using sectionInfo
				// Get the relative line number from the taskItem's data-line attribute
				const dataLine = parseInt(
					this.taskItem.getAttribute("data-line") || "0"
				);

				// Calculate the actual line in the file by adding the relative line to section start
				actualLineIndex = sectionInfo.lineStart + dataLine;
				taskLine = lines[actualLineIndex];
			} else if (calloutInfo) {
				// Get the line number from the task item's data-line attribute
				const dataLine = parseInt(
					this.taskItem
						.querySelector("input")
						?.getAttribute("data-line") || "0"
				);

				// Calculate actual line number by adding data-line to lines before callout
				const contentBeforeCallout = content.substring(
					0,
					calloutInfo.start
				);
				const linesBefore = contentBeforeCallout.split("\n").length - 1;
				actualLineIndex = linesBefore + dataLine;
				taskLine = lines[actualLineIndex];
			} else {
				return content; // Can't proceed without location info
			}

			if (canToggleWithTasksApi && tasksApi) {
				// Use Tasks API to toggle the task
				const updatedContent = tasksApi.executeToggleTaskDoneCommand(
					taskLine,
					file.path
				);

				// Handle potential multi-line result (recurring tasks might create new lines)
				const updatedLines = updatedContent.split("\n");

				if (updatedLines.length === 1) {
					// Simple replacement
					lines[actualLineIndex] = updatedContent;
				} else {
					// Handle multi-line result (like recurring tasks)
					lines.splice(actualLineIndex, 1, ...updatedLines);
				}

				// Update the UI immediately
				this.currentMark = nextMark;
				this.triggerMarkUpdate(nextMark);
				this.originalCheckbox.checked = true;
			} else {
				// Use the original logic for other status changes
				let updatedLine = taskLine;

				if (isCurrentDone) {
					// Remove completion date if switching from DONE state
					updatedLine = updatedLine.replace(
						/\s+✅\s+\d{4}-\d{2}-\d{2}/,
						""
					);
				}

				updatedLine = updatedLine.replace(
					/(\s*[-*+]\s*\[)(.)(])/,
					`$1${nextMark}$3`
				);

				if (updatedLine !== taskLine) {
					lines[actualLineIndex] = updatedLine;

					// Update the UI immediately without waiting for file change event
					this.currentMark = nextMark;
					this.triggerMarkUpdate(nextMark);
					// Update the original checkbox checked state if appropriate
					const completedMarks =
						this.plugin.settings.taskStatuses.completed.split("|");
					this.originalCheckbox.checked =
						completedMarks.includes(nextMark);
				}
			}

			if (nextMark === "x" || nextMark === "X") {
				const task = parseTaskLine(
					file.path,
					taskLine,
					actualLineIndex,
					this.plugin.settings.preferMetadataFormat,
					this.plugin // Pass plugin for configurable prefix support
				);
				task &&
					this.plugin.app.workspace.trigger(
						"task-genius:task-completed",
						task
					);
			}

			return lines.join("\n");
		});
	}

	getTaskStatusFromMark(mark: string): string | null {
		const cycle = this.plugin.settings.taskStatusCycle;
		const marks = this.plugin.settings.taskStatusMarks;
		const excludeMarksFromCycle =
			this.plugin.settings.excludeMarksFromCycle || [];
		const remainingCycle = cycle.filter(
			(state) => !excludeMarksFromCycle.includes(state)
		);

		if (remainingCycle.length === 0) return null;

		let currentState: string =
			Object.keys(marks).find((state) => marks[state] === mark) ||
			remainingCycle[0];

		return currentState;
	}

	unload() {
		// Remove our mark and restore original checkbox
		if (this.markEl) {
			this.markEl.remove();
		}

		// Remove the bullet element if it exists
		if (this.bulletEl) {
			this.bulletEl.remove();
		}

		// Show the original checkbox again
		if (this.originalCheckbox) {
			this.originalCheckbox.style.display = "";
		}

		super.unload();
	}
}
