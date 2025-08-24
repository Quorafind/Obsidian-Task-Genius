# Enhanced Time Parsing API Documentation

## Overview

The Enhanced Time Parsing API extends Task Genius's existing time parsing capabilities to support granular time recognition including single times, time ranges, and intelligent date inheritance. This document provides comprehensive developer guidance for working with the enhanced time parsing system.

## Core Interfaces

### TimeComponent

The `TimeComponent` interface represents a parsed time value with validation and range support.

```typescript
interface TimeComponent {
  /** Hour (0-23) */
  hour: number;
  /** Minute (0-59) */
  minute: number;
  /** Second (0-59, optional) */
  second?: number;
  /** Original text that was parsed */
  originalText: string;
  /** Whether this is part of a time range */
  isRange: boolean;
  /** Range partner (for start/end time pairs) */
  rangePartner?: TimeComponent;
}
```

#### Usage Example

```typescript
// Creating a TimeComponent for 2:30 PM
const timeComponent: TimeComponent = {
  hour: 14,
  minute: 30,
  originalText: "2:30 PM",
  isRange: false
};

// Creating a time range (9:00-17:00)
const startTime: TimeComponent = {
  hour: 9,
  minute: 0,
  originalText: "9:00-17:00",
  isRange: true,
  rangePartner: endTime
};

const endTime: TimeComponent = {
  hour: 17,
  minute: 0,
  originalText: "9:00-17:00",
  isRange: true,
  rangePartner: startTime
};
```

### EnhancedParsedTimeResult

Extends the existing `ParsedTimeResult` to include time component information.

```typescript
interface EnhancedParsedTimeResult extends ParsedTimeResult {
  // Time-specific components
  timeComponents: {
    startTime?: TimeComponent;
    endTime?: TimeComponent;
    dueTime?: TimeComponent;
    scheduledTime?: TimeComponent;
  };
  // Enhanced expressions with time information
  parsedExpressions: Array<EnhancedTimeExpression>;
}
```

#### Usage Example

```typescript
import { TimeParsingService } from '../services/time-parsing-service';

const timeParser = new TimeParsingService();
const result: EnhancedParsedTimeResult = await timeParser.parseTimeExpressions(
  "Meeting tomorrow 2:30 PM - 4:00 PM"
);

// Access parsed time components
if (result.timeComponents.startTime) {
  console.log(`Start: ${result.timeComponents.startTime.hour}:${result.timeComponents.startTime.minute}`);
}

if (result.timeComponents.endTime) {
  console.log(`End: ${result.timeComponents.endTime.hour}:${result.timeComponents.endTime.minute}`);
}
```

### EnhancedTimeExpression

Represents a parsed time expression with enhanced metadata.

```typescript
interface EnhancedTimeExpression {
  text: string;
  date: Date;
  type: "start" | "due" | "scheduled";
  index: number;
  length: number;
  // New time-specific fields
  timeComponent?: TimeComponent;
  isTimeRange: boolean;
  rangeStart?: TimeComponent;
  rangeEnd?: TimeComponent;
}
```

### EnhancedStandardTaskMetadata

Extends task metadata to include time components alongside existing timestamp fields.

```typescript
interface EnhancedStandardTaskMetadata extends StandardTaskMetadata {
  // Time-specific metadata (separate from date timestamps)
  timeComponents?: {
    /** Start time component */
    startTime?: TimeComponent;
    /** End time component (for time ranges) */
    endTime?: TimeComponent;
    /** Due time component */
    dueTime?: TimeComponent;
    /** Scheduled time component */
    scheduledTime?: TimeComponent;
  };
  
  // Enhanced date fields that combine date + time
  enhancedDates?: {
    /** Full datetime for start (combines startDate + startTime) */
    startDateTime?: Date;
    /** Full datetime for end (combines date + endTime) */
    endDateTime?: Date;
    /** Full datetime for due (combines dueDate + dueTime) */
    dueDateTime?: Date;
    /** Full datetime for scheduled (combines scheduledDate + scheduledTime) */
    scheduledDateTime?: Date;
  };
}
```

## TimeParsingService API

### Core Methods

#### parseTimeComponents(text: string): Promise<TimeComponent[]>

Extracts time components from text without processing dates.

```typescript
const timeParser = new TimeParsingService();

// Parse single time
const singleTime = await timeParser.parseTimeComponents("Meeting at 2:30 PM");
// Returns: [{ hour: 14, minute: 30, originalText: "2:30 PM", isRange: false }]

// Parse time range
const timeRange = await timeParser.parseTimeComponents("Workshop 9:00-17:00");
// Returns: [
//   { hour: 9, minute: 0, originalText: "9:00-17:00", isRange: true, rangePartner: endTime },
//   { hour: 17, minute: 0, originalText: "9:00-17:00", isRange: true, rangePartner: startTime }
// ]
```

#### parseTimeExpressions(text: string): Promise<EnhancedParsedTimeResult>

Enhanced version of the existing method that includes time component parsing.

```typescript
const result = await timeParser.parseTimeExpressions("Project due tomorrow 5:00 PM");

// Access both date and time information
console.log(result.parsedExpressions[0].date); // Date object for tomorrow
console.log(result.timeComponents.dueTime?.hour); // 17
console.log(result.timeComponents.dueTime?.minute); // 0
```

#### combineDateTime(date: Date, timeComponent: TimeComponent): Date

Utility method to combine date and time components into a full datetime object.

```typescript
const date = new Date('2024-12-25');
const timeComponent: TimeComponent = { hour: 14, minute: 30, originalText: "2:30 PM", isRange: false };

const combinedDateTime = timeParser.combineDateTime(date, timeComponent);
// Returns: Date object for 2024-12-25 14:30:00
```

### Configuration

#### EnhancedTimeParsingConfig

Configure time parsing behavior through the enhanced configuration interface.

```typescript
interface EnhancedTimeParsingConfig extends TimeParsingConfig {
  timePatterns: {
    /** Single time patterns (12:00, 12:00:00, 1:30 PM) */
    singleTime: RegExp[];
    /** Time range patterns (12:00-13:00, 12:00 - 13:00, 12:00~13:00) */
    timeRange: RegExp[];
    /** Time separators for ranges */
    rangeSeparators: string[];
  };
  timeDefaults: {
    /** Default format preference (12-hour vs 24-hour) */
    preferredFormat: "12h" | "24h";
    /** Default AM/PM when ambiguous */
    defaultPeriod: "AM" | "PM";
    /** How to handle midnight crossing ranges */
    midnightCrossing: "next-day" | "same-day" | "error";
  };
}
```

#### Usage Example

```typescript
const config: EnhancedTimeParsingConfig = {
  // ... existing config
  timeDefaults: {
    preferredFormat: "24h",
    defaultPeriod: "AM",
    midnightCrossing: "next-day"
  }
};

const timeParser = new TimeParsingService(config);
```

## Date Inheritance API

### DateInheritanceService

Handles intelligent date resolution for time-only expressions.

```typescript
interface DateInheritanceService {
  /** Resolve date for time-only expressions using priority logic */
  resolveDateForTimeOnly(
    task: Task,
    timeComponent: TimeComponent,
    context: DateResolutionContext
  ): Promise<DateResolutionResult>;
  
  /** Get file-based date information with caching */
  getFileDateInfo(filePath: string): Promise<FileDateInfo>;
  
  /** Extract daily note date from file path/title */
  extractDailyNoteDate(filePath: string): Date | null;
}
```

#### Usage Example

```typescript
import { DateInheritanceService } from '../services/date-inheritance-service';

const dateService = new DateInheritanceService();

const context: DateResolutionContext = {
  currentLine: "- [ ] Meeting 📅 14:30",
  filePath: "Daily Notes/2024-12-25.md",
  parentTask: undefined,
  fileMetadataCache: new Map()
};

const timeComponent: TimeComponent = {
  hour: 14,
  minute: 30,
  originalText: "14:30",
  isRange: false
};

const result = await dateService.resolveDateForTimeOnly(task, timeComponent, context);
console.log(result.resolvedDate); // Date for 2024-12-25 14:30
console.log(result.source); // "daily-note-date"
console.log(result.confidence); // "high"
```

### DateResolutionContext

Provides context information for date resolution.

```typescript
interface DateResolutionContext {
  /** Current line being parsed */
  currentLine: string;
  /** File path of the task */
  filePath: string;
  /** Parent task information for inheritance */
  parentTask?: Task;
  /** File metadata cache */
  fileMetadataCache?: Map<string, FileDateInfo>;
}
```

### DateResolutionResult

Result of date resolution with metadata about the source and confidence.

```typescript
interface DateResolutionResult {
  /** Resolved date */
  resolvedDate: Date;
  /** Source of the date */
  source: "line-date" | "metadata-date" | "daily-note-date" | "file-ctime" | "parent-task";
  /** Confidence level of the resolution */
  confidence: "high" | "medium" | "low";
  /** Whether fallback was used */
  usedFallback: boolean;
}
```

## Timeline Integration

### EnhancedTimelineEvent

Extended timeline event interface with time information.

```typescript
interface EnhancedTimelineEvent extends TimelineEvent {
  // Enhanced time information
  timeInfo?: {
    /** Primary time for display and sorting */
    primaryTime: Date;
    /** End time for ranges */
    endTime?: Date;
    /** Whether this is a time range */
    isRange: boolean;
    /** Original time component from parsing */
    timeComponent?: TimeComponent;
    /** Display format preference */
    displayFormat: "time-only" | "date-time" | "range";
  };
}
```

#### Usage Example

```typescript
// Creating an enhanced timeline event
const timelineEvent: EnhancedTimelineEvent = {
  // ... existing TimelineEvent properties
  timeInfo: {
    primaryTime: new Date('2024-12-25T14:30:00'),
    endTime: new Date('2024-12-25T16:00:00'),
    isRange: true,
    timeComponent: startTimeComponent,
    displayFormat: "range"
  }
};
```

## Error Handling

### TimeParsingError

Structured error information for time parsing failures.

```typescript
interface TimeParsingError {
  type: "invalid-format" | "midnight-crossing" | "ambiguous-time" | "range-error";
  originalText: string;
  position: number;
  message: string;
  fallbackUsed: boolean;
  fallbackValue?: TimeComponent;
}
```

### EnhancedParseResult

Comprehensive result structure with error handling.

```typescript
interface EnhancedParseResult {
  success: boolean;
  result?: EnhancedParsedTimeResult;
  errors: TimeParsingError[];
  warnings: string[];
}
```

#### Usage Example

```typescript
const parseResult: EnhancedParseResult = await timeParser.parseWithErrorHandling(
  "Invalid time format 25:70"
);

if (!parseResult.success) {
  parseResult.errors.forEach(error => {
    console.error(`Time parsing error: ${error.message}`);
    if (error.fallbackUsed && error.fallbackValue) {
      console.log(`Using fallback: ${error.fallbackValue.hour}:${error.fallbackValue.minute}`);
    }
  });
}
```

## Migration Strategies

### Automatic Task Enhancement

Existing tasks are automatically enhanced when accessed through the new API:

```typescript
import { TaskMigrationService } from '../services/task-migration-service';

const migrationService = new TaskMigrationService();

// Migrate existing task to enhanced format
const enhancedTask = migrationService.migrateTaskToEnhanced(existingTask);

// Check if task has enhanced metadata
if (enhancedTask.metadata.timeComponents) {
  console.log("Task has enhanced time information");
}
```

### Backward Compatibility

The enhanced API maintains full backward compatibility:

```typescript
// Existing code continues to work
const oldResult = await timeParser.parseTimeExpressions("tomorrow 5pm");
console.log(oldResult.parsedExpressions[0].date); // Still works

// New features are additive
if (oldResult.timeComponents?.dueTime) {
  console.log("Enhanced time info available");
}
```

### Gradual Migration

For large codebases, migrate incrementally:

```typescript
// 1. Update type annotations to enhanced interfaces
function processTask(task: Task<EnhancedStandardTaskMetadata>) {
  // Enhanced functionality available
  if (task.metadata.timeComponents?.startTime) {
    // Use enhanced time information
  } else {
    // Fall back to existing timestamp-based logic
  }
}

// 2. Update parsing calls to use enhanced methods
const result = await timeParser.parseTimeExpressions(text);
// Enhanced result includes both old and new fields

// 3. Update UI components to display enhanced information
if (result.timeComponents?.startTime) {
  displayEnhancedTime(result.timeComponents.startTime);
} else {
  displayBasicTime(result.parsedExpressions[0].date);
}
```

## Performance Considerations

### Caching Strategies

The enhanced time parsing system includes several performance optimizations:

```typescript
// File metadata caching
const fileCache = new Map<string, FileDateInfo>();
const context: DateResolutionContext = {
  // ... other properties
  fileMetadataCache: fileCache
};

// Reuse cache across multiple parsing operations
const result1 = await dateService.resolveDateForTimeOnly(task1, time1, context);
const result2 = await dateService.resolveDateForTimeOnly(task2, time2, context);
```

### Batch Processing

For processing multiple tasks efficiently:

```typescript
// Batch process tasks with shared context
const tasks = await getAllTasks();
const batchContext = await createBatchContext(tasks);

const enhancedTasks = await Promise.all(
  tasks.map(task => enhanceTaskWithTimeInfo(task, batchContext))
);
```

### Memory Management

Time components are lightweight objects, but for large datasets:

```typescript
// Use weak references for temporary time components
const timeComponentCache = new WeakMap<Task, TimeComponent[]>();

// Clean up enhanced metadata when not needed
function cleanupEnhancedMetadata(task: Task) {
  if (task.metadata.enhancedDates) {
    delete task.metadata.enhancedDates;
  }
}
```

## Testing Utilities

### Mock Time Components

```typescript
// Test utilities for creating mock time components
export function createMockTimeComponent(
  hour: number, 
  minute: number, 
  options: Partial<TimeComponent> = {}
): TimeComponent {
  return {
    hour,
    minute,
    originalText: `${hour}:${minute.toString().padStart(2, '0')}`,
    isRange: false,
    ...options
  };
}

// Create mock time ranges
export function createMockTimeRange(
  startHour: number, 
  startMinute: number,
  endHour: number, 
  endMinute: number
): [TimeComponent, TimeComponent] {
  const originalText = `${startHour}:${startMinute}-${endHour}:${endMinute}`;
  
  const startTime: TimeComponent = {
    hour: startHour,
    minute: startMinute,
    originalText,
    isRange: true,
    rangePartner: undefined // Will be set below
  };
  
  const endTime: TimeComponent = {
    hour: endHour,
    minute: endMinute,
    originalText,
    isRange: true,
    rangePartner: startTime
  };
  
  startTime.rangePartner = endTime;
  
  return [startTime, endTime];
}
```

### Test Examples

```typescript
describe('Enhanced Time Parsing', () => {
  let timeParser: TimeParsingService;
  
  beforeEach(() => {
    timeParser = new TimeParsingService();
  });
  
  test('should parse single time correctly', async () => {
    const result = await timeParser.parseTimeComponents("Meeting at 2:30 PM");
    
    expect(result).toHaveLength(1);
    expect(result[0].hour).toBe(14);
    expect(result[0].minute).toBe(30);
    expect(result[0].isRange).toBe(false);
  });
  
  test('should parse time range correctly', async () => {
    const result = await timeParser.parseTimeComponents("Workshop 9:00-17:00");
    
    expect(result).toHaveLength(2);
    expect(result[0].hour).toBe(9);
    expect(result[1].hour).toBe(17);
    expect(result[0].isRange).toBe(true);
    expect(result[1].isRange).toBe(true);
    expect(result[0].rangePartner).toBe(result[1]);
  });
});
```

## Best Practices

### API Usage

1. **Always check for enhanced metadata availability**:
```typescript
if (task.metadata.timeComponents?.startTime) {
  // Use enhanced time information
} else {
  // Fall back to timestamp-based logic
}
```

2. **Use type guards for enhanced interfaces**:
```typescript
function isEnhancedTask(task: Task): task is Task<EnhancedStandardTaskMetadata> {
  return 'timeComponents' in task.metadata;
}
```

3. **Handle errors gracefully**:
```typescript
try {
  const result = await timeParser.parseTimeExpressions(text);
  // Process result
} catch (error) {
  // Fall back to basic date parsing
  const basicResult = await timeParser.parseBasicDates(text);
}
```

### Performance Optimization

1. **Cache file metadata for batch operations**
2. **Use lazy loading for enhanced metadata**
3. **Implement proper cleanup for temporary objects**
4. **Consider memory usage in large datasets**

### Integration Guidelines

1. **Maintain backward compatibility in all public APIs**
2. **Provide migration utilities for existing integrations**
3. **Document breaking changes clearly**
4. **Use feature flags for gradual rollout**

## Examples and Recipes

### Common Integration Patterns

#### Task Creation with Enhanced Time Parsing

```typescript
async function createTaskWithTime(text: string, filePath: string): Promise<Task> {
  const timeParser = new TimeParsingService();
  const dateService = new DateInheritanceService();
  
  // Parse time expressions
  const parseResult = await timeParser.parseTimeExpressions(text);
  
  // Create base task
  const task: Task = {
    // ... basic task properties
    metadata: {
      // ... basic metadata
    }
  };
  
  // Add enhanced time information if available
  if (parseResult.timeComponents) {
    const enhancedMetadata: EnhancedStandardTaskMetadata = {
      ...task.metadata,
      timeComponents: parseResult.timeComponents
    };
    
    // Resolve dates for time-only expressions
    if (parseResult.timeComponents.startTime && !parseResult.parsedExpressions[0]?.date) {
      const context: DateResolutionContext = {
        currentLine: text,
        filePath,
        parentTask: undefined
      };
      
      const dateResult = await dateService.resolveDateForTimeOnly(
        task, 
        parseResult.timeComponents.startTime, 
        context
      );
      
      enhancedMetadata.enhancedDates = {
        startDateTime: timeParser.combineDateTime(
          dateResult.resolvedDate, 
          parseResult.timeComponents.startTime
        )
      };
    }
    
    task.metadata = enhancedMetadata;
  }
  
  return task;
}
```

#### Timeline Event Enhancement

```typescript
function createEnhancedTimelineEvent(task: Task): EnhancedTimelineEvent {
  const baseEvent: TimelineEvent = {
    // ... create base timeline event
  };
  
  if (isEnhancedTask(task) && task.metadata.timeComponents?.startTime) {
    const timeComponent = task.metadata.timeComponents.startTime;
    const enhancedEvent: EnhancedTimelineEvent = {
      ...baseEvent,
      timeInfo: {
        primaryTime: task.metadata.enhancedDates?.startDateTime || baseEvent.date,
        endTime: task.metadata.enhancedDates?.endDateTime,
        isRange: timeComponent.isRange,
        timeComponent,
        displayFormat: timeComponent.isRange ? "range" : "time-only"
      }
    };
    
    return enhancedEvent;
  }
  
  return baseEvent;
}
```

This comprehensive API documentation provides developers with all the necessary information to integrate with and extend the enhanced time parsing system while maintaining backward compatibility and following best practices.