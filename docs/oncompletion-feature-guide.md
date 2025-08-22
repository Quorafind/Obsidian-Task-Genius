# OnCompletion Feature Guide

## Overview

The OnCompletion feature allows you to define automatic actions that occur when a task is marked as completed. This is useful for workflows like archiving completed tasks, triggering dependent tasks, or moving tasks to different locations.

## Architecture

The OnCompletion system consists of:
- **OnCompletionManager**: Core manager that listens for task completion events
- **Action Executors**: Individual executors for each action type (delete, move, archive, etc.)
- **Event System**: Integration with `task-genius:task-completed` event
- **WriteAPI Integration**: Automatic triggering when tasks are completed via API

## Setup

The OnCompletion feature is automatically initialized when the plugin loads with indexer enabled. No additional configuration is required.

## Usage

### Task Metadata Format

Add an `onCompletion` property to your task metadata:

#### Simple Format (Emoji)
```markdown
- [ ] Task content 🏁 delete
- [ ] Task content 🏁 keep  
- [ ] Task content 🏁 archive
- [ ] Task content 🏁 move:Projects/Archive.md
- [ ] Task content 🏁 complete:task-id-1,task-id-2
- [ ] Task content 🏁 duplicate:Projects/Templates.md
```

#### Dataview Format
```markdown
- [ ] Task content [onCompletion:: delete]
- [ ] Task content [onCompletion:: keep]
- [ ] Task content [onCompletion:: archive]
- [ ] Task content [onCompletion:: move:Projects/Archive.md]
- [ ] Task content [onCompletion:: complete:task-id-1,task-id-2]
- [ ] Task content [onCompletion:: duplicate:Projects/Templates.md]
```

#### JSON Format (Advanced)
```markdown
- [ ] Task content 🏁 {"type":"move","targetFile":"Archive.md","section":"## Completed"}
- [ ] Task content 🏁 {"type":"complete","taskIds":["id1","id2"],"cascade":true}
- [ ] Task content 🏁 {"type":"archive","archiveFile":"2024-Archive.md","preserveMetadata":true}
```

## Action Types

### DELETE
Removes the task from the file when completed.
```markdown
- [ ] Temporary task 🏁 delete
```

### KEEP
Keeps the task as completed (default behavior, useful for overriding).
```markdown
- [ ] Important task 🏁 keep
```

### ARCHIVE
Moves the task to an archive file (default: "Archive.md" in same folder).
```markdown
- [ ] Task to archive 🏁 archive
- [ ] Custom archive 🏁 archive:Completed/2024.md
```

### MOVE
Moves the task to a different file or section.
```markdown
- [ ] Task to move 🏁 move:Another File.md
- [ ] Move to section 🏁 {"type":"move","targetFile":"File.md","section":"## Done"}
```

### COMPLETE
Automatically completes other tasks when this task is completed.
```markdown
- [ ] Parent task 🏁 complete:child-task-id-1,child-task-id-2
- [ ] Cascade completion 🏁 {"type":"complete","taskIds":["id1"],"cascade":true}
```

### DUPLICATE
Creates a copy of the task in another location when completed.
```markdown
- [ ] Template task 🏁 duplicate:Templates/Recurring.md
- [ ] Duplicate and reset 🏁 {"type":"duplicate","targetFile":"Tomorrow.md","resetStatus":true}
```

## Event Flow

1. User marks task as completed (via UI, command, or API)
2. WriteAPI detects completion and triggers `task-genius:task-completed` event
3. OnCompletionManager receives the event
4. Manager parses the `onCompletion` metadata
5. Appropriate executor is invoked
6. Action is performed (delete, move, archive, etc.)
7. Result is logged

## Integration Points

### WriteAPI
The WriteAPI automatically triggers the completion event:
- `updateTask()` - When `completed: true` is set
- `updateTaskStatus()` - When task is marked complete
- `updateCanvasTask()` - Canvas tasks also trigger events

### Editor Extensions
- `monitorTaskCompletedExtension` - Monitors inline completions
- `status-switcher` - Triggers on status changes
- `status-cycler` - Triggers on cycle operations

### Canvas Support
Canvas tasks fully support OnCompletion:
```javascript
// Canvas task with onCompletion
{
  "type": "text",
  "text": "- [ ] Canvas task 🏁 delete",
  ...
}
```

## Error Handling

If an OnCompletion action fails:
1. Error is logged to console
2. Task remains completed
3. No rollback occurs
4. User is not notified (silent failure)

To debug issues:
1. Open Developer Console (Ctrl+Shift+I)
2. Look for "OnCompletionManager" logs
3. Check for parsing or execution errors

## Best Practices

1. **Use simple format** for basic actions (delete, keep, archive)
2. **Use JSON format** for complex configurations
3. **Test actions** on non-critical tasks first
4. **Validate file paths** exist before using move/archive
5. **Use task IDs** carefully with complete action

## Examples

### Daily Task Cleanup
```markdown
## Daily Tasks
- [ ] Review emails 🏁 delete
- [ ] Update status report 🏁 move:Completed/2024-08.md
- [ ] Team standup 🏁 delete
```

### Project Dependencies
```markdown
## Project Steps
- [ ] Design mockups 🆔 design-001
- [ ] Implement frontend 🆔 frontend-001 🏁 complete:testing-001
- [ ] Write tests 🆔 testing-001 🏁 complete:deploy-001
- [ ] Deploy to production 🆔 deploy-001
```

### Recurring Task Template
```markdown
## Templates
- [ ] Weekly review 🏁 duplicate:Next Week.md
- [ ] Monthly report 🏁 {"type":"duplicate","targetFile":"Next Month.md","resetStatus":true}
```

## Configuration

Currently, OnCompletion actions are defined per-task via metadata. Global configuration options may be added in future versions.

## Limitations

- Actions are not undoable
- Circular dependencies in `complete` action may cause issues
- File operations may fail if target doesn't exist
- No UI for configuring actions (metadata only)

## Migration from TaskManager

The OnCompletion feature is fully compatible with the new Dataflow architecture:

| Component | Old (TaskManager) | New (Dataflow) |
|-----------|------------------|----------------|
| Manager | Part of TaskManager | Standalone OnCompletionManager |
| Events | Manual triggering | Automatic via WriteAPI |
| Canvas | Limited support | Full support |
| Performance | Synchronous | Asynchronous |

## Testing OnCompletion

To test if OnCompletion is working:

1. Create a test task:
```markdown
- [ ] Test task 🏁 delete
```

2. Mark it complete using:
   - Click the checkbox
   - Use keyboard shortcut
   - Use WriteAPI

3. Check that the task is deleted

4. Check console for logs:
```
[Plugin] OnCompletionManager initialized
handleTaskCompleted {task object}
parseResult {config object}
```

## Troubleshooting

### OnCompletion not triggering
- Ensure indexer is enabled in settings
- Check that task has valid onCompletion metadata
- Verify task-completed event is firing (check console)
- Ensure OnCompletionManager is loaded

### Action failing
- Check file paths are correct
- Ensure target files exist for move/archive
- Verify task IDs exist for complete action
- Check console for specific error messages

### Performance issues
- Large batch operations may be slow
- Consider using delete instead of archive for many tasks
- Avoid deep cascade chains in complete action