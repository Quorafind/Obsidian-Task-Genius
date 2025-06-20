/**
 * Gantt Chart Group Header Renderer Component
 *
 * Renders group headers in the Gantt chart with expand/collapse functionality
 * and visual hierarchy indicators.
 */

import { App, Component, setIcon } from "obsidian";
import { TaskGroup } from "../../types/gantt-grouping";

export interface GroupHeaderRendererParams {
	app: App;
	svgGroupEl: SVGGElement;
	groups: TaskGroup[];
	totalWidth: number;
	onGroupToggle: (groupId: string) => void;
	showGroupHeaders: boolean;
	collapsibleGroups: boolean;
	getGroupVisibility?: (groupId: string) => boolean;
}

export class GroupHeaderRenderer extends Component {
	private app: App;
	private svgGroupEl: SVGGElement;
	private params: GroupHeaderRendererParams | null = null;

	constructor(app: App, svgGroupEl: SVGGElement) {
		super();
		this.app = app;
		this.svgGroupEl = svgGroupEl;
	}

	/**
	 * Update parameters and re-render
	 */
	updateParams(params: GroupHeaderRendererParams): void {
		this.params = params;
		this.render();
	}

	/**
	 * Render all group headers
	 */
	private render(): void {
		if (!this.params) return;

		// Clear existing group headers
		this.svgGroupEl.empty();

		if (!this.params.showGroupHeaders) return;

		this.renderGroupHeaders(this.params.groups);
	}

	/**
	 * Recursively render group headers
	 */
	private renderGroupHeaders(groups: TaskGroup[]): void {
		if (!this.params) return;

		groups.forEach((group) => {
			this.renderSingleGroupHeader(group);

			// Render subgroup headers if expanded
			if (group.expanded && group.subGroups) {
				this.renderGroupHeaders(group.subGroups);
			}
		});
	}

	/**
	 * Render a single group header
	 */
	private renderSingleGroupHeader(group: TaskGroup): void {
		if (!this.params) return;

		// Check if group is visible (for filtering)
		const isGroupVisible =
			this.params.getGroupVisibility?.(group.id) ?? true;
		if (!isGroupVisible) {
			return; // Skip rendering if group is not visible
		}

		const { totalWidth, collapsibleGroups, onGroupToggle } = this.params;

		// Create group header container
		const headerGroup = this.svgGroupEl.createSvg("g", {
			attr: {
				"data-group-id": group.id,
				"data-level": group.level.toString(),
				"data-collapsed": (!group.expanded).toString(),
			},
		});

		// Add CSS classes separately to avoid space character issues
		headerGroup.classList.add("gantt-group-header-svg");
		headerGroup.classList.add(`gantt-group-level-${group.level}`);

		console.log(group);

		// Create foreignObject to contain the entire header as HTML
		const foreignObject = headerGroup.createSvg("foreignObject", {
			attr: {
				x: 0,
				y: group.y + 8,
				width: totalWidth,
				height: group.headerHeight,
			},
		});

		// Create HTML header container
		const headerContainer = foreignObject.createDiv({
			cls: "gantt-group-header-html",
		});

		// Add data attributes for styling
		headerContainer.setAttribute("data-level", group.level.toString());
		headerContainer.setAttribute(
			"data-collapsed",
			(!group.expanded).toString()
		);

		// Add click handler for collapsible groups
		if (collapsibleGroups) {
			headerContainer.style.cursor = "pointer";
			this.registerDomEvent(headerContainer, "click", () => {
				onGroupToggle(group.id);
			});
		}

		// Add drag and drop support
		this.addDragDropSupport(headerContainer, group);

		// Create left section with icon and label
		const leftSection = headerContainer.createDiv({
			cls: "gantt-group-header-left",
		});

		// Expand/collapse icon for collapsible groups
		if (collapsibleGroups) {
			const iconContainer = leftSection.createDiv({
				cls: "gantt-group-header-icon-container",
			});

			const iconElement = iconContainer.createDiv({
				cls: `gantt-group-header-icon ${
					group.expanded ? "expanded" : "collapsed"
				}`,
			});

			// Add icon content (chevron)
			iconElement.innerHTML = group.expanded
				? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
				: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

			this.registerDomEvent(iconContainer, "click", (e) => {
				e.stopPropagation();
				onGroupToggle(group.id);
			});
		}

		// Group label
		const labelContainer = leftSection.createDiv({
			cls: "gantt-group-header-label-container",
		});

		const labelElement = labelContainer.createDiv({
			cls: "gantt-group-header-label",
			text: group.label,
		});

		// Create center section with badges
		const centerSection = headerContainer.createDiv({
			cls: "gantt-group-header-center",
		});

		// Task count badge
		const taskCount = this.getGroupTaskCount(group);
		if (taskCount > 0) {
			const countBadge = centerSection.createDiv({
				cls: "gantt-group-header-count-badge",
				text: taskCount.toString(),
			});

			// Add collapsed indicator if group is collapsed and has subgroups
			if (
				!group.expanded &&
				group.subGroups &&
				group.subGroups.length > 0
			) {
				const collapsedIndicator = centerSection.createDiv({
					cls: "gantt-group-header-collapsed-indicator",
					text: `(${group.subGroups.length} groups hidden)`,
				});
			}
		}

		// Create right section with progress
		const rightSection = headerContainer.createDiv({
			cls: "gantt-group-header-right",
		});

		// Progress indicator
		const completedTasks = this.getCompletedTaskCount(group);
		if (taskCount > 0) {
			const progressContainer = rightSection.createDiv({
				cls: "gantt-group-header-progress-container",
			});

			const progressBar = progressContainer.createDiv({
				cls: "gantt-group-header-progress-bar",
			});

			const progressPercentage = completedTasks / taskCount;
			const progressFill = progressBar.createDiv({
				cls: "gantt-group-header-progress-fill",
			});

			progressFill.style.width = `${progressPercentage * 100}%`;

			// Progress text
			const progressText = progressContainer.createDiv({
				cls: "gantt-group-header-progress-text",
				text: `${completedTasks}/${taskCount}`,
			});
		}

		// Group separator line at bottom (keep as SVG for precise positioning)
		headerGroup.createSvg("line", {
			cls: "gantt-group-separator",
			attr: {
				x1: 0,
				y1: group.y + group.headerHeight,
				x2: totalWidth,
				y2: group.y + group.headerHeight,
			},
		});
	}

	/**
	 * Get background color for group header based on level
	 */
	private getGroupHeaderColor(level: number): string {
		const colors = [
			"var(--gantt-bg-secondary)",
			"var(--gantt-bg-tertiary)",
			"var(--gantt-bg-primary)",
		];
		return colors[level % colors.length];
	}

	/**
	 * Get total task count for a group (including subgroups)
	 */
	private getGroupTaskCount(group: TaskGroup): number {
		let count = group.tasks.length;

		if (group.subGroups) {
			count += group.subGroups.reduce(
				(sum, subGroup) => sum + this.getGroupTaskCount(subGroup),
				0
			);
		}

		return count;
	}

	/**
	 * Get completed task count for a group (including subgroups)
	 */
	private getCompletedTaskCount(group: TaskGroup): number {
		let count = group.tasks.filter(
			(task) => task.status === "done" || task.status === "completed"
		).length;

		if (group.subGroups) {
			count += group.subGroups.reduce(
				(sum, subGroup) => sum + this.getCompletedTaskCount(subGroup),
				0
			);
		}

		return count;
	}

	/**
	 * Estimate text width (improved calculation)
	 */
	private getTextWidth(text: string): number {
		// More accurate estimation based on font size
		const avgCharWidth = 7; // pixels per character for 13px font
		return text.length * avgCharWidth;
	}

	/**
	 * Get group at specific Y coordinate
	 */
	getGroupAtY(
		y: number,
		groups: TaskGroup[] = this.params?.groups || []
	): TaskGroup | null {
		for (const group of groups) {
			if (y >= group.y && y < group.y + group.headerHeight) {
				return group;
			}

			if (group.subGroups && group.expanded) {
				const subGroup = this.getGroupAtY(y, group.subGroups);
				if (subGroup) return subGroup;
			}
		}
		return null;
	}

	/**
	 * Check if a Y coordinate is within a group header
	 */
	isInGroupHeader(y: number): boolean {
		return this.getGroupAtY(y) !== null;
	}

	/**
	 * Add drag and drop support to group header
	 */
	private addDragDropSupport(
		headerElement: HTMLElement | SVGElement,
		group: TaskGroup
	): void {
		// Allow drop on group headers
		this.registerDomEvent(headerElement as HTMLElement, "dragover", (e: DragEvent) => {
			e.preventDefault();
			e.dataTransfer!.dropEffect = "move";
			headerElement.classList.add("gantt-drop-target");
		});

		this.registerDomEvent(headerElement as HTMLElement, "dragleave", (e: DragEvent) => {
			// Only remove if we're actually leaving the element
			if (!headerElement.contains(e.relatedTarget as Node)) {
				headerElement.classList.remove("gantt-drop-target");
			}
		});

		this.registerDomEvent(headerElement as HTMLElement, "drop", (e: DragEvent) => {
			e.preventDefault();
			headerElement.classList.remove("gantt-drop-target");

			// Get dragged task data
			const taskData = e.dataTransfer!.getData("application/json");
			if (taskData) {
				try {
					const dragData = JSON.parse(taskData);
					// Emit custom event for parent to handle
					const dropEvent = new CustomEvent("gantt-task-dropped", {
						detail: {
							task: dragData.task,
							fromGroupId: dragData.fromGroupId,
							toGroupId: group.id,
						},
					});
					headerElement.dispatchEvent(dropEvent);
				} catch (error) {
					console.error("Error parsing drag data:", error);
				}
			}
		});
	}
}
