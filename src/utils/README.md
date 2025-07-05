# Task Parsing and Management Utilities

This directory contains the core utilities for task parsing, management, and processing in the Obsidian Task Progress Bar plugin. The architecture is designed for high performance, extensibility, and support for multiple file formats.

## 🏗️ Architecture Overview

The task parsing system follows a layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Thread Layer                        │
├─────────────────────────────────────────────────────────────┤
│  TaskManager.ts          │  FileTaskManager.ts              │
│  (Orchestration)         │  (File-level Management)         │
├─────────────────────────────────────────────────────────────┤
│                    Service Layer                            │
├─────────────────────────────────────────────────────────────┤
│  TaskParsingService.ts   │  ProjectConfigManager.ts         │
│  (Enhanced Parsing)      │  (Project Configuration)         │
├─────────────────────────────────────────────────────────────┤
│                    Parser Layer                             │
├─────────────────────────────────────────────────────────────┤
│  parsing/                │  workers/                        │
│  ├─ CanvasParser.ts      │  ├─ ConfigurableTaskParser.ts    │
│  ├─ CanvasTaskUpdater.ts │  ├─ FileMetadataTaskParser.ts    │
│  └─ CoreTaskParser.ts    │  ├─ FileMetadataTaskUpdater.ts   │
│                          │  ├─ TaskWorkerManager.ts         │
│                          │  └─ TaskIndex.worker.ts          │
├─────────────────────────────────────────────────────────────┤
│                    Data Layer                               │
├─────────────────────────────────────────────────────────────┤
│  import/TaskIndexer.ts   │  persister.ts                    │
│  (Indexing & Caching)    │  (Persistence)                   │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Directory Structure

### Core Management Files

#### `TaskManager.ts`
**Primary orchestrator for all task operations**
- Coordinates between different parsing systems (main thread vs worker)
- Manages task indexing, caching, and persistence
- Handles file type detection and routing to appropriate parsers
- Integrates with Obsidian's file system events
- **Key Methods:**
  - `parseFileWithAppropriateParser()` - Routes files to correct parser based on type
  - `processFileWithWorker()` - Delegates to worker system for performance
  - `updateFileParsingConfiguration()` - Updates parsing settings

#### `FileTaskManager.ts`
**File-level task management using Bases plugin data**
- Manages tasks at the individual file level
- Integrates with external data sources
- Provides file-specific task operations

#### `TaskParsingService.ts`
**Enhanced parsing service with project configuration support**
- Provides main thread parsing with file system access
- Handles project configuration resolution
- Supports frontmatter metadata processing
- **Key Features:**
  - Enhanced metadata resolution
  - Project detection and configuration
  - File system traversal for project configs

### Parsing Directory (`parsing/`)

#### `CanvasParser.ts`
**Specialized parser for Obsidian Canvas files**
- Extracts tasks from Canvas text nodes
- Preserves spatial positioning and visual context
- Converts Canvas JSON to task objects
- **Features:**
  - Node ID tracking for task updates
  - Position metadata preservation
  - Color and styling information retention

#### `CanvasTaskUpdater.ts`
**Updates tasks within Canvas files**
- Modifies task content in Canvas text nodes
- Maintains Canvas file structure integrity
- Handles task status and metadata updates

#### `CoreTaskParser.ts`
**Core parsing logic for markdown tasks**
- Implements fundamental task parsing algorithms
- Handles task status, metadata, and hierarchy
- Supports multiple metadata formats (Tasks plugin, Dataview)
- **Parsing Features:**
  - Date extraction (due, start, scheduled)
  - Priority parsing
  - Project and context detection
  - Tag extraction
  - Recurrence pattern parsing

### Workers Directory (`workers/`)

#### `TaskWorkerManager.ts`
**Manages web worker pool for background processing**
- Coordinates multiple worker instances
- Implements priority-based task queuing
- Handles worker lifecycle and error recovery
- **Performance Features:**
  - Debounced file processing
  - Priority queues (HIGH, NORMAL, LOW)
  - Worker load balancing
  - Automatic retry mechanisms

#### `ConfigurableTaskParser.ts`
**Advanced markdown parser with configuration support**
- Highly configurable parsing engine
- Supports enhanced task features
- Handles file metadata inheritance
- **Configuration Options:**
  - Custom status mappings
  - Emoji-to-metadata mappings
  - Metadata parsing modes
  - Special tag prefixes

#### `FileMetadataTaskParser.ts`
**Extracts tasks from file metadata and tags**
- Creates virtual tasks from frontmatter
- Generates tasks from file tags
- Supports file-level task management
- **Task Sources:**
  - Frontmatter fields as tasks
  - File tags as task indicators
  - File properties as task metadata

#### `FileMetadataTaskUpdater.ts`
**Updates file metadata-based tasks**
- Modifies frontmatter when tasks change
- Handles file renaming operations
- Updates tag-based task metadata

#### `TaskIndex.worker.ts`
**Web worker implementation for background parsing**
- Runs parsing operations off the main thread
- Supports batch processing
- Handles multiple file formats
- **Worker Capabilities:**
  - Canvas and Markdown parsing
  - File metadata processing
  - Batch indexing operations
  - Error handling and reporting

### OnCompletion Action System

#### `onCompletion/BaseActionExecutor.ts`
**Abstract base class for all onCompletion actions**
- Provides task type detection and routing logic
- Automatically routes Canvas vs Markdown tasks to appropriate handlers
- Implements common error handling and result formatting
- **Key Features:**
  - Canvas task detection via `isCanvasTask()`
  - Automatic execution routing to `executeForCanvas()` or `executeForMarkdown()`
  - Shared utility methods for Canvas task operations

#### `onCompletion/DeleteActionExecutor.ts`
**Removes completed tasks from files**
- **Canvas Support**: Removes tasks from Canvas text nodes
- **Markdown Support**: Removes task lines from Markdown files
- Maintains file structure integrity

#### `onCompletion/MoveActionExecutor.ts`
**Moves completed tasks between files/sections**
- **Canvas to Canvas**: Moves tasks between Canvas text nodes
- **Canvas to Markdown**: Converts and moves to Markdown files
- **Markdown to Canvas**: Adds tasks to Canvas text nodes
- **Cross-format Support**: Seamless format conversion

#### `onCompletion/DuplicateActionExecutor.ts`
**Creates copies of completed tasks**
- **Metadata Preservation**: Optional metadata retention
- **Cross-format Duplication**: Support for all file type combinations
- **Timestamp Tracking**: Adds duplication timestamps

#### `onCompletion/ArchiveActionExecutor.ts`
**Archives completed tasks to designated files**
- **Default Archive Location**: `Archive/Completed Tasks.md`
- **Custom Archive Support**: User-defined archive files and sections
- **Canvas Integration**: Archives Canvas tasks to Markdown format

#### `onCompletion/CanvasTaskOperationUtils.ts`
**Utility class for Canvas task operations**
- **Text Node Management**: Find, create, and position Canvas text nodes
- **Section Handling**: Insert tasks into specific sections
- **Format Conversion**: Convert between Canvas and Markdown formats
- **Metadata Handling**: Preserve task metadata during operations

### Data Management

#### `import/TaskIndexer.ts`
**High-performance task indexing and querying**
- Maintains in-memory task indexes
- Provides fast task lookup and filtering
- Supports complex query operations
- **Index Types:**
  - File-based indexes
  - Tag-based indexes
  - Project and context indexes
  - Date-based indexes (due, start, scheduled)
  - Priority and completion status indexes

#### `persister.ts`
**Task data persistence and caching**
- Handles local storage operations
- Manages cache invalidation
- Provides data recovery mechanisms

### Utility Files

#### `TaskFilterUtils.ts`
**Advanced task filtering and search capabilities**
- Implements complex filter logic
- Supports multiple filter types
- Handles filter combinations and boolean logic

#### `taskUtil.ts`
**Common task utility functions**
- Provides backward compatibility functions
- Implements task parsing helpers
- Contains shared task manipulation logic

#### `fileTypeUtils.ts`
**File type detection and validation**
- Determines supported file types
- Routes files to appropriate parsers
- **Supported Types:**
  - Markdown (.md)
  - Canvas (.canvas)

## 🔄 Data Flow

### Task Parsing Flow

1. **File Detection**: `fileTypeUtils.ts` determines file type
2. **Parser Selection**: `TaskManager.ts` routes to appropriate parser
3. **Parsing Execution**: 
   - Canvas files → `CanvasParser.ts`
   - Markdown files → `ConfigurableTaskParser.ts` or worker system
4. **Indexing**: `TaskIndexer.ts` updates in-memory indexes
5. **Persistence**: `persister.ts` caches results

### Worker Processing Flow

1. **Queue Management**: `TaskWorkerManager.ts` manages processing queue
2. **Worker Dispatch**: Tasks sent to `TaskIndex.worker.ts`
3. **Background Parsing**: Worker processes files using appropriate parsers
4. **Result Handling**: Parsed tasks returned to main thread
5. **Index Update**: Results integrated into main task index

## 🚀 Performance Optimizations

### Worker System
- **Background Processing**: Heavy parsing operations run in web workers
- **Priority Queues**: Critical files processed first
- **Batch Processing**: Multiple files processed together
- **Debouncing**: Prevents excessive processing during rapid file changes

### Caching Strategy
- **In-Memory Indexes**: Fast task lookup without file system access
- **Persistent Cache**: Local storage for cross-session persistence
- **Incremental Updates**: Only reprocess changed files
- **Smart Invalidation**: Cache invalidation based on file modification times

### Parser Optimization
- **Configurable Parsing**: Disable unused features for better performance
- **Lazy Loading**: Parse only when needed
- **Regex Optimization**: Efficient pattern matching for task detection

## 🔧 Configuration

### Parser Configuration
```typescript
// Example parser configuration
const config: TaskParserConfig = {
  parseMetadata: true,
  parseTags: true,
  parseHeadings: true,
  metadataParseMode: MetadataParseMode.Both,
  statusMapping: {
    todo: " ",
    done: "x",
    cancelled: "-",
    // ... more mappings
  }
};
```

### Worker Configuration
```typescript
// Example worker manager options
const options: TaskManagerOptions = {
  useWorkers: true,
  maxWorkers: 4,
  debug: false
};
```

## 🧪 Testing and Development

### Entry Points for Developers

1. **TaskManager.ts** - Main integration point
2. **ConfigurableTaskParser.ts** - Core parsing logic
3. **TaskIndexer.ts** - Query and filtering operations
4. **CanvasParser.ts** - Canvas-specific functionality

### Common Development Tasks

- **Adding New Metadata Types**: Extend `CoreTaskParser.ts` extraction methods
- **Supporting New File Types**: Add to `fileTypeUtils.ts` and create parser
- **Custom Filtering**: Extend `TaskFilterUtils.ts` filter implementations
- **Performance Tuning**: Adjust worker pool size and queue priorities

## 🎯 OnCompletion Actions

The plugin supports automatic actions when tasks are completed through the `onCompletion` metadata field.

### Supported Actions

#### Delete Action
```markdown
- [ ] Task to delete on completion onCompletion:delete
```

#### Move Action
```markdown
- [ ] Task to move onCompletion:move(Archive.md)
- [ ] Task to move to section onCompletion:move(Archive.md, Completed Tasks)
```

#### Duplicate Action
```markdown
- [ ] Recurring task onCompletion:duplicate
- [ ] Duplicate to file onCompletion:duplicate(Templates.md)
- [ ] Duplicate without metadata onCompletion:duplicate(Templates.md, , false)
```

#### Archive Action
```markdown
- [ ] Task to archive onCompletion:archive
- [ ] Custom archive location onCompletion:archive(Custom Archive.md, Done)
```

### Canvas Task Support

All onCompletion actions fully support Canvas tasks:

- **Canvas to Canvas**: Move/duplicate tasks between Canvas files
- **Canvas to Markdown**: Convert Canvas tasks to Markdown format
- **Markdown to Canvas**: Add tasks to Canvas text nodes
- **Cross-format Operations**: Seamless integration between file types

#### Canvas-Specific Features

- **Text Node Management**: Automatic creation and positioning of new text nodes
- **Section Support**: Target specific sections within Canvas text nodes
- **Metadata Preservation**: Maintain task metadata during format conversion
- **JSON Structure Integrity**: Safe manipulation of Canvas file structure

## 📚 Related Documentation

- **Types**: See `src/types/` for data structure definitions
- **Configuration**: See `src/common/` for configuration schemas
- **Components**: See `src/components/` for UI integration
- **Settings**: See `src/common/setting-definition.ts` for user settings

---

This architecture provides a robust, scalable foundation for task management while maintaining excellent performance even with large vaults containing thousands of tasks.
