import { Task, StandardTaskMetadata, EnhancedStandardTaskMetadata, EnhancedTask } from "../types/task";
import { TimeComponent } from "../types/time-parsing";
import { 
	enhanceTaskMetadata, 
	extractTimeComponentsFromMetadata, 
	hasTimeComponents,
	validateTimeComponent
} from "../utils/task-metadata-utils";

/**
 * Service for migrating tasks to enhanced metadata format
 * Handles automatic migration when tasks are accessed or updated
 */
export class TaskMigrationService {
	private migrationCache = new Map<string, boolean>();
	private migrationInProgress = new Set<string>();

	/**
	 * Migrate a standard task to enhanced format
	 * @param task - Standard task to migrate
	 * @param preserveOriginal - Whether to preserve original timestamps
	 * @returns Enhanced task with time components
	 */
	public migrateTaskToEnhanced(
		task: Task<StandardTaskMetadata>, 
		preserveOriginal: boolean = true
	): EnhancedTask {
		// Check if already migrated
		if (this.isAlreadyMigrated(task)) {
			return task as EnhancedTask;
		}

		// Mark migration in progress to prevent circular calls
		const taskKey = this.getTaskKey(task);
		if (this.migrationInProgress.has(taskKey)) {
			return task as EnhancedTask;
		}

		this.migrationInProgress.add(taskKey);

		try {
			// Extract time components from existing timestamps
			const extractedTimeComponents = extractTimeComponentsFromMetadata(task.metadata);
			
			// Only add time components if they contain meaningful time information
			// (not just 00:00:00 which indicates date-only)
			const meaningfulTimeComponents = this.filterMeaningfulTimeComponents(extractedTimeComponents);
			
			// Create enhanced metadata
			const enhancedMetadata = enhanceTaskMetadata(
				task.metadata,
				Object.keys(meaningfulTimeComponents).length > 0 ? meaningfulTimeComponents : undefined
			);

			// Create enhanced task
			const enhancedTask: EnhancedTask = {
				...task,
				metadata: enhancedMetadata
			};

			// Mark as migrated
			this.migrationCache.set(taskKey, true);

			return enhancedTask;
		} finally {
			this.migrationInProgress.delete(taskKey);
		}
	}

	/**
	 * Migrate multiple tasks in batch
	 * @param tasks - Array of tasks to migrate
	 * @returns Array of enhanced tasks
	 */
	public migrateBatch(tasks: Task<StandardTaskMetadata>[]): EnhancedTask[] {
		return tasks.map(task => this.migrateTaskToEnhanced(task));
	}

	/**
	 * Check if a task needs migration
	 * @param task - Task to check
	 * @returns True if migration is needed
	 */
	public needsMigration(task: Task<StandardTaskMetadata>): boolean {
		return !this.isAlreadyMigrated(task);
	}

	/**
	 * Migrate task only if it has meaningful time information
	 * @param task - Task to conditionally migrate
	 * @returns Enhanced task if migration occurred, original task otherwise
	 */
	public migrateIfNeeded(task: Task<StandardTaskMetadata>): Task<StandardTaskMetadata> | EnhancedTask {
		if (!this.needsMigration(task)) {
			return task;
		}

		// Check if task has meaningful time information
		const extractedTimeComponents = extractTimeComponentsFromMetadata(task.metadata);
		const meaningfulTimeComponents = this.filterMeaningfulTimeComponents(extractedTimeComponents);

		if (Object.keys(meaningfulTimeComponents).length === 0) {
			// No meaningful time information, return original task
			return task;
		}

		return this.migrateTaskToEnhanced(task);
	}

	/**
	 * Clear migration cache (useful for testing or when task structure changes)
	 */
	public clearCache(): void {
		this.migrationCache.clear();
		this.migrationInProgress.clear();
	}

	/**
	 * Get migration statistics
	 * @returns Object with migration stats
	 */
	public getStats(): { migratedCount: number; inProgressCount: number } {
		return {
			migratedCount: this.migrationCache.size,
			inProgressCount: this.migrationInProgress.size
		};
	}

	/**
	 * Validate that a migrated task maintains data integrity
	 * @param originalTask - Original task before migration
	 * @param migratedTask - Task after migration
	 * @returns True if migration preserved all data
	 */
	public validateMigration(
		originalTask: Task<StandardTaskMetadata>, 
		migratedTask: EnhancedTask
	): boolean {
		// Check that all base task properties are preserved
		if (
			originalTask.id !== migratedTask.id ||
			originalTask.content !== migratedTask.content ||
			originalTask.filePath !== migratedTask.filePath ||
			originalTask.line !== migratedTask.line ||
			originalTask.completed !== migratedTask.completed ||
			originalTask.status !== migratedTask.status ||
			originalTask.originalMarkdown !== migratedTask.originalMarkdown
		) {
			return false;
		}

		// Check that all original metadata is preserved
		const originalMeta = originalTask.metadata;
		const migratedMeta = migratedTask.metadata;

		const metadataKeys: (keyof StandardTaskMetadata)[] = [
			'createdDate', 'startDate', 'scheduledDate', 'dueDate', 'completedDate',
			'cancelledDate', 'recurrence', 'onCompletion', 'dependsOn', 'id',
			'tags', 'project', 'context', 'area', 'priority', 'parent', 'children',
			'estimatedTime', 'actualTime', 'useAsDateType', 'heading', 'tgProject'
		];

		for (const key of metadataKeys) {
			if (JSON.stringify(originalMeta[key]) !== JSON.stringify(migratedMeta[key])) {
				return false;
			}
		}

		// Validate time components if they exist
		if (hasTimeComponents(migratedMeta)) {
			const timeComponents = migratedMeta.timeComponents!;
			for (const [key, component] of Object.entries(timeComponents)) {
				if (component && !validateTimeComponent(component as TimeComponent)) {
					return false;
				}
			}
		}

		return true;
	}

	/**
	 * Rollback a task from enhanced to standard format
	 * @param enhancedTask - Enhanced task to rollback
	 * @returns Standard task
	 */
	public rollbackTask(enhancedTask: EnhancedTask): Task<StandardTaskMetadata> {
		const { timeComponents, enhancedDates, ...standardMetadata } = enhancedTask.metadata;
		
		const standardTask: Task<StandardTaskMetadata> = {
			...enhancedTask,
			metadata: standardMetadata
		};

		// Remove from migration cache
		const taskKey = this.getTaskKey(enhancedTask);
		this.migrationCache.delete(taskKey);

		return standardTask;
	}

	/**
	 * Check if task is already migrated (has enhanced metadata)
	 */
	private isAlreadyMigrated(task: Task<StandardTaskMetadata>): boolean {
		// Check if task already has enhanced metadata
		const hasEnhanced = 'timeComponents' in task.metadata || 'enhancedDates' in task.metadata;
		return hasEnhanced;
	}

	/**
	 * Generate a unique key for a task for caching purposes
	 */
	private getTaskKey(task: Task<StandardTaskMetadata>): string {
		return `${task.filePath}:${task.line}:${task.id || task.content.substring(0, 50)}`;
	}

	/**
	 * Filter out time components that are just 00:00:00 (date-only timestamps)
	 */
	private filterMeaningfulTimeComponents(
		timeComponents: NonNullable<EnhancedStandardTaskMetadata['timeComponents']>
	): NonNullable<EnhancedStandardTaskMetadata['timeComponents']> {
		const meaningful: NonNullable<EnhancedStandardTaskMetadata['timeComponents']> = {};

		for (const [key, component] of Object.entries(timeComponents)) {
			if (component && this.isMeaningfulTime(component)) {
				meaningful[key as keyof typeof timeComponents] = component;
			}
		}

		return meaningful;
	}

	/**
	 * Check if a time component represents meaningful time (not just 00:00:00)
	 */
	private isMeaningfulTime(timeComponent: TimeComponent): boolean {
		return !(
			timeComponent.hour === 0 && 
			timeComponent.minute === 0 && 
			(timeComponent.second === undefined || timeComponent.second === 0)
		);
	}
}

// Export singleton instance
export const taskMigrationService = new TaskMigrationService();