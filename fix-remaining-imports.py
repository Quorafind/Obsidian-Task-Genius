#!/usr/bin/env python3

import os
import re

# Define all the remaining import fixes
REMAINING_FIXES = {
    # Test files
    'src/__tests__/TaskParsingService.integration.test.ts': [
        (r'from\s+["\']../utils/workers/ConfigurableTaskParser["\']', 'from "../parsers/configurable-task-parser"'),
    ],
    
    # Cache files
    'src/cache/project-data-cache.ts': [
        (r'from\s+["\']./ProjectConfigManager["\']', 'from "../managers/project-config-manager"'),
    ],
    
    # Core files
    'src/core/project-tree-builder.ts': [
        (r'from\s+["\']./taskUtil["\']', 'from "../utils/task/task-operations"'),
    ],
    'src/core/task-indexer.ts': [
        (r'from\s+["\']../../types/task["\']', 'from "../types/task"'),
        (r'from\s+["\']../fileTypeUtils["\']', 'from "../utils/file/file-type-detector"'),
        (r'from\s+["\']../FileFilterManager["\']', 'from "../managers/file-filter-manager"'),
    ],
    
    # Dataflow workers
    'src/dataflow/workers/task-index-message.ts': [
        (r'from\s+["\']../taskUtil["\']', 'from "../../utils/task/task-operations"'),
    ],
    'src/dataflow/workers/TaskWorkerManager.ts': [
        (r'from\s+["\']../../utils/workers/TaskIndexWorkerMessage["\']', 'from "./task-index-message"'),
    ],
    
    # Executors
    'src/executors/completion/base-executor.ts': [
        (r'from\s+["\']../parsing/CanvasTaskUpdater["\']', 'from "../../parsers/canvas-task-updater"'),
    ],
    
    # Managers
    'src/managers/completion-manager.ts': [
        (r'from\s+["\']../executors/completion/BaseActionExecutor["\']', 'from "../executors/completion/base-executor"'),
        (r'from\s+["\']../executors/completion/DeleteActionExecutor["\']', 'from "../executors/completion/delete-executor"'),
        (r'from\s+["\']../executors/completion/KeepActionExecutor["\']', 'from "../executors/completion/keep-executor"'),
        (r'from\s+["\']../executors/completion/CompleteActionExecutor["\']', 'from "../executors/completion/complete-executor"'),
        (r'from\s+["\']../executors/completion/MoveActionExecutor["\']', 'from "../executors/completion/move-executor"'),
        (r'from\s+["\']../executors/completion/ArchiveActionExecutor["\']', 'from "../executors/completion/archive-executor"'),
        (r'from\s+["\']../executors/completion/DuplicateActionExecutor["\']', 'from "../executors/completion/duplicate-executor"'),
    ],
    'src/managers/ics-manager.ts': [
        (r'from\s+["\']../../types/ics["\']', 'from "../types/ics"'),
        (r'from\s+["\']../../types/task["\']', 'from "../types/task"'),
        (r'from\s+["\']./StatusMapper["\']', 'from "../parsers/ics-status-mapper"'),
        (r'from\s+["\']../../common/setting-definition["\']', 'from "../common/setting-definition"'),
    ],
    'src/managers/reward-manager.ts': [
        (r'from\s+["\']./filterUtils["\']', 'from "../utils/task/filter-compatibility"'),
    ],
    'src/managers/task-manager.ts': [
        (r'from\s+["\']./taskUtil["\']', 'from "../utils/task/task-operations"'),
        (r'from\s+["\']./TaskParsingService["\']', 'from "../services/task-parsing-service"'),
        (r'from\s+["\']./fileTypeUtils["\']', 'from "../utils/file/file-type-detector"'),
        (r'from\s+["\']./workers/TaskIndexWorkerMessage["\']', 'from "../dataflow/workers/task-index-message"'),
    ],
    
    # Parsers
    'src/parsers/canvas-parser.ts': [
        (r'from\s+["\']../../dataflow/core/CanvasParser["\']', 'from "../dataflow/core/CanvasParser"'),
    ],
    'src/parsers/canvas-task-updater.ts': [
        (r'from\s+["\']../../types/task["\']', 'from "../types/task"'),
        (r'from\s+["\']../../types/canvas["\']', 'from "../types/canvas"'),
        (r'from\s+["\']../../index["\']', 'from "../index"'),
        (r'from\s+["\']../taskUtil["\']', 'from "../utils/task/task-operations"'),
    ],
    
    # Services
    'src/services/task-parsing-service.ts': [
        (r'from\s+["\']./workers/FileMetadataTaskParser["\']', 'from "../parsers/file-metadata-parser"'),
    ],
    
    # Parsers internal imports
    'src/parsers/file-metadata-parser.ts': [
        (r'from\s+["\']../../utils/taskUtil["\']', 'from "../utils/task/task-operations"'),
    ],
    'src/parsers/configurable-task-parser.ts': [
        (r'from\s+["\']../../utils/taskUtil["\']', 'from "../utils/task/task-operations"'),
        (r'from\s+["\']../../utils/dateUtil["\']', 'from "../utils/date/date-formatter"'),
    ],
    'src/parsers/context-detector.ts': [
        (r'from\s+["\']../../utils/taskUtil["\']', 'from "../utils/task/task-operations"'),
    ],
}

def fix_imports_in_file(file_path, fixes):
    """Apply specific import fixes to a file."""
    if not os.path.exists(file_path):
        print(f"Warning: File not found: {file_path}")
        return False
        
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
    """Main function to fix remaining imports."""
    updated_files = []
    
    for file_path, fixes in REMAINING_FIXES.items():
        if fix_imports_in_file(file_path, fixes):
            updated_files.append(file_path)
            print(f"Fixed imports in: {file_path}")
    
    print(f"\nTotal files with imports fixed: {len(updated_files)}")

if __name__ == '__main__':
    main()