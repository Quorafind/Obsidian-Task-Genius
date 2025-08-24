import { TaskMigrationService } from '../services/task-migration-service';
import { Task, StandardTaskMetadata, EnhancedTask } from '../types/task';
import { createTimeComponent } from '../utils/task-metadata-utils';

describe('TaskMigrationService', () => {
	let migrationService: TaskMigrationService;

	beforeEach(() => {
		migrationService = new TaskMigrationService();
		migrationService.clearCache();
	});

	describe('migrateTaskToEnhanced', () => {
		it('should migrate task with meaningful time information', () => {
			const task: Task<StandardTaskMetadata> = {
				id: 'test-1',
				content: 'Meeting with team',
				filePath: '/test/file.md',
				line: 1,
				completed: false,
				status: '[ ]',
				originalMarkdown: '- [ ] Meeting with team',
				metadata: {
					startDate: new Date(2023, 0, 1, 9, 30, 0).getTime(), // 9:30 AM
					dueDate: new Date(2023, 0, 1, 17, 0, 0).getTime(), // 5:00 PM
					tags: ['work'],
					children: [],
					priority: 1
				}
			};

			const result = migrationService.migrateTaskToEnhanced(task);

			expect(result.id).toBe(task.id);
			expect(result.content).toBe(task.content);
			expect(result.metadata.startDate).toBe(task.metadata.startDate);
			expect(result.metadata.dueDate).toBe(task.metadata.dueDate);
			expect(result.metadata.tags).toEqual(['work']);
			expect(result.metadata.priority).toBe(1);

			// Should have time components
			expect(result.metadata.timeComponents).toBeDefined();
			expect(result.metadata.timeComponents?.startTime?.hour).toBe(9);
			expect(result.metadata.timeComponents?.startTime?.minute).toBe(30);
			expect(result.metadata.timeComponents?.dueTime?.hour).toBe(17);
			expect(result.metadata.timeComponents?.dueTime?.minute).toBe(0);

			// Should have enhanced dates
			expect(result.metadata.enhancedDates).toBeDefined();
			expect(result.metadata.enhancedDates?.startDateTime).toEqual(new Date(2023, 0, 1, 9, 30, 0));
			expect(result.metadata.enhancedDates?.dueDateTime).toEqual(new Date(2023, 0, 1, 17, 0, 0));
		});

		it('should not add time components for date-only timestamps (00:00:00)', () => {
			const task: Task<StandardTaskMetadata> = {
				id: 'test-2',
				content: 'Task with date only',
				filePath: '/test/file.md',
				line: 2,
				completed: false,
				status: '[ ]',
				originalMarkdown: '- [ ] Task with date only',
				metadata: {
					startDate: new Date(2023, 0, 1, 0, 0, 0).getTime(), // Midnight (date-only)
					dueDate: new Date(2023, 0, 2, 0, 0, 0).getTime(), // Midnight (date-only)
					tags: [],
					children: []
				}
			};

			const result = migrationService.migrateTaskToEnhanced(task);

			expect(result.metadata.timeComponents).toBeUndefined();
			expect(result.metadata.enhancedDates).toBeUndefined();
		});

		it('should handle tasks without any dates', () => {
			const task: Task<StandardTaskMetadata> = {
				id: 'test-3',
				content: 'Simple task',
				filePath: '/test/file.md',
				line: 3,
				completed: false,
				status: '[ ]',
				originalMarkdown: '- [ ] Simple task',
				metadata: {
					tags: ['personal'],
					children: []
				}
			};

			const result = migrationService.migrateTaskToEnhanced(task);

			expect(result.metadata.tags).toEqual(['personal']);
			expect(result.metadata.timeComponents).toBeUndefined();
			expect(result.metadata.enhancedDates).toBeUndefined();
		});

		it('should handle already enhanced tasks correctly', () => {
			const task: Task<StandardTaskMetadata> = {
				id: 'test-4',
				content: 'Meeting',
				filePath: '/test/file.md',
				line: 4,
				completed: false,
				status: '[ ]',
				originalMarkdown: '- [ ] Meeting',
				metadata: {
					startDate: new Date(2023, 0, 1, 14, 30, 0).getTime(),
					tags: [],
					children: []
				}
			};

			const result1 = migrationService.migrateTaskToEnhanced(task);
			
			// Try to migrate the already enhanced task
			const result2 = migrationService.migrateTaskToEnhanced(result1 as any);

			// Should return the same enhanced task without double-enhancement
			expect(result2.metadata.timeComponents?.startTime?.hour).toBe(14);
			expect(result2.metadata.timeComponents?.startTime?.minute).toBe(30);
			expect(result2).toBe(result1); // Should return the same object for already enhanced tasks
		});
	});

	describe('migrateBatch', () => {
		it('should migrate multiple tasks', () => {
			const tasks: Task<StandardTaskMetadata>[] = [
				{
					id: 'batch-1',
					content: 'Task 1',
					filePath: '/test/file.md',
					line: 1,
					completed: false,
					status: '[ ]',
					originalMarkdown: '- [ ] Task 1',
					metadata: {
						startDate: new Date(2023, 0, 1, 9, 0, 0).getTime(),
						tags: [],
						children: []
					}
				},
				{
					id: 'batch-2',
					content: 'Task 2',
					filePath: '/test/file.md',
					line: 2,
					completed: false,
					status: '[ ]',
					originalMarkdown: '- [ ] Task 2',
					metadata: {
						dueDate: new Date(2023, 0, 2, 17, 30, 0).getTime(),
						tags: [],
						children: []
					}
				}
			];

			const results = migrationService.migrateBatch(tasks);

			expect(results).toHaveLength(2);
			expect(results[0].metadata.timeComponents?.startTime?.hour).toBe(9);
			expect(results[1].metadata.timeComponents?.dueTime?.hour).toBe(17);
			expect(results[1].metadata.timeComponents?.dueTime?.minute).toBe(30);
		});
	});

	describe('needsMigration', () => {
		it('should return true for tasks without enhanced metadata', () => {
			const task: Task<StandardTaskMetadata> = {
				id: 'needs-migration',
				content: 'Task',
				filePath: '/test/file.md',
				line: 1,
				completed: false,
				status: '[ ]',
				originalMarkdown: '- [ ] Task',
				metadata: {
					tags: [],
					children: []
				}
			};

			expect(migrationService.needsMigration(task)).toBe(true);
		});

		it('should return false for already enhanced tasks', () => {
			const enhancedTask: EnhancedTask = {
				id: 'enhanced',
				content: 'Enhanced task',
				filePath: '/test/file.md',
				line: 1,
				completed: false,
				status: '[ ]',
				originalMarkdown: '- [ ] Enhanced task',
				metadata: {
					tags: [],
					children: [],
					timeComponents: {
						startTime: createTimeComponent(9, 0)
					}
				}
			};

			expect(migrationService.needsMigration(enhancedTask as any)).toBe(false);
		});
	});

	describe('migrateIfNeeded', () => {
		it('should migrate task with meaningful time information', () => {
			const task: Task<StandardTaskMetadata> = {
				id: 'conditional-1',
				content: 'Meeting',
				filePath: '/test/file.md',
				line: 1,
				completed: false,
				status: '[ ]',
				originalMarkdown: '- [ ] Meeting',
				metadata: {
					startDate: new Date(2023, 0, 1, 14, 30, 0).getTime(),
					tags: [],
					children: []
				}
			};

			const result = migrationService.migrateIfNeeded(task);

			expect('timeComponents' in result.metadata).toBe(true);
		});

		it('should not migrate task without meaningful time information', () => {
			const task: Task<StandardTaskMetadata> = {
				id: 'conditional-2',
				content: 'Simple task',
				filePath: '/test/file.md',
				line: 2,
				completed: false,
				status: '[ ]',
				originalMarkdown: '- [ ] Simple task',
				metadata: {
					startDate: new Date(2023, 0, 1, 0, 0, 0).getTime(), // Midnight
					tags: [],
					children: []
				}
			};

			const result = migrationService.migrateIfNeeded(task);

			expect('timeComponents' in result.metadata).toBe(false);
			expect(result).toBe(task); // Should return original task
		});
	});

	describe('validateMigration', () => {
		it('should validate successful migration', () => {
			const originalTask: Task<StandardTaskMetadata> = {
				id: 'validate-1',
				content: 'Meeting',
				filePath: '/test/file.md',
				line: 1,
				completed: false,
				status: '[ ]',
				originalMarkdown: '- [ ] Meeting',
				metadata: {
					startDate: new Date(2023, 0, 1, 9, 30, 0).getTime(),
					tags: ['work'],
					children: [],
					priority: 2
				}
			};

			const migratedTask = migrationService.migrateTaskToEnhanced(originalTask);
			const isValid = migrationService.validateMigration(originalTask, migratedTask);

			expect(isValid).toBe(true);
		});

		it('should detect invalid migration (corrupted data)', () => {
			const originalTask: Task<StandardTaskMetadata> = {
				id: 'validate-2',
				content: 'Meeting',
				filePath: '/test/file.md',
				line: 1,
				completed: false,
				status: '[ ]',
				originalMarkdown: '- [ ] Meeting',
				metadata: {
					tags: ['work'],
					children: []
				}
			};

			const corruptedTask: EnhancedTask = {
				...originalTask,
				content: 'Different content', // Corrupted
				metadata: {
					...originalTask.metadata,
					timeComponents: {
						startTime: createTimeComponent(9, 0)
					}
				}
			};

			const isValid = migrationService.validateMigration(originalTask, corruptedTask);

			expect(isValid).toBe(false);
		});
	});

	describe('rollbackTask', () => {
		it('should rollback enhanced task to standard format', () => {
			const enhancedTask: EnhancedTask = {
				id: 'rollback-1',
				content: 'Meeting',
				filePath: '/test/file.md',
				line: 1,
				completed: false,
				status: '[ ]',
				originalMarkdown: '- [ ] Meeting',
				metadata: {
					startDate: new Date(2023, 0, 1, 9, 30, 0).getTime(),
					tags: ['work'],
					children: [],
					timeComponents: {
						startTime: createTimeComponent(9, 30)
					},
					enhancedDates: {
						startDateTime: new Date(2023, 0, 1, 9, 30, 0)
					}
				}
			};

			const result = migrationService.rollbackTask(enhancedTask);

			expect(result.metadata.startDate).toBe(enhancedTask.metadata.startDate);
			expect(result.metadata.tags).toEqual(['work']);
			expect('timeComponents' in result.metadata).toBe(false);
			expect('enhancedDates' in result.metadata).toBe(false);
		});
	});

	describe('getStats', () => {
		it('should return migration statistics', () => {
			const task: Task<StandardTaskMetadata> = {
				id: 'stats-1',
				content: 'Meeting',
				filePath: '/test/file.md',
				line: 1,
				completed: false,
				status: '[ ]',
				originalMarkdown: '- [ ] Meeting',
				metadata: {
					startDate: new Date(2023, 0, 1, 9, 30, 0).getTime(),
					tags: [],
					children: []
				}
			};

			const initialStats = migrationService.getStats();
			expect(initialStats.migratedCount).toBe(0);

			migrationService.migrateTaskToEnhanced(task);

			const afterStats = migrationService.getStats();
			expect(afterStats.migratedCount).toBe(1);
		});
	});

	describe('clearCache', () => {
		it('should clear migration cache', () => {
			const task: Task<StandardTaskMetadata> = {
				id: 'cache-1',
				content: 'Meeting',
				filePath: '/test/file.md',
				line: 1,
				completed: false,
				status: '[ ]',
				originalMarkdown: '- [ ] Meeting',
				metadata: {
					startDate: new Date(2023, 0, 1, 9, 30, 0).getTime(),
					tags: [],
					children: []
				}
			};

			migrationService.migrateTaskToEnhanced(task);
			expect(migrationService.getStats().migratedCount).toBe(1);

			migrationService.clearCache();
			expect(migrationService.getStats().migratedCount).toBe(0);
		});
	});
});