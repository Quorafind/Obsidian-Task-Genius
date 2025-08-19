# Directory Structure Refactoring Plan

## Overview
This document outlines the comprehensive refactoring plan for reorganizing the `src/utils` directory and establishing a clearer, more maintainable directory structure for the Task Genius plugin.

## Current Issues

### Problem Analysis
1. **Mixed Responsibilities**: The `src/utils/` directory contains managers, services, parsers, utilities, and executors all mixed together
2. **Inconsistent Naming**: Files have inconsistent naming conventions (e.g., `TaskManager.ts` vs `taskUtil.ts`)
3. **Poor Organization**: Related functionality is scattered across different locations
4. **Overly Large Files**: `TaskManager.ts` is over 27,000 tokens and should be split
5. **Unclear Dependencies**: Hard to understand relationships between components

## Existing Structures to Preserve

### Keep As-Is
- **`src/dataflow/`** - Already well-organized with:
  - `api/` - QueryAPI, WriteAPI for dataflow operations
  - `parsers/` - Dataflow-specific parsers (MarkdownEntry, FileMetaEntry, CanvasEntry)
  - `workers/` - Dataflow-specific workers
  - `core/`, `events/`, `sources/`, etc.
  
- **`src/mcp/`** - MCP server implementation with:
  - `auth/` - Authentication middleware
  - `bridge/` - Bridge implementations (DataflowBridge, TaskManagerBridge)
  - `types/` - Type definitions

## New Directory Structure

```
src/
├── cache/                 # Caching and storage utilities
│   ├── local-storage-cache.ts    (from utils/persister.ts)
│   └── project-data-cache.ts     (from utils/ProjectDataCache.ts)
│
├── core/                  # Core business logic
│   ├── goal/             # Goal-related functionality (moved from utils/goal/)
│   │   ├── edit-mode.ts
│   │   ├── read-mode.ts
│   │   └── regex-goal.ts
│   ├── project-filter.ts        (from utils/projectFilter.ts)
│   ├── project-tree-builder.ts  (from utils/projectTreeBuilder.ts)
│   ├── task-indexer.ts          (from utils/import/TaskIndexer.ts)
│   └── workflow-converter.ts    (from utils/workflowConversion.ts)
│
├── dataflow/             # [EXISTING - NO CHANGES]
│   └── workers/          # Add worker-related utilities here
│       ├── [existing files]
│       ├── task-index-message.ts    (from utils/workers/TaskIndexWorkerMessage.ts)
│       └── deferred-promise.ts      (from utils/workers/deferred.ts)
│
├── executors/            # Action executors
│   └── completion/       # Task completion actions
│       ├── base-executor.ts         (from utils/onCompletion/BaseActionExecutor.ts)
│       ├── archive-executor.ts      (from utils/onCompletion/ArchiveActionExecutor.ts)
│       ├── complete-executor.ts     (from utils/onCompletion/CompleteActionExecutor.ts)
│       ├── delete-executor.ts       (from utils/onCompletion/DeleteActionExecutor.ts)
│       ├── duplicate-executor.ts    (from utils/onCompletion/DuplicateActionExecutor.ts)
│       ├── keep-executor.ts         (from utils/onCompletion/KeepActionExecutor.ts)
│       ├── move-executor.ts         (from utils/onCompletion/MoveActionExecutor.ts)
│       └── canvas-operation-utils.ts (from utils/onCompletion/CanvasTaskOperationUtils.ts)
│
├── managers/             # Feature-specific managers
│   ├── completion-manager.ts        (from utils/OnCompletionManager.ts)
│   ├── file-filter-manager.ts       (from utils/FileFilterManager.ts)
│   ├── file-task-manager.ts         (from utils/FileTaskManager.ts)
│   ├── habit-manager.ts             (from utils/HabitManager.ts)
│   ├── icon-manager.ts              (from utils/TaskGeniusIconManager.ts)
│   ├── ics-manager.ts                (from utils/ics/IcsManager.ts)
│   ├── onboarding-manager.ts        (from utils/OnboardingConfigManager.ts)
│   ├── project-config-manager.ts    (from utils/ProjectConfigManager.ts)
│   ├── rebuild-progress-manager.ts  (from utils/RebuildProgressManager.ts)
│   ├── reward-manager.ts            (from utils/RewardManager.ts)
│   ├── task-manager.ts              (from utils/TaskManager.ts)
│   ├── timer-manager.ts             (from utils/TaskTimerManager.ts)
│   └── version-manager.ts           (from utils/VersionManager.ts)
│
├── mcp/                  # [EXISTING - NO CHANGES]
│
├── parsers/              # General-purpose parsers (non-dataflow)
│   ├── canvas-parser.ts             (from utils/parsing/CanvasParser.ts)
│   ├── canvas-task-updater.ts       (from utils/parsing/CanvasTaskUpdater.ts)
│   ├── configurable-task-parser.ts  (from utils/workers/ConfigurableTaskParser.ts)
│   ├── context-detector.ts          (from utils/workers/ContextDetector.ts)
│   ├── file-metadata-parser.ts      (from utils/workers/FileMetadataTaskParser.ts)
│   ├── file-metadata-updater.ts     (from utils/workers/FileMetadataTaskUpdater.ts)
│   ├── holiday-detector.ts          (from utils/ics/HolidayDetector.ts)
│   ├── ics-parser.ts                 (from utils/ics/IcsParser.ts)
│   ├── ics-status-mapper.ts         (from utils/ics/StatusMapper.ts)
│   └── webcal-converter.ts          (from utils/ics/WebcalUrlConverter.ts)
│
├── services/             # Service classes
│   ├── settings-change-detector.ts  (from utils/SettingsChangeDetector.ts)
│   ├── task-parsing-service.ts      (from utils/TaskParsingService.ts)
│   ├── time-parsing-service.ts      (from utils/TimeParsingService.ts)
│   ├── timer-export-service.ts      (from utils/TaskTimerExporter.ts)
│   ├── timer-format-service.ts      (from utils/TaskTimerFormatter.ts)
│   └── timer-metadata-service.ts    (from utils/TaskTimerMetadataDetector.ts)
│
└── utils/                # Pure utility functions only
    ├── date/             # Date utilities
    │   ├── date-formatter.ts        (from utils/dateUtil.ts)
    │   └── date-helper.ts           (from utils/DateHelper.ts)
    ├── file/             # File utilities
    │   ├── file-operations.ts       (from utils/fileUtils.ts)
    │   └── file-type-detector.ts    (from utils/fileTypeUtils.ts)
    ├── task/             # Task utilities
    │   ├── filter-compatibility.ts  (from utils/filterUtils.ts)
    │   ├── priority-utils.ts        (from utils/priorityUtils.ts)
    │   ├── task-filter-utils.ts     (from utils/TaskFilterUtils.ts)
    │   ├── task-migration.ts        (from utils/taskMigrationUtils.ts)
    │   └── task-operations.ts       (from utils/taskUtil.ts - if not deprecated)
    ├── ui/               # UI utilities
    │   ├── tree-view-utils.ts       (from utils/treeViewUtil.ts)
    │   └── view-mode-utils.ts       (from utils/viewModeUtils.ts)
    └── id-generator.ts               (from utils/common.ts)
```

## Implementation Phases

### Phase 1: Directory Creation
Create all new directories before moving any files:
- `src/managers/`
- `src/services/`
- `src/executors/completion/`
- `src/parsers/`
- `src/cache/`
- `src/core/goal/`
- `src/utils/date/`
- `src/utils/file/`
- `src/utils/task/`
- `src/utils/ui/`

### Phase 2: Manager Migration
Move all manager classes from `src/utils/` to `src/managers/`:

| Original File | New Location | Rename Reason |
|--------------|--------------|---------------|
| `FileTaskManager.ts` | `managers/file-task-manager.ts` | Kebab-case consistency |
| `HabitManager.ts` | `managers/habit-manager.ts` | Kebab-case consistency |
| `TaskManager.ts` | `managers/task-manager.ts` | Kebab-case consistency |
| `OnCompletionManager.ts` | `managers/completion-manager.ts` | Clearer naming + kebab-case |
| `OnboardingConfigManager.ts` | `managers/onboarding-manager.ts` | Simpler name + kebab-case |
| `ProjectConfigManager.ts` | `managers/project-config-manager.ts` | Kebab-case consistency |
| `RebuildProgressManager.ts` | `managers/rebuild-progress-manager.ts` | Kebab-case consistency |
| `RewardManager.ts` | `managers/reward-manager.ts` | Kebab-case consistency |
| `TaskGeniusIconManager.ts` | `managers/icon-manager.ts` | Simpler name + kebab-case |
| `TaskTimerManager.ts` | `managers/timer-manager.ts` | Simpler name + kebab-case |
| `VersionManager.ts` | `managers/version-manager.ts` | Kebab-case consistency |
| `FileFilterManager.ts` | `managers/file-filter-manager.ts` | Kebab-case consistency |
| `ics/IcsManager.ts` | `managers/ics-manager.ts` | Flatten structure + kebab-case |

### Phase 3: Service Migration
Move service classes from `src/utils/` to `src/services/`:

| Original File | New Location | Rename Reason |
|--------------|--------------|---------------|
| `TaskParsingService.ts` | `services/task-parsing-service.ts` | Kebab-case consistency |
| `TimeParsingService.ts` | `services/time-parsing-service.ts` | Kebab-case consistency |
| `SettingsChangeDetector.ts` | `services/settings-change-detector.ts` | Kebab-case consistency |
| `TaskTimerExporter.ts` | `services/timer-export-service.ts` | Clearer naming + kebab-case |
| `TaskTimerFormatter.ts` | `services/timer-format-service.ts` | Clearer naming + kebab-case |
| `TaskTimerMetadataDetector.ts` | `services/timer-metadata-service.ts` | Clearer naming + kebab-case |

### Phase 4: Executor Migration
Move executors from `src/utils/onCompletion/` to `src/executors/completion/`:

| Original File | New Location | Rename Reason |
|--------------|--------------|---------------|
| `onCompletion/BaseActionExecutor.ts` | `executors/completion/base-executor.ts` | Simpler name + kebab-case |
| `onCompletion/ArchiveActionExecutor.ts` | `executors/completion/archive-executor.ts` | Simpler name + kebab-case |
| `onCompletion/CompleteActionExecutor.ts` | `executors/completion/complete-executor.ts` | Simpler name + kebab-case |
| `onCompletion/DeleteActionExecutor.ts` | `executors/completion/delete-executor.ts` | Simpler name + kebab-case |
| `onCompletion/DuplicateActionExecutor.ts` | `executors/completion/duplicate-executor.ts` | Simpler name + kebab-case |
| `onCompletion/KeepActionExecutor.ts` | `executors/completion/keep-executor.ts` | Simpler name + kebab-case |
| `onCompletion/MoveActionExecutor.ts` | `executors/completion/move-executor.ts` | Simpler name + kebab-case |
| `onCompletion/CanvasTaskOperationUtils.ts` | `executors/completion/canvas-operation-utils.ts` | Clearer naming + kebab-case |

### Phase 5: Parser Migration
Move parsers from various locations to appropriate directories:

| Original File | New Location | Rename Reason |
|--------------|--------------|---------------|
| `parsing/CanvasParser.ts` | `parsers/canvas-parser.ts` | Kebab-case consistency |
| `parsing/CanvasTaskUpdater.ts` | `parsers/canvas-task-updater.ts` | Kebab-case consistency |
| `ics/IcsParser.ts` | `parsers/ics-parser.ts` | Flatten structure + kebab-case |
| `ics/HolidayDetector.ts` | `parsers/holiday-detector.ts` | Flatten structure + kebab-case |
| `ics/StatusMapper.ts` | `parsers/ics-status-mapper.ts` | Clearer naming + kebab-case |
| `ics/WebcalUrlConverter.ts` | `parsers/webcal-converter.ts` | Simpler name + kebab-case |
| `workers/ConfigurableTaskParser.ts` | `parsers/configurable-task-parser.ts` | Kebab-case consistency |
| `workers/ContextDetector.ts` | `parsers/context-detector.ts` | Kebab-case consistency |
| `workers/FileMetadataTaskParser.ts` | `parsers/file-metadata-parser.ts` | Simpler name + kebab-case |
| `workers/FileMetadataTaskUpdater.ts` | `parsers/file-metadata-updater.ts` | Simpler name + kebab-case |

### Phase 6: Cache Migration
Move caching utilities to `src/cache/`:

| Original File | New Location | Rename Reason |
|--------------|--------------|---------------|
| `persister.ts` | `cache/local-storage-cache.ts` | Descriptive name + kebab-case |
| `ProjectDataCache.ts` | `cache/project-data-cache.ts` | Kebab-case consistency |

### Phase 7: Core Business Logic Migration
Move core business logic to `src/core/`:

| Original File | New Location | Rename Reason |
|--------------|--------------|---------------|
| `projectFilter.ts` | `core/project-filter.ts` | Kebab-case consistency |
| `projectTreeBuilder.ts` | `core/project-tree-builder.ts` | Kebab-case consistency |
| `workflowConversion.ts` | `core/workflow-converter.ts` | Clearer naming + kebab-case |
| `goal/` (entire directory) | `core/goal/` | Preserve structure |
| `import/TaskIndexer.ts` | `core/task-indexer.ts` | Flatten structure + kebab-case |

### Phase 8: Worker Migration to Dataflow
Move worker utilities to existing `src/dataflow/workers/`:

| Original File | New Location | Rename Reason |
|--------------|--------------|---------------|
| `workers/TaskIndexWorkerMessage.ts` | `dataflow/workers/task-index-message.ts` | Simpler name + kebab-case |
| `workers/deferred.ts` | `dataflow/workers/deferred-promise.ts` | Descriptive name + kebab-case |

### Phase 9: Utility Reorganization
Reorganize remaining utilities into categorized subdirectories:

| Original File | New Location | Rename Reason |
|--------------|--------------|---------------|
| `DateHelper.ts` | `utils/date/date-helper.ts` | Kebab-case consistency |
| `dateUtil.ts` | `utils/date/date-formatter.ts` | Descriptive name + kebab-case |
| `fileTypeUtils.ts` | `utils/file/file-type-detector.ts` | Descriptive name + kebab-case |
| `fileUtils.ts` | `utils/file/file-operations.ts` | Descriptive name + kebab-case |
| `priorityUtils.ts` | `utils/task/priority-utils.ts` | Kebab-case consistency |
| `taskUtil.ts` | `utils/task/task-operations.ts` | Descriptive name + kebab-case |
| `TaskFilterUtils.ts` | `utils/task/task-filter-utils.ts` | Kebab-case consistency |
| `filterUtils.ts` | `utils/task/filter-compatibility.ts` | Descriptive name + kebab-case |
| `taskMigrationUtils.ts` | `utils/task/task-migration.ts` | Simpler name + kebab-case |
| `treeViewUtil.ts` | `utils/ui/tree-view-utils.ts` | Kebab-case consistency |
| `viewModeUtils.ts` | `utils/ui/view-mode-utils.ts` | Kebab-case consistency |
| `common.ts` | `utils/id-generator.ts` | Descriptive name + kebab-case |

### Phase 10: Import Path Updates
After all files are moved, update all import statements throughout the codebase:

1. Use automated refactoring tools where possible
2. Run TypeScript compiler to identify broken imports
3. Update test file imports
4. Update barrel exports (index.ts files)
5. Verify no circular dependencies were introduced

### Phase 11: Cleanup
1. Remove empty directories
2. Delete or update `src/utils/README.md`
3. Update any documentation that references old file paths
4. Run full test suite to ensure nothing broke

## Validation Checklist

- [ ] All directories created successfully
- [ ] All files moved to new locations
- [ ] All files renamed to kebab-case
- [ ] All import paths updated
- [ ] TypeScript compilation succeeds
- [ ] All tests pass
- [ ] No circular dependencies introduced
- [ ] Documentation updated
- [ ] Commit with detailed message explaining the refactoring

## Commit Message Template

```
refactor: reorganize directory structure for better maintainability

BREAKING CHANGE: Major directory restructuring - all import paths updated

Motivation:
- Mixed responsibilities in utils/ directory causing confusion
- Inconsistent naming conventions across files
- Poor organization making code discovery difficult
- Need for clearer separation of concerns

Changes by category:

Managers (utils/ → managers/):
- Renamed to kebab-case for consistency
- FileTaskManager → file-task-manager
- TaskGeniusIconManager → icon-manager (simplified)
- OnCompletionManager → completion-manager (clarified)

Services (utils/ → services/):
- Separated service classes from utilities
- TaskTimerExporter → timer-export-service (clarified purpose)
- TaskTimerFormatter → timer-format-service (clarified purpose)

Executors (utils/onCompletion/ → executors/completion/):
- Grouped action executors together
- Simplified names (e.g., BaseActionExecutor → base-executor)

Parsers (various → parsers/):
- Consolidated general-purpose parsers
- Kept dataflow-specific parsers in dataflow/parsers/

Core Logic (utils/ → core/):
- Moved business logic out of utils
- Created goal/ subdirectory for goal-related features

Cache (utils/ → cache/):
- Separated caching utilities
- persister → local-storage-cache (descriptive rename)

Pure Utilities (reorganized in utils/):
- Created subdirectories: date/, file/, task/, ui/
- Renamed for clarity and consistency
- common.ts → id-generator.ts (specific purpose)

Worker Integration:
- Moved worker utilities to dataflow/workers/
- Maintains consistency with dataflow architecture

Benefits:
- Clear separation of concerns
- Easier code discovery
- Consistent naming conventions
- Better maintainability
- Reduced cognitive load for developers
```

## Notes

1. **Naming Convention**: All files use kebab-case for consistency
2. **Dataflow Preservation**: The existing dataflow architecture is preserved
3. **MCP Preservation**: The MCP server structure remains unchanged
4. **Gradual Migration**: Can be implemented in phases to minimize disruption
5. **Future Consideration**: TaskManager.ts should be split into smaller, focused modules

## Risk Mitigation

1. **Create a branch**: `refactor/directory-structure`
2. **Implement in small commits**: One phase per commit for easy rollback
3. **Run tests after each phase**: Ensure nothing breaks
4. **Use automated tools**: VSCode's "Move file" and "Rename Symbol" features
5. **Review imports carefully**: Some imports might need manual adjustment
6. **Document changes**: Update README and other docs as needed

## Future Improvements

After this refactoring:
1. Consider splitting `TaskManager.ts` into smaller modules
2. Create barrel exports (index.ts) for each major directory
3. Add JSDoc comments to clarify module purposes
4. Consider dependency injection for better testability
5. Evaluate if any managers should become services or vice versa