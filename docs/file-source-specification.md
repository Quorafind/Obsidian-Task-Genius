# FileSource Feature Specification

## Overview

The FileSource feature extends the dataflow architecture to recognize files themselves as tasks based on their metadata properties. This enables a dual-role model where a file can simultaneously serve as both a Project (container for tasks) and a FileSource Task (a task with its own properties like due dates, status, etc.).

## Architecture Alignment

### Dataflow Integration

FileSource integrates seamlessly into the existing dataflow architecture following established patterns:

- **Source Pattern**: Follows the same pattern as `ObsidianSource` and `IcsSource`
- **Event-Driven**: Uses the centralized event system with proper sequence tracking
- **Separation of Concerns**: Maintains clear boundaries between parsing, augmentation, repository, and storage
- **Performance**: Leverages existing worker orchestration and caching mechanisms

### Key Design Principles

1. **Non-Intrusive**: Builds on existing file metadata parsing without breaking current functionality
2. **Dual Role Support**: A file can be both a Project and a Task without conflicts
3. **Flexible Recognition**: Multiple strategies for identifying files as tasks
4. **Configuration-Driven**: Extensive configuration options for different use cases

## Core Concepts

### File as Task

A file becomes a FileSource Task when it meets configured recognition criteria:

- **Metadata-Based**: File has specific frontmatter properties (e.g., `dueDate`, `status`, `priority`)
- **Tag-Based**: File contains specific tags (e.g., `#task`, `#project-task`, `#actionable`)
- **Template-Based**: File is created from or matches specific templates
- **Path-Based**: File location matches configured patterns

### Dual Role Model

Files can simultaneously serve as:

1. **Project**: Container for child tasks within the file
2. **FileSource Task**: A task entity with its own metadata and lifecycle

This dual role is managed through:
- **Namespace Separation**: Project data vs. task data are kept distinct
- **Hierarchical Relationships**: File-tasks can contain child tasks from within the file
- **Status Independence**: File status is separate from contained task statuses

### Relationship with Projects

FileSource integrates with the existing Project system:

- **Project Enhancement**: Files that are Projects can also be tasks
- **Hierarchy Preservation**: Existing project hierarchies remain intact
- **Metadata Inheritance**: Child tasks can inherit metadata from file-tasks
- **Conflict Resolution**: Clear rules for handling conflicts between project and task metadata

## Technical Design

### Architecture Components

```
src/dataflow/sources/
├── FileSource.ts                 # Main FileSource implementation
└── FileSourceConfig.ts           # Configuration management

src/dataflow/parsers/
├── FileSourceEntry.ts            # File-to-task parsing entry point
└── FileSourceParser.ts           # Core file metadata → task conversion

src/dataflow/augment/
└── FileSourceAugmentor.ts        # File task augmentation logic

src/dataflow/indexer/
└── FileSourceIndex.ts            # Specialized indexing for file tasks

src/types/
└── file-source.d.ts              # TypeScript definitions
```

### Data Flow

```
1. File Change → ObsidianSource → FILE_UPDATED event
2. FileSource subscribes to FILE_UPDATED events
3. FileSource evaluates recognition criteria
4. If match: FileSource → FILE_TASK_UPDATED event
5. Orchestrator → Repository.updateFileTasks()
6. Repository → TASK_CACHE_UPDATED event (with sourceSeq)
7. Views update with merged file tasks + regular tasks
```

### Event System

New events added to the centralized event system:

```typescript
Events = {
  // ... existing events
  FILE_TASK_DETECTED: "task-genius:file-task-detected",
  FILE_TASK_UPDATED: "task-genius:file-task-updated",
  FILE_TASK_REMOVED: "task-genius:file-task-removed",
}
```

### Task Metadata Extension

File tasks use extended metadata:

```typescript
interface FileSourceTaskMetadata extends StandardTaskMetadata {
  /** Task source */
  source: "file-source";
  
  /** Recognition strategy that identified this file as a task */
  recognitionStrategy: "metadata" | "tag" | "template" | "path";
  
  /** Recognition criteria that matched */
  recognitionCriteria: string;
  
  /** File creation/modification timestamps */
  fileTimestamps: {
    created: number;
    modified: number;
  };
  
  /** Child task relationships */
  childTasks: string[]; // IDs of tasks within this file
  
  /** Project relationship (if file is also a project) */
  projectData?: {
    isProject: boolean;
    projectName?: string;
    projectType?: string;
  };
}
```

## Configuration Schema

### FileSource Configuration

```typescript
interface FileSourceConfiguration {
  /** Enable FileSource feature */
  enabled: boolean;
  
  /** Recognition strategies */
  recognitionStrategies: {
    /** Metadata-based recognition */
    metadata: {
      enabled: boolean;
      /** Metadata fields that make a file a task */
      taskFields: string[]; // Default: ["dueDate", "status", "priority", "assigned"]
      /** Require all fields or any field */
      requireAllFields: boolean; // Default: false
    };
    
    /** Tag-based recognition */
    tags: {
      enabled: boolean;
      /** Tags that make a file a task */
      taskTags: string[]; // Default: ["#task", "#actionable", "#todo"]
      /** Tag matching mode */
      matchMode: "exact" | "prefix" | "contains"; // Default: "exact"
    };
    
    /** Template-based recognition */
    templates: {
      enabled: boolean;
      /** Template files or patterns */
      templatePaths: string[]; // Default: ["Templates/Task Template.md"]
      /** Check template metadata */
      checkTemplateMetadata: boolean; // Default: true
    };
    
    /** Path-based recognition */
    paths: {
      enabled: boolean;
      /** Path patterns that contain file tasks */
      taskPaths: string[]; // Default: ["Projects/", "Tasks/"]
      /** Pattern matching mode */
      matchMode: "prefix" | "regex" | "glob"; // Default: "prefix"
    };
  };
  
  /** File task properties */
  fileTaskProperties: {
    /** Default task content source */
    contentSource: "filename" | "title" | "h1" | "custom"; // Default: "filename"
    /** Custom content field (if contentSource is "custom") */
    customContentField?: string;
    /** Strip file extension from content */
    stripExtension: boolean; // Default: true
    /** Default status for new file tasks */
    defaultStatus: string; // Default: " "
    /** Default priority for new file tasks */
    defaultPriority?: number;
  };
  
  /** Relationship configuration */
  relationships: {
    /** Enable file-task to child-task relationships */
    enableChildRelationships: boolean; // Default: true
    /** Inherit metadata from file to child tasks */
    enableMetadataInheritance: boolean; // Default: true
    /** Metadata fields to inherit */
    inheritanceFields: string[]; // Default: ["project", "priority", "context"]
  };
  
  /** Performance configuration */
  performance: {
    /** Enable worker processing for file tasks */
    enableWorkerProcessing: boolean; // Default: true
    /** Cache file task results */
    enableCaching: boolean; // Default: true
    /** Cache TTL in milliseconds */
    cacheTTL: number; // Default: 300000 (5 minutes)
  };
}
```

### Default Configuration

```typescript
const DEFAULT_FILE_SOURCE_CONFIG: FileSourceConfiguration = {
  enabled: false,
  recognitionStrategies: {
    metadata: {
      enabled: true,
      taskFields: ["dueDate", "status", "priority", "assigned"],
      requireAllFields: false
    },
    tags: {
      enabled: true,
      taskTags: ["#task", "#actionable", "#todo"],
      matchMode: "exact"
    },
    templates: {
      enabled: false,
      templatePaths: ["Templates/Task Template.md"],
      checkTemplateMetadata: true
    },
    paths: {
      enabled: false,
      taskPaths: ["Projects/", "Tasks/"],
      matchMode: "prefix"
    }
  },
  fileTaskProperties: {
    contentSource: "filename",
    stripExtension: true,
    defaultStatus: " ",
    defaultPriority: undefined
  },
  relationships: {
    enableChildRelationships: true,
    enableMetadataInheritance: true,
    inheritanceFields: ["project", "priority", "context"]
  },
  performance: {
    enableWorkerProcessing: true,
    enableCaching: true,
    cacheTTL: 300000
  },
};
```

## Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1-2)

**Components to Implement:**
- [ ] `src/types/file-source.d.ts` - Core type definitions
- [ ] `src/dataflow/sources/FileSourceConfig.ts` - Configuration management
- [ ] `src/dataflow/sources/FileSource.ts` - Basic source implementation
- [ ] Settings integration for FileSource configuration
- [ ] Unit tests for core components

**Deliverables:**
- Basic FileSource that can detect metadata-based file tasks
- Configuration system fully integrated
- Test coverage for core functionality

### Phase 2: Recognition Strategies (Week 3-4)

**Components to Implement:**
- [ ] `src/dataflow/parsers/FileSourceParser.ts` - Recognition strategy implementations
- [ ] `src/dataflow/parsers/FileSourceEntry.ts` - Parser entry point
- [ ] Tag-based recognition
- [ ] Template-based recognition
- [ ] Path-based recognition
- [ ] Integration tests for all strategies

**Deliverables:**
- All recognition strategies functional
- Comprehensive strategy testing
- Performance benchmarks

### Phase 3: Integration & Augmentation (Week 5-6)

**Components to Implement:**
- [ ] `src/dataflow/augment/FileSourceAugmentor.ts` - File task augmentation
- [ ] Repository integration for file tasks
- [ ] Event system integration
- [ ] Child task relationship management
- [ ] Metadata inheritance system

**Deliverables:**
- Full dataflow integration
- File-task to child-task relationships
- Metadata inheritance working

### Phase 4: Performance & Polish (Week 7-8)

**Components to Implement:**
- [ ] `src/dataflow/indexer/FileSourceIndex.ts` - Specialized indexing
- [ ] Worker integration for performance
- [ ] Caching implementation
- [ ] Settings UI components
- [ ] Documentation and examples

**Deliverables:**
- Optimized performance for large vaults
- Complete settings interface
- User documentation
- Migration guide

### Phase 5: Advanced Features (Week 9-10)

**Components to Implement:**
- [ ] Custom recognition function support
- [ ] Advanced conflict resolution
- [ ] Bulk operations for file tasks
- [ ] Export/import functionality
- [ ] Advanced filtering for file tasks

**Deliverables:**
- Advanced user customization options
- Bulk management capabilities
- Integration with existing tools

## API Specifications

### FileSource Class

```typescript
export class FileSource {
  constructor(
    private app: App,
    private config: FileSourceConfiguration
  );
  
  /** Initialize the FileSource */
  initialize(): void;
  
  /** Check if a file should be treated as a task */
  shouldCreateFileTask(filePath: string): Promise<boolean>;
  
  /** Convert a file to a FileSource task */
  createFileTask(filePath: string): Promise<Task<FileSourceTaskMetadata> | null>;
  
  /** Update an existing file task */
  updateFileTask(filePath: string): Promise<Task<FileSourceTaskMetadata> | null>;
  
  /** Remove a file task */
  removeFileTask(filePath: string): Promise<void>;
  
  /** Get all file tasks */
  getAllFileTasks(): Promise<Task<FileSourceTaskMetadata>[]>;
  
  /** Update configuration */
  updateConfiguration(config: Partial<FileSourceConfiguration>): void;
  
  /** Get statistics */
  getStats(): FileSourceStats;
  
  /** Cleanup and destroy */
  destroy(): void;
}
```

### Recognition Strategy Interface

```typescript
interface RecognitionStrategy {
  /** Strategy name */
  name: string;
  
  /** Check if file matches this strategy */
  matches(filePath: string, fileContent: string, fileCache: CachedMetadata): boolean;
  
  /** Extract task metadata from file */
  extractMetadata(filePath: string, fileContent: string, fileCache: CachedMetadata): Partial<FileSourceTaskMetadata>;
  
  /** Get strategy configuration */
  getConfig(): any;
  
  /** Update strategy configuration */
  updateConfig(config: any): void;
}
```

### Query API Extensions

```typescript
// Extensions to existing QueryAPI
interface QueryAPI {
  /** Get all file tasks */
  getFileTasks(): Promise<Task<FileSourceTaskMetadata>[]>;
  
  /** Get file tasks by criteria */
  getFileTasksByStrategy(strategy: string): Promise<Task<FileSourceTaskMetadata>[]>;
  
  /** Get child tasks for a file task */
  getChildTasks(fileTaskId: string): Promise<Task[]>;
  
  /** Get file task for a specific file */
  getFileTaskByPath(filePath: string): Promise<Task<FileSourceTaskMetadata> | null>;
}
```

## Testing Strategy

### Unit Tests

- **Recognition Strategy Tests**: Each strategy with various file configurations
- **FileSource Core Tests**: Basic functionality, event handling, configuration
- **Metadata Extraction Tests**: Parsing different file types and frontmatter formats
- **Configuration Validation Tests**: Ensure configuration changes are properly handled

### Integration Tests

- **Dataflow Integration**: End-to-end file task creation and updates
- **Event Flow Tests**: Verify proper event emission and handling
- **Repository Integration**: File task storage and retrieval
- **View Integration**: File tasks appearing in various views

### Performance Tests

- **Large Vault Tests**: 1000+ files with mixed file tasks
- **Recognition Performance**: Speed of strategy evaluation
- **Memory Usage**: Memory consumption with large numbers of file tasks
- **Worker Performance**: Performance gains from worker processing

### Edge Case Tests

- **Dual Role Conflicts**: Files that are both projects and tasks
- **Circular Dependencies**: File tasks with circular child relationships
- **Invalid Configurations**: Handling of malformed recognition criteria
- **File System Events**: Rapid file changes, renames, deletions

## Migration Considerations

### Backward Compatibility

- **Existing Functionality**: All current features remain unchanged
- **Configuration**: FileSource disabled by default
- **Data Integrity**: No changes to existing task data
- **Performance**: No impact when FileSource is disabled

### Migration Path

1. **Incremental Rollout**: Feature flag for gradual enablement
2. **Configuration Wizard**: Guided setup for common use cases
3. **Data Migration**: Tools to convert existing project files to file tasks
4. **Documentation**: Clear migration guides and examples

### Rollback Strategy

- **Clean Disable**: FileSource can be completely disabled without data loss
- **Data Preservation**: File task data stored separately, can be ignored
- **Event Cleanup**: Clean removal of FileSource events and handlers

## Performance Optimization

### Update Detection Strategy

FileSource implements intelligent update detection to minimize unnecessary processing:

#### Metadata Changes
- **Detection**: Uses Obsidian's MetadataCache for efficient frontmatter monitoring
- **Processing**: Only updates file task properties, not entire file
- **Events**: FILE_METADATA_CHANGED → FILE_TASK_PROPERTY_CHANGED
- **Optimization**: Diff-based property updates avoid full re-parsing

#### Content Changes
- **Detection**: Analyzes change type to determine impact
- **Processing**:
  - File not a task: Skip FileSource update entirely
  - File is a task: Check if children structure changed
  - Only task content: Trigger INLINE_TASK_CONTENT_CHANGED
- **Events**: FILE_CONTENT_CHANGED → conditional processing

#### Children Structure Detection
- **Optimization**: Only checks task IDs, not content
- **Caching**: Maintains previous state for comparison
- **Threshold**: Only updates on add/remove, not content changes
- **Performance**: O(n) comparison using Set operations

### Event Granularity

Fine-grained events prevent cascading updates:

```typescript
Events = {
  // Granular file events
  FILE_METADATA_CHANGED: "task-genius:file-metadata-changed",
  FILE_CONTENT_CHANGED: "task-genius:file-content-changed",
  
  // Specific file task events
  FILE_TASK_PROPERTY_CHANGED: "task-genius:file-task-property-changed",
  FILE_TASK_CHILDREN_CHANGED: "task-genius:file-task-children-changed",
  
  // Inline task events
  INLINE_TASK_CONTENT_CHANGED: "task-genius:inline-task-content-changed"
}
```

### Update Decision Logic

```typescript
interface UpdateDecision {
  update: boolean;
  reason: 'not-a-file-task' | 'task-status-changed' | 
          'task-properties-changed' | 'children-structure-changed' | 
          'no-relevant-changes';
  details?: any;
}

class FileSourceUpdateDetector {
  async shouldUpdateFileTask(
    filePath: string,
    changeReason: 'metadata' | 'content' | 'create' | 'delete'
  ): Promise<UpdateDecision> {
    // Smart detection logic based on change type
    // Minimizes false positives and unnecessary updates
  }
}
```

### Performance Characteristics

#### Typical Operations
- **Metadata update**: < 10ms (property extraction only)
- **Children structure check**: < 20ms (ID comparison only)
- **Full file task update**: < 50ms (includes augmentation)
- **Inline task update (no file task)**: 0ms FileSource overhead

#### Memory Optimization
- **State caching**: ~100 bytes per file task
- **Children ID cache**: ~20 bytes per child task
- **Total overhead**: < 1MB for 1000 file tasks

#### Batch Processing
- **Debounced updates**: 300ms delay for rapid changes
- **Batch merging**: Multiple file updates processed together
- **Worker offloading**: Heavy processing in background threads

### Cache Strategy

```typescript
interface FileTaskCache {
  // Minimal cache for change detection
  fileTaskExists: boolean;
  frontmatterHash: string;  // Quick property change detection
  childTaskIds: Set<string>; // Structure tracking only
  lastUpdated: number;
}
```

### Optimization Techniques

1. **Early Exit Patterns**
   - Non-task files skip processing immediately
   - Known unchanged files use cached results
   - Quick hash comparisons before deep analysis

2. **Selective Processing**
   - Only parse changed sections
   - Reuse unchanged metadata
   - Incremental children updates

3. **Smart Caching**
   - TTL-based cache invalidation
   - Content hash validation
   - Memory-bounded cache size

4. **Event Deduplication**
   - Sequence-based duplicate detection
   - Merge rapid sequential updates
   - Coalesce related events

## Security Considerations

### File Access

- **Read-Only Operations**: FileSource only reads file metadata
- **Path Validation**: All file paths validated and sanitized
- **Permission Checks**: Respect Obsidian's file access permissions

### Configuration Security

- **Input Validation**: All configuration inputs validated
- **Custom Functions**: Custom recognition functions sandboxed
- **Path Traversal**: Protection against path traversal attacks

## Conclusion

The FileSource feature represents a natural evolution of the Task Genius plugin, extending the powerful dataflow architecture to support files as first-class task entities. The design maintains backward compatibility while providing flexible, performant, and user-friendly file task management.

The dual-role model allows users to organize their work hierarchically (files as projects containing tasks) while also treating files themselves as actionable items with due dates, priorities, and status tracking. This bridges the gap between project management and task management within Obsidian.

The implementation follows established architectural patterns, ensuring maintainability and consistency with the existing codebase. The extensive configuration options provide flexibility for various user workflows while maintaining simplicity for basic use cases.