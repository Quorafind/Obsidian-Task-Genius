/**
 * Task Details Popover Component
 * Used in desktop environments to display task details in a menu popover.
 */

import {
	App,
	debounce,
	MarkdownView,
	TFile,
	Component,
	CloseableComponent,
} from "obsidian";
import { createPopper, Instance as PopperInstance } from "@popperjs/core";
import { Task } from "../../types/task";
import TaskProgressBarPlugin from "../../index";
import { TaskMetadataEditor } from "./MetadataEditor";
import { t } from "../../translations/helper";

export class TaskDetailsPopover
	extends Component
	implements CloseableComponent
{
	private task: Task;
	private plugin: TaskProgressBarPlugin;
	private app: App;
	private popoverRef: HTMLDivElement | null = null;
	private metadataEditor: TaskMetadataEditor;
	private win: Window;
	private scrollParent: HTMLElement | Window;
	private popperInstance: PopperInstance | null = null;

	constructor(app: App, plugin: TaskProgressBarPlugin, task: Task) {
		super();
		this.app = app;
		this.plugin = plugin;
		this.task = task;
		this.win = app.workspace.containerEl.win || window;
		// Determine a reasonable scroll parent.
		const scrollEl = app.workspace.containerEl.closest(".cm-scroller");
		if (scrollEl instanceof HTMLElement) {
			this.scrollParent = scrollEl;
		} else {
			this.scrollParent = this.win;
		}
	}

	debounceUpdateTask = debounce(async (task: Task) => {
		await this.plugin.taskManager.updateTask(task);
	}, 200);

	/**
	 * Shows the task details popover at the given position.
	 */
	showAtPosition(position: { x: number; y: number }) {
		if (this.popoverRef) {
			this.close();
		}

		// Create content container
		const contentEl = createDiv({ cls: "task-popover-content" });

		// Create metadata editor, use compact mode
		this.metadataEditor = new TaskMetadataEditor(
			contentEl,
			this.app,
			this.plugin,
			true // Compact mode
		);

		// Initialize editor and display task
		this.metadataEditor.onload();
		this.metadataEditor.showTask(this.task);

		// Listen for metadata change events
		this.metadataEditor.onMetadataChange = async (event) => {
			// Determine if the field is a top-level task property or metadata property
			const topLevelFields = ["status", "completed", "content"];
			const isTopLevelField = topLevelFields.includes(event.field);

			// Create a base task object with the updated field
			const updatedTask = { ...this.task };

			if (isTopLevelField) {
				// Update top-level task property
				(updatedTask as any)[event.field] = event.value;
			} else {
				// Update metadata property
				updatedTask.metadata = {
					...this.task.metadata,
					[event.field]: event.value,
				};
			}

			// Handle special status field logic
			if (
				event.field === "status" &&
				(event.value === "x" || event.value === "X")
			) {
				updatedTask.completed = true;
				updatedTask.metadata = {
					...updatedTask.metadata,
					completedDate: Date.now(),
				};
				// Remove cancelled date if task is completed
				const { cancelledDate, ...metadataWithoutCancelledDate } =
					updatedTask.metadata;
				updatedTask.metadata = metadataWithoutCancelledDate;
			} else if (event.field === "status" && event.value === "-") {
				// If status is changing to cancelled, mark as not completed and add cancelled date
				updatedTask.completed = false;
				const { completedDate, ...metadataWithoutCompletedDate } =
					updatedTask.metadata;
				updatedTask.metadata = {
					...metadataWithoutCompletedDate,
					cancelledDate: Date.now(),
				};
			} else if (event.field === "status") {
				// If status is changing to something else, mark as not completed
				updatedTask.completed = false;
				const {
					completedDate,
					cancelledDate,
					...metadataWithoutDates
				} = updatedTask.metadata;
				updatedTask.metadata = metadataWithoutDates;
			}

			// Update the internal task reference
			this.task = updatedTask;

			// Update the task with all changes
			this.debounceUpdateTask(updatedTask);
		};

		// Create the popover
		this.popoverRef = this.app.workspace.containerEl.createDiv({
			cls: "task-details-popover tg-menu bm-menu", // Borrowing some classes from IconMenu
		});
		this.popoverRef.appendChild(contentEl);

		// Add a title bar to the popover
		const titleBar = this.popoverRef.createDiv({
			cls: "tg-popover-titlebar",
			text: t("Task Details"),
		});
		// Prepend titleBar to popoverRef so it's at the top
		this.popoverRef.insertBefore(titleBar, this.popoverRef.firstChild);

		document.body.appendChild(this.popoverRef);

		// Create a virtual element for Popper.js
		const virtualElement = {
			getBoundingClientRect: () => ({
				width: 0,
				height: 0,
				top: position.y,
				right: position.x,
				bottom: position.y,
				left: position.x,
				x: position.x,
				y: position.y,
				toJSON: function () {
					return this;
				},
			}),
		};

		if (this.popoverRef) {
			this.popperInstance = createPopper(
				virtualElement,
				this.popoverRef,
				{
					placement: "bottom-start",
					modifiers: [
						{
							name: "offset",
							options: {
								offset: [0, 8], // Offset the popover slightly
							},
						},
						{
							name: "preventOverflow",
							options: {
								padding: 10, // Padding from viewport edges
							},
						},
						{
							name: "flip",
							options: {
								fallbackPlacements: [
									"top-start",
									"right-start",
									"left-start",
								],
								padding: 10,
							},
						},
					],
				}
			);
		}

		// Use timeout to ensure popover is rendered before adding listeners
		this.win.setTimeout(() => {
			this.win.addEventListener("click", this.clickOutside);
			this.scrollParent.addEventListener(
				"scroll",
				this.scrollHandler,
				true
			); // Use capture for scroll
		}, 10);
	}

	private clickOutside = (e: MouseEvent) => {
		if (this.popoverRef && !this.popoverRef.contains(e.target as Node)) {
			this.close();
		}
	};

	private scrollHandler = (e: Event) => {
		if (this.popoverRef) {
			if (
				e.target instanceof Node &&
				this.popoverRef.contains(e.target)
			) {
				const targetElement = e.target as HTMLElement;
				if (
					targetElement.scrollHeight > targetElement.clientHeight ||
					targetElement.scrollWidth > targetElement.clientWidth
				) {
					// If the scroll event is within the popover and the popover itself is scrollable,
					// do not close it. This allows scrolling within the popover content.
					return;
				}
			}
			// For other scroll events (e.g., scrolling the main window), close the popover.
			this.close();
		}
	};

	/**
	 * Closes the popover.
	 */
	close() {
		if (this.popperInstance) {
			this.popperInstance.destroy();
			this.popperInstance = null;
		}

		if (this.popoverRef) {
			this.popoverRef.remove();
			this.popoverRef = null;
		}

		this.win.removeEventListener("click", this.clickOutside);
		this.scrollParent.removeEventListener(
			"scroll",
			this.scrollHandler,
			true
		);

		if (this.metadataEditor) {
			this.metadataEditor.onunload();
		}
	}
}
