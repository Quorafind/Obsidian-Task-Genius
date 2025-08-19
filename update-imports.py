#!/usr/bin/env python3

import os
import re
from pathlib import Path

# Define the mappings from old paths to new paths
IMPORT_MAPPINGS = {
    # Managers
    'utils/FileTaskManager': 'managers/file-task-manager',
    'utils/HabitManager': 'managers/habit-manager',
    'utils/TaskManager': 'managers/task-manager',
    'utils/OnCompletionManager': 'managers/completion-manager',
    'utils/OnboardingConfigManager': 'managers/onboarding-manager',
    'utils/ProjectConfigManager': 'managers/project-config-manager',
    'utils/RebuildProgressManager': 'managers/rebuild-progress-manager',
    'utils/RewardManager': 'managers/reward-manager',
    'utils/TaskGeniusIconManager': 'managers/icon-manager',
    'utils/TaskTimerManager': 'managers/timer-manager',
    'utils/VersionManager': 'managers/version-manager',
    'utils/FileFilterManager': 'managers/file-filter-manager',
    'utils/ics/IcsManager': 'managers/ics-manager',
    
    # Services
    'utils/TaskParsingService': 'services/task-parsing-service',
    'utils/TimeParsingService': 'services/time-parsing-service',
    'utils/SettingsChangeDetector': 'services/settings-change-detector',
    'utils/TaskTimerExporter': 'services/timer-export-service',
    'utils/TaskTimerFormatter': 'services/timer-format-service',
    'utils/TaskTimerMetadataDetector': 'services/timer-metadata-service',
    
    # Executors
    'utils/onCompletion/BaseActionExecutor': 'executors/completion/base-executor',
    'utils/onCompletion/ArchiveActionExecutor': 'executors/completion/archive-executor',
    'utils/onCompletion/CompleteActionExecutor': 'executors/completion/complete-executor',
    'utils/onCompletion/DeleteActionExecutor': 'executors/completion/delete-executor',
    'utils/onCompletion/DuplicateActionExecutor': 'executors/completion/duplicate-executor',
    'utils/onCompletion/KeepActionExecutor': 'executors/completion/keep-executor',
    'utils/onCompletion/MoveActionExecutor': 'executors/completion/move-executor',
    'utils/onCompletion/CanvasTaskOperationUtils': 'executors/completion/canvas-operation-utils',
    
    # Parsers
    'utils/parsing/CanvasParser': 'parsers/canvas-parser',
    'utils/parsing/CanvasTaskUpdater': 'parsers/canvas-task-updater',
    'utils/workers/ConfigurableTaskParser': 'parsers/configurable-task-parser',
    'utils/workers/ContextDetector': 'parsers/context-detector',
    'utils/workers/FileMetadataTaskParser': 'parsers/file-metadata-parser',
    'utils/workers/FileMetadataTaskUpdater': 'parsers/file-metadata-updater',
    'utils/ics/HolidayDetector': 'parsers/holiday-detector',
    'utils/ics/IcsParser': 'parsers/ics-parser',
    'utils/ics/StatusMapper': 'parsers/ics-status-mapper',
    'utils/ics/WebcalUrlConverter': 'parsers/webcal-converter',
    
    # Cache
    'utils/persister': 'cache/local-storage-cache',
    'utils/ProjectDataCache': 'cache/project-data-cache',
    
    # Core
    'utils/projectFilter': 'core/project-filter',
    'utils/projectTreeBuilder': 'core/project-tree-builder',
    'utils/workflowConversion': 'core/workflow-converter',
    'utils/import/TaskIndexer': 'core/task-indexer',
    'utils/goal/editMode': 'core/goal/edit-mode',
    'utils/goal/readMode': 'core/goal/read-mode',
    'utils/goal/regexGoal': 'core/goal/regex-goal',
    
    # Dataflow workers
    'utils/workers/TaskIndexWorkerMessage': 'dataflow/workers/task-index-message',
    'utils/workers/deferred': 'dataflow/workers/deferred-promise',
    'utils/types/worker': 'dataflow/workers/worker',
    
    # Utils reorganization
    'utils/DateHelper': 'utils/date/date-helper',
    'utils/dateUtil': 'utils/date/date-formatter',
    'utils/fileTypeUtils': 'utils/file/file-type-detector',
    'utils/fileUtils': 'utils/file/file-operations',
    'utils/priorityUtils': 'utils/task/priority-utils',
    'utils/taskUtil': 'utils/task/task-operations',
    'utils/TaskFilterUtils': 'utils/task/task-filter-utils',
    'utils/filterUtils': 'utils/task/filter-compatibility',
    'utils/taskMigrationUtils': 'utils/task/task-migration',
    'utils/treeViewUtil': 'utils/ui/tree-view-utils',
    'utils/viewModeUtils': 'utils/ui/view-mode-utils',
    'utils/common': 'utils/id-generator',
}

def calculate_relative_path(from_file, to_path):
    """Calculate the relative path from one file to another."""
    from_dir = os.path.dirname(from_file)
    # Convert to Path objects for easier manipulation
    from_path = Path(from_dir)
    to_path = Path('src') / to_path
    
    # Calculate relative path
    try:
        relative = os.path.relpath(to_path, from_path)
        # Ensure we use forward slashes
        relative = relative.replace('\\', '/')
        # Add ./ if it doesn't start with ../
        if not relative.startswith('../'):
            relative = './' + relative
        return relative
    except ValueError:
        # If paths are on different drives (Windows), use absolute path
        return '/' + to_path.as_posix()

def update_imports_in_file(file_path):
    """Update imports in a single TypeScript file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    for old_path, new_path in IMPORT_MAPPINGS.items():
        # Match various import patterns
        patterns = [
            # import { Something } from 'path'
            (r'(import\s+\{[^}]+\}\s+from\s+["\'])([^"\']*/' + re.escape(old_path) + r')(["\'])',
             lambda m: m.group(1) + calculate_relative_path(file_path, new_path) + m.group(3)),
            # import Something from 'path'
            (r'(import\s+\w+\s+from\s+["\'])([^"\']*/' + re.escape(old_path) + r')(["\'])',
             lambda m: m.group(1) + calculate_relative_path(file_path, new_path) + m.group(3)),
            # import * as Something from 'path'
            (r'(import\s+\*\s+as\s+\w+\s+from\s+["\'])([^"\']*/' + re.escape(old_path) + r')(["\'])',
             lambda m: m.group(1) + calculate_relative_path(file_path, new_path) + m.group(3)),
            # import type { Something } from 'path'
            (r'(import\s+type\s+\{[^}]+\}\s+from\s+["\'])([^"\']*/' + re.escape(old_path) + r')(["\'])',
             lambda m: m.group(1) + calculate_relative_path(file_path, new_path) + m.group(3)),
            # const Something = require('path')
            (r'(require\(["\'])([^"\']*/' + re.escape(old_path) + r')(["\'])',
             lambda m: m.group(1) + calculate_relative_path(file_path, new_path) + m.group(3)),
        ]
        
        for pattern, replacement in patterns:
            content = re.sub(pattern, replacement, content)
    
    # Only write if content changed
    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    """Main function to update all TypeScript files."""
    src_dir = 'src'
    updated_files = []
    
    # Find all TypeScript files
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.ts') or file.endswith('.tsx'):
                file_path = os.path.join(root, file)
                if update_imports_in_file(file_path):
                    updated_files.append(file_path)
                    print(f"Updated: {file_path}")
    
    print(f"\nTotal files updated: {len(updated_files)}")

if __name__ == '__main__':
    main()