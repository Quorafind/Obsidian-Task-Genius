import { Component, App } from "obsidian";
import { Timescale } from "./gantt"; // Assuming types are exported or moved
import { DateHelper } from "../../utils/DateHelper"; // Assuming DateHelper exists

// Interface for parameters needed by the header component
interface TimelineHeaderParams {
	startDate: Date;
	endDate: Date;
	visibleStartDate: Date;
	visibleEndDate: Date; // Calculated visible end date
	totalWidth: number;
	timescale: Timescale;
	dayWidth: number;
	scrollLeft: number;
	headerHeight: number;
	dateHelper: DateHelper; // Pass helper functions
	shouldDrawMajorTick: (date: Date) => boolean;
	shouldDrawMinorTick: (date: Date) => boolean;
	formatMajorTick: (date: Date) => string;
	formatMinorTick: (date: Date) => string;
	formatDayTick: (date: Date) => string;
}

export class TimelineHeaderComponent extends Component {
	private app: App;
	private headerContainerEl: HTMLElement; // The div container for the header SVG
	private svgEl: SVGSVGElement | null = null;
	private params: TimelineHeaderParams | null = null;

	constructor(app: App, headerContainerEl: HTMLElement) {
		super();
		this.app = app;
		this.headerContainerEl = headerContainerEl;
		// Add class? Maybe managed by parent
	}

	onload() {
		console.log("TimelineHeaderComponent loaded.");
		// Initial render happens when updateParams is called
	}

	onunload() {
		console.log("TimelineHeaderComponent unloaded.");
		if (this.svgEl) {
			this.svgEl.remove();
			this.svgEl = null;
		}
		this.headerContainerEl.empty(); // Clear the container
	}

	updateParams(newParams: TimelineHeaderParams) {
		this.params = newParams;
		this.render();
	}

	private render() {
		if (!this.params) {
			console.warn(
				"TimelineHeaderComponent: Cannot render, params not set."
			);
			return;
		}

		const {
			startDate,
			endDate,
			totalWidth,
			timescale,
			scrollLeft,
			headerHeight,
			dateHelper,
			shouldDrawMajorTick,
			shouldDrawMinorTick,
			formatMajorTick,
			formatMinorTick,
			formatDayTick,
		} = this.params;

		// Clear previous header SVG
		this.headerContainerEl.empty();

		this.svgEl = this.headerContainerEl.createSvg("svg", {
			cls: "gantt-header-svg",
		});
		this.svgEl.setAttribute("width", "100%"); // Take full width of header container
		this.svgEl.setAttribute("height", `${headerHeight}`);

		const headerGroup = this.svgEl.createSvg("g", {
			cls: "gantt-header-content",
		});
		// Apply scroll offset to the header content
		headerGroup.setAttribute("transform", `translate(${-scrollLeft}, 0)`);

		// Background for the entire scrollable header width
		headerGroup.createSvg("rect", {
			attr: {
				x: 0,
				y: 0,
				width: totalWidth, // Background covers the total width
				height: headerHeight,
				class: "gantt-header-bg",
			},
		});

		// --- Render Ticks and Labels --- //
		// Logic adapted from GanttComponent.renderHeaderOnly

		// Determine the range to render based on visible area + buffer
		const renderBufferDays = 30; // Render 30 days before/after visible range
		let renderStartDate = dateHelper.addDays(
			this.params.visibleStartDate,
			-renderBufferDays
		);
		let renderEndDate = dateHelper.addDays(
			this.params.visibleEndDate,
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

		// --- TEMPORARY: Revert to iterating over full range for debugging ---
		// let currentDate = new Date(startDate.getTime()); // Comment this out

		const uniqueMonths: { [key: string]: { x: number; label: string } } =
			{};
		const uniqueWeeks: { [key: string]: { x: number; label: string } } = {};
		const uniqueDays: { [key: string]: { x: number; label: string } } = {};

		while (currentDate <= renderEndDate) {
			const x = dateHelper.dateToX(
				currentDate,
				startDate,
				this.params.dayWidth
			);
			const nextDate = dateHelper.addDays(currentDate, 1);
			const nextX = dateHelper.dateToX(
				nextDate,
				startDate,
				this.params.dayWidth
			);
			const width = nextX - x; // Width of this day/tick

			// Major Ticks (Months/Years depending on timescale)
			if (shouldDrawMajorTick(currentDate)) {
				headerGroup.createSvg("line", {
					attr: {
						x1: x,
						y1: 0,
						x2: x,
						y2: headerHeight,
						class: "gantt-header-tick-major",
					},
				});
				const label = formatMajorTick(currentDate);
				if (label && width > 10) {
					// Only add label if space allows
					const yearMonth = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
					if (!uniqueMonths[yearMonth]) {
						uniqueMonths[yearMonth] = { x: x + 5, label: label };
					}
				}
			}

			// Minor Ticks (Weeks/Days depending on timescale)
			if (shouldDrawMinorTick(currentDate)) {
				headerGroup.createSvg("line", {
					attr: {
						x1: x,
						y1: 0,
						x2: x,
						y2: headerHeight,
						class: "gantt-header-tick-minor",
					},
				});
				const label = formatMinorTick(currentDate);
				if (label && width > 2) {
					// Only add label if space allows
					if (timescale === "Day" || timescale === "Week") {
						const yearWeek = `${currentDate.getFullYear()}-W${dateHelper.getWeekNumber(
							currentDate
						)}`;
						if (!uniqueWeeks[yearWeek]) {
							uniqueWeeks[yearWeek] = { x: x + 5, label: label };
						}
					} else if (timescale === "Month") {
						// Show day number in month view if space
						const dayLabel = currentDate.getDate().toString();
						const yearMonthDay = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;
						if (!uniqueDays[yearMonthDay]) {
							uniqueDays[yearMonthDay] = {
								x: x + width / 2,
								label: dayLabel,
							};
						}
					}
				}
			}

			// Day Ticks (only in Day view if space permits)
			if (timescale === "Day") {
				headerGroup.createSvg("line", {
					attr: {
						x1: x,
						y1: headerHeight * 0.7,
						x2: x,
						y2: headerHeight,
						class: "gantt-header-tick-day",
					},
				});
				const label = formatDayTick(currentDate);
				if (label && width > 2) {
					const yearMonthDay = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`;
					if (!uniqueDays[yearMonthDay]) {
						uniqueDays[yearMonthDay] = {
							x: x + width / 2,
							label: label,
						};
					}
				}
			}

			// Stop iterating if we've passed the render end date
			if (currentDate > renderEndDate) {
				break;
			}

			currentDate = nextDate;
		}

		// Render collected labels to avoid overlaps
		Object.values(uniqueMonths).forEach((item) => {
			headerGroup.createSvg("text", {
				attr: {
					x: item.x,
					y: headerHeight * 0.35,
					class: "gantt-header-label-major",
				},
			}).textContent = item.label;
		});
		Object.values(uniqueWeeks).forEach((item) => {
			headerGroup.createSvg("text", {
				attr: {
					x: item.x,
					y: headerHeight * 0.65,
					class: "gantt-header-label-minor",
				},
			}).textContent = item.label;
		});
		Object.values(uniqueDays).forEach((item) => {
			headerGroup.createSvg("text", {
				attr: {
					x: item.x,
					y: headerHeight * 0.85,
					class: "gantt-header-label-day",
					"text-anchor": "middle",
				},
			}).textContent = item.label;
		});

		// --- Today Marker ---
		const today = dateHelper.startOfDay(new Date());
		if (today >= startDate && today <= endDate) {
			const todayX = dateHelper.dateToX(
				today,
				startDate,
				this.params.dayWidth
			);

			headerGroup.createSvg("line", {
				attr: {
					x1: todayX,
					y1: 0,
					x2: todayX,
					y2: headerHeight,
					class: "gantt-header-today-marker",
				},
			});
		}
	}
}
