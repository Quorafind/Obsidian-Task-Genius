#!/bin/bash

# Script to update all import paths after directory refactoring

echo "Updating import paths after directory refactoring..."

# Managers (from utils/ to managers/)
find src -name "*.ts" -type f -exec sed -i '' \
  -e "s|from ['\"].*utils/FileTaskManager['\"]|from '../managers/file-task-manager'|g" \
  -e "s|from ['\"].*utils/HabitManager['\"]|from '../managers/habit-manager'|g" \
  -e "s|from ['\"].*utils/TaskManager['\"]|from '../managers/task-manager'|g" \
  -e "s|from ['\"].*utils/OnCompletionManager['\"]|from '../managers/completion-manager'|g" \
  -e "s|from ['\"].*utils/OnboardingConfigManager['\"]|from '../managers/onboarding-manager'|g" \
  -e "s|from ['\"].*utils/ProjectConfigManager['\"]|from '../managers/project-config-manager'|g" \
  -e "s|from ['\"].*utils/RebuildProgressManager['\"]|from '../managers/rebuild-progress-manager'|g" \
  -e "s|from ['\"].*utils/RewardManager['\"]|from '../managers/reward-manager'|g" \
  -e "s|from ['\"].*utils/TaskGeniusIconManager['\"]|from '../managers/icon-manager'|g" \
  -e "s|from ['\"].*utils/TaskTimerManager['\"]|from '../managers/timer-manager'|g" \
  -e "s|from ['\"].*utils/VersionManager['\"]|from '../managers/version-manager'|g" \
  -e "s|from ['\"].*utils/FileFilterManager['\"]|from '../managers/file-filter-manager'|g" \
  -e "s|from ['\"].*utils/ics/IcsManager['\"]|from '../managers/ics-manager'|g" \
  {} \;

# Services (from utils/ to services/)
find src -name "*.ts" -type f -exec sed -i '' \
  -e "s|from ['\"].*utils/TaskParsingService['\"]|from '../services/task-parsing-service'|g" \
  -e "s|from ['\"].*utils/TimeParsingService['\"]|from '../services/time-parsing-service'|g" \
  -e "s|from ['\"].*utils/SettingsChangeDetector['\"]|from '../services/settings-change-detector'|g" \
  -e "s|from ['\"].*utils/TaskTimerExporter['\"]|from '../services/timer-export-service'|g" \
  -e "s|from ['\"].*utils/TaskTimerFormatter['\"]|from '../services/timer-format-service'|g" \
  -e "s|from ['\"].*utils/TaskTimerMetadataDetector['\"]|from '../services/timer-metadata-service'|g" \
  {} \;

# Executors (from utils/onCompletion/ to executors/completion/)
find src -name "*.ts" -type f -exec sed -i '' \
  -e "s|from ['\"].*utils/onCompletion/BaseActionExecutor['\"]|from '../executors/completion/base-executor'|g" \
  -e "s|from ['\"].*utils/onCompletion/ArchiveActionExecutor['\"]|from '../executors/completion/archive-executor'|g" \
  -e "s|from ['\"].*utils/onCompletion/CompleteActionExecutor['\"]|from '../executors/completion/complete-executor'|g" \
  -e "s|from ['\"].*utils/onCompletion/DeleteActionExecutor['\"]|from '../executors/completion/delete-executor'|g" \
  -e "s|from ['\"].*utils/onCompletion/DuplicateActionExecutor['\"]|from '../executors/completion/duplicate-executor'|g" \
  -e "s|from ['\"].*utils/onCompletion/KeepActionExecutor['\"]|from '../executors/completion/keep-executor'|g" \
  -e "s|from ['\"].*utils/onCompletion/MoveActionExecutor['\"]|from '../executors/completion/move-executor'|g" \
  -e "s|from ['\"].*utils/onCompletion/CanvasTaskOperationUtils['\"]|from '../executors/completion/canvas-operation-utils'|g" \
  {} \;

# Parsers (from various locations to parsers/)
find src -name "*.ts" -type f -exec sed -i '' \
  -e "s|from ['\"].*utils/parsing/CanvasParser['\"]|from '../parsers/canvas-parser'|g" \
  -e "s|from ['\"].*utils/parsing/CanvasTaskUpdater['\"]|from '../parsers/canvas-task-updater'|g" \
  -e "s|from ['\"].*utils/workers/ConfigurableTaskParser['\"]|from '../parsers/configurable-task-parser'|g" \
  -e "s|from ['\"].*utils/workers/ContextDetector['\"]|from '../parsers/context-detector'|g" \
  -e "s|from ['\"].*utils/workers/FileMetadataTaskParser['\"]|from '../parsers/file-metadata-parser'|g" \
  -e "s|from ['\"].*utils/workers/FileMetadataTaskUpdater['\"]|from '../parsers/file-metadata-updater'|g" \
  -e "s|from ['\"].*utils/ics/HolidayDetector['\"]|from '../parsers/holiday-detector'|g" \
  -e "s|from ['\"].*utils/ics/IcsParser['\"]|from '../parsers/ics-parser'|g" \
  -e "s|from ['\"].*utils/ics/StatusMapper['\"]|from '../parsers/ics-status-mapper'|g" \
  -e "s|from ['\"].*utils/ics/WebcalUrlConverter['\"]|from '../parsers/webcal-converter'|g" \
  {} \;

# Cache (from utils/ to cache/)
find src -name "*.ts" -type f -exec sed -i '' \
  -e "s|from ['\"].*utils/persister['\"]|from '../cache/local-storage-cache'|g" \
  -e "s|from ['\"].*utils/ProjectDataCache['\"]|from '../cache/project-data-cache'|g" \
  {} \;

# Core (from utils/ to core/)
find src -name "*.ts" -type f -exec sed -i '' \
  -e "s|from ['\"].*utils/projectFilter['\"]|from '../core/project-filter'|g" \
  -e "s|from ['\"].*utils/projectTreeBuilder['\"]|from '../core/project-tree-builder'|g" \
  -e "s|from ['\"].*utils/workflowConversion['\"]|from '../core/workflow-converter'|g" \
  -e "s|from ['\"].*utils/import/TaskIndexer['\"]|from '../core/task-indexer'|g" \
  -e "s|from ['\"].*utils/goal/editMode['\"]|from '../core/goal/edit-mode'|g" \
  -e "s|from ['\"].*utils/goal/readMode['\"]|from '../core/goal/read-mode'|g" \
  -e "s|from ['\"].*utils/goal/regexGoal['\"]|from '../core/goal/regex-goal'|g" \
  {} \;

# Dataflow workers (from utils/workers/ to dataflow/workers/)
find src -name "*.ts" -type f -exec sed -i '' \
  -e "s|from ['\"].*utils/workers/TaskIndexWorkerMessage['\"]|from '../dataflow/workers/task-index-message'|g" \
  -e "s|from ['\"].*utils/workers/deferred['\"]|from '../dataflow/workers/deferred-promise'|g" \
  -e "s|from ['\"].*utils/types/worker['\"]|from '../dataflow/workers/worker'|g" \
  {} \;

# Utils reorganization
find src -name "*.ts" -type f -exec sed -i '' \
  -e "s|from ['\"].*utils/DateHelper['\"]|from '../utils/date/date-helper'|g" \
  -e "s|from ['\"].*utils/dateUtil['\"]|from '../utils/date/date-formatter'|g" \
  -e "s|from ['\"].*utils/fileTypeUtils['\"]|from '../utils/file/file-type-detector'|g" \
  -e "s|from ['\"].*utils/fileUtils['\"]|from '../utils/file/file-operations'|g" \
  -e "s|from ['\"].*utils/priorityUtils['\"]|from '../utils/task/priority-utils'|g" \
  -e "s|from ['\"].*utils/taskUtil['\"]|from '../utils/task/task-operations'|g" \
  -e "s|from ['\"].*utils/TaskFilterUtils['\"]|from '../utils/task/task-filter-utils'|g" \
  -e "s|from ['\"].*utils/filterUtils['\"]|from '../utils/task/filter-compatibility'|g" \
  -e "s|from ['\"].*utils/taskMigrationUtils['\"]|from '../utils/task/task-migration'|g" \
  -e "s|from ['\"].*utils/treeViewUtil['\"]|from '../utils/ui/tree-view-utils'|g" \
  -e "s|from ['\"].*utils/viewModeUtils['\"]|from '../utils/ui/view-mode-utils'|g" \
  -e "s|from ['\"].*utils/common['\"]|from '../utils/id-generator'|g" \
  {} \;

echo "Import path updates completed!"