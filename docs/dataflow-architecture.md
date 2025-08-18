# Dataflow Architecture Documentation

## Overview

The Dataflow architecture is a modern, modular task management system that replaces the legacy TaskManager-based approach. It provides better separation of concerns, improved performance, and a more maintainable codebase.

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
│   └── Repository.ts # Task repository with indexing
├── parsers/          # High-level parsing entries
│   ├── CanvasEntry.ts
│   ├── FileMetaEntry.ts
│   └── MarkdownEntry.ts
├── persistence/      # Data persistence
│   └── Storage.ts    # Unified storage layer
├── project/          # Project management
│   └── Resolver.ts   # Project resolution logic
├── sources/          # Data sources
│   └── ObsidianSource.ts # File system monitoring
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
- **Repository**: Centralized indexing and querying
- **Storage**: Unified persistence layer

### 2. Event-Driven Architecture
- Centralized event system through `Events.ts`
- Consistent event naming and payload structure
- Decoupled components communicate via events

### 3. Progressive Migration
- Feature flag (`dataflowEnabled`) for safe rollout
- Backward compatibility maintained
- Gradual view migration support

## Component Responsibilities

### Orchestrator
- Coordinates all dataflow components
- Manages initialization and lifecycle
- Routes events between components

### QueryAPI
- Public interface for all data queries
- Abstracts internal repository complexity
- Provides consistent API for views

### Repository
- Maintains task index
- Handles snapshot persistence
- Emits update events

### Augmentor
- Applies task enhancement strategies
- Handles inheritance and deduplication
- Manages project references

### Storage
- Wraps LocalStorageCache
- Manages versioning and invalidation
- Provides namespace isolation

## Migration Status

### Completed Phases
- ✅ Phase A: Parallel initialization with feature flag
- ✅ Phase B: View migration to QueryAPI
- ✅ Phase C: Parser and enhancement separation
- ✅ Phase D: Unified persistence layer
- ✅ Phase E: Default enablement and cleanup

### Migrated Components
- All major views now support dataflow
- MCP server supports both bridges
- Core parsers moved to dataflow/core
- Workers consolidated in dataflow/workers

### Removed Legacy Files
- `utils/filterUtils.ts`
- `utils/projectFilter.ts`
- `mcp/bridge/TaskManagerBridge.ts`
- Old parser locations in utils/

## Usage

### Enabling Dataflow
```typescript
// In settings
experimental: {
  dataflowEnabled: true // Now default
}
```

### Querying Tasks
```typescript
// Using QueryAPI
const tasks = await queryAPI.getAllTasks();
const projectTasks = await queryAPI.getTasksByProject("MyProject");
const taggedTasks = await queryAPI.getTasksByTags(["important"]);
```

### Event Subscription
```typescript
// Subscribe to task updates
Events.on(Events.TASK_CACHE_UPDATED, (tasks) => {
  // Handle updated tasks
});
```

## Performance Improvements

1. **Snapshot Loading**: Fast startup from persisted state
2. **Worker Orchestration**: Better background processing
3. **Batch Operations**: Reduced I/O overhead
4. **Event Deduplication**: Fewer redundant updates

## Future Enhancements

1. **Write Operations**: Extend dataflow for task creation/updates
2. **Advanced Querying**: GraphQL-like query capabilities
3. **Real-time Sync**: Multi-device synchronization
4. **Plugin API**: External plugin support

## Rollback Procedure

If issues arise, dataflow can be disabled:

1. Settings → Advanced → Experimental Features
2. Toggle "Enable Dataflow Architecture" to OFF
3. Restart Obsidian

The legacy TaskManager system remains available for one version cycle.

## Development Guidelines

### Adding New Features
1. Implement in dataflow architecture first
2. Add conditional logic for backward compatibility
3. Test both modes thoroughly

### Debugging
- Enable debug logging: `console.log("[Dataflow]", ...)`
- Check Events for event flow
- Verify Repository state in console

### Testing
```bash
# Run tests
npm test

# Test with dataflow enabled
DATAFLOW_ENABLED=true npm test

# Test with dataflow disabled  
DATAFLOW_ENABLED=false npm test
```

## Conclusion

The Dataflow architecture provides a solid foundation for future enhancements while maintaining backward compatibility. Its modular design enables easier testing, better performance, and cleaner code organization.