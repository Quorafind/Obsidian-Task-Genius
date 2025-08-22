# Canvas Task API Guide

## Overview

The WriteAPI now provides comprehensive support for Canvas tasks, allowing you to create, update, delete, and manipulate tasks within Obsidian Canvas files (.canvas).

## Architecture

Canvas task support is implemented through:
- **CanvasTaskUpdater**: Core utility class handling Canvas-specific operations
- **WriteAPI Integration**: Automatic detection and routing of Canvas tasks
- **Event System**: Proper event emission for dataflow updates

## API Methods

### Automatic Detection

The following methods automatically detect Canvas tasks and route them appropriately:

```typescript
// These methods work for both regular and Canvas tasks
writeAPI.updateTask(args)
writeAPI.deleteTask(args)
writeAPI.updateTaskStatus(args)
```

### Canvas-Specific Methods

#### Update Canvas Task
```typescript
await writeAPI.updateCanvasTask({
  taskId: "task-123",
  updates: {
    content: "Updated task content",
    completed: true,
    metadata: {
      priority: 3,
      dueDate: new Date().getTime()
    }
  }
})
```

#### Delete Canvas Task
```typescript
await writeAPI.deleteCanvasTask({
  taskId: "task-123"
})
```

#### Move Canvas Task
```typescript
await writeAPI.moveCanvasTask({
  taskId: "task-123",
  targetFilePath: "another-canvas.canvas",
  targetNodeId: "node-456", // Optional: specific node
  targetSection: "## Tasks" // Optional: section within node
})
```

#### Duplicate Canvas Task
```typescript
await writeAPI.duplicateCanvasTask({
  taskId: "task-123",
  targetFilePath: "target.canvas", // Optional: defaults to same file
  targetNodeId: "node-789",        // Optional: specific node
  targetSection: "## Duplicates",  // Optional: section within node
  preserveMetadata: false          // Optional: whether to keep completion data
})
```

#### Add Task to Canvas Node
```typescript
await writeAPI.addTaskToCanvasNode({
  filePath: "my-canvas.canvas",
  content: "New task content",
  targetNodeId: "node-123",     // Optional: creates new node if not specified
  targetSection: "## New Tasks", // Optional: section within node
  completed: false,
  metadata: {
    project: "MyProject",
    priority: 2,
    tags: ["important", "review"]
  }
})
```

### Utility Methods

#### Check if Task is Canvas Task
```typescript
const isCanvas = writeAPI.isCanvasTask(task);
```

#### Get Canvas Task Updater Instance
```typescript
const canvasUpdater = writeAPI.getCanvasTaskUpdater();
// Use for advanced Canvas operations
```

## Task Detection

Canvas tasks are identified by:
- File extension: `.canvas`
- Metadata property: `sourceType === "canvas"`
- Canvas node ID: `metadata.canvasNodeId`

## Event Flow

When Canvas tasks are updated:
1. WriteAPI detects Canvas task type
2. Routes to CanvasTaskUpdater
3. Updates Canvas JSON structure
4. Emits `WRITE_OPERATION_START` event
5. Writes to vault
6. Emits `TASK_UPDATED` event for dataflow
7. Emits `WRITE_OPERATION_COMPLETE` event

## Error Handling

All Canvas operations return a result object:

```typescript
interface Result {
  success: boolean;
  error?: string;
  task?: Task;      // For update operations
  updatedContent?: string; // For debugging
}
```

Example error handling:
```typescript
const result = await writeAPI.updateCanvasTask({
  taskId: "task-123",
  updates: { completed: true }
});

if (!result.success) {
  console.error("Failed to update Canvas task:", result.error);
  // Handle error appropriately
}
```

## Canvas Task Metadata

Canvas tasks include special metadata:

```typescript
interface CanvasTaskMetadata extends StandardTaskMetadata {
  sourceType: "canvas";
  canvasNodeId: string;    // ID of the Canvas text node
  canvasNodeX?: number;    // Node position
  canvasNodeY?: number;
  canvasNodeWidth?: number; // Node dimensions
  canvasNodeHeight?: number;
}
```

## Implementation Details

### Task Matching
Canvas tasks are matched within nodes using:
1. Original markdown content
2. Core content extraction (removing metadata)
3. Line-by-line comparison

### Metadata Preservation
When updating Canvas tasks, the system:
- Preserves task indentation
- Maintains metadata format preferences (emoji vs dataview)
- Handles project/context tags correctly
- Updates completion dates automatically

### Node Management
- New nodes are automatically positioned to avoid overlaps
- Empty nodes are handled gracefully
- Multi-task nodes are supported

## Best Practices

1. **Always check task type** before performing Canvas-specific operations
2. **Use automatic detection** when possible (updateTask, deleteTask, updateTaskStatus)
3. **Handle errors gracefully** - Canvas operations can fail due to JSON parsing or node issues
4. **Emit proper events** to ensure dataflow stays synchronized
5. **Preserve metadata format** according to user preferences

## Migration from TaskManager

If migrating from the old TaskManager system:

| TaskManager Method | WriteAPI Equivalent |
|-------------------|-------------------|
| `canvasTaskUpdater.updateCanvasTask()` | `writeAPI.updateCanvasTask()` |
| `canvasTaskUpdater.deleteCanvasTask()` | `writeAPI.deleteCanvasTask()` |
| `canvasTaskUpdater.moveCanvasTask()` | `writeAPI.moveCanvasTask()` |
| `canvasTaskUpdater.duplicateCanvasTask()` | `writeAPI.duplicateCanvasTask()` |
| Direct CanvasTaskUpdater usage | `writeAPI.getCanvasTaskUpdater()` |

## Testing

Canvas task operations are tested in:
- `/src/__tests__/CanvasTaskUpdater.test.ts`
- `/src/__tests__/CanvasIntegration.test.ts`
- `/src/__tests__/CanvasTaskMatching.integration.test.ts`

## Limitations

- Canvas files must be valid JSON
- Node IDs must be unique within a Canvas
- Task line matching may fail if content is heavily modified outside the system
- Bulk operations on Canvas tasks may be slower than regular tasks due to JSON parsing

## Future Enhancements

Potential improvements:
- Batch Canvas operations for better performance
- Canvas-specific query methods in QueryAPI
- Visual task positioning helpers
- Canvas template support