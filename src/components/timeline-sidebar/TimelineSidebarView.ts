import {
	ItemView,
	WorkspaceLeaf,
	setIcon,
	moment,
	Component,
	debounce,
	ButtonComponent,
	Platform,
	TFile,
} from "obsidian";
import { Task } from "../../types/task";
import { t } from "../../translations/helper";
import TaskProgressBarPlugin from "../../index";
import { QuickCaptureModal } from "../QuickCaptureModal";
import {
	createEmbeddableMarkdownEditor,
	EmbeddableMarkdownEditor,
} from "../../editor-ext/markdownEditor";
import { saveCapture } from "../../utils/fileUtils";
import "../../styles/timeline-sidebar.css";
import { createTaskCheckbox } from "../task-view/details";
import { MarkdownRendererComponent } from "../MarkdownRenderer";

export const TIMELINE_SIDEBAR_VIEW_TYPE = "tg-timeline-sidebar-view";

// Date type priority for deduplication (higher number = higher priority)
const DATE_TYPE_PRIORITY = {
	due: 4,
	scheduled: 3,
	start: 2,
	completed: 1,
} as const;

interface TimelineEvent {
	id: string;
	content: string;
	time: Date;
	type: "task" | "event";
	status?: string;
	task?: Task;
	isToday?: boolean;
}

export class TimelineSidebarView extends ItemView {
	private plugin: TaskProgressBarPlugin;
	public containerEl: HTMLElement;
	private timelineContainerEl: HTMLElement;
	private quickInputContainerEl: HTMLElement;
	private markdownEditor: EmbeddableMarkdownEditor | null = null;
	private currentDate: moment.Moment = moment();
	private events: TimelineEvent[] = [];
	private isAutoScrolling: boolean = false;

	// Collapse state management
	private isInputCollapsed: boolean = false;
	private tempEditorContent: string = "";
	private isAnimating: boolean = false;
	private collapsedHeaderEl: HTMLElement | null = null;
	private quickInputHeaderEl: HTMLElement | null = null;

	// Debounced methods
	private debouncedRender = debounce(async () => {
		await this.loadEvents();
		this.renderTimeline();
	}, 300);
	private debouncedScroll = debounce(this.handleScroll.bind(this), 100);

	constructor(leaf: WorkspaceLeaf, plugin: TaskProgressBarPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return TIMELINE_SIDEBAR_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t("Timeline");
	}

	getIcon(): string {
		return "calendar-clock";
	}

	async onOpen(): Promise<void> {
		this.containerEl = this.contentEl;
		this.containerEl.empty();
		this.containerEl.addClass("timeline-sidebar-container");

		// Restore collapsed state from settings
		this.isInputCollapsed = this.plugin.settings.timelineSidebar.quickInputCollapsed;

		this.createHeader();
		this.createTimelineArea();
		this.createQuickInputArea();

		// Load initial data
		await this.loadEvents();
		this.renderTimeline();

		// Auto-scroll to today on open
		setTimeout(() => {
			this.scrollToToday();
		}, 100);

		// Register for task updates
		this.registerEvent(
			this.plugin.app.vault.on("modify", () => {
				this.debouncedRender();
			})
		);

		// Register for task cache updates
		this.registerEvent(
			this.plugin.app.workspace.on(
				"task-genius:task-cache-updated",
				() => {
					this.debouncedRender();
				}
			)
		);
	}

	onClose(): Promise<void> {
		if (this.markdownEditor) {
			this.markdownEditor.destroy();
			this.markdownEditor = null;
		}
		return Promise.resolve();
	}

	private createHeader(): void {
		const headerEl = this.containerEl.createDiv("timeline-header");

		// Title
		const titleEl = headerEl.createDiv("timeline-title");
		titleEl.setText(t("Timeline"));

		// Controls
		const controlsEl = headerEl.createDiv("timeline-controls");

		// Today button
		const todayBtn = controlsEl.createDiv(
			"timeline-btn timeline-today-btn"
		);
		setIcon(todayBtn, "calendar");
		todayBtn.setAttribute("aria-label", t("Go to today"));
		this.registerDomEvent(todayBtn, "click", () => {
			this.scrollToToday();
		});

		// Refresh button
		const refreshBtn = controlsEl.createDiv(
			"timeline-btn timeline-refresh-btn"
		);
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.setAttribute("aria-label", t("Refresh"));
		this.registerDomEvent(refreshBtn, "click", () => {
			this.loadEvents();
			this.renderTimeline();
		});

		// Focus mode toggle
		const focusBtn = controlsEl.createDiv(
			"timeline-btn timeline-focus-btn"
		);
		setIcon(focusBtn, "focus");
		focusBtn.setAttribute("aria-label", t("Focus on today"));
		this.registerDomEvent(focusBtn, "click", () => {
			this.toggleFocusMode();
		});
	}

	private createTimelineArea(): void {
		this.timelineContainerEl =
			this.containerEl.createDiv("timeline-content");

		// Add scroll listener for infinite scroll
		this.registerDomEvent(this.timelineContainerEl, "scroll", () => {
			this.debouncedScroll();
		});
	}

	private createQuickInputArea(): void {
		this.quickInputContainerEl = this.containerEl.createDiv(
			"timeline-quick-input"
		);

		// Create collapsed header (always exists but hidden when expanded)
		this.collapsedHeaderEl = this.quickInputContainerEl.createDiv(
			"quick-input-header-collapsed"
		);
		this.createCollapsedHeader();

		// Input header with target info
		this.quickInputHeaderEl =
			this.quickInputContainerEl.createDiv("quick-input-header");

		// Add collapse button to header
		const headerLeft = this.quickInputHeaderEl.createDiv("quick-input-header-left");
		
		const collapseBtn = headerLeft.createDiv("quick-input-collapse-btn");
		setIcon(collapseBtn, "chevron-down");
		collapseBtn.setAttribute("aria-label", t("Collapse quick input"));
		this.registerDomEvent(collapseBtn, "click", () => {
			this.toggleInputCollapse();
		});

		const headerTitle = headerLeft.createDiv("quick-input-title");
		headerTitle.setText(t("Quick Capture"));

		const targetInfo = this.quickInputHeaderEl.createDiv("quick-input-target-info");
		this.updateTargetInfo(targetInfo);

		// Editor container
		const editorContainer =
			this.quickInputContainerEl.createDiv("quick-input-editor");

		// Initialize markdown editor
		setTimeout(() => {
			this.markdownEditor = createEmbeddableMarkdownEditor(
				this.app,
				editorContainer,
				{
					placeholder: t("What do you want to do today?"),
					onEnter: (editor, mod, shift) => {
						if (mod) {
							// Submit on Cmd/Ctrl+Enter
							this.handleQuickCapture();
							return true;
						}
						return false;
					},
					onEscape: () => {
						// Clear input on Escape
						if (this.markdownEditor) {
							this.markdownEditor.set("", false);
						}
					},
					onChange: () => {
						// Auto-resize or other behaviors
					},
				}
			);

			// Focus the editor if not collapsed
			if (!this.isInputCollapsed) {
				this.markdownEditor?.editor?.focus();
			}
		}, 50);

		// Action buttons
		const actionsEl = this.quickInputContainerEl.createDiv(
			"quick-input-actions"
		);

		const captureBtn = actionsEl.createEl("button", {
			cls: "quick-capture-btn mod-cta",
			text: t("Capture"),
		});
		this.registerDomEvent(captureBtn, "click", () => {
			this.handleQuickCapture();
		});

		const fullModalBtn = actionsEl.createEl("button", {
			cls: "quick-modal-btn",
			text: t("More options"),
		});
		this.registerDomEvent(fullModalBtn, "click", () => {
			new QuickCaptureModal(this.app, this.plugin, {}, true).open();
		});

		// Apply initial collapsed state
		if (this.isInputCollapsed) {
			this.quickInputContainerEl.addClass("is-collapsed");
			this.collapsedHeaderEl?.show();
		} else {
			this.collapsedHeaderEl?.hide();
		}
	}

	private loadEvents(): void {
		// Get tasks from the plugin's task manager
		const allTasks = this.plugin.taskManager.getAllTasks();

		this.events = [];

		// Filter tasks based on showCompletedTasks setting
		const shouldShowCompletedTasks =
			this.plugin.settings.timelineSidebar.showCompletedTasks;
		const filteredTasks = shouldShowCompletedTasks
			? allTasks
			: allTasks.filter((task) => !task.completed);

		// Filter out ICS badge events from timeline
		// ICS badge events should only appear as badges in calendar views, not as individual timeline events
		const timelineFilteredTasks = filteredTasks.filter((task) => {
			// Check if this is an ICS task with badge showType
			const isIcsTask = (task as any).source?.type === "ics";
			const icsTask = isIcsTask ? (task as any) : null;
			const showAsBadge = icsTask?.icsEvent?.source?.showType === "badge";

			// Exclude ICS tasks with badge showType from timeline
			return !(isIcsTask && showAsBadge);
		});

		// Convert tasks to timeline events
		timelineFilteredTasks.forEach((task) => {
			const dates = this.extractDatesFromTask(task);
			dates.forEach(({ date, type }) => {
				const event: TimelineEvent = {
					id: `${task.id}-${type}`,
					content: task.content,
					time: date,
					type: "task",
					status: task.status,
					task: task,
					isToday: moment(date).isSame(moment(), "day"),
				};
				this.events.push(event);
			});
		});

		// Sort events by time (newest first for timeline display)
		this.events.sort((a, b) => b.time.getTime() - a.time.getTime());
	}

	/**
	 * Deduplicates dates by priority when multiple date types fall on the same day
	 * @param dates Array of date objects with type information
	 * @returns Deduplicated array with highest priority date per day
	 */
	private deduplicateDatesByPriority(
		dates: Array<{ date: Date; type: string }>
	): Array<{ date: Date; type: string }> {
		if (dates.length <= 1) {
			return dates;
		}

		// Group dates by day (YYYY-MM-DD format)
		const dateGroups = new Map<
			string,
			Array<{ date: Date; type: string }>
		>();

		dates.forEach((dateItem) => {
			const dateKey = moment(dateItem.date).format("YYYY-MM-DD");
			if (!dateGroups.has(dateKey)) {
				dateGroups.set(dateKey, []);
			}
			dateGroups.get(dateKey)!.push(dateItem);
		});

		// For each day, keep only the highest priority date type
		const deduplicatedDates: Array<{ date: Date; type: string }> = [];

		dateGroups.forEach((dayDates) => {
			if (dayDates.length === 1) {
				// Only one date for this day, keep it
				deduplicatedDates.push(dayDates[0]);
			} else {
				// Multiple dates for same day, find highest priority
				const highestPriorityDate = dayDates.reduce(
					(highest, current) => {
						const currentPriority =
							DATE_TYPE_PRIORITY[
								current.type as keyof typeof DATE_TYPE_PRIORITY
							] || 0;
						const highestPriority =
							DATE_TYPE_PRIORITY[
								highest.type as keyof typeof DATE_TYPE_PRIORITY
							] || 0;

						return currentPriority > highestPriority
							? current
							: highest;
					}
				);

				deduplicatedDates.push(highestPriorityDate);
			}
		});

		return deduplicatedDates;
	}

	private extractDatesFromTask(
		task: Task
	): Array<{ date: Date; type: string }> {
		// Task-level deduplication: ensure each task appears only once in timeline
		
		// For completed tasks: prioritize due date, fallback to completed date
		if (task.completed) {
			if (task.metadata.dueDate) {
				return [{ date: new Date(task.metadata.dueDate), type: "due" }];
			} else if (task.metadata.completedDate) {
				return [{ date: new Date(task.metadata.completedDate), type: "completed" }];
			}
		}
		
		// For non-completed tasks: select single highest priority date
		const dates: Array<{ date: Date; type: string }> = [];

		if (task.metadata.dueDate) {
			dates.push({ date: new Date(task.metadata.dueDate), type: "due" });
		}
		if (task.metadata.scheduledDate) {
			dates.push({
				date: new Date(task.metadata.scheduledDate),
				type: "scheduled",
			});
		}
		if (task.metadata.startDate) {
			dates.push({
				date: new Date(task.metadata.startDate),
				type: "start",
			});
		}
		
		// For non-completed tasks, select the highest priority date
		if (dates.length > 0) {
			const highestPriorityDate = dates.reduce((highest, current) => {
				const currentPriority = DATE_TYPE_PRIORITY[current.type as keyof typeof DATE_TYPE_PRIORITY] || 0;
				const highestPriority = DATE_TYPE_PRIORITY[highest.type as keyof typeof DATE_TYPE_PRIORITY] || 0;
				return currentPriority > highestPriority ? current : highest;
			});
			return [highestPriorityDate];
		}
		
		// Fallback: if no planning dates exist, use deduplication for edge cases
		const allDates: Array<{ date: Date; type: string }> = [];
		if (task.metadata.completedDate) {
			allDates.push({
				date: new Date(task.metadata.completedDate),
				type: "completed",
			});
		}
		
		return this.deduplicateDatesByPriority(allDates);
	}

	private renderTimeline(): void {
		this.timelineContainerEl.empty();

		if (this.events.length === 0) {
			const emptyEl =
				this.timelineContainerEl.createDiv("timeline-empty");
			emptyEl.setText(t("No events to display"));
			return;
		}

		// Group events by date
		const eventsByDate = this.groupEventsByDate();

		// Render each date group
		for (const [dateStr, dayEvents] of eventsByDate) {
			this.renderDateGroup(dateStr, dayEvents);
		}
	}

	private groupEventsByDate(): Map<string, TimelineEvent[]> {
		const grouped = new Map<string, TimelineEvent[]>();

		this.events.forEach((event) => {
			const dateKey = moment(event.time).format("YYYY-MM-DD");
			if (!grouped.has(dateKey)) {
				grouped.set(dateKey, []);
			}
			grouped.get(dateKey)!.push(event);
		});

		return grouped;
	}

	private renderDateGroup(dateStr: string, events: TimelineEvent[]): void {
		const dateGroupEl = this.timelineContainerEl.createDiv(
			"timeline-date-group"
		);
		const dateMoment = moment(dateStr);
		const isToday = dateMoment.isSame(moment(), "day");
		const isYesterday = dateMoment.isSame(
			moment().subtract(1, "day"),
			"day"
		);
		const isTomorrow = dateMoment.isSame(moment().add(1, "day"), "day");

		if (isToday) {
			dateGroupEl.addClass("is-today");
		}

		// Date header
		const dateHeaderEl = dateGroupEl.createDiv("timeline-date-header");

		let displayDate = dateMoment.format("MMM DD, YYYY");
		if (isToday) {
			displayDate = t("Today");
		} else if (isYesterday) {
			displayDate = t("Yesterday");
		} else if (isTomorrow) {
			displayDate = t("Tomorrow");
		}

		dateHeaderEl.setText(displayDate);

		// Add relative time
		const relativeEl = dateHeaderEl.createSpan("timeline-date-relative");
		if (!isToday && !isYesterday && !isTomorrow) {
			relativeEl.setText(dateMoment.fromNow());
		}

		// Events list
		const eventsListEl = dateGroupEl.createDiv("timeline-events-list");

		events.forEach((event) => {
			this.renderEvent(eventsListEl, event);
		});
	}

	private renderEvent(containerEl: HTMLElement, event: TimelineEvent): void {
		const eventEl = containerEl.createDiv("timeline-event");
		eventEl.setAttribute("data-event-id", event.id);

		if (event.task?.completed) {
			eventEl.addClass("is-completed");
		}

		// Event time
		const timeEl = eventEl.createDiv("timeline-event-time");
		timeEl.setText(moment(event.time).format("HH:mm"));

		// Event content
		const contentEl = eventEl.createDiv("timeline-event-content");

		// Task checkbox if it's a task
		if (event.task) {
			const checkboxEl = contentEl.createDiv("timeline-event-checkbox");
			checkboxEl.createEl(
				"span",
				{
					cls: "status-option-checkbox",
				},
				(el) => {
					const checkbox = createTaskCheckbox(
						event.task?.status || " ",
						event.task!,
						el
					);
					this.registerDomEvent(checkbox, "change", async (e) => {
						e.stopPropagation();
						e.preventDefault();
						if (event.task) {
							await this.toggleTaskCompletion(event.task, event);
						}
					});
				}
			);
		}

		// Event text with markdown rendering
		const textEl = contentEl.createDiv("timeline-event-text");

		const contentContainer = textEl.createDiv(
			"timeline-event-content-text"
		);

		// Use MarkdownRendererComponent to render the task content
		if (event.task) {
			const markdownRenderer = new MarkdownRendererComponent(
				this.app,
				contentContainer,
				event.task.filePath,
				true // hideMarks = true to clean up task metadata
			);
			this.addChild(markdownRenderer);

			// Set the file context if available
			const file = this.app.vault.getFileByPath(event.task.filePath);
			if (file instanceof TFile) {
				markdownRenderer.setFile(file);
			}

			// Render the content asynchronously
			markdownRenderer.render(event.content, true).catch((error) => {
				console.error("Failed to render markdown in timeline:", error);
				// Fallback to plain text if rendering fails
				contentContainer.setText(event.content);
			});
		} else {
			// Fallback for non-task events
			contentContainer.setText(event.content);
		}

		// Event actions
		const actionsEl = eventEl.createDiv("timeline-event-actions");

		if (event.task) {
			// Go to task
			const gotoBtn = actionsEl.createDiv("timeline-event-action");
			setIcon(gotoBtn, "external-link");
			gotoBtn.setAttribute("aria-label", t("Go to task"));
			this.registerDomEvent(gotoBtn, "click", () => {
				this.goToTask(event.task!);
			});
		}

		// Click to focus (but not when clicking on checkbox or actions)
		this.registerDomEvent(eventEl, "click", (e) => {
			// Prevent navigation if clicking on checkbox or action buttons
			const target = e.target as HTMLElement;
			if (
				target.closest(".timeline-event-checkbox") ||
				target.closest(".timeline-event-actions") ||
				target.closest('input[type="checkbox"]')
			) {
				return;
			}

			if (event.task) {
				this.goToTask(event.task);
			}
		});
	}

	private async goToTask(task: Task): Promise<void> {
		const file = this.app.vault.getFileByPath(task.filePath);
		if (!file) return;

		// Check if it's a canvas file
		if ((task.metadata as any).sourceType === "canvas") {
			// For canvas files, open directly
			const leaf = this.app.workspace.getLeaf("tab");
			await leaf.openFile(file);
			this.app.workspace.setActiveLeaf(leaf, { focus: true });
			return;
		}

		// For markdown files, prefer activating existing leaf if file is open
		const existingLeaf = this.app.workspace
			.getLeavesOfType("markdown")
			.find(
				(leaf) => (leaf.view as any).file === file // Type assertion needed here
			);

		const leafToUse = existingLeaf || this.app.workspace.getLeaf("tab"); // Open in new tab if not open

		await leafToUse.openFile(file, {
			active: true, // Ensure the leaf becomes active
			eState: {
				line: task.line,
			},
		});
		// Focus the editor after opening
		this.app.workspace.setActiveLeaf(leafToUse, { focus: true });
	}

	private async handleQuickCapture(): Promise<void> {
		if (!this.markdownEditor) return;

		const content = this.markdownEditor.value.trim();
		if (!content) return;

		try {
			// Use the plugin's quick capture settings
			const captureOptions = this.plugin.settings.quickCapture;
			await saveCapture(this.app, content, captureOptions);

			// Clear the input
			this.markdownEditor.set("", false);

			// Refresh timeline
			await this.loadEvents();
			this.renderTimeline();

			// Check if we should collapse after capture
			if (this.plugin.settings.timelineSidebar.quickInputCollapseOnCapture) {
				this.toggleInputCollapse();
			} else {
				// Focus back to input
				this.markdownEditor.editor?.focus();
			}
		} catch (error) {
			console.error("Failed to capture:", error);
		}
	}

	private scrollToToday(): void {
		const todayEl = this.timelineContainerEl.querySelector(
			".timeline-date-group.is-today"
		);
		if (todayEl) {
			this.isAutoScrolling = true;
			todayEl.scrollIntoView({ behavior: "smooth", block: "start" });
			setTimeout(() => {
				this.isAutoScrolling = false;
			}, 1000);
		}
	}

	private toggleFocusMode(): void {
		this.timelineContainerEl.toggleClass(
			"focus-mode",
			!this.timelineContainerEl.hasClass("focus-mode")
		);
		// In focus mode, only show today's events
		// Implementation depends on specific requirements
	}

	private handleScroll(): void {
		if (this.isAutoScrolling) return;

		// Implement infinite scroll or lazy loading if needed
		const { scrollTop, scrollHeight, clientHeight } =
			this.timelineContainerEl;

		// Load more events when near bottom
		if (scrollTop + clientHeight >= scrollHeight - 100) {
			// Load more historical events
			this.loadMoreEvents();
		}
	}

	private async loadMoreEvents(): Promise<void> {
		// Implement loading more historical events
		// This could involve loading older tasks or extending the date range
	}

	private async toggleTaskCompletion(
		task: Task,
		event?: TimelineEvent
	): Promise<void> {
		const updatedTask = { ...task, completed: !task.completed };

		if (updatedTask.completed) {
			updatedTask.metadata.completedDate = Date.now();
			const completedMark = (
				this.plugin.settings.taskStatuses.completed || "x"
			).split("|")[0];
			if (updatedTask.status !== completedMark) {
				updatedTask.status = completedMark;
			}
		} else {
			updatedTask.metadata.completedDate = undefined;
			const notStartedMark =
				this.plugin.settings.taskStatuses.notStarted || " ";
			if (updatedTask.status.toLowerCase() === "x") {
				updatedTask.status = notStartedMark;
			}
		}

		const taskManager = this.plugin.taskManager;
		if (!taskManager) return;

		try {
			await taskManager.updateTask(updatedTask);

			// Update the local event data immediately for responsive UI
			if (event) {
				event.task = updatedTask;
				event.status = updatedTask.status;

				// Update the event element's visual state immediately
				const eventEl = this.timelineContainerEl.querySelector(
					`[data-event-id="${event.id}"]`
				) as HTMLElement;
				if (eventEl) {
					if (updatedTask.completed) {
						eventEl.addClass("is-completed");
					} else {
						eventEl.removeClass("is-completed");
					}
				}
			}

			// Reload events to ensure consistency
			await this.loadEvents();
			this.renderTimeline();
		} catch (error) {
			console.error("Failed to toggle task completion:", error);
			// Revert local changes if the update failed
			if (event) {
				event.task = task;
				event.status = task.status;
			}
		}
	}

	private updateTargetInfo(targetInfoEl: HTMLElement): void {
		targetInfoEl.empty();

		const settings = this.plugin.settings.quickCapture;
		let targetText = "";

		if (settings.targetType === "daily-note") {
			const dateStr = moment().format(settings.dailyNoteSettings.format);
			const fileName = `${dateStr}.md`;
			const fullPath = settings.dailyNoteSettings.folder
				? `${settings.dailyNoteSettings.folder}/${fileName}`
				: fileName;
			targetText = `${t("to")} ${fullPath}`;
		} else {
			targetText = `${t("to")} ${
				settings.targetFile || "Quick Capture.md"
			}`;
		}

		if (settings.targetHeading) {
			targetText += ` → ${settings.targetHeading}`;
		}

		targetInfoEl.setText(targetText);
		targetInfoEl.setAttribute("title", targetText);
	}

	// Method to trigger view update (called when settings change)
	public async triggerViewUpdate(): Promise<void> {
		await this.loadEvents();
		this.renderTimeline();
	}

	// Method to refresh timeline data
	public async refreshTimeline(): Promise<void> {
		await this.loadEvents();
		this.renderTimeline();
	}

	// Create collapsed header content
	private createCollapsedHeader(): void {
		if (!this.collapsedHeaderEl) return;

		// Expand button
		const expandBtn = this.collapsedHeaderEl.createDiv("collapsed-expand-btn");
		setIcon(expandBtn, "chevron-right");
		expandBtn.setAttribute("aria-label", t("Expand quick input"));
		this.registerDomEvent(expandBtn, "click", () => {
			this.toggleInputCollapse();
		});

		// Title
		const titleEl = this.collapsedHeaderEl.createDiv("collapsed-title");
		titleEl.setText(t("Quick Capture"));

		// Quick actions
		if (this.plugin.settings.timelineSidebar.quickInputShowQuickActions) {
			const quickActionsEl = this.collapsedHeaderEl.createDiv("collapsed-quick-actions");

			// Quick capture button
			const quickCaptureBtn = quickActionsEl.createDiv("collapsed-quick-capture");
			setIcon(quickCaptureBtn, "plus");
			quickCaptureBtn.setAttribute("aria-label", t("Quick capture"));
			this.registerDomEvent(quickCaptureBtn, "click", () => {
				// Expand and focus editor
				if (this.isInputCollapsed) {
					this.toggleInputCollapse();
					setTimeout(() => {
						this.markdownEditor?.editor?.focus();
					}, 350); // Wait for animation
				}
			});

			// More options button
			const moreOptionsBtn = quickActionsEl.createDiv("collapsed-more-options");
			setIcon(moreOptionsBtn, "more-horizontal");
			moreOptionsBtn.setAttribute("aria-label", t("More options"));
			this.registerDomEvent(moreOptionsBtn, "click", () => {
				new QuickCaptureModal(this.app, this.plugin, {}, true).open();
			});
		}
	}

	// Toggle collapse state
	private toggleInputCollapse(): void {
		if (this.isAnimating) return;

		this.isAnimating = true;
		this.isInputCollapsed = !this.isInputCollapsed;

		// Save state to settings
		this.plugin.settings.timelineSidebar.quickInputCollapsed = this.isInputCollapsed;
		this.plugin.saveSettings();

		if (this.isInputCollapsed) {
			this.handleCollapseEditor();
		} else {
			this.handleExpandEditor();
		}

		// Reset animation flag after animation completes
		setTimeout(() => {
			this.isAnimating = false;
		}, this.plugin.settings.timelineSidebar.quickInputAnimationDuration);
	}

	// Handle collapsing the editor
	private handleCollapseEditor(): void {
		// Save current editor content
		if (this.markdownEditor) {
			this.tempEditorContent = this.markdownEditor.value;
		}

		// Add collapsed class for animation
		this.quickInputContainerEl.addClass("is-collapsing");
		this.quickInputContainerEl.addClass("is-collapsed");

		// Show collapsed header after a slight delay
		setTimeout(() => {
			this.collapsedHeaderEl?.show();
			this.quickInputContainerEl.removeClass("is-collapsing");
		}, 50);

		// Update collapse button icon
		const collapseBtn = this.quickInputHeaderEl?.querySelector(".quick-input-collapse-btn");
		if (collapseBtn) {
			setIcon(collapseBtn as HTMLElement, "chevron-right");
			collapseBtn.setAttribute("aria-label", t("Expand quick input"));
		}
	}

	// Handle expanding the editor
	private handleExpandEditor(): void {
		// Hide collapsed header immediately
		this.collapsedHeaderEl?.hide();

		// Remove collapsed class for animation
		this.quickInputContainerEl.addClass("is-expanding");
		this.quickInputContainerEl.removeClass("is-collapsed");

		// Restore editor content
		if (this.markdownEditor && this.tempEditorContent) {
			this.markdownEditor.set(this.tempEditorContent, false);
			this.tempEditorContent = "";
		}

		// Focus editor after animation
		setTimeout(() => {
			this.quickInputContainerEl.removeClass("is-expanding");
			this.markdownEditor?.editor?.focus();
		}, 50);

		// Update collapse button icon
		const collapseBtn = this.quickInputHeaderEl?.querySelector(".quick-input-collapse-btn");
		if (collapseBtn) {
			setIcon(collapseBtn as HTMLElement, "chevron-down");
			collapseBtn.setAttribute("aria-label", t("Collapse quick input"));
		}
	}
}
