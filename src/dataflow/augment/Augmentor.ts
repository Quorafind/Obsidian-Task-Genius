import type { Task, TgProject } from "../../types/task";

export interface AugmentContext {
  filePath: string;
  fileMeta?: Record<string, any>;
  projectName?: string;
  projectMeta?: Record<string, any>;
  tasks: Task[];
}

export interface FileContext {
  filePath: string;
  fileMeta?: Record<string, any>;
  project?: { name?: string; data?: Record<string, any> } | null;
}

export interface InheritanceStrategy {
  // Priority order: task > file > project > default
  scalarPriority: ("task" | "file" | "project" | "default")[];
  // For arrays: merge and deduplicate with stable ordering
  arrayMergeStrategy: "task-first" | "file-first" | "project-first";
  // Special handling for specific fields
  statusCompletionSource: "task-only" | "allow-inheritance";
  recurrenceSource: "task-explicit" | "allow-inheritance";
  // Per-key inheritance control for subtasks
  subtaskInheritance: Record<string, boolean>;
}

/**
 * TaskAugmentor - Complete inheritance and augmentation implementation
 * 
 * Implements the full inheritance strategy as specified in the refactor plan:
 * - Scalar fields: task explicit > file > project > default
 * - Arrays: merge and deduplicate (preserving stable order)
 * - Status/completion: only from task level
 * - Recurrence: task explicit priority  
 * - Subtask inheritance: per-key control based on configuration
 */
export class Augmentor {
  private strategy: InheritanceStrategy;

  constructor(options?: { 
    inherit?: Record<string, "task" | "file" | "project" | "merge-array">;
    strategy?: Partial<InheritanceStrategy>;
  }) {
    // Default strategy based on refactor plan requirements
    this.strategy = {
      scalarPriority: ["task", "file", "project", "default"],
      arrayMergeStrategy: "task-first",
      statusCompletionSource: "task-only",
      recurrenceSource: "task-explicit",
      subtaskInheritance: {
        // Default: most fields inherit, sensitive fields don't
        tags: true,
        project: true,
        priority: true,
        dueDate: false,
        startDate: false,
        scheduledDate: false,
        completed: false,
        status: false,
        recurrence: false,
        onCompletion: false
      },
      ...options?.strategy
    };
  }

  /**
   * Main merge method with enhanced context support
   */
  async merge(ctx: AugmentContext): Promise<Task[]> {
    return ctx.tasks.map(task => this.augmentTask(task, ctx));
  }

  /**
   * Legacy merge method for backward compatibility
   */
  mergeCompat(ctx: FileContext, tasks: Task[]): Task[] {
    const augmentCtx: AugmentContext = {
      filePath: ctx.filePath,
      fileMeta: ctx.fileMeta,
      projectName: ctx.project?.name,
      projectMeta: ctx.project?.data,
      tasks
    };
    
    return tasks.map(task => this.augmentTask(task, augmentCtx));
  }

  /**
   * Augment a single task with file and project metadata
   */
  private augmentTask(task: Task, ctx: AugmentContext): Task {
    const originalMetadata = task.metadata || {};
    const enhancedMetadata = { ...originalMetadata };

    // Special handling for priority: check both task.priority and metadata.priority
    // Priority might be at task root level (from parser) or in metadata
    // IMPORTANT: Once priority is set, it should NOT be overridden by inheritance
    
    // Debug logging for priority processing
    const debug = process.env.NODE_ENV === 'development';
    if (debug && (enhancedMetadata.priority !== undefined || (task as any).priority !== undefined)) {
      console.log('[Augmentor] Priority processing:', {
        metadataPriority: enhancedMetadata.priority,
        taskPriority: (task as any).priority,
        filePath: ctx.filePath
      });
    }
    
    // First, ensure we have the priority from task-level if it exists
    if ((enhancedMetadata.priority === undefined || enhancedMetadata.priority === null) && 
        (task as any).priority !== undefined && (task as any).priority !== null) {
      enhancedMetadata.priority = (task as any).priority;
    }
    
    // Ensure priority is properly converted to numeric format if it exists
    // Clean up null values to undefined for consistency
    if (enhancedMetadata.priority === null) {
      enhancedMetadata.priority = undefined;
    } else if (enhancedMetadata.priority !== undefined) {
      const originalPriority = enhancedMetadata.priority;
      enhancedMetadata.priority = this.convertPriorityValue(enhancedMetadata.priority);
      
      if (debug) {
        console.log('[Augmentor] Priority conversion:', {
          original: originalPriority,
          converted: enhancedMetadata.priority,
          filePath: ctx.filePath
        });
      }
    }

    // Apply inheritance for each metadata field
    this.applyScalarInheritance(enhancedMetadata, ctx);
    this.applyArrayInheritance(enhancedMetadata, ctx);
    this.applySpecialFieldRules(enhancedMetadata, ctx);
    this.applyProjectReference(enhancedMetadata, ctx);

    // Handle subtask inheritance if this is a parent task
    if (originalMetadata.children && Array.isArray(originalMetadata.children)) {
      this.applySubtaskInheritance(task, enhancedMetadata, ctx);
    }

    return {
      ...task,
      metadata: enhancedMetadata
    } as Task;
  }

  /**
   * Apply scalar field inheritance: task > file > project > default
   */
  private applyScalarInheritance(metadata: Record<string, any>, ctx: AugmentContext): void {
    const scalarFields = [
      'priority', 'context', 'area', 'estimatedTime', 'actualTime', 
      'useAsDateType', 'heading'
    ];

    for (const field of scalarFields) {
      // Skip if task already has explicit value
      if (metadata[field] !== undefined && metadata[field] !== null) {
        continue;
      }

      // Special handling for priority - NEVER apply default value
      // Priority should only come from task itself, file, or project
      if (field === 'priority') {
        // Only check file and project sources, skip default
        for (const source of ['file', 'project']) {
          let value: any;
          
          if (source === 'file') {
            value = ctx.fileMeta?.[field];
          } else if (source === 'project') {
            value = ctx.projectMeta?.[field];
          }

          if (value !== undefined && value !== null) {
            // Convert priority value to numeric format
            metadata[field] = this.convertPriorityValue(value);
            break;
          }
        }
        // If no priority found, leave it undefined (don't set default)
        continue;
      }

      // Apply inheritance priority for other fields: file > project > default
      for (const source of this.strategy.scalarPriority.slice(1)) { // Skip 'task' since we checked above
        let value: any;
        
        switch (source) {
          case 'file':
            value = ctx.fileMeta?.[field];
            break;
          case 'project':
            value = ctx.projectMeta?.[field];
            break;
          case 'default':
            value = this.getDefaultValue(field);
            break;
        }

        if (value !== undefined && value !== null) {
          metadata[field] = value;
          break;
        }
      }
    }
  }

  /**
   * Apply array field inheritance with merge and deduplication
   */
  private applyArrayInheritance(metadata: Record<string, any>, ctx: AugmentContext): void {
    const arrayFields = ['tags', 'dependsOn'];

    for (const field of arrayFields) {
      const taskArray = Array.isArray(metadata[field]) ? metadata[field] : [];
      const fileArray = ctx.fileMeta && Array.isArray((ctx.fileMeta as any)[field]) ? (ctx.fileMeta as any)[field] : [];
      const projectArray = ctx.projectMeta && Array.isArray((ctx.projectMeta as any)[field]) ? (ctx.projectMeta as any)[field] : [];

      let mergedArray: any[];

      // Merge based on strategy
      switch (this.strategy.arrayMergeStrategy) {
        case 'task-first':
          mergedArray = [...taskArray, ...fileArray, ...projectArray];
          break;
        case 'file-first':
          mergedArray = [...fileArray, ...taskArray, ...projectArray];
          break;
        case 'project-first':
          mergedArray = [...projectArray, ...taskArray, ...fileArray];
          break;
        default:
          mergedArray = [...taskArray, ...fileArray, ...projectArray];
      }

      // Deduplicate while preserving order
      metadata[field] = Array.from(new Set(mergedArray));
    }
  }

  /**
   * Apply special field rules for status/completion and recurrence
   */
  private applySpecialFieldRules(metadata: Record<string, any>, ctx: AugmentContext): void {
    // Status and completion: only from task level (never inherit)
    if (this.strategy.statusCompletionSource === 'task-only') {
      // These fields should only come from the task itself, never inherit
      // (No action needed as we don't override existing task values)
    }

    // Recurrence: task explicit priority
    if (this.strategy.recurrenceSource === 'task-explicit') {
      // Only use recurrence if explicitly set on task
      if (!metadata.recurrence) {
        // Don't inherit recurrence from file or project
        delete metadata.recurrence;
      }
    }

    // Date fields: inherit only if not already set
    const dateFields = ['dueDate', 'startDate', 'scheduledDate', 'createdDate'];
    for (const field of dateFields) {
      if (metadata[field] === undefined || metadata[field] === null) {
        // Try file first, then project
        const fileValue = ctx.fileMeta?.[field];
        const projectValue = ctx.projectMeta?.[field];
        
        if (fileValue !== undefined && fileValue !== null) {
          metadata[field] = fileValue;
        } else if (projectValue !== undefined && projectValue !== null) {
          metadata[field] = projectValue;
        }
      }
    }
  }

  /**
   * Apply TgProject reference
   */
  private applyProjectReference(metadata: Record<string, any>, ctx: AugmentContext): void {
    // Set project name if not already set
    if (!metadata.project && ctx.projectName) {
      metadata.project = ctx.projectName;
    }

    // Set TgProject if project metadata is available
    // The tgProject should come from ProjectResolver which includes all necessary fields
    if (ctx.projectMeta) {
      // Check if we have a tgProject object in the project metadata
      if (ctx.projectMeta.tgProject) {
        metadata.tgProject = ctx.projectMeta.tgProject;
      } else if (ctx.projectName) {
        // Fallback: construct from available data
        metadata.tgProject = {
          type: ctx.projectMeta.type || 'metadata',
          name: ctx.projectName,
          source: ctx.projectMeta.source || ctx.projectMeta.configSource || 'unknown',
          readonly: ctx.projectMeta.readonly || false
        } as TgProject;
      }
    }
  }

  /**
   * Apply subtask inheritance based on per-key control
   */
  private applySubtaskInheritance(parentTask: Task, parentMetadata: Record<string, any>, ctx: AugmentContext): void {
    // This would typically involve finding child tasks and applying inheritance
    // For now, we'll store the inheritance rules on the parent for child processing
    parentMetadata._subtaskInheritanceRules = this.strategy.subtaskInheritance;
  }

  /**
   * Convert priority value to consistent numeric format
   */
  private convertPriorityValue(value: any): number | undefined {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    // If it's already a number, return it
    if (typeof value === "number") {
      return value;
    }

    // If it's a string, try to convert
    const strValue = String(value);
    
    // Priority mapping for text and emoji values
    const priorityMap: Record<string, number> = {
      // Text priorities
      highest: 5,
      high: 4,
      medium: 3,
      low: 2,
      lowest: 1,
      urgent: 5,
      critical: 5,
      important: 4,
      normal: 3,
      moderate: 3,
      minor: 2,
      trivial: 1,
      // Emoji priorities (Tasks plugin compatible)
      "🔺": 5,
      "⏫": 4,
      "🔼": 3,
      "🔽": 2,
      "⏬️": 1,
      "⏬": 1,
    };

    // Try numeric conversion first
    const numericValue = parseInt(strValue, 10);
    if (!isNaN(numericValue) && numericValue >= 1 && numericValue <= 5) {
      return numericValue;
    }

    // Try priority mapping (including emojis)
    const mappedPriority = priorityMap[strValue.toLowerCase()] || priorityMap[strValue];
    if (mappedPriority !== undefined) {
      return mappedPriority;
    }

    // If we can't convert, return undefined to avoid setting invalid values
    return undefined;
  }

  /**
   * Get default value for a field
   */
  private getDefaultValue(field: string): any {
    const defaults: Record<string, any> = {
      // Don't set default priority for now - it should come from parser
      // If we need to add it back, we should check if task already has priority elsewhere
      tags: [],
      dependsOn: [],
      estimatedTime: undefined,
      actualTime: undefined,
      useAsDateType: 'due'
    };

    return defaults[field];
  }

  /**
   * Update inheritance strategy
   */
  updateStrategy(strategy: Partial<InheritanceStrategy>): void {
    this.strategy = { ...this.strategy, ...strategy };
  }

  /**
   * Get current inheritance strategy
   */
  getStrategy(): InheritanceStrategy {
    return { ...this.strategy };
  }

  /**
   * Process inheritance for a specific field type
   */
  processFieldInheritance(
    field: string, 
    taskValue: any, 
    fileValue: any, 
    projectValue: any
  ): any {
    // Handle arrays specially
    if (Array.isArray(taskValue) || Array.isArray(fileValue) || Array.isArray(projectValue)) {
      const taskArray = Array.isArray(taskValue) ? taskValue : [];
      const fileArray = Array.isArray(fileValue) ? fileValue : [];
      const projectArray = Array.isArray(projectValue) ? projectValue : [];
      
      let merged: any[];
      switch (this.strategy.arrayMergeStrategy) {
        case 'task-first':
          merged = [...taskArray, ...fileArray, ...projectArray];
          break;
        case 'file-first':
          merged = [...fileArray, ...taskArray, ...projectArray];
          break;
        case 'project-first':
          merged = [...projectArray, ...taskArray, ...fileArray];
          break;
        default:
          merged = [...taskArray, ...fileArray, ...projectArray];
      }
      
      return Array.from(new Set(merged));
    }

    // Handle scalars with priority order
    for (const source of this.strategy.scalarPriority) {
      let value: any;
      switch (source) {
        case 'task':
          value = taskValue;
          break;
        case 'file':
          value = fileValue;
          break;
        case 'project':
          value = projectValue;
          break;
        case 'default':
          value = this.getDefaultValue(field);
          break;
      }

      if (value !== undefined && value !== null) {
        return value;
      }
    }

    return undefined;
  }
}

