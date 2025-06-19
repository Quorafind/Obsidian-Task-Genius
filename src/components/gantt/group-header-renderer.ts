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

		const { totalWidth, collapsibleGroups, onGroupToggle } = this.params;

		// Create group header container
		const headerGroup = this.svgGroupEl.createSvg("g", {
			attr: {
				"data-group-id": group.id,
				"data-level": group.level.toString(),
			},
		});

		// Add CSS classes separately to avoid space character issues
		headerGroup.classList.add("gantt-group-header-svg");
		headerGroup.classList.add(`gantt-group-level-${group.level}`);

		// Background rectangle with modern styling
		const headerBg = headerGroup.createSvg("rect", {
			cls: "gantt-group-header-bg",
			attr: {
				x: 0,
				y: group.y,
				width: totalWidth,
				height: group.headerHeight,
				rx: 4, // Modern rounded corners
				ry: 4,
			},
		});

		// Add click handler for collapsible groups
		if (collapsibleGroups) {
			headerBg.style.cursor = "pointer";
			headerBg.addEventListener("click", () => {
				onGroupToggle(group.id);
			});
		}

		// Add drag and drop support
		this.addDragDropSupport(headerBg, group);

		// Add hover effects
		this.addHoverEffects(headerBg);

		// Expand/collapse icon for collapsible groups
		if (collapsibleGroups) {
			const iconSize = 14; // Slightly larger icon
			const iconX = 12 + group.level * 20; // Better spacing
			const iconY = group.y + group.headerHeight / 2;

			const iconGroup = headerGroup.createSvg("g", {
				cls: "gantt-group-header-icon",
				attr: {
					transform: `translate(${iconX}, ${iconY})`,
				},
			});

			// Create modern expand/collapse icon using SVG path
			const iconPath = group.expanded
				? "M3 8l4 4 4-4" // Chevron down (expanded)
				: "M6 3l4 4-4 4"; // Chevron right (collapsed)

			const iconElement = iconGroup.createSvg("path", {
				attr: {
					d: iconPath,
					stroke: "currentColor",
					"stroke-width": "2",
					"stroke-linecap": "round",
					"stroke-linejoin": "round",
					fill: "none",
					transform: `translate(-6, -6)`,
				},
			});

			iconGroup.style.cursor = "pointer";
			iconGroup.addEventListener("click", (e) => {
				e.stopPropagation();
				onGroupToggle(group.id);
			});

			// Add icon hover effect
			iconGroup.addEventListener("mouseenter", () => {
				iconElement.style.transform = "translate(-6, -6) scale(1.1)";
			});

			iconGroup.addEventListener("mouseleave", () => {
				iconElement.style.transform = "translate(-6, -6) scale(1)";
			});
		}

		// Group label with modern typography
		const labelX = collapsibleGroups
			? 36 + group.level * 20
			: 16 + group.level * 20;
		const labelY = group.y + group.headerHeight / 2;

		const labelText = headerGroup.createSvg("text", {
			cls: "gantt-group-header-label",
			attr: {
				x: labelX,
				y: labelY,
				"dominant-baseline": "middle",
			},
		});
		labelText.textContent = group.label;

		// Task count with modern badge styling
		const taskCount = this.getGroupTaskCount(group);
		if (taskCount > 0) {
			const countX = labelX + this.getTextWidth(group.label) + 12;
			const countY = labelY;

			// Create background for count badge
			const countBg = headerGroup.createSvg("rect", {
				cls: "gantt-group-header-count-bg",
				attr: {
					x: countX - 2,
					y: countY - 8,
					width: this.getTextWidth(taskCount.toString()) + 8,
					height: 16,
					rx: 8,
					ry: 8,
					fill: "var(--gantt-bg-tertiary)",
					stroke: "var(--gantt-border-color)",
					"stroke-width": "0.5",
				},
			});

			const countText = headerGroup.createSvg("text", {
				cls: "gantt-group-header-count",
				attr: {
					x: countX + 2,
					y: countY,
					"dominant-baseline": "middle",
					"text-anchor": "middle",
				},
			});
			countText.textContent = taskCount.toString();
		}

		// Progress indicator (optional)
		const completedTasks = this.getCompletedTaskCount(group);
		if (taskCount > 0) {
			const progressWidth = 60;
			const progressHeight = 3;
			const progressX = totalWidth - progressWidth - 16;
			const progressY =
				group.y + group.headerHeight / 2 - progressHeight / 2;

			// Progress background
			headerGroup.createSvg("rect", {
				cls: "gantt-group-progress-bg",
				attr: {
					x: progressX,
					y: progressY,
					width: progressWidth,
					height: progressHeight,
					rx: progressHeight / 2,
					ry: progressHeight / 2,
					fill: "var(--gantt-bg-tertiary)",
					stroke: "var(--gantt-border-color)",
					"stroke-width": "0.5",
				},
			});

			// Progress bar
			const progressPercentage = completedTasks / taskCount;
			const progressBarWidth = progressWidth * progressPercentage;

			if (progressBarWidth > 0) {
				headerGroup.createSvg("rect", {
					cls: "gantt-group-progress-bar",
					attr: {
						x: progressX,
						y: progressY,
						width: progressBarWidth,
						height: progressHeight,
						rx: progressHeight / 2,
						ry: progressHeight / 2,
						fill: "var(--gantt-bar-completed)",
					},
				});
			}
		}

		// Group separator line at bottom with subtle styling
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
	 * Add hover effects to group headers
	 */
	private addHoverEffects(headerElement: SVGElement): void {
		headerElement.addEventListener("mouseenter", () => {
			headerElement.style.transition =
				"all 0.15s cubic-bezier(0.4, 0, 0.2, 1)";
			headerElement.style.filter = "brightness(1.02)";
		});

		headerElement.addEventListener("mouseleave", () => {
			headerElement.style.filter = "none";
		});
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
		headerElement: SVGElement,
		group: TaskGroup
	): void {
		// Allow drop on group headers
		headerElement.addEventListener("dragover", (e) => {
			e.preventDefault();
			e.dataTransfer!.dropEffect = "move";
			headerElement.classList.add("gantt-drop-target");
		});

		headerElement.addEventListener("dragleave", (e) => {
			// Only remove if we're actually leaving the element
			if (!headerElement.contains(e.relatedTarget as Node)) {
				headerElement.classList.remove("gantt-drop-target");
			}
		});

		headerElement.addEventListener("drop", (e) => {
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
