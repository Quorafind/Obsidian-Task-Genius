import { Component, setIcon, Menu, App } from "obsidian";
import { TableColumn, TableRow, TableCell } from "./TableTypes";
import { TableSpecificConfig } from "../../common/setting-definition";
import { t } from "../../translations/helper";
import { DatePickerPopover } from "../date-picker/DatePickerPopover";
import type TaskProgressBarPlugin from "../../index";
import { ContextSuggest, ProjectSuggest, TagSuggest } from "../AutoComplete";
import { clearAllMarks } from "../MarkdownRenderer";
import { getEffectiveProject, isProjectReadonly } from "../../utils/taskUtil";

// Cache for autocomplete data to avoid repeated expensive operations
interface AutoCompleteCache {
	tags: string[];
	projects: string[];
	contexts: string[];
	lastUpdate: number;
}

/**
 * Table renderer component responsible for rendering the table HTML structure
 */
export class TableRenderer extends Component {
	private resizeObserver: ResizeObserver | null = null;
	private isResizing: boolean = false;
	private resizeStartX: number = 0;
	private resizeColumn: string = "";
	private resizeStartWidth: number = 0;

	// DOM节点缓存池
	private rowPool: HTMLTableRowElement[] = [];
	private activeRows: Map<string, HTMLTableRowElement> = new Map();
	private eventCleanupMap: Map<HTMLElement, Array<() => void>> = new Map();

	// AutoComplete optimization
	private autoCompleteCache: AutoCompleteCache | null = null;
	private activeSuggests: Map<
		HTMLInputElement,
		ContextSuggest | ProjectSuggest | TagSuggest
	> = new Map();
	private readonly CACHE_DURATION = 30000; // 30 seconds cache

	// Callback for date changes
	public onDateChange?: (
		rowId: string,
		columnId: string,
		newDate: string | null
	) => void;

	// Callback for row expansion
	public onRowExpand?: (rowId: string) => void;

	// Callback for cell value changes
	public onCellChange?: (
		rowId: string,
		columnId: string,
		newValue: any
	) => void;

	constructor(
		private tableEl: HTMLElement,
		private headerEl: HTMLElement,
		private bodyEl: HTMLElement,
		private columns: TableColumn[],
		private config: TableSpecificConfig,
		private app: App,
		private plugin: TaskProgressBarPlugin
	) {
		super();
	}

	onload() {
		this.renderHeader();
		this.setupResizeHandlers();
	}

	onunload() {
		// Clean up all tracked events
		this.eventCleanupMap.forEach((cleanupFns) => {
			cleanupFns.forEach((fn) => fn());
		});
		this.eventCleanupMap.clear();

		// Clean up active suggests
		this.activeSuggests.forEach((suggest) => {
			suggest.close();
		});
		this.activeSuggests.clear();

		// Clean up row pools and active rows
		this.rowPool.forEach((row) => {
			this.cleanupRowEvents(row);
			row.remove();
		});
		this.rowPool = [];

		this.activeRows.forEach((row) => {
			this.cleanupRowEvents(row);
		});
		this.activeRows.clear();

		// Clear autocomplete cache
		this.autoCompleteCache = null;

		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}

	/**
	 * Get cached autocomplete data or fetch if expired
	 */
	private getAutoCompleteData(): AutoCompleteCache {
		const now = Date.now();

		if (
			!this.autoCompleteCache ||
			now - this.autoCompleteCache.lastUpdate > this.CACHE_DURATION
		) {
			// Fetch fresh data
			const tags = Object.keys(
				this.plugin.app.metadataCache.getTags() || {}
			).map(
				(tag) => tag.substring(1) // Remove # prefix
			);

			const { projects, contexts } =
				this.plugin.taskManager?.getAvailableContextOrProjects() || {
					projects: [],
					contexts: [],
				};

			this.autoCompleteCache = {
				tags,
				projects,
				contexts,
				lastUpdate: now,
			};
		}

		return this.autoCompleteCache;
	}

	/**
	 * Create or reuse autocomplete suggest for input
	 */
	private setupAutoComplete(
		input: HTMLInputElement,
		type: "tags" | "project" | "context"
	): void {
		// Check if this input already has a suggest
		if (this.activeSuggests.has(input)) {
			return;
		}

		const data = this.getAutoCompleteData();
		let suggest: ContextSuggest | ProjectSuggest | TagSuggest;

		switch (type) {
			case "tags":
				suggest = new TagSuggest(this.app, input, this.plugin);
				// Override the expensive getTags call with cached data
				(suggest as any).availableChoices = data.tags;
				break;
			case "project":
				suggest = new ProjectSuggest(this.app, input, this.plugin);
				(suggest as any).availableChoices = data.projects;
				break;
			case "context":
				suggest = new ContextSuggest(this.app, input, this.plugin);
				(suggest as any).availableChoices = data.contexts;
				break;
		}

		this.activeSuggests.set(input, suggest);

		// Clean up when input is removed or loses focus permanently
		const cleanup = () => {
			const suggestInstance = this.activeSuggests.get(input);
			if (suggestInstance) {
				suggestInstance.close();
				this.activeSuggests.delete(input);
			}
		};

		// Clean up when input is removed from DOM
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				mutation.removedNodes.forEach((node) => {
					if (
						node === input ||
						(node instanceof Element && node.contains(input))
					) {
						cleanup();
						observer.disconnect();
					}
				});
			});
		});

		observer.observe(document.body, { childList: true, subtree: true });
	}

	/**
	 * Render the table header
	 */
	private renderHeader() {
		this.headerEl.empty();

		const headerRow = this.headerEl.createEl("tr", "task-table-header-row");

		this.columns.forEach((column) => {
			const th = headerRow.createEl("th", "task-table-header-cell");
			th.dataset.columnId = column.id;
			th.style.width = `${column.width}px`;
			th.style.minWidth = `${Math.min(column.width, 50)}px`;

			// Create header content container
			const headerContent = th.createDiv("task-table-header-content");

			// Add column title
			const titleSpan = headerContent.createSpan(
				"task-table-header-title"
			);
			titleSpan.textContent = column.title;

			// Add sort indicator if sortable
			if (column.sortable) {
				th.addClass("sortable");
				const sortIcon = headerContent.createSpan(
					"task-table-sort-icon"
				);
				setIcon(sortIcon, "chevrons-up-down");
			}

			// Add resize handle if resizable
			if (column.resizable && this.config.resizableColumns) {
				const resizeHandle = th.createDiv("task-table-resize-handle");
				this.registerDomEvent(resizeHandle, "mousedown", (e) => {
					this.startResize(e, column.id, column.width);
				});
			}

			// Set text alignment
			if (column.align) {
				th.style.textAlign = column.align;
			}
		});
	}

	/**
	 * Render the table body with rows using improved DOM node recycling
	 */
	public renderTable(
		rows: TableRow[],
		selectedRows: Set<string>,
		startIndex: number = 0,
		totalRows?: number
	) {
		// Always clear empty state first if it exists
		this.clearEmptyState();

		if (rows.length === 0) {
			this.clearAllRows();
			this.renderEmptyState();
			return;
		}

		// Handle virtual scroll spacer first
		this.updateVirtualScrollSpacer(startIndex);

		// Track which row IDs are currently needed
		const neededRowIds = new Set(rows.map((row) => row.id));
		const currentRowElements = Array.from(
			this.bodyEl.querySelectorAll("tr[data-row-id]")
		);

		// Step 1: Remove rows that are no longer needed
		const rowsToRemove: string[] = [];
		this.activeRows.forEach((rowEl, rowId) => {
			if (!neededRowIds.has(rowId)) {
				rowsToRemove.push(rowId);
			}
		});

		// Return unneeded rows to pool (batch operation)
		if (rowsToRemove.length > 0) {
			const fragment = document.createDocumentFragment();
			rowsToRemove.forEach((rowId) => {
				const rowEl = this.activeRows.get(rowId);
				if (rowEl && rowEl.parentNode) {
					this.activeRows.delete(rowId);
					fragment.appendChild(rowEl); // Move to fragment (removes from DOM)
					this.returnRowToPool(rowEl);
				}
			});
		}

		// Step 2: Build a map of current DOM positions
		const spacerElement = this.bodyEl.querySelector(
			".virtual-scroll-spacer-top"
		);
		const targetPosition = spacerElement ? 1 : 0; // Position after spacer

		// Step 3: Process each needed row
		const rowsToInsert: { element: HTMLTableRowElement; index: number }[] =
			[];

		rows.forEach((row, index) => {
			let rowEl = this.activeRows.get(row.id);
			const targetIndex = targetPosition + index;

			if (!rowEl) {
				// Create new row
				rowEl = this.getRowFromPool();
				this.activeRows.set(row.id, rowEl);
				this.updateRow(rowEl, row, selectedRows.has(row.id));
				rowsToInsert.push({ element: rowEl, index: targetIndex });
			} else {
				// Always update existing rows to ensure they reflect current sort order
				// This is crucial for proper re-rendering after sorting
				this.updateRow(rowEl, row, selectedRows.has(row.id));

				// Check if row needs repositioning
				const currentIndex = Array.from(this.bodyEl.children).indexOf(
					rowEl
				);
				if (currentIndex !== targetIndex) {
					rowsToInsert.push({ element: rowEl, index: targetIndex });
				}
			}
		});

		// Step 4: Insert/reposition rows efficiently
		if (rowsToInsert.length > 0) {
			// Sort by target index to insert in correct order
			rowsToInsert.sort((a, b) => a.index - b.index);

			// Use insertBefore for precise positioning
			const children = Array.from(this.bodyEl.children);
			rowsToInsert.forEach(({ element, index }) => {
				const referenceNode = children[index];
				if (referenceNode && referenceNode !== element) {
					this.bodyEl.insertBefore(element, referenceNode);
				} else if (!referenceNode) {
					this.bodyEl.appendChild(element);
				}
			});
		}
	}

	/**
	 * Optimized row update check - more precise
	 */
	private shouldUpdateRow(
		rowEl: HTMLTableRowElement,
		row: TableRow,
		isSelected: boolean
	): boolean {
		// Quick checks first
		const currentRowId = rowEl.dataset.rowId;
		if (currentRowId !== row.id) return true;

		const wasSelected = rowEl.hasClass("selected");
		if (wasSelected !== isSelected) return true;

		const currentLevel = parseInt(rowEl.dataset.level || "0");
		if (currentLevel !== row.level) return true;

		// Check expanded state for tree view
		const currentExpanded = rowEl.dataset.expanded === "true";
		if (currentExpanded !== row.expanded) return true;

		// Check if hasChildren state changed
		const currentHasChildren = rowEl.dataset.hasChildren === "true";
		if (currentHasChildren !== row.hasChildren) return true;

		// Check if row has the right number of cells
		const currentCellCount = rowEl.querySelectorAll("td").length;
		if (currentCellCount !== row.cells.length) return true;

		// Optimized cell content check - only check key fields that change frequently
		const currentCells = rowEl.querySelectorAll("td");
		for (let i = 0; i < Math.min(row.cells.length, 3); i++) {
			// Only check first 3 cells for performance
			const cell = row.cells[i];
			const currentCell = currentCells[i];

			if (!currentCell) return true; // Cell missing

			// For editable text cells, check the actual content
			if (
				cell.editable &&
				(cell.columnId === "content" ||
					cell.columnId === "project" ||
					cell.columnId === "context")
			) {
				const input = currentCell.querySelector("input");
				const currentValue = input
					? input.value
					: currentCell.textContent || "";
				const newValue = cell.displayValue || "";
				if (currentValue.trim() !== newValue.trim()) {
					return true;
				}
			}
			// For tags cells, compare array content
			else if (cell.columnId === "tags") {
				const newTags = Array.isArray(cell.value) ? cell.value : [];
				const currentTagsText = currentCell.textContent || "";
				const expectedTagsText = newTags.join(", ");
				if (currentTagsText.trim() !== expectedTagsText.trim()) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Get a row element from the pool or create a new one
	 */
	private getRowFromPool(): HTMLTableRowElement {
		let rowEl = this.rowPool.pop();
		if (!rowEl) {
			rowEl = document.createElement("tr");
			rowEl.addClass("task-table-row");
		}
		return rowEl;
	}

	/**
	 * Return a row element to the pool for reuse
	 */
	private returnRowToPool(rowEl: HTMLTableRowElement) {
		// Clean up event listeners
		this.cleanupRowEvents(rowEl);

		// Clear row content and attributes efficiently
		rowEl.empty();
		rowEl.className = "task-table-row";

		// Batch attribute removal
		const attributesToRemove = [
			"data-row-id",
			"data-level",
			"data-expanded",
			"data-has-children",
		];
		attributesToRemove.forEach((attr) => rowEl.removeAttribute(attr));

		// Add to pool if not too many
		if (this.rowPool.length < 50) {
			// Reduced pool size for better memory usage
			this.rowPool.push(rowEl);
		} else {
			// Remove from DOM completely
			rowEl.remove();
		}
	}

	/**
	 * Update a row element with new data - optimized version
	 */
	private updateRow(
		rowEl: HTMLTableRowElement,
		row: TableRow,
		isSelected: boolean
	) {
		// Clean up previous events for this row
		this.cleanupRowEvents(rowEl);

		// Clear and set basic attributes efficiently
		rowEl.empty();

		// Batch dataset updates
		const dataset = rowEl.dataset;
		dataset.rowId = row.id;
		dataset.level = row.level.toString();
		dataset.expanded = row.expanded.toString();
		dataset.hasChildren = row.hasChildren.toString();

		// Update classes efficiently using a single className assignment
		const classNames = [
			"task-table-row",
			...(row.level > 0
				? [`task-table-row-level-${row.level}`, "task-table-subtask"]
				: []),
			...(row.hasChildren ? ["task-table-parent"] : []),
			...(isSelected ? ["selected"] : []),
			...(row.className ? [row.className] : []),
		];
		rowEl.className = classNames.join(" ");

		// Pre-calculate common styles to avoid repeated calculations
		const isSubtask = row.level > 0;
		const subtaskOpacity = isSubtask ? "0.9" : "";

		// Create document fragment for batch DOM operations
		const fragment = document.createDocumentFragment();

		// Render cells
		row.cells.forEach((cell, index) => {
			const column = this.columns[index];
			if (!column) return;

			const td = document.createElement("td");
			td.className = "task-table-cell";

			// Batch dataset and style updates
			td.dataset.columnId = cell.columnId;
			td.dataset.rowId = row.id;

			// Set cell width and styles efficiently
			td.style.cssText = `width:${column.width}px;min-width:${Math.min(
				column.width,
				50
			)}px;${column.align ? `text-align:${column.align};` : ""}`;

			// Apply subtask styling if needed
			if (isSubtask) {
				td.classList.add("task-table-subtask-cell");
				if (subtaskOpacity) {
					td.style.opacity = subtaskOpacity;
				}
			}

			// Render content based on column type
			if (column.id === "rowNumber") {
				this.renderTreeStructure(td, row, cell, column);
			} else {
				this.renderCellContent(td, cell, column, row);
			}

			if (cell.className) {
				td.classList.add(cell.className);
			}

			fragment.appendChild(td);
		});

		// Single DOM append operation
		rowEl.appendChild(fragment);
	}

	/**
	 * Update virtual scroll spacer - simplified and optimized
	 */
	private updateVirtualScrollSpacer(startIndex: number) {
		// Always clear existing spacers first
		this.clearVirtualSpacers();

		// Only create spacer if we're truly scrolled down (not just at the edge)
		if (startIndex <= 0) {
			return; // No spacers needed when at or near the top
		}

		// Create top spacer for rows above viewport
		const topSpacer = document.createElement("tr");
		topSpacer.className = "virtual-scroll-spacer-top";

		const topSpacerCell = document.createElement("td");
		topSpacerCell.colSpan = this.columns.length;
		topSpacerCell.style.cssText = `
			height: ${startIndex * 40}px;
			padding: 0;
			margin: 0;
			border: none;
			background: transparent;
			border-collapse: collapse;
			line-height: 0;
		`;

		topSpacer.appendChild(topSpacerCell);

		// Insert at the very beginning
		this.bodyEl.insertBefore(topSpacer, this.bodyEl.firstChild);
	}

	/**
	 * Clear existing virtual spacers - optimized
	 */
	private clearVirtualSpacers() {
		// Use more efficient selector and removal
		const spacers = this.bodyEl.querySelectorAll(
			".virtual-scroll-spacer-top, .virtual-scroll-spacer-bottom"
		);
		spacers.forEach((spacer) => spacer.remove());
	}

	/**
	 * Clear all rows and return them to pool
	 */
	private clearAllRows() {
		// Batch cleanup for better performance
		const rowsToCleanup = Array.from(this.activeRows.values());
		rowsToCleanup.forEach((rowEl) => {
			this.returnRowToPool(rowEl);
		});
		this.activeRows.clear();
		this.bodyEl.empty();
	}

	/**
	 * Clean up event listeners for a row - optimized
	 */
	private cleanupRowEvents(element: HTMLElement) {
		const cleanupFns = this.eventCleanupMap.get(element);
		if (cleanupFns) {
			cleanupFns.forEach((fn) => fn());
			this.eventCleanupMap.delete(element);
		}

		// Also clean up child elements - but limit depth for performance
		const childElements = element.querySelectorAll(
			"input, button, [data-cleanup]"
		);
		childElements.forEach((child) => {
			const childCleanup = this.eventCleanupMap.get(child as HTMLElement);
			if (childCleanup) {
				childCleanup.forEach((fn) => fn());
				this.eventCleanupMap.delete(child as HTMLElement);
			}
		});
	}

	/**
	 * Override registerDomEvent to track cleanup functions
	 */
	registerDomEvent<K extends keyof HTMLElementEventMap>(
		el: HTMLElement | Document | Window,
		type: K,
		callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
		options?: boolean | AddEventListenerOptions
	): void {
		// Call the appropriate overload based on the element type
		if (el instanceof Window) {
			super.registerDomEvent(el, type as any, callback as any, options);
		} else if (el instanceof Document) {
			super.registerDomEvent(el, type as any, callback as any, options);
		} else {
			super.registerDomEvent(el, type, callback, options);

			// Track cleanup for HTMLElements only
			if (!this.eventCleanupMap.has(el)) {
				this.eventCleanupMap.set(el, []);
			}
			this.eventCleanupMap.get(el)!.push(() => {
				el.removeEventListener(type, callback as any, options);
			});
		}
	}

	/**
	 * Render tree structure for content column
	 */
	private renderTreeStructure(
		cellEl: HTMLElement,
		row: TableRow,
		cell: TableCell,
		column: TableColumn
	) {
		const treeContainer = cellEl.createDiv("task-table-tree-container");

		if (row.level > 0) {
			// Add expand/collapse button for parent rows
			if (row.hasChildren) {
				const expandBtn = treeContainer.createSpan(
					"task-table-expand-btn"
				);
				expandBtn.addClass("clickable-icon");
				setIcon(
					expandBtn,
					row.expanded ? "chevron-down" : "chevron-right"
				);
				this.registerDomEvent(expandBtn, "click", (e) => {
					e.stopPropagation();
					this.toggleRowExpansion(row.id);
				});
				expandBtn.title = row.expanded ? t("Collapse") : t("Expand");
			}
		} else if (row.hasChildren) {
			// Top-level parent task with children
			const expandBtn = treeContainer.createSpan("task-table-expand-btn");
			expandBtn.addClass("clickable-icon");
			expandBtn.addClass("task-table-top-level-expand");
			setIcon(expandBtn, row.expanded ? "chevron-down" : "chevron-right");
			this.registerDomEvent(expandBtn, "click", (e) => {
				e.stopPropagation();
				this.toggleRowExpansion(row.id);
			});
			expandBtn.title = row.expanded
				? t("Collapse subtasks")
				: t("Expand subtasks");
		}

		// Create content wrapper
		const contentWrapper = treeContainer.createDiv(
			"task-table-content-wrapper"
		);

		// Render the actual cell content
		this.renderCellContent(contentWrapper, cell, column, row);
	}

	/**
	 * Render cell content based on column type
	 */
	private renderCellContent(
		cellEl: HTMLElement,
		cell: TableCell,
		column: TableColumn,
		row?: TableRow
	) {
		cellEl.empty();

		switch (column.type) {
			case "status":
				this.renderStatusCell(cellEl, cell);
				break;
			case "priority":
				this.renderPriorityCell(cellEl, cell);
				break;
			case "date":
				this.renderDateCell(cellEl, cell);
				break;
			case "tags":
				this.renderTagsCell(cellEl, cell);
				break;
			case "number":
				this.renderNumberCell(cellEl, cell);
				break;
			default:
				this.renderTextCell(cellEl, cell, row);
		}
	}

	/**
	 * Render status cell with visual indicator and click-to-edit
	 */
	private renderStatusCell(cellEl: HTMLElement, cell: TableCell) {
		const statusContainer = cellEl.createDiv("task-table-status");
		statusContainer.addClass("clickable-status");

		// Add status icon
		const statusIcon = statusContainer.createSpan("task-table-status-icon");
		const status = cell.value as string;

		switch (status) {
			case "x":
			case "X":
				setIcon(statusIcon, "check-circle");
				statusContainer.addClass("completed");
				break;
			case "/":
			case ">":
				setIcon(statusIcon, "clock");
				statusContainer.addClass("in-progress");
				break;
			case "-":
				setIcon(statusIcon, "x-circle");
				statusContainer.addClass("abandoned");
				break;
			case "?":
				setIcon(statusIcon, "help-circle");
				statusContainer.addClass("planned");
				break;
			default:
				setIcon(statusIcon, "circle");
				statusContainer.addClass("not-started");
		}

		// Add status text
		const statusText = statusContainer.createSpan("task-table-status-text");
		statusText.textContent = cell.displayValue;

		// Add click handler for status editing
		this.registerDomEvent(statusContainer, "click", (e) => {
			e.stopPropagation();
			this.openStatusMenu(cellEl, cell);
		});

		// Add hover effect
		statusContainer.title = t("Click to change status");
	}

	/**
	 * Open status selection menu
	 */
	private openStatusMenu(cellEl: HTMLElement, cell: TableCell) {
		const rowId = cellEl.dataset.rowId;
		if (!rowId) return;

		const menu = new Menu();

		// Get unique statuses from taskStatusMarks
		const statusMarks = this.plugin.settings.taskStatusMarks;
		const uniqueStatuses = new Map<string, string>();

		// Build a map of unique mark -> status name to avoid duplicates
		for (const status of Object.keys(statusMarks)) {
			const mark = statusMarks[status];
			// If this mark is not already in the map, add it
			// This ensures each mark appears only once in the menu
			if (!Array.from(uniqueStatuses.values()).includes(mark)) {
				uniqueStatuses.set(status, mark);
			}
		}

		// Create menu items from unique statuses
		for (const [status, mark] of uniqueStatuses) {
			menu.addItem((item) => {
				item.titleEl.createEl(
					"span",
					{
						cls: "status-option-checkbox",
					},
					(el) => {
						const checkbox = el.createEl("input", {
							cls: "task-list-item-checkbox",
							type: "checkbox",
						});
						checkbox.dataset.task = mark;
						if (mark !== " ") {
							checkbox.checked = true;
						}
					}
				);
				item.titleEl.createEl("span", {
					cls: "status-option",
					text: status,
				});
				item.onClick(() => {
					if (this.onCellChange) {
						// Also update completed status if needed
						const isCompleted = mark.toLowerCase() === "x";
						this.onCellChange(rowId, cell.columnId, mark);
						// Note: completion status should be handled by the parent component
					}
				});
			});
		}

		const rect = cellEl.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom + 5 });
	}

	/**
	 * Render priority cell with visual indicator and click-to-edit
	 */
	private renderPriorityCell(cellEl: HTMLElement, cell: TableCell) {
		const priorityContainer = cellEl.createDiv("task-table-priority");
		priorityContainer.addClass("clickable-priority");
		const priority = cell.value as number;

		if (priority) {
			// Add priority icon
			const priorityIcon = priorityContainer.createSpan(
				"task-table-priority-icon"
			);

			// Add priority text with emoji and label
			const priorityText = priorityContainer.createSpan(
				"task-table-priority-text"
			);

			// Update priority icons and text according to 5-level system
			if (priority === 5) {
				setIcon(priorityIcon, "triangle");
				priorityIcon.addClass("highest");
				priorityText.textContent = t("Highest");
			} else if (priority === 4) {
				setIcon(priorityIcon, "alert-triangle");
				priorityIcon.addClass("high");
				priorityText.textContent = t("High");
			} else if (priority === 3) {
				setIcon(priorityIcon, "minus");
				priorityIcon.addClass("medium");
				priorityText.textContent = t("Medium");
			} else if (priority === 2) {
				setIcon(priorityIcon, "chevron-down");
				priorityIcon.addClass("low");
				priorityText.textContent = t("Low");
			} else if (priority === 1) {
				setIcon(priorityIcon, "chevrons-down");
				priorityIcon.addClass("lowest");
				priorityText.textContent = t("Lowest");
			}
		} else {
			// Empty priority cell
			const emptyText = priorityContainer.createSpan(
				"task-table-priority-empty"
			);
			emptyText.textContent = "\u00A0"; // Non-breaking space for invisible whitespace
			emptyText.addClass("empty-priority");
		}

		// Add click handler for priority editing
		this.registerDomEvent(priorityContainer, "click", (e) => {
			e.stopPropagation();
			this.openPriorityMenu(cellEl, cell);
		});

		// Add hover effect
		priorityContainer.title = t("Click to set priority");
	}

	/**
	 * Open priority selection menu
	 */
	private openPriorityMenu(cellEl: HTMLElement, cell: TableCell) {
		const rowId = cellEl.dataset.rowId;
		if (!rowId) return;

		const menu = new Menu();

		// No priority option
		menu.addItem((item) => {
			item.setTitle(t("No priority"))
				.setIcon("circle")
				.onClick(() => {
					if (this.onCellChange) {
						this.onCellChange(rowId, cell.columnId, null);
					}
				});
		});

		// Lowest priority (1)
		menu.addItem((item) => {
			item.setTitle(t("Lowest"))
				.setIcon("chevrons-down")
				.onClick(() => {
					if (this.onCellChange) {
						this.onCellChange(rowId, cell.columnId, 1);
					}
				});
		});

		// Low priority (2)
		menu.addItem((item) => {
			item.setTitle(t("Low"))
				.setIcon("chevron-down")
				.onClick(() => {
					if (this.onCellChange) {
						this.onCellChange(rowId, cell.columnId, 2);
					}
				});
		});

		// Medium priority (3)
		menu.addItem((item) => {
			item.setTitle(t("Medium"))
				.setIcon("minus")
				.onClick(() => {
					if (this.onCellChange) {
						this.onCellChange(rowId, cell.columnId, 3);
					}
				});
		});

		// High priority (4)
		menu.addItem((item) => {
			item.setTitle(t("High"))
				.setIcon("alert-triangle")
				.onClick(() => {
					if (this.onCellChange) {
						this.onCellChange(rowId, cell.columnId, 4);
					}
				});
		});

		// Highest priority (5)
		menu.addItem((item) => {
			item.setTitle(t("Highest"))
				.setIcon("triangle")
				.onClick(() => {
					if (this.onCellChange) {
						this.onCellChange(rowId, cell.columnId, 5);
					}
				});
		});

		const rect = cellEl.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom + 5 });
	}

	/**
	 * Render date cell with relative time and click-to-edit functionality
	 */
	private renderDateCell(cellEl: HTMLElement, cell: TableCell) {
		const dateContainer = cellEl.createDiv("task-table-date");
		dateContainer.addClass("clickable-date");

		if (cell.value) {
			const date = new Date(cell.value as number);
			date.setHours(0, 0, 0, 0); // Zero out time for consistent comparison

			const now = new Date();
			now.setHours(0, 0, 0, 0); // Zero out time for consistent comparison

			const diffDays = Math.floor(
				(date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
			);

			// Add date text
			const dateText = dateContainer.createSpan("task-table-date-text");
			dateText.textContent = cell.displayValue;

			// Add relative indicator
			const relativeIndicator = dateContainer.createSpan(
				"task-table-date-relative"
			);
			if (diffDays === 0) {
				relativeIndicator.textContent = t("Today");
				relativeIndicator.addClass("today");
			} else if (diffDays === 1) {
				relativeIndicator.textContent = t("Tomorrow");
				relativeIndicator.addClass("tomorrow");
			} else if (diffDays === -1) {
				relativeIndicator.textContent = t("Yesterday");
				relativeIndicator.addClass("yesterday");
			} else if (diffDays < 0) {
				relativeIndicator.textContent = t("Overdue");
				relativeIndicator.addClass("overdue");
			} else if (diffDays <= 7) {
				relativeIndicator.textContent = `${diffDays}d`;
				relativeIndicator.addClass("upcoming");
			}
		} else {
			// Empty date cell
			const emptyText = dateContainer.createSpan("task-table-date-empty");
			emptyText.textContent = "\u00A0"; // Non-breaking space for invisible whitespace
			emptyText.addClass("empty-date");
		}

		// Add click handler for date editing
		if (this.app && this.plugin) {
			this.registerDomEvent(dateContainer, "click", (e) => {
				e.stopPropagation();
				this.openDatePicker(cellEl, cell);
			});

			// Add hover effect
			dateContainer.title = t("Click to edit date");
		}
	}

	/**
	 * Open date picker for editing date
	 */
	private openDatePicker(cellEl: HTMLElement, cell: TableCell) {
		if (!this.app || !this.plugin) return;

		const rowId = cellEl.dataset.rowId;
		const columnId = cell.columnId;

		if (!rowId) return;

		// Get current date value - fix timezone offset issue
		let currentDate: string | undefined;
		if (cell.value) {
			const date = new Date(cell.value as number);
			// Use local date methods to avoid timezone offset
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			currentDate = `${year}-${month}-${day}`;
		}

		// Create date picker popover
		const popover = new DatePickerPopover(
			this.app,
			this.plugin,
			currentDate
		);

		popover.onDateSelected = (dateStr: string | null) => {
			if (this.onDateChange) {
				this.onDateChange(rowId, columnId, dateStr);
			}
		};

		// Position the popover near the cell
		const rect = cellEl.getBoundingClientRect();
		popover.showAtPosition({
			x: rect.left,
			y: rect.bottom + 5,
		});
	}

	/**
	 * Render tags cell with inline editing and auto-suggest
	 */
	private renderTagsCell(cellEl: HTMLElement, cell: TableCell) {
		const tagsContainer = cellEl.createDiv("task-table-tags");
		const tags = cell.value as string[];

		if (cell.editable) {
			// Create editable input for tags
			const input = tagsContainer.createEl(
				"input",
				"task-table-tags-input"
			);
			input.type = "text";
			const initialValue = tags?.join(", ") || "";
			input.value = initialValue;
			input.style.cssText =
				"border:none;background:transparent;width:100%;padding:0;font:inherit;";

			// Store initial value for comparison
			const originalTags = [...(tags || [])];

			// Setup autocomplete only when user starts typing or focuses
			let autoCompleteSetup = false;
			const setupAutoCompleteOnce = () => {
				if (!autoCompleteSetup && this.app) {
					autoCompleteSetup = true;
					this.setupAutoComplete(input, "tags");
				}
			};

			// Handle blur event to save changes
			this.registerDomEvent(input, "blur", () => {
				const newValue = input.value.trim();
				const newTags = newValue
					? newValue
							.split(",")
							.map((tag) => tag.trim())
							.filter((tag) => tag.length > 0)
					: [];

				// Only save if tags actually changed
				if (!this.arraysEqual(originalTags, newTags)) {
					this.saveCellValue(cellEl, cell, newTags);
				}
			});

			// Handle Enter key to save and exit
			this.registerDomEvent(input, "keydown", (e) => {
				if (e.key === "Enter") {
					input.blur();
					e.preventDefault();
				}
				e.stopPropagation();
			});

			// Setup autocomplete on focus or first input
			this.registerDomEvent(input, "focus", setupAutoCompleteOnce);
			this.registerDomEvent(input, "input", setupAutoCompleteOnce);

			// Stop click propagation
			this.registerDomEvent(input, "click", (e) => {
				e.stopPropagation();
				// Use requestAnimationFrame instead of setTimeout for better performance
				requestAnimationFrame(() => input.focus());
			});
		} else {
			// Display tags as chips - optimized version
			if (tags && tags.length > 0) {
				// Use a single text content instead of multiple DOM elements for better performance
				tagsContainer.textContent = tags.join(", ");
				tagsContainer.addClass("task-table-tags-display");
			} else {
				tagsContainer.textContent = "\u00A0"; // Non-breaking space
				tagsContainer.addClass("empty-tags");
			}
		}
	}

	/**
	 * Render number cell with proper alignment
	 */
	private renderNumberCell(cellEl: HTMLElement, cell: TableCell) {
		cellEl.addClass("task-table-number");
		cellEl.textContent = cell.displayValue;
	}

	/**
	 * Render text cell with inline editing and auto-suggest
	 */
	private renderTextCell(
		cellEl: HTMLElement,
		cell: TableCell,
		row?: TableRow
	) {
		cellEl.addClass("task-table-text");

		// For content column (rowNumber), use cleaned content without tags and other marks
		const isContentColumn = cell.columnId === "content";
		const isProjectColumn = cell.columnId === "project";

		// Get effective project value for project column
		let displayText: string;
		let effectiveValue: string;
		let isReadonly = false;

		if (isProjectColumn && row?.task?.metadata?.tgProject) {
			effectiveValue = getEffectiveProject(row.task) || "";
			displayText = effectiveValue;
			isReadonly = isProjectReadonly(row.task);
		} else if (isContentColumn) {
			displayText = clearAllMarks(
				(cell.value as string) || cell.displayValue
			);
			effectiveValue = displayText;
		} else {
			displayText = cell.displayValue;
			effectiveValue = (cell.value as string) || "";
		}

		if (cell.editable && !isReadonly) {
			// Create editable input
			const input = cellEl.createEl("input", "task-table-text-input");
			input.type = "text";
			input.value = displayText;
			input.style.cssText =
				"border:none;background:transparent;width:100%;padding:0;font:inherit;";

			// Store initial value for comparison - should match what's shown in the input
			// For content column, use the cleaned text; for others, use the raw value
			const originalValue = isContentColumn
				? displayText // This is the cleaned text that user sees and edits
				: effectiveValue;

			// Setup autocomplete only when user starts typing or focuses
			let autoCompleteSetup = false;
			const setupAutoCompleteOnce = () => {
				if (!autoCompleteSetup && this.app) {
					autoCompleteSetup = true;
					if (cell.columnId === "project") {
						this.setupAutoComplete(input, "project");
					} else if (cell.columnId === "context") {
						this.setupAutoComplete(input, "context");
					}
				}
			};

			// Handle blur event to save changes
			this.registerDomEvent(input, "blur", () => {
				const newValue = input.value.trim();

				// Only save if value actually changed
				if (originalValue !== newValue) {
					this.saveCellValue(cellEl, cell, newValue);
				}
			});

			// Handle Enter key to save and exit
			this.registerDomEvent(input, "keydown", (e) => {
				if (e.key === "Enter") {
					input.blur();
					e.preventDefault();
				}
				// Stop propagation to prevent triggering table events
				e.stopPropagation();
			});

			// Setup autocomplete on focus or first input for project/context columns
			if (cell.columnId === "project" || cell.columnId === "context") {
				this.registerDomEvent(input, "focus", setupAutoCompleteOnce);
				this.registerDomEvent(input, "input", setupAutoCompleteOnce);
			}

			// Stop click propagation to prevent row selection
			this.registerDomEvent(input, "click", (e) => {
				e.stopPropagation();
				requestAnimationFrame(() => input.focus());
			});
		} else {
			cellEl.textContent = displayText;

			if (cell.columnId === "filePath") {
				this.registerDomEvent(cellEl, "click", (e) => {
					e.stopPropagation();
					const file = this.plugin.app.vault.getFileByPath(
						cell.value as string
					);
					if (file) {
						this.plugin.app.workspace.getLeaf(true).openFile(file);
					}
				});
				cellEl.title = t("Click to open file");
			}
		}

		// Add tgProject indicator for project column
		if (isProjectColumn && row?.task?.metadata?.tgProject) {
			const tgProject = row.task.metadata.tgProject;
			const indicator = cellEl.createDiv({
				cls: "project-source-indicator table-indicator",
			});

			// Create indicator icon based on tgProject type
			let indicatorIcon = "";
			let indicatorTitle = "";

			switch (tgProject.type) {
				case "path":
					indicatorIcon = "📁";
					indicatorTitle =
						t("Auto-assigned from path") + `: ${tgProject.source}`;
					break;
				case "metadata":
					indicatorIcon = "📄";
					indicatorTitle =
						t("Auto-assigned from file metadata") +
						`: ${tgProject.source}`;
					break;
				case "config":
					indicatorIcon = "⚙️";
					indicatorTitle =
						t("Auto-assigned from config file") +
						`: ${tgProject.source}`;
					break;
				default:
					indicatorIcon = "🔗";
					indicatorTitle =
						t("Auto-assigned") + `: ${tgProject.source}`;
			}

			indicator.innerHTML = `<span class="indicator-icon">${indicatorIcon}</span>`;
			indicator.title = indicatorTitle;

			if (isReadonly) {
				indicator.addClass("readonly-indicator");
				cellEl.addClass("readonly-cell");
			} else {
				indicator.addClass("override-indicator");
			}
		}

		// Add tooltip for long text - only if necessary
		if (displayText.length > 50) {
			cellEl.title = displayText;
		}
	}

	/**
	 * Render empty state
	 */
	private renderEmptyState() {
		const emptyRow = this.bodyEl.createEl("tr", "task-table-empty-row");
		const emptyCell = emptyRow.createEl("td", "task-table-empty-cell");
		emptyCell.colSpan = this.columns.length;
		emptyCell.textContent = t("No tasks found");
	}

	/**
	 * Update row selection visual state
	 */
	public updateSelection(selectedRows: Set<string>) {
		const rows = this.bodyEl.querySelectorAll("tr[data-row-id]");
		rows.forEach((row) => {
			const rowId = (row as HTMLElement).dataset.rowId;
			if (rowId) {
				row.toggleClass("selected", selectedRows.has(rowId));
			}
		});
	}

	/**
	 * Update sort indicators in header
	 */
	public updateSortIndicators(sortField: string, sortOrder: "asc" | "desc") {
		// Clear all sort indicators
		const sortIcons = this.headerEl.querySelectorAll(
			".task-table-sort-icon"
		);
		sortIcons.forEach((icon) => {
			icon.empty();
			setIcon(icon as HTMLElement, "chevrons-up-down");
			icon.removeClass("asc", "desc");
		});

		// Set active sort indicator
		const activeHeader = this.headerEl.querySelector(
			`th[data-column-id="${sortField}"]`
		);
		if (activeHeader) {
			const sortIcon = activeHeader.querySelector(
				".task-table-sort-icon"
			);
			if (sortIcon) {
				sortIcon.empty();
				setIcon(
					sortIcon as HTMLElement,
					sortOrder === "asc" ? "chevron-up" : "chevron-down"
				);
				sortIcon.addClass(sortOrder);
			}
		}
	}

	/**
	 * Setup column resize handlers
	 */
	private setupResizeHandlers() {
		this.registerDomEvent(
			document,
			"mousemove",
			this.handleMouseMove.bind(this)
		);
		this.registerDomEvent(
			document,
			"mouseup",
			this.handleMouseUp.bind(this)
		);
	}

	/**
	 * Handle mouse move during resize - prevent triggering sort when resizing
	 */
	private handleMouseMove(event: MouseEvent) {
		if (!this.isResizing) return;

		const deltaX = event.clientX - this.resizeStartX;
		const newWidth = Math.max(50, this.resizeStartWidth + deltaX);

		// Update column width
		this.updateColumnWidth(this.resizeColumn, newWidth);
	}

	/**
	 * Start column resize
	 */
	private startResize(
		event: MouseEvent,
		columnId: string,
		currentWidth: number
	) {
		event.preventDefault();
		event.stopPropagation(); // Prevent triggering sort
		this.isResizing = true;
		this.resizeColumn = columnId;
		this.resizeStartX = event.clientX;
		this.resizeStartWidth = currentWidth;

		document.body.style.cursor = "col-resize";
		this.tableEl.addClass("resizing");
	}

	/**
	 * Handle mouse up to end resize
	 */
	private handleMouseUp() {
		if (!this.isResizing) return;

		this.isResizing = false;
		this.resizeColumn = "";
		document.body.style.cursor = "";
		this.tableEl.removeClass("resizing");
	}

	/**
	 * Update column width
	 */
	private updateColumnWidth(columnId: string, newWidth: number) {
		// Update header
		const headerCell = this.headerEl.querySelector(
			`th[data-column-id="${columnId}"]`
		) as HTMLElement;
		if (headerCell) {
			headerCell.style.width = `${newWidth}px`;
			headerCell.style.minWidth = `${Math.min(newWidth, 50)}px`;
		}

		// Update body cells
		const bodyCells = this.bodyEl.querySelectorAll(
			`td[data-column-id="${columnId}"]`
		);
		bodyCells.forEach((cell) => {
			const cellEl = cell as HTMLElement;
			cellEl.style.width = `${newWidth}px`;
			cellEl.style.minWidth = `${Math.min(newWidth, 50)}px`;
		});

		// Update column definition
		const column = this.columns.find((c) => c.id === columnId);
		if (column) {
			column.width = newWidth;
		}
	}

	/**
	 * Toggle row expansion (for tree view)
	 */
	private toggleRowExpansion(rowId: string) {
		// This will be handled by the parent component
		// Emit event or call callback
		if (this.onRowExpand) {
			this.onRowExpand(rowId);
		} else {
			// Fallback: dispatch event
			const event = new CustomEvent("rowToggle", {
				detail: { rowId },
			});
			this.tableEl.dispatchEvent(event);
		}
	}

	/**
	 * Update columns configuration and re-render header
	 */
	public updateColumns(newColumns: TableColumn[]) {
		this.columns = newColumns;
		this.renderHeader();
	}

	/**
	 * Force clear all cached rows and DOM elements - useful for complete refresh
	 */
	public forceClearCache() {
		// Clear all active rows
		this.activeRows.clear();

		// Clear row pool
		this.rowPool = [];

		// Clear all event cleanup maps
		this.eventCleanupMap.clear();

		// Clear active suggests
		this.activeSuggests.forEach((suggest) => {
			suggest.close();
		});
		this.activeSuggests.clear();

		// Clear the table body completely
		this.bodyEl.empty();
	}

	/**
	 * Get all available values for auto-completion from existing tasks
	 */
	private async getAllValues(columnType: string): Promise<string[]> {
		if (!this.plugin) return [];

		// Get all tasks from the plugin
		const allTasks = this.plugin.taskManager?.getAllTasks() || [];
		const values = new Set<string>();

		allTasks.forEach((task) => {
			switch (columnType) {
				case "tags":
					task.metadata.tags?.forEach((tag) => {
						if (tag && tag.trim()) {
							// Remove # prefix if present
							const cleanTag = tag.startsWith("#")
								? tag.substring(1)
								: tag;
							values.add(cleanTag);
						}
					});
					break;
				case "project":
					if (task.metadata.project && task.metadata.project.trim()) {
						values.add(task.metadata.project);
					}
					break;
				case "context":
					if (task.metadata.context && task.metadata.context.trim()) {
						values.add(task.metadata.context);
					}
					break;
			}
		});

		return Array.from(values).sort();
	}

	/**
	 * Helper method to compare two arrays for equality
	 */
	private arraysEqual(arr1: string[], arr2: string[]): boolean {
		if (arr1.length !== arr2.length) {
			return false;
		}

		// Sort both arrays for comparison to ignore order differences
		const sorted1 = [...arr1].sort();
		const sorted2 = [...arr2].sort();

		return sorted1.every((value, index) => value === sorted2[index]);
	}

	/**
	 * Save cell value helper - now with improved change detection
	 */
	private saveCellValue(cellEl: HTMLElement, cell: TableCell, newValue: any) {
		const rowId = cellEl.dataset.rowId;
		if (rowId && this.onCellChange) {
			// The caller should have already verified the value has changed
			// This method now assumes a change is needed
			this.onCellChange(rowId, cell.columnId, newValue);
		}
	}

	/**
	 * Clear empty state element if it exists
	 */
	private clearEmptyState() {
		const emptyRow = this.bodyEl.querySelector(".task-table-empty-row");
		if (emptyRow) {
			emptyRow.remove();
		}
	}

	/**
	 * Ensure tree state consistency - check and update expansion button states
	 */
	private ensureTreeStateConsistency(
		rowEl: HTMLTableRowElement,
		row: TableRow
	) {
		// Find the expansion button in the row
		const expandBtn = rowEl.querySelector(
			".task-table-expand-btn"
		) as HTMLElement;

		if (expandBtn && row.hasChildren) {
			// Simple check: just update the icon to ensure it's correct
			// This is safer than trying to detect the current state
			const expectedIcon = row.expanded
				? "chevron-down"
				: "chevron-right";

			// Always update the icon to ensure consistency
			expandBtn.empty();
			setIcon(expandBtn, expectedIcon);

			// Update tooltip text
			expandBtn.title = row.expanded
				? row.level > 0
					? t("Collapse")
					: t("Collapse subtasks")
				: row.level > 0
				? t("Expand")
				: t("Expand subtasks");
		}
	}
}
