import { TaskTimerSettings } from "../common/setting-definition";

/**
 * Time segment interface - represents a single work session
 */
export interface TimeSegment {
	startTime: number;
	endTime?: number; // undefined means still running
	duration?: number; // cached duration for completed segments
}

/**
 * Timer state interface
 */
export interface TimerState {
	taskId: string;
	filePath: string;
	blockId: string;
	segments: TimeSegment[]; // Array of time segments
	status: 'idle' | 'running' | 'paused';
	createdAt: number;
	// Legacy fields for backward compatibility
	legacyStartTime?: number;
	legacyPausedTime?: number;
	legacyTotalPausedDuration?: number;
}

/**
 * Legacy timer state interface for migration
 */
export interface LegacyTimerState {
	taskId: string;
	filePath: string;
	blockId: string;
	startTime: number;
	pausedTime?: number;
	totalPausedDuration: number;
	status: 'idle' | 'running' | 'paused';
	createdAt: number;
}

/**
 * Manager for task timer state and localStorage operations
 */
export class TaskTimerManager {
	private settings: TaskTimerSettings;
	private readonly STORAGE_PREFIX = "taskTimer_";
	private readonly TIMER_LIST_KEY = "taskTimer_activeList";

	constructor(settings: TaskTimerSettings) {
		this.settings = settings;
	}

	/**
	 * Generate a unique block reference ID
	 * @param prefix Optional prefix to use (defaults to settings)
	 * @returns Generated block ID
	 */
	public generateBlockId(prefix?: string): string {
		const actualPrefix = prefix || this.settings.blockRefPrefix;
		const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
		const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
		return `${actualPrefix}-${timestamp}-${random}`;
	}

	/**
	 * Generate storage key for a timer
	 * @param filePath File path
	 * @param blockId Block reference ID
	 * @returns Storage key
	 */
	private getStorageKey(filePath: string, blockId: string): string {
		return `${this.STORAGE_PREFIX}${filePath}#${blockId}`;
	}

	/**
	 * Start a timer for a task
	 * @param filePath Path of the file containing the task
	 * @param existingBlockId Optional existing block ID to resume
	 * @returns Generated or used block ID
	 */
	startTimer(filePath: string, existingBlockId?: string): string {
		try {
			console.log(`[TaskTimerManager] Starting timer for file: ${filePath}, blockId: ${existingBlockId || 'new'}`);
			
			const blockId = existingBlockId || this.generateBlockId();
			const taskId = this.getStorageKey(filePath, blockId);
			const now = Date.now();

			if (!blockId) {
				console.error("[TaskTimerManager] Failed to generate or use block ID");
				throw new Error("Block ID generation failed");
			}

			// Check if timer already exists
			const existingTimer = this.getTimerState(taskId);
			
			if (existingTimer) {
				console.log(`[TaskTimerManager] Found existing timer with status: ${existingTimer.status}`);
				// Resume existing timer
				if (existingTimer.status === 'paused') {
					this.resumeTimer(taskId);
				}
				return blockId;
			}

			// Create new timer with initial segment
			const timerState: TimerState = {
				taskId,
				filePath,
				blockId,
				segments: [{
					startTime: now
				}],
				status: 'running',
				createdAt: now
			};

			// Save timer state
			try {
				localStorage.setItem(taskId, JSON.stringify(timerState));
				this.addToActiveList(taskId);
				console.log(`[TaskTimerManager] Successfully created new timer: ${taskId}`);
			} catch (storageError) {
				console.error("[TaskTimerManager] Failed to save timer to localStorage:", storageError);
				throw new Error("Failed to save timer state - localStorage may be full or unavailable");
			}

			return blockId;
		} catch (error) {
			console.error("[TaskTimerManager] Critical error starting timer:", error);
			throw error; // Re-throw to let caller handle
		}
	}

	/**
	 * Pause a timer
	 * @param taskId Timer task ID
	 */
	pauseTimer(taskId: string): void {
		const timerState = this.getTimerState(taskId);
		if (!timerState || timerState.status !== 'running') {
			return;
		}

		const now = Date.now();
		
		// Close the current segment
		const currentSegment = timerState.segments[timerState.segments.length - 1];
		if (currentSegment && !currentSegment.endTime) {
			currentSegment.endTime = now;
			currentSegment.duration = now - currentSegment.startTime;
		}

		timerState.status = 'paused';

		localStorage.setItem(taskId, JSON.stringify(timerState));
	}

	/**
	 * Resume a paused timer
	 * @param taskId Timer task ID
	 */
	resumeTimer(taskId: string): void {
		const timerState = this.getTimerState(taskId);
		if (!timerState || timerState.status !== 'paused') {
			return;
		}

		const now = Date.now();
		
		// Create a new segment for the resumed work
		timerState.segments.push({
			startTime: now
		});
		
		timerState.status = 'running';

		localStorage.setItem(taskId, JSON.stringify(timerState));
	}

	/**
	 * Reset a timer
	 * @param taskId Timer task ID
	 */
	resetTimer(taskId: string): void {
		const timerState = this.getTimerState(taskId);
		if (!timerState) {
			return;
		}

		const now = Date.now();
		
		// Clear all segments and start fresh
		timerState.segments = [{
			startTime: now
		}];
		timerState.status = 'running';

		localStorage.setItem(taskId, JSON.stringify(timerState));
	}

	/**
	 * Complete a timer and return formatted duration
	 * @param taskId Timer task ID
	 * @returns Formatted duration string
	 */
	completeTimer(taskId: string): string {
		try {
			console.log(`[TaskTimerManager] Completing timer: ${taskId}`);
			
			const timerState = this.getTimerState(taskId);
			if (!timerState) {
				console.warn(`[TaskTimerManager] Timer not found for completion: ${taskId}`);
				return "";
			}

			const now = Date.now();
			
			// Close the current segment if running
			if (timerState.status === 'running') {
				const currentSegment = timerState.segments[timerState.segments.length - 1];
				if (currentSegment && !currentSegment.endTime) {
					currentSegment.endTime = now;
					currentSegment.duration = now - currentSegment.startTime;
				}
			}

			// Calculate total duration from all segments
			const totalDuration = this.calculateTotalDuration(timerState);
			console.log(`[TaskTimerManager] Total duration from ${timerState.segments.length} segments: ${totalDuration}ms`);

			// Validate duration
			if (totalDuration < 0) {
				console.error(`[TaskTimerManager] Invalid duration calculated: ${totalDuration}ms`);
				return this.formatDuration(0);
			}

			// Remove from storage
			try {
				this.removeTimer(taskId);
				console.log(`[TaskTimerManager] Successfully removed completed timer from storage`);
			} catch (removalError) {
				console.error("[TaskTimerManager] Failed to remove timer from storage:", removalError);
				// Continue anyway - we can still return the duration
			}

			// Format and return duration
			const formattedDuration = this.formatDuration(totalDuration);
			console.log(`[TaskTimerManager] Timer completed successfully, duration: ${formattedDuration}`);
			return formattedDuration;
		} catch (error) {
			console.error("[TaskTimerManager] Critical error completing timer:", error);
			// Return empty string to prevent crashes, but log the issue
			return "";
		}
	}

	/**
	 * Get current timer state
	 * @param taskId Timer task ID
	 * @returns Timer state or null if not found
	 */
	getTimerState(taskId: string): TimerState | null {
		try {
			const stored = localStorage.getItem(taskId);
			if (!stored) {
				return null;
			}

			const parsed = JSON.parse(stored);
			
			// Check if this is a legacy format that needs migration
			if (this.isLegacyFormat(parsed)) {
				console.log(`[TaskTimerManager] Migrating legacy timer state for ${taskId}`);
				const migrated = this.migrateLegacyState(parsed as LegacyTimerState);
				// Save migrated state
				localStorage.setItem(taskId, JSON.stringify(migrated));
				return migrated;
			}
			
			// Validate the parsed state structure
			if (!this.validateTimerState(parsed)) {
				console.error(`[TaskTimerManager] Invalid timer state structure for ${taskId}:`, parsed);
				// Clean up corrupted data
				localStorage.removeItem(taskId);
				return null;
			}
			
			return parsed as TimerState;
		} catch (error) {
			console.error(`[TaskTimerManager] Error retrieving timer state for ${taskId}:`, error);
			// Clean up corrupted data
			try {
				localStorage.removeItem(taskId);
			} catch (cleanupError) {
				console.error("[TaskTimerManager] Failed to clean up corrupted timer data:", cleanupError);
			}
			return null;
		}
	}

	/**
	 * Check if the state is in legacy format
	 * @param state State to check
	 * @returns true if legacy format
	 */
	private isLegacyFormat(state: any): boolean {
		return (
			state &&
			typeof state.startTime === 'number' &&
			!state.segments &&
			typeof state.totalPausedDuration === 'number'
		);
	}

	/**
	 * Migrate legacy timer state to new format
	 * @param legacy Legacy timer state
	 * @returns Migrated timer state
	 */
	private migrateLegacyState(legacy: LegacyTimerState): TimerState {
		const segments: TimeSegment[] = [];
		
		// Create segment from legacy data
		if (legacy.status === 'running') {
			// Running timer - create an open segment
			segments.push({
				startTime: legacy.startTime + legacy.totalPausedDuration
			});
		} else if (legacy.status === 'paused' && legacy.pausedTime) {
			// Paused timer - create a closed segment
			segments.push({
				startTime: legacy.startTime + legacy.totalPausedDuration,
				endTime: legacy.pausedTime,
				duration: legacy.pausedTime - legacy.startTime - legacy.totalPausedDuration
			});
		}
		
		return {
			taskId: legacy.taskId,
			filePath: legacy.filePath,
			blockId: legacy.blockId,
			segments,
			status: legacy.status,
			createdAt: legacy.createdAt,
			// Keep legacy fields for reference
			legacyStartTime: legacy.startTime,
			legacyPausedTime: legacy.pausedTime,
			legacyTotalPausedDuration: legacy.totalPausedDuration
		};
	}

	/**
	 * Validate timer state structure
	 * @param state Parsed timer state to validate
	 * @returns true if valid, false otherwise
	 */
	private validateTimerState(state: any): state is TimerState {
		return (
			state &&
			typeof state.taskId === 'string' &&
			typeof state.filePath === 'string' &&
			typeof state.blockId === 'string' &&
			Array.isArray(state.segments) &&
			typeof state.createdAt === 'number' &&
			['idle', 'running', 'paused'].includes(state.status)
		);
	}

	/**
	 * Get all active timers
	 * @returns Array of active timer states
	 */
	getAllActiveTimers(): TimerState[] {
		const activeList = this.getActiveList();
		const timers: TimerState[] = [];

		for (const taskId of activeList) {
			const timer = this.getTimerState(taskId);
			if (timer) {
				timers.push(timer);
			} else {
				// Clean up orphaned references
				this.removeFromActiveList(taskId);
			}
		}

		return timers;
	}

	/**
	 * Get timer by file path and block ID
	 * @param filePath File path
	 * @param blockId Block ID
	 * @returns Timer state or null
	 */
	getTimerByFileAndBlock(filePath: string, blockId: string): TimerState | null {
		const taskId = this.getStorageKey(filePath, blockId);
		return this.getTimerState(taskId);
	}

	/**
	 * Remove a timer from storage
	 * @param taskId Timer task ID
	 */
	removeTimer(taskId: string): void {
		localStorage.removeItem(taskId);
		this.removeFromActiveList(taskId);
	}

	/**
	 * Calculate total duration from all segments
	 * @param timerState Timer state
	 * @returns Total duration in milliseconds
	 */
	private calculateTotalDuration(timerState: TimerState): number {
		const now = Date.now();
		
		return timerState.segments.reduce((total, segment) => {
			let segmentDuration: number;
			
			if (segment.duration) {
				// Use cached duration if available
				segmentDuration = segment.duration;
			} else if (segment.endTime) {
				// Calculate duration for completed segment
				segmentDuration = segment.endTime - segment.startTime;
			} else {
				// Calculate duration for running segment
				segmentDuration = now - segment.startTime;
			}
			
			return total + segmentDuration;
		}, 0);
	}

	/**
	 * Get current running time for a timer
	 * @param taskId Timer task ID
	 * @returns Current duration in milliseconds, or 0 if not found/running
	 */
	getCurrentDuration(taskId: string): number {
		const timerState = this.getTimerState(taskId);
		if (!timerState) {
			return 0;
		}

		return this.calculateTotalDuration(timerState);
	}

	/**
	 * Get the number of time segments (sessions) for a timer
	 * @param taskId Timer task ID
	 * @returns Number of segments
	 */
	getSegmentCount(taskId: string): number {
		const timerState = this.getTimerState(taskId);
		if (!timerState) {
			return 0;
		}

		return timerState.segments.length;
	}

	/**
	 * Get all time segments for a timer
	 * @param taskId Timer task ID
	 * @returns Array of time segments
	 */
	getSegments(taskId: string): TimeSegment[] {
		const timerState = this.getTimerState(taskId);
		if (!timerState) {
			return [];
		}

		return timerState.segments;
	}

	/**
	 * Format duration in milliseconds to readable string
	 * @param duration Duration in milliseconds
	 * @returns Formatted duration string
	 */
	formatDuration(duration: number): string {
		const seconds = Math.floor(duration / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		const remainingMinutes = minutes % 60;
		const remainingSeconds = seconds % 60;

		// Use template format from settings
		let template = this.settings.timeFormat;
		
		// Replace placeholders
		template = template.replace("{h}", hours.toString());
		template = template.replace("{m}", remainingMinutes.toString());
		template = template.replace("{s}", remainingSeconds.toString());
		template = template.replace("{ms}", duration.toString());

		// Clean up zero values (remove 0hrs, 0mins if they are zero)
		// Use word boundaries to avoid matching 10hrs, 20mins etc.
		template = template.replace(/\b0hrs\b/g, "");
		template = template.replace(/\b0mins\b/g, "");
		
		// Clean up leading/trailing spaces and multiple spaces
		template = template.replace(/\s+/g, " ").trim();

		return template || "0s";
	}

	/**
	 * Get active timer list from localStorage
	 * @returns Array of active timer task IDs
	 */
	private getActiveList(): string[] {
		const stored = localStorage.getItem(this.TIMER_LIST_KEY);
		if (!stored) {
			return [];
		}

		try {
			return JSON.parse(stored) as string[];
		} catch (error) {
			console.error("Error parsing active timer list:", error);
			return [];
		}
	}

	/**
	 * Add timer to active list
	 * @param taskId Timer task ID
	 */
	private addToActiveList(taskId: string): void {
		const activeList = this.getActiveList();
		if (!activeList.includes(taskId)) {
			activeList.push(taskId);
			localStorage.setItem(this.TIMER_LIST_KEY, JSON.stringify(activeList));
		}
	}

	/**
	 * Remove timer from active list
	 * @param taskId Timer task ID
	 */
	private removeFromActiveList(taskId: string): void {
		const activeList = this.getActiveList();
		const filtered = activeList.filter(id => id !== taskId);
		localStorage.setItem(this.TIMER_LIST_KEY, JSON.stringify(filtered));
	}

	/**
	 * Update settings for this manager instance
	 * @param settings New settings to use
	 */
	updateSettings(settings: TaskTimerSettings): void {
		this.settings = settings;
	}

	/**
	 * Clean up expired or orphaned timers
	 * @param maxAgeHours Maximum age in hours for keeping completed timers
	 */
	cleanup(maxAgeHours: number = 24): void {
		const activeList = this.getActiveList();
		const now = Date.now();
		const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds

		for (const taskId of activeList) {
			const timer = this.getTimerState(taskId);
			if (!timer) {
				// Remove orphaned reference
				this.removeFromActiveList(taskId);
				continue;
			}

			// Remove very old timers
			if (now - timer.createdAt > maxAge) {
				this.removeTimer(taskId);
			}
		}
	}
}