/**
 * Task Metadata Editor Component
 * Provides functionality to display and edit task metadata.
 */

import {
	App,
	Component,
	setIcon,
	TextComponent,
	DropdownComponent,
	TextAreaComponent,
} from "obsidian";
import { Task } from "../../types/task";
import TaskProgressBarPlugin from "../../index";
import { t } from "../../translations/helper";
import { ProjectSuggest, TagSuggest, ContextSuggest } from "../AutoComplete";
import { StatusComponent } from "../StatusComponent";
import { format } from "date-fns";
import { getEffectiveProject, isProjectReadonly } from "../../utils/taskUtil";
import { OnCompletionConfigurator } from "../onCompletion/OnCompletionConfigurator";

export interface MetadataChangeEvent {
	field: string;
	value: any;
	task: Task;
}

export class TaskMetadataEditor extends Component {
	private task: Task;
	private container: HTMLElement;
	private plugin: TaskProgressBarPlugin;
	private app: App;
	private isCompactMode: boolean;
	private activeTab: string = "overview"; // Default active tab

	onMetadataChange: (event: MetadataChangeEvent) => void;

	constructor(
		container: HTMLElement,
		app: App,
		plugin: TaskProgressBarPlugin,
		isCompactMode = false
	) {
		super();
		this.container = container;
		this.app = app;
		this.plugin = plugin;
		this.isCompactMode = isCompactMode;
	}

	/**
	 * Displays the task metadata editing interface.
	 */
	showTask(task: Task): void {
		this.task = task;
		this.container.empty();
		this.container.addClass("task-metadata-editor");

		if (this.isCompactMode) {
			this.createTabbedView();
		} else {
			this.createFullView();
		}
	}

	/**
	 * Creates the tabbed view (for Popover - compact mode).
	 */
	private createTabbedView(): void {
		// Create status editor (at the top, outside tabs)
		this.createStatusEditor();

		const tabsContainer = this.container.createDiv({
			cls: "tabs-main-container",
		});
		const nav = tabsContainer.createEl("nav", { cls: "tabs-navigation" });
		const content = tabsContainer.createDiv({ cls: "tabs-content" });

		const tabs = [
			{
				id: "overview",
				label: t("Overview"),
				populateFn: this.populateOverviewTabContent.bind(this),
			},
			{
				id: "dates",
				label: t("Dates"),
				populateFn: this.populateDatesTabContent.bind(this),
			},
			{
				id: "details",
				label: t("Details"),
				populateFn: this.populateDetailsTabContent.bind(this),
			},
		];

		const tabButtons: { [key: string]: HTMLButtonElement } = {};
		const tabPanes: { [key: string]: HTMLDivElement } = {};

		tabs.forEach((tabInfo) => {
			const button = nav.createEl("button", {
				text: tabInfo.label,
				cls: "tab-button",
			});
			button.dataset.tab = tabInfo.id;
			tabButtons[tabInfo.id] = button;

			const pane = content.createDiv({
				cls: "tab-pane",
			});
			pane.id = `tab-pane-${tabInfo.id}`;
			tabPanes[tabInfo.id] = pane;

			tabInfo.populateFn(pane); // Populate content immediately

			this.registerDomEvent(button, "click", () => {
				this.activeTab = tabInfo.id;
				this.updateActiveTab(tabButtons, tabPanes);
			});
		});

		// Set initial active tab
		this.updateActiveTab(tabButtons, tabPanes);
	}

	private updateActiveTab(
		tabButtons: { [key: string]: HTMLButtonElement },
		tabPanes: { [key: string]: HTMLDivElement }
	): void {
		for (const id in tabButtons) {
			if (id === this.activeTab) {
				tabButtons[id].addClass("active");
				tabPanes[id].addClass("active");
			} else {
				tabButtons[id].removeClass("active");
				tabPanes[id].removeClass("active");
			}
		}
	}

	private populateOverviewTabContent(pane: HTMLElement): void {
		this.createPriorityEditor(pane);
		this.createDateEditor(
			pane,
			t("Due Date"),
			"dueDate",
			this.getDateString(this.task.metadata.dueDate)
		);
	}

	private populateDatesTabContent(pane: HTMLElement): void {
		this.createDateEditor(
			pane,
			t("Start Date"),
			"startDate",
			this.getDateString(this.task.metadata.startDate)
		);
		this.createDateEditor(
			pane,
			t("Scheduled Date"),
			"scheduledDate",
			this.getDateString(this.task.metadata.scheduledDate)
		);
		this.createDateEditor(
			pane,
			t("Cancelled Date"),
			"cancelledDate",
			this.getDateString(this.task.metadata.cancelledDate)
		);
		this.createRecurrenceEditor(pane);
	}

	private populateDetailsTabContent(pane: HTMLElement): void {
		this.createProjectEditor(pane);
		this.createTagsEditor(pane);
		this.createContextEditor(pane);
		this.createOnCompletionEditor(pane);
		this.createDependsOnEditor(pane);
		this.createIdEditor(pane);
	}

	/**
	 * Creates the full view (for Modal).
	 */
	private createFullView(): void {
		// Create status editor
		this.createStatusEditor();

		// Create full metadata editing area
		const metadataContainer = this.container.createDiv({
			cls: "metadata-full-container",
		});

		// Project editor
		this.createProjectEditor(metadataContainer);

		// Tags editor
		this.createTagsEditor(metadataContainer);

		// Context editor
		this.createContextEditor(metadataContainer);

		// Priority editor
		this.createPriorityEditor(metadataContainer);

		// Date editor (all date types)
		const datesContainer = metadataContainer.createDiv({
			cls: "dates-container",
		});
		this.createDateEditor(
			datesContainer,
			t("Due Date"),
			"dueDate",
			this.getDateString(this.task.metadata.dueDate)
		);
		this.createDateEditor(
			datesContainer,
			t("Start Date"),
			"startDate",
			this.getDateString(this.task.metadata.startDate)
		);
		this.createDateEditor(
			datesContainer,
			t("Scheduled Date"),
			"scheduledDate",
			this.getDateString(this.task.metadata.scheduledDate)
		);
		this.createDateEditor(
			datesContainer,
			t("Cancelled Date"),
			"cancelledDate",
			this.getDateString(this.task.metadata.cancelledDate)
		);

		// Recurrence rule editor
		this.createRecurrenceEditor(metadataContainer);

		// New fields
		this.createOnCompletionEditor(metadataContainer);
		this.createDependsOnEditor(metadataContainer);
		this.createIdEditor(metadataContainer);
	}

	/**
	 * Converts a date value to a string.
	 */
	private getDateString(dateValue: string | number | undefined): string {
		if (dateValue === undefined) return "";
		if (typeof dateValue === "number") {
			return format(new Date(dateValue), "yyyy-MM-dd");
		}
		return dateValue;
	}

	/**
	 * Creates a status editor.
	 */
	private createStatusEditor(): void {
		const statusContainer = this.container.createDiv({
			cls: "task-status-editor",
		});

		const statusComponent = new StatusComponent(
			this.plugin,
			statusContainer,
			this.task,
			{
				type: "quick-capture",
				onTaskUpdate: async (task, updatedTask) => {
					this.notifyMetadataChange("status", updatedTask.status);
				},
				onTaskStatusSelected: (status) => {
					this.notifyMetadataChange("status", status);
				},
			}
		);

		statusComponent.onload();
	}

	/**
	 * Creates a priority editor.
	 */
	private createPriorityEditor(container: HTMLElement): void {
		const fieldContainer = container.createDiv({
			cls: "field-container priority-container",
		});
		const fieldLabel = fieldContainer.createDiv({ cls: "field-label" });
		fieldLabel.setText(t("Priority"));

		const priorityDropdown = new DropdownComponent(fieldContainer)
			.addOption("", t("None"))
			.addOption("1", "⏬️ " + t("Lowest"))
			.addOption("2", "🔽 " + t("Low"))
			.addOption("3", "🔼 " + t("Medium"))
			.addOption("4", "⏫ " + t("High"))
			.addOption("5", "🔺 " + t("Highest"))
			.onChange((value) => {
				this.notifyMetadataChange("priority", parseInt(value));
			});

		priorityDropdown.selectEl.addClass("priority-select");

		const taskPriority = this.getPriorityString(
			this.task.metadata.priority
		);
		priorityDropdown.setValue(taskPriority || "");
	}

	/**
	 * Converts a priority value to a string.
	 */
	private getPriorityString(priority: string | number | undefined): string {
		if (priority === undefined) return "";
		return String(priority);
	}

	/**
	 * Creates a date editor.
	 */
	private createDateEditor(
		container: HTMLElement,
		label: string, // Already wrapped with t() where called
		field: string,
		value: string
	): void {
		const fieldContainer = container.createDiv({
			cls: `field-container date-container ${field}-container`,
		});
		const fieldLabel = fieldContainer.createDiv({ cls: "field-label" });
		fieldLabel.setText(label);

		const dateInput = fieldContainer.createEl("input", {
			cls: `date-input ${field}-input`,
			type: "date",
		});

		if (value) {
			// Date format conversion using UTC to avoid timezone issues
			try {
				const date = new Date(value);
				const year = date.getUTCFullYear();
				const month = String(date.getUTCMonth() + 1).padStart(2, "0");
				const day = String(date.getUTCDate()).padStart(2, "0");
				dateInput.value = `${year}-${month}-${day}`;
			} catch (e) {
				console.error(`Cannot parse date: ${value}`, e);
			}
		}

		this.registerDomEvent(dateInput, "change", () => {
			const dateValue = dateInput.value;
			if (dateValue) {
				// Create date at noon UTC to avoid timezone edge cases
				const [year, month, day] = dateValue.split("-").map(Number);
				const timestamp = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getTime();
				this.notifyMetadataChange(field, timestamp);
			} else {
				this.notifyMetadataChange(field, undefined);
			}
		});
	}

	/**
	 * Creates a project editor.
	 */
	private createProjectEditor(container: HTMLElement): void {
		const fieldContainer = container.createDiv({
			cls: "field-container project-container",
		});
		const fieldLabel = fieldContainer.createDiv({ cls: "field-label" });
		fieldLabel.setText(t("Project"));

		const effectiveProject = getEffectiveProject(this.task);
		const isReadonly = isProjectReadonly(this.task);

		const projectInput = new TextComponent(fieldContainer)
			.setPlaceholder(t("Project name"))
			.setValue(effectiveProject || "")
			.setDisabled(isReadonly)
			.onChange((value) => {
				if (!isReadonly) {
					this.notifyMetadataChange("project", value);
				}
			});

		// Add visual indicator for tgProject - only show if no user-set project exists
		if (
			isReadonly &&
			this.task.metadata.tgProject &&
			(!this.task.metadata.project || !this.task.metadata.project.trim())
		) {
			fieldContainer.addClass("project-readonly");
			const indicator = fieldContainer.createDiv({
				cls: "project-source-indicator",
				text: `From ${this.task.metadata.tgProject.type}: ${
					this.task.metadata.tgProject.source || ""
				}`,
			});
		}

		this.registerDomEvent(projectInput.inputEl, "blur", () => {
			if (!isReadonly) {
				this.notifyMetadataChange(
					"project",
					projectInput.inputEl.value
				);
			}
		});

		if (!isReadonly) {
			new ProjectSuggest(this.app, projectInput.inputEl, this.plugin);
		}
	}

	/**
	 * Creates a tags editor.
	 */
	private createTagsEditor(container: HTMLElement): void {
		const fieldContainer = container.createDiv({
			cls: "field-container tags-container",
		});
		const fieldLabel = fieldContainer.createDiv({ cls: "field-label" });
		fieldLabel.setText(t("Tags"));

		const tagsInput = new TextComponent(fieldContainer)
			.setPlaceholder(t("e.g. #tag1, #tag2"))
			.setValue(
				Array.isArray(this.task.metadata.tags)
					? this.task.metadata.tags.join(", ")
					: ""
			);

		this.registerDomEvent(tagsInput.inputEl, "blur", () => {
			const tags = tagsInput.inputEl.value
				.split(",")
				.map((tag) => tag.trim())
				.filter((tag) => tag);
			this.notifyMetadataChange("tags", tags);
		});

		new TagSuggest(this.app, tagsInput.inputEl, this.plugin);
	}

	/**
	 * Creates a context editor.
	 */
	private createContextEditor(container: HTMLElement): void {
		const fieldContainer = container.createDiv({
			cls: "field-container context-container",
		});
		const fieldLabel = fieldContainer.createDiv({ cls: "field-label" });
		fieldLabel.setText(t("Context"));

		const contextInput = new TextComponent(fieldContainer)
			.setPlaceholder(t("e.g. @home, @work"))
			.setValue(
				Array.isArray(this.task.metadata.context)
					? this.task.metadata.context.join(", ")
					: ""
			);

		this.registerDomEvent(contextInput.inputEl, "blur", () => {
			const contexts = contextInput.inputEl.value
				.split(",")
				.map((ctx) => ctx.trim())
				.filter((ctx) => ctx);
			this.notifyMetadataChange("context", contexts);
		});

		new ContextSuggest(this.app, contextInput.inputEl, this.plugin);
	}

	/**
	 * Creates a recurrence rule editor.
	 */
	private createRecurrenceEditor(container: HTMLElement): void {
		const fieldContainer = container.createDiv({
			cls: "field-container recurrence-container",
		});
		const fieldLabel = fieldContainer.createDiv({ cls: "field-label" });
		fieldLabel.setText(t("Recurrence Rule"));

		const recurrenceInput = new TextComponent(fieldContainer)
			.setPlaceholder(t("e.g. every day, every week"))
			.setValue(this.task.metadata.recurrence || "")
			.onChange((value) => {
				this.notifyMetadataChange("recurrence", value);
			});

		this.registerDomEvent(recurrenceInput.inputEl, "blur", () => {
			this.notifyMetadataChange(
				"recurrence",
				recurrenceInput.inputEl.value
			);
		});
	}

	/**
	 * Creates an onCompletion editor.
	 */
	private createOnCompletionEditor(container: HTMLElement): void {
		const fieldContainer = container.createDiv({
			cls: "field-container oncompletion-container",
		});
		const fieldLabel = fieldContainer.createDiv({ cls: "field-label" });
		fieldLabel.setText(t("On Completion"));

		try {
			const onCompletionConfigurator = new OnCompletionConfigurator(
				fieldContainer,
				this.plugin,
				{
					initialValue: this.task.metadata.onCompletion || "",
					onChange: (value) => {
						this.notifyMetadataChange("onCompletion", value);
					},
					onValidationChange: (isValid, error) => {
						// Show validation feedback
						const existingMessage = fieldContainer.querySelector(
							".oncompletion-validation-message"
						);
						if (existingMessage) {
							existingMessage.remove();
						}

						if (error) {
							const messageEl = fieldContainer.createDiv({
								cls: "oncompletion-validation-message error",
								text: error,
							});
						} else if (isValid && this.task.metadata.onCompletion) {
							const messageEl = fieldContainer.createDiv({
								cls: "oncompletion-validation-message success",
								text: t("Configuration is valid"),
							});
						}
					},
				}
			);

			this.addChild(onCompletionConfigurator);
		} catch (error) {
			// Fallback to simple text input if OnCompletionConfigurator fails to load
			console.warn(
				"Failed to load OnCompletionConfigurator, using fallback:",
				error
			);

			const onCompletionInput = new TextComponent(fieldContainer)
				.setPlaceholder(t("Action to execute on completion"))
				.setValue(this.task.metadata.onCompletion || "")
				.onChange((value) => {
					this.notifyMetadataChange("onCompletion", value);
				});

			this.registerDomEvent(onCompletionInput.inputEl, "blur", () => {
				this.notifyMetadataChange(
					"onCompletion",
					onCompletionInput.inputEl.value
				);
			});
		}
	}

	/**
	 * Creates a dependsOn editor.
	 */
	private createDependsOnEditor(container: HTMLElement): void {
		const fieldContainer = container.createDiv({
			cls: "field-container dependson-container",
		});
		const fieldLabel = fieldContainer.createDiv({ cls: "field-label" });
		fieldLabel.setText(t("Depends On"));

		const dependsOnInput = new TextComponent(fieldContainer)
			.setPlaceholder(t("Task IDs separated by commas"))
			.setValue(
				Array.isArray(this.task.metadata.dependsOn)
					? this.task.metadata.dependsOn.join(", ")
					: ""
			);

		this.registerDomEvent(dependsOnInput.inputEl, "blur", () => {
			const dependsOnValue = dependsOnInput.inputEl.value;
			const dependsOnArray = dependsOnValue
				.split(",")
				.map((id) => id.trim())
				.filter((id) => id.length > 0);
			this.notifyMetadataChange("dependsOn", dependsOnArray);
		});
	}

	/**
	 * Creates an id editor.
	 */
	private createIdEditor(container: HTMLElement): void {
		const fieldContainer = container.createDiv({
			cls: "field-container id-container",
		});
		const fieldLabel = fieldContainer.createDiv({ cls: "field-label" });
		fieldLabel.setText(t("Task ID"));

		const idInput = new TextComponent(fieldContainer)
			.setPlaceholder(t("Unique task identifier"))
			.setValue(this.task.metadata.id || "")
			.onChange((value) => {
				this.notifyMetadataChange("id", value);
			});

		this.registerDomEvent(idInput.inputEl, "blur", () => {
			this.notifyMetadataChange("id", idInput.inputEl.value);
		});
	}

	/**
	 * Notifies about metadata changes.
	 */
	private notifyMetadataChange(field: string, value: any): void {
		if (this.onMetadataChange) {
			this.onMetadataChange({
				field,
				value,
				task: this.task,
			});
		}
	}
}
