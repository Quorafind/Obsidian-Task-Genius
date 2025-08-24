import { TimeComponent } from "../types/time-parsing";
import { Task, EnhancedStandardTaskMetadata } from "../types/task";

// Date type priority for deduplication (higher number = higher priority)
const DATE_TYPE_PRIORITY = {
	due: 4,
	scheduled: 3,
	start: 2,
	completed: 1,
} as const;

// Mock the TimelineSidebarView class for testing
class MockTimelineSidebarView {
	/**
	 * Create time information from task metadata and enhanced time components
	 */
	createTimeInfoFromTask(
		task: Task,
		date: Date,
		type: string
	): {
		primaryTime: Date;
		endTime?: Date;
		isRange: boolean;
		timeComponent?: TimeComponent;
		displayFormat: "time-only" | "date-time" | "range";
	} {
		// Check if task has enhanced metadata with time components
		const enhancedMetadata = task.metadata as any;
		const timeComponents = enhancedMetadata?.timeComponents;
		const enhancedDates = enhancedMetadata?.enhancedDates;

		if (!timeComponents) {
			// No time components available, use default time display
			return {
				primaryTime: date,
				isRange: false,
				displayFormat: "date-time",
			};
		}

		// Determine which time component to use based on the date type
		let relevantTimeComponent: TimeComponent | undefined;
		let relevantEndTime: Date | undefined;

		switch (type) {
			case "start":
				relevantTimeComponent = timeComponents.startTime;
				if (timeComponents.endTime && enhancedDates?.endDateTime) {
					relevantEndTime = enhancedDates.endDateTime;
				}
				break;
			case "due":
				relevantTimeComponent = timeComponents.dueTime;
				break;
			case "scheduled":
				relevantTimeComponent = timeComponents.scheduledTime;
				break;
			default:
				relevantTimeComponent = undefined;
		}

		if (!relevantTimeComponent) {
			// No specific time component for this date type
			return {
				primaryTime: date,
				isRange: false,
				displayFormat: "date-time",
			};
		}

		// Create enhanced datetime by combining date and time component
		const enhancedDateTime = new Date(date);
		enhancedDateTime.setUTCHours(
			relevantTimeComponent.hour,
			relevantTimeComponent.minute,
			relevantTimeComponent.second || 0,
			0
		);

		// Determine if this is a time range
		const isRange = relevantTimeComponent.isRange && !!relevantEndTime;

		return {
			primaryTime: enhancedDateTime,
			endTime: relevantEndTime,
			isRange,
			timeComponent: relevantTimeComponent,
			displayFormat: isRange ? "range" : "time-only",
		};
	}

	/**
	 * Format a time component for display
	 */
	formatTimeComponent(timeComponent: TimeComponent): string {
		const hour = timeComponent.hour.toString().padStart(2, '0');
		const minute = timeComponent.minute.toString().padStart(2, '0');
		
		if (timeComponent.second !== undefined) {
			const second = timeComponent.second.toString().padStart(2, '0');
			return `${hour}:${minute}:${second}`;
		}
		
		return `${hour}:${minute}`;
	}

	/**
	 * Extract dates from task with enhanced datetime support
	 */
	extractDatesFromTask(task: Task): Array<{ date: Date; type: string }> {
		// Task-level deduplication: ensure each task appears only once in timeline
		
		// Check if task has enhanced metadata with time components
		const enhancedMetadata = task.metadata as any;
		const timeComponents = enhancedMetadata?.timeComponents;
		const enhancedDates = enhancedMetadata?.enhancedDates;
		
		// For completed tasks: prioritize due date, fallback to completed date
		if (task.completed) {
			if (task.metadata.dueDate) {
				// Use enhanced due datetime if available, otherwise use original timestamp
				const dueDate = enhancedDates?.dueDateTime || new Date(task.metadata.dueDate);
				return [{ date: dueDate, type: "due" }];
			} else if (task.metadata.completedDate) {
				return [{ date: new Date(task.metadata.completedDate), type: "completed" }];
			}
		}
		
		// For non-completed tasks: select single highest priority date with enhanced datetime support
		const dates: Array<{ date: Date; type: string }> = [];

		if (task.metadata.dueDate) {
			// Use enhanced due datetime if available
			const dueDate = enhancedDates?.dueDateTime || new Date(task.metadata.dueDate);
			dates.push({ date: dueDate, type: "due" });
		}
		if (task.metadata.scheduledDate) {
			// Use enhanced scheduled datetime if available
			const scheduledDate = enhancedDates?.scheduledDateTime || new Date(task.metadata.scheduledDate);
			dates.push({
				date: scheduledDate,
				type: "scheduled",
			});
		}
		if (task.metadata.startDate) {
			// Use enhanced start datetime if available
			const startDate = enhancedDates?.startDateTime || new Date(task.metadata.startDate);
			dates.push({
				date: startDate,
				type: "start",
			});
		}
		
		// For non-completed tasks, select the highest priority date
		if (dates.length > 0) {
			const highestPriorityDate = dates.reduce((highest, current) => {
				const currentPriority = DATE_TYPE_PRIORITY[current.type as keyof typeof DATE_TYPE_PRIORITY] || 0;
				const highestPriority = DATE_TYPE_PRIORITY[highest.type as keyof typeof DATE_TYPE_PRIORITY] || 0;
				return currentPriority > highestPriority ? current : highest;
			});
			return [highestPriorityDate];
		}
		
		// Fallback: if no planning dates exist, return empty array for simplicity in tests
		const allDates: Array<{ date: Date; type: string }> = [];
		if (task.metadata.completedDate) {
			allDates.push({
				date: new Date(task.metadata.completedDate),
				type: "completed",
			});
		}
		
		return allDates;
	}

	/**
	 * Sort events by time within a day for chronological ordering
	 */
	sortEventsByTime(events: any[]): any[] {
		return events.sort((a, b) => {
			// Get the primary time for sorting - use enhanced time if available
			const timeA = a.timeInfo?.primaryTime || a.time;
			const timeB = b.timeInfo?.primaryTime || b.time;
			
			// Sort by time of day (earlier times first)
			const timeComparison = timeA.getTime() - timeB.getTime();
			
			if (timeComparison !== 0) {
				return timeComparison;
			}
			
			// If times are equal, sort by task content for consistent ordering
			return a.content.localeCompare(b.content);
		});
	}

	/**
	 * Render time information for a timeline event
	 */
	renderEventTime(timeEl: any, event: any): void {
		if (event.timeInfo?.timeComponent) {
			// Use parsed time component for accurate display
			const { timeComponent, isRange, endTime } = event.timeInfo;
			
			if (isRange && endTime) {
				// Display time range
				const startTimeStr = this.formatTimeComponent(timeComponent);
				const endTimeStr = (global as any).moment(endTime).format("HH:mm");
				timeEl.setText(`${startTimeStr}-${endTimeStr}`);
				timeEl.addClass("timeline-event-time-range");
			} else {
				// Display single time
				timeEl.setText(this.formatTimeComponent(timeComponent));
				timeEl.addClass("timeline-event-time-single");
			}
		} else {
			// Fallback to default time display
			timeEl.setText((global as any).moment(event.time).format("HH:mm"));
			timeEl.addClass("timeline-event-time-default");
		}
	}

	/**
	 * Check if an event has a specific time (not just a date)
	 */
	hasSpecificTime(event: any): boolean {
		// Check if the event has enhanced time information
		if (event.timeInfo?.timeComponent) {
			return true;
		}

		// Check if the original time has non-zero hours/minutes (not just midnight)
		const time = event.timeInfo?.primaryTime || event.time;
		return time.getUTCHours() !== 0 || time.getUTCMinutes() !== 0 || time.getUTCSeconds() !== 0;
	}

	/**
	 * Generate a time group key for grouping events
	 */
	getTimeGroupKey(time: Date, event: any): string {
		if (event.timeInfo?.timeComponent) {
			// Use the formatted time component for precise grouping
			return this.formatTimeComponent(event.timeInfo.timeComponent);
		}
		
		// Fallback to hour:minute format
		return (global as any).moment(time).format("HH:mm");
	}
}

describe("Timeline Event Enhancement", () => {
	let mockTimeline: MockTimelineSidebarView;

	beforeEach(() => {
		mockTimeline = new MockTimelineSidebarView();
	});

	describe("createTimeInfoFromTask", () => {
		it("should return default time info when no time components are available", () => {
			const task: Task = {
				id: "test-1",
				content: "Test task",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Test task",
				metadata: {
					tags: [],
					children: [],
				},
			};

			const date = new Date("2024-01-15T00:00:00Z");
			const result = mockTimeline.createTimeInfoFromTask(task, date, "due");

			expect(result).toEqual({
				primaryTime: date,
				isRange: false,
				displayFormat: "date-time",
			});
		});

		it("should create time info with single time component for due date", () => {
			const timeComponent: TimeComponent = {
				hour: 14,
				minute: 30,
				originalText: "2:30 PM",
				isRange: false,
			};

			const task: Task<EnhancedStandardTaskMetadata> = {
				id: "test-2",
				content: "Meeting at 2:30 PM",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Meeting at 2:30 PM",
				metadata: {
					tags: [],
					children: [],
					timeComponents: {
						dueTime: timeComponent,
					},
				},
			};

			const date = new Date("2024-01-15T00:00:00Z");
			const result = mockTimeline.createTimeInfoFromTask(task, date, "due");

			const expectedDateTime = new Date("2024-01-15T14:30:00Z");
			expect(result.primaryTime).toEqual(expectedDateTime);
			expect(result.isRange).toBe(false);
			expect(result.displayFormat).toBe("time-only");
			expect(result.timeComponent).toEqual(timeComponent);
		});

		it("should create time info with time range for start date", () => {
			const startTimeComponent: TimeComponent = {
				hour: 9,
				minute: 0,
				originalText: "9:00-17:00",
				isRange: true,
			};

			const endTimeComponent: TimeComponent = {
				hour: 17,
				minute: 0,
				originalText: "9:00-17:00",
				isRange: true,
			};

			const endDateTime = new Date("2024-01-15T17:00:00Z");

			const task: Task<EnhancedStandardTaskMetadata> = {
				id: "test-3",
				content: "Workshop 9:00-17:00",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Workshop 9:00-17:00",
				metadata: {
					tags: [],
					children: [],
					timeComponents: {
						startTime: startTimeComponent,
						endTime: endTimeComponent,
					},
					enhancedDates: {
						endDateTime: endDateTime,
					},
				},
			};

			const date = new Date("2024-01-15T00:00:00Z");
			const result = mockTimeline.createTimeInfoFromTask(task, date, "start");

			const expectedDateTime = new Date("2024-01-15T09:00:00Z");
			expect(result.primaryTime).toEqual(expectedDateTime);
			expect(result.endTime).toEqual(endDateTime);
			expect(result.isRange).toBe(true);
			expect(result.displayFormat).toBe("range");
			expect(result.timeComponent).toEqual(startTimeComponent);
		});

		it("should handle scheduled time component", () => {
			const timeComponent: TimeComponent = {
				hour: 10,
				minute: 15,
				second: 30,
				originalText: "10:15:30",
				isRange: false,
			};

			const task: Task<EnhancedStandardTaskMetadata> = {
				id: "test-4",
				content: "Call at 10:15:30",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Call at 10:15:30",
				metadata: {
					tags: [],
					children: [],
					timeComponents: {
						scheduledTime: timeComponent,
					},
				},
			};

			const date = new Date("2024-01-15T00:00:00Z");
			const result = mockTimeline.createTimeInfoFromTask(task, date, "scheduled");

			const expectedDateTime = new Date("2024-01-15T10:15:30Z");
			expect(result.primaryTime).toEqual(expectedDateTime);
			expect(result.isRange).toBe(false);
			expect(result.displayFormat).toBe("time-only");
			expect(result.timeComponent).toEqual(timeComponent);
		});

		it("should return default when no matching time component for date type", () => {
			const timeComponent: TimeComponent = {
				hour: 14,
				minute: 30,
				originalText: "2:30 PM",
				isRange: false,
			};

			const task: Task<EnhancedStandardTaskMetadata> = {
				id: "test-5",
				content: "Task with due time",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Task with due time",
				metadata: {
					tags: [],
					children: [],
					timeComponents: {
						dueTime: timeComponent,
					},
				},
			};

			const date = new Date("2024-01-15T00:00:00Z");
			// Request start time info but only due time is available
			const result = mockTimeline.createTimeInfoFromTask(task, date, "start");

			expect(result).toEqual({
				primaryTime: date,
				isRange: false,
				displayFormat: "date-time",
			});
		});
	});

	describe("extractDatesFromTask", () => {
		it("should use enhanced datetime for due date when available", () => {
			const enhancedDueDateTime = new Date("2024-01-15T14:30:00Z");
			
			const task: Task<EnhancedStandardTaskMetadata> = {
				id: "test-enhanced-1",
				content: "Meeting at 2:30 PM",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Meeting at 2:30 PM",
				metadata: {
					tags: [],
					children: [],
					dueDate: new Date("2024-01-15T00:00:00Z").getTime(),
					enhancedDates: {
						dueDateTime: enhancedDueDateTime,
					},
				},
			};

			const result = mockTimeline.extractDatesFromTask(task);
			
			expect(result).toHaveLength(1);
			expect(result[0].date).toEqual(enhancedDueDateTime);
			expect(result[0].type).toBe("due");
		});

		it("should use enhanced datetime for scheduled date when available", () => {
			const enhancedScheduledDateTime = new Date("2024-01-15T09:15:00Z");
			
			const task: Task<EnhancedStandardTaskMetadata> = {
				id: "test-enhanced-2",
				content: "Call at 9:15 AM",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Call at 9:15 AM",
				metadata: {
					tags: [],
					children: [],
					scheduledDate: new Date("2024-01-15T00:00:00Z").getTime(),
					enhancedDates: {
						scheduledDateTime: enhancedScheduledDateTime,
					},
				},
			};

			const result = mockTimeline.extractDatesFromTask(task);
			
			expect(result).toHaveLength(1);
			expect(result[0].date).toEqual(enhancedScheduledDateTime);
			expect(result[0].type).toBe("scheduled");
		});

		it("should use enhanced datetime for start date when available", () => {
			const enhancedStartDateTime = new Date("2024-01-15T08:00:00Z");
			
			const task: Task<EnhancedStandardTaskMetadata> = {
				id: "test-enhanced-3",
				content: "Workshop starts at 8:00 AM",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Workshop starts at 8:00 AM",
				metadata: {
					tags: [],
					children: [],
					startDate: new Date("2024-01-15T00:00:00Z").getTime(),
					enhancedDates: {
						startDateTime: enhancedStartDateTime,
					},
				},
			};

			const result = mockTimeline.extractDatesFromTask(task);
			
			expect(result).toHaveLength(1);
			expect(result[0].date).toEqual(enhancedStartDateTime);
			expect(result[0].type).toBe("start");
		});

		it("should fallback to original timestamp when enhanced datetime not available", () => {
			const originalDueDate = new Date("2024-01-15T00:00:00Z");
			
			const task: Task = {
				id: "test-fallback-1",
				content: "Task without enhanced datetime",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Task without enhanced datetime",
				metadata: {
					tags: [],
					children: [],
					dueDate: originalDueDate.getTime(),
				},
			};

			const result = mockTimeline.extractDatesFromTask(task);
			
			expect(result).toHaveLength(1);
			expect(result[0].date).toEqual(originalDueDate);
			expect(result[0].type).toBe("due");
		});

		it("should prioritize due date over scheduled date with enhanced datetimes", () => {
			const enhancedDueDateTime = new Date("2024-01-15T14:30:00Z");
			const enhancedScheduledDateTime = new Date("2024-01-15T09:15:00Z");
			
			const task: Task<EnhancedStandardTaskMetadata> = {
				id: "test-priority-1",
				content: "Task with both due and scheduled times",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: " ",
				originalMarkdown: "- [ ] Task with both due and scheduled times",
				metadata: {
					tags: [],
					children: [],
					dueDate: new Date("2024-01-15T00:00:00Z").getTime(),
					scheduledDate: new Date("2024-01-15T00:00:00Z").getTime(),
					enhancedDates: {
						dueDateTime: enhancedDueDateTime,
						scheduledDateTime: enhancedScheduledDateTime,
					},
				},
			};

			const result = mockTimeline.extractDatesFromTask(task);
			
			expect(result).toHaveLength(1);
			expect(result[0].date).toEqual(enhancedDueDateTime);
			expect(result[0].type).toBe("due");
		});

		it("should handle completed tasks with enhanced due datetime", () => {
			const enhancedDueDateTime = new Date("2024-01-15T14:30:00Z");
			
			const task: Task<EnhancedStandardTaskMetadata> = {
				id: "test-completed-1",
				content: "Completed meeting at 2:30 PM",
				filePath: "test.md",
				line: 1,
				completed: true,
				status: "x",
				originalMarkdown: "- [x] Completed meeting at 2:30 PM",
				metadata: {
					tags: [],
					children: [],
					dueDate: new Date("2024-01-15T00:00:00Z").getTime(),
					completedDate: new Date("2024-01-15T15:00:00Z").getTime(),
					enhancedDates: {
						dueDateTime: enhancedDueDateTime,
					},
				},
			};

			const result = mockTimeline.extractDatesFromTask(task);
			
			expect(result).toHaveLength(1);
			expect(result[0].date).toEqual(enhancedDueDateTime);
			expect(result[0].type).toBe("due");
		});
	});

	describe("sortEventsByTime", () => {
		it("should sort events by time chronologically", () => {
			const events: any[] = [
				{
					id: "event-3",
					content: "Lunch",
					time: new Date("2024-01-15T12:00:00Z"),
					timeInfo: {
						primaryTime: new Date("2024-01-15T12:00:00Z"),
					},
				},
				{
					id: "event-1",
					content: "Morning meeting",
					time: new Date("2024-01-15T09:00:00Z"),
					timeInfo: {
						primaryTime: new Date("2024-01-15T09:00:00Z"),
					},
				},
				{
					id: "event-2",
					content: "Coffee break",
					time: new Date("2024-01-15T10:30:00Z"),
					timeInfo: {
						primaryTime: new Date("2024-01-15T10:30:00Z"),
					},
				},
			];

			const sorted = mockTimeline.sortEventsByTime(events);

			expect(sorted[0].content).toBe("Morning meeting");
			expect(sorted[1].content).toBe("Coffee break");
			expect(sorted[2].content).toBe("Lunch");
		});

		it("should sort events with same time by content alphabetically", () => {
			const events: any[] = [
				{
					id: "event-2",
					content: "Zebra task",
					time: new Date("2024-01-15T09:00:00Z"),
					timeInfo: {
						primaryTime: new Date("2024-01-15T09:00:00Z"),
					},
				},
				{
					id: "event-1",
					content: "Alpha task",
					time: new Date("2024-01-15T09:00:00Z"),
					timeInfo: {
						primaryTime: new Date("2024-01-15T09:00:00Z"),
					},
				},
			];

			const sorted = mockTimeline.sortEventsByTime(events);

			expect(sorted[0].content).toBe("Alpha task");
			expect(sorted[1].content).toBe("Zebra task");
		});

		it("should handle events without timeInfo by using fallback time", () => {
			const events: any[] = [
				{
					id: "event-2",
					content: "Enhanced task",
					time: new Date("2024-01-15T10:00:00Z"),
					timeInfo: {
						primaryTime: new Date("2024-01-15T10:00:00Z"),
					},
				},
				{
					id: "event-1",
					content: "Legacy task",
					time: new Date("2024-01-15T09:00:00Z"),
					// No timeInfo
				},
			];

			const sorted = mockTimeline.sortEventsByTime(events);

			expect(sorted[0].content).toBe("Legacy task");
			expect(sorted[1].content).toBe("Enhanced task");
		});
	});

	describe("renderEventTime", () => {
		let mockTimeEl: HTMLElement;

		beforeEach(() => {
			// Create a mock DOM element
			mockTimeEl = {
				setText: jest.fn(),
				addClass: jest.fn(),
			} as any;
		});

		it("should render single time component with proper formatting", () => {
			const timeComponent: TimeComponent = {
				hour: 14,
				minute: 30,
				originalText: "2:30 PM",
				isRange: false,
			};

			const event: any = {
				timeInfo: {
					timeComponent,
					isRange: false,
				},
			};

			mockTimeline.renderEventTime(mockTimeEl, event);

			expect(mockTimeEl.setText).toHaveBeenCalledWith("14:30");
			expect(mockTimeEl.addClass).toHaveBeenCalledWith("timeline-event-time-single");
		});

		it("should render time range with start and end times", () => {
			const timeComponent: TimeComponent = {
				hour: 9,
				minute: 0,
				originalText: "9:00-17:00",
				isRange: true,
			};

			const endTime = new Date("2024-01-15T17:00:00Z");

			const event: any = {
				timeInfo: {
					timeComponent,
					isRange: true,
					endTime,
				},
			};

			// Mock moment for the end time formatting
			const mockMoment = {
				format: jest.fn().mockReturnValue("17:00"),
			};
			(global as any).moment = jest.fn().mockReturnValue(mockMoment);

			mockTimeline.renderEventTime(mockTimeEl, event);

			expect(mockTimeEl.setText).toHaveBeenCalledWith("09:00-17:00");
			expect(mockTimeEl.addClass).toHaveBeenCalledWith("timeline-event-time-range");
		});

		it("should render time component with seconds", () => {
			const timeComponent: TimeComponent = {
				hour: 10,
				minute: 15,
				second: 30,
				originalText: "10:15:30",
				isRange: false,
			};

			const event: any = {
				timeInfo: {
					timeComponent,
					isRange: false,
				},
			};

			mockTimeline.renderEventTime(mockTimeEl, event);

			expect(mockTimeEl.setText).toHaveBeenCalledWith("10:15:30");
			expect(mockTimeEl.addClass).toHaveBeenCalledWith("timeline-event-time-single");
		});

		it("should fallback to default time display when no time component", () => {
			const event: any = {
				time: new Date("2024-01-15T14:30:00Z"),
				// No timeInfo
			};

			// Mock moment for the fallback
			const mockMoment = {
				format: jest.fn().mockReturnValue("14:30"),
			};
			(global as any).moment = jest.fn().mockReturnValue(mockMoment);

			mockTimeline.renderEventTime(mockTimeEl, event);

			expect(mockTimeEl.setText).toHaveBeenCalledWith("14:30");
			expect(mockTimeEl.addClass).toHaveBeenCalledWith("timeline-event-time-default");
		});
	});

	describe("timeline grouping and sorting integration", () => {
		it("should separate timed events from date-only events", () => {
			const events: any[] = [
				{
					id: "timed-1",
					content: "Meeting at 2 PM",
					time: new Date("2024-01-15T14:00:00Z"),
					timeInfo: {
						primaryTime: new Date("2024-01-15T14:00:00Z"),
						timeComponent: { hour: 14, minute: 0, originalText: "2 PM", isRange: false },
					},
				},
				{
					id: "date-only-1",
					content: "All day task",
					time: new Date("2024-01-15T00:00:00Z"),
					// No timeInfo - indicates date-only
				},
				{
					id: "timed-2",
					content: "Call at 10 AM",
					time: new Date("2024-01-15T10:00:00Z"),
					timeInfo: {
						primaryTime: new Date("2024-01-15T10:00:00Z"),
						timeComponent: { hour: 10, minute: 0, originalText: "10 AM", isRange: false },
					},
				},
			];

			const timedEvents: any[] = [];
			const dateOnlyEvents: any[] = [];

			events.forEach((event) => {
				if (mockTimeline.hasSpecificTime(event)) {
					timedEvents.push(event);
				} else {
					dateOnlyEvents.push(event);
				}
			});

			expect(timedEvents).toHaveLength(2);
			expect(timedEvents[0].id).toBe("timed-1");
			expect(timedEvents[1].id).toBe("timed-2");

			expect(dateOnlyEvents).toHaveLength(1);
			expect(dateOnlyEvents[0].id).toBe("date-only-1");
		});

		it("should group events with the same time", () => {
			const events: any[] = [
				{
					id: "event-1",
					content: "First meeting",
					time: new Date("2024-01-15T14:00:00Z"),
					timeInfo: {
						primaryTime: new Date("2024-01-15T14:00:00Z"),
						timeComponent: { hour: 14, minute: 0, originalText: "2 PM", isRange: false },
					},
				},
				{
					id: "event-2",
					content: "Second meeting",
					time: new Date("2024-01-15T14:00:00Z"),
					timeInfo: {
						primaryTime: new Date("2024-01-15T14:00:00Z"),
						timeComponent: { hour: 14, minute: 0, originalText: "2 PM", isRange: false },
					},
				},
				{
					id: "event-3",
					content: "Different time",
					time: new Date("2024-01-15T15:00:00Z"),
					timeInfo: {
						primaryTime: new Date("2024-01-15T15:00:00Z"),
						timeComponent: { hour: 15, minute: 0, originalText: "3 PM", isRange: false },
					},
				},
			];

			const timeGroups = new Map<string, any[]>();

			events.forEach((event) => {
				const timeKey = mockTimeline.getTimeGroupKey(
					event.timeInfo?.primaryTime || event.time,
					event
				);
				
				if (!timeGroups.has(timeKey)) {
					timeGroups.set(timeKey, []);
				}
				timeGroups.get(timeKey)!.push(event);
			});

			expect(timeGroups.size).toBe(2);
			expect(timeGroups.get("14:00")).toHaveLength(2);
			expect(timeGroups.get("15:00")).toHaveLength(1);
		});

		it("should handle mixed timed and date-only events in chronological order", () => {
			const events: any[] = [
				{
					id: "date-only",
					content: "All day task",
					time: new Date("2024-01-15T00:00:00Z"),
				},
				{
					id: "morning",
					content: "Morning meeting",
					time: new Date("2024-01-15T09:00:00Z"),
					timeInfo: {
						primaryTime: new Date("2024-01-15T09:00:00Z"),
						timeComponent: { hour: 9, minute: 0, originalText: "9 AM", isRange: false },
					},
				},
				{
					id: "afternoon",
					content: "Afternoon call",
					time: new Date("2024-01-15T15:00:00Z"),
					timeInfo: {
						primaryTime: new Date("2024-01-15T15:00:00Z"),
						timeComponent: { hour: 15, minute: 0, originalText: "3 PM", isRange: false },
					},
				},
			];

			const sortedEvents = mockTimeline.sortEventsByTime(events);

			// Date-only events should come first (midnight), then timed events
			expect(sortedEvents[0].id).toBe("date-only");
			expect(sortedEvents[1].id).toBe("morning");
			expect(sortedEvents[2].id).toBe("afternoon");
		});

		it("should generate consistent time group keys", () => {
			const event1 = {
				timeInfo: {
					timeComponent: { hour: 14, minute: 30, originalText: "2:30 PM", isRange: false },
				},
			};

			const event2 = {
				time: new Date("2024-01-15T14:30:00Z"),
			};

			// Mock moment for fallback
			const mockMoment = {
				format: jest.fn().mockReturnValue("14:30"),
			};
			(global as any).moment = jest.fn().mockReturnValue(mockMoment);

			const key1 = mockTimeline.getTimeGroupKey(new Date(), event1 as any);
			const key2 = mockTimeline.getTimeGroupKey(event2.time, event2 as any);

			expect(key1).toBe("14:30");
			expect(key2).toBe("14:30");
		});
	});

	describe("formatTimeComponent", () => {
		it("should format time component without seconds", () => {
			const timeComponent: TimeComponent = {
				hour: 9,
				minute: 30,
				originalText: "9:30",
				isRange: false,
			};

			const result = mockTimeline.formatTimeComponent(timeComponent);
			expect(result).toBe("09:30");
		});

		it("should format time component with seconds", () => {
			const timeComponent: TimeComponent = {
				hour: 14,
				minute: 5,
				second: 45,
				originalText: "14:05:45",
				isRange: false,
			};

			const result = mockTimeline.formatTimeComponent(timeComponent);
			expect(result).toBe("14:05:45");
		});

		it("should pad single digit hours and minutes", () => {
			const timeComponent: TimeComponent = {
				hour: 7,
				minute: 5,
				originalText: "7:05",
				isRange: false,
			};

			const result = mockTimeline.formatTimeComponent(timeComponent);
			expect(result).toBe("07:05");
		});

		it("should handle midnight (00:00)", () => {
			const timeComponent: TimeComponent = {
				hour: 0,
				minute: 0,
				originalText: "00:00",
				isRange: false,
			};

			const result = mockTimeline.formatTimeComponent(timeComponent);
			expect(result).toBe("00:00");
		});

		it("should handle noon (12:00)", () => {
			const timeComponent: TimeComponent = {
				hour: 12,
				minute: 0,
				originalText: "12:00",
				isRange: false,
			};

			const result = mockTimeline.formatTimeComponent(timeComponent);
			expect(result).toBe("12:00");
		});
	});
});