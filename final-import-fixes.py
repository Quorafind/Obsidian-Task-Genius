#!/usr/bin/env python3

import os
import re

# Define all the final import fixes
FINAL_FIXES = {
    # Test files
    'src/__tests__/TaskParsingService.integration.test.ts': [
        (r'from\s+["\']../utils/workers/ConfigurableTaskParser["\']', 'from "../parsers/configurable-task-parser"'),
    ],
    
    # TaskWorkerManager
    'src/dataflow/workers/TaskWorkerManager.ts': [
        (r'from\s+["\']../../utils/workers/TaskIndexWorkerMessage["\']', 'from "./task-index-message"'),
    ],
    
    # Task Manager fixes
    'src/managers/task-manager.ts': [
        (r'from\s+["\']./workers/TaskIndexWorkerMessage["\']', 'from "../dataflow/workers/task-index-message"'),
    ],
    
    # Parser files
    'src/parsers/configurable-task-parser.ts': [
        (r'from\s+["\']../../dataflow/core/ConfigurableTaskParser["\']', 'from "../dataflow/core/ConfigurableTaskParser"'),
    ],
    'src/parsers/file-metadata-parser.ts': [
        (r'from\s+["\']../../types/task["\']', 'from "../types/task"'),
        (r'from\s+["\']../../common/setting-definition["\']', 'from "../common/setting-definition"'),
    ],
    'src/parsers/file-metadata-updater.ts': [
        (r'from\s+["\']../../types/task["\']', 'from "../types/task"'),
        (r'from\s+["\']../../common/setting-definition["\']', 'from "../common/setting-definition"'),
    ],
    'src/parsers/holiday-detector.ts': [
        (r'from\s+["\']../../types/ics["\']', 'from "../types/ics"'),
    ],
    'src/parsers/ics-parser.ts': [
        (r'from\s+["\']../../types/ics["\']', 'from "../types/ics"'),
    ],
    'src/parsers/ics-status-mapper.ts': [
        (r'from\s+["\']../../types/ics["\']', 'from "../types/ics"'),
        (r'from\s+["\']../../common/setting-definition["\']', 'from "../common/setting-definition"'),
    ],
    
    # Service files
    'src/services/task-parsing-service.ts': [
        (r'from\s+["\']./workers/TaskIndexWorkerMessage["\']', 'from "../dataflow/workers/task-index-message"'),
    ],
    'src/services/timer-export-service.ts': [
        (r'from\s+["\']./TaskTimerManager["\']', 'from "../managers/timer-manager"'),
        (r'from\s+["\']./TaskTimerFormatter["\']', 'from "./timer-format-service"'),
    ],
    
    # Utils files
    'src/utils/file/file-operations.ts': [
        (r'from\s+["\']../editor-ext/quickCapture["\']', 'from "../../editor-ext/quickCapture"'),
    ],
    'src/utils/file/file-type-detector.ts': [
        (r'from\s+["\']./FileFilterManager["\']', 'from "../../managers/file-filter-manager"'),
    ],
    'src/utils/task/task-filter-utils.ts': [
        (r'from\s+["\']../types/task["\']', 'from "../../types/task"'),
        (r'from\s+["\']../common/setting-definition["\']', 'from "../../common/setting-definition"'),
        (r'from\s+["\']../index["\']', 'from "../../index"'),
        (r'from\s+["\']../commands/sortTaskCommands["\"]', 'from "../../commands/sortTaskCommands"'),
        (r'from\s+["\']../components/task-filter/ViewTaskFilter["\']', 'from "../../components/task-filter/ViewTaskFilter"'),
        (r'from\s+["\']./taskUtil["\']', 'from "./task-operations"'),
    ],
    'src/utils/task/task-migration.ts': [
        (r'from\s+["\']../types/task["\']', 'from "../../types/task"'),
    ],
    'src/utils/task/task-operations.ts': [
        (r'from\s+["\']../common/default-symbol["\']', 'from "../../common/default-symbol"'),
        (r'from\s+["\']./dateUtil["\']', 'from "../date/date-formatter"'),
        (r'from\s+["\']../types/task["\']', 'from "../../types/task"'),
        (r'from\s+["\']../common/regex-define["\']', 'from "../../common/regex-define"'),
        (r'from\s+["\']../dataflow/core/ConfigurableTaskParser["\']', 'from "../../dataflow/core/ConfigurableTaskParser"'),
        (r'from\s+["\']../common/task-parser-config["\']', 'from "../../common/task-parser-config"'),
    ],
    'src/utils/ui/tree-view-utils.ts': [
        (r'from\s+["\']../types/task["\']', 'from "../../types/task"'),
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
    """Main function to apply final import fixes."""
    updated_files = []
    
    for file_path, fixes in FINAL_FIXES.items():
        if fix_imports_in_file(file_path, fixes):
            updated_files.append(file_path)
            print(f"Fixed imports in: {file_path}")
    
    print(f"\nTotal files with imports fixed: {len(updated_files)}")

if __name__ == '__main__':
    main()