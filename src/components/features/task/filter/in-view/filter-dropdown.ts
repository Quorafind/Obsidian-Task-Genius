import { Component, debounce, setIcon } from "obsidian";
import { FilterCategory, FilterDropdownOptions } from "./filter-type";
import TaskProgressBarPlugin from "@/index";
import { t } from "@/translations/helper";

export class FilterDropdown extends Component {
	private options: FilterCategory[];
	private anchorElement: HTMLElement;
	public element: HTMLElement; // Dropdown element, public for positioning checks if needed elsewhere
	private searchInput: HTMLInputElement;
	private listContainer: HTMLElement;
	private currentCategory: FilterCategory | null = null;
	private onSelect: (category: string, value: string) => void;
	private onClose: () => void; // Keep onClose for explicit close requests

	constructor(
		options: FilterDropdownOptions,
		private plugin: TaskProgressBarPlugin,
	) {
		super();
		this.options = options.options;
		this.anchorElement = options.anchorElement;
		this.onSelect = options.onSelect;
		this.onClose = options.onClose; // Parent calls this to trigger unload
	}

	override onload(): void {
		this.element = this.createDropdownElement();
		this.searchInput = this.element.querySelector(
			".filter-dropdown-search",
		) as HTMLInputElement;
		this.listContainer = this.element.querySelector(
			".filter-dropdown-list",
		) as HTMLElement;

		this.renderCategoryList();

		this.setupEventListeners();

		// Append to body
		document.body.appendChild(this.element);

		// Add animation class after a short delay
		setTimeout(() => {
			this.element.classList.add("filter-dropdown-visible");
			this.positionDropdown();
		}, 10);

		// Focus search after a short delay
		setTimeout(() => {
			this.searchInput.focus();
		}, 50);
	}

	override onunload(): void {
		// Remove the dropdown with animation
		this.element.classList.remove("filter-dropdown-visible");

		// Remove element after animation completes
		// Use a timer matching the animation duration
		setTimeout(() => {
			this.element.remove();
		}, 150); // Match CSS animation duration
	}

	private createDropdownElement(): HTMLElement {
		const dropdown = createEl("div", { cls: "filter-dropdown" });

		const header = dropdown.createEl("div", {
			cls: "filter-dropdown-header",
		});
		header.createEl("input", {
			type: "text",
			cls: "filter-dropdown-search",
			attr: { placeholder: "Filter..." },
		});

		dropdown.createEl("div", { cls: "filter-dropdown-list" });

		return dropdown;
	}

	private positionDropdown(): void {
		const rect = this.anchorElement.getBoundingClientRect();
		const { innerHeight, innerWidth } = window;

		// Recalculate dropdown dimensions *after* potential content changes
		this.element.style.visibility = "hidden"; // Temporarily hide to measure
		this.element.style.display = "flex"; // Ensure it's laid out
		const dropdownHeight = this.element.offsetHeight;
		const dropdownWidth = this.element.offsetWidth;
		this.element.style.display = ""; // Reset display
		this.element.style.visibility = ""; // Make visible again

		// Default position below the anchor
		let top = rect.bottom + 8;
		let left = rect.left;

		// Check if dropdown goes off bottom edge
		if (top + dropdownHeight > innerHeight - 16) {
			top = rect.top - dropdownHeight - 8;
		}

		// Check if dropdown goes off top edge (ensure it's not negative)
		if (top < 16) {
			top = 16;
		}

		// Check if dropdown goes off right edge
		if (left + dropdownWidth > innerWidth - 16) {
			left = innerWidth - dropdownWidth - 16;
		}

		// Check if dropdown goes off left edge
		if (left < 16) {
			left = 16;
		}

		this.element.style.top = `${top}px`;
		this.element.style.left = `${left}px`;
	}

	private renderCategoryList(): void {
		this.listContainer.empty();
		this.searchInput.placeholder = "Filter categories...";
		this.searchInput.value = ""; // Ensure search is cleared when showing categories

		this.options.forEach((category) => {
			const item = this.createListItem(
				category.label,
				() => this.showCategoryValues(category),
				true, // has arrow
				false, // not back button
				false, // not value item
				category.id,
			);
			this.listContainer.appendChild(item);
		});
		this.positionDropdown(); // Reposition after rendering
	}

	private showCategoryValues(category: FilterCategory): void {
		this.currentCategory = category;
		this.searchInput.value = ""; // Clear search on category change
		this.searchInput.placeholder = `Filter ${category.label.toLowerCase()}...`;

		this.listContainer.empty();

		// Add back button
		const backButton = this.createListItem(
			t("Back to categories"),
			() => {
				this.currentCategory = null;
				this.renderCategoryList();
			},
			false, // no arrow
			true, // is back button
		);
		this.listContainer.appendChild(backButton);

		// Add separator
		this.listContainer.createEl("div", {
			cls: "filter-dropdown-separator",
		});

		// Render values for the selected category
		this.renderFilterValues(category.options);
		this.positionDropdown(); // Reposition after rendering

		this.searchInput.focus(); // Keep focus on search
	}

	private renderFilterValues(
		values: string[],
		searchTerm: string = "",
	): void {
		// Remove existing value items and empty state, keeping back button and separator
		const itemsToRemove = this.listContainer.querySelectorAll(
			".filter-dropdown-value-item, .filter-dropdown-empty",
		);
		itemsToRemove.forEach((item) => item.remove());

		const filteredValues = searchTerm
			? values.filter((value) =>
					value.toLowerCase().includes(searchTerm.toLowerCase()),
				)
			: values;

		if (filteredValues.length === 0) {
			this.listContainer.createEl("div", {
				cls: "filter-dropdown-empty",
				text: t("No matching options found"),
			});
		} else {
			filteredValues.forEach((value) => {
				const item = this.createListItem(
					value,
					() => {
						if (this.currentCategory) {
							this.onSelect(this.currentCategory.id, value);
							// onClose will be called by the parent to unload this component
						}
					},
					false, // no arrow
					false, // not back button
					true, // is value item
				);
				this.listContainer.appendChild(item);
			});
		}
		this.positionDropdown(); // Reposition after potentially changing list height
	}

	// Helper to create list items consistently
	private createListItem(
		label: string,
		onClick: () => void,
		hasArrow: boolean = false,
		isBackButton: boolean = false,
		isValueItem: boolean = false,
		categoryId: string = "",
	): HTMLElement {
		const item = createEl("div", { cls: "filter-dropdown-item" });
		if (isBackButton) item.classList.add("filter-dropdown-back");
		if (isValueItem) item.classList.add("filter-dropdown-value-item");

		item.setAttr("tabindex", 0); // Make items focusable

		if (isBackButton) {
			const backArrow = item.createEl("span", {
				cls: "filter-dropdown-item-arrow back",
			});
			setIcon(backArrow, "chevron-left");
		}

		item.createEl("span", {
			cls: "filter-dropdown-item-label",
			text: label,
		});

		if (hasArrow) {
			const forwardArrow = item.createEl("span", {
				cls: "filter-dropdown-item-arrow",
			});
			setIcon(forwardArrow, "chevron-right");
		}

		this.registerDomEvent(item, "click", onClick);
		// Handle Enter key press for accessibility
		this.registerDomEvent(item, "keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				onClick();
			}
		});

		return item;
	}

	private setupEventListeners(): void {
		// Debounced search input handler
		const debouncedSearch = debounce(
			() => {
				const searchTerm = this.searchInput.value.trim();
				if (this.currentCategory) {
					this.renderFilterValues(
						this.currentCategory.options,
						searchTerm,
					);
				} else {
					this.filterCategoryList(searchTerm);
				}
			},
			150,
			false, // Changed to false: debounce triggers after user stops typing
		);

		this.registerDomEvent(this.searchInput, "input", debouncedSearch);

		// Close dropdown when clicking outside of it
		this.registerDomEvent(document, "click", (e: MouseEvent) => {
			if (!e.composedPath().includes(this.element)) {
				this.onClose(); // Request parent to close
			}
		});

		// Handle keyboard navigation and actions
		this.registerDomEvent(this.element, "keydown", (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				this.onClose(); // Request parent to close
			} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault();
				// If focus is on search input and user presses down, focus first item
				if (
					e.key === "ArrowDown" &&
					document.activeElement === this.searchInput
				) {
					this.focusFirstItem();
				} else {
					this.navigateItems(e.key === "ArrowDown");
				}
			} else if (
				e.key === "Enter" &&
				document.activeElement === this.searchInput
			) {
				// Handle enter on search input - maybe select first visible item?
				// Or do nothing, requiring explicit selection. Let's stick to explicit for now.
				this.selectFirstVisibleItem();
			}
			// Enter key on list items is handled by createListItem's keydown listener
			else if (
				e.key === "Backspace" &&
				this.searchInput.value === "" &&
				this.currentCategory
			) {
				// Go back if backspace is pressed in empty search within a category
				const backButton =
					this.listContainer.querySelector<HTMLElement>(
						".filter-dropdown-back",
					);
				backButton?.click(); // Simulate click on back button
			}
		});

		// Click handling on preview items moved to filterCategoryList where they are created
	}

	// Handles filtering the main category list
	private filterCategoryList(searchTerm: string): void {
		this.listContainer.empty(); // Use empty()

		const lowerSearchTerm = searchTerm.toLowerCase();
		const filteredOptions = this.options.filter(
			(category) =>
				category.label.toLowerCase().includes(lowerSearchTerm) ||
				category.options.some((option) =>
					option.toLowerCase().includes(lowerSearchTerm),
				),
		);

		if (filteredOptions.length === 0) {
			this.listContainer.createEl("div", {
				cls: "filter-dropdown-empty",
				text: t("No matching filters found"),
			});
		} else {
			filteredOptions.forEach((category) => {
				const matchingValues = category.options.filter((option) =>
					option.toLowerCase().includes(lowerSearchTerm),
				);

				const itemContainer = this.listContainer.createEl("div", {
					cls: "filter-dropdown-item-container",
				}); // Wrapper for styling/focus

				if (matchingValues.length > 0 && searchTerm) {
					// Show category label and matching values directly
					itemContainer.createEl("div", {
						cls: "filter-dropdown-category-header",
						text: category.label,
					});

					matchingValues.forEach((value) => {
						const valuePreview = itemContainer.createEl("div", {
							cls: "filter-dropdown-value-preview",
							text: value,
							attr: {
								tabindex: 0, // Make focusable
								"data-category": category.id,
								"data-value": value,
							},
						});
						// Handle click directly on the preview item
						this.registerDomEvent(valuePreview, "click", (e) => {
							e.stopPropagation(); // Prevent potential outer clicks
							this.onSelect(category.id, value);
						});
						// Handle Enter key press for accessibility
						this.registerDomEvent(
							valuePreview,
							"keydown",
							(e: KeyboardEvent) => {
								if (e.key === "Enter") {
									e.preventDefault();
									this.onSelect(category.id, value);
								}
							},
						);
					});
				} else {
					// Show regular category item (clickable to show values)
					const categoryItem = this.createListItem(
						category.label,
						() => this.showCategoryValues(category),
						true, // has arrow
					);
					itemContainer.appendChild(categoryItem);
				}
			});
		}
		this.positionDropdown(); // Reposition after filtering
	}

	private getVisibleFocusableItems(): HTMLElement[] {
		return Array.from(
			this.listContainer.querySelectorAll<HTMLElement>(
				`.filter-dropdown-item, .filter-dropdown-value-preview`,
			),
		).filter(
			(el) =>
				el.offsetParent !== null &&
				window.getComputedStyle(el).visibility !== "hidden" &&
				window.getComputedStyle(el).display !== "none",
		);
	}

	private focusFirstItem(): void {
		const items = this.getVisibleFocusableItems();
		items[0]?.focus();
	}

	private selectFirstVisibleItem(): void {
		const items = this.getVisibleFocusableItems();
		items[0]?.click(); // Simulate click on the first item
	}

	// Handles Arrow Up/Down navigation
	private navigateItems(down: boolean): void {
		const items = this.getVisibleFocusableItems();
		if (items.length === 0) return;

		const currentFocus = document.activeElement as HTMLElement;
		let currentIndex = -1;

		// Check if the currently focused element is one of our items
		if (currentFocus && items.includes(currentFocus)) {
			currentIndex = items.findIndex((item) => item === currentFocus);
		} else if (currentFocus === this.searchInput) {
			// If focus is on search, ArrowDown goes to first item, ArrowUp goes to last
			currentIndex = down ? -1 : items.length; // Acts as index before first or after last
		}

		let nextIndex;
		if (down) {
			nextIndex = currentIndex >= items.length - 1 ? 0 : currentIndex + 1;
		} else {
			// Up
			nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
		}

		// Check if nextIndex is valid before focusing
		if (nextIndex >= 0 && nextIndex < items.length) {
			items[nextIndex]?.focus();
		}
	}
}
