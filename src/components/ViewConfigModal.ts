import {
	App,
	Modal,
	Setting,
	TextComponent,
	ButtonComponent,
	Notice,
} from "obsidian";
import { t } from "../translations/helper";
import {
	CalendarSpecificConfig,
	KanbanSpecificConfig,
	SpecificViewConfig,
	ViewConfig,
	ViewFilterRule,
	ViewMode,
} from "../common/setting-definition";
import TaskProgressBarPlugin from "../index";
import moment from "moment";

export class ViewConfigModal extends Modal {
	private viewConfig: ViewConfig;
	private viewFilterRule: ViewFilterRule;
	private plugin: TaskProgressBarPlugin;
	private isCreate: boolean;
	private onSave: (config: ViewConfig, rules: ViewFilterRule) => void;

	// References to input components to read values later
	private nameInput: TextComponent;
	private iconInput: TextComponent;
	private textContainsInput: TextComponent;
	private tagsIncludeInput: TextComponent;
	private tagsExcludeInput: TextComponent;
	private statusIncludeInput: TextComponent;
	private statusExcludeInput: TextComponent;
	private projectInput: TextComponent;
	private priorityInput: TextComponent; // Consider dropdown if fixed range
	private dueDateInput: TextComponent;
	private startDateInput: TextComponent;
	private scheduledDateInput: TextComponent;
	private pathIncludesInput: TextComponent;
	private pathExcludesInput: TextComponent;

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		initialViewConfig: ViewConfig | null, // Null for creating
		initialFilterRule: ViewFilterRule | null, // Null for creating
		onSave: (config: ViewConfig, rules: ViewFilterRule) => void
	) {
		super(app);
		this.plugin = plugin;
		this.isCreate = initialViewConfig === null;

		if (this.isCreate) {
			const newId = `custom_${Date.now()}`;
			this.viewConfig = {
				id: newId,
				name: t("New Custom View"),
				icon: "list-plus",
				type: "custom",
				visible: true,
				hideCompletedAndAbandonedTasks: false,
			};
			this.viewFilterRule = initialFilterRule || {}; // Start with empty rules or provided defaults
		} else {
			// Deep copy to avoid modifying original objects until save
			this.viewConfig = JSON.parse(JSON.stringify(initialViewConfig));
			this.viewFilterRule = JSON.parse(
				JSON.stringify(initialFilterRule || {})
			);
		}

		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.toggleClass("task-genius-view-config-modal", true);

		this.titleEl.setText(
			this.isCreate
				? t("Create Custom View")
				: t("Edit View: ") + this.viewConfig.name
		);

		// --- Basic View Settings ---
		new Setting(contentEl).setName(t("View Name")).addText((text) => {
			this.nameInput = text;
			text.setValue(this.viewConfig.name).setPlaceholder(
				t("My Custom Task View")
			);
		});

		new Setting(contentEl)
			.setName(t("Icon Name"))
			.setDesc(
				t(
					"Enter any Lucide icon name (e.g., list-checks, filter, inbox)"
				)
			)
			.addText((text) => {
				this.iconInput = text;
				text.setValue(this.viewConfig.icon).setPlaceholder("list-plus");
			});

		if (this.viewConfig.id === "calendar") {
			new Setting(contentEl)
				.setName(t("First Day of Week"))
				.setDesc(t("Overrides the locale default for calendar views."))
				.addDropdown((dropdown) => {
					days.forEach((day) => {
						dropdown.addOption(String(day.value), day.name);
					});

					let initialValue = -1; // Default to 'Locale Default'
					if (
						this.viewConfig.specificConfig?.viewType === "calendar"
					) {
						initialValue =
							(
								this.viewConfig
									.specificConfig as CalendarSpecificConfig
							).firstDayOfWeek ?? -1;
					}
					dropdown.setValue(String(initialValue));

					dropdown.onChange((value) => {
						const numValue = parseInt(value);
						const newFirstDayOfWeek =
							numValue === -1 ? undefined : numValue;

						if (
							!this.viewConfig.specificConfig ||
							this.viewConfig.specificConfig.viewType !==
								"calendar"
						) {
							this.viewConfig.specificConfig = {
								viewType: "calendar",
								firstDayOfWeek: newFirstDayOfWeek,
							};
						} else {
							(
								this.viewConfig
									.specificConfig as CalendarSpecificConfig
							).firstDayOfWeek = newFirstDayOfWeek;
						}
					});
				});
		} else if (this.viewConfig.id === "kanban") {
			new Setting(contentEl)
				.setName(t("Show checkbox"))
				.setDesc(t("Show a checkbox for each task in the kanban view."))
				.addToggle((toggle) => {
					toggle.setValue(
						(this.viewConfig.specificConfig as KanbanSpecificConfig)
							?.showCheckbox as boolean
					);
					toggle.onChange((value) => {
						if (
							!this.viewConfig.specificConfig ||
							this.viewConfig.specificConfig.viewType !== "kanban"
						) {
							this.viewConfig.specificConfig = {
								viewType: "kanban",
								showCheckbox: value,
							};
						} else {
							(
								this.viewConfig
									.specificConfig as KanbanSpecificConfig
							).showCheckbox = value;
						}
					});
				});
		}

		// --- Filter Rules ---
		new Setting(contentEl).setName(t("Filter Rules")).setHeading();

		new Setting(contentEl)
			.setName(t("Hide Completed and Abandoned Tasks"))
			.setDesc(t("Hide completed and abandoned tasks in this view."))
			.addToggle((toggle) => {
				toggle.setValue(this.viewConfig.hideCompletedAndAbandonedTasks);
				toggle.onChange((value) => {
					this.viewConfig.hideCompletedAndAbandonedTasks = value;
				});
			});

		new Setting(contentEl)
			.setName(t("Text Contains"))
			.setDesc(
				t(
					"Filter tasks whose content includes this text (case-insensitive)."
				)
			)
			.addText((text) => {
				this.textContainsInput = text;
				text.setValue(this.viewFilterRule.textContains || "");
			});

		new Setting(contentEl)
			.setName(t("Tags Include"))
			.setDesc(t("Task must include ALL these tags (comma-separated)."))
			.addText((text) => {
				this.tagsIncludeInput = text;
				text.setValue(
					(this.viewFilterRule.tagsInclude || []).join(", ")
				).setPlaceholder("#important, #projectA");
			});

		new Setting(contentEl)
			.setName(t("Tags Exclude"))
			.setDesc(
				t("Task must NOT include ANY of these tags (comma-separated).")
			)
			.addText((text) => {
				this.tagsExcludeInput = text;
				text.setValue(
					(this.viewFilterRule.tagsExclude || []).join(", ")
				).setPlaceholder("#waiting, #someday");
			});

		new Setting(contentEl)
			.setName(t("Project Is"))
			.setDesc(t("Task must belong to this project (exact match)."))
			.addText((text) => {
				this.projectInput = text;
				text.setValue(this.viewFilterRule.project || "");
			});

		new Setting(contentEl)
			.setName(t("Priority Is"))
			.setDesc(t("Task must have this priority (e.g., 1, 2, 3)."))
			.addText((text) => {
				this.priorityInput = text;
				text.inputEl.type = "number"; // Set input type to number
				text.setValue(
					this.viewFilterRule.priority !== undefined
						? String(this.viewFilterRule.priority)
						: ""
				);
			});

		// --- Status Filters (Potentially complex, using simple text for now) ---
		new Setting(contentEl)
			.setName(t("Status Include"))
			.setDesc(
				t(
					"Task status must be one of these (comma-separated markers, e.g., /,>)."
				)
			)
			.addText((text) => {
				this.statusIncludeInput = text;
				text.setValue(
					(this.viewFilterRule.statusInclude || []).join(",")
				).setPlaceholder("/.>");
			});

		new Setting(contentEl)
			.setName(t("Status Exclude"))
			.setDesc(
				t(
					"Task status must NOT be one of these (comma-separated markers, e.g., -,x)."
				)
			)
			.addText((text) => {
				this.statusExcludeInput = text;
				text.setValue(
					(this.viewFilterRule.statusExclude || []).join(",")
				).setPlaceholder("-,x");
			});

		// --- Date Filters ---
		// TODO: Consider using a date picker component or Moment.js for relative dates
		const dateDesc = t(
			"Use YYYY-MM-DD or relative terms like 'today', 'tomorrow', 'next week', 'last month'."
		);
		new Setting(contentEl)
			.setName(t("Due Date Is"))
			.setDesc(dateDesc)
			.addText((text) => {
				this.dueDateInput = text;
				text.setValue(this.viewFilterRule.dueDate || "");
			});
		new Setting(contentEl)
			.setName(t("Start Date Is"))
			.setDesc(dateDesc)
			.addText((text) => {
				this.startDateInput = text;
				text.setValue(this.viewFilterRule.startDate || "");
			});
		new Setting(contentEl)
			.setName(t("Scheduled Date Is"))
			.setDesc(dateDesc)
			.addText((text) => {
				this.scheduledDateInput = text;
				text.setValue(this.viewFilterRule.scheduledDate || "");
			});

		// --- Path Filters ---
		new Setting(contentEl)
			.setName(t("Path Includes"))
			.setDesc(t("Task must contain this path (case-insensitive)."))
			.addText((text) => {
				this.pathIncludesInput = text;
				text.setValue(this.viewFilterRule.pathIncludes || "");
			});
		new Setting(contentEl)
			.setName(t("Path Excludes"))
			.setDesc(t("Task must NOT contain this path (case-insensitive)."))
			.addText((text) => {
				this.pathExcludesInput = text;
				text.setValue(this.viewFilterRule.pathExcludes || "");
			});

		// --- First Day of Week ---
		const days = [
			{ value: -1, name: t("Locale Default") }, // Use -1 or undefined as sentinel
			{ value: 0, name: moment.weekdays(true)[0] }, // Monday
			{ value: 1, name: moment.weekdays(true)[1] }, // Tuesday
			{ value: 2, name: moment.weekdays(true)[2] }, // Wednesday
			{ value: 3, name: moment.weekdays(true)[3] }, // Thursday
			{ value: 4, name: moment.weekdays(true)[4] }, // Friday
			{ value: 5, name: moment.weekdays(true)[5] }, // Saturday
			{ value: 6, name: moment.weekdays(true)[6] }, // Sunday
		];

		// --- Action Buttons ---
		new Setting(contentEl)
			.addButton((button) => {
				button
					.setButtonText(t("Save"))
					.setCta()
					.onClick(() => {
						this.saveChanges();
					});
			})
			.addButton((button) => {
				button.setButtonText(t("Cancel")).onClick(() => {
					this.close();
				});
			});
	}

	private parseStringToArray(input: string): string[] {
		if (!input || input.trim() === "") return [];
		return input
			.split(",")
			.map((s) => s.trim())
			.filter((s) => s !== "");
	}

	private saveChanges() {
		// Update viewConfig
		this.viewConfig.name =
			this.nameInput.getValue().trim() || t("Unnamed View");
		this.viewConfig.icon = this.iconInput.getValue().trim() || "list";

		// Update viewFilterRule
		const rules: ViewFilterRule = {};
		const textContains = this.textContainsInput.getValue().trim();
		if (textContains) rules.textContains = textContains;

		const tagsInclude = this.parseStringToArray(
			this.tagsIncludeInput.getValue()
		);
		if (tagsInclude.length > 0) rules.tagsInclude = tagsInclude;

		const tagsExclude = this.parseStringToArray(
			this.tagsExcludeInput.getValue()
		);
		if (tagsExclude.length > 0) rules.tagsExclude = tagsExclude;

		const statusInclude = this.parseStringToArray(
			this.statusIncludeInput.getValue()
		);
		if (statusInclude.length > 0) rules.statusInclude = statusInclude;

		const statusExclude = this.parseStringToArray(
			this.statusExcludeInput.getValue()
		);
		if (statusExclude.length > 0) rules.statusExclude = statusExclude;

		const project = this.projectInput.getValue().trim();
		if (project) rules.project = project;

		const priorityStr = this.priorityInput.getValue().trim();
		if (priorityStr) {
			const priorityNum = parseInt(priorityStr, 10);
			if (!isNaN(priorityNum)) {
				rules.priority = priorityNum;
			}
		}

		const dueDate = this.dueDateInput.getValue().trim();
		if (dueDate) rules.dueDate = dueDate;

		const startDate = this.startDateInput.getValue().trim();
		if (startDate) rules.startDate = startDate;

		const scheduledDate = this.scheduledDateInput.getValue().trim();
		if (scheduledDate) rules.scheduledDate = scheduledDate;

		const pathIncludes = this.pathIncludesInput.getValue().trim();
		if (pathIncludes) rules.pathIncludes = pathIncludes;

		const pathExcludes = this.pathExcludesInput.getValue().trim();
		if (pathExcludes) rules.pathExcludes = pathExcludes;

		this.viewFilterRule = rules;

		// Call the onSave callback
		this.onSave(this.viewConfig, this.viewFilterRule);
		this.close();
		new Notice(t("View configuration saved."));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
