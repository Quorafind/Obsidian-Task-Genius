import {
	Component,
	ExtraButtonComponent,
	setIcon,
	DropdownComponent,
	ButtonComponent,
	CloseableComponent,
	App,
	setTooltip,
} from "obsidian";
import Sortable from "sortablejs";
import { t } from "@/translations/helper"; // Adjusted path assuming helper.ts is in src/translations
import "@/styles/global-filter.css";
import { FilterConfigModal } from "./FilterConfigModal";
import type TaskProgressBarPlugin from "@/index";

// --- Interfaces (from focus.md and example HTML) ---
// (Using 'any' for property types for now, will refine based on focus.md property list)
export interface Filter {
	id: string;
	property: string; // e.g., 'content', 'dueDate', 'priority'
	condition: string; // e.g., 'isSet', 'equals', 'contains'
	value?: any;
}

export interface FilterGroup {
	id: string;
	groupCondition: "all" | "any" | "none"; // How filters within this group are combined
	filters: Filter[];
}

export interface RootFilterState {
	rootCondition: "all" | "any" | "none"; // How filter groups are combined
	filterGroups: FilterGroup[];
}

// Represents a single filter condition UI row from focus.md
interface FilterConditionItem {
	property: string; // e.g., 'content', 'dueDate', 'priority', 'tags.myTag'
	operator: string; // e.g., 'contains', 'is', '>=', 'isEmpty'
	value?: any; // Value for the condition, type depends on property and operator
}

// Represents a group of filter conditions in the UI from focus.md
interface FilterGroupItem {
	logicalOperator: "AND" | "OR"; // How conditions/groups within this group are combined
	items: (FilterConditionItem | FilterGroupItem)[]; // Can contain conditions or nested groups
}

// Top-level filter configuration from the UI from focus.md
type FilterConfig = FilterGroupItem;

export class TaskFilterComponent extends Component {
	private hostEl: HTMLElement;
	private rootFilterState!: RootFilterState;
	private app: App;
	private filterGroupsContainerEl!: HTMLElement;
	private plugin?: TaskProgressBarPlugin;

	// Sortable instances
	private groupsSortable?: Sortable;

	constructor(
		hostEl: HTMLElement,
		app: App,
		private leafId?: string | undefined,
		plugin?: TaskProgressBarPlugin,
	) {
		super();
		this.hostEl = hostEl;
		this.app = app;
		this.plugin = plugin;
	}

	onload() {
		const savedState = this.leafId
			? this.app.loadLocalStorage(
					`task-genius-view-filter-${this.leafId}`,
				)
			: this.app.loadLocalStorage("task-genius-view-filter");

		console.log("savedState", savedState, this.leafId);
		if (
			savedState &&
			typeof savedState.rootCondition === "string" &&
			Array.isArray(savedState.filterGroups)
		) {
			// Basic validation passed
			this.rootFilterState = savedState as RootFilterState;
		} else {
			if (savedState) {
				// If it exists but failed validation
				console.warn(
					"Task Filter: Invalid data in local storage. Resetting to default state.",
				);
			}
			// Initialize with default state
			this.rootFilterState = {
				rootCondition: "any",
				filterGroups: [],
			};
		}

		// Render first to initialize DOM elements
		this.render();
	}

	onunload() {
		// Destroy sortable instances
		this.groupsSortable?.destroy();
		this.filterGroupsContainerEl
			?.querySelectorAll(".filters-list")
			.forEach((listEl) => {
				if ((listEl as any).sortableInstance) {
					((listEl as any).sortableInstance as Sortable).destroy();
				}
			});

		// Clear the host element
		this.hostEl.empty();
	}

	close() {
		this.onunload();
	}

	private generateId(): string {
		return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	private render(): void {
		this.hostEl.empty();
		this.hostEl.addClass("task-filter-root-container");

		const mainPanel = this.hostEl.createDiv({
			cls: "task-filter-main-panel",
		});
		const rootFilterSetupSection = mainPanel.createDiv({
			attr: { id: "root-filter-setup-section" },
		});
		rootFilterSetupSection.addClass("root-filter-setup-section");

		// Root Condition Section
		const rootConditionSection = rootFilterSetupSection.createDiv({});
		rootConditionSection.addClass("root-condition-section");

		rootConditionSection.createEl("label", {
			text: t("Match"),
			attr: { for: "task-filter-root-condition" },
			cls: ["compact-text", "root-condition-label"],
		});

		const rootConditionDropdown = new DropdownComponent(
			rootConditionSection,
		)
			.addOptions({
				any: t("Any"),
				all: t("All"),
				none: t("None"),
			})
			.setValue(this.rootFilterState.rootCondition)
			.onChange((value) => {
				this.rootFilterState.rootCondition = value as
					| "all"
					| "any"
					| "none";
				this.saveStateToLocalStorage();
				this.updateGroupSeparators();
			});

		rootConditionDropdown.selectEl.toggleClass("compact-select", true);

		rootConditionSection.createEl("span", {
			cls: ["compact-text", "root-condition-span"],
			text: t("filter group"),
		});

		// Filter Groups Container
		this.filterGroupsContainerEl = rootFilterSetupSection.createDiv({
			attr: { id: "task-filter-groups-container" },
			cls: "filter-groups-container",
		});

		// Add Filter Group Button Section
		const addGroupSection = rootFilterSetupSection.createDiv({
			cls: "add-group-section",
		});

		addGroupSection.createEl(
			"div",
			{
				cls: ["add-filter-group-btn", "compact-btn"],
			},
			(el) => {
				el.createEl(
					"span",
					{
						cls: "add-filter-group-btn-icon",
					},
					(iconEl) => {
						setIcon(iconEl, "plus");
					},
				);
				el.createEl("span", {
					cls: "add-filter-group-btn-text",
					text: t("Add filter group"),
				});

				this.registerDomEvent(el, "click", () => {
					this.addFilterGroup();
				});
			},
		);

		// Filter Configuration Buttons Section (only show if plugin is available)
		if (this.plugin) {
			const configSection = addGroupSection.createDiv({
				cls: "filter-config-section",
			});

			// Save Configuration Button
			configSection.createEl(
				"div",
				{
					cls: ["save-filter-config-btn", "compact-btn"],
				},
				(el) => {
					el.createEl(
						"span",
						{
							cls: "save-filter-config-btn-icon",
						},
						(iconEl) => {
							setIcon(iconEl, "save");
							setTooltip(el, t("Save Current Filter"));
						},
					);

					this.registerDomEvent(el, "click", () => {
						this.openSaveConfigModal();
					});
				},
			);

			// Load Configuration Button
			configSection.createEl(
				"div",
				{
					cls: ["load-filter-config-btn", "compact-btn"],
				},
				(el) => {
					el.createEl(
						"span",
						{
							cls: "load-filter-config-btn-icon",
						},
						(iconEl) => {
							setIcon(iconEl, "folder-open");
							setTooltip(el, t("Load Saved Filter"));
						},
					);

					this.registerDomEvent(el, "click", () => {
						this.openLoadConfigModal();
					});
				},
			);
		}

		// Re-populate filter groups from state
		this.rootFilterState.filterGroups.forEach((groupData) => {
			const groupElement = this.createFilterGroupElement(groupData);
			this.filterGroupsContainerEl.appendChild(groupElement);
		});
		this.updateGroupSeparators();
		this.makeSortableGroups();
	}

	// --- Filter Group Management ---
	private createFilterGroupElement(groupData: FilterGroup): HTMLElement {
		const newGroupEl = this.hostEl.createEl("div", {
			attr: { id: groupData.id },
			cls: ["filter-group"],
		});

		const groupHeader = newGroupEl.createDiv({
			cls: ["filter-group-header"],
		});

		const groupHeaderLeft = groupHeader.createDiv({
			cls: ["filter-group-header-left"],
		});

		// Drag Handle - kept as custom SVG for now
		groupHeaderLeft.createDiv(
			{
				cls: "drag-handle-container",
			},
			(el) => {
				el.createEl(
					"span",
					{
						cls: "drag-handle",
					},
					(iconEl) => {
						setIcon(iconEl, "grip-vertical");
					},
				);
			},
		);

		groupHeaderLeft.createEl("label", {
			cls: ["compact-text"],
			text: t("Match"),
		});

		const groupConditionSelect = new DropdownComponent(groupHeaderLeft)
			.addOptions({
				all: t("All"),
				any: t("Any"),
				none: t("None"),
			})
			.onChange((value) => {
				const selectedValue = value as "all" | "any" | "none";
				groupData.groupCondition = selectedValue;
				this.saveStateToLocalStorage();
				this.updateFilterConjunctions(
					newGroupEl.querySelector(".filters-list") as HTMLElement,
					selectedValue,
				);
			})
			.setValue(groupData.groupCondition);
		groupConditionSelect.selectEl.toggleClass(
			["group-condition-select", "compact-select"],
			true,
		);

		groupHeaderLeft.createEl("span", {
			cls: ["compact-text"],
			text: t("filter in this group"),
		});

		const groupHeaderRight = groupHeader.createDiv({
			cls: ["filter-group-header-right"],
		});

		const duplicateGroupBtn = new ExtraButtonComponent(groupHeaderRight)
			.setIcon("copy")
			.setTooltip(t("Duplicate filter group"))
			.onClick(() => {
				const newGroupId = this.generateId();
				const duplicatedFilters = groupData.filters.map((f) => ({
					...f,
					id: this.generateId(),
				}));
				const duplicatedGroupData: FilterGroup = {
					...groupData,
					id: newGroupId,
					filters: duplicatedFilters,
				};
				this.addFilterGroup(duplicatedGroupData, newGroupEl);
			});
		duplicateGroupBtn.extraSettingsEl.addClasses([
			"duplicate-group-btn",
			"clickable-icon",
		]);

		const removeGroupBtn = new ExtraButtonComponent(groupHeaderRight)
			.setIcon("trash-2")
			.setTooltip(t("Remove filter group"))
			.onClick(() => {
				const filtersListElForSortable = newGroupEl.querySelector(
					".filters-list",
				) as HTMLElement;
				if (
					filtersListElForSortable &&
					(filtersListElForSortable as any).sortableInstance
				) {
					(
						(filtersListElForSortable as any)
							.sortableInstance as Sortable
					).destroy();
				}

				this.rootFilterState.filterGroups =
					this.rootFilterState.filterGroups.filter(
						(g) => g.id !== groupData.id,
					);
				this.saveStateToLocalStorage();
				newGroupEl.remove();
				const nextSibling = newGroupEl.nextElementSibling;
				if (
					nextSibling &&
					nextSibling.classList.contains(
						"filter-group-separator-container",
					)
				) {
					nextSibling.remove();
				} else {
					const prevSibling = newGroupEl.previousElementSibling;
					if (
						prevSibling &&
						prevSibling.classList.contains(
							"filter-group-separator-container",
						)
					) {
						prevSibling.remove();
					}
				}
				this.updateGroupSeparators();
			});
		removeGroupBtn.extraSettingsEl.addClasses([
			"remove-group-btn",
			"clickable-icon",
		]);

		const filtersListEl = newGroupEl.createDiv({
			cls: ["filters-list"],
		});

		groupData.filters.forEach((filterData) => {
			const filterElement = this.createFilterItemElement(
				filterData,
				groupData,
			);
			filtersListEl.appendChild(filterElement);
		});
		this.updateFilterConjunctions(filtersListEl, groupData.groupCondition);

		const groupFooter = newGroupEl.createDiv({
			cls: ["group-footer"],
		});

		groupFooter.createEl(
			"div",
			{
				cls: ["add-filter-btn", "compact-btn"],
			},
			(el) => {
				el.createEl(
					"span",
					{
						cls: "add-filter-btn-icon",
					},
					(iconEl) => {
						setIcon(iconEl, "plus");
					},
				);
				el.createEl("span", {
					cls: "add-filter-btn-text",
					text: t("Add filter"),
				});

				this.registerDomEvent(el, "click", () => {
					this.addFilterToGroup(groupData, filtersListEl);
				});
			},
		);

		return newGroupEl;
	}

	private addFilterGroup(
		groupDataToClone: FilterGroup | null = null,
		insertAfterElement: HTMLElement | null = null,
	): void {
		// Ensure the container is initialized
		if (!this.filterGroupsContainerEl) {
			console.warn(
				"TaskFilterComponent: filterGroupsContainerEl not initialized yet",
			);
			return;
		}

		const newGroupId = groupDataToClone
			? groupDataToClone.id
			: this.generateId();

		let newGroupData: FilterGroup;
		if (groupDataToClone && insertAfterElement) {
			newGroupData = {
				id: newGroupId,
				groupCondition: groupDataToClone.groupCondition,
				filters: groupDataToClone.filters.map((f) => ({
					...f,
					id: this.generateId(),
				})),
			};
		} else {
			newGroupData = {
				id: newGroupId,
				groupCondition: "all",
				filters: [],
			};
		}

		const groupIndex = insertAfterElement
			? this.rootFilterState.filterGroups.findIndex(
					(g) => g.id === insertAfterElement.id,
				) + 1
			: this.rootFilterState.filterGroups.length;

		this.rootFilterState.filterGroups.splice(groupIndex, 0, newGroupData);
		this.saveStateToLocalStorage();
		const newGroupElement = this.createFilterGroupElement(newGroupData);

		if (
			insertAfterElement &&
			insertAfterElement.parentNode === this.filterGroupsContainerEl
		) {
			this.filterGroupsContainerEl.insertBefore(
				newGroupElement,
				insertAfterElement.nextSibling,
			);
		} else {
			this.filterGroupsContainerEl.appendChild(newGroupElement);
		}

		if (
			(!groupDataToClone || groupDataToClone.filters.length === 0) &&
			!insertAfterElement
		) {
			this.addFilterToGroup(
				newGroupData,
				newGroupElement.querySelector(".filters-list") as HTMLElement,
			);
		} else if (
			groupDataToClone &&
			groupDataToClone.filters.length === 0 &&
			insertAfterElement
		) {
			this.addFilterToGroup(
				newGroupData,
				newGroupElement.querySelector(".filters-list") as HTMLElement,
			);
		}

		this.updateGroupSeparators();
		this.makeSortableGroups();
	}

	// --- Filter Item Management ---
	private createFilterItemElement(
		filterData: Filter,
		groupData: FilterGroup,
	): HTMLElement {
		const newFilterEl = this.hostEl.createEl("div", {
			attr: { id: filterData.id },
			cls: ["filter-item"],
		});

		if (groupData.groupCondition === "any") {
			newFilterEl.createEl("span", {
				cls: ["filter-conjunction"],
				text: t("OR"),
			});
		} else if (groupData.groupCondition === "none") {
			newFilterEl.createEl("span", {
				cls: ["filter-conjunction"],
				text: t("AND NOT"),
			});
		} else {
			newFilterEl.createEl("span", {
				cls: ["filter-conjunction"],
				text: t("AND"),
			});
		}

		const propertySelect = new DropdownComponent(newFilterEl);
		propertySelect.selectEl.addClasses([
			"filter-property-select",
			"compact-select",
		]);

		const conditionSelect = new DropdownComponent(newFilterEl);
		conditionSelect.selectEl.addClasses([
			"filter-condition-select",
			"compact-select",
		]);

		const valueInput = newFilterEl.createEl("input", {
			cls: ["filter-value-input", "compact-input"],
		});
		valueInput.hide();

		propertySelect.onChange((value) => {
			filterData.property = value;
			this.saveStateToLocalStorage(false); // 不立即触发更新
			setTimeout(() => this.saveStateToLocalStorage(true), 300);
			this.updateFilterPropertyOptions(
				newFilterEl,
				filterData,
				propertySelect,
				conditionSelect,
				valueInput,
			);
		});

		const toggleValueInputVisibility = (
			currentCond: string,
			propertyType: string,
		) => {
			const conditionsRequiringValue = [
				"equals",
				"contains",
				"doesNotContain",
				"startsWith",
				"endsWith",
				"is",
				"isNot",
				">",
				"<",
				">=",
				"<=",
			];
			let valueActuallyNeeded =
				conditionsRequiringValue.includes(currentCond);

			if (
				propertyType === "completed" &&
				(currentCond === "isTrue" || currentCond === "isFalse")
			) {
				valueActuallyNeeded = false;
			}
			if (currentCond === "isEmpty" || currentCond === "isNotEmpty") {
				valueActuallyNeeded = false;
			}

			valueInput.style.display = valueActuallyNeeded ? "block" : "none";
			if (!valueActuallyNeeded && filterData.value !== undefined) {
				filterData.value = undefined;
				this.saveStateToLocalStorage();
				valueInput.value = "";
			}
		};

		conditionSelect.onChange((newCondition) => {
			filterData.condition = newCondition;
			this.saveStateToLocalStorage(false); // 不立即触发更新
			setTimeout(() => this.saveStateToLocalStorage(true), 300);
			toggleValueInputVisibility(newCondition, filterData.property);
			if (
				valueInput.style.display === "none" &&
				valueInput.value !== ""
			) {
				// If input is hidden, value should be undefined as per toggleValueInputVisibility
				// This part might need re-evaluation of logic if filterData.value should be set here.
				// For now, assuming toggleValueInputVisibility handles setting filterData.value correctly.
			}
		});

		valueInput.value = filterData.value || "";

		let valueInputTimeout: NodeJS.Timeout;
		this.registerDomEvent(valueInput, "input", (event) => {
			filterData.value = (event.target as HTMLInputElement).value;
			// 在输入时不立即触发实时更新，只保存状态
			this.saveStateToLocalStorage(false);
			// 延迟触发实时更新
			clearTimeout(valueInputTimeout);
			valueInputTimeout = setTimeout(() => {
				this.saveStateToLocalStorage(true);
			}, 400); // 400ms 防抖
		});

		const removeFilterBtn = new ExtraButtonComponent(newFilterEl)
			.setIcon("trash-2")
			.setTooltip(t("Remove filter"))
			.onClick(() => {
				groupData.filters = groupData.filters.filter(
					(f) => f.id !== filterData.id,
				);
				this.saveStateToLocalStorage();
				newFilterEl.remove();
				this.updateFilterConjunctions(
					newFilterEl.parentElement as HTMLElement,
					groupData.groupCondition,
				);
			});
		removeFilterBtn.extraSettingsEl.addClasses([
			"remove-filter-btn",
			"clickable-icon",
		]);

		this.updateFilterPropertyOptions(
			newFilterEl,
			filterData,
			propertySelect,
			conditionSelect,
			valueInput,
		);

		return newFilterEl;
	}

	private addFilterToGroup(
		groupData: FilterGroup,
		filtersListEl: HTMLElement,
	): void {
		const newFilterId = this.generateId();
		const newFilterData: Filter = {
			id: newFilterId,
			property: "content",
			condition: "contains",
			value: "",
		};
		groupData.filters.push(newFilterData);
		this.saveStateToLocalStorage();

		const newFilterElement = this.createFilterItemElement(
			newFilterData,
			groupData,
		);
		filtersListEl.appendChild(newFilterElement);

		this.updateFilterConjunctions(filtersListEl, groupData.groupCondition);
	}

	private updateFilterPropertyOptions(
		filterItemEl: HTMLElement,
		filterData: Filter,
		propertySelect: DropdownComponent,
		conditionSelect: DropdownComponent,
		valueInput: HTMLInputElement,
	): void {
		const property = filterData.property;

		if (propertySelect.selectEl.options.length === 0) {
			propertySelect.addOptions({
				content: t("Content"),
				status: t("Status"),
				priority: t("Priority"),
				dueDate: t("Due Date"),
				startDate: t("Start Date"),
				scheduledDate: t("Scheduled Date"),
				tags: t("Tags"),
				filePath: t("File Path"),
				project: t("Project"),
				completed: t("Completed"),
			});
		}
		propertySelect.setValue(property);

		let conditionOptions: { value: string; text: string }[] = [];
		valueInput.type = "text";

		switch (property) {
			case "content":
			case "filePath":
			case "status":
			case "project":
				conditionOptions = [
					{
						value: "contains",
						text: t("contains"),
					},
					{
						value: "doesNotContain",
						text: t("does not contain"),
					},
					{ value: "is", text: t("is") },
					{
						value: "isNot",
						text: t("is not"),
					},
					{
						value: "startsWith",
						text: t("starts with"),
					},
					{
						value: "endsWith",
						text: t("ends with"),
					},
					{
						value: "isEmpty",
						text: t("is empty"),
					},
					{
						value: "isNotEmpty",
						text: t("is not empty"),
					},
				];
				break;
			case "priority":
				conditionOptions = [
					{
						value: "is",
						text: t("is"),
					},
					{
						value: "isNot",
						text: t("is not"),
					},
					{
						value: "isEmpty",
						text: t("is empty"),
					},
					{
						value: "isNotEmpty",
						text: t("is not empty"),
					},
				];
				break;
			case "dueDate":
			case "startDate":
			case "scheduledDate":
				valueInput.type = "date";
				conditionOptions = [
					{ value: "is", text: t("is") },
					{
						value: "isNot",
						text: t("is not"),
					},
					{
						value: ">",
						text: ">",
					},
					{
						value: "<",
						text: "<",
					},
					{
						value: ">=",
						text: ">=",
					},
					{
						value: "<=",
						text: "<=",
					},
					{
						value: "isEmpty",
						text: t("is empty"),
					},
					{
						value: "isNotEmpty",
						text: t("is not empty"),
					},
				];
				break;
			case "tags":
				conditionOptions = [
					{
						value: "contains",
						text: t("contains"),
					},
					{
						value: "doesNotContain",
						text: t("does not contain"),
					},
					{
						value: "isEmpty",
						text: t("is empty"),
					},
					{
						value: "isNotEmpty",
						text: t("is not empty"),
					},
				];
				break;
			case "completed":
				conditionOptions = [
					{
						value: "isTrue",
						text: t("is true"),
					},
					{
						value: "isFalse",
						text: t("is false"),
					},
				];
				break;
			default:
				conditionOptions = [
					{
						value: "isSet",
						text: t("is set"),
					},
					{
						value: "isNotSet",
						text: t("is not set"),
					},
					{
						value: "equals",
						text: t("equals"),
					},
					{
						value: "contains",
						text: t("contains"),
					},
				];
		}

		conditionSelect.selectEl.empty();
		conditionOptions.forEach((opt) =>
			conditionSelect.addOption(opt.value, opt.text),
		);

		const currentSelectedCondition = filterData.condition;
		let conditionChanged = false;
		if (
			conditionOptions.some(
				(opt) => opt.value === currentSelectedCondition,
			)
		) {
			conditionSelect.setValue(currentSelectedCondition);
		} else if (conditionOptions.length > 0) {
			conditionSelect.setValue(conditionOptions[0].value);
			filterData.condition = conditionOptions[0].value;
			conditionChanged = true;
		}

		const finalConditionVal = conditionSelect.getValue();
		const conditionsRequiringValue = [
			"equals",
			"contains",
			"doesNotContain",
			"startsWith",
			"endsWith",
			"is",
			"isNot",
			">",
			"<",
			">=",
			"<=",
		];
		let valueActuallyNeeded =
			conditionsRequiringValue.includes(finalConditionVal);
		if (
			property === "completed" &&
			(finalConditionVal === "isTrue" || finalConditionVal === "isFalse")
		) {
			valueActuallyNeeded = false;
		}
		if (
			finalConditionVal === "isEmpty" ||
			finalConditionVal === "isNotEmpty"
		) {
			valueActuallyNeeded = false;
		}

		let valueChanged = false;
		valueInput.style.display = valueActuallyNeeded ? "block" : "none";
		if (valueActuallyNeeded) {
			if (filterData.value !== undefined) {
				valueInput.value = filterData.value;
			} else {
				if (valueInput.value !== "") {
					valueInput.value = "";
				}
			}
		} else {
			valueInput.value = "";
			if (filterData.value !== undefined) {
				filterData.value = undefined;
				valueChanged = true;
			}
		}

		if (conditionChanged || valueChanged) {
			this.saveStateToLocalStorage();
		}
	}

	// --- UI Updates (Conjunctions, Separators) ---
	private updateFilterConjunctions(
		filtersListEl: HTMLElement | null,
		groupCondition: "all" | "any" | "none" = "all",
	): void {
		if (!filtersListEl) return;
		const filters = filtersListEl.querySelectorAll(".filter-item");
		filters.forEach((filter, index) => {
			const conjunctionElement = filter.querySelector(
				".filter-conjunction",
			) as HTMLElement;
			if (conjunctionElement) {
				if (index !== 0) {
					conjunctionElement.show();
					if (groupCondition === "any") {
						conjunctionElement.textContent = t("OR");
					} else if (groupCondition === "none") {
						conjunctionElement.textContent = t("NOR");
					} else {
						conjunctionElement.textContent = t("AND");
					}
				} else {
					conjunctionElement.hide();
					if (groupCondition === "any") {
						conjunctionElement.textContent = t("OR");
					} else if (groupCondition === "none") {
						conjunctionElement.textContent = t("NOR");
					} else {
						conjunctionElement.textContent = t("AND");
					}
				}
			}
		});
	}

	private updateGroupSeparators(): void {
		this.filterGroupsContainerEl
			?.querySelectorAll(".filter-group-separator-container")
			.forEach((sep) => sep.remove());

		const groups = Array.from(
			this.filterGroupsContainerEl?.children || [],
		).filter((child) => child.classList.contains("filter-group"));

		if (groups.length > 1) {
			groups.forEach((group, index) => {
				if (index < groups.length - 1) {
					const separatorContainer = createEl("div", {
						cls: "filter-group-separator-container",
					});
					const separator = separatorContainer.createDiv({
						cls: "filter-group-separator",
					});

					const rootCond = this.rootFilterState.rootCondition;
					let separatorText = t("OR");
					if (rootCond === "all") separatorText = t("AND");
					else if (rootCond === "none") separatorText = t("AND NOT");

					separator.textContent = separatorText.toUpperCase();
					group.parentNode?.insertBefore(
						separatorContainer,
						group.nextSibling,
					);
				}
			});
		}
	}

	// --- SortableJS Integration ---
	private makeSortableGroups(): void {
		if (this.groupsSortable) {
			this.groupsSortable.destroy();
			this.groupsSortable = undefined;
		}
		if (!this.filterGroupsContainerEl) return;

		this.groupsSortable = new Sortable(this.filterGroupsContainerEl, {
			animation: 150,
			handle: ".drag-handle",
			filter: ".filter-group-separator-container",
			preventOnFilter: true,
			ghostClass: "dragging-placeholder",
			onEnd: (evt: Event) => {
				const sortableEvent = evt as any;
				if (
					sortableEvent.oldDraggableIndex === undefined ||
					sortableEvent.newDraggableIndex === undefined
				)
					return;

				const movedGroup = this.rootFilterState.filterGroups.splice(
					sortableEvent.oldDraggableIndex,
					1,
				)[0];
				this.rootFilterState.filterGroups.splice(
					sortableEvent.newDraggableIndex,
					0,
					movedGroup,
				);
				this.saveStateToLocalStorage();
				this.updateGroupSeparators();
			},
		});
	}

	// --- Filter State Management ---
	private updateFilterState(
		filterGroups: FilterGroup[],
		rootCondition: "all" | "any" | "none",
	): void {
		this.rootFilterState.filterGroups = filterGroups;
		this.rootFilterState.rootCondition = rootCondition;
		this.saveStateToLocalStorage();
	}

	// Public method to get current filter state
	public getFilterState(): RootFilterState {
		// Handle case where rootFilterState might not be initialized
		if (!this.rootFilterState) {
			return {
				rootCondition: "any",
				filterGroups: [],
			};
		}
		return JSON.parse(JSON.stringify(this.rootFilterState));
	}

	// Public method to load filter state
	public loadFilterState(state: RootFilterState): void {
		// Safely destroy sortable instances
		try {
			if (this.groupsSortable) {
				this.groupsSortable.destroy();
				this.groupsSortable = undefined;
			}
		} catch (error) {
			console.warn("Error destroying groups sortable:", error);
			this.groupsSortable = undefined;
		}

		// Safely destroy filter list sortable instances
		this.filterGroupsContainerEl
			?.querySelectorAll(".filters-list")
			.forEach((listEl) => {
				try {
					if ((listEl as any).sortableInstance) {
						(
							(listEl as any).sortableInstance as Sortable
						).destroy();
						(listEl as any).sortableInstance = undefined;
					}
				} catch (error) {
					console.warn(
						"Error destroying filter list sortable:",
						error,
					);
					(listEl as any).sortableInstance = undefined;
				}
			});

		this.rootFilterState = JSON.parse(JSON.stringify(state));
		this.saveStateToLocalStorage();

		this.render();
	}

	// --- Local Storage Management ---
	private saveStateToLocalStorage(
		triggerRealtimeUpdate: boolean = true,
	): void {
		if (this.app) {
			this.app.saveLocalStorage(
				this.leafId
					? `task-genius-view-filter-${this.leafId}`
					: "task-genius-view-filter",
				this.rootFilterState,
			);

			// 只有在需要实时更新时才触发事件
			if (triggerRealtimeUpdate) {
				// 触发过滤器变更事件，传递当前的过滤器状态
				this.app.workspace.trigger(
					"task-genius:filter-changed",
					this.rootFilterState,
					this.leafId || undefined,
				);
			}
		}
	}

	// --- Filter Configuration Management ---
	private openSaveConfigModal(): void {
		if (!this.plugin) return;

		const modal = new FilterConfigModal(
			this.app,
			this.plugin,
			"save",
			this.getFilterState(),
			(config) => {
				// Optional: Handle successful save
				console.log("Filter configuration saved:", config.name);
			},
		);
		modal.open();
	}

	private openLoadConfigModal(): void {
		if (!this.plugin) return;

		const modal = new FilterConfigModal(
			this.app,
			this.plugin,
			"load",
			undefined,
			undefined,
			(config) => {
				// Load the configuration
				this.loadFilterState(config.filterState);
				console.log("Filter configuration loaded:", config.name);
			},
		);
		modal.open();
	}
}
