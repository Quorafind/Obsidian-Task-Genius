import { Component, Notice, setIcon } from "obsidian";
import { FilterDropdown } from "./filter-dropdown";
import { FilterPill } from "./filter-pill";
import {
	ActiveFilter,
	FilterCategory,
	FilterComponentOptions,
} from "./filter-type";
import "./filter.css";
import { Task } from "@/types/task";
import TaskProgressBarPlugin from "@/index";
import { t } from "@/translations/helper";
import { PRIORITY_MAP } from "@/common/default-symbol";

// Helper function to build filter categories and options from tasks
export function buildFilterOptionsFromTasks(tasks: Task[]): FilterCategory[] {
	const statuses = new Set<string>();
	const tags = new Set<string>();
	const projects = new Set<string>();
	const contexts = new Set<string>();
	const priorities = new Set<number>();
	const filePaths = new Set<string>();

	tasks.forEach((task) => {
		// Status (handle potential undefined/null)
		if (task.status) statuses.add(task.status);

		// Tags
		task.metadata.tags.forEach((tag) => {
			// Skip non-string tags
			if (typeof tag === "string") {
				tags.add(tag);
			}
		});

		// Project
		if (task.metadata.project) projects.add(task.metadata.project);

		// Context
		if (task.metadata.context) contexts.add(task.metadata.context);

		// Priority
		if (task.metadata.priority !== undefined)
			priorities.add(task.metadata.priority);

		// File Path
		if (task.filePath) filePaths.add(task.filePath);
	});

	// Convert sets to sorted arrays for consistent display
	const sortedStatuses = Array.from(statuses).sort();
	const sortedTags = Array.from(tags).sort();
	const sortedProjects = Array.from(projects).sort();
	const sortedContexts = Array.from(contexts).sort();

	// Create a reverse map (Number -> Icon/Preferred String)
	// Prioritize icons. Handle potential duplicate values (like ⏬️ and ⏬ both mapping to 1).
	const REVERSE_PRIORITY_MAP: Record<number, string> = {};
	// Define preferred icons
	const PREFERRED_ICONS: Record<number, string> = {
		5: "🔺",
		4: "⏫",
		3: "🔼",
		2: "🔽",
		1: "⏬", // Choose one variant
	};
	for (const key in PRIORITY_MAP) {
		const value = PRIORITY_MAP[key];
		// Only add if it's the preferred icon or if no entry exists for this number yet
		if (key === PREFERRED_ICONS[value] || !REVERSE_PRIORITY_MAP[value]) {
			REVERSE_PRIORITY_MAP[value] = key;
		}
	}
	// Special handling for cases where the preferred icon might not be in the map if only text was used
	for (const num in PREFERRED_ICONS) {
		if (!REVERSE_PRIORITY_MAP[num]) {
			REVERSE_PRIORITY_MAP[num] = PREFERRED_ICONS[num];
		}
	}

	// Map numerical priorities to icons/strings and sort them based on the number value (descending for priority)
	const sortedPriorityOptions = Array.from(priorities)
		.sort((a, b) => b - a) // Sort descending by number
		.map((num) => REVERSE_PRIORITY_MAP[num] || num.toString()) // Map to icon or fallback to number string
		.filter((val): val is string => !!val); // Ensure no undefined values

	const sortedFilePaths = Array.from(filePaths).sort();

	const categories: FilterCategory[] = [
		{
			id: "status",
			label: t("Status"),
			options: sortedStatuses,
		},
		{ id: "tag", label: t("Tag"), options: sortedTags },
		{ id: "project", label: t("Project"), options: sortedProjects },
		{ id: "context", label: t("Context"), options: sortedContexts },
		{
			id: "priority",
			label: t("Priority"),
			options: sortedPriorityOptions,
		}, // Use the mapped & sorted icons/strings
		{ id: "completed", label: t("Completed"), options: ["Yes", "No"] }, // Static options
		{ id: "filePath", label: t("File Path"), options: sortedFilePaths },
		// Add other categories as needed (e.g., dueDate, startDate)
		// These might require different option generation logic (e.g., date ranges)
	];

	return categories;
}

export class FilterComponent extends Component {
	private container: HTMLElement;
	private options: FilterCategory[];
	private activeFilters: ActiveFilter[] = [];
	private filterPills: Map<string, FilterPill> = new Map(); // Store pill components by ID
	private filtersContainer: HTMLElement;
	private controlsContainer: HTMLElement;
	private addFilterButton: HTMLButtonElement;
	private clearAllButton: HTMLButtonElement;
	private dropdown: FilterDropdown | null = null;
	private onChange: (activeFilters: ActiveFilter[]) => void;

	constructor(
		private params: FilterComponentOptions,
		private plugin: TaskProgressBarPlugin,
	) {
		super();
		this.container = params.container;
		this.options = params.options || [];
		this.onChange = params.onChange || (() => {});
	}

	override onload(): void {
		this.render();
		this.setupEventListeners();
		this.loadInitialFilters(); // If any initial filters were set before load
	}

	override onunload(): void {
		// Clear the container managed by this component
		this.container.empty();
		// Child components (pills, dropdown) are automatically unloaded by Component lifecycle
		this.filterPills.clear();
		this.activeFilters = [];
	}

	private render(): void {
		this.container.empty(); // Clear previous content

		const filterElement = this.container.createDiv({
			cls: "filter-component",
		});

		this.filtersContainer = filterElement.createDiv({
			cls: "filter-pills-container",
		});

		this.controlsContainer = filterElement.createDiv({
			cls: "filter-controls",
		});

		this.addFilterButton = this.controlsContainer.createEl(
			"button",
			{
				cls: "filter-add-button",
			},
			(el) => {
				const iconSpan = el.createEl("span", {
					cls: "filter-add-icon",
				});
				setIcon(iconSpan, "plus");
				const textSpan = el.createEl("span", {
					text: t("Add filter"),
				});
			},
		);

		this.clearAllButton = this.controlsContainer.createEl("button", {
			cls: "filter-clear-all-button mod-destructive",
			text: t("Clear all"),
		});
		this.clearAllButton.hide(); // Initially hidden

		this.updateClearAllButton(); // Set initial state

		for (const component of this.params.components || []) {
			this.addChild(component);
		}
	}

	private setupEventListeners(): void {
		this.registerDomEvent(this.addFilterButton, "click", (e) => {
			e.stopPropagation();
			this.showFilterDropdown();
		});

		this.registerDomEvent(this.clearAllButton, "click", () => {
			this.clearAllFilters();
		});

		// Note: The document click/escape listeners are now handled
		// internally by FilterDropdown when it's loaded.
	}

	private showFilterDropdown(): void {
		// If a dropdown already exists, remove it first.
		this.hideFilterDropdown();

		// Determine available options (categories not already active)
		const availableOptions = this.options.filter(
			(option) =>
				option.options.length > 0 && // Only show categories with available options
				!this.activeFilters.some(
					(filter) => filter.category === option.id,
				),
		);

		if (availableOptions.length === 0) {
			console.log(
				"No more filter categories available or options populated.",
			);
			new Notice("No more filter categories available.");
			return;
		}

		// Create and register the dropdown as a child component
		this.dropdown = new FilterDropdown(
			{
				options: availableOptions,
				anchorElement: this.addFilterButton,
				onSelect: (categoryId, value) => {
					this.addFilter(categoryId, value);
					this.hideFilterDropdown(); // Close dropdown after selection
				},
				onClose: () => {
					this.hideFilterDropdown(); // Close dropdown if requested (e.g., Escape key)
				},
			},
			this.plugin,
		);
		this.addChild(this.dropdown); // Manage lifecycle
	}

	private hideFilterDropdown(): void {
		if (this.dropdown) {
			this.removeChild(this.dropdown); // This triggers dropdown.onunload
			this.dropdown = null;
		}
	}

	private addFilter(categoryId: string, value: string): void {
		const category = this.options.find((opt) => opt.id === categoryId);
		if (!category) return;

		// Prevent adding the exact same category/value pair if desired (optional)
		// const exists = this.activeFilters.some(f => f.category === categoryId && f.value === value);
		// if (exists) return;

		// Generate a unique ID for this specific filter instance
		const filterId = `filter-${categoryId}-${Date.now()}-${Math.random()
			.toString(36)
			.substring(2, 7)}`;

		const newFilter: ActiveFilter = {
			id: filterId,
			category: categoryId,
			categoryLabel: category.label,
			value: value,
		};

		this.activeFilters.push(newFilter);

		// Create and add the pill component
		const pill = new FilterPill({
			filter: newFilter,
			onRemove: (id) => {
				this.removeFilter(id);
			},
		});

		this.filterPills.set(filterId, pill); // Store the component
		this.addChild(pill); // Manage lifecycle
		this.filtersContainer.appendChild(pill.element); // Append the pill's element

		this.updateClearAllButton();
		this.onChange(this.getActiveFilters());
	}

	private removeFilter(id: string): void {
		const index = this.activeFilters.findIndex((f) => f.id === id);
		if (index === -1) return;

		// Remove from active filters array
		this.activeFilters.splice(index, 1);

		// Remove the corresponding pill component
		const pillToRemove = this.filterPills.get(id);
		if (pillToRemove) {
			// Removing the child triggers its onunload, but the animation is handled
			// *before* calling onRemove. We need to manually remove the element now.
			pillToRemove.element.remove(); // Remove element from DOM
			this.removeChild(pillToRemove); // Unload the component
			this.filterPills.delete(id); // Remove from map
		}

		this.updateClearAllButton();
		this.onChange(this.getActiveFilters());
	}

	private clearAllFilters(): void {
		// Remove all pill components
		this.filterPills.forEach((pill) => {
			pill.element.remove(); // Remove element first
			this.removeChild(pill); // Then unload
		});
		this.filterPills.clear();

		// Clear active filters array
		this.activeFilters = [];

		this.filtersContainer.empty();

		this.updateClearAllButton();
		this.onChange(this.getActiveFilters());
	}

	private updateClearAllButton(): void {
		if (this.clearAllButton) {
			this.activeFilters.length > 0
				? this.clearAllButton.show()
				: this.clearAllButton.hide();
		}
	}

	private loadInitialFilters(): void {
		// If filters were added via setFilters before onload, render them now
		const currentFilters = [...this.activeFilters]; // Copy array
		this.clearAllFilters(); // Clear state but keep the data
		// Re-add filters using the (potentially updated) options
		currentFilters.forEach((f) => {
			const categoryExists = this.options.some(
				(opt) => opt.id === f.category,
			);
			if (categoryExists) {
				// Check if the specific value exists within the updated options for that category
				const categoryWithOptions = this.options.find(
					(opt) => opt.id === f.category,
				);
				if (categoryWithOptions?.options.includes(f.value)) {
					this.addFilter(f.category, f.value);
				} else {
					console.warn(
						`Initial filter value "${f.value}" no longer exists for category "${f.category}". Skipping.`,
					);
				}
			} else {
				console.warn(
					`Initial filter category "${f.category}" no longer exists. Skipping filter for value "${f.value}".`,
				);
			}
		});
	}

	// --- Public Methods ---

	/**
	 * Updates the available filter categories and their options based on the provided tasks.
	 * @param tasks The list of tasks to derive filter options from.
	 */
	public updateFilterOptions(tasks: Task[]): void {
		this.options = buildFilterOptionsFromTasks(tasks);
	}

	public getActiveFilters(): ActiveFilter[] {
		// Return a copy to prevent external modification
		return JSON.parse(JSON.stringify(this.activeFilters));
	}

	public setFilters(filters: { category: string; value: string }[]): void {
		// Clear existing filters and pills cleanly
		this.clearAllFilters();

		// Add each new filter
		filters.forEach((filter) => {
			// Find the category label from options
			const category = this.options.find(
				(opt) => opt.id === filter.category,
			);
			// Check if the specific option value exists within the category
			if (category && category.options.includes(filter.value)) {
				// We call addFilter, which handles adding to activeFilters, creating pills, etc.
				this.addFilter(filter.category, filter.value);
			} else if (category) {
				console.warn(
					`Filter value "${filter.value}" not found in options for category "${filter.category}".`,
				);
			} else {
				console.warn(
					`Filter category "${filter.category}" not found in options.`,
				);
			}
		});

		// If called after onload, ensure UI is updated immediately
		if (this._loaded) {
			this.updateClearAllButton();
			this.onChange(this.getActiveFilters());
		}
	}
}
