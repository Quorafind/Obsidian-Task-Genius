---
projectName: myproject-2
tags:
  - important
  - new
---

# Test Project Tree View

This file is used to test the fix for duplicate task display in Project view tree mode.

## Test Case 1: Basic Parent-Child Tasks

- [ ] 测试🔽 📅 2025-06-17
    - [ ] 子任务1
    - [ ] 子任务2
    - [ ] 子任务3
    - [ ] 子任务4

## Test Case 2: Multiple Parent Tasks

- [ ] 父任务A 🔽
    - [ ] A的子任务1
    - [ ] A的子任务2

- [ ] 父任务B 🔽
    - [ ] B的子任务1
    - [ ] B的子任务2

## Test Case 3: Nested Tasks (Grandchildren)

- [ ] 顶级任务 🔽
    - [ ] 二级任务1
        - [ ] 三级任务1
        - [ ] 三级任务2
    - [ ] 二级任务2
        - [ ] 三级任务3

## Test Case 4: Mixed Independent and Hierarchical Tasks

- [ ] 独立任务1
- [ ] 独立任务2

- [ ] 有子任务的父任务 🔽
    - [ ] 子任务A
    - [ ] 子任务B

- [ ] 另一个独立任务

## Expected Behavior

In Project view tree mode, each task should appear only once:
- Parent tasks should be displayed as expandable items
- Child tasks should only appear under their parent tasks
- No task should be duplicated as both a child and an independent item

## Test Instructions

1. Open Task Genius plugin
2. Navigate to Project view
3. Select "myproject-2" project
4. Switch to tree view mode
5. Verify that:
   - "测试🔽" appears only once as a parent task
   - "子任务1-4" appear only as children of "测试🔽"
   - No child tasks appear as independent root tasks
   - All parent-child relationships are preserved
