/**
 * Gantt Chart Grouping Controls Component
 *
 * Provides UI controls for configuring task grouping in the Gantt chart.
 * Redesigned with modern Notion/Obsidian-inspired styling.
 */

import {
	Component,
	DropdownComponent,
	ButtonComponent,
	setIcon,
} from "obsidian";
import { GroupingConfig, GroupingField } from "../../types/gantt-grouping";
import { GanttGroupingManager } from "./grouping-manager";
import { t } from "../../translations/helper";

export interface GroupingControlsOptions {
	container: HTMLElement;
	initialConfig?: GroupingConfig;
	onChange?: (config: GroupingConfig) => void;
	onToggleGroup?: (groupId: string) => void;
	onExpandCollapseAll?: (expand: boolean) => void;
}

export class GanttGroupingControls extends Component {
	private container: HTMLElement;
	private config: GroupingConfig;
	private onChange: (config: GroupingConfig) => void;
	private onToggleGroup: (groupId: string) => void;
	private onExpandCollapseAll: (expand: boolean) => void;

	// UI Elements
	private controlsContainer: HTMLElement;
	private primaryGroupDropdown: DropdownComponent;
	private secondaryGroupDropdown: DropdownComponent;
	private groupOptionsContainer: HTMLElement;

	constructor(options: GroupingControlsOptions) {
		super();
		this.container = options.container;
		this.config = options.initialConfig || {
			primaryGroupBy: "none",
			secondaryGroupBy: "none",
			showGroupHeaders: true,
			collapsibleGroups: true,
			defaultExpanded: true,
			groupHeaderHeight: 30,
			showEmptyGroups: false,
		};
		this.onChange = options.onChange || (() => {});
		this.onToggleGroup = options.onToggleGroup || (() => {});
		this.onExpandCollapseAll = options.onExpandCollapseAll || (() => {});
	}

	onload(): void {
		this.render();
	}

	onunload(): void {
		this.container.empty();
	}

	private render(): void {
		this.container.empty();
		this.container.addClass("tg-gantt-grouping-controls");

		// Create main controls section
		this.renderGroupingSection();

		// Create options section
		this.renderOptionsSection();
	}

	private renderGroupingSection(): void {
		const groupingSection = this.container.createDiv({
			cls: "tg-gantt-grouping-section",
		});

		// Section header
		const headerEl = groupingSection.createDiv({
			cls: "tg-gantt-section-header",
		});

		const iconEl = headerEl.createDiv({
			cls: "tg-gantt-section-icon",
		});
		setIcon(iconEl, "layers");

		headerEl.createEl("span", {
			cls: "tg-gantt-section-title",
			text: t("Group Tasks"),
		});

		// Grouping controls container
		const controlsRow = groupingSection.createDiv({
			cls: "tg-gantt-controls-row",
		});

		// Primary grouping
		this.renderPrimaryGrouping(controlsRow);

		// Secondary grouping
		this.renderSecondaryGrouping(controlsRow);
	}

	private renderPrimaryGrouping(container: HTMLElement): void {
		const primaryControl = container.createDiv({
			cls: "tg-gantt-control-group",
		});

		const labelEl = primaryControl.createEl("label", {
			cls: "tg-gantt-control-label",
			text: t("Group by"),
		});

		const dropdownContainer = primaryControl.createDiv({
			cls: "tg-gantt-dropdown-container",
		});

		this.primaryGroupDropdown = new DropdownComponent(dropdownContainer);
		this.setupGroupingDropdown(
			this.primaryGroupDropdown,
			this.config.primaryGroupBy || "none"
		);

		// Style the dropdown
		const selectEl = dropdownContainer.querySelector(
			"select"
		) as HTMLSelectElement;
		if (selectEl) {
			selectEl.addClass("tg-gantt-dropdown");
		}
	}

	private renderSecondaryGrouping(container: HTMLElement): void {
		const secondaryControl = container.createDiv({
			cls: "tg-gantt-control-group tg-gantt-secondary-grouping",
		});

		const labelEl = secondaryControl.createEl("label", {
			cls: "tg-gantt-control-label",
			text: t("Then by"),
		});

		const dropdownContainer = secondaryControl.createDiv({
			cls: "tg-gantt-dropdown-container",
		});

		this.secondaryGroupDropdown = new DropdownComponent(dropdownContainer);
		this.setupGroupingDropdown(
			this.secondaryGroupDropdown,
			this.config.secondaryGroupBy || "none"
		);

		// Style the dropdown
		const selectEl = dropdownContainer.querySelector(
			"select"
		) as HTMLSelectElement;
		if (selectEl) {
			selectEl.addClass("tg-gantt-dropdown");
		}

		this.updateSecondaryGroupingVisibility();
	}

	private renderOptionsSection(): void {
		this.groupOptionsContainer = this.container.createDiv({
			cls: "tg-gantt-options-section",
		});

		// Section header
		const headerEl = this.groupOptionsContainer.createDiv({
			cls: "tg-gantt-section-header",
		});

		const iconEl = headerEl.createDiv({
			cls: "tg-gantt-section-icon",
		});
		setIcon(iconEl, "settings");

		headerEl.createEl("span", {
			cls: "tg-gantt-section-title",
			text: t("Group Options"),
		});

		// Options content
		const optionsContent = this.groupOptionsContainer.createDiv({
			cls: "tg-gantt-options-content",
		});

		// Expand/Collapse buttons
		this.renderExpandCollapseButtons(optionsContent);

		// Display options
		this.renderDisplayOptions(optionsContent);

		this.updateGroupOptionsVisibility();
	}

	private renderExpandCollapseButtons(container: HTMLElement): void {
		const buttonsRow = container.createDiv({
			cls: "tg-gantt-buttons-row",
		});

		const buttonsContainer = buttonsRow.createDiv({
			cls: "tg-gantt-button-group",
		});

		// Expand all button
		const expandButtonEl = buttonsContainer.createEl("button", {
			cls: "tg-gantt-button tg-gantt-button--secondary",
		});

		const expandIconEl = expandButtonEl.createDiv({
			cls: "tg-gantt-button-icon",
		});
		setIcon(expandIconEl, "chevrons-down");

		expandButtonEl.createEl("span", {
			cls: "tg-gantt-button-text",
			text: t("Expand All"),
		});

		expandButtonEl.addEventListener("click", () => {
			this.onExpandCollapseAll(true);
		});

		// Collapse all button
		const collapseButtonEl = buttonsContainer.createEl("button", {
			cls: "tg-gantt-button tg-gantt-button--secondary",
		});

		const collapseIconEl = collapseButtonEl.createDiv({
			cls: "tg-gantt-button-icon",
		});
		setIcon(collapseIconEl, "chevrons-up");

		collapseButtonEl.createEl("span", {
			cls: "tg-gantt-button-text",
			text: t("Collapse All"),
		});

		collapseButtonEl.addEventListener("click", () => {
			this.onExpandCollapseAll(false);
		});
	}

	private renderDisplayOptions(container: HTMLElement): void {
		const optionsGrid = container.createDiv({
			cls: "tg-gantt-options-grid",
		});

		// Show group headers toggle
		this.renderToggleOption(
			optionsGrid,
			"show-headers",
			t("Show group headers"),
			this.config.showGroupHeaders ?? true,
			(checked) => {
				this.config.showGroupHeaders = checked;
				this.notifyConfigChange();
			}
		);

		// Show empty groups toggle
		this.renderToggleOption(
			optionsGrid,
			"show-empty",
			t("Show empty groups"),
			this.config.showEmptyGroups ?? false,
			(checked) => {
				this.config.showEmptyGroups = checked;
				this.notifyConfigChange();
			}
		);

		// Collapsible groups toggle
		this.renderToggleOption(
			optionsGrid,
			"collapsible",
			t("Collapsible groups"),
			this.config.collapsibleGroups ?? true,
			(checked) => {
				this.config.collapsibleGroups = checked;
				this.notifyConfigChange();
			}
		);
	}

	private renderToggleOption(
		container: HTMLElement,
		id: string,
		label: string,
		checked: boolean,
		onChange: (checked: boolean) => void
	): void {
		const optionEl = container.createDiv({
			cls: "tg-gantt-toggle-option",
		});

		const checkboxEl = optionEl.createEl("input", {
			type: "checkbox",
			cls: "tg-gantt-toggle-checkbox",
			attr: { id: `tg-gantt-${id}` },
		});
		checkboxEl.checked = checked;

		const labelEl = optionEl.createEl("label", {
			cls: "tg-gantt-toggle-label",
			text: label,
			attr: { for: `tg-gantt-${id}` },
		});

		checkboxEl.addEventListener("change", () => {
			onChange(checkboxEl.checked);
		});
	}

	private setupGroupingDropdown(
		dropdown: DropdownComponent,
		selectedValue: string
	): void {
		const availableFields =
			GanttGroupingManager.getAvailableGroupingFields();

		availableFields.forEach((field) => {
			dropdown.addOption(field.value, field.label);
		});

		dropdown.setValue(selectedValue);
	}

	private updateSecondaryGroupingVisibility(): void {
		const secondarySection = this.container.querySelector(
			".tg-gantt-secondary-grouping"
		) as HTMLElement;
		if (secondarySection) {
			const isPrimaryGroupingActive =
				this.config.primaryGroupBy !== "none";
			secondarySection.style.display = isPrimaryGroupingActive
				? "flex"
				: "none";
		}
	}

	private updateGroupOptionsVisibility(): void {
		const hasGrouping = this.config.primaryGroupBy !== "none";
		this.groupOptionsContainer.style.display = hasGrouping
			? "block"
			: "none";
	}

	private notifyConfigChange(): void {
		this.updateSecondaryGroupingVisibility();
		this.updateGroupOptionsVisibility();
		this.onChange(this.config);
	}

	/**
	 * Update the configuration from external source
	 */
	updateConfig(newConfig: GroupingConfig): void {
		this.config = { ...this.config, ...newConfig };

		// Update UI elements
		if (this.primaryGroupDropdown) {
			this.primaryGroupDropdown.setValue(
				this.config.primaryGroupBy || "none"
			);
		}
		if (this.secondaryGroupDropdown) {
			this.secondaryGroupDropdown.setValue(
				this.config.secondaryGroupBy || "none"
			);
		}

		// Update toggle states
		this.updateToggleStates();

		this.updateSecondaryGroupingVisibility();
		this.updateGroupOptionsVisibility();
	}

	private updateToggleStates(): void {
		const toggles = this.container.querySelectorAll(
			".tg-gantt-toggle-checkbox"
		);
		toggles.forEach((toggle) => {
			const checkbox = toggle as HTMLInputElement;
			const id = checkbox.id;

			switch (id) {
				case "tg-gantt-show-headers":
					checkbox.checked = this.config.showGroupHeaders ?? true;
					break;
				case "tg-gantt-show-empty":
					checkbox.checked = this.config.showEmptyGroups ?? false;
					break;
				case "tg-gantt-collapsible":
					checkbox.checked = this.config.collapsibleGroups ?? true;
					break;
			}
		});
	}

	/**
	 * Get current configuration
	 */
	getConfig(): GroupingConfig {
		return { ...this.config };
	}

	/**
	 * Show/hide the controls
	 */
	setVisible(visible: boolean): void {
		this.container.style.display = visible ? "block" : "none";
	}

	/**
	 * Enable/disable the controls
	 */
	setEnabled(enabled: boolean): void {
		const controls = this.container.querySelectorAll(
			"select, button, input"
		);
		controls.forEach((control) => {
			(
				control as
					| HTMLInputElement
					| HTMLSelectElement
					| HTMLButtonElement
			).disabled = !enabled;
		});

		if (enabled) {
			this.container.removeClass("tg-gantt-controls--disabled");
		} else {
			this.container.addClass("tg-gantt-controls--disabled");
		}
	}
}
