import { TaskTimerManager, TimerState } from "../managers/timer-manager";
import { TaskTimerFormatter } from "./timer-format-service";

/**
 * Data structure for timer export/import
 */
export interface TimerExportData {
	version: string;
	exportDate: string;
	timers: {
		taskId: string;
		filePath: string;
		blockId: string;
		startTime: number;
		endTime?: number;
		duration: number;
		status: string;
		createdAt: number;
		totalPausedDuration: number;
	}[];
}

/**
 * Export and import functionality for task timer data
 */
export class TaskTimerExporter {
	private timerManager: TaskTimerManager;
	private readonly EXPORT_VERSION = "1.0.0";

	constructor(timerManager: TaskTimerManager) {
		this.timerManager = timerManager;
	}

	/**
	 * Export all timer data to JSON format
	 * @param includeActive Whether to include currently active timers
	 * @returns JSON string of exported data
	 */
	exportToJSON(includeActive: boolean = false): string {
		const exportData = this.prepareExportData(includeActive);
		return JSON.stringify(exportData, null, 2);
	}

	/**
	 * Export all timer data to YAML format
	 * @param includeActive Whether to include currently active timers
	 * @returns YAML string of exported data
	 */
	exportToYAML(includeActive: boolean = false): string {
		const exportData = this.prepareExportData(includeActive);
		return this.convertToYAML(exportData);
	}

	/**
	 * Import timer data from JSON string
	 * @param jsonData JSON string containing export data
	 * @returns true if import was successful
	 */
	importFromJSON(jsonData: string): boolean {
		try {
			const data = JSON.parse(jsonData) as TimerExportData;
			return this.processImportData(data);
		} catch (error) {
			console.error("Error importing JSON data:", error);
			return false;
		}
	}

	/**
	 * Import timer data from YAML string
	 * @param yamlData YAML string containing export data
	 * @returns true if import was successful
	 */
	importFromYAML(yamlData: string): boolean {
		try {
			const data = this.parseYAML(yamlData) as TimerExportData;
			return this.processImportData(data);
		} catch (error) {
			console.error("Error importing YAML data:", error);
			return false;
		}
	}

	/**
	 * Export active timers to a temporary backup
	 * @returns Backup data as JSON string
	 */
	createBackup(): string {
		const activeTimers = this.timerManager.getAllActiveTimers();
		const backupData = {
			version: this.EXPORT_VERSION,
			backupDate: new Date().toISOString(),
			activeTimers: activeTimers.map((timer) => ({
				...timer,
				currentDuration: this.timerManager.getCurrentDuration(
					timer.taskId,
				),
			})),
		};

		return JSON.stringify(backupData, null, 2);
	}

	/**
	 * Restore timers from backup data
	 * @param backupData Backup data as JSON string
	 * @returns true if restore was successful
	 */
	restoreFromBackup(backupData: string): boolean {
		try {
			const backup = JSON.parse(backupData);

			if (!backup.activeTimers || !Array.isArray(backup.activeTimers)) {
				return false;
			}

			// Restore each timer
			for (const timerData of backup.activeTimers) {
				// Recreate timer state in localStorage
				// Convert old format to new segments format
				const segments = [];
				if (timerData.startTime) {
					segments.push({
						startTime: timerData.startTime,
						endTime: timerData.pausedTime,
						duration: timerData.pausedTime
							? timerData.pausedTime -
								timerData.startTime -
								(timerData.totalPausedDuration || 0)
							: undefined,
					});
				}

				const restoredTimer: TimerState = {
					taskId: timerData.taskId,
					filePath: timerData.filePath,
					blockId: timerData.blockId,
					segments: segments,
					status: timerData.status as "idle" | "running" | "paused",
					createdAt: timerData.createdAt,
					// Keep legacy fields for reference
					legacyStartTime: timerData.startTime,
					legacyPausedTime: timerData.pausedTime,
					legacyTotalPausedDuration:
						timerData.totalPausedDuration || 0,
				};

				(window as any).app.saveLocalStorage(
					timerData.taskId,
					JSON.stringify(restoredTimer),
				);
			}

			return true;
		} catch (error) {
			console.error("Error restoring from backup:", error);
			return false;
		}
	}

	/**
	 * Get export statistics
	 * @returns Statistics about exportable data
	 */
	getExportStats(): {
		activeTimers: number;
		totalDuration: number;
		oldestTimer: string | null;
		newestTimer: string | null;
	} {
		const activeTimers = this.timerManager.getAllActiveTimers();

		let totalDuration = 0;
		let oldestTime = Number.MAX_SAFE_INTEGER;
		let newestTime = 0;
		let oldestTimer: string | null = null;
		let newestTimer: string | null = null;

		for (const timer of activeTimers) {
			const duration = this.timerManager.getCurrentDuration(timer.taskId);
			totalDuration += duration;

			if (timer.createdAt < oldestTime) {
				oldestTime = timer.createdAt;
				oldestTimer = new Date(timer.createdAt).toLocaleString();
			}

			if (timer.createdAt > newestTime) {
				newestTime = timer.createdAt;
				newestTimer = new Date(timer.createdAt).toLocaleString();
			}
		}

		return {
			activeTimers: activeTimers.length,
			totalDuration,
			oldestTimer,
			newestTimer,
		};
	}

	/**
	 * Prepare data for export
	 * @param includeActive Whether to include active timers
	 * @returns Export data structure
	 */
	private prepareExportData(includeActive: boolean): TimerExportData {
		const activeTimers = this.timerManager.getAllActiveTimers();
		const exportTimers = [];

		for (const timer of activeTimers) {
			// Skip active timers if not requested
			if (
				!includeActive &&
				(timer.status === "running" || timer.status === "paused")
			) {
				continue;
			}

			const currentDuration = this.timerManager.getCurrentDuration(
				timer.taskId,
			);

			// Get the first and last segments for export
			const firstSegment = timer.segments[0];
			const lastSegment = timer.segments[timer.segments.length - 1];

			exportTimers.push({
				taskId: timer.taskId,
				filePath: timer.filePath,
				blockId: timer.blockId,
				startTime: firstSegment
					? firstSegment.startTime
					: timer.createdAt,
				endTime:
					lastSegment && lastSegment.endTime
						? lastSegment.endTime
						: undefined,
				duration: currentDuration,
				status: timer.status,
				createdAt: timer.createdAt,
				totalPausedDuration: timer.legacyTotalPausedDuration || 0,
			});
		}

		return {
			version: this.EXPORT_VERSION,
			exportDate: new Date().toISOString(),
			timers: exportTimers,
		};
	}

	/**
	 * Process imported data and validate structure
	 * @param data Imported data structure
	 * @returns true if processing was successful
	 */
	private processImportData(data: TimerExportData): boolean {
		if (!this.validateImportData(data)) {
			return false;
		}

		let importedCount = 0;

		for (const timerData of data.timers) {
			try {
				// Only import completed timers to avoid conflicts
				if (timerData.status === "idle" || timerData.endTime) {
					// Store as historical data (could be extended for analytics)
					const historyKey = `taskTimer_history_${timerData.blockId}_${timerData.startTime}`;
					(window as any).app.saveLocalStorage(
						historyKey,
						JSON.stringify({
							...timerData,
							importedAt: Date.now(),
						}),
					);
					importedCount++;
				}
			} catch (error) {
				console.warn(
					"Failed to import timer:",
					timerData.taskId,
					error,
				);
			}
		}

		console.log(`Successfully imported ${importedCount} timer records`);
		return importedCount > 0;
	}

	/**
	 * Validate imported data structure
	 * @param data Data to validate
	 * @returns true if data is valid
	 */
	private validateImportData(data: any): data is TimerExportData {
		if (!data || typeof data !== "object") {
			return false;
		}

		if (!data.version || !data.exportDate || !Array.isArray(data.timers)) {
			return false;
		}

		// Validate each timer entry
		for (const timer of data.timers) {
			if (
				!timer.taskId ||
				!timer.filePath ||
				!timer.blockId ||
				typeof timer.startTime !== "number" ||
				typeof timer.duration !== "number"
			) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Convert object to YAML format (simple implementation)
	 * @param obj Object to convert
	 * @returns YAML string
	 */
	private convertToYAML(obj: any, indent: number = 0): string {
		const spaces = "  ".repeat(indent);
		let yaml = "";

		if (Array.isArray(obj)) {
			for (const item of obj) {
				yaml += `${spaces}- ${this.convertToYAML(item, indent + 1).trim()}\n`;
			}
		} else if (obj !== null && typeof obj === "object") {
			for (const [key, value] of Object.entries(obj)) {
				if (Array.isArray(value)) {
					yaml += `${spaces}${key}:\n`;
					yaml += this.convertToYAML(value, indent + 1);
				} else if (value !== null && typeof value === "object") {
					yaml += `${spaces}${key}:\n`;
					yaml += this.convertToYAML(value, indent + 1);
				} else {
					yaml += `${spaces}${key}: ${this.yamlEscape(value)}\n`;
				}
			}
		} else {
			return this.yamlEscape(obj);
		}

		return yaml;
	}

	/**
	 * Parse YAML string to object (simple implementation)
	 * @param yamlString YAML string to parse
	 * @returns Parsed object
	 */
	private parseYAML(yamlString: string): any {
		// This is a very basic YAML parser for our specific use case
		// For production use, consider using a proper YAML library
		const lines = yamlString.split("\n");
		const result: any = {};
		let currentObject = result;
		const objectStack: any[] = [result];
		let currentKey = "";

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine || trimmedLine.startsWith("#")) continue;

			const indent = line.length - line.trimLeft().length;
			const colonIndex = trimmedLine.indexOf(":");

			if (colonIndex > 0) {
				const key = trimmedLine.substring(0, colonIndex).trim();
				const value = trimmedLine.substring(colonIndex + 1).trim();

				if (value === "") {
					// This is a parent key
					currentObject[key] = {};
					currentKey = key;
				} else if (value === "[]") {
					currentObject[key] = [];
				} else {
					// This is a key-value pair
					currentObject[key] = this.parseYAMLValue(value);
				}
			} else if (trimmedLine.startsWith("- ")) {
				// This is an array item
				if (!Array.isArray(currentObject[currentKey])) {
					currentObject[currentKey] = [];
				}
				const item = this.parseYAMLValue(trimmedLine.substring(2));
				currentObject[currentKey].push(item);
			}
		}

		return result;
	}

	/**
	 * Parse individual YAML value
	 * @param value String value to parse
	 * @returns Parsed value
	 */
	private parseYAMLValue(value: string): any {
		value = value.trim();

		if (value === "true") return true;
		if (value === "false") return false;
		if (value === "null") return null;

		// Try to parse as number
		const numValue = Number(value);
		if (!isNaN(numValue) && isFinite(numValue)) {
			return numValue;
		}

		// Remove quotes if present
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			return value.slice(1, -1);
		}

		return value;
	}

	/**
	 * Escape value for YAML output
	 * @param value Value to escape
	 * @returns Escaped string
	 */
	private yamlEscape(value: any): string {
		if (typeof value === "string") {
			// Quote strings that contain special characters
			if (
				value.includes(":") ||
				value.includes("\n") ||
				value.includes("#")
			) {
				return `"${value.replace(/"/g, '\\"')}"`;
			}
		}
		return String(value);
	}
}
