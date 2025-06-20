import {
	App,
	Modal,
	Setting,
	DropdownComponent,
	TextComponent,
	Notice,
	setIcon,
	ButtonComponent,
	ExtraButtonComponent,
} from "obsidian";
import {
	BaseHabitData,
	BaseDailyHabitData,
	BaseCountHabitData,
	BaseMappingHabitData,
	BaseScheduledHabitData,
	ScheduledEvent,
} from "../types/habit-card";
import TaskProgressBarPlugin from "../index";
import { t } from "../translations/helper";
import { attachIconMenu } from "./IconMenu";
import "../styles/habit-edit-dialog.css";

export class HabitEditDialog extends Modal {
	plugin: TaskProgressBarPlugin;
	habitData: BaseHabitData | null = null;
	onSubmit: (habit: BaseHabitData) => void;
	isNew: boolean;
	habitType: string = "daily";
	iconInput: string = "circle-check";

	// Event listeners to clean up
	private eventListeners: Array<{
		element: HTMLElement;
		event: string;
		handler: EventListener;
	}> = [];

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		habitData: BaseHabitData | null = null,
		onSubmit: (habit: BaseHabitData) => void
	) {
		super(app);
		this.plugin = plugin;
		this.habitData = habitData;
		this.onSubmit = onSubmit;
		this.isNew = !habitData;

		if (habitData) {
			this.habitType = habitData.type;
			this.iconInput = habitData.icon;
		}
	}

	onOpen() {
		this.titleEl.setText(
			this.isNew ? t("Create new habit") : t("Edit habit")
		);
		this.modalEl.addClass("habit-edit-dialog");

		this.buildForm();
	}

	onClose() {
		// Clean up event listeners
		this.eventListeners.forEach(({ element, event, handler }) => {
			element.removeEventListener(event, handler);
		});
		this.eventListeners = [];
	}

	// Helper method to register event listeners for cleanup
	private registerEventListener(
		element: HTMLElement,
		event: string,
		handler: EventListener
	) {
		element.addEventListener(event, handler);
		this.eventListeners.push({ element, event, handler });
	}

	buildForm() {
		const { contentEl } = this;
		contentEl.empty();

		const typeContainer = contentEl.createDiv({
			cls: "habit-type-selector",
		});
		const typeDesc = typeContainer.createDiv({
			cls: "habit-type-description",
		});
		typeDesc.setText(t("Habit type"));

		const typeGrid = typeContainer.createDiv({ cls: "habit-type-grid" });

		const types = [
			{
				id: "daily",
				name: t("Daily habit"),
				icon: "calendar-check",
				description: t("Simple daily check-in habit"),
			},
			{
				id: "count",
				name: t("Count habit"),
				icon: "bar-chart",
				description: t(
					"Record numeric values, e.g., how many cups of water"
				),
			},
			{
				id: "mapping",
				name: t("Mapping habit"),
				icon: "smile",
				description: t(
					"Use different values to map, e.g., emotion tracking"
				),
			},
			{
				id: "scheduled",
				name: t("Scheduled habit"),
				icon: "calendar",
				description: t("Habit with multiple events"),
			},
		];

		types.forEach((type) => {
			const typeBtn = typeGrid.createDiv({
				cls: `habit-type-item ${
					type.id === this.habitType ? "selected" : ""
				}`,
				attr: { "data-type": type.id },
			});

			const iconDiv = typeBtn.createDiv(
				{ cls: "habit-type-icon" },
				(el) => {
					setIcon(el, type.icon);
				}
			);
			const textDiv = typeBtn.createDiv({ cls: "habit-type-text" });
			textDiv.createDiv({ cls: "habit-type-name", text: type.name });
			textDiv.createDiv({
				cls: "habit-type-desc",
				text: type.description,
			});

			const clickHandler = () => {
				document.querySelectorAll(".habit-type-item").forEach((el) => {
					el.removeClass("selected");
				});
				// Set current selection
				typeBtn.addClass("selected");
				this.habitType = type.id;
				// Rebuild form
				this.buildTypeSpecificForm();
			};

			this.registerEventListener(typeBtn, "click", clickHandler);
		});

		// Common fields form
		const commonForm = contentEl.createDiv({ cls: "habit-common-form" });

		// ID field (hidden, auto-generated when creating)
		const habitId = this.habitData?.id || this.generateId();

		// Name field
		let nameInput: TextComponent;
		new Setting(commonForm)
			.setName(t("Habit name"))
			.setDesc(t("Display name of the habit"))
			.addText((text) => {
				nameInput = text;
				text.setValue(this.habitData?.name || "");
				text.inputEl.addClass("habit-name-input");
			});

		// Description field
		let descInput: TextComponent;
		new Setting(commonForm)
			.setName(t("Description"))
			.setDesc(t("Optional habit description"))
			.addText((text) => {
				descInput = text;
				text.setValue(this.habitData?.description || "");
				text.inputEl.addClass("habit-desc-input");
			});

		// Icon selector
		let iconSelector: TextComponent;
		new Setting(commonForm).setName(t("Icon")).addButton((btn) => {
			try {
				btn.setIcon(this.iconInput || "circle-check");
			} catch (e) {
				console.error("Error setting icon:", e);
				try {
					btn.setIcon("circle-check");
				} catch (err) {
					console.error("Failed to set default icon:", err);
				}
			}
			attachIconMenu(btn, {
				containerEl: this.modalEl,
				plugin: this.plugin,
				onIconSelected: (iconId) => {
					this.iconInput = iconId;
					try {
						setIcon(btn.buttonEl, iconId || "circle-check");
					} catch (e) {
						console.error("Error setting icon:", e);
						try {
							setIcon(btn.buttonEl, "circle-check");
						} catch (err) {
							console.error("Failed to set default icon:", err);
						}
					}
					this.iconInput = iconId;
				},
			});
		});

		// Type-specific form container
		const typeFormContainer = contentEl.createDiv({
			cls: "habit-type-form",
		});

		// Button container
		const buttonContainer = contentEl.createDiv(
			{
				cls: "habit-edit-buttons",
			},
			(el) => {
				new ButtonComponent(el)
					.setWarning()
					.setButtonText(t("Cancel"))
					.onClick(() => {
						this.close();
					});
				new ButtonComponent(el)
					.setCta()
					.setButtonText(t("Save"))
					.onClick(() => {
						const name = nameInput.getValue().trim();
						if (!name) {
							new Notice(t("Please enter a habit name"));
							return;
						}

						// Collect common fields
						let habitData: BaseHabitData = {
							id: habitId,
							name: name,
							description: descInput.getValue() || undefined,
							icon: this.iconInput || "circle-check",
							type: this.habitType as any,
							// Type-specific fields from getTypeSpecificData
						} as any;

						// Add type-specific fields
						const typeData = this.getTypeSpecificData();
						if (!typeData) {
							return; // Validation failed
						}

						habitData = { ...habitData, ...typeData };

						this.onSubmit(habitData);
						this.close();
					});
			}
		);

		// Build type-specific form
		this.buildTypeSpecificForm(typeFormContainer);
	}

	// Build form based on current habit type
	buildTypeSpecificForm(container?: HTMLElement) {
		if (!container) {
			container = this.contentEl.querySelector(
				".habit-type-form"
			) as HTMLElement;
			if (!container) return;
		}

		container.empty();

		switch (this.habitType) {
			case "daily":
				this.buildDailyHabitForm(container);
				break;
			case "count":
				this.buildCountHabitForm(container);
				break;
			case "mapping":
				this.buildMappingHabitForm(container);
				break;
			case "scheduled":
				this.buildScheduledHabitForm(container);
				break;
		}
	}

	// Daily habit form
	buildDailyHabitForm(container: HTMLElement) {
		const dailyData = this.habitData as BaseDailyHabitData | null;

		// Property field
		let propertyInput: TextComponent;
		let completionTextInput: TextComponent;

		new Setting(container)
			.setName(t("Property name"))
			.setDesc(t("The property name of the daily note front matter"))
			.addText((text) => {
				propertyInput = text;
				text.setValue(dailyData?.property || "");
				text.inputEl.addClass("habit-property-input");
			});

		// Completion text field (optional)
		new Setting(container)
			.setName(t("Completion text"))
			.setDesc(
				t(
					"(Optional) Specific text representing completion, leave blank for any non-empty value to be considered completed"
				)
			)
			.addText((text) => {
				completionTextInput = text;
				text.setValue(dailyData?.completionText || "");
				text.inputEl.addClass("habit-completion-text-input");
			});

		// Store input components in class for access during submission
		this.dailyInputs = {
			property: propertyInput!,
			completionText: completionTextInput!,
		};
	}

	// Count habit form
	buildCountHabitForm(container: HTMLElement) {
		const countData = this.habitData as BaseCountHabitData | null;

		// Property field
		let propertyInput: TextComponent;
		let minInput: TextComponent;
		let maxInput: TextComponent;
		let unitInput: TextComponent;
		let noticeInput: TextComponent;

		new Setting(container)
			.setName(t("Property name"))
			.setDesc(
				t(
					"The property name in daily note front matter to store count values"
				)
			)
			.addText((text) => {
				propertyInput = text;
				text.setValue(countData?.property || "");
				text.inputEl.addClass("habit-property-input");
			});

		// Minimum value
		new Setting(container)
			.setName(t("Minimum value"))
			.setDesc(t("(Optional) Minimum value for the count"))
			.addText((text) => {
				minInput = text;
				text.setValue(countData?.min?.toString() || "");
				text.inputEl.type = "number";
				text.inputEl.addClass("habit-min-input");
			});

		// Maximum value
		new Setting(container)
			.setName(t("Maximum value"))
			.setDesc(t("(Optional) Maximum value for the count"))
			.addText((text) => {
				maxInput = text;
				text.setValue(countData?.max?.toString() || "");
				text.inputEl.type = "number";
				text.inputEl.addClass("habit-max-input");
			});

		// Unit
		new Setting(container)
			.setName(t("Unit"))
			.setDesc(
				t(
					"(Optional) Unit for the count, such as 'cups', 'times', etc."
				)
			)
			.addText((text) => {
				unitInput = text;
				text.setValue(countData?.countUnit || "");
				text.inputEl.addClass("habit-unit-input");
			});

		// Notice value
		new Setting(container)
			.setName(t("Notice threshold"))
			.setDesc(
				t(
					"(Optional) Trigger a notification when this value is reached"
				)
			)
			.addText((text) => {
				noticeInput = text;
				text.setValue(countData?.notice || "");
				text.inputEl.addClass("habit-notice-input");
			});

		this.countInputs = {
			property: propertyInput!,
			min: minInput!,
			max: maxInput!,
			countUnit: unitInput!,
			notice: noticeInput!,
		};
	}

	// Mapping habit form
	buildMappingHabitForm(container: HTMLElement) {
		const mappingData = this.habitData as BaseMappingHabitData | null;

		// Property field
		let propertyInput: TextComponent;

		new Setting(container)
			.setName(t("Property name"))
			.setDesc(
				t(
					"The property name in daily note front matter to store mapping values"
				)
			)
			.addText((text) => {
				propertyInput = text;
				text.setValue(mappingData?.property || "");
				text.inputEl.addClass("habit-property-input");
			});

		// Value mapping editor
		new Setting(container)
			.setName(t("Value mapping"))
			.setDesc(t("Define mappings from numeric values to display text"));

		// Create mapping editor container
		const mappingContainer = container.createDiv({
			cls: "habit-mapping-container",
		});
		const existingMappings = mappingData?.mapping || {
			1: "😊",
			2: "😐",
			3: "😔",
		};

		// Store mapping input references
		this.mappingInputs = [];

		// Mapping editor function
		const createMappingEditor = (key: number, value: string) => {
			const row = mappingContainer.createDiv({
				cls: "habit-mapping-row",
			});

			// Key input
			const keyInput = row.createEl("input", {
				type: "number",
				value: key.toString(),
				cls: "habit-mapping-key",
			});

			// Add separator
			row.createSpan({ text: "→", cls: "habit-mapping-arrow" });

			// Value input
			const valueInput = row.createEl("input", {
				type: "text",
				value: value,
				cls: "habit-mapping-value",
			});

			// Delete button
			new ExtraButtonComponent(row)
				.setIcon("trash")
				.setTooltip(t("Delete"))
				.onClick(() => {
					row.remove();
					// Update input array
					const index = this.mappingInputs.findIndex(
						(m) =>
							m.keyInput === keyInput &&
							m.valueInput === valueInput
					);
					if (index > -1) {
						this.mappingInputs.splice(index, 1);
					}
				});

			// Save references
			this.mappingInputs.push({ keyInput, valueInput });
		};

		// Add existing mappings
		Object.entries(existingMappings).forEach(([key, value]) => {
			createMappingEditor(parseInt(key), value);
		});

		// Add mapping button
		const addMappingBtn = container.createEl("button", {
			cls: "habit-add-mapping-button",
			text: t("Add new mapping"),
		});

		const addMappingHandler = () => {
			// Find max key and increment by 1
			let maxKey = 0;
			this.mappingInputs.forEach((input) => {
				const key = parseInt(input.keyInput.value);
				if (!isNaN(key) && key > maxKey) maxKey = key;
			});
			createMappingEditor(maxKey + 1, "");
		};

		this.registerEventListener(addMappingBtn, "click", addMappingHandler);

		this.mappingPropertyInput = propertyInput!;
	}

	// Scheduled habit form
	buildScheduledHabitForm(container: HTMLElement) {
		const scheduledData = this.habitData as BaseScheduledHabitData | null;

		// Event editing instructions
		new Setting(container)
			.setName(t("Scheduled events"))
			.setDesc(t("Add multiple events that need to be completed"));

		// Create event editor container
		const eventsContainer = container.createDiv({
			cls: "habit-events-container",
		});
		const existingEvents = scheduledData?.events || [];
		const existingMap = scheduledData?.propertiesMap || {};

		// Store event input references
		this.eventInputs = [];

		// Event editor function
		const createEventEditor = (
			event: ScheduledEvent = { name: "", details: "" },
			propertyKey: string = ""
		) => {
			const row = eventsContainer.createDiv({ cls: "habit-event-row" });

			// Name input
			const nameInput = row.createEl("input", {
				type: "text",
				value: event.name,
				cls: "habit-event-name",
				placeholder: t("Event name"),
			});

			// Details input
			const detailsInput = row.createEl("input", {
				type: "text",
				value: event.details,
				cls: "habit-event-details",
				placeholder: t("Event details"),
			});

			// Property key input
			const propertyInput = row.createEl("input", {
				type: "text",
				value: propertyKey,
				cls: "habit-event-property",
				placeholder: t("Property name"),
			});

			// Delete button
			new ExtraButtonComponent(row)
				.setIcon("trash")
				.setTooltip(t("Delete"))
				.onClick(() => {
					row.remove();
					// Update input array
					const index = this.eventInputs.findIndex(
						(e) =>
							e.nameInput === nameInput &&
							e.detailsInput === detailsInput &&
							e.propertyInput === propertyInput
					);
					if (index > -1) {
						this.eventInputs.splice(index, 1);
					}
				});

			// Save references
			this.eventInputs.push({ nameInput, detailsInput, propertyInput });
		};

		// Add existing events
		if (existingEvents.length > 0) {
			existingEvents.forEach((event) => {
				const propertyKey = existingMap[event.name] || "";
				createEventEditor(event, propertyKey);
			});
		} else {
			// Add a default empty event
			createEventEditor();
		}

		// Add event button
		const addEventBtn = container.createEl("button", {
			cls: "habit-add-event-button",
			text: t("Add new event"),
		});

		const addEventHandler = () => {
			createEventEditor();
		};

		this.registerEventListener(addEventBtn, "click", addEventHandler);
	}

	// Get type-specific field data
	getTypeSpecificData(): any {
		switch (this.habitType) {
			case "daily":
				return this.getDailyHabitData();
			case "count":
				return this.getCountHabitData();
			case "mapping":
				return this.getMappingHabitData();
			case "scheduled":
				return this.getScheduledHabitData();
		}
		return null;
	}

	// Get daily habit data
	getDailyHabitData(): Partial<BaseDailyHabitData> | null {
		if (!this.dailyInputs) return null;

		const property = this.dailyInputs.property.getValue().trim();
		if (!property) {
			new Notice(t("Please enter a property name"));
			return null;
		}

		return {
			type: "daily",
			property: property,
			completionText:
				this.dailyInputs.completionText.getValue() || undefined,
		};
	}

	// Get count habit data
	getCountHabitData(): Partial<BaseCountHabitData> | null {
		if (!this.countInputs) return null;

		const property = this.countInputs.property.getValue().trim();
		if (!property) {
			new Notice(t("Please enter a property name"));
			return null;
		}

		const minValue = this.countInputs.min.getValue();
		const maxValue = this.countInputs.max.getValue();
		const noticeValue = this.countInputs.notice.getValue();

		return {
			type: "count",
			property: property,
			min: minValue ? parseInt(minValue) : undefined,
			max: maxValue ? parseInt(maxValue) : undefined,
			notice: noticeValue || undefined,
			countUnit: this.countInputs.countUnit.getValue() || undefined,
		};
	}

	// Get mapping habit data
	getMappingHabitData(): Partial<BaseMappingHabitData> | null {
		if (!this.mappingPropertyInput || !this.mappingInputs) return null;

		const property = this.mappingPropertyInput.getValue().trim();
		if (!property) {
			new Notice(t("Please enter a property name"));
			return null;
		}

		// Validate if there are mapping values
		if (this.mappingInputs.length === 0) {
			new Notice(t("Please add at least one mapping value"));
			return null;
		}

		// Build mapping object
		const mapping: Record<number, string> = {};
		for (const input of this.mappingInputs) {
			const key = parseInt(input.keyInput.value);
			const value = input.valueInput.value;

			if (isNaN(key)) {
				new Notice(t("Mapping key must be a number"));
				return null;
			}

			if (!value) {
				new Notice(t("Please enter text for all mapping values"));
				return null;
			}

			mapping[key] = value;
		}

		return {
			type: "mapping",
			property: property,
			mapping: mapping,
		};
	}

	// Get scheduled habit data
	getScheduledHabitData(): Partial<BaseScheduledHabitData> | null {
		if (!this.eventInputs) return null;

		// Validate if there are events
		if (this.eventInputs.length === 0) {
			new Notice(t("Please add at least one event"));
			return null;
		}

		// Build event list and property mapping
		const events: ScheduledEvent[] = [];
		const propertiesMap: Record<string, string> = {};

		for (const input of this.eventInputs) {
			const name = input.nameInput.value.trim();
			const details = input.detailsInput.value.trim();
			const property = input.propertyInput.value.trim();

			if (!name) {
				new Notice(t("Event name cannot be empty"));
				return null;
			}

			events.push({
				name: name,
				details: details,
			});

			if (property) {
				propertiesMap[name] = property;
			}
		}

		return {
			type: "scheduled",
			events: events,
			propertiesMap: propertiesMap,
		};
	}

	// Generate unique ID
	generateId(): string {
		return (
			Date.now().toString() + Math.random().toString(36).substring(2, 9)
		);
	}

	// Input component references for data retrieval
	private dailyInputs: {
		property: TextComponent;
		completionText: TextComponent;
	} | null = null;

	private countInputs: {
		property: TextComponent;
		min: TextComponent;
		max: TextComponent;
		countUnit: TextComponent;
		notice: TextComponent;
	} | null = null;

	private mappingPropertyInput: TextComponent | null = null;
	private mappingInputs: Array<{
		keyInput: HTMLInputElement;
		valueInput: HTMLInputElement;
	}> = [];

	private eventInputs: Array<{
		nameInput: HTMLInputElement;
		detailsInput: HTMLInputElement;
		propertyInput: HTMLInputElement;
	}> = [];
}
