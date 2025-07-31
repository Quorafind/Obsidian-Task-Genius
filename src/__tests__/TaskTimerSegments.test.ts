import { TaskTimerManager, TimerState, TimeSegment } from "../utils/TaskTimerManager";
import { TaskTimerSettings } from "../common/setting-definition";

// Mock localStorage
const localStorageMock = (() => {
	let store: { [key: string]: string } = {};
	return {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, value: string) => {
			store[key] = value;
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		}
	};
})();

Object.defineProperty(window, 'localStorage', {
	value: localStorageMock
});

describe("TaskTimerManager - Time Segments", () => {
	let manager: TaskTimerManager;
	const mockSettings: TaskTimerSettings = {
		enabled: true,
		blockRefPrefix: "timer",
		timeFormat: "{h}hrs{m}mins{s}s",
		metadataDetection: {
			frontmatter: "",
			folders: [],
			tags: []
		}
	};

	beforeEach(() => {
		localStorageMock.clear();
		manager = new TaskTimerManager(mockSettings);
	});

	test("should create initial segment when starting timer", () => {
		const blockId = manager.startTimer("test.md");
		const taskId = `taskTimer_test.md#${blockId}`;
		const state = manager.getTimerState(taskId);
		
		expect(state).toBeTruthy();
		expect(state!.segments).toHaveLength(1);
		expect(state!.segments[0].startTime).toBeDefined();
		expect(state!.segments[0].endTime).toBeUndefined();
		expect(state!.status).toBe('running');
	});

	test("should close segment when pausing timer", () => {
		const blockId = manager.startTimer("test.md");
		const taskId = `taskTimer_test.md#${blockId}`;
		
		// Pause the timer
		manager.pauseTimer(taskId);
		
		const state = manager.getTimerState(taskId);
		expect(state!.segments).toHaveLength(1);
		expect(state!.segments[0].endTime).toBeDefined();
		expect(state!.segments[0].duration).toBeDefined();
		expect(state!.status).toBe('paused');
	});

	test("should create new segment when resuming timer", () => {
		const blockId = manager.startTimer("test.md");
		const taskId = `taskTimer_test.md#${blockId}`;
		
		// Pause and resume
		manager.pauseTimer(taskId);
		manager.resumeTimer(taskId);
		
		const state = manager.getTimerState(taskId);
		expect(state!.segments).toHaveLength(2);
		expect(state!.segments[0].endTime).toBeDefined();
		expect(state!.segments[1].startTime).toBeDefined();
		expect(state!.segments[1].endTime).toBeUndefined();
		expect(state!.status).toBe('running');
	});

	test("should calculate total duration across multiple segments", () => {
		const blockId = manager.startTimer("test.md");
		const taskId = `taskTimer_test.md#${blockId}`;
		
		// Mock segments with known durations
		const state = manager.getTimerState(taskId)!;
		state.segments = [
			{ startTime: 1000, endTime: 2000, duration: 1000 },
			{ startTime: 3000, endTime: 4500, duration: 1500 },
			{ startTime: 5000 } // Current running segment
		];
		
		// Mock current time
		const originalNow = Date.now;
		Date.now = jest.fn(() => 6000);
		
		// Save state
		localStorage.setItem(taskId, JSON.stringify(state));
		
		// Get duration
		const duration = manager.getCurrentDuration(taskId);
		
		// Should be 1000 + 1500 + 1000 = 3500
		expect(duration).toBe(3500);
		
		// Restore Date.now
		Date.now = originalNow;
	});

	test("should migrate legacy format to segments", () => {
		const taskId = "taskTimer_test.md#legacy-123";
		
		// Store legacy format
		const legacyState = {
			taskId,
			filePath: "test.md",
			blockId: "legacy-123",
			startTime: 1000,
			pausedTime: 5000,
			totalPausedDuration: 1000,
			status: "paused",
			createdAt: 1000
		};
		
		localStorage.setItem(taskId, JSON.stringify(legacyState));
		
		// Get state (should trigger migration)
		const state = manager.getTimerState(taskId);
		
		expect(state).toBeTruthy();
		expect(state!.segments).toHaveLength(1);
		expect(state!.segments[0].startTime).toBe(2000); // startTime + totalPausedDuration
		expect(state!.segments[0].endTime).toBe(5000);
		expect(state!.segments[0].duration).toBe(3000);
		expect(state!.legacyStartTime).toBe(1000);
		expect(state!.legacyPausedTime).toBe(5000);
		expect(state!.legacyTotalPausedDuration).toBe(1000);
	});

	test("should handle multiple pause/resume cycles", () => {
		const blockId = manager.startTimer("test.md");
		const taskId = `taskTimer_test.md#${blockId}`;
		
		// Simulate multiple work sessions
		for (let i = 0; i < 3; i++) {
			manager.pauseTimer(taskId);
			manager.resumeTimer(taskId);
		}
		
		const state = manager.getTimerState(taskId);
		expect(state!.segments).toHaveLength(4); // Initial + 3 resume segments
		
		// First 3 segments should be closed
		for (let i = 0; i < 3; i++) {
			expect(state!.segments[i].endTime).toBeDefined();
			expect(state!.segments[i].duration).toBeDefined();
		}
		
		// Last segment should be open
		expect(state!.segments[3].endTime).toBeUndefined();
	});

	test("should get segment count correctly", () => {
		const blockId = manager.startTimer("test.md");
		const taskId = `taskTimer_test.md#${blockId}`;
		
		expect(manager.getSegmentCount(taskId)).toBe(1);
		
		manager.pauseTimer(taskId);
		manager.resumeTimer(taskId);
		
		expect(manager.getSegmentCount(taskId)).toBe(2);
	});

	test("should complete timer and calculate final duration", () => {
		// Mock time progression
		const originalNow = Date.now;
		let currentTime = 1000;
		Date.now = jest.fn(() => currentTime);
		
		// Start timer
		const blockId = manager.startTimer("test.md");
		const taskId = `taskTimer_test.md#${blockId}`;
		
		// Work for 5 seconds
		currentTime = 6000;
		
		// Complete timer
		const formattedDuration = manager.completeTimer(taskId);
		
		// Should format 5 seconds
		expect(formattedDuration).toContain("5");
		
		// Timer should be removed
		expect(manager.getTimerState(taskId)).toBeNull();
		
		// Restore Date.now
		Date.now = originalNow;
	});
});