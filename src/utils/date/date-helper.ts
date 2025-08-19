export class DateHelper {
	public dateToX(date: Date, startDate: Date, dayWidth: number): number {
		if (!startDate) return 0;
		const clampedDate = new Date(
			Math.max(date.getTime(), startDate.getTime())
		); // Clamp date to be >= startDate
		const daysDiff = this.daysBetween(startDate, clampedDate);
		return daysDiff * dayWidth;
	}

	public xToDate(x: number, startDate: Date, dayWidth: number): Date | null {
		if (!startDate || dayWidth <= 0) return null;
		const days = x / dayWidth;
		return this.addDays(startDate, days);
	}

	// Simple days between calculation (ignores time part)
	public daysBetween(date1: Date, date2: Date): number {
		const d1 = this.startOfDay(date1).getTime();
		const d2 = this.startOfDay(date2).getTime();
		// Use Math.floor to handle potential floating point issues and DST changes slightly better
		return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
	}

	public addDays(date: Date, days: number): Date {
		const result = new Date(date);
		result.setDate(result.getDate() + days);
		return result;
	}

	public startOfDay(date: Date): Date {
		// Clone the date to avoid modifying the original object
		const result = new Date(date);
		result.setHours(0, 0, 0, 0);
		return result;
	}

	public startOfWeek(date: Date): Date {
		const result = new Date(date);
		const day = result.getDay(); // 0 = Sunday, 1 = Monday, ...
		// Adjust to Monday (handle Sunday case where getDay is 0)
		const diff = result.getDate() - day + (day === 0 ? -6 : 1);
		result.setDate(diff);
		return this.startOfDay(result);
	}

	public endOfWeek(date: Date): Date {
		const start = this.startOfWeek(date);
		const result = this.addDays(start, 6); // End on Sunday
		result.setHours(23, 59, 59, 999); // End of Sunday
		return result;
	}

	// ISO 8601 week number calculation
	public getWeekNumber(d: Date): number {
		d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
		d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // Set to Thursday of the week
		const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
		const weekNo = Math.ceil(
			((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
		);
		return weekNo;
	}
}
