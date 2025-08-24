/**
 * Date Inheritance Augmentor for Dataflow System
 * 
 * This augmentor integrates with the dataflow system to efficiently resolve dates
 * for time-only expressions using the DateInheritanceService with optimized caching.
 */

import { App, TFile, Vault, MetadataCache } from "obsidian";
import { DateInheritanceService, DateResolutionContext, DateResolutionResult } from "../../services/date-inheritance-service";
import { TimeComponent } from "../../types/time-parsing";
import type { Task, EnhancedStandardTaskMetadata } from "../../types/task";

/**
 * Batch processing context for efficient date resolution
 */
export interface BatchDateResolutionContext {
	/** File path being processed */
	filePath: string;
	/** All tasks in the file for parent-child relationship analysis */
	allTasks: Task[];
	/** All lines in the file for context analysis */
	allLines: string[];
	/** File metadata cache shared across all tasks in the file */
	fileMetadataCache: Map<string, any>;
	/** Parent-child relationship map for efficient lookup */
	parentChildMap: Map<string, string>;
}

/**
 * Cached date resolution result
 */
interface CachedDateResolution {
	result: DateResolutionResult;
	timestamp: number;
	contextHash: string;
}

/**
 * Date inheritance augmentor that integrates with dataflow for efficient processing
 */
export class DateInheritanceAugmentor {
	private dateInheritanceService: DateInheritanceService;
	private resolutionCache = new Map<string, CachedDateResolution>();
	private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes
	private readonly MAX_CACHE_SIZE = 1000;

	constructor(
		app: App,
		vault: Vault,
		metadataCache: MetadataCache
	) {
		this.dateInheritanceService = new DateInheritanceService(app, vault, metadataCache);
	}

	/**
	 * Augment tasks with date inheritance for time-only expressions
	 * Optimized for batch processing within dataflow
	 */
	async augmentTasksWithDateInheritance(
		tasks: Task[],
		filePath: string,
		fileContent?: string
	): Promise<Task[]> {
		if (tasks.length === 0) {
			return tasks;
		}

		// Prepare batch context for efficient processing
		const batchContext = await this.prepareBatchContext(tasks, filePath, fileContent);
		
		// Process tasks in batch
		const augmentedTasks: Task[] = [];
		
		for (const task of tasks) {
			try {
				const augmentedTask = await this.augmentSingleTask(task, batchContext);
				augmentedTasks.push(augmentedTask);
			} catch (error) {
				console.warn(`[DateInheritanceAugmentor] Failed to augment task ${task.id}:`, error);
				// Return original task on error
				augmentedTasks.push(task);
			}
		}

		return augmentedTasks;
	}

	/**
	 * Prepare batch context for efficient processing
	 */
	private async prepareBatchContext(
		tasks: Task[],
		filePath: string,
		fileContent?: string
	): Promise<BatchDateResolutionContext> {
		// Parse file content into lines if provided
		const allLines = fileContent ? fileContent.split(/\r?\n/) : [];

		// Build parent-child relationship map
		const parentChildMap = new Map<string, string>();
		for (const task of tasks) {
			if (task.metadata.parent) {
				parentChildMap.set(task.id, task.metadata.parent);
			}
		}

		// Create shared file metadata cache
		const fileMetadataCache = new Map<string, any>();

		return {
			filePath,
			allTasks: tasks,
			allLines,
			fileMetadataCache,
			parentChildMap,
		};
	}

	/**
	 * Augment a single task with date inheritance
	 */
	private async augmentSingleTask(
		task: Task,
		batchContext: BatchDateResolutionContext
	): Promise<Task> {
		// Check if task has enhanced metadata with time components
		const enhancedMetadata = task.metadata as EnhancedStandardTaskMetadata;
		if (!enhancedMetadata.timeComponents) {
			return task; // No time components to process
		}

		// Check if we need date inheritance (time-only expressions)
		const needsDateInheritance = this.hasTimeOnlyExpressions(enhancedMetadata);
		if (!needsDateInheritance) {
			return task; // Task already has complete date+time information
		}

		// Resolve dates for time-only expressions
		const resolvedDates = await this.resolveTimeOnlyDates(task, enhancedMetadata, batchContext);

		// Update task metadata with resolved dates
		if (resolvedDates.length > 0) {
			const updatedTask = this.updateTaskWithResolvedDates(task, resolvedDates);
			return updatedTask;
		}

		return task;
	}

	/**
	 * Check if task has time-only expressions that need date inheritance
	 */
	private hasTimeOnlyExpressions(metadata: EnhancedStandardTaskMetadata): boolean {
		if (!metadata.timeComponents) {
			return false;
		}

		const { timeComponents } = metadata;
		
		// Check if we have time components but missing corresponding date fields
		const hasTimeWithoutDate = 
			(timeComponents.startTime && !metadata.startDate) ||
			(timeComponents.endTime && !metadata.startDate && !metadata.dueDate) ||
			(timeComponents.dueTime && !metadata.dueDate) ||
			(timeComponents.scheduledTime && !metadata.scheduledDate);

		return hasTimeWithoutDate || false;
	}

	/**
	 * Resolve dates for time-only expressions using cached results when possible
	 */
	private async resolveTimeOnlyDates(
		task: Task,
		metadata: EnhancedStandardTaskMetadata,
		batchContext: BatchDateResolutionContext
	): Promise<Array<{ type: string; date: Date; timeComponent: TimeComponent; result: DateResolutionResult }>> {
		const resolvedDates: Array<{ type: string; date: Date; timeComponent: TimeComponent; result: DateResolutionResult }> = [];
		
		if (!metadata.timeComponents) {
			return resolvedDates;
		}

		// Find parent task if exists
		const parentTaskId = batchContext.parentChildMap.get(task.id);
		const parentTask = parentTaskId ? 
			batchContext.allTasks.find(t => t.id === parentTaskId) : undefined;

		// Get current line content
		const currentLine = task.originalMarkdown || task.content;
		
		// Create resolution context
		const context: DateResolutionContext = {
			currentLine,
			filePath: batchContext.filePath,
			parentTask,
			fileMetadataCache: batchContext.fileMetadataCache,
			lineNumber: task.line,
			allLines: batchContext.allLines,
			allTasks: batchContext.allTasks, // Provide all tasks for hierarchical inheritance
		};

		// Resolve dates for each time component that needs it
		const timeComponents = metadata.timeComponents;

		// Start time without start date
		if (timeComponents.startTime && !metadata.startDate) {
			const result = await this.resolveWithCache(task, timeComponents.startTime, context, 'startTime');
			if (result) {
				resolvedDates.push({
					type: 'startDate',
					date: result.resolvedDate,
					timeComponent: timeComponents.startTime,
					result
				});
			}
		}

		// Due time without due date
		if (timeComponents.dueTime && !metadata.dueDate) {
			const result = await this.resolveWithCache(task, timeComponents.dueTime, context, 'dueTime');
			if (result) {
				resolvedDates.push({
					type: 'dueDate',
					date: result.resolvedDate,
					timeComponent: timeComponents.dueTime,
					result
				});
			}
		}

		// Scheduled time without scheduled date
		if (timeComponents.scheduledTime && !metadata.scheduledDate) {
			const result = await this.resolveWithCache(task, timeComponents.scheduledTime, context, 'scheduledTime');
			if (result) {
				resolvedDates.push({
					type: 'scheduledDate',
					date: result.resolvedDate,
					timeComponent: timeComponents.scheduledTime,
					result
				});
			}
		}

		// End time without any date context (use start date if available, or resolve new date)
		if (timeComponents.endTime && !metadata.startDate && !metadata.dueDate) {
			const result = await this.resolveWithCache(task, timeComponents.endTime, context, 'endTime');
			if (result) {
				// For end time, we typically want to use the same date as start
				// If no start date exists, treat end time as due date
				const dateType = timeComponents.startTime ? 'startDate' : 'dueDate';
				resolvedDates.push({
					type: dateType,
					date: result.resolvedDate,
					timeComponent: timeComponents.endTime,
					result
				});
			}
		}

		return resolvedDates;
	}

	/**
	 * Resolve date with caching for performance
	 */
	private async resolveWithCache(
		task: Task,
		timeComponent: TimeComponent,
		context: DateResolutionContext,
		timeType: string
	): Promise<DateResolutionResult | null> {
		// Create cache key based on context
		const contextHash = this.createContextHash(task, timeComponent, context, timeType);
		const cacheKey = `${task.filePath}:${task.line}:${timeType}:${contextHash}`;

		// Check cache first
		const cached = this.resolutionCache.get(cacheKey);
		if (cached && this.isCacheValid(cached)) {
			return cached.result;
		}

		try {
			// Resolve date using DateInheritanceService
			const result = await this.dateInheritanceService.resolveDateForTimeOnly(
				task,
				timeComponent,
				context
			);

			// Cache the result
			this.cacheResolution(cacheKey, result, contextHash);

			return result;
		} catch (error) {
			console.error(`[DateInheritanceAugmentor] Failed to resolve date for task ${task.id}:`, error);
			return null;
		}
	}

	/**
	 * Create a hash of the resolution context for caching
	 */
	private createContextHash(
		task: Task,
		timeComponent: TimeComponent,
		context: DateResolutionContext,
		timeType: string
	): string {
		const contextData = {
			currentLine: context.currentLine,
			filePath: context.filePath,
			parentTaskId: context.parentTask?.id,
			timeComponentText: timeComponent.originalText,
			timeType,
			lineNumber: context.lineNumber,
		};

		// Simple hash function for context
		return JSON.stringify(contextData);
	}

	/**
	 * Check if cached resolution is still valid
	 */
	private isCacheValid(cached: CachedDateResolution): boolean {
		const now = Date.now();
		const age = now - cached.timestamp;
		return age < this.CACHE_TTL;
	}

	/**
	 * Cache a date resolution result
	 */
	private cacheResolution(
		key: string,
		result: DateResolutionResult,
		contextHash: string
	): void {
		// Implement LRU eviction
		if (this.resolutionCache.size >= this.MAX_CACHE_SIZE) {
			// Remove oldest entry
			const firstKey = this.resolutionCache.keys().next().value;
			if (firstKey) {
				this.resolutionCache.delete(firstKey);
			}
		}

		this.resolutionCache.set(key, {
			result,
			timestamp: Date.now(),
			contextHash,
		});
	}

	/**
	 * Update task with resolved dates
	 */
	private updateTaskWithResolvedDates(
		task: Task,
		resolvedDates: Array<{ type: string; date: Date; timeComponent: TimeComponent; result: DateResolutionResult }>
	): Task {
		const updatedTask = { ...task };
		const updatedMetadata = { ...task.metadata } as EnhancedStandardTaskMetadata;

		// Update date fields with resolved dates
		for (const { type, date, timeComponent, result } of resolvedDates) {
			const timestamp = date.getTime();

			switch (type) {
				case 'startDate':
					updatedMetadata.startDate = timestamp;
					break;
				case 'dueDate':
					updatedMetadata.dueDate = timestamp;
					break;
				case 'scheduledDate':
					updatedMetadata.scheduledDate = timestamp;
					break;
			}

			// Update enhanced datetime objects
			if (!updatedMetadata.enhancedDates) {
				updatedMetadata.enhancedDates = {};
			}

			const combinedDateTime = new Date(
				date.getFullYear(),
				date.getMonth(),
				date.getDate(),
				timeComponent.hour,
				timeComponent.minute,
				timeComponent.second || 0
			);

			switch (type) {
				case 'startDate':
					updatedMetadata.enhancedDates.startDateTime = combinedDateTime;
					if (timeComponent.rangePartner) {
						// Also create end datetime for time ranges
						const endDateTime = new Date(
							date.getFullYear(),
							date.getMonth(),
							date.getDate(),
							timeComponent.rangePartner.hour,
							timeComponent.rangePartner.minute,
							timeComponent.rangePartner.second || 0
						);
						updatedMetadata.enhancedDates.endDateTime = endDateTime;
					}
					break;
				case 'dueDate':
					updatedMetadata.enhancedDates.dueDateTime = combinedDateTime;
					break;
				case 'scheduledDate':
					updatedMetadata.enhancedDates.scheduledDateTime = combinedDateTime;
					break;
			}

			// Log successful resolution for debugging
			console.log(`[DateInheritanceAugmentor] Resolved ${type} for task ${task.id}: ${date.toISOString()} (${result.source}, confidence: ${result.confidence})`);
		}

		updatedTask.metadata = updatedMetadata;
		return updatedTask;
	}

	/**
	 * Clear the resolution cache
	 */
	clearCache(): void {
		this.resolutionCache.clear();
		this.dateInheritanceService.clearCache();
	}

	/**
	 * Get cache statistics for monitoring
	 */
	getCacheStats(): {
		resolutionCache: { size: number; maxSize: number };
		dateInheritanceCache: { size: number; maxSize: number };
	} {
		return {
			resolutionCache: {
				size: this.resolutionCache.size,
				maxSize: this.MAX_CACHE_SIZE,
			},
			dateInheritanceCache: this.dateInheritanceService.getCacheStats(),
		};
	}

	/**
	 * Update settings and clear relevant caches
	 */
	onSettingsChange(): void {
		this.clearCache();
	}
}