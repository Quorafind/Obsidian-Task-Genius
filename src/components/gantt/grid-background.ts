import { Component, App } from "obsidian";
import { GanttTaskItem, Timescale, PlacedGanttTaskItem } from "./gantt"; // Correctly imports PlacedGanttTaskItem now
import { DateHelper } from "../../utils/date/date-helper"; // Corrected import path again

// Interface for parameters needed by the grid component
interface GridBackgroundParams {
	startDate: Date;
	endDate: Date;
	visibleStartDate: Date; // Need visible range for optimization
	visibleEndDate: Date; // Need visible range for optimization
	totalWidth: number;
	totalHeight: number;
	visibleTasks: PlacedGanttTaskItem[]; // Use filtered tasks
	timescale: Timescale;
	dayWidth: number;
	rowHeight: number;
	dateHelper: DateHelper; // Pass helper functions
	shouldDrawMajorTick: (date: Date) => boolean;
	shouldDrawMinorTick: (date: Date) => boolean;
}

export class GridBackgroundComponent extends Component {
	private app: App;
	private svgGroupEl: SVGGElement; // The <g> element to draw into
	private params: GridBackgroundParams | null = null;

	// Use DateHelper for date calculations
	private dateHelper = new DateHelper();

	constructor(app: App, svgGroupEl: SVGGElement) {
		super();
		this.app = app;
		this.svgGroupEl = svgGroupEl;
	}

	onload() {
		console.log("GridBackgroundComponent loaded.");
		// Initial render happens when updateParams is called
	}

	onunload() {
		console.log("GridBackgroundComponent unloaded.");
		this.svgGroupEl.empty(); // Clear the grid group
	}

	updateParams(newParams: GridBackgroundParams) {
		this.params = newParams;
		this.render();
	}

	private render() {
		if (!this.params) {
			console.warn(
				"GridBackgroundComponent: Cannot render, params not set."
			);
			return;
		}

		this.svgGroupEl.empty(); // Clear previous grid

		const {
			startDate, // Overall start for coordinate calculations
			endDate, // Overall end for today marker check
			visibleStartDate, // Use these for rendering loops
			visibleEndDate,
			totalWidth, // Still needed for horizontal line width
			totalHeight,
			visibleTasks, // Use filtered tasks
			timescale,
			rowHeight,
			dateHelper, // Use passed dateHelper
			shouldDrawMajorTick,
			shouldDrawMinorTick,
		} = this.params;

		// --- Vertical Lines (Optimized) ---
		// Determine the date range to render vertical lines for
		const renderBufferDays = 30; // Match header buffer or adjust as needed
		let renderStartDate = dateHelper.addDays(
			visibleStartDate,
			-renderBufferDays
		);
		let renderEndDate = dateHelper.addDays(
			visibleEndDate,
			renderBufferDays
		);

		// Clamp render range to the overall gantt chart bounds
		renderStartDate = new Date(
			Math.max(renderStartDate.getTime(), startDate.getTime())
		);
		renderEndDate = new Date(
			Math.min(renderEndDate.getTime(), endDate.getTime())
		);

		// Start iteration from the beginning of the renderStartDate's day
		let currentDate = dateHelper.startOfDay(renderStartDate);

		while (currentDate <= renderEndDate) {
			// Iterate only over render range
			const x = dateHelper.dateToX(
				currentDate,
				startDate, // Base calculation still uses overall startDate
				this.params.dayWidth
			);
			if (shouldDrawMajorTick(currentDate)) {
				this.svgGroupEl.createSvg("line", {
					attr: {
						x1: x,
						y1: 0,
						x2: x,
						y2: totalHeight,
						class: "gantt-grid-line-major",
					},
				});
			} else if (
				shouldDrawMinorTick(currentDate) ||
				timescale === "Day"
			) {
				// Draw day lines in Day view
				this.svgGroupEl.createSvg("line", {
					attr: {
						x1: x,
						y1: 0,
						x2: x,
						y2: totalHeight,
						class: "gantt-grid-line-minor",
					},
				});
			}

			// Stop iterating if we've passed the render end date
			if (currentDate > renderEndDate) {
				break;
			}

			currentDate = dateHelper.addDays(currentDate, 1);
		}

		// --- Horizontal Lines (Simplified) ---
		// Draw a line every rowHeight up to totalHeight
		for (let y = rowHeight; y <= totalHeight; y += rowHeight) {
			this.svgGroupEl.createSvg("line", {
				attr: {
					x1: 0,
					y1: y,
					x2: totalWidth,
					y2: y,
					class: "gantt-grid-line-horizontal",
				},
			});
		}

		// --- Today Marker Line in Grid (No change needed, already checks bounds) ---
		const today = dateHelper.startOfDay(new Date());
		if (today >= startDate && today <= endDate) {
			const todayX = dateHelper.dateToX(
				today,
				startDate,
				this.params.dayWidth
			);
			this.svgGroupEl.createSvg("line", {
				attr: {
					x1: todayX,
					y1: 0,
					x2: todayX,
					y2: totalHeight,
					class: "gantt-grid-today-marker",
				},
			});
		}
	}
}
