import { Component, setIcon } from "obsidian";
import { Task } from "../../types/task";
import { t } from "../../translations/helper";

export interface CalendarDay {
	date: Date;
	tasks: Task[];
	isToday: boolean;
	isSelected: boolean;
	isPastDue: boolean;
	isFuture: boolean;
	isThisMonth: boolean;
}

export interface CalendarOptions {
	showWeekends: boolean;
	firstDayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
	showTaskCounts: boolean;
}

export class CalendarComponent extends Component {
	// UI Elements
	public containerEl: HTMLElement;
	private headerEl: HTMLElement;
	private calendarGridEl: HTMLElement;
	private monthLabel: HTMLElement;
	private yearLabel: HTMLElement;

	// State
	private currentDate: Date = new Date();
	private selectedDate: Date = new Date();
	private displayedMonth: number;
	private displayedYear: number;
	private calendarDays: CalendarDay[] = [];
	private tasks: Task[] = [];

	private options: CalendarOptions = {
		showWeekends: true,
		firstDayOfWeek: 0,
		showTaskCounts: true,
	};

	// Events
	public onDateSelected: (date: Date, tasks: Task[]) => void;
	public onMonthChanged: (month: number, year: number) => void;

	constructor(
		private parentEl: HTMLElement,
		private config: Partial<CalendarOptions> = {}
	) {
		super();
		this.displayedMonth = this.currentDate.getMonth();
		this.displayedYear = this.currentDate.getFullYear();
		this.options = { ...this.options, ...this.config };
	}

	onload() {
		// Create calendar container
		this.containerEl = this.parentEl.createDiv({
			cls: "mini-calendar-container",
		});

		// Create header with navigation
		this.createCalendarHeader();

		// Create calendar grid
		this.calendarGridEl = this.containerEl.createDiv({
			cls: "calendar-grid",
		});

		// Generate initial calendar
		this.generateCalendar();
	}

	private createCalendarHeader() {
		this.headerEl = this.containerEl.createDiv({
			cls: "calendar-header",
		});

		// Month and year display
		const titleEl = this.headerEl.createDiv({ cls: "calendar-title" });
		this.monthLabel = titleEl.createSpan({ cls: "calendar-month" });
		this.yearLabel = titleEl.createSpan({ cls: "calendar-year" });

		// Navigation buttons
		const navEl = this.headerEl.createDiv({ cls: "calendar-nav" });

		const prevBtn = navEl.createDiv({ cls: "calendar-nav-btn" });
		setIcon(prevBtn, "chevron-left");

		const nextBtn = navEl.createDiv({ cls: "calendar-nav-btn" });
		setIcon(nextBtn, "chevron-right");

		const todayBtn = navEl.createDiv({ cls: "calendar-today-btn" });
		todayBtn.setText(t("Today"));

		// Register event handlers
		this.registerDomEvent(prevBtn, "click", () => {
			this.navigateMonth(-1);
		});

		this.registerDomEvent(nextBtn, "click", () => {
			this.navigateMonth(1);
		});

		this.registerDomEvent(todayBtn, "click", () => {
			this.goToToday();
		});
	}

	private generateCalendar() {
		// Clear existing calendar
		this.calendarGridEl.empty();
		this.calendarDays = [];

		// Update header
		const monthNames = [
			"January",
			"February",
			"March",
			"April",
			"May",
			"June",
			"July",
			"August",
			"September",
			"October",
			"November",
			"December",
		];
		this.monthLabel.setText(monthNames[this.displayedMonth]);
		this.yearLabel.setText(this.displayedYear.toString());

		// Create day headers (Sun, Mon, etc.)
		const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		const sortedDayNames = [...dayNames];

		// Adjust for first day of week setting
		if (this.options.firstDayOfWeek > 0) {
			for (let i = 0; i < this.options.firstDayOfWeek; i++) {
				sortedDayNames.push(sortedDayNames.shift()!);
			}
		}

		// Add day header cells
		sortedDayNames.forEach((day) => {
			const dayHeaderEl = this.calendarGridEl.createDiv({
				cls: "calendar-day-header",
				text: day,
			});

			// Highlight weekend headers
			if (
				(day === "Sat" || day === "Sun") &&
				!this.options.showWeekends
			) {
				dayHeaderEl.addClass("calendar-weekend");
			}
		});

		// Calculate first day to display
		const firstDayOfMonth = new Date(
			this.displayedYear,
			this.displayedMonth,
			1
		);
		let startDay = firstDayOfMonth.getDay() - this.options.firstDayOfWeek;
		if (startDay < 0) startDay += 7;

		// Calculate number of days in month
		const daysInMonth = new Date(
			this.displayedYear,
			this.displayedMonth + 1,
			0
		).getDate();

		// Calculate days from previous month to display
		const prevMonthDays = startDay;
		const prevMonth =
			this.displayedMonth === 0 ? 11 : this.displayedMonth - 1;
		const prevMonthYear =
			this.displayedMonth === 0
				? this.displayedYear - 1
				: this.displayedYear;
		const daysInPrevMonth = new Date(
			prevMonthYear,
			prevMonth + 1,
			0
		).getDate();

		// Current date for comparison
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const selectedDay = this.selectedDate.getDate();
		const selectedMonth = this.selectedDate.getMonth();
		const selectedYear = this.selectedDate.getFullYear();

		// Generate days for previous month
		for (let i = 0; i < prevMonthDays; i++) {
			const dayNum = daysInPrevMonth - prevMonthDays + i + 1;
			const date = new Date(prevMonthYear, prevMonth, dayNum);

			const isSelected =
				dayNum === selectedDay &&
				prevMonth === selectedMonth &&
				prevMonthYear === selectedYear;

			this.addCalendarDay(date, false, isSelected, false, false);
		}

		// Generate days for current month
		for (let i = 1; i <= daysInMonth; i++) {
			const date = new Date(this.displayedYear, this.displayedMonth, i);

			const isToday = date.getTime() === today.getTime();
			const isSelected =
				i === selectedDay &&
				this.displayedMonth === selectedMonth &&
				this.displayedYear === selectedYear;
			const isPastDue = date < today;
			const isFuture = date > today;

			this.addCalendarDay(
				date,
				isToday,
				isSelected,
				isPastDue,
				isFuture,
				true
			);
		}

		// Calculate days from next month to display (to fill grid)
		const totalDaysDisplayed = prevMonthDays + daysInMonth;
		const nextMonthDays = 42 - totalDaysDisplayed; // 6 rows of 7 days = 42

		// Generate days for next month
		const nextMonth =
			this.displayedMonth === 11 ? 0 : this.displayedMonth + 1;
		const nextMonthYear =
			this.displayedMonth === 11
				? this.displayedYear + 1
				: this.displayedYear;

		for (let i = 1; i <= nextMonthDays; i++) {
			const date = new Date(nextMonthYear, nextMonth, i);

			const isSelected =
				i === selectedDay &&
				nextMonth === selectedMonth &&
				nextMonthYear === selectedYear;

			this.addCalendarDay(date, false, isSelected, false, true);
		}
	}

	private addCalendarDay(
		date: Date,
		isToday: boolean,
		isSelected: boolean,
		isPastDue: boolean,
		isFuture: boolean,
		isThisMonth: boolean = false
	) {
		// Filter tasks for this day
		const dayTasks = this.getTasksForDate(date);

		// Create calendar day object
		const calendarDay: CalendarDay = {
			date,
			tasks: dayTasks,
			isToday,
			isSelected,
			isPastDue,
			isFuture,
			isThisMonth,
		};

		this.calendarDays.push(calendarDay);

		// Create the UI element
		const dayEl = this.calendarGridEl.createDiv({ cls: "calendar-day" });

		if (!isThisMonth) dayEl.addClass("other-month");
		if (isToday) dayEl.addClass("today");
		if (isSelected) dayEl.addClass("selected");
		if (isPastDue) dayEl.addClass("past-due");

		// Day number
		const dayNumEl = dayEl.createDiv({
			cls: "calendar-day-number",
			text: date.getDate().toString(),
		});

		// Task count badge (if there are tasks)
		if (this.options.showTaskCounts && dayTasks.length > 0) {
			const countEl = dayEl.createDiv({
				cls: "calendar-day-count",
				text: dayTasks.length.toString(),
			});

			// Add class based on task priority
			const hasPriorityTasks = dayTasks.some(
				(task) => task.metadata.priority && task.metadata.priority >= 2
			);
			if (hasPriorityTasks) {
				countEl.addClass("has-priority");
			}
		}

		// Register click event
		this.registerDomEvent(dayEl, "click", () => {
			this.selectDate(date);
		});
	}

	public selectDate(date: Date) {
		this.selectedDate = date;

		// If the selected date is in a different month, navigate to that month
		if (
			date.getMonth() !== this.displayedMonth ||
			date.getFullYear() !== this.displayedYear
		) {
			this.displayedMonth = date.getMonth();
			this.displayedYear = date.getFullYear();
			this.generateCalendar();
		} else {
			// Just update selected state
			const allDayEls =
				this.calendarGridEl.querySelectorAll(".calendar-day");
			allDayEls.forEach((el, index) => {
				if (index < this.calendarDays.length) {
					const day = this.calendarDays[index];
					if (
						day.date.getDate() === date.getDate() &&
						day.date.getMonth() === date.getMonth() &&
						day.date.getFullYear() === date.getFullYear()
					) {
						el.addClass("selected");
						day.isSelected = true;
					} else {
						el.removeClass("selected");
						day.isSelected = false;
					}
				}
			});
		}

		// Trigger callback
		if (this.onDateSelected) {
			const selectedDayTasks = this.getTasksForDate(date);
			this.onDateSelected(date, selectedDayTasks);
		}
	}

	private navigateMonth(delta: number) {
		this.displayedMonth += delta;

		// Handle year change
		if (this.displayedMonth > 11) {
			this.displayedMonth = 0;
			this.displayedYear++;
		} else if (this.displayedMonth < 0) {
			this.displayedMonth = 11;
			this.displayedYear--;
		}

		this.generateCalendar();

		if (this.onMonthChanged) {
			this.onMonthChanged(this.displayedMonth, this.displayedYear);
		}
	}

	private goToToday() {
		const today = new Date();
		this.displayedMonth = today.getMonth();
		this.displayedYear = today.getFullYear();
		this.selectDate(today);
	}

	private getTasksForDate(date: Date): Task[] {
		const startOfDay = new Date(date);
		startOfDay.setHours(0, 0, 0, 0);

		const endOfDay = new Date(date);
		endOfDay.setHours(23, 59, 59, 999);

		const startTimestamp = startOfDay.getTime();
		const endTimestamp = endOfDay.getTime();

		return this.tasks.filter((task) => {
			if (task.metadata.dueDate) {
				const dueDate = new Date(task.metadata.dueDate);
				dueDate.setHours(0, 0, 0, 0);
				return dueDate.getTime() === startTimestamp;
			}
			return false;
		});
	}

	public setTasks(tasks: Task[]) {
		this.tasks = tasks;
		this.generateCalendar();
	}

	public setOptions(options: Partial<CalendarOptions>) {
		this.options = { ...this.options, ...options };
		this.generateCalendar();
	}

	public setCurrentDate(date: Date) {
		// Update the current date
		this.currentDate = new Date(date);
		this.currentDate.setHours(0, 0, 0, 0);

		// Regenerate the calendar to update "today" highlighting
		this.generateCalendar();
	}

	onunload() {
		this.containerEl.empty();
		this.containerEl.remove();
	}
}
