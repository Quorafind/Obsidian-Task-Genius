import {
	timestampToTimeComponent,
	timeComponentToMilliseconds,
	combineDateAndTime,
	extractDatePortion,
	createEnhancedDates,
	enhanceTaskMetadata,
	extractTimeComponentsFromMetadata,
	downgradeToStandardMetadata,
	hasTimeComponents,
	validateTimeComponent,
	createTimeComponent
} from '../utils/task-metadata-utils';
import { TimeComponent } from '../types/time-parsing';
import { StandardTaskMetadata, EnhancedStandardTaskMetadata } from '../types/task';

describe('TaskMetadataUtils', () => {
	describe('timestampToTimeComponent', () => {
		it('should convert timestamp to time component correctly', () => {
			// 2023-01-01 14:30:45
			const timestamp = new Date(2023, 0, 1, 14, 30, 45).getTime();
			const result = timestampToTimeComponent(timestamp);

			expect(result.hour).toBe(14);
			expect(result.minute).toBe(30);
			expect(result.second).toBe(45);
			expect(result.originalText).toBe('14:30');
			expect(result.isRange).toBe(false);
		});

		it('should handle midnight correctly', () => {
			const timestamp = new Date(2023, 0, 1, 0, 0, 0).getTime();
			const result = timestampToTimeComponent(timestamp);

			expect(result.hour).toBe(0);
			expect(result.minute).toBe(0);
			expect(result.second).toBe(0);
			expect(result.originalText).toBe('00:00');
		});
	});

	describe('timeComponentToMilliseconds', () => {
		it('should convert time component to milliseconds correctly', () => {
			const timeComponent: TimeComponent = {
				hour: 14,
				minute: 30,
				second: 45,
				originalText: '14:30:45',
				isRange: false
			};

			const result = timeComponentToMilliseconds(timeComponent);
			const expected = (14 * 60 * 60 + 30 * 60 + 45) * 1000; // 52245000ms

			expect(result).toBe(expected);
		});

		it('should handle missing seconds', () => {
			const timeComponent: TimeComponent = {
				hour: 9,
				minute: 15,
				originalText: '09:15',
				isRange: false
			};

			const result = timeComponentToMilliseconds(timeComponent);
			const expected = (9 * 60 * 60 + 15 * 60) * 1000; // 33300000ms

			expect(result).toBe(expected);
		});
	});

	describe('combineDateAndTime', () => {
		it('should combine date and time correctly', () => {
			const dateTimestamp = new Date(2023, 0, 1, 10, 20, 30).getTime(); // Original time will be ignored
			const timeComponent: TimeComponent = {
				hour: 14,
				minute: 30,
				second: 45,
				originalText: '14:30:45',
				isRange: false
			};

			const result = combineDateAndTime(dateTimestamp, timeComponent);

			expect(result.getFullYear()).toBe(2023);
			expect(result.getMonth()).toBe(0);
			expect(result.getDate()).toBe(1);
			expect(result.getHours()).toBe(14);
			expect(result.getMinutes()).toBe(30);
			expect(result.getSeconds()).toBe(45);
		});

		it('should handle missing seconds in time component', () => {
			const dateTimestamp = new Date(2023, 5, 15).getTime();
			const timeComponent: TimeComponent = {
				hour: 9,
				minute: 15,
				originalText: '09:15',
				isRange: false
			};

			const result = combineDateAndTime(dateTimestamp, timeComponent);

			expect(result.getHours()).toBe(9);
			expect(result.getMinutes()).toBe(15);
			expect(result.getSeconds()).toBe(0);
		});
	});

	describe('extractDatePortion', () => {
		it('should extract date portion and reset time to 00:00:00', () => {
			const timestamp = new Date(2023, 0, 1, 14, 30, 45).getTime();
			const result = extractDatePortion(timestamp);

			expect(result.getFullYear()).toBe(2023);
			expect(result.getMonth()).toBe(0);
			expect(result.getDate()).toBe(1);
			expect(result.getHours()).toBe(0);
			expect(result.getMinutes()).toBe(0);
			expect(result.getSeconds()).toBe(0);
			expect(result.getMilliseconds()).toBe(0);
		});
	});

	describe('createEnhancedDates', () => {
		it('should create enhanced dates from metadata and time components', () => {
			const metadata: StandardTaskMetadata = {
				startDate: new Date(2023, 0, 1).getTime(),
				dueDate: new Date(2023, 0, 2).getTime(),
				scheduledDate: new Date(2023, 0, 3).getTime(),
				tags: [],
				children: []
			};

			const timeComponents = {
				startTime: createTimeComponent(9, 0),
				endTime: createTimeComponent(17, 0),
				dueTime: createTimeComponent(23, 59),
				scheduledTime: createTimeComponent(8, 30)
			};

			const result = createEnhancedDates(metadata, timeComponents);

			expect(result.startDateTime).toEqual(new Date(2023, 0, 1, 9, 0));
			expect(result.endDateTime).toEqual(new Date(2023, 0, 1, 17, 0)); // Uses start date
			expect(result.dueDateTime).toEqual(new Date(2023, 0, 2, 23, 59));
			expect(result.scheduledDateTime).toEqual(new Date(2023, 0, 3, 8, 30));
		});

		it('should handle missing dates gracefully', () => {
			const metadata: StandardTaskMetadata = {
				tags: [],
				children: []
			};

			const timeComponents = {
				startTime: createTimeComponent(9, 0),
				dueTime: createTimeComponent(17, 0)
			};

			const result = createEnhancedDates(metadata, timeComponents);

			expect(result.startDateTime).toBeUndefined();
			expect(result.dueDateTime).toBeUndefined();
		});
	});

	describe('enhanceTaskMetadata', () => {
		it('should enhance standard metadata with time components', () => {
			const metadata: StandardTaskMetadata = {
				startDate: new Date(2023, 0, 1).getTime(),
				dueDate: new Date(2023, 0, 2).getTime(),
				tags: ['work'],
				children: [],
				priority: 1
			};

			const timeComponents = {
				startTime: createTimeComponent(9, 0),
				dueTime: createTimeComponent(17, 0)
			};

			const result = enhanceTaskMetadata(metadata, timeComponents);

			expect(result.startDate).toBe(metadata.startDate);
			expect(result.dueDate).toBe(metadata.dueDate);
			expect(result.tags).toEqual(['work']);
			expect(result.priority).toBe(1);
			expect(result.timeComponents).toEqual(timeComponents);
			expect(result.enhancedDates?.startDateTime).toEqual(new Date(2023, 0, 1, 9, 0));
			expect(result.enhancedDates?.dueDateTime).toEqual(new Date(2023, 0, 2, 17, 0));
		});

		it('should work without time components', () => {
			const metadata: StandardTaskMetadata = {
				tags: ['personal'],
				children: []
			};

			const result = enhanceTaskMetadata(metadata);

			expect(result.tags).toEqual(['personal']);
			expect(result.timeComponents).toBeUndefined();
			expect(result.enhancedDates).toBeUndefined();
		});
	});

	describe('extractTimeComponentsFromMetadata', () => {
		it('should extract time components from existing timestamps', () => {
			const metadata: StandardTaskMetadata = {
				startDate: new Date(2023, 0, 1, 9, 30, 0).getTime(),
				dueDate: new Date(2023, 0, 2, 17, 45, 30).getTime(),
				scheduledDate: new Date(2023, 0, 3, 8, 15, 0).getTime(),
				tags: [],
				children: []
			};

			const result = extractTimeComponentsFromMetadata(metadata);

			expect(result.startTime?.hour).toBe(9);
			expect(result.startTime?.minute).toBe(30);
			expect(result.dueTime?.hour).toBe(17);
			expect(result.dueTime?.minute).toBe(45);
			expect(result.dueTime?.second).toBe(30);
			expect(result.scheduledTime?.hour).toBe(8);
			expect(result.scheduledTime?.minute).toBe(15);
		});

		it('should handle missing timestamps', () => {
			const metadata: StandardTaskMetadata = {
				tags: [],
				children: []
			};

			const result = extractTimeComponentsFromMetadata(metadata);

			expect(result.startTime).toBeUndefined();
			expect(result.dueTime).toBeUndefined();
			expect(result.scheduledTime).toBeUndefined();
		});
	});

	describe('downgradeToStandardMetadata', () => {
		it('should convert enhanced metadata back to standard format', () => {
			const enhanced: EnhancedStandardTaskMetadata = {
				tags: ['work'],
				children: [],
				priority: 2,
				timeComponents: {
					startTime: createTimeComponent(9, 0),
					dueTime: createTimeComponent(17, 0)
				},
				enhancedDates: {
					startDateTime: new Date(2023, 0, 1, 9, 0),
					dueDateTime: new Date(2023, 0, 2, 17, 0)
				}
			};

			const result = downgradeToStandardMetadata(enhanced);

			expect(result.tags).toEqual(['work']);
			expect(result.priority).toBe(2);
			expect(result.startDate).toBe(new Date(2023, 0, 1, 9, 0).getTime());
			expect(result.dueDate).toBe(new Date(2023, 0, 2, 17, 0).getTime());
			expect('timeComponents' in result).toBe(false);
			expect('enhancedDates' in result).toBe(false);
		});
	});

	describe('hasTimeComponents', () => {
		it('should return true when metadata has time components', () => {
			const metadata: EnhancedStandardTaskMetadata = {
				tags: [],
				children: [],
				timeComponents: {
					startTime: createTimeComponent(9, 0)
				}
			};

			expect(hasTimeComponents(metadata)).toBe(true);
		});

		it('should return false when metadata has no time components', () => {
			const metadata: EnhancedStandardTaskMetadata = {
				tags: [],
				children: []
			};

			expect(hasTimeComponents(metadata)).toBe(false);
		});

		it('should return false when timeComponents is empty', () => {
			const metadata: EnhancedStandardTaskMetadata = {
				tags: [],
				children: [],
				timeComponents: {}
			};

			expect(hasTimeComponents(metadata)).toBe(false);
		});
	});

	describe('validateTimeComponent', () => {
		it('should validate correct time components', () => {
			expect(validateTimeComponent(createTimeComponent(0, 0))).toBe(true);
			expect(validateTimeComponent(createTimeComponent(23, 59, 59))).toBe(true);
			expect(validateTimeComponent(createTimeComponent(12, 30))).toBe(true);
		});

		it('should reject invalid time components', () => {
			expect(validateTimeComponent({ hour: 24, minute: 0, originalText: '24:00', isRange: false })).toBe(false);
			expect(validateTimeComponent({ hour: 12, minute: 60, originalText: '12:60', isRange: false })).toBe(false);
			expect(validateTimeComponent({ hour: -1, minute: 30, originalText: '-1:30', isRange: false })).toBe(false);
			expect(validateTimeComponent({ hour: 12, minute: 30, second: 60, originalText: '12:30:60', isRange: false })).toBe(false);
		});
	});

	describe('createTimeComponent', () => {
		it('should create valid time components', () => {
			const result = createTimeComponent(14, 30, 45, '2:30:45 PM');

			expect(result.hour).toBe(14);
			expect(result.minute).toBe(30);
			expect(result.second).toBe(45);
			expect(result.originalText).toBe('2:30:45 PM');
			expect(result.isRange).toBe(false);
		});

		it('should generate original text when not provided', () => {
			const result = createTimeComponent(9, 5);

			expect(result.originalText).toBe('09:05');
		});

		it('should include seconds in generated text when provided', () => {
			const result = createTimeComponent(9, 5, 30);

			expect(result.originalText).toBe('09:05:30');
		});

		it('should throw error for invalid time values', () => {
			expect(() => createTimeComponent(25, 0)).toThrow('Invalid time component: 25:0');
			expect(() => createTimeComponent(12, 60)).toThrow('Invalid time component: 12:60');
			expect(() => createTimeComponent(12, 30, 60)).toThrow('Invalid time component: 12:30:60');
		});
	});
});