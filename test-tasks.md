# Test Tasks for Advanced Filtering

## Basic Tasks

- [ ] A simple task
- [x] A completed task
- [>] An in-progress task
- [-] An abandoned task
- [?] A planned task

## Tasks with Tags

- [ ] Task with #tag1
- [ ] Task with #tag2 and #tag3
- [x] Completed task with #tag1 and #tag2
- [ ] Task with #important #work

## Tasks with Priorities

- [ ] [#A] High priority task
- [ ] [#B] Medium priority task 
- [ ] [#C] Low priority task
- [x] [#A] Completed high priority task
- [ ] 🔺 Highest priority task (priorityPicker.ts标准)
- [ ] ⏫ High priority task (priorityPicker.ts标准)
- [ ] 🔼 Medium priority task (priorityPicker.ts标准)
- [ ] 🔽 Low priority task (priorityPicker.ts标准)
- [ ] ⏬️ Lowest priority task (priorityPicker.ts标准)
- [ ] 🔴 High priority task (颜色优先级)
- [ ] 🟠 Medium priority task (颜色优先级)
- [ ] 🟡 Medium-low priority task (颜色优先级)
- [ ] 🟢 Low priority task (颜色优先级)
- [ ] 🔵 Low-lowest priority task (颜色优先级)
- [ ] ⚪️ Lowest priority task (颜色优先级)
- [ ] ⚫️ Below lowest priority task (颜色优先级)

## Tasks with Dates

- [ ] Task due on 2023-05-15
- [ ] Task due on 2023-08-22
- [x] Completed task from 2022-01-10
- [ ] Task planned for 2024-01-01
- [ ] Meeting on 2023-07-15 with John #meeting

## Complex Tasks

- [ ] [#A] Important task with #project1 due on 2023-06-30
- [x] [#B] Completed task with #project1 and #project2 from 2023-04-15
- [>] ⏫ In-progress high priority task with #urgent due tomorrow 2023-05-10
- [ ] 🔽 Low priority task with #waiting #followup for 2023-09-01
- [-] 🔼 Abandoned medium priority task from 2023-02-28 #cancelled

## Nested Tasks

- [ ] Parent task 1
    - [ ] Child task 1.1
    - [x] Child task 1.2
    - [ ] Child task 1.3
        - [ ] Grandchild task 1.3.1
        - [>] Grandchild task 1.3.2 #inprogress
- [ ] Parent task 2 [#A] with #important tag
    - [ ] Child task 2.1 due on 2023-07-20
    - [x] Child task 2.2 completed on 2023-06-15
- [ ] Parent task 3
    - [-] Abandoned child task 3.1
    - [?] Planned child task 3.2 for 2023-10-01 

## Advanced Filter Examples

Here are some example filters you can try:

1. Find all highest priority tasks: `PRIORITY:🔺`
2. Find all high priority tasks: `PRIORITY:#A` or `PRIORITY:⏫` or `PRIORITY:🔴`
3. Find all tasks with medium priority or higher: `PRIORITY:<=#B` or `PRIORITY:<=🔼`
4. Find all tasks not with low priority: `PRIORITY:!=🔽` or `PRIORITY:!=🟢`
5. Find tasks due before August 2023: `DATE:<2023-08-01`
6. Find tasks due on or after January 1, 2024: `DATE:>=2024-01-01`
7. Find high priority tasks about projects: `(PRIORITY:⏫ OR PRIORITY:🔴) AND project`
8. Find tasks with tag1 that aren't completed: `#tag1 AND NOT [x]`
9. Find all high priority tasks that contain "important" or have the #urgent tag: `(PRIORITY:#A OR PRIORITY:⏫ OR PRIORITY:🔴) AND (important OR #urgent)`
10. Complex filter: `(#project1 OR #project2) AND (PRIORITY:<=🔼 OR PRIORITY:<=#B) AND DATE:>=2023-01-01 AND NOT (abandoned OR cancelled)`
