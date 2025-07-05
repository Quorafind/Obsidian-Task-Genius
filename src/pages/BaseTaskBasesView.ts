/**
 * Base Task Bases View
 * Abstract base class for all task-based Bases views
 * Provides common BasesView interface implementation
 *
 * Update Mechanism:
 * - Uses Bases native API (updateProperty/setValue) for task updates
 * - Maps Task metadata to appropriate Bases properties
 * - Provides error handling and user feedback for update failures
 * - Maintains local task state for UI responsiveness
 */

import { Component, App, TFile } from "obsidian";
import { Task } from "../types/task";
import TaskProgressBarPlugin from "../index";
import { ViewMode } from "../common/setting-definition";
import { TaskDetailsComponent } from "../components/task-view/details";
import { t } from "../translations/helper";

// Import BasesView types
interface BasesViewSettings {
	get(key: string): any;
	set(data: any): void;
	getOrder(): string[] | null;
	setOrder(order: string[]): void;
	getDisplayName(prop: any): string;
	setDisplayName(prop: any, name: string): void;
	getViewName(): string;
}

interface BasesViewData {
	entries: any[];
}

interface BasesProperty {
	name: string;
	type: string;
	dataType?: string;
}

interface BaseView {
	onload?(): void;
	onunload?(): void;
	onActionsMenu(): Array<{
		name: string;
		callback: () => void;
		icon: string;
	}>;
	onEditMenu(): Array<{
		displayName: string;
		component: (container: HTMLElement) => any;
	}>;
	onResize(): void;
}

interface BasesView extends BaseView {
	type: string;
	app: App;
	containerEl: HTMLElement;
	settings: BasesViewSettings;
	data: BasesViewData[];
	properties: BasesProperty[];
	updateConfig(settings: BasesViewSettings): void;
	updateData(properties: BasesProperty[], data: BasesViewData[]): void;
	display(): void;
}

export abstract class BaseTaskBasesView extends Component implements BasesView {
	// BasesView interface properties
	abstract type: string;
	app: App;
	containerEl: HTMLElement;
	settings: BasesViewSettings;
	data: BasesViewData[] = [];
	properties: BasesProperty[] = [];

	// Task-specific properties
	protected plugin: TaskProgressBarPlugin;
	protected tasks: Task[] = [];
	protected viewMode: ViewMode;

	// Details panel properties
	protected detailsComponent: TaskDetailsComponent;
	protected isDetailsVisible: boolean = false;
	protected currentSelectedTaskId: string | null = null;
	protected lastToggleTimestamp: number = 0;

	constructor(
		containerEl: HTMLElement,
		app: App,
		plugin: TaskProgressBarPlugin,
		viewMode: ViewMode
	) {
		super();
		this.containerEl = containerEl;
		this.app = app;
		this.plugin = plugin;
		this.viewMode = viewMode;

		// Initialize container with details support
		this.containerEl.empty();
		this.containerEl.toggleClass(
			[
				"base-task-bases-view",
				"task-genius-view",
				"task-genius-container",
				"no-sidebar",
			],
			true
		);

		// Initialize details component
		this.initializeDetailsComponent();
	}

	/**
	 * Initialize the task details component
	 */
	private initializeDetailsComponent(): void {
		this.detailsComponent = new TaskDetailsComponent(
			this.containerEl,
			this.app,
			this.plugin
		);
		this.addChild(this.detailsComponent);
		this.detailsComponent.load();

		// Setup details component events
		this.setupDetailsEvents();

		// Initially hide details
		this.toggleDetailsVisibility(false);
	}

	/**
	 * Setup details component event handlers
	 */
	private setupDetailsEvents(): void {
		this.detailsComponent.onTaskToggleComplete = (task: Task) => {
			this.handleTaskCompletion(task);
		};

		this.detailsComponent.onTaskEdit = (task: Task) => {
			this.handleTaskEdit(task);
		};

		this.detailsComponent.onTaskUpdate = async (
			originalTask: Task,
			updatedTask: Task
		) => {
			await this.handleTaskUpdate(originalTask, updatedTask);
		};

		this.detailsComponent.toggleDetailsVisibility = (visible: boolean) => {
			this.toggleDetailsVisibility(visible);
		};
	}

	/**
	 * Handle task selection - show details panel
	 */
	protected handleTaskSelection(task: Task | null): void {
		if (task) {
			const now = Date.now();
			const timeSinceLastToggle = now - this.lastToggleTimestamp;

			if (this.currentSelectedTaskId !== task.id) {
				this.currentSelectedTaskId = task.id;
				this.detailsComponent.showTaskDetails(task);
				if (!this.isDetailsVisible) {
					this.toggleDetailsVisibility(true);
				}
				this.lastToggleTimestamp = now;
				return;
			}

			// Toggle details visibility on double-click/re-click
			if (timeSinceLastToggle > 150) {
				// Debounce slightly
				this.toggleDetailsVisibility(!this.isDetailsVisible);
				this.lastToggleTimestamp = now;
			}
		} else {
			// Deselecting task explicitly
			this.toggleDetailsVisibility(false);
			this.currentSelectedTaskId = null;
		}
	}

	/**
	 * Toggle details panel visibility
	 */
	protected toggleDetailsVisibility(visible: boolean): void {
		this.isDetailsVisible = visible;
		this.containerEl.toggleClass("details-visible", visible);
		this.containerEl.toggleClass("details-hidden", !visible);

		this.detailsComponent.setVisible(visible);

		if (!visible) {
			this.currentSelectedTaskId = null;
		}
	}

	/**
	 * Handle task completion
	 */
	protected async handleTaskCompletion(task: Task): Promise<void> {
		const updatedTask = { ...task, completed: !task.completed };

		if (updatedTask.completed) {
			// Set completion time
			if (updatedTask.metadata) {
				updatedTask.metadata.completedDate = Date.now();
			}
			const completedMark = (
				this.plugin.settings.taskStatuses.completed || "x"
			).split("|")[0];
			if (updatedTask.status !== completedMark) {
				updatedTask.status = completedMark;
			}
		} else {
			// Clear completion time
			if (updatedTask.metadata) {
				updatedTask.metadata.completedDate = undefined;
			}
			const notStartedMark =
				this.plugin.settings.taskStatuses.notStarted || " ";
			if (updatedTask.status.toLowerCase() === "x") {
				updatedTask.status = notStartedMark;
			}
		}

		try {
			// Use Bases native update instead of TaskManager
			await this.updateBasesEntry(task, updatedTask);

			// Update task in local list immediately for responsiveness
			const index = this.tasks.findIndex((t) => t.id === task.id);
			if (index !== -1) {
				this.tasks[index] = updatedTask;
			}

			// If this is the currently selected task, refresh details view
			if (this.currentSelectedTaskId === updatedTask.id) {
				this.detailsComponent.showTaskDetails(updatedTask);
			}

			// Trigger view update
			this.onDataUpdated();
		} catch (error) {
			console.error(
				`[${this.type}] Failed to update task completion:`,
				error
			);
			// Show user-friendly error message
			this.showUpdateError(error);
		}
	}

	/**
	 * Handle task editing in file
	 */
	protected async handleTaskEdit(task: Task): Promise<void> {
		const file = this.app.vault.getFileByPath(task.filePath);
		if (!file || !(file instanceof TFile)) return;

		// Open the file
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);

		// Try to set the cursor at the task's line
		const editor = this.app.workspace.activeEditor?.editor;
		if (editor) {
			editor.setCursor({ line: task.line || 0, ch: 0 });
			editor.focus();
		}
	}

	/**
	 * Handle task update from details panel
	 */
	protected async handleTaskUpdate(
		originalTask: Task,
		updatedTask: Task
	): Promise<void> {
		try {
			// Use Bases native update instead of TaskManager
			await this.updateBasesEntry(originalTask, updatedTask);

			// Update task in local list immediately for responsiveness
			const index = this.tasks.findIndex((t) => t.id === originalTask.id);
			if (index !== -1) {
				this.tasks[index] = updatedTask;
			}

			// If the updated task is the currently selected one, refresh details view
			// Only refresh if not currently editing to prevent UI disruption
			if (this.currentSelectedTaskId === updatedTask.id) {
				if (this.detailsComponent.isCurrentlyEditing()) {
					// Update the current task reference without re-rendering UI
					this.currentTask = updatedTask;
				} else {
					this.detailsComponent.showTaskDetails(updatedTask);
				}
			}

			// Trigger view update
			this.onDataUpdated();
		} catch (error) {
			console.error(`[${this.type}] Failed to update task:`, error);
			// Show user-friendly error message
			this.showUpdateError(error);
		}
	}

	/**
	 * Update Bases entry using native Bases API
	 */
	private async updateBasesEntry(
		originalTask: Task,
		updatedTask: Task
	): Promise<void> {
		try {
			// Find the original entry that corresponds to this task
			const entry = this.findEntryByTaskId(originalTask.id);
			if (!entry) {
				throw new Error(
					`Original entry not found for task ID: ${originalTask.id}`
				);
			}

			// Debug Bases API availability
			this.debugBasesApiAvailability(entry);

			// Map task metadata to Bases properties
			const updates = this.mapTaskMetadataToBases(
				originalTask,
				updatedTask
			);
			console.log(`[${this.type}] Mapped updates:`, updates);

			// Apply updates using Bases native API
			for (const [propertyName, value] of Object.entries(updates)) {
				await this.updateBasesProperty(entry, propertyName, value);
			}

			console.log(
				`[${this.type}] Successfully updated Bases entry for task ${updatedTask.id}`
			);
		} catch (error) {
			console.error(
				`[${this.type}] Failed to update Bases entry:`,
				error
			);
			throw error;
		}
	}

	/**
	 * Update a single Bases property
	 */
	private async updateBasesProperty(
		entry: any,
		propertyName: string,
		value: any
	): Promise<void> {
		try {
			console.log(
				`[${this.type}] Attempting to update property ${propertyName} with value:`,
				value
			);

			// Use Bases native updateProperty method if available
			if (typeof entry.updateProperty === "function") {
				console.log(
					`[${this.type}] Using entry.updateProperty for ${propertyName}`
				);
				await entry.updateProperty(propertyName, value);
				console.log(
					`[${this.type}] Successfully updated ${propertyName} via updateProperty`
				);
				return;
			}

			// Fallback: try to update through the entry's setValue method
			if (typeof entry.setValue === "function") {
				console.log(
					`[${this.type}] Using entry.setValue for ${propertyName}`
				);
				await entry.setValue(
					{ type: "note", name: propertyName },
					value
				);
				console.log(
					`[${this.type}] Successfully updated ${propertyName} via setValue`
				);
				return;
			}

			// If no native update method available, log warning
			console.warn(
				`[${this.type}] No native update method available for property ${propertyName}`
			);
			console.warn(
				`[${this.type}] Available entry methods:`,
				Object.keys(entry).filter(
					(key) => typeof entry[key] === "function"
				)
			);
		} catch (error) {
			console.error(
				`[${this.type}] Failed to update property ${propertyName}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * Map Task metadata to Bases properties
	 */
	private mapTaskMetadataToBases(
		originalTask: Task,
		updatedTask: Task
	): Record<string, any> {
		const updates: Record<string, any> = {};

		// Check content changes
		if (originalTask.content !== updatedTask.content) {
			updates.title = updatedTask.content;
			updates.content = updatedTask.content;
		}

		// Check metadata changes
		const originalMeta = originalTask.metadata;
		const updatedMeta = updatedTask.metadata;

		// Project
		if (originalMeta.project !== updatedMeta.project) {
			updates.project = updatedMeta.project;
		}

		// Tags
		if (
			JSON.stringify(originalMeta.tags) !==
			JSON.stringify(updatedMeta.tags)
		) {
			updates.tags = updatedMeta.tags;
		}

		// Context
		if (originalMeta.context !== updatedMeta.context) {
			updates.context = updatedMeta.context;
		}

		// Priority
		if (originalMeta.priority !== updatedMeta.priority) {
			updates.priority = updatedMeta.priority;
		}

		// Dates
		if (originalMeta.dueDate !== updatedMeta.dueDate) {
			updates.dueDate = updatedMeta.dueDate
				? new Date(updatedMeta.dueDate)
				: undefined;
			updates.due = updatedMeta.dueDate
				? new Date(updatedMeta.dueDate)
				: undefined;
		}

		if (originalMeta.startDate !== updatedMeta.startDate) {
			updates.startDate = updatedMeta.startDate
				? new Date(updatedMeta.startDate)
				: undefined;
			updates.start = updatedMeta.startDate
				? new Date(updatedMeta.startDate)
				: undefined;
		}

		if (originalMeta.scheduledDate !== updatedMeta.scheduledDate) {
			updates.scheduledDate = updatedMeta.scheduledDate
				? new Date(updatedMeta.scheduledDate)
				: undefined;
			updates.scheduled = updatedMeta.scheduledDate
				? new Date(updatedMeta.scheduledDate)
				: undefined;
		}

		if (originalMeta.completedDate !== updatedMeta.completedDate) {
			updates.completedDate = updatedMeta.completedDate
				? new Date(updatedMeta.completedDate)
				: undefined;
			updates.completed = updatedMeta.completedDate
				? new Date(updatedMeta.completedDate)
				: undefined;
		}

		if (originalMeta.cancelledDate !== updatedMeta.cancelledDate) {
			updates.cancelledDate = updatedMeta.cancelledDate
				? new Date(updatedMeta.cancelledDate)
				: undefined;
			updates.cancelled = updatedMeta.cancelledDate
				? new Date(updatedMeta.cancelledDate)
				: undefined;
		}

		// Other metadata
		if (originalMeta.onCompletion !== updatedMeta.onCompletion) {
			updates.onCompletion = updatedMeta.onCompletion;
		}

		if (
			JSON.stringify(originalMeta.dependsOn) !==
			JSON.stringify(updatedMeta.dependsOn)
		) {
			updates.dependsOn = updatedMeta.dependsOn;
		}

		if (originalMeta.id !== updatedMeta.id) {
			updates.id = updatedMeta.id;
		}

		if (originalMeta.recurrence !== updatedMeta.recurrence) {
			updates.recurrence = updatedMeta.recurrence;
		}

		// Completion status
		if (originalTask.completed !== updatedTask.completed) {
			updates.completed = updatedTask.completed;
			updates.done = updatedTask.completed;
		}

		// Status
		if (originalTask.status !== updatedTask.status) {
			updates.status = updatedTask.status;
		}

		return updates;
	}

	/**
	 * Find the original Bases entry by task ID
	 */
	private findEntryByTaskId(taskId: string): any | null {
		for (const group of this.data) {
			if (!group.entries) continue;

			for (const entry of group.entries) {
				try {
					// Check if this entry corresponds to the task ID
					const entryTaskId = this.generateTaskId(entry);
					if (entryTaskId === taskId) {
						return entry;
					}
				} catch (error) {
					// Continue searching if this entry can't be processed
					continue;
				}
			}
		}
		return null;
	}

	/**
	 * Show user-friendly error message for update failures
	 */
	private showUpdateError(error: any): void {
		// Create a temporary error notification
		const errorEl = this.containerEl.createDiv({
			cls: "bases-update-error-notification",
		});

		errorEl.createDiv({
			cls: "error-icon",
			text: "⚠️",
		});

		const messageEl = errorEl.createDiv({
			cls: "error-message",
		});
		messageEl.createDiv({
			cls: "error-title",
			text: "Failed to update task",
		});
		messageEl.createDiv({
			cls: "error-details",
			text: error.message || "An unknown error occurred",
		});

		// Auto-remove after 5 seconds
		setTimeout(() => {
			if (errorEl.parentNode) {
				errorEl.remove();
			}
		}, 5000);

		// Add click to dismiss
		errorEl.addEventListener("click", () => {
			errorEl.remove();
		});
	}

	// BasesView interface implementation
	updateConfig(settings: BasesViewSettings): void {
		this.settings = settings;
		console.log(`[${this.type}] Config updated:`, settings);
		this.onConfigUpdated();
	}

	updateData(properties: BasesProperty[], data: BasesViewData[]): void {
		console.log(`[${this.type}] Data updated via updateData:`, {
			properties,
			data,
		});
		this.properties = properties;
		this.data = data;

		// Data has been updated, trigger the standard data update flow
		this.onDataUpdated();
	}

	display(): void {
		console.log(`[${this.type}] Displaying view`);
		this.containerEl.show();
		this.onDisplay();
	}

	// BaseView interface implementation
	onload(): void {
		console.log(`[${this.type}] Loading view`);
		this.onViewLoad();
	}

	onunload(): void {
		console.log(`[${this.type}] Unloading view`);
		this.onViewUnload();
		this.unload();
	}

	onActionsMenu(): Array<{
		name: string;
		callback: () => void;
		icon: string;
	}> {
		const baseActions = [
			{
				name: "Refresh Tasks",
				icon: "refresh-cw",
				callback: () => {
					this.refreshTasks();
				},
			},
		];

		const customActions = this.getCustomActions();
		return [...baseActions, ...customActions];
	}

	onEditMenu(): Array<{
		displayName: string;
		component: (container: HTMLElement) => any;
	}> {
		return this.getEditMenuItems();
	}

	onResize(): void {
		this.onViewResize();
	}

	// Protected methods for data conversion
	protected convertEntriesToTasks(): boolean {
		console.log(`[${this.type}] Converting entries to tasks`);
		console.log(`[${this.type}] Raw data:`, this.data);

		if (!this.data || this.data.length === 0) {
			console.log(`[${this.type}] No data available, clearing tasks`);
			this.tasks = [];
			return true;
		}

		const newTasks: Task[] = [];

		for (const group of this.data) {
			if (!group.entries) {
				console.log(`[${this.type}] Group has no entries:`, group);
				continue;
			}

			console.log(
				`[${this.type}] Processing ${group.entries.length} entries from group`
			);

			for (const entry of group.entries) {
				try {
					const task = this.entryToTask(entry);
					if (task) {
						newTasks.push(task);
					}
				} catch (error) {
					console.error(
						`[${this.type}] Error converting entry to task:`,
						error,
						entry
					);
				}
			}
		}

		console.log(
			`[${this.type}] Converted ${newTasks.length} tasks from ${this.data.length} data groups`
		);

		// Check if tasks have changed
		const hasChanged = this.hasTasksChanged(this.tasks, newTasks);
		this.tasks = newTasks;

		console.log(
			`[${this.type}] Task conversion complete. Has changes: ${hasChanged}`
		);
		return hasChanged;
	}

	protected entryToTask(entry: any): Task | null {
		try {
			// Extract basic file information
			const file = entry.file;
			const frontmatter = entry.frontmatter || {};

			if (!file) {
				console.warn(
					`[${this.type}] Entry missing file information:`,
					entry
				);
				return null;
			}

			// Extract task content from multiple sources
			const content = this.extractTaskContent(entry);

			// Extract task metadata
			const metadata = this.extractTaskMetadata(entry);

			// Extract task status mark
			const status = this.extractTaskStatus(entry);

			console.log("[BaseTaskBasesView] Entry:", entry);

			// Build task object
			const task: Task = {
				id: this.generateTaskId(entry),
				content: content,
				completed: this.extractCompletionStatus(entry),
				status: status,
				filePath: file.path || "",
				line: this.getEntryProperty(entry, "line", "note") || 0,
				originalMarkdown:
					this.getEntryProperty(entry, "originalMarkdown", "note") ||
					content,
				metadata: {
					...metadata,
					children: [],
				},
			};

			return task;
		} catch (error) {
			console.error(
				`[${this.type}] Error converting entry to task:`,
				error,
				entry
			);
			return null;
		}
	}

	protected hasTasksChanged(oldTasks: Task[], newTasks: Task[]): boolean {
		if (oldTasks.length !== newTasks.length) {
			console.log(
				`[${this.type}] Task count changed: ${oldTasks.length} -> ${newTasks.length}`
			);
			return true;
		}

		// Create maps for efficient comparison
		const oldTaskMap = new Map(oldTasks.map((t) => [t.id, t]));

		for (const newTask of newTasks) {
			const oldTask = oldTaskMap.get(newTask.id);
			if (!oldTask) {
				console.log(`[${this.type}] New task detected: ${newTask.id}`);
				return true;
			}

			// Compare basic properties
			if (oldTask.content !== newTask.content) {
				console.log(
					`[${this.type}] Task content changed: ${newTask.id}`
				);
				return true;
			}

			if (oldTask.completed !== newTask.completed) {
				console.log(
					`[${this.type}] Task completion status changed: ${newTask.id}`
				);
				return true;
			}

			if (oldTask.status !== newTask.status) {
				console.log(
					`[${this.type}] Task status changed: ${newTask.id}`
				);
				return true;
			}

			// Compare metadata
			const oldMeta = oldTask.metadata;
			const newMeta = newTask.metadata;

			if (oldMeta.priority !== newMeta.priority) {
				console.log(
					`[${this.type}] Task priority changed: ${newTask.id}`
				);
				return true;
			}

			if (oldMeta.dueDate !== newMeta.dueDate) {
				console.log(
					`[${this.type}] Task due date changed: ${newTask.id}`
				);
				return true;
			}

			if (oldMeta.project !== newMeta.project) {
				console.log(
					`[${this.type}] Task project changed: ${newTask.id}`
				);
				return true;
			}

			// Compare tags array
			const oldTags = oldMeta.tags || [];
			const newTags = newMeta.tags || [];
			if (
				oldTags.length !== newTags.length ||
				!oldTags.every((tag, index) => tag === newTags[index])
			) {
				console.log(`[${this.type}] Task tags changed: ${newTask.id}`);
				return true;
			}
		}

		console.log(`[${this.type}] No significant changes detected in tasks`);
		return false;
	}

	protected refreshTasks(): void {
		// Force refresh by triggering data update flow
		console.log(`[${this.type}] Refreshing tasks`);
		this.onDataUpdated();
	}

	protected forceUpdateTasks(): void {
		// Force update without change detection
		console.log(`[${this.type}] Force updating tasks`);
		this.convertEntriesToTasks();
		this.onDataUpdated();
	}

	/**
	 * Extract task content from entry using multiple sources
	 */
	private extractTaskContent(entry: any): string {
		// Try multiple content sources in priority order
		const contentSources = [
			() => this.getEntryProperty(entry, "title", "note"),
			() => this.getEntryProperty(entry, "content", "note"),
			() => this.getEntryProperty(entry, "text", "note"),
			() => entry.file?.basename,
			() => entry.file?.name,
		];

		for (const getContent of contentSources) {
			try {
				const content = getContent();
				if (content && typeof content === "string" && content.trim()) {
					return content.trim();
				}
			} catch (error) {
				// Continue to next source
			}
		}

		return "Untitled Task";
	}

	/**
	 * Extract task metadata from entry
	 */
	private extractTaskMetadata(entry: any): any {
		return {
			tags: this.extractTags(entry),
			project: this.extractProject(entry),
			tgProject: this.getEntryProperty(entry, "tgProject", "note") || "",
			priority: this.extractPriority(entry),
			dueDate:
				this.extractDate(entry, "dueDate") ||
				this.extractDate(entry, "due"),
			scheduledDate:
				this.extractDate(entry, "scheduledDate") ||
				this.extractDate(entry, "scheduled"),
			startDate:
				this.extractDate(entry, "startDate") ||
				this.extractDate(entry, "start"),
			completedDate:
				this.extractDate(entry, "completedDate") ||
				this.extractDate(entry, "completed"),
			createdDate:
				this.extractDate(entry, "createdDate") ||
				this.extractDate(entry, "created") ||
				this.extractFileCreatedDate(entry),
			cancelledDate:
				this.extractDate(entry, "cancelledDate") ||
				this.extractDate(entry, "cancelled"),
			context: this.getEntryProperty(entry, "context", "note") || "",
			recurrence:
				this.getEntryProperty(entry, "recurrence", "note") || undefined,
			onCompletion:
				this.getEntryProperty(entry, "onCompletion", "note") ||
				undefined,
		};
	}

	/**
	 * Extract completion status from entry
	 */
	private extractCompletionStatus(entry: any): boolean {
		// Check multiple completion indicators
		const completionSources = [
			() => this.getEntryProperty(entry, "completed", "note"),
			() => this.getEntryProperty(entry, "done", "note"),
			() => entry.frontmatter?.completed,
			() => entry.frontmatter?.done,
		];

		for (const getCompleted of completionSources) {
			try {
				const completed = getCompleted();
				if (typeof completed === "boolean") {
					return completed;
				}
				if (typeof completed === "string") {
					return (
						completed.toLowerCase() === "true" || completed === "x"
					);
				}
			} catch (error) {
				// Continue to next source
			}
		}

		return false;
	}

	/**
	 * Extract task status mark from entry
	 */
	private extractTaskStatus(entry: any): string {
		const statusSources = [
			() => this.getEntryProperty(entry, "status", "note"),
			() => entry.frontmatter?.status,
		];

		for (const getStatus of statusSources) {
			try {
				const status = getStatus();
				if (status && typeof status === "string") {
					return status;
				}
			} catch (error) {
				// Continue to next source
			}
		}

		// Default status based on completion
		return this.extractCompletionStatus(entry) ? "x" : " ";
	}

	/**
	 * Extract tags from entry
	 */
	private extractTags(entry: any): string[] {
		const tagSources = [
			() => this.getEntryProperty(entry, "tags", "note"),
			() => entry.frontmatter?.tags,
		];

		for (const getTags of tagSources) {
			try {
				const tags = getTags();
				if (Array.isArray(tags)) {
					return tags.filter((tag) => typeof tag === "string");
				}
				if (typeof tags === "string") {
					return tags
						.split(",")
						.map((tag) => tag.trim())
						.filter((tag) => tag);
				}
			} catch (error) {
				// Continue to next source
			}
		}

		return [];
	}

	/**
	 * Extract project from entry
	 */
	private extractProject(entry: any): string {
		const projectSources = [
			() => this.getEntryProperty(entry, "project", "note"),
			() => entry.frontmatter?.project,
			() => this.extractProjectFromTags(entry),
		];

		for (const getProject of projectSources) {
			try {
				const project = getProject();
				if (project && typeof project === "string") {
					return project.trim();
				}
			} catch (error) {
				// Continue to next source
			}
		}

		return "";
	}

	/**
	 * Extract project from tags
	 */
	private extractProjectFromTags(entry: any): string {
		const tags = this.extractTags(entry);
		const projectTag = tags.find(
			(tag) =>
				tag.startsWith("#project/") ||
				tag.startsWith("project/") ||
				tag.startsWith("#proj/") ||
				tag.startsWith("proj/")
		);

		if (projectTag) {
			return projectTag.replace(/^#?(project|proj)\//, "");
		}

		return "";
	}

	/**
	 * Extract priority from entry
	 */
	private extractPriority(entry: any): number {
		const prioritySources = [
			() => this.getEntryProperty(entry, "priority", "note"),
			() => entry.frontmatter?.priority,
		];

		for (const getPriority of prioritySources) {
			try {
				const priority = getPriority();
				if (typeof priority === "number") {
					return Math.max(0, Math.min(10, priority));
				}
				if (typeof priority === "string") {
					const parsed = parseInt(priority);
					if (!isNaN(parsed)) {
						return Math.max(0, Math.min(10, parsed));
					}
				}
			} catch (error) {
				// Continue to next source
			}
		}

		return 0;
	}

	/**
	 * Extract date from entry
	 */
	private extractDate(entry: any, dateField: string): number | undefined {
		const dateSources = [
			() => this.getEntryProperty(entry, dateField, "note"),
			() => entry.frontmatter?.[dateField],
		];

		for (const getDate of dateSources) {
			try {
				const date = getDate();
				if (typeof date === "number") {
					return date;
				}
				if (typeof date === "string") {
					const parsed = Date.parse(date);
					if (!isNaN(parsed)) {
						return parsed;
					}
				}
				if (date instanceof Date) {
					return date.getTime();
				}
			} catch (error) {
				// Continue to next source
			}
		}

		return undefined;
	}

	/**
	 * Extract file created date
	 */
	private extractFileCreatedDate(entry: any): number | undefined {
		try {
			const file = entry.file;
			if (file?.stat?.ctime) {
				return file.stat.ctime;
			}
		} catch (error) {
			// Ignore error
		}
		return undefined;
	}

	/**
	 * Generate unique task ID from entry
	 */
	private generateTaskId(entry: any): string {
		try {
			const file = entry.file;
			if (file?.path) {
				return file.path;
			}
		} catch (error) {
			// Fallback to random ID
		}

		return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Generic property accessor for Bases entries
	 */
	private getEntryProperty(
		entry: any,
		propertyName: string,
		type: "note" | "file" | "formula" = "note"
	): any {
		try {
			if (typeof entry.getValue === "function") {
				return entry.getValue({ type, name: propertyName });
			}
		} catch (error) {
			// Fallback to direct access
		}

		// Fallback: try direct property access
		try {
			if (type === "note" && entry.frontmatter) {
				return entry.frontmatter[propertyName];
			}
			if (type === "file" && entry.file) {
				return entry.file[propertyName];
			}
		} catch (error) {
			// Ignore error
		}

		return undefined;
	}

	// Abstract methods that subclasses must implement
	protected abstract onConfigUpdated(): void;
	protected abstract onDataUpdated(): void;
	protected abstract onDisplay(): void;
	protected abstract onViewLoad(): void;
	protected abstract onViewUnload(): void;
	protected abstract onViewResize(): void;
	protected abstract getCustomActions(): Array<{
		name: string;
		callback: () => void;
		icon: string;
	}>;
	protected abstract getEditMenuItems(): Array<{
		displayName: string;
		component: (container: HTMLElement) => any;
	}>;

	// Utility methods for subclasses
	protected createErrorContainer(message: string): HTMLElement {
		const errorEl = this.containerEl.createDiv({
			cls: "bases-view-error",
		});

		errorEl.createDiv({
			cls: "bases-view-error-icon",
			text: "⚠️",
		});

		errorEl.createDiv({
			cls: "bases-view-error-message",
			text: message,
		});

		return errorEl;
	}

	protected createLoadingContainer(): HTMLElement {
		const loadingEl = this.containerEl.createDiv({
			cls: "bases-view-loading",
		});

		loadingEl.createDiv({
			cls: "bases-view-loading-spinner",
		});

		loadingEl.createDiv({
			cls: "bases-view-loading-text",
			text: "Loading tasks...",
		});

		return loadingEl;
	}

	protected createEmptyContainer(
		message: string = "No tasks found"
	): HTMLElement {
		const emptyEl = this.containerEl.createDiv({
			cls: "bases-view-empty",
		});

		emptyEl.createDiv({
			cls: "bases-view-empty-icon",
			text: "📋",
		});

		emptyEl.createDiv({
			cls: "bases-view-empty-message",
			text: message,
		});

		return emptyEl;
	}

	/**
	 * Debug method to test Bases API availability
	 */
	private debugBasesApiAvailability(entry: any): void {
		console.log(`[${this.type}] Debugging Bases API for entry:`, entry);

		const availableMethods = Object.keys(entry).filter(
			(key) => typeof entry[key] === "function"
		);
		console.log(`[${this.type}] Available methods:`, availableMethods);

		// Check for common Bases methods
		const expectedMethods = ["updateProperty", "setValue", "getValue"];
		for (const method of expectedMethods) {
			const available = typeof entry[method] === "function";
			console.log(`[${this.type}] ${method}: ${available ? "✓" : "✗"}`);
		}

		// Check entry structure
		console.log(`[${this.type}] Entry keys:`, Object.keys(entry));
		if (entry.file) {
			console.log(`[${this.type}] Entry file:`, entry.file);
		}
		if (entry.frontmatter) {
			console.log(`[${this.type}] Entry frontmatter:`, entry.frontmatter);
		}
	}
}
