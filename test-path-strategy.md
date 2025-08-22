# Test Path Strategy

This is a simple test to verify that the Path strategy implementation is working correctly.

## Implementation Summary

### 1. FileSource.ts Updates
- ✅ Added `PathRecognitionConfig` import
- ✅ Implemented `matchesPathStrategy` method with support for:
  - **prefix** mode: Simple prefix matching (e.g., `Projects/` matches `Projects/App.md`)
  - **regex** mode: Regular expression matching
  - **glob** mode: Glob pattern matching (supports `*`, `**`, `?`)
- ✅ Added `matchGlobPattern` helper method for glob pattern conversion
- ✅ Updated strategy evaluation to include path strategy

### 2. FileSourceSettings.ts Updates
- ✅ Replaced placeholder with full Path strategy configuration UI
- ✅ Added TextArea for entering task paths (one per line)
- ✅ Added Dropdown for selecting matching mode
- ✅ Added dynamic examples based on selected mode
- ✅ Kept Template strategy placeholder for future implementation

## Features

### Path Matching Modes

1. **Prefix Mode**
   - Simplest mode for basic directory matching
   - Example: `Projects/` matches all files under Projects folder

2. **Glob Mode**
   - Supports standard glob patterns
   - `*` matches any characters except `/`
   - `**` matches any characters including `/`
   - `?` matches single character
   - Examples:
     - `Projects/**/*.md` - all .md files in Projects and subfolders
     - `Tasks/*.task.md` - files ending with .task.md in Tasks folder

3. **Regex Mode**
   - Full regular expression support for advanced users
   - Example: `^Tasks/\d{4}-\d{2}-\d{2}` - files starting with date in Tasks

## Configuration

Users can now:
1. Enable Path-based Recognition in Settings > Index > File as Task
2. Enter multiple task paths (one per line)
3. Choose matching mode (prefix, glob, or regex)
4. See context-sensitive examples for the selected mode

## Build Status

✅ Build completed successfully
✅ TypeScript compilation passed (with expected Jest type conflicts)
✅ All functionality integrated into existing codebase