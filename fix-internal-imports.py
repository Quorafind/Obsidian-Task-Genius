#!/usr/bin/env python3

import os
import re
from pathlib import Path

# Define specific internal import fixes for moved files
INTERNAL_FIXES = {
    # Fixes for managers/
    'managers/version-manager.ts': [
        (r'from\s+["\']./persister["\']', 'from "../cache/local-storage-cache"'),
    ],
    'managers/task-manager.ts': [
        (r'from\s+["\']./import/TaskIndexer["\']', 'from "../core/task-indexer"'),
        (r'from\s+["\']./persister["\']', 'from "../cache/local-storage-cache"'),
        (r'from\s+["\']./ics/HolidayDetector["\']', 'from "../parsers/holiday-detector"'),
        (r'from\s+["\']./FileFilterManager["\']', 'from "./file-filter-manager"'),
        (r'from\s+["\']./parsing/CanvasTaskUpdater["\']', 'from "../parsers/canvas-task-updater"'),
        (r'from\s+["\']./workers/FileMetadataTaskUpdater["\']', 'from "../parsers/file-metadata-updater"'),
        (r'from\s+["\']./RebuildProgressManager["\']', 'from "./rebuild-progress-manager"'),
        (r'from\s+["\']./OnCompletionManager["\']', 'from "./completion-manager"'),
    ],
    'managers/completion-manager.ts': [
        (r'from\s+["\']./onCompletion/(\w+)["\']', r'from "../executors/completion/\1"'),
    ],
    'managers/file-filter-manager.ts': [
        (r'from\s+["\']./fileTypeUtils["\']', 'from "../utils/file/file-type-detector"'),
    ],
    'managers/ics-manager.ts': [
        (r'from\s+["\']./IcsParser["\']', 'from "../parsers/ics-parser"'),
        (r'from\s+["\']./WebcalUrlConverter["\']', 'from "../parsers/webcal-converter"'),
        (r'from\s+["\']./HolidayDetector["\']', 'from "../parsers/holiday-detector"'),
    ],
    # Fixes for services/
    'services/task-parsing-service.ts': [
        (r'from\s+["\']./ProjectConfigManager["\']', 'from "../managers/project-config-manager"'),
        (r'from\s+["\']./workers/ConfigurableTaskParser["\']', 'from "../parsers/configurable-task-parser"'),
        (r'from\s+["\']./workers/FileMetadataTaskParser["\']', 'from "../parsers/file-metadata-parser"'),
    ],
    'services/timer-metadata-service.ts': [
        (r'from\s+["\']./TaskTimerFormatter["\']', 'from "./timer-format-service"'),
    ],
    # Fixes for executors/completion/
    'executors/completion/archive-executor.ts': [
        (r'from\s+["\']./BaseActionExecutor["\']', 'from "./base-executor"'),
        (r'from\s+["\']./CanvasTaskOperationUtils["\']', 'from "./canvas-operation-utils"'),
        (r'from\s+["\']\.\./fileUtils["\']', 'from "../../utils/file/file-operations"'),
    ],
    'executors/completion/complete-executor.ts': [
        (r'from\s+["\']./BaseActionExecutor["\']', 'from "./base-executor"'),
        (r'from\s+["\']./CanvasTaskOperationUtils["\']', 'from "./canvas-operation-utils"'),
    ],
    'executors/completion/delete-executor.ts': [
        (r'from\s+["\']./BaseActionExecutor["\']', 'from "./base-executor"'),
        (r'from\s+["\']./CanvasTaskOperationUtils["\']', 'from "./canvas-operation-utils"'),
    ],
    'executors/completion/duplicate-executor.ts': [
        (r'from\s+["\']./BaseActionExecutor["\']', 'from "./base-executor"'),
        (r'from\s+["\']./CanvasTaskOperationUtils["\']', 'from "./canvas-operation-utils"'),
    ],
    'executors/completion/keep-executor.ts': [
        (r'from\s+["\']./BaseActionExecutor["\']', 'from "./base-executor"'),
    ],
    'executors/completion/move-executor.ts': [
        (r'from\s+["\']./BaseActionExecutor["\']', 'from "./base-executor"'),
        (r'from\s+["\']./CanvasTaskOperationUtils["\']', 'from "./canvas-operation-utils"'),
        (r'from\s+["\']\.\./fileUtils["\']', 'from "../../utils/file/file-operations"'),
    ],
    'executors/completion/canvas-operation-utils.ts': [
        (r'from\s+["\']\.\./parsing/CanvasParser["\']', 'from "../../parsers/canvas-parser"'),
        (r'from\s+["\']\.\./parsing/CanvasTaskUpdater["\']', 'from "../../parsers/canvas-task-updater"'),
    ],
    # Fixes for parsers/
    'parsers/canvas-task-updater.ts': [
        (r'from\s+["\']./CanvasParser["\']', 'from "./canvas-parser"'),
    ],
    'parsers/file-metadata-updater.ts': [
        (r'from\s+["\']./FileMetadataTaskParser["\']', 'from "./file-metadata-parser"'),
        (r'from\s+["\']./ConfigurableTaskParser["\']', 'from "./configurable-task-parser"'),
    ],
    'parsers/file-metadata-parser.ts': [
        (r'from\s+["\']./ConfigurableTaskParser["\']', 'from "./configurable-task-parser"'),
    ],
    'parsers/ics-parser.ts': [
        (r'from\s+["\']./StatusMapper["\']', 'from "./ics-status-mapper"'),
    ],
    'parsers/holiday-detector.ts': [
        (r'from\s+["\']./IcsParser["\']', 'from "./ics-parser"'),
    ],
    # Fixes for cache/
    'cache/project-data-cache.ts': [
        (r'from\s+["\']./persister["\']', 'from "./local-storage-cache"'),
    ],
    # Fixes for core/
    'core/project-filter.ts': [
        (r'from\s+["\']\.\./utils/ProjectConfigManager["\']', 'from "../managers/project-config-manager"'),
    ],
    'core/project-tree-builder.ts': [
        (r'from\s+["\']\.\./utils/treeViewUtil["\']', 'from "../utils/ui/tree-view-utils"'),
    ],
    'core/task-indexer.ts': [
        (r'from\s+["\']\.\./utils/TaskManager["\']', 'from "../managers/task-manager"'),
    ],
    'core/goal/edit-mode.ts': [
        (r'from\s+["\']./regexGoal["\']', 'from "./regex-goal"'),
    ],
    'core/goal/read-mode.ts': [
        (r'from\s+["\']./regexGoal["\']', 'from "./regex-goal"'),
    ],
}

def fix_imports_in_file(file_path, fixes):
    """Apply specific import fixes to a file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    for pattern, replacement in fixes:
        content = re.sub(pattern, replacement, content)
    
    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def main():
    """Main function to fix internal imports in moved files."""
    src_dir = 'src'
    updated_files = []
    
    for relative_path, fixes in INTERNAL_FIXES.items():
        file_path = os.path.join(src_dir, relative_path)
        if os.path.exists(file_path):
            if fix_imports_in_file(file_path, fixes):
                updated_files.append(file_path)
                print(f"Fixed internal imports in: {file_path}")
        else:
            print(f"Warning: File not found: {file_path}")
    
    print(f"\nTotal files with internal imports fixed: {len(updated_files)}")

if __name__ == '__main__':
    main()