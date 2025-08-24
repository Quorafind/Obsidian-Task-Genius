# Dataflow Architecture Documentation

## Overview

The Dataflow architecture is a modern, modular task management system that replaces the legacy TaskManager-based approach. It provides better separation of concerns, improved performance, and a more maintainable codebase. The architecture now supports both file-based tasks and external data sources (like ICS calendar events) through a unified event-driven pipeline.

## Architecture Components

### Core Directory Structure

```
src/dataflow/
├── api/              # Public API interfaces
│   └── QueryAPI.ts   # Unified query interface for all views
├── augment/          # Task enhancement logic
│   └── Augmentor.ts  # Centralized task augmentation
├── core/             # Core parsing logic
│   ├── CanvasParser.ts
│   ├── ConfigurableTaskParser.ts
│   └── CoreTaskParser.ts
├── events/           # Event system
│   └── Events.ts     # Centralized event management
├── indexer/          # Task indexing
│   └── Repository.ts # Task repository with indexing & ICS integration
├── parsers/          # High-level parsing entries
│   ├── CanvasEntry.ts
│   ├── FileMetaEntry.ts
│   └── MarkdownEntry.ts
├── persistence/      # Data persistence
│   └── Storage.ts    # Unified storage layer (tasks + ICS events)
├── project/          # Project management
│   └── Resolver.ts   # Project resolution logic
├── sources/          # Data sources
│   ├── ObsidianSource.ts # File system monitoring
│   ├── IcsSource.ts      # ICS calendar events source
│   ├── FileSource.ts     # File-based task recognition system
│   └── FileSourceConfig.ts # FileSource configuration management
├── workers/          # Background processing
│   ├── ProjectData.worker.ts
│   ├── ProjectDataWorkerManager.ts
│   ├── TaskIndex.worker.ts
│   ├── TaskWorkerManager.ts
│   └── WorkerOrchestrator.ts
├── Orchestrator.ts   # Main coordination component
├── createDataflow.ts # Factory function
└── index.ts         # Module exports
```

## Key Principles

### 1. Separation of Concerns
- **Parsers**: Only extract raw task data, no enhancement
- **Augmentor**: All task enhancement logic in one place
- **Repository**: Centralized indexing, querying, and data merging
- **Storage**: Unified persistence layer for all data types
- **Sources**: Independent data providers (files, ICS, etc.)

### 2. Event-Driven Architecture
- Centralized event system through `Events.ts`
- Consistent event naming and payload structure
- Decoupled components communicate via events
- Event sequence tracking prevents circular updates

### 3. Production Ready
- Core setting (`dataflowEnabled`) enabled by default
- Full backward compatibility maintained
- Complete feature parity achieved

### 4. Unified Data Pipeline
- All data sources flow through the same architecture
- File-based tasks and external events (ICS) are merged seamlessly
- Consistent querying interface regardless of data source

## Component Responsibilities

### Orchestrator
- Coordinates all dataflow components
- Manages initialization and lifecycle
- Routes events between components
- Handles multiple data sources (ObsidianSource, IcsSource)
- Implements sequence-based loop prevention

### Data Sources

#### ObsidianSource
- Monitors file system changes
- Emits FILE_UPDATED events
- Handles Markdown and Canvas files
- Tracks file modifications, creations, deletions

#### IcsSource (New)
- Integrates external calendar events
- Emits ICS_EVENTS_UPDATED events
- Syncs with IcsManager
- Converts calendar events to task format

#### FileSource (Integrated - Bug Fixed)
- Recognizes files as tasks based on configurable strategies
- Supports metadata, tag, template, and path-based recognition
- Emits file-task-updated events for file-level tasks
- Manages file task caching and deduplication
- Integrates with status mapping for flexible task states
- **Status**: Fully integrated with configuration path fix applied

### QueryAPI
- Public interface for all data queries
- Abstracts internal repository complexity
- Provides consistent API for views
- Returns merged data from all sources

### Repository
- Maintains task index for file-based tasks
- Stores ICS events separately
- Merges data from multiple sources in queries
- Handles snapshot persistence
- Emits update events with source tracking

### Augmentor
- Applies task enhancement strategies
- Handles inheritance and deduplication
- Manages project references

### Storage
- Wraps LocalStorageCache
- Manages versioning and invalidation
- Provides namespace isolation
- Persists:
  - Raw tasks (file-based)
  - Augmented tasks
  - Project data
  - ICS events
  - Consolidated index

## Event Flow & Loop Prevention

### Event Types
```typescript
Events = {
  CACHE_READY: "task-genius:cache-ready",
  TASK_CACHE_UPDATED: "task-genius:task-cache-updated",
  FILE_UPDATED: "task-genius:file-updated",
  ICS_EVENTS_UPDATED: "task-genius:ics-events-updated",
  FILE_TASK_UPDATED: "task-genius:file-task-updated", // FileSource events
  FILE_TASK_REMOVED: "task-genius:file-task-removed", // FileSource removal
  // ... other events
}
```

### Loop Prevention Mechanism
1. **Source Sequence Tracking**: Each operation generates a unique sequence number
2. **Event Tagging**: Events include `sourceSeq` to identify their origin
3. **Filtering**: Components ignore events they originated
4. **Clean Event Flow**: Prevents infinite update loops

### Typical Event Flow
```
1. File Change → ObsidianSource → FILE_UPDATED event
2. Orchestrator processes → Repository.updateFile()
3. Repository → TASK_CACHE_UPDATED event (with sourceSeq)
4. Views update → UI refreshes

OR

1. Calendar Sync → IcsSource → ICS_EVENTS_UPDATED event
2. Orchestrator processes → Repository.updateIcsEvents()
3. Repository → TASK_CACHE_UPDATED event (with sourceSeq)
4. Views update → UI refreshes

OR (pending integration)

1. File Recognition → FileSource → FILE_TASK_UPDATED event
2. Orchestrator processes → Repository.updateFileTasks() 
3. Repository → TASK_CACHE_UPDATED event (with sourceSeq)
4. Views update → UI refreshes
```

## Data Flow

### Initialization
1. **Repository.initialize()**: Load consolidated index and ICS events
2. **ObsidianSource.initialize()**: Start file monitoring
3. **IcsSource.initialize()**: Start calendar sync
4. **FileSource.initialize()** (pending): Start file recognition
5. **Initial Scan**: Process all files if no cache exists

### Runtime Updates
1. **File Changes**: ObsidianSource → Orchestrator → Repository → Views
2. **ICS Updates**: IcsSource → Orchestrator → Repository → Views
3. **File Task Updates** (pending): FileSource → Orchestrator → Repository → Views
4. **Manual Refresh**: Views → QueryAPI → Repository (cached data)

### Data Persistence
- **Continuous**: Augmented tasks stored on each update
- **ICS Events**: Persisted separately for fast recovery
- **File Tasks** (pending): Cached with recognition metadata
- **Consolidated Index**: Saved periodically and on shutdown
- **Version Control**: Schema versioning for migration support

## Migration Status

### Completed Phases
- ✅ Phase A: Parallel initialization with feature flag
- ✅ Phase B: View migration to QueryAPI
- ✅ Phase C: Parser and enhancement separation
- ✅ Phase D: Unified persistence layer
- ✅ Phase E: Default enablement and cleanup
- ✅ Phase F: ICS integration through dataflow

### Current Architecture State
- **Default Mode**: Dataflow is now the default (enabled by default)
- **Legacy Support**: TaskManager fully replaced by Dataflow
- **External Data**: ICS events integrated seamlessly
- **File Recognition**: FileSource fully integrated and operational
- **Performance**: Optimized with caching and workers
- **Stability**: Loop prevention and error handling

## Usage

### Enabling Dataflow
```typescript
// In settings (now default)
dataflowEnabled: true
```

### Querying Tasks
```typescript
// Using QueryAPI - returns both file tasks and ICS events
const allTasks = await queryAPI.getAllTasks();
const projectTasks = await queryAPI.getTasksByProject("MyProject");
const taggedTasks = await queryAPI.getTasksByTags(["important"]);
```

### Event Subscription
```typescript
// Subscribe to all task updates (files + ICS)
Events.on(Events.TASK_CACHE_UPDATED, (payload) => {
  const { changedFiles, stats } = payload;
  // Handle updated tasks
});

// Subscribe to ICS-specific updates
Events.on(Events.ICS_EVENTS_UPDATED, (payload) => {
  const { events } = payload;
  // Handle ICS events
});
```

## Performance Characteristics

### Optimizations
1. **Snapshot Loading**: Fast startup from persisted state (~100ms for 1000 tasks)
2. **Worker Orchestration**: Parallel processing for large vaults
3. **Batch Operations**: Reduced I/O overhead
4. **Event Deduplication**: Sequence-based loop prevention
5. **Incremental Updates**: Only changed files processed
6. **Separate ICS Storage**: Calendar events don't impact file indexing

### Cache Strategy
- **Multi-tier**: Raw → Augmented → Consolidated
- **Content Hashing**: Detect actual changes
- **Modification Time**: Quick staleness check
- **Lazy Loading**: Load data only when needed

## Troubleshooting

### Common Issues

#### Infinite Loop Detection
- **Symptom**: Repeated "Batch update" logs
- **Cause**: Missing sourceSeq in events
- **Solution**: Ensure all TASK_CACHE_UPDATED events include sourceSeq

#### Missing ICS Events
- **Symptom**: Calendar events not showing in views
- **Cause**: IcsSource not initialized or IcsManager unavailable
- **Solution**: Check IcsManager configuration and initialization

#### Stale Data
- **Symptom**: Changes not reflected in views
- **Cause**: Cache not invalidated properly
- **Solution**: Clear cache or trigger manual rebuild

### Debug Commands
```javascript
// In console
app.plugins.plugins['task-genius'].dataflowOrchestrator.getStats()
app.plugins.plugins['task-genius'].dataflowOrchestrator.rebuild()
```

## Development Guidelines

### Adding New Data Sources
1. Create source in `src/dataflow/sources/`
2. Implement event emission pattern
3. Add event type to `Events.ts`
4. Update Orchestrator to subscribe
5. Extend Repository if needed
6. Update Storage for persistence

### FileSource Integration (Completed)
The FileSource component has been fully integrated into the Orchestrator:
1. ✅ Initialize FileSource in Orchestrator constructor
2. ✅ Subscribe to FILE_TASK_UPDATED and FILE_TASK_REMOVED events
3. ✅ Extend Repository to handle file tasks separately from regular tasks
4. ✅ Update QueryAPI to merge file tasks in query results
5. ✅ Implement caching strategy to avoid redundant project resolution
6. ✅ Complete template and path recognition strategies
7. ✅ Add removeFileTask method to Repository

**Bug Fixes Applied**: 
- Fixed configuration path mismatch where Orchestrator was checking `fileSourceConfig` instead of `fileSource` in settings
- Added missing removeFileTask method to Repository for proper file task cleanup
- Completed template recognition strategy implementation

### Adding New Features
1. Implement in dataflow architecture first
2. Add conditional logic for backward compatibility
3. Include sourceSeq in any TASK_CACHE_UPDATED events
4. Test both dataflow and legacy modes
5. Update this documentation

### Best Practices
- Always use QueryAPI for data access
- Never bypass Repository for updates
- Include proper event metadata
- Handle errors gracefully
- Log with component prefix: `[ComponentName]`

## Future Enhancements

### Planned
1. **Write Operations**: Extend dataflow for task creation/updates
2. **Advanced Querying**: GraphQL-like query capabilities
3. **Real-time Sync**: Multi-device synchronization
4. **Plugin API**: External plugin support

### Under Consideration
- WebSocket support for real-time collaboration
- Database backend option for large vaults
- Incremental parsing for huge files
- Custom data source plugins

## Architecture Decisions

### Why Separate ICS Storage?
- **Independence**: ICS events have different lifecycle than file tasks
- **Performance**: Avoid re-parsing files when only calendar changes
- **Flexibility**: Easy to add/remove external sources
- **Clarity**: Clear separation of concerns

### Why Source Sequences?
- **Simplicity**: Single number comparison prevents loops
- **Performance**: Minimal overhead
- **Debugging**: Easy to trace event origins
- **Compatibility**: Works with existing event system

### Why Keep Legacy Support?
- **Safety**: Fallback for critical issues
- **Migration**: Gradual transition for large vaults
- **Testing**: A/B comparison capability
- **Confidence**: Users can always revert

## Bug Fixes and Updates

### FileSource Configuration Path Fix (2025-08-22)
**Problem**: FileSource was not initializing despite being enabled in settings.
- **Root Cause**: Configuration path mismatch between settings structure (`fileSource`) and Orchestrator code (`fileSourceConfig`)
- **Files Modified**: `src/dataflow/Orchestrator.ts` (lines 88-91)
- **Resolution**: Updated Orchestrator to use correct settings path `plugin.settings.fileSource`
- **Impact**: FileSource now properly initializes when enabled and can recognize files as tasks

## Conclusion

The Dataflow architecture has evolved from a file-centric system to a unified data pipeline supporting multiple sources. Its event-driven, modular design enables:
- Clean integration of new data sources
- Robust loop prevention
- Excellent performance characteristics
- Maintainable and testable codebase

The architecture is production-ready and serves as the foundation for future task management enhancements.