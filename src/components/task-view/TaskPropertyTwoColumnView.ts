import { App, setIcon } from "obsidian";
import { Task } from "../../types/task";
import { TwoColumnViewBase, TwoColumnViewConfig } from "./TwoColumnViewBase";
import { t } from "../../translations/helper";
import TaskProgressBarPlugin from "../../index";
import { TwoColumnSpecificConfig } from "../../common/setting-definition";
import "../../styles/property-view.css";
import { getEffectiveProject } from "../../utils/taskUtil";

/**
 * A two-column view that displays task properties in the left column
 * and related tasks in the right column.
 */
export class TaskPropertyTwoColumnView extends TwoColumnViewBase<string> {
	private propertyValueMap: Map<string, Task[]> = new Map();
	private propertyKey: string;
	private sortedPropertyValues: string[] = [];

	constructor(
		parentEl: HTMLElement,
		app: App,
		plugin: TaskProgressBarPlugin,
		private viewConfig: TwoColumnSpecificConfig,
		private viewId?: string
	) {
		// Create the base configuration for the two-column view
		const config: TwoColumnViewConfig = {
			classNamePrefix: "task-property",
			leftColumnTitle: viewConfig.leftColumnTitle,
			rightColumnDefaultTitle: viewConfig.rightColumnDefaultTitle,
			multiSelectText: viewConfig.multiSelectText,
			emptyStateText: viewConfig.emptyStateText,
			rendererContext: "task-property-view",
			itemIcon: getIconForProperty(viewConfig.taskPropertyKey),
		};

		super(parentEl, app, plugin, config);
		this.propertyKey = viewConfig.taskPropertyKey;
	}

	/**
	 * Build index of tasks by the selected property
	 */
	protected buildItemsIndex(): void {
		// Clear existing index
		this.propertyValueMap.clear();

		// Group tasks by the selected property
		for (const task of this.allTasks) {
			const values = this.getPropertyValues(task);

			// If no values found, add to a special "None" category
			if (!values || values.length === 0) {
				const noneKey = t("None");
				if (!this.propertyValueMap.has(noneKey)) {
					this.propertyValueMap.set(noneKey, []);
				}
				this.propertyValueMap.get(noneKey)?.push(task);
				continue;
			}

			// Add task to each of its property values
			for (const value of values) {
				const normalizedValue = String(value);
				if (!this.propertyValueMap.has(normalizedValue)) {
					this.propertyValueMap.set(normalizedValue, []);
				}
				this.propertyValueMap.get(normalizedValue)?.push(task);
			}
		}

		// Sort the property values
		this.sortedPropertyValues = Array.from(
			this.propertyValueMap.keys()
		).sort((a, b) =>
			this.getSortValue(a).localeCompare(this.getSortValue(b))
		);
	}

	/**
	 * Get sort value for a property value
	 * Special handling for certain property types
	 */
	private getSortValue(value: string): string {
		// Special handling for priorities
		if (this.propertyKey === "priority") {
			// Sort numerically, with undefined priority last
			if (value === t("None")) return "999"; // None goes last
			return value.padStart(3, "0"); // Pad with zeros for correct numeric sorting
		}

		// For dates, convert to timestamp
		if (
			["dueDate", "startDate", "scheduledDate"].includes(this.propertyKey)
		) {
			if (value === t("None")) return "9999-12-31"; // None goes last
			return value;
		}

		return value;
	}

	/**
	 * Extract values for the selected property from a task
	 */
	private getPropertyValues(task: Task): any[] {
		switch (this.propertyKey) {
			case "tags":
				return task.metadata.tags || [];
			case "project":
				const effectiveProject = getEffectiveProject(task);
				return effectiveProject ? [effectiveProject] : [];
			case "priority":
				return task.metadata.priority !== undefined
					? [task.metadata.priority.toString()]
					: [];
			case "context":
				return task.metadata.context ? [task.metadata.context] : [];
			case "status":
				return [task.status || ""];
			case "dueDate":
				return task.metadata.dueDate
					? [this.formatDate(task.metadata.dueDate)]
					: [];
			case "startDate":
				return task.metadata.startDate
					? [this.formatDate(task.metadata.startDate)]
					: [];
			case "scheduledDate":
				return task.metadata.scheduledDate
					? [this.formatDate(task.metadata.scheduledDate)]
					: [];
			case "cancelledDate":
				return task.metadata.cancelledDate
					? [this.formatDate(task.metadata.cancelledDate)]
					: [];
			case "filePath":
				// Extract just the filename without path and extension
				const pathParts = task.filePath.split("/");
				const fileName = pathParts[pathParts.length - 1].replace(
					/\.[^/.]+$/,
					""
				);
				return [fileName];
			default:
				return [];
		}
	}

	/**
	 * Format date as YYYY-MM-DD
	 */
	private formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
			2,
			"0"
		)}-${String(date.getDate()).padStart(2, "0")}`;
	}

	/**
	 * Render the list of property values in the left column
	 */
	protected renderItemsList(): void {
		this.itemsListEl.empty();

		// Update the empty state if no property values exist
		if (this.sortedPropertyValues.length === 0) {
			const emptyEl = this.itemsListEl.createDiv({
				cls: "task-property-empty-state",
			});
			emptyEl.setText(t("No items found"));
			return;
		}

		// Create a list item for each property value
		for (const value of this.sortedPropertyValues) {
			const tasks = this.propertyValueMap.get(value) || [];
			const itemEl = this.itemsListEl.createDiv({
				cls: "task-property-list-item",
			});

			// Add selection highlighting
			if (this.selectedItems.items.includes(value)) {
				itemEl.addClass("selected");
			}

			// Create the item with icon and count
			const iconEl = itemEl.createSpan({
				cls: "task-property-icon",
			});
			setIcon(iconEl, this.config.itemIcon);

			const nameEl = itemEl.createSpan({
				cls: "task-property-name",
				text: this.formatDisplayValue(value),
			});

			const countEl = itemEl.createSpan({
				cls: "task-property-count",
				text: String(tasks.length),
			});

			// Handle item selection
			this.registerDomEvent(itemEl, "click", (event: MouseEvent) => {
				// Using Ctrl/Cmd key allows multi-select
				const isCtrlPressed = event.ctrlKey || event.metaKey;
				this.handleItemSelection(value, isCtrlPressed);
				this.renderItemsList(); // Refresh to update selection visuals
			});
		}
	}

	/**
	 * Format display value based on property type
	 */
	private formatDisplayValue(value: string): string {
		if (this.propertyKey === "priority") {
			switch (value) {
				case "1":
					return t("High Priority");
				case "2":
					return t("Medium Priority");
				case "3":
					return t("Low Priority");
				default:
					return value;
			}
		}

		// For dates, could add "Today", "Tomorrow", etc.
		if (
			["dueDate", "startDate", "scheduledDate", "cancelledDate"].includes(
				this.propertyKey
			)
		) {
			const today = this.formatDate(Date.now());
			if (value === today) return t("Today");
		}

		return value;
	}

	/**
	 * Update tasks shown in the right column based on selected property values
	 */
	protected updateSelectedTasks(): void {
		// Get tasks for the selected property values
		this.filteredTasks = [];

		// If no selection, show all tasks (or empty)
		if (this.selectedItems.items.length === 0) {
			this.cleanupRenderers();
			this.renderEmptyTaskList(t(this.config.emptyStateText));
			return;
		}

		// Gather tasks from all selected property values
		for (const value of this.selectedItems.items) {
			const tasks = this.propertyValueMap.get(value) || [];

			// Avoid adding duplicates
			for (const task of tasks) {
				if (!this.filteredTasks.some((t) => t.id === task.id)) {
					this.filteredTasks.push(task);
				}
			}
		}

		// Remember tasks in selection state for other methods
		this.selectedItems.tasks = this.filteredTasks;

		// Render the task list
		this.renderTaskList();
	}

	/**
	 * Handle task updates by rebuilding the affected parts of the index
	 */
	public updateTask(updatedTask: Task): void {
		// Find if the task was previously indexed
		let oldValues: string[] = [];
		for (const [value, tasks] of this.propertyValueMap) {
			if (tasks.some((task) => task.id === updatedTask.id)) {
				oldValues.push(value);
			}
		}

		// Remove the task from its old property values
		for (const value of oldValues) {
			const tasks = this.propertyValueMap.get(value) || [];
			this.propertyValueMap.set(
				value,
				tasks.filter((task) => task.id !== updatedTask.id)
			);

			// If no tasks left for this value, remove the property value
			if (this.propertyValueMap.get(value)?.length === 0) {
				this.propertyValueMap.delete(value);
				this.sortedPropertyValues = this.sortedPropertyValues.filter(
					(v) => v !== value
				);
			}
		}

		// Add the task to its new property values
		const newValues = this.getPropertyValues(updatedTask);
		for (const value of newValues) {
			const normalizedValue = String(value);
			if (!this.propertyValueMap.has(normalizedValue)) {
				this.propertyValueMap.set(normalizedValue, []);
				this.sortedPropertyValues.push(normalizedValue);
				// Resort the property values
				this.sortedPropertyValues.sort((a, b) =>
					this.getSortValue(a).localeCompare(this.getSortValue(b))
				);
			}
			this.propertyValueMap.get(normalizedValue)?.push(updatedTask);
		}

		// If the task is in the filtered tasks, update it there too
		const taskIndex = this.filteredTasks.findIndex(
			(task) => task.id === updatedTask.id
		);
		if (taskIndex >= 0) {
			this.filteredTasks[taskIndex] = updatedTask;
		}

		// Update the task in the allTasks array too
		const allTaskIndex = this.allTasks.findIndex(
			(task) => task.id === updatedTask.id
		);
		if (allTaskIndex >= 0) {
			this.allTasks[allTaskIndex] = updatedTask;
		}

		// Re-render the UI to reflect changes
		this.renderItemsList();
		if (this.filteredTasks.length > 0) {
			this.renderTaskList();
		}
	}

	/**
	 * Get the view ID associated with this component
	 */
	public getViewId(): string {
		return this.viewId || "";
	}
}

/**
 * Get an appropriate icon name for a property type
 */
function getIconForProperty(propertyKey: string): string {
	switch (propertyKey) {
		case "tags":
			return "tag";
		case "project":
			return "folder";
		case "priority":
			return "alert-triangle";
		case "context":
			return "at-sign";
		case "status":
			return "check-square";
		case "dueDate":
			return "calendar";
		case "startDate":
			return "play";
		case "scheduledDate":
			return "calendar-clock";
		case "filePath":
			return "file";
		default:
			return "list";
	}
}
