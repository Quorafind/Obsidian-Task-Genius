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
import { Task } from "../../utils/types/TaskIndex";
import TaskProgressBarPlugin from "../../index";
import { t } from "../../translations/helper";
import { ProjectSuggest, TagSuggest, ContextSuggest } from "../AutoComplete";
import { StatusComponent } from "../StatusComponent";
import { format } from "date-fns";

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

			button.addEventListener("click", () => {
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
			this.getDateString(this.task.dueDate)
		);
	}

	private populateDatesTabContent(pane: HTMLElement): void {
		this.createDateEditor(
			pane,
			t("Start Date"),
			"startDate",
			this.getDateString(this.task.startDate)
		);
		this.createDateEditor(
			pane,
			t("Scheduled Date"),
			"scheduledDate",
			this.getDateString(this.task.scheduledDate)
		);
		this.createRecurrenceEditor(pane);
	}

	private populateDetailsTabContent(pane: HTMLElement): void {
		this.createProjectEditor(pane);
		this.createTagsEditor(pane);
		this.createContextEditor(pane);
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
			this.getDateString(this.task.dueDate)
		);
		this.createDateEditor(
			datesContainer,
			t("Start Date"),
			"startDate",
			this.getDateString(this.task.startDate)
		);
		this.createDateEditor(
			datesContainer,
			t("Scheduled Date"),
			"scheduledDate",
			this.getDateString(this.task.scheduledDate)
		);

		// Recurrence rule editor
		this.createRecurrenceEditor(metadataContainer);
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

		const taskPriority = this.getPriorityString(this.task.priority);
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
			// Date format conversion (should match date format used in the plugin)
			try {
				const date = new Date(value);
				const formattedDate = date.toISOString().split("T")[0];
				dateInput.value = formattedDate;
			} catch (e) {
				console.error(`Cannot parse date: ${value}`, e);
			}
		}

		dateInput.addEventListener("change", () => {
			this.notifyMetadataChange(field, dateInput.value);
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

		const projectInput = new TextComponent(fieldContainer)
			.setPlaceholder(t("Project name"))
			.setValue(this.task.project || "")
			.onChange((value) => {
				this.notifyMetadataChange("project", value);
			});

		this.registerDomEvent(projectInput.inputEl, "blur", () => {
			this.notifyMetadataChange("project", projectInput.inputEl.value);
		});

		new ProjectSuggest(this.app, projectInput.inputEl, this.plugin);
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
				Array.isArray(this.task.tags) ? this.task.tags.join(", ") : ""
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
				Array.isArray(this.task.context)
					? this.task.context.join(", ")
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
			.setValue(this.task.recurrence || "")
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
