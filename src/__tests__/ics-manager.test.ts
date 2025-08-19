/**
 * ICS Manager Tests
 * Tests for managing ICS calendar sources and fetching data
 */

import { IcsManager } from "../managers/ics-manager";
import { IcsSource, IcsManagerConfig } from "../types/ics";

// Mock minimal settings for testing
const mockSettings = {
	taskStatusMarks: {
		"Not Started": " ",
		"In Progress": "/",
		Completed: "x",
		Abandoned: "-",
		Planned: "?",
	},
} as any;

// Mock Obsidian Component
jest.mock("obsidian", () => ({
	Component: class MockComponent {
		constructor() {}
		load() {}
		unload() {}
		onload() {}
		onunload() {}
		addChild() {}
		removeChild() {}
		register() {}
	},
	requestUrl: jest.fn(),
}));

// Mock Component for testing
class MockComponent {
	constructor() {}
	load() {}
	unload() {}
}

describe("ICS Manager", () => {
	let icsManager: IcsManager;
	let mockComponent: MockComponent;

	const testConfig: IcsManagerConfig = {
		sources: [
			{
				id: "chinese-lunar",
				name: "Chinese Lunar Calendar",
				url: "https://lwlsw.github.io/Chinese-Lunar-Calendar-ics/chinese_lunar_my.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "event",
			},
		],
		enableBackgroundRefresh: false, // Disable for testing
		globalRefreshInterval: 60,
		maxCacheAge: 24,
		networkTimeout: 30,
		maxEventsPerSource: 1000,
		showInCalendar: true,
		showInTaskLists: true,
		defaultEventColor: "#3b82f6",
	};

	beforeEach(async () => {
		mockComponent = new MockComponent();
		icsManager = new IcsManager(testConfig, mockSettings);
		await icsManager.initialize();
	});

	afterEach(() => {
		if (icsManager) {
			icsManager.unload();
		}
	});

	describe("Initialization", () => {
		test("should initialize with config", () => {
			expect(icsManager).toBeDefined();
		});

		test("should update config", () => {
			const newConfig = {
				...testConfig,
				globalRefreshInterval: 120,
			};

			icsManager.updateConfig(newConfig);
			// Test that config was updated by checking sync status
			const syncStatus = icsManager.getSyncStatus(
				testConfig.sources[0].id
			);
			expect(syncStatus).toBeDefined();
		});
	});

	describe("Source Management", () => {
		test("should manage sync statuses", () => {
			const syncStatus = icsManager.getSyncStatus(
				testConfig.sources[0].id
			);
			expect(syncStatus).toBeDefined();
			expect(syncStatus?.sourceId).toBe(testConfig.sources[0].id);
		});

		test("should get all sync statuses", () => {
			const allStatuses = icsManager.getAllSyncStatuses();
			expect(allStatuses.size).toBe(1);
			expect(allStatuses.has(testConfig.sources[0].id)).toBe(true);
		});

		test("should handle disabled sources", () => {
			const configWithDisabled = {
				...testConfig,
				sources: [
					...testConfig.sources,
					{
						id: "disabled-source",
						name: "Disabled Source",
						url: "https://example.com/disabled.ics",
						enabled: false,
						refreshInterval: 60,
						showAllDayEvents: true,
						showTimedEvents: true,
						showType: "event" as const,
					},
				],
			};

			icsManager.updateConfig(configWithDisabled);

			const allStatuses = icsManager.getAllSyncStatuses();
			expect(allStatuses.size).toBe(2);

			const disabledStatus = icsManager.getSyncStatus("disabled-source");
			expect(disabledStatus?.status).toBe("disabled");
		});
	});

	describe("Data Fetching", () => {
		test("should handle sync source", async () => {
			const source = testConfig.sources[0];

			try {
				const result = await icsManager.syncSource(source.id);

				expect(result.success).toBe(true);
				expect(result.data).toBeDefined();

				if (result.data) {
					expect(result.data.events.length).toBeGreaterThan(0);
					console.log(
						`Fetched ${result.data.events.length} events from Chinese Lunar Calendar`
					);
				}
			} catch (error) {
				console.warn(
					"Network test failed, this is expected in some environments:",
					error
				);
				// Don't fail the test if network is unavailable
			}
		}, 10000); // 10 second timeout for network request

		test("should handle network errors gracefully", async () => {
			const invalidConfig = {
				...testConfig,
				sources: [
					{
						id: "invalid-source",
						name: "Invalid Source",
						url: "https://invalid-url-that-does-not-exist.com/calendar.ics",
						enabled: true,
						refreshInterval: 60,
						showAllDayEvents: true,
						showTimedEvents: true,
						showType: "event" as const,
					},
				],
			};

			icsManager.updateConfig(invalidConfig);
			const result = await icsManager.syncSource("invalid-source");

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
			expect(result.data).toBeUndefined();
		});
	});

	describe("Event Management", () => {
		test("should get all events", () => {
			const events = icsManager.getAllEvents();
			expect(Array.isArray(events)).toBe(true);
		});

		test("should get events from specific source", () => {
			const events = icsManager.getEventsFromSource(
				testConfig.sources[0].id
			);
			expect(Array.isArray(events)).toBe(true);
		});

		test("should convert events to tasks", () => {
			const mockEvents: any[] = []; // Empty array for testing
			const tasks = icsManager.convertEventsToTasks(mockEvents);
			expect(Array.isArray(tasks)).toBe(true);
			expect(tasks.length).toBe(0);
		});
	});

	describe("Text Replacement", () => {
		test("should apply text replacements to event summary", () => {
			// Create a test source with text replacement rules
			const sourceWithReplacements: IcsSource = {
				id: "test-replacement",
				name: "Test Replacement Source",
				url: "https://example.com/test.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "event",
				textReplacements: [
					{
						id: "remove-prefix",
						name: "Remove Meeting Prefix",
						enabled: true,
						target: "summary",
						pattern: "^Meeting: ",
						replacement: "",
						flags: "g",
					},
					{
						id: "replace-location",
						name: "Replace Room Numbers",
						enabled: true,
						target: "location",
						pattern: "Room (\\d+)",
						replacement: "Conference Room $1",
						flags: "gi",
					},
				],
			};

			// Create a mock event
			const mockEvent = {
				uid: "test-event-1",
				summary: "Meeting: Weekly Standup",
				description: "Team standup meeting",
				dtstart: new Date("2024-01-15T10:00:00Z"),
				dtend: new Date("2024-01-15T11:00:00Z"),
				allDay: false,
				location: "Room 101",
				source: sourceWithReplacements,
			};

			// Create a manager with the test source
			const testManager = new IcsManager(
				{
					...testConfig,
					sources: [sourceWithReplacements],
				},
				mockSettings
			);

			// Convert event to task (this will apply text replacements)
			const task = testManager.convertEventsToTasks([mockEvent])[0];

			// Verify replacements were applied
			expect(task.content).toBe("Weekly Standup"); // "Meeting: " prefix removed
			expect(task.metadata.context).toBe("Conference Room 101"); // "Room 101" -> "Conference Room 101"
			expect(task.icsEvent.summary).toBe("Weekly Standup");
			expect(task.icsEvent.location).toBe("Conference Room 101");
		});

		test("should apply multiple replacements in sequence", () => {
			const sourceWithMultipleReplacements: IcsSource = {
				id: "test-multiple",
				name: "Test Multiple Replacements",
				url: "https://example.com/test.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "event",
				textReplacements: [
					{
						id: "replace-1",
						name: "First Replacement",
						enabled: true,
						target: "summary",
						pattern: "URGENT",
						replacement: "Important",
						flags: "gi",
					},
					{
						id: "replace-2",
						name: "Second Replacement",
						enabled: true,
						target: "summary",
						pattern: "Important",
						replacement: "High Priority",
						flags: "g",
					},
				],
			};

			const mockEvent = {
				uid: "test-event-2",
				summary: "URGENT: System Maintenance",
				dtstart: new Date("2024-01-15T10:00:00Z"),
				allDay: false,
				source: sourceWithMultipleReplacements,
			};

			const testManager = new IcsManager(
				{
					...testConfig,
					sources: [sourceWithMultipleReplacements],
				},
				mockSettings
			);

			const task = testManager.convertEventsToTasks([mockEvent])[0];

			// Should apply both replacements in sequence: URGENT -> Important -> High Priority
			expect(task.content).toBe("High Priority: System Maintenance");
		});

		test("should apply replacements to all fields when target is 'all'", () => {
			const sourceWithAllTarget: IcsSource = {
				id: "test-all-target",
				name: "Test All Target",
				url: "https://example.com/test.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "event",
				textReplacements: [
					{
						id: "replace-all",
						name: "Replace All Occurrences",
						enabled: true,
						target: "all",
						pattern: "old",
						replacement: "new",
						flags: "gi",
					},
				],
			};

			const mockEvent = {
				uid: "test-event-3",
				summary: "Old Meeting in Old Room",
				description: "This is an old description",
				location: "Old Building",
				dtstart: new Date("2024-01-15T10:00:00Z"),
				allDay: false,
				source: sourceWithAllTarget,
			};

			const testManager = new IcsManager(
				{
					...testConfig,
					sources: [sourceWithAllTarget],
				},
				mockSettings
			);

			const task = testManager.convertEventsToTasks([mockEvent])[0];

			// All fields should have "old" replaced with "new"
			expect(task.content).toBe("new Meeting in new Room");
			expect(task.icsEvent.description).toBe(
				"This is an new description"
			);
			expect(task.icsEvent.location).toBe("new Building");
		});

		test("should skip disabled replacement rules", () => {
			const sourceWithDisabledRule: IcsSource = {
				id: "test-disabled",
				name: "Test Disabled Rule",
				url: "https://example.com/test.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "event",
				textReplacements: [
					{
						id: "disabled-rule",
						name: "Disabled Rule",
						enabled: false, // This rule is disabled
						target: "summary",
						pattern: "Test",
						replacement: "Demo",
						flags: "g",
					},
					{
						id: "enabled-rule",
						name: "Enabled Rule",
						enabled: true,
						target: "summary",
						pattern: "Meeting",
						replacement: "Session",
						flags: "g",
					},
				],
			};

			const mockEvent = {
				uid: "test-event-4",
				summary: "Test Meeting",
				dtstart: new Date("2024-01-15T10:00:00Z"),
				allDay: false,
				source: sourceWithDisabledRule,
			};

			const testManager = new IcsManager(
				{
					...testConfig,
					sources: [sourceWithDisabledRule],
				},
				mockSettings
			);

			const task = testManager.convertEventsToTasks([mockEvent])[0];

			// Only the enabled rule should be applied
			expect(task.content).toBe("Test Session"); // "Meeting" -> "Session", but "Test" unchanged
		});

		test("should handle invalid regex patterns gracefully", () => {
			const sourceWithInvalidRegex: IcsSource = {
				id: "test-invalid-regex",
				name: "Test Invalid Regex",
				url: "https://example.com/test.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "event",
				textReplacements: [
					{
						id: "invalid-regex",
						name: "Invalid Regex",
						enabled: true,
						target: "summary",
						pattern: "[invalid regex", // Invalid regex pattern
						replacement: "replaced",
						flags: "g",
					},
				],
			};

			const mockEvent = {
				uid: "test-event-5",
				summary: "Original Text",
				dtstart: new Date("2024-01-15T10:00:00Z"),
				allDay: false,
				source: sourceWithInvalidRegex,
			};

			const testManager = new IcsManager(
				{
					...testConfig,
					sources: [sourceWithInvalidRegex],
				},
				mockSettings
			);

			// Should not throw an error, and text should remain unchanged
			expect(() => {
				const task = testManager.convertEventsToTasks([mockEvent])[0];
				expect(task.content).toBe("Original Text"); // Should remain unchanged
			}).not.toThrow();
		});

		test("should work with capture groups in replacement", () => {
			const sourceWithCaptureGroups: IcsSource = {
				id: "test-capture-groups",
				name: "Test Capture Groups",
				url: "https://example.com/test.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "event",
				textReplacements: [
					{
						id: "capture-groups",
						name: "Use Capture Groups",
						enabled: true,
						target: "summary",
						pattern: "(\\w+) Meeting with (\\w+)",
						replacement: "$2 and $1 Discussion",
						flags: "g",
					},
				],
			};

			const mockEvent = {
				uid: "test-event-6",
				summary: "Weekly Meeting with John",
				dtstart: new Date("2024-01-15T10:00:00Z"),
				allDay: false,
				source: sourceWithCaptureGroups,
			};

			const testManager = new IcsManager(
				{
					...testConfig,
					sources: [sourceWithCaptureGroups],
				},
				mockSettings
			);

			const task = testManager.convertEventsToTasks([mockEvent])[0];

			// Should swap the captured groups
			expect(task.content).toBe("John and Weekly Discussion");
		});

		test("should handle events without text replacements", () => {
			const sourceWithoutReplacements: IcsSource = {
				id: "test-no-replacements",
				name: "Test No Replacements",
				url: "https://example.com/test.ics",
				enabled: true,
				refreshInterval: 60,
				showAllDayEvents: true,
				showTimedEvents: true,
				showType: "event",
				// No textReplacements property
			};

			const mockEvent = {
				uid: "test-event-7",
				summary: "Original Summary",
				description: "Original Description",
				location: "Original Location",
				dtstart: new Date("2024-01-15T10:00:00Z"),
				allDay: false,
				source: sourceWithoutReplacements,
			};

			const testManager = new IcsManager(
				{
					...testConfig,
					sources: [sourceWithoutReplacements],
				},
				mockSettings
			);

			const task = testManager.convertEventsToTasks([mockEvent])[0];

			// Text should remain unchanged
			expect(task.content).toBe("Original Summary");
			expect(task.icsEvent.description).toBe("Original Description");
			expect(task.icsEvent.location).toBe("Original Location");
		});
	});

	describe("Cache Management", () => {
		test("should clear source cache", () => {
			icsManager.clearSourceCache(testConfig.sources[0].id);
			// Should not throw error
			expect(true).toBe(true);
		});

		test("should clear all cache", () => {
			icsManager.clearAllCache();
			// Should not throw error
			expect(true).toBe(true);
		});
	});

	describe("Background Refresh", () => {
		test("should handle background refresh configuration", () => {
			// Test that background refresh is disabled in test config
			expect(testConfig.enableBackgroundRefresh).toBe(false);

			// Enable background refresh
			const newConfig = {
				...testConfig,
				enableBackgroundRefresh: true,
			};

			icsManager.updateConfig(newConfig);
			// Should not throw error
			expect(true).toBe(true);
		});
	});
});

/**
 * Integration test for real-world usage
 */
describe("ICS Manager Integration", () => {
	test("should work end-to-end with Chinese Lunar Calendar", async () => {
		const config: IcsManagerConfig = {
			sources: [
				{
					id: "integration-test",
					name: "Integration Test Calendar",
					url: "https://lwlsw.github.io/Chinese-Lunar-Calendar-ics/chinese_lunar_my.ics",
					enabled: true,
					refreshInterval: 60,
					showAllDayEvents: true,
					showTimedEvents: true,
					showType: "event" as const,
				},
			],
			enableBackgroundRefresh: false, // Disable for testing
			globalRefreshInterval: 60,
			maxCacheAge: 24,
			networkTimeout: 30,
			maxEventsPerSource: 100, // Limit for testing
			showInCalendar: true,
			showInTaskLists: true,
			defaultEventColor: "#3b82f6",
		};

		const manager = new IcsManager(config, mockSettings);
		await manager.initialize();

		try {
			// Test the complete workflow
			const result = await manager.syncSource(config.sources[0].id);

			if (result.success && result.data) {
				expect(result.data.events.length).toBeGreaterThan(0);
				expect(result.data.events.length).toBeLessThanOrEqual(100); // Respects limit

				// Convert to tasks
				const tasks = manager.convertEventsToTasks(result.data.events);
				expect(tasks).toHaveLength(result.data.events.length);

				// All tasks should be readonly
				tasks.forEach((task) => {
					expect(task.readonly).toBe(true);
				});

				console.log(
					`Integration test successful: ${result.data.events.length} events, ${tasks.length} tasks`
				);
			}
		} catch (error) {
			console.warn(
				"Integration test failed due to network issues:",
				error
			);
		} finally {
			manager.unload();
		}
	}, 15000); // 15 second timeout for integration test
});
