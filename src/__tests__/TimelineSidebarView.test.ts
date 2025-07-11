import { Task } from '../types/task';
import { TimelineSidebarView } from '../components/timeline-sidebar/TimelineSidebarView';

// Mock translations first
jest.mock('../translations/helper', () => ({
	t: jest.fn((key: string) => key),
}));

// Mock all Obsidian dependencies
jest.mock('obsidian', () => {
	const actualMoment = jest.requireActual('moment');
	const mockMoment = jest.fn().mockImplementation((date?: any) => {
		return actualMoment(date);
	});
	// Add moment methods
	mockMoment.locale = jest.fn(() => 'en');
	mockMoment.format = actualMoment.format;
	
	return {
		ItemView: class MockItemView {
			constructor(leaf: any) {}
			getViewType() { return 'mock'; }
			getDisplayText() { return 'Mock'; }
			getIcon() { return 'mock'; }
		},
		moment: mockMoment,
		setIcon: jest.fn(),
		debounce: jest.fn((fn: any) => fn),
		Component: class MockComponent {},
		ButtonComponent: class MockButtonComponent {},
		Platform: {},
		TFile: class MockTFile {},
		AbstractInputSuggest: class MockAbstractInputSuggest {},
		App: class MockApp {},
		Modal: class MockModal {},
		Setting: class MockSetting {},
		PluginSettingTab: class MockPluginSettingTab {},
	};
});

// Mock other dependencies
jest.mock('../components/QuickCaptureModal', () => ({
	QuickCaptureModal: class MockQuickCaptureModal {},
}));

jest.mock('../editor-ext/markdownEditor', () => ({
	createEmbeddableMarkdownEditor: jest.fn(),
}));

jest.mock('../utils/fileUtils', () => ({
	saveCapture: jest.fn(),
}));

jest.mock('../components/task-view/details', () => ({
	createTaskCheckbox: jest.fn(),
}));

jest.mock('../components/MarkdownRenderer', () => ({
	MarkdownRendererComponent: class MockMarkdownRendererComponent {},
}));

const actualMoment = jest.requireActual('moment');
const moment = actualMoment;

// Mock plugin and dependencies
const mockPlugin = {
	taskManager: {
		getAllTasks: jest.fn(() => []),
		updateTask: jest.fn(),
	},
	settings: {
		timelineSidebar: {
			showCompletedTasks: true,
		},
		taskStatuses: {
			completed: 'x',
			notStarted: ' ',
		},
		quickCapture: {
			targetType: 'file',
			targetFile: 'test.md',
		},
	},
	app: {
		vault: {
			on: jest.fn(),
			getFileByPath: jest.fn(),
		},
		workspace: {
			on: jest.fn(),
			getLeavesOfType: jest.fn(() => []),
			getLeaf: jest.fn(),
			setActiveLeaf: jest.fn(),
		},
	},
};

const mockLeaf = {
	view: null,
};

describe('TimelineSidebarView Date Deduplication', () => {
	let timelineView: TimelineSidebarView;

	beforeEach(() => {
		jest.clearAllMocks();
		timelineView = new TimelineSidebarView(mockLeaf as any, mockPlugin as any);
	});

	// Helper function to create a mock task
	const createMockTask = (
		id: string,
		content: string,
		metadata: Partial<Task['metadata']> = {}
	): Task => ({
		id,
		content,
		filePath: 'test.md',
		line: 1,
		status: ' ',
		completed: false,
		metadata: {
			dueDate: undefined,
			scheduledDate: undefined,
			startDate: undefined,
			completedDate: undefined,
			tags: [],
			...metadata,
		},
	} as Task);

	describe('deduplicateDatesByPriority', () => {
		it('should return empty array for empty input', () => {
			const result = (timelineView as any).deduplicateDatesByPriority([]);
			expect(result).toEqual([]);
		});

		it('should return single date unchanged', () => {
			const dates = [{ date: new Date('2025-01-15'), type: 'due' }];
			const result = (timelineView as any).deduplicateDatesByPriority(dates);
			expect(result).toEqual(dates);
		});

		it('should keep different dates on different days', () => {
			const dates = [
				{ date: new Date('2025-01-15'), type: 'due' },
				{ date: new Date('2025-01-16'), type: 'scheduled' },
			];
			const result = (timelineView as any).deduplicateDatesByPriority(dates);
			expect(result).toHaveLength(2);
			expect(result).toEqual(expect.arrayContaining(dates));
		});

		it('should prioritize due over completed on same day', () => {
			const dates = [
				{ date: new Date('2025-01-15T10:00:00'), type: 'due' },
				{ date: new Date('2025-01-15T14:00:00'), type: 'completed' },
			];
			const result = (timelineView as any).deduplicateDatesByPriority(dates);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('due');
		});

		it('should prioritize due over scheduled on same day', () => {
			const dates = [
				{ date: new Date('2025-01-15T10:00:00'), type: 'scheduled' },
				{ date: new Date('2025-01-15T14:00:00'), type: 'due' },
			];
			const result = (timelineView as any).deduplicateDatesByPriority(dates);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('due');
		});

		it('should prioritize scheduled over start on same day', () => {
			const dates = [
				{ date: new Date('2025-01-15T10:00:00'), type: 'start' },
				{ date: new Date('2025-01-15T14:00:00'), type: 'scheduled' },
			];
			const result = (timelineView as any).deduplicateDatesByPriority(dates);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('scheduled');
		});

		it('should handle multiple date types with correct priority order', () => {
			const dates = [
				{ date: new Date('2025-01-15T08:00:00'), type: 'start' },
				{ date: new Date('2025-01-15T10:00:00'), type: 'scheduled' },
				{ date: new Date('2025-01-15T12:00:00'), type: 'due' },
				{ date: new Date('2025-01-15T16:00:00'), type: 'completed' },
			];
			const result = (timelineView as any).deduplicateDatesByPriority(dates);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('due');
		});

		it('should handle mixed same-day and different-day dates', () => {
			const dates = [
				{ date: new Date('2025-01-15T10:00:00'), type: 'due' },
				{ date: new Date('2025-01-15T14:00:00'), type: 'completed' },
				{ date: new Date('2025-01-16T10:00:00'), type: 'scheduled' },
				{ date: new Date('2025-01-17T10:00:00'), type: 'start' },
			];
			const result = (timelineView as any).deduplicateDatesByPriority(dates);
			expect(result).toHaveLength(3);
			
			const jan15Result = result.find((d: any) => moment(d.date).format('YYYY-MM-DD') === '2025-01-15');
			const jan16Result = result.find((d: any) => moment(d.date).format('YYYY-MM-DD') === '2025-01-16');
			const jan17Result = result.find((d: any) => moment(d.date).format('YYYY-MM-DD') === '2025-01-17');
			
			expect(jan15Result?.type).toBe('due');
			expect(jan16Result?.type).toBe('scheduled');
			expect(jan17Result?.type).toBe('start');
		});
	});

	describe('extractDatesFromTask', () => {
		it('should return empty array for task with no dates', () => {
			const task = createMockTask('test-1', 'Test task');
			const result = (timelineView as any).extractDatesFromTask(task);
			expect(result).toEqual([]);
		});

		it('should return single date for task with one date type', () => {
			const dueDate = new Date('2025-01-15').getTime();
			const task = createMockTask('test-1', 'Test task', { dueDate });
			const result = (timelineView as any).extractDatesFromTask(task);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('due');
		});

		// New tests for task-level deduplication
		describe('completed task behavior', () => {
			it('should return due date for completed task with due date', () => {
				const task = createMockTask('test-1', 'Test task', {
					dueDate: new Date('2025-01-15T10:00:00').getTime(),
					completedDate: new Date('2025-01-16T16:00:00').getTime(),
				});
				task.completed = true;
				const result = (timelineView as any).extractDatesFromTask(task);
				expect(result).toHaveLength(1);
				expect(result[0].type).toBe('due');
			});

			it('should return completed date for completed task without due date', () => {
				const task = createMockTask('test-1', 'Test task', {
					scheduledDate: new Date('2025-01-14T10:00:00').getTime(),
					completedDate: new Date('2025-01-16T16:00:00').getTime(),
				});
				task.completed = true;
				const result = (timelineView as any).extractDatesFromTask(task);
				expect(result).toHaveLength(1);
				expect(result[0].type).toBe('completed');
			});

			it('should always return due date for completed task regardless of other dates', () => {
				const task = createMockTask('test-1', 'Test task', {
					startDate: new Date('2025-01-13T08:00:00').getTime(),
					scheduledDate: new Date('2025-01-14T10:00:00').getTime(),
					dueDate: new Date('2025-01-15T12:00:00').getTime(),
					completedDate: new Date('2025-01-16T16:00:00').getTime(),
				});
				task.completed = true;
				const result = (timelineView as any).extractDatesFromTask(task);
				expect(result).toHaveLength(1);
				expect(result[0].type).toBe('due');
			});
		});

		describe('non-completed task behavior', () => {
			it('should return highest priority date for non-completed task with multiple dates', () => {
				const task = createMockTask('test-1', 'Test task', {
					startDate: new Date('2025-01-13T08:00:00').getTime(),
					scheduledDate: new Date('2025-01-14T10:00:00').getTime(),
					dueDate: new Date('2025-01-15T12:00:00').getTime(),
				});
				const result = (timelineView as any).extractDatesFromTask(task);
				expect(result).toHaveLength(1);
				expect(result[0].type).toBe('due');
			});

			it('should return scheduled date when no due date exists', () => {
				const task = createMockTask('test-1', 'Test task', {
					startDate: new Date('2025-01-13T08:00:00').getTime(),
					scheduledDate: new Date('2025-01-14T10:00:00').getTime(),
				});
				const result = (timelineView as any).extractDatesFromTask(task);
				expect(result).toHaveLength(1);
				expect(result[0].type).toBe('scheduled');
			});

			it('should return start date when only start date exists', () => {
				const task = createMockTask('test-1', 'Test task', {
					startDate: new Date('2025-01-13T08:00:00').getTime(),
				});
				const result = (timelineView as any).extractDatesFromTask(task);
				expect(result).toHaveLength(1);
				expect(result[0].type).toBe('start');
			});
		});
	});
});